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
  it('has Capacitor Android configured for a packaged WebView app', () => {
    assert.ok(dependencies['@capacitor/core'], 'missing @capacitor/core');
    assert.ok(dependencies['@capacitor/android'], 'missing @capacitor/android');
    assert.ok(dependencies['@capacitor/cli'], 'missing @capacitor/cli');
    assert.ok(pkg.scripts?.['cap:sync'], 'missing cap:sync script');
    assert.ok(pkg.scripts?.['android:open'], 'missing android:open script');
    assert.ok(existsSync(join(root, 'capacitor.config.ts')), 'missing capacitor.config.ts');

    const capacitorConfig = read('capacitor.config.ts');
    assert.match(capacitorConfig, /appId:\s*['"]app\.trashed\.driver['"]/, 'Capacitor appId should be app.trashed.driver');
    assert.match(capacitorConfig, /webDir:\s*['"]dist['"]/, 'Capacitor webDir should be dist');
  });

  it('exposes a WebView-first vendor experience while keeping the driver map local', () => {
    assert.ok(existsSync(join(root, 'components/VendorExperienceWebView.tsx')), 'missing VendorExperienceWebView component');
    assert.ok(existsSync(join(root, 'services/appConfig.ts')), 'missing app config service');

    const app = read('App.tsx');
    assert.match(app, /VendorExperienceWebView/, 'App must render the vendor web experience component');
    assert.match(app, /driverMap/, 'App must keep a dedicated driverMap shell view');
    assert.match(app, /vendorDashboard/, 'App must expose vendor dashboard WebView view');
    assert.match(app, /vendorDispatch/, 'App must expose vendor dispatch WebView view');
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

    const app = read('App.tsx');
    assert.match(app, /startBackgroundDriverTracking/, 'App should start background tracking for driver routes');
    assert.match(app, /stopBackgroundDriverTracking/, 'App should stop background tracking on cleanup');

    const manifest = read('android/app/src/main/AndroidManifest.xml');
    assert.match(manifest, /ACCESS_BACKGROUND_LOCATION/, 'Android manifest should declare background location permission');
    assert.match(manifest, /FOREGROUND_SERVICE_LOCATION/, 'Android manifest should declare foreground service location permission');
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
