import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';
import { readFileSync } from 'node:fs';
import { resolve as resolverCaminho } from 'node:path';

// Prévia de design da Reviza: UM index.html com tudo embutido (JS/CSS/fontes/fotos/áudios),
// abre direto como arquivo. Dados fictícios em memória (src/lib/previa) e rede bloqueada.
// O index.html do sistema puxa Inter/JetBrains Mono do Google Fonts (do v1). Na prévia isso
// seria a ÚNICA chamada de rede (o bloqueio de fetch/XHR não alcança um <link> do HTML):
// sai daqui — o v2 usa a Instrument Sans embutida e o resto cai na fonte do sistema.
const semFontesExternas = {
  name: 'previa-sem-fontes-externas',
  transformIndexHtml: (html: string) =>
    html.replace(/\s*<link[^>]+(?:fonts\.googleapis\.com|fonts\.gstatic\.com)[^>]*>/g, ''),
};

// O ícone da aba vai embutido (o HTML da prévia é entregue sozinho, sem a pasta public/)
const iconeEmbutido = {
  name: 'previa-icone-embutido',
  transformIndexHtml: (html: string) => {
    const svg = readFileSync(fileURLToPath(new URL('./public/favicon.svg', import.meta.url)), 'utf8');
    return html
      .replace(/href="[^"]*favicon\.svg"/, `href="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}"`)
      .replace(/\s*<link rel="apple-touch-icon"[^>]*>/, '');
  },
};

/* AMBIENTE ATENDIMENTO na prévia (11/11): o código do Atenvo (dados, hooks e telas do Atendimento)
   recebe '@/lib/supabase' na versão "modo demonstração" (supabaseAtendimentoDemo.ts: sem cliente →
   os dados de exemplo do próprio Atenvo). O resto — Cobranças, sessão, login, shell, Usuários — segue no
   cliente falso da prévia. Decide-se por QUEM importa; o código de produção não muda nada. */
const LADO_ATENDIMENTO = [
  /\/src\/data\//,                       // camada de dados do Atenvo (WhatsApp, Kanban, Dashboard, Scripts, Presenciais…)
  /\/src\/adapters\//,
  /\/src\/components\/(DocumentosInssBox|FichaJudicialModal)\.tsx$/,
  /\/src\/v2\/components\/SeloAoVivo\.tsx$/,
  /\/src\/v2\/hooks\/(bloqueiosOrg|scriptsResumo|useAtivacaoConvite|useEhIris|useNotificacaoInbound)\.ts$/,
  /\/src\/v2\/pages\/(ColetorInss|Configuracoes)\.tsx$/,
  /\/src\/v2\/services\/conta\.ts$/,
];
const MODULO_DEMO = resolverCaminho(fileURLToPath(new URL('.', import.meta.url)), 'src/lib/previa/supabaseAtendimentoDemo.ts');
const previaAtendimentoDemo = {
  name: 'previa-atendimento-demo',
  enforce: 'pre' as const,
  resolveId(fonte: string, quem?: string) {
    if (!quem || !/(^@\/lib\/supabase$)|(\/lib\/supabase(\.ts)?$)/.test(fonte)) return null;
    if (quem.includes('/src/lib/previa/')) return null; // o próprio módulo demo reexporta o de verdade
    return LADO_ATENDIMENTO.some((r) => r.test(quem)) ? MODULO_DEMO : null;
  },
};

export default defineConfig({
  plugins: [previaAtendimentoDemo, react(), viteSingleFile(), VitePWA({ disable: true }), semFontesExternas, iconeEmbutido],
  base: './',
  mode: 'previa',
  define: {
    'import.meta.env.VITE_PREVIA': '"true"',
    'import.meta.env.VITE_APP_INSTANCIA': '"reviza"',
    'import.meta.env.VITE_SUPABASE_URL': '"https://previa.invalid"',
    'import.meta.env.VITE_SUPABASE_ANON_KEY': '"previa-sem-chave"',
    'import.meta.env.VITE_ENABLE_DEMO_MODE': '"false"',
  },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: {
    outDir: process.env.PREVIA_OUT || 'dist-previa',
    emptyOutDir: true,
    cssCodeSplit: false,
    assetsInlineLimit: 100000000,
    chunkSizeWarningLimit: 20000,
    reportCompressedSize: false,
  },
});
