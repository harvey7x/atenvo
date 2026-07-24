-- ============================================================================
-- MATURAÇÃO — perfis de rampa (7/14/30/45 dias) + score da conta
--
-- 1) PERFIS: em vez de uma curva única, presets nomeados que definem volume/dia,
--    duração até maduro e quando as sementes entram. As curvas ficam AUTORITATIVAS
--    no banco (um RPC), não no frontend — assim mudar o preset é uma decisão só.
--
--    AVISO REGISTRADO NO PRÓPRIO CÓDIGO: 'expresso_7' sobe volume rápido em chip novo,
--    que é o gatilho nº1 de ban. É oferecido porque o dono pediu, mas o padrão
--    recomendado é 'padrao_30'. Quanto mais curto o perfil, maior o risco.
--
-- 2) SCORE: 0–100 por chip, derivado de entrega, leitura, erro, conexão e progresso.
--    É o placar que avisa CEDO quando um chip está sendo restringido (o ERROR de envio
--    que antecipou a LUIZA derruba o score antes de o chip cair). Chip novo sem amostra
--    não é punido: os sub-scores sem dados ficam neutros.
-- ============================================================================

alter table public.maturacao_config
  add column if not exists perfil_rampa text not null default 'padrao_30';

comment on column public.maturacao_config.perfil_rampa is
  'Preset de rampa ativo: expresso_7 | rapido_14 | padrao_30 | conservador_45 | custom.';

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC: aplicar um perfil. Escreve a curva canônica + duração + entrada de sementes.
-- Volumes = mensagens/dia POR CHIP (o planner sorteia entre min/max e usa `tipos`).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.maturacao_aplicar_perfil(p_org uuid, p_perfil text)
returns public.maturacao_config
language plpgsql security definer set search_path = public as $fn$
declare
  v_rampa    jsonb;
  v_maduro   int;
  v_sementes int;
  v_pct      int;
  v_row      public.maturacao_config;
begin
  if not public._eh_admin_org(p_org) then raise exception 'sem_acesso'; end if;
  perform public.maturacao_config_obter(p_org);

  if p_perfil = 'expresso_7' then
    -- AGRESSIVO: 7 dias. Alto risco de ban. Só com pool grande e sob monitoria do score.
    v_rampa := '[
      {"ate_dia":2,   "min":15, "max":25,  "tipos":["texto"]},
      {"ate_dia":4,   "min":30, "max":50,  "tipos":["texto","figurinha","audio"]},
      {"ate_dia":6,   "min":55, "max":80,  "tipos":["texto","figurinha","audio","imagem"]},
      {"ate_dia":9999,"min":70, "max":100, "tipos":["texto","figurinha","audio","imagem"]}
    ]'::jsonb;
    v_maduro := 7;  v_sementes := 3;  v_pct := 30;

  elsif p_perfil = 'rapido_14' then
    v_rampa := '[
      {"ate_dia":3,   "min":10, "max":18, "tipos":["texto"]},
      {"ate_dia":7,   "min":20, "max":35, "tipos":["texto","figurinha","audio"]},
      {"ate_dia":11,  "min":35, "max":55, "tipos":["texto","figurinha","audio","imagem"]},
      {"ate_dia":9999,"min":50, "max":75, "tipos":["texto","figurinha","audio","imagem"]}
    ]'::jsonb;
    v_maduro := 14; v_sementes := 5;  v_pct := 25;

  elsif p_perfil = 'padrao_30' then
    -- RECOMENDADO.
    v_rampa := '[
      {"ate_dia":5,   "min":6,  "max":12, "tipos":["texto"]},
      {"ate_dia":12,  "min":14, "max":25, "tipos":["texto","figurinha","audio"]},
      {"ate_dia":20,  "min":25, "max":40, "tipos":["texto","figurinha","audio","imagem"]},
      {"ate_dia":9999,"min":40, "max":60, "tipos":["texto","figurinha","audio","imagem"]}
    ]'::jsonb;
    v_maduro := 30; v_sementes := 10; v_pct := 25;

  elsif p_perfil = 'conservador_45' then
    v_rampa := '[
      {"ate_dia":7,   "min":4,  "max":10, "tipos":["texto"]},
      {"ate_dia":14,  "min":12, "max":25, "tipos":["texto","figurinha","audio"]},
      {"ate_dia":21,  "min":25, "max":40, "tipos":["texto","figurinha","audio","imagem"]},
      {"ate_dia":28,  "min":40, "max":60, "tipos":["texto","figurinha","audio","imagem"]},
      {"ate_dia":9999,"min":30, "max":50, "tipos":["texto","figurinha","audio","imagem"]}
    ]'::jsonb;
    v_maduro := 45; v_sementes := 15; v_pct := 25;

  else
    raise exception 'perfil_invalido'
      using hint = 'use expresso_7, rapido_14, padrao_30 ou conservador_45';
  end if;

  update public.maturacao_config set
    perfil_rampa     = p_perfil,
    rampa            = v_rampa,
    dias_para_maduro = v_maduro,
    dia_sementes     = v_sementes,
    pct_sementes     = v_pct,
    atualizado_em    = now(),
    atualizado_por   = auth.uid()
  where organizacao_id = p_org
  returning * into v_row;

  return v_row;
end $fn$;

revoke execute on function public.maturacao_aplicar_perfil(uuid, text) from public, anon;
grant  execute on function public.maturacao_aplicar_perfil(uuid, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- config_salvar: passa a aceitar perfil_rampa (edição manual marca 'custom' no front).
-- Redefinição completa mantendo todos os campos das versões anteriores.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.maturacao_config_salvar(p_org uuid, p_patch jsonb)
returns public.maturacao_config
language plpgsql security definer set search_path = public as $fn$
declare v_row public.maturacao_config;
begin
  if not public._eh_admin_org(p_org) then raise exception 'sem_acesso'; end if;
  perform public.maturacao_config_obter(p_org);

  update public.maturacao_config set
    modo               = coalesce(p_patch->>'modo', modo),
    hora_inicio        = coalesce((p_patch->>'hora_inicio')::int, hora_inicio),
    hora_fim           = coalesce((p_patch->>'hora_fim')::int, hora_fim),
    dias_semana        = coalesce(
                           (select array_agg(value::text::int)
                              from jsonb_array_elements(p_patch->'dias_semana')),
                           dias_semana),
    rampa              = coalesce(p_patch->'rampa', rampa),
    dia_sementes       = coalesce((p_patch->>'dia_sementes')::int, dia_sementes),
    min_sementes       = coalesce((p_patch->>'min_sementes')::int, min_sementes),
    pct_sementes       = coalesce((p_patch->>'pct_sementes')::int, pct_sementes),
    dias_para_maduro   = coalesce((p_patch->>'dias_para_maduro')::int, dias_para_maduro),
    iniciar_automatico = coalesce((p_patch->>'iniciar_automatico')::boolean, iniciar_automatico),
    perfil_rampa       = coalesce(p_patch->>'perfil_rampa', perfil_rampa),
    atualizado_em      = now(),
    atualizado_por     = auth.uid()
  where organizacao_id = p_org
  returning * into v_row;

  return v_row;
end $fn$;

revoke execute on function public.maturacao_config_salvar(uuid, jsonb) from public, anon;
grant  execute on function public.maturacao_config_salvar(uuid, jsonb) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Painel com SCORE. Assinatura muda ⇒ DROP antes do CREATE.
-- Score = média ponderada de 5 fatores (0..1). Amostra pequena fica NEUTRA (0.7)
-- para não punir chip recém-conectado. Conexão e progresso puxam o resto.
-- ─────────────────────────────────────────────────────────────────────────────
drop function if exists public.maturacao_painel(uuid);

create or replace function public.maturacao_painel(p_org uuid)
returns table (
  chip_id           uuid,
  apelido           text,
  numero_conectado  text,
  status_integracao text,
  status_maturacao  text,
  dia_rampa         int,
  perfil_ok         boolean,
  enviadas_7d       bigint,
  entregues_7d      bigint,
  lidas_7d          bigint,
  erros_7d          bigint,
  pendentes_hoje    bigint,
  ultimo_erro_em    timestamptz,
  proxy_resumo      text,
  proxy_ativo       boolean,
  proxy_pendente    boolean,
  proxy_ultimo_erro text,
  score             int,
  score_classe      text
)
language sql stable security definer set search_path = public as $fn$
  with cfg as (
    select dias_para_maduro from public.maturacao_config where organizacao_id = p_org
  ),
  base as (
    select
      c.id, c.apelido, c.numero_conectado, c.status_integracao, c.status_maturacao,
      c.dia_rampa, c.perfil_ok, c.criado_em,
      c.proxy_protocolo, c.proxy_host, c.proxy_porta, c.proxy_aplicado_em, c.proxy_ultimo_erro,
      count(*) filter (where e.tipo='envio'   and e.ocorrido_em > now()-interval '7 days')                        as env7,
      count(*) filter (where e.tipo='ack'     and e.status='entregue' and e.ocorrido_em > now()-interval '7 days') as ent7,
      count(*) filter (where e.tipo='leitura' and e.ocorrido_em > now()-interval '7 days')                        as lid7,
      count(*) filter (where e.tipo='erro'    and e.ocorrido_em > now()-interval '7 days')                        as err7,
      max(e.ocorrido_em) filter (where e.tipo='erro')                                                             as ult_err
    from public.maturacao_chips c
    left join public.maturacao_eventos e on e.chip_id = c.id
    where c.organizacao_id = p_org and public._eh_admin_org(p_org)
    group by c.id
  ),
  calc as (
    select b.*,
      (select dias_para_maduro from cfg) as maduro,
      -- sub-scores 0..1; amostra < 5 envios => neutro 0.7 (não pune chip novo)
      case when b.env7 >= 5 then least(1.0, (b.ent7::numeric / b.env7) / 0.9) else 0.7 end as s_entrega,
      case when b.env7 >= 5 then least(1.0, (b.lid7::numeric / b.env7) / 0.6) else 0.7 end as s_leitura,
      case when b.env7 >= 1 then greatest(0.0, 1 - (b.err7::numeric / b.env7) * 4) else 1.0 end as s_erro,
      case when b.status_integracao = 'conectado' then 1.0 else 0.0 end as s_conexao,
      least(1.0, b.dia_rampa::numeric / greatest(1, (select dias_para_maduro from cfg))) as s_prog
    from base b
  )
  select
    id, apelido, numero_conectado, status_integracao, status_maturacao, dia_rampa, perfil_ok,
    env7, ent7, lid7, err7,
    (select count(*) from public.maturacao_agenda a
      where a.chip_origem_id = calc.id and a.status='agendada' and a.executar_em::date = current_date),
    ult_err,
    case when proxy_host is null then null
         else proxy_protocolo || '://' || proxy_host || ':' || proxy_porta end,
    (proxy_host is not null and proxy_aplicado_em is not null),
    (proxy_host is not null and proxy_aplicado_em is null),
    proxy_ultimo_erro,
    round(100 * (0.30*s_entrega + 0.20*s_leitura + 0.25*s_erro + 0.15*s_conexao + 0.10*s_prog))::int as score,
    case
      when round(100 * (0.30*s_entrega + 0.20*s_leitura + 0.25*s_erro + 0.15*s_conexao + 0.10*s_prog)) >= 75 then 'saudavel'
      when round(100 * (0.30*s_entrega + 0.20*s_leitura + 0.25*s_erro + 0.15*s_conexao + 0.10*s_prog)) >= 50 then 'atencao'
      else 'risco'
    end as score_classe
  from calc
  order by criado_em;
$fn$;

revoke execute on function public.maturacao_painel(uuid) from public, anon;
grant  execute on function public.maturacao_painel(uuid) to authenticated;
