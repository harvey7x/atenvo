-- Aviso "PRESENCIAL MARCADO" mais curto (texto aprovado pelo dono em 09/11).
-- Só o MARCADO muda; remarcado/desmarcado/lembrete ficam como estavam até ele aprovar os novos.

-- Nome com a 1ª letra de cada palavra maiúscula; da/de/do/das/dos/e ficam minúsculas.
create or replace function public.presencial_nome_txt(p_nome text)
returns text language sql immutable set search_path = public, pg_temp as $$
  select string_agg(
           case when lower(w) in ('da','de','do','das','dos','e') then lower(w)
                else upper(left(w,1)) || lower(substr(w,2)) end,
           ' ' order by n)
    from regexp_split_to_table(btrim(coalesce(p_nome,'')), '\s+') with ordinality as t(w, n)
$$;

-- "Seg, 09/11"
create or replace function public.presencial_dia_curto_txt(p_em timestamptz)
returns text language sql stable set search_path = public, pg_temp as $$
  select (array['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'])
           [extract(dow from p_em at time zone 'America/Sao_Paulo')::int + 1]
         || ', ' || to_char(p_em at time zone 'America/Sao_Paulo', 'DD/MM')
$$;

create or replace function public.presencial_texto(p_tipo text, p_nome text, p_quando timestamptz, p_quem text)
returns text language sql stable set search_path = public, pg_temp as $$
  select case p_tipo
    when 'marcado' then
      E'*📅  Presencial agendado*\n' || public.presencial_nome_txt(p_nome) || E'\n'
      || public.presencial_dia_curto_txt(p_quando) || ' às ' || public.presencial_hora_txt(p_quando)
      || ' · ' || p_quem
    when 'remarcado' then
      E'🔁 *PRESENCIAL REMARCADO*\n' || p_nome || ' passou para '
      || public.presencial_dia_txt(p_quando) || ', às ' || public.presencial_hora_txt(p_quando) || E'.\n'
      || 'Remarcado por ' || p_quem || '.'
    when 'desmarcado' then
      E'❌ *PRESENCIAL DESMARCADO*\nO atendimento de ' || p_nome || ' '
      || public.presencial_na_txt(p_quando) || ', às ' || public.presencial_hora_txt(p_quando)
      || ' foi desmarcado por ' || p_quem || '.'
  end
$$;
