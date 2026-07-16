import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Co-Dex',
        short_name: 'Co-Dex',
        description: 'A non-commercial, local-first Pokémon companion app.',
        start_url: '/',
        display: 'standalone',
        background_color: '#0b0c10',
        theme_color: '#0f172a',
        icons: [
          { src: 'icon.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App shell + bundled assets precached automatically by the plugin.
        // Reference data from public CDNs (PRD 4.1) gets its own runtime
        // caching so the app stays usable offline after first load.
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/pokeapi\.co\/api\/v2\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'pokeapi-cache',
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/pkmn\.github\.io\/smogon\//,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'smogon-stats-cache',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 7 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
})
