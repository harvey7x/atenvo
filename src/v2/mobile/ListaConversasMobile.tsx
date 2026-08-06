import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { WaContact } from '@/data/whatsappDemo';
import { tempoRelativo } from '@/data/slaView';
import { initials } from '@/lib/avatar';
import { useAuth } from '@/context/AuthContext';
import { EstadoErro, Skeleton } from '../components';
import { nomeExibicao, tierEspera } from '../lib/waUi';
import { useInboxMobile } from './MobileShell';

/* ------------------------------------------------------------------
   Tela 1 do mobile (/m): lista de conversas, mais recentes primeiro.
   Filtro deliberadamente um SUBCONJUNTO do desktop (todos/meus/não
   lidas + busca); a ordenação é idêntica (fixada → lastAtMs desc).
   ------------------------------------------------------------------ */

const ABAS = [['todos', 'Todos'], ['meus', 'Meus'], ['naolidas', 'Não lidas']] as const;
type AbaId = typeof ABAS[number][0];

export default function ListaConversasMobile() {
  const nav = useNavigate();
  const { user } = useAuth();
  const { inbox } = useInboxMobile();
  const { contacts, relogioMs, demo } = inbox;
  const [search, setSearch] = useState('');
  const [aba, setAba] = useState<AbaId>('todos');

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
      (!c.arquivada || buscaAtiva) &&
      (aba === 'todos' ? true : aba === 'meus' ? c.respId === user?.id : (c.unread ?? 0) > 0) &&
      (!term || c.name.toLowerCase().includes(term) || c.last.toLowerCase().includes(term) || (c.phone ?? '').toLowerCase().includes(term));
    return contacts.filter(passa).sort((a, b) => (a.fixada === b.fixada ? (b.lastAtMs ?? 0) - (a.lastAtMs ?? 0) : a.fixada ? -1 : 1));
  }, [contacts, aba, term, buscaAtiva, user?.id]);

  const carregando = !demo && inbox.live.isLoading && contacts.length === 0;
  const erro = !demo && inbox.live.isError && contacts.length === 0;

  return (
    <>
      <header className="m-topo">
        <div className="m-titulo">Conversas</div>
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
          <div className="m-vazio">{buscaAtiva ? 'Nenhuma conversa encontrada.' : 'Nenhuma conversa por aqui ainda.'}</div>
        )}
      </div>
    </>
  );
}
