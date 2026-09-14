#!/usr/bin/env python3
"""Reject iOS builds whose WebView media capture would exit on privacy access."""

import plistlib
import sys
from pathlib import Path


def main():
    if len(sys.argv) != 2:
        sys.exit("Usage: validate-ios-privacy.py <Info.plist>")

    with Path(sys.argv[1]).open("rb") as file:
        info = plistlib.load(file)

    for key in ("NSCameraUsageDescription", "NSPhotoLibraryUsageDescription", "NSMicrophoneUsageDescription"):
        value = info.get(key)
        if not isinstance(value, str) or not value.strip() or "$(" in value:
            sys.exit(f"Missing or invalid {key}: media capture must have a privacy purpose string.")

    print("iOS camera, photo-library, and microphone privacy descriptions verified.")


if __name__ == "__main__":
    main()
