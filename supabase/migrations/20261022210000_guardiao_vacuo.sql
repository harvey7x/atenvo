-- ============================================================================
-- RADAR DE ATENDIMENTO — avisos escalonados + punição + repasse pro melhor fechador
-- (nome interno das tabelas/funções segue "vacuo_*"; o nome de produto é Radar)
-- Pedido do dono (22/10): 3 avisos quando o cliente fica no vácuo; ignorou os 3
-- → punição (perde o cliente, fica registrado) e o cliente vai pra quem tem a
-- maior conversão. O repasse fica MARCADO: "era do Matheus → foi pra Juliana →
-- ela fechou".
--
-- Desenho:
--  * Relógio em MINUTOS ÚTEIS (janela 08–20h América/São Paulo): madrugada não
--    conta — mensagem das 22h começa a contar às 8h do dia seguinte.
--  * Escalada padrão: 15 min (1º aviso) → 30 (2º) → 45 (3º/último) → 60 repasse.
--  * "No vácuo" espelha a semântica da sla_avaliar: última entrada do cliente
--    mais recente que a última saída HUMANA (autor_id presente e tipo fora de
--    sistema/nota_interna, ou autor nulo vindo do telefone).
--  * Fora do alcance: conversa sem dono (disso cuida distribuir_leads_sem_dono),
--    IA com sessão ativa, robô conduzindo (bot_conversa_estado.etapa='inicio').
--  * ativo_desde carimba o início: só conta entrada >= carimbo (há ~4,8 mil
--    conversas abertas com dono — sem o carimbo a 1ª rodada despejaria tudo).
--  * Teto diário de repasses (max_repasses_dia) como freio de segurança.
--  * Avisos entram em sla_alertas (chips do inbox + sla_alertas_ativos) com
--    título ESTÁTICO por estágio — nada de minuto no texto, senão o UPDATE
--    reescreve a linha todo tick e infla o WAL (lição de 20/10).
--  * Repasse: contatos.responsavel_id é o caminho canônico (o trigger
--    trg_sync_responsavel_cliente espalha pra conversa/kanban/etc, mesmo
--    caminho já provado pelo cron distribuir-leads-sem-dono).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- sla_alertas.tipo ganha o tipo novo 'vacuo_aviso' (o CHECK vivo é fechado)
-- ---------------------------------------------------------------------------
do $$
declare v_name text;
begin
  select conname into v_name from pg_constraint
   where conrelid = 'public.sla_alertas'::regclass and contype = 'c'
     and pg_get_constraintdef(oid) like '%atendimento_sem_resposta%';
  if v_name is not null then
    execute format('alter table public.sla_alertas drop constraint %I', v_name);
  end if;
  execute $sql$alter table public.sla_alertas add constraint sla_alertas_tipo_check
    check (tipo = any (array['atendimento_sem_resposta','cliente_qualificado_aguardando_atendimento',
      'lead_quente_aguardando','audio_recebido_precisa_humano','parado_ha_muito_tempo',
      'prazo_2_dias_em_risco','prazo_2_dias_estourado','janela_expirando','vacuo_aviso']))$sql$;
end $$;

-- ---------------------------------------------------------------------------
-- Config por organização (nasce DESLIGADO; ligar = ativo=true + ativo_desde)
-- ---------------------------------------------------------------------------
create table if not exists public.vacuo_config (
  organizacao_id          uuid primary key references public.organizacoes(id) on delete cascade,
  ativo                   boolean     not null default false,
  ativo_desde             timestamptz,
  aviso1_min              integer     not null default 15,
  aviso2_min              integer     not null default 30,
  aviso3_min              integer     not null default 45,
  repasse_min             integer     not null default 60,
  -- escada ACELERADA para lead PRIORITÁRIO (documentação enviada / IA entregou /
  -- lead quente / triagem do robô completa) — pedido do dono 23/10
  prio_aviso1_min         integer     not null default 10,
  prio_aviso2_min         integer     not null default 20,
  prio_aviso3_min         integer     not null default 30,
  prio_repasse_min        integer     not null default 40,
  hora_inicio             smallint    not null default 8,
  hora_fim                smallint    not null default 20,
  conversao_janela_dias   integer     not null default 30,
  conversao_min_recebidos integer     not null default 30,
  max_repasses_dia        integer     not null default 25,
  criado_em               timestamptz not null default now(),
  atualizado_em           timestamptz not null default now(),
  constraint vacuo_cfg_escada check (aviso1_min < aviso2_min and aviso2_min < aviso3_min and aviso3_min <= repasse_min),
  constraint vacuo_cfg_escada_prio check (prio_aviso1_min < prio_aviso2_min and prio_aviso2_min < prio_aviso3_min and prio_aviso3_min <= prio_repasse_min),
  constraint vacuo_cfg_janela check (hora_inicio >= 0 and hora_fim <= 24 and hora_inicio < hora_fim)
);

-- Estado vivo por conversa (some quando o atendente responde)
create table if not exists public.vacuo_estado (
  conversa_id    uuid primary key references public.conversas(id) on delete cascade,
  organizacao_id uuid        not null,
  contato_id     uuid,
  usuario_id     uuid,                 -- dono sendo cobrado
  base_em        timestamptz not null, -- referência do relógio (repasse reseta)
  ult_in_em      timestamptz,
  aviso          smallint    not null default 0,
  aviso_em       timestamptz,
  atualizado_em  timestamptz not null default now()
);
create index if not exists vacuo_estado_org_idx on public.vacuo_estado (organizacao_id);

-- Histórico imutável de punições/repasses (a marcação "era de X → foi pra Y")
create table if not exists public.vacuo_repasses (
  id              uuid primary key default gen_random_uuid(),
  organizacao_id  uuid        not null,
  conversa_id     uuid        not null references public.conversas(id) on delete cascade,
  contato_id      uuid        references public.contatos(id) on delete set null,
  oportunidade_id uuid        references public.oportunidades(id) on delete set null,
  de_usuario_id   uuid        not null references public.usuarios(id),
  para_usuario_id uuid        not null references public.usuarios(id),
  avisos          smallint    not null default 3,
  minutos_vacuo   integer,
  prioritario     boolean     not null default false,
  prio_motivo     text,
  criado_em       timestamptz not null default now()
);
create index if not exists vacuo_repasses_org_idx  on public.vacuo_repasses (organizacao_id, criado_em desc);
create index if not exists vacuo_repasses_conv_idx on public.vacuo_repasses (conversa_id, criado_em desc);
create index if not exists vacuo_repasses_opp_idx  on public.vacuo_repasses (oportunidade_id) where oportunidade_id is not null;

-- RLS: membros leem; escrita só pelo motor (security definer)
alter table public.vacuo_config   enable row level security;
alter table public.vacuo_estado   enable row level security;
alter table public.vacuo_repasses enable row level security;
drop policy if exists vacuo_config_sel   on public.vacuo_config;
drop policy if exists vacuo_estado_sel   on public.vacuo_estado;
drop policy if exists vacuo_repasses_sel on public.vacuo_repasses;
create policy vacuo_config_sel   on public.vacuo_config   for select to authenticated using (public.is_member(organizacao_id));
create policy vacuo_estado_sel   on public.vacuo_estado   for select to authenticated using (public.is_member(organizacao_id));
create policy vacuo_repasses_sel on public.vacuo_repasses for select to authenticated using (public.is_member(organizacao_id));

-- ---------------------------------------------------------------------------
-- Minutos ÚTEIS entre dois instantes, contando só a janela [h_ini, h_fim) SP
-- ---------------------------------------------------------------------------
create or replace function public.vacuo_minutos_uteis(
  p_ini timestamptz, p_fim timestamptz, p_h_ini int, p_h_fim int
) returns integer
language sql stable
set search_path to 'public', 'pg_temp'
as $$
  select coalesce(sum(greatest(0, extract(epoch from (
           least(p_fim, ((d.dia + make_interval(hours => p_h_fim)) at time zone 'America/Sao_Paulo'))
         - greatest(p_ini, ((d.dia + make_interval(hours => p_h_ini)) at time zone 'America/Sao_Paulo'))
         )) / 60.0))::int, 0)
  from generate_series(
         date_trunc('day', p_ini at time zone 'America/Sao_Paulo'),
         date_trunc('day', p_fim at time zone 'America/Sao_Paulo'),
         interval '1 day') as d(dia)
  where p_ini is not null and p_fim is not null and p_fim > p_ini
$$;

-- ---------------------------------------------------------------------------
-- Quem está fechando mais: maior conversão (fechados/recebidos) na janela,
-- exigindo volume mínimo; sem volume, vale quem tem mais fechamentos.
-- Só membros ATIVOS, nunca o próprio punido, e precisa ter fechado algo.
-- ---------------------------------------------------------------------------
create or replace function public.vacuo_melhor_fechador(
  p_org uuid, p_excluir uuid, p_janela_dias int default 30, p_min_recebidos int default 30
) returns uuid
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  with membros as (
    select ou.usuario_id as uid
    from public.organizacao_usuarios ou
    where ou.organizacao_id = p_org and ou.status = 'ativo'
      and ou.usuario_id is distinct from p_excluir
  ), stats as (
    select m.uid,
      coalesce((select count(*) from public.oportunidades o
        where o.organizacao_id = p_org and o.status = 'ganho'
          and o.responsavel_no_fechamento_id = m.uid
          and o.fechado_em >= now() - make_interval(days => p_janela_dias)), 0) as fechados,
      coalesce((select count(*) from public.oportunidades o
        where o.organizacao_id = p_org and o.responsavel_id = m.uid
          and o.entrada_em >= now() - make_interval(days => p_janela_dias)), 0) as recebidos
    from membros m
  )
  select uid from stats
  where fechados > 0
  order by case when recebidos >= p_min_recebidos
                then fechados::numeric / recebidos else 0 end desc,
           fechados desc, recebidos desc, uid
  limit 1
$$;

-- ---------------------------------------------------------------------------
-- O MOTOR (cron 1 min). Avalia, avisa, pune e repassa.
-- ---------------------------------------------------------------------------
create or replace function public.vacuo_avaliar(p_org uuid default null)
returns jsonb
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_avisos int := 0; v_repasses int := 0; v_limpos int := 0;
  r record; v_dest uuid; v_opp uuid; v_nome_cli text; v_nome_de text; v_nome_para text;
  v_hoje int; v_sev text; v_titulo text; v_corpo text;
begin
  drop table if exists _vac;

  -- Candidatos: conversa aberta, com dono, cliente aguardando resposta HUMANA,
  -- entrada dentro do carimbo, sem IA ativa nem robô conduzindo.
  -- Pré-filtro por conversas.ultima_entrada_em barato ANTES do lateral em mensagens.
  create temp table _vac on commit drop as
  select v.*,
         -- escada do lead: prioritário sobe mais rápido (pedido do dono 23/10)
         case when v.prioritario then v.p_a1 else v.a1 end as th1,
         case when v.prioritario then v.p_a2 else v.a2 end as th2,
         case when v.prioritario then v.p_a3 else v.a3 end as th3,
         case when v.prioritario then v.p_rep else v.rep end as th_rep
  from (
    select c.id as conversa_id, c.organizacao_id, c.contato_id,
           coalesce(ct.responsavel_id, c.atendente_id) as dono,
           ct.nome as contato_nome,
           um.ult_in,
           -- base do relógio = PRIMEIRA mensagem do cliente ainda sem resposta humana
           -- (rajada de mensagens não empurra o relógio). Com episódio aberto, PRESERVA a
           -- base; quem zera é a resposta humana (apaga o estado) ou o repasse/troca de dono.
           coalesce(ve.base_em, greatest(pend.pri_in, cfg.ativo_desde)) as base_rel,
           ve.aviso as aviso_atual,
           cfg.aviso1_min as a1, cfg.aviso2_min as a2, cfg.aviso3_min as a3, cfg.repasse_min as rep,
           cfg.prio_aviso1_min as p_a1, cfg.prio_aviso2_min as p_a2, cfg.prio_aviso3_min as p_a3, cfg.prio_repasse_min as p_rep,
           cfg.hora_inicio, cfg.hora_fim,
           cfg.conversao_janela_dias, cfg.conversao_min_recebidos, cfg.max_repasses_dia,
           public.vacuo_minutos_uteis(
             coalesce(ve.base_em, greatest(pend.pri_in, cfg.ativo_desde)), now(),
             cfg.hora_inicio, cfg.hora_fim) as min_vacuo,
           -- PRIORIDADE: documentação enviada > IA qualificou/entregou > lead quente > triagem do robô completa
           (coalesce(ia.tem_docs, false) or coalesce(ia.ia_handoff, false)
            or coalesce(e.lead_quente, false) or e.etapa = 'concluido') as prioritario,
           case when coalesce(ia.tem_docs, false)   then 'documentação enviada'
                when coalesce(ia.ia_handoff, false) then 'IA qualificou e entregou'
                when coalesce(e.lead_quente, false) then 'lead quente (interesse confirmado)'
                when e.etapa = 'concluido'          then 'triagem do robô completa'
                else null end as prio_motivo
    from public.conversas c
    join public.vacuo_config cfg
      on cfg.organizacao_id = c.organizacao_id and cfg.ativo and cfg.ativo_desde is not null
    left join public.contatos ct on ct.id = c.contato_id
    left join public.vacuo_estado ve on ve.conversa_id = c.id
    left join public.bot_conversa_estado e on e.conversa_id = c.id
    left join lateral (
      select max(coalesce(m.recebida_em, m.criado_em)) filter (where m.direcao = 'entrada') as ult_in,
             max(coalesce(m.enviada_em, m.criado_em)) filter (where m.direcao = 'saida'
               and ((m.autor_id is not null and m.tipo not in ('sistema','nota_interna'))
                    or (m.autor_id is null and m.origem = 'telefone'))) as ult_humano
      from public.mensagens m where m.conversa_id = c.id
    ) um on true
    left join lateral (
      select min(coalesce(m.recebida_em, m.criado_em)) as pri_in
      from public.mensagens m
      where m.conversa_id = c.id and m.direcao = 'entrada'
        and coalesce(m.recebida_em, m.criado_em) > coalesce(um.ult_humano, '-infinity'::timestamptz)
    ) pend on true
    left join lateral (
      select bool_or(s.docs is not null and s.docs <> '{}'::jsonb and s.docs <> '[]'::jsonb) as tem_docs,
             bool_or(s.status = 'handoff') as ia_handoff,
             bool_or(s.status = 'ativa')   as ia_ativa
      from public.ia_sessoes s where s.conversa_id = c.id
    ) ia on true
    where c.arquivada_em is null
      and c.status in ('aberta','em_atendimento','pendente')
      and (p_org is null or c.organizacao_id = p_org)
      and (ct.responsavel_id is not null or c.atendente_id is not null)
      and c.ultima_entrada_em is not null
      and c.ultima_entrada_em >= cfg.ativo_desde
      -- teto de 7 dias: além disso o caso já passou pelo repasse (mantém o tick barato)
      and c.ultima_entrada_em >= now() - interval '7 days'
      and um.ult_in is not null
      and um.ult_in >= cfg.ativo_desde
      and (um.ult_humano is null or um.ult_humano < um.ult_in)
      and coalesce(e.etapa, '') <> 'inicio'
      and not coalesce(ia.ia_ativa, false)  -- IA atendendo agora: não é vácuo do humano
  ) v;

  delete from _vac where dono is null;

  -- Troca de dono no meio do episódio (transferência manual, etc.): o NOVO dono
  -- recebe relógio zerado — nunca é punido por avisos que foram de outra pessoa.
  drop table if exists _mud;
  create temp table _mud on commit drop as
  with mud as (
    update public.vacuo_estado ve
       set aviso = 0, aviso_em = null, usuario_id = v.dono, base_em = now(), atualizado_em = now()
      from _vac v
     where v.conversa_id = ve.conversa_id and ve.usuario_id is distinct from v.dono
    returning ve.conversa_id
  ) select conversa_id from mud;
  update _vac set aviso_atual = 0, base_rel = now(), min_vacuo = 0
   where conversa_id in (select conversa_id from _mud);

  -- Limpeza: quem saiu do vácuo (respondeu/arquivou/fechou) perde estado e alerta
  delete from public.vacuo_estado ve
  where (p_org is null or ve.organizacao_id = p_org)
    and not exists (select 1 from _vac v where v.conversa_id = ve.conversa_id);
  get diagnostics v_limpos = row_count;

  update public.sla_alertas a
     set resolvido_em = now(), resolucao = 'auto', atualizado_em = now()
   where a.tipo = 'vacuo_aviso' and a.resolvido_em is null
     and (p_org is null or a.organizacao_id = p_org)
     and not exists (select 1 from _vac v
                     where v.conversa_id = a.conversa_id
                       and v.min_vacuo >= v.th1);

  -- Avisos 1→3 (cada estágio dispara UMA vez; estado guarda o estágio atual)
  for r in
    select *, case when min_vacuo >= th3 then 3
                   when min_vacuo >= th2 then 2
                   when min_vacuo >= th1 then 1
                   else 0 end as alvo
    from _vac
  loop
    if r.alvo = 0 then
      -- ainda sem aviso: se já havia estado (ex.: cliente mandou msg nova), mantém base
      continue;
    end if;
    if coalesce(r.aviso_atual, 0) >= r.alvo then
      continue; -- estágio já dado
    end if;

    -- subtransação por conversa: um caso com dado ruim NUNCA derruba o tick inteiro
    begin
    insert into public.vacuo_estado (conversa_id, organizacao_id, contato_id, usuario_id, base_em, ult_in_em, aviso, aviso_em, atualizado_em)
    values (r.conversa_id, r.organizacao_id, r.contato_id, r.dono, r.base_rel, r.ult_in, r.alvo, now(), now())
    on conflict (conversa_id) do update
      set aviso = excluded.aviso, aviso_em = now(), usuario_id = excluded.usuario_id,
          base_em = excluded.base_em, ult_in_em = excluded.ult_in_em, atualizado_em = now();

    v_sev    := case r.alvo when 1 then 'amarelo' when 2 then 'vermelho' else 'critico' end;
    v_titulo := case r.alvo
                  when 1 then '⏰ 1º aviso — cliente no vácuo'
                  when 2 then '⏰ 2º aviso — cliente segue no vácuo'
                  else '🚨 3º e ÚLTIMO aviso — repasse automático iminente'
                end;
    -- prefixo de PRIORIDADE (📄 docs / 🔥 demais) — o front reconhece pelo 1º caractere
    if r.prioritario then
      v_titulo := case when r.prio_motivo = 'documentação enviada' then '📄 ' else '🔥 ' end || v_titulo;
    end if;
    -- título/detalhe ESTÁTICOS por estágio+motivo (guarda anti-WAL da sla_avaliar)
    insert into public.sla_alertas
      (organizacao_id, tipo, severidade, conversa_id, contato_id, responsavel_id, titulo, detalhe, dedup_key)
    values
      (r.organizacao_id, 'vacuo_aviso', v_sev, r.conversa_id, r.contato_id, r.dono, v_titulo,
       case when r.prioritario
            then 'LEAD PRIORITÁRIO (' || r.prio_motivo || ') — escada acelerada. '
            else '' end ||
       'Responda o cliente para interromper a escalada. Depois do 3º aviso ignorado, o cliente é repassado para quem mais fecha e a punição fica registrada.',
       'vacuo_aviso:' || r.conversa_id)
    on conflict (organizacao_id, dedup_key) where resolvido_em is null do update
      set severidade = excluded.severidade, titulo = excluded.titulo,
          detalhe = excluded.detalhe, responsavel_id = excluded.responsavel_id, atualizado_em = now()
      where (sla_alertas.severidade, sla_alertas.titulo, sla_alertas.responsavel_id)
            is distinct from (excluded.severidade, excluded.titulo, excluded.responsavel_id);

    -- sino do atendente (central de notificações do v2)
    insert into public.notificacoes (organizacao_id, usuario_id, tipo, titulo, corpo, rota, ref_id)
    values (r.organizacao_id, r.dono, 'vacuo_aviso',
            case when r.prioritario then case when r.prio_motivo = 'documentação enviada' then '📄 ' else '🔥 ' end else '' end ||
            case r.alvo when 1 then '⏰ 1º aviso: cliente no vácuo'
                        when 2 then '⏰ 2º aviso: cliente segue no vácuo'
                        else '🚨 Último aviso: responda ou o cliente será repassado' end,
            coalesce(r.contato_nome, 'Cliente') || ' está há ' || r.min_vacuo ||
            ' min sem resposta (horário útil). ' ||
            case when r.prioritario then 'LEAD PRIORITÁRIO: ' || r.prio_motivo || '. ' else '' end ||
            case r.alvo when 3 then 'Próximo passo: repasse automático para quem mais fecha, com punição registrada.'
                        else 'Aviso ' || r.alvo || ' de 3 antes do repasse.' end,
            '/whatsapp?conversa=' || r.conversa_id, r.conversa_id);

    v_avisos := v_avisos + 1;
    exception when others then
      raise warning 'vacuo_avaliar: aviso falhou na conversa % — %', r.conversa_id, sqlerrm;
    end;
  end loop;

  -- Repasses: 3 avisos dados + tempo de repasse vencido → punição + transferência
  for r in
    select v.*, u.nome as nome_dono
    from _vac v
    join public.vacuo_estado ve on ve.conversa_id = v.conversa_id
    left join public.usuarios u on u.id = v.dono
    where ve.aviso >= 3 and v.min_vacuo >= v.th_rep
      -- o 3º aviso precisa ter ficado pelo menos 5 min na tela antes do repasse
      and ve.aviso_em <= now() - interval '5 minutes'
    -- prioritários repassam primeiro quando o teto diário aperta
    order by v.prioritario desc, v.min_vacuo desc
  loop
    -- freio: teto diário por organização
    select count(*) into v_hoje from public.vacuo_repasses
     where organizacao_id = r.organizacao_id
       and criado_em >= date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
    if v_hoje >= r.max_repasses_dia then
      continue;
    end if;

    v_dest := public.vacuo_melhor_fechador(r.organizacao_id, r.dono,
                r.conversao_janela_dias, r.conversao_min_recebidos);
    if v_dest is null then
      continue; -- ninguém elegível: mantém o alerta crítico, não transfere
    end if;

    begin

    select nome into v_nome_para from public.usuarios where id = v_dest;
    v_nome_de  := coalesce(r.nome_dono, 'atendente anterior');
    v_nome_cli := coalesce(r.contato_nome, 'Cliente');

    -- oportunidade aberta do contato (se houver) p/ amarrar o desfecho
    select o.id into v_opp from public.oportunidades o
     where o.contato_id = r.contato_id and o.organizacao_id = r.organizacao_id
       and o.status = 'em_andamento'
     order by o.entrada_em desc limit 1;

    -- a punição registrada
    insert into public.vacuo_repasses
      (organizacao_id, conversa_id, contato_id, oportunidade_id, de_usuario_id, para_usuario_id, avisos, minutos_vacuo, prioritario, prio_motivo)
    values (r.organizacao_id, r.conversa_id, r.contato_id, v_opp, r.dono, v_dest, 3, r.min_vacuo, r.prioritario, r.prio_motivo);

    -- transferência pelo caminho canônico (trigger espalha p/ conversa/kanban/etc)
    update public.contatos set responsavel_id = v_dest where id = r.contato_id;
    update public.conversas set atendente_id = v_dest
     where id = r.conversa_id and atendente_id is distinct from v_dest;

    -- trilha na Atividade do atendimento (de/para são jsonb no MESMO formato do atribuir-atendimento)
    insert into public.conversa_atividades (organizacao_id, conversa_id, usuario_id, tipo, de, para, motivo)
    values (r.organizacao_id, r.conversa_id, null, 'transferido',
            jsonb_build_object('responsavel_id', r.dono), jsonb_build_object('responsavel_id', v_dest),
            'Radar de Atendimento: 3 avisos ignorados (' || r.min_vacuo || ' min úteis sem resposta). De ' ||
            v_nome_de || ' para ' || v_nome_para || '.');

    -- nota interna na própria conversa (contexto pra quem recebe; não conta como resposta)
    insert into public.mensagens
      (organizacao_id, conversa_id, direcao, tipo, origem, status, conteudo, enviada_em)
    values
      (r.organizacao_id, r.conversa_id, 'saida', 'nota_interna', 'bot', 'enviada',
       '🛡️ Radar de Atendimento: cliente repassado de ' || v_nome_de || ' para ' || v_nome_para ||
       ' após 3 avisos ignorados (' || r.min_vacuo || ' min úteis sem resposta).' ||
       case when r.prioritario then ' LEAD PRIORITÁRIO: ' || r.prio_motivo || '.' else '' end, now());

    -- sinos: punido e novo dono
    insert into public.notificacoes (organizacao_id, usuario_id, tipo, titulo, corpo, rota, ref_id) values
      (r.organizacao_id, r.dono, 'vacuo_punicao',
       '🛡️ Radar: você perdeu um cliente por falta de resposta',
       v_nome_cli || ' ficou ' || r.min_vacuo || ' min sem resposta após 3 avisos e foi repassado para ' ||
       v_nome_para || '. A punição ficou registrada no painel.',
       '/whatsapp?conversa=' || r.conversa_id, r.conversa_id),
      (r.organizacao_id, v_dest, 'vacuo_recebido',
       '🛡️ Radar: cliente repassado para você — priorize',
       v_nome_cli || ' estava com ' || v_nome_de || ' e veio pra você pelo Radar de Atendimento. Responda assim que puder.',
       '/whatsapp?conversa=' || r.conversa_id, r.conversa_id);

    -- novo ciclo: relógio zera pro novo dono
    update public.vacuo_estado
       set aviso = 0, aviso_em = null, usuario_id = v_dest, base_em = now(), atualizado_em = now()
     where conversa_id = r.conversa_id;

    update public.sla_alertas
       set resolvido_em = now(), resolucao = 'repassado', atualizado_em = now()
     where tipo = 'vacuo_aviso' and conversa_id = r.conversa_id and resolvido_em is null;

    v_repasses := v_repasses + 1;
    exception when others then
      raise warning 'vacuo_avaliar: repasse falhou na conversa % — %', r.conversa_id, sqlerrm;
    end;
  end loop;

  return jsonb_build_object('avisos', v_avisos, 'repasses', v_repasses, 'estados_limpos', v_limpos);
end $$;

revoke all on function public.vacuo_avaliar(uuid) from public, anon, authenticated;
revoke all on function public.vacuo_melhor_fechador(uuid, uuid, int, int) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Ranking p/ o painel: conversão por atendente (mesma conta do motor) + punições
-- ---------------------------------------------------------------------------
create or replace function public.vacuo_ranking(p_org uuid)
returns table (usuario_id uuid, nome text, fechados bigint, recebidos bigint, taxa numeric, punicoes bigint)
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  with cfg as (
    select coalesce((select c.conversao_janela_dias from public.vacuo_config c
                     where c.organizacao_id = p_org), 30) as dias
  ), base as (
    select ou.usuario_id as uid, u.nome,
      coalesce((select count(*) from public.oportunidades o
        where o.organizacao_id = p_org and o.status = 'ganho'
          and o.responsavel_no_fechamento_id = ou.usuario_id
          and o.fechado_em >= now() - make_interval(days => (select dias from cfg))), 0) as fechados,
      coalesce((select count(*) from public.oportunidades o
        where o.organizacao_id = p_org and o.responsavel_id = ou.usuario_id
          and o.entrada_em >= now() - make_interval(days => (select dias from cfg))), 0) as recebidos,
      coalesce((select count(*) from public.vacuo_repasses vr
        where vr.organizacao_id = p_org and vr.de_usuario_id = ou.usuario_id
          and vr.criado_em >= now() - make_interval(days => (select dias from cfg))), 0) as punicoes
    from public.organizacao_usuarios ou
    join public.usuarios u on u.id = ou.usuario_id
    where ou.organizacao_id = p_org and ou.status = 'ativo'
      and public.is_member(p_org)
  )
  select uid, nome, fechados, recebidos,
         case when recebidos > 0 then round(fechados::numeric / recebidos * 100, 1) else 0 end as taxa,
         punicoes
  from base
  order by taxa desc, fechados desc
$$;
grant execute on function public.vacuo_ranking(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- sla_avaliar (motor de SLA vivo) auto-resolve TODO alerta ativo que ele mesmo não
-- produziu no tick → apagaria os avisos do Radar em até 1 min. Remenda a versão
-- VIVA no lugar (sem recriar de arquivo velho): a auto-resolução passa a ignorar
-- 'vacuo_aviso', que tem o próprio ciclo de vida em vacuo_avaliar. Aborta se o
-- trecho esperado não existir (função mudou → revisar à mão).
-- ---------------------------------------------------------------------------
do $$
declare
  d text := pg_get_functiondef('public.sla_avaliar(uuid)'::regprocedure);
  alvo text := 'where a.resolvido_em is null and (p_org is null or a.organizacao_id = p_org)';
  novo text := 'where a.resolvido_em is null and a.tipo <> ''vacuo_aviso'' and (p_org is null or a.organizacao_id = p_org)';
begin
  if position(novo in d) > 0 then
    return; -- já remendada
  end if;
  if position(alvo in d) = 0 then
    raise exception 'sla_avaliar mudou: trecho de auto-resolução não encontrado — remendar à mão';
  end if;
  if (length(d) - length(replace(d, alvo, ''))) / length(alvo) <> 1 then
    raise exception 'sla_avaliar: trecho de auto-resolução ambíguo — remendar à mão';
  end if;
  execute replace(d, alvo, novo);
end $$;

-- Config da CAF nasce DESLIGADA (ligar = ativo=true + ativo_desde=now() no "publica")
insert into public.vacuo_config (organizacao_id, ativo)
values ('de300000-0000-4000-8000-000000000001', false)
on conflict (organizacao_id) do nothing;

-- Cron de 1 min (inerte enquanto nenhuma config está ativa)
do $$ begin
  if not exists (select 1 from cron.job where jobname = 'vacuo-guardiao') then
    perform cron.schedule('vacuo-guardiao', '* * * * *', 'select public.vacuo_avaliar()');
  end if;
end $$;
