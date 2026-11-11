-- ============================================================================
-- PENDÊNCIAS DO PROCESSO (08/10/2026, pedido do dono)
-- Cliente FECHADO (oportunidade ganha) + pedido do juiz (reassinar, documento novo…).
-- A 1ª mensagem sai por UM número dedicado (config da org; começa no MURILLO CHIP)
-- e, se o cliente não responder, os lembretes saem nos dias seguintes. Para sozinho
-- quando o cliente responde; a conversa fica com o responsável (encarregado) do contato.
--
-- Envio = pipeline vivo: pendencias_tick() (cron 1/min) põe os blocos do passo na fila
-- mensagens_agendadas (metadados.origem='pendencia') → mensagens-agendadas-processar →
-- evolution-send. ZERO mudança em edge function e em mensagens_agendadas.
--
-- NASCE INERTE: pendencias_config.ativo = false. Com ele desligado dá para abrir
-- pendência e montar lembretes, mas NADA sai (o tick não despacha).
-- ============================================================================

-- ---------------------------------------------------------------- tabelas
create table if not exists public.pendencias_config (
  organizacao_id     uuid primary key references public.organizacoes(id) on delete cascade,
  canal_id           uuid references public.canais(id),
  ativo              boolean not null default false,
  janela_ini         time not null default '09:00',
  janela_fim         time not null default '19:00',
  dias_uteis         boolean not null default true,
  limite_dia         int not null default 40 check (limite_dia between 1 and 500),
  avisar_responsavel boolean not null default true,
  atualizado_em      timestamptz not null default now(),
  atualizado_por     uuid
);

create table if not exists public.pendencias_modelos (
  id             uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  tipo           text not null check (tipo in ('reassinatura','documento','informacao','outro')),
  nome           text not null check (length(btrim(nome)) between 1 and 60),
  passos         jsonb not null default '[]'::jsonb check (jsonb_typeof(passos) = 'array'),
  criado_por     uuid,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);
create index if not exists pendencias_modelos_org on public.pendencias_modelos (organizacao_id);

create table if not exists public.pendencias (
  id               uuid primary key default gen_random_uuid(),
  organizacao_id   uuid not null references public.organizacoes(id) on delete cascade,
  contato_id       uuid not null references public.contatos(id),
  oportunidade_id  uuid references public.oportunidades(id),
  conversa_id      uuid not null references public.conversas(id),
  canal_id         uuid not null references public.canais(id),
  tipo             text not null check (tipo in ('reassinatura','documento','informacao','outro')),
  o_que            text not null check (length(btrim(o_que)) between 1 and 160),
  prazo            date,
  processo         text check (processo is null or length(processo) <= 40),
  responsavel_id   uuid,
  criado_por       uuid not null,
  status           text not null default 'aguardando' check (status in ('aguardando','respondeu','sem_resposta','resolvida')),
  pausada          boolean not null default false,
  primeiro_envio_em timestamptz,
  resposta_texto   text,
  resposta_em      timestamptz,
  resposta_mensagem_id uuid,
  resolvida_em     timestamptz,
  resolvida_por    uuid,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now()
);
create index if not exists pendencias_org_status on public.pendencias (organizacao_id, status);
create index if not exists pendencias_contato on public.pendencias (contato_id);

create table if not exists public.pendencias_passos (
  id             uuid primary key default gen_random_uuid(),
  pendencia_id   uuid not null references public.pendencias(id) on delete cascade,
  organizacao_id uuid not null,
  ordem          int not null,
  dia            int not null default 0 check (dia between 0 and 60),
  hora           text not null default 'agora',
  blocos         jsonb not null check (jsonb_typeof(blocos) = 'array'),
  quando         timestamptz not null,
  estado         text not null default 'agendado' check (estado in ('agendado','enviado','cancelado')),
  avulso         boolean not null default false,
  enviado_em     timestamptz,
  msg_ids        uuid[] not null default '{}'
);
create index if not exists pendencias_passos_pend on public.pendencias_passos (pendencia_id, ordem);
create index if not exists pendencias_passos_devidos on public.pendencias_passos (quando) where estado = 'agendado';

create table if not exists public.pendencias_eventos (
  id             bigint generated always as identity primary key,
  pendencia_id   uuid not null references public.pendencias(id) on delete cascade,
  organizacao_id uuid not null,
  quando         timestamptz not null default now(),
  tipo           text not null,
  texto          text not null,
  autor_id       uuid
);
create index if not exists pendencias_eventos_pend on public.pendencias_eventos (pendencia_id, quando);

-- ---------------------------------------------------------------- RLS (leitura direta; escrita por RPC)
alter table public.pendencias_config  enable row level security;
alter table public.pendencias_modelos enable row level security;
alter table public.pendencias         enable row level security;
alter table public.pendencias_passos  enable row level security;
alter table public.pendencias_eventos enable row level security;

drop policy if exists pend_cfg_sel on public.pendencias_config;
create policy pend_cfg_sel on public.pendencias_config for select to authenticated using (public.is_member(organizacao_id));
drop policy if exists pend_mod_sel on public.pendencias_modelos;
create policy pend_mod_sel on public.pendencias_modelos for select to authenticated using (public.is_member(organizacao_id));
drop policy if exists pend_sel on public.pendencias;
create policy pend_sel on public.pendencias for select to authenticated using (public.is_member(organizacao_id));
drop policy if exists pend_passos_sel on public.pendencias_passos;
create policy pend_passos_sel on public.pendencias_passos for select to authenticated using (public.is_member(organizacao_id));
drop policy if exists pend_ev_sel on public.pendencias_eventos;
create policy pend_ev_sel on public.pendencias_eventos for select to authenticated using (public.is_member(organizacao_id));

revoke all on public.pendencias_config, public.pendencias_modelos, public.pendencias,
              public.pendencias_passos, public.pendencias_eventos from anon, authenticated;
grant select on public.pendencias_config, public.pendencias_modelos, public.pendencias,
                public.pendencias_passos, public.pendencias_eventos to authenticated;
grant all on public.pendencias_config, public.pendencias_modelos, public.pendencias,
             public.pendencias_passos, public.pendencias_eventos to service_role;

-- ---------------------------------------------------------------- helpers
create or replace function public.pend_exigir_membro(p_org uuid)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_platform_admin() or public.is_member(p_org)) then raise exception 'sem_acesso'; end if;
end $$;

create or replace function public.pend_org_atual()
returns uuid language sql stable security definer set search_path = public as $$
  select organizacao_id from public.organizacao_usuarios
   where usuario_id = auth.uid() and status = 'ativo' order by criado_em limit 1
$$;

create or replace function public.pend_evento(p_pend uuid, p_org uuid, p_tipo text, p_texto text)
returns void language sql security definer set search_path = public as $$
  insert into public.pendencias_eventos (pendencia_id, organizacao_id, tipo, texto, autor_id)
  values (p_pend, p_org, p_tipo, p_texto, auth.uid())
$$;

/* valida os blocos de um passo (mesmas regras de agendar_sequencia) e devolve-os normalizados */
create or replace function public.pend_validar_blocos(p_org uuid, p_blocos jsonb)
returns jsonb language plpgsql stable set search_path = public as $$
declare
  b jsonb; v_tipo text; v_texto text; v_path text; v_mime text; v_nome text; v_tam bigint; v_ext text;
  v_out jsonb := '[]'::jsonb;
  doc_exts text[] := array['pdf','doc','docx','xls','xlsx','txt','csv','ppt','pptx','zip','jpg','jpeg','png'];
begin
  if jsonb_typeof(p_blocos) <> 'array' or jsonb_array_length(p_blocos) < 1 then raise exception 'passo_vazio'; end if;
  if jsonb_array_length(p_blocos) > 8 then raise exception 'passo_muito_longo'; end if;
  for b in select value from jsonb_array_elements(p_blocos) loop
    v_tipo := b->>'tipo';
    v_texto := nullif(btrim(coalesce(b->>'texto','')), '');
    v_path := nullif(b->>'storage_path','');
    v_mime := coalesce(b->>'mime','');
    v_nome := b->>'nome';
    v_tam := nullif(b->>'tamanho','')::bigint;
    if v_tipo not in ('texto','imagem','audio','video','documento') then raise exception 'tipo_invalido'; end if;
    if v_texto is not null and length(v_texto) > 4096 then raise exception 'texto_muito_longo'; end if;
    if v_tipo = 'texto' then
      if v_texto is null then raise exception 'texto_vazio'; end if;
    else
      if v_path is null or left(v_path, length(p_org::text) + 1) <> (p_org::text || '/') then raise exception 'midia_path_invalido'; end if;
      if v_tipo = 'imagem' and v_mime not like 'image/%' then raise exception 'mime_incompativel'; end if;
      if v_tipo = 'audio'  and v_mime not like 'audio/%' then raise exception 'mime_incompativel'; end if;
      if v_tipo = 'video'  and v_mime not like 'video/%' then raise exception 'mime_incompativel'; end if;
      if v_tipo = 'documento' then
        v_ext := lower(nullif(regexp_replace(coalesce(v_nome,''), '^.*\.', ''), ''));
        if v_ext is null or v_ext <> all(doc_exts) then raise exception 'mime_incompativel'; end if;
      end if;
      if v_tam is not null and v_tam > (case when v_tipo = 'documento' then 25 else 16 end) * 1024 * 1024 then raise exception 'arquivo_muito_grande'; end if;
    end if;
    v_out := v_out || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'tipo', v_tipo, 'texto', v_texto, 'storage_path', v_path,
      'mime', nullif(v_mime,''), 'nome', v_nome, 'tamanho', v_tam,
      'duracao', nullif(b->>'duracao','')::int)));
  end loop;
  return v_out;
end $$;

/* instante BRT de "dia N às HH:MM" contado do início (data local) */
create or replace function public.pend_instante(p_base timestamptz, p_dia int, p_hora text)
returns timestamptz language sql stable set search_path = public as $$
  select case when p_hora = 'agora' or p_hora is null then p_base + make_interval(days => p_dia)
    else (((p_base at time zone 'America/Sao_Paulo')::date + p_dia) + p_hora::time) at time zone 'America/Sao_Paulo' end
$$;

/* grava os passos de uma pendência (substitui os 'agendado' quando p_substituir) */
create or replace function public.pend_gravar_passos(p_pend uuid, p_org uuid, p_base timestamptz, p_passos jsonb, p_primeiro_eh_agora boolean)
returns int language plpgsql security definer set search_path = public as $$
declare
  p jsonb; v_i int := 0; v_ord int; v_dia int; v_hora text; v_quando timestamptz;
begin
  if jsonb_typeof(p_passos) <> 'array' then raise exception 'passos_invalidos'; end if;
  if jsonb_array_length(p_passos) > 12 then raise exception 'passos_demais'; end if;
  select coalesce(max(ordem), -1) + 1 into v_ord from public.pendencias_passos where pendencia_id = p_pend;
  for p in select value from jsonb_array_elements(p_passos) loop
    v_dia := greatest(0, least(60, coalesce((p->>'dia')::int, 0)));
    v_hora := coalesce(nullif(p->>'hora',''), '09:00');
    if v_hora <> 'agora' and v_hora !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'hora_invalida'; end if;
    if v_i = 0 and p_primeiro_eh_agora then
      v_dia := 0; v_hora := 'agora'; v_quando := p_base;
    else
      if v_dia < 1 then v_dia := 1; end if;
      if v_hora = 'agora' then v_hora := '09:00'; end if;
      v_quando := public.pend_instante(p_base, v_dia, v_hora);
      -- só dias úteis: sábado/domingo vai para a segunda, mesma hora
      if coalesce((select dias_uteis from public.pendencias_config where organizacao_id = p_org), true) then
        while extract(isodow from v_quando at time zone 'America/Sao_Paulo') > 5 loop v_quando := v_quando + interval '1 day'; end loop;
      end if;
    end if;
    insert into public.pendencias_passos (pendencia_id, organizacao_id, ordem, dia, hora, blocos, quando)
    values (p_pend, p_org, v_ord, v_dia, v_hora, public.pend_validar_blocos(p_org, p->'blocos'), v_quando);
    v_i := v_i + 1; v_ord := v_ord + 1;
  end loop;
  return v_i;
end $$;

-- ---------------------------------------------------------------- leitura: clientes fechados
create or replace function public.pendencias_clientes_fechados(p_busca text default null, p_limite int default 40)
returns table (contato_id uuid, nome text, telefone text, responsavel_id uuid, responsavel_nome text,
               fechado_em timestamptz, servico text, abertas int)
language plpgsql stable security definer set search_path = public as $$
declare v_org uuid := public.pend_org_atual(); v_q text := nullif(btrim(coalesce(p_busca,'')), ''); v_d text;
begin
  perform public.pend_exigir_membro(v_org);
  v_d := nullif(regexp_replace(coalesce(v_q,''), '\D', '', 'g'), '');
  return query
  with g as (
    select distinct on (o.contato_id) o.contato_id, o.fechado_em, coalesce(o.tipo_servico, o.titulo) servico
      from public.oportunidades o
     where o.organizacao_id = v_org and o.status = 'ganho'
     order by o.contato_id, o.fechado_em desc nulls last
  )
  select c.id, c.nome, c.telefone, c.responsavel_id, u.nome, g.fechado_em, g.servico,
         (select count(*)::int from public.pendencias p where p.contato_id = c.id and p.status <> 'resolvida')
    from g join public.contatos c on c.id = g.contato_id
    left join public.usuarios u on u.id = c.responsavel_id
   where c.mesclado_para is null
     and (v_q is null or c.nome ilike '%' || v_q || '%' or (v_d is not null and length(v_d) >= 4 and regexp_replace(coalesce(c.telefone,''), '\D', '', 'g') like '%' || v_d || '%'))
   order by g.fechado_em desc nulls last
   limit greatest(1, least(coalesce(p_limite, 40), 200));
end $$;

-- ---------------------------------------------------------------- criar
create or replace function public.pendencia_criar(
  p_contato uuid, p_tipo text, p_o_que text, p_prazo date, p_processo text, p_passos jsonb, p_iniciar_em timestamptz default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_org uuid; v_cfg public.pendencias_config%rowtype; v_canal public.canais%rowtype;
  v_resp uuid; v_tel text; v_opp uuid; v_conv uuid; v_id uuid; v_base timestamptz;
begin
  select organizacao_id, responsavel_id, telefone into v_org, v_resp, v_tel from public.contatos where id = p_contato;
  if v_org is null then raise exception 'contato_invalido'; end if;
  perform public.pend_exigir_membro(v_org);
  if v_tel is null or length(regexp_replace(v_tel, '\D', '', 'g')) < 10 then raise exception 'contato_sem_telefone'; end if;
  select id into v_opp from public.oportunidades
   where organizacao_id = v_org and contato_id = p_contato and status = 'ganho' order by fechado_em desc nulls last limit 1;
  if v_opp is null then raise exception 'cliente_nao_fechado'; end if;
  if p_tipo not in ('reassinatura','documento','informacao','outro') then raise exception 'tipo_invalido'; end if;
  if nullif(btrim(coalesce(p_o_que,'')), '') is null then raise exception 'o_que_vazio'; end if;
  if jsonb_typeof(p_passos) <> 'array' or jsonb_array_length(p_passos) < 1 then raise exception 'sem_mensagem'; end if;

  select * into v_cfg from public.pendencias_config where organizacao_id = v_org;
  if v_cfg.canal_id is null then raise exception 'sem_numero_pendencias'; end if;
  select * into v_canal from public.canais where id = v_cfg.canal_id and organizacao_id = v_org;
  if v_canal.id is null or not v_canal.ativo or v_canal.status_integracao::text = 'removido' then raise exception 'numero_pendencias_invalido'; end if;

  v_base := case when p_iniciar_em is null or p_iniciar_em <= now() then now() else p_iniciar_em end;

  -- conversa: a mesma regra do webhook (uma ativa por contato; arquivada reabre). Sem nenhuma, cria.
  select cv.id into v_conv from public.conversas cv
   where cv.organizacao_id = v_org and cv.contato_id = p_contato and cv.status <> 'fechada'
   order by cv.arquivada_em asc nulls first, cv.ultima_interacao_em desc nulls last limit 1;
  if v_conv is null then
    begin
      insert into public.conversas (organizacao_id, contato_id, canal_id, canal_origem_id, status, atendente_id)
      values (v_org, p_contato, v_canal.id, v_canal.id, 'aberta', v_resp) returning id into v_conv;
    exception when unique_violation then
      select cv.id into v_conv from public.conversas cv
       where cv.organizacao_id = v_org and cv.contato_id = p_contato and cv.status <> 'fechada'
       order by cv.arquivada_em asc nulls first limit 1;
    end;
  end if;
  -- a resposta vai para o encarregado do cliente
  update public.conversas set atendente_id = v_resp where id = v_conv and atendente_id is null and v_resp is not null;

  insert into public.pendencias (organizacao_id, contato_id, oportunidade_id, conversa_id, canal_id, tipo, o_que, prazo,
                                 processo, responsavel_id, criado_por)
  values (v_org, p_contato, v_opp, v_conv, v_canal.id, p_tipo, btrim(p_o_que), p_prazo,
          nullif(btrim(coalesce(p_processo,'')), ''), v_resp, auth.uid())
  returning id into v_id;

  perform public.pend_gravar_passos(v_id, v_org, v_base, p_passos, true);
  perform public.pend_evento(v_id, v_org, 'aberta', 'Pendência aberta');
  return v_id;
end $$;

-- ---------------------------------------------------------------- ações
create or replace function public.pendencia_resolver(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  select organizacao_id into v_org from public.pendencias where id = p_id for update;
  if v_org is null then raise exception 'pendencia_nao_encontrada'; end if;
  perform public.pend_exigir_membro(v_org);
  update public.pendencias set status = 'resolvida', resolvida_em = now(), resolvida_por = auth.uid(), atualizado_em = now() where id = p_id;
  update public.pendencias_passos set estado = 'cancelado' where pendencia_id = p_id and estado = 'agendado';
  update public.mensagens_agendadas set status = 'cancelada', cancelada_em = now(), cancelada_por = auth.uid()
   where status = 'agendada' and metadados->>'pendencia_id' = p_id::text;
  perform public.pend_evento(p_id, v_org, 'resolvida', 'Marcada como resolvida');
end $$;

create or replace function public.pendencia_reabrir(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_resp timestamptz;
begin
  select organizacao_id, resposta_em into v_org, v_resp from public.pendencias where id = p_id for update;
  if v_org is null then raise exception 'pendencia_nao_encontrada'; end if;
  perform public.pend_exigir_membro(v_org);
  update public.pendencias set status = case when v_resp is not null then 'respondeu' else 'sem_resposta' end,
         resolvida_em = null, resolvida_por = null, atualizado_em = now() where id = p_id and status = 'resolvida';
  perform public.pend_evento(p_id, v_org, 'reaberta', 'Reaberta');
end $$;

create or replace function public.pendencia_pausar(p_id uuid, p_pausar boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  select organizacao_id into v_org from public.pendencias where id = p_id for update;
  if v_org is null then raise exception 'pendencia_nao_encontrada'; end if;
  perform public.pend_exigir_membro(v_org);
  update public.pendencias set pausada = p_pausar, atualizado_em = now() where id = p_id;
  perform public.pend_evento(p_id, v_org, case when p_pausar then 'pausada' else 'retomada' end,
                             case when p_pausar then 'Lembretes pausados' else 'Lembretes retomados' end);
end $$;

/* p_modo 'trocar': substitui os lembretes que ainda não saíram (dias contados da 1ª mensagem).
   p_modo 'retomar': cliente respondeu/sumiu sem resolver → novos lembretes a partir de agora. */
create or replace function public.pendencia_lembretes(p_id uuid, p_passos jsonb, p_modo text)
returns int language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_base timestamptz; v_n int; v_status text;
begin
  select organizacao_id, coalesce(primeiro_envio_em, criado_em), status into v_org, v_base, v_status
    from public.pendencias where id = p_id for update;
  if v_org is null then raise exception 'pendencia_nao_encontrada'; end if;
  perform public.pend_exigir_membro(v_org);
  if p_modo not in ('trocar','retomar') then raise exception 'modo_invalido'; end if;
  if v_status = 'resolvida' then raise exception 'pendencia_resolvida'; end if;
  delete from public.pendencias_passos where pendencia_id = p_id and estado = 'agendado';
  if p_modo = 'retomar' then v_base := now(); end if;
  v_n := public.pend_gravar_passos(p_id, v_org, v_base, p_passos, false);
  if p_modo = 'retomar' then
    update public.pendencias set status = 'aguardando', pausada = false, resposta_texto = null, resposta_em = null,
           resposta_mensagem_id = null, primeiro_envio_em = coalesce(primeiro_envio_em, now()), atualizado_em = now() where id = p_id;
  end if;
  perform public.pend_evento(p_id, v_org, 'lembretes', case when p_modo = 'trocar' then 'Lembretes alterados' else 'Lembretes programados de novo' end);
  return v_n;
end $$;

/* mensagem avulsa: entra como passo 'agora' (o tick despacha no próximo minuto, se ligado) */
create or replace function public.pendencia_enviar_agora(p_id uuid, p_blocos jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_ord int;
begin
  select organizacao_id into v_org from public.pendencias where id = p_id;
  if v_org is null then raise exception 'pendencia_nao_encontrada'; end if;
  perform public.pend_exigir_membro(v_org);
  select coalesce(max(ordem), -1) + 1 into v_ord from public.pendencias_passos where pendencia_id = p_id;
  insert into public.pendencias_passos (pendencia_id, organizacao_id, ordem, dia, hora, blocos, quando, avulso)
  values (p_id, v_org, v_ord, 0, 'agora', public.pend_validar_blocos(v_org, p_blocos), now(), true);
  perform public.pend_evento(p_id, v_org, 'avulsa', 'Mensagem avulsa na fila');
end $$;

-- ---------------------------------------------------------------- modelos e ajustes
create or replace function public.pendencias_modelo_salvar(p_id uuid, p_tipo text, p_nome text, p_passos jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_org uuid := public.pend_org_atual(); v_id uuid; p jsonb;
begin
  perform public.pend_exigir_membro(v_org);
  if jsonb_typeof(p_passos) <> 'array' or jsonb_array_length(p_passos) < 1 then raise exception 'sem_mensagem'; end if;
  for p in select value from jsonb_array_elements(p_passos) loop perform public.pend_validar_blocos(v_org, p->'blocos'); end loop;
  if p_id is not null and exists (select 1 from public.pendencias_modelos where id = p_id and organizacao_id = v_org) then
    update public.pendencias_modelos set tipo = p_tipo, nome = btrim(p_nome), passos = p_passos, atualizado_em = now() where id = p_id returning id into v_id;
  else
    insert into public.pendencias_modelos (organizacao_id, tipo, nome, passos, criado_por)
    values (v_org, p_tipo, btrim(p_nome), p_passos, auth.uid()) returning id into v_id;
  end if;
  return v_id;
end $$;

create or replace function public.pendencias_modelo_excluir(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid := public.pend_org_atual();
begin
  perform public.pend_exigir_membro(v_org);
  delete from public.pendencias_modelos where id = p_id and organizacao_id = v_org;
end $$;

/* ajustes: só admin da org. ativo só liga com número conectado. */
create or replace function public.pendencias_config_salvar(p_canal uuid, p_janela_ini time, p_janela_fim time,
  p_dias_uteis boolean, p_limite_dia int, p_avisar boolean, p_ativo boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid := public.pend_org_atual();
begin
  perform public.pend_exigir_membro(v_org);
  if not (public.is_platform_admin() or exists (select 1 from public.organizacao_usuarios
          where organizacao_id = v_org and usuario_id = auth.uid() and status = 'ativo' and papel = 'admin')) then
    raise exception 'so_admin';
  end if;
  if p_canal is not null and not exists (select 1 from public.canais where id = p_canal and organizacao_id = v_org) then raise exception 'canal_invalido'; end if;
  if p_janela_fim <= p_janela_ini then raise exception 'janela_invalida'; end if;
  insert into public.pendencias_config as c (organizacao_id, canal_id, janela_ini, janela_fim, dias_uteis, limite_dia, avisar_responsavel, ativo, atualizado_em, atualizado_por)
  values (v_org, p_canal, p_janela_ini, p_janela_fim, p_dias_uteis, p_limite_dia, p_avisar, coalesce(p_ativo,false), now(), auth.uid())
  on conflict (organizacao_id) do update set canal_id = excluded.canal_id, janela_ini = excluded.janela_ini, janela_fim = excluded.janela_fim,
    dias_uteis = excluded.dias_uteis, limite_dia = excluded.limite_dia, avisar_responsavel = excluded.avisar_responsavel,
    ativo = excluded.ativo, atualizado_em = now(), atualizado_por = auth.uid();
end $$;

-- ---------------------------------------------------------------- motor
create or replace function public.pend_preencher(p_texto text, p_pend public.pendencias)
returns text language sql stable security definer set search_path = public as $$
  select replace(replace(replace(replace(replace(coalesce(p_texto,''),
    '{primeiro_nome}', coalesce(initcap(split_part(btrim((select nome from public.contatos where id = p_pend.contato_id)), ' ', 1)), '')),
    '{pendencia}', p_pend.o_que),
    '{prazo}', coalesce(to_char(p_pend.prazo, 'DD/MM/YYYY'), '')),
    '{processo}', coalesce(p_pend.processo, '')),
    '{atendente}', coalesce(split_part(btrim((select nome from public.usuarios where id = p_pend.criado_por)), ' ', 1), ''))
$$;

/* 1 rodada: (a) quem respondeu → para tudo e avisa o encarregado; (b) despacha passos vencidos
   (janela, dias úteis, teto/dia); (c) sem lembretes e 24h sem resposta → "sem_resposta". */
create or replace function public.pendencias_tick(p_limite int default 10)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  cfg public.pendencias_config%rowtype; v_canal public.canais%rowtype;
  r record; pd public.pendencias%rowtype; b jsonb;
  v_resp int := 0; v_desp int := 0; v_sem int := 0;
  v_agora_sp timestamp; v_hoje_ini timestamptz; v_usados int; v_fila timestamptz; v_ids uuid[]; v_id uuid; v_k int;
begin
  if not pg_try_advisory_xact_lock(hashtext('pendencias_tick')) then return jsonb_build_object('ocupado', true); end if;

  for cfg in select * from public.pendencias_config where ativo loop
    -- (a) RESPOSTAS: 1ª entrada do cliente (qualquer conversa dele) depois da 1ª mensagem
    for r in
      select p.id, p.organizacao_id, p.responsavel_id, p.contato_id, mm.id msg_id, mm.criado_em, mm.conteudo, mm.tipo::text tipo
        from public.pendencias p
        cross join lateral (
          select ms.id, ms.criado_em, ms.conteudo, ms.tipo from public.mensagens ms
            join public.conversas cv on cv.id = ms.conversa_id
           where cv.contato_id = p.contato_id and cv.organizacao_id = p.organizacao_id
             and ms.direcao = 'entrada' and ms.criado_em > p.primeiro_envio_em
             and coalesce(ms.origem,'') not in ('sistema','nota_interna','teste_entrega')
           order by ms.criado_em asc limit 1) mm
       where p.organizacao_id = cfg.organizacao_id and p.status in ('aguardando','sem_resposta')
         and p.primeiro_envio_em is not null
         and (p.resposta_em is null or mm.criado_em > p.resposta_em)
    loop
      update public.pendencias set status = 'respondeu', resposta_em = r.criado_em, resposta_mensagem_id = r.msg_id,
             resposta_texto = left(coalesce(nullif(r.conteudo,''), case r.tipo when 'audio' then '🎤 Áudio' when 'imagem' then '📷 Foto'
                                when 'documento' then '📄 Documento' when 'video' then '🎬 Vídeo' else 'Mensagem' end), 300),
             atualizado_em = now() where id = r.id;
      update public.pendencias_passos set estado = 'cancelado' where pendencia_id = r.id and estado = 'agendado';
      update public.mensagens_agendadas set status = 'cancelada', cancelada_em = now(),
             metadados = metadados || jsonb_build_object('cancelado_motivo', 'cliente_respondeu')
       where status = 'agendada' and metadados->>'pendencia_id' = r.id::text;
      insert into public.pendencias_eventos (pendencia_id, organizacao_id, tipo, texto, quando)
      values (r.id, r.organizacao_id, 'respondeu', 'Cliente respondeu. Lembretes parados.', r.criado_em);
      if cfg.avisar_responsavel and r.responsavel_id is not null then
        insert into public.notificacoes (organizacao_id, usuario_id, tipo, titulo, corpo, rota, ref_id)
        values (r.organizacao_id, r.responsavel_id, 'pendencia_respondeu',
                'Cliente respondeu a pendência',
                coalesce((select nome from public.contatos where id = r.contato_id), 'Cliente') || ': ' || left(coalesce(r.conteudo,''), 120),
                '/pendencias', r.id);
      end if;
      v_resp := v_resp + 1;
    end loop;

    -- (b) DESPACHO — só com o número bom, dentro da janela e do teto do dia
    select * into v_canal from public.canais where id = cfg.canal_id;
    continue when v_canal.id is null or not v_canal.ativo or v_canal.status_integracao::text <> 'conectado'
               or coalesce(v_canal.envio_restrito,false) or v_canal.conflito_com is not null;
    v_agora_sp := now() at time zone 'America/Sao_Paulo';
    continue when v_agora_sp::time < cfg.janela_ini or v_agora_sp::time >= cfg.janela_fim;
    continue when cfg.dias_uteis and extract(isodow from v_agora_sp) > 5;
    v_hoje_ini := (v_agora_sp::date)::timestamp at time zone 'America/Sao_Paulo';
    select count(*) into v_usados from public.mensagens_agendadas
     where organizacao_id = cfg.organizacao_id and metadados->>'origem' = 'pendencia' and criado_em >= v_hoje_ini;
    -- fila do número: o próximo bloco entra depois do último já enfileirado (ordem sob o throttle 1/min)
    select greatest(now(), coalesce(max(executar_em), now())) into v_fila from public.mensagens_agendadas
     where canal_id = cfg.canal_id and status = 'agendada';

    for r in
      select s.* from public.pendencias_passos s join public.pendencias p on p.id = s.pendencia_id
       where p.organizacao_id = cfg.organizacao_id and s.estado = 'agendado' and s.quando <= now()
         and p.status = 'aguardando' and not p.pausada
       order by s.quando, s.ordem
       limit greatest(1, p_limite)
    loop
      exit when v_usados + jsonb_array_length(r.blocos) > cfg.limite_dia;
      select * into pd from public.pendencias where id = r.pendencia_id;
      v_ids := '{}'; v_k := 0;
      for b in select value from jsonb_array_elements(r.blocos) loop
        v_fila := v_fila + interval '1 minute';
        insert into public.mensagens_agendadas (organizacao_id, conversa_id, contato_id, canal_id, nome_canal_snapshot, telefone_canal_snapshot,
          criado_por, tipo, texto, storage_path, mime_type, nome_arquivo, tamanho_bytes, executar_em, metadados)
        values (pd.organizacao_id, pd.conversa_id, pd.contato_id, cfg.canal_id, v_canal.nome_interno, v_canal.numero_conectado,
          pd.criado_por, b->>'tipo',
          case when b->>'tipo' = 'audio' then null else nullif(public.pend_preencher(b->>'texto', pd), '') end,
          b->>'storage_path', b->>'mime', b->>'nome', nullif(b->>'tamanho','')::bigint,
          v_fila,
          jsonb_build_object('origem','pendencia','pendencia_id',pd.id,'passo_id',r.id,'ordem',v_k,
                             'responsavel_no_agendamento', pd.responsavel_id)
            || case when b->>'tipo' = 'audio' then jsonb_build_object('origem_audio','gravacao_painel') else '{}'::jsonb end)
        returning id into v_id;
        v_ids := v_ids || v_id; v_k := v_k + 1; v_usados := v_usados + 1;
      end loop;
      update public.pendencias_passos set estado = 'enviado', enviado_em = now(), msg_ids = v_ids where id = r.id;
      update public.pendencias set primeiro_envio_em = coalesce(primeiro_envio_em, now()), atualizado_em = now() where id = pd.id;
      insert into public.pendencias_eventos (pendencia_id, organizacao_id, tipo, texto)
      values (pd.id, pd.organizacao_id, 'enviado', case when r.avulso then 'Mensagem avulsa na fila de envio'
              when r.ordem = 0 then 'Primeira mensagem na fila de envio' else 'Lembrete na fila de envio' end);
      v_desp := v_desp + 1;
    end loop;

    -- (c) SEM RESPOSTA: nada mais agendado e o último envio foi há 24h+
    with alvo as (
      select p.id from public.pendencias p
       where p.organizacao_id = cfg.organizacao_id and p.status = 'aguardando' and p.primeiro_envio_em is not null
         and not exists (select 1 from public.pendencias_passos s where s.pendencia_id = p.id and s.estado = 'agendado')
         and (select max(enviado_em) from public.pendencias_passos s where s.pendencia_id = p.id) < now() - interval '24 hours'
    ), up as (
      update public.pendencias p set status = 'sem_resposta', atualizado_em = now() from alvo where p.id = alvo.id returning p.id, p.organizacao_id
    )
    insert into public.pendencias_eventos (pendencia_id, organizacao_id, tipo, texto)
    select id, organizacao_id, 'sem_resposta', 'Acabaram os lembretes sem resposta' from up;
    get diagnostics v_k = row_count; v_sem := v_sem + v_k;
  end loop;

  return jsonb_build_object('respostas', v_resp, 'despachados', v_desp, 'sem_resposta', v_sem);
end $$;

-- ---------------------------------------------------------------- grants
revoke all on function public.pend_exigir_membro(uuid), public.pend_org_atual(), public.pend_evento(uuid,uuid,text,text),
  public.pend_validar_blocos(uuid,jsonb), public.pend_instante(timestamptz,int,text),
  public.pend_gravar_passos(uuid,uuid,timestamptz,jsonb,boolean), public.pend_preencher(text, public.pendencias),
  public.pendencias_tick(int) from public, anon, authenticated;
grant execute on function public.pendencias_tick(int) to service_role;

revoke all on function public.pendencias_clientes_fechados(text,int), public.pendencia_criar(uuid,text,text,date,text,jsonb,timestamptz),
  public.pendencia_resolver(uuid), public.pendencia_reabrir(uuid), public.pendencia_pausar(uuid,boolean),
  public.pendencia_lembretes(uuid,jsonb,text), public.pendencia_enviar_agora(uuid,jsonb),
  public.pendencias_modelo_salvar(uuid,text,text,jsonb), public.pendencias_modelo_excluir(uuid),
  public.pendencias_config_salvar(uuid,time,time,boolean,int,boolean,boolean) from public, anon;
grant execute on function public.pendencias_clientes_fechados(text,int), public.pendencia_criar(uuid,text,text,date,text,jsonb,timestamptz),
  public.pendencia_resolver(uuid), public.pendencia_reabrir(uuid), public.pendencia_pausar(uuid,boolean),
  public.pendencia_lembretes(uuid,jsonb,text), public.pendencia_enviar_agora(uuid,jsonb),
  public.pendencias_modelo_salvar(uuid,text,text,jsonb), public.pendencias_modelo_excluir(uuid),
  public.pendencias_config_salvar(uuid,time,time,boolean,int,boolean,boolean) to authenticated;

-- ---------------------------------------------------------------- semente: config DESLIGADA no MURILLO CHIP + 3 modelos (textos de exemplo; o dono troca)
insert into public.pendencias_config (organizacao_id, canal_id, ativo)
select c.organizacao_id, c.id, false from public.canais c
 where c.numero_conectado = '555191035329' and c.ativo
on conflict (organizacao_id) do nothing;

insert into public.pendencias_modelos (organizacao_id, tipo, nome, passos)
select o.id, x.tipo, x.nome, x.passos::jsonb from public.organizacoes o
cross join (values
  ('reassinatura', 'Reassinatura', '[
    {"dia":0,"hora":"agora","blocos":[{"tipo":"texto","texto":"Olá, {primeiro_nome}! Tudo bem?"},{"tipo":"texto","texto":"No seu processo, o juiz pediu: {pendencia}. É rapidinho e resolve pelo celular. Posso te mandar o link para assinar?"}]},
    {"dia":1,"hora":"09:00","blocos":[{"tipo":"texto","texto":"{primeiro_nome}, conseguiu ver a mensagem de ontem? Preciso da sua assinatura para o processo andar."}]},
    {"dia":3,"hora":"14:00","blocos":[{"tipo":"texto","texto":"{primeiro_nome}, passando para lembrar da assinatura que o juiz pediu. Me responde aqui quando puder 🙏"}]},
    {"dia":6,"hora":"09:00","blocos":[{"tipo":"texto","texto":"Sem essa assinatura o processo fica parado. Consegue hoje?"}]}]'),
  ('documento', 'Documento novo', '[
    {"dia":0,"hora":"agora","blocos":[{"tipo":"texto","texto":"Olá, {primeiro_nome}! Tudo bem?"},{"tipo":"texto","texto":"O juiz pediu um documento novo no seu processo: {pendencia}. Pode tirar uma foto e mandar por aqui mesmo."}]},
    {"dia":1,"hora":"09:00","blocos":[{"tipo":"texto","texto":"{primeiro_nome}, conseguiu separar o documento?"}]},
    {"dia":3,"hora":"14:00","blocos":[{"tipo":"texto","texto":"{primeiro_nome}, ainda preciso daquele documento para o processo andar. Me manda por aqui quando puder 🙏"}]}]'),
  ('informacao', 'Confirmar informação', '[
    {"dia":0,"hora":"agora","blocos":[{"tipo":"texto","texto":"Olá, {primeiro_nome}! Preciso confirmar uma informação do seu processo: {pendencia}. Pode me responder?"}]},
    {"dia":2,"hora":"09:00","blocos":[{"tipo":"texto","texto":"{primeiro_nome}, consegue me confirmar aquela informação do processo?"}]}]')
) as x(tipo, nome, passos)
where not exists (select 1 from public.pendencias_modelos m where m.organizacao_id = o.id);

-- ---------------------------------------------------------------- cron (inerte enquanto pendencias_config.ativo = false)
do $$ begin
  if exists (select 1 from cron.job where jobname = 'pendencias-tick') then perform cron.unschedule('pendencias-tick'); end if;
  perform cron.schedule('pendencias-tick', '* * * * *', 'select public.pendencias_tick(10)');
end $$;
