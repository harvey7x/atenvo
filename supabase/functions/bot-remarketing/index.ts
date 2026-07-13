// bot-remarketing — cadência de reengajamento por IA. MODO SEGURO (inerte por default):
//  * REMARKETING_ATIVO=nao por DEFAULT → só faz o sync do Kanban, não envia nada.
//  * dry_run=true por DEFAULT → mesmo com master on, grava/loga simulação; Evolution não é chamada.
//  * envio real SÓ com REMARKETING_ATIVO=sim E dry_run=false.
//  * auth por x-bot-secret == webhook_config.bot_remarketing (padrão do cron). Deploy --no-verify-jwt.
//  * Guardas: janela seg-sáb 09-18 SP, teto diário (env), 1 toque/opp/dia (RPC), pausa/humano/sem-whatsapp (RPC),
//    e checagem FINAL da coluna no instante do envio (anti-race: time fechou o cliente entre o tick e o disparo).
//  * IA por toque (Claude→Gemini) + MESMO guardrail.ts; se a IA cair/guardrail barrar 2x → copy fixo do ângulo.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { gerarResposta, type Msg } from '../bot-runner/ia.ts';
import { saidaSuja } from '../bot-runner/guardrail.ts';
import { primeiroNome } from '../bot-runner/fluxo.ts';
import { anguloDoToque, systemRemarketing, preencherNome } from '../bot-runner/remarketing.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const EVO_BASE = (Deno.env.get('EVOLUTION_API_URL') ?? '').replace(/\/+$/, '');
const EVO_KEY = Deno.env.get('EVOLUTION_API_KEY') ?? '';
const ATIVO = (Deno.env.get('REMARKETING_ATIVO') ?? 'nao').toLowerCase() === 'sim';
const TETO_DIA = Math.max(0, Number(Deno.env.get('REMARKETING_TETO_DIA')) || 20);

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, x-bot-secret', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

// ---- janela SP (Brasil sem horário de verão desde 2019 → UTC-3 fixo) ----
function agoraSP(): { weekday: string; hour: number; diaISO: string } {
  const now = new Date();
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', weekday: 'short', hour: '2-digit', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return { weekday: get('weekday'), hour: Number(get('hour')), diaISO: `${get('year')}-${get('month')}-${get('day')}` };
}
function dentroDaJanela(s: { weekday: string; hour: number }): boolean {
  return s.weekday !== 'Sun' && s.hour >= 9 && s.hour < 18; // seg-sáb, 09:00-17:59
}

async function evoSendText(instancia: string, numero: string, texto: string): Promise<{ ok: boolean; id?: string; erro?: string }> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20000);
    const res = await fetch(`${EVO_BASE}/message/sendText/${instancia}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: EVO_KEY },
      body: JSON.stringify({ number: numero, text: texto }), signal: ctrl.signal,
    });
    clearTimeout(t);
    const txt = await res.text();
    let data: any = null; try { data = txt ? JSON.parse(txt) : null; } catch { data = { raw: txt }; }
    if (res.ok && (data?.key?.id || data?.status)) return { ok: true, id: data?.key?.id ?? null };
    return { ok: false, erro: (data?.message ?? data?.error ?? `HTTP ${res.status}`)?.toString?.().slice(0, 300) };
  } catch (e) { return { ok: false, erro: (e as Error)?.message ?? 'network' }; }
}

// gera a mensagem do toque: IA (Claude→Gemini) → guardrail → fallback fixo do ângulo (nunca morre/suja).
async function gerarToque(admin: any, row: any, angulo: ReturnType<typeof anguloDoToque>): Promise<{ texto: string; via: 'ia' | 'fallback' }> {
  // contexto leve (nome/banco/financeiras) do estado da conversa
  let nome = '', banco = '', fins: string[] = [];
  if (row.conversa_id) {
    const { data: est } = await admin.from('bot_conversa_estado').select('dados_qualificacao').eq('conversa_id', row.conversa_id).maybeSingle();
    const d = (est?.dados_qualificacao ?? {}) as Record<string, unknown>;
    nome = String(d.nome_completo ?? '');
    banco = String(d.banco ?? '');
    fins = Array.isArray(d.financeiras) ? (d.financeiras as string[]) : [];
  }
  if (!nome && row.contato_id) {
    const { data: ct } = await admin.from('contatos').select('nome').eq('id', row.contato_id).maybeSingle();
    nome = String(ct?.nome ?? '');
  }
  const primeiro = primeiroNome(nome);
  const fallback = preencherNome(angulo.fallback, primeiro);

  const ctx: string[] = [];
  if (nome) ctx.push(`nome=${nome}`);
  if (banco) ctx.push(`banco=${banco}`);
  if (fins.length) ctx.push(`financeiras=${fins.join('/')}`);
  const system = systemRemarketing(angulo, ctx.join(', ') || null);
  const messages: Msg[] = [{ role: 'user', content: `[reengajamento automático — toque ${angulo.dia >= 0 ? 'D+' + angulo.dia : ''}] Escreva a mensagem deste toque.` }];

  try {
    let saida = await gerarResposta({ messages, system, dificil: true });
    let texto = limparSaida(saida);
    if (saidaSuja(texto)) {
      saida = await gerarResposta({ messages, system: system + '\n\n⚠️ Não cite valores, percentuais, prazos, garantias nem credenciais. Reescreva limpo.', dificil: true });
      texto = limparSaida(saida);
      if (saidaSuja(texto)) return { texto: fallback, via: 'fallback' };
    }
    texto = preencherNome(texto, primeiro);
    return texto ? { texto, via: 'ia' } : { texto: fallback, via: 'fallback' };
  } catch { return { texto: fallback, via: 'fallback' }; }
}
// remove qualquer bloco <estado> que a IA possa emitir por hábito, e apara.
function limparSaida(s: string): string { return (s ?? '').replace(/<estado>[\s\S]*/i, '').trim(); }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const secretHeader = req.headers.get('x-bot-secret') ?? '';
    const { data: wc } = await admin.from('webhook_config').select('secret').eq('chave', 'bot_remarketing').maybeSingle();
    if (!wc?.secret || secretHeader !== wc.secret) return json({ error: 'unauthorized' }, 401);

    const body = await req.json().catch(() => ({})) as { dry_run?: boolean; force?: boolean };
    const dryRun = body.dry_run !== false;   // DEFAULT seguro
    const force = body.force === true;       // testes: fura janela + master off (mas nunca envia se !ATIVO)

    // 1) SYNC Kanban → fila (sempre roda, mesmo inerte)
    const { data: sync } = await admin.rpc('bot_remarketing_sync');

    // 2) master off → só sync (a menos que force, p/ exercitar em dry_run)
    if (!ATIVO && !force) return json({ ok: true, sync, skipped: 'master_off', ativo: false, dry_run: dryRun });

    // 3) janela SP
    const sp = agoraSP();
    if (!dentroDaJanela(sp) && !force) return json({ ok: true, sync, skipped: 'fora_janela', sp });

    // 4) teto diário (conta toques já disparados hoje, SP)
    const inicioDiaSP = new Date(`${sp.diaISO}T00:00:00-03:00`).toISOString();
    const { count: hoje } = await admin.from('bot_remarketing')
      .select('id', { count: 'exact', head: true }).gte('ultimo_toque_em', inicioDiaSP);
    const restante = Math.max(0, TETO_DIA - (hoje ?? 0));
    if (restante <= 0) return json({ ok: true, sync, skipped: 'teto_diario', teto: TETO_DIA, hoje });

    // 5) filas prontas (todas as travas de humano/pausa/1-por-dia/destino já aplicadas na RPC)
    const { data: due } = await admin.rpc('bot_remarketing_due', { p_limit: restante });
    const fila = (due ?? []) as Array<any>;

    const resultados: any[] = [];
    let enviados = 0;
    for (const row of fila) {
      if (enviados >= restante) break;

      // 6) gera a mensagem PRIMEIRO (IA é a parte lenta, ~1-2s no Claude)
      const angulo = anguloDoToque(row.toque ?? 0);
      const { texto, via } = await gerarToque(admin, row, angulo);

      // 7) checagem FINAL anti-race — IMEDIATAMENTE antes do envio, depois da IA: relê a coluna FRESCA
      //     do banco (RPC = query nova, não valor cacheado do due), sob FOR UPDATE. Se o time fechou/moveu
      //     a opp durante o tick OU durante a geração da IA, cancela e NÃO envia.
      const { data: pode } = await admin.rpc('bot_remarketing_checar_envio', { p_id: row.id });
      if (!pode) { resultados.push({ id: row.id, skipped: 'saiu_da_coluna' }); continue; }

      // 8) envio real só com ATIVO && !dryRun; senão simula
      let envio: { ok: boolean; id?: string; erro?: string } = { ok: true };
      let statusEnvio = 'simulada';
      if (ATIVO && !dryRun) {
        const { data: canal } = await admin.from('canais').select('instancia_externa').eq('id', row.canal_id).maybeSingle();
        const { data: ident } = await admin.from('contato_identidades')
          .select('valor_normalizado').eq('contato_id', row.contato_id).eq('tipo', 'whatsapp')
          .not('valor_normalizado', 'is', null).order('principal', { ascending: false }).limit(1).maybeSingle();
        const destino = ident?.valor_normalizado ?? null;
        if (!canal?.instancia_externa || !destino) {
          envio = { ok: false, erro: !destino ? 'sem_destino' : 'sem_instancia' };
          statusEnvio = 'falhou';
        } else {
          envio = await evoSendText(canal.instancia_externa, destino, texto);
          statusEnvio = envio.ok ? 'enviada' : 'falhou';
          if (envio.ok && row.conversa_id) {
            const nowIso = new Date().toISOString();
            await admin.from('mensagens').insert({
              organizacao_id: row.organizacao_id ?? undefined, conversa_id: row.conversa_id, direcao: 'saida', tipo: 'texto',
              conteudo: texto, autor_id: null, origem: 'bot', status: 'enviada', id_externo: envio.id ?? null,
            });
            await admin.from('conversas').update({ ultima_interacao_em: nowIso }).eq('id', row.conversa_id);
          }
        }
      }

      // 9) avança a cadência só se o envio não falhou de fato (em dry_run sempre avança — simula progressão)
      let proximo: string | null = null;
      if (statusEnvio !== 'falhou') {
        const { data: prox } = await admin.rpc('bot_remarketing_registrar_toque', { p_id: row.id });
        proximo = (prox as string) ?? null;
        enviados++;
      }

      // audit
      try {
        const { data: brOrg } = await admin.from('bot_remarketing').select('organizacao_id').eq('id', row.id).maybeSingle();
        await admin.from('audit_log').insert({
          usuario_id: null, acao: 'bot_remarketing', entidade: 'bot_remarketing', entidade_id: row.id,
          organizacao_id: brOrg?.organizacao_id ?? null,
          dados_depois: { toque: row.toque, angulo: angulo.foco, via, status_envio: statusEnvio, erro: envio.erro ?? null, dry_run: dryRun, proximo_em: proximo },
        });
      } catch { /* audit best-effort */ }

      resultados.push({ id: row.id, toque: row.toque, via, status_envio: statusEnvio, texto: dryRun ? texto : undefined, proximo_em: proximo });
    }

    return json({ ok: true, sync, ativo: ATIVO, dry_run: dryRun, sp, teto: TETO_DIA, hoje, processados: fila.length, enviados, resultados });
  } catch (e) { return json({ error: (e as Error)?.message ?? 'erro' }, 500); }
});
