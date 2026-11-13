/* Registros — auditoria completa (só admin): tudo o que cada pessoa fez, em
   detalhe. Cada linha abre mostrando exatamente o que mudou (de → para).
   Filtros por período, tipo, pessoa e busca. */
import { useMemo, useState } from 'react';
import { BotaoSec, CardVidro, Chip, Chips, EstadoErro, EstadoVazio, Input, Kpi } from '../components';
import { useRegistros, type Mudanca, type PeriodoRegistros, type Registro } from '../data/cobranca/registros';

const PAPEL_ROT: Record<string, string> = { admin: 'Administrador', gestor: 'Gestor', comercial: 'Comercial', financeiro: 'Financeiro', cadastro: 'Cadastro' };
const GRUPO: Record<string, string> = {
  cliente: 'Clientes', pagamento: 'Financeiro', movimentação: 'Financeiro', grade: 'Financeiro',
  comissão: 'Comissões', régua: 'Régua e envios', 'mensagem da régua': 'Régua e envios', envio: 'Régua e envios',
  aviso: 'Avisos', usuário: 'Usuários',
};
const GRUPOS = ['Clientes', 'Financeiro', 'Comissões', 'Régua e envios', 'Avisos'] as const;
const PERIODOS = [['hoje', 'Hoje'], ['7d', '7 dias'], ['30d', '30 dias'], ['tudo', 'Tudo']] as const;

const CAMPO_ROT: Record<string, string> = {
  nome: 'Nome', comercial: 'Comercial', dia: 'Ciclo (dia)', valor: 'Valor da parcela',
  banco: 'Banco', nb: 'Nº do benefício', cpf: 'CPF', telefone: 'Telefone',
  reclame_login: 'Login Reclame Aqui', situacao: 'Situação', salario: 'Renda / Salário',
  faixa_beneficio: 'Faixa do benefício', obs: 'Observações', recebe: 'Banco que recebe',
  fechamento: 'Fechamento', ultimo_pgto: 'Último pagamento', data_reclamacao: 'Data da reclamação',
  data_parou: 'Data que parou', parou: 'Parou', pct: 'Comissão (%)', ativa: 'Régua ativa',
  hora_envio: 'Horário do disparo', estado: 'Estado', nome_contato: 'Contato',
  parado_pendente: 'Aguardando aprovação', parado_solicitado_nome: 'Pedido por', parado_aprovado_nome: 'Aprovado por',
};
const rotCampo = (c: string) => CAMPO_ROT[c] ?? (c.charAt(0).toUpperCase() + c.slice(1).replace(/_/g, ' '));
function valCampo(campo: string, v: string | null): string {
  if (v == null || v === '') return '—';
  if (campo === 'valor' || campo === 'salario') { const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) ? 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(v); }
  if (campo === 'dia') return 'dia ' + v;
  if (campo === 'situacao') return v === 'ativo' ? 'Débito ativo (Novos)' : v === 'cancelado' ? 'Débito parado (cobrança)' : v;
  if (campo === 'ativa') return v === 'true' ? 'ligada' : 'desligada';
  if (campo === 'parado_pendente') return v === 'true' ? 'sim' : 'não';
  if (campo === 'pct') return v + '%';
  return String(v);
}

const quandoLongo = (iso: string) => new Date(iso).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });

export function RevizaRegistros() {
  const [busca, setBusca] = useState('');
  const [pessoa, setPessoa] = useState('todas');
  const [grupo, setGrupo] = useState<'todos' | (typeof GRUPOS)[number]>('todos');
  const [periodo, setPeriodo] = useState<PeriodoRegistros>('tudo');
  const [aberto, setAberto] = useState<Set<number>>(new Set());
  // o período filtra na CONSULTA (gte em quando); aqui só sobram pessoa/grupo/busca
  const q = useRegistros(periodo);
  const regs = q.registros;

  const pessoas = useMemo(() => [...new Set(regs.map((r) => r.ator_nome))].sort(), [regs]);
  const lista = useMemo(() => {
    const s = busca.trim().toLowerCase();
    return regs.filter((r) => {
      if (pessoa !== 'todas' && r.ator_nome !== pessoa) return false;
      if (grupo !== 'todos' && (GRUPO[r.entidade] ?? 'Outros') !== grupo) return false;
      if (!s) return true;
      const campos = (r.mudancas ?? []).map((m) => rotCampo(m.c)).join(' ');
      return (r.ator_nome + ' ' + r.acao + ' ' + r.entidade + ' ' + (r.rotulo ?? '') + ' ' + (r.detalhe ?? '') + ' ' + campos).toLowerCase().includes(s);
    });
  }, [regs, busca, pessoa, grupo]);

  const toggle = (id: number) => setAberto((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <>
      <div className="kpis kpis-3 sobe">
        {/* totais vêm de count no servidor — a lista abaixo é paginada */}
        <Kpi rotulo="Ações registradas" valor={q.total ?? 0} />
        <Kpi rotulo="Hoje" valor={q.totalHoje ?? 0} />
        <Kpi rotulo="Pessoas na lista" valor={pessoas.length} />
      </div>

      {/* filtros: período e pessoa como seletores com rótulo; área como chips com o nome do grupo */}
      <div className="reg-filtros sobe" style={{ animationDelay: '.06s' }}>
        <div className="reg-fil-area" role="group" aria-label="Área">
          <span className="reg-fil-rot">Área</span>
          <Chips>
            <Chip ativo={grupo === 'todos'} onClick={() => setGrupo('todos')}>Todas</Chip>
            {GRUPOS.map((g) => <Chip key={g} ativo={grupo === g} onClick={() => setGrupo(g)}>{g}</Chip>)}
          </Chips>
        </div>
        <div className="reg-fil-dir">
          <label className="reg-fil-sel"><span>Período</span>
            <select className="inp" value={periodo} onChange={(e) => setPeriodo(e.target.value as PeriodoRegistros)}>
              {PERIODOS.map(([k, r]) => <option key={k} value={k}>{r}</option>)}
            </select>
          </label>
          <label className="reg-fil-sel"><span>Pessoa</span>
            <select className="inp" value={pessoa} onChange={(e) => setPessoa(e.target.value)}>
              <option value="todas">Todas</option>
              {pessoas.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <Input className="reg-busca" placeholder="Buscar…" title="Busca por pessoa, ação, cliente ou campo alterado" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar nos registros" />
        </div>
      </div>

      {/* cartão padrão (antes: "janela de terminal" com as bolinhas do macOS e fonte mono) */}
      <CardVidro spot sobe className="reg-card" style={{ animationDelay: '.12s' }}>
        <div className="card-cab reg-card-cab">
          <h3>Registros do sistema</h3>
          <span className="reg-vivo" title="A lista se atualiza sozinha"><i aria-hidden />Ao vivo</span>
        </div>
        <div className="reg-lista">
          {q.isLoading ? (
            <div className="reg-msg">Carregando registros…</div>
          ) : q.isError ? (
            <EstadoErro titulo="Não foi possível carregar os registros" descricao="Houve uma falha na consulta. Tente de novo." aoTentarDeNovo={() => void q.refetch()} />
          ) : lista.length === 0 ? (
            <EstadoVazio icone={<IconeRegistros />} titulo={q.total === 0 ? 'Nenhuma ação registrada ainda' : 'Nada com esse filtro'} descricao={q.total === 0 ? 'Cada cadastro, confirmação ou alteração da equipe aparece aqui: quem fez, o quê, quando e o que mudou.' : 'Ajuste o período, a pessoa, a área ou a busca.'} />
          ) : (
            <>
              {lista.map((r) => <LinhaRegistro key={r.id} r={r} aberto={aberto.has(r.id)} aoAbrir={() => toggle(r.id)} />)}
              {q.haMais && (
                <div className="reg-mais">
                  <span>{`Mostrando as ${regs.length} mais recentes do período`}</span>
                  <BotaoSec mini onClick={q.carregarMais} disabled={q.carregandoMais}>{q.carregandoMais ? 'Carregando…' : 'Carregar anteriores'}</BotaoSec>
                </div>
              )}
            </>
          )}
        </div>
      </CardVidro>
    </>
  );
}

/** estado vazio de Registros: lista com relógio (traço 1,5, o mesmo da barra lateral) */
const IconeRegistros = () => (
  <svg className="ic-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M4 6.5h9M4 11.5h6M4 16.5h5" /><circle cx="16.5" cy="15" r="4" /><path d="M16.5 13.2V15l1.2.9" />
  </svg>
);

function tomAcao(a: string): string {
  if (/exclu|recus|deslig|tirou|remov/.test(a)) return 'bad';
  if (/edit|atualiz|direcion|alter|configur|marc/.test(a)) return 'warn';
  if (/cadastr|criou|defin|public|lanç|confirm|lig/.test(a)) return 'ok';
  return 'mut';
}
const tsConsole = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });

const iniciaisDe = (n: string) => (String(n ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('') || '·').toUpperCase();
const quandoCurto = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', '');

function LinhaRegistro({ r, aberto, aoAbrir }: { r: Registro; aberto: boolean; aoAbrir: () => void }) {
  const muds: Mudanca[] = r.mudancas ?? [];
  const iso = new Date(r.quando).toISOString();
  const papelCurto = r.ator_papel ? (PAPEL_ROT[r.ator_papel] ?? r.ator_papel) : '';
  return (
    <div className={aberto ? 'reg-item aberto' : 'reg-item'}>
      <button type="button" className={'reg-cab t-' + tomAcao(r.acao)} onClick={aoAbrir} aria-expanded={aberto}>
        <span className="reg-av" aria-hidden>{iniciaisDe(r.ator_nome)}</span>
        <span className="reg-txt">
          <span className="reg-l1"><b>{r.ator_nome}</b> <span className="rl-acao">{r.acao}</span> {r.entidade}{r.rotulo ? <> <b className="rl-alvo">{r.rotulo}</b></> : null}</span>
          <span className="reg-l2">{[papelCurto, r.detalhe].filter(Boolean).join(' · ') || '—'}</span>
        </span>
        <span className="reg-quando num" title={tsConsole(r.quando)}>{quandoCurto(r.quando)}</span>
        <svg className={aberto ? 'reg-chev on' : 'reg-chev'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {aberto && (
        <div className="reg-det">
          {/* detalhe técnico de auditoria: mono só nos identificadores */}
          <div className="reg-tec">
            <div className="reg-tec-cab"><span className="reg-tec-badge">{r.entidade}</span><span className="reg-tec-id mono">registro #{r.id}</span></div>
            <div className="reg-tec-grid">
              <div className="reg-tec-cel"><span className="reg-k">Quem</span><span className="reg-v">{r.ator_nome}{r.ator_papel ? ` · ${PAPEL_ROT[r.ator_papel] ?? r.ator_papel}` : ''}</span><span className="reg-sub mono">id {r.ator_id ? r.ator_id.slice(0, 8) : '—'}</span></div>
              <div className="reg-tec-cel"><span className="reg-k">Ação</span><span className="reg-v">{r.acao} · {r.entidade}</span>{r.rotulo && <span className="reg-sub">{r.rotulo}</span>}</div>
              <div className="reg-tec-cel"><span className="reg-k">Quando</span><span className="reg-v">{quandoLongo(r.quando)}</span><span className="reg-sub mono">{iso}</span></div>
              <div className="reg-tec-cel"><span className="reg-k">Registro de</span><span className="reg-v">{r.entidade}</span><span className="reg-sub mono">{r.entidade_id ?? '—'}</span></div>
              <div className="reg-tec-cel reg-span2"><span className="reg-k">Detalhe</span><span className="reg-v">{r.detalhe ?? '—'}</span></div>
            </div>
          </div>
          {muds.length > 0 ? (
            <div className="reg-tab">
              <div className="reg-tab-h"><span>Campo</span><span>Valor anterior</span><span aria-hidden /><span>Valor novo</span></div>
              {muds.map((m, i) => (
                <div className="reg-tab-r" key={i}>
                  <span className="reg-tab-c">{rotCampo(m.c)}</span>
                  <span className="reg-tab-de num">{valCampo(m.c, m.de)}</span>
                  <span className="reg-tab-seta" aria-hidden>→</span>
                  <span className="reg-tab-para num">{valCampo(m.c, m.para)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="reg-semdiff">{r.acao === 'editou' || r.acao === 'atualizou' ? 'As alterações campo a campo passaram a ser registradas nas edições seguintes.' : 'Esta ação não altera campos de um cadastro (sem comparação antes e depois).'}</p>
          )}
        </div>
      )}
    </div>
  );
}
