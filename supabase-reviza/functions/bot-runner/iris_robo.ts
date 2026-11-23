// REVIZA (23/11): cópia da função do Atenvo que está no ar, adaptada ao Reviza por
// ~/reviza-sist/porte-atendimento/porta-funcoes.py — conexões "revizaatd_", tabela atd_integracoes, pasta atd-midia.
// iris_robo.ts — a IRIS RETOMA quem PARA NO MEIO DO ROBÔ (dono 31/10: D02 + D09 + D11). Regra pura + IO, testado
// em tests/iris_robo_test.ts e tests/runner_iris_test.ts (deno test). Quem chama é o bot-runner (index.ts): a
// varredura e a retomada por conversa.
//
// D02 (literal): "depois do robô, mas se o cliente não responde o robô ou para em algum ponto, a Iris manda áudio
// tentando dar continuidade". D09: retomada = até 2 áudios por etapa, dentro do teto de toques automáticos,
// seg–sex no horário comercial da Iris. D11: 9h–18h, segunda a sexta, sem feriado.
//
// COMO FUNCIONA (Modo 1: a Iris depois do robô — o trilho do robô não muda):
//  1. o cron chama o bot-runner com { iris_varredura: true } (irisVarredura): acha quem está parado num passo do
//     robô que tem áudio da Iris (IRIS_PASSOS_ROBO), nos números com a Iris ligada, e chama o PRÓPRIO runner por
//     conversa com { iris_retomada: true } — que passa pelas mesmas guardas de uma mensagem do cliente (sessão de
//     IA, pausa, lock, humano, bot_pode_atuar, freio do número) antes de chegar aqui;
//  2. tratarIrisRetomadaRobo decide (decidirRetomadaRobo + iris_ativa_para + iris_pode_tocar + o texto) e manda UM
//     áudio fixo (iris_textos), como nota de voz, e registra o toque (iris_registrar_evento);
//  3. a resposta do cliente cai no robô como qualquer mensagem: o passo é o mesmo, então o robô continua de onde
//     parou e, no fecho, entrega para a IA como hoje. O áudio não mexe no estado do trilho.
//
// QUANDO: RETOMADA_ROBO_MIN_PADRAO (30 min) depois da última fala do robô sem resposta — iris_config.robo_retomada_min
// troca (de 2 a 1440; no teste do dono dá para usar 2) — e só dentro do horário da Iris; parada fora dele sai no
// próximo horário (a varredura só age dentro dele). Parada com mais de 4 dias (RETOMADA_ROBO_IDADE_MAX_MS) fica.
//
// QUEM NUNCA RECEBE: Iris desligada no número; "só teste" com o telefone fora de numeros_teste (a trava local vale
// JUNTO com a iris_ativa_para); o mesmo texto já foi para esta conversa (o mesmo áudio nunca vai duas vezes ao
// mesmo cliente, especificação 1.5 e 7.1) ou já houve tentativa (marca iris_robo); a última fala já foi da Iris
// (nunca 2 áudios seguidos sem resposta); o cliente escreveu depois da última fala do robô; a pergunta do passo não
// chegou (envio_pendente); iris_pode_tocar nega (2 por etapa, teto de 1 toque por dia e 3 por semana, opt-out,
// irritação, não elegível, fechado, humano atendendo; e, como áudio, outro áudio da Iris sem resposta no meio); texto
// sem áudio; rascunho (aprovado=false) fora do número de teste.
//
// FICA DE FORA DE PROPÓSITO (entra com 1 linha em IRIS_PASSOS_ROBO quando o dono decidir):
//  * abertura sem resposta (aguardando_sim_nao): a especificação (5.4) tira "quem só mandou a mensagem do anúncio e
//    nunca respondeu", e nenhum texto T01–T65 serve ali (o T60 fala "no meio da sua análise");
//  * pergunta do benefício (aguardando_beneficio): o robô fecha sozinho em 10 min (bot_beneficio_timeout) e a etapa
//    passa a ser da IA — a retomada dali é da IA (R1, qualificacao_inss);
//  * recusado: o NÃO da abertura é do robô (5.5: "segue como hoje"); fim / sem_beneficio: quem fala é IA/atendente.
import { chaveTel } from './fluxo_botoes.ts';
import { lerPendente } from './envio_pendente.ts';
import { adotarEco, ehEnvioIncerto, juntarIncertos, lerIncertos, type EnvioIncerto } from './envio_incerto.ts';

/** Passo do robô → o áudio da Iris (iris_textos) e a etapa com que o toque é contado (iris_pode_tocar). O T60 é o
 *  "R1, perguntas da análise" da especificação (5.4) — o pedido do nome e do CPF do robô são a análise começando.
 *  Os dois passos usam o MESMO áudio: ele vai no máximo uma vez por conversa. */
export const IRIS_PASSOS_ROBO: Readonly<Record<string, { textoId: string; etapa: string }>> = Object.freeze({
  aguardando_nome: { textoId: 'T60', etapa: 'robo_aguardando_nome' },
  aguardando_cpf: { textoId: 'T60', etapa: 'robo_aguardando_cpf' },
});

export const RETOMADA_ROBO_MIN_PADRAO = 30;
export const RETOMADA_ROBO_MIN_MINIMO = 2;
export const RETOMADA_ROBO_MIN_MAXIMO = 24 * 60;
/** Parada mais velha que isso não recebe áudio (cobre sexta à tarde → terça de manhã com feriado na segunda). */
export const RETOMADA_ROBO_IDADE_MAX_MS = 96 * 60 * 60_000;
/** Horário da Iris (D11): seg–sex, [9h, 18h), America/Sao_Paulo, sem feriado (dash_v5s_feriados). */
export const HORARIO_IRIS = Object.freeze({ inicioMin: 9 * 60, fimMin: 18 * 60 });
/** Bucket do áudio da Iris (iris_textos.audio_path) e onde fica a cópia que o inbox consegue tocar. */
export const BUCKET_AUDIO = 'script-midia';
/** Áudio fixo da Iris: até 20 s em OGG/Opus 32 kbps dá ~80 KB; acima disto é arquivo errado. */
export const AUDIO_MAX_BYTES = 1_000_000;
/** Varredura: quantas conversas por rodada e quanto tempo no máximo (cada áudio pode levar até 45 s + o eco). */
export const VARREDURA_LIMITE_PADRAO = 5;
export const VARREDURA_LIMITE_MAXIMO = 10;
export const VARREDURA_ORCAMENTO_MS = 100_000;
/** Motivos do bot_pode_atuar que não passam sozinhos: a varredura marca a conversa e para de olhar (senão ela
 *  voltaria a cada rodada e tomaria a vez das outras). Canal fora do ar, master desligado etc. passam: não marcam. */
export const INELEGIVEL_DEFINITIVO: ReadonlySet<string> = new Set([
  'oportunidade_avancada', 'conversa_arquivada', 'conversa_em_andamento', 'fora_area_rs', 'sem_destino_envio',
  'atendente_ja_respondeu', 'ja_tem_atendente', 'ja_tem_responsavel', 'conversa_antiga',
]);

export function passoComRetomadaIris(passo: unknown): boolean {
  return typeof passo === 'string' && Object.prototype.hasOwnProperty.call(IRIS_PASSOS_ROBO, passo);
}

// ---------------------------------------------------------------------------------------------------------------
// interruptor do número (bot_canal_config.iris_config)

export interface IrisConfig { ativo: boolean; somente_teste: boolean; robo_retomada_min: number }

/** Lê iris_config com defesa. Só o booleano JSON true liga (a string "true" não — mesma régua do perguntar_beneficio
 *  e do nudges_ativos); "só teste" só sai com o booleano false (ausente = só teste). */
export function lerIrisConfig(v: unknown): IrisConfig {
  const o = (v && typeof v === 'object' && !Array.isArray(v)) ? v as Record<string, unknown> : {};
  const min = typeof o.robo_retomada_min === 'number' ? o.robo_retomada_min : Number.NaN;
  return {
    ativo: o.ativo === true,
    somente_teste: o.somente_teste !== false,
    robo_retomada_min: Number.isFinite(min) && min > 0
      ? Math.min(Math.max(Math.round(min), RETOMADA_ROBO_MIN_MINIMO), RETOMADA_ROBO_MIN_MAXIMO)
      : RETOMADA_ROBO_MIN_PADRAO,
  };
}

/** O telefone está na lista de teste do número? Chave canônica DDD + 8 (cobre país e 9º dígito). */
export function ehNumeroDeTeste(telefone: string | null | undefined, lista: unknown): boolean {
  if (!telefone || !Array.isArray(lista)) return false;
  const k = chaveTel(telefone);
  return k.length >= 10 && lista.some((n) => typeof n === 'string' && chaveTel(n) === k);
}

// ---------------------------------------------------------------------------------------------------------------
// relógio da Iris

const FMT_SP = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

/** Dia (AAAA-MM-DD), dia da semana ISO (1 = segunda … 7 = domingo) e minutos do dia, no fuso de São Paulo. */
export function partesSP(d: Date): { dia: string; isodow: number; minutos: number } {
  const p: Record<string, string> = {};
  for (const x of FMT_SP.formatToParts(d)) p[x.type] = x.value;
  const dia = `${p.year}-${p.month}-${p.day}`;
  const dow = new Date(`${dia}T12:00:00Z`).getUTCDay();
  return { dia, isodow: dow === 0 ? 7 : dow, minutos: (Number(p.hour) % 24) * 60 + Number(p.minute) };
}

export function dentroDoHorarioIris(d: Date, feriados: ReadonlySet<string>): boolean {
  const { dia, isodow, minutos } = partesSP(d);
  return isodow <= 5 && !feriados.has(dia) && minutos >= HORARIO_IRIS.inicioMin && minutos < HORARIO_IRIS.fimMin;
}

/** Resposta da RPC dash_v5s_feriados() (date[]) → conjunto 'AAAA-MM-DD'. Formato inesperado = null (quem chama
 *  não age: sem a lista não dá para garantir "sem feriado"). */
export function lerFeriados(v: unknown): Set<string> | null {
  if (!Array.isArray(v)) return null;
  const s = new Set<string>();
  for (const x of v) if (typeof x === 'string' && /^\d{4}-\d{2}-\d{2}/.test(x)) s.add(x.slice(0, 10));
  return s;
}

// ---------------------------------------------------------------------------------------------------------------
// a decisão (pura)

export interface EntradaRetomadaRobo {
  passo: unknown;                       // dados_qualificacao.passo_<prefixo>
  pendente: unknown;                    // dados_qualificacao.envio_pendente_<prefixo>
  tentativas: unknown;                  // dados_qualificacao.iris_robo (marca da tentativa, por texto)
  ultimaSaida: { em: string; doRobo: boolean; daIris: boolean } | null;  // a última fala para o cliente
  ultimaEntradaEm: string | null;       // a última mensagem do cliente
  agora: Date;
  feriados: ReadonlySet<string>;
  minutos: number;                      // espera configurada (lerIrisConfig)
  textosJaEnviados: ReadonlySet<string>; // iris_eventos.texto_id desta conversa
}

export type DecisaoRetomadaRobo =
  | { acao: 'enviar'; textoId: string; etapa: string; paradoMs: number }
  /** definitivo = a situação não melhora sozinha: quem chama marca a conversa e a varredura para de olhar */
  | { acao: 'nada'; motivo: string; definitivo: boolean };

export function decidirRetomadaRobo(e: EntradaRetomadaRobo): DecisaoRetomadaRobo {
  const nada = (motivo: string, definitivo = false): DecisaoRetomadaRobo => ({ acao: 'nada', motivo, definitivo });
  if (!passoComRetomadaIris(e.passo)) return nada('fora_do_passo');
  const alvo = IRIS_PASSOS_ROBO[e.passo as string];
  const tent = (e.tentativas && typeof e.tentativas === 'object') ? e.tentativas as Record<string, unknown> : {};
  if (tent[alvo.textoId] != null) return nada('ja_tentou');
  if (e.textosJaEnviados.has(alvo.textoId)) return nada('texto_ja_enviado');
  // a pergunta deste passo não chegou ao cliente: "me responde a pergunta aqui em cima" seria sobre o nada
  const pend = lerPendente(e.pendente);
  if (pend && pend.passo === e.passo) return nada('pergunta_nao_chegou');
  if (!e.ultimaSaida) return nada('sem_fala_do_robo', true);
  if (!e.ultimaSaida.doRobo) return nada('ultima_fala_nao_e_do_robo', true);
  if (e.ultimaSaida.daIris) return nada('iris_ja_falou');
  const saidaMs = Date.parse(e.ultimaSaida.em);
  if (!Number.isFinite(saidaMs)) return nada('sem_fala_do_robo', true);
  const entradaMs = e.ultimaEntradaEm ? Date.parse(e.ultimaEntradaEm) : Number.NaN;
  // o cliente falou depois da última pergunta e o robô não andou (mensagem perdida/não processada): não é parada
  if (Number.isFinite(entradaMs) && entradaMs > saidaMs) return nada('cliente_escreveu_depois', true);
  if (!dentroDoHorarioIris(e.agora, e.feriados)) return nada('fora_do_horario_iris');
  const parado = e.agora.getTime() - saidaMs;
  if (parado < e.minutos * 60_000) return nada('cedo');
  if (parado > RETOMADA_ROBO_IDADE_MAX_MS) return nada('parada_antiga');
  return { acao: 'enviar', textoId: alvo.textoId, etapa: alvo.etapa, paradoMs: parado };
}

/** O áudio é OGG de verdade? (lição de 28/09: "entregue" não é "tocável" — o .m4a chegou e não tocou) */
export function ehOgg(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53;   // "OggS"
}

export function paraBase64(bytes: Uint8Array): string {
  let bin = ''; const bloco = 0x8000;
  for (let i = 0; i < bytes.length; i += bloco) bin += String.fromCharCode(...bytes.subarray(i, i + bloco));
  return btoa(bin);
}

// ---------------------------------------------------------------------------------------------------------------
// IO (o cliente do Supabase e o envio entram por parâmetro: os testes passam falsos)

// deno-lint-ignore no-explicit-any
type Admin = any;
type LogRunner = (outcome: string, motivo?: string | null, extra?: Record<string, unknown>) => Promise<void>;

export interface CtxRetomadaRobo {
  admin: Admin;
  conversaId: string;
  conv: { id: string; organizacao_id: string; contato_id: string; canal_id: string };
  canal: { transporte?: string | null; instancia_externa?: string | null; cloud_phone_number_id?: string | null } | null;
  estado: { dados_qualificacao?: unknown };
  perfil: { prefixo: string; fluxoMeta: string };
  dryRun: boolean;
  /** envio da nota de voz (index.ts: enviadorDe(canal).sendWhatsAppAudio) */
  enviarAudio: (destino: string, base64: string) => Promise<{ key?: { id?: string } }>;
  logRunner: LogRunner;
  agora?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  /** quanto esperar o eco depois de um TIMEOUT (envio_incerto.ts) */
  esperaEcoMs?: number;
}

export async function lerDestino(admin: Admin, contatoId: string): Promise<string | null> {
  try {
    const { data } = await admin.from('contato_identidades').select('valor_normalizado')
      .eq('contato_id', contatoId).eq('tipo', 'whatsapp').not('valor_normalizado', 'is', null)
      .order('principal', { ascending: false }).limit(1).maybeSingle();
    return (data?.valor_normalizado as string | undefined) ?? null;
  } catch { return null; }
}

export async function lerFeriadosDoBanco(admin: Admin): Promise<Set<string> | null> {
  try {
    const { data, error } = await admin.rpc('dash_v5s_feriados');
    return error ? null : lerFeriados(data);
  } catch { return null; }
}

/** iris_limpo_em(p_contato) — contrato da frente TESTE (/clean do número de teste): o instante da última limpeza do
 *  contato, em ms. Sem a função, sem permissão, sem limpeza ou erro → null (segue como hoje). */
export async function lerLimpoEm(admin: Admin, contatoId: string): Promise<number | null> {
  try {
    const { data, error } = await admin.rpc('iris_limpo_em', { p_contato: contatoId });
    if (error || data == null) return null;
    const t = Date.parse(String(data));
    return Number.isFinite(t) ? t : null;
  } catch { return null; }
}
/** O registro é de DEPOIS da limpeza? Sem limpeza → sim. Sem data no registro → sim (na dúvida conta: nunca reenvia). */
export function depoisDaLimpeza(criadoEm: string | null | undefined, limpoMs: number | null): boolean {
  if (limpoMs == null) return true;
  const t = Date.parse(String(criadoEm ?? ''));
  return !Number.isFinite(t) || t > limpoMs;
}

/** Marca a tentativa em dados_qualificacao.iris_robo (por texto). É o que impede um segundo áudio se algo cair no
 *  meio (o envio saiu e o registro não). bot_avancar_etapa faz merge raso: a chave vai inteira, com o que já havia. */
async function marcarTentativa(
  admin: Admin, conversaId: string, dq: Record<string, unknown>, textoId: string,
  marca: Record<string, unknown>, extra: Record<string, unknown> = {},
): Promise<void> {
  const atual = (dq.iris_robo && typeof dq.iris_robo === 'object' && !Array.isArray(dq.iris_robo)) ? dq.iris_robo as Record<string, unknown> : {};
  const prox = { ...atual, [textoId]: marca };
  dq.iris_robo = prox;
  try {
    await admin.rpc('bot_avancar_etapa', { p_conversa: conversaId, p_etapa: null, p_dados: { iris_robo: prox, ...extra } });
  } catch { /* best-effort: o iris_eventos também segura */ }
}

/** Cópia do áudio na pasta da organização, para a bolha do inbox tocar (a regra do bucket script-midia exige o id
 *  da organização na 1ª pasta). INTEGRAÇÃO 31/10: os 22 áudios sobem já em '<org>/iris/<id>-<hash>.ogg' (o
 *  iris_textos.audio_path guarda a chave inteira) — aí nada é copiado; a cópia só existe para um audio_path antigo
 *  'iris/<id>-<hash>.ogg'. Falhou = a mensagem vai sem anexo tocável, o envio ao cliente não depende disto. */
export async function copiaParaInbox(admin: Admin, org: string, audioPath: string, bytes: Uint8Array): Promise<string | null> {
  if (audioPath.startsWith(`${org}/`)) return audioPath;
  const nome = (audioPath.split('/').pop() || 'audio.ogg').replace(/[^\w.-]/g, '');
  const caminho = `${org}/wa-midia/iris-${nome}`;
  try {
    const { error } = await admin.storage.from(BUCKET_AUDIO).upload(caminho, bytes, { contentType: 'audio/ogg', upsert: true });
    return error ? null : caminho;
  } catch { return null; }
}

/** Grava a nota de voz enviada. Se o eco do webhook chegou ANTES (mesmo id_externo, gravado como 'telefone'), a
 *  linha dele vira a do robô. */
export async function gravarMensagem(
  admin: Admin, conv: CtxRetomadaRobo['conv'], idExterno: string, meta: Record<string, unknown>,
): Promise<string | null> {
  try {
    const { data, error } = await admin.from('mensagens').insert({
      organizacao_id: conv.organizacao_id, conversa_id: conv.id, direcao: 'saida', tipo: 'audio', conteudo: null,
      autor_id: null, origem: 'bot', status: 'enviada', id_externo: idExterno, metadados: meta,
    }).select('id').maybeSingle();
    if (!error) return (data?.id as string | undefined) ?? null;
    if (String(error.code ?? '') !== '23505') return null;
    const { data: up } = await admin.from('mensagens').update({ origem: 'bot', status: 'enviada', metadados: meta })
      .eq('id_externo', idExterno).eq('conversa_id', conv.id).is('autor_id', null).select('id').maybeSingle();
    return (up?.id as string | undefined) ?? null;
  } catch { return null; }
}

/** RETOMADA de UMA conversa parada no robô. Chamada pelo index.ts depois de todas as guardas do runner (sessão de
 *  IA, pausa, lock, humano, bot_pode_atuar, freio). Nunca lança: erro de leitura = não manda (falha para o lado
 *  seguro). Devolve o corpo da resposta do runner. */
export async function tratarIrisRetomadaRobo(c: CtxRetomadaRobo): Promise<Record<string, unknown>> {
  const { admin, conversaId, conv, perfil, dryRun } = c;
  const relogio = () => (c.agora ? c.agora() : new Date());
  const agora = relogio();
  const dq = (c.estado.dados_qualificacao && typeof c.estado.dados_qualificacao === 'object'
    ? c.estado.dados_qualificacao : {}) as Record<string, unknown>;
  const passo = dq[`passo_${perfil.prefixo}`] as string | undefined;
  const fim = async (resultado: string, extra: Record<string, unknown> = {}) => {
    await c.logRunner('iris_retomada', resultado, { dry_run: dryRun, passo: passo ?? null, ...extra });
    return { ok: true, iris: 'retomada_robo', resultado, dry_run: dryRun, passo: passo ?? null, conversa_id: conversaId, ...extra };
  };
  try {
    if (!passoComRetomadaIris(passo)) return await fim('nada', { motivo: 'fora_do_passo' });

    // 1) interruptor do número: a trava local (iris_config) vale JUNTO com a iris_ativa_para
    const { data: cfgRow, error: eCfg } = await admin.from('bot_canal_config')
      .select('iris_config, numeros_teste').eq('canal_id', conv.canal_id).maybeSingle();
    if (eCfg) return await fim('nada', { motivo: 'iris_config_indisponivel' });
    const cfg = lerIrisConfig(cfgRow?.iris_config);
    if (!cfg.ativo) return await fim('nada', { motivo: 'iris_desligada' });
    const destino = await lerDestino(admin, conv.contato_id);
    if (!destino) return await fim('nada', { motivo: 'sem_destino' });
    const ehTeste = ehNumeroDeTeste(destino, cfgRow?.numeros_teste);
    if (cfg.somente_teste && !ehTeste) return await fim('nada', { motivo: 'iris_so_teste' });
    const { data: ativa, error: eAtiva } = await admin.rpc('iris_ativa_para', { p_canal: conv.canal_id, p_telefone: destino });
    if (eAtiva || ativa !== true) return await fim('nada', { motivo: eAtiva ? 'iris_ativa_para_indisponivel' : 'iris_inativa_para_numero' });

    // 2) o relógio e a conversa
    const feriados = await lerFeriadosDoBanco(admin);
    if (!feriados) return await fim('nada', { motivo: 'feriados_indisponiveis' });
    const { data: saidas, error: eS } = await admin.from('mensagens')
      .select('id, origem, autor_id, tipo, criado_em, metadados').eq('conversa_id', conversaId).eq('direcao', 'saida')
      .order('criado_em', { ascending: false }).limit(10);
    const { data: entradas, error: eE } = await admin.from('mensagens')
      .select('id, criado_em').eq('conversa_id', conversaId).eq('direcao', 'entrada')
      .order('criado_em', { ascending: false }).limit(1);
    if (eS || eE) return await fim('nada', { motivo: 'mensagens_indisponiveis' });
    // nota interna/sistema não chega ao cliente: a "última fala" é a última que ele viu
    const ult = ((saidas ?? []) as Array<Record<string, unknown>>).find((m) => !['sistema', 'nota_interna'].includes(String(m.tipo ?? '')));
    const metaUlt = (ult?.metadados && typeof ult.metadados === 'object' ? ult.metadados : {}) as Record<string, unknown>;
    // 01/11 — contrato do /clean (frente TESTE): o que a Iris mandou ANTES da última limpeza do contato
    // (iris_limpo_em) não conta como "já enviado". Tolerante: sem a função ou com erro, tudo conta (como hoje).
    const limpo = await lerLimpoEm(admin, conv.contato_id);
    const { data: evs, error: eEv } = await admin.from('iris_eventos').select(limpo == null ? 'texto_id' : 'texto_id, criado_em').eq('conversa_id', conversaId);
    if (eEv) return await fim('nada', { motivo: 'iris_eventos_indisponivel' });
    const enviados = new Set(((evs ?? []) as Array<{ texto_id?: string | null; criado_em?: string | null }>)
      .filter((x) => depoisDaLimpeza(x.criado_em, limpo))
      .map((x) => x.texto_id).filter((x): x is string => !!x));

    const d = decidirRetomadaRobo({
      passo, pendente: dq[`envio_pendente_${perfil.prefixo}`], tentativas: dq.iris_robo,
      ultimaSaida: ult ? { em: String(ult.criado_em ?? ''), doRobo: ult.origem === 'bot' && ult.autor_id == null, daIris: metaUlt.iris != null } : null,
      ultimaEntradaEm: ((entradas ?? [])[0]?.criado_em as string | undefined) ?? null,
      agora, feriados, minutos: cfg.robo_retomada_min, textosJaEnviados: enviados,
    });
    if (d.acao === 'nada') {
      // situação que não melhora sozinha: marca, e a varredura para de olhar esta conversa
      if (d.definitivo && !dryRun) {
        const alvo = IRIS_PASSOS_ROBO[passo as string];
        await marcarTentativa(admin, conversaId, dq, alvo.textoId, { passo, etapa: alvo.etapa, em: agora.toISOString(), resultado: `pulou:${d.motivo}` });
      }
      return await fim('nada', { motivo: d.motivo });
    }

    // 3) as regras da Iris no banco: 2 por etapa, teto de toques, opt-out, irritação, NE, fechado — e, por ser áudio,
    //    nunca 2 áudios da Iris seguidos sem o cliente responder
    for (const tipo of ['retomada', 'audio']) {
      const { data: pode, error: ePode } = await admin.rpc('iris_pode_tocar', { p_conversa: conversaId, p_etapa: d.etapa, p_tipo: tipo });
      if (ePode || pode !== true) {
        return await fim('nada', { motivo: ePode ? 'iris_pode_tocar_indisponivel' : tipo === 'audio' ? 'iris_audio_seguido' : 'iris_nao_pode_tocar', etapa: d.etapa });
      }
    }

    // 4) o texto: áudio pronto; rascunho só no número de teste
    const { data: tx, error: eTx } = await admin.from('iris_textos')
      .select('id, texto, tipo, selo, aprovado, audio_path, duracao_s').eq('id', d.textoId).maybeSingle();
    if (eTx) return await fim('nada', { motivo: 'iris_textos_indisponivel', texto_id: d.textoId });
    if (!tx) return await fim('nada', { motivo: 'texto_ausente', texto_id: d.textoId });
    if (tx.tipo !== 'audio' || !tx.audio_path) return await fim('nada', { motivo: 'texto_sem_audio', texto_id: d.textoId });
    if (tx.aprovado !== true && !ehTeste) return await fim('nada', { motivo: 'rascunho_fora_do_teste', texto_id: d.textoId });

    const transporte = (c.canal?.transporte ?? 'evolution') as string;
    const semTransporte = (transporte === 'cloud_api' && !c.canal?.cloud_phone_number_id)
      || (transporte === 'evolution' && !c.canal?.instancia_externa)
      || (transporte !== 'cloud_api' && transporte !== 'evolution');
    if (semTransporte) return await fim('nada', { motivo: 'transporte_nao_suportado', texto_id: d.textoId });

    if (dryRun) {
      return await fim('simulada', { texto_id: d.textoId, etapa: d.etapa, aprovado: tx.aprovado === true, parado_min: Math.round(d.paradoMs / 60_000) });
    }

    // 5) o arquivo (OGG de verdade, tamanho de áudio curto)
    let bytes: Uint8Array;
    try {
      const { data: arq, error: eArq } = await admin.storage.from(BUCKET_AUDIO).download(String(tx.audio_path));
      if (eArq || !arq) return await fim('nada', { motivo: 'audio_indisponivel', texto_id: d.textoId });
      bytes = new Uint8Array(await arq.arrayBuffer());
    } catch {
      return await fim('nada', { motivo: 'audio_indisponivel', texto_id: d.textoId });
    }
    if (!ehOgg(bytes) || bytes.length > AUDIO_MAX_BYTES) return await fim('nada', { motivo: 'audio_invalido', texto_id: d.textoId, bytes: bytes.length });

    // 6) marca ANTES de enviar: daqui em diante esta conversa nunca recebe este áudio de novo
    const base = { passo, etapa: d.etapa, em: agora.toISOString() };
    await marcarTentativa(admin, conversaId, dq, d.textoId, { ...base, resultado: 'tentando' });

    const anexo = await copiaParaInbox(admin, conv.organizacao_id, String(tx.audio_path), bytes);
    const duracao = typeof tx.duracao_s === 'number' ? tx.duracao_s : (tx.duracao_s != null ? Number(tx.duracao_s) : null);
    const meta: Record<string, unknown> = {
      // fala do fluxo do robô (o bot_pode_atuar conta a conversa como "robô no meio do fluxo" por 7 dias)
      fluxo: perfil.fluxoMeta, etapa: passo,
      ...(anexo ? { anexo_path: anexo } : {}), mime: 'audio/ogg', nome: `iris-${d.textoId}.ogg`, tamanho: bytes.length,
      ptt: true, ...(Number.isFinite(duracao) ? { seconds: duracao } : {}),
      // toque automático: entra no teto de 1 por dia e 3 por semana (toques_automaticos lê metadados ? 'nudge')
      nudge: { tipo: 'iris_retomada', etapa: d.etapa, texto_id: d.textoId },
      iris: { tipo: 'retomada', etapa: d.etapa, texto_id: d.textoId, selo: tx.selo ?? null, aprovado: tx.aprovado === true, transcricao: tx.texto ?? null, audio_path: tx.audio_path },
    };
    // o registro do toque (DEPOIS do envio): {ok:true,id} | {erro} — erro aqui não desfaz o envio; a marca iris_robo
    // continua impedindo um segundo áudio
    const registrar = async () => {
      try {
        const { data, error } = await admin.rpc('iris_registrar_evento', { p_conversa: conversaId, p_etapa: d.etapa, p_tipo: 'retomada', p_texto_id: d.textoId });
        return !error && (data as { ok?: unknown } | null)?.ok === true;
      } catch { return false; }
    };

    // 7) o envio: nota de voz em base64 (a Evolution recusa link no sendWhatsAppAudio)
    const inicio = relogio().toISOString();   // o eco desta tentativa não é anterior a isto
    let erro: string | null = null;
    let idExterno: string | null = null;
    try {
      const sent = await c.enviarAudio(destino, paraBase64(bytes));
      idExterno = sent?.key?.id ?? null;
      if (!idExterno) erro = 'sem_id_retorno';
    } catch (e) {
      erro = String((e as Error)?.message ?? 'falha_envio').slice(0, 300);
    }
    if (!erro && idExterno) {
      const msgId = await gravarMensagem(admin, conv, idExterno, meta);
      const registrado = await registrar();
      await marcarTentativa(admin, conversaId, dq, d.textoId, { ...base, resultado: 'enviado', id_externo: idExterno });
      return await fim('enviado', { texto_id: d.textoId, etapa: d.etapa, id_externo: idExterno, mensagem_id: msgId, registrado });
    }
    // TIMEOUT do transporte: pode ter saído (envio_incerto.ts). Conta como enviado — nunca vai de novo; o eco que
    // aparecer vira a linha do robô (agora ou na próxima execução, pela marca envio_incerto).
    if (ehEnvioIncerto(erro)) {
      const alvoEco: EnvioIncerto = { tipo: 'audio', conteudo: null, em: inicio, segundos: Number.isFinite(duracao) ? duracao : null, meta };
      const eco = await adotarEco(admin, conversaId, alvoEco, { esperarMs: c.esperaEcoMs ?? 10_000, sleep: c.sleep, ...(c.agora ? { agora: () => relogio().getTime() } : {}) });
      const registrado = await registrar();
      await marcarTentativa(admin, conversaId, dq, d.textoId, { ...base, resultado: eco ? 'enviado' : 'incerto', erro },
        eco ? {} : { envio_incerto: juntarIncertos(lerIncertos(dq.envio_incerto), [alvoEco]) });
      return await fim(eco ? 'enviado_apos_timeout' : 'incerto', { texto_id: d.textoId, etapa: d.etapa, erro, registrado, ...(eco ? { mensagem_id: eco.id } : {}) });
    }
    await marcarTentativa(admin, conversaId, dq, d.textoId, { ...base, resultado: 'falhou', erro });
    return await fim('falhou', { texto_id: d.textoId, etapa: d.etapa, erro });
  } catch (e) {
    return await fim('nada', { motivo: 'erro_interno', erro: String((e as Error)?.message ?? e).slice(0, 200) });
  }
}

// ---------------------------------------------------------------------------------------------------------------
// varredura (cron)

export interface CtxVarredura {
  admin: Admin;
  dryRun: boolean;
  limite?: unknown;
  /** retomada de UMA conversa pelo próprio runner (index.ts: em processo, com as mesmas guardas) */
  chamar: (corpo: Record<string, unknown>) => Promise<unknown>;
  agora?: () => Date;
  orcamentoMs?: number;
}

/** Acha as conversas paradas num passo com áudio da Iris, nos números com a Iris ligada, e pede a retomada de cada
 *  uma ao runner — a mais recente primeiro (quem parou agora ainda está perto do celular). O filtro daqui é só
 *  para não chamar à toa (e para a conversa de teste não ficar atrás das reais): quem decide é a retomada.
 *  Sem número com a Iris ligada, sai na 1ª consulta — nada mais roda. */
export async function irisVarredura(c: CtxVarredura): Promise<Record<string, unknown>> {
  const { admin, dryRun } = c;
  const agora = c.agora ? c.agora() : new Date();
  const t0 = Date.now();
  const lim = Number(c.limite);
  const limite = Number.isFinite(lim) && lim > 0 ? Math.min(Math.round(lim), VARREDURA_LIMITE_MAXIMO) : VARREDURA_LIMITE_PADRAO;
  const orcamento = c.orcamentoMs ?? VARREDURA_ORCAMENTO_MS;
  const sai = (skipped: string, extra: Record<string, unknown> = {}) => ({ ok: true, iris: 'varredura', dry_run: dryRun, skipped, ...extra });

  // 1) os números com a Iris ligada
  const { data: cfgs, error: eCfg } = await admin.from('bot_canal_config')
    .select('canal_id, iris_config, numeros_teste').eq('iris_config->>ativo', 'true');
  if (eCfg) return sai('iris_config_indisponivel', { erro: String(eCfg.message ?? '').slice(0, 200) });
  const canais = new Map<string, { cfg: IrisConfig; numeros: unknown }>();
  for (const r of (cfgs ?? []) as Array<Record<string, unknown>>) {
    const cfg = lerIrisConfig(r.iris_config);
    if (cfg.ativo && typeof r.canal_id === 'string') canais.set(r.canal_id, { cfg, numeros: r.numeros_teste });
  }
  if (!canais.size) return sai('iris_desligada');

  // 2) o horário da Iris
  const feriados = await lerFeriadosDoBanco(admin);
  if (!feriados) return sai('feriados_indisponiveis');
  if (!dentroDoHorarioIris(agora, feriados)) return sai('fora_do_horario_iris');

  // número fora do ar / restrito: o bot_pode_atuar barraria todas as conversas dele (e elas tomariam a vez das outras)
  const { data: cns, error: eCn } = await admin.from('canais')
    .select('id, status_integracao, envio_restrito, health_check_status').in('id', [...canais.keys()]);
  if (eCn) return sai('canais_indisponiveis');
  for (const cn of (cns ?? []) as Array<Record<string, unknown>>) {
    const ok = cn.status_integracao === 'conectado' && cn.envio_restrito !== true && !['restrito', 'falha'].includes(String(cn.health_check_status ?? ''));
    if (!ok) canais.delete(String(cn.id));
  }
  for (const id of [...canais.keys()]) if (!((cns ?? []) as Array<Record<string, unknown>>).some((cn) => cn.id === id)) canais.delete(id);
  if (!canais.size) return sai('numero_fora_do_ar');

  // 3) quem está parado num passo com áudio (o relógio fino é a última fala, na retomada)
  const minMin = Math.min(...[...canais.values()].map((x) => x.cfg.robo_retomada_min));
  const passos = Object.keys(IRIS_PASSOS_ROBO).join(',');
  const { data: est, error: eEst } = await admin.from('bot_conversa_estado')
    .select('conversa_id, dados_qualificacao, ultima_atividade_em, conversas!inner(canal_id, contato_id, precisa_humano, arquivada_em, status)')
    .eq('pausado', false)
    .in('conversas.canal_id', [...canais.keys()])
    .or(`dados_qualificacao->>passo_emprestimo.in.(${passos}),dados_qualificacao->>passo_video.in.(${passos})`)
    .lte('ultima_atividade_em', new Date(agora.getTime() - minMin * 60_000).toISOString())
    .gte('ultima_atividade_em', new Date(agora.getTime() - RETOMADA_ROBO_IDADE_MAX_MS).toISOString())
    .order('ultima_atividade_em', { ascending: false }).limit(100);
  if (eEst) return sai('estados_indisponiveis', { erro: String(eEst.message ?? '').slice(0, 200) });

  type Cand = { conversaId: string; canalId: string; contatoId: string; dq: Record<string, unknown>; textoId: string; passo: string };
  let cands: Cand[] = [];
  for (const r of (est ?? []) as Array<Record<string, unknown>>) {
    const cv = (Array.isArray(r.conversas) ? r.conversas[0] : r.conversas) as Record<string, unknown> | undefined;
    const canalId = cv?.canal_id as string | undefined;
    if (!cv || !canalId || !canais.has(canalId) || cv.precisa_humano === true) continue;
    if (cv.arquivada_em != null || (cv.status != null && cv.status !== 'aberta')) continue;
    const dq = (r.dados_qualificacao && typeof r.dados_qualificacao === 'object' ? r.dados_qualificacao : {}) as Record<string, unknown>;
    // o passo do fluxo de mídia (prefixo do perfil: emprestimo | video)
    const prefixo = passoComRetomadaIris(dq.passo_emprestimo) ? 'emprestimo' : passoComRetomadaIris(dq.passo_video) ? 'video' : null;
    if (!prefixo) continue;
    const alvo = IRIS_PASSOS_ROBO[dq[`passo_${prefixo}`] as string];
    const tent = (dq.iris_robo && typeof dq.iris_robo === 'object') ? dq.iris_robo as Record<string, unknown> : {};
    if (tent[alvo.textoId] != null) continue;
    const pend = lerPendente(dq[`envio_pendente_${prefixo}`]);
    if (pend && pend.passo === dq[`passo_${prefixo}`]) continue;
    cands.push({ conversaId: String(r.conversa_id), canalId, contatoId: String(cv.contato_id ?? ''), dq, textoId: alvo.textoId, passo: dq[`passo_${prefixo}`] as string });
  }

  // 4) número "só teste": só os telefones da lista (senão as conversas reais tomariam a vez da de teste)
  const soTeste = cands.filter((x) => canais.get(x.canalId)!.cfg.somente_teste);
  if (soTeste.length) {
    const { data: ids, error: eId } = await admin.from('contato_identidades')
      .select('contato_id, valor_normalizado, principal').in('contato_id', [...new Set(soTeste.map((x) => x.contatoId))])
      .eq('tipo', 'whatsapp').not('valor_normalizado', 'is', null);
    if (eId) return sai('identidades_indisponiveis');
    const tels = new Map<string, string[]>();
    for (const r of (ids ?? []) as Array<Record<string, unknown>>) {
      const k = String(r.contato_id); const v = String(r.valor_normalizado ?? '');
      if (v) tels.set(k, [...(tels.get(k) ?? []), v]);
    }
    cands = cands.filter((x) => {
      const cfg = canais.get(x.canalId)!;
      if (!cfg.cfg.somente_teste) return true;
      return (tels.get(x.contatoId) ?? []).some((t) => ehNumeroDeTeste(t, cfg.numeros));
    });
  }

  // 5) conversa com sessão de IA não é do robô
  if (cands.length) {
    const { data: ses, error: eSes } = await admin.from('ia_sessoes')
      .select('conversa_id').in('conversa_id', cands.map((x) => x.conversaId)).neq('status', 'encerrada');
    if (eSes) return sai('ia_sessoes_indisponiveis');
    const comIa = new Set(((ses ?? []) as Array<{ conversa_id: string }>).map((x) => x.conversa_id));
    cands = cands.filter((x) => !comIa.has(x.conversaId));
  }

  // 6) a retomada, uma de cada vez, dentro do orçamento de tempo
  const processadas: Array<Record<string, unknown>> = [];
  for (const x of cands.slice(0, limite)) {
    if (Date.now() - t0 > orcamento) break;
    let r: unknown;
    try {
      r = await c.chamar({ conversa_id: x.conversaId, iris_retomada: true, dry_run: dryRun });
    } catch (e) {
      r = { ok: false, erro: String((e as Error)?.message ?? e).slice(0, 200) };
    }
    const o = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>;
    const eleg = (o.elegibilidade && typeof o.elegibilidade === 'object' ? o.elegibilidade : {}) as Record<string, unknown>;
    const motivo = o.motivo ?? eleg.motivo ?? null;
    processadas.push({ conversa_id: x.conversaId, resultado: o.resultado ?? o.skipped ?? o.paused ?? (o.ok === false ? 'erro' : 'nada'), ...(motivo ? { motivo } : {}) });
    // o robô recusou a conversa por um motivo que não passa sozinho: marca, e as próximas rodadas não a chamam mais
    if (!dryRun && o.skipped === 'inelegivel' && INELEGIVEL_DEFINITIVO.has(String(eleg.motivo ?? ''))) {
      await marcarTentativa(admin, x.conversaId, x.dq, x.textoId, { passo: x.passo, em: agora.toISOString(), resultado: `pulou:${eleg.motivo}` });
    }
  }
  return { ok: true, iris: 'varredura', dry_run: dryRun, canais: canais.size, candidatas: cands.length, processadas };
}
