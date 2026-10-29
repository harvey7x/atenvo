-- Radar de Atendimento v5 — central de avisos organizada (dono 29/10: "mensagens melhores, mais
-- organizadas, ultra profissional; cliente FECHADO aparece separado de quem está em negociação").
--  1) categoria própria 'vacuo_fechado' (alerta + notificação); fechado nunca vai para decisão de repasse
--  2) caderno de textos (radar_textos + radar_txt): uma fonte para alertas, sino e notas — sem emoji
--  3) motor v5: troca de categoria no meio da espera, sino que se arruma sozinho, resumo contra
--     enxurrada (mais de 3 avisos de uma vez viram 1), cliente fechado que só agradeceu não abre aviso
--  4) ações (pedir resposta / decidir / ligar) com os textos novos e leitura automática no sino
--  5) radar_avisos: dado estruturado para o front (categoria, degrau, espera útil, prioridade)
--  6) arrumação única: sino limpo e textos novos nos avisos que já estão na tela
-- Substitui a 20261029120000_radar_fechados (v4), que nunca foi aplicada. Nada é enviado ao cliente.
-- ---------------------------------------------------------------------------
-- 0) Colunas novas de vacuo_estado PRIMEIRO: a mesma ordem de travas do cron (vacuo_estado → sla_alertas),
--    para a migration não cruzar com o vacuo_avaliar em execução
-- ---------------------------------------------------------------------------
alter table public.vacuo_estado add column if not exists fechado boolean not null default false;
alter table public.vacuo_estado add column if not exists cutucado_por uuid;
-- início REAL da espera (1ª mensagem do cliente ainda sem resposta) — o "desde" que a equipe vê;
-- base_em continua sendo o relógio da escada (zera na decisão do gestor e na troca de dono)
alter table public.vacuo_estado add column if not exists espera_desde timestamptz;

-- ---------------------------------------------------------------------------
-- 1) Categoria própria para cliente FECHADO: 'vacuo_fechado' (separado da negociação)
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
      'prazo_2_dias_em_risco','prazo_2_dias_estourado','janela_expirando','vacuo_aviso','robo_ligar',
      'vacuo_cutucada','vacuo_fechado']))$sql$;
end $$;

-- sla_avaliar (motor de SLA antigo, vivo) não pode auto-resolver o aviso de fechado
do $$
declare
  d text := pg_get_functiondef('public.sla_avaliar(uuid)'::regprocedure);
  alvo text := 'a.tipo not in (''vacuo_aviso'', ''robo_ligar'', ''vacuo_cutucada'')';
  novo text := 'a.tipo not in (''vacuo_aviso'', ''robo_ligar'', ''vacuo_cutucada'', ''vacuo_fechado'')';
begin
  if position(novo in d) > 0 then return; end if;
  if position(alvo in d) = 0 then raise exception 'sla_avaliar mudou: exclusão não encontrada — remendar à mão'; end if;
  execute replace(d, alvo, novo);
end $$;


-- ---------------------------------------------------------------------------
-- 2) Caderno de textos do Radar: UMA fonte para avisos, sino e notas internas
-- ---------------------------------------------------------------------------
create table if not exists public.radar_textos (
  chave         text primary key,
  titulo        text,
  texto         text,
  atualizado_em timestamptz not null default now()
);
alter table public.radar_textos enable row level security;
drop policy if exists radar_textos_sel on public.radar_textos;
create policy radar_textos_sel on public.radar_textos for select to authenticated using (true);
grant select on public.radar_textos to authenticated;
grant select, insert, update, delete on public.radar_textos to service_role;

-- texto do caderno com os {placeholders} preenchidos; placeholder sem valor some sem deixar rastro
create or replace function public.radar_txt(p_chave text, p jsonb default '{}'::jsonb)
returns jsonb
language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
as $$
declare t record; kv record; v_tit text; v_txt text;
begin
  select titulo, texto into t from public.radar_textos where chave = p_chave;
  v_tit := coalesce(t.titulo, '');
  v_txt := coalesce(t.texto, '');
  for kv in select key, value from jsonb_each_text(coalesce(p, '{}'::jsonb)) loop
    v_tit := replace(v_tit, '{' || kv.key || '}', coalesce(kv.value, ''));
    v_txt := replace(v_txt, '{' || kv.key || '}', coalesce(kv.value, ''));
  end loop;
  v_tit := btrim(regexp_replace(regexp_replace(v_tit, '\{[a-z_]+\}', '', 'g'), '\s{2,}', ' ', 'g'));
  v_txt := btrim(regexp_replace(regexp_replace(v_txt, '\{[a-z_]+\}', '', 'g'), '\s{2,}', ' ', 'g'));
  return jsonb_build_object('titulo', nullif(v_tit, ''), 'texto', nullif(v_txt, ''));
end $$;
revoke all on function public.radar_txt(text, jsonb) from public, anon;
grant execute on function public.radar_txt(text, jsonb) to authenticated;

-- "40 min" · "2 h" · "2 h 15 min" · "1 dia útil" · "1 dia útil e 2 h" (minutos ÚTEIS; dia útil = p_dia)
create or replace function public.radar_fmt_tempo(p_min integer, p_dia integer default 540)
returns text
language sql immutable
as $$
  select case
    when p_min is null then ''
    when p_min < 60 then greatest(p_min, 1) || ' min'
    when p_min < p_dia then (p_min / 60) || ' h' || case when p_min % 60 > 0 then ' ' || (p_min % 60) || ' min' else '' end
    else (p_min / p_dia) || case when p_min / p_dia = 1 then ' dia útil' else ' dias úteis' end ||
         case when (p_min % p_dia) / 60 > 0 then ' e ' || ((p_min % p_dia) / 60) || ' h' else '' end
  end
$$;

-- "23/10 às 11:51" (fuso de São Paulo). Texto GRAVADO usa sempre a data real — "hoje" ou
-- "há 2 h" envelheceriam errado no sino; a tela é que mostra relativo ("hoje às…"), ao vivo
create or replace function public.radar_fmt_desde(p_ts timestamptz)
returns text
language sql stable
as $$
  select case when p_ts is null then ''
              else to_char(p_ts at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI') end
$$;

-- mensagem que só agradece/confirma ("ok", "obrigado", "tá bom então", "valeu", só emoji) — cliente
-- FECHADO que manda isso não está esperando resposta. Pergunta ("?"), saudação, mídia: NUNCA é.
create or replace function public.radar_so_agradecimento(p_tipo text, p_txt text)
returns boolean
language sql immutable
as $$
  select coalesce(p_tipo, '') = 'texto' and position('?' in coalesce(p_txt, '')) = 0 and (s = '' or s ~
    '^((muito )?(obrigad[oa]|obrigadao|obrgad[oa]|obg[da]*|brigad[oa]|grat[oa]|gratidao|agradec[a-z]*)|ok+|okay|blz|beleza|valeu|vlw|ta bom|tabom|ta certo|certo|combinado|show|perfeito|otimo|top|joia|entendi|amem|deus (te )?abencoe)( (e|entao|ok+|sim|viu|valeu|vlw|muito|igualmente|(muito )?obrigad[oa]|obrgad[oa]|obg[da]*|tudo bem|deus (te )?abencoe|por tudo|pela atencao|tmj|bom|ta|certo|de bola))*$')
  -- dígitos FICAM no texto normalizado: mensagem só com número (CPF, benefício, código) não é agradecimento
  from (select btrim(regexp_replace(regexp_replace(
                 translate(lower(coalesce(p_txt, '')), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'),
                 '[^a-z0-9? ]', ' ', 'g'), '\s+', ' ', 'g')) as s) x
$$;

-- nome para TÍTULO GRAVADO (sino): até 26 caracteres fica como está; acima disso os nomes do meio
-- viram iniciais e as partículas saem ("Maria Aparecida dos Santos Ferreira" → "Maria A. S. Ferreira"),
-- para nenhum título passar de 48 caracteres. A tela mostra o nome inteiro (com reticências).
create or replace function public.radar_nome_curto(p_nome text)
returns text
language plpgsql immutable
as $$
declare partes text[]; v_out text; i int; n int;
begin
  p_nome := btrim(regexp_replace(coalesce(p_nome, ''), '\s+', ' ', 'g'));
  -- sem nome ou "nome" que é só número/telefone: igual à tela (nomeContatoExib)
  if p_nome = '' or p_nome ~ '^[\d\s()+\-]+$' then return 'Cliente sem nome'; end if;
  if char_length(p_nome) <= 26 then return p_nome; end if;
  partes := string_to_array(p_nome, ' ');
  n := array_length(partes, 1);
  if n >= 3 then
    v_out := partes[1];
    for i in 2 .. n - 1 loop
      if lower(partes[i]) in ('de', 'da', 'do', 'dos', 'das', 'e', 'di', 'du', 'del') then continue; end if;
      v_out := v_out || ' ' || upper(left(partes[i], 1)) || '.';
    end loop;
    v_out := v_out || ' ' || partes[n];
  else
    v_out := p_nome;
  end if;
  if char_length(v_out) > 26 then v_out := left(v_out, 25) || '…'; end if;
  return v_out;
end $$;

-- rótulo de prioridade para os textos (motivo técnico → linguagem da equipe)
create or replace function public.radar_prioridade(p_prioritario boolean, p_motivo text)
returns text
language sql immutable
as $$
  select case when not coalesce(p_prioritario, false) then ''
              when p_motivo = 'documentação enviada' then 'Documentação enviada'
              else 'Interesse confirmado' end
$$;

-- caderno de textos do Radar (gerado; o front tem a mesma fonte em src/v2/lib/radarDeck.ts)
insert into public.radar_textos (chave, titulo, texto) values
  ('alerta.negociacao.1', 'Em negociação · 1º aviso', 'Sem resposta há {tempo}. Responda ao cliente para encerrar os avisos.'),
  ('alerta.negociacao.2', 'Em negociação · 2º aviso', 'Sem resposta há {tempo}. O próximo é o último aviso.'),
  ('alerta.negociacao.3', 'Em negociação · último aviso', 'Sem resposta há {tempo}. Com 1 dia útil sem resposta, o gestor decide se o cliente continua com você.'),
  ('alerta.fechado.1', 'Cliente fechado · 1º aviso', 'Sem resposta há {tempo}. Responda ao cliente para encerrar os avisos.'),
  ('alerta.fechado.2', 'Cliente fechado · 2º aviso', 'Sem resposta há {tempo}. O próximo é o último aviso.'),
  ('alerta.fechado.3', 'Cliente fechado · último aviso', 'Sem resposta há {tempo}. Já assinou com o escritório e aguarda seu retorno.'),
  ('alerta.ligar', 'Ligar para o cliente', 'Parou no atendimento automático há {tempo} e ainda não falou com a equipe. Ligue para retomar a conversa.'),
  ('alerta.cutucada', 'Pedido do gestor', '{gestor} pediu que você responda agora. Sem resposta há {tempo}.'),
  ('notif.negociacao.1', '{cliente} · 1º aviso', 'Cliente em negociação sem resposta desde {desde}. Responda para encerrar os avisos.'),
  ('notif.negociacao.2', '{cliente} · 2º aviso', 'Cliente em negociação sem resposta desde {desde}. O próximo é o último aviso.'),
  ('notif.negociacao.3', '{cliente} · último aviso', 'Cliente em negociação sem resposta desde {desde}. Com 1 dia útil sem resposta, o gestor decide se o cliente continua com você.'),
  ('notif.fechado.1', '{cliente} · 1º aviso', 'Cliente fechado sem resposta desde {desde}. Responda para encerrar os avisos.'),
  ('notif.fechado.2', '{cliente} · 2º aviso', 'Cliente fechado sem resposta desde {desde}. O próximo é o último aviso.'),
  ('notif.fechado.3', '{cliente} · último aviso', 'Cliente fechado sem resposta desde {desde}. Já assinou com o escritório e aguarda seu retorno.'),
  ('notif.ligar', 'Ligue para {cliente}', 'Lead novo parou no atendimento automático em {desde} e ainda não falou com a equipe. Ligue para retomar a conversa.'),
  ('notif.ligar_sem_dono', '{cliente} · sem responsável', 'Lead novo parou no atendimento automático em {desde} e não tem responsável. Defina quem vai ligar.'),
  ('notif.decisao', '{cliente} · decisão de repasse', 'Com {atendente}, sem resposta desde {desde}. Escolha entre manter e repassar; nada muda sem a sua decisão.'),
  ('notif.cutucada', '{cliente} · pedido do gestor', '{gestor} pediu que você responda agora. Cliente sem resposta desde {desde}.'),
  ('notif.repasse_saiu', '{cliente} passou para {para}', 'Decisão de {gestor} após 1 dia útil sem resposta. Nenhuma ação sua é necessária.'),
  ('notif.repasse_recebeu', '{cliente} passou para você', 'Decisão de {gestor}. Estava com {de}, sem resposta desde {desde}. Responda com prioridade; o ciclo de avisos recomeça com você.'),
  ('notif.mantido', '{cliente} continua com você', '{gestor} manteve o atendimento com você após 1 dia útil sem resposta. Responda com prioridade; o ciclo de avisos recomeça agora.'),
  ('notif.resumo.negociacao', '{n} clientes em negociação sem resposta', 'Vários avisos chegaram juntos e foram agrupados. Clique para ver a lista em ordem de urgência.'),
  ('notif.resumo.fechado', '{n} clientes fechados sem resposta', 'Vários avisos chegaram juntos e foram agrupados. Clique para ver a lista em ordem de urgência.'),
  ('notif.resumo.ligar', '{n} leads novos para ligar', 'Pararam no atendimento automático e ainda não falaram com a equipe. Clique para ver a lista.'),
  ('nota.repasse', null, 'Radar de Atendimento: {gestor} repassou o cliente de {de} para {para} após 1 dia útil sem resposta.'),
  ('nota.mantido', null, 'Radar de Atendimento: {gestor} manteve o cliente com {atendente} após 1 dia útil sem resposta.'),
  ('nota.cutucada', null, 'Radar de Atendimento: {gestor} pediu a {atendente} resposta imediata. Cliente sem resposta desde {desde}.'),
  ('nota.ligou', null, 'Radar de Atendimento: {atendente} registrou ligação para o cliente, que tinha parado no atendimento automático.'),
  ('atividade.repasse', null, 'Radar de Atendimento: {gestor} repassou o cliente de {de} para {para} após 1 dia útil sem resposta.'),
  ('extra.erro.decisao_expirada', null, 'Esta decisão não está mais pendente. A lista foi atualizada.'),
  ('extra.erro.decisao_sem_permissao', null, 'Só o gestor pode decidir repasses.'),
  ('extra.erro.destino_inativo', null, 'O atendente escolhido não está ativo. Escolha outra pessoa.'),
  ('extra.erro.pedido_respondido', null, 'Este cliente já foi respondido. Não é preciso pedir resposta.'),
  ('extra.erro.pedido_sem_permissao', null, 'Só o gestor pode pedir resposta ao atendente.'),
  ('extra.erro.pedido_recente', null, 'Você pediu resposta há menos de 10 min. Aguarde antes de pedir de novo.'),
  ('extra.erro.pedido_sem_dono', null, 'Este cliente está sem atendente. Defina um responsável antes de pedir resposta.'),
  ('extra.erro.ligacao_sem_permissao', null, 'Só o responsável pelo cliente ou o gestor pode registrar a ligação.'),
  ('extra.erro.ligacao_falhou', null, 'Não foi possível registrar a ligação. Tente de novo.')
on conflict (chave) do update set titulo = excluded.titulo, texto = excluded.texto, atualizado_em = now();

-- ---------------------------------------------------------------------------
-- 3) MOTOR do Radar v5
--   - negociação ('vacuo_aviso') e cliente FECHADO ('vacuo_fechado') em categorias separadas
--   - textos do caderno (radar_txt); nada de emoji/gíria no código
--   - sino organizado: ao subir de aviso, o aviso anterior do mesmo cliente vira lido; quando
--     o cliente sai do Radar (respondido, arquivado…), os avisos dele no sino viram lidos
--   - cliente que muda de categoria no meio da espera (fechou / reabriu) troca de aviso sem
--     notificar de novo
--   - mantém: relógio útil seg–sex, escada 1 degrau por vez, dono-only, aba "Meus" + fechados
--     (fora só NE), fechado nunca vai pra decisão de repasse, cutucão, troca de dono
-- ---------------------------------------------------------------------------
create or replace function public.vacuo_avaliar(p_org uuid default null)
returns jsonb
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_avisos int := 0; v_decisoes int := 0; v_limpos int := 0; v_recat int := 0;
  r record; v_cat text; v_sev text; v_par jsonb; v_alerta jsonb; v_notif jsonb;
begin
  drop table if exists _vac;
  drop table if exists _notif;
  create temp table _notif (organizacao_id uuid, usuario_id uuid, tipo text, titulo text, corpo text,
                            rota text, ref_id uuid, alvo int, prio int, espera timestamptz) on commit drop;

  create temp table _vac on commit drop as
  select v.*,
         case when v.prioritario and not v.fechado then v.p_a1 else v.a1 end as th1,
         case when v.prioritario and not v.fechado then v.p_a2 else v.a2 end as th2,
         case when v.prioritario and not v.fechado then v.p_a3 else v.a3 end as th3,
         case when v.prioritario and not v.fechado then v.p_rep else v.rep end as th_dec
  from (
    select c.id as conversa_id, c.organizacao_id, c.contato_id,
           coalesce(ct.responsavel_id, c.atendente_id) as dono,
           ct.nome as contato_nome,
           um.ult_in,
           -- início REAL da espera (1ª mensagem pendente do cliente): o "desde" que a equipe lê
           pend.pri_in as espera_real,
           -- base = PRIMEIRA mensagem do cliente ainda sem resposta humana; com episódio
           -- aberto, PRESERVA a base (zera: resposta humana, decisão do gestor, troca de dono)
           coalesce(ve.base_em, greatest(pend.pri_in, cfg.ativo_desde)) as base_rel,
           ve.aviso as aviso_atual, ve.aviso_em as aviso_em_atual,
           cfg.hora_inicio as h_ini, cfg.hora_fim as h_fim,
           cfg.aviso1_min as a1, cfg.aviso2_min as a2, cfg.aviso3_min as a3, cfg.repasse_min as rep,
           cfg.prio_aviso1_min as p_a1, cfg.prio_aviso2_min as p_a2, cfg.prio_aviso3_min as p_a3, cfg.prio_repasse_min as p_rep,
           public.vacuo_minutos_uteis(
             coalesce(ve.base_em, greatest(pend.pri_in, cfg.ativo_desde)), now(),
             cfg.hora_inicio, cfg.hora_fim) as min_vacuo,
           (coalesce(ia.tem_docs, false) or coalesce(ia.ia_handoff, false)
            or coalesce(e.lead_quente, false) or e.etapa = 'concluido') as prioritario,
           case when coalesce(ia.tem_docs, false)   then 'documentação enviada'
                when coalesce(ia.ia_handoff, false) then 'IA qualificou e entregou'
                when coalesce(e.lead_quente, false) then 'lead quente (interesse confirmado)'
                when e.etapa = 'concluido'          then 'triagem do robô completa'
                else null end as prio_motivo,
           fe.fechado
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
    -- CLIENTE FECHADO (qualquer oportunidade ganha) = pós-venda: categoria própria, escada
    -- normal, NUNCA vai pra decisão de repasse (dono 29/10)
    left join lateral (
      select exists (select 1 from public.oportunidades ogf
                     where ogf.contato_id = c.contato_id and ogf.organizacao_id = c.organizacao_id
                       and ogf.status = 'ganho') as fechado
    ) fe on true
    -- espera começa na PRIMEIRA mensagem do cliente ainda sem resposta humana. Cliente fechado que só
    -- agradeceu/confirmou ("ok", "obrigado", "valeu", emoji) não está esperando nada — não conta
    left join lateral (
      select min(coalesce(m.recebida_em, m.criado_em)) as pri_in
      from public.mensagens m
      where m.conversa_id = c.id and m.direcao = 'entrada'
        and coalesce(m.recebida_em, m.criado_em) > coalesce(um.ult_humano, '-infinity'::timestamptz)
        and not (fe.fechado and public.radar_so_agradecimento(m.tipo::text, m.conteudo))
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
      -- 14 dias corridos: cobre fim de semana + decisão do gestor ainda pendente
      and c.ultima_entrada_em >= now() - interval '14 days'
      and um.ult_in is not null
      and um.ult_in >= cfg.ativo_desde
      and (um.ult_humano is null or um.ult_humano < um.ult_in)
      and pend.pri_in is not null
      and coalesce(e.etapa, '') <> 'inicio'
      and not coalesce(ia.ia_ativa, false)
      -- clientes da aba "Meus" + FECHADOS. Fora só PERDIDO/NE: nunca ganhou, sem oportunidade em
      -- andamento e a mais recente perdida (mesma regra do inbox: ganho é "grudento")
      and not (
        not exists (select 1 from public.oportunidades og
                    where og.contato_id = c.contato_id and og.organizacao_id = c.organizacao_id
                      and og.status = 'ganho')
        and not exists (select 1 from public.oportunidades oa
                    where oa.contato_id = c.contato_id and oa.organizacao_id = c.organizacao_id
                      and oa.status = 'em_andamento')
        and coalesce((select ol.status::text from public.oportunidades ol
                      where ol.contato_id = c.contato_id and ol.organizacao_id = c.organizacao_id
                      order by ol.atualizado_em desc limit 1), '') = 'perdido'
      )
  ) v;

  delete from _vac where dono is null;

  -- troca de dono no meio do episódio: o novo dono recebe relógio zerado
  drop table if exists _mud;
  create temp table _mud on commit drop as
  with mud as (
    update public.vacuo_estado ve
       set aviso = 0, aviso_em = null, decisao_pedida_em = null,
           usuario_id = v.dono, base_em = now(), atualizado_em = now()
      from _vac v
     where v.conversa_id = ve.conversa_id and ve.usuario_id is distinct from v.dono
    returning ve.conversa_id
  ) select conversa_id from mud;
  update _vac set aviso_atual = 0, base_rel = now(), min_vacuo = 0
   where conversa_id in (select conversa_id from _mud);

  -- quem saiu do Radar (respondido, arquivado, virou NE…) perde estado — e os avisos dele no sino
  -- viram lidos (o sino não acumula cliente que já foi atendido)
  drop table if exists _sai;
  create temp table _sai on commit drop as
  with del as (
    delete from public.vacuo_estado ve
    where (p_org is null or ve.organizacao_id = p_org)
      and not exists (select 1 from _vac v where v.conversa_id = ve.conversa_id)
    returning ve.conversa_id
  ) select conversa_id from del;
  get diagnostics v_limpos = row_count;

  -- categoria do estado acompanha a do cliente; fechado nunca fica com decisão de repasse pendente
  update public.vacuo_estado ve
     set fechado = v.fechado,
         decisao_pedida_em = case when v.fechado then null else ve.decisao_pedida_em end,
         atualizado_em = now()
    from _vac v
   where v.conversa_id = ve.conversa_id
     and (ve.fechado is distinct from v.fechado or (v.fechado and ve.decisao_pedida_em is not null));

  -- o "desde" que a equipe lê acompanha a 1ª mensagem pendente (não zera com decisão nem troca de dono)
  update public.vacuo_estado ve
     set espera_desde = v.espera_real
    from _vac v
   where v.conversa_id = ve.conversa_id and ve.espera_desde is distinct from v.espera_real;

  -- SINO QUE SE ARRUMA SOZINHO: aviso de cliente que não está mais em espera com aquele dono
  -- (respondido, arquivado, repassado, decisão tomada…) vira lido; pedido de decisão que não está
  -- mais pendente também. Só toca nos não lidos (índice parcial idx_notif_nao_lidas).
  update public.notificacoes n set lida_em = now()
   where n.lida_em is null and n.tipo in ('vacuo_aviso', 'vacuo_fechado')
     and (p_org is null or n.organizacao_id = p_org)
     and not exists (select 1 from public.vacuo_estado ve
                     where ve.conversa_id = n.ref_id and ve.usuario_id = n.usuario_id and ve.aviso >= 1);
  -- pedido do gestor: lido quando o PEDIDO (alerta) daquele dono se encerra — não pelo estado do cliente
  update public.notificacoes n set lida_em = now()
   where n.lida_em is null and n.tipo = 'vacuo_cutucada'
     and (p_org is null or n.organizacao_id = p_org)
     and not exists (select 1 from public.sla_alertas a
                     where a.tipo = 'vacuo_cutucada' and a.conversa_id = n.ref_id
                       and a.responsavel_id = n.usuario_id and a.resolvido_em is null);
  update public.notificacoes n set lida_em = now()
   where n.lida_em is null and n.tipo = 'vacuo_decisao'
     and (p_org is null or n.organizacao_id = p_org)
     and not exists (select 1 from public.vacuo_estado ve
                     where ve.conversa_id = n.ref_id and ve.decisao_pedida_em is not null);
  -- resumo ("N clientes aguardando") sai do sino quando a pessoa não tem mais ninguém naquela categoria
  update public.notificacoes n set lida_em = now()
   where n.lida_em is null and n.tipo = 'vacuo_resumo'
     and (p_org is null or n.organizacao_id = p_org)
     and not exists (select 1 from public.vacuo_estado ve
                     where ve.usuario_id = n.usuario_id and ve.aviso >= 1
                       and ve.fechado = (coalesce(n.rota, '') like '%radar=fechados%'));

  -- aviso que perdeu a razão (cliente respondido, saiu do Radar, relógio zerado por troca de dono) some;
  -- quem já tem degrau fica — inclusive o prioritário que fechou (o 1º degrau do fechado é mais tarde)
  update public.sla_alertas a
     set resolvido_em = now(), resolucao = 'auto', atualizado_em = now()
   where a.tipo in ('vacuo_aviso', 'vacuo_fechado') and a.resolvido_em is null
     and (p_org is null or a.organizacao_id = p_org)
     and not exists (select 1 from _vac v
                     where v.conversa_id = a.conversa_id
                       and (v.min_vacuo >= v.th1 or coalesce(v.aviso_atual, 0) >= 1));

  -- cliente que mudou de categoria no meio da espera (fechou / reabriu): troca o aviso de lugar,
  -- mesmo degrau, SEM notificar de novo
  -- é o MESMO alerta (id, criado_em e silenciamento preservados): a tela cheia já vista não volta
  drop table if exists _recat;
  create temp table _recat on commit drop as
  with m as (
    update public.sla_alertas a
       set tipo = case when v.fechado then 'vacuo_fechado' else 'vacuo_aviso' end,
           dedup_key = case when v.fechado then 'vacuo_fechado:' else 'vacuo_aviso:' end || a.conversa_id,
           titulo = coalesce(t.j->>'titulo', a.titulo),
           detalhe = t.j->>'texto',
           atualizado_em = now()
      from _vac v
      join public.vacuo_estado ve on ve.conversa_id = v.conversa_id
      cross join lateral (select public.radar_txt(
          'alerta.' || case when v.fechado then 'fechado' else 'negociacao' end || '.' || least(greatest(ve.aviso, 1), 3),
          jsonb_build_object('cliente', public.radar_nome_curto(v.contato_nome),
                             'tempo', public.radar_fmt_tempo(v.min_vacuo, (v.h_fim - v.h_ini) * 60),
                             'desde', public.radar_fmt_desde(v.espera_real),
                             'aviso', least(greatest(ve.aviso, 1), 3),
                             'prioridade', public.radar_prioridade(v.prioritario and not v.fechado, v.prio_motivo))) as j) t
     where v.conversa_id = a.conversa_id
       and a.tipo in ('vacuo_aviso', 'vacuo_fechado') and a.resolvido_em is null
       and a.tipo <> case when v.fechado then 'vacuo_fechado' else 'vacuo_aviso' end
       and not exists (select 1 from public.sla_alertas b
                       where b.organizacao_id = a.organizacao_id and b.resolvido_em is null and b.id <> a.id
                         and b.dedup_key = case when v.fechado then 'vacuo_fechado:' else 'vacuo_aviso:' end || a.conversa_id)
    returning a.conversa_id
  ) select conversa_id from m;
  get diagnostics v_recat = row_count;

  update public.notificacoes n set lida_em = now()
   where n.lida_em is null and n.ref_id in (select conversa_id from _recat)
     and n.tipo in ('vacuo_aviso', 'vacuo_fechado');

  -- pedido do gestor some quando o cliente sai do Radar (arquivou, virou NE, respondido por telefone…)
  -- ou muda de dono (o pedido era para a pessoa anterior)
  update public.sla_alertas a set resolvido_em = now(), resolucao = 'auto', atualizado_em = now()
   where a.tipo = 'vacuo_cutucada' and a.resolvido_em is null and (p_org is null or a.organizacao_id = p_org)
     and not exists (select 1 from _vac v where v.conversa_id = a.conversa_id and v.dono = a.responsavel_id);

  -- FORA DO HORÁRIO ÚTIL (seg–sex, hora_inicio–hora_fim, SP) não dispara nada novo — só limpa (26/10)
  if not public.vacuo_horario_aberto(p_org) then
    return jsonb_build_object('avisos', 0, 'decisoes_pedidas', 0, 'estados_limpos', v_limpos,
                              'recategorizados', v_recat, 'fora_do_horario', true);
  end if;

  -- Avisos 1→3 pro DONO (cada estágio dispara uma vez)
  for r in
    -- ESCADA COMPLETA (26/10): sobe UM degrau por vez e cada degrau espera o intervalo útil
    -- desde o aviso anterior — cliente que já esperava há muito tempo recebe 1º, 2º e 3º com o
    -- espaçamento normal, nunca o "último aviso" de cara
    select *, case coalesce(aviso_atual, 0)
                when 0 then case when min_vacuo >= th1 then 1 else 0 end
                when 1 then case when min_vacuo >= th2
                                  and public.vacuo_minutos_uteis(aviso_em_atual, now(), h_ini, h_fim) >= th2 - th1 then 2 else 1 end
                when 2 then case when min_vacuo >= th3
                                  and public.vacuo_minutos_uteis(aviso_em_atual, now(), h_ini, h_fim) >= th3 - th2 then 3 else 2 end
                else coalesce(aviso_atual, 0) end as alvo
    from _vac
  loop
    if r.alvo = 0 or coalesce(r.aviso_atual, 0) >= r.alvo then
      continue;
    end if;
    begin
      v_cat := case when r.fechado then 'fechado' else 'negociacao' end;
      v_sev := case r.alvo when 1 then 'amarelo' when 2 then 'vermelho' else 'critico' end;
      v_par := jsonb_build_object(
        'cliente', public.radar_nome_curto(r.contato_nome),
        'tempo', public.radar_fmt_tempo(r.min_vacuo, (r.h_fim - r.h_ini) * 60),
        'desde', public.radar_fmt_desde(r.espera_real),
        'atendente', coalesce((select u.nome from public.usuarios u where u.id = r.dono), ''),
        'aviso', r.alvo,
        'prioridade', public.radar_prioridade(r.prioritario and not r.fechado, r.prio_motivo));
      v_alerta := public.radar_txt('alerta.' || v_cat || '.' || r.alvo, v_par);
      v_notif  := public.radar_txt('notif.'  || v_cat || '.' || r.alvo, v_par);

      insert into public.vacuo_estado (conversa_id, organizacao_id, contato_id, usuario_id, base_em, ult_in_em,
                                       aviso, aviso_em, prioritario, prio_motivo, minutos_vacuo, fechado,
                                       espera_desde, atualizado_em)
      values (r.conversa_id, r.organizacao_id, r.contato_id, r.dono, r.base_rel, r.ult_in,
              r.alvo, now(), r.prioritario, r.prio_motivo, r.min_vacuo, r.fechado, r.espera_real, now())
      on conflict (conversa_id) do update
        set aviso = excluded.aviso, aviso_em = now(), usuario_id = excluded.usuario_id,
            base_em = excluded.base_em, ult_in_em = excluded.ult_in_em,
            prioritario = excluded.prioritario, prio_motivo = excluded.prio_motivo,
            minutos_vacuo = excluded.minutos_vacuo, fechado = excluded.fechado,
            espera_desde = excluded.espera_desde, atualizado_em = now();

      insert into public.sla_alertas
        (organizacao_id, tipo, severidade, conversa_id, contato_id, responsavel_id, titulo, detalhe, dedup_key)
      values
        (r.organizacao_id, case when r.fechado then 'vacuo_fechado' else 'vacuo_aviso' end, v_sev,
         r.conversa_id, r.contato_id, r.dono, coalesce(v_alerta->>'titulo', 'Cliente aguardando resposta'), v_alerta->>'texto',
         case when r.fechado then 'vacuo_fechado:' else 'vacuo_aviso:' end || r.conversa_id)
      on conflict (organizacao_id, dedup_key) where resolvido_em is null do update
        set severidade = excluded.severidade, titulo = excluded.titulo,
            detalhe = excluded.detalhe, responsavel_id = excluded.responsavel_id, atualizado_em = now()
        where (sla_alertas.severidade, sla_alertas.titulo, sla_alertas.detalhe, sla_alertas.responsavel_id)
              is distinct from (excluded.severidade, excluded.titulo, excluded.detalhe, excluded.responsavel_id);

      -- sino: um aviso por cliente — o degrau anterior desse cliente vira lido
      update public.notificacoes n set lida_em = now()
       where n.lida_em is null and n.ref_id = r.conversa_id and n.usuario_id = r.dono
         and n.tipo in ('vacuo_aviso', 'vacuo_fechado');

      insert into _notif (organizacao_id, usuario_id, tipo, titulo, corpo, rota, ref_id, alvo, prio, espera)
      values (r.organizacao_id, r.dono, case when r.fechado then 'vacuo_fechado' else 'vacuo_aviso' end,
              coalesce(v_notif->>'titulo', 'Cliente aguardando resposta'), v_notif->>'texto',
              '/whatsapp?conversa=' || r.conversa_id, r.conversa_id,
              r.alvo,
              case when r.prioritario and not r.fechado
                   then case when r.prio_motivo = 'documentação enviada' then 2 else 1 end else 0 end,
              r.espera_real);

      v_avisos := v_avisos + 1;
    exception when others then
      raise warning 'vacuo_avaliar: aviso falhou na conversa % — %', r.conversa_id, sqlerrm;
    end;
  end loop;

  -- SINO SEM ENXURRADA: por pessoa e categoria, entram os 3 MAIS URGENTES um a um (degrau, prioridade,
  -- espera mais longa); passou de 3 (segunda de manhã, a primeira rodada dos fechados…), entra também UM
  -- resumo com o total, que abre a Central na aba certa
  insert into public.notificacoes (organizacao_id, usuario_id, tipo, titulo, corpo, rota, ref_id)
  select x.organizacao_id, x.usuario_id, x.tipo, x.titulo, x.corpo, x.rota, x.ref_id
    from (select y.*, row_number() over (partition by y.usuario_id, y.tipo
                                         order by y.alvo desc, y.prio desc, y.espera asc) as rn
            from _notif y) x
   where x.rn <= 3;

  -- um resumo por pessoa e categoria: o novo substitui o anterior (contagem velha não fica no sino)
  update public.notificacoes n set lida_em = now()
    from (select organizacao_id, usuario_id, tipo from _notif group by organizacao_id, usuario_id, tipo having count(*) > 3) g
   where n.lida_em is null and n.tipo = 'vacuo_resumo'
     and n.organizacao_id = g.organizacao_id and n.usuario_id = g.usuario_id
     and n.rota = '/whatsapp?radar=' || case when g.tipo = 'vacuo_fechado' then 'fechados' else 'negociacao' end;

  insert into public.notificacoes (organizacao_id, usuario_id, tipo, titulo, corpo, rota, ref_id)
  select g.organizacao_id, g.usuario_id, 'vacuo_resumo',
         coalesce(t.j->>'titulo', g.n || ' clientes aguardando resposta'), t.j->>'texto',
         '/whatsapp?radar=' || case when g.tipo = 'vacuo_fechado' then 'fechados' else 'negociacao' end, null
    from (select organizacao_id, usuario_id, tipo, count(*)::int as n
            from _notif group by organizacao_id, usuario_id, tipo having count(*) > 3) g
    cross join lateral (select public.radar_txt(
        case when g.tipo = 'vacuo_fechado' then 'notif.resumo.fechado' else 'notif.resumo.negociacao' end,
        jsonb_build_object('n', g.n)) as j) t;

  -- 1 dia útil sem resposta → pede a DECISÃO do gestor (uma vez por episódio). Não transfere.
  for r in
    select v.*
    from _vac v
    join public.vacuo_estado ve on ve.conversa_id = v.conversa_id
    where ve.aviso >= 3 and ve.decisao_pedida_em is null
      and v.min_vacuo >= v.th_dec
      and not v.fechado   -- cliente fechado: só avisos, nunca decisão de repasse (dono 29/10)
      and public.vacuo_minutos_uteis(ve.aviso_em, now(), v.h_ini, v.h_fim) >= greatest(v.th_dec - v.th3, 5)
  loop
    begin
      update public.vacuo_estado
         set decisao_pedida_em = now(), minutos_vacuo = r.min_vacuo,
             prioritario = r.prioritario, prio_motivo = r.prio_motivo, atualizado_em = now()
       where conversa_id = r.conversa_id;

      v_notif := public.radar_txt('notif.decisao', jsonb_build_object(
        'cliente', public.radar_nome_curto(r.contato_nome),
        'atendente', coalesce((select u.nome from public.usuarios u where u.id = r.dono), 'o atendente'),
        'tempo', public.radar_fmt_tempo(r.min_vacuo, (r.h_fim - r.h_ini) * 60),
        'desde', public.radar_fmt_desde(r.espera_real),
        'prioridade', public.radar_prioridade(r.prioritario, r.prio_motivo)));

      insert into public.notificacoes (organizacao_id, usuario_id, tipo, titulo, corpo, rota, ref_id)
      select r.organizacao_id, ou.usuario_id, 'vacuo_decisao',
             coalesce(v_notif->>'titulo', 'Decisão de repasse pendente'), v_notif->>'texto',
             '/radar', r.conversa_id
      from public.organizacao_usuarios ou
      where ou.organizacao_id = r.organizacao_id and ou.papel = 'admin' and ou.status = 'ativo';

      v_decisoes := v_decisoes + 1;
    exception when others then
      raise warning 'vacuo_avaliar: pedido de decisão falhou na conversa % — %', r.conversa_id, sqlerrm;
    end;
  end loop;

  return jsonb_build_object('avisos', v_avisos, 'decisoes_pedidas', v_decisoes, 'estados_limpos', v_limpos,
                            'recategorizados', v_recat);
end $function$;
revoke all on function public.vacuo_avaliar(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4) Ações do gestor e do atendente com os textos do caderno
-- ---------------------------------------------------------------------------

-- nota interna = título e texto do caderno numa linha só
create or replace function public.radar_nota(p_chave text, p jsonb default '{}'::jsonb)
returns text
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select case when t->>'titulo' is not null and t->>'texto' is not null then (t->>'titulo') || ' — ' || (t->>'texto')
              else coalesce(t->>'texto', t->>'titulo') end
  from (select public.radar_txt(p_chave, p) as t) x
$$;
revoke all on function public.radar_nota(text, jsonb) from public, anon, authenticated;

-- "👉 Cutucar": o gestor pede ao dono que responda agora (aviso de tela cheia + sino + nota)
create or replace function public.vacuo_cutucar(p_conversa uuid)
returns jsonb
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  ve public.vacuo_estado%rowtype;
  v_dono uuid; v_contato uuid; v_cli text; v_nome_dono text; v_nome_gestor text;
  v_h_ini int; v_h_fim int; v_par jsonb; v_alerta jsonb; v_notif jsonb;
begin
  select * into ve from public.vacuo_estado where conversa_id = p_conversa for update;
  if not found then
    raise exception '%', coalesce(public.radar_txt('extra.erro.pedido_respondido')->>'texto', 'Este cliente já foi respondido. Não é preciso pedir resposta.');
  end if;
  if not public.vacuo_eh_gestor(ve.organizacao_id) then
    raise exception '%', coalesce(public.radar_txt('extra.erro.pedido_sem_permissao')->>'texto', 'Só o gestor pode pedir resposta ao atendente.');
  end if;
  if ve.cutucado_em is not null and ve.cutucado_em > now() - interval '10 minutes' then
    raise exception '%', coalesce(public.radar_txt('extra.erro.pedido_recente')->>'texto', 'Você pediu resposta há menos de 10 min. Aguarde antes de pedir de novo.');
  end if;

  select coalesce(ct.responsavel_id, c.atendente_id), c.contato_id, ct.nome
    into v_dono, v_contato, v_cli
  from public.conversas c left join public.contatos ct on ct.id = c.contato_id
  where c.id = p_conversa;
  if v_dono is null then
    raise exception '%', coalesce(public.radar_txt('extra.erro.pedido_sem_dono')->>'texto', 'Este cliente está sem atendente. Defina um responsável antes de pedir resposta.');
  end if;
  select nome into v_nome_dono from public.usuarios where id = v_dono;
  select nome into v_nome_gestor from public.usuarios where id = auth.uid();
  select hora_inicio, hora_fim into v_h_ini, v_h_fim from public.vacuo_config where organizacao_id = ve.organizacao_id;
  v_h_ini := coalesce(v_h_ini, 9); v_h_fim := coalesce(v_h_fim, 18);

  v_par := jsonb_build_object(
    'cliente', public.radar_nome_curto(v_cli),
    'atendente', coalesce(v_nome_dono, 'o atendente'),
    'gestor', coalesce(v_nome_gestor, 'O gestor'),
    'desde', public.radar_fmt_desde(coalesce(ve.espera_desde, ve.base_em)),
    'tempo', public.radar_fmt_tempo(public.vacuo_minutos_uteis(coalesce(ve.espera_desde, ve.base_em), now(), v_h_ini, v_h_fim),
                                    (v_h_fim - v_h_ini) * 60),
    'prioridade', public.radar_prioridade(ve.prioritario and not ve.fechado, ve.prio_motivo),
    'n', ve.cutucadas + 1);
  v_alerta := public.radar_txt('alerta.cutucada', v_par);
  v_notif  := public.radar_txt('notif.cutucada', v_par);

  update public.vacuo_estado
     set cutucado_em = now(), cutucadas = cutucadas + 1, cutucado_por = auth.uid(), atualizado_em = now()
   where conversa_id = p_conversa;

  -- recutucar: encerra o anterior e cria um novo (volta pra tela mesmo se foi dispensado)
  update public.sla_alertas
     set resolvido_em = now(), resolucao = 'recutucada', resolvido_por = auth.uid(), atualizado_em = now()
   where tipo = 'vacuo_cutucada' and conversa_id = p_conversa and resolvido_em is null;
  update public.notificacoes set lida_em = now()
   where tipo = 'vacuo_cutucada' and ref_id = p_conversa and lida_em is null;

  insert into public.sla_alertas
    (organizacao_id, tipo, severidade, conversa_id, contato_id, responsavel_id, titulo, detalhe, dedup_key)
  values
    (ve.organizacao_id, 'vacuo_cutucada', 'imediato', p_conversa, v_contato, v_dono,
     coalesce(v_alerta->>'titulo', 'O gestor pediu uma resposta agora'), v_alerta->>'texto',
     'vacuo_cutucada:' || p_conversa);

  insert into public.notificacoes (organizacao_id, usuario_id, tipo, titulo, corpo, rota, ref_id)
  values (ve.organizacao_id, v_dono, 'vacuo_cutucada',
          coalesce(v_notif->>'titulo', 'O gestor pediu uma resposta agora'), v_notif->>'texto',
          '/whatsapp?conversa=' || p_conversa, p_conversa);

  insert into public.mensagens (organizacao_id, conversa_id, direcao, tipo, origem, status, conteudo, enviada_em)
  values (ve.organizacao_id, p_conversa, 'saida', 'nota_interna', 'bot', 'enviada',
          coalesce(public.radar_nota('nota.cutucada', v_par), 'O gestor pediu uma resposta para este cliente.'), now());

  return jsonb_build_object('ok', true, 'atendente', v_nome_dono, 'cutucadas', ve.cutucadas + 1);
end $function$;
revoke all on function public.vacuo_cutucar(uuid) from public, anon;
grant execute on function public.vacuo_cutucar(uuid) to authenticated;

-- decisão do gestor (1 dia útil sem resposta): repassa pra quem ele escolher ou mantém
create or replace function public.vacuo_decidir(p_conversa uuid, p_destino uuid)
returns jsonb
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  ve public.vacuo_estado%rowtype;
  v_dono uuid; v_contato uuid; v_nome_cli text; v_nome_de text; v_nome_para text; v_nome_gestor text; v_opp uuid;
  v_decisao text; v_h_ini int; v_h_fim int; v_par jsonb; v_n1 jsonb; v_n2 jsonb;
begin
  select * into ve from public.vacuo_estado where conversa_id = p_conversa for update;
  if not found or ve.decisao_pedida_em is null then
    raise exception '%', coalesce(public.radar_txt('extra.erro.decisao_expirada')->>'texto', 'Esta decisão não está mais pendente. A lista foi atualizada.');
  end if;
  if not public.vacuo_eh_gestor(ve.organizacao_id) then
    raise exception '%', coalesce(public.radar_txt('extra.erro.decisao_sem_permissao')->>'texto', 'Só o gestor pode decidir repasses.');
  end if;
  -- cliente FECHADO nunca entra em repasse (dono 29/10) — vale também no minuto antes de o motor cancelar
  if ve.fechado or exists (select 1 from public.conversas c join public.oportunidades o
                             on o.contato_id = c.contato_id and o.organizacao_id = c.organizacao_id
                           where c.id = p_conversa and o.status = 'ganho') then
    raise exception '%', coalesce(public.radar_txt('extra.erro.decisao_expirada')->>'texto', 'Esta decisão não está mais pendente. A lista foi atualizada.');
  end if;

  select coalesce(ct.responsavel_id, c.atendente_id), c.contato_id, ct.nome
    into v_dono, v_contato, v_nome_cli
  from public.conversas c left join public.contatos ct on ct.id = c.contato_id
  where c.id = p_conversa;
  select nome into v_nome_de from public.usuarios where id = v_dono;
  select nome into v_nome_gestor from public.usuarios where id = auth.uid();
  select hora_inicio, hora_fim into v_h_ini, v_h_fim from public.vacuo_config where organizacao_id = ve.organizacao_id;
  v_h_ini := coalesce(v_h_ini, 9); v_h_fim := coalesce(v_h_fim, 18);

  v_decisao := case when p_destino is null or p_destino = v_dono then 'mantido' else 'repassado' end;

  if v_decisao = 'repassado' then
    if not exists (select 1 from public.organizacao_usuarios ou
                   where ou.organizacao_id = ve.organizacao_id and ou.usuario_id = p_destino and ou.status = 'ativo') then
      raise exception '%', coalesce(public.radar_txt('extra.erro.destino_inativo')->>'texto', 'O atendente escolhido não está ativo. Escolha outra pessoa.');
    end if;
    select nome into v_nome_para from public.usuarios where id = p_destino;
  end if;

  v_par := jsonb_build_object(
    'cliente', public.radar_nome_curto(v_nome_cli),
    'de', coalesce(v_nome_de, 'o atendente anterior'),
    'para', coalesce(v_nome_para, v_nome_de, 'o atendente'),
    'atendente', coalesce(v_nome_de, 'o atendente'),
    'gestor', coalesce(v_nome_gestor, 'O gestor'),
    'desde', public.radar_fmt_desde(coalesce(ve.espera_desde, ve.base_em)),
    'tempo', public.radar_fmt_tempo(coalesce(ve.minutos_vacuo,
               public.vacuo_minutos_uteis(ve.base_em, now(), v_h_ini, v_h_fim)), (v_h_fim - v_h_ini) * 60),
    'prioridade', public.radar_prioridade(ve.prioritario, ve.prio_motivo));

  if v_decisao = 'repassado' then
    select o.id into v_opp from public.oportunidades o
     where o.contato_id = v_contato and o.organizacao_id = ve.organizacao_id and o.status = 'em_andamento'
     order by o.entrada_em desc limit 1;

    insert into public.vacuo_repasses
      (organizacao_id, conversa_id, contato_id, oportunidade_id, de_usuario_id, para_usuario_id,
       avisos, minutos_vacuo, prioritario, prio_motivo, decisao, decidido_por)
    values (ve.organizacao_id, p_conversa, v_contato, v_opp, v_dono, p_destino,
            3, ve.minutos_vacuo, ve.prioritario, ve.prio_motivo, 'repassado', auth.uid());

    update public.contatos set responsavel_id = p_destino where id = v_contato;
    update public.conversas set atendente_id = p_destino where id = p_conversa and atendente_id is distinct from p_destino;

    insert into public.conversa_atividades (organizacao_id, conversa_id, usuario_id, tipo, de, para, motivo)
    values (ve.organizacao_id, p_conversa, auth.uid(), 'transferido',
            jsonb_build_object('responsavel_id', v_dono), jsonb_build_object('responsavel_id', p_destino),
            coalesce(public.radar_nota('atividade.repasse', v_par),
                     'Radar de Atendimento: repasse decidido pelo gestor.'));

    insert into public.mensagens (organizacao_id, conversa_id, direcao, tipo, origem, status, conteudo, enviada_em)
    values (ve.organizacao_id, p_conversa, 'saida', 'nota_interna', 'bot', 'enviada',
            coalesce(public.radar_nota('nota.repasse', v_par), 'Cliente repassado pelo gestor.'), now());

    v_n1 := public.radar_txt('notif.repasse_saiu', v_par);
    v_n2 := public.radar_txt('notif.repasse_recebeu', v_par);
    insert into public.notificacoes (organizacao_id, usuario_id, tipo, titulo, corpo, rota, ref_id) values
      (ve.organizacao_id, v_dono, 'vacuo_punicao',
       coalesce(v_n1->>'titulo', 'Cliente repassado pelo gestor'), v_n1->>'texto',
       null, p_conversa),  -- sem rota: a conversa passou a ser de outra pessoa
      (ve.organizacao_id, p_destino, 'vacuo_recebido',
       coalesce(v_n2->>'titulo', 'Novo cliente repassado para você'), v_n2->>'texto',
       '/whatsapp?conversa=' || p_conversa, p_conversa);
  else
    insert into public.vacuo_repasses
      (organizacao_id, conversa_id, contato_id, de_usuario_id, para_usuario_id,
       avisos, minutos_vacuo, prioritario, prio_motivo, decisao, decidido_por)
    values (ve.organizacao_id, p_conversa, v_contato, v_dono, v_dono,
            3, ve.minutos_vacuo, ve.prioritario, ve.prio_motivo, 'mantido', auth.uid());

    insert into public.mensagens (organizacao_id, conversa_id, direcao, tipo, origem, status, conteudo, enviada_em)
    values (ve.organizacao_id, p_conversa, 'saida', 'nota_interna', 'bot', 'enviada',
            coalesce(public.radar_nota('nota.mantido', v_par), 'O gestor manteve o cliente com o atendente atual.'), now());

    v_n1 := public.radar_txt('notif.mantido', v_par);
    insert into public.notificacoes (organizacao_id, usuario_id, tipo, titulo, corpo, rota, ref_id)
    values (ve.organizacao_id, v_dono, 'vacuo_mantido',
            coalesce(v_n1->>'titulo', 'O cliente continua com você'), v_n1->>'texto',
            '/whatsapp?conversa=' || p_conversa, p_conversa);
  end if;

  -- novo ciclo completo pro dono (atual ou novo)
  update public.vacuo_estado
     set aviso = 0, aviso_em = null, decisao_pedida_em = null,
         usuario_id = coalesce(case when v_decisao = 'repassado' then p_destino end, v_dono),
         base_em = now(), atualizado_em = now()
   where conversa_id = p_conversa;

  update public.sla_alertas
     set resolvido_em = now(), resolucao = v_decisao, resolvido_por = auth.uid(), atualizado_em = now()
   where tipo in ('vacuo_aviso', 'vacuo_fechado', 'vacuo_cutucada') and conversa_id = p_conversa and resolvido_em is null;

  -- sino: a decisão encerra o pedido (pra todos os gestores) e os avisos do episódio que acabou
  update public.notificacoes set lida_em = now()
   where ref_id = p_conversa and lida_em is null
     and tipo in ('vacuo_decisao', 'vacuo_aviso', 'vacuo_fechado', 'vacuo_cutucada');

  return jsonb_build_object('decisao', v_decisao, 'para', coalesce(v_nome_para, v_nome_de));
end $function$;
revoke all on function public.vacuo_decidir(uuid, uuid) from public, anon;
grant execute on function public.vacuo_decidir(uuid, uuid) to authenticated;

-- "Ligar": lead novo parou de responder o ROBÔ por 2 h úteis → o dono liga
create or replace function public.robo_ligar_avaliar(p_org uuid default null)
returns jsonb
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v_avisos int := 0; v_resolvidos int := 0; r record; v_par jsonb; v_alerta jsonb; v_notif jsonb;
begin
  drop table if exists _rl;
  drop table if exists _notif_rl;
  create temp table _notif_rl (organizacao_id uuid, usuario_id uuid, tipo text, titulo text, corpo text, rota text, ref_id uuid,
                               min_parado int) on commit drop;
  create temp table _rl on commit drop as
  select c.id as conversa_id, c.organizacao_id, c.contato_id,
         coalesce(ct.responsavel_id, c.atendente_id) as dono, ct.nome as contato_nome,
         lm.quando as ult_bot_em, coalesce(um.ult_in, '-infinity'::timestamptz) as ult_in,
         public.vacuo_minutos_uteis(lm.quando, now(), cfg.hora_inicio, cfg.hora_fim) as min_parado,
         cfg.robo_ligar_min as th, cfg.hora_inicio as h_ini, cfg.hora_fim as h_fim
  from public.conversas c
  join public.vacuo_config cfg on cfg.organizacao_id = c.organizacao_id and cfg.robo_ligar_desde is not null
  left join public.contatos ct on ct.id = c.contato_id
  join lateral (
    select m.direcao, m.autor_id, m.origem, coalesce(m.enviada_em, m.recebida_em, m.criado_em) as quando
    from public.mensagens m
    where m.conversa_id = c.id and m.tipo not in ('nota_interna', 'sistema')
    order by coalesce(m.enviada_em, m.recebida_em, m.criado_em) desc
    limit 1
  ) lm on true
  left join lateral (
    select max(coalesce(m.recebida_em, m.criado_em)) as ult_in
    from public.mensagens m where m.conversa_id = c.id and m.direcao = 'entrada'
  ) um on true
  where c.arquivada_em is null
    and c.status in ('aberta', 'em_atendimento', 'pendente')
    and (p_org is null or c.organizacao_id = p_org)
    and c.ultima_interacao_em >= now() - interval '10 days'
    and lm.direcao = 'saida' and lm.autor_id is null and lm.origem = 'bot'
    and lm.quando >= cfg.robo_ligar_desde
    and not exists (select 1 from public.mensagens h
                    where h.conversa_id = c.id and h.direcao = 'saida'
                      and ((h.autor_id is not null and h.tipo not in ('sistema', 'nota_interna'))
                           or (h.autor_id is null and h.origem = 'telefone')))
    and not exists (select 1 from public.relacionamento_bloqueio b where b.contato_id = c.contato_id)
    -- SÓ CLIENTE NOVO (dono 23/10): tem oportunidade em andamento e NUNCA teve
    -- oportunidade fechada, perdida, cancelada ou não elegível
    and exists (select 1 from public.oportunidades o
                where o.contato_id = c.contato_id and o.organizacao_id = c.organizacao_id
                  and o.status = 'em_andamento')
    and not exists (select 1 from public.oportunidades o
                    where o.contato_id = c.contato_id and o.organizacao_id = c.organizacao_id
                      and (o.status <> 'em_andamento' or o.motivo_nao_elegivel is not null));

  -- saiu da condição (cliente respondeu, humano falou, virou NE, arquivou…) → aviso some
  update public.sla_alertas a
     set resolvido_em = now(), resolucao = 'auto', atualizado_em = now()
   where a.tipo = 'robo_ligar' and a.resolvido_em is null
     and (p_org is null or a.organizacao_id = p_org)
     and not exists (select 1 from _rl v where v.conversa_id = a.conversa_id);
  get diagnostics v_resolvidos = row_count;

  -- ...e o sino também: pedido de ligação sem motivo (já ligou, respondeu, etc.) vira lido
  update public.notificacoes n set lida_em = now()
   where n.lida_em is null and n.tipo in ('robo_ligar', 'robo_ligar_sem_dono')
     and (p_org is null or n.organizacao_id = p_org)
     and (not exists (select 1 from _rl v where v.conversa_id = n.ref_id)
          or not exists (select 1 from public.sla_alertas a
                         where a.tipo = 'robo_ligar' and a.conversa_id = n.ref_id and a.resolvido_em is null));
  update public.notificacoes n set lida_em = now()
   where n.lida_em is null and n.tipo = 'robo_ligar_resumo'
     and (p_org is null or n.organizacao_id = p_org)
     and not exists (select 1 from public.sla_alertas a
                     where a.tipo = 'robo_ligar' and a.resolvido_em is null and a.organizacao_id = n.organizacao_id
                       and (a.responsavel_id = n.usuario_id or a.responsavel_id is null));

  -- fora do horário útil (seg–sex, hora_inicio–hora_fim SP) não avisa ninguém — só limpa (26/10)
  if not public.vacuo_horario_aberto(p_org) then
    return jsonb_build_object('avisos', 0, 'resolvidos', v_resolvidos, 'fora_do_horario', true);
  end if;

  for r in
    select v.* from _rl v
    left join public.robo_ligar rl on rl.conversa_id = v.conversa_id
    where v.min_parado >= v.th
      -- novo silêncio: nunca avisado, ou o cliente falou de novo depois do último aviso
      and (rl.conversa_id is null or v.ult_in > rl.ult_in_ref)
  loop
    begin
      v_par := jsonb_build_object(
        'cliente', public.radar_nome_curto(r.contato_nome),
        'atendente', coalesce((select u.nome from public.usuarios u where u.id = r.dono), ''),
        'tempo', public.radar_fmt_tempo(r.min_parado, (r.h_fim - r.h_ini) * 60),
        'desde', public.radar_fmt_desde(r.ult_bot_em));
      v_alerta := public.radar_txt('alerta.ligar', v_par);

      insert into public.robo_ligar (conversa_id, organizacao_id, contato_id, usuario_id, ult_bot_em, ult_in_ref, notificado_em)
      values (r.conversa_id, r.organizacao_id, r.contato_id, r.dono, r.ult_bot_em, r.ult_in, now())
      on conflict (conversa_id) do update
        set usuario_id = excluded.usuario_id, ult_bot_em = excluded.ult_bot_em, ult_in_ref = excluded.ult_in_ref,
            notificado_em = now(), concluido_em = null, concluido_por = null;

      insert into public.sla_alertas
        (organizacao_id, tipo, severidade, conversa_id, contato_id, responsavel_id, titulo, detalhe, dedup_key)
      values
        (r.organizacao_id, 'robo_ligar', 'vermelho', r.conversa_id, r.contato_id, r.dono,
         coalesce(v_alerta->>'titulo', 'Ligue para o cliente'), v_alerta->>'texto',
         'robo_ligar:' || r.conversa_id)
      on conflict (organizacao_id, dedup_key) where resolvido_em is null do nothing;

      -- sino: um pedido de ligação por cliente
      update public.notificacoes set lida_em = now()
       where tipo in ('robo_ligar', 'robo_ligar_sem_dono') and ref_id = r.conversa_id and lida_em is null;

      if r.dono is not null then
        v_notif := public.radar_txt('notif.ligar', v_par);
        insert into _notif_rl (organizacao_id, usuario_id, tipo, titulo, corpo, rota, ref_id, min_parado)
        values (r.organizacao_id, r.dono, 'robo_ligar',
                coalesce(v_notif->>'titulo', 'Ligue para ' || public.radar_nome_curto(r.contato_nome)), v_notif->>'texto',
                '/whatsapp?conversa=' || r.conversa_id, r.conversa_id, r.min_parado);
      else
        v_notif := public.radar_txt('notif.ligar_sem_dono', v_par);
        insert into _notif_rl (organizacao_id, usuario_id, tipo, titulo, corpo, rota, ref_id, min_parado)
        select r.organizacao_id, ou.usuario_id, 'robo_ligar_sem_dono',
               coalesce(v_notif->>'titulo', 'Lead sem responsável parou no robô'), v_notif->>'texto',
               '/whatsapp?conversa=' || r.conversa_id, r.conversa_id, r.min_parado
        from public.organizacao_usuarios ou
        where ou.organizacao_id = r.organizacao_id and ou.papel = 'admin' and ou.status = 'ativo';
      end if;

      v_avisos := v_avisos + 1;
    exception when others then
      raise warning 'robo_ligar_avaliar: falhou na conversa % — %', r.conversa_id, sqlerrm;
    end;
  end loop;

  -- SINO SEM ENXURRADA: por pessoa, entram as 3 ligações paradas há mais tempo; passou de 3, também um resumo
  insert into public.notificacoes (organizacao_id, usuario_id, tipo, titulo, corpo, rota, ref_id)
  select x.organizacao_id, x.usuario_id, x.tipo, x.titulo, x.corpo, x.rota, x.ref_id
    from (select y.*, row_number() over (partition by y.usuario_id order by y.min_parado desc) as rn
            from _notif_rl y) x
   where x.rn <= 3;

  -- um resumo por pessoa: o novo substitui o anterior
  update public.notificacoes n set lida_em = now()
    from (select organizacao_id, usuario_id from _notif_rl group by organizacao_id, usuario_id having count(*) > 3) g
   where n.lida_em is null and n.tipo = 'robo_ligar_resumo'
     and n.organizacao_id = g.organizacao_id and n.usuario_id = g.usuario_id;

  insert into public.notificacoes (organizacao_id, usuario_id, tipo, titulo, corpo, rota, ref_id)
  select g.organizacao_id, g.usuario_id, 'robo_ligar_resumo',
         coalesce(t.j->>'titulo', g.n || ' clientes para ligar'), t.j->>'texto', '/whatsapp?radar=ligar', null
    from (select organizacao_id, usuario_id, count(*)::int as n
            from _notif_rl group by organizacao_id, usuario_id having count(*) > 3) g
    cross join lateral (select public.radar_txt('notif.resumo.ligar', jsonb_build_object('n', g.n)) as j) t;

  return jsonb_build_object('avisos', v_avisos, 'resolvidos', v_resolvidos);
end $function$;
revoke all on function public.robo_ligar_avaliar(uuid) from public, anon, authenticated;

-- "Já liguei": encerra o pedido de ligação e registra na conversa
create or replace function public.robo_ligar_concluir(p_conversa uuid)
returns jsonb
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v_org uuid; v_dono uuid; v_nome text; v_cli text;
begin
  select c.organizacao_id, coalesce(ct.responsavel_id, c.atendente_id), coalesce(ct.nome, 'Cliente')
    into v_org, v_dono, v_cli
  from public.conversas c left join public.contatos ct on ct.id = c.contato_id
  where c.id = p_conversa;
  if v_org is null then raise exception 'Conversa não encontrada.'; end if;
  if auth.uid() is distinct from v_dono and not public.vacuo_eh_gestor(v_org) then
    raise exception '%', coalesce(public.radar_txt('extra.erro.ligacao_sem_permissao')->>'texto', 'Só o responsável pelo cliente ou o gestor pode registrar a ligação.');
  end if;
  select nome into v_nome from public.usuarios where id = auth.uid();

  update public.sla_alertas
     set resolvido_em = now(), resolucao = 'ligou', resolvido_por = auth.uid(), atualizado_em = now()
   where tipo = 'robo_ligar' and conversa_id = p_conversa and resolvido_em is null;
  update public.robo_ligar set concluido_em = now(), concluido_por = auth.uid() where conversa_id = p_conversa;
  update public.notificacoes set lida_em = now()
   where tipo in ('robo_ligar', 'robo_ligar_sem_dono') and ref_id = p_conversa and lida_em is null;

  insert into public.mensagens (organizacao_id, conversa_id, direcao, tipo, origem, status, conteudo, enviada_em)
  values (v_org, p_conversa, 'saida', 'nota_interna', 'bot', 'enviada',
          coalesce(public.radar_nota('nota.ligou', jsonb_build_object('atendente', coalesce(v_nome, 'O atendente'), 'cliente', v_cli)),
                   'Ligação registrada.'), now());

  return jsonb_build_object('ok', true);
end $function$;
revoke all on function public.robo_ligar_concluir(uuid) from public, anon;
grant execute on function public.robo_ligar_concluir(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5) Leitura do front: avisos do Radar com o dado ESTRUTURADO (categoria, degrau,
--    desde quando, tempo útil ao vivo, prioridade, quem cutucou) — nada de ler texto.
--    Atendente recebe só os próprios; o gestor recebe todos (o painel da equipe usa).
-- ---------------------------------------------------------------------------
create or replace function public.radar_avisos(p_org uuid)
returns table(
  alerta_id uuid, tipo text, categoria text, estagio int,
  conversa_id uuid, contato_id uuid, contato_nome text, contato_telefone text,
  responsavel_id uuid, responsavel_nome text,
  desde timestamptz, minutos_uteis int, prioritario boolean, prioridade text,
  cutucado_em timestamptz, cutucadas int, cutucado_por_nome text,
  decisao_pedida_em timestamptz, decisao_em_min int, ultima_msg text,
  titulo text, detalhe text, criado_em timestamptz)
language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v_gestor boolean;
begin
  if not (public.is_platform_admin() or public.is_member(p_org)) then
    raise exception 'sem_acesso' using errcode = 'insufficient_privilege';
  end if;
  v_gestor := public.vacuo_eh_gestor(p_org);
  return query
  select a.id, a.tipo,
         case a.tipo when 'vacuo_fechado' then 'fechado' when 'robo_ligar' then 'ligar'
                     when 'vacuo_cutucada' then 'cutucada' else 'negociacao' end,
         case when a.tipo in ('vacuo_aviso', 'vacuo_fechado')
              then coalesce(nullif(ve.aviso, 0)::int, case a.severidade when 'critico' then 3 when 'vermelho' then 2 else 1 end)
              else 0 end,
         a.conversa_id, a.contato_id, ct.nome, ct.telefone,
         a.responsavel_id, u.nome,
         x.desde,
         public.vacuo_minutos_uteis(x.desde, now(), x.h_ini, x.h_fim),
         coalesce(ve.prioritario and not ve.fechado, false),
         nullif(public.radar_prioridade(ve.prioritario and not ve.fechado, ve.prio_motivo), ''),
         ve.cutucado_em, coalesce(ve.cutucadas, 0), gp.nome,
         ve.decisao_pedida_em,
         -- quanto falta (minutos ÚTEIS) para o gestor ser acionado — a mesma regra do motor; 0 = já acionado
         -- 0 só quando o pedido JÁ foi feito; antes disso, no mínimo 1 (a escada ainda tem degraus)
         case when a.tipo <> 'vacuo_aviso' or ve.conversa_id is null or ve.fechado then null
              when ve.decisao_pedida_em is not null then 0
              else greatest(1,
                     k.dec - public.vacuo_minutos_uteis(ve.base_em, now(), x.h_ini, x.h_fim),
                     case when ve.aviso_em is null then 0
                          when ve.aviso >= 3 then greatest(k.dec - k.a3, 5)
                                                  - public.vacuo_minutos_uteis(ve.aviso_em, now(), x.h_ini, x.h_fim)
                          when ve.aviso = 2 then greatest(k.a3 - k.a2 - public.vacuo_minutos_uteis(ve.aviso_em, now(), x.h_ini, x.h_fim), 0)
                                                 + greatest(k.dec - k.a3, 5)
                          else greatest(k.a2 - k.a1 - public.vacuo_minutos_uteis(ve.aviso_em, now(), x.h_ini, x.h_fim), 0)
                               + (k.a3 - k.a2) + greatest(k.dec - k.a3, 5) end)
         end::int,
         -- trecho da última mensagem do cliente (tela cheia): até 60 caracteres, números longos mascarados
         lm.txt,
         a.titulo, a.detalhe, a.criado_em
  from public.sla_alertas a
  left join public.vacuo_estado ve on ve.conversa_id = a.conversa_id
  left join public.robo_ligar rl on rl.conversa_id = a.conversa_id
  left join public.contatos ct on ct.id = a.contato_id
  left join public.usuarios u on u.id = a.responsavel_id
  left join public.usuarios gp on gp.id = ve.cutucado_por
  left join public.vacuo_config cfg on cfg.organizacao_id = a.organizacao_id
  cross join lateral (
    select coalesce(case when a.tipo = 'robo_ligar' then rl.ult_bot_em end, ve.espera_desde, ve.base_em, a.criado_em) as desde,
           coalesce(cfg.hora_inicio, 9)::int as h_ini, coalesce(cfg.hora_fim, 18)::int as h_fim
  ) x
  -- degraus da escada do cliente (prioritário tem escada acelerada) — os mesmos do motor
  cross join lateral (
    select case when coalesce(ve.prioritario, false) then cfg.prio_aviso1_min else cfg.aviso1_min end as a1,
           case when coalesce(ve.prioritario, false) then cfg.prio_aviso2_min else cfg.aviso2_min end as a2,
           case when coalesce(ve.prioritario, false) then cfg.prio_aviso3_min else cfg.aviso3_min end as a3,
           case when coalesce(ve.prioritario, false) then cfg.prio_repasse_min else cfg.repasse_min end as dec
  ) k
  left join lateral (
    select case when m.tipo = 'texto' and coalesce(btrim(m.conteudo), '') <> '' then
             (select case when char_length(t) > 60 then left(t, 59) || '…' else t end
                from (select regexp_replace(regexp_replace(btrim(m.conteudo), '\s+', ' ', 'g'),
                                            '\d[\d.\-/ ]{2,}\d', '••••', 'g') as t) y)
           end as txt
    from public.mensagens m
    where m.conversa_id = a.conversa_id and m.direcao = 'entrada'
    order by coalesce(m.recebida_em, m.criado_em) desc
    limit 1
  ) lm on a.tipo in ('vacuo_aviso', 'vacuo_fechado', 'vacuo_cutucada')
  where a.organizacao_id = p_org and a.resolvido_em is null
    and a.tipo in ('vacuo_aviso', 'vacuo_fechado', 'robo_ligar', 'vacuo_cutucada')
    and (a.silenciado_ate is null or a.silenciado_ate < now())
    and (v_gestor or a.responsavel_id = auth.uid());
end $function$;
revoke all on function public.radar_avisos(uuid) from public, anon;
grant execute on function public.radar_avisos(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- decisões pendentes: tempo sem resposta AO VIVO (antes ficava congelado no momento do pedido)
-- e "desde" = início real da espera. Mesma assinatura da versão no ar.
-- ---------------------------------------------------------------------------
create or replace function public.vacuo_decisoes_pendentes(p_org uuid)
returns table(conversa_id uuid, contato_nome text, dono_id uuid, dono_nome text, desde timestamptz,
              decisao_pedida_em timestamptz, minutos_vacuo integer, prioritario boolean, prio_motivo text,
              sugerido_id uuid, sugerido_nome text, cutucado_em timestamptz, cutucadas integer)
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $function$
  with cfg as (
    select coalesce(c.conversao_janela_dias, 30) as janela, coalesce(c.conversao_min_recebidos, 30) as minimo,
           coalesce(c.hora_inicio, 9)::int as h_ini, coalesce(c.hora_fim, 18)::int as h_fim
    from public.vacuo_config c where c.organizacao_id = p_org
  ),
  -- sugestão de destino UMA vez por dono (materializada: o planner não pode voltar a chamar por linha)
  sug as materialized (
    select d.usuario_id,
           public.vacuo_melhor_fechador(p_org, d.usuario_id,
             coalesce((select janela from cfg), 30), coalesce((select minimo from cfg), 30)) as sug_id
    from (select distinct ve0.usuario_id from public.vacuo_estado ve0
           where ve0.organizacao_id = p_org and ve0.decisao_pedida_em is not null) d
  )
  select ve.conversa_id, ct.nome, ve.usuario_id, u.nome,
         coalesce(ve.espera_desde, ve.base_em), ve.decisao_pedida_em,
         public.vacuo_minutos_uteis(coalesce(ve.espera_desde, ve.base_em), now(),
                                    coalesce((select h_ini from cfg), 9), coalesce((select h_fim from cfg), 18)),
         ve.prioritario, ve.prio_motivo,
         uu.id, uu.nome,
         ve.cutucado_em, ve.cutucadas
  from public.vacuo_estado ve
  left join public.contatos ct on ct.id = ve.contato_id
  left join public.usuarios u on u.id = ve.usuario_id
  left join sug s on s.usuario_id is not distinct from ve.usuario_id
  left join public.usuarios uu on uu.id = s.sug_id
  where ve.organizacao_id = p_org and ve.decisao_pedida_em is not null
    and not ve.fechado
    and public.vacuo_eh_gestor(p_org)
  order by ve.prioritario desc, coalesce(ve.espera_desde, ve.base_em)
$function$;

-- ---------------------------------------------------------------------------
-- 6) Arrumação única: sino limpo e os avisos que já estão na tela com os textos novos
-- ---------------------------------------------------------------------------
-- 6-0) início REAL da espera dos clientes que já estão no Radar (1ª mensagem do cliente depois da
--      última resposta da equipe) — o motor mantém daqui em diante
update public.vacuo_estado ve
   set espera_desde = x.pri_in
  from (select ve2.conversa_id,
               (select min(coalesce(m.recebida_em, m.criado_em)) from public.mensagens m
                 where m.conversa_id = ve2.conversa_id and m.direcao = 'entrada'
                   and coalesce(m.recebida_em, m.criado_em) > coalesce(
                     (select max(coalesce(h.enviada_em, h.criado_em)) from public.mensagens h
                       where h.conversa_id = ve2.conversa_id and h.direcao = 'saida'
                         and ((h.autor_id is not null and h.tipo not in ('sistema', 'nota_interna'))
                              or (h.autor_id is null and h.origem = 'telefone'))),
                     '-infinity'::timestamptz)) as pri_in
          from public.vacuo_estado ve2) x
 where x.conversa_id = ve.conversa_id and x.pri_in is not null and ve.espera_desde is null;

-- (lida_em recuado 25 h: o sino tira da lista o que foi lido há mais de 24 h — o que a arrumação encerra é
--  texto antigo, de antes da v5, e não deve continuar aparecendo nem no filtro "Todas")
-- 6a) sino: aviso de cliente que não está mais em espera com aquele dono vira lido; pedido do gestor
--     vira lido quando o pedido (alerta) daquele dono não está mais ativo
update public.notificacoes n set lida_em = now() - interval '25 hours'
 where n.lida_em is null and n.tipo in ('vacuo_aviso', 'vacuo_fechado')
   and not exists (select 1 from public.vacuo_estado ve
                   where ve.conversa_id = n.ref_id and ve.usuario_id = n.usuario_id and ve.aviso >= 1);
update public.notificacoes n set lida_em = now() - interval '25 hours'
 where n.lida_em is null and n.tipo = 'vacuo_cutucada'
   and not exists (select 1 from public.sla_alertas a
                   where a.tipo = 'vacuo_cutucada' and a.conversa_id = n.ref_id
                     and a.responsavel_id = n.usuario_id and a.resolvido_em is null);

-- 6b) um aviso por cliente: só o mais recente de cada cliente continua não lido
update public.notificacoes n set lida_em = now() - interval '25 hours'
 where n.lida_em is null and n.tipo in ('vacuo_aviso', 'vacuo_fechado')
   and exists (select 1 from public.notificacoes n2
               where n2.lida_em is null and n2.tipo in ('vacuo_aviso', 'vacuo_fechado')
                 and n2.ref_id = n.ref_id and n2.usuario_id = n.usuario_id
                 and (n2.criado_em, n2.id) > (n.criado_em, n.id));

-- 6c) pedido de decisão: só os pendentes, um por cliente
update public.notificacoes n set lida_em = now() - interval '25 hours'
 where n.lida_em is null and n.tipo = 'vacuo_decisao'
   and (not exists (select 1 from public.vacuo_estado ve
                    where ve.conversa_id = n.ref_id and ve.decisao_pedida_em is not null)
        or exists (select 1 from public.notificacoes n2
                   where n2.lida_em is null and n2.tipo = 'vacuo_decisao'
                     and n2.ref_id = n.ref_id and n2.usuario_id = n.usuario_id
                     and (n2.criado_em, n2.id) > (n.criado_em, n.id)));

-- 6d) ligar: só os pedidos ainda ativos, um por cliente
update public.notificacoes n set lida_em = now() - interval '25 hours'
 where n.lida_em is null and n.tipo = 'robo_ligar'
   and (not exists (select 1 from public.sla_alertas a
                    where a.tipo = 'robo_ligar' and a.conversa_id = n.ref_id and a.resolvido_em is null)
        or exists (select 1 from public.notificacoes n2
                   where n2.lida_em is null and n2.tipo = 'robo_ligar'
                     and n2.ref_id = n.ref_id and n2.usuario_id is not distinct from n.usuario_id
                     and (n2.criado_em, n2.id) > (n.criado_em, n.id)));

-- 6e) textos novos no que sobrou no sino (o aviso atual de cada cliente)
update public.notificacoes n
   set titulo = coalesce(t.j->>'titulo', n.titulo), corpo = t.j->>'texto'
  from public.vacuo_estado ve
  join public.vacuo_config cfg on cfg.organizacao_id = ve.organizacao_id
  left join public.contatos ct on ct.id = ve.contato_id
  cross join lateral (select public.radar_txt('notif.negociacao.' || least(greatest(ve.aviso, 1), 3), jsonb_build_object(
      'cliente', public.radar_nome_curto(ct.nome),
      'tempo', public.radar_fmt_tempo(public.vacuo_minutos_uteis(coalesce(ve.espera_desde, ve.base_em), ve.aviso_em, cfg.hora_inicio, cfg.hora_fim),
                                      (cfg.hora_fim - cfg.hora_inicio) * 60),
      'desde', public.radar_fmt_desde(coalesce(ve.espera_desde, ve.base_em)),
      'aviso', least(greatest(ve.aviso, 1), 3),
      'prioridade', public.radar_prioridade(ve.prioritario, ve.prio_motivo))) as j) t
 where n.lida_em is null and n.tipo = 'vacuo_aviso'
   and ve.conversa_id = n.ref_id and ve.usuario_id = n.usuario_id and ve.aviso between 1 and 3;

update public.notificacoes n
   set titulo = coalesce(t.j->>'titulo', n.titulo), corpo = t.j->>'texto'
  from public.vacuo_estado ve
  join public.vacuo_config cfg on cfg.organizacao_id = ve.organizacao_id
  left join public.contatos ct on ct.id = ve.contato_id
  left join public.usuarios u on u.id = ve.usuario_id
  cross join lateral (select public.radar_txt('notif.decisao', jsonb_build_object(
      'cliente', public.radar_nome_curto(ct.nome),
      'atendente', coalesce(u.nome, 'o atendente'),
      'tempo', public.radar_fmt_tempo(ve.minutos_vacuo, (cfg.hora_fim - cfg.hora_inicio) * 60),
      'desde', public.radar_fmt_desde(coalesce(ve.espera_desde, ve.base_em)),
      'prioridade', public.radar_prioridade(ve.prioritario, ve.prio_motivo))) as j) t
 where n.lida_em is null and n.tipo = 'vacuo_decisao'
   and ve.conversa_id = n.ref_id and ve.decisao_pedida_em is not null;

update public.notificacoes n
   set titulo = coalesce((case when n.usuario_id = rl.usuario_id then t.dono else t.sem end)->>'titulo', n.titulo),
       corpo = (case when n.usuario_id = rl.usuario_id then t.dono else t.sem end)->>'texto',
       -- lead sem responsável avisado ao gestor: tipo próprio (vai para Gestão no sino)
       tipo = case when n.usuario_id is distinct from rl.usuario_id then 'robo_ligar_sem_dono' else n.tipo end
  from public.robo_ligar rl
  join public.vacuo_config cfg on cfg.organizacao_id = rl.organizacao_id
  left join public.contatos ct on ct.id = rl.contato_id
  cross join lateral (select jsonb_build_object(
        'cliente', public.radar_nome_curto(ct.nome),
        'tempo', public.radar_fmt_tempo(public.vacuo_minutos_uteis(rl.ult_bot_em, rl.notificado_em, cfg.hora_inicio, cfg.hora_fim),
                                        (cfg.hora_fim - cfg.hora_inicio) * 60),
        'desde', public.radar_fmt_desde(rl.ult_bot_em)) as p) pp
  cross join lateral (select public.radar_txt('notif.ligar', pp.p) as dono,
                             public.radar_txt('notif.ligar_sem_dono', pp.p) as sem) t
 where n.lida_em is null and n.tipo = 'robo_ligar' and rl.conversa_id = n.ref_id;

-- 6f) textos novos nos avisos ativos (barra, central, inbox e Kanban leem daqui)
update public.sla_alertas a
   set titulo = coalesce(t.j->>'titulo', a.titulo), detalhe = t.j->>'texto', atualizado_em = now()
  from public.vacuo_estado ve
  join public.vacuo_config cfg on cfg.organizacao_id = ve.organizacao_id
  left join public.contatos ct on ct.id = ve.contato_id
  cross join lateral (select public.radar_txt('alerta.negociacao.' || least(greatest(ve.aviso, 1), 3), jsonb_build_object(
      'cliente', public.radar_nome_curto(ct.nome),
      'tempo', public.radar_fmt_tempo(public.vacuo_minutos_uteis(coalesce(ve.espera_desde, ve.base_em), coalesce(ve.aviso_em, now()), cfg.hora_inicio, cfg.hora_fim),
                                      (cfg.hora_fim - cfg.hora_inicio) * 60),
      'desde', public.radar_fmt_desde(coalesce(ve.espera_desde, ve.base_em)),
      'aviso', least(greatest(ve.aviso, 1), 3),
      'prioridade', public.radar_prioridade(ve.prioritario, ve.prio_motivo))) as j) t
 where a.tipo = 'vacuo_aviso' and a.resolvido_em is null and ve.conversa_id = a.conversa_id and ve.aviso between 1 and 3;

update public.sla_alertas a
   set titulo = coalesce(t.j->>'titulo', a.titulo), detalhe = t.j->>'texto', atualizado_em = now()
  from public.robo_ligar rl
  join public.vacuo_config cfg on cfg.organizacao_id = rl.organizacao_id
  left join public.contatos ct on ct.id = rl.contato_id
  cross join lateral (select public.radar_txt('alerta.ligar', jsonb_build_object(
      'cliente', public.radar_nome_curto(ct.nome),
      'tempo', public.radar_fmt_tempo(public.vacuo_minutos_uteis(rl.ult_bot_em, rl.notificado_em, cfg.hora_inicio, cfg.hora_fim),
                                      (cfg.hora_fim - cfg.hora_inicio) * 60),
      'desde', public.radar_fmt_desde(rl.ult_bot_em))) as j) t
 where a.tipo = 'robo_ligar' and a.resolvido_em is null and rl.conversa_id = a.conversa_id;

update public.sla_alertas a
   set titulo = coalesce(t.j->>'titulo', a.titulo), detalhe = t.j->>'texto', atualizado_em = now()
  from public.vacuo_estado ve
  join public.vacuo_config cfg on cfg.organizacao_id = ve.organizacao_id
  left join public.contatos ct on ct.id = ve.contato_id
  left join public.usuarios u on u.id = ve.usuario_id
  cross join lateral (select public.radar_txt('alerta.cutucada', jsonb_build_object(
      'cliente', public.radar_nome_curto(ct.nome),
      'atendente', coalesce(u.nome, 'o atendente'),
      'gestor', 'O gestor',
      'desde', public.radar_fmt_desde(coalesce(ve.espera_desde, ve.base_em)),
      'tempo', public.radar_fmt_tempo(public.vacuo_minutos_uteis(coalesce(ve.espera_desde, ve.base_em), now(), cfg.hora_inicio, cfg.hora_fim),
                                      (cfg.hora_fim - cfg.hora_inicio) * 60),
      'prioridade', public.radar_prioridade(ve.prioritario, ve.prio_motivo),
      'n', ve.cutucadas)) as j) t
 where a.tipo = 'vacuo_cutucada' and a.resolvido_em is null and ve.conversa_id = a.conversa_id;

-- 6g) avisos de gestão de ANTES da v5 (texto antigo: "punição", "repasse automático", emoji) saem do sino
update public.notificacoes n set lida_em = now() - interval '25 hours'
 where n.lida_em is null and n.tipo in ('vacuo_punicao', 'vacuo_recebido', 'vacuo_mantido', 'vacuo_devolvido');
