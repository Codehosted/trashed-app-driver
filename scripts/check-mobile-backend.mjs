#!/usr/bin/env node
import { pathToFileURL } from 'node:url';

const appUrl = 'https://trashed.app/app';

export async function checkMobileBackend(fetchImpl = globalThis.fetch) {
  let response;
  try {
    response = await fetchImpl(appUrl, {
      method: 'GET', redirect: 'manual', credentials: 'omit',
      headers: { Accept: 'text/html', 'Cache-Control': 'no-cache' },
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new Error('Could not reach production /app. Deploy the mobile web entry before release.');
  }
  await response.body?.cancel();
  if (response.status !== 307) {
    throw new Error(`Production /app returned HTTP ${response.status}; expected its unauthenticated login redirect.`);
  }

  const location = response.headers.get('location');
  let target;
  try {
    target = location ? new URL(location, appUrl) : null;
  } catch {
    target = null;
  }
  if (!target || target.origin !== 'https://trashed.app' || target.pathname !== '/app/login' ||
      target.username || target.password || target.hash || [...target.searchParams].length !== 2 ||
      target.searchParams.get('callbackUrl') !== '/app' || target.searchParams.get('source') !== 'trashed-app') {
    throw new Error('Production /app does not redirect to the expected Trashed mobile login. Deploy the mobile web entry before release.');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await checkMobileBackend();
    console.log('Mobile backend ready: production /app redirects to Trashed mobile login.');
  } catch (error) {
    console.error(`Mobile backend preflight failed: ${error.message}`);
    process.exitCode = 3;
  }
}
