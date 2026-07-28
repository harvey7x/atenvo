import { useEffect, useLayoutEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useOrg } from '@/context/OrgContext';
import { useAuth } from '@/context/AuthContext';
import { WA_REAL, useWaCanais } from '@/data/whatsapp';
import { useFbStatus } from '@/data/facebook';
import { useStatusDefs, useEtiquetas, useAtendimentoActions } from '@/data/atendimento';
import {
  CFG_REAL, useMeuPerfil, useSalvarPerfil, salvarAvatar, subirAvatar, urlAvatar,
  useOrgFull, useSalvarOrg, useEquipe, useEquipeActions, useContatosBuscaCfg,
  type ConviteResultado, type ConvidarInput, type EquipeData, type MeuPerfil, type OrgFull,
  usePreferencias, useSalvarPreferencias, type Prefs, PREFS_PADRAO,
  useConfigAtendimento, useSalvarConfigAtendimento, type ConfigAtendimento, ATEND_PADRAO,
  traduzCfg,
} from '@/data/configuracoes';
import { DEMO_MODE } from '@/lib/demo';
import { PALETA_CORES, podeGerenciarAtendimento, type StatusDef } from '@/types/atendimento';
import { resetDemonstracao, solicitarTrocaEmail } from '../services/conta';
import { criarRaizPortalV2 } from '../components/portal';
import { tempoCelula } from '../lib/tempo';
import {
  BadgeStatus, BotaoMini, BotaoPrimario, BotaoSec, CardVidro, Chip, Chips, ConfirmDialogV2,
  EstadoErro, Input, LinhaToggle, ModalV2, Skeleton, TabelaPadrao, type Coluna, type TomStatus,
} from '../components';
import './configuracoes.css';

/* ------------------------------------------------------------------
   Configurações v2 — anatomia cfg do mockup (pg-config: nav interna
   à esquerda + painel de vidro), abas REAIS do v1 (decisão registrada):
   Conta / Equipe / Canais / Atendimento / Notificações / Preferências.
   Funcional de src/pages/Configuracoes.tsx (somente leitura); chamadas
   que eram inline lá viraram src/v2/services/conta.ts. Tema NÃO é
   exposto (Platina é tema único — precedente do login); a preferência
   salva fica intacta até o corte.
   ------------------------------------------------------------------ */

const TABS = [
  { id: 'conta', label: 'Conta' }, { id: 'equipe', label: 'Equipe' }, { id: 'canais', label: 'Canais' },
  { id: 'atendimento', label: 'Atendimento' }, { id: 'notif', label: 'Notificações' }, { id: 'prefs', label: 'Preferências' },
];
const TAB_IDS = TABS.map((t) => t.id);
const PAPEL_LABEL: Record<string, string> = { admin: 'Administrador', supervisor: 'Supervisor', atendente: 'Atendente' };
const STATUS_LABEL: Record<string, string> = { ativo: 'Ativo', inativo: 'Inativo', convidado: 'Convite pendente', pendente: 'Convite pendente', expirado: 'Convite expirado' };
const STATUS_TOM: Record<string, TomStatus> = { ativo: 'ok', inativo: 'neutro', convidado: 'atencao', pendente: 'atencao', expirado: 'erro' };
const WA_ST: Record<string, { t: string; tom: TomStatus }> = {
  conectado: { t: 'Conectado', tom: 'ok' }, sincronizando: { t: 'Sincronizando', tom: 'atencao' },
  desconectado: { t: 'Desconectado', tom: 'neutro' }, atencao: { t: 'Atenção', tom: 'atencao' }, erro: { t: 'Erro', tom: 'erro' },
};
const TIPO_ORIGEM: Record<string, string> = { trafego: 'Tráfego', ura: 'URA', organico: 'Orgânico', indicacao: 'Indicação', campanha: 'Campanha', parceiro: 'Parceiro', outro: 'Outro' };
const DIAS_SEMANA = [{ i: 0, l: 'Dom' }, { i: 1, l: 'Seg' }, { i: 2, l: 'Ter' }, { i: 3, l: 'Qua' }, { i: 4, l: 'Qui' }, { i: 5, l: 'Sex' }, { i: 6, l: 'Sáb' }];

const NOTIF_EMAIL = [
  { k: 'novos_leads', t: 'Novos contatos e leads', d: 'Receba um email quando um novo contato entrar.' },
  { k: 'sem_resposta', t: 'Mensagens não respondidas', d: 'Resumo de mensagens de clientes sem resposta.' },
  { k: 'cobrancas_vencendo', t: 'Cobranças vencendo', d: 'Avisos de parcelas próximas do vencimento.' },
  { k: 'resumo_diario', t: 'Resumo diário', d: 'Um panorama do dia enviado de manhã.' },
  { k: 'convite_aceito', t: 'Convite aceito', d: 'Aviso quando alguém aceitar um convite.' },
];
const NOTIF_APP = [
  { k: 'push', t: 'Notificações push', d: 'Alertas em tempo real na plataforma.' },
  { k: 'som', t: 'Som de notificação', d: 'Toque sonoro ao receber atendimento.' },
  { k: 'aguardando', t: 'Cliente aguardando atendimento', d: 'Destaque quando alguém espera resposta.' },
  { k: 'novos_membros', t: 'Novos membros na equipe', d: 'Aviso quando alguém entrar na equipe.' },
  { k: 'cobrancas', t: 'Cobranças', d: 'Alertas de cobranças e pagamentos.' },
  { k: 'mencoes', t: 'Menções e atribuições', d: 'Quando você for atribuído a um atendimento.' },
];

/* avatar com iniciais (sem cores por nome do v1: platina neutro; foto quando houver) */
function iniciais(n: string) { const p = (n || '').trim().split(/\s+/); return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase() || '?'; }
const Av = ({ n, src }: { n: string; src?: string | null }) => (
  <span className={src ? 'cfa-av foto' : 'cfa-av'} style={src ? { backgroundImage: `url(${src})` } : undefined} aria-hidden>{iniciais(n)}</span>
);

/* ícones na família de traço do shell */
const Ic = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{children}</svg>
);
const IcDots = () => <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden><circle cx="12" cy="5" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="12" cy="19" r="1.7" /></svg>;
const IcUp = () => <Ic><path d="m6 15 6-6 6 6" /></Ic>;
const IcDown = () => <Ic><path d="m6 9 6 6 6-6" /></Ic>;
const IcLixo = () => <Ic><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></Ic>;
const IcEstrela = () => <Ic><path d="m12 3 2.7 5.8 6.3.7-4.7 4.3 1.3 6.2L12 17.9 6.1 20l1.3-6.2-4.7-4.3 6.3-.7z" /></Ic>;
const IcWa = () => <Ic><path d="M21 11.5a8.4 8.4 0 01-9 8.4 8.9 8.9 0 01-3.8-.8L3 20l1-4.9a8.3 8.3 0 01-1-4A8.4 8.4 0 0112 3a8.4 8.4 0 019 8.5z" /></Ic>;
const IcFb = () => <Ic><path d="M12 3a8.5 8.5 0 00-6.4 14.1L5 20l3-.8A8.5 8.5 0 1012 3z" /><path d="M7.6 13.6l3.1-3.3 2.2 2.1 3.5-3.6" /></Ic>;

type Aviso = { tom: 'ok' | 'erro'; texto: string } | null;

/* ---------- modo demonstração: seed em memória (CFG_REAL=false) ---------- */
interface SeedCfg {
  perfil: MeuPerfil; avatarDataUrl: string | null; org: OrgFull; equipe: EquipeData;
  prefs: Prefs; cfgAt: ConfigAtendimento;
  canais: { id: string; alias: string; numero: string | null; status: string; origemTipo: string | null; gestorNome: string | null }[];
  fb: { id: string; pagina_id: string; pagina_nome: string | null; estado: string }[];
  contatos: { id: string; nome: string; telefone: string | null }[];
}
function seedCfg(): SeedCfg {
  const dia = 86_400_000; const agora = Date.now();
  const iso = (t: number) => new Date(t).toISOString();
  return {
    perfil: { id: 'u-demo', nome: 'Henrique Prado', email: 'henrique@empresademo.com.br', telefone: '(51) 99999-0000', cargo: 'Gestor de atendimento', avatarUrl: null },
    avatarDataUrl: null,
    org: { id: 'org_demo', nome: 'Empresa Demonstração Ltda', nomeFantasia: 'Empresa Demonstração', documento: '12.345.678/0001-90', telefone: '(51) 3333-4444', email: 'contato@empresademo.com.br', timezone: 'America/Sao_Paulo', moeda: 'BRL', logoUrl: null },
    equipe: {
      membros: [
        { usuario_id: 'u-demo', nome: 'Henrique Prado', email: 'henrique@empresademo.com.br', papel: 'admin', status: 'ativo', criado_em: iso(agora - 320 * dia), ultimo_acesso: iso(agora - 3_600_000) },
        { usuario_id: 'u-2', nome: 'Juliana Costa', email: 'juliana@empresademo.com.br', papel: 'supervisor', status: 'ativo', criado_em: iso(agora - 200 * dia), ultimo_acesso: iso(agora - 26 * 3_600_000) },
        { usuario_id: 'u-3', nome: 'Rafael Nunes', email: 'rafael@empresademo.com.br', papel: 'atendente', status: 'ativo', criado_em: iso(agora - 90 * dia), ultimo_acesso: iso(agora - 4 * dia) },
        { usuario_id: 'u-4', nome: 'Marcos Lima', email: 'marcos@empresademo.com.br', papel: 'atendente', status: 'inativo', criado_em: iso(agora - 150 * dia), ultimo_acesso: iso(agora - 60 * dia) },
      ],
      convites: [
        { id: 'cv-1', email: 'ana.souza@gmail.com', nome: 'Ana Souza', papel: 'atendente', status: 'pendente', expira_em: iso(agora + 5 * dia), criado_em: iso(agora - 2 * dia), convidado_por: 'u-demo' },
        { id: 'cv-2', email: 'pedro.silva@gmail.com', nome: null, papel: 'supervisor', status: 'expirado', expira_em: iso(agora - dia), criado_em: iso(agora - 9 * dia), convidado_por: 'u-demo' },
      ],
      vagas: { limite: 6, ativos: 3, pendentes: 1 },
    },
    prefs: { ...PREFS_PADRAO, notif_email: { novos_leads: true, cobrancas_vencendo: true }, notif_app: { push: true, som: true, aguardando: true, mencoes: true } },
    cfgAt: { ...ATEND_PADRAO, horario_inicio: '08:30', mensagem_fora_horario: 'Olá! Nosso atendimento é de segunda a sexta, das 8h30 às 18h. Retornaremos assim que possível.' },
    canais: [
      { id: 'ch-1', alias: 'Atendimento Principal', numero: '+55 51 98888-0001', status: 'conectado', origemTipo: 'trafego', gestorNome: 'Henrique Prado' },
      { id: 'ch-2', alias: 'Número de campanha', numero: '+55 51 97777-0002', status: 'desconectado', origemTipo: 'campanha', gestorNome: null },
    ],
    fb: [{ id: 'fb-1', pagina_id: 'pg-demo', pagina_nome: 'Empresa Demonstração', estado: 'conectado' }],
    contatos: [
      { id: 'c1', nome: 'Ana Souza', telefone: '+55 51 98111-2233' },
      { id: 'c2', nome: 'Antônio Pereira', telefone: '+55 51 98444-5566' },
      { id: 'c3', nome: 'Mariana Alves', telefone: null },
    ],
  };
}

export default function ConfiguracoesV2() {
  const { currentOrg } = useOrg();
  const { user } = useAuth();
  const navigate = useNavigate();
  const demo = !CFG_REAL;
  const podeGerenciar = podeGerenciarAtendimento(currentOrg.role); // admin/gestor(supervisor)
  const podeAdmin = currentOrg.role === 'admin';

  // deep-link ?tab= (sincroniza quando o param muda) e ?section= — paridade v1
  const [searchParams] = useSearchParams();
  const sectionParam = searchParams.get('section');
  const initialTab = searchParams.get('tab');
  const [tab, setTab] = useState(initialTab && TAB_IDS.includes(initialTab) ? initialTab : 'conta');
  useEffect(() => { if (initialTab && TAB_IDS.includes(initialTab)) setTab(initialTab); }, [initialTab]);

  const [aviso, setAviso] = useState<Aviso>(null);
  const [seed, setSeed] = useState<SeedCfg | null>(() => (demo ? seedCfg() : null));

  // cascata de entrada roda UMA vez (carga da página); trocas de aba não re-animam
  const primeiraCarga = useRef(true);
  useEffect(() => { primeiraCarga.current = false; }, []);
  const anima = primeiraCarga.current;
  const abaInicial = useRef(tab).current;

  // troca de aba volta o palco ao topo (o scroll do shell persiste entre painéis)
  const raizRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (primeiraCarga.current) return;
    for (let el = raizRef.current?.parentElement; el; el = el.parentElement) {
      if (el.scrollTop > 0) el.scrollTo({ top: 0 });
    }
  }, [tab]);

  return (
    <>
      <div className="ph sobe">
        <div>
          <h2>Configurações</h2>
          <p>Perfil, equipe e comportamento do sistema.{demo ? ' · modo demonstração (nada é gravado)' : ''}</p>
        </div>
      </div>

      {aviso && (
        <div className={aviso.tom === 'erro' ? 'aviso-inline erro' : 'aviso-inline'} role="status">
          {aviso.texto}
          <button type="button" onClick={() => setAviso(null)} aria-label="Fechar aviso">×</button>
        </div>
      )}

      {DEMO_MODE && podeAdmin && <DemoResetCard demo={demo} aoAvisar={setAviso} />}

      <div className="cfg" ref={raizRef}>
        <CardVidro sobe className="cfg-nav" atraso={0.08} role="tablist" aria-label="Seções de configurações">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'it on' : 'it'} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </CardVidro>

        {/* paridade v1: as 6 seções ficam SEMPRE montadas e alternam por CSS —
            edições não salvas, filtros e menus sobrevivem à troca de aba */}
        <div>
          <section className={tab === 'conta' ? 'cfg-aba on' : 'cfg-aba'}>
            <PainelConta anima={anima && abaInicial === 'conta'} demo={demo} seed={seed} setSeed={setSeed} aoAvisar={setAviso} podeGerenciar={podeGerenciar} />
          </section>
          <section className={tab === 'equipe' ? 'cfg-aba on' : 'cfg-aba'}>
            <PainelEquipe anima={anima && abaInicial === 'equipe'} demo={demo} seed={seed} setSeed={setSeed} aoAvisar={setAviso} podeAdmin={podeAdmin} podeGerenciar={podeGerenciar} meuId={demo ? 'u-demo' : user?.id} />
          </section>
          <section className={tab === 'canais' ? 'cfg-aba on' : 'cfg-aba'}>
            <PainelCanais anima={anima && abaInicial === 'canais'} demo={demo} seed={seed} podeGerenciar={podeGerenciar} onNav={navigate} />
          </section>
          <section className={tab === 'atendimento' ? 'cfg-aba on' : 'cfg-aba'}>
            <PainelConfigAtendimento anima={anima && abaInicial === 'atendimento'} demo={demo} seed={seed} setSeed={setSeed} aoAvisar={setAviso} podeGerenciar={podeAdmin} />
            <PainelStatusEtiquetas anima={anima && abaInicial === 'atendimento'} canManage={podeGerenciar} section={tab === 'atendimento' ? sectionParam : null} aoAvisar={setAviso} />
          </section>
          <section className={tab === 'notif' ? 'cfg-aba on' : 'cfg-aba'}>
            <PainelNotif anima={anima && abaInicial === 'notif'} demo={demo} seed={seed} setSeed={setSeed} aoAvisar={setAviso} />
          </section>
          <section className={tab === 'prefs' ? 'cfg-aba on' : 'cfg-aba'}>
            <PainelPrefs anima={anima && abaInicial === 'prefs'} demo={demo} seed={seed} setSeed={setSeed} aoAvisar={setAviso} />
          </section>
        </div>
      </div>
    </>
  );
}

/* ===================== Demonstração (reset) ===================== */
function DemoResetCard({ demo, aoAvisar }: { demo: boolean; aoAvisar: (a: Aviso) => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ultimo, setUltimo] = useState<string | null>(null);
  async function reset() {
    setBusy(true);
    try {
      if (demo) await new Promise((r) => setTimeout(r, 400));
      else await resetDemonstracao();
      setUltimo(new Date().toLocaleString('pt-BR'));
      aoAvisar({ tom: 'ok', texto: 'Dados da demonstração restaurados.' });
      setOpen(false);
    } catch (e) { aoAvisar({ tom: 'erro', texto: (e as Error).message || 'Falha ao restaurar.' }); }
    finally { setBusy(false); }
  }
  return (
    <CardVidro sobe style={{ padding: '14px 18px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 260 }}>
        <div className="cfg-sec" style={{ marginBottom: 4 }}>Ambiente de demonstração</div>
        <p style={{ fontSize: 11.5, color: 'var(--txt-2)', lineHeight: 1.55 }}>
          Restaura a massa fictícia original (contatos, conversas, Kanban, cobranças). Afeta apenas a demo.{ultimo ? ' Último reset: ' + ultimo : ''}
        </p>
      </div>
      <button type="button" className="p-btn btn-perigo" onClick={() => setOpen(true)}>Restaurar dados da demonstração</button>
      <ConfirmDialogV2
        aberto={open}
        titulo="Restaurar dados da demonstração?"
        mensagem="Toda a massa fictícia atual será apagada e recriada do zero. Esta ação afeta apenas o ambiente de demonstração, nunca a produção."
        destrutivo
        carregando={busy}
        rotuloConfirmar="Restaurar"
        aoConfirmar={reset}
        aoCancelar={() => { if (!busy) setOpen(false); }}
      />
    </CardVidro>
  );
}

/* ===================== Conta (Perfil + Empresa) ===================== */
function PainelConta({ anima, demo, seed, setSeed, aoAvisar, podeGerenciar }: {
  anima: boolean; demo: boolean; seed: SeedCfg | null; setSeed: Dispatch<SetStateAction<SeedCfg | null>>;
  aoAvisar: (a: Aviso) => void; podeGerenciar: boolean;
}) {
  const { currentOrg } = useOrg();
  const { user, refreshProfile } = useAuth();
  const perfilQ = useMeuPerfil();
  const salvar = useSalvarPerfil();
  const orgQ = useOrgFull();
  const salvarOrg = useSalvarOrg();

  const perfil = demo ? seed?.perfil ?? null : perfilQ.data ?? null;
  const orgDado = demo ? seed?.org ?? null : orgQ.data ?? null;
  const email = demo ? seed?.perfil.email : user?.email;

  const [form, setForm] = useState({ nome: '', telefone: '', cargo: '' });
  const [avatarSrc, setAvatarSrc] = useState<string | null>(null);
  const [busyFoto, setBusyFoto] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [org, setOrg] = useState({ nome: '', nomeFantasia: '', documento: '', telefone: '', email: '', timezone: 'America/Sao_Paulo', moeda: 'BRL' });
  const [orgBusy, setOrgBusy] = useState(false);
  const [emailModal, setEmailModal] = useState(false);

  useEffect(() => { if (perfil) setForm({ nome: perfil.nome, telefone: perfil.telefone, cargo: perfil.cargo }); }, [perfil]);
  useEffect(() => {
    if (demo) { setAvatarSrc(seed?.avatarDataUrl ?? null); return; }
    let alive = true;
    urlAvatar(perfilQ.data?.avatarUrl ?? null).then((u) => { if (alive) setAvatarSrc(u); });
    return () => { alive = false; };
  }, [demo, seed?.avatarDataUrl, perfilQ.data?.avatarUrl]);
  useEffect(() => { if (orgDado) setOrg({ nome: orgDado.nome, nomeFantasia: orgDado.nomeFantasia, documento: orgDado.documento, telefone: orgDado.telefone, email: orgDado.email, timezone: orgDado.timezone, moeda: orgDado.moeda }); }, [orgDado]);

  async function salvarPerfil() {
    try {
      if (demo) { setSeed((s) => s && ({ ...s, perfil: { ...s.perfil, nome: form.nome, telefone: form.telefone, cargo: form.cargo } })); }
      else { await salvar.mutateAsync({ nome: form.nome, telefone: form.telefone, cargo: form.cargo }); await refreshProfile(); }
      aoAvisar({ tom: 'ok', texto: 'Perfil salvo' });
    } catch (e) { aoAvisar({ tom: 'erro', texto: traduzCfg((e as Error).message) }); }
  }
  async function trocarFoto(file: File) {
    if (!perfil) return; setBusyFoto(true);
    try {
      if (demo) {
        const url = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(file); });
        setSeed((s) => s && ({ ...s, avatarDataUrl: url }));
      } else {
        const path = await subirAvatar(currentOrg.id, perfil.id, file);
        await salvarAvatar(path);
        setAvatarSrc(await urlAvatar(path));
        perfilQ.refetch();
      }
      aoAvisar({ tom: 'ok', texto: 'Foto atualizada' });
    } catch (e) { aoAvisar({ tom: 'erro', texto: traduzCfg((e as Error).message) }); }
    finally { setBusyFoto(false); }
  }
  async function removerFoto() {
    if (!perfil) return; setBusyFoto(true);
    try {
      if (demo) setSeed((s) => s && ({ ...s, avatarDataUrl: null }));
      else { await salvarAvatar(null); setAvatarSrc(null); perfilQ.refetch(); }
      aoAvisar({ tom: 'ok', texto: 'Foto removida' });
    } catch (e) { aoAvisar({ tom: 'erro', texto: traduzCfg((e as Error).message) }); }
    finally { setBusyFoto(false); }
  }
  async function salvarEmpresa() {
    if (org.documento && org.documento.replace(/\D/g, '').length !== 14) { aoAvisar({ tom: 'erro', texto: 'CNPJ deve ter 14 dígitos.' }); return; }
    setOrgBusy(true);
    try {
      if (demo) setSeed((s) => s && ({ ...s, org: { ...s.org, ...org } }));
      else await salvarOrg.mutateAsync(org);
      aoAvisar({ tom: 'ok', texto: 'Dados da empresa salvos' });
    } catch (e) { aoAvisar({ tom: 'erro', texto: traduzCfg((e as Error).message) }); }
    finally { setOrgBusy(false); }
  }

  const carregando = demo ? !seed : perfilQ.isLoading;
  const erro = !demo && perfilQ.isError;

  return (
    <CardVidro spot sobe={anima} className="cfg-painel" atraso={0.15}>
      <div className="cfg-sec">Perfil</div>
      <p style={{ fontSize: 11.5, color: 'var(--txt-2)', marginTop: -8, marginBottom: 13 }}>Suas informações pessoais exibidas na plataforma.</p>
      {erro ? (
        <EstadoErro descricao="Erro ao carregar perfil." aoTentarDeNovo={() => perfilQ.refetch()} />
      ) : carregando ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} aria-hidden>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}><Skeleton largura={46} altura={46} raio={99} /><Skeleton largura="34%" /></div>
          <Skeleton altura={36} raio={9} /><Skeleton altura={36} raio={9} largura="70%" />
        </div>
      ) : (
        <>
          <div className="cfa-perfil">
            <Av n={form.nome || 'U'} src={avatarSrc} />
            <div className="pi">
              <div className="nm">{form.nome || '—'}</div>
              <div className="rl">{PAPEL_LABEL[currentOrg.role === 'gestor' ? 'supervisor' : currentOrg.role] || currentOrg.role} · {email}</div>
            </div>
            <div className="pa">
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) trocarFoto(f); e.currentTarget.value = ''; }} />
              <BotaoMini disabled={busyFoto} onClick={() => fileRef.current?.click()}>{busyFoto ? 'Enviando…' : 'Alterar foto'}</BotaoMini>
              {avatarSrc && <button type="button" className="p-btn btn-perigo btn-mini" disabled={busyFoto} onClick={removerFoto}>Remover</button>}
            </div>
          </div>
          <div className="form-2col">
            <div className="campo" style={{ marginBottom: 0 }}>
              <label htmlFor="cfa-nome">Nome completo</label>
              <Input id="cfa-nome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            </div>
            <div className="campo" style={{ marginBottom: 0 }}>
              <label htmlFor="cfa-cargo">Cargo</label>
              <Input id="cfa-cargo" value={form.cargo} onChange={(e) => setForm({ ...form, cargo: e.target.value })} placeholder="Ex.: Atendente, Gestor" />
            </div>
            <div className="campo" style={{ marginBottom: 0 }}>
              <label htmlFor="cfa-email">Email</label>
              <div className="cfa-email">
                <Input id="cfa-email" type="email" value={email || ''} readOnly />
                <BotaoSec onClick={() => setEmailModal(true)}>Alterar</BotaoSec>
              </div>
            </div>
            <div className="campo" style={{ marginBottom: 0 }}>
              <label htmlFor="cfa-tel">Telefone</label>
              <Input id="cfa-tel" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} placeholder="(00) 00000-0000" />
            </div>
          </div>
          <div className="cfa-rodape">
            <BotaoSec disabled={!perfil} onClick={() => perfil && setForm({ nome: perfil.nome, telefone: perfil.telefone, cargo: perfil.cargo })}>Cancelar</BotaoSec>
            <BotaoPrimario disabled={salvar.isPending || !perfil} onClick={salvarPerfil}>{salvar.isPending ? 'Salvando…' : 'Salvar alterações'}</BotaoPrimario>
          </div>
        </>
      )}

      <div className="cfg-div" />
      <div className="cfg-sec">Empresa</div>
      <p style={{ fontSize: 11.5, color: 'var(--txt-2)', marginTop: -8, marginBottom: 13 }}>
        Dados da organização usados em documentos e relatórios.{!podeGerenciar ? ' Somente administradores e supervisores podem editar.' : ''}
      </p>
      {(demo ? !seed : orgQ.isLoading) ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} aria-hidden><Skeleton altura={36} raio={9} /><Skeleton altura={36} raio={9} largura="62%" /></div>
      ) : (
        <>
          <div className="form-2col">
            <div className="campo" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
              <label htmlFor="cfa-onome">Nome da empresa</label>
              <Input id="cfa-onome" value={org.nome} disabled={!podeGerenciar} onChange={(e) => setOrg({ ...org, nome: e.target.value })} />
            </div>
            <div className="campo" style={{ marginBottom: 0 }}>
              <label htmlFor="cfa-fant">Nome fantasia</label>
              <Input id="cfa-fant" value={org.nomeFantasia} disabled={!podeGerenciar} onChange={(e) => setOrg({ ...org, nomeFantasia: e.target.value })} />
            </div>
            <div className="campo" style={{ marginBottom: 0 }}>
              <label htmlFor="cfa-cnpj">CNPJ</label>
              <Input id="cfa-cnpj" value={org.documento} disabled={!podeGerenciar} onChange={(e) => setOrg({ ...org, documento: e.target.value })} placeholder="00.000.000/0000-00" />
            </div>
            <div className="campo" style={{ marginBottom: 0 }}>
              <label htmlFor="cfa-otel">Telefone</label>
              <Input id="cfa-otel" value={org.telefone} disabled={!podeGerenciar} onChange={(e) => setOrg({ ...org, telefone: e.target.value })} />
            </div>
            <div className="campo" style={{ marginBottom: 0 }}>
              <label htmlFor="cfa-oemail">Email</label>
              <Input id="cfa-oemail" type="email" value={org.email} disabled={!podeGerenciar} onChange={(e) => setOrg({ ...org, email: e.target.value })} />
            </div>
            <div className="campo" style={{ marginBottom: 0 }}>
              <label htmlFor="cfa-fuso">Fuso horário</label>
              <select id="cfa-fuso" className="inp" value={org.timezone} disabled={!podeGerenciar} onChange={(e) => setOrg({ ...org, timezone: e.target.value })}>
                <option value="America/Sao_Paulo">(GMT-03:00) São Paulo</option>
                <option value="America/Manaus">(GMT-04:00) Manaus</option>
                <option value="America/Noronha">(GMT-02:00) Fernando de Noronha</option>
              </select>
            </div>
            <div className="campo" style={{ marginBottom: 0 }}>
              <label htmlFor="cfa-idioma">Idioma padrão</label>
              <select id="cfa-idioma" className="inp" value="pt-BR" disabled><option value="pt-BR">Português (Brasil)</option></select>
            </div>
            <div className="campo" style={{ marginBottom: 0 }}>
              <label htmlFor="cfa-moeda">Moeda</label>
              <select id="cfa-moeda" className="inp" value={org.moeda} disabled={!podeGerenciar} onChange={(e) => setOrg({ ...org, moeda: e.target.value })}>
                <option value="BRL">Real (R$)</option><option value="USD">Dólar (US$)</option>
              </select>
            </div>
          </div>
          {podeGerenciar && (
            <div className="cfa-rodape">
              <BotaoPrimario disabled={orgBusy || !orgDado} onClick={salvarEmpresa}>{orgBusy ? 'Salvando…' : 'Salvar alterações'}</BotaoPrimario>
            </div>
          )}
        </>
      )}

      {emailModal && (
        <ModalEmail
          atual={email || ''}
          demo={demo}
          aoFechar={() => setEmailModal(false)}
          aoAvisar={aoAvisar}
        />
      )}
    </CardVidro>
  );
}

/* troca de e-mail — substitui o window.prompt do v1 pelos mesmos textos */
function ModalEmail({ atual, demo, aoFechar, aoAvisar }: { atual: string; demo: boolean; aoFechar: () => void; aoAvisar: (a: Aviso) => void }) {
  const [novo, setNovo] = useState(atual);
  const [busy, setBusy] = useState(false);
  async function enviar() {
    if (!novo || novo === atual) { aoFechar(); return; }
    setBusy(true);
    try {
      if (demo) await new Promise((r) => setTimeout(r, 300));
      else await solicitarTrocaEmail(novo);
      aoAvisar({ tom: 'ok', texto: 'Enviamos um link de confirmação para o novo e-mail.' });
      aoFechar();
    } catch (e) { aoAvisar({ tom: 'erro', texto: (e as Error).message }); setBusy(false); }
  }
  return (
    <ModalV2
      aberto
      aoFechar={() => { if (!busy) aoFechar(); }}
      fecharNoVeu={!busy}
      largura={420}
      titulo="Alterar e-mail"
      rodape={<>
        <BotaoSec disabled={busy} onClick={aoFechar}>Cancelar</BotaoSec>
        <BotaoPrimario disabled={busy} onClick={enviar}>{busy ? 'Enviando…' : 'Enviar link'}</BotaoPrimario>
      </>}
    >
      <div className="campo" style={{ marginBottom: 0 }}>
        <label htmlFor="cfa-novo-email">Novo e-mail (você receberá um link de confirmação):</label>
        <Input id="cfa-novo-email" type="email" value={novo} onChange={(e) => setNovo(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void enviar(); }} />
      </div>
    </ModalV2>
  );
}

/* ===================== Equipe ===================== */
type LinhaEquipe = { kind: 'membro' | 'convite'; id: string; nome: string; email: string; papel: string; status: string; ultimo: string | null; data: string };

function CelulaTempo({ iso }: { iso: string }) {
  const t = tempoCelula(iso, Date.now());
  return (
    <span className="num" style={{ whiteSpace: 'nowrap' }}>
      {t.principal}
      <span style={{ display: 'block', fontSize: 10, color: 'var(--txt-3)' }}>{t.apoio}</span>
    </span>
  );
}

function PainelEquipe({ anima, demo, seed, setSeed, aoAvisar, podeAdmin, podeGerenciar, meuId }: {
  anima: boolean; demo: boolean; seed: SeedCfg | null; setSeed: Dispatch<SetStateAction<SeedCfg | null>>;
  aoAvisar: (a: Aviso) => void; podeAdmin: boolean; podeGerenciar: boolean; meuId?: string;
}) {
  const equipeQ = useEquipe();
  const acoesReais = useEquipeActions();
  const [menu, setMenu] = useState<string | null>(null);
  const [convite, setConvite] = useState(false);
  const [filtro, setFiltro] = useState<'todos' | 'ativos' | 'pendentes' | 'inativos'>('todos');
  const [fPapel, setFPapel] = useState('');
  const eq = demo ? seed?.equipe : equipeQ.data;
  const vagas = eq?.vagas;

  /* ações unificadas — no demo mutam o seed; convite REAL dispara e-mail, então
     a regra de ouro vale em dobro: no :5175 nenhum convite nem em teste */
  const acoes = {
    async alterarPapel(id: string, papel: string) {
      if (demo) { setSeed((s) => s && ({ ...s, equipe: { ...s.equipe, membros: s.equipe.membros.map((m) => m.usuario_id === id ? { ...m, papel } : m) } })); return; }
      await acoesReais.alterarPapel(id, papel);
    },
    async definirStatus(id: string, status: string) {
      if (demo) { setSeed((s) => s && ({ ...s, equipe: { ...s.equipe, membros: s.equipe.membros.map((m) => m.usuario_id === id ? { ...m, status } : m) } })); return; }
      await acoesReais.definirStatus(id, status);
    },
    async convidar(p: ConvidarInput): Promise<ConviteResultado> {
      if (demo) {
        const id = `cv-${Date.now()}`;
        setSeed((s) => s && ({
          ...s,
          equipe: {
            ...s.equipe,
            convites: [...s.equipe.convites, { id, email: p.email, nome: p.nome || null, papel: p.papel, status: 'pendente', expira_em: new Date(Date.now() + 7 * 86_400_000).toISOString(), criado_em: new Date().toISOString(), convidado_por: 'u-demo' }],
            vagas: { ...s.equipe.vagas, pendentes: s.equipe.vagas.pendentes + 1 },
          },
        }));
        return p.enviar_whatsapp
          ? { ok: true, estado: 'enviado_whatsapp', convite_id: id }
          : { ok: true, estado: 'link_gerado', convite_id: id, inviteLink: `https://demo.atenvo.app/definir-senha?convite=${id}` };
      }
      return acoesReais.convidar(p);
    },
    async reenviar(id: string): Promise<ConviteResultado> {
      if (demo) return { ok: true, estado: 'link_gerado', convite_id: id, inviteLink: `https://demo.atenvo.app/definir-senha?convite=${id}` };
      return acoesReais.reenviar(id);
    },
    async cancelar(id: string): Promise<ConviteResultado> {
      if (demo) {
        setSeed((s) => s && ({ ...s, equipe: { ...s.equipe, convites: s.equipe.convites.filter((c) => c.id !== id), vagas: { ...s.equipe.vagas, pendentes: Math.max(0, s.equipe.vagas.pendentes - 1) } } }));
        return { ok: true };
      }
      return acoesReais.cancelar(id);
    },
  };

  const linhas: LinhaEquipe[] = useMemo(() => {
    const ms = (eq?.membros ?? []).map((m) => ({ kind: 'membro' as const, id: m.usuario_id, nome: m.nome, email: m.email, papel: m.papel, status: m.status, ultimo: m.ultimo_acesso, data: m.criado_em }));
    const cs = (eq?.convites ?? []).map((c) => ({ kind: 'convite' as const, id: c.id, nome: c.nome || c.email, email: c.email, papel: c.papel, status: c.status, ultimo: null, data: c.criado_em }));
    return [...ms, ...cs];
  }, [eq]);
  const filtradas = linhas.filter((l) => {
    if (fPapel && l.papel !== fPapel) return false;
    if (filtro === 'ativos') return l.status === 'ativo';
    if (filtro === 'inativos') return l.status === 'inativo';
    if (filtro === 'pendentes') return l.status === 'pendente' || l.status === 'expirado';
    return true;
  });

  async function run(p: Promise<unknown>, ok: string) { try { await p; aoAvisar({ tom: 'ok', texto: ok }); } catch (e) { aoAvisar({ tom: 'erro', texto: traduzCfg((e as Error).message) }); } }
  async function acaoConvite(fn: Promise<ConviteResultado>, okMsg: string, copiar?: boolean) {
    try {
      const r = await fn;
      if (r.error) { aoAvisar({ tom: 'erro', texto: traduzCfg(r.code || r.error) }); return; }
      if (copiar) {
        if (r.inviteLink) { try { await navigator.clipboard.writeText(r.inviteLink); aoAvisar({ tom: 'ok', texto: 'Link do convite copiado. Compartilhe só com o convidado.' }); } catch { aoAvisar({ tom: 'ok', texto: r.inviteLink }); } }
        else { aoAvisar({ tom: 'erro', texto: 'Copiar link só está disponível no modo de link manual.' }); }
        return;
      }
      aoAvisar({ tom: 'ok', texto: r.estado === 'envio_solicitado' ? 'Convite reenviado. A entrega do e-mail ainda não foi confirmada.' : okMsg });
    } catch (e) { aoAvisar({ tom: 'erro', texto: traduzCfg((e as Error).message) }); }
  }

  const COLUNAS: Coluna<LinhaEquipe>[] = [
    {
      chave: 'membro', titulo: 'Membro', render: (l) => (
        <div className="cfa-membro">
          <Av n={l.nome} />
          <div className="mt">
            <span className="nm">{l.nome}{l.id === meuId ? ' (você)' : ''}</span>
            <span className="em">{l.email}</span>
          </div>
        </div>
      ),
    },
    { chave: 'papel', titulo: 'Função', render: (l) => <em className="ag-pill" style={{ fontStyle: 'normal' }}>{PAPEL_LABEL[l.papel] || l.papel}</em> },
    { chave: 'status', titulo: 'Status', render: (l) => <BadgeStatus tom={STATUS_TOM[l.status] || 'neutro'}>{STATUS_LABEL[l.status] || l.status}</BadgeStatus> },
    { chave: 'ultimo', titulo: 'Último acesso', render: (l) => l.kind === 'membro' ? (l.ultimo ? <CelulaTempo iso={l.ultimo} /> : <span style={{ color: 'var(--txt-3)' }}>Nunca</span>) : <span style={{ color: 'var(--txt-3)' }}>—</span> },
    { chave: 'desde', titulo: 'Desde', render: (l) => <CelulaTempo iso={l.data} /> },
    ...(podeGerenciar ? [{
      chave: 'acoes', titulo: '', render: (l: LinhaEquipe) => {
        const gerConv = l.kind === 'convite' && podeGerenciar && (podeAdmin || l.papel === 'atendente');
        const gerMemb = l.kind === 'membro' && podeAdmin && l.id !== meuId;
        if (!gerMemb && !gerConv) return <span style={{ color: 'var(--txt-3)' }}>—</span>;
        const key = l.kind + l.id;
        return (
          <div style={{ position: 'relative', display: 'inline-block' }} onClick={(e) => e.stopPropagation()}>
            <button type="button" className="cfa-kebab" aria-label="Ações" aria-expanded={menu === key} onClick={() => setMenu(menu === key ? null : key)}><IcDots /></button>
            {menu === key && (
              <div className="cfa-menu" onMouseLeave={() => setMenu(null)} role="menu">
                {gerMemb && <>
                  <div className="m-lbl">Perfil</div>
                  {(['admin', 'supervisor', 'atendente'] as const).map((p) => (
                    <button key={p} type="button" className={l.papel === p ? 'mi sel' : 'mi'} onClick={() => { setMenu(null); run(acoes.alterarPapel(l.id, p), 'Perfil atualizado'); }}>{PAPEL_LABEL[p]}</button>
                  ))}
                  <div className="m-sep" />
                  {l.status === 'ativo'
                    ? <button type="button" className="mi" onClick={() => { setMenu(null); run(acoes.definirStatus(l.id, 'inativo'), 'Usuário desativado'); }}>Desativar</button>
                    : <button type="button" className="mi" onClick={() => { setMenu(null); run(acoes.definirStatus(l.id, 'ativo'), 'Usuário reativado'); }}>Reativar</button>}
                </>}
                {gerConv && <>
                  <button type="button" className="mi" onClick={() => { setMenu(null); acaoConvite(acoes.reenviar(l.id), 'Novo link gerado. Links anteriores podem abrir sessão, mas só um convite pendente e válido ativa o acesso.'); }}>Reenviar convite</button>
                  <button type="button" className="mi" onClick={() => { setMenu(null); acaoConvite(acoes.reenviar(l.id), '', true); }}>Copiar link</button>
                  <button type="button" className="mi perigo" onClick={() => { setMenu(null); acaoConvite(acoes.cancelar(l.id), 'Convite cancelado.'); }}>Cancelar convite</button>
                </>}
              </div>
            )}
          </div>
        );
      },
    } as Coluna<LinhaEquipe>] : []),
  ];

  const carregando = demo ? !seed : equipeQ.isLoading;

  return (
    <CardVidro spot sobe={anima} className="cfg-painel" atraso={0.15}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 4 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="cfg-sec" style={{ marginBottom: 4 }}>Equipe</div>
          <p style={{ fontSize: 11.5, color: 'var(--txt-2)', lineHeight: 1.55, marginBottom: 13 }}>
            Pessoas com acesso à organização e convites em aberto.
            {vagas?.limite != null ? ` Uso do plano: ${vagas.ativos + vagas.pendentes} de ${vagas.limite} usuário${vagas.limite === 1 ? '' : 's'} (ativos + convites pendentes).` : ''}
            {!podeGerenciar ? ' Somente administradores/supervisores gerenciam.' : ''}
          </p>
        </div>
        {podeGerenciar && <BotaoPrimario onClick={() => setConvite(true)}>Convidar usuário</BotaoPrimario>}
      </div>

      <div className="cfa-filtros">
        <Chips>
          {(['todos', 'ativos', 'pendentes', 'inativos'] as const).map((f) => (
            <Chip key={f} ativo={filtro === f} onClick={() => setFiltro(f)}>
              {f === 'todos' ? 'Todos' : f === 'ativos' ? 'Ativos' : f === 'pendentes' ? 'Pendentes' : 'Inativos'}
            </Chip>
          ))}
        </Chips>
        <select className="inp cfa-fpapel" value={fPapel} onChange={(e) => setFPapel(e.target.value)} aria-label="Filtrar por perfil">
          <option value="">Todos os perfis</option>
          <option value="admin">Administrador</option>
          <option value="supervisor">Supervisor</option>
          <option value="atendente">Atendente</option>
        </select>
      </div>

      {carregando ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <Skeleton largura={34} altura={34} raio={99} /><Skeleton largura="30%" /><Skeleton largura="14%" raio={99} /><Skeleton largura="12%" raio={99} />
            </div>
          ))}
        </div>
      ) : (
        <>
          {filtradas.length === 0 && <p style={{ fontSize: 11.5, color: 'var(--txt-3)', padding: '12px 0 4px' }}>Nenhum registro para este filtro.</p>}
          <TabelaPadrao
            colunas={COLUNAS}
            linhas={filtradas}
            chave={(l) => l.kind + l.id}
            rodape={{ texto: `${eq?.membros.length ?? 0} membro${(eq?.membros.length ?? 0) === 1 ? '' : 's'}${(eq?.convites.length ?? 0) > 0 ? ` · ${eq?.convites.length} convite${eq?.convites.length === 1 ? '' : 's'}` : ''}` }}
          />
        </>
      )}

      {convite && (
        <ConviteModalV2
          demo={demo}
          seed={seed}
          podeAdmin={podeAdmin}
          aoFechar={() => setConvite(false)}
          aoConvidar={acoes.convidar}
          aoReenviar={acoes.reenviar}
          aoAvisar={aoAvisar}
        />
      )}
    </CardVidro>
  );
}

function ConviteModalV2({ demo, seed, podeAdmin, aoFechar, aoConvidar, aoReenviar, aoAvisar }: {
  demo: boolean; seed: SeedCfg | null; podeAdmin: boolean; aoFechar: () => void;
  aoConvidar: (p: ConvidarInput) => Promise<ConviteResultado>; aoReenviar: (id: string) => Promise<ConviteResultado>;
  aoAvisar: (a: Aviso) => void;
}) {
  const canaisQ = useWaCanais();
  const canais = demo
    ? (seed?.canais ?? []).filter((c) => c.status === 'conectado')
    : (canaisQ.data ?? []).filter((c) => c.status === 'conectado');
  const temCanal = canais.length > 0;
  const [email, setEmail] = useState(''); const [nome, setNome] = useState(''); const [papel, setPapel] = useState('atendente');
  const [telefone, setTelefone] = useState(''); const [canalId, setCanalId] = useState(''); const [enviarWa, setEnviarWa] = useState(true);
  const [busca, setBusca] = useState(''); const [contatoSel, setContatoSel] = useState(false);
  const [busy, setBusy] = useState(false); const [resultado, setResultado] = useState<ConviteResultado | null>(null);
  const contatosQ = useContatosBuscaCfg(demo ? '' : busca);
  const contatos = demo
    ? (busca.trim().length >= 2 ? (seed?.contatos ?? []).filter((c) => (c.nome + ' ' + (c.telefone ?? '')).toLowerCase().includes(busca.trim().toLowerCase())).slice(0, 6) : [])
    : (contatosQ.data ?? []);
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  useEffect(() => { if (temCanal && !canalId) setCanalId(canais[0].id); }, [temCanal, canalId, canais]);
  const wa = enviarWa && temCanal;
  const telOk = telefone.replace(/\D/g, '').length >= 10;
  const podeEnviar = emailOk && (!wa || (telOk && !!canalId));

  async function enviar() {
    if (!emailOk) { aoAvisar({ tom: 'erro', texto: 'Informe um e-mail válido.' }); return; }
    if (wa && !telOk) { aoAvisar({ tom: 'erro', texto: 'Informe um telefone válido para o WhatsApp.' }); return; }
    setBusy(true);
    const r = await aoConvidar({ email: email.trim().toLowerCase(), nome: nome.trim(), papel, telefone: wa ? telefone.trim() : undefined, canal_id: wa ? canalId : undefined, enviar_whatsapp: wa });
    setBusy(false);
    if (r.error) { aoAvisar({ tom: 'erro', texto: traduzCfg(r.code || r.error) }); return; }
    setResultado(r);
  }
  async function tentarNovamente() {
    if (!resultado?.convite_id) return;
    setBusy(true); const r = await aoReenviar(resultado.convite_id); setBusy(false);
    if (r.error) { aoAvisar({ tom: 'erro', texto: traduzCfg(r.code || r.error) }); return; }
    setResultado(r);
  }
  async function copiar(link?: string | null) {
    const l = link ?? resultado?.inviteLink;
    if (l) { try { await navigator.clipboard.writeText(l); aoAvisar({ tom: 'ok', texto: 'Link copiado. Compartilhe só com o convidado.' }); } catch { aoAvisar({ tom: 'ok', texto: l }); } }
  }

  return (
    <ModalV2
      aberto
      aoFechar={() => { if (!busy) aoFechar(); }}
      fecharNoVeu={!busy}
      largura={480}
      titulo="Convidar usuário"
      rodape={resultado
        ? <BotaoPrimario onClick={aoFechar}>Concluir</BotaoPrimario>
        : <>
            <BotaoSec disabled={busy} onClick={aoFechar}>Cancelar</BotaoSec>
            <BotaoPrimario disabled={busy || !podeEnviar} onClick={enviar}>{busy ? 'Enviando…' : (wa ? 'Convidar e enviar' : 'Enviar convite')}</BotaoPrimario>
          </>}
    >
      {resultado ? (
        <div className="form-grid">
          {resultado.estado === 'enviado_whatsapp' ? (
            <div className="cfa-nota ok">✓ Convite enviado pelo WhatsApp para <b>{telefone.trim()}</b>. A pessoa abre o link, define a senha e entra.</div>
          ) : resultado.estado === 'falha_envio' ? (
            <>
              <div className="cfa-nota atencao">Convite criado, mas não foi possível enviar pelo WhatsApp.{resultado.erroEnvio ? ' ' + resultado.erroEnvio : ''} A vaga foi preservada.</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <BotaoSec disabled={busy} onClick={tentarNovamente}>{busy ? 'Enviando…' : 'Tentar novamente'}</BotaoSec>
                {podeAdmin && resultado.inviteLink && <BotaoSec onClick={() => copiar(resultado.inviteLink)}>Copiar link</BotaoSec>}
              </div>
            </>
          ) : resultado.estado === 'link_gerado' && resultado.inviteLink ? (
            <>
              <div className="cfa-nota ok">Convite criado para <b>{email.trim().toLowerCase()}</b>. Link seguro gerado.</div>
              <div className="cfa-nota atencao">Este link permite acesso à conta. Compartilhe somente com o usuário convidado.</div>
              <BotaoSec onClick={() => copiar(resultado.inviteLink)} style={{ alignSelf: 'flex-start' }}>Copiar link do convite</BotaoSec>
            </>
          ) : (
            <div className="cfa-nota ok">Convite criado para <b>{email.trim().toLowerCase()}</b>. A entrega ainda não foi confirmada.</div>
          )}
        </div>
      ) : (
        <div className="form-grid">
          <div className="campo" style={{ marginBottom: 0, position: 'relative' }}>
            <label htmlFor="cfa-cv-nome">Nome</label>
            <Input id="cfa-cv-nome" value={nome} onChange={(e) => { setNome(e.target.value); setBusca(e.target.value); setContatoSel(false); }} placeholder="Nome da pessoa" />
            {!contatoSel && busca.trim().length >= 2 && contatos.length > 0 && (
              <div className="cfa-cts">
                {contatos.map((c) => (
                  <button key={c.id} type="button" className="cfa-ct" onClick={() => { setNome(c.nome); if (c.telefone) setTelefone(c.telefone); setBusca(''); setContatoSel(true); }}>
                    {c.nome}{c.telefone ? ' · ' + c.telefone : ''}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="campo" style={{ marginBottom: 0 }}>
            <label htmlFor="cfa-cv-email">E-mail <span style={{ color: 'var(--rubro)' }}>*</span></label>
            <Input id="cfa-cv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="pessoa@empresa.com" />
          </div>
          <div className="campo" style={{ marginBottom: 0 }}>
            <label htmlFor="cfa-cv-tel">Telefone (WhatsApp){wa ? <span style={{ color: 'var(--rubro)' }}> *</span> : ''}</label>
            <Input id="cfa-cv-tel" value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="+55 11 99999-8888" />
          </div>
          <div className="campo" style={{ marginBottom: 0 }}>
            <label htmlFor="cfa-cv-papel">Perfil</label>
            <select id="cfa-cv-papel" className="inp" value={papel} onChange={(e) => setPapel(e.target.value)}>
              <option value="atendente">Atendente</option>
              <option value="supervisor">Supervisor</option>
              {podeAdmin && <option value="admin">Administrador</option>}
            </select>
          </div>
          {temCanal ? (
            <>
              <label className="cfa-check">
                <input type="checkbox" checked={enviarWa} onChange={(e) => setEnviarWa(e.target.checked)} /> Enviar convite pelo WhatsApp
              </label>
              {enviarWa && (
                <div className="campo" style={{ marginBottom: 0 }}>
                  <label htmlFor="cfa-cv-canal">Canal de WhatsApp</label>
                  <select id="cfa-cv-canal" className="inp" value={canalId} onChange={(e) => setCanalId(e.target.value)}>
                    {canais.map((c) => <option key={c.id} value={c.id}>{c.alias}{c.numero ? ' · ' + c.numero : ''}</option>)}
                  </select>
                </div>
              )}
            </>
          ) : <div className="cfa-nota">Nenhum canal de WhatsApp conectado. O convite será criado com link seguro para copiar.</div>}
          <div className="cfa-nota">Sem senha manual: a pessoa recebe um link seguro e define a própria senha. O convite consome uma vaga do plano até ser aceito ou cancelado.</div>
        </div>
      )}
    </ModalV2>
  );
}

/* ===================== Canais (resumo) ===================== */
function PainelCanais({ anima, demo, seed, podeGerenciar, onNav }: { anima: boolean; demo: boolean; seed: SeedCfg | null; podeGerenciar: boolean; onNav: (p: string) => void }) {
  const waQ = useWaCanais();
  const fbQ = useFbStatus();
  const wa = demo ? (seed?.canais ?? []) : (waQ.data ?? []);
  const fb = demo ? (seed?.fb ?? []).filter((p) => p.estado === 'conectado') : (fbQ.data ?? []).filter((p) => p.estado === 'conectado');
  const waIndisponivel = !demo && !WA_REAL;
  const fbCarregando = !demo && fbQ.isLoading;

  return (
    <CardVidro spot sobe={anima} className="cfg-painel" atraso={0.15}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="cfg-sec" style={{ marginBottom: 4 }}>WhatsApp</div>
          <p style={{ fontSize: 11.5, color: 'var(--txt-2)', marginBottom: 13 }}>Resumo das conexões. A gestão (conectar/remover) fica em Integrações.</p>
        </div>
        <BotaoSec onClick={() => onNav('/integracoes')}>Abrir Integrações</BotaoSec>
      </div>
      {waIndisponivel ? (
        <p style={{ fontSize: 11.5, color: 'var(--txt-3)', padding: '10px 0' }}>Disponível com o backend configurado.</p>
      ) : (!demo && waQ.isLoading) ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} aria-hidden><Skeleton altura={44} raio={10} /><Skeleton altura={44} raio={10} largura="80%" /></div>
      ) : wa.length === 0 ? (
        <p style={{ fontSize: 11.5, color: 'var(--txt-3)', padding: '10px 0' }}>Nenhum WhatsApp conectado. Conecte em Integrações.</p>
      ) : (
        wa.map((c) => (
          <div className="cfa-canal" key={c.id}>
            <span className="ic"><IcWa /></span>
            <div className="tx">
              <div className="t">{c.alias}</div>
              <div className="d">
                {c.numero || 'Sem número'}
                {TIPO_ORIGEM[c.origemTipo || ''] ? ' · ' + TIPO_ORIGEM[c.origemTipo as string] : ''}
                {c.gestorNome ? ' · Gestor: ' + c.gestorNome : ''}
              </div>
            </div>
            <div className="ac">
              <BadgeStatus tom={WA_ST[c.status]?.tom || 'neutro'}>{WA_ST[c.status]?.t || c.status}</BadgeStatus>
              {podeGerenciar && <BotaoMini onClick={() => onNav('/integracoes')}>Configurar origem comercial</BotaoMini>}
            </div>
          </div>
        ))
      )}

      <div className="cfg-div" />
      <div className="cfg-sec" style={{ marginBottom: 4 }}>Facebook</div>
      <p style={{ fontSize: 11.5, color: 'var(--txt-2)', marginBottom: 13 }}>Páginas conectadas ao Messenger.</p>
      {fbCarregando ? (
        <div aria-hidden><Skeleton altura={44} raio={10} largura="70%" /></div>
      ) : fb.length === 0 ? (
        <p style={{ fontSize: 11.5, color: 'var(--txt-3)', padding: '10px 0' }}>Nenhuma Página conectada. Conecte em Integrações.</p>
      ) : (
        fb.map((p) => (
          <div className="cfa-canal" key={p.id}>
            <span className="ic"><IcFb /></span>
            <div className="tx"><div className="t">{p.pagina_nome || p.pagina_id}</div><div className="d">Messenger</div></div>
            <div className="ac"><BadgeStatus tom="ok">Conectado</BadgeStatus></div>
          </div>
        ))
      )}
    </CardVidro>
  );
}

/* ===================== Atendimento — config da organização ===================== */
function PainelConfigAtendimento({ anima, demo, seed, setSeed, aoAvisar, podeGerenciar }: {
  anima: boolean; demo: boolean; seed: SeedCfg | null; setSeed: Dispatch<SetStateAction<SeedCfg | null>>;
  aoAvisar: (a: Aviso) => void; podeGerenciar: boolean;
}) {
  const cfgQ = useConfigAtendimento();
  const salvar = useSalvarConfigAtendimento();
  const statusQ = useStatusDefs();
  const [c, setC] = useState<ConfigAtendimento | null>(null);
  const fonte = demo ? seed?.cfgAt ?? null : cfgQ.data ?? null;
  useEffect(() => { if (fonte) setC(fonte); }, [fonte]);

  const dis = !podeGerenciar;
  const toggleDia = (i: number) => setC((v) => v && ({ ...v, dias: v.dias.includes(i) ? v.dias.filter((d) => d !== i) : [...v.dias, i].sort() }));
  async function salvarCfg() {
    if (!c) return;
    try {
      if (demo) setSeed((s) => s && ({ ...s, cfgAt: c }));
      else await salvar.mutateAsync(c);
      aoAvisar({ tom: 'ok', texto: 'Configurações de atendimento salvas' });
    } catch (e) { aoAvisar({ tom: 'erro', texto: traduzCfg((e as Error).message) }); }
  }

  return (
    <CardVidro spot sobe={anima} className="cfg-painel" atraso={0.15} style={{ marginBottom: 12 }}>
      <div className="cfg-sec" style={{ marginBottom: 4 }}>Configurações de atendimento</div>
      <p style={{ fontSize: 11.5, color: 'var(--txt-2)', marginBottom: 13 }}>
        Horário, jornada e regras da operação — válidas para toda a organização.{dis ? ' Somente administradores editam.' : ''}
      </p>
      {!c ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} aria-hidden><Skeleton altura={36} raio={9} /><Skeleton altura={36} raio={9} largura="58%" /></div>
      ) : (
        <>
          <div className="form-2col">
            <div className="campo" style={{ marginBottom: 0 }}>
              <label htmlFor="cfa-hini">Início do atendimento</label>
              <Input id="cfa-hini" type="time" value={c.horario_inicio} disabled={dis} onChange={(e) => setC({ ...c, horario_inicio: e.target.value })} />
            </div>
            <div className="campo" style={{ marginBottom: 0 }}>
              <label htmlFor="cfa-hfim">Fim do atendimento</label>
              <Input id="cfa-hfim" type="time" value={c.horario_fim} disabled={dis} onChange={(e) => setC({ ...c, horario_fim: e.target.value })} />
            </div>
            <div className="campo" style={{ marginBottom: 0 }}>
              <label htmlFor="cfa-semresp">Conversa sem resposta após (min)</label>
              <Input id="cfa-semresp" type="number" min={1} value={c.tempo_sem_resposta_min} disabled={dis} onChange={(e) => setC({ ...c, tempo_sem_resposta_min: Number(e.target.value) || 0 })} />
            </div>
            <div className="campo" style={{ marginBottom: 0 }}>
              <label htmlFor="cfa-inat">Tempo de inatividade p/ encerrar (min)</label>
              <Input id="cfa-inat" type="number" min={0} value={c.tempo_inatividade_min} disabled={dis} onChange={(e) => setC({ ...c, tempo_inatividade_min: Number(e.target.value) || 0 })} />
            </div>
            <div className="campo" style={{ marginBottom: 0 }}>
              <label htmlFor="cfa-stpad">Status padrão de nova conversa</label>
              <select id="cfa-stpad" className="inp" value={c.status_padrao} disabled={dis} onChange={(e) => setC({ ...c, status_padrao: e.target.value })}>
                <option value="">Padrão do sistema</option>
                {(statusQ.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
              </select>
            </div>
            <div className="campo" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
              <label>Dias de atendimento</label>
              <div className="cfa-dias">
                {DIAS_SEMANA.map((d) => (
                  <button key={d.i} type="button" className={c.dias.includes(d.i) ? 'chip on' : 'chip'} aria-pressed={c.dias.includes(d.i)} disabled={dis} onClick={() => toggleDia(d.i)}>{d.l}</button>
                ))}
              </div>
            </div>
            <div className="campo" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
              <label htmlFor="cfa-msg">Mensagem fora do horário</label>
              <textarea id="cfa-msg" className="inp" rows={2} value={c.mensagem_fora_horario} disabled={dis} onChange={(e) => setC({ ...c, mensagem_fora_horario: e.target.value })} placeholder="Ex.: Nosso horário é das 8h às 18h. Retornaremos em breve." style={{ height: 'auto', padding: '8px 11px', resize: 'vertical', fontFamily: 'var(--fonte)' }} />
            </div>
          </div>
          <div className="cfa-nota" style={{ marginTop: 12 }}>
            A aplicação automática (auto-resposta fora do horário, encerramento por inatividade, distribuição automática) depende de automação no backend — ainda não disponível; as regras ficam salvas e prontas.
          </div>
          {podeGerenciar && (
            <div className="cfa-rodape">
              <BotaoPrimario disabled={!demo && salvar.isPending} onClick={salvarCfg}>{!demo && salvar.isPending ? 'Salvando…' : 'Salvar configurações'}</BotaoPrimario>
            </div>
          )}
        </>
      )}
    </CardVidro>
  );
}

/* ===================== Atendimento — Status e Etiquetas ===================== */
function PainelStatusEtiquetas({ anima, canManage, section, aoAvisar }: { anima: boolean; canManage: boolean; section: string | null; aoAvisar: (a: Aviso) => void }) {
  const statusQ = useStatusDefs();
  const etqQ = useEtiquetas();
  const a = useAtendimentoActions();
  const statusCardRef = useRef<HTMLDivElement>(null);
  const etqCardRef = useRef<HTMLDivElement>(null);
  const [destaque, setDestaque] = useState<string | null>(null);

  useEffect(() => {
    if (!section) return;
    const alvo = section === 'etiquetas' ? etqCardRef.current : statusCardRef.current;
    if (!alvo) return;
    const t = setTimeout(() => {
      alvo.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setDestaque(section);
      setTimeout(() => setDestaque(null), 2200);
    }, 120);
    return () => clearTimeout(t);
  }, [section]);

  const statuses = (statusQ.data ?? []).slice().sort((x, y) => x.ordem - y.ordem);
  const etqs = (etqQ.data ?? []).slice().sort((x, y) => x.ordem - y.ordem);

  const [nsName, setNsName] = useState('');
  const [nsColor, setNsColor] = useState(PALETA_CORES[0]);
  const [etName, setEtName] = useState('');
  const [etColor, setEtColor] = useState(PALETA_CORES[1]);
  const [etDesc, setEtDesc] = useState('');
  const [del, setDel] = useState<{ s: StatusDef; count: number } | null>(null);
  const [subId, setSubId] = useState('');
  const [confirmar, setConfirmar] = useState<{ titulo: string; texto: string; acao: () => Promise<void> } | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  /* popover de cor — portal (regra 10): .cfg-painel é vidro com backdrop-filter,
     que vira containing block de position:fixed; dentro dele o popover ficaria preso */
  const [picker, setPicker] = useState<{ kind: 'status' | 'etq'; id: string; orig: string; cor: string } | null>(null);
  const [pickerPos, setPickerPos] = useState({ left: -9999, top: -9999 });
  const pickerRect = useRef<DOMRect | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const [raizPop, setRaizPop] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!picker) return;
    const el = criarRaizPortalV2(document) as HTMLDivElement;
    setRaizPop(el);
    return () => { el.remove(); setRaizPop(null); };
  }, [!!picker]); // eslint-disable-line react-hooks/exhaustive-deps

  async function run(p: Promise<void>, ok: string) { try { await p; aoAvisar({ tom: 'ok', texto: ok }); } catch (e) { aoAvisar({ tom: 'erro', texto: (e as Error).message || 'Falha na operação' }); } }
  function persistirCor(kind: 'status' | 'etq', id: string, cor: string) { run(kind === 'status' ? a.atualizarStatus(id, { cor }) : a.atualizarEtiqueta(id, { cor }), 'Cor atualizada'); }
  function commitPending() { if (picker && picker.cor.toLowerCase() !== picker.orig.toLowerCase()) persistirCor(picker.kind, picker.id, picker.cor); }
  function openPicker(kind: 'status' | 'etq', id: string, cor: string, rect: DOMRect) { commitPending(); pickerRect.current = rect; setPickerPos({ left: -9999, top: -9999 }); setPicker({ kind, id, orig: cor, cor }); }
  function fecharPicker() { commitPending(); setPicker(null); }
  function aplicarCorPaleta(cor: string) { if (!picker) return; const { kind, id, orig } = picker; setPicker(null); if (cor.toLowerCase() !== orig.toLowerCase()) persistirCor(kind, id, cor); }
  const corDaRow = (kind: 'status' | 'etq', id: string, cor: string) => (picker && picker.kind === kind && picker.id === id ? picker.cor : cor);

  useLayoutEffect(() => {
    if (!picker || !pickerRef.current || !pickerRect.current) return;
    const el = pickerRef.current; const pw = el.offsetWidth; const ph = el.offsetHeight; const r = pickerRect.current;
    const left = Math.max(10, Math.min(r.left, window.innerWidth - pw - 10));
    let top = r.bottom + 6; if (top + ph > window.innerHeight - 10) top = Math.max(10, r.top - ph - 6);
    setPickerPos({ left, top });
  }, [picker, raizPop]);

  useEffect(() => {
    if (!picker) return;
    function onDown(e: MouseEvent) { const t = e.target as HTMLElement; if (pickerRef.current?.contains(t)) return; if (t.closest && t.closest('.atd-cor')) return; fecharPicker(); }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') fecharPicker(); }
    document.addEventListener('mousedown', onDown); document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [picker]); // eslint-disable-line react-hooks/exhaustive-deps

  function moveStatus(idx: number, dir: -1 | 1) {
    const arr = statuses.map((s) => s.id); const j = idx + dir; if (j < 0 || j >= arr.length) return;
    [arr[idx], arr[j]] = [arr[j], arr[idx]]; run(a.reordenarStatus(arr), 'Ordem atualizada');
  }
  async function startDeleteStatus(s: StatusDef) {
    try {
      const count = await a.contarConversasComStatus(s.id);
      if (count > 0) { setDel({ s, count }); setSubId(statuses.find((x) => x.id !== s.id && x.ativo)?.id ?? ''); }
      else setConfirmar({ titulo: 'Excluir status', texto: `Excluir o status "${s.nome}"?`, acao: async () => run(a.excluirStatus(s.id, null), 'Status excluído') });
    } catch (e) { aoAvisar({ tom: 'erro', texto: (e as Error).message }); }
  }
  function confirmDeleteStatus() {
    if (!del) return;
    if (!subId) { aoAvisar({ tom: 'erro', texto: 'Escolha um status substituto.' }); return; }
    const id = del.s.id; setDel(null); run(a.excluirStatus(id, subId), 'Status excluído e conversas reatribuídas');
  }

  return (
    <>
      <div className={'vidro spot ' + (anima ? 'sobe ' : '') + (destaque === 'status' ? 'cfg-painel atd-bloco cfa-destaque' : 'cfg-painel atd-bloco')} ref={statusCardRef} style={{ animationDelay: '.2s', marginBottom: 12 }}>
        <div className="cfg-sec" style={{ marginBottom: 4 }}>Status das conversas</div>
        <p style={{ fontSize: 11.5, color: 'var(--txt-2)', marginBottom: 10 }}>
          Estados configuráveis usados em Dados do cliente e nos filtros. {canManage ? 'Crie, renomeie, defina cor, ordene, marque padrão, desative ou exclua.' : 'Somente administradores e gestores podem editar.'}
        </p>
        {statusQ.isLoading && <div aria-hidden><Skeleton altura={30} raio={8} /><Skeleton altura={30} raio={8} largura="72%" style={{ marginTop: 8 }} /></div>}
        {statuses.map((s, idx) => (
          <div className="atd-linha" key={s.id}>
            <button type="button" className="atd-cor" style={{ background: corDaRow('status', s.id, s.cor) }} disabled={!canManage} title="Alterar cor" aria-label="Alterar cor" onClick={(e) => openPicker('status', s.id, s.cor, e.currentTarget.getBoundingClientRect())} />
            <input className="atd-nome" defaultValue={s.nome} disabled={!canManage} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== s.nome) run(a.atualizarStatus(s.id, { nome: v }), 'Status renomeado'); }} />
            {s.sistema && <span className="atd-sys" title="Status de sistema">sistema</span>}
            {s.padrao
              ? <BadgeStatus tom="ok">Padrão</BadgeStatus>
              : canManage && <button type="button" className="atd-mini" title="Tornar padrão" onClick={() => run(a.definirStatusPadrao(s.id), '“' + s.nome + '” agora é o padrão')}><IcEstrela /></button>}
            <div className="atd-acoes">
              <button type="button" className="atd-mini" title="Subir" disabled={!canManage || idx === 0} onClick={() => moveStatus(idx, -1)}><IcUp /></button>
              <button type="button" className="atd-mini" title="Descer" disabled={!canManage || idx === statuses.length - 1} onClick={() => moveStatus(idx, 1)}><IcDown /></button>
              <button type="button" className={s.ativo ? 'tgl' : 'tgl off'} role="switch" aria-checked={s.ativo} title={s.ativo ? 'Ativo' : 'Inativo'} disabled={!canManage} onClick={() => run(a.atualizarStatus(s.id, { ativo: !s.ativo }), s.ativo ? 'Status desativado' : 'Status ativado')} />
              <button type="button" className="atd-mini perigo" title="Excluir" disabled={!canManage} onClick={() => startDeleteStatus(s)}><IcLixo /></button>
            </div>
          </div>
        ))}
        {del && (
          <div className="atd-del">
            O status <b>“{del.s.nome}”</b> está em uso por {del.count} conversa{del.count === 1 ? '' : 's'}. Escolha um substituto:
            <select className="inp" value={subId} onChange={(e) => setSubId(e.target.value)}>
              <option value="">Selecione…</option>
              {statuses.filter((x) => x.id !== del.s.id).map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
            </select>
            <BotaoPrimario mini onClick={confirmDeleteStatus}>Excluir e reatribuir</BotaoPrimario>
            <BotaoMini onClick={() => setDel(null)}>Cancelar</BotaoMini>
          </div>
        )}
        {canManage && (
          <div className="atd-add">
            <input type="color" value={nsColor} onChange={(e) => setNsColor(e.target.value)} title="Cor" aria-label="Cor do novo status" />
            <Input placeholder="Novo status (ex.: Aguardando documento)" value={nsName} onChange={(e) => setNsName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && nsName.trim()) { run(a.criarStatus(nsName.trim(), nsColor), 'Status criado'); setNsName(''); } }} />
            <BotaoSec disabled={!nsName.trim()} onClick={() => { run(a.criarStatus(nsName.trim(), nsColor), 'Status criado'); setNsName(''); }}>＋ Adicionar</BotaoSec>
          </div>
        )}
      </div>

      <div className={'vidro spot ' + (anima ? 'sobe ' : '') + (destaque === 'etiquetas' ? 'cfg-painel atd-bloco cfa-destaque' : 'cfg-painel atd-bloco')} ref={etqCardRef} style={{ animationDelay: '.25s' }}>
        <div className="cfg-sec" style={{ marginBottom: 4 }}>Etiquetas</div>
        <p style={{ fontSize: 11.5, color: 'var(--txt-2)', marginBottom: 10 }}>
          Etiquetas coloridas aplicáveis a contatos, conversas e oportunidades. Não é possível duplicar o nome na organização.
        </p>
        {etqQ.isLoading && <div aria-hidden><Skeleton altura={30} raio={8} largura="64%" /></div>}
        {etqs.length === 0 && !etqQ.isLoading && <p style={{ fontSize: 11.5, color: 'var(--txt-3)', padding: '8px 0' }}>Nenhuma etiqueta ainda.</p>}
        {etqs.map((e) => (
          <div className="atd-linha" key={e.id}>
            <button type="button" className="atd-cor" style={{ background: corDaRow('etq', e.id, e.cor) }} disabled={!canManage} title="Alterar cor" aria-label="Alterar cor" onClick={(ev) => openPicker('etq', e.id, e.cor, ev.currentTarget.getBoundingClientRect())} />
            <input className="atd-nome" defaultValue={e.nome} disabled={!canManage} onKeyDown={(ev) => { if (ev.key === 'Enter') (ev.target as HTMLInputElement).blur(); }} onBlur={(ev) => { const v = ev.target.value.trim(); if (v && v !== e.nome) run(a.atualizarEtiqueta(e.id, { nome: v }), 'Etiqueta renomeada'); }} />
            <input className="atd-desc" placeholder="Descrição (opcional)" defaultValue={e.descricao ?? ''} disabled={!canManage} onBlur={(ev) => { const v = ev.target.value.trim(); if (v !== (e.descricao ?? '')) run(a.atualizarEtiqueta(e.id, { descricao: v || null }), 'Descrição atualizada'); }} />
            <div className="atd-acoes">
              <button type="button" className={e.ativo ? 'tgl' : 'tgl off'} role="switch" aria-checked={e.ativo} title={e.ativo ? 'Ativa' : 'Inativa'} disabled={!canManage} onClick={() => run(a.atualizarEtiqueta(e.id, { ativo: !e.ativo }), e.ativo ? 'Etiqueta desativada' : 'Etiqueta ativada')} />
              <button type="button" className="atd-mini perigo" title="Excluir" disabled={!canManage} onClick={() => setConfirmar({ titulo: 'Excluir etiqueta', texto: `Excluir a etiqueta "${e.nome}"?`, acao: async () => run(a.excluirEtiqueta(e.id), 'Etiqueta excluída') })}><IcLixo /></button>
            </div>
          </div>
        ))}
        {canManage && (
          <div className="atd-add">
            <input type="color" value={etColor} onChange={(e) => setEtColor(e.target.value)} title="Cor" aria-label="Cor da nova etiqueta" />
            <Input placeholder="Nova etiqueta" value={etName} onChange={(e) => setEtName(e.target.value)} />
            <Input placeholder="Descrição (opcional)" value={etDesc} onChange={(e) => setEtDesc(e.target.value)} />
            <BotaoSec disabled={!etName.trim()} onClick={() => { run(a.criarEtiqueta(etName.trim(), etColor, etDesc.trim() || null), 'Etiqueta criada'); setEtName(''); setEtDesc(''); }}>＋ Adicionar</BotaoSec>
          </div>
        )}
      </div>

      {picker && raizPop && createPortal(
        <div ref={pickerRef} className="cor-pop" style={{ left: pickerPos.left, top: pickerPos.top }} role="dialog" aria-label="Selecionar cor">
          <div className="cab-c">Cor</div>
          <div className="cor-swatches">
            {PALETA_CORES.map((c) => (
              <button key={c} type="button" className={c.toLowerCase() === picker.cor.toLowerCase() ? 'cor-sw sel' : 'cor-sw'} style={{ background: c }} title={c} aria-label={c} onClick={() => aplicarCorPaleta(c)} />
            ))}
          </div>
          <div className="cor-custom">
            <label className="cor-native" title="Cor personalizada">
              <input type="color" value={picker.cor} onChange={(ev) => setPicker((pp) => pp && ({ ...pp, cor: ev.target.value }))} />
              <span className="cor-native-sw" style={{ background: picker.cor }} />Personalizada
            </label>
            <span className="cor-hex">{picker.cor.toUpperCase()}</span>
            <BotaoMini onClick={fecharPicker}>Aplicar</BotaoMini>
          </div>
        </div>,
        raizPop,
      )}

      <ConfirmDialogV2
        aberto={!!confirmar}
        titulo={confirmar?.titulo ?? ''}
        mensagem={confirmar?.texto ?? ''}
        rotuloConfirmar="Excluir"
        destrutivo
        carregando={confirmando}
        aoConfirmar={async () => {
          const cf = confirmar; if (!cf) return;
          setConfirmando(true);
          try { await cf.acao(); setConfirmar(null); }
          finally { setConfirmando(false); }
        }}
        aoCancelar={() => { if (!confirmando) setConfirmar(null); }}
      />
    </>
  );
}

/* ===================== Notificações ===================== */
function PainelNotif({ anima, demo, seed, setSeed, aoAvisar }: {
  anima: boolean; demo: boolean; seed: SeedCfg | null; setSeed: Dispatch<SetStateAction<SeedCfg | null>>; aoAvisar: (a: Aviso) => void;
}) {
  const prefsQ = usePreferencias();
  const salvar = useSalvarPreferencias();
  const [p, setP] = useState<Prefs | null>(null);
  const fonte = demo ? seed?.prefs ?? null : prefsQ.data ?? null;
  useEffect(() => { if (fonte) setP(fonte); }, [fonte]);

  async function flip(grupo: 'notif_email' | 'notif_app', k: string, v: boolean) {
    if (!p) return;
    const np: Prefs = { ...p, [grupo]: { ...p[grupo], [k]: v } };
    setP(np);
    try {
      if (demo) setSeed((s) => s && ({ ...s, prefs: np }));
      else await salvar.mutateAsync(np);
    } catch (e) { aoAvisar({ tom: 'erro', texto: traduzCfg((e as Error).message) }); setP(p); }
  }

  return (
    <CardVidro spot sobe={anima} className="cfg-painel" atraso={0.15}>
      <div className="cfg-sec" style={{ marginBottom: 4 }}>Notificações</div>
      <p style={{ fontSize: 11.5, color: 'var(--txt-2)', marginBottom: 12 }}>Preferências individuais. As alterações são salvas automaticamente.</p>
      <div className="cfa-nota" style={{ marginBottom: 12 }}>
        O envio real de e-mail/push depende de integração de entrega — <b>Integração de envio pendente</b>. Suas preferências são persistidas mesmo assim.
      </div>
      {!p ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} aria-hidden><Skeleton altura={30} raio={8} /><Skeleton altura={30} raio={8} largura="76%" /><Skeleton altura={30} raio={8} largura="60%" /></div>
      ) : (
        <>
          <div className="cfg-sec" style={{ fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--txt-3)', marginBottom: 6 }}>Por email</div>
          {NOTIF_EMAIL.map((n) => (
            <LinhaToggle key={n.k} ligado={!!p.notif_email[n.k]} aoMudar={(v) => flip('notif_email', n.k, v)} titulo={n.t} descricao={n.d} />
          ))}
          <div className="cfg-div" />
          <div className="cfg-sec" style={{ fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--txt-3)', marginBottom: 6 }}>No aplicativo</div>
          {NOTIF_APP.map((n) => (
            <LinhaToggle key={n.k} ligado={!!p.notif_app[n.k]} aoMudar={(v) => flip('notif_app', n.k, v)} titulo={n.t} descricao={n.d} />
          ))}
        </>
      )}
    </CardVidro>
  );
}

/* ===================== Preferências ===================== */
function PainelPrefs({ anima, demo, seed, setSeed, aoAvisar }: {
  anima: boolean; demo: boolean; seed: SeedCfg | null; setSeed: Dispatch<SetStateAction<SeedCfg | null>>; aoAvisar: (a: Aviso) => void;
}) {
  const prefsQ = usePreferencias();
  const salvar = useSalvarPreferencias();
  const [p, setP] = useState<Prefs | null>(null);
  const fonte = demo ? seed?.prefs ?? null : prefsQ.data ?? null;
  useEffect(() => { if (fonte) setP(fonte); }, [fonte]);

  async function persist(patch: Partial<Prefs>) {
    if (!p) return;
    const np = { ...p, ...patch };
    setP(np);
    try {
      if (demo) setSeed((s) => s && ({ ...s, prefs: np }));
      else await salvar.mutateAsync(np);
      if (patch.densidade) document.documentElement.dataset.densidade = patch.densidade;
    } catch (e) { aoAvisar({ tom: 'erro', texto: traduzCfg((e as Error).message) }); setP(p); }
  }
  useEffect(() => { if (p?.densidade) document.documentElement.dataset.densidade = p.densidade; }, [p?.densidade]);

  return (
    <CardVidro spot sobe={anima} className="cfg-painel" atraso={0.15}>
      <div className="cfg-sec" style={{ marginBottom: 4 }}>Preferências</div>
      <p style={{ fontSize: 11.5, color: 'var(--txt-2)', marginBottom: 12 }}>Personalize a aparência e o comportamento. Salvas na sua conta.</p>
      {!p ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} aria-hidden><Skeleton altura={36} raio={9} /><Skeleton altura={36} raio={9} largura="66%" /></div>
      ) : (
        <>
          {/* Tema (Claro/Escuro/Sistema) do v1 NÃO é exposto: Platina é tema único
              (precedente do login). A preferência salva (prefs.tema) fica intacta. */}
          <div className="form-2col">
            <div className="campo" style={{ marginBottom: 0 }}>
              <label htmlFor="cfa-p-idioma">Idioma</label>
              <select id="cfa-p-idioma" className="inp" value="pt-BR" disabled><option value="pt-BR">Português (Brasil)</option></select>
              <div className="cfa-desc-c">Idioma da interface.</div>
            </div>
            <div className="campo" style={{ marginBottom: 0 }}>
              <label htmlFor="cfa-p-data">Formato de data</label>
              <select id="cfa-p-data" className="inp" value={p.formato_data} onChange={(e) => persist({ formato_data: e.target.value })}>
                <option value="dd/MM/yyyy">DD/MM/AAAA</option>
                <option value="MM/dd/yyyy">MM/DD/AAAA</option>
                <option value="yyyy-MM-dd">AAAA-MM-DD</option>
              </select>
              <div className="cfa-desc-c">Como as datas são exibidas.</div>
            </div>
            <div className="campo" style={{ marginBottom: 0 }}>
              <label htmlFor="cfa-p-dens">Densidade da interface</label>
              <select id="cfa-p-dens" className="inp" value={p.densidade} onChange={(e) => persist({ densidade: e.target.value as Prefs['densidade'] })}>
                <option value="confortavel">Confortável</option>
                <option value="compacta">Compacta</option>
              </select>
              <div className="cfa-desc-c">Espaçamento de listas e tabelas.</div>
            </div>
            <div className="campo" style={{ marginBottom: 0 }}>
              <label htmlFor="cfa-p-home">Página inicial</label>
              <select id="cfa-p-home" className="inp" value={p.pagina_inicial} onChange={(e) => persist({ pagina_inicial: e.target.value })}>
                <option value="/whatsapp">WhatsApp</option>
                <option value="/kanban">Kanban</option>
                <option value="/cobrancas">Cobranças</option>
                <option value="/relatorios">Relatórios</option>
              </select>
              <div className="cfa-desc-c">Tela exibida ao entrar.</div>
            </div>
          </div>
          <div className="cfg-div" />
          <LinhaToggle ligado={!!p.mostrar_dicas} aoMudar={(v) => persist({ mostrar_dicas: v })} titulo="Mostrar dicas e tutoriais" descricao="Sugestões contextuais pela interface." />
          <LinhaToggle ligado={!!p.sons} aoMudar={(v) => persist({ sons: v })} titulo="Reproduzir sons" descricao="Efeitos sonoros em ações e alertas (respeita o som de notificação)." />
        </>
      )}
    </CardVidro>
  );
}
