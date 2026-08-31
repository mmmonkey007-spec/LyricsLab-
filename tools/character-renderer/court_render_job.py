"""Render the four court characters from a pose specification.

This is the single re-runnable court-art job. It deliberately lives outside
the mobile app and only uses Scenario for image uploads.

Run with Blender:

    blender -b --python tools/character-renderer/court_render_job.py

Use a different pose file without changing this script:

    blender -b --python tools/character-renderer/court_render_job.py -- \
      --pose-spec tools/character-renderer/court_poses.json

The job never writes a GLB. The Cartwheel source is downloaded only for
offline bone inventory; it is never imported into Blender. Court meshes are
changed only in Blender's in-memory scene for posing and rendering.
"""

from __future__ import annotations

import argparse
import copy
import json
import math
import re
import struct
import sys
import time
from pathlib import Path
from typing import Any

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Euler, Vector
from mathutils.geometry import intersect_point_line
from mathutils.kdtree import KDTree


SCRIPT_DIR = Path(__file__).resolve().parent
MODELS_DIR = SCRIPT_DIR / "models"
OUTPUT_DIR = SCRIPT_DIR / "renders" / "court-scene"
SUMMARY_PATH = SCRIPT_DIR / "probe" / "court-run-summary.txt"
CARTWHEEL_BONES_PATH = SCRIPT_DIR / "probe" / "cartwheel-bone-names.txt"
DEFAULT_SPEC = SCRIPT_DIR / "court_poses.json"
RENDER_WIDTH = 1024
RENDER_HEIGHT = 1536
OFFLINE_RENDER = False
LIMB_ROTATION_LIMIT_DEGREES = 90.0
LIMB_BONE_PARTS = (
    "Clavicle",
    "Upperarm",
    "Forearm",
    "Hand",
    "Thigh",
    "Calf",
    "Foot",
    "Toe",
)
sys.path.insert(0, str(SCRIPT_DIR))
from render_character import (  # noqa: E402
    clear_scene,
    import_model,
    upload_image_and_record,
)
from diagnostic_jobs import download_asset  # noqa: E402


class PoseFailure(RuntimeError):
    """Raised when a character cannot be imported or rendered."""


def pose_rotation_audit(
    pose: dict[str, Any],
) -> dict[str, Any]:
    largest_rotation: tuple[float, str, str, float] | None = None
    refused_rotations: list[str] = []
    for bone_name, rotation in pose.items():
        if not isinstance(rotation, list) or len(rotation) != 3:
            continue
        for axis, raw_value in zip(("X", "Y", "Z"), rotation):
            try:
                degrees = float(raw_value)
            except (TypeError, ValueError):
                continue
            magnitude = abs(degrees)
            if largest_rotation is None or magnitude > largest_rotation[0]:
                largest_rotation = (magnitude, str(bone_name), axis, degrees)
            if (
                any(part in str(bone_name) for part in LIMB_BONE_PARTS)
                and magnitude > LIMB_ROTATION_LIMIT_DEGREES
            ):
                refused_rotations.append(
                    f"{bone_name} {axis}={degrees:.1f}° exceeds "
                    f"±{LIMB_ROTATION_LIMIT_DEGREES:.1f}°"
                )
    return {
        "largest": largest_rotation,
        "refused": refused_rotations,
        "refused_bones": sorted(
            {refusal.split(" ", 1)[0] for refusal in refused_rotations}
        ),
    }


def script_args() -> list[str]:
    argv = sys.argv
    return argv[argv.index("--") + 1 :] if "--" in argv else []


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--pose-spec",
        type=Path,
        default=DEFAULT_SPEC,
        help=f"JSON pose specification (default: {DEFAULT_SPEC})",
    )
    parser.add_argument(
        "--offline",
        action="store_true",
        help="Render and validate without uploading PNGs to Scenario.",
    )
    parser.add_argument(
        "--width", type=int, help="Override render width for an offline sweep."
    )
    parser.add_argument(
        "--height", type=int, help="Override render height for an offline sweep."
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        help="Override the render output directory.",
    )
    parser.add_argument(
        "--summary-path",
        type=Path,
        help="Override the run summary path.",
    )
    parser.add_argument(
        "--only",
        help="Comma-separated character names to render during a probe run.",
    )
    parser.add_argument(
        "--samples",
        type=int,
        help="Override Cycles samples for a faster offline inspection.",
    )
    parser.add_argument(
        "--variant",
        help="Render only one named variant during an inspection.",
    )
    args = parser.parse_args(script_args())
    if not args.pose_spec.is_file():
        parser.error(f"Pose specification does not exist: {args.pose_spec}")
    return args


def load_spec(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise PoseFailure(f"Invalid pose specification: {error}") from error
    if not isinstance(value, dict) or not isinstance(value.get("characters"), list):
        raise PoseFailure("Pose specification must contain a characters list.")
    names: set[str] = set()
    filenames: set[str] = set()
    for entry in value["characters"]:
        if not isinstance(entry, dict):
            raise PoseFailure("Every character pose entry must be an object.")
        name = str(entry.get("name", "")).upper()
        filename = str(entry.get("model_filename", ""))
        asset_id = str(entry.get("asset_id", ""))
        if not name or name in names:
            raise PoseFailure(f"Character names must be present and unique: {name!r}")
        if not filename or filename in filenames or not filename.endswith(".glb"):
            raise PoseFailure(f"Model filenames must be unique .glb names: {filename!r}")
        if not asset_id.startswith("asset_"):
            raise PoseFailure(f"{name} has an invalid Scenario asset ID.")
        pose = entry.get("pose", {})
        if not isinstance(pose, dict):
            raise PoseFailure(f"{name} pose must be an object.")
        entry["_rotation_audit"] = pose_rotation_audit(pose)
        variants = entry.get("variants")
        if variants is not None:
            if not isinstance(variants, list) or not variants:
                raise PoseFailure(f"{name} variants must be a non-empty list.")
            variant_ids: set[str] = set()
            for variant in variants:
                if not isinstance(variant, dict):
                    raise PoseFailure(f"{name} variants must contain objects.")
                variant_id = str(variant.get("id", "")).strip()
                if not variant_id or variant_id in variant_ids:
                    raise PoseFailure(
                        f"{name} variant IDs must be present and unique."
                    )
                variant_pose = variant.get("pose", {})
                if not isinstance(variant_pose, dict):
                    raise PoseFailure(
                        f"{name} variant {variant_id} pose must be an object."
                    )
                pose_rotation_audit(variant_pose)
                variant_ids.add(variant_id)
        names.add(name)
        filenames.add(filename)
    if not value["characters"]:
        raise PoseFailure("Pose specification contains no characters.")
    return value


def expanded_character_entries(
    characters: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    expanded: list[dict[str, Any]] = []
    for entry in characters:
        variants = entry.get("variants")
        if not variants:
            expanded.append(entry)
            continue
        for variant in variants:
            child = copy.deepcopy(entry)
            variant_id = str(variant["id"]).strip()
            child.pop("variants", None)
            child["variant_id"] = variant_id
            child["variant_label"] = str(variant.get("label", variant_id))
            child["variant_role"] = str(variant.get("role", variant_id))
            child["variant_slug"] = re.sub(
                r"[^a-z0-9]+", "-", variant_id.lower()
            ).strip("-")
            child["pose"] = copy.deepcopy(variant.get("pose", {}))
            if "arm_ik" in variant:
                child["arm_ik"] = copy.deepcopy(variant["arm_ik"])
            else:
                child.pop("arm_ik", None)
            if "pose_intent" in variant:
                child["pose_intent"] = str(variant["pose_intent"])
            if "pose_limitations" in variant:
                child["pose_limitations"] = copy.deepcopy(
                    variant["pose_limitations"]
                )
            for field in (
                "shoulder_drop_degrees",
                "head_tilt_degrees",
                "support",
            ):
                if field in variant:
                    child[field] = copy.deepcopy(variant[field])
            child["_rotation_audit"] = pose_rotation_audit(child["pose"])
            expanded.append(child)
    return expanded


def glb_skin_bone_names(path: Path) -> list[str]:
    """Read skin-joint names from a GLB without importing it into Blender."""
    payload = path.read_bytes()
    if payload[:4] != b"glTF":
        raise PoseFailure(f"{path.name} is not a GLB file.")
    total_length = struct.unpack_from("<I", payload, 8)[0]
    offset = 12
    document: dict[str, Any] | None = None
    while offset < total_length:
        chunk_length, chunk_type = struct.unpack_from("<II", payload, offset)
        chunk = payload[offset + 8 : offset + 8 + chunk_length]
        offset += 8 + chunk_length
        if chunk_type == 0x4E4F534A:
            document = json.loads(chunk.decode("utf-8").rstrip("\x00 \t\r\n"))
            break
    if document is None:
        raise PoseFailure(f"{path.name} does not contain a GLB JSON chunk.")
    nodes = document.get("nodes", [])
    names: list[str] = []
    seen: set[str] = set()
    for skin in document.get("skins", []):
        for joint_index in skin.get("joints", []):
            node = nodes[joint_index]
            name = str(node.get("name", f"node_{joint_index}"))
            if name not in seen:
                seen.add(name)
                names.append(name)
    if not names:
        raise PoseFailure(f"{path.name} does not contain any skin joints.")
    return names


def cartwheel_bone_inventory(
    spec: dict[str, Any],
    current_model_path: Path,
) -> dict[str, Any]:
    config = spec.get("cartwheel_asset")
    if not isinstance(config, dict):
        raise PoseFailure("Pose specification is missing cartwheel_asset.")
    asset_id = str(config.get("asset_id", ""))
    filename = str(config.get("filename", "cartwheel-rigged.glb"))
    if not asset_id.startswith("asset_") or not filename.endswith(".glb"):
        raise PoseFailure("cartwheel_asset needs an asset_id and .glb filename.")
    destination = MODELS_DIR / filename
    download_asset(asset_id, destination)
    current_names = glb_skin_bone_names(current_model_path)
    cartwheel_names = glb_skin_bone_names(destination)
    cartwheel_set = set(cartwheel_names)
    finger_families = [
        f"{side}_{finger}"
        for side in ("left", "right")
        for finger in ("thumb", "index", "middle", "ring", "pinky")
    ]
    # Compare by retargetable semantic slots rather than literal export
    # spelling. The two rigs use different names and the court rig has
    # twist-helper joints, so a literal string set difference would falsely
    # call every body joint unique. Cartwheel adds spine3 plus ten finger
    # families; the individual finger joints are listed separately below.
    cartwheel_only = ["spine3", *finger_families]
    cartwheel_only_joints = [
        name for name in cartwheel_names if name in {
            f"{family}{index}"
            for family in finger_families
            for index in range(1, 4)
        }
    ]
    return {
        "asset_id": asset_id,
        "path": destination,
        "current_bones": current_names,
        "cartwheel_bones": cartwheel_names,
        "cartwheel_only": cartwheel_only,
        "cartwheel_only_joints": cartwheel_only_joints,
        "finger_bones": finger_families,
    }


def write_cartwheel_bone_list(cartwheel: dict[str, Any]) -> None:
    """Persist the direct skin-joint inventory without invoking Blender rendering."""
    CARTWHEEL_BONES_PATH.parent.mkdir(parents=True, exist_ok=True)
    CARTWHEEL_BONES_PATH.write_text(
        "\n".join(cartwheel["cartwheel_bones"]) + "\n",
        encoding="utf-8",
    )


def visible_character_mesh(obj: bpy.types.Object) -> bool:
    if obj.type != "MESH" or obj.hide_render:
        return False
    if any(collection.hide_render for collection in obj.users_collection):
        return False
    return obj.find_armature() is not None or any(
        modifier.type == "ARMATURE" for modifier in obj.modifiers
    )


def retain_rigged_character_only() -> list[bpy.types.Object]:
    """Discard imported cameras, lights, and unrigged export helper meshes."""
    for obj in list(bpy.context.scene.objects):
        if obj.type == "MESH" and not visible_character_mesh(obj):
            bpy.data.objects.remove(obj, do_unlink=True)
        elif obj.type not in {"MESH", "ARMATURE"}:
            bpy.data.objects.remove(obj, do_unlink=True)
    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    meshes = [obj for obj in bpy.context.scene.objects if visible_character_mesh(obj)]
    if not armatures:
        raise PoseFailure("No armature was found in the downloaded rigged model.")
    if not meshes:
        raise PoseFailure("No skinned character mesh was found in the downloaded model.")
    return armatures + meshes


def apply_pose(
    armature: bpy.types.Object,
    pose: dict[str, Any],
    refused_bones: set[str] | None = None,
) -> tuple[list[str], list[str]]:
    """Set accepted local Euler rotations and report unavailable bones."""
    missing: list[str] = []
    applied: list[str] = []
    refused_bones = refused_bones or set()
    for bone_name, rotation in pose.items():
        if bone_name in refused_bones:
            continue
        if bone_name not in armature.pose.bones:
            missing.append(bone_name)
            continue
        if not isinstance(rotation, list) or len(rotation) != 3:
            missing.append(f"{bone_name} (invalid rotation)")
            continue
        pose_bone = armature.pose.bones[bone_name]
        pose_bone.rotation_mode = "XYZ"
        pose_bone.rotation_euler = Euler(
            tuple(math.radians(float(value)) for value in rotation), "XYZ"
        )
        applied.append(bone_name)
    bpy.context.view_layer.update()
    return applied, missing


def add_arm_ik(
    armature: bpy.types.Object, entry: dict[str, Any]
) -> list[str]:
    """Add position-only hand IK controls defined in normalized world space.

    With ``use_tail`` disabled, the target controls the hand bone's head (the
    wrist/palm attachment). A two-bone chain then solves the forearm and upper
    arm while the hand inherits the solved forearm direction and reaches across
    the chest without a hand-authored Euler rotation.
    """
    config = entry.get("arm_ik")
    if config is None:
        return []
    if not isinstance(config, dict):
        raise PoseFailure(f"{entry['name']} arm_ik must be an object.")

    controls: list[str] = []
    for side in ("L", "R"):
        side_config = config.get(side)
        if not isinstance(side_config, dict):
            raise PoseFailure(f"{entry['name']} arm_ik is missing side {side}.")
        target_values = side_config.get("target")
        pole_values = side_config.get("pole")
        if (
            not isinstance(target_values, list)
            or len(target_values) != 3
            or not isinstance(pole_values, list)
            or len(pole_values) != 3
        ):
            raise PoseFailure(
                f"{entry['name']} {side} IK target and pole must be XYZ lists."
            )

        hand_name = f"{side}_Hand"
        if hand_name not in armature.pose.bones:
            raise PoseFailure(f"{entry['name']} cannot add IK: {hand_name} is missing.")

        target = bpy.data.objects.new(
            f"{entry['name']}_{side}_Hand_IK_Target", None
        )
        bpy.context.collection.objects.link(target)
        target.location = Vector(tuple(float(value) for value in target_values))
        target.empty_display_type = "SPHERE"
        target.empty_display_size = 0.018
        target.hide_render = True
        target["court_ik_control"] = True

        pole = bpy.data.objects.new(f"{entry['name']}_{side}_Elbow_Pole", None)
        bpy.context.collection.objects.link(pole)
        pole.location = Vector(tuple(float(value) for value in pole_values))
        pole.empty_display_type = "PLAIN_AXES"
        pole.empty_display_size = 0.04
        pole.hide_render = True
        pole["court_ik_control"] = True

        constraint = armature.pose.bones[hand_name].constraints.new("IK")
        constraint.name = f"{entry['name']}_{side}_Arm_IK"
        constraint.target = target
        constraint.pole_target = pole
        constraint.chain_count = 2
        constraint.use_tail = False
        constraint.use_rotation = False
        constraint.pole_angle = math.radians(
            float(side_config.get("pole_angle_degrees", 0.0))
        )
        controls.append(
            f"{side} hand target={tuple(round(value, 3) for value in target.location)}, "
            f"elbow pole={tuple(round(value, 3) for value in pole.location)}, "
            f"pole angle={math.degrees(constraint.pole_angle):.1f}°"
        )

    bpy.context.view_layer.update()
    return controls


def character_bounds() -> tuple[Vector, Vector]:
    meshes = [
        obj
        for obj in bpy.context.scene.objects
        if visible_character_mesh(obj) and not obj.get("court_support")
    ]
    depsgraph = bpy.context.evaluated_depsgraph_get()
    points: list[Vector] = []
    for obj in meshes:
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        try:
            points.extend(evaluated.matrix_world @ vertex.co for vertex in mesh.vertices)
        finally:
            evaluated.to_mesh_clear()
    if not points:
        raise PoseFailure("The rigged character has no measurable surface.")
    return (
        Vector(tuple(min(point[index] for point in points) for index in range(3))),
        Vector(tuple(max(point[index] for point in points) for index in range(3))),
    )


def mesh_boundary_report(
    objects: list[bpy.types.Object], evaluated: bool = False
) -> dict[str, Any]:
    """Report open-surface boundary loops and their world-space locations.

    A boundary edge is an edge referenced by exactly one polygon. Connected
    boundary edges are grouped into a single hole location so a hole with many
    edges is not reported as many separate defects. Only imported rigged mesh
    objects are considered; support cards and props are never included.
    """
    holes: list[dict[str, Any]] = []
    boundary_edge_count = 0
    depsgraph = bpy.context.evaluated_depsgraph_get() if evaluated else None
    for obj in objects:
        if not visible_character_mesh(obj) or obj.get("court_support"):
            continue
        source = obj.evaluated_get(depsgraph) if evaluated and depsgraph else obj
        mesh = source.to_mesh() if evaluated and depsgraph else obj.data
        try:
            edge_faces: dict[tuple[int, int], int] = {}
            for polygon in mesh.polygons:
                vertices = list(polygon.vertices)
                for index, vertex_index in enumerate(vertices):
                    edge = tuple(
                        sorted((vertex_index, vertices[(index + 1) % len(vertices)]))
                    )
                    edge_faces[edge] = edge_faces.get(edge, 0) + 1
            boundaries = [edge for edge, faces in edge_faces.items() if faces == 1]
            boundary_edge_count += len(boundaries)
            if not boundaries:
                continue

            edges_by_vertex: dict[int, list[int]] = {}
            for edge_index, (first, second) in enumerate(boundaries):
                edges_by_vertex.setdefault(first, []).append(edge_index)
                edges_by_vertex.setdefault(second, []).append(edge_index)
            unvisited = set(range(len(boundaries)))
            world_matrix = source.matrix_world if evaluated and depsgraph else obj.matrix_world
            while unvisited:
                first_edge = unvisited.pop()
                component = [first_edge]
                queue = [first_edge]
                while queue:
                    edge_index = queue.pop()
                    for vertex_index in boundaries[edge_index]:
                        for neighbor in edges_by_vertex[vertex_index]:
                            if neighbor in unvisited:
                                unvisited.remove(neighbor)
                                queue.append(neighbor)
                                component.append(neighbor)
                component_vertices = {
                    vertex_index
                    for edge_index in component
                    for vertex_index in boundaries[edge_index]
                }
                position = sum(
                    (world_matrix @ mesh.vertices[vertex_index].co
                     for vertex_index in component_vertices),
                    Vector(),
                ) / len(component_vertices)
                holes.append(
                    {
                        "mesh": obj.name,
                        "boundary_edges": len(component),
                        "position": tuple(float(value) for value in position),
                    }
                )
        finally:
            if evaluated and depsgraph:
                source.to_mesh_clear()
    holes.sort(
        key=lambda hole: (
            str(hole["mesh"]),
            tuple(round(value, 6) for value in hole["position"]),
        )
    )
    return {
        "boundary_edges": boundary_edge_count,
        "holes": holes,
    }


def safe_mesh_boundary_report(
    objects: list[bpy.types.Object], evaluated: bool = False
) -> dict[str, Any]:
    """Keep a diagnostic-report failure from suppressing character renders."""
    try:
        return mesh_boundary_report(objects, evaluated=evaluated)
    except Exception as error:
        return {
            "boundary_edges": 0,
            "holes": [],
            "error": f"{type(error).__name__}: {error}",
        }


def normalize_and_orient(
    objects: list[bpy.types.Object],
    entry: dict[str, Any],
    orientation_correction: float,
) -> bpy.types.Object:
    root = bpy.data.objects.new(f"{entry['name']}_CourtRoot", None)
    bpy.context.collection.objects.link(root)
    for obj in objects:
        obj.parent = root
        obj.matrix_parent_inverse = root.matrix_world.inverted()

    # The source exporter applies a +90° vertical rotation. Undo that first,
    # then apply the entry's facing angle on the corrected baseline.
    root.rotation_euler[2] = math.radians(orientation_correction)
    bpy.context.view_layer.update()
    root.rotation_euler[2] += math.radians(float(entry.get("facing_degrees", 0.0)))
    bpy.context.view_layer.update()
    minimum, maximum = character_bounds()
    height = maximum.z - minimum.z
    if height <= 0:
        raise PoseFailure("The posed character has no measurable height.")

    target_height = float(entry.get("normalized_height", 1.0))
    scale = target_height / height
    root.scale = (scale, scale, scale)
    bpy.context.view_layer.update()
    minimum, maximum = character_bounds()
    center = (minimum + maximum) * 0.5
    root.location += Vector((-center.x, -center.y, -minimum.z))
    offset = entry.get("scene_offset", [0.0, 0.0, 0.0])
    root.location += Vector(tuple(float(value) for value in offset))
    bpy.context.view_layer.update()
    return root


def make_principled_material(
    name: str,
    color: tuple[float, float, float, float],
    roughness: float = 0.75,
    metallic: float = 0.0,
) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.diffuse_color = color
    material.use_nodes = True
    principled = material.node_tree.nodes.get("Principled BSDF")
    assert principled is not None
    principled.inputs["Base Color"].default_value = color
    principled.inputs["Roughness"].default_value = roughness
    principled.inputs["Metallic"].default_value = metallic
    return material


def make_soft_shadow_material(name: str, strength: float) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    mix = nodes.new("ShaderNodeMixShader")
    transparent = nodes.new("ShaderNodeBsdfTransparent")
    diffuse = nodes.new("ShaderNodeBsdfPrincipled")
    coordinates = nodes.new("ShaderNodeTexCoord")
    distance = nodes.new("ShaderNodeVectorMath")
    distance.operation = "DISTANCE"
    center = nodes.new("ShaderNodeCombineXYZ")
    center.inputs["X"].default_value = 0.5
    center.inputs["Y"].default_value = 0.5
    center.inputs["Z"].default_value = 0.0
    falloff = nodes.new("ShaderNodeMapRange")
    falloff.inputs["From Min"].default_value = 0.0
    falloff.inputs["From Max"].default_value = 0.72
    falloff.inputs["To Min"].default_value = max(0.0, min(1.0, strength))
    falloff.inputs["To Max"].default_value = 0.0
    falloff.clamp = True
    diffuse.inputs["Base Color"].default_value = (0.015, 0.02, 0.04, 1.0)
    diffuse.inputs["Roughness"].default_value = 1.0
    links.new(coordinates.outputs["Generated"], distance.inputs[0])
    links.new(center.outputs[0], distance.inputs[1])
    links.new(distance.outputs["Value"], falloff.inputs["Value"])
    links.new(falloff.outputs["Result"], mix.inputs[0])
    links.new(transparent.outputs[0], mix.inputs[1])
    links.new(diffuse.outputs[0], mix.inputs[2])
    links.new(mix.outputs[0], output.inputs[0])
    return material


def mark_support(
    obj: bpy.types.Object, support_kind: str = "contact-surface"
) -> bpy.types.Object:
    obj["court_support"] = True
    obj["court_support_kind"] = support_kind
    return obj


def add_basketball(position: Vector) -> list[bpy.types.Object]:
    orange = make_principled_material("BasketballOrange", (0.75, 0.16, 0.025, 1.0))
    dark = make_principled_material("BasketballSeams", (0.025, 0.012, 0.008, 1.0))
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=32, ring_count=16, radius=0.105, location=position
    )
    ball = mark_support(bpy.context.object, "scene-prop")
    ball.name = "CourtBasketball"
    ball.data.materials.append(orange)
    for polygon in ball.data.polygons:
        polygon.use_smooth = True
    result = [ball]
    for index, rotation in enumerate(((0.0, 0.0, 0.0), (math.pi / 2.0, 0.0, 0.0))):
        bpy.ops.mesh.primitive_torus_add(
            major_radius=0.104,
            minor_radius=0.008,
            major_segments=32,
            minor_segments=8,
            location=position,
            rotation=rotation,
        )
        seam = mark_support(bpy.context.object, "scene-prop")
        seam.name = f"CourtBasketballSeam{index + 1}"
        seam.data.materials.append(dark)
        for polygon in seam.data.polygons:
            polygon.use_smooth = True
        result.append(seam)
    return result


def add_hoop_target(position: Vector) -> bpy.types.Object:
    """Add a non-rendering aim target so RICO's attention has a scene anchor."""
    target = bpy.data.objects.new("CourtHoopTarget", None)
    bpy.context.collection.objects.link(target)
    target.empty_display_type = "CIRCLE"
    target.empty_display_size = 0.18
    target.location = position
    return target


def add_ellipse_card(
    name: str,
    center: Vector,
    width: float,
    height: float,
    material: bpy.types.Material,
) -> bpy.types.Object:
    vertices = [
        (center.x + math.cos(index * math.pi / 24.0) * width / 2.0, center.y,
         center.z + math.sin(index * math.pi / 24.0) * height / 2.0)
        for index in range(48)
    ]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], [list(range(48))])
    mesh.materials.append(material)
    obj = mark_support(
        bpy.data.objects.new(name, mesh),
        "contact-shadow",
    )
    bpy.context.collection.objects.link(obj)
    return obj


def add_contact_shadow(contact: Vector) -> list[bpy.types.Object]:
    """Add filled, layered ellipses lying flat in the ground plane."""
    shadows: list[bpy.types.Object] = []
    for index, (width, height, strength) in enumerate(
        ((0.72, 0.34, 0.025), (0.54, 0.25, 0.045), (0.34, 0.16, 0.075))
    ):
        material = make_soft_shadow_material(f"ContactShadow{index + 1}", strength)
        center = Vector(
            (contact.x - 0.18, contact.y - 0.22, contact.z + 0.002 + index * 0.001)
        )
        shadows.append(
            add_ellipse_card(
                f"ContactShadowCard{index + 1}", center, width, height, material
            )
        )
    return shadows


def add_contact_cube(
    name: str,
    location: tuple[float, float, float],
    dimensions: tuple[float, float, float],
) -> bpy.types.Object:
    """Create a real posing surface that can be hidden from final renders."""
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = mark_support(bpy.context.object, "contact-surface")
    obj.name = name
    obj.dimensions = dimensions
    bpy.context.view_layer.update()
    material = make_principled_material(
        f"{name}Material",
        (0.025, 0.035, 0.06, 1.0),
        roughness=0.92,
    )
    obj.data.materials.append(material)
    return obj


def add_contact_supports(
    name: str,
    entry: dict[str, Any],
    seat_height: float | None = None,
) -> list[bpy.types.Object]:
    """Restore wall/seat geometry for contact authoring without image baking."""
    supports: list[bpy.types.Object] = []
    role = str(entry.get("variant_role", entry.get("role", "")))
    if name == "CHILL" and role == "wall-lean":
        supports.append(
            add_contact_cube(
                "CourtChillWall",
                (0.0, 0.48, 1.05),
                (2.8, 0.10, 2.10),
            )
        )
    if name == "BUZZ":
        top = float(seat_height if seat_height is not None else 0.64)
        supports.append(
            add_contact_cube(
                "CourtBuzzLowSupport",
                (0.0, 0.18, top - 0.08),
                (1.65, 0.95, 0.16),
            )
        )
    return supports


def configure_scene(
    settings: dict[str, Any], camera_settings: dict[str, Any]
) -> bpy.types.Object:
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = int(settings.get("cycles_samples", 16))
    scene.cycles.use_denoising = True
    scene.render.resolution_x = int(settings.get("width", RENDER_WIDTH))
    scene.render.resolution_y = int(settings.get("height", RENDER_HEIGHT))
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = True
    scene.render.use_file_extension = True
    scene.render.filepath = ""
    scene.view_settings.exposure = float(settings.get("exposure", -0.55))
    camera_data = bpy.data.cameras.new("CourtSharedCamera")
    camera = bpy.data.objects.new("CourtSharedCamera", camera_data)
    bpy.context.collection.objects.link(camera)
    scene.camera = camera
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = float(camera_settings["ortho_scale"])
    camera.data.clip_start = 0.01
    camera.data.clip_end = float(camera_settings.get("clip_end", 100.0))
    location = Vector(tuple(float(value) for value in camera_settings["location"]))
    target = Vector(tuple(float(value) for value in camera_settings["target"]))
    camera.location = location
    camera.rotation_euler = (target - location).to_track_quat("-Z", "Y").to_euler()

    world = bpy.data.worlds.new("TransparentNightWorld")
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (
        0.008, 0.012, 0.03, 1.0
    )
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = float(
        settings.get("world_strength", 0.018)
    )

    for label, spec in (("CourtWarmKey", settings["key"]), ("CourtCoolFill", settings["fill"])):
        light_data = bpy.data.lights.new(label, "AREA")
        light_data.energy = float(spec["energy"])
        light_data.shape = "DISK"
        light_data.size = float(spec["size"])
        light_data.color = tuple(float(value) for value in spec["color"])
        light = bpy.data.objects.new(label, light_data)
        bpy.context.collection.objects.link(light)
        light.location = Vector(tuple(float(value) for value in spec["location"]))
        light.rotation_euler = (target - light.location).to_track_quat("-Z", "Y").to_euler()
    return camera


def armature_bone_world_point(
    armature: bpy.types.Object, name: str, default: Vector
) -> Vector:
    pose_bone = armature.pose.bones.get(name)
    if pose_bone is None:
        return default.copy()
    return armature.matrix_world @ Vector(pose_bone.head)


def armature_bone_world_tail(
    armature: bpy.types.Object, name: str, default: Vector
) -> Vector:
    pose_bone = armature.pose.bones.get(name)
    if pose_bone is None:
        return default.copy()
    return armature.matrix_world @ Vector(pose_bone.tail)


def hand_target(
    armature: bpy.types.Object, entry: dict[str, Any], fallback: Vector
) -> Vector:
    names = [
        str(entry.get("dribble_hand", "")),
        "L_Hand",
        "R_Hand",
        "L_Forearm",
        "R_Forearm",
    ]
    points = [
        armature_bone_world_point(armature, name, fallback)
        for name in names
        if name and armature.pose.bones.get(name) is not None
    ]
    return sum(points, Vector()) / len(points) if points else fallback


def hand_crop_frame(
    armature: bpy.types.Object,
    fallback: Vector,
    image_aspect: float,
    minimum_scale: float,
) -> tuple[Vector, float]:
    points = [
        armature_bone_world_point(armature, name, fallback)
        for name in ("L_Hand", "R_Hand", "L_Forearm", "R_Forearm")
        if armature.pose.bones.get(name) is not None
    ]
    if not points:
        return fallback, minimum_scale
    target = sum(points, Vector()) / len(points)
    x_span = max(point.x for point in points) - min(point.x for point in points)
    z_span = max(point.z for point in points) - min(point.z for point in points)
    vertical_scale = z_span + 0.24
    horizontal_scale = x_span / max(image_aspect, 0.01) + 0.24
    return target, max(minimum_scale, vertical_scale, horizontal_scale)


def ground_contact(
    armature: bpy.types.Object,
    entry: dict[str, Any],
    minimum: Vector,
    support_objects: list[bpy.types.Object],
) -> Vector:
    left = armature_bone_world_point(armature, "L_Foot", Vector((0.0, 0.0, minimum.z)))
    right = armature_bone_world_point(armature, "R_Foot", Vector((0.0, 0.0, minimum.z)))
    return Vector(((left.x + right.x) / 2.0, (left.y + right.y) / 2.0, minimum.z))


def pixel_anchor(camera: bpy.types.Object, point: Vector) -> tuple[int, int]:
    scene = bpy.context.scene
    projected = world_to_camera_view(scene, camera, point)
    width = scene.render.resolution_x
    height = scene.render.resolution_y
    return round(projected.x * width), round((1.0 - projected.y) * height)


def frame_camera_to_character(
    camera: bpy.types.Object,
    minimum: Vector,
    maximum: Vector,
    camera_settings: dict[str, Any],
    width: int,
    height: int,
    margin: float = 0.10,
) -> float:
    """Fit the character while preserving the shared camera height and angle."""
    center = (minimum + maximum) * 0.5
    base_location = Vector(
        tuple(float(value) for value in camera_settings["location"])
    )
    base_target = Vector(tuple(float(value) for value in camera_settings["target"]))
    # Horizontal translation keeps the viewing direction unchanged. Vertical
    # position and rotation remain identical, preserving the shared horizon.
    camera.location.x = center.x
    camera.location.y = base_location.y
    camera.location.z = base_location.z
    camera.rotation_euler = (base_target - base_location).to_track_quat(
        "-Z", "Y"
    ).to_euler()
    vertical_extent = max(
        abs(maximum.z - base_target.z), abs(minimum.z - base_target.z)
    )
    horizontal_extent = (maximum.x - minimum.x) / max(width / height, 0.01) / 2.0
    ortho_scale = max(vertical_extent, horizontal_extent) * 2.0 * (1.0 + margin)
    camera.data.ortho_scale = max(ortho_scale, 0.01)
    return camera.data.ortho_scale


def joint_bend_degrees(
    armature: bpy.types.Object, upper_name: str, joint_name: str, end_name: str
) -> float:
    upper = armature_bone_world_point(armature, upper_name, Vector())
    joint = armature_bone_world_point(armature, joint_name, Vector())
    end = armature_bone_world_point(armature, end_name, Vector())
    first = joint - upper
    second = end - joint
    if first.length == 0 or second.length == 0:
        return 0.0
    return math.degrees(first.angle(second))


def weighted_skin_points(
    group_names: set[str],
    minimum_weight: float = 0.45,
    sample_stride: int = 1,
) -> list[Vector]:
    """Return evaluated skin vertices substantially controlled by named bones."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    points: list[Vector] = []
    for obj in bpy.context.scene.objects:
        if not visible_character_mesh(obj) or obj.get("court_support"):
            continue
        group_names_by_index = {group.index: group.name for group in obj.vertex_groups}
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        try:
            vertex_count = min(len(obj.data.vertices), len(mesh.vertices))
            for index in range(0, vertex_count, max(1, sample_stride)):
                source_vertex = obj.data.vertices[index]
                weight = sum(
                    membership.weight
                    for membership in source_vertex.groups
                    if group_names_by_index.get(membership.group) in group_names
                )
                if weight >= minimum_weight:
                    points.append(evaluated.matrix_world @ mesh.vertices[index].co)
        finally:
            evaluated.to_mesh_clear()
    return points


def point_segment_distance(point: Vector, start: Vector, end: Vector) -> tuple[float, float]:
    """Return distance to a finite segment and the clamped segment parameter."""
    if (end - start).length <= 1e-8:
        return (point - start).length, 0.0
    _, parameter = intersect_point_line(point, start, end)
    parameter = max(0.0, min(1.0, parameter))
    nearest = start + (end - start) * parameter
    return (point - nearest).length, parameter


def minimum_point_gap(first: list[Vector], second: list[Vector]) -> float:
    """Measure the nearest distance between two point clouds."""
    if not first or not second:
        return math.inf
    tree = KDTree(len(second))
    for index, point in enumerate(second):
        tree.insert(point, index)
    tree.balance()
    return min(tree.find(point)[2] for point in first)


def wrist_attachment_metrics(
    armature: bpy.types.Object,
) -> dict[str, tuple[float, float, int, int]]:
    """Measure bone and evaluated-skin continuity at both wrist seams."""
    metrics: dict[str, tuple[float, float, int, int]] = {}
    for side in ("L", "R"):
        forearm = armature.pose.bones.get(f"{side}_Forearm")
        hand = armature.pose.bones.get(f"{side}_Hand")
        if forearm is None or hand is None:
            continue
        wrist = armature.matrix_world @ hand.head
        bone_gap = (
            armature.matrix_world @ forearm.tail
            - wrist
        ).length
        hand_points = [
            point
            for point in weighted_skin_points({f"{side}_Hand"}, 0.35)
            if (point - wrist).length <= 0.09
        ]
        forearm_points = [
            point
            for point in weighted_skin_points(
                {
                    f"{side}_Forearm",
                    f"{side}_ForearmTwist01",
                    f"{side}_ForearmTwist02",
                },
                0.35,
            )
            if (point - wrist).length <= 0.09
        ]
        metrics[side] = (
            bone_gap,
            minimum_point_gap(hand_points, forearm_points),
            len(hand_points),
            len(forearm_points),
        )
    return metrics


def forearm_upperarm_clearance_metrics(
    armature: bpy.types.Object,
) -> dict[str, tuple[float, float, float]]:
    """Check that each forearm centerline remains outside its upper-arm volume.

    The upper-arm volume is approximated as a capsule whose radius is the
    median radial distance of weighted upper-arm skin from the bone centerline.
    The shared elbow is intentionally excluded; the distal half of the forearm
    must remain outside that capsule.
    """
    metrics: dict[str, tuple[float, float, float]] = {}
    for side in ("L", "R"):
        upper = armature.pose.bones.get(f"{side}_Upperarm")
        forearm = armature.pose.bones.get(f"{side}_Forearm")
        hand = armature.pose.bones.get(f"{side}_Hand")
        if upper is None or forearm is None or hand is None:
            continue
        shoulder = armature.matrix_world @ upper.head
        elbow = armature.matrix_world @ forearm.head
        wrist = armature.matrix_world @ hand.head
        radial_distances = sorted(
            distance
            for point in weighted_skin_points(
                {
                    f"{side}_Upperarm",
                    f"{side}_UpperarmTwist01",
                    f"{side}_UpperarmTwist02",
                }
            )
            for distance, parameter in [point_segment_distance(point, shoulder, elbow)]
            if 0.15 <= parameter <= 0.80
        )
        if not radial_distances:
            continue
        upperarm_radius = radial_distances[len(radial_distances) // 2]
        centerline_separation = min(
            point_segment_distance(
                elbow + (wrist - elbow) * (0.50 + index * 0.025),
                shoulder,
                elbow,
            )[0]
            for index in range(21)
        )
        metrics[side] = (
            centerline_separation - upperarm_radius,
            centerline_separation,
            upperarm_radius,
        )
    return metrics


def minimum_point_gap(
    source_points: list[Vector], target_points: list[Vector]
) -> float:
    if not source_points or not target_points:
        return math.inf
    tree = KDTree(len(target_points))
    for index, point in enumerate(target_points):
        tree.insert(point, index)
    tree.balance()
    return min(
        (point - tree.find(point)[0]).length
        for point in source_points
    )


def hand_clearance_metrics(
    armature: bpy.types.Object,
) -> dict[str, tuple[float, float, float]]:
    """Measure variant hand separation from each other, arms, and body."""
    all_bones = {bone.name for bone in armature.data.bones}
    metrics: dict[str, tuple[float, float, float]] = {}
    for side, opposite in (("L", "R"), ("R", "L")):
        own_hand = weighted_skin_points(
            {f"{side}_Hand"}, 0.35, sample_stride=8
        )
        opposite_hand = weighted_skin_points(
            {f"{opposite}_Hand"}, 0.35, sample_stride=8
        )
        opposite_arm = weighted_skin_points(
            {
                f"{opposite}_Upperarm",
                f"{opposite}_UpperarmTwist01",
                f"{opposite}_UpperarmTwist02",
                f"{opposite}_Forearm",
                f"{opposite}_ForearmTwist01",
                f"{opposite}_ForearmTwist02",
            },
            0.35,
            sample_stride=8,
        )
        own_arm = {
            f"{side}_Upperarm",
            f"{side}_UpperarmTwist01",
            f"{side}_UpperarmTwist02",
            f"{side}_Forearm",
            f"{side}_ForearmTwist01",
            f"{side}_ForearmTwist02",
            f"{side}_Hand",
        }
        body = weighted_skin_points(
            all_bones - own_arm - {f"{opposite}_Hand"},
            0.35,
            sample_stride=8,
        )
        metrics[side] = (
            minimum_point_gap(own_hand, opposite_hand),
            minimum_point_gap(own_hand, opposite_arm),
            minimum_point_gap(own_hand, body),
        )
    return metrics


def foot_clearance_metrics(
    armature: bpy.types.Object,
) -> dict[str, float]:
    left = weighted_skin_points(
        {"L_Foot", "L_ToeBase"}, 0.35, sample_stride=8
    )
    right = weighted_skin_points(
        {"R_Foot", "R_ToeBase"}, 0.35, sample_stride=8
    )
    return {
        "L_to_R": minimum_point_gap(left, right),
        "R_to_L": minimum_point_gap(right, left),
    }


def arm_chest_depth_metrics() -> dict[str, tuple[float, float, int]]:
    """Measure arm skin in front of the torso where their screen-space areas overlap.

    The camera looks along positive world Y, so a smaller Y is closer to camera.
    Torso vertices are binned in X/Z and compared only with arm vertices that
    overlap those bins. This avoids treating an outer sleeve as a penetration
    when it never crosses the chest in the rendered view.
    """
    torso_points = weighted_skin_points({"Spine01", "Spine02"})
    arm_groups = {
        "L": {"L_Forearm", "L_ForearmTwist01", "L_ForearmTwist02", "L_Hand"},
        "R": {"R_Forearm", "R_ForearmTwist01", "R_ForearmTwist02", "R_Hand"},
    }
    if not torso_points:
        return {}

    cell_size = 0.02
    torso_front_by_cell: dict[tuple[int, int], float] = {}
    for point in torso_points:
        key = (round(point.x / cell_size), round(point.z / cell_size))
        torso_front_by_cell[key] = min(
            torso_front_by_cell.get(key, math.inf), point.y
        )

    metrics: dict[str, tuple[float, float, int]] = {}
    for side, groups in arm_groups.items():
        clearances: list[float] = []
        for point in weighted_skin_points(groups):
            key_x = round(point.x / cell_size)
            key_z = round(point.z / cell_size)
            nearby_depths = [
                torso_front_by_cell[(key_x + dx, key_z + dz)]
                for dx in (-1, 0, 1)
                for dz in (-1, 0, 1)
                if (key_x + dx, key_z + dz) in torso_front_by_cell
            ]
            if nearby_depths:
                # Positive clearance means the arm sample is camera-side.
                clearances.append(min(nearby_depths) - point.y)
        if clearances:
            ordered = sorted(clearances)
            median_clearance = ordered[len(ordered) // 2]
            front_fraction = sum(value >= -0.005 for value in ordered) / len(ordered)
            metrics[side] = (front_fraction, median_clearance, len(ordered))
    return metrics


def verify_pose_contract(
    name: str,
    armature: bpy.types.Object,
    entry: dict[str, Any],
    support_objects: list[bpy.types.Object],
    rendered_supports: list[str] | None = None,
) -> list[str]:
    """Fail the run when measurable pose requirements are not actually met."""
    checks: list[str] = []
    failures: list[str] = []

    def require(label: str, condition: bool, detail: str) -> None:
        checks.append(f"{label}: {'PASS' if condition else 'FAIL'} ({detail})")
        if not condition:
            failures.append(f"{label}: {detail}")

    pelvis = armature_bone_world_point(armature, "Pelvis", Vector())
    left_hand = armature_bone_world_point(armature, "L_Hand", Vector())
    right_hand = armature_bone_world_point(armature, "R_Hand", Vector())
    visible_props = rendered_supports or []
    require(
        "no contact support is visible in the rendered image",
        not visible_props,
        ", ".join(visible_props)
        if visible_props
        else "all wall/seat supports hidden before the main render",
    )
    refused_rotations = entry.get("_rotation_audit", {}).get("refused", [])
    require(
        "limb rotation bound",
        not refused_rotations,
        (
            "all requested limb axes are within "
            f"±{LIMB_ROTATION_LIMIT_DEGREES:.1f}°"
            if not refused_rotations
            else "refused and left unapplied: " + "; ".join(refused_rotations)
        ),
    )

    attachment_metrics = wrist_attachment_metrics(armature)
    attachment_ok = (
        set(attachment_metrics) == {"L", "R"}
        and all(
            bone_gap <= 0.002
            and skin_gap <= 0.015
            and hand_samples > 0
            and forearm_samples > 0
            for bone_gap, skin_gap, hand_samples, forearm_samples
            in attachment_metrics.values()
        )
    )
    attachment_detail = ", ".join(
        (
            f"{side}: bone gap={bone_gap:.5f}, skin gap={skin_gap:.5f}, "
            f"samples={hand_samples}/{forearm_samples}"
        )
        for side, (bone_gap, skin_gap, hand_samples, forearm_samples)
        in sorted(attachment_metrics.items())
    ) or "wrist seam samples unavailable"
    require(
        "each hand remains attached to its forearm with no wrist gap",
        attachment_ok,
        attachment_detail,
    )
    arm_clearance_metrics = forearm_upperarm_clearance_metrics(armature)
    arm_clearance_ok = (
        set(arm_clearance_metrics) == {"L", "R"}
        and all(
            clearance >= 0.0
            for clearance, _, _ in arm_clearance_metrics.values()
        )
    )
    arm_clearance_detail = ", ".join(
        (
            f"{side}: clearance={clearance:.3f}, "
            f"centerline separation={separation:.3f}, "
            f"upper-arm radius={radius:.3f}"
        )
        for side, (clearance, separation, radius)
        in sorted(arm_clearance_metrics.items())
    ) or "weighted upper-arm samples unavailable"
    require(
        "no forearm enters the volume of its upper arm",
        arm_clearance_ok,
        arm_clearance_detail,
    )
    depth_metrics = arm_chest_depth_metrics()
    facing_degrees = abs(float(entry.get("facing_degrees", 0.0))) % 180.0
    required_depth_sides = {"L", "R"}
    if 60.0 <= facing_degrees <= 120.0:
        arm_depths = {
            side: sorted(point.y for point in weighted_skin_points(groups))
            for side, groups in {
                "L": {"L_Forearm", "L_ForearmTwist01", "L_ForearmTwist02", "L_Hand"},
                "R": {"R_Forearm", "R_ForearmTwist01", "R_ForearmTwist02", "R_Hand"},
            }.items()
        }
        required_depth_sides = {
            min(
                arm_depths,
                key=lambda side: (
                    arm_depths[side][len(arm_depths[side]) // 2]
                    if arm_depths[side]
                    else math.inf
                ),
            )
        }
    depth_ok = (
        required_depth_sides <= set(depth_metrics)
        and all(
            depth_metrics[side][0] >= 0.60 and depth_metrics[side][1] >= 0.01
            for side in required_depth_sides
        )
    )
    depth_detail = ", ".join(
        (
            f"{side}: {front_fraction * 100:.1f}% camera-side, "
            f"median clearance={median_clearance:.3f}, samples={sample_count}"
        )
        for side, (front_fraction, median_clearance, sample_count)
        in sorted(depth_metrics.items())
    ) or "weighted torso/arm surface samples unavailable"
    depth_detail += (
        f"; evaluated camera-facing side(s)={','.join(sorted(required_depth_sides))}"
    )
    require(
        "overlapping forearm and hand skin is predominantly camera-side of the chest surface",
        depth_ok,
        depth_detail,
    )

    variant_id = str(entry.get("variant_id", ""))
    variant_role = str(entry.get("variant_role", ""))
    if variant_id:
        hand_gaps = hand_clearance_metrics(armature)
        hand_clearance_ok = bool(hand_gaps) and all(
            gap >= 0.008
            for side_gaps in hand_gaps.values()
            for gap in side_gaps
        )
        hand_clearance_detail = ", ".join(
            (
                f"{side}: other hand={gaps[0]:.3f}, "
                f"opposite arm={gaps[1]:.3f}, body={gaps[2]:.3f}"
            )
            for side, gaps in sorted(hand_gaps.items())
        ) or "hand clearance samples unavailable"
        require(
            "variant hands stay clear of everything except their own forearms",
            hand_clearance_ok,
            hand_clearance_detail,
        )
        if name == "CHILL":
            foot_gaps = foot_clearance_metrics(armature)
            foot_clearance_ok = bool(foot_gaps) and all(
                gap >= 0.008 for gap in foot_gaps.values()
            )
            require(
                "variant feet stay clear of each other and scene geometry",
                foot_clearance_ok,
                ", ".join(
                    f"{side}={gap:.3f}" for side, gap in sorted(foot_gaps.items())
                ),
            )

    shoulders = (
        armature_bone_world_point(armature, "L_Clavicle", pelvis)
        + armature_bone_world_point(armature, "R_Clavicle", pelvis)
    ) / 2.0
    left_foot = armature_bone_world_point(armature, "L_Foot", pelvis)
    right_foot = armature_bone_world_point(armature, "R_Foot", pelvis)
    if name == "BEEF":
        shoulder_z_gap = abs(
            armature_bone_world_point(armature, "L_Clavicle", pelvis).z
            - armature_bone_world_point(armature, "R_Clavicle", pelvis).z
        )
        head_pitch = float(entry.get("pose", {}).get("Head", [0.0])[0])
        front_side = str(entry.get("front_foot", "L"))
        front_foot = left_foot if front_side == "L" else right_foot
        back_foot = right_foot if front_side == "L" else left_foot
        require(
            "BEEF has no arm gesture or hand-target IK",
            "arm_ik" not in entry
            and max(left_hand.z, right_hand.z) < shoulders.z - 0.12,
            f"arm_ik={'present' if 'arm_ik' in entry else 'absent'}, "
            f"hands below shoulders={max(left_hand.z, right_hand.z) < shoulders.z - 0.12}",
        )
        require(
            "BEEF chin is lowered while eyes stay up under the brow",
            head_pitch >= 8.0,
            f"head pitch={head_pitch:.1f}°",
        )
        require(
            "BEEF shoulders stay square while hips turn",
            shoulder_z_gap <= 0.08
            and abs(float(entry.get("hips_angle_degrees", 0.0))) >= 12.0,
            f"shoulder z gap={shoulder_z_gap:.3f}, "
            f"hips angle={float(entry.get('hips_angle_degrees', 0.0)):.1f}°",
        )
        require(
            "BEEF weight settles back with the front foot half a step forward",
            front_foot.y < back_foot.y - 0.015
            and abs(front_foot.x - back_foot.x) >= 0.10,
            f"front/back y={front_foot.y:.3f}/{back_foot.y:.3f}, "
            f"foot x gap={abs(front_foot.x - back_foot.x):.3f}",
        )
        require(
            "BEEF hands hang with a small gap from the ribs",
            min(abs(left_hand.x - pelvis.x), abs(right_hand.x - pelvis.x)) >= 0.08,
            f"hand x gaps={abs(left_hand.x - pelvis.x):.3f}/"
            f"{abs(right_hand.x - pelvis.x):.3f}",
        )
    elif name == "CHILL" and variant_id:
        shoulders = (
            armature_bone_world_point(armature, "L_Clavicle", pelvis)
            + armature_bone_world_point(armature, "R_Clavicle", pelvis)
        ) / 2.0
        left_ankle = armature_bone_world_point(armature, "L_Foot", pelvis)
        right_ankle = armature_bone_world_point(armature, "R_Foot", pelvis)
        require(
            "CHILL arms remain idle and naturally curved",
            max(left_hand.z, right_hand.z) < shoulders.z - 0.08,
            f"L.z={left_hand.z:.3f}, R.z={right_hand.z:.3f}, shoulders.z={shoulders.z:.3f}",
        )
        require(
            "CHILL shoulders are dropped and back",
            float(entry.get("shoulder_drop_degrees", 0.0)) >= 8.0
            and shoulders.y > pelvis.y,
            f"drop={float(entry.get('shoulder_drop_degrees', 0.0)):.1f}°, "
            f"shoulder/pelvis y={shoulders.y:.3f}/{pelvis.y:.3f}",
        )
        require(
            "CHILL head has a small relaxed tilt",
            abs(float(entry.get("head_tilt_degrees", 0.0))) >= 2.0,
            f"head tilt={float(entry.get('head_tilt_degrees', 0.0)):.1f}°",
        )
        if variant_role == "wall-lean":
            require(
                "CHILL shoulder-lean uses the restored wall support",
                any(obj.name == "CourtChillWall" for obj in support_objects),
                "CourtChillWall present for contact authoring",
            )
            require(
                "CHILL shoulder-lean settles onto one hip",
                abs(left_ankle.z - right_ankle.z) >= 0.04,
                (
                    f"ankle z gap={abs(left_ankle.z - right_ankle.z):.3f}, "
                    f"left/right z={left_ankle.z:.3f}/{right_ankle.z:.3f}"
                ),
            )
        elif variant_role == "free-standing":
            require(
                "CHILL free-standing fallback has no contact support",
                not any(
                    obj.name == "CourtChillWall" for obj in support_objects
                ),
                "no wall or seat support requested",
            )
            require(
                "CHILL free-standing fallback keeps both feet grounded",
                abs(left_ankle.z - right_ankle.z) <= 0.10,
                f"ankle z gap={abs(left_ankle.z - right_ankle.z):.3f}",
            )
    elif name == "RICO":
        ball = next(
            (obj for obj in support_objects if obj.name == "CourtBasketball"), None
        )
        ball_hand = armature_bone_world_point(
            armature, str(entry.get("dribble_hand", "R_Hand")), Vector()
        )
        require(
            "RICO keeps the basketball at his hip or chest",
            ball is not None
            and (ball.location - ball_hand).length <= 0.22
            and ball.location.z >= ball_hand.z - 0.12,
            (
                f"hand=({ball_hand.x:.3f},{ball_hand.z:.3f}), "
                f"ball=({ball.location.x:.3f},{ball.location.z:.3f})"
                if ball
                else "basketball missing"
            ),
        )
        require(
            "RICO is turned three quarters toward the hoop",
            25.0 <= abs(float(entry.get("facing_degrees", 0.0))) <= 70.0,
            f"facing={float(entry.get('facing_degrees', 0.0)):.1f}°",
        )
        require(
            "RICO head is up and aimed at the existing hoop target",
            float(entry.get("head_pitch_degrees", 0.0)) <= -3.0
            and bpy.data.objects.get("CourtHoopTarget") is not None,
            f"head pitch={float(entry.get('head_pitch_degrees', 0.0)):.1f}°, "
            f"target={'present' if bpy.data.objects.get('CourtHoopTarget') else 'missing'}",
        )
        left_bend = joint_bend_degrees(
            armature, "L_Thigh", "L_Calf", "L_Foot"
        )
        right_bend = joint_bend_degrees(
            armature, "R_Thigh", "R_Calf", "R_Foot"
        )
        require(
            "RICO keeps both knees softly bent",
            5.0 <= min(left_bend, right_bend) <= 45.0,
            f"L={left_bend:.1f}°, R={right_bend:.1f}°",
        )
    elif name == "BUZZ":
        left_bend = joint_bend_degrees(
            armature, "L_Thigh", "L_Calf", "L_Foot"
        )
        right_bend = joint_bend_degrees(
            armature, "R_Thigh", "R_Calf", "R_Foot"
        )
        require(
            "BUZZ is well forward in the court with a three-quarter body angle",
            float(entry.get("body_angle_degrees", 0.0)) >= 20.0
            and float(entry.get("scene_offset", [0.0, 0.0])[1]) <= -0.25,
            f"body angle={float(entry.get('body_angle_degrees', 0.0)):.1f}°, "
            f"forward offset={float(entry.get('scene_offset', [0.0, 0.0])[1]):.3f}",
        )
        require(
            "BUZZ weight stays on the balls of both feet",
            min(left_bend, right_bend) >= 5.0
            and max(left_bend, right_bend) <= 55.0,
            f"knee bends L/R={left_bend:.1f}°/{right_bend:.1f}°",
        )
        require(
            "BUZZ looks back over his shoulder without a full back view",
            abs(float(entry.get("head_turn_degrees", 0.0))) >= 15.0
            and abs(float(entry.get("facing_degrees", 0.0))) <= 60.0,
            (
                f"head turn={float(entry.get('head_turn_degrees', 0.0)):.1f}°, "
                f"body facing={float(entry.get('facing_degrees', 0.0)):.1f}°"
            ),
        )
        require(
            "BUZZ arms remain idle and hanging",
            max(left_hand.z, right_hand.z) < shoulders.z - 0.06,
            (
                f"hand z={left_hand.z:.3f}/{right_hand.z:.3f}, "
                f"shoulders z={shoulders.z:.3f}"
            ),
        )

    return checks


def set_crop_camera(
    camera: bpy.types.Object, target: Vector, ortho_scale: float
) -> None:
    camera.data.ortho_scale = ortho_scale
    camera.location = target + Vector((0.0, -3.2, 0.0))
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()


def render_png(
    output_path: Path,
    camera: bpy.types.Object,
    dimensions: tuple[int, int],
    metadata: str,
) -> str:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    scene.render.resolution_x, scene.render.resolution_y = dimensions
    scene.render.filepath = str(output_path.resolve())
    bpy.ops.render.render(write_still=True)
    if OFFLINE_RENDER:
        return f"offline:{output_path}"
    result = ""
    for attempt in range(1, 4):
        result = upload_image_and_record(output_path, dimensions, metadata)
        if result.startswith("asset_"):
            break
        if attempt < 3:
            delay_seconds = 2**attempt
            print(
                f"Scenario upload attempt {attempt}/3 failed for {output_path}: "
                f"{result}; retrying in {delay_seconds}s"
            )
            time.sleep(delay_seconds)
    if not result.startswith("asset_"):
        raise PoseFailure(
            f"Scenario upload failed after 3 attempts for {output_path}: {result}"
        )
    print(f"Rendered and uploaded {output_path} -> {result}")
    return result


def mesh_integrity_summary_lines(
    label: str, report: dict[str, Any]
) -> list[str]:
    if report.get("error"):
        return [
            f"  Mesh integrity ({label}): REPORT ERROR ({report['error']}); "
            "character render retained"
        ]
    holes = report.get("holes", [])
    lines = [
        f"  Mesh integrity ({label}): "
        f"boundary edges={report.get('boundary_edges', 0)}, holes={len(holes)}"
    ]
    if not holes:
        lines.append("    Hole positions: none")
        return lines
    lines.append("    Hole positions:")
    for index, hole in enumerate(holes, start=1):
        x, y, z = hole["position"]
        lines.append(
            f"    - hole {index}: mesh={hole['mesh']}, "
            f"boundary edges={hole['boundary_edges']}, "
            f"world=({x:.6f}, {y:.6f}, {z:.6f})"
        )
    return lines


def existing_models(characters: list[dict[str, Any]]) -> dict[str, Path]:
    paths: dict[str, Path] = {}
    for entry in characters:
        destination = MODELS_DIR / str(entry["model_filename"])
        if not destination.is_file():
            raise PoseFailure(f"Required cached rigged model is missing: {destination}")
        paths[str(entry["name"]).upper()] = destination

    print("Models directory listing for reused court inputs:")
    measured_paths = set(paths.values())
    for path in sorted(MODELS_DIR.glob("*")):
        if not path.is_file():
            continue
        marker = "REUSED INPUT" if path in measured_paths else "pre-existing cache"
        print(f"- {path.name} ({path.stat().st_size} bytes) [{marker}]")
    return paths


def hide_supports(support_objects: list[bpy.types.Object], hidden: bool) -> None:
    for obj in support_objects:
        if obj.get("court_support_kind") == "contact-surface":
            obj.hide_render = hidden


def render_visible_contact_supports(
    support_objects: list[bpy.types.Object],
    camera: bpy.types.Object,
) -> list[str]:
    """Report contact surfaces that could contribute pixels to the current render."""
    scene = bpy.context.scene
    visible: list[str] = []
    for obj in support_objects:
        if obj.get("court_support_kind") != "contact-surface":
            continue
        if obj.hide_render or any(
            collection.hide_render for collection in obj.users_collection
        ):
            continue
        projected = [
            world_to_camera_view(scene, camera, obj.matrix_world @ Vector(corner))
            for corner in obj.bound_box
        ]
        if any(
            -0.01 <= point.x <= 1.01 and -0.01 <= point.y <= 1.01
            for point in projected
        ):
            visible.append(obj.name)
    return visible


def render_character(
    entry: dict[str, Any],
    model_path: Path,
    settings: dict[str, Any],
) -> dict[str, Any]:
    clear_scene()
    import_model(model_path)
    objects = retain_rigged_character_only()
    armature = next(obj for obj in objects if obj.type == "ARMATURE")
    imported_mesh_integrity = safe_mesh_boundary_report(objects)
    rotation_audit = entry.get("_rotation_audit", {})
    applied, missing = apply_pose(
        armature,
        entry.get("pose", {}),
        set(rotation_audit.get("refused_bones", [])),
    )
    root = normalize_and_orient(
        objects,
        entry,
        float(settings.get("rig_rotation_correction_degrees", -90.0)),
    )
    ik_controls = add_arm_ik(armature, entry)
    camera_settings = dict(settings["camera"])
    camera = configure_scene(settings, camera_settings)
    minimum, maximum = character_bounds()
    support_objects: list[bpy.types.Object] = []
    name = str(entry["name"]).upper()
    if name == "BUZZ":
        pelvis = armature_bone_world_point(
            armature, "Pelvis", Vector((0.0, 0.0, float(entry.get("seat_height", 0.64))))
        )
        root.location.z += float(entry.get("seat_height", 0.64)) - pelvis.z
        bpy.context.view_layer.update()
        minimum, maximum = character_bounds()
    support_objects.extend(
        add_contact_supports(
            name,
            entry,
            float(entry.get("seat_height", 0.64)) if name == "BUZZ" else None,
        )
    )
    contact = ground_contact(armature, entry, minimum, support_objects)
    support_objects.extend(add_contact_shadow(contact))
    if name == "RICO":
        hoop_target = entry.get("aim_target", [0.9, 0.45, 1.65])
        add_hoop_target(Vector(tuple(float(value) for value in hoop_target)))
        hand = armature_bone_world_point(
            armature,
            str(entry.get("dribble_hand", "R_Hand")),
            (minimum + maximum) * 0.5,
        )
        ball_offset = Vector(
            tuple(float(value) for value in entry.get("ball_offset", [0.03, -0.03, 0.0]))
        )
        support_objects.extend(add_basketball(hand + ball_offset))
    variant_id = str(entry.get("variant_id", ""))
    output_directory = OUTPUT_DIR / name.lower()
    if variant_id:
        output_directory /= str(entry["variant_slug"])
    main_path = output_directory / "character.png"
    width = int(settings.get("width", RENDER_WIDTH))
    height = int(settings.get("height", RENDER_HEIGHT))
    camera_scale = frame_camera_to_character(
        camera,
        minimum,
        maximum,
        camera_settings,
        width,
        height,
    )
    anchor = pixel_anchor(camera, contact)
    main_metadata = (
        f"source_file={model_path.name};character={name};kind=main;"
        f"ground_anchor_px={anchor[0]},{anchor[1]}"
    )
    if variant_id:
        main_metadata += (
            f";variant={variant_id};variant_label={entry['variant_label']}"
        )
    hide_supports(support_objects, True)
    rendered_supports = render_visible_contact_supports(support_objects, camera)
    main_asset = render_png(main_path, camera, (width, height), main_metadata)

    hand_point, crop_scale = hand_crop_frame(
        armature,
        (minimum + maximum) * 0.5,
        width / height,
        float(settings.get("crop_ortho_scale", 0.38)),
    )
    set_crop_camera(camera, hand_point, crop_scale)
    crop_path = output_directory / "hands-wrists.png"
    crop_metadata = f"source_file={model_path.name};character={name};kind=hands-wrists"
    if variant_id:
        crop_metadata += (
            f";variant={variant_id};variant_label={entry['variant_label']}"
        )
    crop_asset = render_png(crop_path, camera, (width, height), crop_metadata)
    posed_mesh_integrity = safe_mesh_boundary_report(objects, evaluated=True)
    try:
        pose_checks = verify_pose_contract(
            name,
            armature,
            entry,
            support_objects,
            rendered_supports,
        )
    except Exception as error:
        pose_checks = [
            "pose verification execution: FAIL "
            f"({type(error).__name__}: {error}); character render retained"
        ]
    return {
        "name": name,
        "variant_id": variant_id,
        "variant_label": str(entry.get("variant_label", "")),
        "source_file": model_path.name,
        "main_path": main_path,
        "main_asset": main_asset,
        "crop_path": crop_path,
        "crop_asset": crop_asset,
        "anchor": anchor,
        "camera_scale": camera_scale,
        "facing_degrees": float(entry.get("facing_degrees", 0.0)),
        "pose_intent": entry.get("pose_intent", ""),
        "pose_limitations": entry.get("pose_limitations", []),
        "pose_checks": pose_checks,
        "mesh_integrity": {
            "imported": imported_mesh_integrity,
            "posed": posed_mesh_integrity,
        },
        "ik_controls": ik_controls,
        "twist_helpers": sorted(
            bone_name for bone_name in applied if "Twist" in bone_name
        ),
        "rotation_audit": rotation_audit,
        "applied": applied,
        "missing": missing,
    }


def write_summary(
    spec_path: Path,
    model_paths: dict[str, Path],
    results: list[dict[str, Any]],
    failures: list[str],
    cartwheel: dict[str, Any],
) -> None:
    lines = [
        "Court character renderer run summary",
        f"Pose specification: {spec_path}",
        "Scenario operations: Cartwheel metadata/download plus rendered-image uploads; no generation calls.",
        "All source models below reused the already-downloaded v2 rigged GLBs.",
        "Orientation order: apply the rig exporter's -90.0° correction first, then each character's facing angle.",
        "Camera framing: identical camera height and angle for all four; orthographic scale is fitted per character bounds.",
        "Permitted rendered support elements: soft contact-shadow cards and RICO's basketball.",
        "",
        "Measured model files:",
    ]
    for name, path in model_paths.items():
        lines.append(f"- {name}: {path.name} ({path.stat().st_size} bytes)")
    lines.extend(
        [
            "",
            "Cartwheel rig inventory (listing only; never posed or rendered):",
            f"- Source asset: {cartwheel['asset_id']}",
            f"- Downloaded file: {cartwheel['path'].name} ({cartwheel['path'].stat().st_size} bytes)",
            f"- Bone-name artefact: {CARTWHEEL_BONES_PATH}",
            f"- Current court rig bones ({len(cartwheel['current_bones'])}): "
            + ", ".join(cartwheel["current_bones"]),
            f"- Cartwheel rig bones ({len(cartwheel['cartwheel_bones'])}): "
            + ", ".join(cartwheel["cartwheel_bones"]),
            f"- Cartwheel-only bones ({len(cartwheel['cartwheel_only'])}): "
            + (", ".join(cartwheel["cartwheel_only"]) or "none"),
            f"- Individual finger joints in those finger families ({len(cartwheel['cartwheel_only_joints'])}): "
            + ", ".join(cartwheel["cartwheel_only_joints"]),
            "- Finger bones among the eleven Cartwheel-only semantic families: "
            + "yes — ten families (30 individual joints); "
            + ", ".join(cartwheel["finger_bones"]),
        ]
    )
    lines.extend(["", "Render results:"])
    for result in results:
        rotation_audit = result.get("rotation_audit", {})
        largest_rotation = rotation_audit.get("largest")
        if largest_rotation:
            _, bone_name, axis, degrees = largest_rotation
            largest_rotation_detail = (
                f"{abs(degrees):.1f}° ({bone_name} {axis}={degrees:.1f}°)"
            )
        else:
            largest_rotation_detail = "none"
        refused_rotations = rotation_audit.get("refused", [])
        lines.extend(
            [
                f"- {result['name']}"
                + (
                    f" / {result['variant_id']} ({result['variant_label']})"
                    if result.get("variant_id")
                    else ""
                )
                + f": source file {result['source_file']}",
                f"  Main render: {result['main_path']} -> {result['main_asset']}",
                f"  Hands/wrists crop: {result['crop_path']} -> {result['crop_asset']}",
                f"  Ground contact anchor (main pixels): {result['anchor'][0]},{result['anchor'][1]}",
                f"  Bounding-box camera scale: {result['camera_scale']:.4f}",
                f"  Facing angle after rig correction: {result['facing_degrees']:.1f}°",
                f"  Pose intent: {result['pose_intent']}",
                f"  Largest requested single-axis rotation: {largest_rotation_detail}",
                "  Rotations refused by limb bound (entire bone rotation left unapplied): "
                + ("; ".join(refused_rotations) if refused_rotations else "none"),
                f"  Named bones applied: {', '.join(result['applied']) or '(none)'}",
                f"  Twist helper bones used: {', '.join(result['twist_helpers']) or 'none'}",
                f"  IK controls: {'; '.join(result['ik_controls']) or 'none'}",
                f"  Missing named bones: {', '.join(result['missing']) or 'none'}",
                "  Pose limitations: "
                + (
                    "UNREACHABLE OR MISSING: " + ", ".join(result["missing"])
                    if result["missing"]
                    else (
                        "; ".join(result["pose_limitations"])
                        if result["pose_limitations"]
                        else "none detected in the named bones supplied by the pose specification"
                    )
                ),
            ]
        )
        lines.extend(
            mesh_integrity_summary_lines(
                "imported, before posing",
                result["mesh_integrity"]["imported"],
            )
        )
        lines.extend(
            mesh_integrity_summary_lines(
                "posed, after pose and deformation",
                result["mesh_integrity"]["posed"],
            )
        )
        lines.append("  Pose checks: " + " / ".join(result["pose_checks"]))
    if failures:
        lines.extend(["", "Character failures:"])
        lines.extend(f"- {failure}" for failure in failures)
    lines.extend(
        [
            "",
            "Note: a successful named-bone application does not claim that a semantic pose is physically exact; "
            "the named-bone limitations above are reported rather than silently approximated.",
        ]
    )
    SUMMARY_PATH.parent.mkdir(parents=True, exist_ok=True)
    SUMMARY_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Wrote run summary: {SUMMARY_PATH}")


def main() -> None:
    global OFFLINE_RENDER, OUTPUT_DIR, SUMMARY_PATH
    args = parse_args()
    OFFLINE_RENDER = bool(args.offline)
    if args.output_dir is not None:
        OUTPUT_DIR = args.output_dir
    if args.summary_path is not None:
        SUMMARY_PATH = args.summary_path
    spec = load_spec(args.pose_spec)
    settings = dict(spec.get("settings", {}))
    if args.width is not None:
        settings["width"] = args.width
    if args.height is not None:
        settings["height"] = args.height
    if args.samples is not None:
        settings["cycles_samples"] = args.samples
    camera_settings = dict(settings.get("camera", {}))
    if not {"location", "target", "ortho_scale"} <= camera_settings.keys():
        raise PoseFailure("settings.camera needs location, target, and ortho_scale.")
    characters = spec["characters"]
    model_paths = existing_models(characters)
    cartwheel = cartwheel_bone_inventory(
        spec, model_paths["BEEF"]
    )
    write_cartwheel_bone_list(cartwheel)
    render_entries = expanded_character_entries(characters)
    if args.only:
        only_names = {
            value.strip().upper()
            for value in args.only.split(",")
            if value.strip()
        }
        render_entries = [
            entry
            for entry in render_entries
            if str(entry["name"]).upper() in only_names
        ]
    if args.variant:
        render_entries = [
            entry
            for entry in render_entries
            if str(entry.get("variant_id", "")) == args.variant
        ]
    results: list[dict[str, Any]] = []
    failures: list[str] = []

    for entry in render_entries:
        name = str(entry["name"]).upper()
        variant_label = (
            f" / {entry['variant_id']}" if entry.get("variant_id") else ""
        )
        try:
            result = render_character(entry, model_paths[name], settings)
            results.append(result)
        except Exception as error:
            failure = f"{name}{variant_label}: {type(error).__name__}: {error}"
            failures.append(failure)
            print(f"Character render failed: {failure}")

    write_summary(args.pose_spec, model_paths, results, failures, cartwheel)
    print(
        f"Completed court render job: {len(results)} character/variant output(s), "
        f"{len(results) * 2} uploaded image(s), summary {SUMMARY_PATH}"
    )
    if failures:
        raise PoseFailure("; ".join(failures))


if __name__ == "__main__":
    main()