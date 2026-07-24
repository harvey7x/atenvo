import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/useToast';
import { useOrg } from '@/context/OrgContext';
import { Modal } from '@/components/Modal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import {
  MATURACAO_REAL, usePainelMaturacao, useConfigMaturacao, useSalvarConfig,
  useCriarChip, useAtualizarChip, useIniciarChip, usePausarChip, useExcluirChip,
  useQrChip, useStatusChip,
  useSementes, useAdicionarSemente, useExcluirSemente,
  useConteudo, useAdicionarConteudo, useExcluirConteudo,
  saudeChip, formatarNumero, SAUDE_LABEL, STATUS_MATURACAO_LABEL, STATUS_INTEGRACAO_LABEL,
  TIPO_LABEL, CATEGORIA_LABEL, DIAS_SEMANA,
  type ChipPainel, type ConfigPatch, type TipoConteudo, type CategoriaConteudo,
} from '@/data/maturacao';
import './Maturacao.css';

/* ===== ícones (mesmo padrão das outras páginas: SVG local, 24×24, stroke) ===== */
const IcPlus = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>;
const IcPlay = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 4.5v15l13-7.5z" /></svg>;
const IcPause = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5v14M15 5v14" /></svg>;
const IcTrash = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></svg>;
const IcQr = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.4" /><rect x="14" y="3" width="7" height="7" rx="1.4" /><rect x="3" y="14" width="7" height="7" rx="1.4" /><path d="M14 14h3v3M21 14v7h-7v-3" /></svg>;
const IcInfo = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>;
const IcAlerta = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg>;
const IcCheck = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>;
const IcSeed = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21c0-6 3-10 8-11 0 6-3 10-8 11z" /><path d="M12 21C7 20 4 16 4 10c5 1 8 5 8 11z" /></svg>;
const IcLib = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="18" rx="2.2" /><path d="M8 8h8M8 12h8M8 16h5" /></svg>;
const IcGear = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" /></svg>;

const OPERADORAS = ['Vivo', 'Claro', 'TIM', 'Oi', 'Outra'];
const msgErro = (e: unknown) => (e as Error)?.message || 'Falha na operação.';
const haQuanto = (iso: string | null) => {
  if (!iso) return '—';
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `há ${h} h` : `há ${Math.round(h / 24)} d`;
};

/* ============================================================================
   PÁGINA
   ========================================================================== */
export function Maturacao() {
  const { toast } = useToast();
  const { currentOrg } = useOrg();
  const qc = useQueryClient();
  const painel = usePainelMaturacao();
  const config = useConfigMaturacao();
  const salvarConfig = useSalvarConfig();

  const [novoChip, setNovoChip] = useState(false);
  const [qrChip, setQrChip] = useState<{ id: string; apelido: string } | null>(null);
  const [excluir, setExcluir] = useState<ChipPainel | null>(null);
  const [trocarModo, setTrocarModo] = useState<'dry_run' | 'ativo' | null>(null);

  const excluirChip = useExcluirChip();
  const chips = useMemo(() => painel.data ?? [], [painel.data]);
  const modo = config.data?.modo ?? 'dry_run';
  const diasMaduro = config.data?.dias_para_maduro ?? 45;

  const aquecendo = chips.filter((c) => c.status_maturacao === 'aquecendo').length;
  const emRisco = chips.filter((c) => saudeChip(c) === 'vermelho').length;

  async function confirmarModo() {
    if (!trocarModo) return;
    try {
      await salvarConfig.mutateAsync({ modo: trocarModo });
      toast(trocarModo === 'ativo' ? 'Modo ativo: as mensagens de aquecimento passam a sair de verdade.' : 'Voltou para simulação. Nada mais é enviado.');
      setTrocarModo(null);
    } catch (e) { toast(msgErro(e), 'warn'); }
  }

  async function confirmarExclusao() {
    if (!excluir) return;
    try {
      await excluirChip.mutateAsync(excluir.chip_id);
      toast('Chip excluído. A instância de aquecimento foi derrubada.');
      setExcluir(null);
    } catch (e) { toast(msgErro(e), 'warn'); }
  }

  if (!MATURACAO_REAL) {
    return (
      <div className="mat">
        <div className="mat-nota"><IcInfo /><div>A maturação de números só funciona com o backend configurado.</div></div>
      </div>
    );
  }

  return (
    <div className="mat">
      {/* ---- Banner de modo: a informação mais importante da tela ---- */}
      <div className={'mat-modo ' + (modo === 'ativo' ? 'ativo' : 'dry')}>
        <span className="mat-modo-ic">{modo === 'ativo' ? <IcCheck /> : <IcAlerta />}</span>
        <div className="mat-modo-tx">
          <strong>{modo === 'ativo' ? 'MODO ATIVO — as mensagens estão saindo de verdade' : 'MODO SIMULAÇÃO — nada é enviado de verdade'}</strong>
          <span>
            {modo === 'ativo'
              ? 'O planejador e o executor estão operando os chips deste pool dentro da janela configurada.'
              : 'O sistema planeja e registra tudo, mas nenhuma mensagem sai. Ative quando os chips estiverem conectados e com o perfil pronto.'}
          </span>
        </div>
        <button
          className={'mat-btn ' + (modo === 'ativo' ? '' : 'cta')}
          disabled={config.isLoading || salvarConfig.isPending}
          onClick={() => setTrocarModo(modo === 'ativo' ? 'dry_run' : 'ativo')}
        >
          {modo === 'ativo' ? 'Voltar para simulação' : 'Ativar envios reais'}
        </button>
      </div>

      {/* ---- Chips ---- */}
      <section className="mat-sec">
        <header className="mat-sec-h">
          <div>
            <h2>Chips em maturação</h2>
            <p>
              {chips.length === 0 ? 'Nenhum chip cadastrado.' : `${chips.length} chip${chips.length === 1 ? '' : 's'} · ${aquecendo} aquecendo${emRisco ? ` · ${emRisco} em risco` : ''}`}
              {' '}Estes números são isolados: não entram no Inbox, não criam contatos e não consomem vaga de WhatsApp do plano.
            </p>
          </div>
          <button className="mat-btn cta" onClick={() => setNovoChip(true)}><IcPlus />Adicionar chip</button>
        </header>

        {painel.isLoading ? (
          <div className="mat-vazio">Carregando chips…</div>
        ) : painel.isError ? (
          <div className="mat-erro">{msgErro(painel.error)}</div>
        ) : chips.length === 0 ? (
          <div className="mat-vazio">
            <IcQr />
            <h3>Nenhum chip em maturação</h3>
            <p>Adicione um chip, conecte pelo QR Code, preencha foto/nome/recado no celular e inicie a rampa.</p>
          </div>
        ) : (
          <div className="mat-grid">
            {chips.map((c) => (
              <ChipCard
                key={c.chip_id}
                chip={c}
                diasMaduro={diasMaduro}
                onConectar={() => setQrChip({ id: c.chip_id, apelido: c.apelido })}
                onExcluir={() => setExcluir(c)}
              />
            ))}
          </div>
        )}
      </section>

      <SementesSec />
      <ConteudoSec />
      <ConfigSec />

      {novoChip && (
        <NovoChipModal
          onClose={() => setNovoChip(false)}
          /* já emenda no QR: criar sem conectar deixa um chip inerte no pool */
          onCriado={(id, apelido) => { setNovoChip(false); setQrChip({ id, apelido }); }}
        />
      )}
      {qrChip && (
        <QrModal
          chipId={qrChip.id}
          apelido={qrChip.apelido}
          onClose={() => { setQrChip(null); qc.invalidateQueries({ queryKey: ['mat-painel', currentOrg.id] }); }}
        />
      )}

      <ConfirmDialog
        open={!!trocarModo}
        title={trocarModo === 'ativo' ? 'Ativar envios reais?' : 'Voltar para simulação?'}
        message={trocarModo === 'ativo'
          ? 'A partir de agora o aquecimento vai enviar mensagens de verdade pelos chips conectados, dentro da janela e dos dias configurados. Confirme que os perfis estão preenchidos e que há sementes externas cadastradas.'
          : 'O aquecimento volta a apenas planejar e registrar: nenhuma mensagem sai. O que já estava agendado para hoje não será enviado.'}
        confirmLabel={trocarModo === 'ativo' ? 'Ativar envios' : 'Voltar para simulação'}
        loading={salvarConfig.isPending}
        onConfirm={confirmarModo}
        onCancel={() => { if (!salvarConfig.isPending) setTrocarModo(null); }}
      />

      <ConfirmDialog
        open={!!excluir}
        title="Excluir chip?"
        message={excluir
          ? `O chip "${excluir.apelido}" será excluído DEFINITIVAMENTE: a sessão de aquecimento é derrubada e todo o histórico de agenda e eventos deste chip é apagado. Não há como desfazer.`
          : ''}
        destructive
        confirmLabel="Excluir chip"
        loading={excluirChip.isPending}
        onConfirm={confirmarExclusao}
        onCancel={() => { if (!excluirChip.isPending) setExcluir(null); }}
      />
    </div>
  );
}

/* ============================================================================
   CARD DO CHIP
   ========================================================================== */
function ChipCard({ chip, diasMaduro, onConectar, onExcluir }: {
  chip: ChipPainel; diasMaduro: number; onConectar: () => void; onExcluir: () => void;
}) {
  const { toast } = useToast();
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

  async function acao(fn: () => Promise<unknown>, ok: string) {
    try { await fn(); toast(ok); }
    catch (e) { toast(msgErro(e), 'warn'); }
  }

  const ocupado = iniciar.isPending || pausar.isPending || atualizar.isPending;

  return (
    <article className={'mat-card s-' + saude}>
      <header className="mat-card-h">
        <div className="mat-card-id">
          <span className="mat-sem" title={`Saúde: ${SAUDE_LABEL[saude]}`} />
          <div>
            <b>{chip.apelido}</b>
            <i>{formatarNumero(chip.numero_conectado)}</i>
          </div>
        </div>
        <div className="mat-card-badges">
          <span className={'mat-st m-' + chip.status_maturacao}>{STATUS_MATURACAO_LABEL[chip.status_maturacao]}</span>
          <span className={'mat-st i-' + chip.status_integracao}>{STATUS_INTEGRACAO_LABEL[chip.status_integracao]}</span>
        </div>
      </header>

      <div className="mat-ramp">
        <div className="mat-ramp-l">
          <span>Dia {chip.dia_rampa} da rampa</span>
          <b>{pct}%</b>
        </div>
        <div className="mat-ramp-bar"><i style={{ width: pct + '%' }} /></div>
        <span className="mat-ramp-s">Rampa completa em {diasMaduro} dias · {chip.pendentes_hoje} pendente{chip.pendentes_hoje === 1 ? '' : 's'} para hoje</span>
      </div>

      <div className="mat-kpis">
        <div className="mat-kpi"><b>{chip.enviadas_7d}</b><i>enviadas</i></div>
        <div className="mat-kpi ok"><b>{chip.entregues_7d}</b><i>entregues</i></div>
        <div className="mat-kpi"><b>{chip.lidas_7d}</b><i>lidas</i></div>
        <div className={'mat-kpi' + (chip.erros_7d > 0 ? ' bad' : '')}><b>{chip.erros_7d}</b><i>erros</i></div>
      </div>
      <div className="mat-card-obs">
        {taxa === null ? 'Sem envios nos últimos 7 dias.' : `Entrega de ${taxa}% nos últimos 7 dias.`}
        {chip.ultimo_erro_em ? ` Último erro ${haQuanto(chip.ultimo_erro_em)}.` : ''}
      </div>

      <label className={'mat-check' + (chip.perfil_ok ? ' on' : '')}>
        <input
          type="checkbox"
          checked={chip.perfil_ok}
          disabled={ocupado}
          onChange={(e) => acao(() => atualizar.mutateAsync({ chipId: chip.chip_id, perfilOk: e.target.checked }),
            e.target.checked ? 'Perfil marcado como pronto.' : 'Perfil desmarcado.')}
        />
        <span>Perfil pronto (foto, nome, recado)</span>
      </label>

      <footer className="mat-card-acts">
        <button className="mat-btn sm" onClick={onConectar}><IcQr />{conectado ? 'Reconectar' : 'Conectar'}</button>
        {emRampa ? (
          <button className="mat-btn sm" disabled={ocupado}
            onClick={() => acao(() => pausar.mutateAsync({ chipId: chip.chip_id, motivo: 'pausa manual' }), 'Rampa pausada. Nada pendente será enviado.')}>
            <IcPause />Pausar
          </button>
        ) : (
          <button className="mat-btn sm cta" disabled={!podeIniciar || ocupado} title={motivoBloqueio}
            onClick={() => acao(() => iniciar.mutateAsync(chip.chip_id), 'Rampa iniciada.')}>
            <IcPlay />Iniciar
          </button>
        )}
        <span className="mat-sp" />
        <button className="mat-btn sm danger" onClick={onExcluir}><IcTrash />Excluir</button>
      </footer>
      {!emRampa && motivoBloqueio && <div className="mat-card-hint">{motivoBloqueio}</div>}
    </article>
  );
}

/* ============================================================================
   NOVO CHIP
   ========================================================================== */
function NovoChipModal({ onClose, onCriado }: { onClose: () => void; onCriado: (chipId: string, apelido: string) => void }) {
  const { toast } = useToast();
  const criar = useCriarChip();
  const [apelido, setApelido] = useState('');
  const [operadora, setOperadora] = useState('');
  const [err, setErr] = useState<string | null>(null);

  async function salvar() {
    const nome = apelido.trim();
    if (!nome) { setErr('Informe um apelido para o chip.'); return; }
    setErr(null);
    try {
      const r = await criar.mutateAsync({ apelido: nome, operadora });
      toast('Chip criado. Leia o QR Code para conectar.');
      if (r?.chip_id) onCriado(r.chip_id, nome);
      else onClose();
    } catch (e) { setErr(msgErro(e)); }
  }

  return (
    <Modal open onClose={() => { if (!criar.isPending) onClose(); }} closeOnBackdrop={!criar.isPending} width={460}
      title="Adicionar chip ao pool"
      footer={<>
        <button className="atv-btn" disabled={criar.isPending} onClick={onClose}>Cancelar</button>
        <button className="atv-btn primary" disabled={criar.isPending} onClick={salvar}>{criar.isPending ? 'Criando…' : 'Criar chip'}</button>
      </>}>
      <p className="mat-lead">O chip ganha uma sessão própria de aquecimento, separada das conexões de atendimento. Ele não aparece no Inbox nem consome vaga de WhatsApp do plano.</p>
      <div className="atv-field">
        <label htmlFor="mat-apelido">Apelido</label>
        <input id="mat-apelido" className="atv-input" placeholder="Ex.: Chip 4 — Vivo" value={apelido} maxLength={40}
          onChange={(e) => setApelido(e.target.value)} disabled={criar.isPending} />
      </div>
      <div className="atv-field">
        <label htmlFor="mat-operadora">Operadora (opcional)</label>
        <select id="mat-operadora" className="atv-select" value={operadora} onChange={(e) => setOperadora(e.target.value)} disabled={criar.isPending}>
          <option value="">Não informada</option>
          {OPERADORAS.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
      {err && <div className="atv-field-err">{err}</div>}
    </Modal>
  );
}

/* ============================================================================
   QR — conexão da sessão de aquecimento
   ========================================================================== */
function QrModal({ chipId, apelido, onClose }: { chipId: string; apelido: string; onClose: () => void }) {
  const pedirQr = useQrChip();
  const status = useStatusChip(chipId);
  const [img, setImg] = useState<string | null>(null);
  const [secs, setSecs] = useState(60);
  const [err, setErr] = useState<string | null>(null);
  const conectado = status.data?.status_integracao === 'conectado';

  const gerar = useCallback(async () => {
    setErr(null);
    try {
      const r = await pedirQr.mutateAsync(chipId);
      if (r.conectado) setImg(null);
      else setImg(r.qr ?? null);
      setSecs(60);
    } catch (e) { setErr(msgErro(e)); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chipId]);

  // primeiro QR ao abrir
  useEffect(() => { void gerar(); }, [gerar]);

  // o QR da Evolution expira: renova sozinho enquanto a sessão não sobe
  useEffect(() => {
    if (conectado) return;
    const t = setInterval(() => {
      setSecs((s) => { if (s <= 1) { void gerar(); return 60; } return s - 1; });
    }, 1000);
    return () => clearInterval(t);
  }, [conectado, gerar]);

  return (
    <Modal open onClose={onClose} closeOnBackdrop width={460}
      title={<div><div>{conectado ? 'Chip conectado' : 'Conectar chip'}</div><div className="mat-modal-sub">{apelido}</div></div>}
      footer={conectado
        ? <button className="atv-btn primary" onClick={onClose}>Concluir</button>
        : <>
            <button className="atv-btn" onClick={onClose}>Fechar</button>
            <button className="atv-btn" disabled={pedirQr.isPending} onClick={() => void gerar()}>{pedirQr.isPending ? 'Gerando…' : 'Gerar novo QR'}</button>
          </>}>
      {conectado ? (
        <div className="mat-qr-ok">
          <span className="mat-qr-ok-ic"><IcCheck /></span>
          <h3>Sessão de aquecimento ativa</h3>
          <p>{formatarNumero(status.data?.numero_conectado ?? null)} conectado. Preencha foto, nome e recado no celular, marque “Perfil pronto” e inicie a rampa.</p>
        </div>
      ) : (
        <div className="mat-qr">
          <p className="mat-lead">Abra o WhatsApp deste chip → <b>Aparelhos conectados</b> → <b>Conectar um aparelho</b> e aponte para o código.</p>
          <div className="mat-qr-box">
            {img ? <img src={img} alt="QR Code de conexão do chip" /> : <span>Gerando QR Code…</span>}
          </div>
          <div className="mat-qr-meta">Expira em <b>{secs}s</b> · renova automaticamente</div>
          <div className="mat-qr-meta">Aguardando leitura… ({STATUS_INTEGRACAO_LABEL[status.data?.status_integracao ?? 'desconectado']})</div>
          {err && <div className="atv-field-err">{err}</div>}
        </div>
      )}
    </Modal>
  );
}

/* ============================================================================
   SEMENTES EXTERNAS
   ========================================================================== */
function SementesSec() {
  const { toast } = useToast();
  const sementes = useSementes();
  const adicionar = useAdicionarSemente();
  const excluir = useExcluirSemente();
  const [apelido, setApelido] = useState('');
  const [numero, setNumero] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const lista = sementes.data ?? [];

  async function add() {
    if (!apelido.trim() || !numero.trim()) { setErr('Informe apelido e número.'); return; }
    setErr(null);
    try {
      await adicionar.mutateAsync({ apelido: apelido.trim(), numero: numero.trim() });
      setApelido(''); setNumero('');
      toast('Semente adicionada.');
    } catch (e) { setErr(msgErro(e)); }
  }

  return (
    <section className="mat-sec">
      <header className="mat-sec-h">
        <div>
          <h2><IcSeed />Sementes externas</h2>
          <p>
            Números de fora do pool (celulares da equipe, chips já maduros). Sem eles, os chips só conversam
            entre si e formam um cluster fechado — o padrão mais fácil de o WhatsApp identificar como automação.
          </p>
        </div>
      </header>

      <div className="mat-lista">
        {sementes.isLoading ? <div className="mat-vazio">Carregando…</div>
          : lista.length === 0 ? <div className="mat-vazio-linha">Nenhuma semente cadastrada. Cadastre pelo menos duas antes de ativar os envios.</div>
          : lista.map((s) => (
            <div className="mat-linha" key={s.id}>
              <div className="mat-linha-tx"><b>{s.apelido}</b><i>{formatarNumero(s.numero)}</i></div>
              <button className="mat-btn sm danger" disabled={excluir.isPending}
                onClick={async () => {
                  try { await excluir.mutateAsync(s.id); toast('Semente removida.'); }
                  catch (e) { toast(msgErro(e), 'warn'); }
                }}><IcTrash />Remover</button>
            </div>
          ))}
      </div>

      <div className="mat-form">
        <label className="mat-fld">
          <span>Apelido</span>
          <input className="atv-input" placeholder="Ex.: Celular da Juliana" value={apelido} maxLength={40}
            onChange={(e) => setApelido(e.target.value)} disabled={adicionar.isPending} />
        </label>
        <label className="mat-fld">
          <span>Número (com DDI e DDD)</span>
          <input className="atv-input" placeholder="5551999998888" value={numero} maxLength={15} inputMode="numeric"
            onChange={(e) => setNumero(e.target.value)} disabled={adicionar.isPending} />
        </label>
        <button className="mat-btn cta" disabled={adicionar.isPending} onClick={add}><IcPlus />{adicionar.isPending ? 'Adicionando…' : 'Adicionar semente'}</button>
      </div>
      {err && <div className="atv-field-err">{err}</div>}
    </section>
  );
}

/* ============================================================================
   BIBLIOTECA DE CONTEÚDO
   ========================================================================== */
const TIPOS: TipoConteudo[] = ['texto', 'figurinha', 'audio', 'imagem'];
const CATEGORIAS: CategoriaConteudo[] = ['abertura', 'resposta', 'conversa'];

function ConteudoSec() {
  const { toast } = useToast();
  const conteudo = useConteudo();
  const adicionar = useAdicionarConteudo();
  const excluir = useExcluirConteudo();
  const [tipo, setTipo] = useState<TipoConteudo>('texto');
  const [categoria, setCategoria] = useState<CategoriaConteudo>('abertura');
  const [texto, setTexto] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const lista = conteudo.data ?? [];

  async function add() {
    if (!texto.trim()) { setErr('Escreva o texto da mensagem.'); return; }
    setErr(null);
    try {
      await adicionar.mutateAsync({ tipo, categoria, texto: texto.trim() });
      setTexto('');
      toast('Conteúdo adicionado.');
    } catch (e) { setErr(msgErro(e)); }
  }

  return (
    <section className="mat-sec">
      <header className="mat-sec-h">
        <div>
          <h2><IcLib />Biblioteca de conteúdo</h2>
          <p>Frases sorteadas pelo planejador. Variedade é requisito: repetir a mesma mensagem é o jeito mais rápido de o número ser marcado.</p>
        </div>
      </header>

      <div className="mat-lista">
        {conteudo.isLoading ? <div className="mat-vazio">Carregando…</div>
          : lista.length === 0 ? <div className="mat-vazio-linha">Nenhum conteúdo cadastrado. Escreva ao menos algumas aberturas e respostas.</div>
          : lista.map((c) => (
            <div className="mat-linha" key={c.id}>
              <div className="mat-linha-tx">
                <b>{c.texto || '(mídia)'}</b>
                <i>{TIPO_LABEL[c.tipo]} · {CATEGORIA_LABEL[c.categoria]} · {c.usos} uso{c.usos === 1 ? '' : 's'}</i>
              </div>
              <button className="mat-btn sm danger" disabled={excluir.isPending}
                onClick={async () => {
                  try { await excluir.mutateAsync(c.id); toast('Conteúdo removido.'); }
                  catch (e) { toast(msgErro(e), 'warn'); }
                }}><IcTrash />Remover</button>
            </div>
          ))}
      </div>

      <div className="mat-form">
        <label className="mat-fld curta">
          <span>Tipo</span>
          <select className="atv-select" value={tipo} onChange={(e) => setTipo(e.target.value as TipoConteudo)} disabled={adicionar.isPending}>
            {TIPOS.map((t) => <option key={t} value={t}>{TIPO_LABEL[t]}</option>)}
          </select>
        </label>
        <label className="mat-fld curta">
          <span>Categoria</span>
          <select className="atv-select" value={categoria} onChange={(e) => setCategoria(e.target.value as CategoriaConteudo)} disabled={adicionar.isPending}>
            {CATEGORIAS.map((c) => <option key={c} value={c}>{CATEGORIA_LABEL[c]}</option>)}
          </select>
        </label>
        <label className="mat-fld larga">
          <span>Texto</span>
          <input className="atv-input" placeholder="Ex.: Oi, tudo certo por aí?" value={texto} maxLength={280}
            onChange={(e) => setTexto(e.target.value)} disabled={adicionar.isPending} />
        </label>
        <button className="mat-btn cta" disabled={adicionar.isPending} onClick={add}><IcPlus />{adicionar.isPending ? 'Adicionando…' : 'Adicionar'}</button>
      </div>
      {err && <div className="atv-field-err">{err}</div>}
    </section>
  );
}

/* ============================================================================
   CONFIGURAÇÃO
   ========================================================================== */
function ConfigSec() {
  const { toast } = useToast();
  const config = useConfigMaturacao();
  const salvar = useSalvarConfig();
  const [rascunho, setRascunho] = useState<ConfigPatch | null>(null);

  // Só semeia o rascunho quando a config chega; depois disso quem manda é o usuário.
  useEffect(() => {
    if (!config.data || rascunho) return;
    setRascunho({
      hora_inicio: config.data.hora_inicio,
      hora_fim: config.data.hora_fim,
      dias_semana: [...config.data.dias_semana],
      pct_sementes: config.data.pct_sementes,
    });
  }, [config.data, rascunho]);

  if (config.isLoading || !rascunho || !config.data) {
    return (
      <section className="mat-sec">
        <header className="mat-sec-h"><div><h2><IcGear />Configuração</h2></div></header>
        <div className="mat-vazio">Carregando configuração…</div>
      </section>
    );
  }

  const d = rascunho;
  const dias = d.dias_semana ?? [];
  const set = (p: ConfigPatch) => setRascunho({ ...d, ...p });
  const toggleDia = (v: number) => set({ dias_semana: dias.includes(v) ? dias.filter((x) => x !== v) : [...dias, v].sort((a, b) => a - b) });

  const janelaInvalida = (d.hora_fim ?? 0) <= (d.hora_inicio ?? 0);
  const semDia = dias.length === 0;

  async function aplicar() {
    if (janelaInvalida) { toast('A hora final precisa ser maior que a hora inicial.', 'warn'); return; }
    if (semDia) { toast('Escolha ao menos um dia da semana.', 'warn'); return; }
    try { await salvar.mutateAsync(d); toast('Configuração salva.'); }
    catch (e) { toast(msgErro(e), 'warn'); }
  }

  return (
    <section className="mat-sec">
      <header className="mat-sec-h">
        <div>
          <h2><IcGear />Configuração</h2>
          <p>Janela e mix do aquecimento. A curva de volume por dia de rampa é definida no backend e não é editável aqui.</p>
        </div>
      </header>

      <div className="mat-cfg">
        <div className="mat-fld curta">
          <span>Modo</span>
          <select className="atv-select" value={config.data.modo} disabled>
            <option value="dry_run">Simulação (dry run)</option>
            <option value="ativo">Ativo</option>
          </select>
          <em>Trocado pelo botão do topo da página.</em>
        </div>
        <div className="mat-fld curta">
          <span>Início da janela</span>
          <select className="atv-select" value={d.hora_inicio} onChange={(e) => set({ hora_inicio: Number(e.target.value) })}>
            {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
          </select>
        </div>
        <div className="mat-fld curta">
          <span>Fim da janela</span>
          <select className="atv-select" value={d.hora_fim} onChange={(e) => set({ hora_fim: Number(e.target.value) })}>
            {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
          </select>
          {janelaInvalida && <em className="bad">A hora final precisa ser maior que a inicial.</em>}
        </div>
        <div className="mat-fld curta">
          <span>Tráfego para sementes</span>
          <div className="mat-range">
            <input type="range" min={0} max={100} step={5} value={d.pct_sementes}
              onChange={(e) => set({ pct_sementes: Number(e.target.value) })} />
            <b>{d.pct_sementes}%</b>
          </div>
          <em>Fração do volume diário que vai para números externos a partir do dia {config.data.dia_sementes}.</em>
        </div>
        <div className="mat-fld larga">
          <span>Dias da semana</span>
          <div className="mat-dias">
            {DIAS_SEMANA.map((x) => (
              <button key={x.v} type="button" className={'mat-dia' + (dias.includes(x.v) ? ' on' : '')} onClick={() => toggleDia(x.v)}>{x.r}</button>
            ))}
          </div>
          <em>{semDia ? 'Escolha ao menos um dia.' : 'Domingo costuma ficar de fora: gente de verdade conversa menos.'}</em>
        </div>
      </div>

      <div className="mat-cfg-acts">
        <button className="mat-btn cta" disabled={salvar.isPending || janelaInvalida || semDia} onClick={aplicar}>
          {salvar.isPending ? 'Salvando…' : 'Salvar configuração'}
        </button>
        <span className="mat-cfg-nota">Fuso: {config.data.timezone} · rampa completa em {config.data.dias_para_maduro} dias · mínimo de {config.data.min_sementes} sementes.</span>
      </div>
    </section>
  );
}
