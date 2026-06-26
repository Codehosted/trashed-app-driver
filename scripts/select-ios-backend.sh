#!/bin/sh
set -eu

if [ -z "${CONFIG_FILE:-}" ]; then
  CONFIG_FILE="${TARGET_BUILD_DIR:?TARGET_BUILD_DIR is required}/${UNLOCALIZED_RESOURCES_FOLDER_PATH:?UNLOCALIZED_RESOURCES_FOLDER_PATH is required}/capacitor.config.json"
fi

case "${CONFIGURATION:-Release}" in
  Debug)
    WEB_BASE_URL="https://preview.trashed.app"
    ;;
  *)
    WEB_BASE_URL="https://trashed.app"
    ;;
esac

export CONFIG_FILE WEB_BASE_URL

python3 <<'PY'
import json
import os
from urllib.parse import urlparse

config_file = os.environ["CONFIG_FILE"]
base_url = os.environ["WEB_BASE_URL"].rstrip("/")
driver_url = f"{base_url}/driver?source=trashed-driver-app"
host = urlparse(base_url).hostname

if not host:
    raise SystemExit(f"Invalid iOS backend URL: {base_url}")

with open(config_file, "r", encoding="utf-8") as handle:
    config = json.load(handle)

server = config.setdefault("server", {})
server["url"] = driver_url
server["cleartext"] = not driver_url.startswith("https://")
server["allowNavigation"] = [host]

with open(config_file, "w", encoding="utf-8") as handle:
    json.dump(config, handle, indent="\t")
    handle.write("\n")

print(f"Selected iOS backend: {driver_url}")
PY
