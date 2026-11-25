-- 25/11 (dono): clientes fechados voltavam como normais.
--  1) Pós-venda sem pino: conversa de cliente fechado nunca fica fixada (tira as atuais, impede novas,
--     e tira quando o cartão vira Fechado).
--  2) O atendente também pode marcar Fechado (a tela pede confirmação). Tirar do Fechado segue só com o administrativo.
--  3) Fechado à mão (fechado_por_id preenchido) não é reaberto pelo sincronismo do administrativo.
--     O fechado pelo administrativo tem fechado_por_id nulo (adm_aplicar), então a regra literal dele continua igual.

create or replace function public.contato_esta_fechado(p_contato uuid)
returns boolean language sql stable security definer set search_path to 'public','pg_temp' as $f$
  select p_contato is not null and exists (
    select 1 from public.oportunidades o join public.funil_colunas fc on fc.id = o.coluna_id
     where o.contato_id = p_contato and o.status::text = 'ganho' and fc.resultado = 'ganho')
$f$;

create or replace function public.trg_conversa_sem_pino_fechado()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp' as $f$
begin
  if NEW.fixada_em is not null and public.contato_esta_fechado(NEW.contato_id) then NEW.fixada_em := null; end if;
  return NEW;
end $f$;
drop trigger if exists trg_conversa_sem_pino_fechado on public.conversas;
create trigger trg_conversa_sem_pino_fechado before insert or update of fixada_em on public.conversas
  for each row when (NEW.fixada_em is not null) execute function public.trg_conversa_sem_pino_fechado();

create or replace function public.trg_opp_fechou_tira_pino()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp' as $f$
begin
  if NEW.contato_id is not null and (TG_OP = 'INSERT' or OLD.status::text is distinct from 'ganho') then
    update public.conversas set fixada_em = null where contato_id = NEW.contato_id and fixada_em is not null;
  end if;
  return NEW;
end $f$;
drop trigger if exists trg_opp_fechou_tira_pino on public.oportunidades;
create trigger trg_opp_fechou_tira_pino after insert or update on public.oportunidades
  for each row when (NEW.status::text = 'ganho') execute function public.trg_opp_fechou_tira_pino();

-- tira os pinos que já existem em conversa de cliente fechado (lista guardada em relatorios/fechados-25-11)
update public.conversas set fixada_em = null
 where fixada_em is not null and public.contato_esta_fechado(contato_id);

CREATE OR REPLACE FUNCTION public.opp_sync_fechamento()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_novo text; v_antigo text; v_uid uuid := auth.uid();
begin
  if NEW.coluna_id is not distinct from OLD.coluna_id then return NEW; end if;
  select coalesce(resultado,'neutro') into v_novo from public.funil_colunas where id = NEW.coluna_id;
  select coalesce(resultado,'neutro') into v_antigo from public.funil_colunas where id = OLD.coluna_id;
  v_novo := coalesce(v_novo,'neutro'); v_antigo := coalesce(v_antigo,'neutro');
  if v_novo = v_antigo then return NEW; end if;
  -- 29/10: com o administrativo ligado, só ele põe ou tira do Fechado.
  -- 25/11 (dono): o atendente também pode PÔR no Fechado (a tela pede confirmação). Tirar continua só com o administrativo.
  if (v_novo = 'ganho' or v_antigo = 'ganho')
     and coalesce(current_setting('app.fechamento_origem', true), '') <> 'administrativo'
     and exists (select 1 from public.adm_config ac where ac.organizacao_id = NEW.organizacao_id and ac.ativo)
     and not (v_novo = 'ganho' and v_uid is not null)   -- 25/11: atendente logado pode marcar Fechado
     then
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

CREATE OR REPLACE FUNCTION public.adm_plano(p_org uuid)
 RETURNS TABLE(oportunidade_id uuid, contato_id uuid, acao text, coluna_atual_id uuid, coluna_destino_id uuid, fechado_em timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    select o.id, o.contato_id, o.status, o.coluna_id, o.criado_em, o.fechado_em, o.fechado_por_id,
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
             and o.fechado_por_id is null   -- 25/11: fechado à mão por atendente fica fechado
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
$function$;
