-- RLS das tabelas quentes do atendimento: mesma regra, forma "hashed subplan".
--
-- PROBLEMA (24/08): a query da lista do inbox era a nº 1 do banco (80 mil chamadas,
-- média 3,6 s, máx 8 s = statement timeout → 500 intermitente na fila). O EXPLAIN
-- mostrou o tempo inteiro nos filtros de RLS: is_member()/org_operacional()/
-- is_platform_admin() são SECURITY DEFINER (não inlineiam) e eram avaliadas POR
-- LINHA — ~34 mil vezes por request só no embed de mensagens.
--
-- CORREÇÃO: policies *_sel passam a usar `organizacao_id IN (select orgs_visiveis())`.
-- A subquery não é correlacionada → o Postgres executa UMA vez por query (hashed
-- subplan) e faz probe O(1) por linha. Mesma regra de acesso, custo por linha ~zero.
-- Medido na mesma query da lista: 6,8 s → ~0,1 s.
--
-- SEMÂNTICA PRESERVADA (byte a byte com a conjunção antiga):
--   is_platform_admin() OR (is_member(org) AND org_operacional(org))
--   • platform_admin vê todas as orgs (mesmo suspensas), como antes;
--   • membro ativo + sem deve_trocar_senha + org não suspensa/cancelada com
--     assinatura ativa/isenta/em_atraso/teste, como antes;
--   • organizacao_id é NOT NULL nas 6 tabelas → IN não muda nenhum caso de borda.
--
-- Só as policies de SELECT mudam (as de escrita rodam 1x por operação — custo ok).

create or replace function public.orgs_visiveis()
returns setof uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select o.id
  from public.organizacoes o
  where
    coalesce((select u.platform_admin from public.usuarios u where u.id = auth.uid()), false)
    or (
      exists (
        select 1 from public.organizacao_usuarios ou
        where ou.organizacao_id = o.id
          and ou.usuario_id = auth.uid()
          and ou.status = 'ativo'
      )
      and not exists (
        select 1 from public.usuarios u
        where u.id = auth.uid() and u.deve_trocar_senha = true
      )
      and o.status not in ('suspensa','cancelada')
      and o.assinatura_status in ('ativa','isenta','em_atraso','teste')
    );
$$;

-- mesmo padrão de grants das demais funções de RLS do projeto (is_member etc.)
grant execute on function public.orgs_visiveis() to authenticated, service_role;

alter policy canais_sel              on public.canais              using (organizacao_id in (select public.orgs_visiveis()));
alter policy conversas_sel           on public.conversas           using (organizacao_id in (select public.orgs_visiveis()));
alter policy mensagens_sel           on public.mensagens           using (organizacao_id in (select public.orgs_visiveis()));
alter policy contatos_sel            on public.contatos            using (organizacao_id in (select public.orgs_visiveis()));
alter policy contato_identidades_sel on public.contato_identidades using (organizacao_id in (select public.orgs_visiveis()));
alter policy oportunidades_sel       on public.oportunidades       using (organizacao_id in (select public.orgs_visiveis()));

-- ROLLBACK (se necessário): devolve o texto antigo de cada policy.
--   alter policy <nome> on public.<tabela>
--     using (is_platform_admin() or (is_member(organizacao_id) and org_operacional(organizacao_id)));
