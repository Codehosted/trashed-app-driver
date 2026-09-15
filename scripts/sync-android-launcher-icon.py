#!/usr/bin/env python3
"""Sync ic_launcher_store_art.png and launcher rasters from play-store-icon-512.png.

Keep the historical command usable without Pillow. The shared vector renderer
uses the paired website's existing Sharp dependency and supports --check.
"""
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]

if __name__ == "__main__":
    raise SystemExit(subprocess.call([
        "node", str(ROOT / "scripts/sync-flat-branding.mjs"), "--android-only", *sys.argv[1:]
    ], cwd=ROOT))
