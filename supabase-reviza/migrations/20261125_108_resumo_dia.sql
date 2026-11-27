-- 108 · RESUMO DO DIA PARA O GESTOR (25/11, "algo melhor que" o sistema que a Reviza usava antes). O dia da equipe numa
-- tela só (Dashboard › Resumo do dia): quantos clientes escreveram, quantas conversas a equipe atendeu, o que a IA
-- respondeu, documentos que chegaram, conversas fechadas e por quê, leads novos/ganhos/perdidos no Kanban, quem
-- esperou além da meta (aviso da 106) e cada atendente. E, se o administrador ligar, um aviso no sino no fim da tarde
-- com o resumo e o link (atd_resumo_dia_config, DESLIGADO de saída; agendador a cada 10 min — aplicar-25-11-tarde.sh).
-- Peças: private.atd_resumo_dia_calc (a conta), public.atd_resumo_dia (a tela; só administrador),
-- public.atd_resumo_dia_tick (o agendador), atd_resumo_dia_config/_enviado.
-- ADITIVA: só cria peças novas. Depende da 93, da 105 (motivo ao fechar) e da 106 (avisos de espera). DESFAZER no fim.

-- 1) a configuração do aviso no sino ---------------------------------------------------------------------------------
create table if not exists public.atd_resumo_dia_config (
  organizacao_id uuid primary key references public.organizacoes(id) on delete cascade,
  ativo          boolean not null default false,
  hora           time    not null default '18:30',
  dias           int[]   not null default '{1,2,3,4,5}',      -- 0 = domingo … 6 = sábado (horário de São Paulo)
  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid,
  constraint atd_resumo_dia_config_dias check (cardinality(dias) between 1 and 7 and dias <@ array[0, 1, 2, 3, 4, 5, 6]),
  constraint atd_resumo_dia_config_hora check (hora between '06:00' and '23:30')
);
create table if not exists public.atd_resumo_dia_enviado (
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  dia            date not null,
  criado_em      timestamptz not null default now(),
  primary key (organizacao_id, dia)
);
alter table public.atd_resumo_dia_config enable row level security;
alter table public.atd_resumo_dia_enviado enable row level security;
revoke all on public.atd_resumo_dia_config, public.atd_resumo_dia_enviado from public, anon, authenticated;
grant select, insert, update on public.atd_resumo_dia_config to authenticated;
grant all on public.atd_resumo_dia_config, public.atd_resumo_dia_enviado to service_role;
drop policy if exists atd_resumo_dia_config_admin on public.atd_resumo_dia_config;
create policy atd_resumo_dia_config_admin on public.atd_resumo_dia_config for all to authenticated
  using ((select public.is_at_least('admin'))) with check ((select public.is_at_least('admin')));

create or replace function private.atd_resumo_dia_carimbo()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.atualizado_em := now();
  if auth.uid() is not null then new.atualizado_por := auth.uid(); end if;
  return new;
end $$;
revoke all on function private.atd_resumo_dia_carimbo() from public, anon, authenticated;
drop trigger if exists atd_resumo_dia_carimbo on public.atd_resumo_dia_config;
create trigger atd_resumo_dia_carimbo before insert or update on public.atd_resumo_dia_config
  for each row execute function private.atd_resumo_dia_carimbo();

-- 2) a conta de um dia (horário de São Paulo) --------------------------------------------------------------------------
create or replace function private.atd_resumo_dia_calc(p_org uuid, p_dia date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_ini timestamptz := (p_dia::timestamp at time zone 'America/Sao_Paulo');
  v_fim timestamptz := ((p_dia + 1)::timestamp at time zone 'America/Sao_Paulo');
  v jsonb;
begin
  with
  m as (
    select mm.conversa_id, mm.direcao::text as dir, mm.tipo::text as tipo, mm.status::text as st, mm.origem, mm.autor_id
      from public.mensagens mm
     where mm.organizacao_id = p_org and mm.criado_em >= v_ini - interval '1 hour' and mm.criado_em < v_fim + interval '1 hour'
       and (case when mm.direcao::text = 'entrada' then coalesce(mm.recebida_em, mm.criado_em) else coalesce(mm.enviada_em, mm.criado_em) end) >= v_ini
       and (case when mm.direcao::text = 'entrada' then coalesce(mm.recebida_em, mm.criado_em) else coalesce(mm.enviada_em, mm.criado_em) end) < v_fim
       and mm.tipo::text not in ('sistema', 'nota_interna')
  ),
  humanas as (  -- o que a EQUIPE mandou (a IA é origem 'bot'; nota interna já saiu acima)
    select * from m where dir = 'saida' and st <> 'falhou' and coalesce(origem, '') not in ('bot', 'nota')
  ),
  fech as (
    select a.conversa_id, a.usuario_id, nullif(btrim(a.motivo), '') as motivo
      from public.conversa_atividades a
     where a.organizacao_id = p_org and a.tipo = 'fechado' and a.criado_em >= v_ini and a.criado_em < v_fim
  ),
  esp as (
    select e.conversa_id, min(e.criado_em) as quando
      from public.atd_aviso_espera_enviado e
     where e.organizacao_id = p_org and e.criado_em >= v_ini and e.criado_em < v_fim
     group by 1
  ),
  pessoas as (
    select u.id, coalesce(nullif(btrim(u.nome), ''), 'Sem nome') as nome,
           (select count(distinct h.conversa_id) from humanas h where h.autor_id = u.id) as conversas,
           (select count(*) from humanas h where h.autor_id = u.id) as mensagens,
           (select count(*) from fech f where f.usuario_id = u.id) as fechadas
      from public.organizacao_usuarios ou
      join public.usuarios u on u.id = ou.usuario_id
     where ou.organizacao_id = p_org and ou.status = 'ativo'
  )
  select jsonb_build_object(
    'dia', p_dia,
    'clientes_escreveram', (select count(distinct conversa_id) from m where dir = 'entrada'),
    'recebidas', (select count(*) from m where dir = 'entrada'),
    'conversas_novas', (select count(*) from public.conversas c where c.organizacao_id = p_org and c.criado_em >= v_ini and c.criado_em < v_fim),
    'atendidas_equipe', (select count(distinct conversa_id) from humanas),
    'enviadas_equipe', (select count(*) from humanas),
    'pelo_celular', (select count(*) from humanas where origem = 'telefone'),
    'enviadas_ia', (select count(*) from m where dir = 'saida' and st <> 'falhou' and origem = 'bot'),
    'atendidas_ia', (select count(distinct conversa_id) from m where dir = 'saida' and st <> 'falhou' and origem = 'bot'),
    'falharam', (select count(*) from m where dir = 'saida' and st = 'falhou'),
    'docs_recebidos', (select count(*) from m where dir = 'entrada' and tipo in ('imagem', 'documento')),
    'fechadas', (select count(*) from fech),
    'motivos', coalesce((select jsonb_agg(jsonb_build_object('motivo', x.motivo, 'n', x.n) order by x.n desc, x.motivo)
                           from (select coalesce(motivo, 'Sem motivo') as motivo, count(*) as n from fech group by 1 order by 2 desc limit 8) x), '[]'::jsonb),
    'leads_novos', (select count(*) from public.oportunidades o where o.organizacao_id = p_org and o.criado_em >= v_ini and o.criado_em < v_fim),
    'ganhos', (select count(*) from public.oportunidades o where o.organizacao_id = p_org and o.status::text = 'ganho' and o.fechado_em >= v_ini and o.fechado_em < v_fim),
    'perdidos', (select count(*) from public.oportunidades o where o.organizacao_id = p_org and o.status::text = 'perdido' and o.fechado_em >= v_ini and o.fechado_em < v_fim),
    'esperaram_meta', (select count(*) from esp),
    'esperaram', coalesce((select jsonb_agg(jsonb_build_object('conversa_id', e.conversa_id, 'quando', e.quando,
                                 'contato', coalesce(nullif(btrim(ct.nome), ''), ct.telefone, 'Cliente sem nome'), 'responsavel', nullif(btrim(us.nome), '')) order by e.quando)
                             from (select * from esp order by quando limit 30) e
                             join public.conversas cv on cv.id = e.conversa_id
                             left join public.contatos ct on ct.id = cv.contato_id
                             left join public.usuarios us on us.id = cv.atendente_id), '[]'::jsonb),
    'atendentes', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'nome', p.nome, 'conversas', p.conversas, 'mensagens', p.mensagens, 'fechadas', p.fechadas)
                                  order by p.conversas desc, p.mensagens desc, p.nome)
                             from pessoas p where p.conversas > 0 or p.fechadas > 0), '[]'::jsonb)
  ) into v;
  return v;
end $$;
revoke all on function private.atd_resumo_dia_calc(uuid, date) from public, anon, authenticated;

-- 3) a tela (só o administrador, como o resto do Dashboard): até 62 dias para trás
create or replace function public.atd_resumo_dia(p_dia date default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_org uuid := 'a1fa0000-0000-4000-8000-000000000001';
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_dia date := coalesce(p_dia, (now() at time zone 'America/Sao_Paulo')::date);
begin
  if coalesce(public.org_papel(v_org), '') <> 'admin' and not public.is_platform_admin() then raise exception 'sem_permissao'; end if;
  if v_dia > v_hoje or v_dia < v_hoje - 62 then raise exception 'dia_invalido'; end if;
  return private.atd_resumo_dia_calc(v_org, v_dia) || jsonb_build_object('gerado_em', now());
end $$;
revoke all on function public.atd_resumo_dia(date) from public, anon;
grant execute on function public.atd_resumo_dia(date) to authenticated, service_role;

-- "1 lead novo" / "3 leads novos"
create or replace function private.atd_qtd(p_n int, p_um text, p_varios text)
returns text language sql immutable set search_path = '' as $$ select coalesce(p_n, 0) || ' ' || case when coalesce(p_n, 0) = 1 then p_um else p_varios end $$;
revoke all on function private.atd_qtd(int, text, text) from public, anon, authenticated;

-- 4) o agendador: no dia e hora escolhidos, um aviso no sino de cada administrador (uma vez por dia)
create or replace function public.atd_resumo_dia_tick()
returns int language plpgsql security definer set search_path = '' as $$
declare cfg record; v_agora timestamp := now() at time zone 'America/Sao_Paulo'; v_dia date := (now() at time zone 'America/Sao_Paulo')::date;
        r jsonb; v_corpo text; v_n int; v_total int := 0;
begin
  for cfg in select * from public.atd_resumo_dia_config where ativo loop
    continue when not (extract(dow from v_agora)::int = any (cfg.dias)) or v_agora::time < cfg.hora;
    insert into public.atd_resumo_dia_enviado (organizacao_id, dia) values (cfg.organizacao_id, v_dia) on conflict do nothing;
    get diagnostics v_n = row_count;
    continue when v_n = 0;  -- já avisou hoje
    r := private.atd_resumo_dia_calc(cfg.organizacao_id, v_dia);
    v_corpo := private.atd_qtd((r->>'clientes_escreveram')::int, 'cliente escreveu', 'clientes escreveram') || ' · '
            || private.atd_qtd((r->>'atendidas_equipe')::int, 'atendido pela equipe', 'atendidos pela equipe') || ' · '
            || private.atd_qtd((r->>'fechadas')::int, 'conversa fechada', 'conversas fechadas') || ' · '
            || private.atd_qtd((r->>'leads_novos')::int, 'lead novo', 'leads novos')
            || case when (r->>'esperaram_meta')::int > 0 then ' · ' || private.atd_qtd((r->>'esperaram_meta')::int, 'esperou além da meta', 'esperaram além da meta') else '' end || '.';
    insert into public.atd_notificacoes (organizacao_id, usuario_id, tipo, titulo, corpo, rota)
    select cfg.organizacao_id, ou.usuario_id, 'resumo_dia', 'Resumo do dia ' || to_char(v_dia, 'DD/MM'), v_corpo,
           '/dashboard?aba=resumo&dia=' || to_char(v_dia, 'YYYY-MM-DD')
      from public.organizacao_usuarios ou
     where ou.organizacao_id = cfg.organizacao_id and ou.status = 'ativo' and ou.papel::text = 'admin';
    get diagnostics v_n = row_count; v_total := v_total + v_n;
  end loop;
  delete from public.atd_resumo_dia_enviado where dia < v_dia - 60;
  return v_total;
end $$;
revoke all on function public.atd_resumo_dia_tick() from public, anon, authenticated;
grant execute on function public.atd_resumo_dia_tick() to service_role;

-- DESFAZER:
--   select cron.unschedule('atd-resumo-dia');
--   drop function if exists public.atd_resumo_dia_tick(), private.atd_qtd(int, text, text), public.atd_resumo_dia(date), private.atd_resumo_dia_calc(uuid, date), private.atd_resumo_dia_carimbo() cascade;
--   drop table if exists public.atd_resumo_dia_enviado, public.atd_resumo_dia_config;
