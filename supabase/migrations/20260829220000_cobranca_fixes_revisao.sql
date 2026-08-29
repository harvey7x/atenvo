-- ============================================================
-- MODO COBRANÇA — correções da revisão adversarial (29/08, 11 achados
-- confirmados por dupla refutação). Aqui vão os de banco:
-- 1) storage do bucket cobranca-midia SEM escopo de org (cross-tenant
--    write/delete) → escopo pela 1ª pasta do caminho (= organizacao_id),
--    mesmo padrão do bucket irmão script-midia;
-- 2) salvar itens da mensagem era delete+insert sem transação (falha no
--    meio deixava mensagem ativa VAZIA e o motor enfileirava corpo vazio)
--    → RPC transacional cobranca_salvar_itens;
-- 3) policy de INSERT de itens não amarrava mensagem_id à org → exists;
-- 4) enfileiramento era tiro único diário (um dia falho = passo da
--    cadência perdido) → cron de retry 12h05 BRT (idempotente pelo
--    índice único uq_cobranca_fila_dia).
-- ============================================================

-- 1) storage org-scoped
drop policy if exists "cobranca_midia_upload" on storage.objects;
drop policy if exists "cobranca_midia_update" on storage.objects;
drop policy if exists "cobranca_midia_delete" on storage.objects;
create policy cobranca_midia_ins on storage.objects for insert to authenticated
  with check (bucket_id = 'cobranca-midia' and public.is_member(nullif((storage.foldername(name))[1], '')::uuid));
create policy cobranca_midia_upd on storage.objects for update to authenticated
  using (bucket_id = 'cobranca-midia' and public.is_member(nullif((storage.foldername(name))[1], '')::uuid));
create policy cobranca_midia_del on storage.objects for delete to authenticated
  using (bucket_id = 'cobranca-midia' and public.is_member(nullif((storage.foldername(name))[1], '')::uuid));

-- 2) troca transacional da sequência de bolhas
create or replace function public.cobranca_salvar_itens(p_mensagem uuid, p_itens jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  select organizacao_id into v_org from cobranca_mensagens where id = p_mensagem;
  if v_org is null then raise exception 'mensagem_inexistente'; end if;
  if not public.cobranca_gestor(v_org) then raise exception 'apenas_gestor'; end if;
  delete from cobranca_mensagem_itens where mensagem_id = p_mensagem;
  insert into cobranca_mensagem_itens (organizacao_id, mensagem_id, ordem, tipo, corpo, midia_url, midia_nome)
  select v_org, p_mensagem, o.n - 1,
         coalesce(o.i->>'tipo', 'texto'), nullif(o.i->>'corpo', ''),
         nullif(o.i->>'midia_url', ''), nullif(o.i->>'midia_nome', '')
  from jsonb_array_elements(p_itens) with ordinality as o(i, n);
end $$;
revoke all on function public.cobranca_salvar_itens(uuid, jsonb) from public, anon;
grant execute on function public.cobranca_salvar_itens(uuid, jsonb) to authenticated;

-- 3) INSERT de item amarra a mensagem à MESMA org
drop policy if exists cobranca_mensagem_itens_ins on public.cobranca_mensagem_itens;
create policy cobranca_mensagem_itens_ins on public.cobranca_mensagem_itens for insert
  with check (
    public.cobranca_gestor(organizacao_id)
    and exists (select 1 from public.cobranca_mensagens m
                where m.id = mensagem_id and m.organizacao_id = cobranca_mensagem_itens.organizacao_id)
  );

-- 4) retry do enfileiramento (12h05 BRT = 15h05 UTC)
select cron.schedule(
  'cobranca-enfileirar-retry', '5 15 * * *',
  $job$
  select net.http_post(
    url := 'https://afmzuoavvnpfossiiypz.supabase.co/functions/v1/cobranca-processar',
    body := '{"acao":"enfileirar"}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cobranca-secret', (select secret from public.webhook_config where chave = 'cobranca')
    )
  );
  $job$
);
