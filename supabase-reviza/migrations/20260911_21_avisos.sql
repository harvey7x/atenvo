-- Reviza — Área de Avisos: o administrativo (admin/gestor) manda avisos pro
-- time comercial (texto + anexos: imagem/áudio/vídeo/documento, vários por
-- aviso), escolhendo os destinatários; cada destinatário tem recibo de
-- leitura (lido_em). Bucket privado 'avisos' pros anexos.
-- Aplicada 2026-09-11 via MCP como "reviza_21_avisos".

do $$ begin create type public.aviso_tipo_anexo as enum ('imagem','audio','video','documento'); exception when duplicate_object then null; end $$;

create table public.avisos (
  id          uuid primary key default gen_random_uuid(),
  autor_id    uuid references public.profiles(id) on delete set null,
  autor_nome  text not null default '',
  corpo       text not null default '',
  para_todos  boolean not null default false,
  created_at  timestamptz not null default now()
);
create index avisos_ordem_idx on public.avisos(created_at desc);

create table public.aviso_anexos (
  id       uuid primary key default gen_random_uuid(),
  aviso_id uuid not null references public.avisos(id) on delete cascade,
  tipo     public.aviso_tipo_anexo not null,
  path     text not null,
  nome     text not null default '',
  ordem    int  not null default 0
);
create index aviso_anexos_aviso_idx on public.aviso_anexos(aviso_id, ordem);

-- nome desnormalizado: o comercial não lê profiles alheios; o recibo mostra o nome direto
create table public.aviso_destinos (
  aviso_id uuid not null references public.avisos(id) on delete cascade,
  user_id  uuid not null references public.profiles(id) on delete cascade,
  nome     text not null default '',
  lido_em  timestamptz,
  primary key (aviso_id, user_id)
);
create index aviso_destinos_pendentes_idx on public.aviso_destinos(user_id) where lido_em is null;

alter table public.avisos         enable row level security;
alter table public.aviso_anexos   enable row level security;
alter table public.aviso_destinos enable row level security;

-- envia: só o administrativo (gestor/admin); vê: administrativo (tudo) ou destinatário
create policy avisos_ins on public.avisos for insert to authenticated
  with check (public.tem_papel('gestor','admin') and autor_id = auth.uid());
create policy avisos_sel on public.avisos for select to authenticated
  using (public.tem_papel('gestor','admin')
     or exists (select 1 from public.aviso_destinos d where d.aviso_id = id and d.user_id = auth.uid()));
create policy avisos_del on public.avisos for delete to authenticated
  using (public.tem_papel('gestor','admin'));

create policy aviso_anexos_ins on public.aviso_anexos for insert to authenticated
  with check (public.tem_papel('gestor','admin'));
-- a subquery em avisos passa pelo RLS de avisos: destinatário só vê anexo de aviso dele
create policy aviso_anexos_sel on public.aviso_anexos for select to authenticated
  using (exists (select 1 from public.avisos a where a.id = aviso_id));
create policy aviso_anexos_del on public.aviso_anexos for delete to authenticated
  using (public.tem_papel('gestor','admin'));

create policy aviso_destinos_ins on public.aviso_destinos for insert to authenticated
  with check (public.tem_papel('gestor','admin'));
create policy aviso_destinos_sel on public.aviso_destinos for select to authenticated
  using (user_id = auth.uid() or public.tem_papel('gestor','admin'));
create policy aviso_destinos_del on public.aviso_destinos for delete to authenticated
  using (public.tem_papel('gestor','admin'));

-- marcar como lido: só a PRÓPRIA linha, via RPC (nada de update direto na tabela)
create or replace function public.aviso_marcar_lido(p_aviso uuid) returns void
language sql security definer set search_path = public as $$
  update public.aviso_destinos set lido_em = now()
  where aviso_id = p_aviso and user_id = auth.uid() and lido_em is null;
$$;
revoke all on function public.aviso_marcar_lido(uuid) from public, anon;
grant execute on function public.aviso_marcar_lido(uuid) to authenticated;

-- anon nunca enxerga nada disso
revoke all on public.avisos, public.aviso_anexos, public.aviso_destinos from anon;

-- anexos em bucket privado próprio (16MB por arquivo, igual ao teto do wa-midia)
insert into storage.buckets (id, name, public, file_size_limit)
  values ('avisos','avisos', false, 16777216) on conflict (id) do nothing;
create policy avisos_st_ins on storage.objects for insert to authenticated
  with check (bucket_id = 'avisos' and public.tem_papel('gestor','admin'));
create policy avisos_st_sel on storage.objects for select to authenticated
  using (bucket_id = 'avisos' and public.current_papel() is not null);
create policy avisos_st_del on storage.objects for delete to authenticated
  using (bucket_id = 'avisos' and public.tem_papel('gestor','admin'));
