from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import shutil

root = Path('/home/george/projects/trashed-app-driver/app-store-assets')
(root / 'screenshots').mkdir(parents=True, exist_ok=True)
(root / 'artwork').mkdir(parents=True, exist_ok=True)

screens = {
    '01-driver-home.png': '/home/george/.hermes/cache/screenshots/browser_screenshot_bab491407f8c4a56b20c087af93ffd43.png',
    '02-driver-route-started.png': '/home/george/.hermes/cache/screenshots/browser_screenshot_18d28190b4454086b7047ae65a3d7b6e.png',
    '03-vendor-dashboard-webview.png': '/home/george/.hermes/cache/screenshots/browser_screenshot_1b70853b069d44b0a8c152a31607e3ec.png',
    '04-vendor-dispatch-webview.png': '/home/george/.hermes/cache/screenshots/browser_screenshot_752a96088aba4242b6d61bc468d3603d.png',
    '05-vendor-rentals-webview.png': '/home/george/.hermes/cache/screenshots/browser_screenshot_abb67ed0f9f44451a3862d63ff82ef38.png',
    '06-vendor-inventory-webview.png': '/home/george/.hermes/cache/screenshots/browser_screenshot_02b2603bf5c2482684727eed631d7e97.png',
    '07-vendor-customers-webview.png': '/home/george/.hermes/cache/screenshots/browser_screenshot_1326901fc2d747f69138ad1082568d7c.png',
    '08-vendor-settings-webview.png': '/home/george/.hermes/cache/screenshots/browser_screenshot_45537703b5aa4eba8ba2522725b05775.png',
}

for name, src in screens.items():
    source = Path(src)
    if source.exists():
        shutil.copyfile(source, root / 'screenshots' / name)

BG = (9, 13, 18)
PANEL = (18, 24, 33)
GREEN = (106, 255, 94)
PURPLE = (139, 92, 246)
WHITE = (244, 247, 251)
MUTED = (132, 148, 164)


def font(size: int, bold: bool = False):
    path = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf' if bold else '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
    try:
        return ImageFont.truetype(path, size)
    except Exception:
        return ImageFont.load_default()

# App icon 1024x1024.
im = Image.new('RGB', (1024, 1024), BG)
d = ImageDraw.Draw(im)
for x in range(-200, 1200, 80):
    d.line([(x, 1024), (x + 420, 0)], fill=(18, 35, 36), width=3)
for y in range(80, 1100, 100):
    d.line([(0, y), (1024, y - 280)], fill=(18, 28, 40), width=2)
d.rounded_rectangle([160, 630, 860, 755], radius=62, fill=(22, 30, 38), outline=GREEN, width=18)
d.polygon([(780, 565), (910, 692), (780, 815)], fill=GREEN)
d.rounded_rectangle([250, 405, 740, 665], radius=42, fill=(45, 58, 65), outline=WHITE, width=12)
d.polygon([(250, 405), (315, 330), (805, 330), (740, 405)], fill=(62, 80, 87), outline=WHITE)
for x in [330, 430, 530, 630]:
    d.line([(x, 425), (x + 35, 640)], fill=(107, 129, 136), width=10)
for x in [330, 660]:
    d.ellipse([x, 645, x + 80, 725], fill=BG, outline=GREEN, width=12)
d.line([(505, 260), (440, 505), (555, 500), (475, 745)], fill=GREEN, width=42, joint='curve')
im.save(root / 'artwork' / 'trashed-driver-icon-1024.png')

(root / 'artwork' / 'trashed-driver-icon.svg').write_text('''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><rect width="1024" height="1024" fill="#090d12"/><g stroke="#122328" stroke-width="3" opacity=".8"><path d="M-200 1024 220 0M-120 1024 300 0M-40 1024 380 0M40 1024 460 0M120 1024 540 0M200 1024 620 0M280 1024 700 0M360 1024 780 0M440 1024 860 0M520 1024 940 0M600 1024 1020 0"/></g><path d="M222 692h612" stroke="#6aff5e" stroke-width="76" stroke-linecap="round"/><path d="m790 565 130 127-130 123z" fill="#6aff5e"/><path d="M250 405h490v260H250z" rx="42" fill="#2d3a41" stroke="#f4f7fb" stroke-width="12"/><path d="m250 405 65-75h490l-65 75z" fill="#3e5057" stroke="#f4f7fb" stroke-width="12"/><path d="M330 425l35 215M430 425l35 215M530 425l35 215M630 425l35 215" stroke="#6b8188" stroke-width="10"/><circle cx="370" cy="685" r="40" fill="#090d12" stroke="#6aff5e" stroke-width="12"/><circle cx="700" cy="685" r="40" fill="#090d12" stroke="#6aff5e" stroke-width="12"/><path d="M505 260 440 505h115l-80 240" fill="none" stroke="#6aff5e" stroke-width="42" stroke-linejoin="round" stroke-linecap="round"/></svg>''')

# Play Store feature graphic 1024x500.
fg = Image.new('RGB', (1024, 500), BG)
d = ImageDraw.Draw(fg)
for x in range(0, 1024, 64):
    d.line([(x, 500), (x + 260, 0)], fill=(16, 29, 38), width=2)
d.rounded_rectangle([52, 52, 386, 448], radius=44, fill=(16, 22, 32), outline=(44, 58, 70), width=3)
d.text((86, 82), 'trashed', font=font(44, True), fill=WHITE)
d.text((88, 134), 'DRIVER PORTAL', font=font(18, True), fill=GREEN)
d.rounded_rectangle([86, 210, 352, 330], radius=24, fill=(27, 36, 49))
d.text((112, 230), 'STOP #1', font=font(18, True), fill=GREEN)
d.text((112, 260), 'Yard / HQ', font=font(30, True), fill=WHITE)
d.text((112, 300), '1200 Industrial Ave', font=font(18), fill=MUTED)
d.line([(438, 380), (540, 250), (650, 320), (780, 170), (930, 220)], fill=GREEN, width=10)
for p in [(438, 380), (540, 250), (650, 320), (780, 170), (930, 220)]:
    d.ellipse([p[0] - 16, p[1] - 16, p[0] + 16, p[1] + 16], fill=PURPLE, outline=WHITE, width=4)
d.text((440, 82), 'Real-time routes for dumpster haulers', font=font(38, True), fill=WHITE)
d.text((442, 136), 'Driver map, vendor WebView, dispatch tracking, rentals, inventory, customers, and settings in one mobile shell.', font=font(22), fill=(190, 203, 216))
d.rounded_rectangle([442, 285, 690, 346], radius=30, fill=GREEN)
d.text((474, 303), 'Built for drivers', font=font(22, True), fill=BG)
fg.save(root / 'artwork' / 'feature-graphic-1024x500.png')

metadata = '''# Trashed Driver — App Store / Play Store Submission Notes

## App name
Trashed Driver

## Subtitle / short description
Realtime driver routes and vendor tools for dumpster haulers.

## Full description
Trashed Driver gives dumpster rental teams a mobile-first command center for daily routes, delivery and pickup stops, and vendor operations. Drivers can keep the live route map open, start routes, mark arrival, and share realtime position beacons with dispatch. Vendors can open the full Trashed experience inside secure WebViews for dispatch, rentals, inventory, customers, and settings.

## Key features
- Driver map and route action screen
- Realtime location beacon API with SpacetimeDB fanout support
- Vendor dashboard, dispatch, rentals, inventory, customers, and settings WebView tabs
- Capacitor Android shell around the Trashed web app
- Local-first configuration for development and preview

## Keywords
dumpster rental, waste management, driver routes, dispatch, hauling, roll off, logistics, fleet tracking, rental management

## Support URL
https://trashed.app/support

## Marketing URL
https://trashed.app

## Privacy Policy
https://trashed.app/privacy

## Suggested category
Business / Productivity

## Assets generated
- artwork/trashed-driver-icon-1024.png
- artwork/trashed-driver-icon.svg
- artwork/feature-graphic-1024x500.png
- screenshots/01-driver-home.png
- screenshots/02-driver-route-started.png
- screenshots/03-vendor-dashboard-webview.png
- screenshots/04-vendor-dispatch-webview.png
- screenshots/05-vendor-rentals-webview.png
- screenshots/06-vendor-inventory-webview.png
- screenshots/07-vendor-customers-webview.png
- screenshots/08-vendor-settings-webview.png

## Current review caveats
- Screenshots were captured from local Linux browser preview, not from a real Android emulator/device.
- Vendor WebView tabs currently show the Trashed login gate because no local app credentials were used.
- Native Android debug build requires an Android SDK. Java was available only through Docker in this session; SDK was not installed locally.
- Image-generation provider was unavailable, so artwork was generated locally with deterministic vector/PIL drawing.
'''
(root / 'README.md').write_text(metadata)
print(root)
