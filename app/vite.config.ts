import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/ply/',
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      // app shell and the engine are precached; opening data lives in IndexedDB, not the SW cache
      workbox: { globPatterns: ['**/*.{js,css,html,svg,png,woff2,wasm}'], globIgnores: ['data/**'], maximumFileSizeToCacheInBytes: 4 * 1024 * 1024, navigateFallbackDenylist: [/\/data\//] },
      manifest: {
        name: 'Ply',
        short_name: 'Ply',
        description: 'Chess openings, traps and your own mistakes, on a spaced-repetition schedule.',
        theme_color: '#ECEEF3',
        background_color: '#ECEEF3',
        // fullscreen hides Android's status and navigation bars; browsers without it fall back to standalone
        display: 'fullscreen',
        display_override: ['fullscreen', 'standalone'],
        // any: the phone follows its own auto-rotate setting; landscape and tablets have their own layouts
        orientation: 'any',
        start_url: '/ply/',
        scope: '/ply/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      }
    })
  ]
});
