-- Lembrete das 8h organizado (texto aprovado pelo dono em 11/11).
create or replace function public.presencial_lembrete_texto(p_org uuid, p_dia date)
returns text language sql stable set search_path = public, pg_temp as $$
  select case when count(*) = 1
           then E'*📍  Presencial hoje*\n\nHoje tem cliente marcado:\n\n'
           else E'*📍  Presenciais hoje*\n\nHoje temos ' || count(*) || E' clientes marcados:\n\n'
         end
         || string_agg('*' || public.presencial_hora_txt(p.quando) || '* · ' || public.presencial_nome_txt(p.cliente_nome)
                       || E'\n_Marcado por ' || coalesce(u.nome, 'equipe') || '_',
                       E'\n\n' order by p.quando, p.cliente_nome)
    from presenciais p
    left join usuarios u on u.id = p.marcado_por
   where p.organizacao_id = p_org and p.status = 'marcado'
     and (p.quando at time zone 'America/Sao_Paulo')::date = p_dia
  having count(*) > 0
$$;
