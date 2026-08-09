const SHARED_WEB_DIR = 'dist';

const splashScreen = {
  launchShowDuration: 900,
  backgroundColor: '#020617',
  androidSplashResourceName: 'splash',
  showSpinner: false,
};

export const DRIVER_MOBILE_PROFILE = {
  key: 'driver',
  envVar: 'TRASHED_WEB_URL',
  defaultBaseUrl: 'https://trashed.app',
  appId: 'com.trashed.driver',
  appName: 'Trashed Driver',
  routePath: '/driver',
  source: 'trashed-driver-app',
  includesDriverLocation: true,
};

export const PROJECTS_MOBILE_PROFILE = {
  key: 'projects',
  envVar: 'TRASHED_PROJECTS_WEB_URL',
  defaultBaseUrl: 'https://projects.trashed.app',
  appId: 'app.trashed.projects',
  appName: 'Trashed Projects',
  routePath: '/projects',
  source: 'trashed-projects-app',
  includesDriverLocation: false,
};

export const MOBILE_SHELL_PROFILES = {
  [DRIVER_MOBILE_PROFILE.key]: DRIVER_MOBILE_PROFILE,
  [PROJECTS_MOBILE_PROFILE.key]: PROJECTS_MOBILE_PROFILE,
};

export function buildMobileShellConfig(profile, env = process.env) {
  const baseUrl = normalizeBaseUrl(env[profile.envVar] ?? profile.defaultBaseUrl, profile.routePath);
  const routeUrl = buildRouteUrl(baseUrl, profile.routePath, profile.source);

  return {
    appId: profile.appId,
    appName: profile.appName,
    webDir: SHARED_WEB_DIR,
    server: {
      url: routeUrl.toString(),
      androidScheme: 'https',
      cleartext: routeUrl.protocol !== 'https:',
      allowNavigation: [routeUrl.hostname],
    },
    android: {
      allowMixedContent: true,
    },
    plugins: {
      SplashScreen: splashScreen,
    },
  };
}

export function validateMobileShellConfig(profile, config) {
  const errors = [];

  if (config.appId !== profile.appId) {
    errors.push(`Expected appId ${profile.appId}, found ${config.appId}`);
  }

  if (config.appName !== profile.appName) {
    errors.push(`Expected appName ${profile.appName}, found ${config.appName}`);
  }

  const url = new URL(config.server?.url ?? '');
  if (url.pathname !== profile.routePath) {
    errors.push(`Expected route ${profile.routePath}, found ${url.pathname}`);
  }

  if (url.searchParams.get('source') !== profile.source) {
    errors.push(`Expected source ${profile.source}, found ${url.searchParams.get('source')}`);
  }

  if (!config.server?.allowNavigation?.includes(url.hostname)) {
    errors.push(`Expected allowNavigation to include ${url.hostname}`);
  }

  if (!profile.includesDriverLocation) {
    const serialized = JSON.stringify(config);
    const forbidden = [
      /BackgroundGeolocation/i,
      /ACCESS_(COARSE|FINE|BACKGROUND)_LOCATION/,
      /FOREGROUND_SERVICE_LOCATION/,
      /NSLocation/,
      /UIBackgroundModes/,
    ];

    for (const pattern of forbidden) {
      if (pattern.test(serialized)) {
        errors.push(`Projects profile must not include ${pattern}`);
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}

export function getMobileShellProfile(profileKey) {
  const profile = MOBILE_SHELL_PROFILES[profileKey];
  if (!profile) {
    throw new Error(`Unknown mobile shell profile "${profileKey}". Expected one of: ${Object.keys(MOBILE_SHELL_PROFILES).join(', ')}`);
  }
  return profile;
}

function normalizeBaseUrl(rawBaseUrl, routePath) {
  const url = new URL(rawBaseUrl);
  url.hash = '';
  url.search = '';

  const routeWithoutSlash = routePath.replace(/^\//, '');
  const segments = url.pathname.split('/').filter(Boolean);
  if (segments.at(-1) === routeWithoutSlash) {
    segments.pop();
  }

  url.pathname = segments.length > 0 ? `/${segments.join('/')}` : '/';
  return url;
}

function buildRouteUrl(baseUrl, routePath, source) {
  const url = new URL(baseUrl.toString());
  const basePath = url.pathname.replace(/\/+$/, '');
  url.pathname = `${basePath}${routePath}`.replace(/\/{2,}/g, '/');
  url.searchParams.set('source', source);
  return url;
}
