-- Reviza — CENTRAL DE NOTIFICAÇÕES (áudio do dono 14/09: "tudo precisa ser
-- avisado" pro comercial). Tabela por usuário alimentando o sino do topo.
-- Produtores (na MESMA transação das decisões do financeiro):
--   confirmar_entrada  → notifica quem lançou (entradas.por_id): pagamento confirmado
--   recusar_entrada    → idem: pagamento não localizado (recusado)
--   marcar_celula pago → notifica o comercial do lead (match nome, como toda carteira)
-- Avisos e mensagens de WhatsApp entram no sino pelo front (fontes próprias já
-- por usuário: aviso_destinos e wa_conversas com RLS por dono).
-- Corpos das 3 RPCs preservados byte a byte da mig 05 (vivo == repo, conferido)
-- + o bloco de notificação no final.
-- Aplicada 2026-09-14 via MCP como "reviza_29_notificacoes".

create table public.notificacoes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  tipo        text not null,
  titulo      text not null,
  corpo       text not null default '',
  rota        text,
  lida_em     timestamptz,
  created_at  timestamptz not null default now()
);
create index notificacoes_pendentes on public.notificacoes (user_id, created_at desc) where lida_em is null;
create index notificacoes_user on public.notificacoes (user_id, created_at desc);

alter table public.notificacoes enable row level security;
create policy notif_sel on public.notificacoes for select to authenticated
  using (user_id = auth.uid());
-- escrita só pelas funções SECURITY DEFINER (nenhuma policy de insert/update/delete)

create or replace function public.notif_marcar_lida(p_id uuid) returns void
  language sql security definer set search_path = '' as
$$ update public.notificacoes set lida_em = now() where id = p_id and user_id = auth.uid() and lida_em is null $$;
create or replace function public.notif_marcar_todas() returns void
  language sql security definer set search_path = '' as
$$ update public.notificacoes set lida_em = now() where user_id = auth.uid() and lida_em is null $$;
revoke all on function public.notif_marcar_lida(uuid), public.notif_marcar_todas() from public, anon;
grant execute on function public.notif_marcar_lida(uuid), public.notif_marcar_todas() to authenticated;

-- helper interno: grava a notificação (ignora alvo nulo e auto-notificação)
create or replace function public.notificar(p_user uuid, p_tipo text, p_titulo text, p_corpo text, p_rota text)
  returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_user is null or p_user = auth.uid() then return; end if;
  insert into public.notificacoes(user_id, tipo, titulo, corpo, rota)
  values (p_user, p_tipo, p_titulo, coalesce(p_corpo, ''), p_rota);
end $$;
revoke all on function public.notificar(uuid,text,text,text,text) from public, anon, authenticated;

create or replace function public.confirmar_entrada(p_entrada_id uuid) returns void
  language plpgsql security definer set search_path = '' as $$
declare e public.entradas%rowtype;
begin
  if not public.is_at_least('financeiro') then raise exception 'sem permissao' using errcode='42501'; end if;
  select * into e from public.entradas where id=p_entrada_id for update;
  if not found then raise exception 'entrada inexistente'; end if;
  if e.estado <> 'pendente' then raise exception 'entrada ja decidida'; end if;
  if e.lead_id is null then raise exception 'entrada sem lead (orfa) — nao pode confirmar'; end if;

  update public.entradas set estado='confirmada', resolvido_por=auth.uid(), resolvido_em=now() where id=p_entrada_id;
  insert into public.competencias(comp) values (e.comp) on conflict do nothing;

  insert into public.pagamentos(lead_id, comp, status, valor, comprovante_path, pago_em, confirmado_por)
  values (e.lead_id, e.comp, 'pago', e.valor, e.comprovante_path, now(), auth.uid())
  on conflict (lead_id,comp) do update set
    status='pago', valor=excluded.valor,
    comprovante_path=coalesce(excluded.comprovante_path, public.pagamentos.comprovante_path),
    pago_em=now(), confirmado_por=auth.uid();

  insert into public.mov_fin(lead_id, lead_nome, comercial_nome, comp, valor, status, comprovante_path, origem_entrada_id, decidido_por)
  values (e.lead_id, e.lead_nome, e.por_nome, e.comp, e.valor, 'confirmada', e.comprovante_path, e.id, auth.uid());

  -- avisa o comercial que lançou: o financeiro conferiu o extrato e CONFIRMOU
  perform public.notificar(e.por_id, 'pagamento_confirmado',
    'Pagamento confirmado: ' || coalesce(e.lead_nome, 'cliente'),
    'R$ ' || replace(to_char(e.valor, 'FM999999990.00'), '.', ',') || ' de ' || e.comp || ' — o financeiro conferiu e confirmou. ✓',
    '/cobrancas/planilha');
end $$;

create or replace function public.recusar_entrada(p_entrada_id uuid, p_motivo text default null) returns void
  language plpgsql security definer set search_path = '' as $$
declare e public.entradas%rowtype;
begin
  if not public.is_at_least('financeiro') then raise exception 'sem permissao' using errcode='42501'; end if;
  select * into e from public.entradas where id=p_entrada_id for update;
  if not found then raise exception 'entrada inexistente'; end if;
  if e.estado <> 'pendente' then raise exception 'entrada ja decidida'; end if;

  update public.entradas set estado='recusada', resolvido_por=auth.uid(), resolvido_em=now() where id=p_entrada_id;
  insert into public.competencias(comp) values (e.comp) on conflict do nothing;
  insert into public.mov_fin(lead_id, lead_nome, comercial_nome, comp, valor, status, comprovante_path, origem_entrada_id, decidido_por)
  values (e.lead_id, e.lead_nome, e.por_nome, e.comp, e.valor, 'recusada', e.comprovante_path, e.id, auth.uid());

  -- avisa o comercial que lançou: a entrada NÃO foi localizada no extrato
  perform public.notificar(e.por_id, 'pagamento_recusado',
    'Pagamento não localizado: ' || coalesce(e.lead_nome, 'cliente'),
    'R$ ' || replace(to_char(e.valor, 'FM999999990.00'), '.', ',') || ' de ' || e.comp || ' — o financeiro não achou a entrada no extrato'
      || case when p_motivo is not null and btrim(p_motivo) <> '' then ' (' || btrim(p_motivo) || ')' else '' end
      || '. Confira com o cliente.',
    '/cobrancas/planilha');
end $$;

-- Marcar celula (grade): pago/nao_pagou => financeiro+ ; limpar(fora) => gestor+.
-- Loga no ledger SO quando ha comprovante e status=pago (fidelidade ao modelo).
create or replace function public.marcar_celula(
  p_lead uuid, p_comp text, p_status public.status_pagamento,
  p_valor numeric default null, p_comprovante_path text default null) returns void
  language plpgsql security definer set search_path = '' as $$
declare v_nome text; v_com text; v_dono uuid;
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

  -- recebido na grade: avisa o comercial responsável pelo cliente (match por nome, como toda a carteira)
  if p_status = 'pago' then
    select l.nome, l.comercial into v_nome, v_com from public.leads l where l.id = p_lead;
    select p.id into v_dono from public.profiles p
      where p.ativo and upper(btrim(p.nome)) = upper(btrim(coalesce(v_com, ''))) limit 1;
    perform public.notificar(v_dono, 'celula_recebida',
      'Recebido: ' || coalesce(v_nome, 'cliente'),
      'R$ ' || replace(to_char(coalesce(p_valor, 0), 'FM999999990.00'), '.', ',') || ' de ' || p_comp || ' marcado como pago na grade.',
      '/cobrancas/planilha');
  end if;
end $$;

revoke all on function public.confirmar_entrada(uuid), public.recusar_entrada(uuid,text), public.marcar_celula(uuid,text,public.status_pagamento,numeric,text) from public, anon;
grant execute on function public.confirmar_entrada(uuid), public.recusar_entrada(uuid,text), public.marcar_celula(uuid,text,public.status_pagamento,numeric,text) to authenticated;
