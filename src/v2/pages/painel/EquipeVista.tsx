/* =================== ATENDENTES — equipe comercial (dono 27/09) ===================
   "essa parte de atendente tem que ser mais profissional e não pode aparecer pro comercial".
   Mesma linguagem do Painel (painel.css, pn-*): barra de contexto · 4 indicadores ·
   desempenho da equipe (ordenável, saúde da carteira em barra, total no rodapé) ·
   comissões (editor de % para gestor/admin; financeiro só lê) · detalhe do comercial.
   Quem vê: gestor/admin/financeiro. O comercial NÃO chega aqui (menu, rota e o próprio
   AtendentesReviza barram — coberto em RevizaPainel.test.tsx). Demo e real: mesmo markup. */
import { useMemo, useState, type ReactNode } from 'react';
import { BadgeStatus, BotaoPrimario, BotaoSec, CardVidro, EstadoVazio, ModalV2 } from '../../components';
import { ROTULO_COMP, type ClienteAnalise, type Comportamento } from '../cobrancaAnalytics';
import type { LinhaAtendente } from '../cobrancaMotor';
import { PainelComercialVista, type ComissaoLinha } from '../RevizaComissoes';
import { PCT_PADRAO, compAtualComissao, fmtPct } from '../../data/cobranca/comissoes';
import { compHoje } from '../revizaAnalytics';
import { DESC_COMP, Dinheiro, Indicador, Proporcao, TOM_COMP, brl, mesAno, pct1 } from './PainelResumo';
import './painel.css';

const COMPS_ORDEM: Comportamento[] = ['em_dia', 'voltou', 'faltou', 'inadimplente'];
const TOM_BADGE: Record<Comportamento, 'ok' | 'atencao' | 'erro'> = { em_dia: 'ok', voltou: 'ok', faltou: 'atencao', inadimplente: 'erro' };
const chave = (s: string) => (s || '').trim().toUpperCase();

interface Membro {
  nome: string;
  emCobranca: number;       // carteira em cobrança (mesma população do Painel)
  novos: number;            // ainda nos Novos (débito ativo)
  recorrencia: number;      // Σ mensalidades da carteira em cobrança
  atrasoN: number;
  atrasoValor: number;
  adimplencia: number | null;   // null = sem carteira em cobrança
  recebido: number;         // tudo o que já entrou (histórico)
  semWa: number;
  ticket: number;
  brk: Record<Comportamento, number>;
  cs: ClienteAnalise[];
  comissao?: ComissaoLinha;
}

type Campo = 'nome' | 'emCobranca' | 'recorrencia' | 'atrasoN' | 'adimplencia' | 'recebido';

export function EquipeVista({ linhas, comissoes, podeEditarPct, salvando, aoSalvarPct, aoAvisar }: {
  linhas: LinhaAtendente[];
  comissoes: ComissaoLinha[];
  /** gestor/admin editam a %; financeiro só lê */
  podeEditarPct: boolean;
  salvando?: boolean;
  /** desde = 'AAAA-MM' a partir do qual a % vale ('2000-01' = todo o histórico) */
  aoSalvarPct: (comercial: string, pct: number, desde: string) => void;
  aoAvisar: (t: string) => void;
}) {
  const membros = useMemo<Membro[]>(() => {
    const porNome = new Map(comissoes.map((c) => [chave(c.nome), c]));
    return linhas.map((l) => {
      const av = l.cs.filter((c) => c.ativo !== false);
      const atr = av.filter((c) => c.comportamento === 'faltou' || c.comportamento === 'inadimplente');
      const brk = { em_dia: l.brk.emDia, voltou: l.brk.voltou, faltou: l.brk.faltou, inadimplente: l.brk.inad };
      return {
        nome: l.nome, emCobranca: av.length, novos: l.cs.filter((c) => c.ativo === false && !c.cancelado).length,
        recorrencia: l.recorrencia, atrasoN: atr.length, atrasoValor: atr.reduce((s, c) => s + c.mensalidade, 0),
        adimplencia: av.length ? l.adimplencia : null, recebido: l.faturamento, semWa: l.semWa, ticket: l.ticket,
        brk, cs: l.cs, comissao: porNome.get(chave(l.nome)),
      };
    });
  }, [linhas, comissoes]);

  const tot = useMemo(() => {
    const t = membros.reduce((a, m) => ({
      emCobranca: a.emCobranca + m.emCobranca, novos: a.novos + m.novos, recorrencia: a.recorrencia + m.recorrencia,
      atrasoN: a.atrasoN + m.atrasoN, atrasoValor: a.atrasoValor + m.atrasoValor, recebido: a.recebido + m.recebido,
      emDia: a.emDia + m.brk.em_dia + m.brk.voltou,
    }), { emCobranca: 0, novos: 0, recorrencia: 0, atrasoN: 0, atrasoValor: 0, recebido: 0, emDia: 0 });
    const brk = COMPS_ORDEM.map((c) => ({ comp: c, n: membros.reduce((s, m) => s + m.brk[c], 0) }));
    return { ...t, brk, adimplencia: t.emCobranca ? Math.round((t.emDia / t.emCobranca) * 100) : 0 };
  }, [membros]);
  const comPrevista = comissoes.reduce((s, c) => s + c.comissaoPrevista, 0);
  const ativos = membros.filter((m) => m.emCobranca > 0).length;

  // mês de referência das comissões: o último NÃO-futuro com alguma entrada
  const refComissao = useMemo(() => {
    const comps = comissoes[0]?.porComp ?? [];
    const teto = compHoje();
    for (let i = comps.length - 1; i >= 0; i--) {
      if ((comps[i]?.comp ?? '') > teto) continue;
      if (comissoes.some((l) => (l.porComp[i]?.recebido ?? 0) > 0)) return { i, comp: comps[i].comp };
    }
    return null;
  }, [comissoes]);

  // ordenação da tabela
  const [ordem, setOrdem] = useState<{ campo: Campo; dir: 'asc' | 'desc' }>({ campo: 'recorrencia', dir: 'desc' });
  const ordenados = useMemo(() => {
    const v = (m: Membro): number | string => (ordem.campo === 'nome' ? m.nome.toUpperCase() : ordem.campo === 'adimplencia' ? (m.adimplencia ?? -1) : m[ordem.campo]);
    return [...membros].sort((a, b) => {
      const x = v(a), y = v(b);
      const c = typeof x === 'string' ? x.localeCompare(y as string, 'pt-BR') : (x as number) - (y as number);
      return ordem.dir === 'asc' ? c : -c;
    });
  }, [membros, ordem]);
  const ordenar = (campo: Campo) => setOrdem((o) => (o.campo === campo ? { campo, dir: o.dir === 'asc' ? 'desc' : 'asc' } : { campo, dir: campo === 'nome' ? 'asc' : 'desc' }));
  const maxRec = Math.max(1, ...membros.map((m) => m.recebido));

  const [sel, setSel] = useState<string | null>(null);
  const [painelDe, setPainelDe] = useState<ComissaoLinha | null>(null);
  const membroSel = membros.find((m) => m.nome === sel) ?? null;

  // editor de %
  const [edicao, setEdicao] = useState<Record<string, string>>({});
  const limpar = (nome: string) => setEdicao((m) => { const { [nome]: _fora, ...resto } = m; return resto; });
  const salvar = (l: ComissaoLinha) => {
    const cru = (edicao[l.nome] ?? '').trim().replace(',', '.');
    if (cru === '') return;
    const pct = Number(cru);
    if (!Number.isFinite(pct) || pct < 0 || pct >= 100) { aoAvisar('A porcentagem precisa ser de 0 a 99 — com 100% não sobra nada pro escritório.'); return; }
    if (pct === l.pct && !temOutraPct(l, pct)) { limpar(l.nome); return; }
    // a % tem histórico (mig 62): pergunta A PARTIR DE QUANDO vale — o que já foi pago fica com a % da época
    setMudarPct({ nome: l.nome, de: l.pct, para: pct, modo: 'frente', desde: proximoMes() });
  };
  /* dono 29/09: "tem que ver se vai ser pro próximo mês ou de todos os meses que ele já fez — e
     tem que atualizar lá os valores". modo 'frente' = a partir de um mês (padrão: o que vem);
     'todos' = desde sempre. Os valores JÁ LANÇADOS desses meses são refeitos na planilha. */
  /** há mês lançado com % diferente (ou mudança agendada)? então digitar a MESMA % ainda serve pra estender a todos os meses */
  const temOutraPct = (l: ComissaoLinha, pct: number) => !!l.agendada || l.porComp.some((p) => p.recebido > 0 && p.pct !== pct);
  const [mudarPct, setMudarPct] = useState<{ nome: string; de: number; para: number; modo: 'frente' | 'todos'; desde: string } | null>(null);
  const somaMes = (ym: string, k: number) => { const [y, m] = ym.split('-').map(Number); const n = y * 12 + (m - 1) + k; return `${Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, '0')}`; };
  const proximoMes = () => somaMes(compAtualComissao(), 1);
  const opcoesDesde = useMemo(() => {
    const atual = compAtualComissao();
    const itens = [{ v: somaMes(atual, 1), t: `${mesAno(somaMes(atual, 1))} (mês que vem)` }, { v: atual, t: `${mesAno(atual)} (este mês)` }];
    for (let k = 1; k <= 12; k++) itens.push({ v: somaMes(atual, -k), t: mesAno(somaMes(atual, -k)) });
    return itens;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /* prévia do que a mudança refaz (a mesma conta do banco, somada por mês) */
  const previa = useMemo(() => {
    if (!mudarPct) return null;
    const linha = comissoes.find((c) => c.nome === mudarPct.nome);
    const desde = mudarPct.modo === 'todos' ? '2000-01' : mudarPct.desde;
    let n = 0, escAntes = 0, escDepois = 0, comAntes = 0, comDepois = 0, cliente = 0;
    for (const p of linha?.porComp ?? []) {
      if (p.comp < desde || !(p.recebido > 0) || p.pct >= 100 || p.pct === mudarPct.para) continue;   // o banco pula o que não muda
      const depois = (p.recebido * (100 - mudarPct.para)) / (100 - p.pct);
      n += p.n; escAntes += p.recebido; escDepois += depois; comAntes += p.comissao; cliente += p.pagoClientes;
      comDepois += (depois * mudarPct.para) / (100 - mudarPct.para);
    }
    const pctDoMes = (comp: string) => linha?.porComp.find((p) => p.comp === comp)?.pct ?? mudarPct.de;
    const nPend = (linha?.pendentes ?? []).filter((e) => e.comp >= desde && pctDoMes(e.comp) !== mudarPct.para).length;
    return { n, escAntes, escDepois, comAntes, comDepois, cliente, desde, nPend };
  }, [mudarPct, comissoes]);

  const th = (campo: Campo, children: ReactNode, num?: boolean) => (
    <th scope="col" key={campo} className={num ? 'num' : undefined} aria-sort={ordem.campo === campo ? (ordem.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className={ordem.campo === campo ? 'pn-ord on' : 'pn-ord'} onClick={() => ordenar(campo)}>
        {children}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          {ordem.campo === campo && ordem.dir === 'asc' ? <path d="m6 15 6-6 6 6" /> : <path d="m6 9 6 6 6-6" />}
        </svg>
      </button>
    </th>
  );

  if (membros.length === 0) {
    return <CardVidro spot sobe style={{ borderRadius: 'var(--r-card)' }}><EstadoVazio titulo="Sem clientes ainda" descricao="Quando houver clientes com comercial responsável, o desempenho da equipe aparece aqui." /></CardVidro>;
  }

  return (
    <div className="pn">
      {/* barra de contexto */}
      <div className="pn-barra sobe">
        <div className="pn-barra-esq">
          <span className="pn-barra-rot">Equipe comercial</span>
          <span className="pn-barra-stat num"><b>{ativos}</b> comerciais com carteira</span>
        </div>
        <div className="pn-barra-dir">
          <span className="pn-barra-stat num"><b>{tot.emCobranca.toLocaleString('pt-BR')}</b> em cobrança</span>
          {tot.novos > 0 && <span className="pn-barra-stat num"><b>{tot.novos.toLocaleString('pt-BR')}</b> nos Novos</span>}
        </div>
      </div>

      {/* indicadores */}
      <div className="pn-kpis sobe" style={{ animationDelay: '.04s' }}>
        <Indicador rotulo="Carteira em cobrança" valor={<>{tot.emCobranca.toLocaleString('pt-BR')}<span className="pn-cent"> clientes</span></>}
          pe={<>ticket médio <b className="num">{brl(tot.emCobranca ? tot.recorrencia / tot.emCobranca : 0)}</b></>}
          visual={<Proporcao partes={tot.brk.map((b) => ({ v: b.n, tom: TOM_COMP[b.comp], titulo: `${ROTULO_COMP[b.comp]}: ${b.n}` }))} />} />
        <Indicador rotulo="Recorrência mensal" valor={<Dinheiro v={tot.recorrencia} />}
          pe={<>comissões previstas <b className="num">{brl(comPrevista)}</b>/mês</>}
          visual={<div className="pn-trilho" title={`Comissões: ${pct1(tot.recorrencia ? (comPrevista / tot.recorrencia) * 100 : 0)}% da recorrência`}><i className="neutro" style={{ width: `${tot.recorrencia ? Math.min(100, (comPrevista / tot.recorrencia) * 100) : 0}%` }} /></div>} />
        <Indicador rotulo="Em atraso" valor={<>{tot.atrasoN.toLocaleString('pt-BR')}<span className="pn-cent"> clientes</span></>} tom={tot.atrasoN > 0 ? 'er' : undefined}
          pe={<><b className="num">{brl(tot.atrasoValor)}</b>/mês · {pct1(tot.emCobranca ? (tot.atrasoN / tot.emCobranca) * 100 : 0)}% da carteira</>}
          visual={<div className="pn-trilho"><i className="er" style={{ width: `${tot.emCobranca ? (tot.atrasoN / tot.emCobranca) * 100 : 0}%` }} /></div>} />
        <Indicador rotulo="Adimplência da equipe" valor={tot.emCobranca ? <>{tot.adimplencia}<span className="pn-cent">%</span></> : '—'}
          tom={!tot.emCobranca ? undefined : tot.adimplencia >= 80 ? 'ok' : tot.adimplencia >= 60 ? 'at' : 'er'}
          pe={<><b className="num">{tot.emDia.toLocaleString('pt-BR')}</b> de {tot.emCobranca.toLocaleString('pt-BR')} clientes em dia</>}
          visual={<div className="pn-trilho"><i className={tot.adimplencia >= 80 ? 'ok' : tot.adimplencia >= 60 ? 'at' : 'er'} style={{ width: `${tot.adimplencia}%` }} /></div>} />
      </div>

      {/* desempenho da equipe */}
      <CardVidro spot className="pn-card sobe" style={{ animationDelay: '.08s' }}>
        <div className="pn-card-cab">
          <div><h3>Desempenho da equipe</h3><p>Carteira em cobrança de cada comercial · clique numa coluna para ordenar e num nome para ver o detalhe</p></div>
          <div className="pn-leg" aria-hidden>
            {COMPS_ORDEM.map((c) => <span key={c}><i className={`pn-leg-q ${TOM_COMP[c]}`} />{ROTULO_COMP[c]}</span>)}
          </div>
        </div>
        <div className="pn-mapa-rolo">
          <table className="pn-eq">
            <thead>
              <tr>
                {th('nome', 'Comercial')}
                {th('emCobranca', 'Carteira', true)}
                {th('recorrencia', 'Recorrência/mês', true)}
                <th scope="col">Saúde da carteira</th>
                {th('atrasoN', 'Em atraso', true)}
                {th('adimplencia', 'Adimplência', true)}
                {th('recebido', 'Recebido (total)', true)}
              </tr>
            </thead>
            <tbody>
              {ordenados.map((m) => {
                const tom = m.adimplencia == null ? undefined : m.adimplencia >= 80 ? 'ok' : m.adimplencia >= 60 ? 'at' : 'er';
                return (
                  <tr key={m.nome} onClick={() => setSel(m.nome)}>
                    <td>
                      <button type="button" className="pn-eq-nome" onClick={(e) => { e.stopPropagation(); setSel(m.nome); }}>
                        <span className="pn-av" aria-hidden>{m.nome.slice(0, 2).toUpperCase()}</span>
                        <span className="pn-eq-nm">{m.nome}{m.novos > 0 && <small className="num">{m.novos} nos Novos</small>}</span>
                      </button>
                    </td>
                    <td className="num"><b>{m.emCobranca}</b> <span className="pn-mut">cli.</span></td>
                    <td className="num"><b>{brl(m.recorrencia)}</b></td>
                    <td className="pn-eq-saude">
                      {m.emCobranca > 0
                        ? <Proporcao partes={COMPS_ORDEM.map((c) => ({ v: m.brk[c], tom: TOM_COMP[c], titulo: `${ROTULO_COMP[c]}: ${m.brk[c]}` }))} />
                        : <span className="pn-mut">sem carteira em cobrança</span>}
                    </td>
                    <td className="num">{m.atrasoN > 0 ? <span className="pn-eq-atraso"><b>{m.atrasoN}</b><small>{brl(m.atrasoValor)}</small></span> : <span className="pn-mut">—</span>}</td>
                    <td className="num">
                      {m.adimplencia == null ? <span className="pn-mut">—</span> : (
                        <span className="pn-eq-adim">
                          <span className={`pn-eq-adim-v ${tom}`}>{m.adimplencia}%</span>
                          <span className="pn-trilho"><i className={tom} style={{ width: `${m.adimplencia}%` }} /></span>
                        </span>
                      )}
                    </td>
                    <td className="num">
                      <span className="pn-eq-rec"><span>{brl(m.recebido)}</span><span className="pn-trilho"><i className="acento" style={{ width: `${(m.recebido / maxRec) * 100}%` }} /></span></span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Equipe</th>
                <td className="num"><b>{tot.emCobranca.toLocaleString('pt-BR')}</b> <span className="pn-mut">cli.</span></td>
                <td className="num"><b>{brl(tot.recorrencia)}</b></td>
                <td className="pn-eq-saude"><Proporcao partes={tot.brk.map((b) => ({ v: b.n, tom: TOM_COMP[b.comp], titulo: `${ROTULO_COMP[b.comp]}: ${b.n}` }))} /></td>
                <td className="num"><b>{tot.atrasoN}</b></td>
                <td className="num"><b>{tot.emCobranca ? `${tot.adimplencia}%` : '—'}</b></td>
                <td className="num"><b>{brl(tot.recebido)}</b></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </CardVidro>

      {/* comissões */}
      <CardVidro spot className="pn-card sobe" style={{ animationDelay: '.12s' }}>
        <div className="pn-card-cab">
          <div>
            <h3>Comissões</h3>
            <p>
              A mensalidade (o que o cliente paga) é metade da parcela e se divide entre escritório e comercial pela % dele (padrão {PCT_PADRAO}% = metade pra cada).
              Na planilha entra o líquido do escritório; o realizado do comercial sai dele — com {PCT_PADRAO}%, o mesmo valor.
              {podeEditarPct ? ' Edite a % e salve — vale na hora para previsões e fechamentos.' : ' A % é definida pelo administrador.'}
            </p>
          </div>
          <span className="pn-card-lado num">previsto <b>{brl(comPrevista)}</b>/mês</span>
        </div>
        {comissoes.length === 0 ? (
          <p className="pn-vazio">Nenhum comercial com carteira ainda.</p>
        ) : (
          <div className="pn-mapa-rolo">
            <table className="pn-eq pn-com">
              <thead>
                <tr>
                  <th scope="col">Comercial</th>
                  <th scope="col">Comissão</th>
                  <th scope="col" className="num">Carteira ativa</th>
                  <th scope="col" className="num">Mensalidades/mês</th>
                  <th scope="col" className="num">Prevista/mês</th>
                  <th scope="col" className="num">{refComissao ? `Recebida em ${mesAno(refComissao.comp)}` : 'Recebida no mês'}</th>
                  <th scope="col"><span className="pn-vh">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                {comissoes.map((l) => {
                  const ed = edicao[l.nome];
                  const edNum = ed != null && ed.trim() !== '' ? Number(ed.replace(',', '.')) : null;
                  const sujo = edNum != null && (edNum !== l.pct || temOutraPct(l, edNum));
                  return (
                    <tr key={l.nome}>
                      <td><span className="pn-eq-nome estatico"><span className="pn-av" aria-hidden>{l.nome.slice(0, 2).toUpperCase()}</span><span className="pn-eq-nm">{l.nome}</span></span></td>
                      <td>
                        {podeEditarPct ? (
                          <span className="pn-pct">
                            <span className={sujo ? 'pn-pct-campo sujo' : 'pn-pct-campo'}>
                              <input inputMode="decimal" value={ed ?? String(l.pct)} aria-label={`Comissão de ${l.nome} em %`}
                                onChange={(e) => setEdicao((m) => ({ ...m, [l.nome]: e.target.value.replace(/[^0-9.,]/g, '') }))}
                                onKeyDown={(e) => { if (e.key === 'Enter') salvar(l); if (e.key === 'Escape') limpar(l.nome); }} />
                              <span aria-hidden>%</span>
                            </span>
                            {sujo && <button type="button" className="pn-pct-salvar" onClick={() => salvar(l)} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>}
                            {!sujo && temOutraPct(l, l.pct) && !l.agendada && (
                              <button type="button" className="pn-link pn-pct-estender" onClick={() => setMudarPct({ nome: l.nome, de: l.pct, para: l.pct, modo: 'todos', desde: proximoMes() })}
                                title={`Há meses já lançados com outra %. Aplicar ${fmtPct(l.pct)}% a todos os meses refaz esses valores.`}>aplicar a todos os meses</button>
                            )}
                          </span>
                        ) : <span className="pn-tag suave">{fmtPct(l.pct)}%</span>}
                        {l.agendada && <span className="pn-pct-agenda" title="Mudança já marcada pra um mês que ainda não chegou">{fmtPct(l.agendada.pct)}% a partir de {mesAno(l.agendada.desde)}</span>}
                      </td>
                      <td className="num">{l.carteiraAtiva}</td>
                      <td className="num">{brl(l.recorrencia)}</td>
                      <td className="num"><b>{brl(l.comissaoPrevista)}</b></td>
                      <td className="num">{refComissao ? brl(l.porComp[refComissao.i]?.comissao ?? 0) : '—'}</td>
                      <td className="pn-com-acao"><button type="button" className="pn-link" onClick={() => setPainelDe(l)}>Ver painel</button></td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">Total</th>
                  <td />
                  <td className="num"><b>{comissoes.reduce((s, l) => s + l.carteiraAtiva, 0)}</b></td>
                  <td className="num"><b>{brl(comissoes.reduce((s, l) => s + l.recorrencia, 0))}</b></td>
                  <td className="num"><b>{brl(comPrevista)}</b></td>
                  <td className="num"><b>{refComissao ? brl(comissoes.reduce((s, l) => s + (l.porComp[refComissao.i]?.comissao ?? 0), 0)) : '—'}</b></td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </CardVidro>

      {/* detalhe do comercial */}
      <ModalV2 aberto={!!membroSel} aoFechar={() => setSel(null)} largura={620}
        titulo={membroSel ? (
          <div className="cm-dr-titulo"><span className="pn-av grande" aria-hidden>{membroSel.nome.slice(0, 2).toUpperCase()}</span>
            <div><div className="cm-dr-nm">{membroSel.nome}</div><div className="mod-sub num">{membroSel.emCobranca} em cobrança{membroSel.novos ? ` · ${membroSel.novos} nos Novos` : ''}</div></div></div>
        ) : ''}
        rodape={<>{membroSel?.comissao && <BotaoSec onClick={() => { setPainelDe(membroSel.comissao ?? null); setSel(null); }}>Ver painel de comissão</BotaoSec>}<span style={{ flex: 1 }} /><BotaoSec onClick={() => setSel(null)}>Fechar</BotaoSec></>}>
        {membroSel && (
          <div className="pn-det">
            <div className="pn-det-stats">
              <div><span>Recorrência/mês</span><b className="num">{brl(membroSel.recorrencia)}</b></div>
              <div><span>Ticket médio</span><b className="num">{brl(membroSel.ticket)}</b></div>
              <div><span>Em atraso</span><b className={membroSel.atrasoN ? 'num er' : 'num'}>{membroSel.atrasoN}</b></div>
              <div><span>Sem WhatsApp</span><b className={membroSel.semWa ? 'num at' : 'num'}>{membroSel.semWa}</b></div>
            </div>
            <div className="pn-det-sec">Saúde da carteira</div>
            <Proporcao partes={COMPS_ORDEM.map((c) => ({ v: membroSel.brk[c], tom: TOM_COMP[c], titulo: `${ROTULO_COMP[c]}: ${membroSel.brk[c]}` }))} />
            <ul className="pn-saude pn-det-saude">
              {COMPS_ORDEM.map((c) => (
                <li key={c}>
                  <i className={`pn-ponto ${TOM_COMP[c]}`} aria-hidden />
                  <span className="pn-saude-rot">{ROTULO_COMP[c]}<small>{DESC_COMP[c]}</small></span>
                  <span className="pn-saude-n num">{membroSel.brk[c]}</span>
                  <span className="pn-saude-pct num">{pct1(membroSel.emCobranca ? (membroSel.brk[c] / membroSel.emCobranca) * 100 : 0)}%</span>
                </li>
              ))}
            </ul>
            <div className="pn-det-sec">Clientes ({membroSel.cs.filter((c) => !c.cancelado).length})</div>
            <ul className="pn-det-cli">
              {membroSel.cs.filter((c) => !c.cancelado).sort((a, b) => Number(b.ativo !== false) - Number(a.ativo !== false) || b.mensalidade - a.mensalidade).map((c) => (
                <li key={c.id}>
                  <span className="pn-det-cli-nm">{c.nome}<small className="num">{c.ativo !== false ? `${c.ciclo} · ${brl(c.mensalidade)}/mês` : 'nos Novos — débito ativo'}</small></span>
                  {c.ativo !== false ? <BadgeStatus tom={TOM_BADGE[c.comportamento]}>{ROTULO_COMP[c.comportamento]}</BadgeStatus> : <BadgeStatus tom="neutro">Novo</BadgeStatus>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </ModalV2>

      {painelDe && (
        <ModalV2 aberto aoFechar={() => setPainelDe(null)} largura={760}
          titulo={<div>Painel de comissão — {painelDe.nome}<div className="mod-sub">{fmtPct(painelDe.pct)}% sobre a mensalidade · {painelDe.carteiraAtiva} cliente{painelDe.carteiraAtiva === 1 ? '' : 's'} ativo{painelDe.carteiraAtiva === 1 ? '' : 's'}</div></div>}
          rodape={<BotaoSec onClick={() => setPainelDe(null)}>Fechar</BotaoSec>}>
          <PainelComercialVista linha={painelDe} de={painelDe.nome} />
        </ModalV2>
      )}

      {mudarPct && previa && (
        <ModalV2 aberto aoFechar={() => { if (!salvando) setMudarPct(null); }} largura={500}
          titulo={<div>{mudarPct.para === mudarPct.de ? `Aplicar ${fmtPct(mudarPct.para)}% a ${mudarPct.nome}` : `Mudar a comissão de ${mudarPct.nome}`}<div className="mod-sub">{mudarPct.para === mudarPct.de ? 'Mesma % de hoje, estendida aos meses que ainda estão com outra' : <>De {fmtPct(mudarPct.de)}% (este mês) para {fmtPct(mudarPct.para)}% da mensalidade</>}</div></div>}
          rodape={<>
            <BotaoSec onClick={() => setMudarPct(null)} disabled={salvando}>Cancelar</BotaoSec>
            <BotaoPrimario disabled={salvando} onClick={() => { aoSalvarPct(mudarPct.nome, mudarPct.para, previa.desde); limpar(mudarPct.nome); setMudarPct(null); }}>
              {previa.n > 0 ? `Salvar e refazer ${previa.n.toLocaleString('pt-BR')} pagamento${previa.n === 1 ? '' : 's'}` : 'Salvar'}
            </BotaoPrimario>
          </>}>
          <div className="pn-pct-desde">
            <span className="pn-pct-rot">Vale para</span>
            <label className={mudarPct.modo === 'frente' ? 'pn-pct-op on' : 'pn-pct-op'}>
              <input type="radio" name="pn-pct-modo" checked={mudarPct.modo === 'frente'} onChange={() => setMudarPct({ ...mudarPct, modo: 'frente' })} />
              <span>
                <b>Daqui pra frente</b>
                <span className="pn-pct-sub">a partir de{' '}
                  <select className="inp" value={mudarPct.desde} aria-label="A partir de qual mês" disabled={mudarPct.modo !== 'frente'}
                    onChange={(e) => setMudarPct({ ...mudarPct, desde: e.target.value })}>
                    {opcoesDesde.map((o) => <option key={o.v} value={o.v}>{o.t}</option>)}
                  </select>
                  {' '}— os meses antes continuam com a % de cada época.
                </span>
              </span>
            </label>
            <label className={mudarPct.modo === 'todos' ? 'pn-pct-op on' : 'pn-pct-op'}>
              <input type="radio" name="pn-pct-modo" checked={mudarPct.modo === 'todos'} onChange={() => setMudarPct({ ...mudarPct, modo: 'todos' })} />
              <span>
                <b>Todos os meses</b>
                <span className="pn-pct-sub">inclusive os já lançados dos clientes que hoje são de {mudarPct.nome} (e os dele na Lixeira) — tudo passa a ser calculado com {fmtPct(mudarPct.para)}%.</span>
              </span>
            </label>

            <div className="pn-pct-previa" role="status">
              {previa.n > 0 ? (<>
                <b>Vai refazer {previa.n.toLocaleString('pt-BR')} pagamento{previa.n === 1 ? '' : 's'} já lançado{previa.n === 1 ? '' : 's'} na planilha</b>
                <span>Escritório: {brl(previa.escAntes)} → <b>{brl(previa.escDepois)}</b></span>
                <span>{mudarPct.nome}: {brl(previa.comAntes)} → <b>{brl(previa.comDepois)}</b></span>
                <span className="pn-mut">O que os clientes pagaram ({brl(previa.cliente)}) não muda — só a divisão.</span>
              </>) : (
                <span>Nenhum pagamento lançado {previa.desde === '2000-01' ? '' : `de ${mesAno(previa.desde)} em diante `}muda — só os próximos lançamentos usam {fmtPct(mudarPct.para)}%.</span>
              )}
              {previa.nPend > 0 && <span>+ {previa.nPend} informe{previa.nPend === 1 ? '' : 's'} ainda pendente{previa.nPend === 1 ? '' : 's'} com o valor ajustado.</span>}
              <span className="pn-mut">Ex.: cliente pagou R$ 100 → R$ {fmtPct(100 - mudarPct.para)} pro escritório e R$ {fmtPct(mudarPct.para)} pra {mudarPct.nome}.{previa.n > 0 ? ' Dá pra voltar pelo Desfazer, no topo.' : ''}</span>
            </div>
          </div>
        </ModalV2>
      )}
    </div>
  );
}
