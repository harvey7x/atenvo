import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useOrg } from '@/context/OrgContext';

/** Linha de contato como a UI (congelada) consome. */
export interface ContatoRow {
  id: string;
  nome: string;
  email: string;
  tel: string;
  org: string;
  resp: string;
  st: string;
  ult: string;
  tags: string[];
  /** campos extras (já existentes no schema) p/ modal/filtros/CSV. */
  cpf?: string;
  obs?: string;
  respId?: string | null;
  criadoEm?: string;
  atualizadoEm?: string;
}

export interface NovoContato {
  nome: string;
  telefone?: string;
  email?: string;
  origem?: string;
  cpf?: string;
  responsavelId?: string | null;
  etiquetas?: string[];
  observacoes?: string;
}

/** Normaliza telefone p/ dígitos (BR ganha DDI 55); '' quando vazio. */
export function normalizarTelefone(raw?: string | null): string {
  const d = (raw || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('55') && d.length >= 12) return d;
  if (d.length === 10 || d.length === 11) return '55' + d;
  return d;
}
/** Telefone válido = >= 10 dígitos. */
export function telefoneValido(raw?: string | null): boolean {
  return (raw || '').replace(/\D/g, '').length >= 10;
}
/** E-mail normalizado (trim + lowercase). */
export function normalizarEmail(raw?: string | null): string {
  return (raw || '').trim().toLowerCase();
}
/** Validação simples de e-mail. */
export function emailValido(raw?: string | null): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((raw || '').trim());
}

/* ===================== Modo MOCK (dev sem env) ===================== */
/* Mantém a página funcional sem backend. Em produção (env presente) NUNCA é usado. */
const MOCK_SEED: Omit<ContatoRow, 'tags'>[] = [
  { id: 'm1', nome: 'Ana Beatriz', email: 'ana.beatriz@email.com', tel: '(51) 99812-3344', org: 'WhatsApp', resp: 'Henrique', st: 'Cliente', ult: 'Há 2 horas' },
  { id: 'm2', nome: 'Carlos Mendes', email: 'carlos.mendes@email.com', tel: '(51) 99721-8890', org: 'Facebook', resp: 'Marina Lopes', st: 'Lead', ult: 'Há 5 horas' },
  { id: 'm3', nome: 'Fernanda Souza', email: 'fernanda.souza@email.com', tel: '(51) 99634-1122', org: 'Lead Ads', resp: 'Antônio César', st: 'Negociando', ult: 'Ontem' },
  { id: 'm4', nome: 'Roberto Lima', email: 'roberto.lima@email.com', tel: '(51) 99588-7766', org: 'Indicação', resp: 'Paula Ferreira', st: 'Cliente', ult: 'Há 3 dias' },
  { id: 'm5', nome: 'Juliana Castro', email: 'juliana.castro@email.com', tel: '(51) 99477-5544', org: 'WhatsApp', resp: 'Henrique', st: 'Lead', ult: 'Há 1 hora' },
  { id: 'm6', nome: 'Marcos Vinícius', email: 'marcos.v@email.com', tel: '(51) 99366-3322', org: 'Facebook', resp: 'Marina Lopes', st: 'Inativo', ult: '12/05/2024' },
  { id: 'm7', nome: 'Patrícia Gomes', email: 'patricia.gomes@email.com', tel: '(51) 99255-1100', org: 'WhatsApp', resp: 'Antônio César', st: 'Cliente', ult: 'Há 4 horas' },
  { id: 'm8', nome: 'Eduardo Ramos', email: 'eduardo.ramos@email.com', tel: '(51) 99144-9988', org: 'Lead Ads', resp: 'Paula Ferreira', st: 'Negociando', ult: 'Ontem' },
  { id: 'm9', nome: 'Camila Duarte', email: 'camila.duarte@email.com', tel: '(51) 99033-7755', org: 'Indicação', resp: 'Henrique', st: 'Lead', ult: 'Há 6 horas' },
  { id: 'm10', nome: 'Lucas Almeida', email: 'lucas.almeida@email.com', tel: '(51) 98922-5533', org: 'WhatsApp', resp: 'Marina Lopes', st: 'Cliente', ult: 'Há 2 dias' },
];
const MOCK_TAGS: Record<string, string[]> = {
  m1: ['Revisão de contrato'], m2: ['Juros abusivos'], m3: ['Documentação', 'Revisão de contrato'], m5: ['Juros abusivos'],
};
let mockStore: ContatoRow[] = MOCK_SEED.map((r) => ({ ...r, tags: MOCK_TAGS[r.id] ?? [] }));
const uid = () => (globalThis.crypto?.randomUUID?.() ?? 'm' + Math.random().toString(36).slice(2));

/* ===================== Mapeamento DB -> UI ===================== */
function statusFromEtiquetas(et: string[] | null | undefined): string {
  const tags = (et ?? []).map((t) => t.toLowerCase());
  if (tags.includes('cliente')) return 'Cliente';
  if (tags.includes('negociando')) return 'Negociando';
  if (tags.includes('inativo')) return 'Inativo';
  return 'Lead';
}
function fmtUlt(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso); const diff = Date.now() - d.getTime(); const h = Math.floor(diff / 3.6e6);
  if (h < 1) return 'Há instantes';
  if (h < 24) return `Há ${h} hora${h === 1 ? '' : 's'}`;
  const dias = Math.floor(h / 24);
  if (dias === 1) return 'Ontem';
  if (dias < 7) return `Há ${dias} dias`;
  return d.toLocaleDateString('pt-BR');
}
interface DbContato {
  id: string; nome: string; email: string | null; telefone: string | null; cpf: string | null;
  origem: string | null; etiquetas: string[] | null; observacoes: string | null;
  responsavel_id: string | null; criado_em: string | null; atualizado_em: string | null;
  responsavel: { nome: string } | { nome: string }[] | null;
}
function mapRow(c: DbContato): ContatoRow {
  return {
    id: c.id,
    nome: c.nome,
    email: c.email ?? '',
    tel: c.telefone ?? '',
    org: c.origem ?? '—',
    resp: (Array.isArray(c.responsavel) ? c.responsavel[0]?.nome : c.responsavel?.nome) ?? '—',
    st: statusFromEtiquetas(c.etiquetas),
    ult: fmtUlt(c.atualizado_em),
    tags: c.etiquetas ?? [],
    cpf: c.cpf ?? '',
    obs: c.observacoes ?? '',
    respId: c.responsavel_id ?? null,
    criadoEm: c.criado_em ?? '',
    atualizadoEm: c.atualizado_em ?? '',
  };
}

/* ===================== Hooks ===================== */
export function useContatos() {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: ['contatos', currentOrg.id],
    queryFn: async (): Promise<ContatoRow[]> => {
      if (!isSupabaseConfigured || !supabase) return [...mockStore];
      // RLS ja restringe ao org do usuario; o organizacao_id NUNCA vem do cliente para leitura
      const { data, error } = await supabase
        .from('contatos')
        .select('id, nome, email, telefone, cpf, origem, etiquetas, observacoes, responsavel_id, criado_em, atualizado_em, responsavel:usuarios(nome)')
        .eq('organizacao_id', currentOrg.id)
        .is('mesclado_em', null) // oculta contatos absorvidos por merge (soft-merge)
        .order('atualizado_em', { ascending: false });
      if (error) throw new Error(error.message);
      return ((data as unknown as DbContato[]) ?? []).map(mapRow);
    },
  });
}

/** Busca contatos da org por nome/e-mail/telefone (autocomplete). Limite 12; só com termo >= 2. */
export function useBuscaContatos(term: string) {
  const { currentOrg } = useOrg();
  const t = (term || '').trim();
  return useQuery({
    queryKey: ['busca-contatos', currentOrg.id, t],
    enabled: isSupabaseConfigured && !!supabase && t.length >= 2,
    queryFn: async (): Promise<ContatoRow[]> => {
      const safe = t.replace(/[,()%*]/g, ' ').trim();
      const dig = t.replace(/\D/g, '');
      const ors = [`nome.ilike.%${safe}%`, `email.ilike.%${safe}%`];
      if (dig.length >= 3) ors.push(`telefone.ilike.%${dig}%`);
      const { data, error } = await supabase!
        .from('contatos')
        .select('id, nome, email, telefone, cpf, origem, etiquetas, observacoes, responsavel_id, criado_em, atualizado_em, responsavel:usuarios(nome)')
        .eq('organizacao_id', currentOrg.id)
        .is('mesclado_em', null) // oculta contatos absorvidos por merge (soft-merge)
        .or(ors.join(','))
        .order('atualizado_em', { ascending: false })
        .limit(12);
      if (error) throw new Error(error.message);
      return ((data as unknown as DbContato[]) ?? []).map(mapRow);
    },
  });
}

export function useCreateContato() {
  const qc = useQueryClient();
  const { currentOrg } = useOrg();
  return useMutation({
    mutationFn: async (input: NovoContato) => {
      if (!isSupabaseConfigured || !supabase) {
        mockStore = [{ id: uid(), nome: input.nome, email: input.email ?? '', tel: input.telefone ?? '', org: input.origem ?? 'WhatsApp', resp: '—', st: 'Lead', ult: 'Agora', tags: [] }, ...mockStore];
        return;
      }
      // organizacao_id = org atual (validado no backend por RLS/trigger). NUNCA vem do formulário.
      const { error } = await supabase.from('contatos').insert({
        nome: input.nome,
        telefone: input.telefone ?? null,
        email: input.email ?? null,
        cpf: input.cpf ?? null,
        origem: input.origem ?? null,
        responsavel_id: input.responsavelId ?? null,
        observacoes: input.observacoes ?? null,
        etiquetas: input.etiquetas ?? [],
        organizacao_id: currentOrg.id,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contatos', currentOrg.id] }),
  });
}

export function useUpdateContato() {
  const qc = useQueryClient();
  const { currentOrg } = useOrg();
  return useMutation({
    mutationFn: async (input: { id: string; nome?: string; telefone?: string | null; email?: string | null; cpf?: string | null; origem?: string | null; responsavelId?: string | null; etiquetas?: string[]; observacoes?: string | null }) => {
      if (!isSupabaseConfigured || !supabase) {
        mockStore = mockStore.map((r) => r.id === input.id ? { ...r, ...(input.nome != null ? { nome: input.nome } : {}), ...(input.telefone != null ? { tel: input.telefone } : {}), ...(input.email != null ? { email: input.email } : {}), ...(input.etiquetas ? { tags: input.etiquetas } : {}) } : r);
        return;
      }
      const patch: Record<string, unknown> = {};
      if (input.nome != null) patch.nome = input.nome;
      if (input.telefone !== undefined) patch.telefone = input.telefone;
      if (input.email !== undefined) patch.email = input.email;
      if (input.cpf !== undefined) patch.cpf = input.cpf;
      if (input.origem !== undefined) patch.origem = input.origem;
      if (input.responsavelId !== undefined) patch.responsavel_id = input.responsavelId;
      if (input.etiquetas !== undefined) patch.etiquetas = input.etiquetas;
      if (input.observacoes !== undefined) patch.observacoes = input.observacoes;
      const { error } = await supabase.from('contatos').update(patch).eq('id', input.id).eq('organizacao_id', currentOrg.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contatos', currentOrg.id] }),
  });
}

export function useDeleteContato() {
  const qc = useQueryClient();
  const { currentOrg } = useOrg();
  const key = ['contatos', currentOrg.id];
  return useMutation({
    mutationFn: async (id: string) => {
      if (!isSupabaseConfigured || !supabase) { mockStore = mockStore.filter((r) => r.id !== id); return; }
      const { error } = await supabase.from('contatos').delete().eq('id', id).eq('organizacao_id', currentOrg.id);
      if (error) throw new Error(error.message);
    },
    // atualizacao otimista (segura: remocao)
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<ContatoRow[]>(key);
      qc.setQueryData<ContatoRow[]>(key, (old) => (old ?? []).filter((r) => r.id !== id));
      return { prev };
    },
    onError: (_e, _id, ctx) => { if (ctx?.prev) qc.setQueryData(key, ctx.prev); },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}
