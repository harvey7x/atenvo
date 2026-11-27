// reviza-licenca — MENSALIDADE DA PLATAFORMA via Pix (PushinPay).
// v2 (19/10): quem manda é a fatura ABERTA MAIS ANTIGA (pareado com o licenca_estado
// novo da mig 70): o cron continua criando a fatura do mês, mas a varredura de
// baixa/regeração percorre as abertas da mais antiga pra frente (até 3 por rodada) e
// gera o Pix de fatura SEM Pix (ex.: a de 2026-10 semeada por migration antes do
// token existir); 'verificar' ("Já paguei") também opera sobre a aberta mais antiga.
// v1 (03/10): fatura nasce no dia 1º (cron diário, retry natural), vence dia 5,
// bloqueio 14h BRT — quem decide aviso/bloqueio é a RPC licenca_estado; aqui a
// fatura só NASCE e recebe BAIXA. FAIL-OPEN: sem licença ativa, sem token ou sem
// fatura aberta do mês, nada é cobrado nem bloqueado.
// verify_jwt=false — três portas de entrada (?acao=), cada uma com a sua checagem:
//  · cron      (x-motor-secret, mesmo segredo do reviza-wa-motor) → cria o Pix e a
//               fatura do mês se ainda não existir; se já existe aberta, aproveita a
//               rodada e dá baixa caso o Pix tenha sido pago e o webhook se perdido;
//  · webhook   (PushinPay chama) → NUNCA confia no corpo: pega só o id, RECONSULTA
//               a transação na API com o NOSSO token e só então marca a fatura paga;
//  · verificar (JWT de usuário ATIVO do profiles) → botão "Já paguei": reconsulta a
//               fatura aberta MAIS ANTIGA e devolve o estado novo (mesma forma da RPC).
// Segredos (painel → Edge Functions → Secrets): MOTOR_SECRET, PUSHINPAY_TOKEN;
// opcional PUSHINPAY_SANDBOX=sim (API de testes). Nunca entram no git.
// API PushinPay (doc.pushinpay.com.br): POST /pix/cashIn {value: centavos (mínimo 50),
// webhook_url} → {id, qr_code (copia-e-cola), qr_code_base64, status}; consulta
// GET /transactions/{id} (fallback /transaction/{id}) → status 'paid' quando pago;
// webhook manda {id, value, status, end_to_end_id, payer_name…} — usamos SÓ o id.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-motor-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const msgDe = (e: unknown) => String((e as Error)?.message ?? e);
const RE_UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** comparação em tempo constante (mesmo padrão do reviza-wa-motor) */
function igual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let x = 0; for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}

// deno-lint-ignore no-explicit-any
type Admin = any;
type Licenca = { ativo: boolean; valor_centavos: number };
type Fatura = { id: string; comp: string; valor_centavos: number; status: string; pix_id: string | null };

/* ---------------- PushinPay ---------------- */
const TOKEN = () => Deno.env.get('PUSHINPAY_TOKEN') ?? '';
const BASE = () => Deno.env.get('PUSHINPAY_SANDBOX') === 'sim'
  ? 'https://api-sandbox.pushinpay.com.br/api' : 'https://api.pushinpay.com.br/api';
const PIX_MINIMO = 50; // centavos — mínimo aceito pela PushinPay no cashIn

async function pp(caminho: string, init: RequestInit = {}): Promise<Response> {
  return await fetch(BASE() + caminho, {
    ...init,
    headers: { Authorization: `Bearer ${TOKEN()}`, Accept: 'application/json', 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
}
/** centavos: a API manda número (cashIn) ou texto (consulta) — sempre inteiro */
const centavos = (v: unknown) => Math.round(Number(v ?? 0));

type Transacao = { status: string; valor: number; pagador: string | null };
async function consultar(id: string): Promise<Transacao> {
  // a doc pública mostra /transaction/{id}; o espelho da doc usa /transactions/{id} — tenta as duas
  let r = await pp(`/transactions/${encodeURIComponent(id)}`);
  if (r.status === 404) r = await pp(`/transaction/${encodeURIComponent(id)}`);
  const t = await r.text();
  if (!r.ok) throw new Error(`PushinPay consulta ${r.status}: ${t.slice(0, 200)}`);
  // deno-lint-ignore no-explicit-any
  const d = JSON.parse(t) as any;
  return {
    status: String(d?.status ?? '').toLowerCase(),
    valor: centavos(d?.value),
    pagador: d?.payer_name ? String(d.payer_name) : null,
  };
}

type PixNovo = { id: string; copia: string; qr: string | null };
async function criarPix(valor: number, webhook: string): Promise<PixNovo> {
  const r = await pp('/pix/cashIn', { method: 'POST', body: JSON.stringify({ value: valor, webhook_url: webhook }) });
  const t = await r.text();
  if (!r.ok) throw new Error(`PushinPay cashIn ${r.status}: ${t.slice(0, 300)}`);
  // deno-lint-ignore no-explicit-any
  const d = JSON.parse(t) as any;
  const id = String(d?.id ?? '').toLowerCase();
  const copia = String(d?.qr_code ?? '');
  if (!id || !copia) throw new Error('PushinPay respondeu sem id/qr_code');
  const qr = d?.qr_code_base64 ? String(d.qr_code_base64) : null;
  return { id, copia, qr: qr && !qr.startsWith('data:') ? `data:image/png;base64,${qr}` : qr };
}

/* ---------------- regras ---------------- */
/** competência AAAA-MM pelo relógio de Brasília (UTC-3 fixo, sem horário de verão) */
function compBRT(): string {
  const b = new Date(Date.now() - 3 * 3600_000);
  return `${b.getUTCFullYear()}-${String(b.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function lerLicenca(admin: Admin): Promise<Licenca | null> {
  const { data, error } = await admin.from('sistema_licenca').select('ativo, valor_centavos').eq('singleton', true).maybeSingle();
  if (error) throw new Error(`licença: ${error.message}`);
  return (data as Licenca | null) ?? null;
}
async function faturaDoMes(admin: Admin, comp: string): Promise<Fatura | null> {
  const { data, error } = await admin.from('sistema_faturas')
    .select('id, comp, valor_centavos, status, pix_id').eq('comp', comp).maybeSingle();
  if (error) throw new Error(`fatura do mês: ${error.message}`);
  return (data as Fatura | null) ?? null;
}
/** as faturas ABERTAS, da mais antiga pra frente (a mais antiga é quem manda no estado) */
async function faturasAbertas(admin: Admin, limite: number): Promise<Fatura[]> {
  const { data, error } = await admin.from('sistema_faturas')
    .select('id, comp, valor_centavos, status, pix_id').eq('status', 'aberta')
    .order('comp', { ascending: true }).limit(limite);
  if (error) throw new Error(`faturas abertas: ${error.message}`);
  return (data ?? []) as Fatura[];
}
const faturaAbertaMaisAntiga = async (admin: Admin): Promise<Fatura | null> => (await faturasAbertas(admin, 1))[0] ?? null;

/** reconsulta a transação na API (nunca no corpo do webhook) e dá baixa SE a API
    disser 'paid' com o valor cheio. Idempotente: o update fica preso em status='aberta'.
    Pago MENOR que a fatura NÃO baixa — vira pendência no retorno de 'verificar'. */
type Baixa = { pagou: boolean; pendencia: string | null; statusTx: string | null };
async function conferirEBaixar(admin: Admin, fat: Fatura): Promise<Baixa> {
  if (!fat.pix_id) return { pagou: false, pendencia: null, statusTx: null };
  const tx = await consultar(fat.pix_id);
  if (tx.status !== 'paid') return { pagou: false, pendencia: null, statusTx: tx.status };
  // valor 0 = a consulta não informou o valor: a palavra final é o 'paid' da API
  if (tx.valor > 0 && tx.valor < fat.valor_centavos) {
    const falta = ((fat.valor_centavos - tx.valor) / 100).toFixed(2).replace('.', ',');
    return { pagou: false, pendencia: `Pix recebido com valor menor que a fatura (faltam R$ ${falta}). Fale com o suporte.`, statusTx: tx.status };
  }
  const { error } = await admin.from('sistema_faturas').update({
    status: 'paga',
    pago_em: new Date().toISOString(),
    pago_valor_centavos: tx.valor > 0 ? tx.valor : fat.valor_centavos,
    pago_nome: tx.pagador,
  }).eq('id', fat.id).eq('status', 'aberta');
  if (error) throw new Error(`baixa da fatura: ${error.message}`);
  return { pagou: true, pendencia: null, statusTx: tx.status };
}

/** Pix EXPIRADO/CANCELADO na PushinPay com a fatura ainda aberta = fatura impagável
    (e, depois das 14h do dia 5, bloqueio eterno). Gera um Pix NOVO para a mesma
    fatura e troca os campos — o estado re-lido já devolve o QR atualizado. */
const PIX_MORTO = new Set(['expired', 'canceled', 'cancelled']);
async function regerarPixSePreciso(admin: Admin, fat: Fatura, statusTx: string | null, webhook: string): Promise<boolean> {
  if (!statusTx || !PIX_MORTO.has(statusTx)) return false;
  const pix = await criarPix(fat.valor_centavos, webhook);
  const { error } = await admin.from('sistema_faturas')
    .update({ pix_id: pix.id, pix_copia_cola: pix.copia, qr_base64: pix.qr })
    .eq('id', fat.id).eq('status', 'aberta');
  if (error) throw new Error(`regerar Pix: ${error.message}`);
  return true;
}

/* ---------------- HTTP ---------------- */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const motorSecret = Deno.env.get('MOTOR_SECRET') ?? '';
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const webhook = `${url}/functions/v1/reviza-licenca?acao=webhook`;
  const acao = new URL(req.url).searchParams.get('acao') ?? '';

  try {
    // ---- 1) CRON (todo dia): gera a fatura do mês; se já existe, confere a baixa ----
    if (acao === 'cron') {
      const viaSecret = !!motorSecret && igual(req.headers.get('x-motor-secret') ?? '', motorSecret);
      if (!viaSecret) return json({ erro: 'não autorizado' }, 401);
      try {
        const lic = await lerLicenca(admin);
        if (!lic?.ativo) return json({ ok: true, inerte: 'licença desligada' });
        if (!TOKEN()) return json({ ok: true, inerte: 'sem PUSHINPAY_TOKEN' });
        const comp = compBRT();
        // 1) a fatura do MÊS CORRENTE nasce aqui (como sempre; o cron diário é o retry natural)
        let criada = false;
        const atual = await faturaDoMes(admin, comp);
        if (!atual) {
          const valor = Number(lic.valor_centavos ?? 0);
          if (valor < PIX_MINIMO) return json({ ok: false, erro: `valor configurado (${valor} centavos) abaixo do mínimo da PushinPay (${PIX_MINIMO})` });
          const pix = await criarPix(valor, webhook);
          const { error } = await admin.from('sistema_faturas').insert({
            comp, valor_centavos: valor, pix_id: pix.id, pix_copia_cola: pix.copia, qr_base64: pix.qr,
          });
          // corrida entre rodadas: o UNIQUE de comp segura a duplicidade — a fatura que entrou vale
          if (error && !/duplicate|unique|23505/i.test(error.message)) throw new Error(`gravar fatura: ${error.message}`);
          criada = !error;
        }
        // 2) varre as ABERTAS, da mais antiga pra frente (até 3): fatura SEM Pix (semeada por
        //    migration antes do token) ganha o Pix; com Pix, rede de segurança da baixa
        //    (webhook perdido) + regeração de Pix vencido. A recém-criada fica pra próxima rodada.
        //    Erro em uma fatura não para as outras.
        const abertas = (await faturasAbertas(admin, 3)).filter((f) => !(criada && f.comp === comp));
        const varridas: { comp: string; resultado: string }[] = [];
        for (const f of abertas) {
          try {
            if (!f.pix_id) {
              const pix = await criarPix(f.valor_centavos, webhook);
              // .is('pix_id', null): rodada concorrente não troca um Pix que acabou de nascer
              const { error } = await admin.from('sistema_faturas')
                .update({ pix_id: pix.id, pix_copia_cola: pix.copia, qr_base64: pix.qr })
                .eq('id', f.id).eq('status', 'aberta').is('pix_id', null);
              if (error) throw new Error(`gravar Pix da fatura: ${error.message}`);
              varridas.push({ comp: f.comp, resultado: 'pix_criado' });
              continue;
            }
            const r = await conferirEBaixar(admin, f);
            const regerado = r.pagou ? false : await regerarPixSePreciso(admin, f, r.statusTx, webhook);
            varridas.push({ comp: f.comp, resultado: r.pagou ? 'paga' : regerado ? 'pix_regerado' : 'aberta' });
          } catch (e) {
            console.error('[reviza-licenca] varredura', f.comp, msgDe(e));
            varridas.push({ comp: f.comp, resultado: `erro: ${msgDe(e).slice(0, 160)}` });
          }
        }
        return json({ ok: true, comp, criada, abertas: varridas });
      } catch (e) {
        console.error('[reviza-licenca] cron:', msgDe(e));
        return json({ ok: false, erro: msgDe(e).slice(0, 300) });   // 200: nunca derruba o cron
      }
    }

    // ---- 2) WEBHOOK da PushinPay: o corpo só aponta QUAL transação olhar ----
    if (acao === 'webhook') {
      const bruto = await req.text();
      let id = '';
      try { id = String(JSON.parse(bruto)?.id ?? ''); } catch { /* não é JSON */ }
      if (!id) { try { id = new URLSearchParams(bruto).get('id') ?? ''; } catch { /* nem form */ } }
      id = (id.match(RE_UUID)?.[0] ?? bruto.match(RE_UUID)?.[0] ?? '').toLowerCase();
      if (!id || !TOKEN()) return json({ ok: true, ignorado: true });
      const { data: f, error } = await admin.from('sistema_faturas')
        .select('id, comp, valor_centavos, status, pix_id').eq('pix_id', id).eq('status', 'aberta').maybeSingle();
      if (error) throw new Error(`fatura do webhook: ${error.message}`);
      if (!f) return json({ ok: true, ignorado: true });   // não é nossa, ou já baixada (idempotente)
      const r = await conferirEBaixar(admin, f as Fatura);  // erro aqui → 502 e a PushinPay reenvia
      return json({ ok: true, pagou: r.pagou });
    }

    // ---- 3) VERIFICAR ("Já paguei", usuário logado): reconsulta e devolve o estado ----
    if (acao === 'verificar') {
      const asUser = createClient(url, anon, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } }, auth: { persistSession: false } });
      const { data: u } = await asUser.auth.getUser();
      if (!u?.user?.id) return json({ erro: 'não autenticado' }, 401);
      const { data: perfil } = await asUser.from('profiles').select('ativo').eq('id', u.user.id).maybeSingle();
      if (!perfil?.ativo) return json({ erro: 'sem permissão' }, 403);

      let pagou = false;
      let pendencia: string | null = null;
      // a fatura que importa é a ABERTA MAIS ANTIGA (pode haver mês anterior em aberto)
      const fat = await faturaAbertaMaisAntiga(admin);
      if (fat && TOKEN()) {
        try {
          const r = await conferirEBaixar(admin, fat);
          pagou = r.pagou; pendencia = r.pendencia;
          if (!pagou && await regerarPixSePreciso(admin, fat, r.statusTx, webhook)) {
            pendencia = 'O Pix anterior venceu — geramos um código novo. Use o QR/copia e cola atualizado.';
          }
        }
        catch (e) { pendencia = `Não deu para conferir o pagamento agora: ${msgDe(e).slice(0, 160)}`; }
      }
      // o estado novo, na MESMA forma da RPC (a tela decide aviso/bloqueio com ele)
      const { data: estado, error: eE } = await asUser.rpc('licenca_estado');
      if (eE) return json({ ok: true, pagou, pendencia, erro_estado: eE.message });
      return json({ ok: true, pagou, pendencia, ...(estado ?? {}) });
    }

    return json({ erro: 'ação desconhecida' }, 400);
  } catch (e) {
    console.error('[reviza-licenca]', msgDe(e));
    return json({ ok: false, erro: 'Não foi possível conferir o pagamento agora. Tente de novo em instantes.' }, 502);
  }
});
