#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APK_PATH="${APK_PATH:-$ROOT_DIR/android/app/build/outputs/apk/debug/app-debug.apk}"
ANDROID_HOME="${ANDROID_HOME:-/opt/homebrew/share/android-commandlinetools}"
ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-$ANDROID_HOME}"
JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home}"
export ANDROID_HOME ANDROID_SDK_ROOT JAVA_HOME
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"

if [[ ! -f "$APK_PATH" ]]; then
  echo "Missing APK: $APK_PATH" >&2
  echo "Run: TRASHED_WEB_URL=https://trashed.app VITE_TRASHED_WEB_BASE_URL=https://trashed.app npm run cap:sync && (cd android && ./gradlew :app:assembleDebug)" >&2
  exit 2
fi

adb start-server >/dev/null
mapfile -t devices < <(adb devices | awk 'NR > 1 && $2 == "device" { print $1 }')
mapfile -t physical_devices < <(printf '%s\n' "${devices[@]}" | awk '$1 !~ /^emulator-/ { print $1 }')

if [[ -n "${ANDROID_SERIAL:-}" ]]; then
  device="$ANDROID_SERIAL"
elif [[ "${#physical_devices[@]}" -gt 0 ]]; then
  device="${physical_devices[0]}"
else
  adb devices -l
  echo "No authorized physical Android device found. Enable USB debugging, accept the RSA prompt, and reconnect with a data-capable cable." >&2
  echo "To install on an emulator instead, rerun with ANDROID_SERIAL=emulator-5554." >&2
  exit 3
fi

adb -s "$device" install -r "$APK_PATH"
adb -s "$device" shell monkey -p com.trashed.driver -c android.intent.category.LAUNCHER 1 >/dev/null
echo "Installed and launched com.trashed.driver on $device"
