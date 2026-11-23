// REVIZA (23/11): cópia da função do Atenvo que está no ar, adaptada ao Reviza por
// ~/reviza-sist/porte-atendimento/porta-funcoes.py — conexões "revizaatd_", tabela atd_integracoes, pasta atd-midia.
// clean.ts — o comando /clean do NÚMERO DE TESTE (decisão N8 do dono, 01/11/2026, literal):
//   "para numero teste, passe esse numero cliente do matheus, coloque um comando que quando eu enviar /clean vai limpar e
//    recomecar o atendimento"
//
// QUANDO VALE: o texto, sem espaço em volta e em minúsculas, é EXATAMENTE "/clean" ("/Clean " vale; "/clean.", "/ clean"
// e "/clean agora" não), veio do cliente (não fromMe), sem mídia e sem formulário, a Iris está LIGADA no número
// (bot_canal_config.iris_config.ativo === true, o mesmo leitor do robô: lerIrisConfig) e o telefone está em
// numeros_teste do número (chave canônica DDD + 8, a mesma régua da Iris e do robô: ehNumeroDeTeste). O banco confere
// de novo na RPC (iris_teste_limpar), pelo telefone PRINCIPAL do contato.
//
// O QUE ACONTECE (executarClean): grava a mensagem "/clean" na conversa (com metadados.comando = 'clean'), chama
// iris_teste_limpar (cancela ligação e lembrete, encerra a IA, reinicia o robô, cancela o follow-up, card na entrada,
// fecha as conversas — sem apagar mensagem) e responde no chat com uma mensagem do SISTEMA (tipo 'sistema': não é fala
// da IA, não pausa nada, não conta como humano). A mensagem "/clean" NÃO vai para o robô nem para a IA: o webhook sai
// antes do resto do fluxo (não lidas, opt-out, remarketing, robô, Kanban).
//
// NÃO É NÚMERO DE TESTE (com a Iris ligada): "/clean" segue como mensagem comum, sem efeito nenhum, e o webhook registra
// o evento 'teste_clean_negado' (iris_teste_registrar_negado). IRIS DESLIGADA: "/clean" é mensagem comum, como hoje.
//
// O ECO: a resposta do sistema volta da Evolution como fromMe. Se ela passasse pelo fluxo normal, abriria uma conversa
// NOVA (a do /clean acabou de ser fechada) com uma mensagem "do celular" (= humano) e o robô não recomeçaria. Por isso o
// eco do texto exato da resposta, para um número de teste, é ignorado ANTES de resolver contato e conversa
// (ehEcoDaLimpeza). Vale também quando o eco chega antes de a resposta ser gravada (corrida).
import { ehNumeroDeTeste, lerIrisConfig } from '../bot-runner/iris_robo.ts';

export const COMANDO_CLEAN = '/clean';
/** A resposta no chat quando limpou (texto do pedido da frente TESTE, 01/11). */
export const TEXTO_CLEAN_OK = 'Atendimento limpo. Pode mandar a mensagem do anúncio para recomeçar.';
/** A resposta no chat quando o banco não limpou (RASCUNHO, só para número de teste: aprovar no teste). */
export const TEXTO_CLEAN_FALHOU = 'Não consegui limpar o atendimento agora. Tente de novo daqui a pouco.';

/** "/clean" exato depois de tirar os espaços em volta e passar para minúsculas. */
export function ehComandoClean(texto: string | null | undefined): boolean {
  return typeof texto === 'string' && texto.trim().toLowerCase() === COMANDO_CLEAN;
}

/** bot_canal_config do número (só o que o /clean usa). */
export interface CfgClean { iris_config: unknown; numeros_teste: unknown }

/** 'limpar' (número de teste, Iris ligada) | 'negado' (Iris ligada, número fora da lista) | 'comum' (todo o resto). */
export type DecisaoClean = 'limpar' | 'negado' | 'comum';

export function decidirClean(e: {
  texto: string | null | undefined;
  fromMe: boolean | null;
  temMidia: boolean;
  ehFormulario: boolean;
  telefone: string | null | undefined;
  cfg: CfgClean | null;
}): DecisaoClean {
  if (e.fromMe !== false || e.temMidia || e.ehFormulario || !ehComandoClean(e.texto)) return 'comum';
  if (!e.cfg || !lerIrisConfig(e.cfg.iris_config).ativo) return 'comum';      // Iris desligada = hoje
  return ehNumeroDeTeste(e.telefone ?? null, e.cfg.numeros_teste) ? 'limpar' : 'negado';
}

/** O texto é uma das respostas do /clean? (barato: decide se vale ler a config para o eco) */
export function ehTextoDaRespostaClean(texto: string | null | undefined): boolean {
  const t = typeof texto === 'string' ? texto.trim() : '';
  return t === TEXTO_CLEAN_OK || t === TEXTO_CLEAN_FALHOU;
}

/** O eco (fromMe) da resposta do /clean para um número de teste, com a Iris ligada. Sem telefone (só LID): também,
 *  pois o texto é só nosso e o eco nunca pode virar "humano" numa conversa nova. */
export function ehEcoDaLimpeza(e: { fromMe: boolean | null; texto: string | null | undefined; telefone: string | null | undefined; cfg: CfgClean | null }): boolean {
  if (e.fromMe !== true || !ehTextoDaRespostaClean(e.texto)) return false;
  if (!e.cfg || !lerIrisConfig(e.cfg.iris_config).ativo) return false;
  return !e.telefone || ehNumeroDeTeste(e.telefone, e.cfg.numeros_teste);
}

// deno-lint-ignore no-explicit-any
type Admin = any;

/** Lê iris_config e numeros_teste do número. Coluna ausente (migration não aplicada), erro ou sem linha → null
 *  (= Iris desligada para o /clean: tudo como hoje). */
export async function lerConfigClean(admin: Admin, canalId: string): Promise<CfgClean | null> {
  try {
    const { data, error } = await admin.from('bot_canal_config').select('iris_config, numeros_teste').eq('canal_id', canalId).maybeSingle();
    if (error || !data) return null;
    return { iris_config: (data as Record<string, unknown>).iris_config, numeros_teste: (data as Record<string, unknown>).numeros_teste };
  } catch { return null; }
}

/** Envio de texto pela Evolution (o mesmo endpoint do evolution-send), com tempo máximo. */
export type EnviarTexto = (numero: string, texto: string) => Promise<{ key?: { id?: string } } | null>;

export function enviadorEvolution(base: string, chave: string, instancia: string, limiteMs = 15_000): EnviarTexto {
  return async (numero, texto) => {
    if (!base || !chave) throw new Error('evolution_nao_configurada');
    const res = await fetch(`${base}/message/sendText/${instancia}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: chave },
      body: JSON.stringify({ number: numero, text: texto }), signal: AbortSignal.timeout(limiteMs),
    });
    const txt = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${txt.slice(0, 140)}`);
    try { return JSON.parse(txt) as { key?: { id?: string } }; } catch { return null; }
  };
}

export interface CtxClean {
  admin: Admin;
  orgId: string;
  canalId: string;
  contatoId: string;
  conversaId: string;
  provMsgId: string | null;
  texto: string;
  /** para onde vai a resposta (o telefone do evento); sem telefone, limpa e não responde */
  destino: string | null;
  enviarTexto: EnviarTexto;
  agora?: () => Date;
}

export interface ResultadoClean {
  status: 'processado' | 'erro';
  /** vai para whatsapp_webhook_events.ignorado_motivo */
  motivo: string;
  erro?: string;
  limpeza?: Record<string, unknown> | null;
  respondeu?: boolean;
}

/** O /clean de um número de teste: grava a mensagem, limpa, responde. Nunca chama o robô nem a IA. */
export async function executarClean(ctx: CtxClean): Promise<ResultadoClean> {
  const agora = () => (ctx.agora ? ctx.agora() : new Date()).toISOString();
  const { admin } = ctx;

  // 1. a mensagem "/clean" fica na conversa (histórico), marcada como comando. Idempotente por id_externo: reentrega
  //    da Evolution não limpa nem responde de novo.
  const { data: insArr, error: eIns } = await admin.from('mensagens').upsert({
    conversa_id: ctx.conversaId, organizacao_id: ctx.orgId, direcao: 'entrada', tipo: 'texto', conteudo: ctx.texto,
    id_externo: ctx.provMsgId, status: 'entregue', recebida_em: agora(),
    metadados: { via: 'webhook', origem: 'cliente', comando: 'clean' },
  }, { onConflict: 'id_externo', ignoreDuplicates: true }).select('id');
  if (eIns) return { status: 'erro', motivo: 'teste_clean', erro: `mensagens:${eIns.code ?? ''}:${String(eIns.message ?? '').slice(0, 160)}` };
  if (!Array.isArray(insArr) || insArr.length === 0) return { status: 'processado', motivo: 'teste_clean_repetido' };

  // 2. a limpeza (o banco confere de novo: Iris ligada + telefone principal em numeros_teste)
  let limpeza: Record<string, unknown> | null = null;
  let erroLimpeza: string | null = null;
  try {
    const { data, error } = await admin.rpc('iris_teste_limpar', { p_contato: ctx.contatoId, p_canal: ctx.canalId });
    if (error) erroLimpeza = `rpc:${error.code ?? ''}:${String(error.message ?? '').slice(0, 160)}`;
    else {
      limpeza = (data ?? null) as Record<string, unknown> | null;
      if (limpeza?.ok !== true) erroLimpeza = `recusado:${String(limpeza?.erro ?? 'sem_retorno')}`;
    }
  } catch (e) { erroLimpeza = `rpc:${String((e as Error).message ?? e).slice(0, 160)}`; }
  const limpou = erroLimpeza === null;

  // 3. a resposta no chat, como mensagem do SISTEMA (tipo 'sistema', origem 'bot', sem autor): não é fala da IA, não
  //    pausa a IA, não conta como humano, não conta como toque.
  const resposta = limpou ? TEXTO_CLEAN_OK : TEXTO_CLEAN_FALHOU;
  let idExterno: string | null = null;
  let erroEnvio: string | null = null;
  if (ctx.destino) {
    try {
      const r = await ctx.enviarTexto(ctx.destino, resposta);
      idExterno = r?.key?.id ?? null;
      if (!idExterno) erroEnvio = 'sem_id_externo';
    } catch (e) { erroEnvio = String((e as Error).message ?? e).slice(0, 160); }
  } else {
    erroEnvio = 'sem_destino';
  }
  try {
    const quando = agora();
    await admin.from('mensagens').insert({
      conversa_id: ctx.conversaId, organizacao_id: ctx.orgId, direcao: 'saida', tipo: 'sistema', conteudo: resposta,
      origem: 'bot', autor_id: null, id_externo: idExterno, status: idExterno ? 'enviada' : 'falhou',
      enviada_em: idExterno ? quando : null, erro_envio: erroEnvio,
      metadados: { via: 'teste_clean', sistema: true, comando: 'clean', resultado: limpou ? 'limpo' : 'falhou' },
    });
  } catch { /* a resposta já saiu (ou não): o registro é só histórico */ }

  return {
    status: limpou ? 'processado' : 'erro',
    motivo: limpou ? (erroEnvio ? `teste_clean_sem_resposta:${erroEnvio}`.slice(0, 120) : 'teste_clean') : 'teste_clean_falhou',
    ...(erroLimpeza ? { erro: erroLimpeza } : {}),
    limpeza,
    respondeu: !!idExterno,
  };
}
