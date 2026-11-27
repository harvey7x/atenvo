-- Reviza — grants base + policies RLS. anon: NADA. Escrita sensivel so via RPC (definer).
-- Aplicada 2026-09-10 via MCP como "reviza_04_policies_rls".
revoke all on all tables in schema public from anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

create policy profiles_sel on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_at_least('gestor'));
create policy profiles_upd on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_at_least('gestor'))
  with check (id = auth.uid() or public.is_at_least('gestor'));
create policy profiles_del on public.profiles for delete to authenticated
  using (public.is_at_least('admin'));

create policy leads_sel on public.leads for select to authenticated
  using (public.current_papel() is not null);
create policy leads_ins on public.leads for insert to authenticated
  with check (public.tem_papel('comercial','gestor','admin'));
create policy leads_upd on public.leads for update to authenticated
  using (public.tem_papel('comercial','gestor','admin'))
  with check (public.tem_papel('comercial','gestor','admin'));
create policy leads_del on public.leads for delete to authenticated
  using (public.is_at_least('gestor'));

create policy comp_sel on public.competencias for select to authenticated
  using (public.current_papel() is not null);
create policy comp_ins on public.competencias for insert to authenticated
  with check (public.is_at_least('gestor'));
create policy comp_upd on public.competencias for update to authenticated
  using (public.is_at_least('gestor')) with check (public.is_at_least('gestor'));
create policy comp_del on public.competencias for delete to authenticated
  using (public.is_at_least('gestor'));

create policy ciclo_sel on public.ciclos_datas for select to authenticated
  using (public.current_papel() is not null);
create policy ciclo_ins on public.ciclos_datas for insert to authenticated
  with check (public.is_at_least('gestor'));
create policy ciclo_upd on public.ciclos_datas for update to authenticated
  using (public.is_at_least('gestor')) with check (public.is_at_least('gestor'));
create policy ciclo_del on public.ciclos_datas for delete to authenticated
  using (public.is_at_least('gestor'));

create policy ent_sel on public.entradas for select to authenticated
  using (public.current_papel() is not null);
create policy ent_ins on public.entradas for insert to authenticated
  with check (public.tem_papel('comercial','gestor','admin') and por_id = auth.uid());
-- sem UPDATE/DELETE: transicao de estado so pela RPC confirmar/recusar

create policy pag_sel on public.pagamentos for select to authenticated
  using (public.current_papel() is not null);
-- sem INSERT/UPDATE/DELETE: escrita so via marcar_celula/confirmar_entrada (definer)

create policy mov_sel on public.mov_fin for select to authenticated
  using (public.is_at_least('financeiro'));
create policy mov_del on public.mov_fin for delete to authenticated
  using (public.is_at_least('admin'));
-- sem INSERT/UPDATE: ledger append-only via RPC

create policy comprov_ins on storage.objects for insert to authenticated
  with check (bucket_id='comprovantes' and public.current_papel() is not null);
create policy comprov_sel on storage.objects for select to authenticated
  using (bucket_id='comprovantes' and (public.is_at_least('financeiro') or owner = auth.uid()));
create policy comprov_upd on storage.objects for update to authenticated
  using (bucket_id='comprovantes' and public.is_at_least('gestor'))
  with check (bucket_id='comprovantes' and public.is_at_least('gestor'));
create policy comprov_del on storage.objects for delete to authenticated
  using (bucket_id='comprovantes' and public.is_at_least('gestor'));
