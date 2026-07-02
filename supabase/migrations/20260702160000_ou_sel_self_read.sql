-- Correção do guard deve_trocar_senha: ele bloqueava is_member(org), e a policy de SELECT de
-- organizacao_usuarios (ou_sel) dependia SÓ de is_member -> o usuário deixava de enxergar o
-- PRÓPRIO vínculo. Resultado: OrgContext lia memberships=[] e mostrava "Crie sua organização".
-- Ler o próprio vínculo é exceção legítima (como ler o próprio perfil) e é necessária para o
-- roteamento pós-login (selecionar org / distinguir convidado/inativo de sem-organização).
-- Operações sensíveis seguem bloqueadas: leitura de DADOS da org (conversas/mensagens/etc.) e
-- escritas usam is_member/papel_na_org, não afetados por esta mudança.
alter policy ou_sel on public.organizacao_usuarios
  using (is_platform_admin() or usuario_id = auth.uid() or is_member(organizacao_id));
