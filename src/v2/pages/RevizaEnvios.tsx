/* =====================================================================
   ENVIOS da Reviza (dono 24/09): o RASTRO completo de cada mensagem —
   de qual número saiu, pra qual cliente, que horas, em que passo da régua,
   qual mensagem EXATA, se foi entregue/lida, se o cliente respondeu (com
   atalho pra conversa), o que falta sair e quanto do dia já foi (%).
   Tudo vem do banco real (wa_envio_alvos + triggers de entrega/resposta) e
   da PRÉVIA do motor (a mesma conta do disparo — nada é enviado pra calcular).
   ===================================================================== */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { BadgeStatus, BotaoPrimario, BotaoSec, CardVidro, Chip, Chips, DrawerV2, EstadoVazio, Input, Kpi, ModalV2, TabelaPadrao, type Coluna, type TomStatus } from '../components';
import { EditorMsg, IcT, IC_PATH, quandoCurto, rid, type Bloco, type MsgDef } from './cobrancaMotor';
import { Checks, aplicarVarsCliente, fmtTel, soDigitos, textoPreviaWa } from './RevizaWhatsApp';
import { useDadosCobranca } from '../data/cobranca/hooks';
import { usePapel } from '../data/cobranca/sessao';
import { clientesReais, linhasComCancelados } from './revizaAnalytics';
import type { Dados, GLinha } from '../data/cobranca/types';
import { AcoesNoTopo } from './comunicacao/MenuMais';
import {
  useAlvosWA, useCanaisWA, useCancelarEnvioWA, useCriarEnvioWA, useEnviosWA, useOptoutWA, usePreviaReguaWA, useReguaWA,
  useProcessarEnviosWA, useProgressoReguaWA, useReenviarWA, useReguaConfigWA, useResumoEnviosWA, useRodadasWA,
  useVerificarCanalWA, useVoltarAReceberWA, useMotorStatusWA, useTirarDaReguaWA, subirMidiaWA, horaBrasilia, chaveComercial,
  type AlvoWA, type CanalWA, type EnvioWA, type FiltroAlvosWA, type FiltroStatusAlvo, type ItemPreviaWA, type OptoutWA, type ProgressoPassoWA,
  type CoberturaWA, type ReguaConfigWA, type RodadaWA,
} from '../data/wa/wa';

const VAZIO: Dados = { comps: [], linhas: [], pendentes: [], historico: [] };
const d2 = (n: number) => String(n).padStart(2, '0');
const isoLocal = (d: Date) => `${d.getFullYear()}-${d2(d.getMonth() + 1)}-${d2(d.getDate())}`;
const somaDiasIso = (iso: string, n: number) => { const [y, m, d] = iso.split('-').map(Number); return isoLocal(new Date(y, m - 1, d + n)); };
/** início do dia LOCAL (Brasil) deslocado `dias` pra trás, em ISO UTC */
const inicioDia = (dias = 0) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - dias); return d.toISOString(); };
const DIA_SEM = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const dataCurta = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); const dt = new Date(y, m - 1, d); return `${DIA_SEM[dt.getDay()]} ${d2(d)}/${d2(m)}`; };
const dataHora = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
const hora = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—');
const dataBR = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '—');
const compBR = (c: string | null) => { if (!c) return '—'; const M = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']; return `${M[+c.slice(5, 7) - 1]}/${c.slice(2, 4)}`; };
function tempoAtras(iso: string | null): string {
  if (!iso) return 'nunca';
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 90) return 'agora há pouco';
  if (s < 3600) return `há ${Math.round(s / 60)} min`;
  if (s < 86400) return `há ${Math.round(s / 3600)} h`;
  return `há ${Math.round(s / 86400)} d`;
}
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
/** plural de verdade (nada de "enviada(s)"): plural(3, 'enviada', 'enviadas') → "3 enviadas" */
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
const nomeCanal = (c: CanalWA) => c.nome.charAt(0).toUpperCase() + c.nome.slice(1);
/** chave canônica do telefone = DDD + 8 últimos dígitos (a mesma do banco/motor: wa_tel_chave) */
const chaveTel = (t: string): string | null => {
  let d = soDigitos(t).replace(/^0+/, '');
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2);
  return d.length < 10 ? null : d.slice(0, 2) + d.slice(-8);
};

/* ---------- status de um destinatário, em português de gente ---------- */
/** `ini`/`fim` = janela da régua configurada (hora de Brasília; fim exclusivo) — o motor só começa mensagem nela */
type CtxStatus = { reguaLigada: boolean; ini: number; fim: number; porComercial?: Record<string, number> };
const foraDaJanela = (cx: CtxStatus) => { const h = horaBrasilia(); return h < cx.ini || h >= cx.fim; };
function statusAlvo(a: AlvoWA, canal: CanalWA | undefined, cx: CtxStatus): { t: string; tom: TomStatus; det: string | null } {
  switch (a.status) {
    case 'pendente': {
      const ag = a.wa_envios?.agendado_para;
      if (a.wa_envios?.estado === 'rascunho' && ag && new Date(ag).getTime() > Date.now()) return { t: `Agendada · ${dataHora(ag)}`, tom: 'neutro', det: null };
      if (a.tentar_apos) return { t: 'Tentando de novo', tom: 'atencao', det: a.erro };
      if (canal && canal.estado !== 'conectado') return { t: 'Aguardando o número', tom: 'atencao', det: `O número de ${nomeCanal(canal)} está desconectado; sai quando reconectar${a.wa_envios?.origem === 'regua' ? ' (até o fim do dia)' : ''}` };
      if (a.wa_envios?.origem === 'regua' && !cx.reguaLigada) return { t: 'Parada', tom: 'atencao', det: 'Régua desligada; se não for religada hoje, expira à meia-noite' };
      if (a.wa_envios?.origem === 'regua' && foraDaJanela(cx)) return { t: 'Parada', tom: 'atencao', det: `Fora do horário da régua (${cx.ini}h–${cx.fim}h); o que não saiu hoje expira à meia-noite` };
      // mig 82: comercial com início próprio (ex.: Eduardo às 7h) — o cliente espera na fila até lá
      const iniCom = a.wa_envios?.origem === 'regua' ? cx.porComercial?.[chaveComercial(a.canal_nome)] : undefined;
      if (iniCom != null && iniCom > cx.ini && horaBrasilia() < iniCom && !(a.parte_atual ?? 0)) return { t: 'Na fila', tom: 'neutro', det: `Começa às ${String(iniCom).padStart(2, '0')}:00 (horário de ${a.canal_nome})` };
      return { t: 'Na fila', tom: 'neutro', det: null };
    }
    case 'enviando': return { t: 'Enviando…', tom: 'atencao', det: null };
    case 'enviado': return a.entrega === 'lida' ? { t: 'Lida', tom: 'ok', det: null } : a.entrega === 'entregue' ? { t: 'Entregue', tom: 'ok', det: null } : { t: 'Enviada', tom: 'ok', det: null };
    case 'erro': return { t: 'Erro', tom: 'erro', det: a.erro };
    case 'pulado': return { t: 'Não enviada', tom: 'neutro', det: a.motivo };
    case 'cancelado': return { t: 'Cancelada', tom: 'neutro', det: a.motivo };
    default: return { t: a.status, tom: 'neutro', det: null };
  }
}
// futuro/previsto = cinza (neutro); verde fica só para o que já aconteceu (enviada, entregue, lida)
const ROT_PREVIA: Record<ItemPreviaWA['status'], { t: string; tom: TomStatus }> = {
  vai_receber: { t: 'Vai receber', tom: 'neutro' }, gerado: { t: 'Na fila ou enviado', tom: 'neutro' },
  aguardando: { t: 'Aguardando', tom: 'atencao' }, pulado: { t: 'Não recebe', tom: 'neutro' },
};

/* =====================================================================
   TELA
   ===================================================================== */
/** ícones de traço (mesma família do shell) que o módulo ainda não tinha */
const IC = {
  ok: 'M20 6 9 17l-5-5',
  alerta: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  zap: 'M21 11.5a8.4 8.4 0 0 1-9 8.4 8.6 8.6 0 0 1-3.8-.9L3 21l2-5.2a8.4 8.4 0 0 1-1-4.3 8.5 8.5 0 0 1 8.5-8.5A8.4 8.4 0 0 1 21 11.5z',
  pulso: 'M22 12h-4l-3 9L9 3l-3 9H2',
  seta: 'm6 9 6 6 6-6',
  x: 'M18 6 6 18M6 6l12 12',
  info: 'M12 16v-4M12 8h.01M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
} as const;
const Ico = ({ d, s = 16 }: { d: string; s?: number }) => <IcT d={d} s={s} mr={0} />;
/** estado vazio de "Não recebem": seta de saída (traço 1,5, o mesmo da barra lateral) */
const IconeSaida = () => (
  <svg className="ic-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M14 4.5h3.5A1.5 1.5 0 0 1 19 6v12a1.5 1.5 0 0 1-1.5 1.5H14" /><path d="M10 16l4-4-4-4" /><path d="M14 12H4.5" />
  </svg>
);
const iniciais = (n: string | null | undefined) => (String(n ?? '').trim().split(/\s+/).slice(0, 2).map((p) => p[0] ?? '').join('') || '·').toUpperCase();

type Aba = 'feitos' | 'proximos' | 'campanhas' | 'optout';
export function EnviosReviza({ gestor, aoAvisar }: { gestor: boolean; aoAvisar: (t: string) => void }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const abaParam = params.get('aba');
  const aba: Aba = abaParam === 'proximos' || abaParam === 'campanhas' || abaParam === 'optout' ? abaParam : 'feitos';
  const abasRef = useRef<HTMLDivElement>(null);
  const rolarParaAbas = () => window.setTimeout(() => abasRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  const setAba = (a: Aba, rolar = false) => { const p = new URLSearchParams(params); p.set('aba', a); setParams(p, { replace: true }); if (rolar) rolarParaAbas(); };
  // vindo de outra tela já numa aba (Régua › "Ver quem recebe" → Próximos disparos): a lista fica
  // abaixo dos cartões de situação — a página desce até as abas, senão o clique parece não ter feito nada
  useEffect(() => {
    if (abaParam !== 'proximos' && abaParam !== 'campanhas' && abaParam !== 'optout') return;
    const t = window.setTimeout(() => abasRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 450);
    return () => window.clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const hoje = isoLocal(new Date());
  const [ini, fim] = useMemo(() => [inicioDia(0), inicioDia(-1)], [hoje]); // eslint-disable-line react-hooks/exhaustive-deps
  const cfgQ = useReguaConfigWA();
  const canaisQ = useCanaisWA();
  const reguaQ = useReguaWA();
  const resumoQ = useResumoEnviosWA(ini, fim);
  const progQ = useProgressoReguaWA(ini, fim);
  const previaHojeQ = usePreviaReguaWA({ de: hoje });
  const rodadasQ = useRodadasWA(gestor);
  const optQ = useOptoutWA();
  const processar = useProcessarEnviosWA();
  const { data: dadosCob } = useDadosCobranca();
  const dados = dadosCob ?? VAZIO;
  const linhaPorId = useMemo(() => new Map(linhasComCancelados(dados).map((l) => [l.id, l])), [dados]);

  const canais = canaisQ.data ?? [];
  const r = resumoQ.data;
  const cx: CtxStatus = { reguaLigada: cfgQ.data?.ativa === true, ini: cfgQ.data?.hora_envio ?? 8, fim: cfgQ.data?.hora_fim ?? 20, porComercial: cfgQ.data?.horario_comercial ?? {} };
  const passosAtivos = (reguaQ.data ?? []).filter((m) => m.ativo && m.alvo === 'padrao').sort((a, b) => a.quando - b.quando);
  const [detalhe, setDetalhe] = useState<AlvoWA | null>(null);
  // ?novo=1 (o "+" do celular das Conversas: nova mensagem) já abre o Novo envio — e sai da URL,
  // pra voltar/recarregar não abrir de novo
  const [novo, setNovo] = useState(() => params.get('novo') === '1');
  useEffect(() => {
    if (params.get('novo') !== '1') return;
    const p = new URLSearchParams(params); p.delete('novo'); setParams(p, { replace: true });
  }, [params, setParams]);
  const abrirConversa = (id: string) => navigate(`/cobrancas/conversas?c=${id}`);
  const abas: [Aba, string, number | null][] = [
    ['feitos', 'Envios feitos', null],
    ['proximos', 'Próximos disparos', null],
    ['campanhas', 'Campanhas', null],
    ['optout', 'Não recebem', optQ.data?.length ?? null],
  ];

  return (
    <div className="ev-raiz">
      {/* ações no cabeçalho da página, à direita do título (sem parágrafo explicativo embaixo) */}
      <AcoesNoTopo>
        {gestor && <BotaoSec title="Processa agora as mensagens que estão na fila, sem esperar a próxima rodada automática" onClick={() => processar.mutate(undefined, { onSuccess: (x) => { const env = Number((x as Record<string, unknown>).enviadas ?? 0); const fal = Number((x as Record<string, unknown>).falhas ?? 0); aoAvisar(`Fila processada: ${env ? plural(env, 'enviada', 'enviadas') : 'nenhuma enviada'}${fal ? `, ${plural(fal, 'com erro', 'com erro')}` : ''}.`); }, onError: (e) => aoAvisar((e as Error).message) })} disabled={processar.isPending}>
          <Ico d={IC_PATH.girar} s={16} />{processar.isPending ? 'Processando…' : 'Processar fila agora'}</BotaoSec>}
        <BotaoPrimario onClick={() => setNovo(true)}><Ico d={IC_PATH.mais} s={16} />Novo envio</BotaoPrimario>
      </AcoesNoTopo>

      <StatusGeral cfg={cfgQ.data ?? null} canais={canais} ultima={rodadasQ.data?.[0] ?? null} gestor={gestor} aoAvisar={aoAvisar}
        aoConfigurar={() => navigate('/cobrancas/regua')} aoNumeros={() => navigate('/cobrancas/numeros')} />

      <ChecklistLigar cfg={cfgQ.data ?? null} canais={canais} passos={passosAtivos.length} cobertura={previaHojeQ.data?.cobertura ?? null}
        carregando={cfgQ.isLoading || canaisQ.isLoading || reguaQ.isLoading || previaHojeQ.isLoading} erroCob={previaHojeQ.isError && !previaHojeQ.data}
        aoIr={(rota) => navigate(rota)} aoVerQuem={() => setAba('proximos', true)} />

      <div className="kpis sobe" style={{ animationDelay: '.06s' }}>
        <Kpi rotulo="Enviadas hoje" valor={r?.enviadas ?? 0} nota={r ? `${r.entregues} entregues · ${r.lidas} lidas` : '—'} />
        <Kpi rotulo="Responderam hoje" valor={r?.responderam ?? 0} nota={r && r.enviadas ? `${pct(r.responderam, r.enviadas)}% de quem recebeu` : 'Nenhuma resposta ainda'} />
        <Kpi rotulo="Na fila agora" valor={r?.na_fila ?? 0} nota={`${(r?.na_fila ?? 0) > 0 ? (!cx.reguaLigada || foraDaJanela(cx) ? `Régua parada (desligada ou fora das ${cx.ini}h–${cx.fim}h); só os envios manuais saem` : 'Saindo com intervalo de segurança') : 'Fila vazia'}${r?.agendados ? ` · ${plural(r.agendados, 'agendada', 'agendadas')}` : ''}`} />
        <Kpi rotulo="Com erro hoje" valor={r?.erros ?? 0} tomValor={(r?.erros ?? 0) > 0 ? 'erro' : undefined} nota={(r?.pulados ?? 0) > 0 ? `${plural(r?.pulados ?? 0, 'não enviada', 'não enviadas')} por regra` : 'Nenhuma deixada de fora'} />
      </div>

      <ReguaDeHoje prog={progQ.data ?? []} itens={previaHojeQ.data?.itens ?? []} passos={passosAtivos.map((p) => ({ nome: p.nome, quando: p.quando }))}
        carregando={previaHojeQ.isLoading || progQ.isLoading || cfgQ.isLoading} erro={previaHojeQ.isError && !previaHojeQ.data ? (previaHojeQ.error?.message ?? 'falhou') : null} ligada={cx.reguaLigada} ini={cx.ini} fim={cx.fim}
        dMedio={cfgQ.data ? (cfgQ.data.delay_min + cfgQ.data.delay_max) / 2 : 32} aoVerProximos={() => setAba('proximos', true)} />

      <div className="ev-abas sobe" ref={abasRef} role="tablist" aria-label="Envios" style={{ animationDelay: '.1s' }}>
        {abas.map(([k, t, n]) => (
          <button key={k} type="button" role="tab" aria-selected={aba === k} className={aba === k ? 'ev-aba on' : 'ev-aba'} onClick={() => setAba(k)}>
            {t}{n ? <span className="ev-aba-n num">{n}</span> : null}
          </button>
        ))}
      </div>

      {aba === 'feitos' && <ListaEnvios canais={canais} linhaPorId={linhaPorId} gestor={gestor} aoAvisar={aoAvisar} aoAbrir={setDetalhe} aoConversa={abrirConversa} cx={cx} />}
      {aba === 'proximos' && <ProximosDisparos hoje={hoje} ligada={cx.reguaLigada} />}
      {aba === 'campanhas' && <Campanhas canais={canais} linhaPorId={linhaPorId} gestor={gestor} aoAvisar={aoAvisar} aoAbrir={setDetalhe} aoConversa={abrirConversa} cx={cx} />}
      {aba === 'optout' && <NaoRecebem itens={optQ.data ?? []} carregando={optQ.isLoading} erro={optQ.isError && !optQ.data ? (optQ.error?.message ?? 'falhou') : null} dados={dados} gestor={gestor} aoAvisar={aoAvisar} />}

      {detalhe && <DetalheAlvo alvo={detalhe} canais={canais} linha={detalhe.lead_id ? linhaPorId.get(detalhe.lead_id) ?? null : null} gestor={gestor} aoAvisar={aoAvisar} aoFechar={() => setDetalhe(null)} aoConversa={abrirConversa} cx={cx} />}
      {novo && <NovoEnvio canais={canais} dados={dados} aoAvisar={aoAvisar} aoFechar={() => setNovo(false)} />}
    </div>
  );
}

/* ---------- visão geral: régua, WhatsApp e envio automático — UMA faixa de status (~80px) ----------
   Crítica 12/11: os três cartões seguiam a altura do do meio (os 8 números, cada um com "verificar") e
   gastavam ~220px para dizer "está tudo funcionando, menos 1 número". Agora: uma linha por bloco, o
   problema nomeado ("Paty desconectada") com o "Verificar" SÓ nele; a lista completa mora em Números. */
function StatusGeral({ cfg, canais, ultima, gestor, aoAvisar, aoConfigurar, aoNumeros }: {
  cfg: ReguaConfigWA | null; canais: CanalWA[]; ultima: RodadaWA | null;
  gestor: boolean; aoAvisar: (t: string) => void; aoConfigurar: () => void; aoNumeros: () => void;
}) {
  const verificar = useVerificarCanalWA();
  const motorQ = useMotorStatusWA();
  const bat = motorQ.data?.ultima_rodada ? Date.now() - new Date(motorQ.data.ultima_rodada).getTime() : null;
  const motorParado = bat != null && bat > 3 * 60_000;
  const motorErro = motorQ.data?.ultima_ok === false;
  const dias = cfg?.dias_envio === 'uteis' ? 'dias úteis' : cfg?.dias_envio === 'uteis_sabado' ? 'dias úteis e sábado' : 'todos os dias';
  const conectados = canais.filter((c) => c.estado === 'conectado');
  const problemas = canais.filter((c) => c.estado !== 'conectado');
  const tomNum: TomStatus = !canais.length ? 'neutro' : conectados.length === canais.length ? 'ok' : conectados.length ? 'atencao' : 'erro';
  const tomMotor: TomStatus = motorParado || motorErro ? 'erro' : motorQ.data?.ultima_rodada ? 'ok' : 'neutro';
  const verificarCanal = (c: CanalWA) => verificar.mutate(c.id, {
    onSuccess: (x) => aoAvisar(`${nomeCanal(c)}: ${x.estado === 'conectado' ? 'conectado' : String(x.estado)}${x.webhook_reaplicado ? ' · recebimento reconfigurado' : ''}${x.detalhe ? ` · ${String(x.detalhe)}` : x.webhook_ok ? ' · tudo certo' : ''}.`),
    onError: (e) => aoAvisar((e as Error).message),
  });
  const ultimaAtiv = ultima ? (ultima.erro ? 'a última rodada falhou' : ultima.enviadas || ultima.falhas ? `${plural(ultima.enviadas, 'enviada', 'enviadas')}${ultima.falhas ? `, ${plural(ultima.falhas, 'erro', 'erros')}` : ''} na última rodada` : '') : '';
  return (
    <CardVidro spot sobe className="ev-faixa" style={{ animationDelay: '.02s' }}>
      <div className="ev-fx">
        <span className={`ev-st-ic ${cfg?.ativa ? 'ok' : 'neutro'}`}><Ico d={IC_PATH.relogio} /></span>
        <div className="ev-fx-corpo">
          <span className="ev-fx-rot">Régua automática</span>
          <span className="ev-fx-val"><b className={cfg?.ativa ? 'ok' : ''}>{cfg ? (cfg.ativa ? 'Ligada' : 'Desligada') : '…'}</b>{cfg && <span className="num">{d2(cfg.hora_envio)}:00 · {dias}</span>}</span>
          {cfg && <span className="ev-fx-meta">{cfg.teto_diario > 0 ? `Até ${cfg.teto_diario} mensagens por número ao dia` : 'Sem limite diário por número'}</span>}
        </div>
        <BotaoSec mini onClick={aoConfigurar}>Configurar</BotaoSec>
      </div>
      <div className="ev-fx">
        <span className={`ev-st-ic ${tomNum}`}><Ico d={IC.zap} /></span>
        <div className="ev-fx-corpo">
          <span className="ev-fx-rot">WhatsApp</span>
          <span className="ev-fx-val"><b className={tomNum === 'ok' ? 'ok' : tomNum}>{canais.length ? `${conectados.length} de ${plural(canais.length, 'número conectado', 'números conectados')}` : 'Nenhum número'}</b></span>
          {problemas.length > 0 ? (
            <span className="ev-fx-meta ev-fx-prob">
              {problemas.slice(0, 2).map((c) => (
                <span key={c.id} className="ev-fx-num" title={`Conexão conferida ${tempoAtras(c.verificado_em)} · último sinal do WhatsApp ${tempoAtras(c.ultimo_evento_em)}`}>
                  <i className={c.estado === 'conectando' ? 'atencao' : 'erro'} aria-hidden />
                  {nomeCanal(c)} · {c.estado === 'conectando' ? 'conectando' : 'desconectado'}
                  {gestor && <button type="button" className="ev-link" disabled={verificar.isPending} onClick={() => verificarCanal(c)}>{verificar.isPending && verificar.variables === c.id ? 'Verificando…' : 'Verificar'}</button>}
                </span>
              ))}
              {problemas.length > 2 && <span>e mais {problemas.length - 2}</span>}
            </span>
          ) : canais.length > 0 && <span className="ev-fx-meta">Todos recebendo e enviando normalmente</span>}
        </div>
        <BotaoSec mini onClick={aoNumeros}>Números</BotaoSec>
      </div>
      <div className="ev-fx">
        <span className={`ev-st-ic ${tomMotor}`}><Ico d={IC.pulso} /></span>
        <div className="ev-fx-corpo">
          <span className="ev-fx-rot">Envio automático</span>
          <span className="ev-fx-val"><b className={tomMotor === 'ok' ? 'ok' : tomMotor}>{motorParado ? 'Parado' : motorErro ? 'Com erro' : motorQ.data?.ultima_rodada ? 'Em dia' : '…'}</b>{motorQ.data?.ultima_rodada && <span className="num">última execução {hora(motorQ.data.ultima_rodada)}</span>}</span>
          <span className="ev-fx-meta" title={motorQ.data?.ultimo_erro ?? undefined}>{motorQ.data?.ultimo_erro ? motorQ.data.ultimo_erro : ultimaAtiv ? `Roda a cada minuto · ${ultimaAtiv}` : 'Roda a cada minuto'}</span>
        </div>
      </div>
    </CardVidro>
  );
}

/* ---------- checklist: o que falta pra régua funcionar de verdade ---------- */
function ChecklistLigar({ cfg, canais, passos, cobertura, carregando, erroCob, aoIr, aoVerQuem }: {
  cfg: ReguaConfigWA | null; canais: CanalWA[]; passos: number; cobertura: CoberturaWA[] | null; carregando: boolean; erroCob: boolean;
  aoIr: (rota: string) => void; aoVerQuem: () => void;
}) {
  // começa aberto só com a régua desligada (com ela ligada é consulta, não tarefa)
  const [abertoU, setAberto] = useState<boolean | null>(null);
  const aberto = abertoU ?? !cfg?.ativa;
  const conectados = canais.filter((c) => c.estado === 'conectado');
  // o número reserva é usado sem dono (motor) — não entra como pendência
  const semDono = conectados.filter((c) => !c.dono_id && c.id !== cfg?.canal_reserva_id);
  const semSinal = conectados.filter((c) => !c.ultimo_evento_em || Date.now() - new Date(c.ultimo_evento_em).getTime() > 3 * 86_400_000);
  const cob = (cobertura ?? []).reduce((s, c) => ({ total: s.total + c.clientes, tel: s.tel + c.com_telefone, alc: s.alc + (c.numero?.conectado ? c.com_telefone : 0) }), { total: 0, tel: 0, alc: 0 });
  type Item = { ok: boolean; titulo: string; desc: string; acao?: { rot: string; fn: () => void } };
  const itens: Item[] = [
    { ok: conectados.length > 0, titulo: 'WhatsApp conectado', desc: conectados.length ? `${conectados.map(nomeCanal).join(', ')} conectado${conectados.length === 1 ? '' : 's'}.` : 'Nenhum número conectado. Conecte o número de cada comercial.', acao: conectados.length ? undefined : { rot: 'Conectar', fn: () => aoIr('/cobrancas/numeros') } },
    { ok: conectados.length > 0 && semDono.length === 0, titulo: 'Cada número com o seu comercial', desc: semDono.length ? `${semDono.map(nomeCanal).join(', ')} sem comercial dono: a régua não envia por ${semDono.length === 1 ? 'este número' : 'estes números'} e o comercial não vê as conversas.` : 'Cada número manda pelos clientes do próprio comercial.', acao: semDono.length ? { rot: 'Definir dono', fn: () => aoIr('/cobrancas/numeros') } : undefined },
    { ok: conectados.length > 0 && semSinal.length === 0, titulo: 'Recebendo mensagens', desc: semSinal.length ? `Nenhuma mensagem chegou em ${semSinal.map(nomeCanal).join(', ')} nos últimos dias. Envie um “oi” de outro celular e confira se aparece em Conversas: é por ali que chegam respostas, entregas e pedidos de saída.` : 'Respostas, entregas e leituras chegando normalmente.', acao: semSinal.length ? { rot: 'Abrir Conversas', fn: () => aoIr('/cobrancas/conversas') } : undefined },
    { ok: passos > 0, titulo: 'Mensagens da régua', desc: passos ? `${passos} passo${passos === 1 ? '' : 's'} ativo${passos === 1 ? '' : 's'} na sequência padrão.` : 'Nenhum passo ativo. Crie as mensagens na Régua.', acao: { rot: 'Ver régua', fn: () => aoIr('/cobrancas/regua') } },
    { ok: erroCob || cob.alc > 0, titulo: 'Clientes alcançáveis', desc: erroCob ? 'Não foi possível calcular agora. Veja “Régua de hoje” abaixo.' : cobertura ? `${cob.alc} de ${cob.total} clientes em cobrança podem receber hoje.${cob.total - cob.tel > 0 ? ` ${cob.total - cob.tel} estão sem telefone na Gestão.` : ''}${cob.tel - cob.alc > 0 ? ` ${cob.tel - cob.alc} têm telefone mas esperam o número do comercial (conectado e com dono).` : ''}` : 'Calculando…', acao: { rot: 'Ver quem recebe', fn: aoVerQuem } },
  ];
  const prontos = itens.filter((i) => i.ok).length;
  if (carregando) return null;   // sem piscar um alerta falso enquanto carrega
  if (cfg?.ativa && prontos === itens.length) return null;
  return (
    <CardVidro spot sobe className="ev-check" style={{ animationDelay: '.04s' }}>
      <button type="button" className="ev-check-cab" onClick={() => setAberto(!aberto)} aria-expanded={aberto}>
        <div>
          <b>{cfg?.ativa ? 'Pontos de atenção da régua' : 'Pronto para ligar a régua?'}</b>
          <span className="ev-sub">{prontos === itens.length ? 'Tudo certo: a régua pode ser ligada na tela da Régua.' : cfg?.ativa ? `${prontos} de ${itens.length} itens prontos · a régua está ligada; os itens marcados podem impedir envios` : `${prontos} de ${itens.length} itens prontos · resolva os itens marcados antes de ligar`}</span>
        </div>
        <div className="ev-check-prog" aria-hidden><i style={{ width: `${pct(prontos, itens.length)}%` }} /></div>
        <span className={aberto ? 'ev-chev on' : 'ev-chev'}><Ico d={IC.seta} s={14} /></span>
      </button>
      {aberto && (
        <ul className="ev-check-lista">
          {itens.map((i) => (
            <li key={i.titulo} className={i.ok ? 'ok' : 'pend'}>
              <span className="ev-check-ic"><Ico d={i.ok ? IC.ok : IC.alerta} s={13} /></span>
              <div><b>{i.titulo}</b><span>{i.desc}</span></div>
              {i.acao && <button type="button" className="ev-check-btn" onClick={i.acao.fn}>{i.acao.rot}</button>}
            </li>
          ))}
        </ul>
      )}
    </CardVidro>
  );
}

/* ---------- régua de hoje: um cartão por passo + por que não recebem ---------- */
function ReguaDeHoje({ prog, itens, passos, carregando, erro, ligada, ini = 8, fim = 20, dMedio, aoVerProximos }: {
  /** janela da régua (hora de Brasília) */
  ini?: number; fim?: number;
  prog: ProgressoPassoWA[]; itens: ItemPreviaWA[]; passos: { nome: string; quando: number }[]; carregando: boolean; erro: string | null; ligada: boolean; dMedio: number; aoVerProximos: () => void;
}) {
  type Linha = { passo: string; quando: number | null; gerados: number; enviados: number; entregues: number; lidos: number; responderam: number; erros: number; pulados: number; fila: number; previstos: number; aguardando: number; naoRecebe: number };
  const linhas = useMemo(() => {
    const m = new Map<string, Linha>();
    const get = (p: string, q: number | null) => { let x = m.get(p); if (!x) { x = { passo: p, quando: q, gerados: 0, enviados: 0, entregues: 0, lidos: 0, responderam: 0, erros: 0, pulados: 0, fila: 0, previstos: 0, aguardando: 0, naoRecebe: 0 }; m.set(p, x); } if (x.quando == null && q != null) x.quando = q; return x; };
    for (const p of passos) get(p.nome, p.quando);   // todos os passos ativos aparecem (mesmo com 0 hoje)
    for (const r of prog) {
      const x = get(r.passo_nome ?? 'Régua', null);
      x.gerados += r.n;
      if (r.status === 'enviado') { x.enviados += r.n; if (r.entrega === 'entregue' || r.entrega === 'lida') x.entregues += r.n; if (r.entrega === 'lida') x.lidos += r.n; if (r.respondeu) x.responderam += r.n; }
      else if (r.status === 'erro') x.erros += r.n;
      else if (r.status === 'pulado' || r.status === 'cancelado') x.pulados += r.n;
      else x.fila += r.n;
    }
    for (const i of itens) {
      const x = get(i.passo_nome, i.quando);
      if (i.status === 'vai_receber') x.previstos += 1;
      else if (i.status === 'aguardando') x.aguardando += 1;
      else if (i.status === 'pulado') x.naoRecebe += 1;
    }
    return [...m.values()].sort((a, b) => (a.quando ?? 99) - (b.quando ?? 99));
  }, [prog, itens, passos]);
  const motivos = useMemo(() => {
    const mm = new Map<string, number>();
    for (const i of itens) if (i.status !== 'vai_receber' && i.status !== 'gerado' && i.motivo) mm.set(i.motivo, (mm.get(i.motivo) ?? 0) + 1);
    return [...mm.entries()].sort((a, b) => b[1] - a[1]);
  }, [itens]);
  const maxMotivo = Math.max(1, ...motivos.map(([, n]) => n));
  const tot = linhas.reduce((s, l) => ({ g: s.g + l.gerados, p: s.p + l.enviados + l.erros + l.pulados, f: s.f + l.fila, prev: s.prev + l.previstos, ag: s.ag + l.aguardando, env: s.env + l.enviados }), { g: 0, p: 0, f: 0, prev: 0, ag: 0, env: 0 });
  // o "100%" é sobre TUDO que vence hoje: quem aguarda número/limite também conta (e não sai se nada mudar)
  const devidos = tot.g + tot.prev + tot.ag;
  const h = horaBrasilia();
  // cada número manda a SUA fila em paralelo: divide pelo nº de números servindo hoje (aprox.: fila dividida por igual)
  const nNums = Math.max(1, new Set(itens.filter((i) => i.status === 'gerado' && i.numero).map((i) => i.numero!.id)).size);
  const terminaEm = ligada && tot.f > 0 && h >= ini && h < fim ? new Date(Date.now() + Math.ceil(tot.f / nNums) * (dMedio + 6) * 1000) : null;
  const agFalta = itens.filter((i) => i.status === 'aguardando' && (i.motivo ?? '').startsWith('falta dado')).length;
  const resumo = erro ? `Não foi possível calcular agora (${erro}).`
    : carregando ? 'Calculando…'
    : !ligada ? 'A régua está desligada: nada sai sozinho. Abaixo, o que sairia hoje se ela estivesse ligada.'
    : !devidos ? 'Nenhuma mensagem da régua vence hoje.'
    : [`${tot.p} de ${devidos} processadas`, terminaEm ? `a fila termina por volta de ${hora(terminaEm.toISOString())}` : '', tot.prev ? `${tot.prev} ainda entram na fila` : '',
      tot.ag ? [tot.ag - agFalta ? `${tot.ag - agFalta} aguardando número, limite ou horário (não saem hoje se nada mudar)` : '', agFalta ? `${agFalta} aguardando dado na Gestão (saem ao corrigir)` : ''].filter(Boolean).join(' · ') : tot.g && tot.p === tot.g && !tot.prev ? 'concluída' : '',
      h >= fim && (tot.f || tot.prev) ? `depois das ${fim}h nada sai; o que sobrou expira à meia-noite` : ''].filter(Boolean).join(' · ');
  return (
    <CardVidro spot sobe className="ev-regua" style={{ animationDelay: '.08s' }}>
      <div className="ev-regua-cab">
        <div className="ev-regua-tt">
          <b>Régua de hoje</b>
          <span className="ev-sub">{resumo}</span>
        </div>
        {!carregando && !erro && ligada && devidos > 0 && <div className="ev-regua-pct"><b className="num">{pct(tot.p, devidos)}%</b><span className="ev-sub">do dia</span></div>}
        <button type="button" className="ev-link" onClick={aoVerProximos}>Próximos dias <Ico d="m9 18 6-6-6-6" s={12} /></button>
      </div>
      {carregando ? <div className="cm-hint">Calculando…</div> : linhas.length === 0 ? (
        <div className="cm-hint" style={{ margin: 0 }}>Nenhum passo da régua ativo. Crie as mensagens na tela da Régua.</div>
      ) : (
        <div className="ev-passos">
          {linhas.map((l) => {
            const base = l.gerados + l.previstos + l.aguardando;
            const destaque = ligada ? (l.gerados ? l.enviados : l.previstos) : l.previstos;
            const rotDestaque = ligada ? (l.gerados ? `de ${base} enviadas` : 'previstas hoje') : 'sairiam hoje';
            const leg: [string, number, string][] = [
              ['ok', l.enviados, 'enviadas'], ['fila', l.fila, 'na fila'], ['erro', l.erros, 'com erro'], ['neutro', l.pulados, 'não enviadas'],
              ['prev', l.gerados ? l.previstos : 0, 'a entrar'], ['atencao', l.aguardando, 'aguardando'], ['cinza', l.naoRecebe, 'não recebem'],
            ];
            return (
              <div className={base || l.naoRecebe ? 'ev-passo' : 'ev-passo vazio'} key={l.passo}>
                <div className="ev-passo-cab">{l.quando != null && <span className="ev-q num">{quandoCurto(l.quando)}</span>}<b title={l.passo}>{l.passo}</b></div>
                <div className="ev-passo-num"><b className="num">{destaque}</b><span>{rotDestaque}</span></div>
                <div className="ev-barra" aria-hidden>
                  <i className="ok" style={{ width: `${pct(l.enviados, base)}%` }} />
                  <i className="fila" style={{ width: `${pct(l.fila, base)}%` }} />
                  <i className="erro" style={{ width: `${pct(l.erros, base)}%` }} />
                  <i className="neutro" style={{ width: `${pct(l.pulados, base)}%` }} />
                  <i className="prev" style={{ width: `${pct(l.previstos, base)}%` }} />
                  <i className="atencao" style={{ width: `${pct(l.aguardando, base)}%` }} />
                </div>
                <div className="ev-leg">
                  {leg.filter(([, n]) => n > 0).map(([k, n, t]) => <span key={k}><i className={k} />{n} {t}</span>)}
                  {l.responderam > 0 && <span className="ev-leg-resp">{l.responderam} responderam</span>}
                  {!base && !l.naoRecebe && <span>ninguém hoje</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {motivos.length > 0 && (
        <div className="ev-motivos">
          <span className="ev-rot">Por que alguns clientes não recebem hoje</span>
          <div className="ev-motivos-lista">
            {motivos.slice(0, 6).map(([m, n]) => (
              <div className="ev-motivo" key={m}>
                <span className="ev-motivo-t" title={m}>{m}</span>
                <span className="ev-motivo-b"><i style={{ width: `${Math.max(3, Math.round((n / maxMotivo) * 100))}%` }} /></span>
                <b className="num">{n}</b>
              </div>
            ))}
          </div>
        </div>
      )}
    </CardVidro>
  );
}

/* ---------- aba 1: envios feitos (histórico + fila) ---------- */
function colunasAlvo(canais: CanalWA[], linhaPorId: Map<string, GLinha>, aoConversa: (id: string) => void, cx: CtxStatus): Coluna<AlvoWA>[] {
  const canalDe = (id: string | null) => canais.find((c) => c.id === id);
  // larguras fixas (table-layout: fixed): a tabela cabe em 1.150px com a barra aberta e a coluna
  // de ação aparece inteira; a mensagem fica com o que sobrar, em UMA linha com reticências
  return [
    { chave: 'cli', titulo: 'Cliente', largura: '26%', render: (a) => {
      const l = a.lead_id ? linhaPorId.get(a.lead_id) : undefined;
      const nome = l?.nome ?? a.nome ?? fmtTel(a.telefone);
      const meta = `${fmtTel(a.telefone)}${l ? ` · ${l.comercial || '—'}${l.dia ? ` · D${d2(l.dia)}` : ''}` : ''}`;
      return <div className="ev-pessoa"><span className="ev-av">{iniciais(nome)}</span><div className="ev-cli"><b title={nome}>{nome}</b><span className="num" title={meta}>{meta}</span></div></div>;
    } },
    { chave: 'msg', titulo: 'Mensagem', render: (a) => {
      const txt = (a.mensagem ?? '').replace(/\s+/g, ' ').trim();
      return (
        <div className="ev-cli">
          <span className="ev-chip">{a.wa_envios?.origem === 'regua' ? `Régua · ${a.passo_nome ?? a.wa_envios?.nome?.replace(/^Régua:\s*/, '') ?? ''}` : `Manual · ${a.wa_envios?.nome ?? ''}`}</span>
          <span className="ev-previa" title={txt || undefined}>{txt || (a.status === 'pendente' ? 'Montada na hora do envio' : '—')}</span>
        </div>
      );
    } },
    // "Saiu por": só o nome do comercial (o número fica na dica) — telefone empilhado em 3 linhas era o que quebrava a linha
    { chave: 'num', titulo: 'Saiu por', largura: '108px', render: (a) => { const c = canalDe(a.canal_id ?? a.wa_envios?.canal_id ?? null); const tel = a.canal_numero ? fmtTel(a.canal_numero) : c?.numero ? fmtTel(c.numero) : ''; return <span className="ev-saiu" title={tel ? `Número ${tel}` : undefined}>{a.canal_nome ?? (c ? nomeCanal(c) : '—')}</span>; } },
    { chave: 'hora', titulo: 'Horário', largura: '92px', classe: 'num', render: (a) => a.enviado_em ? <div className="ev-cli ev-hora"><b className="num">{hora(a.enviado_em)}</b><span className="num">{dataBR(isoLocal(new Date(a.enviado_em)))}</span></div> : <span className="ev-sub ev-hora1">{a.status === 'pendente' || a.status === 'enviando' ? `Na fila desde ${hora(a.created_at)}` : dataHora(a.created_at)}</span> },
    // status: um selo só (o duplo check azul repetia o "Lida" e saía da paleta)
    { chave: 'st', titulo: 'Status', largura: '132px', render: (a) => { const s = statusAlvo(a, canalDe(a.canal_id ?? a.wa_envios?.canal_id ?? null), cx); return <div className="ev-cli ev-st-cel"><BadgeStatus tom={s.tom}>{s.t}</BadgeStatus>{s.det && <span className="ev-det" title={s.det}>{s.det}</span>}</div>; } },
    { chave: 'resp', titulo: 'Respondeu', largura: '19%', render: (a) => { const rp = textoPreviaWa(a.resposta_previa); return a.respondeu_em ? <div className="ev-cli"><span className="ev-resp num">Respondeu às {hora(a.respondeu_em)}</span>{rp.texto && <span className="ev-det" title={rp.texto}>{rp.midia ? rp.texto : `“${rp.texto}”`}</span>}</div> : <span className="ev-sub">—</span>; } },
    { chave: 'conv', titulo: <span className="cc-vh">Conversa</span>, largura: '56px', render: (a) => a.conversa_id ? <button type="button" className="ev-btn-conv so-ic" title="Abrir a conversa com este cliente" aria-label="Abrir a conversa com este cliente" onClick={(e) => { e.stopPropagation(); aoConversa(a.conversa_id!); }}><Ico d={IC.zap} s={14} /></button> : null },
  ];
}
function ListaEnvios({ canais, linhaPorId, gestor, aoAvisar, aoAbrir, aoConversa, envioId, cx }: {
  canais: CanalWA[]; linhaPorId: Map<string, GLinha>; gestor: boolean; aoAvisar: (t: string) => void; aoAbrir: (a: AlvoWA) => void; aoConversa: (id: string) => void; envioId?: string; cx: CtxStatus;
}) {
  const [status, setStatus] = useState<FiltroStatusAlvo>('todos');
  const [periodo, setPeriodo] = useState<'hoje' | '7d' | '30d' | 'tudo'>(envioId ? 'tudo' : '7d');
  const [origem, setOrigem] = useState<FiltroAlvosWA['origem']>('todas');
  const [busca, setBusca] = useState('');
  const desdeIso = periodo === 'hoje' ? inicioDia(0) : periodo === '7d' ? inicioDia(6) : periodo === '30d' ? inicioDia(29) : null;
  const q = useAlvosWA({ desdeIso, status, origem, busca, envioId: envioId ?? null });
  const reenviar = useReenviarWA();
  const linhas = useMemo(() => (q.data?.pages ?? []).flat(), [q.data]);
  const cols = useMemo(() => colunasAlvo(canais, linhaPorId, aoConversa, cx), [canais, linhaPorId, aoConversa, cx.reguaLigada, cx.ini, cx.fim, cx.porComercial]); // eslint-disable-line react-hooks/exhaustive-deps
  const comErro = linhas.filter((a) => a.status === 'erro');
  return (
    <>
      <div className="ev-barra-ferr">
        <Chips>
          {([['todos', 'Todos'], ['fila', 'Na fila'], ['enviadas', 'Enviadas'], ['responderam', 'Responderam'], ['erros', 'Com erro'], ['pulados', 'Não enviadas']] as [FiltroStatusAlvo, string][]).map(([k, t]) => (
            <Chip key={k} ativo={status === k} onClick={() => setStatus(k)}>{t}</Chip>
          ))}
        </Chips>
        <div className="ev-ferr-dir">
          {!envioId && <select className="inp" value={periodo} onChange={(e) => setPeriodo(e.target.value as typeof periodo)} aria-label="Período">
            <option value="hoje">Hoje</option><option value="7d">Últimos 7 dias</option><option value="30d">Últimos 30 dias</option><option value="tudo">Tudo</option>
          </select>}
          {!envioId && <select className="inp" value={origem} onChange={(e) => setOrigem(e.target.value as typeof origem)} aria-label="Origem">
            <option value="todas">Régua e manuais</option><option value="regua">Só da régua</option><option value="manual">Só manuais</option>
          </select>}
          <input className="inp ev-busca" value={busca} placeholder="Buscar cliente ou telefone…" onChange={(e) => setBusca(e.target.value)} aria-label="Buscar" />
        </div>
      </div>
      {gestor && status === 'erros' && comErro.length > 0 && (
        <div className="ev-aviso">
          <span className="ev-aviso-ic"><Ico d={IC.alerta} s={14} /></span>
          <span className="ev-aviso-t">{comErro.length} com erro nesta lista. Número sem WhatsApp ou cadastro incompleto precisam ser corrigidos antes na Gestão; mensagens da régua só podem ser reenviadas no mesmo dia.</span>
          <BotaoSec mini disabled={reenviar.isPending} onClick={() => reenviar.mutate(comErro.map((a) => a.id), { onSuccess: (n) => aoAvisar(n ? `${plural(n, 'mensagem voltou', 'mensagens voltaram')} para a fila.` : 'Nenhuma pôde voltar para a fila (régua de outro dia não é reenviada).'), onError: (e) => aoAvisar((e as Error).message) })}>
            {reenviar.isPending ? 'Reenviando…' : 'Reenviar os com erro'}
          </BotaoSec>
        </div>
      )}
      <CardVidro spot sobe className="ev-tabela ev-tab-feitos">
        {q.isLoading ? <div className="cm-hint" style={{ padding: 16 }}>Carregando…</div>
          : q.isError ? <EstadoVazio titulo="Não foi possível carregar os envios" descricao={q.error?.message ?? 'Tente de novo.'} />
          : linhas.length === 0 ? <EstadoVazio titulo={status === 'todos' ? 'Nenhum envio no período' : 'Nada com esse filtro'} descricao={status === 'todos' ? 'Cada mensagem da régua ou de um envio manual aparece aqui, com número, horário, texto, entrega e resposta.' : 'Troque o filtro ou o período.'} />
          : <TabelaPadrao colunas={cols} linhas={linhas} chave={(a) => a.id} aoClicarLinha={aoAbrir}
              rodape={{ texto: `${linhas.length}${q.hasNextPage ? '+' : ''} envio${linhas.length === 1 ? '' : 's'} · clique em uma linha para ver os detalhes` }} />}
      </CardVidro>
      {q.hasNextPage && <div className="ev-mais"><BotaoSec mini onClick={() => { void q.fetchNextPage(); }} disabled={q.isFetchingNextPage}>{q.isFetchingNextPage ? 'Carregando…' : 'Carregar mais'}</BotaoSec></div>}
    </>
  );
}

/* ---------- detalhe de UM envio (painel lateral): linha do tempo, mensagem, régua do mês ---------- */
function DetalheAlvo({ alvo, canais, linha, gestor, aoAvisar, aoFechar, aoConversa, cx }: {
  alvo: AlvoWA; canais: CanalWA[]; linha: GLinha | null; gestor: boolean; aoAvisar: (t: string) => void; aoFechar: () => void; aoConversa: (id: string) => void; cx: CtxStatus;
}) {
  // relê o alvo pelo id (a tabela pode estar alguns segundos atrás)
  const vivoQ = useAlvosWA({ desdeIso: null, status: 'todos', origem: 'todas', busca: '', alvoId: alvo.id }, true);
  const a = (vivoQ.data?.pages ?? []).flat()[0] ?? alvo;
  const canal = canais.find((c) => c.id === (a.canal_id ?? a.wa_envios?.canal_id));
  const s = statusAlvo(a, canal, cx);
  const reenviar = useReenviarWA();
  const tirar = useTirarDaReguaWA();
  const hojeIso = isoLocal(new Date());
  // régua do cliente no mês do envio: prévia (mesma conta do motor) + o que já saiu
  const base = a.venc ?? a.created_at.slice(0, 10);
  const de = `${base.slice(0, 7)}-01`;
  const ate = somaDiasIso(`${base.slice(0, 7)}-28`, 12);
  const previaQ = usePreviaReguaWA({ de, ate, lead_id: a.lead_id }, !!a.lead_id);
  const doLeadQ = useAlvosWA({ desdeIso: null, status: 'todos', origem: 'regua', busca: '', leadId: a.lead_id }, !!a.lead_id);
  const doLead = (doLeadQ.data?.pages ?? []).flat();
  const passos = (previaQ.data?.itens ?? []).filter((i) => i.lead_id === a.lead_id);
  const nome = linha?.nome ?? a.nome ?? fmtTel(a.telefone);
  const falhou = a.status === 'erro' || a.status === 'pulado' || a.status === 'cancelado';
  // ciclo de vida da mensagem
  const etapas: { t: string; em: string | null; feito: boolean }[] = [
    { t: 'Entrou na fila', em: a.created_at, feito: true },
    { t: 'Enviada', em: a.enviado_em, feito: !!a.enviado_em },
    { t: 'Entregue no celular', em: a.entregue_em, feito: !!a.entregue_em },
    { t: 'Lida', em: a.lida_em, feito: !!a.lida_em },
    { t: 'Respondeu', em: a.respondeu_em, feito: !!a.respondeu_em },
  ];
  const Linha = ({ r, v }: { r: string; v: ReactNode }) => <div className="ev-kv"><span>{r}</span><b>{v}</b></div>;
  return (
    <DrawerV2 aberto aoFechar={aoFechar} largura={560}>
      <div className="ev-dw-cab">
        <span className="ev-av g">{iniciais(nome)}</span>
        <div className="ev-dw-quem">
          <b>{nome}</b>
          <span className="num">{fmtTel(a.telefone)}{linha ? ` · ${linha.comercial || 'sem comercial'}${linha.dia ? ` · ciclo D${d2(linha.dia)}` : ''}` : ''}</span>
        </div>
        <button type="button" className="ev-dw-x" onClick={aoFechar} aria-label="Fechar"><Ico d={IC.x} s={16} /></button>
      </div>
      <div className="ev-dw-corpo">
        <div className="ev-dw-st">
          <BadgeStatus tom={s.tom}>{s.t}</BadgeStatus>
          <span className="ev-chip">{a.wa_envios?.origem === 'regua' ? `Régua · ${a.passo_nome ?? ''}` : `Manual · ${a.wa_envios?.nome ?? ''}`}</span>
          {s.det && <p className="ev-dw-det">{s.det}</p>}
        </div>

        <div className="ev-sec">Linha do tempo</div>
        <ol className={falhou ? 'ev-vida falhou' : 'ev-vida'}>
          {etapas.map((e, i) => (
            <li key={e.t} className={e.feito ? 'feito' : ''} style={{ ['--i' as string]: i } as CSSProperties}>
              <i aria-hidden />
              <span>{e.t}</span>
              <b className="num">{e.em && e.feito ? dataHora(e.em) : '—'}</b>
            </li>
          ))}
          {falhou && <li className="fim"><i aria-hidden /><span>{s.t}</span><b>{s.det ? s.det.slice(0, 60) : ''}</b></li>}
        </ol>

        <div className="ev-sec">Detalhes</div>
        <div className="ev-det-grid">
          <Linha r="Saiu pelo número" v={`${a.canal_nome ?? (canal ? nomeCanal(canal) : '—')}${a.canal_numero || canal?.numero ? ` · ${fmtTel(a.canal_numero ?? canal?.numero ?? '')}` : ''}`} />
          {a.comp ? <Linha r="Competência · vencimento" v={`${compBR(a.comp)} · vence ${dataBR(a.venc)}`} /> : <Linha r="Tipo" v={a.wa_envios?.origem === 'regua' ? 'Régua (cliente específico)' : 'Envio manual'} />}
          {a.tentativas > 0 && <Linha r="Tentativas" v={a.tentativas} />}
        </div>

        <div className="ev-sec">Mensagem</div>
        <div className="ev-chat">
          {a.mensagem ? (
            <div className="ev-bolha out">{a.mensagem}<span className="ev-bolha-h num">{hora(a.enviado_em)} {a.status === 'enviado' && <Checks status={a.entrega ?? 'enviada'} />}</span></div>
          ) : <div className="ev-chat-vazio">{a.status === 'pendente' || a.status === 'enviando' ? 'A mensagem é montada na hora do envio, com os dados atuais da Gestão.' : a.status === 'enviado' ? 'Envio de antes do rastreio completo (24/09) — o texto está na conversa do cliente.' : 'Esta mensagem não chegou a ser montada.'}</div>}
          {a.resposta_previa && <div className="ev-bolha in">{textoPreviaWa(a.resposta_previa).texto}<span className="ev-bolha-h num">{hora(a.respondeu_em)}</span></div>}
        </div>

        {a.lead_id && (
          <>
            <div className="ev-sec">Régua deste cliente em {compBR(base.slice(0, 7))}</div>
            {previaQ.isLoading ? <div className="cm-hint">Calculando…</div> : previaQ.isError ? <div className="cm-hint">Não foi possível calcular a régua agora ({previaQ.error?.message}).</div> : passos.length === 0 ? <div className="cm-hint" style={{ margin: 0 }}>Nenhum passo da régua cai neste período para este cliente.</div> : (
              <div className="ev-tl">
                {passos.map((p) => {
                  const feito = doLead.find((x) => x.regua_msg_id === p.passo_id && x.comp === p.comp);
                  const passou = p.data < hojeIso;
                  const st = feito ? statusAlvo(feito, canal, cx)
                    : passou && (p.status === 'vai_receber' || p.status === 'aguardando') ? { t: 'Não saiu', tom: 'neutro' as TomStatus, det: p.motivo ?? 'A régua não enviou neste dia (desligada ou antes do rastreio)' }
                    : { ...ROT_PREVIA[p.status], det: p.motivo };
                  return (
                    <div className={`ev-tl-i ${feito ? 'feito' : ''}`} key={`${p.passo_id}-${p.data}`}>
                      <span className="num ev-tl-d">{dataCurta(p.data)}</span>
                      <div className="ev-tl-c">
                        <span className="ev-tl-n">{p.passo_nome}</span>
                        {st.det && <span className="ev-sub">{st.det}</span>}
                      </div>
                      <BadgeStatus tom={st.tom}>{feito ? st.t : p.data > hojeIso && p.status === 'vai_receber' ? (cx.reguaLigada ? 'Previsto' : 'Sairia') : st.t}</BadgeStatus>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
      <div className="ev-dw-pe">
        {gestor && a.status === 'erro' && <BotaoSec disabled={reenviar.isPending} onClick={() => reenviar.mutate([a.id], { onSuccess: (n) => aoAvisar(n ? 'Mensagem de volta na fila.' : 'Não é possível reenviar: mensagem da régua de outro dia (o texto fala de "hoje").'), onError: (e) => aoAvisar((e as Error).message) })}>{reenviar.isPending ? 'Reenviando…' : 'Reenviar'}</BotaoSec>}
        {gestor && <BotaoSec disabled={tirar.isPending} title="O cliente para de receber a régua e os envios em massa, como se tivesse pedido para sair. É possível desfazer."
          onClick={() => tirar.mutate({ telefone: a.telefone, lead_id: a.lead_id }, { onSuccess: (x) => aoAvisar(x.jaEstava ? 'Este cliente já estava fora da régua (pediu para sair ou já tinha sido tirado).' : 'Cliente tirado da régua. Ele aparece em "Não recebem" e é possível desfazer pelo botão Desfazer.'), onError: (e) => aoAvisar((e as Error).message) })}>{tirar.isPending ? 'Tirando…' : 'Tirar da régua'}</BotaoSec>}
        <span style={{ flex: 1 }} />
        {a.conversa_id && <BotaoPrimario onClick={() => aoConversa(a.conversa_id!)}><Ico d={IC.zap} s={16} />Abrir conversa</BotaoPrimario>}
      </div>
    </DrawerV2>
  );
}

/* ---------- aba 2: próximos disparos (prévia do motor — nada é enviado) ---------- */
function ProximosDisparos({ hoje, ligada }: { hoje: string; ligada: boolean }) {
  const [janela, setJanela] = useState<'hoje' | 'amanha' | '7' | '14'>('7');
  const [filtro, setFiltro] = useState<'todos' | 'vai' | 'aguardando' | 'nao'>('todos');
  const [aberto, setAberto] = useState<string | null>(null);
  const de = janela === 'amanha' ? somaDiasIso(hoje, 1) : hoje;
  const ate = janela === 'hoje' ? hoje : janela === 'amanha' ? de : somaDiasIso(hoje, janela === '7' ? 6 : 13);
  const q = usePreviaReguaWA({ de, ate });
  const ehVai = (i: ItemPreviaWA) => i.status === 'vai_receber' || i.status === 'gerado';
  const itens = (q.data?.itens ?? []).filter((i) => filtro === 'todos' || (filtro === 'vai' ? ehVai(i) : filtro === 'aguardando' ? i.status === 'aguardando' : i.status === 'pulado'));
  const porDia = useMemo(() => {
    const m = new Map<string, ItemPreviaWA[]>();
    for (const i of itens) (m.get(i.data) ?? m.set(i.data, []).get(i.data)!).push(i);
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  }, [itens]);
  const todos = q.data?.itens ?? [];
  const conta = (st: string) => todos.filter((i) => (st === 'vai' ? ehVai(i) : i.status === st)).length;
  const rotVai = ligada ? 'Vão receber' : 'Sairiam';
  const Linha = ({ i }: { i: ItemPreviaWA }) => (
    <div className="ev-prev-i">
      <div className="ev-pessoa"><span className="ev-av">{iniciais(i.nome)}</span><div className="ev-cli"><b>{i.nome}</b><span className="num">{i.comercial || 'sem comercial'}{i.dia ? ` · D${d2(i.dia)}` : ''}{i.venc ? ` · vence ${dataBR(i.venc)}` : ''}</span></div></div>
      <div className="ev-cli"><span className="ev-chip">{i.quando != null && i.alvo !== 'cliente' ? `${quandoCurto(i.quando)} · ` : ''}{i.passo_nome}</span><span className="num">{i.numero ? `${i.numero.nome}${i.numero.numero ? ` · ${fmtTel(i.numero.numero)}` : ''}${i.numero.reserva ? ' (reserva)' : ''}` : 'sem número'}</span></div>
      <div className="ev-cli ev-prev-st">
        <BadgeStatus tom={i.falta && i.status !== 'pulado' ? 'erro' : ROT_PREVIA[i.status].tom}>{i.falta && i.status !== 'pulado' ? 'Falta dado na Gestão' : ehVai(i) ? (i.status === 'gerado' ? ROT_PREVIA.gerado.t : rotVai.replace('Vão receber', 'Vai receber').replace('Sairiam', 'Sairia')) : ROT_PREVIA[i.status].t}</BadgeStatus>
        {(i.motivo || i.falta) && <span className="ev-det" title={i.motivo ?? i.falta ?? ''}>{i.motivo ?? i.falta}</span>}
      </div>
      {i.texto && <div className="ev-bolha out mini">{i.texto}</div>}
    </div>
  );
  return (
    <>
      <div className="ev-barra-ferr">
        <Chips>
          <Chip ativo={filtro === 'todos'} onClick={() => setFiltro('todos')}>Todos <span className="num ev-chip-n">{todos.length}</span></Chip>
          <Chip ativo={filtro === 'vai'} onClick={() => setFiltro('vai')}>{rotVai} <span className="num ev-chip-n">{conta('vai')}</span></Chip>
          <Chip ativo={filtro === 'aguardando'} onClick={() => setFiltro('aguardando')}>Aguardando <span className="num ev-chip-n">{conta('aguardando')}</span></Chip>
          <Chip ativo={filtro === 'nao'} onClick={() => setFiltro('nao')}>Não recebem <span className="num ev-chip-n">{conta('pulado')}</span></Chip>
        </Chips>
        <div className="ev-seg" role="tablist" aria-label="Período">
          {([['hoje', 'Hoje'], ['amanha', 'Amanhã'], ['7', '7 dias'], ['14', '14 dias']] as [typeof janela, string][]).map(([k, t]) => (
            <button key={k} type="button" role="tab" aria-selected={janela === k} className={janela === k ? 'on' : ''} onClick={() => { setJanela(k); setAberto(k === 'hoje' ? hoje : k === 'amanha' ? somaDiasIso(hoje, 1) : null); }}>{t}</button>
          ))}
        </div>
      </div>
      <div className={ligada ? 'ev-aviso info' : 'ev-aviso'}>
        <span className="ev-aviso-ic"><Ico d={IC.info} s={14} /></span>
        <span className="ev-aviso-t">{ligada
          ? 'Calculado pelo próprio motor com os dados de agora (pagamentos, números, telefones, pedidos de saída). Se um cliente pagar antes, ele sai da lista sozinho.'
          : 'A régua está desligada: esta lista mostra o que sairia em cada dia se ela estivesse ligada. Nada é enviado.'}
          {(janela === '7' || janela === '14') ? ' Abra um dia para ver os clientes; o texto exato aparece nas visões Hoje e Amanhã.' : ''}</span>
      </div>
      {q.isLoading ? <div className="cm-hint">Calculando a régua…</div> : q.isError ? <CardVidro spot sobe style={{ borderRadius: 'var(--r-card)' }}><EstadoVazio titulo="Não foi possível calcular" descricao={q.error?.message ?? ''} /></CardVidro> : porDia.length === 0 ? (
        <CardVidro spot sobe style={{ borderRadius: 'var(--r-card)' }}><EstadoVazio titulo="Nenhuma mensagem nesse período" descricao="Nenhum cliente em cobrança tem passo da régua nesses dias (ou o filtro escondeu)." /></CardVidro>
      ) : porDia.map(([dia, xs]) => {
        const vai = xs.filter(ehVai);
        const ag = xs.filter((i) => i.status === 'aguardando');
        const nao = xs.filter((i) => i.status === 'pulado');
        const aberta = aberto === dia;
        const [y, m, d] = dia.split('-').map(Number);
        const dow = DIA_SEM[new Date(y, m - 1, d).getDay()];
        return (
          <CardVidro spot sobe key={dia} className={aberta ? 'ev-dia on' : 'ev-dia'}>
            <button type="button" className="ev-dia-cab" onClick={() => setAberto(aberto === dia ? null : dia)} aria-expanded={aberta}>
              <span className={dia === hoje ? 'ev-data hoje' : 'ev-data'}><i>{dia === hoje ? 'hoje' : dow}</i><b className="num">{d2(d)}/{d2(m)}</b></span>
              <span className="ev-dia-cont">
                <span className="ev-dia-n ok"><b className="num">{vai.length}</b>{!ligada ? 'sairiam' : vai.some((i) => i.status === 'gerado') ? 'vão receber ou já saíram' : 'vão receber'}</span>
                <span className="ev-dia-n atencao"><b className="num">{ag.length}</b>aguardando</span>
                <span className="ev-dia-n"><b className="num">{nao.length}</b>não recebem</span>
              </span>
              <span className="ev-dia-barra" aria-hidden>
                <i className="ok" style={{ width: `${pct(vai.length, xs.length)}%` }} />
                <i className="atencao" style={{ width: `${pct(ag.length, xs.length)}%` }} />
                <i className="cinza" style={{ width: `${pct(nao.length, xs.length)}%` }} />
              </span>
              <span className={aberta ? 'ev-chev on' : 'ev-chev'}><Ico d={IC.seta} s={14} /></span>
            </button>
            {aberta && (
              <div className="ev-prev-lista">
                {([[rotVai, vai], ['Aguardando', ag], ['Não recebem', nao]] as [string, ItemPreviaWA[]][]).filter(([, g]) => g.length).map(([t, g]) => (
                  <div key={t} className="ev-prev-grupo">
                    <div className="ev-prev-gt">{t} <span className="num">{g.length}</span></div>
                    {g.map((i) => <Linha key={`${i.lead_id}-${i.passo_id}`} i={i} />)}
                  </div>
                ))}
              </div>
            )}
          </CardVidro>
        );
      })}
    </>
  );
}

/* ---------- aba 3: campanhas (cada envio da régua/manual, com %) ---------- */
function Campanhas({ canais, linhaPorId, gestor, aoAvisar, aoAbrir, aoConversa, cx }: {
  canais: CanalWA[]; linhaPorId: Map<string, GLinha>; gestor: boolean; aoAvisar: (t: string) => void; aoAbrir: (a: AlvoWA) => void; aoConversa: (id: string) => void; cx: CtxStatus;
}) {
  const q = useEnviosWA();
  const cancelar = useCancelarEnvioWA();
  const meuId = usePapel().data?.id ?? null;
  const [ver, setVer] = useState<EnvioWA | null>(null);
  const [confCancelar, setConfCancelar] = useState<EnvioWA | null>(null);
  const [filtro, setFiltro] = useState<'todos' | 'andamento' | 'regua' | 'manual'>('todos');
  const todos = q.data ?? [];
  const envios = todos.filter((e) => filtro === 'todos' || (filtro === 'andamento' ? e.estado === 'enviando' || e.estado === 'rascunho' : e.origem === filtro));
  const canalDe = (id: string | null) => canais.find((c) => c.id === id);
  const rot = (e: EnvioWA): { t: string; tom: TomStatus } => {
    if (e.estado === 'cancelado') return { t: 'Cancelado', tom: 'neutro' };
    if (e.estado === 'concluido') return e.erros > 0 ? { t: `Concluído · ${e.erros} erro${e.erros === 1 ? '' : 's'}`, tom: 'atencao' } : { t: 'Concluído', tom: 'ok' };
    if (e.estado === 'enviando') {
      const c = canalDe(e.canal_id);
      if (c && c.estado !== 'conectado') return { t: 'Aguardando número', tom: 'atencao' };
      if (e.origem === 'regua' && (!cx.reguaLigada || foraDaJanela(cx))) return { t: 'Parada', tom: 'atencao' };
      return { t: 'Enviando…', tom: 'atencao' };
    }
    if (e.agendado_para && new Date(e.agendado_para).getTime() > Date.now()) return { t: `Agendado · ${dataHora(e.agendado_para)}`, tom: 'neutro' };
    return { t: 'Na fila', tom: 'neutro' };
  };
  const cols: Coluna<EnvioWA>[] = [
    { chave: 'nm', titulo: 'Envio', render: (e) => <div className="ev-cli"><b>{e.origem === 'regua' ? (e.passo_nome ?? e.nome.replace(/^Régua:\s*/, '')) : e.nome}</b><span className="ev-chip">{e.origem === 'regua' ? `Régua${e.passo_quando != null ? ` · ${quandoCurto(e.passo_quando)}` : ''}` : 'Manual'}</span></div> },
    { chave: 'canal', titulo: 'Saiu por', render: (e) => { const c = canalDe(e.canal_id); return c ? <span className="ev-saiu" title={c.numero ? `Número ${fmtTel(c.numero)}` : undefined}>{nomeCanal(c)}</span> : '—'; } },
    { chave: 'quando', titulo: 'Criado', classe: 'num', render: (e) => dataHora(e.created_at) },
    // o % sai da MESMA fração que aparece ao lado (enviadas ÷ total), limitado a 100 — antes somava
    // erros e não enviadas e mostrava "104% · 74/75"; os erros viram segmento vermelho e texto à parte
    { chave: 'prog', titulo: 'Progresso', render: (e) => {
      const tot = Math.max(e.total, 1);
      const pOk = Math.min(100, pct(e.enviados, tot));
      const pErr = Math.min(100 - pOk, pct(e.erros, tot));
      const pPul = Math.min(100 - pOk - pErr, pct(e.pulados ?? 0, tot));
      return (
        <div className="ev-prog" title={`${plural(e.enviados, 'enviada', 'enviadas')} · ${plural(e.erros, 'com erro', 'com erro')} · ${plural(e.pulados ?? 0, 'não enviada', 'não enviadas')} (pagou, saiu da régua, expirou ou cancelado)`}>
          <div className="ev-barra"><i className="ok" style={{ width: `${pOk}%` }} /><i className="erro" style={{ width: `${pErr}%` }} /><i className="neutro" style={{ width: `${pPul}%` }} /></div>
          <span className="num"><b>{pOk}%</b> · {Math.min(e.enviados, e.total)} de {e.total} enviadas{e.erros > 0 && <em className="ev-prog-err"> · {plural(e.erros, 'erro', 'erros')}</em>}</span>
        </div>
      );
    } },
    { chave: 'st', titulo: 'Status', render: (e) => { const r = rot(e); return <BadgeStatus tom={r.tom}>{r.t}</BadgeStatus>; } },
    { chave: 'ac', titulo: '', render: (e) => (
      <div className="fin-acoes">
        <BotaoSec mini onClick={(ev) => { ev.stopPropagation(); setVer(e); }}>Ver clientes</BotaoSec>
        {(gestor || (e.origem === 'manual' && !!meuId && e.criado_por === meuId)) && (e.estado === 'rascunho' || e.estado === 'enviando') && <button type="button" className="p-btn btn-perigo btn-mini" disabled={cancelar.isPending}
          onClick={(ev) => { ev.stopPropagation(); setConfCancelar(e); }}>Cancelar envio</button>}
      </div>
    ) },
  ];
  return (
    <>
      <div className="ev-barra-ferr">
        <Chips>
          <Chip ativo={filtro === 'todos'} onClick={() => setFiltro('todos')}>Todos <span className="num ev-chip-n">{todos.length}</span></Chip>
          <Chip ativo={filtro === 'andamento'} onClick={() => setFiltro('andamento')}>Em andamento <span className="num ev-chip-n">{todos.filter((e) => e.estado === 'enviando' || e.estado === 'rascunho').length}</span></Chip>
          <Chip ativo={filtro === 'regua'} onClick={() => setFiltro('regua')}>Da régua</Chip>
          <Chip ativo={filtro === 'manual'} onClick={() => setFiltro('manual')}>Manuais</Chip>
        </Chips>
      </div>
      <CardVidro spot sobe className="ev-tabela">
        {q.isLoading ? <div className="cm-hint" style={{ padding: 16 }}>Carregando…</div>
          : q.isError && !q.data ? <EstadoVazio titulo="Não foi possível carregar as campanhas" descricao={q.error?.message ?? 'Tente de novo.'} />
          : envios.length === 0
          ? <EstadoVazio titulo="Nenhum envio aqui" descricao="A régua cria um envio por passo e por número a cada dia; os envios manuais aparecem aqui também." />
          : <TabelaPadrao colunas={cols} linhas={envios} chave={(e) => e.id} aoClicarLinha={setVer} rodape={{ texto: `${envios.length} envio${envios.length === 1 ? '' : 's'} (os mais recentes)` }} />}
      </CardVidro>
      {ver && (
        <ModalV2 aberto aoFechar={() => setVer(null)} largura={1080}
          titulo={<div>{ver.origem === 'regua' ? `Régua · ${ver.passo_nome ?? ver.nome}` : ver.nome}<div className="mod-sub">{plural(ver.total, 'cliente', 'clientes')} · {plural(ver.enviados, 'enviada', 'enviadas')} · {plural(ver.erros, 'erro', 'erros')} · criado em {dataHora(ver.created_at)}</div></div>}
          rodape={<BotaoSec onClick={() => setVer(null)}>Fechar</BotaoSec>}>
          <ListaEnvios canais={canais} linhaPorId={linhaPorId} gestor={gestor} aoAvisar={aoAvisar} aoAbrir={(a) => { setVer(null); aoAbrir(a); }} aoConversa={aoConversa} envioId={ver.id} cx={cx} />
        </ModalV2>
      )}
      {confCancelar && (
        <ModalV2 aberto aoFechar={() => setConfCancelar(null)} largura={440}
          titulo={<div>Cancelar este envio?<div className="mod-sub">{confCancelar.origem === 'regua' ? `Régua · ${confCancelar.passo_nome ?? confCancelar.nome}` : confCancelar.nome}</div></div>}
          rodape={<><BotaoSec onClick={() => setConfCancelar(null)}>Voltar</BotaoSec>
            <button type="button" className="p-btn btn-perigo" disabled={cancelar.isPending} onClick={() => cancelar.mutate(confCancelar.id, {
              onSuccess: (n) => { setConfCancelar(null); aoAvisar(`Envio cancelado: ${plural(n, 'cliente que ainda não tinha recebido ficou', 'clientes que ainda não tinham recebido ficaram')} como "cancelado".`); },
              onError: (err) => { setConfCancelar(null); aoAvisar((err as Error).message); },
            })}>{cancelar.isPending ? 'Cancelando…' : 'Cancelar envio'}</button></>}>
          <p className="cm-hint" style={{ margin: 0 }}>Quem ainda não recebeu ({Math.max(0, confCancelar.total - confCancelar.enviados - confCancelar.erros - (confCancelar.pulados ?? 0))}) não recebe mais e fica marcado como “cancelado” em Envios. O que já saiu continua saído. {confCancelar.origem === 'regua' ? 'Esses clientes não recebem este passo de novo neste mês.' : ''}</p>
        </ModalV2>
      )}
    </>
  );
}

/* ---------- aba 4: quem não recebe (pediu SAIR ou foi tirado à mão) ---------- */
function NaoRecebem({ itens, carregando, erro, dados, gestor, aoAvisar }: { itens: OptoutWA[]; carregando: boolean; erro: string | null; dados: Dados; gestor: boolean; aoAvisar: (t: string) => void }) {
  const voltar = useVoltarAReceberWA();
  const porChave = useMemo(() => {
    const m = new Map<string, GLinha>();
    for (const l of linhasComCancelados(dados)) { const d = soDigitos(l.telefone ?? ''); if (d.length >= 10) { const x = d.length >= 12 && d.startsWith('55') ? d.slice(2) : d; m.set(x.slice(0, 2) + x.slice(-8), l); } }
    return m;
  }, [dados]);
  const cols: Coluna<OptoutWA>[] = [
    { chave: 'cli', titulo: 'Cliente', render: (o) => { const l = linhasComCancelados(dados).find((x) => x.id === o.lead_id) ?? porChave.get(o.chave); return <div className="ev-cli"><b>{l?.nome ?? 'Contato fora da base'}</b><span className="num">{fmtTel(o.telefone ?? o.chave)}</span></div>; } },
    { chave: 'como', titulo: 'Como', render: (o) => o.origem === 'cliente' ? <span>Cliente pediu {o.texto ? <>(“{o.texto}”)</> : null}</span> : 'Tirado da régua à mão' },
    { chave: 'quando', titulo: 'Desde', classe: 'num', render: (o) => dataHora(o.criado_em) },
    { chave: 'ac', titulo: <span className="cc-vh">Ações</span>, render: (o) => gestor ? <BotaoSec mini disabled={voltar.isPending} onClick={() => voltar.mutate(o, { onSuccess: () => aoAvisar('O cliente voltou a receber a régua. É possível desfazer pelo botão Desfazer.'), onError: (e) => aoAvisar((e as Error).message) })}>Voltar a receber</BotaoSec> : null },
  ];
  return (
    <>
      <div className="ev-aviso info">
        <span className="ev-aviso-ic"><Ico d={IC.info} s={14} /></span>
        <span className="ev-aviso-t">Quem responde “sair” ou “parar” no WhatsApp sai da régua e dos envios em massa na hora. A conversa pelo chat continua normalmente.</span>
      </div>
      <CardVidro spot sobe className="ev-tabela">
        {carregando ? <div className="cm-hint" style={{ padding: 16 }}>Carregando…</div>
          : erro ? <EstadoVazio titulo="Não foi possível carregar a lista" descricao={erro} />
          : itens.length === 0 ? <EstadoVazio icone={<IconeSaida />} titulo="Nenhum cliente fora da régua" descricao="Quem responder “sair” ou “parar” aparece aqui e deixa de receber." />
          : <TabelaPadrao colunas={cols} linhas={itens} chave={(o) => o.chave} rodape={{ texto: `${itens.length} contato${itens.length === 1 ? '' : 's'} fora da régua` }} />}
      </CardVidro>
    </>
  );
}

/* ---------- NOVO ENVIO: compositor completo (regra do dono 12/09) ---------- */
function NovoEnvio({ canais, dados, aoAvisar, aoFechar }: { canais: CanalWA[]; dados: Dados; aoAvisar: (t: string) => void; aoFechar: () => void }) {
  const criar = useCriarEnvioWA();
  const clientes = useMemo(() => clientesReais(dados), [dados]);
  const conectados = canais.filter((c) => c.estado === 'conectado');
  const [canalSel0, setCanalSel] = useState('');
  const canalSel = canalSel0 || conectados[0]?.id || '';
  const [msg, setMsg] = useState<MsgDef>({ id: rid('env'), nome: '', quando: 0, blocos: [{ tipo: 'texto', corpo: '' }] });
  const [modo, setModo] = useState<'agora' | 'agendar'>('agora');
  const [dataAg, setDataAg] = useState('');
  const [horaAg, setHoraAg] = useState('09:00');
  const [alvos, setAlvos] = useState<{ telefone: string; nome?: string | null; lead_id?: string | null }[]>([]);
  const [buscaCli, setBuscaCli] = useState('');
  const [telAvulso, setTelAvulso] = useState('');
  const [delayMin, setDelayMin] = useState('20');
  const [delayMax, setDelayMax] = useState('45');
  const [presenca, setPresenca] = useState(true);
  const [criando, setCriando] = useState(false);
  // avisos (sem bloquear): a janela 8h–20h e o teto diário valem só pra régua — aqui só alertamos
  const cfgQ = useReguaConfigWA();
  const teto = cfgQ.data?.teto_diario ?? 0;
  const horaEfetiva = modo === 'agendar' ? (horaAg ? Number(horaAg.slice(0, 2)) : null) : new Date().getHours();
  const foraHorario = horaEfetiva != null && (horaEfetiva < 8 || horaEfetiva >= 20);
  const acimaTeto = teto > 0 && alvos.length > teto;

  const addAlvo = (a: { telefone: string; nome?: string | null; lead_id?: string | null }) => {
    const tel = soDigitos(a.telefone);
    const ch = chaveTel(tel);
    if (!ch) { aoAvisar('Número incompleto: informe o DDD e o número.'); return; }
    // dedupe pela chave canônica: com/sem 55 ou com/sem o 9º dígito é o MESMO telefone (senão o cliente recebe 2×)
    const jaTem = alvos.find((x) => chaveTel(x.telefone) === ch);
    if (jaTem) { aoAvisar(jaTem.telefone === tel ? 'Esse número já está na lista.' : 'Esse número já está na lista (formato diferente).'); return; }
    setAlvos((xs) => (xs.some((x) => chaveTel(x.telefone) === ch) ? xs : [...xs, { ...a, telefone: tel }]));
  };
  const sugestoes = useMemo(() => {
    const s = buscaCli.trim().toLowerCase();
    if (s.length < 2) return [];
    return clientes.filter((c) => c.whatsapp && c.nome.toLowerCase().includes(s)).slice(0, 8);
  }, [clientes, buscaCli]);
  const enviaveis: Bloco[] = msg.blocos.filter((b) => (b.tipo === 'texto' ? !!(b.corpo ?? '').trim() : !!b.path));
  const previa = useMemo(() => {
    if (!alvos.length) return null;
    const a = alvos[0];
    const cli = a.lead_id ? clientes.find((c) => c.id === a.lead_id) ?? null : null;
    const canal = canais.find((c) => c.id === canalSel);
    const partes = enviaveis.map((b) => {
      const r = (b.corpo ?? '').trim() ? aplicarVarsCliente((b.corpo ?? '').trim(), { nome: cli?.nome ?? a.nome ?? '', valorTotal: cli ? cli.mensalidade * 2 : null, atendente: canal ? nomeCanal(canal) : '', dia: cli ? Number(cli.ciclo.replace(/\D/g, '')) || null : null }) : { texto: '', faltando: [] as string[] };
      return { b, ...r };
    });
    return { quem: cli?.nome ?? a.nome ?? fmtTel(a.telefone), partes, faltando: [...new Set(partes.flatMap((p) => p.faltando))] };
  }, [alvos, clientes, canais, canalSel, enviaveis]);

  const criarEnvio = async () => {
    if (!canalSel) { aoAvisar('Escolha o número. Sem número conectado? Conecte em Números.'); return; }
    if (!enviaveis.length) { aoAvisar('Escreva a mensagem ou anexe um arquivo (e espere ele salvar).'); return; }
    if (msg.blocos.some((b) => b.tipo !== 'texto' && !b.path)) { aoAvisar('Tem arquivo ainda não salvo na mensagem — espere salvar ou remova a parte vazia.'); return; }
    if (!alvos.length) { aoAvisar('Adicione pelo menos um destinatário.'); return; }
    let agendado: string | null = null;
    if (modo === 'agendar') {
      if (!dataAg || !horaAg) { aoAvisar('Escolha o dia e o horário.'); return; }
      const dt = new Date(`${dataAg}T${horaAg}`);
      if (!(dt.getTime() > Date.now())) { aoAvisar('O agendamento precisa ser no futuro.'); return; }
      agendado = dt.toISOString();
    }
    const dMin = Math.max(5, Number(delayMin) || 20);
    setCriando(true);
    try {
      const canal = canais.find((c) => c.id === canalSel);
      await new Promise<void>((res, rej) => criar.mutate({
        nome: msg.nome.trim() || `Envio ${new Date().toLocaleDateString('pt-BR')}`, canal_id: canalSel, texto: '',
        blocos: msg.blocos, agendado_para: agendado, alvos, delay_min: dMin, delay_max: Math.max(dMin, Number(delayMax) || 45), presenca,
      }, { onSuccess: () => res(), onError: (e) => rej(e) }));
      aoFechar();
      aoAvisar(agendado ? `Envio agendado para ${dataHora(agendado)} pelo número de ${canal ? nomeCanal(canal) : '—'}.` : `Envio criado e saindo agora pelo número de ${canal ? nomeCanal(canal) : '—'}. Acompanhe em "Envios feitos".`);
    } catch (e) { aoAvisar((e as Error).message); } finally { setCriando(false); }
  };

  return (
    <ModalV2 aberto aoFechar={aoFechar} largura={660}
      titulo={<div>Novo envio<div className="mod-sub">Texto, áudio, foto, vídeo e documento, na ordem. O administrador envia por qualquer número; o comercial, só pelo dele.</div></div>}
      rodape={<><BotaoSec onClick={aoFechar}>Cancelar</BotaoSec><BotaoPrimario onClick={() => { void criarEnvio(); }} disabled={criando || criar.isPending}>{criando || criar.isPending ? 'Criando…' : modo === 'agendar' ? 'Agendar envio' : `Enviar agora${alvos.length ? ` (${alvos.length})` : ''}`}</BotaoPrimario></>}>
      <div className="gs-form" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="campo gs-col2"><label>Sai pelo número</label>
          <select className="inp" value={canalSel} onChange={(e) => setCanalSel(e.target.value)}>
            {conectados.length === 0 && <option value="">Nenhum número conectado</option>}
            {conectados.map((c) => <option key={c.id} value={c.id}>{nomeCanal(c)}{c.numero ? ` · ${fmtTel(c.numero)}` : ''}</option>)}
          </select>
        </div>
      </div>
      <EditorMsg msg={msg} setMsg={setMsg} setAviso={aoAvisar} aoSubirMidia={subirMidiaWA} />
      <div className="gs-form" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 10 }}>
        <div className="campo gs-col2"><label>Destinatários ({alvos.length})</label>
          {alvos.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {alvos.map((a) => <button type="button" key={a.telefone} className="cm-cli-filtro-btn" title="Clique para remover" onClick={() => setAlvos((xs) => xs.filter((x) => x.telefone !== a.telefone))}>{a.nome ?? fmtTel(a.telefone)} ×</button>)}
            </div>
          )}
          <Input value={buscaCli} placeholder="Buscar cliente da base pelo nome…" onChange={(e) => setBuscaCli(e.target.value)} />
          {sugestoes.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
              {sugestoes.map((c) => (
                <button type="button" key={c.id} className="cm-cli-filtro-btn" style={{ justifyContent: 'space-between' }} onClick={() => { addAlvo({ telefone: soDigitos(c.whatsapp ?? ''), nome: c.nome, lead_id: c.id }); setBuscaCli(''); }}>
                  {c.nome}<span className="num" style={{ color: 'var(--txt-3)' }}>{c.whatsapp}</span>
                </button>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <Input value={telAvulso} inputMode="tel" placeholder="Ou número avulso: 51 99999-0000" onChange={(e) => setTelAvulso(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { addAlvo({ telefone: telAvulso }); setTelAvulso(''); } }} />
            <BotaoSec mini onClick={() => { addAlvo({ telefone: telAvulso }); setTelAvulso(''); }}>Adicionar</BotaoSec>
          </div>
        </div>
        {previa && (
          <div className="campo gs-col2"><label>Prévia — como chega para {previa.quem}</label>
            {previa.faltando.length > 0
              ? <div className="ev-aviso" style={{ margin: 0 }}><span className="ev-aviso-ic"><Ico d={IC.alerta} s={14} /></span><span className="ev-aviso-t">Este destinatário está sem <b>{previa.faltando.join(' e ')}</b> no cadastro. A mensagem dele não sai errada: vira um erro explicado em Envios. Complete o cadastro na Gestão antes.</span></div>
              : <div className="ev-bolha">{previa.partes.map((p) => (p.b.tipo === 'texto' ? p.texto : `[${p.b.tipo === 'audio' ? 'Áudio' : p.b.tipo === 'imagem' ? 'Imagem' : p.b.tipo === 'video' ? 'Vídeo' : 'Documento'}${p.b.nome ? `: ${p.b.nome}` : ''}]${p.texto ? ` ${p.texto}` : ''}`)).join('\n\n') || '—'}</div>}
          </div>
        )}
        <div className="campo gs-col2"><label>Quando</label>
          <div className="cm-seg" role="tablist" aria-label="Quando enviar" style={{ margin: 0 }}>
            <button type="button" role="tab" aria-selected={modo === 'agora'} className={modo === 'agora' ? 'cm-seg-btn on' : 'cm-seg-btn'} onClick={() => setModo('agora')}>Agora</button>
            <button type="button" role="tab" aria-selected={modo === 'agendar'} className={modo === 'agendar' ? 'cm-seg-btn on' : 'cm-seg-btn'} onClick={() => setModo('agendar')}>Agendar dia e horário</button>
          </div>
        </div>
        {modo === 'agendar' && (<>
          <div className="campo"><label>Dia</label><Input type="date" value={dataAg} onChange={(e) => setDataAg(e.target.value)} /></div>
          <div className="campo"><label>Horário</label><Input type="time" value={horaAg} onChange={(e) => setHoraAg(e.target.value)} /></div>
        </>)}
        {(foraHorario || acimaTeto) && (
          <div className="campo gs-col2" style={{ gap: 6 }}>
            {foraHorario && <div className="ev-aviso" style={{ margin: 0 }}><span className="ev-aviso-ic"><Ico d={IC.alerta} s={14} /></span><span className="ev-aviso-t">Fora do horário comercial: envio em massa de madrugada pode bloquear o número.</span></div>}
            {acimaTeto && <div className="ev-aviso" style={{ margin: 0 }}><span className="ev-aviso-ic"><Ico d={IC.alerta} s={14} /></span><span className="ev-aviso-t">São {alvos.length} destinatários — acima do teto diário da régua ({teto}). Considere dividir em dias.</span></div>}
          </div>
        )}
        <div className="campo"><label>Intervalo entre clientes <span className="gs-lab-nota">(segundos)</span></label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Input inputMode="numeric" value={delayMin} style={{ width: 70 }} onChange={(e) => setDelayMin(e.target.value.replace(/\D/g, ''))} />
            <span className="cm-hint" style={{ margin: 0 }}>a</span>
            <Input inputMode="numeric" value={delayMax} style={{ width: 70 }} onChange={(e) => setDelayMax(e.target.value.replace(/\D/g, ''))} />
          </div>
        </div>
        <div className="campo"><label>Presença humana</label>
          <label className="ev-chk">
            <input type="checkbox" checked={presenca} onChange={(e) => setPresenca(e.target.checked)} />
            Mostrar “digitando…” antes de cada parte
          </label>
        </div>
        <p className="cm-hint gs-col2" style={{ margin: 0 }}>O número é validado no WhatsApp antes de cada envio (número sem WhatsApp vira um erro explicado). Quem pediu para sair não recebe. Cada mensagem aparece em Envios e na conversa do cliente.</p>
      </div>
    </ModalV2>
  );
}
