#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required environment variable: $name" >&2
    exit 2
  fi
}

require_env APP_STORE_CONNECT_KEY_ID
require_env APP_STORE_CONNECT_ISSUER_ID
require_env GOOGLE_IOS_CLIENT_ID
require_env IOS_DISTRIBUTION_CERTIFICATE_BASE64
require_env IOS_DISTRIBUTION_CERTIFICATE_PASSWORD

GOOGLE_CLIENT_ID_SUFFIX='.apps.googleusercontent.com'
if [[ ! "$GOOGLE_IOS_CLIENT_ID" =~ ^[A-Za-z0-9-]+[.]apps[.]googleusercontent[.]com$ ]]; then
  echo "GOOGLE_IOS_CLIENT_ID is not a valid Google iOS client ID." >&2
  exit 2
fi
GOOGLE_IOS_CLIENT_PREFIX="${GOOGLE_IOS_CLIENT_ID%$GOOGLE_CLIENT_ID_SUFFIX}"
GOOGLE_IOS_REVERSED_CLIENT_ID="com.googleusercontent.apps.$GOOGLE_IOS_CLIENT_PREFIX"
export GOOGLE_IOS_REVERSED_CLIENT_ID

if [[ -z "${APP_STORE_CONNECT_API_KEY_P8_BASE64:-}" && -z "${APP_STORE_CONNECT_API_KEY_P8:-}" ]]; then
  echo "Missing APP_STORE_CONNECT_API_KEY_P8_BASE64 or APP_STORE_CONNECT_API_KEY_P8" >&2
  exit 2
fi

# Do not ship the Apple button before its native token-exchange route is live.
if ! APPLE_AUTH_CONFIG="$(curl --max-time 20 --fail --silent --show-error \
  "${TRASHED_WEB_URL:-https://trashed.app}/api/auth/mobile/apple")"; then
  echo 'Deploy the native Apple login backend before uploading this app.' >&2
  exit 3
fi
if ! printf '%s' "$APPLE_AUTH_CONFIG" | python3 -c 'import json, sys; config = json.load(sys.stdin); sys.exit(0 if config.get("provider") == "apple" and config.get("audience") == "com.trashed.driver" and config.get("protocolVersion") == 1 and config.get("configured") is True else 1)'; then
  echo 'Deploy and configure the native Apple login backend before uploading this app.' >&2
  exit 3
fi

node scripts/check-mobile-backend.mjs

BUILD_NUMBER="${BUILD_NUMBER:-$(date +%Y%m%d%H%M)}"
MARKETING_VERSION="${MARKETING_VERSION:-1.0.3}"
TEAM_ID="${DEVELOPMENT_TEAM_ID:-3BYF8CNWS2}"
BUNDLE_ID="${BUNDLE_ID:-com.trashed.driver}"
PROFILE_NAME="${PROVISIONING_PROFILE_SPECIFIER:-*[expo] com.trashed.driver AppStore 2025-12-07T19:19:09.367Z}"
ARCHIVE_PATH="$ROOT_DIR/build/TestFlightArchive-$BUILD_NUMBER/App.xcarchive"
EXPORT_PATH="$ROOT_DIR/build/TestFlightExport-$BUILD_NUMBER"
KEY_DIR="$RUNNER_TEMP/appstoreconnect/private_keys"
KEY_PATH="$KEY_DIR/AuthKey_$APP_STORE_CONNECT_KEY_ID.p8"
API_KEY_PATH="$KEY_DIR/api-key.json"
KEYCHAIN_PATH="$RUNNER_TEMP/trashed-driver-signing.keychain-db"
PROFILE_PATH="$RUNNER_TEMP/trashed-driver.mobileprovision"

mkdir -p "$KEY_DIR" "$EXPORT_PATH" "$HOME/Library/MobileDevice/Provisioning Profiles"

if [[ -n "${APP_STORE_CONNECT_API_KEY_P8_BASE64:-}" ]]; then
  printf '%s' "$APP_STORE_CONNECT_API_KEY_P8_BASE64" | base64 -D > "$KEY_PATH"
else
  printf '%s' "$APP_STORE_CONNECT_API_KEY_P8" > "$KEY_PATH"
fi
chmod 600 "$KEY_PATH"
python3 - "$KEY_PATH" "$API_KEY_PATH" <<'PY'
import json, os, pathlib, sys
path = pathlib.Path(sys.argv[2])
path.touch(mode=0o600)
path.write_text(json.dumps({
    "key_id": os.environ["APP_STORE_CONNECT_KEY_ID"],
    "issuer_id": os.environ["APP_STORE_CONNECT_ISSUER_ID"],
    "key": pathlib.Path(sys.argv[1]).read_text(),
    "in_house": False,
}))
PY

security create-keychain -p "$IOS_DISTRIBUTION_CERTIFICATE_PASSWORD" "$KEYCHAIN_PATH"
security set-keychain-settings -lut 21600 "$KEYCHAIN_PATH"
security unlock-keychain -p "$IOS_DISTRIBUTION_CERTIFICATE_PASSWORD" "$KEYCHAIN_PATH"
security list-keychains -d user -s "$KEYCHAIN_PATH" $(security list-keychains -d user | sed 's/[\" ]//g')

printf '%s' "$IOS_DISTRIBUTION_CERTIFICATE_BASE64" | base64 -D > "$RUNNER_TEMP/ios_distribution.p12"
security import "$RUNNER_TEMP/ios_distribution.p12" \
  -k "$KEYCHAIN_PATH" \
  -P "$IOS_DISTRIBUTION_CERTIFICATE_PASSWORD" \
  -T /usr/bin/codesign \
  -T /usr/bin/security \
  -T /usr/bin/xcodebuild
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$IOS_DISTRIBUTION_CERTIFICATE_PASSWORD" "$KEYCHAIN_PATH"

# Renew only this app's named profile, using the imported distribution certificate.
# A saved profile from before Sign in with Apple was enabled cannot sign this app.
FASTLANE_SKIP_UPDATE_CHECK=1 FASTLANE_OPT_OUT_USAGE=1 fastlane sigh \
  --api_key_path "$API_KEY_PATH" \
  --app_identifier "$BUNDLE_ID" \
  --team_id "$TEAM_ID" \
  --provisioning_name "$PROFILE_NAME" \
  --ignore_profiles_with_different_name \
  --force --skip_install \
  --output_path "$RUNNER_TEMP" \
  --filename "$(basename "$PROFILE_PATH")"
security cms -D -i "$PROFILE_PATH" > "$RUNNER_TEMP/profile.plist"
python3 - "$RUNNER_TEMP/profile.plist" "$TEAM_ID.$BUNDLE_ID" <<'PY'
import datetime, plistlib, sys
with open(sys.argv[1], "rb") as source:
    profile = plistlib.load(source)
entitlements = profile.get("Entitlements", {})
checks = {
    "app identifier": entitlements.get("application-identifier") == sys.argv[2],
    "Sign in with Apple": entitlements.get("com.apple.developer.applesignin") == ["Default"],
    "production APNs": entitlements.get("aps-environment") == "production",
    "App Store distribution": entitlements.get("get-task-allow") is False
        and not profile.get("ProvisionedDevices") and not profile.get("ProvisionsAllDevices"),
    "expiry": profile["ExpirationDate"] > datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None),
}
failed = [name for name, valid in checks.items() if not valid]
if failed:
    sys.exit("Invalid distribution profile: " + ", ".join(failed))
print("Distribution profile verified: Apple sign-in, APNs, app identifier and expiry.")
PY
PROFILE_UUID=$(/usr/libexec/PlistBuddy -c 'Print UUID' "$RUNNER_TEMP/profile.plist")
PROFILE_NAME=$(/usr/libexec/PlistBuddy -c 'Print Name' "$RUNNER_TEMP/profile.plist")
cp "$PROFILE_PATH" "$HOME/Library/MobileDevice/Provisioning Profiles/$PROFILE_UUID.mobileprovision"
mkdir -p "$HOME/Library/Developer/Xcode/UserData/Provisioning Profiles"
cp "$PROFILE_PATH" "$HOME/Library/Developer/Xcode/UserData/Provisioning Profiles/$PROFILE_UUID.mobileprovision"

bun install --frozen-lockfile
bun run test
TRASHED_WEB_URL="${TRASHED_WEB_URL:-https://trashed.app}" bun run build
TRASHED_WEB_URL="${TRASHED_WEB_URL:-https://trashed.app}" bunx cap sync ios
(cd ios/App && pod install)

python3 - "$PROFILE_NAME" <<PY
import json, re, sys
from pathlib import Path
path = Path('ios/App/App.xcodeproj/project.pbxproj')
text = path.read_text()
text = re.sub(r'MARKETING_VERSION = [^;]+;', 'MARKETING_VERSION = $MARKETING_VERSION;', text)
text = re.sub(r'CURRENT_PROJECT_VERSION = [^;]+;', 'CURRENT_PROJECT_VERSION = $BUILD_NUMBER;', text)
text = re.sub(r'PROVISIONING_PROFILE_SPECIFIER = [^;]+;',
              lambda _: 'PROVISIONING_PROFILE_SPECIFIER = ' + json.dumps(sys.argv[1]) + ';', text)
path.write_text(text)
PY

cat > "$EXPORT_PATH/ExportOptionsUpload.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>destination</key>
  <string>upload</string>
  <key>generateAppStoreInformation</key>
  <false/>
  <key>manageAppVersionAndBuildNumber</key>
  <false/>
  <key>method</key>
  <string>app-store-connect</string>
  <key>provisioningProfiles</key>
  <dict>
    <key>$BUNDLE_ID</key>
    <string>$PROFILE_NAME</string>
  </dict>
  <key>signingCertificate</key>
  <string>iPhone Distribution</string>
  <key>signingStyle</key>
  <string>manual</string>
  <key>stripSwiftSymbols</key>
  <true/>
  <key>teamID</key>
  <string>$TEAM_ID</string>
  <key>testFlightInternalTestingOnly</key>
  <false/>
  <key>uploadSymbols</key>
  <true/>
</dict>
</plist>
PLIST

xcodebuild archive \
  -workspace ios/App/App.xcworkspace \
  -scheme App \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$ARCHIVE_PATH" \
  DEVELOPMENT_TEAM="$TEAM_ID" \
  MARKETING_VERSION="$MARKETING_VERSION" \
  CURRENT_PROJECT_VERSION="$BUILD_NUMBER" \
  GOOGLE_IOS_CLIENT_ID="$GOOGLE_IOS_CLIENT_ID" \
  GOOGLE_IOS_REVERSED_CLIENT_ID="$GOOGLE_IOS_REVERSED_CLIENT_ID"

APP_PATH="$ARCHIVE_PATH/Products/Applications/App.app"
python3 scripts/validate-ios-privacy.py "$APP_PATH/Info.plist"
/usr/libexec/PlistBuddy -c 'Print CFBundleShortVersionString' "$APP_PATH/Info.plist"
/usr/libexec/PlistBuddy -c 'Print CFBundleVersion' "$APP_PATH/Info.plist"
/usr/libexec/PlistBuddy -c 'Print GIDClientID' "$APP_PATH/Info.plist"
/usr/libexec/PlistBuddy -c 'Print CFBundleURLTypes:0:CFBundleURLSchemes:0' "$APP_PATH/Info.plist"
if /usr/libexec/PlistBuddy -c 'Print GIDClientID' "$APP_PATH/Info.plist" | grep -q '\$('; then
  echo 'GIDClientID was not expanded.' >&2
  exit 3
fi
if /usr/libexec/PlistBuddy -c 'Print CFBundleURLTypes:0:CFBundleURLSchemes:0' "$APP_PATH/Info.plist" | grep -q '\$('; then
  echo 'Google reversed client URL scheme was not expanded.' >&2
  exit 3
fi

ARCHIVE_ENTITLEMENTS="$EXPORT_PATH/App.entitlements.plist"
codesign -d --entitlements :- "$APP_PATH" > "$ARCHIVE_ENTITLEMENTS" 2>/dev/null
if [[ "$(/usr/libexec/PlistBuddy -c 'Print com.apple.developer.applesignin:0' "$ARCHIVE_ENTITLEMENTS")" != "Default" ]]; then
  echo 'Archived app is missing the Sign in with Apple entitlement.' >&2
  exit 3
fi
if [[ "$(/usr/libexec/PlistBuddy -c 'Print aps-environment' "$ARCHIVE_ENTITLEMENTS")" != "production" ]]; then
  echo 'Archived app is missing the production APNs entitlement.' >&2
  exit 3
fi
if [[ ! -d "$APP_PATH/Frameworks/CapacitorPushNotifications.framework" ]]; then
  echo 'Archived app is missing CapacitorPushNotifications.framework.' >&2
  exit 3
fi

xcodebuild -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportOptionsPlist "$EXPORT_PATH/ExportOptionsUpload.plist" \
  -exportPath "$EXPORT_PATH" \
  -authenticationKeyPath "$KEY_PATH" \
  -authenticationKeyID "$APP_STORE_CONNECT_KEY_ID" \
  -authenticationKeyIssuerID "$APP_STORE_CONNECT_ISSUER_ID"

echo "Uploaded $MARKETING_VERSION ($BUILD_NUMBER) to App Store Connect/TestFlight."
APP_STORE_CONNECT_API_KEY_PATH="$API_KEY_PATH" \
  BUNDLE_ID="$BUNDLE_ID" MARKETING_VERSION="$MARKETING_VERSION" BUILD_NUMBER="$BUILD_NUMBER" \
  FASTLANE_SKIP_UPDATE_CHECK=1 FASTLANE_OPT_OUT_USAGE=1 fastlane verify_testflight
