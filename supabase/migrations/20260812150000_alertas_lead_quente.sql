-- ─────────────────────────────────────────────────────────────────────────────
-- LEAD QUENTE — alerta de abandono do fluxo do bot (pedido do dono 2026-08-12).
--
-- Lead vindo do anúncio começa a qualificação com o bot e some no meio: o vigia
-- (cron 1min, SÓ horário comercial) cria UM alerta por conversa; o painel (aba
-- WhatsApp) mostra modal via Realtime; atendente ASSUME com claim atômico
-- (padrão do disparo-processar: UPDATE ... WHERE status='pendente', primeiro
-- ganha) e vira dono via contatos.responsavel_id (o sync-responsável propaga
-- p/ conversa + oportunidade). Inbound do cliente cancela o alerta sozinho
-- (trigger em mensagens — cobre Evolution E Cloud num ponto só).
--
-- Constantes (10 min, janela máx 60 min, seg–sex 08–18 America/Sao_Paulo) são
-- PARÂMETROS COM DEFAULT de alerta_lead_quente_avaliar — o cron chama sem
-- argumentos; mudar = alterar o command do job (uma linha de SQL, sem deploy):
--   update cron.job set command =
--     $$select public.alerta_lead_quente_avaliar(p_minutos => 15, p_hora_fim => 19)$$
--   where jobname = 'alerta-lead-quente';
-- (o cron em si entra na migration seguinte, depois do aceite em dry-run.)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.alertas_lead_quente (
  id               uuid primary key default gen_random_uuid(),
  organizacao_id   uuid not null references public.organizacoes(id) on delete cascade,
  conversa_id      uuid not null references public.conversas(id) on delete cascade,
  contato_id       uuid references public.contatos(id) on delete set null,
  passo            text,                       -- snapshot: onde o lead parou (passo_botoes)
  abandonado_em    timestamptz not null,       -- última mensagem do cliente (cronômetro do modal)
  status           text not null default 'pendente' check (status in ('pendente','assumido','cancelado')),
  assumido_por     uuid references public.usuarios(id),
  assumido_em      timestamptz,
  cancelado_por    uuid references public.usuarios(id),
  cancelado_motivo text,                       -- 'cliente_respondeu' | 'dispensado'
  cancelado_em     timestamptz,
  criado_em        timestamptz not null default now(),
  -- UM alerta por conversa, PRA SEMPRE: cancelado/assumido não re-alerta.
  constraint alertas_lead_quente_conversa_unica unique (conversa_id)
);

create index if not exists idx_alertas_lq_org_status
  on public.alertas_lead_quente (organizacao_id, status, criado_em desc);

alter table public.alertas_lead_quente enable row level security;

drop policy if exists alertas_lq_sel on public.alertas_lead_quente;
create policy alertas_lq_sel on public.alertas_lead_quente
  for select using (public.is_member(organizacao_id));
-- escrita só pelas funções (security definer); nenhuma policy de insert/update/delete.

-- Realtime: tabela PRECISA estar na publication — fora dela o pedido de
-- postgres_changes do canal inteiro é recusado em silêncio (gotcha 2026-07-30).
do $$ begin
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and tablename = 'alertas_lead_quente') then
    alter publication supabase_realtime add table public.alertas_lead_quente;
  end if;
end $$;

-- ── VIGIA ────────────────────────────────────────────────────────────────────
-- Condições: fluxo do bot iniciado (passo_botoes existe) e não concluído (nem
-- 'fim'/'suporte_fim', bot não pausado, etapa != concluido) + cliente calado há
-- >= p_minutos E nada aconteceu no estado do bot nesse período + conversa viva
-- sem atendente humano. Janela máxima (p_max_minutos) impede que abandono velho
-- (madrugada, backlog) dispare alerta de "ligar em minutos" — e protege o
-- primeiro boot do cron de alertar o passado.
create or replace function public.alerta_lead_quente_avaliar(
  p_minutos     int default 10,
  p_max_minutos int default 60,
  p_hora_ini    int default 8,
  p_hora_fim    int default 18,
  p_agora       timestamptz default now()
) returns int
language plpgsql security definer set search_path to 'public'
as $fn$
declare v_sp timestamp := p_agora at time zone 'America/Sao_Paulo'; v_n int := 0;
begin
  -- horário comercial: seg–sex (isodow 1..5), [p_hora_ini, p_hora_fim) em SP
  if extract(isodow from v_sp) > 5
     or extract(hour from v_sp) < p_hora_ini
     or extract(hour from v_sp) >= p_hora_fim then
    return 0;
  end if;

  insert into public.alertas_lead_quente (organizacao_id, conversa_id, contato_id, passo, abandonado_em)
  select cv.organizacao_id, cv.id, cv.contato_id,
         e.dados_qualificacao->>'passo_botoes', cv.ultima_entrada_em
    from public.conversas cv
    join public.bot_conversa_estado e on e.conversa_id = cv.id
   where cv.atendente_id is null
     and cv.status in ('aberta','em_atendimento','pendente')
     and cv.ultima_entrada_em is not null
     and cv.ultima_entrada_em <= p_agora - make_interval(mins => p_minutos)
     and cv.ultima_entrada_em >= p_agora - make_interval(mins => p_max_minutos)
     and coalesce(e.pausado, false) = false
     and e.etapa is distinct from 'concluido'
     and e.dados_qualificacao ? 'passo_botoes'
     and coalesce(e.dados_qualificacao->>'passo_botoes','') not in ('', 'fim', 'suporte_fim')
     -- nada aconteceu (nem cliente, nem bot) há p_minutos: se o bot ainda está
     -- conversando, ultima_atividade_em é recente e segura o alerta.
     and greatest(coalesce(e.ultima_atividade_em, cv.ultima_entrada_em), cv.ultima_entrada_em)
         <= p_agora - make_interval(mins => p_minutos)
  on conflict (conversa_id) do nothing;

  get diagnostics v_n = row_count;
  return v_n;
end $fn$;

revoke execute on function public.alerta_lead_quente_avaliar(int, int, int, int, timestamptz) from public, anon, authenticated;
grant execute on function public.alerta_lead_quente_avaliar(int, int, int, int, timestamptz) to service_role;

-- ── AUTO-CANCELAMENTO ────────────────────────────────────────────────────────
-- Inbound REAL do cliente (qualquer transporte) cancela alerta pendente da
-- conversa — ninguém liga pra quem só digita devagar. Mesmo padrão do
-- trg_murillo_qualifica (AFTER INSERT em mensagens, gated por direcao).
create or replace function public.fn_alerta_lq_inbound_cancela()
returns trigger language plpgsql security definer set search_path to 'public'
as $fn$
begin
  update public.alertas_lead_quente
     set status = 'cancelado', cancelado_motivo = 'cliente_respondeu', cancelado_em = now()
   where conversa_id = new.conversa_id and status = 'pendente';
  return new;
end $fn$;

drop trigger if exists trg_alerta_lq_inbound_cancela on public.mensagens;
create trigger trg_alerta_lq_inbound_cancela
  after insert on public.mensagens
  for each row
  when (new.direcao = 'entrada' and coalesce(new.origem, '') not in ('sistema','nota_interna','teste_entrega'))
  execute function public.fn_alerta_lq_inbound_cancela();

-- ── ASSUMIR (claim atômico) ──────────────────────────────────────────────────
-- Primeiro ganha; perdedor recebe de volta quem levou (ou que foi cancelado).
-- Vencedor vira contatos.responsavel_id — o trigger sync-responsável propaga
-- p/ conversas.atendente_id + oportunidades em_andamento.
-- p_usuario só vale sem sessão (service_role/teste); autenticado é sempre auth.uid().
create or replace function public.alerta_lead_quente_assumir(p_alerta uuid, p_usuario uuid default null)
returns table (ok boolean, status text, assumido_por uuid, assumido_por_nome text, conversa_id uuid)
language plpgsql security definer set search_path to 'public'
as $fn$
declare v_user uuid; v_org uuid; v_conversa uuid; v_contato uuid; r record;
begin
  v_user := coalesce(auth.uid(), p_usuario);
  if v_user is null then raise exception 'sem_usuario'; end if;

  select a.organizacao_id, a.conversa_id, a.contato_id into v_org, v_conversa, v_contato
    from public.alertas_lead_quente a where a.id = p_alerta;
  if v_org is null then raise exception 'alerta_invalido'; end if;
  if auth.uid() is not null and not public.is_member(v_org) then raise exception 'sem_permissao'; end if;
  perform 1 from public.organizacao_usuarios ou
    where ou.organizacao_id = v_org and ou.usuario_id = v_user and ou.status = 'ativo';
  if not found then raise exception 'usuario_inativo'; end if;

  -- claim: só leva quem encontrar o alerta AINDA pendente (primeiro ganha)
  update public.alertas_lead_quente a
     set status = 'assumido', assumido_por = v_user, assumido_em = now()
   where a.id = p_alerta and a.status = 'pendente';

  if found then
    if v_contato is not null then
      update public.contatos set responsavel_id = v_user where id = v_contato;
    end if;
    return query select true, 'assumido'::text, v_user,
      (select u.nome from public.usuarios u where u.id = v_user), v_conversa;
  else
    select a.status as st, a.assumido_por as por into r from public.alertas_lead_quente a where a.id = p_alerta;
    return query select false, r.st, r.por,
      (select u.nome from public.usuarios u where u.id = r.por), v_conversa;
  end if;
end $fn$;

-- ── DISPENSAR (discreto, cancela pra equipe toda — decisão do dono) ─────────
create or replace function public.alerta_lead_quente_dispensar(p_alerta uuid, p_usuario uuid default null)
returns boolean
language plpgsql security definer set search_path to 'public'
as $fn$
declare v_user uuid; v_org uuid;
begin
  v_user := coalesce(auth.uid(), p_usuario);
  if v_user is null then raise exception 'sem_usuario'; end if;
  select a.organizacao_id into v_org from public.alertas_lead_quente a where a.id = p_alerta;
  if v_org is null then raise exception 'alerta_invalido'; end if;
  if auth.uid() is not null and not public.is_member(v_org) then raise exception 'sem_permissao'; end if;

  update public.alertas_lead_quente a
     set status = 'cancelado', cancelado_por = v_user, cancelado_motivo = 'dispensado', cancelado_em = now()
   where a.id = p_alerta and a.status = 'pendente';
  return found;
end $fn$;

revoke execute on function public.alerta_lead_quente_assumir(uuid, uuid) from public, anon;
grant execute on function public.alerta_lead_quente_assumir(uuid, uuid) to authenticated, service_role;
revoke execute on function public.alerta_lead_quente_dispensar(uuid, uuid) from public, anon;
grant execute on function public.alerta_lead_quente_dispensar(uuid, uuid) to authenticated, service_role;
