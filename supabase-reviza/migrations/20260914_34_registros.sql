-- Reviza — REGISTROS (auditoria): o admin vê tudo que cada pessoa fez.
-- Backbone = gatilhos no banco (capturam a ação por qualquer caminho: tela, RPC,
-- import), sempre com o ator (auth.uid → profiles). REGRA: só loga ação de
-- PESSOA (auth.uid não nulo) — motor/webhook/service-role não entram (corta ruído).
-- Só admin lê (RLS). Aplicada 2026-09-14 via MCP como "reviza_34_registros".

create table public.registros (
  id           bigint generated always as identity primary key,
  quando       timestamptz not null default now(),
  ator_id      uuid,
  ator_nome    text not null default '—',
  ator_papel   text,
  acao         text not null,       -- verbo: cadastrou, editou, confirmou, excluiu…
  entidade     text not null,       -- cliente, pagamento, comissão, régua, envio, aviso…
  entidade_id  text,
  rotulo       text,                -- nome do cliente / assunto
  detalhe      text
);
create index registros_quando on public.registros (quando desc);
create index registros_ator on public.registros (ator_id, quando desc);

alter table public.registros enable row level security;
create policy registros_sel on public.registros for select to authenticated using (public.is_at_least('admin'));
-- sem policy de escrita: só os gatilhos/definer gravam

create or replace function private.brl(v numeric) returns text
  language sql immutable set search_path = '' as
$$ select 'R$ ' || replace(to_char(coalesce(v,0), 'FM999999990.00'), '.', ',') $$;

-- usado por RPCs (ex.: marcar_celula) para logar com o ator correto
create or replace function private.registrar(p_acao text, p_entidade text, p_id text, p_rotulo text, p_detalhe text)
  returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then return; end if;
  insert into public.registros(ator_id, ator_nome, ator_papel, acao, entidade, entidade_id, rotulo, detalhe)
  values (auth.uid(),
    coalesce((select nome from public.profiles where id = auth.uid()), '—'),
    (select papel::text from public.profiles where id = auth.uid()),
    p_acao, p_entidade, p_id, p_rotulo, p_detalhe);
end $$;
revoke all on function private.registrar(text,text,text,text,text) from public, anon, authenticated;

-- gatilho genérico (jsonb, à prova de coluna inexistente)
create or replace function public.tg_registrar() returns trigger
  language plpgsql security definer set search_path = '' as $$
declare
  o jsonb := case when TG_OP='INSERT' then null else to_jsonb(OLD) end;
  n jsonb := case when TG_OP='DELETE' then null else to_jsonb(NEW) end;
  r jsonb := coalesce(n, o);
  v_acao text; v_ent text; v_id text; v_rot text; v_det text;
begin
  if auth.uid() is null then return coalesce(NEW, OLD); end if;

  if TG_TABLE_NAME = 'leads' then
    v_ent := 'cliente'; v_id := r->>'id'; v_rot := r->>'nome';
    if TG_OP = 'INSERT' then v_acao := 'cadastrou'; v_det := 'novo cliente';
    elsif TG_OP = 'DELETE' then v_acao := 'excluiu'; v_det := 'removeu o cliente';
    else
      if o->>'situacao' is distinct from n->>'situacao' then
        v_acao := 'atualizou';
        v_det := case n->>'situacao' when 'cancelado' then 'marcou débito parado' when 'ativo' then 'voltou o cliente para Novos' else 'mudou a situação' end;
      elsif o->>'dia' is distinct from n->>'dia' then
        v_acao := 'direcionou'; v_det := 'para o ciclo dia ' || coalesce(n->>'dia','—');
      else v_acao := 'editou'; v_det := 'atualizou o cadastro'; end if;
    end if;

  elsif TG_TABLE_NAME = 'entradas' then
    v_ent := 'pagamento'; v_id := r->>'id'; v_rot := r->>'lead_nome';
    if TG_OP = 'INSERT' then
      v_acao := 'lançou'; v_det := 'informou pagamento de ' || private.brl((n->>'valor')::numeric) || ' (' || public.comp_rotulo(n->>'comp') || ')';
    elsif TG_OP = 'UPDATE' and o->>'estado' is distinct from n->>'estado' then
      v_acao := case n->>'estado' when 'confirmada' then 'confirmou' when 'recusada' then 'recusou' else 'atualizou' end;
      v_det := 'pagamento de ' || private.brl((n->>'valor')::numeric) || ' (' || public.comp_rotulo(n->>'comp') || ')';
    else return coalesce(NEW, OLD); end if;

  elsif TG_TABLE_NAME = 'mov_fin' then
    v_ent := 'movimentação'; v_id := r->>'id'; v_rot := r->>'lead_nome';
    v_acao := 'excluiu'; v_det := 'removeu do histórico ' || private.brl((r->>'valor')::numeric) || ' (' || public.comp_rotulo(r->>'comp') || ')';

  elsif TG_TABLE_NAME = 'comissoes' then
    if TG_OP = 'UPDATE' and o->>'pct' is not distinct from n->>'pct' then return NEW; end if;
    v_ent := 'comissão'; v_id := r->>'comercial'; v_rot := r->>'comercial';
    v_acao := case TG_OP when 'INSERT' then 'definiu' else 'alterou' end;
    v_det := 'comissão de ' || (r->>'pct') || '% da mensalidade';

  elsif TG_TABLE_NAME = 'wa_regua_config' then
    v_ent := 'régua'; v_acao := 'configurou';
    if o->>'ativa' is distinct from n->>'ativa' then
      v_det := case n->>'ativa' when 'true' then 'ligou a régua automática' else 'desligou a régua automática' end;
    elsif o->>'hora_envio' is distinct from n->>'hora_envio' then
      v_det := 'mudou o horário do disparo para ' || (n->>'hora_envio') || 'h';
    else return NEW; end if;

  elsif TG_TABLE_NAME = 'wa_regua_msgs' then
    v_ent := 'mensagem da régua'; v_id := r->>'id'; v_rot := coalesce(nullif(r->>'nome',''), 'mensagem');
    v_acao := case TG_OP when 'INSERT' then 'criou' when 'DELETE' then 'excluiu' else 'editou' end;

  elsif TG_TABLE_NAME = 'wa_envios' then
    v_ent := 'envio'; v_id := r->>'id'; v_rot := r->>'nome'; v_acao := 'criou'; v_det := 'novo envio de mensagens';

  elsif TG_TABLE_NAME = 'avisos' then
    v_ent := 'aviso'; v_id := r->>'id'; v_rot := left(coalesce(r->>'corpo',''), 60);
    v_acao := case TG_OP when 'INSERT' then 'publicou' else 'excluiu' end;

  else return coalesce(NEW, OLD);
  end if;

  insert into public.registros(ator_id, ator_nome, ator_papel, acao, entidade, entidade_id, rotulo, detalhe)
  values (auth.uid(),
    coalesce((select nome from public.profiles where id = auth.uid()), '—'),
    (select papel::text from public.profiles where id = auth.uid()),
    v_acao, v_ent, v_id, v_rot, v_det);
  return coalesce(NEW, OLD);
end $$;

create trigger reg_leads      after insert or update or delete on public.leads           for each row execute function public.tg_registrar();
create trigger reg_entradas   after insert or update           on public.entradas        for each row execute function public.tg_registrar();
create trigger reg_movfin     after delete                     on public.mov_fin         for each row execute function public.tg_registrar();
create trigger reg_comissoes  after insert or update           on public.comissoes       for each row execute function public.tg_registrar();
create trigger reg_regua_cfg  after update                     on public.wa_regua_config for each row execute function public.tg_registrar();
create trigger reg_regua_msgs after insert or update or delete on public.wa_regua_msgs   for each row execute function public.tg_registrar();
create trigger reg_envios     after insert                     on public.wa_envios       for each row execute function public.tg_registrar();
create trigger reg_avisos     after insert or delete           on public.avisos          for each row execute function public.tg_registrar();

-- marcar_celula (grade): recriada = corpo da mig 30 + log de auditoria no fim
create or replace function public.marcar_celula(
  p_lead uuid, p_comp text, p_status public.status_pagamento,
  p_valor numeric default null, p_comprovante_path text default null) returns void
  language plpgsql security definer set search_path = '' as $$
declare v_nome text; v_com text; v_dono uuid; v_titulo text;
begin
  if p_status = 'fora' then
    if not public.is_at_least('gestor') then raise exception 'sem permissao' using errcode='42501'; end if;
  else
    if not public.is_at_least('financeiro') then raise exception 'sem permissao' using errcode='42501'; end if;
  end if;
  if p_status='pago' and p_valor is null then raise exception 'valor obrigatorio para pago' using errcode='22023'; end if;

  insert into public.competencias(comp) values (p_comp) on conflict do nothing;
  insert into public.pagamentos(lead_id, comp, status, valor, comprovante_path, pago_em, confirmado_por)
  values (p_lead, p_comp, p_status, case when p_status='pago' then p_valor else null end,
          p_comprovante_path, case when p_status='pago' then now() else null end, auth.uid())
  on conflict (lead_id,comp) do update set
    status=excluded.status,
    valor=case when excluded.status='pago' then excluded.valor else null end,
    comprovante_path=coalesce(excluded.comprovante_path, public.pagamentos.comprovante_path),
    pago_em=case when excluded.status='pago' then now() else null end,
    confirmado_por=auth.uid();

  if p_comprovante_path is not null and p_status='pago' then
    select l.nome, l.comercial into v_nome, v_com from public.leads l where l.id=p_lead;
    insert into public.mov_fin(lead_id, lead_nome, comercial_nome, comp, valor, status, comprovante_path, decidido_por)
    values (p_lead, v_nome, v_com, p_comp, p_valor, 'confirmada', p_comprovante_path, auth.uid());
  end if;

  if p_status = 'pago' then
    select l.nome, l.comercial into v_nome, v_com from public.leads l where l.id = p_lead;
    select p.id into v_dono from public.profiles p
      where p.ativo and upper(btrim(p.nome)) = upper(btrim(coalesce(v_com, '')))
      order by p.created_at limit 1;
    v_titulo := 'Recebido: ' || coalesce(v_nome, 'cliente') || ' · ' || public.comp_rotulo(p_comp);
    delete from public.notificacoes
      where user_id = v_dono and tipo = 'celula_recebida' and titulo = v_titulo and lida_em is null;
    perform public.notificar(v_dono, 'celula_recebida', v_titulo,
      'R$ ' || replace(to_char(coalesce(p_valor, 0), 'FM999999990.00'), '.', ',') || ' marcado como pago na grade.',
      '/cobrancas/planilha');
  end if;

  -- auditoria da ação na grade
  perform private.registrar(
    case p_status when 'pago' then 'marcou pago' when 'nao_pagou' then 'marcou não pago' else 'tirou da régua' end,
    'grade', p_lead::text,
    (select nome from public.leads where id = p_lead),
    public.comp_rotulo(p_comp) || case when p_status='pago' then ' · ' || private.brl(p_valor) else '' end);
end $$;
revoke all on function public.marcar_celula(uuid,text,public.status_pagamento,numeric,text) from public, anon;
grant execute on function public.marcar_celula(uuid,text,public.status_pagamento,numeric,text) to authenticated;
