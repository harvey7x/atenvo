-- Fechado pela planilha CONTROLE ADM (aba REVISIONAL) — pedido do dono 24/10/2026.
--
-- A partir daqui o cliente só é FECHADO (coluna resultado 'ganho' → status 'ganho')
-- quando a planilha da equipe confirma. Como dashboard, aba Fechados do inbox e
-- pós-venda já leem oportunidades.status = 'ganho' + fechado_em, basta a planilha
-- ser a ÚNICA porta de entrada/saída da coluna Fechado.
--
-- LEGENDA (dono, 24/10) — cor de fundo da coluna A + texto da coluna OBS:
--   amarelo #ffff00 / verde claro #00ff00  → fechado
--   verde escuro #38761d + OBS "ASSINADO…" → fechado
--   verde escuro #38761d + OBS "ASSINAR…"  → falta assinar
--   azul #0000ff                           → falta documentação
--   vermelho #ff0000                       → perdido (vence qualquer texto)
--   qualquer outra coisa                   → outro (não mexe em nada)
--   fechado com "BMG" na OBS 2 (coluna C)  → pendente (falta o BMG; o administrativo
--                                            não conta — dono, 24/10: out = 57)
--
-- DATA DO FECHADO (dono, 24/10): o mês da casa vai do dia 10 ao dia 10. Cada
-- "PRODUÇÃO N" é uma semana; o separador que abre o mês traz o nome dele
-- ("PRODUÇÃO 32 | OUTUBRO" = semana de 10/10). O fechado conta no mês da
-- PRODUÇÃO da linha: data = dia 10 do mês + 7 dias por produção depois da 1ª do
-- mês. Fechado do sistema com data em outro mês é re-datado (estimado).
--
-- SÓ A EQUIPE CONTA (dono, 24/10): linha cuja coluna A (atendente) não cita
-- Juliana, Matheus, Isadora, Giovana ou Luiz é de PARCEIRO e é ignorada (nem vai
-- para o espelho). Dupla com parceiro ("ANDRIO/MATHEUS") conta. A lista fica em
-- planilha_config.atendentes; erros de digitação conhecidos (METHEUS, MAHEUS) entram.
--
-- FLUXO: Apps Script na planilha (gatilho de 5 min) → edge fn planilha-fechados
-- (segredo) → planilha_sincronizar(org, linhas). A senha do INSS NUNCA sai da planilha.
--
-- SEGURANÇA DO RECÁLCULO:
--   * leitura parcial (planilha com < 80% das linhas da última leitura boa, ou < 300)
--     é recusada inteira — nada sai do Fechado por causa de uma leitura quebrada;
--   * só mexe na oportunidade MAIS RECENTE do contato no funil que tem a coluna ganho;
--   * lead criado mais de 21 dias DEPOIS da produção da linha é negócio novo → não fecha;
--   * tudo começa DESLIGADO (planilha_config.ativo = false). Ligar = 1º recálculo.
--   * backup do estado anterior de cada oportunidade mexida em planilha_movimentos.

-- ---------------------------------------------------------------- config
create table if not exists public.planilha_config (
  organizacao_id uuid primary key references public.organizacoes(id) on delete cascade,
  ativo boolean not null default false,          -- trava manual + aplica movimentos
  atendentes text[] not null default array['JULIANA','MATHEUS','METHEUS','MAHEUS','ISADORA','GIOVANA','LUIZ'],
  ultima_leitura_em timestamptz,
  ultimas_linhas int,
  atualizado_em timestamptz not null default now()
);
alter table public.planilha_config enable row level security;
drop policy if exists planilha_config_sel on public.planilha_config;
create policy planilha_config_sel on public.planilha_config for select to authenticated
  using (public.is_member(organizacao_id));

-- ---------------------------------------------------------------- espelho
-- Uma linha por cliente (chave = CPF; sem CPF válido, 'tel:'+chave canônica).
create table if not exists public.planilha_clientes (
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  chave text not null,
  cpf text,
  telefone_chave text,
  nome text,
  atendente text,
  producao int,
  mes int,                     -- mês da casa (10→10) do separador acima da linha
  producao_em timestamptz,     -- data estimada da semana de produção
  linha int,
  cor text,
  obs text,
  obs2 text,
  situacao text not null check (situacao in ('fechado','pendente','assinar','documentos','perdido','outro')),
  contato_id uuid references public.contatos(id) on delete set null,
  visto_em timestamptz not null default now(),
  fechado_visto_em timestamptz,
  atualizado_em timestamptz not null default now(),
  primary key (organizacao_id, chave)
);
create index if not exists idx_planilha_clientes_contato on public.planilha_clientes (contato_id) where contato_id is not null;
alter table public.planilha_clientes enable row level security;
drop policy if exists planilha_clientes_sel on public.planilha_clientes;
create policy planilha_clientes_sel on public.planilha_clientes for select to authenticated
  using (public.is_member(organizacao_id));

-- ---------------------------------------------------------------- movimentos (backup)
create table if not exists public.planilha_movimentos (
  id bigserial primary key,
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  oportunidade_id uuid not null,
  contato_id uuid,
  acao text not null,                 -- 'fechar' | 'reabrir' | 'perder' | 'redatar'
  situacao text,
  coluna_anterior_id uuid,
  status_anterior text,
  fechado_em_anterior timestamptz,
  coluna_nova_id uuid,
  fechado_em_novo timestamptz,
  criado_em timestamptz not null default now()
);
create index if not exists idx_planilha_mov_org on public.planilha_movimentos (organizacao_id, criado_em desc);
alter table public.planilha_movimentos enable row level security;
drop policy if exists planilha_mov_sel on public.planilha_movimentos;
create policy planilha_mov_sel on public.planilha_movimentos for select to authenticated
  using (public.is_member(organizacao_id));

create table if not exists public.planilha_sync_log (
  id bigserial primary key,
  organizacao_id uuid not null,
  executado_em timestamptz not null default now(),
  linhas int, clientes int, casados int,
  fechou int, reabriu int, perdeu int,
  erro text
);
alter table public.planilha_sync_log enable row level security;  -- sem policy: só service_role

-- ---------------------------------------------------------------- regra (fonte única)
create or replace function public.planilha_situacao(p_cor text, p_obs text, p_obs2 text)
returns text language sql immutable set search_path = public, pg_temp as $$
  select case
    when lower(coalesce(p_cor,'')) = '#ff0000' then 'perdido'
    when lower(coalesce(p_cor,'')) = '#0000ff' then 'documentos'
    when (lower(coalesce(p_cor,'')) in ('#ffff00','#00ff00')
          or (lower(coalesce(p_cor,'')) = '#38761d' and upper(btrim(coalesce(p_obs,''))) like 'ASSINADO%'))
      then case when upper(coalesce(p_obs2,'')) like '%BMG%' then 'pendente' else 'fechado' end
    when lower(coalesce(p_cor,'')) = '#38761d' and upper(btrim(coalesce(p_obs,''))) like 'ASSINAR%' then 'assinar'
    else 'outro' end
$$;

-- A linha é da equipe? Algum nome da coluna A ("JULIANA/TRAFEGO", "ANDRIO/MATHEUS") está na lista.
create or replace function public.planilha_e_da_equipe(p_atendente text, p_lista text[])
returns boolean language sql immutable set search_path = public, pg_temp as $$
  select exists (select 1 from regexp_split_to_table(upper(coalesce(p_atendente,'')), '[^A-ZÀ-Ú]+') t
                  where t = any(p_lista))
$$;

-- Mês da casa (10→10) de um instante: 09/10 é setembro, 10/10 é outubro.
create or replace function public.planilha_mes_caf(p_ts timestamptz)
returns date language sql immutable set search_path = public, pg_temp as $$
  select date_trunc('month', (p_ts at time zone 'America/Sao_Paulo') - interval '9 days')::date
$$;

-- Data de fechamento que a planilha manda: a da produção, dentro do mês da casa dela,
-- nunca antes da entrada do lead (se der no mesmo mês) e nunca no futuro.
create or replace function public.planilha_data_fechado(p_producao_em timestamptz, p_criado_em timestamptz)
returns timestamptz language sql stable set search_path = public, pg_temp as $$
  select least(
    case when planilha_mes_caf(p_criado_em) = planilha_mes_caf(p_producao_em)
         then greatest(p_producao_em, p_criado_em) else p_producao_em end,
    now())
$$;

-- ---------------------------------------------------------------- plano
-- O que o recálculo faria AGORA (sem aplicar). Usado pela prévia e pelo aplicador.
create or replace function public.planilha_plano(p_org uuid, p_backfill boolean default false)
returns table (oportunidade_id uuid, contato_id uuid, acao text, situacao text,
               coluna_atual_id uuid, coluna_destino_id uuid, fechado_em timestamptz, estimado boolean)
language sql stable security definer set search_path = public, pg_temp as $$
  with funil as (
    select fc.funil_id, fc.id as col_ganho
      from funil_colunas fc
     where fc.organizacao_id = p_org and fc.resultado = 'ganho' and not fc.arquivada
     order by fc.criado_em limit 1
  ), cols as (
    select f.funil_id, f.col_ganho,
      (select id from funil_colunas c where c.funil_id = f.funil_id and not c.arquivada and c.resultado = 'perdido' order by c.ordem limit 1) col_perdido,
      (select id from funil_colunas c where c.funil_id = f.funil_id and not c.arquivada and c.resultado = 'neutro' and upper(c.nome) like 'ASSINAR%' order by c.ordem limit 1) col_assinar,
      (select id from funil_colunas c where c.funil_id = f.funil_id and not c.arquivada and c.resultado = 'neutro' and (c.papel = 'producao' or upper(c.nome) like 'DOCUMENTO%') order by c.ordem limit 1) col_docs
    from funil f
  ), opp as (   -- oportunidade mais recente de cada contato nesse funil
    select distinct on (o.contato_id) o.id, o.contato_id, o.status, o.coluna_id, o.criado_em, o.fechado_em
      from oportunidades o, cols
     where o.organizacao_id = p_org and o.funil_id = cols.funil_id and o.contato_id is not null
     order by o.contato_id, o.criado_em desc
  ), pc as (    -- um registro da planilha por contato: o da linha mais de baixo
    select distinct on (p.contato_id) p.*
      from planilha_clientes p
     where p.organizacao_id = p_org and p.contato_id is not null
     order by p.contato_id, p.linha desc nulls last
  )
  -- entra no Fechado
  -- (no dia a dia, ASSINADO dentro do mês da produção fecha com a hora real)
  select o.id, o.contato_id, 'fechar', pc.situacao, o.coluna_id, cols.col_ganho,
         case when not p_backfill and planilha_mes_caf(now()) = planilha_mes_caf(pc.producao_em) then now()
              else planilha_data_fechado(pc.producao_em, o.criado_em) end,
         p_backfill or planilha_mes_caf(now()) <> planilha_mes_caf(pc.producao_em)
    from pc join opp o on o.contato_id = pc.contato_id cross join cols
   where pc.situacao = 'fechado' and o.status <> 'ganho' and pc.producao_em is not null
     and o.criado_em <= pc.producao_em + interval '21 days'
  union all
  -- já fechado, mas a data cai em outro mês da casa que o da produção: re-data
  select o.id, o.contato_id, 'redatar', pc.situacao, o.coluna_id, o.coluna_id,
         planilha_data_fechado(pc.producao_em, o.criado_em), true
    from pc join opp o on o.contato_id = pc.contato_id cross join cols
   where pc.situacao = 'fechado' and o.status = 'ganho' and o.coluna_id = cols.col_ganho
     and pc.producao_em is not null and o.criado_em <= pc.producao_em + interval '21 days'
     and planilha_mes_caf(o.fechado_em) <> planilha_mes_caf(pc.producao_em)
  union all
  -- sai do Fechado
  select o.id, o.contato_id,
         case when pc.situacao = 'perdido' then 'perder' else 'reabrir' end,
         coalesce(pc.situacao, 'fora_da_planilha'), o.coluna_id,
         case pc.situacao when 'perdido' then cols.col_perdido when 'documentos' then cols.col_docs
                          else cols.col_assinar end,
         null, false
    from opp o cross join cols
    left join pc on pc.contato_id = o.contato_id
   where o.status = 'ganho' and o.coluna_id = cols.col_ganho
     and coalesce(pc.situacao, 'fora') in ('fora', 'pendente', 'assinar', 'documentos', 'perdido')  -- 'outro' não mexe
$$;
revoke all on function public.planilha_plano(uuid, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------- aplicar
create or replace function public.planilha_aplicar(p_org uuid, p_backfill boolean default false)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r record; v_f int := 0; v_r int := 0; v_p int := 0; v_d int := 0;
begin
  perform set_config('app.fechamento_origem', 'planilha', true);
  for r in select pl.*, o.status as st_ant, o.fechado_em as fe_ant
             from planilha_plano(p_org, p_backfill) pl join oportunidades o on o.id = pl.oportunidade_id
            where pl.coluna_destino_id is not null
  loop
    insert into planilha_movimentos(organizacao_id, oportunidade_id, contato_id, acao, situacao,
                                    coluna_anterior_id, status_anterior, fechado_em_anterior, coluna_nova_id, fechado_em_novo)
    values (p_org, r.oportunidade_id, r.contato_id, r.acao, r.situacao,
            r.coluna_atual_id, r.st_ant::text, r.fe_ant, r.coluna_destino_id, r.fechado_em);
    if r.acao = 'redatar' then
      update oportunidades set fechado_em = r.fechado_em, fechado_em_estimado = true where id = r.oportunidade_id;
      v_d := v_d + 1;
    elsif r.acao = 'fechar' then
      update oportunidades set coluna_id = r.coluna_destino_id, fechado_em = r.fechado_em,
             fechado_em_estimado = r.estimado, fechado_por_id = null
       where id = r.oportunidade_id;
      v_f := v_f + 1;
    elsif r.acao = 'perder' then
      update oportunidades set coluna_id = r.coluna_destino_id, fechado_em = now(), fechado_em_estimado = false,
             motivo_perda = 'outro', motivo_perda_desc = 'Vermelho (perdido) na planilha CONTROLE ADM'
       where id = r.oportunidade_id;
      v_p := v_p + 1;
    else
      update oportunidades set coluna_id = r.coluna_destino_id,
             motivo_reabertura = 'Planilha CONTROLE ADM: ' || case r.situacao
               when 'assinar' then 'falta assinar' when 'documentos' then 'falta documentação'
               when 'pendente' then 'falta o BMG (OBS 2)'
               when 'fora_da_planilha' then 'cliente não está na planilha' else 'sem confirmação de assinatura' end
       where id = r.oportunidade_id;
      v_r := v_r + 1;
    end if;
  end loop;
  perform set_config('app.fechamento_origem', '', true);
  return jsonb_build_object('fechou', v_f, 'reabriu', v_r, 'perdeu', v_p, 'redatou', v_d);
end $$;
revoke all on function public.planilha_aplicar(uuid, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------- sincronizar (entrada da edge fn)
-- p_linhas: [{linha, producao, cor, obs, nome, cpf, telefone}] — a planilha INTEIRA.
create or replace function public.planilha_sincronizar(p_org uuid, p_linhas jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_n int := jsonb_array_length(coalesce(p_linhas,'[]'::jsonb));
        v_cfg planilha_config; v_res jsonb := '{}'::jsonb; v_cli int; v_cas int; v_primeira boolean;
begin
  insert into planilha_config(organizacao_id) values (p_org) on conflict do nothing;
  select * into v_cfg from planilha_config where organizacao_id = p_org for update;
  v_primeira := v_cfg.ultima_leitura_em is null;

  if v_n < 300 or (v_cfg.ultimas_linhas is not null and v_n < v_cfg.ultimas_linhas * 0.8) then
    insert into planilha_sync_log(organizacao_id, linhas, erro) values (p_org, v_n, 'leitura_incompleta');
    return jsonb_build_object('ok', false, 'erro', 'leitura_incompleta', 'linhas', v_n, 'esperado', v_cfg.ultimas_linhas);
  end if;

  create temp table _pl on commit drop as
  with bruto as (
    select (e->>'linha')::int linha, btrim(coalesce(e->>'atendente','')) atendente, nullif(e->>'producao','')::int producao,
           nullif(e->>'mes','')::int mes,
           lower(btrim(coalesce(e->>'cor',''))) cor, btrim(coalesce(e->>'obs','')) obs, btrim(coalesce(e->>'obs2','')) obs2,
           btrim(coalesce(e->>'nome','')) nome,
           lpad(nullif(regexp_replace(coalesce(e->>'cpf',''),'\D','','g'),''), 11, '0') cpf,
           chave_canonica_telefone(e->>'telefone') tel
      from jsonb_array_elements(p_linhas) e
  ), valido as (
    select *, case when length(cpf) = 11 then cpf when tel is not null then 'tel:' || tel end chave
      from bruto where nome <> '' and planilha_e_da_equipe(atendente, v_cfg.atendentes)
  )
  , datado as (   -- dia 10 do mês da casa + 1 semana por produção depois da 1ª do mês
    select v.*, case when v.mes is null then null else least(now(),
             make_timestamptz(extract(year from now() at time zone 'America/Sao_Paulo')::int
                                - case when v.mes > extract(month from now() at time zone 'America/Sao_Paulo') then 1 else 0 end,
                              v.mes, 10, 12, 0, 0, 'America/Sao_Paulo')
             + make_interval(days => 7 * greatest(0, coalesce(v.producao, 0)
                 - coalesce((select min(b.producao) from bruto b where b.mes = v.mes), 0)))) end producao_em
      from valido v
  )
  select distinct on (chave) *, planilha_situacao(cor, obs, obs2) situacao
    from datado where chave is not null
   order by chave, linha desc;

  -- casamento: CPF do contato → CPF da ficha judicial → telefone
  create temp table _ct on commit drop as
    select id, lpad(regexp_replace(cpf,'\D','','g'),11,'0') cpf, chave_canonica_telefone(telefone) tel, criado_em
      from contatos where organizacao_id = p_org;
  alter table _pl add column contato_id uuid;
  update _pl p set contato_id = (select c.id from _ct c where c.cpf = p.cpf order by c.criado_em desc limit 1)
   where length(p.cpf) = 11;
  update _pl p set contato_id = (select f.contato_id from fichas_judiciais f
                                  where f.organizacao_id = p_org and f.contato_id is not null
                                    and lpad(regexp_replace(coalesce(f.cpf,''),'\D','','g'),11,'0') = p.cpf
                                  order by f.criado_em desc limit 1)
   where p.contato_id is null and length(p.cpf) = 11;
  update _pl p set contato_id = (select c.id from _ct c where c.tel = p.tel order by c.criado_em desc limit 1)
   where p.contato_id is null and p.tel is not null;

  insert into planilha_clientes as t (organizacao_id, chave, cpf, telefone_chave, nome, atendente, producao, mes, producao_em, linha, cor, obs, obs2, situacao, contato_id, fechado_visto_em)
  select p_org, chave, nullif(cpf,''), tel, nome, atendente, producao, mes, producao_em, linha, cor, obs, obs2, situacao, contato_id,
         case when situacao = 'fechado' then now() end
    from _pl
  on conflict (organizacao_id, chave) do update set
    cpf = excluded.cpf, telefone_chave = excluded.telefone_chave, nome = excluded.nome, atendente = excluded.atendente,
    producao = excluded.producao, mes = excluded.mes, producao_em = excluded.producao_em, linha = excluded.linha, cor = excluded.cor, obs = excluded.obs, obs2 = excluded.obs2,
    situacao = excluded.situacao, contato_id = excluded.contato_id,
    fechado_visto_em = case when excluded.situacao = 'fechado' then coalesce(t.fechado_visto_em, now()) end,
    atualizado_em = now();
  delete from planilha_clientes t where t.organizacao_id = p_org
     and not exists (select 1 from _pl p where p.chave = t.chave);

  select count(*), count(contato_id) into v_cli, v_cas from _pl;
  update planilha_config set ultima_leitura_em = now(), ultimas_linhas = v_n, atualizado_em = now()
   where organizacao_id = p_org;

  if v_cfg.ativo then
    v_res := planilha_aplicar(p_org, false);
  end if;

  insert into planilha_sync_log(organizacao_id, linhas, clientes, casados, fechou, reabriu, perdeu)
  values (p_org, v_n, v_cli, v_cas, (v_res->>'fechou')::int, (v_res->>'reabriu')::int, (v_res->>'perdeu')::int);
  return jsonb_build_object('ok', true, 'linhas', v_n, 'clientes', v_cli, 'casados', v_cas, 'ativo', v_cfg.ativo) || v_res;
end $$;
revoke all on function public.planilha_sincronizar(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.planilha_sincronizar(uuid, jsonb) to service_role;

-- Ligar = 1º recálculo (datas estimadas pela produção) + trava. Só service_role/SQL.
create or replace function public.planilha_ligar(p_org uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v jsonb;
begin
  if not exists (select 1 from planilha_config where organizacao_id = p_org and ultima_leitura_em > now() - interval '1 hour') then
    raise exception 'planilha_sem_leitura_recente';
  end if;
  v := planilha_aplicar(p_org, true);
  update planilha_config set ativo = true, atualizado_em = now() where organizacao_id = p_org;
  return v;
end $$;
revoke all on function public.planilha_ligar(uuid) from public, anon, authenticated;

-- Situação de leitura para o selo do dashboard (qualquer membro).
create or replace function public.planilha_status(p_org uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select case when not public.is_member(p_org) then null else
    jsonb_build_object('ativo', coalesce(c.ativo,false), 'ultima_leitura_em', c.ultima_leitura_em,
                       'fechados_planilha', (select count(*) from planilha_clientes p where p.organizacao_id = p_org and p.situacao = 'fechado'))
  end
  from (select 1) x left join planilha_config c on c.organizacao_id = p_org
$$;
revoke all on function public.planilha_status(uuid) from public, anon;
grant execute on function public.planilha_status(uuid) to authenticated;

-- ---------------------------------------------------------------- trava no gatilho
-- Cópia da versão VIVA de opp_sync_fechamento (24/10) + a trava no topo.
create or replace function public.opp_sync_fechamento()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_novo text; v_antigo text; v_uid uuid := auth.uid();
begin
  if NEW.coluna_id is not distinct from OLD.coluna_id then return NEW; end if;
  select coalesce(resultado,'neutro') into v_novo from public.funil_colunas where id = NEW.coluna_id;
  select coalesce(resultado,'neutro') into v_antigo from public.funil_colunas where id = OLD.coluna_id;
  v_novo := coalesce(v_novo,'neutro'); v_antigo := coalesce(v_antigo,'neutro');
  if v_novo = v_antigo then return NEW; end if;
  -- 24/10: com a planilha ligada, só ela põe ou tira do Fechado.
  if (v_novo = 'ganho' or v_antigo = 'ganho')
     and coalesce(current_setting('app.fechamento_origem', true), '') <> 'planilha'
     and exists (select 1 from public.planilha_config pc where pc.organizacao_id = NEW.organizacao_id and pc.ativo) then
    raise exception 'fechado_pela_planilha' using errcode = 'check_violation';
  end if;
  if v_novo = 'ganho' then
    NEW.status := 'ganho'; NEW.fechado_em := coalesce(NEW.fechado_em, now()); NEW.fechado_por_id := coalesce(NEW.fechado_por_id, v_uid);
    NEW.responsavel_no_fechamento_id := NEW.responsavel_id; NEW.motivo_perda := null; NEW.motivo_perda_desc := null;
    NEW.motivo_nao_elegivel := null;
    insert into public.oportunidade_eventos(organizacao_id,oportunidade_id,evento,coluna_anterior_id,coluna_nova_id,status_anterior,status_novo,resultado_anterior,resultado_novo,responsavel_no_fechamento_id,executado_por)
      values (NEW.organizacao_id,NEW.id,'ganho',OLD.coluna_id,NEW.coluna_id,OLD.status,'ganho',v_antigo,'ganho',NEW.responsavel_id,v_uid);
  elsif v_novo = 'perdido' then
    if NEW.motivo_perda is null then raise exception 'motivo_perda_obrigatorio' using errcode='check_violation'; end if;
    if NEW.motivo_perda='outro' and coalesce(btrim(NEW.motivo_perda_desc),'')='' then raise exception 'motivo_perda_desc_obrigatorio' using errcode='check_violation'; end if;
    if NEW.motivo_perda is distinct from 'nao_elegivel' then NEW.motivo_nao_elegivel := null; end if;
    NEW.status := 'perdido'; NEW.fechado_em := coalesce(NEW.fechado_em, now()); NEW.fechado_por_id := coalesce(NEW.fechado_por_id, v_uid);
    NEW.responsavel_no_fechamento_id := NEW.responsavel_id;
    insert into public.oportunidade_eventos(organizacao_id,oportunidade_id,evento,coluna_anterior_id,coluna_nova_id,status_anterior,status_novo,resultado_anterior,resultado_novo,motivo_perda,responsavel_no_fechamento_id,executado_por)
      values (NEW.organizacao_id,NEW.id,'perdido',OLD.coluna_id,NEW.coluna_id,OLD.status,'perdido',v_antigo,'perdido',NEW.motivo_perda,NEW.responsavel_id,v_uid);
  elsif v_antigo in ('ganho','perdido') and v_novo = 'neutro' then
    if coalesce(btrim(NEW.motivo_reabertura),'')='' then raise exception 'motivo_reabertura_obrigatorio' using errcode='check_violation'; end if;
    insert into public.oportunidade_eventos(organizacao_id,oportunidade_id,evento,coluna_anterior_id,coluna_nova_id,status_anterior,status_novo,resultado_anterior,resultado_novo,motivo_reabertura,executado_por)
      values (NEW.organizacao_id,NEW.id,'reaberto',OLD.coluna_id,NEW.coluna_id,OLD.status,'em_andamento',v_antigo,'neutro',NEW.motivo_reabertura,v_uid);
    NEW.status := 'em_andamento'; NEW.fechado_em := null; NEW.fechado_por_id := null; NEW.responsavel_no_fechamento_id := null;
    NEW.motivo_perda := null; NEW.motivo_perda_desc := null; NEW.motivo_reabertura := null;
    NEW.motivo_nao_elegivel := null;
  end if;
  return NEW;
end $function$;
