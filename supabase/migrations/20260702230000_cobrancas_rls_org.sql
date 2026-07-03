-- Incidente: cobranças só apareciam para gestor (admin/supervisor) + dono da carteira; atendentes
-- viam 0. O modelo operacional da org (contatos/conversas) é "todo membro ativo vê tudo da org"
-- (is_member + org_operacional), e o frontend de Cobranças NÃO implementa carteira própria
-- (sem filtro auth.uid). Portanto a restrição por responsavel_id/criado_por era acidental.
-- Correção: LEITURA de cobranças/parcelas/eventos = todo membro ativo da org (igual contatos).
-- ESCRITA (insert/update) permanece restrita a gestor (cobranca_gestor). Nunca entre organizações.

-- cobrancas: leitura por membro ativo da org
alter policy cobrancas_sel on public.cobrancas
  using (is_platform_admin() or (is_member(organizacao_id) and org_operacional(organizacao_id)));

-- cobranca_pagamentos: leitura por membro ativo da org
alter policy cob_pag_sel on public.cobranca_pagamentos
  using (is_platform_admin() or (is_member(organizacao_id) and org_operacional(organizacao_id)));

-- cobranca_eventos: a policy ALL (gestor) cobre escrita; adiciona SELECT para membros (OR permissivo).
drop policy if exists cobranca_eventos_sel on public.cobranca_eventos;
create policy cobranca_eventos_sel on public.cobranca_eventos for select
  using (is_platform_admin() or (is_member(organizacao_id) and org_operacional(organizacao_id)));
