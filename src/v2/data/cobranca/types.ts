/* =====================================================================
   Reviza Cobranças — modelo de dados compartilhado (demo e Supabase)
   Espelha os tipos que hoje vivem em cobrancaMotor.tsx para que a UI
   possa migrar para os hooks sem mudar de forma. `Comprovante` é
   estendido: no demo usa `url` (data URL); no real usa `path` (Storage
   privado) e a URL assinada é obtida sob demanda.
   ===================================================================== */

export type SitDebito = 'ativo' | 'cancelado';
/* 'atendente' (11/11): quem trabalha SÓ no Atendimento (o Atenvo dentro da Reviza) — não tem papel na cobrança */
export type Papel = 'admin' | 'gestor' | 'comercial' | 'financeiro' | 'cadastro' | 'atendente';

export interface Comprovante {
  nome: string;
  url: string;    // demo: data URL. real: '' até assinar (a URL curta é obtida ao abrir via `path`)
  path?: string;  // real: caminho no bucket privado do Storage
}

export interface GLinha {
  id: string; nome: string; comercial: string; dia: number; banco: string;
  nb: string; cpf: string; senha: string;               // senha do INSS (nunca vem no load do banco)
  reclameLogin: string; reclameSenha: string;            // Reclame Aqui (senha nunca vem no load)
  valor: number; ultimoPgto: string;                     // valor = parcela TOTAL (mensal = metade)
  salario?: number;                                      // salário exato (legado/import; a ficha usa a faixa)
  faixa?: 'ate_1sm' | 'acima_1sm';                       // faixa do benefício — é o que a tabela do INSS usa
  fechamento: string; recebe: string; telefone: string;
  situacao: SitDebito; dataReclamacao: string; dataParou: string;
  parou: string;
  obs?: string;                                          // observações livres do cadastro
  celulas: string[];                                     // uma por competência: número=pago, 'NÃO PAGOU', '-'
  // "débito parado" AGUARDANDO APROVAÇÃO (dono 24/09): o cliente segue nos Novos
  // (situacao 'ativo') até financeiro/cadastro/admin aprovar — e decidir ciclo/valor/data.
  paradoPendente?: boolean;
  paradoSolicitadoPor?: string;                          // id de quem pediu (cancelar o próprio pedido)
  paradoSolicitadoNome?: string; paradoSolicitadoEm?: string;
  paradoAprovadoNome?: string; paradoAprovadoEm?: string;
  // CANCELADOS (mig 79, dono 27/10): preenchido = o cliente está na aba Cancelados — fora da
  // Gestão, dos Novos, da carteira e da régua; o histórico de pagamentos continua
  cancelamento?: StatusCancelamento | null;
  canceladoEm?: string; canceladoPorNome?: string; cancelamentoMotivo?: string;
  cancelamentoEm?: string; cancelamentoPorNome?: string;   // última mudança de status
}
/** cancelado → em processo de reativação → desconto reativado (reativado FICA nos Cancelados) */
export type StatusCancelamento = 'cancelado' | 'em_reativacao' | 'reativado';
/** estado do cancelamento de UM cliente (o que o Desfazer regrava) */
export interface EstadoCancelamento {
  id: string; cancelamento: StatusCancelamento | null; cancelado_em: string | null; cancelado_por_nome: string | null;
  cancelamento_motivo: string | null; cancelamento_em: string | null; cancelamento_por_nome: string | null;
}
/** o que as ações dos Cancelados devolvem: quantos mudaram + como desfazer. Real (mig 81): um
    token — o estado de antes fica guardado no servidor (só quem fez desfaz, 1 vez, em até 1 h).
    Demo: o estado de antes + a marca que a ação deixou (mesma regra: só volta quem ainda está assim) */
export interface ResultadoCancelamento {
  n: number;
  token?: string | null;
  demo?: { tipo: 'cancelar' | 'status' | 'voltar'; marca: string; antes: EstadoCancelamento[] };
}

export interface Entrada {
  id: string; leadId: string; leadNome: string; comp: string; valor: number; por: string; quando: string;
  comprovante?: Comprovante;
}

export interface MovFin {
  id: string; leadNome: string; comercial: string; comp: string; valor: number;
  status: 'confirmada' | 'recusada'; quando: string; comprovante?: Comprovante;
}

/** só DEMO: entrada JÁ DECIDIDA pelo financeiro — espelho das linhas de `entradas` com
    estado confirmada/recusada (as pendentes são Dados.pendentes). Vive numa chave
    própria do localStorage (demoStore), FORA do histórico: apagar um lançamento do
    histórico não mexe na decisão, igual ao real (delete em mov_fin não toca entradas).
    A planilha pinta o mês de vermelho pela última decisão quando ela é recusa.
    celula = a célula do store no momento da recusa (mudou depois = o pagamento mudou →
    a recusa sai da célula). */
export interface EntradaDecidida extends Omit<Entrada, 'comprovante'> {
  estado: 'confirmada' | 'recusada'; resolvidoEm: string; motivo?: string;
  temComprovante: boolean; celula?: string;
}

export interface Dados {
  comps: string[];
  /** clientes da Gestão/Novos — SEM os cancelados */
  linhas: GLinha[];
  /** os da aba Cancelados (cancelamento preenchido). Ficam FORA de `linhas` (Gestão, Novos, painel,
      régua…); entram só onde conta o histórico (faturamento/comissões — ver clientesReais) */
  cancelados?: GLinha[];
  pendentes: Entrada[];
  historico: MovFin[];
  ciclosDatas?: Record<string, Record<string, { inicio: string; fim: string; cobranca?: string }>>;
  /** dias ABERTOS à mão pelo gestor (ciclo pode existir vazio, pra receber clientes) */
  ciclosAbertos?: number[];
  /** ordem escolhida arrastando os chips (dias fora da lista vão pro fim, por dia) */
  ciclosOrdem?: number[];
}

/* ---- entradas de operação (inputs dos métodos do repositório) ---- */
export type NovoLead = Omit<GLinha, 'id' | 'celulas'> & { celulas?: string[] };
export type PatchLead = Partial<Omit<GLinha, 'id'>>;
export interface LancarPagamentoInput { leadId: string; comp: string; valor: number; comprovante?: Comprovante; }
export interface MarcarCelulaInput { leadId: string; comp: string; valor: number; comprovante?: Comprovante; }
export type CampoSenha = 'inss' | 'reclame';
