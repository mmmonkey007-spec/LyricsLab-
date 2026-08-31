"""Run offline armature and full-resolution character diagnostics.

This companion utility intentionally lives outside the mobile app. It uses the
existing render_character helpers for Blender setup and renders, but keeps the
diagnostic outputs separate from the established character folders.

Run with Blender:

    blender -b --python tools/character-renderer/diagnostic_jobs.py

The utility downloads requested Scenario assets by ID using the existing
SCENARIO_API_KEY and SCENARIO_API_SECRET environment secrets. It performs asset
metadata/download requests and uploads the diagnostic PNGs to Scenario. It does
not call any Scenario generation endpoint.
"""

from __future__ import annotations

import base64
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
import traceback
import urllib.error
import urllib.request
from pathlib import Path
from typing import Iterable

import bpy
from mathutils import Vector

SCRIPT_DIR = Path(__file__).resolve().parent
WORKSPACE_ROOT = SCRIPT_DIR.parents[1]
MODELS_DIR = SCRIPT_DIR / "models"
PROBE_DIR = SCRIPT_DIR / "probe"
INSPECTION_DIR = SCRIPT_DIR / "renders" / "inspection"

RENDER_WIDTH = 1024
RENDER_HEIGHT = 1536
ANIMATED_INSPECTION_FRAMES = (1, 93, 185, 277, 369)

ASSETS = {
    "chill-rigged-probe": {
        "id": "asset_CPsATAYkY8hgWA3WTmAegGLM",
        "filename": "chill-rigged-probe.glb",
    },
    "chill-still-inspection": {
        "id": "asset_6HNbTLLYWmRLB7AtmFdvfQt2",
        "filename": "chill-still-inspection.glb",
    },
    "chill-animated-inspection": {
        "id": "asset_irAuZSzXxqoQKJnGtHQn51HA",
        "filename": "chill-animated-inspection.glb",
    },
    "buzz-still-inspection": {
        "id": "asset_BsNceokZCmvnTr9m76CWHBDB",
        "filename": "buzz-still-inspection.glb",
    },
}

sys.path.insert(0, str(SCRIPT_DIR))
from render_character import (  # noqa: E402
    animation_frame_range,
    clear_scene,
    configure_scene,
    import_model,
    model_bounds,
    position_full_body_camera,
    union_bounds,
    upload_image_and_record,
)


def scenario_auth_header() -> str:
    api_key = os.environ.get("SCENARIO_API_KEY")
    api_secret = os.environ.get("SCENARIO_API_SECRET")
    if not api_key or not api_secret:
        raise RuntimeError(
            "SCENARIO_API_KEY and SCENARIO_API_SECRET are required for "
            "asset-ID downloads."
        )
    credentials = base64.b64encode(f"{api_key}:{api_secret}".encode()).decode()
    return f"Basic {credentials}"


def scenario_asset_url(asset_id: str) -> str:
    request = urllib.request.Request(
        f"https://api.cloud.scenario.com/v1/assets/{asset_id}",
        headers={
            "Authorization": scenario_auth_header(),
            "Accept": "application/json",
            "User-Agent": "LyricLab build-time character diagnostics",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            payload = json.load(response)
    except urllib.error.HTTPError as error:
        body = error.read(400).decode("utf-8", "replace")
        raise RuntimeError(
            f"Scenario asset metadata request failed with HTTP {error.code}: {body}"
        ) from error
    except urllib.error.URLError as error:
        raise RuntimeError(f"Scenario asset metadata request failed: {error}") from error

    try:
        url = payload["asset"]["url"]
    except (KeyError, TypeError) as error:
        raise RuntimeError("Scenario asset response did not include asset.url.") from error
    if not isinstance(url, str) or not url.startswith("https://"):
        raise RuntimeError("Scenario asset response contained an invalid download URL.")
    return url


def download_asset(asset_id: str, destination: Path) -> Path:
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = destination.with_suffix(destination.suffix + ".part")
    destination.unlink(missing_ok=True)
    temporary_path.unlink(missing_ok=True)
    print(f"Resolving fresh Scenario asset {asset_id} to {destination.name}")
    signed_url = scenario_asset_url(asset_id)
    request = urllib.request.Request(
        signed_url,
        headers={"User-Agent": "LyricLab build-time character diagnostics"},
    )
    try:
        with urllib.request.urlopen(request, timeout=600) as response:
            with temporary_path.open("wb") as output:
                shutil.copyfileobj(response, output)
        if temporary_path.stat().st_size < 20:
            raise RuntimeError("Downloaded asset is empty or too small to be a GLB.")
        with temporary_path.open("rb") as source:
            if source.read(4) != b"glTF":
                raise RuntimeError("Downloaded asset does not have a valid GLB header.")
        temporary_path.replace(destination)
    except Exception:
        temporary_path.unlink(missing_ok=True)
        raise
    print(f"Downloaded {destination} ({destination.stat().st_size} bytes)")
    return destination


def fresh_downloads() -> dict[str, Path]:
    paths: dict[str, Path] = {}
    for key, spec in ASSETS.items():
        paths[key] = download_asset(
            spec["id"],
            MODELS_DIR / spec["filename"],
        )
    return paths


def crop_image(
    source: Path,
    destination: Path,
    x: int,
    y: int,
    width: int,
    height: int,
    border: int = 24,
) -> Path:
    destination.parent.mkdir(parents=True, exist_ok=True)
    geometry = f"{width}x{height}+{x}+{y}"
    subprocess.run(
        [
            "magick",
            str(source),
            "-crop",
            geometry,
            "+repage",
            "-trim",
            "+repage",
            "-bordercolor",
            "none",
            "-border",
            str(border),
            "+repage",
            str(destination),
        ],
        check=True,
        stdout=subprocess.DEVNULL,
    )
    return destination


def alpha_bounds(image_path: Path) -> tuple[int, int, int, int]:
    output = subprocess.check_output(
        [
            "magick",
            str(image_path),
            "-alpha",
            "extract",
            "-threshold",
            "0",
            "-trim",
            "-format",
            "%wx%h%O",
            "info:",
        ],
        text=True,
    ).strip()
    match = re.fullmatch(r"(\d+)x(\d+)\+(-?\d+)\+(-?\d+)", output)
    if not match:
        raise RuntimeError(f"Could not determine transparent bounds for {image_path}: {output}")
    return tuple(int(value) for value in match.groups())  # type: ignore[return-value]


def render_temp_frames(
    model_path: Path,
    frames: Iterable[int],
    temporary_directory: Path,
) -> dict[int, Path]:
    """Render full-size temporary PNGs with one shared pose envelope."""
    clear_scene()
    import_model(model_path)
    frame_range = animation_frame_range()
    requested = list(frames)
    if frame_range is not None:
        start, end = frame_range
        for frame in requested:
            if frame < start or frame > end:
                raise RuntimeError(
                    f"{model_path.name} does not contain requested frame {frame}; "
                    f"its action range is {start}–{end}."
                )
    sampled_bounds: list[tuple[Vector, Vector]] = []
    for frame in requested:
        bpy.context.scene.frame_set(frame)
        bpy.context.view_layer.update()
        sampled_bounds.append(model_bounds())
    minimum, maximum = union_bounds(sampled_bounds)
    camera = configure_scene(minimum, maximum, RENDER_WIDTH, RENDER_HEIGHT)
    temporary_directory.mkdir(parents=True, exist_ok=True)
    results: dict[int, Path] = {}
    for frame in requested:
        bpy.context.scene.frame_set(frame)
        bpy.context.view_layer.update()
        position_full_body_camera(camera, minimum, maximum, 0)
        output = temporary_directory / f"frame-{frame:03d}.png"
        bpy.context.scene.render.filepath = str(output.resolve())
        bpy.ops.render.render(write_still=True)
        results[frame] = output
    return results


def render_probe_image(
    camera: bpy.types.Object,
    minimum: Vector,
    maximum: Vector,
    output_path: Path,
) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    position_full_body_camera(camera, minimum, maximum, 0)
    bpy.context.scene.render.resolution_x = RENDER_WIDTH
    bpy.context.scene.render.resolution_y = RENDER_HEIGHT
    bpy.context.scene.render.filepath = str(output_path.resolve())
    bpy.ops.render.render(write_still=True)


def choose_arm_bone(armature: bpy.types.Object) -> bpy.types.PoseBone | None:
    candidates: list[tuple[int, bpy.types.PoseBone]] = []
    for pose_bone in armature.pose.bones:
        name = pose_bone.name.lower().replace("-", "_").replace(" ", "_")
        score = 0
        if "upperarm" in name or "upper_arm" in name:
            score += 100
        elif "shoulder" in name:
            score += 90
        elif re.search(r"(^|_)arm($|_)", name):
            score += 80
        if any(token in name for token in ("forearm", "lowerarm", "hand", "finger")):
            score -= 50
        if any(token in name for token in (".l", "_l", "left")):
            score += 10
        if score:
            candidates.append((score, pose_bone))
    return max(candidates, key=lambda item: item[0])[1] if candidates else None


def write_probe_report(
    report_path: Path,
    model_path: Path,
    armatures: list[bpy.types.Object],
    pose_lines: list[str],
) -> None:
    lines = [
        "CHILL armature and direct-pose probe",
        f"Model: {model_path}",
        "",
        f"Armature found: {'yes' if armatures else 'no'}",
        f"Armature object count: {len(armatures)}",
    ]
    if not armatures:
        lines.extend(
            [
                "Bone count: 0",
                "Bones:",
                "(none)",
            ]
        )
    else:
        total = sum(len(armature.data.bones) for armature in armatures)
        lines.append(f"Bone count: {total}")
        lines.append("Bones:")
        for armature in armatures:
            lines.append(f"[Armature: {armature.name}]")
            lines.extend(bone.name for bone in armature.data.bones)
    lines.extend(["", "Pose attempt:"])
    lines.extend(pose_lines)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def run_probe(model_path: Path) -> list[Path]:
    clear_scene()
    import_model(model_path)
    frame_range = animation_frame_range()
    if frame_range is not None:
        bpy.context.scene.frame_set(frame_range[0])
    minimum, maximum = model_bounds()
    camera = configure_scene(minimum, maximum, RENDER_WIDTH, RENDER_HEIGHT)
    control_path = PROBE_DIR / "posed-test-control.png"
    posed_path = PROBE_DIR / "posed-test.png"
    render_probe_image(camera, minimum, maximum, control_path)

    armatures = [
        object_
        for object_ in bpy.context.scene.objects
        if object_.type == "ARMATURE"
    ]
    pose_lines: list[str] = []
    target_bone = choose_arm_bone(armatures[0]) if armatures else None
    if not armatures:
        pose_lines.append("Result: failed — no armature was found.")
    elif target_bone is None:
        pose_lines.append(
            "Result: failed — no clearly identifiable arm or shoulder bone was found."
        )
    else:
        pose_lines.append(f"Armature selected: {armatures[0].name}")
        pose_lines.append(f"Bone selected: {target_bone.name}")
        try:
            target_bone.rotation_mode = "XYZ"
            target_bone.rotation_euler[1] += math.radians(65)
            bpy.context.view_layer.update()
            pose_lines.append("Rotation: local Y increased by 65 degrees.")
            pose_lines.append("Result: success — posed render was produced.")
        except Exception as error:
            pose_lines.append(f"Result: failed — {type(error).__name__}: {error}")
            pose_lines.append("Traceback:")
            pose_lines.extend(traceback.format_exc().rstrip().splitlines())
    render_probe_image(camera, minimum, maximum, posed_path)
    write_probe_report(
        PROBE_DIR / "armature-report.txt",
        model_path,
        armatures,
        pose_lines,
    )
    for image in (control_path, posed_path):
        upload_image_and_record(image, (RENDER_WIDTH, RENDER_HEIGHT))
    return [control_path, posed_path]


def crop_full_body_source(
    source: Path,
    destination_directory: Path,
    prefix: str,
    include: tuple[str, ...] = ("legs", "hands", "face"),
) -> list[Path]:
    body_width, body_height, body_x, body_y = alpha_bounds(source)
    specs = {
        "legs": (0.53, 1.04, 0.03, 0.97),
        "hands": (0.22, 0.62, -0.04, 1.04),
        "face": (-0.02, 0.30, 0.20, 0.80),
    }
    outputs: list[Path] = []
    for kind in include:
        top_ratio, bottom_ratio, left_ratio, right_ratio = specs[kind]
        y = max(0, round(body_y + body_height * top_ratio))
        bottom = min(RENDER_HEIGHT, round(body_y + body_height * bottom_ratio))
        x = max(0, round(body_x + body_width * left_ratio))
        right = min(RENDER_WIDTH, round(body_x + body_width * right_ratio))
        destination = destination_directory / f"{prefix}-{kind}.png"
        crop_image(source, destination, x, y, max(1, right - x), max(1, bottom - y))
        outputs.append(destination)
    return outputs


def run_inspection_crops(model_paths: dict[str, Path]) -> list[Path]:
    outputs: list[Path] = []
    with tempfile.TemporaryDirectory(prefix="lyriclab-character-diagnostics-") as staging:
        staging_path = Path(staging)

        still_jobs = (
            ("chill-still-a-pose", model_paths["chill-still-inspection"]),
            ("buzz-still-a-pose", model_paths["buzz-still-inspection"]),
        )
        for folder_name, model_path in still_jobs:
            temporary = staging_path / folder_name
            source = render_temp_frames(model_path, (1,), temporary)[1]
            folder = INSPECTION_DIR / folder_name
            outputs.extend(crop_full_body_source(source, folder, "full"))

        animated_folder = INSPECTION_DIR / "chill-animated-idle"
        animated_temporary = staging_path / "chill-animated-idle"
        animated_sources = render_temp_frames(
            model_paths["chill-animated-inspection"],
            ANIMATED_INSPECTION_FRAMES,
            animated_temporary,
        )
        for frame, source in animated_sources.items():
            leg_outputs = crop_full_body_source(
                source,
                animated_folder,
                f"frame-{frame:03d}",
                include=("legs",),
            )
            outputs.extend(leg_outputs)
        middle_source = animated_sources[185]
        outputs.extend(
            crop_full_body_source(
                middle_source,
                animated_folder,
                "frame-185",
                include=("hands", "face"),
            )
        )
    for image in outputs:
        upload_image_and_record(image)
    return outputs


def relative_path(path: Path) -> str:
    return str(path.resolve().relative_to(WORKSPACE_ROOT.resolve()))


def write_manifest(
    model_paths: dict[str, Path],
    probe_images: list[Path],
    crop_images: list[Path],
) -> Path:
    lines = [
        "Character renderer diagnostic job manifest",
        "Scenario operations: asset metadata/downloads plus rendered-image uploads; no generation calls.",
        "",
        "Models directory contents after fresh downloads:",
    ]
    for path in sorted(MODELS_DIR.glob("*")):
        if path.is_file():
            lines.append(f"- {relative_path(path)} ({path.stat().st_size} bytes)")
    lines.extend(["", "Probe outputs:"])
    for path in sorted(
        probe_images
        + [
            PROBE_DIR / "armature-report.txt",
            PROBE_DIR / "manifest.txt",
        ]
    ):
        if path.name != "manifest.txt" and path.exists():
            lines.append(f"- {relative_path(path)}")
    lines.extend(["", "Inspection crop outputs:"])
    for path in sorted(crop_images):
        lines.append(f"- {relative_path(path)}")
    lines.extend(
        [
            "",
            "Scenario upload results:",
            f"- {relative_path(PROBE_DIR / 'asset-manifest.txt')}",
        ]
    )
    manifest = PROBE_DIR / "manifest.txt"
    manifest.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return manifest


def main() -> None:
    model_paths = fresh_downloads()
    PROBE_DIR.mkdir(parents=True, exist_ok=True)
    INSPECTION_DIR.mkdir(parents=True, exist_ok=True)
    probe_images = run_probe(model_paths["chill-rigged-probe"])
    crop_images = run_inspection_crops(model_paths)
    manifest = write_manifest(model_paths, probe_images, crop_images)
    print(
        f"Completed diagnostics: {len(probe_images)} probe images, "
        f"{len(crop_images)} inspection crops; manifest {manifest}"
    )


if __name__ == "__main__":
    main()