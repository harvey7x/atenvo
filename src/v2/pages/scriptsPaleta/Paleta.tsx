import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type RefObject } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { useOrg } from '@/context/OrgContext';
import { SCRIPTS_REAL, fetchEtapas, type Script, type ScriptCategoria, type VarCtx } from '@/data/scripts';
import type { WaMessage } from '@/data/whatsappDemo';
import type { ResumoEtapas } from '../../hooks/scriptsResumo';
import { BotaoSec } from '../../components';
import { resumirUltimaDoCliente } from './conversa';
import { RESUMO_DEMO } from './demoEtapas';
import { chaveEtapas, rotuloComposicaoNaOrdem, rotuloMensagens, rotuloMsgs, ROTULO_TIPO } from './etapas';
import { IcAlerta, IcBusca, IcCelular, IcChevron, IcEstrela, IcLimpar, IcMais, IcPasta, IcPessoa, IcRelogio, IcTipo, IcVoltar } from './icones';
import { criarIntencaoMouse } from './intencao';
import { filtroVizinho, indexar, montarPaleta, type FiltroPaleta, type Grupo, type Opcao } from './organizar';
import { Marcas, Previa, TextoRico } from './Previa';
import { chaveRecentes, useRecentes } from './recentes';
import { bordasRolagem } from './rolagem';
import { destacar, recorte, termosDaBusca } from './texto';
import { faltasDoTexto, linhaDeApoio } from './variaveis';
import './paleta.css';

/* ==================================================================
   PALETA DE SCRIPTS do inbox (20/10) — busca + pílulas de categoria +
   lista agrupada + PRÉVIA da sequência já preenchida para o cliente.
   Posição: logo ACIMA do compositor (respiro de 12px), alinhada às
   bordas internas dele (a linha "Responder por" e a caixa de texto
   continuam à vista); cresce até ~720px de altura, com o topo no máximo
   logo abaixo do cabeçalho da conversa (nome, Transferir, Arquivar
   seguem à vista) e nunca na barra global; janela baixa (notebook
   1366×768 / 1280×720) encolhe a altura e liga o modo compacto;
   viewport-aware (abre pra baixo se não couber; nunca sai da tela);
   < 820px vira coluna única sem prévia, com a linha "Para <cliente> ·
   <chip>" e o aviso âmbar no item que tem campo a preencher.
   Não-modal (aria-modal=false): o painel não bloqueia o resto da tela.
   REGRA: selecionar NUNCA envia — onSelecionar abre o compositor
   completo (ScriptSequenceModal), o mesmo caminho de sempre.
   Teclado (foco na busca): ↑↓ navega · Home/End 1º/último (busca
   vazia) · PageUp/PageDown pula 6 · Shift+↑↓ rola a prévia · ←→ troca
   de pílula (busca vazia) · Enter usa · Esc limpa a busca e, vazia,
   fecha e devolve o foco à ORIGEM da abertura (o "/" da caixa de
   mensagem → a caixa; o botão Scripts → o botão). Foco preso no painel.
   ================================================================== */

export interface PaletaScriptsProps {
  anchor: DOMRect;
  /** botão Scripts — reposicionamento no resize (e o foco do Esc, sem `origemRef`) */
  botaoRef?: RefObject<HTMLElement>;
  /** de onde a paleta foi aberta (a caixa de mensagem pelo "/", ou o botão) — o Esc devolve o foco a ele */
  origemRef?: RefObject<HTMLElement>;
  scripts: Script[];
  categorias: ScriptCategoria[];
  /** resumo de etapas da org (useScriptsResumoEtapas); no demo vem das etapas de amostra */
  resumo?: Record<string, ResumoEtapas | undefined>;
  /** o MESMO ctx de variáveis passado ao ScriptSequenceModal */
  ctx: VarCtx;
  /** número/chip selecionado em "Responder por" (rodapé da prévia: "por Chip 1") */
  canal?: string | null;
  /** mensagens da conversa aberta — a prévia mostra a última do cliente */
  mensagens?: WaMessage[];
  onSelecionar: (s: Script) => void;
  onGerenciar: () => void;
  onClose: () => void;
}

const LARG = 760, LARG_MIN = 700, LARG_MAX = 800, ALT = 720, LARG_ESTREITA = 520, ALT_ESTREITA = 520, MARGEM = 8, CORTE_ESTREITO = 820;
/** respiro entre o painel e o topo do compositor */
const RESPIRO = 12;
/** altura mínima antes de aceitar cobrir o cabeçalho da conversa · abaixo disto liga o modo compacto */
const ALT_MIN = 420, ALT_COMPACTA = 580;
/** janela abaixo da qual o CTA vira só "Usar" (o nome do cliente ganha o espaço) */
const JANELA_CURTA = 1200;
/** painel a partir do qual o rodapé tem lugar para as 5 dicas (com "Shift ↑↓ rolar prévia") */
const LARG_5_DICAS = 740;
const idOpcao = (chave: string) => 'spl-op-' + chave.replace(/[^\w-]/g, '_');
const idTab = (f: string) => 'spl-tab-' + f.replace(/[^\w-]/g, '_');
const SEM_RESUMO: Record<string, ResumoEtapas | undefined> = {};
const ROLAR_PREVIA = 120;

interface Layout { estilo: CSSProperties; estreito: boolean; compacto: boolean; curto: boolean; largo: boolean }

function posicionar(r: DOMRect, ancora: HTMLElement | null | undefined): Layout {
  const vw = window.innerWidth, vh = window.innerHeight;
  const estreito = vw < CORTE_ESTREITO;
  // caixa interna do compositor (bordas do "Responder por" e da caixa de texto)
  const comp = ancora?.closest<HTMLElement>('.wa-composer');
  let caixa: { l: number; r: number; topo: number } | null = null;
  if (comp) {
    const b = comp.getBoundingClientRect();
    const cs = window.getComputedStyle(comp);
    caixa = { l: b.left + (parseFloat(cs.paddingLeft) || 0), r: b.right - (parseFloat(cs.paddingRight) || 0), topo: b.top };
  }
  const colW = caixa ? caixa.r - caixa.l : 0;
  const larg = Math.round(Math.min(
    estreito ? LARG_ESTREITA : caixa ? Math.min(LARG_MAX, Math.max(LARG_MIN, colW)) : LARG,
    vw - 2 * MARGEM,
  ));
  // cabe exatamente na coluna: rente às bordas internas do compositor; senão centra nela (ou no botão)
  const desejado = caixa
    ? (colW >= larg && colW <= LARG_MAX ? caixa.l : (caixa.l + caixa.r) / 2 - larg / 2)
    : r.left;
  const left = Math.round(Math.max(MARGEM, Math.min(desejado, vw - larg - MARGEM)));
  // pra cima: nasce do TOPO do compositor (não cobre "Responder por" nem a caixa de texto)
  const topoRef = caixa ? caixa.topo : r.top;
  const folga = caixa ? RESPIRO : 6;
  // teto: o fim do cabeçalho da conversa (nome · Transferir · Arquivar); em último caso a
  // barra global (busca de contatos) — o painel nunca sobe por cima dela
  const barra = document.querySelector<HTMLElement>('.p-topbar')?.getBoundingClientRect();
  const tetoBarra = Math.max(MARGEM, (barra ? barra.bottom : 0) + MARGEM);
  // o cabeçalho termina no FUNDO da faixa de estado da IA ("IA atendendo", .wa-iabar) quando
  // ela existe: o painel nasce 8px abaixo dela (sem canto encostando no ícone do robô)
  const conv = ancora?.closest('.wa-conv');
  const fundoCab = Math.max(
    0,
    ...[...(conv?.querySelectorAll<HTMLElement>('.wa-ctopo, .wa-iabar') ?? [])]
      .map((el) => el.getBoundingClientRect())
      .filter((b) => b.height > 0)
      .map((b) => b.bottom),
  );
  const tetoCab = Math.max(tetoBarra, fundoCab ? fundoCab + MARGEM : tetoBarra);
  const abaixo = vh - r.bottom - MARGEM - 6;
  const acimaCab = topoRef - folga - tetoCab;
  const acima = topoRef - folga - tetoBarra;
  const maxAlt = estreito ? ALT_ESTREITA : ALT;
  const flip = abaixo < maxAlt && acima > abaixo;
  let alt: number;
  if (flip) {
    alt = Math.min(maxAlt, acimaCab);
    // janela baixa demais: aceita cobrir o cabeçalho da conversa, nunca a barra global
    if (alt < ALT_MIN) alt = Math.min(maxAlt, Math.max(alt, Math.min(ALT_MIN, acima)));
  } else alt = Math.min(maxAlt, abaixo);
  alt = Math.round(Math.max(Math.min(200, vh - 2 * MARGEM), alt));
  const estilo: CSSProperties = flip
    ? { left, bottom: Math.max(MARGEM, vh - topoRef + folga), width: larg, height: alt }
    : { left, top: Math.min(r.bottom + 6, vh - alt - MARGEM), width: larg, height: alt };
  return { estilo, estreito, compacto: alt < ALT_COMPACTA, curto: vw < JANELA_CURTA, largo: larg >= LARG_5_DICAS };
}

/* Uma linha da lista — MEMO: hover/teclado trocam o realce e só as 2 linhas envolvidas
   re-renderizam (o destaque da busca e a linha de apoio com variáveis preenchidas não são
   recalculados para os 200 scripts a cada movimento do mouse, rolagem ou dado novo da conversa).
   Grade 2×2: título | composição (ícones 13px centrados na linha do título) / apoio | "N msgs".
   A linha de apoio nunca mostra {{token}}: variável sem valor vira o nome humano em âmbar. */
const ItemScript = memo(function ItemScript({ c, ativo, noFav, termos, ctx, avisar, onUsar }: {
  c: Opcao; ativo: boolean; noFav: boolean; termos: string[]; ctx: VarCtx;
  /** modo estreito (sem prévia): aviso âmbar no item quando falta preencher algum campo */
  avisar: boolean;
  onUsar: (s: Script) => void;
}) {
  const it = c.it;
  // ordem da SEQUÊNCIA (1ª aparição) — a mesma do cabeçalho da prévia
  const tipos = it.tipos;
  const linha = (() => {
    if (c.onde === 'texto' && c.textoIdx !== undefined) {
      const bruto = it.brutos[c.textoIdx] ?? '';
      return <><span className="spl-sub-onde">Mensagem {it.nums[c.textoIdx] ?? c.textoIdx + 1}</span><TextoRico semNegrito trechos={linhaDeApoio(bruto, ctx, termos, 12, 18)} /></>;
    }
    const tag = c.onde === 'tag' && c.tag
      ? <span className="spl-sub-tag">#<Marcas pedacos={destacar(c.tag.replace(/^#+/, ''), termos)} /></span>
      : null;
    // com busca, a linha recorta em volta do trecho que casou (não some atrás das reticências:
    // a linha tem ~38 caracteres visíveis, então o trecho depois do 24º já puxa o recorte)
    // descrição com {{token}} (raro) passa pelo mesmo resolvedor: a sintaxe nunca aparece
    if (it.descricao && it.descricao.includes('{{')) return <>{tag}<TextoRico semNegrito trechos={linhaDeApoio(it.descricao, ctx, termos, 14, 24)} /></>;
    if (it.descricao) {
      return <>{tag}<Marcas pedacos={termos.length ? recorte(it.descricao, termos, 14, 24) : destacar(it.descricao, termos)} /></>;
    }
    const tr = it.brutos[0] ? linhaDeApoio(it.brutos[0], ctx, termos, 14, 24) : [];
    return <>{tag}{tr.length ? <TextoRico semNegrito trechos={tr} /> : <span className="spl-sub-vazio">Só mídia</span>}</>;
  })();
  const faltas = useMemo(() => {
    if (!avisar) return [];
    const out: string[] = [];
    for (const b of it.brutos) for (const f of faltasDoTexto(b, ctx)) if (!out.includes(f)) out.push(f);
    return out;
  }, [avisar, it.brutos, ctx]);
  const msgFalta = faltas.length ? `Falta: ${faltas.join(', ')} — ajuste no compositor` : '';
  return (
    <div
      id={idOpcao(c.chave)} data-chave={c.chave} role="option" aria-selected={ativo}
      aria-description={msgFalta || undefined}
      className={'spl-it' + (ativo ? ' spl-hi' : '')}
      onClick={() => onUsar(it.s)}
    >
      <div className="spl-it-tit">
        <span className="spl-it-nome"><Marcas pedacos={destacar(it.titulo, termos)} /></span>
        {/* no grupo Favoritos a estrela já está no cabeçalho */}
        {it.s.favorito && !noFav && <span className="spl-estrela" aria-label="Favorito" title="Favorito"><IcEstrela /></span>}
        {msgFalta && <span className="spl-it-falta" title={msgFalta} aria-hidden><IcAlerta /></span>}
      </div>
      <span className="spl-comp" aria-label={tipos.map((t) => ROTULO_TIPO[t]).join(', ')}>
        {tipos.map((t) => <span key={t} className="spl-comp-ic" title={ROTULO_TIPO[t]}><IcTipo tipo={t} /></span>)}
      </span>
      <div className="spl-it-sub">{linha}</div>
      <span className="spl-it-n" title={rotuloMensagens(it.total)}>{rotuloMsgs(it.total)}</span>
    </div>
  );
});

export function PaletaScripts({ anchor, botaoRef, origemRef, scripts, categorias, resumo, ctx, canal, mensagens, onSelecionar, onGerenciar, onClose }: PaletaScriptsProps) {
  const { user } = useAuth();
  const { currentOrg } = useOrg();
  const painelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listaRef = useRef<HTMLDivElement>(null);
  const pilulasRef = useRef<HTMLDivElement>(null);

  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<FiltroPaleta>('todos');
  const [hiChave, setHiChave] = useState<string | null>(null);
  const [recentes, registrarRecente] = useRecentes(chaveRecentes(currentOrg?.id, user?.id));

  const termos = useMemo(() => termosDaBusca(busca), [busca]);
  const resumoEf = SCRIPTS_REAL ? (resumo ?? SEM_RESUMO) : RESUMO_DEMO;
  const indice = useMemo(() => indexar(scripts, categorias, resumoEf), [scripts, categorias, resumoEf]);
  const paleta = useMemo(() => montarPaleta({ indice, categorias, recentes, filtro, termos }), [indice, categorias, recentes, filtro, termos]);
  const { flat, grupos, pilulas } = paleta;
  const nomeCategoria = useMemo(() => new Map(paleta.pilulas.filter((p) => p.filtro.startsWith('cat:')).map((p) => [p.filtro.slice(4), p.rotulo])), [paleta.pilulas]);
  const ultima = useMemo(() => resumirUltimaDoCliente(mensagens), [mensagens]);

  // realce pela CHAVE da opção (grupo|id — sobrevive a dados chegando); fora da lista → primeiro
  const hiIdx = Math.max(0, flat.findIndex((o) => o.chave === hiChave));
  const hi: Opcao | undefined = flat[hiIdx];

  /* prévia sem espera: pré-busca as etapas dos vizinhos ±1 do realçado (modo real; mesmo
     debounce da prévia — setas rápidas não disparam uma consulta por item) */
  const qc = useQueryClient();
  const orgId = currentOrg?.id ?? null;
  const vizinhos = [flat[hiIdx - 1]?.it.s, flat[hiIdx + 1]?.it.s].filter((x): x is Script => !!x);
  const chaveVizinhos = vizinhos.map((v) => v.id + ':' + (v.atualizadoEm ?? '')).join('|');
  const vizinhosRef = useRef(vizinhos);
  vizinhosRef.current = vizinhos;
  useEffect(() => {
    if (!SCRIPTS_REAL || !orgId || !chaveVizinhos) return;
    const t = window.setTimeout(() => {
      for (const v of vizinhosRef.current) {
        void qc.prefetchQuery({ queryKey: chaveEtapas(orgId, v), queryFn: () => fetchEtapas(v.id), staleTime: 5 * 60_000, gcTime: 30 * 60_000 });
      }
    }, 120);
    return () => window.clearTimeout(t);
  }, [qc, orgId, chaveVizinhos]);

  /* ---------- posição viewport-aware (recalcula no resize em vez de fechar) ---------- */
  const [layout, setLayout] = useState<Layout>({ estilo: { left: -9999, top: -9999, visibility: 'hidden' }, estreito: false, compacto: false, curto: false, largo: true });
  useLayoutEffect(() => {
    const calc = () => setLayout(posicionar(botaoRef?.current?.getBoundingClientRect() ?? anchor, botaoRef?.current));
    calc();
    window.addEventListener('resize', calc);
    return () => window.removeEventListener('resize', calc);
  }, [anchor, botaoRef]);
  const { estreito, compacto, curto, largo } = layout;
  // "Shift ↑↓ rolar prévia" aparece sempre que a prévia TRANSBORDA (teclado e mouse)
  const [previaRola, setPreviaRola] = useState(false);

  /* ---------- fechar / foco ---------- */
  // Esc devolve o foco à ORIGEM da abertura; origem que sumiu ou ficou travada cai no botão
  const fechar = useCallback((devolverFoco: boolean) => {
    onClose();
    if (!devolverFoco) return;
    window.setTimeout(() => {
      const o = origemRef?.current as (HTMLElement & { disabled?: boolean }) | null | undefined;
      const alvo = o && o.isConnected && !o.disabled ? o : botaoRef?.current;
      alvo?.focus({ preventScroll: true });
    }, 0);
  }, [onClose, botaoRef, origemRef]);

  // foco só depois do 1º posicionamento: com visibility:hidden o focus() é ignorado em silêncio
  const posicionado = layout.estilo.visibility !== 'hidden';
  useEffect(() => { if (posicionado) inputRef.current?.focus({ preventScroll: true }); }, [posicionado]);
  const buscaRef = useRef(busca);
  buscaRef.current = busca;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation(); e.preventDefault();
      // 1º Esc com texto só limpa a busca (quem errou a palavra não perde o painel); vazio fecha
      if (buscaRef.current) { setBusca(''); inputRef.current?.focus(); return; }
      fechar(true);
    };
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (painelRef.current?.contains(t) || t.closest?.('.wa-scr-btn')) return;
      // trocar o número em "Responder por" não fecha a paleta (o rodapé da prévia acompanha)
      // e o foco fica na busca
      if (t.closest?.('.wa-linha-resp')) {
        e.preventDefault();
        window.setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 0);
        return;
      }
      fechar(false);
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('mousedown', onDown);
    };
  }, [fechar]);

  /* ---------- usar (abre o compositor; nunca envia) ---------- */
  // onSelecionar chega novo a cada render do inbox: por ref, `usar` fica estável e as
  // linhas memo da lista não re-renderizam a cada mensagem que chega na conversa
  const onSelecionarRef = useRef(onSelecionar);
  onSelecionarRef.current = onSelecionar;
  const idsValidos = useMemo(() => new Set(scripts.map((s) => s.id)), [scripts]);
  const usar = useCallback((s: Script | undefined) => {
    if (!s) return;
    registrarRecente(s.id, idsValidos);
    onSelecionarRef.current(s);
  }, [registrarRecente, idsValidos]);

  /* ---------- realce: teclado rola a lista; mouse não ---------- */
  const porTeclado = useRef(false);
  const moverPara = (idx: number) => {
    const alvo = flat[Math.max(0, Math.min(flat.length - 1, idx))];
    if (!alvo) return;
    porTeclado.current = true;
    setHiChave(alvo.chave);
  };
  useEffect(() => {
    if (!porTeclado.current) return;
    porTeclado.current = false;
    if (!hi) return;
    document.getElementById(idOpcao(hi.chave))?.scrollIntoView({ block: 'nearest' });
  }, [hi]);

  // nova busca/filtro: volta ao topo e ao primeiro (melhor) resultado
  useEffect(() => {
    setHiChave(null);
    listaRef.current?.scrollTo({ top: 0 });
  }, [busca, filtro]);
  // pílula ativa sempre à vista na fileira rolável (com folga para não ficar sob a seta/degradê);
  // rola SÓ a fileira — scrollIntoView poderia arrastar outros ancestrais
  useEffect(() => {
    const el = pilulasRef.current;
    const on = el?.querySelector<HTMLElement>('.spl-pill.spl-on');
    if (!el || !on) return;
    const FOLGA = 28;
    const a = on.offsetLeft - FOLGA, b = on.offsetLeft + on.offsetWidth + FOLGA;
    if (a < el.scrollLeft) el.scrollLeft = Math.max(0, a);
    else if (b > el.scrollLeft + el.clientWidth) el.scrollLeft = b - el.clientWidth;
  }, [paleta.filtro]);
  // fileira cortada (janela estreita / muitas categorias): esmaece a borda do lado que tem mais
  const [corte, setCorte] = useState<{ esq: boolean; dir: boolean }>({ esq: false, dir: false });
  const medirCorte = useCallback(() => {
    const el = pilulasRef.current;
    if (!el) return;
    const esq = el.scrollLeft > 2, dir = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
    setCorte((c) => (c.esq === esq && c.dir === dir ? c : { esq, dir }));
  }, []);
  useLayoutEffect(() => { medirCorte(); }, [medirCorte, layout, pilulas.length]);
  // mouse comum (equipe no Windows): a roda vertical rola a fileira de lado; setas nas pontas cortadas
  useEffect(() => {
    const el = pilulasRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth + 1 || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY * (e.deltaMode === 1 ? 16 : 1);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);
  const rolarPilulas = (dir: 1 | -1) => {
    const el = pilulasRef.current;
    if (!el) return;
    // instantâneo (como as setas do inbox): o smooth é cortado quando a outra seta monta no meio
    el.scrollBy({ left: dir * Math.max(120, el.clientWidth * 0.7), behavior: 'auto' });
  };
  // lista com mais conteúdo: degradê na borda (o macOS esconde a barra de rolagem)
  // e o cabeçalho de grupo que está FIXO no topo ganha o degradê de baixo (título não sai fatiado)
  const [rolagem, setRolagem] = useState<{ cima: boolean; baixo: boolean; fixo: string | null }>({ cima: false, baixo: false, fixo: null });
  const medirLista = useCallback(() => {
    const el = listaRef.current;
    if (!el) return;
    const st = el.scrollTop;
    const { cima, baixo } = bordasRolagem(el, 16, 24, 4);
    let fixo: string | null = null;
    if (st > 4) {
      el.querySelectorAll<HTMLElement>('.spl-grupo').forEach((g) => {
        if (g.offsetTop + 4 < st && g.offsetTop + g.offsetHeight - 32 > st) fixo = g.dataset.g ?? null;
      });
    }
    setRolagem((c) => (c.cima === cima && c.baixo === baixo && c.fixo === fixo ? c : { cima, baixo, fixo }));
  }, []);
  useLayoutEffect(() => { medirLista(); }, [medirLista, layout, flat.length]);

  /* Intenção do mouse (intencao.ts): atravessar a lista na diagonal rumo à prévia não
     rouba a prévia; um único ouvinte na lista, zonas mortas limpam o timer, e o timer
     só aplica se o ponteiro ainda estiver sobre o mesmo item. Hover e teclado = um realce. */
  const hiChaveAtual = useRef<string | null>(null);
  hiChaveAtual.current = hi?.chave ?? null;
  const intencao = useMemo(() => criarIntencaoMouse({
    aplicar: (k) => setHiChave(k),
    aindaSobre: (k, p) => (document.elementFromPoint(p.x, p.y)?.closest<HTMLElement>('.spl-it')?.dataset.chave ?? null) === k,
  }), []);
  useEffect(() => () => intencao.limpar(), [intencao]);
  const aoMoverLista = (e: ReactMouseEvent<HTMLDivElement>) => {
    const item = (e.target as Element).closest<HTMLElement>('.spl-it');
    intencao.mover({ x: e.clientX, y: e.clientY }, item?.dataset.chave ?? null, hiChaveAtual.current, estreito);
  };

  /* ---------- teclado ---------- */
  const trocarFiltro = (f: FiltroPaleta) => { setFiltro(f); };
  const rolarPrevia = (dy: number) => {
    painelRef.current?.querySelector<HTMLElement>('.spl-pv-corpo')?.scrollBy({ top: dy });
  };
  const onInputKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    const k = e.key;
    if ((k === 'ArrowDown' || k === 'ArrowUp') && e.shiftKey) { e.preventDefault(); rolarPrevia(k === 'ArrowDown' ? ROLAR_PREVIA : -ROLAR_PREVIA); }
    else if (k === 'ArrowDown') { e.preventDefault(); moverPara(hiIdx + 1); }
    else if (k === 'ArrowUp') { e.preventDefault(); moverPara(hiIdx - 1); }
    else if (k === 'PageDown') { e.preventDefault(); moverPara(hiIdx + 6); }
    else if (k === 'PageUp') { e.preventDefault(); moverPara(hiIdx - 6); }
    // Home/End vão ao 1º/último script com a busca vazia (com texto, movem o cursor do campo)
    else if ((k === 'Home' || k === 'End') && (busca === '' || e.ctrlKey || e.metaKey)) { e.preventDefault(); moverPara(k === 'Home' ? 0 : flat.length - 1); }
    else if (k === 'Enter') { e.preventDefault(); if (!e.nativeEvent.isComposing) usar(hi?.it.s); }
    else if ((k === 'ArrowRight' || k === 'ArrowLeft') && busca === '') {
      e.preventDefault();
      trocarFiltro(filtroVizinho(pilulas, paleta.filtro, k === 'ArrowRight' ? 1 : -1));
    }
  };
  const onPilulasKey = (e: ReactKeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const f = filtroVizinho(pilulas, paleta.filtro, e.key === 'ArrowRight' ? 1 : -1);
    trocarFiltro(f);
    window.setTimeout(() => pilulasRef.current?.querySelector<HTMLElement>('.spl-pill.spl-on')?.focus(), 0);
  };
  // foco preso no painel (Tab/Shift+Tab circulam só por aqui)
  const onPainelKey = (e: ReactKeyboardEvent) => {
    if (e.key !== 'Tab' || !painelRef.current) return;
    const foc = [...painelRef.current.querySelectorAll<HTMLElement>('input, button:not([disabled]), [tabindex="0"]')]
      .filter((el) => el.tabIndex >= 0 && el.offsetParent !== null);
    if (!foc.length) return;
    const i = foc.indexOf(document.activeElement as HTMLElement);
    const prox = e.shiftKey ? (i <= 0 ? foc.length - 1 : i - 1) : (i === foc.length - 1 ? 0 : i + 1);
    e.preventDefault();
    foc[prox].focus();
  };

  const limparBusca = () => { setBusca(''); inputRef.current?.focus(); };
  // clique numa área não focável do painel (prévia, cabeçalho de grupo, barra de rolagem)
  // jogaria o foco no <body>: setas/Enter parariam e o Tab escaparia do painel. Devolve à
  // busca — exceto quando o atendente selecionou texto (para copiar da prévia).
  const aoSoltarMouse = () => {
    const painel = painelRef.current;
    if (!painel) return;
    const a = document.activeElement;
    if (a && a !== document.body && painel.contains(a)) return;
    let sel = '';
    try { sel = window.getSelection()?.toString() ?? ''; } catch { /* sem seleção */ }
    if (sel) return;
    inputRef.current?.focus({ preventScroll: true });
  };

  /* ---------- estados vazios ---------- */
  const ativa = pilulas.find((p) => p.filtro === paleta.filtro);
  const vazio = (() => {
    if (flat.length > 0) return null;
    if (scripts.length === 0) return {
      ic: <IcMais />, t: 'Nenhum script para WhatsApp', s: 'Crie na página de Scripts — eles aparecem aqui na hora.',
      acoes: [{ r: 'Criar script', f: onGerenciar }],
    };
    if (termos.length > 0) {
      const onde = paleta.filtro === 'todos' ? '' : ` em ${ativa?.rotulo ?? ''}`;
      const acoes = [{ r: 'Limpar busca', f: limparBusca }];
      if (paleta.filtro !== 'todos' && paleta.nTodos > 0) acoes.unshift({ r: `Ver ${paleta.nTodos} em Todos`, f: () => trocarFiltro('todos') });
      return { ic: <IcBusca />, t: <>Nenhum script{onde} com “{busca.trim()}”</>, s: 'A busca olha o título, a descrição, as tags e o texto das mensagens.', acoes };
    }
    if (paleta.filtro === 'favoritos') return { ic: <IcEstrela />, t: 'Nenhum favorito ainda', s: 'Marque scripts com estrela na página de Scripts para tê-los sempre no topo.', acoes: [{ r: 'Ver todos', f: () => trocarFiltro('todos') }] };
    if (paleta.filtro === 'recentes') return { ic: <IcRelogio />, t: 'Nenhum script usado ainda', s: 'Os 6 últimos scripts que você usar ficam aqui, do mais recente para o mais antigo.', acoes: [{ r: 'Ver todos', f: () => trocarFiltro('todos') }] };
    return { ic: <IcPasta />, t: 'Nenhum script nesta categoria', s: 'Organize as categorias na página de Scripts.', acoes: [{ r: 'Ver todos', f: () => trocarFiltro('todos') }] };
  })();

  // contador à direita da busca: sem filtro "12 scripts"; com QUALQUER filtro (pílula ou busca)
  // "N de T" — N = o que a lista mostra, T = todos os scripts (o mesmo T em todo filtro)
  const filtrando = termos.length > 0 || paleta.filtro !== 'todos';
  const contador = filtrando ? `${paleta.n} de ${paleta.totalGeral}` : paleta.totalGeral === 1 ? '1 script' : `${paleta.totalGeral} scripts`;
  // resumo para leitor de tela (a prévia inteira não é relida a cada ↓)
  const anuncio = hi
    ? `${hi.it.titulo}. ${rotuloMensagens(hi.it.total)}${hi.it.tipos.length ? ': ' + rotuloComposicaoNaOrdem(hi.it.tipos) : ''}.`
    : '';

  const renderGrupo = (g: Grupo) => {
    const cabId = 'spl-g-' + g.chave.replace(/[^\w-]/g, '_');
    const noFav = g.tipo === 'fav';
    const corpo = g.itens.map((c) => (
      <ItemScript key={c.chave} c={c} ativo={c.chave === hi?.chave} noFav={noFav} termos={termos} ctx={ctx} avisar={estreito} onUsar={usar} />
    ));
    if (g.tipo === 'lista') return <div key={g.chave} role="group" aria-label={g.rotulo}>{corpo}</div>;
    return (
      <div key={g.chave} className="spl-grupo" data-g={g.chave} role="group" aria-labelledby={cabId}>
        <div className={'spl-gcab' + (noFav ? ' spl-gcab-fav' : '') + (rolagem.fixo === g.chave ? ' spl-gcab-fixo' : '')} id={cabId}>
          {noFav && <IcEstrela />}
          {g.tipo === 'rec' && <IcRelogio />}
          <span>{g.rotulo}</span>
          <span className="spl-gcab-n">{g.itens.length}</span>
        </div>
        {corpo}
      </div>
    );
  };

  const temBusca = busca !== '';
  // lista filtrada (sem cabeçalhos fixos): o topo também esmaece quando rolada
  const semCabecalhos = grupos.every((g) => g.tipo === 'lista');
  const escRotulo = temBusca ? 'limpar' : 'fechar';
  const dicaRolar = !vazio && !estreito && previaRola;
  const cliente = (ctx.cliente ?? '').trim();

  return (
    <div
      ref={painelRef}
      className={'spl' + (estreito ? ' spl-estreito' : '') + (compacto ? ' spl-compacto' : '') + (curto ? ' spl-curto' : '') + (termos.length ? ' spl-buscando' : '')}
      style={layout.estilo}
      role="dialog" aria-modal="false" aria-label="Scripts" onKeyDown={onPainelKey} onMouseUp={aoSoltarMouse}
    >
      {/* ---------- cabeçalho: busca grande ---------- */}
      <div className="spl-cab">
        <span className="spl-cab-ic" aria-hidden><IcBusca /></span>
        <input
          ref={inputRef} className="spl-busca" value={busca} maxLength={80} autoComplete="off" spellCheck={false}
          placeholder="Buscar por título, tag ou texto da mensagem…"
          role="combobox" aria-expanded={!vazio} aria-controls={vazio ? undefined : 'spl-lista'} aria-autocomplete="list"
          aria-label="Buscar script" aria-activedescendant={hi ? idOpcao(hi.chave) : undefined}
          onChange={(e) => setBusca(e.target.value)} onKeyDown={onInputKey}
        />
        <span className="spl-cont num">{contador}</span>
        {temBusca && (
          <button type="button" className="spl-limpar" onClick={limparBusca} aria-label="Limpar busca" title="Limpar busca (Esc)"><IcLimpar /></button>
        )}
      </div>

      {/* ---------- pílulas de filtro ---------- */}
      <div className="spl-pills-faixa">
        <div className="spl-pills-trilho">
        {corte.esq && (
          <button
            type="button" className="spl-pills-seta spl-esq" tabIndex={-1} aria-label="Ver categorias anteriores"
            onMouseDown={(e) => e.preventDefault()} onClick={() => rolarPilulas(-1)}
          ><IcVoltar /></button>
        )}
        <div
          className={'spl-pills' + (corte.esq ? ' spl-corte-esq' : '') + (corte.dir ? ' spl-corte-dir' : '')}
          ref={pilulasRef} role="tablist" aria-label="Filtrar scripts" onKeyDown={onPilulasKey} onScroll={medirCorte}
        >
          {pilulas.map((p) => {
            const on = p.filtro === paleta.filtro;
            return (
              <button
                key={p.filtro} id={idTab(p.filtro)} type="button" role="tab" aria-selected={on} aria-controls="spl-painel" tabIndex={on ? 0 : -1}
                className={'spl-pill' + (on ? ' spl-on' : '') + (p.n === 0 ? ' spl-pill-zero' : '')}
                onClick={() => { trocarFiltro(p.filtro); inputRef.current?.focus(); }}
              >
                {p.filtro === 'favoritos' && <span className="spl-pill-ic" aria-hidden><IcEstrela /></span>}
                <span>{p.rotulo}</span>
                <span className="spl-pill-n num">{p.n}</span>
              </button>
            );
          })}
        </div>
        {corte.dir && (
          <button
            type="button" className="spl-pills-seta spl-dir" tabIndex={-1} aria-label="Ver mais categorias"
            onMouseDown={(e) => e.preventDefault()} onClick={() => rolarPilulas(1)}
          ><IcChevron /></button>
        )}
        </div>
      </div>

      {/* ---------- corpo: lista + prévia ---------- */}
      <div className="spl-corpo" id="spl-painel" role="tabpanel" aria-labelledby={idTab(paleta.filtro)}>
        {vazio ? (
          <div className="spl-vazio" role="status">
            <span className="spl-vazio-ic" aria-hidden>{vazio.ic}</span>
            <b>{vazio.t}</b>
            <span>{vazio.s}</span>
            <div className="spl-vazio-acoes">
              {vazio.acoes.map((a) => <BotaoSec key={a.r} mini onClick={a.f}>{a.r}</BotaoSec>)}
            </div>
          </div>
        ) : (
          <>
            <div
              className={'spl-lista' + (rolagem.cima && semCabecalhos ? ' spl-sombra-cima' : '') + (rolagem.baixo ? ' spl-sombra-baixo' : '')}
              id="spl-lista" ref={listaRef} role="listbox" aria-label="Scripts"
              onMouseMove={aoMoverLista} onMouseLeave={() => intencao.sair()} onScroll={medirLista}
            >
              {grupos.map(renderGrupo)}
            </div>
            {!estreito && hi && (
              <Previa
                it={hi.it}
                // sem categoria (ou categoria apagada) = "Outros", o mesmo nome da pílula e do grupo
                categoria={(hi.it.catId ? nomeCategoria.get(hi.it.catId) : null) ?? 'Outros'}
                onTransborda={setPreviaRola}
                ctx={ctx}
                termos={termos}
                canal={canal}
                ultima={ultima}
                resumo={resumoEf[hi.it.s.id]}
                resumoPronto={!SCRIPTS_REAL || resumo !== undefined}
                onUsar={() => usar(hi.it.s)}
              />
            )}
          </>
        )}
      </div>
      <div className="spl-sr" aria-live="polite" aria-atomic="true">{anuncio}</div>

      {/* coluna única (sem prévia): para quem e por qual número, numa linha */}
      {estreito && !vazio && (
        <div className="spl-para" title={[cliente ? `Para ${cliente}` : '', canal ? `Sai por ${canal}` : ''].filter(Boolean).join(' · ')}>
          <IcPessoa />
          <span className="spl-para-t">
            {cliente ? <>Para <b>{cliente}</b></> : 'Conversa sem nome do cliente'}
            {canal && <> · <IcCelular /><b>{canal}</b></>}
          </span>
        </div>
      )}

      {/* ---------- rodapé ---------- */}
      <div className="spl-rod">
        <button type="button" className="spl-ger" onClick={onGerenciar}>Gerenciar scripts<IcChevron /></button>
        {/* prévia que transborda (ou ponteiro nela): "Shift ↑↓ rolar prévia" — para quem está no
            teclado também; painel estreito demais para 5 dicas: ele toma o lugar de "categorias" */}
        <div className="spl-dicas" aria-hidden>
          {!vazio && <span><kbd className="spl-kbd">↑</kbd><kbd className="spl-kbd">↓</kbd>navegar</span>}
          {!estreito && !temBusca && !(dicaRolar && !largo) && <span><kbd className="spl-kbd">←</kbd><kbd className="spl-kbd">→</kbd>categorias</span>}
          {dicaRolar && <span><kbd className="spl-kbd">Shift</kbd><kbd className="spl-kbd">↑</kbd><kbd className="spl-kbd">↓</kbd>rolar prévia</span>}
          {!vazio && <span><kbd className="spl-kbd">Enter</kbd>usar</span>}
          <span><kbd className="spl-kbd">Esc</kbd>{escRotulo}</span>
        </div>
      </div>
    </div>
  );
}
