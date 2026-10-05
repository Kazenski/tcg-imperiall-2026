import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages project site => every asset URL must be prefixed with the repo name.
// If this repo ever becomes a user site (github.io/<user>), change base to '/'.
const base = '/tcg-imperiall-2026/';

export default defineConfig({
  base,
  build: {
    target: 'es2020',
  },
  server: {
    host: true,
    port: 5173,
  },
  plugins: [
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg'],
      manifest: {
        id: '/',
        name: 'Imperiall TCG',
        short_name: 'Imperiall TCG',
        description:
          'Duelo de cartas do Imperiall: criaturas com ATK, DEF e EVA, invocadas pelo level do dono.',
        lang: 'pt-BR',
        dir: 'ltr',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'any',
        background_color: '#0f1116',
        theme_color: '#0f1116',
        categories: ['games', 'entertainment'],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,webp,woff2}'],
        // Game is fully static: cache everything so it survives offline launches.
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        clientsClaim: true,
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
});
