/* Lição 3 — ilustrações do CONSIGNADO (prefixo mv-csg-): barra da margem,
   simulador de margem, extrato de pagamento clicável, resumo da margem no
   extrato de consignado, árvore "sem margem", portabilidade antes/depois e
   juros razoáveis × abusivos (no empréstimo pessoal). As ilustrações da
   DIFERENÇA consignado × pessoal ficam em 03-consignado-diferenca.tsx.
   Valores e bancos (Banco A, Banco B) são de EXEMPLO. Só tokens no cromo;
   o documento do INSS ilustrado tem paleta própria e leva a tag Ilustração. */
import { useState } from 'react';
import { Figura, IcCheck, Print } from '../pecas';
import './03-consignado.css';

const real = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const real0 = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const menos = (v: number) => `− ${real(v)}`;

export type Tom = 'azul' | 'verde' | 'ambar' | 'rubro';

/* ------------------------------------------------------------ peças de SVG */
/** Pontas de seta (uma por tom) para as linhas de cada desenho. */
export function Setas({ id }: { id: string }) {
  const tons = ['n', 'azul', 'verde', 'ambar', 'rubro'] as const;
  return (
    <defs>
      {tons.map((t) => (
        <marker key={t} id={`${id}-${t}`} viewBox="0 0 10 10" refX="8.6" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path className="mv-csg-pta" data-tom={t} d="M0,1 L9,5 L0,9 z" />
        </marker>
      ))}
    </defs>
  );
}

export type Linha = { t: string; c?: 'k' | 'b' | 's' };
/** Caixa com até 3 linhas centralizadas (k = rótulo pequeno, b = título, s = apoio). */
export function Caixa({ x, y, w, h, tom, linhas, tracejado }: { x: number; y: number; w: number; h: number; tom?: Tom; linhas: Linha[]; tracejado?: boolean }) {
  const alt = (c?: Linha['c']) => (c === 'k' ? 15 : c === 's' ? 16 : 18);
  const total = linhas.reduce((s, l) => s + alt(l.c), 0);
  let topo = y + h / 2 - total / 2;
  return (
    <g>
      <rect className="mv-csg-cx" data-tom={tom} data-tracejado={tracejado ? '' : undefined} x={x} y={y} width={w} height={h} rx={10} />
      {linhas.map((l, i) => {
        const a = alt(l.c);
        topo += a;
        return (
          <text key={i} className={`mv-csg-tx-${l.c ?? 'b'}`} data-tom={tom} x={x + w / 2} y={topo - a * 0.3} textAnchor="middle">{l.t}</text>
        );
      })}
    </g>
  );
}

/* ------------------------------------------------------------ 1. barra da margem */
export function BarraMargem() {
  return (
    <Figura tag="Exemplo" legenda="As gavetas da margem consignável num benefício de exemplo de R$ 2.000. Cada gaveta só aceita o seu tipo de desconto. O empréstimo pessoal não entra nesta barra: ele não usa a margem.">
      <div className="mv-csg-rola">
        <svg className="mv-csg-svg" viewBox="0 0 760 200" role="img"
          aria-label="Barra de um benefício de exemplo de 2 mil reais: 55%, 1.100 reais, fica protegido com o cliente; 35%, 700 reais, é a margem para empréstimos consignados; 5%, 100 reais, para o cartão RMC; 5%, 100 reais, para o cartão RCC. A margem consignável soma 45%, 900 reais.">
          <text className="mv-csg-tit" x={20} y={22}>Benefício de exemplo: R$ 2.000 por mês</text>
          <path className="mv-csg-chave" d="M416,56 V46 H740 V56" />
          <text className="mv-csg-tx-b" x={578} y={36} textAnchor="middle">Margem consignável: 45% = R$ 900</text>

          <rect className="mv-csg-seg" data-tom="neutro" x={20} y={62} width={396} height={58} rx={6} />
          <text className="mv-csg-seg-t" x={218} y={87} textAnchor="middle">55% · R$ 1.100</text>
          <text className="mv-csg-tx-s" x={218} y={106} textAnchor="middle">fica com o cliente</text>

          <rect className="mv-csg-seg" data-tom="azul" x={418} y={62} width={248} height={58} rx={6} />
          <text className="mv-csg-seg-t" x={542} y={87} textAnchor="middle">35% · R$ 700</text>
          <text className="mv-csg-tx-s" x={542} y={106} textAnchor="middle">gaveta dos consignados</text>

          <rect className="mv-csg-seg" data-tom="ambar" x={668} y={62} width={34} height={58} rx={4} />
          <rect className="mv-csg-seg" data-tom="ambar2" x={705} y={62} width={35} height={58} rx={4} />

          <path className="mv-csg-fio" d="M685,122 V154 H681" />
          <text className="mv-csg-tx-s" x={677} y={158} textAnchor="end">Cartão RMC · 5% · R$ 100</text>
          <path className="mv-csg-fio" d="M722,122 V184 H718" />
          <text className="mv-csg-tx-s" x={714} y={188} textAnchor="end">Cartão RCC · 5% · R$ 100</text>

          <text className="mv-csg-tx-s" x={20} y={146}>Parte protegida: não pode ir para consignado.</text>
          <text className="mv-csg-tx-s" x={20} y={164}>É o dinheiro do mês para viver.</text>
        </svg>
      </div>
    </Figura>
  );
}

/* ------------------------------------------------------------ 2. simulador de margem */
export function SimuladorMargem() {
  const [beneficio, setBeneficio] = useState(2000);
  const [parcelas, setParcelas] = useState(450);
  const [rmc, setRmc] = useState(true);
  const [rcc, setRcc] = useState(false);
  const gaveta = Math.round(beneficio * 0.35);
  const cartao = Math.round(beneficio * 0.05);
  const usado = Math.min(parcelas, gaveta);
  const livre = gaveta - usado;
  const pct = (v: number) => `${(v / beneficio) * 100}%`;
  const estado = livre <= 0 ? 'sem' : livre < beneficio * 0.03 ? 'quase' : 'com';

  function mudarBeneficio(v: number) {
    setBeneficio(v);
    setParcelas((p) => Math.min(p, Math.round(v * 0.35)));
  }
  function exemplo(b: number, p: number, r1: boolean, r2: boolean) {
    setBeneficio(b); setParcelas(p); setRmc(r1); setRcc(r2);
  }

  return (
    <div className="vidro mv-csg-sim">
      <div className="mv-csg-sim-ctl">
        <div className="mv-csg-sim-campo">
          <label htmlFor="mv-csg-ben">Valor do benefício <small>(exemplo)</small></label>
          <b className="num">{real0(beneficio)}</b>
          <input id="mv-csg-ben" type="range" min={1000} max={6000} step={100} value={beneficio}
            onChange={(e) => mudarBeneficio(Number(e.target.value))} />
        </div>
        <div className="mv-csg-sim-campo">
          <label htmlFor="mv-csg-parc">Parcelas de consignado que já paga</label>
          <b className="num">{real0(usado)} <small>por mês</small></b>
          <input id="mv-csg-parc" type="range" min={0} max={gaveta} step={5} value={usado}
            onChange={(e) => setParcelas(Number(e.target.value))} />
        </div>
      </div>

      <div className="mv-csg-sim-ops">
        <button type="button" className="mv-csg-tog" aria-pressed={rmc} onClick={() => setRmc(!rmc)}>
          <span className="mv-csg-chk" aria-hidden>{rmc && <IcCheck />}</span>Tem cartão RMC
        </button>
        <button type="button" className="mv-csg-tog" aria-pressed={rcc} onClick={() => setRcc(!rcc)}>
          <span className="mv-csg-chk" aria-hidden>{rcc && <IcCheck />}</span>Tem cartão RCC
        </button>
        <span className="mv-csg-sim-ex">
          Exemplos prontos:
          <button type="button" className="mv-link" onClick={() => exemplo(2000, 700, true, true)}>Dona Lúcia</button>
          <button type="button" className="mv-link" onClick={() => exemplo(3000, 450, false, false)}>Seu Antônio</button>
        </span>
      </div>

      <div className="mv-csg-sim-barra" aria-hidden>
        <i data-seg="prot" style={{ width: '55%' }} />
        <i data-seg="usado" style={{ width: pct(usado) }} />
        <i data-seg="livre" style={{ width: pct(livre) }} />
        <i data-seg="rmc" data-on={rmc ? '' : undefined} style={{ width: '5%' }} />
        <i data-seg="rcc" data-on={rcc ? '' : undefined} style={{ width: '5%' }} />
      </div>
      <ul className="mv-csg-sim-leg">
        <li><i data-seg="prot" />Protegido (55%): <b className="num">{real0(beneficio - gaveta - 2 * cartao)}</b></li>
        <li><i data-seg="usado" />Consignados em uso: <b className="num">{real0(usado)}</b></li>
        <li><i data-seg="livre" />Margem livre: <b className="num">{real0(livre)}</b></li>
        <li><i data-seg="rmc" data-on={rmc ? '' : undefined} />RMC (5%): <b className="num">{real0(cartao)}</b> {rmc ? 'em uso' : 'livre'}</li>
        <li><i data-seg="rcc" data-on={rcc ? '' : undefined} />RCC (5%): <b className="num">{real0(cartao)}</b> {rcc ? 'em uso' : 'livre'}</li>
      </ul>

      <p className="mv-csg-sim-conta num">
        A conta: 35% de {real0(beneficio)} = <b>{real0(gaveta)}</b> · já usados {real0(usado)} · livres <b>{real0(livre)}</b>
      </p>

      <div className="mv-csg-sim-res" data-tom={estado === 'sem' ? 'rubro' : estado === 'quase' ? 'ambar' : 'verde'} role="status">
        {estado === 'sem' && (
          <><b>Sem margem para consignado novo.</b> As parcelas já ocupam a gaveta inteira dos 35% ({real0(gaveta)}). Um
            consignado novo não cabe. É a hora de explicar com calma, apresentar os ganchos (aumento de margem e portabilidade)
            e perguntar se o cliente tem empréstimo pessoal numa das 5 financeiras.</>
        )}
        {estado === 'quase' && (
          <><b>Quase sem margem: sobram {real0(livre)} por mês.</b> Cabe só uma parcela muito pequena. Na prática, a conversa
            costuma ser a mesma de quem está sem margem.</>
        )}
        {estado === 'com' && (
          <><b>Tem margem livre: {real0(livre)} por mês.</b> Em tese, cabe uma parcela nova de consignado de até esse valor.
            Quem decide a liberação é sempre o banco.</>
        )}
        {(!rmc || !rcc) && (
          <small>Gaveta de cartão livre não vira empréstimo: os 5% do RMC e os 5% do RCC só servem para cartão.</small>
        )}
        <small>O empréstimo pessoal não entra nesta conta: ele é cobrado pela financeira, fora do INSS, e não usa a margem.</small>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ 3. extrato de pagamento clicável */
type Chave = 'comp' | 'bruto' | 'emp' | 'rmc' | 'rcc' | 'tot' | 'liq';
const ORDEM: Chave[] = ['comp', 'bruto', 'emp', 'rmc', 'rcc', 'tot', 'liq'];
const EXPLICA: Record<Chave, { titulo: string; texto: string }> = {
  comp: {
    titulo: 'Competência',
    texto: 'É o mês a que aquele pagamento se refere. O extrato que você baixa do Meu INSS traz um bloco como este para cada mês do período.',
  },
  bruto: {
    titulo: 'Valor do benefício (bruto)',
    texto: 'É quanto o benefício vale antes de qualquer desconto. É a partir dele que se entende a margem: 35% para empréstimos consignados, 5% para o cartão RMC e 5% para o cartão RCC.',
  },
  emp: {
    titulo: 'Empréstimos consignados',
    texto: 'Cada consignado aparece numa linha, com o nome do banco e o valor da parcela do mês. Aqui são três: Banco A, Banco B e BMG. Atenção: tudo o que está neste extrato foi descontado pelo INSS, então é consignado. O empréstimo pessoal não aparece como desconto do INSS.',
  },
  rmc: {
    titulo: 'Cartão de crédito consignado (RMC)',
    texto: 'Não é parcela de empréstimo: é o desconto do cartão de crédito consignado, ou seja, a parte da fatura que o INSS desconta todo mês. Usa uma gaveta própria, de 5%.',
  },
  rcc: {
    titulo: 'Cartão consignado de benefício (RCC)',
    texto: 'Outro cartão, com outra gaveta de 5%. Pode acontecer de o cliente nem lembrar que tem esse cartão. Por isso, leia o extrato linha por linha, sem pular nada.',
  },
  tot: {
    titulo: 'Total de descontos',
    texto: 'A soma de todos os descontos do mês: R$ 900, exatamente 45% do benefício. Neste exemplo, toda a margem está ocupada.',
  },
  liq: {
    titulo: 'Valor líquido',
    texto: 'O que de fato caiu na conta: R$ 1.100. É com esse dinheiro que a Dona Lúcia paga comida, remédio e as contas do mês. Se ela tiver um empréstimo pessoal cobrado em débito automático, a parcela sai depois, desta conta, e não como desconto do INSS.',
  },
};
type LinhaExt = { chave: Chave; rotulo: string; valor: string; tipo: 'info' | 'cred' | 'desc' | 'tot' | 'liq' };
const LINHAS: LinhaExt[] = [
  { chave: 'comp', rotulo: 'Competência', valor: '09/2026', tipo: 'info' },
  { chave: 'bruto', rotulo: 'Valor do benefício (bruto)', valor: real(2000), tipo: 'cred' },
  { chave: 'emp', rotulo: 'Empréstimo consignado · Banco A', valor: menos(310), tipo: 'desc' },
  { chave: 'emp', rotulo: 'Empréstimo consignado · Banco B', valor: menos(240), tipo: 'desc' },
  { chave: 'emp', rotulo: 'Empréstimo consignado · BMG', valor: menos(150), tipo: 'desc' },
  { chave: 'rmc', rotulo: 'Cartão de crédito consignado (RMC) · BMG', valor: menos(100), tipo: 'desc' },
  { chave: 'rcc', rotulo: 'Cartão consignado de benefício (RCC) · Banco A', valor: menos(100), tipo: 'desc' },
  { chave: 'tot', rotulo: 'Total de descontos', valor: menos(900), tipo: 'tot' },
  { chave: 'liq', rotulo: 'Valor líquido (creditado na conta)', valor: real(1100), tipo: 'liq' },
];

export function ExtratoInterativo() {
  const [sel, setSel] = useState<Chave>('comp');
  const [soma, setSoma] = useState(false);
  const i = ORDEM.indexOf(sel);
  const ex = EXPLICA[sel];
  return (
    <figure className="mv-fig">
      <div className="mv-csg-ext">
        <div className="mv-csg-papel">
          <div className="mv-csg-papel-cab">
            <b>Extrato de Pagamento de Benefício</b>
            <span>Histórico de Créditos · documento ilustrado</span>
          </div>
          <div className="mv-csg-papel-id">
            <div><small>Beneficiária</small><span>Lúcia (exemplo)</span></div>
            <div><small>Benefício</small><span>Aposentadoria</span></div>
          </div>
          <div className="mv-csg-papel-tab">
            <div className="mv-csg-papel-th" aria-hidden><span>Descrição</span><span>Valor</span></div>
            {LINHAS.map((l, k) => {
              const primeira = LINHAS.findIndex((x) => x.chave === l.chave) === k;
              return (
                <button key={l.rotulo} type="button" className="mv-csg-lin" data-tipo={l.tipo}
                  data-sel={sel === l.chave ? '' : undefined} data-soma={soma && l.chave === 'emp' ? '' : undefined}
                  aria-pressed={sel === l.chave} onClick={() => setSel(l.chave)}>
                  <i className="mv-csg-marca" data-vazia={primeira ? undefined : ''} aria-hidden>{ORDEM.indexOf(l.chave) + 1}</i>
                  <span>{l.rotulo}</span>
                  <b>{l.valor}</b>
                </button>
              );
            })}
          </div>
        </div>

        <div className="vidro mv-csg-ext-painel" aria-live="polite">
          <span className="mv-csg-ext-de num">Parte {i + 1} de {ORDEM.length} · clique nas linhas do extrato</span>
          <div className="mv-csg-ext-cab"><span className="mv-csg-ext-n num">{i + 1}</span><b>{ex.titulo}</b></div>
          <p>{ex.texto}</p>
          <div className="mv-csg-ext-nav">
            <button type="button" className="mv-csg-bt" disabled={i === 0} onClick={() => setSel(ORDEM[i - 1])}>Anterior</button>
            <button type="button" className="mv-csg-bt" disabled={i === ORDEM.length - 1} onClick={() => setSel(ORDEM[i + 1])}>Próximo</button>
          </div>
          <button type="button" className="mv-csg-bt" aria-pressed={soma} onClick={() => setSoma(!soma)}>
            {soma ? 'Esconder a soma' : 'Somar só os empréstimos'}
          </button>
          {soma && (
            <div className="mv-csg-soma num">
              R$ 310 + R$ 240 + R$ 150 = <b>R$ 700</b>, exatamente 35% de R$ 2.000. A gaveta dos consignados está
              cheia: a Dona Lúcia está <b>sem margem</b> para um consignado novo.
            </div>
          )}
        </div>
      </div>
      <figcaption>
        <span className="mv-tag">Ilustração</span>
        Exemplo fictício para treino (Banco A e Banco B são genéricos). No documento real, os nomes das linhas podem vir abreviados e com códigos.
      </figcaption>
    </figure>
  );
}

/* ------------------------------------------------------------ 4. resumo da margem (extrato de consignado) */
export function PrintMargem() {
  const contratos = [
    { b: 'Banco A', t: 'Empréstimo', v: 310 },
    { b: 'Banco B', t: 'Empréstimo', v: 240 },
    { b: 'BMG', t: 'Empréstimo', v: 150 },
    { b: 'BMG', t: 'Cartão (RMC)', v: 100 },
    { b: 'Banco A', t: 'Cartão (RCC)', v: 100 },
  ];
  return (
    <Print endereco="meu.inss.gov.br › extrato de empréstimo consignado"
      legenda="Versão simplificada para treino. No documento real a arrumação e os nomes mudam: procure a parte da margem e a lista de contratos consignados.">
      <div className="mvp-app">
        <div className="mvp-topo"><b>Extrato de Empréstimo Consignado</b><span>Lúcia (exemplo)</span></div>
        <div className="mv-csg-mg">
          <span className="mv-csg-mg-tit">Margem</span>
          <div className="mv-csg-mg-rola">
            <table>
              <thead>
                <tr><th scope="col"><span className="mv-csg-oculto">Item</span></th><th scope="col">Empréstimos</th><th scope="col">Cartão RMC</th><th scope="col">Cartão RCC</th></tr>
              </thead>
              <tbody>
                <tr><th scope="row">Máximo permitido</th><td>{real(700)}</td><td>{real(100)}</td><td>{real(100)}</td></tr>
                <tr><th scope="row">Já comprometido</th><td>{real(700)}</td><td>{real(100)}</td><td>{real(100)}</td></tr>
                <tr data-alvo=""><th scope="row">Margem disponível</th><td>{real(0)}</td><td>{real(0)}</td><td>{real(0)}</td></tr>
              </tbody>
            </table>
          </div>
          <span className="mv-csg-mg-tit">Contratos ativos</span>
          <div className="mv-csg-mg-lista">
            {contratos.map((c) => (
              <div key={c.b + c.t}><span>{c.b}</span><span>{c.t}</span><b>{real(c.v)}</b></div>
            ))}
          </div>
        </div>
      </div>
    </Print>
  );
}

/* ------------------------------------------------------------ 5. árvore do cliente sem margem */
export function ArvoreSemMargem() {
  const s = 'mv-csg-s7';
  return (
    <Figura tag="Diagrama" legenda="O caminho da conversa no canal de empréstimo: primeiro o consignado (margem e ganchos), depois o empréstimo pessoal (a revisão). Tudo como possibilidade, nunca como promessa.">
      <div className="mv-csg-rola">
        <svg className="mv-csg-svg" viewBox="0 0 760 524" role="img"
          aria-label="Árvore de decisão. O cliente do canal de empréstimo quer um consignado novo. Tem margem livre, conferindo no extrato de consignado? Se sim, combine com o gestor o próximo passo; a revisão do empréstimo pessoal também pode valer. Se não, explique com calma que a gaveta dos 35% está cheia e apresente os ganchos, como possibilidade: aumento de margem e portabilidade dos consignados. Depois: tem empréstimo pessoal numa das 5 financeiras? Se o cliente não sabe, explique a diferença e pergunte de novo uma vez; se seguir sem saber, siga em frente. Se sim, apresente a revisão dos juros do empréstimo pessoal: o ressarcimento do que foi descontado nos últimos 10 anos. Se não, o cliente não é elegível ao processo: agradeça e encerre sem insistir.">
          <Setas id={s} />
          <Caixa x={130} y={14} w={340} h={48} linhas={[{ t: 'Cliente do canal de empréstimo' }, { t: 'quer um consignado novo', c: 's' }]} />
          <path className="mv-csg-fio" d="M300,62 V77" markerEnd={`url(#${s}-n)`} />

          <polygon className="mv-csg-cx" data-tom="azul" points="300,80 430,122 300,164 170,122" />
          <text className="mv-csg-tx-b" x={300} y={120} textAnchor="middle">Tem margem livre?</text>
          <text className="mv-csg-tx-s" x={300} y={137} textAnchor="middle">(extrato de consignado)</text>

          <path className="mv-csg-fio" d="M430,122 H517" markerEnd={`url(#${s}-n)`} />
          <text className="mv-csg-t2" x={474} y={114} textAnchor="middle">Sim</text>
          <Caixa x={520} y={96} w={220} h={52} tom="azul" linhas={[{ t: 'Combine com o gestor' }, { t: 'o próximo passo', c: 's' }]} />

          <path className="mv-csg-fio" d="M300,164 V187" markerEnd={`url(#${s}-n)`} />
          <text className="mv-csg-t2" x={310} y={180}>Não</text>
          <Caixa x={100} y={190} w={400} h={48} linhas={[{ t: 'Explique com calma: a gaveta dos 35% está cheia' }, { t: 'use o exemplo das gavetas e mostre o extrato', c: 's' }]} />
          <path className="mv-csg-fio" d="M300,238 V253" markerEnd={`url(#${s}-n)`} />
          <Caixa x={100} y={256} w={400} h={50} tom="azul" linhas={[{ t: 'Apresente os ganchos, como possibilidade' }, { t: 'aumento de margem · portabilidade dos consignados', c: 's' }]} />
          <path className="mv-csg-fio" d="M300,306 V323" markerEnd={`url(#${s}-n)`} />

          {/* com margem, a revisão do pessoal também pode valer */}
          <path className="mv-csg-fio" d="M630,148 V316 H300" />
          <circle className="mv-csg-ponto" cx={300} cy={316} r={3.5} />
          <text className="mv-csg-t3" x={640} y={214}>a revisão do</text>
          <text className="mv-csg-t3" x={640} y={230}>pessoal também</text>
          <text className="mv-csg-t3" x={640} y={246}>pode valer</text>

          <polygon className="mv-csg-cx" data-tom="ambar" points="300,326 440,372 300,418 160,372" />
          <text className="mv-csg-tx-b" x={300} y={367} textAnchor="middle">Tem empréstimo pessoal</text>
          <text className="mv-csg-tx-b" x={300} y={384} textAnchor="middle">numa das 5 financeiras?</text>
          <rect className="mv-csg-cx" data-tracejado="" x={6} y={330} width={146} height={84} rx={8} />
          <path className="mv-csg-fio" d="M152,372 H160" />
          <text className="mv-csg-t3" x={14} y={346}>Não sabe? Explique</text>
          <text className="mv-csg-t3" x={14} y={361}>a diferença e</text>
          <text className="mv-csg-t3" x={14} y={376}>pergunte de novo</text>
          <text className="mv-csg-t3" x={14} y={391}>uma vez. Se seguir</text>
          <text className="mv-csg-t3" x={14} y={406}>sem saber, siga.</text>

          <path className="mv-csg-fio" d="M440,372 H517" markerEnd={`url(#${s}-n)`} />
          <text className="mv-csg-t2" x={478} y={364} textAnchor="middle">Não</text>
          <Caixa x={520} y={346} w={220} h={52} tom="rubro" linhas={[{ t: 'Não elegível ao processo' }, { t: 'agradeça e encerre sem insistir', c: 's' }]} />

          <path className="mv-csg-fio" d="M300,418 V439" markerEnd={`url(#${s}-n)`} />
          <text className="mv-csg-t2" x={310} y={433}>Sim</text>
          <Caixa x={100} y={442} w={400} h={50} tom="verde" linhas={[{ t: 'Apresente a revisão dos juros do pessoal' }, { t: 'ressarcimento do que foi descontado nos últimos 10 anos', c: 's' }]} />

          <text className="mv-csg-t2" x={380} y={514} textAnchor="middle">Em todos os caminhos: nada de promessa de valor ou de resultado.</text>
        </svg>
      </div>
    </Figura>
  );
}

/* ------------------------------------------------------------ 6. portabilidade: antes e depois */
export function PortabilidadeAntesDepois() {
  const s = 'mv-csg-s8';
  return (
    <Figura tag="Exemplo" legenda="Portabilidade de um consignado em três tempos. Banco A e Banco B são genéricos; a parcela é só um exemplo.">
      <div className="mv-csg-rola">
        <svg className="mv-csg-svg" viewBox="0 0 760 290" role="img"
          aria-label="Portabilidade de um consignado. Antes: o contrato consignado está no Banco A, com parcela de exemplo de 310 reais e um saldo devedor, ocupando espaço na margem. A troca: o Banco B paga ao Banco A o saldo devedor, e o cliente não tira dinheiro do bolso. Depois: o contrato novo fica no Banco B, com a nova parcela no mesmo espaço da margem, e pode haver um troco liberado ao cliente, que só a análise confirma.">
          <Setas id={s} />
          <text className="mv-csg-tx-k" x={115} y={20} textAnchor="middle">1 · ANTES</text>
          <text className="mv-csg-tx-k" x={380} y={20} textAnchor="middle">2 · A TROCA</text>
          <text className="mv-csg-tx-k" x={645} y={20} textAnchor="middle">3 · DEPOIS</text>

          {/* antes */}
          <rect className="mv-csg-cx" x={10} y={32} width={210} height={180} rx={12} />
          <text className="mv-csg-tx-b" x={115} y={57} textAnchor="middle">Banco A</text>
          <line className="mv-csg-div" x1={26} x2={204} y1={70} y2={70} />
          <text className="mv-csg-tx-s" x={115} y={93} textAnchor="middle">Contrato consignado</text>
          <text className="mv-csg-tx-b" x={115} y={118} textAnchor="middle">Parcela: R$ 310 por mês</text>
          <text className="mv-csg-tx-s" x={115} y={140} textAnchor="middle">Saldo devedor: o que falta</text>
          <Caixa x={24} y={156} w={182} h={40} tom="azul" linhas={[{ t: 'ocupa espaço na margem', c: 's' }]} />

          <path className="mv-csg-fio" d="M224,122 H284" markerEnd={`url(#${s}-n)`} />

          {/* a troca */}
          <Caixa x={290} y={36} w={180} h={50} tom="verde" linhas={[{ t: 'Banco B' }, { t: 'o banco novo', c: 's' }]} />
          <path className="mv-csg-fio" data-tom="verde" d="M380,86 V147" markerEnd={`url(#${s}-verde)`} />
          <text className="mv-csg-t2" x={390} y={112}>paga o saldo</text>
          <text className="mv-csg-t2" x={390} y={128}>devedor</text>
          <Caixa x={290} y={150} w={180} h={50} linhas={[{ t: 'Banco A' }, { t: 'contrato quitado', c: 's' }]} />
          <text className="mv-csg-tx-s" x={380} y={226} textAnchor="middle">O cliente não tira dinheiro</text>
          <text className="mv-csg-tx-s" x={380} y={242} textAnchor="middle">do bolso para a troca</text>

          <path className="mv-csg-fio" d="M476,122 H535" markerEnd={`url(#${s}-n)`} />

          {/* depois */}
          <rect className="mv-csg-cx" data-tom="verde" x={540} y={32} width={210} height={180} rx={12} />
          <text className="mv-csg-tx-b" x={645} y={57} textAnchor="middle">Banco B</text>
          <line className="mv-csg-div" x1={556} x2={734} y1={70} y2={70} />
          <text className="mv-csg-tx-s" x={645} y={93} textAnchor="middle">Contrato consignado novo</text>
          <text className="mv-csg-tx-b" x={645} y={116} textAnchor="middle">Nova parcela</text>
          <text className="mv-csg-tx-s" x={645} y={134} textAnchor="middle">no mesmo espaço da margem</text>
          <Caixa x={560} y={148} w={170} h={50} tom="verde" tracejado linhas={[{ t: 'Possível troco' }, { t: 'só a análise confirma', c: 's' }]} />

          <text className="mv-csg-t3" x={380} y={278} textAnchor="middle">Valores de exemplo. Se existe troco, e de quanto, depende sempre da análise.</text>
        </svg>
      </div>
    </Figura>
  );
}

/* ------------------------------------------------------------ 7. juros razoáveis × abusivos (empréstimo pessoal) */
export function JurosRazoavelAbusivo() {
  return (
    <Figura tag="Ideia simplificada" legenda="A ideia geral, sem números, num empréstimo pessoal: o desenho não representa nenhum caso real.">
      <div className="mv-csg-rola">
        <svg className="mv-csg-svg" viewBox="0 0 760 240" role="img"
          aria-label="Duas barras. Empréstimo pessoal com juros razoáveis: valor emprestado mais juros. Empréstimo pessoal com juros abusivos: valor emprestado, mais juros razoáveis, mais uma parte grande cobrada a mais. Essa parte que passou muito do razoável é o que pesa a mais no orçamento do cliente, todo mês.">
          <text className="mv-csg-tx-b" x={20} y={30}>Empréstimo pessoal com juros razoáveis</text>
          <rect className="mv-csg-seg" data-tom="neutro" x={20} y={42} width={280} height={40} rx={6} />
          <text className="mv-csg-seg-t" x={160} y={67} textAnchor="middle">Valor emprestado</text>
          <rect className="mv-csg-seg" data-tom="azul" x={302} y={42} width={150} height={40} rx={6} />
          <text className="mv-csg-seg-t" x={377} y={67} textAnchor="middle">Juros</text>

          <text className="mv-csg-tx-b" x={20} y={118}>Empréstimo pessoal com juros abusivos</text>
          <rect className="mv-csg-seg" data-tom="neutro" x={20} y={130} width={280} height={40} rx={6} />
          <text className="mv-csg-seg-t" x={160} y={155} textAnchor="middle">Valor emprestado</text>
          <rect className="mv-csg-seg" data-tom="azul" x={302} y={130} width={150} height={40} rx={6} />
          <text className="mv-csg-seg-t" x={377} y={155} textAnchor="middle">Juros razoáveis</text>
          <rect className="mv-csg-seg" data-tom="rubro" x={454} y={130} width={266} height={40} rx={6} />
          <text className="mv-csg-seg-t" x={587} y={155} textAnchor="middle">Cobrado a mais</text>

          <line className="mv-csg-div" x1={453} x2={453} y1={36} y2={176} />
          <text className="mv-csg-t2" x={464} y={67}>até aqui, o razoável</text>
          <path className="mv-csg-chave" data-tom="rubro" d="M454,180 V188 H720 V180" />
          <text className="mv-csg-tx-b mv-csg-cor" data-tom="rubro" x={587} y={208} textAnchor="middle">A parte que passou muito do razoável</text>
          <text className="mv-csg-tx-s" x={587} y={226} textAnchor="middle">é o que pesa a mais no orçamento, todo mês</text>
        </svg>
      </div>
    </Figura>
  );
}
