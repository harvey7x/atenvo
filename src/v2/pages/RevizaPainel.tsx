/* Painel + Atendentes da instância Reviza — MESMO markup da demo
   (PainelResumoVista / EquipeVista), alimentado pela base REAL.
   A demo é o contrato: aqui só muda a fonte dos números. */
import { useMemo, useState } from 'react';
import { BadgeStatus, CardVidro, Chip, Chips, EstadoVazio, Input, TabelaPadrao, type Coluna } from '../components';
import { PainelResumoVista } from './painel/PainelResumo';
import { proximaCobrancaDoCiclo } from './cicloCalendario';
import { seriePorAtendente, seriePorCiclo } from './cobrancaAnalytics';
import { atendentesReais, clientesReais, compHoje, previsaoReal, resumoCarteiraReal } from './revizaAnalytics';
import { PainelComercialVista, comissoesDe } from './RevizaComissoes';
import { EquipeVista } from './painel/EquipeVista';
import { fmtPct, useComissoes, useComissoesHist, useSalvarComissao } from '../data/cobranca/comissoes';
import { usePapel } from '../data/cobranca/sessao';
import { useDadosCobranca } from '../data/cobranca/hooks';
import type { Dados, GLinha } from '../data/cobranca/types';

const mesAnoPct = (ym: string) => { const [y, m] = ym.split('-').map(Number); return ym === '2000-01' ? 'todo o histórico' : `${['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][m - 1]}/${String(y).slice(2)}`; };
const VAZIO: Dados = { comps: [], linhas: [], pendentes: [], historico: [] };
const fmtBRL = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** próxima cobrança do ciclo — a MESMA conta da Gestão/Calendário/motor
    (fds/feriado deslocados + data manual do Calendário), em dd/mm/aaaa. */
function proximaCobranca(dia: number, ciclosDatas?: Dados['ciclosDatas']): string {
  const iso = proximaCobrancaDoCiclo(dia, ciclosDatas);
  return iso ? iso.split('-').reverse().join('/') : '—';
}

/* QUEM VÊ O QUÊ (dono 14/09 + 27/09: "pro comercial, esse dashboard deve aparecer de
   forma individual de seus clientes, e pro financeiro, administrador deve aparecer geral"):
   COMERCIAL = o MESMO painel, só com os clientes DELE (o RLS já filtra; o filtro por nome
   aqui é a segunda trava) + a comissão dele; financeiro/gestor/admin = painel GERAL. */
export function PainelReviza() {
  const sessao = usePapel().data;
  if (!sessao) return null;                              // sem flash do painel geral pra quem não deve ver
  if (sessao.papel === 'comercial') return <PainelGeralReviza soComercial={sessao.nome ?? ''} />;
  return <PainelGeralReviza />;
}

/** comissão do comercial logado (abaixo do painel individual) */
function MinhaComissao({ nome, dados }: { nome: string; dados: Dados }) {
  const pcts = useComissoes().data;
  const hist = useComissoesHist().data;
  const cs = useMemo(() => clientesReais(dados), [dados]);
  const minha = useMemo(() => {
    const eu = nome.trim().toUpperCase();
    if (!eu) return null;
    return comissoesDe(cs, dados.comps, pcts ?? {}, dados.ciclosDatas, hist, dados.pendentes).find((l) => l.nome.trim().toUpperCase() === eu) ?? null;
  }, [nome, cs, dados.comps, dados.ciclosDatas, dados.pendentes, pcts, hist]);
  if (!minha) return null;
  return (
    <>
      <div className="cm-sec-lista sobe"><span className="caps">Minha comissão</span><BadgeStatus tom="ok">{fmtPct(minha.pct)}% de comissão</BadgeStatus></div>
      <PainelComercialVista linha={minha} compacto />
    </>
  );
}

/* exportado: o modo DEMO (Alfa) renderiza ESTE componente no Painel — mesmo
   markup, mesma fonte (useDadosCobranca lê o blob no demo). Demo é o contrato. */
export function PainelGeralReviza({ soComercial }: {
  /** painel INDIVIDUAL: só os clientes deste comercial (nome do perfil, upper/btrim — a
      mesma regra do RLS comercial_dono) */
  soComercial?: string;
} = {}) {
  const { data } = useDadosCobranca();
  const base = data ?? VAZIO;
  const individual = soComercial !== undefined;
  const dados = useMemo<Dados>(() => {
    if (!individual) return base;
    const eu = (soComercial ?? '').trim().toUpperCase();
    const dele = (l: GLinha) => (l.comercial || '').trim().toUpperCase() === eu;
    // os Cancelados dele também (o histórico pago conta no faturamento e na comissão)
    return { ...base, linhas: eu ? base.linhas.filter(dele) : [], cancelados: eu ? (base.cancelados ?? []).filter(dele) : [] };
  }, [base, individual, soComercial]);
  const r = useMemo(() => resumoCarteiraReal(dados), [dados]);
  const cs = useMemo(() => clientesReais(dados), [dados]);
  const ciclosM = useMemo(() => seriePorCiclo(cs), [cs]);
  const atendM = useMemo(() => seriePorAtendente(cs), [cs]);
  const pctsPrev = useComissoes().data;
  const histPrev = useComissoesHist().data;
  const previsao = useMemo(() => previsaoReal(dados, pctsPrev, histPrev), [dados, pctsPrev, histPrev]);
  // contexto do topo do painel: quem ainda está nos Novos (débito ativo)
  const novos = useMemo(() => {
    const l = dados.linhas.filter((x) => x.situacao !== 'cancelado');
    return { n: l.length, mensal: l.reduce((s, x) => s + x.valor / 2, 0) };
  }, [dados.linhas]);
  // meses que já chegaram (coluna aberta antes da hora / lixo de teste não conta no "X de N pagas")
  const hojeComp = compHoje();
  const nMeses = useMemo(() => dados.comps.filter((c) => c <= hojeComp).length, [dados.comps, hojeComp]);

  // a lista segue a MESMA segmentação da Gestão: 'cancelado' = carteira EM
  // COBRANÇA (padrão), 'ativo' = Novos. Os chips antigos (Concluídas/Canceladas)
  // eram herança do mockup e devolviam lista vazia; o status era fixo 'Ativa'.
  const [filtro, setFiltro] = useState<'cobranca' | 'novos' | 'todas'>('cobranca');
  const [busca, setBusca] = useState('');
  const compPorId = useMemo(() => new Map(cs.map((c) => [c.id, c.comportamento])), [cs]);
  const lista = useMemo(() => {
    const seg = filtro === 'todas' ? dados.linhas
      : dados.linhas.filter((l) => (filtro === 'cobranca' ? l.situacao === 'cancelado' : l.situacao !== 'cancelado'));
    const q = busca.trim().toLowerCase();
    if (!q) return seg;
    const dig = q.replace(/\D/g, '');                     // com ≥3 dígitos, a busca também casa com o CPF
    return seg.filter((l) =>
      l.nome.toLowerCase().includes(q) || (l.telefone || '').includes(dig || q) || (l.comercial || '').toLowerCase().includes(q)
      || (dig.length >= 3 && (l.cpf || '').replace(/\D/g, '').includes(dig)));
  }, [dados.linhas, filtro, busca]);

  const nPagas = (l: GLinha) => l.celulas.slice(0, nMeses).filter((c) => { const n = Number(String(c).replace(',', '.')); return c !== '-' && c !== '' && !Number.isNaN(n) && n > 0; }).length;
  const statusDe = (l: GLinha) => {
    if (l.situacao !== 'cancelado') return <BadgeStatus tom="neutro">Novo</BadgeStatus>;
    const comp = compPorId.get(l.id);
    if (comp === 'inadimplente') return <BadgeStatus tom="erro">Inadimplente</BadgeStatus>;
    if (comp === 'faltou') return <BadgeStatus tom="atencao">Em atraso</BadgeStatus>;
    return <BadgeStatus tom="ok">Em dia</BadgeStatus>;
  };
  const COLUNAS_TODAS: Coluna<GLinha>[] = [
    { chave: 'cliente', titulo: 'Cliente', render: (l) => <div><div>{l.nome}</div><div className="num" style={{ color: 'var(--txt-3)', fontSize: 11.5 }}>{l.telefone || 'sem tel.'}</div></div> },
    { chave: 'mensal', titulo: 'Valor mensal', dir: true, classe: 'num', render: (l) => fmtBRL(l.valor / 2) },
    { chave: 'ciclos', titulo: 'Ciclos', classe: 'num', render: (l) => `${nPagas(l)} de ${nMeses} pagas` },
    { chave: 'prox', titulo: 'Próxima', dir: true, classe: 'num', render: (l) => proximaCobranca(l.dia, dados.ciclosDatas) },
    { chave: 'status', titulo: 'Status', render: statusDe },
    { chave: 'resp', titulo: 'Responsável', render: (l) => l.comercial || '—' },
  ];
  // painel individual: a coluna Responsável seria sempre o próprio comercial
  const COLUNAS = individual ? COLUNAS_TODAS.filter((c) => c.chave !== 'resp') : COLUNAS_TODAS;

  if (individual && dados.linhas.length === 0 && !(dados.cancelados?.length)) {
    return (
      <CardVidro spot sobe style={{ borderRadius: 'var(--r-card)' }}>
        <EstadoVazio titulo="Sua carteira ainda não tem clientes" descricao="Quando clientes forem cadastrados com você como responsável, seu painel aparece aqui." />
      </CardVidro>
    );
  }

  return (
    <>
      <PainelResumoVista r={r} ciclosM={ciclosM} atendM={atendM} ciclosDatas={dados.ciclosDatas} novos={novos}
        individual={individual ? soComercial : undefined} />

      {individual && <MinhaComissao nome={soComercial ?? ''} dados={dados} />}

      <div className="cm-sec-lista sobe" style={{ animationDelay: '.26s' }}><span className="caps">Clientes</span></div>

      <div className="cob-filtros sobe" style={{ animationDelay: '.12s' }}>
        <Chips>
          <Chip ativo={filtro === 'cobranca'} onClick={() => setFiltro('cobranca')}>Em cobrança</Chip>
          <Chip ativo={filtro === 'novos'} onClick={() => setFiltro('novos')}>Novos</Chip>
          <Chip ativo={filtro === 'todas'} onClick={() => setFiltro('todas')}>Todos</Chip>
        </Chips>
        <div className="cob-busca">
          <Input placeholder={individual ? 'Buscar por cliente ou telefone…' : 'Buscar por cliente, telefone, CPF ou responsável…'} value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar cobranças" />
        </div>
      </div>

      <CardVidro spot sobe style={{ borderRadius: 'var(--r-card)', animationDelay: '.18s' }}>
        {lista.length === 0 ? (
          dados.linhas.length === 0 ? (
            <EstadoVazio titulo="Nenhuma cobrança cadastrada" descricao="Importe as planilhas em “Gestão de cobranças” e “Novos” — os números aparecem aqui automaticamente." />
          ) : (
            <EstadoVazio titulo="Nenhuma cobrança encontrada" descricao="Ajuste a busca ou os filtros." acao={{ rotulo: 'Limpar filtros', onClick: () => { setFiltro('todas'); setBusca(''); } }} />
          )
        ) : (
          <TabelaPadrao colunas={COLUNAS} linhas={lista.slice(0, 100)} chave={(l) => l.id}
            rodape={{ texto: `${lista.length} cliente${lista.length === 1 ? '' : 's'}${filtro === 'cobranca' ? ' em cobrança' : filtro === 'novos' ? ' nos Novos' : ''}` }} />
        )}
      </CardVidro>

      {previsao.some((p) => p.previsto > 0) && (
        <div className="sobe" style={{ marginTop: 20, animationDelay: '.24s' }}>
          <span className="caps" style={{ display: 'block', marginBottom: 10 }}>Previsão de faturamento (6 meses) · líquido do escritório</span>
          <div className="prev-grid">
            {previsao.map((p) => (
              <CardVidro spot className="prev-card" key={p.mes}>
                <div className="prev-mes num">{p.mes.split('-').reverse().join('/')}</div>
                <div className="prev-val num">{fmtBRL(p.previsto)}</div>
                <div className="prev-sub num">Recebido {fmtBRL(p.recebido)}{p.atraso > 0 && <span className="atraso"> · Atraso {fmtBRL(p.atraso)}</span>}</div>
                <div className="prev-qtd num">{p.qtd} parcela{p.qtd === 1 ? '' : 's'}</div>
              </CardVidro>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

export function AtendentesReviza() {
  const { data } = useDadosCobranca();
  const dados = data ?? VAZIO;
  const sessao = usePapel().data;
  const pcts = useComissoes().data;
  const hist = useComissoesHist().data;
  const salvarPct = useSalvarComissao();
  const [aviso, setAviso] = useState('');
  const linhas = useMemo(() => atendentesReais(dados), [dados]);
  const cs = useMemo(() => clientesReais(dados), [dados]);
  const comissoes = useMemo(() => comissoesDe(cs, dados.comps, pcts ?? {}, dados.ciclosDatas, hist, dados.pendentes), [cs, dados.comps, dados.ciclosDatas, dados.pendentes, pcts, hist]);
  // a tela é de gestor/admin/financeiro; enquanto o papel carrega (ou se um
  // comercial/cadastro chegar por URL num cold load), nada é montado
  if (!sessao || sessao.papel === 'comercial' || sessao.papel === 'cadastro') return null;
  if (linhas.length === 0) {
    return <CardVidro spot sobe style={{ borderRadius: 'var(--r-card)' }}><EstadoVazio titulo="Sem clientes ainda" descricao="Importe as planilhas para acompanhar a carteira de cada comercial." /></CardVidro>;
  }
  return (
    <>
      {aviso && <div className="gs-aviso" role="status" style={{ marginBottom: 12 }}><span>{aviso}</span><button type="button" className="gs-aviso-x" onClick={() => setAviso('')} aria-label="Fechar">×</button></div>}
      <EquipeVista linhas={linhas} comissoes={comissoes} podeEditarPct={!!sessao.gestor} salvando={salvarPct.isPending} aoAvisar={setAviso}
        aoSalvarPct={(comercial, pct, desde) => salvarPct.mutate({ comercial, pct, desde }, {
          onSuccess: (r) => setAviso(`Comissão de ${comercial}: ${pct}% da mensalidade ${desde === '2000-01' ? 'em todos os meses' : `a partir de ${mesAnoPct(desde)}`}${r.n ? ` — ${r.n.toLocaleString('pt-BR')} pagamento${r.n === 1 ? '' : 's'} refeito${r.n === 1 ? '' : 's'} na planilha` : ''}.`),
          onError: (e) => setAviso(`Não deu pra salvar a comissão: ${(e as Error).message}`),
        })} />
    </>
  );
}
