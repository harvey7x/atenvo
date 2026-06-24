import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { useToast } from '@/hooks/useToast';
import { initials, avatarColor } from '@/lib/avatar';
import { FB_CONTACTS, FB_QUICK, type FbContact } from '@/data/facebookDemo';
import { WA_REAL } from '@/data/whatsapp';
import './Facebook.css';

const IcMsg = () => <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.5 2 2 6.1 2 11.5c0 2.9 1.3 5.4 3.3 7.1V22l3-1.7c.8.2 1.7.3 2.7.3 5.5 0 10-4.1 10-9.6S17.5 2 12 2zm1 12.6-2.6-2.7-4.9 2.7 5.4-5.7 2.6 2.7 4.9-2.7-5.4 5.7z" /></svg>;
const IcFb = () => <svg viewBox="0 0 24 24" fill="currentColor"><path d="M22 12a10 10 0 1 0-11.6 9.9v-7H8v-2.9h2.4V9.8c0-2.4 1.4-3.7 3.6-3.7 1 0 2.1.2 2.1.2v2.3h-1.2c-1.2 0-1.5.7-1.5 1.4V12H16l-.4 2.9h-2.2v7A10 10 0 0 0 22 12z" /></svg>;
const IcAds = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z" /><path d="M16 9a3 3 0 0 1 0 6" /></svg>;
const IcChevDown = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>;
const IcDots = () => <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="12" cy="19" r="1.7" /></svg>;
const IcPerson = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></svg>;
const IcSearch = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3-3" /></svg>;
const IcFunnel = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 5h18l-7 8v6l-4-2v-4z" /></svg>;
const IcPaperclip = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5 12.5 20a5 5 0 0 1-7-7l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8" /></svg>;
const IcImage = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2.4" /><circle cx="8.5" cy="9.5" r="1.5" /><path d="m3 17 5-5 4 4 3-3 6 6" /></svg>;
const IcDoc = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></svg>;
const IcBolt = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2 3 14h7l-1 8 10-12h-7z" /></svg>;
const IcEmoji = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><path d="M9 9h.01M15 9h.01" /></svg>;
const IcSend = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4z" /></svg>;
const IcPlus = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>;
const IcEdit = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>;
const IcChevRight = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>;
const IcChevLeft = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>;

function Avatar({ name, cls }: { name: string; cls?: string }) {
  return <span className={'av' + (cls ? ' ' + cls : '')} style={{ background: avatarColor(name) }}>{initials(name)}</span>;
}

const TABS = [
  { id: 'todas', label: 'Todas' },
  { id: 'naoatrib', label: 'Não atribuídas' },
  { id: 'minhas', label: 'Minhas' },
  { id: 'pendentes', label: 'Pendentes' },
];

type PopKind = 'filter' | 'attach' | 'quick';
interface PopState { kind: PopKind; rect: DOMRect; align: 'left' | 'right'; }

export function Facebook() {
  const { toast } = useToast();
  const [contacts, setContacts] = useState<FbContact[]>(() => FB_CONTACTS.map((c) => ({ ...c, msgs: c.msgs.map((m) => ({ ...m })), tags: [...c.tags] })));
  const [currentId, setCurrentId] = useState('paula');
  const [tab, setTab] = useState('todas');
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [dataOpen, setDataOpen] = useState(() => (typeof window !== 'undefined' ? window.innerWidth >= 1200 : true));
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth < 1200 : false));
  const [pop, setPop] = useState<PopState | null>(null);
  const [popPos, setPopPos] = useState({ left: -9999, top: -9999 });

  const taRef = useRef<HTMLTextAreaElement>(null);
  const msgsRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const filterBtnRef = useRef<HTMLButtonElement>(null);
  const attachBtnRef = useRef<HTMLButtonElement>(null);
  const quickBtnRef = useRef<HTMLButtonElement>(null);

  const current = contacts.find((c) => c.id === currentId) ?? contacts[0];
  const filtered = contacts.filter((c) => {
    if (c.tabs.indexOf(tab) === -1) return false;
    const t = search.trim().toLowerCase();
    if (t && c.name.toLowerCase().indexOf(t) === -1 && c.last.toLowerCase().indexOf(t) === -1) return false;
    return true;
  });

  useEffect(() => { const ta = taRef.current; if (!ta) return; ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'; }, [draft]);
  useEffect(() => { if (msgsRef.current) msgsRef.current.scrollTop = msgsRef.current.scrollHeight; }, [currentId, current.msgs.length]);
  useEffect(() => {
    function onResize() { const mob = window.innerWidth < 1200; setIsMobile(mob); if (!mob) setDataOpen(true); }
    window.addEventListener('resize', onResize); return () => window.removeEventListener('resize', onResize);
  }, []);
  useLayoutEffect(() => {
    if (!pop || !popRef.current) return;
    const el = popRef.current; const pw = el.offsetWidth; const ph = el.offsetHeight; const r = pop.rect;
    let left = pop.align === 'right' ? r.right - pw : r.left;
    left = Math.max(10, Math.min(left, window.innerWidth - pw - 10));
    let top = r.top - ph - 8; if (top < 10) top = r.bottom + 8;
    setPopPos({ left, top });
  }, [pop]);
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (popRef.current?.contains(t)) return;
      if (filterBtnRef.current?.contains(t) || attachBtnRef.current?.contains(t) || quickBtnRef.current?.contains(t)) return;
      setPop(null);
    }
    function onResize() { setPop(null); }
    document.addEventListener('click', onDoc); window.addEventListener('resize', onResize);
    return () => { document.removeEventListener('click', onDoc); window.removeEventListener('resize', onResize); };
  }, []);

  function togglePop(kind: PopKind, ref: RefObject<HTMLButtonElement>, align: 'left' | 'right') {
    if (pop?.kind === kind) { setPop(null); return; }
    const el = ref.current; if (!el) return;
    setPopPos({ left: -9999, top: -9999 });
    setPop({ kind, rect: el.getBoundingClientRect(), align });
  }
  function selectContact(id: string) { setCurrentId(id); if (isMobile) setDataOpen(false); }
  function sendMsg() {
    const v = draft.trim(); if (!v) return;
    const now = new Date(); const hh = ('0' + now.getHours()).slice(-2) + ':' + ('0' + now.getMinutes()).slice(-2);
    setContacts((cur) => cur.map((c) => c.id === currentId ? { ...c, last: v.replace(/\n/g, ' '), msgs: [...c.msgs, { dir: 'out', text: v, time: hh }] } : c));
    setDraft(''); toast('Mensagem enviada');
  }
  function insertQuick(m: string, t: string) { setDraft(m); setPop(null); toast('Resposta inserida: ' + t); setTimeout(() => taRef.current?.focus(), 0); }

  const sendDisabled = draft.trim() === '';
  const cls = 'fb-app' + (!dataOpen && !isMobile ? ' data-collapsed' : '') + (dataOpen && isMobile ? ' drawer-open' : '');

  // Ambiente real: a integração de Messenger ainda não está conectada.
  if (WA_REAL) {
    return (
      <div className="fb-app" style={{ display: 'grid', placeItems: 'center' }}>
        <div style={{ textAlign: 'center', maxWidth: 440, padding: 24 }}>
          <div style={{ width: 56, height: 56, margin: '0 auto 14px', borderRadius: 999, background: 'rgba(59,89,152,.16)', color: '#5b7bd6', display: 'grid', placeItems: 'center' }}>
            <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor"><path d="M22 12a10 10 0 1 0-11.6 9.9v-7H8v-2.9h2.4V9.8c0-2.4 1.4-3.7 3.6-3.7 1 0 2.1.2 2.1.2v2.3h-1.2c-1.2 0-1.5.7-1.5 1.4V12H16l-.4 2.9h-2.2v7A10 10 0 0 0 22 12z" /></svg>
          </div>
          <h2 style={{ margin: '0 0 8px', color: 'var(--text, #e8eaed)' }}>Facebook não conectado</h2>
          <p style={{ margin: 0, color: 'var(--muted, #889)' }}>Conecte uma página do Facebook em <b>Integrações</b> para receber e responder mensagens do Messenger por aqui.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cls}>
      {/* LISTA */}
      <section className="col list-col">
        <div className="list-head">
          <div className="lh-top">
            <span className="fb-badge"><IcMsg /></span>
            <div><div className="lh-title">Facebook</div><div className="lh-sub">Central de Atendimento — Messenger</div></div>
          </div>
          <div className="search-row">
            <div className="search"><IcSearch /><input type="text" placeholder="Buscar conversas..." value={search} onChange={(e) => setSearch(e.target.value)} /></div>
            <button ref={filterBtnRef} className="filter-btn" aria-label="Filtros" onClick={(e) => { e.stopPropagation(); togglePop('filter', filterBtnRef, 'left'); }}><IcFunnel /></button>
          </div>
          <div className="tabs">
            {TABS.map((t) => <button key={t.id} className={'tab' + (tab === t.id ? ' active' : '')} onClick={() => setTab(t.id)}>{t.label}</button>)}
          </div>
        </div>
        <div className="conv-list">
          {filtered.length === 0 ? (
            <div style={{ padding: '30px 12px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Nenhuma conversa nesta aba.</div>
          ) : filtered.map((c) => (
            <div key={c.id} className={'conv' + (c.id === currentId ? ' active' : '')} onClick={() => selectContact(c.id)}>
              <Avatar name={c.name} />
              <div className="cbody">
                <div className="crow"><span className="cname">{c.name}</span><span className="ctime">{c.time}</span></div>
                <div className="csrc">{c.src === 'Lead Ads' ? <IcAds /> : <IcMsg />}{c.src}</div>
                <div className="cprev">{c.last}</div>
              </div>
              {c.unread > 0 && <span className="unread">{c.unread}</span>}
            </div>
          ))}
        </div>
        <div className="list-foot"><button onClick={() => toast('Mostrando todas as conversas')}>Ver todas as conversas</button></div>
      </section>

      {/* CHAT */}
      <section className="col chat-col">
        <header className="chat-head">
          <div className="ch-id"><Avatar name={current.name} /><div><div className="ch-name">{current.name}</div><div className="ch-phone">{current.phone}</div></div></div>
          <div className="ch-meta">
            <div className="meta-cell"><div className="k">Canal</div><span className="meta-val"><span className="fbic"><IcMsg /></span>Facebook Messenger</span></div>
            <div className="meta-cell"><div className="k">Página</div><span className="meta-val"><span className="fbic"><IcFb /></span>{current.page}</span></div>
            <div className="meta-cell"><div className="k">Responsável</div><span className="meta-val">{current.resp === 'Não atribuído' ? <span style={{ color: 'var(--muted)' }}>Não atribuído</span> : <><Avatar name={current.resp} cls="xs" />{current.resp}</>}</span></div>
            <div className="meta-cell"><div className="k">Status</div><button className="status-sel" onClick={() => toast('Status: ' + current.status)}>{current.status}<IcChevDown /></button></div>
          </div>
          <div className="ch-actions"><button className="icon-btn" title="Ações" onClick={() => toast('Mais ações da conversa')}><IcDots /></button></div>
        </header>
        <div className="messages" ref={msgsRef}>
          {current.msgs.map((m, i) => (
            <div key={i} className={'msg ' + m.dir}>
              <div className="bubble">{m.text}</div>
              <span className="btime">{m.time}{m.dir === 'out' && <span className="tick">✓✓</span>}</span>
            </div>
          ))}
          <div style={{ clear: 'both' }} />
        </div>
        <div className="composer">
          <div className="fb-reply-label">Responder no Messenger</div>
          <div className="input-wrap">
            <textarea ref={taRef} className="msg-input" rows={1} placeholder="Digite sua mensagem..." value={draft}
              onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); } }} />
            <div className="fb-tools">
              <button ref={attachBtnRef} className="fb-tool" onClick={(e) => { e.stopPropagation(); togglePop('attach', attachBtnRef, 'left'); }}><IcPaperclip /><span>Anexo</span></button>
              <button className="fb-tool" onClick={() => toast('Imagem')}><IcImage /><span>Imagem</span></button>
              <button className="fb-tool" onClick={() => toast('Documento')}><IcDoc /><span>Documento</span></button>
              <button ref={quickBtnRef} className="fb-tool" onClick={(e) => { e.stopPropagation(); togglePop('quick', quickBtnRef, 'right'); }}><IcBolt /><span>Resposta rápida</span></button>
              <button className="fb-tool" onClick={() => toast('Emoji')}><IcEmoji /><span>Emoji</span></button>
              <span className="spacer" />
              <button className="send-btn" aria-label="Enviar" disabled={sendDisabled} onClick={sendMsg}><IcSend /></button>
            </div>
          </div>
        </div>
      </section>

      {/* DADOS DO LEAD */}
      <aside className="col data-col">
        <div className="data-head"><h3>Dados do lead</h3><button className="collapse-btn" aria-label="Recolher painel" onClick={() => setDataOpen(false)}><IcChevRight /></button></div>
        <div className="data-body">
          <div className="dfield"><div className="dlabel">Nome</div><div className="dval">{current.name}</div></div>
          <div className="dfield"><div className="dlabel">Telefone</div><div className="dval">{current.phone}</div></div>
          <div className="dfield"><div className="dlabel">E-mail</div><div className="dval">{current.email}</div></div>
          <div className="dfield"><div className="dlabel">Perfil no Facebook</div><div className="dval with-ic"><IcFb />{current.profile}</div></div>
          <div className="dfield"><div className="dlabel">ID do Facebook</div><div className="dval">{current.fbid}</div></div>
          <div className="dfield"><div className="dlabel">Origem</div>{current.originLines.map((l, i) => i === 0 ? <div className="dval" key={i}>{l}</div> : <div className="dsub" key={i}>{l}</div>)}</div>
          <div className="dfield"><div className="dlabel">Etapa do funil</div><span className="badge-soft">{current.stage}</span></div>
          <div className="dfield"><div className="dlabel">Responsável</div><div className="resp-row">{current.resp === 'Não atribuído' ? <span className="dval" style={{ color: 'var(--muted)' }}>Não atribuído</span> : <span className="resp-line"><Avatar name={current.resp} cls="s" />{current.resp}</span>}<button className="edit-btn" title="Editar responsável" onClick={() => toast('Editar responsável')}><IcEdit /></button></div></div>
          <div className="dfield"><div className="dlabel">Etiquetas</div><div className="tags">{current.tags.map((t) => <span className="tag" key={t}>{t}</span>)}<button className="tag-add" onClick={() => toast('Adicionar etiqueta')}><IcPlus /></button></div></div>
          <div className="dfield"><div className="dlabel">Observações internas</div><div className="notes">{current.notes}</div></div>
          <div className="dfield"><div className="dlabel">Histórico</div>
            <div className="timeline">
              {current.history.map((h, i) => (
                <div className="tl-item" key={i}>
                  <span className="tl-ic" style={{ background: h.ic === 'person' ? '#7a5a86' : 'var(--fb)' }}>{h.ic === 'person' ? <IcPerson /> : <IcMsg />}</span>
                  <div className="tl-title">{h.title}</div><div className="tl-date">{h.date}</div>
                </div>
              ))}
            </div>
            <button className="hist-all" onClick={() => toast('Abrindo histórico do lead')}>Ver todo o histórico ({current.history.length + 1})</button>
          </div>
        </div>
      </aside>

      <button className="reopen" aria-label="Abrir painel de dados" onClick={() => setDataOpen(true)}><IcChevLeft /></button>
      <div className="drawer-overlay" onClick={() => setDataOpen(false)} />

      {pop && (
        <div ref={popRef} className={'pop' + (pop.kind === 'quick' ? ' pop-scripts' : '')} style={{ left: popPos.left, top: popPos.top }}>
          {pop.kind === 'filter' && (<>
            <div className="pop-head">Filtrar por origem</div>
            {['Messenger', 'Lead Ads'].map((s) => <button key={s} className="pop-item" onClick={() => { toast('Filtro: ' + s); setPop(null); }}>{s}</button>)}
            <div className="pop-head">Status</div>
            {['Em atendimento', 'Pendentes'].map((s) => <button key={s} className="pop-item" onClick={() => { toast('Filtro: ' + s); setPop(null); }}>{s}</button>)}
          </>)}
          {pop.kind === 'attach' && (<>
            <button className="pop-item" onClick={() => { toast('Anexar imagem'); setPop(null); }}><IcImage />Imagem</button>
            <button className="pop-item" onClick={() => { toast('Anexar documento'); setPop(null); }}><IcDoc />Documento</button>
            <button className="pop-item" onClick={() => { toast('Anexar arquivo'); setPop(null); }}><IcPaperclip />Arquivo</button>
          </>)}
          {pop.kind === 'quick' && (<>
            <div className="pop-head">Resposta rápida</div>
            {FB_QUICK.map((s) => <button key={s.t} className="pop-item" onClick={() => insertQuick(s.m, s.t)}><div><div>{s.t}</div><small>{s.m.slice(0, 52)}…</small></div></button>)}
          </>)}
        </div>
      )}
    </div>
  );
}
