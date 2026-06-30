-- Inbox WhatsApp — Etapa A: arquivamento + estado de leitura (não lidas operacional por conversa).
-- Timestamps (não booleanos) para auditoria. Reversível (drop columns / functions).
alter table public.conversas
  add column if not exists arquivada_em   timestamptz,
  add column if not exists arquivada_por  uuid references public.usuarios(id),
  add column if not exists fixada_em      timestamptz,
  add column if not exists silenciada_ate timestamptz,
  add column if not exists ultima_lida_em timestamptz;

-- lista principal filtra arquivada_em IS NULL com frequência
create index if not exists idx_conversas_ativas on public.conversas (organizacao_id, ultima_interacao_em desc) where arquivada_em is null;

-- ARQUIVAR / DESARQUIVAR (membership + org). Preserva histórico/contato/oportunidade/canal.
create or replace function public.wa_arquivar_conversa(p_conversa uuid, p_arquivar boolean)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_org uuid;
begin
  select organizacao_id into v_org from conversas where id = p_conversa;
  if v_org is null then raise exception 'conversa_nao_encontrada'; end if;
  if not exists (select 1 from organizacao_usuarios ou where ou.organizacao_id = v_org and ou.usuario_id = auth.uid() and ou.status = 'ativo') then
    raise exception 'sem_permissao';
  end if;
  if p_arquivar then
    update conversas set arquivada_em = now(), arquivada_por = auth.uid() where id = p_conversa;
  else
    update conversas set arquivada_em = null, arquivada_por = null where id = p_conversa;
  end if;
end $$;

-- MARCAR LIDA / NÃO LIDA (não lida operacional da conversa). Lida zera o contador e grava ultima_lida_em.
create or replace function public.wa_marcar_lida(p_conversa uuid, p_lida boolean)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_org uuid;
begin
  select organizacao_id into v_org from conversas where id = p_conversa;
  if v_org is null then raise exception 'conversa_nao_encontrada'; end if;
  if not exists (select 1 from organizacao_usuarios ou where ou.organizacao_id = v_org and ou.usuario_id = auth.uid() and ou.status = 'ativo') then
    raise exception 'sem_permissao';
  end if;
  if p_lida then
    update conversas set nao_lidas = 0, ultima_lida_em = now() where id = p_conversa;
  else
    update conversas set nao_lidas = greatest(coalesce(nao_lidas,0), 1), ultima_lida_em = null where id = p_conversa;
  end if;
end $$;

revoke all on function public.wa_arquivar_conversa(uuid, boolean) from public, anon;
revoke all on function public.wa_marcar_lida(uuid, boolean) from public, anon;
grant execute on function public.wa_arquivar_conversa(uuid, boolean) to authenticated, service_role;
grant execute on function public.wa_marcar_lida(uuid, boolean) to authenticated, service_role;
notify pgrst, 'reload schema';
