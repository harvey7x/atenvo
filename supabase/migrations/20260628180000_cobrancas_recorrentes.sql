-- Cobranças recorrentes (controle interno). Reutiliza cobrancas/cobranca_pagamentos/cobranca_eventos.
-- Determinístico (ausências auditadas; tabelas vazias). Sem gateway/boleto/Pix.

-- 0) helper de gestão (admin/supervisor/platform admin) — usado em RLS e RPCs
create or replace function public.cobranca_gestor(org uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select public.is_platform_admin() or (public.org_operacional(org) and public.papel_na_org(org) in ('admin','supervisor'));
$$;
revoke all on function public.cobranca_gestor(uuid) from public, anon;
grant execute on function public.cobranca_gestor(uuid) to authenticated;

-- 1) cobrancas: autoria obrigatória + obrigatoriedades + validações + unique p/ FK composta
alter table public.cobrancas
  add column criado_por uuid not null references public.usuarios(id),
  alter column valor_mensal set not null,
  alter column data_inicio  set not null,
  add constraint chk_cob_valor_pos check (valor_mensal > 0),
  add constraint chk_cob_ciclos    check (ciclos_totais between 1 and 60),
  add constraint cobrancas_id_org_uniq unique (id, organizacao_id);
alter table public.cobrancas drop constraint cobrancas_contato_id_fkey;
alter table public.cobrancas add constraint cobrancas_contato_org_fk
  foreign key (contato_id, organizacao_id) references public.contatos(id, organizacao_id) on delete restrict;

-- 2) trigger de autoria/integridade/imutabilidade + atualizado_em (substitui trg_cobrancas_upd)
create or replace function public.fn_cobranca_before() returns trigger
  language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); v_org_contato uuid; v_opp_org uuid; v_opp_contato uuid;
begin
  if uid is null then raise exception 'usuario_autenticado_obrigatorio'; end if;
  if not public.is_platform_admin() and not exists (
      select 1 from public.organizacao_usuarios where organizacao_id=NEW.organizacao_id and usuario_id=uid and status='ativo')
    then raise exception 'usuario_nao_membro_ativo'; end if;
  if tg_op = 'INSERT' then
    NEW.criado_por := uid;
  else
    NEW.criado_por := OLD.criado_por; NEW.atualizado_em := now();
    if NEW.organizacao_id is distinct from OLD.organizacao_id or NEW.contato_id is distinct from OLD.contato_id
      then raise exception 'vinculo_imutavel'; end if;
  end if;
  select organizacao_id into v_org_contato from public.contatos where id = NEW.contato_id;
  if v_org_contato is distinct from NEW.organizacao_id then raise exception 'contato_outra_org'; end if;
  if NEW.oportunidade_id is not null then
    select organizacao_id, contato_id into v_opp_org, v_opp_contato from public.oportunidades where id = NEW.oportunidade_id;
    if v_opp_org is distinct from NEW.organizacao_id then raise exception 'oportunidade_outra_org'; end if;
    if v_opp_contato is distinct from NEW.contato_id then raise exception 'oportunidade_contato_divergente'; end if;
  end if;
  if NEW.responsavel_id is not null and not exists (
      select 1 from public.organizacao_usuarios where organizacao_id=NEW.organizacao_id and usuario_id=NEW.responsavel_id and status='ativo')
    then raise exception 'responsavel_invalido'; end if;
  return NEW;
end $$;
revoke all on function public.fn_cobranca_before() from public, anon;
create trigger trg_cobranca_before before insert or update on public.cobrancas
  for each row execute function public.fn_cobranca_before();
drop trigger trg_cobrancas_upd on public.cobrancas; -- removia atualizado_em via set_atualizado_em() (sem search_path)

-- 3) cobranca_pagamentos: baixa + obrigatoriedades + coerência + FK composta por organização
alter table public.cobranca_pagamentos
  add column valor_pago    numeric(12,2),
  add column observacoes   text,
  add column atualizado_em timestamptz not null default now(),
  alter column valor         set not null,
  alter column data_prevista set not null,
  alter column status        set default 'prevista',
  add constraint chk_pag_valor_pos check (valor > 0),
  add constraint chk_pag_coerencia check (
    (status = 'paga'      and valor_pago = valor and data_pagamento is not null) or
    (status = 'prevista'  and valor_pago is null and data_pagamento is null)     or
    (status = 'nao_paga'  and valor_pago is null and data_pagamento is null)     or
    (status = 'cancelada' and valor_pago is null and data_pagamento is null) );
alter table public.cobranca_pagamentos drop constraint cobranca_pagamentos_cobranca_id_fkey;
alter table public.cobranca_pagamentos add constraint cobranca_pagamentos_cob_org_fk
  foreign key (cobranca_id, organizacao_id) references public.cobrancas(id, organizacao_id) on delete cascade;

-- 4) atualizado_em próprio (sem reutilizar set_atualizado_em) + recálculo da cobrança
create or replace function public.fn_cobranca_pag_touch() returns trigger
  language plpgsql set search_path = public as $$
begin NEW.atualizado_em := now(); return NEW; end $$;
revoke all on function public.fn_cobranca_pag_touch() from public, anon;
create trigger trg_pag_touch before update on public.cobranca_pagamentos
  for each row execute function public.fn_cobranca_pag_touch();

create or replace function public.fn_cobranca_recalc() returns trigger
  language plpgsql set search_path = public as $$
declare cid uuid; pagas int; restantes int; prox date; cur text; total_nc int;
begin
  if tg_op = 'DELETE' then cid := OLD.cobranca_id; else cid := NEW.cobranca_id; end if;
  select status::text into cur from public.cobrancas where id = cid;
  if cur = 'cancelado' then return null; end if;
  select count(*) filter (where status='paga'),
         count(*) filter (where status in ('prevista','nao_paga')),
         count(*) filter (where status <> 'cancelada')
    into pagas, restantes, total_nc from public.cobranca_pagamentos where cobranca_id = cid;
  select coalesce(
    (select min(data_prevista) from public.cobranca_pagamentos where cobranca_id=cid and status='nao_paga'),
    (select min(data_prevista) from public.cobranca_pagamentos where cobranca_id=cid and status='prevista' and data_prevista < current_date),
    (select min(data_prevista) from public.cobranca_pagamentos where cobranca_id=cid and status='prevista' and data_prevista >= current_date)
  ) into prox;
  update public.cobrancas
     set ciclos_pagos = coalesce(pagas,0), ciclos_restantes = coalesce(restantes,0), proxima_cobranca = prox,
         status = case when coalesce(total_nc,0) > 0 and coalesce(restantes,0) = 0 then 'finalizado' else 'ativo' end
   where id = cid;
  return null;
end $$;
revoke all on function public.fn_cobranca_recalc() from public, anon;
create trigger trg_cobranca_recalc after insert or update or delete on public.cobranca_pagamentos
  for each row execute function public.fn_cobranca_recalc();

-- 5) RPC criação atômica (cobrança + N parcelas; fim de mês tratado)
create or replace function public.criar_cobranca_com_parcelas(
  p_contato uuid, p_valor numeric, p_data_primeira date, p_ciclos int default 6,
  p_responsavel uuid default null, p_servico text default null, p_observacoes text default null)
  returns uuid language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_id uuid; v_uid uuid := auth.uid(); i int; v_venc date; v_dia int;
begin
  if v_uid is null then raise exception 'usuario_autenticado_obrigatorio'; end if;
  select organizacao_id into v_org from public.contatos where id = p_contato;
  if v_org is null then raise exception 'contato_invalido'; end if;
  if not public.cobranca_gestor(v_org) then raise exception 'sem_permissao'; end if;
  if p_valor is null or p_valor <= 0 then raise exception 'valor_invalido'; end if;
  if p_ciclos < 1 or p_ciclos > 60 then raise exception 'ciclos_invalido'; end if;
  if p_data_primeira is null then raise exception 'data_invalida'; end if;
  v_dia := extract(day from p_data_primeira)::int;
  insert into public.cobrancas(organizacao_id, contato_id, responsavel_id, servico, valor_mensal,
      ciclos_totais, ciclos_pagos, ciclos_restantes, dia_cobranca, data_inicio, proxima_cobranca, status, observacoes)
    values (v_org, p_contato, p_responsavel, p_servico, p_valor, p_ciclos, 0, p_ciclos, v_dia,
      p_data_primeira, p_data_primeira, 'ativo', p_observacoes)
    returning id into v_id;
  for i in 0..(p_ciclos-1) loop
    v_venc := least(
      ((date_trunc('month', p_data_primeira) + (i||' months')::interval)::date + ((v_dia-1)||' days')::interval)::date,
      (date_trunc('month', (date_trunc('month', p_data_primeira) + (i||' months')::interval)) + interval '1 month - 1 day')::date);
    insert into public.cobranca_pagamentos(organizacao_id, cobranca_id, ciclo, valor, data_prevista, status)
      values (v_org, v_id, i+1, p_valor, v_venc, 'prevista');
  end loop;
  return v_id;
end $$;
revoke all on function public.criar_cobranca_com_parcelas(uuid,numeric,date,int,uuid,text,text) from public, anon;
grant execute on function public.criar_cobranca_com_parcelas(uuid,numeric,date,int,uuid,text,text) to authenticated;

-- 6) RPC baixa de parcela (valor integral)
create or replace function public.registrar_baixa_parcela(p_parcela uuid, p_data date default current_date, p_obs text default null)
  returns public.cobranca_pagamentos language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); r public.cobranca_pagamentos; v_cob_status text;
begin
  if v_uid is null then raise exception 'usuario_autenticado_obrigatorio'; end if;
  select * into r from public.cobranca_pagamentos where id = p_parcela;
  if r.id is null then raise exception 'parcela_invalida'; end if;
  if not public.cobranca_gestor(r.organizacao_id) then raise exception 'sem_permissao'; end if;
  select status::text into v_cob_status from public.cobrancas where id = r.cobranca_id;
  if v_cob_status = 'cancelado' then raise exception 'cobranca_cancelada'; end if;
  if r.status = 'cancelada' then raise exception 'parcela_cancelada'; end if;
  if r.status = 'paga' then raise exception 'parcela_ja_paga'; end if;
  update public.cobranca_pagamentos
     set status='paga', valor_pago = valor, data_pagamento = coalesce(p_data, current_date), observacoes = coalesce(p_obs, observacoes)
   where id = p_parcela returning * into r;
  insert into public.cobranca_eventos(organizacao_id, cobranca_id, tipo, descricao, dados, usuario_id)
    values (r.organizacao_id, r.cobranca_id, 'parcela_paga', 'Baixa de parcela '||r.ciclo,
      jsonb_build_object('parcela', p_parcela, 'data', r.data_pagamento, 'obs', p_obs), v_uid);
  return r;
end $$;
revoke all on function public.registrar_baixa_parcela(uuid,date,text) from public, anon;
grant execute on function public.registrar_baixa_parcela(uuid,date,text) to authenticated;

-- 7) RPC alteração de status (transições explícitas; estado anterior capturado antes do update)
create or replace function public.alterar_status_parcela(p_parcela uuid, p_novo text, p_obs text default null)
  returns public.cobranca_pagamentos language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); r public.cobranca_pagamentos; v_status_anterior text; ok boolean := false;
begin
  if v_uid is null then raise exception 'usuario_autenticado_obrigatorio'; end if;
  if p_novo not in ('prevista','nao_paga','cancelada') then raise exception 'status_invalido'; end if;
  select * into r from public.cobranca_pagamentos where id = p_parcela;
  if r.id is null then raise exception 'parcela_invalida'; end if;
  if not public.cobranca_gestor(r.organizacao_id) then raise exception 'sem_permissao'; end if;
  if (select status::text from public.cobrancas where id=r.cobranca_id) = 'cancelado' then raise exception 'cobranca_cancelada'; end if;
  v_status_anterior := r.status;
  ok := (v_status_anterior='prevista' and p_novo in ('nao_paga','cancelada'))
     or (v_status_anterior='nao_paga' and p_novo in ('prevista','cancelada'))
     or (v_status_anterior='paga'     and p_novo='prevista');
  if not ok then raise exception 'transicao_nao_permitida'; end if;
  update public.cobranca_pagamentos
     set status = p_novo, valor_pago = null, data_pagamento = null, observacoes = coalesce(p_obs, observacoes)
   where id = p_parcela returning * into r;
  insert into public.cobranca_eventos(organizacao_id, cobranca_id, tipo, descricao, dados, usuario_id)
    values (r.organizacao_id, r.cobranca_id, 'parcela_status', 'Parcela '||r.ciclo||': '||p_novo,
      jsonb_build_object('parcela', p_parcela, 'de', v_status_anterior, 'para', p_novo, 'obs', p_obs), v_uid);
  return r;
end $$;
revoke all on function public.alterar_status_parcela(uuid,text,text) from public, anon;
grant execute on function public.alterar_status_parcela(uuid,text,text) to authenticated;

-- 8) RPC cancelamento da cobrança (nunca deleta; preserva pagas)
create or replace function public.cancelar_cobranca(p_cobranca uuid, p_obs text default null)
  returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_org uuid; v_status text;
begin
  if v_uid is null then raise exception 'usuario_autenticado_obrigatorio'; end if;
  select organizacao_id, status::text into v_org, v_status from public.cobrancas where id = p_cobranca;
  if v_org is null then raise exception 'cobranca_invalida'; end if;
  if not public.cobranca_gestor(v_org) then raise exception 'sem_permissao'; end if;
  if v_status = 'cancelado' then raise exception 'ja_cancelada'; end if;
  if v_status = 'finalizado' then raise exception 'cobranca_finalizada'; end if;
  update public.cobrancas set status='cancelado', data_encerramento = current_date where id = p_cobranca;
  update public.cobranca_pagamentos set status='cancelada' where cobranca_id = p_cobranca and status in ('prevista','nao_paga');
  insert into public.cobranca_eventos(organizacao_id, cobranca_id, tipo, descricao, dados, usuario_id)
    values (v_org, p_cobranca, 'cobranca_cancelada', 'Cobrança cancelada', jsonb_build_object('obs', p_obs), v_uid);
end $$;
revoke all on function public.cancelar_cobranca(uuid,text) from public, anon;
grant execute on function public.cancelar_cobranca(uuid,text) to authenticated;

-- 9) DELETE bloqueado + RLS por papel (admin/supervisor full; atendente só SELECT relacionado)
revoke delete on public.cobrancas from authenticated;
revoke delete on public.cobranca_pagamentos from authenticated;
drop policy cobrancas_all on public.cobrancas;
drop policy cobranca_pagamentos_all on public.cobranca_pagamentos;

create policy cobrancas_sel on public.cobrancas for select using (
  public.cobranca_gestor(organizacao_id)
  or (public.is_member(organizacao_id) and (responsavel_id = auth.uid() or criado_por = auth.uid()
      or exists (select 1 from public.oportunidades o where o.id = oportunidade_id and o.responsavel_id = auth.uid()))));
create policy cobrancas_ins on public.cobrancas for insert with check (public.cobranca_gestor(organizacao_id));
create policy cobrancas_upd on public.cobrancas for update using (public.cobranca_gestor(organizacao_id)) with check (public.cobranca_gestor(organizacao_id));

create policy cob_pag_sel on public.cobranca_pagamentos for select using (
  public.cobranca_gestor(organizacao_id)
  or exists (select 1 from public.cobrancas c where c.id = cobranca_id and public.is_member(c.organizacao_id)
      and (c.responsavel_id = auth.uid() or c.criado_por = auth.uid()
        or exists (select 1 from public.oportunidades o where o.id = c.oportunidade_id and o.responsavel_id = auth.uid()))));
create policy cob_pag_ins on public.cobranca_pagamentos for insert with check (public.cobranca_gestor(organizacao_id));
create policy cob_pag_upd on public.cobranca_pagamentos for update using (public.cobranca_gestor(organizacao_id)) with check (public.cobranca_gestor(organizacao_id));
