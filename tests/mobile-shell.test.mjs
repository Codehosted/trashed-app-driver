import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const root = new URL('..', import.meta.url).pathname;
const read = (relativePath) => readFileSync(join(root, relativePath), 'utf8');
const pkg = JSON.parse(read('package.json'));

const dependencies = {
  ...pkg.dependencies,
  ...pkg.devDependencies,
};

describe('mobile WebView shell contract', () => {
  it('has Capacitor configured for the packaged WebView app', () => {
    assert.ok(dependencies['@capacitor/core'], 'missing @capacitor/core');
    assert.ok(dependencies['@capacitor/android'], 'missing @capacitor/android');
    assert.ok(dependencies['@capacitor/ios'], 'missing @capacitor/ios');
    assert.ok(dependencies['@capacitor/cli'], 'missing @capacitor/cli');
    assert.ok(pkg.scripts?.['cap:sync'], 'missing cap:sync script');
    assert.ok(pkg.scripts?.['cap:sync:ios'], 'missing cap:sync:ios script');
    assert.ok(pkg.scripts?.['cap:sync:ios:dev'], 'missing cap:sync:ios:dev script');
    assert.ok(pkg.scripts?.['android:open'], 'missing android:open script');
    assert.ok(pkg.scripts?.['ios:open'], 'missing ios:open script');
    assert.ok(existsSync(join(root, 'capacitor.config.ts')), 'missing capacitor.config.ts');

    const capacitorConfig = read('capacitor.config.ts');
    assert.match(capacitorConfig, /appId:\s*['"]com\.trashed\.driver['"]/, 'Capacitor appId should be com.trashed.driver');
    assert.match(capacitorConfig, /webDir:\s*['"]dist['"]/, 'Capacitor webDir should be dist');

    const androidBuild = read('android/app/build.gradle');
    const androidStrings = read('android/app/src/main/res/values/strings.xml');
    assert.match(androidBuild, /applicationId \"com\.trashed\.driver\"/, 'Android applicationId should match the Capacitor appId');
    assert.match(androidBuild, /namespace \"com\.trashed\.driver\"/, 'Android namespace should match the app package');
    assert.match(androidStrings, /<string name=\"package_name\">com\.trashed\.driver<\/string>/, 'Android package string should match the app package');
  });

  it('shows a native iOS driver sign-in before falling back to the WebView login', () => {
    const controller = read('ios/App/App/MainViewController.swift');
    const xcodeProject = read('ios/App/App.xcodeproj/project.pbxproj');
    assert.ok(existsSync(join(root, 'ios/App/App/Assets.xcassets/TrashedLogoMark.imageset/Contents.json')), 'missing real Trashed logo image set');
    assert.match(xcodeProject, /trashed-logo-mark\*\.png/, 'real Trashed logo images should be copied into the app bundle');
    assert.match(controller, /NativeDriverLoginView/, 'iOS should render a native SwiftUI driver login screen');
    assert.match(controller, /Driver Sign In/, 'native login should mirror the driver sign-in title');
    assert.match(controller, /trashed-logo-mark/, 'native login should use the real Trashed logo asset');
    assert.match(controller, /@Environment\(\\\.colorScheme\)/, 'native login should follow the iOS light or dark appearance');
    assert.match(controller, /DriverLoginMapBackground\(isLightMode: isLightMode\)/, 'native login should use the same map-style background as the driver shell');
    assert.match(controller, /Color\(red: 0\.94, green: 0\.96, blue: 0\.97\).*Color\(red: 0\.04, green: 0\.04, blue: 0\.04\)/s, 'native login background should match the driver map light and dark base colors');
    assert.match(controller, /routePath\(in: size\)[\s\S]*StrokeStyle\(lineWidth: 13, lineCap: \.round, lineJoin: \.round\)/, 'native login background should include the driver map route surface');
    assert.match(controller, /renderingMode\(\.template\)[\s\S]*foregroundColor\(logoColor\)[\s\S]*frame\(width: 104, height: 82\)/, 'native login should render the real logo directly without a badge container');
    assert.match(controller, /components\.path = \"\/driver\"/, 'native shell should start on the driver app route, not the marketing site or full web login');
    assert.doesNotMatch(controller, /Text\(\"T\"\)/, 'native login must not use a fake text-logo placeholder');
    assert.match(controller, /\/api\/auth\/mobile\/login/, 'native login should post credentials to the mobile auth endpoint');
    assert.match(controller, /__Secure-next-auth\.session-token/, 'native login should install secure NextAuth session cookies');
    assert.match(controller, /signInWithGoogle/, 'Google sign-in should use native Google Sign-In instead of the website OAuth redirect');
    assert.doesNotMatch(controller, /components\.path = "\/app\/login"/, 'native startup must not point the WebView at website login chrome');
    assert.match(controller, /\/driver\?source=trashed-driver-app&theme=\\\(theme\.rawValue\)/, 'successful native login should load the driver shell with native theme context');
    assert.match(controller, /currentDriverTheme == \.light \? \.darkContent : \.lightContent/, 'status bar contrast should follow the native theme');

    const logoBlock = controller.match(/logoImage[\s\S]*?accessibilityHidden\(true\)/)?.[0] || '';
    assert.doesNotMatch(logoBlock, /\.background|\.cornerRadius|\.overlay|RoundedRectangle/, 'logo should not sit inside an outlined or tinted container');
  });

  it('shows a native Android driver sign-in before loading the WebView app', () => {
    const activity = read('android/app/src/main/java/com/trashed/driver/MainActivity.java');
    assert.match(activity, /api\/auth\/mobile\/login/, 'Android native login should post credentials to the mobile auth endpoint');
    assert.match(activity, /CookieManager\.getInstance\(\)/, 'Android native login should install returned session cookies');
    assert.match(activity, /next-auth\.session-token/, 'Android native login should verify the NextAuth session cookie');
    assert.match(activity, /getBridge\(\)\.getWebView\(\)\.loadUrl\(authConfig\.driverUrl\)/, 'successful Android native login should load the driver WebView in-app');
    assert.match(activity, /GoogleSignInOptions/, 'Android Google sign-in should use native Google Sign-In');
    assert.match(activity, /api\/auth\/mobile\/google/, 'Android Google sign-in should exchange the native ID token with the mobile auth endpoint');
    assert.match(activity, /platform=android/, 'Android Google sign-in should request Android-specific mobile Google config');
    assert.doesNotMatch(activity, /accounts\.google\.com|ACTION_VIEW/, 'Android native login must not launch browser OAuth from the WebView shell');
  });

  it('loads the real Trashed driver page as the native shell', () => {
    const capacitorConfig = read('capacitor.config.ts');
    assert.match(capacitorConfig, /https:\/\/trashed\.app/, 'TestFlight default should target production Trashed');
    assert.match(capacitorConfig, /\/driver\?source=trashed-driver-app/, 'native shell should open the driver page');
    assert.match(capacitorConfig, /allowNavigation/, 'same-host navigation should stay in the WebView');
    assert.match(pkg.scripts['cap:sync:ios:dev'], /https:\/\/preview\.trashed\.app/, 'iOS dev sync should target the Cloudflare tunnel');

    const app = read('App.tsx');
    assert.match(app, /driverMap/, 'local preview fallback should still expose the driver map');
    assert.match(app, /urlParams\.get\('view'\)/, 'local preview fallback should support view-specific screenshot and smoke-test entrypoints');
    assert.match(app, /urlParams\.get\('theme'\) \|\| urlParams\.get\('mode'\)/, 'driver shell should accept native theme context from the URL');
    assert.match(app, /env\(safe-area-inset-top/, 'iOS route overlays should account for the status bar safe area');
    assert.match(app, /vendorAssistant/, 'mobile shell should expose the vendor AI assistant entrypoint');
    assert.match(app, /data-native-action="openVendorAssistant"/, 'driver map should include a native action for opening vendor AI assistant');

    const appConfig = read('services/appConfig.ts');
    assert.match(appConfig, /assistant:\s*'\/vendor\/assistant'/, 'vendor AI assistant should route to the real vendor assistant page');
  });

  it('sends driver position beacons to the Trashed web app API from the WebView shell', () => {
    assert.ok(existsSync(join(root, 'services/driverTracking.ts')), 'missing driver tracking beacon service');
    const tracking = read('services/driverTracking.ts');
    assert.match(tracking, /\/api\/vendor\/driver\/tracking/, 'tracking service should target vendor driver tracking API');
    assert.match(tracking, /sendDriverPositionBeacon/, 'tracking service should export sendDriverPositionBeacon');
    assert.match(tracking, /routeUuid/, 'tracking beacon payload should include routeUuid');
  });

  it('uses a native background location watcher for active routes', () => {
    assert.ok(
      dependencies['@capacitor-community/background-geolocation'],
      'missing @capacitor-community/background-geolocation dependency'
    );
    assert.ok(existsSync(join(root, 'services/backgroundLocationTracking.ts')), 'missing background location tracking service');

    const backgroundTracking = read('services/backgroundLocationTracking.ts');
    assert.match(backgroundTracking, /registerPlugin(?:<[^>]+>)?\(['"]BackgroundGeolocation['"]\)/, 'service should register the native BackgroundGeolocation plugin');
    assert.match(backgroundTracking, /backgroundMessage/, 'service should configure foreground-service background notification copy');
    assert.match(backgroundTracking, /distanceFilter/, 'service should configure a native distance filter');
    assert.match(backgroundTracking, /sendDriverPositionBeacon/, 'background watcher should send driver tracking beacons');
    assert.match(backgroundTracking, /const attemptedAt = Date\.now\(\);[\s\S]*lastBeaconAt = attemptedAt;[\s\S]*maybeSendBeacon/, 'background watcher should throttle beacon attempts before awaiting POST completion');
    assert.doesNotMatch(backgroundTracking, /maybeSendBeacon\([^)]*lastBeaconAt/, 'beacon throttle timestamp must not update only after async POST completion');

    const app = read('App.tsx');
    assert.match(app, /startBackgroundDriverTracking/, 'App should start background tracking for driver routes');
    assert.match(app, /stopBackgroundDriverTracking/, 'App should stop background tracking on cleanup');
    assert.match(app, /LOCATION_DISCLOSURE_STORAGE_KEY/, 'App should gate background tracking behind an explicit location disclosure');
    assert.match(app, /even when the app is closed or not in use/, 'location disclosure should explain background location use');
    assert.match(app, /persistent Android notification/, 'location disclosure should mention the foreground-service notification');
    assert.match(app, /const isRouteActive = useMemo\(\(\) => isRouteTrackingActive\(stops\), \[stops\]\)/, 'route activity should be derived from stop statuses');
    assert.doesNotMatch(app, /setIsRouteActive/, 'route activity should not be a stale one-way boolean');
    assert.match(app, /stop\.status === 'in-transit' \|\| stop\.status === 'arrived'/, 'route tracking should stop when all stops are completed');

    const manifest = read('android/app/src/main/AndroidManifest.xml');
    assert.match(manifest, /ACCESS_BACKGROUND_LOCATION/, 'Android manifest should declare background location permission');
    assert.match(manifest, /FOREGROUND_SERVICE_LOCATION/, 'Android manifest should declare foreground service location permission');

    const iosInfo = read('ios/App/App/Info.plist');
    const iosController = read('ios/App/App/MainViewController.swift');
    assert.match(iosInfo, /NSLocationWhenInUseUsageDescription/, 'iOS must explain foreground location use');
    assert.match(iosInfo, /NSLocationAlwaysAndWhenInUseUsageDescription/, 'iOS must explain background location use');
    assert.match(iosInfo, /UIBackgroundModes[\s\S]*location/, 'iOS must enable background location mode');
    assert.match(iosController, /driverSafeAreaScript[\s\S]*safe-area-inset-top/, 'iOS WebView should inject safe-area protection for the remote driver page');
  });

  it('keeps Google geocoding behind Trashed web API routes, not mobile credentials', () => {
    const appConfig = read('services/appConfig.ts');
    assert.match(appConfig, /\/api\/address\/reverse-geocode/, 'mobile app should call Trashed reverse-geocode API route');
    assert.doesNotMatch(appConfig, /GOOGLE(_MAPS)?_API_KEY|maps\.googleapis\.com/, 'mobile app config must not reference Google API credentials directly');

    const allMobileSources = [
      'App.tsx',
      'services/appConfig.ts',
      'services/driverTracking.ts',
      existsSync(join(root, 'services/backgroundLocationTracking.ts')) ? 'services/backgroundLocationTracking.ts' : null,
    ].filter(Boolean).map(read).join('\n');

    assert.doesNotMatch(
      allMobileSources,
      /GOOGLE(_MAPS)?_API_KEY|maps\.googleapis\.com|AIza[0-9A-Za-z_-]+/,
      'driver mobile source must not ship Google API credentials or call Google APIs directly'
    );
  });
});
