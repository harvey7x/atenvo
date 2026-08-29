-- ============================================================
-- MODO COBRANÇA — bucket de mídia da régua (Fase C, 29/08).
-- Público para LEITURA (a Evolution busca a mídia por URL na hora do
-- envio); upload/gestão só por usuário autenticado. Conteúdo = mídia
-- de TEMPLATE (áudio explicativo, imagem, documento padrão) — nunca
-- dado pessoal de cliente.
-- ============================================================
insert into storage.buckets (id, name, public)
values ('cobranca-midia', 'cobranca-midia', true)
on conflict (id) do nothing;

drop policy if exists "cobranca_midia_upload" on storage.objects;
create policy "cobranca_midia_upload" on storage.objects
  for insert to authenticated with check (bucket_id = 'cobranca-midia');
drop policy if exists "cobranca_midia_update" on storage.objects;
create policy "cobranca_midia_update" on storage.objects
  for update to authenticated using (bucket_id = 'cobranca-midia');
drop policy if exists "cobranca_midia_delete" on storage.objects;
create policy "cobranca_midia_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'cobranca-midia');
