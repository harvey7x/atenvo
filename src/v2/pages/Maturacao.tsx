import { useCallback, useEffect, useMemo, useState, type CSSProperties, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useOrg } from '@/context/OrgContext';
import {
  MATURACAO_REAL, usePainelMaturacao, useConfigMaturacao, useSalvarConfig,
  useCriarChip, useAtualizarChip, useIniciarChip, usePausarChip, useExcluirChip,
  useQrChip, useStatusChip, useAplicarPerfil,
  useSementes, useAdicionarSemente, useExcluirSemente,
  useConteudo, useAdicionarConteudo, useExcluirConteudo,
  saudeChip, formatarNumero, classeScore, SAUDE_LABEL, STATUS_MATURACAO_LABEL, STATUS_INTEGRACAO_LABEL,
  SCORE_CLASSE_LABEL, PERFIS, RISCO_LABEL, TIPO_LABEL, CATEGORIA_LABEL, DIAS_SEMANA,
  type ChipPainel, type MaturacaoConfig, type ConfigPatch, type TipoConteudo, type CategoriaConteudo,
  type PerfilPreset, type Semente, type Conteudo, type StatusIntegracao,
} from '@/data/maturacao';
import { tempoRelativo } from '../lib/tempo';
import {
  BadgeStatus, BotaoMini, BotaoPrimario, BotaoSec, CardVidro, Chip, ConfirmDialogV2,
  Input, Kpi, ModalV2, Skeleton, type TomStatus,
} from '../components';
import './maturacao.css';

/* ------------------------------------------------------------------
   Maturação de Números v2 — órfã (manual de extensão), admin-only
   (RequireRoleV2 no roteador). Funcional de src/pages/Maturacao.tsx
   (somente leitura); dados 100% em src/data/maturacao.ts. Linha
   vertical de operação: modo → placar do pool → chips → estratégia →
   sementes → conteúdo → configuração. Aquecimento é ISOLADO do
   atendimento: não entra no Inbox e não consome vaga do plano.
   ------------------------------------------------------------------ */

const Ic = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{children}</svg>
);
const IcQr = () => <Ic><rect x="3" y="3" width="7" height="7" rx="1.4" /><rect x="14" y="3" width="7" height="7" rx="1.4" /><rect x="3" y="14" width="7" height="7" rx="1.4" /><path d="M14 14h3v3M21 14v7h-7v-3" /></Ic>;
const IcInfo = () => <Ic><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></Ic>;
const IcAlerta = () => <Ic><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></Ic>;
const IcCheck = () => <Ic><path d="M5 13l4 4L19 7" /></Ic>;
const IcSeed = () => <Ic><path d="M12 21c0-6 3-10 8-11 0 6-3 10-8 11z" /><path d="M12 21C7 20 4 16 4 10c5 1 8 5 8 11z" /></Ic>;
const IcLib = () => <Ic><rect x="4" y="3" width="16" height="18" rx="2.2" /><path d="M8 8h8M8 12h8M8 16h5" /></Ic>;
const IcGear = () => <Ic><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" /></Ic>;
const IcRamp = () => <Ic><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></Ic>;

const OPERADORAS = ['Vivo', 'Claro', 'TIM', 'Oi', 'Outra'];
const msgErro = (e: unknown) => (e as Error)?.message || 'Falha na operação.';
const MAT_TOM: Record<string, TomStatus> = { novo: 'neutro', aquecendo: 'ok', pausado: 'atencao', maduro: 'ok', banido: 'erro', erro: 'erro' };
const INT_TOM: Record<string, TomStatus> = { conectado: 'ok', sincronizando: 'atencao', desconectado: 'neutro', erro: 'erro' };

type Aviso = { tom: 'ok' | 'erro'; texto: string } | null;

/* ---------- modo demonstração: seed + mutações em memória ---------- */
interface SeedMat {
  chips: ChipPainel[];
  sementes: Semente[];
  conteudo: Conteudo[];
  config: MaturacaoConfig;
}
function chipDemo(n: Partial<ChipPainel> & { chip_id: string; apelido: string }): ChipPainel {
  return {
    numero_conectado: null, status_integracao: 'desconectado', status_maturacao: 'novo',
    dia_rampa: 0, perfil_ok: false, enviadas_7d: 0, entregues_7d: 0, lidas_7d: 0, erros_7d: 0,
    pendentes_hoje: 0, ultimo_erro_em: null, proxy_resumo: null, proxy_ativo: false,
    proxy_pendente: false, proxy_ultimo_erro: null, score: 100, score_classe: 'saudavel', ...n,
  };
}
function seedMat(): SeedMat {
  const h = 3_600_000; const agora = Date.now();
  const iso = (t: number) => new Date(t).toISOString();
  return {
    chips: [
      chipDemo({ chip_id: 'mc-1', apelido: 'Chip 1 — Vivo', numero_conectado: '5551988770001', status_integracao: 'conectado', status_maturacao: 'aquecendo', dia_rampa: 12, perfil_ok: true, enviadas_7d: 84, entregues_7d: 81, lidas_7d: 62, erros_7d: 0, pendentes_hoje: 9, score: 86, score_classe: 'saudavel' }),
      chipDemo({ chip_id: 'mc-2', apelido: 'Chip 2 — Claro', numero_conectado: '5551988770002', status_integracao: 'conectado', status_maturacao: 'aquecendo', dia_rampa: 5, perfil_ok: true, enviadas_7d: 31, entregues_7d: 24, lidas_7d: 12, erros_7d: 2, pendentes_hoje: 6, ultimo_erro_em: iso(agora - 3 * h), score: 58, score_classe: 'atencao' }),
      chipDemo({ chip_id: 'mc-3', apelido: 'Chip 3 — TIM', status_maturacao: 'novo', score: 100, score_classe: 'saudavel' }),
      chipDemo({ chip_id: 'mc-4', apelido: 'Chip 4 — Vivo', numero_conectado: '5551988770004', status_integracao: 'conectado', status_maturacao: 'pausado', dia_rampa: 21, perfil_ok: true, enviadas_7d: 12, entregues_7d: 5, lidas_7d: 2, erros_7d: 4, pendentes_hoje: 0, ultimo_erro_em: iso(agora - 50 * 60_000), score: 34, score_classe: 'risco' }),
    ],
    sementes: [
      { id: 'ms-1', organizacao_id: 'org_demo', apelido: 'Celular da Juliana', numero: '5551999990001', ativo: true, observacao: null, criado_em: iso(agora - 200 * h) },
      { id: 'ms-2', organizacao_id: 'org_demo', apelido: 'Chip maduro 08', numero: '5551999990002', ativo: true, observacao: null, criado_em: iso(agora - 90 * h) },
    ],
    conteudo: [
      { id: 'mt-1', organizacao_id: 'org_demo', tipo: 'texto', categoria: 'abertura', texto: 'Oi, tudo certo por aí?', storage_path: null, mime_type: null, usos: 14, ativo: true, criado_em: iso(agora - 300 * h) },
      { id: 'mt-2', organizacao_id: 'org_demo', tipo: 'texto', categoria: 'resposta', texto: 'Tudo ótimo! E contigo?', storage_path: null, mime_type: null, usos: 11, ativo: true, criado_em: iso(agora - 280 * h) },
      { id: 'mt-3', organizacao_id: 'org_demo', tipo: 'texto', categoria: 'conversa', texto: 'Viu o jogo ontem? Que loucura o segundo tempo.', storage_path: null, mime_type: null, usos: 6, ativo: true, criado_em: iso(agora - 120 * h) },
      { id: 'mt-4', organizacao_id: 'org_demo', tipo: 'figurinha', categoria: 'resposta', texto: null, storage_path: 'demo/fig.webp', mime_type: 'image/webp', usos: 3, ativo: true, criado_em: iso(agora - 40 * h) },
    ],
    config: {
      organizacao_id: 'org_demo', modo: 'dry_run', timezone: 'America/Sao_Paulo',
      hora_inicio: 9, hora_fim: 20, dias_semana: [1, 2, 3, 4, 5, 6], rampa: null,
      dia_sementes: 3, min_sementes: 2, pct_sementes: 30, dias_para_maduro: 30,
      perfil_rampa: 'padrao_30', atualizado_em: iso(agora - 24 * h), atualizado_por: null,
    },
  };
}
/** QR de demonstração: padrão xadrez em SVG (nenhuma sessão real envolvida). */
function qrDemo(): string {
  let cels = '';
  let x0 = 137;
  for (let y = 0; y < 21; y++) for (let x = 0; x < 21; x++) {
    x0 = (x0 * 16807) % 2147483647;
    if (x0 % 5 < 2) cels += `<rect x="${x * 10}" y="${y * 10}" width="10" height="10"/>`;
  }
  const olho = (x: number, y: number) => `<rect x="${x}" y="${y}" width="70" height="70" fill="none" stroke="#000" stroke-width="10"/><rect x="${x + 20}" y="${y + 20}" width="30" height="30"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 210 210" fill="#000"><rect width="210" height="210" fill="#fff"/>${cels}${olho(0, 0)}${olho(140, 0)}${olho(0, 140)}</svg>`;
  return 'data:image/svg+xml;base64,' + btoa(svg);
}

export default function MaturacaoV2() {
  const { currentOrg } = useOrg();
  const qc = useQueryClient();
  const demo = !MATURACAO_REAL;
  const painel = usePainelMaturacao();
  const config = useConfigMaturacao();
  const salvarConfig = useSalvarConfig();
  const excluirChipMut = useExcluirChip();

  const [aviso, setAviso] = useState<Aviso>(null);
  const [seed, setSeed] = useState<SeedMat | null>(() => (demo ? seedMat() : null));
  const [novoChip, setNovoChip] = useState(false);
  const [qrChip, setQrChip] = useState<{ id: string; apelido: string } | null>(null);
  const [excluir, setExcluir] = useState<ChipPainel | null>(null);
  const [trocarModo, setTrocarModo] = useState<'dry_run' | 'ativo' | null>(null);
  const [busyModo, setBusyModo] = useState(false);
  const [busyExcluir, setBusyExcluir] = useState(false);

  const chips = useMemo(() => (demo ? seed?.chips ?? [] : painel.data ?? []), [demo, seed?.chips, painel.data]);
  const cfg = demo ? seed?.config ?? null : config.data ?? null;
  const modo = cfg?.modo ?? 'dry_run';
  const diasMaduro = cfg?.dias_para_maduro ?? 45;

  const aquecendo = chips.filter((c) => c.status_maturacao === 'aquecendo').length;
  const emRisco = chips.filter((c) => saudeChip(c) === 'vermelho').length;
  const mediaScore = chips.length ? Math.round(chips.reduce((s, c) => s + c.score, 0) / chips.length) : null;
  const mediaClasse = mediaScore == null ? null : classeScore(mediaScore);

  const ok = (texto: string) => setAviso({ tom: 'ok', texto });
  const falha = (e: unknown) => setAviso({ tom: 'erro', texto: msgErro(e) });

  async function confirmarModo() {
    if (!trocarModo) return;
    setBusyModo(true);
    try {
      if (demo) setSeed((s) => s && ({ ...s, config: { ...s.config, modo: trocarModo } }));
      else await salvarConfig.mutateAsync({ modo: trocarModo });
      ok(trocarModo === 'ativo' ? 'Modo ativo: as mensagens de aquecimento passam a sair de verdade.' : 'Voltou para simulação. Nada mais é enviado.');
      setTrocarModo(null);
    } catch (e) { falha(e); }
    finally { setBusyModo(false); }
  }

  async function confirmarExclusao() {
    if (!excluir) return;
    setBusyExcluir(true);
    try {
      if (demo) setSeed((s) => s && ({ ...s, chips: s.chips.filter((c) => c.chip_id !== excluir.chip_id) }));
      else await excluirChipMut.mutateAsync(excluir.chip_id);
      ok('Chip excluído. A instância de aquecimento foi derrubada.');
      setExcluir(null);
    } catch (e) { falha(e); }
    finally { setBusyExcluir(false); }
  }

  const carregando = demo ? !seed : painel.isLoading;

  return (
    <>
      <div className="ph sobe">
        <div>
          <h2>Maturação de Números</h2>
          <p>
            Aquecimento de chips de WhatsApp — isolado do atendimento.
            {demo ? ' · modo demonstração (nada é gravado)' : ''}
          </p>
        </div>
        <div className="acoes">
          <BotaoPrimario onClick={() => setNovoChip(true)}>＋ Adicionar chip</BotaoPrimario>
        </div>
      </div>

      {aviso && (
        <div className={aviso.tom === 'erro' ? 'aviso-inline erro' : 'aviso-inline'} role="status">
          {aviso.texto}
          <button type="button" onClick={() => setAviso(null)} aria-label="Fechar aviso">×</button>
        </div>
      )}

      {/* banner de modo — a informação mais importante da tela */}
      <div className={'mat2-modo sobe ' + (modo === 'ativo' ? 'ativo' : 'dry')} style={{ animationDelay: '.05s' }}>
        <span className="ic">{modo === 'ativo' ? <IcCheck /> : <IcAlerta />}</span>
        <div className="tx">
          <strong>{modo === 'ativo' ? 'MODO ATIVO — as mensagens estão saindo de verdade' : 'MODO SIMULAÇÃO — nada é enviado de verdade'}</strong>
          <span>
            {modo === 'ativo'
              ? 'O planejador e o executor estão operando os chips deste pool dentro da janela configurada.'
              : 'O sistema planeja e registra tudo, mas nenhuma mensagem sai. Ative quando os chips estiverem conectados e com o perfil pronto.'}
          </span>
        </div>
        {modo === 'ativo'
          ? <BotaoSec disabled={!cfg || busyModo} onClick={() => setTrocarModo('dry_run')}>Voltar para simulação</BotaoSec>
          : <BotaoPrimario disabled={!cfg || busyModo} onClick={() => setTrocarModo('ativo')}>Ativar envios reais</BotaoPrimario>}
      </div>

      {/* placar do pool — agregação client-side dos chips já carregados */}
      {chips.length > 0 && (
        <div className="kpis sobe" style={{ animationDelay: '.1s', marginBottom: 12 }}>
          <Kpi rotulo="Chips no pool" valor={chips.length} />
          <Kpi rotulo="Aquecendo" valor={aquecendo} />
          <Kpi rotulo="Em risco" valor={emRisco} tomValor={emRisco > 0 ? 'erro' : undefined} />
          {mediaScore != null && mediaClasse && (
            <CardVidro spot className={'mat2-media sc-' + mediaClasse} style={{ padding: '12px 14px' }}>
              <div className="mat2-ring" style={{ '--p': mediaScore } as CSSProperties}>
                <b>{mediaScore}</b><i>/100</i>
              </div>
              <div className="tx">
                <strong>Saúde média do pool · {SCORE_CLASSE_LABEL[mediaClasse]}</strong>
                <span>Média do score de {chips.length} chip{chips.length === 1 ? '' : 's'}. É o placar que avisa cedo quando um número começa a ser restringido — cai antes de o chip cair.</span>
              </div>
            </CardVidro>
          )}
        </div>
      )}

      {/* ---- chips ---- */}
      <CardVidro spot sobe className="mat2-sec" atraso={0.15}>
        <header className="mat2-sec-h">
          <div className="tit">
            <h2>Chips em maturação</h2>
            <p>
              {chips.length === 0 ? 'Nenhum chip cadastrado.' : `${chips.length} chip${chips.length === 1 ? '' : 's'} · ${aquecendo} aquecendo${emRisco ? ` · ${emRisco} em risco` : ''}`}
              {' '}Estes números são isolados: não entram no Inbox, não criam contatos e não consomem vaga de WhatsApp do plano.
            </p>
          </div>
        </header>
        {carregando ? (
          <div className="mat2-grid" aria-hidden>
            {[0, 1, 2].map((i) => (
              <div key={i} className="mtc"><Skeleton largura="55%" altura={13} /><Skeleton largura={52} altura={52} raio={99} /><Skeleton altura={5} raio={99} /><Skeleton largura="80%" /></div>
            ))}
          </div>
        ) : (!demo && painel.isError) ? (
          <p style={{ fontSize: 11.5, color: 'var(--rubro)', padding: '8px 0' }}>{msgErro(painel.error)}</p>
        ) : chips.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '26px 0', color: 'var(--txt-3)' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8, opacity: .6 }}><span style={{ width: 26, height: 26, display: 'inline-flex' }}><IcQr /></span></div>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)', marginBottom: 4 }}>Nenhum chip em maturação</h3>
            <p style={{ fontSize: 11.5, lineHeight: 1.55 }}>Adicione um chip, conecte pelo QR Code, preencha foto/nome/recado no celular e inicie a rampa.</p>
          </div>
        ) : (
          <div className="mat2-grid">
            {chips.map((c) => (
              <ChipCardV2
                key={c.chip_id}
                chip={c}
                demo={demo}
                setSeed={setSeed}
                diasMaduro={diasMaduro}
                aoAvisar={setAviso}
                onConectar={() => setQrChip({ id: c.chip_id, apelido: c.apelido })}
                onExcluir={() => setExcluir(c)}
              />
            ))}
          </div>
        )}
      </CardVidro>

      <EstrategiaSecV2 demo={demo} seed={seed} setSeed={setSeed} aoAvisar={setAviso} />
      <SementesSecV2 demo={demo} seed={seed} setSeed={setSeed} aoAvisar={setAviso} />
      <ConteudoSecV2 demo={demo} seed={seed} setSeed={setSeed} aoAvisar={setAviso} />
      <ConfigSecV2 demo={demo} seed={seed} setSeed={setSeed} aoAvisar={setAviso} />

      {novoChip && (
        <NovoChipModalV2
          demo={demo}
          setSeed={setSeed}
          aoAvisar={setAviso}
          onClose={() => setNovoChip(false)}
          /* já emenda no QR: criar sem conectar deixa um chip inerte no pool */
          onCriado={(id, apelido) => { setNovoChip(false); setQrChip({ id, apelido }); }}
        />
      )}
      {qrChip && (
        <QrModalV2
          chipId={qrChip.id}
          apelido={qrChip.apelido}
          demo={demo}
          setSeed={setSeed}
          onClose={() => { setQrChip(null); if (!demo) qc.invalidateQueries({ queryKey: ['mat-painel', currentOrg.id] }); }}
        />
      )}

      <ConfirmDialogV2
        aberto={!!trocarModo}
        titulo={trocarModo === 'ativo' ? 'Ativar envios reais?' : 'Voltar para simulação?'}
        mensagem={trocarModo === 'ativo'
          ? 'A partir de agora o aquecimento vai enviar mensagens de verdade pelos chips conectados, dentro da janela e dos dias configurados. Confirme que os perfis estão preenchidos e que há sementes externas cadastradas.'
          : 'O aquecimento volta a apenas planejar e registrar: nenhuma mensagem sai. O que já estava agendado para hoje não será enviado.'}
        rotuloConfirmar={trocarModo === 'ativo' ? 'Ativar envios' : 'Voltar para simulação'}
        carregando={busyModo}
        aoConfirmar={confirmarModo}
        aoCancelar={() => { if (!busyModo) setTrocarModo(null); }}
      />

      <ConfirmDialogV2
        aberto={!!excluir}
        titulo="Excluir chip?"
        mensagem={excluir
          ? `O chip "${excluir.apelido}" será excluído DEFINITIVAMENTE: a sessão de aquecimento é derrubada e todo o histórico de agenda e eventos deste chip é apagado. Não há como desfazer.`
          : ''}
        destrutivo
        rotuloConfirmar="Excluir chip"
        carregando={busyExcluir}
        aoConfirmar={confirmarExclusao}
        aoCancelar={() => { if (!busyExcluir) setExcluir(null); }}
      />
    </>
  );
}

/* ===================== card do chip ===================== */
function ChipCardV2({ chip, demo, setSeed, diasMaduro, aoAvisar, onConectar, onExcluir }: {
  chip: ChipPainel; demo: boolean; setSeed: Dispatch<SetStateAction<SeedMat | null>>;
  diasMaduro: number; aoAvisar: (a: Aviso) => void; onConectar: () => void; onExcluir: () => void;
}) {
  const iniciar = useIniciarChip();
  const pausar = usePausarChip();
  const atualizar = useAtualizarChip();

  const saude = saudeChip(chip);
  const conectado = chip.status_integracao === 'conectado';
  const podeIniciar = chip.perfil_ok && conectado && chip.status_maturacao !== 'banido';
  const emRampa = chip.status_maturacao === 'aquecendo';
  const pct = Math.min(100, Math.round((chip.dia_rampa / Math.max(1, diasMaduro)) * 100));
  const taxa = chip.enviadas_7d > 0 ? Math.round((chip.entregues_7d / chip.enviadas_7d) * 100) : null;

  const motivoBloqueio = chip.status_maturacao === 'banido'
    ? 'Chip banido pelo WhatsApp — não é possível reaquecer.'
    : !conectado
      ? 'Conecte o chip pelo QR Code antes de iniciar a rampa.'
      : !chip.perfil_ok
        ? 'Marque “Perfil pronto” depois de definir foto, nome e recado no celular.'
        : undefined;

  const mudaChip = (patch: Partial<ChipPainel>) =>
    setSeed((s) => s && ({ ...s, chips: s.chips.map((x) => x.chip_id === chip.chip_id ? { ...x, ...patch } : x) }));

  async function acao(fn: () => Promise<unknown>, okMsg: string) {
    try { await fn(); aoAvisar({ tom: 'ok', texto: okMsg }); }
    catch (e) { aoAvisar({ tom: 'erro', texto: msgErro(e) }); }
  }

  const ocupado = iniciar.isPending || pausar.isPending || atualizar.isPending;

  return (
    <article className={'mtc s-' + saude + ' sc-' + chip.score_classe}>
      <header className="mtc-h">
        <span className="mtc-sem" title={`Saúde: ${SAUDE_LABEL[saude]}`} />
        <div className="mtc-id">
          <b>{chip.apelido}</b>
          <i>{formatarNumero(chip.numero_conectado)}</i>
        </div>
        <div className="mtc-badges">
          <BadgeStatus tom={MAT_TOM[chip.status_maturacao] ?? 'neutro'}>{STATUS_MATURACAO_LABEL[chip.status_maturacao]}</BadgeStatus>
          <BadgeStatus tom={INT_TOM[chip.status_integracao] ?? 'neutro'}>{STATUS_INTEGRACAO_LABEL[chip.status_integracao]}</BadgeStatus>
        </div>
      </header>

      {/* score da conta: cai antes de o número banir — a métrica mais destacada do card */}
      <div className="mtc-score">
        <div className="mat2-ring" style={{ '--p': chip.score } as CSSProperties}><b>{chip.score}</b></div>
        <div className="mtc-score-tx">
          <span className="l">Saúde da conta</span>
          <span className="c">{SCORE_CLASSE_LABEL[chip.score_classe]}</span>
        </div>
      </div>

      <div>
        <div className="mtc-ramp-l"><span>Dia {chip.dia_rampa} da rampa</span><b>{pct}%</b></div>
        <div className="mtc-bar"><i style={{ width: pct + '%' }} /></div>
        <span className="mtc-ramp-s">Rampa completa em {diasMaduro} dias · {chip.pendentes_hoje} pendente{chip.pendentes_hoje === 1 ? '' : 's'} para hoje</span>
      </div>

      <div className="mtc-kpis">
        <div className="mtc-kpi"><b>{chip.enviadas_7d}</b><i>enviadas</i></div>
        <div className="mtc-kpi ok"><b>{chip.entregues_7d}</b><i>entregues</i></div>
        <div className="mtc-kpi"><b>{chip.lidas_7d}</b><i>lidas</i></div>
        <div className={'mtc-kpi' + (chip.erros_7d > 0 ? ' bad' : '')}><b>{chip.erros_7d}</b><i>erros</i></div>
      </div>
      <div className="mtc-obs">
        {taxa === null ? 'Sem envios nos últimos 7 dias.' : `Entrega de ${taxa}% nos últimos 7 dias.`}
        {chip.ultimo_erro_em ? ` Último erro ${tempoRelativo(chip.ultimo_erro_em, Date.now())}.` : ''}
      </div>

      <label className={'mtc-check' + (chip.perfil_ok ? ' on' : '')}>
        <input
          type="checkbox"
          checked={chip.perfil_ok}
          disabled={ocupado}
          onChange={(e) => {
            const v = e.target.checked;
            acao(async () => { if (demo) mudaChip({ perfil_ok: v }); else await atualizar.mutateAsync({ chipId: chip.chip_id, perfilOk: v }); },
              v ? 'Perfil marcado como pronto.' : 'Perfil desmarcado.');
          }}
        />
        <span>Perfil pronto (foto, nome, recado)</span>
      </label>

      <footer className="mtc-acts">
        <BotaoMini onClick={onConectar}>{conectado ? 'Reconectar' : 'Conectar'}</BotaoMini>
        {emRampa ? (
          <BotaoMini disabled={ocupado}
            onClick={() => acao(async () => { if (demo) mudaChip({ status_maturacao: 'pausado' }); else await pausar.mutateAsync({ chipId: chip.chip_id, motivo: 'pausa manual' }); }, 'Rampa pausada. Nada pendente será enviado.')}>
            Pausar
          </BotaoMini>
        ) : (
          <BotaoPrimario mini disabled={!podeIniciar || ocupado} title={motivoBloqueio}
            onClick={() => acao(async () => { if (demo) mudaChip({ status_maturacao: 'aquecendo', dia_rampa: Math.max(1, chip.dia_rampa) }); else await iniciar.mutateAsync(chip.chip_id); }, 'Rampa iniciada.')}>
            Iniciar
          </BotaoPrimario>
        )}
        <span className="sp" />
        <button type="button" className="p-btn btn-perigo btn-mini" onClick={onExcluir}>Excluir</button>
      </footer>
      {!emRampa && motivoBloqueio && <div className="mtc-hint">{motivoBloqueio}</div>}
    </article>
  );
}

/* ===================== novo chip ===================== */
function NovoChipModalV2({ demo, setSeed, aoAvisar, onClose, onCriado }: {
  demo: boolean; setSeed: Dispatch<SetStateAction<SeedMat | null>>; aoAvisar: (a: Aviso) => void;
  onClose: () => void; onCriado: (chipId: string, apelido: string) => void;
}) {
  const criar = useCriarChip();
  const [apelido, setApelido] = useState('');
  const [operadora, setOperadora] = useState('');
  const [err, setErr] = useState<string | null>(null);

  async function salvar() {
    const nome = apelido.trim();
    if (!nome) { setErr('Informe um apelido para o chip.'); return; }
    setErr(null);
    try {
      let id: string | undefined;
      if (demo) {
        id = `mc-${Date.now()}`;
        setSeed((s) => s && ({ ...s, chips: [...s.chips, chipDemo({ chip_id: id!, apelido: nome })] }));
      } else {
        const r = await criar.mutateAsync({ apelido: nome, operadora });
        id = r?.chip_id;
      }
      aoAvisar({ tom: 'ok', texto: 'Chip criado. Leia o QR Code para conectar.' });
      if (id) onCriado(id, nome);
      else onClose();
    } catch (e) { setErr(msgErro(e)); }
  }

  return (
    <ModalV2
      aberto
      aoFechar={() => { if (!criar.isPending) onClose(); }}
      fecharNoVeu={!criar.isPending}
      largura={460}
      titulo="Adicionar chip ao pool"
      rodape={<>
        <BotaoSec disabled={criar.isPending} onClick={onClose}>Cancelar</BotaoSec>
        <BotaoPrimario disabled={criar.isPending} onClick={salvar}>{criar.isPending ? 'Criando…' : 'Criar chip'}</BotaoPrimario>
      </>}
    >
      <div className="form-grid">
        <p style={{ fontSize: 11.5, color: 'var(--txt-2)', lineHeight: 1.55 }}>
          O chip ganha uma sessão própria de aquecimento, separada das conexões de atendimento. Ele não aparece no Inbox nem consome vaga de WhatsApp do plano.
        </p>
        <div className="campo" style={{ marginBottom: 0 }}>
          <label htmlFor="mat-apelido">Apelido</label>
          <Input id="mat-apelido" placeholder="Ex.: Chip 4 — Vivo" value={apelido} maxLength={40} onChange={(e) => setApelido(e.target.value)} disabled={criar.isPending} />
        </div>
        <div className="campo" style={{ marginBottom: 0 }}>
          <label htmlFor="mat-operadora">Operadora (opcional)</label>
          <select id="mat-operadora" className="inp" value={operadora} onChange={(e) => setOperadora(e.target.value)} disabled={criar.isPending}>
            <option value="">Não informada</option>
            {OPERADORAS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        {err && <div className="aviso-inline erro" role="alert" style={{ marginBottom: 0 }}>{err}</div>}
      </div>
    </ModalV2>
  );
}

/* ===================== QR — conexão da sessão de aquecimento ===================== */
function QrModalV2({ chipId, apelido, demo, setSeed, onClose }: {
  chipId: string; apelido: string; demo: boolean;
  setSeed: Dispatch<SetStateAction<SeedMat | null>>; onClose: () => void;
}) {
  const pedirQr = useQrChip();
  const status = useStatusChip(demo ? null : chipId);
  const [img, setImg] = useState<string | null>(null);
  const [secs, setSecs] = useState(60);
  const [err, setErr] = useState<string | null>(null);
  // demo: simula a leitura do QR alguns segundos depois de exibi-lo
  const [demoStatus, setDemoStatus] = useState<{ status_integracao: StatusIntegracao; numero_conectado: string | null }>({ status_integracao: 'desconectado', numero_conectado: null });
  const st = demo ? demoStatus : (status.data ?? { status_integracao: 'desconectado' as StatusIntegracao, numero_conectado: null });
  const conectado = st.status_integracao === 'conectado';

  const gerar = useCallback(async () => {
    setErr(null);
    try {
      if (demo) { setImg(qrDemo()); setSecs(60); return; }
      const r = await pedirQr.mutateAsync(chipId);
      if (r.conectado) setImg(null);
      else setImg(r.qr ?? null);
      setSecs(60);
    } catch (e) { setErr(msgErro(e)); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chipId, demo]);

  // primeiro QR ao abrir
  useEffect(() => { void gerar(); }, [gerar]);

  // demo: "leitura" simulada — sincronizando aos 5s, conectado aos 8s
  useEffect(() => {
    if (!demo) return;
    const numero = '55519' + String(Math.floor(10000000 + Math.random() * 89999999));
    const t1 = setTimeout(() => setDemoStatus({ status_integracao: 'sincronizando', numero_conectado: null }), 5000);
    const t2 = setTimeout(() => {
      setDemoStatus({ status_integracao: 'conectado', numero_conectado: numero });
      setSeed((s) => s && ({ ...s, chips: s.chips.map((c) => c.chip_id === chipId ? { ...c, status_integracao: 'conectado', numero_conectado: numero } : c) }));
    }, 8000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [demo, chipId, setSeed]);

  // o QR da Evolution expira: renova sozinho enquanto a sessão não sobe
  useEffect(() => {
    if (conectado) return;
    const t = setInterval(() => {
      setSecs((s) => { if (s <= 1) { void gerar(); return 60; } return s - 1; });
    }, 1000);
    return () => clearInterval(t);
  }, [conectado, gerar]);

  return (
    <ModalV2
      aberto
      aoFechar={onClose}
      largura={460}
      titulo={<div><div>{conectado ? 'Chip conectado' : 'Conectar chip'}</div><div className="mat2-modal-sub">{apelido}</div></div>}
      rodape={conectado
        ? <BotaoPrimario onClick={onClose}>Concluir</BotaoPrimario>
        : <>
            <BotaoSec onClick={onClose}>Fechar</BotaoSec>
            <BotaoSec disabled={pedirQr.isPending} onClick={() => void gerar()}>{pedirQr.isPending ? 'Gerando…' : 'Gerar novo QR'}</BotaoSec>
          </>}
    >
      {conectado ? (
        <div className="mat2-qr-ok">
          <span className="ic"><IcCheck /></span>
          <h3>Sessão de aquecimento ativa</h3>
          <p>{formatarNumero(st.numero_conectado)} conectado. Preencha foto, nome e recado no celular, marque “Perfil pronto” e inicie a rampa.</p>
        </div>
      ) : (
        <div className="mat2-qr">
          <p className="lead">Abra o WhatsApp deste chip → <b>Aparelhos conectados</b> → <b>Conectar um aparelho</b> e aponte para o código.</p>
          <div className="mat2-qr-box">
            {img ? <img src={img} alt="QR Code de conexão do chip" /> : <span>Gerando QR Code…</span>}
          </div>
          <div className="mat2-qr-meta">Expira em <b>{secs}s</b> · renova automaticamente</div>
          <div className="mat2-qr-meta">Aguardando leitura… ({STATUS_INTEGRACAO_LABEL[st.status_integracao]})</div>
          {err && <div className="aviso-inline erro" role="alert" style={{ marginBottom: 0 }}>{err}</div>}
        </div>
      )}
    </ModalV2>
  );
}

/* ===================== estratégia de aquecimento ===================== */
const DURACAO_PRESET: Record<string, number> = { expresso_7: 7, rapido_14: 14, padrao_30: 30, conservador_45: 45 };

function EstrategiaSecV2({ demo, seed, setSeed, aoAvisar }: {
  demo: boolean; seed: SeedMat | null; setSeed: Dispatch<SetStateAction<SeedMat | null>>; aoAvisar: (a: Aviso) => void;
}) {
  const config = useConfigMaturacao();
  const aplicar = useAplicarPerfil();
  const [confirmar, setConfirmar] = useState<PerfilPreset | null>(null);
  const [busy, setBusy] = useState(false);

  const cfg = demo ? seed?.config : config.data;
  const ativo = cfg?.perfil_rampa ?? 'padrao_30';
  const custom = ativo === 'custom';

  async function aplica(p: PerfilPreset) {
    setBusy(true);
    try {
      if (demo) setSeed((s) => s && ({ ...s, config: { ...s.config, perfil_rampa: p.key, dias_para_maduro: DURACAO_PRESET[p.key] ?? s.config.dias_para_maduro } }));
      else await aplicar.mutateAsync(p.key);
      aoAvisar({ tom: 'ok', texto: `Perfil "${p.label}" aplicado. Os chips em aquecimento passam a seguir a nova curva.` });
      setConfirmar(null);
    } catch (e) { aoAvisar({ tom: 'erro', texto: msgErro(e) }); }
    finally { setBusy(false); }
  }

  function escolher(p: PerfilPreset) {
    if (!custom && p.key === ativo) return;              // já é o ativo
    if (p.risco === 'alto') { setConfirmar(p); return; } // pede confirmação
    void aplica(p);
  }

  return (
    <CardVidro spot sobe className="mat2-sec" atraso={0.2}>
      <header className="mat2-sec-h">
        <div className="tit">
          <h2><IcRamp />Estratégia de aquecimento</h2>
          <p>Define a curva de volume e a duração até o número ficar maduro. Trocar o perfil vale para todo o pool e recalcula a rampa dos chips que já estão aquecendo.</p>
        </div>
        {custom && <span className="mat2-custom" title="A curva foi editada à mão e não corresponde a nenhum preset.">Personalizado</span>}
      </header>

      <div className="mat2-perfis">
        {PERFIS.map((p) => {
          const sel = !custom && p.key === ativo;
          return (
            <button key={p.key} type="button" className={'mat2-perfil' + (sel ? ' sel' : '')} disabled={busy || aplicar.isPending} aria-pressed={sel} onClick={() => escolher(p)}>
              <div className="ph2">
                <b>{p.label}</b>
                {sel && <span className="on2"><IcCheck />Ativo</span>}
              </div>
              <span className="vol num">{p.resumo}</span>
              <span className="dur">Maduro em {p.duracao_dias} dias</span>
              <span className={'mat2-risco r-' + p.risco}>{RISCO_LABEL[p.risco]}</span>
            </button>
          );
        })}
      </div>

      <div className="mat2-nota">
        <IcInfo />
        <span>Quanto mais curto o perfil, maior o volume em chip novo — e maior o risco de ban. O <b>score de saúde</b> de cada chip acima é como você percebe cedo se algum número começou a ser restringido.</span>
      </div>

      <ConfirmDialogV2
        aberto={!!confirmar}
        titulo="Aquecer no ritmo expresso?"
        mensagem="Aquecer rápido com volume alto aumenta o risco de ban. Os chips que já estão em aquecimento passam a seguir a nova curva, e os que já ultrapassaram a nova duração serão marcados como maduros. Use só com um pool grande e acompanhando o score de perto."
        rotuloConfirmar="Aplicar mesmo assim"
        destrutivo
        carregando={busy || aplicar.isPending}
        aoConfirmar={() => { if (confirmar) void aplica(confirmar); }}
        aoCancelar={() => { if (!busy && !aplicar.isPending) setConfirmar(null); }}
      />
    </CardVidro>
  );
}

/* ===================== sementes externas ===================== */
function SementesSecV2({ demo, seed, setSeed, aoAvisar }: {
  demo: boolean; seed: SeedMat | null; setSeed: Dispatch<SetStateAction<SeedMat | null>>; aoAvisar: (a: Aviso) => void;
}) {
  const sementes = useSementes();
  const adicionar = useAdicionarSemente();
  const excluir = useExcluirSemente();
  const [apelido, setApelido] = useState('');
  const [numero, setNumero] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const lista = demo ? seed?.sementes ?? [] : sementes.data ?? [];
  const carregando = demo ? !seed : sementes.isLoading;

  async function add() {
    if (!apelido.trim() || !numero.trim()) { setErr('Informe apelido e número.'); return; }
    setErr(null);
    try {
      if (demo) {
        const num = numero.trim();
        if (seed?.sementes.some((s) => s.numero === num)) throw new Error('Este número já está cadastrado como semente.');
        setSeed((s) => s && ({ ...s, sementes: [...s.sementes, { id: `ms-${Date.now()}`, organizacao_id: 'org_demo', apelido: apelido.trim(), numero: num, ativo: true, observacao: null, criado_em: new Date().toISOString() }] }));
      } else {
        await adicionar.mutateAsync({ apelido: apelido.trim(), numero: numero.trim() });
      }
      setApelido(''); setNumero('');
      aoAvisar({ tom: 'ok', texto: 'Semente adicionada.' });
    } catch (e) { setErr(msgErro(e)); }
  }

  async function remover(s: Semente) {
    try {
      if (demo) setSeed((x) => x && ({ ...x, sementes: x.sementes.filter((y) => y.id !== s.id) }));
      else await excluir.mutateAsync(s.id);
      aoAvisar({ tom: 'ok', texto: 'Semente removida.' });
    } catch (e) { aoAvisar({ tom: 'erro', texto: msgErro(e) }); }
  }

  return (
    <CardVidro spot sobe className="mat2-sec" atraso={0.25}>
      <header className="mat2-sec-h">
        <div className="tit">
          <h2><IcSeed />Sementes externas</h2>
          <p>Números de fora do pool (celulares da equipe, chips já maduros). Sem eles, os chips só conversam entre si e formam um cluster fechado — o padrão mais fácil de o WhatsApp identificar como automação.</p>
        </div>
      </header>

      <div>
        {carregando ? <div aria-hidden><Skeleton altura={30} raio={8} largura="52%" /></div>
          : lista.length === 0 ? <div className="mat2-vazio-linha">Nenhuma semente cadastrada. Cadastre pelo menos duas antes de ativar os envios.</div>
          : lista.map((s) => (
            <div className="mat2-linha" key={s.id}>
              <div className="tx"><b>{s.apelido}</b><i className="num">{formatarNumero(s.numero)}</i></div>
              <button type="button" className="p-btn btn-perigo btn-mini" disabled={excluir.isPending} onClick={() => remover(s)}>Remover</button>
            </div>
          ))}
      </div>

      <div className="mat2-form">
        <div className="campo">
          <label htmlFor="mat-sem-ape">Apelido</label>
          <Input id="mat-sem-ape" placeholder="Ex.: Celular da Juliana" value={apelido} maxLength={40} onChange={(e) => setApelido(e.target.value)} disabled={adicionar.isPending} />
        </div>
        <div className="campo">
          <label htmlFor="mat-sem-num">Número (com DDI e DDD)</label>
          <Input id="mat-sem-num" placeholder="5551999998888" value={numero} maxLength={15} inputMode="numeric" onChange={(e) => setNumero(e.target.value)} disabled={adicionar.isPending} />
        </div>
        <BotaoSec disabled={adicionar.isPending} onClick={add}>＋ {adicionar.isPending ? 'Adicionando…' : 'Adicionar semente'}</BotaoSec>
      </div>
      {err && <div className="aviso-inline erro" role="alert" style={{ marginTop: 10, marginBottom: 0 }}>{err}</div>}
    </CardVidro>
  );
}

/* ===================== biblioteca de conteúdo ===================== */
const TIPOS: TipoConteudo[] = ['texto', 'figurinha', 'audio', 'imagem'];
const CATEGORIAS: CategoriaConteudo[] = ['abertura', 'resposta', 'conversa'];

function ConteudoSecV2({ demo, seed, setSeed, aoAvisar }: {
  demo: boolean; seed: SeedMat | null; setSeed: Dispatch<SetStateAction<SeedMat | null>>; aoAvisar: (a: Aviso) => void;
}) {
  const conteudo = useConteudo();
  const adicionar = useAdicionarConteudo();
  const excluir = useExcluirConteudo();
  const [tipo, setTipo] = useState<TipoConteudo>('texto');
  const [categoria, setCategoria] = useState<CategoriaConteudo>('abertura');
  const [texto, setTexto] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const lista = demo ? seed?.conteudo ?? [] : conteudo.data ?? [];
  const carregando = demo ? !seed : conteudo.isLoading;

  async function add() {
    if (!texto.trim()) { setErr('Escreva o texto da mensagem.'); return; }
    setErr(null);
    try {
      if (demo) {
        setSeed((s) => s && ({ ...s, conteudo: [{ id: `mt-${Date.now()}`, organizacao_id: 'org_demo', tipo, categoria, texto: texto.trim(), storage_path: null, mime_type: null, usos: 0, ativo: true, criado_em: new Date().toISOString() }, ...s.conteudo] }));
      } else {
        await adicionar.mutateAsync({ tipo, categoria, texto: texto.trim() });
      }
      setTexto('');
      aoAvisar({ tom: 'ok', texto: 'Conteúdo adicionado.' });
    } catch (e) { setErr(msgErro(e)); }
  }

  async function remover(c: Conteudo) {
    try {
      if (demo) setSeed((x) => x && ({ ...x, conteudo: x.conteudo.filter((y) => y.id !== c.id) }));
      else await excluir.mutateAsync(c.id);
      aoAvisar({ tom: 'ok', texto: 'Conteúdo removido.' });
    } catch (e) { aoAvisar({ tom: 'erro', texto: msgErro(e) }); }
  }

  return (
    <CardVidro spot sobe className="mat2-sec" atraso={0.3}>
      <header className="mat2-sec-h">
        <div className="tit">
          <h2><IcLib />Biblioteca de conteúdo</h2>
          <p>Frases sorteadas pelo planejador. Variedade é requisito: repetir a mesma mensagem é o jeito mais rápido de o número ser marcado.</p>
        </div>
      </header>

      <div>
        {carregando ? <div aria-hidden><Skeleton altura={30} raio={8} largura="60%" /></div>
          : lista.length === 0 ? <div className="mat2-vazio-linha">Nenhum conteúdo cadastrado. Escreva ao menos algumas aberturas e respostas.</div>
          : lista.map((c) => (
            <div className="mat2-linha" key={c.id}>
              <div className="tx">
                <b>{c.texto || '(mídia)'}</b>
                <i>{TIPO_LABEL[c.tipo]} · {CATEGORIA_LABEL[c.categoria]} · {c.usos} uso{c.usos === 1 ? '' : 's'}</i>
              </div>
              <button type="button" className="p-btn btn-perigo btn-mini" disabled={excluir.isPending} onClick={() => remover(c)}>Remover</button>
            </div>
          ))}
      </div>

      <div className="mat2-form">
        <div className="campo curta">
          <label htmlFor="mat-ct-tipo">Tipo</label>
          <select id="mat-ct-tipo" className="inp" value={tipo} onChange={(e) => setTipo(e.target.value as TipoConteudo)} disabled={adicionar.isPending}>
            {TIPOS.map((t) => <option key={t} value={t}>{TIPO_LABEL[t]}</option>)}
          </select>
        </div>
        <div className="campo curta">
          <label htmlFor="mat-ct-cat">Categoria</label>
          <select id="mat-ct-cat" className="inp" value={categoria} onChange={(e) => setCategoria(e.target.value as CategoriaConteudo)} disabled={adicionar.isPending}>
            {CATEGORIAS.map((c) => <option key={c} value={c}>{CATEGORIA_LABEL[c]}</option>)}
          </select>
        </div>
        <div className="campo larga">
          <label htmlFor="mat-ct-texto">Texto</label>
          <Input id="mat-ct-texto" placeholder="Ex.: Oi, tudo certo por aí?" value={texto} maxLength={280} onChange={(e) => setTexto(e.target.value)} disabled={adicionar.isPending} />
        </div>
        <BotaoSec disabled={adicionar.isPending} onClick={add}>＋ {adicionar.isPending ? 'Adicionando…' : 'Adicionar'}</BotaoSec>
      </div>
      {err && <div className="aviso-inline erro" role="alert" style={{ marginTop: 10, marginBottom: 0 }}>{err}</div>}
    </CardVidro>
  );
}

/* ===================== configuração ===================== */
function ConfigSecV2({ demo, seed, setSeed, aoAvisar }: {
  demo: boolean; seed: SeedMat | null; setSeed: Dispatch<SetStateAction<SeedMat | null>>; aoAvisar: (a: Aviso) => void;
}) {
  const config = useConfigMaturacao();
  const salvar = useSalvarConfig();
  const [rascunho, setRascunho] = useState<ConfigPatch | null>(null);
  const cfg = demo ? seed?.config ?? null : config.data ?? null;

  // só semeia o rascunho quando a config chega; depois disso quem manda é o usuário
  useEffect(() => {
    if (!cfg || rascunho) return;
    setRascunho({
      hora_inicio: cfg.hora_inicio,
      hora_fim: cfg.hora_fim,
      dias_semana: [...cfg.dias_semana],
      pct_sementes: cfg.pct_sementes,
    });
  }, [cfg, rascunho]);

  if (!cfg || !rascunho) {
    return (
      <CardVidro spot sobe className="mat2-sec" atraso={0.35}>
        <header className="mat2-sec-h"><div className="tit"><h2><IcGear />Configuração</h2></div></header>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} aria-hidden><Skeleton altura={36} raio={9} /><Skeleton altura={36} raio={9} largura="58%" /></div>
      </CardVidro>
    );
  }

  const d = rascunho;
  const dias = d.dias_semana ?? [];
  const set = (p: ConfigPatch) => setRascunho({ ...d, ...p });
  const toggleDia = (v: number) => set({ dias_semana: dias.includes(v) ? dias.filter((x) => x !== v) : [...dias, v].sort((a, b) => a - b) });

  const janelaInvalida = (d.hora_fim ?? 0) <= (d.hora_inicio ?? 0);
  const semDia = dias.length === 0;

  async function aplicar() {
    if (janelaInvalida) { aoAvisar({ tom: 'erro', texto: 'A hora final precisa ser maior que a hora inicial.' }); return; }
    if (semDia) { aoAvisar({ tom: 'erro', texto: 'Escolha ao menos um dia da semana.' }); return; }
    try {
      if (demo) setSeed((s) => s && ({ ...s, config: { ...s.config, ...d } as MaturacaoConfig }));
      else await salvar.mutateAsync(d);
      aoAvisar({ tom: 'ok', texto: 'Configuração salva.' });
    } catch (e) { aoAvisar({ tom: 'erro', texto: msgErro(e) }); }
  }

  return (
    <CardVidro spot sobe className="mat2-sec" atraso={0.35}>
      <header className="mat2-sec-h">
        <div className="tit">
          <h2><IcGear />Configuração</h2>
          <p>Janela e mix do aquecimento. A curva de volume por dia de rampa é definida no backend e não é editável aqui.</p>
        </div>
      </header>

      <div className="mat2-cfg">
        <div className="campo">
          <label htmlFor="mat-cfg-modo">Modo</label>
          <select id="mat-cfg-modo" className="inp" value={cfg.modo} disabled>
            <option value="dry_run">Simulação (dry run)</option>
            <option value="ativo">Ativo</option>
          </select>
          <em>Trocado pelo botão do topo da página.</em>
        </div>
        <div className="campo">
          <label htmlFor="mat-cfg-ini">Início da janela</label>
          <select id="mat-cfg-ini" className="inp" value={d.hora_inicio} onChange={(e) => set({ hora_inicio: Number(e.target.value) })}>
            {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
          </select>
        </div>
        <div className="campo">
          <label htmlFor="mat-cfg-fim">Fim da janela</label>
          <select id="mat-cfg-fim" className="inp" value={d.hora_fim} onChange={(e) => set({ hora_fim: Number(e.target.value) })}>
            {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
          </select>
          {janelaInvalida && <em className="bad">A hora final precisa ser maior que a inicial.</em>}
        </div>
        <div className="campo">
          <label htmlFor="mat-cfg-pct">Tráfego para sementes</label>
          <div className="mat2-range">
            <input id="mat-cfg-pct" type="range" min={0} max={100} step={5} value={d.pct_sementes} onChange={(e) => set({ pct_sementes: Number(e.target.value) })} />
            <b>{d.pct_sementes}%</b>
          </div>
          <em>Fração do volume diário que vai para números externos a partir do dia {cfg.dia_sementes}.</em>
        </div>
        <div className="campo larga">
          <label>Dias da semana</label>
          <div className="mat2-dias">
            {DIAS_SEMANA.map((x) => (
              <Chip key={x.v} ativo={dias.includes(x.v)} onClick={() => toggleDia(x.v)}>{x.r}</Chip>
            ))}
          </div>
          <em className={semDia ? 'bad' : ''}>{semDia ? 'Escolha ao menos um dia.' : 'Domingo costuma ficar de fora: gente de verdade conversa menos.'}</em>
        </div>
      </div>

      <div className="mat2-cfg-acts">
        <BotaoPrimario disabled={salvar.isPending || janelaInvalida || semDia} onClick={aplicar}>
          {salvar.isPending ? 'Salvando…' : 'Salvar configuração'}
        </BotaoPrimario>
        <span className="mat2-cfg-nota">Fuso: {cfg.timezone} · rampa completa em {cfg.dias_para_maduro} dias · mínimo de {cfg.min_sementes} sementes.</span>
      </div>
    </CardVidro>
  );
}
