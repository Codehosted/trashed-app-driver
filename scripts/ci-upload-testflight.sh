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
require_env GOOGLE_IOS_REVERSED_CLIENT_ID
require_env IOS_DISTRIBUTION_CERTIFICATE_BASE64
require_env IOS_DISTRIBUTION_CERTIFICATE_PASSWORD
require_env IOS_APPSTORE_PROFILE_BASE64

if [[ -z "${APP_STORE_CONNECT_API_KEY_P8_BASE64:-}" && -z "${APP_STORE_CONNECT_API_KEY_P8:-}" ]]; then
  echo "Missing APP_STORE_CONNECT_API_KEY_P8_BASE64 or APP_STORE_CONNECT_API_KEY_P8" >&2
  exit 2
fi

BUILD_NUMBER="${BUILD_NUMBER:-$(date +%Y%m%d%H%M)}"
MARKETING_VERSION="${MARKETING_VERSION:-1.0.2}"
TEAM_ID="${DEVELOPMENT_TEAM_ID:-3BYF8CNWS2}"
BUNDLE_ID="${BUNDLE_ID:-com.trashed.driver}"
PROFILE_NAME="${PROVISIONING_PROFILE_SPECIFIER:-*[expo] com.trashed.driver AppStore 2025-12-07T19:19:09.367Z}"
ARCHIVE_PATH="$ROOT_DIR/build/TestFlightArchive-$BUILD_NUMBER/App.xcarchive"
EXPORT_PATH="$ROOT_DIR/build/TestFlightExport-$BUILD_NUMBER"
KEY_DIR="$RUNNER_TEMP/appstoreconnect/private_keys"
KEY_PATH="$KEY_DIR/AuthKey_$APP_STORE_CONNECT_KEY_ID.p8"
KEYCHAIN_PATH="$RUNNER_TEMP/trashed-driver-signing.keychain-db"
PROFILE_PATH="$RUNNER_TEMP/trashed-driver.mobileprovision"

mkdir -p "$KEY_DIR" "$EXPORT_PATH" "$HOME/Library/MobileDevice/Provisioning Profiles"

if [[ -n "${APP_STORE_CONNECT_API_KEY_P8_BASE64:-}" ]]; then
  printf '%s' "$APP_STORE_CONNECT_API_KEY_P8_BASE64" | base64 -D > "$KEY_PATH"
else
  printf '%s' "$APP_STORE_CONNECT_API_KEY_P8" > "$KEY_PATH"
fi
chmod 600 "$KEY_PATH"

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

printf '%s' "$IOS_APPSTORE_PROFILE_BASE64" | base64 -D > "$PROFILE_PATH"
PROFILE_UUID=$(/usr/libexec/PlistBuddy -c 'Print UUID' /dev/stdin <<< "$(security cms -D -i "$PROFILE_PATH")")
cp "$PROFILE_PATH" "$HOME/Library/MobileDevice/Provisioning Profiles/$PROFILE_UUID.mobileprovision"

npm install
TRASHED_WEB_URL="${TRASHED_WEB_URL:-https://trashed.app}" npm run build
TRASHED_WEB_URL="${TRASHED_WEB_URL:-https://trashed.app}" npx cap sync ios
(cd ios/App && pod install)

python3 - <<PY
import re
from pathlib import Path
path = Path('ios/App/App.xcodeproj/project.pbxproj')
text = path.read_text()
text = re.sub(r'MARKETING_VERSION = [^;]+;', 'MARKETING_VERSION = $MARKETING_VERSION;', text)
text = re.sub(r'CURRENT_PROJECT_VERSION = [^;]+;', 'CURRENT_PROJECT_VERSION = $BUILD_NUMBER;', text)
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

xcodebuild -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportOptionsPlist "$EXPORT_PATH/ExportOptionsUpload.plist" \
  -exportPath "$EXPORT_PATH" \
  -authenticationKeyPath "$KEY_PATH" \
  -authenticationKeyID "$APP_STORE_CONNECT_KEY_ID" \
  -authenticationKeyIssuerID "$APP_STORE_CONNECT_ISSUER_ID"

echo "Uploaded $MARKETING_VERSION ($BUILD_NUMBER) to App Store Connect/TestFlight."
