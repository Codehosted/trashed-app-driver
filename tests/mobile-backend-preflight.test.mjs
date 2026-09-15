import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { checkMobileBackend } from '../scripts/check-mobile-backend.mjs';

const root = new URL('..', import.meta.url).pathname;
const login = '/app/login?callbackUrl=%2Fapp&source=trashed-app';
const response = (status, location) => new Response(null, {
  status, headers: location == null ? {} : { Location: location },
});

for (const location of [login, `https://trashed.app${login}`, '/app/login?source=trashed-app&callbackUrl=%2Fapp']) {
  test(`accepts the exact mobile entry contract: ${location}`, async () => {
    await checkMobileBackend(async (url, options) => {
      assert.equal(url, 'https://trashed.app/app');
      assert.equal(options.method, 'GET');
      assert.equal(options.redirect, 'manual');
      assert.equal(options.credentials, 'omit');
      assert.equal(options.headers['Cache-Control'], 'no-cache');
      assert.ok(options.signal instanceof AbortSignal);
      return response(307, location);
    });
  });
}

for (const status of [200, 301, 302, 303, 308, 401, 403, 404, 500, 503]) {
  test(`fails closed on HTTP ${status}`, async () => {
    await assert.rejects(checkMobileBackend(async () => response(status, login)), new RegExp(`HTTP ${status}`));
  });
}

for (const location of [
  null, '', 'https://other.example/app/login?callbackUrl=%2Fapp&source=trashed-app',
  `http://trashed.app${login}`, `https://trashed.app:8443${login}`, `//other.example${login}`,
  `https://username:password@trashed.app${login}`, '/partners/login', '/driver',
  '/app/login?callbackUrl=%2Fdriver&source=trashed-app',
  '/app/login?callbackUrl=https%3A%2F%2Ftrashed.app%2Fapp&source=trashed-app',
  '/app/login?callbackUrl=%2Fapp&source=trashed-driver-app',
  '/app/login?callbackUrl=%2Fapp', '/app/login?source=trashed-app',
  `${login}&source=trashed-app`, `${login}&extra=1`, `${login}#fragment`, 'https://[invalid',
]) {
  test(`fails closed on a wrong login redirect: ${location}`, async () => {
    await assert.rejects(checkMobileBackend(async () => response(307, location)), /expected Trashed mobile login/);
  });
}

test('network failure or timeout blocks release', async () => {
  for (const error of [new TypeError('fetch failed'), new DOMException('Timed out', 'TimeoutError')]) {
    await assert.rejects(checkMobileBackend(async () => { throw error; }), /Could not reach production \/app/);
  }
});

test('release scripts stop before artifact deletion, dependency installation, or signing when preflight fails', () => {
  const directory = mkdtempSync(join(tmpdir(), 'trashed-release-preflight-'));
  const trace = join(directory, 'trace');
  const artifacts = join(directory, 'artifacts');
  try {
    // Mock the shared CLI boundary and Apple discovery; never contact a provider.
    writeFileSync(join(directory, 'node'), '#!/bin/sh\n[ "$1" = scripts/check-mobile-backend.mjs ] || exit 91\nprintf "preflight\\n" >> "$PREFLIGHT_TRACE"\necho "production /app is not ready" >&2\nexit 3\n', { mode: 0o755 });
    writeFileSync(join(directory, 'curl'), '#!/bin/sh\nprintf \'{"provider":"apple","audience":"com.trashed.driver","protocolVersion":1,"configured":true}\'\n', { mode: 0o755 });
    for (const command of ['npm', 'bun', 'security', 'fastlane', 'xcodebuild']) {
      writeFileSync(join(directory, command), '#!/bin/sh\nprintf "unexpected downstream command\\n" >> "$PREFLIGHT_TRACE"\nexit 92\n', { mode: 0o755 });
    }
    const env = {
      ...process.env, PATH: `${directory}:${process.env.PATH}`, PREFLIGHT_TRACE: trace,
      ARTIFACT_DIR: artifacts, RUNNER_TEMP: directory,
      TRASHED_WEB_URL: 'http://localhost:3000',
      TRASHED_ANDROID_VERSION_CODE: '99', TRASHED_ANDROID_VERSION_NAME: 'test-only',
      APP_STORE_CONNECT_KEY_ID: 'test', APP_STORE_CONNECT_ISSUER_ID: 'test',
      APP_STORE_CONNECT_API_KEY_P8: 'test', GOOGLE_IOS_CLIENT_ID: 'test.apps.googleusercontent.com',
      IOS_DISTRIBUTION_CERTIFICATE_BASE64: 'test', IOS_DISTRIBUTION_CERTIFICATE_PASSWORD: 'test',
    };
    for (const args of [['scripts/ci-upload-testflight.sh'], ['scripts/ci-build-android.sh', 'release']]) {
      writeFileSync(trace, '');
      const result = spawnSync('bash', args, { cwd: root, env, encoding: 'utf8', timeout: 10_000 });
      assert.equal(result.status, 3, result.stderr);
      assert.match(result.stderr, /production \/app is not ready/);
      assert.equal(readFileSync(trace, 'utf8'), 'preflight\n');
      assert.equal(existsSync(artifacts), false);
      assert.equal(existsSync(join(directory, 'appstoreconnect')), false);
    }
    const android = readFileSync(join(root, 'scripts/ci-build-android.sh'), 'utf8');
    assert.match(android, /if \[\[ "\$MODE" == release \]\]; then\s+node scripts\/check-mobile-backend\.mjs\s+fi/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
