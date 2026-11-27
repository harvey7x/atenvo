-- 79 — Cancelados (dono 27/10: "uma nova aba para cancelados… um botão que a gente consiga mover
-- clientes para os cancelados… selecionar mais que um… quando o cliente estiver lá cancelado, a
-- gente vai reativar a cobrança dele… em processo de reativação, ou desconto reativado").
-- Decisão (AskUserQuestion 27/10): reativado FICA nos Cancelados — alguém tira depois ("Voltar pra Gestão").
--
-- Modelo: estado do CLIENTE (não do débito — situacao segue intocada). Com `cancelamento` preenchido
-- o cliente sai da Gestão, dos Novos, da carteira do painel e da régua; o histórico de pagamentos e
-- comissões continua (nada é apagado). "Voltar pra Gestão" limpa e a linha volta no mesmo lugar.
--   cancelado      → acabou de ser movido
--   em_reativacao  → em processo de reativação
--   reativado      → desconto reativado
-- Só muda pelas RPCs abaixo (gatilho barra UPDATE direto); o registro (tg_registrar) audita tudo.

alter table public.leads
  add column if not exists cancelamento text,
  add column if not exists cancelado_em timestamptz,
  add column if not exists cancelado_por_nome text,
  add column if not exists cancelamento_motivo text,
  add column if not exists cancelamento_em timestamptz,
  add column if not exists cancelamento_por_nome text;
alter table public.leads drop constraint if exists leads_cancelamento_check;
alter table public.leads add constraint leads_cancelamento_check
  check (cancelamento is null or cancelamento in ('cancelado', 'em_reativacao', 'reativado'));
create index if not exists leads_cancelamento_idx on public.leads (cancelamento) where cancelamento is not null;

-- as colunas do cancelamento só mudam pelas RPCs (GUC local da transação). Sem sessão de usuário
-- (service_role: motor, sync) passa. INSERT de usuário nasce fora dos Cancelados (restaurar da
-- Lixeira volta pra Gestão).
create or replace function private.leads_guard_cancelamento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('reviza.cancelamento', true), '') = 'on' then return new; end if;
  if public.current_papel() is null then return new; end if;
  if tg_op = 'INSERT' then
    new.cancelamento := null; new.cancelado_em := null; new.cancelado_por_nome := null;
    new.cancelamento_motivo := null; new.cancelamento_em := null; new.cancelamento_por_nome := null;
    return new;
  end if;
  if new.cancelamento is distinct from old.cancelamento
     or new.cancelado_em is distinct from old.cancelado_em
     or new.cancelado_por_nome is distinct from old.cancelado_por_nome
     or new.cancelamento_motivo is distinct from old.cancelamento_motivo
     or new.cancelamento_em is distinct from old.cancelamento_em
     or new.cancelamento_por_nome is distinct from old.cancelamento_por_nome then
    raise exception 'Cancelados só mudam pelos botões da Gestão e da aba Cancelados.' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists leads_guard_cancelamento on public.leads;
create trigger leads_guard_cancelamento before insert or update on public.leads
  for each row execute function private.leads_guard_cancelamento();
revoke all on function private.leads_guard_cancelamento() from public, anon, authenticated;

-- mover para os Cancelados (vários de uma vez). Quem tira da cobrança: financeiro, cadastro,
-- gestor, administrador (a mesma regra do débito parado). Quem já está nos Cancelados fica como está.
create or replace function public.leads_cancelar(p_ids uuid[], p_motivo text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_n integer; v_nome text;
begin
  if not public.pode_aprovar_parado() then
    raise exception 'Mover para Cancelados é com o financeiro, o cadastro, o gestor ou o administrador.' using errcode = '42501';
  end if;
  if p_ids is null or cardinality(p_ids) = 0 then return 0; end if;
  if cardinality(p_ids) > 5000 then raise exception 'Selecione no máximo 5000 clientes por vez.' using errcode = '22023'; end if;
  v_nome := coalesce(nullif(btrim(public.meu_nome()), ''), 'alguém');
  perform set_config('reviza.cancelamento', 'on', true);
  update public.leads
     set cancelamento = 'cancelado', cancelado_em = now(), cancelado_por_nome = v_nome,
         cancelamento_motivo = nullif(btrim(left(coalesce(p_motivo, ''), 500)), ''),
         cancelamento_em = now(), cancelamento_por_nome = v_nome
   where id = any (p_ids) and cancelamento is null;
  get diagnostics v_n = row_count;
  perform set_config('reviza.cancelamento', '', true);
  return v_n;
end $$;

-- status da reativação. Além de quem move, o COMERCIAL dono do cliente também marca (é ele quem
-- liga pro cliente). Só mexe em quem está nos Cancelados.
create or replace function public.leads_cancelamento_status(p_ids uuid[], p_status text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_n integer; v_nome text; v_todos boolean;
begin
  if p_status is null or p_status not in ('cancelado', 'em_reativacao', 'reativado') then
    raise exception 'Status inválido.' using errcode = '22023';
  end if;
  v_todos := public.pode_aprovar_parado();
  if not v_todos and public.current_papel() is distinct from 'comercial'::public.papel_usuario then
    raise exception 'Sem permissão para mudar o status dos cancelados.' using errcode = '42501';
  end if;
  if p_ids is null or cardinality(p_ids) = 0 then return 0; end if;
  if cardinality(p_ids) > 5000 then raise exception 'Selecione no máximo 5000 clientes por vez.' using errcode = '22023'; end if;
  v_nome := coalesce(nullif(btrim(public.meu_nome()), ''), 'alguém');
  perform set_config('reviza.cancelamento', 'on', true);
  update public.leads l
     set cancelamento = p_status, cancelamento_em = now(), cancelamento_por_nome = v_nome
   where l.id = any (p_ids) and l.cancelamento is not null and l.cancelamento <> p_status
     and (v_todos or public.comercial_dono(l.comercial));
  get diagnostics v_n = row_count;
  perform set_config('reviza.cancelamento', '', true);
  return v_n;
end $$;

-- voltar pra Gestão: o cliente volta pra linha dele na planilha (que nunca saiu do lugar)
create or replace function public.leads_cancelados_voltar(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_n integer;
begin
  if not public.pode_aprovar_parado() then
    raise exception 'Voltar da lista de Cancelados é com o financeiro, o cadastro, o gestor ou o administrador.' using errcode = '42501';
  end if;
  if p_ids is null or cardinality(p_ids) = 0 then return 0; end if;
  if cardinality(p_ids) > 5000 then raise exception 'Selecione no máximo 5000 clientes por vez.' using errcode = '22023'; end if;
  perform set_config('reviza.cancelamento', 'on', true);
  update public.leads
     set cancelamento = null, cancelado_em = null, cancelado_por_nome = null, cancelamento_motivo = null,
         cancelamento_em = null, cancelamento_por_nome = null
   where id = any (p_ids) and cancelamento is not null;
  get diagnostics v_n = row_count;
  perform set_config('reviza.cancelamento', '', true);
  return v_n;
end $$;

revoke all on function public.leads_cancelar(uuid[], text) from public, anon;
revoke all on function public.leads_cancelamento_status(uuid[], text) from public, anon;
revoke all on function public.leads_cancelados_voltar(uuid[]) from public, anon;
grant execute on function public.leads_cancelar(uuid[], text) to authenticated, service_role;
grant execute on function public.leads_cancelamento_status(uuid[], text) to authenticated, service_role;
grant execute on function public.leads_cancelados_voltar(uuid[]) to authenticated, service_role;
