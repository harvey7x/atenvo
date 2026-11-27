-- 84 — Horário por atendente: ajustes da revisão adversarial (29/10, sobre as migs 82/83).
--  1. Janela mudou (admin) → horário próprio que ficou fora dela SAI na mesma gravação (senão o comercial
--     ficava travado o dia inteiro com a tela mostrando "início geral");
--  2. a RPC registra a mudança nos Registros (o tg_registrar só via ativa/hora_envio);
--  3. Desfazer seguro: p_conferir=true só aplica se o horário ainda é o que a ação deixou (o que outra
--     pessoa mudou depois fica);
--  4. wa_nome_chave tira QUALQUER acento (NFD + marcas), igual ao front (chaveComercial) e ao motor
--     (normNome) — antes só as letras de uma lista (ẽ, ĩ… ficavam diferentes). Chaves gravadas hoje são
--     ASCII e não mudam.

-- 4 ---------------------------------------------------------------------------------------------
create or replace function public.wa_nome_chave(t text)
returns text
language sql
immutable
set search_path = ''
as $$
  select upper(btrim(regexp_replace(regexp_replace(normalize(coalesce(t, ''), NFD), '[̀-ͯ]', '', 'g'), '\s+', ' ', 'g')))
$$;

-- 1 ---------------------------------------------------------------------------------------------
create or replace function private.wa_regua_config_poda_horarios()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.hora_envio is distinct from old.hora_envio or new.hora_fim is distinct from old.hora_fim
     or new.horario_comercial is distinct from old.horario_comercial then
    -- só fica quem começa DEPOIS do início geral e ANTES do fim (igual ao geral = sem chave)
    new.horario_comercial := coalesce((
      select jsonb_object_agg(e.key, e.value) from jsonb_each(new.horario_comercial) e
       where (e.value #>> '{}')::int > new.hora_envio and (e.value #>> '{}')::int < new.hora_fim), '{}'::jsonb);
  end if;
  return new;
end $$;
revoke all on function private.wa_regua_config_poda_horarios() from public, anon, authenticated;
drop trigger if exists wa_regua_config_poda_horarios on public.wa_regua_config;
create trigger wa_regua_config_poda_horarios before update on public.wa_regua_config
  for each row execute function private.wa_regua_config_poda_horarios();
-- o que já está gravado hoje também passa pela regra
update public.wa_regua_config set horario_comercial = horario_comercial where id = 1;

-- 2 + 3 -----------------------------------------------------------------------------------------
drop function if exists public.wa_regua_horario_comercial(text, integer);
create function public.wa_regua_horario_comercial(p_comercial text, p_hora integer, p_conferir boolean default false, p_esperado integer default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_k text; v_ini int; v_fim int; v_mapa jsonb; v_antes int; v_depois int;
begin
  v_k := public.wa_nome_chave(p_comercial);
  if v_k = '' then raise exception 'Comercial inválido.' using errcode = '22023'; end if;
  if not public.wa_regua_pode(v_k) then
    raise exception 'Você só pode mudar o horário da sua própria régua.' using errcode = '42501';
  end if;
  select c.hora_envio, c.hora_fim, c.horario_comercial into v_ini, v_fim, v_mapa
    from public.wa_regua_config c where c.id = 1 for update;
  if not found then raise exception 'Configuração da régua não encontrada.' using errcode = 'P0002'; end if;
  v_antes := (v_mapa ->> v_k)::int;
  if p_conferir and v_antes is distinct from p_esperado then
    raise exception 'O horário de envio mudou depois (outra pessoa alterou) — nada foi desfeito.' using errcode = '55000';
  end if;
  if p_hora is not null and (p_hora < v_ini or p_hora >= v_fim) then
    raise exception 'Escolha um horário entre %:00 e %:00 (a janela da régua).', lpad(v_ini::text, 2, '0'), lpad((v_fim - 1)::text, 2, '0')
      using errcode = '22023';
  end if;
  v_depois := case when p_hora is null or p_hora = v_ini then null else p_hora end;
  update public.wa_regua_config
     set horario_comercial = case when v_depois is null then horario_comercial - v_k
                                  else horario_comercial || jsonb_build_object(v_k, v_depois) end
   where id = 1;
  if v_antes is distinct from v_depois then
    perform private.registrar('configurou', 'régua', v_k, v_k,
      format('horário de envio de %s: %s → %s', initcap(lower(v_k)),
        coalesce(lpad(v_antes::text, 2, '0') || ':00', 'início geral'), coalesce(lpad(v_depois::text, 2, '0') || ':00', 'início geral')));
  end if;
  return jsonb_build_object('comercial', v_k, 'antes', v_antes, 'depois', v_depois, 'inicio_geral', v_ini, 'fim', v_fim);
end $$;

revoke all on function public.wa_regua_horario_comercial(text, integer, boolean, integer) from public, anon;
grant execute on function public.wa_regua_horario_comercial(text, integer, boolean, integer) to authenticated, service_role;
