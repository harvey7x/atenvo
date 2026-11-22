/* =====================================================================
   INTEGRAÇÕES da Reviza (dono 22/11): "uma tela com vários quadradinhos que dá para integrar; um
   deles vai ser o Asaas — e tem que ter a configuração para integrar o Asaas de pagamento".

   CONTRATO COM O SERVIDOR (o que a tela espera; na prévia é simulado em lib/previa):
   · tabela `integracoes` — uma linha por serviço, só o administrador lê:
       servico 'asaas' · conectado · ambiente 'producao' | 'testes' · conta {nome, documento, email}
       · chave_final (os 4 últimos caracteres) · conectado_em · conectado_por · retorno_ativo
       · ultimo_retorno · config (jsonb — ConfigAsaas)
   · Edge Function `reviza-asaas` (confere que quem chama é administrador):
       conectar {ambiente, chave}   valida a chave no Asaas (dados da conta), guarda a chave SÓ no
                                    servidor, cadastra o retorno dos pagamentos e devolve a conta
       testar                       consulta a conta de novo com a chave guardada
       salvar {config}              grava as regras
       desconectar                  apaga a chave e remove o retorno dos pagamentos
       reativar_retorno             religa o retorno dos pagamentos quando o Asaas o pausou
   A CHAVE DE API nunca volta para a tela nem fica na tabela: só os 4 últimos caracteres, para a
   pessoa reconhecer qual chave está em uso.

   COMO CADA REGRA VIRA CHAMADA NO ASAAS (conferido na documentação deles em 22/11):
   · a chave vai no cabeçalho `access_token`; produção e testes são contas e endereços separados
     (api.asaas.com × api-sandbox.asaas.com); contas novas exigem também o cabeçalho User-Agent
   · o cliente é criado com nome e CPF/CNPJ (os dois obrigatórios) — sem CPF não há cobrança; a API
     aceita cliente repetido, então o servidor procura pelo CPF antes de criar
   · `forma` → billingType da cobrança, que é UM só: PIX, BOLETO, CREDIT_CARD ou UNDEFINED (o
     cliente escolhe entre as formas ligadas na conta do Asaas). O link da mensagem é o invoiceUrl
   · Pix exige uma chave Pix cadastrada na conta do Asaas
   · `atraso` 'asaas' → não manda multa nem juros (vale o que está configurado na conta do Asaas;
     mandar vazio apagaria essa configuração); 'aqui' → fine.value e interest.value, em %
   · `avisosAsaas` desligado → cliente criado com notificationDisabled (o Asaas cobra pelos avisos)
   · baixa: PAYMENT_CONFIRMED = pago; PAYMENT_RECEIVED = dinheiro disponível (cartão: 32 dias depois)
   · o retorno (webhook) leva um authToken próprio, conferido no cabeçalho asaas-access-token; o
     mesmo evento pode chegar mais de uma vez (usar o id); 15 falhas seguidas pausam a fila
   ===================================================================== */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export type AmbienteAsaas = 'producao' | 'testes';
/** a forma de pagamento da cobrança — no Asaas é UMA por cobrança ('escolhe' = o cliente decide na hora) */
export type FormaPagamento = 'escolhe' | 'pix' | 'boleto' | 'cartao';
export const FORMAS: readonly { id: FormaPagamento; rotulo: string; dica: string }[] = [
  { id: 'escolhe', rotulo: 'O cliente escolhe', dica: 'Na página de pagamento ele vê as formas que estão ligadas na sua conta do Asaas.' },
  { id: 'pix', rotulo: 'Pix', dica: 'QR Code e copia e cola. Precisa de uma chave Pix cadastrada na conta do Asaas.' },
  { id: 'boleto', rotulo: 'Boleto', dica: 'Para pagar no banco ou na lotérica. Com o Pix disponível na conta, o boleto também aceita Pix.' },
  { id: 'cartao', rotulo: 'Cartão de crédito', dica: 'O cliente paga com o cartão dele. O dinheiro fica disponível 32 dias depois.' },
];
export const ROTULO_AMBIENTE_ASAAS: Record<AmbienteAsaas, string> = { producao: 'Produção', testes: 'Testes' };

export interface ConfigAsaas {
  /** como o cliente paga */
  forma: FormaPagamento;
  /** o sistema cria a cobrança de cada parcela quando a régua vai avisar o cliente */
  gerarSozinho: boolean;
  /** pagamento que entra pelo Asaas já chega confirmado no Financeiro (sem comprovante) */
  baixaAutomatica: boolean;
  /** cartão: dar baixa quando o Asaas confirma, ou só quando o dinheiro fica disponível na conta */
  baixaQuando: 'confirmado' | 'disponivel';
  /** avisa o comercial dono do cliente no sino quando o pagamento entra */
  avisarComercial: boolean;
  /** multa e juros: 'asaas' = vale o que está configurado na conta do Asaas; 'aqui' = os dois campos abaixo */
  atraso: 'asaas' | 'aqui';
  /** % cobrado uma vez depois do vencimento (0 = sem multa) */
  multa: number;
  /** % ao mês depois do vencimento (0 = sem juros) */
  juros: number;
  /** deixa o próprio Asaas mandar e-mail e SMS ao cliente (a régua já avisa pelo WhatsApp) */
  avisosAsaas: boolean;
}
export const CONFIG_ASAAS_PADRAO: ConfigAsaas = {
  forma: 'escolhe', gerarSozinho: true, baixaAutomatica: true, baixaQuando: 'confirmado',
  avisarComercial: true, atraso: 'asaas', multa: 0, juros: 0, avisosAsaas: false,
};
export interface ContaAsaas {
  nome: string; documento: string | null; email: string | null;
  /** a conta tem chave Pix cadastrada? (null = o servidor não conseguiu conferir) */
  chavePix: boolean | null;
}
export interface IntegracaoAsaas {
  conectado: boolean;
  ambiente: AmbienteAsaas | null;
  conta: ContaAsaas | null;
  chaveFinal: string | null;
  conectadoEm: string | null;
  conectadoPor: string | null;
  retornoAtivo: boolean;
  ultimoRetorno: string | null;
  config: ConfigAsaas;
}
const ASAAS_VAZIO: IntegracaoAsaas = {
  conectado: false, ambiente: null, conta: null, chaveFinal: null, conectadoEm: null, conectadoPor: null,
  retornoAtivo: false, ultimoRetorno: null, config: CONFIG_ASAAS_PADRAO,
};

/* ---------------- leitura tolerante (o que vier torto vira o padrão) ---------------- */
const num = (v: unknown, teto: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(teto, Math.max(0, Math.round(n * 100) / 100)) : 0; };
export function lerConfigAsaas(bruto: unknown): ConfigAsaas {
  const b = (bruto && typeof bruto === 'object' ? bruto : {}) as Record<string, unknown>;
  const liga = (c: keyof ConfigAsaas) => (typeof b[c] === 'boolean' ? (b[c] as boolean) : (CONFIG_ASAAS_PADRAO[c] as boolean));
  return {
    forma: FORMAS.some((f) => f.id === b.forma) ? (b.forma as FormaPagamento) : CONFIG_ASAAS_PADRAO.forma,
    gerarSozinho: liga('gerarSozinho'), baixaAutomatica: liga('baixaAutomatica'),
    baixaQuando: b.baixaQuando === 'disponivel' ? 'disponivel' : 'confirmado',
    avisarComercial: liga('avisarComercial'), atraso: b.atraso === 'aqui' ? 'aqui' : 'asaas', multa: num(b.multa, 10), juros: num(b.juros, 10), avisosAsaas: liga('avisosAsaas'),
  };
}
function lerAsaas(l: Record<string, unknown> | undefined): IntegracaoAsaas {
  if (!l) return ASAAS_VAZIO;
  const c = (l.conta && typeof l.conta === 'object' ? l.conta : null) as Record<string, unknown> | null;
  const txt = (v: unknown) => (v == null || v === '' ? null : String(v));
  return {
    conectado: !!l.conectado,
    ambiente: l.ambiente === 'testes' ? 'testes' : l.ambiente === 'producao' ? 'producao' : null,
    conta: c ? { nome: String(c.nome ?? ''), documento: txt(c.documento), email: txt(c.email), chavePix: typeof c.chave_pix === 'boolean' ? c.chave_pix : null } : null,
    chaveFinal: txt(l.chave_final), conectadoEm: txt(l.conectado_em), conectadoPor: txt(l.conectado_por),
    retornoAtivo: !!l.retorno_ativo, ultimoRetorno: txt(l.ultimo_retorno), config: lerConfigAsaas(l.config),
  };
}

/* ---------------- a chave de API (regras da tela; o servidor confere de verdade) ---------------- */
/** o ambiente que a própria chave declara ($aact_prod_ / $aact_hmlg_); null = chave antiga, sem marca */
export function ambienteDaChave(chave: string): AmbienteAsaas | null {
  const c = chave.trim();
  return c.startsWith('$aact_prod_') ? 'producao' : c.startsWith('$aact_hmlg_') ? 'testes' : null;
}
/** mensagem de erro da chave digitada ('' = pode mandar testar) */
export function chaveInvalida(chave: string, ambiente: AmbienteAsaas): string {
  const c = chave.trim();
  if (!c) return 'Cole a chave de API do Asaas.';
  if (!c.startsWith('$aact_')) return 'A chave do Asaas começa com $aact_ — confira se copiou a chave inteira, com o cifrão.';
  if (c.length < 24) return 'A chave parece incompleta. Copie de novo no Asaas.';
  const dela = ambienteDaChave(c);
  if (dela && dela !== ambiente) return dela === 'testes'
    ? 'Esta chave é do ambiente de testes. Escolha "Testes" ou use a chave de produção.'
    : 'Esta chave é de produção. Escolha "Produção" ou use a chave de testes.';
  return '';
}

/* ---------------- consulta e ações ---------------- */
const CHAVE = ['reviza', 'integracoes'] as const;
const COLS = 'servico, conectado, ambiente, conta, chave_final, conectado_em, conectado_por, retorno_ativo, ultimo_retorno, config';

export function useAsaas() {
  const q = useQuery({
    queryKey: CHAVE,
    queryFn: async (): Promise<IntegracaoAsaas> => {
      if (!supabase) throw new Error('Sem conexão com o servidor.');
      const { data, error } = await supabase.from('integracoes').select(COLS);
      if (error) throw error;
      return lerAsaas(((data ?? []) as Record<string, unknown>[]).find((l) => l.servico === 'asaas'));
    },
    staleTime: 30_000,
  });
  return { dados: q.data ?? ASAAS_VAZIO, carregando: q.isLoading, falhou: q.isError, recarregar: () => { void q.refetch(); } };
}

const MSG: Record<string, string> = {
  invalid_access_token: 'O Asaas não reconheceu esta chave. Confira se ela está ativa e foi copiada inteira.',
  invalid_environment: 'Esta chave é de outro ambiente. Troque entre Produção e Testes e tente de novo.',
  access_token_not_found: 'A chave não chegou ao Asaas. Tente de novo.',
  nao_conectado: 'O Asaas não está conectado.',
  forbidden: 'O Asaas recusou o acesso do sistema. Confira no Asaas se a chave está ativa e sem restrição de IP.',
};
async function chamar(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (!supabase) throw new Error('Sem conexão com o servidor.');
  const { data, error } = await supabase.functions.invoke('reviza-asaas', { body });
  if (error) {
    let msg = error.message;
    try { const j = await (error as { context?: Response }).context?.json?.(); if (j?.error) msg = j.error; } catch { /* fica a mensagem do erro */ }
    throw new Error(MSG[msg] ?? msg);
  }
  const corpo = (data ?? {}) as Record<string, unknown>;
  if (corpo.error) throw new Error(MSG[String(corpo.error)] ?? String(corpo.error));
  return corpo;
}
function useAcao<V>(montar: (v: V) => Record<string, unknown>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (v: V) => chamar(montar(v)), onSuccess: () => qc.invalidateQueries({ queryKey: CHAVE }) });
}
/** valida a chave no Asaas e conecta (ou troca a chave de uma conta já conectada) */
export const useConectarAsaas = () => useAcao((v: { ambiente: AmbienteAsaas; chave: string }) => ({ acao: 'conectar', ambiente: v.ambiente, chave: v.chave.trim() }));
/** consulta a conta de novo com a chave guardada — devolve { conta } */
export const useTestarAsaas = () => useAcao((_: void) => ({ acao: 'testar' }));
export const useSalvarAsaas = () => useAcao((config: ConfigAsaas) => ({ acao: 'salvar', config }));
export const useDesconectarAsaas = () => useAcao((_: void) => ({ acao: 'desconectar' }));
/** o Asaas pausa o retorno depois de 15 falhas seguidas; isto religa e os avisos pendentes voltam a chegar */
export const useReativarRetornoAsaas = () => useAcao((_: void) => ({ acao: 'reativar_retorno' }));
