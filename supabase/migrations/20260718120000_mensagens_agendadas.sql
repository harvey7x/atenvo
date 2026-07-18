-- ============================================================================
-- AGENDAMENTO DE MENSAGENS — Fase 1 (texto + escolha de canal)
--
-- Envio automático real: o atendente agenda; um cron (a cada minuto) reivindica as
-- vencidas de forma atômica e envia via `evolution-send` (modo service). Nada depende
-- do atendente/tela/navegador estar aberto.
--
-- Segurança: RLS por org; escrita SÓ via RPC security definer (o cliente não faz INSERT
-- direto). O canal é validado no agendar E revalidado no envio (o canal pode cair depois).
-- ============================================================================

create table if not exists public.mensagens_agendadas (
  id                       uuid primary key default gen_random_uuid(),
  organizacao_id           uuid not null references public.organizacoes(id) on delete cascade,
  conversa_id              uuid not null references public.conversas(id)    on delete cascade,
  contato_id               uuid not null references public.contatos(id)     on delete cascade,
  canal_id                 uuid not null references public.canais(id)       on delete restrict,
  -- snapshot do canal no momento do agendamento (a UI mostra por qual número vai, mesmo se mudar)
  nome_canal_snapshot      text,
  telefone_canal_snapshot  text,
  criado_por               uuid references public.usuarios(id),
  tipo                     text not null default 'texto'
                             check (tipo in ('texto','imagem','audio','documento','texto_midia')),
  texto                    text,
  storage_path             text,   -- Fase 3 (mídia)
  mime_type                text,
  nome_arquivo             text,
  tamanho_bytes            bigint,
  executar_em              timestamptz not null,
  timezone                 text not null default 'America/Sao_Paulo',
  status                   text not null default 'agendada'
                             check (status in ('agendada','processando','enviada','falhou','cancelada','expirada','bloqueada')),
  tentativas               int not null default 0,
  max_tentativas           int not null default 3,
  ultimo_erro              text,
  motivo_bloqueio          text,
  enviada_em               timestamptz,
  mensagem_id_enviada      uuid references public.mensagens(id) on delete set null,
  cancelada_em             timestamptz,
  cancelada_por            uuid references public.usuarios(id),
  editada_em               timestamptz,
  editada_por              uuid references public.usuarios(id),
  criado_em                timestamptz not null default now(),
  atualizado_em            timestamptz not null default now(),
  metadados                jsonb not null default '{}'::jsonb,
  -- precisa ter conteúdo: texto (Fase 1) ou mídia (Fase 3)
  constraint mag_tem_conteudo check (texto is not null or storage_path is not null)
);

comment on table public.mensagens_agendadas is
  'Mensagens agendadas para envio automático futuro via WhatsApp (evolution-send modo service). RLS por org; escrita só via RPC.';

-- cron hot path: pega vencidas ainda agendadas
create index if not exists mag_due_idx on public.mensagens_agendadas (executar_em)
  where status = 'agendada';
create index if not exists mag_org_conv_idx on public.mensagens_agendadas (organizacao_id, conversa_id, status);
create index if not exists mag_canal_idx    on public.mensagens_agendadas (canal_id);
create index if not exists mag_criador_idx  on public.mensagens_agendadas (criado_por);

alter table public.mensagens_agendadas enable row level security;

-- Leitura: membro da org (a UI lista por conversa; a tela geral virá na Fase 4).
drop policy if exists mag_sel on public.mensagens_agendadas;
create policy mag_sel on public.mensagens_agendadas
  for select using (is_platform_admin() or is_member(organizacao_id));

-- Escrita só via RPC security definer.
revoke insert, update, delete on public.mensagens_agendadas from anon, authenticated;
grant select on public.mensagens_agendadas to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC: agendar (cria a linha). Valida vínculo, org da conversa, canal válido,
-- contato com telefone e horário no futuro. Nunca confia em organizacao_id do cliente.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.agendar_mensagem(
  p_conversa    uuid,
  p_canal       uuid,
  p_texto       text,
  p_executar_em timestamptz
) returns public.mensagens_agendadas
language plpgsql security definer set search_path = public as $fn$
declare
  v_org     uuid;
  v_contato uuid;
  v_canal   public.canais%rowtype;
  v_tel     text;
  v_row     public.mensagens_agendadas;
begin
  if p_texto is null or length(trim(p_texto)) = 0 then raise exception 'texto_vazio'; end if;
  if length(p_texto) > 4096 then raise exception 'texto_muito_longo'; end if;
  if p_executar_em is null or p_executar_em <= now() + interval '30 seconds' then
    raise exception 'horario_invalido' using hint = 'agende para o futuro';
  end if;

  select organizacao_id, contato_id into v_org, v_contato from public.conversas where id = p_conversa;
  if v_org is null then raise exception 'conversa_nao_encontrada'; end if;

  -- autorização: membro ATIVO da org DA CONVERSA
  if not (is_platform_admin() or exists (
    select 1 from public.organizacao_usuarios
     where organizacao_id = v_org and usuario_id = auth.uid() and status = 'ativo'
  )) then raise exception 'sem_acesso'; end if;

  -- contato precisa de telefone acionável
  select telefone into v_tel from public.contatos where id = v_contato;
  if v_tel is null or length(regexp_replace(v_tel, '\D', '', 'g')) < 10 then
    raise exception 'contato_sem_telefone';
  end if;

  -- canal precisa existir NA MESMA ORG e estar válido para envio
  select * into v_canal from public.canais where id = p_canal and organizacao_id = v_org;
  if v_canal.id is null then raise exception 'canal_invalido' using hint = 'canal de outra organização ou inexistente'; end if;
  if v_canal.ativo = false then raise exception 'canal_inativo'; end if;
  if v_canal.status_integracao::text = 'removido' then raise exception 'canal_removido'; end if;
  if v_canal.status_integracao::text <> 'conectado' then raise exception 'canal_desconectado'; end if;
  if v_canal.envio_restrito then raise exception 'canal_restrito'; end if;
  if v_canal.conflito_com is not null then raise exception 'canal_em_conflito'; end if;

  insert into public.mensagens_agendadas (
    organizacao_id, conversa_id, contato_id, canal_id,
    nome_canal_snapshot, telefone_canal_snapshot, criado_por,
    tipo, texto, executar_em,
    metadados
  ) values (
    v_org, p_conversa, v_contato, p_canal,
    v_canal.nome_interno, v_canal.numero_conectado, auth.uid(),
    'texto', p_texto, p_executar_em,
    jsonb_build_object('responsavel_no_agendamento', (select responsavel_id from public.contatos where id = v_contato))
  ) returning * into v_row;

  return v_row;
end $fn$;

revoke execute on function public.agendar_mensagem(uuid, uuid, text, timestamptz) from public, anon;
grant  execute on function public.agendar_mensagem(uuid, uuid, text, timestamptz) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC: reivindicar lote para o processador (service). Claim ATÔMICO:
--   • DISTINCT ON (canal_id) → no máx. 1 por canal por ciclo (throttle anti-rajada);
--   • UPDATE ... WHERE status='agendada' → dois crons simultâneos nunca pegam a mesma linha.
-- Executada só pelo Edge (service_role); revogada de anon/authenticated.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.mensagens_agendadas_reivindicar(p_limite int default 30)
returns setof public.mensagens_agendadas
language plpgsql security definer set search_path = public as $fn$
begin
  return query
  with cand as (
    select distinct on (canal_id) id
    from public.mensagens_agendadas
    where status = 'agendada' and executar_em <= now()
    order by canal_id, executar_em
    limit greatest(1, p_limite)
  )
  update public.mensagens_agendadas m
     set status = 'processando', tentativas = tentativas + 1, atualizado_em = now()
    from cand
   where m.id = cand.id and m.status = 'agendada'   -- guarda atômica
  returning m.*;
end $fn$;

revoke execute on function public.mensagens_agendadas_reivindicar(int) from public, anon, authenticated;
-- só o processador (Edge com service_role) reivindica. anon/authenticated nunca.
grant  execute on function public.mensagens_agendadas_reivindicar(int) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Secret do processador: gerado no banco (self-consistente entre cron e Edge, sem
-- valor no código). on conflict do nothing → não sobrescreve se já existir.
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.webhook_config (chave, secret)
values ('agendamento', gen_random_uuid()::text)
on conflict (chave) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- Cron: a cada minuto chama o processador. Secret por HEADER (nunca query string),
-- lido do banco em runtime. Tabela começa vazia ⇒ inerte até alguém agendar.
-- ─────────────────────────────────────────────────────────────────────────────
select cron.unschedule('mensagens-agendadas-processar')
where exists (select 1 from cron.job where jobname = 'mensagens-agendadas-processar');

select cron.schedule(
  'mensagens-agendadas-processar',
  '* * * * *',
  $cron$
  select net.http_post(
    url := 'https://afmzuoavvnpfossiiypz.supabase.co/functions/v1/mensagens-agendadas-processar',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-agendamento-secret', (select secret from public.webhook_config where chave = 'agendamento')
    )
  );
  $cron$
);
