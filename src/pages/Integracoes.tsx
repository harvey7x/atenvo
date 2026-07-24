import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/useToast';
import { useOrg } from '@/context/OrgContext';
import { isSupabaseConfigured } from '@/lib/supabase';
import { WhatsAppConnect } from '@/components/WhatsAppConnect';
import { useWaCanais, useWaLimite, useWaHealth, waRemove, waOcultar, mascararNumero, useFontesAquisicao, waUpdateComercial, useEntregaAutoResumo, useRodarTesteEntrega, type WaCanal, type ComercialInput, type WaHealthCanal, type EntregaAutoResumo } from '@/data/whatsapp';
import { FB_REAL, useFbStatus, fbAuthStart, fbPages, fbConnect, fbDisconnect } from '@/data/facebook';
import { useOrgUsuarios } from '@/data/atendimento';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Modal } from '@/components/Modal';
import { IntegracaoCloudApi } from '@/components/IntegracaoCloudApi';
import {
  MATURACAO_REAL, usePainelMaturacao, useCriarChip, useAtualizarChip, useExcluirChip,
  useQrChip, useStatusChip, formatarNumero,
  useProxyChip, useDefinirProxy, useRemoverProxy, useAplicarProxy, PROXY_PROTOCOLOS,
  STATUS_MATURACAO_LABEL, STATUS_INTEGRACAO_LABEL, SCORE_CLASSE_LABEL,
  type ChipPainel, type StatusIntegracao, type StatusMaturacao, type ProxyProtocolo,
} from '@/data/maturacao';
import './Integracoes.css';

const ORIGEM_TIPOS = [
  { id: 'trafego', r: 'Tráfego' }, { id: 'ura', r: 'URA' }, { id: 'organico', r: 'Orgânico' },
  { id: 'indicacao', r: 'Indicação' }, { id: 'campanha', r: 'Campanha' }, { id: 'parceiro', r: 'Parceiro' }, { id: 'outro', r: 'Outro' },
];
const tipoOrigemLabel = (t: string | null) => ORIGEM_TIPOS.find((x) => x.id === t)?.r || null;

// Saúde: rótulo e cor do estado derivado (badge principal reflete a saúde REAL, não só "Conectado").
const ESTADO_LABEL: Record<string, string> = {
  saudavel: 'Saudável', enviando_sem_receber: 'Enviando · sem recebimento', instavel: 'Instável',
  sem_dados: 'Sem dados suficientes', reconectando: 'Reconectando', possivel_restricao: 'Problema no envio',
  falha_total: 'Falha no envio', desconectado: 'Desconectado',
};
const COR_BG: Record<string, string> = { verde: 'var(--ok-soft)', amarelo: 'var(--warn-soft)', laranja: '#fbe6d2', vermelho: 'var(--err-soft)' };

/* ---- Entrega automática: rótulos/cores por saúde (5 testes/h ao número interno) ---- */
const SAUDE_LABEL: Record<string, string> = {
  saudavel: 'saudável', atencao: 'atenção', instavel: 'instável', restrito: 'restrita',
  sem_dados: 'aguardando 1º teste', inativo: 'inativa',
};
const SAUDE_COR: Record<string, string> = {
  saudavel: 'var(--ok)', atencao: 'var(--warn)', instavel: 'var(--warn)',
  restrito: 'var(--err, #b23f38)', sem_dados: 'var(--muted)', inativo: 'var(--muted)',
};
const SAUDE_BG: Record<string, string> = {
  saudavel: 'var(--ok-soft)', atencao: 'var(--warn-soft)', instavel: 'var(--warn-soft)',
  restrito: 'var(--err-soft)', sem_dados: 'var(--surface-2)', inativo: 'var(--surface-2)',
};
/** Nunca mostrar ACK cru (PENDING/SERVER_ACK) no painel. */
const RESULTADO_LABEL: Record<string, string> = {
  entregue: 'Entregue', lida: 'Lida', ERROR: 'Erro', timeout: 'Timeout', aguardando_ack: 'Aguardando ACK',
  SERVER_ACK: 'Aceito pelo servidor', PENDING: 'Aguardando ACK',
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
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const COR_FG: Record<string, string> = { verde: 'var(--ok)', amarelo: 'var(--warn)', laranja: '#c2630c', vermelho: 'var(--err)' };
const horaCurta = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
const haQuanto = (iso?: string | null) => {
  if (!iso) return '—';
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'agora'; if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60); if (h < 24) return `há ${h} h`; return `há ${Math.round(h / 24)} d`;
};

const IcWa = () => <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a9.9 9.9 0 0 0-8.5 15l-1.3 4.8 4.9-1.3A9.9 9.9 0 1 0 12 2z" /></svg>;
const IcFb = () => <svg viewBox="0 0 24 24" fill="currentColor"><path d="M22 12a10 10 0 1 0-11.6 9.9v-7H8v-2.9h2.4V9.8c0-2.4 1.4-3.7 3.6-3.7 1 0 2.1.2 2.1.2v2.3h-1.2c-1.2 0-1.5.7-1.5 1.4V12H16l-.4 2.9h-2.2v7A10 10 0 0 0 22 12z" /></svg>;
const IcPlus = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>;
const IcInfo = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 16v-4M12 8h.01" /></svg>;
const IcCheck = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>;
const IcRefresh = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5" /></svg>;

const WA_ST: Record<string, { t: string; cls: string; dot?: boolean }> = {
  conectado: { t: 'Conectado', cls: 'ok', dot: true },
  sincronizando: { t: 'Sincronizando', cls: 'warn' },
  desconectado: { t: 'Desconectado', cls: 'neutral' },
  atencao: { t: 'Atenção', cls: 'warn' },
  erro: { t: 'Erro', cls: 'err' },
};

/* ---- Maturação (pool de aquecimento) — nada aqui toca atendimento ---- */
const IcQr = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.4" /><rect x="14" y="3" width="7" height="7" rx="1.4" /><rect x="3" y="14" width="7" height="7" rx="1.4" /><path d="M14 14h3v3M21 14v7h-7v-3" /></svg>;
const IcSeed = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21c0-6 3-10 8-11 0 6-3 10-8 11z" /><path d="M12 21C7 20 4 16 4 10c5 1 8 5 8 11z" /></svg>;
const IcProxy = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.6 2.5 15.4 0 18M12 3C9.5 5.6 9.5 18.4 12 21" /></svg>;

const MAT_CONN: Record<StatusIntegracao, { t: string; cls: string; dot?: boolean }> = {
  conectado: { t: 'Conectado', cls: 'ok', dot: true },
  sincronizando: { t: 'Sincronizando', cls: 'warn' },
  desconectado: { t: 'Não conectado', cls: 'neutral' },
  erro: { t: 'Erro', cls: 'err' },
};
const MAT_ST_COR: Record<StatusMaturacao, { bg: string; fg: string }> = {
  novo: { bg: 'var(--surface-2)', fg: 'var(--muted)' },
  aquecendo: { bg: 'var(--purple-soft)', fg: 'var(--purple)' },
  pausado: { bg: 'var(--warn-soft)', fg: 'var(--warn)' },
  maduro: { bg: 'var(--ok-soft)', fg: 'var(--ok)' },
  banido: { bg: 'var(--err-soft)', fg: 'var(--err)' },
  erro: { bg: 'var(--err-soft)', fg: 'var(--err)' },
};
const OPERADORAS = ['Vivo', 'Claro', 'TIM', 'Oi', 'Outra'];
const msgErro = (e: unknown) => (e as Error)?.message || 'Falha na operação.';

const FB_MOTIVO: Record<string, string> = {
  login: 'Login do Facebook cancelado ou negado.',
  state: 'Sessão de conexão inválida ou expirada. Tente novamente.',
  config: 'Configuração da Meta ausente no servidor.',
  vault: 'Falha ao guardar a credencial com segurança.',
  sessao: 'Não foi possível iniciar a seleção de Página.',
  meta: 'A Meta recusou a autorização. Verifique permissões do app.',
};

export function Integracoes() {
  const { toast } = useToast();
  const { currentOrg } = useOrg();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const waCanais = useWaCanais();
  const waLimite = useWaLimite();
  const fbStatus = useFbStatus();
  const [waOpen, setWaOpen] = useState(false);
  const [fbBusy, setFbBusy] = useState(false);
  const [fbSel, setFbSel] = useState<{ id: string; nome: string }[] | null>(null);
  const [fbCode, setFbCode] = useState<string | null>(null);
  // modo: 'desconectar' encerra a sessão (preserva canal); 'ocultar' remove da lista (status 'removido').
  const [remocao, setRemocao] = useState<{ tipo: 'whatsapp' | 'facebook'; id: string; nome: string; modo?: 'desconectar' | 'ocultar' } | null>(null);
  const [remLoading, setRemLoading] = useState(false);
  const [config, setConfig] = useState<WaCanal | null>(null);
  const [waFiltro, setWaFiltro] = useState<'ativos' | 'desconectados' | 'todos'>('ativos');
  const [reconectar, setReconectar] = useState<{ id: string; alias: string } | null>(null);
  const healthQ = useWaHealth();
  const entregaQ = useEntregaAutoResumo();                       // painel de entrega automática (5/h por canal)
  const rodarTeste = useRodarTesteEntrega();
  const [testando, setTestando] = useState<string | null>(null);
  const [diag, setDiag] = useState<string | null>(null); // canalId em diagnóstico
  const podeConfig = currentOrg.role === 'admin' || currentOrg.role === 'gestor';
  // Maturação é SÓ admin: as RPCs usam _eh_admin_org e o maturacao-manage exige papel 'admin'.
  // Usar podeConfig aqui mostraria os botões ao gestor e ele tomaria "sem acesso" ao clicar.
  const podeMaturacao = currentOrg.role === 'admin';

  /* ---- Maturação: pool de aquecimento, isolado do atendimento ---- */
  const matPainel = usePainelMaturacao();
  const matExcluirChip = useExcluirChip();
  const [matNovo, setMatNovo] = useState(false);
  const [matQr, setMatQr] = useState<{ id: string; apelido: string; perfilOk: boolean } | null>(null);
  const [matExcluir, setMatExcluir] = useState<ChipPainel | null>(null);
  const [matProxy, setMatProxy] = useState<ChipPainel | null>(null);
  const matChips = matPainel.data ?? [];
  const matConectados = matChips.filter((c) => c.status_integracao === 'conectado').length;

  function matRefresh() { qc.invalidateQueries({ queryKey: ['mat-painel', currentOrg.id] }); }

  async function matConfirmarExclusao() {
    if (!matExcluir) return;
    try {
      await matExcluirChip.mutateAsync(matExcluir.chip_id);
      toast('Número removido da maturação. A sessão de aquecimento foi derrubada.');
      setMatExcluir(null);
    } catch (e) { toast(msgErro(e), 'warn'); }
  }

  async function confirmarRemocao() {
    if (!remocao) return;
    setRemLoading(true);
    try {
      if (remocao.tipo === 'whatsapp') {
        if (remocao.modo === 'ocultar') await waOcultar(currentOrg.id, remocao.id);
        else await waRemove(currentOrg.id, remocao.id);
      } else await fbDisconnect(remocao.id);
      toast(remocao.modo === 'ocultar' ? 'Conexão removida da lista. Histórico preservado.'
        : remocao.tipo === 'whatsapp' ? 'WhatsApp desconectado. Histórico preservado.' : 'Conexão removida.');
      refresh(); setRemocao(null);
    } catch (e) {
      // Falha parcial: não fingir sucesso — mantém o item, registra o erro técnico e avisa o usuário.
      console.error('[integracoes] falha ao remover conexão', remocao, e);
      toast((e as Error).message || 'Falha ao remover a conexão. Tente novamente.', 'warn');
    }
    finally { setRemLoading(false); }
  }

  // Esta seção é a do QR Code (Evolution). Canal da API oficial tem seção própria e NÃO entra
  // aqui: ele não tem sessão, não desconecta e não reconecta — mostrá-lo com "Sessão: Desconectado"
  // e um botão "Reconectar" seria oferecer uma ação que não existe.
  // Só a LISTA é filtrada: nas contagens de limite o número oficial continua consumindo vaga,
  // porque no banco ele consome mesmo (trigger checa_limite_canais conta por tipo='whatsapp').
  const canaisTodos = waCanais.data ?? [];
  const canais = canaisTodos.filter((c) => c.transporte !== 'cloud_api');
  const conectados = canaisTodos.filter((c) => c.status === 'conectado').length;
  // Ativos = conectado/sincronizando; o resto (desconectado/erro/atenção) é histórico preservado.
  const ehAtivo = (s: string) => s === 'conectado' || s === 'sincronizando';
  const canaisVis = canais.filter((c) => waFiltro === 'todos' ? true : waFiltro === 'ativos' ? ehAtivo(c.status) : !ehAtivo(c.status));
  const nDesconectados = canais.filter((c) => !ehAtivo(c.status)).length;
  const healthMap = new Map((healthQ.data?.canais ?? []).map((h) => [h.canalId, h]));
  // Limite/contagem na MESMA fonte do backend (organizacao_limites + canais ativos). Sem número fixo no frontend.
  const waUsados = waLimite.data?.usados ?? canais.length;
  const waLimiteEfetivo = waLimite.data?.limite ?? 0;
  const waIncluidos = waLimite.data?.incluidos ?? 0;
  const waAdicionais = waLimite.data?.adicionais ?? 0;
  const waCheio = waLimite.isSuccess && waUsados >= waLimiteEfetivo;
  const fbPaginas = fbStatus.data ?? [];
  const fbConectadas = fbPaginas.filter((p) => p.estado === 'conectado').length;

  // Retorno do OAuth: ?tab=facebook&fb=connect&code=... ou &fb=error&motivo=...
  useEffect(() => {
    const fb = params.get('fb');
    if (!fb) return;
    if (fb === 'error') { toast(FB_MOTIVO[params.get('motivo') || ''] || 'Falha ao conectar o Facebook.', 'warn'); limparParams(); return; }
    if (fb === 'connect') {
      const code = params.get('code');
      if (code) {
        setFbBusy(true);
        fbPages(code)
          .then((r) => { setFbCode(code); setFbSel(r.paginas); if (!r.paginas.length) toast('Nenhuma Página disponível nesta conta.', 'warn'); })
          .catch((e) => toast((e as Error).message || 'Sessão inválida.', 'warn'))
          .finally(() => { setFbBusy(false); limparParams(); });
      } else limparParams();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function limparParams() {
    const p = new URLSearchParams(params); p.delete('fb'); p.delete('code'); p.delete('motivo');
    setParams(p, { replace: true });
  }
  function refresh() {
    qc.invalidateQueries({ queryKey: ['wa-canais', currentOrg.id] });
    qc.invalidateQueries({ queryKey: ['wa-limite', currentOrg.id] });
    qc.invalidateQueries({ queryKey: ['wa-conversas', currentOrg.id] });
    qc.invalidateQueries({ queryKey: ['fb-status', currentOrg.id] });
    qc.invalidateQueries({ queryKey: ['fb-conversas', currentOrg.id] });
  }

  async function fbIniciar() {
    setFbBusy(true);
    try { const { url } = await fbAuthStart(); window.location.assign(url); }
    catch (e) {
      const msg = (e as Error).message || '';
      toast(msg.includes('forbidden') || msg.toLowerCase().includes('permiss') ? 'Sem permissão. Apenas admin/supervisor conecta o Facebook.' : (msg.includes('config') ? 'Configuração da Meta ausente no servidor.' : (msg || 'Falha ao iniciar conexão.')), 'warn');
      setFbBusy(false);
    }
  }
  async function fbEscolher(paginaId: string) {
    if (!fbCode) return;
    setFbBusy(true);
    try { const r = await fbConnect(fbCode, paginaId); toast(`Página conectada: ${r.pagina_nome}`); setFbSel(null); setFbCode(null); refresh(); }
    catch (e) {
      const msg = (e as Error).message || '';
      toast(msg.includes('outra_org') ? 'Esta Página já está vinculada a outra organização.' : (msg || 'Falha ao conectar a Página.'), 'warn');
    }
    finally { setFbBusy(false); }
  }

  const fbTokenBadge = (p: { estado: string; token_status: string | null; webhook_assinado: boolean }) => {
    if (p.estado !== 'conectado') return { t: 'Desconectado', cls: 'neutral' };
    if (p.token_status && p.token_status !== 'valido') return { t: 'Token inválido', cls: 'err' };
    if (!p.webhook_assinado) return { t: 'Webhook pendente', cls: 'warn' };
    return { t: 'Conectado', cls: 'ok', dot: true };
  };

  return (
    <div className="integracoes-page">
      <div className="content">
        <div className="sum-grid">
          <div className="sum-card"><span className="sum-ic green"><IcCheck /></span><div><div className="lbl">Integrações conectadas</div><div className="val">{conectados + fbConectadas}</div></div></div>
          <div className="sum-card"><span className="sum-ic blue"><IcWa /></span><div><div className="lbl">WhatsApp ativos</div><div className="val">{conectados} de {waUsados} contratado{waUsados === 1 ? '' : 's'}</div><div className="sub">{nDesconectados > 0 ? `${nDesconectados} desconectado${nDesconectados === 1 ? '' : 's'} · ` : ''}limite do plano {waLimiteEfetivo}{waAdicionais > 0 ? ` (${waIncluidos}+${waAdicionais})` : ''}</div></div></div>
          <div className="sum-card"><span className="sum-ic gray"><IcFb /></span><div><div className="lbl">Facebook conectados</div><div className="val">{fbConectadas}</div></div></div>
          {/* Roxo de propósito: maturação NÃO é métrica de atendimento (não entra no total acima). */}
          {podeMaturacao && (
            <div className="sum-card"><span className="sum-ic purple"><IcSeed /></span><div><div className="lbl">Em maturação (fora do atendimento)</div><div className="val">{matConectados} conectado{matConectados === 1 ? '' : 's'}</div><div className="sub">{matChips.length} número{matChips.length === 1 ? '' : 's'} no pool · não consome o limite do plano</div></div></div>
          )}
        </div>

        {/* WHATSAPP */}
        <section className="int-section">
          <div className="sec-head"><h2><svg className="si" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a9.9 9.9 0 0 0-8.5 15l-1.3 4.8 4.9-1.3A9.9 9.9 0 1 0 12 2z" /></svg>WhatsApp</h2><p>Conecte um número lendo o QR Code pelo aplicativo do WhatsApp.</p></div>
          <div className="int-grid">
            <div className="int-card">
              <div className="ic-head">
                <span className="ic-logo wa"><IcWa /></span>
                <div className="ic-ttl"><div className="t">Conector WhatsApp por QR Code <span className="badge blue">Evolution API</span></div><div className="s">Não é a Cloud API oficial da Meta — conexão por leitura de QR Code.</div></div>
              </div>
              <div className="ic-body">
                {!isSupabaseConfigured ? (
                  <div className="adapter-note"><IcInfo /><div className="tx">Disponível com o backend configurado.</div></div>
                ) : canais.length === 0 ? (
                  <div className="adapter-note"><IcInfo /><div className="tx">Nenhum número conectado ainda. Clique em <b>Conectar WhatsApp</b> para ler o QR Code.</div></div>
                ) : (
                  <>
                    <div className="conn-actions" style={{ marginBottom: 10 }}>
                      {(['ativos', 'desconectados', 'todos'] as const).map((f) => (
                        <button key={f} className={'btn-sm' + (waFiltro === f ? ' acc' : '')} onClick={() => setWaFiltro(f)}>
                          {f === 'ativos' ? 'Ativos' : f === 'desconectados' ? `Desconectados${nDesconectados ? ` (${nDesconectados})` : ''}` : 'Todos'}
                        </button>
                      ))}
                    </div>
                    {canaisVis.length === 0 ? (
                      <div className="adapter-note"><IcInfo /><div className="tx">Nenhuma conexão neste filtro.</div></div>
                    ) : (
                    <div className="conn-list">
                      {canaisVis.map((c) => {
                        const st = WA_ST[c.status] || { t: c.status, cls: 'neutral' };
                        const ativo = ehAtivo(c.status);
                        const removendo = remLoading && remocao?.tipo === 'whatsapp' && remocao?.id === c.id;
                        const h = healthMap.get(c.id);
                        const ea = entregaQ.data?.find((x) => x.canal_id === c.id);

                        // ---- Resumo em 3 chips (o detalhe fica em "Ver diagnóstico") ----
                        const chipSessao = c.conflitoCom
                          ? { txt: 'Conflito', bg: 'var(--crit-soft, #f7e3e1)', fg: 'var(--crit, #b23f38)', title: 'Número já pertence a outro canal — este não será usado.' }
                          : h
                          ? { txt: ESTADO_LABEL[h.estado] ?? h.estado, bg: COR_BG[h.cor], fg: COR_FG[h.cor], title: `Recebimento: ${h.recebimento} · Envio: ${h.envio}` }
                          : { txt: st.t, bg: 'var(--surface-2)', fg: 'var(--muted)', title: 'Estado da sessão do WhatsApp' };
                        const ENTREGA_CHIP: Record<string, { txt: string; bg: string; fg: string; title: string }> = {
                          ok: { txt: 'Ok', bg: 'var(--ok-soft)', fg: 'var(--ok)', title: 'Mensagens estão sendo entregues.' },
                          instavel: { txt: 'Instável', bg: 'var(--warn-soft, #f6ebd8)', fg: 'var(--warn)', title: 'Algumas mensagens não estão sendo entregues.' },
                          restrito: { txt: 'Restrita', bg: 'var(--err-soft)', fg: 'var(--err, #b23f38)', title: 'O WhatsApp está recusando a entrega deste canal.' },
                        };
                        const chipEntrega = ENTREGA_CHIP[c.entregaStatus ?? ''] ?? { txt: 'Aguardando', bg: 'var(--surface-2)', fg: 'var(--muted)', title: 'Ainda sem sinal de entrega.' };
                        const chipAuto = ea?.apto
                          ? {
                              txt: ea.estado === 'pausado' ? 'Pausado' : ea.total_1h > 0 ? `${ea.entregues_1h}/${ea.total_1h}` : '—',
                              bg: SAUDE_BG[ea.saude], fg: SAUDE_COR[ea.saude],
                              title: `Teste automático ${ea.frequencia_hora}/h ao ${ea.destino} — entregues na última hora`,
                            }
                          : null;
                        // ---- Um alerta curto, só quando há problema (o mais grave vence) ----
                        const alerta = c.conflitoCom
                          ? { txt: `Número já cadastrado como ${canais.find((k) => k.id === c.conflitoCom)?.alias ?? 'outro canal'}. Reconecte o existente ou remova este.`, cor: 'var(--crit, #b23f38)' }
                          : ativo && c.entregaStatus === 'restrito'
                          ? { txt: 'Envio via API falhando. Use outro canal.', cor: 'var(--err, #b23f38)' }
                          : ativo && c.entregaStatus === 'instavel'
                          ? { txt: 'Algumas mensagens não estão sendo entregues.', cor: 'var(--warn)' }
                          : ea?.apto && ea.saude === 'sem_dados'
                          ? { txt: 'Aguardando primeiro teste automático.', cor: 'var(--muted)' }
                          : !c.origemTipo && !c.gestorId
                          ? { txt: 'Origem comercial não configurada.', cor: 'var(--warn)' }
                          : null;
                        return (
                          <div className="conn-row" key={c.id}>
                            <div className="conn-info">
                              {/* Linha 1: identidade. Linha 2: no máx. 3 chips. Linha 3: um alerta curto.
                                  Todo o resto (destino, 5/h, último ACK, próximo, histórico) vive em "Ver diagnóstico". */}
                              <span className="conn-name">{c.alias}</span>
                              <span className="conn-sub">{c.numero ? mascararNumero(c.numero) : 'Número não identificado'}</span>
                              <span className="conn-chips">
                                <span className="conn-chip" style={{ background: chipSessao.bg, color: chipSessao.fg }} title={chipSessao.title}>
                                  <span className="dot" style={{ background: chipSessao.fg }} />Sessão: {chipSessao.txt}
                                </span>
                                <span className="conn-chip" style={{ background: chipEntrega.bg, color: chipEntrega.fg }} title={chipEntrega.title}>
                                  <span className="dot" style={{ background: chipEntrega.fg }} />Entrega: {chipEntrega.txt}
                                </span>
                                {chipAuto && (
                                  <span className="conn-chip" style={{ background: chipAuto.bg, color: chipAuto.fg }} title={chipAuto.title}>
                                    <span className="dot" style={{ background: chipAuto.fg }} />Auto: {chipAuto.txt}
                                  </span>
                                )}
                              </span>
                              {alerta && <span className="conn-alerta" style={{ color: alerta.cor }}>{alerta.txt}</span>}
                            </div>
                            <div className="conn-actions">
                              <button className="btn-sm" onClick={() => setDiag(c.id)}>Ver diagnóstico</button>
                              {ea && ea.apto && podeConfig && (
                                <button className="btn-sm" disabled={testando === c.id || ea.pendente_recente}
                                  title={ea.pendente_recente
                                    ? 'Já existe um teste aguardando ACK. Aguarde o resultado (até 5 min) para não duplicar.'
                                    : ea.estado === 'pausado'
                                    ? 'Canal pausado por falhas recentes — o teste manual roda mesmo assim.'
                                    : 'Envia agora um teste técnico ao número interno e aguarda o ACK real'}
                                  onClick={async () => {
                                    setTestando(c.id);
                                    try {
                                      const r = await rodarTeste.mutateAsync(c.id) as { resultados?: { pulado?: string }[] };
                                      const pulado = r?.resultados?.[0]?.pulado;
                                      if (pulado === 'ja_aguardando_ack') toast('Já há um teste aguardando ACK. Aguarde o resultado.', 'warn');
                                      else if (pulado) toast(`Teste não enviado (${pulado}).`, 'warn');
                                      else toast('Teste enviado. O resultado aparece quando o ACK chegar.');
                                    } catch { toast('Não foi possível rodar o teste agora.', 'warn'); }
                                    finally { setTestando(null); }
                                  }}>
                                  {testando === c.id ? 'Testando…' : ea.pendente_recente ? 'Aguardando ACK…' : 'Rodar teste agora'}
                                </button>
                              )}
                              {podeConfig && <button className="btn-sm" disabled={removendo} onClick={() => setConfig(c)}>Configurar origem comercial</button>}
                              {podeConfig && !ativo && !c.conflitoCom && <button className="btn-sm acc" disabled={removendo} title="Reconectar reutiliza este canal (não consome uma nova vaga)." onClick={() => setReconectar({ id: c.id, alias: c.alias })}>Reconectar</button>}
                              {podeConfig && ativo && <button className="btn-sm danger" disabled={removendo} onClick={() => setRemocao({ tipo: 'whatsapp', id: c.id, nome: c.alias + (c.numero ? ' · ' + mascararNumero(c.numero) : ''), modo: 'desconectar' })}>{removendo ? 'Desconectando…' : 'Desconectar'}</button>}
                              {podeConfig && <button className="btn-sm danger" disabled={removendo} title="Remove da lista sem apagar o histórico (conversas, mensagens e relatórios são preservados)." onClick={() => setRemocao({ tipo: 'whatsapp', id: c.id, nome: c.alias + (c.numero ? ' · ' + mascararNumero(c.numero) : ''), modo: 'ocultar' })}>Remover</button>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    )}
                  </>
                )}
              </div>
              <div className="ic-foot">
                {!isSupabaseConfigured
                  ? <button className="btn-sm" onClick={() => toast('Disponível com o backend configurado')}><IcPlus />Conectar WhatsApp</button>
                  : podeConfig
                    ? <button className="btn-sm acc" disabled={waCheio} title={waCheio ? 'Limite de WhatsApp atingido. Contrate um WhatsApp adicional.' : undefined} onClick={() => setWaOpen(true)}><IcPlus />Conectar WhatsApp</button>
                    : null}
                {isSupabaseConfigured && podeConfig && waCheio && (
                  <span className="conn-sub" style={{ color: 'var(--warn)', marginLeft: 4 }}>Limite atingido ({waUsados}/{waLimiteEfetivo}). Contrate um WhatsApp adicional.</span>
                )}
                <span className="sp" />
                <button className="btn-sm" onClick={() => refresh()}><IcRefresh />Atualizar</button>
              </div>
            </div>
          </div>
        </section>

        {/* FACEBOOK */}
        <section className="int-section" id="facebook">
          <div className="sec-head"><h2><svg className="si" viewBox="0 0 24 24" fill="currentColor"><path d="M22 12a10 10 0 1 0-11.6 9.9v-7H8v-2.9h2.4V9.8c0-2.4 1.4-3.7 3.6-3.7 1 0 2.1.2 2.1.2v2.3h-1.2c-1.2 0-1.5.7-1.5 1.4V12H16l-.4 2.9h-2.2v7A10 10 0 0 0 22 12z" /></svg>Facebook</h2><p>Conecte uma Página para receber e responder mensagens do Messenger.</p></div>
          <div className="int-grid">
            <div className="int-card">
              <div className="ic-head">
                <span className="ic-logo meta"><IcFb /></span>
                <div className="ic-ttl"><div className="t">Conta do Facebook {fbConectadas > 0 ? <span className="badge ok"><span className="dot" />Conectado</span> : <span className="badge neutral">Não conectado</span>}</div><div className="s">Receber e responder mensagens da sua Página no Messenger (somente texto).</div></div>
              </div>
              <div className="ic-body">
                {!FB_REAL ? (
                  <div className="adapter-note"><IcInfo /><div className="tx">Disponível com o backend configurado.</div></div>
                ) : fbSel ? (
                  <div className="conn-list">
                    <div className="conn-head">Escolha a Página para conectar</div>
                    {fbSel.length === 0 && <div className="adapter-note"><IcInfo /><div className="tx">Nenhuma Página encontrada nesta conta do Facebook. Você precisa ser <b>administrador de uma Página</b> e, na tela de autorização da Meta, <b>marcar a Página</b> que deseja conectar. Crie/assuma uma Página e clique novamente em “Conectar com Facebook”.</div></div>}
                    {fbSel.map((p) => (
                      <div className="conn-row" key={p.id}>
                        <div className="conn-info"><span className="conn-name">{p.nome}</span></div>
                        <div className="conn-actions"><button className="btn-sm acc" disabled={fbBusy} onClick={() => fbEscolher(p.id)}>Conectar esta Página</button></div>
                      </div>
                    ))}
                    <div className="conn-actions" style={{ justifyContent: 'flex-start' }}><button className="btn-sm" disabled={fbBusy} onClick={() => { setFbSel(null); setFbCode(null); }}>Cancelar</button></div>
                  </div>
                ) : fbPaginas.length === 0 ? (
                  <div className="adapter-note"><IcInfo /><div className="tx">Nenhuma Página conectada. Clique em <b>Conectar com Facebook</b> para autorizar e escolher a Página.</div></div>
                ) : (
                  <div className="conn-list">
                    {fbPaginas.map((p) => {
                      const b = fbTokenBadge(p);
                      const removendo = remLoading && remocao?.tipo === 'facebook' && remocao?.id === p.canal_id;
                      return (
                        <div className="conn-row" key={p.id}>
                          <div className="conn-info">
                            <span className="conn-name">{p.pagina_nome || p.pagina_id}</span>
                            <span className="conn-sub">Página · {p.pagina_id}</span>
                          </div>
                          <div className="conn-actions">
                            <span className={'badge ' + b.cls}>{'dot' in b && b.dot && <span className="dot" />}{b.t}</span>
                            {p.estado === 'conectado'
                              ? <>
                                  <button className="btn-sm" disabled={fbBusy || removendo} onClick={fbIniciar}>Reconectar</button>
                                  <button className="btn-sm danger" disabled={removendo} onClick={() => setRemocao({ tipo: 'facebook', id: p.canal_id, nome: p.pagina_nome || p.pagina_id })}>{removendo ? 'Removendo…' : 'Remover conexão'}</button>
                                </>
                              : <button className="btn-sm acc" disabled={fbBusy} onClick={fbIniciar}>Reconectar</button>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="ic-foot">
                {FB_REAL
                  ? <button className="btn-sm acc" disabled={fbBusy || !!fbSel} onClick={fbIniciar}><IcPlus />{fbBusy ? 'Conectando…' : 'Conectar com Facebook'}</button>
                  : <button className="btn-sm" onClick={() => toast('Disponível com o backend configurado')}><IcPlus />Conectar com Facebook</button>}
                <span className="sp" />
                <button className="btn-sm" onClick={() => refresh()}><IcRefresh />Atualizar</button>
              </div>
            </div>
          </div>
        </section>

        {/* API OFICIAL (Cloud API) — seção própria: é o único bloco do painel que fala com a Meta. */}
        <IntegracaoCloudApi podeConfig={podeConfig} />

        {/* MATURAÇÃO — pool de aquecimento. Aqui só se CONECTA/gerencia o número; a rampa,
            saúde, sementes e biblioteca continuam na página própria (/maturacao). */}
        <section className="int-section" id="maturacao">
          <div className="sec-head">
            <h2><svg className="si" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21c0-6 3-10 8-11 0 6-3 10-8 11z" /><path d="M12 21C7 20 4 16 4 10c5 1 8 5 8 11z" /></svg>Maturação de Números</h2>
            <p>Chips novos ganhando reputação antes de entrar em operação. Nada aqui se mistura com o atendimento.</p>
          </div>
          <div className="int-grid">
            <div className="int-card">
              <div className="ic-head">
                <span className="ic-logo ext"><IcSeed /></span>
                <div className="ic-ttl">
                  <div className="t">Pool de aquecimento <span className="badge matq-badge">Fora do atendimento</span></div>
                  <div className="s">Conecte e gerencie os números em maturação. A rampa e a saúde ficam na página Maturação.</div>
                </div>
              </div>
              <div className="ic-body">
                <div className="adapter-note matq-aviso">
                  <IcInfo />
                  <div className="tx"><b>Números em aquecimento.</b> Ficam totalmente separados do atendimento — não aparecem no Inbox, não recebem conversas de clientes e não consomem o limite do seu plano.</div>
                </div>
                {!isSupabaseConfigured || !MATURACAO_REAL ? (
                  <div className="adapter-note"><IcInfo /><div className="tx">Disponível com o backend configurado.</div></div>
                ) : !podeMaturacao ? (
                  <div className="adapter-note"><IcInfo /><div className="tx">Somente administradores da organização gerenciam os números em maturação.</div></div>
                ) : matPainel.isLoading ? (
                  <div className="adapter-note"><IcInfo /><div className="tx">Carregando números em maturação…</div></div>
                ) : matPainel.isError ? (
                  <div className="adapter-note"><IcInfo /><div className="tx">{msgErro(matPainel.error)}</div></div>
                ) : matChips.length === 0 ? (
                  <div className="adapter-note"><IcInfo /><div className="tx">Nenhum número em maturação. Clique em <b>Adicionar número para maturação</b> para criar a sessão e ler o QR Code.</div></div>
                ) : (
                  <div className="conn-list">
                    {matChips.map((c) => {
                      const st = MAT_CONN[c.status_integracao] ?? MAT_CONN.desconectado;
                      const cor = MAT_ST_COR[c.status_maturacao] ?? MAT_ST_COR.novo;
                      const conectado = c.status_integracao === 'conectado';
                      const excluindo = matExcluirChip.isPending && matExcluir?.chip_id === c.chip_id;
                      return (
                        <div className="conn-row" key={c.chip_id}>
                          <div className="conn-info">
                            <span className="conn-name">{c.apelido}</span>
                            <span className="conn-sub">{c.numero_conectado ? formatarNumero(c.numero_conectado) : 'não conectado'}</span>
                            <span className="conn-chips">
                              <span className={'badge ' + st.cls}>{st.dot && <span className="dot" />}{st.t}</span>
                              <span className="badge" style={{ background: cor.bg, color: cor.fg }} title="Situação do aquecimento deste número">
                                <span className="dot" style={{ background: cor.fg }} />{STATUS_MATURACAO_LABEL[c.status_maturacao]}
                              </span>
                              {/* Score da conta: cai antes de o número banir. Detalhe e média ficam na página Maturação. */}
                              <span className={'badge matq-score sc-' + c.score_classe} title={`Saúde da conta: ${SCORE_CLASSE_LABEL[c.score_classe]} (${c.score}/100). O placar completo fica na página Maturação.`}>
                                <span className="dot" />Saúde {c.score}
                              </span>
                              {/* Proxy: opcional. Sem ele o chip sai pelo IP do servidor — o mesmo de todos os outros. */}
                              {c.proxy_pendente ? (
                                <span className="badge warn" title={`Proxy configurado (${c.proxy_resumo ?? '—'}) mas ainda não aplicado à sessão: o tráfego continua saindo pelo IP do servidor. Abra "Proxy" e salve novamente para aplicar.`}>Proxy pendente</span>
                              ) : c.proxy_ativo ? (
                                <span className="badge ok matq-proxy-badge" title={`Todo o tráfego deste número sai por ${c.proxy_resumo}.`}>{c.proxy_resumo}</span>
                              ) : (
                                <span className="badge neutral" title="Sem proxy: este número sai pelo IP do servidor, igual aos demais do pool. É opcional — só configure um proxy em que você confia, porque proxy instável derruba a sessão.">Sem proxy</span>
                              )}
                            </span>
                            {conectado && !c.perfil_ok && (
                              <span className="conn-alerta" style={{ color: 'var(--warn)' }}>Perfil do celular não confirmado — o aquecimento não inicia sem foto, nome e recado.</span>
                            )}
                            {c.proxy_ultimo_erro && (
                              <span className="conn-alerta" style={{ color: 'var(--err)' }}>Proxy não aplicado: {c.proxy_ultimo_erro}</span>
                            )}
                          </div>
                          <div className="conn-actions">
                            <button className="btn-sm acc" disabled={excluindo} onClick={() => setMatQr({ id: c.chip_id, apelido: c.apelido, perfilOk: c.perfil_ok })}>
                              <IcQr />{conectado ? 'Reconectar' : 'Conectar'}
                            </button>
                            <button className="btn-sm" disabled={excluindo} onClick={() => setMatProxy(c)}><IcProxy />Proxy</button>
                            <button className="btn-sm danger" disabled={excluindo} onClick={() => setMatExcluir(c)}>{excluindo ? 'Excluindo…' : 'Excluir'}</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="ic-foot">
                {!isSupabaseConfigured || !MATURACAO_REAL
                  ? <button className="btn-sm" onClick={() => toast('Disponível com o backend configurado')}><IcPlus />Adicionar número para maturação</button>
                  : podeMaturacao
                    ? <button className="btn-sm acc" onClick={() => setMatNovo(true)}><IcPlus />Adicionar número para maturação</button>
                    : null}
                <span className="sp" />
                <button className="btn-sm" onClick={() => matRefresh()}><IcRefresh />Atualizar</button>
              </div>
            </div>
          </div>
        </section>

        {/* SAÚDE */}
        <section className="int-section">
          <div className="sec-head"><h2><svg className="si" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h4l2 6 4-14 2 8h6" /></svg>Saúde das integrações</h2><p>Eventos recentes de conexões e mensagens.</p></div>
          <div className="panel" style={{ marginBottom: 0 }}>
            <div className="panel-body">
              <div className="adapter-note"><IcInfo /><div className="tx">Nenhum evento recente. Os eventos aparecem aqui após conectar um canal.</div></div>
            </div>
          </div>
        </section>
      </div>

      {waOpen && (
        <WhatsAppConnect orgId={currentOrg.id} onClose={() => setWaOpen(false)} onConnected={refresh} />
      )}
      {reconectar && (
        <WhatsAppConnect orgId={currentOrg.id} reconnectCanalId={reconectar.id} reconnectAlias={reconectar.alias}
          onClose={() => setReconectar(null)} onConnected={refresh} />
      )}

      {/* Maturação: criar já emenda no QR — criar sem conectar deixa um número inerte no pool. */}
      {matNovo && (
        <MatNovoModal
          onClose={() => setMatNovo(false)}
          onCriado={(id, apelido) => { setMatNovo(false); setMatQr({ id, apelido, perfilOk: false }); }}
        />
      )}
      {matProxy && (
        <MatProxyModal chip={matProxy} onClose={() => { setMatProxy(null); matRefresh(); }} />
      )}
      {matQr && (
        <MatQrModal
          chipId={matQr.id} apelido={matQr.apelido} perfilOkInicial={matQr.perfilOk}
          onClose={() => { setMatQr(null); matRefresh(); }}
          onConectado={({ iniciado }) => {
            setMatQr(null); matRefresh();
            if (iniciado) toast('Número conectado. O aquecimento começou automaticamente.');
            else toast('Número conectado, mas o aquecimento não iniciou: confirme foto, nome e recado do celular.', 'warn');
          }}
        />
      )}

      <ConfirmDialog
        open={!!matExcluir}
        title="Excluir número da maturação?"
        message={matExcluir
          ? `O número "${matExcluir.apelido}" será excluído DEFINITIVAMENTE do pool de aquecimento: a sessão é derrubada e o histórico de agenda e eventos dele é apagado. Isso não afeta nenhuma conexão de atendimento.`
          : ''}
        destructive confirmLabel="Excluir número" loading={matExcluirChip.isPending}
        onConfirm={matConfirmarExclusao}
        onCancel={() => { if (!matExcluirChip.isPending) setMatExcluir(null); }} />

      <ConfirmDialog
        open={!!remocao}
        title={remocao?.modo === 'ocultar' ? 'Remover da lista?' : remocao?.tipo === 'whatsapp' ? 'Desconectar WhatsApp?' : 'Remover conexão?'}
        message={remocao
          ? (remocao.modo === 'ocultar'
              ? `A conexão "${remocao.nome}" vai sumir da lista de Integrações, mas TODO o histórico (conversas, mensagens, contatos, oportunidades e relatórios) é preservado. Se ela ainda estiver conectada, a sessão é encerrada.`
              : remocao.tipo === 'whatsapp'
                ? `A conexão "${remocao.nome}" será encerrada, mas conversas, contatos, histórico e relatórios serão preservados. Você poderá reconectar o mesmo número depois.`
                : `A conexão "${remocao.nome}" será desconectada do provedor e deixará de aparecer na lista. O histórico de conversas e mensagens é preservado.`)
          : ''}
        destructive loading={remLoading} confirmLabel={remocao?.modo === 'ocultar' ? 'Remover da lista' : remocao?.tipo === 'whatsapp' ? 'Desconectar' : 'Remover conexão'} cancelLabel="Cancelar"
        onConfirm={confirmarRemocao} onCancel={() => { if (!remLoading) setRemocao(null); }} />

      {config && <ConfigOrigemModal canal={config} onClose={() => setConfig(null)} onSaved={() => { setConfig(null); qc.invalidateQueries({ queryKey: ['wa-canais', currentOrg.id] }); qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('rel-') }); toast('Configuração salva.'); }} />}

      {diag && (() => {
        const h = healthMap.get(diag);
        if (!h) return null;
        const podeAgir = healthQ.data?.podeAgir ?? podeConfig;
        return <DiagnosticoModal h={h} podeAgir={podeAgir} atualizando={healthQ.isFetching}
          entregaAuto={entregaQ.data?.find((x) => x.canal_id === diag) ?? null}
          proximoMin={proximoTeste(diag)}
          canal={canais.find((k) => k.id === diag) ?? null}
          onClose={() => setDiag(null)}
          onAtualizar={() => healthQ.refetch()}
          onReconectar={() => { setDiag(null); setReconectar({ id: h.canalId, alias: h.nome }); }}
          onDesconectar={() => { setDiag(null); setRemocao({ tipo: 'whatsapp', id: h.canalId, nome: h.nome + ' · ' + h.numeroMasc }); }} />;
      })()}
    </div>
  );
}

function ConfigOrigemModal({ canal, onClose, onSaved }: { canal: WaCanal; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const { data: usuarios = [] } = useOrgUsuarios();
  const { data: fontes = [] } = useFontesAquisicao();
  const [form, setForm] = useState<ComercialInput>({
    nome_interno: canal.alias === 'WhatsApp' ? '' : canal.alias, origem_tipo: canal.origemTipo, gestor_id: canal.gestorId,
    fonte_aquisicao_id: canal.fonteId, campanha: canal.campanha, observacao_comercial: canal.observacaoComercial,
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof ComercialInput, v: string) => setForm((s) => ({ ...s, [k]: v || null }));
  async function salvar() {
    if (busy) return; setBusy(true);
    try { await waUpdateComercial(canal.id, { ...form, nome_interno: (form.nome_interno || '').trim() || 'WhatsApp' }); onSaved(); }
    catch (e) { toast((e as Error).message || 'Falha ao salvar.', 'warn'); setBusy(false); }
  }
  return (
    <Modal open onClose={() => { if (!busy) onClose(); }} closeOnBackdrop={!busy} width={560}
      title={<div><div>Configurar origem comercial</div><div className="cfg-sub">{canal.numero ? mascararNumero(canal.numero) : 'Conexão de WhatsApp'}</div></div>}
      footer={<><button className="atv-btn" disabled={busy} onClick={onClose}>Cancelar</button><button className="atv-btn primary" disabled={busy} onClick={salvar}>{busy ? 'Salvando…' : 'Salvar configuração'}</button></>}>
      <div className="cfg-form">
        <div className="cfg-field"><label>Nome interno da conexão</label><input className="ctrl" placeholder="Ex.: Chip 1 — Tráfego Matheus" value={form.nome_interno || ''} onChange={(e) => set('nome_interno', e.target.value)} disabled={busy} /></div>
        <div className="cfg-2col">
          <div className="cfg-field"><label>Tipo de origem</label><select className="ctrl" value={form.origem_tipo || ''} onChange={(e) => set('origem_tipo', e.target.value)} disabled={busy}><option value="">Não definido</option>{ORIGEM_TIPOS.map((t) => <option key={t.id} value={t.id}>{t.r}</option>)}</select></div>
          <div className="cfg-field"><label>Gestor responsável</label><select className="ctrl" value={form.gestor_id || ''} onChange={(e) => set('gestor_id', e.target.value)} disabled={busy}><option value="">Não atribuído</option>{usuarios.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}</select></div>
        </div>
        <div className="cfg-2col">
          <div className="cfg-field"><label>Fonte de aquisição</label><select className="ctrl" value={form.fonte_aquisicao_id || ''} onChange={(e) => set('fonte_aquisicao_id', e.target.value)} disabled={busy}><option value="">Não definida</option>{fontes.map((ft) => <option key={ft.id} value={ft.id}>{ft.nome}</option>)}</select></div>
          <div className="cfg-field"><label>Campanha</label><input className="ctrl" placeholder="Opcional" value={form.campanha || ''} onChange={(e) => set('campanha', e.target.value)} disabled={busy} /></div>
        </div>
        <div className="cfg-field"><label>Observação comercial</label><textarea className="ctrl cfg-ta" rows={2} value={form.observacao_comercial || ''} onChange={(e) => set('observacao_comercial', e.target.value)} disabled={busy} /></div>
      </div>
    </Modal>
  );
}

/* ===================== Diagnóstico de saúde da conexão ===================== */
function DiagnosticoModal({ h, podeAgir, atualizando, entregaAuto, proximoMin, canal, onClose, onAtualizar, onReconectar, onDesconectar }: {
  h: WaHealthCanal; podeAgir: boolean; atualizando: boolean;
  /** Resumo do monitoramento automático — os detalhes que saíram do card principal. */
  entregaAuto?: EntregaAutoResumo | null; proximoMin?: number | null;
  /** Canal (origem comercial/gestor saíram do card e vivem aqui). */
  canal?: WaCanal | null;
  onClose: () => void; onAtualizar: () => void; onReconectar: () => void; onDesconectar: () => void;
}) {
  const stOK = (s: string) => ['SERVER_ACK', 'DELIVERY_ACK', 'READ', 'PLAYED'].includes(s);
  const ativo = h.statusIntegracao === 'conectado' || h.statusIntegracao === 'sincronizando';
  return (
    <Modal open onClose={onClose} closeOnBackdrop width={620}
      title={<div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}><span>Diagnóstico</span><strong style={{ color: 'var(--ink)' }}>{h.nome}</strong>
        <span className="badge" style={{ background: COR_BG[h.cor], color: COR_FG[h.cor] }}><span className="dot" style={{ background: COR_FG[h.cor] }} />{ESTADO_LABEL[h.estado] ?? h.estado}</span></div>}
      footer={<>
        <button className="atv-btn" disabled={atualizando} onClick={onAtualizar}>{atualizando ? 'Atualizando…' : 'Atualizar diagnóstico'}</button>
        {podeAgir && !ativo && <button className="atv-btn primary" onClick={onReconectar}>Reconectar</button>}
        {podeAgir && ativo && <button className="atv-btn" onClick={onDesconectar}>Desconectar</button>}
        <button className="atv-btn" onClick={onClose}>Fechar</button>
      </>}>
      <div className="cfg-form">
        <p className="lead" style={{ marginTop: 0 }}>{h.recomendacao}</p>
        <div className="diag-grid">
          <div><span className="dl">Estado da sessão</span><span className="dv">{h.evoState ?? h.statusIntegracao}</span></div>
          <div><span className="dl">Recebimento</span><span className="dv">{h.recebimento}</span></div>
          <div><span className="dl">Envio</span><span className="dv">{h.envio}{h.taxa !== null ? ` · ${h.entregues}/${h.enviados} (${h.taxa}%)` : ''}</span></div>
          <div><span className="dl">Erros consecutivos</span><span className="dv">{h.consecErros}</span></div>
          <div><span className="dl">Instância</span><span className="dv" style={{ fontSize: 11 }}>{h.instancia ?? '—'}</span></div>
          <div><span className="dl">Número</span><span className="dv">{h.numeroMasc}</span></div>
          <div><span className="dl">Último recebido</span><span className="dv">{haQuanto(h.lastInbound)}</span></div>
          <div><span className="dl">Último entregue</span><span className="dv">{haQuanto(h.lastDelivered)}</span></div>
          <div><span className="dl">Webhook</span><span className="dv">{h.webhookOk === null ? '—' : h.webhookOk ? 'ativo' : 'inativo'} · {h.lastWebhookEvent ?? '—'} ({haQuanto(h.lastWebhook)})</span></div>
          <div><span className="dl">Evolution</span><span className="dv">{h.versao ?? '—'}</span></div>
          <div><span className="dl">Origem comercial</span><span className="dv">{tipoOrigemLabel(canal?.origemTipo ?? null) ?? 'não configurada'}</span></div>
          <div><span className="dl">Gestor</span><span className="dv">{canal?.gestorNome ?? '—'}</span></div>
        </div>
        {h.lastErrorMsg && <div className="atv-field-err" style={{ marginTop: 8 }}>Último erro técnico: {h.lastErrorMsg}</div>}

        {/* ENTREGA AUTOMÁTICA — detalhes que saíram do card principal p/ manter a lista limpa. */}
        {entregaAuto?.apto && (
          <>
            <div className="sechead" style={{ margin: '14px 0 6px', fontSize: 13, fontWeight: 600 }}>
              Entrega automática
              <span className="badge" style={{ marginLeft: 8, background: SAUDE_BG[entregaAuto.saude], color: SAUDE_COR[entregaAuto.saude] }}>
                <span className="dot" style={{ background: SAUDE_COR[entregaAuto.saude] }} />{SAUDE_LABEL[entregaAuto.saude]}
              </span>
            </div>
            <div className="diag-grid">
              <div><span className="dl">Destino</span><span className="dv">{entregaAuto.destino}</span></div>
              <div><span className="dl">Frequência</span><span className="dv">{entregaAuto.frequencia_hora}/h (a cada 12 min)</span></div>
              <div><span className="dl">Última hora</span><span className="dv">{entregaAuto.entregues_1h}/{entregaAuto.total_1h || 0} entregues · {entregaAuto.falhas_1h} falhas</span></div>
              <div><span className="dl">Últimos 5 testes</span><span className="dv">{entregaAuto.entregues_5} entregues · {entregaAuto.erros_5} erro · {entregaAuto.timeouts_5} timeout</span></div>
              <div><span className="dl">Último teste</span><span className="dv">{entregaAuto.ultimo_em ? `${RESULTADO_LABEL[entregaAuto.ultimo_resultado ?? ''] ?? entregaAuto.ultimo_resultado} ${haQuanto(entregaAuto.ultimo_em)}` : '—'}</span></div>
              <div><span className="dl">Latência do ACK</span><span className="dv">{entregaAuto.ultimo_latencia_ms != null ? `${entregaAuto.ultimo_latencia_ms} ms` : '—'}</span></div>
              <div><span className="dl">Próximo teste</span><span className="dv">{entregaAuto.estado === 'pausado' ? '—' : proximoMin != null ? `em ${proximoMin} min` : '—'}</span></div>
              {entregaAuto.estado === 'pausado' && entregaAuto.pausado_ate && (
                <div><span className="dl">Pausado até</span><span className="dv">{hhmm(entregaAuto.pausado_ate)}</span></div>
              )}
            </div>
            <div className="conn-sub" style={{ marginTop: 6, color: 'var(--muted)' }}>
              {entregaAuto.saude === 'restrito'
                ? 'O canal aceita o envio mas o WhatsApp responde ERROR — recusa real de entrega. Normalmente é restrição do número para envio via API: use outro canal para automação.'
                : entregaAuto.timeouts_5 >= 2
                ? 'Os testes estão sendo aceitos mas o ACK final não chega (timeout). Isso indica sessão/rota instável — não é o mesmo que o WhatsApp recusar a entrega.'
                : entregaAuto.saude === 'sem_dados'
                ? 'Nenhum teste concluído ainda. O primeiro roda automaticamente na próxima janela.'
                : 'Teste técnico ao número interno da equipe (nunca cliente). Não cria lead nem conversa.'}
            </div>
          </>
        )}
        {/* Atenção: esta lista é o ENVIO REAL a clientes (telemetria de mensagens) — não é o teste
            automático. Por isso aparecem destinos de clientes aqui, e não o ••••2825. */}
        <div className="sechead" style={{ margin: '14px 0 6px', fontSize: 13, fontWeight: 600 }}>
          Últimos {h.last10.length} envios a clientes
          <span className="conn-sub" style={{ fontWeight: 400, marginLeft: 6, color: 'var(--muted)' }}>(mensagens reais — não são os testes)</span>
        </div>
        {h.last10.length === 0 ? <div className="conn-sub" style={{ color: 'var(--muted)' }}>Sem envios recentes.</div> : (
          <div className="diag-l10">
            {h.last10.map((x, i) => (
              <div className="diag-l10-row" key={i}>
                <span>{horaCurta(x.hora)}</span>
                <span style={{ color: stOK(x.status) ? 'var(--ok)' : (x.status === 'ERROR' ? 'var(--err)' : 'var(--muted)') }}>{x.status}</span>
                <span>•••{x.destino}</span>
                <span className="diag-erro">{x.erro ?? ''}</span>
              </div>
            ))}
          </div>
        )}
        <div className="conn-sub" style={{ marginTop: 12, color: 'var(--muted)' }}>
          Para validar o envio, envie uma mensagem real pela conversa (fluxo da aplicação) e atualize o diagnóstico — o resultado real aparece aqui. Este painel é somente leitura.
        </div>
      </div>
    </Modal>
  );
}

/* ============================================================================
   MATURAÇÃO — criar número e conectar a sessão de aquecimento
   Só CONEXÃO/gestão do número: rampa, saúde, sementes e biblioteca vivem em /maturacao.
   ========================================================================== */

/* ---- Proxy do chip: formulário compartilhado entre "novo número" e "editar proxy" ---- */
interface ProxyForm { protocolo: ProxyProtocolo; host: string; porta: string; usuario: string; senha: string }
const PROXY_VAZIO: ProxyForm = { protocolo: 'http', host: '', porta: '', usuario: '', senha: '' };
/** Nota curta e sempre visível: proxy é escolha, não obrigação — e proxy ruim é pior que nenhum. */
const PROXY_NOTA = (
  <p className="matq-lead matq-proxy-nota">
    <b>Opcional.</b> Sem proxy, este número sai pelo mesmo IP do servidor que os outros chips — é assim que funciona hoje.
    Com proxy, o WhatsApp vê um IP só deste número. Mas <b>proxy instável derruba a sessão e custa a rampa inteira</b>:
    só use um proxy em que você confia.
  </p>
);

/** Valida/normaliza antes de chamar a RPC — a mensagem local é melhor que o `raise` traduzido. */
function validaProxy(f: ProxyForm): { erro: string } | { host: string; porta: number } {
  const host = f.host.trim();
  if (!host) return { erro: 'Informe o endereço (host ou IP) do proxy.' };
  const porta = Number(f.porta);
  if (!Number.isInteger(porta) || porta < 1 || porta > 65535) return { erro: 'Informe a porta do proxy (entre 1 e 65535).' };
  return { host, porta };
}

function MatProxyCampos({ id, valor, onChange, disabled, senhaPlaceholder }: {
  id: string; valor: ProxyForm; onChange: (v: ProxyForm) => void; disabled?: boolean; senhaPlaceholder: string;
}) {
  const set = (p: Partial<ProxyForm>) => onChange({ ...valor, ...p });
  return (
    <>
      <div className="matq-proxy-grid">
        <div className="atv-field">
          <label htmlFor={`${id}-proto`}>Protocolo</label>
          <select id={`${id}-proto`} className="atv-select" value={valor.protocolo} disabled={disabled}
            onChange={(e) => set({ protocolo: e.target.value as ProxyProtocolo })}>
            {PROXY_PROTOCOLOS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="atv-field">
          <label htmlFor={`${id}-host`}>Endereço (host ou IP)</label>
          <input id={`${id}-host`} className="atv-input" placeholder="Ex.: 189.45.20.10" value={valor.host}
            disabled={disabled} onChange={(e) => set({ host: e.target.value })} />
        </div>
        <div className="atv-field">
          <label htmlFor={`${id}-porta`}>Porta</label>
          <input id={`${id}-porta`} className="atv-input" type="number" min={1} max={65535} placeholder="1080"
            value={valor.porta} disabled={disabled} onChange={(e) => set({ porta: e.target.value })} />
        </div>
      </div>
      <div className="matq-proxy-grid2">
        <div className="atv-field">
          <label htmlFor={`${id}-user`}>Usuário (opcional)</label>
          <input id={`${id}-user`} className="atv-input" autoComplete="off" value={valor.usuario}
            disabled={disabled} onChange={(e) => set({ usuario: e.target.value })} />
        </div>
        <div className="atv-field">
          <label htmlFor={`${id}-senha`}>Senha (opcional)</label>
          {/* A senha guardada NUNCA volta do servidor: em branco significa "manter a atual". */}
          <input id={`${id}-senha`} className="atv-input" type="password" autoComplete="new-password"
            placeholder={senhaPlaceholder} value={valor.senha} disabled={disabled}
            onChange={(e) => set({ senha: e.target.value })} />
        </div>
      </div>
    </>
  );
}

/** Edita/remove o proxy de um chip já existente. Salvar = gravar no banco + empurrar na Evolution. */
function MatProxyModal({ chip, onClose }: { chip: ChipPainel; onClose: () => void }) {
  const { toast } = useToast();
  // O painel só traz o resumo; usuário vem da tabela (a senha está fora do grant de SELECT).
  // Sem esse prefill, salvar host/porta apagaria o usuário e a autenticação do proxy quebraria.
  const atual = useProxyChip(chip.chip_id);
  const definir = useDefinirProxy();
  const remover = useRemoverProxy();
  const aplicar = useAplicarProxy();
  const [form, setForm] = useState<ProxyForm>(PROXY_VAZIO);
  const [err, setErr] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const prefilled = useRef(false);

  useEffect(() => {
    if (prefilled.current || !atual.data) return;
    prefilled.current = true;
    const d = atual.data;
    setForm({
      protocolo: d.proxy_protocolo ?? 'http',
      host: d.proxy_host ?? '',
      porta: d.proxy_porta != null ? String(d.proxy_porta) : '',
      usuario: d.proxy_usuario ?? '',
      senha: '',
    });
  }, [atual.data]);

  const temProxy = !!chip.proxy_resumo;
  const ocupado = definir.isPending || remover.isPending || aplicar.isPending || atual.isLoading;

  async function salvar() {
    const v = validaProxy(form);
    if ('erro' in v) { setErr(v.erro); return; }
    setErr(null);
    try {
      await definir.mutateAsync({
        chipId: chip.chip_id, protocolo: form.protocolo, host: v.host, porta: v.porta,
        usuario: form.usuario, senha: form.senha,
      });
      const r = await aplicar.mutateAsync(chip.chip_id);
      if (r.ok && r.aplicado) toast('Proxy salvo e aplicado. O tráfego deste número passa a sair por ele.');
      else toast(`Proxy salvo, mas não foi aplicado à sessão: ${r.erro || 'o servidor de aquecimento recusou a configuração.'} O número continua saindo pelo IP do servidor.`, 'warn');
      onClose();
    } catch (e) { setErr(msgErro(e)); }
  }

  async function confirmarRemocao() {
    setErr(null);
    try {
      await remover.mutateAsync(chip.chip_id);
      const r = await aplicar.mutateAsync(chip.chip_id);   // empurra a REMOÇÃO para a instância
      if (r.ok) toast('Proxy removido. Este número volta a sair pelo IP do servidor.');
      else toast(`Proxy removido do cadastro, mas a sessão não foi atualizada: ${r.erro || 'o servidor de aquecimento não respondeu.'}`, 'warn');
      onClose();
    } catch (e) { setConfirmar(false); setErr(msgErro(e)); }
  }

  return (
    <>
      <Modal open onClose={() => { if (!ocupado) onClose(); }} closeOnBackdrop={!ocupado} width={520}
        title={<div><div>Proxy do número em maturação</div><div className="cfg-sub">{chip.apelido} · {temProxy ? (chip.proxy_resumo ?? '') : 'sem proxy'}</div></div>}
        footer={<>
          <button className="atv-btn" disabled={ocupado} onClick={onClose}>Cancelar</button>
          {temProxy && <button className="atv-btn danger" disabled={ocupado} onClick={() => setConfirmar(true)}>Remover proxy</button>}
          <button className="atv-btn primary" disabled={ocupado} onClick={() => void salvar()}>
            {definir.isPending || aplicar.isPending ? 'Aplicando…' : 'Salvar e aplicar'}
          </button>
        </>}>
        {PROXY_NOTA}
        {chip.proxy_pendente && (
          <div className="matq-proxy-aviso warn">Este proxy está salvo mas <b>ainda não foi aplicado</b> à sessão. Salve novamente para tentar aplicar.</div>
        )}
        {chip.proxy_ultimo_erro && (
          <div className="matq-proxy-aviso err">Última tentativa de aplicar falhou: {chip.proxy_ultimo_erro}</div>
        )}
        <MatProxyCampos id="intmat-px" valor={form} onChange={setForm} disabled={ocupado}
          senhaPlaceholder={temProxy ? 'deixe em branco para manter a atual' : 'se o proxy exigir senha'} />
        {err && <div className="atv-field-err">{err}</div>}
      </Modal>
      <ConfirmDialog
        open={confirmar}
        title="Remover o proxy deste número?"
        message={`O número "${chip.apelido}" volta a sair pelo IP do servidor, o mesmo dos outros chips do pool. A sessão continua conectada — só a rota de saída muda.`}
        destructive confirmLabel="Remover proxy" loading={remover.isPending || aplicar.isPending}
        onConfirm={() => void confirmarRemocao()}
        onCancel={() => { if (!remover.isPending && !aplicar.isPending) setConfirmar(false); }} />
    </>
  );
}

function MatNovoModal({ onClose, onCriado }: { onClose: () => void; onCriado: (chipId: string, apelido: string) => void }) {
  const { toast } = useToast();
  const criar = useCriarChip();
  const definir = useDefinirProxy();
  const aplicar = useAplicarProxy();
  const [apelido, setApelido] = useState('');
  const [operadora, setOperadora] = useState('');
  const [usarProxy, setUsarProxy] = useState(false);
  const [proxy, setProxy] = useState<ProxyForm>(PROXY_VAZIO);
  const [err, setErr] = useState<string | null>(null);
  // O chip já criado não pode ser criado de novo se o proxy falhar: guarda o id para o retry.
  const criadoRef = useRef<string | null>(null);
  const ocupado = criar.isPending || definir.isPending || aplicar.isPending;

  async function salvar() {
    const nome = apelido.trim();
    if (!nome) { setErr('Informe um apelido para o número.'); return; }
    // Validar o proxy ANTES de criar: erro de digitação não deve deixar um chip órfão no pool.
    let px: { host: string; porta: number } | null = null;
    if (usarProxy) {
      const v = validaProxy(proxy);
      if ('erro' in v) { setErr(v.erro); return; }
      px = v;
    }
    setErr(null);
    try {
      let id = criadoRef.current;
      if (!id) {
        const r = await criar.mutateAsync({ apelido: nome, operadora });
        id = r?.chip_id ?? null;
        criadoRef.current = id;
      }
      if (!id) { toast('Número criado. Leia o QR Code para conectar.'); onClose(); return; }
      // O proxy tem de estar em pé ANTES do pareamento: trocar o IP com a sessão já ativa é
      // exatamente o movimento que o WhatsApp lê como sequestro de conta.
      if (px) {
        await definir.mutateAsync({
          chipId: id, protocolo: proxy.protocolo, host: px.host, porta: px.porta,
          usuario: proxy.usuario, senha: proxy.senha,
        });
        const r2 = await aplicar.mutateAsync(id);
        if (!r2.ok || !r2.aplicado) {
          setErr(`Número criado, mas o proxy não foi aplicado: ${r2.erro || 'o servidor de aquecimento recusou a configuração.'} Corrija o proxy e salve de novo — não leia o QR Code antes disso.`);
          return;
        }
        toast('Número criado com proxy aplicado. Leia o QR Code para conectar.');
      } else {
        toast('Número criado. Leia o QR Code para conectar.');
      }
      onCriado(id, nome);
    } catch (e) { setErr(msgErro(e)); }
  }

  return (
    <Modal open onClose={() => { if (!ocupado) onClose(); }} closeOnBackdrop={!ocupado} width={usarProxy ? 520 : 460}
      title="Adicionar número para maturação"
      footer={<>
        <button className="atv-btn" disabled={ocupado} onClick={onClose}>Cancelar</button>
        <button className="atv-btn primary" disabled={ocupado} onClick={() => void salvar()}>{ocupado ? 'Criando…' : 'Criar e conectar'}</button>
      </>}>
      <p className="matq-lead">O número ganha uma sessão própria de aquecimento, separada das conexões de atendimento: não aparece no Inbox, não recebe conversas de clientes e não consome o limite do plano.</p>
      <div className="atv-field">
        <label htmlFor="intmat-apelido">Apelido</label>
        <input id="intmat-apelido" className="atv-input" placeholder="Ex.: Chip 4 — Vivo" value={apelido} maxLength={40}
          onChange={(e) => setApelido(e.target.value)} disabled={ocupado} />
      </div>
      <div className="atv-field">
        <label htmlFor="intmat-operadora">Operadora (opcional)</label>
        <select id="intmat-operadora" className="atv-select" value={operadora} onChange={(e) => setOperadora(e.target.value)} disabled={ocupado}>
          <option value="">Não informada</option>
          {OPERADORAS.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>

      {/* Proxy no cadastro: dá para configurar depois, mas o melhor momento é ANTES de parear. */}
      <label className="matq-proxy-toggle">
        <input type="checkbox" checked={usarProxy} disabled={ocupado} onChange={(e) => setUsarProxy(e.target.checked)} />
        <span>Configurar proxy (opcional)</span>
      </label>
      {usarProxy && (
        <div className="matq-proxy-bloco">
          {PROXY_NOTA}
          <MatProxyCampos id="intmat-npx" valor={proxy} onChange={setProxy} disabled={ocupado}
            senhaPlaceholder="se o proxy exigir senha" />
        </div>
      )}
      {err && <div className="atv-field-err">{err}</div>}
    </Modal>
  );
}

function MatQrModal({ chipId, apelido, perfilOkInicial, onClose, onConectado }: {
  chipId: string; apelido: string; perfilOkInicial: boolean;
  onClose: () => void;
  /** Chamado uma única vez quando a sessão sobe: o pai fecha o modal e avisa o usuário. */
  onConectado: (r: { iniciado: boolean }) => void;
}) {
  const pedirQr = useQrChip();
  const atualizar = useAtualizarChip();
  const status = useStatusChip(chipId);                       // polling de 3s enquanto o modal está aberto
  const [perfilOk, setPerfilOk] = useState(perfilOkInicial);
  const [img, setImg] = useState<string | null>(null);
  const [secs, setSecs] = useState(60);
  const [err, setErr] = useState<string | null>(null);
  const conectado = status.data?.status_integracao === 'conectado';
  const jaTratou = useRef(false);

  const gerar = useCallback(async () => {
    setErr(null);
    try {
      const r = await pedirQr.mutateAsync(chipId);
      setImg(r.conectado ? null : (r.qr ?? null));
      setSecs(60);
    } catch (e) { setErr(msgErro(e)); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chipId]);

  // O QR só é pedido depois da confirmação do perfil: sem perfil o aquecimento não inicia,
  // então conectar antes disso só deixaria um número parado e exposto.
  useEffect(() => { if (perfilOk && !conectado) void gerar(); }, [perfilOk, conectado, gerar]);

  // O QR da Evolution expira: renova sozinho enquanto a sessão não sobe.
  useEffect(() => {
    if (conectado || !perfilOk) return;
    const t = setInterval(() => {
      setSecs((s) => { if (s <= 1) { void gerar(); return 60; } return s - 1; });
    }, 1000);
    return () => clearInterval(t);
  }, [conectado, perfilOk, gerar]);

  // Conectou: o backend inicia o aquecimento sozinho (maturacao_auto_iniciar, no webhook e no
  // próprio status), mas SÓ com perfil_ok. `aquecimento_iniciado` só vem true na chamada que de
  // fato iniciou — se o webhook chegou primeiro ele volta false, por isso o perfil confirmado
  // também conta como início.
  useEffect(() => {
    if (!conectado || jaTratou.current) return;
    jaTratou.current = true;
    onConectado({ iniciado: perfilOk || !!status.data?.aquecimento_iniciado });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conectado]);

  async function marcarPerfil(v: boolean) {
    setPerfilOk(v); setErr(null);
    try { await atualizar.mutateAsync({ chipId, perfilOk: v }); }
    catch (e) { setPerfilOk(!v); setErr(msgErro(e)); }
  }

  return (
    <Modal open onClose={onClose} closeOnBackdrop width={470}
      title={<div><div>Conectar número em maturação</div><div className="cfg-sub">{apelido} · fora do atendimento</div></div>}
      footer={<>
        <button className="atv-btn" onClick={onClose}>Fechar</button>
        <button className="atv-btn" disabled={!perfilOk || pedirQr.isPending} onClick={() => void gerar()}>{pedirQr.isPending ? 'Gerando…' : 'Gerar novo QR'}</button>
      </>}>
      {/* Caixa destacada e ACIMA do QR: chip sem foto/nome é o padrão mais fácil de detectar. */}
      <label className={'matq-check' + (perfilOk ? ' on' : '')}>
        <input type="checkbox" checked={perfilOk} disabled={atualizar.isPending} onChange={(e) => void marcarPerfil(e.target.checked)} />
        <span className="matq-check-tx">
          <b>Já defini foto, nome e recado neste celular</b>
          <i>Chip sem foto e nome é o padrão mais fácil de detectar. O aquecimento não inicia sem isso.</i>
        </span>
      </label>

      {perfilOk ? (
        <div className="matq-qr">
          <p className="matq-lead">Abra o WhatsApp deste número → <b>Aparelhos conectados</b> → <b>Conectar um aparelho</b> e aponte para o código.</p>
          <div className="matq-qr-box">{img ? <img src={img} alt="QR Code de conexão do número em maturação" /> : <span>Gerando QR Code…</span>}</div>
          <div className="matq-qr-meta">Expira em <b>{secs}s</b> · renova automaticamente</div>
          <div className="matq-qr-meta">Aguardando leitura… ({STATUS_INTEGRACAO_LABEL[status.data?.status_integracao ?? 'desconectado']})</div>
          <div className="matq-qr-meta">Assim que a sessão subir, o aquecimento começa sozinho.</div>
        </div>
      ) : (
        <div className="matq-qr">
          <div className="matq-qr-box vazio"><span>Confirme o perfil acima para liberar o QR Code.</span></div>
        </div>
      )}
      {err && <div className="atv-field-err">{err}</div>}
    </Modal>
  );
}
