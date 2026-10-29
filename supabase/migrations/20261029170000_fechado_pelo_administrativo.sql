-- Fechado pelo ADMINISTRATIVO — pedido do dono 29/10/2026 ("ele manda em tudo").
--
-- O sistema do administrativo (outro Supabase, do escritório) publica a lista dos
-- clientes COMPLETOS em GET .../functions/v1/caf-fechados (chave no cabeçalho
-- x-api-key): nome, CPF, telefone e a data em que ficou completo. Completo lá =
-- fechado aqui, com a data de lá. Fechado aqui que não está completo lá sai do
-- Fechado e volta para "Assinar". Substitui a planilha CONTROLE ADM (20261024160000,
-- que nunca chegou a ler a planilha e segue desligada).
--
-- FLUXO: cron (5 min) → edge fn adm-fechados (segredo em webhook_config) → GET na
-- API com ADM_API_KEY → adm_sincronizar(org, fechados) → espelho adm_fechados →
-- (se ligado) adm_aplicar.
--
-- SEGURANÇA DO RECÁLCULO:
--   * leitura com menos de 100 completos, ou com menos de 90% da última leitura boa,
--     é recusada inteira — nada sai do Fechado por causa de uma leitura quebrada;
--   * fecha a oportunidade do completo: a mais recente do contato (no funil que tem a
--     coluna ganho) que nasceu até 21 dias depois dele; depois disso é negócio novo;
--   * adm_config.protege_antes: fechado daqui com data anterior fica como está
--     (o administrativo só tem casos desde 24/08/2026);
--   * só um card por contato pode ficar aberto no funil (uq_oport_aberta_contato_funil):
--     quem sai do Fechado com cards repetidos volta com o mais recente; os outros são
--     arquivados (status 'cancelado', o mesmo "Arquivar" do Kanban);
--   * quem sai do Fechado segue protegido dos robôs como cliente fechado (adm_saiu_do_fechado);
--   * tudo começa DESLIGADO (adm_config.ativo = false): só o espelho é atualizado.
--     Ligar = 1º recálculo + trava. Backup de cada oportunidade mexida em adm_movimentos.

-- ---------------------------------------------------------------- config
create table if not exists public.adm_config (
  organizacao_id uuid primary key references public.organizacoes(id) on delete cascade,
  ativo boolean not null default false,          -- trava manual + aplica movimentos
  protege_antes timestamptz,                     -- fechado daqui antes disso não sai do Fechado
  ultima_leitura_em timestamptz,
  ultimos_completos int,
  atualizado_em timestamptz not null default now()
);
alter table public.adm_config enable row level security;
drop policy if exists adm_config_sel on public.adm_config;
create policy adm_config_sel on public.adm_config for select to authenticated
  using (public.is_member(organizacao_id));

-- ---------------------------------------------------------------- espelho
-- Um registro por cliente completo (chave = CPF; sem CPF válido, 'tel:'+chave canônica).
create table if not exists public.adm_fechados (
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  chave text not null,
  cpf text,
  telefone_chave text,
  nome text,
  fechado_em timestamptz,      -- quando ficou completo no administrativo
  contato_id uuid,
  visto_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  primary key (organizacao_id, chave)
);
create index if not exists idx_adm_fechados_contato on public.adm_fechados (contato_id) where contato_id is not null;
alter table public.adm_fechados enable row level security;
drop policy if exists adm_fechados_sel on public.adm_fechados;
create policy adm_fechados_sel on public.adm_fechados for select to authenticated
  using (public.is_member(organizacao_id));

-- ---------------------------------------------------------------- movimentos (backup)
create table if not exists public.adm_movimentos (
  id bigserial primary key,
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  oportunidade_id uuid not null,
  contato_id uuid,
  acao text not null,                 -- 'fechar' | 'reabrir' | 'arquivar' | 'redatar'
  coluna_anterior_id uuid,
  status_anterior text,
  fechado_em_anterior timestamptz,
  coluna_nova_id uuid,
  fechado_em_novo timestamptz,
  criado_em timestamptz not null default now()
);
create index if not exists idx_adm_mov_org on public.adm_movimentos (organizacao_id, criado_em desc);
alter table public.adm_movimentos enable row level security;
drop policy if exists adm_mov_sel on public.adm_movimentos;
create policy adm_mov_sel on public.adm_movimentos for select to authenticated
  using (public.is_member(organizacao_id));

create table if not exists public.adm_sync_log (
  id bigserial primary key,
  organizacao_id uuid,
  executado_em timestamptz not null default now(),
  completos int, casados int,
  fechou int, reabriu int, arquivou int, redatou int,
  erro text
);
alter table public.adm_sync_log enable row level security;  -- sem policy: só service_role

-- Nome para comparação: sem acento, maiúsculo, espaços simples.
create or replace function public.adm_nome_chave(p_nome text)
returns text language sql immutable set search_path = public, pg_temp as $$
  select nullif(btrim(regexp_replace(upper(translate(coalesce(p_nome,''),
    'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
    'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN')), '[^A-Z]+', ' ', 'g')), '')
$$;

-- ---------------------------------------------------------------- plano
-- O que o recálculo faria AGORA (sem aplicar). Usado pela prévia e pelo aplicador.
-- Uma oportunidade é "confirmada" quando o contato está completo lá e ela nasceu até
-- 21 dias depois do completo (depois disso é negócio novo): só ela fecha ou é re-datada.
-- Sai do Fechado só quem não está completo lá de jeito nenhum.
create or replace function public.adm_plano(p_org uuid)
returns table (oportunidade_id uuid, contato_id uuid, acao text,
               coluna_atual_id uuid, coluna_destino_id uuid, fechado_em timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
  with funil as (
    select fc.funil_id, fc.id as col_ganho
      from funil_colunas fc
     where fc.organizacao_id = p_org and fc.resultado = 'ganho' and not fc.arquivada
     order by fc.criado_em limit 1
  ), cols as (
    select f.funil_id, f.col_ganho,
      (select id from funil_colunas c where c.funil_id = f.funil_id and not c.arquivada and c.resultado = 'neutro'
          and upper(c.nome) like 'ASSINAR%' order by c.ordem limit 1) col_assinar
    from funil f
  ), protecao as (
    select max(protege_antes) as antes from adm_config where organizacao_id = p_org
  ), af as (     -- um completo por contato: o mais recente
    select distinct on (a.contato_id) a.contato_id, a.fechado_em
      from adm_fechados a
     where a.organizacao_id = p_org and a.contato_id is not null and a.fechado_em is not null
     order by a.contato_id, a.fechado_em desc
  ), opp as (    -- todas as oportunidades do funil, com o completo do contato (se houver)
    select o.id, o.contato_id, o.status, o.coluna_id, o.criado_em, o.fechado_em,
           af.fechado_em as adm_em,
           (af.contato_id is not null and o.criado_em <= af.fechado_em + interval '21 days') as confirmada
      from oportunidades o cross join cols
      left join af on af.contato_id = o.contato_id
     where o.organizacao_id = p_org and o.funil_id = cols.funil_id and o.contato_id is not null
  ), alvo as (   -- a oportunidade do completo: a mais recente que nasceu até 21 dias depois dele
    select distinct on (o.contato_id) o.*
      from opp o where o.confirmada
     order by o.contato_id, o.criado_em desc
  )
  -- entra no Fechado: a oportunidade do completo, se nenhuma do contato já está no Fechado
  select o.id, o.contato_id, 'fechar', o.coluna_id, cols.col_ganho, o.adm_em
    from alvo o cross join cols
   where o.status <> 'ganho'
     and not exists (select 1 from opp g where g.contato_id = o.contato_id
                       and g.status = 'ganho' and g.coluna_id = cols.col_ganho)
  union all
  -- já fechado e confirmado, mas em outro dia: vale a data do administrativo
  select o.id, o.contato_id, 'redatar', o.coluna_id, o.coluna_id, o.adm_em
    from opp o cross join cols
   where o.confirmada and o.status = 'ganho' and o.coluna_id = cols.col_ganho
     and (o.fechado_em at time zone 'America/Sao_Paulo')::date
         is distinct from (o.adm_em at time zone 'America/Sao_Paulo')::date
  union all
  -- sai do Fechado: o contato não está completo lá (fora o histórico protegido). Só um card
  -- por contato pode ficar aberto no funil: o mais recente volta para Assinar; os repetidos
  -- (ou todos, se o contato já tem card aberto) são arquivados.
  select s.id, s.contato_id, case when s.volta then 'reabrir' else 'arquivar' end,
         s.coluna_id, case when s.volta then s.col_assinar else s.coluna_id end, null::timestamptz
    from (select o.id, o.contato_id, o.coluna_id, cols.col_assinar,
                 row_number() over (partition by o.contato_id order by o.criado_em desc, o.id) = 1
                 and not exists (select 1 from opp a where a.contato_id = o.contato_id
                                   and a.status = 'em_andamento') as volta
            from opp o cross join cols cross join protecao p
           where o.adm_em is null and o.status = 'ganho' and o.coluna_id = cols.col_ganho
             and (p.antes is null or o.fechado_em is null or o.fechado_em >= p.antes)) s
$$;
revoke all on function public.adm_plano(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- aplicar
create or replace function public.adm_aplicar(p_org uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r record; v_f int := 0; v_r int := 0; v_a int := 0; v_d int := 0;
begin
  perform set_config('app.fechamento_origem', 'administrativo', true);
  for r in select pl.*, o.status as st_ant, o.fechado_em as fe_ant
             from adm_plano(p_org) pl join oportunidades o on o.id = pl.oportunidade_id
            where pl.coluna_destino_id is not null
  loop
    insert into adm_movimentos(organizacao_id, oportunidade_id, contato_id, acao,
                               coluna_anterior_id, status_anterior, fechado_em_anterior, coluna_nova_id, fechado_em_novo)
    values (p_org, r.oportunidade_id, r.contato_id, r.acao,
            r.coluna_atual_id, r.st_ant::text, r.fe_ant, r.coluna_destino_id, r.fechado_em);
    if r.acao = 'redatar' then
      update oportunidades set fechado_em = r.fechado_em, fechado_em_estimado = false where id = r.oportunidade_id;
      v_d := v_d + 1;
    elsif r.acao = 'fechar' then
      -- status explícito: um card arquivado que já está na coluna Fechado não passa pelo gatilho
      update oportunidades set coluna_id = r.coluna_destino_id, status = 'ganho', fechado_em = r.fechado_em,
             fechado_em_estimado = false, fechado_por_id = null
       where id = r.oportunidade_id;
      v_f := v_f + 1;
    elsif r.acao = 'arquivar' then
      update oportunidades set status = 'cancelado' where id = r.oportunidade_id;
      v_a := v_a + 1;
    else
      update oportunidades set coluna_id = r.coluna_destino_id,
             motivo_reabertura = 'Administrativo: o cliente não está como completo no sistema do administrativo'
       where id = r.oportunidade_id;
      v_r := v_r + 1;
    end if;
  end loop;
  perform set_config('app.fechamento_origem', '', true);
  return jsonb_build_object('fechou', v_f, 'reabriu', v_r, 'arquivou', v_a, 'redatou', v_d);
end $$;
revoke all on function public.adm_aplicar(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- sincronizar (entrada da edge fn)
-- p_fechados: [{cpf, telefone, nome, fechado_em}] — a lista INTEIRA de completos.
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

-- Ligar = 1º recálculo + trava. Só service_role/SQL.
create or replace function public.adm_ligar(p_org uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v jsonb;
begin
  if not exists (select 1 from adm_config where organizacao_id = p_org and ultima_leitura_em > now() - interval '1 hour') then
    raise exception 'administrativo_sem_leitura_recente';
  end if;
  v := adm_aplicar(p_org);
  update adm_config set ativo = true, atualizado_em = now() where organizacao_id = p_org;
  return v;
end $$;
revoke all on function public.adm_ligar(uuid) from public, anon, authenticated;

-- Situação da leitura para o selo do dashboard e a trava da tela (qualquer membro).
create or replace function public.adm_status(p_org uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select case when not public.is_member(p_org) then null else
    jsonb_build_object('ativo', coalesce(c.ativo,false), 'ultima_leitura_em', c.ultima_leitura_em,
                       'completos', (select count(*) from adm_fechados a where a.organizacao_id = p_org))
  end
  from (select 1) x left join adm_config c on c.organizacao_id = p_org
$$;
revoke all on function public.adm_status(uuid) from public, anon;
grant execute on function public.adm_status(uuid) to authenticated;

-- ---------------------------------------------------------------- trava no gatilho
-- Cópia da versão VIVA de opp_sync_fechamento (29/10, já com a trava da planilha)
-- + a trava do administrativo.
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
  -- 29/10: com o administrativo ligado, só ele põe ou tira do Fechado.
  if (v_novo = 'ganho' or v_antigo = 'ganho')
     and coalesce(current_setting('app.fechamento_origem', true), '') <> 'administrativo'
     and exists (select 1 from public.adm_config ac where ac.organizacao_id = NEW.organizacao_id and ac.ativo) then
    raise exception 'fechado_pelo_administrativo' using errcode = 'check_violation';
  end if;
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

-- Arquivar (status 'cancelado' direto, sem trocar de coluna) também não tira do Fechado,
-- nem status direto põe nele. Só dispara quando o UPDATE escreve status (o Kanban move
-- card mexendo só em coluna_id; o gatilho acima cuida disso).
create or replace function public.adm_trava_status()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if NEW.status is distinct from OLD.status and 'ganho' in (OLD.status::text, NEW.status::text)
     and coalesce(current_setting('app.fechamento_origem', true), '') <> 'administrativo'
     and exists (select 1 from adm_config ac where ac.organizacao_id = NEW.organizacao_id and ac.ativo) then
    raise exception 'fechado_pelo_administrativo' using errcode = 'check_violation';
  end if;
  return NEW;
end $$;
drop trigger if exists trg_adm_trava_status on public.oportunidades;
create trigger trg_adm_trava_status before update of status on public.oportunidades
  for each row execute function public.adm_trava_status();

-- ---------------------------------------------------------------- robôs (dono 29/10: "Sim, proteger")
-- Quem o administrativo tira do Fechado (volta para Assinar ou tem card repetido arquivado)
-- continua protegido como cliente fechado: o robô do anúncio não recomeça o atendimento, a
-- retomada e o follow-up de 6h do JUROS não falam com ele, e sequência na fila é cancelada.
-- As 5 funções abaixo são cópias das versões VIVAS de 29/10 + uma condição cada; se alguma
-- mudou desde então, a migration para aqui (refazer a cópia).
create index if not exists idx_adm_mov_contato on public.adm_movimentos (contato_id)
  where acao in ('reabrir','arquivar');

create or replace function public.adm_saiu_do_fechado(p_contato uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from adm_movimentos m
                   where m.contato_id = p_contato and m.acao in ('reabrir','arquivar'))
$$;
revoke all on function public.adm_saiu_do_fechado(uuid) from public, anon;
grant execute on function public.adm_saiu_do_fechado(uuid) to authenticated, service_role;

do $$
declare v record;
begin
  for v in select * from (values
    ('public.anuncio_fluxo_zero_candidatos(timestamp with time zone,interval,integer)', '3461a2f4ea85198d349010346f2b124a'),
    ('public.retomada_atendimento_candidatos(timestamp with time zone,interval,integer)', '177bc81d96b1798f136ce0eef3726e18'),
    ('public.juros_auto_prosseguir_6h(integer)', '602ad68b2dd3cc3599de01b6fda54438'),
    ('public.emprestimo_pos_fluxo_motivo_fora(uuid)', '1f16c10873fde083404f0c12d3bf688f'),
    ('public.juros_iniciar_caso_motivo_fora(uuid)', '2b8367e0c4ce2cae92001d47245e83d5')
  ) x(f, m) loop
    if (select md5(prosrc) from pg_proc where oid = v.f::regprocedure) is distinct from v.m then
      raise exception 'A função % mudou depois de 29/10: refaça a cópia antes de aplicar', v.f;
    end if;
  end loop;
end $$;

CREATE OR REPLACE FUNCTION public.anuncio_fluxo_zero_candidatos(p_agora timestamp with time zone DEFAULT now(), p_espera interval DEFAULT '00:02:00'::interval, p_limite integer DEFAULT 300)
 RETURNS TABLE(conversa_id uuid, organizacao_id uuid, canal_id uuid, contato_id uuid, mensagem_id uuid, ad_em timestamp with time zone, motivo text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with par as (
    select array['e85ab4e4-931e-4da9-932b-30541f9e007b','c839e143-4aaf-4be1-ac18-a863d0804da2',
                 'fc80ec9e-9f8f-4dca-a3f0-e1101d73e117']::uuid[] as canais
  ),
  base as (
    select c.id, c.organizacao_id, c.canal_id, c.contato_id, ad.id as ad_id, ad.criado_em as ad_em
      from public.conversas c, par
      cross join lateral (
        select m.id, m.criado_em
          from public.mensagens m
         where m.conversa_id = c.id and m.direcao = 'entrada'
           and m.criado_em > p_agora - interval '96 hours' and m.criado_em <= p_agora - p_espera
           and public.anuncio_mensagem_e_anuncio(m.conteudo, m.metadados)
           and not exists (select 1 from public.mensagens s
                            where s.conversa_id = c.id and s.direcao = 'saida'
                              and s.tipo::text not in ('sistema','nota_interna')
                              and coalesce(s.status::text,'') <> 'falhou'
                              and s.criado_em > m.criado_em)
         order by m.criado_em desc limit 1) ad
     where c.canal_id = any(par.canais)
       and c.status::text <> 'fechada'
       and c.ultima_interacao_em > p_agora - interval '96 hours'
  )
  select b.id, b.organizacao_id, b.canal_id, b.contato_id, b.ad_id, b.ad_em,
    case
      when exists (select 1 from public.wa_optout w where w.contato_id = b.contato_id) then 'optout'
      when public.fn_ddd_fora_rs(b.contato_id) then 'fora_rs'
      when exists (select 1 from public.oportunidades o
                    where o.contato_id = b.contato_id and o.organizacao_id = b.organizacao_id
                      and o.status = 'ganho')
           -- 29/10: quem o administrativo tirou do Fechado segue protegido como cliente fechado
           or public.adm_saiu_do_fechado(b.contato_id) then 'cliente_fechado'
      when exists (select 1 from public.oportunidades o
                    where o.contato_id = b.contato_id and o.organizacao_id = b.organizacao_id
                      and o.status in ('perdido','cancelado'))
           and not exists (select 1 from public.oportunidades o2
                    where o2.contato_id = b.contato_id and o2.organizacao_id = b.organizacao_id
                      and o2.status = 'em_andamento') then 'nao_elegivel'
      when exists (select 1 from public.ia_sessoes s where s.conversa_id = b.id
                     and s.dados->>'desativado_manual' = 'true') then 'ia_desligada_pelo_atendente'
      -- atendente HUMANO de verdade na última 1 h (mensagens de automação agendada não contam)
      when exists (select 1 from public.mensagens hm
                    where hm.conversa_id = b.id and hm.direcao = 'saida'
                      and hm.criado_em > p_agora - interval '60 minutes'
                      and ((hm.autor_id is not null and hm.tipo::text not in ('sistema','nota_interna')
                            and hm.metadados->>'agendamento_id' is null)
                           or (hm.autor_id is null and hm.origem::text = 'telefone'))) then 'humano_ativo_agora'
      when exists (select 1 from public.retomada_atendimento_log rl
                    where rl.conversa_id = b.id and rl.rota = 'fluxo_zero' and rl.decisao = 'retomada'
                      and rl.criado_em > p_agora - interval '24 hours') then 'ja_reiniciado_24h'
      else null
    end
    from base b
   order by b.ad_em
   limit greatest(1, p_limite)
$function$;

CREATE OR REPLACE FUNCTION public.retomada_atendimento_candidatos(p_agora timestamp with time zone DEFAULT now(), p_espera interval DEFAULT '00:08:00'::interval, p_limite integer DEFAULT 200)
 RETURNS TABLE(conversa_id uuid, organizacao_id uuid, canal_id uuid, mensagem_id uuid, burst_inicio timestamp with time zone, ultima_em timestamp with time zone, rota text, motivo text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with canais as (
    select array['e85ab4e4-931e-4da9-932b-30541f9e007b','c839e143-4aaf-4be1-ac18-a863d0804da2',
                 'fc80ec9e-9f8f-4dca-a3f0-e1101d73e117']::uuid[] as tres,
           'fc80ec9e-9f8f-4dca-a3f0-e1101d73e117'::uuid as juros
  ),
  base as (
    select c.id, c.organizacao_id, c.canal_id, c.contato_id, c.precisa_humano, c.arquivada_em, c.arquivada_por
      from public.conversas c, canais k
     where c.canal_id = any(k.tres)
       and c.status::text <> 'fechada'
       and c.ultima_interacao_em >= p_agora - interval '7 days'
  ),
  ult as (
    -- última mensagem REAL (não sistema/nota) da conversa
    select b.*, u.direcao, u.criado_em as u_criado, u.enviada_em as u_env, u.id as u_id
      from base b
      cross join lateral (
        select m.id, m.direcao, m.criado_em, m.enviada_em
          from public.mensagens m
         where m.conversa_id = b.id and m.enviada_em <= p_agora
           and m.tipo::text not in ('sistema','nota_interna')
           and coalesce(m.status::text,'') <> 'falhou'
         order by m.enviada_em desc limit 1) u
  ),
  espera as (
    select * from ult
     where direcao = 'entrada'
       and u_env <= p_agora - p_espera
       and u_env >= p_agora - interval '7 days'
       -- dono 22/10 16:49: daqui pra FRENTE — só mensagem recebida depois deste corte dispara
       and u_env >= '2026-10-22 19:49:48+00'::timestamptz
  ),
  julgada as (
    select e.*, s.id as sessao_id, s.status as s_status, s.etapa as s_etapa, s.dados as s_dados,
      (select min(m2.criado_em) from public.mensagens m2
        where m2.conversa_id = e.id and m2.direcao = 'entrada'
          and m2.tipo::text not in ('sistema','nota_interna')
          and m2.enviada_em > coalesce((select max(m3.enviada_em) from public.mensagens m3
                                         where m3.conversa_id = e.id and m3.direcao = 'saida'
                                           and m3.tipo::text not in ('sistema','nota_interna')
                                           and m3.enviada_em <= e.u_env), '-infinity'::timestamptz)
      ) as burst_inicio,
      case
        when exists (select 1 from public.wa_optout w where w.contato_id = e.contato_id) then 'optout'
        when public.fn_ddd_fora_rs(e.contato_id) then 'fora_rs'
        when exists (select 1 from public.oportunidades o
                      where o.contato_id = e.contato_id and o.organizacao_id = e.organizacao_id
                        and o.status = 'ganho')
             -- 29/10: quem o administrativo tirou do Fechado segue protegido como cliente fechado
             or public.adm_saiu_do_fechado(e.contato_id) then 'cliente_fechado'
        -- dono 22/10 16:49 ("muito importante"): não elegível/perdido NÃO recebe mensagem automática.
        -- Card ativo (em_andamento) existente = lead ativo, pode; só perdido/cancelado = fica quieto.
        when exists (select 1 from public.oportunidades o
                      where o.contato_id = e.contato_id and o.organizacao_id = e.organizacao_id
                        and o.status in ('perdido','cancelado'))
             and not exists (select 1 from public.oportunidades o2
                      where o2.contato_id = e.contato_id and o2.organizacao_id = e.organizacao_id
                        and o2.status = 'em_andamento') then 'nao_elegivel_perdido'
        when e.arquivada_em is not null and e.arquivada_por is not null and e.arquivada_em > e.u_env then 'arquivada_por_humano'
        when exists (select 1 from public.oportunidades o
                      where o.contato_id = e.contato_id and o.organizacao_id = e.organizacao_id
                        and o.status in ('perdido','cancelado') and o.fechado_por_id is not null
                        and o.fechado_em > e.u_env) then 'fechado_na_mao_depois'
        -- dono 22/10 17:1x: SÓ CLIENTE NOVO — se um humano JÁ mandou qualquer mensagem nesta
        -- conversa, ela é de atendimento, não de automação. Fica quieta.
        when exists (select 1 from public.mensagens hm
                      where hm.conversa_id = e.id and hm.direcao = 'saida'
                        and ((hm.autor_id is not null and hm.tipo::text not in ('sistema','nota_interna'))
                             or (hm.autor_id is null and hm.origem::text = 'telefone'))) then 'ja_atendido_por_humano'
        when s.id is null then 'rota_robo'
        when s.dados->>'desativado_manual' = 'true' then 'ia_desligada_pelo_atendente'
        when s.dados->>'aguardando_humano' = 'representacao' then 'representacao'
        when s.status = 'ativa' then 'ia_ja_ativa'
        when s.dados->>'ne_origem' = 'familia_sem_resposta'
             and coalesce((s.dados->>'ne_reaberturas')::int, 0) < 3 then 'ne_familia_tick_reabre'
        when e.canal_id = (select juros from canais) and s.etapa <> 'juros_beneficio' then 'juros_fora_da_etapa'
        when (s.dados->>'retomada_auto_em')::timestamptz > p_agora - interval '24 hours' then 'cooldown_24h'
        when coalesce((s.dados->>'retomada_n')::int, 0) >= 3 then 'teto_3_retomadas'
        else null
      end as motivo
      from espera e
      left join public.ia_sessoes s on s.conversa_id = e.id
  )
  select j.id, j.organizacao_id, j.canal_id, j.u_id, j.burst_inicio, j.u_env,
         case when j.motivo = 'rota_robo' then 'robo_fase_b' when j.motivo is null then 'ia' end as rota,
         j.motivo
    from julgada j
   order by j.u_env
   limit greatest(1, p_limite)
$function$;

CREATE OR REPLACE FUNCTION public.juros_auto_prosseguir_6h(p_limite integer DEFAULT 15)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_canal constant uuid := 'fc80ec9e-9f8f-4dca-a3f0-e1101d73e117';
  v_matheus constant uuid := '4ac197b4-9600-4756-81aa-1ac29280df09';
  v_org constant uuid := 'de300000-0000-4000-8000-000000000001';
  v_audio constant text := 'de300000-0000-4000-8000-000000000001/wa-midia/a5fc4077-62fa-4429-ba94-0194c9f92c8b-prosseguir_6h.ogg';
  v_tam constant bigint := 286694;
  v_hora int := extract(hour from now() at time zone 'America/Sao_Paulo');
  v_n int := 0;
  v_det text;
  r record;
begin
  if v_hora < 8 or v_hora >= 20 then return 0; end if;
  -- uma rodada por vez (cron + chamada manual não duplicam)
  if not pg_try_advisory_xact_lock(hashtext('juros_auto_prosseguir_6h')) then return 0; end if;

  for r in
    select c.id conversa_id, c.contato_id
    from public.bot_conversa_estado e
    join public.conversas c on c.id = e.conversa_id
    left join public.contatos ct on ct.id = c.contato_id
    where e.canal_id = v_canal and c.atendente_id = v_matheus
      -- benefício do INSS (20/10): esperando a resposta (o timeout de 10 min fecha) ou com a IA perguntando do parente
      and coalesce(e.dados_qualificacao->>'passo_video','') not in ('fim','recusado','aguardando_beneficio','sem_beneficio')
      and not coalesce(c.precisa_humano, false)
      and substring(regexp_replace(coalesce(ct.telefone,''),'\D','','g') from 3 for 2) in ('51','53','54','55')
      and not exists (select 1 from public.wa_optout w where w.contato_id = c.contato_id)
      -- 29/10: quem o administrativo tirou do Fechado segue protegido como cliente fechado
      and not public.adm_saiu_do_fechado(c.contato_id)
      -- já recebeu este follow-up ou qualquer disparo em massa
      and not exists (select 1 from public.mensagens_agendadas a where a.conversa_id = c.id and a.metadados ? 'disparo_lote')
      -- nenhuma mensagem humana (painel ou celular) fora de agendamentos
      and not exists (select 1 from public.mensagens m where m.conversa_id = c.id and m.direcao = 'saida'
                        and m.origem in ('atenvo','telefone') and coalesce(m.status::text,'') <> 'falhou'
                        and m.metadados->>'agendamento_id' is null)
      -- o robô falou e o cliente ficou sem responder há 6h ou mais
      and exists (select 1 from public.mensagens m where m.conversa_id = c.id and m.direcao = 'saida' and m.origem = 'bot')
      and (select m.direcao::text from public.mensagens m where m.conversa_id = c.id and coalesce(m.status::text,'') <> 'falhou'
            order by m.criado_em desc limit 1) = 'saida'
      and (select max(m.criado_em) from public.mensagens m where m.conversa_id = c.id and m.direcao = 'saida') <= now() - interval '6 hours'
      -- card não fechado
      and coalesce((select o.status::text from public.oportunidades o where o.id = e.oportunidade_id or o.conversa_origem_id = c.id
                     order by (o.id = e.oportunidade_id) desc, o.criado_em desc limit 1), '') not in ('ganho','perdido')
      and coalesce((select fc.nome from public.oportunidades o join public.funil_colunas fc on fc.id = o.coluna_id
                     where o.id = e.oportunidade_id or o.conversa_origem_id = c.id
                     order by (o.id = e.oportunidade_id) desc, o.criado_em desc limit 1), '') <> 'Não elegível'
    order by (select max(m.criado_em) from public.mensagens m where m.conversa_id = c.id and m.direcao = 'saida') desc
    limit greatest(1, p_limite)
  loop
    -- TETO GERAL (dono 09/10): já teve 1 toque automático em 24h ou 3 em 7 dias → o follow-up NÃO sai (nem depois).
    -- As 2 mensagens ficam gravadas já CANCELADAS (cancelado_motivo teto_toques…): o registro aparece na conversa
    -- e a regra "já recebeu este follow-up" (disparo_lote) tira o cliente das próximas rodadas.
    if not public.toque_automatico_permitido(r.contato_id) then
      v_det := public.toque_automatico_detalhe(r.contato_id);
      insert into public.mensagens_agendadas (organizacao_id, conversa_id, contato_id, canal_id, nome_canal_snapshot, telefone_canal_snapshot,
        criado_por, tipo, texto, storage_path, mime_type, nome_arquivo, tamanho_bytes, executar_em, status, cancelada_em, metadados)
      values
        (v_org, r.conversa_id, r.contato_id, v_canal, 'JUROS ABUSIVO (ANDRIUS)', '555193930488', v_matheus,
         'audio', null, v_audio, 'audio/ogg', 'prosseguir_6h.ogg', v_tam, now(), 'cancelada', now(),
         jsonb_build_object('disparo_lote','juros_auto_6h','ordem',1,'origem_audio','gravacao_painel','cancelado_motivo',v_det)),
        (v_org, r.conversa_id, r.contato_id, v_canal, 'JUROS ABUSIVO (ANDRIUS)', '555193930488', v_matheus,
         'texto', 'Podemos prosseguir?', null, null, null, null, now() + interval '5 seconds', 'cancelada', now(),
         jsonb_build_object('disparo_lote','juros_auto_6h','ordem',2,'cancelado_motivo',v_det));
      continue;
    end if;
    insert into public.mensagens_agendadas (organizacao_id, conversa_id, contato_id, canal_id, nome_canal_snapshot, telefone_canal_snapshot,
      criado_por, tipo, texto, storage_path, mime_type, nome_arquivo, tamanho_bytes, executar_em, metadados)
    values
      (v_org, r.conversa_id, r.contato_id, v_canal, 'JUROS ABUSIVO (ANDRIUS)', '555193930488', v_matheus,
       'audio', null, v_audio, 'audio/ogg', 'prosseguir_6h.ogg', v_tam, now() + (v_n * 2) * interval '1 minute',
       jsonb_build_object('disparo_lote','juros_auto_6h','ordem',1,'origem_audio','gravacao_painel')),
      (v_org, r.conversa_id, r.contato_id, v_canal, 'JUROS ABUSIVO (ANDRIUS)', '555193930488', v_matheus,
       'texto', 'Podemos prosseguir?', null, null, null, null, now() + (v_n * 2) * interval '1 minute' + interval '5 seconds',
       jsonb_build_object('disparo_lote','juros_auto_6h','ordem',2));
    v_n := v_n + 1;
  end loop;
  return v_n;
end $function$;

CREATE OR REPLACE FUNCTION public.emprestimo_pos_fluxo_motivo_fora(p_conversa uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case
           when c.id is null then 'conversa_sumiu'
           when c.canal_id is null or not (c.canal_id = any(public.emprestimo_pos_fluxo_canais())) then 'mudou_de_numero'
           when c.atendente_id is distinct from '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid then 'outro_atendente'
           when c.status::text = 'fechada' then 'conversa_fechada'
           when exists (select 1 from public.wa_optout w where w.contato_id = c.contato_id) then 'optout'
           -- 22/10 (dono): sem benefício + pergunta do parente sem resposta → cancela a sequência já na fila
           when public.ia_familia_pendente_em(c.id) is not null then 'familia_sem_resposta'
           when exists (select 1 from public.ia_sessoes s4 where s4.conversa_id = c.id and s4.status = 'ativa'
                         and (s4.dados->>'retomada_auto_em')::timestamptz > now() - interval '72 hours') then 'retomada_ativa'
           -- 29/10: quem o administrativo tirou do Fechado segue protegido como cliente fechado
           when public.adm_saiu_do_fechado(c.contato_id) then 'saiu_do_fechado_adm'
           when coalesce(op.status, '') in ('ganho','perdido','cancelado') then 'card_' || op.status
           when coalesce(op.coluna, '') = 'Não elegível' then 'card_nao_elegivel'
         end
    from (select p_conversa as id0) x
    left join public.conversas c on c.id = x.id0
    left join lateral (
      select o.status::text as status, fc.nome as coluna
        from public.oportunidades o
        left join public.funil_colunas fc on fc.id = o.coluna_id
       where o.conversa_origem_id = c.id or o.contato_id = c.contato_id
       order by (o.conversa_origem_id = c.id) desc, o.criado_em desc
       limit 1) op on true
$function$;

CREATE OR REPLACE FUNCTION public.juros_iniciar_caso_motivo_fora(p_conversa uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case
           when c.id is null then 'conversa_sumiu'
           when c.canal_id is distinct from 'fc80ec9e-9f8f-4dca-a3f0-e1101d73e117'::uuid then 'mudou_de_numero'
           when c.atendente_id is distinct from '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid then 'outro_atendente'
           when c.status::text = 'fechada' then 'conversa_fechada'
           when exists (select 1 from public.wa_optout w where w.contato_id = c.contato_id) then 'optout'
           -- 29/10: quem o administrativo tirou do Fechado segue protegido como cliente fechado
           when public.adm_saiu_do_fechado(c.contato_id) then 'saiu_do_fechado_adm'
           when coalesce(op.status, '') in ('ganho','perdido','cancelado') then 'card_' || op.status
           when coalesce(op.coluna, '') = 'Não elegível' then 'card_nao_elegivel'
         end
    from (select p_conversa as id0) x
    left join public.conversas c on c.id = x.id0
    left join public.bot_conversa_estado e on e.conversa_id = c.id
    left join lateral (
      select o.status::text as status, fc.nome as coluna
        from public.oportunidades o
        left join public.funil_colunas fc on fc.id = o.coluna_id
       where o.id = e.oportunidade_id or o.conversa_origem_id = c.id
       order by (o.id = e.oportunidade_id) desc nulls last, o.criado_em desc
       limit 1) op on true
$function$;


-- ---------------------------------------------------------------- leitura a cada 5 min
-- Ler é inofensivo: com adm_config.ativo = false só o espelho muda.
-- Desligar a leitura: select cron.unschedule('adm-fechados');
insert into public.webhook_config (chave, secret)
values ('adm_fechados',
        replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
on conflict (chave) do nothing;

select cron.schedule(
  'adm-fechados',
  '*/5 * * * *',
  $$
    select net.http_post(
      url := 'https://afmzuoavvnpfossiiypz.supabase.co/functions/v1/adm-fechados',
      body := '{}'::jsonb,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-bot-secret', (select secret from public.webhook_config where chave = 'adm_fechados')
      ),
      timeout_milliseconds := 60000
    );
  $$
);

notify pgrst, 'reload schema';
