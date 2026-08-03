import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  REMARKETING_REAL, ETAPA_LABEL, STATUS_LABEL,
  useRemarketingLeads, useRemarketingTarefas, useRemarketingEventos,
  useConcluirTarefa, useRemarketingConfig, useSalvarRemarketingConfig,
  useTransferirLead, useReagendarTarefa, useRegistrarAcao, useRemarketingRealtime,
  useMudarEtapa, useObservacao, useProdutividade, useFilaSinais, useConversaResumo,
  type RmktLead, type RmktTarefa, type RmktConfig, type RmktEtapa, type RmktSinais, type RmktResumo,
} from '@/data/remarketing';
import { useOrgUsuarios } from '@/data/atendimento';
import { useWaMensagens } from '@/data/whatsapp';
import { useOrg } from '@/context/OrgContext';
import { useAuth } from '@/context/AuthContext';
import {
  BotaoMini, BotaoPrimario, BotaoSec, CardVidro, DrawerV2,
  EstadoErro, EstadoVazio, ModalV2, Skeleton,
} from '../components';
import { tempoRelativo, dataHoraSP } from '../lib/tempo';
import { initials } from '@/lib/avatar';
import './remarketing.css';

/* ------------------------------------------------------------------
   Central de Operações — recuperação de leads.
   FILA SOBERANA: uma lista única ordenada por SCORE; o topo é o herói
   "Próxima" que dita a ação. Cor = prazo (lê-se sem ler). Painel lateral
   estilo HubSpot resolve tudo sem trocar de tela; "Sugestão da IA" =
   heurísticas transparentes sobre dados reais. Teclado ↑↓/Enter/C.
   Realtime. Motor INERTE (nada dispara sozinho até a fase 3).
   ------------------------------------------------------------------ */

type Urgencia = 'vencida' | 'hoje' | 'amanha' | 'semana' | 'ok';
const URG_SEL: { v: 'todas' | Urgencia; r: string }[] = [
  { v: 'todas', r: 'Urgência: todas' }, { v: 'vencida', r: 'Vencidas' }, { v: 'hoje', r: 'Vencem hoje' },
  { v: 'amanha', r: 'Vencem amanhã' }, { v: 'semana', r: 'Esta semana' }, { v: 'ok', r: 'Em dia' },
];

const EVENTO_LABEL: Record<string, string> = {
  entrou_remarketing_1: 'Entrou no Remarketing 1', entrou_pendencia: 'Entrou em Pendência',
  escalado: 'Escalou de etapa', transferido: 'Transferido de atendente',
  etapa_alterada: 'Etapa alterada manualmente', tarefa_criada: 'Tarefa criada',
  tarefa_concluida: 'Tentativa registrada', ligacao_realizada: 'Ligação realizada',
  audio_enviado: 'Áudio enviado', whatsapp_enviado: 'WhatsApp enviado',
  reagendado: 'Prazo reagendado', observacao: 'Observação', sla_estourado: 'SLA estourado',
  respondeu: 'Cliente respondeu', recuperado: 'Recuperado', perdido: 'Perdido',
};
const BENEF_LABEL: Record<string, string> = {
  aposentadoria: 'Aposentadoria', pensao_por_morte: 'Pensão por morte', bpc_loas: 'BPC/LOAS', outro: 'Benefício',
};

/* ---------- tempo ---------- */
const spDia = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
function urgenciaDe(venceEm: string | null, agora: number): Urgencia {
  if (!venceEm) return 'ok';
  const t = new Date(venceEm).getTime();
  if (t <= agora) return 'vencida';
  const hoje = spDia(new Date(agora).toISOString());
  if (spDia(venceEm) === hoje) return 'hoje';
  if (spDia(venceEm) === spDia(new Date(agora + 86_400_000).toISOString())) return 'amanha';
  if (t <= agora + 7 * 86_400_000) return 'semana';
  return 'ok';
}
const diasSem = (iso: string | null, agora: number) => (iso ? Math.floor((agora - new Date(iso).getTime()) / 86_400_000) : null);
const minutosDesde = (iso: string | null, agora: number) => (iso ? Math.floor((agora - new Date(iso).getTime()) / 60_000) : null);
const fmtMil = (n: number) => (n >= 1000 ? (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1).replace('.', ',') + 'k' : String(Math.round(n)));

/* tick de 1 min: "venceu há Xh" avança sozinho, sem F5 */
function useAgora(intervalMs = 60_000) {
  const [t, setT] = useState(() => Date.now());
  useEffect(() => { const i = setInterval(() => setT(Date.now()), intervalMs); return () => clearInterval(i); }, [intervalMs]);
  return t;
}

/* ===== MOTOR DE PRIORIDADE (score 0-100, multi-fator, transparente) =====
   Não é só tempo: lead novíssimo e resposta recente valem MAIS que prazo,
   porque a chance de recuperar despenca com o esfriamento. Sinais reais
   (documento, "leu e sumiu") entram quando existem. */
interface Fator { pts: number; motivo: string }
function scoreFatores(lead: RmktLead, tarefa: RmktTarefa | null, sinais: RmktSinais | undefined, agora: number): { score: number; motivo: string; fatores: Fator[] } {
  const f: Fator[] = [];
  const vence = tarefa?.venceEm ?? lead.proximaAcaoEm;
  if (vence) {
    const ms = agora - new Date(vence).getTime();
    if (ms > 0) f.push({ pts: 50 + Math.min(20, Math.floor(ms / 3_600_000)), motivo: 'prazo vencido' });
    else if (urgenciaDe(vence, agora) === 'hoje') f.push({ pts: 30, motivo: 'vence hoje' });
    else if (urgenciaDe(vence, agora) === 'amanha') f.push({ pts: 15, motivo: 'vence amanhã' });
  }
  const idadeMin = minutosDesde(lead.criadoEm, agora);
  if (idadeMin !== null && idadeMin <= 10) f.push({ pts: 45, motivo: 'lead novíssimo (<10 min)' });
  const respMin = minutosDesde(lead.ultimaEntradaEm, agora);
  if (respMin !== null && respMin <= 60) f.push({ pts: 35, motivo: 'respondeu há pouco' });
  else if (respMin !== null && respMin <= 1_440) f.push({ pts: 18, motivo: 'respondeu nas últimas 24 h' });
  f.push({ pts: (3 - Math.min(lead.tentativas, 3)) * 6, motivo: 'poucas tentativas' });
  if (lead.etapa === 'recuperacao_3') f.push({ pts: 15, motivo: 'última chance antes de perder' });
  else if (lead.etapa === 'recuperacao_2') f.push({ pts: 10, motivo: 'recuperação avançada' });
  if (sinais?.docsRecebidos) f.push({ pts: 12, motivo: 'enviou documento' });
  const dias = diasSem(lead.ultimaEntradaEm, agora);
  if (dias !== null && dias > 5) f.push({ pts: -Math.min(dias, 20), motivo: 'abandono antigo' });
  const score = Math.max(0, Math.min(100, f.reduce((s, x) => s + x.pts, 0)));
  const top = f.filter((x) => x.pts > 0).sort((a, b) => b.pts - a.pts)[0];
  return { score, motivo: top?.motivo ?? 'sem urgência', fatores: f };
}
const corScore = (s: number): 's1' | 's2' | 's3' => (s >= 70 ? 's1' : s >= 40 ? 's2' : 's3');
const emojiScore = (s: number) => (s >= 70 ? '🔥' : s >= 40 ? '🟠' : '🟢');

/* verbo/emoji da ação — a fila fala a língua do atendente (nunca "Recuperar lead") */
function verboDe(titulo: string | null): { emoji: string; verbo: string } {
  const t = (titulo ?? '').toLowerCase();
  if (/liga/.test(t)) return { emoji: '📞', verbo: 'Ligar agora para' };
  if (/[áa]udio/.test(t)) return { emoji: '🎤', verbo: 'Enviar áudio para' };
  if (/document/.test(t)) return { emoji: '📄', verbo: 'Solicitar documentos de' };
  if (/confirm/.test(t)) return { emoji: '📋', verbo: 'Confirmar dados de' };
  if (/aguardar|acompanh/.test(t)) return { emoji: '⏳', verbo: 'Acompanhar' };
  if (/transfer/.test(t)) return { emoji: '🔄', verbo: 'Transferir' };
  return { emoji: '💬', verbo: 'Enviar WhatsApp para' };
}

/* ===== IA OPERACIONAL — heurísticas transparentes sobre dados reais =====
   Sem LLM (motor inerte, sem chave em prod). "Primeira verdadeira vence";
   toda frase cita o número que a justifica; sem amostra mínima, fica calada. */
interface Sugestao { texto: string; cta: 'executar' | 'ligar' | 'copiar' | 'reagendar' | null; porque: string }
function sugestoesDe(lead: RmktLead, resumo: RmktResumo | null | undefined, altoValor: boolean, agora: number): Sugestao[] {
  if (!resumo) return [];
  const out: Sugestao[] = [];
  const respMin = minutosDesde(resumo.ultimaEntradaEm, agora);
  if (respMin !== null && respMin <= 60)
    out.push({ texto: `Respondeu há ${respMin} min — janela quente. Responda AGORA, antes de esfriar.`, cta: 'executar', porque: `última entrada do cliente há ${respMin} min` });
  if (resumo.ultimaSaidaStatus === 'falhou') {
    if (resumo.telefonesExtras.length)
      out.push({ texto: `Sua última mensagem FALHOU. Tente o outro número do cliente (…${resumo.telefonesExtras[0].slice(-4)}).`, cta: 'copiar', porque: `status da última saída = falhou · ${resumo.telefonesExtras.length} número alternativo` });
    else
      out.push({ texto: `Sua última mensagem FALHOU no envio${resumo.erroEnvio ? ` (${resumo.erroEnvio})` : ''}. Verifique o canal antes de reenviar.`, cta: 'ligar', porque: 'status da última saída = falhou' });
  }
  if (resumo.naoLidas > 0)
    out.push({ texto: `${resumo.naoLidas} mensagem${resumo.naoLidas > 1 ? 's' : ''} do cliente sem leitura — abra a conversa antes de agir.`, cta: 'executar', porque: `conversas.nao_lidas = ${resumo.naoLidas}` });
  if (resumo.lidasPosEntrada >= 2)
    out.push({ texto: `Leu suas ${resumo.lidasPosEntrada} últimas mensagens e não respondeu — mais texto não resolve. 📞 Ligue.`, cta: 'ligar', porque: `${resumo.lidasPosEntrada} saídas marcadas 'lida' após a última resposta` });
  if (resumo.ultimaEntradaTipo === 'documento' || resumo.ultimaEntradaTipo === 'imagem')
    out.push({ texto: `Enviou um documento e ninguém respondeu — confirme o recebimento antes de cobrar retorno.`, cta: 'executar', porque: `última entrada é do tipo ${resumo.ultimaEntradaTipo}` });
  if (resumo.entradasAudio >= 3 && resumo.entradasTotal > 0 && resumo.entradasAudio / resumo.entradasTotal >= 0.3)
    out.push({ texto: `Responde por áudio (${resumo.entradasAudio} de ${resumo.entradasTotal} retornos). 🎤 Mande áudio, não texto.`, cta: null, porque: `${resumo.entradasAudio}/${resumo.entradasTotal} entradas são áudio` });
  if (resumo.modaHora !== null && resumo.modaHoraQtd >= 5) {
    const h = Number(new Intl.DateTimeFormat('pt-BR', { hour: 'numeric', hour12: false, timeZone: 'America/Sao_Paulo' }).format(agora)) % 24;
    const dist = Math.min((h - resumo.modaHora + 24) % 24, (resumo.modaHora - h + 24) % 24);
    const dentro = dist <= 1;
    out.push(dentro
      ? { texto: `Costuma responder por volta das ${resumo.modaHora}h (${resumo.modaHoraQtd} respostas) — agora é uma boa janela.`, cta: 'executar', porque: `pico de resposta às ${resumo.modaHora}h` }
      : { texto: `Costuma responder por volta das ${resumo.modaHora}h. Agora são ${h}h — considere reagendar.`, cta: 'reagendar', porque: `pico de resposta às ${resumo.modaHora}h, ${resumo.modaHoraQtd} respostas` });
  }
  if (lead.etapa === 'recuperacao_3' && lead.tentativas >= 3)
    out.push({ texto: `3ª tentativa na última etapa — a mensagem já não funcionou. Ligação, não texto.`, cta: 'ligar', porque: 'etapa recuperação 3 com 3+ tentativas' });
  if (altoValor)
    out.push({ texto: `Lead de alto valor pela carteira de benefícios — priorize a ligação.`, cta: 'ligar', porque: 'soma de benefícios entre as maiores da fila' });
  if (!out.length) out.push({ texto: `Sem padrão forte ainda — siga a próxima ação da cadência.`, cta: null, porque: 'amostra insuficiente para uma recomendação específica' });
  return out;
}

/* ---------- ícones ---------- */
const Ic = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{children}</svg>
);
const IcCheck = () => <Ic><path d="m5 13 4 4L19 7" /></Ic>;
const IcAlerta = () => <Ic><path d="M12 3 2.5 20h19z" /><path d="M12 10v4M12 17v.5" /></Ic>;
const IcMais = () => <Ic><circle cx="5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="19" cy="12" r="1.4" /></Ic>;

interface ItemFila { lead: RmktLead; tarefa: RmktTarefa | null; urg: Urgencia; score: number; tier: 's1' | 's2' | 's3'; motivo: string; fatores: Fator[]; sinais: RmktSinais | undefined }

export default function RemarketingV2() {
  const nav = useNavigate();
  const { currentOrg } = useOrg();
  const { user } = useAuth();
  const meId = user?.id ?? null;
  const agora = useAgora();
  const podeConfig = currentOrg.role === 'admin' || currentOrg.role === 'gestor';
  useRemarketingRealtime();

  const [aba, setAba] = useState<'ativo' | 'encerrados'>('ativo');
  const leadsQ = useRemarketingLeads(aba);
  const tarefasQ = useRemarketingTarefas();
  const configQ = useRemarketingConfig();
  const usuariosQ = useOrgUsuarios();
  const sinaisQ = useFilaSinais();

  const concluir = useConcluirTarefa();
  const transferir = useTransferirLead();
  const reagendar = useReagendarTarefa();
  const registrar = useRegistrarAcao();
  const mudarEtapa = useMudarEtapa();
  const observar = useObservacao();

  const [fResp, setFResp] = useState('todos');
  const [fFin, setFFin] = useState('todas');
  const [fEtapa, setFEtapa] = useState('todas');
  const [fDias, setFDias] = useState('todos');
  const [fOrigem, setFOrigem] = useState('todas');
  const [fUrg, setFUrg] = useState<'todas' | Urgencia>('todas');
  const [busca, setBusca] = useState('');
  const [detId, setDetId] = useState<string | null>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const [cfgAberta, setCfgAberta] = useState(false);
  const [eqAberta, setEqAberta] = useState(false);
  const [transfDe, setTransfDe] = useState<RmktLead | null>(null);
  const [etapaDe, setEtapaDe] = useState<RmktLead | null>(null);
  const [reagDe, setReagDe] = useState<RmktTarefa | null>(null);
  const [aviso, setAviso] = useState<{ tom: 'ok' | 'erro'; texto: string } | null>(null);
  const buscaRef = useRef<HTMLInputElement>(null);

  const prodQ = useProdutividade(eqAberta && podeConfig);
  const leads = leadsQ.data ?? [];
  const tarefas = tarefasQ.data ?? [];

  const tarefaPorLead = useMemo(() => new Map(tarefas.map((t) => [t.remarketingId, t])), [tarefas]);
  const sinaisPorLead = useMemo(() => new Map((sinaisQ.data ?? []).map((s) => [s.leadId, s])), [sinaisQ.data]);
  const financeiras = useMemo(() => [...new Set(leads.map((l) => l.instituicao).filter((x): x is string => !!x))].sort(), [leads]);
  const origens = useMemo(() => [...new Set(leads.map((l) => l.origem).filter((x): x is string => !!x))].sort(), [leads]);

  /* todos os itens pontuados (sem filtro) — base do herói e do limiar de alto valor */
  const itens = useMemo<ItemFila[]>(() => leads.map((lead) => {
    const tarefa = tarefaPorLead.get(lead.id) ?? null;
    const sinais = sinaisPorLead.get(lead.id);
    const { score, motivo, fatores } = scoreFatores(lead, tarefa, sinais, agora);
    return { lead, tarefa, urg: urgenciaDe(tarefa?.venceEm ?? lead.proximaAcaoEm, agora), score, tier: corScore(score), motivo, fatores, sinais };
  }), [leads, tarefaPorLead, sinaisPorLead, agora]);

  /* limiar de "alto valor" = p75 da soma de benefícios entre quem tem ficha */
  const altoValorMin = useMemo(() => {
    const vs = itens.map((i) => i.sinais?.benefTotal ?? 0).filter((v) => v > 0).sort((a, b) => a - b);
    if (vs.length < 4) return Infinity;
    return vs[Math.floor(vs.length * 0.75)];
  }, [itens]);

  /* FILA SOBERANA: uma lista única por SCORE desc (vencidas sobem sozinhas). */
  const fila = useMemo<ItemFila[]>(() => itens.filter(({ lead, urg }) => {
    if (fResp === 'fila' && lead.responsavelId) return false;
    if (fResp !== 'todos' && fResp !== 'fila' && lead.responsavelId !== fResp) return false;
    if (fFin !== 'todas' && (lead.instituicao ?? '') !== fFin) return false;
    if (fEtapa !== 'todas' && lead.etapa !== fEtapa) return false;
    if (fOrigem !== 'todas' && (lead.origem ?? '') !== fOrigem) return false;
    if (fUrg !== 'todas' && urg !== fUrg) return false;
    if (fDias !== 'todos') { const d = diasSem(lead.ultimaEntradaEm, agora) ?? 999; if (d < Number(fDias)) return false; }
    if (busca.trim()) {
      const q = busca.trim().toLowerCase(); const dig = q.replace(/\D+/g, '');
      if (!lead.contatoNome.toLowerCase().includes(q) && !(dig && (lead.contatoTelefone ?? '').includes(dig))) return false;
    }
    return true;
  }).sort((a, b) => (aba === 'encerrados'
    ? new Date(b.lead.encerradoEm ?? b.lead.criadoEm).getTime() - new Date(a.lead.encerradoEm ?? a.lead.criadoEm).getTime()
    : b.score - a.score)),
  [itens, fResp, fFin, fEtapa, fOrigem, fUrg, fDias, busca, agora, aba]);

  /* HERÓI = a ação mais urgente que EU posso pegar agora (minha ou sem dono);
     se eu não tenho nenhuma acessível, cai para o topo global. */
  const heroItem = useMemo(() => {
    if (aba !== 'ativo') return null;
    const comTarefa = itens.filter((i) => i.tarefa && i.lead.status === 'ativo').sort((a, b) => b.score - a.score);
    return comTarefa.find((i) => i.lead.responsavelId === meId || !i.lead.responsavelId)
      ?? comTarefa[0] ?? null;
  }, [itens, meId, aba]);

  const contVencidas = useMemo(() => itens.filter((i) => i.urg === 'vencida').length, [itens]);
  const contHoje = useMemo(() => itens.filter((i) => i.urg === 'hoje').length, [itens]);
  const contFila = useMemo(() => itens.filter((i) => !i.lead.responsavelId).length, [itens]);

  const detLead = detId ? leads.find((l) => l.id === detId) ?? null : null;
  const filtrando = fResp !== 'todos' || fFin !== 'todas' || fEtapa !== 'todas' || fOrigem !== 'todas' || fDias !== 'todos' || fUrg !== 'todas' || !!busca.trim();
  const limparFiltros = () => { setFResp('todos'); setFFin('todas'); setFEtapa('todas'); setFOrigem('todas'); setFDias('todos'); setFUrg('todas'); setBusca(''); };

  /* seleção sempre válida (herói do teclado) */
  useEffect(() => {
    if (aba !== 'ativo') { setSelId(null); return; }
    if (!fila.length) { setSelId(null); return; }
    if (!selId || !fila.some((i) => i.lead.id === selId)) setSelId(fila[0].lead.id);
  }, [fila, aba, selId]);

  const acao = (fn: () => void, okMsg: string) => {
    if (!REMARKETING_REAL) { setAviso({ tom: 'ok', texto: `Modo demonstração: ${okMsg.toLowerCase()}` }); return; }
    fn();
  };
  const aoErro = (e: unknown) => setAviso({ tom: 'erro', texto: (e as Error)?.message || 'Falha na ação.' });
  const concluirTarefa = (t: RmktTarefa) =>
    acao(() => concluir.mutate(t.id, { onSuccess: () => setAviso({ tom: 'ok', texto: 'Feito — a próxima já subiu na fila.' }), onError: aoErro }), 'Tarefa concluída');
  const executar = (lead: RmktLead) => { if (lead.conversaId) nav('/whatsapp?conversa=' + lead.conversaId); };
  const registrarAcao = (leadId: string, tipo: 'ligacao' | 'audio' | 'whatsapp', okMsg: string) =>
    acao(() => registrar.mutate({ leadId, acao: tipo }, { onSuccess: () => setAviso({ tom: 'ok', texto: okMsg }), onError: aoErro }), okMsg);

  /* ===== teclado: ↑↓/J K navega · Enter executa · C conclui · D drawer · / busca · Esc fecha ===== */
  useEffect(() => {
    if (aba !== 'ativo') return;
    const onKey = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      if (alvo && /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName)) {
        if (e.key === 'Escape') (alvo as HTMLInputElement).blur();
        return;
      }
      if (e.key === '/') { e.preventDefault(); buscaRef.current?.focus(); return; }
      if (e.key === 'Escape') { if (detId) setDetId(null); return; }
      if (!fila.length) return;
      const idx = fila.findIndex((i) => i.lead.id === selId);
      const cur = idx >= 0 ? fila[idx] : fila[0];
      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault(); const n = fila[Math.min(fila.length - 1, (idx < 0 ? 0 : idx + 1))];
        setSelId(n.lead.id); if (detId) setDetId(n.lead.id);
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault(); const n = fila[Math.max(0, (idx < 0 ? 0 : idx - 1))];
        setSelId(n.lead.id); if (detId) setDetId(n.lead.id);
      } else if (e.key === 'Enter') {
        e.preventDefault(); executar(cur.lead);
      } else if (e.key === 'c' || e.key === 'C') {
        if (cur.tarefa) { e.preventDefault(); concluirTarefa(cur.tarefa); }
      } else if (e.key === 'd' || e.key === 'D') {
        e.preventDefault(); setDetId(detId === cur.lead.id ? null : cur.lead.id); setSelId(cur.lead.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fila, selId, detId, aba]); // eslint-disable-line react-hooks/exhaustive-deps

  const carregando = leadsQ.isLoading || tarefasQ.isLoading;

  return (
    <div className="rmc">
      {/* ---------- R1 cabeçalho magro ---------- */}
      <header className="rmc-top">
        <div className="tt">
          <h2>Central de Operações</h2>
          <span>Recuperação de leads — o sistema dita a próxima ação.{REMARKETING_REAL ? '' : ' · demonstração (nada é gravado)'}</span>
        </div>
        <div className="rmc-top-acts">
          {contVencidas > 0 && <span className="rmc-alerta" title="Tarefas vencidas"><IcAlerta /> {contVencidas} vencida{contVencidas > 1 ? 's' : ''}</span>}
          {podeConfig && <BotaoSec mini onClick={() => setEqAberta(true)}>Equipe</BotaoSec>}
          {podeConfig && <BotaoSec mini onClick={() => setCfgAberta(true)}>Configurar</BotaoSec>}
        </div>
      </header>

      {aviso && (
        <div className={aviso.tom === 'erro' ? 'aviso-inline erro' : 'aviso-inline'} role="status">
          {aviso.texto}<button type="button" onClick={() => setAviso(null)} aria-label="Fechar aviso">×</button>
        </div>
      )}
      {configQ.data && !configQ.data.ativo && (
        <div className="aviso-inline rmk-inerte" role="status">
          Motor <b>desligado</b> — nenhuma etapa muda sozinha ainda. A ativação é a fase 3, acompanhada.
        </div>
      )}

      {/* ---------- R2 herói: a PRÓXIMA ação ---------- */}
      {aba === 'ativo' && (
        <HeroProxima
          item={heroItem} agora={agora} carregando={carregando}
          altoValor={(heroItem?.sinais?.benefTotal ?? 0) >= altoValorMin}
          semDono={contFila}
          aoExecutar={(l) => executar(l)}
          aoConcluir={(t) => concluirTarefa(t)}
          aoAbrir={(id) => { setDetId(id); setSelId(id); }}
          concluindo={concluir.isPending}
        />
      )}

      {/* ---------- R3 régua de controle ---------- */}
      <div className="rmc-rail">
        <div className="rmc-seg" role="group" aria-label="Responsável">
          {([['todos', 'Todos'], ['meus', 'Meus'], ['fila', 'Sem dono']] as const).map(([v, rot]) => {
            const val = v === 'meus' ? (meId ?? '__me__') : v;
            const on = v === 'meus' ? fResp === meId : fResp === v;
            return <button key={v} type="button" className={'rmc-seg-b' + (on ? ' on' : '')} onClick={() => setFResp(val)}>{rot}{v === 'fila' && contFila > 0 ? ` ${contFila}` : ''}</button>;
          })}
        </div>
        <button type="button" className={'rmc-chip u-vencida' + (fUrg === 'vencida' ? ' on' : '')} onClick={() => setFUrg(fUrg === 'vencida' ? 'todas' : 'vencida')}>
          <i />Vencidas <b className="num">{contVencidas}</b>
        </button>
        <button type="button" className={'rmc-chip u-hoje' + (fUrg === 'hoje' ? ' on' : '')} onClick={() => setFUrg(fUrg === 'hoje' ? 'todas' : 'hoje')}>
          <i />Hoje <b className="num">{contHoje}</b>
        </button>
        <select className="inp rmq-sel" value={fUrg} onChange={(e) => setFUrg(e.target.value as 'todas' | Urgencia)} aria-label="Urgência">
          {URG_SEL.map((u) => <option key={u.v} value={u.v}>{u.r}</option>)}
        </select>
        <div className="rmc-rail-sep" />
        <select className="inp rmq-sel" value={fEtapa} onChange={(e) => setFEtapa(e.target.value)} aria-label="Etapa">
          <option value="todas">Etapa: todas</option>
          {Object.entries(ETAPA_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="inp rmq-sel" value={fFin} onChange={(e) => setFFin(e.target.value)} aria-label="Financeira">
          <option value="todas">Financeira: todas</option>
          {financeiras.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <select className="inp rmq-sel" value={fDias} onChange={(e) => setFDias(e.target.value)} aria-label="Dias sem resposta">
          <option value="todos">Sem resposta: qualquer</option>
          <option value="2">2+ dias</option><option value="5">5+ dias</option><option value="10">10+ dias</option>
        </select>
        {podeConfig && (
          <select className="inp rmq-sel" value={fResp === 'todos' || fResp === 'fila' || fResp === meId ? '' : fResp} onChange={(e) => setFResp(e.target.value || 'todos')} aria-label="Filtrar por atendente">
            <option value="">Atendente…</option>
            {(usuariosQ.data ?? []).map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select>
        )}
        {origens.length > 1 && (
          <select className="inp rmq-sel" value={fOrigem} onChange={(e) => setFOrigem(e.target.value)} aria-label="Origem">
            <option value="todas">Origem: todas</option>
            {origens.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        )}
        <input ref={buscaRef} className="inp rmc-busca" placeholder="Buscar nome ou telefone   /" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar nome ou telefone" />
        {filtrando && <button type="button" className="rmc-chip limpar" onClick={limparFiltros}>Limpar</button>}
        <button type="button" className={'rmc-chip fim' + (aba === 'encerrados' ? ' on' : '')} onClick={() => setAba(aba === 'ativo' ? 'encerrados' : 'ativo')}>
          {aba === 'ativo' ? 'Encerrados' : '← Voltar à fila'}
        </button>
      </div>

      {/* ---------- R4 fila soberana ---------- */}
      <div className="rmc-fila">
        {leadsQ.isError ? (
          <CardVidro sobe><EstadoErro descricao="Erro ao carregar a fila." aoTentarDeNovo={() => leadsQ.refetch()} /></CardVidro>
        ) : carregando ? (
          <div className="rmc-skel" aria-hidden>{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} largura="100%" altura={54} raio={12} />)}</div>
        ) : fila.length === 0 ? (
          <CardVidro sobe><EstadoVazio
            titulo={aba === 'encerrados' ? 'Nada encerrado ainda' : filtrando ? 'Nenhum lead com esses filtros' : 'Fila limpa'}
            descricao={aba === 'encerrados' ? 'Recuperados e perdidos aparecem aqui.' : filtrando ? 'Ajuste os filtros para ver mais.' : 'Nenhum lead aguardando ação agora.'}
            acao={filtrando ? { rotulo: 'Limpar filtros', onClick: limparFiltros } : undefined}
          /></CardVidro>
        ) : (
          <div className="rmc-rows" role="list">
            {fila.map((it) => (
              <LinhaFila
                key={it.lead.id} it={it} agora={agora} aba={aba}
                selecionada={selId === it.lead.id}
                aoSelecionar={() => { setSelId(it.lead.id); setDetId(it.lead.id); }}
                aoExecutar={() => executar(it.lead)}
                aoConcluir={() => it.tarefa && concluirTarefa(it.tarefa)}
                concluindo={concluir.isPending}
                aoMenu={() => { setSelId(it.lead.id); setDetId(it.lead.id); }}
              />
            ))}
          </div>
        )}
      </div>

      {/* ---------- painel lateral (HubSpot-like), segue a seleção ---------- */}
      <DrawerV2 aberto={!!detLead} aoFechar={() => setDetId(null)} largura={480}>
        {detLead && (
          <LeadPainel
            key={detLead.id}
            lead={detLead} agora={agora}
            fatores={itens.find((i) => i.lead.id === detLead.id)?.fatores ?? []}
            score={itens.find((i) => i.lead.id === detLead.id)?.score ?? 0}
            tarefa={tarefaPorLead.get(detLead.id) ?? null}
            altoValor={(sinaisPorLead.get(detLead.id)?.benefTotal ?? 0) >= altoValorMin}
            aoFechar={() => setDetId(null)}
            aoAbrirConversa={(c) => nav('/whatsapp?conversa=' + c)}
            aoConcluir={(t) => concluirTarefa(t)}
            aoTransferir={() => setTransfDe(detLead)}
            aoMudarEtapa={() => setEtapaDe(detLead)}
            aoReagendar={(t) => setReagDe(t)}
            aoRegistrar={registrarAcao}
            aoObservar={(texto, done) => acao(() => observar.mutate({ leadId: detLead.id, texto }, {
              onSuccess: () => { done(); setAviso({ tom: 'ok', texto: 'Observação registrada.' }); }, onError: aoErro,
            }), 'Observação registrada')}
          />
        )}
      </DrawerV2>

      {/* ---------- transferir ---------- */}
      {transfDe && (
        <ModalV2 aberto aoFechar={() => setTransfDe(null)} titulo={'Transferir ' + transfDe.contatoNome} largura={400}>
          <p className="p-modal-msg">O novo responsável recebe a tarefa pendente e uma notificação. Conversa, Kanban e o resto seguem juntos.</p>
          <div className="rmq-transf">
            {(usuariosQ.data ?? []).filter((u) => u.id !== transfDe.responsavelId).map((u) => (
              <button key={u.id} type="button" className="rmq-transf-item" disabled={transferir.isPending}
                onClick={() => acao(() => transferir.mutate({ leadId: transfDe.id, usuarioId: u.id }, {
                  onSuccess: () => { setTransfDe(null); setAviso({ tom: 'ok', texto: `Transferido para ${u.nome}.` }); }, onError: aoErro,
                }), `Transferido para ${u.nome}`)}>
                <span className="rmk-av" aria-hidden>{initials(u.nome)}</span>{u.nome}
              </button>
            ))}
          </div>
        </ModalV2>
      )}

      {etapaDe && (
        <EtapaModal lead={etapaDe} aoFechar={() => setEtapaDe(null)}
          aoConfirmar={(etapa) => acao(() => mudarEtapa.mutate({ leadId: etapaDe.id, etapa }, {
            onSuccess: () => { setEtapaDe(null); setAviso({ tom: 'ok', texto: 'Etapa alterada — nova tarefa criada.' }); }, onError: aoErro,
          }), 'Etapa alterada')} />
      )}

      {reagDe && (
        <ReagendarModal tarefa={reagDe} aoFechar={() => setReagDe(null)}
          aoConfirmar={(quandoISO) => acao(() => reagendar.mutate({ tarefaId: reagDe.id, quando: quandoISO }, {
            onSuccess: () => { setReagDe(null); setAviso({ tom: 'ok', texto: 'Prazo reagendado.' }); }, onError: aoErro,
          }), 'Prazo reagendado')} />
      )}

      {eqAberta && (
        <ModalV2 aberto aoFechar={() => setEqAberta(false)} titulo="Produtividade da equipe" largura={560}>
          {prodQ.isLoading ? (
            <div className="rmq-skel"><Skeleton largura="100%" altura={30} /><Skeleton largura="100%" altura={30} /></div>
          ) : (prodQ.data ?? []).length === 0 ? (
            <div className="rmk-mudo">Sem dados ainda.</div>
          ) : (
            <div className="rme-tab" role="table" aria-label="Produtividade por atendente">
              <div className="rme-linha cab" role="row">
                <span>Atendente</span><span>Tarefas</span><span>Vencidas</span><span>Hoje ✓</span><span title="Recuperados nos últimos 30 dias">Recup.</span><span title="Tempo médio até concluir a tarefa (30 d)">T. resposta</span><span title="Tempo médio até recuperar o lead (30 d)">T. recup.</span>
              </div>
              {(prodQ.data ?? []).map((p) => (
                <div className="rme-linha" role="row" key={p.id}>
                  <span className="rme-nome"><span className="rmk-av" aria-hidden>{initials(p.nome)}</span>{p.nome}</span>
                  <span className="num">{p.tarefas}</span>
                  <span className={'num' + (p.vencidas > 0 ? ' rme-urg' : '')}>{p.vencidas}</span>
                  <span className="num">{p.concluidas_hoje}</span>
                  <span className="num">{p.recuperados_30d}</span>
                  <span className="num">{p.tempo_medio_conclusao_h != null ? `${p.tempo_medio_conclusao_h} h` : '—'}</span>
                  <span className="num">{p.tempo_medio_recuperacao_h != null ? `${p.tempo_medio_recuperacao_h} h` : '—'}</span>
                </div>
              ))}
            </div>
          )}
        </ModalV2>
      )}

      {cfgAberta && configQ.data && (
        <ConfigModal inicial={configQ.data}
          usuarios={(usuariosQ.data ?? []).map((u) => ({ id: u.id, nome: u.nome }))}
          demo={!REMARKETING_REAL} aoFechar={() => setCfgAberta(false)}
          aoSalvo={(ok) => { setCfgAberta(false); setAviso(ok ? { tom: 'ok', texto: 'Configuração salva.' } : { tom: 'erro', texto: 'Falha ao salvar a configuração.' }); }} />
      )}
    </div>
  );
}

/* ================= herói: a PRÓXIMA ação ================= */
function HeroProxima({ item, agora, carregando, altoValor, semDono, aoExecutar, aoConcluir, aoAbrir, concluindo }: {
  item: ItemFila | null; agora: number; carregando: boolean; altoValor: boolean; semDono: number;
  aoExecutar: (l: RmktLead) => void; aoConcluir: (t: RmktTarefa) => void; aoAbrir: (id: string) => void; concluindo: boolean;
}) {
  const resumoQ = useConversaResumo(item?.lead.conversaId ?? null, item?.lead.contatoId ?? null, !!item);
  if (carregando) {
    return <section className="rmc-hero vidro spot"><div className="rmc-hero-skel"><Skeleton largura={54} altura={54} raio={12} /><div style={{ flex: 1 }}><Skeleton largura="40%" altura={18} /><Skeleton largura="70%" altura={22} /></div></div></section>;
  }
  if (!item || !item.tarefa) {
    return (
      <section className="rmc-hero vidro spot vazio">
        <div className="rmc-hero-vazio"><b>🎉 Fila limpa</b><span>Nenhuma ação imediata para você agora.{semDono > 0 ? ` ${semDono} lead${semDono > 1 ? 's' : ''} sem dono na fila.` : ''}</span></div>
      </section>
    );
  }
  const { lead, tarefa, urg, score, motivo } = item;
  const v = verboDe(tarefa.titulo);
  const sug = sugestoesDe(lead, resumoQ.data, altoValor, agora)[0];
  const venceTxt = tarefa.venceEm ? (urg === 'vencida' ? 'venceu ' + tempoRelativo(tarefa.venceEm, agora) : 'vence ' + tempoRelativo(tarefa.venceEm, agora)) : '';
  return (
    <section className={'rmc-hero vidro spot u-' + urg} aria-label="Próxima ação">
      <span className="rmc-hero-tag">Próxima</span>
      <span className={'rmc-score ' + corScore(score)} title={`score ${score} · ${motivo}`}><b className="num">{score}</b></span>
      <button type="button" className="rmc-hero-quem" onClick={() => aoAbrir(lead.id)}>
        <span className="rmk-av g" aria-hidden>{initials(lead.contatoNome)}</span>
        <span className="tx">
          <span className="nm">{lead.contatoNome}{urg === 'vencida' && <span className="rmc-atrasado"><IcAlerta /> ATRASADO</span>}</span>
          <span className="verbo">{v.emoji} {v.verbo} {lead.contatoNome.split(' ')[0]}</span>
        </span>
      </button>
      <div className="rmc-hero-mid">
        {sug && <div className="rmc-hero-ia">✦ {sug.texto}</div>}
        {venceTxt && <div className={'rmc-hero-prazo u-' + urg}>{venceTxt}</div>}
      </div>
      <div className="rmc-hero-acts">
        {lead.conversaId && <BotaoPrimario onClick={() => aoExecutar(lead)}>Executar ↵</BotaoPrimario>}
        <BotaoSec disabled={concluindo} onClick={() => aoConcluir(tarefa)}>Concluir ✓</BotaoSec>
      </div>
    </section>
  );
}

/* ================= uma linha da fila ================= */
function LinhaFila({ it, agora, aba, selecionada, aoSelecionar, aoExecutar, aoConcluir, concluindo, aoMenu }: {
  it: ItemFila; agora: number; aba: 'ativo' | 'encerrados'; selecionada: boolean;
  aoSelecionar: () => void; aoExecutar: () => void; aoConcluir: () => void; concluindo: boolean; aoMenu: () => void;
}) {
  const { lead, tarefa, urg, score, tier, motivo, sinais } = it;
  const d = diasSem(lead.ultimaEntradaEm, agora);
  const respMin = minutosDesde(lead.ultimaEntradaEm, agora);
  const vence = tarefa?.venceEm ?? lead.proximaAcaoEm;
  const v = verboDe(tarefa?.titulo ?? null);
  const encerrada = aba === 'encerrados';
  return (
    <div className={'rmc-row u-' + (encerrada ? 'fim' : urg) + (selecionada ? ' sel' : '')} role="listitem" tabIndex={0}
      onClick={aoSelecionar} onKeyDown={(e) => { if (e.key === 'Enter') aoSelecionar(); }}>
      {/* score */}
      <span className={'rmc-c-score ' + tier} title={`score ${score} · ${motivo}`}><b className="num">{score}</b><i /></span>
      {/* quem */}
      <span className="rmc-c-quem">
        <span className="rmk-av" aria-hidden>{initials(lead.contatoNome)}</span>
        <span className="tx">
          <span className="nm">{lead.contatoNome}{!encerrada && urg === 'vencida' && vence && <span className="rmc-badge-atr">ATRASADO {tempoRelativo(vence, agora)}</span>}</span>
          <span className="tel num">{lead.contatoTelefone ? '+' + lead.contatoTelefone : 'sem número'}</span>
        </span>
      </span>
      {/* negócio */}
      <span className="rmc-c-neg">
        <span className="l1">{lead.instituicao ?? (sinais?.contratos ? '—' : '')}</span>
        {sinais && sinais.contratos > 0 && <span className="l2 num">⚖️ {sinais.contratos} · benef. R$ {fmtMil(sinais.benefTotal)}/mês</span>}
      </span>
      {/* conversa */}
      <span className="rmc-c-conv">
        <span className={'l1' + (respMin !== null && respMin <= 60 ? ' quente' : d !== null && d > 5 ? ' frio' : '')}>
          {respMin !== null && respMin <= 60 ? `respondeu há ${respMin} min` : d === null ? '—' : d === 0 ? 'respondeu hoje' : `sem resposta há ${d}d`}
        </span>
        {sinais && (
          <span className="l2 sinais">
            {sinais.saidasTexto > 0 && <span title="Mensagens enviadas">💬{sinais.saidasTexto}</span>}
            {sinais.saidasAudio > 0 && <span title="Áudios enviados">🎤{sinais.saidasAudio}</span>}
            {sinais.ligacoes > 0 && <span title="Ligações registradas">📞{sinais.ligacoes}</span>}
            {sinais.docsRecebidos > 0 && <span className="ok" title="Documento recebido">📄✓</span>}
            {sinais.ultimaSaidaStatus === 'lida' && <span className="ok" title="Cliente visualizou a última mensagem">✓✓</span>}
            {sinais.ultimaSaidaStatus === 'falhou' && <span className="crit" title="Falha no último envio">⚠ envio</span>}
          </span>
        )}
      </span>
      {/* tentativas / dono */}
      <span className="rmc-c-dono">
        <span className="num tent">{lead.tentativas === 0 ? 'nova' : `${lead.tentativas}ª tent.`}</span>
        <span className="dono">{lead.responsavelNome
          ? <span className="rmk-av mini" title={lead.responsavelNome} aria-hidden>{initials(lead.responsavelNome)}</span>
          : <i className="fila">fila</i>}
          <em className="etp">{encerrada ? (STATUS_LABEL[lead.status] ?? lead.status) : (ETAPA_LABEL[lead.etapa] ?? lead.etapa)}</em>
        </span>
      </span>
      {/* ação */}
      <span className="rmc-c-acao">
        {!encerrada && (
          <button type="button" className="rmc-verbo" onClick={(e) => { e.stopPropagation(); aoExecutar(); }} disabled={!lead.conversaId} title={lead.conversaId ? 'Abrir a conversa' : 'Sem conversa vinculada'}>
            {v.emoji} {v.verbo.replace(/ para$| de$/, '')}
          </button>
        )}
        {vence && !encerrada && <span className={'rmc-prazo u-' + urg}>{urg === 'vencida' ? 'venceu ' + tempoRelativo(vence, agora) : tempoRelativo(vence, agora)}</span>}
      </span>
      {/* fecho */}
      <span className="rmc-c-fecho" onClick={(e) => e.stopPropagation()}>
        {tarefa && !encerrada && (
          <button type="button" className="rmc-qa go" title="Concluir tarefa (C)" disabled={concluindo} onClick={aoConcluir}><IcCheck /></button>
        )}
        <button type="button" className="rmc-qa" title="Abrir painel" onClick={aoMenu}><IcMais /></button>
      </span>
    </div>
  );
}

/* ================= reagendar ================= */
function ReagendarModal({ tarefa, aoFechar, aoConfirmar }: { tarefa: RmktTarefa; aoFechar: () => void; aoConfirmar: (iso: string) => void }) {
  const base = tarefa.venceEm ? new Date(tarefa.venceEm) : new Date(Date.now() + 86_400_000);
  const local = new Date(base.getTime() - base.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  const [quando, setQuando] = useState(local);
  return (
    <ModalV2 aberto aoFechar={aoFechar} titulo="Reagendar prazo" largura={380}
      rodape={<>
        <BotaoSec mini onClick={aoFechar}>Voltar</BotaoSec>
        <BotaoPrimario mini disabled={!quando} onClick={() => aoConfirmar(new Date(quando).toISOString())}>Reagendar</BotaoPrimario>
      </>}>
      <p className="p-modal-msg">{tarefa.titulo} — {tarefa.contatoNome}</p>
      <input className="inp" type="datetime-local" value={quando} onChange={(e) => setQuando(e.target.value)} aria-label="Novo prazo" />
    </ModalV2>
  );
}

/* ================= alterar etapa ================= */
function EtapaModal({ lead, aoFechar, aoConfirmar }: { lead: RmktLead; aoFechar: () => void; aoConfirmar: (etapa: RmktEtapa) => void }) {
  const [etapa, setEtapa] = useState<RmktEtapa>(lead.etapa);
  return (
    <ModalV2 aberto aoFechar={aoFechar} titulo={'Alterar etapa — ' + lead.contatoNome} largura={380}
      rodape={<>
        <BotaoSec mini onClick={aoFechar}>Voltar</BotaoSec>
        <BotaoPrimario mini disabled={etapa === lead.etapa} onClick={() => aoConfirmar(etapa)}>Alterar</BotaoPrimario>
      </>}>
      <p className="p-modal-msg">A tarefa pendente é substituída pela tarefa da nova etapa. O histórico registra a mudança com o seu nome.</p>
      <select className="inp" value={etapa} onChange={(e) => setEtapa(e.target.value as RmktEtapa)} aria-label="Nova etapa">
        {Object.entries(ETAPA_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
    </ModalV2>
  );
}

/* ================= painel lateral do lead (HubSpot-like) ================= */
function LeadPainel({ lead, agora, fatores, score, tarefa, altoValor, aoFechar, aoAbrirConversa, aoConcluir, aoTransferir, aoMudarEtapa, aoReagendar, aoRegistrar, aoObservar }: {
  lead: RmktLead; agora: number; fatores: Fator[]; score: number; tarefa: RmktTarefa | null; altoValor: boolean;
  aoFechar: () => void; aoAbrirConversa: (conversaId: string) => void; aoConcluir: (t: RmktTarefa) => void;
  aoTransferir: () => void; aoMudarEtapa: () => void; aoReagendar: (t: RmktTarefa) => void;
  aoRegistrar: (leadId: string, tipo: 'ligacao' | 'audio' | 'whatsapp', okMsg: string) => void;
  aoObservar: (texto: string, aoOk: () => void) => void;
}) {
  const eventosQ = useRemarketingEventos(lead.id);
  const resumoQ = useConversaResumo(lead.conversaId, lead.contatoId, true);
  const msgsQ = useWaMensagens(lead.conversaId);
  const [obs, setObs] = useState('');
  const [obsAberta, setObsAberta] = useState(false);
  const [porqueScore, setPorqueScore] = useState(false);
  const [porqueIa, setPorqueIa] = useState(false);
  const d = diasSem(lead.ultimaEntradaEm, agora);
  const resumo = resumoQ.data;
  const sug = sugestoesDe(lead, resumo, altoValor, agora);
  const contratos = resumo?.contratosLista ?? [];
  const benefTotal = contratos.reduce((s, c) => s + (c.valor ?? 0), 0);

  const timeline = useMemo(() => {
    type T = { id: string; quando: string; titulo: string; sub?: string; crit?: boolean; ok?: boolean };
    const evs: T[] = (eventosQ.data ?? []).map((e) => ({
      id: 'e' + e.id, quando: e.criadoEm, titulo: EVENTO_LABEL[e.tipo] ?? e.tipo,
      sub: typeof e.detalhe?.texto === 'string' ? String(e.detalhe.texto)
        : typeof e.detalhe?.de === 'string' && typeof e.detalhe?.para === 'string' ? `${ETAPA_LABEL[e.detalhe.de as string] ?? e.detalhe.de} → ${ETAPA_LABEL[e.detalhe.para as string] ?? e.detalhe.para}`
        : typeof e.detalhe?.titulo === 'string' ? String(e.detalhe.titulo) : undefined,
      crit: e.tipo === 'perdido' || e.tipo === 'sla_estourado', ok: e.tipo === 'recuperado' || e.tipo === 'respondeu',
    }));
    // mídia real da conversa (mensagens) — enriquece a timeline sem tabela vazia
    const msgs: T[] = (msgsQ.data ?? []).slice(-24).map((m) => {
      const quem = m.dir === 'in' ? 'Cliente' : 'Você';
      const rot = m.tipo === 'audio' ? `${quem}: áudio 🎤` : m.tipo === 'documento' ? `${quem}: documento 📄` : m.tipo === 'imagem' ? `${quem}: imagem 🖼️` : m.tipo === 'video' ? `${quem}: vídeo` : `${quem}: mensagem`;
      return { id: 'm' + m.id, quando: m.tsISO ?? m.dataISO ?? '', titulo: rot,
        sub: m.dir === 'out' && m.status === 'lida' ? 'visualizada ✓✓' : m.dir === 'out' && m.status === 'falhou' ? 'falha no envio ⚠' : undefined,
        ok: m.dir === 'in', crit: m.status === 'falhou' };
    }).filter((m) => m.quando);
    return [...evs, ...msgs].sort((x, y) => new Date(y.quando).getTime() - new Date(x.quando).getTime()).slice(0, 60);
  }, [eventosQ.data, msgsQ.data]);

  return (
    <div className="rmp">
      {/* 1. identidade */}
      <div className="rmp-id">
        <span className="rmk-av g" aria-hidden>{initials(lead.contatoNome)}</span>
        <div className="tx">
          <div className="nm">{lead.contatoNome}</div>
          <div className="sb num">{lead.contatoTelefone ? '+' + lead.contatoTelefone : 'sem número'}
            {(resumo?.telefonesExtras ?? []).map((t) => <span key={t} className="rmp-tel-x num">＋ …{t.slice(-4)}</span>)}
          </div>
        </div>
        <button type="button" className={'rmp-score ' + corScore(score)} onClick={() => setPorqueScore((v) => !v)} title="Ver como o score é calculado">
          {emojiScore(score)} <b className="num">{score}</b>
        </button>
        <button type="button" className="rmp-x" onClick={aoFechar} aria-label="Fechar">×</button>
      </div>
      {porqueScore && (
        <div className="rmp-porque">
          {fatores.filter((f) => f.pts !== 0).sort((a, b) => b.pts - a.pts).map((f, i) => (
            <span key={i}>{f.motivo} <b className={'num ' + (f.pts > 0 ? 'p' : 'n')}>{f.pts > 0 ? '+' : ''}{f.pts}</b></span>
          ))}
        </div>
      )}

      {/* 2. próxima ação */}
      {lead.status === 'ativo' && (
        <div className={'rmp-prox u-' + urgenciaDe(tarefa?.venceEm ?? lead.proximaAcaoEm, agora)}>
          <div className="k">Próxima ação</div>
          <div className="v">{tarefa ? `${verboDe(tarefa.titulo).emoji} ${tarefa.titulo}` : lead.proximaAcao ?? '—'}</div>
          {(tarefa?.venceEm ?? lead.proximaAcaoEm) && <div className="s num">prazo {tempoRelativo((tarefa?.venceEm ?? lead.proximaAcaoEm)!, agora)}</div>}
          {tarefa?.instrucoes && <div className="ins">{tarefa.instrucoes}</div>}
          {tarefa?.sugestaoMensagem && (
            <div className="rmp-msg">
              <pre>{tarefa.sugestaoMensagem}</pre>
              <BotaoMini onClick={async () => { try { await navigator.clipboard.writeText(tarefa.sugestaoMensagem!); } catch { /* noop */ } }}>Copiar</BotaoMini>
            </div>
          )}
          <div className="rmp-prox-acts">
            {lead.conversaId && <BotaoSec mini onClick={() => aoAbrirConversa(lead.conversaId!)}>Abrir conversa</BotaoSec>}
            {tarefa && <BotaoSec mini onClick={() => aoConcluir(tarefa)}>Concluir ✓</BotaoSec>}
            {tarefa && <BotaoMini onClick={() => aoReagendar(tarefa)}>Reagendar</BotaoMini>}
          </div>
        </div>
      )}

      {/* 3. sugestão da IA */}
      {sug.length > 0 && lead.status === 'ativo' && (
        <div className="rmp-ia">
          <div className="cab">✦ Sugestão da IA {sug.length > 1 && <span className="q">· {sug.length}</span>}
            <button type="button" className="pq" onClick={() => setPorqueIa((v) => !v)}>por quê?</button>
          </div>
          {sug.slice(0, 3).map((s, i) => (
            <div key={i} className="item">
              <p>{s.texto}</p>
              {porqueIa && <span className="base">{s.porque}</span>}
              {s.cta === 'ligar' && <BotaoMini onClick={() => aoRegistrar(lead.id, 'ligacao', 'Ligação registrada.')}>Registrar ligação</BotaoMini>}
              {s.cta === 'copiar' && resumo?.telefonesExtras[0] && <BotaoMini onClick={async () => { try { await navigator.clipboard.writeText(resumo.telefonesExtras[0]); } catch { /* noop */ } }}>Copiar nº</BotaoMini>}
              {s.cta === 'reagendar' && tarefa && <BotaoMini onClick={() => aoReagendar(tarefa)}>Reagendar</BotaoMini>}
              {s.cta === 'executar' && lead.conversaId && <BotaoMini onClick={() => aoAbrirConversa(lead.conversaId!)}>Abrir conversa</BotaoMini>}
            </div>
          ))}
          <div className="rod">{resumo ? `baseado em ${resumo.entradasTotal} resposta${resumo.entradasTotal === 1 ? '' : 's'} deste cliente` : 'analisando…'}</div>
        </div>
      )}

      {/* 4. negócio */}
      <div className="rmp-bloco">
        <div className="rmp-bt">Negócio</div>
        <div className="rmp-dados">
          <div><span className="k">Financeira</span><span className="v">{lead.instituicao ?? '—'}</span></div>
          <div><span className="k">Origem</span><span className="v">{lead.origem ?? '—'}</span></div>
          <div><span className="k">Etapa</span><span className={'rmq-etapa e-' + lead.etapa}>{lead.status !== 'ativo' ? (STATUS_LABEL[lead.status] ?? lead.status) : (ETAPA_LABEL[lead.etapa] ?? lead.etapa)}</span></div>
          <div><span className="k">Tentativas</span><span className="v num">{lead.tentativas}</span></div>
          <div><span className="k">Sem resposta</span><span className="v num">{d === null ? '—' : d === 0 ? 'respondeu hoje' : `${d} dias`}</span></div>
          <div><span className="k">No remarketing</span><span className="v num">{tempoRelativo(lead.criadoEm, agora)}</span></div>
        </div>
        {contratos.length > 0 && (
          <div className="rmp-contratos">
            <div className="ch">{contratos.length} contrato{contratos.length > 1 ? 's' : ''} · benef. R$ {fmtMil(benefTotal)}/mês {altoValor && <em className="alto">alto valor</em>}</div>
            {contratos.map((c, i) => (
              <div key={i} className="ct"><span>{c.banco ?? '—'} · {c.tipo ? (BENEF_LABEL[c.tipo] ?? c.tipo) : 'benefício'}</span><b className="num">R$ {fmtMil(c.valor ?? 0)}</b></div>
            ))}
          </div>
        )}
      </div>

      {/* 5. registrar tentativa (sem concluir/avançar) */}
      {lead.status === 'ativo' && (
        <div className="rmp-reg">
          <span className="rmp-reg-t">Registrar tentativa</span>
          <BotaoMini onClick={() => aoRegistrar(lead.id, 'ligacao', 'Ligação registrada.')}>📞 Ligação</BotaoMini>
          <BotaoMini onClick={() => aoRegistrar(lead.id, 'audio', 'Áudio registrado.')}>🎤 Áudio</BotaoMini>
          <BotaoMini onClick={() => aoRegistrar(lead.id, 'whatsapp', 'WhatsApp registrado.')}>💬 WhatsApp</BotaoMini>
        </div>
      )}

      {/* 6. gestão inline */}
      <div className="rmp-acts">
        <BotaoSec mini onClick={aoTransferir}>Alterar responsável</BotaoSec>
        {lead.status === 'ativo' && <BotaoSec mini onClick={aoMudarEtapa}>Alterar etapa</BotaoSec>}
        <BotaoSec mini onClick={() => setObsAberta((v) => !v)}>{obsAberta ? 'Fechar observação' : '+ Observação'}</BotaoSec>
      </div>
      {obsAberta && (
        <div className="rmp-obs">
          <textarea className="inp" rows={3} placeholder="Escreva a observação — entra na linha do tempo com seu nome." value={obs} onChange={(e) => setObs(e.target.value)} />
          <BotaoMini disabled={obs.trim().length < 2} onClick={() => aoObservar(obs.trim(), () => { setObs(''); setObsAberta(false); })}>Salvar observação</BotaoMini>
        </div>
      )}

      {/* 7. timeline */}
      <div className="rmp-bt">Linha do tempo</div>
      {eventosQ.isLoading ? (
        <div className="rmq-skel"><Skeleton largura="90%" /><Skeleton largura="75%" /></div>
      ) : timeline.length === 0 ? (
        <div className="rmk-mudo">Sem eventos ainda.</div>
      ) : (
        <div className="rmp-tl">
          {timeline.map((t) => (
            <div key={t.id} className={'rmp-ev' + (t.crit ? ' crit' : '') + (t.ok ? ' ok' : '')}>
              <span className="pt" aria-hidden />
              <span className="tx"><span className="t">{t.titulo}</span>{t.sub && <span className="s">{t.sub}</span>}</span>
              <span className="h num" title={dataHoraSP(t.quando)}>{tempoRelativo(t.quando, agora)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ================= config (fila + prazos) ================= */
function ConfigModal({ inicial, usuarios, demo, aoFechar, aoSalvo }: {
  inicial: RmktConfig; usuarios: { id: string; nome: string }[]; demo: boolean;
  aoFechar: () => void; aoSalvo: (ok: boolean) => void;
}) {
  const salvar = useSalvarRemarketingConfig();
  const [ativo, setAtivo] = useState(inicial.ativo);
  const [f1, setF1] = useState(String(inicial.fluxo1Min));
  const [pd, setPd] = useState(String(inicial.pendenciaDias));
  const [rd, setRd] = useState(String(inicial.recuperacaoDias));
  const [fila, setFila] = useState<string[]>(inicial.filaRecuperacao);
  const disponiveis = usuarios.filter((u) => !fila.includes(u.id));
  const nomeDe = (id: string) => usuarios.find((u) => u.id === id)?.nome ?? '—';

  const submeter = () => {
    const c: RmktConfig = { ativo, ativoDesde: inicial.ativoDesde, fluxo1Min: +f1 || 15, pendenciaDias: +pd || 2, recuperacaoDias: +rd || 3, filaRecuperacao: fila };
    if (demo) { aoSalvo(true); return; }
    salvar.mutate(c, { onSuccess: () => aoSalvo(true), onError: () => aoSalvo(false) });
  };

  return (
    <ModalV2 aberto aoFechar={aoFechar} titulo="Configurar Central de Operações" largura={480}
      rodape={<>
        <BotaoSec mini disabled={salvar.isPending} onClick={aoFechar}>Voltar</BotaoSec>
        <BotaoPrimario mini disabled={salvar.isPending} onClick={submeter}>{salvar.isPending ? 'Salvando…' : 'Salvar'}</BotaoPrimario>
      </>}>
      <p className="p-modal-msg">Prazos dos fluxos e a ordem da fila de recuperação. O timer de 15 minutos só conta em horário comercial (seg–sáb, 9h–18h).</p>
      <div className="rmk-cfg-grid">
        <label className="rmk-cfg-c"><span>Fluxo inicial (min)</span><input className="inp num" inputMode="numeric" value={f1} onChange={(e) => setF1(e.target.value)} /></label>
        <label className="rmk-cfg-c"><span>Pendência (dias)</span><input className="inp num" inputMode="numeric" value={pd} onChange={(e) => setPd(e.target.value)} /></label>
        <label className="rmk-cfg-c"><span>Recuperação (dias)</span><input className="inp num" inputMode="numeric" value={rd} onChange={(e) => setRd(e.target.value)} /></label>
      </div>
      <div className="rmk-cfg-t">Fila de recuperação (ordem das tentativas)</div>
      {fila.length === 0 && <div className="rmk-mudo">Sem fila: as etapas avançam sem transferir o responsável.</div>}
      <div className="rmk-cfg-fila">
        {fila.map((id, i) => (
          <div className="rmk-cfg-item" key={id}>
            <b className="num">{i + 1}º</b> {nomeDe(id)}
            <span className="acts">
              <BotaoMini disabled={i === 0} onClick={() => setFila((f) => { const n = [...f]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n; })}>↑</BotaoMini>
              <BotaoMini disabled={i === fila.length - 1} onClick={() => setFila((f) => { const n = [...f]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; return n; })}>↓</BotaoMini>
              <BotaoMini onClick={() => setFila((f) => f.filter((x) => x !== id))}>Remover</BotaoMini>
            </span>
          </div>
        ))}
      </div>
      {disponiveis.length > 0 && (
        <select className="inp rmq-sel" value="" onChange={(e) => { if (e.target.value) setFila((f) => [...f, e.target.value]); }} aria-label="Adicionar atendente à fila">
          <option value="">＋ Adicionar atendente à fila…</option>
          {disponiveis.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
        </select>
      )}
      <div className="rmk-cfg-t">Motor</div>
      <label className="rmk-cfg-ativo">
        <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
        <span>Deixar o motor <b>armado</b> (as automações só rodam quando o agendador for ligado, na fase 3 — acompanhada).</span>
      </label>
    </ModalV2>
  );
}
