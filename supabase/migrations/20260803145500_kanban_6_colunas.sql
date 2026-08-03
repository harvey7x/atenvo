do $$
declare v_funil uuid; v_org uuid;
begin
  select id, organizacao_id into v_funil, v_org
  from funis where coalesce(arquivado,false)=false
  order by padrao desc nulls last, ordem limit 1;
  if v_funil is null then raise exception 'funil da CAF nao encontrado'; end if;

  -- A) estaciona as colunas fora do caminho (evita colisão de ordem)
  --    exclui a coluna de ENTRADA: o trigger trg_protege_coluna_entrada aborta se ela sair da ordem 0.
  update funil_colunas set ordem = ordem + 1000 where funil_id = v_funil and not entrada;

  -- B) renomeia para o novo modelo
  update funil_colunas set nome='Lead Novo'   where funil_id=v_funil and nome='LEAD NOVO';
  update funil_colunas set nome='Em Produção' where funil_id=v_funil and nome='DOCUMENTAÇÃO';
  update funil_colunas set nome='Contrato'    where funil_id=v_funil and nome='CTT/ASSINAR';
  update funil_colunas set nome='Fechado'     where funil_id=v_funil and nome='FECHADO';
  update funil_colunas set nome='Perdido'     where funil_id=v_funil and nome='PERDIDO';
  update funil_colunas set nome='Remarketing' where funil_id=v_funil and nome='REMARKETING';

  -- C) cria a coluna nova "Lead Qualificado"
  insert into funil_colunas
    (funil_id, organizacao_id, nome, cor, ordem, entrada, resultado, encerra_oportunidade, arquivada)
  values
    (v_funil, v_org, 'Lead Qualificado', '#8b5cf6', 1005, false, 'neutro', false, false);

  -- D) renumera na ordem final (0..6)
  update funil_colunas set ordem = case nome
      when 'Lead Novo'        then 0
      when 'Lead Qualificado' then 1
      when 'Em Produção'      then 2
      when 'Contrato'         then 3
      when 'Fechado'          then 4
      when 'Perdido'          then 5
      when 'Remarketing'      then 6
    end
  where funil_id=v_funil;
end $$;

-- E) aposenta o campo vestigial (auditoria confirmou: nada lê/escreve)
drop index if exists public.idx_oport_etapa;
alter table public.oportunidades drop column if exists etapa;
-- (o TIPO etapa_funil NÃO é removido: uma tabela de backup ainda o usa)
