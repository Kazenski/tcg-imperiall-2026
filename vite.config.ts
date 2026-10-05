import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages project site => every asset URL must be prefixed with the repo name.
// If this repo ever becomes a user site (github.io/<user>), change base to '/'.
const base = '/tcg-imperiall-2026/';

export default defineConfig({
  base,
  build: {
    target: 'es2020',
    // Três páginas: a inicial (`/`), o guia (`/tutorial.html`) e o
    // duelo (`/jogo.html`). Todas precisam entrar no build para o
    // GitHub Pages servir cada uma no seu endereço.
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        tutorial: resolve(import.meta.dirname, 'tutorial.html'),
        jogo: resolve(import.meta.dirname, 'jogo.html'),
      },
    },
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
        globPatterns: ['**/*.{js,css,html,png,jpg,svg,webp,woff2}'],
        /*
         * Sem `navigateFallback`: o site tem três páginas reais
         * (inicial, tutorial e jogo) e o fallback para index.html
         * sequestraria /tutorial.html e /jogo.html, servindo a
         * inicial no lugar delas.
         */
        cleanupOutdatedCaches: true,
        clientsClaim: true,
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
});
