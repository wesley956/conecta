import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ronecaplaytv.app',
  appName: 'RonecaPlayTV',
  webDir: 'dist',
  server: {
    cleartext: true,
    androidScheme: 'http',
  },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
  },
};

export default config;
