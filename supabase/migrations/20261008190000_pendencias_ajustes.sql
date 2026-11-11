-- ============================================================================
-- PENDÊNCIAS — AJUSTES DO MOTOR (08/10/2026)
-- Corrige o que a auditoria achou na 20261008160000 (JÁ aplicada; não editar aquela).
-- Só "create or replace" / "if not exists": dá para rodar de novo sem efeito.
-- Continua INERTE: nada aqui liga pendencias_config.ativo.
--
-- O que muda, em uma frase cada:
--  * Passo tem estado 'na_fila' (entrou na fila, ainda não saiu) e 'falhou' (não saiu).
--    'enviado' agora é ENTREGUE de verdade: enviado_em = hora real do último bloco.
--  * primeiro_envio_em só é gravado quando a 1ª mensagem saiu INTEIRA (conferência).
--    Resposta no meio dos blocos (ex.: "Tudo sim" depois do "Olá") não cancela o pedido.
--  * No máximo 1 passo por pendência por rodada e 1 passo da régua por DIA. Os lembretes
--    contam a partir de quando a 1ª mensagem sai de fato (go-live, fora da janela, despausa).
--  * "Voltar a lembrar" (retomar) conta respostas só a partir do clique (lembrar_desde).
--  * Mensagem avulsa sai em aguardando, sem resposta ou respondeu, mesmo com lembretes pausados.
--  * "Mudar lembretes" não mexe na 1ª mensagem nem nas avulsas que ainda não saíram.
--  * A fila do número considera só as mensagens de pendência (agendamento alheio não atrasa).
--  * Documento não aceita mais foto (jpg/png): foto vai como Imagem (o envio recusava).
--  * Passo que dá erro (ex.: texto que fica vazio) não derruba a rodada: vira 'falhou',
--    pausa os lembretes e avisa no sino.
--  * Pausar e desligar recolhem o que ainda não saiu da fila; a detecção de resposta roda
--    mesmo com os envios desligados.
--  * Falha de envio volta para a pendência ('falhou' + pausa + aviso); "Sem resposta" só
--    depois de algo ENTREGUE.
--  * Aviso de resposta vai para o encarregado ATUAL do cliente (ou quem abriu); 1 aviso por
--    mensagem; rótulo de mídia sem emoji ("Foto", "Áudio"...).
--  * {primeiro_nome} que não é nome (ex.: telefone) vira saudação neutra.
--  * Reabrir antes de qualquer envio volta a ser pendência nova (não "sem resposta").
--  * Ajustes: só número Evolution ativo; ligar exige número conectado; teto 8..500;
--    trocar o número leva as pendências em andamento junto.
--  * Corrida tick × resolver/pausar/trocar: o tick trava a pendência (skip locked).
--  * Excluir mensagem pronta: só administrador ou supervisor.
-- ============================================================================

-- ---------------------------------------------------------------- esquema
alter table public.pendencias add column if not exists lembrar_desde timestamptz;
comment on column public.pendencias.lembrar_desde is
  'Marco do ciclo de lembretes atual ("Voltar a lembrar"). Resposta só conta depois de greatest(primeiro_envio_em, lembrar_desde).';
comment on column public.pendencias.primeiro_envio_em is
  'Hora em que a 1ª mensagem (passo inteiro) foi ENTREGUE. Gravada pela conferência (pend_conferir), nunca ao enfileirar.';

alter table public.pendencias_passos drop constraint if exists pendencias_passos_estado_check;
alter table public.pendencias_passos add constraint pendencias_passos_estado_check
  check (estado in ('agendado','na_fila','enviado','falhou','cancelado'));
comment on column public.pendencias_passos.enviado_em is
  'na_fila: hora em que entrou na fila. enviado: hora real em que o último bloco saiu.';
create index if not exists pendencias_passos_na_fila on public.pendencias_passos (pendencia_id) where estado = 'na_fila';

-- ---------------------------------------------------------------- helpers
/* sábado/domingo → segunda, mesma hora (mesma regra do pend_gravar_passos) */
create or replace function public.pend_dia_util(p_org uuid, p_ts timestamptz)
returns timestamptz language plpgsql stable set search_path = public as $$
declare v timestamptz := p_ts;
begin
  if v is not null and coalesce((select dias_uteis from public.pendencias_config where organizacao_id = p_org), true) then
    while extract(isodow from v at time zone 'America/Sao_Paulo') > 5 loop v := v + interval '1 day'; end loop;
  end if;
  return v;
end $$;

/* valida os blocos de um passo. Documento = só arquivo de documento (igual ao evolution-send);
   foto vai como bloco Imagem. */
create or replace function public.pend_validar_blocos(p_org uuid, p_blocos jsonb)
returns jsonb language plpgsql stable set search_path = public as $$
declare
  b jsonb; v_tipo text; v_texto text; v_path text; v_mime text; v_nome text; v_tam bigint; v_ext text;
  v_out jsonb := '[]'::jsonb;
  doc_exts text[] := array['pdf','doc','docx','xls','xlsx','txt','csv','ppt','pptx','zip'];
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

/* variáveis da mensagem. {primeiro_nome} só vira nome quando a 1ª palavra é nome de verdade
   (letras, 2+); telefone/apelido com número → saudação neutra ("Olá! Tudo bem?"). */
create or replace function public.pend_preencher(p_texto text, p_pend public.pendencias)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  t text := coalesce(p_texto, '');
  v_nome text := initcap(split_part(btrim(coalesce((select nome from public.contatos where id = p_pend.contato_id), '')), ' ', 1));
begin
  if v_nome ~ '^[A-Za-zÀ-ÖØ-öø-ÿ''-]{2,}$' then
    t := replace(t, '{primeiro_nome}', v_nome);
  else
    if t ~ '^\s*\{primeiro_nome\}' then
      t := btrim(regexp_replace(t, '^\s*\{primeiro_nome\}\s*,?\s*', ''));   -- "{primeiro_nome}, conseguiu" → "Conseguiu"
      t := upper(left(t, 1)) || substr(t, 2);
    end if;
    t := regexp_replace(t, '[ ,]*\{primeiro_nome\}', '', 'g');               -- "Olá, {primeiro_nome}!" → "Olá!"
  end if;
  return replace(replace(replace(replace(t,
    '{pendencia}', p_pend.o_que),
    '{prazo}', coalesce(to_char(p_pend.prazo, 'DD/MM/YYYY'), '')),
    '{processo}', coalesce(p_pend.processo, '')),
    '{atendente}', coalesce(split_part(btrim((select nome from public.usuarios where id = p_pend.criado_por)), ' ', 1), ''));
end $$;

/* mensagem da pendência que não saiu: pausa os lembretes (se aguardando), registra e avisa no sino
   quem cuida (encarregado e quem abriu, se ainda são da equipe; senão, a org toda). */
create or replace function public.pend_falha(p_pend uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare v public.pendencias%rowtype; v_corpo text; v_u uuid; v_n int := 0;
begin
  select * into v from public.pendencias where id = p_pend;
  if v.id is null then return; end if;
  update public.pendencias set pausada = true, atualizado_em = now() where id = p_pend and status = 'aguardando';
  insert into public.pendencias_eventos (pendencia_id, organizacao_id, tipo, texto)
  values (p_pend, v.organizacao_id, 'falhou',
          'A mensagem não saiu' || coalesce(' (' || left(nullif(btrim(p_motivo), ''), 120) || ')', '')
          || case when v.status = 'aguardando' then '. Lembretes pausados.' else '.' end);
  if v.status = 'resolvida' then return; end if;   -- já resolvida: só registra, sem aviso
  v_corpo := coalesce((select nome from public.contatos where id = v.contato_id), 'Cliente') || ': '
             || coalesce(left(nullif(btrim(p_motivo), ''), 80), 'erro no envio') || '. Confira e mande de novo.';
  for v_u in
    select distinct t.u from unnest(array[v.responsavel_id, v.criado_por]) t(u)
     where t.u is not null and exists (select 1 from public.organizacao_usuarios ou
                                        where ou.organizacao_id = v.organizacao_id and ou.usuario_id = t.u and ou.status = 'ativo')
  loop
    insert into public.notificacoes (organizacao_id, usuario_id, tipo, titulo, corpo, rota, ref_id)
    values (v.organizacao_id, v_u, 'pendencia_falhou', 'Mensagem da pendência não saiu', v_corpo, '/pendencias', p_pend);
    v_n := v_n + 1;
  end loop;
  if v_n = 0 then
    insert into public.notificacoes (organizacao_id, usuario_id, tipo, titulo, corpo, rota, ref_id)
    values (v.organizacao_id, null, 'pendencia_falhou', 'Mensagem da pendência não saiu', v_corpo, '/pendencias', p_pend);
  end if;
end $$;

/* CONFERÊNCIA: lê o destino das linhas na fila e fecha o passo 'na_fila'.
   - algum bloco falhou/bloqueou/expirou (ou preso em 'processando' há 1h+) → passo 'falhou',
     cancela o resto do passo (não manda o bloco 2 sem o 1), pausa e avisa;
   - tudo saiu (nada pendente, ao menos 1 'enviada') → 'enviado' com a hora REAL; a 1ª entrega
     grava primeiro_envio_em;
   - tudo cancelado antes de sair → 'cancelado'. */
create or replace function public.pend_conferir(p_pend uuid default null)
returns int language plpgsql security definer set search_path = public as $$
declare r record; v_n int := 0;
begin
  for r in
    select s.id, s.pendencia_id, s.msg_ids,
           count(m.id) filter (where m.status = 'enviada') ok,
           count(m.id) filter (where m.status in ('falhou','bloqueada','expirada')
                                 or (m.status = 'processando' and m.atualizado_em < now() - interval '1 hour')) ruim,
           count(m.id) filter (where m.status = 'agendada'
                                 or (m.status = 'processando' and m.atualizado_em >= now() - interval '1 hour')) pend,
           max(m.enviada_em) ult,
           max(coalesce(nullif(m.motivo_bloqueio, ''), nullif(m.ultimo_erro, '')))
             filter (where m.status in ('falhou','bloqueada','expirada','processando')) motivo
      from public.pendencias_passos s
      left join public.mensagens_agendadas m on m.id = any(s.msg_ids)
     where s.estado = 'na_fila' and (p_pend is null or s.pendencia_id = p_pend)
     group by s.id
  loop
    continue when r.ruim = 0 and r.pend > 0;                       -- ainda saindo
    -- trava a pendência antes do passo (mesma ordem das RPCs); ocupada → próxima rodada
    perform 1 from public.pendencias where id = r.pendencia_id for update skip locked;
    continue when not found;
    if r.ruim > 0 then
      update public.pendencias_passos set estado = 'falhou' where id = r.id and estado = 'na_fila';
      continue when not found;
      update public.mensagens_agendadas set status = 'cancelada', cancelada_em = now(),
             metadados = metadados || jsonb_build_object('cancelado_motivo', 'passo_falhou')
       where id = any(r.msg_ids) and status = 'agendada';
      perform public.pend_falha(r.pendencia_id, r.motivo);
    elsif r.ok > 0 then
      update public.pendencias_passos set estado = 'enviado', enviado_em = r.ult where id = r.id and estado = 'na_fila';
      continue when not found;
      update public.pendencias set primeiro_envio_em = coalesce(primeiro_envio_em, r.ult), atualizado_em = now()
       where id = r.pendencia_id;
    else
      update public.pendencias_passos set estado = 'cancelado' where id = r.id and estado = 'na_fila';
      continue when not found;
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

/* recolhe da fila o que ainda NÃO começou a sair (passo com bloco 'enviada'/'processando' termina:
   mensagem começada não é cortada). O passo do qual nada saiu volta a 'agendado' e sai ao
   retomar/religar. p_com_avulsa=false preserva as avulsas (pedido explícito do atendente). */
create or replace function public.pend_recolher_fila(p_org uuid, p_pend uuid, p_motivo text, p_com_avulsa boolean default true)
returns int language plpgsql security definer set search_path = public as $$
declare v_passos uuid[]; v_n int;
begin
  with c as (
    update public.mensagens_agendadas m
       set status = 'cancelada', cancelada_em = now(), cancelada_por = auth.uid(),
           metadados = m.metadados || jsonb_build_object('cancelado_motivo', p_motivo)
     where m.status = 'agendada' and m.organizacao_id = p_org and m.metadados->>'origem' = 'pendencia'
       and (p_pend is null or m.metadados->>'pendencia_id' = p_pend::text)
       and exists (select 1 from public.pendencias_passos s
                    where s.id = (m.metadados->>'passo_id')::uuid and (p_com_avulsa or not s.avulso)
                      and not exists (select 1 from public.mensagens_agendadas m2
                                       where m2.id = any(s.msg_ids) and m2.status in ('enviada','processando')))
    returning (m.metadados->>'passo_id')::uuid passo
  ) select coalesce(array_agg(distinct passo), '{}'), count(*) into v_passos, v_n from c;
  if v_n = 0 then return 0; end if;
  -- comando separado: precisa enxergar as linhas já canceladas acima
  update public.pendencias_passos s set estado = 'agendado', enviado_em = null, msg_ids = '{}'
   where s.id = any(v_passos) and s.estado = 'na_fila'
     and not exists (select 1 from public.mensagens_agendadas m where m.id = any(s.msg_ids) and m.status <> 'cancelada');
  return v_n;
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
  if v_canal.id is null or not v_canal.ativo or v_canal.status_integracao::text = 'removido'
     or coalesce(v_canal.transporte, '') <> 'evolution' then raise exception 'numero_pendencias_invalido'; end if;

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

  -- cliente sem encarregado: a pendência fica com quem abriu (aparece no "Minhas" e recebe o aviso)
  insert into public.pendencias (organizacao_id, contato_id, oportunidade_id, conversa_id, canal_id, tipo, o_que, prazo,
                                 processo, responsavel_id, criado_por)
  values (v_org, p_contato, v_opp, v_conv, v_canal.id, p_tipo, btrim(p_o_que), p_prazo,
          nullif(btrim(coalesce(p_processo,'')), ''), coalesce(v_resp, auth.uid()), auth.uid())
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
  update public.mensagens_agendadas set status = 'cancelada', cancelada_em = now(), cancelada_por = auth.uid(),
         metadados = metadados || jsonb_build_object('cancelado_motivo', 'resolvida')
   where status = 'agendada' and metadados->>'pendencia_id' = p_id::text;
  perform public.pend_conferir(p_id);   -- passo na fila do qual nada saiu → 'cancelado'
  perform public.pend_evento(p_id, v_org, 'resolvida', 'Marcada como resolvida');
end $$;

/* reabrir: se NADA saiu, volta a ser pendência nova (1ª mensagem agora, ou na data marcada se
   ainda for futura); se saiu, volta para respondeu/sem resposta. Idempotente. */
create or replace function public.pendencia_reabrir(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_resp timestamptz; v_prim timestamptz; v_status text; v_passos jsonb; v_base timestamptz; v_saiu boolean;
begin
  select organizacao_id, resposta_em, primeiro_envio_em, status into v_org, v_resp, v_prim, v_status
    from public.pendencias where id = p_id for update;
  if v_org is null then raise exception 'pendencia_nao_encontrada'; end if;
  perform public.pend_exigir_membro(v_org);
  if v_status <> 'resolvida' then return; end if;
  v_saiu := v_prim is not null
            or exists (select 1 from public.pendencias_passos where pendencia_id = p_id and estado in ('na_fila','enviado'));
  if not v_saiu then
    select jsonb_agg(jsonb_build_object('dia', s.dia, 'hora', s.hora, 'blocos', s.blocos) order by s.ordem),
           greatest(now(), (array_agg(s.quando order by s.ordem))[1])
      into v_passos, v_base
      from public.pendencias_passos s
     where s.pendencia_id = p_id and s.estado in ('cancelado','falhou') and not s.avulso;
    if v_passos is not null then
      -- nada a preservar (nada saiu): apaga e regrava; a ordem volta a começar em 0
      delete from public.pendencias_passos where pendencia_id = p_id and estado in ('cancelado','falhou');
      perform public.pend_gravar_passos(p_id, v_org, v_base, v_passos, true);
    end if;
  end if;
  update public.pendencias set status = case when v_resp is not null then 'respondeu'
                                             when not v_saiu and v_passos is not null then 'aguardando'
                                             else 'sem_resposta' end,
         resolvida_em = null, resolvida_por = null, atualizado_em = now() where id = p_id;
  perform public.pend_evento(p_id, v_org, 'reaberta', 'Reaberta');
end $$;

/* pausar recolhe da fila os lembretes que ainda não começaram a sair (avulsa segue: é pedido explícito) */
create or replace function public.pendencia_pausar(p_id uuid, p_pausar boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  select organizacao_id into v_org from public.pendencias where id = p_id for update;
  if v_org is null then raise exception 'pendencia_nao_encontrada'; end if;
  perform public.pend_exigir_membro(v_org);
  update public.pendencias set pausada = p_pausar, atualizado_em = now() where id = p_id;
  if p_pausar then perform public.pend_recolher_fila(v_org, p_id, 'pausada', false); end if;
  perform public.pend_evento(p_id, v_org, case when p_pausar then 'pausada' else 'retomada' end,
                             case when p_pausar then 'Lembretes pausados' else 'Lembretes retomados' end);
end $$;

/* p_modo 'trocar': troca só os LEMBRETES que ainda não saíram (a 1ª mensagem e as avulsas ficam);
     dias contados da 1ª mensagem (entregue, na fila ou ainda agendada) ou do último "Voltar a lembrar".
   p_modo 'retomar': novos lembretes a partir de agora; respostas só contam depois do clique. */
create or replace function public.pendencia_lembretes(p_id uuid, p_passos jsonb, p_modo text)
returns int language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_base timestamptz; v_n int; v_status text; v_contato uuid; v_desde timestamptz;
begin
  select p.organizacao_id, p.status, p.contato_id, greatest(p.primeiro_envio_em, p.lembrar_desde),
         coalesce(greatest(p.primeiro_envio_em, p.lembrar_desde),
                  (select coalesce(s.enviado_em, s.quando) from public.pendencias_passos s where s.pendencia_id = p.id and s.ordem = 0),
                  p.criado_em)
    into v_org, v_status, v_contato, v_desde, v_base
    from public.pendencias p where p.id = p_id for update;
  if v_org is null then raise exception 'pendencia_nao_encontrada'; end if;
  perform public.pend_exigir_membro(v_org);
  if p_modo not in ('trocar','retomar') then raise exception 'modo_invalido'; end if;
  if v_status = 'resolvida' then raise exception 'pendencia_resolvida'; end if;
  -- o cliente respondeu e o motor ainda não viu (até 1 min): não reprograma por cima da resposta
  if p_modo = 'retomar' and v_status <> 'respondeu' and v_desde is not null and exists (
       select 1 from public.mensagens ms join public.conversas cv on cv.id = ms.conversa_id
        where cv.contato_id = v_contato and cv.organizacao_id = v_org and ms.direcao = 'entrada'
          and ms.criado_em > v_desde and coalesce(ms.origem,'') not in ('sistema','nota_interna','teste_entrega')) then
    raise exception 'cliente_respondeu';
  end if;
  delete from public.pendencias_passos
   where pendencia_id = p_id and estado = 'agendado' and not avulso and (p_modo = 'retomar' or ordem > 0);
  if p_modo = 'retomar' then v_base := now(); end if;
  v_n := public.pend_gravar_passos(p_id, v_org, v_base, p_passos, false);
  if p_modo = 'retomar' then
    update public.pendencias set status = 'aguardando', pausada = false, resposta_texto = null, resposta_em = null,
           resposta_mensagem_id = null, lembrar_desde = now(), atualizado_em = now() where id = p_id;
  end if;
  perform public.pend_evento(p_id, v_org, 'lembretes', case when p_modo = 'trocar' then 'Lembretes alterados' else 'Lembretes programados de novo' end);
  return v_n;
end $$;

/* mensagem avulsa: passo 'agora'; o tick despacha no próximo minuto (se ligado), em qualquer status
   menos resolvida, mesmo com lembretes pausados */
create or replace function public.pendencia_enviar_agora(p_id uuid, p_blocos jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_ord int; v_status text;
begin
  select organizacao_id, status into v_org, v_status from public.pendencias where id = p_id for update;
  if v_org is null then raise exception 'pendencia_nao_encontrada'; end if;
  perform public.pend_exigir_membro(v_org);
  if v_status = 'resolvida' then raise exception 'pendencia_resolvida'; end if;
  select coalesce(max(ordem), -1) + 1 into v_ord from public.pendencias_passos where pendencia_id = p_id;
  insert into public.pendencias_passos (pendencia_id, organizacao_id, ordem, dia, hora, blocos, quando, avulso)
  values (p_id, v_org, v_ord, 0, 'agora', public.pend_validar_blocos(v_org, p_blocos), now(), true);
  perform public.pend_evento(p_id, v_org, 'avulsa', 'Mensagem avulsa na fila');
end $$;

-- ---------------------------------------------------------------- modelos e ajustes
/* excluir mensagem pronta: só administrador ou supervisor (criar/editar segue livre para a equipe) */
create or replace function public.pendencias_modelo_excluir(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid := public.pend_org_atual();
begin
  perform public.pend_exigir_membro(v_org);
  if not (coalesce(public.is_platform_admin(), false) or coalesce(public.papel_na_org(v_org)::text, '') in ('admin','supervisor')) then
    raise exception 'so_gestor_exclui';
  end if;
  delete from public.pendencias_modelos where id = p_id and organizacao_id = v_org;
end $$;

/* ajustes: só admin da org. Número = Evolution ativo e não removido; LIGAR exige número conectado.
   Desligar recolhe a fila; trocar o número recolhe a fila e leva as pendências em andamento junto. */
create or replace function public.pendencias_config_salvar(p_canal uuid, p_janela_ini time, p_janela_fim time,
  p_dias_uteis boolean, p_limite_dia int, p_avisar boolean, p_ativo boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid := public.pend_org_atual(); v_c public.canais%rowtype; v_antes public.pendencias_config%rowtype;
begin
  perform public.pend_exigir_membro(v_org);
  if not (public.is_platform_admin() or exists (select 1 from public.organizacao_usuarios
          where organizacao_id = v_org and usuario_id = auth.uid() and status = 'ativo' and papel = 'admin')) then
    raise exception 'so_admin';
  end if;
  if p_janela_ini is null or p_janela_fim is null or p_janela_fim <= p_janela_ini then raise exception 'janela_invalida'; end if;
  if p_limite_dia is null or p_limite_dia < 8 or p_limite_dia > 500 then raise exception 'limite_invalido'; end if;
  if coalesce(p_ativo, false) and p_canal is null then raise exception 'ligar_sem_numero'; end if;
  if p_canal is not null then
    select * into v_c from public.canais where id = p_canal and organizacao_id = v_org;
    if v_c.id is null or not v_c.ativo or v_c.status_integracao::text = 'removido'
       or coalesce(v_c.transporte, '') <> 'evolution' then raise exception 'canal_invalido'; end if;
  end if;

  -- espera a rodada do motor em curso terminar (o tick só tenta a trava e pula a rodada enquanto isto roda)
  perform pg_advisory_xact_lock(hashtext('pendencias_tick'));
  select * into v_antes from public.pendencias_config where organizacao_id = v_org for update;
  if coalesce(p_ativo, false) and not coalesce(v_antes.ativo, false) and v_c.status_integracao::text <> 'conectado' then
    raise exception 'numero_desconectado';
  end if;

  insert into public.pendencias_config as c (organizacao_id, canal_id, janela_ini, janela_fim, dias_uteis, limite_dia, avisar_responsavel, ativo, atualizado_em, atualizado_por)
  values (v_org, p_canal, p_janela_ini, p_janela_fim, coalesce(p_dias_uteis, true), p_limite_dia, coalesce(p_avisar, true), coalesce(p_ativo,false), now(), auth.uid())
  on conflict (organizacao_id) do update set canal_id = excluded.canal_id, janela_ini = excluded.janela_ini, janela_fim = excluded.janela_fim,
    dias_uteis = excluded.dias_uteis, limite_dia = excluded.limite_dia, avisar_responsavel = excluded.avisar_responsavel,
    ativo = excluded.ativo, atualizado_em = now(), atualizado_por = auth.uid();

  if not coalesce(p_ativo, false) or p_canal is distinct from v_antes.canal_id then
    perform public.pend_recolher_fila(v_org, null,
      case when coalesce(p_ativo, false) then 'numero_trocado' else 'envios_desligados' end, true);
  end if;
  if p_canal is not null and v_antes.canal_id is distinct from p_canal then
    with up as (
      update public.pendencias set canal_id = p_canal, atualizado_em = now()
       where organizacao_id = v_org and status <> 'resolvida' and canal_id <> p_canal returning id
    )
    insert into public.pendencias_eventos (pendencia_id, organizacao_id, tipo, texto, autor_id)
    select id, v_org, 'numero', 'Número das pendências trocado', auth.uid() from up;
  end if;
end $$;

-- ---------------------------------------------------------------- motor
/* 1 rodada:
   (0) conferência das linhas na fila (todas as orgs, ligadas ou não);
   (a) respostas (roda mesmo com os envios desligados);
   (b) despacho — só ligado, número bom, dentro da janela e do teto do dia; 1 passo por pendência
       por rodada, 1 passo da régua por dia; erro num passo não derruba a rodada;
   (c) sem lembretes e 24h desde a última ENTREGA → "sem_resposta". */
create or replace function public.pendencias_tick(p_limite int default 10)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  cfg public.pendencias_config%rowtype; v_canal public.canais%rowtype;
  r record; pd public.pendencias%rowtype; b jsonb;
  v_resp int := 0; v_desp int := 0; v_sem int := 0; v_conf int := 0; v_err int := 0;
  v_agora_sp timestamp; v_hoje_ini timestamptz; v_usados int; v_fila timestamptz; v_ids uuid[]; v_id uuid; v_k int;
  v_ult timestamptz; v_pula int; v_txt text; v_fila0 timestamptz; v_usados0 int;
  v_rot text; v_dest uuid; v_chave text; v_avisados text[] := '{}';
begin
  if not pg_try_advisory_xact_lock(hashtext('pendencias_tick')) then return jsonb_build_object('ocupado', true); end if;

  -- (0) CONFERÊNCIA: 'na_fila' → enviado (hora real) / falhou / cancelado
  v_conf := public.pend_conferir(null);

  for cfg in select * from public.pendencias_config loop
    -- (a) RESPOSTAS: 1ª entrada do cliente (qualquer conversa dele) depois da 1ª mensagem ENTREGUE
    --     (ou do último "Voltar a lembrar")
    for r in
      select p.id, p.organizacao_id, p.responsavel_id, p.contato_id, p.criado_por,
             (select c.responsavel_id from public.contatos c where c.id = p.contato_id) resp_atual,
             mm.id msg_id, mm.criado_em, mm.conteudo, mm.tipo::text tipo
        from public.pendencias p
        cross join lateral (
          select ms.id, ms.criado_em, ms.conteudo, ms.tipo from public.mensagens ms
            join public.conversas cv on cv.id = ms.conversa_id
           where cv.contato_id = p.contato_id and cv.organizacao_id = p.organizacao_id
             and ms.direcao = 'entrada' and ms.criado_em > greatest(p.primeiro_envio_em, p.lembrar_desde)
             and coalesce(ms.origem,'') not in ('sistema','nota_interna','teste_entrega')
           order by ms.criado_em asc limit 1) mm
       where p.organizacao_id = cfg.organizacao_id and p.status in ('aguardando','sem_resposta')
         and p.primeiro_envio_em is not null
       for update of p skip locked
    loop
      v_rot := left(coalesce(nullif(btrim(r.conteudo), ''),
                             case r.tipo when 'audio' then 'Áudio' when 'imagem' then 'Foto' when 'documento' then 'Documento'
                                         when 'video' then 'Vídeo' else 'Mensagem' end), 300);
      -- quem cuida agora: encarregado ATUAL do cliente → o da pendência → quem abriu (o 1º que ainda é
      -- da equipe; ninguém → a org toda)
      v_dest := null;
      select t.u into v_dest from unnest(array[r.resp_atual, r.responsavel_id, r.criado_por]) with ordinality t(u, i)
       where t.u is not null and exists (select 1 from public.organizacao_usuarios ou
                                          where ou.organizacao_id = r.organizacao_id and ou.usuario_id = t.u and ou.status = 'ativo')
       order by t.i limit 1;
      update public.pendencias set status = 'respondeu', resposta_em = r.criado_em, resposta_mensagem_id = r.msg_id,
             resposta_texto = v_rot, atualizado_em = now(),
             responsavel_id = case when v_dest is not null and v_dest = r.resp_atual then v_dest else responsavel_id end
       where id = r.id and status in ('aguardando','sem_resposta');
      continue when not found;
      -- para os lembretes; avulsa (pedido do atendente) e passo que já começou a sair seguem
      update public.pendencias_passos set estado = 'cancelado' where pendencia_id = r.id and estado = 'agendado' and not avulso;
      update public.mensagens_agendadas m set status = 'cancelada', cancelada_em = now(),
             metadados = m.metadados || jsonb_build_object('cancelado_motivo', 'cliente_respondeu')
       where m.status = 'agendada' and m.metadados->>'pendencia_id' = r.id::text
         and exists (select 1 from public.pendencias_passos s
                      where s.id = (m.metadados->>'passo_id')::uuid and not s.avulso
                        and not exists (select 1 from public.mensagens_agendadas m2
                                         where m2.id = any(s.msg_ids) and m2.status in ('enviada','processando')));
      perform public.pend_conferir(r.id);
      insert into public.pendencias_eventos (pendencia_id, organizacao_id, tipo, texto, quando)
      values (r.id, r.organizacao_id, 'respondeu', 'Cliente respondeu. Lembretes parados.', r.criado_em);
      -- aviso: 1 por mensagem por pessoa (cliente com 2 pendências que manda 1 foto = 1 aviso)
      if cfg.avisar_responsavel then
        v_chave := r.msg_id::text || ':' || coalesce(v_dest::text, 'org');
        if not (v_chave = any(v_avisados)) then
          v_avisados := v_avisados || v_chave;
          insert into public.notificacoes (organizacao_id, usuario_id, tipo, titulo, corpo, rota, ref_id)
          values (r.organizacao_id, v_dest, 'pendencia_respondeu', 'Cliente respondeu a pendência',
                  coalesce((select nome from public.contatos where id = r.contato_id), 'Cliente') || ': ' || left(v_rot, 120),
                  '/pendencias', r.id);
        end if;
      end if;
      v_resp := v_resp + 1;
    end loop;

    -- daqui em diante só com os envios ligados
    continue when not cfg.ativo;

    -- (b) DESPACHO — só com o número bom, dentro da janela e do teto do dia
    select * into v_canal from public.canais where id = cfg.canal_id;
    continue when v_canal.id is null or not v_canal.ativo or v_canal.status_integracao::text <> 'conectado'
               or coalesce(v_canal.envio_restrito,false) or v_canal.conflito_com is not null
               or coalesce(v_canal.transporte, '') <> 'evolution';
    v_agora_sp := now() at time zone 'America/Sao_Paulo';
    continue when v_agora_sp::time < cfg.janela_ini or v_agora_sp::time >= cfg.janela_fim;
    continue when cfg.dias_uteis and extract(isodow from v_agora_sp) > 5;
    v_hoje_ini := (v_agora_sp::date)::timestamp at time zone 'America/Sao_Paulo';
    -- teto do dia: só o que pode ter saído (cancelada/expirada/bloqueada não conta)
    select count(*) into v_usados from public.mensagens_agendadas
     where organizacao_id = cfg.organizacao_id and metadados->>'origem' = 'pendencia' and criado_em >= v_hoje_ini
       and status not in ('cancelada','expirada','bloqueada');
    -- fila das PENDÊNCIAS no número: o próximo bloco entra depois do último bloco de pendência já na fila
    -- (agendamento de outra função no mesmo número, ex. para daqui a 7 dias, não prende nada)
    select greatest(now(), coalesce(max(executar_em), now())) into v_fila from public.mensagens_agendadas
     where canal_id = cfg.canal_id and status = 'agendada' and metadados->>'origem' = 'pendencia';

    for r in
      select x.* from (
        select distinct on (s.pendencia_id) s.*                -- no máximo 1 passo por pendência por rodada
          from public.pendencias_passos s join public.pendencias p on p.id = s.pendencia_id
         where p.organizacao_id = cfg.organizacao_id and s.estado = 'agendado' and s.quando <= now()
           and p.status <> 'resolvida' and (s.avulso or (p.status = 'aguardando' and not p.pausada))
         order by s.pendencia_id, s.quando, s.ordem) x
       order by x.quando, x.ordem
       limit greatest(1, p_limite)
    loop
      -- trava a pendência (as RPCs travam a mesma linha antes de mexer); ocupada → próxima rodada
      select * into pd from public.pendencias where id = r.pendencia_id for update skip locked;
      continue when not found;
      continue when pd.status = 'resolvida' or not (r.avulso or (pd.status = 'aguardando' and not pd.pausada));

      -- régua: no máximo 1 passo por DIA. Lembrete vencido no mesmo dia de outro passo da régua
      -- (pausa, teto do dia, fim de semana) vai para o dia seguinte levando os seguintes junto.
      if not r.avulso and r.hora <> 'agora' then
        select max(s.enviado_em) into v_ult from public.pendencias_passos s
         where s.pendencia_id = r.pendencia_id and s.estado in ('na_fila','enviado') and not s.avulso;
        if v_ult is not null and (v_ult at time zone 'America/Sao_Paulo')::date >= v_agora_sp::date then
          v_pula := (v_agora_sp::date + 1) - (r.quando at time zone 'America/Sao_Paulo')::date;
          update public.pendencias_passos s
             set quando = public.pend_dia_util(cfg.organizacao_id, s.quando + make_interval(days => v_pula))
           where s.pendencia_id = r.pendencia_id and s.estado = 'agendado' and not s.avulso
             and (s.quando, s.ordem) >= (r.quando, r.ordem);
          continue;
        end if;
      end if;

      -- teto do dia (um passo maior que o teto sai sozinho num dia ainda sem envio, em vez de travar)
      exit when v_usados > 0 and v_usados + jsonb_array_length(r.blocos) > cfg.limite_dia;

      -- reivindica o passo: 'na_fila' com a hora em que entrou na fila
      update public.pendencias_passos set estado = 'na_fila', enviado_em = now() where id = r.id and estado = 'agendado';
      continue when not found;

      v_fila0 := v_fila; v_usados0 := v_usados;
      begin
        v_ids := '{}'; v_k := 0;
        for b in select value from jsonb_array_elements(r.blocos) loop
          v_txt := case when b->>'tipo' = 'audio' then null else nullif(btrim(public.pend_preencher(b->>'texto', pd)), '') end;
          continue when v_txt is null and nullif(b->>'storage_path', '') is null;   -- texto que ficou vazio: pula
          v_fila := v_fila + interval '1 minute';
          insert into public.mensagens_agendadas (organizacao_id, conversa_id, contato_id, canal_id, nome_canal_snapshot, telefone_canal_snapshot,
            criado_por, tipo, texto, storage_path, mime_type, nome_arquivo, tamanho_bytes, executar_em, metadados)
          values (pd.organizacao_id, pd.conversa_id, pd.contato_id, cfg.canal_id, v_canal.nome_interno, v_canal.numero_conectado,
            pd.criado_por, b->>'tipo', v_txt,
            b->>'storage_path', b->>'mime', b->>'nome', nullif(b->>'tamanho','')::bigint,
            v_fila,
            jsonb_build_object('origem','pendencia','pendencia_id',pd.id,'passo_id',r.id,'ordem',v_k,
                               'responsavel_no_agendamento', pd.responsavel_id)
              || case when b->>'tipo' = 'audio' then jsonb_build_object('origem_audio','gravacao_painel') else '{}'::jsonb end)
          returning id into v_id;
          v_ids := v_ids || v_id; v_k := v_k + 1; v_usados := v_usados + 1;
        end loop;
        if v_k = 0 then raise exception 'passo_ficou_vazio'; end if;
        update public.pendencias_passos set msg_ids = v_ids where id = r.id;
        update public.pendencias set atualizado_em = now() where id = pd.id;
        -- a 1ª mensagem saiu agora: os lembretes passam a contar daqui (go-live, fora da janela, data marcada)
        if not r.avulso and r.hora = 'agora' then
          update public.pendencias_passos s
             set quando = public.pend_dia_util(cfg.organizacao_id, public.pend_instante(now(), greatest(1, s.dia), s.hora))
           where s.pendencia_id = pd.id and s.estado = 'agendado' and not s.avulso and s.hora <> 'agora';
        end if;
        insert into public.pendencias_eventos (pendencia_id, organizacao_id, tipo, texto)
        values (pd.id, pd.organizacao_id, 'enviado', case when r.avulso then 'Mensagem avulsa na fila de envio'
                when r.ordem = 0 then 'Primeira mensagem na fila de envio' else 'Lembrete na fila de envio' end);
        v_desp := v_desp + 1;
      exception when others then
        -- o savepoint já desfez as linhas deste passo na fila; o resto da rodada segue
        v_fila := v_fila0; v_usados := v_usados0;
        update public.pendencias_passos set estado = 'falhou' where id = r.id;
        perform public.pend_falha(pd.id, case when sqlerrm = 'passo_ficou_vazio' then 'ficou sem texto'
                                              else left(sqlerrm, 120) end);
        v_err := v_err + 1;
      end;
    end loop;

    -- (c) SEM RESPOSTA: nada mais agendado nem na fila e a última ENTREGA foi há 24h+
    with alvo as (
      select p.id from public.pendencias p
       where p.organizacao_id = cfg.organizacao_id and p.status = 'aguardando' and not p.pausada
         and p.primeiro_envio_em is not null
         and not exists (select 1 from public.pendencias_passos s where s.pendencia_id = p.id and s.estado in ('agendado','na_fila'))
         and (select max(s.enviado_em) from public.pendencias_passos s
               where s.pendencia_id = p.id and s.estado = 'enviado') < now() - interval '24 hours'
    ), up as (
      update public.pendencias p set status = 'sem_resposta', atualizado_em = now()
        from alvo where p.id = alvo.id and p.status = 'aguardando' and not p.pausada
      returning p.id, p.organizacao_id
    )
    insert into public.pendencias_eventos (pendencia_id, organizacao_id, tipo, texto)
    select id, organizacao_id, 'sem_resposta', 'Acabaram os lembretes sem resposta' from up;
    get diagnostics v_k = row_count; v_sem := v_sem + v_k;
  end loop;

  return jsonb_build_object('respostas', v_resp, 'despachados', v_desp, 'sem_resposta', v_sem,
                            'conferidos', v_conf, 'erros', v_err);
end $$;

-- ---------------------------------------------------------------- grants (iguais aos da 20261008160000 + helpers novos)
revoke all on function public.pend_dia_util(uuid,timestamptz), public.pend_validar_blocos(uuid,jsonb),
  public.pend_preencher(text, public.pendencias), public.pend_falha(uuid,text), public.pend_conferir(uuid),
  public.pend_recolher_fila(uuid,uuid,text,boolean), public.pendencias_tick(int) from public, anon, authenticated;
grant execute on function public.pendencias_tick(int) to service_role;

revoke all on function public.pendencia_criar(uuid,text,text,date,text,jsonb,timestamptz),
  public.pendencia_resolver(uuid), public.pendencia_reabrir(uuid), public.pendencia_pausar(uuid,boolean),
  public.pendencia_lembretes(uuid,jsonb,text), public.pendencia_enviar_agora(uuid,jsonb),
  public.pendencias_modelo_excluir(uuid),
  public.pendencias_config_salvar(uuid,time,time,boolean,int,boolean,boolean) from public, anon;
grant execute on function public.pendencia_criar(uuid,text,text,date,text,jsonb,timestamptz),
  public.pendencia_resolver(uuid), public.pendencia_reabrir(uuid), public.pendencia_pausar(uuid,boolean),
  public.pendencia_lembretes(uuid,jsonb,text), public.pendencia_enviar_agora(uuid,jsonb),
  public.pendencias_modelo_excluir(uuid),
  public.pendencias_config_salvar(uuid,time,time,boolean,int,boolean,boolean) to authenticated;
