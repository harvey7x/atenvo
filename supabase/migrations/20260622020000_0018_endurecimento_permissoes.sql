-- ===== Endurecimento de permissoes (usuarios + audit_log) =====

-- 1) USUARIOS: usuario comum so altera o proprio nome e avatar_url.
--    Nao pode alterar id/email/papel/ativo/platform_admin. Perfil so e criado pelo trigger.
revoke insert, update on public.usuarios from authenticated;
grant  update (nome, avatar_url) on public.usuarios to authenticated;  -- nivel de coluna

-- INSERT direto pelo usuario fica proibido: o perfil nasce do trigger on_auth_user_created
-- (SECURITY DEFINER, contorna RLS/grants). Resta apenas a plataforma para casos administrativos.
drop policy if exists usuarios_ins on public.usuarios;
create policy usuarios_ins on public.usuarios
  for insert to authenticated
  with check (public.is_platform_admin());

-- UPDATE: linha do proprio usuario (ou plataforma). As COLUNAS permitidas sao limitadas
-- pelo grant acima; tentar mudar email/papel/ativo/platform_admin => "permission denied for column".
drop policy if exists usuarios_upd on public.usuarios;
create policy usuarios_upd on public.usuarios
  for update to authenticated
  using (id = auth.uid() or public.is_platform_admin())
  with check (id = auth.uid() or public.is_platform_admin());

-- 2) AUDIT_LOG: usuario comum NAO insere registros arbitrarios.
--    A auditoria e gravada por triggers (fn_audit, SECURITY DEFINER) ou servico autorizado.
revoke insert on public.audit_log from authenticated;
drop policy if exists audit_ins on public.audit_log;
create policy audit_ins on public.audit_log
  for insert to authenticated
  with check (public.is_platform_admin());
-- (audit_sel permanece: leitura por admin/supervisor; sem update/delete = imutavel)
