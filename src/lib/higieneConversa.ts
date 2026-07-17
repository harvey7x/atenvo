/* Higiene obrigatória da conversa — REGRA PURA (sem React/DB), testada por vitest.
 *
 * Resolve dois problemas medidos na auditoria comercial de 2026-07:
 *   1) conversa ativa sem responsável  → 72% das conversas ativas;
 *   2) contato salvo como número/1º nome → 49% da base.
 *
 * ENTRADA PROGRESSIVA (decisão do dono): não se liga bloqueio duro em 72% das conversas
 * de uma vez — a equipe fugiria para o celular, que é justamente a doença (87% do
 * atendimento já acontece fora do painel). Então:
 *   · conversa NOVA (criada a partir do corte) sem dono  → bloqueia já;
 *   · conversa ANTIGA sem dono → alerta forte durante a adaptação, bloqueia depois.
 * O nome já entra com a regra progressiva completa (2 adiamentos → bloqueio), porque
 * ela nunca deixa o atendente sem saída: sempre há "cliente ainda não informou" (24h).
 *
 * O bloqueio é de FRONT, por decisão do dono: é regra operacional, não de segurança.
 * O backend (evolution-send) não muda — para não quebrar retry, automação nem Edge.
 */

/* ===================== Configuração da entrada progressiva ===================== */

/** Corte: conversa criada a partir daqui é "nova" e já entra com bloqueio duro. */
export const HIGIENE_CORTE_ISO = '2026-07-17T00:00:00-03:00';
/** Dias de adaptação/mutirão para as conversas que já existiam antes do corte. */
export const HIGIENE_DIAS_ADAPTACAO = 7;
/** Adiamentos de nome permitidos por conversa antes de o preenchimento virar obrigatório. */
export const HIGIENE_MAX_ADIAMENTOS = 2;
/** Janela liberada quando o atendente marca "cliente ainda não informou". */
export const HIGIENE_HORAS_NAO_INFORMOU = 24;

/* ===================== Tipos ===================== */

/** livre = nada a mostrar · alerta = incomoda, deixa enviar · bloqueia = trava o envio. */
export type AcaoHigiene = 'livre' | 'alerta' | 'bloqueia';

export type MotivoNome = 'vazio' | 'numero' | 'placeholder' | 'incompleto' | 'comercio';

export interface AnaliseNome {
  /** o cadastro está ruim (mostra alerta) */
  fraco: boolean;
  /** o nome fraco pode chegar a BLOQUEAR o envio. Comércio nunca bloqueia — só alerta. */
  bloqueavel: boolean;
  motivo: MotivoNome | null;
  /** texto curto para a UI explicar o que está errado */
  rotulo: string;
}

/* ===================== Nome do cliente ===================== */

const RE_SO_NUMERO = /^[\d\s()+\-.]+$/;
const RE_PLACEHOLDER = /^(cliente|lead|contato|teste|test|sem nome|desconhecid[oa]|whatsapp|usu[áa]rio|n[ãa]o informado)\b/i;
/** pushName genérico que o WhatsApp entrega quando a pessoa não tem nome de perfil útil. */
const RE_PUSHNAME_GENERICO = /^(\.|-|_|\?|null|undefined|:\)|\p{Emoji_Presentation}+)$/iu;
/** Sinais de estabelecimento comercial — alerta suave: pode ser o nome real do cliente PJ. */
const RE_COMERCIO = /(\bloja\b|\bmercado\b|\bdoces\b|com[ée]rcio|\bltda\b|\bmei\b|\bme\b$|sal[ãa]o|oficina|padaria|\bauto\b|servi[çc]os|distribuidora|farm[áa]cia|borracharia|lanchonete|restaurante|barbearia|petshop|pet shop)/i;

/** Classifica o cadastro do nome. Puro: string/null/undefined seguros. */
export function analisarNome(nome: string | null | undefined): AnaliseNome {
  const n = (nome ?? '').trim();

  if (!n) return { fraco: true, bloqueavel: true, motivo: 'vazio', rotulo: 'Sem nome' };
  if (RE_PUSHNAME_GENERICO.test(n)) return { fraco: true, bloqueavel: true, motivo: 'placeholder', rotulo: 'Nome genérico' };
  if (RE_SO_NUMERO.test(n)) return { fraco: true, bloqueavel: true, motivo: 'numero', rotulo: 'Salvo como número' };
  if (RE_PLACEHOLDER.test(n)) return { fraco: true, bloqueavel: true, motivo: 'placeholder', rotulo: 'Nome genérico' };

  const palavras = n.split(/\s+/).filter((p) => p.length > 0);
  if (palavras.length < 2) return { fraco: true, bloqueavel: true, motivo: 'incompleto', rotulo: 'Só o primeiro nome' };

  // Nome completo, mas parece empresa: alerta SUAVE (pode ser o cadastro correto de um PJ).
  if (RE_COMERCIO.test(n)) return { fraco: true, bloqueavel: false, motivo: 'comercio', rotulo: 'Parece nome de comércio' };

  return { fraco: false, bloqueavel: false, motivo: null, rotulo: '' };
}

/** Atalho para badge/lista. */
export function nomeFraco(nome: string | null | undefined): boolean {
  return analisarNome(nome).fraco;
}

/* ===================== Conversa ativa ===================== */

/** O bloqueio só vale em conversa ATIVA. Fechada/arquivada nunca trava (decisão do dono). */
export function conversaAtiva(i: { status?: string | null; arquivada?: boolean | null }): boolean {
  if (i.arquivada) return false;
  const st = (i.status ?? '').trim().toLowerCase();
  // sem status conhecido tratamos como ativa (a lista real sempre traz status)
  if (!st) return true;
  return st === 'aberta' || st === 'em_atendimento' || st === 'pendente';
}

/* ===================== Regra 1 — responsável ===================== */

export interface EntradaDono {
  ativa: boolean;
  /** responsável efetivo já resolvido pelo fallback conversa → contato → oportunidade */
  temDono: boolean;
  /** conversas.criado_em (ISO). null/inválido = tratamos como ANTIGA (não trava quem não sabemos datar). */
  conversaCriadaEm?: string | null;
  agoraMs: number;
  corteISO?: string;
  diasAdaptacao?: number;
}

/** Conversa sem responsável: alerta forte sempre; bloqueio conforme a entrada progressiva. */
export function decidirDono(i: EntradaDono): AcaoHigiene {
  if (!i.ativa) return 'livre';
  if (i.temDono) return 'livre';

  const corte = new Date(i.corteISO ?? HIGIENE_CORTE_ISO).getTime();
  const dias = i.diasAdaptacao ?? HIGIENE_DIAS_ADAPTACAO;
  const fimAdaptacao = corte + dias * 86400000;

  const criadaMs = i.conversaCriadaEm ? new Date(i.conversaCriadaEm).getTime() : NaN;

  // Conversa NOVA (nasceu depois do corte): bloqueia desde o primeiro dia.
  if (!Number.isNaN(criadaMs) && criadaMs >= corte) return 'bloqueia';

  // Conversa ANTIGA (ou sem data confiável): alerta durante a adaptação, bloqueia depois.
  return i.agoraMs >= fimAdaptacao ? 'bloqueia' : 'alerta';
}

/* ===================== Regra 2 — nome (progressiva) ===================== */

export interface EntradaNome {
  ativa: boolean;
  nome: string | null | undefined;
  /** quantos 'nome_adiado' já foram registrados NESTA conversa (por qualquer atendente) */
  adiamentos: number;
  /** 'nome_nao_informado': até quando está liberado (ISO). null = não há liberação. */
  liberadoAte?: string | null;
  agoraMs: number;
  maxAdiamentos?: number;
}

export interface DecisaoNome {
  acao: AcaoHigiene;
  analise: AnaliseNome;
  /** ainda pode clicar em "Lembrar depois"? */
  podeAdiar: boolean;
  /** quantos adiamentos restam antes de virar obrigatório */
  adiamentosRestantes: number;
  /** está dentro da janela de "cliente ainda não informou" */
  liberado: boolean;
}

export function decidirNome(i: EntradaNome): DecisaoNome {
  const analise = analisarNome(i.nome);
  const max = i.maxAdiamentos ?? HIGIENE_MAX_ADIAMENTOS;
  const restantes = Math.max(0, max - Math.max(0, i.adiamentos));
  const liberadoMs = i.liberadoAte ? new Date(i.liberadoAte).getTime() : NaN;
  const liberado = !Number.isNaN(liberadoMs) && liberadoMs > i.agoraMs;

  const base: DecisaoNome = { acao: 'livre', analise, podeAdiar: false, adiamentosRestantes: restantes, liberado };

  if (!i.ativa || !analise.fraco) return base;

  // "cliente ainda não informou" libera a conversa pela janela combinada.
  if (liberado) return { ...base, acao: 'livre' };

  // Comércio nunca bloqueia — é só um aviso de que o cadastro pode ser PJ.
  if (!analise.bloqueavel) return { ...base, acao: 'alerta', podeAdiar: false };

  // Progressivo: 2 adiamentos permitidos; depois o preenchimento vira obrigatório.
  if (restantes > 0) return { ...base, acao: 'alerta', podeAdiar: true };
  return { ...base, acao: 'bloqueia', podeAdiar: false };
}

/* ===================== Composição ===================== */

export interface EstadoHigiene {
  dono: AcaoHigiene;
  nome: DecisaoNome;
  /** o envio pelo painel está travado? */
  bloqueiaEnvio: boolean;
  /** motivo do bloqueio, para placeholder/toast */
  motivoBloqueio: 'dono' | 'nome' | null;
}

/** O dono vem antes do nome: não faz sentido cobrar cadastro de quem nem assumiu a conversa. */
export function estadoHigiene(dono: AcaoHigiene, nome: DecisaoNome): EstadoHigiene {
  const bloqueiaDono = dono === 'bloqueia';
  const bloqueiaNome = nome.acao === 'bloqueia';
  return {
    dono,
    nome,
    bloqueiaEnvio: bloqueiaDono || bloqueiaNome,
    motivoBloqueio: bloqueiaDono ? 'dono' : (bloqueiaNome ? 'nome' : null),
  };
}

/** Texto do placeholder do compositor quando travado. */
export function textoBloqueio(e: EstadoHigiene): string | null {
  if (e.motivoBloqueio === 'dono') return 'Assuma o atendimento para responder';
  if (e.motivoBloqueio === 'nome') return 'Preencha o nome completo do cliente para responder';
  return null;
}
