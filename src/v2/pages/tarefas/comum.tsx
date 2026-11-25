import { useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useOrg } from '@/context/OrgContext';
import {
  TAREFAS_REAL, estaAtrasada, textoPrazo, useEquipeTarefas, venceHoje,
  type PessoaEquipe, type PrioridadeTarefa, type QuemSouEu, type Tarefa,
} from '@/data/tarefas';
import { initials } from '@/lib/avatar';

/* Peças comuns da página Tarefas e do "Criar tarefa" do WhatsApp (mesma régua visual nos dois lugares). */

/** quem está usando: o id e se é administrador (o administrador vê as tarefas de todos) */
export function useEuTarefas(): QuemSouEu & { nome: string } {
  const { user } = useAuth();
  const { currentOrg } = useOrg();
  return useMemo(() => ({ id: user?.id ?? null, admin: currentOrg?.role === 'admin', nome: user?.name?.trim() || 'Você' }), [user?.id, user?.name, currentOrg?.role]);
}

/** a equipe para escolher o responsável, com a própria pessoa sempre presente; e o nome de cada id */
export function useEquipeComigo() {
  const eu = useEuTarefas();
  const q = useEquipeTarefas();
  return useMemo(() => {
    const base: PessoaEquipe[] = q.data ?? [];
    const lista = eu.id && !base.some((p) => p.id === eu.id) ? [{ id: eu.id, nome: eu.nome }, ...base] : base;
    const mapa = new Map(lista.map((p) => [p.id, p.nome]));
    const nomeDe = (id: string | null | undefined): string | null => (id ? (id === eu.id ? 'Você' : mapa.get(id) ?? (TAREFAS_REAL ? 'Alguém da equipe' : null)) : null);
    // a própria pessoa no topo da lista; os demais em ordem alfabética
    const ordenada = [...lista].sort((a, b) => (a.id === eu.id ? -1 : b.id === eu.id ? 1 : a.nome.localeCompare(b.nome, 'pt-BR')));
    return { equipe: ordenada, nomeDe, carregando: q.isLoading };
  }, [q.data, q.isLoading, eu.id, eu.nome]);
}

/* ---------- ícones (traço fino, família da barra lateral) ---------- */
const svg = (corpo: React.ReactNode, tam = 14) => (
  <svg width={tam} height={tam} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">{corpo}</svg>
);
export const IcCheck = () => svg(<path d="m5 12.5 4.5 4.5L19 7.5" />, 12);
export const IcConversa = () => svg(<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />, 13);
export const IcLista = () => svg(<><path d="m3 17 2 2 4-4" /><path d="m3 7 2 2 4-4" /><path d="M13 6h8" /><path d="M13 12h8" /><path d="M13 18h8" /></>, 13);
export const IcTexto = () => svg(<><path d="M17 6.1H3" /><path d="M21 12.1H3" /><path d="M15.1 18H3" /></>, 13);
export const IcX = () => svg(<path d="M6 6l12 12M18 6L6 18" />, 13);
export const IcMais = () => svg(<path d="M12 5v14M5 12h14" />, 14);
export const IcBusca = () => svg(<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>, 14);
export const IcTarefa = () => svg(<><rect width="18" height="18" x="3" y="3" rx="2" /><path d="m9 12 2 2 4-4" /></>, 14);

/** a caixinha redonda de concluir */
export function CaixaConcluir({ feita, aoAlternar, rotulo, desabilitada }: { feita: boolean; aoAlternar: () => void; rotulo: string; desabilitada?: boolean }) {
  return (
    <button type="button" role="checkbox" aria-checked={feita} aria-label={rotulo} title={feita ? 'Reabrir a tarefa' : 'Marcar como concluída'}
      className={feita ? 'tf-ck on' : 'tf-ck'} disabled={desabilitada}
      onClick={(e) => { e.stopPropagation(); aoAlternar(); }}>
      {feita && <IcCheck />}
    </button>
  );
}

/** prioridade: três barrinhas (3 = alta) e o nome */
export function SeloPrioridade({ p, curto }: { p: PrioridadeTarefa; curto?: boolean }) {
  const n = p === 'alta' ? 3 : p === 'media' ? 2 : 1;
  const rot = p === 'alta' ? 'Alta' : p === 'media' ? 'Média' : 'Baixa';
  return (
    <span className={'tf-prio p-' + p} title={`Prioridade ${rot.toLowerCase()}`}>
      <span className="tf-prio-barras" aria-hidden>{[1, 2, 3].map((i) => <i key={i} className={i <= n ? 'on' : ''} />)}</span>
      {!curto && <span>{rot}</span>}
      {curto && <span className="tf-sr">Prioridade {rot.toLowerCase()}</span>}
    </span>
  );
}

/** o prazo, com "Atrasada" em destaque e "Hoje" em negrito */
export function SeloPrazo({ t, agora }: { t: Tarefa; agora: number }) {
  const atrasada = estaAtrasada(t, agora);
  const hoje = venceHoje(t, agora);
  if (!t.prazo) return <span className="tf-prazo vazio">Sem prazo</span>;
  if (atrasada) return <span className="tf-prazo atrasada" title="Passou do prazo"><b>Atrasada</b><span>{textoPrazo(t, agora)}</span></span>;
  return <span className={'tf-prazo' + (hoje ? ' hoje' : '') + (t.status === 'concluida' ? ' feita' : '')}>{textoPrazo(t, agora)}</span>;
}

/** a pessoa responsável: as iniciais num círculo e o nome */
export function Pessoa({ nome, curto }: { nome: string | null; curto?: boolean }) {
  if (!nome) return <span className="tf-pessoa vazio">{curto ? '—' : 'Sem responsável'}</span>;
  return (
    <span className="tf-pessoa" title={nome}>
      <span className="tf-av" aria-hidden>{initials(nome)}</span>
      {!curto && <span className="tf-pessoa-n">{nome}</span>}
    </span>
  );
}
