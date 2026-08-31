"""Render a GLB character into consistent, flat PNG turntable views.

Run with Blender, keeping arguments after the `--` separator:

    blender -b --python tools/character-renderer/render_character.py -- \
      --model-url "https://..." \
      --model-path tools/character-renderer/models/buzz.glb \
      --output-dir tools/character-renderer/renders/buzz

Upload the existing inspection and pose images without rendering:

    blender -b --python tools/character-renderer/render_character.py -- \
      --upload-existing

The URL is only needed the first time. Subsequent runs can use --model-path
without downloading the model again. Add --animation-only for an animated
GLB to render first, middle, and last frames without replacing still renders.
Every rendered PNG is uploaded to Scenario and recorded in the fixed
probe/asset-manifest.txt file.
"""

from __future__ import annotations

import argparse
import base64
import json
import math
import os
import shutil
import sys
import urllib.error
import urllib.request
from pathlib import Path

import bpy
from mathutils import Vector


DEFAULT_ANGLES = "front=0,three-quarter=45,side=90,back=180"
DEFAULT_WIDTH = 1024
DEFAULT_HEIGHT = 1536
DEFAULT_CLOSEUP_WIDTH = 400
DEFAULT_CLOSEUP_HEIGHT = 600
DEFAULT_CLOSEUP_NAME = "dialogue-bust"
DEFAULT_ANIMATION_FRAMES = "first,middle,last"
RENDERER_DIR = Path(__file__).resolve().parent
ASSET_MANIFEST_PATH = RENDERER_DIR / "probe" / "asset-manifest.txt"
SCENARIO_ASSETS_URL = "https://api.cloud.scenario.com/v1/assets"


def parse_args() -> argparse.Namespace:
    argv = sys.argv
    script_args = argv[argv.index("--") + 1 :] if "--" in argv else []

    parser = argparse.ArgumentParser(
        description="Render a GLB model from configurable turntable angles."
    )
    source = parser.add_mutually_exclusive_group()
    source.add_argument("--model-url", help="URL of the GLB to download.")
    source.add_argument("--model-path", type=Path, help="Previously downloaded GLB.")
    parser.add_argument(
        "--upload-existing",
        action="store_true",
        help=(
            "Upload every PNG under renders/inspection plus the two probe "
            "pose renders, without rendering a model."
        ),
    )
    parser.add_argument(
        "--saved-model-path",
        type=Path,
        help="Where to save a downloaded model (defaults to --model-path).",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        help="Directory for rendered PNG files.",
    )
    parser.add_argument("--width", type=int, default=DEFAULT_WIDTH)
    parser.add_argument("--height", type=int, default=DEFAULT_HEIGHT)
    parser.add_argument("--closeup-width", type=int, default=DEFAULT_CLOSEUP_WIDTH)
    parser.add_argument("--closeup-height", type=int, default=DEFAULT_CLOSEUP_HEIGHT)
    parser.add_argument("--closeup-name", default=DEFAULT_CLOSEUP_NAME)
    parser.add_argument(
        "--animation-frames",
        default=DEFAULT_ANIMATION_FRAMES,
        help="Comma-separated samples: first,middle,last or frame numbers.",
    )
    parser.add_argument(
        "--animation-only",
        action="store_true",
        help="Render animation samples without replacing still-model renders.",
    )
    parser.add_argument(
        "--angles",
        default=DEFAULT_ANGLES,
        help="Comma-separated name=degrees entries, e.g. front=0,side=90.",
    )
    args = parser.parse_args(script_args)

    if min(args.width, args.height, args.closeup_width, args.closeup_height) < 1:
        parser.error("All output dimensions must be positive.")
    if args.upload_existing and (args.model_url or args.model_path):
        parser.error("--upload-existing cannot be combined with a model source.")
    if not args.upload_existing:
        if not (args.model_url or args.model_path):
            parser.error("Provide --model-url, --model-path, or --upload-existing.")
        if not args.output_dir:
            parser.error("--output-dir is required when rendering a model.")
    if args.model_url and not args.saved_model_path:
        parser.error("--saved-model-path is required with --model-url.")
    if args.model_path and not args.model_path.is_file():
        parser.error(f"Model file does not exist: {args.model_path}")
    return args


def parse_angles(value: str) -> list[tuple[str, float]]:
    angles: list[tuple[str, float]] = []
    for entry in value.split(","):
        name, separator, degrees = entry.partition("=")
        if not separator or not name.strip():
            raise ValueError(f"Invalid angle entry {entry!r}; expected name=degrees.")
        try:
            angle = float(degrees)
        except ValueError as error:
            raise ValueError(f"Invalid angle value in {entry!r}.") from error
        angles.append((name.strip(), angle))
    if not angles:
        raise ValueError("At least one angle is required.")
    return angles


def download_model(url: str, destination: Path) -> Path:
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = destination.with_suffix(destination.suffix + ".part")
    print(f"Downloading model to {destination}")
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "LyricLab build-time character renderer"},
    )
    try:
        with urllib.request.urlopen(request, timeout=300) as response:
            with temporary_path.open("wb") as output:
                shutil.copyfileobj(response, output)
        if temporary_path.stat().st_size == 0:
            raise RuntimeError("Downloaded model is empty.")
        temporary_path.replace(destination)
    finally:
        temporary_path.unlink(missing_ok=True)
    return destination


def scenario_auth_header() -> str:
    api_key = os.environ.get("SCENARIO_API_KEY")
    api_secret = os.environ.get("SCENARIO_API_SECRET")
    if not api_key or not api_secret:
        raise RuntimeError(
            "SCENARIO_API_KEY and SCENARIO_API_SECRET are required for uploads."
        )
    credentials = base64.b64encode(f"{api_key}:{api_secret}".encode()).decode()
    return f"Basic {credentials}"


def image_dimensions(image_path: Path) -> tuple[int, int]:
    image = bpy.data.images.load(str(image_path.resolve()), check_existing=False)
    try:
        width, height = image.size[:]
        return int(width), int(height)
    finally:
        bpy.data.images.remove(image)


def renderer_relative_path(image_path: Path) -> str:
    return Path(
        os.path.relpath(image_path.resolve(), start=RENDERER_DIR.resolve())
    ).as_posix()


def sanitize_failure_reason(error: Exception) -> str:
    if isinstance(error, urllib.error.HTTPError):
        body = error.read(800).decode("utf-8", "replace")
        detail = f"HTTP {error.code}: {body}"
    else:
        detail = f"{type(error).__name__}: {error}"
    return " ".join(detail.replace("|", "/").split())


def upload_image_to_scenario(image_path: Path) -> str:
    payload = json.dumps(
        {
            "name": image_path.name,
            "image": base64.b64encode(image_path.read_bytes()).decode("ascii"),
        }
    ).encode("utf-8")
    request = urllib.request.Request(
        SCENARIO_ASSETS_URL,
        data=payload,
        method="POST",
        headers={
            "Authorization": scenario_auth_header(),
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "LyricLab build-time character renderer",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=300) as response:
            result = json.load(response)
    except urllib.error.HTTPError:
        raise
    except urllib.error.URLError as error:
        raise RuntimeError(f"Scenario upload request failed: {error}") from error
    try:
        asset_id = result["asset"]["id"]
    except (KeyError, TypeError) as error:
        raise RuntimeError(
            "Scenario upload response did not include asset.id."
        ) from error
    if not isinstance(asset_id, str) or not asset_id.startswith("asset_"):
        raise RuntimeError("Scenario upload returned an invalid asset id.")
    return asset_id


def manifest_records() -> dict[str, str]:
    if not ASSET_MANIFEST_PATH.is_file():
        return {}
    records: dict[str, str] = {}
    for line in ASSET_MANIFEST_PATH.read_text(encoding="utf-8").splitlines():
        relative, separator, _ = line.partition(" | ")
        if separator:
            records[relative] = line
    return records


def record_asset_result(
    image_path: Path,
    width: int,
    height: int,
    result: str,
    metadata: str | None = None,
) -> None:
    relative = renderer_relative_path(image_path)
    records = manifest_records()
    line = f"{relative} | {width}x{height} | {result}"
    if metadata:
        line += f" | {metadata}"
    records[relative] = line
    ASSET_MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = ASSET_MANIFEST_PATH.with_suffix(".txt.tmp")
    temporary_path.write_text(
        "\n".join(records.values()) + "\n",
        encoding="utf-8",
    )
    temporary_path.replace(ASSET_MANIFEST_PATH)


def upload_image_and_record(
    image_path: Path,
    dimensions: tuple[int, int] | None = None,
    manifest_metadata: str | None = None,
) -> str:
    width = height = 0
    try:
        width, height = dimensions or image_dimensions(image_path)
        result = upload_image_to_scenario(image_path)
        print(f"Uploaded {renderer_relative_path(image_path)} as {result}")
    except Exception as error:
        result = f"ERROR: {sanitize_failure_reason(error)}"
        print(f"Upload failed for {renderer_relative_path(image_path)}: {result}")
    record_asset_result(image_path, width, height, result, manifest_metadata)
    return result


def successful_manifest_assets() -> dict[str, str]:
    successes: dict[str, str] = {}
    for relative, line in manifest_records().items():
        for result in line.split(" | ")[2:]:
            if result.startswith("asset_"):
                successes[relative] = result
                break
    return successes


def upload_existing_images() -> list[Path]:
    inspection_paths = sorted(
        path
        for path in (RENDERER_DIR / "renders" / "inspection").glob("*/*.png")
        if path.is_file()
    )
    probe_paths = [
        RENDERER_DIR / "probe" / "posed-test-control.png",
        RENDERER_DIR / "probe" / "posed-test.png",
    ]
    image_paths = inspection_paths + [path for path in probe_paths if path.is_file()]
    if not image_paths:
        raise RuntimeError("No existing inspection or probe PNGs were found.")
    successes = successful_manifest_assets()
    for image_path in image_paths:
        relative = renderer_relative_path(image_path)
        if relative in successes:
            print(f"Already uploaded {relative} as {successes[relative]}")
            continue
        upload_image_and_record(image_path)
    return image_paths


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (
        bpy.data.cameras,
        bpy.data.lights,
        bpy.data.materials,
        bpy.data.worlds,
    ):
        for datablock in list(datablocks):
            if datablock.users == 0:
                datablocks.remove(datablock)


def import_model(model_path: Path) -> None:
    extension = model_path.suffix.lower()
    if extension != ".glb":
        raise ValueError(f"Expected a .glb model, received {model_path.name}.")
    bpy.ops.import_scene.gltf(filepath=str(model_path.resolve()))


def animation_frame_range() -> tuple[int, int] | None:
    actions = [action for action in bpy.data.actions if action.fcurves]
    if not actions:
        return None
    start = min(action.frame_range[0] for action in actions)
    end = max(action.frame_range[1] for action in actions)
    return round(start), round(end)


def resolve_animation_frames(
    value: str, frame_range: tuple[int, int]
) -> list[tuple[str, int]]:
    start, end = frame_range
    midpoint = round((start + end) / 2)
    aliases = {"first": start, "middle": midpoint, "last": end}
    resolved: list[tuple[str, int]] = []
    for token in value.split(","):
        token = token.strip().lower()
        if not token:
            continue
        if token in aliases:
            label, frame = token, aliases[token]
        else:
            try:
                frame = int(token)
            except ValueError as error:
                raise ValueError(
                    f"Invalid animation sample {token!r}; use first, middle, last, or a frame number."
                ) from error
            label = f"sample-{frame}"
        if frame < start or frame > end:
            raise ValueError(
                f"Animation sample {frame} is outside the action range {start}–{end}."
            )
        resolved.append((label, frame))
    if not resolved:
        raise ValueError("At least one animation sample is required.")
    return resolved


def model_bounds() -> tuple[Vector, Vector]:
    mesh_objects = [
        obj
        for obj in bpy.context.scene.objects
        if obj.type == "MESH"
        and not obj.hide_render
        and not any(collection.hide_render for collection in obj.users_collection)
    ]
    if not mesh_objects:
        raise RuntimeError("The GLB did not contain any renderable mesh objects.")

    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    corners: list[Vector] = []
    for obj in mesh_objects:
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        try:
            corners.extend(evaluated.matrix_world @ vertex.co for vertex in mesh.vertices)
        finally:
            evaluated.to_mesh_clear()
    minimum = Vector(
        (
            min(point.x for point in corners),
            min(point.y for point in corners),
            min(point.z for point in corners),
        )
    )
    maximum = Vector(
        (
            max(point.x for point in corners),
            max(point.y for point in corners),
            max(point.z for point in corners),
        )
    )
    if maximum.z <= minimum.z:
        raise RuntimeError("The model has no measurable height.")
    return minimum, maximum


def union_bounds(
    bounds: list[tuple[Vector, Vector]]
) -> tuple[Vector, Vector]:
    if not bounds:
        raise RuntimeError("No model bounds were available.")
    minimum = Vector(
        (
            min(item[0].x for item in bounds),
            min(item[0].y for item in bounds),
            min(item[0].z for item in bounds),
        )
    )
    maximum = Vector(
        (
            max(item[1].x for item in bounds),
            max(item[1].y for item in bounds),
            max(item[1].z for item in bounds),
        )
    )
    return minimum, maximum


def point_light_at(
    name: str, location: tuple[float, float, float], energy: float, size: float, target: Vector
) -> None:
    light_data = bpy.data.lights.new(name=name, type="AREA")
    light_data.energy = energy
    light_data.shape = "DISK"
    light_data.size = size
    light_object = bpy.data.objects.new(name=name, object_data=light_data)
    bpy.context.collection.objects.link(light_object)
    light_object.location = location
    light_object.rotation_euler = (target - light_object.location).to_track_quat(
        "-Z", "Y"
    ).to_euler()


def configure_lighting(target: Vector, height: float) -> None:
    # These lights stay fixed in world space for every camera angle, so each
    # render uses the same lighting rather than changing with the camera.
    point_light_at(
        "Key",
        (3.5, -4.5, target.z + height * 1.2),
        energy=850,
        size=4.0,
        target=target,
    )
    point_light_at(
        "Fill",
        (-4.0, -1.0, target.z + height * 0.8),
        energy=500,
        size=5.0,
        target=target,
    )
    point_light_at(
        "Rim",
        (1.0, 4.5, target.z + height * 1.4),
        energy=700,
        size=3.0,
        target=target,
    )


def configure_scene(
    minimum: Vector, maximum: Vector, width: int, height: int
) -> bpy.types.Object:
    scene = bpy.context.scene
    model_height = maximum.z - minimum.z
    model_width = max(maximum.x - minimum.x, maximum.y - minimum.y)
    target = Vector(
        (
            (minimum.x + maximum.x) * 0.5,
            (minimum.y + maximum.y) * 0.5,
            minimum.z + model_height * 0.52,
        )
    )

    # Cycles on CPU works in headless build environments without an X11,
    # GLX, or EGL context. This keeps the utility independent of a GPU/display.
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 32
    scene.cycles.use_denoising = True
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = True
    scene.render.use_file_extension = True

    camera_data = bpy.data.cameras.new(name="TurntableCamera")
    camera = bpy.data.objects.new(name="TurntableCamera", object_data=camera_data)
    bpy.context.collection.objects.link(camera)
    scene.camera = camera
    camera.data.type = "ORTHO"
    camera.data.clip_start = 0.01
    camera.data.clip_end = max(model_height * 20, 100)

    # Ortho scale is vertical. Account for the portrait aspect ratio so
    # front/side silhouettes get the same generous margin on every render.
    aspect = width / height
    camera.data.ortho_scale = max(model_height, model_width / aspect) * 1.12

    world = bpy.data.worlds.new(name="TransparentWorld")
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.35
    configure_lighting(target, model_height)
    try:
        scene.view_settings.look = "AgX - Medium High Contrast"
    except (TypeError, ValueError):
        pass
    return camera


def position_full_body_camera(
    camera: bpy.types.Object,
    minimum: Vector,
    maximum: Vector,
    degrees: float,
) -> None:
    target_z = minimum.z + (maximum.z - minimum.z) * 0.52
    target = Vector(
        ((minimum.x + maximum.x) * 0.5, (minimum.y + maximum.y) * 0.5, target_z)
    )
    distance = max(
        maximum.x - minimum.x,
        maximum.y - minimum.y,
        maximum.z - minimum.z,
    ) * 4
    radians = math.radians(degrees)
    camera.location = target + Vector(
        (math.sin(radians) * distance, -math.cos(radians) * distance, 0)
    )
    camera.rotation_euler = (target - camera.location).to_track_quat(
        "-Z", "Y"
    ).to_euler()


def render_angles(
    camera: bpy.types.Object,
    minimum: Vector,
    maximum: Vector,
    angles: list[tuple[str, float]],
    output_dir: Path,
) -> list[Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    rendered: list[Path] = []

    for name, degrees in angles:
        # 0° looks toward the model from its -Y/front direction.
        position_full_body_camera(camera, minimum, maximum, degrees)
        output_path = output_dir / f"{name}.png"
        bpy.context.scene.render.filepath = str(output_path.resolve())
        bpy.ops.render.render(write_still=True)
        rendered.append(output_path)
        upload_image_and_record(
            output_path,
            (bpy.context.scene.render.resolution_x, bpy.context.scene.render.resolution_y),
        )
        print(f"Rendered {output_path}")
    return rendered


def render_animation_samples(
    camera: bpy.types.Object,
    minimum: Vector,
    maximum: Vector,
    samples: list[tuple[str, int]],
    output_dir: Path,
    width: int,
    height: int,
) -> list[Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    position_full_body_camera(camera, minimum, maximum, 0)
    rendered: list[Path] = []

    for label, frame in samples:
        scene.frame_set(frame)
        bpy.context.view_layer.update()
        output_path = output_dir / f"animation-{label}-frame-{frame:03d}.png"
        scene.render.filepath = str(output_path.resolve())
        bpy.ops.render.render(write_still=True)
        rendered.append(output_path)
        upload_image_and_record(output_path, (width, height))
        print(f"Rendered frame {frame}: {output_path}")
    return rendered


def render_closeup(
    camera: bpy.types.Object,
    minimum: Vector,
    maximum: Vector,
    output_dir: Path,
    width: int,
    height: int,
    name: str,
) -> Path:
    """Render a front-facing head-and-shoulders dialogue portrait."""
    model_height = maximum.z - minimum.z
    model_center = Vector(
        ((minimum.x + maximum.x) * 0.5, (minimum.y + maximum.y) * 0.5, 0)
    )
    # Center above the torso so the crop includes the full head, shoulders,
    # and a small amount of chest while leaving a little breathing room.
    target = Vector(
        (model_center.x, model_center.y, maximum.z - model_height * 0.19)
    )
    distance = max(maximum.x - minimum.x, maximum.y - minimum.y, model_height) * 4
    camera.location = target + Vector((0, -distance, 0))
    camera.rotation_euler = (target - camera.location).to_track_quat(
        "-Z", "Y"
    ).to_euler()
    camera.data.ortho_scale = model_height * 0.38
    camera.data.clip_end = max(model_height * 20, 100)

    output_path = output_dir / f"{name}.png"
    bpy.context.scene.render.resolution_x = width
    bpy.context.scene.render.resolution_y = height
    bpy.context.scene.render.filepath = str(output_path.resolve())
    bpy.ops.render.render(write_still=True)
    upload_image_and_record(output_path, (width, height))
    print(f"Rendered {output_path}")
    return output_path


def main() -> None:
    args = parse_args()
    if args.upload_existing:
        uploaded = upload_existing_images()
        print(
            f"Processed {len(uploaded)} existing image(s); "
            f"manifest: {ASSET_MANIFEST_PATH}"
        )
        return

    model_path = (
        download_model(args.model_url, args.saved_model_path)
        if args.model_url
        else args.model_path
    )
    assert model_path is not None

    clear_scene()
    import_model(model_path)
    frame_range = animation_frame_range()

    if args.animation_only:
        if frame_range is None:
            raise RuntimeError(
                "--animation-only was requested, but the GLB has no animation actions."
            )
        samples = resolve_animation_frames(args.animation_frames, frame_range)
        sampled_bounds: list[tuple[Vector, Vector]] = []
        for _, frame in samples:
            bpy.context.scene.frame_set(frame)
            sampled_bounds.append(model_bounds())
        minimum, maximum = union_bounds(sampled_bounds)
        camera = configure_scene(minimum, maximum, args.width, args.height)
        rendered = render_animation_samples(
            camera,
            minimum,
            maximum,
            samples,
            args.output_dir,
            args.width,
            args.height,
        )
        frames = ", ".join(str(frame) for _, frame in samples)
        print(
            f"Completed {len(rendered)} animation sample(s) at "
            f"{args.width}x{args.height}; frames: {frames}; output: {args.output_dir}"
        )
        return

    if frame_range is not None:
        bpy.context.scene.frame_set(frame_range[0])
    angles = parse_angles(args.angles)
    minimum, maximum = model_bounds()
    camera = configure_scene(minimum, maximum, args.width, args.height)
    rendered = render_angles(camera, minimum, maximum, angles, args.output_dir)
    rendered.append(
        render_closeup(
            camera,
            minimum,
            maximum,
            args.output_dir,
            args.closeup_width,
            args.closeup_height,
            args.closeup_name,
        )
    )
    print(
        f"Completed {len(rendered)} render(s) at "
        f"{args.width}x{args.height} plus {args.closeup_width}x"
        f"{args.closeup_height} close-up in {args.output_dir}"
    )


if __name__ == "__main__":
    main()