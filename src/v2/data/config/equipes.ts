/* EQUIPES DO ATENDIMENTO (dono 23/11): "vamos criar uma equipe e colocar o gerente dessa equipe. O
   gerente consegue ver todas as conversas; o pessoal da equipe, como atendente normal, trabalha de
   forma normal. […] cada equipe vai ter um WhatsApp próprio na parte de atendimento."
   Uma equipe = nome + UM gerente + as pessoas + os números de WhatsApp do Atendimento que são dela.
   O QUE MUDA NA VISÃO (lib/visibilidade.ts):
     administrador   vê tudo, como sempre;
     gerente         vê as conversas de cada pessoa da equipe e tudo o que chega nos números da equipe
                     (inclusive o que ainda não tem dono);
     atendente       igual a antes: só as conversas dele.
   Tabela `equipes` (id, nome, gerente_id, membros[], canais[]). Só o administrador grava.
   Faz parte do Atendimento, mas dá para CADASTRAR antes dele estar ligado (recurso "acessos", migrations 91
   e 92): a tabela, as regras e a exclusividade já ficam no banco; o gerente passa a ver as conversas quando
   o Atendimento for ligado. Sem nenhum dos dois (config/recursos.ts) nada disto aparece nem consulta.
   NO SERVIDOR (quando o Atendimento existir no banco do Reviza): a mesma regra tem de valer no banco
   (quem lê cada conversa) e o salvar precisa virar uma operação só. Hoje só a prévia exercita isto. */
import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { isPrevia, isRevizaMode, supabase } from '@/lib/supabase';
import { temCadastroAtendimento } from './recursos';

export interface Equipe {
  id: string;
  nome: string;
  gerenteId: string | null;
  /** as pessoas da equipe (o gerente não entra aqui) */
  membros: string[];
  /** ids dos números de WhatsApp do Atendimento que são desta equipe */
  canais: string[];
}

const CHAVE = ['reviza', 'equipes'] as const;
const ligado = () => !!supabase && temCadastroAtendimento();
const ids = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
const ler = (r: Record<string, unknown>): Equipe => ({
  id: String(r.id), nome: String(r.nome ?? ''), gerenteId: r.gerente_id ? String(r.gerente_id) : null, membros: ids(r.membros), canais: ids(r.canais),
});
export const nomeDeEquipe = (s: string) => s.trim().replace(/\s+/g, ' ');

async function todas(): Promise<Equipe[]> {
  const { data, error } = await supabase!.from('equipes').select('*');
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map(ler).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

export function useEquipes() {
  return useQuery({ queryKey: CHAVE, enabled: ligado(), staleTime: 30_000, queryFn: todas });
}

/** só na PRÉVIA a tela escreve o registro (no sistema de verdade quem registra é o banco, por gatilho) */
function registrarNaPrevia(acao: string, rotulo: string, detalhe: string) {
  if (!isPrevia || !supabase) return;
  void supabase.from('registros').insert({ acao, entidade: 'equipe', rotulo, detalhe, mudancas: [] }).then(() => undefined);
}

export interface EquipeParaSalvar { id?: string; nome: string; gerenteId: string; membros: string[]; canais: string[]; /** resumo em palavras, para os Registros */ resumo?: string }

export function useSalvarEquipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: EquipeParaSalvar) => {
      if (!ligado()) throw new Error('As equipes ainda não estão disponíveis nesta instalação.');
      const nome = nomeDeEquipe(a.nome);
      if (nome.length < 2) throw new Error('Dê um nome para a equipe.');
      if (!a.gerenteId) throw new Error('Escolha o gerente da equipe.');
      const atuais = await todas();
      if (atuais.some((e) => e.id !== a.id && e.nome.toLowerCase() === nome.toLowerCase())) throw new Error('Já existe uma equipe com esse nome.');
      const membros = [...new Set(a.membros)].filter((m) => m !== a.gerenteId);
      const canais = [...new Set(a.canais)];
      // cada pessoa fica numa equipe só e cada número é de uma equipe só: quem entra aqui sai de onde estava
      for (const e of atuais) {
        if (e.id === a.id) continue;
        const m2 = e.membros.filter((m) => !membros.includes(m) && m !== a.gerenteId);
        const c2 = e.canais.filter((c) => !canais.includes(c));
        if (m2.length === e.membros.length && c2.length === e.canais.length) continue;
        const { error } = await supabase!.from('equipes').update({ membros: m2, canais: c2 }).eq('id', e.id);
        if (error) throw error;
      }
      const linha = { nome, gerente_id: a.gerenteId, membros, canais };
      const { error } = a.id ? await supabase!.from('equipes').update(linha).eq('id', a.id) : await supabase!.from('equipes').insert(linha);
      if (error) throw error;
      registrarNaPrevia(a.id ? 'alterou' : 'criou', nome, a.resumo ?? '');
      return nome;
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: CHAVE }); void qc.invalidateQueries({ queryKey: ['reviza', 'registros'] }); },
  });
}

export function useExcluirEquipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (e: Equipe) => {
      if (!ligado()) throw new Error('As equipes ainda não estão disponíveis nesta instalação.');
      const { error } = await supabase!.from('equipes').delete().eq('id', e.id);
      if (error) throw error;
      registrarNaPrevia('excluiu', e.nome, 'as pessoas e os números ficaram sem equipe');
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: CHAVE }); void qc.invalidateQueries({ queryKey: ['reviza', 'registros'] }); },
  });
}

/* ---------------- o que o GERENTE enxerga (lido por lib/visibilidade.ts) ---------------- */
export interface EscopoEquipe {
  /** a pessoa logada é gerente de alguma equipe */
  gerente: boolean;
  /** ela e as pessoas das equipes que ela gerencia */
  pessoas: ReadonlySet<string>;
  /** os números de WhatsApp dessas equipes */
  canais: ReadonlySet<string>;
}
const SEM_ESCOPO: EscopoEquipe = { gerente: false, pessoas: new Set(), canais: new Set() };

export function useEscopoEquipe(): EscopoEquipe {
  const { user } = useAuth();
  const q = useEquipes();
  const uid = user?.id ?? null;
  return useMemo(() => {
    const minhas = uid ? (q.data ?? []).filter((e) => e.gerenteId === uid) : [];
    if (!minhas.length) return SEM_ESCOPO;
    const pessoas = new Set<string>([uid as string]); const canais = new Set<string>();
    for (const e of minhas) { e.membros.forEach((m) => pessoas.add(m)); e.canais.forEach((c) => canais.add(c)); }
    return { gerente: true, pessoas, canais };
  }, [q.data, uid]);
}

/* ---------------- PRÉVIA: de quem é cada conversa de exemplo ----------------
   As conversas de exemplo do Atendimento não têm dono de verdade. Na prévia do Reviza elas ganham um
   dono entre as pessoas de exemplo (e as duas sem dono ganham o número por onde chegaram), para dar
   para ver a regra das equipes funcionando no "Ver como". Fora da prévia nada muda. */
const DONO_NA_PREVIA: Record<string, { resp: string | null; numero?: string }> = {
  'wa-maria': { resp: 'u-carla' }, 'wa-ivone': { resp: 'u-carla' }, 'wa-antonio': { resp: 'u-eduardo' }, 'wa-terezinha': { resp: 'u-bianca' },
  'wa-jose': { resp: null, numero: 'atd-principal' }, 'wa-sebastiao': { resp: null, numero: 'atd-campanha' },
  'wa-odete': { resp: 'u-carla' }, 'wa-pedro': { resp: 'u-eduardo' }, 'wa-neusa': { resp: 'u-bianca' }, 'wa-joaob': { resp: 'u-paty' }, 'wa-cleusa': { resp: 'u-paty' },
};
export function donosDaPrevia<T extends { id: string; respId?: string | null; canalId?: string | null }>(conversas: T[]): T[] {
  if (!isPrevia || !isRevizaMode) return conversas;
  return conversas.map((c) => {
    const d = DONO_NA_PREVIA[c.id];
    return d ? { ...c, respId: d.resp, ...(d.numero ? { canalId: d.numero } : {}) } : c;
  });
}

/** o mesmo para os cards de exemplo do Kanban (mesmos clientes das conversas, mesmos donos) */
const DONO_DO_CARD_NA_PREVIA: Record<string, [id: string, nome: string] | null> = {
  'kl-1': ['u-carla', 'Carla'], 'kl-2': null, 'kl-3': ['u-carla', 'Carla'], 'kl-4': ['u-bianca', 'Bianca'], 'kl-5': ['u-eduardo', 'Eduardo'],
  'kl-6': null, 'kl-7': ['u-bianca', 'Bianca'], 'kl-8': ['u-eduardo', 'Eduardo'], 'kl-9': ['u-paty', 'Paty'],
};
export function donosDosCardsDaPrevia<T extends { id: string; respId?: string | null; respNome?: string }>(cards: T[]): T[] {
  if (!isPrevia || !isRevizaMode) return cards;
  return cards.map((c) => {
    if (!(c.id in DONO_DO_CARD_NA_PREVIA)) return c;
    const d = DONO_DO_CARD_NA_PREVIA[c.id];
    return { ...c, respId: d ? d[0] : null, respNome: d ? d[1] : '' };
  });
}
