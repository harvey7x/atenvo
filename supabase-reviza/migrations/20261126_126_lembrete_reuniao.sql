-- 126 · LEMBRETE ANTES DA REUNIÃO (26/11, "igual" ao Follow-up de agendamentos do sistema que a Reviza usava antes). Ligado,
-- cada reunião MARCADA na Agenda (com cliente que tem conversa num número) ganha uma mensagem agendada para o cliente X tempo
-- antes (e, se quiser, um segundo aviso). Mudou o horário: o lembrete muda junto. Cancelou: o lembrete sai da fila.
-- CHEGA DESLIGADO: ligar é decisão do administrador da Reviza (a tela pede a confirmação). As mensagens aparecem em
-- Mensagens agendadas e saem pelo número da conversa. ADITIVA. Depende da 109 (agenda).

create table if not exists public.atd_lembrete_reuniao (
  organizacao_id  uuid primary key,
  ativo           boolean not null default false,
  antes_min       int not null default 120 check (antes_min between 15 and 10080),
  segundo_min     int check (segundo_min is null or segundo_min between 15 and 10080),
  texto           text not null default 'Oi {{nome}}! Passando para lembrar da nossa {{tipo}} {{quando}}. Se precisar mudar o horário, é só responder aqui.'
                  check (char_length(btrim(texto)) between 5 and 1000),
  ligado_por      uuid,
  ligado_em       timestamptz,
  atualizado_em   timestamptz not null default now()
);
alter table public.atd_lembrete_reuniao enable row level security;
drop policy if exists atd_lembrete_reuniao_admin on public.atd_lembrete_reuniao;
create policy atd_lembrete_reuniao_admin on public.atd_lembrete_reuniao for all to authenticated
  using (public.org_papel(organizacao_id) = 'admin') with check (public.org_papel(organizacao_id) = 'admin');
revoke all on public.atd_lembrete_reuniao from public, anon;
grant select, insert, update on public.atd_lembrete_reuniao to authenticated;
insert into public.atd_lembrete_reuniao (organizacao_id) values ('a1fa0000-0000-4000-8000-000000000001') on conflict do nothing;

create or replace function private.atd_lembrete_texto(p_modelo text, p_nome text, p_tipo text, p_inicio timestamptz, p_quando_envio timestamptz)
returns text language plpgsql stable set search_path = '' as $$
declare v_dia date := (p_inicio at time zone 'America/Sao_Paulo')::date; v_env date := (p_quando_envio at time zone 'America/Sao_Paulo')::date;
        v_hora text := to_char(p_inicio at time zone 'America/Sao_Paulo', 'HH24:MI'); v_quando text; v_primeiro text;
begin
  v_quando := case when v_dia = v_env then 'hoje às ' || v_hora
                   when v_dia = v_env + 1 then 'amanhã às ' || v_hora
                   else 'no dia ' || to_char(v_dia, 'DD/MM') || ' às ' || v_hora end;
  v_primeiro := initcap(split_part(btrim(coalesce(p_nome, '')), ' ', 1));
  return replace(replace(replace(replace(p_modelo, '{{nome}}', coalesce(nullif(v_primeiro, ''), 'tudo bem')), '{{quando}}', v_quando), '{{hora}}', v_hora),
                 '{{tipo}}', case p_tipo when 'ligacao' then 'ligação' when 'videochamada' then 'videochamada' when 'retorno' then 'conversa' else 'reunião' end);
end $$;
revoke all on function private.atd_lembrete_texto(text, text, text, timestamptz, timestamptz) from public, anon, authenticated;

-- (re)agenda os lembretes de UMA reunião (tira os que estavam na fila e põe os novos, se couber)
create or replace function private.atd_lembrete_reagendar(p_reuniao uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare r public.atd_reunioes; c public.atd_lembrete_reuniao; v_conv record; v_canal public.canais; v_quando timestamptz; v_n int := 0; v_min int; v_nome text;
begin
  select * into r from public.atd_reunioes where id = p_reuniao;
  if r.id is null then return 0; end if;
  update public.mensagens_agendadas set status = 'cancelada', cancelada_em = now()
   where organizacao_id = r.organizacao_id and metadados->>'lembrete_reuniao_id' = r.id::text and status = 'agendada';
  select * into c from public.atd_lembrete_reuniao where organizacao_id = r.organizacao_id;
  if c.organizacao_id is null or not c.ativo or r.status <> 'marcada' or r.contato_id is null then return 0; end if;
  -- a conversa do cliente que já tem número (a da reunião, ou a ativa dele)
  select cv.id, cv.canal_id into v_conv from public.conversas cv
   where cv.organizacao_id = r.organizacao_id and cv.contato_id = r.contato_id and cv.canal_id is not null and cv.status <> 'fechada'
   order by (cv.id = r.conversa_id) desc, cv.arquivada_em asc nulls first, cv.ultima_interacao_em desc nulls last limit 1;
  if v_conv.id is null then return 0; end if;
  select * into v_canal from public.canais where id = v_conv.canal_id;
  if v_canal.id is null or v_canal.ativo = false or v_canal.status_integracao::text <> 'conectado' or v_canal.envio_restrito then return 0; end if;
  select nome into v_nome from public.contatos where id = r.contato_id;
  foreach v_min in array array_remove(array[c.antes_min, c.segundo_min], null) loop
    v_quando := r.inicio - make_interval(mins => v_min);
    continue when v_quando < now() + interval '2 minutes';
    insert into public.mensagens_agendadas (organizacao_id, conversa_id, contato_id, canal_id, nome_canal_snapshot, telefone_canal_snapshot, tipo, texto, executar_em, metadados)
    values (r.organizacao_id, v_conv.id, r.contato_id, v_canal.id, v_canal.nome_interno, v_canal.numero_conectado, 'texto',
            private.atd_lembrete_texto(c.texto, v_nome, r.tipo, r.inicio, v_quando), v_quando,
            jsonb_build_object('lembrete_reuniao_id', r.id, 'lembrete_antes_min', v_min));
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke all on function private.atd_lembrete_reagendar(uuid) from public, anon, authenticated;

create or replace function private.atd_lembrete_da_reuniao() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  begin
    if tg_op = 'UPDATE' and new.inicio is not distinct from old.inicio and new.status is not distinct from old.status and new.contato_id is not distinct from old.contato_id then return null; end if;
    perform private.atd_lembrete_reagendar(new.id);
  exception when others then raise warning 'atd_lembrete_da_reuniao: %', sqlerrm;   -- o lembrete nunca derruba a reunião
  end;
  return null;
end $$;
drop trigger if exists atd_lembrete_da_reuniao on public.atd_reunioes;
create trigger atd_lembrete_da_reuniao after insert or update of inicio, status, contato_id on public.atd_reunioes
  for each row when (current_setting('atd.importando', true) is distinct from 'guimoo') execute function private.atd_lembrete_da_reuniao();

-- salvar a configuração; ligar/desligar refaz (ou tira) os lembretes das reuniões que ainda vão acontecer
create or replace function public.atd_lembrete_salvar(p_ativo boolean, p_antes_min int, p_segundo_min int, p_texto text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_org uuid := 'a1fa0000-0000-4000-8000-000000000001'; r record; v_n int := 0; v_reu int := 0;
begin
  if coalesce(public.org_papel(v_org), '') <> 'admin' and not public.is_platform_admin() then raise exception 'sem_permissao'; end if;
  insert into public.atd_lembrete_reuniao (organizacao_id, ativo, antes_min, segundo_min, texto, ligado_por, ligado_em, atualizado_em)
  values (v_org, coalesce(p_ativo, false), coalesce(p_antes_min, 120), p_segundo_min, coalesce(nullif(btrim(p_texto), ''), 'Oi {{nome}}! Passando para lembrar da nossa {{tipo}} {{quando}}.'),
          case when p_ativo then auth.uid() end, case when p_ativo then now() end, now())
  on conflict (organizacao_id) do update set ativo = excluded.ativo, antes_min = excluded.antes_min, segundo_min = excluded.segundo_min, texto = excluded.texto,
    ligado_por = case when excluded.ativo and not public.atd_lembrete_reuniao.ativo then auth.uid() else public.atd_lembrete_reuniao.ligado_por end,
    ligado_em = case when excluded.ativo and not public.atd_lembrete_reuniao.ativo then now() else public.atd_lembrete_reuniao.ligado_em end, atualizado_em = now();
  for r in select id from public.atd_reunioes where organizacao_id = v_org and inicio > now() and status = 'marcada' loop
    v_reu := v_reu + 1;
    v_n := v_n + private.atd_lembrete_reagendar(r.id);
  end loop;
  return jsonb_build_object('reunioes', v_reu, 'lembretes', v_n);
end $$;
revoke all on function public.atd_lembrete_salvar(boolean, int, int, text) from public, anon;
grant execute on function public.atd_lembrete_salvar(boolean, int, int, text) to authenticated;

-- DESFAZER: update public.mensagens_agendadas set status = 'cancelada' where metadados ? 'lembrete_reuniao_id' and status = 'agendada';
--   drop trigger if exists atd_lembrete_da_reuniao on public.atd_reunioes; drop function if exists public.atd_lembrete_salvar(boolean, int, int, text),
--   private.atd_lembrete_da_reuniao(), private.atd_lembrete_reagendar(uuid), private.atd_lembrete_texto(text, text, text, timestamptz, timestamptz);
--   drop table if exists public.atd_lembrete_reuniao;
