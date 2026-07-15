-- ============================================================================
-- Etapa B1 — varredura de EXECUTE em RPCs: última função MUTANTE ainda herdando
-- o EXECUTE default de PUBLIC.
--
-- senha_trocada(): baixa a flag deve_trocar_senha do PRÓPRIO usuário (where id=auth.uid()).
-- Já se autoprotege (raise se auth.uid() is null), então anon nunca conseguiu mutar nada —
-- isto é defesa-em-profundidade + parar de depender do grant default PUBLIC.
--
-- Chamador REAL: frontend AlterarSenha.tsx (RPC 'senha_trocada') como usuário AUTENTICADO,
-- logo após trocar a senha. NÃO é chamada por edge/cron (grep supabase/functions = 0).
-- => authenticated MANTIDO (fluxo real de troca de senha); anon/public REVOGADOS.
--
-- As demais funções ainda anon/public-executáveis foram auditadas e mantidas de propósito:
--   * is_member/is_platform_admin/papel_na_org/org_operacional/compartilha_org: infra de RLS
--     (policies as invocam sob o papel authenticated); anon recebe só false/null/boolean trivial.
--   * relatorio_*: autoprotegidas por is_member (anon -> 'sem_acesso'); usadas pelo frontend.
--   * convite_estado: autoprotegida (uid null -> {sessao:false}); usada no fluxo de definir-senha.
--
-- NÃO altera lógica, tabela, policy, dado, webhook, frontend, bot, cobranças.
-- ============================================================================

revoke execute on function public.senha_trocada() from public, anon;

-- Reforço explícito: o usuário autenticado (fluxo de troca de senha) mantém EXECUTE.
grant execute on function public.senha_trocada() to authenticated;
