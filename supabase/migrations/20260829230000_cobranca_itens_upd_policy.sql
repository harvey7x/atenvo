-- Complemento da revisão 29/08: o fix anterior amarrou mensagem→org no
-- INSERT de cobranca_mensagem_itens, mas o UPDATE ainda deixava um gestor
-- reapontar mensagem_id para mensagem de OUTRA org (mesma injeção, via
-- update). Mesmo exists no with check do UPDATE.
drop policy if exists cobranca_mensagem_itens_upd on public.cobranca_mensagem_itens;
create policy cobranca_mensagem_itens_upd on public.cobranca_mensagem_itens for update
  using (public.cobranca_gestor(organizacao_id))
  with check (
    public.cobranca_gestor(organizacao_id)
    and exists (select 1 from public.cobranca_mensagens m
                where m.id = mensagem_id and m.organizacao_id = cobranca_mensagem_itens.organizacao_id)
  );
