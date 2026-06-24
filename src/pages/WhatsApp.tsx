import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { useToast } from '@/hooks/useToast';
import { WA_CONTACTS, WA_SCRIPTS, initials, avatarColor, type WaContact } from '@/data/whatsappDemo';
import { useWaConversations, useSendWaMessage, WA_REAL } from '@/data/whatsapp';
import './WhatsApp.css';

/** Conversa vazia (placeholder) para quando ainda não há conversas reais carregadas. */
const EMPTY_CONTACT: WaContact = {
  id: '', name: 'Nenhuma conversa', phone: '', chip: '', time: '', unread: 0, tabs: [],
  status: '', last: '', email: '', stage: '', resp: 'Não atribuído', origin: '', tags: [],
  lastInter: '', notes: '', doc: null, msgs: [],
};

/* ---------- ícones (inline, idênticos ao protótipo) ---------- */
const IcWa = () => <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a9.9 9.9 0 0 0-8.5 15l-1.3 4.8 4.9-1.3A9.9 9.9 0 1 0 12 2zm4.5 12c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.6.8-.8 1-.3.1-.6 0a6.7 6.7 0 0 1-2-1.2 7.4 7.4 0 0 1-1.3-1.7c-.2-.3 0-.4.1-.5l.4-.5.3-.4v-.4l-.9-2c-.2-.5-.4-.4-.6-.5h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.6 11.6 0 0 0 4.5 3.9c.6.3 1.1.4 1.5.5a3.6 3.6 0 0 0 1.6.1 2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .1-1.2c0-.1-.2-.2-.5-.3z" /></svg>;
const IcChip = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="4" y="4" width="16" height="16" rx="3" /><rect x="9" y="9" width="6" height="6" rx="1" /><path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2" /></svg>;
const IcClock = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;
const IcChevDown = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>;
const IcDots = () => <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="12" cy="19" r="1.7" /></svg>;
const IcSearch = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3-3" /></svg>;
const IcFunnel = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 5h18l-7 8v6l-4-2v-4z" /></svg>;
const IcPaperclip = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5 12.5 20a5 5 0 0 1-7-7l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8" /></svg>;
const IcMic = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>;
const IcImage = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2.4" /><circle cx="8.5" cy="9.5" r="1.5" /><path d="m3 17 5-5 4 4 3-3 6 6" /></svg>;
const IcDoc = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></svg>;
const IcEmoji = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><path d="M9 9h.01M15 9h.01" /></svg>;
const IcScripts = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></svg>;
const IcSend = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4z" /></svg>;
const IcWarn = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg>;
const IcChevRight = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>;
const IcChevLeft = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>;
const IcDownload = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12M7 11l5 4 5-4M5 21h14" /></svg>;
const IcPlus = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>;
const IcCaret = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14 }}><path d="m6 9 6 6 6-6" /></svg>;

function Avatar({ name, cls }: { name: string; cls?: string }) {
  return <span className={'av' + (cls ? ' ' + cls : '')} style={{ background: avatarColor(name) }}>{initials(name)}</span>;
}

const TABS: { id: string; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'meus', label: 'Meus' },
  { id: 'naoatrib', label: 'Não atribuídos' },
  { id: 'pendentes', label: 'Pendentes' },
];

type PopKind = 'filter' | 'attach' | 'scripts';
interface PopState { kind: PopKind; rect: DOMRect; align: 'left' | 'right'; }

export function WhatsApp() {
  const { toast } = useToast();
  const live = useWaConversations();
  const sendMut = useSendWaMessage();
  const [contacts, setContacts] = useState<WaContact[]>(() => WA_REAL ? [] : WA_CONTACTS.map((c) => ({ ...c, msgs: c.msgs.map((m) => ({ ...m })), tags: [...c.tags] })));
  const [currentId, setCurrentId] = useState(WA_REAL ? '' : 'antonio');
  const [tab, setTab] = useState('todos');
  const [search, setSearch] = useState('');
  const [replyChip, setReplyChip] = useState('Chip 1');
  const [draft, setDraft] = useState('');
  const [dataOpen, setDataOpen] = useState(() => (typeof window !== 'undefined' ? window.innerWidth >= 1200 : true));
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth < 1200 : false));
  const [pop, setPop] = useState<PopState | null>(null);
  const [popPos, setPopPos] = useState<{ left: number; top: number }>({ left: -9999, top: -9999 });

  // modo real: sincroniza a lista vinda do Supabase e mantém uma seleção válida
  useEffect(() => {
    if (WA_REAL && live.data) {
      setContacts(live.data);
      setCurrentId((id) => (id && live.data!.some((c) => c.id === id)) ? id : (live.data![0]?.id ?? ''));
    }
  }, [live.data]);

  const taRef = useRef<HTMLTextAreaElement>(null);
  const msgsRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const filterBtnRef = useRef<HTMLButtonElement>(null);
  const attachBtnRef = useRef<HTMLButtonElement>(null);
  const scriptsBtnRef = useRef<HTMLButtonElement>(null);

  const current = contacts.find((c) => c.id === currentId) ?? contacts[0] ?? EMPTY_CONTACT;
  const filtered = contacts.filter((c) => {
    if (c.tabs.indexOf(tab) === -1) return false;
    const t = search.trim().toLowerCase();
    if (t && c.name.toLowerCase().indexOf(t) === -1 && c.last.toLowerCase().indexOf(t) === -1) return false;
    return true;
  });

  /* autosize textarea */
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
  }, [draft]);

  /* rolar mensagens para o fim */
  useEffect(() => {
    if (msgsRef.current) msgsRef.current.scrollTop = msgsRef.current.scrollHeight;
  }, [currentId, current.msgs.length]);

  /* responsivo: estado coerente do painel de dados */
  useEffect(() => {
    function onResize() {
      const mob = window.innerWidth < 1200;
      setIsMobile(mob);
      if (!mob) setDataOpen(true);
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  /* posicionar popover (mede após render, como o protótipo) */
  useLayoutEffect(() => {
    if (!pop || !popRef.current) return;
    const el = popRef.current;
    const pw = el.offsetWidth;
    const ph = el.offsetHeight;
    const r = pop.rect;
    let left = pop.align === 'right' ? r.right - pw : r.left;
    left = Math.max(10, Math.min(left, window.innerWidth - pw - 10));
    let top = r.top - ph - 8;
    if (top < 10) top = r.bottom + 8;
    setPopPos({ left, top });
  }, [pop]);

  /* fechar popover ao clicar fora / redimensionar */
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (popRef.current?.contains(t)) return;
      if (filterBtnRef.current?.contains(t) || attachBtnRef.current?.contains(t) || scriptsBtnRef.current?.contains(t)) return;
      setPop(null);
    }
    function onResize() { setPop(null); }
    document.addEventListener('click', onDoc);
    window.addEventListener('resize', onResize);
    return () => { document.removeEventListener('click', onDoc); window.removeEventListener('resize', onResize); };
  }, []);

  function togglePop(kind: PopKind, ref: RefObject<HTMLButtonElement>, align: 'left' | 'right') {
    if (pop?.kind === kind) { setPop(null); return; }
    const el = ref.current;
    if (!el) return;
    setPopPos({ left: -9999, top: -9999 });
    setPop({ kind, rect: el.getBoundingClientRect(), align });
  }

  function selectContact(id: string) {
    setCurrentId(id);
    if (isMobile) setDataOpen(false);
  }

  function sendMsg() {
    const v = draft.trim();
    if (!v) return;
    if (WA_REAL && !currentId) return;
    const now = new Date();
    const hh = ('0' + now.getHours()).slice(-2) + ':' + ('0' + now.getMinutes()).slice(-2);
    // append otimista (atualiza a tela imediatamente)
    setContacts((cur) => cur.map((c) => c.id === currentId ? { ...c, last: v, msgs: [...c.msgs, { dir: 'out', text: v, time: hh }] } : c));
    setDraft('');
    if (WA_REAL) {
      sendMut.mutate({ conversaId: currentId, text: v }, { onError: (e) => toast((e as Error).message || 'Falha ao enviar a mensagem') });
    } else {
      toast('Mensagem enviada');
    }
  }

  function onReplyChip(chip: string) {
    const prev = replyChip;
    setReplyChip(chip);
    if (prev !== chip && chip !== 'Chip 1') toast('Atenção: ' + chip + ' pode iniciar uma nova conversa', 'warn');
    else toast('Respondendo por ' + chip);
  }

  function insertScript(m: string, t: string) {
    setDraft(m);
    setPop(null);
    toast('Script inserido: ' + t);
    setTimeout(() => taRef.current?.focus(), 0);
  }

  const sendDisabled = draft.trim() === '' || (WA_REAL && !current.id);
  const waClass = 'wa-app' + (!dataOpen && !isMobile ? ' data-collapsed' : '') + (dataOpen && isMobile ? ' drawer-open' : '');

  return (
    <div className={waClass}>
      {/* ---------- LISTA ---------- */}
      <section className="col list-col">
        <div className="list-head">
          <div className="lh-top">
            <span className="wa-badge"><IcWa /></span>
            <div><div className="lh-title">WhatsApp</div><div className="lh-sub">Central de Atendimento</div></div>
          </div>
          <div className="search-row">
            <div className="search">
              <IcSearch />
              <input type="text" placeholder="Buscar conversas..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <button ref={filterBtnRef} className="filter-btn" aria-label="Filtros" onClick={(e) => { e.stopPropagation(); togglePop('filter', filterBtnRef, 'left'); }}><IcFunnel /></button>
          </div>
          <div className="tabs">
            {TABS.map((t) => (
              <button key={t.id} className={'tab' + (tab === t.id ? ' active' : '')} onClick={() => setTab(t.id)}>{t.label}</button>
            ))}
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
                <div className="cchip"><IcChip />{c.chip}</div>
                <div className="cprev">{c.last}</div>
              </div>
              {c.unread > 0 && <span className="unread">{c.unread}</span>}
            </div>
          ))}
        </div>
        <div className="list-foot"><button onClick={() => toast('Mostrando todas as conversas')}>Ver todas as conversas</button></div>
      </section>

      {/* ---------- CHAT ---------- */}
      <section className="col chat-col">
        <header className="chat-head">
          <div className="ch-id">
            <Avatar name={current.name} />
            <div><div className="ch-name">{current.name}</div><div className="ch-phone">{current.phone}</div></div>
          </div>
          <div className="ch-meta">
            <div className="meta-cell"><div className="k">Canal</div><span className="meta-val"><span style={{ color: 'var(--wa)', display: 'inline-flex' }}><IcWa /></span>WhatsApp</span></div>
            <div className="meta-cell"><div className="k">Origem</div><span className="meta-val chip-tag"><IcChip />{current.chip}</span></div>
            <div className="meta-cell"><div className="k">Responsável</div><span className="meta-val">{current.resp === 'Não atribuído' ? <span style={{ color: 'var(--muted)' }}>Não atribuído</span> : <><Avatar name={current.resp} cls="xs" />{current.resp}</>}</span></div>
            <div className="meta-cell"><div className="k">Status</div><button className="status-sel" onClick={() => toast('Status: ' + current.status)}>{current.status}<IcChevDown /></button></div>
          </div>
          <div className="ch-actions"><button className="icon-btn" title="Ações" onClick={() => toast('Mais ações da conversa')}><IcDots /></button></div>
        </header>

        <div className="messages" ref={msgsRef}>
          {current.msgs.map((m, i) => (
            <div key={i} className={'msg ' + m.dir}>
              {m.pdf ? (
                <>
                  <div className="pdf-card"><span className="pdf-ic">PDF</span><div className="pdf-info"><div className="pdf-name">{m.pdf.name}</div><div className="pdf-meta">{m.pdf.meta}</div></div></div>
                  <span className="btime">{m.time}</span>
                </>
              ) : (
                <>
                  <div className="bubble">{m.text}</div>
                  <span className="btime">{m.time}{m.dir === 'out' && <span className="tick">✓✓</span>}</span>
                </>
              )}
            </div>
          ))}
          <div style={{ clear: 'both' }} />
        </div>

        <div className="composer">
          <div className="reply-row">
            <span className="rl">Responder por:</span>
            <button className={'chip-btn' + (replyChip === 'Chip 1' ? ' active' : '')} onClick={() => onReplyChip('Chip 1')}>Chip 1</button><span className="chip-div">|</span>
            <button className={'chip-btn' + (replyChip === 'Chip 2' ? ' active' : '')} onClick={() => onReplyChip('Chip 2')}>Chip 2</button><span className="chip-div">|</span>
            <button className={'chip-btn' + (replyChip === 'Chip 3' ? ' active' : '')} onClick={() => onReplyChip('Chip 3')}>Chip 3</button>
          </div>
          <div className="warn"><IcWarn />Atenção: responder por outro chip pode gerar uma nova conversa.</div>
          <div className="input-wrap">
            <textarea ref={taRef} className="msg-input" rows={1} placeholder="Digite sua mensagem..."
              value={draft} onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); } }} />
            <div className="composer-bar">
              <button ref={attachBtnRef} className="tool" title="Anexar arquivo" onClick={(e) => { e.stopPropagation(); togglePop('attach', attachBtnRef, 'left'); }}><IcPaperclip /></button>
              <button className="tool" title="Áudio" onClick={() => toast('Áudio')}><IcMic /></button>
              <button className="tool" title="Imagem" onClick={() => toast('Imagem')}><IcImage /></button>
              <button className="tool" title="Documento" onClick={() => toast('Documento')}><IcDoc /></button>
              <button className="tool" title="Emoji" onClick={() => toast('Emoji')}><IcEmoji /></button>
              <span className="spacer" />
              <button ref={scriptsBtnRef} className="scripts-btn" onClick={(e) => { e.stopPropagation(); togglePop('scripts', scriptsBtnRef, 'right'); }}><IcScripts />Scripts<IcCaret /></button>
              <button className="send-btn" aria-label="Enviar" disabled={sendDisabled} onClick={sendMsg}><IcSend /></button>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- DADOS DO CLIENTE ---------- */}
      <aside className="col data-col">
        <div className="data-head">
          <h3>Dados do cliente</h3>
          <button className="collapse-btn" aria-label="Recolher painel" onClick={() => setDataOpen(false)}><IcChevRight /></button>
        </div>
        <div className="data-body">
          <div className="dfield"><div className="dlabel">Nome</div><div className="dval">{current.name}</div></div>
          <div className="dfield"><div className="dlabel">Telefone</div><div className="dval with-ic"><IcWa />{current.phone}</div></div>
          <div className="dfield"><div className="dlabel">E-mail</div><div className="dval">{current.email}</div></div>
          <div className="dfield"><div className="dlabel">Etapa do funil</div><span className="badge-soft">{current.stage}</span></div>
          <div className="dfield"><div className="dlabel">Responsável</div>{current.resp === 'Não atribuído' ? <div className="dval" style={{ color: 'var(--muted)' }}>Não atribuído</div> : <span className="resp-line"><Avatar name={current.resp} cls="s" />{current.resp}</span>}</div>
          <div className="dfield"><div className="dlabel">Origem do lead</div><div className="dval with-ic"><IcWa />{current.origin}</div></div>
          <div className="dfield"><div className="dlabel">Etiquetas</div><div className="tags">{current.tags.map((t) => <span className="tag" key={t}>{t}</span>)}<button className="tag-add" onClick={() => toast('Adicionar etiqueta')}><IcPlus /></button></div></div>
          <div className="dfield"><div className="dlabel">Última interação</div><div className="dval with-ic"><span style={{ color: 'var(--muted)' }}><IcClock /></span>{current.lastInter}</div></div>
          <div className="dfield"><div className="dlabel">Observações internas</div><div className="notes">{current.notes}</div></div>
          <div className="dfield">
            <div className="dlabel">Documentos</div>
            {current.doc ? (
              <>
                <div className="doc-card"><span className="pdf-ic">PDF</span><div className="pdf-info"><div className="pdf-name">{current.doc.name}</div><div className="pdf-meta">{current.doc.meta}</div></div><button className="doc-dl" title="Baixar" onClick={() => toast('Baixando ' + current.doc!.name)}><IcDownload /></button></div>
                <button className="doc-all" onClick={() => toast('Abrindo documentos do cliente')}>Ver todos os documentos (1)</button>
              </>
            ) : (
              <div className="pdf-meta" style={{ color: 'var(--muted)', fontSize: 13 }}>Nenhum documento anexado.</div>
            )}
          </div>
        </div>
      </aside>

      <button className="reopen" aria-label="Abrir painel de dados" onClick={() => setDataOpen(true)}><IcChevLeft /></button>
      <div className="drawer-overlay" onClick={() => setDataOpen(false)} />

      {/* ---------- POPOVERS ---------- */}
      {pop && (
        <div ref={popRef} className={'pop' + (pop.kind === 'scripts' ? ' pop-scripts' : '')} style={{ left: popPos.left, top: popPos.top }}>
          {pop.kind === 'filter' && (
            <>
              <div className="pop-head">Filtrar por chip</div>
              {['Chip 1', 'Chip 2', 'Chip 3'].map((c) => <button key={c} className="pop-item" onClick={() => { toast('Filtro: ' + c); setPop(null); }}>{c}</button>)}
              <div className="pop-head">Status</div>
              {['Em atendimento', 'Pendentes'].map((s) => <button key={s} className="pop-item" onClick={() => { toast('Filtro: ' + s); setPop(null); }}>{s}</button>)}
            </>
          )}
          {pop.kind === 'attach' && (
            <>
              <button className="pop-item" onClick={() => { toast('Anexar imagem'); setPop(null); }}><IcImage />Imagem</button>
              <button className="pop-item" onClick={() => { toast('Anexar documento'); setPop(null); }}><IcDoc />Documento</button>
              <button className="pop-item" onClick={() => { toast('Gravar áudio'); setPop(null); }}><IcMic />Áudio</button>
            </>
          )}
          {pop.kind === 'scripts' && (
            <>
              <div className="pop-head">Inserir script</div>
              {WA_SCRIPTS.map((s) => (
                <button key={s.t} className="pop-item" onClick={() => insertScript(s.m, s.t)}>
                  <div><div>{s.t}</div><small>{s.m.slice(0, 46)}…</small></div>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
