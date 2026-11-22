/* =====================================================================
   WHATSAPP OFICIAL — a API oficial do WhatsApp, da Meta (dono 22/11): "quero WhatsApp via API
   oficial; uma tela boa, simples de configurar; tem que ser tudo muito fácil de configurar".

   CONTRATO COM O SERVIDOR — Edge Function `reviza-wa-oficial` (só administrador; na prévia é
   simulada em lib/previa). O código de acesso da Meta fica SÓ no servidor: nunca volta para a tela.
     situacao                         a conta, os números conectados e os modelos de mensagem
     entrar_facebook {code, waba_id, phone_number_id, no_celular}
                                      troca o código do cadastro da Meta pelo acesso da empresa
     buscar_numeros {token}           confere o código de acesso e lista os números da conta
       → as duas devolvem { sessao, empresa, numeros } (a sessão guarda o acesso no servidor)
     conectar {sessao, phone_number_id, ambiente, nome, no_celular}
                                      registra o número, liga o recebimento, traz os modelos e
                                      devolve a conferência (o que ficou certo e o que falta)
     testar {id} · enviar_teste {id, para, modelo} · desconectar {id}
     modelos_sync                     traz da Meta a situação de cada modelo
     modelo_criar {nome, categoria, texto}   manda um modelo novo para a aprovação da Meta

   COMO A META FUNCIONA (conferido na documentação dela em 22/11):
   · o caminho fácil é o cadastro incorporado ("entrar com o Facebook"): a pessoa escolhe a empresa
     e o número na janela da Meta. Para isso o aplicativo do sistema precisa estar aprovado na Meta
     (acesso avançado às duas permissões do WhatsApp) — `facebook` diz se já está
   · continuar usando o número no aplicativo WhatsApp Business do celular só existe por esse cadastro
   · sem ele: um código de acesso de usuário do sistema, com as permissões do WhatsApp
   · fora das 24 h depois da última mensagem do cliente, só sai MODELO aprovado (utilidade ou
     marketing); desde 01/10/2026 a Meta cobra por mensagem também dentro das 24 h
   · limite por dia: 250 clientes diferentes; 2.000 com a empresa verificada; depois sobe sozinho
   · a Meta analisa a empresa e cada modelo, e a política dela barra alguns ramos (entre eles
     empresas de cobrança de dívidas) — conta recusada perde o número
   ===================================================================== */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isPrevia, supabase } from '@/lib/supabase';
import type { Ambiente } from '../modulos';

export type QualidadeOficial = 'alta' | 'media' | 'baixa' | 'desconhecida';
export type SituacaoNome = 'aprovado' | 'analise' | 'recusado';
export const ROTULO_QUALIDADE: Record<QualidadeOficial, string> = { alta: 'Alta', media: 'Média', baixa: 'Baixa', desconhecida: 'Ainda sem avaliação' };
export const ROTULO_NOME: Record<SituacaoNome, string> = { aprovado: 'Aprovado pela Meta', analise: 'Em análise na Meta', recusado: 'Recusado pela Meta' };

export interface NumeroOficial {
  id: string; nome: string; numero: string; nomeExibicao: string; nomeSituacao: SituacaoNome; qualidade: QualidadeOficial;
  ambiente: Ambiente;
  /** continua também no aplicativo WhatsApp Business do celular */
  noCelular: boolean;
  recebimento: boolean; bloqueado: boolean; conectadoEm: string | null; conectadoPor: string | null;
}
export type CategoriaModelo = 'utilidade' | 'marketing';
export type SituacaoModelo = 'aprovado' | 'analise' | 'recusado';
export const CATEGORIAS: readonly { id: CategoriaModelo; rotulo: string; dica: string }[] = [
  { id: 'utilidade', rotulo: 'Utilidade', dica: 'Aviso sobre a conta ou o pagamento do próprio cliente: lembrete de parcela, confirmação, recibo. Sem oferta nem propaganda.' },
  { id: 'marketing', rotulo: 'Marketing', dica: 'Oferta, novidade ou convite. A Meta cobra mais caro e limita quantas o cliente recebe.' },
];
export const ROTULO_SIT_MODELO: Record<SituacaoModelo, string> = { aprovado: 'Aprovado', analise: 'Em análise', recusado: 'Recusado' };
export interface ModeloOficial { id: string; nome: string; categoria: CategoriaModelo; idioma: string; situacao: SituacaoModelo; texto: string; motivo: string | null }
export interface ContaOficial {
  empresa: { nome: string; verificada: boolean } | null;
  /** clientes diferentes por dia fora das 24 h (null = sem limite) */
  limiteDia: number | null;
  /** há forma de pagamento cadastrada na Meta (null = não deu para conferir) */
  pagamento: boolean | null;
  /** a entrada pelo Facebook está liberada nesta instalação (aplicativo aprovado na Meta) */
  facebook: boolean;
  numeros: NumeroOficial[];
  modelos: ModeloOficial[];
}
const VAZIA: ContaOficial = { empresa: null, limiteDia: null, pagamento: null, facebook: false, numeros: [], modelos: [] };

export interface NumeroAchado { phoneNumberId: string; numero: string; nomeExibicao: string; nomeSituacao: SituacaoNome; qualidade: QualidadeOficial; jaConectado: boolean }
export interface Achados { sessao: string; empresa: string; numeros: NumeroAchado[] }
export interface PassoConferencia { rotulo: string; ok: boolean; nota: string | null }

/* ---------------- leitura tolerante ---------------- */
const txt = (v: unknown) => (v == null || v === '' ? null : String(v));
const um = <T extends string>(v: unknown, lista: readonly T[], padrao: T): T => (lista.includes(v as T) ? (v as T) : padrao);
const lerAchado = (n: Record<string, unknown>): NumeroAchado => ({
  phoneNumberId: String(n.phone_number_id ?? ''), numero: String(n.numero ?? ''), nomeExibicao: String(n.nome_exibicao ?? ''),
  nomeSituacao: um(n.nome_situacao, ['aprovado', 'analise', 'recusado'] as const, 'analise'),
  qualidade: um(n.qualidade, ['alta', 'media', 'baixa', 'desconhecida'] as const, 'desconhecida'), jaConectado: !!n.ja_conectado,
});
function lerConta(b: Record<string, unknown>): ContaOficial {
  const e = (b.empresa && typeof b.empresa === 'object' ? b.empresa : null) as Record<string, unknown> | null;
  const lista = (v: unknown) => (Array.isArray(v) ? (v as Record<string, unknown>[]) : []);
  return {
    empresa: e ? { nome: String(e.nome ?? ''), verificada: !!e.verificada } : null,
    limiteDia: typeof b.limite_dia === 'number' ? b.limite_dia : null,
    pagamento: typeof b.pagamento === 'boolean' ? b.pagamento : null,
    facebook: !!b.facebook,
    numeros: lista(b.numeros).map((n) => ({
      ...lerAchado(n), id: String(n.id ?? ''), nome: String(n.nome ?? ''), ambiente: n.ambiente === 'atendimento' ? 'atendimento' : 'cobrancas',
      noCelular: !!n.no_celular, recebimento: !!n.recebimento, bloqueado: !!n.bloqueado, conectadoEm: txt(n.conectado_em), conectadoPor: txt(n.conectado_por),
    })),
    modelos: lista(b.modelos).map((m) => ({
      id: String(m.id ?? ''), nome: String(m.nome ?? ''), categoria: m.categoria === 'marketing' ? 'marketing' : 'utilidade', idioma: String(m.idioma ?? 'pt_BR'),
      situacao: um(m.situacao, ['aprovado', 'analise', 'recusado'] as const, 'analise'), texto: String(m.texto ?? ''), motivo: txt(m.motivo),
    })),
  };
}

/* ---------------- regras da tela (o servidor e a Meta conferem de verdade) ---------------- */
/** mensagem de erro do código de acesso digitado ('' = pode mandar conferir) */
export function tokenInvalido(token: string): string {
  const t = token.trim();
  if (!t) return 'Cole o código de acesso gerado na Meta.';
  if (/\s/.test(t) || t.length < 40) return 'O código de acesso parece incompleto. Copie de novo na Meta, inteiro.';
  return '';
}
/** as variáveis que o sistema sabe preencher — as mesmas da régua */
export const VARIAVEIS_MODELO = ['nome', 'meia parcela', 'vencimento', 'nome do atendente', 'link de pagamento'] as const;
/** nome técnico do modelo na Meta: minúsculas, números e sublinhado */
export const nomeTecnico = (nome: string) => nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
/** mensagem de erro do modelo ('' = pode mandar para aprovação) */
export function modeloInvalido(nome: string, texto: string, existentes: readonly ModeloOficial[]): string {
  const tecnico = nomeTecnico(nome), t = texto.trim();
  if (tecnico.length < 3) return 'Dê um nome ao modelo (ex.: Lembrete da parcela).';
  if (existentes.some((m) => m.nome === tecnico)) return 'Já existe um modelo com esse nome.';
  if (t.length < 10) return 'Escreva o texto do modelo.';
  if (t.length > 1024) return 'O texto passa do limite de 1.024 caracteres da Meta.';
  const desconhecida = (t.match(/\{[^{}]+\}/g) ?? []).map((v) => v.slice(1, -1).trim().toLowerCase()).find((v) => !(VARIAVEIS_MODELO as readonly string[]).includes(v));
  if (desconhecida) return `O sistema não conhece a variável {${desconhecida}}. Use as da lista.`;
  if (/^\{[^{}]+\}/.test(t) || /\{[^{}]+\}$/.test(t)) return 'A Meta não aceita modelo que começa ou termina com uma variável. Coloque uma palavra antes e depois.';
  return '';
}

/* ---------------- consulta e ações ---------------- */
const CHAVE = ['reviza', 'wa-oficial'] as const;
const MSG: Record<string, string> = {
  token_invalido: 'A Meta não reconheceu este código de acesso. Confira se ele tem as permissões do WhatsApp e foi copiado inteiro.',
  sem_numeros: 'Esta conta da Meta ainda não tem número de WhatsApp. Cadastre um no Gerenciador do WhatsApp e tente de novo.',
  sessao_vencida: 'A conexão com a Meta venceu. Comece de novo.',
  ja_conectado: 'Este número já está conectado ao sistema.',
  facebook_indisponivel: 'A entrada pelo Facebook ainda não foi liberada pela Meta para este sistema. Use o código de acesso.',
};
async function chamar(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (!supabase) throw new Error('Sem conexão com o servidor.');
  const { data, error } = await supabase.functions.invoke('reviza-wa-oficial', { body });
  if (error) {
    let msg = error.message;
    try { const j = await (error as { context?: Response }).context?.json?.(); if (j?.error) msg = j.error; } catch { /* fica a mensagem do erro */ }
    throw new Error(MSG[msg] ?? msg);
  }
  const corpo = (data ?? {}) as Record<string, unknown>;
  if (corpo.error) throw new Error(MSG[String(corpo.error)] ?? String(corpo.error));
  return corpo;
}
export function useOficial(ligado = true) {
  const q = useQuery({ queryKey: CHAVE, enabled: ligado, queryFn: async () => lerConta(await chamar({ acao: 'situacao' })), staleTime: 30_000 });
  return { dados: q.data ?? VAZIA, carregando: q.isLoading, falhou: q.isError, recarregar: () => { void q.refetch(); } };
}
const lerAchados = (r: Record<string, unknown>): Achados => ({
  sessao: String(r.sessao ?? ''), empresa: String(r.empresa ?? ''), numeros: (Array.isArray(r.numeros) ? (r.numeros as Record<string, unknown>[]) : []).map(lerAchado),
});
/** A janela da Meta ("entrar com o Facebook"). Na prévia nenhuma janela abre: o servidor de mentira devolve
    um número de demonstração. De verdade, quem abre a janela é o lançador do cadastro incorporado
    (o mesmo de pages/Coexistencia.tsx), que entrega code + waba_id + phone_number_id para esta chamada. */
export function useEntrarFacebook() {
  return useMutation({
    mutationFn: async (v: { noCelular: boolean }): Promise<Achados> => {
      if (!isPrevia) throw new Error(MSG.facebook_indisponivel);
      return lerAchados(await chamar({ acao: 'entrar_facebook', no_celular: v.noCelular, simulado: true }));
    },
  });
}
export function useBuscarNumeros() {
  return useMutation({ mutationFn: async (token: string): Promise<Achados> => lerAchados(await chamar({ acao: 'buscar_numeros', token: token.trim() })) });
}
function useAcao<V>(montar: (v: V) => Record<string, unknown>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (v: V) => chamar(montar(v)), onSuccess: () => qc.invalidateQueries({ queryKey: CHAVE }) });
}
export const useConectarOficial = () => useAcao((v: { sessao: string; phoneNumberId: string; ambiente: Ambiente; nome: string; noCelular: boolean }) =>
  ({ acao: 'conectar', sessao: v.sessao, phone_number_id: v.phoneNumberId, ambiente: v.ambiente, nome: v.nome.trim(), no_celular: v.noCelular }));
export const lerConferencia = (r: Record<string, unknown>): PassoConferencia[] =>
  (Array.isArray(r.conferencia) ? (r.conferencia as Record<string, unknown>[]) : []).map((p) => ({ rotulo: String(p.rotulo ?? ''), ok: !!p.ok, nota: txt(p.nota) }));
export const useTestarOficial = () => useAcao((id: string) => ({ acao: 'testar', id }));
export const useEnviarTesteOficial = () => useAcao((v: { id: string; para: string; modelo: string }) => ({ acao: 'enviar_teste', id: v.id, para: v.para.replace(/\D/g, ''), modelo: v.modelo }));
export const useDesconectarOficial = () => useAcao((id: string) => ({ acao: 'desconectar', id }));
export const useSincronizarModelos = () => useAcao((_: void) => ({ acao: 'modelos_sync' }));
export const useCriarModelo = () => useAcao((v: { nome: string; categoria: CategoriaModelo; texto: string }) => ({ acao: 'modelo_criar', nome: nomeTecnico(v.nome), categoria: v.categoria, texto: v.texto.trim() }));
