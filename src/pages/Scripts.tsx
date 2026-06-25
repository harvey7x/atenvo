import { useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '@/hooks/useToast';
import { EmptyState } from '@/components/EmptyState';
import {
  SCRIPTS_REAL, useScripts, useScriptCategorias, useScriptMutations, useScriptCategoriaMutations,
  substituirVariaveis, SCRIPT_VARIAVEIS, type Script,
  useScriptAnexos, useScriptAnexoMutations, urlAssinadaAnexo, formatarTamanho, type ScriptAnexo,
} from '@/data/scripts';
import './Scripts.css';

const IcWa = () => <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a9.9 9.9 0 0 0-8.5 15l-1.3 4.8 4.9-1.3A9.9 9.9 0 1 0 12 2z" /></svg>;
const IcFb = () => <svg viewBox="0 0 24 24" fill="currentColor"><path d="M22 12a10 10 0 1 0-11.6 9.9v-7H8v-2.9h2.4V9.8c0-2.4 1.4-3.7 3.6-3.7 1 0 2.1.2 2.1.2v2.3h-1.2c-1.2 0-1.5.7-1.5 1.4V12H16l-.4 2.9h-2.2v7A10 10 0 0 0 22 12z" /></svg>;
const IcStarFill = () => <svg viewBox="0 0 24 24" fill="currentColor"><path d="m12 2 2.9 6.3 6.8.7-5.1 4.6 1.4 6.7L12 17.8 6 21l1.4-6.7L2.3 9.7l6.8-.7z" /></svg>;
const IcStarLine = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="m12 3 2.7 5.8 6.3.7-4.7 4.3 1.3 6.2L12 17.9 6.1 20l1.3-6.2-4.7-4.3 6.3-.7z" /></svg>;
const IcDoc = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M8.5 13h7M8.5 16.5h5" /></svg>;
const IcCopy = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h8" /></svg>;
const IcTrash = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></svg>;
const IcBraces = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3c-2 0-3 1-3 3v3l-2 3 2 3v3c0 2 1 3 3 3M16 3c2 0 3 1 3 3v3l2 3-2 3v3c0 2-1 3-3 3" /></svg>;
const IcCheck = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>;
const IcClose = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>;
const IcSave = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><path d="M17 21v-8H7v8M7 3v5h8" /></svg>;
const IcPlus = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>;
const IcSearch = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3-3" /></svg>;
const IcChevL = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>;

function ChBadge({ c }: { c: string }) {
  const wa = c === 'whatsapp';
  return <span className={'ch ' + (wa ? 'wa' : 'fb')}>{wa ? <IcWa /> : <IcFb />}{wa ? 'WhatsApp' : 'Facebook'}</span>;
}

const VAZIO: Script = { id: '', titulo: '', descricao: null, conteudo: '', categoriaId: null, canais: [], favorito: false, ativo: true, tags: [], autorId: null, criadoEm: '', atualizadoEm: '' };

type CanalFiltro = 'todos' | 'whatsapp' | 'facebook' | 'ambos';
/** Classifica um script por exclusividade de canal (vazio = disponível em ambos). */
function classificaCanal(canais: string[]): 'whatsapp' | 'facebook' | 'ambos' {
  const wa = canais.includes('whatsapp'); const fb = canais.includes('facebook');
  if ((wa && fb) || canais.length === 0) return 'ambos';
  return wa ? 'whatsapp' : 'facebook';
}

export function Scripts() {
  const { toast } = useToast();
  const scriptsQ = useScripts();
  const catsQ = useScriptCategorias();
  const mut = useScriptMutations();
  const catMut = useScriptCategoriaMutations();

  const [cat, setCat] = useState('all');
  const [searchRaw, setSearchRaw] = useState('');
  const [search, setSearch] = useState('');
  const [canalFiltro, setCanalFiltro] = useState<CanalFiltro>('todos');
  const [favOnly, setFavOnly] = useState(false);
  const [currentId, setCurrentId] = useState('');
  const [isNew, setIsNew] = useState(false);
  const [form, setForm] = useState({ titulo: '', conteudo: '', wa: true, fb: false, categoriaId: '' as string });
  const [saving, setSaving] = useState(false);
  const [editorOpen, setEditorOpen] = useState(() => (typeof window !== 'undefined' ? window.innerWidth >= 1100 : true));
  const msgRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const anexosQ = useScriptAnexos(isNew ? null : (currentId || null));
  const anexos = anexosQ.data ?? [];
  const anexoMut = useScriptAnexoMutations();

  // debounce da busca
  useEffect(() => { const t = setTimeout(() => setSearch(searchRaw.trim().toLowerCase()), 250); return () => clearTimeout(t); }, [searchRaw]);

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

  // mantém uma seleção válida
  useEffect(() => {
    if (isNew) return;
    if (currentId && scripts.some((s) => s.id === currentId)) return;
    setCurrentId(list[0]?.id ?? scripts[0]?.id ?? '');
  }, [scripts, list, currentId, isNew]);

  const current = scripts.find((s) => s.id === currentId) ?? VAZIO;

  function startNew() { setIsNew(true); setForm({ titulo: '', conteudo: '', wa: true, fb: false, categoriaId: cat !== 'all' ? cat : '' }); setEditorOpen(true); }
  function loadScript(s: Script) {
    setIsNew(false); setCurrentId(s.id);
    setForm({ titulo: s.titulo, conteudo: s.conteudo, wa: s.canais.includes('whatsapp'), fb: s.canais.includes('facebook'), categoriaId: s.categoriaId ?? '' });
    setEditorOpen(true);
  }
  function insertVar(text: string) {
    const ta = msgRef.current;
    if (!ta) { setForm((f) => ({ ...f, conteudo: f.conteudo + text })); return; }
    const s = ta.selectionStart, e = ta.selectionEnd;
    const v = form.conteudo.slice(0, s) + text + form.conteudo.slice(e);
    setForm((f) => ({ ...f, conteudo: v }));
    setTimeout(() => { ta.focus(); ta.setSelectionRange(s + text.length, s + text.length); }, 0);
  }
  function canaisFromForm(): string[] { const c: string[] = []; if (form.wa) c.push('whatsapp'); if (form.fb) c.push('facebook'); return c; }

  async function salvar() {
    if (saving) return;
    if (!form.titulo.trim() && !form.conteudo.trim()) { toast('Preencha o título e a mensagem', 'warn'); return; }
    setSaving(true);
    try {
      if (isNew) {
        const r = await mut.criar.mutateAsync({ titulo: form.titulo, conteudo: form.conteudo, canais: canaisFromForm(), categoriaId: form.categoriaId || null });
        setIsNew(false); setCurrentId(r.id); toast('Script criado');
      } else if (current.id) {
        await mut.atualizar.mutateAsync({ id: current.id, patch: { titulo: form.titulo.trim() || 'Sem título', conteudo: form.conteudo, canais_permitidos: canaisFromForm(), categoria_id: form.categoriaId || null } });
        toast('Script salvo');
      }
    } catch (e) { toast((e as Error).message || 'Falha ao salvar', 'warn'); }
    finally { setSaving(false); }
  }
  async function favoritar(s: Script) {
    try { await mut.favoritar.mutateAsync({ id: s.id, favorito: !s.favorito }); }
    catch (e) { toast((e as Error).message || 'Falha', 'warn'); }
  }
  async function duplicar(s: Script) {
    try { const r = await mut.criar.mutateAsync({ titulo: s.titulo + ' (cópia)', conteudo: s.conteudo, canais: s.canais, categoriaId: s.categoriaId }); setCurrentId(r.id); toast('Script duplicado'); }
    catch (e) { toast((e as Error).message || 'Falha', 'warn'); }
  }
  async function excluir(s: Script) {
    if (!window.confirm(`Excluir o script "${s.titulo}"? Esta ação não pode ser desfeita.`)) return;
    try { await mut.excluir.mutateAsync(s.id); if (currentId === s.id) setCurrentId(''); toast('Script excluído'); }
    catch (e) { toast((e as Error).message || 'Falha', 'warn'); }
  }
  async function novaCategoria() {
    const nome = window.prompt('Nome da nova categoria:')?.trim();
    if (!nome) return;
    try { await catMut.criar.mutateAsync(nome); toast('Categoria criada'); }
    catch (e) { toast((e as Error).message || 'Falha', 'warn'); }
  }
  function copiar(s: Script) {
    const txt = s.conteudo;
    try { navigator.clipboard?.writeText(txt); toast('Texto copiado'); }
    catch { toast('Não foi possível copiar', 'warn'); }
  }
  async function enviarAnexo(file: File | null) {
    if (!file) return;
    if (isNew || !current.id) { toast('Salve o script antes de anexar mídia', 'warn'); return; }
    setUploading(true);
    try { await anexoMut.upload.mutateAsync({ scriptId: current.id, file }); toast('Anexo enviado'); }
    catch (e) { toast((e as Error).message || 'Falha no upload', 'warn'); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  }
  async function abrirAnexo(a: ScriptAnexo) {
    const url = await urlAssinadaAnexo(a.path);
    if (url) window.open(url, '_blank'); else toast('Não foi possível abrir o anexo', 'warn');
  }
  async function removerAnexo(a: ScriptAnexo) {
    if (!window.confirm(`Remover "${a.nome}"?`)) return;
    try { await anexoMut.remover.mutateAsync(a); toast('Anexo removido'); }
    catch (e) { toast((e as Error).message || 'Falha ao remover', 'warn'); }
  }

  if (!SCRIPTS_REAL) {
    return <EmptyState icon={<IcDoc />} title="Backend não configurado" text="A biblioteca de scripts requer o backend Supabase configurado." />;
  }

  return (
    <div className={'scripts-page' + (editorOpen ? '' : ' editor-closed')}>
      <div className="topbar">
        <div className="tb-left"><div className="page-title">Biblioteca de Scripts</div><div className="page-sub">Crie, organize e reutilize mensagens para padronizar o atendimento.</div></div>
        <div className="tb-right"><div className="tb-actions">
          <div className="search"><IcSearch /><input type="text" placeholder="Buscar scripts..." value={searchRaw} onChange={(e) => setSearchRaw(e.target.value)} /></div>
          <button className="btn-new" onClick={startNew}><IcPlus />Novo script</button>
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
                <p style={{ margin: '0 0 12px' }}>{scripts.length === 0 ? 'Nenhum script ainda.' : 'Nenhum script neste filtro.'}</p>
                <button className="btn-new" onClick={startNew}><IcPlus />{scripts.length === 0 ? 'Criar primeiro script' : 'Novo script'}</button>
              </div>
            )}
            {list.map((s) => {
              const on = s.id === currentId && !isNew;
              return (
                <div key={s.id} className={'scard' + (on ? ' active' : '')} role="option" aria-selected={on} onClick={() => loadScript(s)}>
                  <div className="sc-top"><div className="sc-title">{s.titulo || 'Sem título'}</div><button className={'star' + (s.favorito ? ' on' : '')} aria-label="Favoritar" onClick={(e) => { e.stopPropagation(); favoritar(s); }}>{s.favorito ? <IcStarFill /> : <IcStarLine />}</button></div>
                  <div className="sc-chans">{(s.canais.length ? s.canais : ['whatsapp', 'facebook']).map((c) => <ChBadge key={c} c={c} />)}</div>
                  <div className="sc-prev">{s.conteudo.replace(/\n+/g, ' ') || '—'}</div>
                </div>
              );
            })}
          </div>
        </section>

        <aside className="panel panel-editor">
          <div className="ed-crumb"><span>{isNew ? 'Novo script' : (catName(current.categoriaId) || 'Script')}</span>{!isNew && current.titulo && <><span className="sep">›</span><span className="cur">{current.titulo}</span></>}</div>
          <div className="ed-actions">
            {!isNew && current.id && <button className="ed-btn fav" onClick={() => favoritar(current)}>{current.favorito ? <IcStarFill /> : <IcStarLine />}Favoritar</button>}
            {!isNew && current.id && <button className="ed-btn" onClick={() => duplicar(current)}><IcCopy />Duplicar</button>}
            {!isNew && current.id && <button className="ed-btn" onClick={() => copiar(current)}><IcCopy />Copiar</button>}
            {!isNew && current.id && <button className="ed-btn" onClick={() => excluir(current)}><IcTrash />Excluir</button>}
            {isNew && <button className="ed-btn" onClick={() => { setIsNew(false); }}><IcClose />Cancelar</button>}
            <button className="ed-btn primary" disabled={saving} onClick={salvar}>{isNew ? <><IcPlus />Criar script</> : <><IcSave />{saving ? 'Salvando…' : 'Salvar'}</>}</button>
          </div>

          {(isNew || current.id) ? (
            <>
              <div className="ed-chans">
                <button className={'ed-chan-toggle wa' + (form.wa ? ' sel' : '')} onClick={() => setForm((f) => ({ ...f, wa: !f.wa }))}><IcWa />WhatsApp</button>
                <button className={'ed-chan-toggle fb' + (form.fb ? ' sel' : '')} onClick={() => setForm((f) => ({ ...f, fb: !f.fb }))}><IcFb />Facebook</button>
              </div>
              <p className="ed-label">Categoria</p>
              <select className="ed-input" value={form.categoriaId} onChange={(e) => setForm((f) => ({ ...f, categoriaId: e.target.value }))}>
                <option value="">Sem categoria</option>
                {cats.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
              <p className="ed-label">Título do script</p>
              <input className="ed-input" type="text" placeholder="Dê um nome ao script" value={form.titulo} onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))} />
              <p className="ed-label">Mensagem</p>
              <div className="ed-msg-wrap">
                <textarea ref={msgRef} className="ed-msg" placeholder="Escreva a mensagem. Use variáveis como {{nome_cliente}}." value={form.conteudo} onChange={(e) => setForm((f) => ({ ...f, conteudo: e.target.value }))} />
                <div className="ed-toolbar"><button className="tool" title="Inserir variável" onClick={() => insertVar('{{nome_cliente}}')}><IcBraces /></button><span className="ed-count">{form.conteudo.length} caracteres</span></div>
              </div>
              <div className="vars-head"><div className="vars-row1"><h4>Variáveis disponíveis</h4></div><div className="vars-hint">Clique para inserir; são substituídas ao usar na conversa.</div></div>
              <div className="vars">{SCRIPT_VARIAVEIS.map((v) => <button key={v} className="vchip" onClick={() => insertVar(v)}>{v}</button>)}</div>
              {!isNew && form.conteudo.includes('{{') && (
                <><p className="ed-label" style={{ marginTop: 14 }}>Pré-visualização</p>
                <div className="sc-prev" style={{ whiteSpace: 'pre-wrap' }}>{substituirVariaveis(form.conteudo, { cliente: 'Maria Silva', atendente: 'Você', empresa: 'CAF', telefone: '(11) 99999-9999' })}</div></>
              )}
              {!isNew && current.id && (
                <>
                  <p className="ed-label" style={{ marginTop: 14 }}>Mídias e anexos</p>
                  <p className="ed-sub" style={{ fontSize: 12 }}>Áudio, imagem, vídeo ou documento (privados, com URL temporária). Cada canal tem limites próprios na hora de enviar na conversa.</p>
                  <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={(e) => enviarAnexo(e.target.files?.[0] ?? null)} />
                  <button className="ed-btn" disabled={uploading} onClick={() => fileRef.current?.click()}>{uploading ? 'Enviando…' : <><IcPlus />Adicionar mídia</>}</button>
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {anexosQ.isLoading && <span style={{ color: 'var(--muted)', fontSize: 13 }}>Carregando anexos…</span>}
                    {!anexosQ.isLoading && anexos.length === 0 && <span style={{ color: 'var(--muted)', fontSize: 13 }}>Nenhum anexo.</span>}
                    {anexos.map((a) => (
                      <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, border: '1px solid var(--line, #2a2f3a)', borderRadius: 8, padding: '6px 8px' }}>
                        <span style={{ textTransform: 'capitalize', color: 'var(--muted)', minWidth: 70 }}>{a.tipo}</span>
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={a.nome}>{a.nome}</span>
                        <span style={{ color: 'var(--muted)' }}>{formatarTamanho(a.tamanho)}</span>
                        <button className="ed-btn" onClick={() => abrirAnexo(a)}>Abrir</button>
                        <button className="ed-btn" title="Remover" onClick={() => removerAnexo(a)}><IcTrash /></button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          ) : (
            <div style={{ padding: 24, color: 'var(--muted)', textAlign: 'center' }}>Selecione um script à esquerda ou crie um novo.</div>
          )}
        </aside>
      </div>

      <button className="reopen" aria-label="Abrir editor" onClick={() => setEditorOpen(true)}><IcChevL /></button>
      <div className="drawer-overlay" onClick={() => setEditorOpen(false)} />
    </div>
  );
}
