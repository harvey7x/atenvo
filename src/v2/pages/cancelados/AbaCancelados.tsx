/* =====================================================================
   CANCELADOS (mig 79, dono 27/10): "uma nova aba para cancelados… um botão que a gente consiga
   mover clientes para os cancelados… selecionar mais que um… quando o cliente estiver lá
   cancelado, a gente vai reativar a cobrança dele… em processo de reativação, ou desconto
   reativado". Reativado FICA aqui (AskUserQuestion 27/10) — alguém tira com "Voltar para Gestão".

   Nada é apagado: o cliente sai da Gestão, dos Novos, da carteira do painel e da régua; o
   histórico de pagamentos e comissões continua. O banco é a autoridade das permissões:
   mover/voltar = financeiro, cadastro, gestor, admin; o status também o comercial DONO.
   ===================================================================== */
import { useMemo, useState } from 'react';
import {
  BadgeStatus, BotaoPrimario, BotaoSec, CardVidro, Chip, Chips, Kpi, ModalV2, TabelaPadrao, type Coluna,
  EstadoVazio,
} from '../../components';
import { useCancelarLeads, useDadosCobranca, useStatusCancelamento, useVoltarDosCancelados } from '../../data/cobranca/hooks';
import { ROTULO_CANCELAMENTO, STATUS_CANCELAMENTO, TOM_CANCELAMENTO } from '../../data/cobranca/cancelados';
import type { GLinha, Papel, StatusCancelamento } from '../../data/cobranca/types';
import './cancelados.css';

const fmtBRL = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const d2 = (n: number) => String(n).padStart(2, '0');
/** "27/10/26" (data no fuso do navegador) */
const dataCurta = (iso?: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : `${d2(d.getDate())}/${d2(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}`;
};
const msgErro = (e: unknown) => (e instanceof Error ? e.message : String(e ?? 'Falhou. Tente de novo.'));
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const nClientes = (n: number) => `${n} cliente${n === 1 ? '' : 's'}`;

/** quem move pra cá e tira daqui (mesma lista do banco: pode_aprovar_parado) */
export const podeMoverCancelados = (gestor: boolean, papel?: Papel | null) => gestor || papel === 'financeiro' || papel === 'cadastro';

/* ---------------- modal: mover um ou vários clientes pros Cancelados ---------------- */
export function MoverCancelados({ candidatos, iniciais, aoFechar, aoMovido }: {
  /** clientes que podem ir (os da Gestão/Novos — sem os já cancelados) */
  candidatos: GLinha[];
  /** já marcados ao abrir (ex.: as linhas selecionadas na planilha) */
  iniciais: string[];
  aoFechar: () => void;
  aoMovido: (msg: string) => void;
}) {
  const mut = useCancelarLeads();
  const porId = useMemo(() => new Map(candidatos.map((l) => [l.id, l])), [candidatos]);
  const [sel, setSel] = useState<string[]>(() => iniciais.filter((id) => porId.has(id)));
  const [busca, setBusca] = useState('');
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState('');
  const q = norm(busca.trim());
  const dig = busca.replace(/\D/g, '');
  const achados = q
    ? candidatos.filter((l) => !sel.includes(l.id) && (norm(l.nome).includes(q) || (dig.length >= 3 && (l.cpf || '').replace(/\D/g, '').includes(dig)))).slice(0, 8)
    : [];
  const escolhidos = sel.map((id) => porId.get(id)).filter((l): l is GLinha => !!l);
  const mover = () => {
    if (!escolhidos.length || mut.isPending) return;
    setErro('');
    mut.mutate({ ids: escolhidos.map((l) => l.id), motivo }, {
      onSuccess: ({ n }) => aoMovido(n
        ? `${nClientes(n)} ${n === 1 ? 'foi' : 'foram'} para os Cancelados — saem da Gestão e da régua. É possível desfazer no Desfazer.`
        : 'Esses clientes já estavam nos Cancelados.'),
      onError: (e) => setErro(msgErro(e)),
    });
  };
  return (
    <ModalV2 aberto aoFechar={() => { if (!mut.isPending) aoFechar(); }} fecharNoVeu={!mut.isPending} largura={520}
      titulo={<div>Mover para Cancelados<div className="mod-sub">Saem da Gestão, dos Novos e da régua. Nada é apagado — os pagamentos ficam no histórico e é possível voltar pela aba Cancelados.</div></div>}
      rodape={<>
        <BotaoSec onClick={aoFechar} disabled={mut.isPending}>Cancelar</BotaoSec>
        <BotaoPrimario className="mc-bt-mover" onClick={mover} disabled={!escolhidos.length || mut.isPending}>
          {mut.isPending ? 'Movendo…' : escolhidos.length > 1 ? `Mover ${escolhidos.length} clientes` : 'Mover para Cancelados'}
        </BotaoPrimario>
      </>}>
      <div className="mc-mov">
        <div className="campo">
          <label htmlFor="mc-busca">Adicionar cliente</label>
          <input id="mc-busca" className="inp" type="search" placeholder="Buscar pelo nome ou CPF…" value={busca} autoFocus={!sel.length}
            onChange={(e) => setBusca(e.target.value)} disabled={mut.isPending} />
        </div>
        {achados.length > 0 && (
          <div className="mc-achados" role="listbox" aria-label="Clientes encontrados">
            {achados.map((l) => (
              <button type="button" key={l.id} className="gs-pick" role="option" aria-selected={false}
                onClick={() => { setSel((s) => [...s, l.id]); setBusca(''); }}>
                <b>{l.nome}</b><span>{l.comercial || '—'} · {l.dia > 0 ? `D${d2(l.dia)}` : 'Novos'}</span>
              </button>
            ))}
          </div>
        )}
        {q && achados.length === 0 && <p className="cm-hint">Nenhum cliente da Gestão com esse nome.</p>}

        <div className="mc-sel-cab">
          <span>{escolhidos.length ? `${nClientes(escolhidos.length)} selecionado${escolhidos.length === 1 ? '' : 's'}` : 'Nenhum cliente selecionado'}</span>
          {escolhidos.length > 1 && <button type="button" className="mc-lnk" onClick={() => setSel([])} disabled={mut.isPending}>limpar</button>}
        </div>
        {escolhidos.length > 0 ? (
          <ul className="mc-sel">
            {escolhidos.map((l) => (
              <li key={l.id}>
                <span className="mc-sel-nm">{l.nome}<small className="num">{l.comercial || '—'} · {l.dia > 0 ? `D${d2(l.dia)}` : 'Novos'} · mensalidade {fmtBRL(l.valor / 2)}</small></span>
                <button type="button" className="mc-sel-x" onClick={() => setSel((s) => s.filter((x) => x !== l.id))} disabled={mut.isPending}
                  aria-label={`Tirar ${l.nome} da seleção`} title="Tirar da seleção">×</button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="cm-hint">Selecione as linhas na planilha antes de abrir (é possível pegar várias de uma vez arrastando ou com Shift) ou busque o cliente aqui em cima.</p>
        )}

        <div className="campo">
          <label htmlFor="mc-motivo">Motivo <span className="mc-opc">opcional</span></label>
          <input id="mc-motivo" className="inp" maxLength={500} placeholder="Ex.: pediu o cancelamento, desconto não voltou…" value={motivo}
            onChange={(e) => setMotivo(e.target.value)} disabled={mut.isPending}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); mover(); } }} />
        </div>
        {erro && <p className="gs-erro" role="alert">{erro}</p>}
      </div>
    </ModalV2>
  );
}

/* ---------------- a aba ---------------- */
type FiltroSt = 'todos' | StatusCancelamento;

export function AbaCancelados({ gestor, papel }: { gestor: boolean; papel?: Papel | null }) {
  const { data: dados, isLoading, isError, refetch } = useDadosCobranca();
  const cancelados = useMemo(() => dados?.cancelados ?? [], [dados]);
  const statusMut = useStatusCancelamento();
  const voltarMut = useVoltarDosCancelados();
  const podeMover = podeMoverCancelados(gestor, papel);
  // o comercial só vê os clientes dele (o banco filtra) e muda o status deles (o banco confere)
  const podeStatus = podeMover || papel === 'comercial';
  const [filtro, setFiltro] = useState<FiltroSt>('todos');
  const [fCom, setFCom] = useState('');
  const [busca, setBusca] = useState('');
  const [sel, setSel] = useState<Set<string>>(() => new Set());
  const [aviso, setAviso] = useState('');
  const [mover, setMover] = useState(false);
  const ocupado = statusMut.isPending || voltarMut.isPending;

  const comerciais = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of cancelados) { const v = (l.comercial || '').trim(); if (v) m.set(v.toUpperCase(), v); }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
  }, [cancelados]);
  const conta = useMemo(() => {
    const c: Record<StatusCancelamento, number> = { cancelado: 0, em_reativacao: 0, reativado: 0 };
    for (const l of cancelados) if (l.cancelamento) c[l.cancelamento]++;
    return c;
  }, [cancelados]);
  const visiveis = useMemo(() => {
    const q = norm(busca.trim()); const dig = busca.replace(/\D/g, '');
    return cancelados
      .filter((l) => filtro === 'todos' || l.cancelamento === filtro)
      .filter((l) => !fCom || (l.comercial || '').trim().toUpperCase() === fCom)
      .filter((l) => !q || norm(l.nome).includes(q) || (dig.length >= 3 && ((l.cpf || '').replace(/\D/g, '').includes(dig) || (l.telefone || '').replace(/\D/g, '').includes(dig))))
      // mais recente primeiro (a última mudança de status manda)
      .sort((a, b) => (b.cancelamentoEm ?? b.canceladoEm ?? '').localeCompare(a.cancelamentoEm ?? a.canceladoEm ?? ''));
  }, [cancelados, filtro, fCom, busca]);
  // a seleção só vale pro que está na tela (mudou o filtro, o que saiu dele não é afetado)
  const idsVis = useMemo(() => new Set(visiveis.map((l) => l.id)), [visiveis]);
  const selVis = useMemo(() => new Set([...sel].filter((id) => idsVis.has(id))), [sel, idsVis]);

  const mudarStatus = (ids: string[], status: StatusCancelamento) => {
    if (!ids.length || ocupado) return;
    statusMut.mutate({ ids, status }, {
      onSuccess: ({ n }) => {
        setSel(new Set());
        setAviso(n
          ? `${nClientes(n)} agora ${n === 1 ? 'está' : 'estão'} como “${ROTULO_CANCELAMENTO[status]}”. É possível reverter no Desfazer.`
          : `Nada mudou — ${ids.length === 1 ? 'o cliente já estava' : 'os clientes já estavam'} como “${ROTULO_CANCELAMENTO[status]}”${podeMover ? '' : ' (ou não são seus)'}.`);
      },
      onError: (e) => setAviso(msgErro(e)),
    });
  };
  const voltar = (ids: string[]) => {
    if (!ids.length || ocupado) return;
    voltarMut.mutate(ids, {
      onSuccess: ({ n }) => {
        setSel(new Set());
        setAviso(n
          ? `${nClientes(n)} ${n === 1 ? 'voltou' : 'voltaram'} para a Gestão, no mesmo lugar da planilha, e ${n === 1 ? 'volta' : 'voltam'} para a régua. É possível reverter no Desfazer.`
          : 'Nada mudou — esses clientes já não estavam nos Cancelados.');
      },
      onError: (e) => setAviso(msgErro(e)),
    });
  };

  const cols: Coluna<GLinha>[] = [
    {
      chave: 'cli', titulo: 'Cliente', classe: 'nome',
      render: (l) => <div className="mc-cli"><b>{l.nome}</b><span className="num">{l.telefone || 'sem tel.'}</span></div>,
    },
    { chave: 'com', titulo: 'Comercial', render: (l) => l.comercial || '—' },
    { chave: 'ciclo', titulo: 'Ciclo', classe: 'num', render: (l) => (l.dia > 0 ? `D${d2(l.dia)}` : 'Novos') },
    { chave: 'mens', titulo: 'Mensalidade', dir: true, classe: 'num', render: (l) => fmtBRL(l.valor / 2) },
    {
      chave: 'quando', titulo: 'Cancelado em', classe: 'num',
      render: (l) => <div className="mc-quando"><span>{dataCurta(l.canceladoEm)}</span>{l.canceladoPorNome && <small>por {l.canceladoPorNome}</small>}</div>,
    },
    { chave: 'mot', titulo: 'Motivo', render: (l) => (l.cancelamentoMotivo ? <span className="mc-mot" title={l.cancelamentoMotivo}>{l.cancelamentoMotivo}</span> : <span className="mc-mut">—</span>) },
    {
      chave: 'st', titulo: 'Status',
      render: (l) => {
        const st = l.cancelamento ?? 'cancelado';
        const mudou = l.cancelamentoEm && l.cancelamentoEm !== l.canceladoEm;
        return (
          <div className="mc-st">
            {podeStatus ? (
              <select className={`inp mc-st-sel ${TOM_CANCELAMENTO[st]}`} value={st} disabled={ocupado}
                aria-label={`Status de ${l.nome}`} onChange={(e) => mudarStatus([l.id], e.target.value as StatusCancelamento)}>
                {STATUS_CANCELAMENTO.map((s) => <option key={s} value={s}>{ROTULO_CANCELAMENTO[s]}</option>)}
              </select>
            ) : <BadgeStatus tom={TOM_CANCELAMENTO[st]}>{ROTULO_CANCELAMENTO[st]}</BadgeStatus>}
            {mudou && <small className="num">{dataCurta(l.cancelamentoEm)}{l.cancelamentoPorNome ? ` · ${l.cancelamentoPorNome}` : ''}</small>}
          </div>
        );
      },
    },
    ...(podeMover ? [{
      chave: 'ac', titulo: '', dir: true,
      render: (l: GLinha) => <button type="button" className="cm-num-lnk" disabled={ocupado} onClick={() => voltar([l.id])}
        title="O cliente volta para a linha dele na Gestão e para a régua">Voltar para a Gestão</button>,
    }] : []),
  ];

  const acoes = [
    ...(podeStatus ? STATUS_CANCELAMENTO.map((s) => ({ rotulo: ROTULO_CANCELAMENTO[s], onClick: (ids: string[]) => mudarStatus(ids, s) })) : []),
    ...(podeMover ? [{ rotulo: 'Voltar para a Gestão', onClick: (ids: string[]) => voltar(ids) }] : []),
  ];
  const mensal = cancelados.reduce((s, l) => s + l.valor / 2, 0);

  return (
    <div className="fin-raiz mc-raiz">
      {aviso && <div className="gs-aviso" role="status"><span>{aviso}</span><button type="button" className="gs-aviso-x" onClick={() => setAviso('')} aria-label="Fechar">×</button></div>}
      {/* crítica 12/11: sem nenhum cancelado, um estado vazio desenhado (sem KPIs e filtros zerados) */}
      {!isLoading && !isError && cancelados.length === 0 ? (
        <CardVidro spot className="fin-panel mc-vazio sobe">
          <EstadoVazio
            icone={<svg className="ic-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="9" cy="8" r="3.5" /><path d="M3 19v-1a5 5 0 0 1 5-5h2a5 5 0 0 1 3.2 1.2" /><path d="m16 15 5 5m0-5-5 5" /></svg>}
            titulo={podeMover ? 'Nenhum cliente cancelado' : 'Nenhum cliente seu nos Cancelados'}
            descricao={podeMover
              ? 'Clientes que saem da cobrança ficam aqui, fora da Gestão e da régua, com o histórico preservado.'
              : 'Quando um cliente seu sair da cobrança, ele aparece aqui.'}
            acao={podeMover && dados ? { rotulo: 'Mover clientes…', onClick: () => setMover(true) } : undefined} />
        </CardVidro>
      ) : (
      <>
      <div className="kpis sobe">
        <Kpi rotulo="Cancelados" valor={cancelados.length} formato="mil" nota="fora da cobrança e da régua" />
        <Kpi rotulo="Em reativação" valor={conta.em_reativacao} formato="mil" nota={conta.em_reativacao > 0 ? 'aguardando o desconto voltar' : 'nenhum em andamento'} />
        <Kpi rotulo="Desconto reativado" valor={conta.reativado} formato="mil"
          nota={conta.reativado > 0 && podeMover ? 'volte para a Gestão após conferir' : conta.reativado > 0 ? 'aguardando a volta para a Gestão' : 'nenhum reativado'} />
        <Kpi rotulo="Mensalidades fora" valor={Math.trunc(mensal)} formato="mil" prefixo="R$ " sufixo={`,${String(Math.round((mensal % 1) * 100)).padStart(2, '0')}`}
          nota="por mês, que deixaram de entrar" />
      </div>
      <CardVidro spot className="fin-panel sobe" style={{ animationDelay: '.1s' }}>
        <div className="fin-head">
          <h3 title={`Clientes que saíram da cobrança: não aparecem na Gestão nem nos Novos e não recebem a régua; os pagamentos antigos continuam no histórico e nas comissões. Na reativação, marque Em processo de reativação e, quando o desconto voltar, Desconto reativado.${podeMover ? ' Para cobrar de novo, use Voltar para a Gestão: o cliente volta para a linha dele na planilha.' : ''}`}>Cancelados</h3>
          <span className="pl-count num">{visiveis.length}</span>
          <div className="fin-filtros">
            {podeMover && <BotaoPrimario onClick={() => setMover(true)} disabled={!dados}>Mover clientes…</BotaoPrimario>}
            {comerciais.length > 1 && (
              <select className="inp pl-sel" value={fCom} onChange={(e) => setFCom(e.target.value)} aria-label="Filtrar por comercial">
                <option value="">Comercial: todos</option>
                {comerciais.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            )}
            <input className="inp" type="search" placeholder="Buscar cliente…" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar cliente" />
          </div>
        </div>
        <div className="mc-filtros">
          <Chips>
            <Chip ativo={filtro === 'todos'} onClick={() => setFiltro('todos')}>Todos <span className="num">{cancelados.length}</span></Chip>
            {STATUS_CANCELAMENTO.map((s) => (
              <Chip key={s} ativo={filtro === s} onClick={() => setFiltro(s)}>{ROTULO_CANCELAMENTO[s]} <span className="num">{conta[s]}</span></Chip>
            ))}
          </Chips>
          {acoes.length > 0 && visiveis.length > 1 && selVis.size < visiveis.length && (
            <button type="button" className="mc-lnk mc-todos" onClick={() => setSel(new Set(visiveis.map((l) => l.id)))}>
              Selecionar os {visiveis.length} da lista
            </button>
          )}
        </div>
        {isError ? (
          <div className="fin-vazio">Não foi possível carregar os cancelados. <button type="button" className="mc-lnk" onClick={() => { void refetch(); }}>Tentar de novo</button></div>
        ) : isLoading ? (
          <div className="fin-vazio">Carregando…</div>
        ) : visiveis.length === 0 ? (
          <div className="fin-vazio">{cancelados.length ? 'Nenhum cancelado neste filtro.' : podeMover ? 'Nenhum cliente nos Cancelados. Mova pela Gestão (selecione as linhas → botão direito → Mover para Cancelados) ou pelo botão “Mover clientes…”.' : 'Nenhum cliente seu nos Cancelados.'}</div>
        ) : (
          <TabelaPadrao colunas={cols} linhas={visiveis} chave={(l) => l.id}
            selecao={acoes.length ? {
              selecionadas: selVis,
              aoAlternar: (id) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }),
              aoLimpar: () => setSel(new Set()),
              acoes,
              rotuloContagem: (n) => `${nClientes(n)} selecionado${n === 1 ? '' : 's'}`,
            } : undefined}
            rodape={{ texto: `${nClientes(visiveis.length)} · ${fmtBRL(visiveis.reduce((s, l) => s + l.valor / 2, 0))} em mensalidades` }} />
        )}
      </CardVidro>
      </>
      )}
      {mover && dados && (
        <MoverCancelados candidatos={dados.linhas} iniciais={[]} aoFechar={() => setMover(false)}
          aoMovido={(m) => { setMover(false); setAviso(m); }} />
      )}
    </div>
  );
}
