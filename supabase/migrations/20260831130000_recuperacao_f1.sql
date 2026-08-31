-- ============================================================================
-- RECUPERAÇÃO (Remarketing enxuto) — Fase 1 (31/08)
--
-- Ambiente pra recuperar leads da coluna "Remarketing" do Kanban. Cada
-- atendente monta as PRÓPRIAS sequências de mensagens pré-programadas
-- (texto/imagem/áudio gravado) com intervalo entre os toques; ao INICIAR a
-- recuperação de um lead, os toques são AGENDADOS (reusa mensagens_agendadas +
-- o cron/processor + evolution-send que já mandam texto/imagem/áudio) e saem
-- PELO NÚMERO DA CONVERSA (o normal que o cliente já fala — não pela Cloud API
-- de disparo). PARA sozinho quando o cliente responde (não vira spam).
--
-- Nada aqui muda o pipeline vivo de envio: os toques são só agendamentos
-- marcados com metadados.recuperacao_id. O "parar ao responder" é uma RPC SQL
-- chamada por cron (sem tocar webhooks/edge).
-- ============================================================================

-- ---------- sequências reutilizáveis, por atendente ----------
create table if not exists public.recuperacao_sequencias (
  id             uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  atendente_id   uuid not null references public.usuarios(id) on delete cascade,   -- dono/criador
  nome           text not null,
  toques         jsonb not null default '[]'::jsonb,   -- [{tipo,texto,storage_path,mime,nome,tamanho,origem_audio,intervalo_horas}]
  ativo          boolean not null default true,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);
create index if not exists rseq_org_idx on public.recuperacao_sequencias (organizacao_id, atendente_id);

-- ---------- execução: uma recuperação rodando num lead ----------
create table if not exists public.recuperacao_execucoes (
  id              uuid primary key default gen_random_uuid(),
  organizacao_id  uuid not null references public.organizacoes(id) on delete cascade,
  oportunidade_id uuid references public.oportunidades(id) on delete set null,
  conversa_id     uuid references public.conversas(id) on delete set null,
  contato_id      uuid not null references public.contatos(id) on delete cascade,
  canal_id        uuid references public.canais(id) on delete set null,
  sequencia_id    uuid references public.recuperacao_sequencias(id) on delete set null,
  sequencia_nome  text,
  responsavel_id  uuid references public.usuarios(id),
  status          text not null default 'ativa'
                    check (status in ('ativa','recuperado','parada','concluida')),
  total_toques    int not null default 0,
  iniciada_em     timestamptz not null default now(),
  finalizada_em   timestamptz,
  atualizada_em   timestamptz not null default now()
);
-- só UMA recuperação ativa por contato
create unique index if not exists uq_recup_ativa on public.recuperacao_execucoes (contato_id) where status = 'ativa';
create index if not exists recup_org_status_idx on public.recuperacao_execucoes (organizacao_id, status);

-- atualizado_em automático
create or replace function public.fn_recup_touch_updated() returns trigger
language plpgsql as $$ begin new.atualizado_em := now(); return new; end $$;
drop trigger if exists trg_rseq_updated on public.recuperacao_sequencias;
create trigger trg_rseq_updated before update on public.recuperacao_sequencias for each row execute function public.fn_recup_touch_updated();

-- ---------- RLS (org-wide, como o resto do operacional) ----------
alter table public.recuperacao_sequencias enable row level security;
alter table public.recuperacao_execucoes  enable row level security;
do $$ begin
  create policy rseq_sel on public.recuperacao_sequencias for select using (is_platform_admin() or is_member(organizacao_id));
  create policy rexe_sel on public.recuperacao_execucoes  for select using (is_platform_admin() or is_member(organizacao_id));
exception when duplicate_object then null; end $$;
-- escrita só via RPC (security definer); sem policies de insert/update/delete a authenticated.

-- ============================================================================
-- RPCs
-- ============================================================================

-- salvar/atualizar uma sequência do PRÓPRIO atendente (atendente_id = auth.uid())
create or replace function public.recuperacao_sequencia_salvar(p_id uuid, p_nome text, p_toques jsonb)
returns public.recuperacao_sequencias
language plpgsql security definer set search_path = public as $fn$
declare v_org uuid; v_row public.recuperacao_sequencias; v_n int;
begin
  if jsonb_typeof(coalesce(p_toques,'[]'::jsonb)) <> 'array' then raise exception 'toques_invalidos'; end if;
  v_n := jsonb_array_length(coalesce(p_toques,'[]'::jsonb));
  if v_n > 20 then raise exception 'sequencia_muito_longa'; end if;
  select organizacao_id into v_org from public.organizacao_usuarios where usuario_id = auth.uid() and status='ativo' limit 1;
  if v_org is null then raise exception 'sem_organizacao'; end if;
  if p_id is null then
    insert into public.recuperacao_sequencias (organizacao_id, atendente_id, nome, toques)
      values (v_org, auth.uid(), coalesce(nullif(trim(p_nome),''),'Sequência'), coalesce(p_toques,'[]'::jsonb))
      returning * into v_row;
  else
    update public.recuperacao_sequencias
       set nome = coalesce(nullif(trim(p_nome),''), nome), toques = coalesce(p_toques, toques)
     where id = p_id and organizacao_id = v_org and atendente_id = auth.uid()   -- só o dono edita
     returning * into v_row;
    if v_row.id is null then raise exception 'sequencia_nao_encontrada'; end if;
  end if;
  return v_row;
end $fn$;

create or replace function public.recuperacao_sequencia_excluir(p_id uuid)
returns void language plpgsql security definer set search_path = public as $fn$
begin
  delete from public.recuperacao_sequencias
   where id = p_id and atendente_id = auth.uid()
     and organizacao_id in (select organizacao_id from public.organizacao_usuarios where usuario_id = auth.uid() and status='ativo');
end $fn$;

-- iniciar a recuperação de um lead: agenda os toques da sequência no NÚMERO DA CONVERSA
create or replace function public.recuperacao_iniciar(p_oportunidade uuid, p_sequencia uuid)
returns public.recuperacao_execucoes
language plpgsql security definer set search_path = public as $fn$
declare
  v_org uuid; v_contato uuid; v_resp uuid; v_conv uuid; v_canal public.canais%rowtype;
  v_seq public.recuperacao_sequencias; v_exec public.recuperacao_execucoes;
  v_item jsonb; v_tipo text; v_texto text; v_path text; v_mime text; v_nome text; v_tam bigint; v_orig text;
  v_quando timestamptz := now() + interval '1 minute'; v_i int := 0; v_tel text;
begin
  select organizacao_id, contato_id, responsavel_id into v_org, v_contato, v_resp
    from public.oportunidades where id = p_oportunidade;
  if v_org is null then raise exception 'oportunidade_nao_encontrada'; end if;
  if not (is_platform_admin() or exists (select 1 from public.organizacao_usuarios where organizacao_id=v_org and usuario_id=auth.uid() and status='ativo'))
    then raise exception 'sem_acesso'; end if;

  select * into v_seq from public.recuperacao_sequencias where id = p_sequencia and organizacao_id = v_org;
  if v_seq.id is null then raise exception 'sequencia_nao_encontrada'; end if;
  if jsonb_array_length(coalesce(v_seq.toques,'[]'::jsonb)) < 1 then raise exception 'sequencia_vazia'; end if;

  -- conversa MAIS RECENTE do contato (o número que o cliente já fala)
  select id, canal_id into v_conv, v_canal.id from public.conversas
   where contato_id = v_contato and organizacao_id = v_org
   order by coalesce(ultima_entrada_em, criado_em) desc nulls last limit 1;
  if v_conv is null then raise exception 'sem_conversa' using hint = 'o lead não tem conversa pra responder'; end if;

  select * into v_canal from public.canais where id = v_canal.id and organizacao_id = v_org;
  if v_canal.id is null then raise exception 'canal_invalido'; end if;
  if v_canal.ativo = false or v_canal.status_integracao::text <> 'conectado' then raise exception 'canal_desconectado'; end if;
  if v_canal.envio_restrito then raise exception 'canal_restrito'; end if;
  if v_canal.conflito_com is not null then raise exception 'canal_em_conflito'; end if;

  select telefone into v_tel from public.contatos where id = v_contato;
  if v_tel is null or length(regexp_replace(v_tel,'\D','','g')) < 10 then raise exception 'contato_sem_telefone'; end if;

  -- NÃO manda pra quem pediu pra sair (opt-out por contato+canal) — o pipeline de
  -- agendamento não checa; a recuperação é automática, então blinda aqui.
  if public.wa_optout_ativo(v_contato, v_canal.id) then
    raise exception 'contato_optout' using hint = 'esse cliente pediu pra nao receber (opt-out)';
  end if;
  -- já em recuperação? mensagem amigável (o índice único também barra)
  if exists (select 1 from public.recuperacao_execucoes where contato_id = v_contato and status = 'ativa') then
    raise exception 'ja_em_recuperacao' using hint = 'esse lead ja esta em recuperacao';
  end if;

  insert into public.recuperacao_execucoes
    (organizacao_id, oportunidade_id, conversa_id, contato_id, canal_id, sequencia_id, sequencia_nome, responsavel_id,
     total_toques, status)
  values (v_org, p_oportunidade, v_conv, v_contato, v_canal.id, v_seq.id, v_seq.nome, coalesce(v_resp, auth.uid()),
     jsonb_array_length(v_seq.toques), 'ativa')
  returning * into v_exec;   -- índice único bloqueia 2 ativas no mesmo contato

  for v_item in select value from jsonb_array_elements(v_seq.toques) loop
    v_tipo := coalesce(v_item->>'tipo','texto');
    v_texto := nullif(trim(coalesce(v_item->>'texto','')),'');
    v_path := v_item->>'storage_path'; v_mime := coalesce(v_item->>'mime','');
    v_nome := v_item->>'nome'; v_tam := nullif(v_item->>'tamanho','')::bigint; v_orig := v_item->>'origem_audio';
    -- intervalo ANTES deste toque (horas), acumulado; 1º toque sai ~agora
    v_quando := v_quando + (coalesce(nullif(v_item->>'intervalo_horas','')::numeric, 0) * interval '1 hour');
    if v_tipo not in ('texto','imagem','audio','video','documento') then raise exception 'tipo_invalido'; end if;
    if v_tipo = 'texto' and v_texto is null then raise exception 'texto_vazio'; end if;
    if v_tipo <> 'texto' and (v_path is null or left(v_path, length(v_org::text)+1) <> (v_org::text||'/')) then raise exception 'midia_path_invalido'; end if;

    insert into public.mensagens_agendadas
      (organizacao_id, conversa_id, contato_id, canal_id, nome_canal_snapshot, telefone_canal_snapshot, criado_por,
       tipo, texto, storage_path, mime_type, nome_arquivo, tamanho_bytes, executar_em, sequencia_id, ordem_na_sequencia, metadados)
    values
      (v_org, v_conv, v_contato, v_canal.id, v_canal.nome_interno, v_canal.numero_conectado, auth.uid(),
       v_tipo, v_texto,
       case when v_tipo='texto' then null else v_path end,
       case when v_tipo='texto' then null else v_mime end,
       case when v_tipo='texto' then null else v_nome end,
       case when v_tipo='texto' then null else v_tam end,
       v_quando + (v_i * interval '2 seconds'),   -- desempate mínimo de ordem sob o throttle
       v_exec.id, v_i,
       jsonb_build_object('recuperacao_id', v_exec.id, 'toque', v_i)
         || case when v_tipo='audio' and v_orig is not null then jsonb_build_object('origem_audio', v_orig) else '{}'::jsonb end);
    v_i := v_i + 1;
  end loop;
  return v_exec;
end $fn$;

-- parar uma recuperação (cancela os toques pendentes)
create or replace function public.recuperacao_parar(p_execucao uuid, p_motivo text default 'parada')
returns void language plpgsql security definer set search_path = public as $fn$
declare v_org uuid;
begin
  select organizacao_id into v_org from public.recuperacao_execucoes where id = p_execucao;
  if v_org is null then raise exception 'execucao_nao_encontrada'; end if;
  if not (is_platform_admin() or exists (select 1 from public.organizacao_usuarios where organizacao_id=v_org and usuario_id=auth.uid() and status='ativo'))
    then raise exception 'sem_acesso'; end if;
  -- compara como TEXTO (nunca ::uuid — chave estranha derrubaria o cron); cancela agendada E processando
  update public.mensagens_agendadas set status='cancelada', cancelada_em=now(), cancelada_por=auth.uid()
   where metadados->>'recuperacao_id' = p_execucao::text and status in ('agendada','processando');
  update public.recuperacao_execucoes
     set status = case when p_motivo='recuperado' then 'recuperado' else 'parada' end, finalizada_em = now(), atualizada_em = now()
   where id = p_execucao;
end $fn$;

-- PARAR AO RESPONDER (cron): quem respondeu depois de iniciar vira 'recuperado' e cancela toques pendentes.
-- Quando não sobra toque pendente e ninguém respondeu, marca 'concluida'.
create or replace function public.recuperacao_checar_respostas()
returns int language plpgsql security definer set search_path = public as $fn$
declare v_rec public.recuperacao_execucoes; v_n int := 0; v_respondeu boolean; v_pend int;
begin
  for v_rec in select * from public.recuperacao_execucoes where status = 'ativa' loop
    -- respondeu = mensagem de ENTRADA na conversa depois de iniciar a recuperação
    select v_rec.conversa_id is not null and exists (
      select 1 from public.mensagens
       where conversa_id = v_rec.conversa_id
         and direcao = 'entrada' and criado_em > v_rec.iniciada_em
    ) into v_respondeu;
    if v_respondeu then
      update public.mensagens_agendadas set status='cancelada', cancelada_em=now()
       where metadados->>'recuperacao_id' = v_rec.id::text and status in ('agendada','processando');
      update public.recuperacao_execucoes set status='recuperado', finalizada_em=now(), atualizada_em=now() where id=v_rec.id;
      v_n := v_n + 1;
    else
      select count(*) into v_pend from public.mensagens_agendadas
       where metadados->>'recuperacao_id' = v_rec.id::text and status in ('agendada','processando');
      if v_pend = 0 then
        update public.recuperacao_execucoes set status='concluida', finalizada_em=now(), atualizada_em=now() where id=v_rec.id;
      end if;
    end if;
  end loop;
  return v_n;
end $fn$;

-- leads da coluna "Remarketing" (por nome, case-insensitive) com responsável + recuperação ativa
create or replace function public.recuperacao_leads(p_org uuid)
returns table (
  oportunidade_id uuid, contato_id uuid, contato_nome text, contato_telefone text,
  responsavel_id uuid, responsavel_nome text, coluna_nome text, criado_em timestamptz,
  execucao_id uuid, execucao_status text, sequencia_nome text, toque_total int, iniciada_em timestamptz
) language sql security definer set search_path = public as $fn$
  select o.id, o.contato_id, c.nome, c.telefone,
         o.responsavel_id, u.nome, fc.nome, o.criado_em,
         e.id, e.status, e.sequencia_nome, e.total_toques, e.iniciada_em
    from public.oportunidades o
    join public.funil_colunas fc on fc.id = o.coluna_id and fc.nome ilike 'remarketing'
    join public.contatos c on c.id = o.contato_id
    left join public.usuarios u on u.id = o.responsavel_id
    left join public.recuperacao_execucoes e on e.oportunidade_id = o.id and e.status = 'ativa'
   where o.organizacao_id = p_org and o.status = 'em_andamento'
     and (is_platform_admin() or is_member(p_org))
   order by o.criado_em desc;
$fn$;

-- painel: contadores
create or replace function public.recuperacao_dashboard(p_org uuid)
returns jsonb language sql security definer set search_path = public as $fn$
  select jsonb_build_object(
    'na_coluna',    (select count(*) from public.oportunidades o join public.funil_colunas fc on fc.id=o.coluna_id and fc.nome ilike 'remarketing' where o.organizacao_id=p_org and o.status='em_andamento'),
    'em_recuperacao',(select count(*) from public.recuperacao_execucoes where organizacao_id=p_org and status='ativa'),
    'recuperados',  (select count(*) from public.recuperacao_execucoes where organizacao_id=p_org and status='recuperado'),
    'concluidas',   (select count(*) from public.recuperacao_execucoes where organizacao_id=p_org and status='concluida')
  ) where is_platform_admin() or is_member(p_org);
$fn$;

revoke execute on function
  public.recuperacao_sequencia_salvar(uuid,text,jsonb), public.recuperacao_sequencia_excluir(uuid),
  public.recuperacao_iniciar(uuid,uuid), public.recuperacao_parar(uuid,text),
  public.recuperacao_leads(uuid), public.recuperacao_dashboard(uuid)
  from public, anon;
grant execute on function
  public.recuperacao_sequencia_salvar(uuid,text,jsonb), public.recuperacao_sequencia_excluir(uuid),
  public.recuperacao_iniciar(uuid,uuid), public.recuperacao_parar(uuid,text),
  public.recuperacao_leads(uuid), public.recuperacao_dashboard(uuid)
  to authenticated;
-- checar_respostas: só o cron (service_role)
revoke execute on function public.recuperacao_checar_respostas() from public, anon, authenticated;

-- cron: parar-ao-responder a cada 3 min (SQL puro, sem edge/secret)
select cron.schedule('recuperacao-checar', '*/3 * * * *', $$ select public.recuperacao_checar_respostas() $$);
