/* =====================================================================
   Contrato único da camada de dados de Cobranças.
   Duas implementações conformam a esta interface:
     - cobrancaRepo.demo.ts     -> localStorage (modo demonstração)
     - cobrancaRepo.supabase.ts -> Supabase (instância real da Reviza)
   A fábrica escolhe pela INSTÂNCIA: o repo real SÓ liga em isRevizaMode
   (VITE_APP_INSTANCIA=reviza + Supabase da Reviza configurado). Qualquer
   outro build — demo E o Atenvo de produção — usa o demo/localStorage,
   exatamente como antes da migração (nunca aponta pro banco errado).
   ===================================================================== */
import { isPrevia, isRevizaMode, supabase } from '@/lib/supabase';
import { criarRepoDemo } from './cobrancaRepo.demo';
import { criarRepoSupabase } from './cobrancaRepo.supabase';
import type {
  Dados, GLinha, Entrada, NovoLead, PatchLead, SitDebito,
  LancarPagamentoInput, MarcarCelulaInput, CampoSenha, StatusCancelamento, ResultadoCancelamento,
} from './types';

/** linha de data manual do calendário (ciclos_datas) */
export interface CicloDataRow { dia: number; comp: string; inicio: string | null; fim: string | null; cobranca: string | null }
/** resultado do mover turma (o desfazer e o aviso usam) */
export interface MoverTurmaResultado { movidos: string[]; origemDatas: CicloDataRow[]; destinoLimpas: number; fusao: boolean }
/** resultado do esvaziar ciclos (o desfazer repõe cada lead no dia antigo) */
export interface EsvaziarResultado { afetados: { id: string; dia: number }[]; datasRemovidas: CicloDataRow[] }

export interface CobrancaRepo {
  /** carrega o blob Dados completo (equivalente ao antigo gsCarregar) */
  carregar(): Promise<Dados>;

  criarLead(input: NovoLead): Promise<GLinha>;
  editarLead(id: string, patch: PatchLead): Promise<void>;
  excluirLead(id: string): Promise<void>;
  /** DESFAZER exclusão: restaura da lixeira o cliente recém-excluído (real);
      no demo, recoloca a linha capturada. `cap` = a linha como estava antes. */
  restaurarExcluido(cap: GLinha): Promise<void>;

  /** remove TODOS os "Novos" (situacao='ativo') de uma vez (dono 17/09). Vão pra
      lixeira (reversível). Devolve os ids apagados — o Desfazer restaura em lote. */
  removerNovos(): Promise<{ removidos: string[] }>;
  /** DESFAZER do removerNovos: traz os leads de volta de uma vez. `caps` = as
      linhas como estavam (o demo recoloca essas); `ids` = os ids que o SERVIDOR
      realmente apagou (o real restaura por esses — cobre quem foi apagado além
      do que o cache local conhecia, ex.: cadastros de outra sessão). */
  restaurarNovos(caps: GLinha[], ids: string[]): Promise<void>;

  /** CANCELADOS (migs 79/80): move vários clientes pra aba Cancelados (sai da Gestão, dos Novos e
      da régua; nada é apagado). Devolve quantos mudaram e o estado ANTES de cada um (só dos que
      mudaram — quem já estava lá não conta) */
  cancelarLeads(ids: string[], motivo?: string): Promise<ResultadoCancelamento>;
  /** status da reativação de quem está nos Cancelados (o comercial só muda os clientes dele) */
  statusCancelamento(ids: string[], status: StatusCancelamento): Promise<ResultadoCancelamento>;
  /** "Voltar pra Gestão": tira dos Cancelados — a linha volta no mesmo lugar da planilha */
  voltarDosCancelados(ids: string[]): Promise<ResultadoCancelamento>;
  /** Desfazer de uma das 3 acima: volta o estado anterior EXATO só de quem ainda está como a ação
      deixou (o que outra pessoa mudou depois fica). n = quantos voltaram, total = quantos a ação mudou */
  desfazerCancelamento(r: ResultadoCancelamento): Promise<{ n: number; total: number }>;

  /** comercial lança um pagamento p/ o financeiro confirmar */
  lancarPagamento(input: LancarPagamentoInput): Promise<Entrada>;
  confirmarEntrada(entradaId: string): Promise<void>;
  recusarEntrada(entradaId: string, motivo?: string): Promise<void>;
  /** apaga UM lançamento do histórico de conferência (só admin; não desfaz a célula da grade) */
  excluirMov(movId: string): Promise<void>;

  /** grade: marcar pago (com comprovante opcional) / não pagou / limpar */
  marcarCelula(input: MarcarCelulaInput): Promise<void>;
  marcarNaoPagou(leadId: string, comp: string): Promise<void>;
  limparCelula(leadId: string, comp: string): Promise<void>;

  /** abre a coluna de um mês novo na grade (planilha viva): cria a competência */
  adicionarMes(comp: string): Promise<void>;

  /** grava UM campo da janela do ciclo; o repo mergeia com o estado atual (padrão quando vazio) */
  editarCiclo(dia: number, comp: string, campo: 'inicio' | 'fim' | 'cobranca', valor: string, padrao: { inicio: string; fim: string }): Promise<void>;
  /** move a turma inteira (todos os leads com dia=diaDe) para outro dia.
      TRANSACIONAL no real (RPC mover_turma): além dos leads, limpa as datas
      manuais do calendário (ciclos_datas) que ficariam órfãs — as do dia de
      origem (devolvidas em origemDatas p/ aviso e desfazer) e as residuais do
      destino quando ele estava vazio. Devolve os IDS EXATOS movidos (o desfazer
      usa esses, não o cache). */
  moverTurma(diaDe: number, diaPara: number): Promise<MoverTurmaResultado>;
  /** repõe linhas de datas manuais do calendário (usado pelo DESFAZER do mover) */
  reporCiclosDatas(rows: CicloDataRow[]): Promise<void>;
  /** salva a ordem dos chips de ciclo escolhida arrastando (compartilhada; [] = padrão por dia) */
  salvarOrdemCiclos(dias: number[]): Promise<void>;
  /** abre um ciclo VAZIO no dia (aparece na lista/selects pra receber clientes) */
  abrirCiclo(dia: number): Promise<void>;
  /** fecha um dia aberto (só some da lista se estiver vazio de verdade) */
  fecharCiclo(dia: number): Promise<void>;
  /** esvazia TODOS os ciclos: todo lead com dia vira "aguardando" (dono 17/09,
      reorganização). Devolve id+dia antigo de cada um e as datas manuais
      removidas — o DESFAZER repõe tudo. */
  esvaziarCiclos(): Promise<EsvaziarResultado>;
  /** esvazia UM ciclo: as pessoas saem (aguardando), mas o dia CONTINUA aberto e
      as datas manuais dele PERMANECEM (dono 17/09: "remove todas; as datas ali
      permanecem no ciclo"). Devolve os ids pro desfazer. */
  esvaziarCiclo(dia: number): Promise<{ afetados: string[] }>;
  /** senhas decriptadas pra GRADE (dono 17/09: sem pontinhos) — 1 chamada, 1 linha
      de auditoria; comercial recebe só as dos clientes dele (gate no banco). */
  senhasGrade(): Promise<{ leadId: string; inss: string; reclame: string }[]>;
  /** move SÓ estes leads (por id) para um dia — usado pra DESFAZER um moverTurma
      de forma segura mesmo quando o dia-alvo já tinha gente (não arrasta os outros).
      `deDia` (opcional): só move quem AINDA está nesse dia (não ressuscita quem foi
      parado/re-movido depois). */
  moverLeadsPorId(ids: string[], dia: number, deDia?: number): Promise<void>;
  /** débito parou → sai dos Novos e entra na Gestão SEM ciclo (dia zerado):
      o direcionamento pro ciclo é um comando separado, feito na Gestão (regra do dono 11/09) */
  marcarParado(leadId: string, dataParou: string): Promise<void>;

  /* ---- APROVAÇÃO do débito parado (dono 24/09) ----
     Qualquer papel PEDE (comercial só nos dele); o cliente fica nos Novos
     "aguardando aprovação". Financeiro/cadastro/admin APROVAM decidindo ciclo,
     valor e data — só aí ele vai pra Gestão. `quem` é só pra exibir no demo
     (no real o banco usa o usuário logado). */
  solicitarParado(leadId: string, dataParou: string, quem?: string): Promise<void>;
  aprovarParado(leadId: string, a: { dia: number; valor: number | null; dataParou: string }, quem?: string): Promise<void>;
  recusarParado(leadId: string, motivo?: string): Promise<void>;
  /** tira o pedido (quem pediu ou aprovador); também é o Desfazer do "pedir" */
  cancelarParado(leadId: string, dataParouAnterior?: string): Promise<void>;
  /** volta a "aguardando aprovação" repondo dia/valor/data — Desfazer do aprovar/recusar */
  reabrirParado(leadId: string, a: { dia: number; valor: number; dataParou: string }): Promise<void>;
  /** quantos aguardam aprovação (selo do menu "Novos" pra quem aprova) */
  contarPendentesParado(): Promise<number>;

  /** importa uma planilha CRIANDO um ciclo (nome + data da cobrança); leads entram na situação dada */
  importarComCiclo(a: { linhas: GLinha[]; comps: string[]; situacao: SitDebito; cicloNome: string; dataCobranca: string }): Promise<{ leads: number; dia: number; celulasIgnoradas: number }>;
  /** importa uma planilha DENTRO de um ciclo que já existe (dono 17/09: o botão
      fica em Gerenciar Ciclos, POR ciclo). O dia é o do ciclo; as datas manuais
      dele (ciclos_datas) não são tocadas. */
  importarNoCiclo(a: { linhas: GLinha[]; comps: string[]; situacao: SitDebito; dia: number }): Promise<{ leads: number; celulasIgnoradas: number }>;

  /** Storage: URL assinada e curta p/ abrir um comprovante (real); no demo devolve a própria url */
  assinarComprovante(comp: { url?: string; path?: string }): Promise<string>;
  /** revela UMA senha de UM lead (só gestor/admin no real); no demo devolve o valor salvo */
  revelarSenha(leadId: string, campo: CampoSenha): Promise<string>;
}

let _repo: CobrancaRepo | null = null;

/** devolve o repositório certo p/ o modo atual (memoizado). */
export function getCobrancaRepo(): CobrancaRepo {
  if (_repo) return _repo;
  _repo = (isRevizaMode && supabase && !isPrevia) ? criarRepoSupabase(supabase) : criarRepoDemo();
  return _repo;
}
