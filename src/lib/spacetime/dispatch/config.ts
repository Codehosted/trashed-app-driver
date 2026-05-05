import Constants from 'expo-constants';

export const SPACETIME_DISPATCH_URI = 'https://maincloud.spacetimedb.com';

export const SPACETIME_DISPATCH_DATABASES = {
  development: 'trashed-dispatch-dev',
  preview: 'trashed-dispatch-preview',
  production: 'trashed-dispatch-prod',
} as const;

type DispatchEnvironment = keyof typeof SPACETIME_DISPATCH_DATABASES;

export function getSpacetimeDispatchConfig() {
  const overrideUri = Constants.expoConfig?.extra?.spacetimeDispatchUri;
  const overrideDb = Constants.expoConfig?.extra?.spacetimeDispatchDb;

  const env: DispatchEnvironment =
    Constants.expoConfig?.extra?.spacetimeEnv === 'production'
      ? 'production'
      : Constants.expoConfig?.extra?.spacetimeEnv === 'preview'
        ? 'preview'
        : 'development';

  return {
    uri: (overrideUri as string) || SPACETIME_DISPATCH_URI,
    database: (overrideDb as string) || SPACETIME_DISPATCH_DATABASES[env],
  };
}
