import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        // Cache all app shell assets
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // API calls are NOT cached — gate uses IndexedDB for offline data
        runtimeCaching: [],
      },
      manifest: {
        name: 'Congregation Gate Scanner',
        short_name: 'Gate Scanner',
        description: 'QR code validation for congregation gate officers',
        theme_color: '#7C6FFF',
        background_color: '#0d0221',
        display: 'fullscreen',
        orientation: 'portrait',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
    }),
  ],
  server: { port: 5175 },
  build:  { outDir: 'dist' },
});
