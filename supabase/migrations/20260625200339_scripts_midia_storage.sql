-- Bucket privado para mídias de scripts + RLS isolando por organização.
-- Convenção de path: {organizacao_id}/{script_id}/{uuid}-{arquivo}. O 1º segmento é a org.
insert into storage.buckets (id, name, public) values ('script-midia', 'script-midia', false) on conflict (id) do nothing;

drop policy if exists script_midia_sel on storage.objects;
drop policy if exists script_midia_ins on storage.objects;
drop policy if exists script_midia_del on storage.objects;

create policy script_midia_sel on storage.objects for select to authenticated
  using (bucket_id = 'script-midia' and public.is_member(nullif((storage.foldername(name))[1], '')::uuid));
create policy script_midia_ins on storage.objects for insert to authenticated
  with check (bucket_id = 'script-midia' and public.is_member(nullif((storage.foldername(name))[1], '')::uuid));
create policy script_midia_del on storage.objects for delete to authenticated
  using (bucket_id = 'script-midia' and public.is_member(nullif((storage.foldername(name))[1], '')::uuid));
