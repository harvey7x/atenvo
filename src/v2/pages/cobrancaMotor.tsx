import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react';
import * as XLSX from 'xlsx';
import {
  AudioRecorderV2, BadgeStatus, BotaoPrimario, BotaoSec, CardVidro, Chip, Chips,
  EstadoVazio, EstadoErro, Input, Kpi, ModalV2, TabelaPadrao, Toggle,
  type Coluna, type TomStatus,
} from '../components';
import {
  seedClientes, metricasPorAtendente, CICLO_DIA,
  estadoCelula, ROTULO_COMP,
  type ClienteAnalise, type Comportamento, type StatusMes, type TipoMsg,
  type MetricaAtendente,
} from './cobrancaAnalytics';
import { useOrg } from '@/context/OrgContext';
import { useOrgUsuarios } from '@/data/atendimento';
import { useCobNumeros, cobWaConectar, cobWaQr, cobWaStatus, cobWaDesconectar, type CobNumero } from '@/data/cobrancaWa';
import {
  useCobMensagens, useSalvarMensagem, useAlternarMensagem, uploadMidiaCobranca, ROTULO_TIPO_MSG, PADRAO_OFFSET,
  useCobFila, rodarSimulacao, useCobConfig, useSalvarCobConfig, converterPendentesHoje, type CobFilaItem,
  type CobMensagem, type CobMsgItem, type TipoMensagem, type TipoItem,
} from '@/data/cobrancaRegua';
import { useCiclosReais, useCriarCiclo, useClientesCobranca, type ClienteCobranca } from '@/data/cobrancaCiclos';
import {
  useConfirmarEntrada, useCriarLead, useDadosCobranca, useEditarCiclo, useEditarLead, useExcluirLead, useExcluirMov, useRevelarSenha,
  useImportarCiclo, useImportarNoCiclo, useLancarPagamento, useLimparCelula, useMarcarCelula, useMarcarNaoPagou,
  useRecusarEntrada, useAdicionarMes, useMoverTurma, useAbrirCiclo, useFecharCiclo, useEsvaziarCiclos, useEsvaziarCiclo, useSalvarOrdemCiclos, useSenhasGrade, useRemoverNovos,
  useSolicitarParado, useAprovarParado, useRecusarParado, useCancelarParado,
} from '../data/cobranca/hooks';
import { useQueryClient } from '@tanstack/react-query';
import { getCobrancaRepo } from '../data/cobranca/cobrancaRepo';
import { gsCarregar, gsSalvar } from '../data/cobranca/demoStore';
import { chavesCobranca } from '../data/cobranca/keys';
import { usePapel } from '../data/cobranca/sessao';
import { fmtPct, liquidoDoTotal, parteDoComercial, pctNoMes, useComissoes, useComissoesHist, useSalvarComissao } from '../data/cobranca/comissoes';
import { useLixeira, useRestaurarLead } from '../data/cobranca/lixeira';
import { registrarBloqueada, registrarDesfazer } from '../data/desfazer';
import {
  AbasRegua, CabecalhoReguaComercial, ConfigReguaLista, ConfirmarPausaRegua, TabelaComerciaisRegua,
  type AbaRegua, type LinhaComercialRegua, type ValoresConfigRegua,
} from './regua/ReguaTela';
import { comissoesDe } from './RevizaComissoes';
import { EquipeVista } from './painel/EquipeVista';
import { Dinheiro, Indicador, Proporcao } from './painel/PainelResumo';
import { NumerosVista, type ComercialCobertura, type NumeroItem } from './painel/NumerosVista';
import { clientesReais } from './revizaAnalytics';
import { cobrancaDoCiclo, feriadosDoAno, proximaCobrancaDoCiclo } from './cicloCalendario';
import { enviarPraPlanilha } from '../data/cobranca/ponte';
import {
  finalNB, mascaraCPF, mascaraNB, mascaraTelefone, problemasNovo, soDig, sugerirCiclos, textoReclame,
  ORDEM_CAMPOS, ROTULO_CAMPO, type CampoNovo, type CamposNovo, type FaixaBeneficio,
} from '../data/cobranca/novoCliente';
import type { Papel } from '../data/cobranca/types';
import { isDemoMode, isRevizaMode } from '@/lib/supabase';
// crítica 12/11 (cob_gestao): "+ Novo cliente" do Painel abre o formulário (?novo=1); ações raras no "Mais"
import { useSearchParams } from 'react-router-dom';
import { MenuMais } from './planilha/MenuMais';

/** tradução de erro das mutations (RLS/RPC/rede) p/ o aviso da tela */
const msgErro = (e: unknown) => {
  const m = e instanceof Error ? e.message : String(e ?? '');
  if (/42501|sem permissao|permission|row-level/i.test(m)) return 'Você não tem permissão para esta ação.';
  return m || 'Falha ao salvar. Tente de novo.';
};

/** célula da grade de pagamentos (máquina de estados do legado Gestão Mensal) */
function Celula({ raw }: { raw: string }) {
  const e = estadoCelula(raw);
  if (e.estado === 'pago') return <span className="gc gc-pago">{e.display}</span>;
  if (e.estado === 'nao_pagou') return <span className="gc gc-naopagou">NÃO PAGOU{e.dataOrig && <i>{e.dataOrig}</i>}</span>;
  if (e.estado === 'aguardando_entrada') return <span className="gc gc-aguardando">{e.display}</span>;
  if (e.estado === 'info') return <span className="gc gc-info">{e.display}</span>;
  return <span className="gc gc-vazio">—</span>;
}

const CLIENTES = seedClientes();
const compBadge: Record<Comportamento, TomStatus> = { em_dia: 'ok', voltou: 'atencao', faltou: 'atencao', inadimplente: 'erro' };
const mesLabel = (c: string) => c.split('-').reverse().join('/');
const TOM_MES: Record<StatusMes, TomStatus> = { paga: 'ok', atraso: 'atencao', nao_paga: 'erro', prevista: 'neutro' };
const ROTULO_MES: Record<StatusMes, string> = { paga: 'Paga', atraso: 'Atraso', nao_paga: 'Não paga', prevista: 'Prevista' };
const ROTULO_TIPO_ENG: Record<TipoMsg, string> = { antes: 'Lembrete (antes)', cobranca: 'Cobrança', depois: 'Aviso de atraso', remarketing: 'Remarketing' };


const IcAtencao = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M10.3 3.6 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" />
  </svg>
);

/* ------------------------------------------------------------------
   Modo Cobrança — sub-abas do motor dedicado (Fase B, UI).
   Ciclos · Régua de mensagens · Números & Atendentes · Envios.
   Backend real = tabelas cobranca_* (Fase A, já em prod). Aqui o
   conteúdo é seed de demonstração pra revisão visual; o envio nasce
   em SIMULAÇÃO (dry-run) — disparo real é Fase C, com "sim" do dono.
   ------------------------------------------------------------------ */

const fmtBRL = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const diaBR = (n: number) => String(n).padStart(2, '0');
const dataBRcurta = (iso: string) => { const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1].slice(2)}` : iso; };

/* =================== CICLOS — grade de pagamentos (Gestão Mensal) =================== */

export function AbaCiclos({ demo, gestor, aoAvisar }: { demo: boolean; gestor: boolean; aoAvisar: (t: string) => void }) {
  return demo ? <AbaCiclosDemo gestor={gestor} aoAvisar={aoAvisar} /> : <AbaCiclosReal gestor={gestor} aoAvisar={aoAvisar} />;
}

const TOM_STATUS_COB: Record<string, TomStatus> = { ativo: 'ok', finalizado: 'neutro', cancelado: 'erro' };

function AbaCiclosReal({ gestor, aoAvisar }: { gestor: boolean; aoAvisar: (t: string) => void }) {
  const { currentOrg } = useOrg();
  const orgId = currentOrg?.id;
  const { data: ciclos = [], isLoading } = useCiclosReais(orgId);
  const { data: clientes = [] } = useClientesCobranca(orgId);
  const criar = useCriarCiclo(orgId);
  const [novo, setNovo] = useState(false);
  const [dia, setDia] = useState('');
  const [aberto, setAberto] = useState<string | null>(null);
  const nDia = Math.trunc(Number(dia) || 0);
  const porCiclo = useMemo(() => {
    const m = new Map<string, ClienteCobranca[]>();
    for (const c of clientes) { if (!c.ciclo) continue; const a = m.get(c.ciclo) ?? []; a.push(c); m.set(c.ciclo, a); }
    return m;
  }, [clientes]);

  async function salvarCiclo() {
    try { await criar.mutateAsync(nDia); aoAvisar(`Ciclo D${String(nDia).padStart(2, '0')} criado.`); setNovo(false); setDia(''); }
    catch (e) { aoAvisar((e as Error).message); }
  }

  return (
    <>
      <div className="cm-grade-info">
        <p className="cm-hint" style={{ margin: 0 }}>Cada ciclo é a turma que vence no mesmo dia do mês. O cliente entra num ciclo no cadastro.</p>
        {gestor && <button type="button" className="cm-num-lnk" style={{ marginLeft: 'auto' }} onClick={() => setNovo(true)}>＋ Criar ciclo</button>}
      </div>
      {isLoading ? <div className="cm-hint">Carregando…</div> : ciclos.length === 0 ? (
        <CardVidro spot sobe style={{ borderRadius: 'var(--r-card)' }}>
          <EstadoVazio titulo="Nenhum ciclo criado" descricao="Crie as turmas de vencimento (ex.: dia 01, dia 05, dia 25) — cada cliente entra numa delas no cadastro."
            acao={gestor ? { rotulo: '＋ Criar o primeiro ciclo', onClick: () => setNovo(true) } : undefined} />
        </CardVidro>
      ) : (
        <div className="cm-ciclos sobe">
          {ciclos.map((c) => {
            const on = aberto === c.id;
            const lista = porCiclo.get(c.codigo) ?? [];
            return (
              <CardVidro spot key={c.id} className={on ? 'cm-ciclo on' : 'cm-ciclo'}>
                <button type="button" className="cm-ciclo-cab" onClick={() => setAberto(on ? null : c.id)} aria-expanded={on}>
                  <span className="cm-ciclo-cod">{c.codigo}</span>
                  <span className="cm-ciclo-nm">{c.nome}<b>{c.grupo === 'inicio_mes' ? 'início do mês' : c.grupo === 'fim_mes' ? 'fim do mês' : 'meio do mês'}</b></span>
                  <span className="cm-ciclo-tags"><span className="cm-ciclo-n num">{lista.length} cliente{lista.length === 1 ? '' : 's'}</span></span>
                  <span className="cm-ciclo-seta" aria-hidden>{on ? '▾' : '▸'}</span>
                </button>
                {on && (
                  <div className="cm-ciclo-corpo">
                    {lista.length === 0 ? <div className="cm-hint">Nenhum cliente neste ciclo ainda.</div> : (
                      <TabelaPadrao
                        colunas={[
                          { chave: 'nome', titulo: 'Cliente', render: (x: ClienteCobranca) => x.nome },
                          { chave: 'tel', titulo: 'WhatsApp', render: (x: ClienteCobranca) => x.telefone ? <span className="num">{x.telefone}</span> : <span style={{ color: 'var(--ambar)' }}>⚠ sem número</span> },
                          { chave: 'at', titulo: 'Atendente', render: (x: ClienteCobranca) => x.atendente ?? '—' },
                          { chave: 'v', titulo: 'Mensalidade', dir: true, classe: 'num', render: (x: ClienteCobranca) => fmtBRL(x.valorMensal) },
                        ] as Coluna<ClienteCobranca>[]}
                        linhas={lista} chave={(x) => x.id}
                      />
                    )}
                  </div>
                )}
              </CardVidro>
            );
          })}
        </div>
      )}

      {novo && (
        <ModalV2 aberto aoFechar={() => setNovo(false)} largura={380}
          titulo={<div>Criar ciclo<div className="mod-sub">A turma de quem vence neste dia do mês.</div></div>}
          rodape={<><BotaoSec onClick={() => setNovo(false)}>Cancelar</BotaoSec><BotaoPrimario onClick={salvarCiclo} disabled={criar.isPending || nDia < 1 || nDia > 31}>{criar.isPending ? 'Criando…' : 'Criar ciclo'}</BotaoPrimario></>}>
          <div className="form-grid">
            <div className="campo"><label>Dia do vencimento (1 a 31) *</label><Input inputMode="numeric" value={dia} onChange={(e) => setDia(e.target.value)} placeholder="Ex.: 5" /></div>
            <p className="cm-hint">{nDia >= 1 && nDia <= 31 ? <>Será o ciclo <b>D{String(nDia).padStart(2, '0')}</b> — vence todo dia {String(nDia).padStart(2, '0')}.</> : 'Informe o dia em que o benefício desta turma cai.'}</p>
          </div>
        </ModalV2>
      )}
    </>
  );
}

/* ---- ciclos = turmas por dia de vencimento, montadas a partir dos MESMOS
   leads da Gestão de cobranças (fonte única). Alterar o dia ou o valor de um
   ciclo escreve de volta nos clientes daquela turma; o que for importado na
   Gestão aparece aqui. Só o gestor/financeiro edita. ---- */
const MES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const rotuloMesCurto = (ym: string) => { const [y, m] = ym.split('-').map(Number); return `${MES_ABREV[m - 1]}/${String(y).slice(2)}`; };
const soDigitos = (v: string) => Number(v.replace(/[^\d]/g, '')) || 0;
const d2 = (n: number) => String(n).padStart(2, '0');

export interface CicloTurma { dia: number; codigo: string; leads: GLinha[]; base: number; seguem: number; excecoes: number; ativos: number; soma: number }

function EditarTurma({ ciclo, campo, aoAplicarDia, aoAplicarValor, aoFechar }: {
  ciclo: CicloTurma; campo: 'dia' | 'valor';
  aoAplicarDia: (dia: number, novo: number) => void; aoAplicarValor: (dia: number, base: number, novo: number) => void; aoFechar: () => void;
}) {
  const [dia, setDiaV] = useState(String(ciclo.dia));
  const [valor, setValor] = useState(String(ciclo.base));
  const nDia = Math.max(1, Math.min(31, soDigitos(dia) || ciclo.dia));
  const nVal = Number(valor.replace(',', '.').replace(/[^\d.]/g, '')) || 0;
  const afetados = campo === 'dia' ? ciclo.leads.length : ciclo.seguem;
  return (
    <ModalV2 aberto aoFechar={aoFechar} largura={470}
      titulo={<div>{campo === 'dia' ? 'Alterar dia da turma' : 'Alterar valor da turma'}<div className="mod-sub">Turma {ciclo.codigo} · {ciclo.leads.length} clientes</div></div>}
      rodape={<><BotaoSec onClick={aoFechar}>Cancelar</BotaoSec><BotaoPrimario onClick={() => campo === 'dia' ? aoAplicarDia(ciclo.dia, nDia) : aoAplicarValor(ciclo.dia, ciclo.base, nVal)}>Aplicar a {afetados} cliente{afetados === 1 ? '' : 's'}</BotaoPrimario></>}>
      {campo === 'dia' ? (
        <>
          <div className="campo" style={{ marginBottom: 12 }}><label>Novo dia de vencimento (1–31)</label><Input inputMode="numeric" value={dia} onChange={(e) => setDiaV(e.target.value)} /></div>
          <div className="cm-dr-sec">Revisão da alteração</div>
          <div className="cm-revisao">
            <div><span>Vencimento</span><b>dia {d2(ciclo.dia)} → <span className="gs-para">dia {d2(nDia)}</span></b></div>
            <div><span>Clientes movidos</span><b>{ciclo.leads.length}</b></div>
            <div><span>Turma resultante</span><b>D{d2(nDia)}</b></div>
          </div>
          <p className="cm-hint" style={{ marginTop: 12 }}>Todos os {ciclo.leads.length} clientes desta turma passam a vencer no dia {d2(nDia)}. Parcela e histórico de cada um são mantidos.</p>
        </>
      ) : (
        <>
          <div className="campo" style={{ marginBottom: 12 }}><label>Novo valor da parcela da turma (R$)</label><Input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} /></div>
          <div className="cm-dr-sec">Revisão da alteração</div>
          <div className="cm-revisao">
            <div><span>Valor da turma</span><b>{fmtBRL(ciclo.base)} → <span className="gs-para">{fmtBRL(nVal)}</span></b></div>
            <div><span>Seguem a turma</span><b>{ciclo.seguem} serão atualizados</b></div>
            <div><span>Valor individual</span><b>{ciclo.excecoes} preservado{ciclo.excecoes === 1 ? '' : 's'}</b></div>
            <div><span>Recorrência da turma</span><b>{fmtBRL(ciclo.seguem * ciclo.base)} → <span className="gs-para">{fmtBRL(ciclo.seguem * nVal)}</span></b></div>
          </div>
          <p className="cm-hint" style={{ marginTop: 12 }}>Só quem está no valor da turma ({fmtBRL(ciclo.base)}) muda. Quem tem valor individual diferente fica como está.</p>
        </>
      )}
    </ModalV2>
  );
}

function AbaCiclosDemo({ gestor, aoAvisar }: { gestor: boolean; aoAvisar: (t: string) => void }) {
  // lê da MESMA query do resto do sistema (nada de snapshot no mount: a versão
  // antiga congelava o blob e podia REGRAVAR estado velho por cima do Desfazer)
  const dados = useDadosCobranca().data ?? { comps: [], linhas: [], pendentes: [], historico: [] };
  const linhas = dados.linhas;
  const qcCiclos = useQueryClient();
  // escrita sempre sobre o blob FRESCO do disco (não o render): preserva
  // pendentes/histórico/datas gravados por outras telas ou pelo Desfazer
  const setLeads = (fn: (l: GLinha[]) => GLinha[]) => {
    const at = gsCarregar();
    gsSalvar({ ...at, linhas: fn(at.linhas) });
    void qcCiclos.invalidateQueries({ queryKey: chavesCobranca.dados });
  };

  const [previewAtendente, setPreviewAtendente] = useState(false);
  const editavel = gestor && !previewAtendente;
  const [aberto, setAberto] = useState<number | null>(null);
  const [editar, setEditar] = useState<{ dia: number; campo: 'dia' | 'valor' } | null>(null);
  const [novoNaTurma, setNovoNaTurma] = useState<number | null>(null);
  const ciclosDisp = useMemo(() => { const s = new Set<number>(Object.values(CICLO_DIA)); for (const l of linhas) if (l.dia > 0) s.add(l.dia); for (const dd0 of dados.ciclosAbertos ?? []) s.add(dd0); return [...s].sort((a, b) => a - b); }, [linhas, dados.ciclosAbertos]);

  const ciclos = useMemo<CicloTurma[]>(() => {
    const map = new Map<number, GLinha[]>();
    for (const l of linhas) { if (!l.dia) continue; const a = map.get(l.dia) ?? []; a.push(l); map.set(l.dia, a); } // sem dia = aguardando, não é turma
    return [...map.entries()].map(([dia, leads]) => {
      const freq = new Map<number, number>();
      for (const l of leads) freq.set(l.valor, (freq.get(l.valor) ?? 0) + 1);
      const base = [...freq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
      const seguem = leads.filter((l) => l.valor === base).length;
      return {
        dia, codigo: `D${d2(dia)}`, leads: [...leads].sort((a, b) => a.nome.localeCompare(b.nome)),
        base, seguem, excecoes: leads.length - seguem,
        ativos: leads.filter((l) => l.situacao === 'ativo').length,
        soma: leads.reduce((s, l) => s + l.valor, 0),
      };
    }).sort((a, b) => a.dia - b.dia);
  }, [linhas]);

  // recorrência = MENSALIDADE (valor/2, regra da casa) de quem está EM COBRANÇA;
  // a versão antiga somava a parcela cheia de todo mundo (o dobro, e população errada)
  const totalMes = ciclos.reduce((s, c) => s + c.leads.reduce((x, l) => x + (l.situacao === 'cancelado' ? l.valor / 2 : 0), 0), 0);
  const cicloEditar = editar ? ciclos.find((c) => c.dia === editar.dia) ?? null : null;

  const aplicarDia = (dia: number, novo: number) => {
    setLeads((ls) => ls.map((l) => l.dia === dia ? { ...l, dia: novo } : l));
    aoAvisar(`Vencimento da turma D${d2(dia)} alterado — clientes movidos para D${d2(novo)}.`); setEditar(null); setAberto(novo);
  };
  const aplicarValor = (dia: number, base: number, novo: number) => {
    setLeads((ls) => ls.map((l) => (l.dia === dia && l.valor === base) ? { ...l, valor: novo } : l));
    aoAvisar(`Parcela da turma D${d2(dia)} atualizada para ${fmtBRL(novo)} — exceções preservadas.`); setEditar(null);
  };
  const criarNaTurma = (l0: GLinha) => {
    const l = { ...l0, id: `novo-${plHash(l0.nome + l0.nb)}-${Date.now()}` };
    setLeads((ls) => [l, ...ls]);
    aoAvisar(`${l.nome || 'Novo cliente'} cadastrado na turma D${d2(l.dia)}.`); setNovoNaTurma(null); setAberto(l.dia);
  };

  return (
    <>
      <div className="kpis sobe">
        <Kpi rotulo="Ciclos (turmas)" valor={ciclos.length} />
        <Kpi rotulo="Clientes nos ciclos" valor={ciclos.reduce((s, c) => s + c.leads.length, 0)} formato="mil" />
        <Kpi rotulo="Recorrência/mês" valor={Math.trunc(totalMes)} formato="mil" prefixo="R$ " tomValor="ok" nota="mensalidades da carteira em cobrança" />
        <Kpi rotulo="Novos (descontando)" valor={ciclos.reduce((s, c) => s + c.ativos, 0)} formato="mil" />
      </div>
      <div className="cm-grade-info sobe" style={{ animationDelay: '.06s' }}>
        <p className="cm-hint" style={{ margin: 0 }}>Cada ciclo é a turma que vence no mesmo dia. Ele vem dos leads da <b>Gestão de cobranças</b> — alterar o dia ou o valor aqui muda os clientes lá (e o que você importar aparece aqui).</p>
        {gestor && <label className="gs-papel" style={{ marginLeft: 'auto', textTransform: 'none', letterSpacing: 0 }}><input type="checkbox" checked={previewAtendente} onChange={(e) => setPreviewAtendente(e.target.checked)} /> ver como atendente (só leitura)</label>}
      </div>
      <div className="cm-ciclos sobe" style={{ animationDelay: '.1s' }}>
        {ciclos.map((c) => {
          const on = aberto === c.dia;
          return (
            <CardVidro spot key={c.dia} className={on ? 'cm-ciclo on' : 'cm-ciclo'}>
              <button type="button" className="cm-ciclo-cab" onClick={() => setAberto(on ? null : c.dia)} aria-expanded={on}>
                <span className="cm-ciclo-cod">{c.codigo}</span>
                <span className="cm-ciclo-nm">vence dia {d2(c.dia)}<b>{c.dia <= 5 ? 'início do mês' : c.dia >= 25 ? 'fim do mês' : 'meio do mês'}</b></span>
                <span className="cm-ciclo-tags">
                  <span className="cm-ciclo-n num">{c.leads.length} cliente{c.leads.length === 1 ? '' : 's'}</span>
                  <span className="cm-ciclo-n num">turma {fmtBRL(c.base)}</span>
                  {c.excecoes > 0 && <span className="cm-ciclo-n num" title="clientes com valor diferente da turma">{c.excecoes} individual{c.excecoes === 1 ? '' : 'is'}</span>}
                </span>
                <span className="cm-ciclo-seta" aria-hidden>{on ? '▾' : '▸'}</span>
              </button>
              {on && (
                <div className="cm-ciclo-corpo">
                  {editavel && (
                    <div className="cm-ciclo-acoes">
                      <BotaoSec mini onClick={() => setNovoNaTurma(c.dia)}>＋ Novo cliente nesta turma</BotaoSec>
                      <BotaoSec mini onClick={() => setEditar({ dia: c.dia, campo: 'dia' })}>Alterar dia da turma</BotaoSec>
                      <BotaoSec mini onClick={() => setEditar({ dia: c.dia, campo: 'valor' })}>Alterar valor da turma</BotaoSec>
                      <span className="cm-hint">Cadastre aqui ou mude todos de uma vez — cada cliente também pode ser ajustado na Gestão.</span>
                    </div>
                  )}
                  <TabelaPadrao
                    colunas={[
                      { chave: 'nome', titulo: 'Cliente', render: (x: GLinha) => x.nome },
                      { chave: 'com', titulo: 'Comercial', render: (x: GLinha) => x.comercial || '—' },
                      { chave: 'banco', titulo: 'Banco', render: (x: GLinha) => x.banco || '—' },
                      { chave: 'v', titulo: 'Parcela', dir: true, classe: 'num', render: (x: GLinha) => x.valor === c.base ? <span className="num">{fmtBRL(x.valor)}</span> : <span className="num cm-ex">{fmtBRL(x.valor)}<i className="cm-ex-tag">individual</i></span> },
                      { chave: 'st', titulo: 'Débito', render: (x: GLinha) => <BadgeStatus tom={x.situacao === 'cancelado' ? 'neutro' : 'ok'}>{x.situacao === 'cancelado' ? '✓ cancelado' : '● ativo'}</BadgeStatus> },
                    ] as Coluna<GLinha>[]}
                    linhas={c.leads} chave={(x) => x.id}
                    rodape={{ texto: `${c.leads.length} clientes · ${c.seguem} seguem a turma · ${c.excecoes} individuais` }}
                  />
                </div>
              )}
            </CardVidro>
          );
        })}
        {ciclos.length === 0 && <div className="pl-vazio">Nenhum ciclo — cadastre ou importe leads na Gestão de cobranças.</div>}
      </div>

      {cicloEditar && editar && <EditarTurma ciclo={cicloEditar} campo={editar.campo} aoAplicarDia={aplicarDia} aoAplicarValor={aplicarValor} aoFechar={() => setEditar(null)} />}
      {novoNaTurma != null && <FichaLead novo inicial={{ ...linhaVazia(dados.comps), dia: novoNaTurma }} comps={dados.comps} ciclos={ciclosDisp} comerciais={[...new Set(dados.linhas.map((l) => l.comercial).filter(Boolean))]} gestor={gestor} aoSalvar={criarNaTurma} aoFechar={() => setNovoNaTurma(null)} />}
    </>
  );
}
/* =================== RÉGUA / MENSAGENS =================== */

type MsgDemo = { tipo: 'antes' | 'cobranca' | 'depois' | 'remarketing'; nome: string; corpo: string; offset: number };
export const ROTULO_TIPO: Record<MsgDemo['tipo'], string> = { antes: 'Antes', cobranca: 'Cobrança', depois: 'Depois', remarketing: 'Remarketing' };
export const MSGS_DEMO: MsgDemo[] = [
  { tipo: 'antes', nome: 'Lembrete amigável', offset: -3, corpo: 'Oi {nome}! Aqui é o {atendente}. Passando pra lembrar que sua mensalidade de {valor} vence dia {vencimento}. Qualquer dúvida, é só chamar. 😊' },
  { tipo: 'cobranca', nome: 'Cobrança do dia', offset: 0, corpo: 'Olá {nome}, hoje é o vencimento da sua mensalidade de {valor}. Você pode confirmar o pagamento por aqui mesmo. Obrigado!' },
  // 27/10 (dono): sem avisos DEPOIS do vencimento ("se o cliente não pagou, não vai ter mais") —
  // a régua é o aviso prévio (opcional por atendente) + a cobrança do dia, igual à instância real
];

export function AbaRegua({ demo, gestor, aoAvisar }: { demo: boolean; gestor: boolean; aoAvisar: (t: string) => void }) {
  return demo ? <AbaReguaDemo gestor={gestor} aoAvisar={aoAvisar} /> : <AbaReguaReal gestor={gestor} aoAvisar={aoAvisar} />;
}

/* ---- REAL: mensagens são SEQUÊNCIAS de bolhas (texto/imagem/áudio/documento) ---- */
const ORDEM_TIPOS: TipoMensagem[] = ['antes', 'cobranca', 'depois', 'remarketing'];
const ROTULO_ITEM: Record<TipoItem, string> = { texto: 'Texto', imagem: 'Imagem', audio: 'Áudio', documento: 'Documento' };
const ACCEPT_ITEM: Record<TipoItem, string> = { texto: '', imagem: 'image/*', audio: 'audio/*', documento: '.pdf,.doc,.docx,.xls,.xlsx' };

type EdMsg = { id?: string; tipo: TipoMensagem; nome: string; offsetDias: number; hora: string; itens: CobMsgItem[] };
const cadenciaTxt = (off: number, hora: string) =>
  (off < 0 ? `${Math.abs(off)} dia${Math.abs(off) === 1 ? '' : 's'} antes` : off === 0 ? 'no dia do vencimento' : `${off} dia${off === 1 ? '' : 's'} depois`) + ` às ${hora}`;

function AbaReguaReal({ gestor, aoAvisar }: { gestor: boolean; aoAvisar: (t: string) => void }) {
  const { currentOrg } = useOrg();
  const orgId = currentOrg?.id;
  const { data: mensagens = [], isLoading } = useCobMensagens(orgId);
  const salvar = useSalvarMensagem(orgId);
  const alternar = useAlternarMensagem(orgId);
  const [ed, setEd] = useState<EdMsg | null>(null);
  const [upBusy, setUpBusy] = useState<number | null>(null);

  const porTipo = useMemo(() => {
    const m = new Map<TipoMensagem, CobMensagem[]>();
    for (const t of ORDEM_TIPOS) m.set(t, []);
    for (const msg of mensagens) m.get(msg.tipo)?.push(msg);
    return m;
  }, [mensagens]);

  function mudarItem(k: number, patch: Partial<CobMsgItem>) {
    setEd((e) => e && { ...e, itens: e.itens.map((it, i) => (i === k ? { ...it, ...patch } : it)) });
  }
  function moverItem(k: number, delta: number) {
    setEd((e) => {
      if (!e) return e;
      const alvo = k + delta;
      if (alvo < 0 || alvo >= e.itens.length) return e;
      const itens = [...e.itens];
      [itens[k], itens[alvo]] = [itens[alvo], itens[k]];
      return { ...e, itens };
    });
  }
  async function subirMidia(k: number, file: File) {
    if (!orgId) return;
    setUpBusy(k);
    try {
      const r = await uploadMidiaCobranca(orgId, file);
      mudarItem(k, { midia_url: r.url, midia_nome: r.nome });
    } catch (e) { aoAvisar((e as Error).message); }
    finally { setUpBusy(null); }
  }
  async function confirmarSalvar() {
    if (!ed) return;
    if (!ed.nome.trim()) { aoAvisar('Dê um nome à mensagem.'); return; }
    if (ed.itens.length === 0) { aoAvisar('Adicione ao menos uma bolha.'); return; }
    for (const it of ed.itens) {
      if (it.tipo === 'texto' && !(it.corpo ?? '').trim()) { aoAvisar('Toda bolha de texto precisa de conteúdo.'); return; }
      if (it.tipo !== 'texto' && !it.midia_url) { aoAvisar(`Anexe o arquivo da bolha de ${ROTULO_ITEM[it.tipo].toLowerCase()}.`); return; }
    }
    try {
      await salvar.mutateAsync({ id: ed.id, tipo: ed.tipo, nome: ed.nome.trim(), offsetDias: ed.offsetDias, hora: ed.hora, itens: ed.itens });
      aoAvisar('Mensagem salva.');
      setEd(null);
    } catch (e) { aoAvisar(`Falha ao salvar: ${(e as Error).message}`); }
  }

  return (
    <>
      <p className="cm-hint sobe">
        Cada mensagem é uma <b>sequência de bolhas</b> — texto, imagem, áudio ou documento, na ordem em que serão enviadas.
        Variáveis nos textos: <code>{'{nome}'}</code> <code>{'{valor}'}</code> <code>{'{vencimento}'}</code> <code>{'{atendente}'}</code>.
      </p>
      {ORDEM_TIPOS.map((t, sec) => {
        const lista = porTipo.get(t) ?? [];
        return (
          <CardVidro spot sobe key={t} style={{ borderRadius: 'var(--r-card)', marginBottom: 14, animationDelay: `${0.06 * (sec + 1)}s` }}>
            <div className="card-cab">
              <h3>{ROTULO_TIPO_MSG[t]}</h3>
              {gestor && <BotaoSec mini onClick={() => setEd({ tipo: t, nome: '', offsetDias: PADRAO_OFFSET[t], hora: '09:00', itens: [{ ordem: 0, tipo: 'texto', corpo: '', midia_url: null, midia_nome: null }] })}>＋ Nova mensagem</BotaoSec>}
            </div>
            <div className="cm-msg-lista">
              {isLoading && <div className="cm-hint">Carregando…</div>}
              {!isLoading && lista.length === 0 && <div className="cm-hint">Nenhuma mensagem deste tipo ainda.</div>}
              {lista.map((m) => (
                <div className="cm-msg-lin" key={m.id}>
                  <div className="cm-msg-info">
                    <div className="cm-msg-nm">{m.nome}</div>
                    <div className="cm-msg-meta num">
                      {m.itens.length} bolha{m.itens.length === 1 ? '' : 's'} · {m.itens.map((i) => ROTULO_ITEM[i.tipo]).join(' → ') || '—'} · envia {cadenciaTxt(m.offsetDias ?? PADRAO_OFFSET[m.tipo], m.hora ?? '09:00')}
                    </div>
                  </div>
                  {gestor && (
                    <div className="cm-msg-acoes">
                      <Toggle ligado={m.ativo} aoMudar={(v) => alternar.mutate({ id: m.id, ativo: v })} rotulo={m.ativo ? 'Mensagem ativa' : 'Mensagem inativa'} />
                      <BotaoSec mini onClick={() => setEd({ id: m.id, tipo: m.tipo, nome: m.nome, offsetDias: m.offsetDias ?? PADRAO_OFFSET[m.tipo], hora: m.hora ?? '09:00', itens: m.itens.map((i) => ({ ...i })) })}>Editar</BotaoSec>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardVidro>
        );
      })}

      {ed && (
        <ModalV2 aberto aoFechar={() => setEd(null)} largura={620}
          titulo={<div>{ed.id ? 'Editar mensagem' : 'Nova mensagem'}<div className="mod-sub">{ROTULO_TIPO_MSG[ed.tipo]}</div></div>}
          rodape={<><BotaoSec onClick={() => setEd(null)}>Cancelar</BotaoSec><BotaoPrimario onClick={confirmarSalvar} disabled={salvar.isPending || upBusy !== null}>{salvar.isPending ? 'Salvando…' : 'Salvar mensagem'}</BotaoPrimario></>}>
          <div className="form-grid">
            <div className="form-2col">
              <div className="campo"><label>Nome da mensagem *</label><Input value={ed.nome} onChange={(e) => setEd({ ...ed, nome: e.target.value })} placeholder="Ex.: Lembrete 3 dias antes" /></div>
              <div className="campo"><label>Tipo</label>
                <select className="inp" value={ed.tipo} onChange={(e) => { const t2 = e.target.value as TipoMensagem; setEd({ ...ed, tipo: t2, offsetDias: PADRAO_OFFSET[t2] }); }}>
                  {ORDEM_TIPOS.map((t) => <option key={t} value={t}>{ROTULO_TIPO_MSG[t]}</option>)}
                </select>
              </div>
            </div>

            <div className="form-2col">
              <div className="campo">
                <label>Quando enviar</label>
                <div className="cm-cad-linha">
                  <Input inputMode="numeric" style={{ width: 64 }} value={String(Math.abs(ed.offsetDias))}
                    onChange={(e) => { const n = Math.max(0, Math.min(30, Math.trunc(Number(e.target.value) || 0))); setEd({ ...ed, offsetDias: ed.offsetDias < 0 ? -n : n }); }} />
                  <select className="inp" value={ed.offsetDias < 0 ? 'antes' : ed.offsetDias === 0 ? 'no_dia' : 'depois'}
                    onChange={(e) => { const d = e.target.value; const n = Math.abs(ed.offsetDias) || (d === 'no_dia' ? 0 : 1); setEd({ ...ed, offsetDias: d === 'antes' ? -n : d === 'no_dia' ? 0 : n }); }}>
                    <option value="antes">dia(s) antes do vencimento</option>
                    <option value="no_dia">no dia do vencimento</option>
                    <option value="depois">dia(s) depois do vencimento</option>
                  </select>
                </div>
              </div>
              <div className="campo"><label>Horário (BRT)</label><Input type="time" value={ed.hora} onChange={(e) => setEd({ ...ed, hora: e.target.value || '09:00' })} /></div>
            </div>
            <div className="campo"><label>Sequência de bolhas (na ordem do envio)</label></div>
            {ed.itens.map((it, k) => (
              <div className="cm-ed-item" key={k}>
                <div className="cm-ed-topo">
                  <select className="inp cm-ed-tipo" value={it.tipo}
                    onChange={(e) => mudarItem(k, { tipo: e.target.value as TipoItem, midia_url: null, midia_nome: null })}>
                    {(Object.keys(ROTULO_ITEM) as TipoItem[]).map((t) => <option key={t} value={t}>{ROTULO_ITEM[t]}</option>)}
                  </select>
                  <span className="cm-ed-ord num">bolha {k + 1}</span>
                  <div className="cm-ed-mov">
                    <button type="button" className="cm-num-lnk" onClick={() => moverItem(k, -1)} disabled={k === 0} aria-label="Subir">↑</button>
                    <button type="button" className="cm-num-lnk" onClick={() => moverItem(k, 1)} disabled={k === ed.itens.length - 1} aria-label="Descer">↓</button>
                    <button type="button" className="cm-num-lnk perigo" onClick={() => setEd({ ...ed, itens: ed.itens.filter((_, i) => i !== k) })} aria-label="Remover">Remover</button>
                  </div>
                </div>
                {it.tipo === 'texto' ? (
                  <textarea className="inp" rows={3} value={it.corpo ?? ''} placeholder="Olá {nome}, sua mensalidade de {valor} vence em {vencimento}…"
                    onChange={(e) => mudarItem(k, { corpo: e.target.value })} />
                ) : it.tipo === 'audio' ? (
                  <div className="cm-ed-midia cm-ed-audio">
                    {it.midia_url
                      ? <span className="cm-ed-arq num" title={it.midia_nome ?? ''}>✓ {it.midia_nome ?? 'áudio anexado'}</span>
                      : <span className="cm-hint">Grave na hora ou anexe um áudio pronto (mp3/ogg):</span>}
                    <AudioRecorderV2 permitirArquivo rotuloEnviar={it.midia_url ? 'Trocar áudio' : 'Usar este áudio'}
                      onEnviar={async (blob, mime, ext) => {
                        if (!orgId) return;
                        const f = new File([blob], `audio-regua-${Date.now().toString(36)}.${ext}`, { type: mime });
                        const r = await uploadMidiaCobranca(orgId, f);
                        mudarItem(k, { midia_url: r.url, midia_nome: r.nome });
                        aoAvisar('Áudio anexado à mensagem.');
                      }} />
                  </div>
                ) : (
                  <div className="cm-ed-midia">
                    {it.midia_url
                      ? <span className="cm-ed-arq num" title={it.midia_nome ?? ''}>{it.midia_nome ?? 'arquivo'}</span>
                      : <span className="cm-hint">Nenhum arquivo anexado.</span>}
                    <label className="cm-cad-btn" style={{ cursor: 'pointer' }}>
                      {upBusy === k ? 'Enviando…' : it.midia_url ? 'Trocar arquivo' : 'Anexar arquivo'}
                      <input type="file" accept={ACCEPT_ITEM[it.tipo]} style={{ display: 'none' }} disabled={upBusy !== null}
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) subirMidia(k, f); e.target.value = ''; }} />
                    </label>
                    <Input placeholder="Legenda (opcional)" value={it.corpo ?? ''} onChange={(e) => mudarItem(k, { corpo: e.target.value })} />
                  </div>
                )}
              </div>
            ))}
            <div>
              <BotaoSec mini onClick={() => setEd({ ...ed, itens: [...ed.itens, { ordem: ed.itens.length, tipo: 'texto', corpo: '', midia_url: null, midia_nome: null }] })}>＋ Adicionar bolha</BotaoSec>
            </div>
          </div>
        </ModalV2>
      )}
    </>
  );
}

/* ---- DEMO: Régua totalmente personalizável — mídia (texto/foto/vídeo/áudio,
   gravado na hora), mensagem por GRUPO (no lugar da padrão) e por CLIENTE. ---- */
export type TipoBloco = 'texto' | 'imagem' | 'video' | 'audio' | 'documento';
export const ROTULO_BLOCO: Record<TipoBloco, string> = { texto: 'Texto', imagem: 'Imagem/Foto', video: 'Vídeo', audio: 'Áudio', documento: 'Documento' };
const ACCEPT_BLOCO: Record<TipoBloco, string> = { texto: '', imagem: 'image/*', video: 'video/*', audio: 'audio/*', documento: '.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip' };
/** path = arquivo persistido no bucket wa-midia (sistema real); url = preview da sessão (blob:, não persiste);
    espera = segundos antes DESTE bloco quando a mensagem tem vários (delay configurável) */
export type Bloco = { tipo: TipoBloco; corpo?: string; nome?: string; url?: string; path?: string; espera?: number };
export type MsgDef = { id: string; nome: string; quando: number; blocos: Bloco[] };
let _rid = 0; export const rid = (p: string) => `${p}-${Date.now().toString(36)}-${_rid++}`;
export const resumoBlocos = (bs: Bloco[]) => bs.map((b) => ROTULO_BLOCO[b.tipo]).join(' → ') || '—';
export const ICONE_BLOCO: Record<TipoBloco, string> = { texto: '📝', imagem: '🖼', video: '🎬', audio: '🎤', documento: '📄' };
/** ícone de traço (família 1.7 do shell) — o módulo não usa emoji como cromo de interface */
export const IcT = ({ d, s = 13, mr = 5 }: { d: string; s?: number; mr?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ verticalAlign: '-2px', marginRight: mr, flexShrink: 0 }}><path d={d} /></svg>
);
export const IC_PATH = {
  importar: 'M12 15V4m0 0 4 4m-4-4L8 8M4 20h16',
  pagamento: 'M3 6.5h18v11H3zM3 10.5h18M6.5 14.5h4',
  ajustes: 'M4 8h9M17 8h3M13 8a2 2 0 1 0 4 0 2 2 0 0 0-4 0M4 16h3M11 16h9M7 16a2 2 0 1 0 4 0 2 2 0 0 0-4 0',
  pino: 'M9 4h6l-.7 5 2.7 2.7V14H7v-2.3L9.7 9zM12 14v7',
  girar: 'M21 12a9 9 0 1 1-2.6-6.4M21 3v6h-6',
  bandeira: 'M5 21V4m0 1h12l-2 4 2 4H5',
  enviar: 'M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z',
  texto: 'M4 6h16M4 12h16M4 18h10',
  imagem: 'M3 5h18v14H3zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM21 15l-5-5L5 21',
  video: 'M3 7h13v10H3zM16 11l5-3v8l-5-3',
  audio: 'M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3ZM5 11a7 7 0 0 0 14 0M12 18v3',
  mais: 'M12 5v14M5 12h14',
  cifrao: 'M12 2v20M17 6.5H9.5a3 3 0 0 0 0 6h5a3 3 0 0 1 0 6H6',
  relogio: 'M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
  percentual: 'M19 5 5 19M6.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM17.5 20a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  pessoas: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  carteira: 'M3 7h18v12H3zM3 11h18M16 15h2',
  documento: 'M6 2h9l4 4v16H6zM15 2v4h4M9 12h7M9 16h5',
} as const;
/** marcador do tipo de conteúdo (régua): ícone de traço, não emoji */
export const IconeBloco = ({ tipo, s = 11 }: { tipo: TipoBloco; s?: number }) => <IcT d={IC_PATH[tipo]} s={s} mr={0} />;
export const tiposUnicos = (bs: Bloco[]): TipoBloco[] => [...new Set(bs.map((b) => b.tipo))];
export const previewMsg = (m: { blocos: Bloco[] }): string => {
  const t = m.blocos.find((b) => b.tipo === 'texto' && (b.corpo || '').trim());
  if (t?.corpo) return t.corpo.trim();
  const b0 = m.blocos[0]; return b0 ? `(${ROTULO_BLOCO[b0.tipo].toLowerCase()})` : '—';
};
export const quandoCurto = (q: number) => (q < 0 ? `${Math.abs(q)}d` : q === 0 ? 'Dia D' : `+${q}d`);
export const quandoSub = (q: number) => (q < 0 ? 'antes' : q === 0 ? 'no vencimento' : 'depois');
/** "3 dias antes do vencimento" / "no dia do vencimento" / "2 dias depois do vencimento" */
export const quandoExtenso = (q: number) => (q === 0 ? 'no dia do vencimento'
  : `${Math.abs(q)} dia${Math.abs(q) > 1 ? 's' : ''} ${q < 0 ? 'antes' : 'depois'} do vencimento`);
const ATENDENTES_DEMO = [...new Set(CLIENTES.map((c) => c.atendente))].filter(Boolean).sort();
function contaMembros(criterio: string): number {
  if (criterio === 'todos') return CLIENTES.length;
  if (criterio.startsWith('comp:')) return CLIENTES.filter((c) => c.comportamento === criterio.slice(5)).length;
  if (criterio.startsWith('atend:')) return CLIENTES.filter((c) => c.atendente === criterio.slice(6)).length;
  return 0;
}
export const rotuloCriterio = (criterio: string): string => {
  if (criterio === 'todos') return 'Todos os clientes';
  if (criterio.startsWith('comp:')) return ROTULO_COMP[criterio.slice(5) as Comportamento] ?? criterio;
  if (criterio.startsWith('atend:')) return `Atendente ${criterio.slice(6)}`;
  return criterio;
};

/* dono 27/10: o ÚNICO valor que se cobra do cliente é a MEIA PARCELA — {valor da parcela} (a parcela
   inteira) saiu daqui pra ninguém se confundir; se sobrar escrito numa mensagem, o motor manda a meia */
export const VARS_MSG = ['{nome}', '{nome completo}', '{meia parcela}', '{vencimento}', '{nome do atendente}'] as const;
/** o que cada variável vira (dica no chip) */
export const DICA_VAR: Record<(typeof VARS_MSG)[number], string> = {
  '{nome}': 'Primeiro nome do cliente (ex.: Maria)',
  '{nome completo}': 'Nome completo como está na Gestão',
  '{meia parcela}': 'O valor que o cliente paga: a meia parcela (ex.: parcela R$ 232 → R$ 116)',
  '{vencimento}': 'Dia do vencimento (ex.: dia 28)',
  '{nome do atendente}': 'Nome do comercial dono do cliente',
};

export function EditorMsg({ msg, setMsg, comQuando, semNome, setAviso, aoSubirMidia }: {
  msg: MsgDef; setMsg: (m: MsgDef) => void; comQuando?: boolean; setAviso: (t: string) => void;
  /** régua do comercial: o nome do passo é o da padrão (não se edita) */
  semNome?: boolean;
  /** sistema real: persiste o arquivo (bucket wa-midia) e devolve o path — sem isso (demo), a mídia vive só na sessão */
  aoSubirMidia?: (arquivo: Blob, nome: string) => Promise<string>;
}) {
  const [subindo, setSubindo] = useState<number | null>(null);
  // sempre a versão MAIS RECENTE da mensagem: um upload demorado não pode regravar
  // o estado de antes dele (apagaria o que foi digitado enquanto o arquivo subia)
  const ultimo = useRef(msg); ultimo.current = msg;
  const setBloco = (k: number, patch: Partial<Bloco>) => { const m = ultimo.current; setMsg({ ...m, blocos: m.blocos.map((b, i) => (i === k ? { ...b, ...patch } : b)) }); };
  const mover = (k: number, d: number) => { const j = k + d; if (j < 0 || j >= msg.blocos.length) return; const bs = [...msg.blocos]; [bs[k], bs[j]] = [bs[j], bs[k]]; setMsg({ ...msg, blocos: bs }); };
  const add = (t: TipoBloco) => setMsg({ ...msg, blocos: [...msg.blocos, { tipo: t, corpo: '' }] });
  /** persiste o anexo; LANÇA em falha — o gravador de áudio precisa do erro pra
      manter o blob e oferecer "tentar novamente" (a gravação não pode se perder) */
  const anexar = async (k: number, f: Blob, nome: string) => {
    if (f.size > 16 * 1024 * 1024) { setAviso('Arquivo acima de 16MB — o WhatsApp não aceita.'); throw new Error('Arquivo acima de 16MB'); }
    if (!aoSubirMidia) { setBloco(k, { nome, url: URL.createObjectURL(f) }); return; }   // demo: só sessão
    setSubindo(k);
    const blocoAlvo = ultimo.current.blocos[k];   // se os blocos mudarem de lugar durante o upload, acha o mesmo
    try {
      const path = await aoSubirMidia(f, nome);
      const kAgora = ultimo.current.blocos.indexOf(blocoAlvo);
      setBloco(kAgora >= 0 ? kAgora : k, { nome, url: URL.createObjectURL(f), path });
      setAviso('Arquivo salvo na mensagem — vai junto em todo envio.');
    } catch (e) { setAviso(`Não deu pra salvar o arquivo: ${(e as Error).message}`); throw e; }
    finally { setSubindo(null); }
  };
  return (
    <div className="form-grid">
      {!semNome && <div className="campo"><label>Nome da mensagem</label><Input value={msg.nome} onChange={(e) => setMsg({ ...msg, nome: e.target.value })} placeholder="Ex.: Lembrete 3 dias antes" /></div>}
      {comQuando && (
        <div className="campo"><label>Quando enviar</label>
          <div className="cm-cad-linha">
            <Input inputMode="numeric" style={{ width: 64 }} value={String(Math.abs(msg.quando))} onChange={(e) => { const n = Math.max(0, Math.min(30, Math.trunc(Number(e.target.value) || 0))); setMsg({ ...msg, quando: msg.quando < 0 ? -n : n }); }} />
            <select className="inp" value={msg.quando < 0 ? 'antes' : msg.quando === 0 ? 'no_dia' : 'depois'} onChange={(e) => { const d = e.target.value; const n = Math.abs(msg.quando) || (d === 'no_dia' ? 0 : 1); setMsg({ ...msg, quando: d === 'antes' ? -n : d === 'no_dia' ? 0 : n }); }}>
              <option value="antes">dia(s) antes do vencimento</option><option value="no_dia">no dia do vencimento</option><option value="depois">dia(s) depois do vencimento</option>
            </select>
          </div>
        </div>
      )}
      <div className="campo"><label>Conteúdo (na ordem do envio) — texto, foto, vídeo ou áudio</label></div>
      {msg.blocos.map((b, k) => (
        <div className="cm-ed-item" key={k}>
          <div className="cm-ed-topo">
            <span className="cm-blk-tag">{ROTULO_BLOCO[b.tipo]}</span>
            <span className="cm-ed-ord num">{k + 1}º</span>
            {k > 0 && (
              <span className="cm-ed-espera num" title="Intervalo antes desta parte, até 60s (parece conversa de verdade)">
                esperar <Input inputMode="numeric" value={String(b.espera ?? 3)} style={{ width: 44, textAlign: 'center', padding: '2px 4px' }}
                  onChange={(e) => setBloco(k, { espera: Math.max(0, Math.min(60, Math.trunc(Number(e.target.value.replace(/\D/g, '')) || 0))) })} />s antes
              </span>
            )}
            <div className="cm-ed-mov">
              <button type="button" className="cm-num-lnk" onClick={() => mover(k, -1)} disabled={k === 0} aria-label="Subir">↑</button>
              <button type="button" className="cm-num-lnk" onClick={() => mover(k, 1)} disabled={k === msg.blocos.length - 1} aria-label="Descer">↓</button>
              <button type="button" className="cm-num-lnk perigo" onClick={() => setMsg({ ...msg, blocos: msg.blocos.filter((_, i) => i !== k) })} aria-label="Remover">✕</button>
            </div>
          </div>
          {b.tipo === 'texto' ? (
            <>
              <textarea className="inp" rows={3} value={b.corpo ?? ''} placeholder="Olá {nome}, sua mensalidade de {meia parcela} vence {vencimento}…" onChange={(e) => setBloco(k, { corpo: e.target.value })} />
              <div className="cm-ed-chips">
                {VARS_MSG.map((v) => (
                  <button type="button" key={v} className="cm-cli-filtro-btn" title={`${DICA_VAR[v]} — clique pra inserir`}
                    onClick={() => setBloco(k, { corpo: (b.corpo ?? '').trim() ? `${(b.corpo ?? '').replace(/\s+$/, '')} ${v}` : v })}>{v}</button>
                ))}
              </div>
            </>
          ) : b.tipo === 'audio' ? (
            <div className="cm-ed-midia cm-ed-audio">
              {b.url ? <audio controls src={b.url} className="cm-blk-audio" />
                : b.path ? <span className="cm-hint" style={{ margin: 0 }}>Áudio salvo: {b.nome ?? 'áudio'} ✓</span>
                : <span className="cm-hint">Grave o áudio na hora ou anexe um pronto:</span>}
              {subindo === k ? <span className="cm-hint" style={{ margin: 0 }}>Salvando áudio…</span> : (
                <AudioRecorderV2 permitirArquivo rotuloEnviar={b.url || b.path ? 'Regravar' : 'Usar este áudio'}
                  onEnviar={async (blob, _mime, ext) => { await anexar(k, blob, `audio-${Date.now().toString(36)}.${ext || 'ogg'}`); }} />
              )}
            </div>
          ) : (
            <div className="cm-ed-midia">
              {b.url
                ? (b.tipo === 'imagem' ? <img className="cm-blk-img" src={b.url} alt={b.nome ?? ''} /> : b.tipo === 'video' ? <video className="cm-blk-img" src={b.url} controls /> : <span className="cm-hint" style={{ margin: 0 }}><IcT d={IC_PATH.documento} /> {b.nome ?? 'documento'}</span>)
                : b.path ? <span className="cm-hint" style={{ margin: 0 }}>Arquivo salvo: {b.nome ?? 'arquivo'} ✓</span>
                : <span className="cm-hint">Nenhum arquivo escolhido.</span>}
              <label className="cm-cad-btn" style={{ cursor: 'pointer' }}>
                {subindo === k ? 'Salvando…' : b.url || b.path ? 'Trocar arquivo' : (b.tipo === 'imagem' ? 'Escolher imagem/foto' : b.tipo === 'video' ? 'Escolher vídeo' : 'Escolher documento')}
                <input type="file" accept={ACCEPT_BLOCO[b.tipo]} style={{ display: 'none' }} disabled={subindo != null}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) anexar(k, f, f.name).catch(() => null); e.target.value = ''; }} />
              </label>
              <Input placeholder="Legenda (opcional — aceita as variáveis)" value={b.corpo ?? ''} onChange={(e) => setBloco(k, { corpo: e.target.value })} />
            </div>
          )}
        </div>
      ))}
      <div className="cm-blk-add">
        <span className="cm-hint">Adicionar:</span>
        <BotaoSec mini onClick={() => add('texto')}>＋ Texto</BotaoSec>
        <BotaoSec mini onClick={() => add('imagem')}>＋ Imagem/Foto</BotaoSec>
        <BotaoSec mini onClick={() => add('video')}>＋ Vídeo</BotaoSec>
        <BotaoSec mini onClick={() => add('audio')}>＋ Áudio</BotaoSec>
        <BotaoSec mini onClick={() => add('documento')}>＋ Documento</BotaoSec>
      </div>
      <p className="cm-vars">As partes saem na ordem, com o intervalo configurado entre elas. Variável sem dado no cadastro = a mensagem daquele cliente NÃO sai (vira erro explicado na fila).</p>
    </div>
  );
}

export type GrupoMsg = { id: string; nome: string; criterio: string; msg: MsgDef };
export type CliMsg = { id: string; cliId: string; cliNome: string; data: string; msg: MsgDef };
export type EdReg =
  | { alvo: 'padrao'; novo: boolean; msg: MsgDef }
  | { alvo: 'grupo'; novo: boolean; nome: string; criterio: string; msg: MsgDef }
  | { alvo: 'cliente'; novo: boolean; cliId: string; data: string; msg: MsgDef }
  /** régua do comercial (dono 26/10): só a MENSAGEM de um passo da padrão — nome e dias são os da padrão */
  | { alvo: 'versao'; novo: boolean; comercial: string; passoId: string; q0: number; msg: MsgDef };
/** "EDUARDO" / "paty " → "Eduardo" / "Paty" (nome do comercial como a pessoa lê) */
export const nomeComercial = (s: string) => s.trim().toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase());
/** chave do comercial = mesma conta do banco (wa_nome_chave) e do motor (normNome) */
export const chaveCom = (s: string | null | undefined) =>
  String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toUpperCase();

/** botões "Régua de: Padrão · Eduardo · Garcia…" (admin/gestor escolhem de quem é a régua aberta) */
export function SeletorReguaDe({ valor, opcoes, aoMudar }: {
  valor: string; opcoes: { chave: string; nome: string; proprias: number }[]; aoMudar: (chave: string) => void;
}) {
  const chaves = ['', ...opcoes.map((o) => o.chave)];
  const caixa = useRef<HTMLDivElement>(null);
  // radiogroup: Tab entra só no marcado; setas andam e já escolhem (padrão WAI-ARIA)
  const tecla = (e: ReactKeyboardEvent) => {
    const passo = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!passo) return;
    e.preventDefault();
    const i = Math.max(0, chaves.indexOf(valor));
    const j = (i + passo + chaves.length) % chaves.length;
    aoMudar(chaves[j]);
    caixa.current?.querySelectorAll<HTMLButtonElement>('button[role="radio"]')[j]?.focus();
  };
  const marcado = chaves.includes(valor) ? valor : '';
  return (
    <div className="rg-de" role="radiogroup" aria-label="De quem é a régua" ref={caixa} onKeyDown={tecla}>
      <span className="rg-de-rot" aria-hidden>Régua de</span>
      <button type="button" role="radio" aria-checked={valor === ''} tabIndex={marcado === '' ? 0 : -1} className={valor === '' ? 'on' : ''} onClick={() => aoMudar('')}>Padrão <small>(todos)</small></button>
      {opcoes.map((o) => (
        <button key={o.chave} type="button" role="radio" aria-checked={valor === o.chave} tabIndex={marcado === o.chave ? 0 : -1} className={valor === o.chave ? 'on' : ''} onClick={() => aoMudar(o.chave)}
          aria-label={o.proprias > 0 ? `${o.nome}, ${o.proprias} ${o.proprias > 1 ? 'alterações' : 'alteração'} na régua` : o.nome}>
          {o.nome}{o.proprias > 0 && <span className="rg-de-n" aria-hidden>{o.proprias}</span>}
        </button>
      ))}
    </div>
  );
}

/** a régua de UM comercial: os passos da sequência padrão com a mensagem DELE (própria ou a padrão).
    Os dias são sempre os da padrão — aqui só se troca a mensagem. */
/** a versão de um passo na régua de um comercial: mensagem própria (blocos; vazio = a da padrão),
    dia próprio (quando; null = o da padrão) e/ou EXCLUÍDA da régua dele */
export type VersaoCom = { blocos: Bloco[]; excluida: boolean; quando: number | null };
/** o dia que vale pra este comercial: o próprio (mesmo lado do vencimento) ou o da padrão; a Cobrança do dia não muda */
export const diaEfetivo = (m: MsgDef, v: VersaoCom | null) =>
  v?.quando != null && m.quando !== 0 && Math.sign(v.quando) === Math.sign(m.quando) ? v.quando : m.quando;
/** os passos da padrão como saem pra este comercial (dia dele), em ordem; excluídos ficam de fora */
export const passosDoComercial = (passos: MsgDef[], versaoDe: (passoId: string) => VersaoCom | null) =>
  passos.filter((m) => !versaoDe(m.id)?.excluida).map((m) => ({ ...m, quando: diaEfetivo(m, versaoDe(m.id)) })).sort((a, b) => a.quando - b.quando);
export function CartoesReguaComercial({ passos, nome, versaoDe, podeEditar, aoEditar, aoUsarPadrao, aoExcluir, aoVoltar, minha, carregando, erro, grupoNoDia }: {
  passos: MsgDef[]; nome: string; versaoDe: (passoId: string) => VersaoCom | null; podeEditar: boolean;
  /** abre o editor: mensagem que vale hoje, se é a 1ª alteração, e o dia que vale hoje */
  aoEditar: (passo: MsgDef, blocos: Bloco[], novo: boolean, quando: number) => void; aoUsarPadrao: (passo: MsgDef) => void;
  /** tira o passo da régua deste comercial (só os clientes dele deixam de receber) */
  aoExcluir: (passo: MsgDef) => void;
  /** passo excluído volta a sair (com a mensagem/dia próprios guardados, se havia; senão a padrão) */
  aoVoltar: (passo: MsgDef) => void;
  /** o próprio comercial olhando a régua dele (texto na 2ª pessoa) */
  minha?: boolean; carregando?: boolean; erro?: string | null;
  /** grupos ativos no MESMO dia que pegam clientes deste comercial: pra quem está no grupo, sai a do grupo */
  grupoNoDia?: (passo: MsgDef) => string[];
}) {
  if (erro) return <div className="cm-exc-vazio">Não deu pra carregar a régua agora ({erro}). Atualize a página.</div>;
  if (carregando) return <div className="cm-exc-vazio">Carregando a régua…</div>;
  // cartões na ordem dos dias DESTE comercial (excluídos no fim)
  const ordem = [...passos].sort((a, b) => {
    const va = versaoDe(a.id), vb = versaoDe(b.id);
    return (va?.excluida ? 1 : 0) - (vb?.excluida ? 1 : 0) || diaEfetivo(a, va) - diaEfetivo(b, vb);
  });
  return (
    <>
      <p className="cm-hint rg-com-hint">{minha
        ? <>Seus clientes recebem estas mensagens pelo seu WhatsApp. Onde está <b>Usa a padrão</b>, vai a mensagem padrão no dia da padrão{podeEditar ? <> — em <b>Editar</b> você muda a mensagem e o dia; em <b>Excluir</b>, seus clientes deixam de receber aquela mensagem</> : null}.</>
        : <>Os clientes de <b>{nome}</b> recebem estas mensagens pelo WhatsApp do comercial deles. Onde está <b>Usa a padrão</b>, vai a mensagem padrão no dia da padrão{podeEditar ? <> — em <b>Editar</b> dá pra mudar a mensagem e o dia; em <b>Excluir</b>, os clientes de {nome} deixam de receber aquela mensagem</> : null}.</>}</p>
      <div className="rg-cards">
        {ordem.map((m) => {
          const v = versaoDe(m.id);
          const msgPropria = !!v && v.blocos.length > 0;
          const q = diaEfetivo(m, v);
          const diaProprio = q !== m.quando;
          const alterado = msgPropria || diaProprio;
          const exib: MsgDef = msgPropria ? { ...m, blocos: v!.blocos } : m;
          const selos = <>{msgPropria && <span className="rg-pub rg-pub-propria">Mensagem própria</span>}{diaProprio && <span className="rg-pub rg-pub-propria">Dia próprio</span>}{!alterado && <span className="rg-pub">Usa a padrão</span>}</>;
          if (v?.excluida) return (
            <div className="rg-card rg-card-excluida" key={m.id}>
              <div className="rg-quando"><b className="num">{quandoCurto(q)}</b><i>{quandoSub(q)}</i></div>
              <div className="rg-corpo">
                <div className="rg-topo"><span className="rg-nm">{m.nome}</span><span className="rg-pub rg-pub-excluida">Excluída</span></div>
                <div className="rg-prev">{minha ? 'Seus clientes não recebem esta mensagem.' : `Os clientes de ${nome} não recebem esta mensagem.`}{alterado ? ' O que foi personalizado fica guardado.' : ''}</div>
                {(grupoNoDia?.(m) ?? []).map((g) => <div className="rg-donos" key={g}>Atenção: no mesmo dia ainda sai o grupo “{g}” pra quem está nele.</div>)}
              </div>
              {podeEditar && <div className="rg-acoes"><BotaoSec mini onClick={() => aoVoltar(m)}>Voltar a usar</BotaoSec></div>}
            </div>
          );
          return (
            <div className={`rg-card${alterado ? ' rg-card-propria' : ''}`} key={m.id}>
              <div className="rg-quando"><b className="num">{quandoCurto(q)}</b><i>{quandoSub(q)}</i></div>
              <div className="rg-corpo">
                <div className="rg-topo"><span className="rg-nm">{m.nome}</span>{selos}</div>
                <div className="rg-tipos">{tiposUnicos(exib.blocos).map((t) => <span className="rg-tipo" key={t}><IconeBloco tipo={t} /> {ROTULO_BLOCO[t]}</span>)}</div>
                <div className="rg-prev">{previewMsg(exib)}</div>
                {diaProprio && <div className="rg-donos">Na padrão sai {quandoExtenso(m.quando)}; {minha ? 'na sua' : `na de ${nome}`}, {quandoExtenso(q)}.</div>}
                {(grupoNoDia?.(m) ?? []).map((g) => <div className="rg-donos" key={g}>{diaProprio
                  ? <>Pra quem está no grupo “{g}”, vai a mensagem do grupo ({quandoExtenso(m.quando)}) no lugar desta.</>
                  : <>No mesmo dia sai o grupo “{g}”: pra quem está nele, vai a mensagem do grupo no lugar desta.</>}</div>)}
              </div>
              {podeEditar && (
                <div className="rg-acoes">
                  <BotaoSec mini onClick={() => aoEditar(m, JSON.parse(JSON.stringify(exib.blocos)) as Bloco[], !v, q)}>{alterado ? 'Editar' : 'Personalizar'}</BotaoSec>
                  {alterado && <button type="button" className="cm-num-lnk" onClick={() => aoUsarPadrao(m)}>Usar a padrão</button>}
                  <button type="button" className="cm-num-lnk perigo" onClick={() => aoExcluir(m)}>Excluir</button>
                </div>
              )}
            </div>
          );
        })}
        {passos.length === 0 && <div className="cm-exc-vazio">Nenhuma mensagem ativa na sequência padrão.</div>}
      </div>
    </>
  );
}
/** o que salvar ao fechar o editor da régua do comercial: mensagem igual à padrão vira [] (= usa a
    da padrão), dia igual ao da padrão vira null; nada próprio sobrando = apagar a versão (volta pra padrão) */
export function decidirVersao(a: { blocos: Bloco[]; blocosPadrao: Bloco[]; quando: number; q0: number; existe: boolean; exigeArquivoSalvo?: boolean }):
  { acao: 'nada' | 'apagar' | 'salvar'; blocos: Bloco[]; quando: number | null; erro?: string } {
  const msgIgual = mesmosBlocos(a.blocos, a.blocosPadrao);
  const quando = a.q0 === 0 || a.quando === a.q0 ? null : a.quando;
  const blocos = msgIgual ? [] : a.blocos;
  if (!msgIgual && !temConteudo(blocos, a.exigeArquivoSalvo ?? true)) return { acao: 'nada', blocos, quando, erro: 'Escreva um texto ou anexe um arquivo (e espere ele salvar) — senão a mensagem não sai.' };
  if (msgIgual && quando == null) return { acao: a.existe ? 'apagar' : 'nada', blocos, quando };
  return { acao: 'salvar', blocos, quando };
}
/** o dia que vai valer MUDA e bate com outro passo da régua deste comercial? (mesma regra do banco, mig 77) */
export const diaVaiColidir = (passos: MsgDef[], versaoDe: (passoId: string) => VersaoCom | null, passo: MsgDef, diaNovo: number, voltandoDeExcluida = false) => {
  const atual = diaEfetivo(passo, versaoDe(passo.id));
  return (voltandoDeExcluida || diaNovo !== atual) && diaOcupado(passos, versaoDe, passo.id, diaNovo);
};
/** o dia próprio guardado ainda vale? (a padrão pode ter mudado de lado depois) — senão manda null */
export const diaProprioValido = (passo: MsgDef, v: VersaoCom | null) => (v && diaEfetivo(passo, v) !== passo.quando ? v.quando : null);
/** outro passo ATIVO (não excluído) da régua deste comercial já sai nesse dia? (o banco também barra) */
export const diaOcupado = (passos: MsgDef[], versaoDe: (passoId: string) => VersaoCom | null, passoId: string, quando: number) =>
  passos.some((m) => m.id !== passoId && !versaoDe(m.id)?.excluida && diaEfetivo(m, versaoDe(m.id)) === quando);
/** campo "quando sai" da régua do comercial: antes continua antes, depois continua depois, a Cobrança do dia não muda.
    Digita livre (o campo pode ficar vazio enquanto escreve); ajusta pra 1–30 ao sair do campo. */
export function DiaDaVersao({ q0, valor, aoMudar }: { q0: number; valor: number; aoMudar: (q: number) => void }) {
  const lado = q0 < 0 ? -1 : 1;
  const [txt, setTxt] = useState(String(Math.abs(valor) || Math.abs(q0)));
  useEffect(() => { setTxt(String(Math.abs(valor) || Math.abs(q0))); }, [valor, q0]);
  if (q0 === 0) return <div className="campo"><label>Quando sai</label><p className="cm-hint" style={{ margin: 0 }}>No dia da cobrança — a Cobrança do dia não muda de dia.</p></div>;
  const n = Math.trunc(Number(txt)) || 0;
  const fechar = () => { const k = Math.max(1, Math.min(30, n || Math.abs(q0))); setTxt(String(k)); aoMudar(lado * k); };
  return (
    <div className="campo"><label htmlFor="rg-dia-versao">Quando sai</label>
      <div className="cm-cad-linha">
        <Input id="rg-dia-versao" inputMode="numeric" maxLength={2} style={{ width: 64 }} value={txt}
          onChange={(e) => { const t = e.target.value.replace(/\D/g, '').slice(0, 2); setTxt(t); const k = Number(t); if (k >= 1 && k <= 30) aoMudar(lado * k); }}
          onBlur={fechar} />
        <span>{n === 1 ? 'dia' : 'dias'} {lado < 0 ? 'antes' : 'depois'} do vencimento <small>(1 a 30)</small></span>
        {valor !== q0 && <button type="button" className="cm-num-lnk" onClick={() => aoMudar(q0)}>voltar pro dia da padrão ({Math.abs(q0)})</button>}
      </div>
    </div>
  );
}
/** mesma mensagem? (texto sem espaços das pontas, arquivo, nome, espera) — "Personalizar" e salvar
    sem mudar nada não congela uma cópia da padrão */
export const mesmosBlocos = (a: Bloco[], b: Bloco[]) => {
  const n = (bs: Bloco[]) => JSON.stringify(bs.map((x) => [x.tipo, (x.corpo ?? '').trim(), x.path ?? '', x.nome ?? '', x.espera ?? 0]));
  return n(a) === n(b);
};
/** grupos ativos no mesmo "quando" que pegam clientes do comercial `chave` (todos, por comportamento, ou dele) */
export const gruposNoDia = (grupos: GrupoMsg[], passo: MsgDef, chave: string) =>
  grupos.filter((g) => Number(g.msg.quando) === Number(passo.quando)
    && (g.criterio === 'todos' || g.criterio.startsWith('comp:') || (g.criterio.startsWith('atend:') && chaveCom(g.criterio.slice(6)) === chave)))
    .map((g) => g.nome);
/** a mensagem da régua do comercial tem algo que SAI (texto escrito ou arquivo salvo/anexado)? */
export const temConteudo = (bs: Bloco[], exigeArquivoSalvo = true) =>
  bs.some((b) => (b.tipo === 'texto' ? !!(b.corpo ?? '').trim() : exigeArquivoSalvo ? !!b.path : !!(b.path || b.url)));

/* régua demo persiste em localStorage (padrão dos outros stores demo): antes era
   useState puro — o botão dizia "Mensagem salva." e um F5 perdia tudo (auditoria 30/09) */
const REGUA_LS = 'alfa_regua_v1';
/** versoes: chave do comercial → id do passo da padrão → mensagem própria dele e/ou passo excluído */
type ReguaDemo = { padrao: MsgDef[]; grupos: GrupoMsg[]; porCli: CliMsg[]; versoes: Record<string, Record<string, VersaoCom>> };
const reguaSeed = (): ReguaDemo => ({
  padrao: MSGS_DEMO.map((m, i) => ({ id: `p${i}`, nome: m.nome, quando: m.offset, blocos: [{ tipo: 'texto', corpo: m.corpo }] })),
  grupos: [
    { id: 'g0', nome: 'Fim de ano', criterio: 'todos', msg: { id: 'gm0', nome: 'Mensagem de dezembro', quando: 0, blocos: [{ tipo: 'texto', corpo: 'Oi {nome}! Passando pra desejar boas festas e lembrar da sua mensalidade de {valor}. 🎄' }] } },
  ],
  porCli: [],
  versoes: {},
});
function reguaCarregar(): ReguaDemo {
  try {
    const raw = localStorage.getItem(REGUA_LS);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && Array.isArray(p.padrao) && Array.isArray(p.grupos) && Array.isArray(p.porCli)) {
        // formato antigo (só a lista de blocos) vira { blocos, excluida: false }
        const bruto = p.versoes && typeof p.versoes === 'object' && !Array.isArray(p.versoes) ? p.versoes as Record<string, Record<string, unknown>> : {};
        const versoes: ReguaDemo['versoes'] = Object.fromEntries(Object.entries(bruto).map(([c, ps]) => [c, Object.fromEntries(Object.entries(ps ?? {})
          .map(([pid, v]) => [pid, Array.isArray(v) ? { blocos: v as Bloco[], excluida: false, quando: null }
            : { blocos: ((v as VersaoCom)?.blocos ?? []) as Bloco[], excluida: !!(v as VersaoCom)?.excluida, quando: typeof (v as VersaoCom)?.quando === 'number' ? (v as VersaoCom).quando : null }]))]));
        return { padrao: p.padrao, grupos: p.grupos, porCli: p.porCli, versoes };
      }
    }
  } catch { /* ignore */ }
  return reguaSeed();
}
/* demo: pausa por comercial e configuração da régua (no real: wa_regua_config, migs 78/85) */
const PAUSA_LS = 'alfa_regua_pausa_v1';
const CFG_LS = 'alfa_regua_cfg_v1';
const CFG_DEMO: ValoresConfigRegua = { hora_envio: 5, hora_fim: 10, dias_envio: 'todos', teto_diario: 60, delay_min: 40, delay_max: 90, pausa_cada: 15, pausa_min: 5, canal_reserva_id: null, pausar_se_respondeu: true };
function lerLS<T>(k: string, padrao: T): T {
  try { const v = JSON.parse(localStorage.getItem(k) ?? 'null'); return v && typeof v === 'object' && !Array.isArray(v) ? { ...padrao, ...v } : padrao; } catch { return padrao; }
}
function gravarLS(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } }
/* demo: horário de início por comercial (no real: wa_regua_config.horario_comercial, mig 82/83) */
const HORARIO_LS = 'alfa_regua_horario_v1';
function horariosDemoLer(): Record<string, number> {
  try { const m = JSON.parse(localStorage.getItem(HORARIO_LS) ?? '{}'); return m && typeof m === 'object' && !Array.isArray(m) ? m : {}; } catch { return {}; }
}
function horariosDemoGravar(m: Record<string, number>) { try { localStorage.setItem(HORARIO_LS, JSON.stringify(m)); } catch { /* ignore */ } }
function reguaSalvar(r: ReguaDemo) { try { localStorage.setItem(REGUA_LS, JSON.stringify(r)); } catch { /* ignore */ } }

function AbaReguaDemo({ gestor, aoAvisar }: { gestor: boolean; aoAvisar: (t: string) => void }) {
  const [subaba, setSubaba] = useState<'padrao' | 'grupos' | 'cliente'>('padrao');
  const [regua0] = useState(reguaCarregar);   // uma leitura só, no mount
  const [padrao, setPadrao] = useState<MsgDef[]>(regua0.padrao);
  const [grupos, setGrupos] = useState<GrupoMsg[]>(regua0.grupos);
  const [porCli, setPorCli] = useState<CliMsg[]>(regua0.porCli);
  const [versoes, setVersoes] = useState<ReguaDemo['versoes']>(regua0.versoes);
  const [reguaDe, setReguaDe] = useState('');   // '' = padrão; senão a chave do comercial
  // demo: "ver como" um comercial = exatamente a tela que ele vê no sistema real (só a régua dele)
  const [verComo, setVerComo] = useState('');
  const souComercial = !!verComo;
  const reguaAberta = souComercial ? verComo : reguaDe;
  const [usarPadrao, setUsarPadrao] = useState<MsgDef | null>(null);
  /* tela organizada (29/10): gestor com abas; comercial com "Minha régua" (pausar/retomar + horário) */
  const [abaRg, setAbaRg] = useState<AbaRegua>('mensagens');
  const [pausas, setPausas] = useState<Record<string, string>>(() => lerLS<Record<string, string>>(PAUSA_LS, {}));
  const [cfgDemo, setCfgDemo] = useState<ValoresConfigRegua>(() => lerLS(CFG_LS, CFG_DEMO));
  const [confirmaPausa, setConfirmaPausa] = useState<{ chave: string; nome: string } | null>(null);
  /* horário de envio de cada comercial (mig 83 no real) — demo: localStorage, janela fixa 05:00–10:00 */
  const [horarios, setHorarios] = useState<Record<string, number>>(horariosDemoLer);
  // lê do DISCO (não do estado): o Desfazer roda depois e não pode regravar um mapa velho
  const gravarHorario = (com: string, hora: number | null) => {
    const atual = horariosDemoLer();
    const antes = atual[com] ?? null;
    const novo = { ...atual }; if (hora == null || hora <= cfgDemo.hora_envio) delete novo[com]; else novo[com] = hora;
    setHorarios(novo); horariosDemoGravar(novo);
    return antes;
  };
  const mudarHorario = (com: string, hora: number | null) => {
    const antes = gravarHorario(com, hora);
    const h2 = (n: number) => String(n).padStart(2, '0');
    aoAvisar(hora != null && hora > cfgDemo.hora_envio
      ? `As mensagens ${souComercial ? 'dos seus clientes' : `dos clientes de ${nomeDe(com)}`} começam às ${h2(hora)}:00 (até ${h2(cfgDemo.hora_fim)}:00). Dá pra voltar pelo botão Desfazer.`
      : `${souComercial ? 'Seus clientes voltam' : `Os clientes de ${nomeDe(com)} voltam`} pro início geral (${h2(cfgDemo.hora_envio)}:00). Dá pra voltar pelo botão Desfazer.`);
    if (antes !== (hora != null && hora > cfgDemo.hora_envio ? hora : null)) {
      registrarDesfazer({ rotulo: `horário de envio de ${nomeDe(com)}`, inverso: async () => { gravarHorario(com, antes); } });
    }
  };
  const [ed, setEd] = useState<EdReg | null>(null);
  const [excluir, setExcluir] = useState<{ alvo: 'padrao' | 'grupo' | 'cliente'; id: string; nome: string } | null>(null);
  const clientesOrd = useMemo(() => [...CLIENTES].sort((a, b) => a.nome.localeCompare(b.nome)), []);
  const opcoesDe = useMemo(() => ATENDENTES_DEMO.map((a) => ({ chave: chaveCom(a), nome: nomeComercial(a),
    proprias: Object.keys(versoes[chaveCom(a)] ?? {}).filter((pid) => padrao.some((p) => p.id === pid)).length })), [versoes, padrao]);
  const nomeDe = (k: string) => opcoesDe.find((o) => o.chave === k)?.nome ?? nomeComercial(k);
  const propriasDoPasso = (passoId: string) => opcoesDe.filter((o) => { const v = versoes[o.chave]?.[passoId]; return !!v && !v.excluida && (v.blocos.length > 0 || v.quando != null); }).map((o) => o.nome);
  const excluidasDoPasso = (passoId: string) => opcoesDe.filter((o) => versoes[o.chave]?.[passoId]?.excluida).map((o) => o.nome);
  const [excluirDoCom, setExcluirDoCom] = useState<MsgDef | null>(null);

  /* ---- tela organizada (demo = mesma tela do real, com dados de exemplo) ---- */
  const clientesDe = (k: string) => CLIENTES.filter((c) => c.ativo !== false && chaveCom(c.atendente) === k);
  const diaCiclo = (c: { ciclo: string }) => Number(String(c.ciclo).replace(/\D/g, '')) || 0;
  /** quantos clientes do comercial recebem algo no dia `d` (passo q → vencimento d−q), com a régua DELE */
  const recebemNoDia = (k: string, d: Date) => {
    if (pausas[k]) return 0;
    const passos = passosDoComercial([...padrao], (pid) => versoes[k]?.[pid] ?? null);
    const cs = clientesDe(k);
    return passos.reduce((n, m) => { const v = new Date(d); v.setDate(v.getDate() - m.quando); return n + cs.filter((c) => diaCiclo(c) === v.getDate()).length; }, 0);
  };
  const tilesDe = (k: string) => {
    const hoje = new Date(); const amanha = new Date(Date.now() + 864e5);
    const t = (n: number, quando: string) => ({ valor: String(n), unidade: n === 1 ? 'mensagem' : 'mensagens', sub: pausas[k] ? 'régua pausada — nada sai' : `previstas pra ${quando} (demonstração)` });
    const cs = clientesDe(k);
    return { hoje: t(recebemNoDia(k, hoje), 'hoje'), amanha: t(recebemNoDia(k, amanha), 'amanhã'), clientes: { valor: String(cs.length), unidade: 'em cobrança', sub: `${cs.filter((c) => !!c.whatsapp).length} com telefone` } };
  };
  const numeroDe = (k: string) => ({ conectado: true, rotulo: 'Conectado', detalhe: `WhatsApp de ${nomeDe(k)}` });
  const mudarPausa = (k: string, pausar: boolean) => {
    const antes = lerLS<Record<string, string>>(PAUSA_LS, {});
    const novo = { ...antes }; if (pausar) novo[k] = new Date().toISOString(); else delete novo[k];
    setPausas(novo); gravarLS(PAUSA_LS, novo);
  };
  const pedirPausa = (k: string, nome: string, pausar: boolean) => {
    if (pausar) { setConfirmaPausa({ chave: k, nome }); return; }
    mudarPausa(k, false);
    aoAvisar(`${souComercial ? 'Sua régua voltou' : `A régua de ${nome} voltou`} a funcionar. Dá pra voltar pelo botão Desfazer.`);
    registrarDesfazer({ rotulo: `retomada da régua de ${nome}`, inverso: async () => mudarPausa(k, true) });
  };
  const confirmarPausa = () => {
    if (!confirmaPausa) return;
    const { chave, nome } = confirmaPausa;
    mudarPausa(chave, true); setConfirmaPausa(null);
    aoAvisar(`${souComercial ? 'Sua régua foi pausada' : `A régua de ${nome} foi pausada`} — nenhuma mensagem automática sai pra esses clientes até retomar. Dá pra voltar pelo botão Desfazer.`);
    registrarDesfazer({ rotulo: `pausa da régua de ${nome}`, inverso: async () => mudarPausa(chave, false) });
  };
  const salvarCfgDemo = (patch: Partial<ValoresConfigRegua>, ok?: string) => {
    const antes = lerLS(CFG_LS, CFG_DEMO);
    const novo = { ...antes, ...patch }; setCfgDemo(novo); gravarLS(CFG_LS, novo);
    aoAvisar(ok ?? 'Configuração salva.');
    registrarDesfazer({ rotulo: 'configuração da régua', inverso: async () => { setCfgDemo(antes); gravarLS(CFG_LS, antes); } });
  };
  const linhasCom: LinhaComercialRegua[] = opcoesDe.map((o) => {
    const cs = clientesDe(o.chave);
    return { chave: o.chave, nome: o.nome, clientes: cs.length, comTelefone: cs.filter((c) => !!c.whatsapp).length, numero: numeroDe(o.chave),
      inicio: horarios[o.chave] ?? null, pausada: !!pausas[o.chave], proprias: o.proprias };
  });
  const cabecalhoDe = (k: string, minha: boolean) => (
    <CabecalhoReguaComercial nome={nomeDe(k)} minha={minha} empresaLigada inicioEmpresa={cfgDemo.hora_envio} numero={numeroDe(k)}
      pausada={!!pausas[k]} podeEditar aoPausar={(p) => pedirPausa(k, nomeDe(k), p)} tiles={tilesDe(k)}
      horario={{ inicioGeral: cfgDemo.hora_envio, fim: cfgDemo.hora_fim, valor: horarios[k] ?? null, aoMudar: (h) => mudarHorario(k, h) }} />
  );

  const salvarEd = () => {
    if (!ed) return;
    if (ed.alvo === 'versao') {
      const com = ed.comercial, pid = ed.passoId, anterior = versoes[com]?.[pid] ?? null;
      const base = padrao.find((p) => p.id === pid);
      const d = decidirVersao({ blocos: ed.msg.blocos, blocosPadrao: base?.blocos ?? [], quando: ed.msg.quando, q0: ed.q0, existe: !!anterior, exigeArquivoSalvo: false });
      if (d.erro) { aoAvisar(d.erro); return; }
      if (d.acao === 'nada') { aoAvisar('Igual à padrão (mensagem e dia) — nada foi salvo.'); setEd(null); return; }
      const vDe = (x: string) => versoes[com]?.[x] ?? null;
      if (base && diaVaiColidir(padrao, vDe, base, d.acao === 'apagar' ? ed.q0 : d.quando ?? ed.q0)) { aoAvisar('Já tem outra mensagem nessa régua nesse dia — escolha outro dia.'); return; }
      const doCom = { ...(versoes[com] ?? {}) };
      if (d.acao === 'apagar') delete doCom[pid]; else doCom[pid] = { blocos: d.blocos, excluida: false, quando: d.quando };
      const prox: ReguaDemo = { padrao, grupos, porCli, versoes: { ...versoes, [com]: doCom } };
      setVersoes(prox.versoes);
      reguaSalvar(prox);
      registrarDesfazer({ rotulo: `mensagem da régua de ${nomeDe(com)}`, inverso: async () => restaurarVersao(com, pid, anterior) });
      aoAvisar(d.acao === 'apagar' ? `Ficou igual à padrão — ${nomeDe(com)} volta a usar a padrão neste passo.` : `Salvo na régua de ${nomeDe(com)}.`);
      setEd(null);
      return;
    }
    if (!ed.msg.nome.trim()) { aoAvisar('Dê um nome à mensagem.'); return; }
    if (ed.msg.blocos.length === 0) { aoAvisar('Adicione ao menos um conteúdo (texto, foto, vídeo ou áudio).'); return; }
    // próximo estado calculado FORA dos setters: o MESMO objeto vai pro estado e pro localStorage
    const prox: ReguaDemo = { padrao, grupos, porCli, versoes };
    if (ed.alvo === 'padrao') prox.padrao = ed.novo ? [...padrao, ed.msg] : padrao.map((p) => (p.id === ed.msg.id ? ed.msg : p));
    else if (ed.alvo === 'grupo') {
      const g: GrupoMsg = { id: ed.msg.id, nome: ed.nome.trim() || 'Grupo', criterio: ed.criterio, msg: ed.msg };
      prox.grupos = ed.novo ? [...grupos, g] : grupos.map((x) => (x.id === g.id ? g : x));
    } else {
      const cl = clientesOrd.find((c) => c.id === ed.cliId);
      const c: CliMsg = { id: ed.msg.id, cliId: ed.cliId, cliNome: cl?.nome ?? 'Cliente', data: ed.data, msg: ed.msg };
      prox.porCli = ed.novo ? [...porCli, c] : porCli.map((x) => (x.id === c.id ? c : x));
    }
    setPadrao(prox.padrao); setGrupos(prox.grupos); setPorCli(prox.porCli);
    reguaSalvar(prox);
    aoAvisar('Mensagem salva.');
    setEd(null);
  };

  const confirmarExcluir = () => {
    if (!excluir) return;
    // passo da padrão excluído leva junto as mensagens próprias dele (igual ao banco: ON DELETE CASCADE)
    const semPasso = excluir.alvo === 'padrao'
      ? Object.fromEntries(Object.entries(versoes).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).filter(([pid]) => pid !== excluir.id))]))
      : versoes;
    const prox: ReguaDemo = {
      padrao: excluir.alvo === 'padrao' ? padrao.filter((p) => p.id !== excluir.id) : padrao,
      grupos: excluir.alvo === 'grupo' ? grupos.filter((g) => g.id !== excluir.id) : grupos,
      porCli: excluir.alvo === 'cliente' ? porCli.filter((c) => c.id !== excluir.id) : porCli,
      versoes: semPasso,
    };
    setPadrao(prox.padrao); setGrupos(prox.grupos); setPorCli(prox.porCli); setVersoes(prox.versoes);
    reguaSalvar(prox);
    registrarBloqueada('excluir mensagem da régua', 'A mensagem foi removida — recadastre na régua se precisar.');
    aoAvisar('Mensagem excluída da régua.');
    setExcluir(null);
  };
  /** Desfazer da régua do comercial: relê o que está salvo AGORA e só devolve a mensagem daquele
      comercial naquele passo (não apaga o que foi editado depois na padrão/grupos/clientes) */
  const restaurarVersao = (com: string, pid: string, anterior: VersaoCom | null) => {
    const atual = reguaCarregar();
    const doCom = { ...(atual.versoes[com] ?? {}) };
    if (anterior) doCom[pid] = anterior; else delete doCom[pid];
    const prox: ReguaDemo = { ...atual, versoes: { ...atual.versoes, [com]: doCom } };
    reguaSalvar(prox);
    setVersoes(prox.versoes);
  };
  /** excluir o passo só da régua deste comercial (guarda a mensagem própria, se houver) / voltar a usar */
  const marcarExcluida = (pid: string, excluida: boolean) => {
    const com = reguaAberta; if (!com) return;
    const anterior = versoes[com]?.[pid] ?? null;
    const passo = padrao.find((p) => p.id === pid);
    const blocos = anterior?.blocos ?? [], quando = passo ? diaProprioValido(passo, anterior) : null;
    const doCom = { ...(versoes[com] ?? {}) };
    if (!excluida && passo && diaVaiColidir(padrao, (x) => versoes[com]?.[x] ?? null, passo, quando ?? passo.quando, true)) {
      aoAvisar('Outra mensagem dessa régua já sai no dia dela — mude o dia de uma delas antes de voltar a usar.'); return;
    }
    if (excluida) doCom[pid] = { blocos, excluida: true, quando };
    else if (blocos.length || quando != null) doCom[pid] = { blocos, excluida: false, quando };
    else delete doCom[pid];
    const prox: ReguaDemo = { padrao, grupos, porCli, versoes: { ...versoes, [com]: doCom } };
    setVersoes(prox.versoes);
    reguaSalvar(prox);
    const nm = padrao.find((p) => p.id === pid)?.nome ?? 'mensagem';
    registrarDesfazer({ rotulo: `${excluida ? 'exclusão' : 'volta'} de “${nm}” na régua de ${nomeDe(com)}`, inverso: async () => restaurarVersao(com, pid, anterior) });
    aoAvisar(excluida ? `“${nm}” excluída da régua de ${nomeDe(com)} — os clientes ${souComercial ? 'seus' : `de ${nomeDe(com)}`} não recebem mais essa mensagem.` : `“${nm}” volta a sair na régua de ${nomeDe(com)}.`);
  };
  const confirmarUsarPadrao = () => {
    if (!usarPadrao || !reguaAberta) return;
    if (diaVaiColidir(padrao, (x) => versoes[reguaAberta]?.[x] ?? null, usarPadrao, usarPadrao.quando)) {
      aoAvisar(`No dia da padrão (${quandoExtenso(usarPadrao.quando)}) já sai outra mensagem dessa régua — mude o dia dela antes.`); setUsarPadrao(null); return;
    }
    const com = reguaAberta, pid = usarPadrao.id, anterior = versoes[com]?.[pid] ?? null;
    const minhas = { ...(versoes[com] ?? {}) }; delete minhas[pid];
    const prox: ReguaDemo = { padrao, grupos, porCli, versoes: { ...versoes, [com]: minhas } };
    setVersoes(prox.versoes);
    reguaSalvar(prox);
    registrarDesfazer({ rotulo: `volta pra padrão na régua de ${nomeDe(com)}`, inverso: async () => restaurarVersao(com, pid, anterior) });
    aoAvisar(`${nomeDe(reguaAberta)} volta a usar a mensagem padrão em “${usarPadrao.nome}”.`);
    setUsarPadrao(null);
  };

  return (
    <>
      <div className="rg-vercomo">
        <label htmlFor="rg-vercomo">Demonstração · ver a tela como</label>
        <select id="rg-vercomo" className="inp" value={verComo} onChange={(e) => setVerComo(e.target.value)}>
          <option value="">Administrador (todas as réguas)</option>
          {opcoesDe.map((o) => <option key={o.chave} value={o.chave}>Comercial {o.nome} (só a régua dele)</option>)}
        </select>
      </div>
      {souComercial ? (
        <>
          {cabecalhoDe(verComo, true)}
          <div className="rt-sec-tit"><h3>Minhas mensagens</h3></div>
        </>
      ) : (
      <>
      <AbasRegua aba={abaRg} aoMudar={setAbaRg} nComerciais={linhasCom.length} />
      {abaRg === 'mensagens' && (
      <div className="cm-seg" role="tablist" aria-label="Tipo de mensagem">
        <button type="button" role="tab" aria-selected={subaba === 'padrao'} className={subaba === 'padrao' ? 'cm-seg-btn on' : 'cm-seg-btn'} onClick={() => setSubaba('padrao')}>Sequência padrão</button>
        <button type="button" role="tab" aria-selected={subaba === 'grupos'} className={subaba === 'grupos' ? 'cm-seg-btn on' : 'cm-seg-btn'} onClick={() => setSubaba('grupos')}>Grupos</button>
        <button type="button" role="tab" aria-selected={subaba === 'cliente'} className={subaba === 'cliente' ? 'cm-seg-btn on' : 'cm-seg-btn'} onClick={() => setSubaba('cliente')}>Cliente específico</button>
      </div>
      )}
      </>
      )}

      {(souComercial || (abaRg === 'mensagens' && subaba === 'padrao')) && (() => {
        const passos = [...padrao].sort((a, b) => a.quando - b.quando);
        // a faixa mostra os dias DESTE comercial quando a régua dele está aberta (excluídas saem)
        const faixa = reguaAberta ? passosDoComercial(passos, (pid) => versoes[reguaAberta]?.[pid] ?? null) : passos;
        return (
        <>
          {!souComercial && <SeletorReguaDe valor={reguaDe} opcoes={opcoesDe} aoMudar={setReguaDe} />}
          {!souComercial && reguaAberta && cabecalhoDe(reguaAberta, false)}
          <div className="rg-strip" role="list" aria-label="Cadência da régua">
            {faixa.map((m, i) => (
              <div className="rg-strip-node" role="listitem" key={m.id}>
                <span className="rg-strip-quando num">{quandoCurto(m.quando)}</span>
                <span className="rg-strip-nm">{m.nome}</span>
                {i < faixa.length - 1 && <span className="rg-strip-seta" aria-hidden>→</span>}
              </div>
            ))}
          </div>
          {reguaAberta ? (
            <CartoesReguaComercial passos={passos} nome={nomeDe(reguaAberta)} podeEditar={gestor || souComercial} minha={souComercial}
              versaoDe={(pid) => versoes[reguaAberta]?.[pid] ?? null}
              grupoNoDia={(m) => gruposNoDia(grupos, m, reguaAberta)}
              aoEditar={(m, blocos, novo, q) => setEd({ alvo: 'versao', novo, comercial: reguaAberta, passoId: m.id, q0: m.quando, msg: { id: m.id, nome: m.nome, quando: q, blocos } })}
              aoUsarPadrao={setUsarPadrao}
              aoExcluir={setExcluirDoCom}
              aoVoltar={(m) => marcarExcluida(m.id, false)} />
          ) : (<>
          <div className="rg-cards">
            {passos.map((m) => (
              <div className="rg-card" key={m.id}>
                <div className="rg-quando"><b className="num">{quandoCurto(m.quando)}</b><i>{quandoSub(m.quando)}</i></div>
                <div className="rg-corpo">
                  <div className="rg-topo"><span className="rg-nm">{m.nome}</span><span className="rg-pub">Todos os clientes</span></div>
                  {propriasDoPasso(m.id).length > 0 && <div className="rg-donos">Personalizada na régua de: {propriasDoPasso(m.id).join(', ')}</div>}
                  {excluidasDoPasso(m.id).length > 0 && <div className="rg-donos">Excluída na régua de: {excluidasDoPasso(m.id).join(', ')}</div>}
                  <div className="rg-tipos">{tiposUnicos(m.blocos).map((t) => <span className="rg-tipo" key={t}><IconeBloco tipo={t} /> {ROTULO_BLOCO[t]}</span>)}</div>
                  <div className="rg-prev">{previewMsg(m)}</div>
                </div>
                {gestor && (
                  <div className="rg-acoes">
                    <BotaoSec mini onClick={() => setEd({ alvo: 'padrao', novo: false, msg: JSON.parse(JSON.stringify(m)) })}>Editar</BotaoSec>
                    <button type="button" className="cm-num-lnk perigo" onClick={() => setExcluir({ alvo: 'padrao', id: m.id, nome: m.nome })}>Excluir</button>
                  </div>
                )}
              </div>
            ))}
            {passos.length === 0 && <div className="cm-exc-vazio">Nenhuma mensagem ativa na sequência.</div>}
          </div>
          {gestor && <div style={{ marginTop: 12 }}><BotaoSec mini onClick={() => setEd({ alvo: 'padrao', novo: true, msg: { id: rid('p'), nome: '', quando: -3, blocos: [{ tipo: 'texto', corpo: '' }] } })}>＋ Nova mensagem</BotaoSec></div>}
          </>)}
        </>
        );
      })()}

      {!souComercial && abaRg === 'mensagens' && subaba === 'grupos' && (
        <>
          <div className="cm-msg-lista">
            {grupos.map((g) => (
              <div className="cm-msg-lin" key={g.id}>
                <div className="cm-msg-info">
                  <div className="cm-msg-nm">{g.nome} <span className="cm-cli-badge">{contaMembros(g.criterio)} pessoas</span></div>
                  <div className="cm-msg-meta num">{rotuloCriterio(g.criterio)} · {resumoBlocos(g.msg.blocos)}</div>
                </div>
                {gestor && <div className="rg-acoes">
                  <BotaoSec mini onClick={() => setEd({ alvo: 'grupo', novo: false, nome: g.nome, criterio: g.criterio, msg: JSON.parse(JSON.stringify(g.msg)) })}>Editar</BotaoSec>
                  <button type="button" className="cm-num-lnk perigo" onClick={() => setExcluir({ alvo: 'grupo', id: g.id, nome: g.nome })}>Excluir</button>
                </div>}
              </div>
            ))}
            {grupos.length === 0 && <div className="cm-exc-vazio">Nenhum grupo ainda.</div>}
          </div>
          {gestor && <div style={{ marginTop: 12 }}><BotaoSec mini onClick={() => setEd({ alvo: 'grupo', novo: true, nome: '', criterio: 'todos', msg: { id: rid('g'), nome: '', quando: 0, blocos: [{ tipo: 'texto', corpo: '' }] } })}>＋ Novo grupo</BotaoSec></div>}
        </>
      )}

      {!souComercial && abaRg === 'mensagens' && subaba === 'cliente' && (
        <>
          <div className="cm-msg-lista">
            {porCli.map((c) => (
              <div className="cm-msg-lin" key={c.id}>
                <div className="cm-msg-info">
                  <div className="cm-msg-nm">{c.cliNome}</div>
                  <div className="cm-msg-meta num">{c.data ? `envia ${c.data}` : 'sem data'} · {resumoBlocos(c.msg.blocos)}</div>
                </div>
                {gestor && <div className="rg-acoes">
                  <BotaoSec mini onClick={() => setEd({ alvo: 'cliente', novo: false, cliId: c.cliId, data: c.data, msg: JSON.parse(JSON.stringify(c.msg)) })}>Editar</BotaoSec>
                  <button type="button" className="cm-num-lnk perigo" onClick={() => setExcluir({ alvo: 'cliente', id: c.id, nome: `${c.cliNome} · ${c.msg.nome}` })}>Excluir</button>
                </div>}
              </div>
            ))}
            {porCli.length === 0 && <div className="cm-exc-vazio">Nenhuma mensagem por cliente ainda.</div>}
          </div>
          {gestor && <div style={{ marginTop: 12 }}><BotaoSec mini onClick={() => setEd({ alvo: 'cliente', novo: true, cliId: clientesOrd[0]?.id ?? '', data: '', msg: { id: rid('c'), nome: '', quando: 0, blocos: [{ tipo: 'texto', corpo: '' }] } })}>＋ Mensagem pra um cliente</BotaoSec></div>}
        </>
      )}

      {!souComercial && abaRg === 'comerciais' && (
        <>
          <div className="rt-sec-tit"><h3>Régua de cada comercial</h3><span>Quem começa a que horas, quem está com a régua pausada e por qual WhatsApp sai.</span></div>
          <TabelaComerciaisRegua linhas={linhasCom} inicioGeral={cfgDemo.hora_envio} fim={cfgDemo.hora_fim}
            aoHorario={(l, h) => mudarHorario(l.chave, h)} aoPausar={(l, p) => pedirPausa(l.chave, l.nome, p)}
            aoAbrir={(l) => { setReguaDe(l.chave); setSubaba('padrao'); setAbaRg('mensagens'); }} />
        </>
      )}

      {!souComercial && abaRg === 'configuracao' && (
        <ConfigReguaLista v={cfgDemo} numeros={opcoesDe.map((o) => ({ id: o.chave, rotulo: `WhatsApp de ${o.nome}` }))} aoSalvar={salvarCfgDemo} />
      )}

      {confirmaPausa && (
        <ConfirmarPausaRegua nome={confirmaPausa.nome} minha={souComercial} aoConfirmar={confirmarPausa} aoFechar={() => setConfirmaPausa(null)} />
      )}

      {excluir && (
        <ModalV2 aberto aoFechar={() => setExcluir(null)} largura={420}
          titulo={<div>Excluir “{excluir.nome}”?<div className="mod-sub">A mensagem sai da régua de vez</div></div>}
          rodape={<><BotaoSec onClick={() => setExcluir(null)}>Cancelar</BotaoSec>
            <BotaoPrimario style={{ background: 'var(--rubro)' }} onClick={confirmarExcluir}>Excluir</BotaoPrimario></>}>
          <p className="cm-hint" style={{ margin: 0 }}>O que ela ainda tiver na fila de hoje é cancelado junto. O histórico do que já foi enviado continua em Envios.
            {excluir.alvo === 'padrao' && propriasDoPasso(excluir.id).length + excluidasDoPasso(excluir.id).length > 0 && <> <b>O que {[...propriasDoPasso(excluir.id), ...excluidasDoPasso(excluir.id)].join(', ')} {propriasDoPasso(excluir.id).length + excluidasDoPasso(excluir.id).length > 1 ? 'fizeram' : 'fez'} neste passo na régua própria também é apagado.</b></>}</p>
        </ModalV2>
      )}

      {excluirDoCom && (
        <ModalV2 aberto aoFechar={() => setExcluirDoCom(null)} largura={440}
          titulo={<div>Excluir “{excluirDoCom.nome}”?<div className="mod-sub">Só da régua de {nomeDe(reguaAberta)}</div></div>}
          rodape={<><BotaoSec onClick={() => setExcluirDoCom(null)}>Cancelar</BotaoSec>
            <BotaoPrimario style={{ background: 'var(--rubro)' }} onClick={() => { marcarExcluida(excluirDoCom.id, true); setExcluirDoCom(null); }}>Excluir</BotaoPrimario></>}>
          <p className="cm-hint" style={{ margin: 0 }}>{souComercial ? 'Seus clientes' : `Os clientes de ${nomeDe(reguaAberta)}`} deixam de receber esta mensagem. A sequência padrão e a régua dos outros comerciais não mudam. Dá pra voltar a usar quando quiser.</p>
        </ModalV2>
      )}

      {usarPadrao && (
        <ModalV2 aberto aoFechar={() => setUsarPadrao(null)} largura={440}
          titulo={<div>Usar a mensagem padrão?<div className="mod-sub">{nomeDe(reguaAberta)} · {usarPadrao.nome}</div></div>}
          rodape={<><BotaoSec onClick={() => setUsarPadrao(null)}>Cancelar</BotaoSec><BotaoPrimario onClick={confirmarUsarPadrao}>Usar a padrão</BotaoPrimario></>}>
          <p className="cm-hint" style={{ margin: 0 }}>A mensagem própria de {nomeDe(reguaAberta)} neste passo é apagada e os clientes dele voltam a receber a mensagem padrão. Dá pra desfazer pelo botão Desfazer.</p>
        </ModalV2>
      )}

      {ed && (
        <ModalV2 aberto aoFechar={() => setEd(null)} largura={620}
          titulo={ed.alvo === 'versao'
            ? <div>{nomeDe(ed.comercial)} · {ed.msg.nome}<div className="mod-sub">Régua de {nomeDe(ed.comercial)} — mensagem e dia só pros clientes dele (na padrão sai {quandoExtenso(ed.q0)})</div></div>
            : <div>{ed.novo ? 'Nova mensagem' : 'Editar mensagem'}<div className="mod-sub">{ed.alvo === 'padrao' ? 'Sequência padrão' : ed.alvo === 'grupo' ? 'Mensagem de grupo' : 'Mensagem por cliente'}</div></div>}
          rodape={<><BotaoSec onClick={() => setEd(null)}>Cancelar</BotaoSec><BotaoPrimario onClick={salvarEd}>Salvar mensagem</BotaoPrimario></>}>
          {ed.alvo === 'grupo' && (
            <div className="form-2col" style={{ marginBottom: 4 }}>
              <div className="campo"><label>Nome do grupo</label><Input value={ed.nome} onChange={(e) => setEd({ ...ed, nome: e.target.value })} placeholder="Ex.: Inadimplentes de agosto" /></div>
              <div className="campo"><label>Quem entra ({contaMembros(ed.criterio)} pessoas)</label>
                <select className="inp" value={ed.criterio} onChange={(e) => setEd({ ...ed, criterio: e.target.value })}>
                  <option value="todos">Todos os clientes</option>
                  {(['inadimplente', 'faltou', 'voltou', 'em_dia'] as Comportamento[]).map((c) => <option key={c} value={`comp:${c}`}>{ROTULO_COMP[c]}</option>)}
                  {ATENDENTES_DEMO.map((a) => <option key={a} value={`atend:${a}`}>Atendente {a}</option>)}
                </select>
              </div>
            </div>
          )}
          {ed.alvo === 'cliente' && (
            <div className="form-2col" style={{ marginBottom: 4 }}>
              <div className="campo"><label>Cliente</label>
                <select className="inp" value={ed.cliId} onChange={(e) => setEd({ ...ed, cliId: e.target.value })}>
                  {clientesOrd.slice(0, 200).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
              <div className="campo"><label>Data do envio</label><Input type="date" value={ed.data} onChange={(e) => setEd({ ...ed, data: e.target.value })} /></div>
            </div>
          )}
          {ed.alvo === 'versao' && <div className="form-grid" style={{ marginBottom: 6 }}><DiaDaVersao q0={ed.q0} valor={ed.msg.quando} aoMudar={(q) => setEd({ ...ed, msg: { ...ed.msg, quando: q } })} /></div>}
          <EditorMsg msg={ed.msg} setMsg={(m) => setEd({ ...ed, msg: m })} comQuando={ed.alvo === 'padrao'} semNome={ed.alvo === 'versao'} setAviso={aoAvisar} />
        </ModalV2>
      )}
    </>
  );
}

/* =================== NÚMEROS & ATENDENTES =================== */

type NumDemo = { atendente: string; numero: string | null; status: 'conectado' | 'sincronizando' | 'desconectado'; clientes: number };
const NUMEROS: NumDemo[] = metricasPorAtendente(CLIENTES).map((m, i) => {
  const tel = `+55 51 9${8000 + i * 137}-${(1000 + i * 411) % 10000}`.replace(/(\d{4})$/, (x) => x.padStart(4, '0'));
  const status: NumDemo['status'] = i >= 7 ? 'desconectado' : i === 5 ? 'sincronizando' : 'conectado';
  return { atendente: m.nome, numero: status === 'desconectado' ? null : tel, status, clientes: m.clientes };
});
export const TOM_CONEXAO: Record<NumDemo['status'], TomStatus> = { conectado: 'ok', sincronizando: 'atencao', desconectado: 'erro' };
export const ROTULO_CONEXAO: Record<NumDemo['status'], string> = { conectado: 'Conectado', sincronizando: 'Conectando…', desconectado: 'Desconectado' };

export function AbaNumeros({ demo, gestor, aoAvisar }: { demo: boolean; gestor: boolean; aoAvisar: (t: string) => void }) {
  return demo ? <AbaNumerosDemo gestor={gestor} aoAvisar={aoAvisar} /> : <AbaNumerosReal gestor={gestor} aoAvisar={aoAvisar} />;
}

/* ---- REAL: um número por atendente, instância isolada via cobranca-wa ---- */
const ROTULO_ESTADO: Record<string, { rotulo: string; tom: TomStatus }> = {
  conectado: { rotulo: 'Conectado', tom: 'ok' },
  aguardando_qr: { rotulo: 'Aguardando QR', tom: 'atencao' },
  desconectado: { rotulo: 'Sem número', tom: 'neutro' },
};

function AbaNumerosReal({ gestor, aoAvisar }: { gestor: boolean; aoAvisar: (t: string) => void }) {
  const { currentOrg } = useOrg();
  const orgId = currentOrg?.id;
  const { data: usuarios = [] } = useOrgUsuarios();
  const { data: numeros = [], refetch } = useCobNumeros(orgId);
  const porAtendente = useMemo(() => new Map(numeros.map((n) => [n.atendente_id, n])), [numeros]);
  const [qr, setQr] = useState<{ nome: string; numeroId: string; img: string | null } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [desligar, setDesligar] = useState<{ numero: CobNumero; nome: string } | null>(null);
  const qrRef = useRef(qr);
  qrRef.current = qr;

  // enquanto o modal do QR está aberto: sonda a conexão a cada 3s e
  // RENOVA o QR a cada ~45s (o código do WhatsApp expira — revisão 29/08)
  useEffect(() => {
    if (!qr || !orgId) return;
    let tick = 0;
    const t = window.setInterval(async () => {
      tick += 1;
      try {
        const st = await cobWaStatus(orgId, qr.numeroId);
        if (st.connected && qrRef.current) {
          setQr(null);
          aoAvisar(`WhatsApp conectado${st.telefone ? ` (${st.telefone})` : ''}. Este número atende SÓ a cobrança — não aparece no atendimento.`);
          refetch();
          return;
        }
        if (tick % 15 === 0 && qrRef.current) {
          const novo = await cobWaQr(orgId, qr.numeroId);
          if (novo.qr_base64 && qrRef.current) setQr((v) => v && { ...v, img: novo.qr_base64 });
        }
      } catch { /* rede: tenta no próximo tick */ }
    }, 3000);
    return () => window.clearInterval(t);
  }, [qr, orgId, aoAvisar, refetch]);

  async function conectar(uId: string, nome: string) {
    if (!orgId || busy) return;
    setBusy(uId);
    try {
      const r = await cobWaConectar(orgId, uId);
      setQr({ nome, numeroId: r.numero_id, img: r.qr_base64 });
      refetch();
    } catch (e) { aoAvisar(`Falha ao conectar: ${(e as Error).message}`); }
    finally { setBusy(null); }
  }

  async function confirmarDesconexao() {
    if (!orgId || !desligar) return;
    const alvo = desligar; setDesligar(null);
    try { await cobWaDesconectar(orgId, alvo.numero.id); aoAvisar('Número desconectado.'); refetch(); }
    catch (e) { aoAvisar(`Falha ao desconectar: ${(e as Error).message}`); }
  }

  return (
    <>
      <p className="cm-hint sobe">
        Cada atendente conecta o próprio número — a cobrança do cliente sai pelo número do atendente responsável.
        Estes WhatsApps são <b>exclusivos da cobrança</b>: não aparecem no atendimento nem recebem conversas no inbox.
      </p>
      {usuarios.length === 0
        ? <CardVidro spot sobe style={{ borderRadius: 'var(--r-card)' }}><EstadoVazio titulo="Nenhum atendente na equipe" descricao="Convide a equipe em Configurações para conectar números de cobrança." /></CardVidro>
        : (
          <div className="cm-nums sobe" style={{ animationDelay: '.08s' }}>
            {usuarios.map((u) => {
              const n = porAtendente.get(u.id);
              const est = ROTULO_ESTADO[n?.estado ?? 'desconectado'];
              return (
                <CardVidro spot key={u.id} className="cm-num">
                  <div className="cm-num-topo">
                    <span className="cm-num-av" aria-hidden>{(u.nome || '?').slice(0, 2).toUpperCase()}</span>
                    <div className="cm-num-id">
                      <div className="cm-num-nm">{u.nome}</div>
                      <div className="cm-num-tel num">{n?.telefone ?? 'Nenhum número conectado'}</div>
                    </div>
                    <BadgeStatus tom={est.tom}>{est.rotulo}</BadgeStatus>
                  </div>
                  {gestor && (
                    <div className="cm-num-acoes">
                      {n?.estado === 'conectado'
                        ? <BotaoSec mini onClick={() => setDesligar({ numero: n, nome: u.nome })}>Desconectar</BotaoSec>
                        : <BotaoPrimario mini onClick={() => conectar(u.id, u.nome)} disabled={busy === u.id}>{busy === u.id ? 'Gerando QR…' : n?.estado === 'aguardando_qr' ? 'Gerar novo QR' : 'Conectar WhatsApp'}</BotaoPrimario>}
                    </div>
                  )}
                </CardVidro>
              );
            })}
          </div>
        )}

      {qr && (
        <ModalV2 aberto aoFechar={() => setQr(null)} largura={380}
          titulo={<div>Conectar WhatsApp<div className="mod-sub">{qr.nome} — abra o WhatsApp no celular e leia o código.</div></div>}
          rodape={<BotaoSec onClick={() => setQr(null)}>Fechar</BotaoSec>}>
          <div className="cm-qr-wrap">
            {qr.img
              ? <img className="cm-qr-img" src={qr.img} alt="QR Code de conexão" />
              : <div className="cm-hint">QR indisponível — feche e tente de novo.</div>}
            <p className="cm-hint">Aguardando a leitura… esta janela fecha sozinha quando conectar. O número fica <b>exclusivo da cobrança</b>.</p>
          </div>
        </ModalV2>
      )}

      {desligar && (
        <ModalV2 aberto aoFechar={() => setDesligar(null)} largura={400}
          titulo={<div>Desconectar número<div className="mod-sub">{desligar.nome}{desligar.numero.telefone ? ` · ${desligar.numero.telefone}` : ''}</div></div>}
          rodape={<><BotaoSec onClick={() => setDesligar(null)}>Cancelar</BotaoSec><BotaoPrimario onClick={confirmarDesconexao}>Desconectar</BotaoPrimario></>}>
          <p className="cm-hint">A sessão no celular é encerrada e a cobrança para de sair por este número até reconectar.</p>
        </ModalV2>
      )}
    </>
  );
}

function AbaNumerosDemo({ gestor, aoAvisar }: { gestor: boolean; aoAvisar: (t: string) => void }) {
  const [qr, setQr] = useState<string | null>(null);
  const [novoNome, setNovoNome] = useState('');
  // demo = o contrato: MESMA tela da Reviza (NumerosVista); números fictícios, carteira do store
  const dadosQ = useDadosCobranca();
  const comerciais = useMemo<ComercialCobertura[]>(() => {
    const m = new Map<string, ComercialCobertura>();
    for (const l of dadosQ.data?.linhas ?? []) {
      if (l.situacao !== 'cancelado') continue;
      const nome = (l.comercial || '').trim(); if (!nome) continue;
      const x = m.get(nome.toUpperCase()) ?? { nome, emCobranca: 0, comTelefone: 0, usuarioId: nome };
      x.emCobranca += 1; if ((l.telefone || '').replace(/\D/g, '').length >= 10) x.comTelefone += 1; m.set(nome.toUpperCase(), x);
    }
    return [...m.values()];
  }, [dadosQ.data]);
  const [agora] = useState(() => Date.now());
  const numeros = useMemo<NumeroItem[]>(() => NUMEROS.map((n, i) => ({
    id: n.atendente, nome: n.atendente, numero: n.numero, status: n.status, dono: n.atendente,
    verificadoEm: n.status === 'conectado' ? new Date(agora - (i + 1) * 23 * 60_000).toISOString() : null,
    ultimoEventoEm: n.status === 'conectado' ? new Date(agora - (i + 2) * 41 * 60_000).toISOString() : null,
  })), [agora]);
  return (
    <>
      <NumerosVista numeros={numeros} comerciais={comerciais} gestor={gestor}
        aoConectar={(uid) => { setNovoNome(uid ?? ''); setQr(''); }}
        aoGerenciar={() => aoAvisar('Simulação: reconectar / trocar número do atendente.')}
        aoReconectar={(id) => setQr(id)} />
      {qr !== null && (
        <ModalV2 aberto aoFechar={() => setQr(null)} largura={400}
          titulo={<div>{qr ? 'Conectar número' : 'Conectar WhatsApp'}<div className="mod-sub">{qr || 'Um número por atendente — pode conectar quantos precisar'}</div></div>}
          rodape={qr
            ? <BotaoSec onClick={() => setQr(null)}>Fechar</BotaoSec>
            : <><BotaoSec onClick={() => setQr(null)}>Cancelar</BotaoSec><BotaoPrimario onClick={() => { if (!novoNome.trim()) { aoAvisar('Informe o nome do atendente.'); return; } setQr(novoNome.trim()); }}>Gerar QR code</BotaoPrimario></>}>
          {qr ? (
            <div className="cm-qr">
              <div className="cm-qr-quad" aria-hidden><span>QR</span></div>
              <p>Abra o WhatsApp do atendente → <b>Aparelhos conectados</b> → <b>Conectar aparelho</b> e aponte a câmera. (Demonstração — o QR real aparece com o backend do Evolution.)</p>
            </div>
          ) : (
            <div className="form-grid">
              <div className="campo"><label>Atendente (usuário do sistema)</label>
                <select className="inp" value={novoNome} autoFocus onChange={(e) => setNovoNome(e.target.value)}>
                  <option value="">Escolha o atendente</option>
                  {NUMEROS.map((n) => <option key={n.atendente} value={n.atendente}>{n.atendente}</option>)}
                </select>
              </div>
              <p className="cm-hint" style={{ margin: 0 }}>As conversas deste número vão aparecer <b>só para esse atendente e para os administradores</b>.</p>
            </div>
          )}
        </ModalV2>
      )}
    </>
  );
}

/* =================== ENVIOS (fila, dry-run) =================== */

type FilaDemo = { id: string; cliente: string; tipo: MsgDemo['tipo']; quando: string; canal: string; status: string; respondeu?: boolean };
/* roteiro determinístico da fila demo: o cliente/comercial vem do seed Alfa (demoStore),
   aqui só o "como saiu" de cada posição — sem nomes inventados fora do seed */
const ROTEIRO_FILA: Omit<FilaDemo, 'id' | 'cliente' | 'canal'>[] = [
  { tipo: 'cobranca', quando: 'Hoje 09:02', status: 'enviada', respondeu: true },
  { tipo: 'antes', quando: 'Hoje 09:07', status: 'enviada' },
  { tipo: 'cobranca', quando: 'Hoje 09:11', status: 'enviada', respondeu: true },
  { tipo: 'depois', quando: 'Hoje 09:34', status: 'enviada' },
  { tipo: 'cobranca', quando: 'Hoje 10:15', status: 'falhou' },
  { tipo: 'antes', quando: 'Hoje 11:40', status: 'pendente' },
  { tipo: 'cobranca', quando: 'Hoje 11:52', status: 'pendente' },
  { tipo: 'remarketing', quando: 'Hoje 12:05', status: 'bloqueada_optout' },
];
export const TOM_FILA: Record<string, TomStatus> = { pendente: 'neutro', processando: 'atencao', enviando: 'atencao', simulada: 'atencao', enviada: 'ok', falhou: 'erro', bloqueada_optout: 'erro', bloqueada_janela: 'erro', cancelada: 'neutro' };
export const ROTULO_FILA: Record<string, string> = { pendente: 'Na fila', processando: 'Processando', enviando: 'Enviando…', simulada: 'Simulada', enviada: 'Enviada', falhou: 'Falhou', bloqueada_optout: 'Optou por sair', bloqueada_janela: 'Fora da janela 24h', cancelada: 'Cancelada' };

export function AbaEnvios({ demo, gestor, aoAvisar }: { demo: boolean; gestor: boolean; aoAvisar: (t: string) => void }) {
  return demo ? <AbaEnviosDemo gestor={gestor} aoAvisar={aoAvisar} /> : <AbaEnviosReal gestor={gestor} aoAvisar={aoAvisar} />;
}


function AbaEnviosReal({ gestor, aoAvisar }: { gestor: boolean; aoAvisar: (t: string) => void }) {
  const { currentOrg } = useOrg();
  const orgId = currentOrg?.id;
  const { data: fila = [], isLoading, refetch } = useCobFila(orgId);
  const { data: cfg } = useCobConfig(orgId);
  const salvarCfg = useSalvarCobConfig(orgId);
  const envioReal = cfg?.envioReal === true;
  const [confirmaLigar, setConfirmaLigar] = useState(false);
  const [rodando, setRodando] = useState(false);
  const cont = (st: string) => fila.filter((f) => f.status === st).length;

  async function ligarEnvioReal() {
    setConfirmaLigar(false);
    try { await salvarCfg.mutateAsync(true); aoAvisar('ENVIO REAL LIGADO — os próximos enfileiramentos disparam mensagens de verdade.'); }
    catch (e) { aoAvisar(`Falha ao ligar: ${(e as Error).message}`); }
  }
  async function desligarEnvioReal() {
    try { await salvarCfg.mutateAsync(false); aoAvisar('Envio real desligado — tudo volta a ser simulação.'); }
    catch (e) { aoAvisar(`Falha ao desligar: ${(e as Error).message}`); }
  }
  async function aplicarHoje() {
    if (!orgId) return;
    try { const n = await converterPendentesHoje(orgId); aoAvisar(n > 0 ? `${n} disparo(s) pendente(s) de hoje convertidos para envio REAL.` : 'Nenhum pendente de hoje para converter.'); refetch(); }
    catch (e) { aoAvisar(`Falha: ${(e as Error).message}`); }
  }

  async function simular() {
    if (!orgId || rodando) return;
    setRodando(true);
    try {
      const r = await rodarSimulacao(orgId);
      const enf = (r.enfileirar ?? {}) as Record<string, number>;
      const proc = (r.processar ?? {}) as Record<string, number>;
      aoAvisar(`Simulação: ${enf.criadas ?? 0} enfileirada(s), ${proc.simuladas ?? 0} simulada(s)` +
        ((enf.sem_telefone ?? 0) > 0 ? `, ${enf.sem_telefone} sem número de cliente` : '') +
        ((proc.fora_da_janela ?? 0) > 0 ? ' (fora da janela 8h–20h: processa no horário)' : '') + '.');
      refetch();
    } catch (e) { aoAvisar(`Falha na simulação: ${(e as Error).message}`); }
    finally { setRodando(false); }
  }

  return (
    <>
      <div className={envioReal ? 'cm-simbanner real sobe' : 'cm-simbanner sobe'} role="status">
        <div>
          <b>{envioReal ? 'ENVIO REAL LIGADO — as mensagens saem de verdade.' : 'Modo simulação — nada é enviado.'}</b>
          <span> O motor roda todo dia de manhã e monta a fila pela cadência configurada na régua.{envioReal ? ' Os enfileiramentos novos disparam pelos números conectados dos atendentes.' : ' O envio real liga na chave ao lado — só com sua decisão.'}</span>
        </div>
        <div className="cm-simbanner-acoes">
          {gestor && <BotaoSec mini onClick={simular} disabled={rodando}>{rodando ? 'Rodando…' : envioReal ? 'Rodar agora' : 'Rodar simulação agora'}</BotaoSec>}
          {gestor && envioReal && <BotaoSec mini onClick={aplicarHoje}>Aplicar aos pendentes de hoje</BotaoSec>}
          {gestor && (envioReal
            ? <BotaoSec mini onClick={desligarEnvioReal}>Desligar envio real</BotaoSec>
            : <BotaoPrimario mini onClick={() => setConfirmaLigar(true)}>Ligar envio real</BotaoPrimario>)}
        </div>
      </div>
      {confirmaLigar && (
        <ModalV2 aberto aoFechar={() => setConfirmaLigar(false)} largura={460}
          titulo={<div>Ligar o envio real?<div className="mod-sub">Esta é a chave final do Modo Cobrança.</div></div>}
          rodape={<><BotaoSec onClick={() => setConfirmaLigar(false)}>Cancelar</BotaoSec><BotaoPrimario onClick={ligarEnvioReal}>Sim, ligar envio real</BotaoPrimario></>}>
          <p className="cm-hint" style={{ fontSize: 13 }}>
            A partir do próximo enfileiramento, as mensagens da régua serão <b>enviadas de verdade</b> aos
            clientes com parcela em aberto, pelo número do atendente responsável — com ritmo controlado
            (pausas entre mensagens, no máximo ~150 envios/hora, janela 8h–20h). Quem pagou não recebe;
            quem pediu SAIR não recebe; cliente sem número não recebe. Dá para desligar a qualquer momento.
          </p>
        </ModalV2>
      )}
      <div className="kpis sobe" style={{ animationDelay: '.05s' }}>
        <Kpi rotulo="Na fila (pendentes)" valor={cont('pendente')} />
        <Kpi rotulo={envioReal ? 'Enviadas' : 'Simuladas'} valor={envioReal ? cont('enviada') : cont('simulada')} tomValor="ok" />
        <Kpi rotulo="Bloqueadas (opt-out)" valor={cont('bloqueada_optout')} tomValor="erro" />
        <Kpi rotulo="Sem número do atendente" valor={fila.filter((f) => f.ultimo_erro === 'sem_numero_atendente').length} />
      </div>
      {isLoading ? <div className="cm-hint">Carregando…</div> : fila.length === 0 ? (
        <CardVidro spot sobe style={{ borderRadius: 'var(--r-card)' }}>
          <EstadoVazio titulo="Fila vazia" descricao="Quando houver clientes em ciclos com mensagens ativas, os disparos do dia aparecem aqui (sempre nascendo em simulação)." />
        </CardVidro>
      ) : (
        <CardVidro spot sobe className="mo-fixo" style={{ borderRadius: 'var(--r-card)', animationDelay: '.1s' }}>
          <TabelaPadrao
            colunas={[
              { chave: 'cli', titulo: 'Cliente', render: (x: CobFilaItem) => x.cliente },
              { chave: 'tipo', titulo: 'Mensagem', render: (x: CobFilaItem) => x.mensagem ?? x.tipo ?? '—' },
              { chave: 'quando', titulo: 'Quando', classe: 'num', render: (x: CobFilaItem) => new Date(x.executar_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) },
              { chave: 'st', titulo: 'Status', render: (x: CobFilaItem) => <BadgeStatus tom={TOM_FILA[x.status] ?? 'neutro'}>{ROTULO_FILA[x.status] ?? x.status}</BadgeStatus> },
              { chave: 'obs', titulo: 'Observação', render: (x: CobFilaItem) => x.ultimo_erro === 'sem_numero_atendente' ? <span style={{ color: 'var(--ambar)', fontSize: 11.5 }}>⚠ atendente sem número</span> : (x.ultimo_erro ?? '') },
            ] as Coluna<CobFilaItem>[]}
            linhas={fila} chave={(x) => x.id}
            rodape={{ texto: `${fila.length} disparo${fila.length === 1 ? '' : 's'} (últimos 200)` }}
          />
        </CardVidro>
      )}
    </>
  );
}

function AbaEnviosDemo({ gestor, aoAvisar }: { gestor: boolean; aoAvisar: (t: string) => void }) {
  const [filtro, setFiltro] = useState<'todos' | 'pendente' | 'enviada' | 'erro'>('todos');
  // fila derivada do seed Alfa real: clientes em cobrança com número cadastrado,
  // cada disparo saindo pelo comercial responsável daquele cliente
  const linhas = useDadosCobranca().data?.linhas;
  const fila = useMemo<FilaDemo[]>(() =>
    (linhas ?? [])
      .filter((l) => l.situacao === 'cancelado' && (l.telefone || '').replace(/\D/g, '').length >= 10)
      .slice(0, ROTEIRO_FILA.length)
      .map((l, i) => ({ id: `fd-${l.id}`, cliente: l.nome, canal: l.comercial || '—', ...ROTEIRO_FILA[i] })),
  [linhas]);
  const lista = useMemo(() => fila.filter((f) => {
    if (filtro === 'todos') return true;
    if (filtro === 'erro') return f.status === 'falhou' || f.status.startsWith('bloqueada');
    return f.status === filtro;
  }), [fila, filtro]);
  const enviadas = fila.filter((f) => f.status === 'enviada');
  const erros = fila.filter((f) => f.status === 'falhou' || f.status.startsWith('bloqueada')).length;

  const colunas: Coluna<FilaDemo>[] = [
    { chave: 'cliente', titulo: 'Cliente', render: (f) => f.cliente },
    { chave: 'tipo', titulo: 'Mensagem', render: (f) => <BadgeStatus tom={f.tipo === 'cobranca' ? 'ok' : f.tipo === 'antes' ? 'neutro' : 'atencao'}>{ROTULO_TIPO[f.tipo]}</BadgeStatus> },
    { chave: 'quando', titulo: 'Quando', classe: 'num', render: (f) => f.quando },
    { chave: 'canal', titulo: 'Sai por', render: (f) => f.canal },
    { chave: 'status', titulo: 'Status', render: (f) => <BadgeStatus tom={TOM_FILA[f.status] ?? 'neutro'}>{ROTULO_FILA[f.status] ?? f.status}</BadgeStatus> },
  ];

  return (
    <>
      <div className="cm-simbanner sobe" role="status">
        <div>
          <b>Demonstração — nada é enviado.</b>
          <span> A fila mostra como a régua trabalha: cada mensagem sai pelo número do comercial responsável pelo cliente.</span>
        </div>
        {gestor && <div className="cm-simbanner-acoes"><BotaoSec mini onClick={() => aoAvisar('Demonstração: a fila seria processada agora — nenhuma mensagem sai.')}>Processar fila agora</BotaoSec></div>}
      </div>
      <div className="kpis sobe" style={{ animationDelay: '.06s' }}>
        <Kpi rotulo="Enviadas hoje" valor={enviadas.length} tomValor="ok" />
        <Kpi rotulo="Responderam hoje" valor={enviadas.filter((f) => f.respondeu).length} />
        <Kpi rotulo="Na fila agora" valor={fila.filter((f) => f.status === 'pendente').length} />
        <Kpi rotulo="Com erro hoje" valor={erros} tomValor={erros > 0 ? 'erro' : undefined} />
      </div>
      <div className="cob-filtros sobe" style={{ animationDelay: '.12s' }}>
        <Chips>
          <Chip ativo={filtro === 'todos'} onClick={() => setFiltro('todos')}>Todos</Chip>
          <Chip ativo={filtro === 'pendente'} onClick={() => setFiltro('pendente')}>Na fila</Chip>
          <Chip ativo={filtro === 'enviada'} onClick={() => setFiltro('enviada')}>Enviadas</Chip>
          <Chip ativo={filtro === 'erro'} onClick={() => setFiltro('erro')}>Com erro</Chip>
        </Chips>
      </div>
      <CardVidro spot sobe className="mo-fixo" style={{ borderRadius: 'var(--r-card)', animationDelay: '.18s' }}>
        {lista.length === 0
          ? (fila.length === 0
            ? <EstadoVazio titulo="Nenhum envio ainda" descricao="Crie um envio ou aguarde a régua." />
            : <EstadoVazio titulo="Nada neste filtro" descricao="Escolha outro filtro para ver os disparos da fila." />)
          : <TabelaPadrao colunas={colunas} linhas={lista} chave={(f) => f.id} rodape={{ texto: `${lista.length} disparo${lista.length === 1 ? '' : 's'}` }} />}
      </CardVidro>
    </>
  );
}

/* =================== PAINEL EXECUTIVO (bloco de métricas) =================== */
/* O painel vivo é <PainelReviza/> / <PainelGeralReviza/> (RevizaPainel.tsx), que
   monta <PainelResumoVista/> (./painel/PainelResumo.tsx) com a via REAL. Não há wrapper
   local — removido o antigo PainelResumo() que usava a via sintética resumoCarteira
   e virou código morto quando o demo passou a usar PainelGeralReviza (17/09). */

/* PainelResumoVista mudou para ./painel/PainelResumo.tsx (redesenho 27/09). */

/* =================== ATENDENTES (métricas + drill-down) =================== */

export function AbaAtendentes({ demo }: { demo: boolean }) {
  return demo ? <AbaAtendentesDemo /> : <AbaAtendentesReal />;
}

function AbaAtendentesReal() {
  const { currentOrg } = useOrg();
  const { data: clientes = [], isLoading } = useClientesCobranca(currentOrg?.id);
  const linhas = useMemo(() => {
    const m = new Map<string, { atendente: string; clientes: number; soma: number; semNumero: number }>();
    for (const c of clientes) {
      const k = c.atendente ?? 'Sem atendente';
      const cur = m.get(k) ?? { atendente: k, clientes: 0, soma: 0, semNumero: 0 };
      cur.clientes += 1; cur.soma += c.valorMensal; if (!c.telefone) cur.semNumero += 1;
      m.set(k, cur);
    }
    return [...m.values()].sort((a, b) => b.soma - a.soma);
  }, [clientes]);
  if (isLoading) return <div className="cm-hint">Carregando…</div>;
  if (linhas.length === 0) {
    return <CardVidro spot sobe style={{ borderRadius: 'var(--r-card)' }}><EstadoVazio titulo="Sem clientes na cobrança" descricao="Cadastre clientes para acompanhar a carteira de cada atendente." /></CardVidro>;
  }
  return (
    <CardVidro spot sobe className="mo-fixo" style={{ borderRadius: 'var(--r-card)' }}>
      <TabelaPadrao
        colunas={[
          { chave: 'at', titulo: 'Atendente', render: (x) => x.atendente },
          { chave: 'cl', titulo: 'Clientes', dir: true, classe: 'num', render: (x) => String(x.clientes) },
          { chave: 'soma', titulo: 'Recorrência/mês', dir: true, classe: 'num', render: (x) => fmtBRL(x.soma) },
          { chave: 'sn', titulo: 'Sem número', dir: true, classe: 'num', render: (x) => x.semNumero > 0 ? <span style={{ color: 'var(--ambar)' }}>⚠ {x.semNumero}</span> : '0' },
        ] as Coluna<{ atendente: string; clientes: number; soma: number; semNumero: number }>[]}
        linhas={linhas} chave={(x) => x.atendente}
      />
    </CardVidro>
  );
}

/** Linha da tabela de atendentes — demo e real produzem esta mesma forma. */
export interface LinhaAtendente extends MetricaAtendente {
  cs: ClienteAnalise[]; semWa: number; ticket: number;
  brk: { emDia: number; voltou: number; faltou: number; inad: number };
}

function AbaAtendentesDemo() {
  // fonte ÚNICA = blob da Gestão (rastreio 17/09): mover ciclo/marcar pagamento
  // na Gestão demo agora reflete aqui, igual ao comportamento da instância real.
  const dadosQ = useDadosCobranca();
  const clientes = useMemo(() => (dadosQ.data ? clientesReais(dadosQ.data) : []), [dadosQ.data]);
  const dados = useMemo<LinhaAtendente[]>(() => metricasPorAtendente(clientes).map((m) => {
    // casa por nome NORMALIZADO (o agrupador junta 'EMILLYN'/'emillyn') e o
    // quebra-por-comportamento usa a MESMA população do 'Em atraso' (carteira)
    const cs = clientes.filter((c) => c.atendente.trim().toUpperCase() === m.nome.trim().toUpperCase());
    const av = cs.filter((c) => c.ativo !== false);
    return { ...m, cs,
      semWa: av.filter((c) => !c.whatsapp).length,
      ticket: av.length ? Math.round(m.recorrencia / av.length) : 0,
      brk: { emDia: av.filter((c) => c.comportamento === 'em_dia').length, voltou: av.filter((c) => c.comportamento === 'voltou').length, faltou: av.filter((c) => c.comportamento === 'faltou').length, inad: av.filter((c) => c.comportamento === 'inadimplente').length },
    };
  }), [clientes]);
  const pcts = useComissoes().data;
  const histPct = useComissoesHist().data;
  const salvarPct = useSalvarComissao();
  const [avisoCom, setAvisoCom] = useState('');
  const compsDemo = useMemo(() => dadosQ.data?.comps ?? [], [dadosQ.data]);
  const comissoes = useMemo(() => comissoesDe(clientes, compsDemo, pcts ?? {}, dadosQ.data?.ciclosDatas, histPct, dadosQ.data?.pendentes), [clientes, compsDemo, pcts, dadosQ.data?.ciclosDatas, dadosQ.data?.pendentes, histPct]);
  return (
    <>
      {avisoCom && <div className="gs-aviso" role="status" style={{ marginBottom: 12 }}><span>{avisoCom}</span><button type="button" className="gs-aviso-x" onClick={() => setAvisoCom('')} aria-label="Fechar">×</button></div>}
      <EquipeVista linhas={dados} comissoes={comissoes} podeEditarPct salvando={salvarPct.isPending} aoAvisar={setAvisoCom}
        aoSalvarPct={(comercial, pct, desde) => salvarPct.mutate({ comercial, pct, desde }, {
          onSuccess: (r) => setAvisoCom(`Comissão de ${comercial}: ${pct}% da mensalidade ${desde === '2000-01' ? 'em todos os meses' : `a partir de ${rotuloMesCurto(desde)}`}${r.n ? ` — ${r.n} pagamento${r.n === 1 ? '' : 's'} refeito${r.n === 1 ? '' : 's'} na planilha` : ''}.`),
          onError: (e) => setAvisoCom(`Não deu pra salvar a comissão: ${(e as Error).message}`),
        })} />
    </>
  );
}

/* AtendentesVista mudou para ./painel/EquipeVista.tsx (redesenho 27/09). */

/* =================== CLIENTES (análise + ficha + nº WhatsApp) =================== */

export function AbaClientes({ demo, gestor, aoNovo }: { demo: boolean; gestor: boolean; aoNovo: () => void }) {
  return demo ? <AbaClientesDemo gestor={gestor} /> : <AbaClientesReal gestor={gestor} aoNovo={aoNovo} />;
}

function AbaClientesReal({ gestor, aoNovo }: { gestor: boolean; aoNovo: () => void }) {
  const { currentOrg } = useOrg();
  const { data: clientes = [], isLoading } = useClientesCobranca(currentOrg?.id);
  const semNumero = clientes.filter((c) => !c.telefone).length;
  if (isLoading) return <div className="cm-hint">Carregando…</div>;
  if (clientes.length === 0) {
    return (
      <CardVidro spot sobe style={{ borderRadius: 'var(--r-card)' }}>
        <EstadoVazio titulo="Nenhum cliente cadastrado" descricao="A base de cobrança está vazia. Cadastre o primeiro cliente com o número de WhatsApp e o ciclo dele."
          acao={gestor ? { rotulo: '＋ Cadastrar cliente', onClick: aoNovo } : undefined} />
      </CardVidro>
    );
  }
  return (
    <>
      {semNumero > 0 && (
        <div className="cm-avisonum sobe" role="status">
          <span className="cm-avisonum-ic" aria-hidden><IcAtencao /></span>
          <span><b>{semNumero} cliente{semNumero === 1 ? '' : 's'} sem número de WhatsApp.</b> Sem o número, a cobrança automática não chega a este cliente.</span>
        </div>
      )}
      <CardVidro spot sobe className="mo-fixo" style={{ borderRadius: 'var(--r-card)', animationDelay: '.06s' }}>
        <TabelaPadrao
          colunas={[
            { chave: 'nome', titulo: 'Cliente', render: (x: ClienteCobranca) => <div className="cm-cli-nm">{!x.telefone && <span className="cm-cli-alerta" title="Sem número de WhatsApp"><IcAtencao /></span>}{x.nome}</div> },
            { chave: 'tel', titulo: 'WhatsApp', render: (x: ClienteCobranca) => x.telefone ? <span className="num" style={{ color: 'var(--txt-2)' }}>{x.telefone}</span> : <span style={{ color: 'var(--ambar)', fontWeight: 600, fontSize: 11.5 }}>Cadastrar número</span> },
            { chave: 'ciclo', titulo: 'Ciclo', classe: 'num', render: (x: ClienteCobranca) => x.ciclo ?? '—' },
            { chave: 'at', titulo: 'Atendente', render: (x: ClienteCobranca) => x.atendente ?? '—' },
            { chave: 'v', titulo: 'Mensalidade', dir: true, classe: 'num', render: (x: ClienteCobranca) => fmtBRL(x.valorMensal) },
            { chave: 'st', titulo: 'Status', render: (x: ClienteCobranca) => <BadgeStatus tom={TOM_STATUS_COB[x.status] ?? 'neutro'}>{x.status === 'ativo' ? 'Ativo' : x.status === 'finalizado' ? 'Finalizado' : x.status}</BadgeStatus> },
          ] as Coluna<ClienteCobranca>[]}
          linhas={clientes} chave={(x) => x.id}
          rodape={{ texto: `${clientes.length} cliente${clientes.length === 1 ? '' : 's'}` }}
        />
      </CardVidro>
    </>
  );
}

/* Situação do débito no benefício (cliente novo ainda descontando a parcela,
   até "parar o débito" — coluna DATA QUE PAROU O DÉBITO da planilha).
   Ilustrativo e determinístico, em paridade com o cadastro da Planilha. */
const hojeISOc = () => new Date().toISOString().slice(0, 10);
function debitoInfo(cl: ClienteAnalise): { parcela: number; fechamento: string; parouOrig: string | null } {
  const cad = plCadastro(cl);
  const h = plHash(cl.id + 'novo');
  const parcela = 150 + (h % 36) * 10;
  const parouOrig = (h % 10) < 3 ? `2026-${String(1 + (h % 8)).padStart(2, '0')}-${String(1 + (h % 27)).padStart(2, '0')}` : null;
  return { parcela, fechamento: cad.fechamento, parouOrig };
}

function AbaClientesDemo({ gestor }: { gestor: boolean }) {
  const [seg, setSeg] = useState<'todos' | Comportamento | 'resp_remk' | 'sem_num'>('todos');
  const [deb, setDeb] = useState<'todos' | 'descontando' | 'parou'>('todos');
  const [paradas, setParadas] = useState<Record<string, string | null>>({});
  const [sel, setSel] = useState<ClienteAnalise | null>(null);
  const [cadastrar, setCadastrar] = useState<ClienteAnalise | null>(null);
  const [pag, setPag] = useState(1);
  const parouDe = (c: ClienteAnalise) => (c.id in paradas ? paradas[c.id] : debitoInfo(c).parouOrig);
  const semNumero = useMemo(() => CLIENTES.filter((c) => !c.whatsapp).length, []);
  const lista = useMemo(() => CLIENTES.filter((c) => {
    const compOk = seg === 'todos' ? true
      : seg === 'sem_num' ? !c.whatsapp
      : seg === 'resp_remk' ? c.engajamento.some((e) => e.tipo === 'remarketing' && e.respondeu)
      : c.comportamento === seg;
    if (!compOk) return false;
    if (deb === 'todos') return true;
    const parou = !!(c.id in paradas ? paradas[c.id] : debitoInfo(c).parouOrig);
    return deb === 'parou' ? parou : !parou;
  }), [seg, deb, paradas]);
  const cont = (comp: Comportamento) => CLIENTES.filter((c) => c.comportamento === comp).length;
  const contDeb = useMemo(() => {
    let d = 0, p = 0;
    for (const c of CLIENTES) { const parou = c.id in paradas ? paradas[c.id] : debitoInfo(c).parouOrig; parou ? p++ : d++; }
    return { descontando: d, parou: p };
  }, [paradas]);
  const POR_PAG = 12;
  const totalPag = Math.max(1, Math.ceil(lista.length / POR_PAG));
  const pagAtual = Math.min(pag, totalPag);
  const linhasPag = lista.slice((pagAtual - 1) * POR_PAG, pagAtual * POR_PAG);
  const trocarSeg = (x: typeof seg) => { setSeg(x); setPag(1); };
  const trocarDeb = (x: typeof deb) => { setDeb(x); setPag(1); };

  const colunas: Coluna<ClienteAnalise>[] = [
    { chave: 'nome', titulo: 'Cliente', render: (c) => (
      <div className="cm-cli-nm">{!c.whatsapp && <span className="cm-cli-alerta" title="Sem número — cadastre para a cobrança automática" aria-label="Sem número"><IcAtencao /></span>}{c.nome}</div>
    ) },
    { chave: 'whats', titulo: 'WhatsApp', render: (c) => c.whatsapp
      ? <span className="num" style={{ color: 'var(--txt-2)' }}>{c.whatsapp}</span>
      : <button type="button" className="cm-cad-btn" onClick={(e) => { e.stopPropagation(); setCadastrar(c); }}><IcAtencao /> Cadastrar número</button> },
    { chave: 'ciclo', titulo: 'Ciclo', classe: 'num', render: (c) => c.ciclo },
    { chave: 'at', titulo: 'Atendente', render: (c) => c.atendente },
    { chave: 'mens', titulo: 'Mensalidade', dir: true, classe: 'num', render: (c) => fmtBRL(c.mensalidade) },
    { chave: 'comp', titulo: 'Comportamento', render: (c) => <BadgeStatus tom={compBadge[c.comportamento]}>{ROTULO_COMP[c.comportamento]}</BadgeStatus> },
    { chave: 'deb', titulo: 'Débito', render: (c) => { const p = parouDe(c); return p ? <BadgeStatus tom="neutro">parou {dataBRcurta(p)}</BadgeStatus> : <BadgeStatus tom="ok">descontando</BadgeStatus>; } },
  ];

  return (
    <>
      <p className="cm-hint sobe">Comportamento de pagamento e engajamento de cada cliente. Filtre por <b>situação do débito no benefício</b> logo abaixo. Clique para ver a ficha completa.</p>
      {semNumero > 0 && (
        <button type="button" className="cm-avisonum sobe" style={{ animationDelay: '.04s' }} onClick={() => trocarSeg('sem_num')}>
          <span className="cm-avisonum-ic" aria-hidden><IcAtencao /></span>
          <span><b>{semNumero} cliente{semNumero === 1 ? '' : 's'} sem número de WhatsApp.</b> Cadastre o número para ativar a cobrança automática — sem ele, as mensagens não saem.</span>
          <span className="cm-avisonum-cta">Ver e cadastrar →</span>
        </button>
      )}
      <div className="cob-filtros sobe" style={{ animationDelay: '.06s' }}>
        <Chips>
          <Chip ativo={seg === 'todos'} onClick={() => trocarSeg('todos')}>Todos ({CLIENTES.length})</Chip>
          <Chip ativo={seg === 'sem_num'} onClick={() => trocarSeg('sem_num')}>⚠ Sem número ({semNumero})</Chip>
          <Chip ativo={seg === 'em_dia'} onClick={() => trocarSeg('em_dia')}>Em dia ({cont('em_dia')})</Chip>
          <Chip ativo={seg === 'voltou'} onClick={() => trocarSeg('voltou')}>Voltou a pagar ({cont('voltou')})</Chip>
          <Chip ativo={seg === 'faltou'} onClick={() => trocarSeg('faltou')}>Faltou pagar ({cont('faltou')})</Chip>
          <Chip ativo={seg === 'inadimplente'} onClick={() => trocarSeg('inadimplente')}>Inadimplente ({cont('inadimplente')})</Chip>
        </Chips>
      </div>
      <div className="cob-filtros sobe" style={{ animationDelay: '.08s' }}>
        <span className="cm-filtro-eixo">Débito no benefício</span>
        <Chips>
          <Chip ativo={deb === 'todos'} onClick={() => trocarDeb('todos')}>Todos</Chip>
          <Chip ativo={deb === 'descontando'} onClick={() => trocarDeb('descontando')}>Descontando ({contDeb.descontando})</Chip>
          <Chip ativo={deb === 'parou'} onClick={() => trocarDeb('parou')}>Débito parou ({contDeb.parou})</Chip>
        </Chips>
      </div>
      <CardVidro spot sobe className="mo-fixo" style={{ borderRadius: 'var(--r-card)', animationDelay: '.12s' }}>
        {lista.length === 0
          ? <EstadoVazio titulo="Nenhum cliente neste filtro" descricao="Troque o segmento acima." />
          : <TabelaPadrao colunas={colunas} linhas={linhasPag} chave={(c) => c.id} aoClicarLinha={(c) => setSel(c)}
              rodape={{ texto: `${lista.length} cliente${lista.length === 1 ? '' : 's'}`, paginacao: { pagina: pagAtual, totalPaginas: totalPag, aoIr: setPag } }} />}
      </CardVidro>

      <ModalV2 aberto={!!sel} aoFechar={() => setSel(null)} largura={560}
        titulo={sel ? <div className="cm-dr-titulo"><span className="cm-num-av" aria-hidden>{sel.nome.slice(0, 2).toUpperCase()}</span><div><div className="cm-dr-nm">{sel.nome}</div><div className="mod-sub num">{sel.ciclo} · {sel.atendente} · {fmtBRL(sel.mensalidade)}/mês</div></div></div> : ''}
        rodape={<BotaoSec onClick={() => setSel(null)}>Fechar</BotaoSec>}>
        {sel && (
          <>
            <div className={sel.whatsapp ? 'cm-dr-whats' : 'cm-dr-whats falta'}>
              <div>
                <div className="cm-dr-whats-rot">WhatsApp para cobrança</div>
                {sel.whatsapp
                  ? <div className="cm-dr-whats-num num">{sel.whatsapp}</div>
                  : <div className="cm-dr-whats-sem"><IcAtencao /> Nenhum número cadastrado</div>}
              </div>
              <BotaoSec mini onClick={() => setCadastrar(sel)}>{sel.whatsapp ? 'Trocar' : 'Cadastrar número'}</BotaoSec>
            </div>

            <div className="cm-dr-badge"><BadgeStatus tom={compBadge[sel.comportamento]}>{ROTULO_COMP[sel.comportamento]}</BadgeStatus><span className="num">Faturamento total {fmtBRL(sel.faturamentoTotal)}</span></div>

            <div className="cm-dr-sec">Débito no benefício</div>
            {(() => { const info = debitoInfo(sel); const parou = parouDe(sel); return (
              <div className="cm-dr-deb">
                <div className="pl-dr-grid">
                  <div><span>Parcela</span><b className="num">{fmtBRL(info.parcela)}</b></div>
                  <div><span>Fechamento</span><b className="num">{dataBRcurta(info.fechamento)}</b></div>
                  <div><span>Situação</span><div>{parou ? <BadgeStatus tom="neutro">parou em {dataBRcurta(parou)}</BadgeStatus> : <BadgeStatus tom="ok">descontando</BadgeStatus>}</div></div>
                </div>
                {gestor && (
                  <div className="cm-dr-deb-acao">
                    {parou
                      ? <BotaoSec mini onClick={() => setParadas((p) => ({ ...p, [sel.id]: null }))}>Reabrir (voltar a descontar)</BotaoSec>
                      : <BotaoPrimario onClick={() => setParadas((p) => ({ ...p, [sel.id]: hojeISOc() }))}>Marcar que o débito parou</BotaoPrimario>}
                  </div>
                )}
              </div>
            ); })()}

            <div className="cm-dr-sec">Histórico de pagamento</div>
            <div className="cm-hist">
              {sel.meses.map((m) => (
                <div className={'cm-hist-mes s-' + m.status} key={m.competencia}>
                  <span className="cm-hist-dot" aria-hidden />
                  <span className="cm-hist-comp num">{mesLabel(m.competencia)}</span>
                  <BadgeStatus tom={TOM_MES[m.status]}>{ROTULO_MES[m.status]}</BadgeStatus>
                </div>
              ))}
            </div>

            <div className="cm-dr-sec">Engajamento com as mensagens</div>
            <div className="cm-eng-list">
              {sel.engajamento.filter((e) => e.enviada).map((e) => (
                <div className="cm-eng-lin" key={e.tipo}>
                  <span className="cm-eng-rot">{ROTULO_TIPO_ENG[e.tipo]}</span>
                  <BadgeStatus tom={e.respondeu ? 'ok' : 'neutro'}>{e.respondeu ? 'Respondeu' : 'Sem resposta'}</BadgeStatus>
                </div>
              ))}
              {!sel.engajamento.some((e) => e.enviada) && <div className="cm-hint">Nenhuma mensagem enviada ainda.</div>}
            </div>
          </>
        )}
      </ModalV2>

      {cadastrar && (
        <ModalV2 aberto aoFechar={() => setCadastrar(null)} largura={420}
          titulo={<div>Cadastrar WhatsApp<div className="mod-sub">{cadastrar.nome}</div></div>}
          rodape={<><BotaoSec onClick={() => setCadastrar(null)}>Cancelar</BotaoSec><BotaoPrimario onClick={() => setCadastrar(null)}>Salvar número</BotaoPrimario></>}>
          <div className="form-grid">
            <div className="campo"><label>Número de WhatsApp</label><Input inputMode="tel" placeholder="(51) 90000-0000" defaultValue={cadastrar.whatsapp ?? ''} /></div>
            <p className="cm-hint">É por esse número que o cliente vai receber as cobranças automáticas. (Demonstração — no ar, salva no cadastro do cliente.)</p>
          </div>
        </ModalV2>
      )}
    </>
  );
}

/* =================== CONVERSAS (acompanhamento no WhatsApp) =================== */
/* Mostra, por cliente, como está a conversa da cobrança — num celular com a cara
   do WhatsApp (é o que o cliente vê). Só leitura. Threads ilustrativas geradas
   pelo comportamento do cliente, usando os textos da régua. */
type WaBolha = { de: 'in' | 'out'; tipo?: 'texto' | 'audio' | 'img'; texto?: string; hora: string; lido?: boolean; dur?: string };
const primeiroNome = (n: string) => n.split(' ')[0];
function threadCliente(cl: ClienteAnalise): { bolhas: WaBolha[]; estado: string; tom: TomStatus } {
  const pn = primeiroNome(cl.nome); const v = cl.mensalidade.toLocaleString('pt-BR'); const dia = CICLO_DIA[cl.ciclo] ?? 5;
  const L = (texto: string, hora: string): WaBolha => ({ de: 'out', texto, hora, lido: true });
  const R = (texto: string, hora: string): WaBolha => ({ de: 'in', texto, hora });
  const lembrete = L(`Oi ${pn}! 😊 Passando pra lembrar que sua mensalidade de R$ ${v} vence dia ${dia}. Qualquer dúvida, é só chamar.`, '09:12');
  switch (cl.comportamento) {
    case 'em_dia': return { estado: 'Pago', tom: 'ok', bolhas: [
      lembrete, R('Oi! Obrigada, já tô ciente 🙏', '09:40'),
      L(`Bom dia, ${pn}! Hoje é o vencimento da mensalidade de R$ ${v}. Quando puder confirmar, me avisa 🙂`, '08:05'),
      R('Acabei de pagar ✅', '10:22'), { de: 'in', tipo: 'img', texto: 'comprovante.jpg', hora: '10:22' },
      L('Recebido, muito obrigado! 🙌', '10:25') ] };
    case 'voltou': return { estado: 'Prometeu pagar', tom: 'atencao', bolhas: [
      lembrete, L(`Bom dia, ${pn}! Hoje vence a mensalidade de R$ ${v}. Consegue dar uma olhadinha?`, '08:05'),
      R('Pode ser sexta? Recebo dia 30 🙏', '14:03'), L('Claro, sem problema! Fico no aguardo 👍', '14:05') ] };
    case 'faltou': return { estado: 'Em atraso', tom: 'erro', bolhas: [
      lembrete, L(`${pn}, hoje é o vencimento da mensalidade de R$ ${v}.`, '08:05'),
      L(`${pn}, notei que a mensalidade de R$ ${v} ainda está em aberto. Conseguiu acertar?`, '09:00'),
      R('Desculpa! Semana que vem sem falta 🙏', '19:41') ] };
    default: return { estado: 'Sem resposta', tom: 'erro', bolhas: [
      lembrete, L(`${pn}, hoje vence a mensalidade de R$ ${v}.`, '08:05'),
      L(`${pn}, a mensalidade de R$ ${v} segue em aberto. Posso te ajudar a regularizar? 🙂`, '09:02'),
      { de: 'out', tipo: 'audio', dur: '0:24', hora: '15:10', lido: true } ] };
  }
}
const ultimaPrev = (b: WaBolha[]): string => { const u = b[b.length - 1]; if (!u) return ''; return u.tipo === 'img' ? 'Foto' : u.tipo === 'audio' ? 'Áudio' : (u.texto ?? ''); };

export function AbaConversas() {
  const lista = useMemo(() => CLIENTES.map((cl) => ({ cl, t: threadCliente(cl) })), []);
  const [busca, setBusca] = useState('');
  const [selId, setSelId] = useState<string>(lista[0]?.cl.id ?? '');
  const q = busca.trim().toLowerCase();
  const filtrados = q ? lista.filter((x) => x.cl.nome.toLowerCase().includes(q)) : lista;
  const sel = lista.find((x) => x.cl.id === selId) ?? filtrados[0] ?? lista[0];

  return (
    <div className="conv-raiz">
      <div className="conv-lista">
        <input className="inp conv-busca" placeholder="Buscar cliente…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <div className="conv-rows">
          {filtrados.slice(0, 60).map(({ cl, t }) => (
            <button type="button" key={cl.id} className={cl.id === sel?.cl.id ? 'conv-row on' : 'conv-row'} onClick={() => setSelId(cl.id)}>
              <span className="conv-av" aria-hidden>{cl.nome.slice(0, 2).toUpperCase()}</span>
              <span className="conv-mid"><span className="conv-nm">{cl.nome}</span><span className="conv-prev">{ultimaPrev(t.bolhas)}</span></span>
              <span className="conv-meta"><span className="conv-hora">{t.bolhas[t.bolhas.length - 1]?.hora}</span><BadgeStatus tom={t.tom}>{t.estado}</BadgeStatus></span>
            </button>
          ))}
          {filtrados.length === 0 && <div className="cm-exc-vazio">Nenhum cliente.</div>}
        </div>
      </div>

      {sel && (
        <div className="conv-fone-wrap">
          <div className="conv-estado"><BadgeStatus tom={sel.t.tom}>{sel.t.estado}</BadgeStatus><span className="cm-hint">Acompanhamento — somente leitura</span></div>
          <div className="fone">
            <div className="fone-tela">
              <div className="wa-top">
                <span className="wa-back" aria-hidden>‹</span>
                <span className="wa-av" aria-hidden>{sel.cl.nome.slice(0, 2).toUpperCase()}</span>
                <span className="wa-top-nm"><b>{sel.cl.nome}</b><i>visto por último hoje</i></span>
                <span className="wa-top-ic" aria-hidden>⋮</span>
              </div>
              <div className="wa-corpo">
                <div className="wa-datepill">HOJE</div>
                {sel.t.bolhas.map((b, i) => (
                  <div className={b.de === 'out' ? 'wa-bolha wa-out' : 'wa-bolha wa-in'} key={i}>
                    {b.tipo === 'img' ? (
                      <span className="wa-img"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg> {b.texto}</span>
                    ) : b.tipo === 'audio' ? (
                      <span className="wa-audio"><span className="wa-play" aria-hidden>▶</span><span className="wa-wave" aria-hidden /><span className="wa-dur num">{b.dur}</span></span>
                    ) : <span className="wa-txt">{b.texto}</span>}
                    <span className="wa-hora num">{b.hora}{b.de === 'out' && <span className={b.lido ? 'wa-check lido' : 'wa-check'} aria-hidden> ✓✓</span>}</span>
                  </div>
                ))}
              </div>
              <div className="wa-foot"><span className="wa-input">Mensagem</span><span className="wa-send" aria-hidden><IcT d={IC_PATH.enviar} s={13} mr={0} /></span></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* =================== GESTÃO DE COBRANÇAS (planilha viva) =================== */
/* Uma tela só, com a cara da planilha da casa (MENSAL-TEL-NOVOS): grade
   matricial EDITÁVEL + importar .xlsx + cadastrar novo lead + alterar dias e
   valores. Os dados vivem em estado local (localStorage), então importar a
   planilha real carrega tudo AQUI, no navegador — nada sobe pro link público.
   A SENHA do INSS nunca aparece em texto (e por padrão nem é importada). */
const PL_BANCOS = ['AGIBANK', 'BMG', 'MERCANTIL', 'CREFISA', 'FACTA'];
const PL_RECEBE = ['CAIXA', 'BANCO DO BRASIL', 'BRADESCO', 'ITAÚ'];
function plHash(s: string): number { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
interface PlCad { comercial: string; cicloCod: string; dia: number; banco: string; nb: string; cpf: string; fechamento: string; recebe: string }
function plCadastro(cl: ClienteAnalise): PlCad {
  const h = plHash(cl.id);
  return {
    comercial: cl.atendente, cicloCod: cl.ciclo, dia: CICLO_DIA[cl.ciclo] ?? 1,
    banco: PL_BANCOS[h % PL_BANCOS.length],
    nb: `${100 + (h % 900)}.${String(100 + (h % 900)).padStart(3, '0')}.${String(h % 1000).padStart(3, '0')}-${h % 10}`,
    cpf: `•••.•••.${String(100 + (h % 900))}-${String(10 + (h % 90))}`,
    fechamento: `2026-${String(1 + (h % 8)).padStart(2, '0')}-${String(1 + (h % 27)).padStart(2, '0')}`,
    recebe: PL_RECEBE[(h >> 3) % PL_RECEBE.length],
  };
}

type PlCol = { id: string; rot: string; w: number; fix?: boolean; comp?: string; num?: boolean; sensivel?: boolean; ord?: boolean };


/* linha da gestão — reflete uma linha da planilha da casa */
type SitDebito = 'ativo' | 'cancelado';
interface GLinha {
  id: string; nome: string; comercial: string; dia: number; banco: string;
  nb: string; cpf: string; senha: string;               // senha do INSS (nunca em texto)
  reclameLogin: string; reclameSenha: string;            // Reclame Aqui (login + senha)
  valor: number; ultimoPgto: string;    // valor = parcela TOTAL (mensal = metade) + data do últ. pagamento
  salario?: number;                      // salário exato (legado/import; a ficha usa a faixa)
  faixa?: 'ate_1sm' | 'acima_1sm';       // faixa do benefício — é o que a tabela do INSS usa
  fechamento: string; recebe: string; telefone: string;
  situacao: SitDebito; dataReclamacao: string; dataParou: string;  // reclamação p/ parar o desconto + parada
  parou: string;                                         // texto bruto importado (referência)
  obs?: string;                                          // observações livres do cadastro
  celulas: string[];
  // débito parado aguardando aprovação (dono 24/09) — espelho de data/cobranca/types.ts
  paradoPendente?: boolean; paradoSolicitadoPor?: string; paradoSolicitadoNome?: string; paradoSolicitadoEm?: string;
  paradoAprovadoNome?: string; paradoAprovadoEm?: string;
}
/* entrada de valor: o comercial lança que o cliente pagou R$X num mês;
   fica aguardando o FINANCEIRO confirmar que o valor caiu na conta.
   Ao confirmar, o valor é lançado como pago na grade daquele mês. */
interface Entrada {
  id: string; leadId: string; leadNome: string; comp: string; valor: number; por: string; quando: string;
  comprovante?: { nome: string; url: string };  // PDF do recibo (data URL), anexado pelo comercial
}
/* movimento já decidido pelo financeiro (histórico) */
interface MovFin { id: string; leadNome: string; comercial: string; comp: string; valor: number; status: 'confirmada' | 'recusada'; quando: string; comprovante?: { nome: string; url: string }; }
const comN = (por: string) => por.replace(/\s*\(comercial\)/i, '').trim() || '—';

const gsNorm = (v: unknown) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase();
const mascCpf = (c: string) => { if (!c) return '—'; if (c.includes('•')) return c; const d = c.replace(/\D/g, ''); if (d.length < 4) return '•••'; return '•••.•••.' + d.slice(-5, -2) + '-' + d.slice(-2); };
const extrDDMM = (s: string) => { const m = String(s).match(/(\d{1,2})\/(\d{1,2})/); return m ? `2026-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : ''; };
/** 'dd/mm hh:mm' no horário de BRASÍLIA (o banco devolve timestamptz em UTC — à noite a data virava o dia seguinte) */
const quandoBR = (iso: string) => { if (!iso) return iso; const d = new Date(iso); if (isNaN(d.getTime())) return iso; return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', ''); };

/* seed + leitura/gravação do blob demo ('alfa_gestao_v4') vivem em data/cobranca/demoStore.ts —
   fonte ÚNICA. A cópia local daqui divergiu do modelo v4 (pago = líquido do escritório,
   parcela/4) e regravava valores 4× maiores; removida em 30/09 (auditoria demo-paridade). */

function rawDaCelula(v: unknown): string {
  if (v == null || v === '') return '-';
  if (typeof v === 'number') return String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  if (!s || s === '-') return '-';
  if (/n[aã]o\s*pagou/i.test(s)) return 'NÃO PAGOU';
  return s;
}
/* total já pago = soma das células numéricas (meses pagos) */
function totalPagoDe(l: GLinha): number { return l.celulas.reduce((s, c) => { const n = Number(c); return s + (c !== '-' && c !== '' && isFinite(n) ? n : 0); }, 0); }
/* o DIA do último pagamento (recebimento no INSS) define o ciclo/vencimento */
const diaDeData = (iso: string) => { const m = String(iso).match(/^\d{4}-\d{2}-(\d{2})/); return m ? Number(m[1]) : 0; };
/* feriados + cálculo de data de cobrança: módulo puro cicloCalendario.ts
   (compartilhado com Painel/Comissões — a MESMA conta em todas as telas) */
const feriadoNome = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); if (!y) return ''; return feriadosDoAno(y)[`${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`] || ''; };
const DIAS_SEM = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const diaSemanaBR = (iso: string) => { if (!/^\d{4}-\d{2}-\d{2}/.test(iso)) return ''; const d = new Date(iso + 'T12:00:00'); return DIAS_SEM[d.getDay()]; };
function quintoDiaUtil(comp: string): string {
  const [y, m] = comp.split('-').map(Number); if (!y) return '';
  const fer = feriadosDoAno(y); let uteis = 0;
  const ult = new Date(y, m, 0).getDate();
  for (let d = 1; d <= ult; d++) { const dt = new Date(y, m - 1, d); const dow = dt.getDay(); const mm = `${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`; if (dow !== 0 && dow !== 6 && !fer[mm]) { uteis++; if (uteis === 5) return `${comp}-${String(d).padStart(2, '0')}`; } }
  return '';
}
/* ---- tabela de PAGAMENTO do INSS (pedido do dono): final do NB (sem o dígito
   verificador) + até/acima de 1 salário mínimo -> data do pagamento.
   Até 1 SM: últimos 5 dias úteis do mês + primeiros do seguinte (finais 1..9,0).
   Acima:    5 primeiros dias úteis do mês seguinte (pares 1/6, 2/7, 3/8, 4/9, 5/0). */
export const SALARIO_MINIMO = 1630; // 2026 — ajustar aqui quando o valor oficial mudar
function diasUteisDoMes(y: number, m: number): string[] {
  const fer = feriadosDoAno(y); const out: string[] = [];
  const ult = new Date(y, m, 0).getDate();
  for (let dd = 1; dd <= ult; dd++) { const dow = new Date(y, m - 1, dd).getDay(); if (dow !== 0 && dow !== 6 && !fer[`${d2(m)}-${d2(dd)}`]) out.push(`${y}-${d2(m)}-${d2(dd)}`); }
  return out;
}
/** faixa do benefício do lead: campo novo, ou derivada do salário legado */
const faixaDe = (l: { faixa?: 'ate_1sm' | 'acima_1sm'; salario?: number }): 'ate_1sm' | 'acima_1sm' | null =>
  l.faixa ?? (l.salario != null && l.salario > 0 ? (l.salario <= SALARIO_MINIMO ? 'ate_1sm' : 'acima_1sm') : null);

/* calendário oficial do INSS (vale pro ano todo, feriados incluídos):
   até 1 SM = finais 1..5 nos últimos 5 dias úteis do mês, 6..0 nos primeiros do seguinte;
   acima de 1 SM = pares de finais (1e6, 2e7…) nos 5 primeiros dias úteis do mês seguinte. */
function diaPagamentoINSS(nb: string, faixa: 'ate_1sm' | 'acima_1sm' | null, comp: string): string | null {
  const f = finalNB(nb);
  if (!f || !faixa) return null;
  const fin = Number(f);
  const [y, m] = comp.split('-').map(Number); if (!y) return null;
  const [y2, m2] = m === 12 ? [y + 1, 1] : [y, m + 1];
  if (faixa === 'ate_1sm') {
    const seq = [...diasUteisDoMes(y, m).slice(-5), ...diasUteisDoMes(y2, m2)];
    const pos = fin === 0 ? 10 : fin;
    return seq[pos - 1] ?? null;
  }
  const seq = diasUteisDoMes(y2, m2);
  const pos = fin === 0 ? 5 : ((fin - 1) % 5) + 1;
  return seq[pos - 1] ?? null;
}

/* cor estável por ciclo (ângulo áureo p/ máxima separação de matiz) */

/* mini-calendário do mês: marca fins de semana, feriados e o 5º dia útil */
function CalendarioMes({ comp, onPick, marcado }: { comp: string; onPick: (iso: string) => void; marcado?: string }) {
  const [y, m] = comp.split('-').map(Number);
  const fer = feriadosDoAno(y);
  const ult = new Date(y, m, 0).getDate();
  const offset = new Date(y, m - 1, 1).getDay();
  const q5 = quintoDiaUtil(comp);
  const cells: (number | null)[] = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= ult; d++) cells.push(d);
  return (
    <div className="cal">
      <div className="cal-head">{['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((w, i) => <span key={i}>{w}</span>)}</div>
      <div className="cal-grid">
        {cells.map((d, i) => {
          if (d == null) return <span key={i} className="cal-empty" />;
          const iso = `${comp}-${String(d).padStart(2, '0')}`;
          const dow = new Date(y, m - 1, d).getDay();
          const nome = fer[`${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`];
          const cls = ['cal-d', dow === 0 || dow === 6 ? 'wknd' : '', nome ? 'fer' : '', iso === q5 ? 'q5' : ''].filter(Boolean).join(' ');
          return <button type="button" key={i} className={cls} style={iso === marcado ? { boxShadow: 'inset 0 0 0 2px #c9a227', fontWeight: 700 } : undefined} title={nome || ''} onClick={() => onPick(iso)}>{d}{nome && <i className="cal-dot" />}</button>;
        })}
      </div>
      <div className="cal-leg"><span><i className="cal-lg fer" />feriado</span><span><i className="cal-lg q5" />5º dia útil</span><span><i className="cal-lg wknd" />fim de semana</span></div>
    </div>
  );
}

export interface Leitura { comps: string[]; linhas: GLinha[]; ignoradas: number }
function lerGestaoXlsx(buf: ArrayBuffer, incluirSenha: boolean): Leitura {
  const wb = XLSX.read(buf, { cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null });
  if (!rows.length) throw new Error('Planilha vazia.');
  const header = rows[0];
  const col = (rot: string) => header.findIndex((h) => gsNorm(h).includes(rot));
  const eq = (rot: string) => header.findIndex((h) => gsNorm(h) === rot);
  const iCli = col('CLIENTE'); if (iCli < 0) throw new Error('Não achei a coluna CLIENTE — confira se é o modelo da planilha.');
  const iCom = col('COMERCIAL'), iNb = eq('NB'), iCpf = col('CPF'), iBanco = eq('BANCO'),
        iRecebe = col('BANCO QUE RECEBE'), iParcela = col('PARCELA'), iParou = col('PAROU O DEBITO'),
        iFech = col('FECHAMENTO'), iSenha = col('SENHA INSS'), iReclame = col('RECLAME');
  const colsPag = header.map((h, i) => ({ h, i })).filter((x) => x.h instanceof Date).map((x) => ({ i: x.i, d: x.h as Date }));
  if (!colsPag.length) throw new Error('Não achei as colunas de mês (cabeçalho com data).');
  let iTel = -1;
  for (let i = header.length - 1; i >= 0; i--) { if (gsNorm(header[i]) === '') { iTel = i; break; } }
  const comps = colsPag.map((c) => c.d.toISOString().slice(0, 7));
  const txt = (r: unknown[], i: number) => (i >= 0 && r[i] != null && String(r[i]).trim() !== '' ? String(r[i]).trim() : '');
  const linhas: GLinha[] = []; let ignoradas = 0; let n = 0;
  for (const r of rows.slice(1)) {
    const nome = txt(r, iCli); if (!nome) { ignoradas++; continue; }
    const fechRaw = iFech >= 0 ? r[iFech] : null;
    const fech = fechRaw instanceof Date ? fechRaw.toISOString().slice(0, 10) : '';
    const dia = fech ? Number(fech.slice(8, 10)) : colsPag[0].d.getDate();
    const parcelaRaw = iParcela >= 0 ? r[iParcela] : null;
    let valor = 0;
    if (typeof parcelaRaw === 'number') valor = parcelaRaw;
    else { const num = parseFloat(String(parcelaRaw ?? '').replace(/[^\d,.-]/g, '').replace(',', '.')); if (isFinite(num)) valor = num; }
    const telRaw = iTel >= 0 ? r[iTel] : null;
    const telefone = (telRaw == null || telRaw === 0 || String(telRaw).trim() === '0') ? '' : String(telRaw).trim();
    const parouTxt = txt(r, iParou);
    const cancelado = /cancel|parou|sem\s*deb/i.test(parouTxt);
    const reclameTxt = txt(r, iReclame);
    linhas.push({
      id: `imp-${n++}-${plHash(nome + fech)}`, nome, comercial: txt(r, iCom), dia,
      banco: txt(r, iBanco), nb: txt(r, iNb), cpf: txt(r, iCpf), senha: incluirSenha ? txt(r, iSenha) : '',
      reclameLogin: '', reclameSenha: incluirSenha ? reclameTxt : '',
      valor, ultimoPgto: '', fechamento: fech, recebe: txt(r, iRecebe), telefone,
      situacao: cancelado ? 'cancelado' : 'ativo', dataReclamacao: extrDDMM(reclameTxt), dataParou: cancelado ? extrDDMM(parouTxt) : '',
      parou: parouTxt, celulas: colsPag.map((c) => rawDaCelula(r[c.i])),
    });
  }
  return { comps, linhas, ignoradas };
}

/* dinheiro digitado: aceita ponto E vírgula ("1.234,56", "350,5", "89.9") → número em reais */
const paraReais = (s: string): number => {
  const t = s.trim();
  if (!t) return 0;
  const n = t.includes(',') ? Number(t.replace(/\./g, '').replace(',', '.')) : Number(t);
  return isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
};
const reaisTxt = (n: number | undefined | null): string => (n == null || n === 0 ? '' : String(n).replace('.', ','));

/* ---- ficha / editor de um lead (cadastro e edição usam o mesmo formulário) ---- */
export function FichaLead({ inicial, comps, ciclos, comerciais, gestor, podeGrade, podeAprovar = true, novo, datasPelaPlanilha, parteDoMes, aoSalvar, aoExcluir, aoVoltarNovos, aoFechar }: {
  inicial: GLinha; comps: string[]; ciclos: number[]; comerciais: string[]; gestor: boolean; podeGrade?: boolean; novo?: boolean;
  /** visão do COMERCIAL (dono 27/10): mês pago mostra a parte dele (comp, líquido da célula) → valor.
      Com a prop a grade da ficha fica só leitura (o líquido do escritório não aparece pra ele) */
  parteDoMes?: (comp: string, liquido: number) => number | null;
  /** aprova "débito parado" (financeiro/cadastro/admin). Sem isso, a Situação de um
      cliente com débito ativo fica travada: entrar em cobrança só pela aprovação (dono 24/09). */
  podeAprovar?: boolean;
  /** aberta pela planilha (Gestão): as datas de reclamação e de parada vêm do texto
      das células — ficam só leitura aqui e este texto vira a dica. Sem a prop, nada muda. */
  datasPelaPlanilha?: string;
  aoSalvar: (l: GLinha, tocados?: (keyof GLinha)[]) => void; aoExcluir?: () => void; aoVoltarNovos?: () => void; aoFechar: () => void;
}) {
  const gradeRO = !!parteDoMes || !(podeGrade ?? gestor); // grade de pagamento: financeiro/gestor; comercial vê só leitura
  const [d, setD] = useState<GLinha>(() => ({ ...inicial, celulas: [...inicial.celulas] }));
  // campos que o usuário TOCOU nesta ficha: na EDIÇÃO, o Salvar grava só esses.
  // Sem isso, uma ficha aberta durante um "mover ciclo" (desta ou de outra sessão)
  // regravava o objeto INTEIRO com o dia/valor velhos — last-write-wins silencioso.
  const tocadosRef = useRef<Set<keyof GLinha>>(new Set());
  // senha guardada NUNCA some da ficha (pedido do dono 11/09): quem pode revelar
  // (admin/gestor) reabre a ficha com o campo já preenchido, SEMPRE em texto (dono
  // 18/09: "senhas sempre aparecendo, sem emoji"). A leitura é auditada no banco.
  // Se nada mudou no salvar, a senha não é regravada.
  const revelarMut = useRevelarSenha();
  const sessaoFicha = usePapel().data;
  const [origSenhas, setOrigSenhas] = useState<{ inss: string; reclame: string } | null>(null);
  useEffect(() => {
    if (novo || !inicial.id || !sessaoFicha?.podeRevelar) return;
    let vivo = true;
    void Promise.all([
      revelarMut.mutateAsync({ leadId: inicial.id, campo: 'inss' }).catch(() => ''),
      revelarMut.mutateAsync({ leadId: inicial.id, campo: 'reclame' }).catch(() => ''),
    ]).then(([s1, s2]) => {
      if (!vivo) return;
      setOrigSenhas({ inss: s1 ?? '', reclame: s2 ?? '' });
      setD((x) => ({ ...x, senha: x.senha || (s1 ?? ''), reclameSenha: x.reclameSenha || (s2 ?? '') }));
    });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [novo, inicial.id, sessaoFicha?.podeRevelar]);
  const paraSalvar = (): GLinha => ({
    ...d,
    senha: origSenhas && d.senha === origSenhas.inss ? '' : d.senha,               // '' = "não mexi"
    reclameSenha: origSenhas && d.reclameSenha === origSenhas.reclame ? '' : d.reclameSenha,
  });
  const [novoCiclo, setNovoCiclo] = useState(inicial.dia > 0 && !ciclos.includes(inicial.dia));
  const [novoCom, setNovoCom] = useState(!!inicial.comercial && !comerciais.includes(inicial.comercial));
  // dinheiro é digitado como TEXTO (senão a vírgula é engolida a cada tecla) e convertido por trás
  const [valorTxt, setValorTxt] = useState(() => reaisTxt(inicial.valor));
  // NB (final do benefício) + faixa identificam o dia de pagamento pela tabela oficial do INSS
  const dicaINSS = useMemo(() => {
    const ag = new Date();
    const compAtual = `${ag.getFullYear()}-${d2(ag.getMonth() + 1)}`;
    return diaPagamentoINSS(d.nb, faixaDe(d), compAtual);
  }, [d.nb, d.faixa, d.salario]);
  useEffect(() => {
    if (!novo || !dicaINSS) return;
    const dd = diaDeData(dicaINSS);
    if (dd) { setD((x) => (x.dia === dd ? x : { ...x, dia: dd })); setNovoCiclo(!ciclos.includes(dd)); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [novo, dicaINSS]);
  const set = <K extends keyof GLinha>(k: K, v: GLinha[K]) => { tocadosRef.current.add(k); setD((x) => ({ ...x, [k]: v })); };
  const setCel = (k: number, v: string) => { tocadosRef.current.add('celulas'); setD((x) => { const c = [...x.celulas]; c[k] = v || '-'; return { ...x, celulas: c }; }); };
  // sugestão (edição): a data do último pagamento indica outro ciclo — mudar é DECISÃO, não efeito colateral
  const sugestaoDia = !novo && d.ultimoPgto ? (diaDeData(d.ultimoPgto) || 0) : 0;
  const ro = !gestor;
  const datasRO = !!datasPelaPlanilha && !novo; // datas de reclamação/parada = da planilha
  const btn = novo ? 'Cadastrar lead' : 'Salvar';
  return (
    <ModalV2 aberto aoFechar={aoFechar} largura={640}
      titulo={<div className="cm-dr-titulo"><span className="cm-num-av" aria-hidden>{(d.nome || '??').slice(0, 2).toUpperCase()}</span><div><div className="cm-dr-nm">{novo ? 'Novo lead' : (d.nome || 'Lead')}</div><div className="mod-sub">{novo ? 'Preencha os dados da planilha' : `${d.comercial || '—'} · vence dia ${diaBR(d.dia)}`}</div></div></div>}
      rodape={gestor ? <>{aoExcluir && !novo && <button type="button" className="cic-esv ficha-excluir" onClick={aoExcluir} title="Exclui o cliente (vai para a Lixeira; reversível no Desfazer)">Excluir cliente</button>}{aoVoltarNovos && !novo && d.situacao === 'cancelado' && <BotaoSec onClick={aoVoltarNovos} title="O débito volta a ATIVO e o cliente reaparece nos Novos.">Voltar para Novos</BotaoSec>}<span style={{ flex: 1 }} /><BotaoSec onClick={aoFechar}>Cancelar</BotaoSec><BotaoPrimario onClick={() => aoSalvar(paraSalvar(), Array.from(tocadosRef.current))}>{btn}</BotaoPrimario></> : <BotaoSec onClick={aoFechar}>Fechar</BotaoSec>}>
      <div className="cm-dr-sec">Cadastro</div>
      <div className="gs-form">
        <div className="campo gs-col2"><label>Cliente</label><Input value={d.nome} disabled={ro} onChange={(e) => set('nome', e.target.value)} /></div>
        <div className="campo"><label>Comercial</label>
          {novoCom ? (
            <div className="gs-senha">
              <Input value={d.comercial} disabled={ro} placeholder="nome do comercial" onChange={(e) => set('comercial', e.target.value)} />
              {comerciais.length > 0 && <button type="button" className="gs-olho" title="Escolher da lista" onClick={() => { setNovoCom(false); set('comercial', comerciais[0]); }}>↩</button>}
            </div>
          ) : (
            <select className="inp" value={d.comercial} disabled={ro} onChange={(e) => { if (e.target.value === '__novo__') setNovoCom(true); else set('comercial', e.target.value); }}>
              {comerciais.map((cm) => <option key={cm} value={cm}>{cm}</option>)}
              <option value="__novo__">＋ Novo comercial…</option>
            </select>
          )}
        </div>
        <div className="campo"><label>Ciclo (turma de vencimento)</label>
          {/* ciclo = decisão de quem APROVA (dono 25/09; mig 61 recusa a troca pelo comercial) */}
          {!podeAprovar || (!novo && d.dia === 0 && d.situacao === 'ativo') ? (
            <Input value={d.dia > 0 ? `D${d2(d.dia)} · vence dia ${d2(d.dia)}` : 'A definir — na aprovação'} disabled
              title={podeAprovar ? 'Defina o ciclo ao aprovar o débito parado (Novos)' : 'O ciclo é escolhido pelo financeiro, cadastro ou administrador'} />
          ) : novoCiclo ? (
            <div className="gs-senha">
              <Input inputMode="numeric" value={String(d.dia)} disabled={ro} placeholder="dia 1–31" onChange={(e) => set('dia', Math.min(31, Math.max(1, soDigitos(e.target.value) || 1)))} />
              {ciclos.length > 0 && <button type="button" className="gs-olho" title="Escolher um ciclo existente" onClick={() => { setNovoCiclo(false); set('dia', ciclos[0]); }}>↩</button>}
            </div>
          ) : (
            <select className="inp" value={String(d.dia)} disabled={ro} onChange={(e) => { if (e.target.value === '__novo__') setNovoCiclo(true); else set('dia', Number(e.target.value)); }}>
              {d.dia === 0 && <option value="0" disabled>Escolha o ciclo…</option>}
              {ciclos.map((dc) => <option key={dc} value={dc}>D{d2(dc)} · vence dia {d2(dc)}</option>)}
              <option value="__novo__">＋ Novo ciclo (outro dia)…</option>
            </select>
          )}
        </div>
        <div className="campo"><label>Banco</label><Input value={d.banco} disabled={ro} onChange={(e) => set('banco', e.target.value)} /></div>
        <div className="campo"><label>NB</label><Input value={d.nb} disabled={ro} onChange={(e) => set('nb', e.target.value)} /></div>
        <div className="campo"><label>CPF</label><Input value={d.cpf} disabled={ro} onChange={(e) => set('cpf', e.target.value)} /></div>
        <div className="campo"><label>Telefone</label><Input inputMode="tel" value={d.telefone} disabled={ro} placeholder="51 90000-0000" onChange={(e) => set('telefone', e.target.value)} /></div>
        <div className="campo"><label>Último pagamento <span className="gs-lab-nota">{novo ? '(o dia define o ciclo)' : ''}</span></label><Input type="date" value={d.ultimoPgto} disabled={ro} onChange={(e) => {
          const v = e.target.value; const ddi = diaDeData(v);
          if (novo) {
            // cadastro: a data semeia o ciclo (comportamento de sempre)
            tocadosRef.current.add('ultimoPgto'); if (ddi) tocadosRef.current.add('dia');
            setD((x) => ({ ...x, ultimoPgto: v, dia: ddi ? Math.min(31, Math.max(1, ddi)) : x.dia }));
            if (ddi) setNovoCiclo(!ciclos.includes(ddi));
          } else {
            // edição: NÃO muda o ciclo sozinho (senão desfaz um "mover turma" em
            // silêncio) — a sugestão vira um botão logo abaixo, decisão do usuário
            set('ultimoPgto', v);
          }
        }} /></div>
      </div>
      {!novo && !ro && sugestaoDia > 0 && sugestaoDia !== d.dia && (
        <p className="cm-hint" style={{ margin: '6px 0 0' }}>
          O último pagamento cai no dia <b>{d2(sugestaoDia)}</b>, mas o ciclo deste cliente é <b>D{d2(d.dia)}</b>.{' '}
          <BotaoSec mini onClick={() => { set('dia', Math.min(31, Math.max(1, sugestaoDia))); setNovoCiclo(!ciclos.includes(sugestaoDia)); }}>Mudar para D{d2(sugestaoDia)}</BotaoSec>
        </p>
      )}
      {dicaINSS && (
        <p className="cm-hint" style={{ margin: '6px 0 0' }}>Tabela INSS: pagamento em <b>{dataBRcurta(dicaINSS)}</b> ({diaSemanaBR(dicaINSS)}) — benefício {faixaDe(d) === 'ate_1sm' ? 'até' : 'acima de'} 1 salário mínimo, final {finalNB(d.nb)}.{novo && <> O ciclo foi ajustado para <b>D{d2(diaDeData(dicaINSS) || d.dia)}</b>.</>}</p>
      )}
      <div className="cm-dr-sec">Valores</div>
      <div className="gs-form">
        <div className="campo"><label>Benefício <span className="gs-lab-nota">(tabela INSS)</span></label>
          <select className="inp" value={faixaDe(d) ?? ''} disabled={ro} onChange={(e) => set('faixa', (e.target.value || undefined) as GLinha['faixa'])}>
            <option value="">—</option>
            <option value="ate_1sm">Até 1 salário mínimo</option>
            <option value="acima_1sm">Acima de 1 salário mínimo</option>
          </select>
        </div>
        <div className="campo"><label>Parcela total (R$)</label><Input inputMode="decimal" value={valorTxt} disabled={ro} placeholder="0,00" onChange={(e) => { const s = e.target.value.replace(/[^\d.,]/g, ''); setValorTxt(s); set('valor', paraReais(s)); }} /></div>
        <div className="campo"><label>Parcela mensal <span className="gs-lab-nota">(meia parcela)</span></label><Input value={fmtBRL(d.valor / 2)} disabled /></div>
        <div className="campo"><label>Fechamento</label><Input type="date" value={d.fechamento} disabled={ro} onChange={(e) => set('fechamento', e.target.value)} /></div>
      </div>
      <div className="cm-dr-sec">Débito no benefício</div>
      <div className="gs-form">
        {/* entrar ou sair da cobrança passa por quem APROVA (dono 24/09): quem não
            aprova não troca a Situação aqui em nenhum sentido, e ninguém mexe enquanto
            o pedido aguarda — o banco também barra (trigger das migs 52/53). */}
        {(() => {
          const travaSit = !!inicial.paradoPendente || !podeAprovar;
          const dica = inicial.paradoPendente ? 'Aguardando aprovação — aprove ou recuse na lista "Aguardando aprovação" dos Novos.'
            : !travaSit ? undefined
            : inicial.situacao === 'ativo' ? 'Para ir para a cobrança, use "Marcar débito parado" nos Novos — o financeiro, o cadastro ou o administrador aprova.'
            : 'Tirar da cobrança é com o financeiro, o cadastro ou o administrador.';
          return (
            <div className="campo"><label>Situação</label>
              <select className="inp" value={d.situacao} disabled={ro || travaSit} title={dica} onChange={(e) => set('situacao', e.target.value as SitDebito)}><option value="ativo">{inicial.paradoPendente ? 'Aguardando aprovação' : 'Ativo (descontando)'}</option><option value="cancelado">Cancelado</option></select>
            </div>
          );
        })()}
        <div className="campo"><label>Data da reclamação</label><Input type="date" value={d.dataReclamacao} disabled={ro || datasRO} title={datasRO ? datasPelaPlanilha : undefined} onChange={(e) => set('dataReclamacao', e.target.value)} /></div>
        <div className="campo"><label>Data que parou o desconto</label><Input type="date" value={d.dataParou} disabled={ro || datasRO || d.situacao !== 'cancelado'} title={datasRO ? datasPelaPlanilha : undefined} onChange={(e) => set('dataParou', e.target.value)} /></div>
        {datasRO && <p className="cm-hint gs-col2" style={{ margin: '-2px 0 0' }}>{datasPelaPlanilha}</p>}
        <div className="campo gs-col2"><label>Observações</label>
          <textarea className="inp" rows={3} value={d.obs ?? ''} disabled={ro} placeholder="Anotações livres sobre o cliente — combinados, contexto, atenção…"
            style={{ resize: 'vertical', minHeight: 64, fontFamily: 'inherit', fontSize: 'inherit', lineHeight: 1.45, padding: '9px 12px' }}
            onChange={(e) => set('obs', e.target.value)} />
        </div>
      </div>
      <div className="cm-dr-sec">Credenciais <span className="gs-lab-nota">(guardadas com segurança; visíveis para quem tem acesso)</span></div>
      <div className="gs-form">
        <div className="campo gs-col2"><label>Senha do INSS</label>
          <div className="gs-senha"><Input type="text" autoComplete="off" name="cred-inss" spellCheck={false} value={d.senha} disabled={ro} placeholder="—" onChange={(e) => set('senha', e.target.value)} /></div>
        </div>
        <div className="campo"><label>Reclame Aqui — login</label><Input value={d.reclameLogin} disabled={ro} placeholder="e-mail ou CPF" onChange={(e) => set('reclameLogin', e.target.value)} /></div>
        <div className="campo"><label>Reclame Aqui — senha</label>
          <div className="gs-senha"><Input type="text" autoComplete="off" name="cred-reclame" spellCheck={false} value={d.reclameSenha} disabled={ro} placeholder="—" onChange={(e) => set('reclameSenha', e.target.value)} /></div>
        </div>
      </div>
      <div className="cm-dr-sec">Grade mês a mês</div>
      <p className="cm-hint" style={{ marginTop: -4, marginBottom: 8 }}>Número = pago (verde), “NÃO PAGOU” = em aberto (vermelho), “-” = fora da régua. {parteDoMes ? '(nos meses pagos aparece a SUA parte; pagamentos são do financeiro)' : gradeRO ? '(pagamentos são do financeiro)' : 'Edite cada mês:'}</p>
      <div className="gs-cel-list">
        {comps.map((c, k) => {
          const raw = d.celulas[k] ?? '-';
          const ec = parteDoMes ? estadoCelula(raw) : null;
          const parte = ec?.estado === 'pago' && ec.valor != null ? parteDoMes!(c, ec.valor) : null;
          return (
            <div className="gs-cel-row" key={c}>
              <span className="gs-cel-mes">{rotuloMesCurto(c)}</span>
              {!gradeRO ? <Input className="gs-cel-inp" value={raw} onChange={(e) => setCel(k, e.target.value)} /> : null}
              <Celula raw={parte != null ? String(parte) : raw} />
            </div>
          );
        })}
      </div>
      {isDemoMode && <p className="cm-hint" style={{ marginTop: 14 }}>Demonstração — os dados ficam só neste navegador. Na conta real, valem os mesmos campos da sua planilha.</p>}
    </ModalV2>
  );
}

/* ---- NOVO CLIENTE (dono 25/09) ----
   Tudo ligado à Gestão: os campos SÃO as colunas da planilha, na mesma ordem, e todos
   obrigatórios — o cliente entra nos Novos e aparece inteiro na Gestão (bloco Novos).
   O ciclo NÃO se escolhe aqui: quem aprova (financeiro/cadastro/administrador) define na
   aprovação do débito parado. O banco garante (mig 61: o dia vindo do comercial é descartado). */
const MES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const hojeLocalIso = () => { const h = new Date(); return `${h.getFullYear()}-${d2(h.getMonth() + 1)}-${d2(h.getDate())}`; };
/** como a planilha mostra a data (pl_fmt_data): "25/set" */
const dataCurtaPl = (iso: string) => { const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(iso || ''); return m ? `${m[2]}/${MES_CURTO[Number(m[1]) - 1]}` : ''; };
/** como a planilha mostra a parcela (pl_fmt_valor): "232" / "232,5" */
const valorPl = (n: number) => (n > 0 ? String(Math.round(n * 100) / 100).replace('.', ',') : '');

export function NovoCliente({ linhas, comps, comerciais, meuComercial, ocupado, erro: falha, aoCadastrar, aoFechar }: {
  linhas: GLinha[]; comps: string[]; comerciais: string[];
  /** comercial logado: o cliente já é dele (campo travado). null = escolhe na lista */
  meuComercial: string | null;
  ocupado?: boolean;
  /** falha ao gravar (fica DENTRO da janela — atrás do véu ninguém veria) */
  erro?: string;
  aoCadastrar: (l: GLinha) => void; aoFechar: () => void;
}) {
  const [c, setC] = useState<CamposNovo>(() => ({
    fechamento: hojeLocalIso(), comercial: meuComercial ?? '', nome: '', nb: '', banco: '', cpf: '', telefone: '',
    senha: '', valor: 0, reclameData: '', reclameSenha: '',
  }));
  const [valorTxt, setValorTxt] = useState('');
  const [faixa, setFaixa] = useState<FaixaBeneficio | ''>('');
  const [obs, setObs] = useState('');
  const [outroCom, setOutroCom] = useState(false);
  const [tentou, setTentou] = useState(false);
  const [tocados, setTocados] = useState<ReadonlySet<CampoNovo>>(() => new Set());
  const raizRef = useRef<HTMLDivElement>(null);
  const set = <K extends CampoNovo>(k: K, v: CamposNovo[K]) => setC((x) => ({ ...x, [k]: v }));
  const tocar = (k: CampoNovo) => setTocados((s) => (s.has(k) ? s : new Set([...s, k])));
  const probs = useMemo(() => problemasNovo(c), [c]);
  const faltam = ORDEM_CAMPOS.filter((k) => probs[k]);
  const erroDe = (k: CampoNovo) => (tentou || tocados.has(k) ? probs[k] : undefined);
  const bancos = useMemo(() => [...new Set(linhas.map((l) => (l.banco || '').trim().toUpperCase()).filter(Boolean))].sort(), [linhas]);
  // CPF que já existe: só avisa (a planilha tem cliente legítimo em 2 ciclos)
  const cpfIgual = useMemo(() => {
    const d = soDig(c.cpf);
    return d.length === 11 ? linhas.find((l) => soDig(l.cpf) === d) ?? null : null;
  }, [c.cpf, linhas]);
  const listaCom = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of comerciais) { const k = n.trim().toUpperCase(); if (k && !m.has(k)) m.set(k, n.trim()); }
    return [...m.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [comerciais]);

  const cadastrar = () => {
    if (ocupado) return;
    setTentou(true);
    if (faltam.length) {
      raizRef.current?.querySelector<HTMLElement>(`[data-campo="${faltam[0]}"]`)?.focus();
      return;
    }
    aoCadastrar({
      ...linhaVazia(comps), dia: 0, situacao: 'ativo',
      fechamento: c.fechamento, comercial: c.comercial.trim(), nome: c.nome.trim(), nb: c.nb.trim(),
      banco: c.banco.trim().toUpperCase(), cpf: c.cpf.trim(), telefone: c.telefone.trim(), senha: c.senha.trim(),
      valor: c.valor, dataReclamacao: c.reclameData, reclameSenha: textoReclame(c.reclameData, c.reclameSenha),
      faixa: faixa || undefined, obs: obs.trim() || undefined,
    });
  };

  // pedaços de JSX (NÃO componentes: componente declarado aqui remontaria o input a cada tecla)
  const rot = (k: CampoNovo, titulo: string) => <label className="nc-rot" htmlFor={`nc-${k}`}>{titulo}</label>;
  const erro = (k: CampoNovo) => { const e = erroDe(k); return e ? <span className="nc-erro" id={`nc-${k}-erro`}>{e}</span> : null; };
  const attrs = (k: CampoNovo) => {
    const e = erroDe(k);
    return {
      id: `nc-${k}`, 'data-campo': k, 'aria-invalid': e ? true : undefined, 'aria-describedby': e ? `nc-${k}-erro` : undefined,
      className: e ? 'inp nc-inv' : 'inp', onBlur: () => tocar(k),
    } as const;
  };
  const reclameTxt = textoReclame(c.reclameData, c.reclameSenha);
  const previa: [string, string][] = [
    ['FECHAMENTO', dataCurtaPl(c.fechamento)], ['COMERCIAL', c.comercial.trim()], ['CLIENTE', c.nome.trim()],
    ['NB', c.nb], ['BANCO', c.banco.trim().toUpperCase()], ['CPF', c.cpf], ['TELEFONE', c.telefone],
    ['SENHA INSS', c.senha.trim()], ['PARCELA TOTAL', valorPl(c.valor)], ['RECLAME AQUI', reclameTxt],
  ];

  return (
    <ModalV2 aberto aoFechar={aoFechar} largura={760} fecharNoVeu={false}
      titulo={<div className="cm-dr-titulo"><span className="cm-num-av nv-ic-novo" aria-hidden><IcT d="M15 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 3 17.5V19M9 10.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19 8v6M16 11h6" s={16} mr={0} /></span><div><div className="cm-dr-nm">Novo cliente</div><div className="mod-sub">Entra nos Novos e aparece na Gestão com estes dados</div></div></div>}
      rodape={<>
        <span className={faltam.length ? 'nc-status pend' : 'nc-status ok'} aria-live="polite">
          {faltam.length
            ? (faltam.length === 1 ? `Falta 1 campo: ${ROTULO_CAMPO[faltam[0]]}` : `Faltam ${faltam.length} campos`)
            : 'Tudo preenchido'}
        </span>
        <span style={{ flex: 1 }} />
        <BotaoSec onClick={aoFechar}>Cancelar</BotaoSec>
        <BotaoPrimario onClick={cadastrar} disabled={ocupado}>{ocupado ? 'Cadastrando…' : 'Cadastrar cliente'}</BotaoPrimario>
      </>}>
      <div className="nc" ref={raizRef}>
        <div className="nc-ciclo" role="note">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="3" y="4.5" width="18" height="16" rx="2.5" /><path d="M3 9.5h18M8 3v3M16 3v3" /></svg>
          <span><b>O ciclo não se escolhe aqui.</b> Quando o desconto parar, o financeiro, o cadastro ou o administrador aprova e escolhe o ciclo em que a cobrança começa.</span>
        </div>
        {falha && <div className="nc-falha" role="alert">{falha}</div>}

        <div className="nc-grade">
          <div className="nc-campo">
            {rot('fechamento', 'Fechamento')}
            <input type="date" {...attrs('fechamento')} value={c.fechamento} max={hojeLocalIso()} onChange={(e) => set('fechamento', e.target.value)} />
            {erro('fechamento')}
          </div>
          <div className="nc-campo">
            {rot('comercial', 'Comercial')}
            {meuComercial ? (
              <input {...attrs('comercial')} value={c.comercial} readOnly title="O cliente fica no seu nome" />
            ) : outroCom || !listaCom.length ? (
              <div className="nc-junto">
                <input {...attrs('comercial')} value={c.comercial} placeholder="Nome do comercial" onChange={(e) => set('comercial', e.target.value)} />
                {listaCom.length > 0 && <button type="button" className="nc-mini" onClick={() => { setOutroCom(false); set('comercial', ''); }}>Lista</button>}
              </div>
            ) : (
              <select {...attrs('comercial')} value={c.comercial} onChange={(e) => { if (e.target.value === '__outro__') { setOutroCom(true); set('comercial', ''); } else set('comercial', e.target.value); }}>
                <option value="">Escolha…</option>
                {listaCom.map((n) => <option key={n} value={n}>{n}</option>)}
                <option value="__outro__">Outro nome…</option>
              </select>
            )}
            {erro('comercial')}
          </div>
          <div className="nc-campo nc-largo">
            {rot('nome', 'Cliente')}
            <input {...attrs('nome')} value={c.nome} placeholder="Nome completo" autoComplete="off" onChange={(e) => set('nome', e.target.value)} />
            {erro('nome')}
          </div>
          <div className="nc-campo">
            {rot('nb', 'NB')}
            <input {...attrs('nb')} value={c.nb} inputMode="numeric" placeholder="000.000.000-0" autoComplete="off" onChange={(e) => set('nb', mascaraNB(e.target.value))} />
            {erro('nb')}
          </div>
          <div className="nc-campo">
            {rot('banco', 'Banco')}
            <input {...attrs('banco')} value={c.banco} list="nc-bancos" placeholder="AGIBANK, BMG…" autoComplete="off" onChange={(e) => set('banco', e.target.value.toUpperCase())} />
            <datalist id="nc-bancos">{bancos.map((b) => <option key={b} value={b} />)}</datalist>
            {erro('banco')}
          </div>
          <div className="nc-campo">
            {rot('cpf', 'CPF')}
            <input {...attrs('cpf')} value={c.cpf} inputMode="numeric" placeholder="000.000.000-00" autoComplete="off" onChange={(e) => set('cpf', mascaraCPF(e.target.value))} />
            {erro('cpf') ?? (cpfIgual && <span className="nc-alerta">Já existe um cliente com este CPF: {cpfIgual.nome}{cpfIgual.dia > 0 ? ` (D${d2(cpfIgual.dia)})` : cpfIgual.situacao === 'ativo' ? ' (Novos)' : ''}.</span>)}
          </div>
          <div className="nc-campo">
            {rot('telefone', 'Telefone')}
            <input {...attrs('telefone')} value={c.telefone} inputMode="tel" placeholder="(51) 99999-9999" autoComplete="off" onChange={(e) => set('telefone', mascaraTelefone(e.target.value))} />
            {erro('telefone')}
          </div>
          <div className="nc-campo">
            {rot('senha', 'Senha INSS')}
            <input {...attrs('senha')} value={c.senha} type="text" name="nc-cred-inss" spellCheck={false} autoComplete="off" placeholder="Senha do Meu INSS" onChange={(e) => set('senha', e.target.value)} />
            {erro('senha')}
          </div>
          <div className="nc-campo">
            {rot('valor', 'Parcela total')}
            <div className="nc-rs">
              <span aria-hidden>R$</span>
              <input {...attrs('valor')} value={valorTxt} inputMode="decimal" placeholder="0,00" onChange={(e) => { const s = e.target.value.replace(/[^\d.,]/g, ''); setValorTxt(s); set('valor', paraReais(s)); }} />
            </div>
            {erro('valor') ?? (c.valor > 0 && <span className="nc-dica">mensalidade {fmtBRL(c.valor / 2)}</span>)}
          </div>

          <fieldset className="nc-campo nc-largo nc-reclame">
            <legend className="nc-rot">Reclame Aqui</legend>
            <div className="nc-reclame-par">
              <div className="nc-sub">
                <label className="nc-subrot" htmlFor="nc-reclameData">Data da reclamação</label>
                <input type="date" {...attrs('reclameData')} value={c.reclameData} max={hojeLocalIso()} onChange={(e) => set('reclameData', e.target.value)} />
                {erro('reclameData')}
              </div>
              <div className="nc-sub">
                <label className="nc-subrot" htmlFor="nc-reclameSenha">Senha do Reclame Aqui</label>
                <input {...attrs('reclameSenha')} value={c.reclameSenha} type="text" name="nc-cred-reclame" spellCheck={false} autoComplete="off" placeholder="Senha" onChange={(e) => set('reclameSenha', e.target.value)} />
                {erro('reclameSenha')}
              </div>
            </div>
          </fieldset>

          <div className="nc-campo">
            <label className="nc-rot" htmlFor="nc-faixa">Benefício <span className="nc-opc">opcional</span></label>
            <select id="nc-faixa" className="inp" value={faixa} onChange={(e) => setFaixa(e.target.value as FaixaBeneficio | '')}>
              <option value="">Não sei</option>
              <option value="ate_1sm">Até 1 salário mínimo</option>
              <option value="acima_1sm">Acima de 1 salário mínimo</option>
            </select>
            <span className="nc-dica">Ajuda quem aprova a sugerir o ciclo</span>
          </div>
          <div className="nc-campo">
            <label className="nc-rot" htmlFor="nc-obs">Observações <span className="nc-opc">opcional</span></label>
            <input id="nc-obs" className="inp" value={obs} placeholder="Combinados, contexto…" onChange={(e) => setObs(e.target.value)} />
          </div>
        </div>

        <div className="nc-previa" aria-label="Como a linha fica na Gestão">
          <div className="nc-previa-cab">
            <span>Assim aparece na Gestão</span>
            <span className="nc-previa-bloco">Novos · ciclo a definir</span>
          </div>
          <div className="nc-previa-rolo">
            <table>
              <thead><tr>{previa.map(([h]) => <th key={h} scope="col">{h}</th>)}</tr></thead>
              <tbody><tr>{previa.map(([h, v]) => <td key={h} className={v ? undefined : 'vazio'}>{v || '—'}</td>)}</tr></tbody>
            </table>
          </div>
        </div>
      </div>
    </ModalV2>
  );
}

/* ---- FINANCEIRO: conferência dos pagamentos informados (redesenho 27/09) ----
   Dono: "essa parte do financeiro está bugada, vamos deixar melhor, mais organizado e
   profissional" (o "Confirmar" vazava do cartão, nome em 3 linhas, valor quebrado, KPI
   sem centavos). Mesma linguagem do Painel (painel.css, pn-*): barra com filtros ·
   4 indicadores · fila "Aguardando conferência" em largura cheia (mais antiga primeiro)
   · por comercial · histórico com filtro de status. "Não caiu" pede motivo (opcional,
   vai no aviso ao comercial — igual à recusa pela Gestão). Quem confirma/recusa =
   financeiro/gestor/admin (is_at_least('financeiro') no banco); excluir do histórico = ADMIN
   (policy mov_del = is_at_least('admin') — o gestor via a lixeira e recebia um falso "excluído"). */
interface AggCom { nome: string; aConf: number; nAConf: number; conf: number; nConf: number; rec: number; nRec: number }
const IcDoc = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></svg>
);
const IcLixo = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" /></svg>
);
export function AbaFinanceiro({ gestor, papel, admin = false }: { demo: boolean; gestor: boolean; papel?: Papel; admin?: boolean }) {
  // dados via camada de dados (demo=localStorage, real=Supabase); confirmar/recusar viram RPCs
  const { data: dadosQ, isLoading, isError, refetch } = useDadosCobranca();
  const pendentes = useMemo(() => dadosQ?.pendentes ?? [], [dadosQ]);
  const historico = useMemo(() => dadosQ?.historico ?? [], [dadosQ]);
  // quem confirma é o FINANCEIRO (e gestor/admin) — espelha is_at_least('financeiro') do banco
  const podeConfirmar = gestor || papel === 'financeiro';
  const confirmarMut = useConfirmarEntrada();
  const recusarMut = useRecusarEntrada();
  const excluirMovMut = useExcluirMov();
  const rotMes = (comp: string) => rotuloMesCurto(comp);
  const [aviso, setAvisoSt] = useState<{ texto: string; tom: 'ok' | 'erro' } | null>(null);
  const setAviso = (texto: string) => setAvisoSt({ texto, tom: 'ok' });
  const setErro = (texto: string) => setAvisoSt({ texto, tom: 'erro' });
  const [movDel, setMovDel] = useState<MovFin | null>(null);
  const [emAcao, setEmAcao] = useState<string | null>(null); // entrada sendo confirmada (trava o duplo clique)
  const confirmarExclusao = () => {
    if (!movDel) return;
    const m = movDel;
    excluirMovMut.mutate(m.id, {
      onSuccess: () => { setMovDel(null); setAviso(`Lançamento de ${m.leadNome} (${fmtBRL(m.valor)}) excluído do histórico.`); },
      onError: (e) => { setMovDel(null); setErro(msgErro(e)); },
    });
  };
  const [fCom, setFCom] = useState('todos');
  const [busca, setBusca] = useState('');
  const [fSt, setFSt] = useState<'todas' | 'confirmada' | 'recusada'>('todas');
  const [nHist, setNHist] = useState(20);
  const [verComp, setVerComp] = useState<{ nome: string; url: string } | null>(null);
  // abre o comprovante: demo = data URL direto; real = assina URL curta a partir do path
  const abrirComp = (cp?: { nome: string; url: string; path?: string }) => {
    if (!cp) return;
    if (!cp.path) { setVerComp({ nome: cp.nome, url: cp.url }); return; }
    void getCobrancaRepo().assinarComprovante(cp)
      .then((url) => { if (url) setVerComp({ nome: cp.nome, url }); else setErro('Comprovante indisponível — o arquivo não foi encontrado.'); })
      .catch((err) => setErro(`Não deu pra abrir o comprovante: ${msgErro(err)}`));
  };

  // decididas NESTA tela saem da fila na hora (o refetch vem depois — sem isso um
  // 2º clique no intervalo dava "entrada já decidida")
  const [decididas, setDecididas] = useState<ReadonlySet<string>>(() => new Set());
  const decidir = (id: string) => setDecididas((s) => new Set([...s, id]));
  useEffect(() => { setDecididas((s) => (s.size ? new Set([...s].filter((id) => pendentes.some((p) => p.id === id))) : s)); }, [pendentes]);

  const confirmar = (e: Entrada) => {
    if (emAcao) return;
    setEmAcao(e.id);
    confirmarMut.mutate(e.id, {
      onSuccess: () => { decidir(e.id); setAviso(`Confirmado: ${fmtBRL(e.valor)} de ${e.leadNome} (${rotMes(e.comp)}) lançado como pago.`); },
      onError: (err) => setErro(msgErro(err)),
      onSettled: () => setEmAcao(null),
    });
  };
  // "Não caiu": motivo opcional (vai no aviso ao comercial)
  const [recusar, setRecusar] = useState<Entrada | null>(null);
  const [motivo, setMotivo] = useState('');
  const [erroRec, setErroRec] = useState('');
  const confirmarRecusa = () => {
    if (!recusar) return;
    const e = recusar;
    recusarMut.mutate({ id: e.id, motivo: motivo.trim() || undefined }, {
      onSuccess: () => { decidir(e.id); setRecusar(null); setMotivo(''); setErroRec(''); setAviso(`Não caiu: ${e.leadNome} (${rotMes(e.comp)}) — o comercial foi avisado.`); },
      onError: (err) => setErroRec(msgErro(err)),   // janela fica aberta, motivo preservado
    });
  };

  const comerciais = useMemo(() => [...new Set([...pendentes.map((e) => comN(e.por)), ...historico.map((h) => h.comercial)])].filter((n) => n && n !== '—').sort(), [pendentes, historico]);
  const q = busca.trim().toLowerCase();
  const doFiltro = (com: string, nome: string) => (fCom === 'todos' || com === fCom) && (!q || nome.toLowerCase().includes(q));
  // fila: a MAIS ANTIGA primeiro (quem informou antes é conferido antes)
  const abertas = useMemo(() => pendentes.filter((e) => !decididas.has(e.id)), [pendentes, decididas]);
  const pendFilt = useMemo(() => abertas.filter((e) => doFiltro(comN(e.por), e.leadNome)).sort((a, b) => (a.quando || '').localeCompare(b.quando || '')),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [abertas, fCom, q]);
  const histBase = useMemo(() => historico.filter((h) => doFiltro(h.comercial, h.leadNome)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [historico, fCom, q]);
  const histFilt = histBase.filter((h) => fSt === 'todas' || h.status === fSt);

  const soma = (l: { valor: number }[]) => l.reduce((s, x) => s + x.valor, 0);
  const aConfV = soma(abertas);
  const conf = historico.filter((h) => h.status === 'confirmada');
  const rec = historico.filter((h) => h.status === 'recusada');
  const confV = soma(conf), recV = soma(rec);
  const volume = aConfV + confV + recV;
  const nDecididas = conf.length + rec.length;
  const taxa = nDecididas ? Math.floor((conf.length / nDecididas) * 100) : null;
  const maisAntiga = abertas.reduce<string>((m, e) => (!m || (e.quando && e.quando < m) ? e.quando : m), '');
  const pctVol = (v: number) => (volume ? (v / volume) * 100 : 0);

  const agg = useMemo<AggCom[]>(() => {
    const m = new Map<string, AggCom>();
    const g = (n: string) => { let x = m.get(n); if (!x) { x = { nome: n, aConf: 0, nAConf: 0, conf: 0, nConf: 0, rec: 0, nRec: 0 }; m.set(n, x); } return x; };
    for (const e of pendentes) { const x = g(comN(e.por)); x.aConf += e.valor; x.nAConf++; }
    for (const h of historico) { const x = g(h.comercial || '—'); if (h.status === 'confirmada') { x.conf += h.valor; x.nConf++; } else { x.rec += h.valor; x.nRec++; } }
    return [...m.values()].sort((a, b) => (b.conf + b.aConf + b.rec) - (a.conf + a.aConf + a.rec));
  }, [pendentes, historico]);

  if (isLoading) return <div className="fin-vazio">Carregando entradas…</div>;
  if (isError) return <CardVidro spot><EstadoVazio titulo="Não foi possível carregar" descricao="Verifique a conexão e tente novamente." acao={{ rotulo: 'Tentar de novo', onClick: () => { void refetch(); } }} /></CardVidro>;
  return (
    <div className="pn pn-fin">
      {aviso && <div className={`gs-aviso ${aviso.tom}`} role={aviso.tom === 'erro' ? 'alert' : 'status'}><span>{aviso.texto}</span><button type="button" className="gs-aviso-x" onClick={() => setAvisoSt(null)} aria-label="Fechar">×</button></div>}

      {/* barra: contexto + filtros que valem pra tela inteira */}
      <div className="pn-barra sobe">
        <div className="pn-barra-esq">
          <span className="pn-barra-rot">Conferência de pagamentos</span>
          <span className="pn-barra-stat num"><b>{abertas.length}</b> aguardando</span>
        </div>
        <div className="pn-barra-dir pn-fin-filtros">
          <select className="inp" value={fCom} onChange={(e) => setFCom(e.target.value)} aria-label="Filtrar por comercial">
            <option value="todos">Todos os comerciais</option>
            {comerciais.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input className="inp" type="search" placeholder="Buscar cliente…" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar cliente" />
        </div>
      </div>

      {/* indicadores */}
      <div className="pn-kpis sobe" style={{ animationDelay: '.04s' }}>
        <Indicador rotulo="Aguardando conferência" valor={<Dinheiro v={aConfV} />} tom={abertas.length ? 'at' : undefined}
          pe={abertas.length ? <><b className="num">{abertas.length}</b> pagamento{abertas.length === 1 ? '' : 's'} · o mais antigo de <b className="num">{quandoBR(maisAntiga).slice(0, 5)}</b></> : 'nada para conferir'}
          visual={<div className="pn-trilho"><i className="at" style={{ width: `${pctVol(aConfV)}%` }} /></div>} />
        <Indicador rotulo="Confirmado" valor={<Dinheiro v={confV} />} tom={confV ? 'ok' : undefined}
          pe={<><b className="num">{conf.length}</b> confirmaç{conf.length === 1 ? 'ão' : 'ões'} no histórico</>}
          visual={<div className="pn-trilho"><i className="ok" style={{ width: `${pctVol(confV)}%` }} /></div>} />
        <Indicador rotulo="Não caiu" valor={<Dinheiro v={recV} />} tom={recV ? 'er' : undefined}
          pe={<><b className="num">{rec.length}</b> recusa{rec.length === 1 ? '' : 's'} no histórico</>}
          visual={<div className="pn-trilho"><i className="er" style={{ width: `${pctVol(recV)}%` }} /></div>} />
        <Indicador rotulo="Taxa de confirmação" valor={taxa == null ? '—' : <>{taxa}<span className="pn-cent">%</span></>}
          tom={taxa == null ? undefined : taxa >= 80 ? 'ok' : taxa >= 60 ? 'at' : 'er'}
          pe={nDecididas ? <><b className="num">{conf.length}</b> de {nDecididas} conferências caíram na conta</> : 'nenhuma conferência ainda'}
          visual={<div className="pn-trilho"><i className={taxa == null ? 'neutro' : taxa >= 80 ? 'ok' : taxa >= 60 ? 'at' : 'er'} style={{ width: `${taxa ?? 0}%` }} /></div>} />
      </div>

      {/* fila */}
      <CardVidro spot className="pn-card sobe" style={{ animationDelay: '.08s' }}>
        <div className="pn-card-cab">
          <div>
            <h3>Aguardando conferência {pendFilt.length > 0 && <span className="pn-fin-n num">{pendFilt.length}</span>}</h3>
            <p>Pagamentos informados pelos comerciais, do mais antigo para o mais novo. {podeConfirmar ? 'Confira o comprovante e marque se caiu na conta.' : 'Quem confirma é o financeiro.'}</p>
          </div>
          {pendFilt.length > 0 && <span className="pn-card-lado num">total <b>{fmtBRL(soma(pendFilt))}</b></span>}
        </div>
        {pendFilt.length === 0 ? (
          <div className="pn-fin-vazio">
            <span className="pn-fin-vazio-ic" aria-hidden><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg></span>
            <div><b>{abertas.length ? 'Nada neste filtro' : 'Tudo conferido'}</b><span>{abertas.length ? 'Mude o comercial ou a busca para ver os outros pagamentos.' : 'Quando um comercial informar um pagamento na Gestão, ele aparece aqui.'}</span></div>
          </div>
        ) : (
          <div className="pn-mapa-rolo">
            <table className="pn-eq pn-fin-tab">
              <thead>
                <tr>
                  <th scope="col">Cliente</th>
                  <th scope="col">Comercial</th>
                  <th scope="col">Mês</th>
                  <th scope="col" className="num">Valor</th>
                  <th scope="col">Comprovante</th>
                  <th scope="col"><span className="pn-vh">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                {pendFilt.map((e) => (
                  <tr key={e.id}>
                    <td className="pn-fin-cli">
                      <span className="pn-eq-nome estatico"><span className="pn-av" aria-hidden>{e.leadNome.slice(0, 2).toUpperCase()}</span>
                        <span className="pn-eq-nm"><span className="pn-fin-nome" title={e.leadNome}>{e.leadNome}</span>{e.quando && <small className="num">informado em {quandoBR(e.quando)}</small>}</span></span>
                    </td>
                    <td>{comN(e.por)}</td>
                    <td className="pn-fin-mes">{rotMes(e.comp)}</td>
                    <td className="num"><b>{fmtBRL(e.valor)}</b></td>
                    <td>{e.comprovante
                      ? <button type="button" className="pn-link pn-fin-comp" onClick={() => abrirComp(e.comprovante)}><IcDoc />Ver comprovante</button>
                      : <span className="pn-mut">sem comprovante</span>}</td>
                    <td className="pn-fin-acoes">
                      {podeConfirmar ? (
                        <span className="pn-fin-bts">
                          <button type="button" className="pn-fin-nao" onClick={() => { if (recusar?.id !== e.id) setMotivo(''); setErroRec(''); setRecusar(e); }} disabled={!!emAcao}>Não caiu</button>
                          <button type="button" className="pn-fin-ok" onClick={() => confirmar(e)} disabled={!!emAcao}>{emAcao === e.id ? 'Confirmando…' : 'Confirmar'}</button>
                        </span>
                      ) : <span className="pn-tag suave">aguardando o financeiro</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardVidro>

      {/* por comercial */}
      {agg.length > 0 && (
        <CardVidro spot className="pn-card sobe" style={{ animationDelay: '.12s' }}>
          <div className="pn-card-cab">
            <div><h3>Por comercial</h3><p>Tudo o que cada comercial informou: confirmado, aguardando e o que não caiu</p></div>
            <div className="pn-leg" aria-hidden>
              <span><i className="pn-leg-q ok" />Confirmado</span><span><i className="pn-leg-q at" />Aguardando</span><span><i className="pn-leg-q er" />Não caiu</span>
            </div>
          </div>
          <div className="pn-mapa-rolo">
            <table className="pn-eq pn-fin-tab">
              <thead>
                <tr>
                  <th scope="col">Comercial</th>
                  <th scope="col">Composição</th>
                  <th scope="col" className="num">Confirmado</th>
                  <th scope="col" className="num">Aguardando</th>
                  <th scope="col" className="num">Não caiu</th>
                </tr>
              </thead>
              <tbody>
                {agg.map((a) => (
                  <tr key={a.nome} className={fCom !== 'todos' && fCom !== a.nome ? 'pn-fin-apagado' : undefined}>
                    <td><span className="pn-eq-nome estatico"><span className="pn-av" aria-hidden>{a.nome.slice(0, 2).toUpperCase()}</span><span className="pn-eq-nm">{a.nome}</span></span></td>
                    <td className="pn-eq-saude"><Proporcao partes={[
                      { v: a.conf, tom: 'ok', titulo: `Confirmado: ${fmtBRL(a.conf)}` },
                      { v: a.aConf, tom: 'at', titulo: `Aguardando: ${fmtBRL(a.aConf)}` },
                      { v: a.rec, tom: 'er', titulo: `Não caiu: ${fmtBRL(a.rec)}` },
                    ]} /></td>
                    <td className="num">{a.conf ? <span className="pn-fin-v ok"><b>{fmtBRL(a.conf)}</b><small>{a.nConf}×</small></span> : <span className="pn-mut">—</span>}</td>
                    <td className="num">{a.aConf ? <span className="pn-fin-v at"><b>{fmtBRL(a.aConf)}</b><small>{a.nAConf}×</small></span> : <span className="pn-mut">—</span>}</td>
                    <td className="num">{a.rec ? <span className="pn-fin-v er"><b>{fmtBRL(a.rec)}</b><small>{a.nRec}×</small></span> : <span className="pn-mut">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardVidro>
      )}

      {/* histórico */}
      <CardVidro spot className="pn-card sobe" style={{ animationDelay: '.16s' }}>
        <div className="pn-card-cab">
          <div><h3>Histórico de conferência</h3><p>O que já foi conferido, do mais recente para o mais antigo</p></div>
          <div className="pn-fin-seg" role="tablist" aria-label="Filtrar histórico por status">
            {([['todas', 'Todas', histBase.length], ['confirmada', 'Confirmadas', histBase.filter((h) => h.status === 'confirmada').length], ['recusada', 'Não caiu', histBase.filter((h) => h.status === 'recusada').length]] as const).map(([id, rot, n]) => (
              <button key={id} type="button" role="tab" aria-selected={fSt === id} className={fSt === id ? 'on' : undefined} onClick={() => { setFSt(id); setNHist(20); }}>
                {rot}<span className="num">{n}</span>
              </button>
            ))}
          </div>
        </div>
        {histFilt.length === 0 ? (
          <p className="pn-vazio">Nada conferido {fSt === 'todas' ? 'ainda' : 'com esse status'}{fCom !== 'todos' || q ? ' neste filtro' : ''}.</p>
        ) : (
          <>
            <div className="pn-mapa-rolo">
              <table className="pn-eq pn-fin-tab pn-fin-hist">
                <thead>
                  <tr>
                    <th scope="col">Quando</th>
                    <th scope="col">Cliente</th>
                    <th scope="col">Comercial</th>
                    <th scope="col">Mês</th>
                    <th scope="col" className="num">Valor</th>
                    <th scope="col">Comprovante</th>
                    <th scope="col">Situação</th>
                    {admin && <th scope="col"><span className="pn-vh">Excluir</span></th>}
                  </tr>
                </thead>
                <tbody>
                  {histFilt.slice(0, nHist).map((h) => (
                    <tr key={h.id}>
                      <td className="pn-fin-mes pn-mut">{quandoBR(h.quando)}</td>
                      <td className="pn-fin-cli"><span className="pn-fin-nome" title={h.leadNome}>{h.leadNome}</span></td>
                      <td>{h.comercial}</td>
                      <td className="pn-fin-mes">{rotMes(h.comp)}</td>
                      <td className="num"><b>{fmtBRL(h.valor)}</b></td>
                      <td>{h.comprovante ? <button type="button" className="pn-link pn-fin-comp" onClick={() => abrirComp(h.comprovante)}><IcDoc />Ver</button> : <span className="pn-mut">—</span>}</td>
                      <td><BadgeStatus tom={h.status === 'confirmada' ? 'ok' : 'erro'}>{h.status === 'confirmada' ? 'Confirmada' : 'Não caiu'}</BadgeStatus></td>
                      {admin && <td className="pn-fin-acoes"><button type="button" className="pn-fin-lixo" onClick={() => setMovDel(h)} aria-label={`Excluir o lançamento de ${h.leadNome} do histórico`} title="Excluir do histórico"><IcLixo /></button></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pn-rodape num">
              <span>Mostrando {Math.min(nHist, histFilt.length)} de {histFilt.length}</span>
              {histFilt.length > nHist && <button type="button" className="pn-link" onClick={() => setNHist((n) => n + 20)}>Mostrar mais</button>}
            </div>
          </>
        )}
      </CardVidro>

      {verComp && (
        <ModalV2 aberto aoFechar={() => setVerComp(null)} largura={720}
          titulo={<div>Comprovante<div className="mod-sub">{verComp.nome}</div></div>}
          rodape={<BotaoSec onClick={() => setVerComp(null)}>Fechar</BotaoSec>}>
          {/^data:image\//.test(verComp.url) || /\.(png|jpe?g|gif|webp|bmp|heic)$/i.test(verComp.nome)
            ? <img alt="Comprovante" src={verComp.url} className="fin-comp-img" />
            : <iframe title="Comprovante" src={verComp.url} className="fin-comp-view" />}
        </ModalV2>
      )}

      {/* "Não caiu" com motivo (opcional) */}
      <ModalV2 aberto={!!recusar} aoFechar={() => { if (!recusarMut.isPending) setRecusar(null); }} largura={440}
        titulo={recusar ? <div>Não caiu na conta<div className="mod-sub">{recusar.leadNome} · {rotMes(recusar.comp)} · {fmtBRL(recusar.valor)}</div></div> : ''}
        rodape={<><BotaoSec onClick={() => setRecusar(null)} disabled={recusarMut.isPending}>Cancelar</BotaoSec><BotaoPrimario onClick={confirmarRecusa} disabled={recusarMut.isPending} style={{ background: 'var(--rubro)' }}>{recusarMut.isPending ? 'Salvando…' : 'Marcar como não caiu'}</BotaoPrimario></>}>
        {recusar && (
          <div>
            <label className="cd-f" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}><span>Motivo (opcional — vai no aviso para {comN(recusar.por)})</span>
              <textarea className="inp pn-fin-motivo" rows={3} value={motivo} placeholder="Ex.: o valor não apareceu no extrato do dia" onChange={(ev) => setMotivo(ev.target.value)} />
            </label>
            {erroRec && <p className="pn-fin-erro" role="alert">{erroRec}</p>}
            <p className="cm-hint" style={{ margin: '10px 2px 0' }}>O mês do cliente fica <b>vermelho</b> na Gestão e o comercial pode informar de novo com outro comprovante.</p>
          </div>
        )}
      </ModalV2>

      <ModalV2 aberto={!!movDel} aoFechar={() => setMovDel(null)} largura={440} titulo={movDel ? `Excluir lançamento — ${movDel.leadNome}` : ''}
        rodape={<><BotaoSec onClick={() => setMovDel(null)}>Cancelar</BotaoSec><BotaoPrimario onClick={confirmarExclusao} disabled={excluirMovMut.isPending}>{excluirMovMut.isPending ? 'Excluindo…' : 'Excluir'}</BotaoPrimario></>}>
        {movDel && <p className="cm-hint" style={{ margin: 0 }}>Remove o registro de <b>{fmtBRL(movDel.valor)}</b> ({rotMes(movDel.comp)} · {movDel.comercial}) do histórico de conferência. O pagamento já lançado na grade do cliente <b>não é desfeito</b> — se for o caso, limpe a célula na Gestão de cobranças.</p>}
      </ModalV2>
    </div>
  );
}

/* comercial lança um pagamento recebido de um cliente (vai para o financeiro confirmar) */
/** mês padrão = o mês corrente (se estiver na lista); senão o último ≤ corrente.
    Antes era o ÚLTIMO comp — um mês avulso no futuro (ex.: 2027-08) virava o padrão. */
function mesPadraoLancar(lista: string[]): string {
  const ag = new Date(); const atual = `${ag.getFullYear()}-${d2(ag.getMonth() + 1)}`;
  if (lista.includes(atual)) return atual;
  const ate = lista.filter((c) => c <= atual);
  return ate.length ? ate.reduce((a, b) => (b > a ? b : a)) : (lista[0] ?? '');
}
export function LancarPagamento({ linhas, comps, rotMes, aoLancar, aoFechar, mesesDe, aoEscolher, clienteInicial }: {
  linhas: GLinha[]; comps: string[]; rotMes: (comp: string) => string; aoLancar?: (leadId: string, comp: string, valor: number, comprovante?: { nome: string; url: string }) => void; aoFechar: () => void;
  /** opcional (Gestão = planilha): os meses que o cliente aceita — só os que têm coluna
      no bloco dele. Fora disso o pagamento entraria e a célula ficaria vazia. Sem a prop, todos. */
  mesesDe?: (leadId: string) => ReadonlySet<string>;
  /** opcional (Gestão = planilha): modo SÓ ESCOLHER — o modal escolhe cliente e mês e devolve aqui;
      valor e comprovante (obrigatório) vão no "Informar pagamento" da planilha. Sem a prop, lança aqui. */
  aoEscolher?: (leadId: string, comp: string) => void;
  /** opcional: abre já com este cliente (leadId) escolhido */
  clienteInicial?: string;
}) {
  const soEscolher = !!aoEscolher;
  const [busca, setBusca] = useState('');
  const [sel, setSel] = useState<GLinha | null>(() => (clienteInicial ? linhas.find((l) => l.id === clienteInicial) ?? null : null));
  const [compEscolhido, setComp] = useState(() => mesPadraoLancar(comps));
  // com restrição: mês fora da lista do cliente (trocou de cliente) cai no padrão da lista dele
  const permitidos = sel && mesesDe ? mesesDe(sel.id) : null;
  const opcoes = permitidos ? comps.filter((c) => permitidos.has(c)) : comps;
  const comp = opcoes.includes(compEscolhido) ? compEscolhido : mesPadraoLancar(opcoes);
  const [valor, setValor] = useState('');
  const [comprovante, setComprovante] = useState<{ nome: string; url: string } | null>(null);
  const [erroPdf, setErroPdf] = useState('');
  const pdfRef = useRef<HTMLInputElement>(null);
  const q = busca.trim().toLowerCase();
  const achados = q ? linhas.filter((l) => l.nome.toLowerCase().includes(q)).slice(0, 8) : [];
  const nVal = Number(valor.replace(',', '.').replace(/[^\d.]/g, '')) || 0;   // o que o CLIENTE pagou
  // dono 27/10: digita-se o total do cliente; o que vai pra célula é o líquido do escritório
  const pctsQ = useComissoes(); const histQ = useComissoesHist();
  const pctsCom = pctsQ.data; const histCom = histQ.data;
  const comSel = (sel?.comercial ?? '').trim();
  const temCom = !!sel && !!comSel && comSel !== '—';
  // sem a % carregada a divisão cairia nos 50% padrão: o envio espera
  const pctOk = !temCom || (pctsCom !== undefined && histCom !== undefined);
  const pctSel = temCom && comp && pctOk ? pctNoMes(histCom, pctsCom, comSel, comp) : null;
  const liquido = nVal > 0 && pctOk ? (pctSel != null ? liquidoDoTotal(nVal, pctSel) : Math.round(nVal * 100) / 100) : 0;
  const anexar = (f: File) => {
    setErroPdf('');
    if (f.size > 3 * 1024 * 1024) { setErroPdf('Arquivo muito grande (máx. 3 MB).'); return; }
    const r = new FileReader();
    r.onload = () => setComprovante({ nome: f.name, url: String(r.result) });
    r.readAsDataURL(f);
  };
  return (
    <ModalV2 aberto aoFechar={aoFechar} largura={480}
      titulo={<div>Lançar pagamento<div className="mod-sub">{soEscolher
        ? 'Escolha o cliente e o mês — a seguir você informa o valor e anexa o comprovante.'
        : 'Registra que o cliente pagou — o financeiro confirma se caiu na conta.'}</div></div>}
      rodape={<><BotaoSec onClick={aoFechar}>Cancelar</BotaoSec>{soEscolher
        ? <BotaoPrimario disabled={!sel || !comp} onClick={() => sel && comp && aoEscolher?.(sel.id, comp)}>Continuar</BotaoPrimario>
        : <BotaoPrimario disabled={!sel || liquido <= 0 || !comp} onClick={() => sel && aoLancar?.(sel.id, comp, liquido, comprovante ?? undefined)}>Enviar p/ o financeiro confirmar</BotaoPrimario>}</>}>
      {!sel ? (
        <>
          <div className="campo"><label>Cliente</label><Input value={busca} placeholder="Buscar cliente pelo nome…" onChange={(e) => setBusca(e.target.value)} /></div>
          {achados.length > 0 && <div className="gs-previa" style={{ marginTop: 10 }}>{achados.map((l) => <button type="button" key={l.id} className="gs-pick" onClick={() => { setSel(l); setValor(''); }}><b>{l.nome}</b><span>{l.comercial || '—'} · D{d2(l.dia)} · {fmtBRL(l.valor)}</span></button>)}</div>}
          {q && achados.length === 0 && <p className="cm-hint" style={{ marginTop: 10 }}>Nenhum cliente com esse nome.</p>}
        </>
      ) : (
        <>
          <div className="gs-aviso info" style={{ marginBottom: 12 }}><b>{sel.nome}</b> · D{d2(sel.dia)} · parcela {fmtBRL(sel.valor)} <button type="button" className="gs-aviso-x" onClick={() => setSel(null)} aria-label="Trocar cliente">trocar</button></div>
          <div className="gs-form">
            <div className="campo"><label>Mês</label><select className="inp" value={comp} disabled={!opcoes.length} onChange={(e) => setComp(e.target.value)}>{opcoes.map((c) => <option key={c} value={c}>{rotMes(c)}</option>)}</select></div>
            {!soEscolher && <div className="campo"><label>Valor que o cliente pagou (R$)</label><Input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} /></div>}
          </div>
          {!soEscolher && nVal > 0 && !pctOk && (
            <p className="cm-hint" style={{ margin: '6px 0 0' }}>{(pctsQ.isError && !pctsCom) || (histQ.isError && !histCom) ? 'Não deu pra carregar a % da comissão — recarregue a página antes de enviar.' : 'Carregando a % da comissão…'}</p>
          )}
          {!soEscolher && nVal > 0 && pctOk && (
            <p className="cm-hint" style={{ margin: '6px 0 0' }}>
              Escritório <b className="num">{fmtBRL(liquido)}</b>
              {pctSel != null ? <> · {comSel} ({fmtPct(pctSel)}%) <b className="num">{fmtBRL(parteDoComercial(liquido, pctSel))}</b></> : ' · cliente sem comercial: o valor todo fica pro escritório'}
            </p>
          )}
          {permitidos && (soEscolher
            ? (opcoes.length
              ? <p className="cm-hint" style={{ margin: '6px 0 0' }}>Só os meses do bloco deste cliente na planilha que ainda não estão pagos nem aguardando o financeiro.</p>
              : <p className="gs-erro">Nenhum mês deste cliente para informar — os meses dele na planilha já estão pagos ou aguardando o financeiro (ou ele não tem coluna de mês, ex.: Novos).</p>)
            : (opcoes.length
              ? opcoes.length < comps.length && <p className="cm-hint" style={{ margin: '6px 0 0' }}>Só os meses que têm coluna no bloco deste cliente na planilha.</p>
              : <p className="gs-erro">Este cliente não tem coluna de mês na planilha (ex.: Novos, sem ciclo) — não dá pra lançar pagamento por aqui.</p>))}
          {!soEscolher && <>
          <div className="cm-dr-sec">Comprovante (PDF do recibo)</div>
          <input ref={pdfRef} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) anexar(f); }} />
          {comprovante
            ? <div className="fin-comp-anexo"><span><IcT d={IC_PATH.documento} s={13} />{comprovante.nome}</span><button type="button" className="gs-aviso-x" onClick={() => setComprovante(null)}>remover</button></div>
            : <div className="gs-drop" onClick={() => pdfRef.current?.click()} role="button" tabIndex={0}>Anexar o comprovante em PDF (o financeiro vê pra confirmar)</div>}
          {erroPdf && <p className="gs-erro">{erroPdf}</p>}
          {comp && <p className="cm-hint" style={{ marginTop: 12 }}>Ao enviar, fica <b>aguardando o financeiro</b>. Ele confere o comprovante, olha a conta e confirma — aí o valor entra como pago no mês de {rotMes(comp)}.</p>}
          </>}
        </>
      )}
    </ModalV2>
  );
}

/* ---- importar .xlsx ---- */
function ImportarCiclo({ situacao, diaFixo, ocupado, erroExterno, aoImportar, aoFechar }: {
  situacao: SitDebito;
  /** definido = importa DENTRO do ciclo desse dia (Gerenciar Ciclos): não pede nome nem data */
  diaFixo?: number;
  ocupado?: boolean;
  /** erro vindo do servidor (a falha da RPC): mostrado AQUI dentro — o toast da
      página fica atrás do véu deste modal e o usuário não veria nada */
  erroExterno?: string;
  aoImportar: (a: { r: Leitura; cicloNome: string; dataCobranca: string }) => void;
  aoFechar: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [previa, setPrevia] = useState<Leitura | null>(null);
  const [erro, setErro] = useState('');
  const [incluirSenha, setIncluirSenha] = useState(true);
  const [cicloNome, setCicloNome] = useState('');
  const [dataCobranca, setDataCobranca] = useState('');
  const [carregando, setCarregando] = useState(false);
  const pronto = !!previa && previa.linhas.length > 0 && (diaFixo != null || (cicloNome.trim().length > 0 && !!dataCobranca));
  const escolher = async (file: File) => {
    setErro(''); setCarregando(true);
    try {
      const r = lerGestaoXlsx(await file.arrayBuffer(), incluirSenha);
      if (!r.linhas.length) { setErro('A planilha não tem nenhuma linha com CLIENTE preenchido.'); setPrevia(null); }
      else setPrevia(r);
    }
    catch (e) { setErro(e instanceof Error ? e.message : 'Não consegui ler o arquivo.'); setPrevia(null); }
    finally { setCarregando(false); }
  };
  // com import EM ANDAMENTO o modal não fecha (Esc/véu/Cancelar): fechar e
  // reabrir no meio convidava a clicar de novo e duplicar os clientes
  const fecharSeguro = () => { if (!ocupado) aoFechar(); };
  return (
    <ModalV2 aberto aoFechar={fecharSeguro} largura={540}
      titulo={diaFixo != null
        ? <div>Importar clientes no ciclo D{d2(diaFixo)}<div className="mod-sub">Os clientes entram direto neste ciclo, <b>em cobrança</b> — as datas do calendário dele permanecem.</div></div>
        : <div>{situacao === 'ativo' ? 'Importar leads novos' : 'Importar leads em cobrança'}<div className="mod-sub">A planilha vira um CICLO: dê um nome e a data em que a cobrança será feita.</div></div>}
      rodape={<><BotaoSec onClick={fecharSeguro} disabled={!!ocupado}>Cancelar</BotaoSec><BotaoPrimario onClick={() => pronto && !ocupado && previa && aoImportar({ r: previa, cicloNome: cicloNome.trim(), dataCobranca })} disabled={!pronto || !!ocupado}>{ocupado ? 'Importando…' : `Importar ${previa ? `${previa.linhas.length} leads` : ''}`}</BotaoPrimario></>}>
      {diaFixo == null && <div className="form-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
        <label className="cd-f"><span>Nome do ciclo *</span><input className="inp" placeholder="Ex.: Ciclo D05 — Setembro" value={cicloNome} onChange={(e) => setCicloNome(e.target.value)} /></label>
        <label className="cd-f"><span>Data da cobrança *</span><input className="inp" type="date" value={dataCobranca} onChange={(e) => setDataCobranca(e.target.value)} /></label>
      </div>}
      <input ref={ref} type="file" accept=".xlsx,.xls" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) escolher(f); }} />
      <label className="gs-check"><input type="checkbox" checked={incluirSenha} onChange={(e) => setIncluirSenha(e.target.checked)} /> Trazer também as senhas (INSS e Reclame Aqui) — entram cifradas, nunca aparecem em texto</label>
      <div className="gs-drop" onClick={() => ref.current?.click()} role="button" tabIndex={0}>
        {carregando ? 'Lendo…' : previa ? `✓ ${previa.linhas.length} leads lidos · ${previa.comps.length} meses${previa.ignoradas ? ` · ${previa.ignoradas} linhas vazias ignoradas` : ''}` : 'Clique para escolher o arquivo .xlsx da planilha'}
      </div>
      {previa && <div className="gs-previa">{previa.linhas.slice(0, 5).map((l) => <div key={l.id}><b>{l.nome}</b><span>{l.comercial || '—'} · {l.banco || '—'} · {fmtBRL(l.valor)}</span></div>)}{previa.linhas.length > 5 && <div className="gs-previa-mais">+ {previa.linhas.length - 5} outros…</div>}</div>}
      {(erro || erroExterno) && <p className="gs-erro">{erro || erroExterno}</p>}
      <p className="cm-hint" style={{ marginTop: 12 }}>Lê CLIENTE, COMERCIAL, NB, BANCO, CPF, PARCELA, DATA QUE PAROU O DÉBITO, RECLAME AQUI, os meses (cabeçalho com data), banco que recebe e telefone. As senhas só entram se você marcar acima.</p>
    </ModalV2>
  );
}

function linhaVazia(comps: string[]): GLinha {
  return { id: `novo-${Date.now()}`, nome: '', comercial: '', dia: 5, banco: 'AGIBANK', nb: '', cpf: '', senha: '', reclameLogin: '', reclameSenha: '', valor: 0, ultimoPgto: '', fechamento: '', recebe: '', telefone: '', situacao: 'ativo', dataReclamacao: '', dataParou: '', parou: '', celulas: comps.map(() => '-') };
}

/* gerenciar ciclos (turmas) dentro da própria Gestão de cobranças */
/* Editor do ciclo: escolher o DIA do mês em que essa turma inteira é cobrada.
   Ao Confirmar, TODOS os clientes do ciclo passam a vencer nesse dia — muda a
   Gestão e os disparos juntos (moverTurma). Dono 15-16/09: "quando trocar a data
   do dia 1 pra outro dia, tem que atualizar tudo referente àquele ciclo, as
   pessoas dentro dele, tudo." Clicar num dia só SELECIONA; o botão Confirmar aplica. */
function EditorDiaCiclo({ ciclo, turmas, novosPorDia, datasManuaisDe, aoMover, salvando, aoFechar }: {
  ciclo: CicloTurma; turmas: CicloTurma[];
  /** quantos NOVOS (débito ativo) também vencem nesse dia — movem junto */
  novosPorDia: (dia: number) => number;
  /** competências (mês corrente em diante) com data manual no calendário para o dia */
  datasManuaisDe: (dia: number) => string[];
  aoMover: (diaDe: number, diaPara: number) => void;
  salvando: boolean;
  aoFechar: () => void;
}) {
  // calendário de verdade, com navegação de mês (dono 16/09): mês corrente + 12
  const meses = useMemo(() => { const out: string[] = []; const now = new Date(); for (let k = 0; k < 13; k++) { const d = new Date(now.getFullYear(), now.getMonth() + k, 1); out.push(`${d.getFullYear()}-${d2(d.getMonth() + 1)}`); } return out; }, []);
  const [i, setI] = useState(0);
  const comp = meses[i] ?? meses[0];
  const [selIso, setSelIso] = useState<string | null>(null);
  // o vencimento é por DIA do mês (recorrente): a escolha no calendário vale pelo
  // NÚMERO do dia (ex.: "dia 1 do mês que vem" = vencer todo dia 01). O mês só
  // ajuda a enxergar/rolar (ex.: dia 31 → dia 1 do mês seguinte).
  const escolhido = selIso ? Number(selIso.slice(8, 10)) : null;
  const mudou = escolhido != null && escolhido !== ciclo.dia;
  const alvo = mudou ? turmas.find((t) => t.dia === escolhido) ?? null : null; // dia já ocupado → funde
  // conta HONESTA (o UPDATE move todo mundo que vence no dia, novos incluídos)
  const novosJunto = novosPorDia(ciclo.dia);
  const totalMove = ciclo.leads.length + novosJunto;
  const rotuloMove = novosJunto > 0
    ? <><b>{ciclo.leads.length}</b> em cobrança + <b>{novosJunto}</b> novo{novosJunto === 1 ? '' : 's'} (vencem no mesmo dia)</>
    : <><b>{ciclo.leads.length}</b> cliente{ciclo.leads.length === 1 ? '' : 's'}</>;
  const datasOrigem = datasManuaisDe(ciclo.dia);
  const datasDestino = escolhido != null && mudou ? datasManuaisDe(escolhido) : [];
  // "ocupado" tem que usar o MESMO predicado da RPC (qualquer lead no destino,
  // novos incluídos) — senão o aviso promete limpar datas que serão mantidas
  const novosDest = mudou && escolhido != null ? novosPorDia(escolhido) : 0;
  const destinoOcupado = alvo != null || novosDest > 0;
  return (
    <ModalV2 aberto aoFechar={aoFechar} largura={380}
      titulo={<div>Dia da cobrança · ciclo {ciclo.codigo}<div className="mod-sub">{totalMove} cliente{totalMove === 1 ? '' : 's'} · escolha o dia no calendário e confirme</div></div>}
      rodape={<><BotaoSec onClick={aoFechar}>Fechar</BotaoSec><BotaoPrimario disabled={!mudou || salvando} onClick={() => escolhido != null && aoMover(ciclo.dia, escolhido)}>{salvando ? 'Movendo…' : escolhido != null ? `Confirmar dia ${d2(escolhido)}` : 'Escolha um dia'}</BotaoPrimario></>}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, margin: '2px 0 10px' }}>
        <button type="button" className="calx-seta" disabled={i <= 0} onClick={() => setI((v) => Math.max(0, v - 1))} aria-label="Mês anterior">‹</button>
        <b className="num" style={{ textTransform: 'uppercase', letterSpacing: '.03em' }}>{rotuloMesCurto(comp)}</b>
        <button type="button" className="calx-seta" disabled={i >= meses.length - 1} onClick={() => setI((v) => Math.min(meses.length - 1, v + 1))} aria-label="Próximo mês">›</button>
      </div>
      <CalendarioMes comp={comp} marcado={selIso ?? undefined} onPick={(iso) => setSelIso(iso)} />
      <p className="cm-hint" style={{ margin: '10px 2px 0' }}>
        {escolhido != null
          ? <>{rotuloMove} passam a vencer no <b>dia {d2(escolhido)}</b> ({dataBRcurta(selIso!)}) — a Gestão e os disparos vão junto.</>
          : <>Clique num dia do calendário e depois em <b>Confirmar</b>. Pode rolar pro mês seguinte (ex.: dia 31 → dia 1).</>}
      </p>
      {alvo && <p className="cm-hint" style={{ margin: '6px 2px 0', color: 'var(--ambar)' }}>⚠ O dia {d2(escolhido!)} já é o ciclo {alvo.codigo} ({alvo.leads.length} cliente{alvo.leads.length === 1 ? '' : 's'}). Ao confirmar, os dois viram um só ciclo <b>D{d2(escolhido!)}</b> com {alvo.leads.length + totalMove} clientes.</p>}
      {mudou && !alvo && novosDest > 0 && <p className="cm-hint" style={{ margin: '6px 2px 0' }}>ℹ {novosDest} novo{novosDest === 1 ? '' : 's'} (débito ativo) já vence{novosDest === 1 ? '' : 'm'} no dia {d2(escolhido!)} — passam a dividir o dia com a turma.</p>}
      {mudou && datasOrigem.length > 0 && <p className="cm-hint" style={{ margin: '6px 2px 0', color: 'var(--ambar)' }}>⚠ O dia {d2(ciclo.dia)} tem data manual no calendário ({datasOrigem.join(', ')}) — ao mover, essas datas voltam ao automático (o Desfazer repõe).</p>}
      {mudou && !destinoOcupado && datasDestino.length > 0 && <p className="cm-hint" style={{ margin: '6px 2px 0', color: 'var(--ambar)' }}>⚠ O dia {d2(escolhido!)} tinha data manual antiga ({datasDestino.join(', ')}) de uma turma que já saiu — será limpa; a turma chega no automático.</p>}
      {mudou && destinoOcupado && datasDestino.length > 0 && <p className="cm-hint" style={{ margin: '6px 2px 0' }}>ℹ O dia {d2(escolhido!)} tem data manual no calendário ({datasDestino.join(', ')}) — ela passa a valer também pra quem chega.</p>}
    </ModalV2>
  );
}

export function GerenciarCiclos({ turmas, abertos, totalCobranca, totalNovos, novosPorDia, datasManuaisDe, aviso, posDe, aoMover, aoAbrir, aoFecharDia, aoEsvaziar, aoEsvaziarUm, podeImportar, importando, aoImportarUm, salvando, aoFechar }: {
  turmas: CicloTurma[];
  /** dias abertos à mão (podem estar vazios) */
  abertos: number[];
  totalCobranca: number; totalNovos: number;
  novosPorDia: (dia: number) => number;
  datasManuaisDe: (dia: number) => string[];
  /** aviso global do pai — repetido AQUI porque o toast fica atrás do véu do modal */
  aviso?: string;
  /** posição do dia na ordem arrastável dos chips (lista acompanha a mesma ordem) */
  posDe: (dia: number) => number;
  aoMover: (diaDe: number, diaPara: number) => void;
  aoAbrir: (dia: number) => void;
  aoFecharDia: (dia: number) => void;
  aoEsvaziar: () => void;
  /** esvazia UM ciclo (pessoas saem; o dia continua aberto e as datas ficam) */
  aoEsvaziarUm: (dia: number) => void;
  /** importar planilha DENTRO do ciclo (dono 17/09: o botão fica aqui, por ciclo) */
  podeImportar: boolean;
  importando: boolean;
  aoImportarUm: (dia: number, r: Leitura, fim: (ok: boolean, erro?: string) => void) => void;
  salvando: boolean;
  aoFechar: () => void;
}) {
  const [editar, setEditar] = useState<number | null>(null);
  const [importDia, setImportDia] = useState<number | null>(null);
  // falha do import guardada POR DIA: é exibida dentro do próprio modal (o
  // toast/aviso da página fica atrás do véu e o usuário não veria a falha)
  const [importErro, setImportErro] = useState<{ dia: number; msg: string } | null>(null);
  const [abrindo, setAbrindo] = useState(false);
  const [selAbrir, setSelAbrir] = useState<number | null>(null);
  const [confEsvaziar, setConfEsvaziar] = useState(false);
  const [confUm, setConfUm] = useState<number | null>(null);
  const turmaConfUm = confUm != null ? turmas.find((t) => t.dia === confUm) ?? null : null;
  const alvo = editar != null ? turmas.find((t) => t.dia === editar) ?? null : null;
  const vazios = abertos.filter((d) => !turmas.some((t) => t.dia === d)).sort((a, b) => a - b);
  const ocupados = new Set<number>([...turmas.map((t) => t.dia), ...abertos]);
  const itens: { dia: number; t?: CicloTurma }[] = [
    ...turmas.map((t) => ({ dia: t.dia, t })),
    ...vazios.map((d) => ({ dia: d })),
  ].sort((a, b) => posDe(a.dia) - posDe(b.dia)); // mesma ordem dos chips (arrastável)
  const totalComDia = totalCobranca + totalNovos;
  return (
    <ModalV2 aberto aoFechar={aoFechar} largura={580}
      titulo={<div>Ciclos (turmas de vencimento)<div className="mod-sub">Clique num ciclo para mudar o dia da cobrança — move todos os clientes dele de uma vez.</div></div>}
      rodape={<>
        <BotaoSec onClick={() => { setSelAbrir(null); setAbrindo(true); }} title="Cria um ciclo VAZIO num dia — depois é só direcionar ou mover clientes para ele.">＋ Abrir ciclo</BotaoSec>
        {totalComDia > 0 && <button type="button" className="cic-esv" onClick={() => setConfEsvaziar(true)} title="Todos os clientes saem dos ciclos e ficam aguardando — para redistribuir do zero.">Esvaziar ciclos…</button>}
        <span style={{ flex: 1 }} />
        <BotaoSec onClick={aoFechar}>Fechar</BotaoSec>
      </>}>
      {aviso && <div className="gs-aviso" role="status" style={{ marginBottom: 12 }}><span>{aviso}</span></div>}
      <div className="gs-aprov-list">
        {itens.map(({ dia, t }) => t ? (
          <div className="fin-ciclo-row" key={dia} role="button" tabIndex={0} style={{ cursor: 'pointer' }}
            onClick={() => setEditar(dia)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setEditar(dia); } }}>
            <span className="cm-ciclo-cod">{t.codigo}</span>
            <div className="fin-ciclo-info"><b>vence dia {d2(dia)}</b><span>{t.leads.length} cliente{t.leads.length === 1 ? '' : 's'} nesta turma</span></div>
            {/* só Enter/Espaço ficam aqui (abririam a linha); o Esc segue até o modal e fecha */}
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); }}>
              <button type="button" className="cic-esv" onClick={() => setConfUm(dia)} title="Remove TODAS as pessoas deste ciclo (ficam aguardando). O ciclo continua aberto e as datas do calendário dele permanecem.">Esvaziar</button>
              {podeImportar && <BotaoSec mini onClick={() => { setImportErro(null); setImportDia(dia); }} title="Sobe uma planilha de clientes direto para este ciclo — as datas do calendário dele permanecem."><IcT d={IC_PATH.importar} />Importar</BotaoSec>}
            </span>
            <span className="fin-ciclo-acoes cic-seta" aria-hidden><IcT d="m9 18 6-6-6-6" s={16} mr={0} /></span>
          </div>
        ) : (
          <div className="fin-ciclo-row" key={dia} style={{ opacity: 0.8 }}>
            <span className="cm-ciclo-cod">D{d2(dia)}</span>
            <div className="fin-ciclo-info"><b>vence dia {d2(dia)}</b><span>{novosPorDia(dia) > 0 ? `${novosPorDia(dia)} novo${novosPorDia(dia) === 1 ? '' : 's'} vence${novosPorDia(dia) === 1 ? '' : 'm'} aqui — ninguém em cobrança` : 'vazio — direcione ou mova clientes para cá'}</span></div>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              <BotaoSec mini onClick={() => aoFecharDia(dia)} title="Retira este dia da lista de abertos (os clientes que vencem nele não mudam).">Fechar ciclo</BotaoSec>
              {podeImportar && <BotaoSec mini onClick={() => { setImportErro(null); setImportDia(dia); }} title="Sobe uma planilha de clientes direto para este ciclo — as datas do calendário dele permanecem."><IcT d={IC_PATH.importar} />Importar</BotaoSec>}
            </span>
          </div>
        ))}
        {itens.length === 0 && <div className="fin-vazio">Nenhum ciclo — abra um dia aqui ou cadastre leads na Gestão.</div>}
      </div>
      {abrindo && (
        <ModalV2 aberto aoFechar={() => setAbrindo(false)} largura={360}
          titulo={<div>Abrir ciclo<div className="mod-sub">Escolha o dia do mês — o ciclo nasce vazio, pronto para receber clientes.</div></div>}
          rodape={<><BotaoSec onClick={() => setAbrindo(false)}>Cancelar</BotaoSec><BotaoPrimario disabled={selAbrir == null} onClick={() => { if (selAbrir != null) { aoAbrir(selAbrir); setAbrindo(false); } }}>{selAbrir != null ? `Abrir dia ${d2(selAbrir)}` : 'Escolha um dia'}</BotaoPrimario></>}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
            {Array.from({ length: 31 }, (_, k) => k + 1).map((dd0) => (
              <button type="button" key={dd0} className="cm-cli-filtro-btn" disabled={ocupados.has(dd0)} onClick={() => setSelAbrir(dd0)}
                title={ocupados.has(dd0) ? 'Esse dia já existe' : undefined}
                style={{ padding: '9px 0', opacity: ocupados.has(dd0) ? 0.35 : 1, fontWeight: dd0 === selAbrir ? 700 : 500, ...(dd0 === selAbrir ? { boxShadow: 'inset 0 0 0 2px #c9a227' } : {}) }}>{dd0}</button>
            ))}
          </div>
          <p className="cm-hint" style={{ margin: '10px 2px 0' }}>Dias apagados já existem (com gente ou já abertos).</p>
        </ModalV2>
      )}
      {turmaConfUm && (
        <ModalV2 aberto aoFechar={() => setConfUm(null)} largura={420}
          titulo={<div>Esvaziar o ciclo {turmaConfUm.codigo}?<div className="mod-sub">Remove todas as pessoas — o ciclo fica pronto para receber clientes novos.</div></div>}
          rodape={<><BotaoSec onClick={() => setConfUm(null)}>Cancelar</BotaoSec><button type="button" className="p-btn btn-perigo" disabled={salvando} onClick={() => { aoEsvaziarUm(turmaConfUm.dia); setConfUm(null); }}>{salvando ? 'Esvaziando…' : `Esvaziar ${turmaConfUm.leads.length + novosPorDia(turmaConfUm.dia)} cliente${turmaConfUm.leads.length + novosPorDia(turmaConfUm.dia) === 1 ? '' : 's'}`}</button></>}>
          <p className="cm-hint" style={{ margin: 0 }}>
            Os <b>{turmaConfUm.leads.length + novosPorDia(turmaConfUm.dia)}</b> clientes do dia {d2(turmaConfUm.dia)} ({turmaConfUm.leads.length} em cobrança{novosPorDia(turmaConfUm.dia) > 0 ? ` + ${novosPorDia(turmaConfUm.dia)} novos` : ''}) saem do ciclo e ficam
            <b> aguardando ciclo</b> — nenhum cadastro nem pagamento é apagado. O ciclo <b>D{d2(turmaConfUm.dia)} continua aberto</b> e as
            <b> datas do calendário dele permanecem</b> — basta subir ou direcionar os clientes novos para ele.
          </p>
          <p className="cm-hint" style={{ margin: '8px 0 0' }}>É possível reverter com um clique no botão <b>Desfazer</b> do topo (por 5 minutos).</p>
        </ModalV2>
      )}
      {confEsvaziar && (
        <ModalV2 aberto aoFechar={() => setConfEsvaziar(false)} largura={420}
          titulo={<div>Esvaziar todos os ciclos?<div className="mod-sub">Para reorganizar a estrutura do zero.</div></div>}
          rodape={<><BotaoSec onClick={() => setConfEsvaziar(false)}>Cancelar</BotaoSec><button type="button" className="p-btn btn-perigo" disabled={salvando} onClick={() => { aoEsvaziar(); setConfEsvaziar(false); }}>{salvando ? 'Esvaziando…' : `Esvaziar tudo (${totalComDia})`}</button></>}>
          <p className="cm-hint" style={{ margin: 0 }}>
            Todos os <b>{totalComDia}</b> clientes com dia ({totalCobranca} em cobrança + {totalNovos} novos) saem dos ciclos e ficam
            <b> aguardando ciclo</b> — nenhum cadastro nem pagamento é apagado. Depois você redistribui: abre os dias que quiser e
            direciona os clientes para eles. As datas manuais do calendário (deste mês em diante) também são limpas.
          </p>
          <p className="cm-hint" style={{ margin: '8px 0 0' }}>É possível reverter TUDO com um clique no botão <b>Desfazer</b> do topo (por 5 minutos).</p>
        </ModalV2>
      )}
      {alvo && <EditorDiaCiclo ciclo={alvo} turmas={turmas} novosPorDia={novosPorDia} datasManuaisDe={datasManuaisDe} salvando={salvando} aoMover={(de, para) => { aoMover(de, para); setEditar(null); }} aoFechar={() => setEditar(null)} />}
      {importDia != null && <ImportarCiclo situacao="cancelado" diaFixo={importDia} ocupado={importando}
        erroExterno={importErro?.dia === importDia ? importErro.msg : undefined}
        aoImportar={({ r }) => {
          const diaAlvo = importDia; setImportErro(null);
          aoImportarUm(diaAlvo, r, (ok, msg) => {
            // fechamento condicional AO DIA: se o usuário abriu outro ciclo nesse
            // meio-tempo, o resultado de um import antigo não fecha o modal novo
            if (ok) setImportDia((cur) => (cur === diaAlvo ? null : cur));
            else setImportErro({ dia: diaAlvo, msg: msg ?? 'Não deu certo — tente de novo.' });
          });
        }}
        aoFechar={() => setImportDia(null)} />}
    </ModalV2>
  );
}

/** exporta a base pro Excel — o contrário do importar. SEM as senhas (planilha circula fora do sistema). */
function exportarXlsx(linhas: GLinha[], comps: string[], nomeBase: string) {
  const cab = ['DATA FECHAMENTO', 'COMERCIAL', 'CLIENTE', 'NB', 'BANCO', 'CPF', 'PARCELA TOTAL', 'SALÁRIO', 'ÚLTIMO PGTO', 'DATA RECLAMAÇÃO', 'DATA QUE PAROU O DÉBITO', ...comps.map((c) => c.split('-').reverse().join('/')), 'BANCO QUE RECEBE', 'TELEFONE', 'CICLO', 'SITUAÇÃO', 'OBSERVAÇÕES'];
  const rows = linhas.map((l) => [
    l.fechamento || '', l.comercial || '', l.nome, l.nb || '', l.banco || '', l.cpf || '',
    l.valor ?? 0, l.salario ?? (l.faixa === 'ate_1sm' ? '1 SM' : l.faixa === 'acima_1sm' ? '+1 SM' : ''), l.ultimoPgto || '', l.dataReclamacao || '', l.dataParou || '',
    ...comps.map((_, k) => l.celulas[k] ?? ''),
    l.recebe || '', l.telefone || '', l.dia > 0 ? `D${d2(l.dia)}` : 'AGUARDANDO CICLO', l.situacao === 'ativo' ? (l.paradoPendente ? 'AGUARDANDO APROVAÇÃO (débito parado)' : 'NOVO (débito ativo)') : 'EM COBRANÇA', l.obs || '',
  ]);
  const ws = XLSX.utils.aoa_to_sheet([cab, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Planilha1');
  XLSX.writeFile(wb, `${nomeBase}-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/* Lixeira de clientes — blindagem: todo cliente excluído fica aqui e pode ser
   restaurado inteiro (dados + senhas + histórico de pagamentos). Só gestor/admin. */
export function LixeiraClientes({ aoFechar }: { aoAvisar: (t: string) => void; aoFechar: () => void }) {
  const q = useLixeira();
  const restaurar = useRestaurarLead();
  const itens = q.data ?? [];
  const [msg, setMsg] = useState<{ tom: 'ok' | 'erro'; txt: string } | null>(null);
  const dtBR = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  return (
    <ModalV2 aberto aoFechar={aoFechar} largura={640}
      titulo={<div>Lixeira de clientes<div className="mod-sub">Todo cliente excluído fica aqui — nada some de vez. Restaure quando quiser.</div></div>}
      rodape={<BotaoSec onClick={aoFechar}>Fechar</BotaoSec>}>
      {/* feedback DENTRO do modal (o aviso do pai fica atrás do véu) */}
      {msg && <div className="gs-aviso" role="status" style={{ marginBottom: 12, ...(msg.tom === 'ok' ? { borderColor: 'rgba(var(--verde-rgb),.4)', background: 'rgba(var(--verde-rgb),.1)' } : { borderColor: 'rgba(var(--rubro-rgb),.4)', background: 'rgba(var(--rubro-rgb),.1)' }) }}><span>{msg.txt}</span><button type="button" className="gs-aviso-x" onClick={() => setMsg(null)} aria-label="Fechar">×</button></div>}
      {isDemoMode ? (
        <EstadoVazio titulo="Lixeira (demonstração)" descricao="Nesta demonstração as exclusões não ficam registradas. No sistema real, todo cliente excluído aparece aqui com cadastro, senhas e histórico — pronto para restaurar." />
      ) : q.isLoading ? (
        <p className="cm-hint" style={{ margin: 0 }}>Carregando…</p>
      ) : q.isError ? (
        <EstadoErro titulo="Não deu para carregar a lixeira" descricao="Isto NÃO significa que a lixeira está vazia — foi uma falha ao consultar. Tente de novo." aoTentarDeNovo={() => void q.refetch()} />
      ) : itens.length === 0 ? (
        <EstadoVazio titulo="Lixeira vazia" descricao="Nenhum cliente foi excluído. Se algum for, aparece aqui para você trazer de volta." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {itens.map((it) => (
            <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 4px', borderBottom: '1px solid var(--linha)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{it.nome}</div>
                <div className="cm-hint" style={{ margin: 0 }}>
                  {(it.comercial || 'sem comercial')}{it.valor != null ? ` · R$ ${it.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : ''}{it.pagamentos_qtd > 0 ? ` · ${it.pagamentos_qtd} pagamento${it.pagamentos_qtd === 1 ? '' : 's'}` : ''}
                </div>
                <div className="cm-hint num" style={{ margin: 0, fontSize: 11 }}>Excluído em {dtBR(it.deletado_em)} por {it.deletado_por}</div>
              </div>
              <BotaoPrimario onClick={() => { setMsg(null); restaurar.mutate(it.id, {
                onSuccess: () => setMsg({ tom: 'ok', txt: `Cliente "${it.nome}" restaurado — voltou com o histórico completo.` }),
                onError: (e) => setMsg({ tom: 'erro', txt: (e as Error).message }),
              }); }} disabled={restaurar.isPending}>Restaurar</BotaoPrimario>
            </div>
          ))}
        </div>
      )}
      <p className="cm-hint" style={{ margin: '12px 0 0' }}>Restaurar traz o cliente de volta com o cadastro, as senhas, o histórico de pagamentos e os vínculos (financeiro, conversas, régua) exatamente como estavam.</p>
    </ModalV2>
  );
}

/* próximo mês da grade = mês seguinte ao último (ou o mês corrente, se vazia) — YYYY-MM */
function proximoMes(comps: string[]): string {
  const base = comps.length ? comps[comps.length - 1] : new Date().toISOString().slice(0, 7);
  const [y, m] = base.split('-').map(Number);
  const d = new Date(y, m, 1); // m é 1-based → new Date(y, m, 1) já é o mês seguinte
  return `${d.getFullYear()}-${d2(d.getMonth() + 1)}`;
}

export function AbaPlanilha({ gestor, papel }: { demo: boolean; gestor: boolean; papel?: Papel }) {
  // dados via camada de dados (demo=localStorage, real=Supabase); toda escrita vira mutation
  const { data: dadosQ, isLoading: carregandoQ, isError: erroQ, refetch } = useDadosCobranca();
  const comps = dadosQ?.comps ?? [];
  const linhas = dadosQ?.linhas ?? [];
  // capacidades espelhando o RLS do banco: comercial cadastra/edita/lança;
  // financeiro marca célula; gestor/admin tudo; cadastro edita ficha e DIRECIONA ciclo
  const podeOperar = gestor || papel === 'comercial' || papel === 'cadastro' || papel === 'financeiro';
  // marcar pago / editar valor na grade: gestor/financeiro (todos) e comercial (os clientes DELE;
  // a RPC marcar_celula + RLS limitam o comercial ao próprio cliente). Dono 15/09.
  const podeCelula = gestor || papel === 'financeiro' || papel === 'comercial';
  // senhas VISÍVEIS na grade (dono 17/09: "sem pontinhos") — 1 chamada auditada;
  // o banco já limita o comercial às senhas dos clientes DELE
  const podeRevelarGrade = usePapel().data?.podeRevelar ?? false;
  const senhasGrade = useSenhasGrade(podeRevelarGrade).data;
  // direcionar pro ciclo é do ADMIN da operação (gestor/cadastro), não do comercial (regra do dono 11/09)
  const podeDirecionar = gestor || papel === 'cadastro' || papel === 'financeiro';
  const podeLancar = gestor || papel === 'comercial'; // lançar pagamento não é tarefa do cadastro
  const criarMut = useCriarLead();
  const editarMut = useEditarLead();
  const excluirMut = useExcluirLead();
  const lancarMut = useLancarPagamento();
  const celulaMut = useMarcarCelula();
  const naoPagouMut = useMarcarNaoPagou();
  const limparMut = useLimparCelula();
  const turmaMut = useMoverTurma();
  const abrirCicloMut = useAbrirCiclo();
  const fecharCicloMut = useFecharCiclo();
  const esvaziarMut = useEsvaziarCiclos();
  const esvaziarUmMut = useEsvaziarCiclo();
  const importarNoMut = useImportarNoCiclo();
  const adicionarMesMut = useAdicionarMes();
  const adicionarMes = () => {
    const nv = proximoMes(comps);
    adicionarMesMut.mutate(nv, {
      onSuccess: () => setAviso(`Mês ${rotuloMesCurto(nv)} adicionado à grade.`),
      onError: (e) => setAviso(msgErro(e)),
    });
  };

  const [busca, setBusca] = useState('');
  const [fCom, setFCom] = useState('todos');
  const [fBan, setFBan] = useState('todos');
  const [ordem, setOrdem] = useState<{ id: string; dir: 1 | -1 }>({ id: 'planilha', dir: 1 }); // padrão = ordem da planilha
  const [ocultas, setOcultas] = useState<Set<string>>(new Set());
  const [larguras, setLarguras] = useState<Record<string, number>>({});
  const [expandido, setExpandido] = useState(false);
  const [painelCols, setPainelCols] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const [novo, setNovo] = useState(false);
  const [lancarOpen, setLancarOpen] = useState(false);
  const [lixeiraOpen, setLixeiraOpen] = useState(false);
  const [ciclosOpen, setCiclosOpen] = useState(false);
  const [fCiclo, setFCiclo] = useState<number | null>(null);
  const [editCel, setEditCel] = useState<{ leadId: string; k: number; x: number; y: number } | null>(null);
  const [celVal, setCelVal] = useState('');
  const [celComp, setCelComp] = useState<{ nome: string; url: string } | null>(null);
  const [aviso, setAviso] = useState('');
  const selL = linhas.find((l) => l.id === sel) ?? null;
  const rotMes = (comp: string) => rotuloMesCurto(comp);
  const turmas = useMemo<CicloTurma[]>(() => {
    const map = new Map<number, GLinha[]>();
    // só EM COBRANÇA (cancelado): o chip tem que bater com a lista/filtro abaixo,
    // que também é emCobranca. Novos (ativo) não entram na contagem do ciclo.
    for (const l of linhas) { if (!l.dia || l.situacao !== 'cancelado') continue; const a = map.get(l.dia) ?? []; a.push(l); map.set(l.dia, a); }
    return [...map.entries()].map(([dia, leads]) => {
      const freq = new Map<number, number>(); for (const l of leads) freq.set(l.valor, (freq.get(l.valor) ?? 0) + 1);
      const base = [...freq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
      const seguem = leads.filter((l) => l.valor === base).length;
      return { dia, codigo: `D${d2(dia)}`, leads: [...leads].sort((a, b) => a.nome.localeCompare(b.nome)), base, seguem, excecoes: leads.length - seguem, ativos: leads.filter((l) => l.situacao === 'ativo').length, soma: leads.reduce((s, l) => s + l.valor, 0) };
    }).sort((a, b) => a.dia - b.dia);
  }, [linhas]);
  // dias abertos à mão (ciclo pode existir VAZIO — dono 17/09 "como eu abro o dia 6?")
  const ciclosAbertos = useMemo(() => dadosQ?.ciclosAbertos ?? [], [dadosQ]);
  const ciclosVazios = useMemo(() => ciclosAbertos.filter((dd0) => !turmas.some((t) => t.dia === dd0)).sort((a, b) => a - b), [ciclosAbertos, turmas]);
  // ORDEM ARRASTÁVEL (dono 17/09 "tem que dar pra arrastar pra organizar"):
  // a ordem salva vale pra equipe toda; dia fora da lista vai pro fim (por dia).
  const ordemSalva = useMemo(() => dadosQ?.ciclosOrdem ?? [], [dadosQ]);
  const ordemMut = useSalvarOrdemCiclos();
  const [dragDia, setDragDia] = useState<number | null>(null);
  const [ordemPreview, setOrdemPreview] = useState<number[] | null>(null);
  const arrastouRef = useRef(false);
  const podeOrdenar = gestor || papel === 'financeiro';
  const posDe = (dia: number) => { const base = ordemPreview ?? ordemSalva; const i = base.indexOf(dia); return i === -1 ? 1000 + dia : i; };
  // lista ÚNICA de chips (turmas + abertos vazios), na ordem escolhida
  const chipsCiclos = useMemo(() => {
    const itens: { dia: number; t?: CicloTurma }[] = [
      ...turmas.map((t) => ({ dia: t.dia, t: t as CicloTurma | undefined })),
      ...ciclosVazios.map((dd0) => ({ dia: dd0, t: undefined })),
    ];
    const base = ordemPreview ?? ordemSalva;
    const pos = (dia: number) => { const i = base.indexOf(dia); return i === -1 ? 1000 + dia : i; };
    return itens.sort((a, b) => pos(a.dia) - pos(b.dia));
  }, [turmas, ciclosVazios, ordemSalva, ordemPreview]);
  const ordemInicialRef = useRef<string>('');
  const iniciarArrasto = (dia: number) => {
    if (!podeOrdenar) return;
    arrastouRef.current = false;
    ordemInicialRef.current = chipsCiclos.map((c) => c.dia).join(',');
    setDragDia(dia);
    setOrdemPreview(chipsCiclos.map((c) => c.dia));
  };
  const arrastarSobre = (dia: number) => {
    if (dragDia == null || dia === dragDia) return;
    arrastouRef.current = true;
    setOrdemPreview((prev) => {
      const base = prev ?? chipsCiclos.map((c) => c.dia);
      const de = base.indexOf(dragDia); const para = base.indexOf(dia);
      if (de === -1 || para === -1) return prev;
      const lista = base.filter((d) => d !== dragDia);
      const idxAlvo = lista.indexOf(dia);
      // indo pra DIREITA entra DEPOIS do alvo; pra esquerda, ANTES (senão o
      // arrasto pro vizinho da direita caía na própria posição = não mexia)
      lista.splice(de < para ? idxAlvo + 1 : idxAlvo, 0, dragDia);
      return lista;
    });
  };
  useEffect(() => {
    if (dragDia == null) return;
    const soltar = () => {
      setDragDia(null);
      const mudou = arrastouRef.current && ordemPreview && ordemPreview.join(',') !== ordemInicialRef.current;
      if (mudou && ordemPreview) {
        ordemMut.mutate(ordemPreview, { onError: (e) => { setOrdemPreview(null); setAviso(msgErro(e)); } });
        // mantém o preview até o refetch trazer a ordem salva (sem "pulo" visual)
      } else {
        setOrdemPreview(null); // sem mudança real: nada a salvar, nada a desfazer
      }
    };
    window.addEventListener('pointerup', soltar);
    return () => window.removeEventListener('pointerup', soltar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragDia, ordemPreview]);
  useEffect(() => { setOrdemPreview(null); }, [ordemSalva]); // ordem salva chegou → preview cumpriu o papel
  // CLAMP derivado (rastreio 17/09): se o filtro aponta pra um dia que ficou sem
  // turma (Desfazer, move de outra sessão), cai em "Todos" sozinho — a grade
  // nunca fica presa vazia sem nenhum chip aceso. Dia ABERTO vazio é válido.
  const fCicloAtivo = fCiclo != null && (turmas.some((t) => t.dia === fCiclo) || ciclosAbertos.includes(fCiclo)) ? fCiclo : null;
  // mudar o dia de um ciclo = mover a TURMA inteira (todos os leads daquele dia)
  // pro novo dia. Muda a Gestão (vencimento de cada cliente) E os disparos (o motor
  // casa por dia). Dono 16/09: "atualiza tudo referente àquele ciclo, as pessoas dentro dele".
  const aplicarMover = (diaDe: number, diaPara: number) => {
    if (diaDe === diaPara) return;
    turmaMut.mutate({ diaDe, diaPara }, {
      // não força o filtro pro novo dia: o chip/banner já confirmam, e assim o
      // Desfazer não deixa a grade travada num ciclo que ficou vazio.
      onSuccess: (res) => {
        setFCiclo((f) => (f === diaDe ? diaPara : f));
        const extra = res.origemDatas.length ? ` As ${res.origemDatas.length} data(s) manual(is) do calendário do dia antigo voltaram ao automático (o Desfazer as repõe).` : '';
        setAviso(`Ciclo movido para o dia ${d2(diaPara)} — todos os clientes agora vencem no dia ${d2(diaPara)} (Gestão e disparos atualizados).${extra}`);
      },
      onError: (e) => setAviso(msgErro(e)),
    });
  };

  const cols: PlCol[] = useMemo(() => [
    { id: 'cliente', rot: 'Cliente', w: 210, fix: true, ord: true },
    { id: 'comercial', rot: 'Comercial', w: 108, ord: true },
    { id: 'venc', rot: 'Vencimento', w: 104, ord: true },
    { id: 'banco', rot: 'Banco', w: 106, ord: true },
    { id: 'nb', rot: 'NB', w: 120 },
    { id: 'cpf', rot: 'CPF', w: 128 },
    { id: 'senha', rot: 'Senhas', w: 138, sensivel: true },
    { id: 'valor', rot: 'Parcela total', w: 116, num: true, ord: true },
    { id: 'mensal', rot: 'Parcela mensal', w: 132, num: true },
    { id: 'fechamento', rot: 'Fechamento', w: 104, ord: true },
    { id: 'reclamacao', rot: 'Reclamação', w: 104, num: true },
    { id: 'parada', rot: 'Parou em', w: 104, num: true },
    ...comps.map((c) => ({ id: `c:${c}`, rot: rotuloMesCurto(c), w: 78, comp: c })),
    { id: 'totalpago', rot: 'Total pago', w: 122, num: true, ord: true },
    { id: 'telefone', rot: 'Telefone', w: 130, num: true },
  ], [comps]);
  const colW = (c: PlCol) => larguras[c.id] ?? c.w;

  // dedupe por caixa ('EMILLYN' e 'emillyn' = uma pessoa); o filtro casa normalizado
  const comerciais = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of linhas) { const n = (l.comercial || '').trim(); if (n && !m.has(n.toUpperCase())) m.set(n.toUpperCase(), n); }
    return [...m.values()].sort();
  }, [linhas]);
  const bancos = useMemo(() => [...new Set(linhas.map((l) => l.banco).filter(Boolean))].sort(), [linhas]);
  // Gestão de cobranças = clientes cujo débito já foi CANCELADO (subiram dos "Novos")
  const emCobranca = useMemo(() => linhas.filter((l) => l.situacao === 'cancelado'), [linhas]);
  // subiram dos Novos mas ainda SEM ciclo — o direcionamento é um comando manual (regra do dono)
  const aguardando = useMemo(() => emCobranca.filter((l) => !l.dia), [emCobranca]);
  const [dirOpen, setDirOpen] = useState(false);
  const [dirDias, setDirDias] = useState<Record<string, number>>({});
  // próxima data de cobrança do ciclo — a MESMA conta dos painéis (desloca fds/
  // feriado E respeita a data manual do Calendário; módulo cicloCalendario)
  const proximaDoCiclo = (dia: number) => proximaCobrancaDoCiclo(dia, dadosQ?.ciclosDatas);
  const direcionar = (l: GLinha, dia: number) => {
    if (!(dia >= 1 && dia <= 31)) return;
    editarMut.mutate({ id: l.id, patch: { dia } }, {
      onSuccess: () => setAviso(`${l.nome}: direcionado pro ciclo D${d2(dia)} — próxima cobrança ${dataBRcurta(proximaDoCiclo(dia))}.`),
      onError: (e) => setAviso(msgErro(e)),
    });
  };
  // marcou "parado" errado? devolve pros Novos (débito volta a ATIVO, data de parada limpa)
  const voltarNovos = (l: GLinha) => {
    editarMut.mutate({ id: l.id, patch: { situacao: 'ativo', dataParou: '' } }, {
      onSuccess: () => setAviso(`${l.nome}: voltou pros Novos — débito segue ativo.`),
      onError: (e) => setAviso(msgErro(e)),
    });
  };
  // modo REAL: só dias que existem na base (a semente fixa da demo criava
  // ciclos-fantasma nos selects depois de um mover); demo mantém a semente.
  const ciclosDisp = useMemo(() => { const s = new Set<number>(isRevizaMode ? [] : Object.values(CICLO_DIA)); for (const l of linhas) if (l.dia > 0) s.add(l.dia); for (const dd0 of dadosQ?.ciclosAbertos ?? []) s.add(dd0); return [...s].sort((a, b) => a - b); }, [linhas, dadosQ]);

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const r = emCobranca.filter((l) =>
      (!q || l.nome.toLowerCase().includes(q) || l.nb.toLowerCase().includes(q)) &&
      (fCom === 'todos' || (l.comercial || '').trim().toUpperCase() === fCom.trim().toUpperCase()) &&
      (fBan === 'todos' || l.banco === fBan) &&
      (fCicloAtivo == null || l.dia === fCicloAtivo));
    if (ordem.id === 'planilha') return r; // ordem da planilha = ordem de importação (não re-ordena)
    const dir = ordem.dir;
    const chave = (l: GLinha): string | number => {
      switch (ordem.id) {
        case 'comercial': return l.comercial;
        case 'venc': return l.dia;
        case 'banco': return l.banco;
        case 'valor': return l.valor;
        case 'mensal': return l.valor / 2;
        case 'fechamento': return l.fechamento;
        case 'totalpago': return totalPagoDe(l);
        default: return l.nome;
      }
    };
    return [...r].sort((a, b) => { const ka = chave(a) as unknown as number, kb = chave(b) as unknown as number; return ka < kb ? -dir : ka > kb ? dir : 0; });
  }, [emCobranca, busca, fCom, fBan, fCicloAtivo, ordem]);

  const clicarOrd = (c: PlCol) => { if (!c.ord) return; setOrdem((o) => o.id === c.id ? { id: c.id, dir: (o.dir * -1) as 1 | -1 } : { id: c.id, dir: 1 }); };
  const iniciarResize = (c: PlCol, e: ReactMouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    const x0 = e.clientX; const w0 = colW(c);
    const mover = (ev: MouseEvent) => setLarguras((l) => ({ ...l, [c.id]: Math.max(56, w0 + (ev.clientX - x0)) }));
    const soltar = () => { window.removeEventListener('mousemove', mover); window.removeEventListener('mouseup', soltar); };
    window.addEventListener('mousemove', mover); window.addEventListener('mouseup', soltar);
  };

  const abrirCel = (l: GLinha, k: number, e: ReactMouseEvent) => {
    const atual = l.celulas[k] ?? '-';
    const num = Number(atual);
    setCelVal(isFinite(num) && atual !== '-' && atual !== '' ? String(num) : String(Math.round(l.valor)));
    setCelComp(null);
    const larguraJanela = typeof window !== 'undefined' ? window.innerWidth : 1200;
    setEditCel({ leadId: l.id, k, x: Math.min(e.clientX, larguraJanela - 268), y: e.clientY + 8 });
  };
  const celula = (c: PlCol, l: GLinha) => {
    if (c.comp) {
      const k = comps.indexOf(c.comp);
      const raw = l.celulas[k] ?? '-';
      return podeCelula
        ? <button type="button" className="pl-cel-btn" title="Clique para marcar pago / editar o valor" onClick={(e) => abrirCel(l, k, e)}><Celula raw={raw} /></button>
        : <Celula raw={raw} />;
    }
    switch (c.id) {
      case 'cliente': return <button type="button" className="pl-nome" onClick={() => setSel(l.id)}>{l.nome || '(sem nome)'}</button>;
      case 'comercial': return l.comercial || '—';
      case 'venc': return l.dia > 0 ? <span className="num">dia {diaBR(l.dia)}</span> : <span style={{ color: 'var(--ambar)', fontSize: 11.5, fontWeight: 600 }}>aguardando</span>;
      case 'banco': return l.banco || '—';
      case 'nb': return <span className="num">{l.nb || '—'}</span>;
      case 'cpf': return <span className="num">{mascCpf(l.cpf)}</span>;
      case 'senha': {
        // dono 17/09: senha VISÍVEL na grade (sem pontinhos). Real: senhasGrade
        // (1 chamada auditada; comercial só vê as dos clientes dele — o banco corta).
        // Demo: direto do blob. Sem permissão de revelar → segue o cadeado.
        const sg = senhasGrade?.get(l.id);
        const sInss = (sg?.inss || l.senha || '').trim();
        const sRecl = (sg?.reclame || l.reclameSenha || '').trim();
        if (!podeRevelarGrade) return <span className="pl-senha" title="Sem permissão para ver as senhas">•••••• <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg></span>;
        if (!sInss && !sRecl) return <span style={{ opacity: 0.55 }}>—</span>;
        return (
          <span className="num" style={{ display: 'inline-block', fontSize: 11, lineHeight: 1.3, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            title={`INSS: ${sInss || '—'} · Reclame: ${sRecl || '—'}`}>
            {sInss || '—'}<br />{sRecl || '—'}
          </span>
        );
      }
      case 'valor': return <span className="num">{fmtBRL(l.valor)}</span>;
      case 'mensal': return <span className="num" title="Meia parcela (metade da parcela total)">{fmtBRL(l.valor / 2)}</span>;
      case 'fechamento': return <span className="num">{l.fechamento ? dataBRcurta(l.fechamento) : '—'}</span>;
      case 'reclamacao': return <span className="num">{l.dataReclamacao ? dataBRcurta(l.dataReclamacao) : '—'}</span>;
      case 'parada': return <span className="num">{l.dataParou ? dataBRcurta(l.dataParou) : '—'}</span>;
      case 'totalpago': { const t = totalPagoDe(l); return <span className="num fin-verde">{t ? fmtBRL(t) : '—'}</span>; }
      case 'telefone': return l.telefone ? <span className="num">{l.telefone}</span> : <span style={{ color: 'var(--ambar)' }}>sem tel.</span>;
      default: return null;
    }
  };

  const visCols = cols.filter((c) => !ocultas.has(c.id));

  // edições e cadastro do comercial aplicam DIRETO (a aprovação é só da entrada de valor)
  const salvarLead = (l: GLinha, tocados?: (keyof GLinha)[]) => {
    // SÓ grava os campos que o usuário TOCOU na ficha (rastreio 17/09): mandar o
    // objeto inteiro regravava dia/valor velhos por cima de um "mover ciclo" (ou
    // de edição de outra sessão) — last-write-wins silencioso.
    // `if (tocados)` e NÃO `tocados.length`: lista VAZIA = não mexeu em nada =
    // patch vazio (o fallback objeto-inteiro é só pra chamada antiga sem lista).
    const patch: Partial<GLinha> = {};
    if (tocados) {
      for (const k of tocados) (patch as Record<string, unknown>)[k] = (l as unknown as Record<string, unknown>)[k];
    } else {
      Object.assign(patch, l);
    }
    // senha vazia = "não mexi" (nunca apaga senha guardada por engano)
    if (!patch.senha) delete patch.senha;
    if (!patch.reclameSenha) delete patch.reclameSenha;
    // no REAL as células persistem pelas RPCs abaixo; 'celulas' no patch viraria
    // um editarLead no-op que ainda registrava um Desfazer falso no slot
    if (!isDemoMode) delete patch.celulas;
    // grade mês a mês da ficha: cada célula ALTERADA vira a operação própria
    // (no real persiste via RPC; no demo o patch inteiro já cobre — resultado igual)
    const antes = linhas.find((x) => x.id === l.id);
    if (antes && podeCelula && (!tocados || tocados.includes('celulas'))) l.celulas.forEach((raw, k) => {
      if ((antes.celulas[k] ?? '-') === (raw ?? '-')) return;
      const comp = comps[k]; if (!comp) return;
      const n = Number(String(raw).replace(',', '.'));   // aceita vírgula; centavos preservados (banco é numeric 12,2)
      if (raw !== '-' && raw !== '' && isFinite(n)) celulaMut.mutate({ leadId: l.id, comp, valor: Math.round(n * 100) / 100 }, { onError: (e) => setAviso(msgErro(e)) });
      else if (/n[aã]o\s*pagou/i.test(String(raw))) naoPagouMut.mutate({ leadId: l.id, comp }, { onError: (e) => setAviso(msgErro(e)) });
      else if (gestor && (raw === '-' || raw === '')) limparMut.mutate({ leadId: l.id, comp }, { onError: (e) => setAviso(msgErro(e)) });
      // texto livre (datas/observações importadas) fica só no demo, via patch
    });
    if (!Object.keys(patch).length) { setSel(null); return; } // nada tocado além da grade
    editarMut.mutate({ id: l.id, patch }, { onSuccess: () => setSel(null), onError: (e) => setAviso(msgErro(e)) });
  };
  const criarLead = (l0: GLinha) => {
    criarMut.mutate({ ...l0 }, {
      onSuccess: (novoL) => {
        setNovo(false); enviarPraPlanilha(l0);
        // células digitadas na grade da ficha do CADASTRO: no real elas não vão
        // no insert (pagamentos são outra tabela) — replay via RPC, igual à edição
        if (podeCelula) l0.celulas.forEach((raw, k) => {
          const comp = comps[k]; if (!comp) return;
          const s = String(raw ?? '').trim(); if (s === '' || s === '-') return;
          const n = Number(s.replace(',', '.'));
          if (isFinite(n) && n > 0) celulaMut.mutate({ leadId: novoL.id, comp, valor: Math.round(n * 100) / 100 }, { onError: (e) => setAviso(msgErro(e)) });
          else if (/n[aã]o\s*pagou/i.test(s)) naoPagouMut.mutate({ leadId: novoL.id, comp }, { onError: (e) => setAviso(msgErro(e)) });
        });
      },
      onError: (e) => setAviso(msgErro(e)),
    });
  };
  const excluirLead = (id: string) => { excluirMut.mutate(id, { onSuccess: () => setSel(null), onError: (e) => setAviso(msgErro(e)) }); };
  // entrada de valor: comercial lança → fica pendente até o financeiro confirmar que caiu na conta
  const lancarPagamento = (leadId: string, comp: string, valor: number, comprovante?: { nome: string; url: string }) => {
    const l = linhas.find((x) => x.id === leadId); if (!l) return;
    lancarMut.mutate({ leadId, comp, valor, comprovante }, {
      onSuccess: () => {
        setAviso(`Pagamento de ${fmtBRL(valor)} de ${l.nome} (${rotMes(comp)})${comprovante ? ' com comprovante' : ''} enviado ao financeiro (aba Financeiro) para confirmar se caiu na conta.`);
        setLancarOpen(false);
      },
      onError: (e) => setAviso(msgErro(e)),
    });
  };
  // importar DENTRO de um ciclo (o botão fica no Gerenciar Ciclos, por ciclo — dono 17/09)
  const importarNoCiclo = (dia: number, r: Leitura, fim: (ok: boolean, erro?: string) => void) => {
    importarNoMut.mutate({ linhas: r.linhas, comps: r.comps, situacao: 'cancelado', dia }, {
      onSuccess: (res) => { setAviso(`${res.leads} cliente${res.leads === 1 ? '' : 's'} importado${res.leads === 1 ? '' : 's'} em cobrança no ciclo D${d2(dia)}.${res.celulasIgnoradas ? ` ⚠ ${res.celulasIgnoradas} célula(s) com valor não reconhecido foram ignoradas — confira a planilha.` : ''}`); fim(true); },
      onError: (e) => { setAviso(msgErro(e)); fim(false, msgErro(e)); },
    });
  };

  if (carregandoQ) return <div className="fin-vazio">Carregando a gestão de cobranças…</div>;
  if (erroQ) return <CardVidro spot><EstadoVazio titulo="Não foi possível carregar" descricao="Verifique a conexão e tente novamente." acao={{ rotulo: 'Tentar de novo', onClick: () => { void refetch(); } }} /></CardVidro>;
  return (
    <div className={expandido ? 'pl-raiz expandido' : 'pl-raiz'}>
      {aviso && <div className="gs-aviso" role="status"><span>{aviso}</span><button type="button" className="gs-aviso-x" onClick={() => setAviso('')} aria-label="Fechar">×</button></div>}
      <div className="pl-toolbar sobe">
        <input className="inp pl-busca" placeholder="Buscar por nome ou NB…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <select className="inp pl-sel" value={fCom} onChange={(e) => setFCom(e.target.value)}><option value="todos">Comercial: todos</option>{comerciais.map((a) => <option key={a} value={a}>{a}</option>)}</select>
        <select className="inp pl-sel" value={fBan} onChange={(e) => setFBan(e.target.value)}><option value="todos">Banco: todos</option>{bancos.map((b) => <option key={b} value={b}>{b}</option>)}</select>
        <select className="inp pl-sel" value={ordem.id} onChange={(e) => setOrdem({ id: e.target.value, dir: 1 })} title="Ordem da lista">
          <option value="planilha">Ordem: planilha</option>
          <option value="cliente">Ordem: A–Z (nome)</option>
          <option value="venc">Ordem: ciclo (vencimento)</option>
          <option value="valor">Ordem: parcela</option>
          <option value="totalpago">Ordem: total pago</option>
          <option value="comercial">Ordem: comercial</option>
        </select>
        {gestor && emCobranca.length > 0 && <BotaoSec mini onClick={() => exportarXlsx(emCobranca, comps, 'gestao-cobrancas')}>Exportar planilha</BotaoSec>}
        {gestor && <BotaoSec mini onClick={() => setLixeiraOpen(true)}><IcT d={IC_PATH.girar} />Lixeira</BotaoSec>}
        {podeCelula && <BotaoSec mini onClick={adicionarMes} disabled={adicionarMesMut.isPending} title="Abre a coluna do próximo mês na grade">{adicionarMesMut.isPending ? 'Adicionando…' : `＋ Adicionar mês (${rotuloMesCurto(proximoMes(comps))})`}</BotaoSec>}
        {/* criar DIRETO em cobrança = já aprovado → só quem aprova (financeiro/cadastro/admin).
            O comercial cadastra nos Novos e marca "débito parado" (dono 24/09). */}
        {podeDirecionar && <BotaoPrimario onClick={() => setNovo(true)}><IcT d={IC_PATH.mais} s={14} />Novo lead</BotaoPrimario>}
        {podeLancar && <BotaoSec mini onClick={() => setLancarOpen(true)}><IcT d={IC_PATH.pagamento} />Lançar pagamento</BotaoSec>}
        <div className="pl-cols-wrap">
          <BotaoSec mini onClick={() => setPainelCols((v) => !v)}>Colunas ▾</BotaoSec>
          {painelCols && (
            <div className="pl-cols-pop">
              {cols.filter((c) => !c.fix).map((c) => (
                <label key={c.id} className="pl-cols-item"><input type="checkbox" checked={!ocultas.has(c.id)} onChange={(e) => setOcultas((s) => { const n = new Set(s); if (e.target.checked) n.delete(c.id); else n.add(c.id); return n; })} /> {c.rot}</label>
              ))}
            </div>
          )}
        </div>
        <BotaoSec mini onClick={() => setExpandido((v) => !v)}>{expandido ? 'Recolher' : 'Expandir'}</BotaoSec>
        <span className="pl-count num">{emCobranca.length} em cobrança{visiveis.length !== emCobranca.length ? ` · ${visiveis.length} no filtro` : ''}</span>
      </div>

      {aguardando.length > 0 && podeDirecionar && (
        <button type="button" className="cm-avisonum sobe" onClick={() => setDirOpen(true)}>
          <span className="cm-avisonum-ic" aria-hidden><IcAtencao /></span>
          <span><b>{aguardando.length} cliente{aguardando.length === 1 ? '' : 's'}</b> aguardando direcionamento de ciclo — o débito parou, mas ainda não {aguardando.length === 1 ? 'entrou' : 'entraram'} em nenhum ciclo de cobrança.</span>
          <span className="cm-avisonum-cta">Direcionar</span>
        </button>
      )}

      <div className="fin-ciclos-strip sobe" style={{ animationDelay: '.04s' }}>
        <span className="cm-filtro-eixo">Ciclos</span>
        <button type="button" className={fCicloAtivo == null ? 'cm-cli-filtro-btn on' : 'cm-cli-filtro-btn'} onClick={() => setFCiclo(null)}>Todos</button>
        {chipsCiclos.map(({ dia, t }) => (
          <button type="button" key={dia}
            className={fCicloAtivo === dia ? 'cm-cli-filtro-btn on' : 'cm-cli-filtro-btn'}
            style={{
              ...(t ? {} : { opacity: 0.65 }),
              ...(podeOrdenar ? { cursor: dragDia != null ? 'grabbing' : 'grab', touchAction: 'none', userSelect: 'none' } : {}),
              ...(dragDia === dia ? { opacity: 0.45, outline: '1px dashed #c9a227' } : {}),
            }}
            onPointerDown={(e) => { if (e.button === 0) iniciarArrasto(dia); }}
            onPointerEnter={() => arrastarSobre(dia)}
            onClick={() => { if (arrastouRef.current) { arrastouRef.current = false; return; } setFCiclo(fCicloAtivo === dia ? null : dia); }}
            title={t
              ? `vence dia ${d2(dia)} · turma ${fmtBRL(t.base)}${podeOrdenar ? ' — arraste pra organizar' : ''}`
              : `Ciclo aberto — vazio; direcione clientes pro dia ${d2(dia)}${podeOrdenar ? ' — arraste pra organizar' : ''}`}>
            {t ? `${t.codigo} · ${t.leads.length}` : `D${d2(dia)} · 0`}
          </button>
        ))}
        {(gestor || papel === 'financeiro') && <button type="button" className="cm-cli-filtro-btn" onClick={() => setCiclosOpen(true)}><IcT d={IC_PATH.ajustes} s={12} />Gerenciar ciclos</button>}
      </div>

      <div className="pl-legenda">
        <span><Celula raw="120" /> pago</span>
        <span><Celula raw="2026-08-20" /> aguardando/entrada</span>
        <span><Celula raw="NÃO PAGOU" /> em aberto</span>
        <span><Celula raw="-" /> fora da régua</span>
      </div>

      <div className="pl-scroll" role="region" aria-label="Gestão de cobranças">
        <table className="pl-grade" style={{ width: visCols.reduce((s, c) => s + colW(c), 0) }}>
          <thead>
            <tr>
              {visCols.map((c) => (
                <th key={c.id} className={(c.fix ? 'pl-th pl-fix' : 'pl-th') + (c.ord ? ' pl-ord' : '')} style={{ width: colW(c), minWidth: colW(c) }} onClick={() => clicarOrd(c)}>
                  <span className="pl-th-in">{c.rot}{ordem.id === c.id && <i className="pl-seta">{ordem.dir === 1 ? '▲' : '▼'}</i>}</span>
                  <span className="pl-resize" onMouseDown={(e) => iniciarResize(c, e)} aria-hidden />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visiveis.map((l) => (
              <tr key={l.id}>
                {visCols.map((c) => (
                  <td key={c.id} className={(c.fix ? 'pl-td pl-fix' : 'pl-td') + (c.comp ? ' pl-comp' : '') + (c.num ? ' num' : '')} style={{ width: colW(c), minWidth: colW(c) }}>
                    {celula(c, l)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {visiveis.length === 0 && <div className="pl-vazio">Nenhum lead com esses filtros.</div>}
      </div>

      <ModalV2 aberto={dirOpen} aoFechar={() => setDirOpen(false)} largura={640} titulo="Direcionar para o ciclo"
        rodape={<BotaoSec onClick={() => setDirOpen(false)}>Fechar</BotaoSec>}>
        {aguardando.length === 0 ? <div className="fin-vazio">Ninguém aguardando — todos os clientes estão em um ciclo.</div> : (
          <>
            <p className="cm-hint" style={{ margin: '0 0 12px' }}>A data ao lado de cada ciclo é a <b>próxima cobrança</b> daquele ciclo (fim de semana e feriado já deslocados). Escolha vendo a data e aplique.</p>
            <div className="an-dir-lista">
              {aguardando.map((l) => {
                // clamp: dia guardado que sumiu dos ciclos (turma movida) não vale mais
                const dia = (dirDias[l.id] != null && ciclosDisp.includes(dirDias[l.id])) ? dirDias[l.id] : (ciclosDisp[0] ?? 0);
                return (
                  <div className="an-dir-row" key={l.id}>
                    <div className="an-dir-nm">{l.nome}<span className="num">{l.comercial || '—'} · parcela {fmtBRL(l.valor)}{l.dataParou ? ` · parou ${dataBRcurta(l.dataParou)}` : ''}</span></div>
                    <select className="inp" value={dia} onChange={(e) => setDirDias((m) => ({ ...m, [l.id]: Number(e.target.value) }))}>
                      {ciclosDisp.map((d) => <option key={d} value={d}>D{d2(d)} — cobra {dataBRcurta(proximaDoCiclo(d))} ({diaSemanaBR(proximaDoCiclo(d))})</option>)}
                    </select>
                    <BotaoPrimario onClick={() => direcionar(l, dia)} disabled={editarMut.isPending || !(dia >= 1)}>Aplicar</BotaoPrimario>
                    <BotaoSec mini onClick={() => voltarNovos(l)} disabled={editarMut.isPending} title="Marcou parado por engano? O cliente volta para os Novos com o débito ativo.">Voltar para Novos</BotaoSec>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </ModalV2>
      {selL && <FichaLead key={selL.id} inicial={selL} comps={comps} ciclos={ciclosDisp} comerciais={comerciais} gestor={podeOperar} podeGrade={podeCelula} podeAprovar={podeDirecionar} aoSalvar={salvarLead} aoExcluir={gestor ? () => excluirLead(selL.id) : undefined} aoVoltarNovos={podeDirecionar ? () => { voltarNovos(selL); setSel(null); } : undefined} aoFechar={() => setSel(null)} />}
      {novo && <FichaLead novo inicial={{ ...linhaVazia(comps), situacao: 'cancelado', dia: ciclosDisp[0] ?? 5 }} comps={comps} ciclos={ciclosDisp} comerciais={comerciais} gestor={podeOperar} podeGrade={podeCelula} podeAprovar={podeDirecionar} aoSalvar={criarLead} aoFechar={() => setNovo(false)} />}
      {lixeiraOpen && <LixeiraClientes aoAvisar={setAviso} aoFechar={() => setLixeiraOpen(false)} />}
      {lancarOpen && <LancarPagamento linhas={linhas} comps={comps} rotMes={rotMes} aoLancar={lancarPagamento} aoFechar={() => setLancarOpen(false)} />}
      {ciclosOpen && <GerenciarCiclos turmas={turmas} abertos={ciclosAbertos} aviso={aviso} posDe={posDe} aoMover={aplicarMover}
        podeImportar={gestor} importando={importarNoMut.isPending} aoImportarUm={importarNoCiclo}
        salvando={turmaMut.isPending || esvaziarMut.isPending || esvaziarUmMut.isPending}
        totalCobranca={linhas.filter((l) => l.dia > 0 && l.situacao === 'cancelado').length}
        totalNovos={linhas.filter((l) => l.dia > 0 && l.situacao !== 'cancelado').length}
        novosPorDia={(dia) => linhas.filter((l) => l.dia === dia && l.situacao !== 'cancelado').length}
        datasManuaisDe={(dia) => {
          const ag = new Date(); const compCorr = `${ag.getFullYear()}-${d2(ag.getMonth() + 1)}`;
          const porComp = dadosQ?.ciclosDatas?.[String(dia)] ?? {};
          return Object.entries(porComp).filter(([comp, w]) => comp >= compCorr && (w.cobranca || w.inicio || w.fim)).map(([comp]) => rotuloMesCurto(comp));
        }}
        aoAbrir={(dia) => abrirCicloMut.mutate(dia, {
          onSuccess: () => setAviso(`Ciclo D${d2(dia)} aberto (vazio) — direcione ou mova clientes pra ele.`),
          onError: (e) => setAviso(msgErro(e)),
        })}
        aoFecharDia={(dia) => fecharCicloMut.mutate(dia, {
          onSuccess: () => setAviso(`Ciclo D${d2(dia)} fechado.`),
          onError: (e) => setAviso(msgErro(e)),
        })}
        aoEsvaziarUm={(dia) => esvaziarUmMut.mutate(dia, {
          onSuccess: (res) => { setFCiclo((f) => (f === dia ? null : f)); setAviso(`Ciclo D${d2(dia)} esvaziado — ${res.afetados.length} clientes agora estão "aguardando ciclo". O ciclo continua aberto com as datas dele; o Desfazer do topo reverte.`); },
          onError: (e) => setAviso(msgErro(e)),
        })}
        aoEsvaziar={() => esvaziarMut.mutate(undefined, {
          onSuccess: (res) => { setFCiclo(null); setAviso(`Ciclos esvaziados — ${res.afetados.length} clientes agora estão "aguardando ciclo". Abra os dias que quiser e redistribua; o Desfazer do topo reverte tudo.`); },
          onError: (e) => setAviso(msgErro(e)),
        })}
        aoFechar={() => setCiclosOpen(false)} />}
      {editCel && (() => {
        const lead = linhas.find((l) => l.id === editCel.leadId); if (!lead) return null;
        const fecharPop = () => { setEditCel(null); setCelComp(null); };
        const aoFalhar = (e: unknown) => { setAviso(msgErro(e)); fecharPop(); };
        const confirmarPago = () => {
          const n = Number(celVal.replace(',', '.').replace(/[^\d.]/g, ''));
          const comp = comps[editCel.k];
          if (isFinite(n) && n > 0) celulaMut.mutate({ leadId: editCel.leadId, comp, valor: Math.round(n * 100) / 100, comprovante: celComp ?? undefined }, { onSuccess: fecharPop, onError: aoFalhar });
          else if (gestor) limparMut.mutate({ leadId: editCel.leadId, comp }, { onSuccess: fecharPop, onError: aoFalhar });
          else { setAviso('Informe um valor para marcar como pago.'); fecharPop(); }
        };
        const anexarImg = (f: File) => { if (!f.type.startsWith('image/')) return; const r = new FileReader(); r.onload = () => setCelComp({ nome: f.name, url: String(r.result) }); r.readAsDataURL(f); };
        return (
          <>
            <div className="pl-cel-bg" onClick={() => { setEditCel(null); setCelComp(null); }} />
            <div className="pl-cel-pop" style={{ left: editCel.x, top: editCel.y }}>
              <div className="pl-cel-pop-tit">{lead.nome} · {rotuloMesCurto(comps[editCel.k])}</div>
              <div className="pl-cel-pop-in"><span className="pl-cel-rs">R$</span><input className="inp" inputMode="decimal" autoFocus value={celVal} onChange={(e) => setCelVal(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') confirmarPago(); if (e.key === 'Escape') setEditCel(null); }} /></div>
              <label className="pl-cel-comp">{celComp ? <span><IcT d={IC_PATH.imagem} s={13} />{celComp.nome}</span> : <span>Anexar comprovante (imagem)</span>}<input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) anexarImg(f); }} /></label>
              <div className="pl-cel-pop-acoes">
                <button type="button" className="fin-btn fin-ok" onClick={confirmarPago}>✓ Pago</button>
                <button type="button" className="fin-btn fin-rec" onClick={() => naoPagouMut.mutate({ leadId: editCel.leadId, comp: comps[editCel.k] }, { onSuccess: fecharPop, onError: aoFalhar })}>Não pagou</button>
                {gestor && <button type="button" className="fin-btn" onClick={() => limparMut.mutate({ leadId: editCel.leadId, comp: comps[editCel.k] }, { onSuccess: fecharPop, onError: aoFalhar })}>Limpar</button>}
              </div>
            </div>
          </>
        );
      })()}
    </div>
  );
}

/* TELA "Novos": clientes que ainda NÃO pararam o desconto (débito ativo no
   benefício). Mesma base da Gestão; marcar "débito parado" tira daqui. */
export function AbaNovos({ gestor, papel }: { demo: boolean; gestor: boolean; papel?: Papel }) {
  // dados via camada de dados (demo=localStorage, real=Supabase)
  const { data: dadosQ, isLoading, isError, refetch } = useDadosCobranca();
  const comps = dadosQ?.comps ?? [];
  const linhas = dadosQ?.linhas ?? [];
  const criarMut = useCriarLead();
  const editarMut = useEditarLead();
  const celulaMut = useMarcarCelula();
  const naoPagouMut = useMarcarNaoPagou();
  const limparMut = useLimparCelula();
  const podeOperar = gestor || papel === 'comercial' || papel === 'cadastro' || papel === 'financeiro'; // espelha o RLS (mig 31: financeiro herda o cadastro)
  const podeCelula = gestor || papel === 'financeiro' || papel === 'comercial'; // grade de pagamento (comercial: só os dele, travado no back)
  // DÉBITO PARADO COM APROVAÇÃO (dono 24/09): TODOS podem marcar (vira um PEDIDO;
  // comercial só nos clientes dele — o banco garante), e só financeiro/cadastro/
  // admin APROVAM, decidindo ciclo, valor e data. Até aprovar, o cliente segue aqui.
  // Mesma lista do banco (pode_aprovar_parado, mig 52).
  const podeSolicitar = podeOperar;
  const podeAprovar = gestor || papel === 'cadastro' || papel === 'financeiro';
  const sessaoNovos = usePapel().data;
  const meuId = sessaoNovos?.id ?? null;
  const meuNome = sessaoNovos?.nome ?? undefined;
  const solicitarMut = useSolicitarParado();
  const aprovarMut = useAprovarParado();
  const recusarMut = useRecusarParado();
  const cancelarMut = useCancelarParado();
  const importarMut = useImportarCiclo();
  const excluirMut = useExcluirLead();
  const removerNovosMut = useRemoverNovos();
  const [importOpen, setImportOpen] = useState(false);
  const [busca, setBusca] = useState('');
  const [fCom, setFCom] = useState('todos');
  const [sel, setSel] = useState<string | null>(null);
  const [novo, setNovo] = useState(false);
  const [confRemover, setConfRemover] = useState<GLinha | null>(null); // remover UM (confirmação)
  const [confRemoverTodos, setConfRemoverTodos] = useState(false);     // remover TODOS
  const [aviso, setAviso] = useState('');
  const selL = linhas.find((l) => l.id === sel) ?? null;

  const ativos = linhas.filter((l) => l.situacao === 'ativo');
  const comerciais = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of linhas) { const n = (l.comercial || '').trim(); if (n && !m.has(n.toUpperCase())) m.set(n.toUpperCase(), n); }
    return [...m.values()].sort();
  }, [linhas]);
  // modo REAL: só dias que existem na base (a semente fixa da demo criava
  // ciclos-fantasma nos selects depois de um mover); demo mantém a semente.
  const ciclosDisp = useMemo(() => { const s = new Set<number>(isRevizaMode ? [] : Object.values(CICLO_DIA)); for (const l of linhas) if (l.dia > 0) s.add(l.dia); for (const dd0 of dadosQ?.ciclosAbertos ?? []) s.add(dd0); return [...s].sort((a, b) => a - b); }, [linhas, dadosQ]);
  const q = busca.trim().toLowerCase();
  const noFiltro = (l: GLinha) => (fCom === 'todos' || (l.comercial || '').trim().toUpperCase() === fCom.trim().toUpperCase()) && (!q || l.nome.toLowerCase().includes(q) || l.nb.toLowerCase().includes(q));
  // "aguardando aprovação" sai da lista normal e ganha a seção própria no topo
  const pendentes = ativos.filter((l) => l.paradoPendente);
  const normais = ativos.filter((l) => !l.paradoPendente);
  const pendentesVis = pendentes.filter(noFiltro).sort((a, b) => (a.paradoSolicitadoEm ?? '').localeCompare(b.paradoSolicitadoEm ?? ''));
  const visiveis = normais.filter(noFiltro);
  const emParcelas = ativos.reduce((s, l) => s + l.valor, 0);
  // data LOCAL (toISOString é UTC: das 21h em diante viraria amanhã em Brasília)
  const hojeIso = () => { const h = new Date(); return `${h.getFullYear()}-${d2(h.getMonth() + 1)}-${d2(h.getDate())}`; };
  const isoOuHoje = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s || '') ? s : hojeIso());

  // 1) PEDIR: só a data em que o desconto parou → vai pra aprovação
  const [pedir, setPedir] = useState<GLinha | null>(null);
  const [pedirParou, setPedirParou] = useState(hojeIso());
  const abrirPedir = (l: GLinha) => { setPedir(l); setPedirParou(isoOuHoje(l.dataParou)); };
  const confirmarPedido = () => {
    if (!pedir) return;
    const l = pedir;
    solicitarMut.mutate({ leadId: l.id, dataParou: pedirParou, quem: meuNome }, {
      onSuccess: () => {
        setPedir(null);
        setAviso(podeAprovar
          ? `${l.nome}: débito parado registrado — está em "Aguardando aprovação", logo acima. Defina o ciclo e o valor para enviar à Gestão.`
          : `${l.nome}: pedido enviado para aprovação. O financeiro, o cadastro ou o administrador definem o ciclo e o valor — você é avisado no sino.`);
      },
      // fecha o modal: o aviso aparece na página (atrás do véu ninguém via o erro)
      onError: (e) => { setPedir(null); setAviso(msgErro(e)); },
    });
  };

  // 2) APROVAR: quem aprova decide CICLO (dia), VALOR e DATA → cliente vai pra Gestão
  const [aprovar, setAprovar] = useState<GLinha | null>(null);
  const [aprDia, setAprDia] = useState<number | null>(null);
  const [aprDataCob, setAprDataCob] = useState<string | null>(null);
  const [mesIdx, setMesIdx] = useState(0);
  const [aprValorTxt, setAprValorTxt] = useState('');
  const [aprParou, setAprParou] = useState(hojeIso());
  const mesesFut = useMemo(() => { const out: string[] = []; const a = new Date(); for (let i = 0; i < 12; i++) { const mm = a.getMonth() + i; out.push(`${a.getFullYear() + Math.floor(mm / 12)}-${d2((mm % 12) + 1)}`); } return out; }, []);
  // ciclo começa SEM escolha (dono 25/09: quem aprova escolhe o ciclo — nada vem
  // pré-marcado; a tabela do INSS só SUGERE)
  const [aprOutroDia, setAprOutroDia] = useState(false);
  const abrirAprovar = (l: GLinha) => {
    setAprovar(l); setAprDia(null); setAprDataCob(null); setMesIdx(0); setAprOutroDia(false);
    setAprValorTxt(reaisTxt(l.valor)); setAprParou(isoOuHoje(l.dataParou));
  };
  const aprSugestoes = useMemo(() => (aprovar ? sugerirCiclos(aprovar.nb, faixaDe(aprovar), ciclosDisp) : []), [aprovar, ciclosDisp]);
  const aprValor = paraReais(aprValorTxt);
  const confirmarAprovacao = () => {
    if (!aprovar || !aprDia) return;
    const l = aprovar;
    const dia = aprDia;
    const valor = aprValor > 0 ? aprValor : null; // vazio = mantém a parcela do cadastro
    aprovarMut.mutate({ leadId: l.id, dia, valor, dataParou: aprParou, quem: meuNome }, {
      onSuccess: () => {
        setAprovar(null);
        setAviso(`${l.nome}: aprovado — entrou na Gestão no ciclo D${d2(dia)}${valor != null ? ` com parcela de ${fmtBRL(valor)}` : ''}. É possível reverter no Desfazer.`);
        if (l.cpf) enviarPraPlanilha({ ...l, situacao: 'cancelado', dataParou: aprParou, dia, valor: valor ?? l.valor }); // espelha na planilha (dedup por CPF)
      },
      onError: (e) => { setAprovar(null); setAviso(msgErro(e)); },
    });
  };

  // 3) RECUSAR: volta a ser Novo normal (débito ativo); quem pediu é avisado
  const [recusar, setRecusar] = useState<GLinha | null>(null);
  const [recMotivo, setRecMotivo] = useState('');
  const confirmarRecusa = () => {
    if (!recusar) return;
    const l = recusar;
    recusarMut.mutate({ leadId: l.id, motivo: recMotivo.trim() || undefined }, {
      onSuccess: () => { setRecusar(null); setRecMotivo(''); setAviso(`${l.nome}: pedido recusado — continua nos Novos com o débito ativo.`); },
      onError: (e) => { setRecusar(null); setAviso(msgErro(e)); },
    });
  };
  // 4) CANCELAR o próprio pedido (quem pediu)
  const cancelarPedido = (l: GLinha) => {
    cancelarMut.mutate({ leadId: l.id }, {
      onSuccess: () => setAviso(`${l.nome}: pedido cancelado — voltou para a lista de Novos.`),
      onError: (e) => setAviso(msgErro(e)),
    });
  };
  const salvarLead = (l: GLinha, tocados?: (keyof GLinha)[]) => {
    // SÓ os campos tocados (rastreio 17/09): objeto inteiro regravava dia/valor
    // velhos por cima de mudanças concorrentes (mover ciclo, outra sessão).
    // `if (tocados)` — lista vazia = patch vazio (nada foi mexido).
    const patch: Partial<GLinha> = {};
    if (tocados) {
      for (const k of tocados) (patch as Record<string, unknown>)[k] = (l as unknown as Record<string, unknown>)[k];
    } else {
      Object.assign(patch, l);
    }
    // senha vazia = "não mexi" (nunca apaga uma senha guardada por engano);
    // limpar de verdade terá um gesto próprio na ficha (modo real).
    if (!patch.senha) delete patch.senha;
    if (!patch.reclameSenha) delete patch.reclameSenha;
    if (!isDemoMode) delete patch.celulas; // real: células vão pelas RPCs abaixo (patch no-op registrava Desfazer falso)
    // grade mês a mês da ficha → operações próprias (persiste no real; demo já cobre via patch)
    const antes = linhas.find((x) => x.id === l.id);
    if (antes && podeCelula && (!tocados || tocados.includes('celulas'))) l.celulas.forEach((raw, k) => {
      if ((antes.celulas[k] ?? '-') === (raw ?? '-')) return;
      const comp = comps[k]; if (!comp) return;
      const n = Number(String(raw).replace(',', '.'));   // aceita vírgula; centavos preservados (banco é numeric 12,2)
      if (raw !== '-' && raw !== '' && isFinite(n)) celulaMut.mutate({ leadId: l.id, comp, valor: Math.round(n * 100) / 100 }, { onError: (e) => setAviso(msgErro(e)) });
      else if (/n[aã]o\s*pagou/i.test(String(raw))) naoPagouMut.mutate({ leadId: l.id, comp }, { onError: (e) => setAviso(msgErro(e)) });
      else if (gestor && (raw === '-' || raw === '')) limparMut.mutate({ leadId: l.id, comp }, { onError: (e) => setAviso(msgErro(e)) });
    });
    if (!Object.keys(patch).length) { setSel(null); return; }
    editarMut.mutate({ id: l.id, patch }, { onSuccess: () => setSel(null), onError: (e) => setAviso(msgErro(e)) });
  };
  // NOVO CLIENTE (dono 25/09): todos os dados da planilha, sem ciclo — entra nos Novos
  // e na Gestão (bloco Novos); o ciclo é escolhido por quem aprova o débito parado.
  const [erroNovo, setErroNovo] = useState('');
  const abrirNovo = () => { setErroNovo(''); setNovo(true); };
  // "+ Novo cliente" do Painel chega com ?novo=1: abre o formulário direto (e limpa a URL)
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    if (params.get('novo') !== '1') return;
    if (podeOperar) abrirNovo();
    const p = new URLSearchParams(params); p.delete('novo');
    setParams(p, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, podeOperar]);
  const criarLead = (l0: GLinha) => {
    setErroNovo('');
    criarMut.mutate({ ...l0 }, {
      onSuccess: () => {
        setNovo(false);
        setAviso(`${l0.nome} cadastrado nos Novos — já aparece na Gestão, no bloco Novos. O ciclo é escolhido na aprovação, quando o desconto parar.`);
        enviarPraPlanilha(l0);
      },
      onError: (e) => setErroNovo(msgErro(e)),
    });
  };
  // o comercial cadastra no PRÓPRIO nome, com a grafia que a planilha já usa pra ele
  const meuComercial = papel === 'comercial'
    ? (comerciais.find((n) => n.trim().toUpperCase() === (meuNome ?? '').trim().toUpperCase()) ?? meuNome ?? '')
    : null;
  // remover UM novo (vai pra lixeira; Desfazer restaura só esse — useExcluirLead)
  const removerUm = (l: GLinha) => {
    excluirMut.mutate(l.id, {
      onSuccess: () => { setConfRemover(null); setSel(null); setAviso(`${l.nome} removido — é possível reverter no Desfazer (ou na Lixeira, na Gestão).`); },
      onError: (e) => { setConfRemover(null); setAviso(msgErro(e)); },
    });
  };
  // remover TODOS os novos de uma vez (Desfazer traz todos de volta)
  const removerTodos = () => {
    removerNovosMut.mutate(undefined, {
      onSuccess: (res) => { setConfRemoverTodos(false); setAviso(`${res.removidos.length} cliente${res.removidos.length === 1 ? '' : 's'} novo${res.removidos.length === 1 ? '' : 's'} removido${res.removidos.length === 1 ? '' : 's'} — o Desfazer traz todos de volta (ou um a um, na Lixeira).`); },
      onError: (e) => { setConfRemoverTodos(false); setAviso(msgErro(e)); },
    });
  };

  const cols: Coluna<GLinha>[] = [
    { chave: 'cli', titulo: 'Cliente', render: (l) => <div className="cm-at-nm"><span className="cm-num-av" aria-hidden>{l.nome.slice(0, 2).toUpperCase()}</span><button type="button" className="pl-nome" onClick={() => setSel(l.id)}>{l.nome}</button></div> },
    { chave: 'com', titulo: 'Comercial', render: (l) => l.comercial || '—' },
    { chave: 'banco', titulo: 'Banco', render: (l) => l.banco || '—' },
    { chave: 'ciclo', titulo: 'Ciclo', dir: true, classe: 'num', render: (l) => (l.dia > 0 ? `D${d2(l.dia)}` : <span className="nv-adefinir" title="O ciclo é escolhido na aprovação, quando o desconto parar">a definir</span>) },
    { chave: 'parc', titulo: 'Parcela', dir: true, classe: 'num', render: (l) => fmtBRL(l.valor) },
    { chave: 'recl', titulo: 'Data reclamação', dir: true, classe: 'num', render: (l) => l.dataReclamacao ? dataBRcurta(l.dataReclamacao) : '—' },
    { chave: 'ac', titulo: '', render: (l) => (
      <div className="fin-acoes">
        {podeSolicitar ? <button type="button" className="fin-btn fin-ok nv-parado" onClick={() => abrirPedir(l)} title="O desconto parou? Vira um pedido: o financeiro, o cadastro ou o administrador aprovam e definem ciclo e valor.">Marcar débito parado</button> : <BadgeStatus tom="ok">descontando</BadgeStatus>}
        {gestor && (
          <button type="button" className="nv-rm" onClick={() => setConfRemover(l)} aria-label={`Remover ${l.nome}`} title="Remover este cliente novo (vai para a Lixeira; reversível no Desfazer)">
            <IcT d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 12.5h9l1-12.5M10 11v5M14 11v5" s={15} mr={0} />
          </button>
        )}
      </div>
    ) },
  ];
  // seção "Aguardando aprovação": quem pediu, quando e as ações de quem aprova
  const quandoCurto = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(iso); if (isNaN(d.getTime())) return '';
    return `${d2(d.getDate())}/${d2(d.getMonth() + 1)} ${d2(d.getHours())}:${d2(d.getMinutes())}`;
  };
  const colsPend: Coluna<GLinha>[] = [
    { chave: 'cli', titulo: 'Cliente', render: (l) => <div className="cm-at-nm"><span className="cm-num-av" aria-hidden>{l.nome.slice(0, 2).toUpperCase()}</span><button type="button" className="pl-nome" onClick={() => setSel(l.id)}>{l.nome}</button></div> },
    { chave: 'com', titulo: 'Comercial', render: (l) => l.comercial || '—' },
    { chave: 'parc', titulo: 'Parcela', dir: true, classe: 'num', render: (l) => fmtBRL(l.valor) },
    { chave: 'parou', titulo: 'Desconto parou', dir: true, classe: 'num', render: (l) => (l.dataParou ? dataBRcurta(l.dataParou) : '—') },
    { chave: 'por', titulo: 'Pedido por', render: (l) => <div className="nv-pedido"><b>{l.paradoSolicitadoNome || '—'}</b><span className="num">{quandoCurto(l.paradoSolicitadoEm)}</span></div> },
    { chave: 'ac', titulo: '', render: (l) => (
      <div className="fin-acoes">
        {podeAprovar ? (
          <>
            <button type="button" className="fin-btn fin-ok" onClick={() => abrirAprovar(l)}>Aprovar</button>
            <button type="button" className="fin-btn" style={{ color: 'var(--rubro)' }} onClick={() => { setRecusar(l); setRecMotivo(''); }}>Recusar</button>
          </>
        ) : l.paradoSolicitadoPor && l.paradoSolicitadoPor === meuId ? (
          <button type="button" className="fin-btn" onClick={() => cancelarPedido(l)} disabled={cancelarMut.isPending} title="Retira o pedido — o cliente volta para a lista de Novos">Cancelar pedido</button>
        ) : <BadgeStatus tom="atencao">aguardando</BadgeStatus>}
      </div>
    ) },
  ];

  if (isLoading) return <div className="fin-vazio">Carregando os novos…</div>;
  if (isError) return <CardVidro spot><EstadoVazio titulo="Não foi possível carregar" descricao="Verifique a conexão e tente novamente." acao={{ rotulo: 'Tentar de novo', onClick: () => { void refetch(); } }} /></CardVidro>;
  return (
    <div className="fin-raiz">
      {aviso && <div className="gs-aviso" role="status"><span>{aviso}</span><button type="button" className="gs-aviso-x" onClick={() => setAviso('')} aria-label="Fechar">×</button></div>}
      <div className="kpis sobe">
        <Kpi rotulo="Novos (débito ativo)" valor={normais.length} formato="mil" nota="clientes ainda com o desconto no benefício" />
        <Kpi rotulo="Aguardando aprovação" valor={pendentes.length} formato="mil" nota={pendentes.length > 0 ? (podeAprovar ? 'defina o ciclo e o valor' : 'com o financeiro') : 'nada pendente'} />
        <Kpi rotulo="Em parcelas/mês" valor={Math.trunc(emParcelas)} formato="mil" prefixo="R$ " sufixo={`,${String(Math.round((emParcelas % 1) * 100)).padStart(2, '0')}`}
          nota={`${ativos.length} parcela${ativos.length === 1 ? '' : 's'} ativa${ativos.length === 1 ? '' : 's'}`} />
        <Kpi rotulo="Total de clientes" valor={linhas.length} formato="mil" nota="na planilha de cobranças" />
      </div>
      {pendentes.length > 0 && (
        <CardVidro spot className="fin-panel nv-pend sobe" style={{ animationDelay: '.08s' }}>
          <div className="fin-head">
            <h3>Aguardando aprovação</h3>
            <span className="pl-count num">{pendentesVis.length}</span>
            <span className="nv-pend-sub">{podeAprovar ? 'Débito parado marcado — defina o ciclo, o valor e a data para enviar à Gestão.' : 'Débito parado marcado — aguardando o financeiro, o cadastro ou o administrador aprovar.'}</span>
          </div>
          {pendentesVis.length === 0
            ? <div className="fin-vazio">Nenhum pedido neste filtro.</div>
            : <TabelaPadrao colunas={colsPend} linhas={pendentesVis} chave={(l) => l.id} rodape={{ texto: `${pendentesVis.length} aguardando aprovação · ${fmtBRL(pendentesVis.reduce((s, l) => s + l.valor, 0))} em parcelas` }} />}
        </CardVidro>
      )}
      <CardVidro spot className="fin-panel sobe" style={{ animationDelay: '.1s' }}>
        <div className="fin-head">
          <h3 title="Clientes que ainda não pararam o desconto: o débito segue ativo no benefício. Quando o desconto parar, use Marcar débito parado — o cliente vai para Aguardando aprovação e só entra na Gestão depois que o financeiro, o cadastro ou o administrador aprovar e definir o ciclo e o valor.">Novos — débito ativo</h3>
          <span className="pl-count num">{visiveis.length}</span>
          <div className="fin-filtros">
            <input className="inp" placeholder="Buscar cliente…" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar cliente" />
            <select className="inp pl-sel" value={fCom} onChange={(e) => setFCom(e.target.value)} aria-label="Filtrar por comercial"><option value="todos">Comercial: todos</option>{comerciais.map((c) => <option key={c} value={c}>{c}</option>)}</select>
            {gestor && ativos.length > 0 && <BotaoSec onClick={() => exportarXlsx(ativos, comps, 'clientes-novos')}><IcT d="M12 4v11m0 0 4-4m-4 4-4-4M4 20h16" />Exportar</BotaoSec>}
            {gestor && (
              <MenuMais titulo="Mais ações" so itens={[
                { rotulo: 'Importar novos', icone: IC_PATH.importar, aoClicar: () => setImportOpen(true) },
                ...(normais.length > 0 ? [{
                  rotulo: 'Remover todos os novos', icone: 'M4 7h16M9.5 7V4.5h5V7M6.5 7l1 12.5h9l1-12.5M10 11v5M14 11v5', perigo: true, separar: true,
                  aoClicar: () => setConfRemoverTodos(true),
                  dica: 'Remove TODOS os clientes novos de uma vez (vão para a Lixeira; o Desfazer traz todos de volta). Quem está aguardando aprovação fica.',
                }] : []),
              ]} />
            )}
            {podeOperar && <BotaoPrimario onClick={abrirNovo}>＋ Novo cliente</BotaoPrimario>}
          </div>
        </div>
        {visiveis.length === 0
          ? <div className="fin-vazio">Nenhum cliente com débito ativo neste filtro.</div>
          : <TabelaPadrao colunas={cols} linhas={visiveis} chave={(l) => l.id} rodape={{ texto: `${visiveis.length} com débito ativo · ${fmtBRL(visiveis.reduce((s, l) => s + l.valor, 0))} em parcelas/mês` }} />}
      </CardVidro>
      {/* 1) PEDIR: só a data em que o desconto parou → aprovação */}
      <ModalV2 aberto={!!pedir} aoFechar={() => setPedir(null)} largura={420}
        titulo={pedir ? <div>Marcar débito parado<div className="mod-sub">{pedir.nome}{pedir.comercial ? ` · ${pedir.comercial}` : ''}</div></div> : ''}
        rodape={<><BotaoSec onClick={() => setPedir(null)}>Cancelar</BotaoSec><BotaoPrimario onClick={confirmarPedido} disabled={!pedirParou || solicitarMut.isPending}>{solicitarMut.isPending ? 'Enviando…' : 'Enviar para aprovação'}</BotaoPrimario></>}>
        {pedir && (
          <div>
            <label className="cd-f" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}><span>Data em que o desconto parou</span>
              <input className="inp" type="date" value={pedirParou} max={hojeIso()} onChange={(e) => setPedirParou(e.target.value)} />
            </label>
            <p className="cm-hint" style={{ margin: '12px 2px 0' }}>
              O pedido vai para <b>Aguardando aprovação</b>. O <b>financeiro, o cadastro ou o administrador</b> define o <b>ciclo</b> e o <b>valor</b> — então o cliente entra na Gestão.
              {podeAprovar ? ' Como você aprova, ele já aparece no topo da tela para você concluir.' : ' Você é avisado no sino quando aprovarem (ou recusarem).'}
            </p>
          </div>
        )}
      </ModalV2>

      {/* 2) APROVAR: quem aprova decide ciclo, valor e data → Gestão */}
      <ModalV2 aberto={!!aprovar} aoFechar={() => setAprovar(null)} largura={460}
        titulo={aprovar ? <div>Aprovar débito parado<div className="mod-sub">{aprovar.nome}{aprovar.comercial ? ` · ${aprovar.comercial}` : ''}{aprovar.paradoSolicitadoNome ? ` · pedido por ${aprovar.paradoSolicitadoNome}` : ''}</div></div> : ''}
        rodape={<><BotaoSec onClick={() => setAprovar(null)}>Cancelar</BotaoSec><BotaoPrimario onClick={confirmarAprovacao} disabled={!aprDia || aprovarMut.isPending}>{aprovarMut.isPending ? 'Aprovando…' : aprDia ? `Aprovar e enviar para o ciclo D${d2(aprDia)}` : 'Escolha o ciclo'}</BotaoPrimario></>}>
        {aprovar && (() => {
          const comp = mesesFut[mesIdx] ?? mesesFut[0];
          const marcado = aprDataCob ?? (aprDia ? `${comp}-${d2(aprDia)}` : undefined);
          const sugeridos = new Map(aprSugestoes.map((s) => [s.dia, s.motivo]));
          const grupos: { rot: string; dias: number[] }[] = [
            { rot: 'Fim do mês', dias: ciclosDisp.filter((x) => x >= 15) },
            { rot: 'Início do mês', dias: ciclosDisp.filter((x) => x < 15) },
          ].filter((g) => g.dias.length > 0);
          const diaNovo = aprDia != null && !ciclosDisp.includes(aprDia);
          const escolher = (dd0: number) => { setAprDia(dd0); setAprDataCob(null); };
          return (
          <div>
            <div className="nv-apr-sec">Em que ciclo a cobrança começa?</div>
            {aprSugestoes.length > 0 && (
              <p className="nv-apr-sug">
                <span className="nv-apr-sug-ic" aria-hidden>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.9V16h5v-.2c0-.8.4-1.5 1-1.9A6 6 0 0 0 12 3Z" /></svg>
                </span>
                <span>Pela tabela do INSS ({aprSugestoes.map((s) => s.motivo).join(' / ')}): {aprSugestoes.map((s, i) => <span key={s.dia}>{i > 0 && ' ou '}<button type="button" className="nv-apr-sug-bt" onClick={() => escolher(s.dia)}>D{d2(s.dia)}</button></span>)}. É só sugestão — confira antes.</span>
              </p>
            )}
            {grupos.map((g) => (
              <div className="nv-apr-grupo" key={g.rot}>
                <span className="nv-apr-grupo-rot">{g.rot}</span>
                <div className="nv-apr-ciclos" role="radiogroup" aria-label={`Ciclos — ${g.rot.toLowerCase()}`}>
                  {g.dias.map((dd0) => (
                    <button type="button" role="radio" aria-checked={aprDia === dd0} key={dd0}
                      className={['nv-apr-ciclo', aprDia === dd0 ? 'on' : '', sugeridos.has(dd0) ? 'sug' : ''].filter(Boolean).join(' ')}
                      title={sugeridos.has(dd0) ? `Sugerido: ${sugeridos.get(dd0)}` : `Cobrar todo dia ${d2(dd0)}`}
                      onClick={() => escolher(dd0)}>D{d2(dd0)}</button>
                  ))}
                </div>
              </div>
            ))}
            <button type="button" className="nv-apr-outro" aria-expanded={aprOutroDia || diaNovo} onClick={() => setAprOutroDia((v) => !v)}>
              {aprOutroDia || diaNovo ? '▾' : '▸'} Outro dia (novo ciclo)
            </button>
            {(aprOutroDia || diaNovo) && (<>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, margin: '8px 0 8px' }}>
                <button type="button" className="calx-seta" disabled={mesIdx <= 0} onClick={() => setMesIdx((v) => Math.max(0, v - 1))} aria-label="Mês anterior">‹</button>
                <b className="num" style={{ textTransform: 'uppercase', letterSpacing: '.03em' }}>{rotuloMesCurto(comp)}</b>
                <button type="button" className="calx-seta" disabled={mesIdx >= mesesFut.length - 1} onClick={() => setMesIdx((v) => Math.min(mesesFut.length - 1, v + 1))} aria-label="Próximo mês">›</button>
              </div>
              <CalendarioMes comp={comp} marcado={marcado} onPick={(iso) => { setAprDataCob(iso); setAprDia(Number(iso.slice(8, 10)) || null); }} />
            </>)}
            <p className="cm-hint" style={{ margin: '8px 2px 0' }}>{aprDia
              ? <>Passa a vencer todo <b>dia {d2(aprDia)}</b> → ciclo <b>D{d2(aprDia)}</b>{diaNovo ? ' (ciclo novo)' : ''}.</>
              : 'Escolha o ciclo. Nada vem marcado: quem aprova decide.'}</p>
            <div className="nv-apr-campos">
              <label className="cd-f"><span>Parcela total (R$)</span>
                <input className="inp num" inputMode="decimal" value={aprValorTxt} placeholder={reaisTxt(aprovar.valor) || '0,00'} onChange={(e) => setAprValorTxt(e.target.value)} />
                <i className="nv-apr-nota">{aprValor > 0 ? `mensalidade ${fmtBRL(aprValor / 2)}` : `vazio = mantém ${fmtBRL(aprovar.valor)}`}</i>
              </label>
              <label className="cd-f"><span>Desconto parou em</span>
                <input className="inp" type="date" value={aprParou} max={hojeIso()} onChange={(e) => setAprParou(e.target.value)} />
              </label>
            </div>
            <p className="cm-hint" style={{ margin: '10px 2px 0' }}>Ao aprovar, o cliente sai dos Novos e entra na <b>Gestão</b> nesse ciclo. {aprovar.paradoSolicitadoNome ? `${aprovar.paradoSolicitadoNome} é avisado no sino. ` : ''}Dá pra reverter no <b>Desfazer</b>.</p>
          </div>
        ); })()}
      </ModalV2>

      {/* 3) RECUSAR: continua nos Novos (débito ativo) */}
      <ModalV2 aberto={!!recusar} aoFechar={() => setRecusar(null)} largura={420}
        titulo={recusar ? <div>Recusar débito parado<div className="mod-sub">{recusar.nome}{recusar.paradoSolicitadoNome ? ` · pedido por ${recusar.paradoSolicitadoNome}` : ''}</div></div> : ''}
        rodape={<><BotaoSec onClick={() => setRecusar(null)}>Cancelar</BotaoSec><BotaoPrimario onClick={confirmarRecusa} disabled={recusarMut.isPending} style={{ background: 'var(--rubro)' }}>{recusarMut.isPending ? 'Recusando…' : 'Recusar pedido'}</BotaoPrimario></>}>
        {recusar && (
          <div>
            <label className="cd-f" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}><span>Motivo (opcional — vai no aviso pra quem pediu)</span>
              <textarea className="inp" rows={3} value={recMotivo} placeholder="Ex.: o desconto ainda aparece no extrato" onChange={(e) => setRecMotivo(e.target.value)} />
            </label>
            <p className="cm-hint" style={{ margin: '10px 2px 0' }}>O cliente <b>continua nos Novos</b> com o débito ativo. Dá pra reverter no <b>Desfazer</b>.</p>
          </div>
        )}
      </ModalV2>
      {selL && <FichaLead key={selL.id} inicial={selL} comps={comps} ciclos={ciclosDisp} comerciais={comerciais} gestor={podeOperar} podeGrade={podeCelula} podeAprovar={podeAprovar} aoSalvar={salvarLead} aoFechar={() => setSel(null)} />}
      {novo && <NovoCliente linhas={linhas} comps={comps} comerciais={comerciais} meuComercial={meuComercial}
        ocupado={criarMut.isPending} erro={erroNovo} aoCadastrar={criarLead} aoFechar={() => { if (!criarMut.isPending) setNovo(false); }} />}
      {importOpen && <ImportarCiclo situacao="ativo" aoImportar={({ r, cicloNome, dataCobranca }) => {
        importarMut.mutate({ linhas: r.linhas, comps: r.comps, situacao: 'ativo', cicloNome, dataCobranca }, {
          onSuccess: (res) => { setImportOpen(false); setAviso(`Ciclo "${cicloNome}" criado — ${res.leads} clientes novos importados (dia ${d2(res.dia)}).${res.celulasIgnoradas ? ` ⚠ ${res.celulasIgnoradas} célula(s) ignoradas — confira a planilha.` : ''}`); },
          onError: (e) => setAviso(msgErro(e)),
        });
      }} ocupado={importarMut.isPending} aoFechar={() => setImportOpen(false)} />}
      {confRemover && (
        <ModalV2 aberto aoFechar={() => setConfRemover(null)} largura={400}
          titulo={<div>Remover {confRemover.nome}?<div className="mod-sub">O cliente sai dos Novos e vai pra Lixeira.</div></div>}
          rodape={<><BotaoSec onClick={() => setConfRemover(null)}>Cancelar</BotaoSec><BotaoPrimario disabled={excluirMut.isPending} onClick={() => removerUm(confRemover)} style={{ background: 'var(--rubro)' }}>{excluirMut.isPending ? 'Removendo…' : 'Remover'}</BotaoPrimario></>}>
          <p className="cm-hint" style={{ margin: 0 }}>Nada é apagado de vez: o cadastro (com senhas e histórico) vai pra <b>Lixeira</b>. Dá pra reverter num clique no <b>Desfazer</b> do topo, ou restaurar depois pela Lixeira na Gestão.</p>
        </ModalV2>
      )}
      {confRemoverTodos && (
        <ModalV2 aberto aoFechar={() => setConfRemoverTodos(false)} largura={430}
          titulo={<div>Remover todos os {normais.length} clientes novos?<div className="mod-sub">Todos os clientes com débito ativo saem de uma vez.</div></div>}
          rodape={<><BotaoSec onClick={() => setConfRemoverTodos(false)}>Cancelar</BotaoSec><BotaoPrimario disabled={removerNovosMut.isPending} onClick={removerTodos} style={{ background: 'var(--rubro)' }}>{removerNovosMut.isPending ? 'Removendo…' : `Remover todos (${normais.length})`}</BotaoPrimario></>}>
          <p className="cm-hint" style={{ margin: 0 }}>
            Os <b>{normais.length}</b> clientes novos (débito ainda ativo) vão inteiros pra <b>Lixeira</b> — cadastro, senhas e histórico. Ninguém em cobrança é tocado{pendentes.length === 1 ? <>, e o <b>1</b> aguardando aprovação fica</> : pendentes.length > 1 ? <>, e os <b>{pendentes.length}</b> aguardando aprovação ficam</> : null}.
          </p>
          <p className="cm-hint" style={{ margin: '8px 0 0', color: 'var(--ambar)' }}>⚠ Dá pra trazer <b>todos de volta</b> num clique no <b>Desfazer</b> do topo (por 5 minutos). Depois disso, ainda dá pra restaurar um a um pela Lixeira.</p>
        </ModalV2>
      )}
    </div>
  );
}

/* =================== CALENDÁRIO — recebimento & cobrança por ciclo ===================
   Tela-mãe da operação: um mês inteiro mostrando, em cada dia, quais ciclos recebem no
   INSS (= dia em que enviamos a cobrança), com feriados marcados. Auto-detector: quando
   o dia do ciclo cai em fim de semana ou feriado, a cobrança é EMPURRADA para o próximo
   dia útil automaticamente (regra INSS) — sem edição manual. */
const CALX_MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const CALX_WK = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export function AbaCalendario({ gestor }: { demo: boolean; gestor: boolean }) {
  const { data: dadosQ } = useDadosCobranca();
  const dados = dadosQ ?? { comps: [], linhas: [], pendentes: [], historico: [] };
  const { linhas } = dados;
  const cicloMut = useEditarCiclo();
  const [aviso, setAviso] = useState('');
  const hoje = new Date();
  const hojeIso = `${hoje.getFullYear()}-${d2(hoje.getMonth() + 1)}-${d2(hoje.getDate())}`;
  const [cursor, setCursor] = useState({ y: hoje.getFullYear(), m: hoje.getMonth() + 1 });
  const [fSit, setFSit] = useState<'todos' | 'cancelado' | 'ativo'>('todos');
  const [ocultos, setOcultos] = useState<Set<number>>(new Set());
  const [diaSel, setDiaSel] = useState<string | null>(null);
  const [cicloFoco, setCicloFoco] = useState<number | null>(null); // foco cruzado: chip ↔ linhas do ciclo (identidade sem cor)
  const comp = `${cursor.y}-${d2(cursor.m)}`;
  // data de cobrança do ciclo neste mês: override MANUAL (arrastado) vence o automático
  const cobDe = (dia: number) => {
    const auto = cobrancaDoCiclo(comp, dia);
    const ov = dados.ciclosDatas?.[String(dia)]?.[comp]?.cobranca;
    return ov ? { base: auto.base, iso: ov, deslocado: ov !== auto.base, motivo: 'ajuste manual', manual: true } : { ...auto, manual: false };
  };
  // arrastar um ciclo p/ outro dia = grava o override; soltar no dia automático = volta ao automático
  const soltarCiclo = (dia: number, isoAlvo: string) => {
    if (!gestor) return;
    const auto = cobrancaDoCiclo(comp, dia);
    const valor = isoAlvo === auto.iso ? '' : isoAlvo;
    cicloMut.mutate({ dia, comp, campo: 'cobranca', valor, padrao: { inicio: '', fim: '' } }, {
      onSuccess: () => setAviso(valor
        ? `Ciclo D${d2(dia)}: cobrança movida para ${dataBRcurta(isoAlvo)} (ajuste manual).`
        : `Ciclo D${d2(dia)}: cobrança voltou para o automático (${dataBRcurta(auto.iso)}).`),
      onError: (e) => setAviso(msgErro(e)),
    });
  };

  const ciclos = useMemo(() => {
    const map = new Map<number, GLinha[]>();
    for (const l of linhas) { if (!l.dia) continue; if (fSit !== 'todos' && l.situacao !== fSit) continue; const a = map.get(l.dia) ?? []; a.push(l); map.set(l.dia, a); }
    return [...map.entries()].map(([dia, leads]) => ({ dia, codigo: `D${d2(dia)}`, leads: [...leads].sort((a, b) => a.nome.localeCompare(b.nome)) })).sort((a, b) => a.dia - b.dia);
  }, [linhas, fSit]);
  const visiveis = useMemo(() => ciclos.filter((c) => !ocultos.has(c.dia)), [ciclos, ocultos]);

  // mapa: dia-do-mês → cobranças (pílula) e recebimentos deslocados (fantasma)
  const { cob, ghost } = useMemo(() => {
    const cob = new Map<string, { dia: number; count: number; deslocado: boolean; motivo: string }[]>();
    const ghost = new Map<string, { dia: number; destino: string; motivo: string }[]>();
    for (const c of visiveis) {
      const cd = cobDe(c.dia);
      (cob.get(cd.iso) ?? cob.set(cd.iso, []).get(cd.iso)!).push({ dia: c.dia, count: c.leads.length, deslocado: cd.deslocado, motivo: cd.motivo });
      if (cd.deslocado && cd.base.startsWith(comp)) (ghost.get(cd.base) ?? ghost.set(cd.base, []).get(cd.base)!).push({ dia: c.dia, destino: cd.iso, motivo: cd.motivo });
    }
    return { cob, ghost };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visiveis, comp, dados.ciclosDatas]);

  const deslocados = useMemo(() => visiveis.map((c) => ({ c, cd: cobDe(c.dia) })).filter((x) => x.cd.deslocado),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visiveis, comp, dados.ciclosDatas]);
  const gruposDia = useMemo(() => diaSel ? visiveis.map((c) => ({ c, cd: cobDe(c.dia) })).filter((x) => x.cd.iso === diaSel) : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visiveis, comp, diaSel, dados.ciclosDatas]);
  const totalPessoas = useMemo(() => visiveis.reduce((s, c) => s + c.leads.length, 0), [visiveis]);

  const fer = feriadosDoAno(cursor.y);
  const ult = new Date(cursor.y, cursor.m, 0).getDate();
  const offset = new Date(cursor.y, cursor.m - 1, 1).getDay();
  const cells: (number | null)[] = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= ult; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const irMes = (delta: number) => { setDiaSel(null); setCursor((c) => { const idx = (c.m - 1) + delta; const y = c.y + Math.floor(idx / 12); const m = ((idx % 12) + 12) % 12; return { y, m: m + 1 }; }); };
  const irHoje = () => { setDiaSel(null); setCursor({ y: hoje.getFullYear(), m: hoje.getMonth() + 1 }); };
  const alternarCiclo = (dia: number) => setOcultos((s) => { const n = new Set(s); if (n.has(dia)) n.delete(dia); else n.add(dia); return n; });
  const nomeFerSel = diaSel ? feriadoNome(diaSel) : '';

  return (
    <div className="calx">
      {aviso && <div className="gs-aviso" role="status"><span>{aviso}</span><button type="button" className="gs-aviso-x" onClick={() => setAviso('')} aria-label="Fechar">×</button></div>}
      {/* crítica 12/11: o mesmo seletor de mês do Painel; contadores no estilo do Painel; aviso em selos;
          filtro de ciclos com estado legível ("Filtrado: 8 de 9 ciclos · Limpar") */}
      <div className="calx-top sobe" style={{ animationDelay: '.05s' }}>
        <div className="calx-nav">
          <div className="pn-mes calx-mesgrp" role="group" aria-label="Mês do calendário">
            <button type="button" className="pn-mes-seta" onClick={() => irMes(-1)} aria-label="Mês anterior"><IcT d="m15 18-6-6 6-6" s={14} mr={0} /></button>
            <span className="calx-mes-rot num" aria-live="polite">{`${CALX_MESES[cursor.m - 1]} de ${cursor.y}`}</span>
            <button type="button" className="pn-mes-seta" onClick={() => irMes(1)} aria-label="Próximo mês"><IcT d="m9 18 6-6-6-6" s={14} mr={0} /></button>
          </div>
          <button type="button" className="calx-hojebtn" onClick={irHoje} disabled={cursor.y === hoje.getFullYear() && cursor.m === hoje.getMonth() + 1}>Hoje</button>
          {!gestor && <span className="st s-ne calx-ro" title="As datas dos ciclos são ajustadas pelo administrador (arrastar desabilitado)."><i aria-hidden />Somente leitura</span>}
        </div>
        <div className="calx-kpis">
          <span className="pn-barra-stat num"><b>{visiveis.length}</b> ciclo{visiveis.length === 1 ? '' : 's'}</span>
          <span className="pn-barra-stat num"><b>{totalPessoas}</b> pessoa{totalPessoas === 1 ? '' : 's'}</span>
          <span className={`pn-barra-stat num${deslocados.length ? ' calx-stat-alerta' : ''}`}><b>{deslocados.length}</b> reprogramado{deslocados.length === 1 ? '' : 's'}</span>
        </div>
        <select className="inp calx-sit" value={fSit} onChange={(e) => setFSit(e.target.value as typeof fSit)} aria-label="Filtrar clientes">
          <option value="todos">Todos os clientes</option>
          <option value="cancelado">Em cobrança</option>
          <option value="ativo">Débito ativo</option>
        </select>
      </div>

      {deslocados.length > 0 && (
        <div className="calx-alerta sobe" style={{ animationDelay: '.08s' }} role="status">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 9v4M12 17h.01M10.3 3.9 2.4 18a1.5 1.5 0 0 0 1.3 2.2h16.6a1.5 1.5 0 0 0 1.3-2.2L13.7 3.9a1.5 1.5 0 0 0-2.6 0z" /></svg>
          <span className="calx-al-tit">Cobranças reprogramadas em {CALX_MESES[cursor.m - 1]}</span>
          <span className="calx-al-selos">
            {deslocados.map((x) => (
              <span key={x.c.dia} className="calx-al-selo num" title={`${x.c.codigo} recebe dia ${diaBR(x.c.dia)}${x.cd.motivo ? ` (${x.cd.motivo})` : ''} — cobrança em ${dataBRcurta(x.cd.iso)} (${diaSemanaBR(x.cd.iso)})`}>
                <b>{x.c.codigo}</b>{diaSemanaBR(`${comp}-${d2(Math.min(x.c.dia, ult))}`).slice(0, 3)} {d2(Math.min(x.c.dia, ult))}
                <IcT d="M5 12h14m-5-5 5 5-5 5" s={12} mr={0} />{diaSemanaBR(x.cd.iso).slice(0, 3)} {dataBRcurta(x.cd.iso).slice(0, 5)}
              </span>
            ))}
          </span>
        </div>
      )}

      <div className="calx-chips sobe" style={{ animationDelay: '.1s' }} role="group" aria-label="Filtrar ciclos">
        <button type="button" className={`calx-chip calx-todos${ocultos.size === 0 ? ' on' : ''}`} aria-pressed={ocultos.size === 0} onClick={() => setOcultos(new Set())}>Todos</button>
        {ciclos.map((c) => (
          <button type="button" key={c.dia} className={`calx-chip${ocultos.has(c.dia) ? ' off' : ''}`} aria-pressed={!ocultos.has(c.dia)}
            title={ocultos.has(c.dia) ? `${c.codigo} oculto — clique para mostrar` : `Clique para ocultar ${c.codigo}`}
            onMouseEnter={() => setCicloFoco(c.dia)} onMouseLeave={() => setCicloFoco(null)} onFocus={() => setCicloFoco(c.dia)} onBlur={() => setCicloFoco(null)}
            onClick={() => alternarCiclo(c.dia)}>
            {c.codigo}<span className="calx-chip-n">{c.leads.length}</span>
          </button>
        ))}
        {ocultos.size > 0 && (
          <span className="calx-filtrado num">
            Filtrado: {ciclos.length - ciclos.filter((c) => ocultos.has(c.dia)).length} de {ciclos.length} ciclos
            <button type="button" className="mc-lnk" onClick={() => setOcultos(new Set())}>Limpar</button>
          </span>
        )}
      </div>

      <div className="calx-layout sobe" style={{ animationDelay: '.14s' }}>
        <CardVidro spot className="calx-cal">
          <div className="calx-wk">{CALX_WK.map((w, i) => <span key={i} className={i === 0 || i === 6 ? 'fds' : ''}>{w}</span>)}</div>
          <div className="calx-grid">
            {cells.map((d, i) => {
              if (d == null) return <div key={i} className="calx-cell out" aria-hidden />;
              const iso = `${comp}-${d2(d)}`;
              const dow = new Date(cursor.y, cursor.m - 1, d).getDay();
              const fname = fer[`${d2(cursor.m)}-${d2(d)}`];
              const pills = cob.get(iso) ?? [];
              const ghosts = ghost.get(iso) ?? [];
              const cls = ['calx-cell', dow === 0 || dow === 6 ? 'wknd' : '', fname ? 'fer' : '', iso === hojeIso ? 'hoje' : '', iso === diaSel ? 'sel' : '', pills.length ? 'tem' : ''].filter(Boolean).join(' ');
              return (
                <button type="button" key={i} className={cls} onClick={() => setDiaSel(iso === diaSel ? null : iso)}
                  onDragOver={(e) => { if (gestor) e.preventDefault(); }}
                  onDrop={(e) => { e.preventDefault(); const de = Number(e.dataTransfer.getData('text/plain')); if (de) soltarCiclo(de, iso); }}>
                  <div className="calx-daytop"><span className="calx-daynum">{d}</span></div>
                  {fname && <div className="calx-fer" title={fname}>{fname}</div>}
                  <div className="calx-pills">
                    {pills.map((p) => (
                      <span key={`c${p.dia}`} draggable={gestor} onDragStart={(e) => { e.dataTransfer.setData('text/plain', String(p.dia)); e.dataTransfer.effectAllowed = 'move'; }}
                        className={`calx-pill${p.deslocado ? ' desl' : ''}${p.motivo === 'ajuste manual' ? ' manual' : ''}${cicloFoco === p.dia ? ' foco' : ''}`}
                        title={`Ciclo D${d2(p.dia)} — ${p.count} pessoa${p.count === 1 ? '' : 's'}${p.deslocado ? ` · ${p.motivo === 'ajuste manual' ? 'ajuste manual (arraste de volta p/ desfazer)' : `deslocado (${p.motivo})`}` : ''}${gestor ? ' · arraste p/ mudar a data' : ''}`}>
                        {p.motivo === 'ajuste manual' ? <span className="calx-rot" aria-hidden><IcT d={IC_PATH.pino} s={9} mr={0} /></span> : p.deslocado ? <span className="calx-rot" aria-hidden><IcT d={IC_PATH.girar} s={9} mr={0} /></span> : null}D{d2(p.dia)}<b>{p.count}</b>
                      </span>
                    ))}
                    {ghosts.map((g) => (
                      <span key={`g${g.dia}`} className={`calx-pill fantasma${cicloFoco === g.dia ? ' foco' : ''}`} title={`D${d2(g.dia)} cobrado no dia ${dataBRcurta(g.destino)} (${g.motivo})`}>
                        <span className="calx-rot" aria-hidden><IcT d={IC_PATH.girar} s={10} mr={0} /></span>D{d2(g.dia)}
                      </span>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="calx-leg">
            <span><i className="calx-lg hoje" />hoje</span>
            <span><i className="calx-lg fer" />feriado</span>
            <span><i className="calx-lg desl" />cobrança reprogramada</span>
            <span><i className="calx-lg fant" />dia de recebimento</span>
          </div>
        </CardVidro>

        <aside className="calx-aside">
          {!diaSel ? (
            (() => {
              const agenda = visiveis.map((c) => ({ c, cd: cobDe(c.dia) })).sort((a, b) => a.cd.iso.localeCompare(b.cd.iso));
              const totalMes = agenda.reduce((s, x) => s + x.c.leads.reduce((t, l) => t + l.valor / 2, 0), 0);
              return (
                <div className="calx-ag">
                  <div className="calx-ag-head"><span className="caps">Agenda do mês</span><span className="calx-ag-tot num">{fmtBRL(totalMes)}</span></div>
                  <div className="calx-ag-sub num">{agenda.length} cobrança{agenda.length === 1 ? '' : 's'} · {totalPessoas} pessoa{totalPessoas === 1 ? '' : 's'}</div>
                  {agenda.length === 0 ? (
                    <div className="calx-aside-vazio"><p>Nenhum ciclo neste mês.</p></div>
                  ) : (
                    <div className="calx-ag-rows">
                      {agenda.map(({ c, cd }) => (
                        <button type="button" className={`calx-ag-row${cicloFoco === c.dia ? ' foco' : ''}`} key={c.dia} onClick={() => setDiaSel(cd.iso)}
                          onMouseEnter={() => setCicloFoco(c.dia)} onMouseLeave={() => setCicloFoco(null)}>
                          <span className="calx-ag-dia"><b className="num">{Number(cd.iso.slice(8, 10))}</b><i>{CALX_WK[new Date(cd.iso + 'T12:00:00').getDay()]}</i></span>
                          <span className="calx-ag-cod">{c.codigo}</span>
                          {cd.deslocado && <span className="calx-ag-flag" title={cd.motivo}><IcT d={IC_PATH.girar} s={9} mr={0} /></span>}
                          <span className="calx-ag-n num">{c.leads.length}</span>
                          <span className="calx-ag-val num">{fmtBRL(c.leads.reduce((s, l) => s + l.valor / 2, 0))}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()
          ) : (
            <>
              <div className="calx-aside-head">
                <div className="calx-ah-dia num">{Number(diaSel.slice(8, 10))}</div>
                <div>
                  <div className="calx-ah-tit">{diaSemanaBR(diaSel).replace(/^./, (c) => c.toUpperCase())}, {Number(diaSel.slice(8, 10))} de {CALX_MESES[cursor.m - 1]}</div>
                  {nomeFerSel && <div className="calx-ah-fer"><IcT d={IC_PATH.bandeira} s={11} mr={0} /> {nomeFerSel}</div>}
                </div>
                <button type="button" className="calx-ah-x" onClick={() => setDiaSel(null)} aria-label="Fechar"><IcT d="M18 6 6 18M6 6l12 12" s={15} mr={0} /></button>
              </div>
              {gruposDia.length === 0 ? (
                <div className="calx-aside-vazio"><p>Nenhuma cobrança neste dia.</p></div>
              ) : (
                <div className="calx-grupos">
                  {gruposDia.map(({ c, cd }) => (
                    <div className="calx-grupo" key={c.dia}>
                      <div className="calx-gr-head">
                        <b>{c.codigo}</b>
                        <span className="calx-gr-n">{c.leads.length} pessoa{c.leads.length === 1 ? '' : 's'}</span>
                        <span className="calx-gr-tot num">{fmtBRL(c.leads.reduce((s, l) => s + l.valor / 2, 0))}</span>
                      </div>
                      {cd.deslocado && <div className="calx-gr-desl">Recebe dia {diaBR(c.dia)} ({cd.motivo}) — cobrança reprogramada para esta data.</div>}
                      <ul className="calx-leads">
                        {c.leads.map((l) => (
                          <li key={l.id}>
                            <span className="calx-l-nm">{l.nome}</span>
                            <span className="calx-l-com">{l.comercial || '—'}</span>
                            <span className="calx-l-val num">{fmtBRL(l.valor / 2)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
