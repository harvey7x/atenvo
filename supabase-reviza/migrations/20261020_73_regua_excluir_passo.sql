-- 73 — Excluir mensagem da régua (dono 20/10: "bota um botão para excluir régua aqui").
-- O DELETE direto apagava o passo mas o que ele já tinha posto na fila de HOJE continuava saindo
-- (wa_envios copia os blocos; regua_msg_id vira NULL por FK SET NULL). Agora a exclusão é uma RPC:
-- na MESMA transação cancela os alvos ainda 'pendente' dos envios desse passo (igual ao Cancelar
-- de Envios — o motor só reivindica alvo 'pendente'; o que já está 'enviando' e volta pra fila
-- vira 'cancelado' porque o envio fica 'cancelado'), e só então apaga o passo.
-- Também acusa quando não há o que apagar (outra pessoa já excluiu) em vez de "sucesso" vazio.
create or replace function public.wa_regua_msg_excluir(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_alvos int := 0; v_envios int := 0; v_ids uuid[];
begin
  if not public.is_at_least('gestor') then
    raise exception 'sem permissao' using errcode = '42501';
  end if;
  perform 1 from public.wa_regua_msgs where id = p_id for update;
  if not found then
    raise exception 'Essa mensagem já não está na régua (alguém pode ter excluído agora). Atualize a página.' using errcode = 'P0002';
  end if;

  with c as (
    update public.wa_envio_alvos a
       set status = 'cancelado', motivo = 'mensagem excluída da régua', claim_em = null
      from public.wa_envios e
     where a.envio_id = e.id and e.regua_msg_id = p_id
       and e.estado::text in ('rascunho', 'enviando') and a.status::text = 'pendente'
    returning a.envio_id
  )
  select count(*)::int, coalesce(array_agg(distinct envio_id), '{}') into v_alvos, v_ids from c;

  -- só os envios que de fato tinham fila (o que já terminou fica "concluído" pelo motor)
  update public.wa_envios set estado = 'cancelado'
   where id = any(v_ids) and estado::text in ('rascunho', 'enviando');
  get diagnostics v_envios = row_count;

  delete from public.wa_regua_msgs where id = p_id;
  return jsonb_build_object('ok', true, 'cancelados', v_alvos, 'envios', v_envios);
end $$;

revoke all on function public.wa_regua_msg_excluir(uuid) from public, anon;
grant execute on function public.wa_regua_msg_excluir(uuid) to authenticated, service_role;
