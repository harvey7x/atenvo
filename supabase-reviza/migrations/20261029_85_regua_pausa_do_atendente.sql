-- 85 — Régua: cada ATENDENTE pausa e retoma a própria régua (dono 29/10: "cada atendente tem que ter
-- controle da sua própria régua de mensagem… fazer o que ele bem entender").
-- A chave geral (wa_regua_config.ativa) continua só do dono/gestor. Isto é por comercial:
--   wa_regua_config.regua_pausada = { "<NOME NORMALIZADO>": "<quando pausou (iso)>" }
-- Pausada = os clientes daquele comercial não recebem nada da régua (prévia mostra "régua de X pausada";
-- o que já estava na fila do dia não sai). Retomar = volta no mesmo dia, dentro da janela.

create or replace function public.wa_regua_pausada_ok(h jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(h) = 'object'
     and not exists (select 1 from jsonb_each(h) e where e.key = '' or e.key <> public.wa_nome_chave(e.key))
$$;
revoke all on function public.wa_regua_pausada_ok(jsonb) from public, anon;
grant execute on function public.wa_regua_pausada_ok(jsonb) to authenticated, service_role;

alter table public.wa_regua_config add column if not exists regua_pausada jsonb not null default '{}'::jsonb;
alter table public.wa_regua_config drop constraint if exists wa_regua_config_regua_pausada;
alter table public.wa_regua_config add constraint wa_regua_config_regua_pausada check (public.wa_regua_pausada_ok(regua_pausada));

create or replace function public.wa_regua_comercial_pausar(p_comercial text, p_pausar boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_k text; v_mapa jsonb; v_antes boolean;
begin
  v_k := public.wa_nome_chave(p_comercial);
  if v_k = '' then raise exception 'Comercial inválido.' using errcode = '22023'; end if;
  if p_pausar is null then raise exception 'Informe se é pra pausar ou retomar.' using errcode = '22023'; end if;
  if not public.wa_regua_pode(v_k) then
    raise exception 'Você só pode pausar ou retomar a sua própria régua.' using errcode = '42501';
  end if;
  select c.regua_pausada into v_mapa from public.wa_regua_config c where c.id = 1 for update;
  if not found then raise exception 'Configuração da régua não encontrada.' using errcode = 'P0002'; end if;
  v_antes := v_mapa ? v_k;
  if v_antes is distinct from p_pausar then
    update public.wa_regua_config
       set regua_pausada = case when p_pausar then regua_pausada || jsonb_build_object(v_k, to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
                                else regua_pausada - v_k end
     where id = 1;
    perform private.registrar('configurou', 'régua', v_k, v_k,
      format('%s a régua de %s', case when p_pausar then 'pausou' else 'retomou' end, initcap(lower(v_k))));
  end if;
  return jsonb_build_object('comercial', v_k, 'antes', v_antes, 'depois', p_pausar);
end $$;
revoke all on function public.wa_regua_comercial_pausar(text, boolean) from public, anon;
grant execute on function public.wa_regua_comercial_pausar(text, boolean) to authenticated, service_role;
