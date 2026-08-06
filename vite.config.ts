import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [
    react(),
    /* PWA (Fase 1 mobile): precache SÓ dos assets estáticos do build.
       SEM runtimeCaching — de propósito e para sempre: o Supabase (REST/auth/storage)
       é cross-origin e o Realtime é WebSocket; sem rota de runtime registrada, o SW
       não intercepta NADA disso — tudo network-only por omissão. Cachear dados do
       Supabase = atendente respondendo em cima de conversa velha. NÃO "otimizar". */
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false, // registro manual em src/main.tsx (controle p/ Fase 2: push)
      manifest: {
        id: '/',
        name: 'Atenvo',
        short_name: 'Atenvo',
        description: 'Plataforma de Atendimento e Gestão',
        lang: 'pt-BR',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: '#0A0B0D',
        background_color: '#0A0B0D',
        icons: [
          { src: '/icons/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // o chunk de entrada tem ~1,3 MB — o teto default do Workbox (2 MiB) dropa
        // arquivos maiores DO PRECACHE EM SILÊNCIO; 3 MiB dá folga p/ crescimento.
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [
          /^\/assets\//, /^\/opus\//, /^\/icons\//,
          /^\/sw\.js$/, /^\/manifest\.webmanifest$/, /^\/favicon\.svg$/,
        ],
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false }, // npm run dev fica 100% sem SW
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: { port: 5173 },
});
