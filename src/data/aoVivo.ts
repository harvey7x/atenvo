import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useOrg } from '@/context/OrgContext';
import { MSG_ABA_NAO_LIGADA } from '@/data/dashboardV5';

/* ------------------------------------------------------------------
   AO VIVO no Dashboard (dono 25/11, do sistema que a Reviza usava antes: "Dashboard › Ao vivo —
   as conversas abertas, por usuário"). Um quadro com uma coluna por atendente (ou por equipe, ou por
   etiqueta) e um cartão por conversa aberta: o cliente, a última mensagem, por qual número, quando,
   se ele está esperando resposta e se a IA está atendendo. Rotina dash_ao_vivo (migration 98), só o
   administrador; atualiza sozinha a cada 30 segundos. Cada conversa vem com os ids do número, do
   atendente e da equipe e os nomes vêm uma vez só nas listas (a resposta fica menor).
   DEMO É O CONTRATO: sem backend o mesmo hook devolve a fixture abaixo, com os mesmos tipos.
   ------------------------------------------------------------------ */

export const AO_VIVO_REAL: boolean = isSupabaseConfigured && !!supabase;
/** de quanto em quanto tempo o quadro se atualiza sozinho */
export const AO_VIVO_INTERVALO_MS = 30_000;

export type ModoAoVivo = 'atendentes' | 'equipes' | 'etiquetas';

export interface ConversaAoVivo {
  id: string;
  contatoId: string | null;
  contato: string;
  fotoUrl: string | null;
  /** o texto da última mensagem, já limpo (sem o carimbo de assinatura), numa linha; vazio em mídia sem legenda */
  ultimaMsg: string;
  ultimaTipo: string | null;
  ultimaDirecao: 'entrada' | 'saida' | null;
  ultimaEm: string | null;
  canalId: string | null;
  atendenteId: string | null;
  equipeId: string | null;
  etiquetas: string[];
  iaAtiva: boolean;
  /** a última mensagem é do cliente: ninguém respondeu depois, nem a IA */
  esperando: boolean;
  naoLidas: number;
}
export interface PessoaAoVivo { id: string; nome: string; papel: string; ativo: boolean }
export interface CanalAoVivo { id: string; nome: string | null; numero: string | null }
export interface EquipeAoVivo { id: string; nome: string }
export interface EtiquetaAoVivo { nome: string; cor: string | null }
export interface DashAoVivo {
  conversas: ConversaAoVivo[];
  /** quantas conversas abertas existem ao todo (o quadro traz no máximo `limite`) */
  total: number;
  limite: number;
  atendentes: PessoaAoVivo[];
  canais: CanalAoVivo[];
  equipes: EquipeAoVivo[];
  etiquetas: EtiquetaAoVivo[];
  geradoEm: string;
}

/* ---------------- contas da tela (puras, testadas) ---------------- */
const MIDIA: Record<string, string> = { audio: '[áudio]', imagem: '[foto]', video: '[vídeo]', documento: '[documento]' };
/** carimbo de assinatura do começo da mensagem ("*Ana – REVIZA:*"; nas primeiras horas, "*👤 Ana | REVIZA:*") */
const CARIMBO = /^\*(?:👤 [^*\n]{1,80}|[^*\n]{1,60} – [^*\n]{1,60}):\*\s*/;
/** a linha do cartão: o texto; mídia vira "[áudio]", "[foto]"… (com a legenda junto, se tiver) */
export function previewAoVivo(texto: string | null | undefined, tipo: string | null | undefined): string {
  const t = (texto ?? '').replace(CARIMBO, '').replace(/\s+/g, ' ').trim();
  const rot = tipo ? MIDIA[tipo] : undefined;
  if (rot) return t ? `${rot} ${t}` : rot;
  return t;
}

/** o número da conversa: o apelido do número, ou "final 0101" (os 4 últimos dígitos) */
export function rotuloCanal(c: Pick<CanalAoVivo, 'nome' | 'numero'> | null | undefined): string {
  const nome = (c?.nome ?? '').trim();
  if (nome) return nome;
  const dig = (c?.numero ?? '').replace(/\D/g, '');
  return dig.length >= 4 ? `final ${dig.slice(-4)}` : 'WhatsApp';
}

const TZ = 'America/Sao_Paulo';
const diaSP = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const SEMANA = ['dom.', 'seg.', 'ter.', 'qua.', 'qui.', 'sex.', 'sáb.'];
/** quando foi a última mensagem, curto como no WhatsApp: "10:08" (hoje), "Ontem", "seg." (nesta semana), "12/11", "30/12/25" */
export function quandoAoVivo(iso: string | null | undefined, agora: Date = new Date()): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  const dia = diaSP(d), hoje = diaSP(agora);
  if (dia >= hoje) return d.toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
  const dif = Math.round((Date.parse(`${hoje}T12:00:00Z`) - Date.parse(`${dia}T12:00:00Z`)) / 86_400_000);
  if (dif === 1) return 'Ontem';
  if (dif < 7) return SEMANA[new Date(`${dia}T12:00:00Z`).getUTCDay()];
  const dm = `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
  return dia.slice(0, 4) === hoje.slice(0, 4) ? dm : `${dm}/${dia.slice(2, 4)}`;
}

/** para a busca: sem acento e sem maiúscula ("Conceição" acha "conceicao") */
export const semAcento = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
export const primeiroNome = (s: string | null | undefined): string => (s ?? '').trim().split(/\s+/)[0] ?? '';

export interface ColunaAoVivo {
  chave: string;
  titulo: string;
  /** a coluna "Sem atendente" / "Sem equipe" / "Sem etiqueta" */
  sem: boolean;
  /** a cor da etiqueta (só no modo etiquetas) */
  cor: string | null;
  conversas: ConversaAoVivo[];
  esperando: number;
}
export interface FiltroAoVivo { soEsperando?: boolean; busca?: string }

const porMaisRecente = (a: ConversaAoVivo, b: ConversaAoVivo) => (b.ultimaEm ?? '').localeCompare(a.ultimaEm ?? '') || a.id.localeCompare(b.id);
const porNome = (a: { titulo: string }, b: { titulo: string }) => a.titulo.localeCompare(b.titulo, 'pt-BR', { sensitivity: 'base' });

/** As colunas do quadro. A ORDEM É FIXA entre uma atualização e outra (as colunas não pulam de lugar a cada
 *  30 s): atendentes em ordem alfabética com "Sem atendente" na frente (é quem precisa de alguém); equipes em
 *  ordem alfabética com "Sem equipe" no fim; etiquetas na ordem das Configurações com "Sem etiqueta" no fim.
 *  Atendente ativo e equipe sem nenhuma conversa aparecem com zero (é informação); etiqueta sem conversa não.
 *  Com busca, só as colunas que acharam alguém. Uma conversa com duas etiquetas aparece nas duas colunas. */
export function agruparAoVivo(d: DashAoVivo, modo: ModoAoVivo, f: FiltroAoVivo = {}): ColunaAoVivo[] {
  const termo = semAcento(f.busca ?? '');
  const passa = (c: ConversaAoVivo) => (!f.soEsperando || c.esperando) && (!termo || semAcento(c.contato).includes(termo));
  const lista = d.conversas.filter(passa);
  const grupos = new Map<string, ConversaAoVivo[]>();
  const por = (k: string, c: ConversaAoVivo) => { const g = grupos.get(k); if (g) g.push(c); else grupos.set(k, [c]); };
  const col = (chave: string, titulo: string, sem: boolean, cor: string | null = null): ColunaAoVivo => {
    const cs = (grupos.get(chave) ?? []).sort(porMaisRecente);
    return { chave, titulo, sem, cor, conversas: cs, esperando: cs.filter((c) => c.esperando).length };
  };
  let colunas: ColunaAoVivo[];
  if (modo === 'atendentes') {
    for (const c of lista) por(c.atendenteId ?? '', c);
    const pessoas = new Map(d.atendentes.map((p) => [p.id, p]));
    const ids = new Set<string>([...grupos.keys()].filter(Boolean));
    // atendente ativo sem conversa aparece com zero; o administrador só quando tem conversa
    for (const p of d.atendentes) if (p.ativo && p.papel !== 'admin') ids.add(p.id);
    const gente = [...ids].map((id) => col(id, pessoas.get(id)?.nome?.trim() || 'Atendente', false)).sort(porNome);
    colunas = [col('', 'Sem atendente', true), ...gente];
  } else if (modo === 'equipes') {
    const conhecidas = new Set(d.equipes.map((e) => e.id));
    for (const c of lista) por(c.equipeId && conhecidas.has(c.equipeId) ? c.equipeId : '', c);
    const eqs = d.equipes.map((e) => col(e.id, e.nome, false)).sort(porNome);
    const sem = col('', 'Sem equipe', true);
    colunas = sem.conversas.length || !eqs.length ? [...eqs, sem] : eqs;
  } else {
    for (const c of lista) { if (!c.etiquetas.length) por('', c); else for (const e of new Set(c.etiquetas)) por('e:' + e, c); }
    const catalogo = d.etiquetas.map((e) => e.nome);
    const fora = [...grupos.keys()].filter((k) => k && !catalogo.includes(k.slice(2))).map((k) => k.slice(2)).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const cores = new Map(d.etiquetas.map((e) => [e.nome, e.cor]));
    colunas = [...catalogo, ...fora].filter((nome) => grupos.has('e:' + nome)).map((nome) => col('e:' + nome, nome, false, cores.get(nome) ?? null));
    const sem = col('', 'Sem etiqueta', true);
    if (sem.conversas.length || !colunas.length) colunas.push(sem);
  }
  return termo ? colunas.filter((c) => c.conversas.length > 0) : colunas;
}

export function resumoAoVivo(d: DashAoVivo): { abertas: number; esperando: number; comIa: number } {
  let esperando = 0, comIa = 0;
  for (const c of d.conversas) { if (c.esperando) esperando++; if (c.iaAtiva) comIa++; }
  return { abertas: d.total, esperando, comIa };
}

/* ---------------- normalização defensiva (jsonb → tipos) ---------------- */
type B = Record<string, unknown>;
const o = (v: unknown): B => (v && typeof v === 'object' && !Array.isArray(v) ? (v as B) : {});
const a = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const n = (v: unknown): number => { const x = typeof v === 'number' ? v : Number(v); return Number.isFinite(x) ? x : 0; };
const t = (v: unknown, p = ''): string => (typeof v === 'string' ? v : v == null ? p : String(v));
const tn = (v: unknown): string | null => { const s = t(v).trim(); return s ? s : null; };
const sim = (v: unknown): boolean => v === true || v === 'true' || v === 1;
export function normalizarDashAoVivo(v: unknown): DashAoVivo {
  const r = o(v);
  const canais = new Map<string, CanalAoVivo>();
  for (const x of a(r.canais)) { const c = o(x); const id = tn(c.id); if (id) canais.set(id, { id, nome: tn(c.nome), numero: tn(c.numero) }); }
  const atendentes = new Map<string, PessoaAoVivo>();
  for (const x of a(r.atendentes)) { const p = o(x); const id = tn(p.id); if (id) atendentes.set(id, { id, nome: t(p.nome, 'Atendente').trim() || 'Atendente', papel: t(p.papel, 'atendente'), ativo: p.ativo == null ? true : sim(p.ativo) }); }
  const equipes = new Map<string, EquipeAoVivo>();
  for (const x of a(r.equipes)) { const e = o(x); const id = tn(e.id); if (id) equipes.set(id, { id, nome: t(e.nome, 'Equipe').trim() || 'Equipe' }); }
  const conversas: ConversaAoVivo[] = [];
  const vistas = new Set<string>();
  for (const x of a(r.conversas)) {
    const c = o(x); const id = tn(c.id);
    if (!id || vistas.has(id)) continue;
    vistas.add(id);
    // o nome também pode vir junto da conversa (formato antigo): entra nas listas
    const canal = o(c.canal);
    const canalId = tn(c.canal_id) ?? tn(canal.id);
    if (canalId && !canais.has(canalId)) canais.set(canalId, { id: canalId, nome: tn(canal.nome), numero: tn(canal.numero) });
    const atendenteId = tn(c.atendente_id);
    if (atendenteId && !atendentes.has(atendenteId)) atendentes.set(atendenteId, { id: atendenteId, nome: tn(c.atendente) ?? 'Atendente', papel: 'atendente', ativo: false });
    const equipeId = tn(c.equipe_id);
    if (equipeId && !equipes.has(equipeId) && tn(c.equipe)) equipes.set(equipeId, { id: equipeId, nome: t(c.equipe) });
    const dir = t(c.ultima_direcao);
    const etqs = [...new Set(a(c.etiquetas).map((e) => t(e).trim()).filter(Boolean))];
    conversas.push({
      id, contatoId: tn(c.contato_id), contato: tn(c.contato) ?? 'Sem nome', fotoUrl: tn(c.foto_url),
      ultimaMsg: t(c.ultima_msg), ultimaTipo: tn(c.ultima_tipo),
      ultimaDirecao: dir === 'entrada' || dir === 'saida' ? dir : null, ultimaEm: tn(c.ultima_em),
      canalId, atendenteId, equipeId, etiquetas: etqs,
      iaAtiva: sim(c.ia_ativa), esperando: c.esperando == null ? dir === 'entrada' : sim(c.esperando), naoLidas: n(c.nao_lidas),
    });
  }
  return {
    conversas,
    total: Math.max(n(r.total), conversas.length),
    limite: n(r.limite) || 2000,
    atendentes: [...atendentes.values()],
    canais: [...canais.values()],
    equipes: [...equipes.values()],
    etiquetas: a(r.etiquetas).map((x) => { const e = o(x); return { nome: t(e.nome).trim(), cor: tn(e.cor) }; }).filter((e) => e.nome),
    geradoEm: tn(r.gerado_em) ?? new Date().toISOString(),
  };
}

/** Erro da rotina em português (nunca SQL cru na tela). */
export function traduzErroAoVivo(e: unknown): string {
  const m = (e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e ?? '')).toLowerCase();
  const codigo = typeof e === 'object' && e && 'code' in e ? String((e as { code: unknown }).code) : '';
  if (codigo === 'PGRST202' || m.includes('could not find the function')) return MSG_ABA_NAO_LIGADA;
  if (codigo === '57014' || m.includes('statement timeout') || m.includes('canceling statement')) return 'A consulta demorou demais. Tente de novo em instantes.';
  if (m.includes('sem_permissao')) return 'Só o administrador vê as conversas ao vivo.';
  if (m.includes('org_indefinida')) return 'Não foi possível identificar a sua empresa.';
  if (m.includes('fetch') || m.includes('network')) return 'Sem conexão com o servidor. Verifique a internet e tente de novo.';
  return 'Não foi possível carregar as conversas agora.';
}

/* ---------------- demonstração (pessoas e conversas inventadas, nada de cliente) ---------------- */
const EQUIPE_DEMO = ['Alexandra', 'Guilherme', 'Raissa', 'Felipe', 'Emillyn', 'Juliano', 'Rafael'];
const EQUIPES_DEMO = [
  { id: 'demo-eq-vendas', nome: 'Vendas', pessoas: ['Alexandra', 'Guilherme', 'Raissa'] },
  { id: 'demo-eq-revisao', nome: 'Revisão de contratos', pessoas: ['Felipe', 'Emillyn'] },
  { id: 'demo-eq-pos', nome: 'Pós-venda', pessoas: ['Juliano', 'Rafael'] },
];
const CANAIS_DEMO: CanalAoVivo[] = [
  { id: 'demo-canal-1', nome: 'PRINCIPAL', numero: '5551999990101' },
  { id: 'demo-canal-2', nome: 'CAMPANHA', numero: '5551999990202' },
  { id: 'demo-canal-3', nome: null, numero: '5551999990303' },
];
const ETIQUETAS_DEMO: EtiquetaAoVivo[] = [
  { nome: 'Juros abusivos', cor: '#e11d48' },
  { nome: 'Empréstimo', cor: '#3b82f6' },
  { nome: 'Documentos pendentes', cor: '#f59e0b' },
  { nome: 'Aposentado INSS', cor: '#8b5cf6' },
  { nome: 'Retornar ligação', cor: '#19C37D' },
];
/* as primeiras são as conversas de exemplo do WhatsApp da prévia: clicar no cartão abre a conversa */
const DO_WHATSAPP: [string, string][] = [
  ['wa-maria', 'Maria Aparecida Souza'], ['wa-jose', 'José Carlos Ferreira'], ['wa-ivone', 'Ivone Castro dos Santos'],
  ['wa-antonio', 'Antônio Pereira Lima'], ['wa-terezinha', 'Terezinha M. Alves'], ['wa-sebastiao', 'Sebastião R. Nunes'],
  ['wa-odete', 'Odete F. Carvalho'], ['wa-pedro', 'Pedro Henrique Dias'], ['wa-neusa', 'Neusa Trindade'],
  ['wa-joaob', 'João Batista Ramos'], ['wa-cleusa', 'Cleusa M. Barros'],
];
const PRIMEIROS = ['Iracema', 'Valdir', 'Cleonice', 'Arlindo', 'Jurema', 'Osvaldo', 'Dalva', 'Ernesto', 'Zilda', 'Lourival', 'Marlene', 'Aparício',
  'Rubens', 'Celina', 'Nair', 'Benedito', 'Conceição', 'Waldemar', 'Lindalva', 'Geraldo', 'Rosângela', 'Adão', 'Terezinha', 'Josefa', 'Otávio', 'Diva'];
const SOBRENOMES = ['Silveira', 'Machado', 'Rodrigues', 'Paim', 'Fagundes', 'Lemos', 'Correa', 'Bittencourt', 'Azevedo', 'Gomes', 'Kunz', 'Duarte', 'Nogueira', 'Hoffmann', 'Pacheco', 'Vargas'];
const DO_CLIENTE: [string, string][] = [
  ['texto', 'Bom dia, recebi a mensagem de vocês sobre o empréstimo'], ['texto', 'Quanto fica a parcela?'], ['texto', 'Ainda não recebi o contrato'],
  ['texto', 'Pode me ligar depois das 14h?'], ['texto', 'Sou aposentada pelo INSS, por idade'], ['texto', 'Qual o valor que eu consigo pegar?'],
  ['texto', 'Tá bom, vou ver com o meu filho e te aviso'], ['texto', 'Oi, tudo bem? Quero saber da revisão dos juros'], ['texto', 'Obrigada pela atenção'],
  ['audio', ''], ['audio', ''], ['imagem', ''], ['imagem', 'segue o extrato do banco'], ['documento', ''],
  ['texto', 'O banco descontou duas vezes este mês'], ['texto', 'Vocês atendem no sábado?'],
];
const NOSSAS: string[] = [
  '*Raissa – REVIZA:* Bom dia! Já estou verificando o seu contrato.', 'Consegue me mandar uma foto do documento com o CPF?',
  'Perfeito, recebi. Vou analisar e te retorno ainda hoje.', 'A simulação ficou em 84 parcelas de R$ 312,40.', 'Fico à disposição!',
  'Vou te ligar em 10 minutos, pode ser?', 'O contrato foi enviado para o seu WhatsApp, é só assinar pelo link.',
];
const DA_IA: string[] = [
  'Olá! Sou a Iris, atendente virtual da Reviza. Para começar, qual o seu nome completo?',
  'Obrigada! Você recebe benefício do INSS? Aposentadoria ou pensão?', 'Recebi o seu extrato. Agora preciso de uma foto do documento com CPF.',
];
function rnd(seed: number) { let s = seed; return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }; }
/** a hora em que a prévia abriu: as conversas de exemplo envelhecem com o relógio, como as de verdade */
const ANCORA = Date.now();
export function demoAoVivo(agora: number = Date.now(), ancora: number = ANCORA): DashAoVivo {
  const r = rnd(2511);
  const pega = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const atendentes: PessoaAoVivo[] = [
    { id: 'demo-admin', nome: 'Administrador', papel: 'admin', ativo: true },
    ...EQUIPE_DEMO.map((nome) => ({ id: 'demo-at-' + nome.toLowerCase(), nome, papel: 'atendente', ativo: true })),
  ];
  const peso = [1.6, 1.2, 1.4, 0.9, 1.1, 0.7, 1.0]; // quem tem mais conversa abertas
  const somaPeso = peso.reduce((s, x) => s + x, 0);
  const quem = (): string | null => {
    if (r() < 0.14) return null; // sem atendente: chegou e ninguém assumiu
    let x = r() * somaPeso;
    for (let i = 0; i < peso.length; i++) { x -= peso[i]; if (x <= 0) return atendentes[i + 1].id; }
    return atendentes[1].id;
  };
  const equipeDe = (id: string | null, canal: string): string | null => {
    const nome = atendentes.find((p) => p.id === id)?.nome;
    const eq = EQUIPES_DEMO.find((e) => nome && e.pessoas.includes(nome));
    if (eq) return eq.id;
    return canal === 'demo-canal-2' ? 'demo-eq-vendas' : null; // o número da campanha é da equipe de vendas
  };
  const conversas: ConversaAoVivo[] = [];
  const N = 168;
  for (let i = 0; i < N; i++) {
    const [id, contato] = i < DO_WHATSAPP.length ? DO_WHATSAPP[i]
      : [`demo-av-${i}`, `${PRIMEIROS[(i * 7) % PRIMEIROS.length]} ${SOBRENOMES[(i * 5 + Math.floor(i / PRIMEIROS.length)) % SOBRENOMES.length]}`];
    // a maioria mexeu nas últimas horas; algumas estão paradas há dias
    const min = r() < 0.72 ? Math.floor(r() * r() * 9 * 60) + 1 : Math.floor(60 * 24 * (1 + r() * 9));
    const em = ancora - min * 60_000;
    const atendenteId = quem();
    const canal = pega(CANAIS_DEMO).id;
    const ia = atendenteId === null ? r() < 0.55 : r() < 0.12;
    const esperando = r() < (atendenteId === null ? 0.6 : 0.34);
    let ultimaTipo = 'texto', ultimaMsg = '';
    if (esperando) { const [tp, tx] = pega(DO_CLIENTE); ultimaTipo = tp; ultimaMsg = tx; }
    else ultimaMsg = ia ? pega(DA_IA) : pega(NOSSAS);
    const etiquetas = r() < 0.3 ? [] : [...new Set([pega(ETIQUETAS_DEMO).nome, ...(r() < 0.25 ? [pega(ETIQUETAS_DEMO).nome] : [])])];
    conversas.push({
      id, contatoId: `${id}-ct`, contato, fotoUrl: null,
      ultimaMsg: previewAoVivo(ultimaMsg, null), ultimaTipo, ultimaDirecao: esperando ? 'entrada' : 'saida', ultimaEm: new Date(em).toISOString(),
      canalId: canal, atendenteId, equipeId: equipeDe(atendenteId, canal), etiquetas, iaAtiva: ia, esperando,
      naoLidas: esperando ? 1 + Math.floor(r() * 3) : 0,
    });
  }
  // "ao vivo" também na prévia: a cada 30 s um cliente manda mensagem nova e vai para o topo da coluna
  const rodadas = Math.min(40, Math.max(0, Math.floor((agora - ancora) / AO_VIVO_INTERVALO_MS)));
  for (let k = 1; k <= rodadas; k++) {
    const c = conversas[(k * 37) % N];
    const [tp, tx] = DO_CLIENTE[(k * 5) % DO_CLIENTE.length];
    Object.assign(c, { ultimaTipo: tp, ultimaMsg: tx, ultimaDirecao: 'entrada', esperando: true, ultimaEm: new Date(ancora + k * AO_VIVO_INTERVALO_MS).toISOString(), naoLidas: c.naoLidas + 1 });
  }
  conversas.sort((x, y) => (y.ultimaEm ?? '').localeCompare(x.ultimaEm ?? ''));
  return {
    conversas, total: conversas.length, limite: 2000, atendentes, canais: CANAIS_DEMO,
    equipes: EQUIPES_DEMO.map(({ id, nome }) => ({ id, nome })), etiquetas: ETIQUETAS_DEMO,
    geradoEm: new Date(agora).toISOString(),
  };
}

/* ---------------- a aba do Dashboard ---------------- */
export function useDashAoVivo(ativo: boolean) {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: ['dash-ao-vivo', currentOrg.id],
    enabled: ativo,
    staleTime: AO_VIVO_INTERVALO_MS - 5_000,
    // atualiza sozinho com a aba aberta (o react-query pausa com a janela escondida)
    refetchInterval: ativo ? AO_VIVO_INTERVALO_MS : false,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<DashAoVivo> => {
      if (!AO_VIVO_REAL) { await new Promise((ok) => setTimeout(ok, 300)); return demoAoVivo(); }
      const { data, error } = await supabase!.rpc('dash_ao_vivo', {});
      if (error) throw new Error(traduzErroAoVivo(error));
      return normalizarDashAoVivo(data);
    },
  });
}
