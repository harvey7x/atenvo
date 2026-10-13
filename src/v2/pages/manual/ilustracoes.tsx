/* Ilustrações e ferramentas interativas compartilhadas do Manual de vendas:
   mapa mental da venda, "prints" ilustrados (Meu INSS, Meu Imposto de Renda,
   níveis do gov.br), calculadora de honorários e calculadora de períodos. */
import { useMemo, useState } from 'react';
import { copiar, IcCheck, IcX, Print } from './pecas';
import { MESES, MESES_CURTOS, mmaaaa, periodosDoExtrato, type MesAno, type Periodo } from './periodos';

export function hojeMesAno(): MesAno {
  const d = new Date();
  return { mes: d.getMonth() + 1, ano: d.getFullYear() };
}
const fmtMes = (m: MesAno) => `${MESES_CURTOS[m.mes - 1]}/${m.ano}`;
const real = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

/* ------------------------------------------------------------ mapa mental */
type Ramo = { t: string; folhas: string[]; tom: string; lado: 'e' | 'd'; y: number };
const RAMOS: Ramo[] = [
  { t: 'Perfil', tom: 'verde', lado: 'e', y: 80, folhas: ['Qualquer benefício do INSS', 'Ou um familiar que recebe', 'Empréstimo nas 5 financeiras'] },
  { t: 'Canal', tom: 'azul', lado: 'e', y: 230, folhas: ['Juros abusivos → direto', 'Empréstimo → ganchos', 'Top 3: Agibank, Mercantil, BMG'] },
  { t: 'Objeções', tom: 'rubro', lado: 'e', y: 380, folhas: ['"É golpe?"', '"Não tenho dinheiro"', '"Só quero empréstimo"'] },
  { t: 'Ganchos', tom: 'ambar', lado: 'd', y: 80, folhas: ['Aumento de margem', 'Portabilidade (+R$ 1.500)', 'Ressarcimento de 10 anos'] },
  { t: 'Documentos', tom: 'azul', lado: 'd', y: 230, folhas: ['Meu INSS (3 documentos)', 'gov.br: IR + CPF', 'Pessoais + e-mail'] },
  { t: 'Fechamento', tom: 'verde', lado: 'd', y: 380, folhas: ['Cadastro no admin', 'Procurações', 'Assinatura prata ou ouro'] },
];
export function MapaMental() {
  const cx = 480, cy = 230, FW = 102; // FW = meia largura da folha
  return (
    <figure className="vidro mv-mapa">
      <svg viewBox="0 0 960 460" role="img" aria-label="Mapa mental da venda do processo">
        {RAMOS.map((r) => {
          const bx = r.lado === 'e' ? 322 : 638;
          const fx = r.lado === 'e' ? 120 : 840;
          return (
            <g key={r.t} className="mv-mapa-ramo" data-tom={r.tom}>
              <path className="mv-mapa-fio" d={`M${cx + (r.lado === 'e' ? -85 : 85)},${cy} C${(cx + bx) / 2},${cy} ${(cx + bx) / 2},${r.y} ${bx + (r.lado === 'e' ? 48 : -48)},${r.y}`} />
              {r.folhas.map((f, i) => {
                const fy = r.y + (i - 1) * 36;
                return (
                  <g key={f}>
                    <path className="mv-mapa-fio fino" d={`M${bx + (r.lado === 'e' ? -48 : 48)},${r.y} C${(bx + fx) / 2},${r.y} ${(bx + fx) / 2},${fy} ${fx + (r.lado === 'e' ? FW : -FW)},${fy}`} />
                    <rect className="mv-mapa-folha" x={fx - FW} y={fy - 14} width={FW * 2} height="28" rx="7" />
                    <text className="mv-mapa-ft" x={fx} y={fy + 4} textAnchor="middle">{f}</text>
                  </g>
                );
              })}
              <rect className="mv-mapa-no" x={bx - 48} y={r.y - 17} width="96" height="34" rx="9" />
              <text className="mv-mapa-nt" x={bx} y={r.y + 5} textAnchor="middle">{r.t}</text>
            </g>
          );
        })}
        <rect className="mv-mapa-centro" x={cx - 85} y={cy - 30} width="170" height="60" rx="14" />
        <text className="mv-mapa-ct" x={cx} y={cy - 3} textAnchor="middle">Venda do</text>
        <text className="mv-mapa-ct" x={cx} y={cy + 16} textAnchor="middle">processo</text>
      </svg>
    </figure>
  );
}

/* ------------------------------------------------------------ honorários */
export function CalculadoraHonorarios() {
  const [valor, setValor] = useState(10000);
  const adv = Math.round(valor * 0.3);
  return (
    <div className="vidro mv-calc">
      <div className="mv-calc-cab">
        <label htmlFor="mv-hon">Se o cliente receber</label>
        <div className="mv-calc-in">
          <span>R$</span>
          <input id="mv-hon" type="number" inputMode="numeric" min={0} step={500} value={valor}
            onChange={(e) => setValor(Math.max(0, Number(e.target.value) || 0))} />
        </div>
      </div>
      <input className="mv-calc-faixa" type="range" min={1000} max={60000} step={500} value={Math.min(Math.max(valor, 1000), 60000)}
        onChange={(e) => setValor(Number(e.target.value))} aria-label="Valor do ressarcimento" />
      <div className="mv-calc-barra" aria-hidden><i style={{ width: '70%' }} /><i style={{ width: '30%' }} /></div>
      <div className="mv-calc-res">
        <div><small>Fica com o cliente (70%)</small><b className="num">{real(valor - adv)}</b></div>
        <div><small>Honorários do advogado (30%)</small><b className="num">{real(adv)}</b></div>
      </div>
      <p className="mv-calc-nota">Nada é pago antes. Os 30% saem do valor que o cliente receber, no final do processo.</p>
    </div>
  );
}

/* ------------------------------------------------------------ Meu INSS */
export function PrintMeuInss() {
  const servicos = [
    { t: 'Carta de Concessão', alvo: true },
    { t: 'Extrato de Empréstimo Consignado', alvo: true, sub: 'também aparece como Histórico de Empréstimo Consignado' },
    { t: 'Extrato de Pagamento de Benefício', alvo: true, sub: 'também aparece como Histórico de Créditos' },
    { t: 'Agendamentos' }, { t: 'Declaração de Imposto de Renda' }, { t: 'Consultar Pedidos' },
  ];
  return (
    <Print endereco="meu.inss.gov.br" legenda="Na tela inicial do Meu INSS, busque os três serviços marcados. A aparência real pode mudar.">
      <div className="mvp-app">
        <div className="mvp-topo"><b>Meu INSS</b><span>Olá!</span></div>
        <div className="mvp-busca">Do que você precisa?</div>
        <div className="mvp-grade">
          {servicos.map((s) => (
            <div key={s.t} className="mvp-serv" data-alvo={s.alvo ? '' : undefined}>
              <i aria-hidden />
              <span>{s.t}</span>
              {s.sub && <small>{s.sub}</small>}
            </div>
          ))}
        </div>
      </div>
    </Print>
  );
}

export function PrintExtrato({ p }: { p: Periodo }) {
  return (
    <Print endereco="meu.inss.gov.br › extrato de pagamento" legenda="Preencha o início e o fim do período e baixe o PDF. Repita para cada ano.">
      <div className="mvp-app">
        <div className="mvp-topo"><b>Extrato de Pagamento de Benefício · Histórico de Créditos</b></div>
        <div className="mvp-form">
          <div className="mvp-campo"><small>Início do período</small><span className="num">{mmaaaa(p.inicio)}</span></div>
          <div className="mvp-campo"><small>Fim do período</small><span className="num">{mmaaaa(p.fim)}</span></div>
          <div className="mvp-btn">Consultar</div>
        </div>
      </div>
    </Print>
  );
}

/* ------------------------------------------------------------ calculadora de períodos */
export function CalculadoraPeriodos() {
  const [ref, setRef] = useState<MesAno>(hojeMesAno);
  const [feitos, setFeitos] = useState<Set<number>>(() => new Set());
  const [copiou, setCopiou] = useState<number | null>(null);
  const [sel, setSel] = useState(0); // período mostrado no "print" ao lado
  const periodos = useMemo(() => periodosDoExtrato(ref), [ref]);
  const anoAtual = hojeMesAno().ano;
  const anos = Array.from({ length: 4 }, (_, i) => anoAtual - 1 + i);

  function alternar(i: number) {
    setFeitos((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  }
  async function aoCopiar(i: number, p: Periodo) {
    if (await copiar(`${mmaaaa(p.inicio)} a ${mmaaaa(p.fim)}`)) { setCopiou(i); window.setTimeout(() => setCopiou(null), 1400); }
  }

  return (
    <div className="mv-per">
      <div className="vidro mv-per-cfg">
        <div className="mv-per-ref">
          <span>Mês em que estamos</span>
          <div className="mv-per-sel">
            <select aria-label="Mês" value={ref.mes} onChange={(e) => { setRef({ ...ref, mes: Number(e.target.value) }); setFeitos(new Set()); setSel(0); }}>
              {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
            <select aria-label="Ano" value={ref.ano} onChange={(e) => { setRef({ ...ref, ano: Number(e.target.value) }); setFeitos(new Set()); setSel(0); }}>
              {anos.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        </div>
        <div className="mv-per-regra">
          <div><small>Início</small><b>{MESES[periodos[0].inicio.mes - 1]} de {periodos[0].inicio.ano}</b><span>mês seguinte, do ano passado</span></div>
          <div><small>Fim</small><b>{MESES[periodos[0].fim.mes - 1]} de {periodos[0].fim.ano}</b><span>mês atual, do ano atual</span></div>
        </div>
        <div className="mv-per-prog">
          <span className="num">{feitos.size} de 10 baixados</span>
          <div aria-hidden><i style={{ width: `${feitos.size * 10}%` }} /></div>
        </div>
      </div>

      <div className="mv-per-corpo">
        <ol className="vidro mv-per-lista" aria-label="Os 10 períodos para baixar">
          {periodos.map((p, i) => (
            <li key={i} data-feito={feitos.has(i) ? '' : undefined} data-sel={sel === i ? '' : undefined}>
              <button type="button" className="mv-per-chk" onClick={() => alternar(i)} aria-pressed={feitos.has(i)}
                aria-label={`Marcar ano ${i + 1} como baixado`}>{feitos.has(i) && <IcCheck />}</button>
              <span className="mv-per-ano">Ano {i + 1}</span>
              <button type="button" className="mv-per-int num" onClick={() => setSel(i)} title={`${fmtMes(p.inicio)} – ${fmtMes(p.fim)}: ver no exemplo da tela`}>
                {mmaaaa(p.inicio)} <em>a</em> {mmaaaa(p.fim)}
              </button>
              <button type="button" className="mv-per-cp" onClick={() => aoCopiar(i, p)}>{copiou === i ? 'Copiado' : 'Copiar'}</button>
            </li>
          ))}
        </ol>
        <PrintExtrato p={periodos[sel]} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ Meu Imposto de Renda */
export function PrintMeuIR() {
  const ano = hojeMesAno().ano;
  const linhas = [
    { ex: ano, st: 'Processada', tem: true },
    { ex: ano - 1, st: 'Processada', tem: true },
    { ex: ano - 2, st: 'Sem declaração', tem: false },
  ];
  return (
    <Print endereco="gov.br › Meu Imposto de Renda" legenda="Entre em cada um dos últimos 3 anos e tire um print. Onde houver declaração, baixe a DEC e o REC.">
      <div className="mvp-app">
        <div className="mvp-topo"><b>Meu Imposto de Renda</b><span>Declarações</span></div>
        <div className="mvp-ir">
          {linhas.map((l) => (
            <div key={l.ex} className="mvp-ir-lin">
              <div><b className="num">Exercício {l.ex}</b><small>{l.st}</small></div>
              {l.tem
                ? <div className="mvp-ir-bts"><span data-alvo="">Declaração (DEC)</span><span data-alvo="">Recibo (REC)</span></div>
                : <div className="mvp-ir-bts"><span data-mudo="">Print desta tela</span></div>}
            </div>
          ))}
        </div>
      </div>
    </Print>
  );
}

/* ------------------------------------------------------------ níveis gov.br */
export function NiveisGov() {
  const niveis = [
    { n: 'Bronze', ok: false, d: 'Não assina. Precisa subir de nível antes.', como: 'Conta criada só com CPF e dados básicos.' },
    { n: 'Prata', ok: true, d: 'Assina.', como: 'No app gov.br, validar com a conta de um banco (login do banco).' },
    { n: 'Ouro', ok: true, d: 'Assina.', como: 'No app gov.br, fazer o reconhecimento facial.' },
  ];
  return (
    <div className="mv-niveis">
      {niveis.map((v) => (
        <div key={v.n} className="vidro mv-nivel" data-nivel={v.n.toLowerCase()}>
          <span className="mv-nivel-selo" aria-hidden />
          <b>{v.n}</b>
          <span className="mv-nivel-st" data-ok={v.ok ? '' : undefined}>{v.ok ? <IcCheck /> : <IcX />}{v.d}</span>
          <small>{v.como}</small>
        </div>
      ))}
    </div>
  );
}
