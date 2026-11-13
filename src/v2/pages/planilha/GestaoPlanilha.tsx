/* =====================================================================
   Gestão de cobranças — a TELA "Excel 2.0" (contrato §6,
   design-ref/PLANILHA-EXCEL-CONTRATO.md). Substitui a AbaPlanilha em
   /cobrancas/planilha.

   - A folha vem de usePlanilha() (planilha.ts); a grade é o PlanilhaExcel
     (componente puro). Aqui só se liga: permissões (mesma matriz da
     AbaPlanilha), busca/filtros, chips de ciclo, ações da toolbar e os
     modais que já existiam (ficha, lançar pagamento, gerenciar ciclos,
     lixeira, direcionar).
   - Exportar = .xlsx IDÊNTICO à folha (linhas na ordem, texto exato,
     larguras), SEM senhas.
   - Altura: a .pagina rola e quem não tem altura é cortado em silêncio —
     a tela mede o espaço útil e dá à grade a altura exata. Tela cheia =
     fixed por cima do app (modais e menus da grade ficam acima).
   - Transição segura: sem a migration 57 (RPC ausente) ou com a folha
     ainda vazia (carga não rodou), mostra a gestão antiga com um aviso.
   ===================================================================== */
import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent as RDragEvent, type KeyboardEvent as RKeyboardEvent } from 'react';
import { useIsMutating, useQueryClient } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import { BotaoPrimario, BotaoSec, CardVidro, EstadoVazio, ModalV2 } from '../../components';
import { SeloAoVivo } from '../../components/SeloAoVivo';
import { isDemoMode, isRevizaMode } from '@/lib/supabase';
import {
  useAbrirCiclo, useAssinarComprovante, useConfirmarEntrada, useDadosCobranca, useEditarLead, useEsvaziarCiclo, useEsvaziarCiclos,
  useExcluirLead, useFecharCiclo, useImportarNoCiclo, useLancarPagamento, useLimparCelula, useMarcarCelula, useMarcarNaoPagou,
  useMoverTurma, useRecusarEntrada, useSenhasGrade,
} from '../../data/cobranca/hooks';
import { usePapel } from '../../data/cobranca/sessao';
import { fmtPct, liquidoDoTotal, parteDoComercial, pctNoMes, totalPagoPeloCliente, useComissoes, useComissoesHist, useParteDoComercial } from '../../data/cobranca/comissoes';
import {
  btrim, chavesPlanilha, compDaCelula, compSoma, estadoMes, estadoMesCelula, fmtValorBR, letraColuna, plTrim, useColunaOps,
  useLinhaOps, usePlanilha, useSalvarCelulas, valorBR,
  type EntradaCel, type EstadoMesCelula, type PlColuna, type PlDados, type PlItem, type PlLinha,
} from '../../data/cobranca/planilha';
import type { GLinha, Papel } from '../../data/cobranca/types';
import { BotaoDesfazer } from '../../shell/BotaoDesfazer';
import { proximaCobrancaDoCiclo } from '../cicloCalendario';
import {
  AbaPlanilha, FichaLead, GerenciarCiclos, IC_PATH, IcT, LancarPagamento, LixeiraClientes,
  type CicloTurma, type Leitura,
} from '../cobrancaMotor';
import { LegendaEstados, PlanilhaExcel, type OrigemSalvar, type PermsPlanilha } from './PlanilhaExcel';
import { NovoMesModal, planoNovoMes, rotuloNovoMes } from './NovoMes';
import { BotaoSincronizacao, SeloSync } from './SyncPainel';
import { MenuMais, type ItemMenuMais } from './MenuMais';
import { MoverCancelados } from '../cancelados/AbaCancelados';
import './gestao.css';

/* ================= utilidades ================= */

const d2 = (n: number) => String(n).padStart(2, '0');
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const rotuloMes = (ym: string) => { const [y, m] = ym.split('-').map(Number); return y && m ? `${MESES[m - 1]}/${String(y).slice(2)}` : ym; };
const fmtBRL = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** "EDUARDO" → "Eduardo" (nome do comercial como a pessoa lê) */
const nomeCurto = (n: string) => n.trim().toLowerCase().replace(/(^|\s)(\p{L})/gu, (_m, a: string, c: string) => a + c.toUpperCase());
const dataBRcurta = (iso: string) => { const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1].slice(2)}` : iso; };
const DIAS_SEM = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const diaSemanaBR = (iso: string) => (/^\d{4}-\d{2}-\d{2}/.test(iso) ? DIAS_SEM[new Date(iso + 'T12:00:00').getDay()] : '');
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const MESES_LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
/** '2026-09' → 'setembro/2026' (subtítulo do informar pagamento) */
const mesAno = (ym: string) => { const [y, m] = ym.split('-').map(Number); return y && m ? `${MESES_LONGOS[m - 1]}/${y}` : ym; };

/* ---- comprovante (informar pagamento) ----
   O bucket 'comprovantes' só aceita PNG/JPG/WEBP/GIF/PDF (mig 07) e o caminho no
   Storage leva o nome do arquivo: acento/espaço viram '-' (chave inválida no Storage). */
const LIMITE_COMPROVANTE = 5 * 1024 * 1024;
const TIPOS_COMPROVANTE: Record<string, string> = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
};
const ACEITA_COMPROVANTE = 'image/png,image/jpeg,image/webp,image/gif,application/pdf,.pdf,.png,.jpg,.jpeg,.webp,.gif';
/** o tipo que vai pro Storage (pelo MIME do arquivo ou, sem ele, pela extensão); null = não aceito */
function tipoComprovante(f: File): string | null {
  const porMime = Object.values(TIPOS_COMPROVANTE).find((t) => t === f.type);
  if (porMime) return porMime;
  const ext = (/\.([a-z0-9]+)$/i.exec(f.name)?.[1] ?? '').toLowerCase();
  return !f.type || f.type === 'application/octet-stream' ? (TIPOS_COMPROVANTE[ext] ?? null) : null;
}
function nomeSeguro(n: string): string {
  const s = n.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-{2,}/g, '-').replace(/^[-.]+|[-.]+$/g, '');
  return (s || 'comprovante').slice(-80);
}
const fmtTam = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / (1024 * 1024)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`);
/** nome legível do comprovante a partir do path do Storage ('<lead>/<comp>/<uuid>-<nome>') */
const nomeDoPath = (p: string) => (p.split('/').pop() ?? p).replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i, '') || 'comprovante';

/** tradução de erro das mutations (RLS/RPC/rede) p/ o aviso da tela — mesma regra da AbaPlanilha */
const msgErro = (e: unknown) => {
  const m = e instanceof Error ? e.message : String(e ?? '');
  if (/42501|sem permissao|permission|row-level/i.test(m)) return 'Você não tem permissão para esta ação.';
  return m || 'Falha ao salvar. Tente de novo.';
};

/* ícones de traço que o IC_PATH não tem (zero emoji no cromo) */
const IC = {
  exportar: 'M12 4v11m0 0 4-4m-4 4-4-4M4 20h16',
  cheia: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  sair: 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5',
  colunas: 'M4 5h16v14H4zM9.5 5v14M14.5 5v14',
  novoMes: 'M4 7.5A1.5 1.5 0 0 1 5.5 6h13A1.5 1.5 0 0 1 20 7.5v11a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5zM4 10h16M8.5 4v3.5M15.5 4v3.5M12 12.5v5M9.5 15h5',
  atencao: 'M12 9v4M12 17h.01M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  relogio: 'M12 7.5V12l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
  subir: 'M12 16V4m0 0-4.5 4.5M12 4l4.5 4.5M4 16v2.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V16',
  doc: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h4',
  fechar: 'M18 6 6 18M6 6l12 12',
  check: 'M20 6 9 17l-5-5',
  externo: 'M14 4h6v6M20 4l-8.5 8.5M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10',
  lixeira: 'M4 7h16M9.5 7V4.5h5V7M6.5 7l1 12.5h9l1-12.5M10 11v5M14 11v5',
} as const;

/** colunas ocultas SÓ PARA ESTE USUÁRIO (quem não mexe na estrutura da folha) */
const CHAVE_OCULTAS = 'gp_ocultas_v1';
function lerOcultasLocais(): Set<string> {
  try { const r = localStorage.getItem(CHAVE_OCULTAS); const a: unknown = r ? JSON.parse(r) : []; return new Set(Array.isArray(a) ? a.map(String) : []); } catch { return new Set(); }
}
function gravarOcultasLocais(s: Set<string>) {
  try { localStorage.setItem(CHAVE_OCULTAS, JSON.stringify([...s])); } catch { /* preferência só local */ }
}

/* ================= Exportar (.xlsx idêntico à folha) ================= */

/** .xlsx IDÊNTICO à folha: as mesmas linhas na mesma ordem (cabeçalhos dos
    blocos, vazias, rótulos, clientes), as colunas na ordem (ocultas seguem
    ocultas), o texto EXATO de cada célula e as larguras ('!cols') / alturas.
    SEM senhas: as colunas de senha das linhas cliente saem vazias.
    Número "canônico" (224, 263,81) em coluna de mês/PARCELA TOTAL sai como
    NÚMERO (o Excel pt-BR mostra o mesmo texto e soma); o resto sai como texto.
    Cores não vão: o SheetJS da casa (0.18, community) não grava estilo. */
export function exportarPlanilhaXlsx(dados: PlDados, nomeBase = 'gestao-cobrancas'): void {
  const cols = [...dados.colunas].sort((a, b) => a.ordem - b.ordem);
  const ws: XLSX.WorkSheet = {};
  dados.linhas.forEach((l, r) => {
    cols.forEach((c, k) => {
      // senha nunca sai (no banco a célula já é nula; aqui é a 2ª trava)
      if (l.tipo === 'cliente' && (c.campo === 'senha_inss' || c.campo === 'reclame')) return;
      const t = l.c[c.id]?.t;
      if (t == null || t === '') return;
      const numerico = l.tipo === 'cliente' && (c.tipo === 'mes' || c.campo === 'valor');
      const v = numerico ? valorBR(t) : null;
      ws[XLSX.utils.encode_cell({ r, c: k })] = v != null && fmtValorBR(v) === t ? { t: 'n', v } : { t: 's', v: t };
    });
  });
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(0, dados.linhas.length - 1), c: Math.max(0, cols.length - 1) } });
  ws['!cols'] = cols.map((c) => (c.oculta ? { wpx: c.largura, hidden: true } : { wpx: c.largura }));
  const alturas: XLSX.RowInfo[] = [];
  dados.linhas.forEach((l, r) => { if (l.altura) alturas[r] = { hpx: l.altura }; });
  if (alturas.length) ws['!rows'] = alturas;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Planilha1');
  const ag = new Date();
  XLSX.writeFile(wb, `${nomeBase}-${ag.getFullYear()}-${d2(ag.getMonth() + 1)}-${d2(ag.getDate())}.xlsx`);
}

/* ================= a tela ================= */

/** gestão antiga (transição segura): sem a migration 57 ou com a folha ainda vazia */
function GestaoLegada({ semRpc, gestor, papel }: { semRpc: boolean; gestor: boolean; papel?: Papel }) {
  return (
    <>
      {/* o cabeçalho da página é desta tela (título e ações na mesma linha) */}
      <div className="ph"><div><h2>Gestão de cobranças</h2></div></div>
      <div className="gs-aviso" role="status">
        <span>{semRpc
          ? 'A planilha nova ainda não está instalada no banco — mostrando a gestão de cobranças anterior.'
          : 'A planilha nova ainda não foi carregada — mostrando a gestão de cobranças anterior.'}</span>
      </div>
      <AbaPlanilha demo={isDemoMode} gestor={gestor} papel={papel} />
    </>
  );
}

/* Sem a migration 57 (RPC ausente), a tela TRAVA na gestão antiga até ser
   reaberta. Antes, cada refetch sem dados (polling de 30 s, foco da janela)
   voltava a query para 'pending': a tela nova montava por ~1 s e a AbaPlanilha
   remontava do zero — sumiam a ficha aberta, o Lançar pela metade, a busca.
   Aqui o usePlanilha nem fica montado: nada de polling numa função que não
   existe. Depois da migration, a planilha nova entra ao reabrir a tela. */
export function GestaoPlanilha({ demo, gestor, papel }: { demo: boolean; gestor: boolean; papel?: Papel }) {
  const [semRpc, setSemRpc] = useState(false);
  if (semRpc) return <GestaoLegada semRpc gestor={gestor} papel={papel} />;
  return <GestaoPlanilhaNova demo={demo} gestor={gestor} papel={papel} aoSemRpc={() => setSemRpc(true)} />;
}

function GestaoPlanilhaNova({ gestor, papel, aoSemRpc }: { demo: boolean; gestor: boolean; papel?: Papel; aoSemRpc: () => void }) {
  const qc = useQueryClient();
  const plQ = usePlanilha();
  const dadosQuery = useDadosCobranca();
  const dadosQ = dadosQuery.data;
  const comps = useMemo(() => dadosQ?.comps ?? [], [dadosQ]);
  const glinhas = useMemo(() => dadosQ?.linhas ?? [], [dadosQ]);

  // capacidades = MESMA matriz da AbaPlanilha (o banco é a autoridade; aqui só
  // se esconde o que daria erro). Comercial só recebe as linhas dele (RLS).
  const podeOperar = gestor || papel === 'comercial' || papel === 'cadastro' || papel === 'financeiro';
  const podeCelula = gestor || papel === 'financeiro' || papel === 'comercial';
  const sessao = usePapel().data;
  const podeRevelarGrade = sessao?.podeRevelar ?? false;
  const senhasGrade = useSenhasGrade(podeRevelarGrade).data;
  const podeDirecionar = gestor || papel === 'cadastro' || papel === 'financeiro';
  const podeLancar = gestor || papel === 'comercial';
  const finMais = gestor || papel === 'financeiro'; // estrutura da folha (colunas, linhas não-cliente)
  // pagamento informado: aprova/recusa = financeiro, gestor, admin (confirmar/recusar_entrada)
  const podeAprovarPag = finMais;
  /* informar pagamento = comercial DONO do cliente, gestor ou admin (ent_ins da mig 58).
     Dono = o COMERCIAL do cliente igual ao nome do usuário (upper(btrim) dos dois — a
     mesma conta do comercial_dono_lead do banco). Lido por ref: o perms fica estável. */
  const leadPorId = useMemo(() => new Map(glinhas.map((g) => [g.id, g])), [glinhas]);
  const ehDonoRef = useRef<(l: PlLinha) => boolean>(() => false);
  ehDonoRef.current = (l: PlLinha) => {
    const eu = btrim(sessao?.nome).toUpperCase();
    if (!eu || !l.leadId) return false;
    const colC = plQ.data?.colunas.find((c) => c.campo === 'comercial');
    const com = leadPorId.get(l.leadId)?.comercial ?? (colC ? l.c[colC.id]?.t : null);
    return btrim(com).toUpperCase() === eu;
  };
  const perms = useMemo<PermsPlanilha>(() => ({
    editarLinha: (l) => (l.tipo === 'cliente' ? podeOperar : finMais),
    editarMes: (l) => (l.tipo === 'cliente' ? podeCelula : finMais),
    estrutura: finMais,
    excluirColuna: gestor,
    excluirCliente: gestor,
    // NOVOS: qualquer papel; bloco de cobrança = já aprovado → só quem aprova
    inserirCliente: (b) => (b?.situacao === 'ativo' ? podeOperar : podeDirecionar),
    // COMERCIAL do cliente: o comercial não troca nem apaga (o banco também barra,
    // igual ao WITH CHECK da leads_upd) — a grade pula a célula em vez de errar o lote
    trocarComercial: papel !== 'comercial',
    // tirar um pagamento que já existe (virar "sem linha") = financeiro+ (idem no banco)
    removerPagamento: finMais,
    informarPagamento: (l) => l.tipo === 'cliente' && !!l.leadId && (gestor || (papel === 'comercial' && ehDonoRef.current(l))),
    aprovarPagamento: podeAprovarPag,
  }), [podeOperar, podeCelula, finMais, gestor, podeDirecionar, papel, podeAprovarPag]);

  const salvarMut = useSalvarCelulas();
  const colOps = useColunaOps();
  const linOps = useLinhaOps();
  const salvando = useIsMutating({ mutationKey: chavesPlanilha.escrita }) > 0;
  const relerPlanilha = () => { void qc.invalidateQueries({ queryKey: chavesPlanilha.planilha }); };

  const [aviso, setAviso] = useState('');
  const [busca, setBusca] = useState('');
  const buscaAdiada = useDeferredValue(busca);
  // Ctrl/Cmd+F na grade: o Localizar nativo não acha linha fora da janela
  // virtualizada — a grade pede (onBuscar) e a busca da tela ganha o foco
  const buscaRef = useRef<HTMLInputElement>(null);
  const focarBusca = () => { const el = buscaRef.current; if (el) { el.focus(); el.select(); } };
  const [fCom, setFCom] = useState(''); // '' = todos; senão o nome em MAIÚSCULAS
  const [fBloco, setFBloco] = useState<string | null>(null);
  /* busca vinda da paleta ⌘K do shell (sessionStorage 'alfa_paleta_busca'): consome
     a chave (ler + remover) e preenche a busca da grade — no mount (navegou pra cá)
     ou pelo evento (a tela já estava aberta). Zera comercial/ciclo pro cliente
     escolhido não ficar escondido atrás de um filtro ativo. */
  useEffect(() => {
    const consumir = () => {
      try {
        const v = sessionStorage.getItem('alfa_paleta_busca');
        if (v == null) return;
        sessionStorage.removeItem('alfa_paleta_busca');
        setBusca(v); setFCom(''); setFBloco(null);
      } catch { /* sem sessionStorage (aba restrita): a busca fica manual */ }
    };
    consumir();
    window.addEventListener('alfa_paleta_busca', consumir);
    return () => window.removeEventListener('alfa_paleta_busca', consumir);
  }, []);
  const [irPara, setIrPara] = useState<string | undefined>(undefined);
  const contIr = useRef(0);
  const [cheia, setCheia] = useState(false);
  const [colsAberto, setColsAberto] = useState(false);
  const [colsEsq, setColsEsq] = useState(false);   // popover de colunas ancorado à esquerda (não coube à direita)
  const [ocultasLocais, setOcultasLocais] = useState<Set<string>>(lerOcultasLocais);
  const [fichaId, setFichaId] = useState<string | null>(null);
  const [lancarOpen, setLancarOpen] = useState(false);
  const [lancarLead, setLancarLead] = useState<string | undefined>(undefined); // cliente já escolhido no seletor
  const [lixeiraOpen, setLixeiraOpen] = useState(false);
  /** "Mover para Cancelados": os clientes já marcados ao abrir (null = fechado) */
  const [moverCanc, setMoverCanc] = useState<string[] | null>(null);
  const clientesSelRef = useRef<(() => string[]) | null>(null);
  const [novoMesOpen, setNovoMesOpen] = useState(false);
  const [ciclosOpen, setCiclosOpen] = useState(false);
  const [dirOpen, setDirOpen] = useState(false);
  const [dirDias, setDirDias] = useState<Record<string, number>>({});
  // pagamento informado: modal de informar (célula), de recusar e o visualizador do comprovante
  const [informar, setInformar] = useState<{ linhaId: string; colunaId: string; valor?: number } | null>(null);
  const [erroInformar, setErroInformar] = useState('');
  const [recusarId, setRecusarId] = useState<string | null>(null);
  const [erroRecusar, setErroRecusar] = useState('');
  // cp = o comprovante (path no Storage): "Abrir em nova aba" assina de novo (a URL assinada dura 60 s)
  const [verComp, setVerComp] = useState<{ id: string; nome: string; url: string; cp: { url?: string; path?: string } } | null>(null);
  const [erroVerComp, setErroVerComp] = useState('');
  const abrindoComp = useRef(false);
  // célula ativa da grade (ref: a seleção muda a cada seta — não re-renderiza a tela)
  const celulaAtiva = useRef<{ linhaId: string; colunaId: string } | null>(null);
  /* o ÚLTIMO modal de pagamento da tela fechou (informar, recusar, comprovante, seletor): o foco
     volta pra grade — senão fica no body e as setas/Enter/Delete param até clicar na grade de
     novo. Depois do commit (o modal já saiu do DOM); passar de um modal pro outro (comprovante →
     recusar, seletor → informar) não conta. Só quando ninguém pegou o foco. */
  const focarGradeRef = useRef<(() => void) | null>(null);
  const modalPagamento = !!informar || !!recusarId || !!verComp || lancarOpen || novoMesOpen;
  const tinhaModalPag = useRef(false);
  useEffect(() => {
    if (modalPagamento) { tinhaModalPag.current = true; return; }
    if (!tinhaModalPag.current) return;
    tinhaModalPag.current = false;
    const a = document.activeElement;
    if (!a || a === document.body || !a.isConnected) focarGradeRef.current?.();
  }, [modalPagamento]);
  /* sobreposição OTIMISTA do estado da célula (informou / aprovou / recusou): a cor muda
     na hora e sai quando a folha relida (que começou depois da ação) chega */
  const [sobre, setSobre] = useState<Sobreposicao[]>([]);

  /* ---------- a folha ---------- */
  /* CANCELADOS (mig 79): a linha do cliente fica na folha (no mesmo lugar, pra voltar), mas some
     da tela — tudo daqui pra baixo (grade, contagens, filtros, exportar) já vê a folha sem eles.
     A folha só aparece depois que a lista de clientes chegou (é ela que diz quem está nos
     Cancelados — antes disso eles piscariam na grade, editáveis) */
  const folha = plQ.data;
  const dados = useMemo<PlDados | undefined>(() => {
    if (!folha || !dadosQ) return undefined;
    const ids = new Set((dadosQ.cancelados ?? []).map((l) => l.id));
    return ids.size ? { ...folha, linhas: folha.linhas.filter((l) => !(l.tipo === 'cliente' && l.leadId && ids.has(l.leadId))) } : folha;
  }, [folha, dadosQ]);
  const planoMes = useMemo(() => (dados ? planoNovoMes(dados) : null), [dados]);
  const semRpc = !dados && plQ.isError && /não está instalada/i.test(plQ.error?.message ?? '');
  const folhaVazia = !!dados && dados.colunas.length === 0;
  const legado = semRpc || folhaVazia; // transição segura: gestão antiga
  // RPC ausente: o pai trava na gestão antiga (sem pintar este quadro)
  useLayoutEffect(() => { if (semRpc) aoSemRpc(); }, [semRpc, aoSemRpc]);

  /* meses que cada cliente aceita = os que têm coluna no bloco dele na folha
     (+ o próximo, que o gatilho cria). Fora disso o pagamento entraria no
     sistema e a célula ficaria vazia (pl_reflete_pagamento ignora) — a
     planilha e o sistema divergiriam. NOVOS (sem comp_base) não tem mês. */
  const compsDoLead = useMemo(() => {
    const m = new Map<string, Set<string>>();
    if (!dados) return m;
    const ks = dados.colunas.filter((c) => c.tipo === 'mes' && c.mesPos != null).map((c) => c.mesPos as number);
    const todos = [...ks, (ks.length ? Math.max(...ks) : -1) + 1];
    const base = new Map(dados.blocos.map((b) => [b.id, b.compBase]));
    for (const l of dados.linhas) {
      const cb = l.tipo === 'cliente' && l.leadId && l.bloco ? base.get(l.bloco) : null;
      if (l.leadId && cb) m.set(l.leadId, new Set(todos.map((k) => compSoma(cb, k))));
    }
    return m;
  }, [dados]);
  const compNaPlanilha = (leadId: string, comp: string) => !dados || !!compsDoLead.get(leadId)?.has(comp);

  const linhas = useMemo(() => dados?.linhas ?? [], [dados]);
  const blocos = useMemo(() => dados?.blocos ?? [], [dados]);
  const colCom = useMemo(() => dados?.colunas.find((c) => c.campo === 'comercial') ?? null, [dados]);
  const nClientes = useMemo(() => linhas.reduce((n, l) => n + (l.tipo === 'cliente' ? 1 : 0), 0), [linhas]);

  // quem não mexe na estrutura oculta colunas só pra si (localStorage);
  // + a sobreposição otimista do pagamento informado/aprovado/recusado
  const dadosGrade = useMemo<PlDados | undefined>(() => {
    if (!dados) return dados;
    let d = dados;
    if (!finMais && ocultasLocais.size) {
      d = { ...d, colunas: d.colunas.map((c) => (ocultasLocais.has(c.id) && !c.oculta ? { ...c, oculta: true } : c)) };
    }
    return sobre.length ? aplicarSobre(d, sobre) : d;
  }, [dados, finMais, ocultasLocais, sobre]);
  // a folha relida DEPOIS da ação já traz o estado real: a sobreposição sai
  useEffect(() => {
    if (!sobre.length) return;
    const lida = plQ.dataUpdatedAt;
    const tira = () => setSobre((xs) => {
      const ys = xs.filter((x) => x.ts > lida && Date.now() - x.ts < 30_000);
      return ys.length === xs.length ? xs : ys;
    });
    tira();
    const t = window.setTimeout(tira, 31_000); // folha não relida (sem rede): some sozinha
    return () => window.clearTimeout(t);
  }, [plQ.dataUpdatedAt, sobre]);
  const sobrepor = (s: Omit<Sobreposicao, 'ts'>) => setSobre((xs) => [...xs.filter((x) => !(x.linhaId === s.linhaId && x.colunaId === s.colunaId)), { ...s, ts: Date.now() }]);

  // comerciais da folha (dedupe por caixa, igual à AbaPlanilha)
  const comerciaisFolha = useMemo(() => {
    const m = new Map<string, string>();
    if (colCom) for (const l of linhas) {
      if (l.tipo !== 'cliente') continue;
      const t = plTrim(l.c[colCom.id]?.t);
      if (t && !m.has(t.toUpperCase())) m.set(t.toUpperCase(), t);
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR')).map(([k, v]) => ({ k, v }));
  }, [linhas, colCom]);

  // chips "D24 · 49": na ordem da folha; contagem = linhas cliente do bloco.
  // Esvaziar ciclo deixa as linhas no bloco antigo (o lead fica sem dia): elas
  // saem da contagem e o chip avisa "N aguardando" — igual ao banner/Direcionar.
  const chips = useMemo(() => {
    const aguardandoIds = new Set<string>();
    for (const g of glinhas) if (g.situacao === 'cancelado' && !g.dia) aguardandoIds.add(g.id);
    const n = new Map<string, number>(); const ag = new Map<string, number>();
    for (const l of linhas) {
      if (l.tipo !== 'cliente' || !l.bloco) continue;
      if (l.leadId && aguardandoIds.has(l.leadId)) ag.set(l.bloco, (ag.get(l.bloco) ?? 0) + 1);
      else n.set(l.bloco, (n.get(l.bloco) ?? 0) + 1);
    }
    return blocos.map((b) => ({ b, n: n.get(b.id) ?? 0, ag: ag.get(b.id) ?? 0 }));
  }, [linhas, blocos, glinhas]);
  // ciclo aberto (Gerenciar ciclos) que ainda não tem bloco na folha: chip vazio
  const abertosSemBloco = useMemo(() => {
    const comBloco = new Set(blocos.map((b) => b.dia).filter((x): x is number => x != null));
    return [...new Set(dadosQ?.ciclosAbertos ?? [])].filter((dd0) => dd0 > 0 && !comBloco.has(dd0)).sort((a, b) => a - b);
  }, [blocos, dadosQ]);
  // clamp: bloco/comercial que sumiu (mover/esvaziar, outra sessão) solta o filtro sozinho
  const blocoAtivo = fBloco && blocos.some((b) => b.id === fBloco) ? fBloco : null;
  const comAtivo = fCom && comerciaisFolha.some((c) => c.k === fCom) ? fCom : '';

  /* filtro: busca/comercial filtram as linhas CLIENTE; cabeçalho e rótulo dos
     blocos com resultado ficam; vazias saem. Só o chip de bloco = o bloco inteiro.
     O texto normalizado de cada linha fica em cache enquanto a folha não muda. */
  const cacheBusca = useRef<{ linhas: PlLinha[]; m: Map<string, { txt: string; dig: string }> } | null>(null);
  const { filtro, nVis } = useMemo(() => {
    const q = buscaAdiada.trim();
    const qn = semAcento(q);
    const qd = /^[\d.\-/\s]+$/.test(q) ? q.replace(/\D/g, '') : '';
    const temTexto = !!qn || !!comAtivo;
    if (!temTexto && !blocoAtivo) return { filtro: undefined, nVis: nClientes };
    if (qn && cacheBusca.current?.linhas !== linhas) cacheBusca.current = { linhas, m: new Map() };
    const textoDe = (l: PlLinha) => {
      const m = cacheBusca.current!.m;
      let e = m.get(l.id);
      if (!e) {
        const ts = Object.values(l.c).map((x) => x.t ?? '');
        // \u0001 separa as células: a busca nunca "emenda" o fim de uma no começo da outra
        e = { txt: semAcento(ts.join('\u0001')), dig: ts.map((t) => t.replace(/\D/g, '')).join('\u0001') };
        m.set(l.id, e);
      }
      return e;
    };
    const okCliente = (l: PlLinha) => {
      if (comAtivo && (!colCom || plTrim(l.c[colCom.id]?.t).toUpperCase() !== comAtivo)) return false;
      if (!qn) return true;
      const e = textoDe(l);
      return e.txt.includes(qn) || (qd.length >= 3 && e.dig.includes(qd)); // CPF/NB/telefone sem pontuação
    };
    const ids = new Set<string>(); const comResultado = new Set<string>(); let n = 0;
    for (const l of linhas) {
      if (l.tipo !== 'cliente' || (blocoAtivo && l.bloco !== blocoAtivo) || !okCliente(l)) continue;
      ids.add(l.id); n++;
      if (l.bloco) comResultado.add(l.bloco);
    }
    for (const l of linhas) {
      if (l.tipo === 'cliente' || (blocoAtivo && l.bloco !== blocoAtivo)) continue;
      if (!temTexto) ids.add(l.id);
      else if ((l.tipo === 'cabecalho' || l.tipo === 'rotulo') && l.bloco && comResultado.has(l.bloco)) ids.add(l.id);
    }
    return { filtro: (l: PlLinha) => ids.has(l.id), nVis: n };
  }, [buscaAdiada, comAtivo, blocoAtivo, linhas, colCom, nClientes]);

  const irAoBloco = (id: string) => { contIr.current += 1; setIrPara(`${id}#${contIr.current}`); };
  /* chip: 1º clique rola até o bloco; 2º clique (no mesmo) filtra; clicar no
     chip filtrado solta o filtro e fica no bloco; com filtro ativo, troca o bloco */
  const clicarChip = (id: string | null) => {
    // um clique = mostra só aquele ciclo; clicar de novo nele (ou em Todos) volta a folha inteira
    const novo = id == null || blocoAtivo === id ? null : id;
    setFBloco(novo);
    if (id) irAoBloco(id); // re-ancora no cabeçalho do bloco (com o filtro ele é o 1º)
  };

  /* ---------- altura útil (a .pagina rola; a grade precisa de altura exata) ---------- */
  const raizRef = useRef<HTMLDivElement>(null);
  const [altura, setAltura] = useState<number | null>(null);
  useLayoutEffect(() => {
    const raiz = raizRef.current;
    // tela cheia = fixed (altura do CSS); ao sair, o efeito roda de novo e re-mede
    if (legado || cheia || !raiz) return;
    const pagina = (raiz.parentElement?.closest('.pagina') as HTMLElement | null) ?? raiz.parentElement;
    if (!pagina) return;
    const medir = () => {
      const padB = parseFloat(getComputedStyle(pagina).paddingBottom) || 0;
      // offsetTop ignora o translate da animação de entrada; fallback por retângulo
      const topo = raiz.offsetParent === pagina
        ? raiz.offsetTop
        : raiz.getBoundingClientRect().top - pagina.getBoundingClientRect().top + pagina.scrollTop;
      const h = Math.max(440, Math.floor(pagina.clientHeight - padB - topo));
      setAltura((a) => (a === h ? a : h));
    };
    medir();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(medir) : null;
    ro?.observe(pagina);
    for (let s = raiz.previousElementSibling; s; s = s.previousElementSibling) ro?.observe(s);
    window.addEventListener('resize', medir);
    // fonte da web e a animação de entrada assentam o título depois do 1º layout
    let vivo = true;
    void document.fonts?.ready.then(() => { if (vivo) medir(); });
    const t = window.setTimeout(medir, 450);
    return () => { vivo = false; window.clearTimeout(t); ro?.disconnect(); window.removeEventListener('resize', medir); };
  }, [legado, cheia]);

  /* Esc sai da tela cheia — inclusive com o foco na grade — quando ninguém usou
     o Esc: a grade marca (preventDefault) o que consome (cancelar edição, barra
     de fórmula, menu); o tracejado da cópia, os popovers e os modais são vistos
     ANTES da grade tratar a tecla (captura), porque ela os fecha no mesmo Esc. */
  useEffect(() => {
    if (!cheia) return;
    let ocupadoAntes = false;
    const antes = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const cp = raizRef.current?.querySelector<HTMLElement>('.plx-copia');
      // menu da grade e modais podem estar em portal: procura no documento
      ocupadoAntes = (!!cp && getComputedStyle(cp).display !== 'none')
        || !!document.querySelector('.plx-pop, .plx-menu, .gp-cols-pop, .mm-pop, .veu, .veu-drawer');
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || ocupadoAntes) return;
      // campos da tela (busca, filtro) ficam com o Esc; o campo interno da grade, não
      const a = document.activeElement as HTMLElement | null;
      if (a && !a.closest('.plx') && a.closest('input, select, textarea')) return;
      setCheia(false);
    };
    window.addEventListener('keydown', antes, true);
    window.addEventListener('keydown', tecla);
    return () => { window.removeEventListener('keydown', antes, true); window.removeEventListener('keydown', tecla); };
  }, [cheia]);

  // popover de colunas fecha no clique fora e no Esc
  const colsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!colsAberto) return;
    const fora = (e: MouseEvent) => { if (!colsRef.current?.contains(e.target as Node)) setColsAberto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setColsAberto(false); };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc); };
  }, [colsAberto]);
  // abre pra ESQUERDA quando não cabe: em 1280 o botão quebra pra 2ª linha da barra, à esquerda, e os
  // 270px do popover ancorado à direita passavam da borda da página (caixas e letras A–N cortadas)
  const alternarCols = () => {
    if (!colsAberto) {
      const r = colsRef.current?.getBoundingClientRect();
      const borda = raizRef.current?.getBoundingClientRect().left ?? 0;
      setColsEsq(!!r && r.right - 270 < borda);
    }
    setColsAberto((v) => !v);
  };
  const colunasOrd = useMemo(() => [...(dadosGrade?.colunas ?? [])].sort((a, b) => a.ordem - b.ordem), [dadosGrade]);
  // ficha aberta daqui: as datas de reclamação e de parada vêm do TEXTO da
  // planilha (a ficha não reescreve a célula) — lá ficam só leitura, com a dica
  const dicaDatasFicha = useMemo(() => {
    const letra = (campo: string) => { const i = colunasOrd.findIndex((c) => c.campo === campo); return i >= 0 ? letraColuna(i) : null; };
    const r = letra('reclame'); const p = letra('parou');
    return `Estas datas vêm da planilha — edite ${r && p ? `nas colunas ${r} (reclamação) e ${p} (data que parou)` : 'nas colunas de reclamação e de data que parou'}.`;
  }, [colunasOrd]);
  // oculta pela EQUIPE (no banco): quem não é financeiro+ não mostra de novo —
  // o ocultar local só esconde a mais; a caixa fica travada com a dica
  const ocultasEquipe = useMemo(() => new Set((dados?.colunas ?? []).filter((c) => c.oculta).map((c) => c.id)), [dados]);
  const alternarColuna = (c: PlColuna) => {
    if (!finMais && ocultasEquipe.has(c.id)) return;
    if (finMais) {
      // ocultar/mostrar = da folha (vale pra equipe, como no menu da letra)
      colOps.mutate({ op: 'alterar', coluna: c.id, patch: { oculta: !c.oculta } }, { onError: (e) => setAviso(msgErro(e)) });
      return;
    }
    setOcultasLocais((s) => { const n = new Set(s); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); gravarOcultasLocais(n); return n; });
  };

  /* ---------- grade → banco ---------- */
  const onSalvar = async (itens: PlItem[], origem?: OrigemSalvar) => {
    const r = await salvarMut.mutateAsync({ itens, origem });
    if (r.avisos.length) setAviso(r.avisos.length === 1 ? r.avisos[0] : `${r.avisos[0]} (+${r.avisos.length - 1} aviso${r.avisos.length === 2 ? '' : 's'})`);
    return r;
  };

  /* ---------- ficha, lançar, ciclos (mesmas regras da AbaPlanilha) ---------- */
  const editarMut = useEditarLead();
  const excluirMut = useExcluirLead();
  const lancarMut = useLancarPagamento();
  const celulaMut = useMarcarCelula();
  const naoPagouMut = useMarcarNaoPagou();
  const limparMut = useLimparCelula();
  const turmaMut = useMoverTurma();
  const abrirCicloMut = useAbrirCiclo();
  const fecharCicloMut = useFecharCiclo();
  const esvaziarMut = useEsvaziarCiclos();
  const esvaziarUmMut = useEsvaziarCiclo();
  const importarNoMut = useImportarNoCiclo();

  const selL = fichaId ? glinhas.find((l) => l.id === fichaId) ?? null : null;
  // cliente recém-inserido na grade pode ainda não estar no cadastro em cache:
  // relê 1 vez antes de desistir
  const releuFicha = useRef<string | null>(null);
  useEffect(() => {
    if (!fichaId || !dadosQ || selL) return;
    if (releuFicha.current !== fichaId) { releuFicha.current = fichaId; void dadosQuery.refetch(); return; }
    if (dadosQuery.isFetching) return;
    setFichaId(null);
    setAviso('Não achei esse cliente no cadastro — pode ter ido para a Lixeira.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fichaId, dadosQ, selL, dadosQuery.isFetching]);

  const comerciais = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of glinhas) { const n = (l.comercial || '').trim(); if (n && !m.has(n.toUpperCase())) m.set(n.toUpperCase(), n); }
    return [...m.values()].sort();
  }, [glinhas]);
  // só dias que existem na base (real); demo também — a folha é a fonte
  const ciclosDisp = useMemo(() => {
    const s = new Set<number>();
    for (const l of glinhas) if (l.dia > 0) s.add(l.dia);
    for (const dd0 of dadosQ?.ciclosAbertos ?? []) s.add(dd0);
    return [...s].sort((a, b) => a - b);
  }, [glinhas, dadosQ]);
  const turmas = useMemo<CicloTurma[]>(() => {
    const map = new Map<number, GLinha[]>();
    for (const l of glinhas) { if (!l.dia || l.situacao !== 'cancelado') continue; const a = map.get(l.dia) ?? []; a.push(l); map.set(l.dia, a); }
    return [...map.entries()].map(([dia, leads]) => {
      const freq = new Map<number, number>(); for (const l of leads) freq.set(l.valor, (freq.get(l.valor) ?? 0) + 1);
      const base = [...freq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
      const seguem = leads.filter((l) => l.valor === base).length;
      return { dia, codigo: `D${d2(dia)}`, leads: [...leads].sort((a, b) => a.nome.localeCompare(b.nome)), base, seguem, excecoes: leads.length - seguem, ativos: 0, soma: leads.reduce((s, l) => s + l.valor, 0) };
    }).sort((a, b) => a.dia - b.dia);
  }, [glinhas]);
  // ordem do Gerenciar ciclos = a ordem dos blocos na folha (dia sem bloco vai pro fim)
  const posDe = (dia: number) => { const i = blocos.findIndex((b) => b.dia === dia); return i === -1 ? 1000 + dia : i; };
  const aguardando = useMemo(() => glinhas.filter((l) => l.situacao === 'cancelado' && !l.dia), [glinhas]);
  const proximaDoCiclo = (dia: number) => proximaCobrancaDoCiclo(dia, dadosQ?.ciclosDatas);

  const salvarLead = (l0: GLinha, tocados?: (keyof GLinha)[]) => {
    // mês da grade da ficha sem coluna no bloco do cliente na planilha: NÃO grava
    // (o pagamento entraria no sistema e a célula ficaria vazia) — volta ao valor
    // de antes e avisa; o resto da ficha segue
    const antes0 = glinhas.find((x) => x.id === l0.id);
    const fora: number[] = [];
    if (antes0 && (!tocados || tocados.includes('celulas'))) l0.celulas.forEach((raw, k) => {
      if ((antes0.celulas[k] ?? '-') === (raw ?? '-')) return;
      const comp = comps[k];
      if (comp && !compNaPlanilha(l0.id, comp)) fora.push(k);
    });
    const l: GLinha = fora.length && antes0 ? { ...l0, celulas: l0.celulas.map((raw, k) => (fora.includes(k) ? (antes0.celulas[k] ?? '-') : raw)) } : l0;
    if (fora.length) {
      const meses = fora.map((k) => rotuloMes(comps[k])).join(', ');
      setAviso(`${meses} ${fora.length === 1 ? 'está' : 'estão'} fora da planilha de ${l.nome || 'este cliente'} (sem coluna no bloco dele) — não gravado. Escolha um mês do ciclo dele.`);
    }
    // só os campos TOCADOS na ficha (sem regravar dia/valor velhos por cima de outra sessão)
    const patch: Partial<GLinha> = {};
    if (tocados) for (const k of tocados) (patch as Record<string, unknown>)[k] = (l as unknown as Record<string, unknown>)[k];
    else Object.assign(patch, l);
    if (!patch.senha) delete patch.senha;               // senha vazia = "não mexi"
    if (!patch.reclameSenha) delete patch.reclameSenha;
    if (!isDemoMode) delete patch.celulas;              // no real as células vão pelas RPCs abaixo
    const antes = glinhas.find((x) => x.id === l.id);
    if (antes && podeCelula && (!tocados || tocados.includes('celulas'))) l.celulas.forEach((raw, k) => {
      if ((antes.celulas[k] ?? '-') === (raw ?? '-')) return;
      const comp = comps[k]; if (!comp) return;
      const n = Number(String(raw).replace(',', '.'));
      const erro = { onError: (e: unknown) => setAviso(msgErro(e)), onSuccess: relerPlanilha };
      if (raw !== '-' && raw !== '' && isFinite(n)) celulaMut.mutate({ leadId: l.id, comp, valor: Math.round(n * 100) / 100 }, erro);
      else if (/n[aã]o\s*pagou/i.test(String(raw))) naoPagouMut.mutate({ leadId: l.id, comp }, erro);
      else if (gestor && (raw === '-' || raw === '')) limparMut.mutate({ leadId: l.id, comp }, erro);
    });
    if (!Object.keys(patch).length) { setFichaId(null); return; }
    editarMut.mutate({ id: l.id, patch }, { onSuccess: () => { setFichaId(null); relerPlanilha(); }, onError: (e) => setAviso(msgErro(e)) });
  };
  const excluirLead = (id: string) => { excluirMut.mutate(id, { onSuccess: () => { setFichaId(null); relerPlanilha(); }, onError: (e) => setAviso(msgErro(e)) }); };
  const direcionar = (l: GLinha, dia: number) => {
    if (!(dia >= 1 && dia <= 31)) return;
    editarMut.mutate({ id: l.id, patch: { dia } }, {
      onSuccess: () => { relerPlanilha(); setAviso(`${l.nome}: direcionado pro ciclo D${d2(dia)} — próxima cobrança ${dataBRcurta(proximaDoCiclo(dia))}.`); },
      onError: (e) => setAviso(msgErro(e)),
    });
  };
  const voltarNovos = (l: GLinha) => {
    editarMut.mutate({ id: l.id, patch: { situacao: 'ativo', dataParou: '' } }, {
      onSuccess: () => { relerPlanilha(); setAviso(`${l.nome}: voltou pros Novos — débito segue ativo.`); },
      onError: (e) => setAviso(msgErro(e)),
    });
  };
  /* ---------- pagamento pela célula: informar → financeiro aprova (verde) / recusa (vermelho) ---------- */
  const parteCom = useParteDoComercial(papel === 'comercial');   // ficha do cliente: a parte dele nos meses pagos
  const comissoesQ = useComissoes();
  const histComissaoQ = useComissoesHist();
  const pctsComissao = comissoesQ.data;
  const histComissao = histComissaoQ.data;
  /* a divisão do pagamento depende da % — sem ela carregada o cálculo cairia nos 50% padrão e
     gravaria o líquido errado: o "Informar pagamento" espera (ou mostra o erro) */
  // pela PRESENÇA dos dados: uma recarga que falha em segundo plano mantém a % em cache (não trava)
  const pctSituacao: 'ok' | 'carregando' | 'erro' = pctsComissao !== undefined && histComissao !== undefined ? 'ok'
    : comissoesQ.isError || histComissaoQ.isError ? 'erro' : 'carregando';
  /* comercial (dono 27/10): admin e financeiro veem na célula o que o escritório recebeu; o
     comercial vê a PARTE DELE (a % do mês de cada pagamento). Só a exibição — a célula guarda o líquido */
  const blocosGrade = dadosGrade?.blocos;
  const parteDoValor = useMemo(() => {
    if (papel !== 'comercial' || !pctsComissao || !histComissao || !blocosGrade) return undefined;
    return (l: PlLinha, c: PlColuna, valor: number) => {
      const com = btrim(l.leadId ? leadPorId.get(l.leadId)?.comercial : '');
      const comp = compDaCelula({ blocos: blocosGrade }, l, c);
      if (!com || com === '—' || !comp) return null;
      const pct = pctNoMes(histComissao, pctsComissao, com, comp);
      return {
        valor: parteDoComercial(valor, pct),
        dica: `sua parte (${fmtPct(pct)}%) — o cliente pagou ${fmtBRL(totalPagoPeloCliente(valor, pct))}`,
      };
    };
  }, [papel, pctsComissao, histComissao, blocosGrade, leadPorId]);
  /** "R$ 58,00 do escritório (cliente pagou R$ 116,00)" — o comprovante mostra o total do cliente */
  const valorComTotal = (leadId: string | null | undefined, comp: string, v: number) => {
    const com = btrim(leadId ? leadPorId.get(leadId)?.comercial : '');
    if (!com || com === '—') return fmtBRL(v);
    const t = totalPagoPeloCliente(v, pctNoMes(histComissao, pctsComissao, com, comp));
    return t === v ? fmtBRL(v) : `${fmtBRL(v)} do escritório (cliente pagou ${fmtBRL(t)})`;
  };
  const confirmarMut = useConfirmarEntrada();
  const recusarMut = useRecusarEntrada();
  const assinarMut = useAssinarComprovante();
  const colNome = useMemo(() => dados?.colunas.find((c) => c.campo === 'nome') ?? null, [dados]);
  /** o que o modal precisa de uma célula de mês de cliente; null = não é (ou não liga a pagamento: NOVOS) */
  const alvoDaCelula = (a: { linhaId: string; colunaId: string } | null) => {
    const d = dadosGrade;
    if (!a || !d) return null;
    const linha = d.linhas.find((x) => x.id === a.linhaId);
    const coluna = d.colunas.find((x) => x.id === a.colunaId);
    if (!linha || !coluna || linha.tipo !== 'cliente' || !linha.leadId || coluna.tipo !== 'mes') return null;
    const comp = compDaCelula(d, linha, coluna);
    if (!comp) return null;
    const bloco = d.blocos.find((b) => b.id === linha.bloco);
    const nome = plTrim(colNome ? linha.c[colNome.id]?.t : '') || leadPorId.get(linha.leadId)?.nome || 'Cliente';
    // valor sugerido = o pago mais recente da linha (a coluna de mês mais à frente com número)
    let sugerido: number | null = null; let kMax = -1; let sugeridoComp: string | null = null;
    for (const c of d.colunas) {
      if (c.tipo !== 'mes' || c.mesPos == null || c.mesPos <= kMax) continue;
      const e = estadoMes(linha.c[c.id]?.t);
      if (e.estado === 'pago') { kMax = c.mesPos; sugerido = e.valor; sugeridoComp = compDaCelula(d, linha, c); }
    }
    const estado: EstadoMesCelula = estadoMesCelula(linha, coluna, d);
    return {
      linha, coluna, comp, nome, leadId: linha.leadId, sugerido, sugeridoComp, estado,
      ciclo: bloco?.dia != null ? `D${d2(bloco.dia)}` : (bloco?.id ?? ''),
    };
  };
  /** a entrada (id) na folha: célula + dados da entrada; null = não está mais pendente/recusada na folha */
  const acharEntrada = (id: string) => {
    const d = dadosGrade;
    if (!d) return null;
    for (const l of d.linhas) {
      if (!l.e) continue;
      for (const [colunaId, ent] of Object.entries(l.e)) {
        if (ent.id !== id) continue;
        const alvo = alvoDaCelula({ linhaId: l.id, colunaId });
        return alvo ? { ...alvo, ent } : null;
      }
    }
    return null;
  };
  const abrirInformar = (a: { linhaId: string; colunaId: string; valor?: number }) => {
    const alvo = alvoDaCelula(a);
    if (!alvo) { setAviso('Esta célula não é de um mês de cobrança do cliente — não dá para informar pagamento nela.'); return; }
    if (alvo.estado.tipo === 'pendente') { setAviso(`${mesAno(alvo.comp)} de ${alvo.nome} já está aguardando o financeiro conferir.`); return; }
    if (alvo.estado.tipo === 'pago') { setAviso(`${mesAno(alvo.comp)} de ${alvo.nome} já está pago.`); return; }
    if (!perms.informarPagamento?.(alvo.linha)) { setAviso('Informar pagamento é do comercial dono do cliente, do gestor ou do administrador.'); return; }
    setErroInformar('');
    setInformar(a);
  };
  /** (cliente) → as células de mês dele na folha, por competência (1ª linha do cliente que tem o mês).
      Só entram meses que JÁ têm coluna no bloco dele (o "próximo", que o gatilho ainda cria, não) */
  const celulasDoLead = (leadId: string) => {
    const m = new Map<string, { linhaId: string; colunaId: string; estado: EstadoMesCelula['tipo'] }>();
    const d = dadosGrade; if (!d) return m;
    const meses = d.colunas.filter((c) => c.tipo === 'mes');
    for (const l of d.linhas) {
      if (l.tipo !== 'cliente' || l.leadId !== leadId) continue;
      for (const c of meses) {
        const comp = compDaCelula(d, l, c);
        if (comp && !m.has(comp)) m.set(comp, { linhaId: l.id, colunaId: c.id, estado: estadoMesCelula(l, c, d).tipo });
      }
    }
    return m;
  };
  /* "Lançar pagamento" da barra: na célula de um mês do cliente que ainda pode ser informado
     (vazio, não pago ou recusado, com permissão), o modal de informar já apontado para ela;
     senão o seletor de cliente e mês (já com o cliente da linha ativa) — que só ESCOLHE:
     o envio passa sempre pelo InformarPagamento (comprovante obrigatório, nome saneado, trava
     de mês pago/aguardando) */
  const abrirLancar = () => {
    const a = celulaAtiva.current;
    const alvo = a ? alvoDaCelula(a) : null;
    if (a && alvo && alvo.estado.tipo !== 'pago' && alvo.estado.tipo !== 'pendente' && perms.informarPagamento?.(alvo.linha)) {
      abrirInformar(a);
      return;
    }
    const linha = a ? dadosGrade?.linhas.find((x) => x.id === a.linhaId) : undefined;
    setLancarLead(linha?.tipo === 'cliente' && linha.leadId ? linha.leadId : undefined);
    setLancarOpen(true);
  };
  /** o seletor escolheu (cliente, mês): vai pro InformarPagamento da célula dele */
  const lancarPagamento = (leadId: string, comp: string) => {
    setLancarOpen(false);
    const cel = celulasDoLead(leadId).get(comp);
    if (!cel) {
      const n = glinhas.find((x) => x.id === leadId)?.nome || 'este cliente';
      setAviso(`${rotuloMes(comp)} não tem coluna no bloco de ${n} na planilha — escolha um mês do ciclo dele.`);
      return;
    }
    // mesma trava da célula: pendente/pago/permissão → aviso; senão abre o InformarPagamento
    abrirInformar({ linhaId: cel.linhaId, colunaId: cel.colunaId });
  };
  /** meses que o seletor oferece: os que têm célula no bloco do cliente e não estão pagos nem aguardando */
  const mesesParaInformar = (leadId: string) => {
    const s = new Set<string>();
    for (const [comp, x] of celulasDoLead(leadId)) if (x.estado !== 'pago' && x.estado !== 'pendente') s.add(comp);
    return s;
  };
  /* "Não pagou" na janela de informar: grava NÃO PAGOU na célula (vermelho) pela mesma via da grade */
  const [marcandoNao, setMarcandoNao] = useState(false);
  const naoPagouInformar = () => {
    const alvo = alvoDaCelula(informar);
    if (!alvo || marcandoNao) return;
    setErroInformar(''); setMarcandoNao(true);
    onSalvar([{ l: alvo.linha.id, c: alvo.coluna.id, t: 'NÃO PAGOU' }])
      .then(() => { setInformar(null); setAviso(`${alvo.nome} — ${mesAno(alvo.comp)} marcado como NÃO PAGOU (fica vermelho).`); })
      .catch((e) => setErroInformar(msgErro(e)))
      .finally(() => setMarcandoNao(false));
  };
  const enviarInformar = (valor: number, comprovante: { nome: string; url: string }, total: number) => {
    const alvo = alvoDaCelula(informar);
    if (!alvo || lancarMut.isPending) return;
    setErroInformar('');
    lancarMut.mutate({ leadId: alvo.leadId, comp: alvo.comp, valor, comprovante }, {
      onSuccess: (ent) => {
        sobrepor({
          linhaId: alvo.linha.id, colunaId: alvo.coluna.id,
          e: { st: 'pendente', id: ent.id, v: valor, por: ent.por ?? '', em: ent.quando || new Date().toISOString(), dec: null, mot: null, cp: true },
        });
        setInformar(null);
        setAviso(`Pagamento de ${fmtBRL(total)} de ${alvo.nome} (${mesAno(alvo.comp)}) enviado ao financeiro${total !== valor ? ` — ${fmtBRL(valor)} do escritório` : ''}. A célula fica amarela até a aprovação.`);
      },
      onError: (e) => setErroInformar(msgErro(e)),
    });
  };
  const aprovarEntrada = (id: string) => {
    if (confirmarMut.isPending) return;
    const x = acharEntrada(id);
    confirmarMut.mutate(id, {
      onSuccess: () => {
        // o banco grava o pagamento e o gatilho escreve o valor na célula: igual aqui, na hora
        if (x) sobrepor({ linhaId: x.linha.id, colunaId: x.coluna.id, e: null, t: fmtValorBR(x.ent.v) });
        setVerComp((v) => (v?.id === id ? null : v));
        setAviso(x
          ? `Aprovado: ${fmtBRL(x.ent.v)} de ${x.nome} (${mesAno(x.comp)}) lançado como pago — a célula fica verde.`
          : 'Pagamento aprovado e lançado como pago.');
      },
      onError: (e) => setAviso(msgErro(e)),
    });
  };
  const pedirRecusa = (id: string) => { setErroRecusar(''); setRecusarId(id); };
  const confirmarRecusa = (motivo: string) => {
    const id = recusarId;
    if (!id || recusarMut.isPending) return;
    const x = acharEntrada(id);
    const mot = motivo.trim();
    setErroRecusar('');
    recusarMut.mutate({ id, motivo: mot || undefined }, {
      onSuccess: () => {
        if (x) sobrepor({ linhaId: x.linha.id, colunaId: x.coluna.id, e: { ...x.ent, st: 'recusada', dec: new Date().toISOString(), mot: mot || null } });
        setRecusarId(null);
        setVerComp((v) => (v?.id === id ? null : v));
        setAviso(x
          ? `Recusado: ${fmtBRL(x.ent.v)} de ${x.nome} (${mesAno(x.comp)}) — quem informou foi avisado; a célula fica vermelha.`
          : 'Pagamento recusado — quem informou foi avisado.');
      },
      onError: (e) => setErroRecusar(msgErro(e)),
    });
  };
  /* comprovante: igual à aba Financeiro — demo = data URL; real = URL assinada e curta do path.
     A célula fica amarela pelo planilha_versao ANTES do dadosQ (polling de 30 s; entradas
     saiu do realtime na mig 51) trazer a entrada: se ela ainda não está lá, relê e procura
     de novo em vez de pedir para tentar outra vez */
  const verComprovante = async (id: string) => {
    if (abrindoComp.current) return;
    abrindoComp.current = true;
    try {
      let ent = dadosQ?.pendentes.find((e) => e.id === id);
      if (!ent) ent = (await dadosQuery.refetch()).data?.pendentes.find((e) => e.id === id);
      if (!ent) { setAviso('Este pagamento não está mais aguardando o financeiro — a planilha vai atualizar.'); relerPlanilha(); return; }
      const cp = ent.comprovante;
      if (!cp) { setAviso('Este pagamento foi informado sem comprovante.'); return; }
      const nome = cp.path ? nomeDoPath(cp.path) : cp.nome;
      const url = cp.path ? await assinarMut.mutateAsync(cp) : cp.url;
      setErroVerComp('');
      setVerComp({ id, nome, url, cp });
    } catch (e) {
      setAviso(msgErro(e));
    } finally {
      abrindoComp.current = false;
    }
  };
  /* "Abrir em nova aba": a URL assinada dura 60 s — assina DE NOVO no clique. A aba abre já
     no clique (depois de um await o navegador bloquearia o pop-up) e recebe a URL quando chega */
  const abrirCompEmAba = () => {
    const vc = verComp;
    if (!vc?.cp.path) return;
    setErroVerComp('');
    const w = window.open('', '_blank');
    if (w) {
      try { w.opener = null; w.document.title = 'Comprovante'; w.document.body.textContent = 'Abrindo o comprovante…'; } catch { /* aba sem acesso: segue */ }
    }
    assinarMut.mutateAsync(vc.cp).then(
      (url) => { if (w && !w.closed) w.location.href = url; else window.open(url, '_blank', 'noopener,noreferrer'); },
      (e) => { w?.close(); setErroVerComp(msgErro(e)); },
    );
  };
  const fecharVerComp = () => { setVerComp(null); setErroVerComp(''); };

  const aplicarMover = (diaDe: number, diaPara: number) => {
    if (diaDe === diaPara) return;
    turmaMut.mutate({ diaDe, diaPara }, {
      onSuccess: (res) => {
        relerPlanilha();
        const de = `D${d2(diaDe)}`; const para = `D${d2(diaPara)}`;
        setFBloco((f) => (f === de ? para : f));
        const extra = res.origemDatas.length ? ` As ${res.origemDatas.length} data(s) manual(is) do calendário do dia antigo voltaram ao automático (o Desfazer as repõe).` : '';
        setAviso(`Ciclo movido para o dia ${d2(diaPara)} — todos os clientes agora vencem no dia ${d2(diaPara)} (planilha e disparos atualizados).${extra}`);
      },
      onError: (e) => setAviso(msgErro(e)),
    });
  };
  const importarNoCiclo = (dia: number, r: Leitura, fim: (ok: boolean, erro?: string) => void) => {
    importarNoMut.mutate({ linhas: r.linhas, comps: r.comps, situacao: 'cancelado', dia }, {
      onSuccess: (res) => {
        relerPlanilha();
        setAviso(`${res.leads} cliente${res.leads === 1 ? '' : 's'} importado${res.leads === 1 ? '' : 's'} em cobrança no ciclo D${d2(dia)}.${res.celulasIgnoradas ? ` ⚠ ${res.celulasIgnoradas} célula(s) com valor não reconhecido foram ignoradas — confira a planilha.` : ''}`);
        fim(true);
      },
      onError: (e) => { setAviso(msgErro(e)); fim(false, msgErro(e)); },
    });
  };

  /* ---------- transição: sem a planilha nova, a gestão antiga ---------- */
  if (semRpc) return null; // o pai troca pela gestão antiga antes de pintar (useLayoutEffect acima)
  if (legado) return <GestaoLegada semRpc={false} gestor={gestor} papel={papel} />;

  const classeRaiz = cheia ? 'gp-raiz gp-cheia' : 'gp-raiz';
  const estiloRaiz = cheia || altura == null ? undefined : { height: altura };

  return (
    <div ref={raizRef} className={classeRaiz} style={estiloRaiz}>
      {aviso && (
        <div className="gs-aviso gp-aviso" role="status">
          <span>{aviso}</span>
          <button type="button" className="gs-aviso-x" onClick={() => setAviso('')} aria-label="Fechar aviso">×</button>
        </div>
      )}

      {/* crítica 12/11: título e ações numa linha só — "Lançar pagamento" é a ação do dia (a única
          dourada); as ações raras ficam no "Mais"; a tela cheia é só o ícone */}
      <div className="ph gp-ph">
        <div><h2>Gestão de cobranças</h2></div>
        <div className="acoes gp-acoes">
          {salvando && <span className="gp-salvando" role="status">Salvando…</span>}
          {isRevizaMode && <SeloAoVivo />}
          {/* sincronização com a planilha do Google: só aparecem quando ela está configurada */}
          <SeloSync />
          <BotaoSincronizacao papel={papel} gestor={gestor} />
          {/* a tela cheia cobre o topo: o Desfazer global vem junto para cá */}
          {cheia && (isRevizaMode || isDemoMode) && <span className="gp-desfazer"><BotaoDesfazer /></span>}
          {gestor && dados && dados.linhas.length > 0 && (
            <BotaoSec onClick={() => exportarPlanilhaXlsx(dados)} title="Baixa a planilha em .xlsx, igual à tela (sem senhas)"><IcT d={IC.exportar} />Exportar</BotaoSec>
          )}
          {(() => {
            const itens: ItemMenuMais[] = [];
            if (finMais && dados) itens.push({
              rotulo: 'Novo mês', icone: IC.novoMes, desabilitado: salvando, aoClicar: () => setNovoMesOpen(true),
              dica: `Abre a coluna do mês seguinte em todos os ciclos (${(planoMes && rotuloNovoMes(planoMes)) || 'próximo mês'})`,
            });
            if (dados) itens.push({ rotulo: 'Mostrar ou ocultar colunas', icone: IC.colunas, aoClicar: alternarCols });
            if (podeDirecionar) itens.push({
              rotulo: 'Mover para Cancelados', icone: IC.fechar, separar: true, desabilitado: !dadosQ,
              aoClicar: () => setMoverCanc(clientesSelRef.current?.() ?? []),
              dica: 'Leva os clientes das linhas selecionadas para Cancelados (saem da Gestão e da régua; nada é apagado). Selecione várias linhas de uma vez, se precisar',
            });
            if (gestor) itens.push({ rotulo: 'Lixeira', icone: IC.lixeira, separar: !podeDirecionar, aoClicar: () => setLixeiraOpen(true), dica: 'Clientes excluídos — restaure quem saiu por engano' });
            if (!itens.length) return null;
            return (
              <MenuMais itens={itens} titulo="Mais ações" className="gp-cols-wrap"
                extra={colsAberto && (
                  <div ref={colsRef} className={colsEsq ? 'gp-cols-pop gp-cols-pop-esq' : 'gp-cols-pop'} role="dialog" aria-label="Mostrar ou ocultar colunas">
                    <div className="gp-cols-nota">{finMais ? 'Ocultar vale para toda a equipe.' : 'Ocultar vale só para você.'}</div>
                    {colunasOrd.map((c, i) => {
                      const trava = !finMais && ocultasEquipe.has(c.id);
                      return (
                        <label key={c.id} className={trava ? 'gp-cols-item gp-cols-trava' : 'gp-cols-item'}
                          title={trava ? 'Oculta pela equipe — só o financeiro, o gestor ou o administrador mostra de novo.' : undefined}>
                          <input type="checkbox" checked={!c.oculta} disabled={trava} onChange={() => alternarColuna(c)} />
                          <span className="gp-cols-letra num">{letraColuna(i)}</span>
                          <span className="gp-cols-tit">{c.titulo || '(sem título)'}</span>
                          {trava && <span className="gp-cols-tag">oculta pela equipe</span>}
                        </label>
                      );
                    })}
                  </div>
                )} />
            );
          })()}
          <button type="button" className={`p-btn btn-sec gp-cheia-bt${cheia ? ' on' : ''}`} onClick={() => setCheia((v) => !v)}
            title={cheia ? 'Sair da tela cheia (Esc)' : 'Tela cheia'} aria-label={cheia ? 'Sair da tela cheia' : 'Tela cheia'} aria-pressed={cheia}>
            <IcT d={cheia ? IC.sair : IC.cheia} mr={0} />
          </button>
          {podeLancar && (
            <BotaoPrimario onClick={abrirLancar} disabled={!dadosQ}
              title="Informa o pagamento de um mês com o comprovante. Na célula de um mês em aberto do cliente, vai direto para ela; fora dela, escolha o cliente e o mês">
              <IcT d={IC_PATH.pagamento} />Lançar pagamento
            </BotaoPrimario>
          )}
        </div>
      </div>

      {aguardando.length > 0 && podeDirecionar && (
        <button type="button" className="cm-avisonum gp-banner" onClick={() => setDirOpen(true)}>
          <span className="cm-avisonum-ic" aria-hidden><IcT d={IC.atencao} s={16} mr={0} /></span>
          <span><b>{aguardando.length} cliente{aguardando.length === 1 ? '' : 's'}</b> aguardando direcionamento de ciclo — o débito parou, mas ainda não {aguardando.length === 1 ? 'entrou' : 'entraram'} em nenhum ciclo de cobrança.</span>
          <span className="cm-avisonum-cta">Direcionar</span>
        </button>
      )}

      {/* faixa de filtros: busca e comercial à esquerda, ciclos no resto da linha */}
      <div className="gp-barra gp-linha-chips">
        <input ref={buscaRef} className="inp gp-busca" type="search" placeholder="Buscar nome, NB ou CPF…" value={busca}
          onChange={(e) => setBusca(e.target.value)} aria-label="Buscar na planilha" />
        <select className="inp gp-sel" value={comAtivo} onChange={(e) => setFCom(e.target.value)} aria-label="Filtrar por comercial">
          <option value="">Comercial: todos</option>
          {comerciaisFolha.map((c) => <option key={c.k} value={c.k}>{c.v}</option>)}
        </select>
        {filtro && <span className="gp-conta num">{nVis} no filtro</span>}
        <SeletorCiclos
          itens={[
            ...chips.map(({ b, n, ag }) => ({
              id: b.id, rotulo: b.id === 'NOVOS' ? 'Novos' : b.id, n, ag, dia: b.dia ?? null, vazio: n === 0 && ag === 0,
              dica: `${b.dia ? `Ciclo ${b.id} · vence dia ${d2(b.dia)}` : 'Novos · débito ainda ativo (sem ciclo)'} · ${n} cliente${n === 1 ? '' : 's'}${b.compBase ? ` · 1º mês ${rotuloMes(b.compBase)}` : ''}${ag ? ` · ${ag} aguardando ciclo (o ciclo foi esvaziado)${podeDirecionar ? ' — direcione pelo aviso acima' : ''}` : ''}`,
            })),
            ...abertosSemBloco.map((dd0) => ({
              id: `aberto-${dd0}`, rotulo: `D${d2(dd0)}`, n: 0, ag: 0, dia: dd0, vazio: true, aberto: true,
              dica: `Ciclo D${d2(dd0)} aberto, ainda sem clientes — o bloco aparece na planilha com o primeiro cliente direcionado.${finMais ? ' Clique para gerenciar os ciclos.' : ''}`,
            })),
          ]}
          total={nClientes}
          ativo={blocoAtivo}
          aoEscolher={(id) => {
            if (id && id.startsWith('aberto-')) {
              const dd0 = Number(id.slice(7));
              if (finMais) setCiclosOpen(true);
              else setAviso(`O ciclo D${d2(dd0)} está aberto, ainda sem clientes — ele aparece na planilha quando o primeiro cliente for direcionado para ele.`);
              return;
            }
            clicarChip(id);
          }}
          aoGerenciar={finMais && dadosQ ? () => setCiclosOpen(true) : undefined}
        />
      </div>

      <div className="gp-grade">
        {plQ.isLoading || !dadosGrade ? (
          plQ.isError ? (
            <CardVidro spot>
              <EstadoVazio titulo="Não foi possível carregar a planilha" descricao={plQ.error?.message || 'Verifique a conexão e tente novamente.'}
                acao={{ rotulo: 'Tentar de novo', onClick: () => { void plQ.refetch(); } }} />
            </CardVidro>
          ) : !dadosQ && dadosQuery.isError ? (
            <CardVidro spot>
              <EstadoVazio titulo="Não foi possível carregar os clientes" descricao={dadosQuery.error?.message || 'Verifique a conexão e tente novamente.'}
                acao={{ rotulo: 'Tentar de novo', onClick: () => { void dadosQuery.refetch(); } }} />
            </CardVidro>
          ) : <div className="fin-vazio">Carregando a planilha…</div>
        ) : (
          <PlanilhaExcel
            dados={dadosGrade}
            senhas={senhasGrade ?? null}
            podeVerSenha={podeRevelarGrade}
            perms={perms}
            filtro={filtro}
            destaque={buscaAdiada}
            onSalvar={onSalvar}
            onColuna={(op) => colOps.mutateAsync(op)}
            onNovoMes={finMais ? () => setNovoMesOpen(true) : undefined}
            onLinha={(op) => linOps.mutateAsync(op)}
            onAbrirFicha={(leadId) => setFichaId(leadId)}
            onBuscar={focarBusca}
            irParaBloco={irPara}
            rodapeExtra={<LegendaEstados className="gp-legenda" />}
            onInformarPagamento={abrirInformar}
            onAprovarEntrada={aprovarEntrada}
            onRecusarEntrada={pedirRecusa}
            onVerComprovante={(id) => { void verComprovante(id); }}
            parteDoValor={parteDoValor}
            onMoverCancelados={podeDirecionar ? (ids) => setMoverCanc(ids) : undefined}
            clientesSelRef={clientesSelRef}
            onCelulaAtiva={(a) => { celulaAtiva.current = a; }}
            focarRef={focarGradeRef}
          />
        )}
      </div>

      <ModalV2 aberto={dirOpen} aoFechar={() => setDirOpen(false)} largura={640} titulo="Direcionar para o ciclo"
        rodape={<BotaoSec onClick={() => setDirOpen(false)}>Fechar</BotaoSec>}>
        {aguardando.length === 0 ? <div className="fin-vazio">Ninguém aguardando — todos os clientes estão em um ciclo.</div> : (
          <>
            <p className="cm-hint" style={{ margin: '0 0 12px' }}>A data ao lado de cada ciclo é a <b>próxima cobrança</b> daquele ciclo (fim de semana e feriado já deslocados). Escolha vendo a data e aplique.</p>
            <div className="an-dir-lista">
              {aguardando.map((l) => {
                const dia = (dirDias[l.id] != null && ciclosDisp.includes(dirDias[l.id])) ? dirDias[l.id] : (ciclosDisp[0] ?? 0);
                return (
                  <div className="an-dir-row" key={l.id}>
                    <div className="an-dir-nm">{l.nome}<span className="num">{l.comercial || '—'} · parcela {fmtBRL(l.valor)}{l.dataParou ? ` · parou ${dataBRcurta(l.dataParou)}` : ''}</span></div>
                    <select className="inp" value={dia} onChange={(e) => setDirDias((m) => ({ ...m, [l.id]: Number(e.target.value) }))}>
                      {ciclosDisp.map((d) => <option key={d} value={d}>D{d2(d)} — cobra {dataBRcurta(proximaDoCiclo(d))} ({diaSemanaBR(proximaDoCiclo(d))})</option>)}
                    </select>
                    <BotaoPrimario onClick={() => direcionar(l, dia)} disabled={editarMut.isPending || !(dia >= 1)}>Aplicar</BotaoPrimario>
                    <BotaoSec mini onClick={() => voltarNovos(l)} disabled={editarMut.isPending} title="Marcou parado por engano? O cliente volta para os Novos com o débito ativo.">Voltar para Novos</BotaoSec>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </ModalV2>
      {selL && (
        <FichaLead key={selL.id} inicial={selL} comps={comps} ciclos={ciclosDisp} comerciais={comerciais}
          gestor={podeOperar} podeGrade={papel === 'comercial' ? false : podeCelula} podeAprovar={podeDirecionar} aoSalvar={salvarLead}
          parteDoMes={parteCom ? (comp, v) => parteCom(selL.comercial, comp, v) : undefined}
          datasPelaPlanilha={dicaDatasFicha}
          aoExcluir={gestor ? () => excluirLead(selL.id) : undefined}
          aoVoltarNovos={podeDirecionar ? () => { voltarNovos(selL); setFichaId(null); } : undefined}
          aoFechar={() => setFichaId(null)} />
      )}
      {novoMesOpen && dados && (
        <NovoMesModal dados={dados} aoFechar={() => setNovoMesOpen(false)}
          criar={(op) => colOps.mutateAsync(op)} aoCriado={setAviso}
          conferir={async () => { await qc.refetchQueries({ queryKey: chavesPlanilha.planilha, exact: true }); return qc.getQueryData<PlDados>(chavesPlanilha.planilha); }} />
      )}
      {moverCanc && dadosQ && (
        <MoverCancelados candidatos={glinhas} iniciais={moverCanc}
          aoFechar={() => { setMoverCanc(null); focarGradeRef.current?.(); }}
          aoMovido={(m) => { setMoverCanc(null); setAviso(m); focarGradeRef.current?.(); }} />
      )}
      {lixeiraOpen && <LixeiraClientes aoAvisar={setAviso} aoFechar={() => { setLixeiraOpen(false); relerPlanilha(); }} />}
      {/* seletor de cliente e mês (só ESCOLHE): o envio é sempre pelo InformarPagamento da célula */}
      {lancarOpen && <LancarPagamento linhas={glinhas} comps={comps} rotMes={rotuloMes} clienteInicial={lancarLead}
        aoEscolher={lancarPagamento} aoFechar={() => setLancarOpen(false)}
        mesesDe={mesesParaInformar} />}
      {(() => {
        const alvo = informar ? alvoDaCelula(informar) : null;
        if (!informar || !alvo) return null;
        return (
          <InformarPagamento key={`${informar.linhaId}|${informar.colunaId}`} pctSituacao={pctSituacao}
            nome={alvo.nome} mes={mesAno(alvo.comp)} ciclo={alvo.ciclo} valorDigitado={informar.valor != null}
            valorInicial={informar.valor ?? (() => {
              // o campo é o que o CLIENTE pagou: o último pago (líquido do escritório) volta pro
              // total do cliente com a % do mês DELE — o total não muda quando a % muda
              const s = alvo.sugerido; const com = btrim(leadPorId.get(alvo.leadId)?.comercial);
              if (s == null || !com || com === '—' || !alvo.sugeridoComp) return s;
              return totalPagoPeloCliente(s, pctNoMes(histComissao, pctsComissao, com, alvo.sugeridoComp));
            })()}
            divisao={(() => {
              const lead = leadPorId.get(alvo.leadId); const com = btrim(lead?.comercial);
              if (!com || com === '—') return null;
              const pct = pctNoMes(histComissao, pctsComissao, com, alvo.comp);   // a % que vale NO MÊS do pagamento
              // esperado = a mensalidade (meia parcela) — base do aviso de valor fora do normal
              return { comercial: com, pct, esperado: lead && lead.valor > 0 ? Math.round((lead.valor / 2) * 100) / 100 : null };
            })()}
            recusado={alvo.estado.tipo === 'recusado' ? alvo.estado.entrada ?? null : null}
            enviando={lancarMut.isPending} erro={erroInformar}
            aoNaoPagou={alvo.estado.tipo !== 'nao_pagou' && perms.editarMes(alvo.linha) ? naoPagouInformar : undefined} marcando={marcandoNao}
            aoEnviar={enviarInformar} aoFechar={() => { if (!lancarMut.isPending && !marcandoNao) setInformar(null); }} />
        );
      })()}
      {recusarId && (() => {
        const x = acharEntrada(recusarId);
        return (
          <RecusarPagamento key={recusarId}
            resumo={x ? `${x.nome} · ${mesAno(x.comp)} · ${valorComTotal(x.leadId, x.comp, x.ent.v)}` : 'Pagamento informado'}
            quem={x ? x.ent.por.replace(/\s*\([^)]*\)\s*$/, '').trim() : ''}
            enviando={recusarMut.isPending} erro={erroRecusar}
            aoRecusar={confirmarRecusa} aoFechar={() => { if (!recusarMut.isPending) setRecusarId(null); }} />
        );
      })()}
      {verComp && (() => {
        const x = acharEntrada(verComp.id);
        const aberta = !!x && x.ent.st === 'pendente' && podeAprovarPag;
        const imagem = /^data:image\//.test(verComp.url) || /\.(png|jpe?g|gif|webp)$/i.test(verComp.nome);
        return (
          <ModalV2 aberto aoFechar={fecharVerComp} largura={760}
            titulo={<div>Comprovante<div className="mod-sub">{x ? `${x.nome} · ${mesAno(x.comp)} · ${valorComTotal(x.leadId, x.comp, x.ent.v)}` : verComp.nome}</div></div>}
            rodape={(
              <>
                {verComp.cp.path && (
                  <button type="button" className="p-btn btn-sec gp-comp-abrir" onClick={abrirCompEmAba}>
                    <IcT d={IC.externo} />Abrir em nova aba
                  </button>
                )}
                <span className="gp-esp" />
                <BotaoSec onClick={fecharVerComp}>Fechar</BotaoSec>
                {aberta && (
                  <>
                    <button type="button" className="p-btn btn-perigo" onClick={() => { const id = verComp.id; setVerComp(null); setErroVerComp(''); pedirRecusa(id); }}>Recusar…</button>
                    <BotaoPrimario onClick={() => aprovarEntrada(verComp.id)} disabled={confirmarMut.isPending}>
                      {confirmarMut.isPending ? 'Aprovando…' : 'Aprovar pagamento'}
                    </BotaoPrimario>
                  </>
                )}
              </>
            )}>
            {erroVerComp && <p className="gs-erro" role="alert">{erroVerComp}</p>}
            {imagem
              ? <img alt="Comprovante" src={verComp.url} className="fin-comp-img" />
              : <iframe title="Comprovante" src={verComp.url} className="fin-comp-view" />}
          </ModalV2>
        );
      })()}
      {ciclosOpen && (
        <GerenciarCiclos turmas={turmas} abertos={dadosQ?.ciclosAbertos ?? []} aviso={aviso} posDe={posDe} aoMover={aplicarMover}
          podeImportar={gestor} importando={importarNoMut.isPending} aoImportarUm={importarNoCiclo}
          salvando={turmaMut.isPending || esvaziarMut.isPending || esvaziarUmMut.isPending}
          totalCobranca={glinhas.filter((l) => l.dia > 0 && l.situacao === 'cancelado').length}
          totalNovos={glinhas.filter((l) => l.dia > 0 && l.situacao !== 'cancelado').length}
          novosPorDia={(dia) => glinhas.filter((l) => l.dia === dia && l.situacao !== 'cancelado').length}
          datasManuaisDe={(dia) => {
            const ag = new Date(); const compCorr = `${ag.getFullYear()}-${d2(ag.getMonth() + 1)}`;
            const porComp = dadosQ?.ciclosDatas?.[String(dia)] ?? {};
            return Object.entries(porComp).filter(([comp, w]) => comp >= compCorr && (w.cobranca || w.inicio || w.fim)).map(([comp]) => rotuloMes(comp));
          }}
          aoAbrir={(dia) => abrirCicloMut.mutate(dia, {
            onSuccess: () => setAviso(`Ciclo D${d2(dia)} aberto (vazio) — direcione ou mova clientes pra ele.`),
            onError: (e) => setAviso(msgErro(e)),
          })}
          aoFecharDia={(dia) => fecharCicloMut.mutate(dia, {
            onSuccess: () => setAviso(`Ciclo D${d2(dia)} fechado.`),
            onError: (e) => setAviso(msgErro(e)),
          })}
          aoEsvaziarUm={(dia) => esvaziarUmMut.mutate(dia, {
            onSuccess: (res) => { relerPlanilha(); setFBloco((f) => (f === `D${d2(dia)}` ? null : f)); setAviso(`Ciclo D${d2(dia)} esvaziado — ${res.afetados.length} clientes agora estão "aguardando ciclo". O ciclo continua aberto com as datas dele; o Desfazer do topo reverte.`); },
            onError: (e) => setAviso(msgErro(e)),
          })}
          aoEsvaziar={() => esvaziarMut.mutate(undefined, {
            onSuccess: (res) => { relerPlanilha(); setFBloco(null); setAviso(`Ciclos esvaziados — ${res.afetados.length} clientes agora estão "aguardando ciclo". Abra os dias que quiser e redistribua; o Desfazer do topo reverte tudo.`); },
            onError: (e) => setAviso(msgErro(e)),
          })}
          aoFechar={() => setCiclosOpen(false)} />
      )}
    </div>
  );
}

/* ================= pagamento pela célula: otimista, informar e recusar ================= */

/** estado OTIMISTA de uma célula de mês depois de informar/aprovar/recusar: `e` = a entrada
    da célula (null = sai), `t` = texto (ausente = não mexe). Sai quando a folha relida chega. */
interface Sobreposicao { linhaId: string; colunaId: string; ts: number; e: EntradaCel | null; t?: string | null }
function aplicarSobre(d: PlDados, xs: readonly Sobreposicao[]): PlDados {
  const porLinha = new Map<string, Sobreposicao[]>();
  for (const x of xs) { const a = porLinha.get(x.linhaId); if (a) a.push(x); else porLinha.set(x.linhaId, [x]); }
  return {
    ...d,
    linhas: d.linhas.map((l) => {
      const a = porLinha.get(l.id);
      if (!a) return l;
      const c = { ...l.c };
      const e: Record<string, EntradaCel> = { ...(l.e ?? {}) };
      for (const x of a) {
        if (x.e) e[x.colunaId] = x.e; else delete e[x.colunaId];
        if (x.t !== undefined) {
          const s = c[x.colunaId]?.s ?? null;
          if (x.t == null && !s) delete c[x.colunaId]; else c[x.colunaId] = { t: x.t, s };
        }
      }
      const n: PlLinha = { ...l, c };
      if (Object.keys(e).length) n.e = e; else delete n.e;
      return n;
    }),
  };
}

const fmtValorCampo = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
interface ArqComprovante { original: string; nome: string; tam: number; tipo: string; url: string }

/** Modal "Informar pagamento" (célula de mês de cliente): valor + comprovante OBRIGATÓRIO
    (arrastar e soltar, clicar ou colar um print; imagem ou PDF até 5 MB). Vai para o
    financeiro conferir; a célula fica amarela até a aprovação. */
function InformarPagamento({ nome, mes, ciclo, valorInicial, valorDigitado, divisao, pctSituacao = 'ok', recusado, enviando, erro, aoEnviar, aoFechar, aoNaoPagou, marcando }: {
  nome: string; mes: string; ciclo: string;
  /** a % da comissão já chegou? Sem ela a divisão não é calculada e o envio fica travado */
  pctSituacao?: 'ok' | 'carregando' | 'erro';
  /** o que o CLIENTE pagou (dono 27/10: "116 tem que estar no 58") — o campo é o total do cliente */
  valorInicial: number | null;
  /** comercial do cliente e a % dele no mês: embaixo do campo, quanto fica pro escritório (o que a
      célula guarda e o financeiro aprova) e quanto é do comercial. `esperado` = a mensalidade
      (meia parcela) — base do aviso de valor fora do normal */
  divisao?: { comercial: string; pct: number; esperado?: number | null } | null;
  /** o valor veio do que a pessoa digitou na célula (e não do último pago do cliente) */
  valorDigitado?: boolean;
  /** a última recusa deste mês (célula vermelha): o motivo aparece antes de informar de novo */
  recusado: EntradaCel | null;
  enviando: boolean; erro: string;
  /** `valor` = LÍQUIDO DO ESCRITÓRIO (vai pra célula); `total` = o que o cliente pagou (só pro aviso) */
  aoEnviar: (valor: number, comprovante: { nome: string; url: string }, total: number) => void;
  aoFechar: () => void;
  /** "Não pagou" (dono 25/09): marca o mês como NÃO PAGOU (vermelho). Ausente = sem permissão */
  aoNaoPagou?: () => void;
  marcando?: boolean;
}) {
  const [modo, setModo] = useState<'pagou' | 'nao'>('pagou');
  const ocupado = enviando || !!marcando;
  const [valor, setValor] = useState(() => (valorInicial != null && valorInicial > 0 ? fmtValorCampo(valorInicial) : ''));
  const [tocou, setTocou] = useState(false);
  // a sugestão depende da % (que pode chegar depois de abrir): atualiza enquanto a pessoa não digitou
  const editou = useRef(false);
  useEffect(() => {
    if (!editou.current && valorInicial != null && valorInicial > 0) setValor(fmtValorCampo(valorInicial));
  }, [valorInicial]);
  const [arq, setArq] = useState<ArqComprovante | null>(null);
  const [erroArq, setErroArq] = useState('');
  const [lendo, setLendo] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const leitura = useRef(0);
  const v = valorBR(valor);   // o que o cliente pagou
  const valorOk = v != null && v > 0;
  // sem comercial no cliente não há comissão: o valor todo é do escritório
  const semPct = !!divisao && pctSituacao !== 'ok';
  const liquido = valorOk && v != null && !semPct ? (divisao ? liquidoDoTotal(v, divisao.pct) : Math.round(v * 100) / 100) : null;
  // a divisão arredonda a parte do comercial: o total que fica registrado pode sair 1 centavo diferente
  const totalReg = liquido != null ? (divisao ? totalPagoPeloCliente(liquido, divisao.pct) : liquido) : null;
  const pronto = valorOk && liquido != null && liquido > 0 && !!arq && !lendo && !enviando;

  const escolherRef = useRef<(f: File | null | undefined) => void>(() => undefined);
  const escolher = (f: File | null | undefined) => {
    if (!f || enviando) return;
    setErroArq('');
    const tipo = tipoComprovante(f);
    if (!tipo) { setErroArq('Formato não aceito. Envie uma imagem (PNG, JPG, WEBP ou GIF) ou um PDF.'); return; }
    if (!f.size) { setErroArq('O arquivo está vazio.'); return; }
    if (f.size > LIMITE_COMPROVANTE) { setErroArq(`O arquivo tem ${fmtTam(f.size)} — o limite é 5 MB.`); return; }
    const n = ++leitura.current;
    setLendo(true);
    const r = new FileReader();
    r.onload = () => {
      if (n !== leitura.current) return;
      // arquivo sem MIME (alguns celulares): o data URL sai genérico e o Storage recusa — acerta o tipo
      const url = String(r.result).replace(/^data:[^;,]*/, `data:${tipo}`);
      setArq({ original: f.name || 'comprovante', nome: nomeSeguro(f.name), tam: f.size, tipo, url });
      setLendo(false);
    };
    r.onerror = () => { if (n === leitura.current) { setErroArq('Não consegui ler o arquivo. Tente de novo.'); setLendo(false); } };
    r.readAsDataURL(f);
  };
  escolherRef.current = escolher;
  /* colar um print (Ctrl/Cmd+V com imagem na área de transferência) também anexa. Mas copiar
     células no Excel leva o TEXTO e uma IMAGEM das células juntos: colado num campo (ex.: o
     valor "263,81"), o texto entra no campo e nada é anexado. No resto (área de soltar, botões,
     fundo do modal) o arquivo anexa; clipboard só com arquivo (print de tela) anexa sempre */
  useEffect(() => {
    const colar = (e: ClipboardEvent) => {
      const cd = e.clipboardData;
      const f = cd?.files?.[0];
      if (!cd || !f) return;
      const temTexto = Array.from(cd.types).some((t) => t === 'text/plain' || t === 'text/html');
      const alvo = e.target as HTMLElement | null;
      const noCampo = !!alvo && (alvo.isContentEditable || !!alvo.closest?.('input, textarea'));
      if (temTexto && noCampo) return;
      e.preventDefault();
      escolherRef.current(f);
    };
    window.addEventListener('paste', colar);
    return () => window.removeEventListener('paste', colar);
  }, []);
  /* soltar o arquivo FORA da área (véu, cabeçalho, cartão do arquivo já anexado) não pode deixar
     o navegador abrir o arquivo na aba e derrubar o app (e o valor digitado): aceita o drop em
     qualquer lugar e troca o arquivo. Na área de soltar o React já tratou (preventDefault) */
  useEffect(() => {
    const temArquivo = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');
    const sobre = (e: DragEvent) => {
      if (!temArquivo(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    const soltarFora = (e: DragEvent) => {
      if (e.defaultPrevented || !temArquivo(e)) return;
      e.preventDefault();
      setArrastando(false);
      escolherRef.current(e.dataTransfer?.files?.[0]);
    };
    window.addEventListener('dragover', sobre);
    window.addEventListener('drop', soltarFora);
    return () => { window.removeEventListener('dragover', sobre); window.removeEventListener('drop', soltarFora); };
  }, []);

  const enviar = () => { if (pronto && liquido != null && totalReg != null && arq) aoEnviar(liquido, { nome: arq.nome, url: arq.url }, totalReg); };
  const soltar = (e: RDragEvent<HTMLDivElement>) => { e.preventDefault(); setArrastando(false); escolher(e.dataTransfer.files?.[0]); };
  const abrirSeletor = () => { if (!enviando) inputRef.current?.click(); };
  const ehImagem = !!arq && arq.tipo.startsWith('image/');

  return (
    <ModalV2 aberto aoFechar={aoFechar} fecharNoVeu={!ocupado} largura={480}
      titulo={<div>Informar pagamento<div className="mod-sub">{nome} · {mes}{ciclo ? ` · ${ciclo}` : ''}</div></div>}
      rodape={(
        <>
          <BotaoSec onClick={aoFechar} disabled={ocupado}>Cancelar</BotaoSec>
          {modo === 'nao' ? (
            <BotaoPrimario className="gp-inf-bt-nao" onClick={() => aoNaoPagou?.()} disabled={ocupado}>
              {marcando ? 'Marcando…' : 'Marcar como não pago'}
            </BotaoPrimario>
          ) : (
            <BotaoPrimario onClick={enviar} disabled={!pronto}
              title={pronto ? undefined : semPct ? 'Aguarde a % da comissão carregar' : !valorOk ? 'Informe o valor pago' : !arq ? 'Anexe o comprovante' : undefined}>
              {enviando ? 'Enviando…' : 'Enviar para o financeiro'}
            </BotaoPrimario>
          )}
        </>
      )}>
      <div className="gp-inf">
        {aoNaoPagou && (
          <div className="gp-inf-modo" role="radiogroup" aria-label="O cliente pagou este mês?">
            <button type="button" role="radio" aria-checked={modo === 'pagou'} className={modo === 'pagou' ? 'on ok' : ''} disabled={ocupado} onClick={() => setModo('pagou')}>
              <IcT d={IC.check} s={14} mr={0} />Pagou
            </button>
            <button type="button" role="radio" aria-checked={modo === 'nao'} className={modo === 'nao' ? 'on nao' : ''} disabled={ocupado} onClick={() => setModo('nao')}>
              <IcT d={IC.fechar} s={14} mr={0} />Não pagou
            </button>
          </div>
        )}
        {modo === 'nao' ? (
          <div className="gp-inf-naopagou">
            <span className="gp-inf-naopagou-am" aria-hidden="true">NÃO PAGOU</span>
            <div>
              <b>O mês fica vermelho como “NÃO PAGOU”.</b>
              <span>Não precisa de valor nem de comprovante. Se o cliente pagar depois, é só informar o pagamento nesta mesma célula.</span>
            </div>
          </div>
        ) : (<>
        {recusado && (
          <div className="gp-inf-recusa" role="note">
            <b>O financeiro recusou o último informe deste mês</b> ({fmtBRL(divisao ? totalPagoPeloCliente(recusado.v, divisao.pct) : recusado.v)} pagos pelo cliente{recusado.dec ? `, em ${dataBRcurta(recusado.dec)}` : ''})
            {recusado.mot ? ` — ${recusado.mot}` : ''}. Confira com o cliente antes de enviar de novo.
          </div>
        )}

        <div className={`campo gp-inf-campo${tocou && !valorOk ? ' invalida' : ''}`}>
          <label htmlFor="gp-inf-valor">Valor que o cliente pagou</label>
          <div className="gp-inf-valor">
            <span className="gp-inf-rs" aria-hidden="true">R$</span>
            <input id="gp-inf-valor" className="inp num" inputMode="decimal" autoComplete="off" placeholder="0,00" value={valor}
              disabled={enviando} aria-invalid={tocou && !valorOk}
              onChange={(e) => { editou.current = true; setValor(e.target.value); }}
              onBlur={() => { setTocou(true); if (valorOk && v != null) setValor(fmtValorCampo(v)); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setTocou(true); enviar(); } }} />
          </div>
          {tocou && !valorOk
            ? <span className="hint">Informe o valor que o cliente pagou (ex.: 116,00).</span>
            : valorInicial != null && valorInicial > 0 && v === Math.round(valorInicial * 100) / 100
              && <span className="gp-inf-dica">{valorDigitado ? 'Valor que você digitou na célula. Aqui vai o TOTAL que o cliente pagou (o do comprovante) — confira.' : 'Preenchido com o último pagamento deste cliente — confira.'}</span>}
          <div className="gp-inf-div" aria-live="polite">
            {semPct ? (
              <span className={pctSituacao === 'erro' ? 'gp-inf-div-aviso' : undefined} role={pctSituacao === 'erro' ? 'alert' : undefined}>
                {pctSituacao === 'erro'
                  ? 'Não deu pra carregar a % da comissão — recarregue a página antes de enviar (sem ela a divisão sairia errada).'
                  : 'Carregando a % da comissão…'}
              </span>
            ) : valorOk && v != null && liquido != null ? (<>
              <span>Escritório <b className="num">{fmtBRL(liquido)}</b></span>
              {divisao
                ? <span>{nomeCurto(divisao.comercial)} ({fmtPct(divisao.pct)}%) <b className="num">{fmtBRL(parteDoComercial(liquido, divisao.pct))}</b></span>
                : <span>Cliente sem comercial — o valor todo fica pro escritório.</span>}
              {totalReg != null && totalReg !== Math.round(v * 100) / 100 && (
                <span className="gp-inf-div-nota">Arredondamento da divisão: fica registrado que o cliente pagou {fmtBRL(totalReg)}.</span>
              )}
              {divisao?.esperado != null && divisao.esperado > 0 && v > divisao.esperado * 1.3 && (
                <span className="gp-inf-div-aviso" role="status">Acima da mensalidade deste cliente (cerca de {fmtBRL(divisao.esperado)}) — confira se não é a parcela inteira.</span>
              )}
              {divisao?.esperado != null && divisao.esperado > 0 && v < divisao.esperado * 0.77 && (
                <span className="gp-inf-div-aviso" role="status">Abaixo da mensalidade deste cliente (cerca de {fmtBRL(divisao.esperado)}) — confira.</span>
              )}
            </>) : divisao ? (
              <span>Digite o total que o cliente pagou — aqui embaixo aparece quanto fica pro escritório e quanto é de {nomeCurto(divisao.comercial)} ({fmtPct(divisao.pct)}%).</span>
            ) : (
              <span>Digite o total que o cliente pagou. Cliente sem comercial: o valor todo fica pro escritório.</span>
            )}
          </div>
        </div>

        <div className="gp-inf-rot">Comprovante <span className="gp-inf-obrig">obrigatório</span></div>
        <input ref={inputRef} type="file" accept={ACEITA_COMPROVANTE} hidden tabIndex={-1}
          onChange={(e) => { escolher(e.target.files?.[0]); e.target.value = ''; }} />
        {arq ? (
          <div className="gp-inf-arq">
            {ehImagem
              ? <img className="gp-inf-thumb" src={arq.url} alt="" />
              : <span className="gp-inf-thumb gp-inf-pdf" aria-hidden="true"><IcT d={IC.doc} s={18} mr={0} /><b>PDF</b></span>}
            <div className="gp-inf-arq-info">
              <span className="gp-inf-arq-nome" title={arq.original}>{arq.original}</span>
              <span className="gp-inf-arq-meta num">{ehImagem ? 'Imagem' : 'PDF'} · {fmtTam(arq.tam)}</span>
            </div>
            <button type="button" className="gp-inf-link" onClick={abrirSeletor} disabled={enviando}>Trocar</button>
            <button type="button" className="gp-inf-x" onClick={() => { leitura.current++; setArq(null); }} disabled={enviando}
              aria-label="Remover comprovante" title="Remover"><IcT d={IC.fechar} s={14} mr={0} /></button>
          </div>
        ) : (
          <div className={`gp-inf-drop${arrastando ? ' on' : ''}${erroArq ? ' erro' : ''}`} role="button" tabIndex={0}
            aria-label="Anexar comprovante: arraste o arquivo aqui ou clique para escolher"
            onClick={abrirSeletor}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirSeletor(); } }}
            onDragEnter={(e) => { e.preventDefault(); setArrastando(true); }}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; if (!arrastando) setArrastando(true); }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setArrastando(false); }}
            onDrop={soltar}>
            <span className="gp-inf-drop-ic" aria-hidden="true"><IcT d={IC.subir} s={18} mr={0} /></span>
            <span className="gp-inf-drop-tit">{lendo ? 'Lendo o arquivo…' : arrastando ? 'Solte para anexar' : 'Arraste o comprovante aqui ou clique para escolher'}</span>
            <span className="gp-inf-drop-sub">Imagem ou PDF, até 5 MB · dá para soltar em qualquer lugar da janela ou colar um print (Ctrl+V)</span>
          </div>
        )}
        {erroArq && <p className="gs-erro gp-inf-erro" role="alert">{erroArq}</p>}

        <div className="gp-inf-nota">
          <span className="gp-inf-nota-ic" aria-hidden="true"><IcT d={IC.relogio} s={13} mr={0} /></span>
          <span>Vai para o financeiro conferir. A célula fica amarela até a aprovação.</span>
        </div>
        </>)}
        {erro && <p className="gs-erro gp-inf-erro" role="alert">{erro}</p>}
      </div>
    </ModalV2>
  );
}

/* ---------- seletor de ciclos (dono 25/09: "quero um seletor melhor") ----------
   Trilho único: Todos · Fim do mês (D≥15) · Início do mês (D<15) · Novos. Um clique filtra;
   clicar de novo no escolhido (ou em Todos) volta a folha inteira. Setas do teclado andam;
   quando não cabe, rola na horizontal com setas e bordas esmaecidas. */
interface ItemCiclo { id: string; rotulo: string; n: number; ag: number; dia: number | null; vazio: boolean; aberto?: boolean; dica: string }
function SeletorCiclos({ itens, total, ativo, aoEscolher, aoGerenciar }: {
  itens: ItemCiclo[]; total: number; ativo: string | null;
  aoEscolher: (id: string | null) => void; aoGerenciar?: () => void;
}) {
  const trilho = useRef<HTMLDivElement>(null);
  const [bordas, setBordas] = useState({ esq: false, dir: false });
  const medir = () => {
    const t = trilho.current; if (!t) return;
    const esq = t.scrollLeft > 2, dir = t.scrollLeft + t.clientWidth < t.scrollWidth - 2;
    setBordas((b) => (b.esq === esq && b.dir === dir ? b : { esq, dir }));
  };
  useEffect(() => {
    const t = trilho.current; if (!t) return;
    medir();
    const ro = new ResizeObserver(medir); ro.observe(t);
    return () => ro.disconnect();
  }, [itens.length]);
  // o escolhido sempre à vista
  useEffect(() => {
    const t = trilho.current; if (!t) return;
    const el = t.querySelector<HTMLElement>('[aria-checked="true"]');
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [ativo]);
  const rolar = (d: number) => trilho.current?.scrollBy({ left: d * Math.max(200, (trilho.current?.clientWidth ?? 400) * 0.7), behavior: 'smooth' });
  const grupos: { t: string; xs: ItemCiclo[] }[] = [
    { t: 'Fim do mês', xs: itens.filter((x) => x.dia != null && x.dia >= 15) },
    { t: 'Início do mês', xs: itens.filter((x) => x.dia != null && x.dia < 15) },
    { t: '', xs: itens.filter((x) => x.dia == null) },
  ].filter((gr) => gr.xs.length);
  const ordem = [null, ...grupos.flatMap((gr) => gr.xs.map((x) => x.id))] as (string | null)[];
  const teclar = (e: RKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const i = Math.max(0, ordem.indexOf(ativo));
    const k = e.key === 'Home' ? 0 : e.key === 'End' ? ordem.length - 1 : Math.min(ordem.length - 1, Math.max(0, i + (e.key === 'ArrowRight' ? 1 : -1)));
    const alvo = ordem[k];
    if (alvo && alvo.startsWith('aberto-')) return;
    aoEscolher(alvo);
    requestAnimationFrame(() => trilho.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus());
  };
  const botao = (x: ItemCiclo) => {
    const on = ativo === x.id;
    return (
      <button key={x.id} type="button" role="radio" aria-checked={on} tabIndex={on ? 0 : -1} title={x.dica}
        className={`gp-sc-item${on ? ' on' : ''}${x.vazio ? ' vazio' : ''}${x.aberto ? ' aberto' : ''}${x.dia == null ? ' novos' : ''}`}
        onClick={() => aoEscolher(x.id)}>
        <span className="gp-sc-rot">{x.rotulo}</span>
        <span className="gp-sc-n num">{x.n}</span>
        {x.ag > 0 && <span className="gp-sc-ag num" aria-label={`${x.ag} aguardando ciclo`}>{x.ag}</span>}
      </button>
    );
  };
  return (
    <div className="gp-sc">
      <span className="gp-sc-tit">Ciclos</span>
      <div className={`gp-sc-caixa${bordas.esq ? ' esq' : ''}${bordas.dir ? ' dir' : ''}`}>
        {bordas.esq && <button type="button" className="gp-sc-seta e" onClick={() => rolar(-1)} aria-label="Ver ciclos anteriores" tabIndex={-1}><IcT d="m15 18-6-6 6-6" s={14} mr={0} /></button>}
        <div ref={trilho} className="gp-sc-trilho" role="radiogroup" aria-label="Filtrar por ciclo" onScroll={medir} onKeyDown={teclar}>
          <button type="button" role="radio" aria-checked={ativo == null} tabIndex={ativo == null ? 0 : -1}
            className={`gp-sc-item todos${ativo == null ? ' on' : ''}`} onClick={() => aoEscolher(null)} title={`A planilha inteira · ${total} clientes`}>
            <span className="gp-sc-rot">Todos</span><span className="gp-sc-n num">{total}</span>
          </button>
          {grupos.map((gr) => (
            <div key={gr.t || 'novos'} className="gp-sc-grupo">
              {gr.t && <span className="gp-sc-gt" aria-hidden="true">{gr.t}</span>}
              {gr.xs.map(botao)}
            </div>
          ))}
        </div>
        {bordas.dir && <button type="button" className="gp-sc-seta d" onClick={() => rolar(1)} aria-label="Ver mais ciclos" tabIndex={-1}><IcT d="m9 18 6-6-6-6" s={14} mr={0} /></button>}
      </div>
      {aoGerenciar && (
        <button type="button" className="gp-sc-ger" onClick={aoGerenciar} title="Abrir, mover, esvaziar e importar ciclos">
          <IcT d={IC_PATH.ajustes} s={13} mr={0} /><span>Gerenciar</span>
        </button>
      )}
    </div>
  );
}

/** Modal pequeno do "Recusar…": motivo opcional (vai no aviso a quem informou e no tooltip da célula) */
function RecusarPagamento({ resumo, quem, enviando, erro, aoRecusar, aoFechar }: {
  resumo: string; quem: string; enviando: boolean; erro: string;
  aoRecusar: (motivo: string) => void; aoFechar: () => void;
}) {
  const [motivo, setMotivo] = useState('');
  return (
    <ModalV2 aberto aoFechar={aoFechar} fecharNoVeu={!enviando} largura={440}
      titulo={<div>Recusar pagamento<div className="mod-sub">{resumo}</div></div>}
      rodape={(
        <>
          <BotaoSec onClick={aoFechar} disabled={enviando}>Cancelar</BotaoSec>
          <button type="button" className="p-btn btn-perigo" onClick={() => aoRecusar(motivo)} disabled={enviando}>
            {enviando ? 'Recusando…' : 'Recusar pagamento'}
          </button>
        </>
      )}>
      <div className="campo">
        <label htmlFor="gp-rec-motivo">Motivo <span className="gp-inf-opc">(opcional)</span></label>
        <textarea id="gp-rec-motivo" className="inp gp-rec-motivo" rows={3} maxLength={300} disabled={enviando}
          placeholder="Ex.: não localizei a entrada no extrato" value={motivo} onChange={(e) => setMotivo(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); aoRecusar(motivo); } }} />
      </div>
      <p className="gp-inf-dica gp-rec-dica">{quem ? `${quem} recebe o aviso` : 'Quem informou recebe o aviso'} e a célula fica vermelha. Dá para informar de novo depois.</p>
      {erro && <p className="gs-erro" role="alert">{erro}</p>}
    </ModalV2>
  );
}

export default GestaoPlanilha;
