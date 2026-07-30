-- [Arquivo reconstruído 2026-07-30 a partir de supabase_migrations.schema_migrations:
--  esta migration foi aplicada em prod via MCP numa sessão paralela SEM gravar o .sql
--  no repo, o que travava o `db push` ("Remote migration versions not found").
--  Conteúdo abaixo = byte a byte o que o histórico remoto registrou.]
--
-- CORREÇÃO — wa_canal_disparo quebrava em tempo de execução: `min(uuid)` não existe.
--
-- O corpo tinha `select count(*), min(id) into v_qtd, v_id`. O Postgres não tem agregado min()
-- para uuid, então a função compilou e só explodiu na PRIMEIRA chamada:
--   ERROR 42883: function min(uuid) does not exist
--
-- Na prática isso deixaria o worker sem canal de disparo por ERRO, não por configuração — e o
-- painel mostraria "nenhum número de disparo" mesmo com um cadastrado corretamente.
--
-- Mesma família do `{1,512}` da 20260724170000: PL/pgSQL só valida o SQL de dentro do corpo na
-- execução. Migration limpa e deploy verde não provam nada sobre o miolo de uma função.
--
-- Agora conta e busca em dois passos, e o desempate do "exatamente um" usa criado_em — ordem
-- estável, não a ordem física da tabela.

create or replace function public.wa_canal_disparo(p_org uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare v_id uuid; v_qtd int;
begin
  if auth.uid() is not null and not (public.is_platform_admin() or public.is_member(p_org)) then
    return null;
  end if;

  -- 1) o marcado explicitamente como padrão
  select id into v_id from public.canais
   where organizacao_id = p_org and ativo and disparo_padrao
     and papel in ('disparo', 'ambos') and transporte = 'cloud_api'
     and status_integracao <> 'removido'
   limit 1;
  if v_id is not null then return v_id; end if;

  -- 2) candidato único: não precisa de marcação, não há o que desempatar
  select count(*) into v_qtd from public.canais
   where organizacao_id = p_org and ativo
     and papel in ('disparo', 'ambos') and transporte = 'cloud_api'
     and status_integracao <> 'removido';

  if v_qtd = 1 then
    select id into v_id from public.canais
     where organizacao_id = p_org and ativo
       and papel in ('disparo', 'ambos') and transporte = 'cloud_api'
       and status_integracao <> 'removido'
     order by criado_em asc
     limit 1;
    return v_id;
  end if;

  -- 3) nenhum candidato, ou 2+ sem padrão definido => quem chama NÃO envia.
  return null;
end $fn$;

revoke all on function public.wa_canal_disparo(uuid) from public, anon;

grant execute on function public.wa_canal_disparo(uuid) to authenticated, service_role;
