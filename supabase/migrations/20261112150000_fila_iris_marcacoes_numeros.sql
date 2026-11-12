-- =====================================================================================
-- Fila da Iris — MARCAÇÕES DO DIA nos números (dono 12/11: "a gente precisa saber quantos clientes a gente
-- recebeu, quantas marcações a gente fez no dia também, isso é muito importante").
-- fila_iris_marcacoes_numeros: por atendente, quantas marcações ele fez no período — as da coluna Marcações (Ligar
-- de novo, Senha do Meu INSS, Documentos, Falta: …) criadas no período, mesmo que tiradas depois, e o "Ligar de
-- novo" marcado de novo no período (uma por cliente). Não conta "tirar da fila" nem a correção dos documentos.
-- A mesma regra de acesso de fila_iris_numeros: o administrador vê a equipe; o atendente, só a própria linha.
-- =====================================================================================
set lock_timeout = '5s';

create or replace function public.fila_iris_marcacoes_numeros(p_org uuid, p_inicio timestamptz, p_fim timestamptz)
returns table (usuario_id uuid, marcacoes integer)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_admin boolean;
begin
  if not public.fila_iris_acesso(p_org) then
    raise exception 'sem acesso à fila' using errcode = '42501';
  end if;
  v_admin := coalesce(public.papel_na_org(p_org)::text, '') = 'admin';
  return query
  select m.criado_por, count(*)::int
    from public.fila_iris_marcacoes m
   where m.organizacao_id = p_org
     and m.criado_por is not null
     and m.tipo in ('nao_atendeu', 'recuperar_senha', 'mandar_senha', 'mandar_doc', 'falta')
     and ((m.criado_em >= p_inicio and m.criado_em < p_fim)
          -- "Ligar de novo" de novo: a mesma marcação ganha +1 vez (atualizado_em); tirar não conta
          or (m.tipo = 'nao_atendeu' and m.vezes > 1 and m.atualizado_em >= p_inicio and m.atualizado_em < p_fim
              and m.atualizado_em is distinct from m.removido_em))
     and (v_admin or m.criado_por = auth.uid())
   group by m.criado_por;
end;
$$;
revoke all on function public.fila_iris_marcacoes_numeros(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.fila_iris_marcacoes_numeros(uuid, timestamptz, timestamptz) to authenticated;
