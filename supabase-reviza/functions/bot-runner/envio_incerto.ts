// REVIZA (23/11): cópia da função do Atenvo que está no ar, adaptada ao Reviza por
// ~/reviza-sist/porte-atendimento/porta-funcoes.py — conexões "revizaatd_", tabela atd_integracoes, pasta atd-midia.
// envio_incerto.ts — ENVIO QUE ESTOUROU O TEMPO (transporte novo de 29/10). Regra pura + IO pequeno, testado
// em tests/envio_incerto_test.ts e tests/diferencial_vivo_test.ts (deno test). Quem envia e persiste é o bot-runner.
//
// O PROBLEMA: o evolution-send/evolution.ts de 29/10 (v104) corta cada chamada — texto 15 s, mídia/áudio 45 s,
// checagens 5 s — e lança "TIMEOUT 15s: o servidor do WhatsApp não respondeu". O bot-runner NO AR ainda
// empacota a versão antiga (sem limite): o próximo deploy dele traz o limite junto. Timeout NÃO é recusa: a
// Evolution pode ter mandado a mensagem e só demorado a responder. Aí o eco (fromMe) chega ao evolution-webhook
// com um id que ninguém gravou e vira saída origem='telefone' — GENTE pelo humano.ts e pelo bot_pode_atuar
// (atendente_ja_respondeu). Na próxima mensagem do cliente o robô pausaria com humano_assumiu por causa da
// PRÓPRIA mensagem, e o cliente ficaria sem resposta.
//
// A REGRA:
//  * erro de TEMPO (TIMEOUT do evolution.ts, abort da Cloud API) = envio INCERTO, não falha certa. O "HTTP 408"
//    do Square NÃO entra: é o proxy respondendo na hora com o app fora do ar — ali nada saiu;
//  * logo em seguida o robô procura o eco (espera curta) e, achando, ADOTA a linha: origem 'bot' e os metadados
//    que o robô teria gravado (o id_externo do eco fica). O envio conta como entregue;
//  * sem eco ainda: a marca envio_incerto fica em dados_qualificacao e a próxima execução do robô adota o eco
//    atrasado ANTES da guarda de humano (bot-runner/index.ts);
//  * nada aqui reenvia: o reenvio da pergunta que não chegou continua sendo o do envio_pendente.ts (só quando o
//    cliente escreve sem responder).
// Sem TIMEOUT não existe marca, e sem marca nada disto roda: o robô de hoje fica igual.

/** O que o webhook grava em mensagens.tipo para o eco de cada envio do robô. */
export type TipoEnvio = 'texto' | 'imagem' | 'video' | 'audio';

/** Marca gravada em dados_qualificacao.envio_incerto (lista). */
export interface EnvioIncerto {
  tipo: TipoEnvio;
  conteudo: string | null;      // texto ou legenda da mídia (áudio: null)
  em: string;                   // ISO do INÍCIO da tentativa (o eco nunca é anterior a isso, salvo relógio)
  segundos?: number | null;     // áudio: duração esperada (casa com metadados.seconds do eco)
  meta?: Record<string, unknown>; // metadados que a linha do robô teria — vão para a linha adotada
}

/** Linha de saída como o webhook grava (o mínimo que a regra lê). */
export interface LinhaSaida {
  id: string;
  tipo: string | null;
  conteudo: string | null;
  origem: string | null;
  autor_id: string | null;
  criado_em: string;
  metadados?: unknown;
  id_externo?: string | null;
}

/** Relógio do webhook × o nosso: o eco pode aparecer carimbado um pouco antes do início da tentativa. */
export const ECO_ANTES_MS = 5_000;
/** Até quando depois do início da tentativa um eco ainda é dela (texto/mídia; o áudio tem janela menor:
 *  o casamento do áudio é só por tipo + duração, então quanto menor a janela, menor o risco de adotar o áudio
 *  que alguém mandou de verdade pelo celular). */
export const ECO_DEPOIS_MS = 15 * 60_000;
export const ECO_DEPOIS_AUDIO_MS = 5 * 60_000;
/** Diferença aceita entre a duração esperada do áudio e a do eco. */
export const ECO_TOLERANCIA_SEGUNDOS = 2;
/** Teto de marcas guardadas por conversa (a mais nova fica). */
export const INCERTOS_MAX = 10;

const TIPOS: ReadonlySet<string> = new Set(['texto', 'imagem', 'video', 'audio']);

/** O erro do transporte é de TEMPO (pode ter saído)? `TIMEOUT 15s:`/`TIMEOUT 45s:` vem do evolution.ts de 29/10;
 *  "The signal has been aborted" vem do AbortController da Cloud API (transporte.ts, 25 s). Fica de fora o que
 *  teve resposta HTTP (o 408 do Square é o proxy respondendo na hora com o app fora do ar) e o erro de conexão
 *  genérico do fetch (a requisição nem chegou ao servidor). */
export function ehEnvioIncerto(erro: string | null | undefined): boolean {
  const e = String(erro ?? '');
  if (/^TIMEOUT \d+s\b/.test(e)) return true;
  if (/^HTTP \d+/.test(e)) return false;
  return /\babort/i.test(e);
}

/** Fim da janela do eco de uma marca (ms). */
function fimDaJanela(m: EnvioIncerto): number {
  return Date.parse(m.em) + (m.tipo === 'audio' ? ECO_DEPOIS_AUDIO_MS : ECO_DEPOIS_MS);
}

/** Lê a lista do jsonb com defesa (marca corrompida vira "sem marca"). Mantém só as marcas válidas, na ordem,
 *  até INCERTOS_MAX (as mais novas). Não descarta por idade: quem sabe se a janela já passou SEM eco é
 *  adotarIncertos, depois de procurar. */
export function lerIncertos(v: unknown): EnvioIncerto[] {
  if (!Array.isArray(v)) return [];
  const ok: EnvioIncerto[] = [];
  for (const x of v) {
    if (!x || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    if (typeof o.tipo !== 'string' || !TIPOS.has(o.tipo)) continue;
    if (typeof o.em !== 'string' || !Number.isFinite(Date.parse(o.em))) continue;
    ok.push({
      tipo: o.tipo as TipoEnvio,
      conteudo: typeof o.conteudo === 'string' ? o.conteudo : null,
      em: o.em,
      ...(typeof o.segundos === 'number' && Number.isFinite(o.segundos) ? { segundos: o.segundos } : {}),
      ...(o.meta && typeof o.meta === 'object' && !Array.isArray(o.meta) ? { meta: o.meta as Record<string, unknown> } : {}),
    });
  }
  return ok.slice(-INCERTOS_MAX);
}

/** Junta marcas (as antigas primeiro), respeitando o teto. */
export function juntarIncertos(antigas: EnvioIncerto[], novas: EnvioIncerto[]): EnvioIncerto[] {
  return [...antigas, ...novas].slice(-INCERTOS_MAX);
}

const normalizar = (s: string | null | undefined) => (s ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();

/** A linha é o eco desta tentativa? Só saída SEM autor gravada como 'telefone' (o que o webhook faz com fromMe de
 *  id desconhecido), do mesmo tipo, dentro da janela, e: texto/mídia com o MESMO texto ou legenda; áudio como
 *  nota de voz (ptt) com a duração esperada (± ECO_TOLERANCIA_SEGUNDOS, quando as duas são conhecidas). */
export function casaEco(linha: LinhaSaida, alvo: EnvioIncerto): boolean {
  if (linha.autor_id != null || linha.origem !== 'telefone' || linha.tipo !== alvo.tipo) return false;
  const t = Date.parse(linha.criado_em);
  const ini = Date.parse(alvo.em);
  if (!Number.isFinite(t) || !Number.isFinite(ini)) return false;
  if (t < ini - ECO_ANTES_MS || t > fimDaJanela(alvo)) return false;
  if (alvo.tipo === 'audio') {
    const meta = (linha.metadados && typeof linha.metadados === 'object' ? linha.metadados : {}) as Record<string, unknown>;
    if (meta.ptt !== true) return false;
    const s = typeof meta.seconds === 'number' ? meta.seconds : null;
    if (s != null && typeof alvo.segundos === 'number' && Math.abs(s - alvo.segundos) > ECO_TOLERANCIA_SEGUNDOS) return false;
    return true;
  }
  return normalizar(linha.conteudo) === normalizar(alvo.conteudo);
}

/** Metadados da linha adotada: os do eco (anexo baixado pelo webhook etc.) sem a marca de 'telefone', mais os do
 *  robô, mais o rastro da adoção. O arquivo que o webhook baixou do próprio eco continua sendo o anexo. */
export function metadadosAdotados(daLinha: unknown, alvo: EnvioIncerto, agoraIso: string): Record<string, unknown> {
  const base = { ...((daLinha && typeof daLinha === 'object' && !Array.isArray(daLinha)) ? daLinha as Record<string, unknown> : {}) };
  const via = base.via ?? null;
  delete base.origem;
  delete base.via;
  return {
    ...base, ...(alvo.meta ?? {}),
    ...(typeof base.anexo_path === 'string' && base.anexo_path ? { anexo_path: base.anexo_path } : {}),
    eco_adotado: { motivo: 'timeout_transporte', tentativa_em: alvo.em, adotado_em: agoraIso, via },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// IO (o cliente do Supabase entra por parâmetro: os testes passam um falso)

// deno-lint-ignore no-explicit-any
type Admin = any;

export interface OpcoesAdocao {
  /** quanto esperar o eco aparecer (0 = só olha uma vez) */
  esperarMs?: number;
  /** intervalo entre as olhadas */
  passoMs?: number;
  sleep?: (ms: number) => Promise<void>;
  agora?: () => number;
}

const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, Math.max(0, ms)));

/** Procura o eco de UMA tentativa incerta e, achando, adota a linha. Devolve a linha adotada ou null. Nunca lança
 *  (falha de leitura/escrita = não adotou; o robô segue como antes). */
export async function adotarEco(
  admin: Admin, conversaId: string, alvo: EnvioIncerto, opts: OpcoesAdocao = {},
): Promise<{ id: string; id_externo: string | null } | null> {
  const sleep = opts.sleep ?? dormir;
  const agora = opts.agora ?? (() => Date.now());
  const ate = agora() + Math.max(0, opts.esperarMs ?? 0);
  const passo = Math.max(250, opts.passoMs ?? 2_000);
  const desde = new Date(Date.parse(alvo.em) - ECO_ANTES_MS).toISOString();
  const limite = new Date(fimDaJanela(alvo)).toISOString();
  for (;;) {
    try {
      const { data, error } = await admin.from('mensagens')
        .select('id, tipo, conteudo, origem, autor_id, criado_em, metadados, id_externo')
        .eq('conversa_id', conversaId).eq('direcao', 'saida').eq('origem', 'telefone').is('autor_id', null)
        .eq('tipo', alvo.tipo).gte('criado_em', desde).lte('criado_em', limite)
        .order('criado_em', { ascending: true }).limit(5);
      if (!error) {
        const linha = ((data ?? []) as LinhaSaida[]).find((l) => casaEco(l, alvo));
        if (linha) {
          const { error: eu } = await admin.from('mensagens')
            .update({ origem: 'bot', metadados: metadadosAdotados(linha.metadados, alvo, new Date(agora()).toISOString()) })
            .eq('id', linha.id).eq('origem', 'telefone');
          if (!eu) return { id: linha.id, id_externo: linha.id_externo ?? null };
        }
      }
    } catch { /* best-effort: sem adoção o robô segue como antes */ }
    if (agora() + passo > ate) return null;
    await sleep(passo);
  }
}

/** Execução seguinte: adota os ecos atrasados das marcas guardadas. Devolve quantas adotou e as marcas que AINDA
 *  podem receber eco (janela aberta). Marca com a janela fechada e sem eco cai: se o eco tivesse chegado dentro
 *  dela, esta procura teria achado. */
export async function adotarIncertos(
  admin: Admin, conversaId: string, marcas: EnvioIncerto[], agoraMs = Date.now(),
): Promise<{ adotados: number; restantes: EnvioIncerto[] }> {
  let adotados = 0;
  const restantes: EnvioIncerto[] = [];
  for (const m of marcas) {
    const eco = await adotarEco(admin, conversaId, m, { esperarMs: 0, agora: () => agoraMs });
    if (eco) { adotados++; continue; }
    if (fimDaJanela(m) > agoraMs) restantes.push(m);
  }
  return { adotados, restantes };
}
