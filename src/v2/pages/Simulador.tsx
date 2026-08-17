import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BadgeStatus, BotaoMini, BotaoPrimario, BotaoSec, CardCab, CardVidro, Checkbox, EstadoVazio,
  Input, Segmentado, type OpcaoSegmentado,
} from '../components';
import {
  BANCOS_SIMULADOR, TAXA_REFERENCIA_PADRAO,
  type BancoSimulador, type BancoSimuladorId,
} from '@/config/simuladorBancos';
import {
  calcularCartao, calcularContrato, mensagemCliente, mesAnoBR, numeroBR, parseInteiro,
  parseValorBR, resumoInterno, taxaBR, totaisSimulacao, valorBR, type DadosSimulacao,
} from '@/lib/simulador';
import './simulador.css';

/* ------------------------------------------------------------------
   Simulador de Valores — ferramenta interna dos atendentes (INSS):
   estimativa de recuperação em (1) empréstimos com juros abusivos e
   (2) cartões RMC/RCC. Stateless de propósito nesta v1: nada é salvo,
   nenhum dado sai do navegador. Motor puro em src/lib/simulador.ts;
   bancos/faixas em src/config/simuladorBancos.ts.
   ------------------------------------------------------------------ */

const TOOLTIP_REF = 'Taxa usada no recálculo (teto/média BACEN conforme a tese). Alterar recalcula tudo.';
const MESES = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));

type ModoTaxa = 'media' | 'exata';
type LinhaEmp = {
  id: number; bancoId: BancoSimuladorId;
  parcela: string; prazo: string; pagas: string;
  modo: ModoTaxa; taxaExata: string;
};
type LinhaCart = {
  id: number; tipo: 'RMC' | 'RCC'; bancoId: BancoSimuladorId;
  valor: string; iniMes: string; iniAno: string;
  ainda: boolean; fimMes: string; fimAno: string;
};

let seq = 0;
const uid = () => ++seq;
const bancoDe = (id: BancoSimuladorId): BancoSimulador =>
  BANCOS_SIMULADOR.find((b) => b.id === id) ?? BANCOS_SIMULADOR[0];

type MesAno = { mes: number; ano: number };
function lerMesAno(mesRaw: string, anoRaw: string): MesAno | null {
  const mes = parseInteiro(mesRaw);
  const ano = anoRaw.trim().length === 4 ? parseInteiro(anoRaw) : null;
  if (!mes || mes < 1 || mes > 12 || !ano) return null;
  return { mes, ano };
}
const antesDe = (a: MesAno, b: MesAno) => a.ano < b.ano || (a.ano === b.ano && a.mes < b.mes);

/* --- análise das linhas (validações → cálculo) --------------------- */
type ErrosEmp = { parcela?: string; prazo?: string; pagas?: string; taxa?: string };
type CalcEmpOk = {
  ok: true; banco: BancoSimulador; parcela: number; prazo: number; modo: ModoTaxa;
  taxaMin: number; taxaMax: number; totalMin: number; totalMax: number;
  dentro: boolean; temJa: boolean; jaMin: number; jaMax: number;
};
type CalcEmp = { ok: false; erros: ErrosEmp } | CalcEmpOk;

function analisarEmprestimo(l: LinhaEmp, taxaReferencia: number): CalcEmp {
  const banco = bancoDe(l.bancoId);
  const parcela = parseValorBR(l.parcela);
  const prazo = parseInteiro(l.prazo);
  const pagas = l.pagas.trim() ? parseInteiro(l.pagas) : undefined;
  const taxaExata = l.modo === 'exata' ? parseValorBR(l.taxaExata) : null;

  const erros: ErrosEmp = {};
  if (parcela == null || parcela <= 0) erros.parcela = 'Maior que zero.';
  if (prazo == null || prazo < 1 || prazo > 120) erros.prazo = '1 a 120 meses.';
  if (l.pagas.trim() && pagas == null) erros.pagas = 'Só números.';
  if (l.modo === 'exata' && (taxaExata == null || taxaExata < 0.5 || taxaExata > 30)) erros.taxa = '0,5 a 30% a.m.';
  if (Object.keys(erros).length) return { ok: false, erros };

  const tMin = l.modo === 'media' ? banco.taxaMin : taxaExata!;
  const tMax = l.modo === 'media' ? banco.taxaMax : taxaExata!;
  const base = { parcela: parcela!, prazo: prazo!, taxaReferencia, parcelasPagas: pagas ?? undefined };
  const rMin = calcularContrato({ ...base, taxaContratada: tMin });
  const rMax = calcularContrato({ ...base, taxaContratada: tMax });
  return {
    ok: true, banco, parcela: parcela!, prazo: prazo!, modo: l.modo,
    taxaMin: tMin, taxaMax: tMax,
    totalMin: rMin.totalProjetado, totalMax: rMax.totalProjetado,
    dentro: rMax.dentroDaReferencia,
    temJa: !!pagas && !rMax.dentroDaReferencia,
    jaMin: rMin.jaDescontado ?? 0, jaMax: rMax.jaDescontado ?? 0,
  };
}

type ErrosCart = { valor?: string; inicio?: string; fim?: string };
type CalcCartOk = { ok: true; valor: number; inicio: MesAno; meses: number; total: number; totalEmDobro: number };
type CalcCart = { ok: false; erros: ErrosCart } | CalcCartOk;

function analisarCartao(l: LinhaCart, hoje: MesAno): CalcCart {
  const valor = parseValorBR(l.valor);
  const inicio = lerMesAno(l.iniMes, l.iniAno);
  const fim = l.ainda ? null : lerMesAno(l.fimMes, l.fimAno);

  const erros: ErrosCart = {};
  if (valor == null || valor <= 0) erros.valor = 'Maior que zero.';
  if (!inicio) erros.inicio = 'Informe mês e ano.';
  else if (inicio.ano < 1990) erros.inicio = 'Ano inválido.';
  else if (antesDe(hoje, inicio)) erros.inicio = 'Não pode ser no futuro.';
  if (!l.ainda) {
    if (!fim) erros.fim = 'Informe mês e ano.';
    else if (inicio && antesDe(fim, inicio)) erros.fim = 'Anterior ao início.';
  }
  if (Object.keys(erros).length) return { ok: false, erros };

  const r = calcularCartao({ valorMensal: valor!, inicio: inicio!, fim: fim ?? undefined });
  return { ok: true, valor: valor!, inicio: inicio!, ...r };
}

const opcoesModo = (b: BancoSimulador): OpcaoSegmentado<ModoTaxa>[] => [
  { valor: 'media', rotulo: `Média do banco (${taxaBR(b.taxaMin)}–${taxaBR(b.taxaMax)}%)` },
  { valor: 'exata', rotulo: 'Taxa exata' },
];

const campoCls = (extra: string, erro?: string) =>
  ['campo', extra, erro ? 'invalida' : ''].filter(Boolean).join(' ');

function SelectBanco({ id, valor, aoMudar }: { id: string; valor: BancoSimuladorId; aoMudar: (b: BancoSimuladorId) => void }) {
  return (
    <select id={id} className="inp" value={valor} onChange={(e) => aoMudar(e.target.value as BancoSimuladorId)}>
      {BANCOS_SIMULADOR.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
    </select>
  );
}

function CamposMesAno({ idBase, rotulo, mes, ano, erro, aoMudar }: {
  idBase: string; rotulo: string; mes: string; ano: string; erro?: string;
  aoMudar: (patch: { mes?: string; ano?: string }) => void;
}) {
  return (
    <div className={campoCls('sim-c-mesano', erro)}>
      <label htmlFor={`${idBase}-mes`}>{rotulo}</label>
      <div className="sim-ma">
        <select id={`${idBase}-mes`} className="inp" aria-label={`Mês (${rotulo.toLowerCase()})`} value={mes}
          onChange={(e) => aoMudar({ mes: e.target.value })}>
          <option value="">mês</option>
          {MESES.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <input className="inp num" inputMode="numeric" maxLength={4} placeholder="AAAA" aria-label={`Ano (${rotulo.toLowerCase()})`}
          value={ano} onChange={(e) => aoMudar({ ano: e.target.value })} />
      </div>
      {erro && <span className="hint">{erro}</span>}
    </div>
  );
}

export default function Simulador() {
  /* ajustes: taxa de referência (recalcula tudo; guarda o último valor válido) */
  const [ajustesAberto, setAjustesAberto] = useState(false);
  const [taxaRefRaw, setTaxaRefRaw] = useState(taxaBR(TAXA_REFERENCIA_PADRAO));
  const [taxaRef, setTaxaRef] = useState(TAXA_REFERENCIA_PADRAO);
  const vRef = parseValorBR(taxaRefRaw);
  const taxaRefErro = vRef == null || vRef < 0.5 || vRef > 5 ? '0,5 a 5% a.m.' : undefined;

  /* linhas */
  const [linhasEmp, setLinhasEmp] = useState<LinhaEmp[]>([]);
  const [linhasCart, setLinhasCart] = useState<LinhaCart[]>([]);
  const mudarEmp = (id: number, patch: Partial<LinhaEmp>) =>
    setLinhasEmp((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const mudarCart = (id: number, patch: Partial<LinhaCart>) =>
    setLinhasCart((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  /* barra de adição rápida (empréstimos) */
  const [addBanco, setAddBanco] = useState<BancoSimuladorId>(BANCOS_SIMULADOR[0].id);
  const [addQtd, setAddQtd] = useState('1');
  const [addParcela, setAddParcela] = useState('');
  const [addPrazo, setAddPrazo] = useState('84');
  const [addTentou, setAddTentou] = useState(false);
  const addParcelaV = parseValorBR(addParcela);
  const addPrazoV = parseInteiro(addPrazo);
  const addErroParcela = addParcelaV == null || addParcelaV <= 0 ? 'Maior que zero.' : undefined;
  const addErroPrazo = addPrazoV == null || addPrazoV < 1 || addPrazoV > 120 ? '1 a 120 meses.' : undefined;
  const mudarQtd = (delta: number) =>
    setAddQtd(String(Math.min(20, Math.max(1, (parseInteiro(addQtd) ?? 1) + delta))));
  function adicionarEmprestimos() {
    if (addErroParcela || addErroPrazo) { setAddTentou(true); return; }
    const qtd = Math.min(20, Math.max(1, parseInteiro(addQtd) ?? 1));
    setLinhasEmp((ls) => [
      ...ls,
      ...Array.from({ length: qtd }, (): LinhaEmp => ({
        id: uid(), bancoId: addBanco, parcela: addParcela, prazo: addPrazo, pagas: '', modo: 'media', taxaExata: '',
      })),
    ]);
    setAddTentou(false);
  }
  const duplicarEmp = (id: number) => setLinhasEmp((ls) => {
    const i = ls.findIndex((l) => l.id === id);
    return i < 0 ? ls : [...ls.slice(0, i + 1), { ...ls[i], id: uid() }, ...ls.slice(i + 1)];
  });
  const adicionarCartao = () => setLinhasCart((ls) => [
    ...ls,
    { id: uid(), tipo: 'RMC', bancoId: BANCOS_SIMULADOR[0].id, valor: '', iniMes: '', iniAno: '', ainda: true, fimMes: '', fimAno: '' },
  ]);
  const duplicarCart = (id: number) => setLinhasCart((ls) => {
    const i = ls.findIndex((l) => l.id === id);
    return i < 0 ? ls : [...ls.slice(0, i + 1), { ...ls[i], id: uid() }, ...ls.slice(i + 1)];
  });

  /* cálculo derivado */
  const hoje = useMemo<MesAno>(() => {
    const d = new Date();
    return { mes: d.getMonth() + 1, ano: d.getFullYear() };
  }, []);
  const empsCalc = useMemo(() => linhasEmp.map((l) => ({ l, c: analisarEmprestimo(l, taxaRef) })), [linhasEmp, taxaRef]);
  const cartsCalc = useMemo(() => linhasCart.map((l) => ({ l, c: analisarCartao(l, hoje) })), [linhasCart, hoje]);

  /* consolidado */
  const [nome, setNome] = useState('');
  const dados = useMemo<DadosSimulacao>(() => ({
    nome,
    taxaReferencia: taxaRef,
    emprestimos: empsCalc
      .filter((x): x is { l: LinhaEmp; c: CalcEmpOk } => x.c.ok)
      .map(({ c }) => ({
        banco: c.banco.nome, parcela: c.parcela, prazo: c.prazo, modo: c.modo,
        taxaMin: c.taxaMin, taxaMax: c.taxaMax, totalMin: c.totalMin, totalMax: c.totalMax,
      })),
    cartoes: cartsCalc
      .filter((x): x is { l: LinhaCart; c: CalcCartOk } => x.c.ok)
      .map(({ l, c }) => ({
        tipo: l.tipo, banco: bancoDe(l.bancoId).nome, valorMensal: c.valor,
        inicio: c.inicio, meses: c.meses, total: c.total, totalEmDobro: c.totalEmDobro,
      })),
  }), [empsCalc, cartsCalc, nome, taxaRef]);
  const tot = totaisSimulacao(dados);
  const nEmpRec = dados.emprestimos.filter((e) => e.totalMax > 0).length; // "dentro da referência" fica fora da conta
  const nCart = dados.cartoes.length;
  const temAlgo = dados.emprestimos.length + nCart > 0;
  const temValor = tot.totalMax > 0;
  const faixa = (min: number, max: number) =>
    Math.round(min) === Math.round(max) ? `R$ ${numeroBR(max)}` : `R$ ${numeroBR(min)} – R$ ${numeroBR(max)}`;

  /* cópia (clipboard + retorno no próprio botão, padrão Coexistência) */
  type Copia = 'cliente' | 'interno';
  const [copiado, setCopiado] = useState<{ qual: Copia; ok: boolean } | null>(null);
  const tCopia = useRef<number | null>(null);
  useEffect(() => () => { if (tCopia.current) window.clearTimeout(tCopia.current); }, []);
  async function copiar(qual: Copia) {
    const d = new Date();
    const data = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    const texto = qual === 'cliente' ? mensagemCliente(dados) : resumoInterno(dados, data);
    let ok = true;
    try { await navigator.clipboard.writeText(texto); } catch { ok = false; }
    setCopiado({ qual, ok });
    if (tCopia.current) window.clearTimeout(tCopia.current);
    tCopia.current = window.setTimeout(() => setCopiado(null), 2000);
  }
  const rotuloCopia = (qual: Copia, normal: string) =>
    copiado?.qual !== qual ? normal : copiado.ok ? 'Copiado ✓' : 'Não foi possível copiar';

  return (
    <>
      <div className="ph sobe">
        <div>
          <h2>Simulador</h2>
          <p>Valores estimados a recuperar — empréstimos com juros abusivos e cartões RMC/RCC. Ferramenta de apoio; nada é salvo.</p>
        </div>
        <div className="acoes">
          <BotaoSec onClick={() => setAjustesAberto((v) => !v)} aria-expanded={ajustesAberto} title={TOOLTIP_REF}>
            Ajustes · ref. {taxaBR(taxaRef)}% a.m.
          </BotaoSec>
        </div>
      </div>

      <div className="sim-col">
        {ajustesAberto && (
          <CardVidro className="sim-ajustes">
            <div className={campoCls('', taxaRefErro)}>
              <label htmlFor="sim-taxa-ref">Taxa de referência (% a.m.)</label>
              <input
                id="sim-taxa-ref" className="inp num" inputMode="decimal" title={TOOLTIP_REF}
                value={taxaRefRaw}
                onChange={(e) => {
                  setTaxaRefRaw(e.target.value);
                  const v = parseValorBR(e.target.value);
                  if (v != null && v >= 0.5 && v <= 5) setTaxaRef(v);
                }}
              />
              {taxaRefErro && <span className="hint">{taxaRefErro}</span>}
            </div>
            <div className="nota">{TOOLTIP_REF}</div>
          </CardVidro>
        )}

        {/* ---- Bloco 1 — Empréstimos (juros abusivos) ---- */}
        <CardVidro sobe atraso={0.06} className="sim-bloco">
          <CardCab titulo="Empréstimos (juros abusivos)" contador={linhasEmp.length || undefined} />
          <div className="sim-add">
            <div className="campo sim-c-banco">
              <label htmlFor="sim-add-banco">Banco</label>
              <SelectBanco id="sim-add-banco" valor={addBanco} aoMudar={setAddBanco} />
            </div>
            <div className="campo sim-c-qtd">
              <label htmlFor="sim-add-qtd">Qtd</label>
              <div className="sim-step">
                <button type="button" aria-label="Diminuir quantidade" onClick={() => mudarQtd(-1)}>−</button>
                <input id="sim-add-qtd" className="inp num" inputMode="numeric" value={addQtd}
                  onChange={(e) => setAddQtd(e.target.value)}
                  onBlur={() => setAddQtd(String(Math.min(20, Math.max(1, parseInteiro(addQtd) ?? 1))))} />
                <button type="button" aria-label="Aumentar quantidade" onClick={() => mudarQtd(1)}>+</button>
              </div>
            </div>
            <div className={campoCls('sim-c-valor', addTentou ? addErroParcela : undefined)}>
              <label htmlFor="sim-add-parcela">Parcela média (R$)</label>
              <input id="sim-add-parcela" className="inp num" inputMode="decimal" placeholder="0,00"
                value={addParcela} onChange={(e) => setAddParcela(e.target.value)} />
              {addTentou && addErroParcela && <span className="hint">{addErroParcela}</span>}
            </div>
            <div className={campoCls('sim-c-prazo', addTentou ? addErroPrazo : undefined)}>
              <label htmlFor="sim-add-prazo">Prazo (meses)</label>
              <input id="sim-add-prazo" className="inp num" inputMode="numeric"
                value={addPrazo} onChange={(e) => setAddPrazo(e.target.value)} />
              {addTentou && addErroPrazo && <span className="hint">{addErroPrazo}</span>}
            </div>
            <BotaoSec className="sim-add-btn" onClick={adicionarEmprestimos}>Adicionar</BotaoSec>
          </div>

          {linhasEmp.length === 0 ? (
            <EstadoVazio
              titulo="Nenhum contrato na simulação"
              descricao="Use a barra acima: escolha o banco, a quantidade de contratos e a parcela média — as linhas entram no modo média do banco."
            />
          ) : empsCalc.map(({ l, c }) => {
            const banco = bancoDe(l.bancoId);
            const erros: ErrosEmp = c.ok ? {} : c.erros;
            return (
              <div className="sim-linha" key={l.id}>
                <div className="sim-campos">
                  <div className="campo sim-c-banco">
                    <label htmlFor={`se-${l.id}-banco`}>Banco</label>
                    <SelectBanco id={`se-${l.id}-banco`} valor={l.bancoId} aoMudar={(b) => mudarEmp(l.id, { bancoId: b })} />
                  </div>
                  <div className={campoCls('sim-c-valor', erros.parcela)}>
                    <label htmlFor={`se-${l.id}-parcela`}>Parcela (R$)</label>
                    <input id={`se-${l.id}-parcela`} className="inp num" inputMode="decimal" placeholder="0,00"
                      value={l.parcela} onChange={(e) => mudarEmp(l.id, { parcela: e.target.value })} />
                    {erros.parcela && <span className="hint">{erros.parcela}</span>}
                  </div>
                  <div className={campoCls('sim-c-prazo', erros.prazo)}>
                    <label htmlFor={`se-${l.id}-prazo`}>Prazo (meses)</label>
                    <input id={`se-${l.id}-prazo`} className="inp num" inputMode="numeric"
                      value={l.prazo} onChange={(e) => mudarEmp(l.id, { prazo: e.target.value })} />
                    {erros.prazo && <span className="hint">{erros.prazo}</span>}
                  </div>
                  <div className={campoCls('sim-c-pagas', erros.pagas)}>
                    <label htmlFor={`se-${l.id}-pagas`}>Parcelas pagas</label>
                    <input id={`se-${l.id}-pagas`} className="inp num" inputMode="numeric" placeholder="opcional"
                      value={l.pagas} onChange={(e) => mudarEmp(l.id, { pagas: e.target.value })} />
                    {erros.pagas && <span className="hint">{erros.pagas}</span>}
                  </div>
                  <div className="campo sim-modo">
                    <label>Taxa</label>
                    <Segmentado rotulo="Modo de taxa" opcoes={opcoesModo(banco)} valor={l.modo}
                      aoMudar={(m) => mudarEmp(l.id, { modo: m })} />
                  </div>
                  {l.modo === 'exata' && (
                    <div className={campoCls('sim-c-taxa', erros.taxa)}>
                      <label htmlFor={`se-${l.id}-taxa`}>Taxa (% a.m.)</label>
                      <input id={`se-${l.id}-taxa`} className="inp num" inputMode="decimal" placeholder="ex.: 12"
                        value={l.taxaExata} onChange={(e) => mudarEmp(l.id, { taxaExata: e.target.value })} />
                      {erros.taxa && <span className="hint">{erros.taxa}</span>}
                    </div>
                  )}
                  <div className="sim-linha-acoes">
                    <BotaoMini onClick={() => duplicarEmp(l.id)}>Duplicar</BotaoMini>
                    <BotaoMini onClick={() => setLinhasEmp((ls) => ls.filter((x) => x.id !== l.id))}>Remover</BotaoMini>
                  </div>
                </div>
                <div className="sim-res">
                  {!c.ok ? (
                    <span className="pendente">Preencha os campos destacados para calcular.</span>
                  ) : c.dentro ? (
                    <BadgeStatus tom="neutro">taxa dentro da referência — sem indébito</BadgeStatus>
                  ) : (
                    <>
                      <span>Recuperação estimada: <b className="num">{faixa(c.totalMin, c.totalMax)}</b></span>
                      {c.temJa && (
                        <span>· Já descontado indevidamente: <b className="num">{faixa(c.jaMin, c.jaMax)}</b></span>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </CardVidro>

        {/* ---- Bloco 2 — Cartões RMC/RCC ---- */}
        <CardVidro sobe atraso={0.12} className="sim-bloco">
          <CardCab
            titulo="Cartões RMC/RCC"
            contador={linhasCart.length || undefined}
            direita={<BotaoMini onClick={adicionarCartao}>＋ Adicionar cartão</BotaoMini>}
          />
          {linhasCart.length === 0 ? (
            <EstadoVazio
              titulo="Nenhum cartão na simulação"
              descricao="Adicione os cartões RMC/RCC com o valor descontado por mês na folha do benefício."
              acao={{ rotulo: '＋ Adicionar cartão', onClick: adicionarCartao }}
            />
          ) : cartsCalc.map(({ l, c }) => {
            const erros: ErrosCart = c.ok ? {} : c.erros;
            return (
              <div className="sim-linha" key={l.id}>
                <div className="sim-campos">
                  <div className="campo sim-c-tipo">
                    <label htmlFor={`sc-${l.id}-tipo`}>Tipo</label>
                    <select id={`sc-${l.id}-tipo`} className="inp" value={l.tipo}
                      onChange={(e) => mudarCart(l.id, { tipo: e.target.value as LinhaCart['tipo'] })}>
                      <option value="RMC">RMC</option>
                      <option value="RCC">RCC</option>
                    </select>
                  </div>
                  <div className="campo sim-c-banco">
                    <label htmlFor={`sc-${l.id}-banco`}>Banco</label>
                    <SelectBanco id={`sc-${l.id}-banco`} valor={l.bancoId} aoMudar={(b) => mudarCart(l.id, { bancoId: b })} />
                  </div>
                  <div className={campoCls('sim-c-valor', erros.valor)}>
                    <label htmlFor={`sc-${l.id}-valor`}>Valor mensal (R$)</label>
                    <input id={`sc-${l.id}-valor`} className="inp num" inputMode="decimal" placeholder="0,00"
                      value={l.valor} onChange={(e) => mudarCart(l.id, { valor: e.target.value })} />
                    {erros.valor && <span className="hint">{erros.valor}</span>}
                  </div>
                  <CamposMesAno idBase={`sc-${l.id}-ini`} rotulo="Início" mes={l.iniMes} ano={l.iniAno} erro={erros.inicio}
                    aoMudar={({ mes, ano }) => mudarCart(l.id, { ...(mes !== undefined && { iniMes: mes }), ...(ano !== undefined && { iniAno: ano }) })} />
                  <div className="sim-ainda" onClick={() => mudarCart(l.id, { ainda: !l.ainda })}>
                    <Checkbox marcado={l.ainda} aoAlternar={() => mudarCart(l.id, { ainda: !l.ainda })} rotulo="Ainda descontando" />
                    ainda descontando
                  </div>
                  {!l.ainda && (
                    <CamposMesAno idBase={`sc-${l.id}-fim`} rotulo="Fim" mes={l.fimMes} ano={l.fimAno} erro={erros.fim}
                      aoMudar={({ mes, ano }) => mudarCart(l.id, { ...(mes !== undefined && { fimMes: mes }), ...(ano !== undefined && { fimAno: ano }) })} />
                  )}
                  <div className="sim-linha-acoes">
                    <BotaoMini onClick={() => duplicarCart(l.id)}>Duplicar</BotaoMini>
                    <BotaoMini onClick={() => setLinhasCart((ls) => ls.filter((x) => x.id !== l.id))}>Remover</BotaoMini>
                  </div>
                </div>
                <div className="sim-res">
                  {!c.ok ? (
                    <span className="pendente">Preencha os campos destacados para calcular.</span>
                  ) : (
                    <span>
                      {c.meses} meses × R$ {valorBR(c.valor)} = <b className="num">R$ {numeroBR(c.total)}</b>
                      {' '}• em dobro: <b className="num">R$ {numeroBR(c.totalEmDobro)}</b>
                      <span className="pendente"> · desde {mesAnoBR(c.inicio)}</span>
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </CardVidro>

        {/* ---- Bloco 3 — Resultado consolidado (sticky) ---- */}
        <CardVidro sobe atraso={0.18} className="sim-consol">
          <div className="sim-consol-grade">
            <div>
              <div className="caps">Total estimado a recuperar</div>
              <div className="p-display num sim-total-num">{temValor ? faixa(tot.totalMin, tot.totalMax) : '—'}</div>
              <div className="sim-breakdown num">
                {temAlgo
                  ? [
                      nEmpRec > 0 && (Math.round(tot.empMin) === Math.round(tot.empMax)
                        ? `Empréstimos (${nEmpRec}): R$ ${numeroBR(tot.empMax)}`
                        : `Empréstimos (${nEmpRec}): R$ ${numeroBR(tot.empMin)}–${numeroBR(tot.empMax)}`),
                      nCart > 0 && `Cartões (${nCart}): R$ ${numeroBR(tot.cartTotal)} (em dobro: R$ ${numeroBR(tot.cartDobro)})`,
                    ].filter(Boolean).join(' • ') || 'Nenhum valor a recuperar nos itens simulados.'
                  : 'Adicione contratos e cartões acima para montar a estimativa.'}
              </div>
              <div className="sim-notas">
                <div>Valores nominais — não incluem correção monetária e juros, que tendem a aumentar o total.</div>
                <div>Estimativa sujeita à análise dos contratos e decisão judicial.</div>
              </div>
            </div>
            <div className="sim-consol-acoes">
              <div className="campo">
                <label htmlFor="sim-nome">Nome do cliente</label>
                <Input id="sim-nome" placeholder="opcional" value={nome} onChange={(e) => setNome(e.target.value)} />
              </div>
              <BotaoPrimario onClick={() => copiar('cliente')} disabled={!temValor}>
                {rotuloCopia('cliente', 'Copiar mensagem p/ cliente')}
              </BotaoPrimario>
              <BotaoSec onClick={() => copiar('interno')} disabled={!temAlgo}>
                {rotuloCopia('interno', 'Copiar resumo interno')}
              </BotaoSec>
            </div>
          </div>
        </CardVidro>
      </div>
    </>
  );
}
