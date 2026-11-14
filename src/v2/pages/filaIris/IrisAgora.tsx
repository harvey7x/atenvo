/* ============================================================================
   A IRIS ESTÁ ATENDENDO (dono 14/11: "preciso saber quantas pessoas a Iris está atendendo… de quem que é os
   clientes… como é que tá o atendimento da pessoa, tipo, quanto tempo a Iris está atendendo esse cliente… de qual
   tráfego é" + "aqui eu preciso de algo mais profissional"). Seção da visão Equipe, na régua do topo da Fila:
   - os NÚMEROS em blocos (os mesmos do painel do topo), que filtram: com a Iris · conversando · esperando o cliente ·
     parados · nunca responderam · esperando a Iris;
   - a DIVISÃO por atendente e por tráfego em barras (com a fatia de cada um), que também filtram;
   - a TABELA: cliente · dono · tráfego · etapa · situação · com a Iris, com busca; a linha abre a conversa.
   A régua é a do selo "Iris atendendo" do WhatsApp (fila_iris_iris_agora).
   ============================================================================ */
import { useMemo, useState, type ReactElement } from 'react';
import { EQUIPE, haQuanto, type Atendente } from './dados';
import { dataHora } from './lead';
import type { ClienteIris, IrisAgora } from './fonte';
import {
  GRUPOS_IRIS, ORDEM_TRAFEGO, grupoDe, rotuloEtapa, rotuloPedido, rotuloTrafego, ultimaAtividade, vezDe, type GrupoIris,
} from './irisAgoraRegras';
import { IcBusca, IcConversa, IcInfo, IcIris, IcX } from './icones';

const LOTE = 40;
const mil = (n: number) => n.toLocaleString('pt-BR');
const minutos = (agora: number, t?: number) => Math.max(0, Math.round((agora - (t ?? agora)) / 60_000));
/** "12 min", "5 h", "3 dias" (o tempo com a Iris, sem o "há") */
function duracao(min: number): string {
  if (min < 60) return `${Math.max(1, min)} min`;
  if (min < 24 * 60) return `${Math.floor(min / 60)} h`;
  const d = Math.floor(min / (24 * 60));
  return d === 1 ? '1 dia' : `${d} dias`;
}
const diaMes = (t: number) => dataHora(t).slice(0, 5);
const iniciais = (n: string) => {
  const p = n.split(/\s+/).map((w) => w.replace(/[^\p{L}]/gu, '')).filter(Boolean);
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
};
const doisNomes = (n: string) => {
  const p = n.split(/\s+/).filter(Boolean);
  return p.length > 1 ? `${p[0]} ${p[p.length - 1]}` : n;
};
const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/** a chave do dono nos filtros (sem dono também filtra) */
const SEM_DONO = 'sem_dono';
const chaveDono = (c: ClienteIris) => c.dono ?? SEM_DONO;
const nomeDono = (dono: string | null) => (!dono || dono === SEM_DONO ? 'Sem dono' : EQUIPE.find((a) => a.id === dono)?.nome ?? 'Outro atendente');

/** os blocos de cima: os grupos da situação + "esperando a Iris" (o cliente escreveu e ela ainda não respondeu) */
type Bloco = GrupoIris | 'esperando_iris';
const BLOCOS: { id: Bloco; rotulo: string; sub: string; ajuda: string }[] = [
  ...GRUPOS_IRIS.map((g) => ({
    id: g.id, rotulo: g.id === 'parado' ? 'Parados' : g.rotulo, ajuda: g.ajuda,
    sub: g.id === 'conversando' ? 'cliente escreveu em 24 h' : g.id === 'esperando' ? '1 a 3 dias sem escrever'
      : g.id === 'parado' ? 'mais de 3 dias sem escrever' : 'não responderam a Iris',
  })),
  { id: 'esperando_iris', rotulo: 'Esperando a Iris', sub: 'cliente escreveu por último', ajuda: 'O cliente escreveu por último e a Iris ainda não respondeu.' },
];
/* com o pedido de "representação" a Iris para e espera um atendente: não conta como "esperando a Iris" */
const doBloco = (c: ClienteIris, b: Bloco, agora: number) => (b === 'esperando_iris'
  ? vezDe(c) === 'cliente' && c.pediuHumano !== 'representacao' : grupoDe(c, agora) === b);

/** a situação em duas linhas curtas, com o tom (vermelho só para quem espera resposta) */
function situacaoDe(c: ClienteIris, agora: number): { rotulo: string; detalhe: string; tom?: 'alerta' | 'fraco' } {
  const vez = vezDe(c);
  /* com o pedido de "representação" a Iris para e espera um atendente; nos outros pedidos ela continua */
  if (vez === 'cliente') {
    return { rotulo: 'Cliente respondeu', tom: 'alerta',
      detalhe: `${haQuanto(minutos(agora, c.ultCliente))} · ${c.pediuHumano === 'representacao' ? 'esperando um atendente' : 'esperando a Iris'}` };
  }
  if (vez === 'atendente') return { rotulo: 'Atendente escreveu', detalhe: haQuanto(minutos(agora, c.ultNossa)) };
  if (!vez) return { rotulo: 'Sem mensagens', detalhe: '—', tom: 'fraco' };
  if (c.respondeuIris === false) return { rotulo: 'Ainda não respondeu', detalhe: `Iris escreveu ${haQuanto(minutos(agora, c.ultNossa))}`, tom: 'fraco' };
  /* não "Esperando o cliente": é o nome de um bloco (1 a 3 dias) e a linha pode estar em qualquer grupo */
  return { rotulo: 'Vez do cliente', detalhe: `Iris escreveu ${haQuanto(minutos(agora, c.ultNossa))}` };
}

export interface PropsIrisAgora {
  iris: IrisAgora | null | undefined;
  /** o avatar do atendente (o mesmo do resto da tela) */
  Avatar: (p: { a: Atendente; tam?: number }) => ReactElement;
  /** filtro por atendente (o cartão do atendente liga) */
  dono: string | null;
  aoDono: (id: string | null) => void;
  aoConversa: (c: ClienteIris) => void;
}

export function IrisAgoraSecao({ iris, Avatar, dono, aoDono, aoConversa }: PropsIrisAgora) {
  const [bloco, setBloco] = useState<Bloco | null>(null);
  const [trafego, setTrafego] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [ver, setVer] = useState(LOTE);
  const agora = iris?.lidaEm ?? 0;
  const todos = useMemo(() => iris?.clientes ?? [], [iris]);
  const termo = semAcento(busca.trim());
  const digitos = busca.replace(/\D/g, '');

  /* cada contagem leva em conta os OUTROS filtros (o número que aparece é o que a tabela vai mostrar ao clicar) */
  const passa = (c: ClienteIris, sem: 'bloco' | 'dono' | 'trafego' | null) =>
    (sem === 'bloco' || !bloco || doBloco(c, bloco, agora))
    && (sem === 'dono' || !dono || chaveDono(c) === dono)
    && (sem === 'trafego' || !trafego || c.campanha === trafego)
    && (!termo || semAcento(c.nome).includes(termo) || (digitos.length >= 3 && c.fone.replace(/\D/g, '').includes(digitos)));
  const baseBlocos = todos.filter((c) => passa(c, 'bloco'));
  const baseDono = todos.filter((c) => passa(c, 'dono'));
  const baseTrafego = todos.filter((c) => passa(c, 'trafego'));
  const porDono = new Map<string, number>();
  for (const c of baseDono) porDono.set(chaveDono(c), (porDono.get(chaveDono(c)) ?? 0) + 1);
  const porTrafego = new Map<string, number>();
  for (const c of baseTrafego) porTrafego.set(c.campanha, (porTrafego.get(c.campanha) ?? 0) + 1);
  const lista = useMemo(() => todos.filter((c) => passa(c, null)).sort((a, b) => ultimaAtividade(b) - ultimaAtividade(a)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [todos, bloco, dono, trafego, termo, digitos, agora]);
  const filtrando = !!(bloco || dono || trafego || termo);
  const limpar = () => { setBloco(null); aoDono(null); setTrafego(null); setBusca(''); setVer(LOTE); };

  const donos = [...EQUIPE.map((a) => a.id), ...[...porDono.keys()].filter((k) => !EQUIPE.some((a) => a.id === k))]
    .filter((k) => porDono.has(k) || k === dono)
    .sort((a, b) => (porDono.get(b) ?? 0) - (porDono.get(a) ?? 0));
  const trafegos = [...ORDEM_TRAFEGO, ...[...porTrafego.keys()].filter((k) => !ORDEM_TRAFEGO.includes(k))]
    .filter((k) => porTrafego.has(k) || k === trafego)
    .sort((a, b) => (porTrafego.get(b) ?? 0) - (porTrafego.get(a) ?? 0));
  const maxDono = Math.max(1, ...porDono.values());
  const maxTrafego = Math.max(1, ...porTrafego.values());

  const cab = (
    <header className="fi-lista-cab fi-ir-cab">
      <h2><IcIris t={15} />A Iris está atendendo</h2>
      <span className="fi-ir-info" title={'A mesma regra do selo "Iris atendendo" do WhatsApp: a conversa está com a Iris ligada, num número conectado. '
        + 'A lista atualiza sozinha a cada minuto.'}>
        <IcInfo t={13} />
      </span>
      {iris?.lidaEm ? <span className="fi-lista-n">atualizada às {dataHora(agora).slice(6)}</span> : null}
      {filtrando && <button type="button" className="fi-limpar fi-ir-limpar" onClick={limpar}><IcX t={9} />Limpar filtros</button>}
    </header>
  );
  /* sem uma leitura boa (carregando ou a 1ª falhou): nada de "0" como se fosse dado */
  if (!iris || !iris.lidaEm) {
    return (
      <section className="fi-lista vidro fi-ir" id="fi-iris-agora" aria-label="A Iris está atendendo">
        {cab}<p className="fi-ir-vazio" role={iris?.erro ? 'status' : undefined}>{iris?.erro ?? 'Carregando…'}</p>
      </section>
    );
  }
  return (
    <section className="fi-lista vidro fi-ir" id="fi-iris-agora" aria-label="A Iris está atendendo">
      {cab}

      <div className="fi-ir-blocos" role="group" aria-label="Situação dos atendimentos (clique para filtrar)">
        <button type="button" className="fi-pn fi-ir-total" data-ativo={!bloco ? '' : undefined} aria-pressed={!bloco}
          onClick={() => { setBloco(null); setVer(LOTE); }} title="Todos os clientes que a Iris está atendendo agora">
          <span className="fi-pn-r">Com a Iris agora</span>
          <b className="fi-pn-n num">{mil(baseBlocos.length)}</b>
          <span className="fi-pn-s">{baseBlocos.length === todos.length ? 'todos os clientes' : `de ${mil(todos.length)} no total`}</span>
        </button>
        {BLOCOS.map((b) => {
          const n = baseBlocos.filter((c) => doBloco(c, b.id, agora)).length;
          const ativo = bloco === b.id;
          return (
            <button key={b.id} type="button" className="fi-pn" data-ativo={ativo ? '' : undefined} aria-pressed={ativo} title={b.ajuda}
              onClick={() => { setBloco(ativo ? null : b.id); setVer(LOTE); }}>
              <span className="fi-pn-r">{b.id === 'esperando_iris' && n > 0 && <i className="fi-pt" aria-hidden />}{b.rotulo}</span>
              <b className="fi-pn-n num">{mil(n)}</b>
              <span className="fi-pn-s">{b.sub}</span>
            </button>
          );
        })}
      </div>

      <div className="fi-ir-divisao">
        <Divisao titulo="Por atendente" ajuda="De quem são os clientes que a Iris está atendendo (o dono na fila)."
          itens={donos.map((id) => {
            const a = EQUIPE.find((x) => x.id === id);
            return { id, nome: nomeDono(id), n: porDono.get(id) ?? 0, avatar: a ? <Avatar a={a} tam={18} /> : null };
          })}
          total={baseDono.length} max={maxDono} sel={dono} aoSel={(id) => { aoDono(dono === id ? null : id); setVer(LOTE); }} />
        <Divisao titulo="Por tráfego" ajuda="A campanha do número por onde o lead entrou (a mesma do Dashboard)."
          itens={trafegos.map((t) => ({ id: t, nome: rotuloTrafego(t), n: porTrafego.get(t) ?? 0, avatar: null }))}
          total={baseTrafego.length} max={maxTrafego} sel={trafego} aoSel={(id) => { setTrafego((x) => (x === id ? null : id)); setVer(LOTE); }} />
      </div>

      <div className="fi-ir-ferr">
        <span className="fi-ir-ferr-t">Clientes</span>
        <span className="fi-lista-n">{lista.length === todos.length ? mil(lista.length) : `${mil(lista.length)} de ${mil(todos.length)}`}</span>
        <label className="fi-busca fi-ir-busca" title="Buscar pelo nome ou pelo telefone">
          <IcBusca t={14} />
          <input value={busca} onChange={(e) => { setBusca(e.target.value); setVer(LOTE); }} placeholder="Nome ou telefone"
            aria-label="Buscar cliente da Iris pelo nome ou pelo telefone"
            onKeyDown={(e) => { if (e.key === 'Escape') { setBusca(''); e.currentTarget.blur(); } }} />
          {busca && <button type="button" className="fi-busca-x" onClick={() => setBusca('')} aria-label="Limpar a busca"><IcX t={10} /></button>}
        </label>
      </div>
      <div className="fi-colunas fi-ir-cols" aria-hidden>
        <span className="fi-col-cli">Cliente</span>
        <span>Dono</span>
        <span>Tráfego</span>
        <span>Etapa</span>
        <span>Situação</span>
        <span>Com a Iris</span>
        <span />
      </div>
      {iris.erro && <p className="fi-ir-vazio" role="status">{iris.erro}</p>}
      {lista.length === 0 ? (
        iris.erro && !todos.length ? null
          : <p className="fi-ir-vazio">{todos.length ? 'Nenhum cliente com esses filtros.' : 'A Iris não está atendendo ninguém agora.'}</p>
      ) : (
        <div className="fi-ir-linhas">
          {lista.slice(0, ver).map((c) => <LinhaIris key={c.conversaId} c={c} agora={agora} Avatar={Avatar} aoConversa={aoConversa} />)}
        </div>
      )}
      {lista.length > ver && (
        <footer className="fi-ir-pe">
          <span className="fi-ir-pe-t">Mostrando {mil(ver)} de {mil(lista.length)}</span>
          <button type="button" className="fi-ir-mais" onClick={() => setVer((v) => v + LOTE * 2)}>Mostrar mais {mil(Math.min(LOTE * 2, lista.length - ver))}</button>
        </footer>
      )}
    </section>
  );
}

/** a divisão em barras (por atendente, por tráfego): cada linha filtra a tabela */
function Divisao({ titulo, ajuda, itens, total, max, sel, aoSel }: {
  titulo: string; ajuda: string; itens: { id: string; nome: string; n: number; avatar: ReactElement | null }[];
  total: number; max: number; sel: string | null; aoSel: (id: string) => void;
}) {
  return (
    <div className="fi-ir-div" role="group" aria-label={`${titulo} (clique para filtrar)`}>
      <span className="fi-ir-div-t" title={ajuda}>{titulo}</span>
      {itens.map((it) => {
        const ativo = sel === it.id;
        const pct = total ? Math.round((it.n / total) * 100) : 0;
        return (
          <button key={it.id || 'sem'} type="button" className="fi-ir-div-l" data-ativo={ativo ? '' : undefined} aria-pressed={ativo}
            onClick={() => aoSel(it.id)} title={`${it.nome}: ${it.n} ${it.n === 1 ? 'cliente' : 'clientes'} (${pct}%)`}>
            <span className="fi-ir-div-nome">{it.avatar}{it.nome}</span>
            <span className="fi-ir-div-barra" aria-hidden><i style={{ width: `${Math.max(it.n ? 2 : 0, (it.n / max) * 100)}%` }} /></span>
            <b className="fi-ir-div-n num">{mil(it.n)}</b>
            <span className="fi-ir-div-pct num">{pct}%</span>
          </button>
        );
      })}
    </div>
  );
}

function LinhaIris({ c, agora, Avatar, aoConversa }: {
  c: ClienteIris; agora: number; Avatar: PropsIrisAgora['Avatar']; aoConversa: (c: ClienteIris) => void;
}) {
  const sit = situacaoDe(c, agora);
  const a = c.dono ? EQUIPE.find((x) => x.id === c.dono) : undefined;
  const pedido = rotuloPedido(c.pediuHumano);
  const tel = c.fone && c.fone !== c.nome ? c.fone : '';
  const outroNumero = !!c.numero && !!c.numeroCampanha && c.numeroCampanha !== c.campanha;
  return (
    <div className="fi-lin fi-ir-lin" role="button" tabIndex={0} data-espera={sit.tom === 'alerta' ? '' : undefined}
      aria-label={`Abrir a conversa de ${c.nome}`} title="Abrir a conversa no WhatsApp"
      onClick={() => { if (window.getSelection()?.toString()) return; aoConversa(c); }}
      onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); aoConversa(c); } }}>
      <span className="fi-col-cli">
        <span className="fi-av-caixa">
          <span className="fi-av" style={{ width: 34, height: 34 }}>{iniciais(c.nome) || '·'}</span>
          {sit.tom === 'alerta'
            ? <i className="fi-av-pt" title={c.pediuHumano === 'representacao' ? 'Esperando um atendente' : 'Esperando a Iris responder'} /> : null}
        </span>
        <span className="fi-lin-tx">
          <b className="fi-lin-nome" title={c.nome}>{doisNomes(c.nome)}</b>
          <span className="fi-lin-l2">{tel ? <span className="fi-lin-prod num">{tel}</span> : <span className="fi-lin-prod">sem telefone</span>}</span>
        </span>
      </span>
      <span className="fi-ir-dono">{a ? <><Avatar a={a} tam={18} />{a.nome}</> : <span className="fi-vazio">{nomeDono(c.dono)}</span>}</span>
      <span className="fi-ir-cel">
        <span className="fi-l1 fi-elip">{rotuloTrafego(c.campanha)}</span>
        {outroNumero && <span className="fi-l2 fi-elip" title="A Iris conversa por outro número, não o da campanha de origem">pelo {c.numero}</span>}
      </span>
      <span className="fi-ir-cel"><span className="fi-ir-etapa" title={rotuloEtapa(c.etapa)}>{rotuloEtapa(c.etapa)}</span></span>
      <span className="fi-ir-cel fi-ir-sit" data-tom={sit.tom}>
        <span className="fi-l1 fi-elip">{sit.tom === 'alerta' && <i className="fi-pt" aria-hidden />}{sit.rotulo}</span>
        <span className="fi-l2 fi-ir-sit-l2">
          <span className="fi-elip">{sit.detalhe}</span>
          {pedido && <span className="fi-ir-tag" title={`A Iris pediu um atendente: ${pedido}`}>Pediu atendente</span>}
        </span>
      </span>
      <span className="fi-ir-cel" title={`Com a Iris desde ${dataHora(c.desde)}`}>
        <span className="fi-l1 num">{duracao(minutos(agora, c.desde))}</span>
        <span className="fi-l2 num">desde {diaMes(c.desde)}</span>
      </span>
      <span className="fi-col-acao">
        <button type="button" className="fi-bt-conv" onClick={(e) => { e.stopPropagation(); aoConversa(c); }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); }}
          aria-label={`Abrir a conversa de ${c.nome}`} title="Abrir a conversa no WhatsApp">
          <IcConversa t={15} />
        </button>
      </span>
    </div>
  );
}

/** quantos clientes de cada atendente a Iris atende agora (o cartão do atendente mostra) */
export function contarIrisPorDono(iris: IrisAgora | null | undefined): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of iris?.clientes ?? []) if (c.dono) m.set(c.dono, (m.get(c.dono) ?? 0) + 1);
  return m;
}
