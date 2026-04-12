import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId:     'edu.university.congregation.gate',
  appName:   'Congregation Gate',
  webDir:    'dist',
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
    BarcodeScanner: {
      cameraDirection: 'back',
    },
  },
  android: {
    // Allow camera permissions for QR scanning
    allowMixedContent: false,
    // Enable transparent WebView for camera preview
    backgroundColor: '#00000000',
  },
  server: {
    // For development hot-reload on a physical device:
    // url: 'http://YOUR_LOCAL_IP:5175',
    // cleartext: true,
  },
};

export default config;
