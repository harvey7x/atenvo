-- Revisão Etapa 1: RLS por PAPEL + auditoria ampliada + guarda de reatribuição + delete só admin.
-- helper: papel do usuário atual na org (ativo). Null se não for membro ativo.
create or replace function public.papel_org(p_org uuid) returns text language sql stable security definer set search_path=public,pg_temp as $$
  select papel from public.organizacao_usuarios where organizacao_id=p_org and usuario_id=auth.uid() and status='ativo' limit 1;
$$;

-- SELECT: membro ativo vê os agendamentos da própria organização (calendário de equipe compartilhado).
drop policy if exists agendamentos_select on public.agendamentos;
create policy agendamentos_select on public.agendamentos for select to authenticated
  using (papel_org(organizacao_id) is not null);

-- INSERT: membro ativo; criado_por = ele mesmo; atendente só cria p/ si (ou sem atendente) — gestor cria p/ qualquer um.
drop policy if exists agendamentos_insert on public.agendamentos;
create policy agendamentos_insert on public.agendamentos for insert to authenticated
  with check (
    papel_org(organizacao_id) is not null and criado_por = auth.uid()
    and (papel_org(organizacao_id) in ('admin','supervisor') or atendente_id is null or atendente_id = auth.uid())
  );

-- UPDATE: gestor (admin/supervisor) edita qualquer da org; atendente só os próprios (criou ou é o atendente).
drop policy if exists agendamentos_update on public.agendamentos;
create policy agendamentos_update on public.agendamentos for update to authenticated
  using (
    papel_org(organizacao_id) in ('admin','supervisor')
    or (papel_org(organizacao_id) = 'atendente' and (criado_por = auth.uid() or atendente_id = auth.uid()))
  )
  with check (papel_org(organizacao_id) is not null);

-- DELETE FÍSICO: SOMENTE admin (o comum é cancelamento lógico). Atendente/supervisor não apagam.
drop policy if exists agendamentos_delete on public.agendamentos;
create policy agendamentos_delete on public.agendamentos for delete to authenticated
  using (papel_org(organizacao_id) = 'admin');

-- Guarda: atendente NÃO pode reatribuir (mudar atendente_id p/ outra pessoa) sem ser gestor.
create or replace function public.agendamentos_guarda() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_papel text;
begin
  v_papel := papel_org(new.organizacao_id);
  if v_papel = 'atendente'
     and new.atendente_id is distinct from old.atendente_id
     and new.atendente_id is distinct from auth.uid() then
    raise exception 'sem_permissao_reatribuir' using errcode='check_violation';
  end if;
  return new;
end $$;
drop trigger if exists trg_agendamentos_guarda on public.agendamentos;
create trigger trg_agendamentos_guarda before update on public.agendamentos for each row execute function public.agendamentos_guarda();

-- Auditoria AMPLIADA: além de criado/status, registra horário e atendente alterados (de/para, usuário, data).
create or replace function public.agendamentos_log() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if tg_op = 'INSERT' then
    insert into agendamento_atividades (organizacao_id, agendamento_id, usuario_id, tipo, para)
    values (new.organizacao_id, new.id, auth.uid(), 'criado', jsonb_build_object('status', new.status, 'inicio_em', new.inicio_em, 'atendente_id', new.atendente_id));
    return new;
  end if;
  if new.status is distinct from old.status then
    insert into agendamento_atividades (organizacao_id, agendamento_id, usuario_id, tipo, de, para, motivo)
    values (new.organizacao_id, new.id, auth.uid(), 'status_alterado', jsonb_build_object('status', old.status), jsonb_build_object('status', new.status),
            coalesce(new.motivo_cancelamento, new.motivo_remarcacao));
  end if;
  if new.inicio_em is distinct from old.inicio_em or new.fim_em is distinct from old.fim_em then
    insert into agendamento_atividades (organizacao_id, agendamento_id, usuario_id, tipo, de, para, motivo)
    values (new.organizacao_id, new.id, auth.uid(), 'horario_alterado',
            jsonb_build_object('inicio_em', old.inicio_em, 'fim_em', old.fim_em),
            jsonb_build_object('inicio_em', new.inicio_em, 'fim_em', new.fim_em), new.motivo_remarcacao);
  end if;
  if new.atendente_id is distinct from old.atendente_id then
    insert into agendamento_atividades (organizacao_id, agendamento_id, usuario_id, tipo, de, para)
    values (new.organizacao_id, new.id, auth.uid(), 'atendente_alterado', jsonb_build_object('atendente_id', old.atendente_id), jsonb_build_object('atendente_id', new.atendente_id));
  end if;
  return new;
end $$;

revoke all on function public.papel_org(uuid) from public, anon;
grant execute on function public.papel_org(uuid) to authenticated, service_role;
notify pgrst, 'reload schema';
