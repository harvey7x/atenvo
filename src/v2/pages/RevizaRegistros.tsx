/* Registros — auditoria completa (só admin): tudo o que cada pessoa fez, em
   detalhe. Cada linha abre mostrando exatamente o que mudou (de → para).
   Filtros por período, tipo, pessoa e busca. */
import { useMemo, useState } from 'react';
import { BotaoSec, Chip, Chips, EstadoErro, EstadoVazio, Input, Kpi } from '../components';
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
      <div className="kpis sobe">
        {/* totais vêm de count no servidor — a lista abaixo é paginada */}
        <Kpi rotulo="Ações registradas" valor={q.total ?? 0} />
        <Kpi rotulo="Hoje" valor={q.totalHoje ?? 0} tomValor="ok" />
        <Kpi rotulo="Pessoas na lista" valor={pessoas.length} />
      </div>

      <div className="cob-filtros sobe" style={{ animationDelay: '.06s', gap: 10, flexWrap: 'wrap' }}>
        <Chips>
          {PERIODOS.map(([k, r]) => <Chip key={k} ativo={periodo === k} onClick={() => setPeriodo(k)}>{r}</Chip>)}
        </Chips>
        <span style={{ width: 1, alignSelf: 'stretch', background: 'var(--linha)' }} aria-hidden />
        <Chips>
          <Chip ativo={grupo === 'todos'} onClick={() => setGrupo('todos')}>Tudo</Chip>
          {GRUPOS.map((g) => <Chip key={g} ativo={grupo === g} onClick={() => setGrupo(g)}>{g}</Chip>)}
        </Chips>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 'auto' }}>
          <select className="inp" value={pessoa} onChange={(e) => setPessoa(e.target.value)} style={{ width: 170 }}>
            <option value="todas">Todas as pessoas</option>
            {pessoas.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <Input placeholder="Buscar por nome, ação, cliente, campo…" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar nos registros" />
        </div>
      </div>

      <div className="reg-console sobe" style={{ animationDelay: '.12s' }}>
        <div className="reg-console-bar">
          <span className="reg-dot r" aria-hidden /><span className="reg-dot y" aria-hidden /><span className="reg-dot g" aria-hidden />
          <span className="reg-console-tt mono">auditoria — registros do sistema</span>
          <span className="reg-live mono" aria-hidden>● ao vivo</span>
        </div>
        <div className="reg-console-body">
          {q.isLoading ? (
            <div className="reg-console-msg mono">carregando registros…</div>
          ) : q.isError ? (
            <EstadoErro titulo="Não deu para carregar os registros" descricao="Foi uma falha ao consultar — tente de novo." aoTentarDeNovo={() => void q.refetch()} />
          ) : lista.length === 0 ? (
            <EstadoVazio titulo={q.total === 0 ? 'Nenhuma ação registrada ainda' : 'Nada com esse filtro'} descricao={q.total === 0 ? 'Assim que a equipe cadastrar, confirmar ou alterar algo, aparece aqui — quem fez, o quê, quando e o que mudou.' : 'Ajuste o período, a pessoa, o tipo ou a busca.'} />
          ) : (
            <>
              {lista.map((r) => <LinhaRegistro key={r.id} r={r} aberto={aberto.has(r.id)} aoAbrir={() => toggle(r.id)} />)}
              {q.haMais && (
                <div className="ev-mais" style={{ padding: '10px 0 4px' }}>
                  <BotaoSec mini onClick={q.carregarMais} disabled={q.carregandoMais}>{q.carregandoMais ? 'Carregando…' : 'Carregar mais'}</BotaoSec>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      <p className="cm-hint" style={{ margin: '10px 2px 0' }}>Console de auditoria — tudo que cada pessoa faz (cadastros, edições, pagamentos, exclusões, régua…). Clique numa linha para abrir o detalhe técnico completo. Atualiza sozinho; visível só para o administrador.{q.haMais ? ` Carregadas as ${regs.length} mais recentes do período — "Carregar mais" busca as anteriores.` : ''}</p>
    </>
  );
}

function tomAcao(a: string): string {
  if (/exclu|recus|deslig|tirou|remov/.test(a)) return 'bad';
  if (/edit|atualiz|direcion|alter|configur|marc/.test(a)) return 'warn';
  if (/cadastr|criou|defin|public|lanç|confirm|lig/.test(a)) return 'ok';
  return 'mut';
}
const tsConsole = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });

function LinhaRegistro({ r, aberto, aoAbrir }: { r: Registro; aberto: boolean; aoAbrir: () => void }) {
  const muds: Mudanca[] = r.mudancas ?? [];
  const iso = new Date(r.quando).toISOString();
  const papelCurto = r.ator_papel ? (PAPEL_ROT[r.ator_papel] ?? r.ator_papel) : '';
  return (
    <div className={aberto ? 'reg-item aberto' : 'reg-item'}>
      <button type="button" className={'reg-line mono t-' + tomAcao(r.acao)} onClick={aoAbrir} aria-expanded={aberto}>
        <span className="rl-ts">{tsConsole(r.quando)}</span>
        <span className="rl-tag">[{r.ator_nome}{papelCurto ? '·' + papelCurto : ''}]</span>
        <span className="rl-msg"><span className="rl-acao">{r.acao}</span> {r.entidade}{r.rotulo ? <> <span className="rl-alvo">{r.rotulo}</span></> : null}{r.detalhe ? <span className="rl-det"> — {r.detalhe}</span> : null}</span>
        <span className={aberto ? 'reg-chev on' : 'reg-chev'} aria-hidden>⌄</span>
      </button>
      {aberto && (
        <div className="reg-det">
          {/* painel técnico de auditoria (estilo dev) */}
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
                  <span className="reg-tab-de mono">{valCampo(m.c, m.de)}</span>
                  <span className="reg-tab-seta mono" aria-hidden>→</span>
                  <span className="reg-tab-para mono">{valCampo(m.c, m.para)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="reg-semdiff">{r.acao === 'editou' || r.acao === 'atualizou' ? 'Alterações campo a campo passaram a ser registradas nas próximas edições.' : 'Esta ação não altera campos de um cadastro (sem comparação antes/depois).'}</p>
          )}
        </div>
      )}
    </div>
  );
}
