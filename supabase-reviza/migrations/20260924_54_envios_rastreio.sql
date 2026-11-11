-- =====================================================================
-- 54 — Envios COMPLETOS e rastreáveis (dono 24/09): "quando acontecer os
-- envios, aparecer em Envios: de qual número saiu, pra qual cliente, qual
-- horário, como está o processo da régua, qual mensagem foi, o que falta,
-- se está 100%, se o cliente respondeu, e as conversas no WhatsApp".
--
-- (a) CHAVE de telefone (DDD + 8 últimos dígitos) — a mesma pessoa tem 3
--     grafias (planilha "51993227097", JID "555193227097" sem o 9, "5551993…")
--     e cada uma abria uma CONVERSA diferente: a resposta do cliente nunca
--     caía na conversa da régua. Conversa agora é única por (canal, chave) e
--     já nasce ligada ao cliente (lead_id) pela chave.
-- (b) wa_envios: origem (manual/régua) + passo da régua.
-- (c) wa_envio_alvos: número de saída (snapshot), conversa, mensagem FINAL
--     enviada, competência/vencimento, entrega (✓/✓✓/lida), resposta do
--     cliente, tentativas, motivo de "pulado"; status novos pulado/cancelado.
-- (d) wa_mensagens ligada ao alvo; status de entrega SÓ AVANÇA (lida nunca
--     volta pra entregue) com carimbo entregue_em/lida_em.
-- (e) resposta do cliente marca o(s) envio(s) dos últimos 10 dias como
--     "respondeu" (e alimenta a pausa da régua).
-- (f) régua: número reserva (opcional), dias de envio, teto diário por
--     número, pausa quando o cliente responde, intervalo — tudo na tela.
-- (g) opt-out (cliente mandou SAIR/PARAR) + rodadas do motor (saúde).
-- (h) scripts do chat viram alvo 'script' (NÃO disparam sozinhos na régua).
-- =====================================================================

-- (a) chave canônica do telefone
create or replace function public.wa_tel_chave(p text) returns text
  language sql immutable parallel safe set search_path = ''
as $$
  select case when length(y.d2) >= 10 then left(y.d2, 2) || right(y.d2, 8) else nullif(y.d2, '') end
  from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d) x,
  lateral (select case when length(x.d) in (12, 13) and left(x.d, 2) = '55' then substr(x.d, 3) else x.d end as d2) y
$$;
grant execute on function public.wa_tel_chave(text) to authenticated, service_role;

alter table public.wa_conversas
  add column if not exists chave text generated always as (public.wa_tel_chave(telefone)) stored;
create unique index if not exists wa_conversas_canal_chave_key on public.wa_conversas (canal_id, chave);
create index if not exists leads_tel_chave_idx on public.leads (public.wa_tel_chave(telefone));

-- conversa nasce ligada ao cliente (preferência: quem está em cobrança)
create or replace function private.wa_conversa_vincular() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  if new.lead_id is null and public.wa_tel_chave(new.telefone) is not null then
    select l.id into new.lead_id from public.leads l
     where public.wa_tel_chave(l.telefone) = public.wa_tel_chave(new.telefone)
     order by (l.situacao = 'cancelado') desc, l.updated_at desc nulls last
     limit 1;
  end if;
  return new;
end $$;
revoke all on function private.wa_conversa_vincular() from public, anon, authenticated;
drop trigger if exists wa_conversas_vincular on public.wa_conversas;
create trigger wa_conversas_vincular before insert or update of telefone on public.wa_conversas
  for each row execute function private.wa_conversa_vincular();
update public.wa_conversas c set lead_id = (
  select l.id from public.leads l where public.wa_tel_chave(l.telefone) = c.chave
   order by (l.situacao = 'cancelado') desc, l.updated_at desc nulls last limit 1)
 where c.lead_id is null;

-- (b) envios: origem + passo da régua
alter table public.wa_envios
  add column if not exists origem text not null default 'manual',
  add column if not exists regua_msg_id uuid references public.wa_regua_msgs(id) on delete set null,
  add column if not exists passo_nome text,
  add column if not exists passo_quando integer;
do $$ begin
  alter table public.wa_envios add constraint wa_envios_origem_check check (origem in ('manual', 'regua'));
exception when duplicate_object then null; end $$;
update public.wa_envios set origem = 'regua' where nome like 'Régua:%' and origem <> 'regua';
create index if not exists wa_envios_canal_idx on public.wa_envios (canal_id);
create index if not exists wa_envios_criado_idx on public.wa_envios (created_at desc);

-- (c) alvos: rastro completo
alter type public.wa_status_alvo add value if not exists 'pulado';
alter type public.wa_status_alvo add value if not exists 'cancelado';
alter table public.wa_envio_alvos
  add column if not exists canal_id uuid references public.wa_canais(id) on delete set null,
  add column if not exists canal_nome text,
  add column if not exists canal_numero text,
  add column if not exists conversa_id uuid references public.wa_conversas(id) on delete set null,
  add column if not exists mensagem text,
  add column if not exists comp text,
  add column if not exists venc date,
  add column if not exists regua_msg_id uuid references public.wa_regua_msgs(id) on delete set null,
  add column if not exists passo_nome text,
  add column if not exists entrega text,
  add column if not exists entregue_em timestamptz,
  add column if not exists lida_em timestamptz,
  add column if not exists respondeu_em timestamptz,
  add column if not exists resposta_previa text,
  add column if not exists resposta_msg_id uuid,
  add column if not exists tentativas smallint not null default 0,
  add column if not exists tentar_apos timestamptz,
  add column if not exists motivo text;
do $$ begin
  alter table public.wa_envio_alvos add constraint wa_envio_alvos_entrega_check check (entrega is null or entrega in ('enviada', 'entregue', 'lida'));
exception when duplicate_object then null; end $$;
create index if not exists wa_alvos_lead_idx on public.wa_envio_alvos (lead_id);
create index if not exists wa_alvos_criado_idx on public.wa_envio_alvos (created_at desc, id desc);
create index if not exists wa_alvos_enviado_idx on public.wa_envio_alvos (enviado_em desc) where enviado_em is not null;
create index if not exists wa_alvos_conversa_idx on public.wa_envio_alvos (conversa_id, enviado_em);
create index if not exists wa_alvos_canal_dia_idx on public.wa_envio_alvos (canal_id, created_at);

-- (d) mensagens ligadas ao alvo + entrega que só avança
alter table public.wa_mensagens
  add column if not exists alvo_id uuid references public.wa_envio_alvos(id) on delete set null,
  add column if not exists envio_id uuid references public.wa_envios(id) on delete set null,
  add column if not exists entregue_em timestamptz,
  add column if not exists lida_em timestamptz;
create index if not exists wa_mensagens_alvo_idx on public.wa_mensagens (alvo_id) where alvo_id is not null;

create or replace function private.wa_msg_status_rank(s text) returns int
  language sql immutable set search_path = ''
as $$ select case s when 'pendente' then 0 when 'enviada' then 1 when 'entregue' then 2 when 'lida' then 3 else -1 end $$;

create or replace function private.wa_msg_status_avanca() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    -- erro só vale antes de sair; entregue/lida nunca regridem (eventos fora de ordem)
    if old.status::text <> 'erro' and new.status::text <> 'erro'
       and private.wa_msg_status_rank(new.status::text) < private.wa_msg_status_rank(old.status::text) then
      new.status := old.status;
    end if;
    if new.status::text in ('entregue', 'lida') and new.entregue_em is null then new.entregue_em := now(); end if;
    if new.status::text = 'lida' and new.lida_em is null then new.lida_em := now(); end if;
  end if;
  return new;
end $$;
revoke all on function private.wa_msg_status_avanca() from public, anon, authenticated;
drop trigger if exists wa_mensagens_status_avanca on public.wa_mensagens;
create trigger wa_mensagens_status_avanca before update of status on public.wa_mensagens
  for each row execute function private.wa_msg_status_avanca();

-- entrega da mensagem → entrega do alvo (o pior caso de várias partes não importa: vale a mais avançada)
create or replace function private.wa_msg_status_alvo() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  if new.alvo_id is not null and new.status::text in ('enviada', 'entregue', 'lida') then
    update public.wa_envio_alvos a set
      entrega = case when private.wa_msg_status_rank(new.status::text) > coalesce(private.wa_msg_status_rank(a.entrega), 0) then new.status::text else a.entrega end,
      entregue_em = case when new.status::text in ('entregue', 'lida') then coalesce(a.entregue_em, new.entregue_em, now()) else a.entregue_em end,
      lida_em = case when new.status::text = 'lida' then coalesce(a.lida_em, new.lida_em, now()) else a.lida_em end
    where a.id = new.alvo_id;
  end if;
  return new;
end $$;
revoke all on function private.wa_msg_status_alvo() from public, anon, authenticated;
drop trigger if exists wa_mensagens_status_alvo on public.wa_mensagens;
create trigger wa_mensagens_status_alvo after insert or update of status on public.wa_mensagens
  for each row execute function private.wa_msg_status_alvo();

-- (e) resposta do cliente → "respondeu" nos envios dos últimos 10 dias daquela conversa
create or replace function private.wa_msg_resposta() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  if new.direcao::text = 'entrada' then
    update public.wa_envio_alvos a set
      respondeu_em = new.created_at,
      resposta_previa = left(coalesce(nullif(btrim(new.conteudo), ''), '[' || new.tipo::text || ']'), 160),
      resposta_msg_id = new.id
    where a.conversa_id = new.conversa_id
      and a.status::text = 'enviado' and a.respondeu_em is null
      and a.enviado_em <= new.created_at and a.enviado_em >= new.created_at - interval '10 days';
  end if;
  return new;
end $$;
revoke all on function private.wa_msg_resposta() from public, anon, authenticated;
drop trigger if exists wa_mensagens_resposta on public.wa_mensagens;
create trigger wa_mensagens_resposta after insert on public.wa_mensagens
  for each row execute function private.wa_msg_resposta();

-- (f) configuração da régua
alter table public.wa_regua_config
  add column if not exists canal_reserva_id uuid references public.wa_canais(id) on delete set null,
  add column if not exists dias_envio text not null default 'todos',
  add column if not exists teto_diario integer not null default 60,
  add column if not exists pausar_se_respondeu boolean not null default true,
  add column if not exists delay_min integer not null default 20,
  add column if not exists delay_max integer not null default 45;
do $$ begin
  alter table public.wa_regua_config add constraint wa_regua_config_dias_check check (dias_envio in ('todos', 'uteis', 'uteis_sabado'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.wa_regua_config add constraint wa_regua_config_teto_check check (teto_diario between 0 and 1000);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.wa_regua_config add constraint wa_regua_config_delay_check check (delay_min >= 5 and delay_max >= delay_min and delay_max <= 300);
exception when duplicate_object then null; end $$;
-- quem mexeu por último (ligar/desligar fica rastreável)
create or replace function private.wa_regua_config_autor() returns trigger
  language plpgsql security definer set search_path = ''
as $$ begin if auth.uid() is not null then new.updated_by := auth.uid(); end if; return new; end $$;
revoke all on function private.wa_regua_config_autor() from public, anon, authenticated;
drop trigger if exists wa_regua_config_autor on public.wa_regua_config;
create trigger wa_regua_config_autor before update on public.wa_regua_config
  for each row execute function private.wa_regua_config_autor();

-- (g1) opt-out: cliente pediu pra sair (SAIR/PARAR) ou o admin marcou
create table if not exists public.wa_optout (
  chave text primary key,
  telefone text,
  lead_id uuid references public.leads(id) on delete set null,
  origem text not null default 'cliente' check (origem in ('cliente', 'manual')),
  texto text,
  criado_em timestamptz not null default now(),
  criado_por uuid references public.profiles(id) on delete set null
);
alter table public.wa_optout enable row level security;
drop policy if exists wa_optout_sel on public.wa_optout;
create policy wa_optout_sel on public.wa_optout for select to authenticated using (public.current_papel() is not null);
drop policy if exists wa_optout_ins on public.wa_optout;
create policy wa_optout_ins on public.wa_optout for insert to authenticated with check (public.is_at_least('gestor'));
drop policy if exists wa_optout_del on public.wa_optout;
create policy wa_optout_del on public.wa_optout for delete to authenticated using (public.is_at_least('gestor'));
revoke all on public.wa_optout from anon;
grant select, insert, delete on public.wa_optout to authenticated;

-- (g2) rodadas do motor (saúde: última rodada, o que gerou, o que pulou e por quê)
create table if not exists public.wa_motor_rodadas (
  id bigserial primary key,
  inicio timestamptz not null default now(),
  fim timestamptz,
  fonte text not null default 'cron',
  regua jsonb,
  enviadas integer not null default 0,
  falhas integer not null default 0,
  puladas integer not null default 0,
  erro text
);
create index if not exists wa_motor_rodadas_inicio_idx on public.wa_motor_rodadas (inicio desc);
alter table public.wa_motor_rodadas enable row level security;
drop policy if exists wa_motor_rodadas_sel on public.wa_motor_rodadas;
create policy wa_motor_rodadas_sel on public.wa_motor_rodadas for select to authenticated using (public.current_papel() is not null);
revoke all on public.wa_motor_rodadas from anon;
grant select on public.wa_motor_rodadas to authenticated;

-- (g3) saúde do número
alter table public.wa_canais
  add column if not exists ultimo_evento_em timestamptz,
  add column if not exists verificado_em timestamptz;

-- (h) scripts do chat (Conversas) NÃO são passos automáticos
alter table public.wa_regua_msgs drop constraint if exists wa_regua_msgs_alvo_check;
alter table public.wa_regua_msgs add constraint wa_regua_msgs_alvo_check check (alvo in ('padrao', 'grupo', 'cliente', 'script'));

-- disparos da régua: índices das FKs
create index if not exists wa_regua_disparos_envio_idx on public.wa_regua_disparos (envio_id);
create index if not exists wa_regua_disparos_msg_idx on public.wa_regua_disparos (regua_msg_id);

-- resumo da tela Envios (RLS vale: cada um conta só o que pode ver)
create or replace function public.wa_envios_resumo(p_de timestamptz, p_ate timestamptz)
  returns jsonb language sql stable security invoker set search_path = ''
as $$
  select jsonb_build_object(
    'enviadas',     count(*) filter (where a.status::text = 'enviado' and a.enviado_em >= p_de and a.enviado_em < p_ate),
    'entregues',    count(*) filter (where a.status::text = 'enviado' and a.enviado_em >= p_de and a.enviado_em < p_ate and a.entrega in ('entregue', 'lida')),
    'lidas',        count(*) filter (where a.status::text = 'enviado' and a.enviado_em >= p_de and a.enviado_em < p_ate and a.entrega = 'lida'),
    'responderam',  count(*) filter (where a.status::text = 'enviado' and a.enviado_em >= p_de and a.enviado_em < p_ate and a.respondeu_em is not null),
    'erros',        count(*) filter (where a.status::text = 'erro' and a.created_at >= p_de and a.created_at < p_ate),
    'pulados',      count(*) filter (where a.status::text = 'pulado' and a.created_at >= p_de and a.created_at < p_ate),
    'na_fila',      count(*) filter (where a.status::text in ('pendente', 'enviando')),
    'optouts',      (select count(*) from public.wa_optout)
  )
  from public.wa_envio_alvos a
  where (a.created_at >= p_de and a.created_at < p_ate) or a.status::text in ('pendente', 'enviando')
     or (a.enviado_em >= p_de and a.enviado_em < p_ate)
$$;
revoke all on function public.wa_envios_resumo(timestamptz, timestamptz) from public, anon;
grant execute on function public.wa_envios_resumo(timestamptz, timestamptz) to authenticated;

-- progresso por passo (régua) num período: previstos = gerados; o % vem daqui
create or replace function public.wa_regua_progresso(p_de timestamptz, p_ate timestamptz)
  returns table(regua_msg_id uuid, passo_nome text, status text, entrega text, respondeu boolean, n bigint)
  language sql stable security invoker set search_path = ''
as $$
  select a.regua_msg_id, a.passo_nome, a.status::text, a.entrega, a.respondeu_em is not null, count(*)
  from public.wa_envio_alvos a
  join public.wa_envios e on e.id = a.envio_id and e.origem = 'regua'
  where a.created_at >= p_de and a.created_at < p_ate
  group by 1, 2, 3, 4, 5
$$;
revoke all on function public.wa_regua_progresso(timestamptz, timestamptz) from public, anon;
grant execute on function public.wa_regua_progresso(timestamptz, timestamptz) to authenticated;

-- cancelar envio: pendentes viram 'cancelado' (antes eram APAGADOS — o total nunca
-- fechava 100% e sumia o rastro de quem não recebeu). Gestor+ ou quem criou.
create or replace function public.wa_envio_cancelar(p_envio uuid)
  returns jsonb language plpgsql security definer set search_path = ''
as $$
declare e public.wa_envios%rowtype; v_n int;
begin
  select * into e from public.wa_envios where id = p_envio for update;
  if not found then raise exception 'envio nao encontrado' using errcode = 'P0002'; end if;
  if not (public.is_at_least('gestor') or coalesce(e.criado_por = auth.uid(), false)) then
    raise exception 'sem permissao' using errcode = '42501';
  end if;
  if e.estado::text not in ('rascunho', 'enviando') then return jsonb_build_object('ok', true, 'cancelados', 0); end if;
  update public.wa_envio_alvos set status = 'cancelado', motivo = 'envio cancelado', claim_em = null
   where envio_id = p_envio and status::text = 'pendente';
  get diagnostics v_n = row_count;
  update public.wa_envios set estado = 'cancelado' where id = p_envio;
  return jsonb_build_object('ok', true, 'cancelados', v_n);
end $$;
revoke all on function public.wa_envio_cancelar(uuid) from public, anon;
grant execute on function public.wa_envio_cancelar(uuid) to authenticated;

-- reenviar quem deu ERRO: volta pra fila (envio manual a qualquer hora; régua só
-- no MESMO dia — texto de "hoje é o vencimento" não pode sair no dia seguinte)
create or replace function public.wa_alvos_reenviar(p_ids uuid[])
  returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_n int; v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if not public.is_at_least('gestor') then raise exception 'sem permissao' using errcode = '42501'; end if;
  with alvo as (
    select a.id, a.envio_id from public.wa_envio_alvos a join public.wa_envios e on e.id = a.envio_id
     where a.id = any(coalesce(p_ids, '{}'::uuid[])) and a.status::text = 'erro'
       and (e.origem = 'manual' or (a.created_at at time zone 'America/Sao_Paulo')::date = v_hoje)
  ), upd as (
    -- parte_atual fica: sequência cortada retoma da parte que falhou (nada sai 2x)
    update public.wa_envio_alvos a set status = 'pendente', erro = null, tentativas = 0, tentar_apos = null, claim_em = null
      from alvo where a.id = alvo.id returning a.envio_id
  )
  update public.wa_envios e set estado = 'enviando' where e.id in (select envio_id from upd) and e.estado::text <> 'cancelado';
  select count(*) into v_n from public.wa_envio_alvos where id = any(coalesce(p_ids, '{}'::uuid[])) and status::text = 'pendente';
  return jsonb_build_object('ok', true, 'reenviados', v_n);
end $$;
revoke all on function public.wa_alvos_reenviar(uuid[]) from public, anon;
grant execute on function public.wa_alvos_reenviar(uuid[]) to authenticated;

-- anon nunca usa a mensageria
revoke all on public.wa_canais, public.wa_conversas, public.wa_mensagens, public.wa_envios,
  public.wa_envio_alvos, public.wa_regua_msgs, public.wa_regua_config, public.wa_regua_disparos,
  public.wa_regua_regras from anon;
