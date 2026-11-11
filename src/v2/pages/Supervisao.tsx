import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { periodoDash, useDashV5, type PresetDash } from '@/data/dashboardV5';
import type { AtendenteV5 } from '@/data/dashboardV5.tipos';
import { fmtDuracaoMin, fmtInt } from '@/data/dashboardV5.formato';
import { spHoje } from '@/data/relatorios';
import { useRadarAvisos } from '@/data/vacuo';
import { SUPERVISAO_REAL, radarDoAtendente, resumirCarteira, useEquipeAoVivo } from '@/data/supervisao';
import { CardVidro, EstadoErro, Segmentado, Skeleton } from '../components';
import { VisualizadorImagem } from '../components/VisualizadorImagem';
import { Celular } from './supervisao/Celular';
import { Faixa, type ControleFaixa } from './supervisao/Faixa';
import { FichaAtendente, type DadosPosto } from './supervisao/FichaAtendente';
import { corDe, fmtHa, iniciaisDe, tomEspera } from './supervisao/zapUi';
import './supervisao/supervisao.css';

/* ------------------------------------------------------------------
   Painel da Equipe (Gestão, 29/10) — pedido do dono: "vários
   celulares, um por atendente, exatamente igual ao WhatsApp", para o
   gestor acompanhar cada um de perto, com as informações de cada pessoa.
   Cada posto = o celular (lista + conversa, ao vivo, somente leitura)
   + os números do período (os mesmos do Dashboard) + a situação de
   agora (quem espera resposta e quem está na Central de Avisos).
   A ficha (gaveta) abre o detalhe da pessoa e leva direto à conversa.
   ------------------------------------------------------------------ */

type Tamanho = 'p' | 'm' | 'g';
type Ordem = 'nome' | 'espera' | 'fechados';
type PresetSup = Extract<PresetDash, 'hoje' | '7d' | 'mes_caf'>;

/** o aparelho é desenhado em 418 × 872 (iPhone 390 × 844 + moldura) e reduzido com zoom */
const LARGURA_TEL = 418;
const ZOOM: Record<Tamanho, number> = { p: 0.6, m: 0.7, g: 0.84 };
const CHAVE_TAMANHO = 'atenvo-supervisao-tamanho';
const PERIODOS: { valor: PresetSup; rotulo: string }[] = [
  { valor: 'hoje', rotulo: 'Hoje' },
  { valor: '7d', rotulo: '7 dias' },
  { valor: 'mes_caf', rotulo: 'Nosso mês' },
];
const ROTULO_PERIODO: Record<PresetSup, string> = { hoje: 'Hoje', '7d': 'Últimos 7 dias', mes_caf: 'Nosso mês' };
const ORDENS: { valor: Ordem; rotulo: string }[] = [
  { valor: 'nome', rotulo: 'Nome' },
  { valor: 'espera', rotulo: 'Mais esperando' },
  { valor: 'fechados', rotulo: 'Mais fechados' },
];
const TAMANHOS: { valor: Tamanho; rotulo: string }[] = [
  { valor: 'p', rotulo: 'P' },
  { valor: 'm', rotulo: 'M' },
  { valor: 'g', rotulo: 'G' },
];
const PAPEL: Record<string, string> = { admin: 'Administrador', gestor: 'Gestor', atendente: 'Atendente' };

function lerTamanho(): Tamanho {
  try {
    const v = localStorage.getItem(CHAVE_TAMANHO);
    return v === 'p' || v === 'g' ? v : 'm';
  } catch { return 'm'; }
}

/** Relógio da tela: a hora da barra do celular e os "há X min" andam sozinhos. */
function useAgora(passoMs = 15_000): number {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setAgora(Date.now()), passoMs);
    return () => window.clearInterval(t);
  }, [passoMs]);
  return agora;
}

function Posto({ p, rotuloPeriodo, agora, zoom, aberta, foco, aoAbrir, aoFicha, aoAbrirNoAtenvo, aoAmpliar }: {
  p: DadosPosto; rotuloPeriodo: string; agora: number; zoom: number; aberta: string | null; foco: boolean;
  aoAbrir: (conversaId: string | null) => void; aoFicha: () => void;
  aoAbrirNoAtenvo: (conversaId: string) => void; aoAmpliar: (url: string, nome: string) => void;
}) {
  const { membro: m, resumo, radar, stats: s } = p;
  const espera = resumo.esperaMaisAntiga ? Date.parse(resumo.esperaMaisAntiga) : 0;
  const tomRadar = radar.ultimoAviso ? 'rubro' : radar.emAviso ? 'ambar' : 'ok';
  return (
    <article className={foco ? 'sv-posto sv-posto-foco' : 'sv-posto'} data-faixa-id={m.id} aria-label={`Celular de ${m.nome}`}>
      <header className="sv-posto-cab">
        <span className="sv-av" style={{ background: corDe(m.id) }} aria-hidden>{iniciaisDe(m.nome)}</span>
        <div className="sv-posto-quem">
          <b>{m.nome}</b>
          <span>{PAPEL[m.papel] ?? m.papel} · <span className="num">{fmtInt(resumo.total)}</span> {resumo.total === 1 ? 'cliente' : 'clientes'}</span>
        </div>
        <button type="button" className="sv-ficha-bt" onClick={aoFicha}>Ver ficha</button>
      </header>

      <div className="sv-posto-tel">
        <Celular convs={p.convs} aberta={aberta} aoAbrir={aoAbrir} agora={agora} nomeAtendente={m.nome} zoom={zoom}
          aoAbrirNoAtenvo={aoAbrirNoAtenvo} aoAmpliar={aoAmpliar} />
      </div>

      <div className="sv-posto-nums" aria-label={`Desempenho · ${rotuloPeriodo}`}>
        <div><span>Recebidos</span><b className="num">{fmtInt(s?.recebidos ?? null)}</b></div>
        <div><span>Fechados</span><b className="num">{fmtInt(s?.ganhos ?? null)}</b></div>
        <div><span>Resposta</span><b className="num">{fmtDuracaoMin(s?.respMedianaMin ?? null)}</b></div>
      </div>

      <div className="sv-posto-vivo">
        <span className={`sv-pv sv-tom-${resumo.aguardando ? tomEspera(espera, agora) : 'ok'}`}>
          <i aria-hidden />
          {resumo.aguardando
            ? <><b className="num">{resumo.aguardando}</b>&nbsp;aguardando resposta · mais antigo {fmtHa(espera, agora)}</>
            : 'Ninguém esperando resposta'}
        </span>
        <span className={`sv-pv sv-tom-${tomRadar}`}>
          <i aria-hidden />
          {radar.emAviso
            ? <><b className="num">{radar.emAviso}</b>&nbsp;na Central de Avisos{radar.ultimoAviso ? ` · ${radar.ultimoAviso} no último aviso` : ''}</>
            : 'Em dia na Central de Avisos'}
        </span>
      </div>
    </article>
  );
}

export default function SupervisaoV2() {
  const navigate = useNavigate();
  const agora = useAgora();
  const hoje = spHoje();
  const [preset, setPreset] = useState<PresetSup>('hoje');
  const [ordem, setOrdem] = useState<Ordem>('nome');
  const [tamanho, setTamanhoRaw] = useState<Tamanho>(lerTamanho);
  const setTamanho = (t: Tamanho) => {
    setTamanhoRaw(t);
    try { localStorage.setItem(CHAVE_TAMANHO, t); } catch { /* sem storage: vale só nesta visita */ }
  };
  const zoom = ZOOM[tamanho];

  const equipe = useEquipeAoVivo();
  // `hoje` nas dependências: depois da meia-noite "Hoje" passa a ser o dia novo
  const periodo = useMemo(() => periodoDash(preset), [preset, hoje]); // eslint-disable-line react-hooks/exhaustive-deps
  const dq = useDashV5(periodo);
  const rq = useRadarAvisos();

  const statsPorId = useMemo(() => {
    const m = new Map<string, AtendenteV5>();
    for (const a of dq.data?.atendentes ?? []) m.set(a.usuarioId, a);
    return m;
  }, [dq.data]);
  const inicioHoje = useMemo(() => Date.parse(`${hoje}T00:00:00-03:00`), [hoje]);

  const postos: DadosPosto[] = useMemo(() => equipe.membros.map((membro) => {
    const convs = equipe.porAtendente.get(membro.id) ?? [];
    return {
      membro,
      convs,
      resumo: resumirCarteira(convs, inicioHoje, agora),
      radar: radarDoAtendente(rq.data ?? [], membro),
      stats: statsPorId.get(membro.id) ?? null,
    };
  }), [equipe.membros, equipe.porAtendente, inicioHoje, agora, rq.data, statsPorId]);

  const ordenados = useMemo(() => {
    const xs = [...postos];
    const porNome = (a: DadosPosto, b: DadosPosto) => a.membro.nome.localeCompare(b.membro.nome, 'pt-BR');
    if (ordem === 'espera') xs.sort((a, b) => b.resumo.aguardando - a.resumo.aguardando || porNome(a, b));
    else if (ordem === 'fechados') xs.sort((a, b) => (b.stats?.ganhos ?? -1) - (a.stats?.ganhos ?? -1) || porNome(a, b));
    return xs;
  }, [postos, ordem]);

  const total = useMemo(() => {
    const t = { aguardando: 0, hoje: 0, carteira: 0, emAviso: 0, ultimo: 0, ligar: 0, fech: 0, rec: 0, espera: null as null | { ms: number; nome: string } };
    for (const p of postos) {
      t.aguardando += p.resumo.aguardando;
      t.hoje += p.resumo.hoje;
      t.carteira += p.resumo.total;
      t.emAviso += p.radar.emAviso;
      t.ultimo += p.radar.ultimoAviso;
      t.ligar += p.radar.ligar;
      t.fech += p.stats?.ganhos ?? 0;
      t.rec += p.stats?.recebidos ?? 0;
      const ms = p.resumo.esperaMaisAntiga ? Date.parse(p.resumo.esperaMaisAntiga) : 0;
      if (ms && (!t.espera || ms < t.espera.ms)) t.espera = { ms, nome: p.membro.nome };
    }
    return t;
  }, [postos]);

  /* conversa aberta em cada celular (a ficha também abre conversa num celular) */
  const [abertas, setAbertas] = useState<Record<string, string | null>>({});
  const abrirNoCelular = useCallback((membroId: string, conversaId: string | null) => {
    setAbertas((a) => ({ ...a, [membroId]: conversaId }));
  }, []);

  const [fichaId, setFichaId] = useState<string | null>(null);
  const fichaPosto = fichaId ? postos.find((p) => p.membro.id === fichaId) ?? null : null;

  /* da ficha para o celular: fecha a gaveta, corre a faixa até o celular e acende a borda */
  const faixa = useRef<ControleFaixa>(null);
  const [naTela, setNaTela] = useState<ReadonlySet<string>>(new Set());
  const [foco, setFoco] = useState<string | null>(null);
  useEffect(() => {
    if (!foco) return;
    const t = window.setTimeout(() => setFoco(null), 1_800);
    return () => window.clearTimeout(t);
  }, [foco]);
  const irParaConversa = useCallback((membroId: string, conversaId: string) => {
    abrirNoCelular(membroId, conversaId);
    setFichaId(null);
    setFoco(membroId);
    window.requestAnimationFrame(() => faixa.current?.irPara(membroId));
  }, [abrirNoCelular]);

  const abrirNoAtenvo = useCallback((conversaId: string) => {
    navigate(`/whatsapp?conversa=${encodeURIComponent(conversaId)}`);
  }, [navigate]);

  const [foto, setFoto] = useState<{ url: string; nome: string } | null>(null);
  const aoAmpliar = useCallback((url: string, nome: string) => setFoto({ url, nome }), []);

  const rotuloPeriodo = ROTULO_PERIODO[preset];
  const larguraTel = Math.round(LARGURA_TEL * zoom);
  const espera = total.espera;

  return (
    <div className="sv-pg">
      <header className="ph sv-cab">
        <div className="sv-cab-tits">
          <h2>Painel da Equipe{!SUPERVISAO_REAL && <span className="sv-demo">Dados de demonstração</span>}</h2>
          <p><span className="sv-vivo"><i aria-hidden />Ao vivo</span>O WhatsApp de cada atendente, em tempo real. Somente leitura.</p>
        </div>
        <div className="sv-cab-ctl">
          <span className="sv-rot">Números</span>
          <Segmentado rotulo="Período dos números" opcoes={PERIODOS} valor={preset} aoMudar={setPreset} />
        </div>
      </header>

      <CardVidro className="sv-faixa" aria-label="Resumo da equipe">
        <div className="sv-fx">
          <span className="sv-fx-r">Aguardando resposta</span>
          <b className="num">{fmtInt(total.aguardando)}</b>
          <span className="sv-fx-s">
            {espera ? <>mais antigo: {espera.nome} · <em className={`sv-tom-${tomEspera(espera.ms, agora)}`}>{fmtHa(espera.ms, agora)}</em></> : 'ninguém esperando resposta'}
          </span>
        </div>
        <div className="sv-fx">
          <span className="sv-fx-r">Conversas hoje</span>
          <b className="num">{fmtInt(total.hoje)}</b>
          <span className="sv-fx-s"><span className="num">{fmtInt(total.carteira)}</span> clientes nas carteiras</span>
        </div>
        <div className="sv-fx">
          <span className="sv-fx-r">Fechados · {rotuloPeriodo}</span>
          <b className="num">{dq.data ? fmtInt(total.fech) : '—'}</b>
          <span className="sv-fx-s">{dq.data ? <><span className="num">{fmtInt(total.rec)}</span> leads recebidos</> : 'carregando…'}</span>
        </div>
        <div className="sv-fx">
          <span className="sv-fx-r">Na Central de Avisos</span>
          <b className="num">{fmtInt(total.emAviso)}</b>
          <span className="sv-fx-s">
            {total.ultimo ? <em className="sv-tom-rubro">{total.ultimo} no último aviso</em> : 'nenhum no último aviso'}
            {total.ligar ? ` · ${total.ligar} para ligar` : ''}
          </span>
        </div>
      </CardVidro>

      <div className="sv-barra">
        <div className="sv-barra-esq">
          <b>Equipe</b><span className="sv-cont num">{postos.length}</span>
          {/* quem está na tela fica aceso; clique corre a faixa até o celular da pessoa */}
          {ordenados.length > 1 && (
            <nav className="sv-pontos" aria-label="Celulares da equipe">
              {ordenados.map(({ membro: m }) => (
                <button key={m.id} type="button" className={naTela.has(m.id) ? 'sv-ponto sv-ponto-on' : 'sv-ponto'}
                  onClick={() => faixa.current?.irPara(m.id)} aria-label={`Ir para o celular de ${m.nome}`} aria-current={naTela.has(m.id) || undefined}>
                  <i style={{ background: corDe(m.id) }} aria-hidden />{m.nome}
                </button>
              ))}
            </nav>
          )}
        </div>
        <div className="sv-barra-dir">
          <span className="sv-rot">Ordenar</span>
          <Segmentado rotulo="Ordenar os celulares" opcoes={ORDENS} valor={ordem} aoMudar={setOrdem} />
          <span className="sv-rot">Tamanho</span>
          <Segmentado rotulo="Tamanho dos celulares" opcoes={TAMANHOS} valor={tamanho} aoMudar={setTamanho} />
        </div>
      </div>

      {equipe.erro && !postos.length ? (
        <CardVidro className="sv-erro">
          <EstadoErro titulo="Não foi possível carregar as conversas da equipe" descricao={equipe.erro} aoTentarDeNovo={equipe.recarregar} />
        </CardVidro>
      ) : (
        <Faixa ref={faixa} larguraTel={larguraTel} ids={equipe.carregando ? [] : ordenados.map((p) => p.membro.id)} aoMudarNaTela={setNaTela}>
          {equipe.carregando
            ? [0, 1, 2, 3].map((i) => (
              <div key={i} className="sv-posto sv-posto-esq" aria-hidden>
                <div className="sv-posto-cab"><Skeleton largura={40} altura={40} raio={99} /><Skeleton largura="50%" altura={14} /></div>
                <Skeleton largura={larguraTel} altura={Math.round(872 * zoom)} raio={Math.round(64 * zoom)} />
              </div>
            ))
            : ordenados.map((p) => (
              <Posto
                key={p.membro.id}
                p={p}
                rotuloPeriodo={rotuloPeriodo}
                agora={agora}
                zoom={zoom}
                aberta={abertas[p.membro.id] ?? null}
                foco={foco === p.membro.id}
                aoAbrir={(id) => abrirNoCelular(p.membro.id, id)}
                aoFicha={() => setFichaId(p.membro.id)}
                aoAbrirNoAtenvo={abrirNoAtenvo}
                aoAmpliar={aoAmpliar}
              />
            ))}
        </Faixa>
      )}
      {!equipe.carregando && !equipe.erro && !postos.length && (
        <CardVidro className="sv-vazio">Nenhum atendente com carteira de clientes ainda.</CardVidro>
      )}

      <FichaAtendente
        aberto={!!fichaPosto}
        posto={fichaPosto}
        postos={postos}
        rotuloPeriodo={rotuloPeriodo}
        agora={agora}
        aoFechar={() => setFichaId(null)}
        aoAbrirConversa={irParaConversa}
      />
      {foto && <VisualizadorImagem url={foto.url} nome={foto.nome} aoFechar={() => setFoto(null)} />}
    </div>
  );
}
