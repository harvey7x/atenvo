/* ============================================================
   Gestão de cobranças — a GRADE "Excel 2.0" (contrato §4,
   design-ref/PLANILHA-EXCEL-CONTRATO.md).

   Componente PURO: recebe tudo por props e devolve intenções por
   callbacks (onSalvar / onColuna / onLinha / onAbrirFicha). Sem fetch,
   sem RPC. Quem liga no banco é a tela (GestaoPlanilha).

   Desempenho (a tela que o dono usa o dia inteiro):
   - linhas virtualizadas (só as visíveis ±10) e memoizadas por linha;
   - seleção, edição, arrasto e redimensionar vivem em refs + camadas
     de overlay mexidas direto no DOM: nenhuma tecla ou movimento de
     mouse re-renderiza a grade;
   - largura de coluna durante o arrasto = só CSS var.

   Camadas (z-index dentro da lona): células 0 · peça rolável da
   seleção 1 · "+" do informar pagamento 1 (depois no DOM) · células
   congeladas 2 · números e peça congelada 3 · faixa dos números 4 ·
   editor 6 · letras 7 · indicador de mover 9.

   Pagamento (pedido do dono 25/09): célula de mês de cliente pinta pelo
   ESTADO — verde pago, amarelo aguardando o financeiro (valor informado
   + relógio), vermelho não pago/recusado — com as cores Bom/Neutro/Ruim
   do Excel; menu e "+" levam ao informar/aprovar/recusar (a tela faz).
   ============================================================ */
import {
  memo, useEffect, useLayoutEffect, useMemo, useRef, useState,
  type ClipboardEvent as RClipboardEvent, type CSSProperties, type FocusEvent as RFocusEvent,
  type KeyboardEvent as RKeyboardEvent, type MouseEvent as RMouseEvent, type MutableRefObject, type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { BotaoPrimario, BotaoSec, ConfirmDialogV2, Input, ModalV2 } from '../../components';
import { criarRaizPortalV2 } from '../../components/portal';
import { feriadosDoAno } from '../cicloCalendario';
import {
  compDaCelula, compSoma, ehEstadoPagamento, ehNaoPagou, estadoMes, estadoMesCelula, fmtValorBR, letraColuna, normalizarEstilo, valorBR,
  type EntradaCel, type EstadoMesCelula, type Estilo, type PlBloco, type PlCelula, type PlColuna, type PlColunaOp, type PlDados, type PlItem,
  type PlLinha, type PlLinhaOp,
} from '../../data/cobranca/planilha';
import './planilha.css';

/* ================= API pública ================= */

export type SenhasGrade = Map<string, { inss: string | null; reclame: string | null }>;

export interface PermsPlanilha {
  /** pode editar texto/estilo das células comuns da linha (não-cliente: financeiro+) */
  editarLinha: (l: PlLinha) => boolean;
  /** pode mexer nas células de mês da linha (pagamento) */
  editarMes: (l: PlLinha) => boolean;
  /** inserir/renomear/ocultar/mover/redimensionar coluna e inserir/excluir linha não-cliente (financeiro+) */
  estrutura: boolean;
  /** excluir coluna livre (gestor+) */
  excluirColuna: boolean;
  /** excluir cliente → Lixeira (gestor+) */
  excluirCliente: boolean;
  /** opcional: inserir cliente no bloco. Padrão: `estrutura` ou bloco de situação 'ativo' (NOVOS) */
  inserirCliente?: (bloco: PlBloco | null) => boolean;
  /** opcional: `false` = a coluna COMERCIAL das linhas de cliente não edita (o papel comercial não troca
      nem apaga o dono do cliente — o banco também barra). Ausente = segue `editarLinha` */
  trocarComercial?: boolean;
  /** opcional: pode tirar um pagamento já lançado (célula de mês de cliente com número/NÃO PAGOU que
      vira vazia ou nota — no banco é financeiro+). Sem ela, essas células são puladas e avisadas no
      limpar/recortar/colar/Ctrl+D, e o Ctrl+Z que tiraria um pagamento fica bloqueado.
      Ausente = vale `estrutura` (mesma regra: financeiro+) */
  removerPagamento?: boolean;
  /** opcional: pode INFORMAR pagamento (com comprovante, vai pro financeiro) nas células de mês desta
      linha de cliente — no banco (ent_ins) é o comercial dono, o gestor ou o admin. Ausente = ninguém
      (o item "Informar pagamento…" e o botão "+" do mouse não aparecem) */
  informarPagamento?: (l: PlLinha) => boolean;
  /** opcional: aprova/recusa o pagamento informado e vê o comprovante (financeiro, gestor, admin —
      confirmar_entrada/recusar_entrada no banco). Ausente = false */
  aprovarPagamento?: boolean;
}

/** o que a grade pede nas colunas — mesmo tipo do useColunaOps() */
export type OpColuna = PlColunaOp;
/** o que a grade pede nas linhas — mesmo tipo do useLinhaOps() (a grade emite inserir/excluir) */
export type OpLinha = PlLinhaOp;

/** de onde veio o lote (vai como p_origem na auditoria, se a tela quiser) */
export type OrigemSalvar = 'edicao' | 'colar' | 'recortar' | 'limpar' | 'formatar' | 'preencher' | 'desfazer' | 'refazer';

export interface PlanilhaExcelProps {
  dados: PlDados;
  /** senhas reveladas por lead (senhas_grade); manter estável (memo) */
  senhas: SenhasGrade | null;
  podeVerSenha: boolean;
  perms: PermsPlanilha;
  /** true = linha aparece. A numeração continua sendo a da folha inteira */
  filtro?: (l: PlLinha) => boolean;
  /** texto a destacar nas células (busca) */
  destaque?: string;
  /** lote de células (≤ 5000 por chamada). Se devolver Promise e ela falhar, a grade desfaz o otimista */
  onSalvar: (itens: PlItem[], origem?: OrigemSalvar) => void | Promise<unknown>;
  onColuna: (op: OpColuna) => void | Promise<unknown>;
  /** "Nova coluna de mês" do menu da coluna: a tela abre a confirmação dela (cabeçalho de cada ciclo).
      Ausente = cria direto com os cabeçalhos calculados */
  onNovoMes?: () => void;
  onLinha: (op: OpLinha) => void | Promise<unknown>;
  onAbrirFicha: (leadId: string) => void;
  /** id do bloco para rolar até o cabeçalho dele; "D24#2" re-dispara para o mesmo bloco */
  irParaBloco?: string;
  /** Ctrl/Cmd+F na grade: a tela foca a busca dela (o localizar do navegador não acha as linhas
      fora da janela virtualizada). Ausente = o Ctrl+F nativo segue */
  onBuscar?: () => void;
  className?: string;
  /** algo da tela no meio da barra de formatação (ex.: a legenda das cores) */
  barraExtra?: ReactNode;
  /** algo da tela no rodapé da grade, ao lado da contagem (crítica 12/11: a legenda das cores mora aqui) */
  rodapeExtra?: ReactNode;

  /* ---- fluxo de pagamento (informar → financeiro aprova/recusa) ----
     A COR da célula de mês de cliente sai de estadoMesCelula (planilha.ts): o texto da
     célula (pago / NÃO PAGOU) + o `e` da linha (entrada pendente / recusada, que vem no
     planilha_dados). Nada de prop extra para pintar. */
  /** "Informar pagamento…" (menu da célula de mês de cliente e botão "+" que aparece ao passar o
      mouse). Só aparece com `perms.informarPagamento(l)` e com o mês nem pago nem aguardando.
      A tela abre o modal (valor + comprovante) e grava a entrada */
  onInformarPagamento?: (a: { linhaId: string; colunaId: string; valor?: number }) => void;
  /** "Aprovar pagamento…" (célula amarela, `perms.aprovarPagamento`; a grade pede confirmação antes —
      é irreversível). id = entradas.id (o `e[col].id` da linha). Se devolver Promise e ela falhar,
      a grade avisa no rodapé. No menu, "Ver comprovante…" vem antes (1º item, sob o ponteiro) */
  onAprovarEntrada?: (id: string) => void | Promise<unknown>;
  /** "Recusar…" (célula amarela, `perms.aprovarPagamento`): a tela pede o motivo (opcional) e recusa */
  onRecusarEntrada?: (id: string) => void;
  /** "Ver comprovante" (célula amarela, `perms.aprovarPagamento`): a tela abre o arquivo (URL assinada) */
  onVerComprovante?: (id: string) => void;
  /** COMERCIAL (dono 27/10: "pro atendente mostra a porcentagem dele"): a célula de mês paga,
      aguardando ou recusada mostra a PARTE DELE em vez do líquido do escritório que ela guarda.
      Só exibição (célula, barra de fórmula, copiar, soma) — o que se grava segue o líquido.
      Ausente = mostra o que está na célula (admin, gestor, financeiro). Estável (useCallback) */
  parteDoValor?: (l: PlLinha, c: PlColuna, valor: number) => { valor: number; dica: string } | null;
  /** CANCELADOS (dono 27/10): "Mover para Cancelados…" no menu da linha de cliente — leva TODAS as
      linhas de cliente da seleção (ou só a clicada, se ela está fora da seleção). Ausente = sem o item */
  onMoverCancelados?: (leadIds: string[]) => void;
  /** a grade preenche com a função que devolve os clientes (leadId) das linhas selecionadas — o
      botão da barra da tela abre o "Mover para Cancelados" já com eles */
  clientesSelRef?: MutableRefObject<(() => string[]) | null>;
  /** a célula ativa mudou (seleção). Chamado FORA do render e só quando muda — bom p/ guardar num ref
      (ex.: o "Lançar pagamento" da barra aponta p/ a célula ativa). Evite setState aqui: cada seta
      re-renderizaria a tela */
  onCelulaAtiva?: (a: { linhaId: string; colunaId: string } | null) => void;
  /** a grade preenche com a função que devolve o foco a ela (sem rolar). A tela chama ao fechar
      os modais DELA (informar, recusar, comprovante) — senão o foco fica no body e as setas,
      o Enter e o Delete param até clicar na grade de novo */
  focarRef?: MutableRefObject<(() => void) | null>;
}

/* ================= constantes e utilidades ================= */

const ALT_PADRAO = 30;
const ALT_LETRAS = 24;
const LARG_RN = 46;
const SOBRA = 10;
const MAX_LOTE = 5000;
const CONGELADAS = 3;            // A–C
/** acima disto, limpar/recortar/colar/Ctrl+D pedem confirmação (contrato §4) */
const LIMITE_CONFIRMAR = 200;
/** altura de linha do editor quando o texto tem quebra (Alt+Enter) */
const ALT_LINHA_ED = 17;
const TRAVA = '••••••'; // senha que este papel não vê (célula .plx-c-trava, sem emoji no cromo)
const CHAVE_CONGELAR = 'plx_congelar_v1';

export const PALETA: { cor: string | null; nome: string }[] = [
  { cor: null, nome: 'Sem cor' },
  { cor: '#00B050', nome: 'Verde' },
  { cor: '#92D050', nome: 'Verde-claro' },
  { cor: '#FFFF00', nome: 'Amarelo' },
  { cor: '#FFC000', nome: 'Laranja' },
  { cor: '#FF0000', nome: 'Vermelho' },
  { cor: '#F4B084', nome: 'Salmão' },
  { cor: '#9BC2E6', nome: 'Azul-claro' },
  { cor: '#0070C0', nome: 'Azul' },
  { cor: '#7030A0', nome: 'Roxo' },
  { cor: '#D9D9D9', nome: 'Cinza' },
  { cor: '#000000', nome: 'Preto' },
];

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const d2 = (n: number) => String(n).padStart(2, '0');

/** "A" → 0, "Z" → 25, "AA" → 26 (inverso do letraColuna) */
function indiceDaLetra(s: string): number {
  let n = 0;
  for (const ch of s.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** mesma normalização do planilha.ts (#RRGGBB maiúsculo, b/i só quando true); vazio → null */
const normEstilo = (e: Estilo | null | undefined): Estilo | null => normalizarEstilo(e);
function chaveEstilo(e: Estilo | null | undefined): string {
  const n = normEstilo(e);
  return n ? `${n.bg ?? ''}|${n.fg ?? ''}|${n.b ? 1 : 0}|${n.i ? 1 : 0}|${n.al ?? ''}` : '';
}
function luminancia(hex: string): number | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const v = parseInt(m[1], 16);
  return (0.299 * (v >> 16) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255)) / 255;
}
/** contraste automático: fundo escuro sem cor de texto → branco */
const contraste = (bg: string) => ((luminancia(bg) ?? 1) < 0.55 ? '#FFFFFF' : '#111111');

const RE_DATA = /^\d{1,2}[/-](\d{1,2}|[a-zç]{3}\.?)([/-]\d{2,4})?$/i;
/** alinhamento padrão do Excel: número e data à direita */
const pareceNumero = (t: string) => valorBR(t) != null || RE_DATA.test(t.trim());

const campoTSV = (t: string) => (/[\t\n\r"]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t);
/** campo que começa com aspas em `i`: [valor, índice depois das aspas de fechamento] se elas fecham
    logo antes de tab, quebra ou fim (como o Excel escreve); senão null = o campo é texto cru.
    Para na 1ª aspa que não fecha nem é "" — por isso o custo total continua linear. */
function campoComAspas(s: string, i: number): [string, number] | null {
  let v = ''; let j = i + 1;
  while (j < s.length) {
    const ch = s[j];
    if (ch === '"') {
      if (s[j + 1] === '"') { v += '"'; j += 2; continue; }
      const prox = s[j + 1];
      return prox === undefined || prox === '\t' || prox === '\n' ? [v, j + 1] : null;
    }
    v += ch; j++;
  }
  return null;   // aspas sem fechar ("ABC do Excel sai cru): não engole o resto da área
}
/** TSV no padrão do Excel: aspas envolvem campos com tab/quebra/aspas; "" = aspas.
    Aspas só qualificam se abrem o campo E fecham antes de tab/quebra/fim — senão ficam no texto */
function lerTSV(txt: string): string[][] {
  const s = txt.replace(/\r\n?/g, '\n');
  const out: string[][] = [];
  let lin: string[] = []; let campo = ''; let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === '"' && campo === '') {
      const q = campoComAspas(s, i);
      if (q) { campo = q[0]; i = q[1]; continue; }
      campo = '"'; i++; continue;
    }
    if (ch === '\t') { lin.push(campo); campo = ''; i++; continue; }
    if (ch === '\n') { lin.push(campo); out.push(lin); lin = []; campo = ''; i++; continue; }
    campo += ch; i++;
  }
  lin.push(campo); out.push(lin);
  if (out.length > 1 && out[out.length - 1].length === 1 && out[out.length - 1][0] === '') out.pop();
  return out;
}

/** maior i (< fim) com arr[i] <= v; -1 se v < arr[0] */
function ultimoAte(arr: number[], v: number, fim = arr.length): number {
  let lo = 0, hi = fim - 1, r = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (arr[m] <= v) { r = m; lo = m + 1; } else hi = m - 1; }
  return r;
}
const limitar = (v: number, n: number) => Math.max(0, Math.min(n - 1, v));

function msgErro(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return typeof e === 'string' ? e : 'erro inesperado';
}
/** chama um callback que pode devolver Promise; erro (síncrono ou não) vai pro handler */
function chamar(fn: () => unknown, erro: (e: unknown) => void): void {
  try {
    const r = fn();
    if (r && typeof (r as PromiseLike<unknown>).then === 'function') (r as PromiseLike<unknown>).then(undefined, erro);
  } catch (e) { erro(e); }
}
function lerCongelar(): boolean {
  try { return localStorage.getItem(CHAVE_CONGELAR) !== '0'; } catch { return true; }
}
function gravarCongelar(v: boolean) {
  try { localStorage.setItem(CHAVE_CONGELAR, v ? '1' : '0'); } catch { /* preferência só local */ }
}

/* ---- data do INSS para o cabeçalho da nova coluna de mês ----
   Bloco = posição no calendário do INSS: dia ≥ 15 → últimos 5 dias úteis
   BANCÁRIOS do mês em que o dinheiro cai; dia < 15 → primeiros 5. Com até 5
   ciclos no lado, a posição é a ORDEM do ciclo no lado (D24…D30 = 1º…5º; é o
   que o INSS faz — e uma correção manual num mês não contamina o seguinte).
   Com mais de 5 no lado (ciclo aberto depois), vale a posição do cabeçalho
   anterior; na falta, o dia do ciclo. Duas datas iguais no mesmo lado nunca:
   a segunda vira o dia do ciclo. Cabeçalho anterior "DD/MM/AAAA" (dia do
   ciclo, como na demo) → segue o mesmo formato, com o dia do ciclo. */
function diasUteis(y: number, m: number): number[] {
  const fer = feriadosDoAno(y);
  // sem expediente bancário (o INSS não paga): 24 e 31/12 e a segunda de Carnaval (a terça já é feriado)
  const carn = Object.keys(fer).find((k) => fer[k] === 'Carnaval');
  const semBanco = new Set(['12-24', '12-31']);
  if (carn) { const [cm, cd] = carn.split('-').map(Number); const seg = new Date(y, cm - 1, cd - 1); semBanco.add(`${d2(seg.getMonth() + 1)}-${d2(seg.getDate())}`); }
  const ult = new Date(y, m, 0).getDate();
  const out: number[] = [];
  for (let d = 1; d <= ult; d++) {
    const w = new Date(y, m - 1, d).getDay();
    const md = `${d2(m)}-${d2(d)}`;
    if (w !== 0 && w !== 6 && !fer[md] && !semBanco.has(md)) out.push(d);
  }
  return out;
}
export function cabecalhosNovoMes(dados: PlDados, colunas: PlColuna[], k: number): Record<string, string> {
  const out: Record<string, string> = {};
  const colAnt = colunas.find((c) => c.tipo === 'mes' && c.mesPos === k - 1);
  const comBase = dados.blocos.filter((b) => b.compBase && b.dia != null);
  for (const fim of [true, false]) {
    const lado = comBase.filter((b) => ((b.dia as number) >= 15) === fim).sort((a, c) => (a.dia as number) - (c.dia as number));
    const usados = new Set<string>();
    lado.forEach((b, rank) => {
      const seqDe = (comp: string) => {
        const [y, m] = comp.split('-').map(Number);
        const u = diasUteis(y, m);
        return fim ? u.slice(-5) : u.slice(0, 5);
      };
      const comp = compSoma(b.compBase as string, k);
      const [y, m] = comp.split('-').map(Number);
      const diaCiclo = Math.min(b.dia as number, new Date(y, m, 0).getDate());
      const cab = dados.linhas.find((l) => l.tipo === 'cabecalho' && l.bloco === b.id);
      const txtAnt = cab && colAnt ? cab.c[colAnt.id]?.t ?? '' : '';
      let txt: string;
      if (/^\s*\d{1,2}\/\d{1,2}\/\d{4}\s*$/.test(txtAnt)) {
        txt = `${d2(diaCiclo)}/${d2(m)}/${y}`;                       // formato da demo (dia do ciclo)
      } else {
        let p = -1;
        if (lado.length <= 5) p = rank;
        else {
          const dAnt = /^\s*(\d{1,2})\s*[/-]/.exec(txtAnt);
          if (dAnt && k > 0) p = seqDe(compSoma(b.compBase as string, k - 1)).indexOf(Number(dAnt[1]));
        }
        const seq = seqDe(comp);
        txt = p >= 0 && seq[p] ? `${d2(seq[p])}/${MESES[m - 1]}` : `${d2(diaCiclo)}/${MESES[m - 1]}`;
        if (usados.has(txt)) txt = `${d2(diaCiclo)}/${MESES[m - 1]}`;
      }
      usados.add(txt);
      out[b.id] = txt;
    });
  }
  return out;
}

/* ---- ícones de traço (família 1.8 do shell; zero emoji no cromo) ---- */
const P = {
  desfazer: 'M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  refazer: 'M15 14l5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13',
  balde: 'M11 3 3.5 10.5a2 2 0 0 0 0 2.8l5.2 5.2a2 2 0 0 0 2.8 0L19 11zM4 12h14M20.5 15s1.5 1.8 1.5 3a1.5 1.5 0 0 1-3 0c0-1.2 1.5-3 1.5-3z',
  letraA: 'M6 16 12 3l6 13M8.4 11h7.2',
  alEsq: 'M4 6h16M4 10h10M4 14h16M4 18h10',
  alCen: 'M4 6h16M7 10h10M4 14h16M7 18h10',
  alDir: 'M4 6h16M10 10h10M4 14h16M10 18h10',
  borracha: 'M7 20h11M5.6 13.4 13 6l5 5-7.4 7.4a2 2 0 0 1-2.8 0l-2.2-2.2a2 2 0 0 1 0-2.8zM9 10l5 5',
  pino: 'M9 4h6l-.7 5 2.7 2.7V14H7v-2.3L9.7 9zM12 14v7',
  seta: 'M6 9l6 6 6-6',
  teclado: 'M3 6h18v12H3zM7 10h.01M11 10h.01M15 10h.01M7 14h10',
  relogio: 'M12 7.5V12l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
  mais: 'M12 5v14M5 12h14',
} as const;
const Ic = ({ d, s = 14 }: { d: string; s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);
/** mousedown sem roubar o foco da grade (a edição continua no lugar) */
const semFoco = (e: RMouseEvent) => e.preventDefault();

/* ================= estado de pagamento da célula de mês ================= */

let _fmtDH: Intl.DateTimeFormat | null = null;
/** "25/09 14:32" no fuso do negócio (cai no relógio local sem Intl com fuso) */
function dataHoraCurta(iso: string | null | undefined, comHora = true): string {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return '';
  const d = new Date(t);
  let p: Record<string, string> | null = null;
  try {
    _fmtDH ??= new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
    p = Object.fromEntries(_fmtDH.formatToParts(d).map((x) => [x.type, x.value]));
  } catch { /* sem fuso */ }
  const dd = p?.day ?? d2(d.getDate()); const mm = p?.month ?? d2(d.getMonth() + 1);
  const hh = p?.hour ?? d2(d.getHours()); const mi = p?.minute ?? d2(d.getMinutes());
  return comHora ? `${dd}/${mm} ${hh}:${mi}` : `${dd}/${mm}`;
}
/** "Ana (comercial)" → "Ana" (o sufixo do papel não diz nada na dica) */
const quemInformou = (por: string | null | undefined) => (por ?? '').replace(/\s*\([^)]*\)\s*$/, '').trim() || 'alguém';

/** o que a célula mostra por estado: classe de cor, texto no lugar do da célula e a dica */
interface EstVis { k: 'ok' | 'pend' | 'ruim' | 'sem'; mostra: string | null; dica: string; risca?: boolean; rel?: boolean; parte?: boolean }
/** `ent` = a entrada da célula (linha.e[coluna]) — só p/ a dica do NÃO PAGOU que tem recusa recente */
function visDoEstado(e: EstadoMesCelula, ent?: EntradaCel | null): EstVis | null {
  const x = e.entrada;
  switch (e.tipo) {
    case 'pendente': {
      const v = e.valor ?? x?.v ?? null;
      return {
        k: 'pend', mostra: v != null ? fmtValorBR(v) : null, rel: true,
        dica: `Aguardando o financeiro · informado por ${quemInformou(x?.por)}${x?.em ? ` em ${dataHoraCurta(x.em)}` : ''} · ${x?.cp ? 'com comprovante' : 'sem comprovante'}`,
      };
    }
    case 'pago': return { k: 'ok', mostra: null, dica: 'Pago' };
    case 'nao_pagou': {
      // NÃO PAGOU vence a recusa, mas a recusa recente continua na dica
      if (ent?.st !== 'recusada') return { k: 'ruim', mostra: null, dica: 'Não pago' };
      const quando = dataHoraCurta(ent.dec ?? ent.em, false); const motivo = (ent.mot ?? '').trim();
      return { k: 'ruim', mostra: null, dica: `Não pago · o financeiro recusou ${fmtValorBR(ent.v)}${quando ? ` em ${quando}` : ''}${motivo ? ` — ${motivo}` : ''}` };
    }
    case 'recusado': {
      const v = e.valor ?? x?.v ?? null;
      const quando = dataHoraCurta(x?.dec ?? x?.em, false);
      const motivo = (x?.mot ?? '').trim();
      return { k: 'ruim', mostra: v != null ? fmtValorBR(v) : null, risca: true, dica: `Recusado pelo financeiro${quando ? ` em ${quando}` : ''}${motivo ? ` — ${motivo}` : ''}` };
    }
    default: return null;
  }
}
/** mês que já venceu e ninguém informou (célula vazia ou só uma data escrita): quadrado branco
    "Sem pagamento informado" (dono 25/09). O texto real segue na barra de fórmula */
const RE_SO_DATA = /^\s*\d{1,2}\/(\d{1,2}|[A-Za-zÀ-ú]{3}\.?)(\/\d{2,4})?\s*$/;
function visSemInformacao(txt: string | null | undefined): EstVis | null {
  const t = (txt ?? '').trim();
  if (t && !RE_SO_DATA.test(t)) return null;
  return {
    k: 'sem', mostra: 'Sem pagamento informado',
    dica: `Sem pagamento informado — clique duas vezes para informar se pagou ou não${t ? ` · na planilha: ${t}` : ''}`,
  };
}
const assinaturaVis = (v: EstVis) => `${v.k}\u0001${v.mostra ?? ''}\u0001${v.dica}\u0001${v.risca ? 1 : 0}\u0001${v.parte ? 1 : 0}`;

/** Legenda das cores de pagamento — três "células" de amostra, como a galeria de estilos
    Bom/Neutro/Ruim do Excel (mesmas cores da grade, nos 2 temas). Vai acima da grade */
export function LegendaEstados({ className }: { className?: string }) {
  return (
    <div className={`plx-legenda${className ? ` ${className}` : ''}`} role="note" aria-label="Legenda das cores dos pagamentos">
      <span className="plx-leg-am plx-st-ok" title="Pagamento confirmado">Pago</span>
      <span className="plx-leg-am plx-st-pend" title="Pagamento informado com comprovante — o financeiro ainda vai conferir">
        <span className="plx-rel"><Ic d={P.relogio} s={10} /></span>Aguardando financeiro
      </span>
      <span className="plx-leg-am plx-st-ruim" title="NÃO PAGOU, ou o financeiro recusou o pagamento informado">Não pago / recusado</span>
      <span className="plx-leg-am plx-st-sem" title="Sem pagamento informado: o mês já venceu e ninguém informou se o cliente pagou ou não">A informar</span>
    </div>
  );
}

/* ================= tipos internos ================= */

interface ColV {
  id: string; li: number; letra: string; titulo: string;
  tipo: PlColuna['tipo']; campo: PlColuna['campo']; mesPos: number | null;
  w: number; fixa: number; ultFixa: boolean;
  /** colunas ocultas logo antes desta (ids) — marcador para mostrar */
  ocultasAntes: string[];
}
interface Lay {
  vis: PlLinha[]; num: number[]; cols: ColV[]; tops: number[];
  xs: number[]; ws: number[]; nFix: number; fixR: number; larg: number;
  idxL: Map<string, number>; idxC: Map<string, number>; idxNum: Map<number, number>; idxLi: Map<number, number>;
}
interface Sel { modo: 'cel' | 'lin' | 'col' | 'tudo'; ar: number; ac: number; fr: number; fc: number; tr: number; tc: number }
interface Faixa { r0: number; r1: number; c0: number; c1: number }
/** lote do desfazer local. `bloqueio` = marca que não volta (ex.: senha) e explica o porquê */
interface Lote { antes: PlItem[]; depois: PlItem[]; origem: OrigemSalvar; bloqueio?: string }
/** `orig` = texto exato da célula (vai pro desfazer); `base` = o mesmo como o editor mostra
    (textarea normaliza CRLF → LF): só grava se o valor mudou em relação a `base` */
interface Edicao { modo: 'digitar' | 'editar'; l: string; c: string; orig: string; base: string; valor: string; via: 'cel' | 'fx'; w: number }
/** por que um texto não entra numa célula: sem permissão · dado de cliente fora de linha de
    cliente · tiraria um pagamento lançado sem `removerPagamento` */
type Veto = 'perm' | 'soCliente' | 'pagamento' | 'informar';
/** contagem do que um lote pulou (vira um aviso só) */
interface Pulos { semPerm: number; senhas: number; fora: number; soCliente: number; pagamento: number; informar: number }
const semPulos = (): Pulos => ({ semPerm: 0, senhas: 0, fora: 0, soCliente: 0, pagamento: 0, informar: 0 });
function contarVeto(p: Pulos, v: Veto) {
  if (v === 'soCliente') p.soCliente++; else if (v === 'pagamento') p.pagamento++; else if (v === 'informar') p.informar++; else p.semPerm++;
}
interface Pend { cel: PlCelula; ts: number }
type PatchCol = { titulo?: string; largura?: number; oculta?: boolean; ordem?: number; ts: number };
type SenhaLocal = { inss?: string | null; reclame?: string | null; ts: number };
type SenhaPar = { inss: string | null; reclame: string | null };

interface ApiGrade {
  ouvir: (fn: () => void) => () => void;
  faixa: () => Faixa | null;
  lay: () => Lay;
  texto: (l: PlLinha, c: ColV) => string;
  /** `estado` = dica do pagamento da célula de mês ("Pago", "Aguardando o financeiro · …") */
  ativo: () => { l: PlLinha; c: ColV; editavel: boolean; estado?: string } | null;
  estiloAtivo: () => Estilo | null;
  podeDesfazer: () => boolean;
  podeRefazer: () => boolean;
  desfazer: () => void;
  refazer: () => void;
  formatar: (p: Partial<Estilo> | null) => void;
  alternar: (k: 'b' | 'i') => void;
  alinhar: (al: 'l' | 'c' | 'r') => void;
  focar: () => void;
  /** clientes (leadId) das linhas selecionadas */
  clientesSel: () => string[];
}

interface ItemMenu { rotulo?: string; atalho?: string; acao?: () => void; perigo?: boolean; desab?: boolean; sep?: boolean }
interface CtlMenu { abrir: (x: number, y: number, itens: ItemMenu[], titulo?: string) => void; fechar: () => void }
interface CtlDlg {
  confirmar: (o: { titulo: string; msg: ReactNode; rotulo: string; destrutivo?: boolean; aoOk: () => void; aoCancelar?: () => void }) => void;
  renomear: (o: { titulo: string; valor: string; aoOk: (v: string) => void }) => void;
}
interface CtlRodape { aviso: (msg: string, tom?: 'info' | 'erro') => void }

const ehSenhaCol = (c: { campo: PlColuna['campo'] }) => c.campo === 'senha_inss' || c.campo === 'reclame';
const ehSenha = (l: PlLinha, c: ColV) => l.tipo === 'cliente' && ehSenhaCol(c);
/** senha, CPF, NB e telefone: dado de cliente, que só vai em linha de cliente. Linha em branco e
    rótulo são visíveis para todos os papéis — ali esses textos ficariam expostos (e sem virar lead) */
const ehDadoCliente = (c: { campo: PlColuna['campo'] }) => ehSenhaCol(c) || c.campo === 'cpf' || c.campo === 'nb' || c.campo === 'telefone';
const soDeCliente = (l: PlLinha, c: { campo: PlColuna['campo'] }) => (l.tipo === 'vazia' || l.tipo === 'rotulo') && ehDadoCliente(c);
const MSG_SO_CLIENTE = 'Senha, CPF, NB e telefone só vão em linha de cliente — use "Inserir cliente" no menu da linha';
const MSG_TIRA_PAGAMENTO = 'Apagar um pagamento já lançado é com o financeiro, gestor ou admin';
const MSG_INFORMAR = 'Pagamento do comercial vai para o financeiro aprovar: digite o valor numa célula e dê Enter (ou duplo clique) para informar com o comprovante';
/** quebra de linha dentro da célula (Alt+Enter), no ponto do cursor */
function inserirQuebra(el: HTMLTextAreaElement) {
  const a = el.selectionStart ?? el.value.length; const b = el.selectionEnd ?? a;
  el.setRangeText('\n', a, b, 'end');
}

/* ================= linha (memo) ================= */

interface PropsLinha {
  l: PlLinha; num: number; top: number; alt: number; cols: ColV[];
  dest: string; senha: SenhaPar | undefined; verSenha: boolean;
  /** estado de pagamento por coluna de mês (só as células que têm estado); objeto estável se nada mudou */
  est: Record<string, EstVis> | undefined;
}

/** alinhamento padrão por TIPO de coluna (o manual da célula sempre vence): meses e datas
    ao centro, dinheiro à direita, documentos (CPF/NB/telefone) à esquerda com dígitos alinhados */
function alPadrao(c: ColV, txt: string, cab: boolean, trava: boolean): 'l' | 'c' | 'r' {
  if (cab) return c.tipo === 'mes' || c.campo === 'fechamento' || c.campo === 'valor' ? 'c' : 'l';
  if (c.tipo === 'mes' || c.campo === 'fechamento') return 'c';
  if (c.campo === 'valor') return 'r';
  if (c.campo === 'cpf' || c.campo === 'nb' || c.campo === 'telefone' || trava) return 'l';
  return txt && pareceNumero(txt) ? 'r' : 'l';
}
const COL_DOC = new Set(['cpf', 'nb', 'telefone', 'valor', 'fechamento']);

function renderCel(l: PlLinha, c: ColV, dest: string, senha: SenhaPar | undefined, verSenha: boolean, ev: EstVis | undefined, sepEsq = false) {
  const cel = l.c[c.id];
  const s = cel?.s ?? null;
  const cab = l.tipo === 'cabecalho';
  let txt = cel?.t ?? '';
  let cls = 'plx-c';
  let trava = false;
  if (l.tipo === 'cliente' && ehSenhaCol(c)) {
    if (!verSenha) { txt = TRAVA; trava = true; cls += ' plx-c-trava'; }
    else txt = (c.campo === 'senha_inss' ? senha?.inss : senha?.reclame) ?? '';
  }
  // aguardando/recusado: a célula mostra o valor INFORMADO (a barra de fórmula segue com o texto real)
  if (ev?.mostra != null) txt = ev.mostra;
  const st: Record<string, string> = {};
  if (c.fixa >= 0) { cls += c.ultFixa ? ' plx-c-fixa plx-c-ult' : ' plx-c-fixa'; st.left = `var(--plx-f${c.fixa})`; }
  const al = s?.al ?? alPadrao(c, txt, cab, trava);
  if (sepEsq) cls += ' plx-c-sep';
  if (c.campo && COL_DOC.has(c.campo)) cls += ' plx-c-doc';
  if (c.tipo === 'mes') cls += ' plx-c-mes';
  if (al === 'r') cls += ' plx-al-r'; else if (al === 'c') cls += ' plx-al-c';
  if (s?.b) cls += ' plx-b';
  if (s?.i) cls += ' plx-i';
  if (ev) {
    // cor de ESTADO (Bom/Neutro/Ruim do Excel) vence o fundo/texto manual; negrito/itálico/alinhamento continuam
    cls += ` plx-st plx-st-${ev.k}`;
    if (ev.risca) cls += ' plx-st-risca';
  } else if (s?.bg || s?.fg) {
    if (s.bg) { st.backgroundColor = s.bg; if (!s.fg) st.color = contraste(s.bg); }
    if (s.fg) {
      st.color = s.fg; st['--plx-fg'] = s.fg;
      if (!s.bg) { const lu = luminancia(s.fg); if (lu != null && lu < 0.2) cls += ' plx-fg-esc'; else if (lu != null && lu > 0.88) cls += ' plx-fg-cla'; }
    }
  } else if (!cab && c.tipo === 'mes' && txt && !trava) {
    // cor AUTOMÁTICA só de texto; estilo explícito sempre vence
    if (ehNaoPagou(txt)) cls += ' plx-np';
    else { const v = valorBR(txt); if (v != null && v > 0) cls += ' plx-pg'; }
  }
  if (dest && txt && !trava && semAcento(txt).includes(dest)) cls += ' plx-hit';
  return (
    <div key={c.id} className={cls} style={st as CSSProperties} role="gridcell" aria-colindex={c.li + 2}
      title={trava ? 'Sem permissão para ver a senha' : ev ? ev.dica : txt || undefined}>
      {ev?.k === 'sem'
        ? <span className="plx-sem-txt">A informar</span>
        : cab && txt
          // crítica 12/11: o título da coluna quebra em até 2 linhas em vez de cortar ("DATA FECH…")
          ? <span className="plx-cab-txt">{txt}</span>
          : <>{ev?.rel && <span className="plx-rel" aria-hidden="true"><Ic d={P.relogio} s={10} /></span>}{txt}</>}
    </div>
  );
}

const Linha = memo(function Linha({ l, num, top, alt, cols, dest, senha, verSenha, est }: PropsLinha) {
  const cls = 'plx-lin' + (l.tipo === 'cabecalho' ? ' plx-lin-cab' : l.tipo === 'rotulo' ? ' plx-lin-rot' : l.tipo === 'vazia' ? ' plx-lin-vazia'
    : num % 2 === 0 ? ' plx-lin-cli plx-lin-z' : ' plx-lin-cli');
  return (
    <div className={cls} style={{ top, height: alt, '--h': `${alt}px` } as CSSProperties} role="row" aria-rowindex={num + 1}>
      <div className="plx-rn" data-rn="" role="rowheader">
        {num}
        <button type="button" className="plx-rn-menu" data-menu-linha="" tabIndex={-1} aria-label={`Opções da linha ${num}`}><Ic d={P.seta} s={10} /></button>
      </div>
      {cols.map((c, i) => renderCel(l, c, dest, senha, verSenha, est?.[c.id], i > 0 && c.tipo === 'mes' && cols[i - 1].tipo !== 'mes'))}
    </div>
  );
});

/* ================= componente ================= */

export function PlanilhaExcel(props: PlanilhaExcelProps) {
  const { dados, senhas, podeVerSenha, perms, filtro, destaque, irParaBloco, className, parteDoValor } = props;
  const pr = useRef(props);
  pr.current = props;

  const [congelar, setCongelar] = useState<boolean>(lerCongelar);
  const [pend, setPend] = useState<Map<string, Map<string, Pend>>>(() => new Map());
  const [colPatch, setColPatch] = useState<Map<string, PatchCol>>(() => new Map());
  const [senhaLocal, setSenhaLocal] = useState<Map<string, SenhaLocal>>(() => new Map());
  const [janela, setJanela] = useState<{ a: number; b: number }>({ a: 0, b: 60 });
  // espelho da janela: só chama setState quando MUDA (setState "igual" num layout effect
  // ainda agenda render e re-roda os updaters pendentes → laço de renders)
  const janelaRef = useRef(janela);

  const gradeRef = useRef<HTMLDivElement>(null);
  const lonaRef = useRef<HTMLDivElement>(null);
  const cabBandRef = useRef<HTMLDivElement>(null);
  const selBandRef = useRef<HTMLDivElement>(null);
  const cpBandRef = useRef<HTMLDivElement>(null);
  const rnBandRef = useRef<HTMLDivElement>(null);
  const atBandRef = useRef<HTMLDivElement>(null);
  const atRef = useRef<HTMLDivElement>(null);
  // editor e barra de fórmula = textarea de 1 linha: guardam a quebra de linha (o <input> apaga)
  const sinkRef = useRef<HTMLTextAreaElement>(null);
  const nomeRef = useRef<HTMLInputElement>(null);
  const fxRef = useRef<HTMLTextAreaElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const sel = useRef<Sel>({ modo: 'cel', ar: 0, ac: 0, fr: 0, fc: 0, tr: 0, tc: 0 });
  const selIds = useRef<Record<'ar' | 'fr' | 'tr' | 'ac' | 'fc' | 'tc', string | undefined> | null>(null);
  const copia = useRef<{ l0: string; l1: string; c0: string; c1: string; recorte: boolean } | null>(null);
  const ed = useRef<Edicao | null>(null);
  const compondo = useRef(false);
  const bloqueado = useRef(false);
  const pilhaD = useRef<Lote[]>([]);
  const pilhaR = useRef<Lote[]>([]);
  const clip = useRef<{ tsv: string; estilos: (Estilo | null)[][] } | null>(null);
  const ouvintes = useRef(new Set<() => void>());
  const arr = useRef<{ tipo: 'cel' | 'lin' | 'col'; x: number; y: number; raf: number } | null>(null);
  const rafD = useRef(0);
  const rafJ = useRef(0);
  const menu = useRef<CtlMenu | null>(null);
  const dlg = useRef<CtlDlg | null>(null);
  const rod = useRef<CtlRodape | null>(null);
  // botão "+" do informar pagamento (hover) e a célula ativa avisada à tela
  const maisRef = useRef<HTMLButtonElement>(null);
  const maisAlvo = useRef<{ linhaId: string; colunaId: string } | null>(null);
  const mouse = useRef<{ x: number; y: number } | null>(null);
  const rafM = useRef(0);
  const ultAtiva = useRef<string | null>(null);

  /* ---------- derivados ---------- */
  const linhaPorId = useMemo(() => new Map(dados.linhas.map((l) => [l.id, l])), [dados.linhas]);
  const numPorId = useMemo(() => {
    const m = new Map<string, number>();
    dados.linhas.forEach((l, i) => m.set(l.id, i + 1));
    return m;
  }, [dados.linhas]);
  const blocoPorId = useMemo(() => new Map(dados.blocos.map((b) => [b.id, b])), [dados.blocos]);

  const colunasEf = useMemo(() => {
    if (!colPatch.size) return dados.colunas;
    return dados.colunas.map((c) => {
      const p = colPatch.get(c.id);
      if (!p) return c;
      const n = { ...c };
      if (p.titulo !== undefined) n.titulo = p.titulo;
      if (p.largura !== undefined) n.largura = p.largura;
      if (p.oculta !== undefined) n.oculta = p.oculta;
      if (p.ordem !== undefined) n.ordem = p.ordem;
      return n;
    });
  }, [dados.colunas, colPatch]);
  const colsOrd = useMemo(() => [...colunasEf].sort((a, b) => a.ordem - b.ordem), [colunasEf]);

  const cols = useMemo<ColV[]>(() => {
    const out: ColV[] = [];
    let ocultas: string[] = [];
    let nf = 0;
    colsOrd.forEach((c, li) => {
      if (c.oculta) { ocultas.push(c.id); return; }
      const fixa = congelar && li < CONGELADAS ? nf++ : -1;
      out.push({
        id: c.id, li, letra: letraColuna(li), titulo: c.titulo, tipo: c.tipo, campo: c.campo, mesPos: c.mesPos,
        w: Math.max(30, Math.min(900, c.largura || 110)), fixa, ultFixa: false, ocultasAntes: ocultas,
      });
      ocultas = [];
    });
    if (nf > 0) { const u = out.find((c) => c.fixa === nf - 1); if (u) u.ultFixa = true; }
    return out;
  }, [colsOrd, congelar]);
  const ocultasFim = useMemo(() => {
    const ult = cols[cols.length - 1];
    return colsOrd.filter((c) => c.oculta && (!ult || c.ordem > colsOrd[ult.li].ordem)).map((c) => c.id);
  }, [cols, colsOrd]);

  const linhasEf = useMemo(() => {
    if (!pend.size) return dados.linhas;
    return dados.linhas.map((l) => {
      const p = pend.get(l.id);
      if (!p) return l;
      const c = { ...l.c };
      p.forEach((v, k) => { if (v.cel.t == null && !v.cel.s) delete c[k]; else c[k] = v.cel; });
      return { ...l, c };
    });
  }, [dados.linhas, pend]);
  const vis = useMemo(() => (filtro ? linhasEf.filter(filtro) : linhasEf), [linhasEf, filtro]);

  const senhasEf = useMemo<SenhasGrade | null>(() => {
    if (!senhaLocal.size) return senhas;
    const m: SenhasGrade = new Map(senhas ?? []);
    senhaLocal.forEach((v, lid) => {
      const b = m.get(lid) ?? { inss: null, reclame: null };
      m.set(lid, { inss: v.inss !== undefined ? v.inss : b.inss, reclame: v.reclame !== undefined ? v.reclame : b.reclame });
    });
    return m;
  }, [senhas, senhaLocal]);
  const senhasEfRef = useRef(senhasEf);
  senhasEfRef.current = senhasEf;
  const linhaPorIdRef = useRef(linhaPorId);
  linhaPorIdRef.current = linhaPorId;
  const colsOrdRef = useRef(colsOrd);
  colsOrdRef.current = colsOrd;
  const colPorId = useMemo(() => new Map(colsOrd.map((c) => [c.id, c])), [colsOrd]);
  const colPorIdRef = useRef(colPorId);
  colPorIdRef.current = colPorId;
  const blocoPorIdRef = useRef(blocoPorId);
  blocoPorIdRef.current = blocoPorId;

  const dest = useMemo(() => (destaque ? semAcento(destaque.trim()) : ''), [destaque]);

  /* ---------- estado de pagamento (células de mês de cliente) ----------
     estadoMesCelula (planilha.ts) = texto da célula + o `e` da linha (entradas).
     Calculado quando a folha muda (nunca por tecla/mouse); o objeto de cada linha
     é reaproveitado se nada mudou nela (o memo da linha segura). */
  const cacheEst = useRef(new Map<string, { sig: string; obj: Record<string, EstVis> }>());
  const estPorLinha = useMemo(() => {
    const out = new Map<string, Record<string, EstVis>>();
    const novo = new Map<string, { sig: string; obj: Record<string, EstVis> }>();
    const meses = colsOrd.filter((c) => c.tipo === 'mes' && !c.oculta);
    const agora = new Date();
    const compHoje = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;
    const diaHoje = agora.getDate();
    const diaDoBloco = new Map(dados.blocos.map((b) => [b.id, b.dia ?? 0]));
    if (meses.length) {
      for (const l of vis) {
        if (l.tipo !== 'cliente') continue;
        const obj: Record<string, EstVis> = {}; let sig = '';
        for (const c of meses) {
          const em = estadoMesCelula(l, c, dados);
          let v = visDoEstado(em, l.e?.[c.id]);
          if (v && parteDoValor && em.valor != null && (em.tipo === 'pago' || em.tipo === 'pendente' || em.tipo === 'recusado')) {
            const p = parteDoValor(l, c, em.valor);
            if (p) v = { ...v, mostra: fmtValorBR(p.valor), dica: `${v.dica} · ${p.dica}`, parte: true };
          }
          if (!v) {
            // só mês ligado a pagamento (tem competência) e que JÁ VENCEU: mês passado, ou o mês
            // corrente depois do dia do ciclo (D28 em 25/09 ainda não venceu)
            const comp = compDaCelula(dados, l, c);
            const venceu = !!comp && (comp < compHoje || (comp === compHoje && (diaDoBloco.get(l.bloco ?? '') ?? 0) <= diaHoje));
            if (venceu) v = visSemInformacao(l.c[c.id]?.t);
          }
          if (!v) continue;
          obj[c.id] = v;
          sig += `${c.id}\u0002${assinaturaVis(v)}\u0003`;
        }
        if (!sig) continue;
        const ant = cacheEst.current.get(l.id);
        const final = ant && ant.sig === sig ? ant.obj : obj;
        novo.set(l.id, { sig, obj: final });
        out.set(l.id, final);
      }
    }
    cacheEst.current = novo;
    return out;
  }, [vis, colsOrd, dados, parteDoValor]);
  const estRef = useRef(estPorLinha);
  estRef.current = estPorLinha;

  const geoCols = useMemo(() => {
    const xs: number[] = []; const ws: number[] = [];
    let x = LARG_RN; let nFix = 0; let fixR = LARG_RN;
    for (const c of cols) { xs.push(x); ws.push(c.w); x += c.w; if (c.fixa >= 0) { nFix++; fixR = x; } }
    return { xs, ws, nFix, fixR, larg: x };
  }, [cols]);

  const lay = useMemo<Lay>(() => {
    const tops: number[] = [0];
    for (const l of vis) tops.push(tops[tops.length - 1] + (l.altura && l.altura >= 14 && l.altura <= 400 ? l.altura : ALT_PADRAO));
    const idxL = new Map<string, number>(); const idxNum = new Map<number, number>();
    const num = vis.map((l, i) => { idxL.set(l.id, i); const n = numPorId.get(l.id) ?? i + 1; idxNum.set(n, i); return n; });
    const idxC = new Map<string, number>(); const idxLi = new Map<number, number>();
    cols.forEach((c, i) => { idxC.set(c.id, i); idxLi.set(c.li, i); });
    return { vis, num, cols, tops, xs: [...geoCols.xs], ws: [...geoCols.ws], nFix: geoCols.nFix, fixR: geoCols.fixR, larg: geoCols.larg, idxL, idxC, idxNum, idxLi };
  }, [vis, cols, geoCols, numPorId]);
  const layRef = useRef(lay);
  layRef.current = lay;

  const estiloLona = useMemo(() => {
    const st: Record<string, string> = {};
    let tpl = `${LARG_RN}px`; let x = LARG_RN;
    cols.forEach((c, i) => {
      st[`--plx-c${i}`] = `${c.w}px`;
      tpl += ` var(--plx-c${i})`;
      if (c.fixa >= 0) st[`--plx-f${c.fixa}`] = `${x}px`;
      x += c.w;
    });
    st['--plx-tpl'] = tpl;
    st['--plx-w'] = `${x}px`;
    return st as CSSProperties;
  }, [cols]);

  const totais = useMemo(() => ({ linhas: vis.length, clientes: vis.reduce((n, l) => n + (l.tipo === 'cliente' ? 1 : 0), 0) }), [vis]);

  /* ---------- células: texto, permissões ---------- */
  function textoCel(l: PlLinha, c: ColV): string {
    if (ehSenha(l, c)) {
      if (!pr.current.podeVerSenha || !l.leadId) return '';
      const s = senhasEfRef.current?.get(l.leadId);
      return (c.campo === 'senha_inss' ? s?.inss : s?.reclame) ?? '';
    }
    return l.c[c.id]?.t ?? '';
  }
  /** o que a pessoa VÊ na célula para ler/copiar/somar: a parte do comercial (parteDoValor) no lugar
      do líquido do escritório — só no mês PAGO (aguardando/recusado não entram na soma nem na cópia,
      como antes). O resto é o texto da célula. Edição e gravação usam textoCel */
  function textoVisto(l: PlLinha, c: ColV): string {
    const v = estRef.current.get(l.id)?.[c.id];
    return v?.parte && v.k === 'ok' && v.mostra != null ? v.mostra : textoCel(l, c);
  }
  /** pode mexer no texto da célula (começar a editar; barra de fórmula não é só leitura) */
  function podeTexto(l: PlLinha, c: ColV): boolean {
    const p = pr.current.perms;
    if (l.tipo !== 'cliente') {
      if (!p.editarLinha(l)) return false;
      // senha/CPF/NB/telefone em linha em branco ou rótulo: só dá para APAGAR o que já está lá
      return soDeCliente(l, c) ? textoCel(l, c) !== '' : true;
    }
    if (c.tipo === 'mes') return p.editarMes(l);
    if (ehSenhaCol(c)) return pr.current.podeVerSenha && p.editarLinha(l);
    if (c.campo === 'comercial' && p.trocarComercial === false) return false;
    return p.editarLinha(l);
  }
  const podeRemoverPagamento = () => { const p = pr.current.perms; return p.removerPagamento ?? p.estrutura; };
  /** célula de mês ligada a `pagamentos` (cliente num bloco com mês-base; NOVOS não liga) */
  function ligaPagamento(l: PlLinha, c: { tipo: PlColuna['tipo'] }): boolean {
    if (l.tipo !== 'cliente' || c.tipo !== 'mes' || !l.bloco) return false;
    return !!blocoPorIdRef.current.get(l.bloco)?.compBase;
  }
  /** trocar `velho` por `novo` apaga um pagamento lançado (número/NÃO PAGOU → vazio ou nota)? */
  const tiraPagamento = (l: PlLinha, c: { tipo: PlColuna['tipo'] }, velho: string | null | undefined, novo: string | null | undefined) =>
    ligaPagamento(l, c) && estadoMes(velho || null).estado !== 'nada' && estadoMes(novo || null).estado === 'nada';
  /** por que `novo` não pode substituir `velho` nesta célula (null = pode). Espelha o planilha_salvar */
  function vetoTexto(l: PlLinha, c: ColV, novo: string, velho: string): Veto | null {
    if (soDeCliente(l, c) && novo !== '') return pr.current.perms.editarLinha(l) ? 'soCliente' : 'perm';
    if (!podeTexto(l, c)) return 'perm';
    if (tiraPagamento(l, c, velho, novo) && !podeRemoverPagamento()) return 'pagamento';
    // valor pago só entra direto para quem aprova (financeiro/gestor/admin — mig 59);
    // o comercial informa com comprovante e o financeiro aprova
    if (ligaPagamento(l, c) && !pr.current.perms.aprovarPagamento) {
      const en = estadoMes(novo || null), ev = estadoMes(velho || null);
      if (en.estado === 'pago' && !(ev.estado === 'pago' && ev.valor === en.valor)) return 'informar';
    }
    return null;
  }
  const podeEstilo = (l: PlLinha) => pr.current.perms.editarLinha(l);
  const refDe = (r: number, c: number) => { const L = layRef.current; return `${L.cols[c]?.letra ?? ''}${L.num[r] ?? ''}`; };

  /* ---------- pagamento: estado, informar, aprovar, não pago ---------- */
  /** competência da célula de mês de cliente ('YYYY-MM'); null = não liga a pagamento
      (NOVOS, sem mês-base) — mesma conta do compDaCelula (planilha.ts) */
  function compDaCel(l: PlLinha, c: { tipo: PlColuna['tipo']; mesPos: number | null }): string | null {
    if (!ligaPagamento(l, c) || c.mesPos == null || !l.leadId) return null;
    const base = blocoPorIdRef.current.get(l.bloco as string)?.compBase;
    return base ? compSoma(base, c.mesPos) : null;
  }
  /** estado de pagamento da célula (a mesma regra da pintura); null = não é mês de cliente */
  function estadoCel(l: PlLinha, c: ColV): EstadoMesCelula | null {
    if (l.tipo !== 'cliente' || c.tipo !== 'mes') return null;
    const col = colPorIdRef.current.get(c.id);
    return col ? estadoMesCelula(l, col, pr.current.dados) : null;
  }
  /** "Informar pagamento…" / botão "+": mês ligado a pagamento, com permissão, e nem pago nem
      aguardando (não pago, recusado ou vazio podem ser informados) */
  function podeInformarCel(l: PlLinha, c: ColV, est?: EstadoMesCelula | null): boolean {
    const p = pr.current;
    if (!p.onInformarPagamento || !p.perms.informarPagamento || l.tipo !== 'cliente' || !l.leadId || !compDaCel(l, c)) return false;
    const e = est === undefined ? estadoCel(l, c) : est;
    if (!e || e.tipo === 'pago' || e.tipo === 'pendente') return false;
    return p.perms.informarPagamento(l);
  }
  /** "Marcar como não pago": quem mexe no mês (financeiro+ ou comercial dono — planilha_salvar).
      Mês aguardando o financeiro: não (quem decide é a aprovação). Pago → não pago tira o
      pagamento confirmado: só quem pode remover pagamento (financeiro+) */
  function podeNaoPago(l: PlLinha, c: ColV, est: EstadoMesCelula | null): boolean {
    if (!est || est.tipo === 'pendente' || est.tipo === 'nao_pagou' || !pr.current.perms.editarMes(l)) return false;
    if (est.tipo === 'pago' && !podeRemoverPagamento()) return false;
    return vetoTexto(l, c, 'NÃO PAGOU', textoCel(l, c)) == null;
  }
  /** seleciona a célula e pede à tela o modal de informar (valor + comprovante) */
  function informarEm(a: { linhaId: string; colunaId: string; valor?: number }) {
    const fn = pr.current.onInformarPagamento; if (!fn) return;
    if (ed.current) confirmarEdicao();
    esconderMais();
    const L = layRef.current; const r = L.idxL.get(a.linhaId); const c = L.idxC.get(a.colunaId);
    if (r != null && c != null) { selCel(r, c); garantirVisivel(r, c); desenhar(); }
    fn(a);
  }
  function marcarNaoPago(l: PlLinha, c: ColV, est: EstadoMesCelula | null) {
    const velho = textoCel(l, c);
    const exec = () => { gravarTexto(l, c, 'NÃO PAGOU', velho); copia.current = null; desenhar(); focar(); };
    if (est?.tipo === 'pago') {
      dlg.current?.confirmar({
        titulo: 'Marcar como não pago',
        msg: `Este mês está pago (${velho.trim()}). Ao marcar NÃO PAGOU, o pagamento confirmado sai do sistema (régua, painel e comissões). Dá para voltar com Ctrl+Z, mas a data original do pagamento não volta.`,
        rotulo: 'Marcar não pago', destrutivo: true, aoOk: exec,
      });
    } else if (!ehEstadoPagamento(velho)) {
      dlg.current?.confirmar({
        titulo: 'Marcar como não pago',
        msg: `A célula tem uma anotação ("${velho.trim()}") que será trocada por NÃO PAGOU. Dá para voltar com Ctrl+Z.`,
        rotulo: 'Trocar por NÃO PAGOU', aoOk: exec,
      });
    } else exec();
  }
  function itensPagamento(r: number, ci: number): ItemMenu[] {
    const L = layRef.current; const l = L.vis[r]; const c = L.cols[ci];
    if (!l || !c) return [];
    const est = estadoCel(l, c);
    if (!est) return [];
    const p = pr.current;
    const itens: ItemMenu[] = [];
    if (est.tipo === 'pendente' && est.entrada) {
      const ent = est.entrada;
      if (p.perms.aprovarPagamento) {
        /* 1º item (sob o ponteiro) = ver o comprovante — o visualizador tem Aprovar/Recusar.
           Aprovar daqui é irreversível (grava pago + mov_fin): pede confirmação curta */
        const aprovar = p.onAprovarEntrada; const recusar = p.onRecusarEntrada; const ver = p.onVerComprovante;
        if (ver) itens.push(ent.cp ? { rotulo: 'Ver comprovante…', acao: () => ver(ent.id) } : { rotulo: 'Sem comprovante anexado', desab: true });
        if (aprovar) itens.push({ rotulo: 'Aprovar pagamento…', atalho: `R$ ${fmtValorBR(ent.v)}`, acao: () => pedirAprovar(l, c, ent, aprovar) });
        if (recusar) itens.push({ rotulo: 'Recusar…', perigo: true, acao: () => recusar(ent.id) });
      } else itens.push({ rotulo: 'Aguardando o financeiro conferir', desab: true });
    } else if (podeInformarCel(l, c, est)) {
      itens.push({ rotulo: 'Informar pagamento…', acao: () => informarEm({ linhaId: l.id, colunaId: c.id }) });
    }
    if (podeNaoPago(l, c, est)) itens.push({ rotulo: 'Marcar como não pago', acao: () => marcarNaoPago(l, c, est) });
    return itens;
  }
  /** "Aprovar pagamento…" do menu: confirmação curta (sem abrir o comprovante é o caso de risco) */
  function pedirAprovar(l: PlLinha, c: ColV, ent: EntradaCel, aprovar: (id: string) => void | Promise<unknown>) {
    const colNome = pr.current.dados.colunas.find((x) => x.campo === 'nome');
    const nome = colNome ? (l.c[colNome.id]?.t ?? '').trim() : '';
    const mes = rotuloComp(l, c);
    const por = ent.por.replace(/\s*\([^)]*\)\s*$/, '').trim();
    dlg.current?.confirmar({
      titulo: 'Aprovar pagamento',
      msg: `Aprovar R$ ${ent.v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} de ${nome || 'este cliente'}${mes ? ` (${mes})` : ''}${por ? `, informado por ${por}` : ''}? `
        + 'O valor entra como pago na hora e não dá para desfazer.'
        + (ent.cp ? ' Se ainda não conferiu, use "Ver comprovante…" antes.' : ' Atenção: este pagamento veio sem comprovante.'),
      rotulo: 'Aprovar pagamento',
      aoOk: () => chamar(() => aprovar(ent.id), (e) => aviso(`Não aprovou: ${msgErro(e)}`, 'erro')),
    });
  }
  /** "set/26" da competência da célula de mês (título do menu) */
  function rotuloComp(l: PlLinha, c: ColV): string {
    const comp = compDaCel(l, c); if (!comp) return '';
    const [y, m] = comp.split('-').map(Number);
    return `${MESES[m - 1]}/${String(y).slice(2)}`;
  }

  function aviso(msg: string, tom: 'info' | 'erro' = 'info') { rod.current?.aviso(msg, tom); }
  function avisarSemPerm(l: PlLinha, c: ColV, r?: number) {
    const onde = r != null ? ` (${refDe(r, layRef.current.idxC.get(c.id) ?? 0)})` : '';
    const p = pr.current.perms;
    if (ehSenha(l, c) && !pr.current.podeVerSenha) aviso(`Sem permissão para ver ou editar senhas${onde}`);
    else if (soDeCliente(l, c) && p.editarLinha(l)) aviso(`${MSG_SO_CLIENTE}${onde}`);
    else if (l.tipo === 'cliente' && c.tipo === 'mes') aviso(`Sem permissão para lançar pagamento nesta linha${onde}`);
    else if (l.tipo === 'cliente' && c.campo === 'comercial' && p.trocarComercial === false && p.editarLinha(l)) {
      aviso(`Trocar o comercial do cliente é com o cadastro, financeiro, gestor ou admin${onde}`);
    } else aviso(`Somente leitura: sem permissão para editar esta célula${onde}`);
  }
  function avisarVeto(v: Veto, l: PlLinha, c: ColV, r?: number) {
    const onde = r != null ? ` (${refDe(r, layRef.current.idxC.get(c.id) ?? 0)})` : '';
    if (v === 'pagamento') aviso(`${MSG_TIRA_PAGAMENTO}${onde}. A célula voltou ao que era.`);
    else if (v === 'informar') aviso(`${MSG_INFORMAR}${onde}.`);
    else if (v === 'soCliente') aviso(`${MSG_SO_CLIENTE}${onde}`);
    else avisarSemPerm(l, c, r);
  }

  /* ---------- seleção ---------- */
  function faixa(): Faixa | null {
    const L = layRef.current; const S = sel.current;
    const n = L.vis.length, m = L.cols.length;
    if (!n || !m) return null;
    const todasL = S.modo === 'col' || S.modo === 'tudo';
    const todasC = S.modo === 'lin' || S.modo === 'tudo';
    return {
      r0: todasL ? 0 : limitar(Math.min(S.ar, S.fr), n), r1: todasL ? n - 1 : limitar(Math.max(S.ar, S.fr), n),
      c0: todasC ? 0 : limitar(Math.min(S.ac, S.fc), m), c1: todasC ? m - 1 : limitar(Math.max(S.ac, S.fc), m),
    };
  }
  function primeiraLinhaNaTela(): number {
    const g = gradeRef.current; const L = layRef.current;
    return g ? limitar(ultimoAte(L.tops, g.scrollTop, L.vis.length), L.vis.length) : 0;
  }
  function primeiraColNaTela(): number {
    const g = gradeRef.current; const L = layRef.current;
    if (!g || L.nFix > 0) return 0;
    return limitar(ultimoAte(L.xs, g.scrollLeft + LARG_RN), L.cols.length);
  }
  function selCel(r: number, c: number) { sel.current = { modo: 'cel', ar: r, fr: r, tr: r, ac: c, fc: c, tc: c }; }
  function selLinha(r: number) {
    const m = layRef.current.cols.length;
    sel.current = { modo: 'lin', ar: r, fr: r, tr: r, ac: 0, fc: m - 1, tc: primeiraColNaTela() };
  }
  function selColuna(c: number) {
    const n = layRef.current.vis.length;
    sel.current = { modo: 'col', ar: 0, fr: n - 1, tr: primeiraLinhaNaTela(), ac: c, fc: c, tc: c };
  }
  function selTudo() {
    const L = layRef.current; const S = sel.current;
    sel.current = { modo: 'tudo', ar: 0, fr: L.vis.length - 1, ac: 0, fc: L.cols.length - 1, tr: S.tr, tc: S.tc };
    desenhar();
  }
  function salvarIds() {
    const L = layRef.current; const S = sel.current;
    selIds.current = {
      ar: L.vis[S.ar]?.id, fr: L.vis[S.fr]?.id, tr: L.vis[S.tr]?.id,
      ac: L.cols[S.ac]?.id, fc: L.cols[S.fc]?.id, tc: L.cols[S.tc]?.id,
    };
  }
  /** dados mudaram (refetch, filtro, coluna nova): a seleção segue as MESMAS linhas/colunas */
  function remapearSel() {
    const ids = selIds.current; const L = layRef.current; const S = sel.current;
    const n = L.vis.length, m = L.cols.length;
    const rl = (id: string | undefined, old: number) => (id != null && L.idxL.has(id) ? L.idxL.get(id)! : limitar(old, Math.max(n, 1)));
    const rc = (id: string | undefined, old: number) => (id != null && L.idxC.has(id) ? L.idxC.get(id)! : limitar(old, Math.max(m, 1)));
    if (ids) {
      S.ar = rl(ids.ar, S.ar); S.fr = rl(ids.fr, S.fr); S.tr = rl(ids.tr, S.tr);
      S.ac = rc(ids.ac, S.ac); S.fc = rc(ids.fc, S.fc); S.tc = rc(ids.tc, S.tc);
    }
    if (S.modo === 'col' || S.modo === 'tudo') { S.ar = 0; S.fr = Math.max(0, n - 1); }
    if (S.modo === 'lin' || S.modo === 'tudo') { S.ac = 0; S.fc = Math.max(0, m - 1); }
  }

  /* ---------- overlay (DOM direto, sem React) ---------- */
  function banda(el: HTMLElement, y: number, h: number) {
    el.style.display = 'block'; el.style.top = `${y}px`; el.style.height = `${h}px`;
  }
  /** divide [c0..c1] em peça congelada (sticky) + peça rolável (absoluta) */
  function pecas(band: HTMLElement, c0: number, c1: number, aj: number) {
    const L = layRef.current;
    const fx = band.children[0] as HTMLElement; const rl = band.children[1] as HTMLElement;
    const nf = L.nFix;
    if (c0 < nf) {
      const b = Math.min(c1, nf - 1); const x = L.xs[c0] - aj; const w = L.xs[b] + L.ws[b] - L.xs[c0] + aj;
      fx.style.display = 'block'; fx.style.left = `${x}px`; fx.style.marginLeft = `${x}px`; fx.style.width = `${w}px`;
    } else fx.style.display = 'none';
    if (c1 >= nf) {
      const a = Math.max(c0, nf); const x = L.xs[a] - aj; const w = L.xs[c1] + L.ws[c1] - L.xs[a] + aj;
      rl.style.display = 'block'; rl.style.left = `${x}px`; rl.style.width = `${w}px`;
    } else rl.style.display = 'none';
    fx.classList.toggle('sem-dir', c1 >= nf);
    rl.classList.toggle('sem-esq', c0 < nf);
  }
  function posAtivo() {
    const L = layRef.current; const S = sel.current;
    const ab = atBandRef.current; const at = atRef.current;
    if (!ab || !at) return;
    const r = S.tr, c = S.tc;
    const y = L.tops[r]; const h = L.tops[r + 1] - y;
    banda(ab, y - 1, h + 1);
    const x = L.xs[c] - 1;
    const w = Math.max(L.ws[c], ed.current?.w ?? 0) + 1;
    if (c < L.nFix) { at.style.position = 'sticky'; at.style.left = `${x}px`; at.style.marginLeft = `${x}px`; at.classList.add('fixa'); }
    else { at.style.position = 'absolute'; at.style.left = `${x}px`; at.style.marginLeft = '0'; at.classList.remove('fixa'); }
    at.style.width = `${w}px`;
  }
  function esconder() {
    for (const el of [selBandRef.current, cpBandRef.current, rnBandRef.current, atBandRef.current, cabBandRef.current]) if (el) el.style.display = 'none';
  }
  function desenhar() {
    const L = layRef.current; const S = sel.current;
    const f = faixa();
    if (!f) { esconder(); atualizarFbar(); avisarAtiva(); notificar(); return; }
    S.tr = limitar(S.tr, L.vis.length); S.tc = limitar(S.tc, L.cols.length);
    const multi = f.r0 !== f.r1 || f.c0 !== f.c1;
    const sb = selBandRef.current!;
    if (multi) { banda(sb, L.tops[f.r0] - 1, L.tops[f.r1 + 1] - L.tops[f.r0] + 1); pecas(sb, f.c0, f.c1, 1); }
    else sb.style.display = 'none';
    const cb = cabBandRef.current!;
    cb.style.display = 'block'; pecas(cb, f.c0, f.c1, 0);
    banda(rnBandRef.current!, L.tops[f.r0], L.tops[f.r1 + 1] - L.tops[f.r0]);
    posAtivo();
    const cp = copia.current; const cpb = cpBandRef.current!;
    const i0 = cp ? L.idxL.get(cp.l0) : undefined, i1 = cp ? L.idxL.get(cp.l1) : undefined;
    const j0 = cp ? L.idxC.get(cp.c0) : undefined, j1 = cp ? L.idxC.get(cp.c1) : undefined;
    if (i0 != null && i1 != null && j0 != null && j1 != null) {
      const a = Math.min(i0, i1), b = Math.max(i0, i1);
      banda(cpb, L.tops[a] - 1, L.tops[b + 1] - L.tops[a] + 1); pecas(cpb, Math.min(j0, j1), Math.max(j0, j1), 1);
    } else cpb.style.display = 'none';
    atualizarFbar();
    salvarIds();
    avisarAtiva();
    notificar();
  }
  /** onCelulaAtiva: só quando a célula ativa muda (ids), nunca durante o render */
  function avisarAtiva() {
    const fn = pr.current.onCelulaAtiva; if (!fn) return;
    const L = layRef.current; const S = sel.current;
    const l = L.vis[S.tr], c = L.cols[S.tc];
    const k = l && c ? `${l.id}\u0001${c.id}` : '';
    if (k === ultAtiva.current) return;
    ultAtiva.current = k;
    fn(l && c ? { linhaId: l.id, colunaId: c.id } : null);
  }
  function agendarDesenho() {
    if (rafD.current) return;
    rafD.current = requestAnimationFrame(() => { rafD.current = 0; desenhar(); });
  }
  function notificar() { ouvintes.current.forEach((fn) => fn()); }

  function atualizarFbar() {
    const L = layRef.current; const S = sel.current;
    const nome = nomeRef.current, fx = fxRef.current, sink = sinkRef.current;
    if (!nome || !fx || !sink) return;
    const l = L.vis[S.tr], c = L.cols[S.tc];
    if (!l || !c) { if (document.activeElement !== nome) nome.value = ''; if (!ed.current) fx.value = ''; return; }
    const ref = `${c.letra}${L.num[S.tr]}`;
    if (document.activeElement !== nome) nome.value = ref;
    const trava = ehSenha(l, c) && !pr.current.podeVerSenha;
    const ev0 = estRef.current.get(l.id)?.[c.id];
    const parte = !!ev0?.parte && ev0.k === 'ok';
    if (!ed.current) {
      fx.value = trava ? '••••••' : textoVisto(l, c);
      fx.readOnly = parte || !podeTexto(l, c);
    }
    // leitor de tela: a referência e o conteúdo (senha nunca vai para o rótulo)
    sink.setAttribute('aria-label', ehSenha(l, c) ? `${ref}, senha` : `${ref}, ${textoVisto(l, c) || 'vazia'}`);
  }

  /* ---------- geometria: ponto → célula, rolar até a célula ---------- */
  function celulaEm(cx: number, cy: number, prender: boolean): { r: number; c: number } | null {
    const g = gradeRef.current; const L = layRef.current;
    const n = L.vis.length, m = L.cols.length;
    if (!g || !n || !m) return null;
    const rect = g.getBoundingClientRect();
    const vx = cx - rect.left, vy = cy - rect.top;
    const y = vy - ALT_LETRAS + g.scrollTop;
    if (!prender && (y < 0 || y >= L.tops[n])) return null;
    const r = limitar(ultimoAte(L.tops, y, n), n);
    let c: number;
    if (L.nFix > 0 && vx < L.fixR) c = vx < LARG_RN ? 0 : limitar(ultimoAte(L.xs, vx, L.nFix), L.nFix);
    else {
      const x = Math.max(vx, L.fixR) + g.scrollLeft;
      if (!prender && x >= L.larg) return null;
      c = limitar(Math.max(ultimoAte(L.xs, x), L.nFix), m);
    }
    return { r, c };
  }
  function garantirVisivel(r: number, c: number) {
    const g = gradeRef.current; const L = layRef.current;
    if (!g || !L.vis.length) return;
    const y = L.tops[r], y2 = L.tops[r + 1];
    const vh = g.clientHeight - ALT_LETRAS;
    if (y < g.scrollTop) g.scrollTop = y;
    else if (y2 > g.scrollTop + vh) g.scrollTop = y2 - vh;
    if (c >= L.nFix && c < L.cols.length) {
      const x = L.xs[c], x2 = x + L.ws[c];
      if (x < g.scrollLeft + L.fixR) g.scrollLeft = x - L.fixR;
      else if (x2 > g.scrollLeft + g.clientWidth) g.scrollLeft = x2 - g.clientWidth;
    }
  }
  function recalcJanela() {
    const g = gradeRef.current; const L = layRef.current;
    if (!g) return;
    const n = L.vis.length;
    const y0 = g.scrollTop, y1 = y0 + g.clientHeight - ALT_LETRAS;
    let a = Math.max(0, ultimoAte(L.tops, y0, n) - SOBRA);
    let b = Math.min(n, ultimoAte(L.tops, y1, n) + 1 + SOBRA);
    a = Math.floor(a / 8) * 8;
    b = Math.min(n, Math.ceil(b / 8) * 8);
    const j = janelaRef.current;
    if (j.a === a && j.b === b) return;
    janelaRef.current = { a, b };
    setJanela(janelaRef.current);
  }
  function aoRolar() {
    if (maisAlvo.current || mouse.current) agendarMais();   // o "+" segue a célula sob o ponteiro
    if (rafJ.current) return;
    rafJ.current = requestAnimationFrame(() => { rafJ.current = 0; recalcJanela(); });
  }
  function focar() {
    const s = sinkRef.current;
    if (s && document.activeElement !== s) s.focus({ preventScroll: true });
  }

  /* ---------- navegação ---------- */
  function borda(r: number, c: number, dr: number, dc: number): [number, number] {
    const L = layRef.current; const n = L.vis.length, m = L.cols.length;
    const dentro = (a: number, b: number) => a >= 0 && a < n && b >= 0 && b < m;
    const cheio = (a: number, b: number) => textoCel(L.vis[a], L.cols[b]) !== '';
    let a = r, b = c;
    if (!dentro(a + dr, b + dc)) return [a, b];
    if (cheio(a, b) && cheio(a + dr, b + dc)) {
      while (dentro(a + dr, b + dc) && cheio(a + dr, b + dc)) { a += dr; b += dc; }
      return [a, b];
    }
    a += dr; b += dc;
    while (!cheio(a, b) && dentro(a + dr, b + dc)) { a += dr; b += dc; }
    return [a, b];
  }
  function mover(dr: number, dc: number, estender: boolean, salto: boolean) {
    const L = layRef.current; const S = sel.current;
    const n = L.vis.length, m = L.cols.length;
    if (!n || !m) return;
    let r = estender ? S.fr : S.tr; let c = estender ? S.fc : S.tc;
    if (salto) [r, c] = borda(limitar(r, n), limitar(c, m), dr, dc);
    else { r = limitar(r + dr, n); c = limitar(c + dc, m); }
    if (estender) {
      if (S.modo === 'cel') { S.fr = r; S.fc = c; }
      else if (S.modo === 'lin' && dr) S.fr = r;
      else if (S.modo === 'col' && dc) S.fc = c;
      garantirVisivel(S.modo === 'col' ? S.tr : r, S.modo === 'lin' ? S.tc : c);
    } else { selCel(r, c); garantirVisivel(r, c); }
    desenhar();
  }
  /** Enter/Tab: com intervalo selecionado, anda DENTRO dele (como no Excel) */
  function andarNaFaixa(dr: number, dc: number) {
    const f = faixa(); const S = sel.current;
    if (!f) return;
    if (f.r0 === f.r1 && f.c0 === f.c1) { mover(dr, dc, false, false); return; }
    let r = S.tr, c = S.tc;
    if (dc) {
      c += dc;
      if (c > f.c1) { c = f.c0; r = r + 1 > f.r1 ? f.r0 : r + 1; }
      else if (c < f.c0) { c = f.c1; r = r - 1 < f.r0 ? f.r1 : r - 1; }
    } else {
      r += dr;
      if (r > f.r1) { r = f.r0; c = c + 1 > f.c1 ? f.c0 : c + 1; }
      else if (r < f.r0) { r = f.r1; c = c - 1 < f.c0 ? f.c1 : c - 1; }
    }
    S.tr = r; S.tc = c;
    garantirVisivel(r, c);
    desenhar();
  }
  function irPara(r: number, c: number, estender: boolean) {
    const L = layRef.current; const S = sel.current;
    r = limitar(r, L.vis.length); c = limitar(c, L.cols.length);
    if (estender) { S.modo = 'cel'; S.fr = r; S.fc = c; } else selCel(r, c);
    garantirVisivel(r, c);
    desenhar();
  }
  function pagina(dir: number, estender: boolean) {
    const g = gradeRef.current; const L = layRef.current; const S = sel.current;
    const n = L.vis.length;
    if (!g || !n) return;
    const base = estender ? S.fr : S.tr;
    const vh = g.clientHeight - ALT_LETRAS;
    let r = limitar(ultimoAte(L.tops, L.tops[base] + dir * vh, n), n);
    if (r === base) r = limitar(base + dir, n);
    g.scrollTop += L.tops[r] - L.tops[base];
    if (estender) { S.fr = r; } else selCel(r, S.tc);
    garantirVisivel(r, estender ? S.fc : S.tc);
    desenhar();
  }
  function irParaRef(txt: string) {
    const L = layRef.current;
    const m = /^\s*([A-Za-z]{1,3})(\d+)(?:\s*:\s*([A-Za-z]{1,3})(\d+))?\s*$/.exec(txt);
    if (!m) { aviso('Referência inválida. Use algo como H245 ou A1:C10'); return; }
    const achar = (le: string, nu: string): { r: number; c: number } | null => {
      const li = indiceDaLetra(le); const c = L.idxLi.get(li);
      if (c == null) { aviso(`A coluna ${le.toUpperCase()} está oculta ou não existe`); return null; }
      const r = L.idxNum.get(Number(nu));
      if (r == null) { aviso(`A linha ${nu} não está visível (filtro ou fora da folha)`); return null; }
      return { r, c };
    };
    const a = achar(m[1], m[2]); if (!a) return;
    if (m[3]) {
      const b = achar(m[3], m[4]); if (!b) return;
      sel.current = { modo: 'cel', ar: a.r, ac: a.c, fr: b.r, fc: b.c, tr: a.r, tc: a.c };
    } else selCel(a.r, a.c);
    garantirVisivel(a.r, a.c);
    desenhar();
  }

  /* ---------- salvar: otimista + desfazer ---------- */
  function otimista(itens: PlItem[], ts: number) {
    const senhaUpd = new Map<string, SenhaLocal>();
    const pendUpd: PlItem[] = [];
    const colPor = new Map(colsOrdRef.current.map((c) => [c.id, c]));
    for (const it of itens) {
      const l = linhaPorIdRef.current.get(it.l); const c = colPor.get(it.c);
      if (l && c && l.tipo === 'cliente' && ehSenhaCol(c)) {
        if ('t' in it && l.leadId) {
          const cur = senhaUpd.get(l.leadId) ?? { ts };
          if (c.campo === 'senha_inss') cur.inss = it.t ?? null; else cur.reclame = it.t ?? null;
          senhaUpd.set(l.leadId, cur);
        }
        if ('s' in it) pendUpd.push({ l: it.l, c: it.c, s: it.s });
      } else pendUpd.push(it);
    }
    if (senhaUpd.size) {
      setSenhaLocal((prev) => {
        const m = new Map(prev);
        senhaUpd.forEach((v, k) => m.set(k, { ...(m.get(k) ?? {}), ...v, ts }));
        return m;
      });
    }
    if (pendUpd.length) {
      setPend((prev) => {
        const m = new Map(prev);
        for (const it of pendUpd) {
          const base = linhaPorIdRef.current.get(it.l);
          const lm = new Map(m.get(it.l) ?? []);
          const cur = lm.get(it.c)?.cel ?? base?.c[it.c] ?? { t: null, s: null };
          const cel: PlCelula = {
            t: 't' in it ? (it.t || null) : (cur.t || null),
            s: 's' in it ? normEstilo(it.s) : normEstilo(cur.s),
          };
          lm.set(it.c, { cel, ts });
          m.set(it.l, lm);
        }
        return m;
      });
    }
  }
  function falhouSalvar(err: unknown, parte: PlItem[], ts: number, lote: Lote) {
    pilhaD.current = pilhaD.current.filter((x) => x !== lote);
    pilhaR.current = pilhaR.current.filter((x) => x !== lote);
    setPend((prev) => {
      if (!prev.size) return prev;
      const m = new Map(prev);
      for (const it of parte) {
        const lm = m.get(it.l); if (!lm) continue;
        const v = lm.get(it.c);
        if (v && v.ts === ts) { const nm = new Map(lm); nm.delete(it.c); if (nm.size) m.set(it.l, nm); else m.delete(it.l); }
      }
      return m;
    });
    setSenhaLocal((prev) => {
      if (!prev.size) return prev;
      const m = new Map(prev);
      for (const it of parte) { const l = linhaPorIdRef.current.get(it.l); if (l?.leadId && m.get(l.leadId)?.ts === ts) m.delete(l.leadId); }
      return m;
    });
    aviso(`Não salvou: ${msgErro(err)}`, 'erro');
    notificar();
  }
  /** envia um lote. Sem `lote` = edição nova (empilha no desfazer); com = desfazer/refazer */
  function salvar(depois: PlItem[], antes: PlItem[], origem: OrigemSalvar, lote?: Lote) {
    if (!depois.length) return;
    const lt: Lote = lote ?? { antes, depois, origem };
    if (!lote) {
      // senha é só-escrita no banco (trocar a gravada é de gestor): não volta pelo Ctrl+Z
      const colPor = new Map(colsOrdRef.current.map((c) => [c.id, c]));
      const mexeSenha = depois.some((it) => {
        const c = colPor.get(it.c);
        return it.t !== undefined && !!c && ehSenhaCol(c) && linhaPorIdRef.current.get(it.l)?.tipo === 'cliente';
      });
      if (mexeSenha) lt.bloqueio = 'A senha não volta pelo Ctrl+Z. Se precisar, digite a anterior na célula.';
      // desfazer que TIRARIA um pagamento (mês vazio → número/NÃO PAGOU) sem poder: o banco recusaria
      // — mesma trava do Desfazer global (useSalvarCelulas)
      else if (!podeRemoverPagamento() && depois.some((it, i) => {
        if (it.t === undefined) return false;
        const l = linhaPorIdRef.current.get(it.l); const c = colPor.get(it.c);
        return !!l && !!c && tiraPagamento(l, c, it.t, antes[i]?.t);
      })) lt.bloqueio = 'Desfazer isto tiraria um pagamento da planilha, e isso é só do financeiro/gestor — peça a um deles ou ajuste a célula.';
      pilhaD.current.push(lt);
      if (pilhaD.current.length > 100) pilhaD.current.shift();
      pilhaR.current = [];
    }
    const ts = Date.now();
    otimista(depois, ts);
    for (let i = 0; i < depois.length; i += MAX_LOTE) {
      const parte = depois.slice(i, i + MAX_LOTE);
      chamar(() => pr.current.onSalvar(parte, origem), (e) => falhouSalvar(e, parte, ts, lt));
    }
    notificar();
  }
  function selecionarItens(itens: PlItem[]) {
    const L = layRef.current;
    let r0 = Infinity, r1 = -1, c0 = Infinity, c1 = -1;
    for (const it of itens) {
      const r = L.idxL.get(it.l), c = L.idxC.get(it.c);
      if (r == null || c == null) continue;
      r0 = Math.min(r0, r); r1 = Math.max(r1, r); c0 = Math.min(c0, c); c1 = Math.max(c1, c);
    }
    if (r1 < 0) return;
    sel.current = { modo: 'cel', ar: r0, fr: r1, ac: c0, fc: c1, tr: r0, tc: c0 };
    garantirVisivel(r0, c0);
  }
  function desfazer() {
    if (ed.current) { cancelarEdicao(); return; }
    const lt = pilhaD.current.pop();
    if (!lt) { aviso('Nada para desfazer'); return; }
    if (lt.bloqueio) { aviso(lt.bloqueio); notificar(); return; }
    pilhaR.current.push(lt);
    salvar(lt.antes, [], 'desfazer', lt);
    selecionarItens(lt.antes);
    desenhar();
  }
  function refazer() {
    if (ed.current) return;
    const lt = pilhaR.current.pop();
    if (!lt) { aviso('Nada para refazer'); return; }
    pilhaD.current.push(lt);
    salvar(lt.depois, [], 'refazer', lt);
    selecionarItens(lt.depois);
    desenhar();
  }

  /* ---------- edição (textarea de 1 linha sobreposto; acentos, IME e Alt+Enter) ---------- */
  function visualEditor(l: PlLinha, c: ColV) {
    const at = atRef.current, sink = sinkRef.current;
    if (!at || !sink) return;
    const s = normEstilo(l.c[c.id]?.s);
    const cab = l.tipo === 'cabecalho';
    at.classList.add('editando');
    at.classList.toggle('cab', cab && !s?.bg);
    sink.style.fontWeight = s?.b || cab ? '700' : '';
    sink.style.fontStyle = s?.i ? 'italic' : '';
    sink.style.textAlign = s?.al === 'c' ? 'center' : s?.al === 'r' ? 'right' : '';
    sink.style.backgroundColor = s?.bg ?? '';
    sink.style.color = s?.fg ?? (s?.bg ? contraste(s.bg) : '');
  }
  function fecharEditor() {
    const at = atRef.current, sink = sinkRef.current;
    if (at) { at.classList.remove('editando', 'cab'); at.style.height = ''; }
    if (sink) {
      sink.style.fontWeight = ''; sink.style.fontStyle = ''; sink.style.textAlign = ''; sink.style.backgroundColor = ''; sink.style.color = '';
      sink.style.lineHeight = ''; sink.style.paddingTop = ''; sink.style.paddingBottom = '';
    }
  }
  /** editor acompanha o texto: alarga até 640px e, com quebra de linha, cresce para baixo (como o Excel) */
  function autoTamanho() {
    const E = ed.current; const at = atRef.current; const sink = sinkRef.current; const L = layRef.current;
    if (!E || !at || !sink) return;
    const ci = L.idxC.get(E.c); if (ci == null) return;
    const ri = L.idxL.get(E.l);
    const altCel = ri != null ? L.tops[ri + 1] - L.tops[ri] : ALT_PADRAO;
    const nLin = sink.value.split('\n').length;
    if (nLin > 1) {
      sink.style.lineHeight = `${ALT_LINHA_ED}px`; sink.style.paddingTop = '2px'; sink.style.paddingBottom = '2px';
      at.style.height = `${Math.max(altCel + 1, nLin * ALT_LINHA_ED + 8)}px`;
    } else {
      // 1 linha: texto no meio da célula (borda de 2px em cima e embaixo)
      sink.style.lineHeight = `${Math.max(12, altCel - 3)}px`; sink.style.paddingTop = ''; sink.style.paddingBottom = '';
      at.style.height = '';
    }
    const base = L.ws[ci];
    at.style.width = `${base + 1}px`;
    const need = sink.scrollWidth + 8;
    E.w = Math.max(base, Math.min(need, 640));
    at.style.width = `${E.w + 1}px`;
  }
  function iniciarEdicao(modo: 'digitar' | 'editar', manter = false, via: 'cel' | 'fx' = 'cel'): boolean {
    const L = layRef.current; const S = sel.current;
    const l = L.vis[S.tr], c = L.cols[S.tc];
    const sink = sinkRef.current, fx = fxRef.current;
    if (!l || !c || !sink || !fx) return false;
    if (!podeTexto(l, c)) { avisarSemPerm(l, c, S.tr); return false; }
    // mês pago mostrado como a parte do comercial: editar abriria o líquido do escritório
    const ev = estRef.current.get(l.id)?.[c.id];
    if (ev?.parte && ev.k === 'ok') { aviso('Este mês já está pago (aprovado pelo financeiro).'); return false; }
    garantirVisivel(S.tr, S.tc);
    const orig = textoCel(l, c);
    if (!manter) sink.value = orig;
    ed.current = { modo, l: l.id, c: c.id, orig, base: orig.replace(/\r\n?/g, '\n'), valor: sink.value, via, w: L.ws[S.tc] };
    fx.value = sink.value;
    fx.readOnly = false;
    visualEditor(l, c);
    if (!manter && via === 'cel') { const n = sink.value.length; try { sink.setSelectionRange(n, n); } catch { /* sem seleção */ } }
    desenhar();
    autoTamanho();
    return true;
  }
  function gravarTexto(l: PlLinha, c: ColV, novo: string, velho: string) {
    salvar([{ l: l.id, c: c.id, t: novo === '' ? null : novo }], [{ l: l.id, c: c.id, t: velho === '' ? null : velho }], 'edicao');
  }
  function confirmarEdicao(dr = 0, dc = 0, naFaixa = false) {
    const E = ed.current;
    if (!E) return;
    ed.current = null;
    fecharEditor();
    if (sinkRef.current) sinkRef.current.value = '';
    // entrar e sair sem mexer não regrava (compara com o texto como o editor o mostrou)
    if (E.valor !== E.base) {
      const L = layRef.current;
      const ri = L.idxL.get(E.l), ci = L.idxC.get(E.c);
      const l = ri != null ? L.vis[ri] : linhaPorIdRef.current.get(E.l);
      const c = ci != null ? L.cols[ci] : undefined;
      if (l && c) {
        // "não pago" digitado num mês de cliente vira o NÃO PAGOU da planilha (fica vermelho)
        const novo = ligaPagamento(l, c) && /^\s*n[aã]o\s*pag(o|ou)\s*$/i.test(E.valor) ? 'NÃO PAGOU' : E.valor;
        const est = estadoMes(novo || null);
        if (est.estado === 'pago' && compDaCel(l, c) && !pr.current.perms.aprovarPagamento && pr.current.onInformarPagamento) {
          // comercial digitou um valor + Enter: abre o "Informar pagamento" já com o valor (vai pro financeiro)
          const e0 = estadoCel(l, c);
          if (e0?.tipo === 'pendente') aviso('Este mês já está aguardando o financeiro conferir o pagamento informado.');
          else if (e0?.tipo === 'pago') aviso('Este mês já está pago (aprovado pelo financeiro).');
          else if (podeInformarCel(l, c, e0)) { informarEm({ linhaId: l.id, colunaId: c.id, valor: est.valor }); return; }
          else avisarSemPerm(l, c, ri);
          desenhar();
          return;
        }
        const v = vetoTexto(l, c, novo, E.orig);
        if (v) avisarVeto(v, l, c, ri);
        else { gravarTexto(l, c, novo, E.orig); copia.current = null; }
      }
    }
    if (dr || dc) { if (naFaixa) andarNaFaixa(dr, dc); else mover(dr, dc, false, false); }
    else desenhar();
  }
  function cancelarEdicao() {
    if (!ed.current) return;
    ed.current = null;
    fecharEditor();
    if (sinkRef.current) sinkRef.current.value = '';
    desenhar();
  }
  function aoInputSink() {
    const sink = sinkRef.current; if (!sink) return;
    if (bloqueado.current) { if (!compondo.current) { sink.value = ''; bloqueado.current = false; } return; }
    if (!ed.current) {
      if (!sink.value) return;
      if (!iniciarEdicao('digitar', true)) { sink.value = ''; return; }
    }
    const E = ed.current; if (!E) return;
    E.valor = sink.value;
    if (fxRef.current) fxRef.current.value = sink.value;
    autoTamanho();
  }
  function aoCompIni() {
    compondo.current = true;
    if (!ed.current && !iniciarEdicao('digitar', true)) bloqueado.current = true;
  }
  function aoCompFim() {
    compondo.current = false;
    if (bloqueado.current) setTimeout(() => { if (sinkRef.current) sinkRef.current.value = ''; bloqueado.current = false; }, 0);
  }
  function aoSinkBlur(e: RFocusEvent<HTMLTextAreaElement>) {
    const E = ed.current;
    if (!E || E.via !== 'cel') return;
    if (e.relatedTarget === fxRef.current) return;
    if (!document.hasFocus()) return;   // trocou de janela: segue editando, como o Excel
    confirmarEdicao();
  }

  /* ---------- barra de fórmula ---------- */
  function aoFxFoco() {
    const E = ed.current;
    if (E) { E.via = 'fx'; return; }
    const L = layRef.current; const S = sel.current;
    const l = L.vis[S.tr], c = L.cols[S.tc];
    if (!l || !c) return;
    if (!podeTexto(l, c)) { avisarSemPerm(l, c, S.tr); return; }
    iniciarEdicao('editar', false, 'fx');
  }
  function aoFxInput() {
    const E = ed.current; const fx = fxRef.current;
    if (!E || !fx) return;
    E.valor = fx.value;
    if (sinkRef.current) sinkRef.current.value = fx.value;
    autoTamanho();
  }
  function aoFxTecla(e: RKeyboardEvent<HTMLTextAreaElement>) {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (atalhoDaTela(e)) return;
    if (e.key === 'Enter' && e.altKey && !e.ctrlKey && !e.metaKey) {
      // Alt+Enter = quebra de linha dentro da célula (como no Excel)
      e.preventDefault();
      if (ed.current && !e.currentTarget.readOnly) { inserirQuebra(e.currentTarget); aoFxInput(); }
    } else if (e.key === 'Enter') { e.preventDefault(); if (ed.current) confirmarEdicao(e.shiftKey ? -1 : 1, 0, true); focar(); }
    else if (e.key === 'Tab') { e.preventDefault(); if (ed.current) confirmarEdicao(0, e.shiftKey ? -1 : 1, true); focar(); }
    else if (e.key === 'Escape') {
      // só "consome" o Esc se havia edição para cancelar; senão ele sobe (ex.: sair da tela cheia)
      if (ed.current) { e.preventDefault(); cancelarEdicao(); }
      focar();
    }
  }
  /** Ctrl/Cmd+S e Ctrl/Cmd+F do navegador, que na planilha confundem. true = tratou */
  function atalhoDaTela(e: RKeyboardEvent<HTMLElement>): boolean {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return false;
    const kl = e.key.toLowerCase();
    if (kl === 's') { e.preventDefault(); aviso('A planilha salva sozinha a cada edição — não precisa de Ctrl+S.'); return true; }
    // o localizar do navegador só vê as linhas montadas (janela virtualizada): vai para a busca da tela
    if (kl === 'f' && pr.current.onBuscar) { e.preventDefault(); pr.current.onBuscar(); return true; }
    return false;
  }
  function aoFxBlur(e: RFocusEvent<HTMLTextAreaElement>) {
    if (e.relatedTarget === sinkRef.current) return;
    if (ed.current?.via === 'fx' && document.hasFocus()) confirmarEdicao();
  }
  function aoNomeTecla(e: RKeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') { e.preventDefault(); irParaRef(e.currentTarget.value); focar(); }
    else if (e.key === 'Escape') { e.preventDefault(); focar(); atualizarFbar(); }
  }

  /* ---------- limpar, copiar, colar, preencher, formatar ---------- */
  function avisoPulos(p: Pulos) {
    const partes: string[] = [];
    if (p.semPerm) partes.push(`${p.semPerm} célula(s) sem permissão foram puladas`);
    if (p.informar) partes.push(`${p.informar} valor(es) não entraram: ${MSG_INFORMAR.charAt(0).toLowerCase()}${MSG_INFORMAR.slice(1)}`);
    if (p.pagamento) partes.push(`${p.pagamento} célula(s) com pagamento lançado ficaram como estavam (apagar pagamento é com o financeiro, gestor ou admin)`);
    if (p.soCliente) partes.push(`${p.soCliente} célula(s) de senha, CPF, NB ou telefone ficaram de fora: só vão em linha de cliente (use "Inserir cliente")`);
    if (p.senhas) partes.push(`${p.senhas} senha(s) ficaram de fora (edite a célula da senha sozinha)`);
    if (p.fora) partes.push(`${p.fora} célula(s) passaram do fim da planilha`);
    if (partes.length) aviso(partes.join(' · '));
  }
  /** quantos itens do lote mexem em célula de mês ligada a pagamento (para o texto da confirmação) */
  function contarMeses(itens: PlItem[]): number {
    const colPor = new Map(colsOrdRef.current.map((c) => [c.id, c]));
    let n = 0;
    for (const it of itens) {
      if (it.t === undefined) continue;
      const l = linhaPorIdRef.current.get(it.l); const c = colPor.get(it.c);
      if (l && c && ligaPagamento(l, c)) n++;
    }
    return n;
  }
  const fmtQtd = (n: number) => n.toLocaleString('pt-BR');
  /** colar e Ctrl+D: acima de 200 células, só grava depois do "Aplicar" (a seleção e os avisos já valem) */
  function confirmarLote(depois: PlItem[], titulo: string, fn: () => void) {
    if (depois.length <= LIMITE_CONFIRMAR) { fn(); return; }
    const nMes = contarMeses(depois);
    dlg.current?.confirmar({
      titulo,
      msg: `Alterar ${fmtQtd(depois.length)} células${nMes ? ` — ${fmtQtd(nMes)} delas são de mês e mexem em pagamentos (régua, painel e comissões)` : ''}?`
        + (nMes ? ' O Ctrl+Z volta o texto, mas não a data original do pagamento nem o comprovante.' : ' Dá para desfazer com Ctrl+Z.'),
      rotulo: 'Aplicar', destrutivo: true, aoOk: () => { fn(); desenhar(); focar(); },
    });
  }
  /** Delete / Limpar conteúdo / Ctrl+X (o recorte copia e já limpa a origem — contrato §4) */
  function limparSelecao(origem: OrigemSalvar = 'limpar') {
    const f = faixa(); if (!f) return;
    const L = layRef.current;
    const multi = f.r0 !== f.r1 || f.c0 !== f.c1;
    const depois: PlItem[] = [], antes: PlItem[] = [];
    const pulos = semPulos();
    for (let r = f.r0; r <= f.r1; r++) {
      const l = L.vis[r];
      for (let c = f.c0; c <= f.c1; c++) {
        const col = L.cols[c];
        const t = textoCel(l, col);
        if (!t) continue;
        if (multi && ehSenha(l, col)) { pulos.senhas++; continue; }
        const v = vetoTexto(l, col, '', t);
        if (v) { contarVeto(pulos, v); continue; }
        depois.push({ l: l.id, c: col.id, t: null });
        antes.push({ l: l.id, c: col.id, t });
      }
    }
    const exec = () => { salvar(depois, antes, origem); avisoPulos(pulos); copia.current = null; desenhar(); focar(); };
    if (!depois.length) { avisoPulos(pulos); return; }
    if (depois.length > LIMITE_CONFIRMAR) {
      const recorte = origem === 'recortar';
      const nMes = contarMeses(depois);
      dlg.current?.confirmar({
        titulo: recorte ? 'Recortar células' : 'Limpar células',
        msg: `${recorte ? 'O recorte copia e já apaga a origem. ' : ''}Apagar o conteúdo de ${fmtQtd(depois.length)} células`
          + (nMes ? ` (${fmtQtd(nMes)} de meses: o pagamento lançado é apagado, e o Ctrl+Z volta o texto mas não a data original do pagamento nem o comprovante)` : '')
          + `? A formatação continua.${nMes ? '' : ' Dá para desfazer com Ctrl+Z.'}`,
        rotulo: recorte ? 'Recortar' : 'Limpar', destrutivo: true, aoOk: exec,
        // desistiu do recorte: a área de transferência já tem os dados → fica como um Copiar
        aoCancelar: recorte ? () => { marcarCopia(false); desenhar(); } : undefined,
      });
    } else exec();
  }
  function montarCopia(): { tsv: string; estilos: (Estilo | null)[][] } | null {
    const f = faixa(); if (!f) return null;
    const L = layRef.current;
    const linhas: string[] = []; const estilos: (Estilo | null)[][] = [];
    for (let r = f.r0; r <= f.r1; r++) {
      const l = L.vis[r]; const cel: string[] = []; const est: (Estilo | null)[] = [];
      for (let c = f.c0; c <= f.c1; c++) {
        const col = L.cols[c];
        cel.push(campoTSV(textoVisto(l, col)));
        est.push(normEstilo(l.c[col.id]?.s));
      }
      linhas.push(cel.join('\t')); estilos.push(est);
    }
    return { tsv: linhas.join('\r\n'), estilos };
  }
  function marcarCopia(recorte: boolean) {
    const f = faixa(); const L = layRef.current;
    if (!f) return;
    copia.current = { l0: L.vis[f.r0].id, l1: L.vis[f.r1].id, c0: L.cols[f.c0].id, c1: L.cols[f.c1].id, recorte };
  }
  /** garante que o Ctrl+C dispare o evento copy mesmo sem texto selecionado (Safari) */
  function prepararCopia() {
    const s = sinkRef.current; if (!s || ed.current) return;
    s.value = ' '; s.select();
    setTimeout(() => { if (!ed.current && sinkRef.current?.value === ' ') sinkRef.current.value = ''; }, 0);
  }
  function aoCopiar(e: RClipboardEvent<HTMLDivElement>) {
    if (e.target !== sinkRef.current || ed.current) return;
    const cp = montarCopia(); if (!cp) return;
    e.preventDefault();
    e.clipboardData.setData('text/plain', cp.tsv);
    clip.current = cp;
    if (sinkRef.current) sinkRef.current.value = '';
    marcarCopia(false);
    desenhar();
  }
  function aoRecortar(e: RClipboardEvent<HTMLDivElement>) {
    if (e.target !== sinkRef.current || ed.current) return;
    const cp = montarCopia(); if (!cp) return;
    e.preventDefault();
    e.clipboardData.setData('text/plain', cp.tsv);
    clip.current = cp;
    if (sinkRef.current) sinkRef.current.value = '';
    marcarCopia(true);
    limparSelecao('recortar');
  }
  function aoColar(e: RClipboardEvent<HTMLDivElement>) {
    if (e.target !== sinkRef.current || ed.current) return;
    e.preventDefault();
    const txt = e.clipboardData.getData('text/plain');
    if (txt) colarTexto(txt);
  }
  function colarTexto(txt: string) {
    const f = faixa(); if (!f) return;
    const L = layRef.current;
    const n = L.vis.length, m = L.cols.length;
    const mat = lerTSV(txt);
    const h = mat.length; const w = Math.max(1, ...mat.map((x) => x.length));
    const selH = f.r1 - f.r0 + 1, selW = f.c1 - f.c0 + 1;
    const multiSel = selH > 1 || selW > 1;
    let altoA = h, largA = w;
    let fonte = (i: number, j: number) => mat[i]?.[j] ?? '';
    if (h === 1 && w === 1 && multiSel) { altoA = selH; largA = selW; fonte = () => mat[0][0]; }
    else if (multiSel && selH % h === 0 && selW % w === 0) { altoA = selH; largA = selW; fonte = (i, j) => mat[i % h]?.[j % w] ?? ''; }
    // coluna oculta DENTRO da área: a grade só cola nas visíveis, então tudo depois dela cairia
    // uma coluna à direita (senha em PARCELA TOTAL, meses na competência errada). Bloqueia.
    // (1 valor só repetido na seleção não desalinha nada: segue.)
    if (w > 1) {
      const li0 = L.cols[f.c0].li;
      if (colsOrdRef.current.slice(li0, li0 + largA).some((c) => c.oculta)) {
        aviso('Há colunas ocultas dentro da área de colagem. Mostre-as antes de colar, senão os dados caem na coluna errada.', 'erro');
        return;
      }
    }
    const norm = (s: string) => s.replace(/\r\n?/g, '\n').replace(/\n$/, '');
    const cp = clip.current && norm(clip.current.tsv) === norm(txt) ? clip.current : null;
    const multi = altoA * largA > 1;
    const depois: PlItem[] = [], antes: PlItem[] = [];
    const pulos = semPulos();
    for (let i = 0; i < altoA; i++) {
      const r = f.r0 + i;
      if (r >= n) { pulos.fora += largA; continue; }
      const l = L.vis[r];
      const okEst = cp ? podeEstilo(l) : false;
      for (let j = 0; j < largA; j++) {
        const c = f.c0 + j;
        if (c >= m) { pulos.fora++; continue; }
        const col = L.cols[c];
        if (multi && ehSenha(l, col)) { pulos.senhas++; continue; }
        const d: PlItem = { l: l.id, c: col.id }; const a: PlItem = { l: l.id, c: col.id };
        const novo = fonte(i, j); const velho = textoCel(l, col);
        let mexeu = false;
        if (novo !== velho) {
          const v = vetoTexto(l, col, novo, velho);
          if (!v) { d.t = novo === '' ? null : novo; a.t = velho === '' ? null : velho; mexeu = true; }
          else contarVeto(pulos, v);
        }
        if (cp && okEst) {
          const sN = cp.estilos[i % cp.estilos.length]?.[j % (cp.estilos[0]?.length || 1)] ?? null;
          const sV = normEstilo(l.c[col.id]?.s);
          if (chaveEstilo(sN) !== chaveEstilo(sV)) { d.s = sN; a.s = sV; mexeu = true; }
        }
        if (mexeu) { depois.push(d); antes.push(a); }
      }
    }
    confirmarLote(depois, 'Colar', () => {
      salvar(depois, antes, 'colar');
      if (copia.current?.recorte) copia.current = null;
    });
    const r1 = Math.min(n - 1, f.r0 + altoA - 1), c1 = Math.min(m - 1, f.c0 + largA - 1);
    sel.current = { modo: 'cel', ar: f.r0, ac: f.c0, fr: r1, fc: c1, tr: f.r0, tc: f.c0 };
    avisoPulos(pulos);
    desenhar();
  }
  /** Ctrl+D: repete a 1ª linha do intervalo para baixo (ou a de cima, com 1 célula) */
  function preencherAbaixo() {
    const f = faixa(); if (!f) return;
    const L = layRef.current;
    let src = f.r0, a0 = f.r0 + 1;
    if (f.r0 === f.r1) { if (f.r0 === 0) return; src = f.r0 - 1; a0 = f.r0; }
    const ls = L.vis[src];
    const depois: PlItem[] = [], antes: PlItem[] = [];
    const pulos = semPulos();
    for (let c = f.c0; c <= f.c1; c++) {
      const col = L.cols[c];
      const t = textoCel(ls, col); const s = normEstilo(ls.c[col.id]?.s);
      for (let r = a0; r <= f.r1; r++) {
        const l = L.vis[r];
        if (ehSenha(l, col)) { pulos.senhas++; continue; }
        const d: PlItem = { l: l.id, c: col.id }; const a: PlItem = { l: l.id, c: col.id };
        let mexeu = false;
        const v = textoCel(l, col);
        if (v !== t) {
          const vt = vetoTexto(l, col, t, v);
          if (!vt) { d.t = t || null; a.t = v || null; mexeu = true; } else contarVeto(pulos, vt);
        }
        const sv = normEstilo(l.c[col.id]?.s);
        if (chaveEstilo(sv) !== chaveEstilo(s) && podeEstilo(l)) { d.s = s; a.s = sv; mexeu = true; }
        if (mexeu) { depois.push(d); antes.push(a); }
      }
    }
    confirmarLote(depois, 'Preencher para baixo', () => salvar(depois, antes, 'preencher'));
    if (f.r0 === f.r1) { const S = sel.current; S.ar = src; S.fr = f.r1; }
    avisoPulos(pulos);
    desenhar();
  }
  function formatar(patch: Partial<Estilo> | null) {
    if (ed.current) confirmarEdicao();
    const f = faixa(); if (!f) return;
    const L = layRef.current;
    const depois: PlItem[] = [], antes: PlItem[] = [];
    let semPerm = 0;
    for (let r = f.r0; r <= f.r1; r++) {
      const l = L.vis[r];
      if (!podeEstilo(l)) { semPerm += f.c1 - f.c0 + 1; continue; }
      for (let c = f.c0; c <= f.c1; c++) {
        const col = L.cols[c];
        const old = normEstilo(l.c[col.id]?.s);
        const nv = patch === null ? null : normEstilo({ ...(old ?? {}), ...patch });
        if (chaveEstilo(old) === chaveEstilo(nv)) continue;
        depois.push({ l: l.id, c: col.id, s: nv });
        antes.push({ l: l.id, c: col.id, s: old });
      }
    }
    salvar(depois, antes, 'formatar');
    if (semPerm) aviso(`${semPerm} célula(s) sem permissão ficaram sem a formatação`);
    focar();
  }
  function estiloAtivo(): Estilo | null {
    const L = layRef.current; const S = sel.current;
    const l = L.vis[S.tr], c = L.cols[S.tc];
    return l && c ? normEstilo(l.c[c.id]?.s) : null;
  }
  function alternarEstilo(k: 'b' | 'i') { const e = estiloAtivo(); formatar({ [k]: !e?.[k] }); }
  function alinhar(al: 'l' | 'c' | 'r') { const e = estiloAtivo(); formatar({ al: e?.al === al ? undefined : al }); }

  /* ---------- colunas e linhas (menus) ---------- */
  function opColuna(op: OpColuna, patchLocal?: Omit<PatchCol, 'ts'>) {
    if (patchLocal && op.op === 'alterar') {
      const id = op.coluna;
      setColPatch((prev) => { const m = new Map(prev); m.set(id, { ...(m.get(id) ?? {}), ...patchLocal, ts: Date.now() }); return m; });
    }
    chamar(() => pr.current.onColuna(op), (e) => {
      if (op.op === 'alterar') { const id = op.coluna; setColPatch((prev) => { if (!prev.has(id)) return prev; const m = new Map(prev); m.delete(id); return m; }); }
      aviso(`Não deu certo: ${msgErro(e)}`, 'erro');
    });
  }
  function opLinha(op: OpLinha) {
    chamar(() => pr.current.onLinha(op), (e) => aviso(`Não deu certo: ${msgErro(e)}`, 'erro'));
  }
  function aplicarLargura(vi: number, w: number) {
    const L = layRef.current; const lona = lonaRef.current;
    if (!lona) return;
    L.ws[vi] = w;
    let x = LARG_RN; let fixR = LARG_RN;
    L.cols.forEach((c, i) => { L.xs[i] = x; x += L.ws[i]; if (c.fixa >= 0) { fixR = x; lona.style.setProperty(`--plx-f${c.fixa}`, `${L.xs[i]}px`); } });
    L.larg = x; L.fixR = fixR;
    lona.style.setProperty(`--plx-c${vi}`, `${w}px`);
    lona.style.setProperty('--plx-w', `${x}px`);
    desenhar();
  }
  function iniciarResize(vi: number, x0: number) {
    const L = layRef.current; const w0 = L.ws[vi]; let w = w0;
    document.body.classList.add('plx-cursor-col');
    const mv = (ev: MouseEvent) => { w = Math.max(30, Math.min(900, Math.round(w0 + ev.clientX - x0))); aplicarLargura(vi, w); };
    const up = () => {
      document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up);
      document.body.classList.remove('plx-cursor-col');
      const c = layRef.current.cols[vi];
      if (w !== w0 && c) opColuna({ op: 'alterar', coluna: c.id, patch: { largura: w } }, { largura: w });
    };
    document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
  }
  function autoAjustar(vi: number) {
    const L = layRef.current; const c = L.cols[vi]; const g = gradeRef.current;
    const ctx = document.createElement('canvas').getContext('2d');
    if (!c || !ctx || !g) return;
    const fam = getComputedStyle(g).fontFamily;
    let max = 0; let fonteAtual = '';
    for (const l of L.vis) {
      const t = ehSenha(l, c) && !pr.current.podeVerSenha ? TRAVA : textoVisto(l, c);
      if (!t) continue;
      const s = l.c[c.id]?.s;
      const f = `${s?.i ? 'italic ' : ''}${s?.b || l.tipo === 'cabecalho' ? 700 : 400} 12.5px ${fam}`;
      if (f !== fonteAtual) { ctx.font = f; fonteAtual = f; }
      max = Math.max(max, ctx.measureText(t).width);
    }
    const w = Math.max(40, Math.min(600, Math.ceil(max + 16)));
    aplicarLargura(vi, w);
    opColuna({ op: 'alterar', coluna: c.id, patch: { largura: w } }, { largura: w });
  }
  function mostrarOcultas(ids: string[]) {
    for (const id of ids) opColuna({ op: 'alterar', coluna: id, patch: { oculta: false } }, { oculta: false });
  }
  function reordenar(c0: number, c1: number, b: number) {
    const L = layRef.current;
    const movidas = L.cols.slice(c0, c1 + 1).map((c) => c.id);
    const set = new Set(movidas);
    const resto = colsOrdRef.current.filter((c) => !set.has(c.id));
    let prev: number, next: number;
    if (b > 0) {
      const idx = resto.findIndex((c) => c.id === L.cols[b - 1].id);
      prev = resto[idx].ordem;
      next = resto[idx + 1]?.ordem ?? prev + movidas.length + 1;
    } else {
      const idx = resto.findIndex((c) => c.id === L.cols[0].id);
      next = resto[idx].ordem;
      prev = resto[idx - 1]?.ordem ?? next - movidas.length - 1;
    }
    const passo = (next - prev) / (movidas.length + 1);
    movidas.forEach((id, k) => { const ordem = prev + passo * (k + 1); opColuna({ op: 'alterar', coluna: id, patch: { ordem } }, { ordem }); });
  }
  function iniciarReordenar(vi: number, x0: number) {
    const f = faixa(); const drop = dropRef.current; const g = gradeRef.current; const lona = lonaRef.current;
    if (!f || !drop || !g || !lona) return;
    let ativo = false; let b = -1; let mx = x0; let my = 0; let raf = 0;
    const alvo = () => {
      const p = celulaEm(mx, my, true); if (!p) return;
      const L = layRef.current; const m = L.cols.length;
      const rect = g.getBoundingClientRect();
      const vx = mx - rect.left;
      const esqTela = p.c < L.nFix ? L.xs[p.c] : L.xs[p.c] - g.scrollLeft;
      b = vx > esqTela + L.ws[p.c] / 2 ? p.c + 1 : p.c;
      let x: number;
      if (b > 0 && b - 1 < L.nFix) x = L.xs[b - 1] + L.ws[b - 1] + g.scrollLeft;
      else if (b < m) x = L.xs[b] + (b < L.nFix ? g.scrollLeft : 0);
      else x = L.xs[m - 1] + L.ws[m - 1];
      drop.style.display = 'block'; drop.style.left = `${x}px`;
    };
    // perto da borda, rola sozinho para dar para levar a coluna longe
    const laco = () => {
      const rect = g.getBoundingClientRect(); const L = layRef.current;
      const esq = rect.left + L.fixR, dir = rect.left + g.clientWidth;
      const d = mx > dir - 24 ? Math.min(40, 6 + (mx - dir + 24) * 0.5) : mx < esq + 24 && g.scrollLeft > 0 ? -Math.min(40, 6 + (esq + 24 - mx) * 0.5) : 0;
      if (d) { g.scrollLeft += d; alvo(); }
      raf = requestAnimationFrame(laco);
    };
    const mv = (ev: MouseEvent) => {
      mx = ev.clientX; my = ev.clientY;
      if (!ativo && Math.abs(ev.clientX - x0) < 5) return;
      if (!ativo) { ativo = true; lona.classList.add('plx-movendo'); raf = requestAnimationFrame(laco); }
      alvo();
    };
    const up = () => {
      document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up);
      if (raf) cancelAnimationFrame(raf);
      drop.style.display = 'none'; lona.classList.remove('plx-movendo');
      if (!ativo) { selColuna(vi); desenhar(); return; }
      if (b >= 0 && (b < f.c0 || b > f.c1 + 1)) reordenar(f.c0, f.c1, b);
    };
    document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
  }
  function novaColunaMes(refCol: ColV) {
    const todas = colsOrdRef.current;
    const meses = todas.filter((c) => c.tipo === 'mes' && c.mesPos != null);
    const k = meses.length ? Math.max(...meses.map((c) => c.mesPos ?? 0)) + 1 : 0;
    const ultima = meses.length ? meses.reduce((a, c) => (c.ordem > a.ordem ? c : a)) : null;
    const cab = cabecalhosNovoMes(pr.current.dados, todas, k);
    opColuna({ op: 'criar', ref: ultima?.id ?? refCol.id, lado: 'dir', tipo: 'mes', titulo: `Mês ${k + 1}`, cab });
    aviso(`Criando o mês ${k + 1} depois da última coluna de mês…`);
  }
  function descrTipo(c: ColV): string {
    if (c.tipo === 'mes') return `mês ${(c.mesPos ?? 0) + 1}`;
    if (c.tipo === 'livre') return 'coluna livre';
    return ehSenhaCol(c) ? 'senha protegida' : 'ligada ao cadastro';
  }
  function abrirMenuColuna(vi: number, x: number, y: number) {
    const L = layRef.current; const c = L.cols[vi]; const p = pr.current.perms; const S = sel.current; const f = faixa();
    if (!c) return;
    const naSel = f && (S.modo === 'col' || S.modo === 'tudo') && vi >= f.c0 && vi <= f.c1;
    const alvo = naSel && f ? L.cols.slice(f.c0, f.c1 + 1) : [c];
    const ocultas = colsOrdRef.current.filter((x2) => x2.oculta).map((x2) => x2.id);
    const itens: ItemMenu[] = [];
    if (p.estrutura) {
      itens.push({ rotulo: 'Inserir coluna à esquerda', acao: () => opColuna({ op: 'criar', ref: c.id, lado: 'esq', tipo: 'livre', titulo: 'Nova coluna' }) });
      itens.push({ rotulo: 'Inserir coluna à direita', acao: () => opColuna({ op: 'criar', ref: c.id, lado: 'dir', tipo: 'livre', titulo: 'Nova coluna' }) });
      itens.push({ rotulo: 'Nova coluna de mês', atalho: 'próximo mês', acao: () => { if (pr.current.onNovoMes) pr.current.onNovoMes(); else novaColunaMes(c); } });
      itens.push({ sep: true });
      itens.push({ rotulo: 'Renomear…', acao: () => dlg.current?.renomear({ titulo: `Renomear coluna ${c.letra}`, valor: c.titulo, aoOk: (v) => opColuna({ op: 'alterar', coluna: c.id, patch: { titulo: v } }, { titulo: v }) }) });
      itens.push({ rotulo: 'Ajustar largura ao conteúdo', acao: () => autoAjustar(vi) });
      itens.push({
        rotulo: alvo.length > 1 ? `Ocultar ${alvo.length} colunas` : 'Ocultar coluna',
        acao: () => {
          if (alvo.length >= L.cols.length) { aviso('Pelo menos uma coluna precisa ficar visível'); return; }
          for (const a of alvo) opColuna({ op: 'alterar', coluna: a.id, patch: { oculta: true } }, { oculta: true });
        },
      });
      if (ocultas.length) itens.push({ rotulo: `Mostrar colunas ocultas (${ocultas.length})`, acao: () => mostrarOcultas(ocultas) });
    }
    if (p.excluirColuna && c.tipo === 'livre') {
      itens.push({ sep: true });
      itens.push({
        rotulo: 'Excluir coluna', perigo: true,
        acao: () => dlg.current?.confirmar({
          titulo: 'Excluir coluna',
          msg: `A coluna ${c.letra}${c.titulo ? ` (${c.titulo})` : ''} e tudo o que está escrito nela serão apagados.`,
          rotulo: 'Excluir', destrutivo: true, aoOk: () => opColuna({ op: 'excluir', coluna: c.id }),
        }),
      });
    }
    if (!itens.length) itens.push({ rotulo: 'Sem permissão para alterar colunas', desab: true });
    menu.current?.abrir(x, y, itens, `Coluna ${c.letra} · ${c.titulo || 'sem título'} · ${descrTipo(c)}`);
  }
  function itensLinha(r: number): ItemMenu[] {
    const L = layRef.current; const l = L.vis[r]; const p = pr.current.perms;
    if (!l) return [];
    const bloco = l.bloco ? blocoPorIdRef.current.get(l.bloco) ?? null : null;
    const podeCli = l.bloco != null && (p.inserirCliente ? p.inserirCliente(bloco) : p.estrutura || bloco?.situacao === 'ativo');
    const itens: ItemMenu[] = [];
    if (podeCli) {
      // "acima" de cabeçalho/rótulo cairia no fim do bloco de CIMA na tela, com o dia/situação do bloco de baixo
      if (l.tipo !== 'cabecalho' && l.tipo !== 'rotulo') {
        itens.push({ rotulo: 'Inserir cliente acima', acao: () => opLinha({ op: 'inserir', ref: l.id, lado: 'acima', tipo: 'cliente' }) });
      }
      itens.push({ rotulo: 'Inserir cliente abaixo', acao: () => opLinha({ op: 'inserir', ref: l.id, lado: 'abaixo', tipo: 'cliente' }) });
    }
    if (p.estrutura) {
      itens.push({ rotulo: 'Inserir linha em branco acima', acao: () => opLinha({ op: 'inserir', ref: l.id, lado: 'acima', tipo: 'vazia' }) });
      itens.push({ rotulo: 'Inserir linha em branco abaixo', acao: () => opLinha({ op: 'inserir', ref: l.id, lado: 'abaixo', tipo: 'vazia' }) });
    }
    if (l.tipo === 'cliente' && l.leadId) {
      const lead = l.leadId;
      if (itens.length) itens.push({ sep: true });
      itens.push({ rotulo: 'Abrir ficha do cliente', acao: () => pr.current.onAbrirFicha(lead) });
      const mover = pr.current.onMoverCancelados;
      if (mover) {
        const f = faixa();
        const naSel = !!f && r >= f.r0 && r <= f.r1 ? clientesDaFaixa() : [];
        const ids = naSel.includes(lead) ? naSel : [lead];
        itens.push({ rotulo: ids.length > 1 ? `Mover ${ids.length} clientes para Cancelados…` : 'Mover para Cancelados…', acao: () => mover(ids) });
      }
    }
    const podeExcluir = l.tipo === 'cliente' ? p.excluirCliente : p.estrutura;
    if (podeExcluir) {
      if (itens.length) itens.push({ sep: true });
      const colNome = L.cols.find((c) => c.campo === 'nome');
      const nome = colNome ? textoCel(l, colNome).trim() : '';
      itens.push({
        rotulo: l.tipo === 'cliente' ? 'Excluir cliente' : 'Excluir linha', perigo: true,
        acao: () => dlg.current?.confirmar(l.tipo === 'cliente'
          ? { titulo: 'Excluir cliente', msg: `${nome || 'Este cliente'} sai da planilha e vai para a Lixeira. Dá para restaurar pela Lixeira.`, rotulo: 'Mandar para a Lixeira', destrutivo: true, aoOk: () => opLinha({ op: 'excluir', linha: l.id }) }
          : { titulo: `Excluir linha ${L.num[r]}`, msg: 'A linha e o que estiver escrito nela serão apagados.', rotulo: 'Excluir', destrutivo: true, aoOk: () => opLinha({ op: 'excluir', linha: l.id }) }),
      });
    }
    return itens;
  }
  /** clientes (leadId, sem repetir) das linhas da seleção atual, na ordem da tela */
  function clientesDaFaixa(): string[] {
    const f = faixa(); if (!f) return [];
    const L = layRef.current; const out: string[] = []; const vistos = new Set<string>();
    for (let r = f.r0; r <= f.r1; r++) {
      const l = L.vis[r];
      if (l?.tipo === 'cliente' && l.leadId && !vistos.has(l.leadId)) { vistos.add(l.leadId); out.push(l.leadId); }
    }
    return out;
  }
  function abrirMenuLinha(r: number, x: number, y: number) {
    const L = layRef.current;
    const itens = itensLinha(r);
    if (!itens.length) itens.push({ rotulo: 'Sem ações disponíveis nesta linha', desab: true });
    menu.current?.abrir(x, y, itens, `Linha ${L.num[r]}`);
  }
  /** menu da célula (botão direito). `ci` = coluna clicada: nas de mês de cliente vêm primeiro as
      ações de pagamento (informar, não pago; aprovar/recusar/comprovante p/ o financeiro) */
  function abrirMenuCelula(r: number, ci: number, x: number, y: number) {
    const L = layRef.current;
    const pag = itensPagamento(r, ci);
    const itens: ItemMenu[] = [
      ...pag,
      ...(pag.length ? [{ sep: true }] : []),
      { rotulo: 'Recortar', atalho: 'Ctrl+X', acao: () => { focar(); prepararCopia(); document.execCommand('cut'); } },
      { rotulo: 'Copiar', atalho: 'Ctrl+C', acao: () => { focar(); prepararCopia(); document.execCommand('copy'); } },
      {
        rotulo: 'Colar', atalho: 'Ctrl+V',
        acao: () => {
          focar();
          const cb = navigator.clipboard;
          if (!cb?.readText) { aviso('Use Ctrl+V para colar'); return; }
          cb.readText().then((t) => { if (t) colarTexto(t); }, () => aviso('O navegador bloqueou. Use Ctrl+V para colar'));
        },
      },
      { sep: true },
      { rotulo: 'Limpar conteúdo', atalho: 'Delete', acao: () => limparSelecao('limpar') },
      { rotulo: 'Limpar formatação', acao: () => formatar(null) },
      { rotulo: 'Preencher para baixo', atalho: 'Ctrl+D', acao: () => preencherAbaixo() },
    ];
    const li = itensLinha(r);
    if (li.length) { itens.push({ sep: true }); itens.push(...li); }
    const col = L.cols[ci]; const lin = L.vis[r];
    const comp = col && lin ? rotuloComp(lin, col) : '';
    menu.current?.abrir(x, y, itens, `${refDe(r, ci)}${col ? ` · ${col.titulo || 'sem título'}` : ''}${comp ? ` · ${comp}` : ''}`);
  }

  /* ---------- mouse ---------- */
  function atualizarArrasto() {
    const A = arr.current; if (!A) return;
    const p = celulaEm(A.x, A.y, true); if (!p) return;
    const S = sel.current; let mudou = false;
    if (A.tipo !== 'col' && S.fr !== p.r) { S.fr = p.r; mudou = true; }
    if (A.tipo !== 'lin' && S.fc !== p.c) { S.fc = p.c; mudou = true; }
    if (mudou) agendarDesenho();
  }
  function autoRolar() {
    const A = arr.current; const g = gradeRef.current;
    if (!A || !g) return;
    const rect = g.getBoundingClientRect();
    const vel = (d: number) => Math.min(48, 4 + d * 0.6);
    let dx = 0, dy = 0;
    const topo = rect.top + ALT_LETRAS, base = rect.top + g.clientHeight;
    const esq = rect.left + LARG_RN, dir = rect.left + g.clientWidth;
    if (A.tipo !== 'col') { if (A.y < topo) dy = -vel(topo - A.y); else if (A.y > base) dy = vel(A.y - base); }
    if (A.tipo !== 'lin') { if (A.x < esq) dx = -vel(esq - A.x); else if (A.x > dir) dx = vel(A.x - dir); }
    if (dx || dy) {
      const sl = g.scrollLeft, st = g.scrollTop;
      g.scrollLeft += dx; g.scrollTop += dy;
      if (g.scrollLeft !== sl || g.scrollTop !== st) atualizarArrasto();
    }
  }
  function iniciarArrasto(tipo: 'cel' | 'lin' | 'col', x: number, y: number) {
    arr.current = { tipo, x, y, raf: 0 };
    const mv = (ev: MouseEvent) => { const A = arr.current; if (!A) return; A.x = ev.clientX; A.y = ev.clientY; atualizarArrasto(); };
    const up = () => {
      document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up);
      const A = arr.current; if (A?.raf) cancelAnimationFrame(A.raf);
      arr.current = null;
      notificar();
    };
    document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
    const laco = () => { const A = arr.current; if (!A) return; autoRolar(); A.raf = requestAnimationFrame(laco); };
    arr.current.raf = requestAnimationFrame(laco);
  }
  function naFaixa(r: number, c: number): boolean {
    const f = faixa();
    return !!f && r >= f.r0 && r <= f.r1 && c >= f.c0 && c <= f.c1;
  }
  function aoMouseDown(e: RMouseEvent<HTMLDivElement>) {
    const alvo = e.target as HTMLElement; const g = gradeRef.current; const sink = sinkRef.current;
    if (!g || !sink) return;
    if (alvo === sink) { if (ed.current) ed.current.modo = 'editar'; return; }
    const rect = g.getBoundingClientRect();
    if (e.clientX - rect.left >= g.clientWidth || e.clientY - rect.top >= g.clientHeight) return;   // barra de rolagem
    if (alvo === g) return;
    // botão direito (ou Ctrl+clique no Mac): quem decide é o contextmenu
    if (e.button !== 0 || (e.ctrlKey && !e.metaKey && /Mac/i.test(navigator.platform))) { e.preventDefault(); return; }
    e.preventDefault();
    if (ed.current) confirmarEdicao();
    menu.current?.fechar();
    // "+" do informar pagamento (hover)
    if (alvo.closest('[data-mais]')) { const a = maisAlvo.current; if (a) informarEm(a); return; }
    const S = sel.current;
    if (alvo.closest('[data-canto]')) { selTudo(); focar(); return; }
    const letra = alvo.closest<HTMLElement>('[data-letra]');
    if (letra) {
      const vi = Number(letra.dataset.letra);
      if (alvo.closest('[data-rz]')) { iniciarResize(vi, e.clientX); return; }
      if (alvo.closest('[data-menu-col]')) {
        const f = faixa();
        if (!((S.modo === 'col' || S.modo === 'tudo') && f && vi >= f.c0 && vi <= f.c1)) selColuna(vi);
        desenhar();
        const r = letra.getBoundingClientRect();
        abrirMenuColuna(vi, r.left, r.bottom + 2);
        return;
      }
      const oc = alvo.closest<HTMLElement>('[data-oc]');
      if (oc) { if (pr.current.perms.estrutura) mostrarOcultas((oc.dataset.oc ?? '').split(',').filter(Boolean)); focar(); return; }
      const f = faixa();
      const naSel = !!f && (S.modo === 'col' || S.modo === 'tudo') && vi >= f.c0 && vi <= f.c1;
      if (naSel && pr.current.perms.estrutura && !e.shiftKey) { iniciarReordenar(vi, e.clientX); focar(); return; }
      if (e.shiftKey && S.modo === 'col') S.fc = vi; else selColuna(vi);
      desenhar(); iniciarArrasto('col', e.clientX, e.clientY); focar();
      return;
    }
    if (alvo.closest('[data-rn]')) {
      const p = celulaEm(e.clientX, e.clientY, false); if (!p) return;
      if (alvo.closest('[data-menu-linha]')) {
        const f = faixa();
        if (!((S.modo === 'lin' || S.modo === 'tudo') && f && p.r >= f.r0 && p.r <= f.r1)) selLinha(p.r);
        desenhar();
        const r = (alvo.closest('[data-menu-linha]') as HTMLElement).getBoundingClientRect();
        abrirMenuLinha(p.r, r.right + 2, r.top);
        return;
      }
      if (e.shiftKey && S.modo === 'lin') S.fr = p.r; else selLinha(p.r);
      desenhar(); iniciarArrasto('lin', e.clientX, e.clientY); focar();
      return;
    }
    const p = celulaEm(e.clientX, e.clientY, false);
    if (!p) { focar(); return; }
    if (e.shiftKey) { if (S.modo !== 'cel') { S.modo = 'cel'; S.ar = S.tr; S.ac = S.tc; } S.fr = p.r; S.fc = p.c; }
    else selCel(p.r, p.c);
    desenhar();
    iniciarArrasto('cel', e.clientX, e.clientY);
    focar();
  }
  function aoDuploClique(e: RMouseEvent<HTMLDivElement>) {
    const alvo = e.target as HTMLElement;
    if (alvo === sinkRef.current) return;
    const letra = alvo.closest<HTMLElement>('[data-letra]');
    if (letra) { if (alvo.closest('[data-rz]') && pr.current.perms.estrutura) autoAjustar(Number(letra.dataset.letra)); return; }
    if (alvo.closest('[data-rn]') || alvo.closest('[data-canto]') || alvo.closest('[data-mais]')) return;
    const p = celulaEm(e.clientX, e.clientY, false); if (!p) return;
    const L = layRef.current; const l = L.vis[p.r]; const c = L.cols[p.c];
    if (!l || !c) return;
    // duplo clique no NOME abre a ficha (contrato §6); nas outras células, edita
    if (c.campo === 'nome' && l.tipo === 'cliente' && l.leadId) { pr.current.onAbrirFicha(l.leadId); return; }
    // mês de cliente: amarelo abre o comprovante (o financeiro aprova ali); quem não aprova
    // (comercial) informa o pagamento pela janela; quem aprova edita o valor direto
    if (l.tipo === 'cliente' && c.tipo === 'mes') {
      const est = estadoCel(l, c);
      if (est?.tipo === 'pendente' && est.entrada && pr.current.onVerComprovante) {
        selCel(p.r, p.c); desenhar(); pr.current.onVerComprovante(est.entrada.id); return;
      }
      if (!pr.current.perms.aprovarPagamento) {
        if (podeInformarCel(l, c, est)) { informarEm({ linhaId: l.id, colunaId: c.id }); return; }
        if (est?.tipo === 'pago' && compDaCel(l, c)) { selCel(p.r, p.c); desenhar(); aviso('Este mês já está pago (aprovado pelo financeiro).'); return; }
      }
    }
    selCel(p.r, p.c);
    iniciarEdicao('editar');
    focar();
  }
  function aoContexto(e: RMouseEvent<HTMLDivElement>) {
    const alvo = e.target as HTMLElement;
    if (alvo === sinkRef.current && ed.current) return;   // menu nativo do editor (colar, corretor)
    e.preventDefault();
    if (ed.current) confirmarEdicao();
    const S = sel.current;
    const letra = alvo.closest<HTMLElement>('[data-letra]');
    if (letra) {
      const vi = Number(letra.dataset.letra); const f = faixa();
      if (!((S.modo === 'col' || S.modo === 'tudo') && f && vi >= f.c0 && vi <= f.c1)) selColuna(vi);
      desenhar(); focar();
      abrirMenuColuna(vi, e.clientX, e.clientY);
      return;
    }
    if (alvo.closest('[data-canto]')) return;
    const p = celulaEm(e.clientX, e.clientY, false); if (!p) return;
    if (alvo.closest('[data-rn]')) {
      const f = faixa();
      if (!((S.modo === 'lin' || S.modo === 'tudo') && f && p.r >= f.r0 && p.r <= f.r1)) selLinha(p.r);
      desenhar(); focar();
      abrirMenuLinha(p.r, e.clientX, e.clientY);
      return;
    }
    if (!naFaixa(p.r, p.c)) selCel(p.r, p.c);
    esconderMais();
    desenhar(); focar();
    abrirMenuCelula(p.r, p.c, e.clientX, e.clientY);
  }

  /* ---------- botão "+" (informar pagamento) sob o ponteiro ----------
     Um botão só, mexido direto no DOM (nada re-renderiza ao passar o mouse). Aparece na
     célula de mês de cliente sob o ponteiro quando dá para informar (nem pago nem aguardando). */
  function esconderMais() {
    maisAlvo.current = null;
    const b = maisRef.current;
    if (b && b.style.display !== 'none') b.style.display = 'none';
  }
  function posMais() {
    rafM.current = 0;
    const b = maisRef.current; const g = gradeRef.current;
    if (!b || !g) return;
    if (!mouse.current || ed.current || arr.current || !pr.current.onInformarPagamento || !pr.current.perms.informarPagamento) { esconderMais(); return; }
    const { x, y } = mouse.current;
    const rect = g.getBoundingClientRect();
    const vx = x - rect.left, vy = y - rect.top;
    // fora da área das células (letras, números, barras de rolagem)
    if (vy < ALT_LETRAS || vx < LARG_RN || vx >= g.clientWidth || vy >= g.clientHeight) { esconderMais(); return; }
    const p = celulaEm(x, y, false);
    const L = layRef.current;
    if (!p || p.c < L.nFix) { esconderMais(); return; }
    const l = L.vis[p.r], c = L.cols[p.c];
    if (!l || !c || !podeInformarCel(l, c)) { esconderMais(); return; }
    const h = L.tops[p.r + 1] - L.tops[p.r];
    const tam = Math.max(12, Math.min(18, h - 6));
    b.style.width = `${tam}px`; b.style.height = `${tam}px`;
    b.style.top = `${L.tops[p.r] + (h - tam) / 2}px`;
    b.style.left = `${L.xs[p.c] + L.ws[p.c] - tam - 4}px`;
    b.style.display = 'grid';
    maisAlvo.current = { linhaId: l.id, colunaId: c.id };
  }
  function agendarMais() { if (!rafM.current) rafM.current = requestAnimationFrame(posMais); }
  function aoMoverMouse(e: RMouseEvent<HTMLDivElement>) {
    mouse.current = { x: e.clientX, y: e.clientY };
    agendarMais();
  }
  function aoSairMouse() { mouse.current = null; esconderMais(); }

  /* ---------- teclado ---------- */
  function aoTeclar(e: RKeyboardEvent<HTMLDivElement>) {
    if (e.target !== sinkRef.current) return;
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    const k = e.key; const mod = e.ctrlKey || e.metaKey; const sh = e.shiftKey;
    const E = ed.current;
    if (atalhoDaTela(e)) return;   // Ctrl+S (salva sozinha) · Ctrl+F (busca da tela)
    if (E) {
      if (k === 'Enter' && e.altKey && !mod) {
        // Alt+Enter = quebra de linha dentro da célula (como no Excel)
        e.preventDefault();
        const sink = sinkRef.current;
        if (sink) { inserirQuebra(sink); aoInputSink(); }
        return;
      }
      if (k === 'Enter') { e.preventDefault(); confirmarEdicao(sh ? -1 : 1, 0, true); return; }
      if (k === 'Tab') { e.preventDefault(); confirmarEdicao(0, sh ? -1 : 1, true); return; }
      if (k === 'Escape') { e.preventDefault(); cancelarEdicao(); return; }
      if (k === 'F2') { e.preventDefault(); E.modo = E.modo === 'digitar' ? 'editar' : 'digitar'; return; }
      if (E.modo === 'digitar' && !mod && !e.altKey) {
        const dir: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
        const d = dir[k];
        if (d && !sh) { e.preventDefault(); confirmarEdicao(d[0], d[1], false); }
      }
      return;
    }
    const S = sel.current; const L = layRef.current;
    const n = L.vis.length, m = L.cols.length;
    if (mod && !e.altKey) {
      const kl = k.toLowerCase();
      if (kl === 'z') { e.preventDefault(); if (sh) refazer(); else desfazer(); return; }
      if (kl === 'y') { e.preventDefault(); refazer(); return; }
      if (kl === 'a') { e.preventDefault(); selTudo(); return; }
      if (kl === 'b') { e.preventDefault(); alternarEstilo('b'); return; }
      if (kl === 'i') { e.preventDefault(); alternarEstilo('i'); return; }
      if (kl === 'd') { e.preventDefault(); preencherAbaixo(); return; }
      if (kl === 'c' || kl === 'x') { prepararCopia(); return; }
      if (kl === 'v') return;   // o evento paste cuida
      if (k === ' ') { e.preventDefault(); selColuna(S.tc); desenhar(); return; }
      if (k === 'Home') { e.preventDefault(); irPara(0, 0, sh); return; }
      if (k === 'End') { e.preventDefault(); irPara(n - 1, m - 1, sh); return; }
    }
    switch (k) {
      case 'ArrowUp': e.preventDefault(); mover(-1, 0, sh, mod); return;
      case 'ArrowDown': e.preventDefault(); mover(1, 0, sh, mod); return;
      case 'ArrowLeft': e.preventDefault(); mover(0, -1, sh, mod); return;
      case 'ArrowRight': e.preventDefault(); mover(0, 1, sh, mod); return;
      case 'Tab': {
        const f = faixa();
        const unica = !f || (f.r0 === f.r1 && f.c0 === f.c1);
        // Tab na última coluna (sem intervalo): o foco sai da grade — sem armadilha de teclado
        if (unica && !sh && S.tc >= m - 1) return;
        // Shift+Tab na coluna A fica (como no Excel): o foco cairia na barra de fórmula já editando a célula
        if (unica && sh && S.tc <= 0) { e.preventDefault(); return; }
        e.preventDefault(); andarNaFaixa(0, sh ? -1 : 1); return;
      }
      case 'Enter': {
        // fora da edição, Enter só anda (desce; Shift sobe), como no Excel — editar é F2 / duplo clique / digitar
        e.preventDefault();
        const f = faixa();
        if (f && (f.r0 !== f.r1 || f.c0 !== f.c1)) andarNaFaixa(sh ? -1 : 1, 0);
        else mover(sh ? -1 : 1, 0, false, false);
        return;
      }
      case 'F2': e.preventDefault(); iniciarEdicao('editar'); return;
      case 'Home': e.preventDefault(); irPara(sh ? S.fr : S.tr, 0, sh); return;
      case 'End': e.preventDefault(); irPara(sh ? S.fr : S.tr, m - 1, sh); return;
      case 'PageDown': e.preventDefault(); pagina(1, sh); return;
      case 'PageUp': e.preventDefault(); pagina(-1, sh); return;
      case 'Delete': case 'Backspace': e.preventDefault(); limparSelecao('limpar'); return;
      // Esc que a grade usa (tirar o tracejado da cópia) fica marcado; senão sobe (ex.: sair da tela cheia)
      case 'Escape': if (copia.current) { e.preventDefault(); copia.current = null; desenhar(); } return;
      case ' ': if (sh && !mod) { e.preventDefault(); selLinha(S.tr); desenhar(); } return;
      default:
    }
  }

  /* ---------- API para barra e rodapé (objeto estável) ---------- */
  const apiRef = useRef<ApiGrade | null>(null);
  if (!apiRef.current) apiRef.current = {} as ApiGrade;
  const api = apiRef.current;
  Object.assign(api, {
    ouvir: (fn: () => void) => { ouvintes.current.add(fn); return () => { ouvintes.current.delete(fn); }; },
    faixa, lay: () => layRef.current, texto: textoVisto, clientesSel: clientesDaFaixa,
    ativo: () => {
      const L = layRef.current; const S = sel.current;
      const l = L.vis[S.tr], c = L.cols[S.tc];
      if (!l || !c) return null;
      const est = estadoCel(l, c);
      return { l, c, editavel: podeTexto(l, c), estado: est ? visDoEstado(est, l.e?.[c.id])?.dica : undefined };
    },
    estiloAtivo,
    podeDesfazer: () => pilhaD.current.length > 0,
    podeRefazer: () => pilhaR.current.length > 0,
    desfazer: () => { desfazer(); focar(); },
    refazer: () => { refazer(); focar(); },
    formatar, alternar: alternarEstilo, alinhar, focar,
  } satisfies ApiGrade);

  // focarRef: a tela devolve o foco à grade ao fechar os modais dela
  const focarRef = props.focarRef;
  useEffect(() => {
    if (!focarRef) return;
    const fn = () => apiRef.current?.focar();
    focarRef.current = fn;
    return () => { if (focarRef.current === fn) focarRef.current = null; };
  }, [focarRef]);
  const clientesSelRef = props.clientesSelRef;
  useEffect(() => {
    if (!clientesSelRef) return;
    const fn = () => apiRef.current?.clientesSel() ?? [];
    clientesSelRef.current = fn;
    return () => { if (clientesSelRef.current === fn) clientesSelRef.current = null; };
  }, [clientesSelRef]);

  /* ---------- efeitos ---------- */
  // layout mudou (dados, filtro, colunas): seleção segue as mesmas células; janela e overlay recalculados
  useLayoutEffect(() => {
    remapearSel();
    recalcJanela();
    desenhar();
    if (ed.current && !lay.idxL.has(ed.current.l)) cancelarEdicao();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lay]);

  // folha ou entradas mudaram: o "+" e o rodapé reavaliam a célula (ex.: acabou de informar → amarela)
  useEffect(() => {
    if (mouse.current) agendarMais();
    notificar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lay, estPorLinha]);

  useEffect(() => {
    const g = gradeRef.current;
    if (!g || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => recalcJanela());
    ro.observe(g);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ir até o bloco (chips de ciclo da tela)
  useEffect(() => {
    if (!irParaBloco) return;
    const id = irParaBloco.split('#')[0];
    const L = layRef.current; const g = gradeRef.current;
    let i = L.vis.findIndex((l) => l.tipo === 'cabecalho' && l.bloco === id);
    if (i < 0) i = L.vis.findIndex((l) => l.bloco === id);
    if (i < 0 || !g) return;
    if (ed.current) confirmarEdicao();
    g.scrollTop = L.tops[i];
    selCel(i, sel.current.tc);
    desenhar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [irParaBloco]);

  // otimista: some quando o dado real chega igual (ou expira em 20s)
  useEffect(() => {
    if (!pend.size) return;
    const agora = Date.now();
    let mudou = false;
    const m = new Map<string, Map<string, Pend>>();
    pend.forEach((lm, lid) => {
      const base = linhaPorId.get(lid);
      const nm = new Map<string, Pend>();
      lm.forEach((v, cid) => {
        const b = base?.c[cid];
        const igual = !!base && (b?.t || null) === (v.cel.t || null) && chaveEstilo(b?.s) === chaveEstilo(v.cel.s);
        if (!base || igual || agora - v.ts > 20000) mudou = true; else nm.set(cid, v);
      });
      if (nm.size) m.set(lid, nm);
    });
    if (mudou) setPend(m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linhaPorId]);
  useEffect(() => {
    if (!senhaLocal.size) return;
    const agora = Date.now();
    let mudou = false;
    const m = new Map<string, SenhaLocal>();
    senhaLocal.forEach((v, lid) => {
      const b = senhas?.get(lid);
      const igual = !!b && (v.inss === undefined || (v.inss || null) === (b.inss || null)) && (v.reclame === undefined || (v.reclame || null) === (b.reclame || null));
      if (igual || agora - v.ts > 60000) mudou = true; else m.set(lid, v);
    });
    if (mudou) setSenhaLocal(m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [senhas]);
  useEffect(() => {
    if (!colPatch.size) return;
    const agora = Date.now();
    const porId = new Map(dados.colunas.map((c) => [c.id, c]));
    let mudou = false;
    const m = new Map<string, PatchCol>();
    colPatch.forEach((p, id) => {
      const c = porId.get(id);
      const igual = !!c && (p.titulo === undefined || p.titulo === c.titulo) && (p.largura === undefined || p.largura === c.largura)
        && (p.oculta === undefined || p.oculta === c.oculta) && (p.ordem === undefined || p.ordem === c.ordem);
      if (!c || igual || agora - p.ts > 20000) mudou = true; else m.set(id, p);
    });
    if (mudou) setColPatch(m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dados.colunas]);
  // relógio de expiração (se o dado real nunca chegar, volta ao que o servidor diz)
  const temPendente = pend.size > 0 || colPatch.size > 0 || senhaLocal.size > 0;
  useEffect(() => {
    if (!temPendente) return;
    const t = setInterval(() => {
      const agora = Date.now();
      setPend((prev) => {
        let mudou = false; const m = new Map<string, Map<string, Pend>>();
        prev.forEach((lm, lid) => { const nm = new Map<string, Pend>(); lm.forEach((v, cid) => { if (agora - v.ts > 20000) mudou = true; else nm.set(cid, v); }); if (nm.size) m.set(lid, nm); });
        return mudou ? m : prev;
      });
      setColPatch((prev) => {
        let mudou = false; const m = new Map<string, PatchCol>();
        prev.forEach((p, id) => { if (agora - p.ts > 20000) mudou = true; else m.set(id, p); });
        return mudou ? m : prev;
      });
      setSenhaLocal((prev) => {
        let mudou = false; const m = new Map<string, SenhaLocal>();
        prev.forEach((v, id) => { if (agora - v.ts > 60000) mudou = true; else m.set(id, v); });
        return mudou ? m : prev;
      });
    }, 5000);
    return () => clearInterval(t);
  }, [temPendente]);

  useEffect(() => () => {
    if (rafD.current) cancelAnimationFrame(rafD.current);
    if (rafJ.current) cancelAnimationFrame(rafJ.current);
    if (rafM.current) cancelAnimationFrame(rafM.current);
    if (arr.current?.raf) cancelAnimationFrame(arr.current.raf);
  }, []);

  const alternarCongelar = () => {
    if (ed.current) confirmarEdicao();
    setCongelar((v) => { gravarCongelar(!v); return !v; });
    focar();
  };

  /* ---------- render ---------- */
  const n = vis.length;
  const fim = Math.min(janela.b, n);
  const linhasJsx: ReactNode[] = [];
  for (let i = Math.min(janela.a, n); i < fim; i++) {
    const l = vis[i];
    linhasJsx.push(
      <Linha key={l.id} l={l} num={lay.num[i]} top={lay.tops[i]} alt={lay.tops[i + 1] - lay.tops[i]} cols={cols}
        dest={dest} senha={l.leadId ? senhasEf?.get(l.leadId) : undefined} verSenha={podeVerSenha} est={estPorLinha.get(l.id)} />,
    );
  }
  const estrutura = perms.estrutura;
  const menuCol = estrutura || perms.excluirColuna;

  return (
    <div className={`plx${className ? ` ${className}` : ''}`}>
      {/* crítica 12/11: formatação e barra de fórmula numa linha só (a grade ganha uma faixa) */}
      <BarraFerramentas api={api} congelado={congelar} aoCongelar={alternarCongelar} temBusca={!!props.onBuscar} extra={props.barraExtra}
        meio={(
          <div className="plx-fbar">
            <input ref={nomeRef} className="plx-nome" aria-label="Referência da célula (digite para ir)" spellCheck={false}
              autoComplete="off" onKeyDown={aoNomeTecla} onFocus={(e) => e.currentTarget.select()} onBlur={() => atualizarFbar()} />
            <span className="plx-fx-rot" aria-hidden="true">fx</span>
            <textarea ref={fxRef} className="plx-fx" rows={1} wrap="off" aria-label="Conteúdo da célula" spellCheck={false} autoComplete="off"
              onFocus={aoFxFoco} onInput={aoFxInput} onKeyDown={aoFxTecla} onBlur={aoFxBlur} />
          </div>
        )} />
      <div ref={gradeRef} className="plx-grade" role="grid" aria-label="Planilha de cobranças" aria-rowcount={dados.linhas.length + 1}
        aria-colcount={colsOrd.length + 1} aria-multiselectable="true"
        onMouseDown={aoMouseDown} onDoubleClick={aoDuploClique} onContextMenu={aoContexto} onKeyDown={aoTeclar}
        onCopy={aoCopiar} onCut={aoRecortar} onPaste={aoColar} onScroll={aoRolar}
        onMouseMove={props.onInformarPagamento ? aoMoverMouse : undefined} onMouseLeave={aoSairMouse}>
        <div ref={lonaRef} className="plx-lona" style={estiloLona}>
          <div className="plx-cab" role="rowgroup">
            <div className="plx-cab-grade" role="row" aria-rowindex={1}>
              <div className="plx-canto" data-canto="" role="columnheader" title="Selecionar tudo (Ctrl+A)" aria-label="Selecionar tudo" />
              {cols.map((c, vi) => (
                <div key={c.id} className={`plx-letra${c.fixa >= 0 ? ' plx-c-fixa' : ''}${c.ultFixa ? ' plx-c-ult' : ''}${c.tipo === 'mes' ? ' plx-letra-mes' : ''}${vi > 0 && c.tipo === 'mes' && cols[vi - 1].tipo !== 'mes' ? ' plx-c-sep' : ''}`}
                  style={c.fixa >= 0 ? { left: `var(--plx-f${c.fixa})` } : undefined}
                  data-letra={vi} role="columnheader" aria-colindex={c.li + 2}
                  title={`${c.letra} · ${c.titulo || 'sem título'} · ${descrTipo(c)}${estrutura ? ' — arraste a letra para mover' : ''}`}>
                  {c.ocultasAntes.length > 0 && (
                    <span className="plx-oc" data-oc={c.ocultasAntes.join(',')}
                      title={`${c.ocultasAntes.length} coluna(s) oculta(s) aqui${estrutura ? ' — clique para mostrar' : ''}`} />
                  )}
                  <span className="plx-letra-txt">{c.letra}</span>
                  {menuCol && (
                    <button type="button" className="plx-letra-menu" data-menu-col="" tabIndex={-1} aria-label={`Opções da coluna ${c.letra}`}>
                      <Ic d={P.seta} s={10} />
                    </button>
                  )}
                  {vi === cols.length - 1 && ocultasFim.length > 0 && (
                    <span className="plx-oc plx-oc-fim" data-oc={ocultasFim.join(',')}
                      title={`${ocultasFim.length} coluna(s) oculta(s) no fim${estrutura ? ' — clique para mostrar' : ''}`} />
                  )}
                  {estrutura && <span className="plx-rz" data-rz="" title="Arraste para mudar a largura (duplo clique ajusta)" />}
                </div>
              ))}
            </div>
            <div ref={cabBandRef} className="plx-banda plx-cabsel" aria-hidden="true"><div className="plx-pc plx-pc-fx" /><div className="plx-pc plx-pc-rl" /></div>
          </div>
          <div className="plx-corpo" style={{ height: lay.tops[n] }} role="rowgroup">
            {linhasJsx}
            <div ref={selBandRef} className="plx-banda plx-sel" aria-hidden="true"><div className="plx-pc plx-pc-fx" /><div className="plx-pc plx-pc-rl" /></div>
            <div ref={cpBandRef} className="plx-banda plx-copia" aria-hidden="true"><div className="plx-pc plx-pc-fx" /><div className="plx-pc plx-pc-rl" /></div>
            <div ref={rnBandRef} className="plx-banda plx-rnsel" aria-hidden="true"><div className="plx-rnsel-pc" /></div>
            <div ref={atBandRef} className="plx-banda plx-atb">
              <div ref={atRef} className="plx-at">
                <textarea ref={sinkRef} className="plx-ed" rows={1} wrap="off" spellCheck={false} autoComplete="off" autoCorrect="off" autoCapitalize="off"
                  aria-label="Célula ativa" onInput={aoInputSink} onCompositionStart={aoCompIni} onCompositionEnd={aoCompFim} onBlur={aoSinkBlur} />
              </div>
            </div>
            {props.onInformarPagamento && (
              <button ref={maisRef} type="button" className="plx-mais" data-mais="" tabIndex={-1}
                title="Informar pagamento (com comprovante)" aria-label="Informar pagamento">
                <Ic d={P.mais} s={12} />
              </button>
            )}
          </div>
          <div ref={dropRef} className="plx-drop" aria-hidden="true" />
        </div>
        {n === 0 && <div className="plx-vazio">Nenhuma linha para mostrar{filtro ? ' com esse filtro' : ''}.</div>}
      </div>
      <Rodape api={api} ctl={rod} totais={totais} extra={props.rodapeExtra} />
      <MenuFlutuante ctl={menu} aoFechar={focar} />
      <Dialogos ctl={dlg} aoFechar={focar} />
    </div>
  );
}

/* ================= barra de formatação ================= */

function Paleta({ atual, aoEscolher, rotulo }: { atual: string | null | undefined; aoEscolher: (cor: string | null) => void; rotulo: string }) {
  const corRef = useRef<HTMLInputElement>(null);
  const escolherRef = useRef(aoEscolher);
  escolherRef.current = aoEscolher;
  useEffect(() => {
    const el = corRef.current; if (!el) return;
    // 'change' (não 'input'): aplica uma vez ao fechar o seletor, não a cada arrasto
    const fn = () => escolherRef.current(el.value.toUpperCase());
    el.addEventListener('change', fn);
    return () => el.removeEventListener('change', fn);
  }, []);
  return (
    <div className="plx-pop plx-paleta" role="menu" aria-label={rotulo}>
      <div className="plx-pal">
        {PALETA.map((p) => (
          <button key={p.nome} type="button" role="menuitem" title={p.nome} aria-label={p.nome}
            className={`plx-sw${p.cor ? '' : ' plx-sw-nada'}${(atual ?? null) === p.cor ? ' atual' : ''}`}
            style={p.cor ? { background: p.cor } : undefined} onMouseDown={semFoco} onClick={() => aoEscolher(p.cor)} />
        ))}
      </div>
      <label className="plx-outra">
        <input ref={corRef} type="color" defaultValue={atual ?? '#FFFF00'} />
        Outra cor…
      </label>
    </div>
  );
}

/* ---------- painel de atalhos (teclas desenhadas; ⌘ ⌥ ⇧ no Mac, Ctrl/Alt/Shift no resto) ---------- */
const EH_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);
const TECLA: Record<string, [mac: string, pc: string, nome: string]> = {
  mod: ['⌘', 'Ctrl', 'Command'], alt: ['⌥', 'Alt', 'Option'], shift: ['⇧', 'Shift', 'Shift'],
  enter: ['↩', 'Enter', 'Enter'], tab: ['⇥', 'Tab', 'Tab'], esc: ['esc', 'Esc', 'Esc'],
  del: ['⌫', 'Delete', 'Apagar'], espaco: ['Espaço', 'Espaço', 'Espaço'], setas: ['↑↓←→', '↑↓←→', 'setas'],
  home: ['fn ←', 'Home', 'Home'], end: ['fn →', 'End', 'End'], pgup: ['fn ↑', 'PgUp', 'Page Up'], pgdn: ['fn ↓', 'PgDn', 'Page Down'],
};
const tecla = (k: string) => (TECLA[k] ? (EH_MAC ? TECLA[k][0] : TECLA[k][1]) : k);
const nomeTecla = (k: string) => (TECLA[k] ? TECLA[k][2] : k);
/** um atalho = combinações alternativas (cada uma, teclas pressionadas juntas) */
type Atalho = { o: string; k: string[][]; txt?: string };
function Teclas({ k }: { k: string[][] }) {
  return (
    <span className="plx-at-teclas" aria-label={k.map((c) => c.map(nomeTecla).join(' + ')).join(' ou ')}>
      {k.map((c, i) => (
        <span key={i} className="plx-at-combo" aria-hidden>
          {i > 0 && <i className="plx-at-ou">ou</i>}
          {c.map((t) => <kbd key={t} className={t === 'setas' ? 'plx-kbd larga' : 'plx-kbd'}>{tecla(t)}</kbd>)}
        </span>
      ))}
    </span>
  );
}
function PainelAtalhos({ temBusca, aoFechar }: { temBusca: boolean; aoFechar: () => void }) {
  const grupos: { t: string; itens: Atalho[] }[] = [
    { t: 'Editar', itens: [
      { o: 'Editar substituindo o texto', k: [], txt: 'Digite' },
      { o: 'Editar mantendo o texto', k: [['F2']], txt: 'ou duplo clique' },
      { o: 'Confirmar e descer', k: [['enter']] },
      { o: 'Confirmar e ir para a direita', k: [['tab']] },
      { o: 'Quebra de linha na célula', k: [['alt', 'enter']] },
      { o: 'Cancelar a edição', k: [['esc']] },
      { o: 'Limpar as células', k: [['del']] },
    ] },
    { t: 'Copiar e colar', itens: [
      { o: 'Copiar', k: [['mod', 'C']] },
      { o: 'Recortar (limpa a origem na hora)', k: [['mod', 'X']] },
      { o: 'Colar (aceita dados do Excel)', k: [['mod', 'V']] },
      { o: 'Preencher para baixo', k: [['mod', 'D']] },
    ] },
    { t: 'Formatar', itens: [
      { o: 'Negrito', k: [['mod', 'B']] },
      { o: 'Itálico', k: [['mod', 'I']] },
    ] },
    { t: 'Navegar', itens: [
      { o: 'Mover a célula ativa', k: [['setas']] },
      { o: 'Ir até a borda dos dados', k: [['mod', 'setas']] },
      { o: 'Início / fim da linha', k: [['home'], ['end']] },
      { o: 'Primeira / última célula', k: [['mod', 'home'], ['mod', 'end']] },
      { o: 'Subir / descer uma tela', k: [['pgup'], ['pgdn']] },
    ] },
    { t: 'Selecionar', itens: [
      { o: 'Estender a seleção', k: [['shift', 'setas']] },
      { o: 'Linha inteira', k: [['shift', 'espaco']] },
      { o: 'Coluna inteira', k: [['mod', 'espaco']] },
      { o: 'Tudo', k: [['mod', 'A']] },
    ] },
    { t: 'Geral', itens: [
      { o: 'Desfazer', k: [['mod', 'Z']] },
      { o: 'Refazer', k: [['mod', 'Y'], ['mod', 'shift', 'Z']] },
      ...(temBusca ? [{ o: 'Buscar na planilha', k: [['mod', 'F']] }] : []),
      { o: 'Abrir a ficha do cliente', k: [], txt: 'Duplo clique no nome' },
    ] },
  ];
  const col = (gs: typeof grupos) => (
    <div className="plx-at-col">
      {gs.map((g) => (
        <section key={g.t} className="plx-at-grupo" aria-label={g.t}>
          <h4>{g.t}</h4>
          <ul>
            {g.itens.map((a) => (
              <li key={a.o}>
                <span className="plx-at-o">{a.o}</span>
                <span className="plx-at-k">
                  {a.k.length > 0 && <Teclas k={a.k} />}
                  {a.txt && <em className="plx-at-txt">{a.txt}</em>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
  return (
    <div className="plx-pop plx-atalhos" role="dialog" aria-label="Atalhos de teclado">
      <header className="plx-at-cab">
        <div>
          <b>Atalhos de teclado</b>
          <span>{EH_MAC ? 'Teclas do Mac' : 'Teclas do Windows'} · funcionam como no Excel</span>
        </div>
        <button type="button" className="plx-at-x" onMouseDown={semFoco} onClick={aoFechar} aria-label="Fechar atalhos">
          <Ic d="M18 6 6 18M6 6l12 12" s={14} />
        </button>
      </header>
      <div className="plx-at-corpo">
        {col(grupos.slice(0, 3))}
        {col(grupos.slice(3))}
      </div>
      <footer className="plx-at-pe">
        <Ic d="M20 6 9 17l-5-5" s={13} />
        <span>Tudo é salvo automaticamente a cada edição.</span>
      </footer>
    </div>
  );
}

function BarraFerramentas({ api, congelado, aoCongelar, temBusca, extra, meio }: { api: ApiGrade; congelado: boolean; aoCongelar: () => void; temBusca: boolean; extra?: ReactNode; meio?: ReactNode }) {
  const [st, setSt] = useState({ b: false, i: false, al: '', bg: '', fg: '', podeD: false, podeR: false });
  const [aberto, setAberto] = useState<'' | 'bg' | 'fg' | 'atalhos'>('');
  const [ultBg, setUltBg] = useState<string | null>('#FFFF00');
  const [ultFg, setUltFg] = useState<string | null>('#FF0000');
  const raiz = useRef<HTMLDivElement>(null);
  const stRef = useRef(st);

  useEffect(() => api.ouvir(() => {
    const e = api.estiloAtivo();
    const n = { b: !!e?.b, i: !!e?.i, al: e?.al ?? '', bg: e?.bg ?? '', fg: e?.fg ?? '', podeD: api.podeDesfazer(), podeR: api.podeRefazer() };
    const p = stRef.current;
    if (p.b === n.b && p.i === n.i && p.al === n.al && p.bg === n.bg && p.fg === n.fg && p.podeD === n.podeD && p.podeR === n.podeR) return;
    stRef.current = n;
    setSt(n);
  }), [api]);
  useEffect(() => {
    if (!aberto) return;
    const fora = (ev: MouseEvent) => { if (raiz.current && !raiz.current.contains(ev.target as Node)) setAberto(''); };
    // Esc que fecha o popover fica marcado (não sai também da tela cheia)
    const esc = (ev: KeyboardEvent) => { if (ev.key === 'Escape') { ev.preventDefault(); setAberto(''); api.focar(); } };
    document.addEventListener('mousedown', fora); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc); };
  }, [aberto, api]);

  const pintar = (cor: string | null) => { setUltBg(cor); setAberto(''); api.formatar({ bg: cor ?? undefined }); };
  const tingir = (cor: string | null) => { setUltFg(cor); setAberto(''); api.formatar({ fg: cor ?? undefined }); };
  const alternarPop = (q: 'bg' | 'fg' | 'atalhos') => setAberto((a) => (a === q ? '' : q));

  return (
    <div className="plx-barra" ref={raiz} role="toolbar" aria-label="Formatação">
      <button type="button" className="plx-bt" onMouseDown={semFoco} onClick={api.desfazer} disabled={!st.podeD} title="Desfazer (Ctrl+Z)" aria-label="Desfazer"><Ic d={P.desfazer} /></button>
      <button type="button" className="plx-bt" onMouseDown={semFoco} onClick={api.refazer} disabled={!st.podeR} title="Refazer (Ctrl+Y)" aria-label="Refazer"><Ic d={P.refazer} /></button>
      <span className="plx-sep" />
      <div className="plx-split">
        <button type="button" className="plx-bt" onMouseDown={semFoco} onClick={() => pintar(ultBg)} title="Cor de preenchimento" aria-label="Cor de preenchimento">
          <span className="plx-cor-ic"><Ic d={P.balde} s={13} /><span className="plx-cor-barra" style={{ background: ultBg ?? 'transparent' }} /></span>
        </button>
        <button type="button" className={`plx-bt${aberto === 'bg' ? ' on' : ''}`} onMouseDown={semFoco} onClick={() => alternarPop('bg')} title="Mais cores de preenchimento" aria-label="Escolher cor de preenchimento" aria-expanded={aberto === 'bg'}><Ic d={P.seta} s={10} /></button>
        {aberto === 'bg' && <Paleta atual={st.bg || null} aoEscolher={pintar} rotulo="Cor de preenchimento" />}
      </div>
      <div className="plx-split">
        <button type="button" className="plx-bt" onMouseDown={semFoco} onClick={() => tingir(ultFg)} title="Cor do texto" aria-label="Cor do texto">
          <span className="plx-cor-ic"><Ic d={P.letraA} s={13} /><span className="plx-cor-barra" style={{ background: ultFg ?? 'transparent' }} /></span>
        </button>
        <button type="button" className={`plx-bt${aberto === 'fg' ? ' on' : ''}`} onMouseDown={semFoco} onClick={() => alternarPop('fg')} title="Mais cores de texto" aria-label="Escolher cor do texto" aria-expanded={aberto === 'fg'}><Ic d={P.seta} s={10} /></button>
        {aberto === 'fg' && <Paleta atual={st.fg || null} aoEscolher={tingir} rotulo="Cor do texto" />}
      </div>
      <span className="plx-sep" />
      <button type="button" className={`plx-bt plx-bt-b${st.b ? ' on' : ''}`} onMouseDown={semFoco} onClick={() => api.alternar('b')} title="Negrito (Ctrl+B)" aria-label="Negrito" aria-pressed={st.b}>B</button>
      <button type="button" className={`plx-bt plx-bt-i${st.i ? ' on' : ''}`} onMouseDown={semFoco} onClick={() => api.alternar('i')} title="Itálico (Ctrl+I)" aria-label="Itálico" aria-pressed={st.i}>I</button>
      <span className="plx-sep" />
      <button type="button" className={`plx-bt${st.al === 'l' ? ' on' : ''}`} onMouseDown={semFoco} onClick={() => api.alinhar('l')} title="Alinhar à esquerda" aria-label="Alinhar à esquerda" aria-pressed={st.al === 'l'}><Ic d={P.alEsq} /></button>
      <button type="button" className={`plx-bt${st.al === 'c' ? ' on' : ''}`} onMouseDown={semFoco} onClick={() => api.alinhar('c')} title="Centralizar" aria-label="Centralizar" aria-pressed={st.al === 'c'}><Ic d={P.alCen} /></button>
      <button type="button" className={`plx-bt${st.al === 'r' ? ' on' : ''}`} onMouseDown={semFoco} onClick={() => api.alinhar('r')} title="Alinhar à direita" aria-label="Alinhar à direita" aria-pressed={st.al === 'r'}><Ic d={P.alDir} /></button>
      <span className="plx-sep" />
      <button type="button" className="plx-bt" onMouseDown={semFoco} onClick={() => api.formatar(null)} title="Limpar formatação (cores, negrito, itálico, alinhamento)" aria-label="Limpar formatação">
        <Ic d={P.borracha} />
      </button>
      {meio ? <><span className="plx-sep" />{meio}</> : <span className="plx-esp" />}
      {extra && <span className="plx-barra-extra">{extra}</span>}
      <button type="button" className={`plx-bt${congelado ? ' on' : ''}`} onMouseDown={semFoco} onClick={aoCongelar} aria-pressed={congelado}
        aria-label={congelado ? 'Soltar as colunas A–C' : 'Congelar as colunas A–C'}
        title={congelado ? 'Colunas A–C congeladas ao rolar para o lado. Clique para soltar' : 'Congelar as colunas A–C ao rolar para o lado'}>
        <Ic d={P.pino} />
      </button>
      <div className="plx-split">
        <button type="button" className={`plx-bt${aberto === 'atalhos' ? ' on' : ''}`} onMouseDown={semFoco} onClick={() => alternarPop('atalhos')} title="Atalhos de teclado" aria-label="Atalhos de teclado" aria-expanded={aberto === 'atalhos'}>
          <Ic d={P.teclado} />
        </button>
        {aberto === 'atalhos' && <PainelAtalhos temBusca={temBusca} aoFechar={() => { setAberto(''); api.focar(); }} />}
      </div>
    </div>
  );
}

/* ================= rodapé (status) ================= */

const fmtNum = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

function Rodape({ api, ctl, totais, extra }: { api: ApiGrade; ctl: MutableRefObject<CtlRodape | null>; totais: { linhas: number; clientes: number }; extra?: ReactNode }) {
  const [st, setSt] = useState<{ txt: string; trava: boolean }>({ txt: '', trava: false });
  const [av, setAv] = useState<{ msg: string; tom: 'info' | 'erro'; id: number } | null>(null);
  const raf = useRef(0);
  const stRef = useRef(st);

  useEffect(() => {
    ctl.current = { aviso: (msg, tom = 'info') => setAv({ msg, tom, id: Date.now() }) };
    return () => { ctl.current = null; };
  }, [ctl]);
  useEffect(() => {
    if (!av) return;
    const t = setTimeout(() => setAv(null), av.tom === 'erro' ? 7000 : 3800);
    return () => clearTimeout(t);
  }, [av]);
  useEffect(() => {
    const calc = () => {
      raf.current = 0;
      const f = api.faixa(); const L = api.lay();
      let txt = ''; let trava = false;
      if (f) {
        const celulas = (f.r1 - f.r0 + 1) * (f.c1 - f.c0 + 1);
        if (celulas > 1) {
          let soma = 0, nNum = 0, cont = 0;
          for (let r = f.r0; r <= f.r1; r++) {
            const l = L.vis[r];
            for (let c = f.c0; c <= f.c1; c++) {
              const col = L.cols[c];
              if (ehSenha(l, col)) continue;   // senha nunca entra na conta
              const t = api.texto(l, col);
              if (!t) continue;
              cont++;
              const v = valorBR(t);
              if (v != null) { soma += v; nNum++; }
            }
          }
          txt = nNum ? `Soma: ${fmtNum(soma)} · Média: ${fmtNum(soma / nNum)} · Contagem: ${cont}` : `Contagem: ${cont}`;
        } else {
          const a = api.ativo();
          if (a) {
            const tipo = a.c.tipo === 'mes'
              ? `mês ${(a.c.mesPos ?? 0) + 1}: número = pago, NÃO PAGOU = em aberto`
              : a.c.tipo === 'livre' ? 'coluna livre (só na planilha)' : ehSenhaCol(a.c) ? 'senha protegida' : 'ligada ao cadastro do cliente';
            txt = `${a.c.titulo || `Coluna ${a.c.letra}`} — ${a.estado ?? tipo}`;
            trava = !a.editavel;
          }
        }
      }
      if (stRef.current.txt === txt && stRef.current.trava === trava) return;
      stRef.current = { txt, trava };
      setSt(stRef.current);
    };
    const off = api.ouvir(() => { if (!raf.current) raf.current = requestAnimationFrame(calc); });
    calc();
    return () => { off(); if (raf.current) cancelAnimationFrame(raf.current); };
  }, [api]);

  return (
    <>
      <div className="plx-rodape" role="status" aria-live="polite">
        <span className="plx-rod-esq">{st.txt}{st.trava && <span className="plx-trava-tag"> · somente leitura</span>}</span>
        {extra && <span className="plx-rod-extra">{extra}</span>}
        <span className="plx-rod-num"><b>{totais.linhas.toLocaleString('pt-BR')}</b> linhas · <b>{totais.clientes.toLocaleString('pt-BR')}</b> clientes</span>
      </div>
      {av && <div key={av.id} className={`plx-aviso${av.tom === 'erro' ? ' erro' : ''}`} role="alert">{av.msg}</div>}
    </>
  );
}

/* ================= menu flutuante (portal .v2) ================= */

function MenuFlutuante({ ctl, aoFechar }: { ctl: MutableRefObject<CtlMenu | null>; aoFechar: () => void }) {
  const [m, setM] = useState<{ x: number; y: number; itens: ItemMenu[]; titulo?: string } | null>(null);
  const [raiz, setRaiz] = useState<HTMLDivElement | null>(null);
  const caixa = useRef<HTMLDivElement>(null);
  const aoFecharRef = useRef(aoFechar);
  aoFecharRef.current = aoFechar;
  const aberto = m != null;

  useEffect(() => {
    ctl.current = { abrir: (x, y, itens, titulo) => setM({ x, y, itens, titulo }), fechar: () => setM(null) };
    return () => { ctl.current = null; };
  }, [ctl]);
  useEffect(() => {
    if (!aberto) return;
    const el = criarRaizPortalV2(document) as HTMLDivElement;
    setRaiz(el);
    return () => { el.remove(); setRaiz(null); };
  }, [aberto]);
  useLayoutEffect(() => {
    const el = caixa.current;
    if (!m || !el) return;
    const r = el.getBoundingClientRect();
    let x = m.x, y = m.y;
    if (x + r.width > window.innerWidth - 8) x = Math.max(8, window.innerWidth - r.width - 8);
    if (y + r.height > window.innerHeight - 8) y = Math.max(8, y - r.height);
    el.style.left = `${x}px`; el.style.top = `${y}px`; el.style.visibility = 'visible';
    el.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }, [m, raiz]);
  useEffect(() => {
    if (!aberto) return;
    const fora = (ev: MouseEvent) => { if (caixa.current && !caixa.current.contains(ev.target as Node)) setM(null); };
    // fechou sem clique (rolagem, redimensionar, trocar de janela): o foco volta para a grade
    const fechar = () => { setM(null); aoFecharRef.current(); };
    document.addEventListener('mousedown', fora, true);
    window.addEventListener('blur', fechar); window.addEventListener('resize', fechar);
    document.addEventListener('scroll', fechar, true);
    return () => {
      document.removeEventListener('mousedown', fora, true);
      window.removeEventListener('blur', fechar); window.removeEventListener('resize', fechar);
      document.removeEventListener('scroll', fechar, true);
    };
  }, [aberto]);

  if (!m || !raiz) return null;
  const teclar = (e: RKeyboardEvent<HTMLDivElement>) => {
    const bts = Array.from(caixa.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
    const i = bts.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); bts[(i + 1) % bts.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); bts[(i - 1 + bts.length) % bts.length]?.focus(); }
    else if (e.key === 'Home') { e.preventDefault(); bts[0]?.focus(); }
    else if (e.key === 'End') { e.preventDefault(); bts[bts.length - 1]?.focus(); }
    else if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); setM(null); aoFechar(); }
  };
  return createPortal(
    <div ref={caixa} className="plx-menu" role="menu" style={{ left: m.x, top: m.y, visibility: 'hidden' }} onKeyDown={teclar} onContextMenu={(e) => e.preventDefault()}>
      {m.titulo && <div className="plx-menu-tit">{m.titulo}</div>}
      {m.itens.map((it, i) => (it.sep
        ? <div key={`s${i}`} className="plx-msep" role="separator" />
        : (
          <button key={`i${i}`} type="button" role="menuitem" className={`plx-mi${it.perigo ? ' perigo' : ''}`} disabled={it.desab}
            onClick={() => { setM(null); aoFechar(); it.acao?.(); }}>
            <span>{it.rotulo}</span>{it.atalho && <kbd>{it.atalho}</kbd>}
          </button>
        )))}
    </div>,
    raiz,
  );
}

/* ================= diálogos (confirmar / renomear) ================= */

function Dialogos({ ctl, aoFechar }: { ctl: MutableRefObject<CtlDlg | null>; aoFechar: () => void }) {
  const [conf, setConf] = useState<Parameters<CtlDlg['confirmar']>[0] | null>(null);
  const [ren, setRen] = useState<Parameters<CtlDlg['renomear']>[0] | null>(null);
  const [valor, setValor] = useState('');

  useEffect(() => {
    ctl.current = { confirmar: (o) => setConf(o), renomear: (o) => { setRen(o); setValor(o.valor); } };
    return () => { ctl.current = null; };
  }, [ctl]);

  const fechar = () => { setConf(null); setRen(null); aoFechar(); };
  const okRen = () => { const f = ren?.aoOk; const v = valor.trim(); fechar(); if (f && v !== ren?.valor) f(v); };
  return (
    <>
      <ConfirmDialogV2 aberto={!!conf} titulo={conf?.titulo ?? ''} mensagem={conf?.msg ?? ''} rotuloConfirmar={conf?.rotulo ?? 'Confirmar'}
        destrutivo={conf?.destrutivo} aoCancelar={() => { const f = conf?.aoCancelar; fechar(); f?.(); }}
        aoConfirmar={() => { const f = conf?.aoOk; fechar(); f?.(); }} />
      <ModalV2 aberto={!!ren} aoFechar={fechar} titulo={ren?.titulo} largura={400}
        rodape={<><BotaoSec onClick={fechar}>Cancelar</BotaoSec><BotaoPrimario onClick={okRen}>Salvar</BotaoPrimario></>}>
        <Input value={valor} maxLength={80} aria-label="Nome da coluna" onChange={(e) => setValor(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); okRen(); } }} />
        <p className="plx-dica">Nome interno da coluna, usado nos menus. O título que aparece na planilha é a linha de cabeçalho de cada bloco.</p>
      </ModalV2>
    </>
  );
}

export default PlanilhaExcel;
