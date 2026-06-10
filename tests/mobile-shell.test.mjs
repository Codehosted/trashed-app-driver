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
});
