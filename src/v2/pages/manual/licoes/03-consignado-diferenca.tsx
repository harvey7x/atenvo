/* Lição 3 — ilustrações da DIFERENÇA consignado × empréstimo pessoal (prefixo
   mv-csg-): o caminho do dinheiro, onde cada um aparece, por que quem está sem
   margem acaba no pessoal, teto × juros livres, os dois canais e o mapa final.
   Código de cor: consignado = azul, empréstimo pessoal = âmbar, problema =
   rubro, processo da CAF = verde. Sem números de juros; valores são EXEMPLO. */
import { Figura } from '../pecas';
import { Caixa, Setas } from './03-consignado-visuais';
import './03-consignado.css';

/* ------------------------------------------------------------ 1. o caminho do dinheiro */
export function CaminhoDoDinheiro() {
  const s = 'mv-csg-d1';
  return (
    <Figura tag="Diagrama" legenda="O caminho do dinheiro em cada empréstimo. No consignado, o INSS tira a parcela antes; no pessoal, o benefício cai inteiro e a financeira cobra depois.">
      <div className="mv-csg-rola">
        <svg className="mv-csg-svg" viewBox="0 0 760 362" role="img"
          aria-label="Comparação. Empréstimo consignado: o INSS desconta a parcela antes e manda direto ao banco ou financeira; só o que sobra cai na conta do cliente. Empréstimo pessoal: o INSS paga o benefício inteiro na conta do cliente; depois a financeira cobra a parcela, por débito na conta ou por boleto ou carnê. Nenhuma parte do empréstimo pessoal passa pelo INSS.">
          <Setas id={s} />
          {/* faixa 1: consignado */}
          <text className="mv-csg-tit mv-csg-cor" data-tom="azul" x={20} y={24}>Empréstimo consignado</text>
          <text className="mv-csg-t2" x={200} y={24}>o INSS desconta a parcela antes de o dinheiro cair na conta</text>
          <Caixa x={20} y={78} w={150} h={56} linhas={[{ t: 'INSS' }, { t: 'paga o benefício', c: 's' }]} />
          <path className="mv-csg-fio" d="M170,106 H300" />
          <circle className="mv-csg-ponto" cx={300} cy={106} r={5} />
          <text className="mv-csg-t3" x={235} y={128} textAnchor="middle">desconto automático</text>
          <path className="mv-csg-fio" data-tom="azul" d="M300,106 C410,106 420,70 556,70" markerEnd={`url(#${s}-azul)`} />
          <path className="mv-csg-fio" data-tom="verde" d="M300,106 C410,106 420,142 556,142" markerEnd={`url(#${s}-verde)`} />
          <text className="mv-csg-t2" x={330} y={60}>1º o INSS manda a parcela</text>
          <text className="mv-csg-t2" x={330} y={164}>2º só o resto cai na conta</text>
          <Caixa x={560} y={44} w={180} h={52} tom="azul" linhas={[{ t: 'Banco ou financeira' }, { t: 'recebe a parcela direto', c: 's' }]} />
          <Caixa x={560} y={116} w={180} h={52} tom="verde" linhas={[{ t: 'Conta do cliente' }, { t: 'recebe só o que sobra', c: 's' }]} />

          <line className="mv-csg-div" x1={20} x2={740} y1={190} y2={190} />

          {/* faixa 2: empréstimo pessoal */}
          <text className="mv-csg-tit mv-csg-cor" data-tom="ambar" x={20} y={220}>Empréstimo pessoal</text>
          <text className="mv-csg-t2" x={178} y={220}>o benefício cai inteiro e a financeira cobra depois, fora do INSS</text>
          <Caixa x={20} y={246} w={150} h={56} linhas={[{ t: 'INSS' }, { t: 'paga o benefício', c: 's' }]} />
          <path className="mv-csg-fio" d="M170,274 H287" markerEnd={`url(#${s}-n)`} />
          <text className="mv-csg-t2" x={229} y={266} textAnchor="middle">1º cai inteiro</text>
          <Caixa x={290} y={246} w={160} h={56} tom="verde" linhas={[{ t: 'Conta do cliente' }, { t: 'recebe o valor inteiro', c: 's' }]} />
          <path className="mv-csg-fio" data-tom="ambar" d="M450,274 H597" markerEnd={`url(#${s}-ambar)`} />
          <text className="mv-csg-t2" x={525} y={266} textAnchor="middle">2º a financeira cobra</text>
          <Caixa x={600} y={246} w={140} h={56} tom="ambar" linhas={[{ t: 'Financeira' }, { t: 'cobra a parcela', c: 's' }]} />
          <text className="mv-csg-t3" x={525} y={322} textAnchor="middle">débito na conta ou boleto/carnê</text>
          <text className="mv-csg-t2" x={20} y={352}>Nenhuma parte do empréstimo pessoal passa pelo INSS, e ele não usa a margem.</text>
        </svg>
      </div>
    </Figura>
  );
}

/* ------------------------------------------------------------ 2. onde cada um aparece */
function Doc({ titulo, tom, linhas }: { titulo: string; tom: 'gov' | 'banco'; linhas: { r: string; v?: string; marca?: boolean }[] }) {
  return (
    <div className="mv-csg-doc" data-tom={tom}>
      <div className="mv-csg-doc-cab">{titulo}</div>
      <div className="mv-csg-doc-corpo">
        {linhas.map((l) => (
          <div key={l.r} className="mv-csg-doc-lin" data-marca={l.marca ? '' : undefined}>
            <span>{l.r}</span>{l.v && <b>{l.v}</b>}
          </div>
        ))}
      </div>
    </div>
  );
}

export function OndeAparece() {
  return (
    <Figura tag="Ilustração" legenda="Onde cada empréstimo aparece. Documentos simplificados, com bancos e valores de exemplo. Os documentos que pedimos ao cliente são os das lições 10 a 12.">
      <div className="mv-csg-onde">
        <div className="mv-csg-onde-col" data-tom="azul">
          <div className="mv-csg-onde-cab">
            <small>Empréstimo consignado</small>
            <b>Aparece nos documentos do INSS</b>
          </div>
          <Doc titulo="Extrato de Empréstimo Consignado" tom="gov" linhas={[
            { r: 'Contrato · Banco A', v: 'R$ 310,00' },
            { r: 'Margem disponível', v: 'R$ 0,00', marca: true },
          ]} />
          <Doc titulo="Extrato de pagamento do benefício" tom="gov" linhas={[
            { r: 'Valor do benefício (bruto)', v: 'R$ 2.000,00' },
            { r: 'Empréstimo consignado · Banco A', v: '− R$ 310,00', marca: true },
          ]} />
          <p className="mv-csg-onde-pe">O desconto já vem feito pelo INSS, antes de o dinheiro cair na conta.</p>
        </div>

        <div className="mv-csg-onde-col" data-tom="ambar">
          <div className="mv-csg-onde-cab">
            <small>Empréstimo pessoal</small>
            <b>Aparece fora do INSS</b>
          </div>
          <Doc titulo="Extrato da conta do cliente" tom="banco" linhas={[
            { r: 'Crédito do benefício (INSS)', v: '+ R$ 1.100,00' },
            { r: 'Débito automático · Financeira', v: '− R$ 280,00', marca: true },
          ]} />
          <div className="mv-csg-onde-par">
            <Doc titulo="Boleto ou carnê" tom="banco" linhas={[{ r: 'Parcela do mês' }]} />
            <Doc titulo="Contrato" tom="banco" linhas={[{ r: 'Feito com a financeira' }]} />
          </div>
          <p className="mv-csg-onde-pe">Não é desconto do INSS. O cliente costuma lembrar pelo nome do banco e pelo débito na conta.</p>
        </div>
      </div>
    </Figura>
  );
}

/* ------------------------------------------------------------ 3. por que quem está sem margem acaba no pessoal */
export function ForaDaMargem() {
  const s = 'mv-csg-d3';
  return (
    <Figura tag="Exemplo" legenda="Por que quem está sem margem acaba no empréstimo pessoal: ele não depende da margem, mas é bem mais caro. Bancos e valores de exemplo.">
      <div className="mv-csg-rola">
        <svg className="mv-csg-svg" viewBox="0 0 760 384" role="img"
          aria-label="A Dona Lúcia, exemplo, está sem margem e precisa de dinheiro. Caminho 1: pede um consignado novo, mas a parcela precisaria caber na margem; a gaveta dos 35% já está cheia com Banco A, Banco B e BMG; o consignado novo não sai; aqui entram os ganchos: aumento de margem e portabilidade. Caminho 2: procura uma financeira e faz um empréstimo pessoal, fora do INSS; ele não usa a margem, por isso o dinheiro pode sair; mas os juros são livres, em geral bem mais altos; é nos juros desse empréstimo que a CAF olha.">
          <Setas id={s} />
          <Caixa x={250} y={12} w={260} h={52} linhas={[{ t: 'Dona Lúcia está sem margem' }, { t: 'e precisa de dinheiro', c: 's' }]} />
          <path className="mv-csg-fio" d="M380,64 C380,90 180,82 180,103" markerEnd={`url(#${s}-n)`} />
          <path className="mv-csg-fio" d="M380,64 C380,90 580,82 580,103" markerEnd={`url(#${s}-n)`} />

          {/* caminho 1: consignado */}
          <Caixa x={30} y={106} w={300} h={60} tom="azul" linhas={[{ t: 'CAMINHO 1', c: 'k' }, { t: 'Pede um consignado novo' }, { t: 'a parcela precisaria caber na margem', c: 's' }]} />
          <path className="mv-csg-fio" d="M180,166 V185" markerEnd={`url(#${s}-n)`} />
          <rect className="mv-csg-seg" data-tom="azul" x={30} y={188} width={131} height={34} rx={5} />
          <text className="mv-csg-seg-t" x={95} y={210} textAnchor="middle">Banco A</text>
          <rect className="mv-csg-seg" data-tom="azul" x={163} y={188} width={101} height={34} rx={5} />
          <text className="mv-csg-seg-t" x={213} y={210} textAnchor="middle">Banco B</text>
          <rect className="mv-csg-seg" data-tom="azul" x={266} y={188} width={64} height={34} rx={5} />
          <text className="mv-csg-seg-t" x={298} y={210} textAnchor="middle">BMG</text>
          <text className="mv-csg-t2" x={180} y={240} textAnchor="middle">gaveta dos 35%: cheia</text>
          <path className="mv-csg-fio" d="M180,246 V263" markerEnd={`url(#${s}-n)`} />
          <Caixa x={30} y={266} w={300} h={54} tom="rubro" linhas={[{ t: 'Consignado novo não sai' }, { t: 'não há espaço na margem', c: 's' }]} />
          <path className="mv-csg-fio" d="M180,320 V333" markerEnd={`url(#${s}-n)`} />
          <Caixa x={30} y={336} w={300} h={40} tom="azul" tracejado linhas={[{ t: 'ganchos: aumento de margem, portabilidade', c: 's' }]} />

          {/* caminho 2: empréstimo pessoal */}
          <Caixa x={420} y={106} w={320} h={60} tom="ambar" linhas={[{ t: 'CAMINHO 2', c: 'k' }, { t: 'Procura uma financeira' }, { t: 'empréstimo pessoal, fora do INSS', c: 's' }]} />
          <path className="mv-csg-fio" d="M580,166 V185" markerEnd={`url(#${s}-n)`} />
          <Caixa x={420} y={188} w={320} h={52} linhas={[{ t: 'Não usa a margem' }, { t: 'por isso o dinheiro pode sair', c: 's' }]} />
          <path className="mv-csg-fio" d="M580,240 V263" markerEnd={`url(#${s}-n)`} />
          <Caixa x={420} y={266} w={320} h={54} tom="ambar" linhas={[{ t: 'Mas os juros são livres' }, { t: 'em geral, bem mais altos que os do consignado', c: 's' }]} />
          <path className="mv-csg-fio" d="M580,320 V333" markerEnd={`url(#${s}-n)`} />
          <Caixa x={420} y={336} w={320} h={40} tom="verde" tracejado linhas={[{ t: 'é nos juros desse empréstimo que a CAF olha', c: 's' }]} />
        </svg>
      </div>
    </Figura>
  );
}

/* ------------------------------------------------------------ 4. teto × juros livres */
export function TetoJuros() {
  return (
    <Figura tag="Ideia simplificada" legenda="Sem números: a altura de cada coluna mostra o peso dos juros. O consignado tem teto; o empréstimo pessoal, não. O desenho não representa nenhum caso real.">
      <div className="mv-csg-rola">
        <svg className="mv-csg-svg" viewBox="0 0 760 302" role="img"
          aria-label="Três colunas, sem números. Empréstimo consignado: juros baixos, abaixo de uma linha de teto definida para o consignado do INSS. Empréstimo pessoal: juros livres, sem teto, em geral bem mais altos. Empréstimo pessoal com juros abusivos: uma parte grande passa muito do que é considerado razoável; é o que a CAF revisa.">
          <line className="mv-csg-base" x1={70} x2={740} y1={250} y2={250} />

          {/* consignado */}
          <rect className="mv-csg-seg" data-tom="azul" x={120} y={182} width={120} height={68} rx={6} />
          <line className="mv-csg-teto" x1={96} x2={264} y1={162} y2={162} />
          <text className="mv-csg-t2 mv-csg-cor" data-tom="azul" x={180} y={152} textAnchor="middle">teto do consignado</text>
          <text className="mv-csg-tx-b" x={180} y={272} textAnchor="middle">Empréstimo consignado</text>
          <text className="mv-csg-tx-s" x={180} y={290} textAnchor="middle">juros com teto</text>

          {/* pessoal */}
          <rect className="mv-csg-seg" data-tom="ambar-claro" x={350} y={110} width={120} height={140} rx={6} />
          <text className="mv-csg-t2" x={410} y={100} textAnchor="middle">sem teto</text>
          <text className="mv-csg-tx-b" x={410} y={272} textAnchor="middle">Empréstimo pessoal</text>
          <text className="mv-csg-tx-s" x={410} y={290} textAnchor="middle">juros livres, mais altos</text>

          {/* pessoal com abuso */}
          <rect className="mv-csg-seg" data-tom="ambar-claro" x={580} y={110} width={120} height={140} rx={6} />
          <rect className="mv-csg-seg" data-tom="rubro" x={580} y={36} width={120} height={72} rx={6} />
          <text className="mv-csg-seg-t" x={640} y={68} textAnchor="middle">muito acima</text>
          <text className="mv-csg-seg-t" x={640} y={85} textAnchor="middle">do razoável</text>
          <line className="mv-csg-div" x1={476} x2={576} y1={109} y2={109} />
          <text className="mv-csg-t3" x={526} y={101} textAnchor="middle">o razoável</text>
          <text className="mv-csg-tx-b" x={640} y={272} textAnchor="middle">Pessoal com juros abusivos</text>
          <text className="mv-csg-tx-s" x={640} y={290} textAnchor="middle">é o que a CAF revisa</text>
        </svg>
      </div>
    </Figura>
  );
}

/* ------------------------------------------------------------ 5. os dois canais */
export function DoisCanais() {
  const s = 'mv-csg-d5';
  return (
    <Figura tag="Diagrama" legenda="Como a diferença aparece em cada canal. No de juros, o cliente já quer a revisão do pessoal; no de empréstimo, ele quer consignado novo e você usa os ganchos e a revisão do pessoal.">
      <div className="mv-csg-rola">
        <svg className="mv-csg-svg" viewBox="0 0 760 340" role="img"
          aria-label="Dois canais. Canal de juros abusivos, do Andrius, venda mais direta: o cliente já quer a revisão dos juros do pessoal; confirme o empréstimo pessoal numa das 5 financeiras; processo da CAF, a revisão dos juros do pessoal. Canal de empréstimo: o cliente quer um consignado novo, dinheiro rápido; você confere os extratos, e a maioria está sem margem; daí dois caminhos: os ganchos do consignado, aumento de margem e portabilidade; e a revisão do pessoal, se ele tiver empréstimo pessoal numa das 5 financeiras. Nos dois canais, nada de promessa de valor ou de resultado.">
          <Setas id={s} />
          {/* canal de juros */}
          <text className="mv-csg-tx-k" data-tom="verde" x={20} y={22}>CANAL DE JUROS ABUSIVOS (ANDRIUS)</text>
          <text className="mv-csg-t3" x={302} y={22}>venda mais direta</text>
          <Caixa x={20} y={36} w={190} h={60} linhas={[{ t: 'Já quer a revisão' }, { t: 'dos juros do pessoal', c: 's' }]} />
          <path className="mv-csg-fio" d="M210,66 H241" markerEnd={`url(#${s}-n)`} />
          <Caixa x={244} y={36} w={210} h={60} tom="ambar" linhas={[{ t: 'Confirme o pessoal' }, { t: 'numa das 5 financeiras', c: 's' }]} />
          <path className="mv-csg-fio" d="M454,66 H513" markerEnd={`url(#${s}-n)`} />
          <Caixa x={516} y={36} w={224} h={60} tom="verde" linhas={[{ t: 'Processo da CAF' }, { t: 'revisão dos juros do pessoal', c: 's' }]} />

          <line className="mv-csg-div" x1={20} x2={740} y1={122} y2={122} />

          {/* canal de empréstimo */}
          <text className="mv-csg-tx-k" data-tom="azul" x={20} y={150}>CANAL DE EMPRÉSTIMO</text>
          <text className="mv-csg-t3" x={190} y={150}>o cliente precisa ser convencido</text>
          <Caixa x={20} y={186} w={190} h={60} linhas={[{ t: 'Quer consignado novo' }, { t: 'dinheiro rápido', c: 's' }]} />
          <path className="mv-csg-fio" d="M210,216 H241" markerEnd={`url(#${s}-n)`} />
          <Caixa x={244} y={186} w={210} h={60} tom="rubro" linhas={[{ t: 'Confere os extratos' }, { t: 'a maioria está sem margem', c: 's' }]} />
          <path className="mv-csg-fio" d="M454,216 H468" />
          <circle className="mv-csg-ponto" cx={470} cy={216} r={3.5} />
          <path className="mv-csg-fio" data-tom="azul" d="M470,216 C494,216 490,190 513,190" markerEnd={`url(#${s}-azul)`} />
          <path className="mv-csg-fio" data-tom="verde" d="M470,216 C494,216 490,276 513,276" markerEnd={`url(#${s}-verde)`} />
          <Caixa x={516} y={160} w={224} h={60} tom="azul" linhas={[{ t: 'GANCHOS DO CONSIGNADO', c: 'k' }, { t: 'Aumento de margem' }, { t: 'e portabilidade', c: 's' }]} />
          <Caixa x={516} y={246} w={224} h={60} tom="verde" linhas={[{ t: 'E A REVISÃO DO PESSOAL', c: 'k' }, { t: 'Se ele tiver pessoal' }, { t: 'numa das 5 financeiras', c: 's' }]} />

          <text className="mv-csg-t2" x={380} y={332} textAnchor="middle">Nos dois canais: nada de promessa de valor ou de resultado.</text>
        </svg>
      </div>
    </Figura>
  );
}

/* ------------------------------------------------------------ 6. mapa final da diferença */
const LINHAS_MAPA: { rot: string; c: { t: string; s: string; tom?: 'azul' | 'verde' | 'ambar' | 'rubro' }; p: { t: string; s: string; tom?: 'azul' | 'verde' | 'ambar' | 'rubro' } }[] = [
  { rot: 'QUEM COBRA', c: { t: 'O INSS desconta', s: 'antes de o dinheiro cair na conta' }, p: { t: 'A financeira cobra', s: 'na conta ou por boleto/carnê' } },
  { rot: 'LIMITE', c: { t: 'Precisa de margem', s: 'até 45%: 35% + 5% RMC + 5% RCC' }, p: { t: 'Não usa a margem', s: 'sai até para quem está sem margem' } },
  { rot: 'JUROS', c: { t: 'Juros com teto', s: 'em geral, os mais baratos' }, p: { t: 'Juros livres', s: 'em geral, bem mais altos', tom: 'rubro' } },
  { rot: 'ONDE APARECE', c: { t: 'Nos extratos do Meu INSS', s: 'extrato de consignado e de pagamento' }, p: { t: 'Na conta e no contrato', s: 'não é desconto do INSS' } },
  { rot: 'NA CAF', c: { t: 'Gancho do canal de empréstimo', s: 'aumento de margem · portabilidade', tom: 'azul' }, p: { t: 'Objeto do processo', s: 'revisão dos juros + ressarcimento', tom: 'verde' } },
];

export function MapaDiferenca() {
  const s = 'mv-csg-d6';
  const y0 = 150;
  const passo = 64;
  return (
    <Figura tag="Mapa" legenda="O mapa da lição: os dois empréstimos lado a lado, linha por linha. Se você consegue explicar cada linha em voz alta, entendeu a diferença.">
      <div className="mv-csg-rola">
        <svg className="mv-csg-svg" viewBox="0 0 760 474" role="img"
          aria-label={`Mapa. Consignado × pessoal. ${LINHAS_MAPA.map((l) => `${l.rot.toLowerCase()}: no consignado, ${l.c.t.toLowerCase()}, ${l.c.s}; no empréstimo pessoal, ${l.p.t.toLowerCase()}, ${l.p.s}.`).join(' ')}`}>
          <Setas id={s} />
          <rect className="mv-csg-centro" x={270} y={12} width={220} height={46} rx={12} />
          <text className="mv-csg-centro-t" x={380} y={40} textAnchor="middle">Consignado × pessoal</text>
          <path className="mv-csg-fio" d="M380,58 C380,74 160,68 160,83" markerEnd={`url(#${s}-n)`} />
          <path className="mv-csg-fio" d="M380,58 C380,74 600,68 600,83" markerEnd={`url(#${s}-n)`} />
          <Caixa x={20} y={86} w={280} h={40} tom="azul" linhas={[{ t: 'Empréstimo consignado' }]} />
          <Caixa x={460} y={86} w={280} h={40} tom="ambar" linhas={[{ t: 'Empréstimo pessoal' }]} />
          {LINHAS_MAPA.map((l, i) => {
            const y = y0 + i * passo;
            return (
              <g key={l.rot}>
                <path className="mv-csg-fio" d={`M160,${y - (i === 0 ? 24 : 12)} V${y}`} />
                <path className="mv-csg-fio" d={`M600,${y - (i === 0 ? 24 : 12)} V${y}`} />
                <line className="mv-csg-div" x1={300} x2={460} y1={y + 26} y2={y + 26} />
                <rect className="mv-csg-rot" x={316} y={y + 15} width={128} height={22} rx={11} />
                <text className="mv-csg-tx-k" x={380} y={y + 30} textAnchor="middle">{l.rot}</text>
                <Caixa x={20} y={y} w={280} h={52} tom={l.c.tom} linhas={[{ t: l.c.t }, { t: l.c.s, c: 's' }]} />
                <Caixa x={460} y={y} w={280} h={52} tom={l.p.tom} linhas={[{ t: l.p.t }, { t: l.p.s, c: 's' }]} />
              </g>
            );
          })}
        </svg>
      </div>
    </Figura>
  );
}
