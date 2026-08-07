alter table public.funil_colunas add column if not exists papel text;
comment on column public.funil_colunas.papel is
  'selo interno estavel de funcao da coluna (qualificado/producao); automacoes usam isto, nao o nome';

do $$
declare v_funil uuid; n1 int; n2 int;
begin
  select id into v_funil from public.funis
    where coalesce(arquivado,false)=false
    order by padrao desc nulls last, ordem limit 1;

  update public.funil_colunas set papel='qualificado'
    where funil_id=v_funil and nome='Lead Qualificado';
  get diagnostics n1 = row_count;

  update public.funil_colunas set papel='producao'
    where funil_id=v_funil and nome='Em Produção';
  get diagnostics n2 = row_count;

  if n1 <> 1 or n2 <> 1 then
    raise exception 'selo nao aplicado (qualificado=% producao=%, esperado 1 e 1). Confira os nomes das colunas.', n1, n2;
  end if;
end $$;

create or replace function public.fn_opp_move_qualificado()
returns trigger language plpgsql security definer set search_path to 'public' as $fn$
declare v_opp uuid; v_funil uuid; v_org uuid; v_contato uuid;
        v_col_qual uuid; v_col_entrada uuid;
begin
  if NEW.etapa is distinct from 'concluido' then return NEW; end if;
  if TG_OP='UPDATE' and OLD.etapa is not distinct from 'concluido' then return NEW; end if;

  v_opp := NEW.oportunidade_id;
  if v_opp is null and NEW.conversa_id is not null then
    select contato_id, organizacao_id into v_contato, v_org
      from public.conversas where id = NEW.conversa_id;
    if v_contato is not null then
      select id into v_opp from public.oportunidades
        where organizacao_id=v_org and contato_id=v_contato and status='em_andamento'
        order by criado_em desc limit 1;
    end if;
  end if;
  if v_opp is null then return NEW; end if;

  select funil_id into v_funil from public.oportunidades where id=v_opp;
  select id into v_col_qual from public.funil_colunas
    where funil_id=v_funil and papel='qualificado' and not arquivada limit 1;
  select id into v_col_entrada from public.funil_colunas
    where funil_id=v_funil and entrada and not arquivada limit 1;
  if v_col_qual is null then return NEW; end if;

  update public.oportunidades set coluna_id = v_col_qual
    where id=v_opp and status='em_andamento' and coluna_id = v_col_entrada;
  return NEW;
end $fn$;

drop trigger if exists trg_opp_move_qualificado on public.bot_conversa_estado;
create trigger trg_opp_move_qualificado
  after insert or update of etapa, concluido_em on public.bot_conversa_estado
  for each row execute function public.fn_opp_move_qualificado();

create or replace function public.fn_opp_move_producao()
returns trigger language plpgsql security definer set search_path to 'public' as $fn$
declare v_funil uuid; v_col_prod uuid; v_col_qual uuid; v_col_entrada uuid;
begin
  if NEW.oportunidade_id is null then return NEW; end if;
  select funil_id into v_funil from public.oportunidades where id=NEW.oportunidade_id;
  if v_funil is null then return NEW; end if;

  select id into v_col_prod    from public.funil_colunas where funil_id=v_funil and papel='producao'    and not arquivada limit 1;
  select id into v_col_qual    from public.funil_colunas where funil_id=v_funil and papel='qualificado' and not arquivada limit 1;
  select id into v_col_entrada from public.funil_colunas where funil_id=v_funil and entrada            and not arquivada limit 1;
  if v_col_prod is null then return NEW; end if;

  update public.oportunidades set coluna_id = v_col_prod
    where id=NEW.oportunidade_id and status='em_andamento'
      and coluna_id in (v_col_entrada, v_col_qual);
  return NEW;
end $fn$;

drop trigger if exists trg_opp_move_producao on public.fichas_judiciais;
create trigger trg_opp_move_producao
  after insert on public.fichas_judiciais
  for each row execute function public.fn_opp_move_producao();
