-- Kanban segue o sistema do CAF também em "Assinar" e "Documentos" — pedido do dono 29/10/2026.
--
--   * Assinar    = cliente com caso "aguardando assinatura" no CAF (a equipe não põe nem tira à mão);
--   * Documentos = parou no documento aqui (regra do robô, como antes) + "aguardando documentos" no CAF;
--   * quem está em Assinar sem "aguardando assinatura" lá vai para Documentos (dono: os 182 de 29/10);
--   * não elegível com caso aberto no CAF volta para a etapa do caso (o caso no CAF é a verdade);
--   * Fechado continua como antes (20261029170000); quem sai do Fechado vai para Assinar ou
--     Documentos conforme o CAF.
--
-- Só liga quando a API do CAF manda os pendentes (GET caf-fechados?pendentes=1, pedido em
-- ~/Atenvo/pedido-api-caf-placar.md): a edge fn grava em adm_pendentes e marca
-- adm_config.pendentes_em. Sem isso, adm_plano faz exatamente o que fazia.

alter table public.adm_config add column if not exists pendentes_em timestamptz;

create table if not exists public.adm_pendentes (
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  caso_id uuid not null,
  contato_id uuid,
  estagio text not null,                -- aguardando_documentos | aguardando_assinatura | adm_preparando
  vendedor text,
  estagio_em timestamptz,
  atualizado_em timestamptz not null default now(),
  primary key (organizacao_id, caso_id)
);
create index if not exists idx_adm_pendentes_contato on public.adm_pendentes (contato_id) where contato_id is not null;
alter table public.adm_pendentes enable row level security;
drop policy if exists adm_pendentes_sel on public.adm_pendentes;
create policy adm_pendentes_sel on public.adm_pendentes for select to authenticated
  using (public.is_member(organizacao_id));

-- ---------------------------------------------------------------- leitura dos pendentes
-- p_lista = "pendentes" da API: [{caso_id, nome, cpf, telefone, vendedor, estagio, estagio_em}].
-- Casamento igual ao do adm_sincronizar: CPF → CPF da ficha → telefone → nome completo único.
create or replace function public.adm_pendentes_gravar(p_org uuid, p_lista jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_n int; v_cas int;
begin
  create temp table _pd on commit drop as
  select distinct on (caso_id) *
    from (select (e->>'caso_id')::uuid caso_id,
                 btrim(coalesce(e->>'nome', '')) nome,
                 lpad(nullif(regexp_replace(coalesce(e->>'cpf', ''), '\D', '', 'g'), ''), 11, '0') cpf,
                 chave_canonica_telefone(e->>'telefone') tel,
                 nullif(btrim(coalesce(e->>'vendedor', '')), '') vendedor,
                 e->>'estagio' estagio,
                 case when coalesce(e->>'estagio_em', '') ~ '^\d{4}-\d{2}-\d{2}' then (e->>'estagio_em')::timestamptz end estagio_em
            from jsonb_array_elements(coalesce(p_lista, '[]'::jsonb)) e
           where coalesce(e->>'caso_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
             and e->>'estagio' in ('aguardando_documentos', 'aguardando_assinatura', 'adm_preparando')) x
   order by caso_id;

  create temp table _ctp on commit drop as
    select id, lpad(regexp_replace(cpf, '\D', '', 'g'), 11, '0') cpf, chave_canonica_telefone(telefone) tel, criado_em
      from contatos where organizacao_id = p_org;
  alter table _pd add column contato_id uuid;
  update _pd p set contato_id = (select c.id from _ctp c where c.cpf = p.cpf order by c.criado_em desc limit 1)
   where length(p.cpf) = 11;
  update _pd p set contato_id = (select f.contato_id from fichas_judiciais f
                                  where f.organizacao_id = p_org and f.contato_id is not null
                                    and lpad(regexp_replace(coalesce(f.cpf, ''), '\D', '', 'g'), 11, '0') = p.cpf
                                  order by f.criado_em desc limit 1)
   where p.contato_id is null and length(p.cpf) = 11;
  update _pd p set contato_id = (select c.id from _ctp c where c.tel = p.tel order by c.criado_em desc limit 1)
   where p.contato_id is null and p.tel is not null;
  update _pd p set contato_id = u.id
    from (select adm_nome_chave(c.nome) nk, (array_agg(c.id))[1] id
            from contatos c where c.organizacao_id = p_org
           group by 1 having count(*) = 1) u
   where p.contato_id is null and u.nk = adm_nome_chave(p.nome) and u.nk like '% %';

  delete from adm_pendentes where organizacao_id = p_org;
  insert into adm_pendentes (organizacao_id, caso_id, contato_id, estagio, vendedor, estagio_em)
  select p_org, caso_id, contato_id, estagio, vendedor, estagio_em from _pd;
  get diagnostics v_n = row_count;
  select count(contato_id) into v_cas from _pd;

  insert into adm_config (organizacao_id) values (p_org) on conflict do nothing;
  update adm_config set pendentes_em = now(), atualizado_em = now() where organizacao_id = p_org;
  return jsonb_build_object('pendentes', v_n, 'casados', v_cas);
end $$;
revoke all on function public.adm_pendentes_gravar(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.adm_pendentes_gravar(uuid, jsonb) to service_role;

-- ---------------------------------------------------------------- plano e aplicação
-- Cópias das versões VIVAS (20261029170000) + as etapas do CAF. Pára se mudaram.
do $$
declare v record;
begin
  for v in select * from (values
    ('public.adm_plano(uuid)', '1b766bfe7d5256a88448f980c76a5f21'),
    ('public.adm_aplicar(uuid)', '8581a281796fb31dbc542d203153d427'),
    ('public.adm_status(uuid)', '9bb09e735ba9507c42bee47d7a20f04a')
  ) x(f, m) loop
    if (select md5(prosrc) from pg_proc where oid = v.f::regprocedure) is distinct from v.m then
      raise exception 'A função % mudou depois de 29/10: refaça a cópia antes de aplicar', v.f;
    end if;
  end loop;
end $$;

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
          and upper(c.nome) like 'ASSINAR%' order by c.ordem limit 1) col_assinar,
      (select id from funil_colunas c where c.funil_id = f.funil_id and not c.arquivada and c.resultado = 'neutro'
          and upper(c.nome) like 'DOCUMENTO%' order by c.ordem limit 1) col_doc,
      (select ordem from funil_colunas c where c.funil_id = f.funil_id and not c.arquivada and c.resultado = 'neutro'
          and upper(c.nome) like 'DOCUMENTO%' order by c.ordem limit 1) ordem_doc
    from funil f
  ), protecao as (
    select max(protege_antes) as antes from adm_config where organizacao_id = p_org
  ), feed as (   -- 30/10: os pendentes do CAF só valem depois da primeira leitura deles
    select exists (select 1 from adm_config c where c.organizacao_id = p_org and c.pendentes_em is not null) as ligado
  ), af as (     -- um completo por contato: o mais recente
    select distinct on (a.contato_id) a.contato_id, a.fechado_em
      from adm_fechados a
     where a.organizacao_id = p_org and a.contato_id is not null and a.fechado_em is not null
     order by a.contato_id, a.fechado_em desc
  ), pend as (   -- 30/10: a etapa do cliente no CAF (aguardando assinatura vence aguardando documentos)
    select p.contato_id,
           case when bool_or(p.estagio = 'aguardando_assinatura') then 'assinar' else 'documentos' end as etapa
      from adm_pendentes p cross join feed
     where feed.ligado and p.organizacao_id = p_org and p.contato_id is not null
     group by 1
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
  -- por contato pode ficar aberto no funil: o mais recente volta (para Assinar; com os
  -- pendentes do CAF, Assinar só se lá está "aguardando assinatura", senão Documentos);
  -- os repetidos (ou todos, se o contato já tem card aberto) são arquivados.
  select s.id, s.contato_id, case when s.volta then 'reabrir' else 'arquivar' end,
         s.coluna_id,
         case when not s.volta then s.coluna_id
              when not s.ligado or s.etapa = 'assinar' then s.col_assinar
              else s.col_doc end,
         null::timestamptz
    from (select o.id, o.contato_id, o.coluna_id, cols.col_assinar, cols.col_doc, feed.ligado, pe.etapa,
                 row_number() over (partition by o.contato_id order by o.criado_em desc, o.id) = 1
                 and not exists (select 1 from opp a where a.contato_id = o.contato_id
                                   and a.status = 'em_andamento') as volta
            from opp o cross join cols cross join protecao p cross join feed
            left join pend pe on pe.contato_id = o.contato_id
           where o.adm_em is null and o.status = 'ganho' and o.coluna_id = cols.col_ganho
             and (p.antes is null or o.fechado_em is null or o.fechado_em >= p.antes)) s
  union all
  -- 30/10: o card do cliente segue a etapa do caso no CAF. O card aberto (ou, sem ele, o não
  -- elegível). Assinar puxa de qualquer coluna; Documentos só puxa para frente ou desce do
  -- Assinar. Quem tem completo no CAF ou card no Fechado fica com a regra do Fechado.
  select k.id, k.contato_id, k.etapa, k.coluna_id, k.destino, null::timestamptz
    from (select distinct on (o.contato_id) o.id, o.contato_id, pe.etapa, o.coluna_id, o.status,
                 case pe.etapa when 'assinar' then cols.col_assinar else cols.col_doc end as destino,
                 (select fc.ordem from funil_colunas fc where fc.id = o.coluna_id) as ordem
            from opp o cross join cols
            join pend pe on pe.contato_id = o.contato_id
           where o.status in ('em_andamento', 'perdido')
             and not exists (select 1 from af where af.contato_id = o.contato_id)
             and not exists (select 1 from opp g where g.contato_id = o.contato_id
                               and g.status = 'ganho' and g.coluna_id = cols.col_ganho)
           order by o.contato_id, (o.status = 'em_andamento') desc, o.criado_em desc) k
    cross join cols
   where k.destino is not null and k.coluna_id is distinct from k.destino
     and (k.etapa = 'assinar'
          or k.status = 'perdido'
          or coalesce(k.ordem, -1) < cols.ordem_doc
          or k.coluna_id = cols.col_assinar)
  union all
  -- 30/10: no Assinar sem caso pendente no CAF → Documentos (dono: os 182 de 29/10)
  select o.id, o.contato_id, 'sair_assinar', o.coluna_id, cols.col_doc, null::timestamptz
    from opp o cross join cols cross join feed
   where feed.ligado and cols.col_doc is not null
     and o.status = 'em_andamento' and o.coluna_id = cols.col_assinar
     and not exists (select 1 from pend pe where pe.contato_id = o.contato_id)
     and not exists (select 1 from af where af.contato_id = o.contato_id)
$$;
revoke all on function public.adm_plano(uuid) from public, anon, authenticated;

create or replace function public.adm_aplicar(p_org uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r record; v_f int := 0; v_r int := 0; v_a int := 0; v_d int := 0; v_k int := 0;
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
    elsif r.acao in ('assinar', 'documentos', 'sair_assinar') then
      -- 30/10: etapa do CAF. Card aberto: só troca de coluna; não elegível: reabre com o motivo.
      if r.st_ant::text in ('ganho', 'perdido') then
        update oportunidades set coluna_id = r.coluna_destino_id,
               motivo_reabertura = 'Administrativo: o caso do cliente está em andamento no sistema do administrativo'
         where id = r.oportunidade_id;
      else
        update oportunidades set coluna_id = r.coluna_destino_id where id = r.oportunidade_id;
      end if;
      v_k := v_k + 1;
    else
      update oportunidades set coluna_id = r.coluna_destino_id,
             motivo_reabertura = 'Administrativo: o cliente não está como completo no sistema do administrativo'
       where id = r.oportunidade_id;
      v_r := v_r + 1;
    end if;
  end loop;
  perform set_config('app.fechamento_origem', '', true);
  return jsonb_build_object('fechou', v_f, 'reabriu', v_r, 'arquivou', v_a, 'redatou', v_d, 'kanban', v_k);
end $$;
revoke all on function public.adm_aplicar(uuid) from public, anon, authenticated;

-- "assinar" = o Assinar já segue o CAF (para a trava da tela)
create or replace function public.adm_status(p_org uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select case when not public.is_member(p_org) then null else
    jsonb_build_object('ativo', coalesce(c.ativo,false), 'ultima_leitura_em', c.ultima_leitura_em,
                       'completos', (select count(*) from adm_fechados a where a.organizacao_id = p_org),
                       'placar', exists (select 1 from adm_casos k where k.organizacao_id = p_org),
                       'assinar', coalesce(c.ativo, false) and c.pendentes_em is not null)
  end
  from (select 1) x left join adm_config c on c.organizacao_id = p_org
$$;
revoke all on function public.adm_status(uuid) from public, anon;
grant execute on function public.adm_status(uuid) to authenticated;

-- ---------------------------------------------------------------- trava do Assinar
-- Com os pendentes do CAF ligados, a EQUIPE não põe nem tira card do Assinar (robôs e o
-- próprio administrativo passam: só barra quem está logado na tela).
create or replace function public.adm_trava_assinar()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if NEW.coluna_id is not distinct from OLD.coluna_id or auth.uid() is null then return NEW; end if;
  if coalesce(current_setting('app.fechamento_origem', true), '') = 'administrativo' then return NEW; end if;
  if not exists (select 1 from adm_config ac where ac.organizacao_id = NEW.organizacao_id
                  and ac.ativo and ac.pendentes_em is not null) then
    return NEW;
  end if;
  if exists (select 1 from funil_colunas fc where fc.id in (NEW.coluna_id, OLD.coluna_id)
              and upper(fc.nome) like 'ASSINAR%') then
    raise exception 'assinar_pelo_administrativo' using errcode = 'check_violation';
  end if;
  return NEW;
end $$;
drop trigger if exists trg_adm_trava_assinar on public.oportunidades;
create trigger trg_adm_trava_assinar before update of coluna_id on public.oportunidades
  for each row execute function public.adm_trava_assinar();

notify pgrst, 'reload schema';
