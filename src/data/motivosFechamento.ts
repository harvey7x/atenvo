import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useOrg } from '@/context/OrgContext';
import { temRecurso } from '@/v2/data/config/recursos';
import { MOTIVOS_FECHAMENTO, OUTRO_MOTIVO } from './fechamento';

/* ------------------------------------------------------------------
   MOTIVOS DE FECHAMENTO CONFIGURÁVEIS (26/11, "igual" ao sistema que a Reviza usava antes: lá Configurações › Motivos
   de fechamento, com a lista que aparece ao fechar a conversa e o histórico de quem fechou e por quê).
   O administrador cria, renomeia, põe na ordem e desliga; o "Fechar conversa" do WhatsApp mostra os ligados (e
   "Outro motivo", com o detalhe, sempre por último). O histórico vem da rotina atd_motivos_historico.
   Servidor: migration 110 (atd_motivos_fechamento + atd_motivos_historico). Sem ela (recurso 'campos' desligado), a
   lista é a fixa de @/data/fechamento.
   DEMO É O CONTRATO: sem backend os mesmos hooks guardam no navegador.
   ------------------------------------------------------------------ */

export const MOTIVOS_REAL: boolean = isSupabaseConfigured && !!supabase;

export interface Motivo { id: string; nome: string; ordem: number; ativo: boolean }
export interface HistoricoMotivos {
  dias: number;
  total: number;
  porMotivo: { motivo: string; qtd: number }[];
  porPessoa: { nome: string; qtd: number }[];
  recentes: { quando: string; motivo: string; base: string; conversaId: string; quem: string | null; contato: string }[];
}

export const MOTIVO_NOME_MAX = 80;
export function validarMotivo(nome: string, outros: Motivo[], id?: string): string | null {
  const n = nome.trim();
  if (!n) return 'Escreva o motivo.';
  if (n.length > MOTIVO_NOME_MAX) return `O motivo vai até ${MOTIVO_NOME_MAX} letras.`;
  if (n.toLowerCase() === OUTRO_MOTIVO.toLowerCase()) return '"Outro motivo" já aparece sempre no fim da lista.';
  if (n.includes(' — ')) return 'Use um nome sem travessão.';
  if (outros.some((o) => o.id !== id && o.nome.trim().toLowerCase() === n.toLowerCase())) return 'Esse motivo já está na lista.';
  return null;
}

/* ---------------- demonstração ---------------- */
const GUARDA = 'previa-motivos-fechamento';
const PADRAO: Motivo[] = MOTIVOS_FECHAMENTO.filter((m) => m !== OUTRO_MOTIVO).map((nome, i) => ({ id: `mot-${i}`, nome, ordem: i, ativo: true }));
const ler = (): Motivo[] => { try { const v = JSON.parse(localStorage.getItem(GUARDA) ?? 'null'); return Array.isArray(v) ? v : PADRAO; } catch { return PADRAO; } };
const gravar = (l: Motivo[]) => { try { localStorage.setItem(GUARDA, JSON.stringify(l)); } catch { /* aba privada */ } };
const espera = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
const novoId = () => (globalThis.crypto?.randomUUID?.() ?? `mot-${Date.now()}`);
const hAtras = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const HIST_DEMO: HistoricoMotivos = {
  dias: 30, total: 47,
  porMotivo: [{ motivo: 'Cliente descartado', qtd: 18 }, { motivo: 'Sem perfil (não elegível)', qtd: 11 }, { motivo: 'Cliente parou de responder', qtd: 8 }, { motivo: 'Atendimento concluído', qtd: 5 }, { motivo: 'Cliente desistiu', qtd: 3 }, { motivo: 'Outro motivo', qtd: 2 }],
  porPessoa: [{ nome: 'Juliana', qtd: 16 }, { nome: 'Eduardo', qtd: 12 }, { nome: 'Alexandra', qtd: 10 }, { nome: 'Rafael', qtd: 9 }],
  recentes: [
    { quando: hAtras(0.4), motivo: 'Cliente descartado — sem empréstimo nas 5 financeiras', base: 'Cliente descartado', conversaId: 'wa-pedro', quem: 'Juliana', contato: 'Pedro Henrique Dias' },
    { quando: hAtras(1.8), motivo: 'Atendimento concluído', base: 'Atendimento concluído', conversaId: 'wa-neusa', quem: 'Eduardo', contato: 'Neusa Trindade' },
    { quando: hAtras(5), motivo: 'Sem perfil (não elegível) — é CLT', base: 'Sem perfil (não elegível)', conversaId: 'wa-joaob', quem: 'Alexandra', contato: 'João Batista Ramos' },
    { quando: hAtras(26), motivo: 'mudou de cidade e não quer seguir', base: 'Outro motivo', conversaId: 'wa-odete', quem: 'Rafael', contato: 'Odete F. Carvalho' },
  ],
};

const CHAVE = 'atd-motivos-fechamento';
const ligado = () => temRecurso('campos');

/** os motivos da empresa, na ordem (com os desligados: a tela de Configurações mostra; o "Fechar conversa" filtra) */
export function useMotivos() {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: [CHAVE, currentOrg.id],
    enabled: !!currentOrg.id,
    staleTime: 60_000,
    queryFn: async (): Promise<Motivo[]> => {
      if (!MOTIVOS_REAL) { await espera(100); return [...ler()].sort((a, b) => a.ordem - b.ordem); }
      if (!ligado()) return PADRAO;
      const { data, error } = await supabase!.from('atd_motivos_fechamento').select('id, nome, ordem, ativo').eq('organizacao_id', currentOrg.id).order('ordem').order('nome');
      if (error) throw new Error(error.message);
      const l = (data ?? []).map((r) => ({ id: String(r.id), nome: String(r.nome), ordem: Number(r.ordem) || 0, ativo: r.ativo !== false }));
      return l.length ? l : PADRAO;
    },
  });
}

/** o que o "Fechar conversa" mostra: os ligados, na ordem, e "Outro motivo" por último */
export function opcoesDeFechamento(l: Motivo[] | undefined): string[] {
  const ativos = (l ?? PADRAO).filter((m) => m.ativo).map((m) => m.nome);
  return [...(ativos.length ? ativos : PADRAO.map((m) => m.nome)), OUTRO_MOTIVO];
}

export function useSalvarMotivo() {
  const { currentOrg } = useOrg();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (m: Omit<Motivo, 'id'> & { id?: string }) => {
      const nome = m.nome.trim().replace(/\s+/g, ' ');
      if (!MOTIVOS_REAL) {
        await espera(120);
        const l = ler();
        gravar(m.id ? l.map((x) => (x.id === m.id ? { ...x, ...m, nome } as Motivo : x)) : [...l, { ...m, nome, id: novoId() } as Motivo]);
        return;
      }
      const linha = { organizacao_id: currentOrg.id, nome, ordem: m.ordem, ativo: m.ativo };
      const { error } = m.id ? await supabase!.from('atd_motivos_fechamento').update(linha).eq('id', m.id) : await supabase!.from('atd_motivos_fechamento').insert(linha);
      if (error) throw new Error(/atd_motivos_nome_uniq|duplicate/i.test(error.message) ? 'Esse motivo já está na lista.' : error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [CHAVE] }),
  });
}

export function useOrdenarMotivos() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      if (!MOTIVOS_REAL) { gravar(ler().map((x) => ({ ...x, ordem: Math.max(0, ids.indexOf(x.id)) }))); return; }
      for (let i = 0; i < ids.length; i++) {
        const { error } = await supabase!.from('atd_motivos_fechamento').update({ ordem: i }).eq('id', ids[i]);
        if (error) throw new Error(error.message);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [CHAVE] }),
  });
}

/** apagar só tira da lista: as conversas já fechadas guardam o texto do motivo (o histórico continua contando) */
export function useApagarMotivo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!MOTIVOS_REAL) { gravar(ler().filter((x) => x.id !== id)); return; }
      const { error } = await supabase!.from('atd_motivos_fechamento').delete().eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [CHAVE] }),
  });
}

export function useHistoricoMotivos(dias: number) {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: [CHAVE, currentOrg.id, 'historico', dias],
    enabled: !!currentOrg.id,
    queryFn: async (): Promise<HistoricoMotivos> => {
      if (!MOTIVOS_REAL) {
        await espera(150);
        const f = dias <= 7 ? 0.3 : dias >= 90 ? 2.6 : 1;
        const porMotivo = HIST_DEMO.porMotivo.map((x) => ({ ...x, qtd: Math.max(1, Math.round(x.qtd * f)) }));
        const porPessoa = HIST_DEMO.porPessoa.map((x) => ({ ...x, qtd: Math.max(1, Math.round(x.qtd * f)) }));
        return { ...HIST_DEMO, dias, porMotivo, porPessoa, total: porMotivo.reduce((s, x) => s + x.qtd, 0) };
      }
      const { data, error } = await supabase!.rpc('atd_motivos_historico', { p_dias: dias });
      if (error) throw new Error(/sem_permissao/.test(error.message) ? 'Só o administrador vê o histórico.' : error.message);
      const j = (data ?? {}) as Record<string, unknown>;
      const arr = (v: unknown) => (Array.isArray(v) ? v as Record<string, unknown>[] : []);
      return {
        dias: Number(j.dias) || dias,
        total: Number(j.total) || 0,
        porMotivo: arr(j.por_motivo).map((x) => ({ motivo: String(x.motivo), qtd: Number(x.qtd) || 0 })),
        porPessoa: arr(j.por_pessoa).map((x) => ({ nome: String(x.nome), qtd: Number(x.qtd) || 0 })),
        recentes: arr(j.recentes).map((x) => ({ quando: String(x.quando), motivo: String(x.motivo ?? ''), base: String(x.base ?? ''), conversaId: String(x.conversa_id ?? ''), quem: (x.quem as string) ?? null, contato: String(x.contato ?? '') })),
      };
    },
  });
}
