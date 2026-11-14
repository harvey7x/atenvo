-- =====================================================================================
-- Fila da Iris — A IRIS AGORA: "Nunca responderam" só depois de 24 h da 1ª mensagem da Iris (conferência final de 14/11).
-- O bloco contava as 24 h pela última mensagem do CLIENTE: quem a Iris acabou de retomar (a fila de retomada manda a
-- 1ª mensagem dela para um cliente que escreveu dias atrás) caía em "nunca responderam" minutos depois. Agora
-- respondeu_iris fica null enquanto a 1ª mensagem dela tem menos de 24 h. Só essa coluna muda; mesma assinatura.
-- =====================================================================================
set lock_timeout = '5s';

-- trava: a função viva tem de ser a de 20261114130000 (md5 conferido em 14/11)
do $trava$
declare v_md5 text;
begin
  select md5(prosrc) into v_md5 from pg_proc where oid = 'public.fila_iris_iris_agora(uuid)'::regprocedure;
  if v_md5 is distinct from 'b010d2fb0fef991482a8f5d1e0015e4b' then
    raise exception 'fila_iris_iris_agora mudou depois de 14/11 (md5 %): confira antes de aplicar', v_md5;
  end if;
end
$trava$;

create or replace function public.fila_iris_iris_agora(p_org uuid)
returns table (
  contato_id uuid, conversa_id uuid, nome text, telefone text, dono_id uuid,
  campanha text, numero text, numero_campanha text, etapa text, desde timestamptz,
  ult_cliente_em timestamptz, ult_nossa_em timestamptz, ult_nossa_origem text, respondeu_iris boolean,
  pediu_humano text, categoria_fila text
) language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_eu uuid := auth.uid();
  v_admin boolean;
begin
  if v_eu is null or not public.fila_iris_acesso(p_org) then
    raise exception 'Sem acesso à Fila da Iris.' using errcode = '42501';
  end if;
  v_admin := coalesce(public.papel_na_org(p_org)::text, '') = 'admin';
  return query
  with ses as (
    -- a régua do ia_atendendo_agora (uma sessão por conversa: a mais recente) + número com a Iris
    select distinct on (s.conversa_id) s.conversa_id, s.canal_id, s.etapa, s.criado_em, s.dados
      from public.ia_sessoes s
      join public.canais ca on ca.id = s.canal_id
      join public.bot_canal_config b on b.canal_id = s.canal_id
     where s.organizacao_id = p_org and s.conversa_id is not null
       and s.status = 'ativa'
       and coalesce((s.dados->>'desativado_manual')::boolean, false) = false
       and b.ia_enabled and ca.status_integracao::text = 'conectado' and ca.ativo is not false
       and coalesce((b.iris_config->>'ativo')::boolean, false)
     order by s.conversa_id, s.atualizado_em desc
  ), d as (
    select s.conversa_id as conv, c.contato_id as cont, ct.nome as ct_nome, ct.telefone as ct_tel, s.etapa as et,
           -- o começo deste atendimento: o último recomeço do zero (a linha da sessão é reaproveitada)
           greatest(s.criado_em,
                    case when pg_input_is_valid(s.dados->>'reativada_fluxo_zero_em', 'timestamptz')
                         then (s.dados->>'reativada_fluxo_zero_em')::timestamptz end,
                    case when pg_input_is_valid(s.dados->>'recomeco_anuncio_em', 'timestamptz')
                         then (s.dados->>'recomeco_anuncio_em')::timestamptz end,
                    case when pg_input_is_valid(s.dados->>'recomeco_manual_em', 'timestamptz')
                         then (s.dados->>'recomeco_manual_em')::timestamptz end) as ini,
           s.dados as dd, ca.nome_interno as num, ca.campanha as num_camp,
           coalesce(c.atendente_id, ct.responsavel_id,
                    (select o.responsavel_id from public.oportunidades o
                      where o.contato_id = c.contato_id and o.status = 'em_andamento'
                      order by o.criado_em desc limit 1)) as dono,
           -- o tráfego pela régua das entradas do Dashboard: a origem do card (o aberto; sem ele, o mais recente)
           public.dash_v5_campanha(coalesce(
             (select o.canal_origem_id from public.oportunidades o
               where o.contato_id = c.contato_id and o.canal_origem_id is not null
               order by (o.status = 'em_andamento') desc, o.criado_em desc limit 1),
             ct.canal_origem_id, c.canal_origem_id, s.canal_id)) as camp
      from ses s
      join public.conversas c on c.id = s.conversa_id and c.organizacao_id = p_org
      join public.contatos ct on ct.id = c.contato_id
      join public.canais ca on ca.id = s.canal_id
  )
  select d.cont, d.conv, d.ct_nome, d.ct_tel, d.dono, d.camp, d.num, d.num_camp, d.et, d.ini,
         mi.em, mo.em, mo.origem,
         -- o cliente respondeu a Iris (escreveu depois da 1ª mensagem DELA neste atendimento); null = ela ainda não escreveu,
         -- ou escreveu há menos de 24 h (ainda não dá para dizer que ele "nunca respondeu")
         case when pb.em is null then null
              when mi.em > pb.em then true
              when pb.em > now() - interval '24 hours' then null
              else false end,
         nullif(btrim(d.dd->>'aguardando_humano'), ''), e.categoria
    from d
    left join lateral (
      select coalesce(m.enviada_em, m.criado_em) as em from public.mensagens m
       where m.conversa_id = d.conv and m.direcao = 'entrada' and m.tipo not in ('sistema', 'nota_interna')
       order by coalesce(m.enviada_em, m.criado_em) desc limit 1) mi on true
    left join lateral (
      -- a agendada em nome da Iris (origem 'atenvo', autor 'iris') conta como dela
      select coalesce(m.enviada_em, m.criado_em) as em,
             case when m.origem::text = 'bot' or m.metadados->>'autor' = 'iris' then 'bot' else m.origem::text end as origem
        from public.mensagens m
       where m.conversa_id = d.conv and m.direcao = 'saida' and m.tipo not in ('sistema', 'nota_interna')
       order by coalesce(m.enviada_em, m.criado_em) desc limit 1) mo on true
    left join lateral (
      -- a 1ª mensagem DA IRIS neste atendimento (as perguntas do robô não contam)
      select min(coalesce(m.enviada_em, m.criado_em)) as em from public.mensagens m
       where m.conversa_id = d.conv and m.direcao = 'saida' and m.tipo not in ('sistema', 'nota_interna')
         and (m.metadados->>'fluxo' = 'ia_sdr' or m.metadados->>'autor' = 'iris')
         and coalesce(m.enviada_em, m.criado_em) >= d.ini) pb on true
    left join public.fila_iris_estado e on e.contato_id = d.cont
   where v_admin or d.dono = v_eu;
end;
$$;

revoke all on function public.fila_iris_iris_agora(uuid) from public, anon;
grant execute on function public.fila_iris_iris_agora(uuid) to authenticated;
