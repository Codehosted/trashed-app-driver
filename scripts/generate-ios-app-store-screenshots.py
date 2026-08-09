#!/usr/bin/env python3
import argparse
import hashlib
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


WIDTH = 1290
HEIGHT = 2796

SHOTS = (
    {
        "source": "driver-route-map.png",
        "sha256": "19befefaf2bb8fc2dc5d6b5743ebb802cd5b566a7ddce4f892d180f9d7ec18f4",
        "output": "ios-6.9-01-driver-routes.png",
        "headline": "Routes, live\non the map.",
        "crop": (0, 0, 390, 844),
        "capture_width": 1010,
        "capture_y": 580,
    },
    {
        "source": "driver-dispatch-chat.png",
        "sha256": "c021cd7fb0f2090fdf82b1ce18329d1848429568c6cc57c4d0bf79268a051357",
        "output": "ios-6.9-02-dispatch-messages.png",
        "headline": "Driver chat keeps\ndispatch in sync.",
        "crop": (0, 63, 1080, 1800),
        "capture_width": 1120,
        "capture_y": 760,
    },
    {
        "source": "driver-route-photos.png",
        "sha256": "b839be8a840a7837ce7207d8e0ca998a807a28519a693a010a79c495c78b9045",
        "context_source": "completed-routes-metrics.png",
        "context_sha256": "f9b5fab6288ac8d4ad6b335330e473f214c11b8dc79fb75e3b5be06ee2f92097",
        "output": "ios-6.9-03-route-photos.png",
        "headline": "Proof after every\ncompleted route.",
        "crop": (0, 330, 1080, 1750),
        "capture_width": 1120,
        "capture_y": 1150,
    },
)


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    candidates = (
        "/System/Library/Fonts/SFNS.ttf",
        "/System/Library/Fonts/SFNSRounded.ttf",
        "/Library/Fonts/Arial Bold.ttf" if bold else "/Library/Fonts/Arial.ttf",
    )
    for candidate in candidates:
        path = Path(candidate)
        if path.exists():
            return ImageFont.truetype(str(path), size)
    return ImageFont.load_default()


def background() -> Image.Image:
    image = Image.new("RGB", (WIDTH, HEIGHT))
    draw = ImageDraw.Draw(image)
    for y in range(HEIGHT):
        mix = y / (HEIGHT - 1)
        color = (
            round(5 + 12 * mix),
            round(15 + 10 * mix),
            round(38 + 30 * mix),
        )
        draw.line((0, y, WIDTH, y), fill=color)

    glow = Image.new("RGBA", image.size, (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    glow_draw.ellipse((-240, 220, 980, 1440), fill=(76, 64, 255, 96))
    glow_draw.ellipse((600, 1480, 1660, 2740), fill=(31, 120, 255, 64))
    glow = glow.filter(ImageFilter.GaussianBlur(180))
    image.paste(glow, mask=glow.getchannel("A"))
    return image


def verify_source(source: Path, expected_sha256: str) -> None:
    actual = hashlib.sha256(source.read_bytes()).hexdigest()
    if actual != expected_sha256:
        raise SystemExit(
            f"Source screenshot checksum mismatch for {source}: expected {expected_sha256}, got {actual}"
        )


def rounded_capture(source: Path, crop: tuple[int, int, int, int], target_width: int) -> Image.Image:
    with Image.open(source) as opened:
        capture = opened.convert("RGB").crop(crop)
    target_height = round(capture.height * target_width / capture.width)
    capture = capture.resize((target_width, target_height), Image.Resampling.LANCZOS)

    mask = Image.new("L", capture.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, *capture.size), radius=44, fill=255)
    result = Image.new("RGBA", capture.size, (0, 0, 0, 0))
    result.paste(capture, mask=mask)
    return result


def paste_capture(canvas: Image.Image, capture: Image.Image, y: int) -> None:
    x = (WIDTH - capture.width) // 2
    if y + capture.height > HEIGHT - 20:
        raise SystemExit("Composed screenshot exceeds canvas")

    shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    shadow_draw.rounded_rectangle(
        (x - 12, y + 24, x + capture.width + 12, y + capture.height + 48),
        radius=58,
        fill=(0, 0, 0, 120),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(36))
    canvas.paste(shadow, mask=shadow.getchannel("A"))
    canvas.paste(capture, (x, y), capture)


def render(source_dir: Path, destination: Path, shot: dict) -> None:
    source = source_dir / shot["source"]
    verify_source(source, shot["sha256"])

    canvas = background()
    draw = ImageDraw.Draw(canvas)
    draw.text((85, 120), "TRASHED DRIVER", font=font(28, bold=True), fill=(170, 190, 255))
    draw.multiline_text(
        (85, 205),
        shot["headline"],
        font=font(82, bold=True),
        fill=(255, 255, 255),
        spacing=4,
    )

    context_name = shot.get("context_source")
    if context_name:
        context = source_dir / context_name
        verify_source(context, shot["context_sha256"])
        context_capture = rounded_capture(context, (260, 50, 900, 305), 1120)
        paste_capture(canvas, context_capture, 600)
        draw.text(
            (85, 1080),
            "THEN ADD PHOTO PROOF",
            font=font(27, bold=True),
            fill=(170, 190, 255),
        )

    capture = rounded_capture(source, shot["crop"], shot["capture_width"])
    paste_capture(canvas, capture, shot["capture_y"])

    destination.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(destination, format="PNG", optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--source-dir",
        type=Path,
        default=Path("app-store-assets/sources/ios-6.9"),
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("app-store-assets/screenshots/ios-6.9"),
    )
    args = parser.parse_args()

    for shot in SHOTS:
        source = args.source_dir / shot["source"]
        if not source.exists():
            raise SystemExit(f"Missing source screenshot: {source}")
        render(args.source_dir, args.output_dir / shot["output"], shot)


if __name__ == "__main__":
    main()
