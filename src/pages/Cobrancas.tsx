import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { WA_REAL } from '@/data/whatsapp';
import { CobrancasApp } from '@/components/CobrancasApp';
import { useToast } from '@/hooks/useToast';
import './Cobrancas.css';

interface Row { cli: string; co: string; srv: string; val: string; dia: string; rest: string; ini: string; prox: string; st: string; resp: string; }

const PAL = ['#5b6ee1', '#c2693a', '#7a5bb0', '#2f8f9d', '#b0566f', '#4a7a4a', '#9d7a2f', '#3d7ab0'];
function initials(n: string) { const p = n.trim().split(/\s+/); return ((p[0] || '')[0] + ((p[1] || '')[0] || '')).toUpperCase(); }
function avColor(n: string) { if (n === 'Henrique') return '#3f6f52'; let h = 0; for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0; return PAL[h % PAL.length]; }
function Av({ n, cls }: { n: string; cls?: string }) { return <span className={'av ' + (cls || 'sm')} style={{ background: avColor(n) }}>{initials(n)}</span>; }

const STMAP: Record<string, string> = { Ativo: 'ok', Encerrando: 'warn', Atrasado: 'err', Finalizado: 'neutral' };
function StBadge({ s }: { s: string }) { return <span className={'st ' + (STMAP[s] || 'neutral')}>{s === 'Ativo' && <span className="dot" />}{s}</span>; }
function Cyc({ n }: { n: string }) { const v = parseInt(n, 10); const c = v === 0 ? 'neutral' : v <= 2 ? 'warn' : 'ok'; return <span className={'cyc ' + c}>{v}</span>; }

const SEED: Row[] = [
  { cli: 'João Silva', co: 'Silva Transportes', srv: 'Renegociação de Dívida', val: 'R$ 750,00', dia: '10', rest: '5', ini: '05/05/2024', prox: '10/06/2024', st: 'Ativo', resp: 'Henrique' },
  { cli: 'Maria Oliveira', co: 'Oliveira Comércio', srv: 'Redução de Juros', val: 'R$ 620,00', dia: '15', rest: '3', ini: '20/04/2024', prox: '15/06/2024', st: 'Encerrando', resp: 'Marina Lopes' },
  { cli: 'Carlos Eduardo', co: 'Eduardo Serviços', srv: 'Acordo Bancário', val: 'R$ 540,00', dia: '20', rest: '1', ini: '01/05/2024', prox: '20/05/2024', st: 'Atrasado', resp: 'Antônio César' },
  { cli: 'Juliana Mendes', co: 'Mendes & Cia', srv: 'Renegociação de Dívida', val: 'R$ 810,00', dia: '5', rest: '0', ini: '10/02/2024', prox: '10/07/2024', st: 'Finalizado', resp: 'Paula Ferreira' },
  { cli: 'Bruno Lima', co: 'Lima Distribuidora', srv: 'Redução de Juros', val: 'R$ 430,00', dia: '25', rest: '4', ini: '18/04/2024', prox: '18/06/2024', st: 'Ativo', resp: 'Henrique' },
  { cli: 'Patrícia Souza', co: 'Souza Consultoria', srv: 'Acordo Bancário', val: 'R$ 690,00', dia: '10', rest: '2', ini: '25/04/2024', prox: '25/06/2024', st: 'Encerrando', resp: 'Marina Lopes' },
  { cli: 'Rafael Costa', co: 'Costa Indústria', srv: 'Renegociação de Dívida', val: 'R$ 950,00', dia: '30', rest: '6', ini: '05/05/2024', prox: '05/06/2024', st: 'Ativo', resp: 'Antônio César' },
  { cli: 'Fernanda Alves', co: 'Alves Importações', srv: 'Redução de Juros', val: 'R$ 380,00', dia: '15', rest: '0', ini: '30/01/2024', prox: '30/04/2024', st: 'Finalizado', resp: 'Paula Ferreira' },
];

const IcDots = () => <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="12" cy="19" r="1.7" /></svg>;
const IcEye = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>;
const IcEdit = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>;
const IcPause = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5v14M15 5v14" /></svg>;
const IcTrash = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></svg>;
const IcChevL = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>;
const IcChevR = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>;
const IcSearch = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3-3" /></svg>;
const IcFilter = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 5h18l-7 8v5l-4 2v-7z" /></svg>;
const IcExport = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12M8 11l4 4 4-4M5 21h14" /></svg>;
const IcX = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>;
const IcInfo = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>;
const IcSave = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><path d="M17 21v-8H7v8M7 3v5h8" /></svg>;
const IcCal = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4.5" width="18" height="16" rx="2.4" /><path d="M3 9h18M8 2.5v4M16 2.5v4" /></svg>;

const STAT_IC = {
  users: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3.2" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.2a3.2 3.2 0 0 1 0 6.3M21.5 20a6.5 6.5 0 0 0-4-6" /></svg>,
  money: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v10M14.6 9.3c-.7-.9-3.7-1.4-3.7.6 0 1.9 3.7 1 3.7 2.9 0 2-3 1.5-3.7.6" /></svg>,
  cal: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4.5" width="18" height="16" rx="2.4" /><path d="M3 9h18M8 2.5v4M16 2.5v4" /></svg>,
  clock: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>,
};

const MENU = ['Ver detalhes', 'Editar contrato', 'Pausar cobrança', 'Encerrar contrato'];

export function Cobrancas() {
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>(SEED);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [banner, setBanner] = useState(true);
  const [menu, setMenu] = useState<{ cli: string; left: number; top: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const pendingBtn = useRef<DOMRect | null>(null);
  const [f, setF] = useState({ cli: '', val: '', dia: '', tot: '6', rest: '6', data: '18/05/2024', resp: '', obs: '' });

  const filtered = rows.filter((r) => { const q = query.trim().toLowerCase(); return !q || (r.cli + ' ' + r.co + ' ' + r.srv + ' ' + r.resp).toLowerCase().indexOf(q) >= 0; });
  const footTxt = query.trim() ? `${filtered.length} resultado${filtered.length === 1 ? '' : 's'}` : `Mostrando 1 a ${rows.length} de 27 contratos`;

  useLayoutEffect(() => {
    if (!menu || !menuRef.current || !pendingBtn.current) return;
    const rc = pendingBtn.current; const pw = menuRef.current.offsetWidth;
    setMenu((m) => m && ({ ...m, left: Math.min(rc.right - pw, window.innerWidth - pw - 10), top: rc.bottom + 6 }));
    pendingBtn.current = null;
  }, [menu?.cli]);
  useEffect(() => {
    function onDoc(e: MouseEvent) { if (menuRef.current?.contains(e.target as Node)) return; setMenu(null); }
    function onResize() { setMenu(null); }
    document.addEventListener('click', onDoc); window.addEventListener('resize', onResize);
    return () => { document.removeEventListener('click', onDoc); window.removeEventListener('resize', onResize); };
  }, []);

  function openMenu(e: React.MouseEvent, cli: string) {
    e.stopPropagation();
    if (menu && menu.cli === cli) { setMenu(null); return; }
    pendingBtn.current = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenu({ cli, left: -9999, top: -9999 });
  }
  function save() {
    if (!f.cli) { toast('Selecione o cliente'); return; }
    const nome = f.cli.split(' — ')[0]; const co = f.cli.split(' — ')[1] || 'Empresa';
    setRows((c) => [{ cli: nome, co, srv: 'Renegociação de Dívida', val: f.val.trim() || 'R$ 0,00', dia: f.dia || '10', rest: f.rest || '6', ini: f.data || '—', prox: '—', st: 'Ativo', resp: f.resp || 'Henrique' }, ...c]);
    toast('Contrato salvo');
  }
  function clearForm() { setF({ cli: '', val: '', dia: '', tot: '6', rest: '6', data: '18/05/2024', resp: '', obs: '' }); toast('Formulário limpo'); }

  if (WA_REAL) return <CobrancasApp />;

  return (
    <div className="cobrancas-page">
      <div className="content">
        <div className="stats">
          <div className="stat"><span className="stat-ic green">{STAT_IC.users}</span><div className="stat-body"><div className="stat-label">Clientes ativos</div><div className="stat-value">27</div><div className="stat-delta up">+8% vs mês anterior</div></div></div>
          <div className="stat"><span className="stat-ic green">{STAT_IC.money}</span><div className="stat-body"><div className="stat-label">Receita prevista do mês</div><div className="stat-value">R$ 128.540,00</div><div className="stat-delta up">+12% vs mês anterior</div></div></div>
          <div className="stat"><span className="stat-ic green">{STAT_IC.cal}</span><div className="stat-body"><div className="stat-label">Cobranças desta semana</div><div className="stat-value">16</div><div className="stat-delta up">+4 vs semana anterior</div></div></div>
          <div className="stat"><span className="stat-ic amber">{STAT_IC.clock}</span><div className="stat-body"><div className="stat-label">Contratos encerrando</div><div className="stat-value">5</div><div className="stat-delta flat">Próx. 30 dias</div></div></div>
        </div>

        {banner && (
          <div className="banner">
            <span className="bic"><IcInfo /></span>
            <div className="btxt"><b>Regra padrão: cobrar 50% do valor economizado por 6 meses.</b><p>O sistema calcula automaticamente o valor da cobrança com base no desconto concedido.</p></div>
            <button className="bx" aria-label="Fechar" onClick={() => setBanner(false)}><IcX /></button>
          </div>
        )}

        <div className="cob-grid">
          <section className="panel table-card">
            <div className="tc-head">
              <h2>Contratos de cobrança</h2>
              <div className="right">
                <button className="btn-ghost" onClick={() => toast('Filtros')}><IcFilter />Filtros</button>
                <button className="btn-ghost" onClick={() => toast('Exportar carteira')}><IcExport />Exportar</button>
              </div>
            </div>
            <div className="tc-search"><IcSearch /><input type="text" placeholder="Buscar por cliente, serviço ou responsável..." value={query} onChange={(e) => setQuery(e.target.value)} /></div>
            <div className="table-scroll">
              <table className="contracts-table" aria-label="Contratos de cobrança">
                <colgroup><col className="col-cliente" /><col className="col-servico" /><col className="col-valor" /><col className="col-dia" /><col className="col-ciclos" /><col className="col-inicio" /><col className="col-proxima" /><col className="col-status" /><col className="col-responsavel" /><col className="col-acoes" /></colgroup>
                <thead><tr><th>Cliente</th><th>Serviço</th><th>Valor da cobrança</th><th>Dia da cobrança</th><th>Ciclos restantes</th><th>Início</th><th>Próxima cobrança</th><th>Status</th><th>Responsável</th><th aria-label="Ações"></th></tr></thead>
                <tbody>
                  {filtered.map((r, i) => (
                    <tr key={r.cli + i}>
                      <td><div className="client-cell"><Av n={r.cli} /><div className="cli-txt"><span className="nm">{r.cli}</span><span className="co">{r.co}</span></div></div></td>
                      <td>{r.srv}</td>
                      <td><div className="cell-centered val">{r.val}</div></td>
                      <td><div className="cell-centered">{r.dia}</div></td>
                      <td><div className="cell-centered"><Cyc n={r.rest} /></div></td>
                      <td><div className="cell-centered">{r.ini}</div></td>
                      <td><div className="cell-centered">{r.prox}</div></td>
                      <td><div className="cell-centered"><StBadge s={r.st} /></div></td>
                      <td><div className="responsible-cell"><Av n={r.resp} /><span className="rname">{r.resp}</span></div></td>
                      <td><div className="cell-centered"><button type="button" className="row-menu" aria-label="Ações" onClick={(e) => openMenu(e, r.cli)}><IcDots /></button></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <footer className="tc-foot">
              <span className="ft">{footTxt}</span>
              <nav className="pager" aria-label="Paginação dos contratos">
                <button type="button" className="pg nav" aria-label="Página anterior" onClick={() => toast('Página anterior')}><IcChevL /></button>
                {[1, 2, 3, 4].map((n) => <button key={n} type="button" className={'pg' + (page === n ? ' on' : '')} aria-current={page === n ? 'page' : undefined} onClick={() => { setPage(n); toast('Página ' + n); }}>{n}</button>)}
                <button type="button" className="pg nav" aria-label="Próxima página" onClick={() => toast('Página seguinte')}><IcChevR /></button>
              </nav>
              <div className="perpage"><label htmlFor="perPage">Itens por página:</label><select id="perPage" onChange={(e) => toast(e.target.value + ' itens por página')}><option value="10">10</option><option value="20">20</option><option value="50">50</option></select></div>
            </footer>
          </section>

          <aside className="panel form-card">
            <div className="fc-head"><h2>Novo contrato de cobrança</h2><button className="fx" aria-label="Limpar" onClick={clearForm}><IcX /></button></div>
            <p className="fc-sub">Crie um novo contrato de cobrança recorrente.</p>
            <div className="fld"><label>Nome do cliente <span className="req">*</span></label>
              <select className="ctrl" value={f.cli} onChange={(e) => setF({ ...f, cli: e.target.value })} style={{ color: f.cli ? 'var(--ink)' : 'var(--muted)' }}>
                <option value="">Digite o nome do cliente...</option><option>João Silva — Silva Transportes</option><option>Maria Oliveira — Oliveira Comércio</option><option>Carlos Eduardo — Eduardo Serviços</option><option>Novo cliente...</option>
              </select>
            </div>
            <div className="fld"><label>Valor da dívida ou valor da cobrança <span className="req">*</span></label><input className="ctrl" type="text" placeholder="R$ 0,00" value={f.val} onChange={(e) => setF({ ...f, val: e.target.value })} /></div>
            <div className="fld"><label>Dia da cobrança <span className="req">*</span></label>
              <select className="ctrl" value={f.dia} onChange={(e) => setF({ ...f, dia: e.target.value })} style={{ color: f.dia ? 'var(--ink)' : 'var(--muted)' }}><option value="">Selecione o dia</option><option>5</option><option>10</option><option>15</option><option>20</option><option>25</option><option>30</option></select>
            </div>
            <div className="two">
              <div className="fld"><label>Ciclos totais <span className="req">*</span></label><input className="ctrl" type="text" value={f.tot} onChange={(e) => setF({ ...f, tot: e.target.value })} /></div>
              <div className="fld"><label>Ciclos restantes <span className="req">*</span></label><input className="ctrl" type="text" value={f.rest} onChange={(e) => setF({ ...f, rest: e.target.value })} /></div>
            </div>
            <div className="fld"><label>Data de início <span className="req">*</span></label><div className="ctrl-date"><input className="ctrl" type="text" value={f.data} onChange={(e) => setF({ ...f, data: e.target.value })} /><span className="cal"><IcCal /></span></div></div>
            <div className="fld"><label>Responsável <span className="req">*</span></label>
              <select className="ctrl" value={f.resp} onChange={(e) => setF({ ...f, resp: e.target.value })} style={{ color: f.resp ? 'var(--ink)' : 'var(--muted)' }}><option value="">Selecione o responsável</option><option>Henrique</option><option>Marina Lopes</option><option>Antônio César</option><option>Paula Ferreira</option></select>
            </div>
            <div className="fld"><label>Observações</label><div className="ta-wrap"><textarea className="ctrl" maxLength={300} placeholder="Digite observações sobre o contrato..." value={f.obs} onChange={(e) => setF({ ...f, obs: e.target.value })} /><span className="ta-count">{f.obs.length}/300</span></div></div>
            <button className="btn-save" onClick={save}><IcSave />Salvar contrato</button>
            <div className="fc-note"><span className="nic"><IcInfo /></span><p>Regra padrão aplicada: será cobrado 50% do valor economizado por 6 meses, conforme padrão da Atenvo.</p></div>
          </aside>
        </div>
      </div>

      {menu && (
        <div ref={menuRef} className="pop show" style={{ left: menu.left, top: menu.top }}>
          {MENU.map((m, i) => (
            <button key={m} className={'pop-item' + (i === 3 ? ' danger' : '')} onClick={() => { toast(m + ' · ' + menu.cli); setMenu(null); }}>
              {i === 0 ? <IcEye /> : i === 1 ? <IcEdit /> : i === 2 ? <IcPause /> : <IcTrash />}{m}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
