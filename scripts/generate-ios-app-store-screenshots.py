#!/usr/bin/env python3
import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


WIDTH = 1290
HEIGHT = 2796
CONTENT_BOTTOM = 1800

SHOTS = (
    ("01-routes-raw.png", "ios-6.9-01-driver-routes.png", "Today's route,\nat a glance.", 63),
    ("02-messages-raw.png", "ios-6.9-02-dispatch-messages.png", "Dispatch stays\nin sync.", 370),
    ("04-photos-raw.png", "ios-6.9-03-route-photos.png", "Proof from\nevery stop.", 63),
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
    pixels = image.load()
    for y in range(HEIGHT):
        mix = y / (HEIGHT - 1)
        color = (
            round(5 + 12 * mix),
            round(15 + 10 * mix),
            round(38 + 30 * mix),
        )
        for x in range(WIDTH):
            pixels[x, y] = color

    glow = Image.new("RGBA", image.size, (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    glow_draw.ellipse((-240, 220, 980, 1440), fill=(76, 64, 255, 96))
    glow_draw.ellipse((600, 1480, 1660, 2740), fill=(31, 120, 255, 64))
    glow = glow.filter(ImageFilter.GaussianBlur(180))
    image.paste(glow, mask=glow.getchannel("A"))
    return image


def rounded_capture(source: Path, content_top: int) -> Image.Image:
    with Image.open(source) as opened:
        capture = opened.convert("RGB").crop((0, content_top, opened.width, CONTENT_BOTTOM))
    target_width = 1120
    target_height = round(capture.height * target_width / capture.width)
    capture = capture.resize((target_width, target_height), Image.Resampling.LANCZOS)

    mask = Image.new("L", capture.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, *capture.size), radius=44, fill=255)
    result = Image.new("RGBA", capture.size, (0, 0, 0, 0))
    result.paste(capture, mask=mask)
    return result


def render(source: Path, destination: Path, headline: str, content_top: int) -> None:
    canvas = background()
    draw = ImageDraw.Draw(canvas)
    draw.text((85, 120), "TRASHED DRIVER", font=font(28, bold=True), fill=(170, 190, 255))
    draw.multiline_text(
        (85, 205),
        headline,
        font=font(82, bold=True),
        fill=(255, 255, 255),
        spacing=4,
    )

    capture = rounded_capture(source, content_top)
    x = (WIDTH - capture.width) // 2
    y = 760

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

    destination.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(destination, format="PNG", optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-dir", type=Path, required=True)
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("app-store-assets/screenshots/ios-6.9"),
    )
    args = parser.parse_args()

    for source_name, output_name, headline, content_top in SHOTS:
        source = args.source_dir / source_name
        if not source.exists():
            raise SystemExit(f"Missing source screenshot: {source}")
        render(source, args.output_dir / output_name, headline, content_top)


if __name__ == "__main__":
    main()
