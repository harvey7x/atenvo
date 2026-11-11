-- Placar do CAF no Atenvo — pedido do dono 29/10/2026 ("os números do sistema do CAF
-- têm que bater no Atenvo… isso é muito importante").
--
-- O "Meu painel" do CAF conta CASO completo pela regra do pódio (campeonato_contagem):
-- vendedor do caso, última vez que o caso passou para completo, só os vendedores do
-- campeonato do mês e sem os casos que o gerente tirou da conta. Mês = dia 11 → dia 10.
--
-- A API caf-fechados passa a mandar, por caso: caso_id, vendedor, completo_em (regra do
-- pódio) e fora_da_conta; e ?placar=DATA devolve o placar oficial do mês (pedido em
-- ~/Atenvo/pedido-api-caf-placar.md). Aqui:
--   * adm_casos  — um registro por caso (adm_sincronizar preenche quando vem caso_id);
--   * adm_placar — o placar de cada mês (a edge fn grava; diz quem joga em cada mês);
--   * dash_v5_fechamentos — com adm_casos preenchido, os "fechados" do dashboard saem
--     dos casos do CAF (todas as telas do dashboard usam esta função). Sem adm_casos
--     (API antiga), segue contando pelos cards, como antes.

-- ---------------------------------------------------------------- tabelas
create table if not exists public.adm_casos (
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  caso_id uuid not null,
  contato_id uuid,
  vendedor text,
  completo_em timestamptz,                 -- regra do pódio (null = só forçado)
  fora_da_conta boolean not null default false,
  fechado_em timestamptz,                  -- o mesmo fechado_em da lista
  atualizado_em timestamptz not null default now(),
  primary key (organizacao_id, caso_id)
);
create index if not exists idx_adm_casos_completo on public.adm_casos (organizacao_id, completo_em);
alter table public.adm_casos enable row level security;
drop policy if exists adm_casos_sel on public.adm_casos;
create policy adm_casos_sel on public.adm_casos for select to authenticated
  using (public.is_member(organizacao_id));

create table if not exists public.adm_placar (
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  mes date not null,                       -- dia 11 que abre o mês do campeonato
  vendedor text not null,
  completos int not null,
  tirados int not null default 0,
  informado boolean not null default false,
  lido_em timestamptz not null default now(),
  primary key (organizacao_id, mes, vendedor)
);
alter table public.adm_placar enable row level security;
drop policy if exists adm_placar_sel on public.adm_placar;
create policy adm_placar_sel on public.adm_placar for select to authenticated
  using (public.is_member(organizacao_id));

-- ---------------------------------------------------------------- regras do CAF
-- Dia 11 que abre o mês do campeonato que contém o instante (= campeonato_inicio do CAF).
create or replace function public.adm_mes_inicio(p_em timestamptz)
returns date language sql stable set search_path = public, pg_temp as $$
  select (date_trunc('month', (p_em at time zone 'America/Sao_Paulo')::date - 10))::date + 10
$$;

-- Quem joga no mês: o placar do mês (ou o do último mês anterior, como o CAF herda a
-- configuração). Antes do primeiro placar gravado vale o primeiro conhecido; sem placar
-- nenhum, todos os vendedores dos casos.
create or replace function public.adm_jogadores(p_org uuid, p_mes date)
returns text[] language sql stable set search_path = public, pg_temp as $$
  select coalesce(
    (select array_agg(p.vendedor) from adm_placar p
      where p.organizacao_id = p_org
        and p.mes = (select max(q.mes) from adm_placar q where q.organizacao_id = p_org and q.mes <= p_mes)),
    (select array_agg(p.vendedor) from adm_placar p
      where p.organizacao_id = p_org
        and p.mes = (select min(q.mes) from adm_placar q where q.organizacao_id = p_org)),
    (select array_agg(distinct k.vendedor) from adm_casos k
      where k.organizacao_id = p_org and k.vendedor is not null))
$$;

-- Usuário do Atenvo do vendedor do CAF: mesmo nome; senão, o único com o mesmo primeiro nome.
create or replace function public.adm_usuario_do_vendedor(p_org uuid, p_nome text)
returns uuid language sql stable set search_path = public, pg_temp as $$
  with m as (
    select u.id, adm_nome_chave(u.nome) as nk, ou.status
      from organizacao_usuarios ou join usuarios u on u.id = ou.usuario_id
     where ou.organizacao_id = p_org
  ), v as (select adm_nome_chave(p_nome) as nk)
  select coalesce(
    (select m.id from m, v where m.nk = v.nk order by (m.status = 'ativo') desc limit 1),
    (select (array_agg(m.id))[1] from m, v
      where split_part(m.nk, ' ', 1) = split_part(v.nk, ' ', 1)
     having count(*) = 1))
$$;

-- ---------------------------------------------------------------- leitura (casos)
-- Cópia da versão VIVA (20261029170000) + o bloco dos casos.
create or replace function public.adm_sincronizar(p_org uuid, p_fechados jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_n int := jsonb_array_length(coalesce(p_fechados,'[]'::jsonb));
        v_cfg adm_config; v_res jsonb := '{}'::jsonb; v_cas int;
begin
  insert into adm_config(organizacao_id) values (p_org) on conflict do nothing;
  select * into v_cfg from adm_config where organizacao_id = p_org for update;

  if v_n < 100 or (v_cfg.ultimos_completos is not null and v_n < v_cfg.ultimos_completos * 0.9) then
    insert into adm_sync_log(organizacao_id, completos, erro) values (p_org, v_n, 'leitura_incompleta');
    return jsonb_build_object('ok', false, 'erro', 'leitura_incompleta', 'completos', v_n, 'esperado', v_cfg.ultimos_completos);
  end if;

  create temp table _af on commit drop as
  with bruto as (
    select btrim(coalesce(e->>'nome','')) nome,
           lpad(nullif(regexp_replace(coalesce(e->>'cpf',''),'\D','','g'),''), 11, '0') cpf,
           chave_canonica_telefone(e->>'telefone') tel,
           case when coalesce(e->>'fechado_em','') ~ '^\d{4}-\d{2}-\d{2}' then (e->>'fechado_em')::timestamptz end fechado_em
      from jsonb_array_elements(p_fechados) e
  )
  select distinct on (chave) *
    from (select b.*, case when length(b.cpf) = 11 then b.cpf when b.tel is not null then 'tel:' || b.tel end chave
            from bruto b) x
   where chave is not null
   order by chave, fechado_em desc nulls last;

  -- casamento: CPF do contato → CPF da ficha judicial → telefone
  create temp table _ct on commit drop as
    select id, lpad(regexp_replace(cpf,'\D','','g'),11,'0') cpf, chave_canonica_telefone(telefone) tel, criado_em
      from contatos where organizacao_id = p_org;
  alter table _af add column contato_id uuid;
  update _af p set contato_id = (select c.id from _ct c where c.cpf = p.cpf order by c.criado_em desc limit 1)
   where length(p.cpf) = 11;
  update _af p set contato_id = (select f.contato_id from fichas_judiciais f
                                  where f.organizacao_id = p_org and f.contato_id is not null
                                    and lpad(regexp_replace(coalesce(f.cpf,''),'\D','','g'),11,'0') = p.cpf
                                  order by f.criado_em desc limit 1)
   where p.contato_id is null and length(p.cpf) = 11;
  update _af p set contato_id = (select c.id from _ct c where c.tel = p.tel order by c.criado_em desc limit 1)
   where p.contato_id is null and p.tel is not null;
  -- por último, o nome completo idêntico (2+ palavras), só quando um único contato tem esse nome
  -- (contato sem CPF e com outro telefone — 29/10 eram 2 completos lá caindo fora do Fechado)
  update _af p set contato_id = u.id
    from (select adm_nome_chave(c.nome) nk, (array_agg(c.id))[1] id
            from contatos c where c.organizacao_id = p_org
           group by 1 having count(*) = 1) u
   where p.contato_id is null and u.nk = adm_nome_chave(p.nome) and u.nk like '% %';

  insert into adm_fechados as t (organizacao_id, chave, cpf, telefone_chave, nome, fechado_em, contato_id)
  select p_org, chave, nullif(cpf,''), tel, nome, fechado_em, contato_id from _af
  on conflict (organizacao_id, chave) do update set
    cpf = excluded.cpf, telefone_chave = excluded.telefone_chave, nome = excluded.nome,
    fechado_em = excluded.fechado_em, contato_id = excluded.contato_id, atualizado_em = now();
  delete from adm_fechados t where t.organizacao_id = p_org
     and not exists (select 1 from _af p where p.chave = t.chave);

  -- 29/10 (placar): um registro por caso, com o cliente casado acima. API sem caso_id
  -- (versão antiga) esvazia a tabela e o dashboard volta a contar pelos cards.
  if exists (select 1 from jsonb_array_elements(p_fechados) e
              where coalesce(e->>'caso_id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
    create temp table _cs on commit drop as
    select distinct on (caso_id) *
      from (select (e->>'caso_id')::uuid caso_id,
                   nullif(btrim(coalesce(e->>'vendedor','')), '') vendedor,
                   case when coalesce(e->>'completo_em','') ~ '^\d{4}-\d{2}-\d{2}' then (e->>'completo_em')::timestamptz end completo_em,
                   coalesce(e->>'fora_da_conta','') = 'true' fora,
                   case when coalesce(e->>'fechado_em','') ~ '^\d{4}-\d{2}-\d{2}' then (e->>'fechado_em')::timestamptz end fechado_em,
                   case when length(lpad(nullif(regexp_replace(coalesce(e->>'cpf',''),'\D','','g'),''), 11, '0')) = 11
                        then lpad(nullif(regexp_replace(coalesce(e->>'cpf',''),'\D','','g'),''), 11, '0')
                        when chave_canonica_telefone(e->>'telefone') is not null
                        then 'tel:' || chave_canonica_telefone(e->>'telefone') end chave
              from jsonb_array_elements(p_fechados) e
             where coalesce(e->>'caso_id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') x
     order by caso_id;
    insert into adm_casos as t (organizacao_id, caso_id, contato_id, vendedor, completo_em, fora_da_conta, fechado_em)
    select p_org, s.caso_id, (select a.contato_id from _af a where a.chave = s.chave), s.vendedor, s.completo_em, s.fora, s.fechado_em
      from _cs s
    on conflict (organizacao_id, caso_id) do update set
      contato_id = excluded.contato_id, vendedor = excluded.vendedor, completo_em = excluded.completo_em,
      fora_da_conta = excluded.fora_da_conta, fechado_em = excluded.fechado_em, atualizado_em = now();
    delete from adm_casos t where t.organizacao_id = p_org
       and not exists (select 1 from _cs s where s.caso_id = t.caso_id);
  else
    delete from adm_casos where organizacao_id = p_org;
  end if;

  select count(contato_id) into v_cas from _af;
  update adm_config set ultima_leitura_em = now(), ultimos_completos = v_n, atualizado_em = now()
   where organizacao_id = p_org;

  if v_cfg.ativo then
    v_res := adm_aplicar(p_org);
  end if;

  insert into adm_sync_log(organizacao_id, completos, casados, fechou, reabriu, arquivou, redatou)
  values (p_org, v_n, v_cas, (v_res->>'fechou')::int, (v_res->>'reabriu')::int,
          (v_res->>'arquivou')::int, (v_res->>'redatou')::int);
  return jsonb_build_object('ok', true, 'completos', v_n, 'casados', v_cas, 'ativo', v_cfg.ativo) || v_res;
end $$;
revoke all on function public.adm_sincronizar(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.adm_sincronizar(uuid, jsonb) to service_role;

-- ---------------------------------------------------------------- leitura (placar)
-- p_placar = o objeto "placar" da API: {mes, fim, informado, jogadores:[{nome, completos, completos_tirados}]}.
create or replace function public.adm_placar_gravar(p_org uuid, p_placar jsonb)
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare v_mes date; v_n int;
begin
  if coalesce(p_placar->>'mes', '') !~ '^\d{4}-\d{2}-\d{2}$' then return 0; end if;
  v_mes := (p_placar->>'mes')::date;
  with j as (
    select distinct on (btrim(x->>'nome')) btrim(x->>'nome') as vendedor,
           greatest(0, coalesce((x->>'completos')::int, 0)) as completos,
           greatest(0, coalesce((x->>'completos_tirados')::int, 0)) as tirados
      from jsonb_array_elements(coalesce(p_placar->'jogadores', '[]'::jsonb)) x
     where coalesce(btrim(x->>'nome'), '') <> ''
  ), up as (
    insert into adm_placar as t (organizacao_id, mes, vendedor, completos, tirados, informado, lido_em)
    select p_org, v_mes, j.vendedor, j.completos, j.tirados, coalesce(p_placar->>'informado', '') = 'true', now() from j
    on conflict (organizacao_id, mes, vendedor) do update set
      completos = excluded.completos, tirados = excluded.tirados, informado = excluded.informado, lido_em = now()
    returning 1
  )
  select count(*) into v_n from up;
  delete from adm_placar t
   where t.organizacao_id = p_org and t.mes = v_mes
     and not exists (select 1 from jsonb_array_elements(coalesce(p_placar->'jogadores', '[]'::jsonb)) x
                      where btrim(x->>'nome') = t.vendedor);
  return v_n;
end $$;
revoke all on function public.adm_placar_gravar(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.adm_placar_gravar(uuid, jsonb) to service_role;

-- Situação para o selo e o texto de ajuda: "placar" = os fechados já vêm dos casos do CAF.
create or replace function public.adm_status(p_org uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select case when not public.is_member(p_org) then null else
    jsonb_build_object('ativo', coalesce(c.ativo,false), 'ultima_leitura_em', c.ultima_leitura_em,
                       'completos', (select count(*) from adm_fechados a where a.organizacao_id = p_org),
                       'placar', exists (select 1 from adm_casos k where k.organizacao_id = p_org))
  end
  from (select 1) x left join adm_config c on c.organizacao_id = p_org
$$;
revoke all on function public.adm_status(uuid) from public, anon;
grant execute on function public.adm_status(uuid) to authenticated;

-- ---------------------------------------------------------------- dashboard
-- Cópia da versão VIVA de dash_v5_fechamentos (29/10) + os fechados do CAF. Pára se ela
-- mudou desde então (refazer a cópia).
do $$
begin
  if (select md5(prosrc) from pg_proc
       where oid = 'public.dash_v5_fechamentos(uuid,timestamp with time zone,timestamp with time zone)'::regprocedure)
     is distinct from '86f5da14c786c0ddc29def7e346a2e64' then
    raise exception 'A função dash_v5_fechamentos mudou depois de 29/10: refaça a cópia antes de aplicar';
  end if;
end $$;

create or replace function public.dash_v5_fechamentos(p_org uuid, p_ini timestamp with time zone, p_fim timestamp with time zone)
 returns table(oportunidade_id uuid, contato_id uuid, canal_origem_id uuid, tipo text, motivo text, quem text, fechado_por_id uuid, credito_id uuid, criado_em timestamp with time zone, fechado_em timestamp with time zone, horas double precision)
 language sql
 stable
as $function$
  with caf as (select exists (select 1 from public.adm_casos k where k.organizacao_id = p_org) as tem)
  select o.id, o.contato_id, o.canal_origem_id,
         case when o.status = 'ganho' then 'ganho' else 'ne' end,
         case when o.status = 'ganho' then null else coalesce(o.motivo_nao_elegivel, 'sem_categoria') end,
         case when o.status = 'ganho' then null
              when o.fechado_por_id is not null then 'equipe'
              when o.motivo_nao_elegivel = 'nao_mora_rs'
               and o.fechado_em - o.criado_em < interval '1 minute' then 'regra_rs'
              else 'ia' end,
         o.fechado_por_id,
         case when o.status = 'ganho' then coalesce(o.responsavel_no_fechamento_id, o.fechado_por_id) end,
         o.criado_em, o.fechado_em,
         case when o.status = 'ganho'
               and o.fechado_em >= o.criado_em
               and not coalesce(o.fechado_em_estimado, false)
               and o.criado_em >= timestamptz '2026-08-01 00:00-03'
              then (extract(epoch from o.fechado_em - o.criado_em) / 3600.0)::double precision end
    from public.oportunidades o
    left join public.contatos ct on ct.id = o.contato_id
    cross join caf
   where o.organizacao_id = p_org
     and o.fechado_em >= p_ini and o.fechado_em < p_fim
     and ((o.status = 'ganho' and not caf.tem)
          or (o.status = 'perdido'
              and coalesce(o.motivo_perda, '') = any (public.dashboard_motivos_descarte())))
     and not public.dash_v5_interno(coalesce(ct.telefone, o.telefone))
  union all
  -- 29/10 (dono): com os casos do CAF, "fechado" é o caso completo pela regra do pódio:
  -- data do pódio, crédito do vendedor do caso, só quem joga no mês, sem os tirados pelo
  -- gerente. O card do cliente dá o número de origem e o tempo para fechar.
  select op.id, k.contato_id, op.canal_origem_id, 'ganho', null, null, null::uuid,
         public.adm_usuario_do_vendedor(p_org, k.vendedor),
         op.criado_em, k.completo_em,
         case when op.criado_em is not null
               and k.completo_em >= op.criado_em
               and op.criado_em >= timestamptz '2026-08-01 00:00-03'
              then (extract(epoch from k.completo_em - op.criado_em) / 3600.0)::double precision end
    from public.adm_casos k
    left join lateral (
      select o.id, o.canal_origem_id, o.criado_em
        from public.oportunidades o
       where o.organizacao_id = p_org and o.contato_id = k.contato_id
       order by (o.status = 'ganho') desc, (o.criado_em <= k.completo_em) desc, o.criado_em desc
       limit 1) op on k.contato_id is not null
   where k.organizacao_id = p_org
     and k.completo_em >= p_ini and k.completo_em < p_fim
     and not k.fora_da_conta
     and k.vendedor = any (public.adm_jogadores(p_org, public.adm_mes_inicio(k.completo_em)))
$function$;

notify pgrst, 'reload schema';
