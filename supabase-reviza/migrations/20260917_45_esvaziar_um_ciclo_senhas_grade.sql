-- =====================================================================
-- 45 — Dois pedidos do dono (17/09 via Matheus):
-- (a) esvaziar_ciclo(p_dia): remove TODAS as pessoas de UM ciclo (ficam
--     "aguardando ciclo") mas o ciclo NÃO some — o dia entra/permanece em
--     ciclos_abertos e as datas manuais dele (ciclos_datas) FICAM INTACTAS
--     ("as datas ali permanecem no ciclo"), pronto pra subir gente nova.
--     Difere do esvaziar_ciclos() global (mig 42), que limpa datas.
-- (b) senhas_grade(): senhas dos clientes VISÍVEIS na grade da Gestão
--     ("que não fique aqueles pontinhos"). Decripta TODAS numa chamada só
--     (1200 reveals um-a-um inviável). Mesmo gate do reveal_senha (mig 37/38):
--     admin/gestor/financeiro veem todas; comercial SÓ dos clientes dele.
--     Auditoria: UMA linha 'revelou_grade' em private.segredo_acessos por
--     chamada (lead_id null = grade inteira). Criptografia em repouso intacta.
-- =====================================================================

create or replace function public.esvaziar_ciclo(p_dia smallint)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  if not public.is_at_least('financeiro') then
    raise exception 'sem permissao' using errcode = '42501';
  end if;
  if p_dia is null or p_dia < 1 or p_dia > 31 then
    raise exception 'dia invalido';
  end if;

  with alvo as (
    select id from public.leads where dia = p_dia for update
  ), upd as (
    update public.leads l set dia = null from alvo a where l.id = a.id
    returning a.id
  )
  select coalesce(array_agg(id), '{}'::uuid[]) into v_ids from upd;

  -- o ciclo CONTINUA aberto (e as datas manuais dele ficam onde estão)
  insert into public.ciclos_abertos (dia, criado_por)
  values (p_dia, auth.uid())
  on conflict (dia) do nothing;

  return jsonb_build_object('afetados', coalesce(to_jsonb(v_ids), '[]'::jsonb));
end $$;

grant execute on function public.esvaziar_ciclo(smallint) to authenticated;
revoke execute on function public.esvaziar_ciclo(smallint) from public, anon;

create or replace function public.senhas_grade()
returns table(lead_id uuid, inss text, reclame text)
language plpgsql security definer
set search_path to 'public', 'private', 'extensions', 'vault', 'pg_temp'
as $$
declare
  v_papel text := public.current_papel()::text;
begin
  if v_papel is null or v_papel not in ('admin', 'gestor', 'financeiro', 'comercial') then
    raise exception 'sem permissao' using errcode = '42501';
  end if;
  insert into private.segredo_acessos (lead_id, tipo, acao, ator, ator_papel)
  values (null, 'grade', 'revelou_grade', auth.uid(), v_papel);
  return query
    select s.lead_id,
           case when s.senha_inss_enc is null then null
                else extensions.pgp_sym_decrypt(s.senha_inss_enc, private.chave(s.senha_inss_kv)) end,
           case when s.reclame_senha_enc is null then null
                else extensions.pgp_sym_decrypt(s.reclame_senha_enc, private.chave(s.reclame_senha_kv)) end
      from private.lead_segredos s
      join public.leads l on l.id = s.lead_id
     where v_papel <> 'comercial'
        or exists (select 1 from public.profiles p
                    where p.id = auth.uid()
                      and upper(btrim(p.nome)) = upper(btrim(l.comercial)));
end $$;

grant execute on function public.senhas_grade() to authenticated;
revoke execute on function public.senhas_grade() from public, anon;
