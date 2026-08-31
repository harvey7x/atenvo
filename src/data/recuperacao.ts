/* Recuperação (remarketing enxuto) — camada de dados.
   Sequências de mensagens pré-programadas por atendente + iniciar/parar a
   recuperação de um lead da coluna "Remarketing". Envio reusa o agendamento
   (mensagens_agendadas) que já manda texto/imagem/áudio pelo número da conversa. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useOrg } from '@/context/OrgContext';
import { subirMidiaWa } from '@/data/whatsapp';

export const RECUP_REAL = isSupabaseConfigured && !!supabase;

export type TipoToque = 'texto' | 'imagem' | 'audio';
export interface Toque {
  tipo: TipoToque;
  texto?: string;
  storage_path?: string;
  mime?: string;
  nome?: string;
  tamanho?: number;
  origem_audio?: string;
  intervalo_horas: number;   // espera ANTES deste toque (1º normalmente 0 = sai logo)
}
export interface Sequencia { id: string; atendenteId: string; nome: string; toques: Toque[]; criadoEm: string }
export interface RecupLead {
  oportunidadeId: string; contatoId: string; contatoNome: string | null; contatoTelefone: string | null;
  responsavelId: string | null; responsavelNome: string | null; colunaNome: string | null; criadoEm: string;
  execucaoId: string | null; execucaoStatus: string | null; sequenciaNome: string | null;
  toqueTotal: number | null; iniciadaEm: string | null;
}
export interface RecupDashboard { na_coluna: number; em_recuperacao: number; recuperados: number; concluidas: number }

type Row = Record<string, unknown>;

/* ---------------- sequências ---------------- */
export function useSequencias() {
  const { currentOrg } = useOrg();
  const org = currentOrg?.id;
  return useQuery({
    queryKey: ['recup-seqs', org], enabled: RECUP_REAL && !!org,
    queryFn: async (): Promise<Sequencia[]> => {
      const { data, error } = await supabase!.from('recuperacao_sequencias')
        .select('id, atendente_id, nome, toques, criado_em')
        .eq('organizacao_id', org!).eq('ativo', true).order('criado_em', { ascending: false });
      if (error) throw new Error(error.message);
      return ((data as Row[]) || []).map((r) => ({
        id: r.id as string, atendenteId: r.atendente_id as string, nome: (r.nome as string) || 'Sequência',
        toques: (Array.isArray(r.toques) ? r.toques : []) as Toque[], criadoEm: (r.criado_em as string) || '',
      }));
    },
  });
}
export function useSalvarSequencia() {
  const qc = useQueryClient(); const { currentOrg } = useOrg();
  return useMutation({
    mutationFn: async (p: { id: string | null; nome: string; toques: Toque[] }): Promise<string> => {
      const { data, error } = await supabase!.rpc('recuperacao_sequencia_salvar', { p_id: p.id, p_nome: p.nome, p_toques: p.toques });
      if (error) throw new Error(error.message);
      return (data as Row).id as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recup-seqs', currentOrg?.id] }),
  });
}
export function useExcluirSequencia() {
  const qc = useQueryClient(); const { currentOrg } = useOrg();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase!.rpc('recuperacao_sequencia_excluir', { p_id: id });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recup-seqs', currentOrg?.id] }),
  });
}

/* ---------------- leads + execuções ---------------- */
export function useRecupLeads() {
  const { currentOrg } = useOrg();
  const org = currentOrg?.id;
  return useQuery({
    queryKey: ['recup-leads', org], enabled: RECUP_REAL && !!org, refetchInterval: 15000,
    queryFn: async (): Promise<RecupLead[]> => {
      const { data, error } = await supabase!.rpc('recuperacao_leads', { p_org: org });
      if (error) throw new Error(error.message);
      return ((data as Row[]) || []).map((r) => ({
        oportunidadeId: r.oportunidade_id as string, contatoId: r.contato_id as string,
        contatoNome: (r.contato_nome as string) ?? null, contatoTelefone: (r.contato_telefone as string) ?? null,
        responsavelId: (r.responsavel_id as string) ?? null, responsavelNome: (r.responsavel_nome as string) ?? null,
        colunaNome: (r.coluna_nome as string) ?? null, criadoEm: (r.criado_em as string) || '',
        execucaoId: (r.execucao_id as string) ?? null, execucaoStatus: (r.execucao_status as string) ?? null,
        sequenciaNome: (r.sequencia_nome as string) ?? null, toqueTotal: (r.toque_total as number) ?? null,
        iniciadaEm: (r.iniciada_em as string) ?? null,
      }));
    },
  });
}
export function useIniciarRecuperacao() {
  const qc = useQueryClient(); const { currentOrg } = useOrg();
  return useMutation({
    mutationFn: async (p: { oportunidadeId: string; sequenciaId: string }) => {
      const { error } = await supabase!.rpc('recuperacao_iniciar', { p_oportunidade: p.oportunidadeId, p_sequencia: p.sequenciaId });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['recup-leads', currentOrg?.id] }); qc.invalidateQueries({ queryKey: ['recup-dash', currentOrg?.id] }); },
  });
}
export function usePararRecuperacao() {
  const qc = useQueryClient(); const { currentOrg } = useOrg();
  return useMutation({
    mutationFn: async (execucaoId: string) => {
      const { error } = await supabase!.rpc('recuperacao_parar', { p_execucao: execucaoId, p_motivo: 'parada' });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['recup-leads', currentOrg?.id] }); qc.invalidateQueries({ queryKey: ['recup-dash', currentOrg?.id] }); },
  });
}
export function useRecupDashboard() {
  const { currentOrg } = useOrg();
  const org = currentOrg?.id;
  return useQuery({
    queryKey: ['recup-dash', org], enabled: RECUP_REAL && !!org, refetchInterval: 15000,
    queryFn: async (): Promise<RecupDashboard> => {
      const { data, error } = await supabase!.rpc('recuperacao_dashboard', { p_org: org });
      if (error) throw new Error(error.message);
      const d = (data as RecupDashboard) || { na_coluna: 0, em_recuperacao: 0, recuperados: 0, concluidas: 0 };
      return { na_coluna: d.na_coluna ?? 0, em_recuperacao: d.em_recuperacao ?? 0, recuperados: d.recuperados ?? 0, concluidas: d.concluidas ?? 0 };
    },
  });
}

/** sobe uma mídia (imagem/áudio) pro bucket de saída e devolve os campos do toque */
export async function subirMidiaToque(orgId: string, file: File): Promise<Pick<Toque, 'storage_path' | 'mime' | 'nome' | 'tamanho'>> {
  const up = await subirMidiaWa(orgId, file);
  return { storage_path: up.path, mime: up.mime, nome: up.nome, tamanho: up.tamanho };
}

/* ---------------- mock (demo) ---------------- */
export const MOCK_SEQS: Sequencia[] = [
  { id: 'seq-demo-1', atendenteId: 'me', nome: 'Recuperação padrão', criadoEm: '2026-08-31T12:00:00Z',
    toques: [
      { tipo: 'texto', texto: 'Oi {primeiro_nome}! Vi que a gente conversou e ficou pela metade. Ainda posso te ajudar? 🙂', intervalo_horas: 0 },
      { tipo: 'audio', storage_path: 'demo/wa-midia/audio.ogg', mime: 'audio/ogg', nome: 'audio.ogg', tamanho: 24000, origem_audio: 'gravacao_painel', intervalo_horas: 24 },
      { tipo: 'texto', texto: 'Qualquer coisa é só me chamar por aqui, tá? Fico à disposição.', intervalo_horas: 48 },
    ] },
];
export const MOCK_LEADS: RecupLead[] = [
  { oportunidadeId: 'opp-1', contatoId: 'c1', contatoNome: 'MARIA APARECIDA SOUZA', contatoTelefone: '5551999990001', responsavelId: 'me', responsavelNome: 'Giovana', colunaNome: 'Remarketing', criadoEm: '2026-08-30T12:00:00Z', execucaoId: null, execucaoStatus: null, sequenciaNome: null, toqueTotal: null, iniciadaEm: null },
  { oportunidadeId: 'opp-2', contatoId: 'c2', contatoNome: 'JOSÉ CARLOS FERREIRA', contatoTelefone: '5551999990002', responsavelId: 'me', responsavelNome: 'Giovana', colunaNome: 'Remarketing', criadoEm: '2026-08-29T12:00:00Z', execucaoId: 'ex-1', execucaoStatus: 'ativa', sequenciaNome: 'Recuperação padrão', toqueTotal: 3, iniciadaEm: '2026-08-31T10:00:00Z' },
  { oportunidadeId: 'opp-3', contatoId: 'c3', contatoNome: 'ANTÔNIO PEREIRA LIMA', contatoTelefone: '5551999990003', responsavelId: 'outro', responsavelNome: 'Juliana', colunaNome: 'Remarketing', criadoEm: '2026-08-28T12:00:00Z', execucaoId: null, execucaoStatus: null, sequenciaNome: null, toqueTotal: null, iniciadaEm: null },
];
export const MOCK_DASH: RecupDashboard = { na_coluna: 3, em_recuperacao: 1, recuperados: 4, concluidas: 2 };
