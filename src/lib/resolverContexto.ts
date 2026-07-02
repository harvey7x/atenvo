// Decisão ÚNICA do contexto pós-login (evita regras duplicadas em vários componentes).
// Consumida pelo OrgProvider para escolher o que renderizar; o roteamento por papel/rota é
// feito depois (ProtectedRoute + index -> /whatsapp). Pura e testável.

export type ContextoInicial =
  | 'carregando'        // perfil/memberships ainda carregando -> NUNCA tratar como "sem organização"
  | 'erro'              // falha ao carregar o contexto (rede/RLS) -> tentar novamente, não é sem-org
  | 'trocar_senha'      // prioridade: deve_trocar_senha=true -> /alterar-senha (mesmo com org)
  | 'com_organizacao'   // tem vínculo ATIVO -> entra no app (org selecionada automaticamente)
  | 'convite_pendente'  // só vínculo 'convidado' -> erro controlado (nunca onboarding)
  | 'acesso_inativo'    // só vínculo 'inativo' -> erro controlado (nunca onboarding)
  | 'sem_organizacao';  // nenhum vínculo -> onboarding (criar organização)

export interface VinculoCtx { status: string }

export interface EntradaContexto {
  habilitado: boolean;        // backend real + usuário autenticado (false em mock/sem user)
  carregando: boolean;        // query ainda não concluída (isLoading || !isFetched)
  erro: boolean;              // isError
  deveTrocarSenha: boolean;
  vinculos: VinculoCtx[];     // TODOS os vínculos do usuário (qualquer status)
  orgsAtivasComDados: number; // vínculos ATIVOS cuja organização foi carregada (utilizáveis no app)
}

/** Decide o estado do contexto pós-login. Regras (ordem importa):
 *  1) enquanto carregando -> 'carregando' (nunca onboarding);
 *  2) erro -> 'erro' (nunca onboarding);
 *  3) deve_trocar_senha -> 'trocar_senha' (prioridade sobre org);
 *  4) tem organização ativa utilizável -> 'com_organizacao';
 *  5) tem vínculo ATIVO mas a org não carregou -> 'erro' (problema de contexto, NUNCA onboarding);
 *  6) só 'convidado' -> 'convite_pendente'; só 'inativo' -> 'acesso_inativo';
 *  7) nenhum vínculo -> 'sem_organizacao' (onboarding). */
export function resolverContextoInicial(e: EntradaContexto): ContextoInicial {
  if (!e.habilitado) return 'com_organizacao';   // mock/sem user: mantém o fluxo existente
  if (e.carregando) return 'carregando';
  if (e.erro) return 'erro';
  if (e.deveTrocarSenha) return 'trocar_senha';
  if (e.orgsAtivasComDados > 0) return 'com_organizacao';
  if (e.vinculos.some((v) => v.status === 'ativo')) return 'erro'; // ativo sem org carregada != sem-org
  if (e.vinculos.some((v) => v.status === 'convidado')) return 'convite_pendente';
  if (e.vinculos.some((v) => v.status === 'inativo')) return 'acesso_inativo';
  return 'sem_organizacao';
}
