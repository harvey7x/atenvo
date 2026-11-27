// REVIZA (23/11): cópia da função do Atenvo que está no ar, adaptada ao Reviza por
// ~/reviza-sist/porte-atendimento/porta-funcoes.py — conexões "revizaatd_", tabela atd_integracoes, pasta atd-midia.
// envio_pendente.ts — TRAVA "pergunta que não saiu" dos fluxos determinísticos (mídia e botões).
// Puro (sem Deno/DB) — testado por vitest como fluxo_video.ts/fluxo_botoes.ts. Quem envia e
// persiste é o bot-runner; aqui só se DECIDE.
//
// O BUG (05/10, canal EMPRÉSTIMO): o runner gravava passo_<fluxo>/<fluxo>_abertura_em SEM olhar
// se a pergunta chegou ao cliente. Evolution fora (HTTP 408/400/500) ou contato sem número
// ('sem_destino', @lid) → o passo avançava e o robô ficava esperando resposta a uma pergunta que
// nunca foi feita (ex.: disse "Sim", ficou em aguardando_nome sem nunca receber o pedido do nome).
// "enviados > 0" NÃO basta: o "Ótima decisão! 👏" sai e o pedido do nome cai — o cliente também
// fica sem pergunta. O critério é por TELA: o que o cliente não recebeu.
//
// A REGRA:
//  * ABERTURA que não saiu NADA → o runner NÃO grava passo nem *_abertura_em: a próxima mensagem
//    (ou o re-dispatch do @lid resolvido, evolution-webhook v32) recomeça pela própria abertura.
//  * Qualquer outro passo que ESPERA resposta → o passo novo é gravado (as ações de estado — nome,
//    CPF, recusa — já rodaram e são coerentes com ele) JUNTO com a marca envio_pendente_<fluxo>,
//    com as telas que o cliente não recebeu.
//  * Próxima mensagem do cliente com pendência no passo atual: se a resposta AVANÇA o funil
//    (passo novo / ação de estado), segue normal e a marca cai; senão (reprompt, desvio de
//    áudio, escalada por "não entendi") o robô REENVIA as telas pendentes — sem gastar tentativa
//    nem desvio, porque o cliente nunca viu a pergunta.
//  * EXCEÇÃO (revisão 05/10): pendência NOVA (nasceu numa troca de passo = o cliente nunca viu o
//    pedido deste passo) num passo de resposta LIVRE (nome). Ali o "avançou" do motor mente: o
//    validarNomeVideo aceita "Sim, quero", "Oi, tudo bem?", "Tô esperando", "Ainda não recebi" e o
//    ask_nome dos botões aceita qualquer coisa com letra ("oi?") — gravaria isso como NOME e pediria
//    o CPF. Nesse caso o robô SEMPRE reenvia o pedido. CPF (11 dígitos/DV) e SIM/NÃO (tokens
//    exatos) são respostas fortes e seguem o motor mesmo sem a pergunta vista.
//  * Passo terminal (fim, recusado, sem_beneficio) ou bot saindo de cena (fecho, escalada pra humano,
//    IA do benefício no JUROS): só registra a falha — quem continua é o humano/IA.

/** O mínimo que a regra precisa saber de uma tela (TelaVideo e Tela do botões servem). */
export interface TelaMin { tipo: string }

/** Marca gravada em dados_qualificacao.envio_pendente_<prefixo> (jsonb). */
export interface EnvioPendente<T extends TelaMin = TelaMin> {
  passo: string;     // passo cuja pergunta não chegou ao cliente
  telas: T[];        // o que reenviar (na ordem)
  erro: string;      // motivo do transporte (HTTP 408…, sem_destino, sem_instancia…)
  em: string;        // ISO da última falha
  falhas: number;    // falhas consecutivas desta pendência (1 = a primeira)
  nova: boolean;     // nasceu numa TROCA de passo: o cliente nunca viu o pedido deste passo
                     // (false = só um reprompt/desvio caiu; a pergunta original ele viu)
}

/** Passos em que o robô ESPERA resposta — só neles uma pergunta perdida trava o cliente. */
export const PASSOS_ESPERAM_MIDIA: ReadonlySet<string> = new Set(['aguardando_sim_nao', 'aguardando_nome', 'aguardando_cpf', 'aguardando_beneficio']);
export const PASSOS_ESPERAM_BOTOES: ReadonlySet<string> = new Set(['aguardando_abertura', 'ask_nome', 'ask_cpf']);
/** Passos de resposta LIVRE validada por heurística fraca (nome): sem a pergunta vista, o texto do
 *  cliente não é resposta — só a reemissão vale (ver EXCEÇÃO no topo). A pergunta do BENEFÍCIO (20/10)
 *  também: QUALQUER texto/áudio fecha o passo (até "oi?" vira 'incerto'), então um "Sim" atrasado ou
 *  um "tô esperando" de quem nunca viu a pergunta seria lido como resposta — reemite a pergunta. */
export const PASSOS_RESPOSTA_LIVRE: ReadonlySet<string> = new Set(['aguardando_nome', 'ask_nome', 'aguardando_beneficio']);

// 'iris_audio' (abertura da Iris, 13/11) é MÍDIA para a regra de pendência: nunca trava o funil nem vira pendente
// (quem a envia é o pré-passo do runner, uma vez só — reenviar o áudio seria falar duas vezes).
const ehMidia = (t: TelaMin) => t.tipo === 'video' || t.tipo === 'imagem' || t.tipo === 'iris_audio';
const ehInicio = (passo: string | null | undefined) => !passo || passo === 'inicio';

/** Telas que o cliente NÃO recebeu e que importam pro funil. `entregue[i]` = a tela i saiu (o
 *  transporte devolveu id). Nada saiu → TODAS (a mídia junto: é a abertura inteira que volta).
 *  Algo saiu → só as não-mídia que não saíram ("mídia nunca trava o funil", regra do fluxo). */
export function telasNaoEntregues<T extends TelaMin>(telas: T[], entregue: boolean[]): T[] {
  if (!telas.length) return [];
  if (!entregue.some(Boolean)) return telas.slice();
  return telas.filter((t, i) => !entregue[i] && !ehMidia(t));
}

export interface DecisaoPendencia<T extends TelaMin> {
  /** marca a gravar (null = limpar/sem pendência) */
  pendente: EnvioPendente<T> | null;
  /** abertura que não saiu nada: NÃO persistir passo/abertura_em (recomeça do zero) */
  naoGravarPasso: boolean;
  /** houve tela relevante que o cliente não recebeu (pra log/evento, mesmo sem marca) */
  falhou: boolean;
}

/** Decide o que persistir depois do envio. `envioReal` = !dryRunEfetivo (simulação nunca marca
 *  pendência: o fluxo simulado avança de propósito). `botSaiDeCena` = fecho/escalada/pausa: o
 *  humano ou a IA continuam, então não há pergunta do robô a reenviar. */
export function decidirPendencia<T extends TelaMin>(p: {
  passoAtual: string | null; passoNovo: string; telas: T[]; entregue: boolean[];
  envioReal: boolean; erro: string | null; passosQueEsperam: ReadonlySet<string>;
  botSaiDeCena: boolean; pendenteAnterior: EnvioPendente<T> | null; agoraIso: string;
  /** o cliente JÁ viu o pedido do passo novo por outro balão (ex.: o áudio da Iris pediu o nome e só o gancho em
   *  texto falhou): a pendência não é "nova" — a resposta dele vale e o gancho só volta se a resposta não servir. */
  pedidoJaVisto?: boolean;
}): DecisaoPendencia<T> {
  if (!p.envioReal) return { pendente: null, naoGravarPasso: false, falhou: false };
  const faltam = telasNaoEntregues(p.telas, p.entregue);
  if (!faltam.length) return { pendente: null, naoGravarPasso: false, falhou: false };
  // abertura: nada chegou ao cliente → não existe conversa do robô ainda; não grava passo.
  if (ehInicio(p.passoAtual) && !p.entregue.some(Boolean)) return { pendente: null, naoGravarPasso: true, falhou: true };
  if (p.botSaiDeCena || !p.passosQueEsperam.has(p.passoNovo)) return { pendente: null, naoGravarPasso: false, falhou: true };
  const mesma = !!p.pendenteAnterior && p.pendenteAnterior.passo === p.passoNovo;
  const falhasAntes = mesma ? p.pendenteAnterior!.falhas : 0;
  // nova: trocou de passo agora (o pedido do passo novo não chegou) OU é a reemissão de uma
  // pendência que já era nova e caiu de novo (o cliente continua sem ter visto o pedido).
  const nova = !p.pedidoJaVisto && (p.passoAtual !== p.passoNovo || (mesma && p.pendenteAnterior!.nova));
  return {
    pendente: { passo: p.passoNovo, telas: faltam, erro: (p.erro ?? 'falha_envio').slice(0, 200), em: p.agoraIso, falhas: falhasAntes + 1, nova },
    naoGravarPasso: false, falhou: true,
  };
}

/** Lê a marca do jsonb com defesa (estado legado/corrompido vira "sem pendência"). */
export function lerPendente<T extends TelaMin = TelaMin>(v: unknown): EnvioPendente<T> | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (typeof o.passo !== 'string' || !o.passo || !Array.isArray(o.telas) || !o.telas.length) return null;
  // cada tela precisa ter o que mandar (corpo do texto/botões ou url da mídia) — senão o reenvio
  // viraria sendText(undefined) e uma marca corrompida reenviaria lixo pra sempre.
  const telaOk = (t: unknown) => {
    if (!t || typeof t !== 'object') return false;
    const x = t as Record<string, unknown>;
    return typeof x.tipo === 'string' && (typeof x.corpo === 'string' || typeof x.url === 'string'
      || (x.tipo === 'iris_audio' && typeof x.textoId === 'string' && x.textoId !== '')
      || (x.tipo === 'iris_voz' && typeof x.modelo === 'string' && x.modelo !== ''));
  };
  if (!o.telas.every(telaOk)) return null;
  return {
    passo: o.passo, telas: o.telas as T[], erro: typeof o.erro === 'string' ? o.erro : '',
    em: typeof o.em === 'string' ? o.em : '', falhas: Number(o.falhas) > 0 ? Number(o.falhas) : 1,
    nova: o.nova === true,
  };
}

/** Próxima mensagem com pendência NO PASSO ATUAL e o motor NÃO avançou → reenviar as telas
 *  pendentes no lugar da resposta do motor. `avancou` vem do predicado do fluxo (abaixo).
 *  Pendência NOVA em passo de resposta livre (nome) → reenvia SEMPRE (o "avançou" ali seria lixo
 *  salvo como nome). */
export function deveReemitir(pendente: EnvioPendente | null, passoAtual: string | null, avancou: boolean): boolean {
  if (!pendente || !passoAtual || pendente.passo !== passoAtual || pendente.telas.length === 0) return false;
  if (pendente.nova && PASSOS_RESPOSTA_LIVRE.has(passoAtual)) return true;
  return !avancou;
}

/** Fluxo de MÍDIA: avançou = mudou de passo ou executou ação de estado. Reprompt/desvio/escalada
 *  por "não entendi" ficam no mesmo passo sem ação de estado → NÃO avançou. */
export function avancouMidia(
  r: { acao: string; passoNovo?: string; acoes?: { salvarNome?: unknown; salvarCpf?: unknown; concluirAnalise?: unknown; registrarRecusa?: unknown; limparRecusa?: unknown; salvarBeneficio?: unknown; encaminharIaBeneficio?: unknown } },
  passoAtual: string | null,
): boolean {
  if (r.acao !== 'enviar') return true;   // 'nada' nunca é trocado por reenvio
  const a = r.acoes ?? {};
  return r.passoNovo !== passoAtual || !!(a.salvarNome || a.salvarCpf || a.concluirAnalise || a.registrarRecusa || a.limparRecusa || a.salvarBeneficio || a.encaminharIaBeneficio);
}

/** Fluxo de MÍDIA, decisão completa do runner: troca a resposta do motor pelo REENVIO da pergunta
 *  pendente? (09/10) FORMULÁRIO do anúncio nunca — é dado estruturado (nome do Flow), não resposta
 *  livre: a exceção do nome (pendência nova) não vale para ele, o motor segue. Já o RUÍDO colado no
 *  formulário ('nada' motivo ruido_pos_formulario: "Sim"/"Olá!" sem dígito logo depois dele) reenvia
 *  a pergunta pendente se houver — o cliente ainda não a viu, e o ruído não é resposta.
 *  (20/10) TIMEOUT do benefício também nunca: não é mensagem do cliente — o fecho é em silêncio, mesmo
 *  que a pergunta não tenha chegado (a IA/o atendente seguem; reenviar seria um balão sem gatilho). */
export function reemitirMidia(p: {
  ehFormulario: boolean;
  r: { acao: string; motivo?: string; passoNovo?: string; acoes?: Parameters<typeof avancouMidia>[0]['acoes'] };
  pendente: EnvioPendente | null; passoAtual: string | null;
  ehTimeout?: boolean;
}): boolean {
  if (p.ehFormulario || p.ehTimeout) return false;
  const ruido = p.r.acao === 'nada' && p.r.motivo === 'ruido_pos_formulario';
  if (p.r.acao !== 'enviar' && !ruido) return false;
  return deveReemitir(p.pendente, p.passoAtual, ruido ? false : avancouMidia(p.r, p.passoAtual));
}

/** Fluxo por BOTÕES: mesma ideia (finalizar/salvarQualificacao também são avanço). */
export function avancouBotoes(
  r: { acao: string; passoNovo?: string; acoes?: { salvarNome?: unknown; salvarCpf?: unknown; salvarQualificacao?: unknown; finalizar?: unknown; finalizarSuporte?: unknown } },
  passoAtual: string | null,
): boolean {
  if (r.acao !== 'enviar') return true;
  const a = r.acoes ?? {};
  return r.passoNovo !== passoAtual || !!(a.salvarNome || a.salvarCpf || a.salvarQualificacao || a.finalizar || a.finalizarSuporte);
}
