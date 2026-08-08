#!/usr/bin/env python3
"""Sync Android launcher rasters from the Google Play hi-res icon."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageChops


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "app-store-assets/artwork/play-store-icon-512.png"
DENSITIES = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}
OUTPUTS = ("ic_launcher.png", "ic_launcher_round.png", "ic_launcher_store_art.png")


def expected_icon(size: int) -> Image.Image:
    with Image.open(SOURCE) as image:
        return image.convert("RGBA").resize((size, size), Image.Resampling.LANCZOS)


def matches(path: Path, expected: Image.Image) -> bool:
    if not path.is_file():
        return False
    with Image.open(path) as image:
        actual = image.convert("RGBA")
    return actual.size == expected.size and ImageChops.difference(actual, expected).getbbox() is None


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="fail if generated launcher assets are stale")
    args = parser.parse_args()

    if not SOURCE.is_file():
        raise SystemExit(f"Missing canonical Google Play icon: {SOURCE}")

    stale: list[Path] = []
    for directory, size in DENSITIES.items():
        icon = expected_icon(size)
        for name in OUTPUTS:
            path = ROOT / "android/app/src/main/res" / directory / name
            if args.check:
                if not matches(path, icon):
                    stale.append(path)
            else:
                path.parent.mkdir(parents=True, exist_ok=True)
                icon.save(path)

    if stale:
        formatted = "\n".join(f"- {path.relative_to(ROOT)}" for path in stale)
        raise SystemExit(f"Android launcher assets do not match the Google Play icon:\n{formatted}")

    print("Android launcher assets match the Google Play icon")


if __name__ == "__main__":
    main()
