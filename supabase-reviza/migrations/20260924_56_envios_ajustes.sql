-- =====================================================================
-- 56 — Ajustes dos envios (revisão adversarial da 54/motor v10)
-- (a) chave de telefone ignora zero à esquerda ("051…" = "51…")
-- (b) conversa: unique antiga (canal, telefone) sai (a chave cobre; ela dava 23505
--     em upserts concorrentes); lid do WhatsApp guardado pra achar a conversa
--     quando a resposta vem só com @lid
-- (c) número: ultimo_envio_em (intervalo anti-bloqueio ENTRE envios e rodadas)
--     + processando_ate (1 rodada por número por vez)
-- (d) envio: contador de pulados/cancelados (o % fecha 100%)
-- (e) motor: batimento a cada rodada (a tela sabe se o motor parou)
-- (f) entrega: 'erro' tardio não apaga entregue/lida; ligar a mensagem ao alvo
--     depois (webhook gravou antes) também propaga a entrega
-- (g) resposta do cliente: vale pro envio mais recente que JÁ SAIU (mesmo no meio
--     de uma sequência de várias partes) — e só pra ele
-- (h) reenviar: nunca ressuscita envio cancelado; conta só o que voltou
-- (i) resumo: "na fila" = só o que está liberado agora; agendados à parte
-- (j) privacidade: opt-out e rodadas por papel; mídia recebida só pra quem vê o número
-- =====================================================================

-- (a)
create or replace function public.wa_tel_chave(p text) returns text
  language sql immutable parallel safe set search_path = ''
as $$
  select case when length(y.d2) >= 10 then left(y.d2, 2) || right(y.d2, 8) else nullif(y.d2, '') end
  from (select regexp_replace(regexp_replace(coalesce(p, ''), '\D', '', 'g'), '^0+', '') as d) x,
  lateral (select case when length(x.d) in (12, 13) and left(x.d, 2) = '55' then substr(x.d, 3) else x.d end as d2) y
$$;
reindex index public.leads_tel_chave_idx;
update public.wa_conversas set telefone = telefone;   -- recalcula a coluna gerada

-- (b)
alter table public.wa_conversas drop constraint if exists wa_conversas_canal_id_telefone_key;
alter table public.wa_conversas add column if not exists lid text;
create index if not exists wa_conversas_lid_idx on public.wa_conversas (canal_id, lid) where lid is not null;

-- (c)
alter table public.wa_canais
  add column if not exists ultimo_envio_em timestamptz,
  add column if not exists processando_ate timestamptz;

-- (d)
alter table public.wa_envios add column if not exists pulados integer not null default 0;

-- (e)
create table if not exists public.wa_motor_status (
  id smallint primary key default 1 check (id = 1),
  ultima_rodada timestamptz, ultima_ok boolean, ultimo_erro text
);
insert into public.wa_motor_status (id) values (1) on conflict (id) do nothing;
alter table public.wa_motor_status enable row level security;
drop policy if exists wa_motor_status_sel on public.wa_motor_status;
create policy wa_motor_status_sel on public.wa_motor_status for select to authenticated using (public.current_papel() is not null);
revoke all on public.wa_motor_status from anon;
grant select on public.wa_motor_status to authenticated;

-- (f)
create or replace function private.wa_msg_status_avanca() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    -- 'erro' só vale antes de chegar (entregue/lida nunca viram erro); entrega nunca regride
    if new.status::text = 'erro' and old.status::text in ('entregue', 'lida') then
      new.status := old.status;
    elsif old.status::text <> 'erro' and new.status::text <> 'erro'
       and private.wa_msg_status_rank(new.status::text) < private.wa_msg_status_rank(old.status::text) then
      new.status := old.status;
    end if;
    if new.status::text in ('entregue', 'lida') and new.entregue_em is null then new.entregue_em := now(); end if;
    if new.status::text = 'lida' and new.lida_em is null then new.lida_em := now(); end if;
  end if;
  return new;
end $$;
revoke all on function private.wa_msg_status_avanca() from public, anon, authenticated;
drop trigger if exists wa_mensagens_status_alvo on public.wa_mensagens;
create trigger wa_mensagens_status_alvo after insert or update of status, alvo_id on public.wa_mensagens
  for each row execute function private.wa_msg_status_alvo();

-- (g)
create or replace function private.wa_msg_resposta() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare v_alvo uuid;
begin
  if new.direcao::text = 'entrada' then
    -- o envio mais recente desta conversa que JÁ SAIU (tem mensagem de saída ligada)
    -- antes da resposta, nos últimos 10 dias — mesmo que a sequência ainda esteja no meio
    select a.id into v_alvo
      from public.wa_envio_alvos a
      join lateral (select min(m.created_at) as saiu from public.wa_mensagens m
                     where m.alvo_id = a.id and m.direcao::text = 'saida') s on true
     where a.conversa_id = new.conversa_id and a.respondeu_em is null
       and s.saiu is not null and s.saiu <= new.created_at and s.saiu >= new.created_at - interval '10 days'
     order by s.saiu desc
     limit 1;
    if v_alvo is not null then
      update public.wa_envio_alvos set
        respondeu_em = new.created_at,
        resposta_previa = left(coalesce(nullif(btrim(new.conteudo), ''), '[' || new.tipo::text || ']'), 160),
        resposta_msg_id = new.id
      where id = v_alvo;
    end if;
  end if;
  return new;
end $$;
revoke all on function private.wa_msg_resposta() from public, anon, authenticated;

-- (h)
create or replace function public.wa_alvos_reenviar(p_ids uuid[])
  returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_n int; v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if not public.is_at_least('gestor') then raise exception 'sem permissao' using errcode = '42501'; end if;
  with alvo as (
    select a.id, a.envio_id from public.wa_envio_alvos a join public.wa_envios e on e.id = a.envio_id
     where a.id = any(coalesce(p_ids, '{}'::uuid[])) and a.status::text = 'erro'
       and e.estado::text <> 'cancelado'
       and (e.origem = 'manual' or (a.created_at at time zone 'America/Sao_Paulo')::date = v_hoje)
  ), upd as (
    -- parte_atual fica: sequência cortada retoma da parte que falhou (nada sai 2x)
    update public.wa_envio_alvos a set status = 'pendente', erro = null, tentativas = 0, tentar_apos = null, claim_em = null
      from alvo where a.id = alvo.id returning a.id, a.envio_id
  ), env as (
    update public.wa_envios e set estado = 'enviando' where e.id in (select envio_id from upd) returning e.id
  )
  select count(*) into v_n from upd;
  return jsonb_build_object('ok', true, 'reenviados', v_n);
end $$;
revoke all on function public.wa_alvos_reenviar(uuid[]) from public, anon;
grant execute on function public.wa_alvos_reenviar(uuid[]) to authenticated;

-- (i)
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
    'na_fila',      count(*) filter (where a.status::text in ('pendente', 'enviando') and e.estado::text = 'enviando'),
    'agendados',    count(*) filter (where a.status::text = 'pendente' and e.estado::text = 'rascunho'),
    'optouts',      (select count(*) from public.wa_optout)
  )
  from public.wa_envio_alvos a
  join public.wa_envios e on e.id = a.envio_id
  where (a.created_at >= p_de and a.created_at < p_ate) or a.status::text in ('pendente', 'enviando')
     or (a.enviado_em >= p_de and a.enviado_em < p_ate)
$$;
revoke all on function public.wa_envios_resumo(timestamptz, timestamptz) from public, anon;
grant execute on function public.wa_envios_resumo(timestamptz, timestamptz) to authenticated;

-- (j) opt-out: gestor/admin veem tudo; os demais só os clientes que já enxergam (RLS de leads)
drop policy if exists wa_optout_sel on public.wa_optout;
create policy wa_optout_sel on public.wa_optout for select to authenticated using (
  public.is_at_least('gestor') or (lead_id is not null and exists (select 1 from public.leads l where l.id = wa_optout.lead_id)));
drop policy if exists wa_motor_rodadas_sel on public.wa_motor_rodadas;
create policy wa_motor_rodadas_sel on public.wa_motor_rodadas for select to authenticated using (public.is_at_least('gestor'));
-- mídia RECEBIDA (entrada/<canal>/…) só pra quem pode ver aquele número; saída segue liberada pra quem opera
drop policy if exists wa_midia_sel on storage.objects;
create policy wa_midia_sel on storage.objects for select to authenticated using (
  bucket_id = 'wa-midia' and public.current_papel() is not null and (
    coalesce((storage.foldername(name))[1], '') <> 'entrada'
    or public.wa_pode_ver_canal(nullif((storage.foldername(name))[2], '')::uuid)));
