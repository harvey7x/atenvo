import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { WaContact } from '@/data/whatsappDemo';
import { tempoRelativo } from '@/data/slaView';
import { initials } from '@/lib/avatar';
import { useAuth } from '@/context/AuthContext';
import { useEtiquetas, useOrgUsuarios } from '@/data/atendimento';
import { corDaEtiqueta } from '@/types/atendimento';
import { EstadoErro, Skeleton } from '../components';
import { nomeExibicao, tierEspera } from '../lib/waUi';
import { aplicarTema, lerTema, salvarTema, type Tema } from '../lib/tema';
import {
  FILTROS_VAZIOS, IA_OPCOES, PERIODO_OPCOES, SITUACAO_OPCOES,
  contarFiltros, etapasDaLista, passaFiltroInbox, type FiltrosInbox,
} from '../lib/filtroInbox';
import { useInboxMobile } from './MobileShell';

/* ------------------------------------------------------------------
   Tela 1 do mobile (/m): lista de conversas, mais recentes primeiro.
   Desde 18/09 (pedido do dono) o filtro tem PARIDADE TOTAL com o
   desktop: abas rápidas (todos/meus/não lidas) + busca + o sheet de
   facetas, cujo predicado é o COMPARTILHADO ../lib/filtroInbox
   (mudar cláusula lá muda as duas telas juntas). Ordenação idêntica
   (fixada → lastAtMs desc). Tema claro/escuro no botão do topo.
   ------------------------------------------------------------------ */

const ABAS = [['todos', 'Todos'], ['meus', 'Meus'], ['naolidas', 'Não lidas']] as const;
type AbaId = typeof ABAS[number][0];
// espelho de módulo dos filtros: sobrevive ao desmontar lista↔conversa (sessão SPA)
let filtrosLembrados: FiltrosInbox | null = null;

export default function ListaConversasMobile() {
  const nav = useNavigate();
  const { user } = useAuth();
  const { inbox } = useInboxMobile();
  const { contacts, relogioMs, demo } = inbox;
  const [search, setSearch] = useState('');
  const [aba, setAba] = useState<AbaId>('todos');
  // tema claro/escuro no CELULAR (pedido do dono 18/09): mesmo mecanismo do desktop
  // (lib/tema.ts, escopo por usuário) — o MobileShell já aplica o salvo na entrada.
  const [tema, setTema] = useState<Tema>(() => lerTema(user?.id));
  const alternarTema = () => {
    const novo: Tema = tema === 'dark' ? 'light' : 'dark';
    setTema(novo); aplicarTema(novo); salvarTema(novo, user?.id);
  };

  /* filtros COMPLETOS do inbox (pedido do dono 18/09): as MESMAS facetas do desktop,
     num sheet — o predicado é o compartilhado (../lib/filtroInbox), nunca reimplementado. */
  const [filtroAberto, setFiltroAberto] = useState(false);
  // a lista DESMONTA ao abrir uma conversa (rotas irmãs no Outlet) — sem o espelho de
  // módulo, voltar da conversa zerava os filtros que o atendente tinha acabado de montar
  const [filtros, setFiltros] = useState<FiltrosInbox>(() => filtrosLembrados ?? FILTROS_VAZIOS());
  useEffect(() => { filtrosLembrados = filtros; }, [filtros]);
  const altFaceta = (k: 'canais' | 'transporte' | 'etapas' | 'etiquetas' | 'atendentes' | 'ia' | 'situacao', v: string) =>
    setFiltros((f) => { const s = new Set(f[k]); if (s.has(v)) s.delete(v); else s.add(v); return { ...f, [k]: s }; });
  const etiquetasQ = useEtiquetas();
  const usuariosQ = useOrgUsuarios();
  const canalPorId = useMemo(() => new Map(inbox.realCanais.map((c) => [c.id, c])), [inbox.realCanais]);
  const transporteDe = (id: string | null | undefined) => (id ? canalPorId.get(id)?.transporte ?? null : null);
  const etapasFiltro = useMemo(() => etapasDaLista(contacts), [contacts]);
  const nFiltros = contarFiltros(filtros);

  // Na LISTA, nenhuma conversa está "aberta": desfaz a seleção do usuário para
  // desarmar o marcar-lida automático do hook — sem isto, mensagem nova da última
  // conversa visitada seria marcada como lida com o atendente olhando só a lista.
  useEffect(() => {
    inbox.selecionarPorDeepLink('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const term = search.trim().toLowerCase();
  const buscaAtiva = term.length > 0;
  const visiveis = useMemo(() => {
    const passa = (c: WaContact) =>
      // arquivadas escondidas por padrão; busca OU o toggle "Só arquivadas" revelam (paridade desktop)
      (!c.arquivada || buscaAtiva || filtros.arquivadas) &&
      (aba === 'todos' ? true : aba === 'meus' ? c.respId === user?.id : (c.unread ?? 0) > 0) &&
      // busca (term) e todas as facetas vivem no predicado COMPARTILHADO com o desktop
      passaFiltroInbox(c, filtros, { term, relogioMs, transporteDe });
    return contacts.filter(passa).sort((a, b) => (a.fixada === b.fixada ? (b.lastAtMs ?? 0) - (a.lastAtMs ?? 0) : a.fixada ? -1 : 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contacts, aba, term, buscaAtiva, user?.id, filtros, relogioMs, canalPorId]);

  const carregando = !demo && inbox.live.isLoading && contacts.length === 0;
  const erro = !demo && inbox.live.isError && contacts.length === 0;

  return (
    <>
      <header className="m-topo">
        <div className="m-titulo-row">
          <div className="m-titulo">Conversas</div>
          <button
            type="button" className={'m-tema' + (nFiltros > 0 ? ' on' : '')}
            title={nFiltros > 0 ? `Filtros ativos (${nFiltros})` : 'Filtros'} aria-label="Filtros"
            onClick={() => setFiltroAberto(true)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 5h18l-7 8v5l-4 2v-7L3 5Z" /></svg>
            {nFiltros > 0 && <span className="m-fbadge num">{nFiltros}</span>}
          </button>
          <button
            type="button" className="m-tema"
            title={tema === 'dark' ? 'Mudar para o tema claro' : 'Mudar para o tema escuro'}
            aria-label={tema === 'dark' ? 'Mudar para o tema claro' : 'Mudar para o tema escuro'}
            onClick={alternarTema}
          >
            {tema === 'dark'
              ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
              : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" /></svg>}
          </button>
        </div>
        <input className="m-busca" type="search" placeholder="Buscar conversas..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="m-abas" role="tablist">
          {ABAS.map(([id, rotulo]) => (
            <button key={id} type="button" role="tab" aria-selected={aba === id} className={'m-aba' + (aba === id ? ' on' : '')} onClick={() => setAba(id)}>{rotulo}</button>
          ))}
        </div>
      </header>
      <div className="m-lista">
        {carregando && (
          <div className="m-carga">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div className="m-carga-linha" key={i}>
                <Skeleton largura={40} altura={40} raio={99} />
                <div style={{ flex: 1 }}><Skeleton largura="55%" /><div style={{ height: 6 }} /><Skeleton largura="82%" /></div>
              </div>
            ))}
          </div>
        )}
        {erro && <EstadoErro descricao="Erro ao carregar as conversas." aoTentarDeNovo={() => void inbox.live.refetch()} />}
        {!carregando && !erro && visiveis.map((c) => {
          const espera = tierEspera(c.aguardando ? c.aguardandoDesde : null, relogioMs);
          return (
            <button key={c.id} type="button" className={'m-card' + (espera ? ' t-' + espera.tier : '')} title={espera?.label} onClick={() => nav('/m/' + c.id)}>
              <span className="m-av" aria-hidden>{initials(nomeExibicao(c))}</span>
              <span className="m-inf">
                <span className="m-l1">
                  <span className="m-nome">{c.fixada ? '📌 ' : ''}{nomeExibicao(c)}</span>
                  <span className="m-hora num">{c.lastAtMs ? tempoRelativo(new Date(c.lastAtMs).toISOString(), relogioMs) : c.time}</span>
                </span>
                <span className="m-l2">
                  <span className="m-prev">{c.last || '—'}</span>
                  {(c.unread ?? 0) > 0 && <span className="m-nl num">{c.unread > 99 ? '99+' : c.unread}</span>}
                </span>
              </span>
            </button>
          );
        })}
        {!carregando && !erro && visiveis.length === 0 && (
          <div className="m-vazio">{buscaAtiva || nFiltros > 0 ? 'Nenhuma conversa encontrada.' : 'Nenhuma conversa por aqui ainda.'}</div>
        )}
      </div>

      {/* sheet de FILTROS — as mesmas facetas do desktop; predicado compartilhado */}
      {filtroAberto && (
        <div className="veu" role="dialog" aria-modal aria-label="Filtros" onMouseDown={(e) => { if (e.target === e.currentTarget) setFiltroAberto(false); }} style={{ zIndex: 95 }}>
          <div className="m-sheet">
            <div className="m-sheet-topo">
              <b>Filtros{nFiltros > 0 ? ` (${nFiltros})` : ''}</b>
              <span className="m-sheet-acts">
                {nFiltros > 0 && <button type="button" className="lnk" onClick={() => setFiltros(FILTROS_VAZIOS())}>Limpar tudo</button>}
                <button type="button" className="x" aria-label="Fechar" onClick={() => setFiltroAberto(false)}>×</button>
              </span>
            </div>
            <div className="m-sheet-lista m-f-corpo">
              {(etiquetasQ.data ?? []).length > 0 && (
                <div className="m-f-sec">
                  <div className="m-f-tit">Etiqueta</div>
                  <div className="m-f-grid">
                    {(etiquetasQ.data ?? []).map((e) => (
                      <button key={e.id} type="button" className={'m-f-it' + (filtros.etiquetas.has(e.nome) ? ' on' : '')} onClick={() => altFaceta('etiquetas', e.nome)}>
                        <span className="dot" style={{ background: corDaEtiqueta(e.nome, etiquetasQ.data) }} aria-hidden />{e.nome}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="m-f-sec">
                <div className="m-f-tit">Atendente</div>
                <div className="m-f-grid">
                  <button type="button" className={'m-f-it' + (filtros.atendentes.has('') ? ' on' : '')} onClick={() => altFaceta('atendentes', '')}>Não atribuído</button>
                  {(usuariosQ.data ?? []).map((u) => (
                    <button key={u.id} type="button" className={'m-f-it' + (filtros.atendentes.has(u.id) ? ' on' : '')} onClick={() => altFaceta('atendentes', u.id)}>
                      {u.nome}{u.id === user?.id ? ' (você)' : ''}
                    </button>
                  ))}
                </div>
              </div>
              <div className="m-f-sec">
                <div className="m-f-tit">IA / bot</div>
                <div className="m-f-grid">
                  {IA_OPCOES.map(([k, rot]) => (
                    <button key={k} type="button" className={'m-f-it' + (filtros.ia.has(k) ? ' on' : '')} onClick={() => altFaceta('ia', k)}>{rot}</button>
                  ))}
                </div>
              </div>
              <div className="m-f-sec">
                <div className="m-f-tit">Situação</div>
                <div className="m-f-grid">
                  {SITUACAO_OPCOES.map(([k, rot]) => (
                    <button key={k} type="button" className={'m-f-it' + (filtros.situacao.has(k) ? ' on' : '')} onClick={() => altFaceta('situacao', k)}>{rot}</button>
                  ))}
                </div>
              </div>
              {etapasFiltro.length > 0 && (
                <div className="m-f-sec">
                  <div className="m-f-tit">Etapa do Kanban</div>
                  <div className="m-f-grid">
                    {etapasFiltro.map((e) => (
                      <button key={e.nome} type="button" className={'m-f-it' + (filtros.etapas.has(e.nome) ? ' on' : '')} onClick={() => altFaceta('etapas', e.nome)}>
                        <span className="dot" style={{ background: e.cor ?? 'var(--txt-3)' }} aria-hidden />{e.nome}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {inbox.realCanais.length > 0 && (
                <>
                  <div className="m-f-sec">
                    <div className="m-f-tit">Número / canal</div>
                    <div className="m-f-grid">
                      {inbox.realCanais.map((c) => (
                        <button key={c.id} type="button" className={'m-f-it' + (filtros.canais.has(c.id) ? ' on' : '')} onClick={() => altFaceta('canais', c.id)}>
                          {c.alias}{c.transporte === 'cloud_api' ? ' · ✓ Oficial' : ' · QR'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="m-f-sec">
                    <div className="m-f-tit">Conexão</div>
                    <div className="m-f-grid">
                      <button type="button" className={'m-f-it' + (filtros.transporte.has('cloud_api') ? ' on' : '')} onClick={() => altFaceta('transporte', 'cloud_api')}>✓ Oficial (API Meta)</button>
                      <button type="button" className={'m-f-it' + (filtros.transporte.has('evolution') ? ' on' : '')} onClick={() => altFaceta('transporte', 'evolution')}>QR (não oficial)</button>
                    </div>
                  </div>
                </>
              )}
              <div className="m-f-sec">
                <div className="m-f-tit">Mais</div>
                <div className="m-f-grid">
                  <button type="button" className={'m-f-it' + (filtros.naoLidas ? ' on' : '')} onClick={() => setFiltros((f) => ({ ...f, naoLidas: !f.naoLidas }))}>Só não lidas</button>
                  <button type="button" className={'m-f-it' + (filtros.arquivadas ? ' on' : '')} onClick={() => setFiltros((f) => ({ ...f, arquivadas: !f.arquivadas }))}>Só arquivadas</button>
                </div>
              </div>
              <div className="m-f-sec">
                <div className="m-f-tit">Período</div>
                <div className="m-f-grid">
                  {PERIODO_OPCOES.map(([k, rot]) => (
                    <button key={k} type="button" className={'m-f-it' + (filtros.periodo === k ? ' on' : '')} onClick={() => setFiltros((f) => ({ ...f, periodo: f.periodo === k ? null : k }))}>{rot}</button>
                  ))}
                </div>
              </div>
            </div>
            <button type="button" className="m-f-aplicar" onClick={() => setFiltroAberto(false)}>
              Ver conversas{nFiltros > 0 ? ` (${visiveis.length})` : ''}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
