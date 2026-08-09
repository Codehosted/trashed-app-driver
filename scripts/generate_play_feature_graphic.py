#!/usr/bin/env python3
import hashlib
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "app-store-assets" / "sources" / "play-feature-graphic"
OUTPUT = ROOT / "app-store-assets" / "artwork" / "feature-graphic-1024x500.png"

SOURCE_SHA256 = "25a9d9b888723bff99518f20070c87a06abd4807d9b15b2ffe6249d973770f23"
LOGO_SHA256 = "54dc94eb1ed1b587f8454ea8b4b0c2c4b5249070cc234f7ff8f4324176fe4686"
FONT_SHA256 = {
    "Inter_24pt-ExtraBold.ttf": "a39a597b8e9f869916603b935173e0b444298e012b08a5ed6ab9bbc4f4572212",
    "Inter_24pt-SemiBold.ttf": "10238d4c2f85914e3899177426840bde80b078a612903066cf5c9afd17dbf023",
    "Inter_24pt-Regular.ttf": "d2a4911506ea4e124a47ca044e5e79f671ddf8f1a55f1ab9a56c58d088124b63",
}


def verify(path: Path, expected_sha256: str) -> None:
    actual = hashlib.sha256(path.read_bytes()).hexdigest()
    if actual != expected_sha256:
        raise SystemExit(
            f"Source checksum mismatch for {path}: expected {expected_sha256}, got {actual}"
        )


def font(path: Path, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(path), size)


def left_background(width: int = 430, height: int = 500) -> Image.Image:
    image = Image.new("RGB", (width, height))
    pixels = image.load()
    for y in range(height):
        mix = y / max(1, height - 1)
        base = tuple(
            round(start * (1 - mix) + end * mix)
            for start, end in zip((2, 6, 23), (18, 18, 55))
        )
        for x in range(width):
            glow = max(0.0, 1 - math.hypot((x - width) / width, (y - height) / height))
            pixels[x, y] = tuple(
                min(255, round(channel + glow * boost))
                for channel, boost in zip(base, (22, 16, 55))
            )
    return image


def main() -> None:
    route_capture = SOURCE_DIR / "driver-route-landscape.png"
    logo_path = ROOT / "ios" / "App" / "App" / "Assets.xcassets" / "TrashedLogoMark.imageset" / "trashed-logo-mark@3x.png"
    fonts = {name: SOURCE_DIR / name for name in FONT_SHA256}

    verify(route_capture, SOURCE_SHA256)
    verify(logo_path, LOGO_SHA256)
    for name, expected_sha256 in FONT_SHA256.items():
        verify(fonts[name], expected_sha256)

    source = Image.open(route_capture).convert("RGB")
    logo = Image.open(logo_path).convert("RGBA")

    canvas = Image.new("RGB", (1024, 500), (2, 6, 23))
    canvas.paste(left_background(), (0, 0))
    map_capture = source.crop((600, 105, 1795, 1024)).resize(
        (650, 500), Image.Resampling.LANCZOS
    )
    canvas.paste(map_capture, (374, 0))

    overlay = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    overlay_draw = ImageDraw.Draw(overlay)
    for x in range(340, 530):
        alpha = round(255 * max(0, min(1, (530 - x) / 190)) ** 1.6)
        overlay_draw.line((x, 0, x, 500), fill=(5, 8, 29, alpha))
    canvas = Image.alpha_composite(canvas.convert("RGBA"), overlay).convert("RGB")

    draw = ImageDraw.Draw(canvas)
    mark = logo.copy()
    mark.thumbnail((48, 40), Image.Resampling.LANCZOS)
    canvas.paste(mark, (56, 58), mark)
    draw.text(
        (118, 66),
        "TRASHED DRIVER",
        font=font(fonts["Inter_24pt-SemiBold.ttf"], 17),
        fill=(224, 231, 255),
    )
    headline_font = font(fonts["Inter_24pt-ExtraBold.ttf"], 46)
    draw.text((56, 144), "Every route.", font=headline_font, fill=(255, 255, 255))
    draw.text((56, 202), "Every stop.", font=headline_font, fill=(255, 255, 255))
    draw.text((56, 260), "In sync.", font=headline_font, fill=(129, 140, 248))
    draw.text(
        (56, 356),
        "Live driver routes and dispatch\nfor dumpster teams.",
        font=font(fonts["Inter_24pt-Regular.ttf"], 20),
        fill=(203, 213, 225),
        spacing=8,
    )
    draw.rounded_rectangle((56, 445, 184, 449), radius=2, fill=(99, 102, 241))

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(OUTPUT, optimize=True)
    print(OUTPUT)


if __name__ == "__main__":
    main()
