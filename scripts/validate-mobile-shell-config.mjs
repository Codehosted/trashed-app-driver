#!/usr/bin/env node
import { buildMobileShellConfig, getMobileShellProfile, validateMobileShellConfig } from './mobile-shell-config.mjs';

const profileKey = process.argv[2] ?? 'driver';
const shouldPrint = process.argv.includes('--print');
const profile = getMobileShellProfile(profileKey);
const config = buildMobileShellConfig(profile);
const validation = validateMobileShellConfig(profile, config);

if (!validation.ok) {
  for (const error of validation.errors) {
    console.error(error);
  }
  process.exit(1);
}

if (shouldPrint) {
  console.log(JSON.stringify(config, null, 2));
} else {
  console.log(`${profile.appName} mobile shell config is valid: ${config.server.url}`);
}
