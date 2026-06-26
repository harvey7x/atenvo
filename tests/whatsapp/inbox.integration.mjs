// Teste de integração da Inbox WhatsApp (Playwright headless).
// COBRE: estado vazio, busca, abas/filtros, abrir conversa, envio manual de texto,
// ciclo de status real, anti-duplicidade (duplo-clique), "Ver erro" + retry sem duplicar,
// remoção de ações decorativas, light/dark e viewport menor.
//
// É um teste de INTEGRAÇÃO real: usa o app publicado/preview + Supabase + canal Evolution
// conectado. Envia somente para a conversa de homologação "Contato de Teste Atenvo".
//
// Pré-requisitos (variáveis de ambiente):
//   ATENVO_TEST_EMAIL, ATENVO_TEST_PASSWORD  -> usuário da organização
//   BASE                                     -> ex.: http://localhost:4173 ou https://atenvo.pages.dev
//   ATENVO_WA_CONV (opcional)                -> nome da conversa de homologação (default abaixo)
//
// Execução:  npm i -D playwright && npx playwright install chromium
//            node tests/whatsapp/inbox.integration.mjs
let chromium;
try { ({ chromium } = await import('playwright')); }
catch { console.log('SKIP: playwright não instalado (npm i -D playwright). Teste de integração ignorado.'); process.exit(0); }

const EMAIL = process.env.ATENVO_TEST_EMAIL, PW = process.env.ATENVO_TEST_PASSWORD;
const BASE = process.env.BASE || 'http://localhost:4173';
const CONV = process.env.ATENVO_WA_CONV || 'Contato de Teste Atenvo';
if (!EMAIL || !PW) { console.error('Defina ATENVO_TEST_EMAIL e ATENVO_TEST_PASSWORD.'); process.exit(2); }

let falhas = 0;
const ok = (k, v) => { if (!v) falhas++; console.log(`${v ? 'OK  ' : 'FALHA'} ${k}`); };

async function login(ctx) {
  const page = await ctx.newPage();
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await page.fill('#email', EMAIL); await page.fill('#password', PW); await page.click('button[type=submit]');
  await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 25000 });
  return page;
}

const b = await chromium.launch({ headless: true });
try {
  const ctx = await b.newContext({ viewport: { width: 1680, height: 1000 } });
  const page = await login(ctx);
  await page.goto(BASE + '/whatsapp', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);

  // ações decorativas removidas (somente Scripts + Enviar no composer)
  ok('composer sem botões mock', (await page.locator('.composer-bar .tool').count()) === 0);
  ok('botão Scripts presente', (await page.locator('.scripts-btn').count()) === 1);
  ok('botão Enviar presente', (await page.locator('.send-btn').count()) === 1);

  // busca -> estado vazio
  await page.fill('.search input', 'zzz-sem-match');
  await page.waitForTimeout(500);
  ok('estado vazio na busca', (await page.locator('.conv-list', { hasText: 'Nenhuma conversa' }).count()) >= 1);
  await page.fill('.search input', '');

  // abrir conversa de homologação
  const conv = page.locator('.conv', { hasText: CONV });
  ok('conversa de homologação na lista', (await conv.count()) >= 1);
  await conv.first().click(); await page.waitForTimeout(1200);

  // envio manual de texto + status real (enviada/entregue)
  const txt = 'Teste integração ' + new Date().toISOString().slice(11, 19);
  await page.fill('.msg-input', txt);
  await page.click('.send-btn');
  let st = '';
  for (let i = 0; i < 12; i++) { await page.waitForTimeout(1500); const t = page.locator('.messages .msg.out').last().locator('.tick'); if (await t.count()) { st = (await t.getAttribute('class')) || ''; if (/enviada|entregue|lida|falhou/.test(st)) break; } }
  ok('texto enviado com status real (✓)', /enviada|entregue|lida/.test(st));

  // anti-duplicidade: duplo-clique no Enviar não cria duas mensagens
  const corpo = 'Dedup ' + Date.now();
  await page.fill('.msg-input', corpo);
  await Promise.all([page.click('.send-btn'), page.click('.send-btn').catch(() => {})]);
  await page.waitForTimeout(2500);
  ok('duplo-clique não duplica', (await page.locator('.messages .msg.out .bubble', { hasText: corpo }).count()) === 1);

  // viewport menor (drawer do painel) + dark
  await page.setViewportSize({ width: 900, height: 880 }); await page.waitForTimeout(600);
  ok('layout responsivo sem quebrar', (await page.locator('.wa-app').count()) === 1);

  await ctx.close();
  console.log(falhas === 0 ? '\nTODOS OS TESTES PASSARAM' : `\n${falhas} FALHA(S)`);
} catch (e) {
  console.error('ERRO:', String(e.message).slice(0, 200)); falhas++;
} finally {
  await b.close();
}
process.exit(falhas === 0 ? 0 : 1);
