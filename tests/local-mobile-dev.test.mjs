import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mobileDevEnvironment } from '../scripts/local-mobile-dev.mjs';
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

test('mobile test server fails closed for nonlocal and unexpected databases', () => {
  for (const DATABASE_URL of ['', 'postgres://user@production.example/trashed-app', 'postgres://user@localhost/production', 'postgres://user@localhost/trashed-app?host=remote.invalid', 'http://localhost/trashed-app']) {
    assert.throws(() => mobileDevEnvironment({ DATABASE_URL }));
  }
});

test('mobile environment disables remote realtime fallbacks and model/service credentials', () => {
  const env = mobileDevEnvironment({
    DATABASE_URL: 'postgres://user@localhost:5432/trashed-app',
    SPACETIME_ACTIVE_CALLS_TOKEN: 'fake', NEXT_PUBLIC_SPACETIME_ACTIVE_CALLS_URI: 'https://remote.invalid',
    CORTEX_API_KEY: 'fake', HERMES_API_KEY: 'fake', OPENAI_API_KEY: 'fake', API_AUTH_TOKEN: 'fake', MCP_MASTER_API_KEY: 'fake',
  });
  for (const name of ['SPACETIME_ACTIVE_CALLS_TOKEN', 'CORTEX_API_KEY', 'HERMES_API_KEY', 'OPENAI_API_KEY', 'API_AUTH_TOKEN', 'MCP_MASTER_API_KEY']) assert.equal(env[name], '');
  assert.equal(env.SPACETIME_ACTIVE_CALLS_DISABLED, 'true');
  assert.equal(new URL(env.SPACETIME_ACTIVE_CALLS_URI).hostname, '127.0.0.1');
  assert.equal(new URL(env.NEXT_PUBLIC_SPACETIME_ACTIVE_CALLS_URI).hostname, '127.0.0.1');
  assert.equal(env.NEXTAUTH_URL, 'http://localhost:3000');
});

const webRepo = resolve(dirname(fileURLToPath(import.meta.url)), '../../trashed-app');
const nextEnvDirectory = join(webRepo, 'node_modules/@next/env');
test('Next env-file loading cannot restore scrubbed credentials in the child', { skip: !existsSync(nextEnvDirectory) }, () => {
  const fixture = mkdtempSync(join(tmpdir(), 'trashed-mobile-env-'));
  try {
    mkdirSync(join(fixture, 'node_modules/@next'), { recursive: true });
    symlinkSync(nextEnvDirectory, join(fixture, 'node_modules/@next/env'));
    writeFileSync(join(fixture, '.env'), 'DATABASE_URL=postgres://user@localhost:5432/trashed-app\nAPNS_PRIVATE_KEY=fake-base-key\n');
    writeFileSync(join(fixture, '.env.development.local'), 'APNS_PRIVATE_KEY=fake-development-key\nSTRIPE_SECRET_KEY=fake-stripe\nCORTEX_API_KEY=fake-cortex\nSPACETIME_ACTIVE_CALLS_TOKEN=fake-spacetime\n');
    const script = fileURLToPath(new URL('../scripts/local-mobile-dev.mjs', import.meta.url));
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
      import { loadMobileDevEnvironment } from ${JSON.stringify(pathToFileURL(script).href)};
      import { createRequire } from 'node:module';
      const safe = loadMobileDevEnvironment(process.cwd());
      for (const key of Object.keys(process.env)) delete process.env[key];
      Object.assign(process.env, safe);
      const require = createRequire(process.cwd() + '/package.json');
      delete require.cache[require.resolve('@next/env')];
      const child = require('@next/env').loadEnvConfig(process.cwd(), true).combinedEnv;
      console.log(JSON.stringify({ isolated: new URL(child.DATABASE_URL).pathname === '/trashed_ios_review_20260910',
        stripped: ['APNS_PRIVATE_KEY','STRIPE_SECRET_KEY','CORTEX_API_KEY','SPACETIME_ACTIVE_CALLS_TOKEN'].every(key => child[key] === ''),
        realtimeLocal: new URL(child.SPACETIME_ACTIVE_CALLS_URI).hostname === '127.0.0.1' }));
    `], { cwd: fixture, env: { PATH: process.env.PATH, NODE_ENV: 'development' }, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { isolated: true, stripped: true, realtimeLocal: true });
  } finally { rmSync(fixture, { recursive: true, force: true }); }
});


test('mobile test server isolates orders and removes outbound provider credentials', () => {
  const original = { DATABASE_URL: 'postgres://user@localhost:5432/trashed-app', TELNYX_API_KEY: 'fake', APNS_KEY: 'fake', FIREBASE_SERVICE_ACCOUNT_JSON: 'fake', STRIPE_SECRET_KEY: 'fake', POSTMARK_SERVER_TOKEN: 'fake', SLACK_BOT_TOKEN: 'fake' };
  const env = mobileDevEnvironment(original);
  assert.equal(new URL(env.DATABASE_URL).pathname, '/trashed_ios_review_20260910');
  for (const key of Object.keys(original).filter((key) => key !== 'DATABASE_URL')) assert.equal(env[key], '');
  assert.equal(env.NODE_ENV, 'development');
  assert.equal(env.EMAIL_TRANSPORT, 'mailpit');
  assert.equal(original.TELNYX_API_KEY, 'fake');
});
