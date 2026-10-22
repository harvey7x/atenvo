-- ============================================================================
-- DASHBOARD v5 — LEITURA DO DIA (22/10/2026): a camada que LÊ os números para o dono.
-- Pedido literal (22/10): "todos os dados são reais? eu preciso de um mecanismo
-- inteligente". Spec: wf7/SPEC-inteligencia.md (regras e limiares medidos no banco real).
--
-- 100% ADITIVO: dashboard_v5 e os helpers dash_v5_* NÃO mudam (nem assinatura nem saída).
-- O banco devolve SINAIS (contagens, esperados, linhas de base); o TEXTO dos achados é
-- escrito no front (src/data/dashboardV5.inteligencia.ts), por regras fixas e testadas —
-- sem LLM: todo número da leitura sai daqui.
--
-- Objetos novos:
--   * dash_v5_sinais_base           — cache DIÁRIO das linhas de base (vale o dia todo:
--                                      só depende de dias anteriores). RLS ligada, sem
--                                      policy, sem grant: só a RPC (dona) lê e grava.
--   * dash_v5s_feriados()           — feriados nacionais + 20/09 (RS) de 2026–2027.
--   * dash_v5s_relogio(t)           — relógio de minutos ÚTEIS (seg–sex 9h–19h SP, sem
--                                      feriado) desde 05/01/2026: diferença = minutos úteis.
--                                      Expressão pura (sem FROM): o planner embute.
--   * dash_v5s_min_uteis(t0, t1)    — minutos úteis entre dois instantes (embutível).
--   * dash_v5s_esp(λ, a, b)         — esperado num intervalo pela taxa por hora.
--   * dash_v5s_base(org, dia)       — todas as linhas de base do dia (jsonb).
--   * dash_v5s_vivo(...)            — os sinais do instante e do período (jsonb).
--   * dashboard_v5_sinais(...)      — RPC pública, MESMO portão de dashboard_v5. Blocos por
--                                      pessoa só para admin/supervisor.
--
-- DEFINIÇÕES (as do dash_v5 onde existem; o resto validado em produção — wf7/):
--   NÚMERO DE TRÁFEGO = conectado (mesma regra da tabela), não prende conversa, ≥ 7 dias de
--     história e mediana diária ≥ 3 nos últimos 14 dias. A história herda números
--     removidos com o MESMO numero_conectado cuja última entrada é de até 30 dias antes da
--     1ª entrada do atual (EMPRESTIMO herda EMPRESTIMO (DIEGO)).
--   ENTRADA = dash_v5_entradas (igual à tabela), no número de canal_origem_id.
--   MENSAGEM RECEBIDA = (conversa, minuto) distintos de mensagens 'entrada' (sem sistema e
--     nota interna), no coalesce(ultimo_canal_id, canal_id) da conversa.
--   TAXA POR HORA λ = 28 dias antes de hoje, mesmo tipo de dia (útil × fim de semana), só
--     dias SAUDÁVEIS (total ≥ 50% do p75 do tipo), cada hora limitada a max(2·mediana,
--     mediana+4) e então a média. Menos de 3 dias saudáveis no tipo → os dois tipos.
--   RESPOSTA HUMANA = a regra exata do dash_v5 (vez do cliente → 1ª saída humana).
--   PASSAGEM = 1º roteamento do contato; t0 = 1º chamou_humano/triagem_govbr da IA (se a
--     conversa tem sessão de IA) ou o fim do robô; t1 = 1ª mensagem humana ao contato.
--     "Espera a 1ª mensagem" = t0 nos últimos 3 dias, sem t1, sem fechamento e ≥ 120
--     minutos úteis desde t0.
--
-- VALIDAÇÃO (produção, 22/10, tudo dentro de begin … rollback — NADA gravado; a
-- migration NÃO está aplicada):
--   * relógio útil × soma dia a dia (regra do dash_v5 + feriados): 3.000 pares, 0 divergências;
--   * RPC como Matheus (authenticated), revisão 2 (22/10 ~06h30): 1ª chamada do dia
--     (calcula e guarda a base) ~1,3 s; depois Hoje 141 ms · 7 dias 198 ms · Nosso mês 245 ms
--     · mês anterior 378–389 ms · 45 dias 471–490 ms. Em horário de equipe (replay 21/10
--     15:00): Hoje ~200 · 7 dias ~265 · mês ~300 · 45 dias ~545 ms (só o teto do
--     personalizado passa de 500 ms). Ganhos da revisão: transferências em lote vêm da base
--     do dia (a varredura de 45 dias do audit_log custava ~240 ms por chamada), 1ª mensagem
--     dos "passados" pelo índice (conversa_id, criado_em) e plan_cache_mode =
--     force_custom_plan (o plano genérico do PL/pgSQL custava +30% em conexão reaproveitada);
--   * cache: número conectado que falta na base do dia → recalcula e troca (testado tirando o
--     ANTONIO do cache: a chamada seguinte o recolocou); authenticated não lê o cache nem
--     executa os helpers; anon sem execute na RPC;
--   * fechados da semana = KPI "Fechados" do 7 dias: 25 = dash_v5_kpis(15/10, 21/10 17:30) e
--     7 = dash_v5_kpis(25/09, 01/10 18:30);
--   * backtest de 15 em 15 min (9 dias: 01, 04, 05, 12, 13, 14, 18, 19, 21/10; 864 momentos)
--     com o motor do front: "as conversas voltaram" caiu de 138 para 17 momentos (todos com
--     ≥ 60% das mensagens desde o fim do apagão e a última hora normal); idas e vindas
--     parado → voltou → parado no mesmo dia: de 17 para 2 (01/10, dois episódios distintos);
--   * replay de 27 momentos reais (dash_v5s_vivo direto, como dona) — salvos em
--     src/data/__fixtures__/sinaisV5 e conferidos em dashboardV5.inteligencia.test.ts:
--     14/10 08:30 EMPRESTIMO parado com a conexão de volta só em parte; 14/10 10:00 e 11:00
--     o mesmo incidente (um cliente solto não é "voltou"); 13/10 03:00 crédito da IA na
--     madrugada quieta; 05/10 07:30 os dois números juntos; 16/10 15:00 nada (65 × ~66);
--     mês anterior fechado com o lote de 14/10 (datas antigas dentro dele).
--
-- Esta migration só cria objetos novos (1 tabela de cache + funções). Não envia nada,
-- não altera dados nem objetos existentes.
-- ============================================================================


-- ---------------------------------------------------------------- 1) cache diário
create table if not exists public.dash_v5_sinais_base (
  organizacao_id uuid        not null,
  dia            date        not null,
  versao         integer     not null,
  payload        jsonb       not null,
  calculado_em   timestamptz not null default now(),
  primary key (organizacao_id, dia, versao)
);
comment on table public.dash_v5_sinais_base is
  'Cache diário das linhas de base da Leitura do dia (dashboard_v5_sinais). Recalculável; linhas com mais de 7 dias são apagadas pela própria RPC.';
alter table public.dash_v5_sinais_base enable row level security;
revoke all on table public.dash_v5_sinais_base from public, anon, authenticated;


-- ---------------------------------------------------------------- 2) helpers de tempo
-- Os helpers puros (feriados, relógio, minutos úteis, esperado, arr) NÃO têm
-- `set search_path` de propósito: com ele o planner deixa de embutir a função em quem
-- chama (o relógio útil roda por linha nas grades). Todas as referências dentro deles são
-- qualificadas (public.*) e o execute é revogado de anon/authenticated (seção 6); o aviso
-- "function_search_path_mutable" do advisor do Supabase para estes 6 é ESPERADO.
--
-- !!! FERIADOS EM TRÊS LUGARES — editar os três juntos !!!
--   1) dash_v5s_feriados()                 (a lista)
--   2) dash_v5s_feriados_uteis_antes()     (a mesma lista, só os de seg–sex, como soma)
--   3) src/data/dashboardV5.sinais.demo.ts (FERIADOS do demo)
-- O teste "feriados: SQL e demo com a mesma lista" (dashboardV5.inteligencia.test.ts)
-- lê este arquivo e falha se os três divergirem.
-- feriados (o dono confirma a lista): nacionais + 20/09 (Revolução Farroupilha, RS)
create or replace function public.dash_v5s_feriados()
returns date[]
language sql immutable parallel safe
as $$
  select array[
    date '2026-01-01', date '2026-02-16', date '2026-02-17', date '2026-04-03', date '2026-04-21',
    date '2026-05-01', date '2026-06-04', date '2026-09-07', date '2026-09-20', date '2026-10-12',
    date '2026-11-02', date '2026-11-15', date '2026-11-20', date '2026-12-25',
    date '2027-01-01', date '2027-02-08', date '2027-02-09', date '2027-03-26', date '2027-04-21',
    date '2027-05-01', date '2027-05-27', date '2027-09-07', date '2027-09-20', date '2027-10-12',
    date '2027-11-02', date '2027-11-15', date '2027-11-20', date '2027-12-25'
  ]::date[]
$$;

-- quantos feriados em DIA ÚTIL (seg–sex) caem a partir de 05/01/2026 e antes de p_d.
-- !!! Mesma lista de dash_v5s_feriados() (só os de seg–sex) — editar os dois e o demo !!!
-- Escrito como soma de comparações para continuar embutível (subconsulta impediria o
-- inline). A validação da migration compara o relógio com a soma dia a dia.
create or replace function public.dash_v5s_feriados_uteis_antes(p_d date)
returns integer
language sql immutable parallel safe
as $$
  select (p_d > date '2026-02-16')::int + (p_d > date '2026-02-17')::int + (p_d > date '2026-04-03')::int
       + (p_d > date '2026-04-21')::int + (p_d > date '2026-05-01')::int + (p_d > date '2026-06-04')::int
       + (p_d > date '2026-09-07')::int + (p_d > date '2026-10-12')::int + (p_d > date '2026-11-02')::int
       + (p_d > date '2026-11-20')::int + (p_d > date '2026-12-25')::int
       + (p_d > date '2027-01-01')::int + (p_d > date '2027-02-08')::int + (p_d > date '2027-02-09')::int
       + (p_d > date '2027-03-26')::int + (p_d > date '2027-04-21')::int + (p_d > date '2027-05-27')::int
       + (p_d > date '2027-09-07')::int + (p_d > date '2027-09-20')::int + (p_d > date '2027-10-12')::int
       + (p_d > date '2027-11-02')::int + (p_d > date '2027-11-15')::int
$$;

-- relógio útil: minutos úteis (seg–sex 9h–19h de São Paulo, sem feriado) desde
-- 05/01/2026 00:00 (uma segunda). dash_v5s_relogio(b) − dash_v5s_relogio(a) = minutos
-- úteis em [a, b). Sem FROM: o planner embute a expressão em quem chama.
create or replace function public.dash_v5s_relogio(p_t timestamptz)
returns double precision
language sql stable parallel safe
as $$
  select (600.0 * (5 * (((p_t at time zone 'America/Sao_Paulo')::date - date '2026-01-05') / 7)
                   + least(((p_t at time zone 'America/Sao_Paulo')::date - date '2026-01-05') % 7, 5)
                   - public.dash_v5s_feriados_uteis_antes((p_t at time zone 'America/Sao_Paulo')::date))
          + case when extract(isodow from (p_t at time zone 'America/Sao_Paulo')) <= 5
                  and (p_t at time zone 'America/Sao_Paulo')::date <> all (public.dash_v5s_feriados())
                 then least(greatest(extract(epoch from (p_t at time zone 'America/Sao_Paulo')
                                       - date_trunc('day', p_t at time zone 'America/Sao_Paulo')) / 60.0 - 540, 0), 600)
                 else 0 end)::double precision
$$;

create or replace function public.dash_v5s_min_uteis(p_t0 timestamptz, p_t1 timestamptz)
returns double precision
language sql stable parallel safe
as $$
  select greatest(public.dash_v5s_relogio(p_t1) - public.dash_v5s_relogio(p_t0), 0)::double precision
$$;

-- esperado em [p_a, p_b) pela taxa por hora (24 posições por tipo de dia, hora de SP),
-- com a fração de cada hora coberta
create or replace function public.dash_v5s_esp(p_util double precision[], p_fds double precision[],
                                               p_a timestamptz, p_b timestamptz)
returns double precision
language sql stable parallel safe
as $$
  select coalesce(sum(
           (case when extract(isodow from hh) >= 6 then p_fds else p_util end)[extract(hour from hh)::int + 1]
           * extract(epoch from least(p_b at time zone 'America/Sao_Paulo', hh + interval '1 hour')
                              - greatest(p_a at time zone 'America/Sao_Paulo', hh)) / 3600.0), 0)::double precision
    from generate_series(date_trunc('hour', p_a at time zone 'America/Sao_Paulo'),
                         p_b at time zone 'America/Sao_Paulo', interval '1 hour') hh
   where p_a is not null and p_b is not null and p_a < p_b
     and hh < p_b at time zone 'America/Sao_Paulo'
$$;


-- jsonb (lista de números) → float8[]; qualquer coisa que não seja lista vira vazio
create or replace function public.dash_v5s_arr(p_j jsonb)
returns double precision[]
language sql immutable parallel safe
as $$
  select case when jsonb_typeof(p_j) = 'array'
              then array(select x::double precision from jsonb_array_elements_text(p_j) x)
              else '{}'::double precision[] end
$$;


-- ---------------------------------------------------------------- 3) linhas de base do dia
-- Tudo o que depende só de dias ANTERIORES a p_dia: vale o dia inteiro (cacheado).
-- A base cobre TODO número WhatsApp ativo (não de notificação), conectado ou não: um chip
-- que estava caindo/reconectando na 1ª chamada do dia não pode ficar o dia inteiro sem
-- base (= sem aviso de queda justo no dia em que importa). O filtro "conectado" é do
-- dash_v5s_vivo. VOLATILE: liga/desliga planner (set_config) num comando.
-- AO MUDAR A LÓGICA DESTA FUNÇÃO, suba c_versao em dashboard_v5_sinais (o cache do dia
-- da versão antiga deixa de ser lido e o dia é recalculado).
create or replace function public.dash_v5s_base(p_org uuid, p_dia date)
returns jsonb
language plpgsql volatile
set search_path = public
set plan_cache_mode = force_custom_plan
as $$
declare
  v_ini     timestamptz := p_dia::timestamp at time zone 'America/Sao_Paulo';
  v_fer     date[]      := public.dash_v5s_feriados();
  v_uteis   date[];
  v_ini0    timestamptz;
  v_nums    jsonb;
  v_total   jsonb;
  v_resp    jsonb;
  v_fila    jsonb;
  v_pessoas jsonb;
  v_fech    jsonb;
  v_transf  jsonb;
  v_nl      text := current_setting('enable_nestloop');
  v_mj      text := current_setting('enable_mergejoin');
begin
  -- os 10 dias úteis anteriores (sem feriado)
  select array_agg(z.d order by z.d) into v_uteis
    from (select g::date as d
            from generate_series((p_dia - 40)::timestamp, (p_dia - 1)::timestamp, interval '1 day') g
           where extract(isodow from g) <= 5 and g::date <> all (v_fer)
           order by g desc limit 10) z;
  v_ini0 := coalesce(v_uteis[1], p_dia - 14)::timestamp at time zone 'America/Sao_Paulo';

  -- ================= números: taxa por hora, normal até cada hora, IA, qualidade =================
  -- As grades (número × dia × hora) são pequenas, mas o planner estima mal as linhas de
  -- generate_series/CTE e escolhia merge/nested loop (2,1 s medidos em 22/10). Só NESTE
  -- comando os dois ficam desligados (tudo vira hash join: 0,34 s); os comandos seguintes
  -- dependem de nested loop com índice nas subconsultas correlacionadas, então o valor
  -- anterior volta logo depois.
  perform set_config('enable_nestloop', 'off', true), set_config('enable_mergejoin', 'off', true);
  with con as (   -- todo número ativo (conectado ou não): o vivo filtra os conectados
    select ca.id, ca.numero_conectado, coalesce(ca.prende_conversa, false) as prende
      from public.canais ca
     where ca.organizacao_id = p_org and ca.ativo
       and ca.tipo = 'whatsapp' and coalesce(ca.papel, '') <> 'notificacao'
  ),
  vida as (
    select o.canal_origem_id as canal, min(o.criado_em) as pri, max(o.criado_em) as ult
      from public.oportunidades o
     where o.organizacao_id = p_org and o.criado_em < v_ini and o.canal_origem_id is not null
     group by 1
  ),
  -- história do número: ele mesmo + removidos com o mesmo numero_conectado que pararam até
  -- 30 dias antes da 1ª entrada dele
  hist as (
    select c.id as num, c.id as canal from con c
    union
    select c.id, o2.id
      from con c
      join public.canais o2 on o2.organizacao_id = p_org and o2.id <> c.id
                           and o2.numero_conectado = c.numero_conectado
                           and o2.id not in (select id from con)
      join vida v2 on v2.canal = o2.id
      left join vida v1 on v1.canal = c.id
     where c.numero_conectado is not null
       and v2.ult >= coalesce(v1.pri, v_ini) - interval '30 days'
  ),
  nasc as (
    select h.num, (min(v.pri) at time zone 'America/Sao_Paulo')::date as desde
      from hist h join vida v on v.canal = h.canal
     group by 1
  ),
  ent as (
    select h.num, e.criado_em
      from public.dash_v5_entradas(p_org, v_ini - interval '28 days', v_ini) e
      join hist h on h.canal = e.canal_origem_id
  ),
  -- A mensagem não guarda o número por onde chegou: ela vale pelo número ATUAL da conversa,
  -- e a conversa leva o histórico junto quando o cliente passa a escrever em outro número.
  -- Corte: as mensagens de ANTES da última resposta enviada por OUTRO número (metadados
  -- canal_envio_id, gravado desde 22/09) não chegaram por este — ficam fora da taxa e das
  -- lacunas. O que sobra de atribuição errada (entre essa resposta e a troca) é pequeno:
  -- 1,4% das mensagens do EMPRESTIMO e 4,9% do JUROS em 28 dias (medido em 22/10).
  outro as (
    select mm.conversa_id, max(mm.criado_em) as ate
      from public.mensagens mm
      join public.conversas cv on cv.id = mm.conversa_id
      join hist h on h.canal = coalesce(cv.ultimo_canal_id, cv.canal_id)
     where mm.organizacao_id = p_org and mm.direcao = 'saida'
       and mm.criado_em >= v_ini - interval '28 days' and mm.criado_em < v_ini
       and mm.metadados ? 'canal_envio_id'
       and mm.metadados->>'canal_envio_id' not in (select h2.canal::text from hist h2 where h2.num = h.num)
     group by 1
  ),
  msg as (
    select h.num, x.dia, x.h, sum(x.n) as n
      from (select coalesce(cv.ultimo_canal_id, cv.canal_id) as canal,
                   (m.criado_em at time zone 'America/Sao_Paulo')::date as dia,
                   extract(hour from m.criado_em at time zone 'America/Sao_Paulo')::int as h,
                   count(distinct (m.conversa_id, date_trunc('minute', m.criado_em))) as n
              from public.mensagens m
              join public.conversas cv on cv.id = m.conversa_id
              left join outro ot on ot.conversa_id = m.conversa_id
             where m.organizacao_id = p_org and m.direcao = 'entrada'
               and m.criado_em >= v_ini - interval '28 days' and m.criado_em < v_ini
               and m.tipo not in ('sistema', 'nota_interna')
               and (ot.ate is null or m.criado_em > ot.ate)
             group by 1, 2, 3) x
      join hist h on h.canal = x.canal
     group by 1, 2, 3
  ),
  serie as materialized (
    select e.num, 'ent'::text as s, (e.criado_em at time zone 'America/Sao_Paulo')::date as dia,
           extract(hour from e.criado_em at time zone 'America/Sao_Paulo')::int as h, count(*)::float8 as n
      from ent e group by 1, 2, 3, 4
    union all
    select x.num, 'msg', x.dia, x.h, x.n::float8 from msg x
  ),
  -- grade completa (zeros incluídos) só nos dias em que o número já existia
  grade as (
    select c.id as num, s.s, d::date as dia, (extract(isodow from d) >= 6) as fds, hr.h
      from con c
      join nasc n on n.num = c.id
      cross join (values ('ent'::text), ('msg'::text)) s(s)
      cross join generate_series(greatest(p_dia - 28, n.desde)::timestamp, (p_dia - 1)::timestamp, interval '1 day') d
      cross join generate_series(0, 23) hr(h)
  ),
  cel as materialized (
    select g.num, g.s, g.dia, g.fds, g.h, coalesce(se.n, 0)::float8 as n
      from grade g
      left join serie se on se.num = g.num and se.s = g.s and se.dia = g.dia and se.h = g.h
  ),
  dtot as (select c.num, c.s, c.dia, c.fds, sum(c.n) as tot from cel c group by 1, 2, 3, 4),
  dp75 as (
    select d.num, d.s, d.fds, count(*) as nd,
           (array_agg(d.tot order by d.tot))[floor(0.75 * (count(*) - 1))::int + 1] as p75
      from dtot d group by 1, 2, 3
  ),
  saud as (
    select d.num, d.s, d.dia, d.fds, d.tot, (p.nd < 3 or d.tot >= 0.5 * p.p75) as ok
      from dtot d join dp75 p on p.num = d.num and p.s = d.s and p.fds = d.fds
  ),
  nok as (select s.num, s.s, s.fds, count(*) filter (where s.ok) as k from saud s group by 1, 2, 3),
  uso as (  -- dias usados para a taxa de cada tipo (fallback: os dois tipos)
    select s.num, s.s, t.alvo, s.dia
      from saud s
      cross join (values (false), (true)) t(alvo)
      left join nok k on k.num = s.num and k.s = s.s and k.fds = t.alvo
     where s.ok and (s.fds = t.alvo or coalesce(k.k, 0) < 3)
  ),
  celu as (
    select u.num, u.s, u.alvo, c.h, c.n
      from uso u join cel c on c.num = u.num and c.s = u.s and c.dia = u.dia
  ),
  md as (
    select c.num, c.s, c.alvo, c.h, percentile_cont(0.5) within group (order by c.n) as md
      from celu c group by 1, 2, 3, 4
  ),
  lam as (
    select c.num, c.s, c.alvo, c.h, avg(least(c.n, greatest(2 * m.md, m.md + 4))) as lam
      from celu c join md m on m.num = c.num and m.s = c.s and m.alvo = c.alvo and m.h = c.h
     group by 1, 2, 3, 4
  ),
  lamv as (
    select c.id as num, s.s, t.alvo,
           jsonb_agg(round(coalesce(l.lam, 0)::numeric, 4) order by hr.h) as v
      from con c
      cross join (values ('ent'::text), ('msg'::text)) s(s)
      cross join (values (false), (true)) t(alvo)
      cross join generate_series(0, 23) hr(h)
      left join lam l on l.num = c.id and l.s = s.s and l.alvo = t.alvo and l.h = hr.h
     group by 1, 2, 3
  ),
  -- normal até cada hora cheia: mediana, nos últimos 14 dias saudáveis, das entradas de 00:00
  -- até a hora k (k = 0…24)
  cum as (
    select c.num, c.dia, hr.k, coalesce(sum(c.n) filter (where c.h < hr.k), 0) as acum
      from cel c
      join saud s on s.num = c.num and s.s = c.s and s.dia = c.dia
      cross join generate_series(0, 24) hr(k)
     where c.s = 'ent' and c.dia >= p_dia - 14 and s.ok
     group by 1, 2, 3
  ),
  normal as (
    select z.num, jsonb_agg(round(z.med::numeric, 2) order by z.k) as v, max(z.nd) as nd
      from (select num, k, percentile_cont(0.5) within group (order by acum) as med, count(*) as nd
              from cum group by 1, 2) z
     group by 1
  ),
  med14 as (
    select d.num, percentile_cont(0.5) within group (order by d.tot) as med
      from dtot d where d.s = 'ent' and d.dia >= p_dia - 14 group by 1
  ),
  diasok as (
    select s.num, count(*) filter (where s.ok and not s.fds) as util, count(*) filter (where s.ok and s.fds) as fds
      from saud s where s.s = 'ent' group by 1
  ),
  op as (
    select h.num, o.criado_em, o.status, o.motivo_perda, o.motivo_nao_elegivel, o.fechado_em, o.fechado_por_id,
           exists (select 1 from public.ia_sessoes s
                    where s.conversa_id = o.conversa_origem_id
                      and s.criado_em < o.criado_em + interval '30 minutes') as com_ia
      from public.dash_v5_entradas(p_org, v_ini - interval '14 days', v_ini) e
      join public.oportunidades o on o.id = e.oportunidade_id
      join hist h on h.canal = e.canal_origem_id
  ),
  cob as (
    select num, count(*) as n, count(*) filter (where com_ia) as com_ia
      from op where criado_em >= v_ini - interval '7 days' group by 1
  ),
  opq as (
    select o.num,
           (o.status = 'perdido' and coalesce(o.motivo_perda, '') = any (public.dashboard_motivos_descarte())
            and o.fechado_por_id is null and o.motivo_nao_elegivel = 'nao_mora_rs'
            and o.fechado_em - o.criado_em < interval '1 minute') as rs,
           (o.status = 'perdido' and coalesce(o.motivo_perda, '') = any (public.dashboard_motivos_descarte())
            and o.fechado_por_id is null
            and not (coalesce(o.motivo_nao_elegivel, '') = 'nao_mora_rs' and o.fechado_em - o.criado_em < interval '1 minute')
            and o.fechado_em <= o.criado_em + interval '1 hour') as iad,
           coalesce(o.motivo_nao_elegivel, 'sem_categoria') as mot
      from op o
     where o.criado_em >= greatest(v_ini - interval '14 days', timestamptz '2026-10-01 00:00-03')
  ),
  qb as (select num, count(*) as n, count(*) filter (where rs) as rs, count(*) filter (where iad) as iad from opq group by 1),
  qm as (
    select z.num, jsonb_object_agg(z.mot, z.q) as motivos
      from (select num, mot, count(*) as q from opq where iad group by 1, 2) z group by 1
  ),
  traf as (
    select c.id as num
      from con c join nasc n on n.num = c.id left join med14 m on m.num = c.id
     where not c.prende and p_dia - n.desde >= 7 and coalesce(m.med, 0) >= 3
  ),
  -- dias de queda de QUALQUER número de tráfego ficam fora do "normal" do total
  ruim as (select distinct s.dia from saud s join traf t on t.num = s.num where s.s = 'ent' and not s.ok),
  th as materialized (
    select (e.criado_em at time zone 'America/Sao_Paulo')::date as dia,
           extract(hour from e.criado_em at time zone 'America/Sao_Paulo')::int as h, count(*) as n
      from public.dash_v5_entradas(p_org, v_ini - interval '14 days', v_ini) e
     group by 1, 2
  ),
  tdias as (
    select g::date as dia from generate_series((p_dia - 14)::timestamp, (p_dia - 1)::timestamp, interval '1 day') g
     where g::date not in (select dia from ruim)
  ),
  tc as (
    select td.dia, hr.k, coalesce((select sum(th.n) from th where th.dia = td.dia and th.h < hr.k), 0) as acum
      from tdias td cross join generate_series(0, 24) hr(k)
  ),
  tnorm as (
    select jsonb_agg(round(z.med::numeric, 2) order by z.k) as v, max(z.nd) as nd
      from (select k, percentile_cont(0.5) within group (order by acum) as med, count(*) as nd from tc group by k) z
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'canal_id',        c.id,
           'hist',            (select jsonb_agg(h.canal) from hist h where h.num = c.id),
           'historia_desde',  n.desde,
           'trafego',         c.id in (select num from traf),
           'aprendendo_ate',  case when n.desde is not null and p_dia - n.desde < 7 then n.desde + 7 end,
           'mediana_dia_14d', round(m14.med::numeric, 1),
           'dias_saudaveis',  jsonb_build_object('util', coalesce(dk.util, 0), 'fds', coalesce(dk.fds, 0)),
           'lam_ent', jsonb_build_object(
              'util', (select l.v from lamv l where l.num = c.id and l.s = 'ent' and not l.alvo),
              'fds',  (select l.v from lamv l where l.num = c.id and l.s = 'ent' and l.alvo)),
           'lam_msg', jsonb_build_object(
              'util', (select l.v from lamv l where l.num = c.id and l.s = 'msg' and not l.alvo),
              'fds',  (select l.v from lamv l where l.num = c.id and l.s = 'msg' and l.alvo)),
           'normal_ate_hora', case when coalesce(nm.nd, 0) >= 5 then nm.v end,
           'ia_cob_7d',       jsonb_build_object('n', coalesce(cb.n, 0), 'com_ia', coalesce(cb.com_ia, 0)),
           'qual_base_14d',   jsonb_build_object(
              'n', coalesce(q.n, 0), 'rs', coalesce(q.rs, 0), 'ia_desc', coalesce(q.iad, 0),
              'motivos', coalesce(qmo.motivos, '{}'::jsonb),
              -- dias de base DO NÚMERO: um número na 1ª semana tem 1–6 dias (e não 14)
              'dias', greatest(p_dia - greatest(p_dia - 14, date '2026-10-01', n.desde), 0)))
         order by c.id), '[]'::jsonb),
         jsonb_build_object('normal_ate_hora', (select case when t.nd >= 7 then t.v end from tnorm t))
    into v_nums, v_total
    from con c
    left join nasc   n   on n.num  = c.id
    left join med14  m14 on m14.num = c.id
    left join normal nm  on nm.num = c.id
    left join diasok dk  on dk.num = c.id
    left join cob    cb  on cb.num = c.id
    left join qb     q   on q.num  = c.id
    left join qm     qmo on qmo.num = c.id;
  perform set_config('enable_nestloop', v_nl, true), set_config('enable_mergejoin', v_mj, true);

  -- ================= respostas: mediana até cada hora cheia (11…19) nos 10 dias úteis =================
  with auto_ag as (
    select a.id::text as id
      from public.mensagens_agendadas a
     where a.organizacao_id = p_org
       and (a.metadados ? 'disparo_lote' or a.metadados ? 'recuperacao_id' or a.regua_ativacao_id is not null
            or a.metadados ? 'pendencia_id' or a.metadados->>'origem' = 'pendencia')
  ),
  m as (
    select mm.id, mm.conversa_id, mm.criado_em, mm.autor_id, mm.origem,
           case when mm.direcao = 'entrada' then 'in'
                when mm.origem in ('atenvo', 'telefone')
                 and (mm.metadados->>'agendamento_id' is null
                      or mm.metadados->>'agendamento_id' not in (select id from auto_ag)) then 'hum'
                else 'auto' end as k
      from public.mensagens mm
     where mm.organizacao_id = p_org
       and mm.criado_em >= v_ini0 - interval '1 day' and mm.criado_em < v_ini
       and mm.tipo not in ('sistema', 'nota_interna')
       and not (mm.direcao = 'saida' and mm.status = 'falhou')
  ),
  s as (
    select m.*, count(*) filter (where m.k <> 'in')
                  over (partition by m.conversa_id order by m.criado_em, m.id rows unbounded preceding) as c
      from m
  ),
  t as (select s.conversa_id, s.c, min(s.criado_em) as t0 from s where s.k = 'in' group by 1, 2),
  r as (select s.conversa_id, s.c - 1 as c, s.criado_em as t1, s.k, s.autor_id, s.origem from s where s.k <> 'in'),
  hum as materialized (
    select (t.t0 at time zone 'America/Sao_Paulo')::date as dia, t.t0, r.t1,
           coalesce(r.autor_id, case when r.origem = 'telefone' then ct.responsavel_id end) as uid,
           public.dash_v5s_min_uteis(t.t0, r.t1) as mu
      from t
      join r using (conversa_id, c)
      join public.conversas cv on cv.id = t.conversa_id
      left join public.contatos ct on ct.id = cv.contato_id
     where r.k = 'hum' and t.t0 >= v_ini0
  ),
  inst as (
    select d as dia, hh, (d::timestamp + make_interval(hours => hh)) at time zone 'America/Sao_Paulo' as t
      from unnest(v_uteis) d cross join generate_series(11, 19) hh
  ),
  cut as (
    select i.dia, i.hh, h.uid, h.mu
      from inst i join hum h on h.dia = i.dia and h.t0 < i.t - interval '60 minutes' and h.t1 <= i.t
  ),
  eq as (
    select hh, dia, count(*) as n, percentile_cont(0.5) within group (order by mu) as med from cut group by 1, 2
  ),
  pe as (
    select uid, hh, dia, count(*) as n, percentile_cont(0.5) within group (order by mu) as med
      from cut where uid is not null group by 1, 2, 3
  ),
  pri as (  -- minuto do dia da 1ª mensagem humana de cada pessoa em cada dia útil da base
    select m.autor_id as uid, (m.criado_em at time zone 'America/Sao_Paulo')::date as dia,
           min(extract(epoch from (m.criado_em at time zone 'America/Sao_Paulo')::time) / 60.0) as mn
      from m
     where m.k = 'hum' and m.autor_id is not null
       and (m.criado_em at time zone 'America/Sao_Paulo')::date = any (v_uteis)
     group by 1, 2
  )
  select jsonb_build_object(
           'equipe', coalesce((select jsonb_object_agg(y.hh::text, y.v) from (
               select hh, jsonb_agg(round(med::numeric, 1) order by dia) as v from eq where n >= 20 group by hh) y), '{}'::jsonb),
           'pessoas', coalesce((select jsonb_object_agg(x.uid::text, x.sl) from (
               select y.uid, jsonb_object_agg(y.hh::text, y.v) as sl from (
                 select uid, hh, jsonb_agg(jsonb_build_object('n', n, 'med', round(med::numeric, 1)) order by dia) as v
                   from pe group by 1, 2) y group by 1) x), '{}'::jsonb),
           'primeira', coalesce((select jsonb_object_agg(z.uid::text, round(z.med::numeric)) from (
               select uid, percentile_cont(0.5) within group (order by mn) as med from pri group by 1) z), '{}'::jsonb),
           -- dias da base em que a pessoa mandou mensagem (entra em "dias_ativos")
           'dias_hum', coalesce((select jsonb_object_agg(z.uid::text, z.ds) from (
               select uid, jsonb_agg(distinct dia) as ds from pri group by 1) z), '{}'::jsonb))
    into v_resp;

  -- ================= fila da 1ª mensagem em cada hora cheia (11…19) nos 10 dias úteis =================
  with auto_ag as (
    select a.id::text as id
      from public.mensagens_agendadas a
     where a.organizacao_id = p_org
       and (a.metadados ? 'disparo_lote' or a.metadados ? 'recuperacao_id' or a.regua_ativacao_id is not null
            or a.metadados ? 'pendencia_id' or a.metadados->>'origem' = 'pendencia')
  ),
  rec as (
    select distinct on (coalesce(r.contato_id, r.conversa_id))
           r.consultor_id as uid, r.conversa_id, r.contato_id, r.criado_em as t_rot
      from public.bot_roteamentos r
     where r.organizacao_id = p_org and r.criado_em >= v_ini0 - interval '4 days' and r.criado_em < v_ini
     order by coalesce(r.contato_id, r.conversa_id), r.criado_em
  ),
  g as materialized (
    select rec.*,
           case when exists (select 1 from public.ia_sessoes s where s.conversa_id = rec.conversa_id)
                then (select min(e.criado_em) from public.ia_eventos e
                       where e.conversa_id = rec.conversa_id and e.tipo in ('chamou_humano', 'triagem_govbr'))
                else (select case when b.etapa = 'concluido' or b.motivo_pausa = 'humano_assumiu'
                                  then greatest(coalesce(b.concluido_em, rec.t_rot), rec.t_rot) end
                        from public.bot_conversa_estado b where b.conversa_id = rec.conversa_id)
           end as t0
      from rec
  ),
  hs as materialized (
    select g.uid, g.t0, public.dash_v5s_relogio(g.t0) as r0,
           (select min(mm.criado_em) from public.mensagens mm join public.conversas cv on cv.id = mm.conversa_id
             where cv.contato_id = g.contato_id and mm.criado_em >= g.t_rot and mm.direcao = 'saida'
               and mm.origem in ('atenvo', 'telefone') and mm.tipo not in ('sistema', 'nota_interna')
               and mm.status is distinct from 'falhou'
               and (mm.metadados->>'agendamento_id' is null or mm.metadados->>'agendamento_id' not in (select id from auto_ag))) as t1,
           (select o.fechado_em from public.oportunidades o
             where o.contato_id = g.contato_id and o.criado_em <= g.t0 + interval '1 day'
             order by o.criado_em desc limit 1) as fe
      from g where g.t0 is not null and g.t0 < v_ini
  ),
  inst as (
    select d as dia, hh, x.t, public.dash_v5s_relogio(x.t) as r
      from unnest(v_uteis) d
      cross join generate_series(11, 19) hh
      cross join lateral (select (d::timestamp + make_interval(hours => hh)) at time zone 'America/Sao_Paulo' as t) x
  ),
  w as (
    select i.dia, i.hh, h.uid
      from inst i
      join hs h on h.t0 <= i.t and h.t0 > i.t - interval '3 days'
               and (h.t1 is null or h.t1 > i.t) and (h.fe is null or h.fe > i.t)
               and i.r - h.r0 >= 120
  ),
  wc as (select dia, hh, uid, count(*) as n from w group by 1, 2, 3),
  eqc as (
    select i.hh, i.dia, coalesce(sum(wc.n), 0) as n
      from inst i left join wc on wc.dia = i.dia and wc.hh = i.hh group by 1, 2
  ),
  pes as (select distinct uid from wc where uid is not null),
  pec as (
    select p.uid, i.hh, i.dia, coalesce(wc.n, 0) as n
      from pes p cross join inst i left join wc on wc.uid = p.uid and wc.dia = i.dia and wc.hh = i.hh
  )
  select jsonb_build_object(
           'equipe', coalesce((select jsonb_object_agg(y.hh::text, y.v) from (
               select hh, jsonb_agg(n order by dia) as v from eqc group by hh) y), '{}'::jsonb),
           'pessoas', coalesce((select jsonb_object_agg(x.uid::text, x.sl) from (
               select y.uid, jsonb_object_agg(y.hh::text, y.v) as sl from (
                 select uid, hh, jsonb_agg(n order by dia) as v from pec group by 1, 2) y group by 1) x), '{}'::jsonb))
    into v_fila;

  -- ================= pessoas: parte no rodízio (14 dias) e hora de começar =================
  with rot as (
    select r.consultor_id as uid, count(distinct coalesce(r.contato_id, r.conversa_id)) as n
      from public.bot_roteamentos r
     where r.organizacao_id = p_org and r.criado_em >= v_ini - interval '14 days' and r.criado_em < v_ini
     group by 1
  ),
  tot as (select nullif(sum(n), 0) as n from rot),
  -- dias úteis da base em que a pessoa trabalhou (recebeu lead do rodízio ou mandou
  -- mensagem): os outros dias (antes de entrar no rodízio, folga) não são "fila zero" —
  -- ficam fora da mediana, da recorrência e da conta de dias de base
  rotd as (
    select distinct r.consultor_id as uid, (r.criado_em at time zone 'America/Sao_Paulo')::date as dia
      from public.bot_roteamentos r
     where r.organizacao_id = p_org and r.criado_em >= v_ini0 and r.criado_em < v_ini
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'usuario_id', u.id,
           'nome', u.nome,
           'parte_rodizio_14d', round(coalesce(rot.n, 0)::numeric / (select n from tot), 4),
           'primeira_msg_mediana_min', (v_resp->'primeira'->>(u.id::text))::numeric,
           'dias_ativos', (select coalesce(jsonb_agg(
                              exists (select 1 from rotd where rotd.uid = u.id and rotd.dia = d)
                              or coalesce(v_resp->'dias_hum'->(u.id::text), '[]'::jsonb) ? d::text
                            order by d), '[]'::jsonb)
                             from unnest(v_uteis) d))
         order by u.nome), '[]'::jsonb)
    into v_pessoas
    from public.organizacao_usuarios ou
    join public.usuarios u on u.id = ou.usuario_id
    left join rot on rot.uid = u.id
   where ou.organizacao_id = p_org and ou.status = 'ativo';

  -- ================= transferências em lote dos 46 dias anteriores =================
  -- (≥ 20 contatos trocando de dono no mesmo minuto). Só dependem do passado: ficam no cache
  -- do dia e o vivo varre só o audit_log de HOJE — a varredura de 45 dias custava ~240 ms
  -- em toda chamada. Guarda ids; nomes só saem no vivo, e só para admin/supervisor.
  with tr as (
    select date_trunc('minute', a.criado_em) as mi, a.entidade_id,
           (a.dados_antes->>'responsavel_id') as de, (a.dados_depois->>'responsavel_id') as para
      from public.audit_log a
     where a.organizacao_id = p_org and a.acao = 'sync_responsavel_cliente'
       and a.criado_em >= v_ini - interval '46 days' and a.criado_em < v_ini
       and a.dados_antes->>'responsavel_id' is not null and a.dados_depois->>'responsavel_id' is not null
       and a.dados_antes->>'responsavel_id' <> a.dados_depois->>'responsavel_id'
  ),
  trm as (select mi from tr group by mi having count(distinct entidade_id) >= 20)
  select coalesce(jsonb_agg(jsonb_build_object(
           'minuto', m.mi,
           'qtd', (select count(distinct t.entidade_id) from tr t where t.mi = m.mi),
           'de', (select mode() within group (order by t.de) from tr t where t.mi = m.mi),
           'para', (select jsonb_agg(jsonb_build_object('uid', z.para, 'qtd', z.q) order by z.q desc, z.para)
                      from (select t.para, count(distinct t.entidade_id) as q from tr t where t.mi = m.mi group by 1) z))
         order by m.mi), '[]'::jsonb)
    into v_transf
    from trm m;

  -- ================= fechados, fichas finalizadas e entradas por dia (42 dias) =================
  with gan as (
    select (f.fechado_em at time zone 'America/Sao_Paulo')::date as dia, count(*) as n
      from public.dash_v5_fechamentos(p_org, v_ini - interval '42 days', v_ini) f
     where f.tipo = 'ganho' group by 1
  ),
  fic as (
    select (f.finalizada_em at time zone 'America/Sao_Paulo')::date as dia, count(distinct coalesce(f.contato_id, f.id)) as n
      from public.fichas_judiciais f
     where f.organizacao_id = p_org and f.finalizada_em >= v_ini - interval '42 days' and f.finalizada_em < v_ini
     group by 1
  ),
  en as (
    select (e.criado_em at time zone 'America/Sao_Paulo')::date as dia, count(distinct coalesce(e.contato_id, e.oportunidade_id)) as n
      from public.dash_v5_entradas(p_org, v_ini - interval '42 days', v_ini) e group by 1
  )
  select jsonb_agg(jsonb_build_object('dia', d::date, 'ganhos', coalesce(gan.n, 0), 'fichas', coalesce(fic.n, 0),
                                      'entradas', coalesce(en.n, 0)) order by d)
    into v_fech
    from generate_series((p_dia - 42)::timestamp, (p_dia - 1)::timestamp, interval '1 day') d
    left join gan on gan.dia = d::date
    left join fic on fic.dia = d::date
    left join en  on en.dia  = d::date;

  return jsonb_build_object(
    'versao',                1,
    'dia',                   p_dia,
    'calculado_em',          now(),
    'numeros',               v_nums,
    'total_normal_ate_hora', v_total->'normal_ate_hora',
    'dias_uteis_base',       to_jsonb(v_uteis),
    'resp_slots',            jsonb_build_object('equipe', v_resp->'equipe', 'pessoas', v_resp->'pessoas'),
    'fila_slots',            v_fila,
    'pessoas',               v_pessoas,
    'fech_diario',           coalesce(v_fech, '[]'::jsonb),
    'transf_lotes',          v_transf);
end;
$$;


-- ---------------------------------------------------------------- 4) sinais do instante
-- p_agora = o instante lido (now() ou o replay do admin da plataforma); p_ini/p_fim = o
-- período da tela (fim exclusivo). Tudo é cortado em p_agora: replay vê só o passado.
create or replace function public.dash_v5s_vivo(
  p_org uuid, p_agora timestamptz, p_ini timestamptz, p_fim timestamptz, p_admin boolean, p_base jsonb)
returns jsonb
language plpgsql stable
set search_path = public
-- planos sempre com os valores da chamada: o plano genérico que o PL/pgSQL passa a usar
-- depois de 5 execuções na mesma conexão (o PostgREST reaproveita conexões) custava +30%
-- nos períodos longos (medido em 22/10)
set plan_cache_mode = force_custom_plan
as $$
declare
  v_tz       text        := 'America/Sao_Paulo';
  v_local    timestamp   := p_agora at time zone 'America/Sao_Paulo';
  v_hoje     date        := (p_agora at time zone 'America/Sao_Paulo')::date;
  v_hoje_ini timestamptz := ((p_agora at time zone 'America/Sao_Paulo')::date)::timestamp at time zone 'America/Sao_Paulo';
  v_fim      timestamptz := least(p_fim, p_agora);
  v_inclui   boolean     := p_fim >= p_agora;
  v_fer      date[]      := public.dash_v5s_feriados();
  v_util     boolean;
  v_h        int;
  v_frac     double precision;
  v_slot     text;
  v_slot2    text;
  v_dias_per double precision := extract(epoch from (p_fim - p_ini)) / 86400.0;
  v_numeros  jsonb;
  v_total    jsonb;
  v_ia       jsonb;
  v_equipe   jsonb := null;
  v_pessoas  jsonb := '[]'::jsonb;
  v_hoje_p   jsonb := '{}'::jsonb;   -- por pessoa: resposta de hoje, fila agora, 1ª mensagem
  v_passados jsonb := '{}'::jsonb;
  v_notas    jsonb;
  v_semana   jsonb;
  v_ferp     jsonb;
  v_ao_vivo  boolean;
begin
  v_util := extract(isodow from v_local) <= 5 and v_hoje <> all (v_fer);
  v_h    := extract(hour from v_local)::int;
  v_frac := (extract(minute from v_local) + extract(second from v_local) / 60.0) / 60.0;
  v_slot  := case when v_h between 11 and 19 then v_h::text end;
  v_slot2 := case when v_h between 11 and 18 then (v_h + 1)::text end;
  -- equipe e fila só fazem sentido em dia útil, 11:00–19:59, com o período chegando a agora
  v_ao_vivo := v_inclui and v_util and v_slot is not null;

  -- ================= números =================
  with bn as (
    select (x->>'canal_id')::uuid as num, x from jsonb_array_elements(coalesce(p_base->'numeros', '[]'::jsonb)) x
  ),
  con as (
    select ca.id, ca.nome_interno, ca.numero_conectado
      from public.canais ca
     where ca.organizacao_id = p_org and ca.ativo and ca.status_integracao = 'conectado'
       and ca.tipo = 'whatsapp' and coalesce(ca.papel, '') <> 'notificacao'
  ),
  nums as (
    select c.id as num, c.nome_interno as nome, c.numero_conectado as numero,
           coalesce((b.x->>'trafego')::boolean, false) as trafego,
           (b.x->>'aprendendo_ate')::date as aprendendo_ate,
           (b.x->>'historia_desde')::date as desde,
           public.dash_v5s_arr(b.x->'lam_ent'->'util') as le_u,
           public.dash_v5s_arr(b.x->'lam_ent'->'fds')  as le_f,
           public.dash_v5s_arr(b.x->'lam_msg'->'util') as lm_u,
           public.dash_v5s_arr(b.x->'lam_msg'->'fds')  as lm_f,
           public.dash_v5s_arr(b.x->'normal_ate_hora') as norm,
           b.x->'ia_cob_7d' as cob, b.x->'qual_base_14d' as qb,
           case when jsonb_typeof(b.x->'hist') = 'array' and jsonb_array_length(b.x->'hist') > 0
                then array(select h::uuid from jsonb_array_elements_text(b.x->'hist') h) else array[c.id] end as hist
      from con c left join bn b on b.num = c.id
  ),
  mapa as (select n.num, unnest(n.hist) as canal from nums n),
  ent as (
    select mp.num, e.oportunidade_id, e.criado_em
      from public.dash_v5_entradas(p_org, least(p_ini - interval '4 days', p_agora - interval '8 days'), p_agora) e
      join mapa mp on mp.canal = e.canal_origem_id
  ),
  ult as (select num, max(criado_em) as ultima from ent group by 1),
  -- mesma regra da base: mensagens de antes da última resposta enviada por OUTRO número não
  -- chegaram por este (a conversa leva o histórico quando muda de número)
  outro as (
    select mm.conversa_id, max(mm.criado_em) as ate
      from public.mensagens mm
      join public.conversas cv on cv.id = mm.conversa_id
      join mapa mp on mp.canal = coalesce(cv.ultimo_canal_id, cv.canal_id)
     where mm.organizacao_id = p_org and mm.direcao = 'saida'
       and mm.criado_em >= p_agora - interval '3 days' and mm.criado_em < p_agora
       and mm.metadados ? 'canal_envio_id'
       and mm.metadados->>'canal_envio_id' not in (select m2.canal::text from mapa m2 where m2.num = mp.num)
     group by 1
  ),
  mi as (
    select mp.num, x.mi, sum(x.n) as n
      from (select coalesce(cv.ultimo_canal_id, cv.canal_id) as canal, date_trunc('minute', m.criado_em) as mi,
                   count(distinct m.conversa_id) as n
              from public.mensagens m join public.conversas cv on cv.id = m.conversa_id
              left join outro ot on ot.conversa_id = m.conversa_id
             where m.organizacao_id = p_org and m.direcao = 'entrada'
               and m.criado_em >= p_agora - interval '3 days' and m.criado_em < p_agora
               and m.tipo not in ('sistema', 'nota_interna')
               and (ot.ate is null or m.criado_em > ot.ate)
             group by 1, 2) x
      join mapa mp on mp.canal = x.canal
     group by 1, 2
  ),
  umsg as (select num, max(mi) as ultima from mi group by 1),
  -- janela do diagnóstico: [max(min(última entrada, agora−12 h), agora−3 dias), agora)
  jan as (
    select n.num,
           greatest(least(coalesce(u.ultima, p_agora - interval '3 days'), p_agora - interval '12 hours'),
                    p_agora - interval '3 days') as ini
      from nums n left join ult u on u.num = n.num
  ),
  pts as (
    select num, mi as t from mi
    union all select num, p_agora from nums
    union all select num, p_agora - interval '3 days' from nums
  ),
  gaps as (select num, lag(t) over (partition by num order by t) as a, t as b from pts),
  lac as (
    select g.num, g.a, g.b, public.dash_v5s_esp(n.lm_u, n.lm_f, g.a, g.b) as esp
      from gaps g join nums n on n.num = g.num join jan j on j.num = g.num
     where g.a is not null and g.b - g.a >= interval '75 minutes' and g.b > j.ini
  ),
  -- as 6 lacunas MAIS RECENTES (em ordem de início) e, para as que acabaram, o que chegou
  -- depois delas: é isso que diz se a conexão voltou de verdade ou só em parte
  lacj as (
    select z.num, jsonb_agg(jsonb_build_object(
             'inicio', z.a, 'fim', case when z.b >= p_agora then null else z.b end,
             'esperado', round(z.esp::numeric, 1),
             'rec_depois', case when z.b < p_agora then
                 (select coalesce(sum(x.n), 0) from mi x where x.num = z.num and x.mi >= z.b and x.mi < p_agora) end,
             'esp_depois', case when z.b < p_agora then
                 round(public.dash_v5s_esp(n.lm_u, n.lm_f, z.b, p_agora)::numeric, 1) end)
           order by z.a) as v
      from (select l.*, row_number() over (partition by l.num order by l.a desc) as rk from lac l where l.esp >= 20) z
      join nums n on n.num = z.num
     where z.rk <= 6
     group by 1
  ),
  -- quedas encerradas: intervalo entre duas entradas com ≥ 8 esperadas; emendadas quando
  -- separadas por ≤ 2 entradas e < 2 h
  eo as (select num, criado_em, row_number() over (partition by num order by criado_em) as i from ent),
  eg as (
    select num, lag(criado_em) over w as a, criado_em as b, lag(i) over w as ia, i as ib
      from eo window w as (partition by num order by criado_em)
  ),
  q1 as (
    select eg.*, public.dash_v5s_esp(n.le_u, n.le_f, eg.a, eg.b) as e
      from eg join nums n on n.num = eg.num
     where n.trafego and eg.a is not null and eg.b - eg.a >= interval '45 minutes'
       and eg.b > p_ini - interval '2 days' and eg.b <= v_fim
  ),
  q2 as (
    select q.*, case when lag(q.ib) over w is not null and q.ia - lag(q.ib) over w + 1 <= 2
                      and q.a - lag(q.b) over w < interval '2 hours' then 0 else 1 end as novo
      from q1 q where q.e >= 8 window w as (partition by q.num order by q.a)
  ),
  q3 as (select q2.*, sum(novo) over (partition by num order by a) as grp from q2),
  q4 as (select num, min(a) as a, max(b) as b, min(ia) as ia, max(ib) as ib from q3 group by num, grp),
  -- depois / esp_depois: entradas desde o fim da queda (a que a encerrou inclusive) e o
  -- esperado nesse trecho — o motor só diz "voltou" quando a volta se confirma
  quedas as (
    select q.num, jsonb_agg(jsonb_build_object('inicio', q.a, 'fim', q.b, 'chegaram', q.ib - q.ia - 1,
                                               'esperado', round(public.dash_v5s_esp(n.le_u, n.le_f, q.a, q.b)::numeric, 1),
                                               'depois', (select count(*) from ent e where e.num = q.num and e.criado_em >= q.b and e.criado_em < p_agora),
                                               'esp_depois', round(public.dash_v5s_esp(n.le_u, n.le_f, q.b, p_agora)::numeric, 1))
                            order by q.a) as v
      from q4 q join nums n on n.num = q.num
     where q.b > p_ini
     group by 1
  ),
  -- rajadas: ≥ 20 entradas em 15 min dentro do período
  rj as (
    select e.num, e.criado_em,
           count(*) over w15 as n15, max(e.criado_em) over w15 as fim15,
           lag(e.criado_em) over (partition by e.num order by e.criado_em) as antes
      from ent e
    window w15 as (partition by e.num order by e.criado_em range between current row and interval '15 minutes' following)
  ),
  rj2 as (select * from rj where n15 >= 20 and criado_em >= p_ini and criado_em < v_fim),
  rj3 as (
    select rj2.*, case when lag(criado_em) over w is null or criado_em - lag(criado_em) over w > interval '15 minutes'
                       then 1 else 0 end as novo
      from rj2 window w as (partition by num order by criado_em)
  ),
  rj4 as (select rj3.*, sum(novo) over (partition by num order by criado_em) as grp from rj3),
  rj5 as (
    select distinct on (num, grp) num, grp, criado_em as inicio, n15 as qtd,
           greatest(1, ceil(extract(epoch from fim15 - criado_em) / 60.0)) as minutos,
           first_value(antes) over (partition by num, grp order by criado_em) as antes0,
           first_value(criado_em) over (partition by num, grp order by criado_em) as ini0
      from rj4 order by num, grp, n15 desc, criado_em
  ),
  rajadas as (
    select z.num, jsonb_agg(jsonb_build_object('inicio', z.inicio, 'qtd', z.qtd, 'minutos', z.minutos,
              'silencio_antes_h', round((extract(epoch from z.ini0 - z.antes0) / 3600.0)::numeric, 1)) order by z.inicio) as v
      from (select r.*, row_number() over (partition by r.num order by r.inicio desc) as rk from rj5 r) z
     where z.rk <= 3
     group by 1
  ),
  opj as (  -- entradas recentes com os campos de IA e de descarte
    select e.num, e.criado_em, o.status, o.motivo_perda, o.motivo_nao_elegivel, o.fechado_em, o.fechado_por_id,
           exists (select 1 from public.ia_sessoes s
                    where s.conversa_id = o.conversa_origem_id
                      and s.criado_em < o.criado_em + interval '30 minutes' and s.criado_em <= p_agora) as com_ia
      from ent e join public.oportunidades o on o.id = e.oportunidade_id
     where e.criado_em >= p_agora - interval '24 hours'
  ),
  q24 as (
    select o.num,
           (o.status = 'perdido' and coalesce(o.motivo_perda, '') = any (public.dashboard_motivos_descarte())
            and o.fechado_em <= p_agora and o.fechado_por_id is null and o.motivo_nao_elegivel = 'nao_mora_rs'
            and o.fechado_em - o.criado_em < interval '1 minute') as rs,
           (o.status = 'perdido' and coalesce(o.motivo_perda, '') = any (public.dashboard_motivos_descarte())
            and o.fechado_em <= p_agora and o.fechado_por_id is null
            and not (coalesce(o.motivo_nao_elegivel, '') = 'nao_mora_rs' and o.fechado_em - o.criado_em < interval '1 minute')
            and o.fechado_em <= o.criado_em + interval '1 hour') as iad,
           coalesce(o.motivo_nao_elegivel, 'sem_categoria') as mot
      from opj o where o.criado_em < p_agora - interval '1 hour'
  ),
  q24m as (
    select z.num, jsonb_object_agg(z.mot, z.q) as motivos
      from (select num, mot, count(*) as q from q24 where iad group by 1, 2) z group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'canal_id',       n.num,
           'nome',           n.nome,
           'numero',         n.numero,
           'trafego',        n.trafego,
           -- número que nasceu HOJE ainda não está na base do dia: aprende a partir da 1ª entrada
           'aprendendo_ate', coalesce(n.aprendendo_ate, case when n.desde is null then
                               (select (min(e.criado_em) at time zone 'America/Sao_Paulo')::date + 7 from ent e where e.num = n.num) end),
           'historia_desde', coalesce(n.desde, (select (min(e.criado_em) at time zone 'America/Sao_Paulo')::date from ent e where e.num = n.num)),
           'ultima_entrada', u.ultima,
           'esperado_desde_ultima', round(public.dash_v5s_esp(n.le_u, n.le_f,
                                      greatest(coalesce(u.ultima, p_agora - interval '4 days'), p_agora - interval '4 days'), p_agora)::numeric, 1),
           'ent_3h', jsonb_build_object(
              'rec', (select count(*) from ent e where e.num = n.num and e.criado_em >= p_agora - interval '3 hours'),
              'esp', round(public.dash_v5s_esp(n.le_u, n.le_f, p_agora - interval '3 hours', p_agora)::numeric, 1)),
           -- as mesmas 3 h terminando 15 min atrás: o filete só "sai" quando a última hora volta
           -- (histerese sem estado — a janela de 15 min atrás diz se ele já estava ligado)
           'ent_3h_15', jsonb_build_object(
              'rec', (select count(*) from ent e where e.num = n.num and e.criado_em >= p_agora - interval '3 hours 15 minutes'
                                                    and e.criado_em < p_agora - interval '15 minutes'),
              'esp', round(public.dash_v5s_esp(n.le_u, n.le_f, p_agora - interval '3 hours 15 minutes', p_agora - interval '15 minutes')::numeric, 1)),
           'ent_60', jsonb_build_object(
              'rec', (select count(*) from ent e where e.num = n.num and e.criado_em >= p_agora - interval '60 minutes'),
              'esp', round(public.dash_v5s_esp(n.le_u, n.le_f, p_agora - interval '60 minutes', p_agora)::numeric, 1)),
           'ultima_msg',     um.ultima,
           'msgs_esperadas_desde_ultima_msg', round(public.dash_v5s_esp(n.lm_u, n.lm_f,
                                      coalesce(um.ultima, p_agora - interval '3 days'), p_agora)::numeric, 1),
           'msgs_60', jsonb_build_object(
              'rec', (select coalesce(sum(x.n), 0) from mi x where x.num = n.num and x.mi >= p_agora - interval '60 minutes'),
              'esp', round(public.dash_v5s_esp(n.lm_u, n.lm_f, p_agora - interval '60 minutes', p_agora)::numeric, 1)),
           'lacunas_msg',    coalesce(lj.v, '[]'::jsonb),
           'msgs_diag', (select jsonb_build_object(
                'desde', d.desde,
                'rec', (select coalesce(sum(x.n), 0) from mi x where x.num = n.num and x.mi >= d.desde),
                'esp', round(public.dash_v5s_esp(n.lm_u, n.lm_f, d.desde, p_agora)::numeric, 1))
              from (select least(greatest(coalesce(u.ultima, p_agora - interval '6 hours'), p_agora - interval '6 hours'),
                                 p_agora - interval '2 hours') as desde) d),
           'hoje', jsonb_build_object(
              'entradas', (select count(*) from ent e where e.num = n.num and e.criado_em >= v_hoje_ini),
              'normal_ate_agora', case when cardinality(n.norm) = 25
                                       then round((n.norm[v_h + 1] + (n.norm[v_h + 2] - n.norm[v_h + 1]) * v_frac)::numeric, 1) end),
           'ia_3h', (select jsonb_build_object('n', count(*), 'com_ia', count(*) filter (where o.com_ia))
                       from opj o where o.num = n.num and o.criado_em >= p_agora - interval '3 hours'
                        and o.criado_em < p_agora - interval '30 minutes'),
           'ia_cob_7d', coalesce(n.cob, jsonb_build_object('n', 0, 'com_ia', 0)),
           'qual_24h', (select jsonb_build_object('n', count(*), 'rs', count(*) filter (where q.rs),
                                                  'ia_desc', count(*) filter (where q.iad),
                                                  'motivos', coalesce((select m.motivos from q24m m where m.num = n.num), '{}'::jsonb))
                          from q24 q where q.num = n.num),
           'qual_base', coalesce(n.qb, '{}'::jsonb),
           'quedas',  coalesce(qd.v, '[]'::jsonb),
           'rajadas', coalesce(rjj.v, '[]'::jsonb))
         order by n.trafego desc, n.nome), '[]'::jsonb)
    into v_numeros
    from nums n
    left join ult u      on u.num = n.num
    left join umsg um    on um.num = n.num
    left join lacj lj    on lj.num = n.num
    left join quedas qd  on qd.num = n.num
    left join rajadas rjj on rjj.num = n.num;

  -- ================= total (todas as entradas, para o ritmo do dia) =================
  select jsonb_build_object(
           'hoje', (select count(*) from public.dash_v5_entradas(p_org, v_hoje_ini, p_agora)),
           'normal_ate_agora', case when jsonb_typeof(p_base->'total_normal_ate_hora') = 'array'
                                     and jsonb_array_length(p_base->'total_normal_ate_hora') = 25 then
              round((((p_base->'total_normal_ate_hora')->>v_h)::numeric
                     + (((p_base->'total_normal_ate_hora')->>(v_h + 1))::numeric - ((p_base->'total_normal_ate_hora')->>v_h)::numeric)
                       * v_frac::numeric), 1) end,
           'rajada_hoje', exists (
              select 1 from jsonb_array_elements(v_numeros) x, jsonb_array_elements(x->'rajadas') r
               where (x->>'trafego')::boolean and (r->>'inicio')::timestamptz >= v_hoje_ini))
    into v_total;

  -- ================= IA (crédito do Gemini e falhas) =================
  -- CRÉDITO = só o "prepayment credits are depleted" (veio como 402 e, em 03–04/09, como
  -- 429 com o mesmo texto). 429 sem esse texto (limite de taxa) e os demais erros contam
  -- como "falhas" (erros_60). finish_max_tokens é rotina e fica fora.
  with ev as (
    select e.id, e.criado_em, e.tipo, e.conversa_id,
           (e.tipo = 'gemini_erro' and e.detalhe::text ~* 'prepayment|depleted|gemini 402') as cred,
           (e.tipo = 'gemini_erro' and e.detalhe::text ilike '%finish_max_tokens%') as maxtok
      from public.ia_eventos e
     where e.organizacao_id = p_org and e.tipo in ('gemini_erro', 'gemini_call')
       and e.criado_em >= p_agora - interval '48 hours' and e.criado_em < p_agora
  ),
  ru as (
    select ev.*, count(*) filter (where ev.tipo = 'gemini_call') over (order by ev.criado_em, ev.id rows unbounded preceding) as calls
      from ev
  ),
  -- episódio: falhas de crédito seguidas; só começa um NOVO depois de ≥ 3 respostas boas
  -- (uma resposta solta no meio da falta — 12/10 21:25 — não parte a parada em duas)
  ce as (
    select ru.*, ru.calls - lag(ru.calls) over (order by ru.criado_em, ru.id) as ok_entre
      from ru where ru.cred
  ),
  ce2 as (
    select ce.*, sum(case when ce.ok_entre is null or ce.ok_entre >= 3 then 1 else 0 end)
                   over (order by ce.criado_em, ce.id rows unbounded preceding) as grp
      from ce
  ),
  ep as (
    select grp, min(criado_em) as ini, max(criado_em) as fim, count(*) as erros, count(distinct conversa_id) as conversas
      from ce2 group by grp order by max(criado_em) desc limit 1
  )
  select jsonb_build_object(
           'credito', (select jsonb_build_object('inicio', ep.ini, 'fim', ep.fim, 'erros', ep.erros, 'conversas', ep.conversas,
                                                 'ok_depois', (select count(*) from ev where ev.tipo = 'gemini_call' and ev.criado_em > ep.fim))
                         from ep),
           'credito_60', (select count(*) from ev where ev.cred and ev.criado_em >= p_agora - interval '60 minutes'),
           'erros_60',   (select count(*) from ev where ev.tipo = 'gemini_erro' and not ev.cred and not ev.maxtok
                                                   and ev.criado_em >= p_agora - interval '60 minutes'),
           'ok_60',      (select count(*) from ev where ev.tipo = 'gemini_call' and ev.criado_em >= p_agora - interval '60 minutes'))
    into v_ia;

  -- ================= equipe e pessoas ao vivo (dia útil, 11:00–19:59) =================
  if v_ao_vivo then
    -- Vezes do cliente: a regra do dash_v5 (a tabela) com as mensagens desde ONTEM 00:00.
    -- Limite conhecido e aceito: uma vez que começou antes disso e seguia sem resposta conta
    -- como começando na 1ª mensagem dentro da janela (19/10 15:00: n 102 × 97 com o
    -- histórico todo, mediana 14,2 × 13,6 min). Os dias da base têm o mesmo corte, então a
    -- comparação não muda; alinhar com a tabela pesa mais que esse desvio.
    with auto_ag as (
      select a.id::text as id
        from public.mensagens_agendadas a
       where a.organizacao_id = p_org
         and (a.metadados ? 'disparo_lote' or a.metadados ? 'recuperacao_id' or a.regua_ativacao_id is not null
              or a.metadados ? 'pendencia_id' or a.metadados->>'origem' = 'pendencia')
    ),
    m as (
      select mm.id, mm.conversa_id, mm.criado_em, mm.autor_id, mm.origem,
             case when mm.direcao = 'entrada' then 'in'
                  when mm.origem in ('atenvo', 'telefone')
                   and (mm.metadados->>'agendamento_id' is null
                        or mm.metadados->>'agendamento_id' not in (select id from auto_ag)) then 'hum'
                  else 'auto' end as k
        from public.mensagens mm
       where mm.organizacao_id = p_org
         and mm.criado_em >= v_hoje_ini - interval '1 day' and mm.criado_em < p_agora
         and mm.tipo not in ('sistema', 'nota_interna')
         and not (mm.direcao = 'saida' and mm.status = 'falhou')
    ),
    s as (
      select m.*, count(*) filter (where m.k <> 'in')
                    over (partition by m.conversa_id order by m.criado_em, m.id rows unbounded preceding) as c
        from m
    ),
    t as (select s.conversa_id, s.c, min(s.criado_em) as t0 from s where s.k = 'in' group by 1, 2),
    r as (select s.conversa_id, s.c - 1 as c, s.criado_em as t1, s.k, s.autor_id, s.origem from s where s.k <> 'in'),
    hum as (
      select coalesce(r.autor_id, case when r.origem = 'telefone' then ct.responsavel_id end) as uid,
             public.dash_v5s_min_uteis(t.t0, r.t1) as mu
        from t
        join r using (conversa_id, c)
        join public.conversas cv on cv.id = t.conversa_id
        left join public.contatos ct on ct.id = cv.contato_id
       where r.k = 'hum' and t.t0 >= v_hoje_ini and t.t0 < p_agora - interval '60 minutes' and r.t1 <= p_agora
    ),
    pri as (
      select m.autor_id as uid, min(m.criado_em) as em from m
       where m.k = 'hum' and m.autor_id is not null and m.criado_em >= v_hoje_ini group by 1
    ),
    -- fila agora (dono ATUAL do lead)
    rec as (
      select distinct on (coalesce(r.contato_id, r.conversa_id))
             r.consultor_id as uid, r.conversa_id, r.contato_id, r.criado_em as t_rot
        from public.bot_roteamentos r
       where r.organizacao_id = p_org and r.criado_em >= p_agora - interval '4 days' and r.criado_em < p_agora
       order by coalesce(r.contato_id, r.conversa_id), r.criado_em
    ),
    g as (
      select rec.*,
             case when exists (select 1 from public.ia_sessoes s where s.conversa_id = rec.conversa_id)
                  then (select min(e.criado_em) from public.ia_eventos e
                         where e.conversa_id = rec.conversa_id and e.tipo in ('chamou_humano', 'triagem_govbr'))
                  else (select case when b.etapa = 'concluido' or b.motivo_pausa = 'humano_assumiu'
                                    then greatest(coalesce(b.concluido_em, rec.t_rot), rec.t_rot) end
                          from public.bot_conversa_estado b where b.conversa_id = rec.conversa_id)
             end as t0
        from rec
    ),
    -- cada passagem com a 1ª mensagem humana (t1) e o fechamento (fe): a fila sai daqui
    -- AGORA e há 15 e 30 min (a histerese do cartão da equipe compara os três instantes)
    gh as materialized (
      select g.*, ct.responsavel_id as dono,
             (select min(mm.criado_em) from public.mensagens mm join public.conversas cv on cv.id = mm.conversa_id
               where cv.contato_id = g.contato_id and mm.criado_em >= g.t_rot and mm.criado_em <= p_agora
                 and mm.direcao = 'saida' and mm.origem in ('atenvo', 'telefone')
                 and mm.tipo not in ('sistema', 'nota_interna') and mm.status is distinct from 'falhou'
                 and (mm.metadados->>'agendamento_id' is null
                      or mm.metadados->>'agendamento_id' not in (select id from auto_ag))) as t1,
             (select o.fechado_em from public.oportunidades o
               where o.contato_id = g.contato_id and o.criado_em <= g.t0 + interval '1 day'
               order by o.criado_em desc limit 1) as fe
        from g
        left join public.contatos ct on ct.id = g.contato_id
       where g.t0 is not null and g.t0 <= p_agora and g.t0 > p_agora - interval '3 days 30 minutes'
    ),
    fila_em as (
      select i.k, gh.dono, gh.t0
        from (values (0, p_agora), (15, p_agora - interval '15 minutes'), (30, p_agora - interval '30 minutes')) i(k, t)
        join gh on gh.t0 <= i.t and gh.t0 > i.t - interval '3 days'
               and public.dash_v5s_min_uteis(gh.t0, i.t) >= 120
               and (gh.t1 is null or gh.t1 > i.t)
               and (gh.fe is null or gh.fe > i.t)
    ),
    fila as (select dono, t0 from fila_em where k = 0)
    select jsonb_build_object(
             'equipe', jsonb_build_object(
                'resp_hoje', (select jsonb_build_object('n', count(*), 'mediana_min',
                                round((percentile_cont(0.5) within group (order by mu))::numeric, 1)) from hum),
                'resp_base', coalesce(p_base->'resp_slots'->'equipe'->v_slot, '[]'::jsonb),
                'fila_agora', (select count(*) from fila),
                'fila_antes', jsonb_build_array((select count(*) from fila_em where k = 15),
                                                (select count(*) from fila_em where k = 30)),
                'fila_base', coalesce(p_base->'fila_slots'->'equipe'->v_slot, '[]'::jsonb),
                'fila_base_prox', case when v_slot2 is not null then p_base->'fila_slots'->'equipe'->v_slot2 end),
             'pessoas', case when p_admin then coalesce((
                select jsonb_object_agg(u.uid::text, jsonb_build_object(
                         'resp', (select jsonb_build_object('n', count(*),
                                    'mediana_min', round((percentile_cont(0.5) within group (order by h.mu))::numeric, 1))
                                    from hum h where h.uid = u.uid),
                         'resto_mediana_min', (select round((percentile_cont(0.5) within group (order by h.mu))::numeric, 1)
                                                 from hum h where h.uid is distinct from u.uid),
                         'fila_agora', (select count(*) from fila f where f.dono = u.uid),
                         'fila_mais_antigo', (select min(f.t0) from fila f where f.dono = u.uid),
                         'primeira_msg_hoje', (select p.em from pri p where p.uid = u.uid)))
                  from (select ou.usuario_id as uid from public.organizacao_usuarios ou
                         where ou.organizacao_id = p_org and ou.status = 'ativo') u), '{}'::jsonb) else '{}'::jsonb end)
      into v_hoje_p;
    v_equipe := v_hoje_p->'equipe';
    v_hoje_p := coalesce(v_hoje_p->'pessoas', '{}'::jsonb);
  end if;

  -- ================= passados sem contato (admin; período ≥ 7 dias) =================
  if p_admin and v_dias_per >= 6.5 then
    with auto_ag as (
      select a.id::text as id
        from public.mensagens_agendadas a
       where a.organizacao_id = p_org
         and (a.metadados ? 'disparo_lote' or a.metadados ? 'recuperacao_id' or a.regua_ativacao_id is not null
              or a.metadados ? 'pendencia_id' or a.metadados->>'origem' = 'pendencia')
    ),
    rec as (
      select distinct on (coalesce(r.contato_id, r.conversa_id))
             r.consultor_id as uid, r.conversa_id, r.contato_id, r.criado_em as t_rot
        from public.bot_roteamentos r
       where r.organizacao_id = p_org and r.criado_em >= p_ini - interval '4 days' and r.criado_em < v_fim
       order by coalesce(r.contato_id, r.conversa_id), r.criado_em
    ),
    g as (
      select rec.*,
             case when exists (select 1 from public.ia_sessoes s where s.conversa_id = rec.conversa_id)
                  then (select min(e.criado_em) from public.ia_eventos e
                         where e.conversa_id = rec.conversa_id and e.tipo in ('chamou_humano', 'triagem_govbr'))
                  else (select case when b.etapa = 'concluido' or b.motivo_pausa = 'humano_assumiu'
                                    then greatest(coalesce(b.concluido_em, rec.t_rot), rec.t_rot) end
                          from public.bot_conversa_estado b where b.conversa_id = rec.conversa_id)
             end as t0
        from rec
    ),
    h0 as materialized (
      select g.uid, g.contato_id, g.t_rot, g.t0
        from g
       where g.t0 is not null and g.t0 >= p_ini and g.t0 < v_fim
         and public.dash_v5s_min_uteis(g.t0, p_agora) >= 600
    ),
    -- 1ª mensagem humana depois do roteamento: por conversa do contato, pelo índice
    -- (conversa_id, criado_em) e parando na primeira (antes: uma junção mensagens × conversas
    -- por passagem, ~0,5 s em 45 dias)
    pt1 as (
      select h0.contato_id, min(x.t) as t1
        from h0
        join public.conversas cv on cv.contato_id = h0.contato_id
        cross join lateral (
          select mm.criado_em as t from public.mensagens mm
           where mm.conversa_id = cv.id and mm.criado_em >= h0.t_rot and mm.criado_em <= p_agora
             and mm.direcao = 'saida' and mm.origem in ('atenvo', 'telefone')
             and mm.tipo not in ('sistema', 'nota_interna') and mm.status is distinct from 'falhou'
             and (mm.metadados->>'agendamento_id' is null or mm.metadados->>'agendamento_id' not in (select id from auto_ag))
           order by mm.criado_em limit 1) x
       group by 1
    ),
    pfe as (
      select distinct on (h0.contato_id) h0.contato_id, o.fechado_em as fe
        from h0 join public.oportunidades o on o.contato_id = h0.contato_id
       where o.criado_em <= h0.t0 + interval '1 day' and o.fechado_em <= p_agora
       order by h0.contato_id, o.criado_em desc
    ),
    hs as (
      select h0.uid, h0.t0, pt1.t1, pfe.fe
        from h0 left join pt1 on pt1.contato_id = h0.contato_id left join pfe on pfe.contato_id = h0.contato_id
    ),
    ok as (
      select hs.uid,
             (hs.t1 is null or public.dash_v5s_min_uteis(hs.t0, hs.t1) > 600) as sem
        from hs
       where hs.uid is not null
         and not (hs.fe is not null and (hs.t1 is null or hs.fe < hs.t1) and public.dash_v5s_min_uteis(hs.t0, hs.fe) < 600)
    )
    select coalesce(jsonb_object_agg(z.uid::text, jsonb_build_object('n', z.n, 'sem_contato', z.s)), '{}'::jsonb)
      into v_passados
      from (select uid, count(*) as n, count(*) filter (where sem) as s from ok group by 1) z;
  end if;

  -- ================= pessoas (só admin/supervisor) =================
  if p_admin then
    select coalesce(jsonb_agg(jsonb_build_object(
             'usuario_id', u.id,
             'nome', u.nome,
             'parte_rodizio_14d', bp->'parte_rodizio_14d',
             'primeira_msg_mediana_min', bp->'primeira_msg_mediana_min',
             'dias_ativos', coalesce(bp->'dias_ativos', '[]'::jsonb),
             'primeira_msg_hoje', v_hoje_p->(u.id::text)->'primeira_msg_hoje',
             'fila', jsonb_build_object(
                'agora', coalesce(v_hoje_p->(u.id::text)->'fila_agora', '0'::jsonb),
                'mais_antigo', v_hoje_p->(u.id::text)->'fila_mais_antigo',
                'base', case when v_slot is not null then coalesce(p_base->'fila_slots'->'pessoas'->(u.id::text)->v_slot, '[]'::jsonb) else '[]'::jsonb end,
                'base_prox', case when v_slot2 is not null then p_base->'fila_slots'->'pessoas'->(u.id::text)->v_slot2 end),
             'resp_hoje', v_hoje_p->(u.id::text)->'resp',
             'resp_resto_mediana_min', v_hoje_p->(u.id::text)->'resto_mediana_min',
             'resp_base', case when v_slot is not null then coalesce(p_base->'resp_slots'->'pessoas'->(u.id::text)->v_slot, '[]'::jsonb) else '[]'::jsonb end,
             'passados', v_passados->(u.id::text))
           order by u.nome), '[]'::jsonb)
      into v_pessoas
      from public.organizacao_usuarios ou
      join public.usuarios u on u.id = ou.usuario_id
      left join lateral (select x as bp from jsonb_array_elements(coalesce(p_base->'pessoas', '[]'::jsonb)) x
                          where x->>'usuario_id' = u.id::text limit 1) b on true
     where ou.organizacao_id = p_org and ou.status = 'ativo';
  end if;

  -- ================= observações sobre os números =================
  with lotes as (
    select date_trunc('minute', e.criado_em) as mi, e.executado_por as por, count(*) as qtd,
           count(*) filter (where o.fechado_em < e.criado_em - interval '1 day') as retro,
           count(*) filter (where o.criado_em < e.criado_em - interval '7 days') as antigos,
           (min(o.fechado_em) filter (where o.fechado_em < e.criado_em - interval '1 day') at time zone 'America/Sao_Paulo')::date as d_min,
           (max(o.fechado_em) filter (where o.fechado_em < e.criado_em - interval '1 day') at time zone 'America/Sao_Paulo')::date as d_max
      from public.oportunidade_eventos e
      join public.oportunidades o on o.id = e.oportunidade_id
     where e.organizacao_id = p_org and e.status_novo = 'perdido'
       -- lote marcado DEPOIS do período com datas antigas DENTRO dele também é nota (ex.: o
       -- 14/10 12:02 explica 58 marcações do mês 10/09→10/10); antes do período não precisa
       -- (data antiga é sempre anterior ao lote)
       and e.criado_em >= p_ini and e.criado_em < p_agora
     group by 1, 2 having count(*) >= 15
  ),
  -- transferências em lote: as de dias anteriores vêm prontas da base do dia; aqui só HOJE
  tr as (
    select date_trunc('minute', a.criado_em) as mi, a.entidade_id,
           (a.dados_antes->>'responsavel_id') as de, (a.dados_depois->>'responsavel_id') as para
      from public.audit_log a
     where a.organizacao_id = p_org and a.acao = 'sync_responsavel_cliente'
       and a.criado_em >= greatest(p_ini, v_hoje_ini) and a.criado_em < v_fim
       and a.dados_antes->>'responsavel_id' is not null and a.dados_depois->>'responsavel_id' is not null
       and a.dados_antes->>'responsavel_id' <> a.dados_depois->>'responsavel_id'
  ),
  trm as (select mi from tr group by mi having count(distinct entidade_id) >= 20),
  trl as (   -- todos os lotes do período, no mesmo formato: {mi, qtd, de, para:[{uid, qtd}]}
    select (x->>'minuto')::timestamptz as mi, (x->>'qtd')::int as qtd, x->>'de' as de, x->'para' as para
      from jsonb_array_elements(coalesce(p_base->'transf_lotes', '[]'::jsonb)) x
     where (x->>'minuto')::timestamptz >= p_ini and (x->>'minuto')::timestamptz < least(v_fim, v_hoje_ini)
    union all
    select m.mi, (select count(distinct t.entidade_id) from tr t where t.mi = m.mi)::int,
           (select mode() within group (order by t.de) from tr t where t.mi = m.mi),
           (select jsonb_agg(jsonb_build_object('uid', z.para, 'qtd', z.q) order by z.q desc, z.para)
              from (select t.para, count(distinct t.entidade_id) as q from tr t where t.mi = m.mi group by 1) z)
      from trm m
  ),
  fic as (
    select distinct on (coalesce(f.contato_id, f.id)) f.responsavel_id,
           (select o.status from public.oportunidades o where o.contato_id = f.contato_id
             order by o.criado_em desc limit 1) as st
      from public.fichas_judiciais f
     where f.organizacao_id = p_org and f.finalizada_em >= p_ini and f.finalizada_em < v_fim
     order by coalesce(f.contato_id, f.id), f.finalizada_em desc
  ),
  ficn as (select * from fic where st is null or st not in ('ganho', 'perdido'))
  select jsonb_build_object(
           'lotes_ne', coalesce((
              select jsonb_agg(jsonb_build_object(
                       'minuto', l.mi, 'sistema', l.por is null,
                       'quem', case when p_admin then (select u.nome from public.usuarios u where u.id = l.por) end,
                       'qtd', l.qtd, 'retroativos', l.retro, 'antigos', l.antigos, 'd_min', l.d_min, 'd_max', l.d_max)
                     order by l.mi)
                from lotes l
               where (l.mi >= p_ini and l.mi < v_fim)
                  or (l.d_min is not null and l.d_min < (p_fim at time zone 'America/Sao_Paulo')::date
                      and l.d_max >= (p_ini at time zone 'America/Sao_Paulo')::date)), '[]'::jsonb),
           'transferencias', coalesce((
              select jsonb_agg(jsonb_build_object(
                       'minuto', l.mi,
                       'qtd', l.qtd,
                       'de', case when p_admin then (select u.nome from public.usuarios u where u.id::text = l.de) end,
                       'para', case when p_admin then (select jsonb_agg(jsonb_build_object('nome', u.nome, 'qtd', (y->>'qtd')::int)
                                                                        order by (y->>'qtd')::int desc, y->>'uid')
                                  from jsonb_array_elements(coalesce(l.para, '[]'::jsonb)) y
                                  left join public.usuarios u on u.id::text = y->>'uid') else '[]'::jsonb end)
                     order by l.mi)
                from trl l), '[]'::jsonb),
           'fichas_sem_fechado', jsonb_build_object(
              'total', (select count(*) from ficn),
              'por_pessoa', case when p_admin then coalesce((
                  select jsonb_agg(jsonb_build_object('nome', coalesce(u.nome, 'Sem responsável'), 'qtd', z.q) order by z.q desc)
                    from (select responsavel_id, count(*) as q from ficn group by 1) z
                    left join public.usuarios u on u.id = z.responsavel_id), '[]'::jsonb) else '[]'::jsonb end))
    into v_notas;

  select coalesce(jsonb_agg(d::date order by d), '[]'::jsonb) into v_ferp
    from unnest(v_fer) d
   where d >= (p_ini at time zone 'America/Sao_Paulo')::date and d <= (v_fim at time zone 'America/Sao_Paulo')::date
     and extract(isodow from d) <= 5;

  -- ================= fechados da semana =================
  -- A MESMA janela do "7 dias" da tela (hoje e os 6 dias anteriores, até agora) e as 4
  -- semanas antes dela cortadas no MESMO relógio: no "7 dias" o número do cartão é o do
  -- KPI "Fechados" (mesma regra: dash_v5_fechamentos tipo ganho). Fichas e entradas da
  -- semana contam pessoas diferentes, como o KPI. sem_fechado_semana = fichas finalizadas
  -- da semana cujo lead não está marcado ganho nem perdido (a mesma regra da nota).
  with jan as (
    select k, ((v_hoje - 6 - 7 * k)::timestamp at time zone 'America/Sao_Paulo') as ini,
           p_agora - make_interval(days => 7 * k) as fim
      from generate_series(0, 4) k
  ),
  gan as (
    select f.fechado_em from public.dash_v5_fechamentos(p_org, (select min(ini) from jan), p_agora) f where f.tipo = 'ganho'
  ),
  fic as (
    select f.finalizada_em, coalesce(f.contato_id, f.id) as quem
      from public.fichas_judiciais f
     where f.organizacao_id = p_org and f.finalizada_em >= (select min(ini) from jan) and f.finalizada_em < p_agora
  ),
  en as (
    select e.criado_em, coalesce(e.contato_id, e.oportunidade_id) as quem
      from public.dash_v5_entradas(p_org, (select min(ini) from jan), p_agora) e
  ),
  sf as (
    select distinct on (coalesce(f.contato_id, f.id)) coalesce(f.contato_id, f.id) as quem,
           (select o.status from public.oportunidades o where o.contato_id = f.contato_id
             order by o.criado_em desc limit 1) as st
      from public.fichas_judiciais f
      join jan j on j.k = 0
     where f.organizacao_id = p_org and f.finalizada_em >= j.ini and f.finalizada_em < j.fim
     order by coalesce(f.contato_id, f.id), f.finalizada_em desc
  )
  select jsonb_build_object(
           'semanas', (select jsonb_agg(jsonb_build_object(
                 'inicio', j.ini, 'fim', j.fim,
                 'ganhos',   (select count(*) from gan where gan.fechado_em >= j.ini and gan.fechado_em < j.fim),
                 'fichas',   (select count(distinct fic.quem) from fic where fic.finalizada_em >= j.ini and fic.finalizada_em < j.fim),
                 'entradas', (select count(distinct en.quem) from en where en.criado_em >= j.ini and en.criado_em < j.fim))
               order by j.k) from jan j),
           'sem_fechado_semana', (select count(*) from sf where sf.st is null or sf.st not in ('ganho', 'perdido')))
    into v_semana;

  return jsonb_build_object(
    'versao',            1,
    'gerado_em',         now(),
    'agora',             p_agora,
    'admin',             p_admin,
    'base_calculada_em', p_base->'calculado_em',
    'janela',            jsonb_build_object('inicio', p_ini, 'fim', p_fim, 'inclui_agora', v_inclui),
    'dia_util',          v_util,
    'feriados_no_periodo', v_ferp,
    'numeros',           v_numeros,
    'total',             v_total,
    'ia',                v_ia,
    'equipe',            v_equipe,
    'pessoas',           v_pessoas,
    'fechamentos',       jsonb_build_object('diario', coalesce(p_base->'fech_diario', '[]'::jsonb),
                                            'semanas', coalesce(v_semana->'semanas', '[]'::jsonb),
                                            'sem_fechado_semana', coalesce(v_semana->'sem_fechado_semana', '0'::jsonb)),
    'notas',             v_notas);
end;
$$;


-- ---------------------------------------------------------------- 5) RPC pública
create or replace function public.dashboard_v5_sinais(
  p_inicio timestamptz,
  p_fim    timestamptz,
  p_org    uuid        default null,
  p_agora  timestamptz default null
)
returns jsonb
language plpgsql
volatile security definer
set search_path = public
as $$
declare
  -- versão da linha de base em cache: SUBA ao mudar a lógica de dash_v5s_base (o cache do
  -- dia na versão antiga deixa de ser lido; o dia é recalculado na 1ª chamada)
  c_versao constant integer := 1;
  v_org   uuid;
  v_agora timestamptz;
  v_dia   date;
  v_admin boolean;
  v_base  jsonb;
  v_falta boolean;
begin
  -- mesmas validações e o MESMO portão de dashboard_v5
  if p_inicio is null or p_fim is null or p_fim <= p_inicio then
    raise exception 'periodo_invalido';
  end if;
  if p_fim - p_inicio > interval '45 days' then
    raise exception 'periodo_longo';
  end if;
  v_org := p_org;
  if v_org is null then
    select ou.organizacao_id into v_org
      from public.organizacao_usuarios ou
     where ou.usuario_id = auth.uid() and ou.status = 'ativo'
     limit 1;
  end if;
  if v_org is null then raise exception 'org_indefinida'; end if;
  if not public.is_member(v_org) and not public.is_platform_admin() then
    raise exception 'sem_permissao';
  end if;

  -- replay (p_agora) só para o admin da plataforma; nunca no futuro
  v_agora := case when p_agora is not null and public.is_platform_admin() then least(p_agora, now()) else now() end;
  v_dia   := (v_agora at time zone 'America/Sao_Paulo')::date;
  v_admin := public.is_platform_admin() or exists (
               select 1 from public.organizacao_usuarios ou
                where ou.organizacao_id = v_org and ou.usuario_id = auth.uid()
                  and ou.status = 'ativo' and ou.papel in ('admin', 'supervisor'));

  if p_agora is null or v_agora >= now() - interval '1 minute' then
    select b.payload into v_base
      from public.dash_v5_sinais_base b
     where b.organizacao_id = v_org and b.dia = v_dia and b.versao = c_versao;
    -- número conectado que não está na base do dia (criado, recriado ou reativado depois da
    -- 1ª chamada): recalcula e troca o cache — senão ele ficaria o dia todo sem aviso
    v_falta := v_base is not null and exists (
      select 1 from public.canais ca
       where ca.organizacao_id = v_org and ca.ativo and ca.status_integracao = 'conectado'
         and ca.tipo = 'whatsapp' and coalesce(ca.papel, '') <> 'notificacao'
         and not exists (select 1 from jsonb_array_elements(coalesce(v_base->'numeros', '[]'::jsonb)) x
                          where x->>'canal_id' = ca.id::text));
    if v_base is null or v_falta then
      v_base := public.dash_v5s_base(v_org, v_dia);
      begin
        insert into public.dash_v5_sinais_base (organizacao_id, dia, versao, payload)
        values (v_org, v_dia, c_versao, v_base)
        on conflict (organizacao_id, dia, versao) do update
          set payload = excluded.payload, calculado_em = now();
        delete from public.dash_v5_sinais_base where organizacao_id = v_org and dia < v_dia - 7;
      exception when read_only_sql_transaction then
        null;  -- chamada em transação só leitura (GET): calcula e não guarda
      end;
    end if;
  else
    v_base := public.dash_v5s_base(v_org, v_dia);   -- replay: nunca cacheado
  end if;

  return public.dash_v5s_vivo(v_org, v_agora, p_inicio, p_fim, v_admin, v_base);
end;
$$;


-- ---------------------------------------------------------------- 6) grants
revoke all on function public.dash_v5s_feriados() from public, anon, authenticated;
revoke all on function public.dash_v5s_feriados_uteis_antes(date) from public, anon, authenticated;
revoke all on function public.dash_v5s_relogio(timestamptz) from public, anon, authenticated;
revoke all on function public.dash_v5s_min_uteis(timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.dash_v5s_esp(double precision[], double precision[], timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.dash_v5s_arr(jsonb) from public, anon, authenticated;
revoke all on function public.dash_v5s_base(uuid, date) from public, anon, authenticated;
revoke all on function public.dash_v5s_vivo(uuid, timestamptz, timestamptz, timestamptz, boolean, jsonb) from public, anon, authenticated;

revoke all on function public.dashboard_v5_sinais(timestamptz, timestamptz, uuid, timestamptz) from public, anon;
grant execute on function public.dashboard_v5_sinais(timestamptz, timestamptz, uuid, timestamptz) to authenticated, service_role;
