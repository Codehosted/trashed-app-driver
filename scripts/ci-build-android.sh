#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-verify}"
case "$MODE" in
  verify|release) ;;
  *) echo "usage: $0 [verify|release]" >&2; exit 64 ;;
esac

if [[ "$MODE" == release ]]; then
  : "${TRASHED_ANDROID_VERSION_CODE:?set an unused Google Play version code}"
  : "${TRASHED_ANDROID_VERSION_NAME:?set the Android release version name}"
  # Fail before network checks, artifact cleanup or dependency/build work.
  : "${TRASHED_ANDROID_KEYSTORE:?missing TRASHED_ANDROID_KEYSTORE}"
  : "${TRASHED_ANDROID_KEY_ALIAS:?missing TRASHED_ANDROID_KEY_ALIAS}"
  : "${TRASHED_ANDROID_KEYSTORE_PASSWORD:?missing TRASHED_ANDROID_KEYSTORE_PASSWORD}"
  : "${TRASHED_ANDROID_KEY_PASSWORD:?missing TRASHED_ANDROID_KEY_PASSWORD}"
  [[ -r "$TRASHED_ANDROID_KEYSTORE" && -f "$TRASHED_ANDROID_KEYSTORE" ]] || {
    echo 'TRASHED_ANDROID_KEYSTORE must point to a readable keystore file' >&2; exit 1;
  }
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARTIFACT_DIR="${ARTIFACT_DIR:-$ROOT_DIR/artifacts/android}"
export TRASHED_WEB_URL=https://trashed.app
export GRADLE_USER_HOME="${GRADLE_USER_HOME:-$ROOT_DIR/android/.gradle-user}"
export CI=true

cd "$ROOT_DIR"
if [[ "$MODE" == release ]]; then
  node scripts/check-mobile-backend.mjs
  node scripts/check-mobile-push-config.mjs
fi
mkdir -p "$ARTIFACT_DIR"
# Only replace outputs owned by this script; never recursively delete a caller path.
rm -f "$ARTIFACT_DIR/trashed-driver-debug.apk" "$ARTIFACT_DIR/trashed-driver-release.apk" \
  "$ARTIFACT_DIR/trashed-driver-release.aab" "$ARTIFACT_DIR/SHA256SUMS"

npm ci
npm test
npm run build
npx cap sync android

cd android
if [[ "$MODE" == release ]]; then
  export TRASHED_REQUIRE_SIGNING=true
  ./gradlew --no-daemon --stacktrace testReleaseUnitTest lintRelease assembleRelease bundleRelease
else
  unset TRASHED_ANDROID_KEYSTORE TRASHED_ANDROID_KEY_ALIAS TRASHED_ANDROID_KEYSTORE_PASSWORD TRASHED_ANDROID_KEY_PASSWORD TRASHED_REQUIRE_SIGNING
  ./gradlew --no-daemon --stacktrace testDebugUnitTest lintDebug assembleDebug
fi
cd "$ROOT_DIR"

if [[ "$MODE" == release ]]; then
  APK="android/app/build/outputs/apk/release/app-release.apk"
  AAB="android/app/build/outputs/bundle/release/app-release.aab"
  [[ -s "$APK" ]] || { echo "missing release APK: $APK" >&2; exit 1; }
  [[ -s "$AAB" ]] || { echo "missing release AAB: $AAB" >&2; exit 1; }

  APKSIGNER_BIN="${APKSIGNER_BIN:-}"
  if [[ -z "$APKSIGNER_BIN" ]] && command -v apksigner >/dev/null 2>&1; then
    APKSIGNER_BIN="$(command -v apksigner)"
  fi
  if [[ -z "$APKSIGNER_BIN" && -n "${ANDROID_SDK_ROOT:-}" ]]; then
    APKSIGNER_BIN="$(find "$ANDROID_SDK_ROOT/build-tools" -mindepth 2 -maxdepth 2 -type f -name apksigner -print | sort -V | tail -1)"
  fi
  [[ -x "$APKSIGNER_BIN" ]] || { echo 'apksigner is required to verify release APKs' >&2; exit 1; }
  AAPT2_BIN="$(dirname "$APKSIGNER_BIN")/aapt2"
  [[ -x "$AAPT2_BIN" ]] || { echo 'aapt2 is required to verify release feature requirements' >&2; exit 1; }
  TRASHED_ANDROID_RELEASE_MANIFEST="$ROOT_DIR/android/app/build/intermediates/merged_manifests/release/processReleaseManifest/AndroidManifest.xml" \
    TRASHED_ANDROID_RELEASE_APK="$ROOT_DIR/$APK" TRASHED_ANDROID_AAPT2="$AAPT2_BIN" \
    node --test "$ROOT_DIR/tests/android-release.test.mjs"
  export PATH="$(dirname "$APKSIGNER_BIN"):$PATH"
  apksigner verify --verbose --print-certs "$APK"
  jarsigner -verify -verbose -certs "$AAB" >/dev/null

  cp "$APK" "$ARTIFACT_DIR/trashed-driver-release.apk"
  cp "$AAB" "$ARTIFACT_DIR/trashed-driver-release.aab"
else
  APK="android/app/build/outputs/apk/debug/app-debug.apk"
  [[ -s "$APK" ]] || { echo "missing debug APK: $APK" >&2; exit 1; }
  cp "$APK" "$ARTIFACT_DIR/trashed-driver-debug.apk"
fi

(
  cd "$ARTIFACT_DIR"
  artifacts=(./trashed-driver-debug.apk)
  if [[ "$MODE" == release ]]; then
    artifacts=(./trashed-driver-release.apk ./trashed-driver-release.aab)
  fi
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "${artifacts[@]}" | sort -k2 > SHA256SUMS
  else
    shasum -a 256 "${artifacts[@]}" | sort -k2 > SHA256SUMS
  fi
)
printf 'android_ci_mode=%s\nartifacts=%s\n' "$MODE" "$ARTIFACT_DIR"
cat "$ARTIFACT_DIR/SHA256SUMS"
