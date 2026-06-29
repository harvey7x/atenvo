import { useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '@/hooks/useToast';
import { useAuth } from '@/context/AuthContext';
import { useOrg } from '@/context/OrgContext';
import { EmptyState } from '@/components/EmptyState';
import { Modal } from '@/components/Modal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import {
  SCRIPTS_REAL, useScripts, useScriptCategorias, useScriptMutations, useScriptCategoriaMutations,
  useScriptEtapaMutations, fetchEtapas, urlAssinadaAnexo, formatarTamanho, substituirVariaveis, SCRIPT_VARIAVEIS,
  type Script, type EtapaItem, type EtapaTipo,
} from '@/data/scripts';
import './Scripts.css';

const IcWa = () => <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a9.9 9.9 0 0 0-8.5 15l-1.3 4.8 4.9-1.3A9.9 9.9 0 1 0 12 2z" /></svg>;
const IcFb = () => <svg viewBox="0 0 24 24" fill="currentColor"><path d="M22 12a10 10 0 1 0-11.6 9.9v-7H8v-2.9h2.4V9.8c0-2.4 1.4-3.7 3.6-3.7 1 0 2.1.2 2.1.2v2.3h-1.2c-1.2 0-1.5.7-1.5 1.4V12H16l-.4 2.9h-2.2v7A10 10 0 0 0 22 12z" /></svg>;
const IcStarFill = () => <svg viewBox="0 0 24 24" fill="currentColor"><path d="m12 2 2.9 6.3 6.8.7-5.1 4.6 1.4 6.7L12 17.8 6 21l1.4-6.7L2.3 9.7l6.8-.7z" /></svg>;
const IcStarLine = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="m12 3 2.7 5.8 6.3.7-4.7 4.3 1.3 6.2L12 17.9 6.1 20l1.3-6.2-4.7-4.3 6.3-.7z" /></svg>;
const IcDoc = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M8.5 13h7M8.5 16.5h5" /></svg>;
const IcCopy = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h8" /></svg>;
const IcTrash = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></svg>;
const IcCheck = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>;
const IcPencil = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>;
const IcPlus = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>;
const IcSearch = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3-3" /></svg>;
const IcChevL = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>;
const IcUp = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 15 6-6 6 6" /></svg>;
const IcDown = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>;
const IcText = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7V5h16v2M9 5v14M7 19h10" /></svg>;
const IcImg = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2.5" /><circle cx="8.5" cy="8.5" r="1.6" /><path d="m21 15-5-5L5 21" /></svg>;
const IcAudio = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>;
const IcVideo = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="14" height="14" rx="2.5" /><path d="m22 8-6 4 6 4z" /></svg>;
const IcFileMedia = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></svg>;
const TIPO_LABEL: Record<EtapaTipo, string> = { texto: 'Texto', imagem: 'Imagem', audio: 'Áudio', video: 'Vídeo', documento: 'Documento' };
const ACCEPT: Record<EtapaTipo, string> = { texto: '', imagem: 'image/*', audio: 'audio/*', video: 'video/*', documento: '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv' };

function ChBadge({ c }: { c: string }) {
  const wa = c === 'whatsapp';
  return <span className={'ch ' + (wa ? 'wa' : 'fb')}>{wa ? <IcWa /> : <IcFb />}{wa ? 'WhatsApp' : 'Facebook'}</span>;
}

const VAZIO: Script = { id: '', titulo: '', descricao: null, conteudo: '', categoriaId: null, canais: [], favorito: false, ativo: true, tags: [], autorId: null, criadoEm: '', atualizadoEm: '' };

type CanalFiltro = 'todos' | 'whatsapp' | 'facebook' | 'ambos';
function classificaCanal(canais: string[]): 'whatsapp' | 'facebook' | 'ambos' {
  const wa = canais.includes('whatsapp'); const fb = canais.includes('facebook');
  if ((wa && fb) || canais.length === 0) return 'ambos';
  return wa ? 'whatsapp' : 'facebook';
}
type Step = EtapaItem & { previewUrl?: string };
const HORA_FAKE = '09:41';

export function Scripts() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { currentOrg } = useOrg();
  const scriptsQ = useScripts();
  const catsQ = useScriptCategorias();
  const mut = useScriptMutations();
  const catMut = useScriptCategoriaMutations();
  const etapaMut = useScriptEtapaMutations();

  const [cat, setCat] = useState('all');
  const [searchRaw, setSearchRaw] = useState('');
  const [search, setSearch] = useState('');
  const [canalFiltro, setCanalFiltro] = useState<CanalFiltro>('todos');
  const [favOnly, setFavOnly] = useState(false);
  const [currentId, setCurrentId] = useState('');
  const [editorOpen, setEditorOpen] = useState(() => (typeof window !== 'undefined' ? window.innerWidth >= 1700 : true));
  const [w, setW] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1920));
  const edDrawer = w < 1700;

  // categoria modal
  const [catModal, setCatModal] = useState(false);
  const [catNome, setCatNome] = useState('');
  const [catErr, setCatErr] = useState<string | null>(null);
  const [catSaving, setCatSaving] = useState(false);
  // confirmacao
  const [confirmState, setConfirmState] = useState<{ title: string; message: string; run: () => Promise<void> } | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  // ---- Construtor (criar/editar) ----
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [cfg, setCfg] = useState({ titulo: '', descricao: '', wa: true, fb: false, categoriaId: '', tags: '', favorito: false, ativo: true });
  const [etapas, setEtapas] = useState<Step[]>([{ tipo: 'texto', conteudo: '' }]);
  const [previewCanal, setPreviewCanal] = useState<'whatsapp' | 'facebook'>('whatsapp');
  const msgRefs = useRef<(HTMLTextAreaElement | null)[]>([]);
  const activeMsg = useRef(0);
  const fileRefs = useRef<(HTMLInputElement | null)[]>([]);

  function pedirConfirmacao(title: string, message: string, run: () => Promise<void>) { setConfirmState({ title, message, run }); }
  async function executarConfirm() {
    if (!confirmState) return;
    setConfirmLoading(true);
    try { await confirmState.run(); setConfirmState(null); }
    catch (e) { toast((e as Error).message || 'Falha', 'warn'); }
    finally { setConfirmLoading(false); }
  }

  useEffect(() => { const t = setTimeout(() => setSearch(searchRaw.trim().toLowerCase()), 250); return () => clearTimeout(t); }, [searchRaw]);
  useEffect(() => { function onR() { const x = window.innerWidth; setW(x); if (x >= 1700) setEditorOpen(true); } window.addEventListener('resize', onR); return () => window.removeEventListener('resize', onR); }, []);

  const scripts = useMemo(() => scriptsQ.data ?? [], [scriptsQ.data]);
  const cats = catsQ.data ?? [];
  const catName = (id: string | null) => cats.find((c) => c.id === id)?.nome ?? '';

  const list = useMemo(() => scripts.filter((s) => {
    if (cat !== 'all' && s.categoriaId !== cat) return false;
    if (favOnly && !s.favorito) return false;
    if (canalFiltro !== 'todos' && classificaCanal(s.canais) !== canalFiltro) return false;
    if (search && s.titulo.toLowerCase().indexOf(search) < 0 && s.conteudo.toLowerCase().indexOf(search) < 0) return false;
    return true;
  }), [scripts, cat, favOnly, canalFiltro, search]);

  const canalContagem = useMemo(() => {
    const c: Record<CanalFiltro, number> = { todos: scripts.length, whatsapp: 0, facebook: 0, ambos: 0 };
    for (const s of scripts) c[classificaCanal(s.canais)]++;
    return c;
  }, [scripts]);

  useEffect(() => {
    if (currentId && scripts.some((s) => s.id === currentId)) return;
    setCurrentId(list[0]?.id ?? scripts[0]?.id ?? '');
  }, [scripts, list, currentId]);
  const current = scripts.find((s) => s.id === currentId) ?? VAZIO;

  // contexto para preview (dados demonstrativos)
  const previewCtx = { cliente: 'Maria Silva', atendente: (user?.name || '').trim() || 'Atendente', emailAtendente: user?.email, empresa: currentOrg.name || 'Empresa', telefone: '(11) 99999-9999' };

  /* ---------- abertura do construtor ---------- */
  function prefillCanal(): { wa: boolean; fb: boolean } {
    const c = canalFiltro;
    return { wa: c === 'whatsapp' || c === 'ambos' || c === 'todos', fb: c === 'facebook' || c === 'ambos' };
  }
  function openCreateScript() {
    const { wa, fb } = prefillCanal();
    setEditId(null);
    setCfg({ titulo: '', descricao: '', wa, fb, categoriaId: cat !== 'all' ? cat : '', tags: '', favorito: false, ativo: true });
    setEtapas([{ tipo: 'texto', conteudo: '' }]);
    setPreviewCanal(wa ? 'whatsapp' : 'facebook');
    setErrs({}); msgRefs.current = []; activeMsg.current = 0; setFormOpen(true);
  }
  async function openEditScript(s: Script) {
    setEditId(s.id);
    setCfg({ titulo: s.titulo, descricao: s.descricao ?? '', wa: s.canais.includes('whatsapp'), fb: s.canais.includes('facebook'), categoriaId: s.categoriaId ?? '', tags: s.tags.join(', '), favorito: s.favorito, ativo: s.ativo });
    setEtapas([{ tipo: 'texto', conteudo: s.conteudo || '' }]); // provisório enquanto carrega
    setPreviewCanal(s.canais.includes('whatsapp') || s.canais.length === 0 ? 'whatsapp' : 'facebook');
    setErrs({}); msgRefs.current = []; activeMsg.current = 0; setFormOpen(true);
    try {
      const lista = await fetchEtapas(s.id);
      const steps: Step[] = lista.length ? lista.map((e) => ({ ...e })) : [{ tipo: 'texto', conteudo: s.conteudo || '' }];
      // URLs assinadas para mídias existentes (preview)
      await Promise.all(steps.map(async (st) => { if (st.tipo !== 'texto' && st.storagePath) { st.previewUrl = (await urlAssinadaAnexo(st.storagePath)) ?? undefined; } }));
      setEtapas(steps);
    } catch { /* mantém o fallback */ }
  }

  /* ---------- operações de etapas ---------- */
  function setStepConteudo(i: number, conteudo: string) { setEtapas((m) => m.map((x, j) => j === i ? { ...x, conteudo } : x)); }
  function addStep(tipo: EtapaTipo) { setEtapas((m) => [...m, { tipo, conteudo: '' }]); }
  function dupStep(i: number) { setEtapas((m) => { const n = [...m]; n.splice(i + 1, 0, { ...m[i], id: undefined }); return n; }); }
  function delStep(i: number) { setEtapas((m) => m.length <= 1 ? m : m.filter((_, j) => j !== i)); }
  function moveStep(i: number, dir: -1 | 1) {
    setEtapas((m) => { const j = i + dir; if (j < 0 || j >= m.length) return m; const n = [...m]; [n[i], n[j]] = [n[j], n[i]]; return n; });
  }
  function setStepFile(i: number, file: File | null) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setEtapas((m) => m.map((x, j) => j === i ? { ...x, file, nome: file.name, mime: file.type, tamanho: file.size, storagePath: undefined, previewUrl: url } : x));
  }
  function insertVar(text: string) {
    const i = activeMsg.current;
    if (etapas[i]?.tipo !== 'texto') return; // só em etapas de texto
    const ta = msgRefs.current[i];
    if (!ta) { setStepConteudo(i, (etapas[i]?.conteudo ?? '') + text); return; }
    const s = ta.selectionStart, e = ta.selectionEnd;
    const atual = etapas[i]?.conteudo ?? '';
    setStepConteudo(i, atual.slice(0, s) + text + atual.slice(e));
    setTimeout(() => { ta.focus(); ta.setSelectionRange(s + text.length, s + text.length); }, 0);
  }

  /* ---------- salvar ---------- */
  async function salvar() {
    if (saving) return;
    const canais: string[] = []; if (cfg.wa) canais.push('whatsapp'); if (cfg.fb) canais.push('facebook');
    const e: Record<string, string> = {};
    if (!cfg.titulo.trim()) e.titulo = 'Título é obrigatório.';
    if (canais.length === 0) e.canal = 'Selecione ao menos um canal.';
    const cheia = (s: Step) => s.tipo === 'texto' ? s.conteudo.trim().length > 0 : (!!s.file || !!s.storagePath);
    const naoVazias = etapas.filter(cheia);
    if (naoVazias.length === 0) e.etapas = 'Inclua ao menos uma mensagem com conteúdo.';
    etapas.forEach((s, i) => { if (!cheia(s)) e['st_' + i] = s.tipo === 'texto' ? 'Mensagem vazia.' : 'Selecione um arquivo.'; });
    if (Object.keys(e).length) { setErrs(e); return; }
    setSaving(true); setErrs({});
    try {
      const tags = cfg.tags.split(',').map((t) => t.trim()).filter(Boolean);
      const primeiroTexto = etapas.find((s) => s.tipo === 'texto')?.conteudo ?? '';
      let scriptId = editId;
      if (editId) {
        await mut.atualizar.mutateAsync({ id: editId, patch: { titulo: cfg.titulo.trim(), descricao: cfg.descricao.trim() || null, conteudo: primeiroTexto, canais_permitidos: canais, categoria_id: cfg.categoriaId || null, tags, favorito: cfg.favorito, ativo: cfg.ativo } });
      } else {
        const r = await mut.criar.mutateAsync({ titulo: cfg.titulo, conteudo: primeiroTexto, canais, categoriaId: cfg.categoriaId || null, descricao: cfg.descricao.trim() || null, tags, favorito: cfg.favorito, ativo: cfg.ativo });
        scriptId = r.id;
      }
      await etapaMut.salvarEtapas.mutateAsync({ scriptId: scriptId!, etapas });
      setFormOpen(false); setCurrentId(scriptId!); toast(editId ? 'Script salvo' : 'Script criado');
    } catch (err) { setErrs({ geral: (err as Error).message || 'Falha ao salvar' }); }
    finally { setSaving(false); }
  }

  async function favoritar(s: Script) { try { await mut.favoritar.mutateAsync({ id: s.id, favorito: !s.favorito }); } catch (er) { toast((er as Error).message || 'Falha', 'warn'); } }
  async function duplicar(s: Script) {
    try {
      const lista = await fetchEtapas(s.id);
      const r = await mut.criar.mutateAsync({ titulo: s.titulo + ' (cópia)', conteudo: s.conteudo, canais: s.canais, categoriaId: s.categoriaId, descricao: s.descricao, tags: s.tags, favorito: false, ativo: s.ativo });
      const soTexto: EtapaItem[] = lista.filter((x) => x.tipo === 'texto').map((x) => ({ tipo: 'texto', conteudo: x.conteudo }));
      const finais = soTexto.length ? soTexto : [{ tipo: 'texto' as EtapaTipo, conteudo: s.conteudo || '' }];
      await etapaMut.salvarEtapas.mutateAsync({ scriptId: r.id, etapas: finais });
      setCurrentId(r.id); toast(lista.some((x) => x.tipo !== 'texto') ? 'Script duplicado (mídias não copiadas)' : 'Script duplicado');
    } catch (er) { toast((er as Error).message || 'Falha', 'warn'); }
  }
  function excluir(s: Script) {
    pedirConfirmacao('Excluir script', `Excluir "${s.titulo || 'Sem título'}"? Esta ação não pode ser desfeita.`, async () => {
      await mut.excluir.mutateAsync(s.id); if (currentId === s.id) setCurrentId(''); toast('Script excluído');
    });
  }
  function copiar(s: Script) { try { navigator.clipboard?.writeText(s.conteudo); toast('Texto copiado'); } catch { toast('Não foi possível copiar', 'warn'); } }

  function novaCategoria() { setCatNome(''); setCatErr(null); setCatModal(true); }
  async function salvarCategoria() {
    const nome = catNome.trim();
    if (!nome) { setCatErr('Informe um nome.'); return; }
    if (cats.some((c) => c.nome.trim().toLowerCase() === nome.toLowerCase())) { setCatErr('Já existe uma categoria com esse nome.'); return; }
    setCatSaving(true); setCatErr(null);
    try { await catMut.criar.mutateAsync(nome); toast('Categoria criada'); setCatModal(false); }
    catch (e) { setCatErr((e as Error).message || 'Falha ao criar'); }
    finally { setCatSaving(false); }
  }

  // estado vazio contextual
  function textoVazio(): string {
    if (scripts.length === 0) return 'Nenhum script ainda.';
    if (search) return 'Nenhum resultado para a busca.';
    if (favOnly) return 'Nenhum favorito neste filtro.';
    if (canalFiltro === 'whatsapp') return 'Nenhum script exclusivo de WhatsApp.';
    if (canalFiltro === 'facebook') return 'Nenhum script exclusivo de Facebook.';
    if (canalFiltro === 'ambos') return 'Nenhum script para ambos os canais.';
    if (cat !== 'all') return 'Nenhum script nesta categoria.';
    return 'Nenhum script neste filtro.';
  }

  if (!SCRIPTS_REAL) {
    return <EmptyState icon={<IcDoc />} title="Backend não configurado" text="A biblioteca de scripts requer o backend Supabase configurado." />;
  }

  const mostrarTogglePreview = cfg.wa && cfg.fb;
  const canalPreview = mostrarTogglePreview ? previewCanal : (cfg.wa ? 'whatsapp' : 'facebook');

  return (
    <div className={'scripts-page' + (edDrawer && editorOpen ? ' editor-open has-drawer' : '')}>
      <div className="topbar">
        <div className="tb-left"><div className="page-title">Biblioteca de Scripts</div><div className="page-sub">Crie, organize e reutilize sequências de mensagens.</div></div>
        <div className="tb-right"><div className="tb-actions">
          <div className="search"><IcSearch /><input type="text" placeholder="Buscar scripts..." value={searchRaw} onChange={(e) => setSearchRaw(e.target.value)} /></div>
          <button className="btn-new" onClick={openCreateScript}><IcPlus />Novo script</button>
        </div></div>
      </div>

      <div className="layout">
        <aside className="panel panel-cats">
          <div className="cats-head"><h3>Categorias</h3><button className="mini-add" title="Nova categoria" onClick={novaCategoria}><IcPlus /></button></div>
          <div>
            <button className={'cat' + (cat === 'all' ? ' active' : '')} onClick={() => setCat('all')}><span style={{ width: 17 }} />Todas as categorias<span className="cnt">{scripts.length}</span></button>
            {cats.map((c) => <button key={c.id} className={'cat' + (cat === c.id ? ' active' : '')} onClick={() => setCat(c.id)}><IcDoc />{c.nome}<span className="cnt">{scripts.filter((s) => s.categoriaId === c.id).length}</span></button>)}
          </div>
          <div className="cats-sep" />
          <div className="filt-group"><p className="filt-title">Canal</p>
            {([['todos', 'Todos'], ['whatsapp', 'WhatsApp'], ['facebook', 'Facebook'], ['ambos', 'Ambos']] as [CanalFiltro, string][]).map(([id, label]) => (
              <label key={id} className={'filt' + (canalFiltro === id ? ' on' : '')} onClick={() => setCanalFiltro(id)}>
                <span className="box"><IcCheck /></span>{(id === 'whatsapp' || id === 'ambos') && <span className="fic"><IcWa /></span>}{(id === 'facebook' || id === 'ambos') && <span className="fic"><IcFb /></span>}<span>{label}</span><span className="cnt">{canalContagem[id]}</span>
              </label>
            ))}
          </div>
          <div className="filt-group"><p className="filt-title">Favoritos</p>
            <label className={'filt' + (favOnly ? ' on' : '')} onClick={() => setFavOnly((v) => !v)}><span className="box"><IcCheck /></span><span>Apenas favoritos</span></label>
          </div>
        </aside>

        <section className="panel panel-list">
          <div className="list-head"><span className="list-count">{scriptsQ.isLoading ? 'Carregando…' : `${list.length} ${list.length === 1 ? 'script' : 'scripts'}`}</span></div>
          <div className="list-body">
            {scriptsQ.isError && <div style={{ padding: 20, color: 'var(--muted)' }}>Erro ao carregar scripts.</div>}
            {!scriptsQ.isLoading && !scriptsQ.isError && list.length === 0 && (
              <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--muted)' }}>
                <p style={{ margin: '0 0 12px' }}>{textoVazio()}</p>
                <button className="btn-new" onClick={openCreateScript}><IcPlus />{scripts.length === 0 ? 'Criar primeiro script' : 'Novo script'}</button>
              </div>
            )}
            {list.map((s) => {
              const on = s.id === currentId;
              return (
                <div key={s.id} className={'scard' + (on ? ' active' : '')} role="option" aria-selected={on} onClick={() => { setCurrentId(s.id); if (edDrawer) setEditorOpen(true); }}>
                  <div className="sc-top"><div className="sc-title">{s.titulo || 'Sem título'}</div><button className={'star' + (s.favorito ? ' on' : '')} aria-label="Favoritar" onClick={(e) => { e.stopPropagation(); favoritar(s); }}>{s.favorito ? <IcStarFill /> : <IcStarLine />}</button></div>
                  <div className="sc-chans">{(s.canais.length ? s.canais : ['whatsapp', 'facebook']).map((c) => <ChBadge key={c} c={c} />)}</div>
                  <div className="sc-prev">{s.conteudo.replace(/\n+/g, ' ') || '—'}</div>
                </div>
              );
            })}
          </div>
        </section>

        <aside className="panel panel-editor">
          {current.id ? (
            <>
              <div className="ed-crumb"><span>{catName(current.categoriaId) || 'Script'}</span>{current.titulo && <><span className="sep">›</span><span className="cur">{current.titulo}</span></>}</div>
              <div className="ed-actions">
                <button className="ed-btn primary" onClick={() => openEditScript(current)}><IcPencil />Editar</button>
                <button className="ed-btn fav" onClick={() => favoritar(current)}>{current.favorito ? <IcStarFill /> : <IcStarLine />}Favoritar</button>
                <button className="ed-btn" onClick={() => duplicar(current)}><IcCopy />Duplicar</button>
                <button className="ed-btn" onClick={() => copiar(current)}><IcCopy />Copiar</button>
                <button className="ed-btn" onClick={() => excluir(current)}><IcTrash />Excluir</button>
              </div>
              <div className="ed-chans">{(current.canais.length ? current.canais : ['whatsapp', 'facebook']).map((c) => <ChBadge key={c} c={c} />)}</div>
              {current.descricao && <p className="ed-sub">{current.descricao}</p>}
              <p className="ed-label">Conteúdo da primeira mensagem</p>
              <div className="sc-prev" style={{ whiteSpace: 'pre-wrap' }}>{current.conteudo || '—'}</div>
              <p className="ed-sub" style={{ marginTop: 10 }}>Use “Editar” para ver e alterar toda a sequência de mensagens.</p>
            </>
          ) : (
            <div style={{ padding: 24, color: 'var(--muted)', textAlign: 'center' }}>Selecione um script à esquerda ou crie um novo.</div>
          )}
        </aside>
      </div>

      <button className="reopen" aria-label="Abrir painel" style={{ display: edDrawer && !editorOpen ? 'inline-flex' : 'none' }} onClick={() => setEditorOpen(true)}><IcChevL /></button>
      <div className="drawer-overlay" onClick={() => setEditorOpen(false)} />

      {/* ---------- Modal de categoria ---------- */}
      <Modal open={catModal} onClose={() => !catSaving && setCatModal(false)} title="Nova categoria" width={400}
        footer={<>
          <button className="atv-btn" disabled={catSaving} onClick={() => setCatModal(false)}>Cancelar</button>
          <button className="atv-btn primary" disabled={catSaving} onClick={salvarCategoria}>{catSaving ? 'Criando…' : 'Criar'}</button>
        </>}>
        <div className="atv-field">
          <label htmlFor="cat-nome">Nome</label>
          <input id="cat-nome" className="atv-input" value={catNome} placeholder="Ex.: Boas-vindas"
            onChange={(e) => { setCatNome(e.target.value); setCatErr(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter') salvarCategoria(); }} />
          {catErr && <div className="atv-field-err">{catErr}</div>}
        </div>
      </Modal>

      {/* ---------- Construtor de script (criar/editar) ---------- */}
      <Modal open={formOpen} onClose={() => { if (!saving) setFormOpen(false); }} title={editId ? 'Editar script' : 'Novo script'} width={860}
        footer={<>
          <button className="atv-btn" disabled={saving} onClick={() => setFormOpen(false)}>Cancelar</button>
          <button className="atv-btn primary" disabled={saving} onClick={salvar}>{saving ? 'Salvando…' : (editId ? 'Salvar' : 'Criar script')}</button>
        </>}>
        {errs.geral && <div className="atv-field-err" style={{ marginBottom: 10 }}>{errs.geral}</div>}
        <div className="builder">
          {/* Configuração */}
          <div className="builder-cfg">
            <div className="atv-field">
              <label>Título *</label>
              <input className="atv-input" value={cfg.titulo} onChange={(e) => setCfg((f) => ({ ...f, titulo: e.target.value }))} placeholder="Nome do script" />
              {errs.titulo && <div className="atv-field-err">{errs.titulo}</div>}
            </div>
            <div className="atv-field">
              <label>Descrição</label>
              <input className="atv-input" value={cfg.descricao} onChange={(e) => setCfg((f) => ({ ...f, descricao: e.target.value }))} placeholder="Opcional" />
            </div>
            <div className="atv-field">
              <label>Categoria</label>
              <select className="atv-select" value={cfg.categoriaId} onChange={(e) => setCfg((f) => ({ ...f, categoriaId: e.target.value }))}>
                <option value="">Sem categoria</option>
                {cats.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
            <div className="atv-field">
              <label>Canal *</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className={'ed-chan-toggle wa' + (cfg.wa ? ' sel' : '')} onClick={() => setCfg((f) => ({ ...f, wa: !f.wa }))}><IcWa />WhatsApp</button>
                <button type="button" className={'ed-chan-toggle fb' + (cfg.fb ? ' sel' : '')} onClick={() => setCfg((f) => ({ ...f, fb: !f.fb }))}><IcFb />Facebook</button>
              </div>
              {errs.canal && <div className="atv-field-err">{errs.canal}</div>}
            </div>
            <div className="atv-field">
              <label>Tags</label>
              <input className="atv-input" value={cfg.tags} onChange={(e) => setCfg((f) => ({ ...f, tags: e.target.value }))} placeholder="Separadas por vírgula" />
            </div>
            <div className="atv-field" style={{ display: 'flex', gap: 18 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, margin: 0 }}><input type="checkbox" checked={cfg.favorito} onChange={(e) => setCfg((f) => ({ ...f, favorito: e.target.checked }))} />Favorito</label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, margin: 0 }}><input type="checkbox" checked={cfg.ativo} onChange={(e) => setCfg((f) => ({ ...f, ativo: e.target.checked }))} />Ativo</label>
            </div>

            <p className="ed-label" style={{ marginTop: 6 }}>Sequência de mensagens</p>
            <div className="step-toolbar">
              <button type="button" title="Adicionar texto" onClick={() => addStep('texto')}><IcText />Texto</button>
              <button type="button" title="Adicionar imagem" onClick={() => addStep('imagem')}><IcImg />Imagem</button>
              <button type="button" title="Adicionar áudio" onClick={() => addStep('audio')}><IcAudio />Áudio</button>
              <button type="button" title="Adicionar vídeo" onClick={() => addStep('video')}><IcVideo />Vídeo</button>
              <button type="button" title="Adicionar documento" onClick={() => addStep('documento')}><IcFileMedia />Documento</button>
            </div>
            {errs.etapas && <div className="atv-field-err" style={{ margin: '8px 0' }}>{errs.etapas}</div>}
            {etapas.map((s, i) => (
              <div key={i} className="msg-step">
                <div className="msg-step-head">
                  <strong>Mensagem {i + 1} · {TIPO_LABEL[s.tipo]}</strong>
                  <span className="msg-step-actions">
                    <button type="button" className="ms-btn" title="Mover para cima" disabled={i === 0} onClick={() => moveStep(i, -1)}><IcUp /></button>
                    <button type="button" className="ms-btn" title="Mover para baixo" disabled={i === etapas.length - 1} onClick={() => moveStep(i, 1)}><IcDown /></button>
                    <button type="button" className="ms-btn" title="Duplicar" onClick={() => dupStep(i)}><IcCopy /></button>
                    <button type="button" className="ms-btn" title="Excluir" disabled={etapas.length <= 1} onClick={() => delStep(i)}><IcTrash /></button>
                  </span>
                </div>
                {s.tipo === 'texto' ? (
                  <>
                    <textarea className="atv-textarea" value={s.conteudo} placeholder="Escreva a mensagem. Use {{nome_cliente}}…"
                      ref={(el) => { msgRefs.current[i] = el; }} onFocus={() => { activeMsg.current = i; }}
                      onChange={(e) => setStepConteudo(i, e.target.value)} />
                    <div className="msg-step-foot"><span className="ed-count">{s.conteudo.length} caracteres</span></div>
                  </>
                ) : (
                  <>
                    <input ref={(el) => { fileRefs.current[i] = el; }} type="file" accept={ACCEPT[s.tipo]} style={{ display: 'none' }}
                      onChange={(e) => setStepFile(i, e.target.files?.[0] ?? null)} />
                    {(s.file || s.storagePath) ? (
                      <div className="media-edit">
                        {s.tipo === 'imagem' && s.previewUrl && <img className="media-thumb" src={s.previewUrl} alt={s.nome ?? ''} />}
                        {s.tipo === 'audio' && s.previewUrl && <audio controls src={s.previewUrl} style={{ width: '100%' }} />}
                        {s.tipo === 'video' && s.previewUrl && <video controls src={s.previewUrl} style={{ maxWidth: '100%', borderRadius: 8 }} />}
                        {s.tipo === 'documento' && <div className="doc-card"><IcFileMedia /><span>{s.nome ?? 'documento'}</span></div>}
                        <div className="media-meta"><span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.nome ?? ''}</span>{s.tamanho ? <span style={{ color: 'var(--muted)' }}>{formatarTamanho(s.tamanho)}</span> : null}<button type="button" className="atv-btn" onClick={() => fileRefs.current[i]?.click()}>Trocar</button></div>
                        <input className="atv-input" placeholder="Legenda (opcional)" value={s.conteudo} onChange={(e) => setStepConteudo(i, e.target.value)} />
                      </div>
                    ) : (
                      <button type="button" className="atv-btn" onClick={() => fileRefs.current[i]?.click()}><IcPlus />Selecionar {TIPO_LABEL[s.tipo].toLowerCase()}</button>
                    )}
                  </>
                )}
                {errs['st_' + i] && <div className="atv-field-err">{errs['st_' + i]}</div>}
              </div>
            ))}
            <div className="vars" style={{ marginTop: 10 }}>{SCRIPT_VARIAVEIS.map((v) => <button type="button" key={v} className="vchip" title="Inserir na mensagem de texto em edição" onClick={() => insertVar(v)}>{v}</button>)}</div>
          </div>

          {/* Pré-visualização */}
          <div className="builder-preview">
            <div className="bp-head">
              <span>Pré-visualização</span>
              {mostrarTogglePreview && (
                <span className="bp-toggle">
                  <button type="button" className={previewCanal === 'whatsapp' ? 'on' : ''} onClick={() => setPreviewCanal('whatsapp')}>WhatsApp</button>
                  <button type="button" className={previewCanal === 'facebook' ? 'on' : ''} onClick={() => setPreviewCanal('facebook')}>Facebook</button>
                </span>
              )}
            </div>
            <div className={'bp-chat ' + canalPreview}>
              {canalPreview === 'facebook' && <div className="bp-chan-name">{(cfg.titulo || 'Página')} · Messenger</div>}
              {etapas.filter((s) => s.tipo === 'texto' ? s.conteudo.trim() : (s.file || s.storagePath)).length === 0 && <div className="bp-empty">As mensagens aparecem aqui.</div>}
              {etapas.map((s, i) => {
                const visivel = s.tipo === 'texto' ? !!s.conteudo.trim() : !!(s.file || s.storagePath);
                if (!visivel) return null;
                return (
                  <div key={i} className="bp-bubble">
                    {s.tipo === 'texto' && <div className="bp-text">{substituirVariaveis(s.conteudo, previewCtx)}</div>}
                    {s.tipo === 'imagem' && s.previewUrl && <img className="bp-media" src={s.previewUrl} alt="" />}
                    {s.tipo === 'audio' && s.previewUrl && <audio controls src={s.previewUrl} style={{ width: 200, maxWidth: '100%' }} />}
                    {s.tipo === 'video' && s.previewUrl && <video controls src={s.previewUrl} style={{ maxWidth: '100%', borderRadius: 8 }} />}
                    {s.tipo === 'documento' && <div className="bp-doc"><IcFileMedia /><span>{s.nome ?? 'documento'}</span></div>}
                    {s.tipo !== 'texto' && s.conteudo.trim() && <div className="bp-text" style={{ marginTop: 4 }}>{substituirVariaveis(s.conteudo, previewCtx)}</div>}
                    <div className="bp-time">{HORA_FAKE}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmDialog open={!!confirmState} title={confirmState?.title ?? ''} message={confirmState?.message ?? ''}
        destructive loading={confirmLoading} confirmLabel="Excluir"
        onConfirm={executarConfirm} onCancel={() => { if (!confirmLoading) setConfirmState(null); }} />
    </div>
  );
}
