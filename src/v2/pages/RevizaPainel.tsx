/* Painel + Atendentes da instância Reviza — MESMO markup da demo
   (PainelResumoVista / EquipeVista), alimentado pela base REAL.
   A demo é o contrato: aqui só muda a fonte dos números. */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BadgeStatus, CardVidro, EstadoVazio, TabelaPadrao, type Coluna } from '../components';
import { Dinheiro, PainelResumoVista, mesAno } from './painel/PainelResumo';
import type { ClienteAnalise } from './cobrancaAnalytics';
import { proximaCobrancaDoCiclo } from './cicloCalendario';
import { seriePorAtendente, seriePorCiclo } from './cobrancaAnalytics';
import { atendentesReais, clientesReais, previsaoReal, resumoCarteiraReal } from './revizaAnalytics';
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
   forma individual de seus clientes, e para o financeiro, administrador deve aparecer geral"):
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

  /* crítica 12/11: no lugar da lista cortada (100 de 453), "Clientes que precisam de atenção" —
     os inadimplentes (e quem faltou no último mês) de MAIOR valor, com o caminho para a Gestão.
     A lista completa é a própria Gestão. */
  const navigate = useNavigate();
  const LIMITE_ATENCAO = 10;
  const emAtraso = useMemo(() => cs
    .filter((c) => c.ativo !== false && !c.cancelado && (c.comportamento === 'inadimplente' || c.comportamento === 'faltou'))
    .sort((a, b) => (a.comportamento === b.comportamento ? 0 : a.comportamento === 'inadimplente' ? -1 : 1) || b.mensalidade - a.mensalidade || a.nome.localeCompare(b.nome, 'pt-BR')),
  [cs]);
  const atencao = emAtraso.slice(0, LIMITE_ATENCAO);
  const linhaPorId = useMemo(() => new Map(dados.linhas.map((l) => [l.id, l])), [dados.linhas]);
  const abrirNaGestao = (nome?: string) => {
    // a Gestão consome esta chave ao abrir e já filtra a busca pelo cliente (mesma ponte da paleta ⌘K)
    if (nome) { try { sessionStorage.setItem('alfa_paleta_busca', nome); } catch { /* sem sessionStorage: abre sem filtro */ } }
    navigate('/cobrancas/planilha');
  };
  const COLUNAS_TODAS: Coluna<ClienteAnalise>[] = [
    { chave: 'cliente', titulo: 'Cliente', render: (c) => <button type="button" className="pl-nome pn-at-nome" onClick={() => abrirNaGestao(c.nome)} title="Abrir na Gestão de cobranças">{c.nome}</button> },
    { chave: 'resp', titulo: 'Comercial', render: (c) => (c.atendente && c.atendente !== '—' ? c.atendente : '—') },
    { chave: 'ciclo', titulo: 'Ciclo', classe: 'num', render: (c) => { const l = linhaPorId.get(c.id); return l && l.dia > 0 ? `D${String(l.dia).padStart(2, '0')}` : '—'; } },
    { chave: 'prox', titulo: 'Próxima cobrança', classe: 'num', render: (c) => { const l = linhaPorId.get(c.id); return l && l.dia > 0 ? proximaCobranca(l.dia, dados.ciclosDatas) : '—'; } },
    { chave: 'mensal', titulo: 'Valor mensal', classe: 'num', render: (c) => fmtBRL(c.mensalidade) },
    { chave: 'status', titulo: 'Situação', render: (c) => (c.comportamento === 'inadimplente'
      ? <BadgeStatus tom="erro">Inadimplente</BadgeStatus>
      : <BadgeStatus tom="atencao">Faltou pagar</BadgeStatus>) },
  ];
  // painel individual: a coluna Comercial seria sempre o próprio comercial
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
        individual={individual ? soComercial : undefined}
        limiteAtend={5} aoVerEquipe={() => navigate('/cobrancas/atendentes')}
        aposKpis={previsao.some((p) => p.previsto > 0) ? (
          /* Previsão de faturamento (6 meses) subiu para logo abaixo dos indicadores: faixa compacta */
          <CardVidro spot className="pn-card pn-prev sobe" style={{ animationDelay: '.06s' }}>
            <div className="pn-card-cab">
              <div><h3>Previsão de faturamento</h3><p>Próximos 6 meses · líquido do escritório</p></div>
            </div>
            <div className="pn-prev-faixa">
              {previsao.map((p, i) => (
                <div className={i === 0 ? 'pn-prev-mes atual' : 'pn-prev-mes'} key={p.mes}>
                  <span className="pn-prev-rot num">{mesAno(p.mes)}{i === 0 && <em>mês atual</em>}</span>
                  <b className="pn-prev-val num"><Dinheiro v={p.previsto} /></b>
                  <span className="pn-prev-sub num">
                    {p.recebido > 0 && <span>Recebido {fmtBRL(p.recebido)}</span>}
                    {p.atraso > 0 && <span className="atraso">Em atraso {fmtBRL(p.atraso)}</span>}
                    {!(p.recebido > 0) && !(p.atraso > 0) && <span>{p.qtd} parcela{p.qtd === 1 ? '' : 's'}</span>}
                  </span>
                </div>
              ))}
            </div>
          </CardVidro>
        ) : undefined}
        antesAtend={dados.linhas.length > 0 ? (
          <CardVidro spot className="pn-card pn-sec pn-atencao sobe" style={{ animationDelay: '.18s' }}>
            <div className="pn-card-cab">
              <div>
                <h3>Clientes que precisam de atenção</h3>
                <p>{emAtraso.length === 0
                  ? 'Nenhum cliente em atraso na carteira'
                  : `${emAtraso.length.toLocaleString('pt-BR')} em atraso · ${emAtraso.length > LIMITE_ATENCAO ? `os ${LIMITE_ATENCAO} de maior valor, inadimplentes primeiro` : 'inadimplentes primeiro'}`}</p>
              </div>
              <button type="button" className="pn-link pn-ver" onClick={() => abrirNaGestao()}>Abrir na Gestão<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m9 18 6-6-6-6" /></svg></button>
            </div>
            {atencao.length === 0
              ? <EstadoVazio titulo="Carteira em dia" descricao="Nenhum cliente com pagamento em atraso." />
              : <TabelaPadrao colunas={COLUNAS} linhas={atencao} chave={(c) => c.id} />}
          </CardVidro>
        ) : undefined} />

      {individual && <MinhaComissao nome={soComercial ?? ''} dados={dados} />}

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
          onError: (e) => setAviso(`Não foi possível salvar a comissão: ${(e as Error).message}`),
        })} />
    </>
  );
}
