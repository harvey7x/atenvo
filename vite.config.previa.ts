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

/* mídias de exemplo do Atenvo (fotos e áudios das conversas de demonstração) — moram só na prévia
   (src/lib/previa/demo-midia; o pacote da Reviza não as leva). O HTML da prévia vai sozinho: o caminho
   '/demo-midia/x' vira o próprio arquivo embutido */
const RAIZ = fileURLToPath(new URL('.', import.meta.url));
const MIME: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', m4a: 'audio/mp4', mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', pdf: 'application/pdf' };
const midiaDemoEmbutida = {
  name: 'previa-midia-demo-embutida',
  transform(codigo: string, idArq: string) {
    if (!/\/src\/.*\.[jt]sx?$/.test(idArq) || !codigo.includes('/demo-midia/')) return null;
    return codigo.replace(/\/demo-midia\/([A-Za-z0-9._-]+)\.(jpe?g|png|webp|m4a|mp3|ogg|wav|pdf)\b/g, (m: string, nome: string, ext: string) => {
      try { return `data:${MIME[ext]};base64,${readFileSync(resolverCaminho(RAIZ, 'src/lib/previa/demo-midia', `${nome}.${ext}`)).toString('base64')}`; } catch { return m; }
    });
  },
};
/* Dashboard de exemplo do Atenvo: os canais têm o nome e o número de verdade da CAF — na prévia da ALFA
   viram nomes e números fictícios (só aqui; o arquivo de exemplo do código fica igual ao do Atenvo) */
const CANAIS_FICTICIOS: [string, string][] = [
  ["nome: 'EMPRESTIMO', numero: '555194266757'", "nome: 'ALFA PRINCIPAL', numero: '555199990101'"],
  ["nome: 'JUROS ABUSIVO (ANDRIUS)', numero: '555193930488'", "nome: 'REVISÃO DE CONTRATO', numero: '555199990202'"],
  ["nome: 'ANTONIO CAMPANHA', numero: '555191655320'", "nome: 'CAMPANHA NOVEMBRO', numero: '555199990303'"],
  ["nome: 'MURILLO CHIP', numero: '555191035329'", "nome: 'GERÊNCIA', numero: '555199990404'"],
  ["nome: 'OFICIAL', numero: '555191781390'", "nome: 'NÚMERO ANTIGO', numero: '555199990505'"],
];
const dashboardFicticio = {
  name: 'previa-dashboard-ficticio',
  enforce: 'pre' as const, // no fonte .ts, antes do esbuild normalizar as aspas
  transform(codigo: string, idArq: string) {
    if (!idArq.endsWith('/src/data/dashboardV5.demo.ts')) return null;
    return CANAIS_FICTICIOS.reduce((c, [de, para]) => c.split(de).join(para), codigo);
  },
};

export default defineConfig({
  plugins: [previaAtendimentoDemo, midiaDemoEmbutida, dashboardFicticio, react(), viteSingleFile(), VitePWA({ disable: true }), semFontesExternas, iconeEmbutido],
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
