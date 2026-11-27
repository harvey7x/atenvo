-- =====================================================================
-- 52 — Aprovação do "débito parado" (dono 24/09 via Matheus):
-- "todos podem cadastrar e marcar débito parado; mas quando marca, precisa ir
--  pra um local onde o financeiro/administrador/cadastro aprova — e decide as
--  datas, valores etc. — pra só depois ir pra Gestão."
--
-- Modelo: o cliente CONTINUA situacao='ativo' (fica nos Novos) enquanto aguarda,
-- com parado_pendente=true. Assim ele não aparece na Gestão, não conta na
-- carteira do painel e não vira "aguardando ciclo". A APROVAÇÃO é que muda pra
-- 'cancelado' (em cobrança) com o dia/valor/data decididos por quem aprova.
--
-- Quem aprova: cadastro, financeiro, gestor, admin. ATENÇÃO: papel_rank põe o
-- cadastro ABAIXO do comercial — por isso é lista explícita, nunca is_at_least.
--
-- Trava (trigger): fora destas RPCs, quem NÃO aprova não põe cliente em cobrança
-- (nem trocando a Situação na ficha, nem criando direto na Gestão) e não mexe
-- nos campos de aprovação. As RPCs marcam a transação com reviza.fluxo_parado.
-- =====================================================================

alter table public.leads
  add column if not exists parado_pendente        boolean not null default false,
  add column if not exists parado_solicitado_por  uuid references public.profiles(id) on delete set null,
  add column if not exists parado_solicitado_nome text,
  add column if not exists parado_solicitado_em   timestamptz,
  add column if not exists parado_aprovado_por    uuid references public.profiles(id) on delete set null,
  add column if not exists parado_aprovado_nome   text,
  add column if not exists parado_aprovado_em     timestamptz;

create index if not exists leads_parado_pendente_idx on public.leads (parado_solicitado_em) where parado_pendente;

-- quem aprova (cadastro/financeiro/gestor/admin)
create or replace function public.pode_aprovar_parado() returns boolean
  language sql stable security definer set search_path = ''
as $$ select coalesce(public.current_papel() = any (array['cadastro','financeiro','gestor','admin']::public.papel_usuario[]), false) $$;
revoke all on function public.pode_aprovar_parado() from public, anon;
grant execute on function public.pode_aprovar_parado() to authenticated;

-- sino de todos os aprovadores ativos (notificar() já pula quem disparou)
create or replace function private.notificar_aprovadores(p_tipo text, p_titulo text, p_corpo text, p_rota text)
  returns void language plpgsql security definer set search_path = ''
as $$
declare a record;
begin
  for a in select id from public.profiles
            where ativo and papel = any (array['cadastro','financeiro','gestor','admin']::public.papel_usuario[]) loop
    perform public.notificar(a.id, p_tipo, p_titulo, p_corpo, p_rota);
  end loop;
end $$;
revoke all on function private.notificar_aprovadores(text, text, text, text) from public, anon, authenticated;

-- 1) PEDIR (qualquer papel; comercial só nos clientes DELE)
create or replace function public.solicitar_parado(p_lead uuid, p_data_parou text)
  returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_papel text := public.current_papel()::text;
  l public.leads%rowtype;
  v_nome text;
begin
  if v_papel is null then raise exception 'sem permissao' using errcode = '42501'; end if;
  select * into l from public.leads where id = p_lead for update;
  if not found then raise exception 'cliente nao encontrado' using errcode = 'P0002'; end if;
  if v_papel = 'comercial' and not public.comercial_dono(l.comercial) then
    raise exception 'sem permissao' using errcode = '42501';
  end if;
  if l.situacao <> 'ativo' then raise exception 'este cliente ja esta em cobranca' using errcode = '22023'; end if;
  if l.parado_pendente then raise exception 'este cliente ja esta aguardando aprovacao' using errcode = '22023'; end if;
  select nome into v_nome from public.profiles where id = auth.uid();
  perform set_config('reviza.fluxo_parado', 'on', true);
  update public.leads set
    parado_pendente = true,
    data_parou = nullif(btrim(coalesce(p_data_parou, '')), ''),
    parado_solicitado_por = auth.uid(), parado_solicitado_nome = v_nome, parado_solicitado_em = now(),
    parado_aprovado_por = null, parado_aprovado_nome = null, parado_aprovado_em = null
  where id = p_lead;
  perform private.notificar_aprovadores('parado_pendente', 'Débito parado para aprovar',
    l.nome || ' — marcado por ' || coalesce(v_nome, 'alguém') || '. Defina ciclo e valor em Novos.', '/cobrancas/novos');
  return jsonb_build_object('ok', true);
end $$;

-- 2) APROVAR (cadastro/financeiro/gestor/admin): decide ciclo, valor e data → Gestão
create or replace function public.aprovar_parado(p_lead uuid, p_dia smallint, p_valor numeric, p_data_parou text)
  returns jsonb language plpgsql security definer set search_path = ''
as $$
declare l public.leads%rowtype; v_nome text;
begin
  if not public.pode_aprovar_parado() then raise exception 'sem permissao' using errcode = '42501'; end if;
  if p_dia is null or p_dia < 1 or p_dia > 31 then raise exception 'escolha o ciclo (dia de 1 a 31)' using errcode = '22023'; end if;
  if p_valor is not null and p_valor < 0 then raise exception 'valor invalido' using errcode = '22023'; end if;
  select * into l from public.leads where id = p_lead for update;
  if not found then raise exception 'cliente nao encontrado' using errcode = 'P0002'; end if;
  if not l.parado_pendente or l.situacao <> 'ativo' then
    raise exception 'este cliente nao esta aguardando aprovacao' using errcode = '22023';
  end if;
  select nome into v_nome from public.profiles where id = auth.uid();
  perform set_config('reviza.fluxo_parado', 'on', true);
  update public.leads set
    situacao = 'cancelado', dia = p_dia,
    -- entrar em cobrança é um COMEÇO: carimba o dia pra régua nunca cobrar
    -- atraso retroativo de vencimento anterior à aprovação (mesma lógica do mover)
    dia_alterado_em = now(),
    valor = coalesce(p_valor, valor),
    data_parou = coalesce(nullif(btrim(coalesce(p_data_parou, '')), ''), data_parou),
    parado_pendente = false,
    parado_aprovado_por = auth.uid(), parado_aprovado_nome = v_nome, parado_aprovado_em = now()
  where id = p_lead;
  perform public.notificar(l.parado_solicitado_por, 'parado_aprovado', 'Débito parado aprovado',
    l.nome || ' entrou na Gestão no ciclo D' || lpad(p_dia::text, 2, '0') || coalesce(' — aprovado por ' || v_nome, '') || '.', '/cobrancas/planilha');
  return jsonb_build_object('ok', true, 'dia', p_dia);
end $$;

-- 3) RECUSAR (aprovadores): volta a ser um Novo normal (débito ativo)
create or replace function public.recusar_parado(p_lead uuid, p_motivo text)
  returns jsonb language plpgsql security definer set search_path = ''
as $$
declare l public.leads%rowtype; v_nome text;
begin
  if not public.pode_aprovar_parado() then raise exception 'sem permissao' using errcode = '42501'; end if;
  select * into l from public.leads where id = p_lead for update;
  if not found then raise exception 'cliente nao encontrado' using errcode = 'P0002'; end if;
  if not l.parado_pendente then raise exception 'este cliente nao esta aguardando aprovacao' using errcode = '22023'; end if;
  select nome into v_nome from public.profiles where id = auth.uid();
  perform set_config('reviza.fluxo_parado', 'on', true);
  update public.leads set parado_pendente = false, data_parou = null where id = p_lead;
  perform public.notificar(l.parado_solicitado_por, 'parado_recusado', 'Débito parado recusado',
    l.nome || ' continua nos Novos' || coalesce(' — ' || nullif(btrim(coalesce(p_motivo, '')), ''), '')
      || coalesce(' (' || v_nome || ')', '') || '.', '/cobrancas/novos');
  return jsonb_build_object('ok', true);
end $$;

-- 4) CANCELAR o pedido (quem pediu, ou um aprovador) — também é o Desfazer do "pedir"
create or replace function public.cancelar_parado(p_lead uuid, p_data_parou text)
  returns jsonb language plpgsql security definer set search_path = ''
as $$
declare l public.leads%rowtype;
begin
  if public.current_papel() is null then raise exception 'sem permissao' using errcode = '42501'; end if;
  select * into l from public.leads where id = p_lead for update;
  if not found then raise exception 'cliente nao encontrado' using errcode = 'P0002'; end if;
  -- coalesce: pedido de alguém já excluído (por=null) não pode virar "liberado pra todos"
  if not (public.pode_aprovar_parado() or coalesce(l.parado_solicitado_por = auth.uid(), false)) then
    raise exception 'so quem pediu (ou o financeiro/cadastro/administrador) pode cancelar' using errcode = '42501';
  end if;
  if not l.parado_pendente then return jsonb_build_object('ok', true, 'noop', true); end if;
  perform set_config('reviza.fluxo_parado', 'on', true);
  update public.leads set parado_pendente = false, data_parou = nullif(btrim(coalesce(p_data_parou, '')), '')
  where id = p_lead;
  return jsonb_build_object('ok', true);
end $$;

-- 5) REABRIR (aprovadores) — Desfazer de "aprovar"/"recusar": volta a aguardar,
--    repondo dia/valor/data de antes
create or replace function public.reabrir_parado(p_lead uuid, p_dia smallint, p_valor numeric, p_data_parou text)
  returns jsonb language plpgsql security definer set search_path = ''
as $$
declare l public.leads%rowtype;
begin
  if not public.pode_aprovar_parado() then raise exception 'sem permissao' using errcode = '42501'; end if;
  select * into l from public.leads where id = p_lead for update;
  if not found then raise exception 'cliente nao encontrado' using errcode = 'P0002'; end if;
  perform set_config('reviza.fluxo_parado', 'on', true);
  update public.leads set
    situacao = 'ativo', parado_pendente = true,
    dia = case when p_dia between 1 and 31 then p_dia else null end,
    valor = coalesce(p_valor, valor),
    data_parou = nullif(btrim(coalesce(p_data_parou, '')), ''),
    parado_aprovado_por = null, parado_aprovado_nome = null, parado_aprovado_em = null
  where id = p_lead;
  return jsonb_build_object('ok', true);
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.solicitar_parado(uuid, text)',
    'public.aprovar_parado(uuid, smallint, numeric, text)',
    'public.recusar_parado(uuid, text)',
    'public.cancelar_parado(uuid, text)',
    'public.reabrir_parado(uuid, smallint, numeric, text)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- 6) TRAVA: fora do fluxo, quem NÃO aprova não põe cliente em cobrança
create or replace function private.leads_guard_parado() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  -- invariante: quem está em cobrança nunca está "aguardando aprovação"
  if new.situacao = 'cancelado' then new.parado_pendente := false; end if;
  -- as RPCs do fluxo (pedir/aprovar/recusar/cancelar/reabrir) já validaram tudo
  if coalesce(current_setting('reviza.fluxo_parado', true), '') = 'on' then return new; end if;
  -- sem usuário logado = serviço (cron, manutenção, import do sistema)
  if public.current_papel() is null then return new; end if;
  if public.pode_aprovar_parado() then return new; end if;
  if tg_op = 'INSERT' then
    if new.situacao = 'cancelado' then
      raise exception 'Cliente em cobrança precisa de aprovação: cadastre nos Novos e marque "débito parado".' using errcode = '42501';
    end if;
    new.parado_pendente := false;
    new.parado_solicitado_por := null; new.parado_solicitado_nome := null; new.parado_solicitado_em := null;
    new.parado_aprovado_por := null; new.parado_aprovado_nome := null; new.parado_aprovado_em := null;
    return new;
  end if;
  if old.situacao = 'ativo' and new.situacao = 'cancelado' then
    raise exception 'Débito parado precisa de aprovação (financeiro, cadastro ou administrador): use "Marcar débito parado" nos Novos.' using errcode = '42501';
  end if;
  if new.parado_pendente is distinct from old.parado_pendente
     or new.parado_solicitado_por is distinct from old.parado_solicitado_por
     or new.parado_solicitado_nome is distinct from old.parado_solicitado_nome
     or new.parado_solicitado_em is distinct from old.parado_solicitado_em
     or new.parado_aprovado_por is distinct from old.parado_aprovado_por
     or new.parado_aprovado_nome is distinct from old.parado_aprovado_nome
     or new.parado_aprovado_em is distinct from old.parado_aprovado_em then
    raise exception 'A aprovação do débito parado só muda pelos botões da tela Novos.' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function private.leads_guard_parado() from public, anon, authenticated;

drop trigger if exists leads_guard_parado on public.leads;
create trigger leads_guard_parado before insert or update on public.leads
  for each row execute function private.leads_guard_parado();
