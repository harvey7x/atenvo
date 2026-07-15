-- ============================================================================
-- P0 SEGURANÇA — Etapa A: revogar EXECUTE de PUBLIC/anon/authenticated
-- em RPCs SECURITY DEFINER internas (serviço/cron), que estavam expostas via
-- o default do Postgres (GRANT EXECUTE TO PUBLIC) sem checagem de auth adequada.
--
-- Contexto (auditoria): com a anon key pública, um não-autenticado podia:
--   * ler IDs cross-org via bot_remarketing_due();
--   * mutar pipeline alheio via bot_remarketing_inbound()/sync()/checar_envio()/registrar_toque();
--   * pular o guard "auth.uid() is not null and not(admin)" em unificar/desfazer (auth.uid()=NULL).
--
-- Estas funções são chamadas SOMENTE por service_role (edge/cron):
--   * bot-remarketing (cron): sync/due/checar_envio/registrar_toque
--   * evolution-webhook: bot_remarketing_inbound
--   * unificar/desfazer/calcular_valor_assinatura: service_role / triggers internos
-- O frontend (authenticated) NÃO chama nenhuma delas (grep src/ = 0).
--
-- NÃO altera lógica, tabelas, policies, dados ou webhook. Só permissão de EXECUTE.
-- service_role mantém grant explícito (reforçado abaixo) → cron/edge seguem funcionando.
-- ============================================================================

revoke execute on function public.bot_remarketing_due(p_limit integer)                                       from public, anon, authenticated;
revoke execute on function public.bot_remarketing_inbound(p_conversa uuid, p_texto text)                     from public, anon, authenticated;
revoke execute on function public.bot_remarketing_checar_envio(p_id uuid)                                    from public, anon, authenticated;
revoke execute on function public.bot_remarketing_registrar_toque(p_id uuid)                                 from public, anon, authenticated;
revoke execute on function public.bot_remarketing_sync()                                                     from public, anon, authenticated;
revoke execute on function public.unificar_conversa_duplicada(p_principal uuid, p_secundaria uuid, p_dry_run boolean) from public, anon, authenticated;
revoke execute on function public.desfazer_unificacao_conversa(p_log_id uuid, p_dry_run boolean)             from public, anon, authenticated;
revoke execute on function public.calcular_valor_assinatura(p_org uuid)                                      from public, anon, authenticated;

-- Reforço explícito: service_role (backend/edge/cron) mantém EXECUTE.
grant execute on function public.bot_remarketing_due(p_limit integer)                                        to service_role;
grant execute on function public.bot_remarketing_inbound(p_conversa uuid, p_texto text)                      to service_role;
grant execute on function public.bot_remarketing_checar_envio(p_id uuid)                                     to service_role;
grant execute on function public.bot_remarketing_registrar_toque(p_id uuid)                                  to service_role;
grant execute on function public.bot_remarketing_sync()                                                      to service_role;
grant execute on function public.unificar_conversa_duplicada(p_principal uuid, p_secundaria uuid, p_dry_run boolean) to service_role;
grant execute on function public.desfazer_unificacao_conversa(p_log_id uuid, p_dry_run boolean)              to service_role;
grant execute on function public.calcular_valor_assinatura(p_org uuid)                                       to service_role;
