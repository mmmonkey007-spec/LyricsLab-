"""Measure and render conservatively detected flat albedo regions.

This Blender-only diagnostic downloads BUZZ and CHILL fresh, samples only atlas
areas referenced by their mesh UVs, finds connected near-uniform regions, maps
significant regions back to body areas, and renders front/back evidence images.
Source GLBs and packed textures are never written or modified on disk.

Run:
    blender -b --python tools/character-renderer/unmapped_texture_job.py
"""

from __future__ import annotations

import hashlib
import math
import sys
from collections import deque
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import bpy
import numpy as np
from mathutils import Vector


SCRIPT_DIR = Path(__file__).resolve().parent
MODELS_DIR = SCRIPT_DIR / "models"
OUTPUT_DIR = SCRIPT_DIR / "renders" / "unmapped-texture-diagnostic"
REPORT_PATH = SCRIPT_DIR / "probe" / "unmapped-report.txt"
ANALYSIS_SIZE = 512
FLAT_NEIGHBOR_TOLERANCE = 0.018
MAX_REGION_STDDEV = 0.014
MIN_REGION_TEXELS = 48

TARGETS = {
    "BUZZ": {
        "asset_id": "asset_BsNceokZCmvnTr9m76CWHBDB",
        "filename": "unmapped-buzz-fresh-probe.glb",
    },
    "CHILL": {
        "asset_id": "asset_6HNbTLLYWmRLB7AtmFdvfQt2",
        "filename": "unmapped-chill-fresh-probe.glb",
    },
}

sys.path.insert(0, str(SCRIPT_DIR))
from diagnostic_jobs import download_asset  # noqa: E402
from render_character import (  # noqa: E402
    clear_scene,
    configure_scene,
    import_model,
    model_bounds,
    position_full_body_camera,
    upload_image_and_record,
)


@dataclass
class Region:
    label: int
    texels: int
    source_equivalent_texels: int
    mean_rgb: tuple[float, float, float]
    stddev: float
    body_location: str = "no contributing triangle centroids found"
    contributing_triangles: int = 0


@dataclass
class MeshAnalysis:
    mesh_name: str
    atlas_name: str
    atlas_width: int
    atlas_height: int
    used_texels: int
    source_equivalent_used_texels: int
    flat_texels: int
    source_equivalent_flat_texels: int
    flat_percentage: float
    regions: list[Region]
    mask: np.ndarray


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def purge_unused_data() -> None:
    clear_scene()
    for datablocks in (bpy.data.meshes, bpy.data.images, bpy.data.armatures):
        for datablock in list(datablocks):
            if datablock.users == 0:
                datablocks.remove(datablock)


def base_color_image(material: bpy.types.Material) -> bpy.types.Image:
    if not material or not material.use_nodes:
        raise RuntimeError("Mesh material has no node tree.")
    principled = next(
        (node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED"),
        None,
    )
    if principled is None:
        raise RuntimeError(f"Material {material.name} has no Principled BSDF.")
    base_input = principled.inputs.get("Base Color")
    if base_input and base_input.is_linked:
        source = base_input.links[0].from_node
        if source.type == "TEX_IMAGE" and source.image:
            return source.image
    candidates = [
        node.image
        for node in material.node_tree.nodes
        if node.type == "TEX_IMAGE"
        and node.image
        and "base" in f"{node.name} {node.image.name}".lower()
    ]
    if not candidates:
        raise RuntimeError(f"Material {material.name} has no base-color image.")
    return candidates[0]


def image_pixels_at_analysis_size(image: bpy.types.Image) -> np.ndarray:
    copy = image.copy()
    copy.name = f"{image.name}_FlatFillAnalysis"
    try:
        copy.scale(ANALYSIS_SIZE, ANALYSIS_SIZE)
        pixels = np.empty(ANALYSIS_SIZE * ANALYSIS_SIZE * 4, dtype=np.float32)
        copy.pixels.foreach_get(pixels)
        return pixels.reshape((ANALYSIS_SIZE, ANALYSIS_SIZE, 4))
    finally:
        bpy.data.images.remove(copy)


def triangle_uvs(mesh: bpy.types.Mesh) -> np.ndarray:
    if not mesh.uv_layers.active:
        raise RuntimeError(f"Mesh {mesh.name} has no active UV layer.")
    loop_totals = np.empty(len(mesh.polygons), dtype=np.int32)
    mesh.polygons.foreach_get("loop_total", loop_totals)
    if not np.all(loop_totals == 3):
        raise RuntimeError(
            f"Mesh {mesh.name} contains non-triangle polygons; diagnostic requires triangulated GLBs."
        )
    uv_values = np.empty(len(mesh.loops) * 2, dtype=np.float32)
    mesh.uv_layers.active.data.foreach_get("uv", uv_values)
    return uv_values.reshape((-1, 3, 2))


def mark_uv_samples(mask: np.ndarray, samples: np.ndarray) -> None:
    wrapped = np.mod(samples, 1.0)
    x = np.clip((wrapped[:, 0] * ANALYSIS_SIZE).astype(np.int32), 0, ANALYSIS_SIZE - 1)
    y = np.clip((wrapped[:, 1] * ANALYSIS_SIZE).astype(np.int32), 0, ANALYSIS_SIZE - 1)
    mask[y, x] = True


def used_atlas_mask(triangles: np.ndarray) -> np.ndarray:
    mask = np.zeros((ANALYSIS_SIZE, ANALYSIS_SIZE), dtype=bool)
    for corner in range(3):
        mark_uv_samples(mask, triangles[:, corner, :])
    mark_uv_samples(mask, triangles.mean(axis=1))
    mark_uv_samples(mask, (triangles[:, 0, :] + triangles[:, 1, :]) * 0.5)
    mark_uv_samples(mask, (triangles[:, 1, :] + triangles[:, 2, :]) * 0.5)
    mark_uv_samples(mask, (triangles[:, 2, :] + triangles[:, 0, :]) * 0.5)
    return mask


def flat_candidate_mask(pixels: np.ndarray, used: np.ndarray) -> np.ndarray:
    rgb = pixels[:, :, :3]
    local_difference = np.zeros(used.shape, dtype=np.float32)
    for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
        shifted = np.roll(rgb, (dy, dx), axis=(0, 1))
        difference = np.max(np.abs(rgb - shifted), axis=2)
        local_difference = np.maximum(local_difference, difference)
    flat = (
        used
        & (pixels[:, :, 3] >= 0.99)
        & (local_difference <= FLAT_NEIGHBOR_TOLERANCE)
    )
    flat[[0, -1], :] = False
    flat[:, [0, -1]] = False
    return flat


def connected_regions(
    flat: np.ndarray, pixels: np.ndarray, used_texels: int, atlas_scale: float
) -> tuple[np.ndarray, list[Region]]:
    labels = np.zeros(flat.shape, dtype=np.int32)
    regions: list[Region] = []
    next_label = 1
    minimum = max(MIN_REGION_TEXELS, round(used_texels * 0.00025))
    height, width = flat.shape
    for start_y, start_x in np.argwhere(flat):
        if labels[start_y, start_x]:
            continue
        queue = deque([(int(start_y), int(start_x))])
        labels[start_y, start_x] = -1
        coordinates: list[tuple[int, int]] = []
        while queue:
            y, x = queue.popleft()
            coordinates.append((y, x))
            for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                if 0 <= ny < height and 0 <= nx < width and flat[ny, nx] and labels[ny, nx] == 0:
                    labels[ny, nx] = -1
                    queue.append((ny, nx))
        if len(coordinates) < minimum:
            continue
        ys = np.fromiter((item[0] for item in coordinates), dtype=np.int32)
        xs = np.fromiter((item[1] for item in coordinates), dtype=np.int32)
        colors = pixels[ys, xs, :3]
        stddev = float(np.max(np.std(colors, axis=0)))
        if stddev > MAX_REGION_STDDEV:
            continue
        labels[ys, xs] = next_label
        mean = np.mean(colors, axis=0)
        regions.append(
            Region(
                label=next_label,
                texels=len(coordinates),
                source_equivalent_texels=round(len(coordinates) * atlas_scale),
                mean_rgb=(float(mean[0]), float(mean[1]), float(mean[2])),
                stddev=stddev,
            )
        )
        next_label += 1
    labels[labels < 0] = 0
    return labels, regions


def body_description(
    points: np.ndarray, minimum: Vector, maximum: Vector
) -> str:
    center = (minimum + maximum) * 0.5
    height = max(maximum.z - minimum.z, 1e-6)
    width = max(maximum.x - minimum.x, 1e-6)
    depth = max(maximum.y - minimum.y, 1e-6)
    median = np.median(points, axis=0)
    normalized_height = (median[2] - minimum.z) / height
    if normalized_height < 0.14:
        vertical = "feet and ankles"
    elif normalized_height < 0.42:
        vertical = "lower body and legs"
    elif normalized_height < 0.64:
        vertical = "hips and lower torso"
    elif normalized_height < 0.82:
        vertical = "upper torso and arms"
    else:
        vertical = "head, neck, or hair"
    if median[0] < center.x - width * 0.12:
        side = "character-left"
    elif median[0] > center.x + width * 0.12:
        side = "character-right"
    else:
        side = "center"
    if median[1] < center.y - depth * 0.12:
        facing = "front"
    elif median[1] > center.y + depth * 0.12:
        facing = "back"
    else:
        facing = "side/center"
    return f"{facing} {side} {vertical}"


def localize_regions(
    obj: bpy.types.Object,
    triangles: np.ndarray,
    labels: np.ndarray,
    regions: list[Region],
    minimum: Vector,
    maximum: Vector,
) -> None:
    centroid_uv = np.mod(triangles.mean(axis=1), 1.0)
    x = np.clip((centroid_uv[:, 0] * ANALYSIS_SIZE).astype(np.int32), 0, ANALYSIS_SIZE - 1)
    y = np.clip((centroid_uv[:, 1] * ANALYSIS_SIZE).astype(np.int32), 0, ANALYSIS_SIZE - 1)
    triangle_labels = labels[y, x]
    loop_vertices = np.empty(len(obj.data.loops), dtype=np.int32)
    obj.data.loops.foreach_get("vertex_index", loop_vertices)
    loop_vertices = loop_vertices.reshape((-1, 3))
    coordinates = np.empty(len(obj.data.vertices) * 3, dtype=np.float32)
    obj.data.vertices.foreach_get("co", coordinates)
    coordinates = coordinates.reshape((-1, 3))
    matrix = np.array(obj.matrix_world, dtype=np.float64)
    for region in regions:
        indexes = np.flatnonzero(triangle_labels == region.label)
        region.contributing_triangles = int(len(indexes))
        if not len(indexes):
            continue
        if len(indexes) > 10000:
            indexes = indexes[np.linspace(0, len(indexes) - 1, 10000, dtype=np.int64)]
        centers = coordinates[loop_vertices[indexes]].mean(axis=1)
        homogeneous = np.concatenate(
            (centers.astype(np.float64), np.ones((len(centers), 1))), axis=1
        )
        world = (homogeneous @ matrix.T)[:, :3]
        region.body_location = body_description(world, minimum, maximum)


def add_diagnostic_overlay(material: bpy.types.Material, mask: np.ndarray) -> None:
    principled = next(
        node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED"
    )
    base_input = principled.inputs["Base Color"]
    existing_link = base_input.links[0] if base_input.is_linked else None
    original_socket = existing_link.from_socket if existing_link else None
    if existing_link:
        material.node_tree.links.remove(existing_link)
    mask_image = bpy.data.images.new(
        f"{material.name}_UnmappedMask",
        width=ANALYSIS_SIZE,
        height=ANALYSIS_SIZE,
        alpha=True,
        float_buffer=False,
    )
    rgba = np.zeros((ANALYSIS_SIZE, ANALYSIS_SIZE, 4), dtype=np.float32)
    rgba[:, :, :3] = mask[:, :, None].astype(np.float32)
    rgba[:, :, 3] = 1.0
    mask_image.pixels.foreach_set(rgba.ravel())
    mask_image.pack()

    nodes = material.node_tree.nodes
    links = material.node_tree.links
    mask_node = nodes.new("ShaderNodeTexImage")
    mask_node.name = "UnmappedDiagnosticMask"
    mask_node.image = mask_image
    mask_node.interpolation = "Closest"
    mask_node.extension = "REPEAT"
    mix = nodes.new("ShaderNodeMixRGB")
    mix.name = "UnmappedDiagnosticOverlay"
    mix.blend_type = "MIX"
    mix.inputs[2].default_value = (1.0, 0.0, 0.85, 1.0)
    links.new(mask_node.outputs["Color"], mix.inputs[0])
    if original_socket:
        links.new(original_socket, mix.inputs[1])
    else:
        mix.inputs[1].default_value = tuple(base_input.default_value)
    links.new(mix.outputs["Color"], base_input)


def analyze_mesh(obj: bpy.types.Object) -> MeshAnalysis:
    if len(obj.material_slots) != 1 or not obj.material_slots[0].material:
        raise RuntimeError(
            f"Mesh {obj.name} has {len(obj.material_slots)} material slots; "
            "this diagnostic currently requires one albedo atlas per mesh."
        )
    material = obj.material_slots[0].material
    image = base_color_image(material)
    atlas_width, atlas_height = map(int, image.size[:])
    triangles = triangle_uvs(obj.data)
    used = used_atlas_mask(triangles)
    pixels = image_pixels_at_analysis_size(image)
    flat = flat_candidate_mask(pixels, used)
    atlas_scale = (atlas_width * atlas_height) / float(ANALYSIS_SIZE**2)
    labels, regions = connected_regions(
        flat, pixels, int(np.count_nonzero(used)), atlas_scale
    )
    minimum, maximum = model_bounds()
    localize_regions(obj, triangles, labels, regions, minimum, maximum)
    significant_mask = labels > 0
    flat_texels = int(np.count_nonzero(significant_mask))
    used_texels = int(np.count_nonzero(used))
    add_diagnostic_overlay(material, significant_mask)
    return MeshAnalysis(
        mesh_name=obj.name,
        atlas_name=image.name,
        atlas_width=atlas_width,
        atlas_height=atlas_height,
        used_texels=used_texels,
        source_equivalent_used_texels=round(used_texels * atlas_scale),
        flat_texels=flat_texels,
        source_equivalent_flat_texels=round(flat_texels * atlas_scale),
        flat_percentage=(flat_texels / used_texels * 100.0) if used_texels else 0.0,
        regions=sorted(regions, key=lambda region: region.texels, reverse=True),
        mask=significant_mask,
    )


def render_views(character: str, source: dict[str, str]) -> list[tuple[str, Path, str]]:
    minimum, maximum = model_bounds()
    camera = configure_scene(minimum, maximum, 1024, 1536)
    bpy.context.scene.cycles.samples = 16
    outputs: list[tuple[str, Path, str]] = []
    output_directory = OUTPUT_DIR / character.lower()
    output_directory.mkdir(parents=True, exist_ok=True)
    for view, degrees in (("front", 0.0), ("back", 180.0)):
        position_full_body_camera(camera, minimum, maximum, degrees)
        output_path = output_directory / f"{view}-marked.png"
        bpy.context.scene.render.filepath = str(output_path.resolve())
        bpy.ops.render.render(write_still=True)
        metadata = (
            f"diagnostic=unmapped-texture;character={character};view={view};"
            f"source_asset={source['asset_id']};source_file={source['filename']}"
        )
        asset_id = upload_image_and_record(output_path, (1024, 1536), metadata)
        if not asset_id.startswith("asset_"):
            raise RuntimeError(f"Scenario upload failed for {output_path}: {asset_id}")
        outputs.append((view, output_path, asset_id))
    return outputs


def analyze_character(
    character: str, source: dict[str, str], model_path: Path
) -> dict[str, Any]:
    before_hash = sha256(model_path)
    purge_unused_data()
    import_model(model_path)
    mesh_objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if not mesh_objects:
        raise RuntimeError(f"{character} contains no mesh objects.")
    analyses = [analyze_mesh(obj) for obj in mesh_objects]
    uploads = render_views(character, source)
    after_hash = sha256(model_path)
    if before_hash != after_hash:
        raise RuntimeError(f"Source GLB changed during diagnostic: {model_path}")
    return {
        "character": character,
        "source": source,
        "path": model_path,
        "sha256": before_hash,
        "analyses": analyses,
        "uploads": uploads,
    }


def write_report(results: list[dict[str, Any]]) -> None:
    lines = [
        "Unmapped texture diagnostic report",
        "",
        "Purpose: measure conservative connected regions of near-uniform base-color albedo that are actually referenced by mesh UVs.",
        "This is a read-only diagnostic. Source GLBs and texture files were not rewritten, repaired, repainted, filled, re-UVed, or exported.",
        f"Analysis grid: {ANALYSIS_SIZE}x{ANALYSIS_SIZE} texels per atlas.",
        "Used-atlas sampling: triangle UV vertices, three edge midpoints, and triangle centroids.",
        f"Flat-neighbor tolerance: maximum linear RGB neighbor delta <= {FLAT_NEIGHBOR_TOLERANCE:.3f}.",
        f"Connected-region acceptance: 4-connected, at least {MIN_REGION_TEXELS} analysis texels (or 0.025% of used area), max channel standard deviation <= {MAX_REGION_STDDEV:.3f}.",
        "Absolute source-equivalent areas scale each analysis texel by native atlas area / analysis-grid area.",
        "",
    ]
    for result in results:
        source = result["source"]
        lines.extend(
            [
                f"{result['character']}",
                f"  Scenario source asset: {source['asset_id']}",
                f"  Fresh diagnostic source file: {source['filename']}",
                f"  Source path: {result['path']}",
                f"  Source SHA-256 before/after: {result['sha256']} (unchanged)",
            ]
        )
        for analysis in result["analyses"]:
            largest = ", ".join(
                f"{region.texels} analysis / {region.source_equivalent_texels} source-equivalent"
                for region in analysis.regions[:8]
            ) or "none"
            lines.extend(
                [
                    f"  Mesh: {analysis.mesh_name}",
                    f"    Base-color atlas: {analysis.atlas_name} ({analysis.atlas_width}x{analysis.atlas_height})",
                    f"    Used texture area: {analysis.used_texels} analysis texels; {analysis.source_equivalent_used_texels} source-equivalent texels",
                    f"    Absolute significant flat-fill area: {analysis.flat_texels} analysis texels; {analysis.source_equivalent_flat_texels} source-equivalent texels",
                    f"    Flat-fill percentage of used area: {analysis.flat_percentage:.3f}%",
                    f"    Connected significant-region count: {len(analysis.regions)}",
                    f"    Largest region sizes: {largest}",
                ]
            )
            for index, region in enumerate(analysis.regions, 1):
                lines.append(
                    f"    Region {index}: {region.texels} analysis texels; "
                    f"{region.source_equivalent_texels} source-equivalent; "
                    f"mean RGB=({region.mean_rgb[0]:.4f},{region.mean_rgb[1]:.4f},{region.mean_rgb[2]:.4f}); "
                    f"stddev={region.stddev:.5f}; contributing triangles={region.contributing_triangles}; "
                    f"ordinary-language location={region.body_location}"
                )
        lines.append("  Marked evidence renders:")
        for view, path, asset_id in result["uploads"]:
            lines.append(f"    {view}: {path} -> {asset_id}")
        lines.append("")
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    temporary = REPORT_PATH.with_suffix(".txt.tmp")
    temporary.write_text("\n".join(lines) + "\n", encoding="utf-8")
    temporary.replace(REPORT_PATH)
    print(f"Wrote report: {REPORT_PATH}")


def main() -> None:
    model_paths: dict[str, Path] = {}
    for character, source in TARGETS.items():
        model_paths[character] = download_asset(
            source["asset_id"], MODELS_DIR / source["filename"]
        )
    print("Models directory listing after fresh unmapped-texture downloads:")
    for path in sorted(MODELS_DIR.glob("*")):
        if path.is_file():
            marker = "FRESH DIAGNOSTIC INPUT" if path in model_paths.values() else "pre-existing"
            print(f"- {path.name} ({path.stat().st_size} bytes) [{marker}]")
    results = [
        analyze_character(character, TARGETS[character], model_paths[character])
        for character in ("BUZZ", "CHILL")
    ]
    write_report(results)
    print(
        f"Completed unmapped texture diagnostic: {len(results)} characters, "
        f"{sum(len(result['uploads']) for result in results)} uploaded images."
    )


if __name__ == "__main__":
    main()