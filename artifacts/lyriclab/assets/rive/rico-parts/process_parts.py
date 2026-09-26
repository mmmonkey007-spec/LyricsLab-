#!/usr/bin/env python3
"""Prepare aligned RICO cutouts and locally repair the torso cutout."""

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "source-parts"
OUTPUT = ROOT / "generated"
SIZE = (1024, 1536)


def save_trimmed(image: Image.Image, name: str) -> None:
    alpha = image.getchannel("A")
    bounds = alpha.getbbox()
    if bounds is None:
        raise ValueError(f"{name} has no visible pixels")
    image.crop(bounds).save(OUTPUT / f"{name}.png", optimize=True)
    print(f"{name}: crop={bounds}, size={image.crop(bounds).size}")


def antialiased_polygon(points: list[tuple[int, int]]) -> Image.Image:
    scale = 4
    mask = Image.new("L", (SIZE[0] * scale, SIZE[1] * scale), 0)
    draw = ImageDraw.Draw(mask)
    draw.polygon([(x * scale, y * scale) for x, y in points], fill=255)
    return mask.resize(SIZE, Image.Resampling.LANCZOS)


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)

    torso = Image.open(SOURCE / "torso.png").convert("RGBA")
    source = Image.open(SOURCE / "source-full.png").convert("RGB")
    torso_pixels = np.asarray(torso).copy()
    source_pixels = np.asarray(source)

    arm_mask = Image.new("L", SIZE, 0)
    for arm_name in ("arm-image-left.png", "arm-image-right.png"):
        arm_alpha = Image.open(SOURCE / arm_name).convert("RGBA").getchannel("A")
        arm_mask = Image.fromarray(
            np.maximum(np.asarray(arm_mask), np.asarray(arm_alpha)).astype(np.uint8),
            "L",
        )

    # The torso cutout repeats the arms. Soften only those duplicated pixels
    # into a low-detail jacket backing; the sharper independent arm layers draw
    # over it in the neutral pose and can move without a second set of seams.
    softened = np.asarray(torso.convert("RGB").filter(ImageFilter.GaussianBlur(12)))
    duplicated_arm = (np.asarray(arm_mask) > 0) & (torso_pixels[:, :, 3] > 0)
    torso_pixels[duplicated_arm, :3] = softened[duplicated_arm]

    corners = np.array(
        [source_pixels[0, 0], source_pixels[0, -1], source_pixels[-1, 0], source_pixels[-1, -1]],
        dtype=np.float32,
    )
    background = np.median(corners, axis=0)
    differs_from_background = np.linalg.norm(source_pixels.astype(np.float32) - background, axis=2) > 22

    # The source torso has a large transparent opening through the shirt.
    # Restore only missing pixels inside the body using the precisely aligned,
    # user-supplied flattened source. This is a local pixel patch, not generation.
    patch_region = np.zeros(SIZE[::-1], dtype=bool)
    patch_region[390:840, 350:675] = True
    patch_region[320:390, 450:574] = True
    missing = torso_pixels[:, :, 3] < 2
    patch = patch_region & missing & differs_from_background
    torso_pixels[patch, :3] = source_pixels[patch]
    torso_pixels[patch, 3] = 255
    torso = Image.fromarray(torso_pixels, "RGBA")
    save_trimmed(torso, "rico-torso")

    save_trimmed(Image.open(SOURCE / "legs.png").convert("RGBA"), "rico-legs")
    save_trimmed(Image.open(SOURCE / "arm-image-left.png").convert("RGBA"), "rico-arm-left")
    save_trimmed(Image.open(SOURCE / "arm-image-right.png").convert("RGBA"), "rico-arm-right")

    head = Image.open(SOURCE / "head.png").convert("RGBA")
    jaw_mask = antialiased_polygon(
        [
            (457, 251),
            (568, 251),
            (579, 264),
            (579, 280),
            (570, 295),
            (555, 309),
            (538, 321),
            (512, 327),
            (486, 321),
            (469, 309),
            (453, 294),
            (444, 280),
            (445, 265),
        ]
    )
    original = np.asarray(head).copy()
    jaw_alpha = np.asarray(jaw_mask, dtype=np.float32) / 255
    upper = original.copy()
    jaw = original.copy()
    upper[:, :, 3] = np.rint(original[:, :, 3] * (1 - jaw_alpha)).astype(np.uint8)
    jaw[:, :, 3] = np.rint(original[:, :, 3] * jaw_alpha).astype(np.uint8)
    save_trimmed(Image.fromarray(upper, "RGBA"), "rico-head-upper")
    save_trimmed(Image.fromarray(jaw, "RGBA"), "rico-jaw")

    # A small shaded mouth cavity sits behind the hinged lower face.
    mouth = Image.new("RGBA", SIZE, (0, 0, 0, 0))
    draw = ImageDraw.Draw(mouth)
    draw.ellipse((470, 248, 554, 284), fill=(47, 10, 16, 245))
    draw.ellipse((480, 252, 544, 277), fill=(117, 28, 38, 230))
    draw.ellipse((488, 258, 536, 273), fill=(40, 8, 13, 255))
    draw.rounded_rectangle((498, 267, 526, 275), radius=5, fill=(177, 49, 57, 235))
    save_trimmed(mouth, "rico-mouth")


if __name__ == "__main__":
    main()