import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ronecaplaytv.app',
  appName: 'RonecaPlayTV',
  webDir: 'dist',
  server: {
    cleartext: true,
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 1200,
      backgroundColor: '#050816',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP'
    },
    StatusBar: {
      backgroundColor: '#050816',
      style: 'DARK'
    },
    CapacitorHttp: {
      enabled: true,
    },
  },
};

export default config;
