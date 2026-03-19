import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId:     'edu.university.congregation.gate',
  appName:   'Congregation Gate',
  webDir:    'dist',
  android: {
    // Allow camera permissions for QR scanning
    allowMixedContent: false,
  },
  server: {
    // For development hot-reload on a physical device:
    // url: 'http://YOUR_LOCAL_IP:5175',
    // cleartext: true,
  },
};

export default config;
