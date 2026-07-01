import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useToast } from '@/hooks/useToast';
import { useTheme } from '@/hooks/useTheme';
import { useOrg } from '@/context/OrgContext';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { WA_REAL, useWaCanais } from '@/data/whatsapp';
import { useFbStatus } from '@/data/facebook';
import { useStatusDefs, useEtiquetas, useAtendimentoActions } from '@/data/atendimento';
import {
  useMeuPerfil, useSalvarPerfil, salvarAvatar, subirAvatar, urlAvatar,
  useOrgFull, useSalvarOrg, useEquipe, useEquipeActions, type ConviteResultado,
  usePreferencias, useSalvarPreferencias, type Prefs,
  useConfigAtendimento, useSalvarConfigAtendimento, type ConfigAtendimento,
  traduzCfg,
} from '@/data/configuracoes';
import { Modal } from '@/components/Modal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { DEMO_MODE } from '@/lib/demo';
import { PALETA_CORES, podeGerenciarAtendimento, type StatusDef } from '@/types/atendimento';
import './Configuracoes.css';

const PAL = ['#5b6ee1', '#c2693a', '#7a5bb0', '#2f8f9d', '#b0566f', '#4a7a4a', '#9d7a2f', '#3d7ab0'];
function initials(n: string) { const p = (n || '').trim().split(/\s+/); return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase() || '?'; }
function avColor(n: string) { let h = 0; for (let i = 0; i < (n || '').length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0; return PAL[h % PAL.length]; }
function Av({ n, src }: { n: string; src?: string | null }) { return src ? <span className="av" style={{ backgroundImage: `url(${src})`, backgroundSize: 'cover' }} /> : <span className="av" style={{ background: avColor(n) }}>{initials(n)}</span>; }

const IcCheck = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>;
const IcDots = () => <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="12" cy="19" r="1.7" /></svg>;
const IcWa = () => <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a9.9 9.9 0 0 0-8.5 15l-1.3 4.8 4.9-1.3A9.9 9.9 0 1 0 12 2z" /></svg>;
const IcFb = () => <svg viewBox="0 0 24 24" fill="currentColor"><path d="M22 12a10 10 0 1 0-11.6 9.9v-7H8v-2.9h2.4V9.8c0-2.4 1.4-3.7 3.6-3.7 1 0 2.1.2 2.1.2v2.3h-1.2c-1.2 0-1.5.7-1.5 1.4V12H16l-.4 2.9h-2.2v7A10 10 0 0 0 22 12z" /></svg>;
const IcInvite = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0 .01M19 8v6M22 11h-6" /></svg>;
const IcCamera = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>;
const IcSun = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M5 5l1.4 1.4M17.6 17.6 19 19M3 12h2M19 12h2M5 19l1.4-1.4M17.6 6.4 19 5" /></svg>;
const IcMoon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>;
const IcExt = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 5h5v5M19 5l-9 9M19 13v6H5V5h6" /></svg>;

const TABS = [
  { id: 'conta', label: 'Conta' }, { id: 'equipe', label: 'Equipe' }, { id: 'canais', label: 'Canais' },
  { id: 'atendimento', label: 'Atendimento' }, { id: 'notif', label: 'Notificações' }, { id: 'prefs', label: 'Preferências' },
];
const TAB_IDS = TABS.map((t) => t.id);
const PAPEL_LABEL: Record<string, string> = { admin: 'Administrador', supervisor: 'Supervisor', atendente: 'Atendente' };
const PAPEL_CLS: Record<string, string> = { admin: 'ok', supervisor: 'blue', atendente: 'neutral' };
const STATUS_LABEL: Record<string, string> = { ativo: 'Ativo', inativo: 'Inativo', convidado: 'Convite pendente', pendente: 'Convite pendente', expirado: 'Convite expirado' };
const STATUS_CLS: Record<string, string> = { ativo: 'ok', inativo: 'neutral', convidado: 'warn', pendente: 'warn', expirado: 'err' };
const WA_ST: Record<string, { t: string; cls: string; dot?: boolean }> = {
  conectado: { t: 'Conectado', cls: 'ok', dot: true }, sincronizando: { t: 'Sincronizando', cls: 'warn' },
  desconectado: { t: 'Desconectado', cls: 'neutral' }, atencao: { t: 'Atenção', cls: 'warn' }, erro: { t: 'Erro', cls: 'err' },
};
const TIPO_ORIGEM: Record<string, string> = { trafego: 'Tráfego', ura: 'URA', organico: 'Orgânico', indicacao: 'Indicação', campanha: 'Campanha', parceiro: 'Parceiro', outro: 'Outro' };
const DIAS_SEMANA = [{ i: 0, l: 'Dom' }, { i: 1, l: 'Seg' }, { i: 2, l: 'Ter' }, { i: 3, l: 'Qua' }, { i: 4, l: 'Qui' }, { i: 5, l: 'Sex' }, { i: 6, l: 'Sáb' }];

function Switch({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return <button type="button" className={'bigswitch' + (on ? ' on' : '')} aria-label="Alternar" disabled={disabled} onClick={() => onChange(!on)}><span className="k" /></button>;
}

export function Configuracoes() {
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
  const { currentOrg } = useOrg();
  const { user } = useAuth();
  const navigate = useNavigate();
  const podeGerenciar = podeGerenciarAtendimento(currentOrg.role); // admin/supervisor
  const podeAdmin = currentOrg.role === 'admin';
  const [searchParams] = useSearchParams();
  const sectionParam = searchParams.get('section');
  const initialTab = searchParams.get('tab');
  const [tab, setTab] = useState(initialTab && TAB_IDS.includes(initialTab) ? initialTab : 'conta');
  useEffect(() => { if (initialTab && TAB_IDS.includes(initialTab)) setTab(initialTab); }, [initialTab]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="config-page">
      <div className="content">
        <div className="wrap">
          {DEMO_MODE && podeAdmin && <DemoReset />}
          <div className="settings-tabs">
            {TABS.map((t) => <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>{t.label}</button>)}
          </div>

          <section className={'tab-panel' + (tab === 'conta' ? ' on' : '')} data-panel="conta"><ContaPanel podeGerenciar={podeGerenciar} /></section>
          <section className={'tab-panel' + (tab === 'equipe' ? ' on' : '')} data-panel="equipe"><EquipePanel podeAdmin={podeAdmin} podeGerenciar={podeGerenciar} meuId={user?.id} /></section>
          <section className={'tab-panel' + (tab === 'canais' ? ' on' : '')} data-panel="canais"><CanaisPanel podeGerenciar={podeGerenciar} onNav={navigate} /></section>
          <section className={'tab-panel' + (tab === 'atendimento' ? ' on' : '')} data-panel="atendimento">
            <ConfigAtendimentoCard podeGerenciar={podeAdmin} />
            <AtendimentoPanel canManage={podeGerenciar} section={tab === 'atendimento' ? sectionParam : null} />
          </section>
          <section className={'tab-panel' + (tab === 'notif' ? ' on' : '')} data-panel="notif"><NotifPanel /></section>
          <section className={'tab-panel' + (tab === 'prefs' ? ' on' : '')} data-panel="prefs"><PrefsPanel theme={theme} setTheme={setTheme} toast={toast} onNav={navigate} /></section>
        </div>
      </div>
    </div>
  );
}

/* ===================== Demonstração (reset) ===================== */
function DemoReset() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ultimo, setUltimo] = useState<string | null>(null);
  async function reset() {
    setBusy(true);
    try { const { error } = await supabase!.rpc('demo_reset'); if (error) throw new Error(error.message); setUltimo(new Date().toLocaleString('pt-BR')); toast('Dados da demonstração restaurados.'); setOpen(false); }
    catch (e) { toast((e as Error).message || 'Falha ao restaurar.', 'warn'); }
    finally { setBusy(false); }
  }
  return (
    <div className="set-card" style={{ marginBottom: 16 }}>
      <div className="sc-head"><h3>Ambiente de demonstração</h3><p>Restaura a massa fictícia original (contatos, conversas, Kanban, cobranças). Afeta apenas a demo.{ultimo ? ' Último reset: ' + ultimo : ''}</p></div>
      <div className="sc-foot"><button className="btn-ghost danger" onClick={() => setOpen(true)}>Restaurar dados da demonstração</button></div>
      <ConfirmDialog open={open} title="Restaurar dados da demonstração?" message="Toda a massa fictícia atual será apagada e recriada do zero. Esta ação afeta apenas o ambiente de demonstração, nunca a produção." destructive loading={busy} confirmLabel="Restaurar" onConfirm={reset} onCancel={() => { if (!busy) setOpen(false); }} />
    </div>
  );
}

/* ===================== Conta (Perfil + Empresa) ===================== */
function ContaPanel({ podeGerenciar }: { podeGerenciar: boolean }) {
  const { toast } = useToast();
  const { currentOrg } = useOrg();
  const { user, refreshProfile } = useAuth();
  const perfilQ = useMeuPerfil();
  const salvar = useSalvarPerfil();
  const orgQ = useOrgFull();
  const salvarOrg = useSalvarOrg();
  const [form, setForm] = useState({ nome: '', telefone: '', cargo: '' });
  const [avatarSrc, setAvatarSrc] = useState<string | null>(null);
  const [busyFoto, setBusyFoto] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [org, setOrg] = useState({ nome: '', nomeFantasia: '', documento: '', telefone: '', email: '', timezone: 'America/Sao_Paulo', moeda: 'BRL' });
  const [orgBusy, setOrgBusy] = useState(false);

  useEffect(() => { if (perfilQ.data) setForm({ nome: perfilQ.data.nome, telefone: perfilQ.data.telefone, cargo: perfilQ.data.cargo }); }, [perfilQ.data]);
  useEffect(() => { let alive = true; urlAvatar(perfilQ.data?.avatarUrl ?? null).then((u) => { if (alive) setAvatarSrc(u); }); return () => { alive = false; }; }, [perfilQ.data?.avatarUrl]);
  useEffect(() => { if (orgQ.data) setOrg({ nome: orgQ.data.nome, nomeFantasia: orgQ.data.nomeFantasia, documento: orgQ.data.documento, telefone: orgQ.data.telefone, email: orgQ.data.email, timezone: orgQ.data.timezone, moeda: orgQ.data.moeda }); }, [orgQ.data]);

  async function salvarPerfil() {
    try {
      await salvar.mutateAsync({ nome: form.nome, telefone: form.telefone, cargo: form.cargo });
      await refreshProfile(); // atualiza nome no contexto global (sidebar/scripts) sem exigir relogin
      toast('Perfil salvo');
    }
    catch (e) { toast(traduzCfg((e as Error).message), 'warn'); }
  }
  async function trocarFoto(file: File) {
    if (!perfilQ.data) return; setBusyFoto(true);
    try { const path = await subirAvatar(currentOrg.id, perfilQ.data.id, file); await salvarAvatar(path); setAvatarSrc(await urlAvatar(path)); perfilQ.refetch(); toast('Foto atualizada'); }
    catch (e) { toast(traduzCfg((e as Error).message), 'warn'); } finally { setBusyFoto(false); }
  }
  async function removerFoto() {
    if (!perfilQ.data) return; setBusyFoto(true);
    try { await salvarAvatar(null); setAvatarSrc(null); perfilQ.refetch(); toast('Foto removida'); }
    catch (e) { toast(traduzCfg((e as Error).message), 'warn'); } finally { setBusyFoto(false); }
  }
  async function alterarEmail() {
    const novo = window.prompt('Novo e-mail (você receberá um link de confirmação):', user?.email || '');
    if (!novo || novo === user?.email) return;
    const { error } = await supabase!.auth.updateUser({ email: novo });
    if (error) toast(error.message, 'warn'); else toast('Enviamos um link de confirmação para o novo e-mail.');
  }
  async function salvarEmpresa() {
    if (org.documento && org.documento.replace(/\D/g, '').length !== 14) { toast('CNPJ deve ter 14 dígitos.', 'warn'); return; }
    setOrgBusy(true);
    try { await salvarOrg.mutateAsync(org); toast('Dados da empresa salvos'); }
    catch (e) { toast(traduzCfg((e as Error).message), 'warn'); } finally { setOrgBusy(false); }
  }

  return (<>
    <div className="set-card">
      <div className="sc-head bordered"><h3>Perfil</h3><p>Suas informações pessoais exibidas na plataforma.</p></div>
      <div className="sc-body">
        {perfilQ.isLoading ? <div className="cfg-load">Carregando…</div> : perfilQ.isError ? <div className="cfg-err">Erro ao carregar perfil.</div> : <>
          <div className="profile-row">
            <Av n={form.nome || 'U'} src={avatarSrc} />
            <div className="pinfo"><div className="nm">{form.nome || '—'}</div><div className="rl">{PAPEL_LABEL[currentOrg.role] || currentOrg.role} · {user?.email}</div></div>
            <div className="pacts">
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) trocarFoto(f); e.currentTarget.value = ''; }} />
              <button className="btn-ghost" disabled={busyFoto} onClick={() => fileRef.current?.click()}><IcCamera />{busyFoto ? 'Enviando…' : 'Alterar foto'}</button>
              {avatarSrc && <button className="btn-ghost danger" disabled={busyFoto} onClick={removerFoto}>Remover</button>}
            </div>
          </div>
          <div className="form-grid">
            <div className="fld"><label>Nome completo</label><input className="ctrl" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></div>
            <div className="fld"><label>Cargo</label><input className="ctrl" value={form.cargo} onChange={(e) => setForm({ ...form, cargo: e.target.value })} placeholder="Ex.: Atendente, Gestor" /></div>
            <div className="fld"><label>Email</label><div className="ctrl-with-btn"><input className="ctrl" type="email" value={user?.email || ''} readOnly /><button className="btn-ghost" onClick={alterarEmail}>Alterar</button></div></div>
            <div className="fld"><label>Telefone</label><input className="ctrl" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} placeholder="(00) 00000-0000" /></div>
          </div>
        </>}
      </div>
      <div className="sc-foot"><button className="btn-ghost" disabled={!perfilQ.data} onClick={() => perfilQ.data && setForm({ nome: perfilQ.data.nome, telefone: perfilQ.data.telefone, cargo: perfilQ.data.cargo })}>Cancelar</button><button className="btn-primary" disabled={salvar.isPending || !perfilQ.data} onClick={salvarPerfil}><IcCheck />{salvar.isPending ? 'Salvando…' : 'Salvar alterações'}</button></div>
    </div>

    <div className="set-card">
      <div className="sc-head bordered"><h3>Empresa</h3><p>Dados da organização usados em documentos e relatórios.{!podeGerenciar ? ' Somente administradores e supervisores podem editar.' : ''}</p></div>
      <div className="sc-body">
        {orgQ.isLoading ? <div className="cfg-load">Carregando…</div> : <div className="form-grid">
          <div className="fld full"><label>Nome da empresa</label><input className="ctrl" value={org.nome} disabled={!podeGerenciar} onChange={(e) => setOrg({ ...org, nome: e.target.value })} /></div>
          <div className="fld"><label>Nome fantasia</label><input className="ctrl" value={org.nomeFantasia} disabled={!podeGerenciar} onChange={(e) => setOrg({ ...org, nomeFantasia: e.target.value })} /></div>
          <div className="fld"><label>CNPJ</label><input className="ctrl" value={org.documento} disabled={!podeGerenciar} onChange={(e) => setOrg({ ...org, documento: e.target.value })} placeholder="00.000.000/0000-00" /></div>
          <div className="fld"><label>Telefone</label><input className="ctrl" value={org.telefone} disabled={!podeGerenciar} onChange={(e) => setOrg({ ...org, telefone: e.target.value })} /></div>
          <div className="fld"><label>Email</label><input className="ctrl" type="email" value={org.email} disabled={!podeGerenciar} onChange={(e) => setOrg({ ...org, email: e.target.value })} /></div>
          <div className="fld"><label>Fuso horário</label><select className="ctrl" value={org.timezone} disabled={!podeGerenciar} onChange={(e) => setOrg({ ...org, timezone: e.target.value })}><option value="America/Sao_Paulo">(GMT-03:00) São Paulo</option><option value="America/Manaus">(GMT-04:00) Manaus</option><option value="America/Noronha">(GMT-02:00) Fernando de Noronha</option></select></div>
          <div className="fld"><label>Idioma padrão</label><select className="ctrl" value="pt-BR" disabled><option value="pt-BR">Português (Brasil)</option></select></div>
          <div className="fld"><label>Moeda</label><select className="ctrl" value={org.moeda} disabled={!podeGerenciar} onChange={(e) => setOrg({ ...org, moeda: e.target.value })}><option value="BRL">Real (R$)</option><option value="USD">Dólar (US$)</option></select></div>
        </div>}
      </div>
      {podeGerenciar && <div className="sc-foot"><button className="btn-primary" disabled={orgBusy || !orgQ.data} onClick={salvarEmpresa}><IcCheck />{orgBusy ? 'Salvando…' : 'Salvar alterações'}</button></div>}
    </div>
  </>);
}

/* ===================== Equipe ===================== */
const fmtQuando = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
type LinhaEquipe = { kind: 'membro' | 'convite'; id: string; nome: string; email: string; papel: string; status: string; ultimo: string | null; data: string };

function EquipePanel({ podeAdmin, podeGerenciar, meuId }: { podeAdmin: boolean; podeGerenciar: boolean; meuId?: string }) {
  const { toast } = useToast();
  const equipeQ = useEquipe();
  const acoes = useEquipeActions();
  const [menu, setMenu] = useState<string | null>(null);
  const [convite, setConvite] = useState(false);
  const [filtro, setFiltro] = useState<'todos' | 'ativos' | 'pendentes' | 'inativos'>('todos');
  const [fPapel, setFPapel] = useState('');
  const eq = equipeQ.data;
  const vagas = eq?.vagas;

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

  async function run(p: Promise<unknown>, ok: string) { try { await p; toast(ok); } catch (e) { toast(traduzCfg((e as Error).message), 'warn'); } }
  async function acaoConvite(fn: Promise<ConviteResultado>, okMsg: string, copiar?: boolean) {
    try {
      const r = await fn;
      if (r.error) { toast(traduzCfg(r.code || r.error), 'warn'); return; }
      if (copiar) {
        if (r.inviteLink) { try { await navigator.clipboard.writeText(r.inviteLink); toast('Link do convite copiado. Compartilhe só com o convidado.'); } catch { toast(r.inviteLink); } }
        else { toast('Copiar link só está disponível no modo de link manual.', 'warn'); }
        return;
      }
      toast(r.estado === 'envio_solicitado' ? 'Convite reenviado. A entrega do e-mail ainda não foi confirmada.' : okMsg);
    } catch (e) { toast(traduzCfg((e as Error).message), 'warn'); }
  }

  return (
    <div className="set-card">
      <div className="sc-head bordered"><div className="row"><div className="grow"><h3>Equipe</h3><p>Pessoas com acesso à organização e convites em aberto.{vagas?.limite != null ? ` Uso do plano: ${vagas.ativos + vagas.pendentes} de ${vagas.limite} usuário${vagas.limite === 1 ? '' : 's'} (ativos + convites pendentes).` : ''}{!podeGerenciar ? ' Somente administradores/supervisores gerenciam.' : ''}</p></div>{podeGerenciar && <button className="btn-primary" onClick={() => setConvite(true)}><IcInvite />Convidar usuário</button>}</div></div>

      <div className="team-filtros">
        {(['todos', 'ativos', 'pendentes', 'inativos'] as const).map((f) => <button key={f} type="button" className={'chip' + (filtro === f ? ' on' : '')} onClick={() => setFiltro(f)}>{f === 'todos' ? 'Todos' : f === 'ativos' ? 'Ativos' : f === 'pendentes' ? 'Pendentes' : 'Inativos'}</button>)}
        <select className="ctrl team-fpapel" value={fPapel} onChange={(e) => setFPapel(e.target.value)}><option value="">Todos os perfis</option><option value="admin">Administrador</option><option value="supervisor">Supervisor</option><option value="atendente">Atendente</option></select>
      </div>

      <div className="team-scroll">
        {equipeQ.isLoading ? <div className="cfg-load">Carregando equipe…</div> : (
          <table className="team-table" aria-label="Equipe">
            <thead><tr><th className="column-membro">Membro</th><th className="column-center">Função</th><th className="column-center">Status</th><th className="column-center">Último acesso</th><th className="column-center">Desde</th>{podeGerenciar && <th className="column-center" aria-label="Ações"></th>}</tr></thead>
            <tbody>
              {filtradas.map((l) => {
                const gerConv = l.kind === 'convite' && podeGerenciar && (podeAdmin || l.papel === 'atendente');
                const gerMemb = l.kind === 'membro' && podeAdmin && l.id !== meuId;
                return (
                <tr key={l.kind + l.id}>
                  <td><div className="member-cell"><Av n={l.nome} /><div className="mt"><span className="nm">{l.nome}{l.id === meuId ? ' (você)' : ''}</span><span className="em">{l.email}</span></div></div></td>
                  <td className="column-center"><div className="cell-center"><span className={'badge ' + (PAPEL_CLS[l.papel] || 'neutral')}>{PAPEL_LABEL[l.papel] || l.papel}</span></div></td>
                  <td className="column-center"><div className="cell-center"><span className={'badge ' + (STATUS_CLS[l.status] || 'neutral')}>{l.status === 'ativo' && <span className="dot" />}{STATUS_LABEL[l.status] || l.status}</span></div></td>
                  <td className="column-center"><div className="cell-center acesso">{l.kind === 'membro' ? (l.ultimo ? fmtQuando(l.ultimo) : 'Nunca') : '—'}</div></td>
                  <td className="column-center"><div className="cell-center acesso">{fmtQuando(l.data)}</div></td>
                  {podeGerenciar && <td className="column-center"><div className="cell-center" style={{ position: 'relative' }}>
                    {(gerMemb || gerConv) ? <button type="button" className="row-menu" aria-label="Ações" onClick={() => setMenu(menu === l.kind + l.id ? null : l.kind + l.id)}><IcDots /></button> : <span className="acesso">—</span>}
                    {menu === l.kind + l.id && (
                      <div className="pop show" style={{ position: 'absolute', right: 0, top: '100%' }} onMouseLeave={() => setMenu(null)}>
                        {gerMemb && <>
                          <div className="pop-lbl">Perfil</div>
                          {(['admin', 'supervisor', 'atendente'] as const).map((p) => <button key={p} className={'pop-item' + (l.papel === p ? ' sel' : '')} onClick={() => { setMenu(null); run(acoes.alterarPapel(l.id, p), 'Perfil atualizado'); }}>{PAPEL_LABEL[p]}</button>)}
                          <div className="pop-sep" />
                          {l.status === 'ativo'
                            ? <button className="pop-item" onClick={() => { setMenu(null); run(acoes.definirStatus(l.id, 'inativo'), 'Usuário desativado'); }}>Desativar</button>
                            : <button className="pop-item" onClick={() => { setMenu(null); run(acoes.definirStatus(l.id, 'ativo'), 'Usuário reativado'); }}>Reativar</button>}
                        </>}
                        {gerConv && <>
                          <button className="pop-item" onClick={() => { setMenu(null); acaoConvite(acoes.reenviar(l.id), 'Novo link gerado. Links anteriores podem abrir sessão, mas só um convite pendente e válido ativa o acesso.'); }}>Reenviar convite</button>
                          <button className="pop-item" onClick={() => { setMenu(null); acaoConvite(acoes.reenviar(l.id), '', true); }}>Copiar link</button>
                          <button className="pop-item danger" onClick={() => { setMenu(null); acaoConvite(acoes.cancelar(l.id), 'Convite cancelado.'); }}>Cancelar convite</button>
                        </>}
                      </div>
                    )}
                  </div></td>}
                </tr>
                );
              })}
              {filtradas.length === 0 && <tr><td colSpan={podeGerenciar ? 6 : 5}><div className="cfg-load">Nenhum registro para este filtro.</div></td></tr>}
            </tbody>
          </table>
        )}
      </div>
      <footer className="tc-foot"><span className="ft">{(eq?.membros.length ?? 0)} membro{(eq?.membros.length ?? 0) === 1 ? '' : 's'}{(eq?.convites.length ?? 0) > 0 ? ` · ${eq?.convites.length} convite${eq?.convites.length === 1 ? '' : 's'}` : ''}</span></footer>

      {convite && <ConviteModal podeAdmin={podeAdmin} onClose={() => setConvite(false)} onConvidar={acoes.convidar} />}
    </div>
  );
}

function ConviteModal({ podeAdmin, onClose, onConvidar }: { podeAdmin: boolean; onClose: () => void; onConvidar: (email: string, nome: string, papel: string) => Promise<ConviteResultado> }) {
  const { toast } = useToast();
  const [email, setEmail] = useState(''); const [nome, setNome] = useState(''); const [papel, setPapel] = useState('atendente'); const [busy, setBusy] = useState(false);
  const [resultado, setResultado] = useState<ConviteResultado | null>(null);
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  async function enviar() {
    if (!emailOk) { toast('Informe um e-mail válido.', 'warn'); return; }
    setBusy(true);
    const r = await onConvidar(email.trim().toLowerCase(), nome.trim(), papel);
    setBusy(false);
    if (r.error) { toast(traduzCfg(r.code || r.error), 'warn'); return; }
    setResultado(r); // mostra estado do convite (enviado / preparado + copiar link)
  }
  async function copiar() { if (resultado?.inviteLink) { try { await navigator.clipboard.writeText(resultado.inviteLink); toast('Link copiado.'); } catch { toast(resultado.inviteLink!); } } }

  return (
    <Modal open onClose={() => { if (!busy) onClose(); }} closeOnBackdrop={!busy} width={480}
      title="Convidar usuário"
      footer={resultado
        ? <button className="atv-btn primary" onClick={onClose}>Concluir</button>
        : <><button className="atv-btn" disabled={busy} onClick={onClose}>Cancelar</button><button className="atv-btn primary" disabled={busy || !emailOk} onClick={enviar}>{busy ? 'Enviando…' : 'Enviar convite'}</button></>}>
      {resultado ? (
        <div className="cfg-form">
          {resultado.estado === 'link_gerado' && resultado.inviteLink ? (
            <>
              <div className="cfg-nota ok">Convite criado para <b>{email.trim().toLowerCase()}</b>. Link seguro gerado (modo link manual).</div>
              <div className="cfg-aviso">Este link permite acesso à conta. Compartilhe somente com o usuário convidado.</div>
              <button type="button" className="atv-btn" onClick={copiar} style={{ alignSelf: 'flex-start' }}>Copiar link do convite</button>
            </>
          ) : (
            <>
              <div className="cfg-nota ok">Convite criado para <b>{email.trim().toLowerCase()}</b>. A entrega do e-mail ainda não foi confirmada.</div>
              <div className="cfg-nota">A pessoa define a própria senha pelo link. Se o e-mail não chegar, confirme o SMTP nas configurações de autenticação do Supabase (ou use o modo de link manual).</div>
            </>
          )}
        </div>
      ) : (
        <div className="cfg-form">
          <div className="cfg-field"><label>Nome</label><input className="ctrl" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome da pessoa" /></div>
          <div className="cfg-field"><label>E-mail <span style={{ color: 'var(--err)' }}>*</span></label><input className="ctrl" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="pessoa@empresa.com" /></div>
          <div className="cfg-field"><label>Perfil</label><select className="ctrl" value={papel} onChange={(e) => setPapel(e.target.value)}><option value="atendente">Atendente</option><option value="supervisor">Supervisor</option>{podeAdmin && <option value="admin">Administrador</option>}</select></div>
          <div className="cfg-nota">Sem senha manual: a pessoa recebe um link seguro do Supabase Auth e define a própria senha. O convite consome uma vaga do plano até ser aceito ou cancelado.</div>
        </div>
      )}
    </Modal>
  );
}

/* ===================== Canais (resumo) ===================== */
function CanaisPanel({ podeGerenciar, onNav }: { podeGerenciar: boolean; onNav: (p: string) => void }) {
  const waQ = useWaCanais();
  const fbQ = useFbStatus();
  const wa = waQ.data ?? []; const fb = (fbQ.data ?? []).filter((p) => p.estado === 'conectado');
  return (<>
    <div className="set-card">
      <div className="sc-head bordered"><div className="row"><div className="grow"><h3>WhatsApp</h3><p>Resumo das conexões. A gestão (conectar/remover) fica em Integrações.</p></div><button className="btn-ghost" onClick={() => onNav('/integracoes')}><IcExt />Abrir Integrações</button></div></div>
      {!WA_REAL ? <div className="chan-row"><div className="chan-txt"><div className="d">Disponível com o backend configurado.</div></div></div>
        : waQ.isLoading ? <div className="cfg-load">Carregando…</div>
        : wa.length === 0 ? <div className="chan-row"><div className="chan-txt"><div className="d">Nenhum WhatsApp conectado. Conecte em Integrações.</div></div></div>
        : wa.map((c) => (
          <div className="chan-row" key={c.id}>
            <span className="chan-ic wa"><IcWa /></span>
            <div className="chan-txt"><div className="t">{c.alias}</div><div className="d">{c.numero || 'Sem número'}{TIPO_ORIGEM[c.origemTipo || ''] ? ' · ' + TIPO_ORIGEM[c.origemTipo as string] : ''}{c.gestorNome ? ' · Gestor: ' + c.gestorNome : ''}</div></div>
            <div className="chan-act">
              <span className={'badge ' + (WA_ST[c.status]?.cls || 'neutral')}>{WA_ST[c.status]?.dot && <span className="dot" />}{WA_ST[c.status]?.t || c.status}</span>
              {podeGerenciar && <button className="btn-sm" onClick={() => onNav('/integracoes')}>Configurar origem comercial</button>}
            </div>
          </div>
        ))}
    </div>
    <div className="set-card">
      <div className="sc-head bordered"><h3>Facebook</h3><p>Páginas conectadas ao Messenger.</p></div>
      {fbQ.isLoading ? <div className="cfg-load">Carregando…</div> : fb.length === 0
        ? <div className="chan-row"><div className="chan-txt"><div className="d">Nenhuma Página conectada. Conecte em Integrações.</div></div></div>
        : fb.map((p) => (
          <div className="chan-row" key={p.id}><span className="chan-ic fb"><IcFb /></span><div className="chan-txt"><div className="t">{p.pagina_nome || p.pagina_id}</div><div className="d">Messenger</div></div><div className="chan-act"><span className="badge ok"><span className="dot" />Conectado</span></div></div>
        ))}
    </div>
  </>);
}

/* ===================== Atendimento — configurações por organização ===================== */
function ConfigAtendimentoCard({ podeGerenciar }: { podeGerenciar: boolean }) {
  const { toast } = useToast();
  const cfgQ = useConfigAtendimento();
  const salvar = useSalvarConfigAtendimento();
  const statusQ = useStatusDefs();
  const [c, setC] = useState<ConfigAtendimento | null>(null);
  useEffect(() => { if (cfgQ.data) setC(cfgQ.data); }, [cfgQ.data]);
  if (cfgQ.isLoading || !c) return <div className="set-card"><div className="sc-head bordered"><h3>Configurações de atendimento</h3></div><div className="sc-body"><div className="cfg-load">Carregando…</div></div></div>;
  const toggleDia = (i: number) => setC({ ...c, dias: c.dias.includes(i) ? c.dias.filter((d) => d !== i) : [...c.dias, i].sort() });
  async function salvarCfg() { if (!c) return; try { await salvar.mutateAsync(c); toast('Configurações de atendimento salvas'); } catch (e) { toast(traduzCfg((e as Error).message), 'warn'); } }
  const dis = !podeGerenciar;
  return (
    <div className="set-card">
      <div className="sc-head bordered"><h3>Configurações de atendimento</h3><p>Horário, jornada e regras da operação — válidas para toda a organização.{dis ? ' Somente administradores editam.' : ''}</p></div>
      <div className="sc-body">
        <div className="form-grid">
          <div className="fld"><label>Início do atendimento</label><input className="ctrl" type="time" value={c.horario_inicio} disabled={dis} onChange={(e) => setC({ ...c, horario_inicio: e.target.value })} /></div>
          <div className="fld"><label>Fim do atendimento</label><input className="ctrl" type="time" value={c.horario_fim} disabled={dis} onChange={(e) => setC({ ...c, horario_fim: e.target.value })} /></div>
          <div className="fld"><label>Conversa sem resposta após (min)</label><input className="ctrl" type="number" min={1} value={c.tempo_sem_resposta_min} disabled={dis} onChange={(e) => setC({ ...c, tempo_sem_resposta_min: Number(e.target.value) || 0 })} /></div>
          <div className="fld"><label>Tempo de inatividade p/ encerrar (min)</label><input className="ctrl" type="number" min={0} value={c.tempo_inatividade_min} disabled={dis} onChange={(e) => setC({ ...c, tempo_inatividade_min: Number(e.target.value) || 0 })} /></div>
          <div className="fld"><label>Status padrão de nova conversa</label><select className="ctrl" value={c.status_padrao} disabled={dis} onChange={(e) => setC({ ...c, status_padrao: e.target.value })}><option value="">Padrão do sistema</option>{(statusQ.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}</select></div>
          <div className="fld full"><label>Dias de atendimento</label><div className="dias-row">{DIAS_SEMANA.map((d) => <button key={d.i} type="button" className={'dia-chip' + (c.dias.includes(d.i) ? ' on' : '')} disabled={dis} onClick={() => toggleDia(d.i)}>{d.l}</button>)}</div></div>
          <div className="fld full"><label>Mensagem fora do horário</label><textarea className="ctrl cfg-ta" rows={2} value={c.mensagem_fora_horario} disabled={dis} onChange={(e) => setC({ ...c, mensagem_fora_horario: e.target.value })} placeholder="Ex.: Nosso horário é das 8h às 18h. Retornaremos em breve." /></div>
        </div>
        <div className="cfg-nota">A aplicação automática (auto-resposta fora do horário, encerramento por inatividade, distribuição automática) depende de automação no backend — ainda não disponível; as regras ficam salvas e prontas.</div>
      </div>
      {podeGerenciar && <div className="sc-foot"><button className="btn-primary" disabled={salvar.isPending} onClick={salvarCfg}><IcCheck />{salvar.isPending ? 'Salvando…' : 'Salvar configurações'}</button></div>}
    </div>
  );
}

/* ===================== Notificações ===================== */
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
function NotifPanel() {
  const { toast } = useToast();
  const prefsQ = usePreferencias();
  const salvar = useSalvarPreferencias();
  const [p, setP] = useState<Prefs | null>(null);
  useEffect(() => { if (prefsQ.data) setP(prefsQ.data); }, [prefsQ.data]);
  if (prefsQ.isLoading || !p) return <div className="set-card"><div className="sc-head"><h3>Notificações</h3></div><div className="sc-body"><div className="cfg-load">Carregando…</div></div></div>;
  async function flip(grupo: 'notif_email' | 'notif_app', k: string, v: boolean) {
    const np: Prefs = { ...p!, [grupo]: { ...p![grupo], [k]: v } };
    setP(np);
    try { await salvar.mutateAsync(np); } catch (e) { toast(traduzCfg((e as Error).message), 'warn'); setP(p); }
  }
  return (
    <div className="set-card">
      <div className="sc-head"><h3>Notificações</h3><p>Preferências individuais. As alterações são salvas automaticamente.</p></div>
      <div className="cfg-nota" style={{ margin: '0 22px 4px' }}>O envio real de e-mail/push depende de integração de entrega — <b>Integração de envio pendente</b>. Suas preferências são persistidas mesmo assim.</div>
      <div className="sc-sub">Por email</div>
      {NOTIF_EMAIL.map((n) => <div className="toggle-row" key={n.k}><div className="tr-txt"><div className="t">{n.t}</div><div className="d">{n.d}</div></div><Switch on={!!p.notif_email[n.k]} onChange={(v) => flip('notif_email', n.k, v)} /></div>)}
      <div className="sc-sub">No aplicativo</div>
      {NOTIF_APP.map((n) => <div className="toggle-row" key={n.k}><div className="tr-txt"><div className="t">{n.t}</div><div className="d">{n.d}</div></div><Switch on={!!p.notif_app[n.k]} onChange={(v) => flip('notif_app', n.k, v)} /></div>)}
    </div>
  );
}

/* ===================== Preferências ===================== */
function PrefsPanel({ theme, setTheme, toast, onNav }: { theme: string; setTheme: (t: 'light' | 'dark') => void; toast: (m: string, k?: 'ok' | 'warn') => void; onNav: (p: string) => void }) {
  const prefsQ = usePreferencias();
  const salvar = useSalvarPreferencias();
  const [p, setP] = useState<Prefs | null>(null);
  useEffect(() => { if (prefsQ.data) setP(prefsQ.data); }, [prefsQ.data]);
  const temaSel = p?.tema || (theme as 'light' | 'dark');
  function aplicarTema(t: 'light' | 'dark' | 'system') {
    const resolvido = t === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : t;
    setTheme(resolvido);
    persist({ tema: t });
  }
  async function persist(patch: Partial<Prefs>) {
    if (!p) return; const np = { ...p, ...patch }; setP(np);
    try { await salvar.mutateAsync(np); if (patch.densidade) document.documentElement.dataset.densidade = patch.densidade; } catch (e) { toast(traduzCfg((e as Error).message), 'warn'); setP(p); }
  }
  useEffect(() => { if (p?.densidade) document.documentElement.dataset.densidade = p.densidade; }, [p?.densidade]);
  if (prefsQ.isLoading || !p) return <div className="set-card"><div className="sc-head"><h3>Preferências</h3></div><div className="sc-body"><div className="cfg-load">Carregando…</div></div></div>;
  void onNav;
  return (
    <div className="set-card">
      <div className="sc-head"><h3>Preferências</h3><p>Personalize a aparência e o comportamento. Salvas na sua conta.</p></div>
      <div className="pref-row">
        <div className="pr-txt"><div className="t">Tema</div><div className="d">Claro, escuro ou seguindo o sistema.</div></div>
        <div className="pref-seg">
          <button className={temaSel === 'light' ? 'on' : ''} onClick={() => aplicarTema('light')}><IcSun />Claro</button>
          <button className={temaSel === 'dark' ? 'on' : ''} onClick={() => aplicarTema('dark')}><IcMoon />Escuro</button>
          <button className={temaSel === 'system' ? 'on' : ''} onClick={() => aplicarTema('system')}>Sistema</button>
        </div>
      </div>
      <div className="pref-row"><div className="pr-txt"><div className="t">Idioma</div><div className="d">Idioma da interface.</div></div><div className="pr-ctrl"><select className="ctrl" value="pt-BR" disabled><option value="pt-BR">Português (Brasil)</option></select></div></div>
      <div className="pref-row"><div className="pr-txt"><div className="t">Formato de data</div><div className="d">Como as datas são exibidas.</div></div><div className="pr-ctrl"><select className="ctrl" value={p.formato_data} onChange={(e) => persist({ formato_data: e.target.value })}><option value="dd/MM/yyyy">DD/MM/AAAA</option><option value="MM/dd/yyyy">MM/DD/AAAA</option><option value="yyyy-MM-dd">AAAA-MM-DD</option></select></div></div>
      <div className="pref-row"><div className="pr-txt"><div className="t">Densidade da interface</div><div className="d">Espaçamento de listas e tabelas.</div></div><div className="pr-ctrl"><select className="ctrl" value={p.densidade} onChange={(e) => persist({ densidade: e.target.value as Prefs['densidade'] })}><option value="confortavel">Confortável</option><option value="compacta">Compacta</option></select></div></div>
      <div className="pref-row"><div className="pr-txt"><div className="t">Página inicial</div><div className="d">Tela exibida ao entrar.</div></div><div className="pr-ctrl"><select className="ctrl" value={p.pagina_inicial} onChange={(e) => persist({ pagina_inicial: e.target.value })}><option value="/whatsapp">WhatsApp</option><option value="/kanban">Kanban</option><option value="/cobrancas">Cobranças</option><option value="/relatorios">Relatórios</option></select></div></div>
      <div className="toggle-row"><div className="tr-txt"><div className="t">Mostrar dicas e tutoriais</div><div className="d">Sugestões contextuais pela interface.</div></div><Switch on={!!p.mostrar_dicas} onChange={(v) => persist({ mostrar_dicas: v })} /></div>
      <div className="toggle-row"><div className="tr-txt"><div className="t">Reproduzir sons</div><div className="d">Efeitos sonoros em ações e alertas (respeita o som de notificação).</div></div><Switch on={!!p.sons} onChange={(v) => persist({ sons: v })} /></div>
    </div>
  );
}

/* ============================================================
   Atendimento — administração de Status e Etiquetas (real)
   ============================================================ */
const IcUp = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 15 6-6 6 6" /></svg>;
const IcDown = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>;
const IcTrash2 = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></svg>;
const IcStar = () => <svg viewBox="0 0 24 24" fill="currentColor"><path d="m12 3 2.7 5.5 6 .9-4.3 4.2 1 6L12 17l-5.4 2.6 1-6L3.3 9.4l6-.9z" /></svg>;
const IcPlus2 = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>;

function AtendimentoPanel({ canManage, section }: { canManage: boolean; section: string | null }) {
  const { toast } = useToast();
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
    const t = setTimeout(() => { alvo.scrollIntoView({ behavior: 'smooth', block: 'start' }); setDestaque(section); setTimeout(() => setDestaque(null), 2200); }, 120);
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

  const [picker, setPicker] = useState<{ kind: 'status' | 'etq'; id: string; orig: string; cor: string } | null>(null);
  const [pickerPos, setPickerPos] = useState({ left: -9999, top: -9999 });
  const pickerRect = useRef<DOMRect | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  async function run(p: Promise<void>, ok: string) { try { await p; toast(ok); } catch (e) { toast((e as Error).message || 'Falha na operação', 'warn'); } }
  function persistirCor(kind: 'status' | 'etq', id: string, cor: string) { run(kind === 'status' ? a.atualizarStatus(id, { cor }) : a.atualizarEtiqueta(id, { cor }), 'Cor atualizada'); }
  function commitPending() { if (picker && picker.cor.toLowerCase() !== picker.orig.toLowerCase()) persistirCor(picker.kind, picker.id, picker.cor); }
  function openPicker(kind: 'status' | 'etq', id: string, cor: string, rect: DOMRect) { commitPending(); pickerRect.current = rect; setPickerPos({ left: -9999, top: -9999 }); setPicker({ kind, id, orig: cor, cor }); }
  function fecharPicker() { commitPending(); setPicker(null); }
  function aplicarCorPaleta(c: string) { if (!picker) return; const { kind, id, orig } = picker; setPicker(null); if (c.toLowerCase() !== orig.toLowerCase()) persistirCor(kind, id, c); }
  const corDaRow = (kind: 'status' | 'etq', id: string, cor: string) => (picker && picker.kind === kind && picker.id === id ? picker.cor : cor);

  useLayoutEffect(() => {
    if (!picker || !pickerRef.current || !pickerRect.current) return;
    const el = pickerRef.current; const pw = el.offsetWidth; const ph = el.offsetHeight; const r = pickerRect.current;
    const left = Math.max(10, Math.min(r.left, window.innerWidth - pw - 10));
    let top = r.bottom + 6; if (top + ph > window.innerHeight - 10) top = Math.max(10, r.top - ph - 6);
    setPickerPos({ left, top });
  }, [picker]);

  useEffect(() => {
    if (!picker) return;
    function onDown(e: MouseEvent) { const t = e.target as HTMLElement; if (pickerRef.current?.contains(t)) return; if (t.closest && t.closest('.atd-color-btn')) return; fecharPicker(); }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') fecharPicker(); }
    document.addEventListener('mousedown', onDown); document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [picker]); // eslint-disable-line react-hooks/exhaustive-deps

  function moveStatus(idx: number, dir: -1 | 1) {
    const arr = statuses.map((s) => s.id); const j = idx + dir; if (j < 0 || j >= arr.length) return;
    [arr[idx], arr[j]] = [arr[j], arr[idx]]; run(a.reordenarStatus(arr), 'Ordem atualizada');
  }
  async function startDeleteStatus(s: StatusDef) {
    try { const count = await a.contarConversasComStatus(s.id);
      if (count > 0) { setDel({ s, count }); setSubId(statuses.find((x) => x.id !== s.id && x.ativo)?.id ?? ''); }
      else if (window.confirm(`Excluir o status "${s.nome}"?`)) run(a.excluirStatus(s.id, null), 'Status excluído');
    } catch (e) { toast((e as Error).message, 'warn'); }
  }
  function confirmDeleteStatus() {
    if (!del) return; if (!subId) { toast('Escolha um status substituto.', 'warn'); return; }
    const id = del.s.id; setDel(null); run(a.excluirStatus(id, subId), 'Status excluído e conversas reatribuídas');
  }

  return (
    <>
      <div className={'set-card' + (destaque === 'status' ? ' atd-destaque' : '')} ref={statusCardRef}>
        <div className="sc-head bordered"><h3>Status das conversas</h3><p>Estados configuráveis usados em Dados do cliente e nos filtros. {canManage ? 'Crie, renomeie, defina cor, ordene, marque padrão, desative ou exclua.' : 'Somente administradores e gestores podem editar.'}</p></div>
        {statusQ.isLoading && <div className="chan-row"><div className="chan-txt"><div className="d">Carregando status…</div></div></div>}
        {statuses.map((s, idx) => (
          <div className="atd-row" key={s.id}>
            <button type="button" className="atd-color-btn" style={{ background: corDaRow('status', s.id, s.cor) }} disabled={!canManage} title="Alterar cor" aria-label="Alterar cor" onClick={(e) => openPicker('status', s.id, s.cor, e.currentTarget.getBoundingClientRect())} />
            <input className="atd-name" defaultValue={s.nome} disabled={!canManage} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== s.nome) run(a.atualizarStatus(s.id, { nome: v }), 'Status renomeado'); }} />
            {s.sistema && <span className="atd-sys" title="Status de sistema">sistema</span>}
            {s.padrao ? <span className="badge ok"><span className="dot" />Padrão</span> : canManage && <button className="atd-mini" title="Tornar padrão" onClick={() => run(a.definirStatusPadrao(s.id), '“' + s.nome + '” agora é o padrão')}><IcStar /></button>}
            <div className="atd-actions">
              <button className="atd-mini" title="Subir" disabled={!canManage || idx === 0} onClick={() => moveStatus(idx, -1)}><IcUp /></button>
              <button className="atd-mini" title="Descer" disabled={!canManage || idx === statuses.length - 1} onClick={() => moveStatus(idx, 1)}><IcDown /></button>
              <button className={'atd-toggle' + (s.ativo ? ' on' : '')} title={s.ativo ? 'Ativo' : 'Inativo'} disabled={!canManage} onClick={() => run(a.atualizarStatus(s.id, { ativo: !s.ativo }), s.ativo ? 'Status desativado' : 'Status ativado')}><span className="k" /></button>
              <button className="atd-mini danger" title="Excluir" disabled={!canManage} onClick={() => startDeleteStatus(s)}><IcTrash2 /></button>
            </div>
          </div>
        ))}
        {del && (
          <div className="atd-del">
            <IcTrash2 /> O status <b>“{del.s.nome}”</b> está em uso por {del.count} conversa{del.count === 1 ? '' : 's'}. Escolha um substituto:
            <select value={subId} onChange={(e) => setSubId(e.target.value)}><option value="">Selecione…</option>{statuses.filter((x) => x.id !== del.s.id).map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}</select>
            <button className="btn-primary" onClick={confirmDeleteStatus}>Excluir e reatribuir</button>
            <button className="btn-ghost" onClick={() => setDel(null)}>Cancelar</button>
          </div>
        )}
        {canManage && (
          <div className="atd-add">
            <input type="color" className="atd-color" value={nsColor} onChange={(e) => setNsColor(e.target.value)} title="Cor" />
            <input className="atd-name" placeholder="Novo status (ex.: Aguardando documento)" value={nsName} onChange={(e) => setNsName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && nsName.trim()) { run(a.criarStatus(nsName.trim(), nsColor), 'Status criado'); setNsName(''); } }} />
            <button className="btn-primary" disabled={!nsName.trim()} onClick={() => { run(a.criarStatus(nsName.trim(), nsColor), 'Status criado'); setNsName(''); }}><IcPlus2 />Adicionar</button>
          </div>
        )}
      </div>

      <div className={'set-card' + (destaque === 'etiquetas' ? ' atd-destaque' : '')} ref={etqCardRef}>
        <div className="sc-head bordered"><h3>Etiquetas</h3><p>Etiquetas coloridas aplicáveis a contatos, conversas e oportunidades. Não é possível duplicar o nome na organização.</p></div>
        {etqQ.isLoading && <div className="chan-row"><div className="chan-txt"><div className="d">Carregando etiquetas…</div></div></div>}
        {etqs.length === 0 && !etqQ.isLoading && <div className="chan-row"><div className="chan-txt"><div className="d">Nenhuma etiqueta ainda.</div></div></div>}
        {etqs.map((e) => (
          <div className="atd-row" key={e.id}>
            <button type="button" className="atd-color-btn" style={{ background: corDaRow('etq', e.id, e.cor) }} disabled={!canManage} title="Alterar cor" aria-label="Alterar cor" onClick={(ev) => openPicker('etq', e.id, e.cor, ev.currentTarget.getBoundingClientRect())} />
            <input className="atd-name" defaultValue={e.nome} disabled={!canManage} onKeyDown={(ev) => { if (ev.key === 'Enter') (ev.target as HTMLInputElement).blur(); }} onBlur={(ev) => { const v = ev.target.value.trim(); if (v && v !== e.nome) run(a.atualizarEtiqueta(e.id, { nome: v }), 'Etiqueta renomeada'); }} />
            <input className="atd-desc" placeholder="Descrição (opcional)" defaultValue={e.descricao ?? ''} disabled={!canManage} onBlur={(ev) => { const v = ev.target.value.trim(); if (v !== (e.descricao ?? '')) run(a.atualizarEtiqueta(e.id, { descricao: v || null }), 'Descrição atualizada'); }} />
            <div className="atd-actions">
              <button className={'atd-toggle' + (e.ativo ? ' on' : '')} title={e.ativo ? 'Ativa' : 'Inativa'} disabled={!canManage} onClick={() => run(a.atualizarEtiqueta(e.id, { ativo: !e.ativo }), e.ativo ? 'Etiqueta desativada' : 'Etiqueta ativada')}><span className="k" /></button>
              <button className="atd-mini danger" title="Excluir" disabled={!canManage} onClick={() => { if (window.confirm(`Excluir a etiqueta "${e.nome}"?`)) run(a.excluirEtiqueta(e.id), 'Etiqueta excluída'); }}><IcTrash2 /></button>
            </div>
          </div>
        ))}
        {canManage && (
          <div className="atd-add">
            <input type="color" className="atd-color" value={etColor} onChange={(e) => setEtColor(e.target.value)} title="Cor" />
            <input className="atd-name" placeholder="Nova etiqueta" value={etName} onChange={(e) => setEtName(e.target.value)} />
            <input className="atd-desc" placeholder="Descrição (opcional)" value={etDesc} onChange={(e) => setEtDesc(e.target.value)} />
            <button className="btn-primary" disabled={!etName.trim()} onClick={() => { run(a.criarEtiqueta(etName.trim(), etColor, etDesc.trim() || null), 'Etiqueta criada'); setEtName(''); setEtDesc(''); }}><IcPlus2 />Adicionar</button>
          </div>
        )}
      </div>

      {picker && (
        <div ref={pickerRef} className="cor-pop" style={{ left: pickerPos.left, top: pickerPos.top }} role="dialog" aria-label="Selecionar cor">
          <div className="cor-pop-head">Cor</div>
          <div className="cor-swatches">{PALETA_CORES.map((c) => <button key={c} type="button" className={'cor-sw' + (c.toLowerCase() === picker.cor.toLowerCase() ? ' sel' : '')} style={{ background: c }} title={c} aria-label={c} onClick={() => aplicarCorPaleta(c)} />)}</div>
          <div className="cor-custom">
            <label className="cor-native" title="Cor personalizada"><input type="color" value={picker.cor} onChange={(ev) => setPicker((pp) => pp && ({ ...pp, cor: ev.target.value }))} /><span className="cor-native-sw" style={{ background: picker.cor }} />Personalizada</label>
            <span className="cor-hex">{picker.cor.toUpperCase()}</span>
            <button type="button" className="cor-aplicar" onClick={fecharPicker}>Aplicar</button>
          </div>
        </div>
      )}
    </>
  );
}
