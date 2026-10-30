// presenciais-avisos — manda no grupo os avisos da aba Presenciais: marcado, remarcado,
// desmarcado e o lembrete das 8h. Pedido do dono 29/10.
//
// NÃO escreve texto: os textos (aprovados pelo dono 29/10) saem prontos do banco
// (presencial_texto / presencial_lembrete_texto) na fila presenciais_avisos. Aqui só envia.
// Grupo: DOCUMENTOS CLIENTES CAF (PRESENCIAIS_AVISO_DESTINO), pelo MURILLO CHIP via Evolution
// (enviadorDe de ../evolution-send/transporte.ts, igual ao aviso de crédito da IA).
//
// Quem chama: o cron 'presenciais-avisos' (1 min), via presenciais_disparar(), só quando há
// aviso pendente. verify_jwt = false: x-bot-secret == webhook_config 'presenciais_avisos'.
//
// Travas:
//   - liga/desliga PRESENCIAIS_AVISO_ATIVO (padrão 'nao'), lido a cada chamada: com 'nao' o
//     aviso vira 'bloqueado' e não sai depois (ligar não despeja avisos velhos no grupo);
//   - destino só JID de GRUPO (…@g.us); remetente validado (ativo, conectado, Evolution, sem
//     envio restrito, não é de notificação);
//   - aviso com mais de 12 h na fila não sai mais (não chega atrasado); lembrete só no próprio dia;
//   - reserva antes de enviar (pendente → enviando, condicional); timeout/5xx → 'incerto' (pode ter
//     saído: não repete); 4xx ou chip fora → volta para a fila, até 5 tentativas.
//
// Body (POST): {} → rodada normal · {"previa":true} → mostra o que sairia, sem enviar nem gravar.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { enviadorDe } from '../evolution-send/transporte.ts';

/** Remetente padrão: MURILLO CHIP (o mesmo da avaliação diária e do aviso de crédito). */
const CANAL_PADRAO = '44ed5b38-9020-4c72-8c6a-3146dd454a79';
const JID_GRUPO = /^[0-9-]{10,40}@g\.us$/;
const TIMEOUT_ENVIO_MS = 25000;
const MAX_TENTATIVAS = 5;
const POR_RODADA = 10;
const VALIDADE_MS = 12 * 3600_000;

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });

type Canal = {
  id: string; nome_interno: string; transporte: string | null; instancia_externa: string | null;
  cloud_phone_number_id: string | null; status_integracao: string; ativo: boolean; envio_restrito: boolean; papel: string | null;
};
type Aviso = { id: number; tipo: string; dia: string | null; texto: string; tentativas: number; criado_em: string };

/** Motivo pelo qual o canal NÃO pode enviar (null = pode). */
function motivoCanalInvalido(c: Canal | null, canalId: string): string | null {
  if (!c) return `canal remetente ${canalId} não encontrado`;
  if (!c.ativo) return `canal ${c.nome_interno} está inativo`;
  if (c.status_integracao !== 'conectado') return `canal ${c.nome_interno} não está conectado (${c.status_integracao})`;
  if (c.transporte !== 'evolution') return `canal ${c.nome_interno} não é Evolution (${c.transporte ?? 'nulo'})`;
  if (c.envio_restrito) return `canal ${c.nome_interno} está com envio restrito`;
  if (c.papel === 'notificacao') return `canal ${c.nome_interno} é de notificação`;
  if (!c.instancia_externa) return `canal ${c.nome_interno} sem instância`;
  if (!(Deno.env.get('EVOLUTION_API_URL') ?? '').trim() || !(Deno.env.get('EVOLUTION_API_KEY') ?? '').trim()) {
    return 'Evolution não configurada (EVOLUTION_API_URL/EVOLUTION_API_KEY)';
  }
  return null;
}

/** A Evolution não tem timeout próprio: corrida com relógio (timeout vira 'incerto', nunca 'falhou'). */
async function comTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  const relogio = new Promise<never>((_, rej) => {
    t = setTimeout(() => rej(new Error(`tempo esgotado (${ms / 1000}s) — a mensagem PODE ter saído`)), ms);
  });
  try {
    return await Promise.race([p, relogio]);
  } finally {
    clearTimeout(t);
  }
}

const hojeSP = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: false, erro: 'Use POST.' }, 405);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const segredo = req.headers.get('x-bot-secret') ?? '';
  const { data: wc } = await admin.from('webhook_config').select('secret').eq('chave', 'presenciais_avisos').maybeSingle();
  if (!wc?.secret || segredo !== wc.secret) return json({ ok: false, erro: 'Não autorizado.' }, 401);

  let corpo: { previa?: boolean } = {};
  try { corpo = await req.json(); } catch { /* corpo vazio = rodada normal */ }

  const { data: fila, error } = await admin.from('presenciais_avisos')
    .select('id, tipo, dia, texto, tentativas, criado_em')
    .eq('status', 'pendente').order('id', { ascending: true }).limit(POR_RODADA);
  if (error) return json({ ok: false, erro: `fila: ${error.message}` }, 500);
  const avisos = (fila ?? []) as Aviso[];
  if (corpo.previa) return json({ ok: true, previa: true, pendentes: avisos.map((a) => ({ id: a.id, tipo: a.tipo, texto: a.texto })) });

  const ativo = (Deno.env.get('PRESENCIAIS_AVISO_ATIVO') ?? 'nao').trim().toLowerCase() === 'sim';
  const destino = (Deno.env.get('PRESENCIAIS_AVISO_DESTINO') ?? '').trim();
  const canalId = (Deno.env.get('PRESENCIAIS_AVISO_CANAL') ?? '').trim() || CANAL_PADRAO;
  const hoje = hojeSP();

  const fechar = (id: number, campos: Record<string, unknown>) =>
    admin.from('presenciais_avisos').update(campos).eq('id', id);
  const res: Record<string, number> = { enviado: 0, incerto: 0, falhou: 0, bloqueado: 0, voltou_para_fila: 0 };

  let canal: Canal | null = null;
  let canalInvalido: string | null = null;
  if (ativo) {
    const { data: c } = await admin.from('canais')
      .select('id, nome_interno, transporte, instancia_externa, cloud_phone_number_id, status_integracao, ativo, envio_restrito, papel')
      .eq('id', canalId).maybeSingle();
    canal = (c as Canal | null) ?? null;
    canalInvalido = !JID_GRUPO.test(destino)
      ? 'PRESENCIAIS_AVISO_DESTINO não é JID de grupo (…@g.us)'
      : motivoCanalInvalido(canal, canalId);
  }

  for (const a of avisos) {
    // não chega atrasado: desligado, velho demais ou lembrete de outro dia → não sai mais
    const bloqueio = !ativo ? 'aviso desligado (PRESENCIAIS_AVISO_ATIVO)'
      : Date.now() - Date.parse(a.criado_em) > VALIDADE_MS ? 'ficou mais de 12 h na fila'
      : a.tipo === 'lembrete' && a.dia !== hoje ? 'lembrete de outro dia'
      : null;
    if (bloqueio) {
      await admin.from('presenciais_avisos').update({ status: 'bloqueado', erro: bloqueio }).eq('id', a.id).eq('status', 'pendente');
      res.bloqueado++;
      continue;
    }
    // reserva (duas rodadas ao mesmo tempo não mandam duas vezes)
    const { data: reservado } = await admin.from('presenciais_avisos')
      .update({ status: 'enviando', tentativas: a.tentativas + 1 })
      .eq('id', a.id).eq('status', 'pendente').select('id').maybeSingle();
    if (!reservado) continue;
    const tentativas = a.tentativas + 1;

    if (canalInvalido) {
      const fim = tentativas >= MAX_TENTATIVAS;
      await fechar(a.id, { status: fim ? 'falhou' : 'pendente', erro: canalInvalido });
      fim ? res.falhou++ : res.voltou_para_fila++;
      continue;
    }
    try {
      const sent = await comTimeout(enviadorDe(canal!).sendText(destino, a.texto), TIMEOUT_ENVIO_MS);
      await fechar(a.id, { status: 'enviado', id_mensagem: sent?.key?.id ?? null, erro: null, enviado_em: new Date().toISOString() });
      res.enviado++;
    } catch (e) {
      const erro = String((e as Error)?.message ?? e).slice(0, 1000);
      if (/^HTTP 4\d\d\b/.test(erro)) {
        // só um 4xx explícito prova que nada saiu: volta para a fila
        const fim = tentativas >= MAX_TENTATIVAS;
        await fechar(a.id, { status: fim ? 'falhou' : 'pendente', erro });
        fim ? res.falhou++ : res.voltou_para_fila++;
      } else {
        await fechar(a.id, { status: 'incerto', erro });
        res.incerto++;
      }
    }
  }
  return json({ ok: true, ativo, ...res });
});
