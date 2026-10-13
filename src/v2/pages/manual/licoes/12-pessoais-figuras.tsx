/* Lição 12 — ilustrações e treinos próprios (prefixo mv-dp-): o pacote dos
   documentos pessoais, a identidade ilustrada (RG/CNH, frente e verso), a
   grade de fotos boa × ruim com diagnóstico, a posição do celular, o guia da
   foto do rosto, a conta de luz ilustrada, a calculadora do mês do
   comprovante, o treino "serve ou não serve?", o comprovante de outra pessoa,
   a árvore de decisão do comprovante, a anatomia e o conferidor de e-mail, os
   pedidos por documento e o checklist.
   TODOS os documentos desenhados aqui são fictícios, com dados de exemplo.
   Estilos em 12-pessoais.css. */
import { Fragment, useMemo, useState } from 'react';
import { BomRuim, copiar, Figura, IcCheck, IcX, Lista } from '../pecas';
import { hojeMesAno } from '../ilustracoes';
import { MESES, MESES_CURTOS, type MesAno } from '../periodos';

/* ===================================================================== utilidades */
function BotaoCopiar({ texto, rotulo = 'Copiar' }: { texto: string; rotulo?: string }) {
  const [ok, setOk] = useState(false);
  async function aoCopiar() {
    if (await copiar(texto)) { setOk(true); window.setTimeout(() => setOk(false), 1600); }
  }
  return (
    <button type="button" className="mv-dp-copiar" onClick={aoCopiar}>
      {ok ? <><Ok />Copiado</> : rotulo}
    </button>
  );
}
/** Marcador numerado em cima de um ponto do "papel" ilustrado. */
const Pino = ({ n }: { n: number }) => <span className="mv-dp-pino" aria-hidden>{n}</span>;
/** O mesmo número, na legenda ao lado. */
const Num = ({ n }: { n: number }) => <span className="mv-dp-num" aria-hidden>{n}</span>;

/** Ícone pequeno de certo/errado com tamanho travado (o manual.css estica todo svg dentro de Figura). */
const Ok = () => <span className="mv-dp-i" aria-hidden><IcCheck /></span>;
const Nao = () => <span className="mv-dp-i" aria-hidden><IcX /></span>;

type Ic = 'id' | 'rosto' | 'conta' | 'email' | 'decl' | 'lista';
/** Traços dos ícones (grade 24×24). */
function IconeTracos({ ic }: { ic: Ic }) {
  return (
    <>
      {ic === 'id' && <><rect x="2.5" y="5" width="19" height="14" rx="2.2" /><circle cx="8" cy="10.8" r="2.2" /><path d="M4.8 16.2c1-1.8 5.4-1.8 6.4 0M13.5 10h5M13.5 13.5h5" /></>}
      {ic === 'rosto' && <><circle cx="12" cy="9" r="4" /><path d="M4.5 20.5c1.5-4.2 13.5-4.2 15 0" /></>}
      {ic === 'conta' && <><path d="M6 3h9l4 4v14H6z" /><path d="M15 3v4h4M9 11h7M9 14.5h7M9 18h4" /></>}
      {ic === 'email' && <><rect x="3" y="5.5" width="18" height="13" rx="2" /><path d="M3.5 7l8.5 6.5L20.5 7" /></>}
      {ic === 'decl' && <><path d="M6 3h12v18H6z" /><path d="M9 7.5h6M9 11h6M9 15.5c1.2-1.6 2.2 1.6 3.4 0s2.2 1.2 2.6.4" /></>}
      {ic === 'lista' && <><path d="M9 6h11M9 12h11M9 18h11" /><path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2" /></>}
    </>
  );
}
/** Ícone de traço na cor do texto em volta (o tamanho vem do CSS de cada lugar). */
function Icone({ ic }: { ic: Ic }) {
  return (
    <svg className="mv-dp-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <IconeTracos ic={ic} />
    </svg>
  );
}

/* ===================================================================== 1. o pacote */
const PACOTE: { t: string; s: string; tom: string; ic: Ic }[] = [
  { t: 'RG ou CNH', s: 'frente e verso', tom: 'azul', ic: 'id' },
  { t: 'Foto do rosto', s: 'de frente, com luz', tom: 'verde', ic: 'rosto' },
  { t: 'Comprovante', s: 'mês atual ou passado', tom: 'ambar', ic: 'conta' },
  { t: 'E-mail', s: 'do uso do cliente', tom: 'neutro', ic: 'email' },
];
const DEPOIS = ['Cadastro no admin', 'Procurações', 'Assinatura gov.br'];
/** Seta do esquema (aponta para a direita; no celular o CSS gira para baixo). */
const Seta = ({ baixo }: { baixo?: boolean }) => (
  <svg className="mv-dp-pk-seta" data-baixo={baixo ? '' : undefined} viewBox="0 0 28 16" aria-hidden>
    <path d="M2 8 H22" /><path d="M18 3.5 L24.5 8 L18 12.5" />
  </svg>
);

/* Feito em HTML (e não SVG) para o texto não encolher no celular. */
export function PacoteDocumentos() {
  return (
    <Figura tag="Esquema" legenda="Os quatro documentos pessoais. Conferidos, junto com os documentos do Meu INSS e do gov.br, eles permitem cadastrar o cliente no sistema admin, que gera as procurações para a assinatura pelo gov.br.">
      <div className="mv-dp-pk">
        <div className="mv-dp-pk-docs">
          {PACOTE.map((d) => (
            <div key={d.t} className="mv-dp-pk-card" data-tom={d.tom}>
              <span className="mv-dp-pk-icf"><Icone ic={d.ic} /></span>
              <b>{d.t}</b>
              <small>{d.s}</small>
            </div>
          ))}
        </div>
        <Seta />
        <div className="mv-dp-pk-meio">
          <div className="mv-dp-pk-centro"><b>Você confere</b><small>os quatro, um a um</small></div>
          <span className="mv-dp-pk-nota">Faltou um? Peça antes de seguir.</span>
        </div>
        <Seta />
        <div className="mv-dp-pk-depois">
          <span className="mv-dp-pk-nota">Depois</span>
          {DEPOIS.map((t, i) => (
            <Fragment key={t}>
              <span className="mv-dp-pk-chip">{t}</span>
              {i < DEPOIS.length - 1 && <Seta baixo />}
            </Fragment>
          ))}
        </div>
      </div>
    </Figura>
  );
}

/* ===================================================================== 2. identidade ilustrada */
const Silhueta = () => (
  <svg viewBox="0 0 60 80" aria-hidden>
    <rect className="mv-dp-silh-f" width="60" height="80" />
    <circle className="mv-dp-silh" cx="30" cy="30" r="13" />
    <path className="mv-dp-silh" d="M6 80 C8 56 52 56 54 80 Z" />
  </svg>
);
const Rubrica = () => (
  <svg viewBox="0 0 140 30" preserveAspectRatio="xMinYMid meet" aria-hidden>
    <path className="mv-dp-rubrica" d="M4 22 C12 4 18 30 28 14 S44 6 50 20 S66 26 78 10 S96 18 104 16 S122 12 134 18" />
  </svg>
);
const Digital = () => (
  <svg viewBox="0 0 46 54" aria-hidden>
    {[[16, 22], [12, 17], [8, 12], [4, 7]].map(([rx, ry]) => (
      <ellipse key={rx} className="mv-dp-digital" cx="23" cy="27" rx={rx} ry={ry} />
    ))}
  </svg>
);
function Campo({ l, v, largo, pino }: { l: string; v: string; largo?: boolean; pino?: number }) {
  return (
    <span className="mv-dp-campo" data-largo={largo ? '' : undefined}>
      <small>{l}</small><b>{v}</b>
      {pino && <Pino n={pino} />}
    </span>
  );
}

export function IdentidadeIlustrada() {
  const [tipo, setTipo] = useState<'rg' | 'cnh'>('rg');
  const rg = tipo === 'rg';
  const cab = (
    <span className="mv-dp-papel-cab">
      <b>{rg ? 'CARTEIRA DE IDENTIDADE' : 'CARTEIRA DE HABILITAÇÃO'}</b>
      <small>MODELO ILUSTRATIVO · SEM VALOR</small>
    </span>
  );
  return (
    <Figura legenda="Documento fictício, desenhado só para estudo. Os dados são de exemplo, e o modelo real muda conforme o estado e o ano de emissão.">
      <div className="mv-dp-id">
        <div className="mv-dp-seg" role="group" aria-label="Qual documento mostrar">
          <button type="button" aria-pressed={rg} onClick={() => setTipo('rg')}>RG (carteira de identidade)</button>
          <button type="button" aria-pressed={!rg} onClick={() => setTipo('cnh')}>CNH (carteira de motorista)</button>
        </div>
        <div className="mv-dp-id-lados">
          <div className="mv-dp-id-lado">
            <span className="mv-dp-id-rot">Foto 1 · frente</span>
            <div className="mv-dp-papel" data-tipo={tipo}>
              {cab}
              {rg ? (
                <span className="mv-dp-frente">
                  <span className="mv-dp-foto3x4"><Silhueta /><Pino n={1} /></span>
                  <span className="mv-dp-coluna">
                    <span className="mv-dp-campo mv-dp-ass"><small>ASSINATURA DO TITULAR</small><Rubrica /><Pino n={3} /></span>
                    <span className="mv-dp-campo mv-dp-polegar"><small>POLEGAR DIREITO</small><Digital /></span>
                  </span>
                </span>
              ) : (
                <span className="mv-dp-frente">
                  <span className="mv-dp-foto3x4"><Silhueta /><Pino n={1} /></span>
                  <span className="mv-dp-campos">
                    <Campo l="NOME" v="MARIA DA SILVA (EXEMPLO)" largo pino={2} />
                    <Campo l="NASCIMENTO" v="01/01/1958" />
                    <Campo l="CPF" v="000.000.000-00" />
                    <Campo l="Nº REGISTRO" v="00000000000" />
                    <Campo l="VALIDADE" v="00/00/0000" />
                    <span className="mv-dp-campo mv-dp-ass" data-largo=""><small>ASSINATURA DO PORTADOR</small><Rubrica /><Pino n={3} /></span>
                  </span>
                </span>
              )}
              <span className="mv-dp-marca" aria-hidden>EXEMPLO</span>
            </div>
          </div>
          <div className="mv-dp-id-lado">
            <span className="mv-dp-id-rot">Foto 2 · verso</span>
            <div className="mv-dp-papel" data-tipo={tipo}>
              {cab}
              {rg ? (
                <span className="mv-dp-campos">
                  <Campo l="NOME" v="MARIA DA SILVA (EXEMPLO)" largo pino={2} />
                  <Campo l="FILIAÇÃO" v="JOSÉ DA SILVA · ANA DA SILVA" largo />
                  <Campo l="NASCIMENTO" v="01/01/1958" />
                  <Campo l="NATURALIDADE" v="CIDADE EXEMPLO" />
                  <Campo l="REGISTRO GERAL" v="00.000.000-0" />
                  <Campo l="CPF" v="000.000.000-00" />
                </span>
              ) : (
                <span className="mv-dp-campos">
                  <Campo l="OBSERVAÇÕES" v="— (EXEMPLO)" largo />
                  <Campo l="LOCAL DE EMISSÃO" v="CIDADE EXEMPLO" />
                  <Campo l="DATA DE EMISSÃO" v="00/00/0000" />
                  <Campo l="CÓDIGO DO DOCUMENTO" v="0000000000" largo />
                </span>
              )}
              <span className="mv-dp-marca" aria-hidden>EXEMPLO</span>
            </div>
          </div>
        </div>
        <ol className="mv-dp-id-leg">
          <li><Num n={1} /><span><b>Foto da pessoa</b>Inteira, sem brilho e sem dedo na frente. É ela que mostra quem é o dono do documento.</span></li>
          <li><Num n={2} /><span><b>Dados</b>Nome, nascimento e números. O nome tem que ser o mesmo que o cliente informou.</span></li>
          <li><Num n={3} /><span><b>Assinatura</b>Faz parte do documento e também precisa aparecer na foto.</span></li>
        </ol>
        <span className="mv-dp-obs">
          Repare: troque entre RG e CNH e veja que as informações mudam de lado. Por isso a regra é a mesma para os
          dois: <b>sempre duas fotos, frente e verso</b>.
        </span>
      </div>
    </Figura>
  );
}

/* ===================================================================== 3. foto boa × ruim */
type Problema = 'boa' | 'cortada' | 'escura' | 'reflexo' | 'tremida' | 'lado';
const FOTOS: { id: Problema; rotulo: string; curta: string; causa: string; porque: string; pedido: string }[] = [
  {
    id: 'boa', rotulo: 'Boa', curta: 'Inteira, nítida, com luz',
    causa: 'O documento aparece inteiro (as quatro pontas), as letras estão nítidas, a luz é boa e não tem brilho em cima de nada.',
    porque: 'Dá para ler cada número e cada letra sem esforço. É assim que queremos todas as fotos.',
    pedido: 'Ficou ótima, obrigado! Agora, por favor, me mande a foto do outro lado do documento (o verso), do mesmo jeitinho.',
  },
  {
    id: 'cortada', rotulo: 'Cortada', curta: 'Faltou um pedaço',
    causa: 'O celular estava perto demais ou torto, e uma parte do documento ficou de fora.',
    porque: 'A parte cortada pode ser justamente o número, a data ou o nome. Documento pela metade não serve.',
    pedido: 'A foto chegou com um pedacinho cortado. Pode tirar de novo, um pouco mais de longe, para aparecer o documento inteiro? Pode deixar um pouquinho da mesa aparecendo em volta.',
  },
  {
    id: 'escura', rotulo: 'Escura', curta: 'Pouca luz',
    causa: 'A foto foi tirada num lugar escuro ou à noite, com luz fraca.',
    porque: 'No escuro, as letras pequenas somem e os números se confundem.',
    pedido: 'A foto ficou um pouco escura e não estou conseguindo ler. Pode tirar de novo perto de uma janela, com a luz do dia? Fica bem melhor.',
  },
  {
    id: 'reflexo', rotulo: 'Com reflexo', curta: 'Brilho em cima',
    causa: 'O flash estava ligado ou o documento estava dentro do plástico, e a luz bateu e voltou.',
    porque: 'Onde tem brilho, a informação some. E o brilho costuma cair bem em cima da foto ou de um número.',
    pedido: 'Apareceu um brilho em cima do documento. Pode tirar ele do plástico, desligar o flash e fotografar de novo? Se o brilho continuar, é só mudar o documento um pouquinho de lugar.',
  },
  {
    id: 'tremida', rotulo: 'Tremida', curta: 'Borrada',
    causa: 'A mão mexeu na hora da foto, ou a câmera não teve tempo de focar.',
    porque: 'Letra borrada não dá para ler com segurança: um 3 vira 8, um 1 vira 7.',
    pedido: 'A foto ficou um pouquinho tremida. Pode tirar de novo apoiando os cotovelos na mesa? Antes de apertar, toque na tela em cima do documento e espere um segundinho até a imagem ficar firme.',
  },
  {
    id: 'lado', rotulo: 'Só um lado', curta: 'Faltou o verso',
    causa: 'O cliente mandou só a frente (ou só o verso) e achou que já estava completo.',
    porque: 'As informações ficam espalhadas pelos dois lados. Com um lado só, o documento está incompleto.',
    pedido: 'Recebi a frente, obrigado! Agora só falta virar o documento e mandar a foto do outro lado (o verso).',
  },
];
function MiniDoc({ fantasma }: { fantasma?: boolean }) {
  return (
    <span className="mv-dp-md" data-fantasma={fantasma ? '' : undefined}>
      <span className="mv-dp-md-cab" />
      <span className="mv-dp-md-corpo">
        <span className="mv-dp-md-foto" />
        <span className="mv-dp-md-linhas"><i /><i /><i /><i /></span>
      </span>
    </span>
  );
}

export function GradeFotos() {
  const [sel, setSel] = useState<Problema>('boa');
  const f = FOTOS.find((x) => x.id === sel) ?? FOTOS[0];
  const ok = f.id === 'boa';
  return (
    <Figura legenda="Clique em cada foto para ver o que aconteceu e como pedir de novo. Documento fictício, desenhado para estudo.">
      <div className="mv-dp-fotos">
        <div className="mv-dp-fotos-grade" role="group" aria-label="Exemplos de foto do documento">
          {FOTOS.map((x) => (
            <button key={x.id} type="button" className="mv-dp-ft" data-ok={x.id === 'boa' ? '' : undefined}
              aria-pressed={sel === x.id} onClick={() => setSel(x.id)}>
              <span className="mv-dp-ft-quadro" data-efeito={x.id} aria-hidden>
                <MiniDoc />
                {x.id === 'tremida' && <MiniDoc fantasma />}
                {x.id === 'reflexo' && <span className="mv-dp-ft-brilho" />}
                {x.id === 'lado' && <span className="mv-dp-ft-falta">verso?</span>}
              </span>
              <span className="mv-dp-ft-rot">
                {x.id === 'boa' ? <Ok /> : <Nao />}
                <b>{x.rotulo}</b>
                <small>{x.curta}</small>
              </span>
            </button>
          ))}
        </div>
        <div className="mv-dp-ft-det" data-ok={ok ? '' : undefined} aria-live="polite">
          <span className="mv-dp-ft-tit">{ok ? <Ok /> : <Nao />}Foto {f.rotulo.toLowerCase()}{ok ? ': pode seguir' : ': peça outra'}</span>
          <dl>
            <div><dt>O que aconteceu</dt><dd>{f.causa}</dd></div>
            <div><dt>{ok ? 'Por que serve' : 'Por que atrapalha'}</dt><dd>{f.porque}</dd></div>
          </dl>
          <span className="mv-dp-ft-msg">
            <small>{ok ? 'Responda assim' : 'Peça de novo assim'} · sugestão de roteiro, adapte ao cliente</small>
            <span className="mv-dp-bolha">{f.pedido}</span>
            <BotaoCopiar texto={f.pedido} rotulo="Copiar mensagem" />
          </span>
        </div>
      </div>
    </Figura>
  );
}

/* ===================================================================== 4. posição do celular */
export function PosicaoCelular() {
  return (
    <BomRuim
      ruim={{
        titulo: 'Assim, não',
        corpo: (
          <>
            <svg className="mv-dp-pc" viewBox="0 0 340 186" role="img"
              aria-label="Desenho de lado: celular inclinado sobre o documento, com o flash ligado fazendo um brilho e uma sombra em cima do papel.">
              <rect className="mv-dp-pc-mesa" x="10" y="160" width="320" height="10" rx="3" />
              <rect className="mv-dp-pc-doc" x="110" y="152" width="150" height="8" rx="2" />
              <ellipse className="mv-dp-pc-sombra" cx="146" cy="152" rx="32" ry="4" />
              <ellipse className="mv-dp-pc-brilho" cx="214" cy="152" rx="24" ry="5" />
              <g transform="rotate(-32 200 80)"><rect className="mv-dp-pc-cel" x="150" y="74" width="100" height="12" rx="4" /></g>
              <path className="mv-dp-pc-vis" d="M172 110 L110 152 M172 110 L260 152" />
              <path className="mv-dp-pc-flash" d="M164 118 l-9 6 M168 122 l-2 10 M160 112 l-11 1 M174 122 l7 7" />
              <text className="mv-dp-pc-t" x="196" y="30" textAnchor="middle">torto e com flash</text>
              <circle className="mv-dp-pc-nao" cx="306" cy="34" r="16" />
              <path className="mv-dp-pc-marca" d="M299.5 27.5 l13 13 M312.5 27.5 l-13 13" />
            </svg>
            <Lista tom="nao" itens={[
              'Celular inclinado: o documento sai torto e cortado',
              'Flash ligado: brilho em cima das letras',
              'Lâmpada ou mão fazendo sombra no papel',
              'Documento na mão, tremendo, ou dentro do plástico',
            ]} />
          </>
        ),
      }}
      bom={{
        titulo: 'Assim',
        corpo: (
          <>
            <svg className="mv-dp-pc" viewBox="0 0 340 186" role="img"
              aria-label="Desenho de lado: celular reto, paralelo à mesa, bem em cima do documento, com luz de uma janela chegando de lado.">
              <rect className="mv-dp-pc-jan" x="14" y="18" width="50" height="74" rx="3" />
              <path className="mv-dp-pc-janl" d="M39 18 V92 M14 55 H64" />
              <text className="mv-dp-pc-t" x="39" y="110" textAnchor="middle">janela</text>
              <path className="mv-dp-pc-luz" d="M66 40 L125 150 M66 60 L150 150 M66 80 L175 150" />
              <rect className="mv-dp-pc-mesa" x="10" y="160" width="320" height="10" rx="3" />
              <rect className="mv-dp-pc-doc" x="110" y="152" width="150" height="8" rx="2" />
              <rect className="mv-dp-pc-cel" x="135" y="58" width="100" height="12" rx="4" />
              <path className="mv-dp-pc-vis" d="M185 70 L110 152 M185 70 L260 152" />
              <text className="mv-dp-pc-t" x="185" y="44" textAnchor="middle">reto, bem em cima</text>
              <circle className="mv-dp-pc-ok" cx="306" cy="34" r="16" />
              <path className="mv-dp-pc-marca" d="M298 34.5 l5.5 5.5 L314 29" />
            </svg>
            <Lista itens={[
              'Celular reto, paralelo à mesa, bem em cima do documento',
              'Luz do dia chegando de lado (perto de uma janela)',
              'Documento fora do plástico, sobre uma mesa lisa',
              'Flash desligado e cotovelos apoiados',
            ]} />
          </>
        ),
      }}
    />
  );
}

/* ===================================================================== 5. foto do rosto */
/** Pessoa fictícia desenhada num quadro de 150×180. `contraluz` cobre a pessoa inteira com uma
    silhueta escura e uniforme (como sai uma foto com a janela atrás: não dá para ver o rosto). */
function Rosto({ contraluz, acessorios }: { contraluz?: boolean; acessorios?: boolean }) {
  const roupa = 'M16 182 C20 136 130 136 134 182 Z';
  return (
    <g className="mv-dp-rosto">
      <path className="mv-dp-r-roupa" d={roupa} />
      <rect className="mv-dp-r-pele" x="63" y="108" width="24" height="28" rx="8" />
      <ellipse className="mv-dp-r-cabelo" cx="75" cy="74" rx="36" ry="42" />
      <ellipse className="mv-dp-r-pele" cx="75" cy="84" rx="30" ry="37" />
      <path className="mv-dp-r-cabelo" d="M45 72 C47 36 103 36 105 72 C96 58 60 56 45 72 Z" />
      <circle className="mv-dp-r-olho" cx="64" cy="84" r="3.2" />
      <circle className="mv-dp-r-olho" cx="86" cy="84" r="3.2" />
      <path className="mv-dp-r-boca" d="M66 103 Q75 110 84 103" />
      {acessorios && (
        <>
          <path className="mv-dp-r-bone" d="M41 66 C41 30 109 30 109 66 Z" />
          <path className="mv-dp-r-bone" d="M96 60 H130 a4 4 0 0 1 0 8 H96 Z" />
          <rect className="mv-dp-r-oculos" x="53" y="77" width="19" height="13" rx="4" />
          <rect className="mv-dp-r-oculos" x="78" y="77" width="19" height="13" rx="4" />
          <path className="mv-dp-r-ponte" d="M72 82 H78" />
        </>
      )}
      {contraluz && (
        <g className="mv-dp-r-sombra">
          <path d={roupa} />
          <rect x="63" y="108" width="24" height="28" rx="8" />
          <ellipse cx="75" cy="74" rx="36" ry="42" />
          <ellipse cx="75" cy="84" rx="30" ry="37" />
        </g>
      )}
    </g>
  );
}
const DICAS_ROSTO = [
  'Rosto inteiro na tela, com um espaço em volta',
  'De frente, olhando para a câmera',
  'Luz no rosto: de dia, virado para a janela',
  'Sem óculos escuros, boné ou chapéu',
  'Fundo simples, como uma parede lisa',
];
const PINOS_ROSTO: [number, number][] = [[188, 104], [80, 168], [202, 172], [98, 120], [78, 62]];
const EXEMPLOS_ROSTO: { id: 'bom' | 'contraluz' | 'cortada' | 'acessorios'; t: string; d: string }[] = [
  { id: 'bom', t: 'Assim', d: 'De frente, com luz, rosto inteiro' },
  { id: 'contraluz', t: 'Contra a luz', d: 'Janela atrás: vira uma sombra, sem rosto' },
  { id: 'cortada', t: 'Cortada', d: 'Metade do rosto fora da foto' },
  { id: 'acessorios', t: 'Rosto escondido', d: 'Óculos escuros e boné' },
];

export function SelfieGuia() {
  return (
    <Figura legenda="Pessoa fictícia, desenhada para estudo. A foto do rosto pode ser uma selfie ou tirada por alguém de casa.">
      <div className="mv-dp-sf">
        <div className="mv-dp-sf-topo">
          <svg className="mv-dp-sf-cel" viewBox="30 0 210 300" role="img"
            aria-label="Celular com a câmera aberta mostrando uma pessoa de frente, dentro de um contorno oval, com cinco pontos numerados das dicas.">
            <rect className="mv-dp-sf-corpo" x="40" y="10" width="190" height="280" rx="26" />
            <rect className="mv-dp-sf-tela" x="52" y="40" width="166" height="236" rx="10" />
            <rect className="mv-dp-sf-notch" x="110" y="20" width="50" height="8" rx="4" />
            <g transform="translate(57 80) scale(1.05)"><Rosto /></g>
            <ellipse className="mv-dp-sf-guia" cx="136" cy="164" rx="52" ry="64" />
            {PINOS_ROSTO.map(([cx, cy], i) => (
              <g key={i} className="mv-dp-sf-pino">
                <circle cx={cx} cy={cy} r="10" />
                <text x={cx} y={cy + 4} textAnchor="middle">{i + 1}</text>
              </g>
            ))}
          </svg>
          <ol className="mv-dp-sf-dicas">
            {DICAS_ROSTO.map((d, i) => <li key={d}><Num n={i + 1} /><span>{d}</span></li>)}
          </ol>
        </div>
        <div className="mv-dp-sf-ex">
          {EXEMPLOS_ROSTO.map((e) => (
            <div key={e.id} className="mv-dp-sf-it" data-ok={e.id === 'bom' ? '' : undefined}>
              <svg viewBox="0 0 150 180" role="img" aria-label={`${e.t}: ${e.d}`}>
                <rect className={e.id === 'contraluz' ? 'mv-dp-sf-claro' : 'mv-dp-sf-fundo'} width="150" height="180" />
                {e.id === 'contraluz' && (
                  <>
                    <rect className="mv-dp-sf-jan" x="18" y="10" width="114" height="96" rx="3" />
                    <path className="mv-dp-sf-jan" d="M75 10 V106 M18 58 H132" />
                    <ellipse className="mv-dp-sf-halo" cx="75" cy="80" rx="46" ry="52" />
                  </>
                )}
                {e.id === 'cortada'
                  ? <g transform="translate(64 -36)"><Rosto /></g>
                  : <Rosto contraluz={e.id === 'contraluz'} acessorios={e.id === 'acessorios'} />}
              </svg>
              <span className="mv-dp-sf-tag">{e.id === 'bom' ? <Ok /> : <Nao />}{e.t}</span>
              <small>{e.d}</small>
            </div>
          ))}
        </div>
      </div>
    </Figura>
  );
}

/* ===================================================================== 6. conta ilustrada */
export function ContaIlustrada() {
  return (
    <Figura legenda="Conta fictícia, desenhada para estudo (no exemplo, estamos em outubro de 2026). Cada empresa organiza a conta do seu jeito: procure estes quatro pontos.">
      <div className="mv-dp-conta-wrap">
        <div className="mv-dp-conta">
          <span className="mv-dp-conta-cab"><b>CONTA DE ENERGIA ELÉTRICA</b><small>EMPRESA FICTÍCIA DE ENERGIA · MODELO ILUSTRATIVO</small></span>
          <span className="mv-dp-conta-grade">
            <span className="mv-dp-conta-c" data-largo="" data-alvo=""><small>TITULAR</small><b>MARIA DA SILVA (EXEMPLO)</b><Pino n={1} /></span>
            <span className="mv-dp-conta-c" data-largo="" data-alvo="">
              <small>ENDEREÇO</small><b>RUA DAS FLORES, 123 · BAIRRO EXEMPLO</b><b>CIDADE EXEMPLO · CEP 00000-000</b><Pino n={2} />
            </span>
            <span className="mv-dp-conta-c" data-alvo=""><small>MÊS DE REFERÊNCIA</small><b>SET/2026</b><Pino n={3} /></span>
            <span className="mv-dp-conta-c" data-alvo=""><small>VENCIMENTO</small><b>20/10/2026</b><Pino n={4} /></span>
            <span className="mv-dp-conta-c"><small>TOTAL A PAGAR</small><b>R$ 98,40</b></span>
            <span className="mv-dp-conta-c">
              <small>CONSUMO</small>
              <span className="mv-dp-conta-graf" aria-hidden>
                {[56, 70, 62, 80, 74, 66].map((h, i) => <i key={i} style={{ height: `${h}%` }} />)}
              </span>
            </span>
          </span>
          <span className="mv-dp-conta-barras" aria-hidden />
          <span className="mv-dp-marca" aria-hidden>EXEMPLO</span>
        </div>
        <ol className="mv-dp-conta-leg">
          <li><Num n={1} /><span><b>Titular da conta</b><span>Em nome de quem está a conta. É o cliente? Se for outra pessoa (pai, mãe, filho), veja mais abaixo o que pedir.</span></span></li>
          <li><Num n={2} /><span><b>Endereço completo</b><span>Rua, número, bairro, cidade e CEP. Tudo tem que dar para ler.</span></span></li>
          <li><Num n={3} /><span><b>Mês de referência</b><span>O mês a que a conta se refere. Às vezes aparece como “referência” ou “mês/ano”.</span></span></li>
          <li><Num n={4} /><span><b>Vencimento</b><span>A data para pagar.</span></span></li>
          <li className="mv-dp-conta-ok"><Ok /><span>Neste exemplo, estamos em outubro de 2026: referência <b>setembro</b> (mês passado) e vencimento <b>outubro</b> (mês atual). As duas datas dentro da regra: <b>serve</b>.</span></li>
        </ol>
      </div>
    </Figura>
  );
}

/* ===================================================================== 7. calculadora do mês do comprovante */
const idxMes = (m: MesAno) => m.ano * 12 + (m.mes - 1);
const deIdx = (i: number): MesAno => ({ mes: (((i % 12) + 12) % 12) + 1, ano: Math.floor(i / 12) });
const nomeMes = (m: MesAno) => `${MESES[m.mes - 1].toLowerCase()} de ${m.ano}`;
type StMes = 'atual' | 'passado' | 'velho' | 'futuro';
const ROTULO_ST: Record<StMes, string> = { atual: 'vale · atual', passado: 'vale · passado', velho: 'atrasado', futuro: 'não chegou' };

export function CalendarioComprovante() {
  const [hoje, setHoje] = useState<MesAno>(hojeMesAno);
  const [conta, setConta] = useState<MesAno>(() => deIdx(idxMes(hojeMesAno()) - 1));
  const h = idxMes(hoje);
  const passado = deIdx(h - 1);
  const dif = h - idxMes(conta);
  const faixa = useMemo(() => Array.from({ length: 8 }, (_, i) => deIdx(h - 6 + i)), [h]);
  const anoBase = hojeMesAno().ano;
  const anosHoje = [anoBase - 1, anoBase, anoBase + 1, anoBase + 2];
  const anosConta = Array.from(new Set([hoje.ano - 2, hoje.ano - 1, hoje.ano, hoje.ano + 1, conta.ano])).sort((a, b) => a - b);
  const st = (m: MesAno): StMes => {
    const d = h - idxMes(m);
    return d === 0 ? 'atual' : d === 1 ? 'passado' : d > 1 ? 'velho' : 'futuro';
  };

  let ver: { tom: 'verde' | 'rubro' | 'ambar'; t: string; d: string };
  if (dif === 0) ver = { tom: 'verde', t: 'Serve', d: `A conta é de ${nomeMes(conta)}: o mês em que estamos.` };
  else if (dif === 1) ver = { tom: 'verde', t: 'Serve', d: `A conta é de ${nomeMes(conta)}: o mês passado.` };
  else if (dif > 1) {
    ver = {
      tom: 'rubro', t: 'Não serve: está atrasada',
      d: `A conta é de ${nomeMes(conta)}, ${dif} meses atrás.${dif % 12 === 0 ? ' Cuidado: é o mesmo mês, mas de outro ano.' : ''} Peça uma de ${nomeMes(hoje)} ou de ${nomeMes(passado)}.`,
    };
  } else {
    ver = { tom: 'ambar', t: 'Confira a data de novo', d: 'Uma conta de um mês que ainda não chegou? Talvez você tenha lido outra data da conta. Na dúvida, mostre ao gestor.' };
  }

  return (
    <div className="vidro mv-dp-cal">
      <div className="mv-dp-cal-topo">
        <div className="mv-dp-cal-campo">
          <span>Mês em que estamos</span>
          <div className="mv-dp-sel">
            <select aria-label="Mês em que estamos" value={hoje.mes} onChange={(e) => setHoje({ ...hoje, mes: Number(e.target.value) })}>
              {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
            <select aria-label="Ano em que estamos" value={hoje.ano} onChange={(e) => setHoje({ ...hoje, ano: Number(e.target.value) })}>
              {anosHoje.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        </div>
        <div className="mv-dp-cal-regra">
          <small>Vale comprovante de</small>
          <b>{nomeMes(hoje)} ou {nomeMes(passado)}</b>
        </div>
      </div>

      <div className="mv-dp-cal-sub">Toque num mês para testar uma conta daquele mês:</div>
      <ol className="mv-dp-faixa" aria-label="Meses perto de hoje">
        {faixa.map((m) => {
          const s = st(m);
          return (
            <li key={idxMes(m)}>
              <button type="button" className="mv-dp-mes" data-st={s} aria-pressed={idxMes(m) === idxMes(conta)} onClick={() => setConta(m)}>
                <b>{MESES_CURTOS[m.mes - 1]}</b>
                <small className="num">{m.ano}</small>
                <em>{ROTULO_ST[s]}</em>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="mv-dp-cal-conta">
        <div className="mv-dp-cal-campo">
          <span>Ou escolha o mês da conta</span>
          <div className="mv-dp-sel">
            <select aria-label="Mês da conta" value={conta.mes} onChange={(e) => setConta({ ...conta, mes: Number(e.target.value) })}>
              {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
            <select aria-label="Ano da conta" value={conta.ano} onChange={(e) => setConta({ ...conta, ano: Number(e.target.value) })}>
              {anosConta.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        </div>
        <div className="mv-dp-cal-ver" data-tom={ver.tom} role="status">
          <span className="mv-dp-cal-ver-ic">{ver.tom === 'verde' ? <Ok /> : <Nao />}</span>
          <span><b>{ver.t}</b><span>{ver.d}</span></span>
        </div>
      </div>
    </div>
  );
}

/* ===================================================================== 8. treino: serve ou não serve? */
type Resp = 'serve' | 'declaracao' | 'nao';
const OPCOES_CL: { r: Resp; t: string }[] = [
  { r: 'serve', t: 'Serve' },
  { r: 'declaracao', t: 'Serve com documento + declaração' },
  { r: 'nao', t: 'Não serve' },
];
const CONTAS_CL: { tipo: string; cor: string; titular: string; ref: string; certo: Resp; porque: string }[] = [
  { tipo: 'Conta de luz', cor: 'luz', titular: 'A própria cliente', ref: 'outubro/2026', certo: 'serve', porque: 'Tipo aceito, no nome da cliente e do mês atual.' },
  { tipo: 'Conta de água', cor: 'agua', titular: 'A própria cliente', ref: 'julho/2026', certo: 'nao', porque: 'Julho está atrasado. Em outubro, só vale outubro ou setembro.' },
  { tipo: 'Conta de internet', cor: 'internet', titular: 'A filha da cliente', ref: 'setembro/2026', certo: 'declaracao', porque: 'Mês certo, mas no nome da filha: precisa do documento com foto da filha e da declaração de residência.' },
  { tipo: 'Conta de TV', cor: 'tv', titular: 'A própria cliente', ref: 'setembro/2026', certo: 'serve', porque: 'Conta de TV também vale, e setembro é o mês passado.' },
  { tipo: 'Conta de luz', cor: 'luz', titular: 'A própria cliente', ref: 'outubro/2025', certo: 'nao', porque: 'É outubro, mas do ano passado. Confira sempre o mês e o ano.' },
  { tipo: 'Conta de telefone', cor: 'tel', titular: 'O pai da cliente', ref: 'agosto/2026', certo: 'nao', porque: 'Agosto está atrasado. A declaração resolve o nome, não a data: peça uma conta de outubro ou setembro.' },
];
const rotuloResp = (r: Resp) => OPCOES_CL.find((o) => o.r === r)?.t ?? '';

export function ClassificaComprovante() {
  const [resp, setResp] = useState<Record<number, Resp>>({});
  const feitos = Object.keys(resp).length;
  const acertos = CONTAS_CL.filter((c, i) => resp[i] === c.certo).length;
  return (
    <Figura legenda="Contas fictícias, com dados de exemplo. No treino, estamos em outubro de 2026.">
      <div className="mv-dp-cl">
        <div className="mv-dp-cl-cab">
          <b>Estamos em outubro de 2026.</b>
          <span>Para cada conta, escolha: serve, serve com documento + declaração, ou não serve.</span>
        </div>
        <div className="mv-dp-cl-grade">
          {CONTAS_CL.map((c, i) => {
            const r = resp[i];
            const respondeu = r !== undefined;
            const certo = r === c.certo;
            return (
              <div key={i} className="mv-dp-cl-it" data-estado={!respondeu ? undefined : certo ? 'certo' : 'errado'}>
                <span className="mv-dp-cl-papel" data-cor={c.cor}>
                  <span className="mv-dp-cl-tipo"><Icone ic="conta" />{c.tipo}</span>
                  <span><small>Titular</small>{c.titular}</span>
                  <span><small>Referência</small>{c.ref}</span>
                </span>
                {!respondeu ? (
                  <span className="mv-dp-cl-bts">
                    {OPCOES_CL.map((o) => (
                      <button key={o.r} type="button" onClick={() => setResp((s) => ({ ...s, [i]: o.r }))}>{o.t}</button>
                    ))}
                  </span>
                ) : (
                  <span className="mv-dp-cl-r">
                    <b>{certo ? 'Acertou.' : `Resposta: ${rotuloResp(c.certo).toLowerCase()}.`}</b> {c.porque}
                  </span>
                )}
              </div>
            );
          })}
        </div>
        {feitos === CONTAS_CL.length && (
          <div className="mv-dp-cl-fim" role="status">
            <b className="num">{acertos} de {CONTAS_CL.length}</b> acertos.
            <button type="button" className="mv-link" onClick={() => setResp({})}>Fazer de novo</button>
          </div>
        )}
      </div>
    </Figura>
  );
}

/* ===================================================================== 9. comprovante de outra pessoa */
const OUTRA: { t: string; d: string; ic: Ic }[] = [
  { t: 'Conta no nome da mãe', d: 'água, luz, internet, telefone ou TV · do mês atual ou do mês passado', ic: 'conta' },
  { t: 'Documento com foto da mãe', d: 'RG ou CNH, frente e verso, como o do cliente', ic: 'id' },
  { t: 'Declaração de residência', d: 'confirma que o cliente mora no endereço da conta', ic: 'decl' },
];
export function OutraPessoa() {
  return (
    <Figura tag="Esquema" legenda="Exemplo com a mãe. Vale igual para pai, filho ou outra pessoa: troque “mãe” por quem está no nome da conta.">
      <div className="mv-dp-op">
        {OUTRA.map((p, i) => (
          <Fragment key={p.t}>
            <div className="mv-dp-op-it">
              <Icone ic={p.ic} />
              <b>{p.t}</b>
              <small>{p.d}</small>
            </div>
            <span className="mv-dp-op-sinal" aria-hidden>{i < OUTRA.length - 1 ? '+' : '='}</span>
          </Fragment>
        ))}
        <div className="mv-dp-op-it" data-fim="">
          <Ok />
          <b>Comprovante aceito</b>
          <small>para o cliente, mesmo sem conta no nome dele</small>
        </div>
      </div>
    </Figura>
  );
}

/* ===================================================================== 10. árvore do comprovante */
type NoId = 'tipo' | 'mes' | 'nome';
type FimId = 'f-tipo' | 'f-atrasado' | 'f-ok' | 'f-outra';
type Destino = NoId | FimId;
const NOS: Record<NoId, { p: string; ajuda: string; sim: Destino; nao: Destino }> = {
  tipo: { p: 'É conta de água, luz, internet, telefone ou TV?', ajuda: 'São os tipos da nossa lista.', sim: 'mes', nao: 'f-tipo' },
  mes: { p: 'É do mês atual ou do mês passado?', ajuda: 'Confira o mês e também o ano.', sim: 'nome', nao: 'f-atrasado' },
  nome: { p: 'Está no nome do próprio cliente?', ajuda: 'Compare com o nome do documento dele.', sim: 'f-ok', nao: 'f-outra' },
};
const FINS: Record<FimId, { tom: 'verde' | 'azul' | 'ambar' | 'rubro'; t: string; d: string }> = {
  'f-tipo': { tom: 'ambar', t: 'Pergunte ao gestor antes de aceitar', d: 'Os comprovantes da nossa lista são água, luz, internet, telefone e TV. Para qualquer outro papel, confirme com o gestor.' },
  'f-atrasado': { tom: 'rubro', t: 'Não serve: peça um mais novo', d: 'Comprovante atrasado não serve. Peça uma conta do mês atual ou do mês passado (pode ser outra conta da casa).' },
  'f-ok': { tom: 'verde', t: 'Serve', d: 'Confira se dá para ler o nome, o endereço completo e a data. Pronto.' },
  'f-outra': { tom: 'azul', t: 'Serve, com dois complementos', d: 'Peça o documento com foto de quem está no nome da conta (RG ou CNH, frente e verso) e faça a declaração de residência.' },
};
const ehFim = (d: Destino): d is FimId => d.startsWith('f-');

export function ArvoreComprovante() {
  const [caminho, setCaminho] = useState<{ no: NoId; sim: boolean }[]>([]);
  const ultimo = caminho[caminho.length - 1];
  const atual: Destino = !ultimo ? 'tipo' : ultimo.sim ? NOS[ultimo.no].sim : NOS[ultimo.no].nao;
  function responder(no: NoId, sim: boolean) { setCaminho((c) => [...c, { no, sim }]); }
  return (
    <div className="vidro mv-dp-av">
      {caminho.map((c, i) => (
        <div key={c.no} className="mv-dp-av-passo" data-feito="">
          <span className="mv-dp-av-n num">{i + 1}</span>
          <span className="mv-dp-av-q">
            <b>{NOS[c.no].p}</b>
            <span className="mv-dp-av-resp" data-sim={c.sim ? '' : undefined}>{c.sim ? <Ok /> : <Nao />}{c.sim ? 'Sim' : 'Não'}</span>
          </span>
        </div>
      ))}
      {!ehFim(atual) ? (
        <div className="mv-dp-av-passo">
          <span className="mv-dp-av-n num" data-atual="">{caminho.length + 1}</span>
          <span className="mv-dp-av-q">
            <b>{NOS[atual].p}</b>
            <small>{NOS[atual].ajuda}</small>
            <span className="mv-dp-av-bts">
              <button type="button" data-tom="verde" onClick={() => responder(atual, true)}><Ok />Sim</button>
              <button type="button" data-tom="rubro" onClick={() => responder(atual, false)}><Nao />Não</button>
            </span>
          </span>
        </div>
      ) : (
        <div className="mv-dp-av-fim" data-tom={FINS[atual].tom} role="status">
          <b>{FINS[atual].t}</b>
          <span>{FINS[atual].d}</span>
          <button type="button" className="mv-link" onClick={() => setCaminho([])}>Começar de novo</button>
        </div>
      )}
    </div>
  );
}

/* ===================================================================== 11. anatomia do e-mail */
/* Em HTML: no computador as legendas alternam em cima e embaixo de cada parte; no celular
   cada parte vira uma linha (peça + legenda), para o texto não encolher. */
const PARTES_EMAIL: { s: string; tx: string; t: string; d: string; cima: boolean; nota?: string }[] = [
  { s: 'user', tx: 'maria.exemplo58', t: 'Nome do usuário', d: 'escolhido pela pessoa', cima: true, nota: 'sem espaço e sem acento' },
  { s: 'arroba', tx: '@', t: 'Arroba', d: 'sempre uma só', cima: false },
  { s: 'prov', tx: 'gmail', t: 'Provedor', d: 'a empresa do e-mail', cima: true },
  { s: 'fim', tx: '.com', t: 'Final', d: 'quase sempre .com ou .com.br', cima: false },
];
export function AnatomiaEmail() {
  return (
    <Figura tag="Esquema" legenda="Endereço de exemplo. Todo e-mail tem estas quatro partes, sempre nesta ordem.">
      <div className="mv-dp-em" role="group" aria-label="As partes de um e-mail: nome do usuário (maria.exemplo58), arroba, provedor (gmail) e o final (.com).">
        {PARTES_EMAIL.map((p) => (
          <div key={p.s} className="mv-dp-em-parte" data-s={p.s} data-cima={p.cima ? '' : undefined}>
            <span className="mv-dp-em-seg">{p.tx}</span>
            <span className="mv-dp-em-rot"><b>{p.t}</b><small>{p.d}</small></span>
            {p.nota && <span className="mv-dp-em-nota">{p.nota}</span>}
          </div>
        ))}
      </div>
    </Figura>
  );
}

/* ===================================================================== 12. conferidor de e-mail */
/* Erros de digitação comuns depois do @ (só formato: não sabemos se o e-mail existe). */
const DOMINIO_ERRADO: Record<string, string> = {
  'gmial.com': 'gmail.com', 'gmal.com': 'gmail.com', 'gamil.com': 'gmail.com', 'gmai.com': 'gmail.com',
  'gnail.com': 'gmail.com', 'gmail.con': 'gmail.com', 'gmail.co': 'gmail.com', 'gmail.com.br': 'gmail.com',
  'gmail.cm': 'gmail.com', 'gmeil.com': 'gmail.com',
  'hotmial.com': 'hotmail.com', 'hotmal.com': 'hotmail.com', 'hotmai.com': 'hotmail.com', 'hotmail.con': 'hotmail.com',
  'homail.com': 'hotmail.com', 'hotmeil.com': 'hotmail.com',
  'outlok.com': 'outlook.com', 'outlook.con': 'outlook.com', 'otlook.com': 'outlook.com',
  'yaho.com': 'yahoo.com', 'yahoo.con': 'yahoo.com', 'yaho.com.br': 'yahoo.com.br',
};
function conferirEmail(bruto: string): string[] {
  const e = bruto.trim();
  if (!e) return [];
  const p: string[] = [];
  if (/\s/.test(e)) p.push('Tem espaço no meio. E-mail não tem espaço: confirme se é tudo junto, com ponto ou com traço.');
  if (e.includes(',')) p.push('Tem vírgula. Quase sempre era um ponto.');
  if (/[À-ſ]/.test(e)) p.push('Tem acento ou ç. E-mail não leva acento.');
  const arrobas = (e.match(/@/g) ?? []).length;
  if (arrobas === 0) p.push('Falta o @ (arroba). Sem ele, não é um e-mail.');
  if (arrobas > 1) p.push('Tem mais de um @. O e-mail tem um só.');
  if (arrobas === 1) {
    const [user, dom] = e.toLowerCase().split('@');
    if (!user) p.push('Falta o nome do usuário antes do @.');
    else if (user.startsWith('.') || user.endsWith('.') || user.includes('..')) {
      p.push('Tem ponto no começo, no fim ou dois pontos seguidos antes do @. Confira com o cliente.');
    }
    if (!dom) p.push('Falta o provedor depois do @ (por exemplo, gmail.com).');
    else {
      const sugestao = DOMINIO_ERRADO[dom];
      if (sugestao) p.push(`Depois do @ está “${dom}”. O certo costuma ser “${sugestao}”.`);
      else if (!dom.includes('.')) p.push('Falta o final depois do provedor (por exemplo, .com).');
      else if (dom.endsWith('.con')) p.push('Termina em “.con”. Quase sempre é “.com”.');
      else if (dom.endsWith('.') || dom.includes('..')) p.push('O final está com ponto sobrando. Confira com o cliente.');
    }
  }
  return p;
}
function soletrar(e: string): { t: string; tipo?: 'sinal' | 'num' | 'erro' }[] {
  return [...e.trim().toLowerCase()].map((ch) => {
    if (ch === '.') return { t: 'ponto', tipo: 'sinal' };
    if (ch === '@') return { t: 'arroba', tipo: 'sinal' };
    if (ch === '_') return { t: 'underline', tipo: 'sinal' };
    if (ch === '-') return { t: 'traço', tipo: 'sinal' };
    if (/\s/.test(ch)) return { t: 'espaço?', tipo: 'erro' };
    if (ch === ',') return { t: 'vírgula?', tipo: 'erro' };
    if (/\d/.test(ch)) return { t: ch, tipo: 'num' };
    return { t: ch };
  });
}
const EXEMPLOS_EMAIL = [
  'maria exemplo58@gmail.com',
  'maria.exemplo58@gmial.com',
  'maria.exemplo58@gmail.con',
  'maria.exemplo58gmail.com',
  'maria.exemplo58@gmail.com',
];

export function ConferidorEmail() {
  const [valor, setValor] = useState('');
  const e = valor.trim();
  const problemas = useMemo(() => conferirEmail(valor), [valor]);
  const letras = useMemo(() => soletrar(valor), [valor]);
  return (
    <div className="vidro mv-dp-ce">
      <span className="mv-dp-ce-cab"><span className="mv-teste-tag">Conferidor de e-mail</span></span>
      <label htmlFor="mv-dp-ce-in" className="mv-dp-ce-rot">Digite o e-mail do jeito que o cliente mandou</label>
      <input id="mv-dp-ce-in" className="mv-dp-ce-in" type="text" inputMode="email" autoComplete="off" autoCapitalize="none"
        spellCheck={false} value={valor} onChange={(ev) => setValor(ev.target.value)} placeholder="ex.: maria.exemplo58@gmail.com" />
      <div className="mv-dp-ce-ex">
        <small>Testar um exemplo:</small>
        {EXEMPLOS_EMAIL.map((x) => <button key={x} type="button" onClick={() => setValor(x)}>{x}</button>)}
      </div>
      {e && (problemas.length > 0 ? (
        <ul className="mv-dp-ce-res" data-tom="rubro" role="status">
          {problemas.map((p) => <li key={p}><Nao /><span>{p}</span></li>)}
        </ul>
      ) : (
        <div className="mv-dp-ce-res" data-tom="verde" role="status">
          <Ok /><span>O formato parece certo. Agora confirme com o cliente, lendo de volta letra por letra.</span>
        </div>
      ))}
      {e && (
        <div className="mv-dp-ce-sol">
          <small>Como ler de volta para o cliente</small>
          <div>{letras.map((l, i) => <span key={i} data-tipo={l.tipo}>{l.t}</span>)}</div>
        </div>
      )}
      <span className="mv-dp-ce-nota">
        O conferidor só olha o formato. Ele não sabe se o e-mail existe nem se é do cliente: isso só o cliente confirma.
      </span>
    </div>
  );
}

/* ===================================================================== 13. pedidos por documento */
type Trat = 'voce' | 'senhor' | 'senhora';
const TRAT: Record<Trat, { rot: string; vc: string; pra: string }> = {
  voce: { rot: 'Você', vc: 'você', pra: 'pra você' },
  senhor: { rot: 'O senhor', vc: 'o senhor', pra: 'pro senhor' },
  senhora: { rot: 'A senhora', vc: 'a senhora', pra: 'pra senhora' },
};
const aplicar = (t: string, tr: Trat) => t.replace(/\{vc\}/g, TRAT[tr].vc).replace(/\{pra\}/g, TRAT[tr].pra);
const PEDIDOS: { id: string; rotulo: string; ic: Ic; quando: string; texto: string }[] = [
  {
    id: 'tudo', rotulo: 'Lista completa', ic: 'lista',
    quando: 'Para pedir os quatro de uma vez, quando o cliente já decidiu seguir.',
    texto: 'Para seguir com o processo, vou precisar destes documentos:\n\n1. RG ou CNH (uma foto da frente e outra do verso)\n2. Uma foto do rosto (pode ser uma selfie)\n3. Comprovante de residência deste mês ou do mês passado (água, luz, internet, telefone ou TV)\n4. Um e-mail que {vc} use\n\nPode mandar aos pouquinhos, por aqui mesmo. Qualquer dúvida, é só me chamar.',
  },
  {
    id: 'id', rotulo: 'Identidade', ic: 'id',
    quando: 'Para pedir o RG ou a CNH já com a dica de como fotografar.',
    texto: 'Agora preciso da foto de um documento com foto: pode ser o RG ou a CNH.\n\nSão duas fotos: uma da frente e outra do verso (o outro lado).\n\nUma dica para a foto ficar boa: tire o documento do plástico, coloque em cima de uma mesa perto da janela e fotografe de cima, sem flash, com o documento inteiro aparecendo.',
  },
  {
    id: 'rosto', rotulo: 'Foto do rosto', ic: 'rosto',
    quando: 'Para pedir a foto do rosto já explicando o motivo.',
    texto: 'Agora preciso de uma foto do seu rosto.\n\nEla serve para confirmar que é {vc} quem está fazendo o pedido, e não outra pessoa.\n\nPode ser uma selfie: de frente, com o rosto inteiro aparecendo, num lugar claro, sem óculos escuros e sem boné. Se preferir, alguém de casa pode tirar.',
  },
  {
    id: 'comp', rotulo: 'Comprovante', ic: 'conta',
    quando: 'Para pedir o comprovante de residência com a regra do mês.',
    texto: 'Preciso também de um comprovante de residência. Pode ser conta de água, luz, internet, telefone ou TV.\n\nImportante: tem que ser deste mês ou do mês passado. Conta mais antiga não serve.\n\nSe a conta estiver no nome de outra pessoa da família (pai, mãe, filho), me avise, que a gente resolve: nesse caso eu preciso também do RG ou da CNH dessa pessoa, e a gente faz uma declaração de residência.',
  },
  {
    id: 'email', rotulo: 'E-mail', ic: 'email',
    quando: 'Para pedir o e-mail por escrito, já com a saída para quem não tem.',
    texto: 'Por último, preciso de um e-mail que {vc} use.\n\nPode me mandar escrito aqui, letra por letra? Assim não tem erro.\n\nSe {vc} não tiver e-mail, sem problema: a gente cria um e-mail {pra}.',
  },
];

export function PedidosPorDocumento() {
  const [aba, setAba] = useState(0);
  const [trat, setTrat] = useState<Trat>('senhora');
  const p = PEDIDOS[aba];
  const texto = aplicar(p.texto, trat);
  return (
    <div className="vidro mv-dp-pd">
      <div className="mv-dp-pd-abas" role="tablist" aria-label="Qual documento pedir">
        {PEDIDOS.map((x, i) => (
          <button key={x.id} type="button" role="tab" aria-selected={aba === i} onClick={() => setAba(i)}>
            <Icone ic={x.ic} />{x.rotulo}
          </button>
        ))}
      </div>
      <div className="mv-dp-pd-corpo" role="tabpanel" aria-label={p.rotulo}>
        <div className="mv-dp-pd-topo">
          <span className="mv-dp-pd-quando">{p.quando}</span>
          <div className="mv-dp-seg" role="group" aria-label="Tratamento">
            {(Object.keys(TRAT) as Trat[]).map((t) => (
              <button key={t} type="button" aria-pressed={trat === t} onClick={() => setTrat(t)}>{TRAT[t].rot}</button>
            ))}
          </div>
        </div>
        <span className="mv-dp-bolha">{texto}</span>
        <div className="mv-dp-pd-pe">
          <span className="mv-tag">Sugestão de roteiro</span>
          <small>adapte ao cliente e ao ponto da conversa</small>
          <BotaoCopiar texto={texto} rotulo="Copiar mensagem" />
        </div>
      </div>
    </div>
  );
}

/* ===================================================================== 14. checklist */
const CHECK: { g: string; ic: Ic; itens: string[] }[] = [
  {
    g: 'Identidade (RG ou CNH)', ic: 'id', itens: [
      'Foto da frente',
      'Foto do verso',
      'Documento inteiro, sem corte',
      'Dá para ler nome, datas e números',
      'Sem brilho em cima da foto ou dos dados',
      'Nome igual ao do cliente (na rota do familiar, ao do familiar)',
    ],
  },
  {
    g: 'Foto do rosto', ic: 'rosto', itens: [
      'Rosto inteiro, de frente',
      'Bem iluminada (não está contra a luz)',
      'Nítida, sem estar tremida',
      'Sem óculos escuros, boné ou chapéu',
      'Dá para comparar com a foto do documento',
    ],
  },
  {
    g: 'Comprovante de residência', ic: 'conta', itens: [
      'Conta de água, luz, internet, telefone ou TV',
      'Do mês atual ou do mês passado (mês e ano)',
      'Nome, endereço e data legíveis',
      'Se está no nome de outra pessoa: documento com foto dela + declaração de residência',
    ],
  },
  {
    g: 'E-mail', ic: 'email', itens: [
      'Recebido por escrito',
      'Formato conferido: um @, sem espaço, final certo',
      'Lido de volta e confirmado pelo cliente',
      'Se não tinha: e-mail criado, seguindo o procedimento da equipe',
    ],
  },
];
const TOTAL_CHECK = CHECK.reduce((n, g) => n + g.itens.length, 0);

export function ChecklistPessoais() {
  const [feitos, setFeitos] = useState<Set<string>>(() => new Set());
  function alternar(k: string) {
    setFeitos((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  }
  const pct = Math.round((feitos.size / TOTAL_CHECK) * 100);
  return (
    <div className="mv-dp-ck">
      <div className="vidro mv-dp-ck-topo">
        <div className="mv-dp-ck-prog">
          <span className="num">{feitos.size} de {TOTAL_CHECK} itens conferidos</span>
          <div className="mv-dp-ck-barra" aria-hidden><i style={{ width: `${pct}%` }} /></div>
        </div>
        <button type="button" className="mv-link" onClick={() => setFeitos(new Set())} disabled={feitos.size === 0}>Desmarcar tudo</button>
      </div>
      <div className="mv-dp-ck-grade">
        {CHECK.map((g) => (
          <div key={g.g} className="vidro mv-dp-ck-grupo">
            <h4><Icone ic={g.ic} />{g.g}</h4>
            {g.itens.map((it, i) => {
              const k = `${g.g}-${i}`;
              const on = feitos.has(k);
              return (
                <button key={k} type="button" className="mv-dp-ck-it" aria-pressed={on} onClick={() => alternar(k)}>
                  <span className="mv-dp-ck-box">{on && <Ok />}</span>
                  <span>{it}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
      {feitos.size === TOTAL_CHECK && (
        <div className="mv-dp-ck-ok" role="status">
          <b>Documentos pessoais completos.</b> Com eles e com os documentos do Meu INSS e do gov.br, o cliente está pronto
          para o cadastro.
        </div>
      )}
    </div>
  );
}
