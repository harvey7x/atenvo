/* NOTA INTERNA COM @ NA CONVERSA (dono 25/11, a partir do sistema que a Reviza usava antes).
   No WhatsApp do cliente, o atendente troca o compositor de "Mensagem" para "Nota interna" e escreve um recado PARA A
   EQUIPE: a nota aparece no fio da conversa só para a equipe e NUNCA é enviada ao cliente. "@Nome" marca um colega,
   que recebe um aviso com o link da conversa.

   Servidor (migration 99): a nota é uma linha de `mensagens` com tipo 'nota_interna', gravada SÓ pela rotina
   atd_nota_criar — nunca pelo envio (evolution-send). A rotina confere se a pessoa enxerga a conversa, o tamanho
   (1 a 4000 caracteres) e mantém só as marcações de gente ATIVA da mesma empresa.

   Demonstração (prévia): a nota fica na conversa aberta enquanto a tela estiver aberta (`useNotasLocais`). No sistema
   de verdade a mesma lista local mostra a nota na hora, até o histórico do servidor trazê-la (mesmo id).

   Aqui também moram as partes puras (testadas em notasInternas.test.ts): achar o @ que está sendo digitado, filtrar a
   equipe, inserir "@Nome", saber quem continua marcado e destacar as marcações no texto. */
import { useSyncExternalStore } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useOrg } from '@/context/OrgContext';
import type { WaMessage } from './whatsappDemo';

export const NOTA_MAX = 4000;
/** quantas pessoas a lista do @ mostra de uma vez */
export const MENCAO_LISTA_MAX = 6;

export interface Membro { id: string; nome: string }

/** a equipe da demonstração (o sistema de verdade usa as pessoas ativas da empresa) */
export const EQUIPE_DEMO_NOTAS: Membro[] = [
  { id: 'u-alessandra', nome: 'Alessandra' },
  { id: 'u-bianca', nome: 'Bianca' },
  { id: 'u-carla', nome: 'Carla' },
  { id: 'u-eduardo', nome: 'Eduardo' },
  { id: 'u-paty', nome: 'Paty' },
];

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const escaparRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** depois do nome não pode vir letra nem número ("@Ana" não marca a "Anabela") */
const FIM_DO_NOME = '(?![\\p{L}\\p{N}])';

/** O @ que a pessoa está digitando agora: do @ até o cursor, sem espaço no meio. O @ precisa estar no começo
    do texto ou depois de espaço/parêntese (um e-mail como "ana@x.com" não abre a lista). */
export function mencaoEmCurso(texto: string, cursor: number): { inicio: number; termo: string } | null {
  const antes = texto.slice(0, Math.max(0, Math.min(cursor, texto.length)));
  const m = /(^|[\s(])@([^\s@]{0,30})$/u.exec(antes);
  if (!m) return null;
  return { inicio: antes.length - m[2].length - 1, termo: m[2] };
}

/** Quem aparece na lista do @: nome que começa com o termo primeiro, depois um sobrenome que começa com ele, depois
    quem só contém. Sem diferença de maiúscula nem acento ("joa" acha "João"). */
export function filtrarMembros(membros: readonly Membro[], termo: string, limite = MENCAO_LISTA_MAX): Membro[] {
  const t = semAcento(termo.trim());
  const nota = (nome: string) => {
    if (!t) return 1;
    const n = semAcento(nome);
    if (n.startsWith(t)) return 3;
    if (n.split(/\s+/).some((p) => p.startsWith(t))) return 2;
    return n.includes(t) ? 1 : 0;
  };
  return membros
    .map((m) => ({ m, p: nota(m.nome) }))
    .filter((x) => x.p > 0)
    .sort((a, b) => b.p - a.p || a.m.nome.localeCompare(b.m.nome, 'pt-BR'))
    .slice(0, limite)
    .map((x) => x.m);
}

/** Troca o "@termo" (de `inicio` até o fim da palavra) por "@Nome " e devolve onde o cursor fica. */
export function inserirMencao(texto: string, inicio: number, cursor: number, nome: string): { texto: string; cursor: number } {
  const antes = texto.slice(0, inicio);
  const depois = texto.slice(cursor).replace(/^[^\s@]*/, '');   // o resto da palavra que estava sendo digitada
  const inserido = '@' + nome.trim() + ' ';
  return { texto: antes + inserido + depois.replace(/^ /, ''), cursor: (antes + inserido).length };
}

/** "@Nome" está no texto? */
export function temMencao(texto: string, nome: string): boolean {
  const n = nome.trim();
  return !!n && new RegExp('@' + escaparRe(n) + FIM_DO_NOME, 'iu').test(texto);
}

/** Quem continua marcado: escolhido na lista E o "@Nome" ainda está no texto (apagou, desmarcou). Sem repetir. */
export function mencoesDoTexto(texto: string, escolhidos: readonly Membro[]): string[] {
  const ids: string[] = [];
  for (const m of escolhidos) if (!ids.includes(m.id) && temMencao(texto, m.nome)) ids.push(m.id);
  return ids;
}

/** O texto da nota em pedaços, com as marcações separadas (a tela as mostra em negrito). Nome mais longo primeiro:
    "@Ana Paula" ganha de "@Ana". */
export function partesDaNota(texto: string, nomes: readonly string[]): { t: string; mencao: boolean }[] {
  const validos = [...new Set(nomes.map((n) => n.trim()).filter(Boolean))].sort((a, b) => b.length - a.length);
  if (!texto) return [];
  if (!validos.length) return [{ t: texto, mencao: false }];
  const re = new RegExp('@(?:' + validos.map(escaparRe).join('|') + ')' + FIM_DO_NOME, 'giu');
  const out: { t: string; mencao: boolean }[] = [];
  let i = 0;
  for (const m of texto.matchAll(re)) {
    const ini = m.index ?? 0;
    if (ini > i) out.push({ t: texto.slice(i, ini), mencao: false });
    out.push({ t: m[0], mencao: true });
    i = ini + m[0].length;
  }
  if (i < texto.length) out.push({ t: texto.slice(i), mencao: false });
  return out;
}

/** null = pode salvar; senão, o motivo em palavras simples */
export function validarNota(texto: string): string | null {
  const t = texto.trim();
  if (!t) return 'Escreva a nota antes de salvar.';
  if (t.length > NOTA_MAX) return `A nota passou do limite de ${NOTA_MAX.toLocaleString('pt-BR')} letras. Divida em duas.`;
  return null;
}

/** erro do servidor → frase para quem atende */
export function traduzErroNota(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('sem_permissao')) return 'Você não tem acesso a esta conversa, então não dá para deixar nota nela.';
  if (m.includes('nota_vazia')) return 'Escreva a nota antes de salvar.';
  if (m.includes('nota_longa')) return `A nota passou do limite de ${NOTA_MAX.toLocaleString('pt-BR')} letras. Divida em duas.`;
  if (m.includes('conversa_nao_encontrada')) return 'Esta conversa não foi encontrada. Atualize a página.';
  if (m.includes('nao_autenticado')) return 'Sua sessão terminou. Entre de novo para salvar a nota.';
  if (m.includes('atd_nota_criar') || m.includes('could not find the function')) return 'A nota interna ainda não foi ligada no servidor.';
  return 'Não foi possível salvar a nota. Tente de novo.';
}

/** Lista "Fulano", "Fulano e Beltrano", "Fulano, Beltrano e Ciclano" */
export function juntarNomes(nomes: readonly string[]): string {
  if (nomes.length <= 1) return nomes[0] ?? '';
  return nomes.slice(0, -1).join(', ') + ' e ' + nomes[nomes.length - 1];
}

/** A nota pronta para o fio (a mesma forma que o histórico do servidor produz em mapMensagens). */
export function notaParaOFio(p: { id: string; texto: string; autorNome: string; mencionados: readonly Membro[]; em?: Date }): WaMessage {
  const em = p.em ?? new Date();
  const hh = ('0' + em.getHours()).slice(-2) + ':' + ('0' + em.getMinutes()).slice(-2);
  return {
    id: p.id, dir: 'out', tipo: 'nota_interna', text: p.texto, time: hh, status: 'enviada',
    tsISO: em.toISOString(), dataISO: em.toISOString().slice(0, 10),
    nota: { autorNome: p.autorNome, mencoesNomes: p.mencionados.map((m) => m.nome), automatica: false },
  };
}

const tsDe = (m: WaMessage) => { const t = m.tsISO ? Date.parse(m.tsISO) : NaN; return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY; };
/** Junta as notas locais ao fio: some a local que o servidor já trouxe (mesmo id); o resto entra na ordem do horário. */
export function mesclarNotas(msgs: WaMessage[], locais: readonly WaMessage[]): WaMessage[] {
  if (!locais.length) return msgs;
  const ids = new Set(msgs.map((m) => m.id).filter(Boolean));
  const novas = locais.filter((n) => !ids.has(n.id));
  if (!novas.length) return msgs;
  return [...msgs, ...novas].sort((a, b) => tsDe(a) - tsDe(b));   // sort estável: o que tem o mesmo horário fica como estava
}

/* ---------- notas locais da tela (demonstração e "aparece na hora" do sistema de verdade) ---------- */
const NENHUMA: WaMessage[] = [];
const locais = new Map<string, WaMessage[]>();
const ouvintes = new Set<() => void>();
function guardarNotaLocal(conversaId: string, nota: WaMessage) {
  locais.set(conversaId, [...(locais.get(conversaId) ?? []), nota]);
  ouvintes.forEach((f) => f());
}
const assinar = (f: () => void) => { ouvintes.add(f); return () => { ouvintes.delete(f); }; };
/** as notas desta tela ainda não vistas no histórico do servidor (ou, na demonstração, todas as escritas aqui) */
export function useNotasLocais(conversaId: string | null | undefined): WaMessage[] {
  return useSyncExternalStore(assinar, () => (conversaId ? locais.get(conversaId) ?? NENHUMA : NENHUMA), () => NENHUMA);
}

const NOTA_REAL = isSupabaseConfigured && !!supabase;

export interface CriarNotaInput {
  conversaId: string;
  texto: string;
  /** quem foi escolhido na lista do @ (só fica marcado quem ainda está com "@Nome" no texto) */
  escolhidos: readonly Membro[];
  /** nome de quem escreve, para a nota aparecer na hora */
  autorNome: string;
}
export interface CriarNotaResultado { id: string; marcados: Membro[] }

/** Salvar a nota interna. NUNCA passa pelo envio de mensagem: é a rotina atd_nota_criar (ou, na demonstração, só a tela). */
export function useCriarNota() {
  const { currentOrg } = useOrg();
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['nota-criar'],
    networkMode: 'always',   // como o envio: não fica "pausada" quando o navegador acha que caiu a rede
    mutationFn: async (input: CriarNotaInput): Promise<CriarNotaResultado> => {
      const erro = validarNota(input.texto);
      if (erro) throw new Error(erro);
      const texto = input.texto.trim();
      const ids = mencoesDoTexto(texto, input.escolhidos);
      const marcados = ids.map((id) => input.escolhidos.find((m) => m.id === id)!).filter(Boolean);
      let id: string;
      if (NOTA_REAL) {
        const { data, error } = await supabase!.rpc('atd_nota_criar', { p_conversa: input.conversaId, p_texto: texto, p_mencoes: ids });
        if (error) throw new Error(traduzErroNota(error.message));
        id = String(data);
      } else {
        id = 'nota-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
      }
      guardarNotaLocal(input.conversaId, notaParaOFio({ id, texto, autorNome: input.autorNome, mencionados: marcados }));
      return { id, marcados };
    },
    // o histórico da conversa traz a nota do servidor (com os nomes que o servidor manteve) e a local sai
    onSuccess: (_r, input) => { if (NOTA_REAL) void qc.invalidateQueries({ queryKey: ['wa-msgs', currentOrg.id, input.conversaId] }); },
  });
}
