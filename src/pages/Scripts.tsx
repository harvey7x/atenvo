import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { WA_REAL } from '@/data/whatsapp';
import { EmptyState } from '@/components/EmptyState';
import { useToast } from '@/hooks/useToast';
import './Scripts.css';

interface Script { id: number; title: string; cat: string; chans: string[]; fav: boolean; msg: string; }

const IcWa = () => <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a9.9 9.9 0 0 0-8.5 15l-1.3 4.8 4.9-1.3A9.9 9.9 0 1 0 12 2zm4.5 12c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.6.8-.8 1-.3.1-.6 0a6.7 6.7 0 0 1-2-1.2 7.4 7.4 0 0 1-1.3-1.7c-.2-.3 0-.4.1-.5l.4-.5.3-.4v-.4l-.9-2c-.2-.5-.4-.4-.6-.5h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.6 11.6 0 0 0 4.5 3.9c.6.3 1.1.4 1.5.5a3.6 3.6 0 0 0 1.6.1 2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .1-1.2c0-.1-.2-.2-.5-.3z" /></svg>;
const IcFb = () => <svg viewBox="0 0 24 24" fill="currentColor"><path d="M22 12a10 10 0 1 0-11.6 9.9v-7H8v-2.9h2.4V9.8c0-2.4 1.4-3.7 3.6-3.7 1 0 2.1.2 2.1.2v2.3h-1.2c-1.2 0-1.5.7-1.5 1.4V12H16l-.4 2.9h-2.2v7A10 10 0 0 0 22 12z" /></svg>;
const IcStarFill = () => <svg viewBox="0 0 24 24" fill="currentColor"><path d="m12 2 2.9 6.3 6.8.7-5.1 4.6 1.4 6.7L12 17.8 6 21l1.4-6.7L2.3 9.7l6.8-.7z" /></svg>;
const IcStarLine = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="m12 3 2.7 5.8 6.3.7-4.7 4.3 1.3 6.2L12 17.9 6.1 20l1.3-6.2-4.7-4.3 6.3-.7z" /></svg>;
const IcDoc = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M8.5 13h7M8.5 16.5h5" /></svg>;
const IcCopy = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h8" /></svg>;
const IcEdit = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>;
const IcSend = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4z" /></svg>;
const IcImg = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2.5" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></svg>;
const IcVideo = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="14" height="14" rx="2.5" /><path d="m22 8-6 4 6 4z" /></svg>;
const IcAudio = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>;
const IcFile = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></svg>;
const IcEmoji = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M8.5 14a4 4 0 0 0 7 0" /><path d="M9 9h.01M15 9h.01" /></svg>;
const IcBraces = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3c-2 0-3 1-3 3v3l-2 3 2 3v3c0 2 1 3 3 3M16 3c2 0 3 1 3 3v3l2 3-2 3v3c0 2-1 3-3 3" /></svg>;
const IcFormat = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7V5h13v2M9 5v14M7 19h4M16 11h4M18 11v8M16 19h4" /></svg>;
const IcCheck = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>;
const IcClose = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>;
const IcSave = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><path d="M17 21v-8H7v8M7 3v5h8" /></svg>;
const IcPlus = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>;
const IcSearch = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3-3" /></svg>;
const IcFunnel = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 5h18l-7 8v6l-4 2v-8z" /></svg>;
const IcChevDown = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>;
const IcChevL = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>;
const IcChevR = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>;

const CATEGORIES = [
  { id: 'boas', name: 'Boas-vindas', cnt: 4 }, { id: 'qual', name: 'Qualificação', cnt: 4 },
  { id: 'analise', name: 'Análise de contrato', cnt: 4 }, { id: 'juros', name: 'Juros abusivos', cnt: 4 },
  { id: 'proposta', name: 'Proposta e acordo', cnt: 4 }, { id: 'doc', name: 'Documentação', cnt: 4 },
  { id: 'enc', name: 'Encerramento', cnt: 3 },
];
const INIT_SCRIPTS: Script[] = [
  { id: 1, title: 'Boas-vindas ao cliente', cat: 'boas', chans: ['wa', 'fb'], fav: true, msg: 'Olá {{nome_cliente}}, tudo bem? 👋\n\nSou {{seu_nome}}, especialista da {{empresa}}, e será um prazer ajudar a analisar seu contrato e identificar possíveis juros abusivos.\n\nNosso objetivo é garantir os seus direitos e buscar a melhor solução para o seu caso.\n\nPodemos começar?' },
  { id: 2, title: 'Qualificação inicial', cat: 'qual', chans: ['wa', 'fb'], fav: false, msg: 'Para entender melhor o seu caso e verificar como podemos te ajudar, preciso de algumas informações rápidas.\n\nVocê pode me confirmar seu nome completo e em qual banco possui o contrato, {{nome_cliente}}?' },
  { id: 3, title: 'Análise de contrato', cat: 'analise', chans: ['wa'], fav: false, msg: 'Perfeito, {{nome_cliente}}. Vamos iniciar a análise do seu contrato para identificar possíveis juros abusivos e cobranças indevidas.\n\nAssim que concluirmos, te trago um retorno detalhado.' },
  { id: 4, title: 'Juros abusivos identificados', cat: 'juros', chans: ['wa', 'fb'], fav: true, msg: 'Após a análise, identificamos indícios de juros abusivos no seu contrato, o que pode gerar devolução de valores.\n\nVou te explicar os próximos passos para buscar os seus direitos, {{nome_cliente}}.' },
  { id: 5, title: 'Proposta de acordo', cat: 'proposta', chans: ['wa'], fav: false, msg: 'Com base na análise, podemos propor um acordo para reduzir seu saldo devedor e quitar o contrato.\n\nQuer que eu te envie as condições agora, {{nome_cliente}}?' },
];
const CHAN_FILTERS = [{ id: 'wa', name: 'WhatsApp', ic: <IcWa />, cnt: 21 }, { id: 'fb', name: 'Facebook', ic: <IcFb />, cnt: 8 }];
const TYPE_FILTERS = [{ id: 'texto', name: 'Texto', cnt: 27 }, { id: 'midia', name: 'Mídia', cnt: 12 }, { id: 'doc', name: 'Documento', cnt: 6 }];
const VARS = ['{{nome_cliente}}', '{{seu_nome}}', '{{empresa}}', '{{data_atual}}'];
const SORTS = ['Mais recentes', 'Mais usados', 'Ordem alfabética'];
const MEDIA = [{ t: 'Imagem', ic: <IcImg /> }, { t: 'Vídeo', ic: <IcVideo /> }, { t: 'Áudio', ic: <IcAudio /> }, { t: 'Documento', ic: <IcFile /> }];

function ChBadge({ c }: { c: string }) { return <span className={'ch ' + c}>{c === 'wa' ? <IcWa /> : <IcFb />}{c === 'wa' ? 'WhatsApp' : 'Facebook'}</span>; }

let seq = 100;

export function Scripts() {
  const { toast } = useToast();
  const [scripts, setScripts] = useState<Script[]>(INIT_SCRIPTS);
  const [cat, setCat] = useState('all');
  const [search, setSearch] = useState('');
  const [chans, setChans] = useState({ wa: false, fb: false });
  const [favOnly, setFavOnly] = useState(false);
  const [currentId, setCurrentId] = useState(1);
  const [isNew, setIsNew] = useState(false);
  const [newChans, setNewChans] = useState({ wa: true, fb: false });
  const [newDraft, setNewDraft] = useState({ title: '', msg: '' });
  const [sortVal, setSortVal] = useState('Mais recentes');
  const [sortOpen, setSortOpen] = useState(false);
  const [sortPos, setSortPos] = useState({ left: -9999, top: -9999 });
  const [editorOpen, setEditorOpen] = useState(() => (typeof window !== 'undefined' ? window.innerWidth >= 1700 : true));
  const [catsOpen, setCatsOpen] = useState(() => (typeof window !== 'undefined' ? window.innerWidth >= 1024 : true));
  const [w, setW] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1920));
  const msgRef = useRef<HTMLTextAreaElement>(null);
  const sortBtnRef = useRef<HTMLButtonElement>(null);
  const sortRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onResize() { const x = window.innerWidth; setW(x); if (x >= 1700) setEditorOpen(true); if (x >= 1024) setCatsOpen(true); }
    window.addEventListener('resize', onResize); return () => window.removeEventListener('resize', onResize);
  }, []);
  useLayoutEffect(() => {
    if (!sortOpen || !sortRef.current || !sortBtnRef.current) return;
    const r = sortBtnRef.current.getBoundingClientRect(); const pw = sortRef.current.offsetWidth;
    setSortPos({ left: Math.min(r.left, window.innerWidth - pw - 10), top: r.bottom + 6 });
  }, [sortOpen]);
  useEffect(() => {
    function onDoc(e: MouseEvent) { if (sortRef.current?.contains(e.target as Node) || sortBtnRef.current?.contains(e.target as Node)) return; setSortOpen(false); }
    document.addEventListener('click', onDoc); return () => document.removeEventListener('click', onDoc);
  }, []);

  const current = scripts.find((s) => s.id === currentId) || scripts[0];
  const total = CATEGORIES.reduce((a, c) => a + c.cnt, 0);
  const isDefault = cat === 'all' && !search && !chans.wa && !chans.fb && !favOnly;
  const list = scripts.filter((s) => {
    if (cat !== 'all' && s.cat !== cat) return false;
    if (favOnly && !s.fav) return false;
    if (chans.wa && s.chans.indexOf('wa') < 0) return false;
    if (chans.fb && s.chans.indexOf('fb') < 0) return false;
    if (search) { const t = search.toLowerCase(); if (s.title.toLowerCase().indexOf(t) < 0 && s.msg.toLowerCase().indexOf(t) < 0) return false; }
    return true;
  });

  const edDrawer = w < 1700, catsDrawer = w < 1024;
  const rootCls = 'scripts-page' + (edDrawer && editorOpen ? ' editor-open' : '') + (catsDrawer && catsOpen ? ' cats-open' : '') + ((edDrawer && editorOpen) || (catsDrawer && catsOpen) ? ' has-drawer' : '');

  function toggleFav(id: number) { setScripts((c) => c.map((s) => s.id === id ? { ...s, fav: !s.fav } : s)); const s = scripts.find((x) => x.id === id); toast(s && !s.fav ? 'Adicionado aos favoritos' : 'Removido dos favoritos'); }
  function loadScript(id: number) { setCurrentId(id); setIsNew(false); if (w < 1700) setEditorOpen(true); }
  function updateCurrent(patch: Partial<Script>) { setScripts((c) => c.map((s) => s.id === currentId ? { ...s, ...patch } : s)); }
  function insertVar(text: string) {
    if (isNew) { const ta = msgRef.current; if (!ta) { setNewDraft((d) => ({ ...d, msg: d.msg + text })); return; } const s = ta.selectionStart, e = ta.selectionEnd; const v = newDraft.msg.slice(0, s) + text + newDraft.msg.slice(e); setNewDraft((d) => ({ ...d, msg: v })); setTimeout(() => { ta.focus(); ta.setSelectionRange(s + text.length, s + text.length); }, 0); return; }
    const ta = msgRef.current; if (!ta) { updateCurrent({ msg: current.msg + text }); return; }
    const s = ta.selectionStart, e = ta.selectionEnd; const v = current.msg.slice(0, s) + text + current.msg.slice(e);
    updateCurrent({ msg: v }); setTimeout(() => { ta.focus(); ta.setSelectionRange(s + text.length, s + text.length); }, 0);
  }
  function createScript() {
    const title = newDraft.title.trim() || 'Novo script';
    const ch: string[] = []; if (newChans.wa) ch.push('wa'); if (newChans.fb) ch.push('fb'); if (!ch.length) ch.push('wa');
    const id = ++seq; const c = cat !== 'all' ? cat : 'boas';
    setScripts((cur) => [{ id, title, cat: c, chans: ch, fav: false, msg: newDraft.msg }, ...cur]);
    setIsNew(false); setCurrentId(id); setNewChans({ wa: true, fb: false }); setNewDraft({ title: '', msg: '' });
    toast('Script criado');
  }
  function startNew() { setIsNew(true); setNewDraft({ title: '', msg: '' }); setNewChans({ wa: true, fb: false }); if (w < 1700) setEditorOpen(true); toast('Novo script'); }

  const edTitle = isNew ? newDraft.title : current.title;
  const edMsg = isNew ? newDraft.msg : current.msg;
  const catName = (id: string) => CATEGORIES.find((c) => c.id === id)?.name || '';

  if (WA_REAL) return (
    <EmptyState
      icon={<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></svg>}
      title="Nenhum script ainda"
      text="Aqui ficam as respostas prontas da sua equipe para agilizar o atendimento. Você ainda não cadastrou nenhuma."
    />
  );

  return (
    <div className={rootCls}>
      <div className="topbar">
        <div className="tb-left"><div className="page-title">Biblioteca de Scripts e Mídias</div><div className="page-sub">Crie, organize e reutilize mensagens e conteúdos para padronizar o atendimento e acelerar resultados.</div></div>
        <div className="tb-right">
          <div className="tb-actions">
            <div className="search"><IcSearch /><input type="text" placeholder="Buscar scripts e mídias..." value={search} onChange={(e) => setSearch(e.target.value)} /></div>
            <button className="filter-btn" title="Filtros" onClick={() => { if (w < 1024) setCatsOpen(true); else toast('Filtros'); }}><IcFunnel /></button>
            <button className="btn-new" onClick={startNew}><IcPlus />Novo script</button>
          </div>
        </div>
      </div>

      <div className="layout">
        {/* categorias + filtros */}
        <aside className="panel panel-cats">
          <div className="cats-head"><h3>Categorias</h3><button className="mini-add" title="Nova categoria" onClick={() => toast('Nova categoria')}><IcPlus /></button></div>
          <div>
            <button className={'cat' + (cat === 'all' ? ' active' : '')} onClick={() => { setCat('all'); if (w < 1024) setCatsOpen(false); }}><span style={{ width: 17 }} />Todas as categorias<span className="cnt">{total}</span></button>
            {CATEGORIES.map((c) => <button key={c.id} className={'cat' + (cat === c.id ? ' active' : '')} onClick={() => { setCat(c.id); if (w < 1024) setCatsOpen(false); }}><IcDoc />{c.name}<span className="cnt">{c.cnt}</span></button>)}
          </div>
          <div className="cats-sep" />
          <div className="filt-group"><p className="filt-title">Canais</p>
            <div>{CHAN_FILTERS.map((f) => <label key={f.id} className={'filt' + (chans[f.id as 'wa' | 'fb'] ? ' on' : '')} onClick={() => setChans((c) => ({ ...c, [f.id]: !c[f.id as 'wa' | 'fb'] }))}><span className="box"><IcCheck /></span><span className="fic">{f.ic}</span><span>{f.name}</span><span className="cnt">{f.cnt}</span></label>)}</div>
          </div>
          <div className="filt-group"><p className="filt-title">Tipo de conteúdo</p>
            <div>{TYPE_FILTERS.map((f) => <label key={f.id} className="filt" onClick={(e) => { e.currentTarget.classList.toggle('on'); toast('Filtro de tipo: ' + f.name); }}><span className="box"><IcCheck /></span><span>{f.name}</span><span className="cnt">{f.cnt}</span></label>)}</div>
          </div>
          <div className="filt-group"><p className="filt-title">Favoritos</p>
            <label className={'filt' + (favOnly ? ' on' : '')} onClick={() => setFavOnly((v) => !v)}><span className="box"><IcCheck /></span><span>Apenas favoritos</span><span className="cnt">7</span></label>
          </div>
        </aside>

        {/* lista */}
        <section className="panel panel-list">
          <div className="list-head">
            <button className="cats-toggle" onClick={() => setCatsOpen((v) => !v)}><IcFunnel />Filtros</button>
            <span className="list-count">{isDefault ? '27 scripts encontrados' : (list.length + (list.length === 1 ? ' script encontrado' : ' scripts encontrados'))}</span>
            <div className="sort"><span>Ordenar por:</span><button ref={sortBtnRef} className="sort-btn" onClick={(e) => { e.stopPropagation(); setSortOpen((v) => !v); }}><span>{sortVal}</span><IcChevDown /></button></div>
          </div>
          <div className="list-body">
            {list.map((s) => {
              const on = s.id === currentId && !isNew;
              return (
                <div key={s.id} className={'scard' + (on ? ' active' : '')} role="option" aria-selected={on} onClick={() => loadScript(s.id)}>
                  <div className="sc-top"><div className="sc-title">{s.title}</div><button className={'star' + (s.fav ? ' on' : '')} aria-label="Favoritar" onClick={(e) => { e.stopPropagation(); toggleFav(s.id); }}>{s.fav ? <IcStarFill /> : <IcStarLine />}</button></div>
                  <div className="sc-chans">{s.chans.map((c) => <ChBadge key={c} c={c} />)}</div>
                  <div className="sc-prev">{s.msg.replace(/\n+/g, ' ')}</div>
                </div>
              );
            })}
          </div>
          <div className="list-foot">
            <span className="foot-txt">{isDefault ? 'Exibindo 1 a 5 de 27 scripts' : ('Exibindo ' + list.length + (list.length === 1 ? ' resultado' : ' resultados'))}</span>
            <div className="pager" style={{ visibility: isDefault ? 'visible' : 'hidden' }}>
              <button className="pg nav"><IcChevL /></button>
              {[1, 2, 3, 4, 5].map((n) => <button key={n} className={'pg' + (n === 1 ? ' on' : '')} onClick={() => toast('Página ' + n)}>{n}</button>)}
              <button className="pg nav"><IcChevR /></button>
            </div>
          </div>
        </section>

        {/* editor */}
        <aside className="panel panel-editor">
          {isNew ? <div className="ed-crumb"><span className="cur">Novo script</span></div>
            : <div className="ed-crumb"><span>{catName(current.cat) || 'Script'}</span><span className="sep">›</span><span className="cur">{current.title || 'Sem título'}</span></div>}
          {isNew ? (
            <div className="ed-actions"><button className="ed-btn" onClick={() => { setIsNew(false); toast('Criação cancelada'); }}><IcClose />Cancelar</button><button className="ed-btn" onClick={() => toast('Rascunho salvo')}><IcSave />Salvar rascunho</button><button className="ed-btn primary" onClick={createScript}><IcPlus />Criar script</button></div>
          ) : (
            <div className="ed-actions"><button className="ed-btn fav" onClick={() => toggleFav(current.id)}>{current.fav ? <IcStarFill /> : <IcStarLine />}Favoritar</button><button className="ed-btn" onClick={() => toast('Script duplicado')}><IcCopy />Duplicar</button><button className="ed-btn" onClick={() => { document.getElementById('edTitle')?.focus(); toast('Editando script'); }}><IcEdit />Editar</button><button className="ed-btn primary" onClick={() => toast('Script aplicado no atendimento')}><IcSend />Usar script</button></div>
          )}
          {isNew ? (
            <div className="ed-chans"><button className={'ed-chan-toggle wa' + (newChans.wa ? ' sel' : '')} onClick={() => setNewChans((c) => ({ ...c, wa: !c.wa }))}><IcWa />WhatsApp</button><button className={'ed-chan-toggle fb' + (newChans.fb ? ' sel' : '')} onClick={() => setNewChans((c) => ({ ...c, fb: !c.fb }))}><IcFb />Facebook</button></div>
          ) : (
            <div className="ed-chans">{current.chans.length ? current.chans.map((c) => <ChBadge key={c} c={c} />) : <span className="ed-sub" style={{ margin: 0 }}>Sem canais definidos</span>}</div>
          )}
          <p className="ed-label">Título do script</p>
          <input id="edTitle" className="ed-input" type="text" placeholder="Dê um nome ao script" value={edTitle} onChange={(e) => isNew ? setNewDraft((d) => ({ ...d, title: e.target.value })) : updateCurrent({ title: e.target.value })} />
          <p className="ed-label">Mensagem</p>
          <div className="ed-msg-wrap">
            <textarea ref={msgRef} className="ed-msg" placeholder="Escreva a mensagem do script. Use variáveis como {{nome_cliente}}." value={edMsg} onChange={(e) => isNew ? setNewDraft((d) => ({ ...d, msg: e.target.value })) : updateCurrent({ msg: e.target.value })} />
            <div className="ed-toolbar">
              <button className="tool" title="Emoji" onClick={() => insertVar('👋')}><IcEmoji /></button>
              <button className="tool" title="Variável" onClick={() => insertVar('{{nome_cliente}}')}><IcBraces /></button>
              <button className="tool" title="Formatação" onClick={() => toast('Formatação de texto')}><IcFormat /></button>
              <span className="ed-count">{edMsg.length} caracteres</span>
            </div>
          </div>
          <p className="ed-label" style={{ marginBottom: 5 }}>Mídias e anexos</p>
          <p className="ed-sub">Adicione mídias ou documentos que complementam este script.</p>
          <div className="media-grid">{MEDIA.map((m) => <button key={m.t} className="media-btn" onClick={() => toast('Anexar ' + m.t)}>{m.ic}{m.t}</button>)}</div>
          <div className="vars-head"><div className="vars-row1"><h4>Variáveis disponíveis</h4><button className="all" onClick={() => toast('Ver todas as variáveis')}>Ver todas</button></div><div className="vars-hint">Clique para adicionar ao texto</div></div>
          <div className="vars">{VARS.map((v) => <button key={v} className="vchip" onClick={() => insertVar(v)}>{v}</button>)}</div>
          {!isNew && <div className="ed-foot"><span className="who"><span className="av s" style={{ background: '#3f6f52' }}>H</span>Criado por Henrique · Há 2 dias</span><span className="right">Última atualização por Henrique · Há 1 dia</span></div>}
        </aside>
      </div>

      <button className="reopen" aria-label="Abrir editor" onClick={() => setEditorOpen(true)}><IcChevL /></button>
      <div className="drawer-overlay" onClick={() => { setEditorOpen(false); setCatsOpen(false); }} />

      {sortOpen && (
        <div ref={sortRef} className="pop show" style={{ left: sortPos.left, top: sortPos.top }}>
          {SORTS.map((o) => <button key={o} className={'pop-item' + (o === sortVal ? ' sel' : '')} onClick={() => { setSortVal(o); setSortOpen(false); toast('Ordenado por: ' + o); }}>{o}<span className="ck"><IcCheck /></span></button>)}
        </div>
      )}
    </div>
  );
}
