-- 124 · AVISAR OUTRO SISTEMA (WEBHOOKS DE SAÍDA) (26/11, "igual" aos Webhooks do sistema que a Reviza usava antes). O
-- administrador cadastra um endereço (https) e escolhe os momentos; a cada momento o Reviza manda um POST com os dados:
--   lead_novo  card novo no funil         etapa     o card mudou de etapa      venda    o card virou venda
--   perdido    o card foi descartado      reuniao   reunião marcada na Agenda  formulario  alguém preencheu um formulário
-- Cada envio vai assinado: X-Reviza-Assinatura: sha256=<HMAC do corpo com o segredo do webhook>. Em segundo plano (pg_net),
-- nunca segura a tela. Falhou: tenta de novo até 3 vezes (2, 4 e 6 min depois). 30 falhas seguidas: o webhook desliga sozinho.
-- Nada dispara durante a importação do sistema anterior. Isto NÃO manda mensagem a cliente nenhum. ADITIVA.

create table if not exists public.atd_webhooks (
  id               uuid primary key default gen_random_uuid(),
  organizacao_id   uuid not null,
  nome             text not null check (char_length(btrim(nome)) between 1 and 80),
  url              text not null,
  eventos          text[] not null default '{lead_novo,etapa,venda}'
                   check (cardinality(eventos) > 0 and eventos <@ array['lead_novo', 'etapa', 'venda', 'perdido', 'reuniao', 'formulario']),
  segredo          text not null default encode(extensions.gen_random_bytes(24), 'hex'),
  ativo            boolean not null default true,
  falhas_seguidas  int not null default 0,
  ultimo_envio_em  timestamptz,
  ultimo_status    int,
  desligado_motivo text,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now()
);
-- o endereço: https, sem espaço, até 500 letras (o Postgres não aceita {4,500} na expressão: o tamanho vai à parte)
alter table public.atd_webhooks drop constraint if exists atd_webhooks_url_check;
alter table public.atd_webhooks add constraint atd_webhooks_url_check check (url ~ '^https://[^[:space:]]{4,}$' and char_length(url) <= 500);
create table if not exists public.atd_webhook_envios (
  id             bigserial primary key,
  webhook_id     uuid not null references public.atd_webhooks(id) on delete cascade,
  organizacao_id uuid not null,
  evento         text not null,
  payload        jsonb not null,
  request_id     bigint,
  status_http    int,
  erro           text,
  tentativas     int not null default 0,
  criado_em      timestamptz not null default now(),
  enviado_em     timestamptz,
  resolvido_em   timestamptz
);
create index if not exists atd_webhook_envios_pend on public.atd_webhook_envios (resolvido_em, enviado_em) where resolvido_em is null;
create index if not exists atd_webhook_envios_web on public.atd_webhook_envios (webhook_id, criado_em desc);

alter table public.atd_webhooks enable row level security;
alter table public.atd_webhook_envios enable row level security;
drop policy if exists atd_webhooks_admin on public.atd_webhooks;
create policy atd_webhooks_admin on public.atd_webhooks for all to authenticated
  using (public.org_papel(organizacao_id) = 'admin') with check (public.org_papel(organizacao_id) = 'admin');
drop policy if exists atd_webhook_envios_admin on public.atd_webhook_envios;
create policy atd_webhook_envios_admin on public.atd_webhook_envios for select to authenticated using (public.org_papel(organizacao_id) = 'admin');
revoke all on public.atd_webhooks, public.atd_webhook_envios from public, anon;
grant select, insert, update, delete on public.atd_webhooks to authenticated;
grant select on public.atd_webhook_envios to authenticated;

create or replace function private.atd_webhooks_tocar() returns trigger language plpgsql set search_path = '' as $$
begin
  new.atualizado_em := now();
  if new.ativo and not old.ativo then new.falhas_seguidas := 0; new.desligado_motivo := null; end if;
  return new;
end $$;
drop trigger if exists atd_webhooks_tocar on public.atd_webhooks;
create trigger atd_webhooks_tocar before update on public.atd_webhooks for each row execute function private.atd_webhooks_tocar();

-- mandar UM envio (assinado) em segundo plano
create or replace function private.atd_webhook_enviar(p_envio bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare e public.atd_webhook_envios; w public.atd_webhooks; v_corpo text; v_req bigint;
begin
  select * into e from public.atd_webhook_envios where id = p_envio;
  select * into w from public.atd_webhooks where id = e.webhook_id;
  if w.id is null or not w.ativo then
    update public.atd_webhook_envios set resolvido_em = now(), erro = coalesce(erro, 'webhook desligado') where id = p_envio; return;
  end if;
  v_corpo := e.payload::text;
  v_req := net.http_post(
    url := w.url, body := e.payload, timeout_milliseconds := 8000,
    headers := jsonb_build_object('Content-Type', 'application/json', 'User-Agent', 'Reviza-CRM-Webhook/1', 'X-Reviza-Evento', e.evento,
                                  'X-Reviza-Envio', e.id::text, 'X-Reviza-Assinatura', 'sha256=' || encode(extensions.hmac(v_corpo, w.segredo, 'sha256'), 'hex')));
  update public.atd_webhook_envios set request_id = v_req, tentativas = tentativas + 1, enviado_em = now(), status_http = null, erro = null where id = p_envio;
end $$;
revoke all on function private.atd_webhook_enviar(bigint) from public, anon, authenticated;

-- pôr na fila (para cada webhook ligado que ouve o momento) e mandar já
create or replace function private.atd_webhook_disparar(p_org uuid, p_evento text, p_dados jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare w record; v_id bigint;
begin
  if current_setting('atd.importando', true) = 'guimoo' then return; end if;
  for w in select id from public.atd_webhooks where organizacao_id = p_org and ativo and p_evento = any (eventos) loop
    insert into public.atd_webhook_envios (webhook_id, organizacao_id, evento, payload)
    values (w.id, p_org, p_evento, jsonb_build_object('evento', p_evento, 'quando', now(), 'dados', p_dados))
    returning id into v_id;
    perform private.atd_webhook_enviar(v_id);
  end loop;
end $$;
revoke all on function private.atd_webhook_disparar(uuid, text, jsonb) from public, anon, authenticated;

-- os dados de um card (o que vai no corpo)
create or replace function private.atd_webhook_dados_card(p_op uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'card_id', o.id, 'cliente', coalesce(ct.nome, o.contato_nome, o.titulo), 'telefone', coalesce(ct.telefone, o.telefone), 'email', ct.email,
    'etapa', fc.nome, 'situacao', o.status, 'origem', coalesce(o.origem, o.fonte_aquisicao), 'responsavel', u.nome,
    'etiquetas', to_jsonb(coalesce(o.etiquetas, '{}')), 'valor', o.valor_estimado, 'motivo_perda', o.motivo_perda,
    'entrou_em', o.criado_em, 'fechado_em', o.fechado_em, 'contato_id', o.contato_id))
    from public.oportunidades o left join public.contatos ct on ct.id = o.contato_id
    left join public.funil_colunas fc on fc.id = o.coluna_id left join public.usuarios u on u.id = o.responsavel_id
   where o.id = p_op
$$;
revoke all on function private.atd_webhook_dados_card(uuid) from public, anon, authenticated;

create or replace function private.atd_webhooks_do_card() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  begin
    if not exists (select 1 from public.atd_webhooks where organizacao_id = new.organizacao_id and ativo) then return null; end if;
    if tg_op = 'INSERT' then
      perform private.atd_webhook_disparar(new.organizacao_id, 'lead_novo', private.atd_webhook_dados_card(new.id));
      return null;
    end if;
    if new.coluna_id is distinct from old.coluna_id then
      perform private.atd_webhook_disparar(new.organizacao_id, 'etapa', private.atd_webhook_dados_card(new.id)
        || jsonb_build_object('etapa_antes', (select nome from public.funil_colunas where id = old.coluna_id)));
    end if;
    if new.status = 'ganho' and old.status is distinct from 'ganho' then
      perform private.atd_webhook_disparar(new.organizacao_id, 'venda', private.atd_webhook_dados_card(new.id));
    elsif new.status = 'perdido' and old.status is distinct from 'perdido' then
      perform private.atd_webhook_disparar(new.organizacao_id, 'perdido', private.atd_webhook_dados_card(new.id));
    end if;
  exception when others then
    raise warning 'atd_webhooks_do_card: %', sqlerrm;   -- o webhook nunca derruba a mudança do card
  end;
  return null;
end $$;
drop trigger if exists atd_webhooks_do_card on public.oportunidades;
create trigger atd_webhooks_do_card after insert or update of coluna_id, status on public.oportunidades
  for each row when (current_setting('atd.importando', true) is distinct from 'guimoo') execute function private.atd_webhooks_do_card();

create or replace function private.atd_webhooks_da_reuniao() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  begin
    if not exists (select 1 from public.atd_webhooks where organizacao_id = new.organizacao_id and ativo) then return null; end if;
    perform private.atd_webhook_disparar(new.organizacao_id, 'reuniao', jsonb_strip_nulls(jsonb_build_object(
      'reuniao_id', new.id, 'titulo', new.titulo, 'tipo', new.tipo, 'inicio', new.inicio, 'duracao_min', new.duracao_min,
      'cliente', (select nome from public.contatos where id = new.contato_id), 'telefone', (select telefone from public.contatos where id = new.contato_id),
      'responsavel', (select nome from public.usuarios where id = new.responsavel_id), 'contato_id', new.contato_id)));
  exception when others then raise warning 'atd_webhooks_da_reuniao: %', sqlerrm;
  end;
  return null;
end $$;
drop trigger if exists atd_webhooks_da_reuniao on public.atd_reunioes;
create trigger atd_webhooks_da_reuniao after insert on public.atd_reunioes for each row execute function private.atd_webhooks_da_reuniao();

create or replace function private.atd_webhooks_do_formulario() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  begin
    if new.repetido or not exists (select 1 from public.atd_webhooks where organizacao_id = new.organizacao_id and ativo) then return null; end if;
    perform private.atd_webhook_disparar(new.organizacao_id, 'formulario', jsonb_strip_nulls(jsonb_build_object(
      'formulario', (select nome from public.atd_formularios where id = new.formulario_id), 'respostas', new.dados,
      'card_id', new.oportunidade_id, 'reuniao_id', new.reuniao_id, 'contato_id', new.contato_id)));
  exception when others then raise warning 'atd_webhooks_do_formulario: %', sqlerrm;
  end;
  return null;
end $$;
drop trigger if exists atd_webhooks_do_formulario on public.atd_formulario_respostas;
create trigger atd_webhooks_do_formulario after insert on public.atd_formulario_respostas for each row execute function private.atd_webhooks_do_formulario();

-- a cada minuto: lê as respostas do pg_net, tenta de novo o que falhou (até 3 vezes) e desliga o webhook que só falha
create or replace function private.atd_webhooks_conferir()
returns void language plpgsql security definer set search_path = '' as $$
declare e record; v_st int; v_err text; v_to boolean; v_ok boolean;
begin
  for e in select * from public.atd_webhook_envios where resolvido_em is null and request_id is not null and status_http is null and erro is null
              and enviado_em < now() - interval '15 seconds' order by id limit 500 loop
    select status_code, error_msg, timed_out into v_st, v_err, v_to from net._http_response where id = e.request_id;
    if not found then
      continue when e.enviado_em > now() - interval '10 minutes';
      v_st := null; v_err := 'sem resposta'; v_to := true;
    end if;
    v_ok := coalesce(v_st between 200 and 299, false);
    update public.atd_webhook_envios
       set status_http = v_st,
           erro = case when v_ok then null else coalesce(nullif(v_err, ''), case when v_to then 'tempo esgotado' end, 'HTTP ' || coalesce(v_st::text, '?')) end,
           resolvido_em = case when v_ok or e.tentativas >= 3 then now() end
     where id = e.id;
    update public.atd_webhooks set ultimo_envio_em = e.enviado_em, ultimo_status = v_st,
           falhas_seguidas = case when v_ok then 0 else falhas_seguidas + 1 end
     where id = e.webhook_id;
  end loop;
  -- tentar de novo o que falhou (2, 4 e 6 min depois da tentativa anterior)
  for e in select id from public.atd_webhook_envios
            where resolvido_em is null and enviado_em is not null and tentativas < 3 and erro is not null
              and enviado_em < now() - make_interval(mins => 2 * tentativas)
            order by id limit 200 loop
    perform private.atd_webhook_enviar(e.id);
  end loop;
  update public.atd_webhooks set ativo = false, desligado_motivo = '30 falhas seguidas: confira o endereço e ligue de novo'
   where ativo and falhas_seguidas >= 30;
end $$;
revoke all on function private.atd_webhooks_conferir() from public, anon, authenticated;
do $$ begin
  perform cron.unschedule('atd-webhooks') where exists (select 1 from cron.job where jobname = 'atd-webhooks');
  perform cron.schedule('atd-webhooks', '* * * * *', 'select private.atd_webhooks_conferir()');
end $$;

-- testar: manda um envio de exemplo para o webhook (o administrador vê o resultado na lista)
create or replace function public.atd_webhook_testar(p_webhook uuid)
returns bigint language plpgsql security definer set search_path = '' as $$
declare w public.atd_webhooks; v_id bigint;
begin
  select * into w from public.atd_webhooks where id = p_webhook;
  if w.id is null or coalesce(public.org_papel(w.organizacao_id), '') <> 'admin' then raise exception 'sem_permissao'; end if;
  if not w.ativo then raise exception 'webhook_desligado'; end if;
  insert into public.atd_webhook_envios (webhook_id, organizacao_id, evento, payload)
  values (w.id, w.organizacao_id, 'teste', jsonb_build_object('evento', 'teste', 'quando', now(), 'dados', jsonb_build_object(
    'mensagem', 'Teste do Reviza CRM: se chegou, o endereço está certo.', 'cliente', 'Cliente de exemplo', 'telefone', '5551999990000', 'etapa', 'LEAD NOVO')))
  returning id into v_id;
  perform private.atd_webhook_enviar(v_id);
  return v_id;
end $$;
revoke all on function public.atd_webhook_testar(uuid) from public, anon;
grant execute on function public.atd_webhook_testar(uuid) to authenticated;

-- trocar o segredo (quando ele vazou ou a pessoa que cuidava saiu): os envios seguintes já vão com o novo
create or replace function public.atd_webhook_trocar_segredo(p_webhook uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  select organizacao_id into v_org from public.atd_webhooks where id = p_webhook;
  if v_org is null or coalesce(public.org_papel(v_org), '') <> 'admin' then raise exception 'sem_permissao'; end if;
  update public.atd_webhooks set segredo = encode(extensions.gen_random_bytes(24), 'hex') where id = p_webhook;
end $$;
revoke all on function public.atd_webhook_trocar_segredo(uuid) from public, anon;
grant execute on function public.atd_webhook_trocar_segredo(uuid) to authenticated;

-- DESFAZER: select cron.unschedule('atd-webhooks'); drop trigger atd_webhooks_do_card on public.oportunidades;
--   drop trigger atd_webhooks_da_reuniao on public.atd_reunioes; drop trigger atd_webhooks_do_formulario on public.atd_formulario_respostas;
--   drop table if exists public.atd_webhook_envios, public.atd_webhooks; (e as funções private.atd_webhook*)
