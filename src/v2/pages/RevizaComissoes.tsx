/* Comissões por comercial — markup ÚNICO (demo e Reviza usam o mesmo, padrão Vista).
   Regra do dono (14/09): a empresa recebe a MENSALIDADE (metade da parcela);
   o comercial recebe uma % da mensalidade — padrão 50% ("metade da metade"),
   configurável por comercial pelo administrador.
   - a tabela de todos os comerciais (% editável) vive em ./painel/EquipeVista.tsx.
   - PainelComercialVista: dashboard PESSOAL (carteira, % dele, previsão por
     ciclo, comissão mês a mês, clientes com a comissão de cada um). */
import { CardVidro, EstadoVazio, Kpi, TabelaPadrao, type Coluna } from '../components';
import { estadoCelula, type ClienteAnalise } from './cobrancaAnalytics';
import { compHoje } from './revizaAnalytics';
import { proximaCobrancaBR } from './cicloCalendario';
import { compAtualComissao, fmtPct, parteDoComercial, pctNoMes, type HistComissao } from '../data/cobranca/comissoes';
import type { Entrada } from '../data/cobranca/types';
import type { Dados } from '../data/cobranca/types';

type CiclosDatas = Dados['ciclosDatas'];

const fmtBRL = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rotComp = (c: string) => { const [y, m] = c.split('-'); return `${m}/${y?.slice(2) ?? ''}`; };

/** próxima cobrança do ciclo (dd/mm) — a MESMA conta da Gestão/Calendário/motor */
const proximaData = (dia: number, ciclosDatas?: CiclosDatas): string => proximaCobrancaBR(dia, ciclosDatas);
const valorPagoCel = (raw: string): number => { const e = estadoCelula(raw ?? ''); return e.estado === 'pago' ? (e.valor ?? 0) : 0; };

export interface ComissaoCiclo { ciclo: string; dia: number; clientes: number; mensal: number; comissao: number; proxima: string }
/** recebido = Σ células pagas = LÍQUIDO DO ESCRITÓRIO; comissao = a parte do comercial sobre ele;
    pagoClientes = o que os clientes pagaram (escritório + comercial) */
export interface ComissaoComp { comp: string; recebido: number; comissao: number; pagoClientes: number; pct: number; n: number }
export interface ComissaoCliente {
  id: string; nome: string; mensal: number; comissao: number; ciclo: string; proxima: string; ativo: boolean;
  /** na aba Cancelados (mig 79): fora da carteira, mas os meses pagos seguem contando */
  cancelado?: boolean;
}
export interface ComissaoLinha {
  nome: string;               // como está na carteira (leads.comercial)
  pct: number;                // % da mensalidade QUE VALE NESTE MÊS (histórico)
  /** mudança já agendada pra um mês que ainda não chegou */
  agendada?: { desde: string; pct: number };
  /** informes pendentes dos clientes dele (o "mudar a %" refaz o valor informado também) */
  pendentes: { comp: string; valor: number }[];
  carteiraAtiva: number;      // clientes ativos
  recorrencia: number;        // Σ mensalidade dos ativos (o que a empresa recebe/mês)
  comissaoPrevista: number;   // recorrencia × pct
  porCiclo: ComissaoCiclo[];
  porComp: ComissaoComp[];    // recebido = células pagas (líquido do escritório; inclui ex-clientes) → comissao = parte do comercial
  clientes: ComissaoCliente[];
}

/** agrupa a carteira por comercial e aplica a % de cada um (demo e Reviza);
    ciclosDatas (opcional) faz a "próxima cobrança" respeitar as datas manuais */
export function comissoesDe(cs: ClienteAnalise[], comps: string[], pcts: Record<string, number>, ciclosDatas?: CiclosDatas, hist?: HistComissao, pendentes?: Entrada[]): ComissaoLinha[] {
  const mesAtual = compAtualComissao();
  // agrupa caixa-insensível (carteira tem 'EDUARDO' e cadastro manual pode gravar 'Eduardo')
  const por = new Map<string, { nome: string; clientes: ClienteAnalise[] }>();
  for (const c of cs) {
    const bruto = (c.atendente || '').trim();
    if (!bruto || bruto === '—') continue;
    const chave = bruto.toUpperCase();
    const g = por.get(chave) ?? { nome: bruto, clientes: [] };
    g.clientes.push(c); por.set(chave, g);
  }
  const out: ComissaoLinha[] = [];
  for (const { nome, clientes } of por.values()) {
    const pct = pctNoMes(hist, pcts, nome, mesAtual);
    const agendada = (hist?.[nome.trim().toUpperCase()] ?? []).find((p) => p.desde > mesAtual);
    const ids = new Set(clientes.map((c) => c.id));
    const pend = (pendentes ?? []).filter((e) => ids.has(e.leadId) && e.valor > 0).map((e) => ({ comp: e.comp, valor: e.valor }));
    const fator = pct / 100;
    const ativos = clientes.filter((c) => c.ativo !== false);
    const recorrencia = ativos.reduce((s, c) => s + c.mensalidade, 0);
    const porDia = new Map<number, { clientes: number; mensal: number }>();
    const semCiclo = { clientes: 0, mensal: 0 };
    for (const c of ativos) {
      const dia = Number(c.ciclo.replace(/\D/g, '')) || 0;
      if (dia <= 0) { semCiclo.clientes += 1; semCiclo.mensal += c.mensalidade; continue; }
      const x = porDia.get(dia) ?? { clientes: 0, mensal: 0 };
      x.clientes += 1; x.mensal += c.mensalidade; porDia.set(dia, x);
    }
    const porCiclo: ComissaoCiclo[] = [...porDia.entries()].sort((a, b) => a[0] - b[0]).map(([dia, x]) => ({
      ciclo: `D${String(dia).padStart(2, '0')}`, dia, clientes: x.clientes, mensal: x.mensal,
      comissao: x.mensal * fator, proxima: proximaData(dia, ciclosDatas),
    }));
    // ativos ainda sem ciclo entram como linha própria — o total da tabela sempre fecha
    if (semCiclo.clientes > 0) porCiclo.push({ ciclo: 'Sem ciclo', dia: 0, clientes: semCiclo.clientes, mensal: semCiclo.mensal, comissao: semCiclo.mensal * fator, proxima: '—' });
    // realizado: a célula é o líquido do ESCRITÓRIO (áudio do dono 29/09) — a parte do comercial sai
    // dela (50% = igual), não é a % aplicada em cima (isso dava a metade)
    // soma POR PAGAMENTO (cada um já arredondado) — bate centavo a centavo com a janela de informar
    // cada mês usa a % que valia NAQUELE mês (histórico, mig 62): mudar a % não reescreve o que já foi pago
    const porComp: ComissaoComp[] = comps.map((comp, k) => {
      const pctMes = pctNoMes(hist, pcts, nome, comp);
      let recebido = 0, comissao = 0, n = 0;
      for (const c of clientes) { const v = valorPagoCel(c.celulas[k] ?? ''); if (v > 0) { recebido += v; comissao += parteDoComercial(v, pctMes); n += 1; } }
      recebido = Math.round(recebido * 100) / 100; comissao = Math.round(comissao * 100) / 100;
      return { comp, recebido, comissao, pagoClientes: Math.round((recebido + comissao) * 100) / 100, pct: pctMes, n };
    });
    const lista: ComissaoCliente[] = [...clientes]
      .sort((a, b) => Number(b.ativo !== false) - Number(a.ativo !== false) || b.mensalidade - a.mensalidade)
      .map((c) => ({
        id: c.id, nome: c.nome, mensal: c.mensalidade, comissao: c.mensalidade * fator,
        ciclo: c.ciclo, proxima: proximaData(Number(c.ciclo.replace(/\D/g, '')) || 0, ciclosDatas), ativo: c.ativo !== false,
        cancelado: !!c.cancelado,
      }));
    out.push({ nome, pct, agendada, pendentes: pend, carteiraAtiva: ativos.length, recorrencia, comissaoPrevista: recorrencia * fator, porCiclo, porComp, clientes: lista });
  }
  return out.sort((a, b) => b.comissaoPrevista - a.comissaoPrevista);
}

/* =================== dashboard PESSOAL de um comercial =================== */
/** dinheiro no Kpi sem perder os centavos (contador anima os reais; centavos no sufixo) */
const kpiBRL = (v: number) => { const cent = Math.round(v * 100); return { valor: Math.trunc(cent / 100), sufixo: `,${String(Math.abs(cent) % 100).padStart(2, '0')}` }; };

/** `de` = nome do comercial quando QUEM LÊ é o admin/financeiro (tela Atendentes): o texto fala "de Eduardo",
    não "sua" — o dono é a outra parte da divisão. Sem `de` = o próprio comercial no Painel dele. */
export function PainelComercialVista({ linha, compacto, de }: { linha: ComissaoLinha; compacto?: boolean; de?: string }) {
  const nm = de ? de.trim().toLowerCase().replace(/(^|\s)(\p{L})/gu, (_m, a: string, c: string) => a + c.toUpperCase()) : '';
  const sua = de ? `de ${nm}` : 'sua';          // "Comissão sua" soa mal: os rótulos usam as formas abaixo
  const Sua = de ? `Parte de ${nm}` : 'Sua parte';
  const SuaCom = de ? `Comissão de ${nm}` : 'Sua comissão';
  const pctTxt = fmtPct(linha.pct); const restoTxt = fmtPct(100 - linha.pct);
  // último mês com entradas SEM contar competência futura (colunas de meses à
  // frente já abertas na grade não podem virar o mês de referência)
  const ateHoje = linha.porComp.filter((p) => p.comp <= compHoje());
  const ultComComissao = [...ateHoje].reverse().find((p) => p.recebido > 0);
  const serie = ateHoje.slice(-8);
  const maxCol = Math.max(1, ...serie.map((p) => p.comissao));
  const COL_CICLO: Coluna<ComissaoCiclo>[] = [
    { chave: 'ciclo', titulo: 'Ciclo', render: (c) => <b className="num">{c.ciclo}</b> },
    { chave: 'cli', titulo: 'Clientes', classe: 'num', render: (c) => c.clientes },
    { chave: 'mensal', titulo: 'Mensalidades', dir: true, classe: 'num', render: (c) => fmtBRL(c.mensal) },
    { chave: 'com', titulo: SuaCom, dir: true, classe: 'num', render: (c) => <b>{fmtBRL(c.comissao)}</b> },
    { chave: 'prox', titulo: 'Próxima cobrança', dir: true, classe: 'num', render: (c) => c.proxima },
  ];
  const COL_CLI: Coluna<ComissaoCliente>[] = [
    { chave: 'nome', titulo: 'Cliente', render: (c) => <div>{c.nome}{!c.ativo && <span className="cm-hint" style={{ margin: '0 0 0 8px', display: 'inline' }}>{c.cancelado ? 'nos Cancelados' : 'novo — débito ativo'}</span>}</div> },
    { chave: 'ciclo', titulo: 'Ciclo', classe: 'num', render: (c) => c.ciclo },
    { chave: 'mensal', titulo: 'Mensalidade', dir: true, classe: 'num', render: (c) => fmtBRL(c.mensal) },
    { chave: 'com', titulo: `${SuaCom}/mês`, dir: true, classe: 'num', render: (c) => (c.ativo ? <b>{fmtBRL(c.comissao)}</b> : <span style={{ color: 'var(--txt-3)' }}>—</span>) },
    { chave: 'prox', titulo: 'Próxima', dir: true, classe: 'num', render: (c) => (c.ativo ? c.proxima : '—') },
  ];
  return (
    <>
      <div className="kpis sobe">
        <Kpi rotulo="Carteira ativa" valor={linha.carteiraAtiva} sufixo=" clientes" />
        <Kpi rotulo="Mensalidades da carteira" {...kpiBRL(linha.recorrencia)} prefixo="R$ " nota="o que os clientes pagam por mês" />
        <Kpi rotulo={`${SuaCom} prevista/mês`} {...kpiBRL(linha.comissaoPrevista)} prefixo="R$ " tomValor="ok" nota={`${pctTxt}% da mensalidade de cada cliente`} />
        <Kpi rotulo={ultComComissao ? `${Sua} em ${rotComp(ultComComissao.comp)} (último mês com entradas)` : `${Sua} recebida`} {...kpiBRL(ultComComissao?.comissao ?? 0)} prefixo="R$ " tomValor="ok"
          nota={ultComComissao
            ? (linha.pct === 50
              ? `igual ao que ficou pro escritório (${fmtBRL(ultComComissao.recebido)}) · clientes pagaram ${fmtBRL(ultComComissao.pagoClientes)}`
              : `escritório ficou com ${fmtBRL(ultComComissao.recebido)} · clientes pagaram ${fmtBRL(ultComComissao.pagoClientes)}`)
            : 'nenhum pagamento na competência ainda'} />
      </div>

      <div className="cm-sec-lista sobe" style={{ animationDelay: '.08s' }}><span className="caps">Previsão por ciclo</span></div>
      <CardVidro spot sobe style={{ borderRadius: 'var(--r-card)', animationDelay: '.1s' }}>
        {linha.porCiclo.length === 0
          ? <EstadoVazio titulo="Nenhum cliente com ciclo definido" descricao="Quando os clientes forem direcionados aos ciclos na Gestão, a previsão aparece aqui." />
          : <TabelaPadrao colunas={COL_CICLO} linhas={linha.porCiclo} chave={(c) => c.ciclo}
              rodape={{ texto: `Total previsto: ${fmtBRL(linha.comissaoPrevista)}/mês (${pctTxt}% de ${fmtBRL(linha.recorrencia)})` }} />}
      </CardVidro>

      {serie.some((p) => p.comissao > 0) && (
        <>
          <div className="cm-sec-lista sobe" style={{ animationDelay: '.14s' }}><span className="caps">Comissão mês a mês</span></div>
          <CardVidro spot sobe style={{ borderRadius: 'var(--r-card)', animationDelay: '.16s' }}>
            <div className="an-graf" role="img" aria-label="Comissão recebida por mês">
              <div className="an-cols">
                {serie.map((p) => (
                  <div className="an-col" key={p.comp} title={`${rotComp(p.comp)}: ${fmtBRL(p.comissao)} (${fmtPct(p.pct)}%)`}>
                    <span className="an-col-v num">{p.comissao > 0 ? fmtBRL(p.comissao) : ''}</span>
                    <div className="an-col-bar"><i style={{ height: `${Math.max(p.comissao > 0 ? 3 : 1, Math.round((p.comissao / maxCol) * 100))}%` }} /></div>
                    <span className="an-col-l num">{rotComp(p.comp)}</span>
                  </div>
                ))}
              </div>
            </div>
            <p className="cm-hint" style={{ margin: '10px 0 0' }}>
              {linha.pct === 50
                ? `O que entra na planilha é o líquido do escritório, e a parte ${sua} é o mesmo valor: o cliente pagou R$ 100 → R$ 50 ficam pro escritório e R$ 50 ${de ? `são de ${nm}` : 'são seus'}.`
                : `O que entra na planilha é o líquido do escritório (${restoTxt}% do que o cliente paga); a parte ${sua} é ${pctTxt}%: o cliente pagou R$ 100 → R$ ${restoTxt} pro escritório e R$ ${pctTxt} ${de ? `de ${nm}` : 'seus'}.`}
              {' '}Só entram pagamentos confirmados. Cada mês usa a % que valia na época.
            </p>
          </CardVidro>
        </>
      )}

      {!compacto && (
        <>
          <div className="cm-sec-lista sobe" style={{ animationDelay: '.2s' }}><span className="caps">{de ? `Clientes de ${nm}` : 'Meus clientes'}</span></div>
          <CardVidro spot sobe style={{ borderRadius: 'var(--r-card)', animationDelay: '.22s' }}>
            <TabelaPadrao colunas={COL_CLI} linhas={linha.clientes.slice(0, 200)} chave={(c) => c.id}
              rodape={{ texto: `${linha.clientes.length} cliente${linha.clientes.length === 1 ? '' : 's'} na carteira` }} />
          </CardVidro>
        </>
      )}
    </>
  );
}

/* visão geral (gestor/admin/financeiro) = ./painel/EquipeVista.tsx (redesenho 27/09) */
