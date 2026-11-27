// reviza-wa-motor — régua automática + fila de ENVIOS (verify_jwt=false; gated
// por x-motor-secret [cron a cada minuto] OU JWT de usuário ativo).
// v29 (29/10, dono): cada comercial PAUSA/RETOMA a própria régua (wa_regua_config.regua_pausada, mig 85) —
//  prévia mostra "régua de X pausada"; o que estava na fila não sai (solta a trava pra refazer se retomar).
// v28 (29/10, revisão): horário próprio fora da janela vale como início geral (nunca trava o comercial);
//  no número reserva/único, quem espera o horário do comercial não ocupa as vagas da rodada.
// v27 (28/10, dono): horário de INÍCIO por comercial (wa_regua_config.horario_comercial, mig 82 — Eduardo 7h,
//  Junior e Augusto 8h); antes disso a fila do comercial espera. O fim da janela segue igual pra todos.
// v26 (27/10, dono): dinheiro é SEMPRE a meia parcela — {valor da parcela} (texto antigo) também vira a
//  meia parcela (regua.ts aplicarVars); a parcela inteira nunca vai pro cliente.
// v25 (27/10, 2ª revisão): término fora da janela só de mensagem de HOJE e até 1 h depois do fim;
//  prévia usa só o fim da janela (não a chave ligada) pra não contar Cobrança presa na fila.
// v24 (27/10, revisão): fora da janela a régua TERMINA a mensagem de várias partes que já começou (nunca
//  começa cliente novo; confere a hora a cada cliente); pausa longa falha FECHADA (contagem do dia
//  falhou = número não manda na rodada); cliente nos Cancelados solta a trava do passo; a prévia não
//  conta como cobrada a Cobrança de hoje que ficou na fila depois do fim da janela. O término fora da
//  janela vale só pra mensagem de hoje e até 1 hora depois do fim.
// v23 (27/10, dono): clientes nos CANCELADOS (leads.cancelamento, mig 79) saem da régua — fora da
//  população e, se já estavam na fila do dia, pulados na hora do envio.
// v22 (27/10, dono): JANELA da manhã (hora_envio..hora_fim, ex. 5h–10h; fora dela a régua não monta
//  nem manda) + PAUSA LONGA por número (a cada pausa_cada enviadas no dia, descansa pausa_min minutos).
// v21 (26/10): no máximo 1 mensagem da régua por cliente por dia (vai a mais importante: Cobrança >
//  atraso > lembrete); janela de competências ±2 meses (dia próprio de até ±30 dias).
// v20 (26/10, dono): a régua do comercial também muda o DIA de cada mensagem (wa_regua_comercial.quando,
//  mig 76): antes continua antes, depois continua depois, a Cobrança do dia não muda; vale pros clientes dele.
// v19 (26/10, dono): o comercial (ou admin) pode EXCLUIR um passo da régua dele (wa_regua_comercial.excluida,
//  mig 75): o passo não sai pros clientes daquele comercial; a padrão e os outros não mudam.
// v18 (26/10, dono): RÉGUA DE CADA COMERCIAL — wa_regua_comercial (mig 74) guarda a versão
//  de um passo da sequência padrão para um comercial; o cliente recebe a do SEU comercial (sem
//  versão = a padrão). Só a mensagem muda: o passo, os dias e a trava são os da padrão. Fila
//  agrupada também pela versão (um envio = um conteúdo).
// v17 (26/10, dono): (1) a data da cobrança de cada ciclo é a ESCRITA na Gestão (cabeçalho do
//  mês daquele ciclo: "26/out"); sem data escrita no mês certo, vale a do Calendário e depois o
//  dia do ciclo. (2) COBRANÇA PRIMEIRO: aviso de atraso/retomada só pra quem já recebeu a
//  Cobrança do dia da competência (na fila, enviada ou com erro de envio); senão sai a Cobrança
//  no lugar — regras puras em regua.ts (datasDaGestao, devidosNoDia), testadas.
// v15 (19/10): modo "número único" da configuração inicial (configuracao_sistema):
//  com modo_whatsapp='unico' TODA a cobrança (régua, prévia, cobertura e fila) sai pelo
//  canal_unico_id, como reserva — {atendente} segue sendo o comercial do cliente; sem o
//  modo, nada muda. Escolha do número extraída pra canal.ts (testada em canal_test.ts).
// v14 (30/09): rascunho preso SEM data há 1h+ (criação interrompida no meio) expira como
//  erro explicado e solta a trava do passo do mês na régua (antes ficava invisível pra sempre).
// v13 (24/09): 5xx/timeout no disparo não repete; legenda do áudio não repete; trava do número
//  renovável; régua antes de campanha no mesmo número; envio novo sem alvos não conclui;
//  1 vez por telefone pelo que está NA FILA/saiu hoje; pausa por resposta também pelo telefone;
//  prévia sempre com a população inteira; erro na geração não trava a fila.
// v12 (24/09): fila POR NÚMERO em paralelo (trava + intervalo anti-bloqueio por número),
//  telefone repetido não recebe 2x, dado faltando espera, timeout no disparo não repete,
//  confere de novo telefone/comercial/cliente excluído na hora, expira manual em 24h,
//  batimento em wa_motor_status, prévia só com usuário logado.
// v10 (24/09, "envios completos"):
//  · população = clientes EM COBRANÇA (situacao='cancelado'; antes cobrava os Novos);
//  · cada cliente SÓ pelo número do próprio comercial (dono do número); sem número
//    conectado = "aguardando número" (número reserva só se configurado na Régua);
//  · datas: vencimento efetivo (data manual do Calendário, senão o dia do ciclo)
//    + dias permitidos (todos / úteis / úteis+sábado) — regras em regua.ts (testadas);
//  · grupo SUBSTITUI a mensagem padrão do mesmo "quando"; scripts não disparam;
//  · na hora do envio confere de novo: pagou? comprovante aguardando? pediu SAIR?;
//  · valida o número no WhatsApp (JID real) → conversa ÚNICA por cliente, e a
//    resposta dele marca "respondeu" (trigger no banco);
//  · rastro por alvo: número de saída, conversa, mensagem FINAL, competência,
//    vencimento, entrega/leitura (trigger), tentativas, motivo de "pulado";
//  · falha passageira tenta de novo (até 3x); o que não saiu no dia EXPIRA
//    (texto de "hoje" nunca sai no dia seguinte); teto diário por número;
//  · ação 'previa': quem recebe o quê em cada dia, SEM enviar nada;
//  · rodadas registradas (saúde) + checagem da conexão a cada 5 minutos.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { sendText, sendMedia, sendWhatsAppAudio, sendPresence, evolutionConfigured, resolverNumero, connectionState } from './evolution.ts';
import {
  agoraBRT, aplicarVars, candidatosTel, chaveTel, comportamentoPor, compDe, compSoma, datasDaGestao, devidosClienteNoDia, devidosNoDia,
  diaBRTde, diaCobrado, marcarCobrado, versoesPor, type Versoes,
  erroPassageiro, hojeBRT, mensagemLegivel, nomeBonito, normNome, partesEnviaveis, somaDias,
  type CabecalhoMes, type DadosVars, type Devido, type DiasEnvio, type LeadR, type MsgR, type Parte,
} from './regua.ts';
import { atendenteDe, canalDoCliente, conectado, type Canal } from './canal.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-motor-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ORCAMENTO_MS = 45_000;

function igual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let x = 0; for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}
const MIME_DE: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
  mp4: 'video/mp4', '3gp': 'video/3gpp', mov: 'video/quicktime',
  ogg: 'audio/ogg', mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', webm: 'audio/webm',
  pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv', txt: 'text/plain', zip: 'application/zip',
};
const mimeDoNome = (n: string) => MIME_DE[(n.split('.').pop() ?? '').toLowerCase()] ?? 'application/octet-stream';
const digitos = (s: string | null | undefined) => String(s ?? '').replace(/\D/g, '');
const msgDe = (e: unknown) => String((e as Error)?.message ?? e);

// deno-lint-ignore no-explicit-any
type Admin = any;
type Cfg = {
  ativa: boolean; hora_envio: number; canal_reserva_id: string | null; dias_envio: DiasEnvio;
  teto_diario: number; pausar_se_respondeu: boolean; delay_min: number; delay_max: number;
  /** janela da régua: de hora_envio até ANTES de hora_fim (BRT); pausa longa por número */
  hora_fim: number; pausa_cada: number; pausa_min: number;
  /** v27: início próprio de cada comercial (nome normalizado → hora; mig 82). Fora do mapa = hora_envio */
  horario_comercial: Record<string, number>;
  /** v29: comerciais que pausaram a PRÓPRIA régua (mig 85) — os clientes deles não recebem nada */
  pausados: Set<string>;
  // modo "número único" da configuração inicial: só true com modo_whatsapp='unico' E canal definido
  modo_unico: boolean; canal_unico_id: string | null;
};

/** lê TODAS as linhas (PostgREST corta em 1000). Erro de leitura ABORTA — nunca vira
    "ninguém pagou" (quem pagou receberia cobrança). */
async function todas<T>(rotulo: string, monta: (de: number, ate: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const PAG = 1000; const out: T[] = [];
  for (let i = 0; i < 100; i++) {
    const { data, error } = await monta(i * PAG, i * PAG + PAG - 1);
    if (error) throw new Error(`leitura de ${rotulo} falhou: ${error.message}`);
    const lote = (data ?? []) as T[];
    out.push(...lote);
    if (lote.length < PAG) break;
  }
  return out;
}
const lotes = <T>(xs: T[], n = 150): T[][] => { const r: T[][] = []; for (let i = 0; i < xs.length; i += n) r.push(xs.slice(i, i + n)); return r; };
/** início do dia (BRT) em ISO UTC */
const inicioDiaUTC = (iso: string) => `${iso}T03:00:00.000Z`;

/* =====================================================================
   CONTEXTO: tudo que a régua precisa ler (uma vez por chamada)
   ===================================================================== */
type Ctx = {
  cfg: Cfg; msgs: MsgR[]; canais: Canal[]; nomeDono: Map<string, string>;
  leads: LeadR[]; leadPorId: Map<string, LeadR>; manual: Map<number, Map<string, string>>;
  /** datas de cobrança escritas na Gestão: dia do ciclo → competência → ISO (vence o Calendário) */
  gestao: Map<number, Map<string, string>>;
  /** régua própria de cada comercial (mig 74): comercial → passo → blocos */
  versoes: Versoes;
  comportamentoDe?: ReturnType<typeof comportamentoPor>;
};
async function carregarCfg(admin: Admin): Promise<Cfg> {
  const { data, error } = await admin.from('wa_regua_config')
    .select('ativa, hora_envio, hora_fim, canal_reserva_id, dias_envio, teto_diario, pausar_se_respondeu, delay_min, delay_max, pausa_cada, pausa_min, horario_comercial, regua_pausada').eq('id', 1).maybeSingle();
  if (error) throw new Error(`config da régua: ${error.message}`);
  // modo "número único" (configuracao_sistema, sem policy — o service lê). Erro de leitura
  // ABORTA como as demais: com o modo ligado, cair em silêncio no por-atendente mandaria
  // cobrança pelos números errados. ÚNICA exceção: a TABELA ainda não existe (motor
  // publicado antes da mig 70) — aí o modo único não pode estar ligado e o por-atendente
  // é categoricamente seguro; sem a exceção, a fila inteira de envios pararia.
  const { data: cs, error: eCs } = await admin.from('configuracao_sistema')
    .select('modo_whatsapp, canal_unico_id').eq('singleton', true).maybeSingle();
  if (eCs) {
    const semTabela = (eCs as { code?: string }).code === 'PGRST205'
      || /schema cache|does not exist/i.test(eCs.message ?? '');
    if (!semTabela) throw new Error(`configuração do sistema: ${eCs.message}`);
  }
  const canalUnico: string | null = !eCs && cs?.modo_whatsapp === 'unico' ? (cs?.canal_unico_id ?? null) : null;
  return {
    ativa: data?.ativa === true, hora_envio: Number(data?.hora_envio ?? 9), canal_reserva_id: data?.canal_reserva_id ?? null,
    dias_envio: (['todos', 'uteis', 'uteis_sabado'].includes(data?.dias_envio) ? data.dias_envio : 'todos') as DiasEnvio,
    teto_diario: Math.max(0, Number(data?.teto_diario ?? 60)), pausar_se_respondeu: data?.pausar_se_respondeu !== false,
    delay_min: Math.max(5, Number(data?.delay_min ?? 20)), delay_max: Math.max(5, Number(data?.delay_max ?? 45)),
    hora_fim: Math.min(22, Math.max(Number(data?.hora_envio ?? 9) + 1, Number(data?.hora_fim ?? 20))),
    horario_comercial: Object.fromEntries(Object.entries((data?.horario_comercial ?? {}) as Record<string, unknown>)
      .filter(([k, v]) => !!normNome(k) && Number.isInteger(Number(v))).map(([k, v]) => [normNome(k), Number(v)])),
    pausados: new Set(Object.keys((data?.regua_pausada ?? {}) as Record<string, unknown>).map((k) => normNome(k)).filter(Boolean)),
    pausa_cada: Math.max(0, Number(data?.pausa_cada ?? 0)), pausa_min: Math.max(0, Number(data?.pausa_min ?? 0)),
    modo_unico: !!canalUnico, canal_unico_id: canalUnico,
  };
}
async function carregarCanais(admin: Admin): Promise<{ canais: Canal[]; nomeDono: Map<string, string> }> {
  const { data, error } = await admin.from('wa_canais').select('id, nome, estado, instancia, numero, dono_id').order('created_at', { ascending: true });
  if (error) throw new Error(`números: ${error.message}`);
  const canais = (data ?? []) as Canal[];
  const donos = [...new Set(canais.map((c) => c.dono_id).filter(Boolean))] as string[];
  const nomeDono = new Map<string, string>();
  if (donos.length) {
    const { data: ps, error: e2 } = await admin.from('profiles').select('id, nome').in('id', donos);
    if (e2) throw new Error(`perfis: ${e2.message}`);
    for (const p of (ps ?? []) as { id: string; nome: string | null }[]) nomeDono.set(p.id, p.nome ?? '');
  }
  return { canais, nomeDono };
}
async function carregarContexto(admin: Admin, o: { leadId?: string | null; comercial?: string | null; compAtual: string }): Promise<Ctx> {
  const cfg = await carregarCfg(admin);
  const { data: mR, error: eM } = await admin.from('wa_regua_msgs')
    .select('id, alvo, nome, quando, blocos, criterio, cli_id, data_envio, grupo_nome').eq('ativo', true).in('alvo', ['padrao', 'grupo', 'cliente']);
  if (eM) throw new Error(`mensagens da régua: ${eM.message}`);
  const msgs = (mR ?? []) as MsgR[];
  const { canais, nomeDono } = await carregarCanais(admin);

  const COLS = 'id, nome, comercial, dia, telefone, dia_alterado_em, valor, situacao';
  let leads = await todas<LeadR>('clientes', (de, ate) => {
    // Cancelados (mig 79) saem da régua: com `cancelamento` preenchido o cliente não é cobrado
    let q = admin.from('leads').select(COLS).eq('situacao', 'cancelado').eq('parado_pendente', false).not('dia', 'is', null).is('cancelamento', null);
    if (o.leadId) q = q.eq('id', o.leadId);
    return q.order('id', { ascending: true }).range(de, ate);
  });
  if (o.comercial) leads = leads.filter((l) => normNome(l.comercial) === normNome(o.comercial));
  const leadPorId = new Map(leads.map((l) => [l.id, l]));
  // "cliente específico" pode estar em qualquer situação
  const cliIds = [...new Set(msgs.filter((m) => m.alvo === 'cliente' && m.cli_id).map((m) => m.cli_id!))].filter((id) => !leadPorId.has(id));
  for (const ids of lotes(cliIds)) {
    const { data, error } = await admin.from('leads').select(COLS).in('id', ids).is('cancelamento', null);
    if (error) throw new Error(`clientes específicos: ${error.message}`);
    for (const l of (data ?? []) as LeadR[]) {
      if (o.leadId && l.id !== o.leadId) continue;
      if (o.comercial && normNome(l.comercial) !== normNome(o.comercial)) continue;
      leadPorId.set(l.id, l);
    }
  }

  // datas MANUAIS do Calendário (dono 15/09: o que ele marca manda em tudo)
  const cd = await todas<{ dia: number; comp: string; cobranca: string }>('calendário', (de, ate) =>
    admin.from('ciclos_datas').select('dia, comp, cobranca').not('cobranca', 'is', null).order('dia').order('comp').range(de, ate));
  const manual = new Map<number, Map<string, string>>();
  for (const r of cd) {
    const dd = Number(r.dia); if (!dd) continue;
    (manual.get(dd) ?? manual.set(dd, new Map()).get(dd)!).set(String(r.comp), String(r.cobranca).slice(0, 10));
  }

  // datas ESCRITAS na Gestão (dono 26/10: "o que tá lá é pra seguir") — cabeçalho do mês de cada ciclo
  const gestao = await carregarDatasGestao(admin);
  // régua de cada comercial (só as dos passos ativos da padrão interessam; as outras não casam)
  const passosPadrao = msgs.filter((m) => m.alvo === 'padrao').map((m) => m.id);
  const vrs: { id: string; passo_id: string; comercial: string; blocos: unknown; excluida?: boolean | null; quando?: number | null }[] = [];
  for (const lt of lotes(passosPadrao, 50)) {
    const { data: vs, error: eV } = await admin.from('wa_regua_comercial').select('id, passo_id, comercial, blocos, excluida, quando').in('passo_id', lt);
    // tabela ainda não criada (mig 74 não aplicada): ninguém tem versão — vale a padrão, sem derrubar a régua
    // (só tabela AUSENTE; coluna faltando — 42703 — é erro de verdade: senão as mensagens próprias sumiriam em silêncio)
    if (eV && (eV.code === 'PGRST205' || eV.code === '42P01' || /could not find the table|relation "?[\w.]*wa_regua_comercial"? does not exist/i.test(eV.message))) break;
    if (eV) throw new Error(`régua dos comerciais: ${eV.message}`);
    vrs.push(...((vs ?? []) as typeof vrs));
  }
  const versoes = versoesPor(vrs);

  let comportamentoDe: Ctx['comportamentoDe'];
  if (msgs.some((m) => m.alvo === 'grupo' && String(m.criterio ?? '').startsWith('comp:'))) {
    const { data: cs, error } = await admin.from('competencias').select('comp').order('ordem', { ascending: true });
    if (error) throw new Error(`competências: ${error.message}`);
    const pags = await todas<{ lead_id: string; comp: string; status: string }>('pagamentos', (de, ate) =>
      admin.from('pagamentos').select('lead_id, comp, status').in('status', ['pago', 'nao_pagou']).order('id', { ascending: true }).range(de, ate));
    const cel = new Map<string, Map<string, string>>();
    for (const p of pags) (cel.get(p.lead_id) ?? cel.set(p.lead_id, new Map()).get(p.lead_id)!).set(p.comp, p.status);
    comportamentoDe = comportamentoPor(((cs ?? []) as { comp: string }[]).map((r) => String(r.comp)), cel, o.compAtual);
  }
  return { cfg, msgs, canais, nomeDono, leads, leadPorId, manual, gestao, versoes, comportamentoDe };
}

/** cabeçalhos de mês da Gestão (linha de cabeçalho de cada ciclo × colunas de mês) → datasDaGestao.
    Erro de leitura = erro da rodada (fail-closed: nunca cobra com data errada). */
async function carregarDatasGestao(admin: Admin): Promise<Map<number, Map<string, string>>> {
  const { data: bl, error: e1 } = await admin.from('planilha_blocos').select('id, dia, comp_base, criado_em').not('dia', 'is', null).not('comp_base', 'is', null);
  if (e1) throw new Error(`ciclos da Gestão: ${e1.message}`);
  const { data: cols, error: e2 } = await admin.from('planilha_colunas').select('id, mes_pos').eq('tipo', 'mes').not('mes_pos', 'is', null);
  if (e2) throw new Error(`colunas da Gestão: ${e2.message}`);
  const { data: lin, error: e3 } = await admin.from('planilha_linhas').select('id, bloco, ordem').eq('tipo', 'cabecalho').not('bloco', 'is', null);
  if (e3) throw new Error(`cabeçalhos da Gestão: ${e3.message}`);
  const bloco = new Map(((bl ?? []) as { id: string; dia: number; comp_base: string; criado_em: string | null }[]).map((b) => [b.id, b]));
  const linha = new Map(((lin ?? []) as { id: string; bloco: string; ordem: number | null }[]).filter((l) => bloco.has(l.bloco)).map((l) => [l.id, l]));
  const colPos = new Map(((cols ?? []) as { id: string; mes_pos: number }[]).map((c) => [c.id, Number(c.mes_pos)]));
  if (!linha.size || !colPos.size) return new Map();
  const cel = await todas<{ linha_id: string; coluna_id: string; texto: string | null }>('datas da Gestão', (de, ate) =>
    admin.from('planilha_celulas').select('linha_id, coluna_id, texto').in('linha_id', [...linha.keys()]).in('coluna_id', [...colPos.keys()])
      .order('linha_id', { ascending: true }).order('coluna_id', { ascending: true }).range(de, ate));
  const cabs: CabecalhoMes[] = [];
  for (const c of cel) {
    const l = linha.get(c.linha_id); const b = l ? bloco.get(l.bloco) : undefined;
    if (b) cabs.push({ dia: Number(b.dia), comp_base: String(b.comp_base), mes_pos: colPos.get(c.coluna_id) ?? null, texto: c.texto,
      bloco_criado: b.criado_em, ordem: l?.ordem != null ? Number(l.ordem) : null });
  }
  return datasDaGestao(cabs);
}

/** "cobrança primeiro": 1º dia (BRT) em que a Cobrança do dia (passo quando 0 da régua, padrão ou
    de grupo) de cada competência entrou na fila ou saiu — por cliente e pelo telefone.
    Conta: na fila, enviando, enviada; ERRO só quando pode ter chegado (parte já saiu ou "sem
    confirmação — confira na conversa"); EXPIRADA/PULADA só se alguma parte já tinha saído.
    NÃO conta: expirada/pulada/cancelada sem nada enviado, nem erro em que nada saiu (número sem
    WhatsApp, criação interrompida, número removido). O ciclo do telefone vem do cadastro atual. */
async function carregarCobrados(admin: Admin, comps: string[], leadPorId: Map<string, LeadR>, fila?: { hoje: string; cfg: Cfg }): Promise<Map<string, string>> {
  // v24: com a janela fechada (ou a régua desligada), a Cobrança de HOJE que ainda está na fila sem
  // nada enviado não sai mais — expira à meia-noite. Não conta como cobrada (a prévia de amanhã
  // mostraria outra coisa do que o motor vai fazer)
  // mesma regra da prévia (que mostra o que aconteceria com a régua LIGADA): só o fim da janela conta
  const filaParada = !!fila && agoraBRT().getUTCHours() >= fila.cfg.hora_fim;
  const out = new Map<string, string>();
  if (!comps.length) return out;
  const rs = await todas<{ lead_id: string | null; comp: string; telefone: string | null; status: string; erro: string | null; parte_atual: number | null; created_at: string }>('cobranças feitas', (de, ate) =>
    admin.from('wa_envio_alvos').select('id, lead_id, comp, telefone, status, erro, parte_atual, created_at, wa_envios!inner(origem, passo_quando)')
      .in('comp', comps).in('status', ['pendente', 'enviando', 'enviado', 'erro', 'pulado'])
      .eq('wa_envios.origem', 'regua').eq('wa_envios.passo_quando', 0)
      .order('id', { ascending: true }).range(de, ate));
  for (const r of rs) {
    const saiuParte = Number(r.parte_atual ?? 0) > 0;
    if (r.status === 'erro' && !(saiuParte || /confira na conversa/i.test(r.erro ?? ''))) continue;
    if (r.status === 'pulado' && !saiuParte) continue;
    const dia = diaBRTde(r.created_at); if (!dia) continue;
    if (filaParada && r.status === 'pendente' && !saiuParte && dia === fila!.hoje) continue;
    const ciclo = r.lead_id ? leadPorId.get(r.lead_id)?.dia ?? null : null;
    marcarCobrado(out, r.lead_id, r.telefone, ciclo, r.comp, dia);
  }
  return out;
}

// canalDoCliente/atendenteDe (número de saída + nome em {atendente}, inclusive o modo
// "número único") vivem em canal.ts — puros e testados em canal_test.ts.

/** rótulo do passo na tela (Envios/prévia): "Lembrete amigável", "Inadimplentes (grupo)", "Acordo (cliente)" */
const rotuloPasso = (m: MsgR) => m.alvo === 'grupo' ? `${m.grupo_nome || m.nome} (grupo)` : m.alvo === 'cliente' ? `${m.nome} (cliente)` : m.nome;

/* =====================================================================
   AVALIAÇÃO: quem recebe o quê em cada dia (prévia = geração, mesma conta)
   ===================================================================== */
type Status = 'vai_receber' | 'gerado' | 'pulado' | 'aguardando';
type Avaliado = Devido & { status: Status; motivo: string | null; canal: Canal | null; reserva: boolean; atendente: string; envio_id?: string | null; texto?: string | null; falta?: string | null };

async function avaliar(admin: Admin, ctx: Ctx, datas: string[], hoje: string, comTexto: boolean): Promise<Avaliado[]> {
  // nada vence em nenhum dia da janela: nem consulta o resto (a troca "cobrança primeiro" só troca a
  // mensagem, nunca cria nem tira um item — então a checagem sem ela basta)
  const algum = datas.some((d) => devidosNoDia(d, ctx.leads, ctx.msgs, ctx.manual, ctx.cfg.dias_envio, ctx.comportamentoDe, { gestao: ctx.gestao, versoes: ctx.versoes }).length
    || devidosClienteNoDia(d, ctx.msgs, ctx.leadPorId).length);
  if (!algum) return [];
  // competências que a janela pode tocar (mês anterior/atual/seguinte de cada dia)
  const comps = [...new Set(datas.flatMap((d) => [-2, -1, 0, 1, 2].map((n) => compSoma(compDe(d), n))))];
  const leadIds = new Set(ctx.leadPorId.keys());
  // cobrança primeiro (dono 26/10): quando a Cobrança do dia de cada competência já entrou na fila/saiu
  const cobradoEm = await carregarCobrados(admin, comps, ctx.leadPorId, { hoje, cfg: ctx.cfg });
  const quandoCobrado = (l: LeadR, comp: string) => diaCobrado(cobradoEm, l, comp);

  // bloqueios da competência: pagou/fora na Gestão, comprovante aguardando o financeiro
  const bloq = new Map<string, string>();
  const pags = await todas<{ lead_id: string; comp: string; status: string }>('pagamentos', (de, ate) =>
    admin.from('pagamentos').select('lead_id, comp, status').in('comp', comps).in('status', ['pago', 'fora']).order('id', { ascending: true }).range(de, ate));
  for (const p of pags) if (leadIds.has(p.lead_id)) bloq.set(`${p.lead_id}|${p.comp}`, p.status === 'pago' ? 'já pagou a competência' : 'marcado "fora da régua" na Gestão');
  const ent = await todas<{ lead_id: string; comp: string }>('entradas', (de, ate) =>
    admin.from('entradas').select('lead_id, comp').eq('estado', 'pendente').in('comp', comps).order('id', { ascending: true }).range(de, ate));
  for (const e of ent) if (leadIds.has(e.lead_id) && !bloq.has(`${e.lead_id}|${e.comp}`)) bloq.set(`${e.lead_id}|${e.comp}`, 'comprovante aguardando o financeiro');
  // pediu pra sair
  const optout = new Set((await todas<{ chave: string }>('opt-out', (de, ate) => admin.from('wa_optout').select('chave').order('chave').range(de, ate))).map((r) => r.chave));
  // já gerados (trava): todas as chaves que a janela pode usar — o mês, `mês@dia` (Cobrança no
  // lugar de um aviso) e `dia:` (cliente específico)
  const chaves = [...new Set([...comps, ...comps.flatMap((c) => datas.map((d) => `${c}@${d}`)), ...datas.map((d) => `dia:${d}`)])];
  const msgIds = ctx.msgs.map((m) => m.id);
  const gerado = new Map<string, string | null>();
  for (const ids of lotes(msgIds, 50)) for (const chs of lotes(chaves, 60)) {
    const ds = await todas<{ lead_id: string; regua_msg_id: string; chave: string; envio_id: string | null }>('disparos', (de, ate) =>
      admin.from('wa_regua_disparos').select('lead_id, regua_msg_id, chave, envio_id').in('regua_msg_id', ids).in('chave', chs).order('id', { ascending: true }).range(de, ate));
    for (const d of ds) gerado.set(`${d.lead_id}|${d.regua_msg_id}|${d.chave}`, d.envio_id);
  }
  // cliente que RESPONDEU a um envio da régua nesta competência → os próximos passos pausam
  const respondeu = new Set<string>();
  if (ctx.cfg.pausar_se_respondeu) {
    const rs = await todas<{ lead_id: string | null; comp: string; telefone: string }>('respostas', (de, ate) =>
      admin.from('wa_envio_alvos').select('lead_id, comp, telefone').in('comp', comps).not('respondeu_em', 'is', null).order('id', { ascending: true }).range(de, ate));
    for (const r of rs) {
      if (r.lead_id) respondeu.add(`${r.lead_id}|${r.comp}`);
      const ch = chaveTel(r.telefone); if (ch) respondeu.add(`tel:${ch}|${r.comp}`);   // o mesmo número em outro cadastro também pausa
    }
  }
  // telefones que JÁ têm este passo na fila/saído HOJE (qualquer cadastro) — 1 vez por número
  const telOcupado = new Map<string, string>();
  if (datas.includes(hoje)) {
    const ocup = await todas<{ telefone: string; nome: string | null; regua_msg_id: string | null; status: string }>('fila de hoje', (de, ate) =>
      admin.from('wa_envio_alvos').select('telefone, nome, regua_msg_id, status').gte('created_at', inicioDiaUTC(hoje)).not('regua_msg_id', 'is', null)
        .in('status', ['pendente', 'enviando', 'enviado']).order('id', { ascending: true }).range(de, ate));
    for (const o of ocup) { const ch = chaveTel(o.telefone); if (ch && o.regua_msg_id) telOcupado.set(`${hoje}|${o.regua_msg_id}|${ch}`, o.nome ?? 'outro cadastro'); }
  }
  // teto diário por número: o que já saiu/entrou na fila HOJE por número
  const usadosHoje = new Map<string, number>();
  if (ctx.cfg.teto_diario > 0 && datas.includes(hoje)) {
    const us = await todas<{ canal_id: string | null; status: string }>('uso do dia', (de, ate) =>
      admin.from('wa_envio_alvos').select('canal_id, status').gte('created_at', inicioDiaUTC(hoje)).not('canal_id', 'is', null).order('id', { ascending: true }).range(de, ate));
    for (const u of us) if (u.canal_id && !['cancelado', 'pulado'].includes(u.status)) usadosHoje.set(u.canal_id, (usadosHoje.get(u.canal_id) ?? 0) + 1);
  }

  // prioridade: cliente específico, depois o dia do vencimento, depois os mais perto dele
  const ordem = (x: Devido) => (x.msg.alvo === 'cliente' ? -1 : Math.abs(Number(x.msg.quando ?? 0)));
  const out: Avaliado[] = [];
  const telNoDia = new Map<string, string>();       // data|msg|chaveTel → nome de quem já recebe
  const cotaNoDia = new Map<string, number>();       // data|canal → quantos já contam
  // quem JÁ está na fila/saiu hoje (rodadas anteriores) ocupa o telefone daquele passo —
  // senão o 2º cadastro com o mesmo número entraria na rodada seguinte (mensagem 2x).
  // Conta o que de fato está na fila/saiu (se o 1º foi pulado por ter pago, o 2º pode receber).
  for (const [k, nome] of telOcupado) telNoDia.set(k, nome);
  // dia a dia: a Cobrança que VAI sair num dia (de hoje em diante) conta como recebida nos
  // dias seguintes da prévia — a que fica aguardando/pulada não conta, e a já "gerado" de verdade
  // já veio do banco (carregarCobrados), igual ao motor
  for (const d of datas) {
    const doDia: Devido[] = [
      ...devidosNoDia(d, ctx.leads, ctx.msgs, ctx.manual, ctx.cfg.dias_envio, ctx.comportamentoDe, { gestao: ctx.gestao, cobradoEm: quandoCobrado, versoes: ctx.versoes }),
      ...devidosClienteNoDia(d, ctx.msgs, ctx.leadPorId),
    ];
    doDia.sort((a, b) => ordem(a) - ordem(b));
    for (const x of doDia) {
      const { canal, reserva, motivo: semNum } = canalDoCliente(ctx, x.lead.comercial);
      const a: Avaliado = { ...x, status: 'vai_receber', motivo: null, canal, reserva, atendente: canal ? atendenteDe(ctx, canal, reserva, x.lead.comercial) : nomeBonito(x.lead.comercial) };
      const ch = chaveTel(x.lead.telefone);
      const kGer = `${x.lead.id}|${x.msg.id}|${x.chave}`;
      if (!ch) { a.status = 'pulado'; a.motivo = 'sem telefone válido na Gestão'; }
      else if (optout.has(ch)) { a.status = 'pulado'; a.motivo = 'pediu pra sair (SAIR)'; }
      else if (x.comp && bloq.has(`${x.lead.id}|${x.comp}`)) { a.status = 'pulado'; a.motivo = bloq.get(`${x.lead.id}|${x.comp}`)!; }
      else if (ctx.cfg.pausados.has(normNome(x.lead.comercial))) { a.status = 'pulado'; a.motivo = `régua de ${nomeBonito(x.lead.comercial)} pausada`; }
      else if (gerado.has(kGer)) { a.status = 'gerado'; a.envio_id = gerado.get(kGer) ?? null; }
      else if (x.comp && x.msg.alvo !== 'cliente' && (respondeu.has(`${x.lead.id}|${x.comp}`) || respondeu.has(`tel:${ch}|${x.comp}`))) { a.status = 'pulado'; a.motivo = 'cliente respondeu — atendimento humano (régua pausada no mês)'; }
      else if (!canal || semNum) { a.status = 'aguardando'; a.motivo = semNum ?? 'sem número conectado'; }
      // a mensagem EXATA do cliente — e, se faltar dado na Gestão, o aviso antes de sair
      const dados: DadosVars = { nome: x.lead.nome, valorParcela: x.lead.valor != null ? Number(x.lead.valor) : null, atendente: a.atendente, venc: x.venc, dia: x.lead.dia, hoje: x.data };
      let texto: string | null = null;
      if (comTexto || a.status === 'vai_receber') {
        try { texto = mensagemLegivel(partesEnviaveis(x.msg.blocos), dados); } catch (e) { a.falta = msgDe(e); }
      }
      if (a.status === 'vai_receber') {
        const kTel = `${x.data}|${x.msg.id}|${ch}`;
        if (a.falta) {
          // dado faltando: ESPERA (não gasta a trava do mês) — corrigiu a Gestão, sai na próxima geração do dia
          a.status = 'aguardando'; a.motivo = `falta dado na Gestão: ${a.falta.replace(/^sem /, '').replace(/ — complete o cadastro na Gestão$/, '')}`;
        } else if (telNoDia.has(kTel)) { a.status = 'pulado'; a.motivo = `mesmo telefone de ${telNoDia.get(kTel)} (recebe 1 vez só)`; }
        else {
          let cabe = true;
          if (ctx.cfg.teto_diario > 0 && canal) {
            const kc = `${x.data}|${canal.id}`;
            const ja = (cotaNoDia.get(kc) ?? 0) + (x.data === hoje ? (usadosHoje.get(canal.id) ?? 0) : 0);
            if (ja >= ctx.cfg.teto_diario) { cabe = false; a.status = 'aguardando'; a.motivo = `limite diário do número (${ctx.cfg.teto_diario}) — não sai hoje`; }
            else cotaNoDia.set(kc, (cotaNoDia.get(kc) ?? 0) + 1);
          }
          if (cabe) telNoDia.set(kTel, x.lead.nome);   // só reserva o telefone de quem VAI mesmo
        }
        // depois do fim da janela a régua não monta mais a fila de hoje
        if (a.status === 'vai_receber' && x.data === hoje && agoraBRT().getUTCHours() >= ctx.cfg.hora_fim) { a.status = 'aguardando'; a.motivo = `depois das ${ctx.cfg.hora_fim}h (fim da janela) — não sai hoje`; }
      }
      if (comTexto) a.texto = texto;
      out.push(a);
      if (d >= hoje && x.comp && x.msg.alvo !== 'cliente' && Number(x.msg.quando ?? 0) === 0 && a.status === 'vai_receber') {
        marcarCobrado(cobradoEm, x.lead.id, x.lead.telefone, x.lead.dia, x.comp, d);
      }
    }
  }
  return out;
}

/* =====================================================================
   GERAÇÃO: coloca na fila o que vence HOJE (com trava 1x/cliente×passo×mês)
   ===================================================================== */
type Resumo = { gerados: number; por_passo: Record<string, number>; pulados: Record<string, number>; aguardando: Record<string, number>; falta_dado: number };
async function gerarRegua(admin: Admin, hoje: string): Promise<Resumo | null> {
  const cfgPeek = await carregarCfg(admin);
  if (!cfgPeek.ativa) return null;
  const hora = agoraBRT().getUTCHours();
  if (hora < cfgPeek.hora_envio || hora >= cfgPeek.hora_fim) return null;   // só dentro da janela (ex. 5h–10h)
  const ctx = await carregarContexto(admin, { compAtual: compDe(hoje) });
  if (!ctx.msgs.length) return null;
  const itens = await avaliar(admin, ctx, [hoje], hoje, false);
  const resumo: Resumo = { gerados: 0, por_passo: {}, pulados: {}, aguardando: {}, falta_dado: 0 };
  for (const a of itens) {
    if (a.status === 'pulado') resumo.pulados[a.motivo ?? '?'] = (resumo.pulados[a.motivo ?? '?'] ?? 0) + 1;
    if (a.status === 'aguardando') resumo.aguardando[a.motivo ?? '?'] = (resumo.aguardando[a.motivo ?? '?'] ?? 0) + 1;
    if (a.falta) resumo.falta_dado += 1;
  }
  const novos = itens.filter((a) => a.status === 'vai_receber' && a.canal);
  if (!novos.length) return resumo;

  // agrupa por passo × número × versão: um envio "Régua: <passo>" por número e por conteúdo
  // (número reserva/único atende comerciais diferentes — cada régua vira o seu envio)
  const grupos = new Map<string, Avaliado[]>();
  for (const a of novos) { const k = `${a.msg.id}|${a.canal!.id}|${a.msg.versao ?? ''}`; (grupos.get(k) ?? grupos.set(k, []).get(k)!).push(a); }
  for (const itensG of grupos.values()) {
    const m = itensG[0].msg, canal = itensG[0].canal!;
    const partes = partesEnviaveis(m.blocos);
    if (!partes.length) continue;
    // trava atômica: só quem entra AGORA recebe (rodadas concorrentes não duplicam)
    const { data: claimed, error: eC } = await admin.from('wa_regua_disparos')
      .upsert(itensG.map((a) => ({ lead_id: a.lead.id, regua_msg_id: m.id, chave: a.chave })), { onConflict: 'lead_id,regua_msg_id,chave', ignoreDuplicates: true })
      .select('lead_id, chave');
    if (eC) throw new Error(`trava da régua: ${eC.message}`);
    const ganhos = new Set(((claimed ?? []) as { lead_id: string; chave: string }[]).map((c) => `${c.lead_id}|${c.chave}`));
    const meus = itensG.filter((a) => ganhos.has(`${a.lead.id}|${a.chave}`));
    if (!meus.length) continue;
    const soltar = async () => {
      for (const a of meus) await admin.from('wa_regua_disparos').delete().eq('regua_msg_id', m.id).eq('lead_id', a.lead.id).eq('chave', a.chave).is('envio_id', null);
    };
    const texto = partes.filter((b) => b.tipo === 'texto').map((b) => String(b.corpo).trim()).join('\n\n');
    const passo = rotuloPasso(m);
    const { data: envio, error: e1 } = await admin.from('wa_envios').insert({
      // nasce 'rascunho' SEM data (o motor não pega) e só é liberado depois que os alvos entrarem
      // mensagem própria de um comercial: o nome do envio diz de quem é (o passo_nome fica o mesmo)
      nome: `Régua: ${passo}${m.versao ? ` · ${nomeBonito(itensG[0].lead.comercial)}` : ''}`, canal_id: canal.id, modelo: texto, blocos: partes, estado: 'rascunho', total: meus.length,
      origem: 'regua', regua_msg_id: m.id, passo_nome: passo, passo_quando: Number(m.quando ?? 0),
      agendado_para: null, delay_min: ctx.cfg.delay_min, delay_max: Math.max(ctx.cfg.delay_min, ctx.cfg.delay_max), presenca: true,
    }).select('id').single();
    if (e1 || !envio) { await soltar(); console.error('envio da régua:', e1?.message); continue; }
    const { error: e2 } = await admin.from('wa_envio_alvos').insert(meus.map((a) => ({
      envio_id: envio.id, telefone: digitos(a.lead.telefone), nome: a.lead.nome, lead_id: a.lead.id,
      comp: a.comp, venc: a.venc, regua_msg_id: m.id, passo_nome: passo,
      canal_id: canal.id, canal_nome: a.atendente, canal_numero: canal.numero,
    })));
    if (e2) { await admin.from('wa_envios').delete().eq('id', envio.id); await soltar(); console.error('alvos da régua:', e2.message); continue; }
    for (const a of meus) await admin.from('wa_regua_disparos').update({ envio_id: envio.id }).eq('regua_msg_id', m.id).eq('lead_id', a.lead.id).eq('chave', a.chave);
    await admin.from('wa_envios').update({ estado: 'enviando', agendado_para: new Date().toISOString() }).eq('id', envio.id);
    resumo.gerados += meus.length;
    resumo.por_passo[passo] = (resumo.por_passo[passo] ?? 0) + meus.length;
  }
  return resumo;
}

/* =====================================================================
   FILA: envia os alvos pendentes (manuais e da régua)
   v12: cada NÚMERO é uma fila própria, processada em paralelo e com trava
   (processando_ate) — um número caído não trava os outros; o intervalo
   anti-bloqueio vale por número, entre envios E entre rodadas (ultimo_envio_em).
   ===================================================================== */
type Envio = {
  id: string; nome: string; modelo: string; variantes: unknown; blocos: unknown; canal_id: string | null; criado_por: string | null;
  midia_path: string | null; midia_tipo: string | null; midia_nome: string | null; delay_min: number | null; delay_max: number | null;
  presenca: boolean | null; origem: string; created_at: string; agendado_para: string | null;
};
type Alvo = {
  id: string; telefone: string; nome: string | null; lead_id: string | null; parte_atual: number | null; comp: string | null; venc: string | null;
  canal_nome: string | null; tentativas: number | null; regua_msg_id: string | null;
};
class Pular extends Error {}
/** erro no DISPARO que pode ter saído mesmo assim (timeout/queda no meio): nunca repete sozinho */
class TalvezSaiu extends Error {}

async function contar(admin: Admin, envioId: string, status: string): Promise<number> {
  const { count, error } = await admin.from('wa_envio_alvos').select('id', { count: 'exact', head: true }).eq('envio_id', envioId).eq('status', status);
  if (error) throw new Error(`contagem do envio: ${error.message}`);
  return count ?? 0;
}
/** atualiza os contadores (sempre) e conclui o envio quando não sobrou nada (só se ainda "enviando") */
async function fecharEnvio(admin: Admin, envioId: string) {
  try {
    const [pend, envi, ok, err, pul, can] = await Promise.all(['pendente', 'enviando', 'enviado', 'erro', 'pulado', 'cancelado'].map((s) => contar(admin, envioId, s)));
    await admin.from('wa_envios').update({ enviados: ok, erros: err, pulados: pul + can }).eq('id', envioId);
    // sem NENHUM alvo ainda = pode estar sendo criado agora: só conclui depois de 5 min
    const vazio = pend + envi + ok + err + pul + can === 0;
    const limite = new Date(Date.now() - 5 * 60_000).toISOString();
    if (pend + envi === 0) {
      let q = admin.from('wa_envios').update({ estado: 'concluido' }).eq('id', envioId).eq('estado', 'enviando');
      if (vazio) q = q.lt('updated_at', limite);
      await q;
    }
  } catch (e) { console.error('fechar envio', envioId, msgDe(e)); }   // contagem falhou: não conclui nada (tenta na próxima)
}

/** o que não sai no prazo EXPIRA: régua no fim do dia (texto de "hoje é o vencimento"
    não sai amanhã); envio manual 24h depois do horário marcado (não dispara de madrugada
    dias depois); rascunho SEM data preso há 1h+ (criação interrompida) vira erro explicado */
async function expirar(admin: Admin, hoje: string) {
  const { data: velhosR } = await admin.from('wa_envios').select('id').eq('estado', 'enviando').eq('origem', 'regua').lt('created_at', inicioDiaUTC(hoje)).limit(50);
  const limite = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { data: velhosM } = await admin.from('wa_envios').select('id').eq('estado', 'enviando').eq('origem', 'manual').lt('agendado_para', limite).limit(50);
  for (const e of (velhosR ?? []) as { id: string }[]) {
    await admin.from('wa_envio_alvos').update({ status: 'pulado', motivo: 'expirou — não saiu no dia (número desconectado, régua desligada, limite do número ou fora do horário)', claim_em: null })
      .eq('envio_id', e.id).in('status', ['pendente', 'enviando']);
    await fecharEnvio(admin, e.id);
  }
  for (const e of (velhosM ?? []) as { id: string }[]) {
    await admin.from('wa_envio_alvos').update({ status: 'pulado', motivo: 'expirou — não saiu em 24h do horário marcado (número desconectado?)', claim_em: null })
      .eq('envio_id', e.id).in('status', ['pendente', 'enviando']);
    await fecharEnvio(admin, e.id);
  }
  // rascunho SEM data com mais de 1h: a criação morreu no meio (o update que dá a data nunca
  // rodou) e o envio ficaria invisível pra sempre — a promoção exige agendado_para. Os alvos
  // viram erro explicado e, se veio da régua, a trava do passo do mês é solta (senão aquele
  // passo ficaria queimado sem nada ter saído).
  const { data: presos } = await admin.from('wa_envios').select('id').eq('estado', 'rascunho').is('agendado_para', null)
    .lt('created_at', new Date(Date.now() - 3600_000).toISOString()).limit(50);
  for (const e of (presos ?? []) as { id: string }[]) {
    await admin.from('wa_envio_alvos').update({ status: 'erro', erro: 'criação interrompida — recrie o envio', claim_em: null })
      .eq('envio_id', e.id).in('status', ['pendente', 'enviando']);
    await admin.from('wa_regua_disparos').delete().eq('envio_id', e.id);
    // o estado do envio não tem 'erro' no banco: fecha como concluído com os alvos em erro
    await admin.from('wa_envios').update({ estado: 'concluido' }).eq('id', e.id).eq('estado', 'rascunho');
    await fecharEnvio(admin, e.id);
  }
}

/** a régua pode COMEÇAR mensagem agora? ligada e dentro da janela (hora de Brasília) */
const reguaAbertaAgora = (cfg: Cfg) => { const h = agoraBRT().getUTCHours(); return cfg.ativa && h >= cfg.hora_envio && h < cfg.hora_fim; };
/** v27 (dono 28/10): hora em que a régua COMEÇA pros clientes deste comercial (Eduardo 7h, Junior e
    Augusto 8h…) — nunca antes do início geral; o fim da janela é o mesmo pra todos */
const inicioDoComercial = (cfg: Cfg, comercial: string | null | undefined) => {
  const h = cfg.horario_comercial[normNome(comercial)];
  // fora da janela (o banco já poda — mig 84 — mas nunca travar o comercial o dia inteiro) = início geral
  return h != null && h > cfg.hora_envio && h < cfg.hora_fim ? h : cfg.hora_envio;
};

async function processarFila(admin: Admin, cfg: Cfg, inicio: number, hoje: string): Promise<{ enviadas: number; falhas: number; puladas: number }> {
  const r = { enviadas: 0, falhas: 0, puladas: 0 };
  // agendados com hora chegada entram em "enviando"
  await admin.from('wa_envios').update({ estado: 'enviando' })
    .eq('estado', 'rascunho').not('agendado_para', 'is', null).lte('agendado_para', new Date().toISOString());
  const reguaLiberada = reguaAbertaAgora(cfg);
  const { canais, nomeDono } = await carregarCanais(admin);

  // envio cujo número foi REMOVIDO: vira erro explicado (não fica "na fila" pra sempre)
  const { data: orfaos } = await admin.from('wa_envios').select('id').eq('estado', 'enviando').is('canal_id', null).limit(20);
  for (const e of (orfaos ?? []) as { id: string }[]) {
    await admin.from('wa_envio_alvos').update({ status: 'erro', erro: 'o número deste envio foi removido' }).eq('envio_id', e.id).in('status', ['pendente', 'enviando']);
    await fecharEnvio(admin, e.id);
  }

  const ativos = canais.filter(conectado);
  if (!ativos.length) return r;
  let q = admin.from('wa_envios')
    .select('id, nome, modelo, variantes, blocos, canal_id, criado_por, midia_path, midia_tipo, midia_nome, delay_min, delay_max, presenca, origem, created_at, agendado_para, total')
    .eq('estado', 'enviando').in('canal_id', ativos.map((c) => c.id));   // número desconectado não ocupa vaga
  if (!reguaLiberada) q = q.neq('origem', 'regua');   // régua desligada/fora do horário: fica parada (expira no fim do dia)
  const { data: envios0, error } = await q.order('agendado_para', { ascending: true, nullsFirst: false }).order('created_at', { ascending: true }).limit(60);
  if (error) throw new Error(`fila: ${error.message}`);
  const envios = [...(envios0 ?? [])];
  // v24: fora da janela (ou régua desligada) a mensagem da régua que JÁ COMEÇOU a sair (parte 1 foi,
  // a 2 ficou pra rodada seguinte) é TERMINADA — senão o cliente fica com "segue o áudio" sem o áudio.
  // Só essas: ninguém novo começa (o processarNumero filtra parte_atual > 0). E só com prazo curto: da
  // abertura até 1 hora depois do fim da janela, e só mensagem de HOJE (a de ontem expira, nunca sai amanhã)
  const hBR = agoraBRT().getUTCHours();
  if (!reguaLiberada && hBR >= cfg.hora_envio && hBR < cfg.hora_fim + 1) {
    const { data: meio, error: eMeio } = await admin.from('wa_envio_alvos').select('envio_id, wa_envios!inner(origem, estado, created_at)')
      .eq('status', 'pendente').gt('parte_atual', 0).eq('wa_envios.origem', 'regua').eq('wa_envios.estado', 'enviando')
      .gte('wa_envios.created_at', inicioDiaUTC(hoje)).limit(200);
    if (eMeio) console.error('régua começada', eMeio.message);
    const ids = [...new Set(((meio ?? []) as { envio_id: string }[]).map((x) => x.envio_id))];
    if (ids.length) {
      const { data: ev, error: eEv } = await admin.from('wa_envios')
        .select('id, nome, modelo, variantes, blocos, canal_id, criado_por, midia_path, midia_tipo, midia_nome, delay_min, delay_max, presenca, origem, created_at, agendado_para, total')
        .in('id', ids).eq('estado', 'enviando').in('canal_id', ativos.map((c) => c.id));
      if (eEv) console.error('régua começada', eEv.message);
      envios.push(...(ev ?? []));
    }
  }
  if (!envios.length) return r;
  const optout = new Set((await todas<{ chave: string }>('opt-out', (de, ate) => admin.from('wa_optout').select('chave').order('chave').range(de, ate))).map((x) => x.chave));

  // uma fila por número, em paralelo — dentro do número, a régua do dia e as mensagens
  // programadas de 1 cliente passam na frente das campanhas grandes
  const peso = (e: Envio & { total?: number }) => (e.origem === 'regua' ? 0 : Number(e.total ?? 2) <= 1 ? 1 : 2);
  const porCanal = new Map<string, Envio[]>();
  for (const e of envios as Envio[]) (porCanal.get(e.canal_id!) ?? porCanal.set(e.canal_id!, []).get(e.canal_id!)!).push(e);
  for (const lista of porCanal.values()) lista.sort((a, b) => peso(a) - peso(b));
  const parciais = await Promise.all([...porCanal.entries()].map(([canalId, lista]) =>
    processarNumero(admin, ativos.find((c) => c.id === canalId)!, lista, { cfg, inicio, hoje, optout, nomeDono })
      .catch((e) => { console.error('número', canalId, msgDe(e)); return { enviadas: 0, falhas: 0, puladas: 0 }; })));
  for (const p of parciais) { r.enviadas += p.enviadas; r.falhas += p.falhas; r.puladas += p.puladas; }
  return r;
}

type CtxFila = { cfg: Cfg; inicio: number; hoje: string; optout: Set<string>; nomeDono: Map<string, string> };
async function processarNumero(admin: Admin, canal: Canal, envios: Envio[], cx: CtxFila): Promise<{ enviadas: number; falhas: number; puladas: number }> {
  const r = { enviadas: 0, falhas: 0, puladas: 0 };
  // trava do número: só UMA rodada manda por ele de cada vez (cron + "Processar agora")
  let ate = new Date(Date.now() + 180_000).toISOString();
  const { data: trava } = await admin.from('wa_canais').update({ processando_ate: ate })
    .eq('id', canal.id).or(`processando_ate.is.null,processando_ate.lt."${new Date().toISOString()}"`).select('id, ultimo_envio_em');
  if (!trava?.length) return r;
  /** renova a trava; se outra rodada tomou o número, esta para (nunca 2 mandando pelo mesmo número) */
  const renovar = async (): Promise<boolean> => {
    const novo = new Date(Date.now() + 180_000).toISOString();
    const { data: ok } = await admin.from('wa_canais').update({ processando_ate: novo }).eq('id', canal.id).eq('processando_ate', ate).select('id');
    if (ok?.length) { ate = novo; return true; }
    return false;
  };
  let ultimoEnvio = trava[0].ultimo_envio_em ? new Date(trava[0].ultimo_envio_em).getTime() : 0;
  const marcarEnvio = async () => { ultimoEnvio = Date.now(); await admin.from('wa_canais').update({ ultimo_envio_em: new Date(ultimoEnvio).toISOString() }).eq('id', canal.id); };
  // pausa longa (v22): quantas este número já mandou hoje — a cada `pausa_cada`, descansa `pausa_min` minutos
  let enviadasHoje = 0;
  const comPausa = cx.cfg.pausa_cada > 0 && cx.cfg.pausa_min > 0;
  /** v24: o número só descansa no "degrau" (15, 30, 45…): o 1º envio depois do degrau já sai e a
      pausa conta a partir do último envio. Contagem do dia falhou = não manda nesta rodada (a
      pausa é a proteção contra queda do número — na dúvida, segura) */
  const emPausaLonga = () => comPausa && enviadasHoje > 0
    && enviadasHoje % cx.cfg.pausa_cada === 0 && Date.now() - ultimoEnvio < cx.cfg.pausa_min * 60_000;
  try {
    if (comPausa) {
      const { count, error: eCnt } = await admin.from('wa_envio_alvos').select('id', { count: 'exact', head: true })
        .eq('canal_id', canal.id).eq('status', 'enviado').gte('enviado_em', inicioDiaUTC(cx.hoje));
      if (eCnt || count == null) { console.error('contagem do dia', canal.id, eCnt?.message ?? 'sem contagem'); return r; }
      enviadasHoje = count;
    }
    for (const envio of envios) {
      if (Date.now() - cx.inicio > ORCAMENTO_MS) break;
      // alvos presos em 'enviando' por uma rodada que morreu no meio (>10 min): se nada saiu,
      // volta pra fila; se alguma parte saiu, vira erro "confira" (nunca reenvia às cegas)
      const { data: presos } = await admin.from('wa_envio_alvos').select('id, claim_em').eq('envio_id', envio.id).eq('status', 'enviando')
        .lt('claim_em', new Date(Date.now() - 10 * 60_000).toISOString()).limit(20);
      for (const pr of (presos ?? []) as { id: string; claim_em: string }[]) {
        const { count } = await admin.from('wa_mensagens').select('id', { count: 'exact', head: true }).eq('alvo_id', pr.id).gte('created_at', pr.claim_em);
        if (count) await admin.from('wa_envio_alvos').update({ status: 'erro', claim_em: null, erro: 'a rodada caiu no meio do envio e parte da mensagem já tinha saído — confira na conversa antes de reenviar' }).eq('id', pr.id).eq('status', 'enviando');
        else await admin.from('wa_envio_alvos').update({ status: 'pendente', claim_em: null }).eq('id', pr.id).eq('status', 'enviando');
      }
      const agoraIso = new Date().toISOString();
      let qa = admin.from('wa_envio_alvos')
        .select('id, telefone, nome, lead_id, parte_atual, comp, venc, canal_nome, tentativas, regua_msg_id').eq('envio_id', envio.id).eq('status', 'pendente')
        .or(`tentar_apos.is.null,tentar_apos.lte."${agoraIso}"`);
      // régua fora da janela: só termina quem já começou (v24)
      if (envio.origem === 'regua' && !reguaAbertaAgora(cx.cfg)) qa = qa.gt('parte_atual', 0);
      // v28: no número reserva/único um envio mistura comerciais — quem ainda não começou (horário próprio)
      // não pode ocupar as 20 vagas da rodada e segurar os outros: busca mais e tira os que esperam
      const { data: alvos0 } = await qa.order('created_at', { ascending: true }).limit(envio.origem === 'regua' ? 200 : 20);
      const hAgora = agoraBRT().getUTCHours();
      const comDoAlvo = (a: Alvo) => a.canal_nome || (canal.dono_id ? cx.nomeDono.get(canal.dono_id) : null) || canal.nome;
      const alvos = (alvos0 ?? []).filter((a: Alvo) => envio.origem !== 'regua' || Number(a.parte_atual ?? 0) > 0 || hAgora >= inicioDoComercial(cx.cfg, comDoAlvo(a))).slice(0, 20);
      const esperando = (alvos0 ?? []).length > 0 && !alvos.length;   // todos aguardam o horário do comercial
      if (!alvos.length) { if (!esperando) await fecharEnvio(admin, envio.id); continue; }
      const dMin = Math.max(5, Number(envio.delay_min ?? 20));
      const dMax = Math.max(dMin, Number(envio.delay_max ?? 45));
      let parar = false;
      for (const alvo of alvos as Alvo[]) {
        // pausa longa do número: para esta rodada; a do próximo minuto confere de novo
        if (emPausaLonga()) { parar = true; break; }
        // a janela fechou no meio da rodada: cliente NOVO da régua não começa (o começado termina)
        if (envio.origem === 'regua' && Number(alvo.parte_atual ?? 0) === 0 && !reguaAbertaAgora(cx.cfg)) break;
        // v27: o comercial deste cliente ainda não começou (ex.: Eduardo só às 7h) — fica na fila
        if (envio.origem === 'regua' && Number(alvo.parte_atual ?? 0) === 0
          && agoraBRT().getUTCHours() < inicioDoComercial(cx.cfg, comDoAlvo(alvo))) continue;
        // intervalo anti-bloqueio POR NÚMERO (vale entre envios e entre rodadas)
        const pausa = (dMin + Math.random() * (dMax - dMin)) * 1000;
        const espera = Math.max(0, ultimoEnvio + pausa - Date.now());
        if (Date.now() - cx.inicio + espera > ORCAMENTO_MS) { parar = true; break; }
        if (espera > 0) await sleep(espera);
        if (!(await renovar())) { parar = true; break; }
        const res = await enviarAlvo(admin, canal, envio, alvo, cx, marcarEnvio);
        if (res === 'enviado') enviadasHoje += 1;
        if (res === 'enviado') r.enviadas += 1; else if (res === 'erro') r.falhas += 1; else if (res === 'pulado') r.puladas += 1;
        if (res === 'cortado') { parar = true; break; }
      }
      await fecharEnvio(admin, envio.id);
      if (parar) break;
    }
  } finally {
    await admin.from('wa_canais').update({ processando_ate: null }).eq('id', canal.id).eq('processando_ate', ate);
  }
  return r;
}

type ResAlvo = 'enviado' | 'erro' | 'pulado' | 'adiado' | 'cortado' | 'nada';
async function enviarAlvo(admin: Admin, canal: Canal, envio: Envio, alvo: Alvo, cx: CtxFila, marcarEnvio: () => Promise<void>): Promise<ResAlvo> {
  // claim atômico: só esta rodada envia este alvo
  const { data: claim } = await admin.from('wa_envio_alvos').update({ status: 'enviando', claim_em: new Date().toISOString() })
    .eq('id', alvo.id).eq('status', 'pendente').select('id');
  if (!claim?.length) return 'nada';
  /** devolve pra fila — mas se o envio foi CANCELADO no meio, fica cancelado */
  const devolver = async (patch: Record<string, unknown>) => {
    const { data: ev } = await admin.from('wa_envios').select('estado').eq('id', envio.id).maybeSingle();
    if (ev?.estado === 'cancelado') await admin.from('wa_envio_alvos').update({ status: 'cancelado', motivo: 'envio cancelado', claim_em: null }).eq('id', alvo.id).eq('status', 'enviando');
    else await admin.from('wa_envio_alvos').update({ status: 'pendente', claim_em: null, ...patch }).eq('id', alvo.id).eq('status', 'enviando');
  };
  const tel = digitos(alvo.telefone);
  let partesFeitas = Math.max(0, Number(alvo.parte_atual ?? 0));
  let legendaSaiu = false;   // parte de áudio com texto: o texto já saiu e o áudio não
  const urlCache = new Map<string, string>();
  const urlAssinada = async (path: string): Promise<string> => {
    const pronta = urlCache.get(path); if (pronta) return pronta;
    const { data: a } = await admin.storage.from('wa-midia').createSignedUrl(path, 3600);
    if (!a?.signedUrl) throw new Error('arquivo da mensagem indisponível no armazenamento');
    urlCache.set(path, a.signedUrl);
    return a.signedUrl;
  };
  try {
    if (!tel) throw new Error('telefone vazio');
    const ch = chaveTel(tel);
    if (ch && cx.optout.has(ch)) throw new Pular('pediu pra sair (SAIR)');
    // dados do cliente (variáveis) + régua: confere de novo NA HORA do envio
    let lead: { nome: string; valor: number | null; dia: number | null; comercial: string | null; situacao: string; telefone: string | null; cancelamento: string | null } | null = null;
    if (alvo.lead_id) {
      const { data: l, error: eL } = await admin.from('leads').select('nome, valor, dia, comercial, situacao, telefone, cancelamento').eq('id', alvo.lead_id).maybeSingle();
      if (eL) throw new Error(`não deu pra conferir o cadastro agora: ${eL.message}`);
      lead = l ?? null;
    }
    if (envio.origem === 'regua') {
      if (!alvo.lead_id || !lead) throw new Pular('cliente removido da Gestão');
      if (lead.cancelamento) {
        // solta a trava do passo no mês: se o cliente voltar pra Gestão no mesmo dia, a próxima geração refaz
        if (partesFeitas === 0 && alvo.regua_msg_id) await admin.from('wa_regua_disparos').delete().eq('envio_id', envio.id).eq('lead_id', alvo.lead_id).eq('regua_msg_id', alvo.regua_msg_id);
        throw new Pular('cliente nos Cancelados');
      }
      // v29: o comercial pausou a régua dele — não sai; solta a trava (se retomar hoje, a geração refaz)
      if (cx.cfg.pausados.has(normNome(lead.comercial))) {
        if (partesFeitas === 0 && alvo.regua_msg_id) await admin.from('wa_regua_disparos').delete().eq('envio_id', envio.id).eq('lead_id', alvo.lead_id).eq('regua_msg_id', alvo.regua_msg_id);
        throw new Pular(`régua de ${nomeBonito(lead.comercial)} pausada`);
      }
      if (alvo.comp) {
        if (lead.situacao !== 'cancelado') throw new Pular('cliente saiu da cobrança');
        const { data: pg, error: e1 } = await admin.from('pagamentos').select('status').eq('lead_id', alvo.lead_id).eq('comp', alvo.comp).in('status', ['pago', 'fora']).limit(1);
        if (e1) throw new Error(`não deu pra conferir o pagamento agora: ${e1.message}`);
        if (pg?.length) throw new Pular(pg[0].status === 'pago' ? 'pagou antes do envio' : 'marcado "fora da régua" na Gestão');
        const { data: en, error: e2 } = await admin.from('entradas').select('id').eq('lead_id', alvo.lead_id).eq('comp', alvo.comp).eq('estado', 'pendente').limit(1);
        if (e2) throw new Error(`não deu pra conferir o pagamento agora: ${e2.message}`);
        if (en?.length) throw new Pular('comprovante aguardando o financeiro');
      }
      // telefone ou comercial mudou na Gestão depois de entrar na fila: não manda pro número
      // velho/pelo número errado — solta a trava e a próxima geração (5 min) refaz certo
      const donoAtual = canal.dono_id ? cx.nomeDono.get(canal.dono_id) : null;
      // reserva e canal único têm a mesma semântica: o número não é "do comercial",
      // então trocar de comercial não invalida o envio (o {atendente} já saiu certo no alvo)
      const reservaCfg = cx.cfg.canal_reserva_id === canal.id || cx.cfg.canal_unico_id === canal.id;
      // no número reserva/único o número não muda, mas a MENSAGEM é a da régua do comercial (v18):
      // trocou o comercial depois de entrar na fila = refaz com a régua (e a assinatura) do novo
      const comercialNaFila = normNome(alvo.canal_nome);
      const mudou = partesFeitas > 0 ? null   // já saiu parte: termina pelo mesmo número
        : chaveTel(lead.telefone) !== ch ? 'telefone alterado na Gestão'
        : (!reservaCfg && donoAtual && normNome(donoAtual) !== normNome(lead.comercial)) ? 'cliente trocou de comercial'
        : (reservaCfg && comercialNaFila && comercialNaFila !== (normNome(lead.comercial) || normNome(canal.nome))) ? 'cliente trocou de comercial' : null;
      if (mudou) {
        if (alvo.regua_msg_id) await admin.from('wa_regua_disparos').delete().eq('envio_id', envio.id).eq('lead_id', alvo.lead_id).eq('regua_msg_id', alvo.regua_msg_id);
        throw new Pular(`${mudou} — refeito na próxima rodada`);
      }
      // v19: o comercial EXCLUIU este passo da régua dele depois que entrou na fila — não sai
      // (solta a trava: se ele "voltar a usar" no mesmo dia, a próxima geração refaz)
      if (partesFeitas === 0 && alvo.comp && alvo.regua_msg_id && normNome(lead.comercial)) {
        const { data: ex, error: eX } = await admin.from('wa_regua_comercial').select('id')
          .eq('passo_id', alvo.regua_msg_id).eq('comercial', normNome(lead.comercial)).eq('excluida', true).limit(1);
        if (eX && !/could not find the table|does not exist/i.test(eX.message)) throw new Error(`não deu pra conferir a régua do comercial agora: ${eX.message}`);
        if (ex?.length) {
          await admin.from('wa_regua_disparos').delete().eq('envio_id', envio.id).eq('lead_id', alvo.lead_id).eq('regua_msg_id', alvo.regua_msg_id);
          throw new Pular(`mensagem excluída da régua de ${nomeBonito(lead.comercial)}`);
        }
      }
    }
    const atendente = alvo.canal_nome && envio.origem === 'regua'
      ? alvo.canal_nome
      : nomeBonito((canal.dono_id && cx.nomeDono.get(canal.dono_id)) || canal.nome);
    const dados: DadosVars = {
      nome: lead?.nome || alvo.nome || '', valorParcela: lead?.valor != null ? Number(lead.valor) : null,
      atendente, venc: alvo.venc, dia: lead?.dia != null ? Number(lead.dia) : null, hoje: cx.hoje,
    };

    // mensagem completa ANTES do 1º disparo: variável faltando ou arquivo sumido = erro limpo
    type Pronta = { tipo: string; tx: string; path?: string; nome?: string; espera?: number };
    const variantes: string[] = [envio.modelo, ...(Array.isArray(envio.variantes) ? envio.variantes as string[] : [])].map((v) => String(v ?? '').trim()).filter(Boolean);
    const partesEnvio: Parte[] = partesEnviaveis(envio.blocos);
    let prontas: Pronta[];
    let legivel: string;
    if (partesEnvio.length) {
      prontas = partesEnvio.map((b) => ({ tipo: b.tipo, tx: String(b.corpo ?? '').trim() ? aplicarVars(String(b.corpo).trim(), dados) : '', path: b.path, nome: b.nome, espera: b.espera }));
      legivel = mensagemLegivel(partesEnvio, dados);
    } else {
      const base = variantes.length ? variantes[Math.floor(Math.random() * variantes.length)] : '';
      const tx = base ? aplicarVars(base, dados) : '';
      if (envio.midia_path) prontas = [{ tipo: envio.midia_tipo ?? 'documento', tx, path: envio.midia_path, nome: envio.midia_nome ?? 'arquivo' }];
      else { if (!tx) throw new Error('mensagem vazia'); prontas = [{ tipo: 'texto', tx }]; }
      legivel = mensagemLegivel(prontas.map((p) => ({ tipo: p.tipo, corpo: p.tx, nome: p.nome, path: p.path })), { ...dados });
    }
    for (const p of prontas) if (p.tipo !== 'texto') await urlAssinada(p.path!);

    // número REAL no WhatsApp (com/sem o 9) — número sem WhatsApp não recebe tentativa às cegas
    let jid: string | null;
    try { jid = await resolverNumero(canal.instancia, candidatosTel(tel)); }
    catch (e) { throw new Error(`não deu pra validar o número agora: ${msgDe(e)}`); }
    if (!jid) throw new Error('Este número não tem WhatsApp — confira DDD e o nono dígito na Gestão');

    // conversa ÚNICA do cliente neste número (a resposta dele cai aqui)
    const { data: conv, error: eConv } = await admin.from('wa_conversas')
      .upsert({ canal_id: canal.id, telefone: jid }, { onConflict: 'canal_id,chave', ignoreDuplicates: false }).select('id').single();
    if (eConv) console.error('conversa:', eConv.message);
    const convId: string | null = conv?.id ?? null;
    await admin.from('wa_envio_alvos').update({
      conversa_id: convId, canal_id: canal.id, canal_nome: atendente, canal_numero: canal.numero, mensagem: legivel,
    }).eq('id', alvo.id);

    const registrar = async (tipo: string, conteudo: string | null, midiaPath: string | null, waId: string | null) => {
      if (!convId) return;
      const linha = {
        conversa_id: convId, canal_id: canal.id, direcao: 'saida', tipo, conteudo, midia_path: midiaPath, wa_id: waId,
        status: 'enviada', autor_id: envio.criado_por, alvo_id: alvo.id, envio_id: envio.id,
      };
      const { error: eIns } = await admin.from('wa_mensagens').insert(linha);
      // o webhook pode ter gravado a mesma mensagem antes (mesmo wa_id): só liga ao alvo
      if (eIns && waId && /duplicate|unique|23505/i.test(eIns.message)) {
        await admin.from('wa_mensagens').update({ alvo_id: alvo.id, envio_id: envio.id }).eq('canal_id', canal.id).eq('wa_id', waId);
      } else if (eIns) console.error('registro da mensagem:', eIns.message);
    };
    /** um disparo: se estourar tempo/cair no MEIO, pode ter saído — não repete sozinho */
    const disparar = async <T>(f: () => Promise<T>): Promise<T> => {
      try { return await f(); }
      catch (e) {
        const m = msgDe(e);
        // sem resposta, ou 5xx/408: o WhatsApp pode ter entregue mesmo assim — não repete sozinho
        if (/timed? ?out|timeout|aborted|abort|socket|connection (closed|reset)|econnreset|fetch failed|HTTP (5\d\d|408)|Evolution HTTP 5/i.test(m)) throw new TalvezSaiu(m);
        throw e;   // 4xx (validação, número): não saiu
      }
    };

    const inicioSeq = Math.min(prontas.length, partesFeitas);
    for (let i = inicioSeq; i < prontas.length; i++) {
      // orçamento DENTRO da sequência: devolve pra fila e retoma da parte seguinte
      const p = prontas[i];
      const esperaParte = i > 0 ? Math.max(0, Math.min(60, Number(p.espera ?? 3))) * 1000 : 0;
      if (i > inicioSeq && Date.now() - cx.inicio + esperaParte > ORCAMENTO_MS) { await devolver({}); return 'cortado'; }
      if (esperaParte) await sleep(esperaParte);
      if (envio.presenca !== false) {
        const pres = 1500 + Math.floor(Math.random() * 2000);
        await sendPresence(canal.instancia, jid, p.tipo === 'audio' ? 'recording' : 'composing', pres).catch(() => null);
        await sleep(pres);
      }
      if (p.tipo === 'texto') {
        const rr = await disparar(() => sendText(canal.instancia, jid!, p.tx));
        await registrar('texto', p.tx, null, rr.id);
      } else if (p.tipo === 'audio') {
        const u = await urlAssinada(p.path!);
        if (p.tx) { const rt = await disparar(() => sendText(canal.instancia, jid!, p.tx)); await registrar('texto', p.tx, null, rt.id); legendaSaiu = true; await marcarEnvio(); }
        const ra = await disparar(() => sendWhatsAppAudio(canal.instancia, jid!, u));
        legendaSaiu = false;
        await registrar('audio', p.nome ?? null, p.path ?? null, ra.id);
      } else {
        const u = await urlAssinada(p.path!);
        const mt = p.tipo === 'imagem' ? 'image' as const : p.tipo === 'video' ? 'video' as const : 'document' as const;
        const rm = await disparar(() => sendMedia(canal.instancia, jid!, mt, mimeDoNome(p.nome ?? ''), u, p.nome ?? 'arquivo', p.tx || undefined));
        await registrar(p.tipo, p.tx || p.nome || null, p.path ?? null, rm.id);
      }
      await marcarEnvio();
      partesFeitas = i + 1;
      await admin.from('wa_envio_alvos').update({ parte_atual: i + 1 }).eq('id', alvo.id);
    }
    await admin.from('wa_envio_alvos').update({ status: 'enviado', enviado_em: new Date().toISOString(), erro: null, tentar_apos: null, claim_em: null }).eq('id', alvo.id).eq('status', 'enviando');
    return 'enviado';
  } catch (e) {
    if (e instanceof Pular) {
      await admin.from('wa_envio_alvos').update({ status: 'pulado', motivo: e.message, claim_em: null }).eq('id', alvo.id).eq('status', 'enviando');
      return 'pulado';
    }
    const m = msgDe(e);
    const tent = Number(alvo.tentativas ?? 0) + 1;
    const antes = partesFeitas > 0 ? ` (as ${partesFeitas} parte(s) anteriores já saíram)` : '';
    if (e instanceof TalvezSaiu || legendaSaiu) {
      // pode ter chegado no celular do cliente: NÃO repete sozinho (evita mensagem duplicada)
      await marcarEnvio();
      await admin.from('wa_envio_alvos').update({ status: 'erro', tentativas: tent, claim_em: null,
        erro: legendaSaiu ? `o texto do áudio saiu mas o áudio não (${m.slice(0, 120)}) — confira na conversa antes de reenviar${antes}`
          : `sem confirmação do WhatsApp na parte ${partesFeitas + 1} (${m.slice(0, 120)}) — confira na conversa antes de reenviar${antes}` }).eq('id', alvo.id).eq('status', 'enviando');
      return 'erro';
    }
    if (erroPassageiro(m) && tent < 3) {
      // falha passageira ANTES do disparo (validação, leitura, Evolution fora): tenta de novo, retomando da parte certa
      await devolver({ tentativas: tent, tentar_apos: new Date(Date.now() + tent * 3 * 60_000).toISOString(), erro: `tentativa ${tent} falhou (${m.slice(0, 160)}) — tentando de novo` });
      return 'adiado';
    }
    await admin.from('wa_envio_alvos').update({ status: 'erro', erro: (partesFeitas > 0 ? `parou na parte ${partesFeitas + 1}: ${m}${antes}` : m).slice(0, 300), tentativas: tent, claim_em: null }).eq('id', alvo.id).eq('status', 'enviando');
    return 'erro';
  }
}

/* =====================================================================
   SAÚDE: confere a conexão de cada número a cada 5 minutos
   ===================================================================== */
async function conferirConexoes(admin: Admin) {
  const { canais } = await carregarCanais(admin);
  for (const c of canais) {
    if (String(c.instancia).startsWith('pendente')) continue;
    try {
      const st = await connectionState(c.instancia);
      const estado = st === 'open' ? 'conectado' : st === 'connecting' ? 'conectando' : 'desconectado';
      await admin.from('wa_canais').update({
        verificado_em: new Date().toISOString(),
        ...(estado !== c.estado ? { estado } : {}),
        ...(estado === 'desconectado' && c.estado === 'conectado' ? { ultimo_erro: 'caiu — reconecte pelo QR em Números' } : {}),
        ...(estado === 'conectado' && c.estado !== 'conectado' ? { ultimo_erro: null } : {}),
      }).eq('id', c.id);
    } catch (e) { console.error('conexão', c.nome, msgDe(e)); }
  }
}

/* =====================================================================
   HTTP
   ===================================================================== */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const motorSecret = Deno.env.get('MOTOR_SECRET') ?? '';
  try {
    const viaSecret = !!motorSecret && igual(req.headers.get('x-motor-secret') ?? '', motorSecret);
    let papel: string | null = null, nomeUsuario: string | null = null;
    if (!viaSecret) {
      const asUser = createClient(url, anon, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } }, auth: { persistSession: false } });
      const { data: u } = await asUser.auth.getUser();
      if (!u?.user?.id) return json({ error: 'não autenticado' }, 401);
      const { data: perfil } = await asUser.from('profiles').select('ativo, papel, nome').eq('id', u.user.id).maybeSingle();
      if (!perfil?.ativo) return json({ error: 'sem permissão' }, 403);
      papel = String(perfil.papel ?? ''); nomeUsuario = perfil.nome ?? null;
    }
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const admin = createClient(url, service, { auth: { persistSession: false } });
    const hoje = hojeBRT();

    // ---- PRÉVIA: quem recebe o quê em cada dia — NÃO envia nem trava nada ----
    if (body.acao === 'previa') {
      // a prévia traz nome/telefone/texto de clientes: só com usuário logado (nunca pelo segredo do cron)
      if (viaSecret || !papel) return json({ error: 'a prévia exige usuário logado' }, 403);
      const re = /^\d{4}-\d{2}-\d{2}$/;
      const de = re.test(String(body.de ?? '')) ? String(body.de) : hoje;
      const leadId = typeof body.lead_id === 'string' && body.lead_id ? body.lead_id : null;
      let ate = re.test(String(body.ate ?? '')) ? String(body.ate) : de;
      const maxDias = leadId ? 62 : 31;
      const datas: string[] = [];
      for (let d = de; d <= ate && datas.length < maxDias; d = somaDias(d, 1)) datas.push(d);
      ate = datas[datas.length - 1] ?? de;
      // comercial vê só os clientes dele
      const comercial = papel === 'comercial' ? (nomeUsuario ?? '—') : null;
      // a conta é SEMPRE com a população inteira (igual à geração: telefone repetido, teto…);
      // o filtro do comercial / do cliente vem DEPOIS
      const ctx = await carregarContexto(admin, { compAtual: compDe(hoje) });
      const comTexto = !!leadId || datas.length <= 3;
      const itens = (await avaliar(admin, ctx, datas, hoje, comTexto))
        .filter((a) => (!leadId || a.lead.id === leadId) && (!comercial || normNome(a.lead.comercial) === normNome(comercial)));
      if (comercial) ctx.leads = ctx.leads.filter((l) => normNome(l.comercial) === normNome(comercial));
      // cobertura: quantos clientes em cobrança cada número alcança
      const porCom = new Map<string, { bruto: string | null; comercial: string; clientes: number; com_telefone: number }>();
      for (const l of ctx.leads) {
        const k = normNome(l.comercial) || '—';
        const x = porCom.get(k) ?? { bruto: l.comercial, comercial: nomeBonito(l.comercial) || 'Sem comercial', clientes: 0, com_telefone: 0 };
        x.clientes += 1; if (chaveTel(l.telefone)) x.com_telefone += 1;
        porCom.set(k, x);
      }
      const cobertura = [...porCom.values()].map(({ bruto, ...x }) => {
        const c = canalDoCliente(ctx, bruto);
        return { ...x, numero: c.canal ? { id: c.canal.id, nome: nomeBonito(c.canal.nome), numero: c.canal.numero, conectado: conectado(c.canal), reserva: c.reserva } : null, motivo: c.motivo };
      }).sort((a, b) => b.clientes - a.clientes);
      return json({
        ok: true, hoje, de, ate, config: ctx.cfg,
        itens: itens.map((a) => ({
          data: a.data, lead_id: a.lead.id, nome: a.lead.nome, comercial: nomeBonito(a.lead.comercial), telefone: a.lead.telefone, dia: a.lead.dia,
          passo_id: a.msg.id, passo_nome: rotuloPasso(a.msg),
          quando: a.msg.quando, alvo: a.msg.alvo, comp: a.comp, venc: a.venc,
          status: a.status, motivo: a.motivo, envio_id: a.envio_id ?? null, falta: a.falta ?? null, texto: a.texto ?? null,
          substitui: a.substitui ? (ctx.msgs.find((m) => m.id === a.substitui)?.nome ?? null) : null,
          versao: a.msg.alvo !== 'padrao' ? a.msg.alvo : a.msg.versao ? 'propria' : 'padrao',
          numero: a.canal ? { id: a.canal.id, nome: a.atendente, numero: a.canal.numero, reserva: a.reserva } : null,
        })),
        cobertura,
      });
    }

    if (!evolutionConfigured()) return json({ ok: false, erro: 'Evolution não configurada' });

    // ---- RODADA (cron a cada minuto ou "Processar fila agora") ----
    const inicio = Date.now();
    const rodada = { inicio: new Date().toISOString(), fonte: viaSecret ? 'cron' : 'manual', regua: null as Resumo | null, enviadas: 0, falhas: 0, puladas: 0, erro: null as string | null };
    const minuto = agoraBRT().getUTCMinutes();
    try {
      if (minuto % 5 === 0 || !viaSecret) await conferirConexoes(admin).catch((e) => console.error('conexões', msgDe(e)));
      await expirar(admin, hoje);
      // a régua monta a fila a cada 5 minutos (ou na hora, se alguém apertar "Processar");
      // erro na geração fica registrado mas NÃO impede a fila de andar
      if (minuto % 5 === 0 || !viaSecret) {
        try { rodada.regua = await gerarRegua(admin, hoje); }
        catch (e) { rodada.erro = `geração da régua: ${msgDe(e)}`.slice(0, 500); console.error(rodada.erro); }
      }
      const cfg = await carregarCfg(admin);
      const f = await processarFila(admin, cfg, inicio, hoje);
      rodada.enviadas = f.enviadas; rodada.falhas = f.falhas; rodada.puladas = f.puladas;
    } catch (e) {
      rodada.erro = msgDe(e).slice(0, 500);
      console.error('rodada:', rodada.erro);
    }
    const r = rodada.regua;
    // batimento: a tela sabe que o motor está vivo (e se a última rodada falhou)
    await admin.from('wa_motor_status').update({ ultima_rodada: new Date().toISOString(), ultima_ok: !rodada.erro, ultimo_erro: rodada.erro }).eq('id', 1).then(() => null, () => null);
    const algo = (r && (r.gerados || Object.keys(r.pulados).length || Object.keys(r.aguardando).length)) || rodada.enviadas || rodada.falhas || rodada.puladas || rodada.erro;
    if (algo) {
      await admin.from('wa_motor_rodadas').insert({ ...rodada, fim: new Date().toISOString() }).then(() => null, () => null);
    }
    if (minuto === 0 && agoraBRT().getUTCHours() === 3) {
      await admin.from('wa_motor_rodadas').delete().lt('inicio', new Date(Date.now() - 30 * 86_400_000).toISOString()).then(() => null, () => null);
    }
    return json({ ok: !rodada.erro, enviadas: rodada.enviadas, falhas: rodada.falhas, puladas: rodada.puladas, regua: rodada.regua, erro: rodada.erro });
  } catch (e) {
    console.error('motor:', msgDe(e));
    return json({ error: msgDe(e) }, 500);
  }
});
