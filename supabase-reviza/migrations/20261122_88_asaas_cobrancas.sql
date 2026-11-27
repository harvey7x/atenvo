-- 88 — Asaas, etapa 2 (dono 22/11): gerar a cobrança de uma parcela e dar a baixa quando o cliente paga.
--
-- Depende da 87. Apenas aditivo: não altera tabela, política nem função que já existe.
-- A baixa usa o MESMO caminho de quando o financeiro confirma um pagamento (entradas → pagamentos →
-- mov_fin), só que feita pelo sistema quando o aviso do Asaas chega. Tudo numa transação só: se
-- qualquer passo falhar, nada é gravado e o aviso fica guardado para tentar de novo.

-- o cliente do sistema ↔ o cliente no Asaas (criado uma vez, reaproveitado nas próximas cobranças)
create table if not exists public.asaas_clientes (
  lead_id     uuid primary key references public.leads(id) on delete cascade,
  customer_id text not null,
  criado_em   timestamptz not null default now()
);
alter table public.asaas_clientes enable row level security;   -- sem política: só a função (service_role)
revoke all on public.asaas_clientes from anon, authenticated;
grant all on public.asaas_clientes to service_role;

create table if not exists public.asaas_cobrancas (
  id              uuid primary key default gen_random_uuid(),
  lead_id         uuid not null references public.leads(id) on delete cascade,
  comp            text not null,                 -- competência 'AAAA-MM' da parcela
  payment_id      text not null unique,          -- id da cobrança no Asaas
  valor           numeric not null,              -- a meia parcela (é o que o cliente paga)
  vencimento      date not null,
  forma           text not null,
  link            text,                          -- a página de pagamento (invoiceUrl)
  status          text not null default 'aberta' check (status in ('aberta', 'paga', 'cancelada')),
  criado_por      uuid,
  criado_por_nome text,
  criado_em       timestamptz not null default now(),
  pago_em         timestamptz,
  entrada_id      uuid                           -- a entrada do Financeiro que a baixa criou
);
-- uma cobrança aberta por cliente e competência (pedir de novo devolve a mesma)
create unique index if not exists asaas_cobrancas_uma_aberta on public.asaas_cobrancas (lead_id, comp) where status = 'aberta';
alter table public.asaas_cobrancas enable row level security;
-- quem enxerga o cliente enxerga as cobranças dele (a regra de quem vê qual cliente é a da tabela leads)
drop policy if exists asaas_cobrancas_sel on public.asaas_cobrancas;
create policy asaas_cobrancas_sel on public.asaas_cobrancas for select to authenticated
  using (exists (select 1 from public.leads l where l.id = asaas_cobrancas.lead_id));
revoke all on public.asaas_cobrancas from anon, authenticated;
grant select on public.asaas_cobrancas to authenticated;
grant all on public.asaas_cobrancas to service_role;

-- A BAIXA. Chamada pela função reviza-asaas-retorno para cada aviso novo. Devolve o que fez, em texto.
create or replace function public.asaas_processar_evento(p_id text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  ev      public.asaas_eventos%rowtype;
  cb      public.asaas_cobrancas%rowtype;
  v_lead  public.leads%rowtype;
  cfg     jsonb;
  v_auto  boolean; v_quando text; v_avisar boolean;
  v_entrada uuid; v_dono uuid;
begin
  select * into ev from public.asaas_eventos where id = p_id for update;
  if not found then return 'aviso inexistente'; end if;
  if ev.processado_em is not null then return 'ja processado'; end if;

  if ev.tipo not in ('PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED') then
    if ev.tipo = 'PAYMENT_DELETED' then
      update public.asaas_cobrancas set status = 'cancelada' where payment_id = ev.pagamento_id and status = 'aberta';
    end if;
    update public.asaas_eventos set processado_em = now() where id = p_id;
    return 'aviso sem baixa';
  end if;

  select * into cb from public.asaas_cobrancas where payment_id = ev.pagamento_id for update;
  if not found then
    update public.asaas_eventos set processado_em = now() where id = p_id;
    return 'cobranca criada fora do sistema';
  end if;
  if cb.status = 'paga' then
    update public.asaas_eventos set processado_em = now() where id = p_id;
    return 'ja baixada';
  end if;

  select i.config into cfg from public.integracoes i where i.servico = 'asaas';
  v_auto   := coalesce((cfg->>'baixaAutomatica')::boolean, true);
  v_quando := coalesce(cfg->>'baixaQuando', 'confirmado');
  v_avisar := coalesce((cfg->>'avisarComercial')::boolean, true);
  -- "só quando o dinheiro estiver disponível": a confirmação não dá baixa; o aviso de recebido dá
  if v_quando = 'disponivel' and ev.tipo = 'PAYMENT_CONFIRMED' then
    update public.asaas_eventos set processado_em = now() where id = p_id;
    return 'aguardando o dinheiro ficar disponivel';
  end if;

  select * into v_lead from public.leads where id = cb.lead_id;
  if not found then
    update public.asaas_eventos set processado_em = now() where id = p_id;
    return 'cliente nao existe mais';
  end if;

  insert into public.competencias(comp) values (cb.comp) on conflict do nothing;
  insert into public.entradas(lead_id, lead_nome, comp, valor, por_id, por_nome, estado, resolvido_em)
  values (cb.lead_id, v_lead.nome, cb.comp, cb.valor, null, 'Asaas (pagamento online)',
          (case when v_auto then 'confirmada' else 'pendente' end)::public.estado_entrada,
          case when v_auto then now() end)
  returning id into v_entrada;

  if v_auto then
    insert into public.pagamentos(lead_id, comp, status, valor, pago_em)
    values (cb.lead_id, cb.comp, 'pago', cb.valor, now())
    on conflict (lead_id, comp) do update set status = 'pago', valor = excluded.valor, pago_em = now();
    insert into public.mov_fin(lead_id, lead_nome, comercial_nome, comp, valor, status, origem_entrada_id)
    values (cb.lead_id, v_lead.nome, coalesce(v_lead.comercial, '—'), cb.comp, cb.valor, 'confirmada', v_entrada);
  end if;

  update public.asaas_cobrancas set status = 'paga', pago_em = now(), entrada_id = v_entrada where id = cb.id;
  update public.asaas_eventos set processado_em = now() where id = p_id;

  insert into public.registros(ator_nome, ator_papel, acao, entidade, entidade_id, rotulo, detalhe)
  values ('Asaas', 'sistema', case when v_auto then 'confirmou' else 'lançou' end, 'pagamento', cb.lead_id::text, v_lead.nome,
          'pagamento pelo Asaas de R$ ' || replace(to_char(cb.valor, 'FM999999990.00'), '.', ',') || ' (' || public.comp_rotulo(cb.comp) || ')'
          || case when v_auto then '' else ' — aguardando o financeiro confirmar' end);

  -- avisa o comercial dono do cliente (o nome do comercial na ficha → o usuário de mesmo nome)
  if v_avisar and v_lead.comercial is not null then
    select p.id into v_dono from public.profiles p where p.ativo and upper(btrim(p.nome)) = upper(btrim(v_lead.comercial)) limit 1;
    if v_dono is not null then
      perform public.notificar(v_dono, 'pagamento_confirmado', 'Pagamento pelo Asaas: ' || coalesce(v_lead.nome, 'cliente'),
        'R$ ' || replace(to_char(cb.valor, 'FM999999990.00'), '.', ',') || ' de ' || public.comp_rotulo(cb.comp) || ', pago pelo link.', '/cobrancas/planilha');
    end if;
  end if;
  return case when v_auto then 'baixa feita' else 'entrada pendente criada' end;
end $$;
revoke all on function public.asaas_processar_evento(text) from public, anon, authenticated;
grant execute on function public.asaas_processar_evento(text) to service_role;

notify pgrst, 'reload schema';

-- DESFAZER: drop function public.asaas_processar_evento(text); drop table public.asaas_cobrancas; drop table public.asaas_clientes;
-- (as entradas e os pagamentos que a baixa já tiver criado ficam: são lançamentos de verdade)
