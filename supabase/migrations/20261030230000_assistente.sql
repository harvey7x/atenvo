-- =============================================================================
-- ASSISTENTE DE IA DO ATENVO (balão no canto inferior direito) — pedido do dono 30/10/2026:
-- "um balãozinho no canto inferior direito… a gente consegue perguntar e ela puxar dados e
--  responder… o atendente pergunta 'o que eu tenho de cliente para resolver?', 'quantos clientes
--  eu fechei hoje'… o administrativo pergunta sobre cada pessoa".
--
-- Só a edge function `assistente` chama estas RPCs (service_role), com o id de quem pergunta
-- (p_ator) já autenticado. Cada RPC confere o vínculo ATIVO do ator na org (o mesmo critério do
-- is_member: sem vínculo ativo ou com senha provisória → exceção 'sem_acesso').
--
-- ESCOPO POR PAPEL (dono 22/10): papel 'admin' na org (organizacao_usuarios.papel) vê a equipe
-- inteira e pode perguntar de qualquer pessoa; os demais veem SÓ a própria carteira — para um
-- atendente com p_alvo ≠ ele a resposta é {"erro":"sem_acesso"}. O servidor recorta; o prompt só
-- reforça. Dono do cliente = o critério do bom dia / Central de Avisos (coalesce(responsavel_id,
-- atendente_id) nas conversas; contatos.responsavel_id em novos e presenciais).
--
-- NÚMEROS QUE BATEM COM O SISTEMA (nada de contagem nova):
--   fechados / vendedor     dash_v5_fechamentos tipo 'ganho', vendedor = credito_id (regra do
--                           administrativo do CAF — o pódio e o Dashboard); não elegíveis = 'ne';
--   entradas / campanha     count(dash_v5_entradas) + count(dash_v5_anuncio where ja_estava)
--                           (= kpis.entradas do Dashboard, por dia), campanha = dash_v5_trafego;
--   novos, sem resposta,    os MESMOS predicados do bloco VENDEDOR de bom_dia_resumo
--   passados, presenciais   (20261030220000_bom_dia_pos_folga.sql), agora por dono;
--   IA atendeu              ia_sessoes criadas no período, sem o número interno (bloco GESTOR);
--   mês                     mês do CAF (dia 11 → dia 10, adm_mes_inicio).
--   placar oficial (N1)     período = um mês do CAF INTEIRO, já fechado, com o placar INFORMADO pelo
--                           administrativo (adm_placar.informado — set/2026: sistema 91 × pódio 110):
--                           fechados (total e por vendedor) saem do placar do CAF, "fonte":"placar_caf";
--                           nos demais casos "fonte":"sistema" (assistente_placar_oficial).
--
-- PRIVACIDADE: nunca telefone, CPF, senha ou e-mail de cliente. Só nomes (e-mail e sequências de
-- dígitos mascarados — há contato cujo "nome" é o e-mail ou o próprio número), números, datas e
-- etapa. Trecho de mensagem ≤ 80 caracteres: texto que fala de senha vira '[mensagem com senha]';
-- e-mails (inteiros, parciais e falados) e sequências numéricas ('\(?\d[\d.,\-/ ()]{2,}\d': CPF com
-- ponto ou vírgula, telefone com o DDD entre parênteses) viram '••••'.
--
-- Datas 'AAAA-MM-DD'; horários com offset -03:00. p_inicio/p_fim = dias inclusivos no fuso de SP:
-- janela [p_inicio 00:00, p_fim+1 00:00) em America/Sao_Paulo, cortada em now().
--
-- Tabelas: assistente_uso (teto de perguntas por pessoa por dia — o crédito do Gemini é o MESMO
-- da IA de vendas) e assistente_log (pergunta, resposta, ferramentas, erro, ms). RLS ligada, sem
-- policy, sem grant para anon/authenticated; só service_role (GOTCHA: tabela nova não herda grant).
-- =============================================================================

-- ---------------------------------------------------------------- tabelas
create table if not exists public.assistente_uso (
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  usuario_id     uuid not null references public.usuarios(id) on delete cascade,
  dia            date not null,
  n              int  not null default 0,
  primary key (usuario_id, dia)
);
alter table public.assistente_uso enable row level security;
revoke all on public.assistente_uso from public, anon, authenticated;
grant select, insert, update on public.assistente_uso to service_role;

create table if not exists public.assistente_log (
  id             bigserial primary key,
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  usuario_id     uuid references public.usuarios(id) on delete set null,
  pergunta       text not null,
  resposta       text,
  ferramentas    jsonb,
  erro           text,
  ms             int,
  criado_em      timestamptz not null default now()
);
create index if not exists idx_assistente_log_org_criado on public.assistente_log (organizacao_id, criado_em desc);
alter table public.assistente_log enable row level security;
revoke all on public.assistente_log from public, anon, authenticated;
revoke all on sequence public.assistente_log_id_seq from public, anon, authenticated;
grant select, insert on public.assistente_log to service_role;
grant usage, select on sequence public.assistente_log_id_seq to service_role;

-- ---------------------------------------------------------------- helpers internos (sem grant)

-- quem pergunta: 'admin' | 'membro' | null (sem vínculo ativo, ou com senha provisória — is_member)
create or replace function public.assistente_papel(p_org uuid, p_ator uuid)
returns text
language sql stable
set search_path = public, pg_temp
as $$
  select case when ou.papel::text = 'admin' then 'admin' else 'membro' end
  from public.organizacao_usuarios ou
  where ou.organizacao_id = p_org and ou.usuario_id = p_ator and ou.status = 'ativo'
    and not exists (select 1 from public.usuarios u where u.id = p_ator and u.deve_trocar_senha)
  limit 1
$$;

-- nome de exibição de alguém da equipe (o mesmo do sistema: usuarios.nome)
create or replace function public.assistente_nome_usuario(p_uid uuid)
returns text
language sql stable
set search_path = public, pg_temp
as $$
  select nullif(btrim(u.nome), '') from public.usuarios u where u.id = p_uid
$$;

-- nome do cliente sem dado de contato (S1, revisão 30/10): o e-mail ANTES dos dígitos (há contatos cujo
-- "nome" é o e-mail, alguns pela metade — sem o ".com", ou cortados logo depois do "@": por isso o TLD e o
-- domínio são opcionais) e depois as sequências de dígitos (há contato cujo nome é o telefone; a mesma
-- classe do trecho, com o "(" do DDD). Sem letra que sobre → 'Cliente sem nome'. (A edge function repete
-- a máscara na saída — logica.ts, mascararNomeCliente.)
create or replace function public.assistente_nome_cliente(p_nome text)
returns text
language sql immutable
set search_path = public, pg_temp
as $$
  select case when s.x ~ '[[:alpha:]]' then s.x else 'Cliente sem nome' end
  from (select btrim(regexp_replace(regexp_replace(regexp_replace(coalesce(p_nome, ''), '\s+', ' ', 'g'),
                                    '[[:alnum:]._%+-]+@([[:alnum:].-]+(\.[[:alpha:]]{2,})?)?', '••••', 'g'),
                     '\(?\d[\d.,\-/ ()]{2,}\d', '••••', 'g')) as x) s
$$;

-- trecho de mensagem (S3, revisão 30/10): ≤ 80 caracteres; texto que fala de senha (sem olhar a caixa)
-- vira '[mensagem com senha]'; e-mails — inteiros, pela metade e falados ("fulano arroba gmail ponto
-- com") — e sequências numéricas com ponto, vírgula, traço, barra, espaço ou parênteses (CPF
-- 123,456,789,00, telefone (11)98765-4321, com o "(" do DDD) viram ••••; mídia sem texto vira rótulo.
-- (A edge function repete a máscara na saída — logica.ts, mascararTrecho.)
create or replace function public.assistente_trecho(p_tipo text, p_txt text)
returns text
language sql immutable
set search_path = public, pg_temp
as $$
  select case
    when coalesce(btrim(p_txt), '') <> '' and p_txt ~* 'senha' then '[mensagem com senha]'
    when coalesce(btrim(p_txt), '') <> '' then
      (select case when char_length(t) > 80 then left(t, 79) || '…' else t end
         from (select btrim(regexp_replace(regexp_replace(regexp_replace(
                      regexp_replace(p_txt, '\s+', ' ', 'g'),
                      '[[:alnum:]._%+-]+@([[:alnum:].-]+(\.[[:alpha:]]{2,})?)?', '••••', 'g'),
                      '[[:alnum:]._%+-]+ arroba [[:alnum:]._-]+( ponto [[:alpha:]]+)*', '••••', 'gi'),
                      '\(?\d[\d.,\-/ ()]{2,}\d', '••••', 'g')) as t) y)
    when p_tipo = 'audio' then '[áudio]'
    when p_tipo = 'imagem' then '[imagem]'
    when p_tipo = 'video' then '[vídeo]'
    when p_tipo = 'documento' then '[documento]'
  end
$$;

-- texto normalizado para busca: minúsculas, sem acento, só letras/dígitos/espaço
create or replace function public.assistente_norm(p_txt text)
returns text
language sql immutable
set search_path = public, pg_temp
as $$
  select btrim(regexp_replace(regexp_replace(lower(translate(coalesce(p_txt, ''),
    'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
    'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN')), '[^a-z0-9]+', ' ', 'g'), '\s+', ' ', 'g'))
$$;

-- instante com o fuso do CAF: 'AAAA-MM-DDTHH:MI:SS-03:00' (o Brasil não tem horário de verão desde 2019)
create or replace function public.assistente_iso(p_ts timestamptz)
returns text
language sql stable
set search_path = public, pg_temp
as $$
  select to_char(p_ts at time zone 'America/Sao_Paulo', 'YYYY-MM-DD"T"HH24:MI:SS') || '-03:00'
$$;

-- "novos" do bom dia: desde a hora de fechar da Central de Avisos (18h) do último dia útil
create or replace function public.assistente_novos_desde(p_org uuid)
returns timestamptz
language sql stable
set search_path = public, pg_temp
as $$
  select (public.bom_dia_ultimo_util((now() at time zone 'America/Sao_Paulo')::date)
          + make_time(coalesce((select max(c.hora_fim) from public.vacuo_config c
                                where c.organizacao_id = p_org), 18)::int, 0, 0))
         at time zone 'America/Sao_Paulo'
$$;

-- SEM RESPOSTA — o bloco "esperando" do bom_dia_resumo (VENDEDOR), por dono: conversa aberta, mensagem
-- do cliente sem resposta humana, robô fora do início, IA não atendendo, fora perdido/NE, 14 dias;
-- fechado que só agradeceu não conta. esperando_desde = 1ª mensagem do cliente depois da última humana.
create or replace function public.assistente_q_sem_resposta(p_org uuid, p_donos uuid[])
returns table (conversa_id uuid, contato_id uuid, dono uuid, esperando_desde timestamptz)
language sql stable
set search_path = public, pg_temp
as $$
  select c.id, c.contato_id, coalesce(ct.responsavel_id, c.atendente_id), pend.pri_in
  from public.conversas c
  left join public.contatos ct on ct.id = c.contato_id
  left join public.bot_conversa_estado e on e.conversa_id = c.id
  left join lateral (
    select max(coalesce(m.recebida_em, m.criado_em)) filter (where m.direcao = 'entrada') as ult_in,
           max(coalesce(m.enviada_em, m.criado_em)) filter (where m.direcao = 'saida'
             and ((m.autor_id is not null and m.tipo not in ('sistema','nota_interna'))
                  or (m.autor_id is null and m.origem = 'telefone'))) as ult_humano
    from public.mensagens m where m.conversa_id = c.id
  ) um on true
  left join lateral (
    select exists (select 1 from public.oportunidades ogf
                   where ogf.contato_id = c.contato_id and ogf.organizacao_id = c.organizacao_id
                     and ogf.status = 'ganho') as fechado
  ) fe on true
  left join lateral (
    select min(coalesce(m.recebida_em, m.criado_em)) as pri_in
    from public.mensagens m
    where m.conversa_id = c.id and m.direcao = 'entrada'
      and coalesce(m.recebida_em, m.criado_em) > coalesce(um.ult_humano, '-infinity'::timestamptz)
      and not (fe.fechado and public.radar_so_agradecimento(m.tipo::text, m.conteudo))
  ) pend on true
  left join lateral (
    select bool_or(s.status = 'ativa') as ia_ativa
    from public.ia_sessoes s where s.conversa_id = c.id
  ) ia on true
  where c.organizacao_id = p_org
    and c.arquivada_em is null
    and c.status in ('aberta','em_atendimento','pendente')
    and coalesce(ct.responsavel_id, c.atendente_id) = any (p_donos)
    and c.ultima_entrada_em >= now() - interval '14 days'
    and um.ult_in is not null
    and (um.ult_humano is null or um.ult_humano < um.ult_in)
    and pend.pri_in is not null
    and coalesce(e.etapa, '') <> 'inicio'
    and not coalesce(ia.ia_ativa, false)
    and not public.bom_dia_fora_do_atendimento(p_org, c.contato_id)
$$;

-- PASSADOS — o bloco "passados" do bom_dia_resumo, por dono: o robô/IA passou para humano nos últimos
-- 7 dias e ninguém da equipe respondeu depois. esperando_desde = quando passou (precisa_humano_em).
create or replace function public.assistente_q_passados(p_org uuid, p_donos uuid[])
returns table (conversa_id uuid, contato_id uuid, dono uuid, esperando_desde timestamptz)
language sql stable
set search_path = public, pg_temp
as $$
  select c.id, c.contato_id, coalesce(ct.responsavel_id, c.atendente_id), c.precisa_humano_em
  from public.conversas c
  left join public.contatos ct on ct.id = c.contato_id
  where c.organizacao_id = p_org
    and c.precisa_humano
    and c.precisa_humano_em >= now() - interval '7 days'
    and c.arquivada_em is null
    and c.status in ('aberta','em_atendimento','pendente')
    and coalesce(ct.responsavel_id, c.atendente_id) = any (p_donos)
    and not exists (
      select 1 from public.mensagens m
      where m.conversa_id = c.id and m.direcao = 'saida'
        and coalesce(m.enviada_em, m.criado_em) > c.precisa_humano_em
        and ((m.autor_id is not null and m.tipo not in ('sistema','nota_interna'))
             or (m.autor_id is null and m.origem = 'telefone')))
    and not public.bom_dia_fora_do_atendimento(p_org, c.contato_id)
$$;

-- NOVOS — o bloco "novos" do bom_dia_resumo, por dono (contatos.responsavel_id)
create or replace function public.assistente_q_novos(p_org uuid, p_donos uuid[])
returns table (contato_id uuid, dono uuid)
language sql stable
set search_path = public, pg_temp
as $$
  select ct.id, ct.responsavel_id
  from public.contatos ct
  where ct.organizacao_id = p_org
    and ct.responsavel_id = any (p_donos)
    and ct.mesclado_para is null
    and ct.criado_em >= (select public.assistente_novos_desde(p_org))
    and not public.bom_dia_fora_do_atendimento(p_org, ct.id)
$$;

-- PRESENCIAIS DE HOJE — o bloco "presenciais" do bom_dia_resumo, por dono (contatos.responsavel_id)
create or replace function public.assistente_q_presenciais(p_org uuid, p_donos uuid[])
returns table (presencial_id uuid, contato_id uuid, dono uuid, quando timestamptz, cliente_nome text)
language sql stable
set search_path = public, pg_temp
as $$
  select p.id, p.contato_id, ct.responsavel_id, p.quando, p.cliente_nome
  from public.presenciais p
  join public.contatos ct on ct.id = p.contato_id
  where p.organizacao_id = p_org and p.status = 'marcado'
    and (p.quando at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date
    and ct.responsavel_id = any (p_donos)
$$;

-- lista de clientes esperando (sem resposta / passados), quem espera há MAIS tempo primeiro
create or replace function public.assistente_lista_espera(p_org uuid, p_tipo text, p_donos uuid[], p_limite int)
returns jsonb
language sql stable
set search_path = public, pg_temp
as $$
  with q as (
    select * from public.assistente_q_sem_resposta(p_org, p_donos) where p_tipo = 'sem_resposta'
    union all
    select * from public.assistente_q_passados(p_org, p_donos) where p_tipo = 'passados'
  ),
  ord as (select q.*, row_number() over (order by q.esperando_desde, q.conversa_id) as rn from q)
  select jsonb_build_object(
    'total', (select count(*) from q),
    'clientes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'conversa_id', o.conversa_id,
               'cliente', public.assistente_nome_cliente(ct.nome),
               'responsavel', coalesce(public.assistente_nome_usuario(o.dono), 'Sem dono'),
               'esperando_desde', public.assistente_iso(o.esperando_desde),
               'minutos', greatest(0, floor(extract(epoch from now() - o.esperando_desde) / 60))::int,
               'ultima_msg', lm.txt) order by o.rn)
      from ord o
      left join public.contatos ct on ct.id = o.contato_id
      left join lateral (
        select public.assistente_trecho(m.tipo::text, m.conteudo) as txt
        from public.mensagens m
        where m.conversa_id = o.conversa_id and m.direcao = 'entrada'
        order by coalesce(m.recebida_em, m.criado_em) desc
        limit 1
      ) lm on true
      where o.rn <= p_limite), '[]'::jsonb))
$$;

-- presenciais marcados para hoje (lista), na ordem do horário
create or replace function public.assistente_lista_presenciais(p_org uuid, p_donos uuid[], p_limite int)
returns jsonb
language sql stable
set search_path = public, pg_temp
as $$
  with q as (select * from public.assistente_q_presenciais(p_org, p_donos)),
  ord as (select q.*, row_number() over (order by q.quando, q.presencial_id) as rn from q)
  select jsonb_build_object(
    'total', (select count(*) from q),
    'clientes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'conversa_id', cv.id,
               'cliente', public.assistente_nome_cliente(coalesce(nullif(btrim(o.cliente_nome), ''), ct.nome)),
               'responsavel', coalesce(public.assistente_nome_usuario(o.dono), 'Sem dono'),
               'hora', to_char(o.quando at time zone 'America/Sao_Paulo', 'HH24:MI')) order by o.rn)
      from ord o
      left join public.contatos ct on ct.id = o.contato_id
      left join lateral (
        select c.id from public.conversas c
        where c.contato_id = o.contato_id and c.organizacao_id = p_org
        order by (c.arquivada_em is null) desc, c.ultima_interacao_em desc nulls last
        limit 1
      ) cv on true
      where o.rn <= p_limite), '[]'::jsonb))
$$;

-- período inclusivo (dias de SP) → objeto {inicio, fim}
create or replace function public.assistente_periodo(p_inicio date, p_fim date)
returns jsonb
language sql immutable
set search_path = public, pg_temp
as $$
  select jsonb_build_object('inicio', to_char(p_inicio, 'YYYY-MM-DD'), 'fim', to_char(p_fim, 'YYYY-MM-DD'))
$$;

-- N1 (revisão 30/10): o placar OFICIAL do CAF quando o período é EXATAMENTE um mês do CAF inteiro (dia 11 →
-- dia 10), já fechado (o dia 10 ficou para trás) e com o placar INFORMADO pelo administrativo
-- (adm_placar.informado — set/2026: 45/44/21; o sistema conta 91 × 110 do pódio, e o Dashboard também).
-- Nos outros períodos não devolve nada e vale o sistema (que, com adm_casos, já segue a regra do pódio).
-- Uma linha por vendedor do placar: o usuário do Atenvo pelo nome (adm_usuario_do_vendedor — o mesmo
-- casamento que o placar faz em dash_v5_fechamentos), o nome de exibição e os completos do mês.
create or replace function public.assistente_placar_oficial(p_org uuid, p_inicio date, p_fim date)
returns table (usuario_id uuid, nome text, n int)
language sql stable
set search_path = public, pg_temp
as $$
  select u.id, coalesce(public.assistente_nome_usuario(u.id), p.vendedor), p.completos
  from public.adm_placar p
  cross join lateral (select public.adm_usuario_do_vendedor(p_org, p.vendedor) as id) u
  where p.organizacao_id = p_org
    and p.mes = p_inicio
    and public.adm_mes_inicio((p_inicio::timestamp) at time zone 'America/Sao_Paulo') = p_inicio
    and p_fim = (p_inicio + interval '1 month')::date - 1
    and p_fim < (now() at time zone 'America/Sao_Paulo')::date
    and (select bool_and(q.informado) from public.adm_placar q
         where q.organizacao_id = p_org and q.mes = p_inicio)
$$;

-- ---------------------------------------------------------------- RPCs (só service_role)

-- 1. contexto de quem pergunta: hoje, mês do CAF, último dia útil e (só admin) a equipe
create or replace function public.assistente_contexto(p_org uuid, p_ator uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_papel text := public.assistente_papel(p_org, p_ator);
  v_agora timestamp := now() at time zone 'America/Sao_Paulo';
  v_hoje  date := (now() at time zone 'America/Sao_Paulo')::date;
  v_mes   date := public.adm_mes_inicio(now());
begin
  if v_papel is null then
    raise exception 'sem_acesso' using errcode = 'insufficient_privilege';
  end if;
  return jsonb_build_object(
    'ator', jsonb_build_object('id', p_ator, 'nome', coalesce(public.assistente_nome_usuario(p_ator), 'Equipe'),
                               'admin', v_papel = 'admin'),
    'hoje', to_char(v_hoje, 'YYYY-MM-DD'),
    'agora', to_char(v_agora, 'HH24:MI'),
    'dia_semana', (array['segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira',
                         'sábado','domingo'])[extract(isodow from v_hoje)::int],
    'ultimo_dia_util', to_char(public.bom_dia_ultimo_util(v_hoje), 'YYYY-MM-DD'),
    'mes_caf', public.assistente_periodo(v_mes, (v_mes + interval '1 month')::date - 1),
    'mes_caf_anterior', public.assistente_periodo((v_mes - interval '1 month')::date, v_mes - 1),
    'equipe', case when v_papel = 'admin' then coalesce((
        select jsonb_agg(jsonb_build_object('id', u.id, 'nome', u.nome, 'papel', ou.papel) order by u.nome)
        from public.organizacao_usuarios ou
        join public.usuarios u on u.id = ou.usuario_id
        where ou.organizacao_id = p_org and ou.status = 'ativo'), '[]'::jsonb)
      else '[]'::jsonb end
  );
end
$$;

-- 2. a carteira de uma pessoa AGORA (alvo nulo = o ator) + fechados hoje e no mês do CAF
create or replace function public.assistente_carteira(p_org uuid, p_ator uuid, p_alvo uuid default null)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_papel text := public.assistente_papel(p_org, p_ator);
  v_alvo  uuid := coalesce(p_alvo, p_ator);
  v_hoje  date := (now() at time zone 'America/Sao_Paulo')::date;
  v_mes   date := public.adm_mes_inicio(now());
  v_donos uuid[];
begin
  if v_papel is null then
    raise exception 'sem_acesso' using errcode = 'insufficient_privilege';
  end if;
  if v_alvo <> p_ator then
    if v_papel <> 'admin' then return jsonb_build_object('erro', 'sem_acesso'); end if;
    if not exists (select 1 from public.organizacao_usuarios ou
                   where ou.organizacao_id = p_org and ou.usuario_id = v_alvo) then
      return jsonb_build_object('erro', 'pessoa_nao_encontrada');
    end if;
  end if;
  v_donos := array[v_alvo];
  return jsonb_build_object(
    'pessoa', jsonb_build_object('id', v_alvo, 'nome', coalesce(public.assistente_nome_usuario(v_alvo), 'Equipe')),
    'novos', (select count(*) from public.assistente_q_novos(p_org, v_donos)),
    'sem_resposta', (select count(*) from public.assistente_q_sem_resposta(p_org, v_donos)),
    'passados', (select count(*) from public.assistente_q_passados(p_org, v_donos)),
    'presenciais_hoje', (select count(*) from public.assistente_q_presenciais(p_org, v_donos)),
    'fechados_hoje', (select count(*) from public.dash_v5_fechamentos(p_org,
                        (v_hoje::timestamp) at time zone 'America/Sao_Paulo', now()) f
                      where f.tipo = 'ganho' and f.credito_id = v_alvo),
    'fechados_mes', (select count(*) from public.dash_v5_fechamentos(p_org,
                       (v_mes::timestamp) at time zone 'America/Sao_Paulo', now()) f
                     where f.tipo = 'ganho' and f.credito_id = v_alvo),
    'mes_caf', public.assistente_periodo(v_mes, (v_mes + interval '1 month')::date - 1)
  );
end
$$;

-- 3. os clientes para resolver: sem resposta, passados e presenciais de hoje (listas + total real).
--    Atendente: a própria carteira. Admin + alvo: a pessoa. Admin sem alvo: a equipe inteira.
create or replace function public.assistente_pendentes(p_org uuid, p_ator uuid, p_alvo uuid default null,
                                                        p_limite int default 10)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_papel  text := public.assistente_papel(p_org, p_ator);
  v_lim    int := least(greatest(coalesce(p_limite, 10), 1), 20);
  v_alvo   uuid;
  v_donos  uuid[];
begin
  if v_papel is null then
    raise exception 'sem_acesso' using errcode = 'insufficient_privilege';
  end if;
  if v_papel <> 'admin' then
    if p_alvo is not null and p_alvo <> p_ator then return jsonb_build_object('erro', 'sem_acesso'); end if;
    v_alvo := p_ator;
  elsif p_alvo is not null then
    if not exists (select 1 from public.organizacao_usuarios ou
                   where ou.organizacao_id = p_org and ou.usuario_id = p_alvo) then
      return jsonb_build_object('erro', 'pessoa_nao_encontrada');
    end if;
    v_alvo := p_alvo;
  end if;
  if v_alvo is not null then
    v_donos := array[v_alvo];
  else
    select coalesce(array_agg(ou.usuario_id), '{}'::uuid[]) into v_donos
    from public.organizacao_usuarios ou
    where ou.organizacao_id = p_org and ou.status = 'ativo';
  end if;
  return jsonb_build_object(
    'escopo', case when v_alvo is null then 'equipe' else 'pessoa' end,
    'pessoa', case when v_alvo is null then null else
                jsonb_build_object('id', v_alvo, 'nome', coalesce(public.assistente_nome_usuario(v_alvo), 'Equipe')) end,
    'sem_resposta', public.assistente_lista_espera(p_org, 'sem_resposta', v_donos, v_lim),
    'passados', public.assistente_lista_espera(p_org, 'passados', v_donos, v_lim),
    'presenciais_hoje', public.assistente_lista_presenciais(p_org, v_donos, v_lim)
  );
end
$$;

-- 4. fechados de um período (dias inclusivos de SP). Atendente (ou admin com alvo): os dela/dele,
--    pelo crédito do vendedor. Admin sem alvo: a equipe, com o placar por vendedor e os não elegíveis.
--    N1: mês do CAF inteiro, já fechado, com placar informado → total e por vendedor do placar OFICIAL
--    ("fonte":"placar_caf"); a lista de clientes e os não elegíveis seguem do sistema. Senão "sistema".
create or replace function public.assistente_fechados(p_org uuid, p_ator uuid, p_inicio date, p_fim date,
                                                       p_alvo uuid default null)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_papel text := public.assistente_papel(p_org, p_ator);
  v_alvo  uuid;
  v_ini   timestamptz;
  v_fim   timestamptz;
  v_oficial boolean;
  v_res   jsonb;
begin
  if v_papel is null then
    raise exception 'sem_acesso' using errcode = 'insufficient_privilege';
  end if;
  if p_inicio is null or p_fim is null or p_inicio > p_fim or p_fim - p_inicio > 400 then
    return jsonb_build_object('erro', 'periodo_invalido');
  end if;
  if v_papel <> 'admin' then
    if p_alvo is not null and p_alvo <> p_ator then return jsonb_build_object('erro', 'sem_acesso'); end if;
    v_alvo := p_ator;
  elsif p_alvo is not null then
    if not exists (select 1 from public.organizacao_usuarios ou
                   where ou.organizacao_id = p_org and ou.usuario_id = p_alvo) then
      return jsonb_build_object('erro', 'pessoa_nao_encontrada');
    end if;
    v_alvo := p_alvo;
  end if;
  v_ini := (p_inicio::timestamp) at time zone 'America/Sao_Paulo';
  v_fim := least(((p_fim + 1)::timestamp) at time zone 'America/Sao_Paulo', now());
  v_oficial := exists (select 1 from public.assistente_placar_oficial(p_org, p_inicio, p_fim));

  with f as (
    select x.tipo, x.contato_id, x.credito_id, x.fechado_em
    from public.dash_v5_fechamentos(p_org, v_ini, v_fim) x
  ),
  g as (
    select f.* from f
    where f.tipo = 'ganho' and (v_alvo is null or f.credito_id = v_alvo)
  ),
  lista as (
    select g.*, row_number() over (order by g.fechado_em desc, g.contato_id) as rn from g
  ),
  ofi as (
    select o.* from public.assistente_placar_oficial(p_org, p_inicio, p_fim) o where v_oficial
  )
  select jsonb_build_object(
    'periodo', public.assistente_periodo(p_inicio, p_fim),
    'escopo', case when v_alvo is null then 'equipe' else 'pessoa' end,
    'pessoa', case when v_alvo is null then null else
                jsonb_build_object('id', v_alvo, 'nome', coalesce(public.assistente_nome_usuario(v_alvo), 'Equipe')) end,
    'fonte', case when v_oficial then 'placar_caf' else 'sistema' end,
    'total', case when v_oficial
                  then (select coalesce(sum(o.n), 0) from ofi o where v_alvo is null or o.usuario_id = v_alvo)
                  else (select count(*) from g) end,
    'clientes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'cliente', public.assistente_nome_cliente(ct.nome),
               'vendedor', coalesce(public.assistente_nome_usuario(l.credito_id), 'Sem vendedor identificado'),
               'data', to_char(l.fechado_em at time zone 'America/Sao_Paulo', 'YYYY-MM-DD')) order by l.rn)
      from lista l
      left join public.contatos ct on ct.id = l.contato_id
      where l.rn <= 20), '[]'::jsonb)
  )
  || case when v_alvo is null then jsonb_build_object(
       'por_vendedor', case when v_oficial then coalesce((
           select jsonb_agg(jsonb_build_object('nome', o.nome, 'n', o.n) order by o.n desc, o.nome)
           from ofi o where o.n > 0), '[]'::jsonb)
         else coalesce((
           select jsonb_agg(jsonb_build_object('nome', v.nome, 'n', v.n) order by v.n desc, v.nome)
           from (select coalesce(public.assistente_nome_usuario(g.credito_id), 'Sem vendedor identificado') as nome,
                        count(*) as n
                 from g group by 1) v), '[]'::jsonb) end,
       'nao_elegiveis', (select count(*) from f where f.tipo = 'ne'))
     else '{}'::jsonb end
  into v_res;
  return v_res;
end
$$;

-- 5. a equipe (SÓ admin): por membro ativo, fechados do período e a carteira de agora (como o bom dia).
--    N1: mês do CAF inteiro, já fechado, com placar informado → fechados do placar OFICIAL ("fonte").
create or replace function public.assistente_equipe(p_org uuid, p_ator uuid, p_inicio date, p_fim date)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_papel text := public.assistente_papel(p_org, p_ator);
  v_ini   timestamptz;
  v_fim   timestamptz;
  v_donos uuid[];
  v_oficial boolean;
  v_res   jsonb;
begin
  if v_papel is null then
    raise exception 'sem_acesso' using errcode = 'insufficient_privilege';
  end if;
  if v_papel <> 'admin' then return jsonb_build_object('erro', 'sem_acesso'); end if;
  if p_inicio is null or p_fim is null or p_inicio > p_fim or p_fim - p_inicio > 400 then
    return jsonb_build_object('erro', 'periodo_invalido');
  end if;
  v_ini := (p_inicio::timestamp) at time zone 'America/Sao_Paulo';
  v_fim := least(((p_fim + 1)::timestamp) at time zone 'America/Sao_Paulo', now());
  v_oficial := exists (select 1 from public.assistente_placar_oficial(p_org, p_inicio, p_fim));
  select coalesce(array_agg(ou.usuario_id), '{}'::uuid[]) into v_donos
  from public.organizacao_usuarios ou
  where ou.organizacao_id = p_org and ou.status = 'ativo';

  with membros as (
    select u.id, u.nome, ou.papel::text as papel
    from public.organizacao_usuarios ou
    join public.usuarios u on u.id = ou.usuario_id
    where ou.organizacao_id = p_org and ou.status = 'ativo'
  ),
  fe as (select f.credito_id as uid, count(*) as n
         from public.dash_v5_fechamentos(p_org, v_ini, v_fim) f
         where not v_oficial and f.tipo = 'ganho' and f.credito_id is not null group by 1
         union all
         select o.usuario_id, sum(o.n)
         from public.assistente_placar_oficial(p_org, p_inicio, p_fim) o
         where v_oficial and o.usuario_id is not null group by 1),
  sr as (select q.dono as uid, count(*) as n from public.assistente_q_sem_resposta(p_org, v_donos) q group by 1),
  pa as (select q.dono as uid, count(*) as n from public.assistente_q_passados(p_org, v_donos) q group by 1),
  pr as (select q.dono as uid, count(*) as n from public.assistente_q_presenciais(p_org, v_donos) q group by 1),
  nv as (select q.dono as uid, count(*) as n from public.assistente_q_novos(p_org, v_donos) q group by 1)
  select jsonb_build_object(
    'periodo', public.assistente_periodo(p_inicio, p_fim),
    'fonte', case when v_oficial then 'placar_caf' else 'sistema' end,
    'membros', coalesce(jsonb_agg(jsonb_build_object(
        'id', m.id, 'nome', m.nome, 'papel', m.papel,
        'fechados', coalesce(fe.n, 0),
        'sem_resposta', coalesce(sr.n, 0),
        'passados', coalesce(pa.n, 0),
        'presenciais_hoje', coalesce(pr.n, 0),
        'novos', coalesce(nv.n, 0))
      order by coalesce(fe.n, 0) desc, m.nome), '[]'::jsonb))
  into v_res
  from membros m
  left join fe on fe.uid = m.id
  left join sr on sr.uid = m.id
  left join pa on pa.uid = m.id
  left join pr on pr.uid = m.id
  left join nv on nv.uid = m.id;
  return v_res;
end
$$;

-- 6. leads do período (SÓ admin): as entradas do Dashboard por campanha, não elegíveis, fechados, IA.
--    N1: os fechados seguem a mesma regra de assistente_fechados (placar oficial no mês do CAF fechado e
--    informado; "fonte"), para a assistente nunca dar dois números para o mesmo mês.
create or replace function public.assistente_leads(p_org uuid, p_ator uuid, p_inicio date, p_fim date)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_papel text := public.assistente_papel(p_org, p_ator);
  v_ini   timestamptz;
  v_fim   timestamptz;
  v_oficial boolean;
  v_res   jsonb;
begin
  if v_papel is null then
    raise exception 'sem_acesso' using errcode = 'insufficient_privilege';
  end if;
  if v_papel <> 'admin' then return jsonb_build_object('erro', 'sem_acesso'); end if;
  if p_inicio is null or p_fim is null or p_inicio > p_fim or p_fim - p_inicio > 400 then
    return jsonb_build_object('erro', 'periodo_invalido');
  end if;
  v_ini := (p_inicio::timestamp) at time zone 'America/Sao_Paulo';
  v_fim := least(((p_fim + 1)::timestamp) at time zone 'America/Sao_Paulo', now());
  v_oficial := exists (select 1 from public.assistente_placar_oficial(p_org, p_inicio, p_fim));

  with ent as (
    select e.canal_origem_id as canal from public.dash_v5_entradas(p_org, v_ini, v_fim) e
    union all
    select a.canal_id from public.dash_v5_anuncio(p_org, v_ini, v_fim) a where a.ja_estava
  ),
  fec as (
    select f.tipo, f.canal_origem_id from public.dash_v5_fechamentos(p_org, v_ini, v_fim) f
  )
  select jsonb_build_object(
    'periodo', public.assistente_periodo(p_inicio, p_fim),
    'entradas', (select count(*) from ent),
    'por_campanha', coalesce((
      select jsonb_agg(jsonb_build_object('campanha', x.campanha, 'n', x.n) order by x.n desc, x.campanha)
      from (select public.dash_v5_trafego(ent.canal) as campanha, count(*) as n from ent group by 1) x), '[]'::jsonb),
    'nao_elegiveis', (select count(*) from fec where fec.tipo = 'ne'),
    'ne_por_campanha', coalesce((
      select jsonb_agg(jsonb_build_object('campanha', x.campanha, 'n', x.n) order by x.n desc, x.campanha)
      from (select public.dash_v5_trafego(fec.canal_origem_id) as campanha, count(*) as n
            from fec where fec.tipo = 'ne' group by 1) x), '[]'::jsonb),
    'fonte', case when v_oficial then 'placar_caf' else 'sistema' end,
    'fechados', case when v_oficial
                     then (select coalesce(sum(o.n), 0) from public.assistente_placar_oficial(p_org, p_inicio, p_fim) o)
                     else (select count(*) from fec where fec.tipo = 'ganho') end,
    'ia_atendeu', (select count(*) from public.ia_sessoes s
                   left join public.contatos ct on ct.id = s.contato_id
                   where s.organizacao_id = p_org and s.criado_em >= v_ini and s.criado_em < v_fim
                     and not public.dash_v5_interno(ct.telefone))
  ) into v_res;
  return v_res;
end
$$;

-- 7. busca de cliente por nome (sem acento/caixa; ≥ 3 letras) dentro do escopo: atendente = a
--    carteira dela/dele (dono da conversa mais recente = coalesce(responsavel_id, atendente_id));
--    admin = todos. Quem começa com o termo vem primeiro; depois a conversa mais recente.
create or replace function public.assistente_cliente(p_org uuid, p_ator uuid, p_busca text, p_limite int default 5)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_papel text := public.assistente_papel(p_org, p_ator);
  v_busca text := public.assistente_norm(p_busca);
  v_lim   int := least(greatest(coalesce(p_limite, 5), 1), 20);
  v_res   jsonb;
begin
  if v_papel is null then
    raise exception 'sem_acesso' using errcode = 'insufficient_privilege';
  end if;
  if char_length(regexp_replace(v_busca, '[^a-z]', '', 'g')) < 3 then
    return jsonb_build_object('erro', 'busca_curta');
  end if;

  with cand as (
    select ct.id, ct.nome, ct.responsavel_id, public.assistente_norm(ct.nome) as nn
    from public.contatos ct
    where ct.organizacao_id = p_org and ct.mesclado_para is null
      and public.assistente_norm(ct.nome) like '%' || v_busca || '%'
      and not public.dash_v5_interno(ct.telefone)
  ),
  conv as (
    select cand.*, cv.id as conversa_id, coalesce(cand.responsavel_id, cv.atendente_id) as dono,
           cv.ultima_interacao_em
    from cand
    left join lateral (
      select c.id, c.atendente_id, c.ultima_interacao_em
      from public.conversas c
      where c.contato_id = cand.id and c.organizacao_id = p_org
      order by (c.arquivada_em is null) desc, c.ultima_interacao_em desc nulls last
      limit 1
    ) cv on true
  ),
  vis as (
    select conv.*, row_number() over (order by (conv.nn like v_busca || '%') desc,
                                               conv.ultima_interacao_em desc nulls last, conv.id) as rn
    from conv
    where v_papel = 'admin' or conv.dono = p_ator
  )
  select jsonb_build_object(
    'total', (select count(*) from vis),
    'clientes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'conversa_id', v.conversa_id,
               'cliente', public.assistente_nome_cliente(v.nome),
               'responsavel', coalesce(public.assistente_nome_usuario(v.dono), 'Sem dono'),
               'etapa', op.etapa,
               'fechado', coalesce(st.fechado, false),
               'nao_elegivel', coalesce(st.nao_elegivel, false),
               'ultima_msg_em', public.assistente_iso(um.em),
               'ultimo_a_falar', case when um.direcao is null then null
                                      when um.direcao = 'entrada' then 'cliente'
                                      when um.autor_id is not null or um.origem = 'telefone' then 'equipe'
                                      when um.origem = 'bot' and um.metadados ? 'sessao_id' then 'ia'
                                      else 'robo' end,
               'ultima_msg', public.assistente_trecho(um.tipo, um.conteudo)) order by v.rn)
      from vis v
      left join lateral (
        select coalesce(fc.nome, case o.status::text when 'ganho' then 'Fechado' when 'perdido' then 'Perdido'
                                                     when 'cancelado' then 'Cancelado' else 'Em andamento' end) as etapa
        from public.oportunidades o
        left join public.funil_colunas fc on fc.id = o.coluna_id
        where o.contato_id = v.id and o.organizacao_id = p_org
        order by (o.status = 'em_andamento') desc, o.atualizado_em desc
        limit 1
      ) op on true
      left join lateral (
        select exists (select 1 from public.oportunidades og
                       where og.contato_id = v.id and og.organizacao_id = p_org and og.status = 'ganho') as fechado,
               (not exists (select 1 from public.oportunidades og
                            where og.contato_id = v.id and og.organizacao_id = p_org and og.status = 'ganho')
                and coalesce((select ol.status::text = 'perdido'
                                     and coalesce(ol.motivo_perda, '') = any (public.dashboard_motivos_descarte())
                              from public.oportunidades ol
                              where ol.contato_id = v.id and ol.organizacao_id = p_org
                              order by ol.atualizado_em desc limit 1), false)) as nao_elegivel
      ) st on true
      left join lateral (
        select coalesce(m.recebida_em, m.enviada_em, m.criado_em) as em, m.direcao::text as direcao,
               m.autor_id, m.origem, m.tipo::text as tipo, m.conteudo, m.metadados
        from public.mensagens m
        where m.conversa_id = v.conversa_id and m.tipo not in ('sistema', 'nota_interna')
        order by m.criado_em desc
        limit 1
      ) um on v.conversa_id is not null
      where v.rn <= v_lim), '[]'::jsonb)
  ) into v_res;
  return v_res;
end
$$;

-- 8. teto de perguntas por pessoa por dia (dia de SP), atômico: no teto devolve -1 sem somar;
--    senão soma 1 e devolve o novo total
create or replace function public.assistente_registrar_uso(p_org uuid, p_usuario uuid, p_limite int)
returns int
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare
  v_dia date := (now() at time zone 'America/Sao_Paulo')::date;
  v_n   int;
begin
  if public.assistente_papel(p_org, p_usuario) is null then
    raise exception 'sem_acesso' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(p_limite, 0) <= 0 then return -1; end if;
  insert into public.assistente_uso as u (organizacao_id, usuario_id, dia, n)
  values (p_org, p_usuario, v_dia, 1)
  on conflict (usuario_id, dia) do update set n = u.n + 1
    where u.n < p_limite
  returning u.n into v_n;
  return coalesce(v_n, -1);
end
$$;

-- ---------------------------------------------------------------- permissões
-- helpers internos: ninguém de fora chama (só as RPCs acima, como dono)
revoke all on function public.assistente_papel(uuid, uuid) from public, anon, authenticated;
revoke all on function public.assistente_nome_usuario(uuid) from public, anon, authenticated;
revoke all on function public.assistente_nome_cliente(text) from public, anon, authenticated;
revoke all on function public.assistente_trecho(text, text) from public, anon, authenticated;
revoke all on function public.assistente_norm(text) from public, anon, authenticated;
revoke all on function public.assistente_iso(timestamptz) from public, anon, authenticated;
revoke all on function public.assistente_novos_desde(uuid) from public, anon, authenticated;
revoke all on function public.assistente_q_sem_resposta(uuid, uuid[]) from public, anon, authenticated;
revoke all on function public.assistente_q_passados(uuid, uuid[]) from public, anon, authenticated;
revoke all on function public.assistente_q_novos(uuid, uuid[]) from public, anon, authenticated;
revoke all on function public.assistente_q_presenciais(uuid, uuid[]) from public, anon, authenticated;
revoke all on function public.assistente_lista_espera(uuid, text, uuid[], int) from public, anon, authenticated;
revoke all on function public.assistente_lista_presenciais(uuid, uuid[], int) from public, anon, authenticated;
revoke all on function public.assistente_periodo(date, date) from public, anon, authenticated;
revoke all on function public.assistente_placar_oficial(uuid, date, date) from public, anon, authenticated;

-- RPCs: SÓ a edge function (service_role), com o id autenticado em p_ator
revoke all on function public.assistente_contexto(uuid, uuid) from public, anon, authenticated;
revoke all on function public.assistente_carteira(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.assistente_pendentes(uuid, uuid, uuid, int) from public, anon, authenticated;
revoke all on function public.assistente_fechados(uuid, uuid, date, date, uuid) from public, anon, authenticated;
revoke all on function public.assistente_equipe(uuid, uuid, date, date) from public, anon, authenticated;
revoke all on function public.assistente_leads(uuid, uuid, date, date) from public, anon, authenticated;
revoke all on function public.assistente_cliente(uuid, uuid, text, int) from public, anon, authenticated;
revoke all on function public.assistente_registrar_uso(uuid, uuid, int) from public, anon, authenticated;
grant execute on function public.assistente_contexto(uuid, uuid) to service_role;
grant execute on function public.assistente_carteira(uuid, uuid, uuid) to service_role;
grant execute on function public.assistente_pendentes(uuid, uuid, uuid, int) to service_role;
grant execute on function public.assistente_fechados(uuid, uuid, date, date, uuid) to service_role;
grant execute on function public.assistente_equipe(uuid, uuid, date, date) to service_role;
grant execute on function public.assistente_leads(uuid, uuid, date, date) to service_role;
grant execute on function public.assistente_cliente(uuid, uuid, text, int) to service_role;
grant execute on function public.assistente_registrar_uso(uuid, uuid, int) to service_role;
