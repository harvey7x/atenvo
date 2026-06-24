import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useToast } from '@/hooks/useToast';
import { useContatos, useCreateContato, useUpdateContato, useDeleteContato, type ContatoRow as Row } from '@/data/contatos';
import { useEtiquetas } from '@/data/atendimento';
import { corDaEtiqueta } from '@/types/atendimento';
import './Contatos.css';

const PAL = ['#5b6ee1', '#c2693a', '#7a5bb0', '#2f8f9d', '#b0566f', '#4a7a4a', '#9d7a2f', '#3d7ab0'];
function initials(n: string) { const p = n.trim().split(/\s+/); return ((p[0] || '')[0] + ((p[1] || '')[0] || '')).toUpperCase(); }
function avColor(n: string) { if (n === 'Henrique') return '#3f6f52'; let h = 0; for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0; return PAL[h % PAL.length]; }
function Av({ n, cls }: { n: string; cls?: string }) { return <span className={'av ' + (cls || 'sm')} style={{ background: avColor(n) }}>{initials(n)}</span>; }

const ORIG: Record<string, string> = { WhatsApp: 'wa', Facebook: 'fb', 'Lead Ads': 'ads', 'Indicação': 'ind' };
const STC: Record<string, string> = { Cliente: 'ok', Lead: 'info', Negociando: 'warn', Inativo: 'neutral' };

const IcDots = () => <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="12" cy="19" r="1.7" /></svg>;
const IcEye = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>;
const IcEdit = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>;
const IcMsg = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>;
const IcTrash = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></svg>;
const IcChevL = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>;
const IcChevR = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>;
const IcSearch = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3-3" /></svg>;
const IcFilter = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 5h18l-7 8v5l-4 2v-7z" /></svg>;
const IcExport = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12M8 11l4 4 4-4M5 21h14" /></svg>;
const IcPlus = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>;
const IcX = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>;

function Origem({ o }: { o: string }) { return <span className={'tag ' + (ORIG[o] || 'ind')}>{o}</span>; }
function Status({ s }: { s: string }) { return <span className={'st ' + (STC[s] || 'neutral')}>{s === 'Cliente' && <span className="dot" />}{s}</span>; }

const STAT_ICONS = {
  users: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3.2" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.2a3.2 3.2 0 0 1 0 6.3M21.5 20a6.5 6.5 0 0 0-4-6" /></svg>,
  target: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" /></svg>,
  check: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="m17 11 2 2 4-4" /></svg>,
  spark: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" /></svg>,
};

export function Contatos() {
  const { toast } = useToast();
  const { data: rows = [], isLoading, isError, error } = useContatos();
  const { data: etiquetas = [] } = useEtiquetas();
  const createContato = useCreateContato();
  const updateContato = useUpdateContato();
  const deleteContato = useDeleteContato();
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [drawer, setDrawer] = useState<Row | null>(null);
  const [menu, setMenu] = useState<{ row: Row; left: number; top: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const pendingBtn = useRef<DOMRect | null>(null);

  const filtered = rows.filter((r) => { const q = query.trim().toLowerCase(); return !q || (r.nome + ' ' + r.email + ' ' + r.tel + ' ' + r.resp + ' ' + r.org + ' ' + r.st).toLowerCase().indexOf(q) >= 0; });
  const totalContatos = rows.length;
  const totalLeads = rows.filter((r) => r.st === 'Lead').length;
  const totalClientes = rows.filter((r) => r.st === 'Cliente').length;
  const footTxt = query.trim() ? `${filtered.length} resultado${filtered.length === 1 ? '' : 's'}` : `Mostrando ${totalContatos} contato${totalContatos === 1 ? '' : 's'}`;

  useLayoutEffect(() => {
    if (!menu || !menuRef.current || !pendingBtn.current) return;
    const rc = pendingBtn.current; const pw = menuRef.current.offsetWidth;
    setMenu((m) => m && ({ ...m, left: Math.min(rc.right - pw, window.innerWidth - pw - 10), top: rc.bottom + 6 }));
    pendingBtn.current = null; // eslint-disable-line
  }, [menu?.row]); // eslint-disable-line

  useEffect(() => {
    function onDoc(e: MouseEvent) { if (menuRef.current?.contains(e.target as Node)) return; setMenu(null); }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') { setMenu(null); setDrawer(null); } }
    function onResize() { setMenu(null); }
    document.addEventListener('click', onDoc); document.addEventListener('keydown', onKey); window.addEventListener('resize', onResize);
    return () => { document.removeEventListener('click', onDoc); document.removeEventListener('keydown', onKey); window.removeEventListener('resize', onResize); };
  }, []);

  function openMenu(e: React.MouseEvent, r: Row) {
    e.stopPropagation();
    const rc = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (menu && menu.row === r) { setMenu(null); return; }
    pendingBtn.current = rc;
    setMenu({ row: r, left: -9999, top: -9999 });
  }

  function addNew() {
    const nome = window.prompt('Nome do novo contato:')?.trim();
    if (!nome) return;
    const telefone = window.prompt('Telefone (opcional):')?.trim() || undefined;
    createContato.mutate({ nome, telefone }, {
      onSuccess: () => toast('Contato criado'),
      onError: (e) => toast('Erro ao criar: ' + (e as Error).message),
    });
  }
  function editContato(r: Row) {
    const nome = window.prompt('Editar nome do contato:', r.nome)?.trim();
    if (!nome || nome === r.nome) return;
    updateContato.mutate({ id: r.id, nome }, {
      onSuccess: () => toast('Contato atualizado'),
      onError: (e) => toast('Erro ao atualizar: ' + (e as Error).message),
    });
  }
  function removeContato(r: Row) {
    if (!window.confirm(`Excluir o contato "${r.nome}"? Esta ação não pode ser desfeita.`)) return;
    deleteContato.mutate(r.id, {
      onSuccess: () => toast('Contato excluído'),
      onError: (e) => toast('Erro ao excluir: ' + (e as Error).message),
    });
  }

  const colCount = 7;

  return (
    <div className="contatos-page">
      <div className="content">
        <div className="stats">
          <div className="stat"><span className="stat-ic green">{STAT_ICONS.users}</span><div className="stat-body"><div className="stat-label">Total de contatos</div><div className="stat-value">{totalContatos}</div><div className="stat-delta up">+12% vs mês anterior</div></div></div>
          <div className="stat"><span className="stat-ic blue">{STAT_ICONS.target}</span><div className="stat-body"><div className="stat-label">Leads ativos</div><div className="stat-value">{totalLeads}</div><div className="stat-delta up">+8% vs mês anterior</div></div></div>
          <div className="stat"><span className="stat-ic green">{STAT_ICONS.check}</span><div className="stat-body"><div className="stat-label">Clientes</div><div className="stat-value">{totalClientes}</div><div className="stat-delta up">+5% vs mês anterior</div></div></div>
          <div className="stat"><span className="stat-ic amber">{STAT_ICONS.spark}</span><div className="stat-body"><div className="stat-label">Novos contatos</div><div className="stat-value">{totalContatos}</div><div className="stat-delta flat">Últimos 30 dias</div></div></div>
        </div>

        <section className="panel table-card">
          <div className="tc-head">
            <h2>Todos os contatos</h2>
            <div className="right">
              <button className="btn-ghost" onClick={() => toast('Filtros')}><IcFilter />Filtros</button>
              <button className="btn-ghost" onClick={() => toast('Exportar contatos')}><IcExport />Exportar</button>
              <button className="btn-primary" onClick={addNew} disabled={createContato.isPending}><IcPlus />Novo contato</button>
            </div>
          </div>
          <div className="tc-search">
            <IcSearch />
            <input type="text" placeholder="Buscar por nome, email, telefone ou responsável..." value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="table-scroll">
            <table className="contacts-table" aria-label="Lista de contatos">
              <colgroup><col className="col-contato" /><col className="col-telefone" /><col className="col-origem" /><col className="col-responsavel" /><col className="col-status" /><col className="col-interacao" /><col className="col-acoes" /></colgroup>
              <thead><tr><th className="column-contact">Contato</th><th className="column-center">Telefone</th><th className="column-center">Origem</th><th className="column-responsible">Responsável</th><th className="column-center">Status</th><th className="column-center">Última interação</th><th className="column-center" aria-label="Ações"></th></tr></thead>
              <tbody>
                {isLoading && (<tr><td colSpan={colCount}><div className="empty-row">Carregando contatos…</div></td></tr>)}
                {isError && !isLoading && (<tr><td colSpan={colCount}><div className="empty-row error">Erro ao carregar contatos: {(error as Error)?.message}</div></td></tr>)}
                {!isLoading && !isError && filtered.length === 0 && (
                  <tr><td colSpan={colCount}><div className="empty-row">{query.trim() ? 'Nenhum contato encontrado para esta busca.' : 'Nenhum contato ainda. Clique em “Novo contato” para começar.'}</div></td></tr>
                )}
                {!isLoading && !isError && filtered.map((r) => (
                  <tr key={r.id} onClick={() => setDrawer(r)}>
                    <td><div className="contact-cell"><Av n={r.nome} /><div className="c-txt"><span className="nm">{r.nome}</span><span className="em">{r.email}</span>{r.tags.length > 0 && <span className="ctags">{r.tags.slice(0, 3).map((t) => { const cor = corDaEtiqueta(t, etiquetas); return <span key={t} className="ctag" style={{ background: cor + '22', color: cor, borderColor: cor + '55' }}>{t}</span>; })}{r.tags.length > 3 && <span className="ctag more">+{r.tags.length - 3}</span>}</span>}</div></div></td>
                    <td><div className="phone-cell"><span className="phone">{r.tel}</span></div></td>
                    <td><div className="origin-cell"><Origem o={r.org} /></div></td>
                    <td><div className="responsible-cell"><Av n={r.resp} cls="sm" /><span className="rname">{r.resp}</span></div></td>
                    <td><div className="status-cell"><Status s={r.st} /></div></td>
                    <td><div className="interaction-cell"><span className="ultima">{r.ult}</span></div></td>
                    <td><div className="actions-cell"><button type="button" className="row-menu" aria-label="Ações" onClick={(e) => openMenu(e, r)}><IcDots /></button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <footer className="tc-foot">
            <span className="ft">{footTxt}</span>
            <nav className="pager" aria-label="Paginação dos contatos">
              <button type="button" className="pg nav" aria-label="Página anterior" onClick={() => toast('Página anterior')}><IcChevL /></button>
              {[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" className={'pg' + (page === n ? ' on' : '')} aria-current={page === n ? 'page' : undefined} onClick={() => { setPage(n); toast('Página ' + n); }}>{n}</button>)}
              <button type="button" className="pg nav" aria-label="Próxima página" onClick={() => toast('Página seguinte')}><IcChevR /></button>
            </nav>
            <div className="perpage"><label htmlFor="perPage">Itens por página:</label><select id="perPage" onChange={(e) => toast(e.target.value + ' itens por página')}><option value="10">10</option><option value="25">25</option><option value="50">50</option></select></div>
          </footer>
        </section>
      </div>

      {/* drawer */}
      <div className={'drawer-backdrop' + (drawer ? ' show' : '')} onClick={() => setDrawer(null)} />
      <aside className={'drawer' + (drawer ? ' show' : '')} aria-label="Detalhe do contato">
        {drawer && (<>
          <div className="drawer-head">
            <span className="av xl" style={{ background: avColor(drawer.nome) }}>{initials(drawer.nome)}</span>
            <div className="who"><div className="nm">{drawer.nome}</div><div className="em">{drawer.email}</div></div>
            <button className="drawer-x" aria-label="Fechar" onClick={() => setDrawer(null)}><IcX /></button>
          </div>
          <div className="drawer-body">
            <div className="dl-row"><span className="dl-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.7a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.4-1.1a2 2 0 0 1 2.1-.5c.9.3 1.8.5 2.7.6a2 2 0 0 1 1.7 2z" /></svg></span><div className="dl-txt"><span className="dl-label">Telefone</span><span className="dl-value">{drawer.tel}</span></div></div>
            <div className="dl-row"><span className="dl-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg></span><div className="dl-txt"><span className="dl-label">Email</span><span className="dl-value">{drawer.email}</span></div></div>
            <div className="dl-row"><span className="dl-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16v5a8 8 0 0 1-16 0z" /><path d="M9 20h6M12 13v7" /></svg></span><div className="dl-txt"><span className="dl-label">Origem</span><span className="dl-value"><Origem o={drawer.org} /></span></div></div>
            <div className="dl-row"><span className="dl-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg></span><div className="dl-txt"><span className="dl-label">Responsável</span><span className="dl-value"><Av n={drawer.resp} cls="sm" /><span>{drawer.resp}</span></span></div></div>
            <div className="dl-row"><span className="dl-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.1V12a10 10 0 1 1-5.9-9.1" /><path d="M22 4 12 14.1l-3-3" /></svg></span><div className="dl-txt"><span className="dl-label">Status</span><span className="dl-value"><Status s={drawer.st} /></span></div></div>
            <div className="dl-row"><span className="dl-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg></span><div className="dl-txt"><span className="dl-label">Última interação</span><span className="dl-value">{drawer.ult}</span></div></div>
            <div className="dl-row"><span className="dl-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.6 13.4 13 21l-9-9V4h8z" /><circle cx="7.5" cy="7.5" r="1.2" /></svg></span><div className="dl-txt"><span className="dl-label">Etiquetas</span><span className="dl-value">{drawer.tags.length > 0 ? <span className="ctags">{drawer.tags.map((t) => { const cor = corDaEtiqueta(t, etiquetas); return <span key={t} className="ctag" style={{ background: cor + '22', color: cor, borderColor: cor + '55' }}>{t}</span>; })}</span> : <span style={{ color: 'var(--muted)' }}>Nenhuma</span>}</span></div></div>
          </div>
          <div className="drawer-foot">
            <button className="btn-block primary" onClick={() => toast('Abrir conversa com ' + drawer.nome)}><IcMsg />Enviar mensagem</button>
            <button className="btn-block" onClick={() => editContato(drawer)}><IcEdit />Editar contato</button>
            <button className="btn-block danger" onClick={() => { const d = drawer; setDrawer(null); removeContato(d); }}><IcTrash />Excluir contato</button>
          </div>
        </>)}
      </aside>

      {/* menu por linha */}
      {menu && (
        <div ref={menuRef} className="pop show" style={{ left: menu.left, top: menu.top }}>
          <button className="pop-item" onClick={() => { setDrawer(menu.row); setMenu(null); }}><IcEye />Ver detalhes</button>
          <button className="pop-item" onClick={() => { toast('Mensagem para ' + menu.row.nome); setMenu(null); }}><IcMsg />Enviar mensagem</button>
          <button className="pop-item" onClick={() => { const r = menu.row; setMenu(null); editContato(r); }}><IcEdit />Editar contato</button>
          <button className="pop-item danger" onClick={() => { const r = menu.row; setMenu(null); removeContato(r); }}><IcTrash />Excluir contato</button>
        </div>
      )}
    </div>
  );
}
