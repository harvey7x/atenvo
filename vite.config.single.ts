import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

// Build de TESTE: um único index.html com JS/CSS embutidos, abre via file://.
// VitePWA({ disable: true }): resolve o módulo virtual `virtual:pwa-register`
// (importado em src/main.tsx) como no-op — sem SW/manifest no build demo.
export default defineConfig({
  plugins: [react(), viteSingleFile(), VitePWA({ disable: true })],
  base: './',
  // build de DEMONSTRACAO: habilita o modo demo explicitamente
  define: { 'import.meta.env.VITE_ENABLE_DEMO_MODE': '"true"' },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: {
    outDir: 'dist-single',
    cssCodeSplit: false,
    assetsInlineLimit: 100000000,
    chunkSizeWarningLimit: 5000,
  },
});
