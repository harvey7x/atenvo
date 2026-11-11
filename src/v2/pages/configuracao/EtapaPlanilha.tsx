/* =====================================================================
   Configuração inicial — ETAPA 1: "Planilha de clientes".
   Conecta a planilha do Google ao sistema (sincronização nos dois
   sentidos a cada 15 min; a planilha manda em caso de conflito; a aba
   "cancelados" tira o cliente da cobrança mantendo o histórico).

   Stepper vertical com 6 passos (A)–(F), um aberto por vez, escrito para
   quem nunca abriu o Google Cloud: cada item da guia diz O QUE fazer numa
   linha; o caminho exato de menus vem logo abaixo, em chips encadeados.
   Guias com FIGURA DE DEMONSTRAÇÃO (pedido do dono: "tutoriais com foto"):
   GuiaDemonstrada põe a instrução numerada à esquerda e a cena ilustrada
   (figuras/figurasGoogle) à direita — no estreito empilha, figura depois
   do texto. Com mais de uma cena, o número do item vira botão e troca a
   figura. FigSincronia (figuras/figurasSistema) abre o card da etapa.
   O lead e os fatos da etapa ficam no cabeçalho do card (Assistente).
   Dados = camada `planilhaSync.ts` (prévia simulada hoje; backend depois).

   Exporta também as peças reaproveitadas pelo painel de sincronização da
   Gestão (SyncPainel): CampoLinkPlanilha, EnvioChave, ContaServico,
   TesteConexao, ConferenciaMudancas, ResumoMudancas, Ic, BotaoCopiar,
   TrilhaMenu, LinhaStatus.

   Receitas visuais (regras comuns): BLOCO SEMÂNTICO (borda na cor + tile;
   no máximo um por card), SUPERFÍCIE NEUTRA (confirmações, registros,
   nota de segurança), LINHA DE STATUS (ícone + texto, sem fundo).
   Zero emoji no cromo (ícones SVG traço 1.7); confirmação SEMPRE inline
   (o assistente é um takeover acima dos modais); a chave nunca é guardada
   no navegador (só num ref, até o envio).
   ===================================================================== */
import {
  useCallback, useEffect, useId, useRef, useState,
  type ComponentType, type DragEvent as RDragEvent, type FormEvent, type KeyboardEvent as RKeyboardEvent, type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { BotaoPrimario, BotaoSec } from '../../components/Botao';
import { Toggle } from '../../components/Toggle';
import {
  LIMITE_CHAVE_BYTES, PASSOS, acessoConfirmadoPrevia, aplicar, chaveExemploPrevia, chaveSync, conferir, dataHoraBR, enviarChave,
  etapaPlanilhaConcluida, extrairIdPlanilha, fmtInt, horaBR, ligarAutomatico, linkExemploPrevia, passosConcluidos,
  salvarLink, semearPreviaConcluida, testar, useAcaoSync, useSyncPlanilha, validarChaveLocal,
  type EstadoSync, type GrupoMudanca, type PassoId, type ResultadoTeste,
} from '../../data/cobranca/planilhaSync';
import {
  FigAbas, FigAppsScript, FigAtivarApi, FigChaveJson, FigCloudProjeto, FigCompartilhar,
  FigContaServico, FigDriveUpload, FigExcelBaixar, FigLinkPlanilha, FigLocalidade, FigSalvarComoSheets,
} from './figuras/figurasGoogle';
import { FigSincronia } from './figuras/figurasSistema';
import './etapa-planilha.css';

/* ================= ícones (traço 1.7, família do menu) ================= */

const P = {
  check: 'M20 6 9 17l-5-5',
  x: 'M18 6 6 18M6 6l12 12',
  externo: 'M14 4h6v6M20 4l-8.5 8.5M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10',
  copiar: 'M9 9h10v10H9zM5 15V5h10',
  cadeado: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3M12 14.5v2.5',
  chevron: 'M9 6l6 6-6 6',
  baixo: 'M6 9l6 6 6-6',
  subir: 'M12 16V4m0 0-4.5 4.5M12 4l4.5 4.5M4 16v2.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V16',
  doc: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h4',
  alerta: 'M12 9v4M12 17h.01M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  grade: 'M4 5h16v14H4zM4 10h16M4 15h16M10 5v14',
  raio: 'M13 3 5 14h6l-1 7 8-11h-6z',
  info: 'M12 8h.01M11 12h1v5h1M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
  sync: 'M20 11a8 8 0 0 0-14.6-4.5M4 4v4h4M4 13a8 8 0 0 0 14.6 4.5M20 20v-4h-4',
  pausa: 'M9 5v14M15 5v14',
} as const;
export type IconeSync = keyof typeof P;

export function Ic({ n, s = 14, className }: { n: IconeSync; s?: number; className?: string }) {
  return (
    <svg className={className} width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
      <path d={P[n]} />
    </svg>
  );
}

/** carregando (anel girando) */
function Giro() {
  return <span className="cpl-giro" aria-hidden />;
}

/* ================= guia: {Menu > Item} e [[nome]] ================= */

/** caminho de menus em chips encadeados por chevron ("Arquivo › Configurações").
    Cada chip traz o chevron À FRENTE; o do começo de cada linha cai fora do recorte (nada de seta órfã ao quebrar). */
export function TrilhaMenu({ itens }: { itens: string[] }) {
  return (
    <div className="cpl-trilha-menu">
      <span className="cpl-vh">Caminho: </span>
      {itens.map((it, i) => (
        <span key={i} className="cpl-menu-par">
          <Ic n="chevron" s={11} className="cpl-menu-sep" />
          {i > 0 && <span className="cpl-vh"> depois </span>}
          <span className="cpl-menu-it">{it}</span>
        </span>
      ))}
    </div>
  );
}

/** marcação de guia em texto corrido: {Arquivo > Configurações} e [[nome]] viram nomes exatos em negrito
    (inline, sem chip: nada de desalinhar a linha nem deixar pontuação órfã) */
export function TextoGuia({ t }: { t: string }) {
  const partes: ReactNode[] = [];
  const re = /\{([^}]+)\}|\[\[([^\]]+)\]\]/g;
  let i = 0;
  let k = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t)) !== null) {
    if (m.index > i) partes.push(t.slice(i, m.index));
    if (m[1] != null) partes.push(<b key={k++} className="cpl-nome">{m[1].split('>').map((s) => s.trim()).join(' › ')}</b>);
    else partes.push(<b key={k++} className="cpl-nome">{m[2]}</b>);
    i = re.lastIndex;
  }
  if (i < t.length) partes.push(t.slice(i));
  return <>{partes}</>;
}

/** um item da guia: a ação numa linha; o caminho de menus, o detalhe e o link vêm à parte */
export type ItemGuia = string | { tx: string; menu?: string[]; det?: string; link?: { href: string; rot: string } };

function LinkExterno({ href, rot }: { href: string; rot: string }) {
  return (
    <a className="cpl-link-ext" href={href} target="_blank" rel="noopener noreferrer">
      {rot}<Ic n="externo" s={13} /><span className="cpl-vh"> (nova aba)</span>
    </a>
  );
}

/** corpo de um item da guia: a ação, a trilha de menus, o detalhe e o link */
function CorpoItemGuia({ o }: { o: { tx: string; menu?: string[]; det?: string; link?: { href: string; rot: string } } }) {
  return (
    <div className="cpl-guia-corpo">
      <p className="cpl-guia-tx">
        <TextoGuia t={o.tx} />
        {o.link && <>{' '}<LinkExterno href={o.link.href} rot={o.link.rot} /></>}
      </p>
      {o.menu && <TrilhaMenu itens={o.menu} />}
      {/* o "·" fica preso à palavra anterior: nunca abre uma linha */}
      {o.det && <p className="cpl-guia-det"><TextoGuia t={o.det.replace(/ · /g, '\u00A0·\u00A0')} /></p>}
    </div>
  );
}

function ListaGuia({ itens, inicio = 1 }: { itens: ItemGuia[]; inicio?: number }) {
  return (
    <ol className="cpl-guia" role="list" start={inicio}>
      {itens.map((it, i) => (
        <li key={i}>
          <span className="cpl-guia-n num" aria-hidden>{inicio + i}</span>
          <CorpoItemGuia o={typeof it === 'string' ? { tx: it } : it} />
        </li>
      ))}
    </ol>
  );
}

/* ================= guia demonstrada: instrução + figura ================= */

/** uma cena de demonstração: a figura (mockup SVG) e a legenda curta embaixo */
type CenaDemo = { Fig: ComponentType; legenda: string };

/** guia com demonstração: instruções numeradas à esquerda, a cena do item em foco
    à direita (no estreito empilha, com a figura DEPOIS do texto). Com mais de uma
    cena, o número do item vira botão: clicar realça o item e troca a figura — sem
    animação pesada, só um fade curto. */
function GuiaDemonstrada({ itens, cenas }: { itens: Array<{ it: ItemGuia; cena: number }>; cenas: CenaDemo[] }) {
  const [foco, setFoco] = useState(0);
  const id = useId();
  const multi = cenas.length > 1;
  const alvo = itens[foco] ?? itens[0];
  const cena = cenas[alvo.cena] ?? cenas[0];
  const F = cena.Fig;
  return (
    <div className="cpl-demo">
      <ol className={multi ? 'cpl-guia cpl-guia-demo' : 'cpl-guia'} role="list">
        {itens.map(({ it }, i) => {
          const on = multi && i === foco;
          return (
            <li key={i} className={on ? 'cpl-guia-on' : undefined}>
              {multi ? (
                <button type="button" className="cpl-guia-num num" aria-controls={`${id}-fig`}
                  aria-current={on || undefined} onClick={() => setFoco(i)}>
                  <span aria-hidden>{i + 1}</span>
                  <span className="cpl-vh">Item {i + 1}: ver a demonstração{on ? ' (em exibição)' : ''}</span>
                </button>
              ) : (
                <span className="cpl-guia-n num" aria-hidden>{i + 1}</span>
              )}
              <CorpoItemGuia o={typeof it === 'string' ? { tx: it } : it} />
            </li>
          );
        })}
      </ol>
      <figure className="cpl-demo-fig" id={`${id}-fig`}>
        {/* a key remonta a cena ao trocar: o fade curto marca a troca */}
        <div key={alvo.cena} className="cpl-demo-tela"><F /></div>
        <figcaption className="cpl-demo-leg" aria-live={multi ? 'polite' : undefined}>
          {multi && <b className="cpl-demo-item num">Item {foco + 1}{'\u00A0· '}</b>}
          {cena.legenda}
        </figcaption>
      </figure>
    </div>
  );
}

/* ================= copiar ================= */

export function useCopiarTexto() {
  const [copiado, setCopiado] = useState<'ok' | 'erro' | null>(null);
  const t = useRef<number | null>(null);
  useEffect(() => () => { if (t.current) window.clearTimeout(t.current); }, []);
  const copiar = useCallback(async (texto: string) => {
    let ok = true;
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = texto;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand('copy');
        ta.remove();
      } catch { ok = false; }
    }
    setCopiado(ok ? 'ok' : 'erro');
    if (t.current) window.clearTimeout(t.current);
    t.current = window.setTimeout(() => setCopiado(null), 2000);
  }, []);
  return { copiar, copiado };
}

export function BotaoCopiar({ texto, oQue, className }: { texto: string; oQue: string; className?: string }) {
  const { copiar, copiado } = useCopiarTexto();
  return (
    <>
      <BotaoSec mini className={['cpl-copiar', className ?? ''].filter(Boolean).join(' ')} onClick={() => { void copiar(texto); }}
        aria-label={`Copiar ${oQue}`}>
        {copiado === 'ok' ? <><Ic n="check" s={13} />Copiado</> : copiado === 'erro' ? 'Não foi possível copiar' : <><Ic n="copiar" s={13} />Copiar</>}
      </BotaoSec>
      <span className="cpl-vh" role="status">{copiado === 'ok' ? `${oQue} copiado` : ''}</span>
    </>
  );
}

/* ================= receitas de estado ================= */

/** LINHA DE STATUS: sem fundo; ícone 16 na cor semântica + título (ou frase única) + detalhe */
export function LinhaStatus({ tom, titulo, children, role, className }: {
  tom: 'ok' | 'er' | 'info'; titulo?: ReactNode; children?: ReactNode; role?: 'status' | 'alert'; className?: string;
}) {
  const ic: IconeSync = tom === 'ok' ? 'check' : tom === 'er' ? 'x' : 'info';
  return (
    <div className={['cpl-status', `cpl-status-${tom}`, className ?? ''].filter(Boolean).join(' ')} role={role}>
      <span className="cpl-status-ic" aria-hidden><Ic n={ic} s={16} /></span>
      <div className="cpl-status-corpo">
        {titulo ? (
          <>
            <p className="cpl-status-tit">{titulo}</p>
            {children && <p className="cpl-status-det">{children}</p>}
          </>
        ) : <p className="cpl-status-tx">{children}</p>}
      </div>
    </div>
  );
}

/** SUPERFÍCIE NEUTRA com ícone + título (nota de segurança, indisponível) */
function Neutro({ icone, titulo, children }: { icone: IconeSync; titulo: ReactNode; children?: ReactNode }) {
  return (
    <div className="cpl-neutro cpl-neutro-nota">
      <span className="cpl-neutro-ic" aria-hidden><Ic n={icone} s={16} /></span>
      <div className="cpl-neutro-corpo">
        <p className="cpl-neutro-tit">{titulo}</p>
        {children && <p className="cpl-neutro-tx">{children}</p>}
      </div>
    </div>
  );
}

/** ok → linha de status verde · at/er → BLOCO SEMÂNTICO · ne → linha info (frase) ou superfície neutra (com título) */
function Aviso({ tom, titulo, children, icone }: { tom: 'ok' | 'at' | 'er' | 'ne'; titulo?: ReactNode; children?: ReactNode; icone?: IconeSync }) {
  if (tom === 'at' || tom === 'er') {
    const ic: IconeSync = icone ?? (tom === 'er' ? 'x' : 'alerta');
    return (
      <div className={`cpl-sem cpl-sem-${tom}`} role={tom === 'er' ? 'alert' : undefined}>
        <span className="cpl-sem-tile" aria-hidden><Ic n={ic} s={16} /></span>
        <div className={titulo ? 'cpl-sem-corpo' : 'cpl-sem-corpo cpl-sem-so'}>
          {titulo && <p className="cpl-sem-tit">{titulo}</p>}
          {children && <p className="cpl-sem-tx">{children}</p>}
        </div>
      </div>
    );
  }
  if (tom === 'ne' && titulo) return <Neutro icone={icone ?? 'info'} titulo={titulo}>{children}</Neutro>;
  return <LinhaStatus tom={tom === 'ok' ? 'ok' : 'info'} titulo={titulo}>{children}</LinhaStatus>;
}

function ErroAcao({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return <p className="cpl-erro" role="alert"><Ic n="alerta" s={13} />{msg}</p>;
}

/** botão de texto discreto, só na prévia */
function AtalhoPrevia({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" className="cpl-previa" onClick={onClick}>
      <span className="cpl-previa-tag">Prévia</span><span className="cpl-previa-tx">{children}</span>
    </button>
  );
}

/* ---------- (A) link ---------- */

/** campo do link + validação ao vivo + salvar (reusado no "Trocar planilha" da Gestão) */
export function CampoLinkPlanilha({ aoSalvo, rotuloBotao = 'Salvar link', aoCancelar, previa }: {
  aoSalvo?: (e: EstadoSync) => void;
  rotuloBotao?: string;
  aoCancelar?: () => void;
  previa?: boolean;
}) {
  const [valor, setValor] = useState('');
  const [tocado, setTocado] = useState(false);
  const acao = useAcaoSync(salvarLink);
  const id = useId();
  const r = valor.trim() ? extrairIdPlanilha(valor) : null;
  const mostraErro = !!r && !r.ok && tocado;
  const enviar = async (ev: FormEvent) => {
    ev.preventDefault();
    setTocado(true);
    if (!r || !r.ok) return;
    const e = await acao.executar(valor);
    if (e) aoSalvo?.(e);
  };
  const exemplo = previa ? linkExemploPrevia() : null;
  return (
    <form className="cpl-link" onSubmit={(ev) => { void enviar(ev); }} noValidate>
      <label className="cpl-rot" htmlFor={`${id}-in`}>Link da planilha do Google</label>
      <div className="cpl-link-linha">
        <input id={`${id}-in`} className={mostraErro ? 'inp cpl-link-inp cpl-inv' : 'inp cpl-link-inp'} type="url" inputMode="url"
          autoComplete="off" spellCheck={false} placeholder="https://docs.google.com/spreadsheets/d/…"
          value={valor} onChange={(e) => { setValor(e.target.value); acao.limparErro(); }} onBlur={() => setTocado(true)}
          onKeyDown={(e) => { if (e.key === 'Enter') setTocado(true); }}
          aria-invalid={mostraErro} aria-describedby={`${id}-dica`} disabled={acao.pendente} />
        <BotaoPrimario type="submit" disabled={acao.pendente || !r || !r.ok} aria-busy={acao.pendente || undefined}>
          {acao.pendente ? <><Giro />Salvando…</> : rotuloBotao}
        </BotaoPrimario>
        {aoCancelar && <BotaoSec onClick={aoCancelar} disabled={acao.pendente}>Cancelar</BotaoSec>}
      </div>
      <div id={`${id}-dica`} className="cpl-link-dica" aria-live="polite">
        {r && r.ok && (
          <span className="cpl-ok-tx"><Ic n="check" s={13} className="cpl-ok-ic" />ID reconhecido: <code className="cpl-id">{r.id}</code></span>
        )}
        {mostraErro && r && !r.ok && <span className="cpl-er-tx">{r.erro}</span>}
        {!r && <span>O link fica na barra de endereço do navegador, com a planilha aberta.</span>}
      </div>
      <ErroAcao msg={acao.erro} />
      {exemplo && !valor && (
        <AtalhoPrevia onClick={() => { setValor(exemplo); setTocado(true); }}>colar um link de exemplo</AtalhoPrevia>
      )}
    </form>
  );
}

/** ID curto para resumo: 1qZ8xV…BvNw */
const idCurto = (id: string) => (id.length > 14 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id);

function PlanilhaRegistrada({ estado, aoTrocar }: { estado: EstadoSync; aoTrocar?: () => void }) {
  if (!estado.planilha) return null;
  return (
    <div className="cpl-reg">
      <span className="cpl-tile" aria-hidden><Ic n="grade" s={16} /></span>
      <div className="cpl-reg-tx">
        <span className="cpl-reg-rot">Planilha registrada</span>
        <code className="cpl-id cpl-id-1l" title={estado.planilha.id}>{estado.planilha.id}</code>
      </div>
      <div className="cpl-reg-acoes">
        <a className="p-btn btn-sec btn-mini cpl-a" href={estado.planilha.url} target="_blank" rel="noopener noreferrer">
          <Ic n="externo" s={13} />Abrir<span className="cpl-vh"> a planilha no Google (nova aba)</span>
        </a>
        {aoTrocar && <BotaoSec mini onClick={aoTrocar}>Trocar</BotaoSec>}
      </div>
    </div>
  );
}

/** cenas do passo A, na ordem da guia (item i → cena i) */
const CENAS_LINK: CenaDemo[] = [
  { Fig: FigExcelBaixar, legenda: 'Como aparece no Excel Online' },
  { Fig: FigDriveUpload, legenda: 'Como aparece no Google Drive' },
  { Fig: FigSalvarComoSheets, legenda: 'Como aparece no Google Planilhas' },
  { Fig: FigLocalidade, legenda: 'Como aparecem as configurações da planilha' },
  { Fig: FigAbas, legenda: 'Como aparecem as abas, no rodapé da planilha' },
  { Fig: FigLinkPlanilha, legenda: 'Onde fica o link, na barra de endereço' },
];

const GUIA_LINK: ItemGuia[] = [
  { tx: 'No Excel Online, baixe uma cópia da planilha (.xlsx).', menu: ['Arquivo', 'Salvar como', 'Baixar uma cópia'] },
  { tx: 'No Google Drive, envie o arquivo baixado.', menu: ['Novo', 'Upload de arquivo'], link: { href: 'https://drive.google.com', rot: 'Abrir o Google Drive' } },
  { tx: 'Abra o arquivo enviado e converta para Planilhas Google. A planilha nova é a que o sistema vai usar.', menu: ['Arquivo', 'Salvar como Planilhas Google'] },
  { tx: 'Na planilha nova, ajuste localidade e fuso.', menu: ['Arquivo', 'Configurações'], det: '[[Localidade]] Brasil · [[Fuso horário]] (GMT-03:00) São Paulo · clique em [[Salvar configurações]]' },
  'Confira as abas no rodapé: [[CLIENTES MENSAL]] e [[cancelados]], com esses nomes exatos.',
  'Copie o endereço da planilha na barra do navegador e cole abaixo.',
];

function PassoLink({ estado, aoConcluido }: { estado: EstadoSync; aoConcluido: () => void }) {
  const [trocando, setTrocando] = useState(false);
  const registrado = !!estado.planilha && !trocando;
  return (
    <div className="cpl-corpo">
      <p className="cpl-intro">Se a planilha está no Excel Online, faça uma cópia dela no Google Planilhas.</p>
      <GuiaDemonstrada itens={GUIA_LINK.map((it, i) => ({ it, cena: i }))} cenas={CENAS_LINK} />
      {registrado ? (
        <PlanilhaRegistrada estado={estado} aoTrocar={() => setTrocando(true)} />
      ) : (
        <CampoLinkPlanilha previa={estado.modo === 'previa'}
          aoCancelar={estado.planilha ? () => setTrocando(false) : undefined}
          aoSalvo={() => { setTrocando(false); aoConcluido(); }} />
      )}
      {estado.planilha && estado.configuradaEm && trocando && (
        <Aviso tom="at">Trocar a planilha pausa a sincronização até você testar a conexão e conferir as mudanças de novo.</Aviso>
      )}
    </div>
  );
}

/* ---------- (B) acesso ---------- */

const GUIA_ACESSO: ItemGuia[] = [
  { tx: 'Entre no Google Cloud com a conta do escritório; no primeiro acesso, aceite os termos.', link: { href: 'https://console.cloud.google.com/', rot: 'Abrir o Google Cloud' } },
  { tx: 'No topo, abra o seletor de projetos e crie um projeto novo.', menu: ['Novo projeto'], det: 'Nome [[reviza-planilha]] · [[Criar]] · confira se ele ficou selecionado no topo' },
  { tx: 'Ative a API das planilhas.', menu: ['APIs e serviços', 'Biblioteca'], det: 'Pesquise [[Google Sheets API]] e clique em [[Ativar]]' },
  { tx: 'Crie a conta de serviço [[reviza-sync]], sem nenhum papel.', menu: ['IAM e administrador', 'Contas de serviço', 'Criar conta de serviço'], det: '[[Criar e continuar]] · em permissões, não escolha papel · [[Concluir]]' },
  { tx: 'Na lista, abra a conta [[reviza-sync]] e gere a chave.', menu: ['Chaves', 'Adicionar chave', 'Criar nova chave'], det: 'Escolha [[JSON]] e clique em [[Criar]]: um arquivo .json é baixado' },
];

/** cenas do passo B: os itens 1 e 2 acontecem na mesma tela do Google Cloud */
const CENAS_ACESSO: CenaDemo[] = [
  { Fig: FigCloudProjeto, legenda: 'Como aparece no Google Cloud' },
  { Fig: FigAtivarApi, legenda: 'Como aparece a página da Google Sheets API' },
  { Fig: FigContaServico, legenda: 'Como aparece em Contas de serviço' },
  { Fig: FigChaveJson, legenda: 'Como aparece a criação da chave' },
];
const CENA_DO_ACESSO = [0, 0, 1, 2, 3] as const;

const PROBLEMAS_ACESSO: Array<[string, string]> = [
  ['Apareceu "A criação de chaves da conta de serviço está desativada"',
    'A conta Google pertence a uma organização com essa trava. Crie o projeto com uma conta Google comum (Gmail) ou fale com o suporte.'],
  ['Não encontro "IAM e administrador"',
    'Use a busca no topo do console: digite Contas de serviço e abra o primeiro resultado.'],
  ['Baixei a chave mais de uma vez',
    'Sem problema: use o arquivo mais recente. As antigas podem ser excluídas na aba Chaves da conta reviza-sync.'],
];

function PassoAcesso({ feito, aoConcluido }: { feito: boolean; aoConcluido: () => void }) {
  return (
    <div className="cpl-corpo">
      <p className="cpl-intro">
        Crie uma <b>conta de serviço</b> no Google: um usuário técnico que só enxerga a planilha compartilhada com ele. Leva uns 5 minutos.
      </p>
      <GuiaDemonstrada itens={GUIA_ACESSO.map((it, i) => ({ it, cena: CENA_DO_ACESSO[i] ?? 0 }))} cenas={CENAS_ACESSO} />
      <Neutro icone="cadeado" titulo="Esse arquivo é a senha da integração — envie só por esta tela.">
        Não mande por WhatsApp ou e-mail nem deixe em pasta compartilhada. Depois de enviar, pode apagar do computador.
      </Neutro>
      {!feito && (
        <div className="cpl-acoes">
          <BotaoPrimario onClick={aoConcluido}>Já tenho o arquivo da chave</BotaoPrimario>
        </div>
      )}
      <details className="cpl-ajuda">
        <summary><Ic n="baixo" s={13} className="cpl-ajuda-seta" />Se algo der errado</summary>
        <dl className="cpl-ajuda-lista">
          {PROBLEMAS_ACESSO.map(([p, r]) => (
            <div key={p} className="cpl-ajuda-item"><dt>{p}</dt><dd>{r}</dd></div>
          ))}
        </dl>
      </details>
    </div>
  );
}

/* ---------- (C) chave ---------- */

/** e-mail da conta de serviço já enviada (a chave em si nunca volta) */
export function ContaServico({ email, aoTrocar }: { email: string; aoTrocar?: () => void }) {
  return (
    <div className="cpl-conta">
      <div className="cpl-reg">
        <span className="cpl-tile" aria-hidden><Ic n="cadeado" s={16} /></span>
        <div className="cpl-reg-tx">
          <span className="cpl-reg-rot">Conta do sistema</span>
          <code className="cpl-email">{email}</code>
        </div>
        <div className="cpl-reg-acoes">
          <BotaoCopiar texto={email} oQue="e-mail da conta do sistema" />
          {aoTrocar && <BotaoSec mini onClick={aoTrocar}>Trocar chave</BotaoSec>}
        </div>
      </div>
      <p className="cpl-conta-nota">A chave fica guardada criptografada e não pode ser vista de novo.</p>
    </div>
  );
}

type FaseChave =
  | { f: 'ocioso' }
  | { f: 'lendo' }
  | { f: 'invalido'; erro: string }
  | { f: 'pronto'; email: string; projeto: string | null; arquivo: string };

/** área de arrastar/escolher o .json + envio (reusado no "Trocar chave" da Gestão) */
export function EnvioChave({ aoEnviada, aoCancelar, previa }: { aoEnviada?: (e: EstadoSync) => void; aoCancelar?: () => void; previa?: boolean }) {
  const [fase, setFase] = useState<FaseChave>({ f: 'ocioso' });
  const [sobre, setSobre] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  /* o conteúdo da chave vive SÓ aqui, até o envio — nunca em state, storage ou cache */
  const textoRef = useRef<string | null>(null);
  useEffect(() => () => { textoRef.current = null; }, []);
  const acao = useAcaoSync(enviarChave);
  const id = useId();

  const processar = (texto: string, arquivo: string) => {
    const v = validarChaveLocal(texto);
    if (!v.ok) { textoRef.current = null; setFase({ f: 'invalido', erro: v.erro }); return; }
    textoRef.current = texto;
    setFase({ f: 'pronto', email: v.email, projeto: v.projeto, arquivo });
  };
  const lerArquivo = async (f: File | null | undefined) => {
    acao.limparErro();
    if (!f) return;
    if (f.size > LIMITE_CHAVE_BYTES) { textoRef.current = null; setFase({ f: 'invalido', erro: 'Este arquivo é grande demais para ser uma chave (máximo de 20 KB). Confira se escolheu o .json certo.' }); return; }
    setFase({ f: 'lendo' });
    try {
      processar(await f.text(), f.name);
    } catch {
      textoRef.current = null;
      setFase({ f: 'invalido', erro: 'Não foi possível ler o arquivo. Tente escolher de novo.' });
    }
  };
  const escolher = () => inputRef.current?.click();
  const aoTeclar = (e: RKeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); escolher(); }
  };
  const aoSoltar = (e: RDragEvent) => {
    e.preventDefault(); setSobre(false);
    void lerArquivo(e.dataTransfer.files?.[0]);
  };
  const reiniciar = () => { textoRef.current = null; acao.limparErro(); setFase({ f: 'ocioso' }); };
  const enviar = async () => {
    const t = textoRef.current;
    if (!t) { reiniciar(); return; }
    const e = await acao.executar(t);
    if (e) { textoRef.current = null; setFase({ f: 'ocioso' }); aoEnviada?.(e); }
  };
  const exemplo = previa ? chaveExemploPrevia() : null;

  return (
    <div className="cpl-chave">
      <input ref={inputRef} id={`${id}-arq`} type="file" accept=".json,application/json" className="cpl-vh" tabIndex={-1} aria-hidden
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; void lerArquivo(f); }} />
      {fase.f === 'pronto' ? (
        <div className="cpl-reg cpl-arq">
          <span className="cpl-tile" aria-hidden><Ic n="doc" s={16} /></span>
          <div className="cpl-reg-tx">
            <span className="cpl-arq-nome">{fase.arquivo}</span>
            <span className="cpl-arq-meta">Conta de serviço <code className="cpl-email">{fase.email}</code></span>
            {fase.projeto && <span className="cpl-arq-meta">Projeto {fase.projeto}</span>}
          </div>
          <div className="cpl-reg-acoes">
            <BotaoSec mini onClick={reiniciar} disabled={acao.pendente}>Escolher outro</BotaoSec>
            <BotaoPrimario mini onClick={() => { void enviar(); }} disabled={acao.pendente} aria-busy={acao.pendente || undefined}>
              {acao.pendente ? <><Giro />Enviando…</> : 'Enviar chave'}
            </BotaoPrimario>
          </div>
        </div>
      ) : (
        <div className={['cpl-drop', sobre ? 'cpl-drop-on' : '', fase.f === 'invalido' ? 'cpl-drop-erro' : ''].filter(Boolean).join(' ')}
          role="button" tabIndex={0} aria-describedby={`${id}-sub`}
          onClick={escolher} onKeyDown={aoTeclar}
          onDragEnter={(e) => { e.preventDefault(); setSobre(true); }}
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setSobre(false); }}
          onDrop={aoSoltar}>
          <span className="cpl-drop-ic" aria-hidden>{fase.f === 'lendo' ? <Giro /> : <Ic n="subir" s={20} />}</span>
          <span className="cpl-drop-tit">{fase.f === 'lendo' ? 'Lendo o arquivo…' : 'Arraste o arquivo .json aqui ou clique para escolher'}</span>
          <span className="cpl-drop-sub" id={`${id}-sub`}>O arquivo baixado em Chaves › Criar nova chave › JSON</span>
        </div>
      )}
      {fase.f === 'invalido' && <p className="cpl-erro" role="alert"><Ic n="alerta" s={13} />{fase.erro}</p>}
      <ErroAcao msg={acao.erro} />
      {aoCancelar && fase.f !== 'pronto' && (
        <div className="cpl-acoes"><BotaoSec onClick={aoCancelar}>Cancelar</BotaoSec></div>
      )}
      {exemplo && fase.f !== 'pronto' && (
        <AtalhoPrevia onClick={() => processar(exemplo, 'reviza-planilha-exemplo.json')}>usar um arquivo de exemplo</AtalhoPrevia>
      )}
    </div>
  );
}

function PassoChave({ estado, liberado, aoConcluido }: { estado: EstadoSync; liberado: boolean; aoConcluido: () => void }) {
  const [trocando, setTrocando] = useState(false);
  return (
    <div className="cpl-corpo">
      {estado.conta && !trocando ? (
        <ContaServico email={estado.conta.email} aoTrocar={() => setTrocando(true)} />
      ) : (
        <>
          <p className="cpl-intro">Envie o arquivo .json baixado no passo B. Ele é conferido antes de sair do computador.</p>
          {liberado ? (
            <EnvioChave previa={estado.modo === 'previa'} aoCancelar={estado.conta ? () => setTrocando(false) : undefined}
              aoEnviada={() => { setTrocando(false); aoConcluido(); }} />
          ) : (
            <Aviso tom="ne">Registre o link da planilha (passo A) antes de enviar a chave.</Aviso>
          )}
          {estado.conta && trocando && (
            <Aviso tom="at">Trocar a chave pausa a sincronização até você testar a conexão de novo.</Aviso>
          )}
        </>
      )}
    </div>
  );
}

/* ---------- (D) compartilhar e testar ---------- */

function Fato({ children, ok }: { children: ReactNode; ok?: boolean }) {
  return (
    <span className="cpl-fato">
      {children}
      {ok === true && <Ic n="check" s={13} className="cpl-fato-ok" />}
      {ok === false && <Ic n="x" s={13} className="cpl-fato-er" />}
      {ok != null && <span className="cpl-vh">{ok ? ' (correto)' : ' (incorreto)'}</span>}
    </span>
  );
}

export function ResultadoTesteView({ teste }: { teste: ResultadoTeste }) {
  const fatos = (
    <div className="cpl-fatos">
      {teste.abas.length > 0 && <Fato>Abas encontradas: {teste.abas.join(', ')}</Fato>}
      {teste.clientes != null && <Fato><span className="num">{fmtInt(teste.clientes)}</span> clientes</Fato>}
      {teste.localidade && <Fato ok={teste.localidade.ok}>Localidade {teste.localidade.rotulo}</Fato>}
      {teste.fuso && <Fato ok={teste.fuso.ok}>Fuso {teste.fuso.rotulo}</Fato>}
    </div>
  );
  if (teste.ok) {
    return (
      <div className="cpl-teste cpl-status cpl-status-ok" role="status">
        <span className="cpl-status-ic" aria-hidden><Ic n="check" s={16} /></span>
        <div className="cpl-status-corpo">
          <div className="cpl-teste-cab">
            <p className="cpl-status-tit">Conexão funcionando</p>
            <span className="cpl-teste-hora num">{horaBR(teste.quando)}</span>
          </div>
          {fatos}
        </div>
      </div>
    );
  }
  const er = teste.erro;
  return (
    <div className="cpl-teste cpl-sem cpl-sem-er" role="alert">
      <span className="cpl-sem-tile" aria-hidden><Ic n="x" s={16} /></span>
      <div className="cpl-sem-corpo">
        <p className="cpl-sem-tit">{er?.titulo ?? 'A conexão falhou'}</p>
        {er?.detalhe && <p className="cpl-sem-tx">{er.detalhe}</p>}
        {(teste.abas.length > 0 || teste.localidade) && fatos}
        {er && er.correcao.length > 0 && (
          <div className="cpl-teste-corr">
            <p className="cpl-teste-corr-rot">Como corrigir</p>
            <ListaGuia itens={er.correcao} />
          </div>
        )}
      </div>
    </div>
  );
}

/** botão "Testar conexão" + resultado (reusado no painel da Gestão).
    mostrarAnterior=false: só mostra o resultado de um teste feito AQUI (o antigo pode estar velho). */
export function TesteConexao({ estado, aoOk, liberado = true, mostrarAnterior = true }: {
  estado: EstadoSync; aoOk?: () => void; liberado?: boolean; mostrarAnterior?: boolean;
}) {
  const acao = useAcaoSync(testar);
  const [rodouAqui, setRodouAqui] = useState(false);
  const t = mostrarAnterior || rodouAqui ? estado.teste : null;
  const rodar = async () => {
    const e = await acao.executar();
    if (e) setRodouAqui(true);
    if (e?.teste?.ok) aoOk?.();
  };
  return (
    <div className="cpl-testar">
      {t && !acao.pendente && <ResultadoTesteView teste={t} />}
      <div className="cpl-acoes">
        {(!t || !t.ok) ? (
          <BotaoPrimario onClick={() => { void rodar(); }} disabled={acao.pendente || !liberado} aria-busy={acao.pendente || undefined}>
            {acao.pendente ? <><Giro />Testando a conexão…</> : t ? 'Testar de novo' : 'Testar conexão'}
          </BotaoPrimario>
        ) : (
          <BotaoSec mini onClick={() => { void rodar(); }} disabled={acao.pendente} aria-busy={acao.pendente || undefined}>
            {acao.pendente ? <><Giro />Testando…</> : 'Testar de novo'}
          </BotaoSec>
        )}
      </div>
      <ErroAcao msg={acao.erro} />
    </div>
  );
}

/** contido = o rodapé já mostra "Concluir etapa" ativo: o "Continuar" vira secundário (um primário ativo por vez) */
function PassoTeste({ estado, liberado, aoConcluido, contido = false }: { estado: EstadoSync; liberado: boolean; aoConcluido: () => void; contido?: boolean }) {
  const email = estado.conta?.email;
  return (
    <div className="cpl-corpo">
      {email && (
        <div className="cpl-reg cpl-conta-compacta">
          <span className="cpl-tile" aria-hidden><Ic n="cadeado" s={16} /></span>
          <div className="cpl-reg-tx">
            <span className="cpl-reg-rot">E-mail da conta do sistema</span>
            <code className="cpl-email">{email}</code>
          </div>
          <div className="cpl-reg-acoes">
            <BotaoCopiar texto={email} oQue="e-mail da conta do sistema" />
          </div>
        </div>
      )}
      <p className="cpl-intro"><b>Compartilhe a planilha com esse e-mail como Editor</b> — é assim que o sistema ganha acesso a ela, e só a ela.</p>
      <GuiaDemonstrada cenas={[{ Fig: FigCompartilhar, legenda: 'Como aparece a janela Compartilhar da planilha' }]} itens={[
        { it: 'Na planilha do Google, clique em [[Compartilhar]], no canto superior direito.', cena: 0 },
        { it: { tx: 'Cole o e-mail e escolha [[Editor]].', det: 'Desmarque [[Notificar pessoas]] e clique em [[Compartilhar]]' }, cena: 0 },
        { it: 'Volte aqui e clique em [[Testar conexão]].', cena: 0 },
      ]} />
      {liberado ? (
        <>
          <TesteConexao estado={estado} />
          {estado.teste?.ok && (
            <div className="cpl-acoes">
              {contido ? <BotaoSec onClick={aoConcluido}>Continuar</BotaoSec> : <BotaoPrimario onClick={aoConcluido}>Continuar</BotaoPrimario>}
            </div>
          )}
        </>
      ) : (
        <Aviso tom="ne">Envie a chave (passo C) antes de testar.</Aviso>
      )}
    </div>
  );
}

/* ---------- (E) conferência ---------- */

const LIMITE_LISTA = 30;

/** resumo em números + lista expansível de cada grupo (um aberto por vez). Reusado no freio da Gestão. */
export function ResumoMudancas({ grupos }: { grupos: GrupoMudanca[] }) {
  const [aberto, setAberto] = useState<string | null>(null);
  const [mostrar, setMostrar] = useState(LIMITE_LISTA);
  const id = useId();
  return (
    <ul className="cpl-resumo" role="list">
      {grupos.map((g) => {
        const on = aberto === g.id;
        const vistos = Math.min(mostrar, g.itens.length);
        return (
          <li key={g.id} className={on ? 'cpl-res-item cpl-res-on' : 'cpl-res-item'}>
            <button type="button" className="cpl-res-linha" aria-expanded={on} aria-controls={`${id}-${g.id}`}
              disabled={g.total === 0} onClick={() => { setAberto(on ? null : g.id); setMostrar(LIMITE_LISTA); }}>
              <span className="cpl-res-n num">{fmtInt(g.total)}</span>
              <span className="cpl-res-tx">
                <span className="cpl-res-rot">{g.rotulo}</span>
                <span className="cpl-res-ef">{g.efeito}</span>
              </span>
              {g.total > 0 ? <Ic n="baixo" s={14} className="cpl-res-seta" /> : <span aria-hidden />}
            </button>
            {on && (
              <div id={`${id}-${g.id}`} className="cpl-res-lista">
                <ul className="cpl-lista-itens" role="list" aria-label={`${fmtInt(g.total)} ${g.rotulo}`}>
                  {g.itens.slice(0, mostrar).map((it, i) => (
                    <li key={i}><span className="cpl-lista-nome">{it.nome}</span><span className="cpl-lista-det num">{it.detalhe}</span></li>
                  ))}
                </ul>
                {g.total > vistos && (
                  <div className="cpl-lista-mais">
                    {g.itens.length > mostrar && <BotaoSec mini onClick={() => setMostrar((m) => m + 60)}>Mostrar mais</BotaoSec>}
                    <span className="num">mostrando {fmtInt(vistos)} de {fmtInt(g.total)}</span>
                  </div>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/* frase de cada grupo na confirmação ("7 clientes novos entram, 15 mudam de ciclo…") */
const VERBO: Record<GrupoMudanca['id'], (n: string) => string> = {
  novos: (n) => `${n} clientes novos entram`,
  ciclo: (n) => `${n} mudam de ciclo`,
  saem: (n) => `${n} saem da cobrança`,
  pagamentos: (n) => `${n} pagamentos são lançados`,
  telefones: (n) => `${n} telefones são atualizados`,
};
/** '7 clientes novos entram, 15 mudam de ciclo e 13 saem da cobrança' */
export function frasePlanoAplicar(grupos: GrupoMudanca[]): string {
  const ps = grupos.filter((g) => g.total > 0).map((g) => VERBO[g.id](fmtInt(g.total)));
  if (!ps.length) return 'nada muda';
  const t = ps.length === 1 ? ps[0] : `${ps.slice(0, -1).join(', ')} e ${ps[ps.length - 1]}`;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Conferir mudanças → resumo → Aplicar (confirmação inline). Reusado na troca de planilha da Gestão. */
export function ConferenciaMudancas({ estado, aoAplicado, liberado = true }: { estado: EstadoSync; aoAplicado?: () => void; liberado?: boolean }) {
  const conf = useAcaoSync(conferir);
  const apl = useAcaoSync(aplicar);
  const [confirmando, setConfirmando] = useState(false);
  const simRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (confirmando) simRef.current?.focus(); }, [confirmando]);
  const c = estado.conferencia;

  const rodarConferir = async () => { setConfirmando(false); await conf.executar(); };
  const rodarAplicar = async () => {
    if (!c) return;
    const e = await apl.executar(c.id);
    if (e) { setConfirmando(false); aoAplicado?.(); }
  };

  if (!c) {
    const aplicada = estado.aplicadaEm && !estado.exigeConferencia;
    return (
      <div className="cpl-conf">
        {aplicada && (
          <Aviso tom="ok" titulo={<>Conferência aplicada em <span className="num">{dataHoraBR(estado.aplicadaEm as string)}</span></>}>
            A planilha e o sistema estão alinhados. Daqui em diante, cada rodada leva as mudanças nos dois sentidos.
          </Aviso>
        )}
        {conf.pendente ? (
          <div className="cpl-carregando" role="status"><Giro />Lendo a planilha e comparando com o sistema… pode levar até 1 minuto.</div>
        ) : (
          <div className="cpl-acoes">
            {aplicada ? (
              <BotaoSec mini onClick={() => { void rodarConferir(); }} disabled={!liberado}>Conferir de novo</BotaoSec>
            ) : (
              liberado
                ? <BotaoPrimario onClick={() => { void rodarConferir(); }}>Conferir mudanças</BotaoPrimario>
                : <BotaoSec onClick={() => { void rodarConferir(); }} disabled>Conferir mudanças</BotaoSec>
            )}
          </div>
        )}
        <ErroAcao msg={conf.erro} />
      </div>
    );
  }

  return (
    <div className="cpl-conf">
      <div className="cpl-conf-cab">
        <span>Conferido às <span className="num">{horaBR(c.geradaEm)}</span> · <b className="num">{fmtInt(c.total)}</b> mudanças</span>
        <BotaoSec mini onClick={() => { void rodarConferir(); }} disabled={conf.pendente || apl.pendente} aria-busy={conf.pendente || undefined}>
          {conf.pendente ? <><Giro />Conferindo…</> : 'Conferir de novo'}
        </BotaoSec>
      </div>
      {c.total === 0 ? (
        <Aviso tom="ok">A planilha e o sistema já estão iguais. Aplique para registrar a primeira sincronização.</Aviso>
      ) : (
        <ResumoMudancas grupos={c.grupos} />
      )}
      {confirmando ? (
        <div className="cpl-confirma" role="group" aria-label="Confirmar a aplicação">
          <p className="cpl-confirma-tit">Aplicar estas mudanças?</p>
          <p className="cpl-confirma-tx">
            {c.total === 0 ? 'Nada muda nos clientes.' : <><b>{frasePlanoAplicar(c.grupos)}</b>. Quem sai da cobrança mantém o histórico.</>}
            {' '}A partir daqui, a planilha manda: em caso de conflito, vale o que estiver nela.
          </p>
          <div className="cpl-acoes">
            <BotaoSec onClick={() => setConfirmando(false)} disabled={apl.pendente}>Voltar</BotaoSec>
            {/* botão nativo com as classes do BotaoPrimario: precisa de ref p/ o foco (BotaoPrimario não repassa ref) */}
            <button ref={simRef} type="button" className="p-btn btn-pri" onClick={() => { void rodarAplicar(); }}
              disabled={apl.pendente} aria-busy={apl.pendente || undefined}>
              {apl.pendente ? <><Giro />Aplicando… não feche esta tela</> : 'Sim, aplicar'}
            </button>
          </div>
        </div>
      ) : (
        <div className="cpl-acoes">
          <BotaoPrimario onClick={() => setConfirmando(true)} disabled={conf.pendente}>Aplicar</BotaoPrimario>
        </div>
      )}
      <ErroAcao msg={apl.erro} />
    </div>
  );
}

function PassoConferir({ estado, liberado, aoConcluido }: { estado: EstadoSync; liberado: boolean; aoConcluido: () => void }) {
  return (
    <div className="cpl-corpo">
      <p className="cpl-intro">
        O sistema compara a planilha com o cadastro e mostra o que vai mudar. <b>Nada é gravado até você clicar em Aplicar.</b>
      </p>
      {liberado || estado.conferencia || estado.aplicadaEm ? (
        <ConferenciaMudancas estado={estado} aoAplicado={aoConcluido} liberado={liberado} />
      ) : (
        <Aviso tom="ne">Teste a conexão (passo D) antes de conferir as mudanças.</Aviso>
      )}
    </div>
  );
}

/* ---------- (F) automático ---------- */

export function codigoAppsScript(url: string, segredo: string): string {
  return [
    '// Reviza — atualização na hora',
    '// Avisa o sistema sempre que a planilha é editada.',
    '// Acionador: função avisarSistema · Da planilha · Ao editar.',
    `var URL_SISTEMA = '${url}';`,
    `var SEGREDO = '${segredo}';`,
    '',
    'function avisarSistema(e) {',
    "  var aba = e && e.range ? e.range.getSheet().getName() : '';",
    "  if (aba !== 'CLIENTES MENSAL' && aba !== 'cancelados') return;",
    '  UrlFetchApp.fetch(URL_SISTEMA, {',
    "    method: 'post',",
    "    contentType: 'application/json',",
    "    headers: { 'x-reviza-segredo': SEGREDO },",
    '    payload: JSON.stringify({ aba: aba, linha: e.range.getRow(), linhas: e.range.getNumRows() }),',
    '    muteHttpExceptions: true',
    '  });',
    '}',
  ].join('\n');
}

const GUIA_NA_HORA: ItemGuia[] = [
  { tx: 'Na planilha, abra o Apps Script.', menu: ['Extensões', 'Apps Script'] },
  'Apague o que estiver no editor, cole o código abaixo e clique em [[Salvar]].',
  { tx: 'Crie o acionador.', menu: ['Acionadores', 'Adicionar acionador'], det: 'Função [[avisarSistema]] · origem [[Da planilha]] · evento [[Ao editar]] · [[Salvar]]' },
  { tx: 'Autorize com a conta do escritório.', det: 'Se aparecer “O Google não verificou este app”, clique em [[Avançado]] e em [[Acessar]] — o script é seu — e depois em [[Permitir]]' },
];

export function BlocoNaHora({ estado }: { estado: EstadoSync }) {
  const na = estado.naHora;
  return (
    <details className="cpl-ajuda cpl-nahora">
      <summary>
        <Ic n="baixo" s={13} className="cpl-ajuda-seta" /><Ic n="raio" s={14} className="cpl-nahora-ic" />
        Atualização na hora<span className="cpl-tag-op">Opcional</span>
      </summary>
      <div className="cpl-nahora-corpo">
        <p className="cpl-intro">Sem isto, uma edição na planilha chega ao sistema em até <span className="num">{estado.intervaloMin}</span> minutos. Com isto, chega em segundos.</p>
        {na ? (
          <>
            <GuiaDemonstrada itens={GUIA_NA_HORA.map((it) => ({ it, cena: 0 }))}
              cenas={[{ Fig: FigAppsScript, legenda: 'Como aparece o Apps Script da planilha' }]} />
            <div className="cpl-codigo">
              <div className="cpl-codigo-cab">
                <span>Código do Apps Script</span>
                <BotaoCopiar texto={codigoAppsScript(na.url, na.segredo)} oQue="código do Apps Script" />
              </div>
              <pre className="cpl-codigo-pre" tabIndex={0} aria-label="Código do Apps Script"><code>{codigoAppsScript(na.url, na.segredo)}</code></pre>
            </div>
          </>
        ) : (
          <Aviso tom="ne">Ligue a sincronização automática para gerar o código.</Aviso>
        )}
      </div>
    </details>
  );
}

function PassoAutomatico({ estado, liberado }: { estado: EstadoSync; liberado: boolean }) {
  const acao = useAcaoSync(ligarAutomatico);
  const idRot = useId();
  return (
    <div className="cpl-corpo">
      <div className="cpl-auto">
        <Toggle ligado={estado.automatico} disabled={acao.pendente || (!liberado && !estado.automatico)}
          aoMudar={(v) => { void acao.executar(v); }} rotuladoPor={idRot} />
        <div className="cpl-auto-tx">
          <span id={idRot} className="cpl-auto-tit">Sincronizar automaticamente a cada {estado.intervaloMin} minutos</span>
          <span className="cpl-auto-sub">
            {acao.pendente ? 'Salvando…'
              : estado.automatico && estado.proximaRodada ? <>Ligado · próxima rodada às <span className="num">{horaBR(estado.proximaRodada)}</span></>
                : 'Se uma rodada for tirar muitos clientes da cobrança de uma vez, ela pausa e pede conferência.'}
          </span>
        </div>
      </div>
      {!liberado && !estado.automatico && <Aviso tom="ne">Aplique a conferência (passo E) antes de ligar.</Aviso>}
      <ErroAcao msg={acao.erro} />
      <BlocoNaHora estado={estado} />
    </div>
  );
}

/* ================= a etapa ================= */

const LETRA: Record<PassoId, string> = { link: 'A', acesso: 'B', chave: 'C', teste: 'D', conferir: 'E', automatico: 'F' };
const TITULO: Record<PassoId, string> = {
  link: 'Levar a planilha para o Google',
  acesso: 'Criar o acesso do sistema',
  chave: 'Enviar a chave',
  teste: 'Compartilhar e testar',
  conferir: 'Primeira sincronização em modo conferência',
  automatico: 'Ligar o automático',
};

type StatusPasso = 'concluido' | 'atual' | 'pendente';
const ROTULO_STATUS: Record<StatusPasso, string> = { concluido: 'Concluído', atual: 'Em andamento', pendente: 'Pendente' };

function resumoPasso(p: PassoId, e: EstadoSync): string | null {
  switch (p) {
    case 'link': return e.planilha ? `ID ${idCurto(e.planilha.id)}` : null;
    case 'acesso': return e.conta ? 'Conta de serviço criada' : null;
    case 'chave': return e.conta ? e.conta.email : null;
    case 'teste': return e.teste?.ok ? `${e.teste.clientes != null ? `${fmtInt(e.teste.clientes)} clientes · ` : ''}testado às ${horaBR(e.teste.quando)}` : null;
    case 'conferir': return e.aplicadaEm && !e.exigeConferencia ? `Aplicada em ${dataHoraBR(e.aplicadaEm)}` : null;
    case 'automatico': return e.automatico ? `Ligado · a cada ${e.intervaloMin} min` : null;
  }
}

export function EtapaPlanilha({ aoConcluir, concluida, comCabecalho = false }: {
  /** todos os passos prontos + clique em "Concluir etapa" (o assistente registra a etapa) */
  aoConcluir: () => void;
  /** a etapa já consta como concluída no assistente */
  concluida: boolean;
  /** desenha o próprio título (fora do assistente, que já mostra "Planilha de clientes", o lead e os fatos) */
  comCabecalho?: boolean;
}) {
  const qc = useQueryClient();
  const { estado, carregando } = useSyncPlanilha();
  const [acessoOk, setAcessoOk] = useState(acessoConfirmadoPrevia);
  const [escolhido, setAberto] = useState<PassoId | null | undefined>(undefined); // undefined = o usuário ainda não escolheu
  const cabRefs = useRef<Partial<Record<PassoId, HTMLButtonElement | null>>>({});
  const focarProx = useRef<PassoId | null>(null);
  const idBase = useId();

  // prévia: o assistente diz "concluída" (ex.: ?config=admin-whats-ok) e o store nasceu vazio → semeia
  const semeou = useRef(false);
  useEffect(() => {
    if (semeou.current || !concluida || !estado || estado.modo !== 'previa' || etapaPlanilhaConcluida(estado)) return;
    semeou.current = true;
    const e = semearPreviaConcluida();
    if (e) qc.setQueryData(chaveSync, e);
  }, [concluida, estado, qc]);

  const feitos = estado ? passosConcluidos(estado, acessoOk) : null;
  const primeiroPendente = feitos ? (PASSOS.find((p) => !feitos[p]) ?? null) : null;

  /* passo aberto: o que o usuário escolheu; antes disso, o primeiro pendente. Concluir o ÚLTIMO
     passo não recolhe a lista (o bloco opcional do passo F continua à vista); etapa que já chega
     concluída abre recolhida. */
  const derivado = concluida && !primeiroPendente ? null : primeiroPendente;
  const ultimoAuto = useRef<PassoId | null>(null);
  if (derivado) ultimoAuto.current = derivado;
  const aberto = escolhido !== undefined ? escolhido : (derivado ?? (concluida ? null : ultimoAuto.current));

  // foco no cabeçalho do passo que abriu sozinho (o botão que tinha o foco sumiu com o corpo)
  useEffect(() => {
    const p = focarProx.current;
    if (!p || aberto !== p) return;
    focarProx.current = null;
    const el = cabRefs.current[p];
    if (el) { el.focus(); el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  }, [aberto]);

  if (carregando || !estado || !feitos) {
    return <div className="cpl-raiz"><div className="cpl-carregando" role="status"><Giro />Carregando a configuração da planilha…</div></div>;
  }
  if (estado.modo === 'indisponivel') {
    return (
      <div className="cpl-raiz">
        <Aviso tom="ne" titulo="Conexão com a planilha indisponível">A conexão com o Google Planilhas ainda não está disponível neste ambiente.</Aviso>
      </div>
    );
  }

  const status = (p: PassoId): StatusPasso => (feitos[p] ? 'concluido' : p === primeiroPendente ? 'atual' : 'pendente');
  const nFeitos = PASSOS.filter((p) => feitos[p]).length;
  const concluidaDeFato = etapaPlanilhaConcluida(estado);

  /** concluiu o passo p → abre o próximo pendente (e leva o foco até ele) */
  const avancar = (p: PassoId) => {
    const i = PASSOS.indexOf(p);
    const prox = PASSOS[i + 1] ?? null;
    if (prox) { focarProx.current = prox; setAberto(prox); }
  };

  const corpo = (p: PassoId) => {
    switch (p) {
      case 'link': return <PassoLink estado={estado} aoConcluido={() => avancar('link')} />;
      case 'acesso': return <PassoAcesso feito={feitos.acesso} aoConcluido={() => { setAcessoOk(true); avancar('acesso'); }} />;
      case 'chave': return <PassoChave estado={estado} liberado={!!estado.planilha} aoConcluido={() => avancar('chave')} />;
      case 'teste': return <PassoTeste estado={estado} liberado={!!estado.planilha && !!estado.conta} aoConcluido={() => avancar('teste')} contido={concluidaDeFato && !concluida} />;
      case 'conferir': return <PassoConferir estado={estado} liberado={feitos.teste} aoConcluido={() => avancar('conferir')} />;
      case 'automatico': return <PassoAutomatico estado={estado} liberado={feitos.conferir} />;
    }
  };

  return (
    <div className="cpl-raiz">
      {comCabecalho && (
        <header className="cpl-topo">
          <h2 className="cpl-titulo">Planilha de clientes</h2>
          <p className="cpl-intro">Conecte a planilha do Google; o sistema sincroniza sozinho.</p>
        </header>
      )}

      {!concluidaDeFato && concluida && (
        <Aviso tom="at" titulo="Uma alteração reabriu esta etapa">Conclua os passos marcados como pendentes para a sincronização voltar a rodar.</Aviso>
      )}

      {/* o que a etapa constrói, em um desenho: planilha ⇄ sistema a cada 15 min (a legenda vive no SVG) */}
      <figure className="cpl-sinc">
        <FigSincronia />
      </figure>

      <ol className="cpl-passos">
        {PASSOS.map((p) => {
          const st = status(p);
          const on = aberto === p;
          const res = resumoPasso(p, estado);
          return (
            <li key={p} className={`cpl-passo cpl-passo-${st}${on ? ' cpl-passo-aberto' : ''}`}>
              <h3 className="cpl-passo-h">
                <button ref={(el) => { cabRefs.current[p] = el; }} type="button" className="cpl-passo-cab"
                  id={`${idBase}-${p}-cab`} aria-expanded={on} aria-controls={`${idBase}-${p}-corpo`}
                  onClick={() => setAberto(on ? null : p)}>
                  <span className="cpl-marca" aria-hidden>{st === 'concluido' ? <Ic n="check" s={14} /> : LETRA[p]}</span>
                  <span className="cpl-passo-tx">
                    <span className="cpl-passo-tit">
                      <span className="cpl-vh">Passo {LETRA[p]}: </span>{TITULO[p]}<span className="cpl-vh"> — {ROTULO_STATUS[st]}</span>
                    </span>
                    {res && !on && <span className="cpl-passo-res">{res}</span>}
                  </span>
                  <Ic n="baixo" s={14} className="cpl-passo-seta" />
                </button>
              </h3>
              {on && (
                <div className="cpl-passo-corpo" id={`${idBase}-${p}-corpo`} role="region" aria-labelledby={`${idBase}-${p}-cab`}>
                  {corpo(p)}
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {!concluida && (
        <div className="cpl-pe">
          {concluidaDeFato ? (
            <p className="cpl-pe-dica cpl-pe-ok">
              <span className="cpl-pe-ic" aria-hidden><Ic n="check" s={16} /></span>
              <span><b>Planilha conectada.</b> A sincronização automática está ligada.</span>
            </p>
          ) : (
            <div className="cpl-pe-dica cpl-pe-prog">
              <span className="cpl-pe-barra" role="progressbar" aria-label="Passos da etapa concluídos"
                aria-valuemin={0} aria-valuemax={PASSOS.length} aria-valuenow={nFeitos} aria-valuetext={`${nFeitos} de ${PASSOS.length} passos`}>
                <span style={{ width: `${(nFeitos / PASSOS.length) * 100}%` }} />
              </span>
              <span id={`${idBase}-prog`} className="num">{nFeitos} de {PASSOS.length} passos concluídos</span>
            </div>
          )}
          <div className="cpl-pe-acoes">
            {concluidaDeFato
              ? <BotaoPrimario onClick={aoConcluir}>Concluir etapa</BotaoPrimario>
              : <BotaoPrimario disabled aria-describedby={`${idBase}-prog`}>Concluir etapa</BotaoPrimario>}
          </div>
        </div>
      )}
    </div>
  );
}
