import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useOrg } from '@/context/OrgContext';
import { useBuscaContatos, type ContatoRow } from '@/data/contatos';
import { useOrgUsuarios } from '@/data/atendimento';
import { parseMoedaBRL, formataMoedaBRL } from '@/lib/fichaJudicialNormalizers';
import {
  COB_REAL, useCobrancas, useCobranca, useCobrancasMetricas,
  useCriarCobranca, useRegistrarBaixa, useAlterarStatusParcela, useCancelarCobranca,
  statusCobrancaLabel, statusParcelaLabel,
  type Cobranca, type CobrancaDetalhe, type CobrancaParcela,
} from '@/data/cobrancas';
import {
  BadgeStatus, BotaoMini, BotaoPrimario, BotaoSec, CardVidro, Chip, Chips,
  ConfirmDialogV2, EstadoErro, EstadoVazio, Input, Kpi, ModalV2, Skeleton, TabelaPadrao,
  type Coluna, type TomStatus,
} from '../components';
import { AbaCiclos, AbaRegua, AbaNumeros, AbaEnvios, AbaAtendentes, AbaClientes, PainelResumo } from './cobrancaMotor';
import { CICLOS_LISTA } from './cobrancaAnalytics';
import './cobrancas.css';

/** próxima ocorrência do dia de vencimento do ciclo (deriva a 1ª cobrança da turma) */
function proximaDataDoDia(dia: number): string {
  const h = new Date();
  let y = h.getFullYear(), m = h.getMonth();
  if (h.getDate() > dia) m += 1;
  const last = new Date(y, m + 1, 0).getDate();
  return new Date(y, m, Math.min(dia, last)).toISOString().slice(0, 10);
}

type AbaCobranca = 'painel' | 'atendentes' | 'clientes' | 'ciclos' | 'regua' | 'numeros' | 'envios';
const ABAS: { id: AbaCobranca; rotulo: string }[] = [
  { id: 'painel', rotulo: 'Painel' },
  { id: 'atendentes', rotulo: 'Atendentes' },
  { id: 'clientes', rotulo: 'Clientes' },
  { id: 'ciclos', rotulo: 'Ciclos' },
  { id: 'regua', rotulo: 'Régua de mensagens' },
  { id: 'numeros', rotulo: 'Números' },
  { id: 'envios', rotulo: 'Envios' },
];

/* ------------------------------------------------------------------
   Cobranças v2 — layout do pg-cobrancas; funcional de CobrancasApp
   (somente leitura). Dados/mutações da camada src/data/cobrancas.ts.
   Modo demonstração (COB_REAL=false): seed local com mutações em
   memória — paridade com o gate WA_REAL do v1, agora na UI unificada.
   ------------------------------------------------------------------ */

const fmtBRL = (v: number) => formataMoedaBRL(v);
const dataBR = (iso?: string | null) => { const m = (iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : '—'; };
const hojeISO = () => new Date().toISOString().slice(0, 10);
/** Divide dinheiro em inteiro + centavos para o KPI (.cent esmaecido). */
const kpiDinheiro = (v: number) => ({ int: Math.trunc(v), cent: `,${Math.round((v % 1) * 100).toString().padStart(2, '0')}` });

const TOM_COBRANCA: Record<string, TomStatus> = { ativo: 'ok', finalizado: 'neutro', cancelado: 'erro' };
function tomParcela(p: CobrancaParcela): { tom: TomStatus; rotulo: string } {
  if (p.status === 'paga') return { tom: 'ok', rotulo: statusParcelaLabel[p.status] };
  if (p.status === 'cancelada') return { tom: 'neutro', rotulo: statusParcelaLabel[p.status] };
  if (p.atrasada || p.status === 'nao_paga') return { tom: 'erro', rotulo: p.status === 'prevista' && p.atrasada ? 'Atrasada' : statusParcelaLabel[p.status] };
  return { tom: 'atencao', rotulo: statusParcelaLabel[p.status] };
}

/** Tradução de erros de RPC/RLS — idêntica ao v1. */
function traduz(msg: string): string {
  const m = (msg || '').toLowerCase();
  if (m.includes('sem_permissao') || m.includes('row-level') || m.includes('permission')) return 'Você não tem permissão para esta ação.';
  if (m.includes('parcela_ja_paga')) return 'Esta parcela já está paga.';
  if (m.includes('cobranca_cancelada')) return 'A cobrança está cancelada.';
  if (m.includes('cobranca_finalizada')) return 'Cobrança já finalizada.';
  if (m.includes('valor_invalido')) return 'Valor inválido.';
  if (m.includes('ciclos_invalido')) return 'Quantidade de parcelas inválida.';
  if (m.includes('contato_invalido')) return 'Cliente inválido.';
  if (m.includes('transicao_nao_permitida')) return 'Transição de status não permitida.';
  return 'Não foi possível concluir: ' + msg;
}

/* ---------- modo demonstração: seed + mutações em memória ---------- */

function parcelasDemo(id: string, valor: number, total: number, pagas: number, primeira: string): CobrancaParcela[] {
  const base = new Date(primeira + 'T00:00:00');
  return Array.from({ length: total }, (_, i) => {
    const d = new Date(base.getFullYear(), base.getMonth() + i, base.getDate());
    const iso = d.toISOString().slice(0, 10);
    const paga = i < pagas;
    return {
      id: `${id}-p${i + 1}`, ciclo: i + 1, valor, valorPago: paga ? valor : null,
      dataPrevista: iso, dataPagamento: paga ? iso : null,
      status: paga ? 'paga' as const : 'prevista' as const, observacoes: '',
      atrasada: !paga && iso < hojeISO(),
    };
  });
}

function seedDemo(): CobrancaDetalhe[] {
  const mkIso = (deltaMeses: number) => { const d = new Date(); d.setMonth(d.getMonth() + deltaMeses); return d.toISOString().slice(0, 10); };
  const base = [
    { nome: 'Maria Aparecida Souza', tel: '(51) 98812-4407', valor: 320, total: 12, pagas: 3, primeira: mkIso(-3), resp: 'Giovana' },
    { nome: 'José Carlos Ferreira', tel: '(51) 99214-8830', valor: 280, total: 12, pagas: 4, primeira: mkIso(-5), resp: 'Matheus' },
    { nome: 'Antônio Pereira Lima', tel: '(51) 98120-7745', valor: 450, total: 10, pagas: 0, primeira: mkIso(0), resp: 'Giovana' },
    { nome: 'Terezinha M. Alves', tel: '(51) 99760-3312', valor: 190, total: 24, pagas: 8, primeira: mkIso(-8), resp: 'Matheus' },
    { nome: 'Sebastião R. Nunes', tel: '(51) 98455-1029', valor: 260, total: 6, pagas: 6, primeira: mkIso(-6), resp: '' },
    { nome: 'Ivone F. Cardoso', tel: '(51) 99331-6688', valor: 300, total: 12, pagas: 1, primeira: mkIso(-1), resp: 'Giovana' },
  ];
  return base.map((b, i) => {
    const id = `demo-${i + 1}`;
    const parcelas = parcelasDemo(id, b.valor, b.total, b.pagas, b.primeira);
    const prox = parcelas.find((p) => p.status === 'prevista');
    const concluida = b.pagas >= b.total;
    return {
      id, contatoId: `ct-${i}`, contatoNome: b.nome, contatoTelefone: b.tel, contatoCpf: '',
      responsavelId: null, responsavelNome: b.resp, servico: 'Honorários', valorMensal: b.valor,
      ciclosTotais: b.total, ciclosPagos: b.pagas, ciclosRestantes: b.total - b.pagas,
      proximaCobranca: prox?.dataPrevista ?? null, status: concluida ? 'finalizado' : 'ativo',
      dataInicio: b.primeira, observacoes: '', criadoEm: b.primeira,
      parcelas, eventos: [],
    };
  });
}

function recalc(c: CobrancaDetalhe): CobrancaDetalhe {
  const pagas = c.parcelas.filter((p) => p.status === 'paga').length;
  const prox = c.parcelas.find((p) => p.status === 'prevista');
  const canceladas = c.parcelas.every((p) => p.status === 'paga' || p.status === 'cancelada');
  return {
    ...c, ciclosPagos: pagas, ciclosRestantes: c.ciclosTotais - pagas,
    proximaCobranca: prox?.dataPrevista ?? null,
    status: c.status === 'cancelado' ? 'cancelado' : pagas >= c.ciclosTotais || canceladas ? 'finalizado' : 'ativo',
  };
}

function metricasDe(lista: CobrancaDetalhe[]) {
  const mesAtual = hojeISO().slice(0, 7);
  const m = { previstoMes: 0, recebidoMes: 0, emAtraso: 0, aReceber: 0 };
  const prevMap = new Map<string, { mes: string; previsto: number; recebido: number; atraso: number; qtd: number }>();
  for (const c of lista) for (const p of c.parcelas) {
    const mes = (p.dataPrevista || '').slice(0, 7);
    if (mes === mesAtual) m.previstoMes += p.valor;
    if (p.status === 'paga' && (p.dataPagamento || '').slice(0, 7) === mesAtual) m.recebidoMes += p.valorPago ?? 0;
    if (p.atrasada) m.emAtraso += p.valor;
    if (p.status === 'prevista' || p.status === 'nao_paga') m.aReceber += p.valor;
    if (mes >= mesAtual) {
      const e = prevMap.get(mes) ?? { mes, previsto: 0, recebido: 0, atraso: 0, qtd: 0 };
      e.previsto += p.valor; e.qtd += 1;
      if (p.status === 'paga') e.recebido += p.valorPago ?? 0;
      if (p.atrasada) e.atraso += p.valor;
      prevMap.set(mes, e);
    }
  }
  const previsao = [...prevMap.values()].sort((a, b) => a.mes.localeCompare(b.mes)).slice(0, 6);
  return { m, previsao };
}

/* ------------------------------- página ------------------------------- */

type Aviso = { tom: 'ok' | 'erro'; texto: string } | null;

export default function CobrancasV2() {
  const { currentOrg } = useOrg();
  const gestor = currentOrg.role === 'admin' || currentOrg.role === 'gestor';
  const demo = !COB_REAL;

  // fontes reais (desabilitadas sem backend) + store demo em memória
  const cobQ = useCobrancas();
  const metQ = useCobrancasMetricas();
  const [demoLista, setDemoLista] = useState<CobrancaDetalhe[]>(() => (demo ? seedDemo() : []));
  const criarMut = useCriarCobranca();
  const baixaMut = useRegistrarBaixa();
  const alterarMut = useAlterarStatusParcela();
  const cancelarMut = useCancelarCobranca();

  const [aba, setAba] = useState<AbaCobranca>('painel');
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<'todas' | 'ativa' | 'concluida' | 'cancelada'>('todas');
  const [pagina, setPagina] = useState(1);
  const [selecionadas, setSelecionadas] = useState<ReadonlySet<string>>(new Set());
  const [novo, setNovo] = useState(false);
  const [detId, setDetId] = useState<string | null>(null);
  const [aviso, setAviso] = useState<Aviso>(null);

  const cobrancas: Cobranca[] = demo ? demoLista : (cobQ.data ?? []);
  const metricas = demo ? metricasDe(demoLista) : metQ.data;
  const carregando = !demo && cobQ.isLoading;
  const erro = !demo && cobQ.isError;

  const termo = busca.trim().toLowerCase();
  const lista = useMemo(() => {
    const f = cobrancas.filter((c) => {
      if (filtro === 'ativa' && (c.status === 'finalizado' || c.status === 'cancelado')) return false;
      if (filtro === 'concluida' && c.status !== 'finalizado') return false;
      if (filtro === 'cancelada' && c.status !== 'cancelado') return false;
      if (!termo) return true;
      return (c.contatoNome + ' ' + c.contatoTelefone + ' ' + c.contatoCpf + ' ' + c.responsavelNome).toLowerCase().includes(termo);
    });
    // ordenação padrão por vencimento (próxima cobrança), sem vencimento ao fim
    return [...f].sort((a, b) => (a.proximaCobranca ?? '9999') < (b.proximaCobranca ?? '9999') ? -1 : 1);
  }, [cobrancas, filtro, termo]);

  const POR_PAGINA = 10;
  const totalPaginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA));
  const paginaVisivel = Math.min(pagina, totalPaginas);
  const linhasPagina = lista.slice((paginaVisivel - 1) * POR_PAGINA, paginaVisivel * POR_PAGINA);

  /* ações unificadas: RPCs reais ou mutação do seed demo (mesmos fluxos de UI) */
  const acoes = {
    async criar(args: { contatoId: string; contatoNome: string; contatoTelefone: string; valor: number; dataPrimeira: string; ciclos: number; responsavelId: string | null; responsavelNome: string; servico: string | null; observacoes: string | null }) {
      if (demo) {
        const id = `demo-${Date.now()}`;
        const parcelas = parcelasDemo(id, args.valor, args.ciclos, 0, args.dataPrimeira);
        setDemoLista((l) => [...l, recalc({
          id, contatoId: args.contatoId, contatoNome: args.contatoNome, contatoTelefone: args.contatoTelefone, contatoCpf: '',
          responsavelId: args.responsavelId, responsavelNome: args.responsavelNome, servico: args.servico || '', valorMensal: args.valor,
          ciclosTotais: args.ciclos, ciclosPagos: 0, ciclosRestantes: args.ciclos, proximaCobranca: args.dataPrimeira,
          status: 'ativo', dataInicio: args.dataPrimeira, observacoes: args.observacoes || '', criadoEm: args.dataPrimeira,
          parcelas, eventos: [],
        })]);
        return;
      }
      await criarMut.mutateAsync({ contatoId: args.contatoId, valor: args.valor, dataPrimeira: args.dataPrimeira, ciclos: args.ciclos, responsavelId: args.responsavelId, servico: args.servico, observacoes: args.observacoes });
    },
    async baixa(args: { parcelaId: string; cobrancaId: string; data: string; obs: string | null }) {
      if (demo) {
        setDemoLista((l) => l.map((c) => c.id !== args.cobrancaId ? c : recalc({
          ...c,
          parcelas: c.parcelas.map((p) => p.id !== args.parcelaId ? p : { ...p, status: 'paga', dataPagamento: args.data, valorPago: p.valor, atrasada: false }),
        })));
        return;
      }
      await baixaMut.mutateAsync(args);
    },
    async alterarStatus(args: { parcelaId: string; cobrancaId: string; novo: 'nao_paga' | 'prevista' }) {
      if (demo) {
        setDemoLista((l) => l.map((c) => c.id !== args.cobrancaId ? c : recalc({
          ...c,
          parcelas: c.parcelas.map((p) => p.id !== args.parcelaId ? p : {
            ...p, status: args.novo, dataPagamento: null, valorPago: null,
            atrasada: args.novo === 'prevista' && !!p.dataPrevista && p.dataPrevista < hojeISO(),
          }),
        })));
        return;
      }
      await alterarMut.mutateAsync(args);
    },
    async cancelar(args: { cobrancaId: string }) {
      if (demo) {
        setDemoLista((l) => l.map((c) => c.id !== args.cobrancaId ? c : {
          ...recalc({ ...c, parcelas: c.parcelas.map((p) => p.status === 'paga' ? p : { ...p, status: 'cancelada', atrasada: false }) }),
          status: 'cancelado',
        }));
        return;
      }
      await cancelarMut.mutateAsync(args);
    },
  };

  function alternarSelecao(id: string) {
    setSelecionadas((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  /* exportação CSV client-side da seleção — anatomia do bulk do mockup;
     única ação em massa (o v1 não tem mutações em massa e nada foi inventado) */
  function exportarSelecao(ids: string[]) {
    const sel = lista.filter((c) => ids.includes(c.id));
    const esc = (s: string) => `"${(s || '').replace(/"/g, '""')}"`;
    const linhas = [
      ['Cliente', 'Telefone', 'Valor mensal', 'Pagas', 'Total', 'Próxima', 'Status', 'Responsável'].join(';'),
      ...sel.map((c) => [esc(c.contatoNome), esc(c.contatoTelefone), String(c.valorMensal).replace('.', ','), String(c.ciclosPagos), String(c.ciclosTotais), dataBR(c.proximaCobranca), statusCobrancaLabel(c.status), esc(c.responsavelNome)].join(';')),
    ].join('\n');
    const blob = new Blob(['﻿' + linhas], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `cobrancas-${hojeISO()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    setAviso({ tom: 'ok', texto: `${sel.length} cobrança${sel.length === 1 ? '' : 's'} exportada${sel.length === 1 ? '' : 's'} em CSV.` });
  }

  const COLUNAS: Coluna<Cobranca>[] = [
    { chave: 'cliente', titulo: 'Cliente', render: (c) => <div><div className="cli-nm">{c.contatoNome}</div><div className="cli-tel num">{c.contatoTelefone || '—'}</div></div> },
    { chave: 'valor', titulo: 'Valor mensal', dir: true, classe: 'val-t num', render: (c) => { const d = kpiDinheiro(c.valorMensal); return <>R$ {d.int.toLocaleString('pt-BR')}<span className="cent">{d.cent}</span></>; } },
    { chave: 'ciclos', titulo: 'Ciclos', classe: 'num', render: (c) => `${c.ciclosPagos} de ${c.ciclosTotais} pagas` },
    { chave: 'proxima', titulo: 'Próxima ↓', dir: true, classe: 'num', render: (c) => dataBR(c.proximaCobranca) },
    { chave: 'status', titulo: 'Status', render: (c) => <BadgeStatus tom={TOM_COBRANCA[c.status] ?? 'neutro'}>{statusCobrancaLabel(c.status)}</BadgeStatus> },
    { chave: 'resp', titulo: 'Responsável', render: (c) => c.responsavelNome || <span style={{ color: 'var(--txt-3)' }}>—</span> },
  ];

  const kpi = metricas?.m;
  const kPrev = kpi ? kpiDinheiro(kpi.previstoMes) : null;
  const kRec = kpi ? kpiDinheiro(kpi.recebidoMes) : null;
  const kAtr = kpi ? kpiDinheiro(kpi.emAtraso) : null;
  const kRcb = kpi ? kpiDinheiro(kpi.aReceber) : null;

  return (
    <>
      <div className="ph sobe">
        <div>
          <h2>Cobranças</h2>
          <p>Cobranças que sua organização faz aos próprios clientes.{demo ? ' · modo demonstração (nada é gravado)' : ''}</p>
        </div>
        <div className="acoes">
          {gestor && aba === 'painel' && <BotaoPrimario onClick={() => setNovo(true)}>＋ Nova cobrança</BotaoPrimario>}
        </div>
      </div>

      <div className="cob-abas sobe" role="tablist" aria-label="Seções de cobrança" style={{ animationDelay: '.03s' }}>
        {ABAS.map((a) => (
          <button key={a.id} type="button" role="tab" aria-selected={aba === a.id}
            className={aba === a.id ? 'cob-aba on' : 'cob-aba'} onClick={() => setAba(a.id)}>
            {a.rotulo}
          </button>
        ))}
      </div>

      {aviso && (
        <div className={aviso.tom === 'erro' ? 'aviso-inline erro' : 'aviso-inline'} role="status">
          {aviso.texto}
          <button type="button" onClick={() => setAviso(null)} aria-label="Fechar aviso">×</button>
        </div>
      )}

      {/* Fora do modo demo, as abas do motor ainda mostram o seed de revisão —
          a faixa evita que a equipe confunda os clientes simulados com reais.
          Some na Fase C, quando o motor liga nos dados de verdade. */}
      {!demo && aba !== 'painel' && (
        <div className="cm-aviso-sim">
          Demonstração do Modo Cobrança — os clientes e números destas abas são <b>simulados</b> para revisão. A ligação com os dados reais é a próxima fase.
        </div>
      )}
      {aba === 'atendentes' && <AbaAtendentes />}
      {aba === 'clientes' && <AbaClientes />}
      {aba === 'ciclos' && <AbaCiclos gestor={gestor} aoAvisar={(t) => setAviso({ tom: 'ok', texto: t })} />}
      {aba === 'regua' && <AbaRegua gestor={gestor} aoAvisar={(t) => setAviso({ tom: 'ok', texto: t })} />}
      {aba === 'numeros' && <AbaNumeros gestor={gestor} aoAvisar={(t) => setAviso({ tom: 'ok', texto: t })} />}
      {aba === 'envios' && <AbaEnvios gestor={gestor} aoAvisar={(t) => setAviso({ tom: 'ok', texto: t })} />}

      {aba === 'painel' && (erro ? (
        <CardVidro sobe>
          <EstadoErro descricao="Não conseguimos carregar as cobranças. Verifique a conexão." aoTentarDeNovo={() => cobQ.refetch()} />
        </CardVidro>
      ) : carregando ? (
        <CarregandoCobrancas />
      ) : (
        <>
          {demo ? <PainelResumo /> : (
            <div className="kpis sobe" style={{ animationDelay: '.06s' }}>
              <Kpi rotulo="Previsto no mês" valor={kPrev?.int ?? 0} formato="mil" prefixo="R$ " sufixo={kPrev?.cent ?? ',00'} />
              <Kpi rotulo="Recebido no mês" valor={kRec?.int ?? 0} formato="mil" prefixo="R$ " sufixo={kRec?.cent ?? ',00'} tomValor="ok" />
              <Kpi rotulo="Em atraso" valor={kAtr?.int ?? 0} formato="mil" prefixo="R$ " sufixo={kAtr?.cent ?? ',00'} tomValor={kpi && kpi.emAtraso > 0 ? 'erro' : undefined} />
              <Kpi rotulo="A receber" valor={kRcb?.int ?? 0} formato="mil" prefixo="R$ " sufixo={kRcb?.cent ?? ',00'} />
            </div>
          )}
          {demo && <div className="cm-sec-lista sobe" style={{ animationDelay: '.26s' }}><span className="caps">Cobranças ativas</span></div>}

          <div className="cob-filtros sobe" style={{ animationDelay: '.12s' }}>
            <Chips>
              <Chip ativo={filtro === 'todas'} onClick={() => { setFiltro('todas'); setPagina(1); }}>Todas</Chip>
              <Chip ativo={filtro === 'ativa'} onClick={() => { setFiltro('ativa'); setPagina(1); }}>Ativas</Chip>
              <Chip ativo={filtro === 'concluida'} onClick={() => { setFiltro('concluida'); setPagina(1); }}>Concluídas</Chip>
              <Chip ativo={filtro === 'cancelada'} onClick={() => { setFiltro('cancelada'); setPagina(1); }}>Canceladas</Chip>
            </Chips>
            <div className="cob-busca">
              <Input placeholder="Buscar por cliente, telefone, CPF ou responsável…" value={busca} onChange={(e) => { setBusca(e.target.value); setPagina(1); }} aria-label="Buscar cobranças" />
            </div>
          </div>

          <CardVidro spot sobe style={{ borderRadius: 'var(--r-card)', animationDelay: '.18s' }}>
            {lista.length === 0 ? (
              cobrancas.length === 0 ? (
                <EstadoVazio
                  titulo="Nenhuma cobrança cadastrada"
                  descricao="Cadastre uma cobrança recorrente para um cliente do escritório."
                  acao={gestor ? { rotulo: '＋ Criar primeira cobrança', onClick: () => setNovo(true) } : undefined}
                />
              ) : (
                <EstadoVazio
                  titulo="Nenhuma cobrança encontrada"
                  descricao="Ajuste a busca ou os filtros."
                  acao={{ rotulo: 'Limpar filtros', onClick: () => { setFiltro('todas'); setBusca(''); setPagina(1); } }}
                />
              )
            ) : (
              <TabelaPadrao
                colunas={COLUNAS}
                linhas={linhasPagina}
                chave={(c) => c.id}
                aoClicarLinha={(c) => setDetId(c.id)}
                selecao={{
                  selecionadas,
                  aoAlternar: alternarSelecao,
                  aoLimpar: () => setSelecionadas(new Set()),
                  acoes: [{ rotulo: 'Exportar CSV', onClick: exportarSelecao }],
                  rotuloContagem: (n) => (n === 1 ? '1 selecionada' : `${n} selecionadas`),
                }}
                rodape={{
                  texto: `${lista.length} cobrança${lista.length === 1 ? '' : 's'}`,
                  paginacao: { pagina: paginaVisivel, totalPaginas, aoIr: setPagina },
                }}
              />
            )}
          </CardVidro>

          {metricas && metricas.previsao.some((p) => p.previsto > 0) && (
            <div className="sobe" style={{ marginTop: 20, animationDelay: '.24s' }}>
              <span className="caps" style={{ display: 'block', marginBottom: 10 }}>Previsão de faturamento (6 meses)</span>
              <div className="prev-grid">
                {metricas.previsao.map((p) => (
                  <CardVidro spot className="prev-card" key={p.mes}>
                    <div className="prev-mes num">{p.mes.split('-').reverse().join('/')}</div>
                    <div className="prev-val num">{fmtBRL(p.previsto)}</div>
                    <div className="prev-sub num">Recebido {fmtBRL(p.recebido)}{p.atraso > 0 && <span className="atraso"> · Atraso {fmtBRL(p.atraso)}</span>}</div>
                    <div className="prev-qtd num">{p.qtd} parcela{p.qtd === 1 ? '' : 's'}</div>
                  </CardVidro>
                ))}
              </div>
            </div>
          )}
        </>
      ))}

      {novo && (
        <NovaCobrancaV2
          demo={demo}
          aoCriar={acoes.criar}
          aoFechar={() => setNovo(false)}
          aoSucesso={() => setAviso({ tom: 'ok', texto: 'Cobrança criada.' })}
        />
      )}
      {detId && (
        <DetalheCobrancaV2
          id={detId}
          demo={demo}
          demoDetalhe={demo ? demoLista.find((c) => c.id === detId) ?? null : null}
          gestor={gestor}
          acoes={acoes}
          aoAvisar={setAviso}
          aoFechar={() => setDetId(null)}
        />
      )}
    </>
  );
}

function CarregandoCobrancas() {
  return (
    <>
      <div className="kpis">
        {[0, 1, 2, 3].map((i) => (
          <CardVidro className="kpi" key={i}>
            <Skeleton largura="55%" altura={12} />
            <div style={{ margin: '12px 0 4px' }}><Skeleton largura="45%" altura={22} /></div>
          </CardVidro>
        ))}
      </div>
      <CardVidro style={{ borderRadius: 'var(--r-card)', padding: '14px 16px' }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} style={{ display: 'flex', gap: 14, alignItems: 'center', padding: '9px 0' }}>
            <Skeleton largura="28%" /><Skeleton largura="12%" /><Skeleton largura="14%" /><Skeleton largura="12%" /><Skeleton largura="10%" raio={99} />
          </div>
        ))}
      </CardVidro>
    </>
  );
}

/* ---------------------------- Nova cobrança ---------------------------- */

function NovaCobrancaV2({ demo, aoCriar, aoFechar, aoSucesso }: {
  demo: boolean;
  aoCriar: (args: { contatoId: string; contatoNome: string; contatoTelefone: string; valor: number; dataPrimeira: string; ciclos: number; responsavelId: string | null; responsavelNome: string; servico: string | null; observacoes: string | null }) => Promise<void>;
  aoFechar: () => void;
  aoSucesso: () => void;
}) {
  const { data: usuarios = [] } = useOrgUsuarios();
  const [contato, setContato] = useState<ContatoRow | null>(null);
  const [whatsapp, setWhatsapp] = useState('');
  const [cicloCod, setCicloCod] = useState('');
  const [respId, setRespId] = useState('');
  const [valor, setValor] = useState('');
  const [servico, setServico] = useState('');
  const [obs, setObs] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const v = parseMoedaBRL(valor);
  const ciclo = CICLOS_LISTA.find((c) => c.codigo === cicloCod) ?? null;
  const primeira = ciclo ? proximaDataDoDia(ciclo.dia) : null;

  async function salvar() {
    if (busy) return;
    if (!contato) { setErro('Selecione o cliente.'); return; }
    if (!ciclo) { setErro('Escolha o ciclo em que o cliente vai entrar.'); return; }
    if (v == null || v <= 0) { setErro('Informe um valor mensal válido.'); return; }
    setBusy(true); setErro(null);
    try {
      // o ciclo define o calendário; a 1ª cobrança é o próximo vencimento da turma
      await aoCriar({
        contatoId: contato.id, contatoNome: contato.nome || 'Cliente', contatoTelefone: whatsapp.trim() || contato.tel || '',
        valor: v, dataPrimeira: primeira!, ciclos: 6, responsavelId: respId || null,
        responsavelNome: usuarios.find((u) => u.id === respId)?.nome ?? '',
        servico: servico || null, observacoes: obs || null,
      });
      aoSucesso(); aoFechar();
    } catch (e) { setErro(traduz((e as Error).message)); }
    finally { setBusy(false); }
  }

  return (
    <ModalV2
      aberto
      aoFechar={() => { if (!busy) aoFechar(); }}
      fecharNoVeu={!busy}
      largura={560}
      titulo={<div>Novo cliente<div className="mod-sub">Cadastre o cliente, o número de WhatsApp e o ciclo de cobrança.</div></div>}
      rodape={
        <>
          <BotaoSec disabled={busy} onClick={aoFechar}>Cancelar</BotaoSec>
          <BotaoPrimario disabled={busy} onClick={salvar}>{busy ? 'Salvando…' : 'Cadastrar cliente'}</BotaoPrimario>
        </>
      }
    >
      <div className="form-grid">
        <div className="campo">
          <label>Cliente *</label>
          {contato ? (
            <div className="selcli">
              <div>
                <div className="nm">{contato.nome || 'Sem nome'}</div>
                <div className="meta num">{contato.tel || 'Sem telefone'}{contato.email ? ' · ' + contato.email : ''}</div>
              </div>
              <button type="button" className="trocar" onClick={() => setContato(null)}>Trocar</button>
            </div>
          ) : demo ? (
            <Input placeholder="Nome do cliente (demonstração)" onChange={(e) => setContato({ id: `demo-ct-${Date.now()}`, nome: e.target.value, tel: '', email: '' } as ContatoRow)} />
          ) : (
            <ContatoPickerV2 aoSelecionar={setContato} />
          )}
        </div>
        <div className="form-2col">
          <div className="campo">
            <label>Número de WhatsApp *</label>
            <Input inputMode="tel" placeholder="(51) 90000-0000" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} disabled={busy} />
          </div>
          <div className="campo"><label>Valor mensal *</label><Input inputMode="decimal" placeholder="R$ 0,00" value={valor} onChange={(e) => setValor(e.target.value)} disabled={busy} /></div>
        </div>
        <div className="form-2col">
          <div className="campo">
            <label>Ciclo de cobrança *</label>
            <select className="inp" value={cicloCod} onChange={(e) => setCicloCod(e.target.value)} disabled={busy}>
              <option value="">Escolha o ciclo…</option>
              {CICLOS_LISTA.map((c) => <option key={c.codigo} value={c.codigo}>{c.codigo} — vence dia {String(c.dia).padStart(2, '0')}</option>)}
            </select>
          </div>
          <div className="campo">
            <label>Responsável</label>
            <select className="inp" value={respId} onChange={(e) => setRespId(e.target.value)} disabled={busy}>
              <option value="">Não atribuído</option>
              {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
          </div>
        </div>
        <div className="campo"><label>Descrição do serviço</label><Input placeholder="Ex.: Cancelamento de desconto" value={servico} onChange={(e) => setServico(e.target.value)} disabled={busy} /></div>
        <div className="campo"><label>Observações</label><textarea className="inp" rows={2} value={obs} onChange={(e) => setObs(e.target.value)} disabled={busy} /></div>
        <div className="resumo-calc num">
          <div><span>Ciclo</span><strong>{ciclo ? ciclo.codigo : '—'}</strong></div>
          <div><span>Vence</span><strong>{ciclo ? 'dia ' + String(ciclo.dia).padStart(2, '0') : '—'}</strong></div>
          <div><span>Mensalidade</span><strong>{v != null && v > 0 ? fmtBRL(v) : '—'}</strong></div>
          <div><span>1ª cobrança</span><strong>{primeira ? dataBR(primeira) : '—'}</strong></div>
        </div>
        {!whatsapp.trim() && <div className="aviso-inline" role="status">Sem o número de WhatsApp, a cobrança automática não será enviada a este cliente.</div>}
        {erro && <div className="aviso-inline erro" role="alert">{erro}</div>}
      </div>
    </ModalV2>
  );
}

function ContatoPickerV2({ aoSelecionar }: { aoSelecionar: (c: ContatoRow) => void }) {
  const [term, setTerm] = useState('');
  const [deb, setDeb] = useState('');
  const [aberto, setAberto] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const timer = useRef(0);
  // debounce de 300ms, mínimo 2 chars — idêntico ao v1
  function aoDigitar(v: string) {
    setTerm(v); setAberto(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setDeb(v), 300);
  }
  const q = useBuscaContatos(deb);
  const res = q.data ?? [];
  const mostrar = aberto && deb.trim().length >= 2;
  return (
    <div className="combo" ref={wrap} onBlur={(e) => { if (!wrap.current?.contains(e.relatedTarget as Node)) setAberto(false); }}>
      <Input placeholder="Digite nome, telefone ou e-mail" value={term} onChange={(e) => aoDigitar(e.target.value)} onFocus={() => setAberto(true)} />
      {mostrar && (
        <div className="combo-pop">
          {q.isLoading ? <div className="combo-info">Buscando…</div>
            : res.length === 0 ? <div className="combo-info">Nenhum contato encontrado.</div>
            : res.map((c) => (
              <button key={c.id} type="button" className="combo-item" onMouseDown={(e) => { e.preventDefault(); aoSelecionar(c); }}>
                <div className="nm">{c.nome || 'Sem nome'}</div>
                <div className="meta num">{c.tel || 'Sem telefone'}{c.email ? ' · ' + c.email : ''}</div>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------- Detalhe ------------------------------- */

type AcoesCobranca = {
  baixa: (args: { parcelaId: string; cobrancaId: string; data: string; obs: string | null }) => Promise<void>;
  alterarStatus: (args: { parcelaId: string; cobrancaId: string; novo: 'nao_paga' | 'prevista' }) => Promise<void>;
  cancelar: (args: { cobrancaId: string }) => Promise<void>;
};

function DetalheCobrancaV2({ id, demo, demoDetalhe, gestor, acoes, aoAvisar, aoFechar }: {
  id: string;
  demo: boolean;
  demoDetalhe: CobrancaDetalhe | null;
  gestor: boolean;
  acoes: AcoesCobranca;
  aoAvisar: (a: Aviso) => void;
  aoFechar: () => void;
}) {
  const det = useCobranca(demo ? null : id);
  const c = demo ? demoDetalhe : det.data;
  const carregando = !demo && det.isLoading;
  const [baixaParc, setBaixaParc] = useState<CobrancaParcela | null>(null);
  const [confirmaCancelar, setConfirmaCancelar] = useState(false);
  const [cancelando, setCancelando] = useState(false);

  async function agir(p: CobrancaParcela, novo: 'nao_paga' | 'prevista') {
    try { await acoes.alterarStatus({ parcelaId: p.id, cobrancaId: id, novo }); aoAvisar({ tom: 'ok', texto: 'Parcela atualizada.' }); }
    catch (e) { aoAvisar({ tom: 'erro', texto: traduz((e as Error).message) }); }
  }
  async function cancelar() {
    setCancelando(true);
    try { await acoes.cancelar({ cobrancaId: id }); aoAvisar({ tom: 'ok', texto: 'Cobrança cancelada.' }); setConfirmaCancelar(false); }
    catch (e) { aoAvisar({ tom: 'erro', texto: traduz((e as Error).message) }); }
    finally { setCancelando(false); }
  }

  const podeCancelar = gestor && c && c.status !== 'cancelado' && c.status !== 'finalizado';

  return (
    <ModalV2
      aberto
      aoFechar={aoFechar}
      largura={680}
      titulo={c ? (
        <div>
          {c.contatoNome}
          <div className="mod-sub">
            {c.servico || 'Cobrança recorrente'} · <BadgeStatus tom={TOM_COBRANCA[c.status] ?? 'neutro'}>{statusCobrancaLabel(c.status)}</BadgeStatus>
          </div>
        </div>
      ) : 'Cobrança'}
      rodape={
        <>
          <BotaoSec onClick={aoFechar}>Fechar</BotaoSec>
          {podeCancelar && (
            <button type="button" className="p-btn btn-perigo" onClick={() => setConfirmaCancelar(true)}>Cancelar cobrança</button>
          )}
        </>
      }
    >
      {carregando ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Skeleton largura="60%" /><Skeleton largura="90%" /><Skeleton largura="75%" />
        </div>
      ) : !c ? (
        <EstadoVazio titulo="Cobrança não encontrada" descricao="Ela pode ter sido removida." />
      ) : (
        <>
          <div className="det-resumo">
            <DetCampo l="Telefone" v={c.contatoTelefone || '—'} num />
            <DetCampo l="Responsável" v={c.responsavelNome || '—'} />
            <DetCampo l="Valor mensal" v={fmtBRL(c.valorMensal)} num />
            <DetCampo l="Total previsto" v={fmtBRL(c.valorMensal * c.ciclosTotais)} num />
            <DetCampo l="Pagas" v={`${c.ciclosPagos} de ${c.ciclosTotais}`} num />
            <DetCampo l="Próxima" v={dataBR(c.proximaCobranca)} num />
          </div>

          <div className="det-sec">Parcelas</div>
          <div className="det-tabela">
            <table aria-label="Parcelas">
              <thead>
                <tr><th>#</th><th>Vencimento</th><th className="d">Valor</th><th>Status</th><th>Pago em</th><th className="d">Valor pago</th>{gestor && <th aria-label="Ações" />}</tr>
              </thead>
              <tbody>
                {c.parcelas.map((p) => {
                  const st = tomParcela(p);
                  return (
                    <tr key={p.id}>
                      <td className="num">{p.ciclo}</td>
                      <td className="num">{dataBR(p.dataPrevista)}</td>
                      <td className="d num">{fmtBRL(p.valor)}</td>
                      <td><BadgeStatus tom={st.tom}>{st.rotulo}</BadgeStatus></td>
                      <td className="num">{dataBR(p.dataPagamento)}</td>
                      <td className="d num">{p.valorPago != null ? fmtBRL(p.valorPago) : '—'}</td>
                      {gestor && (
                        <td>
                          <div className="acoes-parcela">
                            {(p.status === 'prevista' || p.status === 'nao_paga') && <BotaoMini onClick={() => setBaixaParc(p)}>Pagar</BotaoMini>}
                            {p.status === 'prevista' && <BotaoMini onClick={() => agir(p, 'nao_paga')}>Não paga</BotaoMini>}
                            {p.status === 'nao_paga' && <BotaoMini onClick={() => agir(p, 'prevista')}>Reabrir</BotaoMini>}
                            {p.status === 'paga' && <BotaoMini onClick={() => agir(p, 'prevista')}>Estornar</BotaoMini>}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="det-sec">Histórico</div>
          <div className="eventos">
            {c.eventos.length === 0 ? (
              <div style={{ fontSize: 11.5, color: 'var(--txt-3)' }}>Sem eventos.</div>
            ) : c.eventos.map((e) => (
              <div className="evento" key={e.id}>
                <i aria-hidden />
                <div>
                  <div>{e.descricao || e.tipo}</div>
                  <div className="meta num">{e.autorNome ? e.autorNome + ' · ' : ''}{new Date(e.criadoEm).toLocaleString('pt-BR')}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {baixaParc && (
        <BaixaModalV2
          parcela={baixaParc}
          cobrancaId={id}
          aoBaixar={acoes.baixa}
          aoSucesso={() => aoAvisar({ tom: 'ok', texto: 'Pagamento registrado.' })}
          aoFechar={() => setBaixaParc(null)}
        />
      )}
      <ConfirmDialogV2
        aberto={confirmaCancelar}
        titulo="Cancelar cobrança"
        mensagem="As parcelas futuras/pendentes serão canceladas; as pagas são preservadas. Esta ação não pode ser desfeita."
        rotuloConfirmar="Cancelar cobrança"
        destrutivo
        carregando={cancelando}
        aoConfirmar={cancelar}
        aoCancelar={() => setConfirmaCancelar(false)}
      />
    </ModalV2>
  );
}

const DetCampo = ({ l, v, num }: { l: string; v: ReactNode; num?: boolean }) => (
  <div className="det-campo"><span className="l">{l}</span><span className={num ? 'v num' : 'v'}>{v}</span></div>
);

function BaixaModalV2({ parcela, cobrancaId, aoBaixar, aoSucesso, aoFechar }: {
  parcela: CobrancaParcela;
  cobrancaId: string;
  aoBaixar: AcoesCobranca['baixa'];
  aoSucesso: () => void;
  aoFechar: () => void;
}) {
  const [data, setData] = useState(hojeISO());
  const [obs, setObs] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function salvar() {
    if (busy) return;
    setErro(null); setBusy(true);
    try { await aoBaixar({ parcelaId: parcela.id, cobrancaId, data, obs: obs || null }); aoSucesso(); aoFechar(); }
    catch (e) { setErro(traduz((e as Error).message)); }
    finally { setBusy(false); }
  }

  return (
    <ModalV2
      aberto
      aoFechar={() => { if (!busy) aoFechar(); }}
      fecharNoVeu={!busy}
      largura={420}
      titulo={`Registrar pagamento · parcela ${parcela.ciclo}`}
      rodape={
        <>
          <BotaoSec disabled={busy} onClick={aoFechar}>Cancelar</BotaoSec>
          <BotaoPrimario disabled={busy} onClick={salvar}>{busy ? 'Salvando…' : 'Confirmar pagamento'}</BotaoPrimario>
        </>
      }
    >
      <div className="form-grid">
        <p className="p-modal-msg num">Valor integral da parcela: <strong style={{ color: 'var(--txt)' }}>{fmtBRL(parcela.valor)}</strong> (pagamento parcial não é permitido).</p>
        <div className="campo"><label>Data do pagamento</label><Input type="date" value={data} onChange={(e) => setData(e.target.value)} /></div>
        <div className="campo"><label>Observação</label><Input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Opcional" /></div>
        {erro && <div className="aviso-inline erro" role="alert">{erro}</div>}
      </div>
    </ModalV2>
  );
}
