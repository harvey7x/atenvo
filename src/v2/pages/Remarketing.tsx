import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  REMARKETING_REAL, ETAPA_LABEL, STATUS_LABEL,
  useRemarketingDashboard, useRemarketingLeads, useRemarketingTarefas, useRemarketingEventos,
  useConcluirTarefa, useRemarketingConfig, useSalvarRemarketingConfig,
  useTransferirLead, useReagendarTarefa, useRegistrarAcao, useRemarketingRealtime,
  useMudarEtapa, useObservacao, useProdutividade,
  type RmktLead, type RmktTarefa, type RmktConfig, type RmktEtapa,
} from '@/data/remarketing';
import { useOrgUsuarios } from '@/data/atendimento';
import { useWaAtividades } from '@/data/whatsapp';
import { useOrg } from '@/context/OrgContext';
import {
  BotaoMini, BotaoPrimario, BotaoSec, CardVidro, DrawerV2,
  EstadoErro, EstadoVazio, Input, ModalV2, Skeleton,
} from '../components';
import { tempoRelativo, dataHoraSP } from '../lib/tempo';
import { initials } from '@/lib/avatar';
import './remarketing.css';

/* ------------------------------------------------------------------
   Central de Remarketing — CENTRAL DE OPERAÇÕES.
   O atendente não pensa: a caixa "Trabalhar Agora" dita a próxima ação
   (fila por SCORE multi-fator, não só tempo). Fila completa abaixo por
   urgência; painel lateral estilo HubSpot resolve tudo sem trocar de
   tela (responsável, etapa, observação, timeline rica). Realtime.
   ------------------------------------------------------------------ */

type Urgencia = 'vencida' | 'hoje' | 'amanha' | 'semana' | 'ok';
const URG_ORDEM: Urgencia[] = ['vencida', 'hoje', 'amanha', 'semana', 'ok'];
const URG_LABEL: Record<Urgencia, string> = {
  vencida: 'Vencidas', hoje: 'Vencem hoje', amanha: 'Vencem amanhã', semana: 'Esta semana', ok: 'Em dia',
};

const EVENTO_LABEL: Record<string, string> = {
  entrou_remarketing_1: 'Entrou no Remarketing 1',
  entrou_pendencia: 'Entrou em Pendência',
  escalado: 'Escalou de etapa',
  transferido: 'Transferido de atendente',
  etapa_alterada: 'Etapa alterada manualmente',
  tarefa_criada: 'Tarefa criada',
  tarefa_concluida: 'Tentativa registrada',
  ligacao_realizada: 'Ligação realizada',
  audio_enviado: 'Áudio enviado',
  whatsapp_enviado: 'WhatsApp enviado',
  reagendado: 'Prazo reagendado',
  observacao: 'Observação',
  sla_estourado: 'SLA estourado',
  respondeu: 'Cliente respondeu',
  recuperado: 'Recuperado',
  perdido: 'Perdido',
};
const ATIV_LABEL: Record<string, string> = {
  assumido: 'Atendimento assumido', transferido: 'Atendimento transferido', devolvido: 'Devolvido para a fila',
  status_alterado: 'Status da conversa alterado', nota: 'Nota interna', arquivada: 'Conversa arquivada', reaberta: 'Conversa reaberta',
};

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

/* ===== MOTOR DE PRIORIDADE (score 0-100, multi-fator, transparente) =====
   Não é só tempo: lead novíssimo e resposta recente valem MAIS que prazo,
   porque a chance de recuperar despenca com o esfriamento. */
function scoreDe(lead: RmktLead, tarefa: RmktTarefa | null, agora: number): { score: number; motivo: string } {
  const fatores: { pts: number; motivo: string }[] = [];
  const vence = tarefa?.venceEm ?? lead.proximaAcaoEm;
  if (vence) {
    const ms = agora - new Date(vence).getTime();
    if (ms > 0) fatores.push({ pts: 50 + Math.min(20, Math.floor(ms / 3_600_000)), motivo: 'prazo vencido' });
    else if (urgenciaDe(vence, agora) === 'hoje') fatores.push({ pts: 30, motivo: 'vence hoje' });
    else if (urgenciaDe(vence, agora) === 'amanha') fatores.push({ pts: 15, motivo: 'vence amanhã' });
  }
  const idadeMin = minutosDesde(lead.criadoEm, agora);
  if (idadeMin !== null && idadeMin <= 10) fatores.push({ pts: 45, motivo: 'lead novíssimo (<10 min)' });
  const respMin = minutosDesde(lead.ultimaEntradaEm, agora);
  if (respMin !== null && respMin <= 60) fatores.push({ pts: 35, motivo: 'respondeu há pouco' });
  else if (respMin !== null && respMin <= 1_440) fatores.push({ pts: 18, motivo: 'respondeu nas últimas 24 h' });
  fatores.push({ pts: (3 - Math.min(lead.tentativas, 3)) * 6, motivo: 'poucas tentativas' });
  if (lead.etapa === 'recuperacao_3') fatores.push({ pts: 15, motivo: 'última chance antes de perder' });
  else if (lead.etapa === 'recuperacao_2') fatores.push({ pts: 10, motivo: 'recuperação avançada' });
  const dias = diasSem(lead.ultimaEntradaEm, agora);
  if (dias !== null && dias > 5) fatores.push({ pts: -Math.min(dias, 20), motivo: 'abandono antigo' });
  const score = Math.max(0, Math.min(100, fatores.reduce((s, f) => s + f.pts, 0)));
  const top = fatores.filter((f) => f.pts > 0).sort((a, b) => b.pts - a.pts)[0];
  return { score, motivo: top?.motivo ?? 'sem urgência' };
}
const tierDe = (score: number): 'p1' | 'p2' | 'p3' => (score >= 70 ? 'p1' : score >= 40 ? 'p2' : 'p3');

/* verbo/emoji da ação (a fila fala a língua do atendente) */
function verboDe(titulo: string | null): { emoji: string; verbo: string } {
  const t = (titulo ?? '').toLowerCase();
  if (/liga/.test(t)) return { emoji: '📞', verbo: 'Ligar para' };
  if (/[áa]udio/.test(t)) return { emoji: '🎤', verbo: 'Enviar áudio para' };
  if (/aguardar/.test(t)) return { emoji: '⏳', verbo: 'Acompanhar' };
  if (/transfer/.test(t)) return { emoji: '🔄', verbo: 'Transferir' };
  return { emoji: '💬', verbo: 'Enviar WhatsApp para' };
}

/* ícones locais */
const Ic = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{children}</svg>
);
const IcChat = () => <Ic><path d="M4 5h16v11h-10l-4 4v-4H4z" /></Ic>;
const IcTel = () => <Ic><path d="M5 4c-.8 5.5 3.7 11.5 9.5 13.5l2.3-2.8-3.2-1.9-1.5 1.4c-1.8-1-3.4-2.7-4.3-4.5l1.5-1.4L7.4 4z" /></Ic>;
const IcMic = () => <Ic><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></Ic>;
const IcMsg = () => <Ic><path d="M4 6h16v12H4z" /><path d="m4 7 8 6 8-6" /></Ic>;
const IcSwap = () => <Ic><path d="M7 4v12M7 4 4 7M7 4l3 3" /><path d="M17 20V8m0 12 3-3m-3 3-3-3" /></Ic>;
const IcClock = () => <Ic><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></Ic>;
const IcCheck = () => <Ic><path d="m5 13 4 4L19 7" /></Ic>;

interface ItemFila { lead: RmktLead; tarefa: RmktTarefa | null; urg: Urgencia; score: number; tier: 'p1' | 'p2' | 'p3'; motivo: string }

export default function RemarketingV2() {
  const nav = useNavigate();
  const { currentOrg } = useOrg();
  const agora = Date.now();
  const podeConfig = currentOrg.role === 'admin' || currentOrg.role === 'gestor';
  useRemarketingRealtime();

  const dashQ = useRemarketingDashboard();
  const [aba, setAba] = useState<'ativo' | 'encerrados'>('ativo');
  const leadsQ = useRemarketingLeads(aba);
  const tarefasQ = useRemarketingTarefas();
  const configQ = useRemarketingConfig();
  const usuariosQ = useOrgUsuarios();

  const concluir = useConcluirTarefa();
  const transferir = useTransferirLead();
  const reagendar = useReagendarTarefa();
  const registrar = useRegistrarAcao();
  const mudarEtapa = useMudarEtapa();
  const observar = useObservacao();

  const [fResp, setFResp] = useState('todos');
  const [fFin, setFFin] = useState('todas');
  const [fEtapa, setFEtapa] = useState('todas');
  const [fUrg, setFUrg] = useState<'todas' | Urgencia>('todas');
  const [fDias, setFDias] = useState('todos');
  const [fOrigem, setFOrigem] = useState('todas');
  const [busca, setBusca] = useState('');
  const [detId, setDetId] = useState<string | null>(null);
  const [cfgAberta, setCfgAberta] = useState(false);
  const [eqAberta, setEqAberta] = useState(false);
  const [transfDe, setTransfDe] = useState<RmktLead | null>(null);
  const [etapaDe, setEtapaDe] = useState<RmktLead | null>(null);
  const [reagDe, setReagDe] = useState<RmktTarefa | null>(null);
  const [aviso, setAviso] = useState<{ tom: 'ok' | 'erro'; texto: string } | null>(null);

  const prodQ = useProdutividade(eqAberta && podeConfig);
  const dash = dashQ.data;
  const leads = leadsQ.data ?? [];
  const tarefas = tarefasQ.data ?? [];

  const tarefaPorLead = useMemo(() => new Map(tarefas.map((t) => [t.remarketingId, t])), [tarefas]);
  const financeiras = useMemo(() => [...new Set(leads.map((l) => l.instituicao).filter((x): x is string => !!x))].sort(), [leads]);
  const origens = useMemo(() => [...new Set(leads.map((l) => l.origem).filter((x): x is string => !!x))].sort(), [leads]);

  const fila = useMemo<ItemFila[]>(() => {
    const itens = leads.map((lead) => {
      const tarefa = tarefaPorLead.get(lead.id) ?? null;
      const { score, motivo } = scoreDe(lead, tarefa, agora);
      return { lead, tarefa, urg: urgenciaDe(tarefa?.venceEm ?? lead.proximaAcaoEm, agora), score, tier: tierDe(score), motivo };
    }).filter(({ lead }) => {
      if (fResp === 'fila' && lead.responsavelId) return false;
      if (fResp !== 'todos' && fResp !== 'fila' && lead.responsavelId !== fResp) return false;
      if (fFin !== 'todas' && (lead.instituicao ?? '') !== fFin) return false;
      if (fEtapa !== 'todas' && lead.etapa !== fEtapa) return false;
      if (fOrigem !== 'todas' && (lead.origem ?? '') !== fOrigem) return false;
      if (fDias !== 'todos') {
        const d = diasSem(lead.ultimaEntradaEm, agora) ?? 999;
        if (d < Number(fDias)) return false;
      }
      if (busca.trim()) {
        const q = busca.trim().toLowerCase();
        const dig = q.replace(/\D+/g, '');
        if (!lead.contatoNome.toLowerCase().includes(q) && !(dig && (lead.contatoTelefone ?? '').includes(dig))) return false;
      }
      return true;
    }).filter((it) => fUrg === 'todas' || it.urg === fUrg);
    // urgência agrupa; DENTRO do grupo o SCORE manda (nunca por nome)
    return itens.sort((a, b) => {
      const ua = URG_ORDEM.indexOf(a.urg) - URG_ORDEM.indexOf(b.urg);
      if (ua !== 0) return ua;
      return b.score - a.score;
    });
  }, [leads, tarefaPorLead, fResp, fFin, fEtapa, fOrigem, fDias, fUrg, busca, agora]);

  /* TRABALHAR AGORA: o topo global por score, com tarefa executável */
  const agoraLista = useMemo(() =>
    aba !== 'ativo' ? [] : [...fila].filter((i) => i.tarefa).sort((a, b) => b.score - a.score).slice(0, 5),
  [fila, aba]);

  const grupos = useMemo(() => {
    if (aba === 'encerrados') return fila.length ? ([['ok', fila]] as const) : ([] as const);
    const g = new Map<Urgencia, ItemFila[]>();
    for (const it of fila) { const arr = g.get(it.urg) ?? []; arr.push(it); g.set(it.urg, arr); }
    return URG_ORDEM.filter((u) => g.has(u)).map((u) => [u, g.get(u)!] as const);
  }, [fila, aba]);

  const detLead = detId ? leads.find((l) => l.id === detId) ?? null : null;

  const acao = (fn: () => void, okMsg: string) => {
    if (!REMARKETING_REAL) { setAviso({ tom: 'ok', texto: `Modo demonstração: ${okMsg.toLowerCase()}` }); return; }
    fn();
  };
  const aoErro = (e: unknown) => setAviso({ tom: 'erro', texto: (e as Error)?.message || 'Falha na ação.' });
  const concluirTarefa = (t: RmktTarefa) =>
    acao(() => concluir.mutate(t.id, { onSuccess: () => setAviso({ tom: 'ok', texto: 'Feito — a próxima tarefa já está na fila.' }), onError: aoErro }), 'Tarefa concluída');

  return (
    <>
      <div className="ph sobe">
        <div>
          <h2>Central de Remarketing</h2>
          <p>Central de operações — o sistema dita a próxima ação.{REMARKETING_REAL ? '' : ' · modo demonstração (nada é gravado)'}</p>
        </div>
        <div className="acoes">
          {podeConfig && <BotaoSec onClick={() => setEqAberta(true)}>Equipe</BotaoSec>}
          {podeConfig && <BotaoSec onClick={() => setCfgAberta(true)}>Configurar</BotaoSec>}
        </div>
      </div>

      {aviso && (
        <div className={aviso.tom === 'erro' ? 'aviso-inline erro' : 'aviso-inline'} role="status">
          {aviso.texto}
          <button type="button" onClick={() => setAviso(null)} aria-label="Fechar aviso">×</button>
        </div>
      )}
      {configQ.data && !configQ.data.ativo && (
        <div className="aviso-inline rmk-inerte" role="status">
          Motor <b>desligado</b> — nenhuma etapa muda sozinha ainda. A ativação é a fase 3, acompanhada.
        </div>
      )}

      {/* ---------- TRABALHAR AGORA: a fila de execução ---------- */}
      {aba === 'ativo' && (
        <section className="rmn-agora vidro spot sobe" aria-label="Trabalhar agora">
          <header className="rmn-cab">
            <h3>⚡ Trabalhar agora</h3>
            <span>Execute de cima para baixo — concluiu, sobe a próxima.</span>
          </header>
          {tarefasQ.isLoading || leadsQ.isLoading ? (
            <div className="rmq-skel"><Skeleton largura="70%" altura={20} /><Skeleton largura="60%" altura={20} /></div>
          ) : agoraLista.length === 0 ? (
            <div className="rmn-limpa">🎉 Fila limpa — nenhuma ação imediata. O sistema avisa quando algo entrar.</div>
          ) : agoraLista.map(({ lead, tarefa, urg, score, motivo }, i) => {
            const v = verboDe(tarefa!.titulo);
            return (
              <div key={lead.id} className={'rmn-item u-' + urg + (i === 0 ? ' primeira' : '')}>
                <span className={'pbadge ' + tierDe(score)} title={`score ${score} · ${motivo}`}>{tierDe(score).toUpperCase()}</span>
                <span className="rmn-frase">
                  <span aria-hidden>{v.emoji}</span> <b>{v.verbo} {lead.contatoNome}</b>
                  <i className="rmn-motivo">{motivo}</i>
                </span>
                <span className={'rmq-prazo u-' + urg}>
                  {tarefa!.venceEm ? (urg === 'vencida' ? 'venceu ' + tempoRelativo(tarefa!.venceEm, agora) : tempoRelativo(tarefa!.venceEm, agora)) : '—'}
                </span>
                <span className="rmn-acts">
                  {lead.conversaId && <BotaoPrimario mini onClick={() => nav('/whatsapp?conversa=' + lead.conversaId)}>Executar</BotaoPrimario>}
                  <BotaoSec mini disabled={concluir.isPending} onClick={() => concluirTarefa(tarefa!)}>Concluir ✓</BotaoSec>
                </span>
              </div>
            );
          })}
        </section>
      )}

      {/* ---------- indicadores: linha fina ---------- */}
      <div className="rmq-stats sobe" style={{ animationDelay: '.06s' }} role="group" aria-label="Indicadores">
        <span className="rmq-stat"><b className="num">{dash?.tarefas_pendentes ?? 0}</b> aguardando ação</span>
        <span className={'rmq-stat' + ((dash?.tarefas_vencidas ?? 0) > 0 ? ' urg' : '')}><b className="num">{dash?.tarefas_vencidas ?? 0}</b> vencidas</span>
        <span className="rmq-stat ok"><b className="num">{dash?.recuperados_hoje ?? 0}</b> recuperados hoje</span>
        <span className="rmq-stat"><b className="num">{dash?.taxa_recuperacao != null ? `${dash.taxa_recuperacao}%` : '—'}</b> taxa de recuperação (30 d)</span>
      </div>

      {/* ---------- filtros rápidos ---------- */}
      <div className="rmq-filtros sobe" style={{ animationDelay: '.1s' }}>
        <select className="inp rmq-sel" value={fResp} onChange={(e) => setFResp(e.target.value)} aria-label="Responsável">
          <option value="todos">Responsável: todos</option>
          <option value="fila">Na fila (sem dono)</option>
          {(usuariosQ.data ?? []).map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
        </select>
        <select className="inp rmq-sel" value={fEtapa} onChange={(e) => setFEtapa(e.target.value)} aria-label="Etapa">
          <option value="todas">Etapa: todas</option>
          {Object.entries(ETAPA_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="inp rmq-sel" value={fFin} onChange={(e) => setFFin(e.target.value)} aria-label="Financeira">
          <option value="todas">Financeira: todas</option>
          {financeiras.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <select className="inp rmq-sel" value={fUrg} onChange={(e) => setFUrg(e.target.value as 'todas' | Urgencia)} aria-label="Urgência">
          <option value="todas">Urgência: todas</option>
          {URG_ORDEM.map((u) => <option key={u} value={u}>{URG_LABEL[u]}</option>)}
        </select>
        <select className="inp rmq-sel" value={fDias} onChange={(e) => setFDias(e.target.value)} aria-label="Dias sem resposta">
          <option value="todos">Sem resposta: qualquer</option>
          <option value="2">2+ dias</option><option value="5">5+ dias</option><option value="10">10+ dias</option>
        </select>
        {origens.length > 1 && (
          <select className="inp rmq-sel" value={fOrigem} onChange={(e) => setFOrigem(e.target.value)} aria-label="Origem">
            <option value="todas">Origem: todas</option>
            {origens.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        )}
        <Input placeholder="Nome ou telefone…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <button type="button" className={'rmq-aba' + (aba === 'encerrados' ? ' on' : '')} onClick={() => setAba(aba === 'ativo' ? 'encerrados' : 'ativo')}>
          {aba === 'ativo' ? 'Ver encerrados' : '← Voltar à fila'}
        </button>
      </div>

      {/* ---------- A FILA COMPLETA ---------- */}
      {leadsQ.isError ? (
        <CardVidro sobe><EstadoErro descricao="Erro ao carregar a fila." aoTentarDeNovo={() => leadsQ.refetch()} /></CardVidro>
      ) : leadsQ.isLoading ? (
        <div className="rmq-skel" aria-hidden><Skeleton largura="100%" altura={46} /><Skeleton largura="100%" altura={46} /><Skeleton largura="100%" altura={46} /></div>
      ) : fila.length === 0 ? (
        <CardVidro sobe><EstadoVazio titulo={aba === 'ativo' ? 'Fila limpa' : 'Nada encerrado ainda'} descricao={aba === 'ativo' ? 'Nenhum lead aguardando ação com esses filtros.' : 'Recuperados e perdidos aparecem aqui.'} /></CardVidro>
      ) : (
        <div className="rmq-fila sobe" style={{ animationDelay: '.14s' }}>
          {grupos.map(([urg, itens]) => (
            <section key={urg} className={'rmq-grupo u-' + urg}>
              <header className="rmq-gh">
                {aba === 'encerrados' ? 'Encerrados' : <>{urg === 'vencida' && <span aria-hidden>🔥</span>} {URG_LABEL[urg]}</>} <b className="num">{itens.length}</b>
              </header>
              {itens.map(({ lead, tarefa, urg: u, score, tier, motivo }) => {
                const d = diasSem(lead.ultimaEntradaEm, agora);
                const vence = tarefa?.venceEm ?? lead.proximaAcaoEm;
                return (
                  <div key={lead.id} className={'rmq-row u-' + u} role="button" tabIndex={0}
                    onClick={() => setDetId(lead.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter') setDetId(lead.id); }}>
                    <span className="rmq-quem">
                      <span className={'pbadge ' + tier} title={`score ${score} · ${motivo}`}>{tier.toUpperCase()}</span>
                      <span className="rmk-av" aria-hidden>{initials(lead.contatoNome)}</span>
                      <span className="tx">
                        <span className="nm">{lead.contatoNome}</span>
                        <span className="tel num">{lead.contatoTelefone ? '+' + lead.contatoTelefone : 'sem número'}</span>
                      </span>
                    </span>
                    <span className="rmq-fin">{lead.instituicao ?? '—'}</span>
                    <span className={'rmq-etapa e-' + lead.etapa}>{aba === 'ativo' ? (ETAPA_LABEL[lead.etapa] ?? lead.etapa) : (STATUS_LABEL[lead.status] ?? lead.status)}</span>
                    <span className="rmq-resp">{lead.responsavelNome ?? <i>na fila</i>}</span>
                    <span className="rmq-dias num" title="Dias sem resposta do cliente">{d === null ? '—' : d === 0 ? 'hoje' : `${d} d`}</span>
                    <span className="rmq-acao" title={tarefa?.instrucoes ?? undefined}>
                      {tarefa?.titulo ?? lead.proximaAcao ?? '—'}
                      <i className="num">{lead.tentativas} tent.</i>
                    </span>
                    <span className={'rmq-prazo u-' + u}>{vence ? (u === 'vencida' ? 'venceu ' + tempoRelativo(vence, agora) : tempoRelativo(vence, agora)) : '—'}</span>
                    <span className="rmq-acts" onClick={(e) => e.stopPropagation()}>
                      {lead.conversaId && <button type="button" className="qa" title="Abrir conversa" onClick={() => nav('/whatsapp?conversa=' + lead.conversaId)}><IcChat /></button>}
                      <button type="button" className="qa" title="Registrar ligação" onClick={() => acao(() => registrar.mutate({ leadId: lead.id, acao: 'ligacao' }, { onSuccess: () => setAviso({ tom: 'ok', texto: 'Ligação registrada.' }), onError: aoErro }), 'Ligação registrada')}><IcTel /></button>
                      <button type="button" className="qa" title="Registrar áudio enviado" onClick={() => acao(() => registrar.mutate({ leadId: lead.id, acao: 'audio' }, { onSuccess: () => setAviso({ tom: 'ok', texto: 'Áudio registrado.' }), onError: aoErro }), 'Áudio registrado')}><IcMic /></button>
                      <button type="button" className="qa" title={tarefa?.sugestaoMensagem ? 'Copiar mensagem sugerida' : 'Registrar WhatsApp enviado'}
                        onClick={async () => {
                          if (tarefa?.sugestaoMensagem) { try { await navigator.clipboard.writeText(tarefa.sugestaoMensagem); setAviso({ tom: 'ok', texto: 'Mensagem copiada.' }); } catch { setAviso({ tom: 'erro', texto: 'Não foi possível copiar.' }); } }
                          else acao(() => registrar.mutate({ leadId: lead.id, acao: 'whatsapp' }, { onSuccess: () => setAviso({ tom: 'ok', texto: 'WhatsApp registrado.' }), onError: aoErro }), 'WhatsApp registrado');
                        }}><IcMsg /></button>
                      <button type="button" className="qa" title="Transferir" onClick={() => setTransfDe(lead)}><IcSwap /></button>
                      {tarefa && <button type="button" className="qa" title="Reagendar prazo" onClick={() => setReagDe(tarefa)}><IcClock /></button>}
                      {tarefa && (
                        <button type="button" className="qa go" title="Concluir tarefa (registra a tentativa)"
                          disabled={concluir.isPending} onClick={() => concluirTarefa(tarefa)}>
                          <IcCheck />
                        </button>
                      )}
                    </span>
                  </div>
                );
              })}
            </section>
          ))}
        </div>
      )}

      {/* ---------- painel lateral (HubSpot-like) ---------- */}
      <DrawerV2 aberto={!!detLead} aoFechar={() => setDetId(null)} largura={440}>
        {detLead && (
          <LeadPainel
            lead={detLead}
            agora={agora}
            aoFechar={() => setDetId(null)}
            aoAbrirConversa={(c) => nav('/whatsapp?conversa=' + c)}
            aoTransferir={() => setTransfDe(detLead)}
            aoMudarEtapa={() => setEtapaDe(detLead)}
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

      {/* ---------- alterar etapa ---------- */}
      {etapaDe && (
        <EtapaModal
          lead={etapaDe}
          aoFechar={() => setEtapaDe(null)}
          aoConfirmar={(etapa) => acao(() => mudarEtapa.mutate({ leadId: etapaDe.id, etapa }, {
            onSuccess: () => { setEtapaDe(null); setAviso({ tom: 'ok', texto: 'Etapa alterada — nova tarefa criada.' }); }, onError: aoErro,
          }), 'Etapa alterada')}
        />
      )}

      {/* ---------- reagendar ---------- */}
      {reagDe && (
        <ReagendarModal
          tarefa={reagDe}
          aoFechar={() => setReagDe(null)}
          aoConfirmar={(quandoISO) => acao(() => reagendar.mutate({ tarefaId: reagDe.id, quando: quandoISO }, {
            onSuccess: () => { setReagDe(null); setAviso({ tom: 'ok', texto: 'Prazo reagendado.' }); }, onError: aoErro,
          }), 'Prazo reagendado')}
        />
      )}

      {/* ---------- equipe (produtividade) ---------- */}
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

      {/* ---------- config ---------- */}
      {cfgAberta && configQ.data && (
        <ConfigModal
          inicial={configQ.data}
          usuarios={(usuariosQ.data ?? []).map((u) => ({ id: u.id, nome: u.nome }))}
          demo={!REMARKETING_REAL}
          aoFechar={() => setCfgAberta(false)}
          aoSalvo={(ok) => { setCfgAberta(false); setAviso(ok ? { tom: 'ok', texto: 'Configuração salva.' } : { tom: 'erro', texto: 'Falha ao salvar a configuração.' }); }}
        />
      )}
    </>
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
function LeadPainel({ lead, agora, aoFechar, aoAbrirConversa, aoTransferir, aoMudarEtapa, aoObservar }: {
  lead: RmktLead; agora: number; aoFechar: () => void;
  aoAbrirConversa: (conversaId: string) => void;
  aoTransferir: () => void; aoMudarEtapa: () => void;
  aoObservar: (texto: string, aoOk: () => void) => void;
}) {
  const eventosQ = useRemarketingEventos(lead.id);
  const atividadesQ = useWaAtividades(lead.conversaId);
  const [obs, setObs] = useState('');
  const [obsAberta, setObsAberta] = useState(false);
  const d = diasSem(lead.ultimaEntradaEm, agora);

  /* timeline RICA: eventos do remarketing + trilha do atendimento, juntos */
  const timeline = useMemo(() => {
    const evs = (eventosQ.data ?? []).map((e) => ({
      id: 'e' + e.id, quando: e.criadoEm,
      titulo: EVENTO_LABEL[e.tipo] ?? e.tipo,
      sub: typeof e.detalhe?.texto === 'string' ? String(e.detalhe.texto)
        : typeof e.detalhe?.de === 'string' && typeof e.detalhe?.para === 'string' ? `${ETAPA_LABEL[e.detalhe.de as string] ?? e.detalhe.de} → ${ETAPA_LABEL[e.detalhe.para as string] ?? e.detalhe.para}`
        : typeof e.detalhe?.titulo === 'string' ? String(e.detalhe.titulo)
        : typeof e.detalhe?.para_nome === 'string' ? `para ${e.detalhe.para_nome}` : undefined,
      crit: e.tipo === 'perdido' || e.tipo === 'sla_estourado',
      ok: e.tipo === 'recuperado' || e.tipo === 'respondeu',
    }));
    const ats = (atividadesQ.data ?? []).map((a) => ({
      id: 'a' + a.id, quando: a.em,
      titulo: ATIV_LABEL[a.tipo] ?? a.tipo,
      sub: [a.motivo, a.usuario ? `por ${a.usuario}` : null].filter(Boolean).join(' · ') || undefined,
      crit: false, ok: false,
    }));
    return [...evs, ...ats].sort((x, y) => new Date(y.quando).getTime() - new Date(x.quando).getTime()).slice(0, 60);
  }, [eventosQ.data, atividadesQ.data]);

  return (
    <div className="rmk-det">
      <div className="rmk-det-topo">
        <span className="rmk-av g" aria-hidden>{initials(lead.contatoNome)}</span>
        <div className="tx">
          <div className="nm">{lead.contatoNome}</div>
          <div className="sb num">{lead.contatoTelefone ? '+' + lead.contatoTelefone : 'sem número'}</div>
        </div>
        <button type="button" className="fechar" onClick={aoFechar} aria-label="Fechar">×</button>
      </div>

      {/* dados completos */}
      <div className="rmp-dados">
        <div><span className="k">Financeira</span><span className="v">{lead.instituicao ?? '—'}</span></div>
        <div><span className="k">Origem</span><span className="v">{lead.origem ?? '—'}</span></div>
        <div><span className="k">Etapa</span><span className={'rmq-etapa e-' + lead.etapa}>{lead.status !== 'ativo' ? (STATUS_LABEL[lead.status] ?? lead.status) : (ETAPA_LABEL[lead.etapa] ?? lead.etapa)}</span></div>
        <div><span className="k">Responsável</span><span className="v">{lead.responsavelNome ?? 'na fila'}</span></div>
        <div><span className="k">Tentativas</span><span className="v num">{lead.tentativas}</span></div>
        <div><span className="k">Sem resposta</span><span className="v num">{d === null ? '—' : d === 0 ? 'respondeu hoje' : `${d} dias`}</span></div>
        <div><span className="k">No remarketing desde</span><span className="v num">{tempoRelativo(lead.criadoEm, agora)}</span></div>
      </div>

      {lead.status === 'ativo' && (
        <div className="rmk-det-prox">
          <div className="k">Próxima ação</div>
          <div className="v">{lead.proximaAcao ?? '—'}</div>
          {lead.proximaAcaoEm && <div className="s num">prazo {tempoRelativo(lead.proximaAcaoEm, agora)}</div>}
        </div>
      )}

      {/* ações — tudo sem sair da tela */}
      <div className="rmp-acts">
        {lead.conversaId && <BotaoPrimario mini onClick={() => aoAbrirConversa(lead.conversaId!)}>Abrir conversa</BotaoPrimario>}
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

      <div className="rmk-det-tl-t">Linha do tempo</div>
      {eventosQ.isLoading ? (
        <div className="rmq-skel"><Skeleton largura="90%" /><Skeleton largura="75%" /></div>
      ) : timeline.length === 0 ? (
        <div className="rmk-mudo">Sem eventos ainda.</div>
      ) : (
        <div className="rmp-tl">
          {timeline.map((t) => (
            <div key={t.id} className={'rmp-ev' + (t.crit ? ' crit' : '') + (t.ok ? ' ok' : '')}>
              <span className="pt" aria-hidden />
              <span className="tx">
                <span className="t">{t.titulo}</span>
                {t.sub && <span className="s">{t.sub}</span>}
              </span>
              <span className="h num" title={dataHoraSP(t.quando)}>{tempoRelativo(t.quando, Date.now())}</span>
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
    <ModalV2 aberto aoFechar={aoFechar} titulo="Configurar Central de Remarketing" largura={480}
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
