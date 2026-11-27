-- =====================================================================
-- 60 — Layout da planilha (dono 25/09): "vamos ter que colocar o número ao lado
-- do CPF" + acabamento: colunas de mês com 96px (o "NÃO PAGOU" cabe inteiro).
-- Só DADO de layout (planilha_colunas); nenhuma célula, lead ou pagamento muda.
-- Idempotente: só mexe no que ainda está no layout antigo.
-- =====================================================================

-- TELEFONE logo depois do CPF (entre o CPF e a coluna seguinte)
update public.planilha_colunas t
   set ordem = (c.ordem + prox.ordem) / 2
  from public.planilha_colunas c,
       lateral (select min(x.ordem) as ordem from public.planilha_colunas x
                 where x.ordem > c.ordem and x.campo is distinct from 'telefone') prox
 where t.campo = 'telefone' and c.campo = 'cpf'
   and prox.ordem is not null and t.ordem > prox.ordem;

-- meses: 84 → 96 px
update public.planilha_colunas set largura = 96 where tipo = 'mes' and largura = 84;

-- telefone: largura justa para "(51) 99999-9999"
update public.planilha_colunas set largura = 136 where campo = 'telefone' and largura = 150;

-- a coluna de telefone não tem título na planilha do cliente; ao lado do CPF, o cabeçalho
-- de cada bloco passa a dizer TELEFONE (só onde está vazio)
insert into public.planilha_celulas (linha_id, coluna_id, texto)
select l.id, c.id, 'TELEFONE'
  from public.planilha_linhas l cross join public.planilha_colunas c
 where l.tipo = 'cabecalho' and c.campo = 'telefone'
on conflict (linha_id, coluna_id) do update set texto = excluded.texto, atualizado_em = now()
 where coalesce(btrim(public.planilha_celulas.texto), '') = '';

-- grades abertas recarregam
update public.planilha_versao set n = n + 1, em = now() where id = 1;
