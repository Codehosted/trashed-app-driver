import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  DRIVER_MOBILE_PROFILE,
  PROJECTS_MOBILE_PROFILE,
  buildMobileShellConfig,
  validateMobileShellConfig,
} from '../scripts/mobile-shell-config.mjs';

const root = new URL('..', import.meta.url).pathname;
const read = (relativePath) => readFileSync(join(root, relativePath), 'utf8');

describe('Trashed Projects mobile shell profile', () => {
  it('keeps the default Trashed Driver identity and route unchanged', () => {
    const config = buildMobileShellConfig(DRIVER_MOBILE_PROFILE, {});

    assert.equal(config.appId, 'com.trashed.driver');
    assert.equal(config.appName, 'Trashed Driver');
    assert.equal(config.server.url, 'https://trashed.app/driver?source=trashed-driver-app');
    assert.deepEqual(config.server.allowNavigation, ['trashed.app']);
  });

  it('builds a separate Projects identity, route, and allowed host', () => {
    const defaultConfig = buildMobileShellConfig(PROJECTS_MOBILE_PROFILE, {});
    const rootOverride = buildMobileShellConfig(PROJECTS_MOBILE_PROFILE, {
      TRASHED_PROJECTS_WEB_URL: 'https://projects.trashed.app',
    });
    const pathOverride = buildMobileShellConfig(PROJECTS_MOBILE_PROFILE, {
      TRASHED_PROJECTS_WEB_URL: 'https://staging.trashed.app/projects',
    });

    assert.equal(defaultConfig.appId, 'app.trashed.projects');
    assert.equal(defaultConfig.appName, 'Trashed Projects');
    assert.equal(defaultConfig.server.url, 'https://projects.trashed.app/projects?source=trashed-projects-app');
    assert.deepEqual(defaultConfig.server.allowNavigation, ['projects.trashed.app']);
    assert.equal(rootOverride.server.url, 'https://projects.trashed.app/projects?source=trashed-projects-app');
    assert.equal(pathOverride.server.url, 'https://staging.trashed.app/projects?source=trashed-projects-app');
    assert.deepEqual(pathOverride.server.allowNavigation, ['staging.trashed.app']);
  });

  it('excludes driver location and background-location capabilities from Projects config', () => {
    const config = buildMobileShellConfig(PROJECTS_MOBILE_PROFILE, {});
    const validation = validateMobileShellConfig(PROJECTS_MOBILE_PROFILE, config);
    const serialized = JSON.stringify(config);

    assert.equal(validation.ok, true);
    assert.doesNotMatch(serialized, /BackgroundGeolocation|background-geolocation/i);
    assert.doesNotMatch(serialized, /ACCESS_(COARSE|FINE|BACKGROUND)_LOCATION|FOREGROUND_SERVICE_LOCATION/);
    assert.doesNotMatch(serialized, /NSLocation|UIBackgroundModes/);
  });

  it('keeps Projects app-store metadata separate from existing Driver assets', () => {
    assert.ok(existsSync(join(root, 'app-store-assets/README.md')), 'existing driver app-store assets should remain');
    assert.ok(existsSync(join(root, 'app-store-assets/projects/README.md')), 'missing separate Projects metadata directory');

    const driverAssets = read('app-store-assets/README.md');
    const projectsMetadata = read('app-store-assets/projects/README.md');

    assert.match(driverAssets, /Trashed Driver/i);
    assert.match(projectsMetadata, /Trashed Projects/i);
    assert.match(projectsMetadata, /Builders and Supporters/);
    assert.match(projectsMetadata, /free or up to 50% off retail/i);
    assert.match(projectsMetadata, /points/i);
    assert.match(projectsMetadata, /does not request location permission/i);
  });
});
