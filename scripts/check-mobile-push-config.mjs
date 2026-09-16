#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PACKAGE = 'com.trashed.driver';
const PROJECT = 'trashed-app';
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = (reason) => { throw new Error(`Android push configuration: ${reason}`); };

/** Configuration prerequisite only; this does not prove FCM device delivery. */
export function validateAndroidPushConfig(config) {
  if (!object(config) || !object(config.project_info) || !Array.isArray(config.client)) {
    fail('expected a Firebase google-services.json object.');
  }
  const info = config.project_info;
  if (info.project_id !== PROJECT) fail('Firebase project must match the Trashed push backend.');
  if (typeof info.project_number !== 'string' || !/^[1-9]\d*$/.test(info.project_number)) {
    fail('missing or invalid Firebase sender ID.');
  }
  const clients = config.client.filter((client) =>
    object(client) && client.client_info?.android_client_info?.package_name === PACKAGE);
  if (clients.length !== 1) fail('expected exactly one client for the Trashed Android package.');
  const client = clients[0];
  const appID = client.client_info.mobilesdk_app_id;
  if (typeof appID !== 'string' || !new RegExp(`^1:${info.project_number}:android:[a-fA-F0-9]+$`).test(appID)) {
    fail('application ID must match the Android platform and sender ID.');
  }
  if (!Array.isArray(client.api_key) || !client.api_key.some((entry) =>
    typeof entry?.current_key === 'string' && entry.current_key.trim().length > 0)) {
    fail('missing Firebase client API key.');
  }
  return { packageName: PACKAGE, projectId: PROJECT };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const path = process.argv[2] || fileURLToPath(new URL('../android/app/google-services.json', import.meta.url));
  try {
    let config;
    try { config = JSON.parse(readFileSync(path, 'utf8')); }
    catch { fail('provide a readable, valid android/app/google-services.json before release.'); }
    validateAndroidPushConfig(config);
    console.log('Android push configuration verified for Trashed. Device delivery still requires testing.');
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Android push configuration is invalid.');
    process.exitCode = 3;
  }
}
