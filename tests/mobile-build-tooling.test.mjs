import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const run = (args, env = {}) => spawnSync('bash', ['scripts/verify-ios.sh', ...args], {
  cwd: root, env: { ...process.env, ...env }, encoding: 'utf8', timeout: 5000,
});

test('npm exposes explicit build and upload commands without changing CI entrypoints', () => {
  const { scripts } = JSON.parse(read('package.json'));
  assert.equal(scripts['android:verify'], 'bash scripts/ci-build-android.sh verify');
  assert.equal(scripts['android:release'], 'bash scripts/ci-build-android.sh release');
  assert.equal(scripts['ios:verify'], 'bash scripts/verify-ios.sh');
  assert.equal(scripts['ios:testflight'], 'bash scripts/ci-upload-testflight.sh');
  assert.equal(scripts['mobile:preflight'], 'node scripts/check-mobile-backend.mjs');
});

test('iOS help and invalid arguments exit before dependency or Xcode work', () => {
  const help = run(['--help'], { PATH: '/usr/bin:/bin' });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /Simulator/);
  assert.match(help.stdout, /--skip-install/);
  for (const arg of ['release', '--destination', '--upload']) {
    const result = run([arg]);
    assert.equal(result.status, 64, result.stderr);
  }
});

test('iOS pipeline builds unsigned generic Simulator only and propagates build failure', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'ios-build-tooling-'));
  try {
    for (const dir of ['scripts', 'bin', 'node_modules/.bin', 'ios/App/App.xcworkspace']) mkdirSync(join(fixture, dir), { recursive: true });
    copyFileSync(new URL('scripts/verify-ios.sh', root), join(fixture, 'scripts/verify-ios.sh'));
    writeFileSync(join(fixture, 'node_modules/.bin/cap'), '');
    const log = join(fixture, 'commands');
    for (const cmd of ['uname', 'npm', 'npx', 'pod', 'xcrun', 'xcodebuild']) {
      writeFileSync(join(fixture, 'bin', cmd), `#!/bin/bash\nprintf '%s\\n' '${cmd} '"$*" >> "$COMMAND_LOG"\nif [[ '${cmd}' == uname ]]; then echo Darwin; fi\nif [[ '${cmd}' == xcodebuild && "\u0024{1:-}" == -version ]]; then echo 'Xcode 26.6'; fi\nif [[ '${cmd}' == xcodebuild && "\u0024{1:-}" != -version ]]; then exit 42; fi\n`, { mode: 0o755 });
    }
    const env = { ...process.env, PATH: `${join(fixture, 'bin')}:${process.env.PATH}`, COMMAND_LOG: log };
    delete env.GEMINI_API_KEY;
    delete env.API_KEY;
    for (const key of Object.keys(env)) if (key.startsWith('VITE_')) delete env[key];
    const result = spawnSync('bash', ['scripts/verify-ios.sh', '--skip-install'], { cwd: fixture, env, encoding: 'utf8', timeout: 5000 });
    assert.equal(result.status, 42, result.stderr);
    const commands = readFileSync(log, 'utf8');
    assert.match(commands, /npm test[\s\S]*npm run build[\s\S]*npx --no-install cap sync ios/);
    assert.match(commands, /-workspace ios\/App\/App.xcworkspace -scheme App/);
    assert.match(commands, /-destination generic\/platform=iOS Simulator/);
    assert.match(commands, /CODE_SIGNING_ALLOWED=NO/);
    assert.doesNotMatch(commands, /npm ci|archive|exportArchive|simctl|devicectl|fastlane/);
    for (const unsafe of [{ GEMINI_API_KEY: 'fixture-only' }, { TRASHED_WEB_URL: 'https://user:fixture@example.invalid' }, { TRASHED_WEB_URL: 'https://example.invalid/app' }]) {
      const blocked = spawnSync('bash', ['scripts/verify-ios.sh'], { cwd: fixture, env: { ...env, ...unsafe }, encoding: 'utf8', timeout: 5000 });
      assert.equal(blocked.status, 2, blocked.stderr);
      assert.doesNotMatch(blocked.stderr, /fixture-only|user:fixture/);
    }
    writeFileSync(join(fixture, '.env.local'), 'GEMINI_API_KEY=fixture-only\n');
    const denied = spawnSync('bash', ['scripts/verify-ios.sh'], { cwd: fixture, env, encoding: 'utf8', timeout: 5000 });
    assert.equal(denied.status, 2, denied.stderr);
    assert.match(denied.stderr, /env file/);
  } finally { rmSync(fixture, { recursive: true, force: true }); }
});

test('Android only removes its named artifacts and supports macOS checksums', () => {
  const script = read('scripts/ci-build-android.sh');
  assert.doesNotMatch(script, /rm -rf/);
  assert.match(script, /shasum -a 256/);
});
