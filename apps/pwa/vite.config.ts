import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // `server` (vite dev) et `preview` (vite preview) ont chacun leur propre config Vite,
  // il faut donc autoriser les hosts de tunnel de test (serveo.net, loca.lt...) sur les deux.
  server: {
    allowedHosts: true,
  },
  preview: {
    allowedHosts: true,
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png'],
      manifest: {
        name: 'Inventaire Domestique',
        short_name: 'Inventaire',
        description: "Suivi d'inventaire domestique (épicerie, frais, hygiène, entretien)",
        theme_color: '#1b5e20',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        // Les données produit (OFF/OBF/OPF) changent peu -> stale-while-revalidate.
        // Les lectures Sheets doivent toujours tenter le réseau d'abord (network-first)
        // avec repli sur le cache local géré manuellement via IndexedDB (offlineQueue.ts).
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/(world\.openfoodfacts|world\.openbeautyfacts|world\.openproductsfacts)\.org\/.*/,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'product-lookup-cache' },
          },
        ],
      },
    }),
  ],
});
