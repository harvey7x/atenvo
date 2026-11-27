-- 83 — Régua: cada ATENDENTE muda o próprio horário de início (dono 29/10: "eu quero que no sistema cada
-- atendente consiga alterar os horários dos envios").
-- A config da régua (wa_regua_config) continua só do gestor/admin (RLS wa_rcfg_upd). Esta RPC mexe SÓ na
-- chave do comercial dentro de horario_comercial (mig 82):
--   · quem pode: gestor/admin em qualquer comercial; o comercial só no DELE (wa_regua_pode, mig 74);
--   · hora entre o início geral (hora_envio) e antes do fim (hora_fim) — a janela segue sendo do admin;
--   · hora = início geral ou null → volta pro início geral (tira a chave);
--   · devolve o antes/depois (o Desfazer da tela usa o "antes"). O registro (reg_regua_cfg) audita quem mudou.

create or replace function public.wa_regua_horario_comercial(p_comercial text, p_hora integer)
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
  if p_hora is not null and (p_hora < v_ini or p_hora >= v_fim) then
    raise exception 'Escolha um horário entre %:00 e %:00 (a janela da régua).', lpad(v_ini::text, 2, '0'), lpad((v_fim - 1)::text, 2, '0')
      using errcode = '22023';
  end if;
  v_antes := (v_mapa ->> v_k)::int;
  v_depois := case when p_hora is null or p_hora = v_ini then null else p_hora end;
  update public.wa_regua_config
     set horario_comercial = case when v_depois is null then horario_comercial - v_k
                                  else horario_comercial || jsonb_build_object(v_k, v_depois) end
   where id = 1;
  return jsonb_build_object('comercial', v_k, 'antes', v_antes, 'depois', v_depois, 'inicio_geral', v_ini, 'fim', v_fim);
end $$;

revoke all on function public.wa_regua_horario_comercial(text, integer) from public, anon;
grant execute on function public.wa_regua_horario_comercial(text, integer) to authenticated, service_role;
