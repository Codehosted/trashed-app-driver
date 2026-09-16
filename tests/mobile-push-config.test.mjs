import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { validateAndroidPushConfig } from '../scripts/check-mobile-push-config.mjs';

const fixture = () => ({
  project_info: { project_id: 'trashed-app', project_number: '123456789' },
  client: [{
    client_info: { mobilesdk_app_id: '1:123456789:android:abcdef123456', android_client_info: { package_name: 'com.trashed.driver' } },
    api_key: [{ current_key: 'synthetic-test-key' }],
  }],
});

test('accepts the existing Trashed Android Firebase application without printing its configuration', () => {
  assert.deepEqual(validateAndroidPushConfig(fixture()), { packageName: 'com.trashed.driver', projectId: 'trashed-app' });
});

for (const [name, mutate] of [
  ['wrong project', (d) => { d.project_info.project_id = 'other-project'; }],
  ['missing sender ID', (d) => { delete d.project_info.project_number; }],
  ['invalid sender ID', (d) => { d.project_info.project_number = 'bad'; }],
  ['wrong package', (d) => { d.client[0].client_info.android_client_info.package_name = 'com.example.app'; }],
  ['missing application ID', (d) => { delete d.client[0].client_info.mobilesdk_app_id; }],
  ['mismatched sender ID', (d) => { d.client[0].client_info.mobilesdk_app_id = '1:999:android:abcdef123456'; }],
  ['wrong platform', (d) => { d.client[0].client_info.mobilesdk_app_id = '1:123456789:ios:abcdef123456'; }],
  ['missing API key', (d) => { d.client[0].api_key = []; }],
  ['empty API key', (d) => { d.client[0].api_key[0].current_key = ' '; }],
  ['ambiguous application', (d) => { d.client.push(structuredClone(d.client[0])); }],
]) {
  test(`blocks release with ${name}`, () => {
    const config = fixture(); mutate(config);
    assert.throws(() => validateAndroidPushConfig(config), /Android push configuration/);
  });
}

for (const value of [null, [], 'invalid', {}, { project_info: {}, client: {} }]) {
  test(`rejects malformed configuration ${JSON.stringify(value)}`, () => {
    assert.throws(() => validateAndroidPushConfig(value), /Android push configuration/);
  });
}

test('CLI reports missing and malformed config without leaking config content', () => {
  const directory = mkdtempSync(join(tmpdir(), 'trashed-push-config-'));
  try {
    const path = join(directory, 'google-services.json');
    for (const contents of [null, 'private-invalid-value', JSON.stringify(fixture())]) {
      if (contents !== null) writeFileSync(path, contents);
      const result = spawnSync(process.execPath, ['scripts/check-mobile-push-config.mjs', path], { encoding: 'utf8', timeout: 5000 });
      assert.equal(result.status, contents === JSON.stringify(fixture()) ? 0 : 3, result.stderr);
      assert.doesNotMatch(result.stdout + result.stderr, /private-invalid-value|synthetic-test-key|abcdef123456/);
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('missing Firebase config stops an otherwise-ready release before downstream commands', () => {
  const directory = mkdtempSync(join(tmpdir(), 'trashed-push-release-gate-'));
  const trace = join(directory, 'trace');
  const sentinel = join(directory, 'keep-artifact');
  try {
    writeFileSync(sentinel, 'existing artifact');
    writeFileSync(join(directory, 'node'), '#!/bin/sh\ncase "$1" in\n scripts/check-mobile-backend.mjs) exit 0 ;;\n scripts/check-mobile-push-config.mjs) exec "$REAL_NODE" "$PUSH_CONFIG_CLI" "$MISSING_PUSH_CONFIG" ;;\n *) exit 91 ;;\nesac\n', { mode: 0o755 });
    for (const name of ['npm', 'npx', 'security', 'gradle']) {
      writeFileSync(join(directory, name), '#!/bin/sh\nprintf "unexpected\\n" >> "$GATE_TRACE"\nexit 92\n', { mode: 0o755 });
    }
    const result = spawnSync('bash', ['scripts/ci-build-android.sh', 'release'], {
      encoding: 'utf8', timeout: 5000,
      env: { ...process.env, PATH: `${directory}:${process.env.PATH}`, REAL_NODE: process.execPath,
        PUSH_CONFIG_CLI: new URL('../scripts/check-mobile-push-config.mjs', import.meta.url).pathname,
        MISSING_PUSH_CONFIG: join(directory, 'missing.json'), GATE_TRACE: trace,
        ARTIFACT_DIR: directory, TRASHED_ANDROID_VERSION_CODE: '999', TRASHED_ANDROID_VERSION_NAME: 'test-only' },
    });
    assert.equal(result.status, 3, result.stderr);
    assert.match(result.stderr, /Android push configuration/);
    assert.equal(readFileSync(sentinel, 'utf8'), 'existing artifact');
    assert.throws(() => readFileSync(trace), { code: 'ENOENT' });
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('Android release checks push config before dependencies, artifact deletion or signing', () => {
  const script = readFileSync(new URL('../scripts/ci-build-android.sh', import.meta.url), 'utf8');
  const gate = script.indexOf('node scripts/check-mobile-push-config.mjs');
  assert.ok(gate > 0, 'release requires a push configuration gate');
  assert.ok(gate < script.indexOf('rm -rf "$ARTIFACT_DIR"'));
  assert.match(script, /if \[\[ "\$MODE" == release \]\]; then\s+node scripts\/check-mobile-backend\.mjs\s+node scripts\/check-mobile-push-config\.mjs\s+fi/);
});
