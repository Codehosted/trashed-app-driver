import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.trashed.driver',
  appName: 'Trashed Driver',
  webDir: 'dist',
  bundledWebRuntime: false,
  server: {
    androidScheme: 'https',
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 900,
      backgroundColor: '#020617',
      androidSplashResourceName: 'splash',
      showSpinner: false,
    },
  },
};

export default config;
