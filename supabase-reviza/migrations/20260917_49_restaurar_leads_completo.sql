-- =====================================================================
-- 49 — CORREÇÃO da mig 48 (revisão adversarial): o restaurar_leads() em lote
-- reinseria só lead+senhas+pagamentos, IGNORANDO cascata (régua/disparos) e
-- vínculos (entradas/mov_fin/wa_conversas/wa_envio_alvos) que a lixeira COMPLETA
-- (mig 33) guarda — e ainda carimbava restaurado_em, FECHANDO a Lixeira pra
-- sempre. Resultado: o Desfazer em lote perdia régua e órfãos o financeiro.
-- Agora restaurar_leads apenas ORQUESTRA: pra cada lead, acha o registro mais
-- recente não-restaurado e chama o public.lead_restaurar (mig 33) — o MESMO
-- caminho completo do restore unitário. Fonte única de verdade; sem drift.
-- Um item que falhe não aborta o lote.
-- =====================================================================

create or replace function public.restaurar_leads(p_lead_ids uuid[])
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid; v_n int := 0; v_trash uuid;
begin
  if not public.is_at_least('gestor') then
    raise exception 'sem permissao' using errcode = '42501';
  end if;
  foreach v_id in array coalesce(p_lead_ids, '{}'::uuid[]) loop
    -- registro mais recente NÃO restaurado desse lead
    select id into v_trash from private.leads_lixeira
      where lead_id = v_id and restaurado_em is null
      order by deletado_em desc limit 1;
    if v_trash is null then continue; end if;                         -- nada pra restaurar
    if exists (select 1 from public.leads where id = v_id) then continue; end if; -- já voltou
    begin
      perform public.lead_restaurar(v_trash);   -- caminho COMPLETO: cascade + re-link
      v_n := v_n + 1;
    exception when others then
      continue;                                 -- um item ruim não derruba o lote
    end;
  end loop;
  return jsonb_build_object('restaurados', v_n);
end $$;

revoke all on function public.restaurar_leads(uuid[]) from public, anon;
grant execute on function public.restaurar_leads(uuid[]) to authenticated;
