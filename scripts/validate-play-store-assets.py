#!/usr/bin/env python3
from pathlib import Path
from typing import Optional
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "app-store-assets"
ARTWORK = ASSETS / "artwork"
SCREENSHOTS = ASSETS / "screenshots"


def check_png(path: Path, size: Optional[tuple[int, int]] = None, max_bytes: Optional[int] = None) -> None:
    if not path.exists():
        raise SystemExit(f"Missing required asset: {path}")

    with Image.open(path) as image:
        if image.format != "PNG":
            raise SystemExit(f"{path} must be a PNG")
        if size and image.size != size:
            raise SystemExit(f"{path} must be {size[0]}x{size[1]}, got {image.size[0]}x{image.size[1]}")

    if max_bytes and path.stat().st_size > max_bytes:
        raise SystemExit(f"{path} must be <= {max_bytes} bytes, got {path.stat().st_size}")


def check_screenshot(path: Path) -> None:
    check_png(path)
    with Image.open(path) as image:
        if image.size != (1080, 1920):
            raise SystemExit(f"{path} must be 1080x1920, got {image.size[0]}x{image.size[1]}")
        if image.mode != "RGB":
            raise SystemExit(f"{path} must be RGB with no alpha channel, got {image.mode}")
        width, height = image.size
        shortest = min(width, height)
        longest = max(width, height)
        if shortest < 320:
            raise SystemExit(f"{path} shortest side must be >= 320px, got {shortest}px")
        if longest > 3840:
            raise SystemExit(f"{path} longest side must be <= 3840px, got {longest}px")
        if longest / shortest > 2:
            raise SystemExit(f"{path} aspect ratio must be <= 2:1, got {longest}:{shortest}")

    if path.stat().st_size > 8 * 1024 * 1024:
        raise SystemExit(f"{path} must be <= 8MB, got {path.stat().st_size} bytes")


def main() -> None:
    check_png(ARTWORK / "play-store-icon-512.png", (512, 512), 1024 * 1024)
    check_png(ARTWORK / "feature-graphic-1024x500.png", (1024, 500), 15 * 1024 * 1024)

    screenshots = sorted(SCREENSHOTS.glob("play-phone-*.png"))
    if len(screenshots) < 4:
        raise SystemExit(f"Expected at least 4 phone screenshots, got {len(screenshots)}")

    for screenshot in screenshots:
        check_screenshot(screenshot)

    print(f"Play Store assets OK: 1 icon, 1 feature graphic, {len(screenshots)} phone screenshots")


if __name__ == "__main__":
    main()
