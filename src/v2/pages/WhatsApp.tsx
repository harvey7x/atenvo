import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { WA_REAL, mascararNumero, waRecarregarAudio, waValidarNumero, waVincularNumero, useWaAtividades, useMensagensAgendadas, useAgendarSequencia, useEditarAgendamento, useCancelarAgendamento, normalizeWaPhone } from '@/data/whatsapp';
import type { WaContact, WaMessage } from '@/data/whatsappDemo';
import { useStatusDefs, useEtiquetas, useOrgUsuarios, useAtendimentoActions } from '@/data/atendimento';
import { useScripts, useScriptEtapaCounts, useScriptCategorias, traduzErroEnvio, aguardarConfirmacaoEnvio, type Script } from '@/data/scripts';
import { useScriptsResumoEtapas } from '../hooks/scriptsResumo';
import { useJanelaCanal, rotuloJanela } from '@/data/cloudApi';
import { useSlaAlertas } from '@/data/sla';
import { indexPorChave, tipoLabel, tempoRelativo } from '@/data/slaView';
import { useOportunidadesDoContato, useFunisDaOrg, chamarGarantirEntrada, useColunasFunil, useMoverOportunidade, classificarMovimento, MOTIVOS_PERDA, traduzErroKanban } from '@/data/kanban';
import { useChecklist } from '@/data/checklist';
import { useCobrancas } from '@/data/cobrancas';
import { corDaEtiqueta, podeGerenciarAtendimento, PALETA_CORES } from '@/types/atendimento';
import { textoBloqueio, analisarNome, conversaAtiva } from '@/lib/higieneConversa';
import { responsavelEfetivo } from '@/lib/conversaEtiquetas';
import { chaveDiaSP, construirItensConversa, type ItemConversa } from '@/lib/dataConversa';
import { canalValidoParaEnvio } from '@/lib/agendamentoMensagem';
import { initials } from '@/lib/avatar';
import { useAuth } from '@/context/AuthContext';
import { useOrg } from '@/context/OrgContext';
import { MediaComposer } from '@/components/MediaComposer';
import { ScriptSequenceModal } from '@/components/ScriptSequenceModal';
import { FichaJudicialBox } from '@/components/FichaJudicialBox';
import { fichaDemoDoContato } from '@/data/fichaJudicial';
import { useSendWaMessage, useAssinaturaMarca } from '@/data/whatsapp';
import { useIaEstadoConversa, useIaToggle, type IaEstadoConversa } from '@/data/whatsapp';
import { mensagemAssumir, useAlertasLeadQuente } from '@/data/alertasLeadQuente';
import { AlertaLeadQuenteModal } from '../components/AlertaLeadQuenteModal';
import { useInboxWhatsApp, type AvisoInbox } from '../hooks/useInboxWhatsApp';
import { assinaturaAtendente } from '../hooks/inboxWhatsApp';
import { AudioRecorderV2 } from '../components/AudioRecorderV2';
import { AgendarMensagemModalV2 } from './AgendarMensagemModalV2';
import { CLASSE_RAIZ_PORTAL } from '../components/portal';
import { BotaoMini, BotaoPrimario, BotaoSec, ConfirmDialogV2, EstadoErro, ModalV2, Skeleton } from '../components';
import { Bolha, Ic, IcBot, IcDoc } from '../components/BolhaWa';
import { corDaSituacao, nomeExibicao, situacaoDe, tierEspera } from '../lib/waUi';
import { seedWa } from './whatsappSeed';
import './whatsapp.css';

/* ------------------------------------------------------------------
   WhatsApp v2 — inbox de atendimento (anatomia pg-wa: fila 296px ·
   conversa · contexto 266px). A máquina vive em useInboxWhatsApp
   (extração fiel da v1); aqui é só UI. Respostas rápidas = ponte dos
   Scripts (useScripts reais → ScriptSequenceModal, nunca envio cego).
   OPT-OUT inviolável: contato em relacionamento_bloqueio mostra o
   estado e bloqueia envio com motivo visível (precedente Contatos).
   REGRA DE OURO: mutações só no demo; no real esta página só é
   validada em leitura — enviar mensagem é falar com cliente real.
   ------------------------------------------------------------------ */

const FOCO_KEY = 'atenvo-wa-foco';
const ABA_KEY = 'atenvo-wa-aba';
const GRUPOS_KEY = 'atenvo-wa-grupos-fechados';
const TABS = [
  ['todos', 'Todos'], ['meus', 'Meus'], ['naoatrib', 'Não atribuídos'],
  ['naolidas', 'Não lidas'], ['pendentes', 'Pendentes'], ['arquivadas', 'Arquivadas'],
] as const;
type TabId = typeof TABS[number][0];
// Situação = baldes FIXOS de situacaoDaConversa (variante). 'etapa' fica DE FORA: as etapas
// avançadas do Kanban têm faceta própria (Etapa do Kanban) — sem redundância.
const SITUACAO_OPCOES: ReadonlyArray<readonly [string, string]> = [
  ['lead', 'Lead novo'], ['atendimento', 'Em atendimento'], ['aguardando', 'Aguardando cliente'],
  ['ganho', 'Fechado'], ['perdido', 'Perdido'], ['cancelado', 'Cancelado'],
];
const IA_OPCOES: ReadonlyArray<readonly [string, string]> = [
  ['ativa', 'Com IA ativa'], ['pausada', 'IA pausada / handoff'], ['humano', 'Precisa de humano'],
];
const PERIODO_OPCOES: ReadonlyArray<readonly [string, string]> = [['hoje', 'Hoje'], ['7d', '7 dias'], ['30d', '30 dias']];

const IcWa = () => <Ic><path d="M21 11.5a8.4 8.4 0 01-9 8.4 8.9 8.9 0 01-3.8-.8L3 20l1-4.9a8.3 8.3 0 01-1-4A8.4 8.4 0 0112 3a8.4 8.4 0 019 8.5z" /></Ic>;
const IcBusca = () => <Ic><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></Ic>;
const IcMais = () => <Ic><path d="M12 5v14M5 12h14" /></Ic>;
const IcFunil = () => <Ic><path d="M3 5h18l-7 8v5l-4 2v-7z" /></Ic>;
const IcDots = () => <Ic fill><circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" /></Ic>;
const IcImg = () => <Ic><rect x="3" y="4" width="18" height="16" rx="2.5" /><circle cx="9" cy="10" r="1.6" /><path d="m5 18 5-5 3 3 3-3 3 3" /></Ic>;
const IcVideo = () => <Ic><rect x="3" y="6" width="13" height="12" rx="2.5" /><path d="m16 10 5-3v10l-5-3z" /></Ic>;
const IcClock = () => <Ic><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Ic>;
const IcSend = () => <Ic><path d="M4 12l16-8-6 16-2.5-6.5z" /></Ic>;
const IcRaio = () => <Ic><path d="M13 2 4 14h7l-1 8 9-12h-7z" /></Ic>;
const IcContato = () => <Ic><circle cx="10" cy="8" r="3.2" /><path d="M4.5 19.5c.7-3 2.8-4.6 5.5-4.6s4.8 1.6 5.5 4.6" /><path d="M17.5 7.5h4.5" /><path d="M19.75 5.25v4.5" /></Ic>;
const IcCopy = () => <Ic><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></Ic>;
const IcFoco = () => <Ic><path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4" /></Ic>;

type Pop = { kind: 'filtro' | 'acoes' | 'status'; x: number; y: number; acima?: boolean } | null;

/* ==================================================================
   Chip de etiqueta-CRUD — Platina estilo B, UNIFICADO entre a lista de
   conversa e o header. Superfície neutra elevada + texto neutro; SÓ a
   bolinha carrega a cor da etiqueta (nada de cor de marca no fundo/texto).
   `size='sm'` para o item da lista (mais sóbrio), padrão para o header.
   `mais` = pílula de excedente "+N" (sem bolinha). Cor resolvida fora,
   pela via atual (corDaEtiqueta / useEtiquetas).
   ================================================================== */
function EtiquetaChip({ nome, cor, size, mais, title }: {
  nome: string; cor?: string; size?: 'sm' | 'md'; mais?: boolean; title?: string;
}) {
  return (
    <span className={'etqchip' + (size === 'sm' ? ' sm' : '') + (mais ? ' mais' : '')} title={title ?? ('Etiqueta: ' + nome)}>
      {!mais && cor && <i style={{ background: cor }} />}
      <span className="etqchip-nm">{nome}</span>
    </span>
  );
}

/* ==================================================================
   Seletor de etiquetas do chat — glass, viewport-aware (flip + scroll
   interno na lista; busca/criar e rodapé SEMPRE fixos, nunca cortam).
   Caminho de dados INALTERADO: onToggle usa alternarEtiqueta (cache
   text[] via definirEtiquetasConversa + espelho no contato); criar usa
   criarEtiqueta atual. Nada de junção/RPC aqui.
   ================================================================== */
type EtiquetaSel = { id: string; nome: string; cor: string; ativo: boolean };
function SeletorEtiquetas({
  anchor, etiquetas, aplicadas, podeGerenciar, onToggle, onCriarEAplicar, onGerenciar, onClose,
}: {
  anchor: DOMRect;
  etiquetas: EtiquetaSel[];
  aplicadas: string[];
  podeGerenciar: boolean;
  onToggle: (nome: string) => void;
  onCriarEAplicar: (nome: string, cor: string) => void;
  onGerenciar: () => void;
  onClose: () => void;
}) {
  const painelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busca, setBusca] = useState('');
  const [hi, setHi] = useState(0);
  const ativas = useMemo(() => etiquetas.filter((e) => e.ativo), [etiquetas]);
  const q = busca.trim().toLocaleLowerCase('pt-BR');
  const filtradas = useMemo(
    () => (q ? ativas.filter((e) => e.nome.toLocaleLowerCase('pt-BR').includes(q)) : ativas),
    [ativas, q],
  );
  const temExato = !!q && ativas.some((e) => e.nome.trim().toLocaleLowerCase('pt-BR') === q);
  const podeCriar = podeGerenciar && !!busca.trim() && !temExato;
  const [cor, setCor] = useState(() => PALETA_CORES[ativas.length % PALETA_CORES.length]);

  // Posicionamento viewport-aware: abre pra baixo; se não couber, FLIPA pra cima.
  // maxHeight limitado ao espaço disponível → a LISTA rola por dentro, header/rodapé ficam.
  const [pos, setPos] = useState<React.CSSProperties>({ left: -9999, top: -9999, visibility: 'hidden' });
  useLayoutEffect(() => {
    const margem = 8, larg = 300, vw = window.innerWidth, vh = window.innerHeight;
    const left = Math.max(margem, Math.min(anchor.left, vw - larg - margem));
    const abaixo = vh - anchor.bottom - margem;
    const acima = anchor.top - margem;
    const flip = abaixo < 300 && acima > abaixo;
    const maxH = Math.min(460, Math.max(200, flip ? acima : abaixo));
    setPos(flip
      ? { left, bottom: vh - anchor.top + 6, maxHeight: maxH }
      : { left, top: anchor.bottom + 6, maxHeight: maxH });
  }, [anchor]);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!painelRef.current?.contains(t) && !t.closest?.('.etq-add')) onClose();
    };
    const onResize = () => onClose();
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('resize', onResize);
    };
  }, [onClose]);
  useEffect(() => { setHi(0); }, [q]);

  const criar = () => { const nm = busca.trim(); if (!nm) return; onCriarEAplicar(nm, cor); setBusca(''); };
  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (filtradas.length > 0) onToggle(filtradas[Math.min(hi, filtradas.length - 1)].nome);
      else if (podeCriar) criar();
    } else if (e.key === 'ArrowDown') { e.preventDefault(); setHi((i) => Math.min(i + 1, filtradas.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((i) => Math.max(i - 1, 0)); }
  };

  return (
    <div ref={painelRef} className="wa-etqpop" style={pos} role="dialog" aria-label="Etiquetas da conversa">
      <div className="etqp-busca">
        <IcBusca />
        <input
          ref={inputRef} value={busca} maxLength={40} autoComplete="off"
          placeholder="Buscar ou criar etiqueta…" aria-label="Buscar ou criar etiqueta"
          onChange={(e) => setBusca(e.target.value)} onKeyDown={onInputKey}
        />
      </div>

      <div className="etqp-lista" role="listbox" aria-label="Etiquetas">
        {filtradas.length === 0 && !podeCriar && (
          <div className="etqp-vazio">{podeGerenciar ? 'Nenhuma etiqueta. Digite para criar.' : 'Nenhuma etiqueta. Peça a um gestor.'}</div>
        )}
        {filtradas.map((e, i) => {
          const on = aplicadas.includes(e.nome);
          return (
            <button
              key={e.id} type="button" role="option" aria-selected={on}
              className={'etqp-it' + (i === hi ? ' hi' : '')}
              onMouseEnter={() => setHi(i)} onClick={() => onToggle(e.nome)}
            >
              <span className="dot" style={{ background: e.cor }} />
              <span className="nm">{e.nome}</span>
              {on && <span className="ck">✓</span>}
            </button>
          );
        })}
      </div>

      {podeCriar && (
        <div className="etqp-criar">
          <button type="button" className="etqp-criar-btn" onClick={criar}>
            <span className="dot" style={{ background: cor }} />
            <span className="nm">＋ Criar e aplicar <b>«{busca.trim()}»</b></span>
          </button>
          <div className="etqp-cores" role="group" aria-label="Cor da nova etiqueta">
            {PALETA_CORES.map((c) => (
              <button
                key={c} type="button" aria-label={'Cor ' + c} title={c}
                className={'sw' + (c.toLowerCase() === cor.toLowerCase() ? ' sel' : '')}
                style={{ background: c }} onClick={() => setCor(c)}
              />
            ))}
          </div>
        </div>
      )}

      {podeGerenciar && (
        <button type="button" className="etqp-lk" onClick={onGerenciar}>Gerenciar etiquetas…</button>
      )}
    </div>
  );
}

/* ==================================================================
   Seletor de SCRIPTS do chat — mesmo vidro e posicionamento viewport-aware
   do SeletorEtiquetas (flip pra cima quando não cabe; só a lista rola,
   busca/rodapé fixos). Acesso rápido: um botão no lugar da tira horizontal.
   Comportamento de clique INALTERADO: onSelecionar reusa o setScriptSeq do
   composer (abre o ScriptSequenceModal — nunca envio cego, nunca insere
   texto). Escopo por canal INALTERADO: recebe a mesma lista já filtrada
   por useScripts('whatsapp'). Sem banco/RPC.
   ================================================================== */
type ScriptResumo = Record<string, { total?: number; temMidia?: boolean } | undefined>;
function SeletorScripts({
  anchor, scripts, categorias, resumo, etapaCounts, onSelecionar, onGerenciar, onClose,
}: {
  anchor: DOMRect;
  scripts: Script[];
  categorias: { id: string; nome: string; ordem: number }[];
  resumo: ScriptResumo;
  etapaCounts: Record<string, number>;
  onSelecionar: (s: Script) => void;
  onGerenciar: () => void;
  onClose: () => void;
}) {
  const painelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busca, setBusca] = useState('');
  const [hi, setHi] = useState(0);
  const q = busca.trim().toLocaleLowerCase('pt-BR');

  // FAVORITOS primeiro; depois por CATEGORIA (ordem da categoria); sem categoria → "Outros".
  // Busca filtra por titulo E tags (o caminho mais rápido). Favorito não se repete nos grupos.
  const grupos = useMemo(() => {
    const casa = (s: Script) =>
      !q ||
      s.titulo.toLocaleLowerCase('pt-BR').includes(q) ||
      (s.tags ?? []).some((t) => t.toLocaleLowerCase('pt-BR').includes(q));
    const gs: { chave: string; rotulo: string; fav?: boolean; itens: Script[] }[] = [];
    const favs = scripts.filter((s) => s.favorito && casa(s));
    if (favs.length) gs.push({ chave: '__fav', rotulo: 'Favoritos', fav: true, itens: favs });
    const restantes = scripts.filter((s) => !s.favorito);
    const cats = [...categorias].sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome));
    const idsValidos = new Set(cats.map((c) => c.id));
    for (const c of cats) {
      const itens = restantes.filter((s) => s.categoriaId === c.id && casa(s));
      if (itens.length) gs.push({ chave: c.id, rotulo: c.nome, itens });
    }
    const soltos = restantes.filter((s) => (!s.categoriaId || !idsValidos.has(s.categoriaId)) && casa(s));
    if (soltos.length) gs.push({ chave: '__outros', rotulo: 'Outros', itens: soltos });
    return gs;
  }, [scripts, categorias, q]);

  // lista achatada na ordem visual → teclado (setas/Enter) casa com o que se vê
  const flat = useMemo(() => grupos.flatMap((g) => g.itens), [grupos]);

  // Posicionamento viewport-aware — idêntico ao seletor de etiquetas: abre pra baixo,
  // FLIPA pra cima se não couber; a LISTA rola por dentro, busca/rodapé ficam.
  const [pos, setPos] = useState<React.CSSProperties>({ left: -9999, top: -9999, visibility: 'hidden' });
  useLayoutEffect(() => {
    const margem = 8, larg = 320, vw = window.innerWidth, vh = window.innerHeight;
    const left = Math.max(margem, Math.min(anchor.left, vw - larg - margem));
    const abaixo = vh - anchor.bottom - margem;
    const acima = anchor.top - margem;
    const flip = abaixo < 320 && acima > abaixo;
    const maxH = Math.min(480, Math.max(220, flip ? acima : abaixo));
    setPos(flip
      ? { left, bottom: vh - anchor.top + 6, maxHeight: maxH }
      : { left, top: anchor.bottom + 6, maxHeight: maxH });
  }, [anchor]);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!painelRef.current?.contains(t) && !t.closest?.('.wa-scr-btn')) onClose();
    };
    const onResize = () => onClose();
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('resize', onResize);
    };
  }, [onClose]);
  useEffect(() => { setHi(0); }, [q]);

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const alvo = flat[Math.min(hi, flat.length - 1)];
      if (alvo) onSelecionar(alvo);
    } else if (e.key === 'ArrowDown') { e.preventDefault(); setHi((i) => Math.min(i + 1, flat.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((i) => Math.max(i - 1, 0)); }
  };

  let idx = -1; // índice global (achatado) para casar com o highlight do teclado
  return (
    <div ref={painelRef} className="wa-scrpop" style={pos} role="dialog" aria-label="Scripts">
      <div className="etqp-busca">
        <IcBusca />
        <input
          ref={inputRef} value={busca} maxLength={60} autoComplete="off"
          placeholder="Buscar script por nome ou tag…" aria-label="Buscar script"
          onChange={(e) => setBusca(e.target.value)} onKeyDown={onInputKey}
        />
      </div>

      <div className="etqp-lista scrp-lista" role="listbox" aria-label="Scripts">
        {flat.length === 0 && (
          <div className="etqp-vazio">{scripts.length === 0 ? 'Nenhum script para WhatsApp. Crie no arsenal.' : 'Nenhum script encontrado.'}</div>
        )}
        {grupos.map((g) => (
          <div key={g.chave} className="scrp-grupo">
            <div className={'scrp-cab' + (g.fav ? ' fav' : '')}>{g.fav ? '★ ' : ''}{g.rotulo}</div>
            {g.itens.map((s) => {
              idx += 1;
              const i = idx;
              const r = resumo[s.id];
              const total = r?.total ?? etapaCounts[s.id] ?? (s.conteudo.trim() ? 1 : 0);
              const temMidia = r?.temMidia ?? false;
              return (
                <button
                  key={s.id} type="button" role="option" aria-selected={i === hi}
                  className={'etqp-it scrp-it' + (i === hi ? ' hi' : '')}
                  onMouseEnter={() => setHi(i)} onClick={() => onSelecionar(s)}
                >
                  <span className="scrp-txt">
                    <span className="scrp-nome">{s.favorito ? '★ ' : ''}{s.titulo}</span>
                    {s.descricao && <span className="scrp-desc">{s.descricao}</span>}
                  </span>
                  {temMidia && <span className="scrp-tag">mídia</span>}
                  <span className="scrp-cnt">{total} msg{total === 1 ? '' : 's'}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <button type="button" className="etqp-lk" onClick={onGerenciar}>Gerenciar no arsenal…</button>
    </div>
  );
}

/* Motivo (slug) pelo qual a IA pediu um humano → frase curta em PT. Fonte real:
   ia_conversa_estado.aguardando_humano (dados->>'aguardando_humano' da ia_sessoes) —
   slugs do ia-sdr + escalas do bot v1. Slug desconhecido sai legível (underscores → espaço),
   nunca some: o atendente precisa VER por que a IA parou. */
function motivoHumanoLabel(slug: string | null | undefined): string | null {
  if (!slug) return null;
  const M: Record<string, string> = {
    sem_acesso_govbr: 'cliente sem acesso ao gov.br',
    auxilio_extratos: 'cliente precisa de ajuda com os extratos',
    auxilio_senha: 'cliente precisa de ajuda com a senha',
    cpf_divergente: 'CPF do documento diverge do cadastro',
    foto_ilegivel: 'documento ilegível',
    foto_nao_carregou: 'a foto não carregou',
    doc_divergente: 'documento divergente',
    declarante_divergente: 'declarante divergente',
    comprovante_ilegivel: 'comprovante ilegível',
    comprovante_fora_janela: 'comprovante fora da janela',
    quer_falar_valores: 'cliente quer falar de valores',
    nao_entendeu: 'a IA não entendeu o cliente',
    transicao_falhou: 'a transição de fluxo falhou',
    erro_interno: 'erro interno da IA',
    retorno_caso_fechado: 'retorno de caso já fechado',
    retorno_pendente_prioridade: 'retorno pendente prioritário',
    audio_recebido_bot: 'cliente mandou áudio para o bot',
    cliente_qualificado_bot: 'cliente qualificado pelo bot',
    docs_completos_fechar: 'documentos completos — fechar com o cliente',
    analise_pronta_contatar_hoje: 'análise pronta — contatar hoje',
    falha_leitura_docs: 'não conseguiu ler os documentos',
    falha_tecnica: 'falha técnica da IA',
  };
  return M[slug] ?? slug.replace(/_/g, ' ');
}

/* Etapa do fluxo da IA (ia_sessoes.etapa) → rótulo humano. Valores REAIS em produção:
   qualificacao_inss/extratos/coleta_docs/triagem_govbr/retorno (+docs_pessoais no fluxo).
   Fallback prettify (underscores → espaço, caixa baixa): nenhum código cru na UI. */
function etapaIaLabel(slug: string | null | undefined): string | null {
  if (!slug) return null;
  const M: Record<string, string> = {
    qualificacao_inss: 'qualificando o benefício',
    triagem_govbr: 'triagem do acesso gov.br',
    extratos: 'coletando extratos',
    coleta_docs: 'coletando documentos',
    docs_pessoais: 'documentos pessoais',
    retorno: 'retomando contato',
  };
  return M[slug] ?? slug.replace(/_/g, ' ').toLowerCase();
}

export default function WhatsAppV2() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  const { currentOrg } = useOrg();
  const [aviso, setAviso] = useState<AvisoInbox | null>(null);
  const avisoTimer = useRef(0);
  const aoAvisar = useCallback((a: AvisoInbox) => {
    setAviso(a);
    window.clearTimeout(avisoTimer.current);
    avisoTimer.current = window.setTimeout(() => setAviso(null), 4200);
  }, []);
  useEffect(() => () => window.clearTimeout(avisoTimer.current), []);

  const inbox = useInboxWhatsApp({ aoAvisar, seedDemo: useMemo(() => seedWa(), []), bloqueadosDemo: useMemo(() => new Set(['wa-cleusa-ct']), []) });
  const { demo, contacts, current, currentId, relogioMs } = inbox;
  const sendMut = useSendWaMessage();

  // LEAD QUENTE: fila de alertas de abandono do bot (Realtime). Um modal por vez,
  // mais antigo primeiro; assumir = claim atômico no banco -> abre a conversa e
  // envia a mensagem fixa pelo transporte do canal da conversa (evolution-send).
  const alertasLq = useAlertasLeadQuente();
  const alertaLq = demo ? null : alertasLq.fila[0] ?? null;
  const assumirLeadQuente = async () => {
    if (!alertaLq) return { ok: false as const, motivo: 'erro' as const };
    const r = await alertasLq.assumir(alertaLq.id);
    if (r.ok) {
      inbox.selecionarPorDeepLink(r.conversaId);
      const primeiro = (user?.name ?? '').trim().split(/\s+/)[0] ?? '';
      sendMut.mutate({ conversaId: r.conversaId, text: mensagemAssumir(primeiro) });
      void alertasLq.recarregar();
    }
    return r;
  };

  /* ---------- UI ---------- */
  const [draft, setDraft] = useState('');
  // lembra a última aba usada (quem trabalha pelo "Meus" reabre no "Meus")
  const [tab, setTab] = useState<TabId>(() => {
    try { const t = localStorage.getItem(ABA_KEY); return TABS.some(([id]) => id === t) ? (t as TabId) : 'todos'; } catch { return 'todos'; }
  });
  // persiste APENAS na escolha do usuário — a troca programática do deep-link não apaga a preferência
  const mudarAba = (t: TabId) => { setTab(t); try { localStorage.setItem(ABA_KEY, t); } catch { /* privado */ } };
  // grupos recolhidos na fila (por respId; '' = Não atribuídos), lembrados entre sessões
  const [gruposFechados, setGruposFechados] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(GRUPOS_KEY) ?? '[]') as string[]); } catch { return new Set(); }
  });
  // persistência dentro da AÇÃO (não em effect): o expandir-tudo do deep-link fica só na sessão
  const alternarGrupo = (k: string) => setGruposFechados((cur) => {
    const s = new Set(cur);
    if (s.has(k)) s.delete(k); else s.add(k);
    try { localStorage.setItem(GRUPOS_KEY, JSON.stringify([...s])); } catch { /* privado */ }
    return s;
  });
  const [search, setSearch] = useState('');
  // FILTRO COMPLETO (client-side, aplicado em passaBase sobre a lista JÁ em memória).
  // Facetas combinam entre si com E; multi-seleção dentro de cada com OU. O grupo "Status"
  // (status_id) foi APOSENTADO — a Situação agora vem de situacaoDaConversa (o chip da lista).
  const [filtroCanais, setFiltroCanais] = useState<Set<string>>(new Set());        // conversas.canal_id (OU)
  const [filtroTransporte, setFiltroTransporte] = useState<Set<string>>(new Set()); // 'cloud_api' | 'evolution'
  const [filtroEtapas, setFiltroEtapas] = useState<Set<string>>(new Set());          // nome da coluna do Kanban (OU)
  const [filtroEtiquetas, setFiltroEtiquetas] = useState<Set<string>>(new Set());    // etiquetas (cache text[]) (OU)
  const [filtroAtendentes, setFiltroAtendentes] = useState<Set<string>>(new Set());  // respId; '' = Não atribuído (OU)
  const [filtroIA, setFiltroIA] = useState<Set<string>>(new Set());                  // 'ativa' | 'pausada' | 'humano'
  const [filtroSituacao, setFiltroSituacao] = useState<Set<string>>(new Set());      // variante de situacaoDaConversa (OU)
  const [filtroNaoLidas, setFiltroNaoLidas] = useState(false);
  const [filtroArquivadas, setFiltroArquivadas] = useState(false);
  const [filtroPeriodo, setFiltroPeriodo] = useState<string | null>(null);           // 'hoje' | '7d' | '30d'
  // alterna um valor num Set-state (imutável) — mantém o painel aberto (multi-seleção)
  const alternarSet = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, v: string) =>
    setter((cur) => { const n = new Set(cur); if (n.has(v)) n.delete(v); else n.add(v); return n; });
  const limparFiltros = () => {
    setFiltroCanais(new Set()); setFiltroTransporte(new Set()); setFiltroEtapas(new Set());
    setFiltroEtiquetas(new Set()); setFiltroAtendentes(new Set()); setFiltroIA(new Set());
    setFiltroSituacao(new Set()); setFiltroNaoLidas(false); setFiltroArquivadas(false); setFiltroPeriodo(null);
  };
  const filtrosAtivos = filtroCanais.size > 0 || filtroTransporte.size > 0 || filtroEtapas.size > 0
    || filtroEtiquetas.size > 0 || filtroAtendentes.size > 0 || filtroIA.size > 0 || filtroSituacao.size > 0
    || filtroNaoLidas || filtroArquivadas || !!filtroPeriodo;
  const [pop, setPop] = useState<Pop>(null);
  const [etqPop, setEtqPop] = useState<DOMRect | null>(null); // seletor de etiquetas (portal próprio, viewport-aware)
  const [scrPop, setScrPop] = useState<DOMRect | null>(null); // seletor de scripts (mesmo tratamento glass)
  const scrBtnRef = useRef<HTMLButtonElement>(null);
  const [foco, setFoco] = useState(() => { try { return localStorage.getItem(FOCO_KEY) === '1'; } catch { return false; } });
  const [ctxAberto, setCtxAberto] = useState(() => { try { return sessionStorage.getItem('atenvo-wa-ctx') !== '0'; } catch { return true; } });
  useEffect(() => { try { sessionStorage.setItem('atenvo-wa-ctx', ctxAberto ? '1' : '0'); } catch { /* privado */ } }, [ctxAberto]);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [novaConversa, setNovaConversa] = useState(false);
  const [transferirAberto, setTransferirAberto] = useState(false);
  const [vincAberto, setVincAberto] = useState(false);
  const [fecharConfirm, setFecharConfirm] = useState(false);
  const [devolverConfirm, setDevolverConfirm] = useState(false);
  const [cancelarAgId, setCancelarAgId] = useState<string | null>(null); // auditoria: era window.confirm nativo
  const [verErro, setVerErro] = useState<string | null>(null);
  const [removerAlvo, setRemoverAlvo] = useState<WaMessage | null>(null);
  const [imgModal, setImgModal] = useState(false);
  const [videoModal, setVideoModal] = useState(false);
  const [docModal, setDocModal] = useState(false);
  const [ctModal, setCtModal] = useState(false);
  const [agendarAberto, setAgendarAberto] = useState(false);
  const [agEditId, setAgEditId] = useState<string | null>(null);
  const [scriptSeq, setScriptSeq] = useState<Script | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({ nome: '', email: '', observacoes: '', responsavelId: '' });
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const msgsRef = useRef<HTMLDivElement>(null);

  useEffect(() => { try { localStorage.setItem(FOCO_KEY, foco ? '1' : '0'); } catch { /* privado */ } }, [foco]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (pop) { setPop(null); return; }
      setFoco(false);
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [pop]);
  useEffect(() => { setEditMode(false); }, [currentId]);
  /* autoscroll do chat ao trocar/receber */
  useEffect(() => {
    const el = msgsRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [currentId, current.msgs.length]);

  /* ---------- dados satélites ---------- */
  const slaQ = useSlaAlertas();
  const slaPorConversa = useMemo(() => indexPorChave(slaQ.data?.itens ?? [], 'conversa_id'), [slaQ.data]);
  const atividadesQ = useWaAtividades(WA_REAL ? currentId || null : null);
  const statusQ = useStatusDefs();
  const etiquetasQ = useEtiquetas();
  const usuariosQ = useOrgUsuarios();
  const assinaturaMarcaQ = useAssinaturaMarca();
  const acoes = useAtendimentoActions();
  const scriptsQ = useScripts('whatsapp');
  const scriptsDemo: Script[] = useMemo(() => (WA_REAL ? [] : [
    { id: 'sd-1', titulo: 'Boas-vindas ao cliente', descricao: null, conteudo: 'Olá {{nome_cliente}}! Aqui é {{seu_nome}}, da {{empresa}}. Como posso ajudar?', categoriaId: null, canais: ['whatsapp'], favorito: true, ativo: true, tags: [], autorId: null, criadoEm: '', atualizadoEm: '' },
    { id: 'sd-2', titulo: 'Pedir CPF', descricao: null, conteudo: 'Para conferir os descontos no benefício eu preciso do seu CPF, pode me enviar?', categoriaId: null, canais: ['whatsapp'], favorito: true, ativo: true, tags: [], autorId: null, criadoEm: '', atualizadoEm: '' },
    { id: 'sd-3', titulo: 'Explicar o processo', descricao: null, conteudo: 'A análise é simples: conferimos seu benefício, identificamos descontos indevidos e cuidamos do cancelamento e do ressarcimento.', categoriaId: null, canais: ['whatsapp'], favorito: false, ativo: true, tags: [], autorId: null, criadoEm: '', atualizadoEm: '' },
    { id: 'sd-4', titulo: 'Agendar ligação', descricao: null, conteudo: 'Posso te ligar para explicar melhor. Qual o melhor horário para você?', categoriaId: null, canais: ['whatsapp'], favorito: false, ativo: true, tags: [], autorId: null, criadoEm: '', atualizadoEm: '' },
  ]), []);
  const scripts = WA_REAL ? (scriptsQ.data ?? []) : scriptsDemo;
  const etapaCounts = useScriptEtapaCounts().data ?? {};
  const scriptCategorias = useScriptCategorias().data ?? [];
  const scriptsResumo = useScriptsResumoEtapas().data ?? {};
  // O agrupamento (favoritos → categorias → Outros) e a busca vivem no SeletorScripts;
  // aqui basta a lista já filtrada por canal (useScripts('whatsapp')) e os satélites.
  const bloqueados = inbox.bloqueados;
  const canalEhCloud = inbox.canalSel?.transporte === 'cloud_api';
  // canal oficial (Cloud API/Meta) × número conectado por QR (Evolution) — sinalização na fila,
  // no topo da conversa, no "Responder por:" e no filtro de números. Transporte DESCONHECIDO
  // (demo, canais ainda carregando, canal removido fora de realCanais) fica neutro: não se
  // afirma "não oficial" sobre canal que não foi consultado.
  const canalPorId = useMemo(() => new Map(inbox.realCanais.map((c) => [c.id, c])), [inbox.realCanais]);
  const transporteDe = (id: string | null | undefined) => (id ? canalPorId.get(id)?.transporte ?? null : null);
  const tituloCanal = (nome: string | null | undefined, transporte: string | null) =>
    transporte === 'cloud_api' ? `${nome ?? 'WhatsApp'} — OFICIAL (API do WhatsApp/Meta)`
    : transporte ? `${nome ?? 'WhatsApp'} — número conectado por QR (não oficial)`
    : nome ?? 'WhatsApp';
  const janelaQ = useJanelaCanal(WA_REAL && canalEhCloud ? inbox.canalSel?.id ?? null : null, WA_REAL ? current.contatoId ?? null : null, canalEhCloud);
  const agendadasQ = useMensagensAgendadas(WA_REAL ? currentId || null : null);
  const iaEstadoQ = useIaEstadoConversa(WA_REAL ? currentId || null : null);
  const iaEstado = iaEstadoQ.data;
  const iaToggle = useIaToggle();
  const iaAtiva = !!iaEstado?.existe && iaEstado.status === 'ativa' && !iaEstado.desativado_manual;
  async function alternarIa() {
    if (!currentId || iaToggle.isPending) return;
    try {
      await iaToggle.mutateAsync({ conversaId: currentId, ativar: !iaAtiva });
      aoAvisar({ tom: 'ok', texto: iaAtiva ? 'IA desativada nesta conversa' : 'IA ativada nesta conversa' });
    } catch (e) { aoAvisar({ tom: 'erro', texto: (e as Error).message || 'Falha ao alternar a IA' }); }
  }
  // ---- PEÇA 1: barra de estado da IA (o "modo IA" da conversa) ----
  // REAL usa o RPC ia_conversa_estado (fresco, refetch 20s); DEMO sintetiza do seed da lista.
  // Nada aqui muda semântica: só EXIBE o estado que o sistema já guarda e reusa ações existentes.
  const iaBar: IaEstadoConversa | undefined = WA_REAL
    ? iaEstado
    : (current.iaStatus ? { existe: true, status: current.iaStatus, etapa: current.iaEtapa ?? undefined, aguardando_humano: current.iaAguardando ?? null } : undefined);
  const iaBarAtiva = !!iaBar?.existe && iaBar.status === 'ativa' && !iaBar.desativado_manual;  // MESMA fórmula do botão do cabeçalho
  // aguardando_humano VIVO = sessão ainda 'ativa'/'handoff'. Depois que o humano assume e
  // responde, a sessão vira 'pausada' mas o backend NÃO limpa o flag (só a retomada de
  // motivos retomáveis ou o ia_conversa_toggle ao reativar limpam) — sem este corte a barra
  // ficaria âmbar "Aguardando humano" para sempre em conversa já atendida.
  const iaAguardaVivo = !!iaBar?.aguardando_humano && (iaBar.status === 'ativa' || iaBar.status === 'handoff');
  const iaBarMotivo = iaAguardaVivo || iaBar?.status === 'handoff' ? motivoHumanoLabel(iaBar?.aguardando_humano) : null;
  // prioridade do sinal: handoff (rubro) > aguardando humano (âmbar) > atendendo (verde) > pausada/concluída/encerrada (neutro)
  const iaBarSinal = !current.id || !iaBar?.existe ? null
    : iaBar.status === 'handoff' ? { cls: 'handoff', rotulo: 'IA pediu atendimento' }
    : iaAguardaVivo ? { cls: 'aguarda', rotulo: 'Aguardando humano' }
    : iaBarAtiva ? { cls: 'ok', rotulo: 'IA atendendo' }
    : iaBar.status === 'encerrada' ? { cls: 'neutro', rotulo: 'IA encerrada' }
    : iaBar.status === 'concluida' ? { cls: 'neutro', rotulo: 'IA concluída' }
    : { cls: 'neutro', rotulo: 'IA pausada' };
  const agendarSeqMut = useAgendarSequencia();
  const editarAgMut = useEditarAgendamento();
  const cancelarAgMut = useCancelarAgendamento();
  const cobrancasQ = useCobrancas();

  const optout = inbox.optout;
  const podeGerenciar = podeGerenciarAtendimento(currentOrg.role);
  const usuarios = usuariosQ.data ?? [];
  // Map memoizado em vez de usuarios.find() por linha da fila: o cabeçalho e cada card
  // resolvem o nome do responsável a cada render (inclusive a cada tecla no composer).
  const nomeMap = useMemo(() => new Map(usuarios.map((u) => [u.id, u.nome])), [usuarios]);
  const nomePorId = (id: string) => nomeMap.get(id);

  /* assinatura OBRIGATÓRIA (28/08): carimbo fixo da casa `*Nome – MARCA:*` — o backend
     (evolution-send) resolve e aplica por conta própria; aqui só ESPELHAMOS o carimbo para a
     bolha otimista, o preview do composer e o remetente do reply baterem com o que sai. */
  const assinaturaNome = assinaturaAtendente(user?.name, assinaturaMarcaQ.data);

  /* ---------- deep-link ?conversa= (v1 L363-375) ---------- */
  const conversaParam = params.get('conversa');
  useEffect(() => {
    if (!conversaParam) return;
    inbox.selecionarPorDeepLink(conversaParam);
    setTab('todos'); limparFiltros(); setSearch(''); // revela o alvo: sem faceta ativa escondendo o card
    setGruposFechados(new Set()); // expande tudo: o card alvo pode estar num grupo recolhido
    const t = window.setTimeout(() => {
      document.querySelector(`[data-cid="${CSS.escape(conversaParam)}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      // só limpa o parâmetro DEPOIS de rolar: apagá-lo muda conversaParam→null, o que
      // dispara o cleanup deste effect (clearTimeout). Se limpássemos antes, o timer
      // morreria antes dos 220ms e a rolagem nunca ocorreria (regressão vs v1).
      setParams((p) => { p.delete('conversa'); return p; }, { replace: true });
    }, 220);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversaParam]);

  /* ---------- fila: filtro/contadores/ordenação (v1 L287-334) ---------- */
  const buscaAtiva = search.trim().length > 0;
  const term = search.trim().toLowerCase();
  // faixa de "última interação" (lastAtMs): hoje = desde a meia-noite local; 7d/30d = janela.
  const dentroPeriodo = (ms: number | undefined | null): boolean => {
    if (!filtroPeriodo) return true;
    if (!ms) return false;
    if (filtroPeriodo === 'hoje') { const d = new Date(relogioMs); d.setHours(0, 0, 0, 0); return ms >= d.getTime(); }
    const dias = filtroPeriodo === '7d' ? 7 : 30;
    return relogioMs - ms <= dias * 86_400_000;
  };
  // TODAS as facetas em passaBase (client-side, sobre a lista já carregada em memória).
  // Multi dentro da faceta = OU; entre facetas = E. "QR (não oficial)" = tudo que NÃO é o oficial
  // (inclui canal removido/histórico, transporte desconhecido). filtroTransporte com os 2 = sem efeito.
  const passaBase = (c: WaContact) =>
    (filtroCanais.size === 0 || (!!c.canalId && filtroCanais.has(c.canalId))) &&
    (filtroTransporte.size === 0 || filtroTransporte.size === 2 || (filtroTransporte.has('cloud_api')
      ? transporteDe(c.canalId) === 'cloud_api'
      : transporteDe(c.canalId) !== 'cloud_api')) &&
    (filtroEtapas.size === 0 || (!!c.etapa && filtroEtapas.has(c.etapa))) &&
    (filtroEtiquetas.size === 0 || c.tags.some((t) => filtroEtiquetas.has(t))) &&
    (filtroAtendentes.size === 0 || filtroAtendentes.has(responsavelEfetivo(c) ?? '')) &&
    (filtroIA.size === 0 || (
      (filtroIA.has('ativa') && !!c.iaAtiva) ||
      (filtroIA.has('pausada') && (c.iaStatus === 'pausada' || c.iaStatus === 'handoff')) ||
      (filtroIA.has('humano') && !!c.precisaHumano)
    )) &&
    // Situação REUSA situacaoDaConversa (via situacaoDe) — a MESMA fonte do chip da lista (read-only).
    (filtroSituacao.size === 0 || filtroSituacao.has(situacaoDe(c).variante)) &&
    (!filtroNaoLidas || (c.unread ?? 0) > 0) &&
    (!filtroArquivadas || !!c.arquivada) &&
    dentroPeriodo(c.lastAtMs) &&
    (!term || c.name.toLowerCase().includes(term) || c.last.toLowerCase().includes(term) || (c.phone ?? '').toLowerCase().includes(term));
  const passaTab = (c: WaContact, t: TabId) =>
    t === 'arquivadas' ? !!c.arquivada
    // o toggle "Arquivadas" do painel revela arquivadas em qualquer aba (como a busca já faz)
    : (!c.arquivada || buscaAtiva || filtroArquivadas) && (
      t === 'todos' ? true
      : t === 'meus' ? c.respId === user?.id
      : t === 'naoatrib' ? !c.respId
      : t === 'naolidas' ? (c.unread ?? 0) > 0
      : (c.unread ?? 0) > 0 || !!c.aguardando
    );
  const tabCounts = useMemo(() => {
    const base = contacts.filter(passaBase);
    const n: Record<string, number> = {};
    for (const [t] of TABS) n[t] = base.filter((c) => passaTab(c, t)).length;
    return n;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contacts, filtroCanais, filtroTransporte, filtroEtapas, filtroEtiquetas, filtroAtendentes, filtroIA, filtroSituacao, filtroNaoLidas, filtroArquivadas, filtroPeriodo, canalPorId, term, user?.id]);
  const visiveis = useMemo(() => {
    const lista = contacts.filter((c) => passaBase(c) && passaTab(c, tab));
    return lista.sort((a, b) => (a.fixada === b.fixada ? (b.lastAtMs ?? 0) - (a.lastAtMs ?? 0) : a.fixada ? -1 : 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contacts, tab, filtroCanais, filtroTransporte, filtroEtapas, filtroEtiquetas, filtroAtendentes, filtroIA, filtroSituacao, filtroNaoLidas, filtroArquivadas, filtroPeriodo, canalPorId, term, user?.id]);
  /* agrupamento por responsável — VOCÊ primeiro (seus clientes sempre visíveis no Todos),
     depois Não atribuídos, depois os demais atendentes em ordem alfabética */
  const grupos = useMemo(() => {
    // "Todos" é a visão geral: lista ÚNICA, sem dividir por atendente (pedido do dono)
    if (tab === 'todos') return [['', visiveis]] as [string, WaContact[]][];
    const m = new Map<string, WaContact[]>();
    for (const c of visiveis) {
      const k = responsavelEfetivo(c) ?? '';
      m.set(k, [...(m.get(k) ?? []), c]);
    }
    const uid = user?.id;
    // na aba "Não atribuídos" a fila sem dono continua PRIMEIRO (propósito da aba);
    // nas demais, Você abre a lista
    const rank = (k: string) =>
      tab === 'naoatrib' ? (k === '' ? 0 : 1)
      : uid && k === uid ? 0 : k === '' ? 1 : 2;
    return [...m.entries()].sort((a, b) =>
      rank(a[0]) - rank(b[0]) || (nomePorId(a[0]) ?? '').localeCompare(nomePorId(b[0]) ?? '', 'pt-BR'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visiveis, usuarios, user?.id, tab]);

  /* ---------- envio / composer ---------- */
  const optoutTexto = 'Contato marcado como não incomodar — mensagens bloqueadas.';
  const composerBloqueado = inbox.canalIndisponivel || inbox.semDestino || inbox.canalRestrito || inbox.higieneBloqueia || optout;
  // Acesso rápido aos scripts: abrir o painel glass ancorado no botão; selecionar reusa
  // EXATAMENTE o caminho da tira antiga (setScriptSeq → ScriptSequenceModal), com a mesma
  // trava de opt-out. Nada de envio cego nem inserção no composer.
  const abrirScripts = () => { const r = scrBtnRef.current?.getBoundingClientRect(); if (r) setScrPop((p) => (p ? null : r)); };
  const selecionarScript = (s: Script) => {
    setScrPop(null);
    if (optout) { aoAvisar({ tom: 'erro', texto: optoutTexto }); return; }
    setScriptSeq(s);
  };
  const placeholder = optout ? 'Envio bloqueado: contato pediu para não ser incomodado'
    : inbox.semDestino ? 'Vincule um número para responder'
    : inbox.canalIndisponivel ? 'Envio bloqueado: número desconectado'
    : inbox.canalRestrito ? 'Envio bloqueado: número com restrição no WhatsApp'
    : (textoBloqueio(inbox.higiene) ?? 'Digite sua mensagem...');
  const enviar = () => {
    if (optout) { aoAvisar({ tom: 'erro', texto: optoutTexto }); return; }
    inbox.sendMsg(draft, assinaturaNome || null, () => setDraft(''));
  };
  // auto-altura da caixa (paridade v1 L531-536): roda também na limpeza programática do draft
  // (setDraft('') após enviar não dispara onChange), colapsando o campo em vez de deixá-lo esticado.
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
  }, [draft]);
  const sendDisabled = draft.trim() === '' || inbox.semDestino || optout || (WA_REAL && (!current.id || !inbox.canalConectado));
  const midiaDisabled = inbox.semDestino || inbox.canalRestrito || inbox.higieneBloqueia || optout || (WA_REAL && (!current.id || !inbox.canalConectado));
  const canaisAgendaveis = inbox.realCanais.filter((c) => canalValidoParaEnvio({ id: c.id, status_integracao: c.status, envio_restrito: c.envioRestrito, conflito_com: c.conflitoCom, ativo: true }).ok);
  const agendarDisabled = inbox.semDestino || inbox.higieneBloqueia || optout || (WA_REAL && (!current.id || canaisAgendaveis.length === 0));
  // itens do fio memoizados: construirItensConversa formata Intl.DateTimeFormat por mensagem;
  // sem memo isso refazia a cada tecla do composer / tick de 60s. Só depende das mensagens.
  const itensConversa = useMemo(() => construirItensConversa(current.msgs, (m) => m.tsISO ?? null), [current.msgs]);
  // ---- PEÇA 3: HANDOFF como EVENTO no fio ----
  // "A IA pediu um humano" é o alerta operacional crítico — entra como DIVISOR no ponto
  // certo do fluxo: antes da primeira mensagem após precisa_humano_em; sem timestamp (ou
  // sendo o último evento), ao fim do fio. Item sintético só de exibição — nenhuma
  // semântica muda. Fica de pé enquanto o pedido está de pé: conversas.precisa_humano (que o
  // backend LIMPA quando o humano assume/responde) ou sessão em handoff/aguardando VIVO —
  // nunca pelo flag aguardando_humano sozinho, que sobrevive em sessão pausada (ver iaAguardaVivo).
  const handoffAtivo = !!current.id && (!!current.precisaHumano || iaBar?.status === 'handoff' || iaAguardaVivo);
  const handoffMotivo = motivoHumanoLabel(current.precisaHumanoMotivo) ?? iaBarMotivo;
  const handoffHora = current.precisaHumanoEm
    ? new Date(current.precisaHumanoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
    : null;
  const itensFio = useMemo((): (ItemConversa<WaMessage> | { tipo: 'handoff'; chave: string })[] => {
    if (!handoffAtivo) return itensConversa;
    const ev = { tipo: 'handoff' as const, chave: 'handoff-' + current.id };
    const em = current.precisaHumanoEm ? Date.parse(current.precisaHumanoEm) : NaN;
    if (Number.isFinite(em)) {
      const idx = itensConversa.findIndex((it) => {
        if (it.tipo !== 'msg') return false;
        const ts = it.msg.tsISO ? Date.parse(it.msg.tsISO) : NaN;
        return Number.isFinite(ts) && ts >= em;
      });
      // insere ANTES da primeira mensagem posterior ao pedido. Handoff de VÉSPERA (pedido
      // num dia anterior ao da mensagem seguinte) entra ACIMA do separador de dia dela —
      // senão "· 23:50" renderizado sob o rótulo "Hoje" leria como hora de hoje.
      if (idx >= 0) {
        const alvo = itensConversa[idx];
        const antes = itensConversa[idx - 1];
        const diaEv = chaveDiaSP(current.precisaHumanoEm);
        const pos = antes?.tipo === 'sep' && alvo.tipo === 'msg' && !!diaEv && diaEv !== chaveDiaSP(alvo.msg.tsISO ?? null) ? idx - 1 : idx;
        return [...itensConversa.slice(0, pos), ev, ...itensConversa.slice(pos)];
      }
    }
    return [...itensConversa, ev];
  }, [itensConversa, handoffAtivo, current.id, current.precisaHumanoEm]);

  /* ---------- popovers em portal (regra 10) ---------- */
  const raizPop = useMemo(() => {
    // usa a CONSTANTE (sem efeito colateral): criarRaizPortalV2() anexaria um <div> ao body
    // que aqui só leríamos pelo className — deixando um nó órfão por montagem. A raiz real é
    // o div [data-wa-pop] criado/reutilizado abaixo, que já carrega a classe .v2 (regra 10).
    const className = CLASSE_RAIZ_PORTAL;
    let el = document.querySelector(`.${className.split(' ').join('.')}[data-wa-pop]`) as HTMLElement | null;
    if (!el) {
      el = document.createElement('div');
      el.className = className;
      el.setAttribute('data-wa-pop', '1');
      document.body.appendChild(el);
    }
    return el;
  }, []);
  useEffect(() => {
    if (!pop) return;
    const f = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('.wa-pop')) setPop(null); };
    const r = () => setPop(null);
    document.addEventListener('mousedown', f);
    window.addEventListener('resize', r);
    return () => { document.removeEventListener('mousedown', f); window.removeEventListener('resize', r); };
  }, [pop]);
  const abrirPop = (kind: Pop extends null ? never : Exclude<Pop, null>['kind'], e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = Math.min(r.left, window.innerWidth - 300);
    setPop((p) => (p?.kind === kind ? null : { kind, x, y: r.bottom + 6 }));
  };

  /* ---------- edição de dados (painel) ---------- */
  const iniciarEdicao = () => {
    setEditForm({ nome: current.name, email: current.email, observacoes: current.notes, responsavelId: current.respId ?? '' });
    setEditMode(true);
    setCtxAberto(true);
  };
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);
  const salvarEdicao = async () => {
    if (salvandoEdicao) return;
    if (editForm.email && !EMAIL_RE.test(editForm.email)) { aoAvisar({ tom: 'erro', texto: 'E-mail inválido.' }); return; }
    setSalvandoEdicao(true);
    inbox.aplicarEdicaoLocal({ name: editForm.nome, email: editForm.email, notes: editForm.observacoes, respId: editForm.responsavelId || null });
    try {
      if (WA_REAL && current.contatoId) {
        await acoes.atualizarContato(current.contatoId, {
          nome: editForm.nome, email: editForm.email || null, observacoes: editForm.observacoes || null,
          responsavel_id: editForm.responsavelId || null,
        });
      }
      aoAvisar({ tom: 'ok', texto: 'Dados do cliente salvos' });
      setEditMode(false);
    } catch (e) {
      aoAvisar({ tom: 'erro', texto: (e as Error)?.message || 'Falha ao salvar.' });
    } finally { setSalvandoEdicao(false); }
  };
  const copiarTelefone = async () => {
    if (!current.phone) { aoAvisar({ tom: 'erro', texto: 'Este contato não tem telefone.' }); return; }
    const tel = current.phone.replace(/\D/g, '') || current.phone;
    try {
      await navigator.clipboard.writeText(tel);
      aoAvisar({ tom: 'ok', texto: 'Telefone copiado: ' + tel });
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = tel;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
        aoAvisar({ tom: 'ok', texto: 'Telefone copiado: ' + tel });
      } catch { aoAvisar({ tom: 'erro', texto: 'Não foi possível copiar o telefone' }); }
    }
  };

  const statusAtivos = statusQ.data?.filter((s) => s.ativo) ?? [];
  // Etapas do Kanban presentes na fila atual (nome + cor), para filtrar a lista por etapa.
  const etapasFiltro = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const c of contacts) {
      const nome = (c.etapa ?? '').trim();
      if (nome && !m.has(nome)) m.set(nome, c.etapaCor ?? null);
    }
    return [...m.entries()].map(([nome, cor]) => ({ nome, cor })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [contacts]);
  // RESUMO ATIVO: um chip removível por valor de faceta aplicado (+ "Limpar tudo" no painel).
  const rotuloCanal = (id: string) => canalPorId.get(id)?.alias ?? 'Número removido';
  const rotuloSituacao = (v: string) => SITUACAO_OPCOES.find(([k]) => k === v)?.[1] ?? v;
  const rotuloIA = (v: string) => IA_OPCOES.find(([k]) => k === v)?.[1] ?? v;
  const resumoFiltros = useMemo(() => {
    const out: { key: string; label: string; remover: () => void }[] = [];
    for (const id of filtroCanais) out.push({ key: 'canal:' + id, label: rotuloCanal(id), remover: () => alternarSet(setFiltroCanais, id) });
    for (const t of filtroTransporte) out.push({ key: 'transp:' + t, label: t === 'cloud_api' ? 'Oficial' : 'QR', remover: () => alternarSet(setFiltroTransporte, t) });
    for (const e of filtroEtapas) out.push({ key: 'etapa:' + e, label: e, remover: () => alternarSet(setFiltroEtapas, e) });
    for (const et of filtroEtiquetas) out.push({ key: 'etq:' + et, label: et, remover: () => alternarSet(setFiltroEtiquetas, et) });
    for (const a of filtroAtendentes) out.push({ key: 'at:' + a, label: a === '' ? 'Não atribuído' : (nomePorId(a) ?? 'Atendente'), remover: () => alternarSet(setFiltroAtendentes, a) });
    for (const i of filtroIA) out.push({ key: 'ia:' + i, label: rotuloIA(i), remover: () => alternarSet(setFiltroIA, i) });
    for (const s of filtroSituacao) out.push({ key: 'sit:' + s, label: rotuloSituacao(s), remover: () => alternarSet(setFiltroSituacao, s) });
    if (filtroNaoLidas) out.push({ key: 'naolidas', label: 'Não lidas', remover: () => setFiltroNaoLidas(false) });
    if (filtroArquivadas) out.push({ key: 'arquivadas', label: 'Arquivadas', remover: () => setFiltroArquivadas(false) });
    if (filtroPeriodo) out.push({ key: 'periodo', label: PERIODO_OPCOES.find(([k]) => k === filtroPeriodo)?.[1] ?? filtroPeriodo, remover: () => setFiltroPeriodo(null) });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroCanais, filtroTransporte, filtroEtapas, filtroEtiquetas, filtroAtendentes, filtroIA, filtroSituacao, filtroNaoLidas, filtroArquivadas, filtroPeriodo, canalPorId, nomeMap]);
  const statusFechada = statusQ.data?.find((s) => (s.slug ?? s.nome).toLowerCase() === 'fechada');
  const aplicarStatus = async (id: string) => {
    const st = statusAtivos.find((s) => s.id === id);
    inbox.setContacts((cur) => cur.map((c) => (c.id === current.id ? { ...c, statusId: id, status: st?.nome ?? c.status, statusCor: st?.cor ?? c.statusCor } : c)));
    if (!WA_REAL) return;
    try { await acoes.definirStatusConversa(current.id, id); } catch { aoAvisar({ tom: 'erro', texto: 'Falha ao alterar status' }); }
  };
  const alternarEtiqueta = async (nome: string) => {
    const aplicar = !current.tags.includes(nome);
    const novas = aplicar ? [...current.tags, nome] : current.tags.filter((t) => t !== nome);
    inbox.setContacts((cur) => cur.map((c) => (c.id === current.id ? { ...c, tags: novas } : c)));
    if (!WA_REAL) return;
    try {
      await acoes.definirEtiquetasConversa(current.id, novas);
      // ponte com o Kanban: espelha no CONTATO — o card do funil lê etiquetas do contato
      if (current.contatoId) await acoes.espelharEtiquetaContato(current.contatoId, nome, aplicar);
    } catch { aoAvisar({ tom: 'erro', texto: 'Falha ao salvar etiquetas' }); }
  };
  /** Cria (se não existir, com a cor escolhida da PALETA_CORES) e aplica na conversa.
      Nome já existente (case-insensitive) só aplica — não duplica o catálogo.
      Caminho de escrita INALTERADO: criarEtiqueta + alternarEtiqueta (cache text[]). */
  const criarEAplicarEtiqueta = async (nome: string, cor: string) => {
    const nm = nome.trim();
    if (!nm) return;
    const lista = etiquetasQ.data ?? [];
    const existente = lista.find((t) => t.nome.toLocaleLowerCase('pt-BR') === nm.toLocaleLowerCase('pt-BR'));
    try {
      if (!existente) await acoes.criarEtiqueta(nm, cor, null);
      const alvo = existente?.nome ?? nm;
      if (!current.tags.includes(alvo)) await alternarEtiqueta(alvo);
      aoAvisar({ tom: 'ok', texto: existente ? `Etiqueta "${alvo}" aplicada` : `Etiqueta "${alvo}" criada e aplicada` });
    } catch (e) {
      aoAvisar({ tom: 'erro', texto: 'Falha na etiqueta: ' + ((e as Error)?.message ?? '') });
    }
  };

  /* cobranças do contexto (agregação client-side — precedente Contatos) */
  const cobrancasCtx = useMemo(() => {
    const todas = cobrancasQ.data ?? [];
    return todas
      .filter((p) => p.contatoId && p.contatoId === current.contatoId)
      .slice(0, 2);
  }, [cobrancasQ.data, current.contatoId]);

  const alertasDe = (c: WaContact): string[] => {
    const wait = tierEspera(c.aguardando ? c.aguardandoDesde : null, relogioMs);
    const atrasado = wait && (wait.tier === 'critico' || wait.tier === 'vermelho');
    const out: string[] = [];
    if (atrasado && wait) out.push('Sem resposta ' + wait.label.replace('Aguardando ', ''));
    for (const a of slaPorConversa.get(c.id) ?? []) out.push(tipoLabel(a.tipo) + (a.detalhe ? ' — ' + a.detalhe : ''));
    if (c.precisaHumano) out.push('Precisa de atendimento humano');
    if (analisarNome(c.name).fraco && conversaAtiva({ status: c.status, arquivada: c.arquivada })) out.push('Cadastro incompleto: preencha o nome do cliente');
    // opt-out NÃO entra no agregado ⚠ — já tem chip dedicado "Não incomodar" (evita sinal em dobro)
    return out;
  };

  /* ---------- render ---------- */
  return (
    <div className="wa-pg">
      {/* ===================== FILA ===================== */}
      {!foco && (
        <aside className="wa-fila">
          <div className="wa-ftopo">
            <div className="l1">
              <h3>Conversas</h3>
              <div className="bts">
                <button type="button" className={'ib2' + (filtrosAtivos ? ' on' : '')} title={filtrosAtivos ? `Filtros ativos (${resumoFiltros.length})` : 'Filtros'} onClick={(e) => abrirPop('filtro', e)}>
                  <IcFunil />{filtrosAtivos && <span className="fbadge num">{resumoFiltros.length}</span>}
                </button>
                <button type="button" className="ib2" title="Nova conversa" aria-label="Nova conversa" onClick={() => setNovaConversa(true)}><IcMais /></button>
              </div>
            </div>
            <div className="wa-busca">
              <IcBusca />
              <input className="inp" placeholder="Buscar conversas..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="wa-abas" role="tablist">
              {TABS.map(([id, rot]) => (
                <button
                  key={id} type="button" role="tab" aria-selected={tab === id}
                  className={'wa-aba' + (tab === id ? ' on' : '')}
                  title={id === 'pendentes' ? 'Pendentes inclui mensagens não lidas e clientes aguardando resposta.' : undefined}
                  onClick={() => mudarAba(id)}
                >
                  {rot}{(tabCounts[id] ?? 0) > 0 && <span className="n num">{tabCounts[id]}</span>}
                </button>
              ))}
            </div>
            {resumoFiltros.length > 0 && (
              <div className="wa-fchips" role="list" aria-label="Filtros aplicados">
                {resumoFiltros.map((f) => (
                  <button key={f.key} type="button" role="listitem" className="wa-fchip" title={'Remover filtro: ' + f.label} onClick={f.remover}>
                    <span className="tt">{f.label}</span><span className="x" aria-hidden>×</span>
                  </button>
                ))}
                <button type="button" className="wa-fchip limpar" title="Remover todos os filtros" onClick={limparFiltros}>Limpar tudo</button>
              </div>
            )}
          </div>
          <div className="wa-lista">
            {WA_REAL && inbox.live.isError && contacts.length === 0 ? (
              /* contrato item 7: erro desenhado com "Tentar de novo" (auditoria) */
              <EstadoErro descricao="Erro ao carregar as conversas." aoTentarDeNovo={() => void inbox.live.refetch()} />
            ) : WA_REAL && inbox.live.isLoading && contacts.length === 0 ? (
              <div className="wa-skel" aria-busy aria-label="Carregando conversas">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <div className="row" key={i}>
                    <Skeleton largura={33} altura={33} raio={99} />
                    <div style={{ flex: 1 }}><Skeleton largura="60%" /><div style={{ height: 5 }} /><Skeleton largura="85%" /></div>
                  </div>
                ))}
              </div>
            ) : visiveis.length === 0 ? (
              <div className="wa-vazio">Nenhuma conversa nesta aba.</div>
            ) : (
              grupos.map(([respId, lista]) => {
                // "Todos" é lista única (sem cabeçalho) — nunca recolhe
                // busca ativa ignora o recolhimento: resultado escondido confunde
                const fechado = tab !== 'todos' && gruposFechados.has(respId) && !buscaAtiva;
                // grupo fechado não pode esconder urgência: soma de não lidas + ⚠ de espera estourada
                const naoLidasGrupo = fechado ? lista.reduce((s, c) => s + (c.unread ?? 0), 0) : 0;
                const atrasoGrupo = fechado && lista.some((c) => {
                  const w = tierEspera(c.aguardando ? c.aguardandoDesde : null, relogioMs);
                  return !!w && (w.tier === 'vermelho' || w.tier === 'critico');
                });
                return (
                <div key={respId || '(fila)'}>
                  {tab !== 'todos' && (
                  <button
                    type="button" className={'wa-grupo' + (fechado ? ' fech' : '')} aria-expanded={!fechado}
                    title={buscaAtiva ? 'Limpe a busca para recolher grupos' : fechado ? 'Mostrar as conversas deste grupo' : 'Recolher este grupo'}
                    onClick={() => { if (!buscaAtiva) alternarGrupo(respId); }}
                  >
                    <span className="seta" aria-hidden>▾</span>
                    <span className="rot">
                      {respId ? <>Atendimento distribuído para <b>{respId === user?.id ? 'Você' : nomePorId(respId) ?? 'Atendente'}</b></> : 'Não atribuídos'}
                    </span>
                    <span className="num qt">{lista.length}</span>
                    {atrasoGrupo && <span className="galer" title="Há conversas aguardando resposta há tempo demais neste grupo">⚠</span>}
                    {naoLidasGrupo > 0 && <span className="gnl num" title={`${naoLidasGrupo} não lidas neste grupo`}>{naoLidasGrupo > 99 ? '99+' : naoLidasGrupo}</span>}
                  </button>
                  )}
                  {!fechado && lista.map((c) => {
                    const wait = tierEspera(c.aguardando ? c.aguardandoDesde : null, relogioMs);
                    const atrasado = wait && (wait.tier === 'critico' || wait.tier === 'vermelho');
                    const alertas = alertasDe(c);
                    const finalizado = c.status === 'Resolvida' || c.status === 'Fechada';
                    const sit = situacaoDe(c);
                    const transporte = transporteDe(c.canalId);
                    const oficial = transporte === 'cloud_api';
                    return (
                      <button
                        key={c.id} type="button" data-cid={c.id}
                        className={'conv2 spot' + (wait ? ` t-${wait.tier}` : '') + (c.id === currentId ? ' ativa' : '')}
                        title={`Atendente: ${c.respId ? nomePorId(c.respId) ?? 'Atendente' : 'Não atribuído'} · Canal: ${tituloCanal(c.chip, transporte)} · ${finalizado ? 'Finalizado' : c.status || 'Em atendimento'} · ${c.time}`}
                        onClick={() => inbox.selectContact(c.id)}
                      >
                        <span className="av2">{initials(nomeExibicao(c))}{c.canalAtual && <span className={'sig' + (oficial ? ' of' : '')} title={tituloCanal(c.canalAtual, transporte)}>{oficial ? '✓ ' : ''}{c.canalAtual.slice(0, 2)}</span>}</span>
                        <span className="tx">
                          <span className="n">
                            {c.fixada && <span className="fl" title="Fixada">📌</span>}
                            {c.silenciada && <span className="fl" title="Silenciada">🔕</span>}
                            {c.arquivada && <span className="fl" title="Arquivada">🗄️</span>}
                            {nomeExibicao(c)}
                          </span>
                          <span className="p">{c.last || '—'}</span>
                          <span className="chips">
                            {(() => { const cor = corDaSituacao(c, sit.texto); return <span className={'cchip etapa sit-' + sit.variante} title="Situação no funil" style={cor ? { background: cor + '26', color: cor } : undefined}>{sit.texto}</span>; })()}
                            {c.iaAtiva && <span className="cchip ia" title="A IA/bot está atendendo esta conversa agora"><IcBot />IA</span>}
                            {alertas.length > 0 && <span className="cchip alerta" title={alertas.join(' · ')}>⚠{alertas.length > 1 ? ' ' + alertas.length : ''}</span>}
                            {c.contatoId && bloqueados.has(c.contatoId) && <span className="cchip alerta" style={{ color: 'var(--rubro)', borderColor: 'rgba(var(--rubro-rgb),.4)' }} title={optoutTexto}>Não incomodar</span>}
                            {/* "Finalizado" só quando a situação NÃO já é terminal (ganho/perdido/cancelado) — evita verde ao lado de PERDIDO (Adendo 3) */}
                            {finalizado && !['ganho', 'perdido', 'cancelado'].includes(sit.variante) && <span className="cchip fim">Finalizado</span>}
                            {c.tags.slice(0, 2).map((t) => <EtiquetaChip key={t} size="sm" nome={t} cor={corDaEtiqueta(t, etiquetasQ.data)} title={'Etiqueta: ' + t} />)}
                            {c.tags.length > 2 && <EtiquetaChip size="sm" mais nome={'+' + (c.tags.length - 2)} title={c.tags.slice(2).join(' · ')} />}
                          </span>
                        </span>
                        <span className="m">
                          <span className="h2 num" title={'Última interação: ' + c.time}>{c.lastAtMs ? tempoRelativo(new Date(c.lastAtMs).toISOString(), relogioMs) : c.time}</span>
                          {(c.unread ?? 0) > 0 && <span className="nl num" title={`${c.unread} não lidas`}>{(c.unread ?? 0) > 99 ? '99+' : c.unread}</span>}
                          {wait && <span className={'cr num' + (atrasado ? ' g' : '')}>{wait.label.replace('Aguardando ', '').replace('há ', '')}</span>}
                        </span>
                      </button>
                    );
                  })}
                </div>
                );
              })
            )}
          </div>
        </aside>
      )}

      {/* ===================== CONVERSA ===================== */}
      <section className="wa-conv">
        {aviso && (
          <div className={aviso.tom === 'erro' ? 'aviso-inline erro' : 'aviso-inline'} role="status">
            {aviso.texto}
            <button type="button" onClick={() => setAviso(null)} aria-label="Fechar aviso">×</button>
          </div>
        )}
        {!current.id ? (
          <div className="wa-conv-vazia">
            <IcWa />
            <div className="t">Selecione uma conversa</div>
            <div className="d">Escolha uma conversa na lista ou inicie um novo atendimento.</div>
            <BotaoPrimario onClick={() => setNovaConversa(true)}>Nova conversa</BotaoPrimario>
          </div>
        ) : (
          <>
            <div className="wa-ctopo">
              <button type="button" className="ib2 wa-ftopo-solto" style={{ display: 'none' }} aria-hidden />
              <span className="av2 conv2-av" style={{ display: 'flex', width: 32, height: 32, borderRadius: '50%', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 12 }}>{initials(nomeExibicao(current))}</span>
              <div className="idw">
                <div className="nm">{nomeExibicao(current)}</div>
                <div className="sb num">
                  {current.phone ? mascararNumero(current.phone) : 'sem número'}
                  <SituacaoChipTopo lead={current} demo={demo} />
                  {inbox.canalSel
                    ? <span className={'wa-hchip' + (canalEhCloud ? ' of' : '')} title={`Respondendo por ${inbox.canalSel.alias}${inbox.canalSel.numero ? ' · ' + mascararNumero(inbox.canalSel.numero) : ''} · ${canalEhCloud ? 'OFICIAL (API do WhatsApp/Meta)' : 'número conectado por QR (não oficial)'}`}>{canalEhCloud ? '✓ ' : ''}{inbox.canalSel.alias}</span>
                    : current.chip && (() => { const t = transporteDe(current.canalId); return <span className={'wa-hchip' + (t === 'cloud_api' ? ' of' : '')} title={tituloCanal(current.chip, t)}>{t === 'cloud_api' ? '✓ ' : ''}{current.chip}</span>; })()}
                  {WA_REAL && canalEhCloud && janelaQ.data && (
                    <span className={'janela' + (janelaQ.data.aberta ? '' : ' fechada')} title={janelaQ.data.aberta ? 'Dentro das 24 horas: dá para responder com texto livre por este número.' : 'Passaram 24 horas desde a última mensagem do cliente PARA ESTE número. Só um modelo aprovado pela Meta pode sair daqui.'}>
                      {rotuloJanela(janelaQ.data)}
                    </span>
                  )}
                  <span className="wa-hchip" title="Atendente responsável">{current.respId ? nomePorId(current.respId) ?? 'Atendente' : 'Não atribuído'}</span>
                  {current.tags.slice(0, 3).map((t) => <EtiquetaChip key={t} nome={t} cor={corDaEtiqueta(t, etiquetasQ.data)} title={'Etiqueta: ' + t} />)}
                  {current.tags.length > 3 && <EtiquetaChip mais nome={'+' + (current.tags.length - 3)} title={current.tags.slice(3).join(' · ')} />}
                </div>
              </div>
              <div className="dir">
                <EtapaTopoSel lead={current} demo={demo} aoAvisar={aoAvisar} />
                {inbox.donoEfetivo
                  ? <BotaoMini title="Transferir atendimento" onClick={() => setTransferirAberto(true)}>Transferir</BotaoMini>
                  : <BotaoSec mini title="Assumir atendimento" disabled={inbox.atribuindo} onClick={inbox.assumir}>Assumir</BotaoSec>}
                <BotaoMini title={current.arquivada ? 'Desarquivar conversa' : 'Arquivar conversa'} onClick={() => inbox.arquivar(!current.arquivada)}>{current.arquivada ? 'Desarquivar' : 'Arquivar'}</BotaoMini>
                {current.id && (iaEstado?.existe || iaAtiva) && (
                  <BotaoMini className={iaAtiva ? 'ia-on' : ''} disabled={iaToggle.isPending}
                    title={iaAtiva ? ('IA atendendo' + (iaEstado?.etapa ? ' (' + iaEstado.etapa + ')' : '') + ' — clique para desligar e assumir') : (iaEstado?.aguardando_humano ? 'IA aguardando você assumir — clique para reativar a IA' : 'Ligar a IA nesta conversa')}
                    onClick={alternarIa}>{iaAtiva ? 'IA ligada' : 'IA desligada'}</BotaoMini>
                )}
                {!ctxAberto && <BotaoMini title="Abrir painel de dados do contato" onClick={() => setCtxAberto(true)}>Dados</BotaoMini>}
                <button type="button" className={'ib2' + (foco ? ' on' : '')} title="Modo de foco (Esc para sair)" onClick={() => setFoco((f) => !f)} style={{ width: 26, height: 26 }}><IcFoco /></button>
                <button type="button" className="ib2" title="Ações" aria-label="Ações da conversa" style={{ width: 26, height: 26 }} onClick={(e) => abrirPop('acoes', e)}><IcDots /></button>
              </div>
            </div>

            {/* PEÇA 1 — BARRA DE ESTADO DA IA: faixa fixa sob o cabeçalho, visível sempre que há
                sessão de IA. Superfície SÓLIDA de propósito (faixa de estado, não overlay → sem
                glass; lite-safe por construção). Cor SÓ no semântico do estado.
                "Assumir" grava o responsável mas NÃO para o bot sozinho (ele só para quando o
                atendente manda mensagem ou pausa a IA) — por isso "Pausar IA" fica destacado
                quando a IA está ativa: anti-colisão, pare o bot ANTES de digitar. */}
            {iaBarSinal && (
              <div className={'wa-iabar ' + iaBarSinal.cls} role="status">
                <span className="glifo" aria-hidden><IcBot /></span>
                <span className="dot" aria-hidden />
                <b className="est">{iaBarSinal.rotulo}</b>
                {iaBar?.etapa && <span className="etp" title={'Etapa atual do fluxo da IA: ' + iaBar.etapa}>· {etapaIaLabel(iaBar.etapa)}</span>}
                {iaBarMotivo && <span className="mot" title="Por que a IA pediu um humano">· {iaBarMotivo}</span>}
                <span className="acts">
                  {!inbox.donoEfetivo && (
                    <BotaoMini disabled={inbox.atribuindo} title="Grava você como responsável. NÃO pausa a IA sozinho — ela só para quando você manda mensagem ou quando é pausada." onClick={inbox.assumir}>Assumir</BotaoMini>
                  )}
                  {/* anti-colisão: com a IA ativa, "Pausar IA" é A ação da barra → sólido (padrão
                      dos primários mini dos painéis); reativar é secundário → ghost */}
                  {iaBarAtiva ? (
                    <BotaoPrimario mini disabled={iaToggle.isPending}
                      title="Pare a IA antes de digitar — evita você e o bot responderem juntos em cima do cliente."
                      onClick={() => { if (!WA_REAL) { aoAvisar({ tom: 'ok', texto: 'Demonstração: a IA seria pausada' }); return; } void alternarIa(); }}>
                      Pausar IA
                    </BotaoPrimario>
                  ) : (
                    <BotaoMini disabled={iaToggle.isPending} title="Reativar a IA nesta conversa."
                      onClick={() => { if (!WA_REAL) { aoAvisar({ tom: 'ok', texto: 'Demonstração: a IA seria reativada' }); return; } void alternarIa(); }}>
                      Reativar IA
                    </BotaoMini>
                  )}
                </span>
              </div>
            )}

            {/* OPT-OUT inviolável — precedente Contatos */}
            {optout && (
              <div className="wa-banner bloq" role="alert">
                <b>Não incomodar ativo.</b> Nenhuma mensagem (bot, régua ou agendamento) é enviada a este contato.
              </div>
            )}
            {/* higiene 1 — dono */}
            {WA_REAL && !!current.id && inbox.higiene.dono !== 'livre' && (
              <div className={'wa-banner' + (inbox.higiene.dono === 'bloqueia' ? ' bloq' : '')} title={'Esta conversa ainda não tem responsável. Assuma o atendimento para responder e evitar perda de lead.' + (inbox.higiene.dono === 'bloqueia' ? '' : ' Em breve isto será obrigatório.')}>
                <span><b>Sem responsável</b>{inbox.higiene.dono === 'bloqueia' ? ' — obrigatório para responder' : ''}</span>
                <span className="acts"><BotaoMini disabled={inbox.atribuindo} onClick={inbox.assumir}>Assumir</BotaoMini></span>
              </div>
            )}
            {/* higiene 2 — nome */}
            {WA_REAL && !!current.id && inbox.higiene.dono === 'livre' && inbox.decNome.acao !== 'livre' && (
              <div className={'wa-banner' + (inbox.decNome.acao === 'bloqueia' ? ' bloq' : '')}>
                <span>
                  <b>{inbox.decNome.acao === 'bloqueia' ? 'Nome obrigatório' : 'Cadastro incompleto'}</b>
                  {inbox.decNome.analise?.motivo === 'comercio' ? ' · parece comércio' : ''}
                  {inbox.decNome.podeAdiar && inbox.decNome.adiamentosRestantes < 2 ? (inbox.decNome.adiamentosRestantes === 1 ? ' · resta 1 adiamento' : ` · restam ${inbox.decNome.adiamentosRestantes} adiamentos`) : ''}
                </span>
                <span className="acts">
                  <BotaoMini onClick={iniciarEdicao}>Editar nome</BotaoMini>
                  {inbox.decNome.podeAdiar && <BotaoMini disabled={inbox.adiando} onClick={inbox.adiarNome}>Lembrar depois</BotaoMini>}
                  {inbox.decNome.acao === 'bloqueia' && <BotaoMini disabled={inbox.adiando} title="Libera por 24h e fica registrado" onClick={inbox.nomeNaoInformado}>Cliente ainda não informou</BotaoMini>}
                </span>
              </div>
            )}

            <div className="wa-msgs" ref={msgsRef}>
              {itensFio.map((item, i) =>
                item.tipo === 'handoff' ? (
                  /* PEÇA 3 — o alerta é perceptível sem gritar: hairline + glifo + bolinha âmbar
                     (a única cor) + tinta levíssima, no ponto do handoff */
                  <div className="wa-handoff" key={item.chave} role="alert">
                    <span className="glifo" aria-hidden><IcBot /></span>
                    <span className="tt">
                      <span className="dot" aria-hidden />
                      <span className="tx">
                        <b>A IA pediu um humano</b>
                        {handoffMotivo && <> — {handoffMotivo}</>}
                        {handoffHora && <span className="hh num"> · {handoffHora}</span>}
                      </span>
                    </span>
                  </div>
                ) : item.tipo === 'sep' ? (
                  <div className="dia" key={'sep-' + i}>{item.label}</div>
                ) : (
                  <Bolha
                    key={item.msg.id ?? item.msg.cid ?? 'i' + i}
                    m={item.msg} demo={demo} nomeCliente={nomeExibicao(current)}
                    retryId={inbox.retryId} removendoId={inbox.removendoId} semDestino={inbox.semDestino} optout={optout}
                    aoResponder={(m) => {
                      inbox.setReplyTo({
                        id: m.id ?? '', idExt: m.idExterno, fromMe: m.dir === 'out', tipo: m.tipo,
                        texto: (m.text || (m.tipo === 'audio' ? 'Mensagem de voz' : m.tipo === 'imagem' ? 'Imagem' : m.tipo === 'video' ? 'Vídeo' : m.tipo === 'documento' ? 'Documento' : '')).slice(0, 300),
                        remetente: m.dir === 'out' ? (assinaturaNome || 'Você') : (current.name || 'Cliente'),
                      });
                      textareaRef.current?.focus();
                    }}
                    aoVerErro={(m) => setVerErro(traduzErroEnvio(m.erro ?? ''))}
                    aoRetry={inbox.retryMsg}
                    aoRemover={(m) => setRemoverAlvo(m)}
                    aoLightbox={setLightbox}
                    aoRecarregarAudio={async (m) => {
                      if (!WA_REAL || !m.id) return;
                      try { await waRecarregarAudio(currentOrg.id, m.id); await inbox.msgsQ.refetch(); }
                      catch { aoAvisar({ tom: 'erro', texto: 'Não foi possível recarregar o áudio.' }); }
                    }}
                  />
                ),
              )}
            </div>

            <div className="wa-composer">
              <div className="wa-linha-resp">
                Responder por:
                {demo ? (
                  ['Chip 1', 'Chip 2', 'Chip 3'].map((chip) => (
                    <button key={chip} type="button" className={'wa-chipbtn' + (inbox.replyChip === chip ? ' on' : '')} onClick={() => inbox.onReplyChip(chip)}>{chip}</button>
                  ))
                ) : inbox.realCanais.length === 0 ? (
                  <>Nenhum número conectado · <button type="button" className="lnk" style={{ background: 'none', border: 'none', color: 'var(--txt-2)', textDecoration: 'underline', cursor: 'pointer', fontSize: 10.5, fontFamily: 'var(--fonte)' }} onClick={() => nav('/integracoes')}>conectar</button></>
                ) : (
                  inbox.realCanais.map((c) => (
                    <button
                      key={c.id} type="button"
                      className={'wa-chipbtn' + (inbox.replyCanalId === c.id ? ' on' : '') + (c.status !== 'conectado' ? ' off' : '')}
                      title={c.status !== 'conectado' ? `Indisponível (${c.status})` : tituloCanal(c.alias, c.transporte)}
                      onClick={() => inbox.onReplyCanal(c.id)}
                    >
                      {c.alias}<span className={'oftag' + (c.transporte === 'cloud_api' ? '' : ' qr')}>{c.transporte === 'cloud_api' ? '✓ Oficial' : 'QR'}</span>
                    </button>
                  ))
                )}
              </div>

              {/* avisos do composer (cascata v1 + opt-out) */}
              {optout && (
                <div className="wa-aviso bloq" title={optoutTexto}><b>Não incomodar</b> — este contato pediu para não receber mensagens</div>
              )}
              {inbox.canalRestrito && !inbox.canalIndisponivel && inbox.canalSel && (
                <div className="wa-aviso bloq" title={`O número ${inbox.canalSel.alias} está com restrição no WhatsApp e está indisponível para envio. Selecione outro canal em "Responder por" para responder.`}>
                  <b>{inbox.canalSel.alias}</b> com restrição no WhatsApp — selecione outro canal
                </div>
              )}
              {!inbox.canalRestrito && WA_REAL && inbox.canalSel && inbox.canalSel.status === 'conectado' && (inbox.canalSel.entregaStatus === 'restrito' || inbox.canalSel.entregaStatus === 'instavel' || inbox.envioSaude !== 'ok') && (
                <div className="wa-aviso info" title={
                  inbox.canalSel.entregaStatus === 'restrito'
                    ? `Este canal (${inbox.canalSel.alias}) está conectado, mas falhou na entrega de mensagens recentes. Prefira outro canal em "Responder por" e evite reconectar repetidamente.`
                    : inbox.envioSaude === 'indisponivel'
                      ? `O envio por ${inbox.canalSel.alias} não está saindo agora. Você pode responder por outro número — o envio por outro número muda o remetente para o cliente.`
                      : `O envio pelo canal ${inbox.canalSel.alias} está instável agora (algumas mensagens estão falhando). Se falhar, selecione outro canal em "Responder por".`
                }>
                  {inbox.canalSel.entregaStatus === 'restrito' ? <><b>{inbox.canalSel.alias}</b> falhou na entrega recente</>
                    : inbox.envioSaude === 'indisponivel' ? <><b>{inbox.canalSel.alias}</b> recebe, mas não envia agora</>
                    : <>Envio instável por <b>{inbox.canalSel.alias}</b></>}
                </div>
              )}
              {inbox.semDestino && (
                <div className="wa-aviso bloq" title="Esta conversa foi recebida por uma identidade protegida do WhatsApp e ainda não possui um número confirmado para resposta. O histórico permanece.">
                  Identidade protegida — sem número para resposta
                  <button type="button" className="lnk" onClick={() => setVincAberto(true)}>Vincular número</button>
                </div>
              )}

              {/* agendadas na conversa */}
              {(agendadasQ.data ?? []).filter((a) => ['agendada', 'processando', 'falhou', 'bloqueada'].includes(a.status)).map((a) => (
                <div className="ag-mini num" key={a.id}>
                  <IcClock />
                  <b>{a.status === 'agendada' ? 'Agendada' : a.status === 'processando' ? 'Enviando…' : a.status === 'bloqueada' ? 'Bloqueada' : 'Falhou'}</b>
                  para {new Date(a.executarEm).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}
                  · {({ texto: 'Texto', imagem: 'Imagem', audio: 'Áudio', video: 'Vídeo', documento: 'Documento' } as Record<string, string>)[a.tipo] ?? a.tipo}
                  {a.nomeArquivo ? ` · ${a.nomeArquivo}` : ''}{a.nomeCanal ? ` · via ${a.nomeCanal}` : ''}{a.criadoPor && nomePorId(a.criadoPor) ? ` · por ${nomePorId(a.criadoPor)}` : ''}
                  {(a.ultimoErro || a.motivoBloqueio) && <span className="err">{a.ultimoErro ?? a.motivoBloqueio}</span>}
                  {a.status === 'agendada' && (
                    <>
                      <button type="button" className="lnk" onClick={() => { setAgEditId(a.id); setAgendarAberto(true); }}>Editar</button>
                      <button type="button" className="lnk" onClick={() => setCancelarAgId(a.id)}>
                        Cancelar
                      </button>
                    </>
                  )}
                </div>
              ))}

              {inbox.replyTo && (
                <div className="reply-box">
                  <div>
                    <div className="rem">Respondendo a {inbox.replyTo.remetente}</div>
                    <div className="tt">{inbox.replyTo.texto || (inbox.replyTo.tipo === 'audio' ? 'Mensagem de voz' : inbox.replyTo.tipo === 'imagem' ? 'Imagem' : inbox.replyTo.tipo === 'video' ? 'Vídeo' : 'Documento')}</div>
                  </div>
                  <button type="button" className="x" aria-label="Cancelar resposta" onClick={() => inbox.setReplyTo(null)}>×</button>
                </div>
              )}

              <div className="cmsg">
                <textarea
                  ref={textareaRef} rows={1} value={draft} placeholder={placeholder} disabled={composerBloqueado}
                  onChange={(e) => { setDraft(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'; }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); return; }
                    // "/" com a mensagem vazia abre o painel de scripts (a via mais rápida do teclado)
                    if (e.key === '/' && draft === '' && scripts.length > 0 && !composerBloqueado) { e.preventDefault(); abrirScripts(); }
                  }}
                />
                <div className="tools">
                  <button type="button" className="tool" title="Enviar imagem" disabled={midiaDisabled} onClick={() => setImgModal(true)}><IcImg /></button>
                  <button type="button" className="tool" title="Enviar vídeo" disabled={midiaDisabled} onClick={() => setVideoModal(true)}><IcVideo /></button>
                  <AudioRecorderV2 disabled={midiaDisabled} onEnviar={inbox.enviarAudio} />
                  {/* Scripts encaixado aqui, no lugar do antigo "Arquivo": um botão abre o painel glass
                      (busca + favoritos + categorias). Clique reusa setScriptSeq → ScriptSequenceModal. */}
                  {scripts.length > 0 && (
                    <button
                      ref={scrBtnRef} type="button" className={'wa-scr-btn' + (scrPop ? ' on' : '')}
                      disabled={composerBloqueado} aria-haspopup="dialog" aria-expanded={!!scrPop}
                      title="Scripts — busca, favoritos e categorias (atalho: / com a mensagem vazia)"
                      onClick={abrirScripts}
                    >
                      <IcRaio /><span>Scripts</span><span className="ct">{scripts.length}</span>
                    </button>
                  )}
                  <button type="button" className="tool" title="Enviar documento" disabled={midiaDisabled} onClick={() => setDocModal(true)}><IcDoc /></button>
                  <button type="button" className="tool" title="Compartilhar contato" disabled={midiaDisabled} onClick={() => setCtModal(true)}><IcContato /></button>
                  <button type="button" className="tool" title="Agendar mensagem" disabled={agendarDisabled} onClick={() => { setAgEditId(null); setAgendarAberto(true); }}><IcClock /></button>
                </div>
                <button type="button" className="env-b" title="Enviar" disabled={sendDisabled} onClick={enviar}><IcSend /></button>
              </div>
            </div>
          </>
        )}
      </section>

      {/* ===================== CONTEXTO =====================
          O reabrir "Dados" agora é um botão irmão na fileira de ações do cabeçalho
          (.wa-ctopo .dir, condicionado a !ctxAberto) — não flutua mais solto sobre o header. */}
      {current.id && (
        <aside className={'wa-ctx' + (ctxAberto ? '' : ' recolhido')} aria-hidden={!ctxAberto} {...(!ctxAberto ? ({ inert: '' } as Record<string, string>) : {})}>
         <div className="wa-ctx-inner">
          <div className="ctx-topo spot">
            <div className="av2">{initials(nomeExibicao(current))}</div>
            <div className="n2">{nomeExibicao(current)}</div>
            <div className="t2 num">
              {current.phone ? mascararNumero(current.phone) : 'sem número'}
              {current.phone && <button type="button" className="cp" title="Copiar telefone" onClick={copiarTelefone}><IcCopy /></button>}
            </div>
            <div className="bb">
              <BotaoMini onClick={() => setCtxAberto(false)}>Recolher</BotaoMini>
              {editMode
                ? <BotaoPrimario mini disabled={salvandoEdicao} onClick={salvarEdicao}>{salvandoEdicao ? 'Salvando…' : 'Salvar'}</BotaoPrimario>
                : <BotaoPrimario mini onClick={iniciarEdicao}>Editar</BotaoPrimario>}
            </div>
            {editMode && <div style={{ marginTop: 6 }}><BotaoMini onClick={() => setEditMode(false)}>Cancelar</BotaoMini></div>}
          </div>

          {optout && (
            <div className="ctx-b spot">
              <div className="ctx-optout"><b>Não incomodar ativo.</b> Nenhuma mensagem (bot, régua ou agendamento) é enviada a este contato.</div>
            </div>
          )}

          {editMode && (
            <div className="ctx-b ctx-edit">
              <div className="campo"><label>Nome</label><input className="inp" value={editForm.nome} onChange={(e) => setEditForm((f) => ({ ...f, nome: e.target.value }))} /></div>
              <div className="campo"><label>E-mail</label><input className="inp" placeholder="email@exemplo.com" value={editForm.email} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} /></div>
              <div className="campo"><label>Responsável</label>
                <select className="inp" value={editForm.responsavelId} onChange={(e) => setEditForm((f) => ({ ...f, responsavelId: e.target.value }))}>
                  <option value="">Não atribuído</option>
                  {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
                </select>
              </div>
              <div className="campo"><label>Observações</label><textarea className="inp" rows={2} value={editForm.observacoes} onChange={(e) => setEditForm((f) => ({ ...f, observacoes: e.target.value }))} /></div>
            </div>
          )}

          <div className="ctx-b spot">
            <div className="ctx-t">Status</div>
            <button type="button" className="ctx-status" onClick={(e) => abrirPop('status', e)}>
              <span className="dot" style={{ background: current.statusCor ?? 'var(--txt-3)' }} />
              {current.status || 'Definir status'}
            </button>
          </div>

          <KanbanCtx contatoId={current.contatoId ?? null} demo={demo} etapa={current.etapa} origem={current.origin} respNome={current.respId ? nomePorId(current.respId) : undefined} lead={current} aoAvisar={aoAvisar} />

          <ChecklistDocsCtx contatoId={current.contatoId ?? null} demo={demo} />

          {cobrancasCtx.length > 0 && (
            <div className="ctx-b spot">
              <div className="ctx-t">Cobranças <button type="button" className="lk" onClick={() => nav('/cobrancas')}>ver</button></div>
              {cobrancasCtx.map((cb) => (
                <div className="cx-l" key={cb.id}>
                  <span className="k num">
                    {cb.ciclosPagos}/{cb.ciclosTotais}
                    {cb.proximaCobranca ? ' · ' + cb.proximaCobranca.split('-').reverse().slice(0, 2).join('/') : ''}
                  </span>
                  {(() => {
                    const venc = /atras|venc/i.test(cb.status), pago = /quitad|conclu/i.test(cb.status);
                    return <span className={'st ' + (venc ? 's-er' : pago ? 's-ok' : 's-at')}><i />{venc ? 'Vencida' : pago ? 'Pago' : 'Pendente'}</span>;
                  })()}
                </div>
              ))}
            </div>
          )}

          <div className="ctx-b spot">
            <div className="ctx-t">Etiquetas</div>
            <div className="ctx-tags">
              {current.tags.map((t) => {
                const cor = corDaEtiqueta(t, etiquetasQ.data);
                return (
                  <span key={t} className="ctx-tag" style={{ background: cor + '22', color: cor, borderColor: cor + '55' }}>
                    {t}
                    <button type="button" className="x" aria-label={'Remover etiqueta ' + t} onClick={() => alternarEtiqueta(t)}>×</button>
                  </span>
                );
              })}
              <button type="button" className="etq-add" aria-haspopup="dialog" aria-expanded={!!etqPop}
                onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setEtqPop((cur) => (cur ? null : r)); }}>
                ＋ {current.tags.length === 0 ? 'Adicionar etiqueta' : 'Etiqueta'}
              </button>
            </div>
          </div>

          <div className="ctx-b spot">
            <div className="ctx-t">Responsável</div>
            <div className="cx-l">
              <span className="k">{current.respId ? (current.respId === user?.id ? 'Você' : nomePorId(current.respId) ?? 'Atendente') : 'Sem responsável'}</span>
              <span className="v">
                {inbox.donoEfetivo
                  /* devolver: só o próprio dono — ou admin/gestor, e sempre com confirmação (um clique
                     solto aqui derrubava o responsável de outra pessoa em silêncio) */
                  ? ((inbox.donoEfetivo === user?.id || currentOrg.role !== 'atendente')
                    ? <button type="button" className="lk" style={{ background: 'none', border: 'none', color: 'var(--txt-2)', textDecoration: 'underline', cursor: 'pointer', fontSize: 10.5, fontFamily: 'var(--fonte)' }} onClick={() => setDevolverConfirm(true)}>Devolver para a fila</button>
                    : null)
                  : <button type="button" className="lk" style={{ background: 'none', border: 'none', color: 'var(--txt-2)', textDecoration: 'underline', cursor: 'pointer', fontSize: 10.5, fontFamily: 'var(--fonte)' }} onClick={inbox.assumir}>{inbox.atribuindo ? 'Assumindo…' : 'Assumir atendimento'}</button>}
              </span>
            </div>
          </div>

          {(atividadesQ.data ?? []).length > 0 && (
            <div className="ctx-b spot">
              <div className="ctx-t">Atividade do atendimento</div>
              <ul className="ativ-tl">
                {(atividadesQ.data ?? []).map((a) => (
                  <li key={a.id}>
                    <b>{a.usuario ?? 'Alguém'}</b> {a.tipo === 'assumido' ? 'assumiu o atendimento' : a.tipo === 'transferido' ? 'transferiu o atendimento' : a.tipo === 'devolvido' ? 'devolveu para a fila' : a.tipo}
                    {' · '}{new Date(a.em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    {a.motivo && <div className="mot">Motivo: {a.motivo}</div>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {current.ultimoCanal?.alias && (
            <div className="ctx-b spot">
              <div className="ctx-t">Último canal utilizado</div>
              <div className="ctx-nota num">
                {current.ultimoCanal.alias}
                {current.ultimoCanal.numero ? ' · ' + mascararNumero(current.ultimoCanal.numero) : ''}
                {current.ultimoCanal.em ? ' · ' + new Date(current.ultimoCanal.em).toLocaleString('pt-BR') : ''}
              </div>
            </div>
          )}

          <div className="ctx-b spot">
            <div className="ctx-t">Nota interna</div>
            <div className="ctx-nota">{current.notes || 'Sem observações.'}</div>
          </div>
          <div className="ctx-b spot">
            <div className="ctx-t">Origem do lead</div>
            <div className="cx-l"><span className="k"><IcWa /></span><span className="v">{current.origin}</span></div>
            <div className="cx-l"><span className="k">Última interação</span><span className="v num">{current.lastInter || current.time}</span></div>
          </div>
         </div>
        </aside>
      )}

      {/* ===================== POPOVERS (portal) ===================== */}
      {pop && createPortal(
        <div className={'wa-pop' + (pop.kind === 'filtro' ? ' wa-filtro' : '')} style={pop.acima ? { left: pop.x, bottom: window.innerHeight - pop.y } : { left: pop.x, top: pop.y }} role={pop.kind === 'acoes' ? 'menu' : undefined}>
          {pop.kind === 'filtro' && (
            <>
              <div className="fp-cab">
                <span className="fp-tit">Filtros</span>
                <span className="fp-cont num" title="Conversas que casam com os filtros nesta aba">{visiveis.length}</span>
              </div>
              <div className="fp-body">
                {/* 1. ETIQUETA (multi) */}
                {(etiquetasQ.data ?? []).length > 0 && (
                  <section className="fp-sec">
                    <div className="fp-h">Etiqueta</div>
                    <div className="fp-itens">
                      {(etiquetasQ.data ?? []).map((e) => (
                        <button key={e.nome} type="button" className={'fp-it' + (filtroEtiquetas.has(e.nome) ? ' sel' : '')} onClick={() => alternarSet(setFiltroEtiquetas, e.nome)}>
                          <span className="dot" style={{ background: corDaEtiqueta(e.nome, etiquetasQ.data) ?? 'var(--txt-3)' }} /><span className="tt">{e.nome}</span>{filtroEtiquetas.has(e.nome) && <span className="ck">✓</span>}
                        </button>
                      ))}
                    </div>
                  </section>
                )}
                {/* 2. ATENDENTE (multi + Não atribuído) */}
                <section className="fp-sec">
                  <div className="fp-h">Atendente</div>
                  <div className="fp-itens">
                    <button type="button" className={'fp-it' + (filtroAtendentes.has('') ? ' sel' : '')} onClick={() => alternarSet(setFiltroAtendentes, '')}>
                      <span className="tt">Não atribuído</span>{filtroAtendentes.has('') && <span className="ck">✓</span>}
                    </button>
                    {usuarios.map((u) => (
                      <button key={u.id} type="button" className={'fp-it' + (filtroAtendentes.has(u.id) ? ' sel' : '')} onClick={() => alternarSet(setFiltroAtendentes, u.id)}>
                        <span className="tt">{u.id === user?.id ? `${u.nome} (você)` : u.nome}</span>{filtroAtendentes.has(u.id) && <span className="ck">✓</span>}
                      </button>
                    ))}
                  </div>
                </section>
                {/* 3. IA / BOT */}
                <section className="fp-sec">
                  <div className="fp-h">IA / bot</div>
                  <div className="fp-itens">
                    {IA_OPCOES.map(([k, rot]) => (
                      <button key={k} type="button" className={'fp-it' + (filtroIA.has(k) ? ' sel' : '')} onClick={() => alternarSet(setFiltroIA, k)}>
                        <span className="tt">{rot}</span>{filtroIA.has(k) && <span className="ck">✓</span>}
                      </button>
                    ))}
                  </div>
                </section>
                {/* 4. SITUAÇÃO (multi) — reusa situacaoDaConversa; substitui o antigo grupo "Status" (status_id) */}
                <section className="fp-sec">
                  <div className="fp-h">Situação</div>
                  <div className="fp-itens">
                    {SITUACAO_OPCOES.map(([k, rot]) => (
                      <button key={k} type="button" className={'fp-it sit-' + k + (filtroSituacao.has(k) ? ' sel' : '')} onClick={() => alternarSet(setFiltroSituacao, k)}>
                        <span className="tt">{rot}</span>{filtroSituacao.has(k) && <span className="ck">✓</span>}
                      </button>
                    ))}
                  </div>
                </section>
                {/* 5. ETAPA DO KANBAN (multi) */}
                {etapasFiltro.length > 0 && (
                  <section className="fp-sec">
                    <div className="fp-h">Etapa do Kanban</div>
                    <div className="fp-itens">
                      {etapasFiltro.map((e) => (
                        <button key={e.nome} type="button" className={'fp-it' + (filtroEtapas.has(e.nome) ? ' sel' : '')} onClick={() => alternarSet(setFiltroEtapas, e.nome)}>
                          <span className="dot" style={{ background: e.cor ?? 'var(--txt-3)' }} /><span className="tt">{e.nome}</span>{filtroEtapas.has(e.nome) && <span className="ck">✓</span>}
                        </button>
                      ))}
                    </div>
                  </section>
                )}
                {/* 6. CANAL / NÚMERO (multi) */}
                {inbox.realCanais.length > 0 && (
                  <section className="fp-sec">
                    <div className="fp-h">Número</div>
                    <div className="fp-itens">
                      {inbox.realCanais.map((c) => (
                        <button key={c.id} type="button" className={'fp-it' + (filtroCanais.has(c.id) ? ' sel' : '')} title={tituloCanal(c.alias, c.transporte)} onClick={() => alternarSet(setFiltroCanais, c.id)}>
                          <span className="tt">{c.alias}</span><span className={'oftag' + (c.transporte === 'cloud_api' ? '' : ' qr')}>{c.transporte === 'cloud_api' ? '✓ Oficial' : 'QR'}</span>{filtroCanais.has(c.id) && <span className="ck">✓</span>}
                        </button>
                      ))}
                    </div>
                  </section>
                )}
                {/* 7. CONEXÃO */}
                <section className="fp-sec">
                  <div className="fp-h">Conexão</div>
                  <div className="fp-itens">
                    <button type="button" className={'fp-it' + (filtroTransporte.has('cloud_api') ? ' sel' : '')} title="Canal oficial (API do WhatsApp/Meta)" onClick={() => alternarSet(setFiltroTransporte, 'cloud_api')}>
                      <span className="tt">Oficial (API do WhatsApp)</span>{filtroTransporte.has('cloud_api') && <span className="ck">✓</span>}
                    </button>
                    <button type="button" className={'fp-it' + (filtroTransporte.has('evolution') ? ' sel' : '')} title="Números conectados por QR e canais já removidos" onClick={() => alternarSet(setFiltroTransporte, 'evolution')}>
                      <span className="tt">QR (não oficial)</span>{filtroTransporte.has('evolution') && <span className="ck">✓</span>}
                    </button>
                  </div>
                </section>
                {/* 8. NÃO LIDAS / ARQUIVADAS (toggles) */}
                <section className="fp-sec">
                  <div className="fp-h">Sinalização</div>
                  <div className="fp-itens">
                    <button type="button" className={'fp-it' + (filtroNaoLidas ? ' sel' : '')} onClick={() => setFiltroNaoLidas((v) => !v)}>
                      <span className="tt">Só não lidas</span>{filtroNaoLidas && <span className="ck">✓</span>}
                    </button>
                    <button type="button" className={'fp-it' + (filtroArquivadas ? ' sel' : '')} onClick={() => setFiltroArquivadas((v) => !v)}>
                      <span className="tt">Incluir arquivadas</span>{filtroArquivadas && <span className="ck">✓</span>}
                    </button>
                  </div>
                </section>
                {/* 9. PERÍODO (última interação, single) */}
                <section className="fp-sec">
                  <div className="fp-h">Última interação</div>
                  <div className="fp-itens">
                    {PERIODO_OPCOES.map(([k, rot]) => (
                      <button key={k} type="button" className={'fp-it' + (filtroPeriodo === k ? ' sel' : '')} onClick={() => setFiltroPeriodo((v) => (v === k ? null : k))}>
                        <span className="tt">{rot}</span>{filtroPeriodo === k && <span className="ck">✓</span>}
                      </button>
                    ))}
                  </div>
                </section>
              </div>
              <div className="fp-rod">
                <button type="button" className="fp-limpar" disabled={!filtrosAtivos} onClick={limparFiltros}>Limpar tudo</button>
                <button type="button" className="fp-ok" onClick={() => setPop(null)}>Concluir</button>
              </div>
            </>
          )}
          {pop.kind === 'acoes' && (
            <>
              <button type="button" className="it" onClick={() => { setPop(null); iniciarEdicao(); }}>Editar dados do cliente</button>
              {(current.unread ?? 0) > 0
                ? <button type="button" className="it" onClick={() => { setPop(null); inbox.marcarLida(true); }}>Marcar como lida</button>
                : <button type="button" className="it" onClick={() => { setPop(null); inbox.marcarLida(false); }}>Marcar como não lida</button>}
              <button type="button" className="it" onClick={() => { setPop(null); inbox.arquivar(!current.arquivada); }}>{current.arquivada ? 'Desarquivar conversa' : 'Arquivar conversa'}</button>
              {current.phone && <button type="button" className="it" onClick={() => { setPop(null); copiarTelefone(); }}>Copiar telefone</button>}
              {statusFechada && current.status !== statusFechada.nome && (
                <button type="button" className="it" onClick={() => { setPop(null); setFecharConfirm(true); }}>Fechar conversa</button>
              )}
            </>
          )}
          {pop.kind === 'status' && (
            <>
              <div className="ph2">Status da conversa</div>
              {statusAtivos.length === 0 && <div className="vazio">Nenhum status ativo.</div>}
              {statusAtivos.map((s) => (
                <button key={s.id} type="button" className="it" onClick={() => { setPop(null); aplicarStatus(s.id); }}>
                  <span className="dot" style={{ background: s.cor }} />{s.nome} {current.statusId === s.id && <span className="ck">✓</span>}
                </button>
              ))}
              {podeGerenciar && <button type="button" className="lk" onClick={() => { setPop(null); nav('/configuracoes?tab=atendimento&section=status'); }}>Gerenciar status…</button>}
            </>
          )}
        </div>,
        raizPop,
      )}

      {etqPop && createPortal(
        <SeletorEtiquetas
          anchor={etqPop}
          etiquetas={etiquetasQ.data ?? []}
          aplicadas={current.tags}
          podeGerenciar={podeGerenciar}
          onToggle={(nome) => void alternarEtiqueta(nome)}
          onCriarEAplicar={(nome, cor) => void criarEAplicarEtiqueta(nome, cor)}
          onGerenciar={() => { setEtqPop(null); nav('/configuracoes?tab=atendimento&section=etiquetas'); }}
          onClose={() => setEtqPop(null)}
        />,
        raizPop,
      )}

      {scrPop && createPortal(
        <SeletorScripts
          anchor={scrPop}
          scripts={scripts}
          categorias={scriptCategorias}
          resumo={scriptsResumo}
          etapaCounts={etapaCounts}
          onSelecionar={selecionarScript}
          onGerenciar={() => { setScrPop(null); nav('/scripts'); }}
          onClose={() => setScrPop(null)}
        />,
        raizPop,
      )}

      {/* ===================== MODAIS ===================== */}
      {novaConversa && (
        <NovaConversaModal
          canais={inbox.realCanais.filter((c) => c.status === 'conectado')}
          demo={demo}
          aoFechar={() => setNovaConversa(false)}
          aoIniciar={async (canalId, tel, nome) => {
            const ok = await inbox.iniciarNovaConversa(canalId, tel, nome);
            if (ok) { setNovaConversa(false); window.setTimeout(() => textareaRef.current?.focus(), 60); }
            return ok;
          }}
        />
      )}
      {alertaLq && (
        <AlertaLeadQuenteModal
          key={alertaLq.id}
          alerta={alertaLq}
          qtdFila={Math.max(0, alertasLq.fila.length - 1)}
          aoAssumir={assumirLeadQuente}
          aoDispensar={() => void alertasLq.dispensar(alertaLq.id)}
        />
      )}
      {transferirAberto && (
        <TransferirModal
          usuarios={usuarios} atualId={current.respId ?? null} meuId={user?.id ?? null}
          atualNome={current.respId ? nomePorId(current.respId) ?? null : null}
          busy={inbox.atribuindo}
          aoFechar={() => setTransferirAberto(false)}
          aoTransferir={async (destinoId, motivo) => {
            const ok = await inbox.transferir(destinoId, motivo);
            if (ok) setTransferirAberto(false);
          }}
        />
      )}
      {vincAberto && (
        <VincularModal
          telInicial={current.phone} conversaId={current.id} canalId={inbox.replyCanalId || current.canalId || ''}
          demo={demo}
          aoFechar={() => setVincAberto(false)}
          aoVinculado={async () => { setVincAberto(false); await inbox.live.refetch(); aoAvisar({ tom: 'ok', texto: 'Número vinculado e confirmado. Você já pode responder.' }); }}
        />
      )}
      <ConfirmDialogV2
        aberto={fecharConfirm}
        titulo="Fechar conversa"
        mensagem={statusFechada ? `A conversa será marcada como "${statusFechada.nome}". Você pode reabri-la mudando o status depois.` : 'Fechar esta conversa?'}
        rotuloConfirmar="Fechar conversa"
        aoConfirmar={() => { setFecharConfirm(false); if (statusFechada) aplicarStatus(statusFechada.id); }}
        aoCancelar={() => setFecharConfirm(false)}
      />
      <ConfirmDialogV2
        aberto={devolverConfirm}
        titulo="Devolver para a fila"
        mensagem={inbox.donoEfetivo === user?.id
          ? 'Você deixará de ser o responsável e a conversa ficará na fila até alguém assumir de novo.'
          : `${nomePorId(inbox.donoEfetivo ?? '') ?? 'O atendente'} deixará de ser o responsável e a conversa ficará na fila até alguém assumir de novo.`}
        rotuloConfirmar="Devolver"
        aoConfirmar={() => { setDevolverConfirm(false); void inbox.devolver(); }}
        aoCancelar={() => setDevolverConfirm(false)}
      />
      <ConfirmDialogV2
        aberto={verErro !== null}
        titulo="Falha no envio"
        mensagem={verErro ?? ''}
        rotuloConfirmar="Entendi"
        aoConfirmar={() => setVerErro(null)}
        aoCancelar={() => setVerErro(null)}
      />
      <ConfirmDialogV2
        aberto={!!removerAlvo}
        titulo="Remover esta mensagem com falha?"
        mensagem="Ela não foi entregue ao cliente e será retirada da conversa."
        rotuloConfirmar="Remover"
        destrutivo
        carregando={!!inbox.removendoId}
        aoConfirmar={async () => { if (removerAlvo) { await inbox.removerFalha(removerAlvo); setRemoverAlvo(null); } }}
        aoCancelar={() => setRemoverAlvo(null)}
      />
      <ConfirmDialogV2
        aberto={!!cancelarAgId}
        titulo="Cancelar agendamento?"
        mensagem="A mensagem não será enviada."
        rotuloConfirmar="Cancelar agendamento"
        destrutivo
        carregando={cancelarAgMut.isPending}
        aoConfirmar={async () => {
          if (!cancelarAgId || !current) return;
          try { await cancelarAgMut.mutateAsync({ id: cancelarAgId, conversaId: current.id }); aoAvisar({ tom: 'ok', texto: 'Agendamento cancelado.' }); }
          catch (e) { aoAvisar({ tom: 'erro', texto: (e as Error)?.message || 'Falha ao cancelar.' }); }
          setCancelarAgId(null);
        }}
        aoCancelar={() => setCancelarAgId(null)}
      />
      <MediaComposer
        open={imgModal} tipo="imagem" previewCard
        onClose={() => setImgModal(false)}
        enviar={async (file, caption) => { await inbox.enviarImagem(file, caption); setImgModal(false); }}
      />
      <MediaComposer
        open={videoModal} tipo="video"
        onClose={() => setVideoModal(false)}
        enviar={async (file, caption) => { await inbox.enviarVideo(file, caption); setVideoModal(false); }}
      />
      <MediaComposer
        open={docModal} tipo="documento"
        onClose={() => setDocModal(false)}
        enviar={async (file, caption) => { await inbox.enviarDocumento(file, caption); setDocModal(false); }}
      />
      {ctModal && (
        <CompartilharContatoModal
          equipe={(usuariosQ.data ?? []).filter((u) => !!(u.telefone ?? '').replace(/\D+/g, '')).map((u) => ({ nome: u.nome, telefone: (u.telefone ?? '').replace(/\D+/g, '') }))}
          conversas={contacts
            .filter((c) => !!c.phone && c.id !== currentId)
            .map((c) => ({ nome: nomeExibicao(c), telefone: (c.phone ?? '').replace(/\D+/g, '') }))
            .filter((c, i, arr) => c.telefone.length >= 10 && arr.findIndex((x) => x.telefone === c.telefone) === i)}
          aoFechar={() => setCtModal(false)}
          aoEnviar={async (nome, telefone) => {
            try { await inbox.enviarContato(nome, telefone); setCtModal(false); if (!demo) aoAvisar({ tom: 'ok', texto: 'Contato compartilhado.' }); }
            catch (e) { aoAvisar({ tom: 'erro', texto: (e as Error)?.message || 'Falha ao compartilhar o contato.' }); }
          }}
        />
      )}
      {agendarAberto && (
        <AgendarMensagemModalV2
          aberto modo={agEditId ? 'editar' : 'criar'} demo={demo}
          canais={canaisAgendaveis.map((c) => ({ id: c.id, alias: c.alias, numero: c.numero, status: c.status, envioRestrito: c.envioRestrito, conflitoCom: c.conflitoCom }))}
          temTelefone={!!current.phone}
          ultimaInteracaoMs={current.lastAtMs ?? null}
          initial={agEditId ? (() => {
            const a = (agendadasQ.data ?? []).find((x) => x.id === agEditId);
            return a ? { canalId: a.canalId, texto: a.texto ?? '', executarEm: a.executarEm, tipo: a.tipo, nomeArquivo: a.nomeArquivo ?? undefined } : null;
          })() : { canalId: inbox.replyCanalId || current.canalId || undefined }}
          aoFechar={() => { setAgendarAberto(false); setAgEditId(null); }}
          aoSubmeter={async (v) => {
            if (optout) { aoAvisar({ tom: 'erro', texto: optoutTexto }); return; }   // opt-out: revalidar no submit (pode ter bloqueado com o modal aberto)
            if (demo) { aoAvisar({ tom: 'ok', texto: 'Mensagem agendada — será enviada automaticamente no horário.' }); return; }
            if (agEditId) {
              await editarAgMut.mutateAsync({ id: agEditId, conversaId: current.id, canalId: v.canalId, texto: v.texto ?? '', executarEm: v.executarISO });
              aoAvisar({ tom: 'ok', texto: 'Agendamento atualizado.' });
            } else {
              const itens = v.itens ?? [];
              await agendarSeqMut.mutateAsync({ conversaId: current.id, canalId: v.canalId, executarEm: v.executarISO, itens });
              aoAvisar({ tom: 'ok', texto: itens.length > 1 ? `${itens.length} mensagens agendadas — serão enviadas no horário.` : 'Mensagem agendada — será enviada automaticamente no horário.' });
            }
          }}
        />
      )}
      <ScriptSequenceModal
        open={!!scriptSeq} script={scriptSeq}
        canal="whatsapp" conversaId={current.id} incluirMidia
        onClose={() => setScriptSeq(null)}
        ctx={{ cliente: current.name, atendente: user?.name || 'Atendente', emailAtendente: user?.email ?? '', empresa: currentOrg.name, telefone: current.phone }}
        enviarMidia={async (m) => {
          // Mesmas travas do composer (o estado pode mudar por realtime com o modal aberto).
          if (inbox.canalRestrito) throw new Error('O número deste canal está com restrição no WhatsApp e está indisponível para envio. Selecione outro canal.');
          if (inbox.canalIndisponivel) throw new Error('Este número está desconectado. Reconecte em Integrações para enviar.');
          if (inbox.semDestino) throw new Error('Vincule um número confirmado para responder.');
          if (optout) throw new Error(optoutTexto);
          if (inbox.higieneBloqueia) throw new Error(textoBloqueio(inbox.higiene) ?? 'Atendimento sem responsável ou com cadastro incompleto — assuma e complete o nome para enviar.');
          if (!m.storagePath) throw new Error('Mídia do script sem arquivo. Reenvie o anexo no arsenal de Scripts.');
          if (demo) { aoAvisar({ tom: 'ok', texto: 'Mídia enviada' }); return; }
          // A mídia do script já vive no bucket privado (script-midia); envia pelo mesmo caminho do compositor.
          const id = await sendMut.mutateAsync({
            conversaId: current.id, canalId: inbox.replyCanalId || current.canalId,
            midiaPath: m.storagePath, midiaTipo: m.tipo, midiaMime: m.mime ?? undefined, midiaNome: m.nome ?? undefined, midiaTamanho: m.tamanho ?? undefined,
            text: m.texto || undefined,
          });
          if (id) await aguardarConfirmacaoEnvio(id); // sucesso = confirmação REAL do provedor (igual ao texto)
        }}
        enviarEtapa={async (texto, retryMensagemId) => {
          // TODAS as travas do composer valem também aqui — o caminho de script não pode furar
          // o que sendMsg bloqueia (o estado pode mudar por realtime com o modal aberto). Espelha
          // as mesmas verificações/mensagens de useInboxWhatsApp.sendMsg, na mesma ordem.
          if (inbox.canalRestrito) throw new Error('O número deste canal está com restrição no WhatsApp e está indisponível para envio. Selecione outro canal.');
          if (inbox.canalIndisponivel) throw new Error('Este número está desconectado. Reconecte em Integrações para enviar.');
          if (inbox.semDestino) throw new Error('Vincule um número confirmado para responder.');
          if (optout) throw new Error(optoutTexto);
          if (inbox.higieneBloqueia) throw new Error(textoBloqueio(inbox.higiene) ?? 'Atendimento sem responsável ou com cadastro incompleto — assuma e complete o nome para enviar.');
          if (demo) { aoAvisar({ tom: 'ok', texto: 'Mensagem enviada' }); return; }
          const id = await sendMut.mutateAsync({ conversaId: current.id, canalId: inbox.replyCanalId || current.canalId, text: texto, retryMensagemId });
          return id ?? undefined;
        }}
        confirmar={(id) => (demo ? Promise.resolve('enviada' as const) : aguardarConfirmacaoEnvio(id))}
      />
      {lightbox && (
        <div className="veu" role="dialog" aria-modal onMouseDown={(e) => { if (e.target === e.currentTarget) setLightbox(null); }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 96 }}>
          <button type="button" aria-label="Fechar" onClick={() => setLightbox(null)} style={{ position: 'fixed', top: 14, right: 18, fontSize: 22, background: 'none', border: 'none', color: 'var(--txt)', cursor: 'pointer' }}>×</button>
          <img src={lightbox} alt="Imagem ampliada" style={{ maxWidth: '86vw', maxHeight: '86vh', borderRadius: 10 }} />
        </div>
      )}
    </div>
  );
}

/* ================================================================
   Cabeçalho: situação do funil no subtítulo — chip estático apenas
   quando NÃO há card aberto (com card, o botão-seletor de etapa ao
   lado de Transferir assume o lugar). Mesma query do EtapaTopoSel —
   react-query deduplica.
   ================================================================ */
function SituacaoChipTopo({ lead, demo }: { lead: WaContact; demo: boolean }) {
  const oppsQ = useOportunidadesDoContato(!demo ? (lead.contatoId ?? null) : null);
  if (!demo && (oppsQ.isLoading || (oppsQ.data ?? []).some((o) => o.aberta))) return null;
  const sit = situacaoDe(lead); const cor = corDaSituacao(lead, sit.texto);
  return <span className={'wa-hchip etapa sit-' + sit.variante} title="Situação no funil" style={cor ? { background: cor + '26', color: cor } : undefined}>{sit.texto}</span>;
}

/* ================================================================
   Cabeçalho: seletor de etapa do Kanban (movido do painel de dados)
   ao lado de Transferir/Arquivar — MESMO formato dos BotaoMini
   (.p-btn.btn-sec.btn-mini herda hover e os 2 temas), com dot na cor
   da coluna e o <select> nativo invisível por cima. Só aparece com
   oportunidade aberta; mesmos hooks do KanbanCtx (deduplicados).
   ================================================================ */
function EtapaTopoSel({ lead, demo, aoAvisar }: { lead: WaContact; demo: boolean; aoAvisar: (a: AvisoInbox) => void }) {
  const contatoId = lead.contatoId ?? null;
  const oppsQ = useOportunidadesDoContato(!demo ? contatoId : null);
  const aberta = demo ? null : (oppsQ.data ?? []).find((o) => o.aberta) ?? null;
  const colunasQ = useColunasFunil(aberta?.funilId ?? null);
  const mover = useMoverOportunidade();
  const [movBusy, setMovBusy] = useState(false);
  const [pendCol, setPendCol] = useState<string | null>(null);        // coluna alvo enquanto salva (feedback imediato)
  const [motivoModal, setMotivoModal] = useState<null | { destinoId: string; tipo: 'perdido' | 'reabertura' }>(null);
  const [motivoSel, setMotivoSel] = useState('sem_interesse');
  const [motivoTxt, setMotivoTxt] = useState('');
  useEffect(() => { setPendCol(null); setMotivoModal(null); }, [contatoId]); // troca de conversa não herda estado de mover
  const colunas = colunasQ.data ?? [];
  const colAtual = colunas.find((c) => c.id === aberta?.colunaId) ?? null;
  if (!aberta) return null;
  function aoTrocarColuna(destinoId: string) {
    if (!aberta || !destinoId || destinoId === aberta.colunaId) return;
    const destino = colunas.find((c) => c.id === destinoId);
    if (!destino) return;
    const origem = colunas.find((c) => c.id === aberta.colunaId);
    const tipo = classificarMovimento(origem?.resultado ?? 'neutro', destino.resultado);
    if (tipo === 'perdido') { setMotivoSel('sem_interesse'); setMotivoTxt(''); setMotivoModal({ destinoId, tipo: 'perdido' }); return; }
    if (tipo === 'reabertura') { setMotivoTxt(''); setMotivoModal({ destinoId, tipo: 'reabertura' }); return; }
    void executarMover(destinoId, {});                                 // neutro/ganho: move direto
  }
  async function executarMover(destinoId: string, motivos: { motivoPerda?: string | null; motivoPerdaDesc?: string | null; motivoReabertura?: string | null }) {
    if (!aberta?.id || !aberta.atualizadoEm) return;
    setMovBusy(true); setPendCol(destinoId);
    try {
      await mover({ id: aberta.id, colunaId: destinoId, atualizadoEmEsperado: aberta.atualizadoEm, ...motivos });
      aoAvisar({ tom: 'ok', texto: `Movido para ${colunas.find((c) => c.id === destinoId)?.nome ?? 'nova etapa'}.` });
      setMotivoModal(null);
    } catch (e) {
      aoAvisar({ tom: 'erro', texto: traduzErroKanban((e as Error)?.message || '') });
      setPendCol(null);                                                 // reverte o select ao valor real
    } finally { setMovBusy(false); }
  }
  const nomeVisivel = (pendCol ? colunas.find((c) => c.id === pendCol)?.nome : null) ?? colAtual?.nome ?? aberta.colunaNome ?? '—';
  return (
    <>
      <span className={'p-btn btn-sec btn-mini wa-hetapa' + (movBusy ? ' off' : '')} title={`Etapa no funil: ${nomeVisivel} — clique para mover o card`}>
        <span className="dot" style={{ background: colAtual?.cor ?? lead.etapaCor ?? 'var(--txt-3)' }} />
        <span className="tx">{nomeVisivel}</span>
        <select aria-label="Mover etapa do card"
          disabled={movBusy || colunasQ.isLoading || colunas.length === 0}
          value={pendCol ?? aberta.colunaId ?? ''} onChange={(e) => aoTrocarColuna(e.target.value)}>
          {colunas.length === 0 && <option value={aberta.colunaId ?? ''}>{aberta.colunaNome || '—'}</option>}
          {colunas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
      </span>
      <ModalV2
        aberto={!!motivoModal}
        aoFechar={() => { if (!movBusy) setMotivoModal(null); }}
        largura={400}
        titulo={motivoModal?.tipo === 'perdido' ? 'Motivo da perda' : 'Reabrir oportunidade'}
        rodape={
          <>
            <BotaoSec disabled={movBusy} onClick={() => setMotivoModal(null)}>Cancelar</BotaoSec>
            <BotaoPrimario
              disabled={movBusy || !motivoModal || (motivoModal.tipo === 'perdido' ? (motivoSel === 'outro' && !motivoTxt.trim()) : !motivoTxt.trim())}
              onClick={() => {
                if (!motivoModal) return;
                if (motivoModal.tipo === 'perdido') void executarMover(motivoModal.destinoId, { motivoPerda: motivoSel, motivoPerdaDesc: motivoSel === 'outro' ? motivoTxt.trim() : null });
                else void executarMover(motivoModal.destinoId, { motivoReabertura: motivoTxt.trim() });
              }}>{movBusy ? 'Movendo…' : 'Confirmar'}</BotaoPrimario>
          </>
        }
      >
        {motivoModal?.tipo === 'perdido' ? (
          <>
            <div className="campo"><label>Motivo da perda</label>
              <select className="inp" value={motivoSel} onChange={(e) => setMotivoSel(e.target.value)}>
                {MOTIVOS_PERDA.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            {motivoSel === 'outro' && (
              <div className="campo" style={{ marginTop: 10 }}><label>Descreva</label>
                <textarea className="inp" rows={2} value={motivoTxt} onChange={(e) => setMotivoTxt(e.target.value)} /></div>
            )}
          </>
        ) : (
          <div className="campo"><label>Motivo da reabertura</label>
            <textarea className="inp" rows={2} value={motivoTxt} onChange={(e) => setMotivoTxt(e.target.value)} placeholder="Por que está reabrindo esta oportunidade?" /></div>
        )}
      </ModalV2>
    </>
  );
}

/* ================================================================
   Contexto: bloco Funil/Kanban — "Abrir no Kanban" via deep-link
   /v2/kanban?oportunidade= (KanbanContatoBox v1 recriado; hooks reais
   reusados; ficha judicial reusada inteira no real).
   ================================================================ */
function KanbanCtx({ contatoId, demo, etapa, origem, respNome, lead, aoAvisar }: {
  contatoId: string | null; demo: boolean; etapa?: string | null;
  origem: string; respNome?: string; lead: WaContact; aoAvisar: (a: AvisoInbox) => void;
}) {
  const nav = useNavigate();
  const oppsQ = useOportunidadesDoContato(!demo ? contatoId : null);
  const funisQ = useFunisDaOrg();
  const abertaReal = demo ? null : (oppsQ.data ?? []).find((o) => o.aberta) ?? null;
  const [addAberto, setAddAberto] = useState(false);
  const [funilSel, setFunilSel] = useState('');
  const [addBusy, setAddBusy] = useState(false);
  if (!contatoId) return null;
  const oppDemo = demo && etapa
    ? { id: 'demo-opp', funilNome: 'Funil comercial', colunaId: null as string | null, colunaNome: etapa, respId: lead.respId ?? null, respNome: respNome ?? '', tipoServico: 'analise_inicial', tipoBeneficio: 'aposentadoria', valor: null, atualizadoEm: '', status: lead.oppStatus === 'ganho' || lead.oppStatus === 'perdido' || lead.oppStatus === 'cancelado' ? lead.oppStatus : 'em_andamento' }
    : null;
  const aberta = demo ? (oppDemo?.status === 'em_andamento' ? oppDemo : null) : abertaReal;
  // Cliente FECHADO não some do painel: sem oportunidade aberta, a fechada mais
  // recente vira o contexto — é justamente no fecho que a ficha vai pra planilha.
  const fechada = demo
    ? (oppDemo && oppDemo.status !== 'em_andamento' ? oppDemo : null)
    : (abertaReal ? null
      : (oppsQ.data ?? []).filter((o) => o.status === 'ganho' || o.status === 'perdido' || o.status === 'cancelado')
        .sort((a, b) => (b.atualizadoEm || '').localeCompare(a.atualizadoEm || ''))[0] ?? null);
  const opp = aberta ?? fechada;
  // demo com ficha seed (ex.: Antônio, kct-5): renderiza a FichaJudicialBox real —
  // inclui o envio à planilha simulado — no lugar do cartão-placeholder.
  const fichaDemo = demo ? fichaDemoDoContato(contatoId) : null;
  return (
    <div className="ctx-b spot">
      <div className="ctx-t">Funil</div>
      {(!demo && oppsQ.isLoading) ? (
        <div className="ctx-nota">Carregando…</div>
      ) : opp ? (
        <>
          {fechada && <div className="cx-l"><span className="k">Situação</span><span className="v">Fechada · {(fechada.status || '').toUpperCase()}</span></div>}
          <div className="cx-l"><span className="k">Funil</span><span className="v">{opp.funilNome ?? '—'}</span></div>
          <div className="cx-l"><span className="k">Responsável</span><span className="v">{opp.respNome || 'Não atribuído'}</span></div>
          <div className="cx-l"><span className="k">Origem</span><span className="v">{origem}</span></div>
          <div style={{ marginTop: 7, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <BotaoMini onClick={() => nav(demo ? '/kanban' : `/kanban?oportunidade=${encodeURIComponent(opp.id)}`)}>Abrir no Kanban</BotaoMini>
            {fechada && <BotaoMini onClick={() => { setFunilSel(funisQ.data?.find((f) => f.padrao)?.id ?? funisQ.data?.[0]?.id ?? ''); setAddAberto(true); }}>Adicionar ao Kanban</BotaoMini>}
          </div>
          {demo && !fichaDemo ? (
            /* representação da ficha no demo — MESMAS classes fjb do componente real (aplica o override Platina) */
            <div className="fjb" style={{ marginTop: 12 }}>
              <div className="fjb-h">Ficha judicial</div>
              <div className="fjb-card">
                <span className="fjb-tag vazia">Nenhuma ficha</span>
                <div className="fjb-info">Importe a consulta do Promosys/iCred e gere a ficha judicial.</div>
                <div className="fjb-acts"><button type="button" className="fjb-btn" onClick={() => aoAvisar({ tom: 'ok', texto: 'Modo demonstração: a ficha real (importar, revisar, finalizar) abre no ambiente com backend.' })}>Criar ficha</button></div>
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 10 }}>
              <FichaJudicialBox contatoId={contatoId} oportunidadeId={fichaDemo?.oportunidadeId ?? opp.id} conversaId={lead.id} canalId={lead.canalId ?? null} responsavelSugerido={{ id: opp.respId ?? lead.respId ?? undefined, nome: opp.respNome || respNome }} contatoAtual={{ nome: lead.name, telefone: lead.phone, email: lead.email }} />
            </div>
          )}
        </>
      ) : (
        <>
          <div className="ctx-nota">Sem oportunidade no Kanban.</div>
          <div style={{ marginTop: 7 }}><BotaoMini onClick={() => { setFunilSel(funisQ.data?.find((f) => f.padrao)?.id ?? funisQ.data?.[0]?.id ?? ''); setAddAberto(true); }}>Adicionar ao Kanban</BotaoMini></div>
        </>
      )}
      <ModalV2
        aberto={addAberto}
        aoFechar={() => { if (!addBusy) setAddAberto(false); }}
        largura={420}
        titulo="Adicionar ao Kanban"
        rodape={
          <>
            <BotaoSec disabled={addBusy} onClick={() => setAddAberto(false)}>Cancelar</BotaoSec>
            <BotaoPrimario disabled={addBusy || (!demo && !funilSel)} onClick={async () => {
              if (demo) { aoAvisar({ tom: 'ok', texto: 'Adicionado ao Kanban' }); setAddAberto(false); return; }
              setAddBusy(true);
              try {
                await chamarGarantirEntrada({ contatoId, funilId: funilSel, origem: 'WhatsApp', conversaId: lead.id, canalId: lead.canalId ?? undefined });
                aoAvisar({ tom: 'ok', texto: 'Adicionado ao Kanban' });
                setAddAberto(false);
              } catch (e) { aoAvisar({ tom: 'erro', texto: (e as Error)?.message || 'Falha ao adicionar.' }); }
              finally { setAddBusy(false); }
            }}>{addBusy ? 'Adicionando…' : 'Adicionar'}</BotaoPrimario>
          </>
        }
      >
        <p style={{ fontSize: 12.5, color: 'var(--txt-2)', lineHeight: 1.55 }}>
          O contato entrará na <b>coluna de entrada</b> do funil, com origem <b>WhatsApp</b>, herdando conversa, canal e atendente.
        </p>
        {(funisQ.data ?? []).length === 0 && !demo ? (
          <div className="kb-err" role="alert" style={{ marginTop: 10 }}>Nenhum funil disponível.</div>
        ) : (funisQ.data ?? []).length > 1 && (
          <div className="campo" style={{ marginTop: 10 }}>
            <label>Funil</label>
            <select className="inp" value={funilSel} onChange={(e) => setFunilSel(e.target.value)}>
              {(funisQ.data ?? []).map((f) => <option key={f.id} value={f.id}>{f.nome}{f.padrao ? ' (padrão)' : ''}</option>)}
            </select>
          </div>
        )}
      </ModalV2>
    </div>
  );
}

/* ================================================================
   Contexto: checklist de documentos do card (oportunidade aberta).
   Resolve a opp pelo contato (mesma query do KanbanCtx — react-query
   deduplica). Só aparece quando há oportunidade aberta e fora do demo.
   feito_em/feito_por são carimbados por trigger; o front só grava `feito`.
   ================================================================ */
function ChecklistDocsCtx({ contatoId, demo }: { contatoId: string | null; demo: boolean }) {
  const oppsQ = useOportunidadesDoContato(!demo ? contatoId : null);
  const opp = demo ? null : (oppsQ.data ?? []).find((o) => o.aberta) ?? null;
  const chk = useChecklist(opp?.id ?? null);
  if (!contatoId || demo || !opp) return null;
  return (
    <div className="ctx-b spot">
      <div className="ctx-t">Documentos
        <span className="chk-cnt">{chk.loading ? '' : `${chk.obrFeitos}/${chk.obrTotal} · ${chk.pct}%`}</span>
      </div>
      <div className="chk-bar" role="progressbar" aria-valuenow={chk.pct} aria-valuemin={0} aria-valuemax={100}>
        <i className={chk.pct >= 100 ? 'cheio' : undefined} style={{ width: `${chk.pct}%` }} />
      </div>
      {chk.loading ? (
        <div className="ctx-nota">Carregando…</div>
      ) : (
        chk.secoes.map((s) => {
          const itens = chk.itens.filter((i) => i.secao === s.key);
          if (!itens.length) return null;
          return (
            <div className="chk-sec" key={s.key}>
              <div className="chk-sh">{s.titulo}</div>
              {itens.map((it) => (
                <label className={'chk-it' + (it.feito ? ' on' : '')} key={it.slug}>
                  <input type="checkbox" checked={it.feito}
                    onChange={(e) => chk.toggle(it.slug, e.target.checked)} />
                  <span className="chk-lb">{it.rotulo}</span>
                  {!it.obrigatorio && <span className="chk-opt">opcional</span>}
                </label>
              ))}
            </div>
          );
        })
      )}
    </div>
  );
}

/* ================================================================ */
function NovaConversaModal({ canais, demo, aoFechar, aoIniciar }: {
  canais: { id: string; alias: string; numero: string | null }[]; demo: boolean;
  aoFechar: () => void; aoIniciar: (canalId: string, tel: string, nome: string) => Promise<boolean>;
}) {
  const [canalId, setCanalId] = useState(canais[0]?.id ?? '');
  const [tel, setTel] = useState('');
  const [nome, setNome] = useState('');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const iniciar = async () => {
    setErro(null);
    if (!demo) {
      if (!canalId) { setErro('Selecione um WhatsApp conectado.'); return; }
      if (!normalizeWaPhone(tel)) { setErro('Informe um telefone válido.'); return; }
    }
    setBusy(true);
    try { await aoIniciar(canalId, tel, nome); }
    catch (e) { setErro((e as Error)?.message || 'Falha ao iniciar.'); }
    finally { setBusy(false); }
  };
  return (
    <ModalV2
      aberto aoFechar={() => { if (!busy) aoFechar(); }} largura={420} titulo="Nova conversa"
      rodape={
        <>
          <BotaoSec disabled={busy} onClick={aoFechar}>Cancelar</BotaoSec>
          <BotaoPrimario disabled={busy || (!demo && canais.length === 0)} onClick={iniciar}>{busy ? 'Iniciando…' : 'Iniciar conversa'}</BotaoPrimario>
        </>
      }
    >
      {erro && <div className="aviso-inline erro" role="alert" style={{ marginBottom: 10 }}>{erro}</div>}
      <div className="form-grid">
        <div className="campo">
          <label>WhatsApp</label>
          {canais.length === 0 && !demo ? (
            <div className="ctx-nota">Nenhum WhatsApp conectado.</div>
          ) : (
            <select className="inp" value={canalId} onChange={(e) => setCanalId(e.target.value)}>
              {(demo ? [{ id: 'demo', alias: 'Chip 1', numero: '5551999990000' }] : canais).map((c) => (
                <option key={c.id} value={c.id}>{c.alias}{c.numero ? ' · ' + mascararNumero(c.numero) : ''}</option>
              ))}
            </select>
          )}
        </div>
        <div className="campo"><label>Telefone</label><input className="inp" placeholder="(11) 99999-8888" inputMode="tel" value={tel} onChange={(e) => setTel(e.target.value)} /></div>
        <div className="campo"><label>Nome (opcional)</label><input className="inp" placeholder="Nome do contato" value={nome} onChange={(e) => setNome(e.target.value)} /></div>
      </div>
    </ModalV2>
  );
}

function TransferirModal({ usuarios, atualId, atualNome, meuId, busy, aoFechar, aoTransferir }: {
  usuarios: { id: string; nome: string; papel?: string }[]; atualId: string | null; atualNome: string | null; meuId: string | null;
  busy: boolean; aoFechar: () => void; aoTransferir: (destinoId: string, motivo: string) => Promise<void>;
}) {
  const [busca, setBusca] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const filtrados = usuarios.filter((u) => u.nome.toLowerCase().includes(busca.trim().toLowerCase()));
  return (
    <ModalV2
      aberto aoFechar={() => { if (!busy) aoFechar(); }} largura={460} titulo="Transferir atendimento"
      rodape={
        <>
          <BotaoSec disabled={busy} onClick={aoFechar}>Cancelar</BotaoSec>
          <BotaoPrimario disabled={busy || !sel || !motivo.trim() || sel === atualId} onClick={() => sel && aoTransferir(sel, motivo)}>
            {busy ? 'Transferindo…' : 'Transferir'}
          </BotaoPrimario>
        </>
      }
    >
      <p style={{ fontSize: 12, color: 'var(--txt-2)', marginBottom: 10 }}>Responsável atual: <b style={{ color: 'var(--txt)' }}>{atualNome ?? 'Sem responsável'}</b></p>
      <div className="campo" style={{ marginBottom: 8 }}>
        <input className="inp" placeholder="Buscar atendente…" autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>
      <div style={{ maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 10 }}>
        {filtrados.length === 0 && <div className="ctx-nota">Nenhum atendente encontrado.</div>}
        {filtrados.map((u) => (
          <button
            key={u.id} type="button" disabled={u.id === atualId}
            style={{ display: 'flex', gap: 8, alignItems: 'center', textAlign: 'left', background: sel === u.id ? 'rgba(var(--tint),.08)' : 'none', border: '1px solid ' + (sel === u.id ? 'rgba(var(--tint),.25)' : 'transparent'), borderRadius: 8, padding: '6px 9px', color: 'var(--txt)', fontFamily: 'var(--fonte)', fontSize: 12.5, cursor: u.id === atualId ? 'default' : 'pointer', opacity: u.id === atualId ? .55 : 1 }}
            onClick={() => setSel(u.id)}
          >
            {u.nome}{u.id === meuId ? ' (você)' : ''}{u.id === atualId ? ' · atual' : ''}
            {u.papel && <span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--txt-3)' }}>{u.papel === 'gestor' ? 'Supervisor' : u.papel}</span>}
          </button>
        ))}
      </div>
      <div className="campo">
        <label>Motivo da transferência *</label>
        <input className="inp" maxLength={280} placeholder="Ex.: atendimento presencial, especialista, ausência…" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      </div>
    </ModalV2>
  );
}

function VincularModal({ telInicial, conversaId, canalId, demo, aoFechar, aoVinculado }: {
  telInicial: string; conversaId: string; canalId: string; demo: boolean;
  aoFechar: () => void; aoVinculado: () => Promise<void>;
}) {
  const [tel, setTel] = useState(telInicial ?? '');
  const [validado, setValidado] = useState<{ numero: string; mascarado: string; jid: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const validar = async () => {
    setErro(null);
    if (demo) { setErro('Disponível com o backend configurado.'); return; }
    setBusy(true);
    try {
      const r = await waValidarNumero(conversaId, canalId, tel);
      if (!r.exists) { setErro('Este número não tem WhatsApp ativo.'); return; }
      setValidado({ numero: r.numero, mascarado: r.numero_mascarado, jid: r.jid });
    } catch (e) { setErro((e as Error)?.message || 'Falha ao validar.'); }
    finally { setBusy(false); }
  };
  const vincular = async () => {
    if (!validado) return;
    setBusy(true);
    try { await waVincularNumero(conversaId, canalId, validado.numero, validado.jid); await aoVinculado(); }
    catch (e) { setErro((e as Error)?.message || 'Falha ao vincular.'); }
    finally { setBusy(false); }
  };
  return (
    <ModalV2
      aberto aoFechar={() => { if (!busy) aoFechar(); }} largura={440} titulo="Vincular número para responder"
      rodape={
        <>
          <BotaoSec disabled={busy} onClick={aoFechar}>Cancelar</BotaoSec>
          {validado
            ? <BotaoPrimario disabled={busy} onClick={vincular}>{busy ? 'Vinculando…' : 'Confirmar e vincular'}</BotaoPrimario>
            : <BotaoPrimario disabled={busy || !tel.trim()} onClick={validar}>{busy ? 'Validando…' : 'Validar no WhatsApp'}</BotaoPrimario>}
        </>
      }
    >
      <p style={{ fontSize: 12, color: 'var(--txt-2)', lineHeight: 1.55, marginBottom: 10 }}>
        Esta conversa chegou por uma identidade protegida (LID), sem número para resposta. Informe o número real do
        cliente — validamos no WhatsApp antes de salvar. O LID é preservado e nada é inventado.
      </p>
      {erro && <div className="aviso-inline erro" role="alert" style={{ marginBottom: 10 }}>{erro}</div>}
      <div className="campo">
        <label>Telefone (DDI + DDD)</label>
        <input className="inp" placeholder="55 11 99999-8888" value={tel} disabled={!!validado} onChange={(e) => setTel(e.target.value)} />
      </div>
      {!validado && telInicial && (
        <p style={{ fontSize: 11, color: 'var(--txt-3)', marginTop: 6 }}>Número cadastrado (não confirmado) — valide no WhatsApp para usar, ou informe outro.</p>
      )}
      {validado && (
        <p style={{ fontSize: 12, color: 'var(--verde)', marginTop: 8 }}>
          ✓ Número com WhatsApp ativo: <b>{validado.mascarado}</b>. Confirme para vincular a este contato.{' '}
          <button type="button" className="kb-link" onClick={() => setValidado(null)}>Corrigir número</button>
        </p>
      )}
    </ModalV2>
  );
}

/* Cartão PADRÃO do atendimento — é o único que a casa compartilha hoje. Mesmo nome/número
   que o bot do fluxo de crédito manda (bot-runner CARD_ATENDIMENTO_NOME / CARD_MURILLO):
   o cliente vê o MESMO contato, venha do bot ou do atendente. Mudar aqui e lá junto. */
const CONTATO_PADRAO = { nome: 'CAF Atendimento', telefone: '555191035329' };

/* ================================================================
   Compartilhar contato (vCard) — picker do composer. O cartão PADRÃO
   fica fixo no topo e é o que o botão principal envia (1 clique, sem
   busca). Demais fontes: EQUIPE (usuarios.telefone, preenchido em
   Configurações › Perfil), CONVERSAS já carregadas no inbox, e número
   avulso digitado na hora. O envio é nativo nos dois transportes
   (Evolution sendContact / Cloud contacts).
   ================================================================ */
function CompartilharContatoModal({ equipe, conversas, aoFechar, aoEnviar }: {
  equipe: { nome: string; telefone: string }[];
  conversas: { nome: string; telefone: string }[];
  aoFechar: () => void;
  aoEnviar: (nome: string, telefone: string) => Promise<void>;
}) {
  const [busca, setBusca] = useState('');
  const [nomeAvulso, setNomeAvulso] = useState('');
  const [telAvulso, setTelAvulso] = useState('');
  const [busy, setBusy] = useState(false);
  const q = busca.trim().toLowerCase();
  const filtra = (l: { nome: string; telefone: string }[]) =>
    q ? l.filter((x) => x.nome.toLowerCase().includes(q) || (q.replace(/\D+/g, '') && x.telefone.includes(q.replace(/\D+/g, '')))) : l;
  // O padrão nunca é filtrado pela busca (é o atalho da casa) e some das outras listas p/ não duplicar.
  const semPadrao = (l: { nome: string; telefone: string }[]) => l.filter((x) => x.telefone !== CONTATO_PADRAO.telefone);
  const eq = filtra(semPadrao(equipe));
  const cv = filtra(semPadrao(conversas)).slice(0, 30);
  const telAvulsoDig = telAvulso.replace(/\D+/g, '');
  const avulsoOk = nomeAvulso.trim().length > 1 && telAvulsoDig.length >= 10;
  const avulsoTocado = nomeAvulso.trim().length > 0 || telAvulsoDig.length > 0;
  const enviar = async (nome: string, telefone: string) => {
    if (busy) return;
    setBusy(true);
    try { await aoEnviar(nome, telefone); } finally { setBusy(false); }
  };
  return (
    <ModalV2
      aberto
      aoFechar={() => { if (!busy) aoFechar(); }}
      titulo="Compartilhar contato"
      largura={460}
      rodape={<>
        <BotaoSec mini disabled={busy} onClick={aoFechar}>Voltar</BotaoSec>
        {/* Botão principal = cartão PADRÃO enquanto ninguém digitar um contato avulso. Se o
            atendente começou a digitar, ele fica travado até o avulso estar completo — nunca
            envia o padrão "por engano" no lugar do que a pessoa estava escrevendo. */}
        <BotaoPrimario mini disabled={busy || (avulsoTocado && !avulsoOk)}
          onClick={() => (avulsoOk ? enviar(nomeAvulso.trim(), telAvulsoDig) : enviar(CONTATO_PADRAO.nome, CONTATO_PADRAO.telefone))}>
          {busy ? 'Enviando…' : avulsoOk ? 'Enviar contato' : `Enviar ${CONTATO_PADRAO.nome}`}
        </BotaoPrimario>
      </>}
    >
      <p className="p-modal-msg">O cliente recebe como cartão de contato nativo do WhatsApp, pronto para salvar.</p>
      <div className="ctp-sec">Padrão do atendimento</div>
      <div className="ctp-item ctp-padrao">
        <span className="ct-av" aria-hidden>{initials(CONTATO_PADRAO.nome)}</span>
        <span className="ct-inf">
          <span className="ct-nm">{CONTATO_PADRAO.nome}</span>
          <span className="ct-tel num">+{CONTATO_PADRAO.telefone}</span>
        </span>
        <BotaoMini disabled={busy} onClick={() => enviar(CONTATO_PADRAO.nome, CONTATO_PADRAO.telefone)}>Enviar</BotaoMini>
      </div>
      <input className="inp" placeholder="Buscar por nome ou número…" value={busca} onChange={(e) => setBusca(e.target.value)} />
      <div className="ctp-lista">
        {eq.length > 0 && <div className="ctp-sec">Equipe</div>}
        {eq.map((u) => (
          <div className="ctp-item" key={'e' + u.telefone}>
            <span className="ct-av" aria-hidden>{initials(u.nome)}</span>
            <span className="ct-inf"><span className="ct-nm">{u.nome}</span><span className="ct-tel num">+{u.telefone}</span></span>
            <BotaoMini disabled={busy} onClick={() => enviar(u.nome, u.telefone)}>Enviar</BotaoMini>
          </div>
        ))}
        {equipe.length === 0 && (
          <div className="ctp-vazio">Nenhum atendente com telefone cadastrado — cada um pode preencher o seu em Configurações › Perfil.</div>
        )}
        {cv.length > 0 && <div className="ctp-sec">Conversas</div>}
        {cv.map((c) => (
          <div className="ctp-item" key={'c' + c.telefone}>
            <span className="ct-av" aria-hidden>{initials(c.nome)}</span>
            <span className="ct-inf"><span className="ct-nm">{c.nome}</span><span className="ct-tel num">+{c.telefone}</span></span>
            <BotaoMini disabled={busy} onClick={() => enviar(c.nome, c.telefone)}>Enviar</BotaoMini>
          </div>
        ))}
      </div>
      <div className="ctp-sec">Ou digite um contato</div>
      <div className="ctp-avulso">
        <input className="inp" placeholder="Nome" value={nomeAvulso} maxLength={120} onChange={(e) => setNomeAvulso(e.target.value)} />
        <input className="inp num" placeholder="DDI + DDD + número (ex.: 5551999990000)" value={telAvulso} onChange={(e) => setTelAvulso(e.target.value)} />
      </div>
    </ModalV2>
  );
}
