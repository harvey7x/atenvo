/* Lição 11 — ilustrações próprias (prefixo mv-gov-): onde a lição entra na
   documentação, mapa "uma conta, várias portas" do gov.br, exercício ×
   ano-calendário, telas do passo a passo no Meu Imposto de Renda, print bom ×
   ruim, quem declara × quem não declara, montador da pasta do IR, DEC e REC
   ilustrados, jogo "DEC ou REC?", conferência da pasta, semáforo da situação
   cadastral, tela e comprovante da consulta do CPF, árvore de decisão e
   checklist. Telas do governo e documentos em papel têm paleta própria (são
   "de fora") e levam a tag Ilustração; o resto usa só tokens do tema.
   Nomes, números e datas são de EXEMPLO. */
import { useState, type ReactNode } from 'react';
import { BomRuim, Figura, IcCheck, IcX, Print } from '../pecas';
import { hojeMesAno } from '../ilustracoes';
import './11-gov.css';

type Tom = 'azul' | 'verde' | 'ambar' | 'rubro';
const anoAtual = () => hojeMesAno().ano;

/* ------------------------------------------------------------ peças de SVG */
/** Pontas de seta (uma por tom) para as linhas de cada desenho. */
function Setas({ id }: { id: string }) {
  const tons = ['n', 'azul', 'verde', 'ambar', 'rubro'] as const;
  return (
    <defs>
      {tons.map((t) => (
        <marker key={t} id={`${id}-${t}`} viewBox="0 0 10 10" refX="8.6" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path className="mv-gov-pta" data-tom={t} d="M0,1 L9,5 L0,9 z" />
        </marker>
      ))}
    </defs>
  );
}

type Linha = { t: string; c?: 'k' | 'b' | 's' };
/** Caixa com linhas centralizadas (k = rótulo pequeno, b = título, s = apoio). */
function Caixa({ x, y, w, h, tom, linhas, tracejado }: { x: number; y: number; w: number; h: number; tom?: Tom; linhas: Linha[]; tracejado?: boolean }) {
  const alt = (c?: Linha['c']) => (c === 'k' ? 16 : c === 's' ? 17 : 20);
  const total = linhas.reduce((s, l) => s + alt(l.c), 0);
  let topo = y + h / 2 - total / 2;
  return (
    <g>
      <rect className="mv-gov-cx" data-tom={tom} data-tracejado={tracejado ? '' : undefined} x={x} y={y} width={w} height={h} rx={10} />
      {linhas.map((l, i) => {
        const a = alt(l.c);
        topo += a;
        return (
          <text key={i} className={`mv-gov-tx-${l.c ?? 'b'}`} data-tom={tom} x={x + w / 2} y={topo - a * 0.28} textAnchor="middle">{l.t}</text>
        );
      })}
    </g>
  );
}

/* ------------------------------------------------------------ 1. onde estamos */
const ETAPAS: { t: string; d: string; st: 'feito' | 'agora' | 'depois' }[] = [
  { t: 'Meu INSS', d: 'Carta de concessão, extrato de empréstimo consignado e extratos de pagamento', st: 'feito' },
  { t: 'gov.br', d: 'Imposto de renda e situação do CPF', st: 'agora' },
  { t: 'Documentos pessoais', d: 'Identidade, comprovante e e-mail', st: 'depois' },
  { t: 'Cadastro e procurações', d: 'Cadastro no admin e assinatura pelo gov.br', st: 'depois' },
];
export function OndeEstamos() {
  return (
    <Figura tag="Mapa" legenda="A documentação do cliente tem quatro blocos. Esta lição é o segundo da ordem sugerida, que não é rígida: o cliente pode mandar primeiro o que tiver em mãos.">
      <ol className="mv-gov-trilha" aria-label="Etapas da documentação do cliente">
        {ETAPAS.map((e, i) => (
          <li key={e.t} data-st={e.st}>
            <span className="mv-gov-trilha-n num">{e.st === 'feito' ? <IcCheck /> : i + 1}</span>
            <b>{e.t}</b>
            <small>{e.d}</small>
            {e.st === 'agora' && <em>Você está aqui</em>}
          </li>
        ))}
      </ol>
    </Figura>
  );
}

/* ------------------------------------------------------------ 2. mapa do gov.br */
export function MapaGovBr() {
  const s = 'mv-gov-s1';
  const portas: { y: number; k: string; b: string; s: string; tom?: Tom; trac?: boolean }[] = [
    { y: 14, k: 'SERVIÇO DO INSS', b: 'Meu INSS', s: 'Carta de concessão e extratos' },
    { y: 92, k: 'SERVIÇO DA RECEITA FEDERAL', b: 'Meu Imposto de Renda', s: 'As declarações de cada ano', tom: 'azul' },
    { y: 170, k: 'ASSINATURA ELETRÔNICA', b: 'Assinar documentos', s: 'Procurações: só prata ou ouro' },
    { y: 248, k: 'E MUITO MAIS', b: 'Outros serviços', s: 'CNH, Carteira de Trabalho e outros', trac: true },
  ];
  const kx = 270, ky = 125;
  return (
    <Figura legenda="Uma conta gov.br (CPF + senha) abre vários serviços do governo. A consulta da situação do CPF fica à parte: não precisa de login.">
      <div className="mv-gov-rola">
        <svg className="mv-gov-svg" viewBox="0 0 760 320" role="img"
          aria-label="Mapa. A conta gov.br, que se acessa com CPF e senha e tem nível bronze, prata ou ouro, abre: o Meu INSS, com a carta de concessão e os extratos; o Meu Imposto de Renda, da Receita Federal, com as declarações de cada ano; a assinatura eletrônica de documentos, em que as procurações só são assinadas com conta prata ou ouro; e outros serviços. À parte, sem login: a situação cadastral do CPF, no site da Receita, com CPF e data de nascimento.">
          <Setas id={s} />
          {portas.map((p) => {
            const py = p.y + 29;
            return (
              <path key={p.b} className="mv-gov-fio" data-tom={p.tom}
                d={`M${kx},${ky} C${kx + 85},${ky} ${kx + 85},${py} 437,${py}`} markerEnd={`url(#${s}-${p.tom ?? 'n'})`} />
            );
          })}
          <Caixa x={30} y={70} w={240} h={110} tom="azul" linhas={[
            { t: 'CONTA ÚNICA DO CIDADÃO', c: 'k' }, { t: 'gov.br' }, { t: 'Entra com CPF + senha', c: 's' }, { t: 'Nível: bronze, prata ou ouro', c: 's' },
          ]} />
          {portas.map((p) => (
            <Caixa key={p.b} x={440} y={p.y} w={300} h={58} tom={p.tom} tracejado={p.trac}
              linhas={[{ t: p.k, c: 'k' }, { t: p.b }, { t: p.s, c: 's' }]} />
          ))}
          <Caixa x={30} y={236} w={290} h={70} tracejado linhas={[
            { t: 'À PARTE · SEM LOGIN', c: 'k' }, { t: 'Situação cadastral do CPF' }, { t: 'Site da Receita: CPF + nascimento', c: 's' },
          ]} />
        </svg>
      </div>
    </Figura>
  );
}

/* ------------------------------------------------------------ 3. exercício × ano-calendário */
export function LinhaExercicio() {
  const A = anoAtual();
  const s = 'mv-gov-s2';
  return (
    <Figura legenda="Na tela, cada ano aparece como Exercício: o ano em que a declaração foi entregue. O dinheiro declarado é do ano anterior (o ano-calendário). Pegamos os 3 exercícios mais recentes.">
      <div className="mv-gov-rola">
        <svg className="mv-gov-svg" viewBox="0 0 760 232" role="img"
          aria-label={`Exercício e ano-calendário. Exercício ${A}: declaração entregue em ${A}, sobre o dinheiro de ${A - 1}. Exercício ${A - 1}: entregue em ${A - 1}, sobre ${A - 2}. Exercício ${A - 2}: entregue em ${A - 2}, sobre ${A - 3}.`}>
          <Setas id={s} />
          <text className="mv-gov-tx-k" x={145} y={22} textAnchor="middle">O DINHEIRO DO ANO</text>
          <text className="mv-gov-tx-k" data-tom="azul" x={615} y={22} textAnchor="middle">COMO APARECE NA TELA</text>
          {[A, A - 1, A - 2].map((Y, i) => {
            const y = 38 + i * 64;
            return (
              <g key={Y}>
                <Caixa x={20} y={y} w={250} h={52} linhas={[{ t: `Ano-calendário ${Y - 1}` }, { t: 'O dinheiro de janeiro a dezembro', c: 's' }]} />
                <path className="mv-gov-fio" data-tom="azul" d={`M272,${y + 30} L486,${y + 30}`} markerEnd={`url(#${s}-azul)`} />
                <text className="mv-gov-tx-s" x={379} y={y + 21} textAnchor="middle">entregue no ano seguinte</text>
                <Caixa x={490} y={y} w={250} h={52} tom="azul" linhas={[{ t: `Exercício ${Y}` }, { t: `Declaração entregue em ${Y}`, c: 's' }]} />
              </g>
            );
          })}
        </svg>
      </div>
    </Figura>
  );
}

/* ------------------------------------------------------------ 4. telas do passo a passo */
function TelaGov({ topo, children }: { topo: ReactNode; children: ReactNode }) {
  return (
    <div className="mv-gov-g">
      <div className="mv-gov-g-topo">{topo}</div>
      <div className="mv-gov-g-corpo">{children}</div>
    </div>
  );
}
type PassoTela = { end: string; t: string; tx: string; dica: string; tela: ReactNode };
/** Passo a passo clicável: tela ilustrada à esquerda, explicação à direita. */
export function TelasPassoAPasso() {
  const A = anoAtual();
  const [i, setI] = useState(0);
  const passos: PassoTela[] = [
    {
      end: 'sso.acesso.gov.br',
      t: 'Entrar no gov.br com o CPF',
      tx: 'Abra o site ou o aplicativo gov.br e escolha entrar com o número do CPF. Digite o CPF do cliente e toque em Continuar.',
      dica: 'O cliente já entrou no Meu INSS? Então ele já tem conta gov.br: é o mesmo CPF e a mesma senha. Não existe outra senha para criar.',
      tela: (
        <TelaGov topo={<b>gov.br</b>}>
          <span className="mv-gov-g-tit">Identifique-se no gov.br com:</span>
          <span className="mv-gov-g-opc" data-alvo="">Número do CPF</span>
          <div className="mv-gov-g-campo"><small>CPF</small><span className="num" data-alvo="">000.000.000-00</span></div>
          <span className="mv-gov-g-btn" data-alvo="">Continuar</span>
        </TelaGov>
      ),
    },
    {
      end: 'sso.acesso.gov.br',
      t: 'Digitar a senha',
      tx: 'Digite a senha da conta gov.br do cliente e toque em Entrar.',
      dica: 'Se o gov.br pedir uma confirmação que chega no celular do cliente, faça essa parte junto com ele. Errou a senha? Não fique tentando várias vezes: pare e confirme com o cliente.',
      tela: (
        <TelaGov topo={<b>gov.br</b>}>
          <span className="mv-gov-g-tit">Digite sua senha</span>
          <div className="mv-gov-g-campo"><small>CPF</small><span className="num" data-mudo="">000.000.000-00</span></div>
          <div className="mv-gov-g-campo"><small>Senha</small><span data-alvo="">••••••••••</span></div>
          <span className="mv-gov-g-link">Esqueci minha senha</span>
          <span className="mv-gov-g-btn" data-alvo="">Entrar</span>
        </TelaGov>
      ),
    },
    {
      end: 'gov.br',
      t: 'Procurar o Meu Imposto de Renda',
      tx: 'Na busca do gov.br, digite “Meu Imposto de Renda” e abra o serviço da Receita Federal.',
      dica: 'O desenho das telas muda de vez em quando. Procure sempre pelo nome do serviço, não pela posição do botão.',
      tela: (
        <TelaGov topo={<><b>gov.br</b><span>Olá, Maria</span></>}>
          <div className="mv-gov-g-busca" data-alvo="">Meu Imposto de Renda</div>
          <div className="mv-gov-g-res" data-alvo=""><i aria-hidden /><span><b>Meu Imposto de Renda</b><small>Receita Federal</small></span></div>
          <div className="mv-gov-g-res"><i aria-hidden /><span><b>Outros resultados da busca</b><small>Outros órgãos</small></span></div>
        </TelaGov>
      ),
    },
    {
      end: 'gov.br › Meu Imposto de Renda',
      t: 'Abrir a área das declarações',
      tx: 'Dentro do Meu Imposto de Renda, abra a parte das declarações. É ali que aparecem os anos, um embaixo do outro.',
      dica: 'Apareceu um aviso pedindo para aumentar o nível da conta? A conta está no bronze e o serviço pede prata ou ouro. Como o cliente sobe de nível: lição 13.',
      tela: (
        <TelaGov topo={<><b>Meu Imposto de Renda</b><span>Receita Federal</span></>}>
          <div className="mv-gov-g-grade">
            <div className="mv-gov-g-card" data-alvo=""><i aria-hidden /><span>Declarações</span><small>Os anos de imposto de renda</small></div>
            <div className="mv-gov-g-card"><i aria-hidden /><span>Outros serviços</span></div>
            <div className="mv-gov-g-card"><i aria-hidden /><span>Ajuda</span></div>
          </div>
        </TelaGov>
      ),
    },
    {
      end: 'gov.br › Meu Imposto de Renda › Declarações',
      t: 'Escolher o ano',
      tx: 'A lista mostra os anos como Exercício. Abra o mais recente primeiro. Depois você volta e abre os outros dois.',
      dica: `Exercício é o ano da entrega. O Exercício ${A} é a declaração entregue em ${A}, sobre o dinheiro de ${A - 1}.`,
      tela: (
        <TelaGov topo={<><b>Declarações</b><span>Meu Imposto de Renda</span></>}>
          {[A, A - 1, A - 2].map((y, j) => (
            <div key={y} className="mv-gov-g-lin" data-alvo={j === 0 ? '' : undefined}><b className="num">Exercício {y}</b><span>Abrir</span></div>
          ))}
        </TelaGov>
      ),
    },
    {
      end: `gov.br › Meu Imposto de Renda › Exercício ${A}`,
      t: 'Tirar o print e baixar a DEC e o REC',
      tx: 'Com o ano aberto, tire um print da tela inteira. Se houver declaração, baixe a declaração (DEC) e o recibo (REC). Depois volte para a lista e repita com os outros dois anos.',
      dica: 'Não há declaração naquele ano? Tire o print mesmo assim: ele é a prova de que naquele ano o cliente não declarou.',
      tela: (
        <TelaGov topo={<><b>Exercício {A}</b><span>Ano-calendário {A - 1}</span></>}>
          <div className="mv-gov-g-status"><small>Situação</small><b>Declaração processada</b></div>
          <div className="mv-gov-g-bts"><span data-alvo="">Declaração (DEC)</span><span data-alvo="">Recibo (REC)</span></div>
          <span className="mv-gov-g-print">Print da tela inteira</span>
        </TelaGov>
      ),
    },
  ];
  const p = passos[i];
  return (
    <div className="mv-gov-pp">
      <Print endereco={p.end} legenda="Telas simplificadas, com dados de exemplo. A aparência real pode mudar: procure sempre pelos nomes.">{p.tela}</Print>
      <div className="vidro mv-gov-pp-painel" aria-live="polite">
        <span className="mv-gov-pp-n">Passo {i + 1} de {passos.length}</span>
        <b className="mv-gov-pp-t">{p.t}</b>
        <p>{p.tx}</p>
        <div className="mv-gov-pp-dica"><small>Dica</small><p>{p.dica}</p></div>
        <div className="mv-gov-pp-nav">
          <button type="button" className="mv-gov-btn" disabled={i === 0} onClick={() => setI(i - 1)}>Anterior</button>
          <div className="mv-gov-pp-pontos" role="group" aria-label="Ir direto para um passo">
            {passos.map((x, j) => (
              <button key={x.t} type="button" aria-label={`Passo ${j + 1}: ${x.t}`} aria-current={j === i ? 'step' : undefined} onClick={() => setI(j)} />
            ))}
          </div>
          <button type="button" className="mv-gov-btn" data-tom="azul" disabled={i === passos.length - 1} onClick={() => setI(i + 1)}>Próximo</button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ 5. print bom × ruim */
function MiniTela({ ruim, vazio }: { ruim?: boolean; vazio?: boolean }) {
  const A = anoAtual();
  return (
    <div className="mv-gov-mini" data-ruim={ruim ? '' : undefined} aria-hidden>
      {!ruim && <div className="mv-gov-mini-topo"><b>Exercício {A}</b><span>Ano-calendário {A - 1}</span></div>}
      <div className="mv-gov-mini-corpo">
        {vazio ? (
          <span className="mv-gov-mini-vazio">Não há declaração entregue para este exercício.</span>
        ) : (
          <>
            <small>Situação</small>
            <b>Declaração processada</b>
            <div className="mv-gov-mini-bts"><span>Declaração</span><span>Recibo</span></div>
          </>
        )}
      </div>
    </div>
  );
}
export function PrintBomRuim() {
  return (
    <BomRuim
      ruim={{
        titulo: 'Print que não serve',
        corpo: (
          <div className="mv-gov-mini-wrap">
            <MiniTela ruim />
            <span className="mv-tag">Ilustração</span>
            <ul className="mv-gov-mini-lista" data-tom="ruim">
              <li>Cortado: não dá para ver de qual ano é.</li>
              <li>Foto da tela tirada com outro celular, torta e com reflexo.</li>
              <li>Borrado, difícil de ler.</li>
            </ul>
          </div>
        ),
      }}
      bom={{
        titulo: 'Print que serve',
        corpo: (
          <div className="mv-gov-mini-wrap">
            <MiniTela />
            <span className="mv-tag">Ilustração</span>
            <ul className="mv-gov-mini-lista" data-tom="bom">
              <li>Mostra o exercício (o ano) no topo.</li>
              <li>Mostra a situação do ano: com ou sem declaração.</li>
              <li>Tela inteira, nítida, sem cortes.</li>
            </ul>
          </div>
        ),
      }}
    />
  );
}

/* ------------------------------------------------------------ 6. quem declara × quem não declara */
export function DuasSituacoes() {
  const lados = [
    { k: 'declara', titulo: 'Cliente que declara', vazio: false, arquivos: ['Print da tela do ano', 'Declaração (DEC)', 'Recibo (REC)'], total: '3 anos × 3 arquivos = 9 arquivos' },
    { k: 'nao', titulo: 'Cliente que não declara', vazio: true, arquivos: ['Print da tela do ano'], total: '3 anos × 1 arquivo = 3 arquivos' },
  ];
  return (
    <Figura legenda="Em cada ano, a tela mostra uma de duas situações. O que você junta depende só dela.">
      <div className="mv-gov-sit">
        {lados.map((l) => (
          <div key={l.k} className="mv-gov-sit-lado" data-k={l.k}>
            <span className="mv-gov-sit-tag">{l.titulo}</span>
            <MiniTela vazio={l.vazio} />
            <small>O que juntar deste ano</small>
            <ul className="mv-gov-sit-arqs">
              {l.arquivos.map((a) => (
                <li key={a}><span className="mv-gov-arq-ic" data-tipo={a.startsWith('Print') ? 'img' : 'doc'} aria-hidden />{a}</li>
              ))}
            </ul>
            <span className="mv-gov-sit-total">{l.total}</span>
          </div>
        ))}
      </div>
    </Figura>
  );
}

/* ------------------------------------------------------------ 7. monte a pasta */
type Arq = { n: string; t: 'img' | 'doc' };
const CASOS_PASTA: { nome: string; v: boolean[] }[] = [
  { nome: 'Dona Maria: declara nos 3 anos', v: [true, true, true] },
  { nome: 'Seu José: não declara', v: [false, false, false] },
  { nome: 'Dona Rosa: declarou só no ano mais antigo', v: [false, false, true] },
];
/** Marque, ano a ano, se o cliente declarou e veja a pasta que você precisa montar. */
export function MontePasta() {
  const A = anoAtual();
  const anos = [A, A - 1, A - 2];
  const [dec, setDec] = useState<boolean[]>([true, true, false]);
  const arquivos: Arq[] = anos.flatMap((y, i): Arq[] => [
    { n: `IR ${y} · print da tela`, t: 'img' },
    ...(dec[i] ? [{ n: `IR ${y} · declaração (DEC)`, t: 'doc' as const }, { n: `IR ${y} · recibo (REC)`, t: 'doc' as const }] : []),
  ]);
  const igual = (v: boolean[]) => v.every((x, i) => x === dec[i]);
  function marcar(i: number, valor: boolean) {
    setDec((d) => d.map((x, j) => (j === i ? valor : x)));
  }
  return (
    <div className="vidro mv-gov-pasta">
      <div className="mv-gov-pasta-cfg">
        <span className="mv-gov-rot">Exemplos prontos</span>
        <div className="mv-gov-chips">
          {CASOS_PASTA.map((c) => (
            <button key={c.nome} type="button" className="mv-gov-chip" aria-pressed={igual(c.v)} onClick={() => setDec([...c.v])}>{c.nome}</button>
          ))}
        </div>
        <span className="mv-gov-rot">Ou marque ano por ano</span>
        {anos.map((y, i) => (
          <div key={y} className="mv-gov-pasta-ano">
            <b className="num">Exercício {y}</b>
            <div className="mv-gov-seg" role="group" aria-label={`Exercício ${y}: o cliente declarou?`}>
              <button type="button" aria-pressed={dec[i]} onClick={() => marcar(i, true)}>Declarou</button>
              <button type="button" aria-pressed={!dec[i]} onClick={() => marcar(i, false)}>Não declarou</button>
            </div>
          </div>
        ))}
      </div>
      <div className="mv-gov-pasta-res" aria-live="polite">
        <div className="mv-gov-pasta-cab">
          <span className="mv-gov-pasta-ic" aria-hidden />
          <b>Pasta do cliente · imposto de renda</b>
          <span className="num">{arquivos.length} arquivos</span>
        </div>
        <ul>
          {arquivos.map((a) => (
            <li key={a.n}><span className="mv-gov-arq-ic" data-tipo={a.t} aria-hidden />{a.n}</li>
          ))}
        </ul>
        <span className="mv-gov-nota">
          Conta rápida: 3 prints sempre, mais 2 documentos (DEC e REC) para cada ano com declaração. Os nomes dos arquivos
          são só uma sugestão: siga o padrão que o gestor combinar com a equipe.
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ 8. papel com pontos clicáveis */
type LinhaPapel =
  | { k: 'cab' | 'tit' | 'sub' | 'secao' | 'rodape'; t: string; pino?: number; destaque?: boolean }
  | { k: 'campo'; r: string; v: string; pino?: number; destaque?: boolean }
  | { k: 'barras'; n: number };
type PinoInfo = { n: number; t: string; d: string };

/** Documento em papel (paleta própria) com números clicáveis e a legenda ao lado. */
function Papel({ nome, linhas, pinos, paginas, lado }: { nome: string; linhas: LinhaPapel[]; pinos: PinoInfo[]; paginas?: boolean; lado?: boolean }) {
  const [sel, setSel] = useState<number | null>(null);
  const alternar = (n: number) => setSel((s) => (s === n ? null : n));
  const pino = (n?: number) => (n ? (
    <button type="button" className="mv-gov-pino num" data-sel={sel === n ? '' : undefined}
      aria-label={`Ponto ${n}: ${pinos.find((p) => p.n === n)?.t ?? ''}`} onClick={() => alternar(n)}>{n}</button>
  ) : null);
  return (
    <div className="mv-gov-doc" data-lado={lado ? '' : undefined}>
      <div className="mv-gov-pilha" data-paginas={paginas ? '' : undefined}>
        <div className="mv-gov-papel" role="group" aria-label={`Ilustração: ${nome}`}>
          {linhas.map((l, i) => {
            if (l.k === 'barras') {
              return (
                <div key={i} className="mv-gov-papel-barras" aria-hidden>
                  {Array.from({ length: l.n }, (_, j) => <i key={j} style={{ width: `${92 - (((i + 1) * 7 + j * 19) % 34)}%` }} />)}
                </div>
              );
            }
            const marca = l.pino !== undefined && sel === l.pino ? '' : undefined;
            if (l.k === 'campo') {
              return (
                <div key={i} className="mv-gov-papel-campo" data-destaque={l.destaque ? '' : undefined} data-sel={marca}>
                  <span>{l.r}</span><b>{l.v}</b>{pino(l.pino)}
                </div>
              );
            }
            return (
              <div key={i} className={`mv-gov-papel-${l.k}`} data-destaque={l.destaque ? '' : undefined} data-sel={marca}>
                <span>{l.t}</span>{pino(l.pino)}
              </div>
            );
          })}
        </div>
      </div>
      <ol className="mv-gov-leg" aria-label={`Partes do documento: ${nome}`}>
        {pinos.map((p) => (
          <li key={p.n}>
            <button type="button" aria-pressed={sel === p.n} onClick={() => alternar(p.n)}>
              <span className="mv-gov-leg-n num" aria-hidden>{p.n}</span>
              <span><b>{p.t}</b><small>{p.d}</small></span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ------------------------------------------------------------ 9. DEC e REC ilustrados */
export function DocumentosDecRec() {
  const A = anoAtual();
  const dec: LinhaPapel[] = [
    { k: 'cab', t: 'IMPOSTO SOBRE A RENDA · PESSOA FÍSICA' },
    { k: 'tit', t: 'DECLARAÇÃO DE AJUSTE ANUAL', pino: 1 },
    { k: 'sub', t: `EXERCÍCIO ${A} · ANO-CALENDÁRIO ${A - 1}`, pino: 2 },
    { k: 'campo', r: 'Nome', v: 'MARIA DA SILVA' },
    { k: 'campo', r: 'CPF', v: '000.000.000-00' },
    { k: 'secao', t: 'Rendimentos tributáveis', pino: 3 },
    { k: 'barras', n: 2 },
    { k: 'secao', t: 'Rendimentos isentos' },
    { k: 'barras', n: 1 },
    { k: 'secao', t: 'Bens e direitos' },
    { k: 'barras', n: 2 },
    { k: 'secao', t: 'Dívidas e ônus reais' },
    { k: 'barras', n: 1 },
    { k: 'rodape', t: 'Página 1 de 8', pino: 4 },
  ];
  const pinosDec: PinoInfo[] = [
    { n: 1, t: 'O título: Declaração de Ajuste Anual', d: 'É a declaração completa, o documento principal do imposto de renda daquele ano.' },
    { n: 2, t: 'Exercício e ano-calendário', d: 'Confira se é o ano certo. Exercício é o ano da entrega; ano-calendário é o ano do dinheiro.' },
    { n: 3, t: 'As seções', d: 'Rendimentos, bens e direitos, dívidas: o retrato financeiro do cliente naquele ano. O recibo não traz esse detalhe.' },
    { n: 4, t: 'Várias páginas', d: 'A DEC costuma ter várias páginas. Arquivo de uma página só? Provavelmente é o recibo.' },
  ];
  const rec: LinhaPapel[] = [
    { k: 'cab', t: 'IMPOSTO SOBRE A RENDA · PESSOA FÍSICA' },
    { k: 'tit', t: 'RECIBO DE ENTREGA', pino: 1 },
    { k: 'sub', t: 'DA DECLARAÇÃO DE AJUSTE ANUAL' },
    { k: 'sub', t: `EXERCÍCIO ${A} · ANO-CALENDÁRIO ${A - 1}` },
    { k: 'campo', r: 'Nome', v: 'MARIA DA SILVA' },
    { k: 'campo', r: 'CPF', v: '000.000.000-00' },
    { k: 'campo', r: 'Número do recibo', v: '•••• •••• ••••', pino: 2, destaque: true },
    { k: 'campo', r: 'Entregue em', v: `28/04/${A} às 14:32`, pino: 3 },
    { k: 'barras', n: 2 },
    { k: 'rodape', t: 'Página 1 de 1', pino: 4 },
  ];
  const pinosRec: PinoInfo[] = [
    { n: 1, t: 'A palavra RECIBO', d: 'O título começa com “Recibo de entrega”. Ele também fala em Declaração de Ajuste Anual: por isso, leia a primeira palavra.' },
    { n: 2, t: 'Número do recibo', d: 'É o número que identifica aquela entrega na Receita Federal.' },
    { n: 3, t: 'Data e hora da entrega', d: 'Mostra quando a declaração foi entregue. É a prova de que o cliente declarou naquele ano.' },
    { n: 4, t: 'Curto', d: 'O recibo é curto: normalmente uma página.' },
  ];
  return (
    <Figura legenda="DEC e REC ilustrados, com dados de exemplo. Toque nos números (no papel ou na legenda) para destacar cada parte.">
      <div className="mv-gov-docs">
        <div className="mv-gov-docs-col">
          <span className="mv-gov-doc-rot">DEC · a declaração</span>
          <Papel nome="declaração de imposto de renda (DEC)" linhas={dec} pinos={pinosDec} paginas />
        </div>
        <div className="mv-gov-docs-col">
          <span className="mv-gov-doc-rot">REC · o recibo de entrega</span>
          <Papel nome="recibo de entrega (REC)" linhas={rec} pinos={pinosRec} />
        </div>
      </div>
    </Figura>
  );
}

/* ------------------------------------------------------------ 10. jogo DEC ou REC */
const PISTAS: { t: string; r: 'DEC' | 'REC'; p: string }[] = [
  { t: 'Tem várias páginas, com rendimentos, bens e dívidas.', r: 'DEC', p: 'É a declaração: o documento completo, com o detalhe de tudo.' },
  { t: 'O título começa com a palavra “Recibo”.', r: 'REC', p: 'A primeira palavra do título resolve: Recibo de entrega.' },
  { t: 'Mostra o número do recibo e a data e a hora da entrega.', r: 'REC', p: 'É o comprovante de que a declaração foi entregue.' },
  { t: 'Tem uma seção chamada “Bens e direitos”.', r: 'DEC', p: 'Bens e direitos é uma das seções da declaração.' },
  { t: 'É curto: uma página só.', r: 'REC', p: 'O recibo costuma ter uma página. A declaração tem várias.' },
  { t: 'No computador, o arquivo do programa da Receita termina em .DEC.', r: 'DEC', p: 'O nome DEC vem daí: a extensão do arquivo da declaração.' },
];
export function DecOuRec() {
  const [resp, setResp] = useState<Record<number, 'DEC' | 'REC'>>({});
  const feitos = Object.keys(resp).length;
  const acertos = PISTAS.filter((p, i) => resp[i] === p.r).length;
  return (
    <div className="mv-gov-jogo">
      {PISTAS.map((p, i) => {
        const r = resp[i];
        const estado = r === undefined ? undefined : r === p.r ? 'certo' : 'errado';
        return (
          <div key={p.t} className="vidro mv-gov-pista" data-estado={estado}>
            <span className="mv-gov-pista-t">{p.t}</span>
            {r === undefined ? (
              <div className="mv-gov-pista-bts" role="group" aria-label={`É DEC ou REC? ${p.t}`}>
                <button type="button" className="mv-gov-btn" onClick={() => setResp((x) => ({ ...x, [i]: 'DEC' }))}>DEC</button>
                <button type="button" className="mv-gov-btn" onClick={() => setResp((x) => ({ ...x, [i]: 'REC' }))}>REC</button>
              </div>
            ) : (
              <span className="mv-gov-pista-r" role="status">
                <b>{estado === 'certo' ? <><IcCheck /> {p.r}.</> : <><IcX /> É {p.r}.</>}</b> {p.p}
              </span>
            )}
          </div>
        );
      })}
      {feitos === PISTAS.length && (
        <div className="mv-gov-placar" role="status">
          <b className="num">{acertos} de {PISTAS.length}</b> acertos.
          <button type="button" className="mv-link" onClick={() => setResp({})}>Jogar de novo</button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ 11. confira a pasta */
export function ConfiraPasta() {
  const A = anoAtual();
  const naPasta: Arq[] = [
    { n: `IR ${A} · print da tela`, t: 'img' },
    { n: `IR ${A} · declaração (DEC)`, t: 'doc' },
    { n: `IR ${A} · recibo (REC)`, t: 'doc' },
    { n: `IR ${A - 1} · print da tela`, t: 'img' },
    { n: `IR ${A - 1} · declaração (DEC)`, t: 'doc' },
  ];
  const opcoes = [
    { t: `O recibo (REC) de ${A - 1}`, falta: true, por: `Em ${A - 1} ela declarou: a DEC está lá, mas o REC não. É o erro do “esqueci o recibo”.` },
    { t: `A declaração (DEC) de ${A}`, falta: false, por: 'Está na pasta. Não falta.' },
    { t: `O ano ${A - 2} inteiro: print, DEC e REC`, falta: true, por: 'São 3 anos, não 2. O terceiro ano ficou de fora: é o erro do “peguei só o começo”.' },
    { t: `O print de ${A - 1}`, falta: false, por: 'Está na pasta. Não falta.' },
  ];
  const [marc, setMarc] = useState<Set<number>>(() => new Set());
  const [conferido, setConferido] = useState(false);
  const acertos = opcoes.filter((o, i) => marc.has(i) === o.falta).length;
  function alternar(i: number) {
    if (conferido) return;
    setMarc((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  }
  return (
    <div className="vidro mv-gov-conf">
      <div className="mv-gov-pasta-res">
        <div className="mv-gov-pasta-cab">
          <span className="mv-gov-pasta-ic" aria-hidden />
          <b>Pasta da Dona Maria · imposto de renda</b>
          <span className="num">{naPasta.length} arquivos</span>
        </div>
        <ul>
          {naPasta.map((a) => <li key={a.n}><span className="mv-gov-arq-ic" data-tipo={a.t} aria-hidden />{a.n}</li>)}
        </ul>
        <span className="mv-gov-nota">Exemplo: a Dona Maria declarou imposto de renda nos 3 anos. Um colega montou esta pasta.</span>
      </div>
      <div className="mv-gov-conf-ops">
        <span className="mv-gov-rot">O que está faltando? Marque e confira.</span>
        {opcoes.map((o, i) => {
          const estado = !conferido ? undefined : marc.has(i) === o.falta ? 'certo' : 'errado';
          return (
            <button key={o.t} type="button" className="mv-gov-conf-op" aria-pressed={marc.has(i)} data-estado={estado} onClick={() => alternar(i)}>
              <span className="mv-per-chk" aria-hidden>{marc.has(i) && <IcCheck />}</span>
              <span>
                {o.t}
                {conferido && <small>{o.falta ? 'Falta. ' : ''}{o.por}</small>}
              </span>
            </button>
          );
        })}
        {!conferido ? (
          <button type="button" className="mv-gov-btn" data-tom="azul" onClick={() => setConferido(true)}>Conferir</button>
        ) : (
          <div className="mv-gov-placar" role="status">
            <b className="num">{acertos} de {opcoes.length}</b> certas.
            <button type="button" className="mv-link" onClick={() => { setMarc(new Set()); setConferido(false); }}>Tentar de novo</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ 12. semáforo da situação cadastral */
export function SemaforoCpf() {
  return (
    <div className="mv-gov-sem" role="group" aria-label="O que fazer com cada situação cadastral do CPF">
      <div className="vidro mv-gov-sem-lado" data-tom="verde">
        <div className="mv-gov-sem-topo"><span className="mv-gov-sem-luz" aria-hidden /><small>Situação cadastral</small></div>
        <b className="mv-gov-sem-grande">REGULAR</b>
        <span className="mv-gov-sem-tx">O CPF está em dia na Receita Federal.</span>
        <span className="mv-gov-sem-acao"><b>O que fazer:</b> salvar o comprovante e seguir para a próxima etapa.</span>
      </div>
      <div className="vidro mv-gov-sem-lado" data-tom="ambar">
        <div className="mv-gov-sem-topo"><span className="mv-gov-sem-luz" aria-hidden /><small>Qualquer outra situação</small></div>
        <div className="mv-gov-sem-chips">
          <span>Pendente de regularização</span><span>Suspensa</span><span>Cancelada</span><span>Titular falecido</span><span>Nula</span>
        </div>
        <span className="mv-gov-sem-tx">Cada uma tem um motivo e um caminho diferentes. Não é você quem resolve.</span>
        <span className="mv-gov-sem-acao"><b>O que fazer:</b> salvar o comprovante como veio e levar ao gestor antes de seguir. Não explique nem tente resolver com o cliente.</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ 13. tela da consulta do CPF */
export function TelaConsultaCpf() {
  return (
    <Print endereco="servicos.receita.fazenda.gov.br"
      legenda="Consulta pública da Receita Federal, com dados de exemplo. Os números batem com os passos.">
      <div className="mv-gov-rf">
        <div className="mv-gov-rf-topo"><b>Receita Federal</b><span>Consulta pública</span></div>
        <div className="mv-gov-rf-corpo">
          <div className="mv-gov-rf-linha"><span className="mv-gov-rf-tit">Comprovante de Situação Cadastral no CPF</span><i className="mv-gov-marca num">1</i></div>
          <div className="mv-gov-rf-campo">
            <small>CPF</small>
            <div className="mv-gov-rf-linha"><span className="mv-gov-rf-in num">000.000.000-00</span><i className="mv-gov-marca num">2</i></div>
          </div>
          <div className="mv-gov-rf-campo">
            <small>Data de nascimento</small>
            <div className="mv-gov-rf-linha"><span className="mv-gov-rf-in num">15/03/1958</span><i className="mv-gov-marca num">3</i></div>
          </div>
          <div className="mv-gov-rf-linha">
            <span className="mv-gov-rf-cap"><span className="mv-gov-rf-chk"><IcCheck /></span>Sou humano</span>
            <i className="mv-gov-marca num">4</i>
          </div>
          <div className="mv-gov-rf-linha"><span className="mv-gov-rf-btn">Consultar</span><i className="mv-gov-marca num">5</i></div>
        </div>
      </div>
    </Print>
  );
}

/* ------------------------------------------------------------ 14. comprovante do CPF */
export function ComprovanteCpf() {
  const d = new Date();
  const hoje = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  const linhas: LinhaPapel[] = [
    { k: 'cab', t: 'RECEITA FEDERAL' },
    { k: 'tit', t: 'Comprovante de Situação Cadastral no CPF' },
    { k: 'campo', r: 'Nº do CPF', v: '000.000.000-00' },
    { k: 'campo', r: 'Nome', v: 'MARIA DA SILVA', pino: 1 },
    { k: 'campo', r: 'Data de nascimento', v: '15/03/1958' },
    { k: 'campo', r: 'Situação cadastral', v: 'REGULAR', pino: 2, destaque: true },
    { k: 'campo', r: 'Data da inscrição', v: '12/06/1979' },
    { k: 'campo', r: 'Dígito verificador', v: '00' },
    { k: 'rodape', t: `Comprovante emitido às 10:42:15 do dia ${hoje}`, pino: 3 },
    { k: 'rodape', t: 'Código de controle do comprovante: XXXX.XXXX.XXXX.XXXX', pino: 4 },
  ];
  const pinos: PinoInfo[] = [
    { n: 1, t: 'Nome e CPF', d: 'Confira se é o cliente certo. Um número digitado errado traz outra pessoa ou dá erro.' },
    { n: 2, t: 'Situação cadastral', d: 'A linha que importa. REGULAR: segue. Qualquer outra palavra: leve ao gestor.' },
    { n: 3, t: 'Data e hora da emissão', d: 'Mostra quando a consulta foi feita. É o que deixa claro que o comprovante é recente.' },
    { n: 4, t: 'Código de controle', d: 'Serve para conferir, no site da Receita, que o comprovante é verdadeiro. Você não precisa fazer nada com ele.' },
  ];
  return (
    <Figura legenda="O comprovante de situação cadastral, com dados de exemplo. Toque nos números para ver o que conferir.">
      <Papel nome="comprovante de situação cadastral no CPF" linhas={linhas} pinos={pinos} lado />
    </Figura>
  );
}

/* ------------------------------------------------------------ 15. árvore de decisão */
type NoArv = 'p1' | 'acesso' | 'p2' | 'dec' | 'sem' | 'p3' | 'fim';
type ArestaId = 'e1' | 'e2' | 'e3' | 'e4' | 'e5' | 'e6' | 'e7' | 'e8';
const ALT_NO = 62;
const NOS_ARV: { id: NoArv; x: number; y: number; w: number; tag: string; t: string; tipo: 'perg' | 'acao' | 'fim' | 'pare' }[] = [
  { id: 'p1', x: 255, y: 10, w: 250, tag: 'COMEÇO', t: 'Conseguiu entrar no Meu IR?', tipo: 'perg' },
  { id: 'acesso', x: 540, y: 10, w: 200, tag: 'PARE', t: 'Problema de acesso', tipo: 'pare' },
  { id: 'p2', x: 255, y: 120, w: 250, tag: 'EM CADA ANO', t: 'Aparece declaração no ano?', tipo: 'perg' },
  { id: 'dec', x: 40, y: 230, w: 250, tag: 'DECLAROU', t: 'Print + DEC + REC', tipo: 'acao' },
  { id: 'sem', x: 470, y: 230, w: 250, tag: 'NÃO DECLAROU', t: 'Só o print da tela', tipo: 'acao' },
  { id: 'p3', x: 255, y: 340, w: 250, tag: 'CONFERIR', t: 'Já fez os 3 anos?', tipo: 'perg' },
  { id: 'fim', x: 540, y: 340, w: 200, tag: 'PRONTO', t: 'Situação do CPF', tipo: 'fim' },
];
const ARESTAS_ARV: { id: ArestaId; d: string; para: NoArv; rot?: string; lx?: number; ly?: number; anc?: 'start' | 'middle' }[] = [
  { id: 'e1', d: 'M380,72 L380,116', para: 'p2', rot: 'Sim', lx: 388, ly: 99, anc: 'start' },
  { id: 'e2', d: 'M505,41 L536,41', para: 'acesso', rot: 'Não', lx: 520, ly: 33, anc: 'middle' },
  { id: 'e3', d: 'M330,182 L330,205 L165,205 L165,226', para: 'dec', rot: 'Sim, tem', lx: 247, ly: 198, anc: 'middle' },
  { id: 'e4', d: 'M430,182 L430,205 L595,205 L595,226', para: 'sem', rot: 'Não tem', lx: 512, ly: 198, anc: 'middle' },
  { id: 'e5', d: 'M165,292 L165,315 L330,315 L330,336', para: 'p3' },
  { id: 'e6', d: 'M595,292 L595,315 L430,315 L430,336', para: 'p3' },
  { id: 'e7', d: 'M505,371 L536,371', para: 'fim', rot: 'Sim', lx: 520, ly: 363, anc: 'middle' },
  { id: 'e8', d: 'M255,371 L20,371 L20,151 L251,151', para: 'p2', rot: 'Não: próximo ano', lx: 138, ly: 363, anc: 'middle' },
];

/** Árvore "o cliente declara IR?": responda no painel e veja o caminho acender, ano por ano. */
export function ArvoreIR() {
  const A = anoAtual();
  const s = 'mv-gov-s3';
  const [no, setNo] = useState<NoArv>('p1');
  const [trilha, setTrilha] = useState<ArestaId[]>([]);
  const [anos, setAnos] = useState<('dec' | 'sem')[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);

  const tomadas = new Set<ArestaId>(trilha);
  const visitados = new Set<NoArv>(['p1', ...trilha.map((e) => ARESTAS_ARV.find((a) => a.id === e)?.para ?? 'p1')]);
  const comecou = trilha.length > 0;

  function ir(e: ArestaId) {
    const a = ARESTAS_ARV.find((x) => x.id === e);
    if (!a) return;
    setTrilha((t) => [...t, e]);
    setNo(a.para);
    setAviso(null);
  }
  function recomecar() { setNo('p1'); setTrilha([]); setAnos([]); setAviso(null); }

  const anoDaVez = no === 'p2' ? anos.length : Math.max(anos.length - 1, 0);
  const exercicio = A - anoDaVez;
  const totalArqs = anos.reduce((t, x) => t + (x === 'dec' ? 3 : 1), 0);

  let painel: { tom?: 'verde' | 'ambar'; passo: string; titulo: string; texto: string; ops: ReactNode };
  if (no === 'p1') {
    painel = {
      passo: 'Começo', titulo: 'Você (ou o cliente) conseguiu entrar no Meu Imposto de Renda?',
      texto: 'É o mesmo acesso do Meu INSS: CPF e senha do gov.br.',
      ops: <>
        <button type="button" className="mv-gov-btn" data-tom="azul" onClick={() => ir('e1')}>Sim, entrei</button>
        <button type="button" className="mv-gov-btn" onClick={() => ir('e2')}>Não consegui</button>
      </>,
    };
  } else if (no === 'acesso') {
    painel = {
      tom: 'ambar', passo: 'Pare aqui', titulo: 'Resolva o acesso antes',
      texto: 'Confira se o CPF e a senha estão certos e se a conta é de quem recebe o benefício. Se o gov.br pedir um nível maior de conta, o cliente precisa subir para prata ou ouro (veja a lição 13). Continua travado? Leve ao gestor. Não fique tentando a senha várias vezes.',
      ops: null,
    };
  } else if (no === 'p2') {
    painel = {
      passo: `Ano ${anos.length + 1} de 3 · Exercício ${exercicio}`, titulo: 'Neste ano, aparece uma declaração?',
      texto: 'Olhe a tela do ano aberto: ou aparece a declaração (com a opção de baixar a declaração e o recibo), ou aparece que não há declaração.',
      ops: <>
        <button type="button" className="mv-gov-btn" data-tom="azul" onClick={() => { setAnos((x) => [...x, 'dec']); ir('e3'); }}>Sim, tem declaração</button>
        <button type="button" className="mv-gov-btn" onClick={() => { setAnos((x) => [...x, 'sem']); ir('e4'); }}>Não tem declaração</button>
      </>,
    };
  } else if (no === 'dec') {
    painel = {
      passo: `Ano ${anoDaVez + 1} de 3 · Exercício ${exercicio}`, titulo: 'Print + DEC + REC',
      texto: 'Tire o print da tela do ano, baixe a declaração (DEC) e baixe o recibo (REC). São 3 arquivos deste ano.',
      ops: <button type="button" className="mv-gov-btn" data-tom="azul" onClick={() => ir('e5')}>Feito: print, DEC e REC</button>,
    };
  } else if (no === 'sem') {
    painel = {
      passo: `Ano ${anoDaVez + 1} de 3 · Exercício ${exercicio}`, titulo: 'Só o print da tela',
      texto: 'Tire o print da tela mostrando que não há declaração neste ano. Sem DEC e sem REC: 1 arquivo.',
      ops: <button type="button" className="mv-gov-btn" data-tom="azul" onClick={() => ir('e6')}>Feito: print tirado</button>,
    };
  } else if (no === 'p3') {
    painel = {
      passo: 'Conferir', titulo: 'Já fez os 3 anos?',
      texto: `Até agora: ${anos.length} de 3 anos.`,
      ops: <>
        <button type="button" className="mv-gov-btn" data-tom="azul" onClick={() => (anos.length < 3
          ? setAviso(`Ainda não: você fez ${anos.length} de 3. Parar antes dos 3 anos é um erro comum nesta etapa.`)
          : ir('e7'))}>Sim, os 3</button>
        <button type="button" className="mv-gov-btn" onClick={() => (anos.length >= 3
          ? setAviso('Você já passou pelos 3 anos. Pode concluir.')
          : ir('e8'))}>Não, falta ano</button>
      </>,
    };
  } else {
    painel = {
      tom: 'verde', passo: 'Pronto', titulo: 'Imposto de renda completo',
      texto: `${totalArqs} arquivos no total. Agora, a situação cadastral do CPF, no site da Receita Federal.`,
      ops: null,
    };
  }

  return (
    <div className="mv-gov-arv">
      <figure className="vidro mv-gov-arv-fig">
        <div className="mv-gov-rola">
          <svg className="mv-gov-svg" viewBox="0 0 760 412" role="img"
            aria-label="Árvore de decisão do imposto de renda. Começo: conseguiu entrar no Meu Imposto de Renda? Não: problema de acesso, pare e resolva. Sim: em cada ano, aparece declaração? Sim, tem: print, DEC e REC. Não tem: só o print da tela. Depois, conferir: já fez os 3 anos? Não: volte para o próximo ano. Sim: pronto, siga para a situação do CPF.">
            <Setas id={s} />
            {ARESTAS_ARV.map((a) => {
              const on = tomadas.has(a.id);
              return (
                <g key={a.id} className="mv-gov-ar" data-on={on ? '' : undefined} data-apagado={comecou && !on ? '' : undefined}>
                  <path d={a.d} markerEnd={`url(#${s}-${on ? 'azul' : 'n'})`} />
                  {a.rot && <text x={a.lx} y={a.ly} textAnchor={a.anc}>{a.rot}</text>}
                </g>
              );
            })}
            {NOS_ARV.map((n) => {
              const estado = n.id === no ? 'atual' : visitados.has(n.id) ? 'feito' : comecou ? 'apagado' : undefined;
              const cx = n.x + n.w / 2;
              return (
                <g key={n.id} className="mv-gov-no" data-tipo={n.tipo} data-estado={estado}>
                  <rect x={n.x} y={n.y} width={n.w} height={ALT_NO} rx="12" />
                  <text className="mv-gov-no-tag" x={cx} y={n.y + 24} textAnchor="middle">{n.tag}</text>
                  <text className="mv-gov-no-t" x={cx} y={n.y + 46} textAnchor="middle">{n.t}</text>
                </g>
              );
            })}
          </svg>
        </div>
      </figure>

      <div className="vidro mv-gov-arv-painel" data-tom={painel.tom} aria-live="polite">
        <span className="mv-gov-arv-passo">{painel.passo}</span>
        <span className="mv-gov-arv-p">{painel.titulo}</span>
        <span className="mv-gov-arv-dica">{painel.texto}</span>
        {aviso && <span className="mv-gov-arv-aviso" role="status">{aviso}</span>}
        {painel.ops && <div className="mv-gov-arv-ops">{painel.ops}</div>}
        <div className="mv-gov-arv-anos" aria-label="Situação de cada ano">
          {[0, 1, 2].map((k) => (
            <span key={k} data-st={anos[k]}>
              Exercício {A - k}: {anos[k] === 'dec' ? 'print + DEC + REC' : anos[k] === 'sem' ? 'só o print' : 'falta'}
            </span>
          ))}
        </div>
        <div className="mv-gov-arv-pe">
          <span>{comecou ? 'Teste os caminhos: com declaração, sem declaração e misturado.' : 'Escolha a resposta para ver o caminho acender.'}</span>
          {comecou && <button type="button" className="mv-link" onClick={recomecar}>Recomeçar</button>}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ 16. checklist */
const CHECK: { g: string; itens: string[] }[] = [
  {
    g: 'Imposto de renda',
    itens: [
      'Entrei no Meu Imposto de Renda (o cliente, ou eu com o acesso que ele passou)',
      'Print do exercício mais recente',
      'Print do segundo exercício',
      'Print do terceiro exercício',
      'Em cada ano com declaração: DEC e REC',
      'Conferi o exercício escrito em cada arquivo',
    ],
  },
  {
    g: 'Situação cadastral do CPF',
    itens: [
      'Consulta feita no site oficial da Receita (endereço .gov.br)',
      'CPF e data de nascimento conferidos com o documento',
      'Situação REGULAR (se não, gestor avisado)',
      'Comprovante salvo em PDF ou print',
    ],
  },
  {
    g: 'Antes de seguir',
    itens: [
      'Arquivos legíveis e guardados onde o gestor orientou',
      'Se entrei com a senha do cliente: ajudei o cliente a trocar a senha',
    ],
  },
];
export function ChecklistGov() {
  const [feitos, setFeitos] = useState<Set<string>>(() => new Set());
  const total = CHECK.reduce((s, g) => s + g.itens.length, 0);
  function alternar(k: string) {
    setFeitos((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  }
  return (
    <div className="mv-check">
      <div className="vidro mv-check-topo">
        <div className="mv-per-prog">
          <span className="num">{feitos.size} de {total} itens</span>
          <div aria-hidden><i style={{ width: `${(feitos.size / total) * 100}%` }} /></div>
        </div>
        <button type="button" className="mv-link" onClick={() => setFeitos(new Set())}>Limpar</button>
      </div>
      <div className="mv-gov-ck-grade">
        {CHECK.map((g) => (
          <div key={g.g} className="vidro mv-check-grupo">
            <h4>{g.g}</h4>
            {g.itens.map((it) => {
              const k = `${g.g}|${it}`;
              const on = feitos.has(k);
              return (
                <button key={k} type="button" className="mv-check-it" aria-pressed={on} onClick={() => alternar(k)}>
                  <span className="mv-per-chk" aria-hidden>{on && <IcCheck />}</span>{it}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      {feitos.size === total && (
        <div className="mv-gov-ck-fim" role="status"><IcCheck /> Etapa do gov.br completa. Siga com o bloco que ainda faltar.</div>
      )}
    </div>
  );
}
