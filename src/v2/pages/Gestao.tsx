import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { BadgeStatus, CardVidro, Chip, Chips, DrawerV2, EstadoVazio, Input, Kpi, TabelaPadrao, type Coluna, type TomStatus } from '../components';
import {
  seedConversas, metricasPorAtendente, resumoIA, resumoGeral, TOM_ETAPA,
  type Conversa, type MetricaAtendente,
} from './gestaoAnalytics';
import './gestao.css';

const CONVERSAS = seedConversas();
const fmtBRL = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const iniciais = (n: string) => n.slice(0, 2).toUpperCase();

/* barra CSS calma (dado é calmo — sem animação de dado) */
function Barra({ v, max, tom = 'tint' }: { v: number; max: number; tom?: 'tint' | 'ok' | 'erro' | 'azul' }) {
  const pct = Math.max(2, Math.round((v / Math.max(1, max)) * 100));
  const cor = tom === 'ok' ? 'var(--verde)' : tom === 'erro' ? 'var(--rubro)' : tom === 'azul' ? 'var(--azul, var(--txt))' : 'rgba(var(--tint), .5)';
  return <div className="gs-bar"><i style={{ width: pct + '%', background: cor }} /></div>;
}
/* colunas de atividade (14 dias) */
function Colunas({ dados }: { dados: number[] }) {
  const max = Math.max(1, ...dados);
  return <div className="gs-cols">{dados.map((d, i) => <div key={i} className="gs-col" title={`${d} atendimentos`}><i style={{ height: Math.max(3, Math.round((d / max) * 100)) + '%' }} /></div>)}</div>;
}

/* =================== dispatcher =================== */
export default function GestaoV2() {
  const { secao } = useParams();
  const [conversa, setConversa] = useState<Conversa | null>(null);
  const abrir = (c: Conversa) => setConversa(c);

  const s = secao ?? 'visao';
  return (
    <div className="gs-wrap">
      <div className="ph sobe">
        <div>
          <div className="cob-migalha">Gestão</div>
          <h2>{ROTULO[s] ?? 'Gestão'}</h2>
          <p>Desempenho da equipe, dos atendimentos e da IA — do panorama ao detalhe. · modo demonstração (dados ilustrativos)</p>
        </div>
      </div>
      {s === 'visao' && <VisaoGeral aoAbrir={abrir} />}
      {s === 'atendentes' && <Atendentes aoAbrir={abrir} />}
      {s === 'ia' && <Inteligencia aoAbrir={abrir} />}
      {s === 'atendimentos' && <Atendimentos aoAbrir={abrir} />}
      {s === 'resultados' && <Resultados />}

      <DrawerV2 aberto={!!conversa} aoFechar={() => setConversa(null)} largura={460}>
        {conversa && <FichaConversa c={conversa} aoFechar={() => setConversa(null)} />}
      </DrawerV2>
    </div>
  );
}
const ROTULO: Record<string, string> = {
  visao: 'Visão geral', atendentes: 'Atendentes', ia: 'Inteligência (IA)', atendimentos: 'Atendimentos', resultados: 'Resultados',
};

/* =================== VISÃO GERAL =================== */
function VisaoGeral({ aoAbrir }: { aoAbrir: (c: Conversa) => void }) {
  const g = useMemo(() => resumoGeral(CONVERSAS), []);
  const ia = useMemo(() => resumoIA(CONVERSAS), []);
  const ats = useMemo(() => metricasPorAtendente(CONVERSAS), []);
  const maxEtapa = Math.max(...g.porEtapa.map((e) => e.n));
  const topConv = [...ats].sort((a, b) => b.conversao - a.conversao).slice(0, 3);
  const maisLentos = [...ats].sort((a, b) => b.primeiraRespMediana - a.primeiraRespMediana).slice(0, 3);
  const recentes = useMemo(() => [...CONVERSAS].sort((a, b) => a.diasAtras - b.diasAtras).slice(0, 6), []);

  return (
    <>
      <div className="kpis sobe">
        <Kpi rotulo="Atendimentos" valor={g.atendimentos} formato="mil" />
        <Kpi rotulo="Conversão" valor={g.conversao} sufixo="%" tomValor="ok" />
        <Kpi rotulo="1ª resposta (mediana)" valor={g.primeiraRespMediana} sufixo=" min" />
        <Kpi rotulo="Ganhos" valor={g.ganhos} formato="mil" tomValor="ok" />
        <Kpi rotulo="IA participou" valor={ia.participacao} sufixo="%" />
      </div>

      <div className="gs-grid2 sobe" style={{ animationDelay: '.06s' }}>
        <CardVidro spot style={{ borderRadius: 'var(--r-card)' }}>
          <div className="card-cab"><h3>Funil de atendimento</h3></div>
          <div className="gs-lista">
            {g.porEtapa.map((e) => (
              <div className="gs-lin" key={e.etapa}>
                <span className="gs-lin-nm"><BadgeStatus tom={TOM_ETAPA[e.etapa]}>{e.etapa}</BadgeStatus></span>
                <Barra v={e.n} max={maxEtapa} tom={e.etapa === 'Fechado' ? 'ok' : e.etapa === 'Perdido' ? 'erro' : 'tint'} />
                <span className="gs-lin-v num">{e.n}</span>
              </div>
            ))}
          </div>
        </CardVidro>

        <CardVidro spot style={{ borderRadius: 'var(--r-card)' }}>
          <div className="card-cab"><h3>Atendimentos por dia · 14 dias</h3></div>
          <div style={{ padding: '8px 16px 16px' }}><Colunas dados={g.porDia} /></div>
          <div className="gs-ia-split">
            <div><span className="gs-ia-r">Conversão com IA</span><b className="num" style={{ color: 'var(--verde)' }}>{ia.conversaoIA}%</b></div>
            <div><span className="gs-ia-r">Conversão só humano</span><b className="num">{ia.conversaoHumano}%</b></div>
          </div>
        </CardVidro>
      </div>

      <div className="gs-grid2 sobe" style={{ animationDelay: '.1s' }}>
        <CardVidro spot style={{ borderRadius: 'var(--r-card)' }}>
          <div className="card-cab"><h3>Melhor conversão</h3></div>
          <div className="gs-lista">
            {topConv.map((a) => (
              <div className="gs-lin" key={a.nome}>
                <span className="gs-av" aria-hidden>{iniciais(a.nome)}</span>
                <span className="gs-lin-nm">{a.nome}</span>
                <span className="gs-lin-v num" style={{ color: 'var(--verde)' }}>{a.conversao}%</span>
              </div>
            ))}
          </div>
        </CardVidro>
        <CardVidro spot style={{ borderRadius: 'var(--r-card)' }}>
          <div className="card-cab"><h3>1ª resposta mais lenta</h3></div>
          <div className="gs-lista">
            {maisLentos.map((a) => (
              <div className="gs-lin" key={a.nome}>
                <span className="gs-av" aria-hidden>{iniciais(a.nome)}</span>
                <span className="gs-lin-nm">{a.nome}</span>
                <span className="gs-lin-v num" style={{ color: a.primeiraRespMediana > 15 ? 'var(--rubro)' : undefined }}>{a.primeiraRespMediana} min</span>
              </div>
            ))}
          </div>
        </CardVidro>
      </div>

      <CardVidro spot sobe style={{ borderRadius: 'var(--r-card)', marginTop: 12, animationDelay: '.14s' }}>
        <div className="card-cab"><h3>Últimos atendimentos</h3></div>
        <div className="gs-lista">
          {recentes.map((c) => (
            <button type="button" className="gs-conv" key={c.id} onClick={() => aoAbrir(c)}>
              <span className="gs-av" aria-hidden>{iniciais(c.contato)}</span>
              <span className="gs-conv-info"><span className="gs-conv-nm">{c.contato}</span><span className="gs-conv-msg">{c.ultimaMsg}</span></span>
              <BadgeStatus tom={TOM_ETAPA[c.etapa]}>{c.etapa}</BadgeStatus>
              <span className="gs-conv-at num">{c.atendente}</span>
            </button>
          ))}
        </div>
      </CardVidro>
    </>
  );
}

/* =================== ATENDENTES =================== */
function Atendentes({ aoAbrir }: { aoAbrir: (c: Conversa) => void }) {
  const ats = useMemo(() => metricasPorAtendente(CONVERSAS), []);
  const [sel, setSel] = useState<MetricaAtendente | null>(null);
  const colunas: Coluna<MetricaAtendente>[] = [
    { chave: 'nome', titulo: 'Atendente', render: (a) => <div className="gs-cel-nm"><span className="gs-av sm" aria-hidden>{iniciais(a.nome)}</span>{a.nome}</div> },
    { chave: 'at', titulo: 'Atendimentos', dir: true, classe: 'num', render: (a) => String(a.atendimentos) },
    { chave: 'resp', titulo: '1ª resposta', dir: true, classe: 'num', render: (a) => <span style={{ color: a.primeiraRespMediana > 15 ? 'var(--rubro)' : undefined }}>{a.primeiraRespMediana} min</span> },
    { chave: 'conv', titulo: 'Conversão', dir: true, classe: 'num', render: (a) => <span style={{ color: 'var(--verde)' }}>{a.conversao}%</span> },
    { chave: 'ganhos', titulo: 'Ganhos', dir: true, classe: 'num', render: (a) => String(a.ganhos) },
    { chave: 'ia', titulo: 'Via IA', dir: true, classe: 'num', render: (a) => String(a.iaRecebidos) },
  ];
  return (
    <>
      <p className="gs-hint sobe">Cada atendente é uma ficha. Clique para ver os números e abrir as conversas dele.</p>
      <CardVidro spot sobe style={{ borderRadius: 'var(--r-card)', animationDelay: '.05s' }}>
        <TabelaPadrao colunas={colunas} linhas={ats} chave={(a) => a.nome} aoClicarLinha={(a) => setSel(a)}
          rodape={{ texto: `${ats.length} atendentes` }} />
      </CardVidro>

      <DrawerV2 aberto={!!sel} aoFechar={() => setSel(null)} largura={480}>
        {sel && <FichaAtendente a={sel} aoFechar={() => setSel(null)} aoAbrir={aoAbrir} />}
      </DrawerV2>
    </>
  );
}

function FichaAtendente({ a, aoFechar, aoAbrir }: { a: MetricaAtendente; aoFechar: () => void; aoAbrir: (c: Conversa) => void }) {
  const conversas = useMemo(() => CONVERSAS.filter((c) => c.atendente === a.nome).sort((x, y) => x.diasAtras - y.diasAtras), [a.nome]);
  return (
    <div className="gs-drawer">
      <div className="gs-dr-head">
        <span className="gs-av lg" aria-hidden>{iniciais(a.nome)}</span>
        <div><div className="gs-dr-nm">{a.nome}</div><div className="gs-dr-sub num">{a.atendimentos} atendimentos · {a.conversao}% conversão</div></div>
        <button type="button" className="gs-dr-x" onClick={aoFechar} aria-label="Fechar">×</button>
      </div>
      <div className="gs-dr-stats">
        <div><span>1ª resposta</span><b className="num">{a.primeiraRespMediana} min</b></div>
        <div><span>Ganhos</span><b className="num">{a.ganhos}</b></div>
        <div><span>Perdidos</span><b className="num">{a.perdidos}</b></div>
        <div><span>Em aberto</span><b className="num">{a.abertos}</b></div>
        <div><span>Via IA</span><b className="num">{a.iaRecebidos}</b></div>
        <div><span>Valor ganho</span><b className="num">{fmtBRL(a.valorGanho)}</b></div>
      </div>
      <div className="gs-dr-sec">Atividade · 14 dias</div>
      <div style={{ padding: '0 2px 6px' }}><Colunas dados={a.porDia} /></div>
      <div className="gs-dr-sec">Conversas ({conversas.length})</div>
      <div className="gs-lista">
        {conversas.slice(0, 14).map((c) => (
          <button type="button" className="gs-conv" key={c.id} onClick={() => aoAbrir(c)}>
            <span className="gs-av" aria-hidden>{iniciais(c.contato)}</span>
            <span className="gs-conv-info"><span className="gs-conv-nm">{c.contato}</span><span className="gs-conv-msg">{c.ultimaMsg}</span></span>
            <BadgeStatus tom={TOM_ETAPA[c.etapa]}>{c.etapa}</BadgeStatus>
          </button>
        ))}
        {conversas.length > 14 && <div className="gs-mais num">+ {conversas.length - 14} conversas</div>}
      </div>
    </div>
  );
}

/* =================== INTELIGÊNCIA (IA) =================== */
function Inteligencia({ aoAbrir }: { aoAbrir: (c: Conversa) => void }) {
  const ia = useMemo(() => resumoIA(CONVERSAS), []);
  const handoffs = useMemo(() => CONVERSAS.filter((c) => c.iaParticipou && !c.iaResolveu).sort((a, b) => a.diasAtras - b.diasAtras).slice(0, 10), []);
  const maxConv = Math.max(ia.conversaoIA, ia.conversaoHumano, 1);
  const maxResp = Math.max(ia.tempoRespIA, ia.tempoRespHumano, 1);
  return (
    <>
      <div className="kpis sobe">
        <Kpi rotulo="IA participou" valor={ia.sessoes} formato="mil" sufixo={` · ${ia.participacao}%`} />
        <Kpi rotulo="Resolvidas sozinha" valor={ia.taxaResolucao} sufixo="%" tomValor="ok" />
        <Kpi rotulo="Passou pro humano" valor={ia.handoffs} formato="mil" />
        <Kpi rotulo="Conversão com IA" valor={ia.conversaoIA} sufixo="%" tomValor="ok" />
      </div>

      <div className="gs-grid2 sobe" style={{ animationDelay: '.06s' }}>
        <CardVidro spot style={{ borderRadius: 'var(--r-card)' }}>
          <div className="card-cab"><h3>Conversão — IA × humano</h3></div>
          <div className="gs-lista">
            <div className="gs-lin"><span className="gs-lin-nm">Com IA</span><Barra v={ia.conversaoIA} max={maxConv} tom="ok" /><span className="gs-lin-v num">{ia.conversaoIA}%</span></div>
            <div className="gs-lin"><span className="gs-lin-nm">Só humano</span><Barra v={ia.conversaoHumano} max={maxConv} tom="tint" /><span className="gs-lin-v num">{ia.conversaoHumano}%</span></div>
          </div>
          <div className="gs-dr-sec">1ª resposta (mediana)</div>
          <div className="gs-lista">
            <div className="gs-lin"><span className="gs-lin-nm">Com IA</span><Barra v={ia.tempoRespIA} max={maxResp} tom="ok" /><span className="gs-lin-v num">{ia.tempoRespIA} min</span></div>
            <div className="gs-lin"><span className="gs-lin-nm">Só humano</span><Barra v={ia.tempoRespHumano} max={maxResp} tom="erro" /><span className="gs-lin-v num">{ia.tempoRespHumano} min</span></div>
          </div>
        </CardVidro>

        <CardVidro spot style={{ borderRadius: 'var(--r-card)' }}>
          <div className="card-cab"><h3>Onde a IA passou pro humano</h3></div>
          <div className="gs-lista">
            {handoffs.map((c) => (
              <button type="button" className="gs-conv" key={c.id} onClick={() => aoAbrir(c)}>
                <span className="gs-av" aria-hidden>{iniciais(c.contato)}</span>
                <span className="gs-conv-info"><span className="gs-conv-nm">{c.contato}</span><span className="gs-conv-msg">→ {c.atendente} · {c.ultimaMsg}</span></span>
                <BadgeStatus tom={TOM_ETAPA[c.etapa]}>{c.etapa}</BadgeStatus>
              </button>
            ))}
          </div>
        </CardVidro>
      </div>
    </>
  );
}

/* =================== ATENDIMENTOS (explorador) =================== */
type FiltroConv = 'todos' | 'aberto' | 'ganho' | 'perdido' | 'ia';
function Atendimentos({ aoAbrir }: { aoAbrir: (c: Conversa) => void }) {
  const [filtro, setFiltro] = useState<FiltroConv>('todos');
  const [busca, setBusca] = useState('');
  const [pag, setPag] = useState(1);
  const termo = busca.trim().toLowerCase();
  const lista = useMemo(() => CONVERSAS.filter((c) => {
    if (filtro === 'ia' && !c.iaParticipou) return false;
    if ((filtro === 'aberto' || filtro === 'ganho' || filtro === 'perdido') && c.resultado !== filtro) return false;
    if (termo && !(`${c.contato} ${c.atendente} ${c.origem}`.toLowerCase().includes(termo))) return false;
    return true;
  }).sort((a, b) => a.diasAtras - b.diasAtras), [filtro, termo]);
  const POR = 12;
  const totalPag = Math.max(1, Math.ceil(lista.length / POR));
  const pagAtual = Math.min(pag, totalPag);
  const linhas = lista.slice((pagAtual - 1) * POR, pagAtual * POR);
  const trocar = (f: FiltroConv) => { setFiltro(f); setPag(1); };
  const cont = (f: FiltroConv) => f === 'ia' ? CONVERSAS.filter((c) => c.iaParticipou).length : CONVERSAS.filter((c) => c.resultado === f).length;

  const colunas: Coluna<Conversa>[] = [
    { chave: 'contato', titulo: 'Contato', render: (c) => <div className="gs-cel-nm"><span className="gs-av sm" aria-hidden>{iniciais(c.contato)}</span>{c.contato}</div> },
    { chave: 'at', titulo: 'Atendente', render: (c) => c.atendente },
    { chave: 'origem', titulo: 'Origem', render: (c) => <span className="gs-kb">{c.origem}</span> },
    { chave: 'etapa', titulo: 'Etapa', render: (c) => <BadgeStatus tom={TOM_ETAPA[c.etapa]}>{c.etapa}</BadgeStatus> },
    { chave: 'resp', titulo: '1ª resp', dir: true, classe: 'num', render: (c) => `${c.primeiraRespostaMin} min` },
    { chave: 'ia', titulo: 'IA', render: (c) => c.iaParticipou ? <span className="gs-ia-dot" title="IA participou" /> : <span className="gs-kb">—</span> },
    { chave: 'quando', titulo: 'Quando', dir: true, classe: 'num', render: (c) => c.diasAtras === 0 ? 'hoje' : `há ${c.diasAtras}d` },
  ];
  return (
    <>
      <div className="cob-filtros sobe">
        <Chips>
          <Chip ativo={filtro === 'todos'} onClick={() => trocar('todos')}>Todos ({CONVERSAS.length})</Chip>
          <Chip ativo={filtro === 'aberto'} onClick={() => trocar('aberto')}>Em aberto ({cont('aberto')})</Chip>
          <Chip ativo={filtro === 'ganho'} onClick={() => trocar('ganho')}>Ganhos ({cont('ganho')})</Chip>
          <Chip ativo={filtro === 'perdido'} onClick={() => trocar('perdido')}>Perdidos ({cont('perdido')})</Chip>
          <Chip ativo={filtro === 'ia'} onClick={() => trocar('ia')}>Com IA ({cont('ia')})</Chip>
        </Chips>
        <Input placeholder="Buscar por contato, atendente ou origem…" value={busca} onChange={(e) => { setBusca(e.target.value); setPag(1); }} />
      </div>
      <CardVidro spot sobe style={{ borderRadius: 'var(--r-card)', animationDelay: '.06s' }}>
        {lista.length === 0
          ? <EstadoVazio titulo="Nada neste filtro" descricao="Ajuste os filtros ou a busca." />
          : <TabelaPadrao colunas={colunas} linhas={linhas} chave={(c) => c.id} aoClicarLinha={aoAbrir}
              rodape={{ texto: `${lista.length} atendimento${lista.length === 1 ? '' : 's'}`, paginacao: { pagina: pagAtual, totalPaginas: totalPag, aoIr: setPag } }} />}
      </CardVidro>
    </>
  );
}

/* =================== RESULTADOS =================== */
function Resultados() {
  const g = useMemo(() => resumoGeral(CONVERSAS), []);
  const ats = useMemo(() => metricasPorAtendente(CONVERSAS).sort((a, b) => b.ganhos - a.ganhos).slice(0, 8), []);
  const maxEtapa = Math.max(...g.porEtapa.map((e) => e.n));
  const maxMotivo = Math.max(1, ...g.motivos.map((m) => m.n));
  const maxOrig = Math.max(1, ...g.porOrigem.map((o) => o.n));
  return (
    <>
      <div className="kpis sobe">
        <Kpi rotulo="Ganhos" valor={g.ganhos} formato="mil" tomValor="ok" />
        <Kpi rotulo="Perdidos" valor={g.perdidos} formato="mil" tomValor="erro" />
        <Kpi rotulo="Em aberto" valor={g.abertos} formato="mil" />
        <Kpi rotulo="Conversão" valor={g.conversao} sufixo="%" tomValor="ok" />
        <Kpi rotulo="Valor ganho" valor={Math.trunc(g.valorGanho)} formato="mil" prefixo="R$ " sufixo=",00" tomValor="ok" />
      </div>

      <div className="gs-grid2 sobe" style={{ animationDelay: '.06s' }}>
        <CardVidro spot style={{ borderRadius: 'var(--r-card)' }}>
          <div className="card-cab"><h3>Funil</h3></div>
          <div className="gs-lista">
            {g.porEtapa.map((e) => (
              <div className="gs-lin" key={e.etapa}>
                <span className="gs-lin-nm"><BadgeStatus tom={TOM_ETAPA[e.etapa]}>{e.etapa}</BadgeStatus></span>
                <Barra v={e.n} max={maxEtapa} tom={e.etapa === 'Fechado' ? 'ok' : e.etapa === 'Perdido' ? 'erro' : 'tint'} />
                <span className="gs-lin-v num">{e.n}</span>
              </div>
            ))}
          </div>
        </CardVidro>
        <CardVidro spot style={{ borderRadius: 'var(--r-card)' }}>
          <div className="card-cab"><h3>Motivos de perda</h3></div>
          <div className="gs-lista">
            {g.motivos.map((m) => (
              <div className="gs-lin" key={m.motivo}>
                <span className="gs-lin-nm">{m.motivo}</span>
                <Barra v={m.n} max={maxMotivo} tom="erro" />
                <span className="gs-lin-v num">{m.n}</span>
              </div>
            ))}
          </div>
        </CardVidro>
      </div>

      <div className="gs-grid2 sobe" style={{ animationDelay: '.1s' }}>
        <CardVidro spot style={{ borderRadius: 'var(--r-card)' }}>
          <div className="card-cab"><h3>Por origem</h3></div>
          <div className="gs-lista">
            {g.porOrigem.map((o) => (
              <div className="gs-lin" key={o.origem}>
                <span className="gs-lin-nm">{o.origem}</span>
                <Barra v={o.n} max={maxOrig} tom="azul" />
                <span className="gs-lin-v num">{o.n} · {o.ganhos} ganhos</span>
              </div>
            ))}
          </div>
        </CardVidro>
        <CardVidro spot style={{ borderRadius: 'var(--r-card)' }}>
          <div className="card-cab"><h3>Ganhos por atendente</h3></div>
          <div className="gs-lista">
            {ats.map((a) => (
              <div className="gs-lin" key={a.nome}>
                <span className="gs-av" aria-hidden>{iniciais(a.nome)}</span>
                <span className="gs-lin-nm">{a.nome}</span>
                <span className="gs-lin-v num" style={{ color: 'var(--verde)' }}>{a.ganhos} · {fmtBRL(a.valorGanho)}</span>
              </div>
            ))}
          </div>
        </CardVidro>
      </div>
    </>
  );
}

/* =================== ficha da conversa (a prova) =================== */
const TOM_RES: Record<string, TomStatus> = { ganho: 'ok', perdido: 'erro', aberto: 'atencao' };
function FichaConversa({ c, aoFechar }: { c: Conversa; aoFechar: () => void }) {
  return (
    <div className="gs-drawer">
      <div className="gs-dr-head">
        <span className="gs-av lg" aria-hidden>{iniciais(c.contato)}</span>
        <div><div className="gs-dr-nm">{c.contato}</div><div className="gs-dr-sub num">{c.origem} · {c.atendente}</div></div>
        <button type="button" className="gs-dr-x" onClick={aoFechar} aria-label="Fechar">×</button>
      </div>
      <div className="gs-dr-badges">
        <BadgeStatus tom={TOM_ETAPA[c.etapa]}>{c.etapa}</BadgeStatus>
        <BadgeStatus tom={TOM_RES[c.resultado]}>{c.resultado === 'ganho' ? 'Ganho' : c.resultado === 'perdido' ? 'Perdido' : 'Em aberto'}</BadgeStatus>
        {c.iaParticipou && <BadgeStatus tom="neutro">IA participou</BadgeStatus>}
      </div>
      <div className="gs-dr-stats compact">
        <div><span>1ª resposta</span><b className="num">{c.primeiraRespostaMin} min</b></div>
        {c.resultado === 'ganho' && <div><span>Valor</span><b className="num">{fmtBRL(c.valor)}</b></div>}
        {c.motivoPerda && <div><span>Motivo</span><b>{c.motivoPerda}</b></div>}
      </div>
      <div className="gs-dr-sec">Conversa</div>
      <div className="gs-thread">
        {c.thread.map((m, i) => (
          <div className={`gs-msg ${m.de === 'cliente' ? 'in' : 'out'}`} key={i}>
            {m.de !== 'cliente' && <span className="gs-msg-de">{m.de === 'ia' ? 'IA' : c.atendente}</span>}
            <div className="gs-msg-bolha">{m.texto}</div>
            <span className="gs-msg-hora num">{m.hora}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
