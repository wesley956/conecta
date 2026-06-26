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
    CapacitorHttp: {
      enabled: false,
    },
  },
};

export default config;
