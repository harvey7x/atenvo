-- 90 — IRIS no Reviza (dono 22/11): a atendente virtual atendendo nos números de WhatsApp que o Reviza já tem.
--
-- Depende da 87 (cofre). Apenas aditivo; a única ligação com o que já existe é um gatilho novo em
-- wa_mensagens, que só age em mensagem RECEBIDA de um número com a Iris ligada e nunca impede a mensagem de
-- entrar (qualquer erro dele é engolido). Tudo nasce DESLIGADO e em MODO TESTE: a Iris só responde depois que
-- o administrador escolher o número, ligar, e mesmo assim só para os números de teste até ele liberar.
-- As funções têm os mesmos nomes que a tela de atendente já usa (ia_agentes, ia_agente_salvar_chave…).

create table if not exists public.ia_agentes (
  id                uuid primary key default gen_random_uuid(),
  organizacao_id    text not null default 'reviza',
  nome              text not null default 'Iris',
  provedor          text not null default 'gemini' check (provedor in ('gemini', 'openai', 'anthropic')),
  modelo            text not null default 'gemini-3.6-flash',
  persona_prompt    text not null default '',
  conhecimento      text not null default '',
  comportamentos    jsonb not null default '{}'::jsonb,
  ativo             boolean not null default false,
  chave_definida_em timestamptz,        -- a chave em si fica no cofre (vault); aqui só quando foi guardada
  criado_em         timestamptz not null default now()
);
alter table public.ia_agentes enable row level security;
drop policy if exists ia_agentes_admin on public.ia_agentes;
create policy ia_agentes_admin on public.ia_agentes for all to authenticated
  using ((select public.is_at_least('admin'::public.papel_usuario)))
  with check ((select public.is_at_least('admin'::public.papel_usuario)));
revoke all on public.ia_agentes from anon, authenticated;
grant select, insert, update, delete on public.ia_agentes to authenticated;
grant all on public.ia_agentes to service_role;

-- ligar exige a chave guardada; "chave guardada" só o banco marca (nunca o navegador)
create or replace function public.ia_agentes_guarda() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if TG_OP = 'INSERT' then NEW.chave_definida_em := null; NEW.ativo := false; return NEW; end if;
  if NEW.chave_definida_em is distinct from OLD.chave_definida_em and coalesce(current_setting('reviza.iris_chave', true), '') <> 'sim' then
    NEW.chave_definida_em := OLD.chave_definida_em;
  end if;
  if NEW.ativo and NEW.chave_definida_em is null then raise exception 'Guarde a chave do Google antes de ligar a atendente.' using errcode = '23514'; end if;
  return NEW;
end $$;
drop trigger if exists ia_agentes_guarda on public.ia_agentes;
create trigger ia_agentes_guarda before insert or update on public.ia_agentes for each row execute function public.ia_agentes_guarda();

-- em quais números a Iris atende (um registro por número de WhatsApp)
create table if not exists public.iris_canais_config (
  canal_id       uuid primary key references public.wa_canais(id) on delete cascade,
  ia_agente_id   uuid references public.ia_agentes(id) on delete set null,
  ia_enabled     boolean not null default false,
  ia_modo_teste  boolean not null default true,       -- em teste, só responde aos números de teste
  numeros_teste  text[] not null default '{}',
  atualizado_em  timestamptz not null default now()
);
-- cada conversa: a Iris está atendendo ou uma pessoa assumiu
create table if not exists public.iris_sessoes (
  conversa_id   uuid primary key references public.wa_conversas(id) on delete cascade,
  estado        text not null default 'ativa' check (estado in ('ativa', 'humano')),
  motivo        text,
  iniciada_em   timestamptz not null default now(),
  atualizada_em timestamptz not null default now()
);
-- tudo o que a Iris fez (e o que ela enviou: é por aqui que se sabe qual mensagem é dela)
create table if not exists public.iris_log (
  id             bigint generated always as identity primary key,
  quando         timestamptz not null default now(),
  canal_id       uuid,
  conversa_id    uuid,
  agente_id      uuid,
  tipo           text not null,        -- respondeu | passou_humano | bloqueada | erro | ignorou
  mensagem_id    uuid,                 -- a mensagem enviada por ela (quando tipo = respondeu)
  detalhe        text,
  tokens_entrada integer,
  tokens_saida   integer
);
create index if not exists iris_log_canal_quando on public.iris_log (canal_id, quando desc);
create index if not exists iris_log_mensagem on public.iris_log (mensagem_id) where mensagem_id is not null;
alter table public.iris_canais_config enable row level security;
alter table public.iris_sessoes enable row level security;
alter table public.iris_log enable row level security;
revoke all on public.iris_canais_config, public.iris_sessoes, public.iris_log from anon, authenticated;
grant all on public.iris_canais_config, public.iris_sessoes, public.iris_log to service_role;

-- apagar a atendente: desliga nos números e tira a chave do cofre
create or replace function public.ia_agentes_ao_apagar() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.iris_canais_config set ia_enabled = false where ia_agente_id = OLD.id;
  perform public.integracao_segredo_apagar('iris_chave_' || OLD.id::text);
  return OLD;
end $$;
drop trigger if exists ia_agentes_ao_apagar on public.ia_agentes;
create trigger ia_agentes_ao_apagar before delete on public.ia_agentes for each row execute function public.ia_agentes_ao_apagar();

/* ---------------- o que a tela chama (só administrador) ---------------- */
create or replace function public.iris_so_admin() returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_at_least('admin'::public.papel_usuario) then raise exception 'sem permissão' using errcode = '42501'; end if;
end $$;

create or replace function public.ia_agente_salvar_chave(p_agente uuid, p_chave text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.iris_so_admin();
  if p_chave is null or length(btrim(p_chave)) < 20 then raise exception 'A chave parece incompleta.' using errcode = '22023'; end if;
  if not exists (select 1 from public.ia_agentes where id = p_agente) then raise exception 'Atendente não encontrada.'; end if;
  perform public.integracao_segredo_gravar('iris_chave_' || p_agente::text, btrim(p_chave));
  perform set_config('reviza.iris_chave', 'sim', true);
  update public.ia_agentes set chave_definida_em = now() where id = p_agente;
end $$;

create or replace function public.iris_canais()
returns table (id uuid, nome text, numero text, ia_enabled boolean, ia_modo_teste boolean, numeros_teste text[], ia_agente_id uuid)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.iris_so_admin();
  return query
    select c.id, coalesce(nullif(btrim(p.nome), ''), c.nome), c.numero,
           coalesce(g.ia_enabled, false), coalesce(g.ia_modo_teste, true), coalesce(g.numeros_teste, '{}'::text[]), g.ia_agente_id
      from public.wa_canais c
      left join public.profiles p on p.id = c.dono_id
      left join public.iris_canais_config g on g.canal_id = c.id
     order by 2;
end $$;

create or replace function public.ia_agente_vincular_canais(p_agente uuid, p_canais uuid[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.iris_so_admin();
  -- os que saíram da lista: desligam e ficam sem atendente
  update public.iris_canais_config set ia_agente_id = null, ia_enabled = false, atualizado_em = now()
   where ia_agente_id = p_agente and not (canal_id = any (coalesce(p_canais, '{}'::uuid[])));
  insert into public.iris_canais_config (canal_id, ia_agente_id)
  select c.id, p_agente from public.wa_canais c where c.id = any (coalesce(p_canais, '{}'::uuid[]))
  on conflict (canal_id) do update set ia_agente_id = excluded.ia_agente_id, atualizado_em = now(),
    -- trocar de atendente desliga: quem liga é o administrador, de novo, sabendo quem vai responder
    ia_enabled = case when public.iris_canais_config.ia_agente_id is distinct from excluded.ia_agente_id then false else public.iris_canais_config.ia_enabled end;
end $$;

create or replace function public.ia_canal_ativar(p_canal uuid, p_ativo boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_agente public.ia_agentes%rowtype;
begin
  perform public.iris_so_admin();
  if p_ativo then
    select a.* into v_agente from public.iris_canais_config g join public.ia_agentes a on a.id = g.ia_agente_id where g.canal_id = p_canal;
    if not found then raise exception 'Escolha a atendente deste número antes de ligar.'; end if;
    if v_agente.chave_definida_em is null then raise exception 'Guarde a chave do Google antes de ligar.'; end if;
    if not v_agente.ativo then raise exception 'A atendente está desligada. Ligue-a primeiro.'; end if;
  end if;
  update public.iris_canais_config set ia_enabled = p_ativo, atualizado_em = now() where canal_id = p_canal;
end $$;

create or replace function public.ia_canal_modo_teste(p_canal uuid, p_teste boolean, p_numeros text[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.iris_so_admin();
  insert into public.iris_canais_config (canal_id, ia_modo_teste, numeros_teste)
  values (p_canal, p_teste, coalesce((select array_agg(distinct regexp_replace(n, '\D', '', 'g')) from unnest(coalesce(p_numeros, '{}'::text[])) n where length(regexp_replace(n, '\D', '', 'g')) >= 10), '{}'::text[]))
  on conflict (canal_id) do update set ia_modo_teste = excluded.ia_modo_teste, atualizado_em = now(),
    numeros_teste = case when p_numeros is null then public.iris_canais_config.numeros_teste else excluded.numeros_teste end;
end $$;

create or replace function public.ia_agente_metricas(p_agente uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_hoje timestamptz := date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
begin
  perform public.iris_so_admin();
  return jsonb_build_object(
    'sessoes_ativas', (select count(*) from public.iris_sessoes s join public.wa_conversas c on c.id = s.conversa_id join public.iris_canais_config g on g.canal_id = c.canal_id
                        where g.ia_agente_id = p_agente and s.estado = 'ativa' and s.atualizada_em > now() - interval '24 hours'),
    'chamadas_hoje',  (select count(*) from public.iris_log l where l.agente_id = p_agente and l.tipo in ('respondeu', 'passou_humano', 'bloqueada') and l.quando >= v_hoje),
    'nudges_hoje',    0,
    'handoffs_7d',    (select count(*) from public.iris_log l where l.agente_id = p_agente and l.tipo = 'passou_humano' and l.quando > now() - interval '7 days'),
    'canais',         (select count(*) from public.iris_canais_config g where g.ia_agente_id = p_agente and g.ia_enabled));
end $$;

revoke all on function public.iris_so_admin() from public, anon;
revoke all on function public.ia_agente_salvar_chave(uuid, text), public.iris_canais(), public.ia_agente_vincular_canais(uuid, uuid[]),
  public.ia_canal_ativar(uuid, boolean), public.ia_canal_modo_teste(uuid, boolean, text[]), public.ia_agente_metricas(uuid) from public, anon;
grant execute on function public.iris_so_admin(), public.ia_agente_salvar_chave(uuid, text), public.iris_canais(), public.ia_agente_vincular_canais(uuid, uuid[]),
  public.ia_canal_ativar(uuid, boolean), public.ia_canal_modo_teste(uuid, boolean, text[]), public.ia_agente_metricas(uuid) to authenticated, service_role;

/* ---------------- o gatilho: mensagem recebida num número com a Iris ligada → chama a função ---------------- */
-- O endereço da função e o segredo ficam no cofre ('iris_gatilho_url', 'iris_gatilho_segredo'), postos pelo
-- roteiro de aplicação. Sem os dois, o gatilho não faz nada.
create or replace function public.iris_ao_receber() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_url text; v_seg text;
begin
  if NEW.direcao <> 'entrada' or NEW.tipo <> 'texto' then return NEW; end if;
  if not exists (select 1 from public.iris_canais_config g join public.ia_agentes a on a.id = g.ia_agente_id
                  where g.canal_id = NEW.canal_id and g.ia_enabled and a.ativo) then return NEW; end if;
  select d.decrypted_secret into v_url from vault.decrypted_secrets d where d.name = 'iris_gatilho_url';
  select d.decrypted_secret into v_seg from vault.decrypted_secrets d where d.name = 'iris_gatilho_segredo';
  if v_url is null or v_seg is null then return NEW; end if;
  perform net.http_post(url := v_url, body := jsonb_build_object('mensagem_id', NEW.id), params := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-iris-segredo', v_seg), timeout_milliseconds := 90000);
  return NEW;
exception when others then
  return NEW;   -- a Iris nunca impede uma mensagem de entrar
end $$;
drop trigger if exists iris_ao_receber on public.wa_mensagens;
create trigger iris_ao_receber after insert on public.wa_mensagens for each row execute function public.iris_ao_receber();

notify pgrst, 'reload schema';

-- DESFAZER (a Iris para na hora ao tirar o gatilho):
--   drop trigger if exists iris_ao_receber on public.wa_mensagens; drop function public.iris_ao_receber();
--   drop function public.ia_agente_metricas(uuid); drop function public.ia_canal_modo_teste(uuid, boolean, text[]);
--   drop function public.ia_canal_ativar(uuid, boolean); drop function public.ia_agente_vincular_canais(uuid, uuid[]);
--   drop function public.iris_canais(); drop function public.ia_agente_salvar_chave(uuid, text); drop function public.iris_so_admin();
--   drop table public.iris_log; drop table public.iris_sessoes; drop table public.iris_canais_config; drop table public.ia_agentes cascade;
--   drop function public.ia_agentes_ao_apagar(); drop function public.ia_agentes_guarda();
--   delete from vault.secrets where name like 'iris_%';
