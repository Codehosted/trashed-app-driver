#!/usr/bin/env bash
# Compile only: never archive, upload, boot a simulator, or contact a phone.
set -euo pipefail

SKIP_INSTALL=false
for arg in "$@"; do
  case "$arg" in
    --help|-h)
      printf '%s\n' 'Usage: npm run ios:verify -- [--skip-install]' \
        'Build an unsigned Debug app for generic iOS Simulator (no device launch).' \
        'Requires macOS, Node/npm, Xcode 26+ with Simulator SDK, and CocoaPods.' \
        'Default: npm ci, tests, Vite build, Capacitor sync (including pods), Xcode build.' \
        '--skip-install: reuse this checkout’s installed dependencies; still test/build/sync.' \
        'Outputs: unique build/ios-verify.XXXXXX/ directory; never deletes previous builds.' \
        'TRASHED_WEB_URL defaults to https://trashed.app. No signing credentials required.'
      exit 0 ;;
    --skip-install) SKIP_INSTALL=true ;;
    *) printf 'Unknown argument: %s. Use --help.\n' "$arg" >&2; exit 64 ;;
  esac
done

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
fail() { printf '%s\n' "$*" >&2; exit 2; }
[[ "$(uname -s)" == Darwin ]] || fail 'iOS verification requires macOS and full Xcode.'
for tool in node npm npx pod xcodebuild xcrun; do
  command -v "$tool" >/dev/null 2>&1 || fail "Missing $tool; see docs/mobile-build-release.md."
done
[[ -d ios/App/App.xcworkspace ]] || fail 'Missing checked-in ios/App/App.xcworkspace.'
# Vite embeds env values in bundled JavaScript. Use a clean build checkout.
for file in .env .env.local .env.production .env.production.local; do
  [[ ! -e "$file" ]] || fail "Refusing env file $file in a native build checkout; use a clean worktree."
done
node --input-type=module -e '
  const forbidden = Object.keys(process.env).filter(key => (key === "GEMINI_API_KEY" || key === "API_KEY" || key.startsWith("VITE_")) && process.env[key]);
  if (forbidden.length) { console.error("Remove client-bundled build variables: " + forbidden.join(", ")); process.exit(2); }
  const url = new URL(process.env.TRASHED_WEB_URL || "https://trashed.app");
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    console.error("TRASHED_WEB_URL must be an HTTP(S) origin without credentials, path, query or fragment."); process.exit(2);
  }
'
XCODE_VERSION="$(xcodebuild -version)"
XCODE_MAJOR="$(printf '%s\n' "$XCODE_VERSION" | /usr/bin/awk '/^Xcode / { split($2, v, "."); print v[1] }')"
[[ "$XCODE_MAJOR" =~ ^[0-9]+$ && "$XCODE_MAJOR" -ge 26 ]] || fail 'Select Xcode 26+ (not standalone Command Line Tools) using DEVELOPER_DIR or xcode-select.'
xcrun --sdk iphonesimulator --show-sdk-path >/dev/null
[[ ! -L node_modules ]] || fail 'Use checkout-local node_modules, not a shared dependency symlink.'
if [[ "$SKIP_INSTALL" == true ]]; then
  [[ -f node_modules/.bin/cap ]] || fail 'Dependencies missing; run npm ci or omit --skip-install.'
else
  npm ci
fi
export TRASHED_WEB_URL="${TRASHED_WEB_URL:-https://trashed.app}"
mkdir -p build
OUTPUT_DIR="$(mktemp -d "$ROOT_DIR/build/ios-verify.XXXXXX")"
trap 'printf "iOS verification output: %s\n" "$OUTPUT_DIR"' EXIT
npm test
npm run build
# cap sync runs pod install using the checked-in Podfile and lockfile.
npx --no-install cap sync ios
xcodebuild -workspace ios/App/App.xcworkspace -scheme App \
  -configuration Debug -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath "$OUTPUT_DIR/DerivedData" \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY= \
  build > "$OUTPUT_DIR/xcodebuild.log" 2>&1
APP_PATH="$OUTPUT_DIR/DerivedData/Build/Products/Debug-iphonesimulator/App.app"
[[ -d "$APP_PATH" ]] || fail 'Xcode did not produce the expected Simulator App.app.'
printf 'Simulator compile passed (not a signed release or runtime test): %s\n' "$APP_PATH"
