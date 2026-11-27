/* KANBAN EM LISTA (26/11, "igual" ao CRM do sistema que a Reviza usava antes: Quadro | Lista). Os MESMOS cards do quadro
   (a busca, a origem, o responsável, os filtros completos e o Foco valem), numa tabela: ordenar clicando no título da
   coluna, filtrar pela etapa e abrir o card com um clique. Vai de 100 em 100 (o funil tem milhares de cards). */
import { useMemo, useState } from 'react';
import type { KColuna, KLead } from '@/data/kanban';
import { corDaEtiqueta, type Etiqueta } from '@/types/atendimento';
import { BotaoSec } from '../../components';
import './kanbanLista.css';

type Campo = 'nome' | 'etapa' | 'responsavel' | 'entrada' | 'movimento';
const POR_PAGINA = 100;
const tz = { timeZone: 'America/Sao_Paulo' } as const;
const data = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const d = new Date(iso); if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', { ...tz, day: '2-digit', month: '2-digit', year: '2-digit' });
};
const foneLegivel = (t: string) => {
  const d = (t || '').replace(/\D/g, ''); const n = d.length >= 12 && d.startsWith('55') ? d.slice(2) : d;
  if (n.length === 11) return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
  if (n.length === 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
  return t || '—';
};
const SITUACAO: Record<string, string> = { ganho: 'Venda', perdido: 'Perdido', em_andamento: '' };

export function KanbanLista({ leads, colunas, etiquetas, nomeDe, colunaDe, aoAbrir, aoAbrirConversa }: {
  leads: KLead[]; colunas: KColuna[]; etiquetas: Etiqueta[];
  nomeDe: (l: KLead) => string; colunaDe: (l: KLead) => string | null;
  aoAbrir: (id: string) => void; aoAbrirConversa: (l: KLead) => void;
}) {
  const [etapa, setEtapa] = useState('');
  const [campo, setCampo] = useState<Campo>('movimento');
  const [desc, setDesc] = useState(true);
  const [limite, setLimite] = useState(POR_PAGINA);
  const ordemCol = useMemo(() => new Map(colunas.map((c) => [c.id, c])), [colunas]);

  const linhas = useMemo(() => {
    const base = etapa ? leads.filter((l) => colunaDe(l) === etapa) : leads;
    const chave = (l: KLead): string | number => {
      if (campo === 'nome') return nomeDe(l).toLocaleLowerCase('pt-BR');
      if (campo === 'etapa') return ordemCol.get(colunaDe(l) ?? '')?.ordem ?? 999;
      if (campo === 'responsavel') return (l.respNome || '~').toLocaleLowerCase('pt-BR');
      if (campo === 'entrada') return l.entradaEm || l.criadoEm || '';
      return l.movimentadoEm || l.atualizadoEm || '';
    };
    return base.slice().sort((a, b) => {
      const x = chave(a), y = chave(b);
      const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'pt-BR');
      return desc ? -r : r;
    });
  }, [leads, etapa, campo, desc, ordemCol, colunaDe, nomeDe]);

  const ordenar = (c: Campo) => { if (c === campo) setDesc((d) => !d); else { setCampo(c); setDesc(c === 'entrada' || c === 'movimento'); } setLimite(POR_PAGINA); };
  const Th = ({ c, children }: { c: Campo; children: string }) => (
    <th scope="col" aria-sort={campo === c ? (desc ? 'descending' : 'ascending') : 'none'}>
      <button type="button" className={'kbl-ord' + (campo === c ? ' on' : '')} onClick={() => ordenar(c)}>
        {children}{campo === c && <span aria-hidden>{desc ? ' ↓' : ' ↑'}</span>}
      </button>
    </th>
  );
  const porEtapa = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of leads) { const c = colunaDe(l) ?? ''; m.set(c, (m.get(c) ?? 0) + 1); }
    return m;
  }, [leads, colunaDe]);

  return (
    <div className="kbl sobe" data-kanban-lista>
      <div className="kbl-topo">
        <label className="kbl-etapa"><span>Etapa</span>
          <select className="inp" value={etapa} onChange={(e) => { setEtapa(e.target.value); setLimite(POR_PAGINA); }}>
            <option value="">Todas ({leads.length.toLocaleString('pt-BR')})</option>
            {colunas.map((c) => <option key={c.id} value={c.id}>{c.nome} ({(porEtapa.get(c.id) ?? 0).toLocaleString('pt-BR')})</option>)}
          </select>
        </label>
        <span className="kbl-conta">{linhas.length.toLocaleString('pt-BR')} {linhas.length === 1 ? 'card' : 'cards'}</span>
      </div>
      <div className="kbl-rolo">
        <table className="kbl-tab">
          <thead>
            <tr>
              <Th c="nome">Cliente</Th>
              <th scope="col">Telefone</th>
              <Th c="etapa">Etapa</Th>
              <Th c="responsavel">Responsável</Th>
              <th scope="col">Etiquetas</th>
              <Th c="entrada">Entrou</Th>
              <Th c="movimento">Última mudança</Th>
              <th scope="col"><span className="kbl-sr">Conversa</span></th>
            </tr>
          </thead>
          <tbody>
            {linhas.slice(0, limite).map((l) => {
              const col = ordemCol.get(colunaDe(l) ?? '');
              const etqs = Array.from(new Set([...l.etiquetas, ...l.contatoEtiquetas]));
              const sit = SITUACAO[l.status] ?? '';
              return (
                <tr key={l.id} tabIndex={0} onClick={() => aoAbrir(l.id)} onKeyDown={(e) => { if (e.key === 'Enter') aoAbrir(l.id); }}>
                  <td className="kbl-nome"><span>{nomeDe(l)}</span>{sit && <small className={'kbl-sit ' + l.status}>{sit}</small>}</td>
                  <td className="num">{foneLegivel(l.telefone)}</td>
                  <td><span className="kbl-col"><i style={{ background: col?.cor || 'var(--txt-3)' }} />{col?.nome ?? '—'}</span></td>
                  <td>{l.respNome || <span className="kbl-vazio">Sem responsável</span>}</td>
                  <td>
                    <span className="kbl-etqs">
                      {etqs.slice(0, 2).map((t) => <span key={t} className="kbl-etq" title={t}><i style={{ background: corDaEtiqueta(t, etiquetas) }} />{t}</span>)}
                      {etqs.length > 2 && <span className="kbl-etq mais" title={etqs.slice(2).join(' · ')}>+{etqs.length - 2}</span>}
                    </span>
                  </td>
                  <td className="num">{data(l.entradaEm || l.criadoEm)}</td>
                  <td className="num">{data(l.movimentadoEm || l.atualizadoEm)}</td>
                  <td>
                    {l.conversaOrigemId && (
                      <button type="button" className="kbl-conv" title="Abrir a conversa" aria-label={`Abrir a conversa de ${nomeDe(l)}`}
                        onClick={(e) => { e.stopPropagation(); aoAbrirConversa(l); }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden><path d="M21 12a8 8 0 0 1-8 8H4l2.2-2.6A8 8 0 1 1 21 12z" /></svg>
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {linhas.length === 0 && <p className="kbl-nada">Nenhum card nesta etapa com os filtros de agora.</p>}
      </div>
      {linhas.length > limite && (
        <div className="kbl-mais"><BotaoSec onClick={() => setLimite((n) => n + POR_PAGINA)}>Mostrar mais {Math.min(POR_PAGINA, linhas.length - limite)} de {(linhas.length - limite).toLocaleString('pt-BR')}</BotaoSec></div>
      )}
    </div>
  );
}
