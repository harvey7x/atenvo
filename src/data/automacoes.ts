import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useOrg } from '@/context/OrgContext';

/* ------------------------------------------------------------------
   AUTOMAÇÕES › SEQUÊNCIAS e › AUTOMAÇÃO POR PALAVRAS (26/11, "igual" ao sistema que a Reviza usava antes).
   Sequência: um modelo de mensagens em série, com a espera antes de cada uma; a pessoa aplica na conversa (⋯ da conversa
   no WhatsApp) e cada passo vira uma mensagem agendada (o envio de sempre, com as travas do número). "Parar se o cliente
   responder" cancela o resto quando ele escreve. Não começa sozinha.
   Palavras: quando o cliente (ou a equipe) escreve uma palavra-chave, o card vai sozinho para a etapa escolhida.
   Servidor: migration 116 (recurso 'automacoes'). DEMO É O CONTRATO: sem backend, os mesmos hooks no navegador.
   ------------------------------------------------------------------ */

export const AUTO_REAL: boolean = isSupabaseConfigured && !!supabase;

export type TipoPasso = 'texto' | 'imagem' | 'audio' | 'video' | 'documento';
export interface Passo { tipo: TipoPasso; texto: string; esperaMin: number; storagePath?: string; mime?: string; nome?: string; tamanho?: number; anexoRotulo?: string }
export interface Sequencia { id: string; nome: string; categoria: string | null; descricao: string | null; passos: Passo[]; pararSeResponder: boolean; ativo: boolean }
export type ModoPalavra = 'contem' | 'exato' | 'comeca' | 'termina' | 'regex';
export interface Palavra { texto: string; modo: ModoPalavra }
export interface RegraPalavras {
  id: string; nome: string; descricao: string | null; palavras: Palavra[]; ignorar: string[]; operador: 'ou' | 'e';
  onde: 'ultima' | 'ultimas' | 'conversa'; ultimasN: number; quem: 'todas' | 'lead' | 'equipe'; colunaId: string | null; ativo: boolean; ordem: number;
}
export interface HistoricoAutomacoes {
  regras: { quando: string; regra: string; de: string | null; para: string | null; palavra: string | null; conversaId: string | null; contato: string }[];
  sequencias: { nome: string; aplicadas: number; enviadas: number; agendadas: number; paradas: number; falharam: number }[];
}
export interface AnexoScript { id: string; rotulo: string; tipo: TipoPasso; storagePath: string; mime: string; nome: string; tamanho: number | null }

export const MODOS_PALAVRA: { valor: ModoPalavra; rotulo: string; dica: string }[] = [
  { valor: 'contem', rotulo: 'Contém', dica: 'A palavra aparece em qualquer lugar' },
  { valor: 'exato', rotulo: 'Exato', dica: 'A mensagem é exatamente igual' },
  { valor: 'comeca', rotulo: 'Começa com', dica: 'A mensagem começa com o texto' },
  { valor: 'termina', rotulo: 'Termina com', dica: 'A mensagem termina com o texto' },
  { valor: 'regex', rotulo: 'Regex', dica: 'Expressão regular (avançado)' },
];
export const ESPERAS_PASSO = [
  { valor: 0, rotulo: 'Na hora' }, { valor: 5, rotulo: '5 min' }, { valor: 30, rotulo: '30 min' }, { valor: 60, rotulo: '1 hora' },
  { valor: 180, rotulo: '3 horas' }, { valor: 360, rotulo: '6 horas' }, { valor: 1440, rotulo: '1 dia' }, { valor: 2880, rotulo: '2 dias' }, { valor: 10080, rotulo: '7 dias' },
];
export function fmtEspera(min: number): string {
  if (min <= 0) return 'na hora';
  if (min < 60) return `${min} min`;
  if (min < 1440) { const h = Math.floor(min / 60), r = min % 60; return r ? `${h} h ${r} min` : `${h} h`; }
  const d = Math.floor(min / 1440), r = min % 1440; return r ? `${d} ${d === 1 ? 'dia' : 'dias'} e ${fmtEspera(r)}` : `${d} ${d === 1 ? 'dia' : 'dias'}`;
}
/** quando cada passo sai, a partir do início (o servidor faz a mesma conta: no mínimo 1 minuto entre dois passos) */
export function horariosDaSequencia(passos: Passo[], inicio: Date): Date[] {
  let t = inicio.getTime();
  return passos.map((p, i) => { if (i > 0) t += Math.max(p.esperaMin || 1, 1) * 60_000; return new Date(t); });
}
export function validarSequencia(s: Pick<Sequencia, 'nome' | 'passos'>, outras: Sequencia[], id?: string): string | null {
  if (!s.nome.trim()) return 'Dê um nome à sequência.';
  if (s.nome.trim().length > 80) return 'O nome vai até 80 letras.';
  if (outras.some((o) => o.id !== id && o.nome.trim().toLowerCase() === s.nome.trim().toLowerCase())) return 'Já existe uma sequência com esse nome.';
  if (s.passos.length === 0) return 'Ponha ao menos uma mensagem.';
  if (s.passos.length > 20) return 'A sequência vai até 20 mensagens.';
  const n = s.passos.findIndex((p) => (p.tipo === 'texto' ? !p.texto.trim() : !p.storagePath));
  if (n >= 0) return `A mensagem ${n + 1} está vazia.`;
  return null;
}
/** confere a regra e diz, para um texto de exemplo, se ela casa (a tela de "Testar a regra") */
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export function casa(texto: string, p: Palavra): boolean {
  const t = semAcento(texto).trim(), w = semAcento(p.texto.trim());
  if (!w) return false;
  switch (p.modo) {
    case 'exato': return t === w;
    case 'comeca': return t.startsWith(w);
    case 'termina': return t.endsWith(w);
    case 'regex': try { return new RegExp(p.texto, 'i').test(texto); } catch { return false; }
    default: return t.includes(w);
  }
}
export function testarRegra(r: Pick<RegraPalavras, 'palavras' | 'ignorar' | 'operador'>, texto: string): { casou: boolean; palavra: string | null; ignorada: string | null } {
  const ign = r.ignorar.find((x) => x.trim() && semAcento(texto).includes(semAcento(x.trim()))) ?? null;
  if (ign) return { casou: false, palavra: null, ignorada: ign };
  const hits = r.palavras.filter((p) => casa(texto, p));
  const casou = r.operador === 'e' ? hits.length === r.palavras.length && hits.length > 0 : hits.length > 0;
  return { casou, palavra: hits[0]?.texto ?? null, ignorada: null };
}
export function validarRegra(r: Pick<RegraPalavras, 'nome' | 'palavras' | 'colunaId'>): string | null {
  if (!r.nome.trim()) return 'Dê um nome à regra.';
  if (r.palavras.length === 0) return 'Ponha ao menos uma palavra ou frase.';
  const ruim = r.palavras.find((p) => p.modo === 'regex' && (() => { try { new RegExp(p.texto); return false; } catch { return true; } })());
  if (ruim) return `A expressão "${ruim.texto}" não é válida.`;
  if (!r.colunaId) return 'Escolha para qual etapa o card vai.';
  return null;
}

/* ---------------- demonstração ---------------- */
const G_S = 'previa-sequencias', G_R = 'previa-regras-palavras', G_H = 'previa-automacoes-hist';
const ler = <T,>(k: string, p: T): T => { try { const v = JSON.parse(localStorage.getItem(k) ?? 'null'); return v ?? p; } catch { return p; } };
const gravar = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* aba privada */ } };
const espera = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
const hAtras = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const SEQ_DEMO: Sequencia[] = [
  { id: 'sq-docs', nome: 'Lembrar os documentos', categoria: 'Documentos', descricao: 'Para quem parou no meio da documentação', pararSeResponder: true, ativo: true, passos: [
    { tipo: 'texto', texto: 'Oi! Tudo bem? Conseguiu baixar o histórico de empréstimo no Meu INSS?', esperaMin: 0 },
    { tipo: 'texto', texto: 'Se ficar difícil, posso te mandar o passo a passo, ou um atendente te liga para ajudar.', esperaMin: 180 },
    { tipo: 'texto', texto: 'Fico no aguardo para começarmos a revisão dos juros do seu empréstimo. 😊', esperaMin: 1440 },
  ] },
  { id: 'sq-extrato', nome: 'Extrato do banco', categoria: 'Bancos', descricao: null, pararSeResponder: true, ativo: true, passos: [
    { tipo: 'texto', texto: 'Para começar a revisão, preciso do extrato do seu empréstimo. Te mando o passo a passo aqui 😊', esperaMin: 0 },
    { tipo: 'documento', texto: '', esperaMin: 1, storagePath: 'demo/passo-a-passo.pdf', mime: 'application/pdf', nome: 'Passo a passo do extrato.pdf', anexoRotulo: 'Passo a passo do extrato.pdf · Script "Extrato BMG"' },
  ] },
];
const DEMO_ETAPA_DOC = 'et-2';
const REGRAS_DEMO: RegraPalavras[] = [
  { id: 'rp-doc', nome: 'Mandou documento', descricao: 'Quando o cliente diz que mandou o documento', palavras: [{ texto: 'documento', modo: 'contem' }, { texto: 'RG', modo: 'exato' }], ignorar: ['ainda não', 'depois'], operador: 'ou', onde: 'ultima', ultimasN: 5, quem: 'lead', colunaId: DEMO_ETAPA_DOC, ativo: true, ordem: 0 },
];
const HIST_DEMO: HistoricoAutomacoes = {
  regras: [
    { quando: hAtras(0.6), regra: 'Mandou documento', de: 'ATENDIMENTO IA', para: 'DOCUMENTAÇÃO', palavra: 'documento', conversaId: 'wa-maria', contato: 'Maria Aparecida Souza' },
    { quando: hAtras(5), regra: 'Mandou documento', de: 'LEAD NOVO', para: 'DOCUMENTAÇÃO', palavra: 'RG', conversaId: 'wa-jose', contato: 'José Carlos Ferreira' },
  ],
  sequencias: [{ nome: 'Lembrar os documentos', aplicadas: 6, enviadas: 11, agendadas: 3, paradas: 4, falharam: 0 }],
};
const C_S = 'atd-sequencias', C_R = 'atd-regras-palavras', C_H = 'atd-automacoes-hist';

const dePasso = (p: Record<string, unknown>): Passo => ({
  tipo: (p.tipo as TipoPasso) ?? 'texto', texto: String(p.texto ?? ''), esperaMin: Number(p.espera_min) || 0,
  storagePath: (p.storage_path as string) || undefined, mime: (p.mime as string) || undefined, nome: (p.nome as string) || undefined,
  tamanho: p.tamanho == null ? undefined : Number(p.tamanho), anexoRotulo: (p.anexo_rotulo as string) || undefined,
});
const paraPasso = (p: Passo, i: number) => ({
  tipo: p.tipo, texto: p.texto.trim(), espera_min: i === 0 ? 0 : Math.max(0, Math.round(p.esperaMin)),
  ...(p.tipo !== 'texto' ? { storage_path: p.storagePath, mime: p.mime, nome: p.nome, tamanho: p.tamanho ?? null, anexo_rotulo: p.anexoRotulo ?? null } : {}),
});

export function useSequencias() {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: [C_S, currentOrg.id],
    enabled: !!currentOrg.id,
    queryFn: async (): Promise<Sequencia[]> => {
      if (!AUTO_REAL) { await espera(120); return ler(G_S, SEQ_DEMO); }
      const { data, error } = await supabase!.from('atd_sequencias').select('id, nome, categoria, descricao, passos, parar_se_responder, ativo').eq('organizacao_id', currentOrg.id).order('categoria', { nullsFirst: true }).order('nome');
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => ({ id: String(r.id), nome: String(r.nome), categoria: (r.categoria as string) ?? null, descricao: (r.descricao as string) ?? null,
        passos: (Array.isArray(r.passos) ? r.passos : []).map((p) => dePasso(p as Record<string, unknown>)), pararSeResponder: r.parar_se_responder !== false, ativo: r.ativo !== false }));
    },
  });
}

export function useSalvarSequencia() {
  const { currentOrg } = useOrg();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (s: Omit<Sequencia, 'id'> & { id?: string }) => {
      const linha = { nome: s.nome.trim(), categoria: s.categoria?.trim() || null, descricao: s.descricao?.trim() || null, passos: s.passos.map(paraPasso), parar_se_responder: s.pararSeResponder, ativo: s.ativo };
      if (!AUTO_REAL) {
        await espera(150); const l = ler(G_S, SEQ_DEMO);
        const nova: Sequencia = { id: s.id ?? `sq-${Date.now()}`, nome: linha.nome, categoria: linha.categoria, descricao: linha.descricao, passos: s.passos.map((p, i) => ({ ...p, esperaMin: i === 0 ? 0 : p.esperaMin })), pararSeResponder: s.pararSeResponder, ativo: s.ativo };
        gravar(G_S, s.id ? l.map((x) => (x.id === s.id ? nova : x)) : [...l, nova]); return;
      }
      const { error } = s.id ? await supabase!.from('atd_sequencias').update(linha).eq('id', s.id) : await supabase!.from('atd_sequencias').insert({ ...linha, organizacao_id: currentOrg.id });
      if (error) throw new Error(/atd_seq_nome_uniq|duplicate/i.test(error.message) ? 'Já existe uma sequência com esse nome.' : /passo_midia/.test(error.message) ? 'Uma mídia não é desta empresa.' : /row-level|permission/i.test(error.message) ? 'Só o administrador ou o supervisor muda as sequências.' : error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [C_S] }),
  });
}

export function useApagarSequencia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!AUTO_REAL) { gravar(G_S, ler(G_S, SEQ_DEMO).filter((x) => x.id !== id)); return; }
      const { error } = await supabase!.from('atd_sequencias').delete().eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [C_S] }),
  });
}

const ERROS_APLICAR: Record<string, string> = {
  sequencia_ja_rodando: 'Esta sequência já está rodando nesta conversa.', contato_sem_telefone: 'O cliente não tem telefone.',
  canal_desconectado: 'O número de WhatsApp desta conversa está desconectado.', canal_restrito: 'O número desta conversa está com restrição de envio.',
  canal_inativo: 'O número desta conversa está desligado.', canal_em_conflito: 'O número desta conversa está em conflito.', sequencia_desligada: 'Esta sequência está desligada.',
  sem_acesso: 'Você não pode mexer nesta conversa.',
};
export function useAplicarSequencia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { sequenciaId: string; conversaId: string; canalId: string; inicio: string | null }): Promise<number> => {
      if (!AUTO_REAL) { await espera(400); const s = ler(G_S, SEQ_DEMO).find((x) => x.id === v.sequenciaId); return s?.passos.length ?? 0; }
      const { data, error } = await supabase!.rpc('atd_aplicar_sequencia', { p_modelo: v.sequenciaId, p_conversa: v.conversaId, p_canal: v.canalId, p_inicio: v.inicio });
      if (error) { const k = Object.keys(ERROS_APLICAR).find((c) => error.message.includes(c)); throw new Error(k ? ERROS_APLICAR[k] : error.message); }
      return Number(data) || 0;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['mensagens-agendadas'] }); qc.invalidateQueries({ queryKey: ['mensagens-agendadas-org'] }); qc.invalidateQueries({ queryKey: [C_H] }); },
  });
}

/** os anexos dos Scripts (para um passo de mídia: o mesmo arquivo que a equipe já manda) */
export function useAnexosDosScripts() {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: ['anexos-scripts', currentOrg.id],
    enabled: !!currentOrg.id,
    staleTime: 60_000,
    queryFn: async (): Promise<AnexoScript[]> => {
      if (!AUTO_REAL) return [
        { id: 'ax-1', rotulo: 'Passo a passo do extrato.pdf · Script "Extrato BMG"', tipo: 'documento', storagePath: 'demo/passo-a-passo.pdf', mime: 'application/pdf', nome: 'Passo a passo do extrato.pdf', tamanho: 210_000 },
        { id: 'ax-2', rotulo: 'Explicação dos juros (áudio) · Script "Juros"', tipo: 'audio', storagePath: 'demo/juros.ogg', mime: 'audio/ogg', nome: 'juros.ogg', tamanho: 90_000 },
      ];
      const { data, error } = await supabase!.from('script_anexos').select('id, tipo, nome_arquivo, mime_type, tamanho_bytes, storage_path, scripts!inner(titulo, organizacao_id)').eq('scripts.organizacao_id', currentOrg.id).limit(200);
      if (error) throw new Error(error.message);
      type R = { id: string; tipo: string; nome_arquivo: string | null; mime_type: string | null; tamanho_bytes: number | null; storage_path: string | null; scripts: { titulo: string } | { titulo: string }[] | null };
      return ((data as unknown as R[]) ?? []).filter((r) => r.storage_path).map((r) => {
        const s = Array.isArray(r.scripts) ? r.scripts[0] : r.scripts;
        const tipo = (['imagem', 'audio', 'video', 'documento'].includes(r.tipo) ? r.tipo : 'documento') as TipoPasso;
        return { id: r.id, rotulo: `${r.nome_arquivo ?? 'arquivo'} · Script "${s?.titulo ?? ''}"`, tipo, storagePath: r.storage_path!, mime: r.mime_type ?? '', nome: r.nome_arquivo ?? 'arquivo', tamanho: r.tamanho_bytes };
      });
    },
  });
}

/* ---------------- regras por palavra ---------------- */
export function useRegrasPalavras() {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: [C_R, currentOrg.id],
    enabled: !!currentOrg.id,
    queryFn: async (): Promise<RegraPalavras[]> => {
      if (!AUTO_REAL) { await espera(120); return ler(G_R, REGRAS_DEMO); }
      const { data, error } = await supabase!.from('atd_regras_palavras').select('id, nome, descricao, palavras, ignorar, operador, onde, ultimas_n, quem, coluna_id, ativo, ordem').eq('organizacao_id', currentOrg.id).order('ordem').order('criado_em');
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => ({
        id: String(r.id), nome: String(r.nome), descricao: (r.descricao as string) ?? null,
        palavras: (Array.isArray(r.palavras) ? r.palavras : []).map((p) => ({ texto: String((p as Record<string, unknown>).texto ?? ''), modo: ((p as Record<string, unknown>).modo as ModoPalavra) ?? 'contem' })),
        ignorar: Array.isArray(r.ignorar) ? (r.ignorar as string[]) : [], operador: r.operador === 'e' ? 'e' : 'ou', onde: (r.onde as RegraPalavras['onde']) ?? 'ultima',
        ultimasN: Number(r.ultimas_n) || 5, quem: (r.quem as RegraPalavras['quem']) ?? 'lead', colunaId: (r.coluna_id as string) ?? null, ativo: r.ativo !== false, ordem: Number(r.ordem) || 0,
      }));
    },
  });
}

export function useSalvarRegra() {
  const { currentOrg } = useOrg();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (r: Omit<RegraPalavras, 'id'> & { id?: string }) => {
      const linha = { nome: r.nome.trim(), descricao: r.descricao?.trim() || null, palavras: r.palavras.map((p) => ({ texto: p.texto.trim(), modo: p.modo })), ignorar: r.ignorar, operador: r.operador, onde: r.onde, ultimas_n: r.ultimasN, quem: r.quem, coluna_id: r.colunaId, ativo: r.ativo, ordem: r.ordem };
      if (!AUTO_REAL) { await espera(150); const l = ler(G_R, REGRAS_DEMO); const nova = { ...r, id: r.id ?? `rp-${Date.now()}` } as RegraPalavras; gravar(G_R, r.id ? l.map((x) => (x.id === r.id ? nova : x)) : [...l, nova]); return; }
      const { error } = r.id ? await supabase!.from('atd_regras_palavras').update(linha).eq('id', r.id) : await supabase!.from('atd_regras_palavras').insert({ ...linha, organizacao_id: currentOrg.id });
      if (error) throw new Error(/etapa_de_perda/.test(error.message) ? 'A regra não leva para uma etapa de perda: a perda pede o motivo, que só uma pessoa dá.' : /regex_invalida/.test(error.message) ? 'A expressão regular não é válida.' : error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [C_R] }),
  });
}

export function useApagarRegra() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!AUTO_REAL) { gravar(G_R, ler(G_R, REGRAS_DEMO).filter((x) => x.id !== id)); return; }
      const { error } = await supabase!.from('atd_regras_palavras').delete().eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [C_R] }),
  });
}

export function useHistoricoAutomacoes(dias: number) {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: [C_H, currentOrg.id, dias],
    enabled: !!currentOrg.id,
    queryFn: async (): Promise<HistoricoAutomacoes> => {
      if (!AUTO_REAL) { await espera(120); return ler(G_H, HIST_DEMO); }
      const { data, error } = await supabase!.rpc('atd_automacoes_historico', { p_dias: dias });
      if (error) throw new Error(/sem_permissao/.test(error.message) ? 'Só o administrador vê o histórico.' : error.message);
      const j = (data ?? {}) as Record<string, unknown>;
      const arr = (v: unknown) => (Array.isArray(v) ? v as Record<string, unknown>[] : []);
      return {
        regras: arr(j.regras).map((x) => ({ quando: String(x.quando), regra: String(x.regra), de: (x.de as string) ?? null, para: (x.para as string) ?? null, palavra: (x.palavra as string) ?? null, conversaId: (x.conversa_id as string) ?? null, contato: String(x.contato ?? '') })),
        sequencias: arr(j.sequencias).map((x) => ({ nome: String(x.nome ?? 'Sequência'), aplicadas: Number(x.aplicadas) || 0, enviadas: Number(x.enviadas) || 0, agendadas: Number(x.agendadas) || 0, paradas: Number(x.paradas) || 0, falharam: Number(x.falharam) || 0 })),
      };
    },
  });
}
