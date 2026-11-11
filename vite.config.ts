import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import { problemasCacheAssets } from './src/lib/cacheAssets';

/* Guarda do cache imutável de /assets/* (public/_headers): o BUILD quebra se a regra for ao ar
   sem o public/assets/404.html (ou com um public/404.html, que desliga o SPA). Sem isto, um commit
   que esquecesse o 404.html (arquivo novo) publicava sem aviso e o index.html ficava cacheado
   por 1 ano no lugar de chunks antigos. Ver src/lib/cacheAssets.ts. */
const guardaCacheAssets = () => ({
  name: 'atenvo-guarda-cache-assets',
  apply: 'build' as const,
  buildStart(this: { error: (m: string) => never }) {
    const pub = (f: string) => fileURLToPath(new URL(`./public/${f}`, import.meta.url));
    const problemas = problemasCacheAssets({
      headers: existsSync(pub('_headers')) ? readFileSync(pub('_headers'), 'utf8') : '',
      temAssets404: existsSync(pub('assets/404.html')),
      temRaiz404: existsSync(pub('404.html')),
    });
    if (problemas.length) this.error(problemas.join(' | '));
  },
});

export default defineConfig(({ mode }) => ({
  plugins: [
    guardaCacheAssets(),
    react(),
    /* PWA (Fase 1 mobile): precache SÓ dos assets estáticos do build.
       SEM runtimeCaching — de propósito e para sempre: o Supabase (REST/auth/storage)
       é cross-origin e o Realtime é WebSocket; sem rota de runtime registrada, o SW
       não intercepta NADA disso — tudo network-only por omissão. Cachear dados do
       Supabase = atendente respondendo em cima de conversa velha. NÃO "otimizar". */
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false, // registro manual em src/main.tsx (controle p/ Fase 2: push)
      // Reviza (Square Cloud): sob o Cloudflare da Square (não dá pra purgar), um SW
      // que UM DIA foi servido com immutable fica preso no edge por ~1 ano e o
      // reg.update() nunca vê versão nova. Já aconteceu com /sw.js (11/09) e DE NOVO
      // com /sw-r2.js (17/09: age 6 dias, cf HIT immutable) mesmo o server.js já
      // mandando no-store — a cópia envenenada é de um deploy antigo. A saída é
      // sempre uma URL NOVA (edge limpo). sw-r3.js nasce sob o server.js correto
      // (no-store → edge nunca cacheia) então é o ÚLTIMO rename: /sw.js e /sw-r2.js
      // viram kill-switch (build.sh) p/ resgatar quem está preso neles.
      // Demo/Atenvo (CF Pages) seguem com sw.js: lá o public/_headers sempre impediu
      // o edge-cache. NÃO reusar sw.js/sw-r2.js na Reviza.
      filename: mode === 'reviza' ? 'sw-r3.js' : 'sw.js',
      manifest: {
        id: '/',
        name: 'ALFA GROUP',
        short_name: 'ALFA GROUP',
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
        globIgnores: ['demo-midia/**'],
        // o chunk de entrada tem ~1,3 MB — o teto default do Workbox (2 MiB) dropa
        // arquivos maiores DO PRECACHE EM SILÊNCIO; 3 MiB dá folga p/ crescimento.
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [
          /^\/assets\//, /^\/opus\//, /^\/icons\//,
          /^\/sw\.js$/, /^\/sw-r2\.js$/, /^\/sw-r3\.js$/, /^\/manifest\.webmanifest$/, /^\/favicon\.svg$/,
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
}));
