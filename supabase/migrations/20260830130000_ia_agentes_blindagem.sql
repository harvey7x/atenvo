-- ============================================================================
-- IA configurável — blindagem pós-revisão adversarial (19 achados, 30/08):
--  (a) INSERT também protege os campos de chave (antes só UPDATE): sem o GUC,
--      chave_secret_id/chave_definida_em entram NULOS — fecha o forjamento de
--      secret_id via PostgREST (que combinado ao AFTER DELETE definer viraria
--      delete privilegiado de secret apontado).
--  (b) Excluir agente DESLIGA a IA dos canais vinculados (BEFORE DELETE, antes
--      do ON DELETE SET NULL da FK apagar o vínculo) — sem isso o canal do
--      cliente voltava a rodar a persona de FÁBRICA em silêncio.
--  (c) RPC ia_canal_modo_teste: sair/entrar do modo teste e cadastrar números
--      de teste pelo painel (o beco sem saída da Fase 1).
-- ============================================================================

-- (a) proteção no INSERT
create or replace function public.fn_ia_agentes_before_ins()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('atenvo.ia_chave', true), '') <> '1' then
    new.chave_secret_id   := null;
    new.chave_definida_em := null;
  end if;
  return new;
end $$;

drop trigger if exists trg_ia_agentes_before_ins on public.ia_agentes;
create trigger trg_ia_agentes_before_ins
  before insert on public.ia_agentes
  for each row execute function public.fn_ia_agentes_before_ins();

-- (b) excluir agente = IA desligada nos canais dele (antes da FK zerar o vínculo)
create or replace function public.fn_ia_agentes_before_del()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.bot_canal_config
     set ia_enabled = false, atualizado_em = now()
   where ia_agente_id = old.id;
  return old;
end $$;

drop trigger if exists trg_ia_agentes_before_del on public.ia_agentes;
create trigger trg_ia_agentes_before_del
  before delete on public.ia_agentes
  for each row execute function public.fn_ia_agentes_before_del();

-- (c) modo teste autogerido: liga/desliga e (opcional) grava os números de teste
create or replace function public.ia_canal_modo_teste(p_canal uuid, p_teste boolean, p_numeros text[] default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
  v_numeros text[];
begin
  select organizacao_id into v_org from public.canais where id = p_canal;
  if v_org is null then
    raise exception 'Canal não encontrado';
  end if;
  if not (is_platform_admin()
          or papel_na_org(v_org) = any (array['admin'::user_role,'supervisor'::user_role])) then
    raise exception 'Sem permissão para alterar o modo teste';
  end if;

  if p_numeros is not null then
    -- normaliza: só dígitos, ignora vazios (o motor casa por sufixo de 8 dígitos)
    select coalesce(array_agg(n), '{}'::text[]) into v_numeros
      from (select regexp_replace(x, '\D', '', 'g') as n
              from unnest(p_numeros) as x) t
     where length(n) >= 8;
  end if;

  insert into public.bot_canal_config (organizacao_id, canal_id, ia_modo_teste, numeros_teste)
  values (v_org, p_canal, p_teste, coalesce(v_numeros, '{}'::text[]))
  on conflict (canal_id) do update
    set ia_modo_teste = excluded.ia_modo_teste,
        numeros_teste = coalesce(v_numeros, public.bot_canal_config.numeros_teste),
        atualizado_em = now();
end $$;

revoke all on function public.ia_canal_modo_teste(uuid, boolean, text[]) from public, anon;
grant execute on function public.ia_canal_modo_teste(uuid, boolean, text[]) to authenticated, service_role;

-- (doc) comportamentos.horario.dias: RESERVADO (Fase 2) — o motor atual aplica
-- seg-sex fixo; o painel não expõe dias. Registrado aqui pra ninguém confiar nele.
