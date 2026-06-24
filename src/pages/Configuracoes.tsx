import { useEffect, useRef, useState } from 'react';
import { useToast } from '@/hooks/useToast';
import { useTheme } from '@/hooks/useTheme';
import { useWaCanais, WA_REAL } from '@/data/whatsapp';
import './Configuracoes.css';

const PAL = ['#5b6ee1', '#c2693a', '#7a5bb0', '#2f8f9d', '#b0566f', '#4a7a4a', '#9d7a2f', '#3d7ab0'];
function initials(n: string) { const p = n.trim().split(/\s+/); return ((p[0] || '')[0] + ((p[1] || '')[0] || '')).toUpperCase(); }
function avColor(n: string) { if (n === 'Henrique') return '#3f6f52'; let h = 0; for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0; return PAL[h % PAL.length]; }
function Av({ n }: { n: string }) { return <span className="av" style={{ background: avColor(n) }}>{initials(n)}</span>; }

const IcCheck = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>;
const IcDots = () => <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="12" cy="19" r="1.7" /></svg>;
const IcChevL = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>;
const IcChevR = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>;
const IcWa = () => <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a9.9 9.9 0 0 0-8.5 15l-1.3 4.8 4.9-1.3A9.9 9.9 0 1 0 12 2zm4.5 12c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.6.8-.8 1-.3.1-.6 0a6.7 6.7 0 0 1-2-1.2 7.4 7.4 0 0 1-1.3-1.7c-.2-.3 0-.4.1-.5l.4-.5.3-.4v-.4l-.9-2c-.2-.5-.4-.4-.6-.5h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.6 11.6 0 0 0 4.5 3.9c.6.3 1.1.4 1.5.5a3.6 3.6 0 0 0 1.6.1 2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .1-1.2c0-.1-.2-.2-.5-.3z" /></svg>;
const IcFb = () => <svg viewBox="0 0 24 24" fill="currentColor"><path d="M22 12a10 10 0 1 0-11.6 9.9v-7H8v-2.9h2.4V9.8c0-2.4 1.4-3.7 3.6-3.7 1 0 2.1.2 2.1.2v2.3h-1.2c-1.2 0-1.5.7-1.5 1.4V12H16l-.4 2.9h-2.2v7A10 10 0 0 0 22 12z" /></svg>;
const IcAds = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16v5a8 8 0 0 1-16 0z" /><path d="M9 20h6M12 13v7" /></svg>;
const IcReconnect = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5" /></svg>;
const IcInvite = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0 .01M19 8v6M22 11h-6" /></svg>;
const IcCamera = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>;
const IcSun = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M5 5l1.4 1.4M17.6 17.6 19 19M3 12h2M19 12h2M5 19l1.4-1.4M17.6 6.4 19 5" /></svg>;
const IcMoon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>;

const TABS = [
  { id: 'conta', label: 'Conta', ic: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg> },
  { id: 'equipe', label: 'Equipe', ic: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3.2" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.2a3.2 3.2 0 0 1 0 6.3M21.5 20a6.5 6.5 0 0 0-4-6" /></svg> },
  { id: 'canais', label: 'Canais', ic: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.5 13.5a4.5 4.5 0 0 0 6.4 0l2.3-2.3a4.5 4.5 0 0 0-6.4-6.4L11.5 6M13.5 10.5a4.5 4.5 0 0 0-6.4 0l-2.3 2.3a4.5 4.5 0 0 0 6.4 6.4L12.5 18" /></svg> },
  { id: 'notif', label: 'Notificações', ic: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" /></svg> },
  { id: 'prefs', label: 'Preferências', ic: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg> },
];

interface Member { nome: string; email: string; func: string; st: string; ac: string; }
const TEAM: Member[] = [
  { nome: 'Henrique', email: 'henrique@atenvo.com', func: 'Administrador', st: 'Ativo', ac: 'Agora' },
  { nome: 'Marina Lopes', email: 'marina@atenvo.com', func: 'Gestora', st: 'Ativo', ac: 'Há 12 min' },
  { nome: 'Antônio César', email: 'antonio@atenvo.com', func: 'Atendente', st: 'Ativo', ac: 'Há 1 hora' },
  { nome: 'Paula Ferreira', email: 'paula@atenvo.com', func: 'Atendente', st: 'Ativo', ac: 'Há 3 horas' },
  { nome: 'Giovana Martins', email: 'giovana@atenvo.com', func: 'Atendente', st: 'Convite pendente', ac: '—' },
  { nome: 'Rafael Souza', email: 'rafael@atenvo.com', func: 'Atendente', st: 'Inativo', ac: '10/05/2024' },
];
const FUNC: Record<string, string> = { Administrador: 'ok', Gestora: 'blue', Atendente: 'neutral' };
const STC: Record<string, string> = { Ativo: 'ok', 'Convite pendente': 'warn', Inativo: 'neutral' };
function FuncBadge({ f }: { f: string }) { return <span className={'badge ' + (FUNC[f] || 'neutral')}>{f}</span>; }
function StBadge({ s }: { s: string }) { return <span className={'badge ' + (STC[s] || 'neutral')}>{s === 'Ativo' && <span className="dot" />}{s}</span>; }

const WA_ST: Record<string, { t: string; cls: string; dot?: boolean }> = {
  conectado: { t: 'Conectado', cls: 'ok', dot: true },
  sincronizando: { t: 'Sincronizando', cls: 'warn' },
  desconectado: { t: 'Desconectado', cls: 'neutral' },
  atencao: { t: 'Atenção', cls: 'warn' },
  erro: { t: 'Erro', cls: 'err' },
};

function Switch({ on0, label }: { on0?: boolean; label: string }) {
  const { toast } = useToast();
  const [on, setOn] = useState(!!on0);
  return <button className={'bigswitch' + (on ? ' on' : '')} aria-label="Alternar" onClick={() => { const nv = !on; setOn(nv); toast(label + ': ' + (nv ? 'ativado' : 'desativado')); }}><span className="k" /></button>;
}

const MENU = ['Editar permissões', 'Reenviar convite', 'Remover acesso'];

export function Configuracoes() {
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
  const waCanais = useWaCanais();
  const [tab, setTab] = useState('conta');
  const [seg, setSeg] = useState<string>(theme);
  const [menu, setMenu] = useState<{ idx: number; left: number; top: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setSeg(theme); }, [theme]);
  useEffect(() => {
    function onDoc(e: MouseEvent) { if (menuRef.current?.contains(e.target as Node)) return; setMenu(null); }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setMenu(null); }
    function onResize() { setMenu(null); }
    document.addEventListener('click', onDoc); document.addEventListener('keydown', onKey); window.addEventListener('resize', onResize);
    return () => { document.removeEventListener('click', onDoc); document.removeEventListener('keydown', onKey); window.removeEventListener('resize', onResize); };
  }, []);

  function openMenu(e: React.MouseEvent, idx: number) {
    e.stopPropagation();
    if (menu && menu.idx === idx) { setMenu(null); return; }
    const rc = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const pw = 210;
    setMenu({ idx, left: Math.min(rc.right - pw, window.innerWidth - pw - 10), top: rc.bottom + 6 });
  }
  function pickTheme(th: string) {
    setSeg(th);
    if (th === 'system') { toast('Tema: seguindo o sistema'); return; }
    setTheme(th as 'light' | 'dark');
  }

  return (
    <div className="config-page">
      <div className="content">
        <div className="wrap">
          <div className="settings-tabs">
            {TABS.map((t) => <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>{t.ic}{t.label}</button>)}
          </div>

          {/* CONTA */}
          <section className={'tab-panel' + (tab === 'conta' ? ' on' : '')} data-panel="conta">
            <div className="set-card">
              <div className="sc-head bordered"><h3>Perfil</h3><p>Suas informações pessoais exibidas na plataforma.</p></div>
              <div className="sc-body">
                <div className="profile-row">
                  <span className="av xxl" style={{ background: '#3f6f52' }}>H</span>
                  <div className="pinfo"><div className="nm">Henrique</div><div className="rl">Administrador · henrique@atenvo.com</div></div>
                  <div className="pacts"><button className="btn-ghost" onClick={() => toast('Alterar foto')}><IcCamera />Alterar foto</button><button className="btn-ghost danger" onClick={() => toast('Remover foto')}>Remover</button></div>
                </div>
                <div className="form-grid">
                  <div className="fld"><label>Nome completo</label><input className="ctrl" defaultValue="Henrique Andrade" /></div>
                  <div className="fld"><label>Cargo</label><input className="ctrl" defaultValue="Administrador" /></div>
                  <div className="fld"><label>Email</label><input className="ctrl" type="email" defaultValue="henrique@atenvo.com" /></div>
                  <div className="fld"><label>Telefone</label><input className="ctrl" defaultValue="(51) 99900-1010" /></div>
                </div>
              </div>
              <div className="sc-foot"><button className="btn-ghost" onClick={() => toast('Alterações descartadas')}>Cancelar</button><button className="btn-primary" onClick={() => toast('Perfil salvo')}><IcCheck />Salvar alterações</button></div>
            </div>
            <div className="set-card">
              <div className="sc-head bordered"><h3>Empresa</h3><p>Dados da organização usados em documentos e relatórios.</p></div>
              <div className="sc-body">
                <div className="form-grid">
                  <div className="fld full"><label>Nome da empresa</label><input className="ctrl" defaultValue="Empresa Demonstração" /></div>
                  <div className="fld"><label>CNPJ</label><input className="ctrl" defaultValue="12.345.678/0001-90" /></div>
                  <div className="fld"><label>Fuso horário</label><select className="ctrl"><option>(GMT-03:00) Brasília</option><option>(GMT-04:00) Manaus</option><option>(GMT-02:00) Fernando de Noronha</option></select></div>
                  <div className="fld"><label>Idioma padrão</label><select className="ctrl"><option>Português (Brasil)</option><option>English (US)</option><option>Español</option></select></div>
                  <div className="fld"><label>Moeda</label><select className="ctrl"><option>Real (R$)</option><option>Dólar (US$)</option></select></div>
                </div>
              </div>
              <div className="sc-foot"><button className="btn-primary" onClick={() => toast('Dados da empresa salvos')}><IcCheck />Salvar alterações</button></div>
            </div>
          </section>

          {/* EQUIPE */}
          <section className={'tab-panel' + (tab === 'equipe' ? ' on' : '')} data-panel="equipe">
            <div className="set-card">
              <div className="sc-head bordered"><div className="row"><div className="grow"><h3>Membros da equipe</h3><p>Pessoas com acesso à plataforma e seus níveis de permissão.</p></div><button className="btn-primary" onClick={() => toast('Convidar novo membro')}><IcInvite />Convidar membro</button></div></div>
              <div className="team-scroll">
                <table className="team-table" aria-label="Membros da equipe">
                  <colgroup><col className="tc-membro" /><col className="tc-funcao" /><col className="tc-status" /><col className="tc-acesso" /><col className="tc-acoes" /></colgroup>
                  <thead><tr><th className="column-membro">Membro</th><th className="column-center">Função</th><th className="column-center">Status</th><th className="column-center">Último acesso</th><th className="column-center" aria-label="Ações"></th></tr></thead>
                  <tbody>
                    {TEAM.map((m, i) => (
                      <tr key={m.email}>
                        <td><div className="member-cell"><Av n={m.nome} /><div className="mt"><span className="nm">{m.nome}</span><span className="em">{m.email}</span></div></div></td>
                        <td className="column-center"><div className="cell-center"><FuncBadge f={m.func} /></div></td>
                        <td className="column-center"><div className="cell-center"><StBadge s={m.st} /></div></td>
                        <td className="column-center"><div className="cell-center"><span className="acesso">{m.ac}</span></div></td>
                        <td className="column-center"><div className="cell-center"><button type="button" className="row-menu" aria-label="Ações" onClick={(e) => openMenu(e, i)}><IcDots /></button></div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <footer className="tc-foot">
                <span className="ft">Mostrando 1 a 6 de 6 membros</span>
                <nav className="pager" aria-label="Paginação dos membros"><button type="button" className="pg nav" aria-label="Página anterior" onClick={() => toast('Página anterior')}><IcChevL /></button><button type="button" className="pg on" aria-current="page">1</button><button type="button" className="pg nav" aria-label="Próxima página" onClick={() => toast('Página seguinte')}><IcChevR /></button></nav>
                <div className="perpage"><label htmlFor="teamPer">Itens por página:</label><select id="teamPer" onChange={(e) => toast(e.target.value + ' itens por página')}><option value="10">10</option><option value="25">25</option></select></div>
              </footer>
            </div>
          </section>

          {/* CANAIS */}
          <section className={'tab-panel' + (tab === 'canais' ? ' on' : '')} data-panel="canais">
            <div className="set-card">
              <div className="sc-head bordered"><h3>WhatsApp</h3><p>Números conectados à plataforma via Atenvo.</p></div>
              {WA_REAL ? (
                (waCanais.data && waCanais.data.length > 0) ? (
                  waCanais.data.map((c) => (
                    <div className="chan-row" key={c.id}>
                      <span className="chan-ic wa"><IcWa /></span>
                      <div className="chan-txt"><div className="t">{c.alias}</div><div className="d">{c.numero ?? 'Sem número'}</div></div>
                      <div className="chan-act">
                        <span className={'badge ' + (WA_ST[c.status]?.cls || 'neutral')}>{WA_ST[c.status]?.dot && <span className="dot" />}{WA_ST[c.status]?.t || c.status}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="chan-row"><div className="chan-txt"><div className="d">Nenhum WhatsApp conectado ainda. Conecte um número em Integrações → Conector WhatsApp por QR Code.</div></div></div>
                )
              ) : (<>
                <div className="chan-row"><span className="chan-ic wa"><IcWa /></span><div className="chan-txt"><div className="t">Chip 1</div><div className="d">(11) 99955-1234</div></div><div className="chan-act"><span className="badge ok"><span className="dot" />Conectado</span><Switch on0 label="Chip 1" /></div></div>
                <div className="chan-row"><span className="chan-ic wa"><IcWa /></span><div className="chan-txt"><div className="t">Chip 2</div><div className="d">(11) 98888-5678</div></div><div className="chan-act"><span className="badge ok"><span className="dot" />Conectado</span><Switch on0 label="Chip 2" /></div></div>
                <div className="chan-row"><span className="chan-ic wa"><IcWa /></span><div className="chan-txt"><div className="t">URA</div><div className="d">(11) 97777-9012</div></div><div className="chan-act"><span className="badge warn">Reconexão necessária</span><button className="btn-sm acc" onClick={() => toast('Reconectando URA')}><IcReconnect />Reconectar</button></div></div>
              </>)}
            </div>
            <div className="set-card">
              <div className="sc-head bordered"><h3>Facebook</h3><p>Páginas e formulários integrados.</p></div>
              <div className="chan-row"><span className="chan-ic fb"><IcFb /></span><div className="chan-txt"><div className="t">Messenger</div><div className="d">Empresa Demonstração</div></div><div className="chan-act"><span className="badge ok"><span className="dot" />Conectado</span><Switch on0 label="Messenger" /></div></div>
              <div className="chan-row"><span className="chan-ic fb"><IcAds /></span><div className="chan-txt"><div className="t">Lead Ads</div><div className="d">Formulários de campanha</div></div><div className="chan-act"><span className="badge ok"><span className="dot" />Conectado</span><Switch on0 label="Lead Ads" /></div></div>
            </div>
          </section>

          {/* NOTIFICAÇÕES */}
          <section className={'tab-panel' + (tab === 'notif' ? ' on' : '')} data-panel="notif">
            <div className="set-card">
              <div className="sc-head"><h3>Notificações</h3><p>Escolha como e quando você quer ser avisado.</p></div>
              <div className="sc-sub">Por email</div>
              <div className="toggle-row"><div className="tr-txt"><div className="t">Novos contatos e leads</div><div className="d">Receba um email quando um novo contato entrar.</div></div><Switch on0 label="Novos contatos e leads" /></div>
              <div className="toggle-row"><div className="tr-txt"><div className="t">Mensagens recebidas</div><div className="d">Resumo de mensagens de clientes não respondidas.</div></div><Switch label="Mensagens recebidas" /></div>
              <div className="toggle-row"><div className="tr-txt"><div className="t">Cobranças vencendo</div><div className="d">Avisos de contratos e parcelas próximas do vencimento.</div></div><Switch on0 label="Cobranças vencendo" /></div>
              <div className="toggle-row"><div className="tr-txt"><div className="t">Resumo diário</div><div className="d">Um panorama do dia enviado todas as manhãs.</div></div><Switch on0 label="Resumo diário" /></div>
              <div className="sc-sub">No aplicativo</div>
              <div className="toggle-row"><div className="tr-txt"><div className="t">Notificações push</div><div className="d">Alertas em tempo real dentro da plataforma.</div></div><Switch on0 label="Notificações push" /></div>
              <div className="toggle-row"><div className="tr-txt"><div className="t">Som de notificação</div><div className="d">Toque sonoro ao receber um novo atendimento.</div></div><Switch on0 label="Som de notificação" /></div>
              <div className="toggle-row"><div className="tr-txt"><div className="t">Cliente aguardando atendimento</div><div className="d">Destaque quando alguém estiver esperando resposta.</div></div><Switch on0 label="Cliente aguardando atendimento" /></div>
              <div className="toggle-row"><div className="tr-txt"><div className="t">Novos membros na equipe</div><div className="d">Aviso quando alguém aceitar um convite.</div></div><Switch label="Novos membros na equipe" /></div>
            </div>
          </section>

          {/* PREFERÊNCIAS */}
          <section className={'tab-panel' + (tab === 'prefs' ? ' on' : '')} data-panel="prefs">
            <div className="set-card">
              <div className="sc-head"><h3>Preferências</h3><p>Personalize a aparência e o comportamento da plataforma.</p></div>
              <div className="pref-row">
                <div className="pr-txt"><div className="t">Tema</div><div className="d">Claro, escuro ou seguindo o sistema.</div></div>
                <div className="pref-seg">
                  <button className={seg === 'light' ? 'on' : ''} onClick={() => pickTheme('light')}><IcSun />Claro</button>
                  <button className={seg === 'dark' ? 'on' : ''} onClick={() => pickTheme('dark')}><IcMoon />Escuro</button>
                  <button className={seg === 'system' ? 'on' : ''} onClick={() => pickTheme('system')}>Sistema</button>
                </div>
              </div>
              <div className="pref-row"><div className="pr-txt"><div className="t">Idioma</div><div className="d">Idioma da interface.</div></div><div className="pr-ctrl"><select className="ctrl" onChange={(e) => toast('Preferência atualizada: ' + e.target.value)}><option>Português (Brasil)</option><option>English (US)</option><option>Español</option></select></div></div>
              <div className="pref-row"><div className="pr-txt"><div className="t">Formato de data</div><div className="d">Como as datas são exibidas.</div></div><div className="pr-ctrl"><select className="ctrl" onChange={(e) => toast('Preferência atualizada: ' + e.target.value)}><option>DD/MM/AAAA</option><option>MM/DD/AAAA</option><option>AAAA-MM-DD</option></select></div></div>
              <div className="pref-row"><div className="pr-txt"><div className="t">Densidade da interface</div><div className="d">Espaçamento das listas e tabelas.</div></div><div className="pr-ctrl"><select className="ctrl" onChange={(e) => toast('Preferência atualizada: ' + e.target.value)}><option>Confortável</option><option>Compacta</option></select></div></div>
              <div className="pref-row"><div className="pr-txt"><div className="t">Página inicial</div><div className="d">Tela exibida ao entrar na plataforma.</div></div><div className="pr-ctrl"><select className="ctrl" onChange={(e) => toast('Preferência atualizada: ' + e.target.value)}><option>Painel</option><option>WhatsApp</option><option>Kanban</option><option>Cobranças</option></select></div></div>
              <div className="toggle-row"><div className="tr-txt"><div className="t">Mostrar dicas e tutoriais</div><div className="d">Exibe sugestões contextuais pela interface.</div></div><Switch on0 label="Mostrar dicas e tutoriais" /></div>
              <div className="toggle-row"><div className="tr-txt"><div className="t">Reproduzir sons na interface</div><div className="d">Efeitos sonoros em ações e alertas.</div></div><Switch on0 label="Reproduzir sons na interface" /></div>
            </div>
          </section>
        </div>
      </div>

      {menu && (
        <div ref={menuRef} className="pop show" style={{ left: menu.left, top: menu.top }}>
          {MENU.map((m, i) => (
            <button key={m} className={'pop-item' + (i === 2 ? ' danger' : '')} onClick={() => { toast(m + ' · ' + TEAM[menu.idx].nome); setMenu(null); }}>
              {i === 0 ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg> : i === 1 ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4z" /></svg> : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></svg>}{m}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
