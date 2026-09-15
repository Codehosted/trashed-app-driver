#!/usr/bin/env bun
// Run from the website repo: bun ../trashed-app-mobile/scripts/local-mobile-dev.mjs
// Reuse the existing isolated review fixture, never the normal development DB.
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const OUTBOUND_ENV = /^(?:NEXT_PUBLIC_)?(?:SLACK_|TELNYX_|TWILIO_|POSTMARK_|RESEND_|APNS_|APN_|FIREBASE_|BLOB_|VERCEL_|VAPI_|STRIPE_|SPACETIME_|CORTEX_|HERMES_|OPENAI_|ANTHROPIC_|OPENROUTER_|TRISHA_|MCP_|SENTRY_|POSTHOG_|SMTP_|BREVO_|SENDGRID_)/;

export function mobileDevEnvironment(input) {
  const env = { ...input };
  const database = new URL(env.DATABASE_URL || '');
  if (!['postgres:', 'postgresql:'].includes(database.protocol) ||
      !['localhost', '127.0.0.1', '[::1]'].includes(database.hostname) ||
      database.pathname !== '/trashed-app' || database.search) {
    throw new Error('Mobile testing requires the local development database.');
  }
  database.pathname = '/trashed_ios_review_20260910';
  env.DATABASE_URL = database.toString();
  for (const key of Object.keys(env)) {
    if (OUTBOUND_ENV.test(key) || ['API_AUTH_TOKEN', 'MASTER_API_KEY', 'ADMIN_API_KEY'].includes(key)) env[key] = '';
  }
  return {
    ...env,
    NODE_ENV: 'development', APP_ENV: 'development', NEXT_PUBLIC_APP_ENV: 'development',
    NEXTAUTH_URL: 'http://localhost:3000', AUTH_URL: 'http://localhost:3000',
    EMAIL_TRANSPORT: 'mailpit', MAILPIT_HOST: 'localhost:1025',
    // Empty URIs fall back to production constants in older realtime adapters.
    SPACETIME_ACTIVE_CALLS_DISABLED: 'true', SPACETIME_IMPORT_JOBS_DISABLED: 'true',
    SPACETIME_ACTIVE_CALLS_URI: 'http://127.0.0.1:9', NEXT_PUBLIC_SPACETIME_ACTIVE_CALLS_URI: 'http://127.0.0.1:9',
    SPACETIME_IMPORT_JOBS_URI: 'http://127.0.0.1:9',
    SPACETIME_ACTIVE_CALLS_DB: 'mobile-local-disabled', NEXT_PUBLIC_SPACETIME_ACTIVE_CALLS_DB: 'mobile-local-disabled',
    SPACETIME_IMPORT_JOBS_DB: 'mobile-local-disabled',
    MAGIC_IMPORT_HERMES_DISABLED: 'true', MAGIC_IMPORT_SPACETIME_RELAY: 'false', ROUTES_BLOB_SYNC: 'false',
    DB_APPLICATION_NAME: 'trashed-mobile-local-verification', NEXT_TELEMETRY_DISABLED: '1',
  };
}

export function loadMobileDevEnvironment(projectDirectory = process.cwd()) {
  const require = createRequire(join(projectDirectory, 'package.json'));
  const { loadEnvConfig } = require('@next/env');
  // Read all env files Next will read before clearing their provider values.
  // Passing empty values to the child prevents Next from restoring those keys.
  const { combinedEnv } = loadEnvConfig(projectDirectory, true, { info() {}, error() {} });
  return mobileDevEnvironment(combinedEnv);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const env = loadMobileDevEnvironment();
  console.log('Mobile dev: port 3000; isolated local review database; outbound provider credentials disabled.');
  const child = spawn(process.execPath, ['--bun', 'node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', '3000'], { env, stdio: 'inherit' });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
  child.on('exit', (code) => process.exit(code ?? 1));
}
