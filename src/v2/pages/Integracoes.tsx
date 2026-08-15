import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useOrg } from '@/context/OrgContext';
import {
  WA_REAL, useWaCanais, useWaLimite, useWaHealth, useEntregaAutoResumo, useRodarTesteEntrega,
  useFontesAquisicao, waCreateInstance, waReconnect, waQr, waStatus, waRemove, waOcultar,
  waUpdateComercial, waRenomearCanal, mascararNumero,
  type WaCanal, type WaLimite, type WaHealthCanal, type EntregaAutoResumo, type ComercialInput,
} from '@/data/whatsapp';
import { FB_REAL, useFbStatus, fbAuthStart, fbPages, fbConnect, fbDisconnect, type FbPaginaStatus } from '@/data/facebook';
import { useCloudDiagnostico, useWaTemplates, type CloudDiagnostico, type WaTemplate } from '@/data/cloudApi';
import { useOrgUsuarios } from '@/data/atendimento';
import {
  BadgeStatus, BotaoMini, BotaoPrimario, BotaoSec, CardVidro, ConfirmDialogV2, EstadoErro,
  Kpi, ModalV2, Segmentado, Skeleton, type TomStatus,
} from '../components';
import './integracoes.css';

/* ------------------------------------------------------------------
   Integrações v2 — hub de conexões (anatomia int-card do mockup;
   a realidade vence a ficção: canais REAIS com transporte real).
   Funcional de src/pages/Integracoes.tsx (somente leitura): QR,
   limite, saúde, diagnóstico, origem comercial, Facebook, card da
   Cloud API. Mutações reais existem em
   paridade, mas só são exercitadas no demo (:5176) — no ambiente
   real a operação está viva no canal oficial.
   ------------------------------------------------------------------ */

/* ---------- ícones ---------- */
const Ic = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{children}</svg>
);
const IcWa = () => <Ic><path d="M21 11.5a8.4 8.4 0 01-9 8.4 8.9 8.9 0 01-3.8-.8L3 20l1-4.9a8.3 8.3 0 01-1-4A8.4 8.4 0 0112 3a8.4 8.4 0 019 8.5z" /></Ic>;
const IcFb = () => <Ic><path d="M14 8h3V5h-3a4 4 0 00-4 4v2H7v3h3v7h3v-7h3l1-3h-4V9a1 1 0 011-1z" /></Ic>;
const IcCheck = () => <Ic><path d="M5 13l4 4L19 7" /></Ic>;
const IcPulso = () => <Ic><path d="M3 12h4l2-6 4 12 2-6h6" /></Ic>;
const IcLapis = () => <Ic><path d="M4 20h4l10-10a2.1 2.1 0 00-3-3L5 17v3z" /></Ic>;
const IcX = () => <Ic><path d="M6 6l12 12M18 6L6 18" /></Ic>;

/* ---------- constantes (verbatim da v1) ---------- */
const ORIGEM_TIPOS: Record<string, string> = {
  trafego: 'Tráfego', ura: 'URA', organico: 'Orgânico', indicacao: 'Indicação',
  campanha: 'Campanha', parceiro: 'Parceiro', outro: 'Outro',
};
const tipoOrigemLabel = (t: string | null | undefined) => (t ? ORIGEM_TIPOS[t] ?? null : null);
const ESTADO_LABEL: Record<string, string> = {
  saudavel: 'Saudável', enviando_sem_receber: 'Enviando · sem recebimento', instavel: 'Instável',
  sem_dados: 'Sem dados suficientes', reconectando: 'Reconectando', possivel_restricao: 'Problema no envio',
  falha_total: 'Falha no envio', desconectado: 'Desconectado',
};
/** cor do wa-health (verde/amarelo/laranja/vermelho) -> tom semântico v2 (laranja cai no âmbar). */
const COR_TOM: Record<string, TomStatus> = { verde: 'ok', amarelo: 'atencao', laranja: 'atencao', vermelho: 'erro' };
const SAUDE_LABEL: Record<string, string> = {
  saudavel: 'saudável', atencao: 'atenção', instavel: 'instável', restrito: 'restrita',
  sem_dados: 'aguardando 1º teste', inativo: 'inativa',
};
const SAUDE_TOM: Record<string, TomStatus> = {
  saudavel: 'ok', atencao: 'atencao', instavel: 'atencao', restrito: 'erro', sem_dados: 'neutro', inativo: 'neutro',
};
const RESULTADO_LABEL: Record<string, string> = {
  entregue: 'Entregue', lida: 'Lida', ERROR: 'Erro', timeout: 'Timeout',
  aguardando_ack: 'Aguardando ACK', SERVER_ACK: 'Aceito pelo servidor', PENDING: 'Aguardando ACK',
};
const WA_ST: Record<string, { t: string; tom: TomStatus }> = {
  conectado: { t: 'Conectado', tom: 'ok' }, sincronizando: { t: 'Sincronizando', tom: 'atencao' },
  desconectado: { t: 'Desconectado', tom: 'neutro' }, atencao: { t: 'Atenção', tom: 'atencao' }, erro: { t: 'Erro', tom: 'erro' },
};
const FB_MOTIVO: Record<string, string> = {
  login: 'Login do Facebook cancelado ou negado.', state: 'Sessão de conexão inválida ou expirada. Tente novamente.',
  config: 'Configuração da Meta ausente no servidor.', vault: 'Falha ao guardar a credencial com segurança.',
  sessao: 'Não foi possível iniciar a seleção de Página.', meta: 'A Meta recusou a autorização. Verifique permissões do app.',
};
const FONTES: Record<string, string> = {
  trafego_1: 'Tráfego 1', trafego_2: 'Tráfego 2', sistema_ura: 'Sistema URA', organico: 'Orgânico', outra: 'Outra',
};
const ST_TPL: Record<string, { t: string; tom: TomStatus }> = {
  aprovado: { t: 'Aprovado', tom: 'ok' }, pendente: { t: 'Em análise', tom: 'atencao' },
  rejeitado: { t: 'Rejeitado', tom: 'erro' }, pausado: { t: 'Pausado', tom: 'atencao' },
  desativado: { t: 'Desativado', tom: 'neutro' }, rascunho: { t: 'Rascunho', tom: 'neutro' },
};
/** Mensagem do erro com o fallback específico do contexto (paridade com os textos da v1). */
const msgOu = (e: unknown, fallback: string) => (e as Error)?.message || fallback;
type Aviso = { tom: 'ok' | 'erro'; texto: string } | null;

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const horaCurta = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
const haQuanto = (iso?: string | null) => {
  if (!iso) return '—';
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'agora'; if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60); if (h < 24) return `há ${h} h`; return `há ${Math.round(h / 24)} d`;
};
/** Mesmo slot determinístico do agendador (agenda.ts): minutos até o próximo teste deste canal. */
function proximoTeste(canalId: string): number | null {
  let h = 0;
  for (let i = 0; i < canalId.length; i++) h = (Math.imul(h, 31) + canalId.charCodeAt(i)) >>> 0;
  const slot = h % 12;
  const min = new Date().getUTCMinutes();
  const falta = (slot - (min % 12) + 12) % 12;
  return falta === 0 ? 12 : falta;
}

/* ---------- modo demonstração: seed + mutações em memória ---------- */
interface SeedInt {
  canais: WaCanal[];
  limite: WaLimite;
  health: Record<string, WaHealthCanal>;
  entrega: EntregaAutoResumo[];
  fb: FbPaginaStatus[];
  cloud: CloudDiagnostico;
  templates: WaTemplate[];
}
function canalDemo(n: Partial<WaCanal> & { id: string; alias: string }): WaCanal {
  return {
    numero: null, status: 'desconectado', provider: 'evolution', conectadoEm: null, transporte: 'evolution',
    envioRestrito: false, entregaStatus: 'desconhecido', entregaErrosRecentes: 0, conflitoCom: null,
    origemTipo: null, gestorId: null, gestorNome: null, fonteId: null, campanha: null, observacaoComercial: null, ...n,
  };
}
function healthDemo(n: Partial<WaHealthCanal> & { canalId: string; nome: string }): WaHealthCanal {
  return {
    numeroMasc: '', instancia: null, statusIntegracao: 'conectado', ativo: true, evoState: 'open',
    webhookOk: true, versao: '2.2.3', estado: 'saudavel', cor: 'verde', recebimento: 'ok', envio: 'ok',
    enviados: 0, entregues: 0, erros: 0, consecErros: 0, taxa: null, lastInbound: null, lastDelivered: null,
    lastWebhook: null, lastWebhookEvent: null, lastErrorAt: null, lastErrorMsg: null, last10: [],
    recomendacao: 'Canal saudável. Nenhuma ação necessária.', ...n,
  };
}
function entregaDemo(n: Partial<EntregaAutoResumo> & { canal_id: string; canal: string }): EntregaAutoResumo {
  return {
    apto: true, estado: 'ativo', pausado_ate: null, destino: '•••2825', frequencia_hora: 5,
    ultimo_em: null, ultimo_resultado: null, ultimo_latencia_ms: null, entregues_1h: 0, falhas_1h: 0,
    total_1h: 0, entregues_5: 0, erros_5: 0, timeouts_5: 0, pendente_recente: false, saude: 'saudavel', ...n,
  };
}
function seedInt(): SeedInt {
  const h = 3_600_000;
  const agora = Date.now();
  const iso = (t: number) => new Date(t).toISOString();
  return {
    canais: [
      canalDemo({
        id: 'ci-1', alias: 'LUIZA', numero: '5551981010001', status: 'conectado', conectadoEm: iso(agora - 400 * h),
        entregaStatus: 'ok', origemTipo: 'trafego', gestorId: 'u-mock', gestorNome: 'Juliana', campanha: 'Institucional',
      }),
      canalDemo({
        id: 'ci-2', alias: 'URA', numero: '5551981010002', status: 'conectado', conectadoEm: iso(agora - 900 * h),
        entregaStatus: 'instavel', entregaErrosRecentes: 3, origemTipo: 'ura',
      }),
      canalDemo({ id: 'ci-3', alias: 'ANDRIUS', numero: '5551981010003', status: 'desconectado' }),
      canalDemo({
        id: 'ci-4', alias: 'OFICIAL', numero: '5551991781390', status: 'conectado', provider: 'meta',
        transporte: 'cloud_api', conectadoEm: iso(agora - 200 * h), entregaStatus: 'ok', origemTipo: 'trafego',
      }),
    ],
    limite: { usados: 4, limite: 5, incluidos: 4, adicionais: 1, atingido: false },
    health: {
      'ci-1': healthDemo({
        canalId: 'ci-1', nome: 'LUIZA', numeroMasc: '•••0001', instancia: 'atv_luiza_01', estado: 'saudavel',
        cor: 'verde', enviados: 34, entregues: 33, erros: 1, taxa: 97,
        lastInbound: iso(agora - 9 * 60_000), lastDelivered: iso(agora - 4 * 60_000),
        lastWebhook: iso(agora - 2 * 60_000), lastWebhookEvent: 'messages.upsert',
        last10: [
          { hora: iso(agora - 4 * 60_000), status: 'READ', destino: '4471', erro: null },
          { hora: iso(agora - 22 * 60_000), status: 'DELIVERY_ACK', destino: '8830', erro: null },
          { hora: iso(agora - 47 * 60_000), status: 'DELIVERY_ACK', destino: '1265', erro: null },
        ],
      }),
      'ci-2': healthDemo({
        canalId: 'ci-2', nome: 'URA', numeroMasc: '•••0002', instancia: 'atv_ura_01', estado: 'instavel',
        cor: 'amarelo', envio: 'instável', enviados: 21, entregues: 13, erros: 8, consecErros: 1, taxa: 62,
        lastInbound: iso(agora - 3 * h), lastDelivered: iso(agora - 1 * h), lastWebhook: iso(agora - 12 * 60_000),
        lastWebhookEvent: 'messages.update', lastErrorAt: iso(agora - 35 * 60_000),
        lastErrorMsg: 'Connection Closed', recomendacao: 'Algumas mensagens não estão sendo entregues. Acompanhe os próximos testes automáticos.',
        last10: [
          { hora: iso(agora - 35 * 60_000), status: 'ERROR', destino: '5512', erro: 'Connection Closed' },
          { hora: iso(agora - 1 * h), status: 'DELIVERY_ACK', destino: '9018', erro: null },
        ],
      }),
    },
    entrega: [
      entregaDemo({
        canal_id: 'ci-1', canal: 'LUIZA', ultimo_em: iso(agora - 7 * 60_000), ultimo_resultado: 'entregue',
        ultimo_latencia_ms: 842, entregues_1h: 5, total_1h: 5, entregues_5: 5, saude: 'saudavel',
      }),
      entregaDemo({
        canal_id: 'ci-2', canal: 'URA', ultimo_em: iso(agora - 11 * 60_000), ultimo_resultado: 'timeout',
        ultimo_latencia_ms: null, entregues_1h: 3, falhas_1h: 2, total_1h: 5, entregues_5: 3, erros_5: 0,
        timeouts_5: 2, saude: 'instavel',
      }),
    ],
    fb: [{
      id: 'fbp-1', pagina_id: '108833472251', pagina_nome: 'Caf Assessoria', estado: 'conectado',
      canal_id: 'cfb-1', webhook_assinado: true, token_status: 'valido', expires_at: null, conectado_em: iso(agora - 700 * h),
    }],
    cloud: {
      ok: true, webhook_url: 'https://demo.supabase.co/functions/v1/cloud-webhook', graph_version: 'v20.0',
      secrets: { META_WHATSAPP_TOKEN: true, META_WA_APP_SECRET: true, META_WA_VERIFY_TOKEN: true },
      cloud_api_ativo: true, bot_dispatch: true,
      canais: [
        { id: 'ci-4', nome_interno: 'OFICIAL', numero_conectado: '5551991781390', cloud_phone_number_id: '431217836742210', cloud_waba_id: '2210433378', status_integracao: 'conectado', papel: 'atendimento', disparo_padrao: false },
        { id: 'ci-5', nome_interno: 'DISPARO', numero_conectado: null, cloud_phone_number_id: '431217836742211', cloud_waba_id: '2210433378', status_integracao: 'desconectado', papel: 'disparo', disparo_padrao: true },
      ],
      canal_disparo_id: 'ci-5', templates_aprovados: 2,
    },
    templates: [
      { id: 'tp-1', nome: 'rmkt_lembrete_d1', idioma: 'pt_BR', categoria: 'MARKETING', corpo: 'Oi {{1}}, tudo bem? Vi que você chamou a gente e a conversa ficou pela metade — posso te ajudar a continuar?', variaveis: [{ pos: 1, rotulo: 'nome', exemplo: 'Maria' }], status: 'aprovado', statusMotivo: null, usarEmRemarketing: true, wabaId: '2210433378', metaTemplateId: 'mt-1', sincronizadoEm: iso(agora - 90 * h), atualizadoEm: iso(agora - 90 * h), toque: 1 },
      { id: 'tp-2', nome: 'rmkt_retomada_d3', idioma: 'pt_BR', categoria: 'MARKETING', corpo: '{{1}}, ainda dá tempo de resolver o que você veio buscar. Quer que eu te chame por aqui?', variaveis: [{ pos: 1, rotulo: 'nome', exemplo: 'Maria' }], status: 'aprovado', statusMotivo: null, usarEmRemarketing: true, wabaId: '2210433378', metaTemplateId: 'mt-2', sincronizadoEm: iso(agora - 90 * h), atualizadoEm: iso(agora - 90 * h), toque: 3 },
      { id: 'tp-3', nome: 'rmkt_encerramento_d15', idioma: 'pt_BR', categoria: 'MARKETING', corpo: 'Vou encerrar por aqui, {{1}}. Se precisar, é só chamar de novo — a porta fica aberta.', variaveis: [{ pos: 1, rotulo: 'nome', exemplo: 'Maria' }], status: 'pendente', statusMotivo: null, usarEmRemarketing: false, wabaId: '2210433378', metaTemplateId: null, sincronizadoEm: null, atualizadoEm: iso(agora - 20 * h), toque: null },
    ],
  };
}
/** QR de demonstração: padrão xadrez em SVG (nenhuma sessão real envolvida). */
function qrDemo(): string {
  let cels = '';
  let x0 = 731;
  for (let y = 0; y < 21; y++) for (let x = 0; x < 21; x++) {
    x0 = (x0 * 16807) % 2147483647;
    if (x0 % 5 < 2) cels += `<rect x="${x * 10}" y="${y * 10}" width="10" height="10"/>`;
  }
  const olho = (x: number, y: number) => `<rect x="${x}" y="${y}" width="70" height="70" fill="none" stroke="#000" stroke-width="10"/><rect x="${x + 20}" y="${y + 20}" width="30" height="30"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 210 210" fill="#000"><rect width="210" height="210" fill="#fff"/>${cels}${olho(0, 0)}${olho(140, 0)}${olho(0, 140)}</svg>`;
  return 'data:image/svg+xml;base64,' + btoa(svg);
}

/* ================================================================== */

export default function IntegracoesV2() {
  const { currentOrg } = useOrg();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const demo = !WA_REAL;
  const [seed, setSeed] = useState<SeedInt>(seedInt);

  const podeConfig = currentOrg.role === 'admin' || currentOrg.role === 'gestor';

  const canaisQ = useWaCanais();
  const limiteQ = useWaLimite();
  const healthQ = useWaHealth();
  const entregaQ = useEntregaAutoResumo();
  const rodarTeste = useRodarTesteEntrega();
  const fbQ = useFbStatus();
  const cloudQ = useCloudDiagnostico(podeConfig);   // diagnóstico só com podeConfig (evita 403)
  const templatesQ = useWaTemplates();               // templates são leitura de todos (v1)

  const [aviso, setAviso] = useState<Aviso>(null);
  const [waFiltro, setWaFiltro] = useState<'ativos' | 'desconectados' | 'todos'>('ativos');
  const [waOpen, setWaOpen] = useState(false);
  const [reconectar, setReconectar] = useState<{ id: string; alias: string } | null>(null);
  const [diag, setDiag] = useState<string | null>(null);
  const [config, setConfig] = useState<WaCanal | null>(null);
  const [testando, setTestando] = useState<string | null>(null);
  const [remocao, setRemocao] = useState<{ tipo: 'whatsapp' | 'facebook'; id: string; nome: string; modo?: 'desconectar' | 'ocultar' } | null>(null);
  const [remLoading, setRemLoading] = useState(false);
  const [fbBusy, setFbBusy] = useState(false);
  const [fbSel, setFbSel] = useState<{ id: string; nome: string }[] | null>(null);
  const [fbCode, setFbCode] = useState<string | null>(null);

  /* ---------- dados (demo | real) ---------- */
  const canaisTodos = demo ? seed.canais : (canaisQ.data ?? []);
  const canais = useMemo(() => canaisTodos.filter((c) => c.transporte !== 'cloud_api'), [canaisTodos]);
  const conectados = canaisTodos.filter((c) => c.status === 'conectado').length;
  const ehAtivo = (s: string) => s === 'conectado' || s === 'sincronizando';
  const nDesconectados = canais.filter((c) => !ehAtivo(c.status)).length;
  const canaisVis = waFiltro === 'todos' ? canais
    : waFiltro === 'ativos' ? canais.filter((c) => ehAtivo(c.status))
    : canais.filter((c) => !ehAtivo(c.status));
  const limite = demo ? seed.limite : limiteQ.data;
  const waUsados = limite?.usados ?? canais.length;
  const waLimiteEfetivo = limite?.limite ?? 0;
  const waIncluidos = limite?.incluidos ?? 0;
  const waAdicionais = limite?.adicionais ?? 0;
  const waCheio = demo ? seed.limite.atingido || waUsados >= waLimiteEfetivo : (limiteQ.isSuccess && waUsados >= waLimiteEfetivo);
  const healthMap = useMemo(() => {
    if (demo) return new Map(Object.entries(seed.health));
    return new Map((healthQ.data?.canais ?? []).map((c) => [c.canalId, c]));
  }, [demo, seed.health, healthQ.data]);
  const entregaList = demo ? seed.entrega : (entregaQ.data ?? []);
  const entregaMap = useMemo(() => new Map(entregaList.map((e) => [e.canal_id, e])), [entregaList]);
  const fbPaginas = demo ? seed.fb : (fbQ.data ?? []);
  const fbConectadas = fbPaginas.filter((p) => p.estado === 'conectado').length;
  const cloud = demo ? seed.cloud : cloudQ.data;
  const cloudFaltaSecret = !!cloud && (!cloud.secrets.META_WHATSAPP_TOKEN || !cloud.secrets.META_WA_APP_SECRET || !cloud.secrets.META_WA_VERIFY_TOKEN);
  const templates = demo ? seed.templates : (templatesQ.data ?? []);

  const carregando = !demo && (canaisQ.isLoading || limiteQ.isLoading);

  const refresh = (comAviso = false) => {
    if (demo) {
      // após uma ação o aviso da própria ação prevalece; só o botão Atualizar fala
      if (comAviso) setAviso({ tom: 'ok', texto: 'Modo demonstração: dados locais atualizados.' });
      return;
    }
    qc.invalidateQueries({ queryKey: ['wa-canais', currentOrg.id] });
    qc.invalidateQueries({ queryKey: ['wa-limite', currentOrg.id] });
    qc.invalidateQueries({ queryKey: ['wa-conversas', currentOrg.id] });
    qc.invalidateQueries({ queryKey: ['fb-status', currentOrg.id] });
    qc.invalidateQueries({ queryKey: ['fb-conversas', currentOrg.id] });
  };

  /* ---------- retorno do OAuth da Meta (?fb=connect&code= | ?fb=error&motivo=) ---------- */
  const fbRetorno = useRef(false);
  useEffect(() => {
    if (fbRetorno.current || demo) return;
    fbRetorno.current = true;
    const fb = params.get('fb');
    if (!fb) return;
    const limparParams = () => {
      const p = new URLSearchParams(params);
      p.delete('fb'); p.delete('code'); p.delete('motivo');
      setParams(p, { replace: true });
    };
    if (fb === 'error') {
      setAviso({ tom: 'erro', texto: FB_MOTIVO[params.get('motivo') ?? ''] || 'Falha ao conectar o Facebook.' });
      limparParams();
      return;
    }
    if (fb === 'connect') {
      const code = params.get('code');
      if (!code) { limparParams(); return; }
      setFbBusy(true);
      fbPages(code)
        .then((r) => {
          setFbCode(code);
          setFbSel(r.paginas);
          if (!r.paginas.length) setAviso({ tom: 'erro', texto: 'Nenhuma Página disponível nesta conta.' });
        })
        .catch((e) => setAviso({ tom: 'erro', texto: msgOu(e, 'Sessão inválida.') }))
        .finally(() => { setFbBusy(false); limparParams(); });
    }
  }, [demo, params, setParams]);

  const fbIniciar = async () => {
    if (demo) { setAviso({ tom: 'ok', texto: 'Disponível com o backend configurado' }); return; }
    setFbBusy(true);
    try {
      const r = await fbAuthStart();
      window.location.assign(r.url);
    } catch (e) {
      const m = (e as Error)?.message ?? '';
      setAviso({
        tom: 'erro',
        texto: m.includes('forbidden') || m.includes('permiss') ? 'Sem permissão. Apenas admin/supervisor conecta o Facebook.'
          : m.includes('config') ? 'Configuração da Meta ausente no servidor.'
          : m || 'Falha ao iniciar conexão.',
      });
      setFbBusy(false);
    }
  };
  const fbEscolher = async (paginaId: string) => {
    if (!fbCode) return;
    setFbBusy(true);
    try {
      const r = await fbConnect(fbCode, paginaId);
      setAviso({ tom: 'ok', texto: `Página conectada: ${r.pagina_nome}` });
      setFbSel(null); setFbCode(null);
      refresh();
    } catch (e) {
      const m = (e as Error)?.message ?? '';
      setAviso({ tom: 'erro', texto: m.includes('outra_org') ? 'Esta Página já está vinculada a outra organização.' : m || 'Falha ao conectar a Página.' });
    } finally { setFbBusy(false); }
  };

  /* ---------- renomear conexão (inline, no próprio card) ----------
     Usa a RPC dedicada: renomear NÃO pode encostar na origem comercial
     (origem/gestor/fonte alimentam a linhagem do lead nos relatórios). */
  const renomear = async (canalId: string, nome: string, aplicarDemo: () => void) => {
    try {
      if (demo) aplicarDemo();
      else {
        await waRenomearCanal(canalId, nome);
        qc.invalidateQueries({ queryKey: ['wa-canais', currentOrg.id] });
        qc.invalidateQueries({ queryKey: ['cloud-diagnostico', currentOrg.id] });
        qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0] ?? '').startsWith('rel-') });
      }
      setAviso({ tom: 'ok', texto: `Conexão renomeada para "${nome}".` });
    } catch (e) {
      const m = msgOu(e, 'Falha ao renomear.');
      setAviso({ tom: 'erro', texto: m.includes('sem_permissao') ? 'Sem permissão. Apenas admin/supervisor renomeia conexões.' : m });
      throw e;   // mantém o campo aberto para o usuário corrigir
    }
  };

  /* ---------- remoção / desconexão (WA e FB) ---------- */
  const confirmarRemocao = async () => {
    if (!remocao) return;
    setRemLoading(true);
    try {
      if (demo) {
        if (remocao.tipo === 'facebook') setSeed((s) => ({ ...s, fb: s.fb.filter((p) => p.canal_id !== remocao.id) }));
        else if (remocao.modo === 'ocultar') setSeed((s) => ({ ...s, canais: s.canais.filter((c) => c.id !== remocao.id), limite: { ...s.limite, usados: s.limite.usados - 1 } }));
        else setSeed((s) => ({ ...s, canais: s.canais.map((c) => (c.id === remocao.id ? { ...c, status: 'desconectado' } : c)) }));
      } else if (remocao.tipo === 'whatsapp' && remocao.modo === 'ocultar') await waOcultar(currentOrg.id, remocao.id);
      else if (remocao.tipo === 'whatsapp') await waRemove(currentOrg.id, remocao.id);
      else await fbDisconnect(remocao.id);
      setAviso({
        tom: 'ok',
        texto: remocao.modo === 'ocultar' ? 'Conexão removida da lista. Histórico preservado.'
          : remocao.tipo === 'whatsapp' ? 'WhatsApp desconectado. Histórico preservado.' : 'Conexão removida.',
      });
      setRemocao(null);
      refresh();
    } catch (e) {
      console.error('[integracoes] falha ao remover conexão', e);
      setAviso({ tom: 'erro', texto: msgOu(e, 'Falha ao remover a conexão. Tente novamente.') });
    } finally { setRemLoading(false); }
  };

  const rodarTesteAgora = async (c: WaCanal) => {
    setTestando(c.id);
    try {
      if (demo) {
        setAviso({ tom: 'ok', texto: 'Teste enviado. O resultado aparece quando o ACK chegar.' });
        return;
      }
      const r = await rodarTeste.mutateAsync(c.id);
      const pulado = (r.resultados?.[0] as { pulado?: string } | undefined)?.pulado;
      if (pulado === 'ja_aguardando_ack') setAviso({ tom: 'erro', texto: 'Já há um teste aguardando ACK. Aguarde o resultado.' });
      else if (pulado) setAviso({ tom: 'erro', texto: `Teste não enviado (${pulado}).` });
      else setAviso({ tom: 'ok', texto: 'Teste enviado. O resultado aparece quando o ACK chegar.' });
    } catch {
      setAviso({ tom: 'erro', texto: 'Não foi possível rodar o teste agora.' });
    } finally { setTestando(null); }
  };

  /* callback do modal de conexão: no demo, materializa o canal conectado
     (contador monotônico — comprimento do array colide após remover+recriar) */
  const demoSeq = useRef(0);
  const aoConectarDemo = (alias: string, numero: string) => {
    demoSeq.current += 1;
    const id = `ci-d${demoSeq.current}`;
    setSeed((s) => ({
      ...s,
      canais: [...s.canais, canalDemo({ id, alias, numero, status: 'conectado', conectadoEm: new Date().toISOString(), entregaStatus: 'desconhecido' })],
      limite: { ...s.limite, usados: s.limite.usados + 1 },
    }));
  };
  const aoReconectarDemo = (canalId: string) => {
    setSeed((s) => ({ ...s, canais: s.canais.map((c) => (c.id === canalId ? { ...c, status: 'conectado', conectadoEm: new Date().toISOString() } : c)) }));
  };

  const copiar = async (texto: string, rotulo: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      setAviso({ tom: 'ok', texto: `${rotulo} copiado.` });
    } catch {
      setAviso({ tom: 'erro', texto: 'Não foi possível copiar. Selecione e copie manualmente.' });
    }
  };

  const diagH = diag ? healthMap.get(diag) ?? null : null;
  const diagCanal = diag ? canaisTodos.find((c) => c.id === diag) ?? null : null;

  /* ================================================================ */
  return (
    <>
      <div className="ph sobe">
        <div>
          <h2>Integrações</h2>
          <p>
            Conexões do canal e serviços do sistema.
            {demo ? ' · modo demonstração (nada é gravado)' : ''}
          </p>
        </div>
        <div className="acoes">
          <BotaoSec onClick={() => refresh(true)}>Atualizar</BotaoSec>
          {podeConfig && (
            <BotaoPrimario
              disabled={waCheio}
              title={waCheio ? 'Limite de WhatsApp atingido. Contrate um WhatsApp adicional.' : undefined}
              onClick={() => setWaOpen(true)}
            >
              ＋ Conectar WhatsApp
            </BotaoPrimario>
          )}
        </div>
      </div>

      {aviso && (
        <div className={aviso.tom === 'erro' ? 'aviso-inline erro' : 'aviso-inline'} role="status">
          {aviso.texto}
          <button type="button" onClick={() => setAviso(null)} aria-label="Fechar aviso">×</button>
        </div>
      )}

      {/* resumo (sum-grid da v1) */}
      <div className="kpis">
        <Kpi rotulo="Integrações conectadas" valor={conectados + fbConectadas} sobe atraso={0.05} />
        <Kpi
          rotulo="WhatsApp ativos" valor={conectados} sobe atraso={0.1}
          sufixo={` de ${waUsados} contratado${waUsados === 1 ? '' : 's'}`}
          delta={{
            tom: nDesconectados > 0 ? 'atencao' : 'neutro',
            texto: `${nDesconectados > 0 ? `${nDesconectados} desconectado${nDesconectados === 1 ? '' : 's'} · ` : ''}limite do plano ${waLimiteEfetivo}${waAdicionais > 0 ? ` (${waIncluidos}+${waAdicionais})` : ''}`,
          }}
        />
        <Kpi rotulo="Facebook conectados" valor={fbConectadas} sobe atraso={0.15} />
      </div>

      {/* ---------- WhatsApp (Evolution / QR) ---------- */}
      <section className="intg-sec" style={{ marginTop: 8 }}>
        <div className="intg-sec-head sobe" style={{ animationDelay: '.12s' }}>
          <div>
            <h3><IcWa /> WhatsApp</h3>
            <p>Conecte um número lendo o QR Code pelo aplicativo do WhatsApp.</p>
          </div>
          {canais.length > 0 && (
            <Segmentado
              rotulo="Filtro de conexões WhatsApp"
              valor={waFiltro}
              aoMudar={setWaFiltro}
              opcoes={[
                { valor: 'ativos', rotulo: 'Ativos' },
                { valor: 'desconectados', rotulo: `Desconectados${nDesconectados ? ` (${nDesconectados})` : ''}` },
                { valor: 'todos', rotulo: 'Todos' },
              ]}
            />
          )}
        </div>

        {canaisQ.isError && !demo ? (
          <CardVidro sobe><EstadoErro descricao="Erro ao carregar as conexões. Verifique a conexão." aoTentarDeNovo={() => canaisQ.refetch()} /></CardVidro>
        ) : carregando ? (
          <div className="intg-grade" aria-hidden>
            {[0, 1].map((i) => (
              <CardVidro key={i} className="int-card">
                <div style={{ display: 'flex', gap: 11, alignItems: 'center' }}>
                  <Skeleton largura={34} altura={34} raio={9} />
                  <div style={{ flex: 1 }}><Skeleton largura="40%" /><div style={{ height: 6 }} /><Skeleton largura="26%" /></div>
                </div>
                <Skeleton largura="70%" altura={20} raio={99} />
              </CardVidro>
            ))}
          </div>
        ) : canais.length === 0 ? (
          <div className="intg-nota sobe">
            Nenhum número conectado ainda. Clique em <b>Conectar WhatsApp</b> para ler o QR Code.
          </div>
        ) : canaisVis.length === 0 ? (
          <div className="intg-nota sobe">Nenhuma conexão neste filtro.</div>
        ) : (
          <div className="intg-grade">
            {canaisVis.map((c, i) => (
              <CanalCard
                key={c.id} canal={c} h={healthMap.get(c.id)} ea={entregaMap.get(c.id)} canais={canais}
                podeConfig={podeConfig} testando={testando === c.id} atraso={0.14 + i * 0.06}
                ehAtivo={ehAtivo(c.status)}
                aoDiagnostico={() => setDiag(c.id)}
                aoTeste={() => rodarTesteAgora(c)}
                aoConfig={() => setConfig(c)}
                aoRenomear={(nome) => renomear(c.id, nome, () => setSeed((s) => ({
                  ...s, canais: s.canais.map((k) => (k.id === c.id ? { ...k, alias: nome } : k)),
                })))}
                aoReconectar={() => setReconectar({ id: c.id, alias: c.alias })}
                aoDesconectar={() => setRemocao({ tipo: 'whatsapp', id: c.id, nome: c.alias + (c.numero ? ' · ' + mascararNumero(c.numero) : ''), modo: 'desconectar' })}
                aoRemover={() => setRemocao({ tipo: 'whatsapp', id: c.id, nome: c.alias + (c.numero ? ' · ' + mascararNumero(c.numero) : ''), modo: 'ocultar' })}
              />
            ))}
          </div>
        )}
        {podeConfig && waCheio && (
          <div className="intg-foot">
            <span className="lim num">Limite atingido ({waUsados}/{waLimiteEfetivo}). Contrate um WhatsApp adicional.</span>
          </div>
        )}
      </section>

      {/* ---------- API oficial (Cloud API) ---------- */}
      <section className="intg-sec" id="api-oficial">
        <div className="intg-sec-head sobe" style={{ animationDelay: '.2s' }}>
          <div>
            <h3><IcWa /> WhatsApp Cloud API</h3>
            <p>Canal oficial da Meta — número verificado, modelos de mensagem e webhook próprios.</p>
          </div>
        </div>
        {!demo && cloudQ.isLoading && podeConfig ? (
          <CardVidro className="int-card" aria-hidden><Skeleton largura="50%" /><Skeleton largura="80%" altura={26} raio={7} /></CardVidro>
        ) : (
          <div className="vidro spot sobe int-card" style={{ animationDelay: '.24s' }}>
            <div className="int-l1">
              <div className="int-ic"><IcWa /></div>
              <div className="tx">
                <div className="int-n">
                  <span>WhatsApp Cloud API</span>
                  <span className="intg-transp">Cloud API · Meta</span>
                </div>
                <div className="int-s num">
                  {(() => {
                    if (!cloud) return 'Meta · WhatsApp Business Platform';
                    const at = cloud.canais.find((k) => k.papel !== 'disparo' && k.numero_conectado) ?? cloud.canais[0];
                    return at?.numero_conectado ? `Meta oficial · ${mascararNumero(at.numero_conectado)}` : 'Meta oficial · número ainda não confirmado';
                  })()}
                </div>
              </div>
              {cloud && (
                <BadgeStatus tom={cloud.canais.length ? (cloudFaltaSecret ? 'atencao' : 'ok') : 'neutro'}>
                  {cloud.canais.length ? (cloudFaltaSecret ? 'Configuração incompleta' : 'Pronta') : 'Não configurada'}
                </BadgeStatus>
              )}
            </div>

            {!podeConfig && (
              <div className="intg-nota">A configuração da conta oficial fica com administradores e supervisores.</div>
            )}
            {podeConfig && !cloud && !demo && (
              <div className="intg-nota">Disponível com o backend configurado.</div>
            )}

            {cloud && podeConfig && (
              <>
                <div className="mono">
                  <span title={cloud.webhook_url}>{cloud.webhook_url}</span>
                  <b role="button" tabIndex={0} onClick={() => copiar(cloud.webhook_url, 'Endereço')}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); copiar(cloud.webhook_url, 'Endereço'); } }}>
                    Copiar
                  </b>
                </div>

                <div className="intg-check">
                  {([
                    ['META_WHATSAPP_TOKEN', cloud.secrets.META_WHATSAPP_TOKEN, false],
                    ['META_WA_APP_SECRET', cloud.secrets.META_WA_APP_SECRET, false],
                    ['META_WA_VERIFY_TOKEN', cloud.secrets.META_WA_VERIFY_TOKEN, false],
                    ['CLOUD_API_ATIVO', cloud.cloud_api_ativo, false],
                    ['CLOUD_BOT_DISPATCH', cloud.bot_dispatch, true],
                  ] as [string, boolean, boolean][]).map(([nome, ok, neutro]) => (
                    <div className="it" key={nome}>
                      <span className={ok ? (neutro ? 'neutro' : 'ok') : neutro ? 'neutro' : 'falta'}>{ok ? '✓' : '✗'}</span>
                      <b>{nome}</b>
                    </div>
                  ))}
                </div>

                {!cloud.canal_disparo_id && cloud.canais.length > 0 && (
                  <div className="intg-alerta t-at">
                    Sem canal de disparo definido: o remarketing por modelo NÃO envia — ele nunca cai no número de tráfego.
                  </div>
                )}

                {cloud.canais.length > 0 && (
                  <div className="intg-linhas">
                    {cloud.canais.map((k) => (
                      <div className="intg-linha" key={k.id}>
                        <div className="tx">
                          <div className="nm">
                            <NomeEditavel
                              nome={k.nome_interno ?? 'Número oficial'}
                              podeEditar={podeConfig}
                              titulo="Renomear número oficial"
                              aoSalvar={(nome) => renomear(k.id, nome, () => setSeed((s) => ({
                                ...s, cloud: { ...s.cloud, canais: s.cloud.canais.map((x) => (x.id === k.id ? { ...x, nome_interno: nome } : x)) },
                              })))}
                            />
                            <BadgeStatus tom={k.papel === 'disparo' ? 'atencao' : 'ok'}>
                              {k.papel === 'disparo' ? 'Disparo' : k.papel === 'ambos' ? 'Ambos' : 'Atendimento'}
                            </BadgeStatus>
                            {cloud.canal_disparo_id === k.id && <BadgeStatus tom="neutro">é quem dispara</BadgeStatus>}
                          </div>
                          <div className="sb num">
                            {k.numero_conectado ? mascararNumero(k.numero_conectado) : 'número ainda não confirmado'}
                            {` · ID ${k.cloud_phone_number_id ?? '—'}`}
                            {k.cloud_waba_id ? '' : ' · sem WABA — não sincroniza modelos'}
                          </div>
                        </div>
                        {/* "conectado" sozinho não prova nada — o que prova é a Meta ter devolvido o número */}
                        <BadgeStatus tom={k.status_integracao === 'conectado' && k.numero_conectado ? 'ok' : 'neutro'}>
                          {k.status_integracao === 'conectado' && k.numero_conectado ? 'Confirmado na Meta' : 'Aguardando confirmação'}
                        </BadgeStatus>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {templates.length > 0 && (
              <>
                <div className="diag-sec" style={{ margin: '4px 0 0' }}>
                  Modelos de mensagem
                  <span className="obs num">{templates.filter((t) => t.status === 'aprovado').length} aprovado{templates.filter((t) => t.status === 'aprovado').length === 1 ? '' : 's'}</span>
                </div>
                <div className="intg-linhas">
                  {templates.map((t) => (
                    <div className="intg-linha" key={t.id}>
                      <div className="tx">
                        <div className="nm">
                          <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11.5 }}>{t.nome}</span>
                          {t.usarEmRemarketing && t.toque && <BadgeStatus tom="ok">toque {t.toque} do remarketing</BadgeStatus>}
                        </div>
                        <div className="sb">{t.idioma} · {t.categoria.toLowerCase()}</div>
                      </div>
                      <BadgeStatus tom={(ST_TPL[t.status] ?? ST_TPL.rascunho).tom}>{(ST_TPL[t.status] ?? { t: t.status }).t}</BadgeStatus>
                    </div>
                  ))}
                </div>
              </>
            )}
            {podeConfig && (
              <div className="int-s">A gestão do canal oficial (cadastrar número, papéis e edição de modelos) segue na página antiga até a sessão dedicada.</div>
            )}
          </div>
        )}
      </section>

      {/* ---------- Facebook ---------- */}
      <section className="intg-sec" id="facebook">
        <div className="intg-sec-head sobe" style={{ animationDelay: '.26s' }}>
          <div>
            <h3><IcFb /> Facebook</h3>
            <p>Conecte uma Página para receber e responder mensagens do Messenger.</p>
          </div>
        </div>
        <div className="vidro spot sobe int-card" style={{ animationDelay: '.3s' }}>
          <div className="int-l1">
            <div className="int-ic"><IcFb /></div>
            <div className="tx">
              <div className="int-n"><span>Conta do Facebook</span></div>
              <div className="int-s">Receber e responder mensagens da sua Página no Messenger (somente texto).</div>
            </div>
            <BadgeStatus tom={fbConectadas > 0 ? 'ok' : 'neutro'}>{fbConectadas > 0 ? 'Conectado' : 'Não conectado'}</BadgeStatus>
          </div>

          {!FB_REAL && !demo ? (
            <div className="intg-nota">Disponível com o backend configurado.</div>
          ) : fbSel ? (
            <>
              <div className="int-s" style={{ fontWeight: 600, color: 'var(--txt)' }}>Escolha a Página para conectar</div>
              {fbSel.length === 0 ? (
                <div className="intg-nota">
                  Nenhuma Página encontrada nesta conta do Facebook. Você precisa ser <b>administrador de uma Página</b> e,
                  na tela de autorização da Meta, <b>marcar a Página</b> que deseja conectar. Crie/assuma uma Página e
                  clique novamente em “Conectar com Facebook”.
                </div>
              ) : (
                <div className="intg-linhas">
                  {fbSel.map((p) => (
                    <div className="intg-linha" key={p.id}>
                      <div className="tx"><div className="nm">{p.nome}</div></div>
                      <BotaoMini disabled={fbBusy} onClick={() => fbEscolher(p.id)}>Conectar esta Página</BotaoMini>
                    </div>
                  ))}
                </div>
              )}
              <div className="intg-acoes"><BotaoMini onClick={() => { setFbSel(null); setFbCode(null); }}>Cancelar</BotaoMini></div>
            </>
          ) : fbPaginas.length === 0 ? (
            <div className="intg-nota">
              Nenhuma Página conectada. Clique em <b>Conectar com Facebook</b> para autorizar e escolher a Página.
            </div>
          ) : (
            <div className="intg-linhas">
              {fbPaginas.map((p) => {
                const badge = p.estado !== 'conectado' ? { t: 'Desconectado', tom: 'neutro' as TomStatus }
                  : p.token_status && p.token_status !== 'valido' ? { t: 'Token inválido', tom: 'erro' as TomStatus }
                  : !p.webhook_assinado ? { t: 'Webhook pendente', tom: 'atencao' as TomStatus }
                  : { t: 'Conectado', tom: 'ok' as TomStatus };
                return (
                  <div className="intg-linha" key={p.id}>
                    <div className="tx">
                      <div className="nm">{p.pagina_nome || p.pagina_id}</div>
                      <div className="sb num">Página · {p.pagina_id}</div>
                    </div>
                    <BadgeStatus tom={badge.tom}>{badge.t}</BadgeStatus>
                    {/* v1 mostra as ações a todos — o backend recusa com mensagem clara */}
                    <div className="intg-acoes">
                      <BotaoMini disabled={fbBusy} onClick={fbIniciar}>Reconectar</BotaoMini>
                      {p.estado === 'conectado' && (
                        <button
                          type="button" className="p-btn btn-perigo btn-mini" disabled={remLoading}
                          onClick={() => setRemocao({ tipo: 'facebook', id: p.canal_id, nome: p.pagina_nome || p.pagina_id })}
                        >
                          {remLoading && remocao?.id === p.canal_id ? 'Removendo…' : 'Remover conexão'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {(FB_REAL || demo) && !fbSel && (
            <div className="intg-acoes" style={{ justifyContent: 'flex-start' }}>
              <BotaoSec mini disabled={fbBusy || !!fbSel} onClick={fbIniciar}>
                {fbBusy ? 'Conectando…' : 'Conectar com Facebook'}
              </BotaoSec>
            </div>
          )}
        </div>
      </section>

      {/* ---------- Saúde das integrações ---------- */}
      <section className="intg-sec">
        <div className="intg-sec-head sobe" style={{ animationDelay: '.38s' }}>
          <div>
            <h3><IcPulso /> Saúde das integrações</h3>
            <p>Eventos recentes de conexões e mensagens.</p>
          </div>
        </div>
        <div className="intg-nota sobe" style={{ animationDelay: '.4s' }}>
          Nenhum evento recente. Os eventos aparecem aqui após conectar um canal.
        </div>
      </section>

      {/* ---------- modais ---------- */}
      {(waOpen || reconectar) && (
        <ConectarWaModal
          orgId={currentOrg.id}
          demo={demo}
          reconnectCanalId={reconectar?.id}
          reconnectAlias={reconectar?.alias}
          aoFechar={() => { setWaOpen(false); setReconectar(null); }}
          aoConectado={(alias, numero) => {
            if (demo) {
              if (reconectar) aoReconectarDemo(reconectar.id);
              else aoConectarDemo(alias, numero || '5551988880000');
            } else refresh();
          }}
          aoCancelado={() => refresh()}
        />
      )}

      {diagH && (
        <DiagnosticoModalV2
          h={diagH}
          canal={diagCanal}
          podeAgir={demo ? podeConfig : (healthQ.data?.podeAgir ?? podeConfig)}
          atualizando={!demo && healthQ.isFetching}
          entregaAuto={entregaMap.get(diagH.canalId) ?? null}
          proximoMin={proximoTeste(diagH.canalId)}
          aoFechar={() => setDiag(null)}
          aoAtualizar={() => { if (!demo) healthQ.refetch(); }}
          aoReconectar={() => { setDiag(null); setReconectar({ id: diagH.canalId, alias: diagH.nome }); }}
          aoDesconectar={() => { setDiag(null); setRemocao({ tipo: 'whatsapp', id: diagH.canalId, nome: `${diagH.nome} · ${diagH.numeroMasc}`, modo: 'desconectar' }); }}
        />
      )}

      {config && (
        <ConfigOrigemModalV2
          canal={config}
          demo={demo}
          aoFechar={() => setConfig(null)}
          aoSalvo={(dados) => {
            if (demo) {
              setSeed((s) => ({
                ...s,
                canais: s.canais.map((c) => (c.id === config.id ? {
                  ...c, alias: dados.nome_interno?.trim() || 'WhatsApp', origemTipo: dados.origem_tipo,
                  gestorId: dados.gestor_id, fonteId: dados.fonte_aquisicao_id, campanha: dados.campanha,
                  observacaoComercial: dados.observacao_comercial,
                } : c)),
              }));
            } else {
              qc.invalidateQueries({ queryKey: ['wa-canais', currentOrg.id] });
              qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0] ?? '').startsWith('rel-') });
            }
            setConfig(null);
            setAviso({ tom: 'ok', texto: 'Configuração salva.' });
          }}
        />
      )}

      <ConfirmDialogV2
        aberto={!!remocao}
        titulo={remocao?.modo === 'ocultar' ? 'Remover da lista?' : remocao?.tipo === 'whatsapp' ? 'Desconectar WhatsApp?' : 'Remover conexão?'}
        mensagem={
          remocao?.modo === 'ocultar'
            ? `A conexão "${remocao.nome}" vai sumir da lista de Integrações, mas TODO o histórico (conversas, mensagens, contatos, oportunidades e relatórios) é preservado. Se ela ainda estiver conectada, a sessão é encerrada.`
            : remocao?.tipo === 'whatsapp'
              ? `A conexão "${remocao.nome}" será encerrada, mas conversas, contatos, histórico e relatórios serão preservados. Você poderá reconectar o mesmo número depois.`
              : `A conexão "${remocao?.nome}" será desconectada do provedor e deixará de aparecer na lista. O histórico de conversas e mensagens é preservado.`
        }
        rotuloConfirmar={remocao?.modo === 'ocultar' ? 'Remover da lista' : remocao?.tipo === 'whatsapp' ? 'Desconectar' : 'Remover conexão'}
        destrutivo
        carregando={remLoading}
        aoConfirmar={confirmarRemocao}
        aoCancelar={() => setRemocao(null)}
      />
    </>
  );
}

/* ================================================================
   Nome da conexão editável no lugar em que ele é lido: clicar troca
   o rótulo por um campo (Enter salva, Esc cancela). Renomeia e só —
   a origem comercial fica intocada (RPC renomear_canal).
   ================================================================ */
function NomeEditavel({ nome, podeEditar, titulo = 'Renomear conexão', aoSalvar }: {
  nome: string; podeEditar: boolean; titulo?: string; aoSalvar: (novo: string) => Promise<void>;
}) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(nome);
  const [salvando, setSalvando] = useState(false);
  const inpRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editando) inpRef.current?.select(); }, [editando]);

  if (!podeEditar) return <span>{nome}</span>;

  if (!editando) {
    return (
      <button type="button" className="intg-nome" title={titulo} onClick={() => { setValor(nome); setEditando(true); }}>
        <span>{nome}</span><IcLapis />
      </button>
    );
  }

  const confirmar = async () => {
    const novo = valor.trim();
    if (!novo || novo === nome) { setEditando(false); return; }
    setSalvando(true);
    try { await aoSalvar(novo); setEditando(false); } catch { /* o aviso vem do pai; o campo continua aberto */ }
    setSalvando(false);
  };

  return (
    <span className="intg-nome-ed">
      <input
        ref={inpRef} className="intg-nome-inp" value={valor} maxLength={60} disabled={salvando}
        aria-label={titulo} autoFocus
        onChange={(e) => setValor(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); confirmar(); }
          if (e.key === 'Escape') { e.preventDefault(); setEditando(false); }
        }}
      />
      <button type="button" className="intg-nome-ok" title="Salvar (Enter)" disabled={salvando} onClick={confirmar}><IcCheck /></button>
      <button type="button" className="intg-nome-x" title="Cancelar (Esc)" disabled={salvando} onClick={() => setEditando(false)}><IcX /></button>
    </span>
  );
}

/* ================================================================
   Card de canal WhatsApp (Evolution) — chips Sessão/Entrega/Auto
   + alerta único em cascata (o mais grave vence), como na v1.
   ================================================================ */
function CanalCard({ canal: c, h, ea, canais, podeConfig, testando, atraso, ehAtivo, aoDiagnostico, aoTeste, aoConfig, aoRenomear, aoReconectar, aoDesconectar, aoRemover }: {
  canal: WaCanal; h: WaHealthCanal | undefined; ea: EntregaAutoResumo | undefined; canais: WaCanal[];
  podeConfig: boolean; testando: boolean; atraso: number; ehAtivo: boolean;
  aoDiagnostico: () => void; aoTeste: () => void; aoConfig: () => void; aoRenomear: (nome: string) => Promise<void>;
  aoReconectar: () => void; aoDesconectar: () => void; aoRemover: () => void;
}) {
  const st = WA_ST[c.status] ?? { t: c.status, tom: 'neutro' as TomStatus };

  const chipSessao = c.conflitoCom
    ? { txt: 'Conflito', tom: 'erro' as TomStatus, title: 'Número já pertence a outro canal — este não será usado.' }
    : h
      ? { txt: ESTADO_LABEL[h.estado] ?? h.estado, tom: COR_TOM[h.cor] ?? 'neutro', title: `Recebimento: ${h.recebimento} · Envio: ${h.envio}` }
      : { txt: st.t, tom: 'neutro' as TomStatus, title: 'Estado da sessão do WhatsApp' };

  const ENTREGA_CHIP: Record<string, { txt: string; tom: TomStatus; title: string }> = {
    ok: { txt: 'Ok', tom: 'ok', title: 'Mensagens estão sendo entregues.' },
    instavel: { txt: 'Instável', tom: 'atencao', title: 'Algumas mensagens não estão sendo entregues.' },
    restrito: { txt: 'Restrita', tom: 'erro', title: 'O WhatsApp está recusando a entrega deste canal.' },
  };
  const chipEntrega = ENTREGA_CHIP[c.entregaStatus ?? ''] ?? { txt: 'Aguardando', tom: 'neutro' as TomStatus, title: 'Ainda sem sinal de entrega.' };

  const chipAuto = ea?.apto
    ? {
      txt: ea.estado === 'pausado' ? 'Pausado' : ea.total_1h > 0 ? `${ea.entregues_1h}/${ea.total_1h}` : '—',
      tom: SAUDE_TOM[ea.saude] ?? 'neutro',
      title: `Teste automático ${ea.frequencia_hora}/h ao ${ea.destino} — entregues na última hora`,
    }
    : null;

  const alerta = c.conflitoCom
    ? { txt: `Número já cadastrado como ${canais.find((k) => k.id === c.conflitoCom)?.alias ?? 'outro canal'}. Reconecte o existente ou remova este.`, tom: 't-er' }
    : ehAtivo && c.entregaStatus === 'restrito'
      ? { txt: 'Envio via API falhando. Use outro canal.', tom: 't-er' }
      : ehAtivo && c.entregaStatus === 'instavel'
        ? { txt: 'Algumas mensagens não estão sendo entregues.', tom: 't-at' }
        : ea?.apto && ea.saude === 'sem_dados'
          ? { txt: 'Aguardando primeiro teste automático.', tom: 't-ne' }
          : !c.origemTipo && !c.gestorId
            ? { txt: 'Origem comercial não configurada.', tom: 't-at' }
            : null;

  const tituloTeste = ea?.pendente_recente
    ? 'Já existe um teste aguardando ACK. Aguarde o resultado (até 5 min) para não duplicar.'
    : ea?.estado === 'pausado'
      ? 'Canal pausado por falhas recentes — o teste manual roda mesmo assim.'
      : 'Envia agora um teste técnico ao número interno e aguarda o ACK real';

  return (
    <div className="vidro spot sobe int-card" style={{ animationDelay: `${atraso}s` }}>
      <div className="int-l1">
        <div className="int-ic"><IcWa /></div>
        <div className="tx">
          <div className="int-n">
            <NomeEditavel nome={c.alias} podeEditar={podeConfig} aoSalvar={aoRenomear} />
            <span className="intg-transp">Evolution · QR</span>
          </div>
          <div className="int-s num">{c.numero ? mascararNumero(c.numero) : 'Número não identificado'}</div>
        </div>
        <BadgeStatus tom={st.tom}>{st.t}</BadgeStatus>
      </div>

      <div className="intg-chips">
        <span className={`intg-chip t-${chipSessao.tom === 'ok' ? 'ok' : chipSessao.tom === 'atencao' ? 'at' : chipSessao.tom === 'erro' ? 'er' : 'ne'}`} title={chipSessao.title}>
          <i />Sessão: {chipSessao.txt}
        </span>
        <span className={`intg-chip t-${chipEntrega.tom === 'ok' ? 'ok' : chipEntrega.tom === 'atencao' ? 'at' : chipEntrega.tom === 'erro' ? 'er' : 'ne'}`} title={chipEntrega.title}>
          Entrega: {chipEntrega.txt}
        </span>
        {chipAuto && (
          <span className={`intg-chip num t-${chipAuto.tom === 'ok' ? 'ok' : chipAuto.tom === 'atencao' ? 'at' : chipAuto.tom === 'erro' ? 'er' : 'ne'}`} title={chipAuto.title}>
            Auto: {chipAuto.txt}
          </span>
        )}
      </div>

      {alerta && <div className={`intg-alerta ${alerta.tom}`}>{alerta.txt}</div>}

      <div className="int-l2">
        <div className="intg-acoes" style={{ justifyContent: 'flex-start', flex: 1 }}>
          <BotaoMini onClick={aoDiagnostico}>Ver diagnóstico</BotaoMini>
          {ea?.apto && podeConfig && (
            <BotaoMini disabled={testando || ea.pendente_recente} title={tituloTeste} onClick={aoTeste}>
              {testando ? 'Testando…' : ea.pendente_recente ? 'Aguardando ACK…' : 'Rodar teste agora'}
            </BotaoMini>
          )}
          {podeConfig && <BotaoMini onClick={aoConfig}>Configurar origem comercial</BotaoMini>}
        </div>
        <div className="intg-acoes">
          {podeConfig && !ehAtivo && !c.conflitoCom && (
            <BotaoMini title="Reconectar reutiliza este canal (não consome uma nova vaga)." onClick={aoReconectar}>Reconectar</BotaoMini>
          )}
          {podeConfig && ehAtivo && (
            <button type="button" className="p-btn btn-perigo btn-mini" onClick={aoDesconectar}>Desconectar</button>
          )}
          {podeConfig && (
            <button
              type="button" className="p-btn btn-perigo btn-mini"
              title="Remove da lista sem apagar o histórico (conversas, mensagens e relatórios são preservados)."
              onClick={aoRemover}
            >
              Remover
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ================================================================
   Conectar / Reconectar WhatsApp — stages form|qr|connected.
   Demo: QR xadrez + conexão simulada em ~9s (nenhuma sessão real).
   Real: waCreateInstance/waReconnect + waQr (renova 60s) + waStatus
   (poll 3s); cancelar durante o QR remove a instância (libera vaga).
   ================================================================ */
function ConectarWaModal({ orgId, demo, reconnectCanalId, reconnectAlias, aoFechar, aoConectado, aoCancelado }: {
  orgId: string; demo: boolean; reconnectCanalId?: string; reconnectAlias?: string;
  aoFechar: () => void; aoConectado: (alias: string, numero: string | null) => void; aoCancelado: () => void;
}) {
  const [stage, setStage] = useState<'form' | 'qr' | 'connected'>('form');
  const [alias, setAlias] = useState('');
  const [fonte, setFonte] = useState('trafego_1');
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [secs, setSecs] = useState(60);
  const secsRef = useRef(60);
  const [numero, setNumero] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const canalRef = useRef<string | null>(null);
  const connectedRef = useRef(false);
  const canceladoRef = useRef(false);
  const demoT0 = useRef(0);

  const defSecs = (s: number) => { secsRef.current = s; setSecs(s); };

  const start = async () => {
    if (!reconnectCanalId && !alias.trim()) { setErro('Informe o alias do canal.'); return; }
    setErro(null);
    setBusy(true);
    try {
      if (demo) {
        await new Promise((r) => setTimeout(r, 500));
        canalRef.current = 'demo';
        setQr(qrDemo());
        defSecs(60);
        demoT0.current = Date.now();
        setStage('qr');
        return;
      }
      const r = reconnectCanalId ? await waReconnect(orgId, reconnectCanalId) : await waCreateInstance(orgId, alias.trim(), fonte);
      canalRef.current = r.canal_id;
      setQr(r.qr_base64 ? `data:image/png;base64,${r.qr_base64.replace(/^data:image\/\w+;base64,/, '')}` : null);
      defSecs(r.expires_in || 60);
      setStage('qr');
      if (!r.qr_base64) refreshQr(r.canal_id);
    } catch (e) {
      setErro(msgOu(e, 'Falha ao iniciar a conexão.'));
    } finally { setBusy(false); }
  };

  const refreshQr = async (canalId?: string) => {
    const id = canalId ?? canalRef.current;
    if (demo) { setQr(qrDemo()); defSecs(60); return; }
    if (!id) return;
    try {
      const r = await waQr(orgId, id);
      // sem QR na resposta volta ao placeholder (v1) — nunca manter código expirado na tela
      setQr(r.qr_base64 ? `data:image/png;base64,${r.qr_base64.replace(/^data:image\/\w+;base64,/, '')}` : null);
      defSecs(r.expires_in || 60);
    } catch { /* mantém o QR atual; o timer tenta de novo */ }
  };

  // reconexão dispara o start automaticamente (v1); ref evita a dupla chamada do StrictMode
  const startRef = useRef(start);
  startRef.current = start;
  const autoStartRef = useRef(false);
  useEffect(() => {
    if (reconnectCanalId && !autoStartRef.current) {
      autoStartRef.current = true;
      startRef.current();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reconnectCanalId]);

  // contagem do QR (renova ao expirar) — decisão fora do updater (que precisa ser puro)
  useEffect(() => {
    if (stage !== 'qr') return;
    const t = window.setInterval(() => {
      const s = secsRef.current - 1;
      if (s <= 0) { defSecs(60); refreshQr(); } else defSecs(s);
    }, 1000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  // polling de status 3s (demo: conecta sozinho após ~9s)
  useEffect(() => {
    if (stage !== 'qr') return;
    const t = window.setInterval(async () => {
      if (connectedRef.current || canceladoRef.current) return;
      if (demo) {
        if (Date.now() - demoT0.current >= 9_000) {
          connectedRef.current = true;
          const n = reconnectCanalId ? null : '5551988880000';
          setNumero(n);
          setStage('connected');
          aoConectado(alias.trim() || 'WhatsApp', n);
        }
        return;
      }
      const id = canalRef.current;
      if (!id) return;
      try {
        const r = await waStatus(orgId, id);
        // cancelamento pode ter acontecido com o waStatus em voo
        if (canceladoRef.current) return;
        if (r.connected) {
          connectedRef.current = true;
          setNumero(r.numero ?? null);
          setStage('connected');
          aoConectado(alias.trim() || 'WhatsApp', r.numero ?? null);
        }
      } catch { /* segue tentando */ }
    }, 3000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, demo]);

  const cancelar = async () => {
    // cancelou no meio do QR sem conectar: remove a instância (libera a vaga) e atualiza a lista — v1
    canceladoRef.current = true;
    if (!demo && stage === 'qr' && canalRef.current && !connectedRef.current) {
      try { await waRemove(orgId, canalRef.current); aoCancelado(); } catch { /* melhor esforço */ }
    }
    aoFechar();
  };

  return (
    <ModalV2
      aberto
      aoFechar={cancelar}
      largura={460}
      titulo={stage === 'connected' ? 'WhatsApp conectado' : reconnectCanalId ? 'Reconectar WhatsApp' : 'Conectar WhatsApp'}
      rodape={
        stage === 'connected' ? (
          <BotaoPrimario style={{ flex: 1 }} onClick={aoFechar}>Concluir</BotaoPrimario>
        ) : stage === 'qr' ? (
          <>
            <BotaoSec onClick={cancelar}>Cancelar</BotaoSec>
            <BotaoSec onClick={() => refreshQr()}>Gerar novo QR</BotaoSec>
          </>
        ) : (
          <>
            <BotaoSec onClick={cancelar}>Cancelar</BotaoSec>
            {reconnectCanalId ? (
              <BotaoPrimario disabled>{busy ? 'Gerando QR…' : 'Reconectando…'}</BotaoPrimario>
            ) : (
              <BotaoPrimario disabled={busy} onClick={start}>{busy ? 'Criando instância…' : 'Conectar WhatsApp'}</BotaoPrimario>
            )}
          </>
        )
      }
    >
      {erro && <div className="aviso-inline erro" role="alert" style={{ marginBottom: 10 }}>{erro}</div>}

      {stage === 'form' && (
        reconnectCanalId ? (
          <p className="intg-lead">
            Reconectando {reconnectAlias || 'a conexão'}… gerando o QR Code. O histórico (conversas, contatos e
            relatórios) é preservado no mesmo canal.
          </p>
        ) : (
          <>
            <p className="intg-lead">Conecte um número lendo o QR Code pelo aplicativo do WhatsApp. Nenhuma senha é digitada aqui.</p>
            <div className="form-grid" style={{ marginTop: 12 }}>
              <div className="campo">
                <label>Alias do canal</label>
                <input className="inp" value={alias} maxLength={40} placeholder="Ex.: Chip 1" onChange={(e) => setAlias(e.target.value)} />
              </div>
              <div className="campo">
                <label>Fonte de aquisição</label>
                <select className="inp" value={fonte} onChange={(e) => setFonte(e.target.value)}>
                  {Object.entries(FONTES).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
                </select>
              </div>
            </div>
          </>
        )
      )}

      {stage === 'qr' && (
        <>
          <p className="intg-lead">
            Abra o WhatsApp → <b>Aparelhos conectados</b> → <b>Conectar um aparelho</b> e aponte para o código.
          </p>
          <div className="intg-qr-box">
            {qr ? <img src={qr} alt="QR Code do WhatsApp" /> : <span className="ger">Gerando QR Code…</span>}
          </div>
          <div className="intg-qr-info num">
            {secs > 0 ? <>Expira em <b>{secs}s</b> · renova automaticamente</> : 'Gerando novo QR Code…'}
          </div>
          <div className="intg-qr-aguarda"><i />Aguardando leitura…</div>
        </>
      )}

      {stage === 'connected' && (
        <div className="intg-conectado">
          <div className="circ"><IcCheck /></div>
          <h4>Conectado com sucesso</h4>
          <p className="intg-lead">
            {numero ? <>Número <b>{numero}</b> conectado.</> : 'Número conectado.'}
            {' '}Ele já aparece em <b>Configurações → Canais</b>.
          </p>
        </div>
      )}
    </ModalV2>
  );
}

/* ================================================================
   Diagnóstico do canal (somente leitura) — pares da v1 + bloco de
   entrega automática + últimos envios a clientes.
   ================================================================ */
function DiagnosticoModalV2({ h, canal, podeAgir, atualizando, entregaAuto, proximoMin, aoFechar, aoAtualizar, aoReconectar, aoDesconectar }: {
  h: WaHealthCanal; canal: WaCanal | null; podeAgir: boolean; atualizando: boolean;
  entregaAuto: EntregaAutoResumo | null; proximoMin: number | null;
  aoFechar: () => void; aoAtualizar: () => void; aoReconectar: () => void; aoDesconectar: () => void;
}) {
  const stOK = (s: string) => ['SERVER_ACK', 'DELIVERY_ACK', 'READ', 'PLAYED'].includes(s);
  const ativo = h.statusIntegracao === 'conectado' || h.statusIntegracao === 'sincronizando';
  const ea = entregaAuto?.apto ? entregaAuto : null;

  const Par = ({ dt, dd }: { dt: string; dd: ReactNode }) => (
    <div className="par"><dt>{dt}</dt><dd className="num">{dd}</dd></div>
  );

  return (
    <ModalV2
      aberto
      aoFechar={aoFechar}
      largura={620}
      titulo={<span>Diagnóstico · <strong>{h.nome}</strong> <BadgeStatus tom={COR_TOM[h.cor] ?? 'neutro'}>{ESTADO_LABEL[h.estado] ?? h.estado}</BadgeStatus></span>}
      rodape={
        <>
          <BotaoSec disabled={atualizando} onClick={aoAtualizar}>{atualizando ? 'Atualizando…' : 'Atualizar diagnóstico'}</BotaoSec>
          {podeAgir && !ativo && <BotaoPrimario onClick={aoReconectar}>Reconectar</BotaoPrimario>}
          {podeAgir && ativo && <button type="button" className="p-btn btn-perigo" onClick={aoDesconectar}>Desconectar</button>}
          <BotaoSec onClick={aoFechar}>Fechar</BotaoSec>
        </>
      }
    >
      <p className="intg-lead" style={{ marginBottom: 12 }}>{h.recomendacao}</p>
      <dl className="diag-grid">
        <Par dt="Estado da sessão" dd={h.evoState ?? h.statusIntegracao} />
        <Par dt="Recebimento" dd={h.recebimento} />
        <Par dt="Envio" dd={`${h.envio}${h.taxa !== null ? ` · ${h.entregues}/${h.enviados} (${h.taxa}%)` : ''}`} />
        <Par dt="Erros consecutivos" dd={h.consecErros} />
        <Par dt="Instância" dd={<span style={{ fontSize: 11 }}>{h.instancia ?? '—'}</span>} />
        <Par dt="Número" dd={h.numeroMasc} />
        <Par dt="Último recebido" dd={haQuanto(h.lastInbound)} />
        <Par dt="Último entregue" dd={haQuanto(h.lastDelivered)} />
        <Par dt="Webhook" dd={`${h.webhookOk === null ? '—' : h.webhookOk ? 'ativo' : 'inativo'} · ${h.lastWebhookEvent ?? '—'} (${haQuanto(h.lastWebhook)})`} />
        <Par dt="Evolution" dd={h.versao ?? '—'} />
        <Par dt="Origem comercial" dd={tipoOrigemLabel(canal?.origemTipo) ?? 'não configurada'} />
        <Par dt="Gestor" dd={canal?.gestorNome ?? '—'} />
      </dl>
      {h.lastErrorMsg && <div className="diag-err">Último erro técnico: {h.lastErrorMsg}</div>}

      {ea && (
        <>
          <div className="diag-sec">Entrega automática <BadgeStatus tom={SAUDE_TOM[ea.saude] ?? 'neutro'}>{SAUDE_LABEL[ea.saude] ?? ea.saude}</BadgeStatus></div>
          <dl className="diag-grid">
            <Par dt="Destino" dd={ea.destino} />
            <Par dt="Frequência" dd={`${ea.frequencia_hora}/h (a cada 12 min)`} />
            <Par dt="Última hora" dd={`${ea.entregues_1h}/${ea.total_1h || 0} entregues · ${ea.falhas_1h} falhas`} />
            <Par dt="Últimos 5 testes" dd={`${ea.entregues_5} entregues · ${ea.erros_5} erro · ${ea.timeouts_5} timeout`} />
            <Par dt="Último teste" dd={ea.ultimo_em ? `${RESULTADO_LABEL[ea.ultimo_resultado ?? ''] ?? ea.ultimo_resultado} ${haQuanto(ea.ultimo_em)}` : '—'} />
            <Par dt="Latência do ACK" dd={ea.ultimo_latencia_ms != null ? `${ea.ultimo_latencia_ms} ms` : '—'} />
            <Par dt="Próximo teste" dd={ea.estado === 'pausado' ? '—' : proximoMin != null ? `em ${proximoMin} min` : '—'} />
            {ea.estado === 'pausado' && ea.pausado_ate && <Par dt="Pausado até" dd={hhmm(ea.pausado_ate)} />}
          </dl>
          <p className="diag-nota">
            {ea.saude === 'restrito'
              ? 'O canal aceita o envio mas o WhatsApp responde ERROR — recusa real de entrega. Normalmente é restrição do número para envio via API: use outro canal para automação.'
              : ea.timeouts_5 >= 2
                ? 'Os testes estão sendo aceitos mas o ACK final não chega (timeout). Isso indica sessão/rota instável — não é o mesmo que o WhatsApp recusar a entrega.'
                : ea.saude === 'sem_dados'
                  ? 'Nenhum teste concluído ainda. O primeiro roda automaticamente na próxima janela.'
                  : 'Teste técnico ao número interno da equipe (nunca cliente). Não cria lead nem conversa.'}
          </p>
        </>
      )}

      <div className="diag-sec">Últimos {h.last10.length} envios a clientes <span className="obs">(mensagens reais — não são os testes)</span></div>
      {h.last10.length === 0 ? (
        <p className="diag-nota" style={{ marginTop: 0 }}>Sem envios recentes.</p>
      ) : (
        <div className="diag-l10">
          {h.last10.map((x, i) => (
            <div className="row num" key={i}>
              <span className="h">{horaCurta(x.hora)}</span>
              <span className="st" style={{ color: stOK(x.status) ? 'var(--verde)' : x.status === 'ERROR' ? 'var(--rubro)' : 'var(--txt-3)' }}>{x.status}</span>
              <span className="d">•••{x.destino}</span>
              {x.erro && <span className="e" title={x.erro}>{x.erro}</span>}
            </div>
          ))}
        </div>
      )}
      <p className="diag-nota">
        Para validar o envio, envie uma mensagem real pela conversa (fluxo da aplicação) e atualize o diagnóstico —
        o resultado real aparece aqui. Este painel é somente leitura.
      </p>
    </ModalV2>
  );
}

/* ================================================================
   Origem comercial da conexão — campos da v1; salva via RPC
   (autorização admin/supervisor no banco). Demo: grava no seed.
   ================================================================ */
function ConfigOrigemModalV2({ canal, demo, aoFechar, aoSalvo }: {
  canal: WaCanal; demo: boolean; aoFechar: () => void; aoSalvo: (dados: ComercialInput) => void;
}) {
  const usuariosQ = useOrgUsuarios();
  const fontesQ = useFontesAquisicao();
  const [form, setForm] = useState<ComercialInput>({
    nome_interno: canal.alias === 'WhatsApp' ? '' : canal.alias,
    origem_tipo: canal.origemTipo, gestor_id: canal.gestorId, fonte_aquisicao_id: canal.fonteId,
    campanha: canal.campanha, observacao_comercial: canal.observacaoComercial,
  });
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const set = (k: keyof ComercialInput, v: string) => setForm((f) => ({ ...f, [k]: v || null }));

  const salvar = async () => {
    setBusy(true);
    setErro(null);
    try {
      const dados = { ...form, nome_interno: form.nome_interno?.trim() || 'WhatsApp' };
      if (!demo) await waUpdateComercial(canal.id, dados);
      aoSalvo(dados);
    } catch (e) {
      setErro(msgOu(e, 'Falha ao salvar.'));
      setBusy(false);
    }
  };

  return (
    <ModalV2
      aberto
      aoFechar={() => { if (!busy) aoFechar(); }}
      fecharNoVeu={!busy}
      largura={560}
      titulo={<span>Configurar origem comercial <span style={{ fontWeight: 400, color: 'var(--txt-2)', fontSize: 12 }}>· {canal.numero ? mascararNumero(canal.numero) : 'Conexão de WhatsApp'}</span></span>}
      rodape={
        <>
          <BotaoSec disabled={busy} onClick={aoFechar}>Cancelar</BotaoSec>
          <BotaoPrimario disabled={busy} onClick={salvar}>{busy ? 'Salvando…' : 'Salvar configuração'}</BotaoPrimario>
        </>
      }
    >
      {erro && <div className="aviso-inline erro" role="alert" style={{ marginBottom: 10 }}>{erro}</div>}
      <div className="form-grid">
        <div className="campo">
          <label>Nome interno da conexão</label>
          <input className="inp" value={form.nome_interno} placeholder="Ex.: Chip 1 — Tráfego Matheus" onChange={(e) => setForm((f) => ({ ...f, nome_interno: e.target.value }))} />
        </div>
        <div className="form-2col">
          <div className="campo">
            <label>Tipo de origem</label>
            <select className="inp" value={form.origem_tipo ?? ''} onChange={(e) => set('origem_tipo', e.target.value)}>
              <option value="">Não definido</option>
              {Object.entries(ORIGEM_TIPOS).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
            </select>
          </div>
          <div className="campo">
            <label>Gestor responsável</label>
            <select className="inp" value={form.gestor_id ?? ''} onChange={(e) => set('gestor_id', e.target.value)}>
              <option value="">Não atribuído</option>
              {(usuariosQ.data ?? []).map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
          </div>
        </div>
        <div className="form-2col">
          <div className="campo">
            <label>Fonte de aquisição</label>
            <select className="inp" value={form.fonte_aquisicao_id ?? ''} onChange={(e) => set('fonte_aquisicao_id', e.target.value)}>
              <option value="">Não definida</option>
              {(fontesQ.data ?? []).map((ft) => <option key={ft.id} value={ft.id}>{ft.nome}</option>)}
            </select>
          </div>
          <div className="campo">
            <label>Campanha</label>
            <input className="inp" value={form.campanha ?? ''} placeholder="Opcional" onChange={(e) => set('campanha', e.target.value)} />
          </div>
        </div>
        <div className="campo">
          <label>Observação comercial</label>
          <textarea className="inp" rows={2} value={form.observacao_comercial ?? ''} onChange={(e) => set('observacao_comercial', e.target.value)} />
        </div>
      </div>
    </ModalV2>
  );
}
