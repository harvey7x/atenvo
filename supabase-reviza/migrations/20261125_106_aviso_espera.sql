-- 106 · AVISO DE CLIENTE ESPERANDO ALÉM DA META (25/11, "algo melhor que" o sistema que a Reviza usava antes: lá só
-- existia o relatório do tempo de resposta, depois do fato). Aqui o sistema avisa ENQUANTO o cliente espera:
--   · passou da meta (ex.: 30 min) sem resposta → aviso no sino do RESPONSÁVEL pela conversa;
--   · passou do segundo tempo (ex.: 60 min) → aviso no sino dos GESTORES (administrador e gestor da Reviza);
--   · conversa sem responsável → vai direto para os gestores quando passa da meta.
-- "Esperando" = a última mensagem da conversa é do cliente (a mesma regra do Dashboard › Atendentes, migration 97):
-- resposta da equipe OU da IA encerra a espera; envio que falhou, mensagem do sistema e nota interna não contam.
-- Nunca avisa: conversa fechada/resolvida ou arquivada, conversa com a IA atendendo (ia_sessoes 'ativa') — a não ser
-- que a IA tenha pedido uma pessoa (conversas.precisa_humano): aí o cliente está esperando a equipe.
-- Cada espera avisa UMA vez por nível (atd_aviso_espera_enviado). Ligar não avisa de esperas antigas: só as que
-- começaram até 2 horas antes de ligar. Modo 'uteis' = só conta seg–sex das 8 às 18 (horário de São Paulo).
-- Peças: atd_aviso_espera (a configuração, DESLIGADA de saída), private.atd_espera_agora (a conta),
-- public.atd_aviso_espera_tick (o agendador chama a cada 2 min — ver aplicar-aviso-espera.sh) e
-- public.atd_aviso_espera_previa (a lista "passaram da meta agora" da tela de Configurações).
-- ADITIVA: só cria peças novas. Depende da 93 (Atendimento) e da 97 (atd_minutos_uteis). DESFAZER no fim.

-- 1) a configuração (uma por empresa) -------------------------------------------------------------------------------
create table if not exists public.atd_aviso_espera (
  organizacao_id     uuid primary key references public.organizacoes(id) on delete cascade,
  ativo              boolean not null default false,
  meta_min           int     not null default 30,
  gestor_apos_min    int     not null default 60,
  modo               text    not null default 'uteis',
  avisar_responsavel boolean not null default true,
  avisar_gestores    boolean not null default true,
  ligado_em          timestamptz,
  atualizado_em      timestamptz not null default now(),
  atualizado_por     uuid,
  constraint atd_aviso_espera_meta check (meta_min between 5 and 480),
  constraint atd_aviso_espera_gestor check (gestor_apos_min between 5 and 1440 and gestor_apos_min >= meta_min),
  constraint atd_aviso_espera_modo check (modo in ('uteis', 'corrido'))
);

-- 2) o que já foi avisado (uma vez por espera e por nível) -----------------------------------------------------------
create table if not exists public.atd_aviso_espera_enviado (
  conversa_id    uuid not null references public.conversas(id) on delete cascade,
  desde          timestamptz not null,
  nivel          text not null,
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  criado_em      timestamptz not null default now(),
  primary key (conversa_id, desde, nivel),
  constraint atd_aviso_espera_enviado_nivel check (nivel in ('responsavel', 'gestor'))
);
create index if not exists atd_aviso_espera_enviado_org_idx on public.atd_aviso_espera_enviado (organizacao_id, criado_em desc);

alter table public.atd_aviso_espera enable row level security;
alter table public.atd_aviso_espera_enviado enable row level security;
revoke all on public.atd_aviso_espera, public.atd_aviso_espera_enviado from public, anon, authenticated;
grant select, insert, update on public.atd_aviso_espera to authenticated;
grant all on public.atd_aviso_espera, public.atd_aviso_espera_enviado to service_role;
drop policy if exists atd_aviso_espera_admin on public.atd_aviso_espera;
create policy atd_aviso_espera_admin on public.atd_aviso_espera for all to authenticated
  using ((select public.is_at_least('admin'))) with check ((select public.is_at_least('admin')));
-- atd_aviso_espera_enviado: sem política (só as funções abaixo mexem)

-- 3) carimbos: quem mexeu e quando foi ligado (a tela não escolhe essa data)
create or replace function private.atd_aviso_espera_carimbo()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.atualizado_em := now();
  if auth.uid() is not null then new.atualizado_por := auth.uid(); end if;
  if new.ativo and (tg_op = 'INSERT' or not old.ativo) then
    new.ligado_em := now();
  elsif tg_op = 'INSERT' then
    new.ligado_em := null;
  else
    new.ligado_em := old.ligado_em;
  end if;
  return new;
end $$;
revoke all on function private.atd_aviso_espera_carimbo() from public, anon, authenticated;
drop trigger if exists atd_aviso_espera_carimbo on public.atd_aviso_espera;
create trigger atd_aviso_espera_carimbo before insert or update on public.atd_aviso_espera
  for each row execute function private.atd_aviso_espera_carimbo();

-- 4) "1 h 05 min"
create or replace function private.atd_fmt_minutos(p int)
returns text language sql immutable set search_path = '' as $$
  select case when p < 60 then p || ' min'
              when p % 60 = 0 then (p / 60) || ' h'
              else (p / 60) || ' h ' || lpad((p % 60)::text, 2, '0') || ' min' end $$;
revoke all on function private.atd_fmt_minutos(int) from public, anon, authenticated;

-- 5) quem está esperando AGORA nesta empresa (conversas com mensagem nos últimos 3 dias)
create or replace function private.atd_espera_agora(p_org uuid, p_modo text, p_desde_min timestamptz)
returns table (conversa_id uuid, desde timestamptz, atendente_id uuid, contato text, responsavel text, espera_min int)
language sql stable security definer set search_path = '' as $$
  with ultimas as (
    select distinct on (m.conversa_id) m.conversa_id, m.direcao
      from public.mensagens m
     where m.organizacao_id = p_org and m.criado_em >= now() - interval '3 days'
       and not (m.direcao = 'saida' and m.status::text = 'falhou')
       and m.tipo::text not in ('sistema', 'nota_interna')
     order by m.conversa_id, m.criado_em desc
  ),
  esperando as (
    select u.conversa_id, cv.atendente_id,
           (select min(coalesce(m2.recebida_em, m2.criado_em))
              from public.mensagens m2
             where m2.conversa_id = u.conversa_id and m2.direcao = 'entrada'
               and m2.criado_em > coalesce((select max(m3.criado_em) from public.mensagens m3
                                             where m3.conversa_id = u.conversa_id and m3.direcao = 'saida'
                                               and m3.status::text <> 'falhou' and m3.tipo::text not in ('sistema', 'nota_interna')),
                                           '-infinity'::timestamptz)) as desde,
           coalesce(nullif(btrim(c.nome), ''), c.telefone, 'Cliente sem nome') as contato
      from ultimas u
      join public.conversas cv on cv.id = u.conversa_id
      left join public.contatos c on c.id = cv.contato_id
     where u.direcao = 'entrada' and cv.arquivada_em is null and cv.status::text not in ('resolvida', 'fechada')
       -- a IA atendendo cuida da resposta; só entra se ela pediu uma pessoa (precisa_humano)
       and (coalesce(cv.precisa_humano, false)
            or not exists (select 1 from public.ia_sessoes s where s.conversa_id = cv.id and s.status = 'ativa'))
  )
  select e.conversa_id, e.desde, e.atendente_id, e.contato, nullif(btrim(us.nome), ''),
         round(case when p_modo = 'uteis' then public.atd_minutos_uteis(e.desde, now())
                    else extract(epoch from (now() - e.desde)) / 60.0 end)::int
    from esperando e
    left join public.usuarios us on us.id = e.atendente_id
   where e.desde is not null and e.desde >= coalesce(p_desde_min, '-infinity'::timestamptz)
$$;
revoke all on function private.atd_espera_agora(uuid, text, timestamptz) from public, anon, authenticated;

-- 6) os gestores que recebem: administrador e gestor da Reviza que estão no Atendimento
create or replace function private.atd_gestores_atendimento(p_org uuid)
returns setof uuid language sql stable security definer set search_path = '' as $$
  select ou.usuario_id
    from public.organizacao_usuarios ou
    join public.profiles p on p.id = ou.usuario_id
   where ou.organizacao_id = p_org and ou.status = 'ativo' and p.ativo and p.papel::text in ('admin', 'gestor')
$$;
revoke all on function private.atd_gestores_atendimento(uuid) from public, anon, authenticated;

-- 7) o agendador: avisa quem passou da meta (devolve quantos avisos saíram)
create or replace function public.atd_aviso_espera_tick()
returns int language plpgsql security definer set search_path = '' as $$
declare cfg record; v_n int; v_total int := 0;
begin
  for cfg in select * from public.atd_aviso_espera where ativo loop
    create temporary table if not exists atd_espera_tmp (conversa_id uuid, desde timestamptz, atendente_id uuid, contato text, responsavel text, espera_min int) on commit drop;
    truncate pg_temp.atd_espera_tmp;
    insert into pg_temp.atd_espera_tmp
      select * from private.atd_espera_agora(cfg.organizacao_id, cfg.modo, cfg.ligado_em - interval '2 hours');

    -- o responsável, ao passar da meta
    if cfg.avisar_responsavel then
      with novos as (
        insert into public.atd_aviso_espera_enviado (conversa_id, desde, nivel, organizacao_id)
        select t.conversa_id, t.desde, 'responsavel', cfg.organizacao_id
          from pg_temp.atd_espera_tmp t where t.atendente_id is not null and t.espera_min >= cfg.meta_min
        on conflict do nothing
        returning conversa_id, desde
      )
      insert into public.atd_notificacoes (organizacao_id, usuario_id, tipo, titulo, corpo, rota, ref_id)
      select cfg.organizacao_id, t.atendente_id, 'espera_meta',
             'Cliente esperando resposta há ' || private.atd_fmt_minutos(t.espera_min),
             t.contato || ' mandou mensagem e ainda não teve resposta. A meta da equipe é ' || private.atd_fmt_minutos(cfg.meta_min) || '.',
             '/whatsapp?conversa=' || t.conversa_id, t.conversa_id
        from novos n join pg_temp.atd_espera_tmp t on t.conversa_id = n.conversa_id and t.desde = n.desde;
      get diagnostics v_n = row_count; v_total := v_total + v_n;
    end if;

    -- os gestores: passou do segundo tempo, ou passou da meta e a conversa não tem responsável
    if cfg.avisar_gestores then
      with novos as (
        insert into public.atd_aviso_espera_enviado (conversa_id, desde, nivel, organizacao_id)
        select t.conversa_id, t.desde, 'gestor', cfg.organizacao_id
          from pg_temp.atd_espera_tmp t
         where t.espera_min >= case when t.atendente_id is null then cfg.meta_min else cfg.gestor_apos_min end
        on conflict do nothing
        returning conversa_id, desde
      )
      insert into public.atd_notificacoes (organizacao_id, usuario_id, tipo, titulo, corpo, rota, ref_id)
      select cfg.organizacao_id, g.usuario_id, 'espera_meta_gestor',
             'Cliente sem resposta há ' || private.atd_fmt_minutos(t.espera_min),
             t.contato || coalesce(' · responsável: ' || t.responsavel, ' · sem responsável') || '. A meta da equipe é ' || private.atd_fmt_minutos(cfg.meta_min) || '.',
             '/whatsapp?conversa=' || t.conversa_id, t.conversa_id
        from novos n
        join pg_temp.atd_espera_tmp t on t.conversa_id = n.conversa_id and t.desde = n.desde
        cross join private.atd_gestores_atendimento(cfg.organizacao_id) as g(usuario_id)
       where g.usuario_id is distinct from t.atendente_id;
      get diagnostics v_n = row_count; v_total := v_total + v_n;
    end if;
  end loop;
  -- o registro do que foi avisado não precisa durar: 15 dias bastam para não repetir
  delete from public.atd_aviso_espera_enviado where criado_em < now() - interval '15 days';
  return v_total;
end $$;
revoke all on function public.atd_aviso_espera_tick() from public, anon, authenticated;
grant execute on function public.atd_aviso_espera_tick() to service_role;

-- 8) a tela (só o administrador): quem passou da meta agora, com a meta que está na tela (antes de salvar)
create or replace function public.atd_aviso_espera_previa(p_meta_min int default 30, p_modo text default 'uteis')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid := 'a1fa0000-0000-4000-8000-000000000001';
begin
  if not public.is_at_least('admin') then raise exception 'sem_permissao'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('conversa_id', x.conversa_id, 'contato', x.contato, 'responsavel', x.responsavel,
             'espera_min', x.espera_min, 'desde', x.desde) order by x.espera_min desc)
      from (select * from private.atd_espera_agora(v_org, case when p_modo = 'corrido' then 'corrido' else 'uteis' end, null)
             where espera_min >= greatest(5, least(coalesce(p_meta_min, 30), 480))
             order by espera_min desc limit 30) x
  ), '[]'::jsonb);
end $$;
revoke all on function public.atd_aviso_espera_previa(int, text) from public, anon;
grant execute on function public.atd_aviso_espera_previa(int, text) to authenticated, service_role;

-- DESFAZER:
--   select cron.unschedule('atd-aviso-espera');
--   drop function if exists public.atd_aviso_espera_previa(int, text), public.atd_aviso_espera_tick(),
--     private.atd_gestores_atendimento(uuid), private.atd_espera_agora(uuid, text, timestamptz), private.atd_fmt_minutos(int),
--     private.atd_aviso_espera_carimbo() cascade;
--   drop table if exists public.atd_aviso_espera_enviado, public.atd_aviso_espera;
