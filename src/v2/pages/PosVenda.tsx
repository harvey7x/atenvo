/* ============================================================================
   Pós-venda — acompanhamento dos clientes FECHADOS (ganho).
   Anatomia executiva do Dashboard: base monocromática, cor só como semântica
   (rubro = aguardando resposta), caps nos rótulos, números tabulares.

   DADOS REAIS: a carteira vem de useWaConversations — a MESMA fonte do inbox
   (ganho "grudento", não-lidas, aguardando derivado da última mensagem real,
   cache compartilhado com o atendimento). A lista traz só a última mensagem
   de cada conversa: as "Últimas mensagens" do painel vêm do histórico da
   selecionada (useWaMensagens, o mesmo do inbox). Complementos leves
   (pendências abertas, total de mensagens) em src/data/posvenda.ts. Em modo
   demo a carteira vem do seed do inbox, como na prévia aprovada.
   ============================================================================ */
import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import './ia.css';
import './posvenda.css';
import { BotaoPrimario, BotaoSec, CardVidro, EstadoErro, Input, Skeleton } from '../components';
import { DEMO_MODE } from '@/lib/demo';
import { seedWa } from './whatsappSeed';
import { nomeExibicao, situacaoDe, tierEspera } from '../lib/waUi';
import { WA_REAL, useWaConversations, useWaMensagens } from '@/data/whatsapp';
import { useOrgUsuarios } from '@/data/atendimento';
import { useMensagensTotal, usePendenciasAbertas } from '@/data/posvenda';
import type { WaContact } from '@/data/whatsappDemo';

/* ---- helpers ---- */
const iniciais = (nome: string) =>
  nome.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');
const aguardaResposta = (c: WaContact) => (c.unread ?? 0) > 0 || !!c.aguardando;
/** "24 min" / "1 h 50" / "3 d" a partir do timestamp da última interação */
function espera(ms: number | undefined, agora: number): string {
  if (!ms) return '—';
  const m = Math.max(1, Math.round((agora - ms) / 60_000));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 ? `${h} h ${String(m % 60).padStart(2, '0')}` : `${h} h`;
  const d = Math.floor(h / 24);
  return `${d} d`;
}
const desdeDe = (c: WaContact) =>
  c.aguardandoDesde ? new Date(c.aguardandoDesde).getTime() : c.lastAtMs;

/* Pendências do seed — só a prévia demo; no real vêm de usePendenciasAbertas */
const PENDENCIAS_DEMO: Record<string, string[]> = {
  'wa-odete': ['Avisar quando o jurídico der entrada no processo'],
  'wa-pedro': ['Carta do banco — pedir foto e anexar ao caso'],
};

/* ---- peças da anatomia (espelham o Dashboard) ---- */
function Hero({ rotulo, val, sub, tom, atraso }: {
  rotulo: string; val: ReactNode; sub?: ReactNode; tom?: 'rubro' | 'neutro'; atraso?: number;
}) {
  return (
    <CardVidro spot sobe atraso={atraso} className="pv-hero">
      <div className="rot">{rotulo}</div>
      <div className={'val num' + (tom === 'rubro' ? ' rub' : '')}>{val}</div>
      {sub && <div className="pe">{sub}</div>}
    </CardVidro>
  );
}
function Secao({ titulo, sub, acao, children, atraso, className }: {
  titulo: string; sub?: ReactNode; acao?: ReactNode; children: ReactNode; atraso?: number; className?: string;
}) {
  return (
    <CardVidro sobe atraso={atraso} className={'pv-sec ' + (className ?? '')}>
      <div className="pv-sec-cab">
        <div><div className="t">{titulo}</div>{sub && <div className="s">{sub}</div>}</div>
        {acao}
      </div>
      {children}
    </CardVidro>
  );
}
function Vazio({ texto }: { texto: string }) {
  return <div className="pv-vazio"><span aria-hidden>◌</span> {texto}</div>;
}

export default function PosVendaV2() {
  const nav = useNavigate();
  const agora = Date.now();
  const live = useWaConversations();
  const usuariosQ = useOrgUsuarios();
  // Carteira = SÓ os fechados (mesma régua da aba Fechados do inbox: situação 'ganho')
  const demo = useMemo(() => (DEMO_MODE ? seedWa() : []), []);
  const carteira = useMemo(() => {
    const base = WA_REAL ? (live.data ?? []) : demo;
    return base.filter((c) => situacaoDe(c).variante === 'ganho');
  }, [live.data, demo]);
  const carregando = WA_REAL && live.isLoading && carteira.length === 0;
  const comErro = WA_REAL && live.isError && carteira.length === 0;

  const [busca, setBusca] = useState('');
  const [selId, setSelId] = useState<string | null>(null);

  const fila = useMemo(
    () => carteira.filter(aguardaResposta).sort((a, b) => (desdeDe(a) ?? 0) - (desdeDe(b) ?? 0)),
    [carteira],
  );
  const termo = busca.trim().toLowerCase();
  const listada = useMemo(() => {
    const base = termo
      ? carteira.filter((c) => nomeExibicao(c).toLowerCase().includes(termo) || (c.phone ?? '').includes(termo.replace(/\D/g, '') || termo))
      : carteira;
    // aguardando primeiro (espera mais antiga no topo), depois em dia por recência
    return [...base].sort((a, b) => {
      const aw = aguardaResposta(a) ? 0 : 1, bw = aguardaResposta(b) ? 0 : 1;
      return aw - bw || (aw === 0 ? (desdeDe(a) ?? 0) - (desdeDe(b) ?? 0) : (b.lastAtMs ?? 0) - (a.lastAtMs ?? 0));
    });
  }, [carteira, termo]);
  const sel = carteira.find((c) => c.id === selId) ?? null;
  const nomePorId = (id: string | null | undefined) => {
    if (!id) return 'Não atribuído';
    if (!WA_REAL) return 'Você';
    return usuariosQ.data?.find((u) => u.id === id)?.nome ?? 'Atendente';
  };
  const abrirConversa = (c: WaContact) => nav('/whatsapp?conversa=' + encodeURIComponent(c.id));
  const maisAntiga = fila.length > 0 ? espera(desdeDe(fila[0]), agora) : null;

  // complementos do painel (real): pendências abertas + total de mensagens
  const pendenciasQ = usePendenciasAbertas(WA_REAL ? sel?.contatoId : null);
  const msgTotalQ = useMensagensTotal(WA_REAL ? sel?.id : null);
  // "Últimas mensagens": histórico da selecionada (a lista só traz a última). Enquanto carrega
  // (ou se falhar), mostra o que veio com a lista — nunca fica vazio à toa.
  const historicoSelQ = useWaMensagens(WA_REAL ? sel?.id : null);
  const msgsSel = sel ? (WA_REAL && historicoSelQ.data ? historicoSelQ.data : sel.msgs) : [];
  const pendentesSel: string[] = sel
    ? (WA_REAL ? (pendenciasQ.data ?? []).map((p) => p.oQue || p.tipo || 'Pendência') : PENDENCIAS_DEMO[sel.id] ?? [])
    : [];

  return (
    <div className="ia-pagina pv-pg">
      <div className="ph sobe">
        <div>
          <h1>Pós-venda</h1>
          <p>Acompanhamento dos clientes fechados — resposta, pendências e histórico em um só lugar.</p>
        </div>
      </div>

      {/* grade ÚNICA de 12 colunas: heróis (4+4+4) e, embaixo, fila/carteira (8) +
          painel (4) — as calhas verticais batem exatamente entre as duas fileiras */}
      <div className="pv-grid">
        <Hero rotulo="Aguardando resposta" atraso={0.02}
          val={carregando ? '…' : fila.length} tom={fila.length > 0 ? 'rubro' : 'neutro'}
          sub={maisAntiga ? <>espera mais antiga: <b className="num">{maisAntiga}</b></> : 'nenhum retorno pendente'} />
        <Hero rotulo="Na carteira" atraso={0.06} val={carregando ? '…' : carteira.length} sub="clientes com contrato fechado" />
        <Hero rotulo="Em dia" atraso={0.1} val={carregando ? '…' : carteira.length - fila.length} sub="sem retorno pendente" />

        {comErro ? (
          <CardVidro sobe className="pv-sec pv-full"><EstadoErro descricao="Erro ao carregar a carteira." aoTentarDeNovo={() => void live.refetch()} /></CardVidro>
        ) : carregando ? (
          <CardVidro sobe className="pv-sec pv-full" aria-busy>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 0' }}>
                <Skeleton largura={30} altura={30} raio={99} />
                <div style={{ flex: 1 }}><Skeleton largura="38%" /><div style={{ height: 5 }} /><Skeleton largura="62%" /></div>
              </div>
            ))}
          </CardVidro>
        ) : carteira.length === 0 ? (
          <CardVidro sobe className="pv-sec pv-full"><Vazio texto="Quando uma oportunidade for marcada como ganha, o cliente entra aqui para o acompanhamento." /></CardVidro>
        ) : (
          <>
          <div className="pv-main">
            {/* fila do dia: quem está esperando a casa */}
            <Secao titulo="Precisa de resposta" sub="espera mais antiga primeiro" atraso={0.14}
              acao={fila.length > 0 ? <span className="pv-cont num">{fila.length}</span> : undefined}>
              {fila.length === 0 ? (
                <Vazio texto="Nenhum cliente aguardando resposta." />
              ) : fila.map((c) => {
                const w = tierEspera(c.aguardandoDesde ?? (c.lastAtMs ? new Date(c.lastAtMs).toISOString() : null), agora);
                return (
                  <div key={c.id} className={'pv-fila' + (c.id === selId ? ' on' : '')} role="button" tabIndex={0}
                    onClick={() => setSelId(c.id)} onKeyDown={(e) => { if (e.key === 'Enter') setSelId(c.id); }}>
                    <span className="pv-av">{iniciais(nomeExibicao(c))}</span>
                    <span className="pv-fila-tx">
                      <span className="nm">{nomeExibicao(c)}{(c.unread ?? 0) > 0 && <i className="nl num">{c.unread}</i>}</span>
                      <span className="pr">{c.last || '—'}</span>
                    </span>
                    <span className={'pv-wait' + (w ? ' ' + w.tier : '')}>
                      <b className="num">{espera(desdeDe(c), agora)}</b>
                      <span>em espera</span>
                    </span>
                    <BotaoSec onClick={(e) => { e.stopPropagation(); abrirConversa(c); }}>Responder</BotaoSec>
                  </div>
                );
              })}
            </Secao>

            {/* carteira completa — "tabela" em GRID (anatomia .db-traf do Dashboard) */}
            <Secao titulo="Carteira" sub={`${carteira.length} cliente${carteira.length === 1 ? '' : 's'}`} atraso={0.18}
              acao={<Input className="pv-busca" placeholder="Buscar cliente…" value={busca} onChange={(e) => setBusca(e.target.value)} />}>
              {listada.length === 0 ? (
                <Vazio texto="Nenhum cliente encontrado para a busca." />
              ) : (
                <div className="pv-tab" role="table" aria-label="Carteira de clientes fechados">
                  {/* CLIENTE ancora à esquerda, SITUAÇÃO à direita; colunas do meio CENTRADAS */}
                  <div className="lin cab" role="row">
                    <span role="columnheader">Cliente</span>
                    <span className="ct" role="columnheader">Responsável</span>
                    <span className="ct" role="columnheader">Última interação</span>
                    <span className="sit" role="columnheader">Situação</span>
                  </div>
                  {listada.map((c) => (
                    <div key={c.id} role="row" tabIndex={0}
                      className={'lin' + (c.id === selId ? ' on' : '')}
                      onClick={() => setSelId(c.id)}
                      onKeyDown={(e) => { if (e.key === 'Enter') setSelId(c.id); }}>
                      <span className="nm" role="cell"><span className="pv-av">{iniciais(nomeExibicao(c))}</span>{nomeExibicao(c)}</span>
                      <span className="ct" role="cell">{nomePorId(c.respId)}</span>
                      <span className="ct" role="cell">{c.lastAtMs ? 'há ' + espera(c.lastAtMs, agora) : (c.lastInter || c.time || '—')}</span>
                      <span className={'sit ' + (aguardaResposta(c) ? 'er' : 'ok')} role="cell">
                        {aguardaResposta(c) ? 'Aguardando resposta' : 'Em dia'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Secao>
          </div>

          {/* painel do cliente selecionado */}
          <CardVidro sobe atraso={0.22} className="pv-sec pv-painel">
            {!sel ? (
              <Vazio texto="Selecione um cliente para ver os detalhes." />
            ) : (
              <>
                <div className="pv-p-cab">
                  <span className="pv-av g">{iniciais(nomeExibicao(sel))}</span>
                  <div className="pv-p-id">
                    <b>{nomeExibicao(sel)}</b>
                    <span className="num">{sel.phone ? '+' + sel.phone.replace(/\D/g, '') : '—'}</span>
                  </div>
                </div>
                {/* pares rótulo/valor em linhas alinhadas: caps à esquerda, valor à direita */}
                <div className="pv-p-meta">
                  <div className="lin"><span>Responsável</span><b>{nomePorId(sel.respId)}</b></div>
                  <div className="lin"><span>Última interação</span><b>{sel.lastAtMs ? 'há ' + espera(sel.lastAtMs, agora) : (sel.lastInter || sel.time || '—')}</b></div>
                  <div className="lin"><span>Mensagens na conversa</span><b className="num">{WA_REAL ? (msgTotalQ.data ?? '…') : sel.msgs.length}</b></div>
                  {sel.tags.length > 0 && (
                    <div className="lin"><span>Etiquetas</span><b>{sel.tags.join(' · ')}</b></div>
                  )}
                </div>
                <div className="pv-p-sec">
                  <div className="cap">Pendências</div>
                  {pendentesSel.length === 0
                    ? <div className="pv-mudo">Nenhuma pendência aberta.</div>
                    : pendentesSel.map((p) => <div key={p} className="pv-pend">{p}</div>)}
                </div>
                {sel.notes && (
                  <div className="pv-p-sec"><div className="cap">Anotações</div><div className="pv-mudo">{sel.notes}</div></div>
                )}
                {/* telinha estilo WhatsApp: balões cliente à esq., equipe à dir., hora no balão */}
                <div className="pv-p-sec">
                  <div className="cap">Últimas mensagens</div>
                  <div className="pv-fone">
                    <div className="pv-fone-top">
                      <span className="pv-av s">{iniciais(nomeExibicao(sel))}</span>
                      <div className="id">
                        <b>{nomeExibicao(sel)}</b>
                        <span>WhatsApp</span>
                      </div>
                    </div>
                    <div className="pv-fone-chat">
                      {msgsSel.slice(-4).map((m, i) => (
                        <div key={i} className={'pv-bolha' + (m.dir === 'out' ? ' out' : '')}>
                          <span className="tx">{m.text || (m.tipo === 'audio' ? 'Mensagem de áudio' : m.tipo === 'imagem' ? 'Imagem' : m.tipo === 'documento' ? `Documento — ${m.nome ?? ''}` : m.tipo === 'video' ? 'Vídeo' : '—')}</span>
                          {m.time && <span className="hr num">{m.time}</span>}
                        </div>
                      ))}
                      {msgsSel.length === 0 && <div className="pv-mudo">Sem mensagens recentes.</div>}
                    </div>
                  </div>
                </div>
                <div className="pv-p-acoes">
                  <BotaoPrimario onClick={() => abrirConversa(sel)}>Abrir conversa</BotaoPrimario>
                </div>
              </>
            )}
          </CardVidro>
          </>
        )}
      </div>
    </div>
  );
}
