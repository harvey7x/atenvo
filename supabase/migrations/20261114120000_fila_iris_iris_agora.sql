-- =====================================================================================
-- Fila da Iris — A IRIS AGORA e os ADICIONADOS por atendente (dono 14/11: "preciso saber quantas pessoas a Iris
-- está atendendo… e de quem que é os clientes… quanto tempo a Iris está atendendo esse cliente… quando a Iris
-- mandar um cliente com cliente sem resposta, eu preciso saber quanto que foi adicionado no dia… quando eu alterar
-- para 7 dias… quantos chegaram em 7 dias… e de qual tráfego é o lead").
-- 1) fila_iris_iris_agora(org): os clientes que a Iris está atendendo AGORA — a MESMA régua do selo "Iris atendendo"
--    do WhatsApp e da trava do envio (ia_atendendo_agora: sessão 'ativa', sem desativado_manual, número da sessão
--    conectado com a IA ligada) e só nos números com a Iris (iris_config.ativo). Por cliente: o dono (a regra da
--    fila: atendente da conversa → responsável do contato → card aberto), o tráfego (canais.campanha da ORIGEM do
--    lead, como o Dashboard: dash_v5_campanha), o número da sessão (e a campanha dele), a etapa, desde quando (começo
--    da sessão), a última mensagem do cliente e a nossa (da tabela mensagens — a verdade), se o cliente já respondeu a
--    Iris neste atendimento, o pedido de atendente e a categoria na fila. Administrador vê todos; atendente, só os dele.
-- 2) fila_iris_chegadas(org, início, fim): quantos clientes a Iris PASSOU para a fila de cada atendente, por
--    categoria, no período — o registro do "a Iris passou para você" (fila_iris_avisos, desde 12/11 13:45), pela
--    hora da passagem. Administrador vê a equipe; atendente, a própria linha. Devolve também o começo do registro.
-- 3) o registro passa a ficar 400 dias (era 30): "mês passado" precisa dele inteiro. Só a faxina muda.
-- Nada muda nos clientes, nas conversas, na Iris nem no robô.
-- =====================================================================================
set lock_timeout = '5s';

-- ---------------------------------------------------------------- 1) a Iris agora
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
           s.criado_em as ini, s.dados as dd, ca.nome_interno as num, ca.campanha as num_camp,
           coalesce(c.atendente_id, ct.responsavel_id,
                    (select o.responsavel_id from public.oportunidades o
                      where o.contato_id = c.contato_id and o.status = 'em_andamento'
                      order by o.criado_em desc limit 1)) as dono,
           public.dash_v5_campanha(coalesce(c.canal_origem_id, ct.canal_origem_id, s.canal_id)) as camp
      from ses s
      join public.conversas c on c.id = s.conversa_id and c.organizacao_id = p_org
      join public.contatos ct on ct.id = c.contato_id
      join public.canais ca on ca.id = s.canal_id
  )
  select d.cont, d.conv, d.ct_nome, d.ct_tel, d.dono, d.camp, d.num, d.num_camp, d.et, d.ini,
         mi.em, mo.em, mo.origem,
         -- o cliente respondeu a Iris (escreveu depois da 1ª mensagem dela neste atendimento); null = ela ainda não escreveu
         case when pb.em is null then null else coalesce(mi.em > pb.em, false) end,
         nullif(btrim(d.dd->>'aguardando_humano'), ''), e.categoria
    from d
    left join lateral (
      select coalesce(m.enviada_em, m.criado_em) as em from public.mensagens m
       where m.conversa_id = d.conv and m.direcao = 'entrada' and m.tipo not in ('sistema', 'nota_interna')
       order by coalesce(m.enviada_em, m.criado_em) desc limit 1) mi on true
    left join lateral (
      select coalesce(m.enviada_em, m.criado_em) as em, m.origem::text as origem from public.mensagens m
       where m.conversa_id = d.conv and m.direcao = 'saida' and m.tipo not in ('sistema', 'nota_interna')
       order by coalesce(m.enviada_em, m.criado_em) desc limit 1) mo on true
    left join lateral (
      select min(coalesce(m.enviada_em, m.criado_em)) as em from public.mensagens m
       where m.conversa_id = d.conv and m.direcao = 'saida' and m.origem::text = 'bot' and m.tipo not in ('sistema', 'nota_interna')
         and coalesce(m.enviada_em, m.criado_em) >= d.ini - interval '10 minutes') pb on true
    left join public.fila_iris_estado e on e.contato_id = d.cont
   where v_admin or d.dono = v_eu;
end;
$$;

-- ---------------------------------------------------------------- 2) adicionados no período
create or replace function public.fila_iris_chegadas(p_org uuid, p_inicio timestamptz, p_fim timestamptz)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_eu uuid := auth.uid();
  v_admin boolean;
  v_linhas jsonb;
  v_desde timestamptz;
begin
  if v_eu is null or not public.fila_iris_acesso(p_org) then
    raise exception 'Sem acesso à Fila da Iris.' using errcode = '42501';
  end if;
  v_admin := coalesce(public.papel_na_org(p_org)::text, '') = 'admin';
  select coalesce(jsonb_agg(jsonb_build_object('usuario_id', x.usuario_id, 'categoria', x.categoria, 'n', x.n)
                            order by x.usuario_id, x.categoria), '[]'::jsonb)
    into v_linhas
    from (select a.usuario_id, a.categoria, count(*)::int as n
            from public.fila_iris_avisos a
           where a.organizacao_id = p_org and a.passou_em >= p_inicio and a.passou_em < p_fim
             and (v_admin or a.usuario_id = v_eu)
           group by a.usuario_id, a.categoria) x;
  -- o começo do registro (a tela avisa quando o período começa antes dele)
  select min(a.criado_em) into v_desde from public.fila_iris_avisos a where a.organizacao_id = p_org;
  return jsonb_build_object('linhas', v_linhas, 'desde', v_desde);
end;
$$;

revoke all on function public.fila_iris_iris_agora(uuid) from public, anon;
revoke all on function public.fila_iris_chegadas(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.fila_iris_iris_agora(uuid) to authenticated;
grant execute on function public.fila_iris_chegadas(uuid, timestamptz, timestamptz) to authenticated;

-- ---------------------------------------------------------------- 3) o registro fica 400 dias
-- só a faxina muda: a definição VIVA do relógio é regravada com o intervalo trocado (trava: o corpo vivo tem de ser o
-- conferido em 14/11 e ter a faxina de 30 dias uma vez só)
do $faxina$
declare
  v_md5 text;
  v_def text;
  v_n integer;
begin
  select md5(prosrc) into v_md5 from pg_proc where oid = 'public.fila_iris_avisos_tick()'::regprocedure;
  if v_md5 is distinct from '6cd769702aee2964e351bf2dcf7b5360' then
    raise exception 'fila_iris_avisos_tick mudou depois de 14/11 (md5 %): confira antes de aplicar', v_md5;
  end if;
  v_def := pg_get_functiondef('public.fila_iris_avisos_tick()'::regprocedure);
  v_n := (length(v_def) - length(replace(v_def, 'interval ''30 days''', ''))) / length('interval ''30 days''');
  if v_n <> 1 then
    raise exception 'fila_iris_avisos_tick: a faxina de 30 dias aparece % vezes (esperado 1)', v_n;
  end if;
  execute replace(v_def, 'interval ''30 days''', 'interval ''400 days''');
end
$faxina$;
