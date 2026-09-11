-- =====================================================================
-- "Sem empréstimo em banco parceiro" como novo motivo de NÃO ELEGÍVEL
-- + simplificação do diálogo de perda no front (deixou de perguntar o
-- "Motivo da perda": "Não elegível" é a ÚNICA coluna perdida, então toda
-- perda cai direto no "Por que não é elegível?"). Pedido do dono 11/09.
--
-- Impacto no banco:
--  1) CHECK de oportunidades.motivo_nao_elegivel ganha 'sem_emprestimo_banco'.
--  2) RPC oportunidade_nao_elegivel(p_conversa,p_motivo) aceita a nova chave.
--  3) dashboard_trafego_periodo ganha o contador ne_sem_emprestimo_banco
--     (o bloco genérico descarte_motivos já rotula sozinho pela lista do front).
-- Nada de dado antigo é tocado; só amplia o conjunto permitido (aditivo).
-- =====================================================================

-- 1) CHECK ---------------------------------------------------------------
alter table public.oportunidades drop constraint if exists oportunidades_motivo_nao_elegivel_chk;
alter table public.oportunidades add constraint oportunidades_motivo_nao_elegivel_chk
  check (motivo_nao_elegivel is null or motivo_nao_elegivel in
    ('sem_beneficio_inss','muitos_processos','sem_interesse','sem_emprestimo_banco'));

-- 2) RPC do bot: aceita a nova chave ------------------------------------
create or replace function public.oportunidade_nao_elegivel(p_conversa uuid, p_motivo text default null)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_org uuid; v_contato uuid; v_col uuid;
begin
  if p_motivo is not null and p_motivo not in
     ('sem_beneficio_inss','muitos_processos','sem_interesse','sem_emprestimo_banco') then
    raise exception 'motivo_nao_elegivel_invalido' using errcode='check_violation';
  end if;

  select organizacao_id, contato_id into v_org, v_contato
    from public.conversas where id = p_conversa;
  if v_contato is null or v_org is null then return; end if;

  select id into v_col
    from public.funil_colunas
    where organizacao_id = v_org
      and resultado = 'perdido'
      and coalesce(arquivada, false) = false
    order by ordem
    limit 1;
  if v_col is null then return; end if;

  update public.oportunidades o
     set coluna_id = v_col,
         motivo_perda = 'nao_elegivel',
         motivo_nao_elegivel = p_motivo,
         etiquetas = case
           when 'nao_elegivel' = any (coalesce(o.etiquetas, '{}'::text[])) then o.etiquetas
           else array_append(coalesce(o.etiquetas, '{}'::text[]), 'nao_elegivel')
         end
   where o.contato_id = v_contato
     and o.organizacao_id = v_org
     and o.status = 'em_andamento';
end $function$;

revoke all on function public.oportunidade_nao_elegivel(uuid, text) from public, anon, authenticated;
grant execute on function public.oportunidade_nao_elegivel(uuid, text) to service_role;

-- 3) dashboard_trafego_periodo: contador da nova categoria ---------------
create or replace function public.dashboard_trafego_periodo(p_org uuid, p_ini timestamptz, p_fim timestamptz)
 returns jsonb
 language sql
 stable
 set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(to_jsonb(t.*) order by t.leads desc, t.canal), '[]'::jsonb)
  from (
    select
      o.canal_origem_id as canal_id,
      coalesce(ca.nome_interno, 'Sem conexão') as canal,
      count(*) filter (where o.criado_em >= p_ini and o.criado_em < p_fim) as leads,
      count(*) filter (where o.criado_em >= p_ini and o.criado_em < p_fim
        and exists (select 1 from public.mensagens ms
                     where ms.conversa_id = o.conversa_origem_id
                       and ms.direcao = 'saida'
                       and ms.autor_id is not null
                       and ms.origem is distinct from 'bot')) as atendidas,
      count(*) filter (where o.criado_em >= p_ini and o.criado_em < p_fim and o.status = 'em_andamento') as em_andamento,
      count(*) filter (where o.status = 'ganho' and o.fechado_em >= p_ini and o.fechado_em < p_fim) as ganhos,
      count(*) filter (where o.status = 'perdido' and o.fechado_em >= p_ini and o.fechado_em < p_fim
        and not (coalesce(o.motivo_perda, '') = any (public.dashboard_motivos_descarte()))) as perdas,
      count(*) filter (where o.status = 'perdido' and o.fechado_em >= p_ini and o.fechado_em < p_fim
        and coalesce(o.motivo_perda, '') = any (public.dashboard_motivos_descarte())) as descartes,
      count(*) filter (where o.status = 'perdido' and o.fechado_em >= p_ini and o.fechado_em < p_fim
        and coalesce(o.motivo_perda, '') = any (public.dashboard_motivos_descarte())
        and o.motivo_nao_elegivel = 'sem_beneficio_inss') as ne_sem_beneficio_inss,
      count(*) filter (where o.status = 'perdido' and o.fechado_em >= p_ini and o.fechado_em < p_fim
        and coalesce(o.motivo_perda, '') = any (public.dashboard_motivos_descarte())
        and o.motivo_nao_elegivel = 'muitos_processos') as ne_muitos_processos,
      count(*) filter (where o.status = 'perdido' and o.fechado_em >= p_ini and o.fechado_em < p_fim
        and coalesce(o.motivo_perda, '') = any (public.dashboard_motivos_descarte())
        and o.motivo_nao_elegivel = 'sem_interesse') as ne_sem_interesse,
      count(*) filter (where o.status = 'perdido' and o.fechado_em >= p_ini and o.fechado_em < p_fim
        and coalesce(o.motivo_perda, '') = any (public.dashboard_motivos_descarte())
        and o.motivo_nao_elegivel = 'sem_emprestimo_banco') as ne_sem_emprestimo_banco,
      count(*) filter (where o.status = 'perdido' and o.fechado_em >= p_ini and o.fechado_em < p_fim
        and coalesce(o.motivo_perda, '') = any (public.dashboard_motivos_descarte())
        and o.motivo_nao_elegivel is null) as ne_sem_categoria
    from public.oportunidades o
    left join public.canais ca on ca.id = o.canal_origem_id
    where o.organizacao_id = p_org
      and ((o.criado_em >= p_ini and o.criado_em < p_fim)
        or (o.fechado_em is not null and o.fechado_em >= p_ini and o.fechado_em < p_fim))
    group by 1, 2
  ) t
$function$;

revoke all on function public.dashboard_trafego_periodo(uuid, timestamptz, timestamptz) from public, anon, authenticated;
