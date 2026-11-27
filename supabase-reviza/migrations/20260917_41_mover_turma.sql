-- =====================================================================
-- 41 — Mover turma TRANSACIONAL + carimbo de mudança de dia.
-- Motivo (rastreio 17/09, pedido do dono: "quando muda uma data, tudo que
-- envolve a data precisa alterar junto"):
--   (a) mover ciclo era UPDATE solto do front: as datas manuais do calendário
--       (ciclos_datas, chaveadas por dia) ficavam ÓRFÃS no dia antigo e a turma
--       HERDAVA datas de uma turma extinta no dia novo — calendário e disparos
--       passavam a usar ajustes que ninguém fez pra ela.
--   (b) o desfazer capturava os ids do cache do navegador (podia perder lead
--       recém-chegado); agora a RPC devolve os ids EXATOS que moveu.
--   (c) mover a turma pra um dia ANTERIOR no mês fazia a régua (quando ligada)
--       casar "atraso" retroativo de um vencimento que nunca existiu — o
--       carimbo dia_alterado_em deixa o motor descartar esses casamentos.
-- Política das datas manuais: NUNCA copiar (o ajuste era relativo ao vencimento
-- antigo). Origem esvaziada → remove comps do mês corrente em diante (devolve as
-- linhas pro aviso/desfazer); destino que estava VAZIO → remove resíduos de
-- turma antiga (a turma que chega começa no automático); destino com turma viva
-- (fusão) → as datas do destino ficam (pertencem à turma que continua lá).
-- Comps passadas ficam intocadas (histórico do calendário).
-- =====================================================================

-- carimbo: quando o DIA do lead mudou pela última vez (qualquer caminho de escrita)
alter table public.leads add column if not exists dia_alterado_em timestamptz;

create or replace function public.tg_leads_dia_carimbo()
returns trigger language plpgsql as $$
begin
  if new.dia is distinct from old.dia then new.dia_alterado_em := now(); end if;
  return new;
end $$;

drop trigger if exists leads_dia_carimbo on public.leads;
create trigger leads_dia_carimbo before update of dia on public.leads
  for each row execute function public.tg_leads_dia_carimbo();

-- registro histórico ≠ fonte da verdade (achado d2 do rastreio)
comment on table public.ciclos is
  'registro HISTORICO do import (nome do lote + data original). NAO reflete o dia atual do ciclo — a fonte da verdade do vencimento e SEMPRE leads.dia.';

create or replace function public.mover_turma(p_de smallint, p_para smallint)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_comp text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM');
  v_destino_tinha boolean;
  v_movidos uuid[];
  v_origem_datas jsonb;
  v_destino_limpas int := 0;
begin
  if not public.is_at_least('financeiro') then
    raise exception 'sem permissao' using errcode = '42501';
  end if;
  if p_de is null or p_para is null or p_de < 1 or p_de > 31 or p_para < 1 or p_para > 31 or p_de = p_para then
    raise exception 'dias invalidos';
  end if;

  select exists(select 1 from public.leads where dia = p_para) into v_destino_tinha;

  with mv as (
    update public.leads set dia = p_para where dia = p_de returning id
  )
  select coalesce(array_agg(id), '{}'::uuid[]) into v_movidos from mv;

  -- datas manuais do dia de ORIGEM (ficou vazio): órfãs → remove e devolve
  with del as (
    delete from public.ciclos_datas
    where dia = p_de and comp >= v_comp
    returning dia, comp, inicio, fim, cobranca
  )
  select coalesce(jsonb_agg(to_jsonb(del)), '[]'::jsonb) into v_origem_datas from del;

  -- destino estava VAZIO: resíduos de turma antiga não podem grudar na que chega
  if not v_destino_tinha then
    with del2 as (
      delete from public.ciclos_datas
      where dia = p_para and comp >= v_comp
      returning 1
    )
    select count(*) into v_destino_limpas from del2;
  end if;

  return jsonb_build_object(
    'movidos', coalesce(to_jsonb(v_movidos), '[]'::jsonb),
    'origem_datas', v_origem_datas,
    'destino_limpas', v_destino_limpas,
    'fusao', v_destino_tinha
  );
end $$;

grant execute on function public.mover_turma(smallint, smallint) to authenticated;
