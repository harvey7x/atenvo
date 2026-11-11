/* hooks react-query da Cobrança: uma query para o blob Dados + mutations
   que invalidam essa query. A UI (cobrancaMotor) migra useState(gsCarregar)
   + aplicar(...) para estes hooks sem mudar de forma.

   DESFAZER: cada mutation reversível captura o estado ANTERIOR no onMutate
   (do cache Dados) e registra o INVERSO no onSuccess (../desfazer). Ações sem
   como reverter (import em massa, confirmação de ledger…) registram-se como
   BLOQUEADAS. Ver src/v2/data/desfazer.ts. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getCobrancaRepo } from './cobrancaRepo';
import { chavesCobranca } from './keys';
import { chavesPlanilha } from './planilha';
import { registrarDesfazer, registrarBloqueada } from '../desfazer';
import type { SessaoPapel } from './sessao';
import type {
  Dados, GLinha, NovoLead, PatchLead, SitDebito,
  LancarPagamentoInput, MarcarCelulaInput, CampoSenha, StatusCancelamento, ResultadoCancelamento,
} from './types';

const repo = () => getCobrancaRepo();
const dd = (n: number) => String(n).padStart(2, '0');

/* célula do cache: '-' (fora/vazia) | 'NÃO PAGOU' | número em texto */
/** o cliente no cache — na Gestão/Novos OU nos Cancelados (a ficha abre cliente cancelado pela Conversa) */
function acharLead(dados: Dados | undefined, id: string): GLinha | undefined {
  return dados?.linhas.find((x) => x.id === id) ?? dados?.cancelados?.find((x) => x.id === id);
}
function celAtual(dados: Dados | undefined, leadId: string, comp: string): string | undefined {
  const l = acharLead(dados, leadId);
  const k = (dados?.comps ?? []).indexOf(comp);
  return l && k >= 0 ? l.celulas[k] : undefined;
}
/* o valor anterior da célula dá pra repor com segurança? Só três formas valem:
   vazio ('-'/''), "não pagou", ou NÚMERO puro (ex.: "175", "175.5", "1.234,56").
   Uma data tipo "29/08/2026" NÃO pode virar valor (viraria R$29 milhões) — nesse
   caso o desfazer é BLOQUEADO em vez de registrar um inverso que corrompe. */
function celulaRestauravel(prev: string | undefined): boolean {
  const s = (prev ?? '').trim();
  if (s === '' || s === '-') return true;
  if (/n[aã]o\s*pagou/i.test(s)) return true;
  return /^\d{1,3}(\.\d{3})*(,\d+)?$/.test(s) || /^\d+([.,]\d+)?$/.test(s);
}
/* repõe UMA célula ao estado anterior */
async function restaurarCelula(leadId: string, comp: string, prev: string | undefined) {
  const r = repo();
  const s = (prev ?? '').trim();
  if (s === '' || s === '-') { await r.limparCelula(leadId, comp); return; }
  if (/n[aã]o\s*pagou/i.test(s)) { await r.marcarNaoPagou(leadId, comp); return; }
  // defesa em profundidade: nunca gravar um "valor" vindo de texto não-numérico
  if (!celulaRestauravel(s)) throw new Error(`O valor anterior da célula ("${s}") não é numérico — ajuste manualmente na grade.`);
  // formato milhar pt-BR ("1.234" ou "1.234,56"): pontos são separadores SEMPRE
  // (antes "1.234" sem vírgula virava 1.23); fora disso, ponto é decimal.
  const milhar = /^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s);
  const n = Number((milhar ? s.replace(/\./g, '') : s).replace(/\s/g, '').replace(',', '.'));
  if (isFinite(n) && n > 0) { await r.marcarCelula({ leadId, comp, valor: Math.round(n * 100) / 100 }); return; }
  await r.limparCelula(leadId, comp);
}

export function useDadosCobranca() {
  // multiusuário: mutações da PRÓPRIA sessão invalidam na hora; as de OUTRA
  // sessão (financeiro × admin × comercial ao mesmo tempo) chegam pelo polling
  // de 30s + refetch ao focar a janela — painéis não ficam congelados (17/09).
  return useQuery<Dados>({
    queryKey: chavesCobranca.dados, queryFn: () => repo().carregar(),
    refetchInterval: 30_000, refetchOnWindowFocus: true,
  });
}

function useInvalidarDados() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: chavesCobranca.dados });
    // toda mutation de cobrança gera linha de auditoria (trigger tg_registrar):
    // a aba Registros usa query própria — invalida junto pra não mostrar log velho
    void qc.invalidateQueries({ queryKey: ['reviza', 'registros'] });
  };
}
/* entrada de pagamento (informar / confirmar / recusar) pinta a célula do mês na
   planilha (amarelo → verde / vermelho) — e a tabela entradas não está no realtime:
   relê a folha junto com os Dados */
function useInvalidarEntrada() {
  const inv = useInvalidarDados();
  const qc = useQueryClient();
  return () => {
    inv();
    void qc.invalidateQueries({ queryKey: chavesPlanilha.planilha });
  };
}
/* lê o blob Dados do cache (estado ANTERIOR à ação, no onMutate) */
function useDadosCache() {
  const qc = useQueryClient();
  return () => qc.getQueryData<Dados>(chavesCobranca.dados);
}
/* papel do usuário logado (do cache da sessão). No demo devolve gestor=true. */
function usePapelCache() {
  const qc = useQueryClient();
  return () => qc.getQueryData<SessaoPapel>(chavesCobranca.papel);
}
/* só gestor/admin apaga lead (RLS leads_del) e limpa célula ('fora'). Sem isso,
   o "desfazer" registraria um inverso que falha na produção. Fora da Reviza
   (demo) o cache não tem papel salvo → trata como gestor (o demo roda pleno). */
const ehGestor = (p: SessaoPapel | undefined) => !p || p.gestor;

export function useCriarLead() {
  const inv = useInvalidarDados();
  const papel = usePapelCache();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (i: NovoLead) => repo().criarLead(i),
    onSuccess: (novo, i) => {
      inv();
      if (i.senha || i.reclameSenha) void qc.invalidateQueries({ queryKey: ['cobranca', 'senhas-grade'] });
      // excluir lead exige gestor/admin (RLS leads_del). Sem isso o "desfazer"
      // daria falso-sucesso pro cadastro/comercial/financeiro. Então: só oferece
      // desfazer de verdade pra gestor; senão avisa que precisa da Lixeira.
      if (!ehGestor(papel())) {
        registrarBloqueada(`cadastro de ${novo.nome}`, 'Excluir cliente é só de gestor/admin — peça a um gestor ou use a Lixeira na Gestão.');
        return;
      }
      registrarDesfazer({
        rotulo: `cadastro de ${novo.nome}`, destrutivo: true,
        inverso: async () => { await repo().excluirLead(novo.id); },
      });
    },
  });
}
export function useEditarLead() {
  const inv = useInvalidarDados();
  const ler = useDadosCache();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: { id: string; patch: PatchLead }) => repo().editarLead(a.id, a.patch),
    onMutate: (a) => ({ prev: acharLead(ler(), a.id) }),
    onSuccess: (_d, a, ctx) => {
      inv();
      // senha mudou → a coluna SENHAS da grade (query própria, staleTime 5min)
      // precisa refazer, senão mostra a senha ANTIGA por até 5 minutos
      if ('senha' in a.patch || 'reclameSenha' in a.patch) void qc.invalidateQueries({ queryKey: ['cobranca', 'senhas-grade'] });
      const prev = ctx?.prev;
      if (!prev) { registrarBloqueada('edição do cadastro', 'O cliente não estava carregado nesta tela — confira o cadastro e corrija à mão se precisar.'); return; }
      const rev: Record<string, unknown> = {};
      for (const k of Object.keys(a.patch)) {
        if (k === 'senha' || k === 'reclameSenha') continue; // write-only: não dá pra repor o valor antigo
        // undefined no cache = coluna null no banco; sem o ?? null o JSON.stringify
        // dropava a coluna do PATCH e o campo (salario/faixa/obs) NÃO voltava.
        rev[k] = (prev as unknown as Record<string, unknown>)[k] ?? null;
      }
      if (!Object.keys(rev).length) return;
      registrarDesfazer({ rotulo: `edição de ${prev.nome}`, inverso: async () => { await repo().editarLead(a.id, rev as PatchLead); } });
    },
  });
}
export function useExcluirLead() {
  const inv = useInvalidarDados();
  const ler = useDadosCache();
  return useMutation({
    mutationFn: (id: string) => repo().excluirLead(id),
    onMutate: (id) => ({ prev: acharLead(ler(), id) }),
    onSuccess: (_d, _id, ctx) => {
      inv();
      const prev = ctx?.prev; if (!prev) return;
      registrarDesfazer({ rotulo: `exclusão de ${prev.nome}`, inverso: async () => { await repo().restaurarExcluido(prev); } });
    },
  });
}
/* remover TODOS os Novos de uma vez (dono 17/09): vão pra lixeira; o Desfazer
   traz todos de volta num toque (o inverso é uma RESTAURAÇÃO — não é destrutivo,
   então não pede 2 cliques; o confirm fica no botão da tela). */
export function useRemoverNovos() {
  const inv = useInvalidarDados();
  const ler = useDadosCache();
  return useMutation({
    mutationFn: () => repo().removerNovos(),
    onMutate: () => ({ novos: ler()?.linhas.filter((l) => l.situacao === 'ativo' && !l.paradoPendente) ?? [] }),
    onSuccess: (res, _v, ctx) => {
      inv();
      const caps = ctx?.novos ?? [];
      const ids = res.removidos;
      const n = ids.length || caps.length;
      if (!caps.length && !ids.length) return;
      registrarDesfazer({
        rotulo: `remoção de ${n} cliente${n === 1 ? '' : 's'} novo${n === 1 ? '' : 's'}`,
        // restaura pelos ids REAIS do servidor (o real); o demo usa caps (o blob)
        inverso: async () => { await repo().restaurarNovos(caps, ids); },
      });
    },
  });
}
/* ---- CANCELADOS (migs 79–81, dono 27/10): mover, status da reativação, voltar pra Gestão ----
   Nada é apagado: o Desfazer é o caminho de volta (sem 2 cliques — não é destrutivo). O inverso é o
   que o SERVIDOR guardou da ação (token): volta o estado EXATO (motivo, data, autor, status) e só de
   quem ainda está como a ação deixou — o que outra pessoa mudou depois fica como está. */
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
function desfazerCancelamento(rotulo: string, r: ResultadoCancelamento) {
  if (!r.n || (!r.token && !r.demo)) return;
  registrarDesfazer({
    rotulo,
    inverso: async () => {
      const x = await repo().desfazerCancelamento(r);
      if (!x.n) throw new Error('Nada foi desfeito: esses clientes já foram mudados por outra pessoa depois.');
    },
  });
}
export function useCancelarLeads() {
  const inv = useInvalidarDados();
  return useMutation({
    mutationFn: (a: { ids: string[]; motivo?: string }) => repo().cancelarLeads(a.ids, a.motivo),
    onSuccess: (r) => { inv(); desfazerCancelamento(`mover ${plural(r.n, 'cliente', 'clientes')} pros Cancelados`, r); },
  });
}
export function useStatusCancelamento() {
  const inv = useInvalidarDados();
  return useMutation({
    mutationFn: (a: { ids: string[]; status: StatusCancelamento }) => repo().statusCancelamento(a.ids, a.status),
    onSuccess: (r) => { inv(); desfazerCancelamento(`status de ${plural(r.n, 'cancelado', 'cancelados')}`, r); },
  });
}
export function useVoltarDosCancelados() {
  const inv = useInvalidarDados();
  return useMutation({
    mutationFn: (ids: string[]) => repo().voltarDosCancelados(ids),
    onSuccess: (r) => { inv(); desfazerCancelamento(`voltar ${plural(r.n, 'cliente', 'clientes')} pra Gestão`, r); },
  });
}

export function useLancarPagamento() {
  const inv = useInvalidarEntrada();
  return useMutation({
    mutationFn: (i: LancarPagamentoInput) => repo().lancarPagamento(i),
    onSuccess: () => { inv(); registrarBloqueada('lançar pagamento', 'O lançamento foi pro financeiro conferir — se precisar, recuse/apague na aba Financeiro.'); },
  });
}
export function useConfirmarEntrada() {
  const inv = useInvalidarEntrada();
  return useMutation({
    mutationFn: (id: string) => repo().confirmarEntrada(id),
    onSuccess: () => { inv(); registrarBloqueada('confirmar pagamento', 'Confirmação de pagamento mexe no caixa/ledger — não dá pra desfazer por aqui.'); },
  });
}
export function useRecusarEntrada() {
  const inv = useInvalidarEntrada();
  return useMutation({
    mutationFn: (a: { id: string; motivo?: string }) => repo().recusarEntrada(a.id, a.motivo),
    onSuccess: () => { inv(); registrarBloqueada('recusar pagamento', 'Recusa de pagamento mexe no ledger — não dá pra desfazer por aqui.'); },
  });
}
export function useExcluirMov() {
  const inv = useInvalidarDados();
  return useMutation({
    mutationFn: (id: string) => repo().excluirMov(id),
    onSuccess: () => { inv(); registrarBloqueada('apagar lançamento do histórico', 'O lançamento saiu do ledger em definitivo — não dá pra desfazer por aqui.'); },
  });
}
export function useMarcarCelula() {
  const inv = useInvalidarDados();
  const ler = useDadosCache();
  const papel = usePapelCache();
  return useMutation({
    mutationFn: (i: MarcarCelulaInput) => repo().marcarCelula(i),
    onMutate: (i) => ({ prev: celAtual(ler(), i.leadId, i.comp), nome: acharLead(ler(), i.leadId)?.nome }),
    onSuccess: (_d, i, ctx) => {
      inv();
      const rot = `pagamento de ${ctx?.nome ?? 'cliente'}`;
      // com comprovante o RPC grava no ledger (mov_fin 'confirmada'); desfazer só
      // a célula deixaria um lançamento fantasma inflando o financeiro → bloqueia.
      if (i.comprovante) { registrarBloqueada(rot, 'Marcar com comprovante entra no financeiro (ledger) — pra reverter, recuse/apague o lançamento na aba Financeiro.'); return; }
      const vazia = !ctx?.prev || ctx.prev === '-';
      // desfazer p/ célula vazia = limpar ('fora'), que exige gestor: sem isso o
      // comercial/financeiro tomaria erro ao desfazer o próprio "pago".
      if (vazia && !ehGestor(papel())) { registrarBloqueada(rot, 'Zerar uma célula recém-marcada é só de gestor — peça a um gestor ou ajuste na Gestão.'); return; }
      if (!celulaRestauravel(ctx?.prev)) { registrarBloqueada(rot, `O valor anterior da célula ("${ctx?.prev}") não é numérico — ajuste manualmente na grade se precisar.`); return; }
      registrarDesfazer({ rotulo: rot, inverso: async () => { await restaurarCelula(i.leadId, i.comp, ctx?.prev); } });
    },
  });
}
export function useMarcarNaoPagou() {
  const inv = useInvalidarDados();
  const ler = useDadosCache();
  const papel = usePapelCache();
  return useMutation({
    mutationFn: (a: { leadId: string; comp: string }) => repo().marcarNaoPagou(a.leadId, a.comp),
    onMutate: (a) => ({ prev: celAtual(ler(), a.leadId, a.comp), nome: acharLead(ler(), a.leadId)?.nome }),
    onSuccess: (_d, a, ctx) => {
      inv();
      const rot = `"não pagou" de ${ctx?.nome ?? 'cliente'}`;
      const vazia = !ctx?.prev || ctx.prev === '-';
      if (vazia && !ehGestor(papel())) { registrarBloqueada(rot, 'Zerar uma célula recém-marcada é só de gestor — peça a um gestor ou ajuste na Gestão.'); return; }
      if (!celulaRestauravel(ctx?.prev)) { registrarBloqueada(rot, `O valor anterior da célula ("${ctx?.prev}") não é numérico — ajuste manualmente na grade se precisar.`); return; }
      registrarDesfazer({ rotulo: rot, inverso: async () => { await restaurarCelula(a.leadId, a.comp, ctx?.prev); } });
    },
  });
}
export function useLimparCelula() {
  const inv = useInvalidarDados();
  const ler = useDadosCache();
  return useMutation({
    mutationFn: (a: { leadId: string; comp: string }) => repo().limparCelula(a.leadId, a.comp),
    onMutate: (a) => ({ prev: celAtual(ler(), a.leadId, a.comp), nome: acharLead(ler(), a.leadId)?.nome }),
    onSuccess: (_d, a, ctx) => {
      inv();
      if (!ctx?.prev || ctx.prev === '-') return; // não tinha nada pra repor
      if (!celulaRestauravel(ctx.prev)) { registrarBloqueada(`limpar célula de ${ctx?.nome ?? 'cliente'}`, `O valor anterior da célula ("${ctx.prev}") não é numérico — ajuste manualmente na grade se precisar.`); return; }
      registrarDesfazer({ rotulo: `limpar célula de ${ctx?.nome ?? 'cliente'}`, inverso: async () => { await restaurarCelula(a.leadId, a.comp, ctx?.prev); } });
    },
  });
}
export function useEditarCiclo() {
  const inv = useInvalidarDados();
  const ler = useDadosCache();
  return useMutation({
    mutationFn: (a: { dia: number; comp: string; campo: 'inicio' | 'fim' | 'cobranca'; valor: string; padrao: { inicio: string; fim: string } }) => repo().editarCiclo(a.dia, a.comp, a.campo, a.valor, a.padrao),
    onMutate: (a) => ({ prev: ler()?.ciclosDatas?.[String(a.dia)]?.[a.comp]?.[a.campo] ?? '' }),
    onSuccess: (_d, a, ctx) => {
      inv();
      registrarDesfazer({ rotulo: `data do ciclo D${dd(a.dia)}`, inverso: async () => { await repo().editarCiclo(a.dia, a.comp, a.campo, ctx?.prev ?? '', a.padrao); } });
    },
  });
}
export function useAdicionarMes() {
  const inv = useInvalidarDados();
  return useMutation({
    mutationFn: (comp: string) => repo().adicionarMes(comp),
    onSuccess: () => { inv(); registrarBloqueada('adicionar mês', 'A coluna do mês novo nasce vazia — se não usar, é só ignorar; não há dado pra desfazer.'); },
  });
}
export function useMoverTurma() {
  const inv = useInvalidarDados();
  return useMutation({
    mutationFn: (a: { diaDe: number; diaPara: number }) => repo().moverTurma(a.diaDe, a.diaPara),
    onSuccess: (res, a) => {
      inv();
      // ids EXATOS que o servidor moveu (não o cache, que podia estar velho) +
      // as datas manuais do calendário que a RPC removeu do dia de origem.
      const ids = res.movidos;
      const datas = res.origemDatas;
      // no-op (turma já estava vazia — ex.: esvaziada por outra sessão): não há
      // nada a desfazer; registrar consumiria o slot com um inverso vazio.
      if (!ids.length && !datas.length) return;
      // desfazer só recoloca em diaDe quem AINDA está em diaPara (deDia): se algum
      // lead foi parado ou re-movido depois, o undo não o ressuscita no ciclo.
      // E repõe as datas manuais do dia de origem (a turma volta como estava).
      registrarDesfazer({
        rotulo: `mover ciclo D${dd(a.diaDe)} → dia ${dd(a.diaPara)}`,
        inverso: async () => {
          await repo().moverLeadsPorId(ids, a.diaDe, a.diaPara);
          if (datas.length) await repo().reporCiclosDatas(datas);
        },
      });
    },
  });
}
export function useSalvarOrdemCiclos() {
  const inv = useInvalidarDados();
  const ler = useDadosCache();
  return useMutation({
    mutationFn: (dias: number[]) => repo().salvarOrdemCiclos(dias),
    onMutate: () => ({ antes: ler()?.ciclosOrdem ?? [] }),
    onSuccess: (_d, _dias, ctx) => {
      inv();
      const antes = ctx?.antes ?? [];
      registrarDesfazer({ rotulo: 'organizar os ciclos', inverso: async () => { await repo().salvarOrdemCiclos(antes); } });
    },
  });
}
export function useAbrirCiclo() {
  const inv = useInvalidarDados();
  return useMutation({
    mutationFn: (dia: number) => repo().abrirCiclo(dia),
    onSuccess: (_d, dia) => {
      inv();
      registrarDesfazer({ rotulo: `abrir ciclo D${dd(dia)}`, inverso: async () => { await repo().fecharCiclo(dia); } });
    },
  });
}
export function useFecharCiclo() {
  const inv = useInvalidarDados();
  return useMutation({
    mutationFn: (dia: number) => repo().fecharCiclo(dia),
    onSuccess: (_d, dia) => {
      inv();
      registrarDesfazer({ rotulo: `fechar ciclo D${dd(dia)}`, inverso: async () => { await repo().abrirCiclo(dia); } });
    },
  });
}
export function useEsvaziarCiclos() {
  const inv = useInvalidarDados();
  return useMutation({
    mutationFn: () => repo().esvaziarCiclos(),
    onSuccess: (res) => {
      inv();
      // DESFAZER: devolve cada cliente pro dia que tinha (por grupo de dia, com o
      // guard "só quem ainda está aguardando") + repõe as datas manuais removidas.
      const porDia = new Map<number, string[]>();
      for (const a of res.afetados) { const xs = porDia.get(a.dia) ?? []; xs.push(a.id); porDia.set(a.dia, xs); }
      const datas = res.datasRemovidas;
      registrarDesfazer({
        rotulo: `esvaziar todos os ciclos (${res.afetados.length} clientes)`,
        inverso: async () => {
          for (const [dia, ids] of porDia) await repo().moverLeadsPorId(ids, dia, 0);
          if (datas.length) await repo().reporCiclosDatas(datas);
        },
      });
    },
  });
}
export function useEsvaziarCiclo() {
  const inv = useInvalidarDados();
  return useMutation({
    mutationFn: (dia: number) => repo().esvaziarCiclo(dia),
    onSuccess: (res, dia) => {
      inv();
      if (!res.afetados.length) return; // ciclo já estava vazio: nada a desfazer
      const ids = res.afetados;
      registrarDesfazer({
        rotulo: `esvaziar o ciclo D${dd(dia)} (${ids.length} clientes)`,
        // devolve pro dia SÓ quem ainda está aguardando (deDia=0 → NULL no real)
        inverso: async () => { await repo().moverLeadsPorId(ids, dia, 0); },
      });
    },
  });
}
/** senhas decriptadas pra grade — 1 chamada auditada; só roda quando habilitado */
export function useSenhasGrade(habilitado: boolean) {
  return useQuery({
    queryKey: ['cobranca', 'senhas-grade'],
    enabled: habilitado,
    staleTime: 5 * 60_000, // grade não muda toda hora; set_senha invalida via inv() geral? não — refetch em 5min basta
    queryFn: async () => {
      const mapa = new Map<string, { inss: string; reclame: string }>();
      for (const s of await repo().senhasGrade()) mapa.set(s.leadId, { inss: s.inss, reclame: s.reclame });
      return mapa;
    },
  });
}
export function useMarcarParado() {
  const inv = useInvalidarDados();
  const ler = useDadosCache();
  return useMutation({
    mutationFn: (a: { leadId: string; dataParou: string }) => repo().marcarParado(a.leadId, a.dataParou),
    onMutate: (a) => { const l = acharLead(ler(), a.leadId); return { prev: l ? { situacao: l.situacao, dia: l.dia, dataParou: l.dataParou } : null, nome: l?.nome }; },
    onSuccess: (_d, a, ctx) => {
      inv();
      const prev = ctx?.prev; if (!prev) return;
      registrarDesfazer({ rotulo: `marcar débito parado de ${ctx?.nome ?? 'cliente'}`, inverso: async () => { await repo().editarLead(a.leadId, { situacao: prev.situacao, dia: prev.dia, dataParou: prev.dataParou }); } });
    },
  });
}
/* selo do menu "Novos": quantos aguardam aprovação. Chave FILHA de ['cobranca','dados']
   → toda invalidação dos dados (mutations + realtime) já atualiza o selo junto. */
export function usePendentesAprovacao(habilitado: boolean) {
  return useQuery<number>({
    queryKey: [...chavesCobranca.dados, 'pendentes-aprovacao'],
    queryFn: () => repo().contarPendentesParado(),
    enabled: habilitado,
    refetchInterval: 30_000, refetchOnWindowFocus: true,
  });
}

/* ---- APROVAÇÃO do débito parado (dono 24/09) — todas com Desfazer:
   pedir ↔ cancelar o pedido; aprovar/recusar ↔ reabrir (volta a aguardar
   com o dia/valor/data de antes). ---- */
export function useSolicitarParado() {
  const inv = useInvalidarDados();
  const ler = useDadosCache();
  return useMutation({
    mutationFn: (a: { leadId: string; dataParou: string; quem?: string }) => repo().solicitarParado(a.leadId, a.dataParou, a.quem),
    onMutate: (a) => { const l = acharLead(ler(), a.leadId); return { prevParou: l?.dataParou ?? '', nome: l?.nome }; },
    onSuccess: (_d, a, ctx) => {
      inv();
      registrarDesfazer({ rotulo: `pedido de débito parado de ${ctx?.nome ?? 'cliente'}`, inverso: async () => { await repo().cancelarParado(a.leadId, ctx?.prevParou || undefined); } });
    },
  });
}
export function useAprovarParado() {
  const inv = useInvalidarDados();
  const ler = useDadosCache();
  return useMutation({
    mutationFn: (a: { leadId: string; dia: number; valor: number | null; dataParou: string; quem?: string }) =>
      repo().aprovarParado(a.leadId, { dia: a.dia, valor: a.valor, dataParou: a.dataParou }, a.quem),
    onMutate: (a) => {
      const l = acharLead(ler(), a.leadId);
      return { prev: l ? { dia: l.dia, valor: l.valor, dataParou: l.dataParou } : null, nome: l?.nome };
    },
    onSuccess: (_d, a, ctx) => {
      inv();
      const prev = ctx?.prev; if (!prev) return;
      registrarDesfazer({ rotulo: `aprovação do débito parado de ${ctx?.nome ?? 'cliente'}`, inverso: async () => { await repo().reabrirParado(a.leadId, prev); } });
    },
  });
}
export function useRecusarParado() {
  const inv = useInvalidarDados();
  const ler = useDadosCache();
  return useMutation({
    mutationFn: (a: { leadId: string; motivo?: string }) => repo().recusarParado(a.leadId, a.motivo),
    onMutate: (a) => {
      const l = acharLead(ler(), a.leadId);
      return { prev: l ? { dia: l.dia, valor: l.valor, dataParou: l.dataParou } : null, nome: l?.nome };
    },
    onSuccess: (_d, a, ctx) => {
      inv();
      const prev = ctx?.prev; if (!prev) return;
      registrarDesfazer({ rotulo: `recusa do débito parado de ${ctx?.nome ?? 'cliente'}`, inverso: async () => { await repo().reabrirParado(a.leadId, prev); } });
    },
  });
}
export function useCancelarParado() {
  const inv = useInvalidarDados();
  const ler = useDadosCache();
  return useMutation({
    mutationFn: (a: { leadId: string }) => repo().cancelarParado(a.leadId),
    onMutate: (a) => { const l = acharLead(ler(), a.leadId); return { prevParou: l?.dataParou ?? '', nome: l?.nome }; },
    onSuccess: (_d, a, ctx) => {
      inv();
      registrarDesfazer({ rotulo: `cancelamento do pedido de ${ctx?.nome ?? 'cliente'}`, inverso: async () => { await repo().solicitarParado(a.leadId, ctx?.prevParou ?? ''); } });
    },
  });
}

export function useImportarCiclo() {
  const inv = useInvalidarDados();
  return useMutation({
    mutationFn: (a: { linhas: GLinha[]; comps: string[]; situacao: SitDebito; cicloNome: string; dataCobranca: string }) => repo().importarComCiclo(a),
    onSuccess: (_d, a) => { inv(); registrarBloqueada(`importar ciclo "${a.cicloNome}"`, 'Importação cria muitos clientes de uma vez — pra reverter, exclua o ciclo na Gestão (ou use a Lixeira).'); },
  });
}
/* importar DENTRO de um ciclo existente (botão por ciclo no Gerenciar Ciclos) */
export function useImportarNoCiclo() {
  const inv = useInvalidarDados();
  return useMutation({
    mutationFn: (a: { linhas: GLinha[]; comps: string[]; situacao: SitDebito; dia: number }) => repo().importarNoCiclo(a),
    onSuccess: (_d, a) => { inv(); registrarBloqueada(`importar no ciclo D${String(a.dia).padStart(2, '0')}`, 'Importação cria muitos clientes de uma vez — pra reverter, exclua os clientes na Gestão (ou use a Lixeira).'); },
  });
}

/* revelar senha NÃO cacheia o texto (mutation) — e não é ação de desfazer */
export function useRevelarSenha() {
  return useMutation({ mutationFn: (a: { leadId: string; campo: CampoSenha }) => repo().revelarSenha(a.leadId, a.campo) });
}

/* assinar comprovante (URL curta) sob clique — benigno, não mexe no slot */
export function useAssinarComprovante() {
  return useMutation({ mutationFn: (comp: { url?: string; path?: string }) => repo().assinarComprovante(comp) });
}
