-- 93 — ESTRUTURA DO ATENDIMENTO NO BANCO DO REVIZA (gerada em 23/11/2026 por ~/reviza-sist/porte-atendimento/gera.py).
-- Copiada da estrutura do Atenvo (o sistema do CAF) — SÓ A ESTRUTURA: nenhum cliente, conversa, número ou
-- configuração do CAF vem junto. 106 tabelas, 256 rotinas, as regras de acesso e os gatilhos delas.
-- ADITIVA: nada do que as Cobranças usam é alterado. Duas tabelas do Atendimento têm nome igual a tabelas das
-- Cobranças com outro formato e entram com outro nome: notificacoes → atd_notificacoes, wa_optout → atd_wa_optout;
-- integracoes → atd_integracoes (o nome integracoes fica para o Asaas do Reviza, migration 87).
-- A empresa do Atendimento é UMA só (a ALFA, id fixo) e as pessoas vêm de profiles: quem tem o ambiente
-- Atendimento entra como membro dela (sincronizado por gatilho — ver o fim do arquivo).
-- NÃO entra aqui: os agendamentos automáticos (cron) do CAF e as funções de servidor (outro passo).
-- ATENÇÃO: esta migration SUBSTITUI a 90 (Iris do Reviza em cima do WhatsApp das Cobranças), que nunca foi
-- aplicada: a Iris passa a morar no Atendimento, como no Atenvo (ia_agentes, ia_fluxos, ia_sessoes vêm daqui).
-- Não aplicar a 90 depois desta.
set check_function_bodies = off;

-- 1. tipos
do $$ begin if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'anexo_tipo') then create type public.anexo_tipo as enum ('imagem', 'video', 'audio', 'documento'); end if; end $$;
do $$ begin if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'assinatura_item_tipo') then create type public.assinatura_item_tipo as enum ('plano_base', 'usuario_adicional', 'whatsapp_adicional', 'facebook_adicional', 'desconto', 'credito', 'ajuste'); end if; end $$;
do $$ begin if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'assinatura_status') then create type public.assinatura_status as enum ('teste', 'ativa', 'em_atraso', 'suspensa', 'cancelada', 'isenta', 'aguardando_pagamento'); end if; end $$;
do $$ begin if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'canal_tipo') then create type public.canal_tipo as enum ('whatsapp', 'facebook', 'notificacao'); end if; end $$;
do $$ begin if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'cobranca_status') then create type public.cobranca_status as enum ('ativo', 'proximo_vencimento', 'vencido', 'atrasado', 'encerrando', 'finalizado', 'cancelado'); end if; end $$;
do $$ begin if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'conversa_status') then create type public.conversa_status as enum ('aberta', 'em_atendimento', 'pendente', 'resolvida', 'fechada'); end if; end $$;
do $$ begin if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'convite_status') then create type public.convite_status as enum ('pendente', 'aceito', 'expirado', 'cancelado'); end if; end $$;
do $$ begin if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'etapa_funil') then create type public.etapa_funil as enum ('novo_lead', 'em_processo', 'contratacao', 'fechado'); end if; end $$;
do $$ begin if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'fatura_status') then create type public.fatura_status as enum ('aberta', 'paga', 'vencida', 'cancelada'); end if; end $$;
do $$ begin if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'identidade_tipo') then create type public.identidade_tipo as enum ('telefone', 'whatsapp', 'facebook_psid', 'email', 'outro'); end if; end $$;
do $$ begin if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'integracao_status') then create type public.integracao_status as enum ('conectado', 'sincronizando', 'atencao', 'desconectado', 'erro', 'removido', 'arquivado'); end if; end $$;
do $$ begin if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'membership_status') then create type public.membership_status as enum ('ativo', 'inativo', 'convidado'); end if; end $$;
do $$ begin if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'mensagem_direcao') then create type public.mensagem_direcao as enum ('entrada', 'saida'); end if; end $$;
do $$ begin if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'mensagem_status') then create type public.mensagem_status as enum ('pendente', 'enviada', 'entregue', 'lida', 'falhou'); end if; end $$;
do $$ begin if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'mensagem_tipo') then create type public.mensagem_tipo as enum ('texto', 'imagem', 'video', 'audio', 'documento', 'sistema', 'nota_interna'); end if; end $$;
do $$ begin if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'meta_evento_tipo') then create type public.meta_evento_tipo as enum ('messages', 'message_echoes', 'messaging_postbacks', 'message_deliveries', 'message_reads', 'outro'); end if; end $$;
do $$ begin if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'meta_proc_status') then create type public.meta_proc_status as enum ('recebido', 'processado', 'ignorado', 'erro'); end if; end $$;
do $$ begin if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'meta_token_status') then create type public.meta_token_status as enum ('valido', 'expirado', 'revogado', 'desconectado'); end if; end $$;
do $$ begin if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'oportunidade_status') then create type public.oportunidade_status as enum ('em_andamento', 'ganho', 'perdido', 'cancelado'); end if; end $$;
do $$ begin if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'organizacao_status') then create type public.organizacao_status as enum ('ativa', 'em_implantacao', 'suspensa', 'cancelada'); end if; end $$;
do $$ begin if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'pagamento_metodo') then create type public.pagamento_metodo as enum ('pix', 'pix_automatico', 'cartao', 'boleto'); end if; end $$;
do $$ begin if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'pagamento_status') then create type public.pagamento_status as enum ('pendente', 'confirmado', 'vencido', 'estornado', 'falhou'); end if; end $$;
do $$ begin if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'script_etapa_tipo') then create type public.script_etapa_tipo as enum ('texto', 'imagem', 'audio', 'video', 'documento'); end if; end $$;
do $$ begin if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'user_role') then create type public.user_role as enum ('admin', 'supervisor', 'atendente'); end if; end $$;

-- 2. sequências
create sequence if not exists public.adm_movimentos_id_seq;
create sequence if not exists public.iris_teste_limpezas_id_seq;
create sequence if not exists public.presenciais_avisos_id_seq;

-- 2b. rotinas usadas pelas colunas calculadas: chave_canonica_telefone
CREATE OR REPLACE FUNCTION public.chave_canonica_telefone(p_raw text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare d text; core text;
begin
  d := regexp_replace(coalesce(p_raw,''),'\D','','g');
  if d = '' then return null; end if;
  core := case when left(d,2)='55' and length(d)-2 in (10,11) then substr(d,3) else d end;
  if length(core) in (10,11) then return left(core,2)||right(core,8); end if;
  return d;
end $function$;

-- 3. tabelas
create table if not exists public.adm_casos (
  organizacao_id uuid not null,
  caso_id uuid not null,
  contato_id uuid,
  vendedor text,
  completo_em timestamp with time zone,
  fora_da_conta boolean default false not null,
  fechado_em timestamp with time zone,
  atualizado_em timestamp with time zone default now() not null
);
create table if not exists public.adm_config (
  organizacao_id uuid not null,
  ativo boolean default false not null,
  protege_antes timestamp with time zone,
  ultima_leitura_em timestamp with time zone,
  ultimos_completos integer,
  atualizado_em timestamp with time zone default now() not null,
  pendentes_em timestamp with time zone
);
create table if not exists public.adm_fechados (
  organizacao_id uuid not null,
  chave text not null,
  cpf text,
  telefone_chave text,
  nome text,
  fechado_em timestamp with time zone,
  contato_id uuid,
  visto_em timestamp with time zone default now() not null,
  atualizado_em timestamp with time zone default now() not null
);
create table if not exists public.adm_movimentos (
  id bigint default nextval('adm_movimentos_id_seq'::regclass) not null,
  organizacao_id uuid not null,
  oportunidade_id uuid not null,
  contato_id uuid,
  acao text not null,
  coluna_anterior_id uuid,
  status_anterior text,
  fechado_em_anterior timestamp with time zone,
  coluna_nova_id uuid,
  fechado_em_novo timestamp with time zone,
  criado_em timestamp with time zone default now() not null
);
create table if not exists public.adm_pendencias (
  organizacao_id uuid not null,
  caso_id uuid not null,
  contato_id uuid,
  vendedor text,
  estagio text not null,
  estagio_em timestamp with time zone,
  assinado boolean default false not null,
  assinado_em timestamp with time zone,
  falta text[] default '{}'::text[] not null,
  atualizado_em timestamp with time zone default now() not null
);
create table if not exists public.adm_placar (
  organizacao_id uuid not null,
  mes date not null,
  vendedor text not null,
  completos integer not null,
  tirados integer default 0 not null,
  informado boolean default false not null,
  lido_em timestamp with time zone default now() not null
);
create table if not exists public.agendamento_atividades (
  id uuid default gen_random_uuid() not null,
  organizacao_id uuid not null,
  agendamento_id uuid not null,
  usuario_id uuid,
  tipo text not null,
  de jsonb,
  para jsonb,
  motivo text,
  criado_em timestamp with time zone default now() not null
);
create table if not exists public.agendamentos (
  id uuid default gen_random_uuid() not null,
  organizacao_id uuid not null,
  contato_id uuid,
  oportunidade_id uuid,
  atendente_id uuid,
  tipo text default 'Outro'::text not null,
  titulo text,
  cliente_nome text,
  telefone text,
  inicio_em timestamp with time zone not null,
  fim_em timestamp with time zone not null,
  timezone text default 'America/Sao_Paulo'::text not null,
  status text default 'pendente'::text not null,
  local text,
  endereco text,
  observacoes text,
  motivo_cancelamento text,
  motivo_remarcacao text,
  criado_por uuid,
  criado_em timestamp with time zone default now() not null,
  atualizado_em timestamp with time zone default now() not null
);
create table if not exists public.alertas_lead_quente (
  id uuid default gen_random_uuid() not null,
  organizacao_id uuid not null,
  conversa_id uuid not null,
  contato_id uuid,
  passo text,
  abandonado_em timestamp with time zone not null,
  status text default 'pendente'::text not null,
  assumido_por uuid,
  assumido_em timestamp with time zone,
  cancelado_por uuid,
  cancelado_motivo text,
  cancelado_em timestamp with time zone,
  criado_em timestamp with time zone default now() not null,
  tipo text default 'abandono'::text not null
);
create table if not exists public.assinatura_itens (
  id uuid default gen_random_uuid() not null,
  assinatura_id uuid not null,
  organizacao_id uuid not null,
  tipo assinatura_item_tipo not null,
  descricao text,
  quantidade integer default 1 not null,
  valor_unitario_centavos integer default 0 not null,
  valor_total_centavos integer default 0 not null,
  criado_em timestamp with time zone default now() not null
);
create table if not exists public.assinaturas (
  id uuid default gen_random_uuid() not null,
  organizacao_id uuid not null,
  plano_id uuid not null,
  status assinatura_status default 'ativa'::assinatura_status not null,
  ciclo_inicio date,
  ciclo_fim date,
  proxima_cobranca date,
  valor_total_centavos integer default 0 not null,
  criado_em timestamp with time zone default now() not null,
  atualizado_em timestamp with time zone default now() not null,
  asaas_subscription_id text,
  checkout_url text
);
create table if not exists public.assistente_lembretes (
  id uuid default gen_random_uuid() not null,
  organizacao_id uuid not null,
  usuario_id uuid not null,
  texto text not null,
  quando timestamp with time zone not null,
  status text default 'pendente'::text not null,
  criado_em timestamp with time zone default now() not null,
  avisado_em timestamp with time zone,
  confirmado_em timestamp with time zone,
  origem text default 'voz'::text not null
);
create table if not exists public.audit_log (
  id uuid default gen_random_uuid() not null,
  usuario_id uuid,
  acao text not null,
  entidade text,
  entidade_id uuid,
  dados_antes jsonb,
  dados_depois jsonb,
  ip text,
  criado_em timestamp with time zone default now() not null,
  organizacao_id uuid not null
);
create table if not exists public.avisos_passado_humano (
  id uuid default gen_random_uuid() not null,
  organizacao_id uuid not null,
  conversa_id uuid not null,
  contato_id uuid,
  motivo text,
  criado_em timestamp with time zone default now() not null,
  enviado_em timestamp with time zone,
  enviado_para uuid[],
  descartado_em timestamp with time zone,
  descarte_motivo text
);
create table if not exists public.bom_dia_gestores (
  organizacao_id uuid not null,
  usuario_id uuid not null,
  criado_em timestamp with time zone default now() not null
);
create table if not exists public.bot_canal_config (
  id uuid default gen_random_uuid() not null,
  organizacao_id uuid not null,
  canal_id uuid not null,
  bot_enabled boolean default false not null,
  fluxo_slug text default 'atendimento_inicial_descontos'::text not null,
  origem text,
  campanha text,
  mensagens jsonb,
  intervalo_min_ms integer,
  intervalo_max_ms integer,
  ativo_em timestamp with time zone,
  ativo_por uuid,
  criado_em timestamp with time zone default now() not null,
  atualizado_em timestamp with time zone default now() not null,
  fluxo_slug_teste text,
  numeros_teste text[] default '{}'::text[] not null,
  ia_enabled boolean default false not null,
  ia_modo_teste boolean default true not null,
  ia_config jsonb default '{}'::jsonb not null,
  ia_agente_id uuid,
  ia_fluxo_id uuid,
  freio_ativo boolean default true not null,
  freio_msgs_hora integer,
  freio_msgs_dia integer,
  freio_aberturas_hora integer,
  iris_config jsonb default '{"ativo": false, "somente_teste": true}'::jsonb not null
);
create table if not exists public.bot_conversa_estado (
  conversa_id uuid not null,
  organizacao_id uuid not null,
  canal_id uuid,
  contato_id uuid,
  fluxo_slug text default 'atendimento_inicial_descontos'::text not null,
  etapa text default 'inicio'::text not null,
  pausado boolean default false not null,
  motivo_pausa text,
  dados_qualificacao jsonb default '{}'::jsonb not null,
  lead_quente boolean default false not null,
  lead_quente_motivos text[] default '{}'::text[] not null,
  oportunidade_id uuid,
  reprompts integer default 0 not null,
  resumo jsonb,
  ultimo_inbound_msg_id uuid,
  iniciado_em timestamp with time zone default now() not null,
  ultima_atividade_em timestamp with time zone default now() not null,
  concluido_em timestamp with time zone,
  atualizado_em timestamp with time zone default now() not null,
  processando_ate timestamp with time zone
);
create table if not exists public.bot_mensagens_saida (
  id uuid default gen_random_uuid() not null,
  organizacao_id uuid not null,
  conversa_id uuid not null,
  canal_id uuid,
  etapa text,
  ordem integer not null,
  texto text not null,
  enviar_apos timestamp with time zone default now() not null,
  status text default 'pendente'::text not null,
  tentativas integer default 0 not null,
  mensagem_id uuid,
  id_externo text,
  erro text,
  criado_em timestamp with time zone default now() not null,
  atualizado_em timestamp with time zone default now() not null,
  tipo text default 'texto'::text not null,
  media_url text,
  media_caption text
);
create table if not exists public.bot_remarketing (
  id uuid default gen_random_uuid() not null,
  organizacao_id uuid not null,
  oportunidade_id uuid not null,
  conversa_id uuid,
  contato_id uuid,
  canal_id uuid,
  status text default 'ativo'::text not null,
  toque integer default 0 not null,
  proximo_em timestamp with time zone,
  ultimo_toque_em timestamp with time zone,
  criado_em timestamp with time zone default now() not null,
  atualizado_em timestamp with time zone default now() not null,
  ultimo_envio_id text
);
create table if not exists public.bot_roteamentos (
  id uuid default gen_random_uuid() not null,
  organizacao_id uuid not null,
  conversa_id uuid not null,
  contato_id uuid,
  consultor_id uuid not null,
  genero text not null,
  criado_em timestamp with time zone default now() not null
);
create table if not exists public.canais (
  id uuid default gen_random_uuid() not null,
  tipo canal_tipo not null,
  nome_interno text not null,
  identificador text,
  campanha text,
  status_integracao integracao_status default 'desconectado'::integracao_status not null,
  ultima_sincronizacao timestamp with time zone,
  ativo boolean default true not null,
  criado_em timestamp with time zone default now() not null,
  atualizado_em timestamp with time zone default now() not null,
  fonte_aquisicao_id uuid,
  organizacao_id uuid not null,
  provider text,
  instancia_externa text,
  numero_conectado text,
  conectado_em timestamp with time zone,
  origem_tipo text,
  gestor_id uuid,
  observacao_comercial text,
  envio_restrito boolean default false not null,
  envio_restrito_em timestamp with time zone,
  envio_restrito_por uuid,
  envio_restrito_motivo text,
  health_check_enabled boolean default false not null,
  health_check_target_phone text,
  health_check_frequency_per_day integer default 0 not null,
  health_check_last_run_at timestamp with time zone,
  health_check_last_success_at timestamp with time zone,
  health_check_fail_count integer default 0 not null,
  health_check_status text default 'desabilitado'::text not null,
  health_check_last_error text,
  auto_restrict_on_failure boolean default false not null,
  alerta_silenciado boolean default false not null,
  alerta_silenciado_ate timestamp with time zone,
  alerta_silenciado_motivo text,
  alerta_silenciado_por uuid,
  entrega_status text default 'desconhecido'::text not null,
  entrega_ultimo_erro_em timestamp with time zone,
  entrega_erros_recentes integer default 0 not null,
  entrega_teste_phone text,
  conflito_com uuid,
  conflito_em timestamp with time zone,
  transporte text default 'evolution'::text not null,
  cloud_phone_number_id text,
  cloud_waba_id text,
  papel text default 'atendimento'::text not null,
  disparo_padrao boolean default false not null,
  prende_conversa boolean default false not null
);
create table if not exists public.canal_health_runs (
  id uuid default gen_random_uuid() not null,
  organizacao_id uuid not null,
  canal_id uuid not null,
  executado_em timestamp with time zone default now() not null,
  tipo text not null,
  sucesso boolean not null,
  status_resultado text,
  erro text,
  erro_tipo text,
  message_id text,
  instancia_externa text,
  target_phone text,
  latencia_ms integer,
  dados jsonb,
  criado_por uuid,
  criado_em timestamp with time zone default now() not null
);
create table if not exists public.canal_janela (
  canal_id uuid not null,
  contato_id uuid not null,
  organizacao_id uuid not null,
  ultima_entrada_em timestamp with time zone not null,
  atualizado_em timestamp with time zone default now() not null,
  nudge_em timestamp with time zone
);
create table if not exists public.checklist_modelo (
  item_slug text not null,
  secao text not null,
  rotulo text not null,
  ordem integer not null,
  obrigatorio boolean default true not null
);
create table if not exists public.ciclos_vencimento (
  id uuid default gen_random_uuid() not null,
  organizacao_id uuid not null,
  codigo text not null,
  nome text not null,
  grupo text not null,
  ordem integer default 0 not null,
  criado_em timestamp with time zone default now() not null,
  atualizado_em timestamp with time zone default now() not null
);
create table if not exists public.cobranca_eventos (
  id uuid default gen_random_uuid() not null,
  cobranca_id uuid not null,
  tipo text not null,
  descricao text,
  dados jsonb default '{}'::jsonb not null,
  usuario_id uuid,
  criado_em timestamp with time zone default now() not null,
  organizacao_id uuid not null
);
create table if not exists public.cobranca_pagamentos (
  id uuid default gen_random_uuid() not null,
  cobranca_id uuid not null,
  ciclo integer not null,
  valor numeric(12,2),
  data_prevista date not null,
  data_pagamento date,
  status text default 'prevista'::text not null,
  criado_em timestamp with time zone default now() not null,
  organizacao_id uuid not null,
  valor_pago numeric(12,2),
  observacoes text,
  atualizado_em timestamp with time zone default now() not null,
  competencia date,
  marcado_por uuid,
  marcado_em timestamp with time zone
);
create table if not exists public.cobrancas (
  id uuid default gen_random_uuid() not null,
  contato_id uuid not null,
  oportunidade_id uuid,
  servico text,
  valor_original_descontado numeric(12,2),
  novo_valor_descontado numeric(12,2),
  valor_economizado numeric(12,2),
  percentual_honorarios numeric(5,2) default 50.00 not null,
  valor_mensal numeric(12,2),
  dia_cobranca integer,
  ciclos_totais integer default 6,
  ciclos_pagos integer default 0 not null,
  ciclos_restantes integer generated always as (GREATEST((ciclos_totais - ciclos_pagos), 0)) stored,
  proxima_cobranca date,
  status cobranca_status default 'ativo'::cobranca_status not null,
  responsavel_id uuid,
  observacoes text,
  data_inicio date not null,
  data_encerramento date,
  criado_em timestamp with time zone default now() not null,
  atualizado_em timestamp with time zone default now() not null,
  organizacao_id uuid not null,
  criado_por uuid not null,
  ciclo_vencimento_id uuid,
  nb text,
  banco_origem text,
  banco_recebimento text,
  senha_inss_cifrada bytea,
  reclame_aqui_status text,
  parcela_texto_original text,
  flags_importacao jsonb default '{}'::jsonb not null
);
create table if not exists public.configuracoes (
  chave text not null,
  valor jsonb not null,
  descricao text,
  atualizado_em timestamp with time zone default now() not null,
  organizacao_id uuid not null
);
create table if not exists public.contato_identidades (
  id uuid default gen_random_uuid() not null,
  contato_id uuid not null,
  tipo identidade_tipo not null,
  provedor text,
  valor text not null,
  valor_normalizado text,
  principal boolean default false not null,
  criado_em timestamp with time zone default now() not null,
  atualizado_em timestamp with time zone default now() not null,
  organizacao_id uuid not null,
  metadados jsonb default '{}'::jsonb not null,
  chave_canonica text generated always as (chave_canonica_telefone(valor_normalizado)) stored
);
create table if not exists public.contatos (
  id uuid default gen_random_uuid() not null,
  nome text not null,
  cpf text,
  telefone text,
  email text,
  origem text,
  responsavel_id uuid,
  etiquetas text[] default '{}'::text[] not null,
  observacoes text,
  criado_em timestamp with time zone default now() not null,
  atualizado_em timestamp with time zone default now() not null,
  organizacao_id uuid not null,
  foto_url text,
  foto_sync_em timestamp with time zone,
  canal_origem_id uuid,
  canal_origem_snapshot jsonb,
  identidade_tipo text,
  identidade_resolvida_em timestamp with time zone,
  identidade_fonte text,
  nome_fonte text,
  mesclado_em timestamp with time zone,
  mesclado_para uuid
);
create table if not exists public.conversa_atividades (
  id uuid default gen_random_uuid() not null,
  organizacao_id uuid not null,
  conversa_id uuid not null,
  usuario_id uuid,
  tipo text not null,
  de jsonb,
  para jsonb,
  motivo text,
  criado_em timestamp with time zone default now() not null
);
create table if not exists public.conversa_etiquetas (
  id uuid default gen_random_uuid() not null,
  organizacao_id uuid not null,
  conversa_id uuid not null,
  etiqueta_id uuid not null,
  aplicada_por uuid,
  aplicada_em timestamp with time zone default now() not null
);
create table if not exists public.conversa_higiene_adiamentos (
  id uuid default gen_random_uuid() not null,
  organizacao_id uuid not null,
  conversa_id uuid not null,
  tipo text not null,
  usuario_id uuid,
  criado_em timestamp with time zone default now() not null,
  adiar_ate timestamp with time zone
);
create table if not exists public.conversa_status_def (
  id uuid default gen_random_uuid() not null,
  organizacao_id uuid not null,
  slug text not null,
  nome text not null,
  cor text default '#64748b'::text not null,
  ordem integer default 0 not null,
  padrao boolean default false not null,
  ativo boolean default true not null,
  sistema boolean default false not null,
  criado_em timestamp with time zone default now() not null,
  atualizado_em timestamp with time zone default now() not null
);
create table if not exists public.conversas (
  id uuid default gen_random_uuid() not null,
  contato_id uuid not null,
  canal_id uuid,
  atendente_id uuid,
  status conversa_status default 'aberta'::conversa_status not null,
  etiquetas text[] default '{}'::text[] not null,
  nao_lidas integer default 0 not null,
  ultima_interacao_em timestamp with time zone default now(),
  criado_em timestamp with time zone default now() not null,
  atualizado_em timestamp with time zone default now() not null,
  organizacao_id uuid not null,
  status_id uuid,
  ultimo_canal_id uuid,
  ultimo_numero text,
  ultimo_provider text,
  ultima_msg_canal_em timestamp with time zone,
  arquivada_em timestamp with time zone,
  arquivada_por uuid,
  fixada_em timestamp with time zone,
  silenciada_ate timestamp with time zone,
  ultima_lida_em timestamp with time zone,
  precisa_humano boolean default false not null,
  precisa_humano_motivo text,
  precisa_humano_em timestamp with time zone,
  canal_origem_id uuid,
  ultima_entrada_em timestamp with time zone,
  canal_preso_id uuid,
  canal_preso_em timestamp with time zone
);
create table if not exists public.convites (
  id uuid default gen_random_uuid() not null,
  organizacao_id uuid not null,
  email text not null,
  nome text,
  papel user_role default 'atendente'::user_role not null,
  status convite_status default 'pendente'::convite_status not null,
  auth_user_id uuid,
  convidado_por uuid,
  expira_em timestamp with time zone default (now() + '7 days'::interval) not null,
  aceito_em timestamp with time zone,
  cancelado_em timestamp with time zone,
  reenviado_em timestamp with time zone,
  criado_em timestamp with time zone default now() not null,
  atualizado_em timestamp with time zone default now() not null,
  request_id uuid,
  telefone text,
  canal_id uuid,
  whatsapp_status text,
  whatsapp_key_id text,
  whatsapp_enviado_em timestamp with time zone,
  whatsapp_erro text
);
create table if not exists public.etiquetas (
  id uuid default gen_random_uuid() not null,
  organizacao_id uuid not null,
  nome text not null,
  cor text default '#64748b'::text not null,
  descricao text,
  ordem integer default 0 not null,
  ativo boolean default true not null,
  criado_em timestamp with time zone default now() not null,
  atualizado_em timestamp with time zone default now() not null
);
create table if not exists public.fichas_judiciais (
  id uuid default gen_random_uuid() not null,
  organizacao_id uuid not null,
  contato_id uuid not null,
  oportunidade_id uuid,
  conversa_id uuid,
  canal_id uuid,
  responsavel_id uuid,
  criado_por uuid not null,
  atualizado_por uuid not null,
  versao integer default 1 not null,
  ficha_anterior_id uuid,
  status text default 'rascunho'::text not null,
  texto_original text,
  texto_ficha text,
  nome text,
  cpf text,
  cidade text,
  uf text,
  telefone text,
  email text,
  rg text,
  estado_civil text,
  nascimento date,
  idade_informada integer,
  beneficio_numero text,
  especie_codigo text,
  especie_descricao text,
  tipo_beneficio text,
  banco_codigo text,
  banco_nome text,
  valor_beneficio numeric(12,2),
  data_consulta date,
  revisoes jsonb default '[]'::jsonb not null,
  avisos jsonb default '[]'::jsonb not null,
  parser_version text,
  criado_em timestamp with time zone default now() not null,
  atualizado_em timestamp with time zone default now() not null,
  finalizada_em timestamp with time zone,
  banco_pagador_revisar boolean default false not null,
  senha_inss text,
  planilha_enviada_em timestamp with time zone,
  planilha_linha integer
);
create table if not exists public.fontes_aquisicao (
  id uuid default gen_random_uuid() not null,
  nome text not null,
  slug text not null,
  descricao text,
  ativo boolean default true not null,
  criado_em timestamp with time zone default now() not null,
  atualizado_em timestamp with time zone default now() not null,
  organizacao_id uuid not null
);
create table if not exists public.funil_colunas (
  id uuid default gen_random_uuid() not null,
  funil_id uuid not null,
  organizacao_id uuid not null,
  nome text not null,
  cor text default '#64748b'::text not null,
  ordem integer default 0 not null,
  limite_cards integer,
  arquivada boolean default false not null,
  criado_em timestamp with time zone default now() not null,
  entrada boolean default false not null,
  resultado text default 'neutro'::text not null,
  encerra_oportunidade boolean default false not null,
  papel text
);
create table if not exists public.funis (
  id uuid default gen_random_uuid() not null,
  organizacao_id uuid not null,
  nome text not null,
  padrao boolean default false not null,
  ordem integer default 0 not null,
  arquivado boolean default false not null,
  criado_em timestamp with time zone default now() not null,
  atualizado_em timestamp with time zone default now() not null
);
create table if not exists public.ia_agentes (
  id uuid default gen_random_uuid() not null,
  organizacao_id uuid not null,
  nome text default 'Atendente de IA'::text not null,
  provedor text default 'gemini'::text not null,
  modelo text default 'gemini-3.6-flash'::text not null,
  persona_prompt text default ''::text not null,
  comportamentos jsonb default '{}'::jsonb not null,
  ativo boolean default false not null,
  chave_secret_id uuid,
  chave_definida_em timestamp with time zone,
  criado_em timestamp with time zone default now() not null,
  atualizado_em timestamp with time zone default now() not null,
  conhecimento text default ''::text not null
);
create table if not exists public.ia_credito_episodios (
  id uuid default gen_random_uuid() not null,
  provedor text default 'gemini'::text not null,
  aberto_em timestamp with time zone default now() not null,
  primeiro_erro_em timestamp with time zone not null,
  confirmado_por text not null,
  fechado_em timestamp with time zone,
  fechado_por text,
  voltou_em timestamp with time zone,
  aviso_status text default 'pendente'::text not null,
  aviso_tentativas integer default 0 not null,
  aviso_em timestamp with time zone,
  aviso_destino text,
  aviso_texto text,
  aviso_id_mensagem text,
  aviso_erro text,
  volta_status text,
  volta_em timestamp with time zone,
  volta_texto text,
  volta_id_mensagem text,
  volta_erro text,
  detalhe jsonb default '{}'::jsonb not null
);
create table if not exists public.ia_eventos (
  id uuid default gen_random_uuid() not null,
  sessao_id uuid not null,
  conversa_id uuid,
  organizacao_id uuid not null,
  tipo text not null,
  detalhe jsonb default '{}'::jsonb not null,
  tokens_in integer,
  tokens_out integer,
  criado_em timestamp with time zone default now() not null
);
create table if not exists public.ia_fluxos (
  id uuid default gen_random_uuid() not null,
  organizacao_id uuid not null,
  nome text default 'Novo fluxo'::text not null,
  descricao text default ''::text not null,
  passos jsonb default '[]'::jsonb not null,
  ativo boolean default false not null,
  criado_em timestamp with time zone default now() not null,
  atualizado_em timestamp with time zone default now() not null,
  gatilho jsonb default '{"tipo": "sempre"}'::jsonb not null
);
create table if not exists public.ia_pausas (
  id uuid default gen_random_uuid() not null,
  organizacao_id uuid not null,
  conversa_id uuid not null,
  usuario_id uuid,
  acao text not null,
  origem text not null,
  criado_em timestamp with time zone default now() not null
);
create table if not exists public.ia_sessoes (
  id uuid default gen_random_uuid() not null,
  organizacao_id uuid not null,
  canal_id uuid not null,
  conversa_id uuid not null,
  contato_id uuid not null,
  oportunidade_id uuid,
  etapa text default 'qualificacao_inss'::text not null,
  dados jsonb default '{}'::jsonb not null,
  docs jsonb default '{}'::jsonb not null,
  cobertura_extratos jsonb default '{}'::jsonb not null,
  tentativas_erro integer default 0 not null,
  ultima_msg_cliente_em timestamp with time zone,
  processar_apos timestamp with time zone,
  status text default 'ativa'::text not null,
  criado_em timestamp with time zone default now() not null,
  atualizado_em timestamp with time zone default now() not null
);
create table if not exists public.inss_documentos (
  id uuid default gen_random_uuid() not null,
  organizacao_id uuid not null,
  pedido_id uuid not null,
  contato_id uuid not null,
  titulo text not null,
  caminho text not null,
  tamanho_bytes bigint,
  criado_em timestamp with time zone default now() not null
);
create table if not exists public.inss_pedidos (
  id uuid default gen_random_uuid() not null,
  organizacao_id uuid not null,
  contato_id uuid not null,
  nome text not null,
  cpf text not null,
  documentos text[] default '{extrato_pagamento,extrato_consignado,carta_concessao,irpf,situacao_cadastral}'::text[] not null,
  status text default 'aberto'::text not null,
  erro text,
  solicitante_id uuid,
  criado_em timestamp with time zone default now() not null,
  atualizado_em timestamp with time zone default now() not null,
  finalizado_em timestamp with time zone,
  assumido_por text,
  bancos text[]
);
create table if not exists public.atd_integracoes (
  id uuid default gen_random_uuid() not null,
  provedor text not null,
  canal_id uuid,
  status integracao_status default 'desconectado'::integracao_status not null,
  ultima_sincronizacao timestamp with time zone,
  ultimo_erro text,
  config jsonb default '{}'::jsonb not null,
  segredo_ref text,
  criado_em timestamp with time zone default now() not null,
  atualizado_em timestamp with time zone default now() not null,
  organizacao_id uuid not null
);
create table if not exists public.iris_acesso (
  user_id uuid not null,
  criado_em timestamp with time zone default now() not null
);
create table if not exists public.iris_carteira (
  conversa_id uuid not null,
  organizacao_id uuid not null,
  oportunidade_id uuid,
  contato_id uuid,
  atendente_original_id uuid,
  atendente_original_nome text,
  contato_resp_original_id uuid,
  conversa_atend_original_id uuid,
  oportunidade_resp_original_id uuid,
  coluna_original_nome text,
  status_original text,
  entrada_original_em timestamp with time zone,
  lote text not null,
  estado text default 'na_fila'::text not null,
  entrou_em timestamp with time zone default now() not null,
  atualizado_em timestamp with time zone default now() not null
);
create table if not exists public.iris_eventos (
  id uuid default gen_random_uuid() not null,
  organizacao_id uuid not null,
  conversa_id uuid not null,
  etapa text,
  tipo text not null,
  texto_id text,
  criado_em timestamp with time zone default now() not null,
  detalhe jsonb default '{}'::jsonb not null
);
create table if not exists public.iris_fila_abertura (
  conversa_id uuid not null,
  ordem integer not null,
  status text default 'fila'::text not null,
  dia date,
  agendado_para timestamp with time zone,
  atualizado_em timestamp with time zone default now() not null
);
create table if not exists public.iris_followups (
  id uuid default gen_random_uuid() not null,
  organizacao_id uuid not null,
  contato_id uuid not null,
  conversa_id uuid not null,
  oportunidade_id uuid,
  status text default 'agendado'::text not null,
  origem text default 'manual'::text not null,
  confirmou_3_ligacoes_por uuid,
  confirmou_em timestamp with time zone,
  inicio_em timestamp with time zone,
  toques_enviados integer default 0 not null,
  ultimo_toque_em timestamp with time zone,
  criado_em timestamp with time zone default now() not null,
  atualizado_em timestamp with time zone default now() not null,
  campanha text default 'emprestimo'::text not null,
  motivo_fim text,
  encerrado_em timestamp with time zone,
  encerrado_por uuid,
  sinal_mensagem_id uuid,
  processando_ate timestamp with time zone
);
create table if not exists public.iris_monitor_achados (
  id uuid default gen_random_uuid() not null,
  organizacao_id uuid not null,
  ciclo_id uuid,
  conversa_id uuid,
  mensagem_id uuid,
  evento_id uuid,
  origem text not null,
  categoria text not null,
  subcategoria text not null,
  gravidade text not null,
  evidencia text not null,
  regra_violada text,
  sugestao text,
  regra_sugerida text,
  chave text,
  status text default 'aberto'::text not null,
  revisado_por uuid,
  revisado_em timestamp with time zone,
  alertado_em timestamp with time zone,
  criado_em timestamp with time zone default now() not null
);
create table if not exists public.iris_monitor_ciclos (
  id uuid default gen_random_uuid() not null,
  organizacao_id uuid not null,
  inicio timestamp with time zone not null,
  fim timestamp with time zone not null,
  escopo text default 'iris'::text not null,
  status text default 'rodando'::text not null,
  conversas_analisadas integer default 0 not null,
  mensagens_analisadas integer default 0 not null,
  mensagens_ia integer default 0 not null,
  conversas_pendentes integer default 0 not null,
  achados integer default 0 not null,
  achados_criticos integer default 0 not null,
  erro text,
  modelo text,
  tokens_in integer,
  tokens_out integer,
  detalhe jsonb default '{}'::jsonb not null,
  iniciado_em timestamp with time zone default now() not null,
  terminado_em timestamp with time zone,
  lease_ate timestamp with time zone
);
create table if not exists public.iris_teste_limpezas (
  id bigint default nextval('iris_teste_limpezas_id_seq'::regclass) not null,
  contato_id uuid not null,
  limpo_em timestamp with time zone default now() not null,
  por text default 'clean_whatsapp'::text not null,
  organizacao_id uuid not null,
  canal_id uuid,
  conversa_id uuid,
  detalhe jsonb default '{}'::jsonb not null
);
create table if not exists public.iris_textos (
  id text not null,
  texto text not null,
  tipo text not null,
  selo text not null,
  aprovado boolean default false not null,
  audio_path text,
  duracao_s numeric,
  atualizado_em timestamp with time zone default now() not null,
  bolhas text[] generated always as (regexp_split_to_array(btrim(texto, ' 	
'::text), '[ 	]*
[ 	]*
[ 	
]*'::text)) stored
);
create table if not exists public.ligacoes_marcadas (
  id uuid default gen_random_uuid() not null,
  organizacao_id uuid not null,
  conversa_id uuid,
  contato_id uuid not null,
  atendente_id uuid not null,
  dia date not null,
  periodo text not null,
  hora_preferida text,
  motivo text,
  status text default 'marcada'::text not null,
  criado_por text default 'iris'::text not null,
  lembrete_id uuid,
  criado_em timestamp with time zone default now() not null,
  atualizado_em timestamp with time zone default now() not null,
  status_em timestamp with time zone,
  status_por uuid,
  forma text default 'ligacao'::text not null
);
create table if not exists public.mensagens (
  id uuid default gen_random_uuid() not null,
  conversa_id uuid not null,
  direcao mensagem_direcao not null,
  tipo mensagem_tipo default 'texto'::mensagem_tipo not null,
  conteudo text,
  autor_id uuid,
  enviada_em timestamp with time zone default now() not null,
  criado_em timestamp with time zone default now() not null,
  id_externo text,
  conversa_id_externo text,
  status mensagem_status default 'pendente'::mensagem_status not null,
  respondida_a_id uuid,
  entregue_em timestamp with time zone,
  lida_em timestamp with time zone,
  recebida_em timestamp with time zone,
  processada_em timestamp with time zone,
  erro_envio text,
  metadados jsonb default '{}'::jsonb not null,
  organizacao_id uuid not null,
  origem text,
  assinatura_nome text,
  texto_original text,
  client_request_id text
);
create table if not exists public.mensagens_agendadas (
  id uuid default gen_random_uuid() not null,
  organizacao_id uuid not null,
  conversa_id uuid not null,
  contato_id uuid not null,
  canal_id uuid not null,
  nome_canal_snapshot text,
  telefone_canal_snapshot text,
  criado_por uuid,
  tipo text default 'texto'::text not null,
  texto text,
  storage_path text,
  mime_type text,
  nome_arquivo text,
  tamanho_bytes bigint,
  executar_em timestamp with time zone not null,
  timezone text default 'America/Sao_Paulo'::text not null,
  status text default 'agendada'::text not null,
  tentativas integer default 0 not null,
  max_tentativas integer default 3 not null,
  ultimo_erro text,
  motivo_bloqueio text,
  enviada_em timestamp with time zone,
  mensagem_id_enviada uuid,
  cancelada_em timestamp with time zone,
  cancelada_por uuid,
  editada_em timestamp with time zone,
  editada_por uuid,
  criado_em timestamp with time zone default now() not null,
  atualizado_em timestamp with time zone default now() not null,
  metadados jsonb default '{}'::jsonb not null,
  sequencia_id uuid,
  ordem_na_sequencia smallint,
  regua_ativacao_id uuid
);
create table if not exists public.midia_melhoria_ia (
  id uuid default gen_random_uuid() not null,
  organizacao_id uuid not null,
  contato_id uuid not null,
  mensagem_id uuid not null,
  anexo_path_original text not null,
  anexo_path_ia text,
  status text not null,
  modelo text,
  tentativas integer default 0 not null,
  divergencias jsonb,
  erro text,
  uso jsonb,
  criado_por uuid,
  criado_em timestamp with time zone default now() not null,
  atualizado_em timestamp with time zone default now() not null
);
create table if not exists public.atd_notificacoes (
  id uuid default gen_random_uuid() not null,
  organizacao_id uuid not null,
  usuario_id uuid,
  tipo text not null,
  titulo text not null,
  corpo text,
  rota text,
  ref_id uuid,
  lida_em timestamp with time zone,
  criado_em timestamp with time zone default now() not null
);
create table if not exists public.oportunidade_checklist (
  id uuid default gen_random_uuid() not null,
  organizacao_id uuid not null,
  oportunidade_id uuid not null,
  item_slug text not null,
  feito boolean default false not null,
  feito_em timestamp with time zone,
  feito_por uuid,
  criado_em timestamp with time zone default now() not null
);
create table if not exists public.oportunidade_eventos (
  id uuid default gen_random_uuid() not null,
  organizacao_id uuid not null,
  oportunidade_id uuid not null,
  evento text not null,
  coluna_anterior_id uuid,
  coluna_nova_id uuid,
  status_anterior text,
  status_novo text,
  resultado_anterior text,
  resultado_novo text,
  motivo_perda text,
  motivo_reabertura text,
  responsavel_no_fechamento_id uuid,
  executado_por uuid,
  criado_em timestamp with time zone default now() not null
);
create table if not exists public.oportunidades (
  id uuid default gen_random_uuid() not null,
  contato_id uuid,
  conversa_origem_id uuid,
  canal_origem_id uuid,
  responsavel_id uuid,
  status oportunidade_status default 'em_andamento'::oportunidade_status not null,
  fonte_aquisicao text,
  chip_origem text,
  metadados jsonb default '{}'::jsonb not null,
  criado_em timestamp with time zone default now() not null,
  atualizado_em timestamp with time zone default now() not null,
  fechado_em timestamp with time zone,
  organizacao_id uuid not null,
  funil_id uuid,
  coluna_id uuid,
  titulo text,
  telefone text,
  origem text,
  valor_estimado numeric(14,2),
  prioridade text,
  proxima_atividade date,
  etiquetas text[] default '{}'::text[] not null,
  observacoes text,
  ordem integer default 0 not null,
  contato_nome text,
  tipo_beneficio text,
  tipo_servico text default 'analise_inicial'::text not null,
  status_cancelamento text default 'nao_se_aplica'::text not null,
  status_ressarcimento text default 'nao_se_aplica'::text not null,
  numero_beneficio text,
  instituicao text,
  tipo_desconto text,
  data_inicio_desconto date,
  valor_desconto_mensal numeric(12,2),
  valor_ressarcimento_estimado numeric(12,2),
  valor_ressarcido numeric(12,2),
  fechado_por_id uuid,
  responsavel_no_fechamento_id uuid,
  motivo_perda text,
  motivo_perda_desc text,
  motivo_reabertura text,
  fechado_em_estimado boolean default false not null,
  entrada_em timestamp with time zone default now() not null,
  movimentado_em timestamp with time zone default now() not null,
  lembrete text,
  motivo_nao_elegivel text
);
create table if not exists public.organizacao_limites (
  organizacao_id uuid not null,
  usuarios_incluidos integer default 2 not null,
  usuarios_adicionais integer default 0 not null,
  limite_usuarios integer generated always as ((usuarios_incluidos + usuarios_adicionais)) stored,
  whatsapps_incluidos integer default 1 not null,
  whatsapps_adicionais integer default 0 not null,
  limite_whatsapps integer generated always as ((whatsapps_incluidos + whatsapps_adicionais)) stored,
  facebook_incluidos integer default 1 not null,
  facebook_adicionais integer default 0 not null,
  limite_facebook_contas integer generated always as ((facebook_incluidos + facebook_adicionais)) stored,
  atualizado_em timestamp with time zone default now() not null
);
create table if not exists public.organizacao_usuarios (
  id uuid default gen_random_uuid() not null,
  organizacao_id uuid not null,
  usuario_id uuid not null,
  papel user_role default 'atendente'::user_role not null,
  status membership_status default 'ativo'::membership_status not null,
  criado_em timestamp with time zone default now() not null,
  atualizado_em timestamp with time zone default now() not null,
  assinatura_modo text,
  assinatura_nome text
);
create table if not exists public.organizacoes (
  id uuid default gen_random_uuid() not null,
  nome text not null,
  nome_fantasia text,
  slug text not null,
  documento text,
  logo_url text,
  email text,
  telefone text,
  timezone text default 'America/Sao_Paulo'::text not null,
  moeda text default 'BRL'::text not null,
  status organizacao_status default 'em_implantacao'::organizacao_status not null,
  plano text,
  assinatura_status assinatura_status default 'teste'::assinatura_status not null,
  assinatura_inicio date,
  assinatura_vencimento date,
  configuracoes jsonb default '{}'::jsonb not null,
  criado_em timestamp with time zone default now() not null,
  atualizado_em timestamp with time zone default now() not null,
  asaas_customer_id text,
  assinatura_marca text
);
create table if not exists public.pendencias (
  id uuid default gen_random_uuid() not null,
  organizacao_id uuid not null,
  contato_id uuid not null,
  oportunidade_id uuid,
  conversa_id uuid not null,
  canal_id uuid not null,
  tipo text not null,
  o_que text not null,
  prazo date,
  processo text,
  responsavel_id uuid,
  criado_por uuid not null,
  status text default 'aguardando'::text not null,
  pausada boolean default false not null,
  primeiro_envio_em timestamp with time zone,
  resposta_texto text,
  resposta_em timestamp with time zone,
  resposta_mensagem_id uuid,
  resolvida_em timestamp with time zone,
  resolvida_por uuid,
  criado_em timestamp with time zone default now() not null,
  atualizado_em timestamp with time zone default now() not null,
  lembrar_desde timestamp with time zone
);
create table if not exists public.planilha_config (
  organizacao_id uuid not null,
  ativo boolean default false not null,
  atendentes text[] default ARRAY['JULIANA'::text, 'MATHEUS'::text, 'METHEUS'::text, 'MAHEUS'::text, 'ISADORA'::text, 'GIOVANA'::text, 'LUIZ'::text] not null,
  ultima_leitura_em timestamp with time zone,
  ultimas_linhas integer,
  atualizado_em timestamp with time zone default now() not null
);
create table if not exists public.planos (
  id uuid default gen_random_uuid() not null,
  nome text not null,
  slug text not null,
  valor_base_centavos integer not null,
  preco_usuario_adicional_centavos integer not null,
  preco_whatsapp_adicional_centavos integer not null,
  preco_facebook_centavos integer not null,
  usuarios_incluidos integer default 2 not null,
  whatsapps_incluidos integer default 1 not null,
  facebook_incluidos integer default 1 not null,
  ativo boolean default true not null,
  versao integer default 1 not null,
  vigente_desde date default CURRENT_DATE not null,
  criado_em timestamp with time zone default now() not null
);
create table if not exists public.presenciais (
  id uuid default gen_random_uuid() not null,
  organizacao_id uuid not null,
  contato_id uuid not null,
  oportunidade_id uuid,
  cliente_nome text not null,
  quando timestamp with time zone not null,
  observacao text,
  status text default 'marcado'::text not null,
  marcado_por uuid,
  marcado_em timestamp with time zone default now() not null,
  alterado_por uuid,
  atualizado_em timestamp with time zone default now() not null,
  desmarcado_em timestamp with time zone
);
create table if not exists public.presenciais_avisos (
  id bigint default nextval('presenciais_avisos_id_seq'::regclass) not null,
  organizacao_id uuid not null,
  presencial_id uuid,
  tipo text not null,
  dia date,
  texto text not null,
  status text default 'pendente'::text not null,
  tentativas integer default 0 not null,
  id_mensagem text,
  erro text,
  criado_em timestamp with time zone default now() not null,
  enviado_em timestamp with time zone
);
create table if not exists public.radar_textos (
  chave text not null,
  titulo text,
  texto text,
  atualizado_em timestamp with time zone default now() not null
);
create table if not exists public.recados_gestor (
  id uuid default gen_random_uuid() not null,
  organizacao_id uuid not null,
  de_id uuid not null,
  para_id uuid not null,
  contato_id uuid not null,
  conversa_id uuid,
  mensagem text not null,
  criado_em timestamp with time zone default now() not null,
  visto_em timestamp with time zone,
  resposta text,
  respondido_em timestamp with time zone,
  repassado_para uuid,
  devolvido boolean default false not null,
  gestor_visto_em timestamp with time zone,
  origem_id uuid,
  repassado_por uuid,
  repasse_motivo text,
  encerrado text,
  cliente_respondido_em timestamp with time zone
);
create table if not exists public.regua_ativacoes (
  id uuid default gen_random_uuid() not null,
  organizacao_id uuid not null,
  regua_id uuid not null,
  contato_id uuid not null,
  conversa_id uuid,
  canal_id uuid,
  responsavel_id uuid,
  status text default 'ativo'::text not null,
  passo_atual smallint default 0 not null,
  proximo_em timestamp with time zone,
  motivo_saida text,
  ativado_por uuid,
  ativado_em timestamp with time zone default now() not null,
  pausado_em timestamp with time zone,
  desativado_em timestamp with time zone,
  atualizado_em timestamp with time zone default now() not null
);
create table if not exists public.regua_envios (
  id uuid default gen_random_uuid() not null,
  organizacao_id uuid not null,
  ativacao_id uuid not null,
  passo_id uuid,
  mensagem_agendada_id uuid,
  status text not null,
  executar_em timestamp with time zone,
  enviado_em timestamp with time zone,
  erro text,
  resposta_em timestamp with time zone,
  criado_em timestamp with time zone default now() not null
);
create table if not exists public.regua_passos (
  id uuid default gen_random_uuid() not null,
  regua_id uuid not null,
  organizacao_id uuid not null,
  ordem smallint not null,
  titulo_interno text not null,
  tipo text not null,
  texto text,
  storage_path text,
  mime_type text,
  nome_arquivo text,
  tamanho_bytes bigint,
  agendamento_tipo text not null,
  offset_horas integer,
  dia_semana integer,
  hora time without time zone,
  data date,
  criado_em timestamp with time zone default now() not null,
  atualizado_em timestamp with time zone default now() not null
);
create table if not exists public.reguas (
  id uuid default gen_random_uuid() not null,
  organizacao_id uuid not null,
  nome text not null,
  objetivo text not null,
  status text default 'rascunho'::text not null,
  publico_sugerido text,
  pausar_se_responder boolean default true not null,
  teto_semana integer default 3 not null,
  intervalo_min_horas integer default 48 not null,
  dias_semana integer[] default '{1,2,3,4,5}'::integer[] not null,
  hora_inicio time without time zone default '08:00:00'::time without time zone not null,
  hora_fim time without time zone default '18:00:00'::time without time zone not null,
  timezone text default 'America/Sao_Paulo'::text not null,
  canal_padrao_id uuid,
  criado_por uuid,
  criado_em timestamp with time zone default now() not null,
  atualizado_em timestamp with time zone default now() not null
);
create table if not exists public.relacionamento_bloqueio (
  contato_id uuid not null,
  organizacao_id uuid not null,
  motivo text,
  criado_por uuid,
  criado_em timestamp with time zone default now() not null
);
create table if not exists public.remarketing_config (
  organizacao_id uuid not null,
  ativo boolean default false not null,
  ativo_desde timestamp with time zone,
  fluxo1_min integer default 15 not null,
  pendencia_dias integer default 2 not null,
  recuperacao_dias integer default 3 not null,
  fila_recuperacao uuid[] default '{}'::uuid[] not null,
  atualizado_em timestamp with time zone default now() not null
);
create table if not exists public.remarketing_eventos (
  id uuid default gen_random_uuid() not null,
  organizacao_id uuid not null,
  remarketing_id uuid not null,
  oportunidade_id uuid,
  tipo text not null,
  detalhe jsonb default '{}'::jsonb not null,
  usuario_id uuid,
  criado_em timestamp with time zone default now() not null
);
create table if not exists public.remarketing_leads (
  id uuid default gen_random_uuid() not null,
  organizacao_id uuid not null,
  oportunidade_id uuid not null,
  conversa_id uuid,
  contato_id uuid not null,
  etapa text not null,
  origem_fluxo text not null,
  status text default 'ativo'::text not null,
  tentativas integer default 0 not null,
  responsavel_id uuid,
  proxima_acao text,
  proxima_acao_em timestamp with time zone,
  entrou_etapa_em timestamp with time zone default now() not null,
  criado_em timestamp with time zone default now() not null,
  atualizado_em timestamp with time zone default now() not null,
  encerrado_em timestamp with time zone,
  score integer,
  score_calculado_em timestamp with time zone,
  score_fatores jsonb
);
create table if not exists public.remarketing_tarefas (
  id uuid default gen_random_uuid() not null,
  organizacao_id uuid not null,
  remarketing_id uuid not null,
  conversa_id uuid,
  contato_id uuid,
  responsavel_id uuid,
  titulo text not null,
  instrucoes text,
  sugestao_mensagem text,
  status text default 'pendente'::text not null,
  vence_em timestamp with time zone,
  criado_em timestamp with time zone default now() not null,
  concluida_em timestamp with time zone,
  concluida_por uuid,
  tipo text default 'acao'::text not null
);
create table if not exists public.retomada_atendimento_log (
  conversa_id uuid not null,
  mensagem_id uuid not null,
  decisao text not null,
  rota text,
  motivo text,
  antes jsonb,
  criado_em timestamp with time zone default now() not null
);
create table if not exists public.robo_ligar (
  conversa_id uuid not null,
  organizacao_id uuid not null,
  contato_id uuid,
  usuario_id uuid,
  ult_bot_em timestamp with time zone not null,
  ult_in_ref timestamp with time zone not null,
  notificado_em timestamp with time zone default now() not null,
  concluido_em timestamp with time zone,
  concluido_por uuid
);
create table if not exists public.script_anexos (
  id uuid default gen_random_uuid() not null,
  script_id uuid not null,
  tipo anexo_tipo not null,
  nome_arquivo text,
  mime_type text,
  tamanho_bytes bigint,
  storage_path text not null,
  criado_em timestamp with time zone default now() not null,
  organizacao_id uuid not null
);
create table if not exists public.script_categorias (
  id uuid default gen_random_uuid() not null,
  nome text not null,
  ordem integer default 0 not null,
  criado_em timestamp with time zone default now() not null,
  organizacao_id uuid not null
);
create table if not exists public.script_etapas (
  id uuid default gen_random_uuid() not null,
  script_id uuid not null,
  organizacao_id uuid not null,
  posicao integer default 0 not null,
  tipo script_etapa_tipo default 'texto'::script_etapa_tipo not null,
  conteudo text,
  storage_path text,
  nome_arquivo text,
  mime_type text,
  tamanho_bytes bigint,
  metadados jsonb default '{}'::jsonb not null,
  criado_em timestamp with time zone default now() not null
);
create table if not exists public.script_execucoes (
  id uuid default gen_random_uuid() not null,
  organizacao_id uuid not null,
  script_id uuid,
  conversa_id uuid,
  usuario_id uuid default auth.uid(),
  canal text not null,
  total_etapas integer default 0 not null,
  enviadas integer default 0 not null,
  falhas integer default 0 not null,
  status text default 'concluida'::text not null,
  criado_em timestamp with time zone default now() not null,
  entregues integer default 0 not null,
  pendentes integer default 0 not null,
  ultima_etapa_ok integer default 0 not null,
  erro text
);
create table if not exists public.scripts (
  id uuid default gen_random_uuid() not null,
  titulo text not null,
  categoria_id uuid,
  conteudo text not null,
  canais_permitidos canal_tipo[] default '{}'::canal_tipo[] not null,
  favorito boolean default false not null,
  autor_id uuid,
  criado_em timestamp with time zone default now() not null,
  atualizado_em timestamp with time zone default now() not null,
  organizacao_id uuid not null,
  descricao text,
  ativo boolean default true not null,
  tags text[] default '{}'::text[] not null
);
create table if not exists public.sla_alertas (
  id uuid default gen_random_uuid() not null,
  organizacao_id uuid not null,
  tipo text not null,
  severidade text not null,
  conversa_id uuid,
  oportunidade_id uuid,
  contato_id uuid,
  responsavel_id uuid,
  titulo text not null,
  detalhe text,
  vence_em timestamp with time zone,
  dedup_key text not null,
  criado_em timestamp with time zone default now() not null,
  atualizado_em timestamp with time zone default now() not null,
  resolvido_em timestamp with time zone,
  resolvido_por uuid,
  resolucao text,
  silenciado_ate timestamp with time zone,
  silenciado_por uuid,
  silenciado_motivo text
);
create table if not exists public.usuario_preferencias (
  usuario_id uuid not null,
  prefs jsonb default '{}'::jsonb not null,
  atualizado_em timestamp with time zone default now() not null
);
create table if not exists public.usuarios (
  id uuid not null,
  nome text not null,
  email text,
  papel user_role default 'atendente'::user_role not null,
  avatar_url text,
  ativo boolean default true not null,
  criado_em timestamp with time zone default now() not null,
  atualizado_em timestamp with time zone default now() not null,
  platform_admin boolean default false not null,
  telefone text,
  cargo text,
  deve_trocar_senha boolean default false not null
);
create table if not exists public.vacuo_config (
  organizacao_id uuid not null,
  ativo boolean default false not null,
  ativo_desde timestamp with time zone,
  aviso1_min integer default 15 not null,
  aviso2_min integer default 30 not null,
  aviso3_min integer default 45 not null,
  repasse_min integer default 60 not null,
  prio_aviso1_min integer default 10 not null,
  prio_aviso2_min integer default 20 not null,
  prio_aviso3_min integer default 30 not null,
  prio_repasse_min integer default 40 not null,
  hora_inicio smallint default 8 not null,
  hora_fim smallint default 20 not null,
  conversao_janela_dias integer default 30 not null,
  conversao_min_recebidos integer default 30 not null,
  max_repasses_dia integer default 25 not null,
  criado_em timestamp with time zone default now() not null,
  atualizado_em timestamp with time zone default now() not null,
  robo_ligar_min integer default 120 not null,
  robo_ligar_desde timestamp with time zone
);
create table if not exists public.vacuo_estado (
  conversa_id uuid not null,
  organizacao_id uuid not null,
  contato_id uuid,
  usuario_id uuid,
  base_em timestamp with time zone not null,
  ult_in_em timestamp with time zone,
  aviso smallint default 0 not null,
  aviso_em timestamp with time zone,
  atualizado_em timestamp with time zone default now() not null,
  decisao_pedida_em timestamp with time zone,
  prioritario boolean default false not null,
  prio_motivo text,
  minutos_vacuo integer,
  cutucado_em timestamp with time zone,
  cutucadas integer default 0 not null,
  fechado boolean default false not null,
  cutucado_por uuid,
  espera_desde timestamp with time zone
);
create table if not exists public.vacuo_repasses (
  id uuid default gen_random_uuid() not null,
  organizacao_id uuid not null,
  conversa_id uuid not null,
  contato_id uuid,
  oportunidade_id uuid,
  de_usuario_id uuid not null,
  para_usuario_id uuid not null,
  avisos smallint default 3 not null,
  minutos_vacuo integer,
  prioritario boolean default false not null,
  prio_motivo text,
  criado_em timestamp with time zone default now() not null,
  decisao text default 'repassado'::text not null,
  decidido_por uuid,
  desfeito_em timestamp with time zone
);
create table if not exists public.wa_audio_diag (
  correlation_id text not null,
  organizacao_id uuid,
  blob_mime text,
  blob_size integer,
  container_real text,
  endpoint text,
  ptt boolean,
  base64_len integer,
  http_status integer,
  key_id text,
  erro text,
  criado_em timestamp with time zone default now() not null
);
create table if not exists public.wa_lid_map (
  id uuid default gen_random_uuid() not null,
  organizacao_id uuid not null,
  canal_id uuid,
  lid text not null,
  jid_telefone text,
  telefone_normalizado text,
  fonte text default 'webhook'::text not null,
  confirmado boolean default false not null,
  criado_em timestamp with time zone default now() not null,
  atualizado_em timestamp with time zone default now() not null
);
create table if not exists public.atd_wa_optout (
  contato_id uuid not null,
  canal_id uuid not null,
  organizacao_id uuid not null,
  waba_id text,
  motivo text not null,
  detalhe text,
  criado_em timestamp with time zone default now() not null
);
create table if not exists public.wa_templates (
  id uuid default gen_random_uuid() not null,
  organizacao_id uuid not null,
  canal_id uuid,
  waba_id text,
  nome text not null,
  idioma text default 'pt_BR'::text not null,
  categoria text default 'MARKETING'::text not null,
  corpo text not null,
  variaveis jsonb default '[]'::jsonb not null,
  status text default 'rascunho'::text not null,
  status_motivo text,
  meta_template_id text,
  sincronizado_em timestamp with time zone,
  usar_em_remarketing boolean default false not null,
  ativo boolean default true not null,
  criado_por uuid,
  criado_em timestamp with time zone default now() not null,
  atualizado_em timestamp with time zone default now() not null,
  atualizado_por uuid,
  metadados jsonb default '{}'::jsonb not null,
  toque integer
);
create table if not exists public.webhook_config (
  chave text not null,
  secret text not null,
  atualizado_em timestamp with time zone default now() not null
);
create table if not exists public.whatsapp_webhook_events (
  id uuid default gen_random_uuid() not null,
  organizacao_id uuid,
  canal_id uuid,
  instance_name text,
  instance_id text,
  event text,
  provider_message_id text,
  remote_jid text,
  addressing_mode text,
  from_me boolean,
  payload jsonb,
  recebido_em timestamp with time zone default now() not null,
  status_processamento text default 'recebido'::text not null,
  ignorado_motivo text,
  erro text,
  processado_em timestamp with time zone
);

-- 4. chaves, únicos e conferências
do $$ begin if not exists (select 1 from pg_constraint where conname = 'adm_casos_pkey' and conrelid = 'public.adm_casos'::regclass) then alter table public.adm_casos add constraint adm_casos_pkey PRIMARY KEY (organizacao_id, caso_id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'adm_config_pkey' and conrelid = 'public.adm_config'::regclass) then alter table public.adm_config add constraint adm_config_pkey PRIMARY KEY (organizacao_id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'adm_fechados_pkey' and conrelid = 'public.adm_fechados'::regclass) then alter table public.adm_fechados add constraint adm_fechados_pkey PRIMARY KEY (organizacao_id, chave); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'adm_movimentos_pkey' and conrelid = 'public.adm_movimentos'::regclass) then alter table public.adm_movimentos add constraint adm_movimentos_pkey PRIMARY KEY (id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'adm_pendencias_pkey' and conrelid = 'public.adm_pendencias'::regclass) then alter table public.adm_pendencias add constraint adm_pendencias_pkey PRIMARY KEY (organizacao_id, caso_id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'adm_placar_pkey' and conrelid = 'public.adm_placar'::regclass) then alter table public.adm_placar add constraint adm_placar_pkey PRIMARY KEY (organizacao_id, mes, vendedor); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'agendamento_atividades_pkey' and conrelid = 'public.agendamento_atividades'::regclass) then alter table public.agendamento_atividades add constraint agendamento_atividades_pkey PRIMARY KEY (id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'chk_agendamento_periodo' and conrelid = 'public.agendamentos'::regclass) then alter table public.agendamentos add constraint chk_agendamento_periodo CHECK ((fim_em > inicio_em)); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'agendamentos_pkey' and conrelid = 'public.agendamentos'::regclass) then alter table public.agendamentos add constraint agendamentos_pkey PRIMARY KEY (id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'alertas_lead_quente_status_check' and conrelid = 'public.alertas_lead_quente'::regclass) then alter table public.alertas_lead_quente add constraint alertas_lead_quente_status_check CHECK ((status = ANY (ARRAY['pendente'::text, 'assumido'::text, 'cancelado'::text]))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'alertas_lead_quente_tipo_check' and conrelid = 'public.alertas_lead_quente'::regclass) then alter table public.alertas_lead_quente add constraint alertas_lead_quente_tipo_check CHECK ((tipo = ANY (ARRAY['abandono'::text, 'concluido'::text]))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'alertas_lead_quente_pkey' and conrelid = 'public.alertas_lead_quente'::regclass) then alter table public.alertas_lead_quente add constraint alertas_lead_quente_pkey PRIMARY KEY (id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'alertas_lead_quente_conversa_tipo_unica' and conrelid = 'public.alertas_lead_quente'::regclass) then alter table public.alertas_lead_quente add constraint alertas_lead_quente_conversa_tipo_unica UNIQUE (conversa_id, tipo); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'assinatura_itens_pkey' and conrelid = 'public.assinatura_itens'::regclass) then alter table public.assinatura_itens add constraint assinatura_itens_pkey PRIMARY KEY (id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'assinaturas_pkey' and conrelid = 'public.assinaturas'::regclass) then alter table public.assinaturas add constraint assinaturas_pkey PRIMARY KEY (id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'assinaturas_organizacao_id_key' and conrelid = 'public.assinaturas'::regclass) then alter table public.assinaturas add constraint assinaturas_organizacao_id_key UNIQUE (organizacao_id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'assistente_lembretes_status_check' and conrelid = 'public.assistente_lembretes'::regclass) then alter table public.assistente_lembretes add constraint assistente_lembretes_status_check CHECK ((status = ANY (ARRAY['pendente'::text, 'avisado'::text, 'ok'::text, 'cancelado'::text]))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'assistente_lembretes_texto_check' and conrelid = 'public.assistente_lembretes'::regclass) then alter table public.assistente_lembretes add constraint assistente_lembretes_texto_check CHECK (((char_length(texto) >= 1) AND (char_length(texto) <= 200))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'assistente_lembretes_pkey' and conrelid = 'public.assistente_lembretes'::regclass) then alter table public.assistente_lembretes add constraint assistente_lembretes_pkey PRIMARY KEY (id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'audit_log_pkey' and conrelid = 'public.audit_log'::regclass) then alter table public.audit_log add constraint audit_log_pkey PRIMARY KEY (id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'avisos_passado_humano_pkey' and conrelid = 'public.avisos_passado_humano'::regclass) then alter table public.avisos_passado_humano add constraint avisos_passado_humano_pkey PRIMARY KEY (id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'bom_dia_gestores_pkey' and conrelid = 'public.bom_dia_gestores'::regclass) then alter table public.bom_dia_gestores add constraint bom_dia_gestores_pkey PRIMARY KEY (organizacao_id, usuario_id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'bot_canal_config_iris_config_check' and conrelid = 'public.bot_canal_config'::regclass) then alter table public.bot_canal_config add constraint bot_canal_config_iris_config_check CHECK (((jsonb_typeof(iris_config) = 'object'::text) AND ((NOT (iris_config ? 'ativo'::text)) OR (jsonb_typeof((iris_config -> 'ativo'::text)) = 'boolean'::text)) AND ((NOT (iris_config ? 'somente_teste'::text)) OR (jsonb_typeof((iris_config -> 'somente_teste'::text)) = 'boolean'::text)))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'bot_canal_config_pkey' and conrelid = 'public.bot_canal_config'::regclass) then alter table public.bot_canal_config add constraint bot_canal_config_pkey PRIMARY KEY (id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'bot_canal_config_canal_id_key' and conrelid = 'public.bot_canal_config'::regclass) then alter table public.bot_canal_config add constraint bot_canal_config_canal_id_key UNIQUE (canal_id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'bot_conversa_estado_etapa_check' and conrelid = 'public.bot_conversa_estado'::regclass) then alter table public.bot_conversa_estado add constraint bot_conversa_estado_etapa_check CHECK ((etapa = ANY (ARRAY['inicio'::text, 'aguardando_beneficio'::text, 'aguardando_agibank_bmg'::text, 'aguardando_banco'::text, 'aguardando_nome'::text, 'aguardando_cpf'::text, 'aguardando_preferencia'::text, 'ia'::text, 'concluido'::text, 'pausado_humano'::text, 'pausado_audio'::text]))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'bot_conversa_estado_pkey' and conrelid = 'public.bot_conversa_estado'::regclass) then alter table public.bot_conversa_estado add constraint bot_conversa_estado_pkey PRIMARY KEY (conversa_id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'bot_mensagens_saida_status_check' and conrelid = 'public.bot_mensagens_saida'::regclass) then alter table public.bot_mensagens_saida add constraint bot_mensagens_saida_status_check CHECK ((status = ANY (ARRAY['pendente'::text, 'agendada'::text, 'enviando'::text, 'enviada'::text, 'falhou'::text, 'simulada'::text, 'cancelada'::text]))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'bot_mensagens_saida_tipo_check' and conrelid = 'public.bot_mensagens_saida'::regclass) then alter table public.bot_mensagens_saida add constraint bot_mensagens_saida_tipo_check CHECK ((tipo = ANY (ARRAY['texto'::text, 'video'::text, 'audio'::text]))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'bot_mensagens_saida_pkey' and conrelid = 'public.bot_mensagens_saida'::regclass) then alter table public.bot_mensagens_saida add constraint bot_mensagens_saida_pkey PRIMARY KEY (id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'bot_mensagens_saida_conversa_id_etapa_ordem_key' and conrelid = 'public.bot_mensagens_saida'::regclass) then alter table public.bot_mensagens_saida add constraint bot_mensagens_saida_conversa_id_etapa_ordem_key UNIQUE (conversa_id, etapa, ordem); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'bot_remarketing_status_check' and conrelid = 'public.bot_remarketing'::regclass) then alter table public.bot_remarketing add constraint bot_remarketing_status_check CHECK ((status = ANY (ARRAY['ativo'::text, 'pausado'::text, 'respondeu'::text, 'optout'::text, 'cancelado'::text, 'concluido'::text]))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'bot_remarketing_pkey' and conrelid = 'public.bot_remarketing'::regclass) then alter table public.bot_remarketing add constraint bot_remarketing_pkey PRIMARY KEY (id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'bot_roteamentos_genero_check' and conrelid = 'public.bot_roteamentos'::regclass) then alter table public.bot_roteamentos add constraint bot_roteamentos_genero_check CHECK ((genero = ANY (ARRAY['homem'::text, 'mulher'::text, 'ambiguo'::text]))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'bot_roteamentos_pkey' and conrelid = 'public.bot_roteamentos'::regclass) then alter table public.bot_roteamentos add constraint bot_roteamentos_pkey PRIMARY KEY (id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'canais_cloud_requer_phone_number_id' and conrelid = 'public.canais'::regclass) then alter table public.canais add constraint canais_cloud_requer_phone_number_id CHECK (((transporte <> 'cloud_api'::text) OR (cloud_phone_number_id IS NOT NULL))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'canais_cloud_so_whatsapp' and conrelid = 'public.canais'::regclass) then alter table public.canais add constraint canais_cloud_so_whatsapp CHECK (((transporte <> 'cloud_api'::text) OR (tipo = 'whatsapp'::canal_tipo))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'canais_origem_tipo_check' and conrelid = 'public.canais'::regclass) then alter table public.canais add constraint canais_origem_tipo_check CHECK ((origem_tipo = ANY (ARRAY['trafego'::text, 'ura'::text, 'organico'::text, 'indicacao'::text, 'campanha'::text, 'parceiro'::text, 'outro'::text]))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'canais_papel_check' and conrelid = 'public.canais'::regclass) then alter table public.canais add constraint canais_papel_check CHECK ((papel = ANY (ARRAY['atendimento'::text, 'disparo'::text, 'ambos'::text, 'notificacao'::text]))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'canais_transporte_check' and conrelid = 'public.canais'::regclass) then alter table public.canais add constraint canais_transporte_check CHECK ((transporte = ANY (ARRAY['evolution'::text, 'cloud_api'::text]))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'canais_pkey' and conrelid = 'public.canais'::regclass) then alter table public.canais add constraint canais_pkey PRIMARY KEY (id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'canais_id_org_uniq' and conrelid = 'public.canais'::regclass) then alter table public.canais add constraint canais_id_org_uniq UNIQUE (id, organizacao_id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'canal_health_runs_pkey' and conrelid = 'public.canal_health_runs'::regclass) then alter table public.canal_health_runs add constraint canal_health_runs_pkey PRIMARY KEY (id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'canal_janela_pkey' and conrelid = 'public.canal_janela'::regclass) then alter table public.canal_janela add constraint canal_janela_pkey PRIMARY KEY (canal_id, contato_id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'checklist_modelo_pkey' and conrelid = 'public.checklist_modelo'::regclass) then alter table public.checklist_modelo add constraint checklist_modelo_pkey PRIMARY KEY (item_slug); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'ciclos_vencimento_grupo_check' and conrelid = 'public.ciclos_vencimento'::regclass) then alter table public.ciclos_vencimento add constraint ciclos_vencimento_grupo_check CHECK ((grupo = ANY (ARRAY['inicio_mes'::text, 'fim_mes'::text, 'livre'::text]))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'ciclos_vencimento_pkey' and conrelid = 'public.ciclos_vencimento'::regclass) then alter table public.ciclos_vencimento add constraint ciclos_vencimento_pkey PRIMARY KEY (id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'ciclos_vencimento_organizacao_id_codigo_key' and conrelid = 'public.ciclos_vencimento'::regclass) then alter table public.ciclos_vencimento add constraint ciclos_vencimento_organizacao_id_codigo_key UNIQUE (organizacao_id, codigo); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'cobranca_eventos_pkey' and conrelid = 'public.cobranca_eventos'::regclass) then alter table public.cobranca_eventos add constraint cobranca_eventos_pkey PRIMARY KEY (id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'chk_pag_coerencia' and conrelid = 'public.cobranca_pagamentos'::regclass) then alter table public.cobranca_pagamentos add constraint chk_pag_coerencia CHECK ((((status = 'paga'::text) AND (valor_pago IS NOT NULL) AND (data_pagamento IS NOT NULL)) OR ((status = ANY (ARRAY['prevista'::text, 'nao_paga'::text, 'cancelada'::text, 'nao_aplicavel'::text, 'sem_registro'::text])) AND (valor_pago IS NULL) AND (data_pagamento IS NULL)))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'chk_pag_valor_pos' and conrelid = 'public.cobranca_pagamentos'::regclass) then alter table public.cobranca_pagamentos add constraint chk_pag_valor_pos CHECK ((valor > (0)::numeric)); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'cobranca_pagamentos_pkey' and conrelid = 'public.cobranca_pagamentos'::regclass) then alter table public.cobranca_pagamentos add constraint cobranca_pagamentos_pkey PRIMARY KEY (id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'cobranca_pagamentos_cobranca_id_ciclo_key' and conrelid = 'public.cobranca_pagamentos'::regclass) then alter table public.cobranca_pagamentos add constraint cobranca_pagamentos_cobranca_id_ciclo_key UNIQUE (cobranca_id, ciclo); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'chk_cob_ciclos' and conrelid = 'public.cobrancas'::regclass) then alter table public.cobrancas add constraint chk_cob_ciclos CHECK (((ciclos_totais >= 1) AND (ciclos_totais <= 60))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'chk_cob_valor_pos' and conrelid = 'public.cobrancas'::regclass) then alter table public.cobrancas add constraint chk_cob_valor_pos CHECK ((valor_mensal > (0)::numeric)); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'cobrancas_dia_cobranca_check' and conrelid = 'public.cobrancas'::regclass) then alter table public.cobrancas add constraint cobrancas_dia_cobranca_check CHECK (((dia_cobranca >= 1) AND (dia_cobranca <= 31))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'cobrancas_pkey' and conrelid = 'public.cobrancas'::regclass) then alter table public.cobrancas add constraint cobrancas_pkey PRIMARY KEY (id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'cobrancas_id_org_uniq' and conrelid = 'public.cobrancas'::regclass) then alter table public.cobrancas add constraint cobrancas_id_org_uniq UNIQUE (id, organizacao_id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'configuracoes_pkey' and conrelid = 'public.configuracoes'::regclass) then alter table public.configuracoes add constraint configuracoes_pkey PRIMARY KEY (organizacao_id, chave); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'contato_identidades_pkey' and conrelid = 'public.contato_identidades'::regclass) then alter table public.contato_identidades add constraint contato_identidades_pkey PRIMARY KEY (id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'contatos_nome_fonte_check' and conrelid = 'public.contatos'::regclass) then alter table public.contatos add constraint contatos_nome_fonte_check CHECK ((nome_fonte = ANY (ARRAY['whatsapp'::text, 'bot'::text, 'manual'::text, 'sistema'::text]))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'contatos_pkey' and conrelid = 'public.contatos'::regclass) then alter table public.contatos add constraint contatos_pkey PRIMARY KEY (id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'contatos_id_org_uniq' and conrelid = 'public.contatos'::regclass) then alter table public.contatos add constraint contatos_id_org_uniq UNIQUE (id, organizacao_id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'conversa_atividades_pkey' and conrelid = 'public.conversa_atividades'::regclass) then alter table public.conversa_atividades add constraint conversa_atividades_pkey PRIMARY KEY (id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'conversa_etiquetas_pkey' and conrelid = 'public.conversa_etiquetas'::regclass) then alter table public.conversa_etiquetas add constraint conversa_etiquetas_pkey PRIMARY KEY (id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'conversa_etiquetas_conversa_id_etiqueta_id_key' and conrelid = 'public.conversa_etiquetas'::regclass) then alter table public.conversa_etiquetas add constraint conversa_etiquetas_conversa_id_etiqueta_id_key UNIQUE (conversa_id, etiqueta_id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'conversa_higiene_adiamentos_tipo_check' and conrelid = 'public.conversa_higiene_adiamentos'::regclass) then alter table public.conversa_higiene_adiamentos add constraint conversa_higiene_adiamentos_tipo_check CHECK ((tipo = ANY (ARRAY['nome_adiado'::text, 'nome_nao_informado'::text]))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'conversa_higiene_adiamentos_pkey' and conrelid = 'public.conversa_higiene_adiamentos'::regclass) then alter table public.conversa_higiene_adiamentos add constraint conversa_higiene_adiamentos_pkey PRIMARY KEY (id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'conversa_status_def_pkey' and conrelid = 'public.conversa_status_def'::regclass) then alter table public.conversa_status_def add constraint conversa_status_def_pkey PRIMARY KEY (id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'conversa_status_def_organizacao_id_slug_key' and conrelid = 'public.conversa_status_def'::regclass) then alter table public.conversa_status_def add constraint conversa_status_def_organizacao_id_slug_key UNIQUE (organizacao_id, slug); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'conversas_pkey' and conrelid = 'public.conversas'::regclass) then alter table public.conversas add constraint conversas_pkey PRIMARY KEY (id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'conversas_id_org_uniq' and conrelid = 'public.conversas'::regclass) then alter table public.conversas add constraint conversas_id_org_uniq UNIQUE (id, organizacao_id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'convites_pkey' and conrelid = 'public.convites'::regclass) then alter table public.convites add constraint convites_pkey PRIMARY KEY (id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'etiquetas_pkey' and conrelid = 'public.etiquetas'::regclass) then alter table public.etiquetas add constraint etiquetas_pkey PRIMARY KEY (id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'chk_ficha_avi_arr' and conrelid = 'public.fichas_judiciais'::regclass) then alter table public.fichas_judiciais add constraint chk_ficha_avi_arr CHECK ((jsonb_typeof(avisos) = 'array'::text)); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'chk_ficha_idade_nn' and conrelid = 'public.fichas_judiciais'::regclass) then alter table public.fichas_judiciais add constraint chk_ficha_idade_nn CHECK (((idade_informada IS NULL) OR (idade_informada >= 0))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'chk_ficha_rev_arr' and conrelid = 'public.fichas_judiciais'::regclass) then alter table public.fichas_judiciais add constraint chk_ficha_rev_arr CHECK ((jsonb_typeof(revisoes) = 'array'::text)); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'chk_ficha_v1' and conrelid = 'public.fichas_judiciais'::regclass) then alter table public.fichas_judiciais add constraint chk_ficha_v1 CHECK (((versao = 1) OR (ficha_anterior_id IS NOT NULL))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'chk_ficha_valor_nn' and conrelid = 'public.fichas_judiciais'::regclass) then alter table public.fichas_judiciais add constraint chk_ficha_valor_nn CHECK (((valor_beneficio IS NULL) OR (valor_beneficio >= (0)::numeric))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'chk_ficha_versao' and conrelid = 'public.fichas_judiciais'::regclass) then alter table public.fichas_judiciais add constraint chk_ficha_versao CHECK ((versao >= 1)); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'fichas_judiciais_status_check' and conrelid = 'public.fichas_judiciais'::regclass) then alter table public.fichas_judiciais add constraint fichas_judiciais_status_check CHECK ((status = ANY (ARRAY['rascunho'::text, 'finalizada'::text]))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'fichas_judiciais_tipo_beneficio_check' and conrelid = 'public.fichas_judiciais'::regclass) then alter table public.fichas_judiciais add constraint fichas_judiciais_tipo_beneficio_check CHECK (((tipo_beneficio IS NULL) OR (tipo_beneficio = ANY (ARRAY['aposentadoria'::text, 'pensao_por_morte'::text, 'bpc_loas'::text, 'outro'::text])))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'fichas_judiciais_pkey' and conrelid = 'public.fichas_judiciais'::regclass) then alter table public.fichas_judiciais add constraint fichas_judiciais_pkey PRIMARY KEY (id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'fontes_aquisicao_pkey' and conrelid = 'public.fontes_aquisicao'::regclass) then alter table public.fontes_aquisicao add constraint fontes_aquisicao_pkey PRIMARY KEY (id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'funil_colunas_resultado_chk' and conrelid = 'public.funil_colunas'::regclass) then alter table public.funil_colunas add constraint funil_colunas_resultado_chk CHECK ((resultado = ANY (ARRAY['neutro'::text, 'ganho'::text, 'perdido'::text]))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'funil_colunas_pkey' and conrelid = 'public.funil_colunas'::regclass) then alter table public.funil_colunas add constraint funil_colunas_pkey PRIMARY KEY (id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'funis_pkey' and conrelid = 'public.funis'::regclass) then alter table public.funis add constraint funis_pkey PRIMARY KEY (id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'ia_agentes_provedor_chk' and conrelid = 'public.ia_agentes'::regclass) then alter table public.ia_agentes add constraint ia_agentes_provedor_chk CHECK ((provedor = ANY (ARRAY['gemini'::text, 'openai'::text, 'anthropic'::text]))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'ia_agentes_pkey' and conrelid = 'public.ia_agentes'::regclass) then alter table public.ia_agentes add constraint ia_agentes_pkey PRIMARY KEY (id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'ia_credito_episodios_aviso_status_check' and conrelid = 'public.ia_credito_episodios'::regclass) then alter table public.ia_credito_episodios add constraint ia_credito_episodios_aviso_status_check CHECK ((aviso_status = ANY (ARRAY['pendente'::text, 'enviando'::text, 'enviado'::text, 'incerto'::text, 'falhou'::text, 'bloqueado'::text]))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'ia_credito_episodios_confirmado_por_check' and conrelid = 'public.ia_credito_episodios'::regclass) then alter table public.ia_credito_episodios add constraint ia_credito_episodios_confirmado_por_check CHECK ((confirmado_por = ANY (ARRAY['sonda'::text, 'passivo'::text]))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'ia_credito_episodios_fechado_por_check' and conrelid = 'public.ia_credito_episodios'::regclass) then alter table public.ia_credito_episodios add constraint ia_credito_episodios_fechado_por_check CHECK ((fechado_por = ANY (ARRAY['sonda'::text, 'passivo'::text]))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'ia_credito_episodios_provedor_check' and conrelid = 'public.ia_credito_episodios'::regclass) then alter table public.ia_credito_episodios add constraint ia_credito_episodios_provedor_check CHECK ((provedor = 'gemini'::text)); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'ia_credito_episodios_volta_status_check' and conrelid = 'public.ia_credito_episodios'::regclass) then alter table public.ia_credito_episodios add constraint ia_credito_episodios_volta_status_check CHECK ((volta_status = ANY (ARRAY['enviando'::text, 'enviado'::text, 'incerto'::text, 'falhou'::text, 'desligado'::text, 'nao_aplica'::text]))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'ia_credito_episodios_pkey' and conrelid = 'public.ia_credito_episodios'::regclass) then alter table public.ia_credito_episodios add constraint ia_credito_episodios_pkey PRIMARY KEY (id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'ia_eventos_pkey' and conrelid = 'public.ia_eventos'::regclass) then alter table public.ia_eventos add constraint ia_eventos_pkey PRIMARY KEY (id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'ia_fluxos_pkey' and conrelid = 'public.ia_fluxos'::regclass) then alter table public.ia_fluxos add constraint ia_fluxos_pkey PRIMARY KEY (id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'ia_pausas_acao_check' and conrelid = 'public.ia_pausas'::regclass) then alter table public.ia_pausas add constraint ia_pausas_acao_check CHECK ((acao = ANY (ARRAY['pausou'::text, 'religou'::text]))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'ia_pausas_origem_check' and conrelid = 'public.ia_pausas'::regclass) then alter table public.ia_pausas add constraint ia_pausas_origem_check CHECK ((origem = ANY (ARRAY['trava_envio'::text, 'cabecalho'::text]))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'ia_pausas_pkey' and conrelid = 'public.ia_pausas'::regclass) then alter table public.ia_pausas add constraint ia_pausas_pkey PRIMARY KEY (id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'ia_sessoes_status_check' and conrelid = 'public.ia_sessoes'::regclass) then alter table public.ia_sessoes add constraint ia_sessoes_status_check CHECK ((status = ANY (ARRAY['ativa'::text, 'pausada'::text, 'handoff'::text, 'concluida'::text, 'encerrada'::text]))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'ia_sessoes_pkey' and conrelid = 'public.ia_sessoes'::regclass) then alter table public.ia_sessoes add constraint ia_sessoes_pkey PRIMARY KEY (id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'ia_sessoes_conversa_id_key' and conrelid = 'public.ia_sessoes'::regclass) then alter table public.ia_sessoes add constraint ia_sessoes_conversa_id_key UNIQUE (conversa_id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'inss_documentos_pkey' and conrelid = 'public.inss_documentos'::regclass) then alter table public.inss_documentos add constraint inss_documentos_pkey PRIMARY KEY (id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'inss_documentos_caminho_key' and conrelid = 'public.inss_documentos'::regclass) then alter table public.inss_documentos add constraint inss_documentos_caminho_key UNIQUE (caminho); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'inss_pedidos_status_check' and conrelid = 'public.inss_pedidos'::regclass) then alter table public.inss_pedidos add constraint inss_pedidos_status_check CHECK ((status = ANY (ARRAY['aberto'::text, 'em_andamento'::text, 'pronto'::text, 'falhou'::text, 'cancelado'::text]))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'inss_pedidos_pkey' and conrelid = 'public.inss_pedidos'::regclass) then alter table public.inss_pedidos add constraint inss_pedidos_pkey PRIMARY KEY (id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'atd_integracoes_pkey' and conrelid = 'public.atd_integracoes'::regclass) then alter table public.atd_integracoes add constraint atd_integracoes_pkey PRIMARY KEY (id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'iris_acesso_pkey' and conrelid = 'public.iris_acesso'::regclass) then alter table public.iris_acesso add constraint iris_acesso_pkey PRIMARY KEY (user_id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'iris_carteira_estado_check' and conrelid = 'public.iris_carteira'::regclass) then alter table public.iris_carteira add constraint iris_carteira_estado_check CHECK ((estado = ANY (ARRAY['na_fila'::text, 'abertura_agendada'::text, 'em_contato'::text, 'qualificando'::text, 'documentos'::text, 'pronto_atendente'::text, 'pausado'::text, 'saiu'::text]))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'iris_carteira_pkey' and conrelid = 'public.iris_carteira'::regclass) then alter table public.iris_carteira add constraint iris_carteira_pkey PRIMARY KEY (conversa_id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'iris_eventos_detalhe_check' and conrelid = 'public.iris_eventos'::regclass) then alter table public.iris_eventos add constraint iris_eventos_detalhe_check CHECK (((jsonb_typeof(detalhe) = 'object'::text) AND (pg_column_size(detalhe) <= 8000))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'iris_eventos_etapa_check' and conrelid = 'public.iris_eventos'::regclass) then alter table public.iris_eventos add constraint iris_eventos_etapa_check CHECK ((char_length(etapa) <= 60)); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'iris_eventos_tipo_check' and conrelid = 'public.iris_eventos'::regclass) then alter table public.iris_eventos add constraint iris_eventos_tipo_check CHECK (((tipo = ANY (ARRAY['retomada'::text, 'recuperacao'::text, 'audio'::text, 'objecao'::text, 'agendamento'::text, 'guarda_critica'::text])) OR (tipo ~ '^(conversa|followup|monitor|teste)_[a-z0-9_]{1,60}$'::text))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'iris_eventos_pkey' and conrelid = 'public.iris_eventos'::regclass) then alter table public.iris_eventos add constraint iris_eventos_pkey PRIMARY KEY (id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'iris_fila_abertura_status_check' and conrelid = 'public.iris_fila_abertura'::regclass) then alter table public.iris_fila_abertura add constraint iris_fila_abertura_status_check CHECK ((status = ANY (ARRAY['fila'::text, 'agendado'::text, 'enviado'::text, 'respondeu'::text, 'pulado'::text]))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'iris_fila_abertura_pkey' and conrelid = 'public.iris_fila_abertura'::regclass) then alter table public.iris_fila_abertura add constraint iris_fila_abertura_pkey PRIMARY KEY (conversa_id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'iris_followups_campanha_check' and conrelid = 'public.iris_followups'::regclass) then alter table public.iris_followups add constraint iris_followups_campanha_check CHECK ((campanha = ANY (ARRAY['emprestimo'::text, 'juros'::text]))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'iris_followups_confirmacao_check' and conrelid = 'public.iris_followups'::regclass) then alter table public.iris_followups add constraint iris_followups_confirmacao_check CHECK (((status = 'candidato'::text) OR ((confirmou_em IS NOT NULL) AND (inicio_em IS NOT NULL)))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'iris_followups_motivo_fim_check' and conrelid = 'public.iris_followups'::regclass) then alter table public.iris_followups add constraint iris_followups_motivo_fim_check CHECK ((char_length(motivo_fim) <= 200)); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'iris_followups_origem_check' and conrelid = 'public.iris_followups'::regclass) then alter table public.iris_followups add constraint iris_followups_origem_check CHECK ((origem = ANY (ARRAY['manual'::text, 'automatico'::text]))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'iris_followups_status_check' and conrelid = 'public.iris_followups'::regclass) then alter table public.iris_followups add constraint iris_followups_status_check CHECK ((status = ANY (ARRAY['candidato'::text, 'agendado'::text, 'ativo'::text, 'cliente_deu_sinal'::text, 'encerrado_sem_interesse'::text, 'opt_out'::text, 'concluido_sem_resposta'::text, 'cancelado'::text]))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'iris_followups_toques_enviados_check' and conrelid = 'public.iris_followups'::regclass) then alter table public.iris_followups add constraint iris_followups_toques_enviados_check CHECK (((toques_enviados >= 0) AND (toques_enviados <= 3))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'iris_followups_pkey' and conrelid = 'public.iris_followups'::regclass) then alter table public.iris_followups add constraint iris_followups_pkey PRIMARY KEY (id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'iris_monitor_achados_categoria_check' and conrelid = 'public.iris_monitor_achados'::regclass) then alter table public.iris_monitor_achados add constraint iris_monitor_achados_categoria_check CHECK ((categoria = ANY (ARRAY['alucinacao'::text, 'comercial'::text, 'contexto'::text, 'operacional'::text, 'qualidade'::text]))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'iris_monitor_achados_chave_check' and conrelid = 'public.iris_monitor_achados'::regclass) then alter table public.iris_monitor_achados add constraint iris_monitor_achados_chave_check CHECK ((char_length(chave) <= 200)); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'iris_monitor_achados_evidencia_check' and conrelid = 'public.iris_monitor_achados'::regclass) then alter table public.iris_monitor_achados add constraint iris_monitor_achados_evidencia_check CHECK (((char_length(btrim(evidencia)) >= 1) AND (char_length(btrim(evidencia)) <= 600))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'iris_monitor_achados_gravidade_check' and conrelid = 'public.iris_monitor_achados'::regclass) then alter table public.iris_monitor_achados add constraint iris_monitor_achados_gravidade_check CHECK ((gravidade = ANY (ARRAY['critica'::text, 'alta'::text, 'media'::text, 'baixa'::text]))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'iris_monitor_achados_origem_check' and conrelid = 'public.iris_monitor_achados'::regclass) then alter table public.iris_monitor_achados add constraint iris_monitor_achados_origem_check CHECK ((origem = ANY (ARRAY['guarda'::text, 'operacional'::text, 'auditor'::text]))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'iris_monitor_achados_regra_sugerida_check' and conrelid = 'public.iris_monitor_achados'::regclass) then alter table public.iris_monitor_achados add constraint iris_monitor_achados_regra_sugerida_check CHECK ((char_length(regra_sugerida) <= 400)); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'iris_monitor_achados_regra_violada_check' and conrelid = 'public.iris_monitor_achados'::regclass) then alter table public.iris_monitor_achados add constraint iris_monitor_achados_regra_violada_check CHECK ((char_length(regra_violada) <= 300)); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'iris_monitor_achados_status_check' and conrelid = 'public.iris_monitor_achados'::regclass) then alter table public.iris_monitor_achados add constraint iris_monitor_achados_status_check CHECK ((status = ANY (ARRAY['aberto'::text, 'confirmado'::text, 'falso_positivo'::text, 'corrigido'::text]))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'iris_monitor_achados_subcategoria_check' and conrelid = 'public.iris_monitor_achados'::regclass) then alter table public.iris_monitor_achados add constraint iris_monitor_achados_subcategoria_check CHECK ((subcategoria ~ '^[a-z0-9_]{1,60}$'::text)); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'iris_monitor_achados_sugestao_check' and conrelid = 'public.iris_monitor_achados'::regclass) then alter table public.iris_monitor_achados add constraint iris_monitor_achados_sugestao_check CHECK ((char_length(sugestao) <= 600)); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'iris_monitor_achados_pkey' and conrelid = 'public.iris_monitor_achados'::regclass) then alter table public.iris_monitor_achados add constraint iris_monitor_achados_pkey PRIMARY KEY (id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'iris_monitor_ciclos_achados_check' and conrelid = 'public.iris_monitor_ciclos'::regclass) then alter table public.iris_monitor_ciclos add constraint iris_monitor_ciclos_achados_check CHECK ((achados >= 0)); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'iris_monitor_ciclos_achados_criticos_check' and conrelid = 'public.iris_monitor_ciclos'::regclass) then alter table public.iris_monitor_ciclos add constraint iris_monitor_ciclos_achados_criticos_check CHECK ((achados_criticos >= 0)); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'iris_monitor_ciclos_conversas_analisadas_check' and conrelid = 'public.iris_monitor_ciclos'::regclass) then alter table public.iris_monitor_ciclos add constraint iris_monitor_ciclos_conversas_analisadas_check CHECK ((conversas_analisadas >= 0)); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'iris_monitor_ciclos_conversas_pendentes_check' and conrelid = 'public.iris_monitor_ciclos'::regclass) then alter table public.iris_monitor_ciclos add constraint iris_monitor_ciclos_conversas_pendentes_check CHECK ((conversas_pendentes >= 0)); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'iris_monitor_ciclos_detalhe_check' and conrelid = 'public.iris_monitor_ciclos'::regclass) then alter table public.iris_monitor_ciclos add constraint iris_monitor_ciclos_detalhe_check CHECK ((jsonb_typeof(detalhe) = 'object'::text)); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'iris_monitor_ciclos_erro_check' and conrelid = 'public.iris_monitor_ciclos'::regclass) then alter table public.iris_monitor_ciclos add constraint iris_monitor_ciclos_erro_check CHECK ((char_length(erro) <= 500)); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'iris_monitor_ciclos_escopo_check' and conrelid = 'public.iris_monitor_ciclos'::regclass) then alter table public.iris_monitor_ciclos add constraint iris_monitor_ciclos_escopo_check CHECK ((escopo = ANY (ARRAY['iris'::text, 'toda_ia'::text]))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'iris_monitor_ciclos_janela_check' and conrelid = 'public.iris_monitor_ciclos'::regclass) then alter table public.iris_monitor_ciclos add constraint iris_monitor_ciclos_janela_check CHECK ((fim > inicio)); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'iris_monitor_ciclos_mensagens_analisadas_check' and conrelid = 'public.iris_monitor_ciclos'::regclass) then alter table public.iris_monitor_ciclos add constraint iris_monitor_ciclos_mensagens_analisadas_check CHECK ((mensagens_analisadas >= 0)); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'iris_monitor_ciclos_mensagens_ia_check' and conrelid = 'public.iris_monitor_ciclos'::regclass) then alter table public.iris_monitor_ciclos add constraint iris_monitor_ciclos_mensagens_ia_check CHECK ((mensagens_ia >= 0)); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'iris_monitor_ciclos_modelo_check' and conrelid = 'public.iris_monitor_ciclos'::regclass) then alter table public.iris_monitor_ciclos add constraint iris_monitor_ciclos_modelo_check CHECK ((char_length(modelo) <= 80)); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'iris_monitor_ciclos_status_check' and conrelid = 'public.iris_monitor_ciclos'::regclass) then alter table public.iris_monitor_ciclos add constraint iris_monitor_ciclos_status_check CHECK ((status = ANY (ARRAY['rodando'::text, 'ok'::text, 'falhou'::text]))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'iris_monitor_ciclos_pkey' and conrelid = 'public.iris_monitor_ciclos'::regclass) then alter table public.iris_monitor_ciclos add constraint iris_monitor_ciclos_pkey PRIMARY KEY (id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'iris_teste_limpezas_detalhe_check' and conrelid = 'public.iris_teste_limpezas'::regclass) then alter table public.iris_teste_limpezas add constraint iris_teste_limpezas_detalhe_check CHECK (((jsonb_typeof(detalhe) = 'object'::text) AND (pg_column_size(detalhe) <= 8000))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'iris_teste_limpezas_por_check' and conrelid = 'public.iris_teste_limpezas'::regclass) then alter table public.iris_teste_limpezas add constraint iris_teste_limpezas_por_check CHECK (((char_length(por) >= 1) AND (char_length(por) <= 60))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'iris_teste_limpezas_pkey' and conrelid = 'public.iris_teste_limpezas'::regclass) then alter table public.iris_teste_limpezas add constraint iris_teste_limpezas_pkey PRIMARY KEY (id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'iris_textos_audio_path_check' and conrelid = 'public.iris_textos'::regclass) then alter table public.iris_textos add constraint iris_textos_audio_path_check CHECK (((audio_path IS NULL) OR ((tipo = 'audio'::text) AND (audio_path ~ (('^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/)?iris/'::text || id) || '-[A-Za-z0-9_-]+\.ogg$'::text))))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'iris_textos_duracao_check' and conrelid = 'public.iris_textos'::regclass) then alter table public.iris_textos add constraint iris_textos_duracao_check CHECK (((duracao_s IS NULL) OR ((duracao_s > (0)::numeric) AND (duracao_s <= (20)::numeric)))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'iris_textos_id_check' and conrelid = 'public.iris_textos'::regclass) then alter table public.iris_textos add constraint iris_textos_id_check CHECK ((id ~ '^[A-Z][0-9]{2,3}$'::text)); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'iris_textos_selo_check' and conrelid = 'public.iris_textos'::regclass) then alter table public.iris_textos add constraint iris_textos_selo_check CHECK ((selo = ANY (ARRAY['ditado'::text, 'seu'::text, 'rascunho'::text, 'modelo'::text]))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'iris_textos_texto_check' and conrelid = 'public.iris_textos'::regclass) then alter table public.iris_textos add constraint iris_textos_texto_check CHECK (((char_length(btrim(texto)) >= 1) AND (char_length(btrim(texto)) <= 2000))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'iris_textos_tipo_check' and conrelid = 'public.iris_textos'::regclass) then alter table public.iris_textos add constraint iris_textos_tipo_check CHECK ((tipo = ANY (ARRAY['audio'::text, 'texto'::text]))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'iris_textos_pkey' and conrelid = 'public.iris_textos'::regclass) then alter table public.iris_textos add constraint iris_textos_pkey PRIMARY KEY (id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'ligacoes_marcadas_forma_check' and conrelid = 'public.ligacoes_marcadas'::regclass) then alter table public.ligacoes_marcadas add constraint ligacoes_marcadas_forma_check CHECK ((forma = ANY (ARRAY['ligacao'::text, 'mensagem'::text]))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'ligacoes_marcadas_hora_preferida_check' and conrelid = 'public.ligacoes_marcadas'::regclass) then alter table public.ligacoes_marcadas add constraint ligacoes_marcadas_hora_preferida_check CHECK ((char_length(hora_preferida) <= 60)); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'ligacoes_marcadas_motivo_check' and conrelid = 'public.ligacoes_marcadas'::regclass) then alter table public.ligacoes_marcadas add constraint ligacoes_marcadas_motivo_check CHECK ((char_length(motivo) <= 200)); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'ligacoes_marcadas_periodo_check' and conrelid = 'public.ligacoes_marcadas'::regclass) then alter table public.ligacoes_marcadas add constraint ligacoes_marcadas_periodo_check CHECK ((periodo = ANY (ARRAY['manha'::text, 'tarde'::text]))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'ligacoes_marcadas_status_check' and conrelid = 'public.ligacoes_marcadas'::regclass) then alter table public.ligacoes_marcadas add constraint ligacoes_marcadas_status_check CHECK ((status = ANY (ARRAY['marcada'::text, 'ligou'::text, 'nao_atendeu'::text, 'cancelada'::text]))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'ligacoes_marcadas_pkey' and conrelid = 'public.ligacoes_marcadas'::regclass) then alter table public.ligacoes_marcadas add constraint ligacoes_marcadas_pkey PRIMARY KEY (id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'mensagens_pkey' and conrelid = 'public.mensagens'::regclass) then alter table public.mensagens add constraint mensagens_pkey PRIMARY KEY (id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'mag_tem_conteudo' and conrelid = 'public.mensagens_agendadas'::regclass) then alter table public.mensagens_agendadas add constraint mag_tem_conteudo CHECK (((texto IS NOT NULL) OR (storage_path IS NOT NULL))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'mensagens_agendadas_status_check' and conrelid = 'public.mensagens_agendadas'::regclass) then alter table public.mensagens_agendadas add constraint mensagens_agendadas_status_check CHECK ((status = ANY (ARRAY['agendada'::text, 'processando'::text, 'enviada'::text, 'falhou'::text, 'cancelada'::text, 'expirada'::text, 'bloqueada'::text]))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'mensagens_agendadas_tipo_check' and conrelid = 'public.mensagens_agendadas'::regclass) then alter table public.mensagens_agendadas add constraint mensagens_agendadas_tipo_check CHECK ((tipo = ANY (ARRAY['texto'::text, 'imagem'::text, 'audio'::text, 'video'::text, 'documento'::text, 'texto_midia'::text]))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'mensagens_agendadas_pkey' and conrelid = 'public.mensagens_agendadas'::regclass) then alter table public.mensagens_agendadas add constraint mensagens_agendadas_pkey PRIMARY KEY (id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'midia_melhoria_ia_status_check' and conrelid = 'public.midia_melhoria_ia'::regclass) then alter table public.midia_melhoria_ia add constraint midia_melhoria_ia_status_check CHECK ((status = ANY (ARRAY['processando'::text, 'aprovada'::text, 'reprovada'::text, 'falha'::text]))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'midia_melhoria_ia_pkey' and conrelid = 'public.midia_melhoria_ia'::regclass) then alter table public.midia_melhoria_ia add constraint midia_melhoria_ia_pkey PRIMARY KEY (id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'atd_notificacoes_pkey' and conrelid = 'public.atd_notificacoes'::regclass) then alter table public.atd_notificacoes add constraint atd_notificacoes_pkey PRIMARY KEY (id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'oportunidade_checklist_pkey' and conrelid = 'public.oportunidade_checklist'::regclass) then alter table public.oportunidade_checklist add constraint oportunidade_checklist_pkey PRIMARY KEY (id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'oportunidade_checklist_oportunidade_id_item_slug_key' and conrelid = 'public.oportunidade_checklist'::regclass) then alter table public.oportunidade_checklist add constraint oportunidade_checklist_oportunidade_id_item_slug_key UNIQUE (oportunidade_id, item_slug); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'oportunidade_eventos_evento_check' and conrelid = 'public.oportunidade_eventos'::regclass) then alter table public.oportunidade_eventos add constraint oportunidade_eventos_evento_check CHECK ((evento = ANY (ARRAY['ganho'::text, 'perdido'::text, 'reaberto'::text, 'qualificado'::text]))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'oportunidade_eventos_pkey' and conrelid = 'public.oportunidade_eventos'::regclass) then alter table public.oportunidade_eventos add constraint oportunidade_eventos_pkey PRIMARY KEY (id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'chk_op_status_cancelamento' and conrelid = 'public.oportunidades'::regclass) then alter table public.oportunidades add constraint chk_op_status_cancelamento CHECK ((status_cancelamento = ANY (ARRAY['nao_se_aplica'::text, 'nao_iniciado'::text, 'em_analise'::text, 'solicitado'::text, 'aguardando_retorno'::text, 'concluido'::text, 'nao_foi_possivel'::text]))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'chk_op_status_ressarcimento' and conrelid = 'public.oportunidades'::regclass) then alter table public.oportunidades add constraint chk_op_status_ressarcimento CHECK ((status_ressarcimento = ANY (ARRAY['nao_se_aplica'::text, 'nao_iniciado'::text, 'em_analise'::text, 'solicitado'::text, 'aguardando_pagamento'::text, 'pago'::text, 'nao_foi_possivel'::text]))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'chk_op_tipo_beneficio' and conrelid = 'public.oportunidades'::regclass) then alter table public.oportunidades add constraint chk_op_tipo_beneficio CHECK (((tipo_beneficio IS NULL) OR (tipo_beneficio = ANY (ARRAY['aposentadoria'::text, 'pensao_por_morte'::text, 'bpc_loas'::text, 'outro'::text])))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'chk_op_tipo_servico' and conrelid = 'public.oportunidades'::regclass) then alter table public.oportunidades add constraint chk_op_tipo_servico CHECK ((tipo_servico = ANY (ARRAY['analise_inicial'::text, 'cancelamento'::text, 'ressarcimento'::text, 'cancelamento_ressarcimento'::text, 'outro'::text]))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'chk_op_valor_desconto_mensal' and conrelid = 'public.oportunidades'::regclass) then alter table public.oportunidades add constraint chk_op_valor_desconto_mensal CHECK (((valor_desconto_mensal IS NULL) OR (valor_desconto_mensal >= (0)::numeric))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'chk_op_valor_ressarcido' and conrelid = 'public.oportunidades'::regclass) then alter table public.oportunidades add constraint chk_op_valor_ressarcido CHECK (((valor_ressarcido IS NULL) OR (valor_ressarcido >= (0)::numeric))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'chk_op_valor_ressarcimento_estimado' and conrelid = 'public.oportunidades'::regclass) then alter table public.oportunidades add constraint chk_op_valor_ressarcimento_estimado CHECK (((valor_ressarcimento_estimado IS NULL) OR (valor_ressarcimento_estimado >= (0)::numeric))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'oportunidades_motivo_nao_elegivel_chk' and conrelid = 'public.oportunidades'::regclass) then alter table public.oportunidades add constraint oportunidades_motivo_nao_elegivel_chk CHECK (((motivo_nao_elegivel IS NULL) OR (motivo_nao_elegivel = ANY (ARRAY['sem_beneficio_inss'::text, 'muitos_processos'::text, 'sem_interesse'::text, 'sem_emprestimo_banco'::text, 'nao_mora_rs'::text])))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'oportunidades_motivo_perda_chk' and conrelid = 'public.oportunidades'::regclass) then alter table public.oportunidades add constraint oportunidades_motivo_perda_chk CHECK (((motivo_perda IS NULL) OR (motivo_perda = ANY (ARRAY['sem_interesse'::text, 'nao_respondeu'::text, 'nao_elegivel'::text, 'concorrente'::text, 'dados_invalidos'::text, 'outro'::text])))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'oportunidades_pkey' and conrelid = 'public.oportunidades'::regclass) then alter table public.oportunidades add constraint oportunidades_pkey PRIMARY KEY (id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'oportunidades_id_org_uniq' and conrelid = 'public.oportunidades'::regclass) then alter table public.oportunidades add constraint oportunidades_id_org_uniq UNIQUE (id, organizacao_id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'organizacao_limites_pkey' and conrelid = 'public.organizacao_limites'::regclass) then alter table public.organizacao_limites add constraint organizacao_limites_pkey PRIMARY KEY (organizacao_id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'organizacao_usuarios_pkey' and conrelid = 'public.organizacao_usuarios'::regclass) then alter table public.organizacao_usuarios add constraint organizacao_usuarios_pkey PRIMARY KEY (id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'organizacao_usuarios_organizacao_id_usuario_id_key' and conrelid = 'public.organizacao_usuarios'::regclass) then alter table public.organizacao_usuarios add constraint organizacao_usuarios_organizacao_id_usuario_id_key UNIQUE (organizacao_id, usuario_id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'organizacoes_pkey' and conrelid = 'public.organizacoes'::regclass) then alter table public.organizacoes add constraint organizacoes_pkey PRIMARY KEY (id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'organizacoes_slug_key' and conrelid = 'public.organizacoes'::regclass) then alter table public.organizacoes add constraint organizacoes_slug_key UNIQUE (slug); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'pendencias_o_que_check' and conrelid = 'public.pendencias'::regclass) then alter table public.pendencias add constraint pendencias_o_que_check CHECK (((length(btrim(o_que)) >= 1) AND (length(btrim(o_que)) <= 160))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'pendencias_processo_check' and conrelid = 'public.pendencias'::regclass) then alter table public.pendencias add constraint pendencias_processo_check CHECK (((processo IS NULL) OR (length(processo) <= 40))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'pendencias_status_check' and conrelid = 'public.pendencias'::regclass) then alter table public.pendencias add constraint pendencias_status_check CHECK ((status = ANY (ARRAY['aguardando'::text, 'respondeu'::text, 'sem_resposta'::text, 'resolvida'::text]))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'pendencias_tipo_check' and conrelid = 'public.pendencias'::regclass) then alter table public.pendencias add constraint pendencias_tipo_check CHECK ((tipo = ANY (ARRAY['reassinatura'::text, 'documento'::text, 'informacao'::text, 'outro'::text]))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'pendencias_pkey' and conrelid = 'public.pendencias'::regclass) then alter table public.pendencias add constraint pendencias_pkey PRIMARY KEY (id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'planilha_config_pkey' and conrelid = 'public.planilha_config'::regclass) then alter table public.planilha_config add constraint planilha_config_pkey PRIMARY KEY (organizacao_id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'planos_pkey' and conrelid = 'public.planos'::regclass) then alter table public.planos add constraint planos_pkey PRIMARY KEY (id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'presenciais_status_check' and conrelid = 'public.presenciais'::regclass) then alter table public.presenciais add constraint presenciais_status_check CHECK ((status = ANY (ARRAY['marcado'::text, 'desmarcado'::text]))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'presenciais_pkey' and conrelid = 'public.presenciais'::regclass) then alter table public.presenciais add constraint presenciais_pkey PRIMARY KEY (id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'presenciais_avisos_status_check' and conrelid = 'public.presenciais_avisos'::regclass) then alter table public.presenciais_avisos add constraint presenciais_avisos_status_check CHECK ((status = ANY (ARRAY['pendente'::text, 'enviando'::text, 'enviado'::text, 'incerto'::text, 'falhou'::text, 'bloqueado'::text]))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'presenciais_avisos_tipo_check' and conrelid = 'public.presenciais_avisos'::regclass) then alter table public.presenciais_avisos add constraint presenciais_avisos_tipo_check CHECK ((tipo = ANY (ARRAY['marcado'::text, 'remarcado'::text, 'desmarcado'::text, 'lembrete'::text]))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'presenciais_avisos_pkey' and conrelid = 'public.presenciais_avisos'::regclass) then alter table public.presenciais_avisos add constraint presenciais_avisos_pkey PRIMARY KEY (id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'radar_textos_pkey' and conrelid = 'public.radar_textos'::regclass) then alter table public.radar_textos add constraint radar_textos_pkey PRIMARY KEY (chave); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'recados_gestor_mensagem_check' and conrelid = 'public.recados_gestor'::regclass) then alter table public.recados_gestor add constraint recados_gestor_mensagem_check CHECK (((length(btrim(mensagem)) >= 1) AND (length(btrim(mensagem)) <= 400))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'recados_gestor_repasse_motivo_check' and conrelid = 'public.recados_gestor'::regclass) then alter table public.recados_gestor add constraint recados_gestor_repasse_motivo_check CHECK (((repasse_motivo IS NULL) OR (length(repasse_motivo) <= 400))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'recados_gestor_resposta_check' and conrelid = 'public.recados_gestor'::regclass) then alter table public.recados_gestor add constraint recados_gestor_resposta_check CHECK (((resposta IS NULL) OR (length(resposta) <= 400))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'recados_gestor_pkey' and conrelid = 'public.recados_gestor'::regclass) then alter table public.recados_gestor add constraint recados_gestor_pkey PRIMARY KEY (id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'regua_ativacoes_status_check' and conrelid = 'public.regua_ativacoes'::regclass) then alter table public.regua_ativacoes add constraint regua_ativacoes_status_check CHECK ((status = ANY (ARRAY['ativo'::text, 'pausado'::text, 'desativado'::text, 'bloqueada'::text]))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'regua_ativacoes_pkey' and conrelid = 'public.regua_ativacoes'::regclass) then alter table public.regua_ativacoes add constraint regua_ativacoes_pkey PRIMARY KEY (id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'reguas_ativ_id_org_uniq' and conrelid = 'public.regua_ativacoes'::regclass) then alter table public.regua_ativacoes add constraint reguas_ativ_id_org_uniq UNIQUE (id, organizacao_id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'regua_envios_status_check' and conrelid = 'public.regua_envios'::regclass) then alter table public.regua_envios add constraint regua_envios_status_check CHECK ((status = ANY (ARRAY['agendado'::text, 'enviado'::text, 'falhou'::text, 'cancelado'::text, 'bloqueado_teto'::text, 'bloqueado_horario'::text, 'bloqueado_optout'::text]))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'regua_envios_pkey' and conrelid = 'public.regua_envios'::regclass) then alter table public.regua_envios add constraint regua_envios_pkey PRIMARY KEY (id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'chk_passo_agraw' and conrelid = 'public.regua_passos'::regclass) then alter table public.regua_passos add constraint chk_passo_agraw CHECK ((((agendamento_tipo = 'relativo'::text) AND (offset_horas IS NOT NULL)) OR ((agendamento_tipo = 'semanal'::text) AND (dia_semana IS NOT NULL) AND (hora IS NOT NULL)) OR ((agendamento_tipo = 'data_fixa'::text) AND (data IS NOT NULL) AND (hora IS NOT NULL)))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'chk_passo_conteudo' and conrelid = 'public.regua_passos'::regclass) then alter table public.regua_passos add constraint chk_passo_conteudo CHECK (((texto IS NOT NULL) OR (storage_path IS NOT NULL))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'regua_passos_agendamento_tipo_check' and conrelid = 'public.regua_passos'::regclass) then alter table public.regua_passos add constraint regua_passos_agendamento_tipo_check CHECK ((agendamento_tipo = ANY (ARRAY['relativo'::text, 'semanal'::text, 'data_fixa'::text]))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'regua_passos_dia_semana_check' and conrelid = 'public.regua_passos'::regclass) then alter table public.regua_passos add constraint regua_passos_dia_semana_check CHECK (((dia_semana >= 0) AND (dia_semana <= 6))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'regua_passos_tipo_check' and conrelid = 'public.regua_passos'::regclass) then alter table public.regua_passos add constraint regua_passos_tipo_check CHECK ((tipo = ANY (ARRAY['texto'::text, 'imagem'::text, 'audio'::text, 'video'::text, 'documento'::text, 'texto_midia'::text]))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'regua_passos_pkey' and conrelid = 'public.regua_passos'::regclass) then alter table public.regua_passos add constraint regua_passos_pkey PRIMARY KEY (id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'uq_passo_ordem' and conrelid = 'public.regua_passos'::regclass) then alter table public.regua_passos add constraint uq_passo_ordem UNIQUE (regua_id, ordem); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'chk_regua_dias' and conrelid = 'public.reguas'::regclass) then alter table public.reguas add constraint chk_regua_dias CHECK ((dias_semana <@ ARRAY[0, 1, 2, 3, 4, 5, 6])); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'chk_regua_janela' and conrelid = 'public.reguas'::regclass) then alter table public.reguas add constraint chk_regua_janela CHECK ((hora_inicio < hora_fim)); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'reguas_intervalo_min_horas_check' and conrelid = 'public.reguas'::regclass) then alter table public.reguas add constraint reguas_intervalo_min_horas_check CHECK ((intervalo_min_horas >= 0)); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'reguas_objetivo_check' and conrelid = 'public.reguas'::regclass) then alter table public.reguas add constraint reguas_objetivo_check CHECK ((objetivo = ANY (ARRAY['relacionamento_cliente'::text, 'nutricao_lead'::text, 'reativacao'::text, 'documentacao'::text, 'pos_reuniao'::text, 'data_comemorativa'::text, 'conteudo'::text]))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'reguas_status_check' and conrelid = 'public.reguas'::regclass) then alter table public.reguas add constraint reguas_status_check CHECK ((status = ANY (ARRAY['rascunho'::text, 'ativa'::text, 'arquivada'::text]))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'reguas_teto_semana_check' and conrelid = 'public.reguas'::regclass) then alter table public.reguas add constraint reguas_teto_semana_check CHECK (((teto_semana >= 1) AND (teto_semana <= 21))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'reguas_pkey' and conrelid = 'public.reguas'::regclass) then alter table public.reguas add constraint reguas_pkey PRIMARY KEY (id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'reguas_id_org_uniq' and conrelid = 'public.reguas'::regclass) then alter table public.reguas add constraint reguas_id_org_uniq UNIQUE (id, organizacao_id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'relacionamento_bloqueio_pkey' and conrelid = 'public.relacionamento_bloqueio'::regclass) then alter table public.relacionamento_bloqueio add constraint relacionamento_bloqueio_pkey PRIMARY KEY (contato_id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'remarketing_config_pkey' and conrelid = 'public.remarketing_config'::regclass) then alter table public.remarketing_config add constraint remarketing_config_pkey PRIMARY KEY (organizacao_id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'remarketing_eventos_pkey' and conrelid = 'public.remarketing_eventos'::regclass) then alter table public.remarketing_eventos add constraint remarketing_eventos_pkey PRIMARY KEY (id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'remarketing_leads_etapa_check' and conrelid = 'public.remarketing_leads'::regclass) then alter table public.remarketing_leads add constraint remarketing_leads_etapa_check CHECK ((etapa = ANY (ARRAY['remarketing_1'::text, 'pendencia'::text, 'recuperacao_1'::text, 'recuperacao_2'::text, 'recuperacao_3'::text]))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'remarketing_leads_origem_fluxo_check' and conrelid = 'public.remarketing_leads'::regclass) then alter table public.remarketing_leads add constraint remarketing_leads_origem_fluxo_check CHECK ((origem_fluxo = ANY (ARRAY['fluxo1_sem_resposta_bot'::text, 'fluxo2_abandono_atendimento'::text]))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'remarketing_leads_status_check' and conrelid = 'public.remarketing_leads'::regclass) then alter table public.remarketing_leads add constraint remarketing_leads_status_check CHECK ((status = ANY (ARRAY['ativo'::text, 'recuperado'::text, 'perdido'::text, 'cancelado'::text]))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'remarketing_leads_pkey' and conrelid = 'public.remarketing_leads'::regclass) then alter table public.remarketing_leads add constraint remarketing_leads_pkey PRIMARY KEY (id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'remarketing_tarefas_status_check' and conrelid = 'public.remarketing_tarefas'::regclass) then alter table public.remarketing_tarefas add constraint remarketing_tarefas_status_check CHECK ((status = ANY (ARRAY['pendente'::text, 'concluida'::text, 'expirada'::text, 'cancelada'::text]))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'remarketing_tarefas_tipo_check' and conrelid = 'public.remarketing_tarefas'::regclass) then alter table public.remarketing_tarefas add constraint remarketing_tarefas_tipo_check CHECK ((tipo = ANY (ARRAY['acao'::text, 'acompanhamento'::text]))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'remarketing_tarefas_pkey' and conrelid = 'public.remarketing_tarefas'::regclass) then alter table public.remarketing_tarefas add constraint remarketing_tarefas_pkey PRIMARY KEY (id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'retomada_atendimento_log_pkey' and conrelid = 'public.retomada_atendimento_log'::regclass) then alter table public.retomada_atendimento_log add constraint retomada_atendimento_log_pkey PRIMARY KEY (conversa_id, mensagem_id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'robo_ligar_pkey' and conrelid = 'public.robo_ligar'::regclass) then alter table public.robo_ligar add constraint robo_ligar_pkey PRIMARY KEY (conversa_id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'script_anexos_pkey' and conrelid = 'public.script_anexos'::regclass) then alter table public.script_anexos add constraint script_anexos_pkey PRIMARY KEY (id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'script_categorias_pkey' and conrelid = 'public.script_categorias'::regclass) then alter table public.script_categorias add constraint script_categorias_pkey PRIMARY KEY (id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'script_etapas_pkey' and conrelid = 'public.script_etapas'::regclass) then alter table public.script_etapas add constraint script_etapas_pkey PRIMARY KEY (id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'script_execucoes_pkey' and conrelid = 'public.script_execucoes'::regclass) then alter table public.script_execucoes add constraint script_execucoes_pkey PRIMARY KEY (id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'scripts_pkey' and conrelid = 'public.scripts'::regclass) then alter table public.scripts add constraint scripts_pkey PRIMARY KEY (id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'sla_alertas_severidade_check' and conrelid = 'public.sla_alertas'::regclass) then alter table public.sla_alertas add constraint sla_alertas_severidade_check CHECK ((severidade = ANY (ARRAY['leve'::text, 'amarelo'::text, 'vermelho'::text, 'critico'::text, 'imediato'::text]))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'sla_alertas_tipo_check' and conrelid = 'public.sla_alertas'::regclass) then alter table public.sla_alertas add constraint sla_alertas_tipo_check CHECK ((tipo = ANY (ARRAY['atendimento_sem_resposta'::text, 'cliente_qualificado_aguardando_atendimento'::text, 'lead_quente_aguardando'::text, 'audio_recebido_precisa_humano'::text, 'parado_ha_muito_tempo'::text, 'prazo_2_dias_em_risco'::text, 'prazo_2_dias_estourado'::text, 'janela_expirando'::text, 'vacuo_aviso'::text, 'robo_ligar'::text, 'vacuo_cutucada'::text, 'vacuo_fechado'::text]))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'sla_alertas_pkey' and conrelid = 'public.sla_alertas'::regclass) then alter table public.sla_alertas add constraint sla_alertas_pkey PRIMARY KEY (id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'usuario_preferencias_pkey' and conrelid = 'public.usuario_preferencias'::regclass) then alter table public.usuario_preferencias add constraint usuario_preferencias_pkey PRIMARY KEY (usuario_id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'usuarios_pkey' and conrelid = 'public.usuarios'::regclass) then alter table public.usuarios add constraint usuarios_pkey PRIMARY KEY (id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'vacuo_cfg_escada' and conrelid = 'public.vacuo_config'::regclass) then alter table public.vacuo_config add constraint vacuo_cfg_escada CHECK (((aviso1_min < aviso2_min) AND (aviso2_min < aviso3_min) AND (aviso3_min <= repasse_min))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'vacuo_cfg_escada_prio' and conrelid = 'public.vacuo_config'::regclass) then alter table public.vacuo_config add constraint vacuo_cfg_escada_prio CHECK (((prio_aviso1_min < prio_aviso2_min) AND (prio_aviso2_min < prio_aviso3_min) AND (prio_aviso3_min <= prio_repasse_min))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'vacuo_cfg_janela' and conrelid = 'public.vacuo_config'::regclass) then alter table public.vacuo_config add constraint vacuo_cfg_janela CHECK (((hora_inicio >= 0) AND (hora_fim <= 24) AND (hora_inicio < hora_fim))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'vacuo_config_pkey' and conrelid = 'public.vacuo_config'::regclass) then alter table public.vacuo_config add constraint vacuo_config_pkey PRIMARY KEY (organizacao_id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'vacuo_estado_pkey' and conrelid = 'public.vacuo_estado'::regclass) then alter table public.vacuo_estado add constraint vacuo_estado_pkey PRIMARY KEY (conversa_id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'vacuo_repasses_decisao_check' and conrelid = 'public.vacuo_repasses'::regclass) then alter table public.vacuo_repasses add constraint vacuo_repasses_decisao_check CHECK ((decisao = ANY (ARRAY['repassado'::text, 'mantido'::text]))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'vacuo_repasses_pkey' and conrelid = 'public.vacuo_repasses'::regclass) then alter table public.vacuo_repasses add constraint vacuo_repasses_pkey PRIMARY KEY (id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'wa_audio_diag_pkey' and conrelid = 'public.wa_audio_diag'::regclass) then alter table public.wa_audio_diag add constraint wa_audio_diag_pkey PRIMARY KEY (correlation_id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'wa_lid_map_pkey' and conrelid = 'public.wa_lid_map'::regclass) then alter table public.wa_lid_map add constraint wa_lid_map_pkey PRIMARY KEY (id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'wa_optout_motivo_check' and conrelid = 'public.atd_wa_optout'::regclass) then alter table public.atd_wa_optout add constraint wa_optout_motivo_check CHECK ((motivo = ANY (ARRAY['erro_131050'::text, 'user_preferences'::text, 'manual'::text, 'sair_texto'::text]))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'atd_wa_optout_pkey' and conrelid = 'public.atd_wa_optout'::regclass) then alter table public.atd_wa_optout add constraint atd_wa_optout_pkey PRIMARY KEY (contato_id, canal_id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'wa_templates_categoria_check' and conrelid = 'public.wa_templates'::regclass) then alter table public.wa_templates add constraint wa_templates_categoria_check CHECK ((categoria = ANY (ARRAY['MARKETING'::text, 'UTILITY'::text, 'AUTHENTICATION'::text]))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'wa_templates_status_check' and conrelid = 'public.wa_templates'::regclass) then alter table public.wa_templates add constraint wa_templates_status_check CHECK ((status = ANY (ARRAY['rascunho'::text, 'pendente'::text, 'aprovado'::text, 'rejeitado'::text, 'pausado'::text, 'desativado'::text]))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'wat_corpo_nao_vazio' and conrelid = 'public.wa_templates'::regclass) then alter table public.wa_templates add constraint wat_corpo_nao_vazio CHECK ((length(TRIM(BOTH FROM corpo)) > 0)); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'wat_nome_valido' and conrelid = 'public.wa_templates'::regclass) then alter table public.wa_templates add constraint wat_nome_valido CHECK (((nome ~ '^[a-z0-9_]+$'::text) AND (length(nome) <= 512))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'wat_remarketing_exige_toque' and conrelid = 'public.wa_templates'::regclass) then alter table public.wa_templates add constraint wat_remarketing_exige_toque CHECK (((NOT usar_em_remarketing) OR (toque IS NOT NULL))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'wat_toque_valido' and conrelid = 'public.wa_templates'::regclass) then alter table public.wa_templates add constraint wat_toque_valido CHECK (((toque IS NULL) OR ((toque >= 1) AND (toque <= 20)))); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'wa_templates_pkey' and conrelid = 'public.wa_templates'::regclass) then alter table public.wa_templates add constraint wa_templates_pkey PRIMARY KEY (id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'webhook_config_pkey' and conrelid = 'public.webhook_config'::regclass) then alter table public.webhook_config add constraint webhook_config_pkey PRIMARY KEY (chave); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'whatsapp_webhook_events_pkey' and conrelid = 'public.whatsapp_webhook_events'::regclass) then alter table public.whatsapp_webhook_events add constraint whatsapp_webhook_events_pkey PRIMARY KEY (id); end if; end $$;

-- 5. ligações entre tabelas
do $$ begin if not exists (select 1 from pg_constraint where conname = 'adm_casos_organizacao_id_fkey' and conrelid = 'public.adm_casos'::regclass) then alter table public.adm_casos add constraint adm_casos_organizacao_id_fkey FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'adm_config_organizacao_id_fkey' and conrelid = 'public.adm_config'::regclass) then alter table public.adm_config add constraint adm_config_organizacao_id_fkey FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'adm_fechados_organizacao_id_fkey' and conrelid = 'public.adm_fechados'::regclass) then alter table public.adm_fechados add constraint adm_fechados_organizacao_id_fkey FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'adm_movimentos_organizacao_id_fkey' and conrelid = 'public.adm_movimentos'::regclass) then alter table public.adm_movimentos add constraint adm_movimentos_organizacao_id_fkey FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'adm_pendencias_contato_id_fkey' and conrelid = 'public.adm_pendencias'::regclass) then alter table public.adm_pendencias add constraint adm_pendencias_contato_id_fkey FOREIGN KEY (contato_id) REFERENCES contatos(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'adm_pendencias_organizacao_id_fkey' and conrelid = 'public.adm_pendencias'::regclass) then alter table public.adm_pendencias add constraint adm_pendencias_organizacao_id_fkey FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'adm_placar_organizacao_id_fkey' and conrelid = 'public.adm_placar'::regclass) then alter table public.adm_placar add constraint adm_placar_organizacao_id_fkey FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'agendamento_atividades_agendamento_id_fkey' and conrelid = 'public.agendamento_atividades'::regclass) then alter table public.agendamento_atividades add constraint agendamento_atividades_agendamento_id_fkey FOREIGN KEY (agendamento_id) REFERENCES agendamentos(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'agendamento_atividades_usuario_id_fkey' and conrelid = 'public.agendamento_atividades'::regclass) then alter table public.agendamento_atividades add constraint agendamento_atividades_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'agendamentos_atendente_id_fkey' and conrelid = 'public.agendamentos'::regclass) then alter table public.agendamentos add constraint agendamentos_atendente_id_fkey FOREIGN KEY (atendente_id) REFERENCES usuarios(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'agendamentos_contato_id_fkey' and conrelid = 'public.agendamentos'::regclass) then alter table public.agendamentos add constraint agendamentos_contato_id_fkey FOREIGN KEY (contato_id) REFERENCES contatos(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'agendamentos_criado_por_fkey' and conrelid = 'public.agendamentos'::regclass) then alter table public.agendamentos add constraint agendamentos_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES usuarios(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'agendamentos_oportunidade_id_fkey' and conrelid = 'public.agendamentos'::regclass) then alter table public.agendamentos add constraint agendamentos_oportunidade_id_fkey FOREIGN KEY (oportunidade_id) REFERENCES oportunidades(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'agendamentos_organizacao_id_fkey' and conrelid = 'public.agendamentos'::regclass) then alter table public.agendamentos add constraint agendamentos_organizacao_id_fkey FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'alertas_lead_quente_assumido_por_fkey' and conrelid = 'public.alertas_lead_quente'::regclass) then alter table public.alertas_lead_quente add constraint alertas_lead_quente_assumido_por_fkey FOREIGN KEY (assumido_por) REFERENCES usuarios(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'alertas_lead_quente_cancelado_por_fkey' and conrelid = 'public.alertas_lead_quente'::regclass) then alter table public.alertas_lead_quente add constraint alertas_lead_quente_cancelado_por_fkey FOREIGN KEY (cancelado_por) REFERENCES usuarios(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'alertas_lead_quente_contato_id_fkey' and conrelid = 'public.alertas_lead_quente'::regclass) then alter table public.alertas_lead_quente add constraint alertas_lead_quente_contato_id_fkey FOREIGN KEY (contato_id) REFERENCES contatos(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'alertas_lead_quente_conversa_id_fkey' and conrelid = 'public.alertas_lead_quente'::regclass) then alter table public.alertas_lead_quente add constraint alertas_lead_quente_conversa_id_fkey FOREIGN KEY (conversa_id) REFERENCES conversas(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'alertas_lead_quente_organizacao_id_fkey' and conrelid = 'public.alertas_lead_quente'::regclass) then alter table public.alertas_lead_quente add constraint alertas_lead_quente_organizacao_id_fkey FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'assinatura_itens_assinatura_id_fkey' and conrelid = 'public.assinatura_itens'::regclass) then alter table public.assinatura_itens add constraint assinatura_itens_assinatura_id_fkey FOREIGN KEY (assinatura_id) REFERENCES assinaturas(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'assinatura_itens_organizacao_id_fkey' and conrelid = 'public.assinatura_itens'::regclass) then alter table public.assinatura_itens add constraint assinatura_itens_organizacao_id_fkey FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'assinaturas_organizacao_id_fkey' and conrelid = 'public.assinaturas'::regclass) then alter table public.assinaturas add constraint assinaturas_organizacao_id_fkey FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'assinaturas_plano_id_fkey' and conrelid = 'public.assinaturas'::regclass) then alter table public.assinaturas add constraint assinaturas_plano_id_fkey FOREIGN KEY (plano_id) REFERENCES planos(id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'assistente_lembretes_organizacao_id_fkey' and conrelid = 'public.assistente_lembretes'::regclass) then alter table public.assistente_lembretes add constraint assistente_lembretes_organizacao_id_fkey FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'assistente_lembretes_usuario_id_fkey' and conrelid = 'public.assistente_lembretes'::regclass) then alter table public.assistente_lembretes add constraint assistente_lembretes_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'audit_log_org_fk' and conrelid = 'public.audit_log'::regclass) then alter table public.audit_log add constraint audit_log_org_fk FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'audit_log_usuario_id_fkey' and conrelid = 'public.audit_log'::regclass) then alter table public.audit_log add constraint audit_log_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'bom_dia_gestores_organizacao_id_fkey' and conrelid = 'public.bom_dia_gestores'::regclass) then alter table public.bom_dia_gestores add constraint bom_dia_gestores_organizacao_id_fkey FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'bom_dia_gestores_usuario_id_fkey' and conrelid = 'public.bom_dia_gestores'::regclass) then alter table public.bom_dia_gestores add constraint bom_dia_gestores_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'bot_canal_config_ativo_por_fkey' and conrelid = 'public.bot_canal_config'::regclass) then alter table public.bot_canal_config add constraint bot_canal_config_ativo_por_fkey FOREIGN KEY (ativo_por) REFERENCES usuarios(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'bot_canal_config_canal_id_fkey' and conrelid = 'public.bot_canal_config'::regclass) then alter table public.bot_canal_config add constraint bot_canal_config_canal_id_fkey FOREIGN KEY (canal_id) REFERENCES canais(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'bot_canal_config_ia_agente_id_fkey' and conrelid = 'public.bot_canal_config'::regclass) then alter table public.bot_canal_config add constraint bot_canal_config_ia_agente_id_fkey FOREIGN KEY (ia_agente_id) REFERENCES ia_agentes(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'bot_canal_config_ia_fluxo_id_fkey' and conrelid = 'public.bot_canal_config'::regclass) then alter table public.bot_canal_config add constraint bot_canal_config_ia_fluxo_id_fkey FOREIGN KEY (ia_fluxo_id) REFERENCES ia_fluxos(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'bot_canal_config_organizacao_id_fkey' and conrelid = 'public.bot_canal_config'::regclass) then alter table public.bot_canal_config add constraint bot_canal_config_organizacao_id_fkey FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'bot_conversa_estado_canal_id_fkey' and conrelid = 'public.bot_conversa_estado'::regclass) then alter table public.bot_conversa_estado add constraint bot_conversa_estado_canal_id_fkey FOREIGN KEY (canal_id) REFERENCES canais(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'bot_conversa_estado_contato_id_fkey' and conrelid = 'public.bot_conversa_estado'::regclass) then alter table public.bot_conversa_estado add constraint bot_conversa_estado_contato_id_fkey FOREIGN KEY (contato_id) REFERENCES contatos(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'bot_conversa_estado_conversa_id_fkey' and conrelid = 'public.bot_conversa_estado'::regclass) then alter table public.bot_conversa_estado add constraint bot_conversa_estado_conversa_id_fkey FOREIGN KEY (conversa_id) REFERENCES conversas(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'bot_conversa_estado_oportunidade_id_fkey' and conrelid = 'public.bot_conversa_estado'::regclass) then alter table public.bot_conversa_estado add constraint bot_conversa_estado_oportunidade_id_fkey FOREIGN KEY (oportunidade_id) REFERENCES oportunidades(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'bot_conversa_estado_organizacao_id_fkey' and conrelid = 'public.bot_conversa_estado'::regclass) then alter table public.bot_conversa_estado add constraint bot_conversa_estado_organizacao_id_fkey FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'bot_mensagens_saida_canal_id_fkey' and conrelid = 'public.bot_mensagens_saida'::regclass) then alter table public.bot_mensagens_saida add constraint bot_mensagens_saida_canal_id_fkey FOREIGN KEY (canal_id) REFERENCES canais(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'bot_mensagens_saida_conversa_id_fkey' and conrelid = 'public.bot_mensagens_saida'::regclass) then alter table public.bot_mensagens_saida add constraint bot_mensagens_saida_conversa_id_fkey FOREIGN KEY (conversa_id) REFERENCES conversas(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'bot_mensagens_saida_mensagem_id_fkey' and conrelid = 'public.bot_mensagens_saida'::regclass) then alter table public.bot_mensagens_saida add constraint bot_mensagens_saida_mensagem_id_fkey FOREIGN KEY (mensagem_id) REFERENCES mensagens(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'bot_mensagens_saida_organizacao_id_fkey' and conrelid = 'public.bot_mensagens_saida'::regclass) then alter table public.bot_mensagens_saida add constraint bot_mensagens_saida_organizacao_id_fkey FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'bot_remarketing_canal_id_fkey' and conrelid = 'public.bot_remarketing'::regclass) then alter table public.bot_remarketing add constraint bot_remarketing_canal_id_fkey FOREIGN KEY (canal_id) REFERENCES canais(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'bot_remarketing_contato_id_fkey' and conrelid = 'public.bot_remarketing'::regclass) then alter table public.bot_remarketing add constraint bot_remarketing_contato_id_fkey FOREIGN KEY (contato_id) REFERENCES contatos(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'bot_remarketing_conversa_id_fkey' and conrelid = 'public.bot_remarketing'::regclass) then alter table public.bot_remarketing add constraint bot_remarketing_conversa_id_fkey FOREIGN KEY (conversa_id) REFERENCES conversas(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'bot_remarketing_oportunidade_id_fkey' and conrelid = 'public.bot_remarketing'::regclass) then alter table public.bot_remarketing add constraint bot_remarketing_oportunidade_id_fkey FOREIGN KEY (oportunidade_id) REFERENCES oportunidades(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'bot_remarketing_organizacao_id_fkey' and conrelid = 'public.bot_remarketing'::regclass) then alter table public.bot_remarketing add constraint bot_remarketing_organizacao_id_fkey FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'bot_roteamentos_consultor_id_fkey' and conrelid = 'public.bot_roteamentos'::regclass) then alter table public.bot_roteamentos add constraint bot_roteamentos_consultor_id_fkey FOREIGN KEY (consultor_id) REFERENCES usuarios(id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'bot_roteamentos_contato_id_fkey' and conrelid = 'public.bot_roteamentos'::regclass) then alter table public.bot_roteamentos add constraint bot_roteamentos_contato_id_fkey FOREIGN KEY (contato_id) REFERENCES contatos(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'bot_roteamentos_conversa_id_fkey' and conrelid = 'public.bot_roteamentos'::regclass) then alter table public.bot_roteamentos add constraint bot_roteamentos_conversa_id_fkey FOREIGN KEY (conversa_id) REFERENCES conversas(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'bot_roteamentos_organizacao_id_fkey' and conrelid = 'public.bot_roteamentos'::regclass) then alter table public.bot_roteamentos add constraint bot_roteamentos_organizacao_id_fkey FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'canais_conflito_com_fkey' and conrelid = 'public.canais'::regclass) then alter table public.canais add constraint canais_conflito_com_fkey FOREIGN KEY (conflito_com) REFERENCES canais(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'canais_fonte_aquisicao_id_fkey' and conrelid = 'public.canais'::regclass) then alter table public.canais add constraint canais_fonte_aquisicao_id_fkey FOREIGN KEY (fonte_aquisicao_id) REFERENCES fontes_aquisicao(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'canais_gestor_id_fkey' and conrelid = 'public.canais'::regclass) then alter table public.canais add constraint canais_gestor_id_fkey FOREIGN KEY (gestor_id) REFERENCES usuarios(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'canais_org_fk' and conrelid = 'public.canais'::regclass) then alter table public.canais add constraint canais_org_fk FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'canal_health_runs_canal_id_fkey' and conrelid = 'public.canal_health_runs'::regclass) then alter table public.canal_health_runs add constraint canal_health_runs_canal_id_fkey FOREIGN KEY (canal_id) REFERENCES canais(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'canal_health_runs_organizacao_id_fkey' and conrelid = 'public.canal_health_runs'::regclass) then alter table public.canal_health_runs add constraint canal_health_runs_organizacao_id_fkey FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'canal_janela_canal_id_fkey' and conrelid = 'public.canal_janela'::regclass) then alter table public.canal_janela add constraint canal_janela_canal_id_fkey FOREIGN KEY (canal_id) REFERENCES canais(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'canal_janela_contato_id_fkey' and conrelid = 'public.canal_janela'::regclass) then alter table public.canal_janela add constraint canal_janela_contato_id_fkey FOREIGN KEY (contato_id) REFERENCES contatos(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'canal_janela_organizacao_id_fkey' and conrelid = 'public.canal_janela'::regclass) then alter table public.canal_janela add constraint canal_janela_organizacao_id_fkey FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'ciclos_vencimento_organizacao_id_fkey' and conrelid = 'public.ciclos_vencimento'::regclass) then alter table public.ciclos_vencimento add constraint ciclos_vencimento_organizacao_id_fkey FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'cobranca_eventos_cobranca_id_fkey' and conrelid = 'public.cobranca_eventos'::regclass) then alter table public.cobranca_eventos add constraint cobranca_eventos_cobranca_id_fkey FOREIGN KEY (cobranca_id) REFERENCES cobrancas(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'cobranca_eventos_org_fk' and conrelid = 'public.cobranca_eventos'::regclass) then alter table public.cobranca_eventos add constraint cobranca_eventos_org_fk FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'cobranca_eventos_usuario_id_fkey' and conrelid = 'public.cobranca_eventos'::regclass) then alter table public.cobranca_eventos add constraint cobranca_eventos_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'cobranca_pagamentos_cob_org_fk' and conrelid = 'public.cobranca_pagamentos'::regclass) then alter table public.cobranca_pagamentos add constraint cobranca_pagamentos_cob_org_fk FOREIGN KEY (cobranca_id, organizacao_id) REFERENCES cobrancas(id, organizacao_id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'cobranca_pagamentos_marcado_por_fkey' and conrelid = 'public.cobranca_pagamentos'::regclass) then alter table public.cobranca_pagamentos add constraint cobranca_pagamentos_marcado_por_fkey FOREIGN KEY (marcado_por) REFERENCES usuarios(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'cobranca_pagamentos_org_fk' and conrelid = 'public.cobranca_pagamentos'::regclass) then alter table public.cobranca_pagamentos add constraint cobranca_pagamentos_org_fk FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'cobrancas_ciclo_vencimento_id_fkey' and conrelid = 'public.cobrancas'::regclass) then alter table public.cobrancas add constraint cobrancas_ciclo_vencimento_id_fkey FOREIGN KEY (ciclo_vencimento_id) REFERENCES ciclos_vencimento(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'cobrancas_contato_org_fk' and conrelid = 'public.cobrancas'::regclass) then alter table public.cobrancas add constraint cobrancas_contato_org_fk FOREIGN KEY (contato_id, organizacao_id) REFERENCES contatos(id, organizacao_id) ON DELETE RESTRICT; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'cobrancas_criado_por_fkey' and conrelid = 'public.cobrancas'::regclass) then alter table public.cobrancas add constraint cobrancas_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES usuarios(id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'cobrancas_oportunidade_id_fkey' and conrelid = 'public.cobrancas'::regclass) then alter table public.cobrancas add constraint cobrancas_oportunidade_id_fkey FOREIGN KEY (oportunidade_id) REFERENCES oportunidades(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'cobrancas_org_fk' and conrelid = 'public.cobrancas'::regclass) then alter table public.cobrancas add constraint cobrancas_org_fk FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'cobrancas_responsavel_id_fkey' and conrelid = 'public.cobrancas'::regclass) then alter table public.cobrancas add constraint cobrancas_responsavel_id_fkey FOREIGN KEY (responsavel_id) REFERENCES usuarios(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'configuracoes_org_fk' and conrelid = 'public.configuracoes'::regclass) then alter table public.configuracoes add constraint configuracoes_org_fk FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'contato_identidades_contato_id_fkey' and conrelid = 'public.contato_identidades'::regclass) then alter table public.contato_identidades add constraint contato_identidades_contato_id_fkey FOREIGN KEY (contato_id) REFERENCES contatos(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'contato_identidades_org_fk' and conrelid = 'public.contato_identidades'::regclass) then alter table public.contato_identidades add constraint contato_identidades_org_fk FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'contatos_canal_origem_id_fkey' and conrelid = 'public.contatos'::regclass) then alter table public.contatos add constraint contatos_canal_origem_id_fkey FOREIGN KEY (canal_origem_id) REFERENCES canais(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'contatos_mesclado_para_fkey' and conrelid = 'public.contatos'::regclass) then alter table public.contatos add constraint contatos_mesclado_para_fkey FOREIGN KEY (mesclado_para) REFERENCES contatos(id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'contatos_org_fk' and conrelid = 'public.contatos'::regclass) then alter table public.contatos add constraint contatos_org_fk FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'contatos_responsavel_id_fkey' and conrelid = 'public.contatos'::regclass) then alter table public.contatos add constraint contatos_responsavel_id_fkey FOREIGN KEY (responsavel_id) REFERENCES usuarios(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'conversa_atividades_conversa_id_fkey' and conrelid = 'public.conversa_atividades'::regclass) then alter table public.conversa_atividades add constraint conversa_atividades_conversa_id_fkey FOREIGN KEY (conversa_id) REFERENCES conversas(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'conversa_atividades_organizacao_id_fkey' and conrelid = 'public.conversa_atividades'::regclass) then alter table public.conversa_atividades add constraint conversa_atividades_organizacao_id_fkey FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'conversa_atividades_usuario_id_fkey' and conrelid = 'public.conversa_atividades'::regclass) then alter table public.conversa_atividades add constraint conversa_atividades_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'conversa_etiquetas_conversa_id_fkey' and conrelid = 'public.conversa_etiquetas'::regclass) then alter table public.conversa_etiquetas add constraint conversa_etiquetas_conversa_id_fkey FOREIGN KEY (conversa_id) REFERENCES conversas(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'conversa_etiquetas_etiqueta_id_fkey' and conrelid = 'public.conversa_etiquetas'::regclass) then alter table public.conversa_etiquetas add constraint conversa_etiquetas_etiqueta_id_fkey FOREIGN KEY (etiqueta_id) REFERENCES etiquetas(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'conversa_etiquetas_organizacao_id_fkey' and conrelid = 'public.conversa_etiquetas'::regclass) then alter table public.conversa_etiquetas add constraint conversa_etiquetas_organizacao_id_fkey FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'conversa_higiene_adiamentos_conversa_id_fkey' and conrelid = 'public.conversa_higiene_adiamentos'::regclass) then alter table public.conversa_higiene_adiamentos add constraint conversa_higiene_adiamentos_conversa_id_fkey FOREIGN KEY (conversa_id) REFERENCES conversas(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'conversa_higiene_adiamentos_organizacao_id_fkey' and conrelid = 'public.conversa_higiene_adiamentos'::regclass) then alter table public.conversa_higiene_adiamentos add constraint conversa_higiene_adiamentos_organizacao_id_fkey FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'conversa_higiene_adiamentos_usuario_id_fkey' and conrelid = 'public.conversa_higiene_adiamentos'::regclass) then alter table public.conversa_higiene_adiamentos add constraint conversa_higiene_adiamentos_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'conversa_status_def_organizacao_id_fkey' and conrelid = 'public.conversa_status_def'::regclass) then alter table public.conversa_status_def add constraint conversa_status_def_organizacao_id_fkey FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'conversas_arquivada_por_fkey' and conrelid = 'public.conversas'::regclass) then alter table public.conversas add constraint conversas_arquivada_por_fkey FOREIGN KEY (arquivada_por) REFERENCES usuarios(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'conversas_atendente_id_fkey' and conrelid = 'public.conversas'::regclass) then alter table public.conversas add constraint conversas_atendente_id_fkey FOREIGN KEY (atendente_id) REFERENCES usuarios(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'conversas_canal_id_fkey' and conrelid = 'public.conversas'::regclass) then alter table public.conversas add constraint conversas_canal_id_fkey FOREIGN KEY (canal_id) REFERENCES canais(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'conversas_canal_origem_id_fkey' and conrelid = 'public.conversas'::regclass) then alter table public.conversas add constraint conversas_canal_origem_id_fkey FOREIGN KEY (canal_origem_id) REFERENCES canais(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'conversas_canal_preso_id_fkey' and conrelid = 'public.conversas'::regclass) then alter table public.conversas add constraint conversas_canal_preso_id_fkey FOREIGN KEY (canal_preso_id) REFERENCES canais(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'conversas_contato_id_fkey' and conrelid = 'public.conversas'::regclass) then alter table public.conversas add constraint conversas_contato_id_fkey FOREIGN KEY (contato_id) REFERENCES contatos(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'conversas_org_fk' and conrelid = 'public.conversas'::regclass) then alter table public.conversas add constraint conversas_org_fk FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'conversas_status_id_fkey' and conrelid = 'public.conversas'::regclass) then alter table public.conversas add constraint conversas_status_id_fkey FOREIGN KEY (status_id) REFERENCES conversa_status_def(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'conversas_ultimo_canal_id_fkey' and conrelid = 'public.conversas'::regclass) then alter table public.conversas add constraint conversas_ultimo_canal_id_fkey FOREIGN KEY (ultimo_canal_id) REFERENCES canais(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'convites_convidado_por_fkey' and conrelid = 'public.convites'::regclass) then alter table public.convites add constraint convites_convidado_por_fkey FOREIGN KEY (convidado_por) REFERENCES usuarios(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'convites_organizacao_id_fkey' and conrelid = 'public.convites'::regclass) then alter table public.convites add constraint convites_organizacao_id_fkey FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'etiquetas_organizacao_id_fkey' and conrelid = 'public.etiquetas'::regclass) then alter table public.etiquetas add constraint etiquetas_organizacao_id_fkey FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'fichas_judiciais_ficha_anterior_id_fkey' and conrelid = 'public.fichas_judiciais'::regclass) then alter table public.fichas_judiciais add constraint fichas_judiciais_ficha_anterior_id_fkey FOREIGN KEY (ficha_anterior_id) REFERENCES fichas_judiciais(id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'fk_ficha_atualpor' and conrelid = 'public.fichas_judiciais'::regclass) then alter table public.fichas_judiciais add constraint fk_ficha_atualpor FOREIGN KEY (atualizado_por) REFERENCES usuarios(id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'fk_ficha_canal' and conrelid = 'public.fichas_judiciais'::regclass) then alter table public.fichas_judiciais add constraint fk_ficha_canal FOREIGN KEY (canal_id, organizacao_id) REFERENCES canais(id, organizacao_id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'fk_ficha_contato' and conrelid = 'public.fichas_judiciais'::regclass) then alter table public.fichas_judiciais add constraint fk_ficha_contato FOREIGN KEY (contato_id, organizacao_id) REFERENCES contatos(id, organizacao_id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'fk_ficha_conversa' and conrelid = 'public.fichas_judiciais'::regclass) then alter table public.fichas_judiciais add constraint fk_ficha_conversa FOREIGN KEY (conversa_id, organizacao_id) REFERENCES conversas(id, organizacao_id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'fk_ficha_criadopor' and conrelid = 'public.fichas_judiciais'::regclass) then alter table public.fichas_judiciais add constraint fk_ficha_criadopor FOREIGN KEY (criado_por) REFERENCES usuarios(id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'fk_ficha_oport' and conrelid = 'public.fichas_judiciais'::regclass) then alter table public.fichas_judiciais add constraint fk_ficha_oport FOREIGN KEY (oportunidade_id, organizacao_id) REFERENCES oportunidades(id, organizacao_id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'fk_ficha_org' and conrelid = 'public.fichas_judiciais'::regclass) then alter table public.fichas_judiciais add constraint fk_ficha_org FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'fk_ficha_resp' and conrelid = 'public.fichas_judiciais'::regclass) then alter table public.fichas_judiciais add constraint fk_ficha_resp FOREIGN KEY (responsavel_id) REFERENCES usuarios(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'fontes_aquisicao_org_fk' and conrelid = 'public.fontes_aquisicao'::regclass) then alter table public.fontes_aquisicao add constraint fontes_aquisicao_org_fk FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'funil_colunas_funil_id_fkey' and conrelid = 'public.funil_colunas'::regclass) then alter table public.funil_colunas add constraint funil_colunas_funil_id_fkey FOREIGN KEY (funil_id) REFERENCES funis(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'funil_colunas_organizacao_id_fkey' and conrelid = 'public.funil_colunas'::regclass) then alter table public.funil_colunas add constraint funil_colunas_organizacao_id_fkey FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'funis_organizacao_id_fkey' and conrelid = 'public.funis'::regclass) then alter table public.funis add constraint funis_organizacao_id_fkey FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'ia_agentes_organizacao_id_fkey' and conrelid = 'public.ia_agentes'::regclass) then alter table public.ia_agentes add constraint ia_agentes_organizacao_id_fkey FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'ia_eventos_conversa_id_fkey' and conrelid = 'public.ia_eventos'::regclass) then alter table public.ia_eventos add constraint ia_eventos_conversa_id_fkey FOREIGN KEY (conversa_id) REFERENCES conversas(id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'ia_eventos_organizacao_id_fkey' and conrelid = 'public.ia_eventos'::regclass) then alter table public.ia_eventos add constraint ia_eventos_organizacao_id_fkey FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'ia_eventos_sessao_id_fkey' and conrelid = 'public.ia_eventos'::regclass) then alter table public.ia_eventos add constraint ia_eventos_sessao_id_fkey FOREIGN KEY (sessao_id) REFERENCES ia_sessoes(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'ia_fluxos_organizacao_id_fkey' and conrelid = 'public.ia_fluxos'::regclass) then alter table public.ia_fluxos add constraint ia_fluxos_organizacao_id_fkey FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'ia_pausas_conversa_id_fkey' and conrelid = 'public.ia_pausas'::regclass) then alter table public.ia_pausas add constraint ia_pausas_conversa_id_fkey FOREIGN KEY (conversa_id) REFERENCES conversas(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'ia_pausas_organizacao_id_fkey' and conrelid = 'public.ia_pausas'::regclass) then alter table public.ia_pausas add constraint ia_pausas_organizacao_id_fkey FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'ia_pausas_usuario_id_fkey' and conrelid = 'public.ia_pausas'::regclass) then alter table public.ia_pausas add constraint ia_pausas_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'ia_sessoes_canal_id_fkey' and conrelid = 'public.ia_sessoes'::regclass) then alter table public.ia_sessoes add constraint ia_sessoes_canal_id_fkey FOREIGN KEY (canal_id) REFERENCES canais(id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'ia_sessoes_contato_id_fkey' and conrelid = 'public.ia_sessoes'::regclass) then alter table public.ia_sessoes add constraint ia_sessoes_contato_id_fkey FOREIGN KEY (contato_id) REFERENCES contatos(id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'ia_sessoes_conversa_id_fkey' and conrelid = 'public.ia_sessoes'::regclass) then alter table public.ia_sessoes add constraint ia_sessoes_conversa_id_fkey FOREIGN KEY (conversa_id) REFERENCES conversas(id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'ia_sessoes_oportunidade_id_fkey' and conrelid = 'public.ia_sessoes'::regclass) then alter table public.ia_sessoes add constraint ia_sessoes_oportunidade_id_fkey FOREIGN KEY (oportunidade_id) REFERENCES oportunidades(id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'ia_sessoes_organizacao_id_fkey' and conrelid = 'public.ia_sessoes'::regclass) then alter table public.ia_sessoes add constraint ia_sessoes_organizacao_id_fkey FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'fk_inss_doc_contato' and conrelid = 'public.inss_documentos'::regclass) then alter table public.inss_documentos add constraint fk_inss_doc_contato FOREIGN KEY (contato_id, organizacao_id) REFERENCES contatos(id, organizacao_id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'inss_documentos_organizacao_id_fkey' and conrelid = 'public.inss_documentos'::regclass) then alter table public.inss_documentos add constraint inss_documentos_organizacao_id_fkey FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'inss_documentos_pedido_id_fkey' and conrelid = 'public.inss_documentos'::regclass) then alter table public.inss_documentos add constraint inss_documentos_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES inss_pedidos(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'fk_inss_pedido_contato' and conrelid = 'public.inss_pedidos'::regclass) then alter table public.inss_pedidos add constraint fk_inss_pedido_contato FOREIGN KEY (contato_id, organizacao_id) REFERENCES contatos(id, organizacao_id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'inss_pedidos_organizacao_id_fkey' and conrelid = 'public.inss_pedidos'::regclass) then alter table public.inss_pedidos add constraint inss_pedidos_organizacao_id_fkey FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'inss_pedidos_solicitante_id_fkey' and conrelid = 'public.inss_pedidos'::regclass) then alter table public.inss_pedidos add constraint inss_pedidos_solicitante_id_fkey FOREIGN KEY (solicitante_id) REFERENCES usuarios(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'integracoes_canal_id_fkey' and conrelid = 'public.atd_integracoes'::regclass) then alter table public.atd_integracoes add constraint integracoes_canal_id_fkey FOREIGN KEY (canal_id) REFERENCES canais(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'integracoes_org_fk' and conrelid = 'public.atd_integracoes'::regclass) then alter table public.atd_integracoes add constraint integracoes_org_fk FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'iris_carteira_conversa_id_fkey' and conrelid = 'public.iris_carteira'::regclass) then alter table public.iris_carteira add constraint iris_carteira_conversa_id_fkey FOREIGN KEY (conversa_id) REFERENCES conversas(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'iris_eventos_conversa_id_fkey' and conrelid = 'public.iris_eventos'::regclass) then alter table public.iris_eventos add constraint iris_eventos_conversa_id_fkey FOREIGN KEY (conversa_id) REFERENCES conversas(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'iris_eventos_organizacao_id_fkey' and conrelid = 'public.iris_eventos'::regclass) then alter table public.iris_eventos add constraint iris_eventos_organizacao_id_fkey FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'iris_eventos_texto_id_fkey' and conrelid = 'public.iris_eventos'::regclass) then alter table public.iris_eventos add constraint iris_eventos_texto_id_fkey FOREIGN KEY (texto_id) REFERENCES iris_textos(id) ON UPDATE CASCADE ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'iris_fila_abertura_conversa_id_fkey' and conrelid = 'public.iris_fila_abertura'::regclass) then alter table public.iris_fila_abertura add constraint iris_fila_abertura_conversa_id_fkey FOREIGN KEY (conversa_id) REFERENCES iris_carteira(conversa_id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'iris_followups_confirmou_3_ligacoes_por_fkey' and conrelid = 'public.iris_followups'::regclass) then alter table public.iris_followups add constraint iris_followups_confirmou_3_ligacoes_por_fkey FOREIGN KEY (confirmou_3_ligacoes_por) REFERENCES usuarios(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'iris_followups_contato_id_fkey' and conrelid = 'public.iris_followups'::regclass) then alter table public.iris_followups add constraint iris_followups_contato_id_fkey FOREIGN KEY (contato_id) REFERENCES contatos(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'iris_followups_conversa_id_fkey' and conrelid = 'public.iris_followups'::regclass) then alter table public.iris_followups add constraint iris_followups_conversa_id_fkey FOREIGN KEY (conversa_id) REFERENCES conversas(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'iris_followups_encerrado_por_fkey' and conrelid = 'public.iris_followups'::regclass) then alter table public.iris_followups add constraint iris_followups_encerrado_por_fkey FOREIGN KEY (encerrado_por) REFERENCES usuarios(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'iris_followups_oportunidade_id_fkey' and conrelid = 'public.iris_followups'::regclass) then alter table public.iris_followups add constraint iris_followups_oportunidade_id_fkey FOREIGN KEY (oportunidade_id) REFERENCES oportunidades(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'iris_followups_organizacao_id_fkey' and conrelid = 'public.iris_followups'::regclass) then alter table public.iris_followups add constraint iris_followups_organizacao_id_fkey FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'iris_monitor_achados_ciclo_id_fkey' and conrelid = 'public.iris_monitor_achados'::regclass) then alter table public.iris_monitor_achados add constraint iris_monitor_achados_ciclo_id_fkey FOREIGN KEY (ciclo_id) REFERENCES iris_monitor_ciclos(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'iris_monitor_achados_conversa_id_fkey' and conrelid = 'public.iris_monitor_achados'::regclass) then alter table public.iris_monitor_achados add constraint iris_monitor_achados_conversa_id_fkey FOREIGN KEY (conversa_id) REFERENCES conversas(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'iris_monitor_achados_organizacao_id_fkey' and conrelid = 'public.iris_monitor_achados'::regclass) then alter table public.iris_monitor_achados add constraint iris_monitor_achados_organizacao_id_fkey FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'iris_monitor_achados_revisado_por_fkey' and conrelid = 'public.iris_monitor_achados'::regclass) then alter table public.iris_monitor_achados add constraint iris_monitor_achados_revisado_por_fkey FOREIGN KEY (revisado_por) REFERENCES usuarios(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'iris_monitor_ciclos_organizacao_id_fkey' and conrelid = 'public.iris_monitor_ciclos'::regclass) then alter table public.iris_monitor_ciclos add constraint iris_monitor_ciclos_organizacao_id_fkey FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'iris_teste_limpezas_canal_id_fkey' and conrelid = 'public.iris_teste_limpezas'::regclass) then alter table public.iris_teste_limpezas add constraint iris_teste_limpezas_canal_id_fkey FOREIGN KEY (canal_id) REFERENCES canais(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'iris_teste_limpezas_contato_id_fkey' and conrelid = 'public.iris_teste_limpezas'::regclass) then alter table public.iris_teste_limpezas add constraint iris_teste_limpezas_contato_id_fkey FOREIGN KEY (contato_id) REFERENCES contatos(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'iris_teste_limpezas_conversa_id_fkey' and conrelid = 'public.iris_teste_limpezas'::regclass) then alter table public.iris_teste_limpezas add constraint iris_teste_limpezas_conversa_id_fkey FOREIGN KEY (conversa_id) REFERENCES conversas(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'iris_teste_limpezas_organizacao_id_fkey' and conrelid = 'public.iris_teste_limpezas'::regclass) then alter table public.iris_teste_limpezas add constraint iris_teste_limpezas_organizacao_id_fkey FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'ligacoes_marcadas_atendente_id_fkey' and conrelid = 'public.ligacoes_marcadas'::regclass) then alter table public.ligacoes_marcadas add constraint ligacoes_marcadas_atendente_id_fkey FOREIGN KEY (atendente_id) REFERENCES usuarios(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'ligacoes_marcadas_contato_id_fkey' and conrelid = 'public.ligacoes_marcadas'::regclass) then alter table public.ligacoes_marcadas add constraint ligacoes_marcadas_contato_id_fkey FOREIGN KEY (contato_id) REFERENCES contatos(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'ligacoes_marcadas_conversa_id_fkey' and conrelid = 'public.ligacoes_marcadas'::regclass) then alter table public.ligacoes_marcadas add constraint ligacoes_marcadas_conversa_id_fkey FOREIGN KEY (conversa_id) REFERENCES conversas(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'ligacoes_marcadas_lembrete_id_fkey' and conrelid = 'public.ligacoes_marcadas'::regclass) then alter table public.ligacoes_marcadas add constraint ligacoes_marcadas_lembrete_id_fkey FOREIGN KEY (lembrete_id) REFERENCES assistente_lembretes(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'ligacoes_marcadas_organizacao_id_fkey' and conrelid = 'public.ligacoes_marcadas'::regclass) then alter table public.ligacoes_marcadas add constraint ligacoes_marcadas_organizacao_id_fkey FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'ligacoes_marcadas_status_por_fkey' and conrelid = 'public.ligacoes_marcadas'::regclass) then alter table public.ligacoes_marcadas add constraint ligacoes_marcadas_status_por_fkey FOREIGN KEY (status_por) REFERENCES usuarios(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'mensagens_autor_id_fkey' and conrelid = 'public.mensagens'::regclass) then alter table public.mensagens add constraint mensagens_autor_id_fkey FOREIGN KEY (autor_id) REFERENCES usuarios(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'mensagens_conversa_id_fkey' and conrelid = 'public.mensagens'::regclass) then alter table public.mensagens add constraint mensagens_conversa_id_fkey FOREIGN KEY (conversa_id) REFERENCES conversas(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'mensagens_org_fk' and conrelid = 'public.mensagens'::regclass) then alter table public.mensagens add constraint mensagens_org_fk FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'mensagens_respondida_a_id_fkey' and conrelid = 'public.mensagens'::regclass) then alter table public.mensagens add constraint mensagens_respondida_a_id_fkey FOREIGN KEY (respondida_a_id) REFERENCES mensagens(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'mensagens_agendadas_canal_id_fkey' and conrelid = 'public.mensagens_agendadas'::regclass) then alter table public.mensagens_agendadas add constraint mensagens_agendadas_canal_id_fkey FOREIGN KEY (canal_id) REFERENCES canais(id) ON DELETE RESTRICT; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'mensagens_agendadas_cancelada_por_fkey' and conrelid = 'public.mensagens_agendadas'::regclass) then alter table public.mensagens_agendadas add constraint mensagens_agendadas_cancelada_por_fkey FOREIGN KEY (cancelada_por) REFERENCES usuarios(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'mensagens_agendadas_contato_id_fkey' and conrelid = 'public.mensagens_agendadas'::regclass) then alter table public.mensagens_agendadas add constraint mensagens_agendadas_contato_id_fkey FOREIGN KEY (contato_id) REFERENCES contatos(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'mensagens_agendadas_conversa_id_fkey' and conrelid = 'public.mensagens_agendadas'::regclass) then alter table public.mensagens_agendadas add constraint mensagens_agendadas_conversa_id_fkey FOREIGN KEY (conversa_id) REFERENCES conversas(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'mensagens_agendadas_criado_por_fkey' and conrelid = 'public.mensagens_agendadas'::regclass) then alter table public.mensagens_agendadas add constraint mensagens_agendadas_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES usuarios(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'mensagens_agendadas_editada_por_fkey' and conrelid = 'public.mensagens_agendadas'::regclass) then alter table public.mensagens_agendadas add constraint mensagens_agendadas_editada_por_fkey FOREIGN KEY (editada_por) REFERENCES usuarios(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'mensagens_agendadas_mensagem_id_enviada_fkey' and conrelid = 'public.mensagens_agendadas'::regclass) then alter table public.mensagens_agendadas add constraint mensagens_agendadas_mensagem_id_enviada_fkey FOREIGN KEY (mensagem_id_enviada) REFERENCES mensagens(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'mensagens_agendadas_organizacao_id_fkey' and conrelid = 'public.mensagens_agendadas'::regclass) then alter table public.mensagens_agendadas add constraint mensagens_agendadas_organizacao_id_fkey FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'mensagens_agendadas_regua_ativacao_id_fkey' and conrelid = 'public.mensagens_agendadas'::regclass) then alter table public.mensagens_agendadas add constraint mensagens_agendadas_regua_ativacao_id_fkey FOREIGN KEY (regua_ativacao_id) REFERENCES regua_ativacoes(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'midia_melhoria_ia_contato_id_fkey' and conrelid = 'public.midia_melhoria_ia'::regclass) then alter table public.midia_melhoria_ia add constraint midia_melhoria_ia_contato_id_fkey FOREIGN KEY (contato_id) REFERENCES contatos(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'midia_melhoria_ia_criado_por_fkey' and conrelid = 'public.midia_melhoria_ia'::regclass) then alter table public.midia_melhoria_ia add constraint midia_melhoria_ia_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES auth.users(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'midia_melhoria_ia_mensagem_id_fkey' and conrelid = 'public.midia_melhoria_ia'::regclass) then alter table public.midia_melhoria_ia add constraint midia_melhoria_ia_mensagem_id_fkey FOREIGN KEY (mensagem_id) REFERENCES mensagens(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'midia_melhoria_ia_organizacao_id_fkey' and conrelid = 'public.midia_melhoria_ia'::regclass) then alter table public.midia_melhoria_ia add constraint midia_melhoria_ia_organizacao_id_fkey FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'notificacoes_organizacao_id_fkey' and conrelid = 'public.atd_notificacoes'::regclass) then alter table public.atd_notificacoes add constraint notificacoes_organizacao_id_fkey FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'notificacoes_usuario_id_fkey' and conrelid = 'public.atd_notificacoes'::regclass) then alter table public.atd_notificacoes add constraint notificacoes_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'oportunidade_checklist_item_slug_fkey' and conrelid = 'public.oportunidade_checklist'::regclass) then alter table public.oportunidade_checklist add constraint oportunidade_checklist_item_slug_fkey FOREIGN KEY (item_slug) REFERENCES checklist_modelo(item_slug); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'oportunidade_checklist_oportunidade_id_fkey' and conrelid = 'public.oportunidade_checklist'::regclass) then alter table public.oportunidade_checklist add constraint oportunidade_checklist_oportunidade_id_fkey FOREIGN KEY (oportunidade_id) REFERENCES oportunidades(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'oportunidade_eventos_executado_por_fkey' and conrelid = 'public.oportunidade_eventos'::regclass) then alter table public.oportunidade_eventos add constraint oportunidade_eventos_executado_por_fkey FOREIGN KEY (executado_por) REFERENCES usuarios(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'oportunidade_eventos_oportunidade_id_fkey' and conrelid = 'public.oportunidade_eventos'::regclass) then alter table public.oportunidade_eventos add constraint oportunidade_eventos_oportunidade_id_fkey FOREIGN KEY (oportunidade_id) REFERENCES oportunidades(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'oportunidade_eventos_resp_fech_fkey' and conrelid = 'public.oportunidade_eventos'::regclass) then alter table public.oportunidade_eventos add constraint oportunidade_eventos_resp_fech_fkey FOREIGN KEY (responsavel_no_fechamento_id) REFERENCES usuarios(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'oportunidades_canal_origem_id_fkey' and conrelid = 'public.oportunidades'::regclass) then alter table public.oportunidades add constraint oportunidades_canal_origem_id_fkey FOREIGN KEY (canal_origem_id) REFERENCES canais(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'oportunidades_coluna_id_fkey' and conrelid = 'public.oportunidades'::regclass) then alter table public.oportunidades add constraint oportunidades_coluna_id_fkey FOREIGN KEY (coluna_id) REFERENCES funil_colunas(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'oportunidades_contato_id_fkey' and conrelid = 'public.oportunidades'::regclass) then alter table public.oportunidades add constraint oportunidades_contato_id_fkey FOREIGN KEY (contato_id) REFERENCES contatos(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'oportunidades_conversa_origem_id_fkey' and conrelid = 'public.oportunidades'::regclass) then alter table public.oportunidades add constraint oportunidades_conversa_origem_id_fkey FOREIGN KEY (conversa_origem_id) REFERENCES conversas(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'oportunidades_fechado_por_id_fkey' and conrelid = 'public.oportunidades'::regclass) then alter table public.oportunidades add constraint oportunidades_fechado_por_id_fkey FOREIGN KEY (fechado_por_id) REFERENCES usuarios(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'oportunidades_funil_id_fkey' and conrelid = 'public.oportunidades'::regclass) then alter table public.oportunidades add constraint oportunidades_funil_id_fkey FOREIGN KEY (funil_id) REFERENCES funis(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'oportunidades_org_fk' and conrelid = 'public.oportunidades'::regclass) then alter table public.oportunidades add constraint oportunidades_org_fk FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'oportunidades_responsavel_id_fkey' and conrelid = 'public.oportunidades'::regclass) then alter table public.oportunidades add constraint oportunidades_responsavel_id_fkey FOREIGN KEY (responsavel_id) REFERENCES usuarios(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'oportunidades_responsavel_no_fechamento_id_fkey' and conrelid = 'public.oportunidades'::regclass) then alter table public.oportunidades add constraint oportunidades_responsavel_no_fechamento_id_fkey FOREIGN KEY (responsavel_no_fechamento_id) REFERENCES usuarios(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'organizacao_limites_organizacao_id_fkey' and conrelid = 'public.organizacao_limites'::regclass) then alter table public.organizacao_limites add constraint organizacao_limites_organizacao_id_fkey FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'organizacao_usuarios_organizacao_id_fkey' and conrelid = 'public.organizacao_usuarios'::regclass) then alter table public.organizacao_usuarios add constraint organizacao_usuarios_organizacao_id_fkey FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'organizacao_usuarios_usuario_id_fkey' and conrelid = 'public.organizacao_usuarios'::regclass) then alter table public.organizacao_usuarios add constraint organizacao_usuarios_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'pendencias_canal_id_fkey' and conrelid = 'public.pendencias'::regclass) then alter table public.pendencias add constraint pendencias_canal_id_fkey FOREIGN KEY (canal_id) REFERENCES canais(id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'pendencias_contato_id_fkey' and conrelid = 'public.pendencias'::regclass) then alter table public.pendencias add constraint pendencias_contato_id_fkey FOREIGN KEY (contato_id) REFERENCES contatos(id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'pendencias_conversa_id_fkey' and conrelid = 'public.pendencias'::regclass) then alter table public.pendencias add constraint pendencias_conversa_id_fkey FOREIGN KEY (conversa_id) REFERENCES conversas(id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'pendencias_oportunidade_id_fkey' and conrelid = 'public.pendencias'::regclass) then alter table public.pendencias add constraint pendencias_oportunidade_id_fkey FOREIGN KEY (oportunidade_id) REFERENCES oportunidades(id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'pendencias_organizacao_id_fkey' and conrelid = 'public.pendencias'::regclass) then alter table public.pendencias add constraint pendencias_organizacao_id_fkey FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'planilha_config_organizacao_id_fkey' and conrelid = 'public.planilha_config'::regclass) then alter table public.planilha_config add constraint planilha_config_organizacao_id_fkey FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'presenciais_alterado_por_fkey' and conrelid = 'public.presenciais'::regclass) then alter table public.presenciais add constraint presenciais_alterado_por_fkey FOREIGN KEY (alterado_por) REFERENCES usuarios(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'presenciais_contato_id_fkey' and conrelid = 'public.presenciais'::regclass) then alter table public.presenciais add constraint presenciais_contato_id_fkey FOREIGN KEY (contato_id) REFERENCES contatos(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'presenciais_marcado_por_fkey' and conrelid = 'public.presenciais'::regclass) then alter table public.presenciais add constraint presenciais_marcado_por_fkey FOREIGN KEY (marcado_por) REFERENCES usuarios(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'presenciais_organizacao_id_fkey' and conrelid = 'public.presenciais'::regclass) then alter table public.presenciais add constraint presenciais_organizacao_id_fkey FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'presenciais_avisos_organizacao_id_fkey' and conrelid = 'public.presenciais_avisos'::regclass) then alter table public.presenciais_avisos add constraint presenciais_avisos_organizacao_id_fkey FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'presenciais_avisos_presencial_id_fkey' and conrelid = 'public.presenciais_avisos'::regclass) then alter table public.presenciais_avisos add constraint presenciais_avisos_presencial_id_fkey FOREIGN KEY (presencial_id) REFERENCES presenciais(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'recados_gestor_contato_id_fkey' and conrelid = 'public.recados_gestor'::regclass) then alter table public.recados_gestor add constraint recados_gestor_contato_id_fkey FOREIGN KEY (contato_id) REFERENCES contatos(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'recados_gestor_origem_id_fkey' and conrelid = 'public.recados_gestor'::regclass) then alter table public.recados_gestor add constraint recados_gestor_origem_id_fkey FOREIGN KEY (origem_id) REFERENCES recados_gestor(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'fk_ativ_ativpor' and conrelid = 'public.regua_ativacoes'::regclass) then alter table public.regua_ativacoes add constraint fk_ativ_ativpor FOREIGN KEY (ativado_por) REFERENCES usuarios(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'fk_ativ_canal' and conrelid = 'public.regua_ativacoes'::regclass) then alter table public.regua_ativacoes add constraint fk_ativ_canal FOREIGN KEY (canal_id, organizacao_id) REFERENCES canais(id, organizacao_id) ON DELETE RESTRICT; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'fk_ativ_contato' and conrelid = 'public.regua_ativacoes'::regclass) then alter table public.regua_ativacoes add constraint fk_ativ_contato FOREIGN KEY (contato_id, organizacao_id) REFERENCES contatos(id, organizacao_id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'fk_ativ_conversa' and conrelid = 'public.regua_ativacoes'::regclass) then alter table public.regua_ativacoes add constraint fk_ativ_conversa FOREIGN KEY (conversa_id, organizacao_id) REFERENCES conversas(id, organizacao_id) ON DELETE SET NULL (conversa_id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'fk_ativ_org' and conrelid = 'public.regua_ativacoes'::regclass) then alter table public.regua_ativacoes add constraint fk_ativ_org FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'fk_ativ_regua' and conrelid = 'public.regua_ativacoes'::regclass) then alter table public.regua_ativacoes add constraint fk_ativ_regua FOREIGN KEY (regua_id, organizacao_id) REFERENCES reguas(id, organizacao_id) ON DELETE RESTRICT; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'fk_ativ_resp' and conrelid = 'public.regua_ativacoes'::regclass) then alter table public.regua_ativacoes add constraint fk_ativ_resp FOREIGN KEY (responsavel_id) REFERENCES usuarios(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'fk_env_ativ' and conrelid = 'public.regua_envios'::regclass) then alter table public.regua_envios add constraint fk_env_ativ FOREIGN KEY (ativacao_id, organizacao_id) REFERENCES regua_ativacoes(id, organizacao_id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'fk_env_msg' and conrelid = 'public.regua_envios'::regclass) then alter table public.regua_envios add constraint fk_env_msg FOREIGN KEY (mensagem_agendada_id) REFERENCES mensagens_agendadas(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'fk_env_org' and conrelid = 'public.regua_envios'::regclass) then alter table public.regua_envios add constraint fk_env_org FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'fk_env_passo' and conrelid = 'public.regua_envios'::regclass) then alter table public.regua_envios add constraint fk_env_passo FOREIGN KEY (passo_id) REFERENCES regua_passos(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'fk_passo_regua' and conrelid = 'public.regua_passos'::regclass) then alter table public.regua_passos add constraint fk_passo_regua FOREIGN KEY (regua_id, organizacao_id) REFERENCES reguas(id, organizacao_id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'fk_regua_canal' and conrelid = 'public.reguas'::regclass) then alter table public.reguas add constraint fk_regua_canal FOREIGN KEY (canal_padrao_id, organizacao_id) REFERENCES canais(id, organizacao_id) ON DELETE SET NULL (canal_padrao_id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'fk_regua_criadopor' and conrelid = 'public.reguas'::regclass) then alter table public.reguas add constraint fk_regua_criadopor FOREIGN KEY (criado_por) REFERENCES usuarios(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'fk_regua_org' and conrelid = 'public.reguas'::regclass) then alter table public.reguas add constraint fk_regua_org FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'fk_blq_contato' and conrelid = 'public.relacionamento_bloqueio'::regclass) then alter table public.relacionamento_bloqueio add constraint fk_blq_contato FOREIGN KEY (contato_id, organizacao_id) REFERENCES contatos(id, organizacao_id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'fk_blq_criadopor' and conrelid = 'public.relacionamento_bloqueio'::regclass) then alter table public.relacionamento_bloqueio add constraint fk_blq_criadopor FOREIGN KEY (criado_por) REFERENCES usuarios(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'fk_blq_org' and conrelid = 'public.relacionamento_bloqueio'::regclass) then alter table public.relacionamento_bloqueio add constraint fk_blq_org FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'remarketing_config_organizacao_id_fkey' and conrelid = 'public.remarketing_config'::regclass) then alter table public.remarketing_config add constraint remarketing_config_organizacao_id_fkey FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'remarketing_eventos_organizacao_id_fkey' and conrelid = 'public.remarketing_eventos'::regclass) then alter table public.remarketing_eventos add constraint remarketing_eventos_organizacao_id_fkey FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'remarketing_eventos_remarketing_id_fkey' and conrelid = 'public.remarketing_eventos'::regclass) then alter table public.remarketing_eventos add constraint remarketing_eventos_remarketing_id_fkey FOREIGN KEY (remarketing_id) REFERENCES remarketing_leads(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'remarketing_leads_contato_id_fkey' and conrelid = 'public.remarketing_leads'::regclass) then alter table public.remarketing_leads add constraint remarketing_leads_contato_id_fkey FOREIGN KEY (contato_id) REFERENCES contatos(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'remarketing_leads_conversa_id_fkey' and conrelid = 'public.remarketing_leads'::regclass) then alter table public.remarketing_leads add constraint remarketing_leads_conversa_id_fkey FOREIGN KEY (conversa_id) REFERENCES conversas(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'remarketing_leads_oportunidade_id_fkey' and conrelid = 'public.remarketing_leads'::regclass) then alter table public.remarketing_leads add constraint remarketing_leads_oportunidade_id_fkey FOREIGN KEY (oportunidade_id) REFERENCES oportunidades(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'remarketing_leads_organizacao_id_fkey' and conrelid = 'public.remarketing_leads'::regclass) then alter table public.remarketing_leads add constraint remarketing_leads_organizacao_id_fkey FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'remarketing_leads_responsavel_id_fkey' and conrelid = 'public.remarketing_leads'::regclass) then alter table public.remarketing_leads add constraint remarketing_leads_responsavel_id_fkey FOREIGN KEY (responsavel_id) REFERENCES usuarios(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'remarketing_tarefas_concluida_por_fkey' and conrelid = 'public.remarketing_tarefas'::regclass) then alter table public.remarketing_tarefas add constraint remarketing_tarefas_concluida_por_fkey FOREIGN KEY (concluida_por) REFERENCES usuarios(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'remarketing_tarefas_contato_id_fkey' and conrelid = 'public.remarketing_tarefas'::regclass) then alter table public.remarketing_tarefas add constraint remarketing_tarefas_contato_id_fkey FOREIGN KEY (contato_id) REFERENCES contatos(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'remarketing_tarefas_conversa_id_fkey' and conrelid = 'public.remarketing_tarefas'::regclass) then alter table public.remarketing_tarefas add constraint remarketing_tarefas_conversa_id_fkey FOREIGN KEY (conversa_id) REFERENCES conversas(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'remarketing_tarefas_organizacao_id_fkey' and conrelid = 'public.remarketing_tarefas'::regclass) then alter table public.remarketing_tarefas add constraint remarketing_tarefas_organizacao_id_fkey FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'remarketing_tarefas_remarketing_id_fkey' and conrelid = 'public.remarketing_tarefas'::regclass) then alter table public.remarketing_tarefas add constraint remarketing_tarefas_remarketing_id_fkey FOREIGN KEY (remarketing_id) REFERENCES remarketing_leads(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'remarketing_tarefas_responsavel_id_fkey' and conrelid = 'public.remarketing_tarefas'::regclass) then alter table public.remarketing_tarefas add constraint remarketing_tarefas_responsavel_id_fkey FOREIGN KEY (responsavel_id) REFERENCES usuarios(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'robo_ligar_concluido_por_fkey' and conrelid = 'public.robo_ligar'::regclass) then alter table public.robo_ligar add constraint robo_ligar_concluido_por_fkey FOREIGN KEY (concluido_por) REFERENCES usuarios(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'robo_ligar_conversa_id_fkey' and conrelid = 'public.robo_ligar'::regclass) then alter table public.robo_ligar add constraint robo_ligar_conversa_id_fkey FOREIGN KEY (conversa_id) REFERENCES conversas(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'script_anexos_org_fk' and conrelid = 'public.script_anexos'::regclass) then alter table public.script_anexos add constraint script_anexos_org_fk FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'script_anexos_script_id_fkey' and conrelid = 'public.script_anexos'::regclass) then alter table public.script_anexos add constraint script_anexos_script_id_fkey FOREIGN KEY (script_id) REFERENCES scripts(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'script_categorias_org_fk' and conrelid = 'public.script_categorias'::regclass) then alter table public.script_categorias add constraint script_categorias_org_fk FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'script_etapas_organizacao_id_fkey' and conrelid = 'public.script_etapas'::regclass) then alter table public.script_etapas add constraint script_etapas_organizacao_id_fkey FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'script_etapas_script_id_fkey' and conrelid = 'public.script_etapas'::regclass) then alter table public.script_etapas add constraint script_etapas_script_id_fkey FOREIGN KEY (script_id) REFERENCES scripts(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'script_execucoes_conversa_id_fkey' and conrelid = 'public.script_execucoes'::regclass) then alter table public.script_execucoes add constraint script_execucoes_conversa_id_fkey FOREIGN KEY (conversa_id) REFERENCES conversas(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'script_execucoes_organizacao_id_fkey' and conrelid = 'public.script_execucoes'::regclass) then alter table public.script_execucoes add constraint script_execucoes_organizacao_id_fkey FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'script_execucoes_script_id_fkey' and conrelid = 'public.script_execucoes'::regclass) then alter table public.script_execucoes add constraint script_execucoes_script_id_fkey FOREIGN KEY (script_id) REFERENCES scripts(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'scripts_autor_id_fkey' and conrelid = 'public.scripts'::regclass) then alter table public.scripts add constraint scripts_autor_id_fkey FOREIGN KEY (autor_id) REFERENCES usuarios(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'scripts_categoria_id_fkey' and conrelid = 'public.scripts'::regclass) then alter table public.scripts add constraint scripts_categoria_id_fkey FOREIGN KEY (categoria_id) REFERENCES script_categorias(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'scripts_org_fk' and conrelid = 'public.scripts'::regclass) then alter table public.scripts add constraint scripts_org_fk FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'sla_alertas_contato_id_fkey' and conrelid = 'public.sla_alertas'::regclass) then alter table public.sla_alertas add constraint sla_alertas_contato_id_fkey FOREIGN KEY (contato_id) REFERENCES contatos(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'sla_alertas_conversa_id_fkey' and conrelid = 'public.sla_alertas'::regclass) then alter table public.sla_alertas add constraint sla_alertas_conversa_id_fkey FOREIGN KEY (conversa_id) REFERENCES conversas(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'sla_alertas_oportunidade_id_fkey' and conrelid = 'public.sla_alertas'::regclass) then alter table public.sla_alertas add constraint sla_alertas_oportunidade_id_fkey FOREIGN KEY (oportunidade_id) REFERENCES oportunidades(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'sla_alertas_organizacao_id_fkey' and conrelid = 'public.sla_alertas'::regclass) then alter table public.sla_alertas add constraint sla_alertas_organizacao_id_fkey FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'sla_alertas_resolvido_por_fkey' and conrelid = 'public.sla_alertas'::regclass) then alter table public.sla_alertas add constraint sla_alertas_resolvido_por_fkey FOREIGN KEY (resolvido_por) REFERENCES usuarios(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'sla_alertas_responsavel_id_fkey' and conrelid = 'public.sla_alertas'::regclass) then alter table public.sla_alertas add constraint sla_alertas_responsavel_id_fkey FOREIGN KEY (responsavel_id) REFERENCES usuarios(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'sla_alertas_silenciado_por_fkey' and conrelid = 'public.sla_alertas'::regclass) then alter table public.sla_alertas add constraint sla_alertas_silenciado_por_fkey FOREIGN KEY (silenciado_por) REFERENCES usuarios(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'usuario_preferencias_usuario_id_fkey' and conrelid = 'public.usuario_preferencias'::regclass) then alter table public.usuario_preferencias add constraint usuario_preferencias_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'usuarios_id_fkey' and conrelid = 'public.usuarios'::regclass) then alter table public.usuarios add constraint usuarios_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'vacuo_config_organizacao_id_fkey' and conrelid = 'public.vacuo_config'::regclass) then alter table public.vacuo_config add constraint vacuo_config_organizacao_id_fkey FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'vacuo_estado_conversa_id_fkey' and conrelid = 'public.vacuo_estado'::regclass) then alter table public.vacuo_estado add constraint vacuo_estado_conversa_id_fkey FOREIGN KEY (conversa_id) REFERENCES conversas(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'vacuo_repasses_contato_id_fkey' and conrelid = 'public.vacuo_repasses'::regclass) then alter table public.vacuo_repasses add constraint vacuo_repasses_contato_id_fkey FOREIGN KEY (contato_id) REFERENCES contatos(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'vacuo_repasses_conversa_id_fkey' and conrelid = 'public.vacuo_repasses'::regclass) then alter table public.vacuo_repasses add constraint vacuo_repasses_conversa_id_fkey FOREIGN KEY (conversa_id) REFERENCES conversas(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'vacuo_repasses_de_usuario_id_fkey' and conrelid = 'public.vacuo_repasses'::regclass) then alter table public.vacuo_repasses add constraint vacuo_repasses_de_usuario_id_fkey FOREIGN KEY (de_usuario_id) REFERENCES usuarios(id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'vacuo_repasses_decidido_por_fkey' and conrelid = 'public.vacuo_repasses'::regclass) then alter table public.vacuo_repasses add constraint vacuo_repasses_decidido_por_fkey FOREIGN KEY (decidido_por) REFERENCES usuarios(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'vacuo_repasses_oportunidade_id_fkey' and conrelid = 'public.vacuo_repasses'::regclass) then alter table public.vacuo_repasses add constraint vacuo_repasses_oportunidade_id_fkey FOREIGN KEY (oportunidade_id) REFERENCES oportunidades(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'vacuo_repasses_para_usuario_id_fkey' and conrelid = 'public.vacuo_repasses'::regclass) then alter table public.vacuo_repasses add constraint vacuo_repasses_para_usuario_id_fkey FOREIGN KEY (para_usuario_id) REFERENCES usuarios(id); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'wa_lid_map_canal_id_fkey' and conrelid = 'public.wa_lid_map'::regclass) then alter table public.wa_lid_map add constraint wa_lid_map_canal_id_fkey FOREIGN KEY (canal_id) REFERENCES canais(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'wa_lid_map_organizacao_id_fkey' and conrelid = 'public.wa_lid_map'::regclass) then alter table public.wa_lid_map add constraint wa_lid_map_organizacao_id_fkey FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'wa_optout_canal_id_fkey' and conrelid = 'public.atd_wa_optout'::regclass) then alter table public.atd_wa_optout add constraint wa_optout_canal_id_fkey FOREIGN KEY (canal_id) REFERENCES canais(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'wa_optout_contato_id_fkey' and conrelid = 'public.atd_wa_optout'::regclass) then alter table public.atd_wa_optout add constraint wa_optout_contato_id_fkey FOREIGN KEY (contato_id) REFERENCES contatos(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'wa_optout_organizacao_id_fkey' and conrelid = 'public.atd_wa_optout'::regclass) then alter table public.atd_wa_optout add constraint wa_optout_organizacao_id_fkey FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'wa_templates_atualizado_por_fkey' and conrelid = 'public.wa_templates'::regclass) then alter table public.wa_templates add constraint wa_templates_atualizado_por_fkey FOREIGN KEY (atualizado_por) REFERENCES usuarios(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'wa_templates_canal_id_fkey' and conrelid = 'public.wa_templates'::regclass) then alter table public.wa_templates add constraint wa_templates_canal_id_fkey FOREIGN KEY (canal_id) REFERENCES canais(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'wa_templates_criado_por_fkey' and conrelid = 'public.wa_templates'::regclass) then alter table public.wa_templates add constraint wa_templates_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES usuarios(id) ON DELETE SET NULL; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'wa_templates_organizacao_id_fkey' and conrelid = 'public.wa_templates'::regclass) then alter table public.wa_templates add constraint wa_templates_organizacao_id_fkey FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE; end if; end $$;

-- 6. índices
CREATE INDEX IF NOT EXISTS idx_adm_casos_completo ON public.adm_casos USING btree (organizacao_id, completo_em);
CREATE INDEX IF NOT EXISTS idx_adm_fechados_contato ON public.adm_fechados USING btree (contato_id) WHERE (contato_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_adm_mov_contato ON public.adm_movimentos USING btree (contato_id) WHERE (acao = ANY (ARRAY['reabrir'::text, 'arquivar'::text]));
CREATE INDEX IF NOT EXISTS idx_adm_mov_org ON public.adm_movimentos USING btree (organizacao_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_adm_pendencias_contato ON public.adm_pendencias USING btree (organizacao_id, contato_id);
CREATE INDEX IF NOT EXISTS idx_agend_ativ ON public.agendamento_atividades USING btree (agendamento_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_agendamentos_atendente ON public.agendamentos USING btree (atendente_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_contato ON public.agendamentos USING btree (contato_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_org_inicio ON public.agendamentos USING btree (organizacao_id, inicio_em);
CREATE INDEX IF NOT EXISTS idx_alertas_lq_org_status ON public.alertas_lead_quente USING btree (organizacao_id, status, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_assitem_assinatura ON public.assinatura_itens USING btree (assinatura_id);
CREATE INDEX IF NOT EXISTS idx_assitem_org ON public.assinatura_itens USING btree (organizacao_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_assinatura_asaas ON public.assinaturas USING btree (asaas_subscription_id) WHERE (asaas_subscription_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_assistente_lembretes_pendentes ON public.assistente_lembretes USING btree (quando) WHERE (status = 'pendente'::text);
CREATE INDEX IF NOT EXISTS idx_assistente_lembretes_usuario ON public.assistente_lembretes USING btree (usuario_id, quando) WHERE (status = ANY (ARRAY['pendente'::text, 'avisado'::text]));
CREATE INDEX IF NOT EXISTS idx_audit_criado ON public.audit_log USING btree (criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entidade ON public.audit_log USING btree (entidade, entidade_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_org ON public.audit_log USING btree (organizacao_id);
CREATE INDEX IF NOT EXISTS idx_audit_usuario ON public.audit_log USING btree (usuario_id);
CREATE INDEX IF NOT EXISTS avisos_passado_humano_conv ON public.avisos_passado_humano USING btree (conversa_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS avisos_passado_humano_pend ON public.avisos_passado_humano USING btree (criado_em) WHERE ((enviado_em IS NULL) AND (descartado_em IS NULL));
CREATE INDEX IF NOT EXISTS bot_canal_config_ia_agente_idx ON public.bot_canal_config USING btree (ia_agente_id) WHERE (ia_agente_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS bot_canal_config_ia_fluxo_idx ON public.bot_canal_config USING btree (ia_fluxo_id) WHERE (ia_fluxo_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_bot_canal_config_enabled ON public.bot_canal_config USING btree (canal_id) WHERE bot_enabled;
CREATE INDEX IF NOT EXISTS idx_bot_canal_config_org ON public.bot_canal_config USING btree (organizacao_id);
CREATE INDEX IF NOT EXISTS idx_bot_estado_org ON public.bot_conversa_estado USING btree (organizacao_id);
CREATE INDEX IF NOT EXISTS idx_bot_estado_vivo ON public.bot_conversa_estado USING btree (etapa) WHERE (NOT pausado);
CREATE INDEX IF NOT EXISTS idx_bot_saida_conversa ON public.bot_mensagens_saida USING btree (conversa_id);
CREATE INDEX IF NOT EXISTS idx_bot_saida_drain ON public.bot_mensagens_saida USING btree (status, enviar_apos) WHERE (status = 'pendente'::text);
CREATE INDEX IF NOT EXISTS bot_remarketing_contato_idx ON public.bot_remarketing USING btree (contato_id);
CREATE INDEX IF NOT EXISTS bot_remarketing_conversa_idx ON public.bot_remarketing USING btree (conversa_id);
CREATE INDEX IF NOT EXISTS bot_remarketing_due_idx ON public.bot_remarketing USING btree (status, proximo_em);
CREATE UNIQUE INDEX IF NOT EXISTS bot_remarketing_opp_ativa_uk ON public.bot_remarketing USING btree (oportunidade_id) WHERE (status = ANY (ARRAY['ativo'::text, 'pausado'::text]));
CREATE INDEX IF NOT EXISTS idx_bot_roteamentos_org_dia ON public.bot_roteamentos USING btree (organizacao_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_canais_fonte ON public.canais USING btree (fonte_aquisicao_id);
CREATE INDEX IF NOT EXISTS idx_canais_org ON public.canais USING btree (organizacao_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_canais_cloud_phone_number_id ON public.canais USING btree (cloud_phone_number_id) WHERE (cloud_phone_number_id IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS uq_canais_disparo_padrao ON public.canais USING btree (organizacao_id) WHERE (disparo_padrao AND ativo);
CREATE UNIQUE INDEX IF NOT EXISTS uq_canais_instancia ON public.canais USING btree (instancia_externa) WHERE (instancia_externa IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_chr_canal_exec ON public.canal_health_runs USING btree (canal_id, executado_em DESC);
CREATE INDEX IF NOT EXISTS idx_chr_exec ON public.canal_health_runs USING btree (executado_em DESC);
CREATE INDEX IF NOT EXISTS idx_chr_org ON public.canal_health_runs USING btree (organizacao_id);
CREATE INDEX IF NOT EXISTS idx_chr_sucesso ON public.canal_health_runs USING btree (sucesso);
CREATE INDEX IF NOT EXISTS idx_canal_janela_org ON public.canal_janela USING btree (organizacao_id, ultima_entrada_em);
CREATE INDEX IF NOT EXISTS idx_ciclos_venc_org ON public.ciclos_vencimento USING btree (organizacao_id);
CREATE INDEX IF NOT EXISTS idx_cob_eventos_cobranca ON public.cobranca_eventos USING btree (cobranca_id);
CREATE INDEX IF NOT EXISTS idx_cobranca_eventos_org ON public.cobranca_eventos USING btree (organizacao_id);
CREATE INDEX IF NOT EXISTS idx_cobranca_pagamentos_org ON public.cobranca_pagamentos USING btree (organizacao_id);
CREATE INDEX IF NOT EXISTS idx_pag_cob_comp ON public.cobranca_pagamentos USING btree (cobranca_id, competencia);
CREATE INDEX IF NOT EXISTS idx_pag_competencia ON public.cobranca_pagamentos USING btree (organizacao_id, competencia);
CREATE INDEX IF NOT EXISTS idx_pagamentos_cobranca ON public.cobranca_pagamentos USING btree (cobranca_id);
CREATE INDEX IF NOT EXISTS idx_cobrancas_ciclo_venc ON public.cobrancas USING btree (ciclo_vencimento_id);
CREATE INDEX IF NOT EXISTS idx_cobrancas_contato ON public.cobrancas USING btree (contato_id);
CREATE INDEX IF NOT EXISTS idx_cobrancas_org ON public.cobrancas USING btree (organizacao_id);
CREATE INDEX IF NOT EXISTS idx_cobrancas_proxima ON public.cobrancas USING btree (proxima_cobranca);
CREATE INDEX IF NOT EXISTS idx_cobrancas_status ON public.cobrancas USING btree (status);
CREATE INDEX IF NOT EXISTS idx_contato_identidades_org ON public.contato_identidades USING btree (organizacao_id);
CREATE INDEX IF NOT EXISTS idx_identidades_chave_canonica ON public.contato_identidades USING btree (organizacao_id, tipo, chave_canonica) WHERE (chave_canonica IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_identidades_contato ON public.contato_identidades USING btree (contato_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_identidade_principal ON public.contato_identidades USING btree (contato_id) WHERE principal;
CREATE UNIQUE INDEX IF NOT EXISTS uq_identidade_valor ON public.contato_identidades USING btree (tipo, valor_normalizado) WHERE (valor_normalizado IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_contatos_chave_canonica ON public.contatos USING btree (organizacao_id, chave_canonica_telefone(telefone)) WHERE (telefone IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_contatos_cpf ON public.contatos USING btree (cpf);
CREATE INDEX IF NOT EXISTS idx_contatos_org ON public.contatos USING btree (organizacao_id);
CREATE INDEX IF NOT EXISTS idx_contatos_responsavel ON public.contatos USING btree (responsavel_id);
CREATE INDEX IF NOT EXISTS idx_contatos_telefone ON public.contatos USING btree (telefone);
CREATE INDEX IF NOT EXISTS idx_conv_ativ_conversa ON public.conversa_atividades USING btree (conversa_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_conv_ativ_org ON public.conversa_atividades USING btree (organizacao_id);
CREATE INDEX IF NOT EXISTS conversa_etiquetas_etiqueta_idx ON public.conversa_etiquetas USING btree (etiqueta_id);
CREATE INDEX IF NOT EXISTS conversa_etiquetas_org_idx ON public.conversa_etiquetas USING btree (organizacao_id);
CREATE INDEX IF NOT EXISTS cha_conversa_idx ON public.conversa_higiene_adiamentos USING btree (conversa_id, tipo, criado_em DESC);
CREATE INDEX IF NOT EXISTS cha_org_idx ON public.conversa_higiene_adiamentos USING btree (organizacao_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS conversas_canal_origem_idx ON public.conversas USING btree (canal_origem_id);
CREATE INDEX IF NOT EXISTS conversas_ultima_entrada_idx ON public.conversas USING btree (ultima_entrada_em DESC NULLS LAST);
CREATE UNIQUE INDEX IF NOT EXISTS conversas_uma_ativa_por_contato ON public.conversas USING btree (contato_id) WHERE ((status <> 'fechada'::conversa_status) AND (arquivada_em IS NULL));
CREATE INDEX IF NOT EXISTS idx_conversas_atendente ON public.conversas USING btree (atendente_id);
CREATE INDEX IF NOT EXISTS idx_conversas_ativas ON public.conversas USING btree (organizacao_id, ultima_interacao_em DESC) WHERE (arquivada_em IS NULL);
CREATE INDEX IF NOT EXISTS idx_conversas_canal ON public.conversas USING btree (canal_id);
CREATE INDEX IF NOT EXISTS idx_conversas_canal_preso ON public.conversas USING btree (canal_preso_id) WHERE (canal_preso_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_conversas_contato ON public.conversas USING btree (contato_id);
CREATE INDEX IF NOT EXISTS idx_conversas_contato_atividade ON public.conversas USING btree (contato_id, ultima_interacao_em DESC);
CREATE INDEX IF NOT EXISTS idx_conversas_org ON public.conversas USING btree (organizacao_id);
CREATE INDEX IF NOT EXISTS idx_conversas_status ON public.conversas USING btree (status);
CREATE INDEX IF NOT EXISTS idx_conversas_ultima_inter ON public.conversas USING btree (ultima_interacao_em DESC);
CREATE UNIQUE INDEX IF NOT EXISTS convites_org_email_pendente ON public.convites USING btree (organizacao_id, lower(email)) WHERE (status = 'pendente'::convite_status);
CREATE INDEX IF NOT EXISTS convites_org_idx ON public.convites USING btree (organizacao_id);
CREATE UNIQUE INDEX IF NOT EXISTS convites_request_id_uq ON public.convites USING btree (request_id) WHERE (request_id IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS etiquetas_org_nome_uniq ON public.etiquetas USING btree (organizacao_id, lower(nome));
CREATE INDEX IF NOT EXISTS ix_ficha_anterior ON public.fichas_judiciais USING btree (ficha_anterior_id);
CREATE INDEX IF NOT EXISTS ix_ficha_org_contato_criado ON public.fichas_judiciais USING btree (organizacao_id, contato_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS ix_ficha_org_opp_versao ON public.fichas_judiciais USING btree (organizacao_id, oportunidade_id, versao DESC);
CREATE INDEX IF NOT EXISTS ix_ficha_org_status ON public.fichas_judiciais USING btree (organizacao_id, status);
CREATE INDEX IF NOT EXISTS ix_ficha_responsavel ON public.fichas_judiciais USING btree (organizacao_id, responsavel_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ficha_contato_versao ON public.fichas_judiciais USING btree (contato_id, versao) WHERE (oportunidade_id IS NULL);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ficha_opp_versao ON public.fichas_judiciais USING btree (oportunidade_id, versao) WHERE (oportunidade_id IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ficha_sucessor ON public.fichas_judiciais USING btree (ficha_anterior_id) WHERE (ficha_anterior_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_fontes_aquisicao_org ON public.fontes_aquisicao USING btree (organizacao_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_fontes_org_slug ON public.fontes_aquisicao USING btree (organizacao_id, slug);
CREATE INDEX IF NOT EXISTS fc_funil_idx ON public.funil_colunas USING btree (funil_id);
CREATE INDEX IF NOT EXISTS fc_org_idx ON public.funil_colunas USING btree (organizacao_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_coluna_entrada ON public.funil_colunas USING btree (funil_id) WHERE (entrada AND (NOT arquivada));
CREATE INDEX IF NOT EXISTS funis_org_idx ON public.funis USING btree (organizacao_id);
CREATE INDEX IF NOT EXISTS ia_agentes_org_idx ON public.ia_agentes USING btree (organizacao_id);
CREATE UNIQUE INDEX IF NOT EXISTS ia_credito_episodio_aberto ON public.ia_credito_episodios USING btree (provedor) WHERE (fechado_em IS NULL);
CREATE INDEX IF NOT EXISTS ia_eventos_sessao_criado ON public.ia_eventos USING btree (sessao_id, criado_em);
CREATE INDEX IF NOT EXISTS ia_eventos_tipo_criado ON public.ia_eventos USING btree (tipo, criado_em);
CREATE INDEX IF NOT EXISTS idx_ia_eventos_conversa_criado ON public.ia_eventos USING btree (conversa_id, criado_em);
CREATE INDEX IF NOT EXISTS ia_fluxos_org_idx ON public.ia_fluxos USING btree (organizacao_id);
CREATE INDEX IF NOT EXISTS idx_ia_pausas_conversa ON public.ia_pausas USING btree (conversa_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS ia_sessoes_canal ON public.ia_sessoes USING btree (canal_id);
CREATE INDEX IF NOT EXISTS ia_sessoes_status_processar ON public.ia_sessoes USING btree (status, processar_apos);
CREATE INDEX IF NOT EXISTS inss_documentos_contato ON public.inss_documentos USING btree (contato_id, organizacao_id);
CREATE INDEX IF NOT EXISTS inss_documentos_pedido ON public.inss_documentos USING btree (pedido_id);
CREATE INDEX IF NOT EXISTS inss_pedidos_contato ON public.inss_pedidos USING btree (contato_id, organizacao_id);
CREATE INDEX IF NOT EXISTS inss_pedidos_org_status ON public.inss_pedidos USING btree (organizacao_id, status, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_integracoes_canal ON public.atd_integracoes USING btree (canal_id);
CREATE INDEX IF NOT EXISTS idx_integracoes_org ON public.atd_integracoes USING btree (organizacao_id);
CREATE INDEX IF NOT EXISTS iris_carteira_lote_idx ON public.iris_carteira USING btree (lote, estado);
CREATE INDEX IF NOT EXISTS idx_iris_eventos_conversa ON public.iris_eventos USING btree (conversa_id, tipo, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_iris_eventos_followup ON public.iris_eventos USING btree (conversa_id, criado_em DESC) WHERE (tipo ~~ 'followup\_%'::text);
CREATE INDEX IF NOT EXISTS idx_iris_eventos_guarda_critica ON public.iris_eventos USING btree (criado_em DESC) WHERE (tipo = 'guarda_critica'::text);
CREATE INDEX IF NOT EXISTS iris_fila_abertura_ordem_idx ON public.iris_fila_abertura USING btree (status, ordem);
CREATE INDEX IF NOT EXISTS idx_iris_followups_abertos ON public.iris_followups USING btree (inicio_em) WHERE (status = ANY (ARRAY['agendado'::text, 'ativo'::text]));
CREATE INDEX IF NOT EXISTS idx_iris_followups_conversa ON public.iris_followups USING btree (conversa_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_iris_followups_org ON public.iris_followups USING btree (organizacao_id, criado_em DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_iris_followups_aberto_contato ON public.iris_followups USING btree (contato_id) WHERE (status = ANY (ARRAY['candidato'::text, 'agendado'::text, 'ativo'::text]));
CREATE INDEX IF NOT EXISTS idx_iris_monitor_achados_conversa ON public.iris_monitor_achados USING btree (conversa_id, subcategoria, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_iris_monitor_achados_fila ON public.iris_monitor_achados USING btree (organizacao_id, status, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_iris_monitor_achados_org ON public.iris_monitor_achados USING btree (organizacao_id, criado_em DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_iris_monitor_achados_chave ON public.iris_monitor_achados USING btree (organizacao_id, chave) WHERE (chave IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_iris_monitor_ciclos_ok ON public.iris_monitor_ciclos USING btree (organizacao_id, fim DESC) WHERE (status = 'ok'::text);
CREATE INDEX IF NOT EXISTS idx_iris_monitor_ciclos_org ON public.iris_monitor_ciclos USING btree (organizacao_id, iniciado_em DESC);
CREATE INDEX IF NOT EXISTS idx_iris_monitor_ciclos_rodando ON public.iris_monitor_ciclos USING btree (organizacao_id) WHERE (status = 'rodando'::text);
CREATE INDEX IF NOT EXISTS idx_iris_teste_limpezas_contato ON public.iris_teste_limpezas USING btree (contato_id, limpo_em DESC);
CREATE INDEX IF NOT EXISTS idx_iris_teste_limpezas_org ON public.iris_teste_limpezas USING btree (organizacao_id, limpo_em DESC);
CREATE INDEX IF NOT EXISTS idx_ligacoes_marcadas_atendente_dia ON public.ligacoes_marcadas USING btree (atendente_id, dia);
CREATE INDEX IF NOT EXISTS idx_ligacoes_marcadas_conversa ON public.ligacoes_marcadas USING btree (conversa_id);
CREATE INDEX IF NOT EXISTS idx_ligacoes_marcadas_org_dia ON public.ligacoes_marcadas USING btree (organizacao_id, dia);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ligacoes_marcadas_aberta_contato ON public.ligacoes_marcadas USING btree (contato_id) WHERE (status = 'marcada'::text);
CREATE INDEX IF NOT EXISTS idx_mensagens_conversa ON public.mensagens USING btree (conversa_id, enviada_em DESC);
CREATE INDEX IF NOT EXISTS idx_mensagens_conversa_criado ON public.mensagens USING btree (conversa_id, criado_em DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mensagens_id_externo_unico_full ON public.mensagens USING btree (id_externo);
CREATE INDEX IF NOT EXISTS idx_mensagens_org ON public.mensagens USING btree (organizacao_id);
CREATE INDEX IF NOT EXISTS idx_mensagens_org_criado ON public.mensagens USING btree (organizacao_id, criado_em);
CREATE INDEX IF NOT EXISTS idx_mensagens_status ON public.mensagens USING btree (status);
CREATE UNIQUE INDEX IF NOT EXISTS mensagens_client_req_uniq ON public.mensagens USING btree (organizacao_id, client_request_id) WHERE (client_request_id IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS uq_mensagens_id_externo ON public.mensagens USING btree (id_externo) WHERE (id_externo IS NOT NULL);
CREATE INDEX IF NOT EXISTS mag_canal_idx ON public.mensagens_agendadas USING btree (canal_id);
CREATE INDEX IF NOT EXISTS mag_contato_executar_idx ON public.mensagens_agendadas USING btree (contato_id, executar_em);
CREATE INDEX IF NOT EXISTS mag_criador_idx ON public.mensagens_agendadas USING btree (criado_por);
CREATE INDEX IF NOT EXISTS mag_due_idx ON public.mensagens_agendadas USING btree (executar_em) WHERE (status = 'agendada'::text);
CREATE INDEX IF NOT EXISTS mag_lease_idx ON public.mensagens_agendadas USING btree (atualizado_em) WHERE (status = 'processando'::text);
CREATE INDEX IF NOT EXISTS mag_org_conv_idx ON public.mensagens_agendadas USING btree (organizacao_id, conversa_id, status);
CREATE INDEX IF NOT EXISTS mag_regua_idx ON public.mensagens_agendadas USING btree (regua_ativacao_id) WHERE (regua_ativacao_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS mag_sequencia_idx ON public.mensagens_agendadas USING btree (sequencia_id, ordem_na_sequencia) WHERE (sequencia_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS midia_melhoria_ia_contato_idx ON public.midia_melhoria_ia USING btree (contato_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS midia_melhoria_ia_org_idx ON public.midia_melhoria_ia USING btree (organizacao_id, criado_em DESC);
CREATE UNIQUE INDEX IF NOT EXISTS midia_melhoria_ia_uma_por_contato ON public.midia_melhoria_ia USING btree (contato_id) WHERE (status = ANY (ARRAY['processando'::text, 'aprovada'::text]));
CREATE INDEX IF NOT EXISTS idx_notif_nao_lidas ON public.atd_notificacoes USING btree (organizacao_id, criado_em DESC) WHERE (lida_em IS NULL);
CREATE INDEX IF NOT EXISTS idx_notif_org_criado ON public.atd_notificacoes USING btree (organizacao_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_opp_checklist_opp ON public.oportunidade_checklist USING btree (oportunidade_id);
CREATE INDEX IF NOT EXISTS idx_opp_eventos_opp ON public.oportunidade_eventos USING btree (oportunidade_id, criado_em);
CREATE INDEX IF NOT EXISTS idx_opp_eventos_org ON public.oportunidade_eventos USING btree (organizacao_id, criado_em);
CREATE INDEX IF NOT EXISTS idx_oport_contato ON public.oportunidades USING btree (contato_id);
CREATE INDEX IF NOT EXISTS idx_oport_org_criado ON public.oportunidades USING btree (organizacao_id, criado_em);
CREATE INDEX IF NOT EXISTS idx_oport_responsavel ON public.oportunidades USING btree (responsavel_id);
CREATE INDEX IF NOT EXISTS idx_oport_status ON public.oportunidades USING btree (status);
CREATE INDEX IF NOT EXISTS idx_oportunidades_org ON public.oportunidades USING btree (organizacao_id);
CREATE INDEX IF NOT EXISTS idx_opp_fechamento ON public.oportunidades USING btree (organizacao_id, status, fechado_em);
CREATE INDEX IF NOT EXISTS ix_op_org_status_cancelamento ON public.oportunidades USING btree (organizacao_id, status_cancelamento);
CREATE INDEX IF NOT EXISTS ix_op_org_status_ressarcimento ON public.oportunidades USING btree (organizacao_id, status_ressarcimento);
CREATE INDEX IF NOT EXISTS ix_op_org_tipo_beneficio ON public.oportunidades USING btree (organizacao_id, tipo_beneficio);
CREATE INDEX IF NOT EXISTS ix_op_org_tipo_servico ON public.oportunidades USING btree (organizacao_id, tipo_servico);
CREATE INDEX IF NOT EXISTS oportunidades_coluna_idx ON public.oportunidades USING btree (coluna_id);
CREATE INDEX IF NOT EXISTS oportunidades_conversa_origem_idx ON public.oportunidades USING btree (conversa_origem_id);
CREATE INDEX IF NOT EXISTS oportunidades_funil_idx ON public.oportunidades USING btree (funil_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_oport_aberta_contato_funil ON public.oportunidades USING btree (organizacao_id, contato_id, funil_id) WHERE ((status = 'em_andamento'::oportunidade_status) AND (contato_id IS NOT NULL));
CREATE INDEX IF NOT EXISTS idx_org_usr_org ON public.organizacao_usuarios USING btree (organizacao_id);
CREATE INDEX IF NOT EXISTS idx_org_usr_usr ON public.organizacao_usuarios USING btree (usuario_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_org_asaas_customer ON public.organizacoes USING btree (asaas_customer_id) WHERE (asaas_customer_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS pendencias_contato ON public.pendencias USING btree (contato_id);
CREATE INDEX IF NOT EXISTS pendencias_org_status ON public.pendencias USING btree (organizacao_id, status);
CREATE INDEX IF NOT EXISTS idx_planos_slug ON public.planos USING btree (slug);
CREATE INDEX IF NOT EXISTS idx_presenciais_contato ON public.presenciais USING btree (contato_id) WHERE (status = 'marcado'::text);
CREATE INDEX IF NOT EXISTS idx_presenciais_quando ON public.presenciais USING btree (organizacao_id, quando);
CREATE INDEX IF NOT EXISTS idx_presenciais_avisos_pend ON public.presenciais_avisos USING btree (status, id) WHERE (status = 'pendente'::text);
CREATE UNIQUE INDEX IF NOT EXISTS uq_presenciais_lembrete_dia ON public.presenciais_avisos USING btree (organizacao_id, dia) WHERE (tipo = 'lembrete'::text);
CREATE INDEX IF NOT EXISTS recados_gestor_contato_idx ON public.recados_gestor USING btree (contato_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS recados_gestor_de_idx ON public.recados_gestor USING btree (de_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS recados_gestor_org_idx ON public.recados_gestor USING btree (organizacao_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS recados_gestor_para_idx ON public.recados_gestor USING btree (para_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS recados_gestor_pendentes_idx ON public.recados_gestor USING btree (contato_id) WHERE ((respondido_em IS NULL) AND (encerrado IS NULL) AND (cliente_respondido_em IS NULL));
CREATE INDEX IF NOT EXISTS ix_ativ_due ON public.regua_ativacoes USING btree (proximo_em) WHERE (status = 'ativo'::text);
CREATE INDEX IF NOT EXISTS ix_ativ_org_status ON public.regua_ativacoes USING btree (organizacao_id, status);
CREATE INDEX IF NOT EXISTS ix_ativ_regua ON public.regua_ativacoes USING btree (regua_id);
CREATE INDEX IF NOT EXISTS ix_ativ_resp ON public.regua_ativacoes USING btree (organizacao_id, responsavel_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ativ_contato_ativa ON public.regua_ativacoes USING btree (organizacao_id, contato_id) WHERE (status = ANY (ARRAY['ativo'::text, 'pausado'::text]));
CREATE INDEX IF NOT EXISTS ix_env_ativ ON public.regua_envios USING btree (ativacao_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS ix_env_msg ON public.regua_envios USING btree (mensagem_agendada_id) WHERE (mensagem_agendada_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS ix_env_org_status ON public.regua_envios USING btree (organizacao_id, status);
CREATE INDEX IF NOT EXISTS ix_passos_regua ON public.regua_passos USING btree (regua_id, ordem);
CREATE INDEX IF NOT EXISTS ix_reguas_org_status ON public.reguas USING btree (organizacao_id, status);
CREATE INDEX IF NOT EXISTS ix_blq_org ON public.relacionamento_bloqueio USING btree (organizacao_id);
CREATE INDEX IF NOT EXISTS idx_rmkt_eventos_lead ON public.remarketing_eventos USING btree (remarketing_id, criado_em);
CREATE INDEX IF NOT EXISTS idx_rmkt_eventos_org ON public.remarketing_eventos USING btree (organizacao_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_rmkt_leads_org_ativo ON public.remarketing_leads USING btree (organizacao_id, etapa) WHERE (status = 'ativo'::text);
CREATE INDEX IF NOT EXISTS idx_rmkt_leads_resp ON public.remarketing_leads USING btree (responsavel_id) WHERE (status = 'ativo'::text);
CREATE INDEX IF NOT EXISTS idx_rmkt_leads_score ON public.remarketing_leads USING btree (organizacao_id, score DESC) WHERE (status = 'ativo'::text);
CREATE UNIQUE INDEX IF NOT EXISTS uq_rmkt_lead_ativo ON public.remarketing_leads USING btree (oportunidade_id) WHERE (status = 'ativo'::text);
CREATE INDEX IF NOT EXISTS idx_rmkt_tarefas_resp ON public.remarketing_tarefas USING btree (organizacao_id, responsavel_id) WHERE (status = 'pendente'::text);
CREATE UNIQUE INDEX IF NOT EXISTS uq_rmkt_tarefa_pendente ON public.remarketing_tarefas USING btree (remarketing_id) WHERE (status = 'pendente'::text);
CREATE INDEX IF NOT EXISTS robo_ligar_org_idx ON public.robo_ligar USING btree (organizacao_id);
CREATE INDEX IF NOT EXISTS idx_script_anexos_org ON public.script_anexos USING btree (organizacao_id);
CREATE INDEX IF NOT EXISTS idx_script_anexos_script ON public.script_anexos USING btree (script_id);
CREATE INDEX IF NOT EXISTS idx_script_categorias_org ON public.script_categorias USING btree (organizacao_id);
CREATE INDEX IF NOT EXISTS script_etapas_script_idx ON public.script_etapas USING btree (script_id, posicao);
CREATE INDEX IF NOT EXISTS script_execucoes_conv_idx ON public.script_execucoes USING btree (conversa_id);
CREATE INDEX IF NOT EXISTS script_execucoes_org_idx ON public.script_execucoes USING btree (organizacao_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_scripts_categoria ON public.scripts USING btree (categoria_id);
CREATE INDEX IF NOT EXISTS idx_scripts_org ON public.scripts USING btree (organizacao_id);
CREATE INDEX IF NOT EXISTS idx_sla_alertas_conversa_ativo ON public.sla_alertas USING btree (conversa_id) WHERE (resolvido_em IS NULL);
CREATE INDEX IF NOT EXISTS idx_sla_alertas_org_ativo ON public.sla_alertas USING btree (organizacao_id) WHERE (resolvido_em IS NULL);
CREATE INDEX IF NOT EXISTS idx_sla_alertas_resp ON public.sla_alertas USING btree (responsavel_id) WHERE (resolvido_em IS NULL);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sla_alerta_ativo ON public.sla_alertas USING btree (organizacao_id, dedup_key) WHERE (resolvido_em IS NULL);
CREATE INDEX IF NOT EXISTS vacuo_estado_org_idx ON public.vacuo_estado USING btree (organizacao_id);
CREATE INDEX IF NOT EXISTS vacuo_repasses_conv_idx ON public.vacuo_repasses USING btree (conversa_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS vacuo_repasses_opp_idx ON public.vacuo_repasses USING btree (oportunidade_id) WHERE (oportunidade_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS vacuo_repasses_org_idx ON public.vacuo_repasses USING btree (organizacao_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_wa_lid_map_org_tel ON public.wa_lid_map USING btree (organizacao_id, telefone_normalizado);
CREATE UNIQUE INDEX IF NOT EXISTS uq_wa_lid_map_org_canal_lid ON public.wa_lid_map USING btree (organizacao_id, COALESCE(canal_id, '00000000-0000-0000-0000-000000000000'::uuid), lid);
CREATE INDEX IF NOT EXISTS idx_wa_optout_org ON public.atd_wa_optout USING btree (organizacao_id, criado_em DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_wa_templates_nome_idioma ON public.wa_templates USING btree (organizacao_id, nome, idioma) WHERE ativo;
CREATE UNIQUE INDEX IF NOT EXISTS uq_wa_templates_remarketing ON public.wa_templates USING btree (organizacao_id, toque) WHERE (usar_em_remarketing AND ativo);
CREATE INDEX IF NOT EXISTS wat_org_status_idx ON public.wa_templates USING btree (organizacao_id, status) WHERE ativo;
CREATE INDEX IF NOT EXISTS idx_wwe_event ON public.whatsapp_webhook_events USING btree (event);
CREATE INDEX IF NOT EXISTS idx_wwe_msg ON public.whatsapp_webhook_events USING btree (provider_message_id);
CREATE INDEX IF NOT EXISTS idx_wwe_recebido ON public.whatsapp_webhook_events USING btree (recebido_em DESC);

-- 7. rotinas
CREATE OR REPLACE FUNCTION public._eh_admin_org(p_org uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(public.is_platform_admin() or (public.is_member(p_org) and public.papel_na_org(p_org) = 'admin'), false);
$function$;
CREATE OR REPLACE FUNCTION public._relacionamento_ativacao_gerivel(p_ativacao uuid)
 RETURNS regua_ativacoes
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare a public.regua_ativacoes;
begin
  select * into a from public.regua_ativacoes where id=p_ativacao;
  if a.id is null then raise exception 'ativacao_nao_encontrada'; end if;
  if not public._relacionamento_pode_gerir_contato(a.organizacao_id, a.contato_id) then raise exception 'sem_permissao'; end if;
  return a;
end $function$;
CREATE OR REPLACE FUNCTION public._relacionamento_pode_gerir_contato(p_org uuid, p_contato uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case
    when public.is_platform_admin() then true
    when not (public.is_member(p_org) and public.org_operacional(p_org)) then false
    when not exists (select 1 from public.contatos c where c.id = p_contato and c.organizacao_id = p_org) then false
    else public.org_papel(p_org) in ('admin','supervisor')
      or exists (select 1 from public.contatos c where c.id = p_contato and c.organizacao_id = p_org and c.responsavel_id = auth.uid())
  end;
$function$;
CREATE OR REPLACE FUNCTION public._vagas_usuarios(p_org uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'limite',    (select limite_usuarios from public.organizacao_limites where organizacao_id = p_org),
    'ativos',    (select count(*)::int from public.organizacao_usuarios where organizacao_id = p_org and status = 'ativo'),
    'pendentes', (select count(*)::int from public.convites where organizacao_id = p_org and status = 'pendente' and expira_em > now())
  );
$function$;
CREATE OR REPLACE FUNCTION public.adm_jogadores(p_org uuid, p_mes date)
 RETURNS text[]
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce(
    (select array_agg(p.vendedor) from adm_placar p
      where p.organizacao_id = p_org
        and p.mes = (select max(q.mes) from adm_placar q where q.organizacao_id = p_org and q.mes <= p_mes)),
    (select array_agg(p.vendedor) from adm_placar p
      where p.organizacao_id = p_org
        and p.mes = (select min(q.mes) from adm_placar q where q.organizacao_id = p_org)),
    (select array_agg(distinct k.vendedor) from adm_casos k
      where k.organizacao_id = p_org and k.vendedor is not null))
$function$;
CREATE OR REPLACE FUNCTION public.adm_mes_inicio(p_em timestamp with time zone)
 RETURNS date
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select (date_trunc('month', (p_em at time zone 'America/Sao_Paulo')::date - 10))::date + 10
$function$;
CREATE OR REPLACE FUNCTION public.adm_nome_chave(p_nome text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select nullif(btrim(regexp_replace(upper(translate(coalesce(p_nome,''),
    'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
    'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN')), '[^A-Z]+', ' ', 'g')), '')
$function$;
CREATE OR REPLACE FUNCTION public.adm_saiu_do_fechado(p_contato uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select exists (select 1 from adm_movimentos m
                   where m.contato_id = p_contato and m.acao in ('reabrir','arquivar'))
$function$;
CREATE OR REPLACE FUNCTION public.adm_status(p_org uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select case when not public.is_member(p_org) then null else
    jsonb_build_object('ativo', coalesce(c.ativo,false), 'ultima_leitura_em', c.ultima_leitura_em,
                       'completos', (select count(*) from adm_fechados a where a.organizacao_id = p_org),
                       'placar', exists (select 1 from adm_casos k where k.organizacao_id = p_org),
                       'assinar', coalesce(c.ativo, false) and c.pendentes_em is not null)
  end
  from (select 1) x left join adm_config c on c.organizacao_id = p_org
$function$;
CREATE OR REPLACE FUNCTION public.adm_trava_assinar()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if NEW.coluna_id is not distinct from OLD.coluna_id or auth.uid() is null then return NEW; end if;
  if coalesce(current_setting('app.fechamento_origem', true), '') = 'administrativo' then return NEW; end if;
  if not exists (select 1 from adm_config ac where ac.organizacao_id = NEW.organizacao_id
                  and ac.ativo and ac.pendentes_em is not null) then
    return NEW;
  end if;
  if exists (select 1 from funil_colunas fc where fc.id in (NEW.coluna_id, OLD.coluna_id)
              and upper(fc.nome) like 'ASSINAR%') then
    raise exception 'assinar_pelo_administrativo' using errcode = 'check_violation';
  end if;
  return NEW;
end $function$;
CREATE OR REPLACE FUNCTION public.adm_trava_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if NEW.status is distinct from OLD.status and 'ganho' in (OLD.status::text, NEW.status::text)
     and coalesce(current_setting('app.fechamento_origem', true), '') <> 'administrativo'
     and exists (select 1 from adm_config ac where ac.organizacao_id = NEW.organizacao_id and ac.ativo) then
    raise exception 'fechado_pelo_administrativo' using errcode = 'check_violation';
  end if;
  return NEW;
end $function$;
CREATE OR REPLACE FUNCTION public.adm_usuario_do_vendedor(p_org uuid, p_nome text)
 RETURNS uuid
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with m as (
    select u.id, adm_nome_chave(u.nome) as nk, ou.status
      from organizacao_usuarios ou join usuarios u on u.id = ou.usuario_id
     where ou.organizacao_id = p_org
  ), v as (select adm_nome_chave(p_nome) as nk)
  select coalesce(
    (select m.id from m, v where m.nk = v.nk order by (m.status = 'ativo') desc limit 1),
    (select (array_agg(m.id))[1] from m, v
      where split_part(m.nk, ' ', 1) = split_part(v.nk, ' ', 1)
     having count(*) = 1))
$function$;
CREATE OR REPLACE FUNCTION public.agendamentos_guarda()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_papel text;
begin
  v_papel := papel_org(new.organizacao_id);
  if v_papel = 'atendente' and new.atendente_id is distinct from old.atendente_id and new.atendente_id is distinct from auth.uid() then
    raise exception 'sem_permissao_reatribuir' using errcode='check_violation';
  end if;
  return new;
end $function$;
CREATE OR REPLACE FUNCTION public.agendamentos_log()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if tg_op = 'INSERT' then
    insert into agendamento_atividades (organizacao_id, agendamento_id, usuario_id, tipo, para)
    values (new.organizacao_id, new.id, auth.uid(), 'criado', jsonb_build_object('status', new.status, 'inicio_em', new.inicio_em, 'atendente_id', new.atendente_id));
    return new;
  end if;
  if new.status is distinct from old.status then
    insert into agendamento_atividades (organizacao_id, agendamento_id, usuario_id, tipo, de, para, motivo)
    values (new.organizacao_id, new.id, auth.uid(), 'status_alterado', jsonb_build_object('status', old.status), jsonb_build_object('status', new.status), coalesce(new.motivo_cancelamento, new.motivo_remarcacao));
  end if;
  if new.inicio_em is distinct from old.inicio_em or new.fim_em is distinct from old.fim_em then
    insert into agendamento_atividades (organizacao_id, agendamento_id, usuario_id, tipo, de, para, motivo)
    values (new.organizacao_id, new.id, auth.uid(), 'horario_alterado', jsonb_build_object('inicio_em', old.inicio_em, 'fim_em', old.fim_em), jsonb_build_object('inicio_em', new.inicio_em, 'fim_em', new.fim_em), new.motivo_remarcacao);
  end if;
  if new.atendente_id is distinct from old.atendente_id then
    insert into agendamento_atividades (organizacao_id, agendamento_id, usuario_id, tipo, de, para)
    values (new.organizacao_id, new.id, auth.uid(), 'atendente_alterado', jsonb_build_object('atendente_id', old.atendente_id), jsonb_build_object('atendente_id', new.atendente_id));
  end if;
  return new;
end $function$;
CREATE OR REPLACE FUNCTION public.agendamentos_touch()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin new.atualizado_em := now(); return new; end $function$;
CREATE OR REPLACE FUNCTION public.agendar_mensagem(p_conversa uuid, p_canal uuid, p_texto text, p_executar_em timestamp with time zone)
 RETURNS mensagens_agendadas
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$;
CREATE OR REPLACE FUNCTION public.agendar_midia(p_conversa uuid, p_canal uuid, p_tipo text, p_texto text, p_storage_path text, p_mime text, p_nome text, p_tamanho bigint, p_executar_em timestamp with time zone, p_origem_audio text DEFAULT NULL::text)
 RETURNS mensagens_agendadas
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org uuid; v_contato uuid; v_tel text; v_canal public.canais%rowtype; v_row public.mensagens_agendadas;
  v_ext text; v_max bigint;
  doc_mimes text[] := array[
    'application/pdf','application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain','text/csv','application/zip','application/x-zip-compressed'];
  doc_exts text[] := array['pdf','doc','docx','xls','xlsx','txt','csv','ppt','pptx','zip'];
begin
  if p_tipo not in ('imagem','audio','video','documento') then raise exception 'tipo_midia_invalido'; end if;
  if p_executar_em is null or p_executar_em <= now() + interval '30 seconds' then
    raise exception 'horario_invalido' using hint = 'agende para o futuro';
  end if;
  if p_texto is not null and length(p_texto) > 4096 then raise exception 'texto_muito_longo'; end if;

  select organizacao_id, contato_id into v_org, v_contato from public.conversas where id = p_conversa;
  if v_org is null then raise exception 'conversa_nao_encontrada'; end if;

  if not (is_platform_admin() or exists (
    select 1 from public.organizacao_usuarios
     where organizacao_id = v_org and usuario_id = auth.uid() and status = 'ativo'
  )) then raise exception 'sem_acesso'; end if;

  select telefone into v_tel from public.contatos where id = v_contato;
  if v_tel is null or length(regexp_replace(v_tel, '\D', '', 'g')) < 10 then raise exception 'contato_sem_telefone'; end if;

  -- ISOLAMENTO por organização: o path precisa começar por "<org>/" (mesma barreira do evolution-send).
  if p_storage_path is null or left(p_storage_path, length(v_org::text) + 1) <> (v_org::text || '/') then
    raise exception 'midia_path_invalido';
  end if;

  -- MIME/extensão por tipo
  if p_tipo = 'imagem' and coalesce(p_mime,'') not like 'image/%' then raise exception 'mime_incompativel'; end if;
  if p_tipo = 'audio'  and coalesce(p_mime,'') not like 'audio/%' then raise exception 'mime_incompativel'; end if;
  if p_tipo = 'video'  and coalesce(p_mime,'') not like 'video/%' then raise exception 'mime_incompativel'; end if;
  if p_tipo = 'documento' then
    v_ext := lower(nullif(regexp_replace(coalesce(p_nome,''), '^.*\.', ''), ''));
    if coalesce(p_mime,'') <> all(doc_mimes) and (v_ext is null or v_ext <> all(doc_exts)) then
      raise exception 'mime_incompativel';
    end if;
  end if;

  -- Tamanho: documento 25MB; imagem/áudio/vídeo 16MB.
  v_max := case when p_tipo = 'documento' then 25 * 1024 * 1024 else 16 * 1024 * 1024 end;
  if p_tamanho is not null and p_tamanho > v_max then raise exception 'arquivo_muito_grande'; end if;

  -- Canal válido NA MESMA ORG.
  select * into v_canal from public.canais where id = p_canal and organizacao_id = v_org;
  if v_canal.id is null then raise exception 'canal_invalido' using hint = 'canal de outra organização ou inexistente'; end if;
  if v_canal.ativo = false then raise exception 'canal_inativo'; end if;
  if v_canal.status_integracao::text = 'removido' then raise exception 'canal_removido'; end if;
  if v_canal.status_integracao::text <> 'conectado' then raise exception 'canal_desconectado'; end if;
  if v_canal.envio_restrito then raise exception 'canal_restrito'; end if;
  if v_canal.conflito_com is not null then raise exception 'canal_em_conflito'; end if;

  insert into public.mensagens_agendadas (
    organizacao_id, conversa_id, contato_id, canal_id, nome_canal_snapshot, telefone_canal_snapshot, criado_por,
    tipo, texto, storage_path, mime_type, nome_arquivo, tamanho_bytes, executar_em, metadados
  ) values (
    v_org, p_conversa, v_contato, p_canal, v_canal.nome_interno, v_canal.numero_conectado, auth.uid(),
    p_tipo, nullif(trim(coalesce(p_texto, '')), ''), p_storage_path, p_mime, p_nome, p_tamanho, p_executar_em,
    jsonb_build_object('responsavel_no_agendamento', (select responsavel_id from public.contatos where id = v_contato))
      || case when p_tipo = 'audio' and p_origem_audio is not null then jsonb_build_object('origem_audio', p_origem_audio) else '{}'::jsonb end
  ) returning * into v_row;
  return v_row;
end $function$;
CREATE OR REPLACE FUNCTION public.agendar_sequencia(p_conversa uuid, p_canal uuid, p_executar_em timestamp with time zone, p_itens jsonb)
 RETURNS SETOF mensagens_agendadas
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org uuid; v_contato uuid; v_tel text; v_canal public.canais%rowtype;
  v_seq uuid := gen_random_uuid();
  v_n int; v_i int := 0;
  v_item jsonb; v_tipo text; v_texto text; v_path text; v_mime text; v_nome text; v_tam bigint; v_orig text;
  v_ext text; v_max bigint;
  doc_mimes text[] := array[
    'application/pdf','application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain','text/csv','application/zip','application/x-zip-compressed'];
  doc_exts text[] := array['pdf','doc','docx','xls','xlsx','txt','csv','ppt','pptx','zip'];
begin
  if jsonb_typeof(p_itens) <> 'array' then raise exception 'sequencia_invalida'; end if;
  v_n := jsonb_array_length(p_itens);
  if v_n < 1 then raise exception 'sequencia_vazia'; end if;
  if v_n > 20 then raise exception 'sequencia_muito_longa'; end if;
  if p_executar_em is null or p_executar_em <= now() + interval '30 seconds' then
    raise exception 'horario_invalido' using hint = 'agende para o futuro';
  end if;

  select organizacao_id, contato_id into v_org, v_contato from public.conversas where id = p_conversa;
  if v_org is null then raise exception 'conversa_nao_encontrada'; end if;
  if not (is_platform_admin() or exists (
    select 1 from public.organizacao_usuarios
     where organizacao_id = v_org and usuario_id = auth.uid() and status = 'ativo'
  )) then raise exception 'sem_acesso'; end if;

  select telefone into v_tel from public.contatos where id = v_contato;
  if v_tel is null or length(regexp_replace(v_tel, '\D', '', 'g')) < 10 then raise exception 'contato_sem_telefone'; end if;

  select * into v_canal from public.canais where id = p_canal and organizacao_id = v_org;
  if v_canal.id is null then raise exception 'canal_invalido' using hint = 'canal de outra organização ou inexistente'; end if;
  if v_canal.ativo = false then raise exception 'canal_inativo'; end if;
  if v_canal.status_integracao::text = 'removido' then raise exception 'canal_removido'; end if;
  if v_canal.status_integracao::text <> 'conectado' then raise exception 'canal_desconectado'; end if;
  if v_canal.envio_restrito then raise exception 'canal_restrito'; end if;
  if v_canal.conflito_com is not null then raise exception 'canal_em_conflito'; end if;

  for v_item in select value from jsonb_array_elements(p_itens) loop
    v_tipo := v_item->>'tipo';
    v_texto := nullif(trim(coalesce(v_item->>'texto','')), '');
    v_path := v_item->>'storage_path';
    v_mime := coalesce(v_item->>'mime','');
    v_nome := v_item->>'nome';
    v_tam := nullif(v_item->>'tamanho','')::bigint;
    v_orig := v_item->>'origem_audio';

    if v_tipo not in ('texto','imagem','audio','video','documento') then raise exception 'tipo_invalido'; end if;
    if v_texto is not null and length(v_texto) > 4096 then raise exception 'texto_muito_longo'; end if;

    if v_tipo = 'texto' then
      if v_texto is null then raise exception 'texto_vazio'; end if;
    else
      -- mídia: isolamento de path + mime/tamanho por tipo (espelha agendar_midia/evolution-send)
      if v_path is null or left(v_path, length(v_org::text) + 1) <> (v_org::text || '/') then raise exception 'midia_path_invalido'; end if;
      if v_tipo = 'imagem' and v_mime not like 'image/%' then raise exception 'mime_incompativel'; end if;
      if v_tipo = 'audio'  and v_mime not like 'audio/%' then raise exception 'mime_incompativel'; end if;
      if v_tipo = 'video'  and v_mime not like 'video/%' then raise exception 'mime_incompativel'; end if;
      if v_tipo = 'documento' then
        v_ext := lower(nullif(regexp_replace(coalesce(v_nome,''), '^.*\.', ''), ''));
        if v_mime <> all(doc_mimes) and (v_ext is null or v_ext <> all(doc_exts)) then raise exception 'mime_incompativel'; end if;
      end if;
      v_max := case when v_tipo = 'documento' then 25 * 1024 * 1024 else 16 * 1024 * 1024 end;
      if v_tam is not null and v_tam > v_max then raise exception 'arquivo_muito_grande'; end if;
    end if;

    return query
    insert into public.mensagens_agendadas (
      organizacao_id, conversa_id, contato_id, canal_id, nome_canal_snapshot, telefone_canal_snapshot, criado_por,
      tipo, texto, storage_path, mime_type, nome_arquivo, tamanho_bytes,
      executar_em, sequencia_id, ordem_na_sequencia, metadados
    ) values (
      v_org, p_conversa, v_contato, p_canal, v_canal.nome_interno, v_canal.numero_conectado, auth.uid(),
      v_tipo, v_texto,
      case when v_tipo = 'texto' then null else v_path end,
      case when v_tipo = 'texto' then null else v_mime end,
      case when v_tipo = 'texto' then null else v_nome end,
      case when v_tipo = 'texto' then null else v_tam end,
      p_executar_em + (v_i * interval '1 minute'),  -- escalonamento p/ preservar ordem sob o throttle
      v_seq, v_i,
      jsonb_build_object('responsavel_no_agendamento', (select responsavel_id from public.contatos where id = v_contato))
        || case when v_tipo = 'audio' and v_orig is not null then jsonb_build_object('origem_audio', v_orig) else '{}'::jsonb end
    ) returning *;

    v_i := v_i + 1;
  end loop;
end $function$;
CREATE OR REPLACE FUNCTION public.alerta_lead_quente_assumir(p_alerta uuid, p_usuario uuid DEFAULT NULL::uuid)
 RETURNS TABLE(ok boolean, status text, assumido_por uuid, assumido_por_nome text, conversa_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_user uuid; v_org uuid; v_conversa uuid; v_contato uuid; r record;
begin
  v_user := coalesce(auth.uid(), p_usuario);
  if v_user is null then raise exception 'sem_usuario'; end if;

  select a.organizacao_id, a.conversa_id, a.contato_id into v_org, v_conversa, v_contato
    from public.alertas_lead_quente a where a.id = p_alerta;
  if v_org is null then raise exception 'alerta_invalido'; end if;
  if auth.uid() is not null and not public.is_member(v_org) then raise exception 'sem_permissao'; end if;
  perform 1 from public.organizacao_usuarios ou
    where ou.organizacao_id = v_org and ou.usuario_id = v_user and ou.status = 'ativo';
  if not found then raise exception 'usuario_inativo'; end if;

  -- claim: só leva quem encontrar o alerta AINDA pendente (primeiro ganha)
  update public.alertas_lead_quente a
     set status = 'assumido', assumido_por = v_user, assumido_em = now()
   where a.id = p_alerta and a.status = 'pendente';

  if found then
    if v_contato is not null then
      update public.contatos set responsavel_id = v_user where id = v_contato;
    end if;
    return query select true, 'assumido'::text, v_user,
      (select u.nome from public.usuarios u where u.id = v_user), v_conversa;
  else
    select a.status as st, a.assumido_por as por into r from public.alertas_lead_quente a where a.id = p_alerta;
    return query select false, r.st, r.por,
      (select u.nome from public.usuarios u where u.id = r.por), v_conversa;
  end if;
end $function$;
CREATE OR REPLACE FUNCTION public.alerta_lead_quente_dispensar(p_alerta uuid, p_usuario uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_user uuid; v_org uuid;
begin
  v_user := coalesce(auth.uid(), p_usuario);
  if v_user is null then raise exception 'sem_usuario'; end if;
  select a.organizacao_id into v_org from public.alertas_lead_quente a where a.id = p_alerta;
  if v_org is null then raise exception 'alerta_invalido'; end if;
  if auth.uid() is not null and not public.is_member(v_org) then raise exception 'sem_permissao'; end if;

  update public.alertas_lead_quente a
     set status = 'cancelado', cancelado_por = v_user, cancelado_motivo = 'dispensado', cancelado_em = now()
   where a.id = p_alerta and a.status = 'pendente';
  return found;
end $function$;
CREATE OR REPLACE FUNCTION public.alterar_status_parcela(p_parcela uuid, p_novo text, p_obs text DEFAULT NULL::text)
 RETURNS cobranca_pagamentos
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := auth.uid(); r public.cobranca_pagamentos; v_status_anterior text; ok boolean := false;
begin
  if v_uid is null then raise exception 'usuario_autenticado_obrigatorio'; end if;
  if p_novo not in ('prevista','nao_paga','cancelada') then raise exception 'status_invalido'; end if;
  select * into r from public.cobranca_pagamentos where id = p_parcela;
  if r.id is null then raise exception 'parcela_invalida'; end if;
  if not public.cobranca_gestor(r.organizacao_id) then raise exception 'sem_permissao'; end if;
  if (select status::text from public.cobrancas where id=r.cobranca_id) = 'cancelado' then raise exception 'cobranca_cancelada'; end if;
  v_status_anterior := r.status;
  ok := (v_status_anterior='prevista' and p_novo in ('nao_paga','cancelada'))
     or (v_status_anterior='nao_paga' and p_novo in ('prevista','cancelada'))
     or (v_status_anterior='paga'     and p_novo='prevista');
  if not ok then raise exception 'transicao_nao_permitida'; end if;
  update public.cobranca_pagamentos
     set status = p_novo, valor_pago = null, data_pagamento = null, observacoes = coalesce(p_obs, observacoes)
   where id = p_parcela returning * into r;
  insert into public.cobranca_eventos(organizacao_id, cobranca_id, tipo, descricao, dados, usuario_id)
    values (r.organizacao_id, r.cobranca_id, 'parcela_status', 'Parcela '||r.ciclo||': '||p_novo,
      jsonb_build_object('parcela', p_parcela, 'de', v_status_anterior, 'para', p_novo, 'obs', p_obs), v_uid);
  return r;
end $function$;
CREATE OR REPLACE FUNCTION public.antonio_passar_humano(p_conversa uuid, p_motivo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.conversas
     set precisa_humano = true, precisa_humano_motivo = p_motivo, precisa_humano_em = now()
   where id = p_conversa and not coalesce(precisa_humano, false);
end $function$;
CREATE OR REPLACE FUNCTION public.anuncio_mensagem_e_anuncio(p_conteudo text, p_metadados jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select coalesce(p_metadados ? 'formulario', false)
      or p_conteudo ilike 'Olá! Posso ter mais informações%'
      or p_conteudo ilike 'Olá! Posso saber mais informações%'
      or p_conteudo ilike 'Formulário do anúncio%'
      or p_conteudo ilike 'Quero revisar meu empréstimo%'
      or p_conteudo ilike '¡Hola! Quiero más información%'
      -- criativo novo (22-23/10): "Olá! Vi o anúncio e quero simular meu empréstimo."
      or p_conteudo ilike '%Vi o anúncio%'
$function$;
CREATE OR REPLACE FUNCTION public.assistente_papel(p_org uuid, p_ator uuid)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select case when ou.papel::text = 'admin' then 'admin' else 'membro' end
  from public.organizacao_usuarios ou
  where ou.organizacao_id = p_org and ou.usuario_id = p_ator and ou.status = 'ativo'
    and not exists (select 1 from public.usuarios u where u.id = p_ator and u.deve_trocar_senha)
  limit 1
$function$;
CREATE OR REPLACE FUNCTION public.atualizar_avatar(p_avatar_url text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'usuario_autenticado_obrigatorio'; end if;
  update public.usuarios set avatar_url = nullif(btrim(p_avatar_url), ''), atualizado_em = now() where id = uid;
end $function$;
CREATE OR REPLACE FUNCTION public.atualizar_canal_comercial(p_canal uuid, p_nome text, p_origem_tipo text, p_gestor_id uuid, p_fonte_aquisicao_id uuid, p_campanha text, p_observacao text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_org uuid; v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'usuario_autenticado_obrigatorio'; end if;
  select organizacao_id into v_org from public.canais where id = p_canal;
  if v_org is null then raise exception 'canal_invalido'; end if;
  if not coalesce(
       public.is_platform_admin()
       or (public.is_member(v_org) and public.papel_na_org(v_org) = any (array['admin','supervisor']::user_role[])),
     false) then
    raise exception 'sem_permissao';
  end if;
  if p_origem_tipo is not null and p_origem_tipo not in ('trafego','ura','organico','indicacao','campanha','parceiro','outro') then
    raise exception 'origem_tipo_invalido';
  end if;
  if p_gestor_id is not null and not exists (
      select 1 from public.organizacao_usuarios where organizacao_id = v_org and usuario_id = p_gestor_id and status = 'ativo') then
    raise exception 'gestor_invalido';
  end if;
  if p_fonte_aquisicao_id is not null and not exists (
      select 1 from public.fontes_aquisicao where id = p_fonte_aquisicao_id and organizacao_id = v_org) then
    raise exception 'fonte_invalida';
  end if;
  update public.canais set
    nome_interno = coalesce(nullif(btrim(p_nome), ''), nome_interno),
    origem_tipo = p_origem_tipo,
    gestor_id = p_gestor_id,
    fonte_aquisicao_id = p_fonte_aquisicao_id,
    campanha = nullif(btrim(p_campanha), ''),
    observacao_comercial = nullif(btrim(p_observacao), '')
  where id = p_canal;
end $function$;
CREATE OR REPLACE FUNCTION public.atualizar_organizacao(p_org uuid, p_nome text, p_nome_fantasia text, p_documento text, p_telefone text, p_email text, p_timezone text, p_moeda text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then raise exception 'usuario_autenticado_obrigatorio'; end if;
  if not coalesce(public.is_platform_admin() or (public.is_member(p_org) and public.papel_na_org(p_org) = any (array['admin','supervisor']::user_role[])), false) then
    raise exception 'sem_permissao';
  end if;
  update public.organizacoes set
    nome = coalesce(nullif(btrim(p_nome), ''), nome),
    nome_fantasia = nullif(btrim(p_nome_fantasia), ''),
    documento = nullif(btrim(p_documento), ''),
    telefone = nullif(btrim(p_telefone), ''),
    email = nullif(btrim(p_email), ''),
    timezone = coalesce(nullif(btrim(p_timezone), ''), timezone),
    moeda = coalesce(nullif(btrim(p_moeda), ''), moeda),
    atualizado_em = now()
  where id = p_org;
end $function$;
CREATE OR REPLACE FUNCTION public.atualizar_perfil(p_nome text, p_telefone text, p_cargo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'usuario_autenticado_obrigatorio'; end if;
  if length(coalesce(btrim(p_nome), '')) > 120 or length(coalesce(btrim(p_telefone), '')) > 40 or length(coalesce(btrim(p_cargo), '')) > 80 then
    raise exception 'campo_muito_longo';
  end if;
  update public.usuarios set
    nome = coalesce(nullif(btrim(p_nome), ''), nome),
    telefone = nullif(btrim(p_telefone), ''),
    cargo = nullif(btrim(p_cargo), ''),
    atualizado_em = now()
  where id = uid; -- somente o próprio usuário
end $function$;
CREATE OR REPLACE FUNCTION public.bom_dia_feriado_nome(p_dia date)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case to_char(p_dia, 'MM-DD')
    when '01-01' then 'Ano-Novo' when '04-21' then 'Tiradentes' when '05-01' then 'Dia do Trabalho'
    when '09-07' then 'Independência' when '09-20' then 'Revolução Farroupilha'
    when '10-12' then 'Nossa Senhora Aparecida' when '11-02' then 'Finados'
    when '11-15' then 'Proclamação da República' when '11-20' then 'Consciência Negra'
    when '12-25' then 'Natal'
    else case p_dia
      when date '2026-02-16' then 'Carnaval' when date '2026-02-17' then 'Carnaval'
      when date '2026-04-03' then 'Sexta-feira Santa' when date '2026-06-04' then 'Corpus Christi'
      when date '2027-02-08' then 'Carnaval' when date '2027-02-09' then 'Carnaval'
      when date '2027-03-26' then 'Sexta-feira Santa' when date '2027-05-27' then 'Corpus Christi'
      else 'feriado' end
  end
$function$;
CREATE OR REPLACE FUNCTION public.bom_dia_fora_do_atendimento(p_org uuid, p_contato uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select not exists (select 1 from public.oportunidades og
                     where og.contato_id = p_contato and og.organizacao_id = p_org and og.status = 'ganho')
     and not exists (select 1 from public.oportunidades oa
                     where oa.contato_id = p_contato and oa.organizacao_id = p_org and oa.status = 'em_andamento')
     and coalesce((select ol.status::text from public.oportunidades ol
                   where ol.contato_id = p_contato and ol.organizacao_id = p_org
                   order by ol.atualizado_em desc limit 1), '') = 'perdido'
$function$;
CREATE OR REPLACE FUNCTION public.bom_dia_modo(p_org uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select case when public.is_member(p_org) and exists (
           select 1 from public.bom_dia_gestores g where g.organizacao_id = p_org and g.usuario_id = auth.uid())
         then 'gestor' else 'vendedor' end
$function$;
CREATE OR REPLACE FUNCTION public.bom_dia_resumo(p_org uuid, p_momento text DEFAULT 'manha'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid   uuid := auth.uid();
  v_hoje  date := (now() at time zone 'America/Sao_Paulo')::date;
  v_ini   timestamptz := (v_hoje::timestamp) at time zone 'America/Sao_Paulo';        -- meia-noite de hoje
  v_ontem timestamptz := ((v_hoje - 1)::timestamp) at time zone 'America/Sao_Paulo';  -- meia-noite de ontem
  -- pós-folga (dono 30/10: "na terça… fale sobre o final de semana e o feriado"): último dia útil antes de
  -- hoje e, se houve folga no meio (sábado, domingo, feriado), a janela dos números começa no 1º dia dela
  v_util  date := public.bom_dia_ultimo_util(v_hoje);
  v_folga boolean := v_util < v_hoje - 1 and coalesce(p_momento, 'manha') <> 'tarde';
  v_ini_util timestamptz := (v_util::timestamp) at time zone 'America/Sao_Paulo';
  v_fim_util timestamptz := ((v_util + 1)::timestamp) at time zone 'America/Sao_Paulo';
  v_janela timestamptz := case when v_folga then v_fim_util
                               else ((v_hoje::timestamp) at time zone 'America/Sao_Paulo') end;
  v_fim   int;
  v_desde timestamptz;
  r       record;
begin
  if v_uid is null or not public.is_member(p_org) then
    raise exception 'sem_acesso' using errcode = 'insufficient_privilege';
  end if;

  -- ---------------------------------------------------------------- GESTOR
  -- Números do Dashboard v5 pelas MESMAS funções (dash_v5_entradas / dash_v5_fechamentos):
  -- leads = clientes distintos, sem o número interno; fechado e vendedor seguem a regra do
  -- administrativo do CAF (adm_casos, quando houver) — batem com a tela de gestão por construção.
  if exists (select 1 from public.bom_dia_gestores g where g.organizacao_id = p_org and g.usuario_id = v_uid) then
    return (
      -- ENTRADAS = a régua do Dashboard desde 30/10 ("tudo que entrou", como o Gerenciador de Anúncios):
      -- oportunidades novas (pelo número de origem) + quem já estava no sistema e voltou pela mensagem
      -- do anúncio (pelo número que recebeu). Campanha = dash_v5_trafego (rótulos do relatório em PDF).
      with ent as (
        select e.canal_origem_id as canal from public.dash_v5_entradas(p_org, v_janela, now()) e
        union all
        select a.canal_id from public.dash_v5_anuncio(p_org, v_janela, now()) a where a.ja_estava
      ),
      fec as (
        select f.tipo, f.canal_origem_id, f.credito_id
        from public.dash_v5_fechamentos(p_org, v_ini, now()) f
      ),
      -- não elegíveis na janela (hoje, ou desde o início da folga)
      ne_jan as (
        select f.canal_origem_id
        from public.dash_v5_fechamentos(p_org, v_janela, now()) f
        where f.tipo = 'ne'
      ),
      -- "melhor de ontem" = do último DIA ÚTIL (numa segunda/terça pós-feriado, o de sexta)
      fec_ontem as (
        select f.credito_id
        from public.dash_v5_fechamentos(p_org, v_ini_util, v_fim_util) f
        where f.tipo = 'ganho' and f.credito_id is not null
      ),
      vend_hoje as (select credito_id as uid, count(*) as n from fec where tipo = 'ganho' and credito_id is not null group by 1),
      vend_ontem as (select credito_id as uid, count(*) as n from fec_ontem group by 1)
      select jsonb_build_object(
        'modo', 'gestor',
        -- folga antes de hoje: { inicio, dias, fim_de_semana, feriados: [nome] } (null em dia normal)
        'pausa', case when v_folga then jsonb_build_object(
          'inicio', v_janela,
          'dias', (v_hoje - v_util - 1),
          'fim_de_semana', exists (select 1 from generate_series(v_util + 1, v_hoje - 1, interval '1 day') d
                                   where extract(isodow from d) in (6, 7)),
          'feriados', coalesce((select jsonb_agg(public.bom_dia_feriado_nome(d::date) order by d)
                                from generate_series(v_util + 1, v_hoje - 1, interval '1 day') d
                                where d::date = any (public.dash_v5s_feriados())), '[]'::jsonb)) end,
        'melhor_dia', v_util,
        'chegaram', (select count(*) from ent),
        'por_campanha', coalesce((
          select jsonb_agg(jsonb_build_object('canal', x.canal, 'n', x.n) order by x.n desc, x.canal)
          from (select public.dash_v5_trafego(ent.canal) as canal, count(*) as n from ent group by 1) x), '[]'::jsonb),
        -- comparação com ontem no MESMO horário (dono 30/10: escolheu "comparação com ontem")
        -- comparação com ontem só em dia normal (depois da folga, "ontem" foi domingo/feriado)
        'leads_ontem_mesma_hora', case when v_folga then null else
                                  (select count(*) from public.dash_v5_entradas(p_org, v_ontem, now() - interval '1 day'))
                                + (select count(*) from public.dash_v5_anuncio(p_org, v_ontem, now() - interval '1 day') a
                                   where a.ja_estava) end,
        -- trabalho da IA de vendas hoje (dono 30/10: escolheu "trabalho da IA"): conversas que a IA
        -- assumiu hoje, sem o número interno (o Dashboard não tem esse número)
        'ia_atendeu_hoje', (select count(*) from public.ia_sessoes s
                            left join public.contatos ct on ct.id = s.contato_id
                            where s.organizacao_id = p_org and s.criado_em >= v_janela
                              and not public.dash_v5_interno(ct.telefone)),
        'nao_elegiveis', (select count(*) from ne_jan),
        -- não elegíveis por campanha ("qual campanha teve mais clientes não elegíveis" — dono 30/10)
        'ne_por_campanha', coalesce((
          select jsonb_agg(jsonb_build_object('canal', x.canal, 'n', x.n) order by x.n desc, x.canal)
          from (select public.dash_v5_trafego(ne_jan.canal_origem_id) as canal, count(*) as n
                from ne_jan group by 1) x), '[]'::jsonb),
        'fechados_hoje', (select count(*) from fec where tipo = 'ganho'),
        'melhor_ontem', (select case when max(n) is null then null else jsonb_build_object(
          'n', max(n),
          'nomes', (select jsonb_agg(coalesce(nullif(split_part(btrim(u.nome), ' ', 1), ''), 'Equipe') order by u.nome)
                    from vend_ontem v join public.usuarios u on u.id = v.uid
                    where v.n = (select max(n) from vend_ontem))) end from vend_ontem),
        'melhor_hoje', (select case when max(n) is null then null else jsonb_build_object(
          'n', max(n),
          'nomes', (select jsonb_agg(coalesce(nullif(split_part(btrim(u.nome), ' ', 1), ''), 'Equipe') order by u.nome)
                    from vend_hoje v join public.usuarios u on u.id = v.uid
                    where v.n = (select max(n) from vend_hoje))) end from vend_hoje),
        'criticos', jsonb_build_object(
          -- número de ATENDIMENTO em uso (cliente escreveu nos últimos 14 dias) que caiu
          'desconectados', coalesce((
            select jsonb_agg(ca.nome_interno order by ca.nome_interno)
            from public.canais ca
            where ca.organizacao_id = p_org and ca.ativo
              and coalesce(ca.papel::text, 'atendimento') = 'atendimento'
              and coalesce(ca.status_integracao::text, '') not in ('conectado', 'removido')
              and exists (select 1 from public.conversas c
                          where c.organizacao_id = p_org and (c.canal_id = ca.id or c.ultimo_canal_id = ca.id)
                            and c.ultima_entrada_em >= now() - interval '14 days')), '[]'::jsonb),
          -- episódio aberto do ia-credito-monitor = a IA de vendas está sem crédito agora
          'ia_sem_credito', exists (select 1 from public.ia_credito_episodios e where e.fechado_em is null),
          -- cliente novo (24 h) com conversa aberta e sem dono há mais de 30 min (a distribuição leva até 20)
          'sem_dono', (select count(*) from public.contatos ct
                       where ct.organizacao_id = p_org and ct.responsavel_id is null and ct.mesclado_para is null
                         and ct.criado_em >= now() - interval '24 hours'
                         and ct.criado_em < now() - interval '30 minutes'
                         and not public.dash_v5_interno(ct.telefone)
                         and exists (select 1 from public.conversas c
                                     where c.contato_id = ct.id and c.arquivada_em is null
                                       and c.status in ('aberta', 'em_atendimento', 'pendente'))
                         and not public.bom_dia_fora_do_atendimento(p_org, ct.id))
        )
      )
    );
  end if;

  -- ---------------------------------------------------------------- VENDEDOR
  -- fim do último expediente = hora de fechar da Central de Avisos (18h) do dia útil anterior
  select coalesce(max(c.hora_fim), 18) into v_fim from public.vacuo_config c where c.organizacao_id = p_org;
  v_desde := (v_util + make_time(v_fim, 0, 0)) at time zone 'America/Sao_Paulo';

  with novos as (
    select 1
    from public.contatos ct
    where ct.organizacao_id = p_org
      and ct.responsavel_id = v_uid
      and ct.mesclado_para is null
      and ct.criado_em >= v_desde
      and not public.bom_dia_fora_do_atendimento(p_org, ct.id)
  ),
  esperando as (
    select 1
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
    -- cliente fechado que só agradeceu/confirmou não está esperando nada (mesma regra da Central)
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
      and coalesce(ct.responsavel_id, c.atendente_id) = v_uid
      and c.ultima_entrada_em >= now() - interval '14 days'
      and um.ult_in is not null
      and (um.ult_humano is null or um.ult_humano < um.ult_in)
      and pend.pri_in is not null
      and coalesce(e.etapa, '') <> 'inicio'
      and not coalesce(ia.ia_ativa, false)
      and not public.bom_dia_fora_do_atendimento(p_org, c.contato_id)
  ),
  passados as (
    select 1
    from public.conversas c
    left join public.contatos ct on ct.id = c.contato_id
    where c.organizacao_id = p_org
      and c.precisa_humano
      and c.precisa_humano_em >= now() - interval '7 days'
      and c.arquivada_em is null
      and c.status in ('aberta','em_atendimento','pendente')
      and coalesce(ct.responsavel_id, c.atendente_id) = v_uid
      and not exists (
        select 1 from public.mensagens m
        where m.conversa_id = c.id and m.direcao = 'saida'
          and coalesce(m.enviada_em, m.criado_em) > c.precisa_humano_em
          and ((m.autor_id is not null and m.tipo not in ('sistema','nota_interna'))
               or (m.autor_id is null and m.origem = 'telefone')))
      and not public.bom_dia_fora_do_atendimento(p_org, c.contato_id)
  ),
  presenciais as (
    select 1
    from public.presenciais p
    join public.contatos ct on ct.id = p.contato_id
    where p.organizacao_id = p_org and p.status = 'marcado'
      and (p.quando at time zone 'America/Sao_Paulo')::date = v_hoje
      and ct.responsavel_id = v_uid
  )
  select (select count(*) from novos)       as novos,
         (select count(*) from esperando)   as sem_resposta,
         (select count(*) from passados)    as passados,
         (select count(*) from presenciais) as presenciais
    into r;

  return jsonb_build_object(
    'modo', 'vendedor',
    'desde', v_desde,
    'pausa', case when v_folga then jsonb_build_object(
      'inicio', v_janela,
      'dias', (v_hoje - v_util - 1),
      'fim_de_semana', exists (select 1 from generate_series(v_util + 1, v_hoje - 1, interval '1 day') d
                               where extract(isodow from d) in (6, 7)),
      'feriados', coalesce((select jsonb_agg(public.bom_dia_feriado_nome(d::date) order by d)
                            from generate_series(v_util + 1, v_hoje - 1, interval '1 day') d
                            where d::date = any (public.dash_v5s_feriados())), '[]'::jsonb)) end,
    'novos', r.novos,
    'sem_resposta', r.sem_resposta,
    'passados', r.passados,
    'presenciais', r.presenciais
  );
end
$function$;
CREATE OR REPLACE FUNCTION public.bom_dia_ultimo_util(p_dia date)
 RETURNS date
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select max(d)::date
  from generate_series(p_dia - 15, p_dia - 1, interval '1 day') d
  where extract(isodow from d) between 1 and 5
    and not (d::date = any (public.dash_v5s_feriados()))
$function$;
CREATE OR REPLACE FUNCTION public.bot_avancar_etapa(p_conversa uuid, p_etapa text, p_dados jsonb DEFAULT '{}'::jsonb, p_reprompts integer DEFAULT NULL::integer, p_inbound_msg uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  update public.bot_conversa_estado set
    etapa = coalesce(p_etapa, etapa),
    dados_qualificacao = dados_qualificacao || coalesce(p_dados, '{}'::jsonb),
    reprompts = coalesce(p_reprompts, reprompts),
    ultimo_inbound_msg_id = coalesce(p_inbound_msg, ultimo_inbound_msg_id),
    ultima_atividade_em = now()
  where conversa_id = p_conversa;
end $function$;
CREATE OR REPLACE FUNCTION public.bot_pausar(p_conversa uuid, p_motivo text, p_resumo_texto text DEFAULT NULL::text, p_resumo_json jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare c record; v_etapa text;
begin
  select organizacao_id, contato_id, atendente_id into c from public.conversas where id = p_conversa;
  v_etapa := case p_motivo when 'audio' then 'pausado_audio'
                           when 'humano_assumiu' then 'pausado_humano' else null end;
  update public.bot_conversa_estado set
    pausado = true, motivo_pausa = p_motivo, etapa = coalesce(v_etapa, etapa),
    resumo = coalesce(p_resumo_json, resumo), ultima_atividade_em = now()
    where conversa_id = p_conversa;
  -- 'agendada' entra aqui: pausar mata também o resultado diferido do fluxo de vídeo.
  update public.bot_mensagens_saida set status = 'cancelada'
    where conversa_id = p_conversa and status in ('pendente','agendada');
  -- (REMOVIDO) o resumo NÃO vira mais nota_interna/mensagem na conversa.
  -- Fonte interna do resumo: bot_conversa_estado.resumo (p_resumo_json, gravado acima).

  if p_motivo = 'audio' then
    update public.conversas set precisa_humano = true, precisa_humano_motivo = 'audio_recebido_bot', precisa_humano_em = now()
      where id = p_conversa;
    perform public.sla_registrar(c.organizacao_id, 'audio_recebido_precisa_humano', 'imediato',
      p_conversa, null, c.contato_id, c.atendente_id,
      '🎧 Cliente enviou áudio durante a triagem. Atendimento humano necessário.',
      'Cliente mandou áudio; o bot pausou e pediu texto.', null);
  elsif p_motivo = 'humano_assumiu' then
    update public.conversas set precisa_humano = false, precisa_humano_motivo = null, precisa_humano_em = null
      where id = p_conversa;
  end if;

  insert into public.audit_log (usuario_id, acao, entidade, entidade_id, dados_depois, organizacao_id)
  values (null, 'bot_pausado', 'conversas', p_conversa, jsonb_build_object('motivo', p_motivo), c.organizacao_id);
end $function$;
CREATE OR REPLACE FUNCTION public.bot_remarketing_inbound(p_conversa uuid, p_texto text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_contato uuid; v_br uuid; v_opp uuid; v_funil uuid; v_optout boolean; v_col uuid; v_alvo text;
begin
  select contato_id into v_contato from public.conversas where id = p_conversa;
  if v_contato is null then return 'sem_remarketing'; end if;

  select br.id, o.id, o.funil_id into v_br, v_opp, v_funil
  from public.bot_remarketing br
  join public.oportunidades o on o.id = br.oportunidade_id
  where o.contato_id = v_contato and br.status in ('ativo','pausado')
  order by br.criado_em desc
  limit 1;
  if v_br is null then return 'sem_remarketing'; end if;

  v_optout := (
       coalesce(p_texto,'') ~* '\y(sair|parar|pare|para de|n[ãa]o quero|remover|stop)\y'
    or coalesce(p_texto,'') ~* '\y(descadastr|cancelar? inscri)'
  );

  if v_optout then
    update public.bot_remarketing set status = 'optout' where id = v_br;
    v_alvo := 'PERDIDO';
  else
    update public.bot_remarketing set status = 'respondeu' where id = v_br;
    v_alvo := 'LEAD NOVO';
  end if;

  select id into v_col from public.funil_colunas
  where funil_id = v_funil and nome = v_alvo and arquivada = false limit 1;
  if v_col is not null then
    if v_optout then
      -- coluna PERDIDA exige motivo_perda válido (trigger + check). Preserva um motivo já existente.
      update public.oportunidades
        set coluna_id = v_col, motivo_perda = coalesce(motivo_perda, 'sem_interesse')
        where id = v_opp;
    else
      update public.oportunidades set coluna_id = v_col where id = v_opp;
    end if;
  end if;

  return case when v_optout then 'optout' else 'respondeu' end;
end $function$;
CREATE OR REPLACE FUNCTION public.bot_remarketing_touch_updated()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin new.atualizado_em := now(); return new; end $function$;
CREATE OR REPLACE FUNCTION public.calcular_valor_assinatura(p_org uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with pl as (select * from public.planos where ativo order by versao desc limit 1),
       lim as (select * from public.organizacao_limites where organizacao_id = p_org),
       aj as (
         select coalesce(sum(
           case when ai.tipo in ('desconto','credito') then -abs(ai.valor_total_centavos)
                when ai.tipo = 'ajuste' then ai.valor_total_centavos
                else 0 end), 0) as delta
         from public.assinatura_itens ai
         join public.assinaturas a on a.id = ai.assinatura_id
         where a.organizacao_id = p_org
       )
  select (pl.valor_base_centavos
          + (lim.usuarios_adicionais  * pl.preco_usuario_adicional_centavos)
          + (lim.whatsapps_adicionais * pl.preco_whatsapp_adicional_centavos)
          + (lim.facebook_adicionais  * pl.preco_facebook_centavos)
          + aj.delta)::int
  from pl, lim, aj;
$function$;
CREATE OR REPLACE FUNCTION public.cancelar_agendamento(p_id uuid)
 RETURNS mensagens_agendadas
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_row public.mensagens_agendadas;
begin
  select * into v_row from public.mensagens_agendadas where id = p_id for update;
  if v_row.id is null then raise exception 'agendamento_nao_encontrado'; end if;

  if not (is_platform_admin() or exists (
    select 1 from public.organizacao_usuarios
     where organizacao_id = v_row.organizacao_id and usuario_id = auth.uid() and status = 'ativo'
  )) then raise exception 'sem_acesso'; end if;

  if v_row.status <> 'agendada' then
    raise exception 'nao_cancelavel' using hint = 'só é possível cancelar enquanto agendada';
  end if;

  update public.mensagens_agendadas
     set status = 'cancelada', cancelada_em = now(), cancelada_por = auth.uid(), atualizado_em = now()
   where id = p_id
  returning * into v_row;
  return v_row;
end $function$;
CREATE OR REPLACE FUNCTION public.cancelar_cobranca(p_cobranca uuid, p_obs text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := auth.uid(); v_org uuid; v_status text;
begin
  if v_uid is null then raise exception 'usuario_autenticado_obrigatorio'; end if;
  select organizacao_id, status::text into v_org, v_status from public.cobrancas where id = p_cobranca;
  if v_org is null then raise exception 'cobranca_invalida'; end if;
  if not public.cobranca_gestor(v_org) then raise exception 'sem_permissao'; end if;
  if v_status = 'cancelado' then raise exception 'ja_cancelada'; end if;
  if v_status = 'finalizado' then raise exception 'cobranca_finalizada'; end if;
  update public.cobrancas set status='cancelado', data_encerramento = current_date where id = p_cobranca;
  update public.cobranca_pagamentos set status='cancelada' where cobranca_id = p_cobranca and status in ('prevista','nao_paga');
  insert into public.cobranca_eventos(organizacao_id, cobranca_id, tipo, descricao, dados, usuario_id)
    values (v_org, p_cobranca, 'cobranca_cancelada', 'Cobrança cancelada', jsonb_build_object('obs', p_obs), v_uid);
end $function$;
CREATE OR REPLACE FUNCTION public.checa_limite_canais()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare lim int; usados int;
begin
  if new.ativo is distinct from true then
    return new;
  end if;
  if new.tipo = 'whatsapp' then
    select limite_whatsapps into lim from public.organizacao_limites where organizacao_id = new.organizacao_id;
    if lim is not null then
      select count(*) into usados from public.canais
        where organizacao_id = new.organizacao_id and tipo = 'whatsapp' and ativo = true and id <> new.id;
      if usados + 1 > lim then
        raise exception 'Limite de conexoes WhatsApp atingido (% de %). Contrate WhatsApp adicional.', usados + 1, lim
          using errcode = 'check_violation';
      end if;
    end if;
  elsif new.tipo = 'facebook' then
    select limite_facebook_contas into lim from public.organizacao_limites where organizacao_id = new.organizacao_id;
    if lim is not null then
      select count(*) into usados from public.canais
        where organizacao_id = new.organizacao_id and tipo = 'facebook' and ativo = true and id <> new.id;
      if usados + 1 > lim then
        raise exception 'Limite de contas Facebook atingido (% de %). Contrate conta de Facebook adicional.', usados + 1, lim
          using errcode = 'check_violation';
      end if;
    end if;
  end if;
  return new;
end $function$;
CREATE OR REPLACE FUNCTION public.checa_limite_usuarios()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare lim int; ativos int;
begin
  if new.status = 'ativo' then
    select limite_usuarios into lim from public.organizacao_limites where organizacao_id = new.organizacao_id;
    if lim is not null then
      select count(*) into ativos from public.organizacao_usuarios
        where organizacao_id = new.organizacao_id and status = 'ativo' and id <> new.id;
      if ativos + 1 > lim then
        raise exception 'Limite de usuarios ativos atingido (% de %). Contrate usuarios adicionais ou desative outro.', ativos + 1, lim
          using errcode = 'check_violation';
      end if;
    end if;
  end if;
  return new;
end $function$;
CREATE OR REPLACE FUNCTION public.cobranca_gestor(org uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.is_platform_admin() or (public.org_operacional(org) and public.papel_na_org(org) in ('admin','supervisor'));
$function$;
CREATE OR REPLACE FUNCTION public.compartilha_org(alvo uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.organizacao_usuarios a
                 join public.organizacao_usuarios b on a.organizacao_id = b.organizacao_id
                 where a.usuario_id = auth.uid() and a.status='ativo'
                   and b.usuario_id = alvo and b.status='ativo');
$function$;
CREATE OR REPLACE FUNCTION public.conversa_antonio_dono()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_mat constant uuid := '4ac197b4-9600-4756-81aa-1ac29280df09';
  v_n int;
begin
  if new.atendente_id is null or new.atendente_id = v_mat then return null; end if;
  if not public.conversa_no_antonio(new.id) then return null; end if;
  if exists (select 1 from public.contatos ct where ct.id = new.contato_id and ct.responsavel_id = v_mat) then return null; end if;
  update public.ia_sessoes s
     set status = 'pausada',
         dados = coalesce(s.dados, '{}'::jsonb) || jsonb_build_object(
           'desativado_manual', true, 'desligado_manual_em', now(), 'desligado_motivo', 'antonio_so_matheus_28out'),
         atualizado_em = now()
   where s.conversa_id = new.id and s.status = 'ativa';
  get diagnostics v_n = row_count;
  if v_n > 0 then
    perform public.antonio_passar_humano(new.id, case when old.atendente_id is null then 'antonio_robo_concluiu' else 'antonio_transferido' end);
  end if;
  return null;
end $function$;
CREATE OR REPLACE FUNCTION public.conversa_no_antonio(p_conversa uuid, p_canal_sessao uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case
    when exists (select 1 from public.conversas n where n.id = p_conversa
                  and n.criado_em >= timestamptz '2026-11-04 13:25:45+00')
      then false
    else coalesce(p_canal_sessao = 'c839e143-4aaf-4be1-ac18-a863d0804da2'::uuid, false)
      or exists (select 1 from public.conversas v where v.id = p_conversa
                  and 'c839e143-4aaf-4be1-ac18-a863d0804da2'::uuid in (v.canal_id, v.ultimo_canal_id, v.canal_preso_id))
  end
$function$;
CREATE OR REPLACE FUNCTION public.conversa_passou_humano()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_ult_env timestamptz;
begin
  -- [iris_carteira] lead entregue só à Iris não gera aviso "passado para você"
  if exists (select 1 from public.iris_carteira ic where ic.conversa_id = new.id and ic.estado <> 'saiu') then
    return null;
  end if;
  if exists (select 1 from public.avisos_passado_humano a
              where a.conversa_id = new.id and a.enviado_em is null and a.descartado_em is null) then
    return null;
  end if;
  select max(a.enviado_em) into v_ult_env from public.avisos_passado_humano a where a.conversa_id = new.id;
  if v_ult_env is not null and not exists (
       select 1 from public.mensagens m
        where m.conversa_id = new.id and m.direcao = 'saida' and m.criado_em > v_ult_env
          and ((m.autor_id is not null and m.tipo::text not in ('sistema','nota_interna')) or (m.autor_id is null and m.origem = 'telefone'))) then
    return null;
  end if;
  insert into public.avisos_passado_humano (organizacao_id, conversa_id, contato_id, motivo)
  values (new.organizacao_id, new.id, new.contato_id, new.precisa_humano_motivo);
  return null;
end $function$;
CREATE OR REPLACE FUNCTION public.cpf_valido(p text)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
declare d text; s int; r int; i int;
begin
  d := regexp_replace(coalesce(p,''),'\D','','g');
  if length(d) <> 11 or d ~ '^(\d)\1{10}$' then return false; end if;
  s:=0; for i in 1..9  loop s:=s+substr(d,i,1)::int*(11-i); end loop; r:=(s*10)%11; if r=10 then r:=0; end if;
  if r <> substr(d,10,1)::int then return false; end if;
  s:=0; for i in 1..10 loop s:=s+substr(d,i,1)::int*(12-i); end loop; r:=(s*10)%11; if r=10 then r:=0; end if;
  return r = substr(d,11,1)::int;
end $function$;
CREATE OR REPLACE FUNCTION public.criar_cobranca_com_parcelas(p_contato uuid, p_valor numeric, p_data_primeira date, p_ciclos integer DEFAULT 6, p_responsavel uuid DEFAULT NULL::uuid, p_servico text DEFAULT NULL::text, p_observacoes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_org uuid; v_id uuid; v_uid uuid := auth.uid(); i int; v_venc date; v_dia int;
begin
  if v_uid is null then raise exception 'usuario_autenticado_obrigatorio'; end if;
  select organizacao_id into v_org from public.contatos where id = p_contato;
  if v_org is null then raise exception 'contato_invalido'; end if;
  if not public.cobranca_gestor(v_org) then raise exception 'sem_permissao'; end if;
  if p_valor is null or p_valor <= 0 then raise exception 'valor_invalido'; end if;
  if p_ciclos < 1 or p_ciclos > 60 then raise exception 'ciclos_invalido'; end if;
  if p_data_primeira is null then raise exception 'data_invalida'; end if;
  v_dia := extract(day from p_data_primeira)::int;
  insert into public.cobrancas(organizacao_id, contato_id, responsavel_id, servico, valor_mensal,
      ciclos_totais, ciclos_pagos, dia_cobranca, data_inicio, proxima_cobranca, status, observacoes)
    values (v_org, p_contato, p_responsavel, p_servico, p_valor, p_ciclos, 0, v_dia,
      p_data_primeira, p_data_primeira, 'ativo', p_observacoes)
    returning id into v_id;   -- ciclos_restantes é gerada (não inserir)
  for i in 0..(p_ciclos-1) loop
    v_venc := least(
      ((date_trunc('month', p_data_primeira) + (i||' months')::interval)::date + ((v_dia-1)||' days')::interval)::date,
      (date_trunc('month', (date_trunc('month', p_data_primeira) + (i||' months')::interval)) + interval '1 month - 1 day')::date);
    insert into public.cobranca_pagamentos(organizacao_id, cobranca_id, ciclo, valor, data_prevista, status)
      values (v_org, v_id, i+1, p_valor, v_venc, 'prevista');
  end loop;
  return v_id;
end $function$;
CREATE OR REPLACE FUNCTION public.dash_v5_anuncio(p_org uuid, p_ini timestamp with time zone, p_fim timestamp with time zone)
 RETURNS TABLE(canal_id uuid, contato_id uuid, primeira timestamp with time zone, novo_aqui boolean, ja_estava boolean, origem_canal_id uuid)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with ad as (
    select coalesce(w.canal_id, cv.canal_id) as cid, cv.contato_id,
           (m.criado_em at time zone 'America/Sao_Paulo')::date as dia, min(m.criado_em) as primeira
      from public.mensagens m
      join public.conversas cv on cv.id = m.conversa_id
      left join lateral (
        select we.canal_id
          from public.whatsapp_webhook_events we
         where we.provider_message_id = m.id_externo and we.event = 'messages.upsert'
         order by we.recebido_em
         limit 1
      ) w on true
     where m.organizacao_id = p_org and m.direcao = 'entrada'
       and m.criado_em >= p_ini and m.criado_em < p_fim
       and public.anuncio_mensagem_e_anuncio(m.conteudo, m.metadados)
       and cv.contato_id is not null
     group by 1, 2, 3
  ),
  ent as (
    select distinct e.contato_id, e.canal_origem_id, (e.criado_em at time zone 'America/Sao_Paulo')::date as dia
      from public.dash_v5_entradas(p_org, p_ini, p_fim) e
     where e.contato_id is not null
  )
  select ad.cid, ad.contato_id, ad.primeira,
         exists (select 1 from ent where ent.contato_id = ad.contato_id and ent.canal_origem_id = ad.cid and ent.dia = ad.dia) as novo_aqui,
         (ct.criado_em < ad.primeira - interval '1 minute'
          and not public.dash_v5_interno(ct.telefone)
          and not exists (select 1 from ent where ent.contato_id = ad.contato_id and ent.canal_origem_id = ad.cid and ent.dia = ad.dia)) as ja_estava,
         ct.canal_origem_id
    from ad
    join public.contatos ct on ct.id = ad.contato_id
   where ad.cid is not null;
$function$;
CREATE OR REPLACE FUNCTION public.dash_v5_dados(p_org uuid, p_inicio timestamp with time zone, p_fim timestamp with time zone, p_ini_ant timestamp with time zone, p_fim_ant timestamp with time zone, p_mapa_ini timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare
  v_canais     jsonb;
  v_ne         jsonb;
  v_atendentes jsonb;
  v_mapa       jsonb;
  v_an         jsonb;   -- dash_v5_anuncio do período (pelo anúncio / já estavam no sistema)
  v_an_mapa    jsonb;   -- idem na janela do mapa (quando ela começa antes do período)
  v_kpis       jsonb;
  v_kpis_ant   jsonb;
  v_ret        integer;
  v_novas      integer;
begin
  -- JÁ ESTAVAM NO SISTEMA (dono, 30/10: "tem que mostrar o total, mesmo que essas pessoas já
  -- tenham entrado em contato conosco"): quem mandou a mensagem do anúncio para um número e já
  -- tinha falado com a CAF antes também é ENTRADA — como no Gerenciador de Anúncios e no relatório
  -- diário em PDF (a mesma régua: dash_v5_anuncio). Uma leitura por janela, guardada aqui.
  select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) into v_an
    from public.dash_v5_anuncio(p_org, p_inicio, p_fim) a;

  -- ---------------- números conectados + "Números antigos" ----------------
  with con as (
    select ca.id, ca.nome_interno, ca.numero_conectado
      from public.canais ca
     where ca.organizacao_id = p_org
       and ca.ativo
       and ca.status_integracao = 'conectado'
       and ca.tipo = 'whatsapp'
       and coalesce(ca.papel, '') <> 'notificacao'
  ),
  ent as (
    select case when e.canal_origem_id in (select id from con) then e.canal_origem_id end as k,
           count(*) as n
      from public.dash_v5_entradas(p_org, p_inicio, p_fim) e
     group by 1
  ),
  -- já estavam no sistema por número (mesmo balde: conectado ou "Números antigos"), por qual
  -- TRÁFEGO tinham entrado antes (dash_v5_trafego: os rótulos do PDF) e quantos vieram pela
  -- mensagem do anúncio
  an as (
    select case when x.canal_id in (select id from con) then x.canal_id end as k, x.*
      from jsonb_to_recordset(v_an) as x(canal_id uuid, contato_id uuid, primeira timestamptz,
                                         novo_aqui boolean, ja_estava boolean, origem_canal_id uuid)
  ),
  ret as (
    select an.k,
           count(*) filter (where an.ja_estava)                  as retornos,
           count(*) filter (where an.ja_estava or an.novo_aqui) as pelo_anuncio
      from an group by an.k
  ),
  ret_o as (
    select z.k, jsonb_agg(jsonb_build_object('nome', z.nome, 'n', z.n) order by z.n desc, z.nome) as origens
      from (select an.k, public.dash_v5_trafego(an.origem_canal_id) as nome, count(*) as n
              from an
             where an.ja_estava
             group by 1, 2) z
     group by z.k
  ),
  fe as (
    select case when x.canal_origem_id in (select id from con) then x.canal_origem_id end as k,
           x.tipo, x.motivo, x.horas
      from public.dash_v5_fechamentos(p_org, p_inicio, p_fim) x
  ),
  fk as (
    select fe.k,
           count(*) filter (where fe.tipo = 'ne')    as ne,
           count(*) filter (where fe.tipo = 'ganho') as ganhos,
           percentile_cont(0.5) within group (order by fe.horas) as med,
           avg(fe.horas)   as media,
           count(fe.horas) as n
      from fe group by fe.k
  ),
  fm as (
    select z.k, jsonb_object_agg(z.motivo, z.q) as motivos
      from (select fe.k, fe.motivo, count(*) as q from fe where fe.tipo = 'ne' group by 1, 2) z
     group by z.k
  ),
  linhas as (
    select c.id as canal_id, c.nome_interno as nome, c.numero_conectado as numero, 'conectado'::text as situacao
      from con c
    union all
    select null::uuid, 'Números antigos', null::text, 'antigo'
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'canal_id',       l.canal_id,
           'nome',           l.nome,
           'numero',         l.numero,
           'situacao',       l.situacao,
           'entradas',       coalesce(en.n, 0) + coalesce(rt.retornos, 0),
           'entradas_novas', coalesce(en.n, 0),
           'retornos',       coalesce(rt.retornos, 0),
           'retornos_origens', coalesce(ro.origens, '[]'::jsonb),
           'pelo_anuncio',   coalesce(rt.pelo_anuncio, 0),
           'ne',             coalesce(fk.ne, 0),
           'ne_motivos',     coalesce(fm.motivos, '{}'::jsonb),
           'ganhos',         coalesce(fk.ganhos, 0),
           'fech_mediana_h', round(fk.med::numeric, 3),
           'fech_media_h',   round(fk.media::numeric, 3),
           'fech_n',         coalesce(fk.n, 0))
         order by (l.situacao = 'antigo'), coalesce(en.n, 0) + coalesce(rt.retornos, 0) desc, coalesce(fk.ganhos, 0) desc, l.nome), '[]'::jsonb)
    into v_canais
    from linhas l
    left join ent en on en.k is not distinct from l.canal_id
    left join ret rt on rt.k is not distinct from l.canal_id
    left join ret_o ro on ro.k is not distinct from l.canal_id
    left join fk     on fk.k is not distinct from l.canal_id
    left join fm     on fm.k is not distinct from l.canal_id
   where l.situacao = 'conectado'
      or coalesce(en.n, 0) + coalesce(rt.retornos, 0) + coalesce(fk.ne, 0) + coalesce(fk.ganhos, 0) > 0;

  -- ---------------- não elegíveis: motivo e quem marcou ----------------
  with x as (
    select f.motivo, f.quem from public.dash_v5_fechamentos(p_org, p_inicio, p_fim) f where f.tipo = 'ne'
  )
  select jsonb_build_object(
           'total', (select count(*) from x),
           'motivos', coalesce((select jsonb_agg(jsonb_build_object('motivo', m.motivo, 'qtd', m.q) order by m.q desc, m.motivo)
                                  from (select x.motivo, count(*) as q from x group by 1) m), '[]'::jsonb),
           'quem', jsonb_build_object(
                     'ia',       (select count(*) from x where x.quem = 'ia'),
                     'regra_rs', (select count(*) from x where x.quem = 'regra_rs'),
                     'equipe',   (select count(*) from x where x.quem = 'equipe')))
    into v_ne;

  -- ---------------- atendentes ----------------
  with membros as (
    select u.id as uid, u.nome
      from public.organizacao_usuarios ou
      join public.usuarios u on u.id = ou.usuario_id
     where ou.organizacao_id = p_org and ou.status = 'ativo'
  ),
  -- recebidos: lead novo entregue pelo rodízio (1 por contato)
  rec as (
    select r.consultor_id as uid, count(distinct coalesce(r.contato_id, r.conversa_id)) as n
      from public.bot_roteamentos r
     where r.organizacao_id = p_org and r.criado_em >= p_inicio and r.criado_em < p_fim
     group by 1
  ),
  -- transferidos PARA ele (troca de dono com dono antes e depois)
  transf as (
    select (a.dados_depois->>'responsavel_id')::uuid as uid, count(distinct a.entidade_id) as n
      from public.audit_log a
     where a.organizacao_id = p_org and a.acao = 'sync_responsavel_cliente'
       and a.criado_em >= p_inicio and a.criado_em < p_fim
       and a.dados_antes->>'responsavel_id' is not null and a.dados_depois->>'responsavel_id' is not null
       and a.dados_antes->>'responsavel_id' <> a.dados_depois->>'responsavel_id'
     group by 1
  ),
  fe as (
    select * from public.dash_v5_fechamentos(p_org, p_inicio, p_fim)
  ),
  -- fechados e o tempo para fechar de cada um (relógio a partir da atribuição a ele NESTE
  -- lead: a 1ª a partir de criado_em − 5 min — o rodízio às vezes grava a atribuição
  -- segundos antes da oportunidade; a de um lead anterior do mesmo contato não conta)
  gan as (
    select g.credito_id as uid, count(*) as ganhos,
           percentile_cont(0.5) within group (order by g.h) as med,
           avg(g.h)   as media,
           count(g.h) as n
      from (
        select f.credito_id,
               case when f.horas is not null then
                 (extract(epoch from f.fechado_em - greatest(f.criado_em, coalesce(
                    (select min(a.criado_em) from public.audit_log a
                      where a.entidade = 'contatos' and a.entidade_id = f.contato_id
                        and a.acao = 'sync_responsavel_cliente'
                        and a.dados_depois->>'responsavel_id' = f.credito_id::text
                        and a.criado_em >= f.criado_em - interval '5 minutes'
                        and a.criado_em <= f.fechado_em), f.criado_em))) / 3600.0)::double precision
               end as h
          from fe f
         where f.tipo = 'ganho' and f.credito_id is not null
      ) g
     group by 1
  ),
  nem as (
    select f.fechado_por_id as uid, count(*) as n
      from fe f where f.tipo = 'ne' and f.fechado_por_id is not null
     group by 1
  ),
  -- TEMPO DE RESPOSTA (bloco auto_ag … rv do final_atendentes.sql, validado em 21/10)
  auto_ag as (
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
       -- a resposta pode vir depois do fim do período (a vez do cliente é que precisa estar
       -- dentro): período já fechado lê até 3 dias além; em andamento, até agora
       and mm.criado_em >= p_inicio - interval '1 day'
       and mm.criado_em < least(p_fim + interval '3 days', now())
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
    select coalesce(r.autor_id, case when r.origem = 'telefone' then ct.responsavel_id end) as uid, r.origem,
           (select coalesce(sum(extract(epoch from greatest(interval '0',
                      least(r.t1 at time zone 'America/Sao_Paulo', d + interval '19 hour')
                    - greatest(t.t0 at time zone 'America/Sao_Paulo', d + interval '9 hour')))) / 60, 0)
              from generate_series(date_trunc('day', t.t0 at time zone 'America/Sao_Paulo'),
                                   date_trunc('day', r.t1 at time zone 'America/Sao_Paulo'), interval '1 day') d
             where extract(isodow from d) <= 5) as min_util
      from t
      join r using (conversa_id, c)
      join public.conversas cv on cv.id = t.conversa_id
      left join public.contatos ct on ct.id = cv.contato_id
     where r.k = 'hum' and t.t0 >= p_inicio and t.t0 < p_fim
  ),
  rv as (
    select h.uid, count(*) as turnos, count(*) filter (where h.origem = 'telefone') as cel,
           percentile_cont(0.5) within group (order by h.min_util) as med,
           avg(h.min_util) as media
      from hum h where h.uid is not null
     group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'usuario_id',       mb.uid,
           'nome',             mb.nome,
           'recebidos',        coalesce(rec.n, 0),
           'transferidos',     coalesce(tr.n, 0),
           'ganhos',           coalesce(gan.ganhos, 0),
           'ne_marcados',      coalesce(nem.n, 0),
           'resp_n',           coalesce(rv.turnos, 0),
           'resp_celular_n',   coalesce(rv.cel, 0),
           'resp_mediana_min', round(rv.med::numeric, 1),
           'resp_media_min',   round(rv.media::numeric, 1),
           'fech_n',           coalesce(gan.n, 0),
           'fech_mediana_h',   round(gan.med::numeric, 3),
           'fech_media_h',     round(gan.media::numeric, 3))
         order by coalesce(rec.n, 0) desc, coalesce(gan.ganhos, 0) desc, mb.nome), '[]'::jsonb)
    into v_atendentes
    from membros mb
    left join rec          on rec.uid = mb.uid
    left join transf tr    on tr.uid  = mb.uid
    left join gan          on gan.uid = mb.uid
    left join nem          on nem.uid = mb.uid
    left join rv           on rv.uid  = mb.uid
   where coalesce(rec.n, 0) + coalesce(tr.n, 0) + coalesce(gan.ganhos, 0)
       + coalesce(nem.n, 0) + coalesce(rv.turnos, 0) > 0;

  -- ---------------- mapa dia × hora (só células com entrada) ----------------
  -- entradas novas + quem já estava no sistema (na hora da 1ª mensagem do anúncio), na janela do
  -- mapa (a do período, ou os últimos 7 dias quando o período é curto)
  if p_mapa_ini = p_inicio then
    v_an_mapa := v_an;
  else
    select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) into v_an_mapa
      from public.dash_v5_anuncio(p_org, p_mapa_ini, p_fim) a;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('dia', z.dia, 'hora', z.hora, 'entradas', z.n)
                            order by z.dia, z.hora), '[]'::jsonb)
    into v_mapa
    from (select to_char(u.t at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') as dia,
                 extract(hour from u.t at time zone 'America/Sao_Paulo')::int as hora,
                 count(*) as n
            from (select e.criado_em as t from public.dash_v5_entradas(p_org, p_mapa_ini, p_fim) e
                  union all
                  select x.primeira from jsonb_to_recordset(v_an_mapa) as x(primeira timestamptz, ja_estava boolean)
                   where x.ja_estava) u
           group by 1, 2) z;

  -- ---------------- KPIs: entradas = TUDO QUE ENTROU (dono, 30/10: "deixo tudo que entrou ao total") ----
  -- como o Gerenciador de Anúncios: cada cliente que chega por um número num dia é uma entrada (o
  -- cliente novo e quem já estava no sistema e voltou pela mensagem do anúncio; quem volta em outro
  -- dia conta de novo). = a soma da tabela por número. clientes = os clientes diferentes (régua antiga).
  v_kpis := public.dash_v5_kpis(p_org, p_inicio, p_fim);
  select count(*) into v_novas from public.dash_v5_entradas(p_org, p_inicio, p_fim);
  select count(*) into v_ret from jsonb_to_recordset(v_an) as x(ja_estava boolean) where x.ja_estava;
  v_kpis := v_kpis || jsonb_build_object('clientes', (v_kpis->>'entradas')::int, 'entradas_novas', v_novas,
                                         'retornos', v_ret, 'entradas', v_novas + v_ret);
  -- o anterior com a MESMA régua (a variação compara total com total)
  if p_ini_ant is not null and p_fim_ant is not null then
    v_kpis_ant := public.dash_v5_kpis(p_org, p_ini_ant, p_fim_ant);
    select count(*) into v_novas from public.dash_v5_entradas(p_org, p_ini_ant, p_fim_ant);
    select count(*) into v_ret from public.dash_v5_anuncio(p_org, p_ini_ant, p_fim_ant) a where a.ja_estava;
    v_kpis_ant := v_kpis_ant || jsonb_build_object('clientes', (v_kpis_ant->>'entradas')::int, 'entradas_novas', v_novas,
                                                   'retornos', v_ret, 'entradas', v_novas + v_ret);
  end if;

  return jsonb_build_object(
    'gerado_em',     now(),
    'periodo',       jsonb_build_object('inicio', p_inicio, 'fim', p_fim, 'mapa_inicio', p_mapa_ini),
    'kpis',          v_kpis,
    'kpis_anterior', v_kpis_ant,
    'canais',        v_canais,
    'ne',            v_ne,
    'atendentes',    v_atendentes,
    'mapa',          v_mapa);
end;
$function$;
CREATE OR REPLACE FUNCTION public.dash_v5_entradas(p_org uuid, p_ini timestamp with time zone, p_fim timestamp with time zone)
 RETURNS TABLE(oportunidade_id uuid, contato_id uuid, canal_origem_id uuid, criado_em timestamp with time zone)
 LANGUAGE sql
 STABLE
AS $function$
  select o.id, o.contato_id, o.canal_origem_id, o.criado_em
    from public.oportunidades o
    left join public.contatos ct on ct.id = o.contato_id
   where o.organizacao_id = p_org
     and o.criado_em >= p_ini and o.criado_em < p_fim
     and not public.dash_v5_interno(coalesce(ct.telefone, o.telefone))
$function$;
CREATE OR REPLACE FUNCTION public.dash_v5_fechamentos(p_org uuid, p_ini timestamp with time zone, p_fim timestamp with time zone)
 RETURNS TABLE(oportunidade_id uuid, contato_id uuid, canal_origem_id uuid, tipo text, motivo text, quem text, fechado_por_id uuid, credito_id uuid, criado_em timestamp with time zone, fechado_em timestamp with time zone, horas double precision)
 LANGUAGE sql
 STABLE
AS $function$
  with caf as (select exists (select 1 from public.adm_casos k where k.organizacao_id = p_org) as tem)
  select o.id, o.contato_id, o.canal_origem_id,
         case when o.status = 'ganho' then 'ganho' else 'ne' end,
         case when o.status = 'ganho' then null else coalesce(o.motivo_nao_elegivel, 'sem_categoria') end,
         case when o.status = 'ganho' then null
              when o.fechado_por_id is not null then 'equipe'
              when o.motivo_nao_elegivel = 'nao_mora_rs'
               and o.fechado_em - o.criado_em < interval '1 minute' then 'regra_rs'
              else 'ia' end,
         o.fechado_por_id,
         case when o.status = 'ganho' then coalesce(o.responsavel_no_fechamento_id, o.fechado_por_id) end,
         o.criado_em, o.fechado_em,
         case when o.status = 'ganho'
               and o.fechado_em >= o.criado_em
               and not coalesce(o.fechado_em_estimado, false)
               and o.criado_em >= timestamptz '2026-08-01 00:00-03'
              then (extract(epoch from o.fechado_em - o.criado_em) / 3600.0)::double precision end
    from public.oportunidades o
    left join public.contatos ct on ct.id = o.contato_id
    cross join caf
   where o.organizacao_id = p_org
     and o.fechado_em >= p_ini and o.fechado_em < p_fim
     and ((o.status = 'ganho' and not caf.tem)
          or (o.status = 'perdido'
              and coalesce(o.motivo_perda, '') = any (public.dashboard_motivos_descarte())))
     and not public.dash_v5_interno(coalesce(ct.telefone, o.telefone))
  union all
  -- 29/10 (dono): com os casos do CAF, "fechado" é o caso completo pela regra do pódio:
  -- data do pódio, crédito do vendedor do caso, só quem joga no mês, sem os tirados pelo
  -- gerente. O card do cliente dá o número de origem e o tempo para fechar.
  select op.id, k.contato_id, op.canal_origem_id, 'ganho', null, null, null::uuid,
         public.adm_usuario_do_vendedor(p_org, k.vendedor),
         op.criado_em, k.completo_em,
         case when op.criado_em is not null
               and k.completo_em >= op.criado_em
               and op.criado_em >= timestamptz '2026-08-01 00:00-03'
              then (extract(epoch from k.completo_em - op.criado_em) / 3600.0)::double precision end
    from public.adm_casos k
    left join lateral (
      select o.id, o.canal_origem_id, o.criado_em
        from public.oportunidades o
       where o.organizacao_id = p_org and o.contato_id = k.contato_id
       order by (o.status = 'ganho') desc, (o.criado_em <= k.completo_em) desc, o.criado_em desc
       limit 1) op on k.contato_id is not null
   where k.organizacao_id = p_org
     and k.completo_em >= p_ini and k.completo_em < p_fim
     and not k.fora_da_conta
     and k.vendedor = any (public.adm_jogadores(p_org, public.adm_mes_inicio(k.completo_em)))
$function$;
CREATE OR REPLACE FUNCTION public.dash_v5_interno(p_tel text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
AS $function$
  select regexp_replace(coalesce(p_tel, ''), '\D', '', 'g') ~ '8?1602825$'
$function$;
CREATE OR REPLACE FUNCTION public.dash_v5_kpis(p_org uuid, p_ini timestamp with time zone, p_fim timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
begin
  return (
    select jsonb_build_object(
             'entradas', (select count(distinct coalesce(e.contato_id, e.oportunidade_id))
                            from public.dash_v5_entradas(p_org, p_ini, p_fim) e),
             'ne',             f.ne,
             'ganhos',         f.ganhos,
             'fech_mediana_h', round(f.med::numeric, 3),
             'fech_media_h',   round(f.media::numeric, 3),
             'fech_n',         f.n)
      from (select count(*) filter (where x.tipo = 'ne')    as ne,
                   count(*) filter (where x.tipo = 'ganho') as ganhos,
                   percentile_cont(0.5) within group (order by x.horas) as med,  -- nulos ficam fora
                   avg(x.horas)   as media,
                   count(x.horas) as n
              from public.dash_v5_fechamentos(p_org, p_ini, p_fim) x) f
  );
end;
$function$;
CREATE OR REPLACE FUNCTION public.dash_v5_robo(p_org uuid, p_ini timestamp with time zone, p_fim timestamp with time zone, p_canais uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  -- (desempenho: só as ABERTURAS do robô varrem a janela inteira; os demais eventos vêm por
  -- conversa da coorte — lateral pelo índice (entidade, entidade_id) —, então o custo cresce com a
  -- coorte e não com o quadrado dela)
  with ab as (
    select a.entidade_id as conversa_id, min(a.criado_em) as entrou_em
      from public.audit_log a
     where a.organizacao_id = p_org and a.entidade = 'conversas'
       and a.acao in ('fluxo_emprestimo', 'fluxo_video')
       and a.criado_em >= p_ini and a.criado_em < p_fim
       and a.dados_depois->>'evento' = 'entrada_recebida' and a.dados_depois->>'decisao' = 'enviar'
       and coalesce(a.dados_depois->>'passo_atual', 'inicio') = 'inicio'
     group by 1
  ),
  entradas as (
    select ab.conversa_id, ab.entrou_em
      from ab
      join public.conversas cn on cn.id = ab.conversa_id
     -- lead novo = o sistema não o conhecia antes do período. Vale a ENTRADA NO FUNIL do card (a chegada,
     -- criado_em, pode ter sido acertada para o dia real da 1ª mensagem) e só mensagem recebida na hora:
     -- histórico importado depois (metadados.importado — quedas do número do Antônio, 31/10) não torna
     -- antigo um lead que o robô abriu no dia.
     where not exists (select 1
                         from public.oportunidades o
                        where o.contato_id = cn.contato_id
                          and coalesce(o.entrada_em, o.criado_em) < p_ini)
       and not exists (select 1
                         from public.conversas c2
                         join public.mensagens m on m.conversa_id = c2.id
                        where c2.contato_id = cn.contato_id
                          and m.direcao = 'entrada'
                          and m.criado_em < p_ini
                          and not coalesce(m.metadados ? 'importado', false))
  ),
  rot as (        -- 1ª distribuição depois da entrada (fecho ou varredor de 20 min)
    select en.conversa_id, min(r.criado_em) as rot_em
      from entradas en
      join public.bot_roteamentos r on r.conversa_id = en.conversa_id
                                  and r.criado_em >= en.entrou_em and r.criado_em < p_fim
     group by 1
  ),
  coorte as (
    select en.conversa_id, en.entrou_em, c.contato_id,
           coalesce(c.canal_origem_id, c.canal_id) as origem,
           min(ev.criado_em) filter (where ev.d->>'evento' in
               ('analise_concluida', 'beneficio_encaminhado', 'beneficio_concluido'))   as fecho_em,
           min(ev.criado_em) filter (where ev.acao in ('fluxo_emprestimo', 'fluxo_video')
                                       and ev.d->>'evento' = 'roteou_consultor')       as entregue_em,
           bool_or(ev.d->>'evento' = 'recusou')                                         as recusou,
           max(ev.d->>'motivo') filter (where ev.d->>'evento' = 'sinalizou_humano')     as escalou,
           bool_or(ev.acao = 'bot_pausado' and ev.d->>'motivo' = 'humano_assumiu'
                   and (rt.rot_em is null or ev.criado_em < rt.rot_em))                 as pausa_humano,
           bool_or(ev.acao = 'bot_pausado' and ev.d->>'motivo' = 'nao_elegivel')        as pausa_ne,
           (array_agg(ev.d->>'motivo' order by ev.criado_em desc)
              filter (where ev.acao = 'bot_runner' and ev.d->>'outcome' in ('fluxo_emprestimo', 'fluxo_video')
                        and ev.d->>'motivo' in ('aguardando_sim_nao', 'aguardando_nome', 'aguardando_cpf',
                                                'aguardando_beneficio', 'fim', 'sem_beneficio', 'recusado')))[1] as ultimo_passo
      from entradas en
      join public.conversas c on c.id = en.conversa_id
      left join rot rt on rt.conversa_id = en.conversa_id
      left join lateral (   -- eventos do robô DESTA conversa, da entrada até o fim da janela
        select a.acao, a.dados_depois as d, a.criado_em
          from public.audit_log a
         where a.entidade = 'conversas' and a.entidade_id = en.conversa_id
           and a.organizacao_id = p_org
           and a.acao in ('fluxo_emprestimo', 'fluxo_video', 'bot_runner', 'bot_pausado')
           and a.criado_em >= en.entrou_em and a.criado_em < p_fim
      ) ev on true
     group by en.conversa_id, en.entrou_em, c.contato_id, c.canal_origem_id, c.canal_id
  ),
  classif as (
    select k.origem, k.entrou_em, k.entregue_em,
           case when k.fecho_em is not null then 'terminou'
                when k.recusou              then 'recusou'
                when k.escalou is not null  then 'escalou_humano'
                when k.pausa_ne             then 'ne_no_meio'
                when k.pausa_humano         then 'atendente_assumiu'
                else 'parou_' || coalesce(k.ultimo_passo, 'abertura') end as desfecho,
           k.entregue_em is not null as entregue,
           coalesce((select bool_and(coalesce(o.status = 'perdido'
                                              and coalesce(o.motivo_perda, '') = 'nao_elegivel'
                                              and o.fechado_em < p_fim, false))
                       from public.oportunidades o
                      where o.contato_id = k.contato_id
                        and o.criado_em >= p_ini and o.criado_em < p_fim), false) as virou_ne
      from coorte k
     where p_canais is null or k.origem = any (p_canais)
  ),
  agg as (
    select k.origem, grouping(k.origem) as g,
           jsonb_build_object(
             'entraram',            count(*),
             'terminaram',          count(*) filter (where k.desfecho = 'terminou'),
             'recusaram',           count(*) filter (where k.desfecho = 'recusou'),
             'escalou_humano',      count(*) filter (where k.desfecho = 'escalou_humano'),
             'ne_no_meio',          count(*) filter (where k.desfecho = 'ne_no_meio'),
             'atendente_assumiu',   count(*) filter (where k.desfecho = 'atendente_assumiu'),
             'pararam',             count(*) filter (where k.desfecho like 'parou\_%'),
             'parou_sim_nao',       count(*) filter (where k.desfecho = 'parou_aguardando_sim_nao'),
             'parou_nome',          count(*) filter (where k.desfecho = 'parou_aguardando_nome'),
             'parou_cpf',           count(*) filter (where k.desfecho = 'parou_aguardando_cpf'),
             'parou_beneficio',     count(*) filter (where k.desfecho = 'parou_aguardando_beneficio'),
             'entregues',           count(*) filter (where k.entregue),
             'entregues_elegiveis', count(*) filter (where k.entregue and not k.virou_ne),
             'entrega_mediana_s',   round((percentile_cont(0.5) within group (order by extract(epoch from k.entregue_em - k.entrou_em))
                                             filter (where k.entregue))::numeric),
             'entrega_p90_s',       round((percentile_cont(0.9) within group (order by extract(epoch from k.entregue_em - k.entrou_em))
                                             filter (where k.entregue))::numeric)) as o
      from classif k
     group by grouping sets ((k.origem), ())
  ),
  zero as (
    select jsonb_build_object(
             'entraram', 0, 'terminaram', 0, 'recusaram', 0, 'escalou_humano', 0, 'ne_no_meio', 0,
             'atendente_assumiu', 0, 'pararam', 0, 'parou_sim_nao', 0, 'parou_nome', 0, 'parou_cpf', 0,
             'parou_beneficio', 0, 'entregues', 0, 'entregues_elegiveis', 0,
             'entrega_mediana_s', null, 'entrega_p90_s', null) as o
  )
  select jsonb_build_object(
           'total', coalesce((select a.o from agg a where a.g = 1), (select z.o from zero z)),
           'canais', case
             when p_canais is null then
               coalesce((select jsonb_object_agg(a.origem::text, a.o) from agg a where a.g = 0 and a.origem is not null), '{}'::jsonb)
             else
               coalesce((select jsonb_object_agg(x.id::text, coalesce(a.o, (select z.o from zero z)))
                           from (select distinct unnest(p_canais) as id) x
                           left join agg a on a.g = 0 and a.origem = x.id), '{}'::jsonb)
           end);
$function$;
CREATE OR REPLACE FUNCTION public.dash_v5_trafego(p_canal uuid)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
AS $function$
  select case p_canal
           when 'e85ab4e4-931e-4da9-932b-30541f9e007b' then 'Empréstimo · Diego'
           when 'e081dbd4-6181-45c1-b8b9-273a81d9e3c2' then 'Empréstimo · Diego'   -- 30/10: número novo
           when 'c3e8311c-d574-4283-9bbb-f4adcf050f02' then 'Empréstimo · Diego'
           when 'eaa0b251-1284-4fab-aebf-940bae893da9' then 'Empréstimo · Diego'
           when 'c839e143-4aaf-4be1-ac18-a863d0804da2' then 'Empréstimo · Antônio'
           when '92fc2527-e07d-4897-b71f-f06d32d0455a' then 'Empréstimo · Antônio 2.0' -- 12/11
           when 'fc80ec9e-9f8f-4dca-a3f0-e1101d73e117' then 'Juros abusivos · Andrius'
           when 'ae43fc08-36ff-49d3-8272-e4280645223a' then 'Juros abusivos · Andrius'
           else 'Outros números'
         end;
$function$;
CREATE OR REPLACE FUNCTION public.dash_v5s_feriados()
 RETURNS date[]
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
AS $function$
  select array[
    date '2026-01-01', date '2026-02-16', date '2026-02-17', date '2026-04-03', date '2026-04-21',
    date '2026-05-01', date '2026-06-04', date '2026-09-07', date '2026-09-20', date '2026-10-12',
    date '2026-11-02', date '2026-11-15', date '2026-11-20', date '2026-12-25',
    date '2027-01-01', date '2027-02-08', date '2027-02-09', date '2027-03-26', date '2027-04-21',
    date '2027-05-01', date '2027-05-27', date '2027-09-07', date '2027-09-20', date '2027-10-12',
    date '2027-11-02', date '2027-11-15', date '2027-11-20', date '2027-12-25'
  ]::date[]
$function$;
CREATE OR REPLACE FUNCTION public.dashboard_motivos_descarte()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select array['nao_elegivel']::text[];
$function$;
CREATE OR REPLACE FUNCTION public.dashboard_v5(p_inicio timestamp with time zone, p_fim timestamp with time zone, p_org uuid DEFAULT NULL::uuid, p_inicio_ant timestamp with time zone DEFAULT NULL::timestamp with time zone, p_fim_ant timestamp with time zone DEFAULT NULL::timestamp with time zone, p_mapa_inicio timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org     uuid;
  v_dur     interval;
  v_ini_ant timestamptz;
  v_fim_ant timestamptz;
  v_mapa    timestamptz;
  v_robo    jsonb;
  v_robo_c  jsonb;
begin
  if p_inicio is null or p_fim is null or p_fim <= p_inicio then
    raise exception 'periodo_invalido';
  end if;
  -- teto de segurança: o tempo de resposta lê as mensagens do período inteiro (+3 dias).
  -- Com cache frio e sem idx_mensagens_org_criado, 92 dias levaram 16,6 s (o papel
  -- authenticated tem statement_timeout de 8 s). 45 dias cobre o mês comercial com folga.
  if p_fim - p_inicio > interval '45 days' then
    raise exception 'periodo_longo';
  end if;

  -- org: a informada ou a do usuário (igual a dashboard_resumo)
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

  -- período anterior: o EXATO informado pelo front (cortado no mesmo tempo decorrido),
  -- ou o deslocamento por duração quando nada vier
  v_dur := p_fim - p_inicio;
  if p_inicio_ant is not null and p_fim_ant is not null then
    if p_fim_ant <= p_inicio_ant then raise exception 'periodo_anterior_invalido'; end if;
    v_ini_ant := p_inicio_ant; v_fim_ant := p_fim_ant;
  else
    v_ini_ant := p_inicio - v_dur; v_fim_ant := p_inicio;
  end if;

  -- início do mapa (o front pede os últimos 7 dias quando o período é curto)
  v_mapa := coalesce(p_mapa_inicio, p_inicio);
  if v_mapa >= p_fim or p_fim - v_mapa > interval '45 days' then
    raise exception 'periodo_mapa_invalido';
  end if;

  -- ROBÔ (dono, 30/10: "quanto ele tá concluindo, quanto ele tá entregando"): a MESMA régua do
  -- relatório diário em PDF (dash_v5_robo), em todo número onde o robô atendeu no período — com
  -- o nome do número, conectado ou não (um número que caiu no meio do período continua na lista)
  v_robo := public.dash_v5_robo(v_org, p_inicio, p_fim, null);
  select coalesce(jsonb_agg(x.o || jsonb_build_object(
           'canal_id', x.k::uuid,
           'nome',     coalesce(nullif(btrim(ca.nome_interno), ''), 'Sem nome'),
           'numero',   ca.numero_conectado,
           'situacao', case when ca.ativo and ca.status_integracao = 'conectado' then 'conectado' else 'antigo' end)
         order by (x.o->>'entraram')::int desc, (x.o->>'entregues')::int desc, coalesce(ca.nome_interno, '')), '[]'::jsonb)
    into v_robo_c
    from jsonb_each(v_robo -> 'canais') as x(k, o)
    left join public.canais ca on ca.id = x.k::uuid;

  return public.dash_v5_dados(v_org, p_inicio, p_fim, v_ini_ant, v_fim_ant, v_mapa)
         || jsonb_build_object('robo', jsonb_build_object('total', v_robo -> 'total', 'canais', v_robo_c));
end;
$function$;
CREATE OR REPLACE FUNCTION public.editar_agendamento(p_id uuid, p_canal uuid, p_texto text, p_executar_em timestamp with time zone)
 RETURNS mensagens_agendadas
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row   public.mensagens_agendadas;
  v_canal public.canais%rowtype;
begin
  select * into v_row from public.mensagens_agendadas where id = p_id for update;
  if v_row.id is null then raise exception 'agendamento_nao_encontrado'; end if;

  if not (is_platform_admin() or exists (
    select 1 from public.organizacao_usuarios
     where organizacao_id = v_row.organizacao_id and usuario_id = auth.uid() and status = 'ativo'
  )) then raise exception 'sem_acesso'; end if;

  if v_row.status <> 'agendada' then
    raise exception 'nao_editavel' using hint = 'só é possível editar enquanto agendada';
  end if;

  -- texto: obrigatório em 'texto'; legenda opcional em mídia.
  if v_row.tipo = 'texto' then
    if p_texto is null or length(trim(p_texto)) = 0 then raise exception 'texto_vazio'; end if;
  end if;
  if p_texto is not null and length(p_texto) > 4096 then raise exception 'texto_muito_longo'; end if;

  if p_executar_em is null or p_executar_em <= now() + interval '30 seconds' then
    raise exception 'horario_invalido' using hint = 'agende para o futuro';
  end if;

  select * into v_canal from public.canais where id = p_canal and organizacao_id = v_row.organizacao_id;
  if v_canal.id is null then raise exception 'canal_invalido' using hint = 'canal de outra organização ou inexistente'; end if;
  if v_canal.ativo = false then raise exception 'canal_inativo'; end if;
  if v_canal.status_integracao::text = 'removido' then raise exception 'canal_removido'; end if;
  if v_canal.status_integracao::text <> 'conectado' then raise exception 'canal_desconectado'; end if;
  if v_canal.envio_restrito then raise exception 'canal_restrito'; end if;
  if v_canal.conflito_com is not null then raise exception 'canal_em_conflito'; end if;

  update public.mensagens_agendadas
     set texto = case when v_row.tipo = 'texto' then p_texto else nullif(trim(coalesce(p_texto, '')), '') end,
         canal_id = p_canal,
         nome_canal_snapshot = v_canal.nome_interno,
         telefone_canal_snapshot = v_canal.numero_conectado,
         executar_em = p_executar_em,
         editada_em = now(), editada_por = auth.uid(), atualizado_em = now()
   where id = p_id
  returning * into v_row;
  return v_row;
end $function$;
CREATE OR REPLACE FUNCTION public.emprestimo_pos_fluxo_ciclo_inicio(p_contato uuid, p_agora timestamp with time zone DEFAULT now())
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select max(rl.criado_em)
    from public.retomada_atendimento_log rl
    join public.conversas cv on cv.id = rl.conversa_id
   where cv.contato_id = p_contato and rl.rota = 'fluxo_zero' and rl.decisao = 'retomada' and rl.criado_em <= p_agora
$function$;
CREATE OR REPLACE FUNCTION public.equipe_listar(p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
begin
  if not public.is_member(p_org) then raise exception 'sem_permissao'; end if;
  return jsonb_build_object(
    'membros', coalesce((
      select jsonb_agg(jsonb_build_object(
        'usuario_id', ou.usuario_id, 'nome', u.nome, 'email', u.email, 'papel', ou.papel::text,
        'status', ou.status::text, 'criado_em', ou.criado_em,
        'ultimo_acesso', (select au.last_sign_in_at from auth.users au where au.id = ou.usuario_id)
      ) order by (ou.papel = 'admin') desc, u.nome)
      from public.organizacao_usuarios ou join public.usuarios u on u.id = ou.usuario_id
      where ou.organizacao_id = p_org and ou.status in ('ativo', 'inativo')), '[]'::jsonb),
    'convites', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'email', c.email, 'nome', c.nome, 'papel', c.papel::text,
        'status', case when c.status = 'pendente' and c.expira_em < now() then 'expirado' else c.status::text end,
        'expira_em', c.expira_em, 'criado_em', c.criado_em,
        'convidado_por', (select nome from public.usuarios where id = c.convidado_por),
        'telefone', c.telefone, 'whatsapp_status', c.whatsapp_status
      ) order by c.criado_em desc)
      from public.convites c where c.organizacao_id = p_org and c.status in ('pendente', 'expirado')), '[]'::jsonb),
    'vagas', public._vagas_usuarios(p_org)
  );
end $function$;
CREATE OR REPLACE FUNCTION public.fila_iris_dono(p_contato uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce(
    (select cv.atendente_id from public.conversas cv where cv.contato_id = p_contato order by cv.ultima_interacao_em desc nulls last limit 1),
    (select ct.responsavel_id from public.contatos ct where ct.id = p_contato),
    (select o.responsavel_id from public.oportunidades o where o.contato_id = p_contato and o.status = 'em_andamento' order by o.criado_em desc limit 1));
$function$;
CREATE OR REPLACE FUNCTION public.fn_alerta_lq_fluxo_concluido()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.alertas_lead_quente (organizacao_id, conversa_id, contato_id, passo, abandonado_em, tipo)
  select cv.organizacao_id, cv.id, cv.contato_id, 'fim', now(), 'concluido'
    from public.conversas cv
   where cv.id = new.conversa_id
     and cv.status in ('aberta','em_atendimento','pendente')
  on conflict (conversa_id, tipo) do nothing;
  return new;
end $function$;
CREATE OR REPLACE FUNCTION public.fn_alerta_lq_humano_cancela()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.alertas_lead_quente
     set status = 'cancelado', cancelado_motivo = 'atendente_respondeu', cancelado_em = now()
   where conversa_id = new.conversa_id and status = 'pendente';
  return new;
end $function$;
CREATE OR REPLACE FUNCTION public.fn_alerta_lq_inbound_cancela()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.alertas_lead_quente
     set status = 'cancelado', cancelado_motivo = 'cliente_respondeu', cancelado_em = now()
   where conversa_id = new.conversa_id and status = 'pendente' and tipo = 'abandono';
  return new;
end $function$;
CREATE OR REPLACE FUNCTION public.fn_arquivar_conversa_perdido()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if exists (
    select 1 from public.oportunidades o2
    where o2.contato_id = NEW.contato_id
      and o2.organizacao_id = NEW.organizacao_id
      and o2.status = 'em_andamento'
  ) then
    return NEW;
  end if;

  update public.conversas c
     set arquivada_em = now(), arquivada_por = null
   where c.contato_id = NEW.contato_id
     and c.organizacao_id = NEW.organizacao_id
     and c.arquivada_em is null;

  return NEW;
end $function$;
CREATE OR REPLACE FUNCTION public.fn_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_org uuid; v_id uuid;
begin
  if tg_op = 'DELETE' then
    v_org := (to_jsonb(old)->>'organizacao_id')::uuid;
    v_id  := (to_jsonb(old)->>'id')::uuid;
    insert into public.audit_log(usuario_id, acao, entidade, entidade_id, dados_antes, dados_depois, organizacao_id)
      values (auth.uid(), tg_op, tg_table_name, v_id, to_jsonb(old), null, v_org);
    return old;
  else
    v_org := (to_jsonb(new)->>'organizacao_id')::uuid;
    v_id  := (to_jsonb(new)->>'id')::uuid;
    insert into public.audit_log(usuario_id, acao, entidade, entidade_id, dados_antes, dados_depois, organizacao_id)
      values (auth.uid(), tg_op, tg_table_name, v_id,
              case when tg_op='UPDATE' then to_jsonb(old) else null end,
              to_jsonb(new), v_org);
    return new;
  end if;
end $function$;
CREATE OR REPLACE FUNCTION public.fn_canal_snapshot_before_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare g text; ft text;
begin
  select nome into g from public.usuarios where id = OLD.gestor_id;
  select nome into ft from public.fontes_aquisicao where id = OLD.fonte_aquisicao_id;
  update public.contatos set
    canal_origem_snapshot = coalesce(canal_origem_snapshot, jsonb_build_object(
      'nome', OLD.nome_interno, 'numero', OLD.numero_conectado, 'tipo', OLD.origem_tipo,
      'gestor_id', OLD.gestor_id, 'gestor_nome', g, 'fonte_id', OLD.fonte_aquisicao_id, 'fonte_nome', ft,
      'campanha', OLD.campanha, 'provider', OLD.provider, 'capturado_em', now()))
  where canal_origem_id = OLD.id;
  return OLD;
end $function$;
CREATE OR REPLACE FUNCTION public.fn_checklist_stamp()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if NEW.feito and (TG_OP='INSERT' or not coalesce(OLD.feito,false)) then
    NEW.feito_em := now();
    NEW.feito_por := coalesce(NEW.feito_por, auth.uid());
  elsif not NEW.feito then
    NEW.feito_em := null; NEW.feito_por := null;
  end if;
  return NEW;
end $function$;
CREATE OR REPLACE FUNCTION public.fn_ciclo_venc_touch()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.atualizado_em := now();
  return new;
end $function$;
CREATE OR REPLACE FUNCTION public.fn_cobranca_before()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare uid uuid := auth.uid();
        v_sync boolean := coalesce(current_setting('atenvo.sync_resp', true), '0') = '1';
        v_org_contato uuid; v_opp_org uuid; v_opp_contato uuid;
begin
  -- fan-out de responsabilidade (service_role, uid null) é liberado pela flag; o resto valida normal.
  if uid is null then
    if not v_sync then raise exception 'usuario_autenticado_obrigatorio'; end if;
  elsif not public.is_platform_admin() and not exists (
      select 1 from public.organizacao_usuarios where organizacao_id=NEW.organizacao_id and usuario_id=uid and status='ativo')
    then raise exception 'usuario_nao_membro_ativo';
  end if;
  if tg_op = 'INSERT' then
    NEW.criado_por := uid;
  else
    NEW.criado_por := OLD.criado_por; NEW.atualizado_em := now();
    if NEW.organizacao_id is distinct from OLD.organizacao_id or NEW.contato_id is distinct from OLD.contato_id
      then raise exception 'vinculo_imutavel'; end if;
  end if;
  select organizacao_id into v_org_contato from public.contatos where id = NEW.contato_id;
  if v_org_contato is distinct from NEW.organizacao_id then raise exception 'contato_outra_org'; end if;
  if NEW.oportunidade_id is not null then
    select organizacao_id, contato_id into v_opp_org, v_opp_contato from public.oportunidades where id = NEW.oportunidade_id;
    if v_opp_org is distinct from NEW.organizacao_id then raise exception 'oportunidade_outra_org'; end if;
    if v_opp_contato is distinct from NEW.contato_id then raise exception 'oportunidade_contato_divergente'; end if;
  end if;
  if NEW.responsavel_id is not null and not exists (
      select 1 from public.organizacao_usuarios where organizacao_id=NEW.organizacao_id and usuario_id=NEW.responsavel_id and status='ativo')
    then raise exception 'responsavel_invalido'; end if;
  return NEW;
end $function$;
CREATE OR REPLACE FUNCTION public.fn_cobranca_pag_touch()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin NEW.atualizado_em := now(); return NEW; end $function$;
CREATE OR REPLACE FUNCTION public.fn_cobranca_recalc()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare cid uuid; pagas int; restantes int; prox date; cur text; total_nc int;
begin
  if tg_op = 'DELETE' then cid := OLD.cobranca_id; else cid := NEW.cobranca_id; end if;
  select status::text into cur from public.cobrancas where id = cid;
  if cur = 'cancelado' then return null; end if;
  select count(*) filter (where status='paga'),
         count(*) filter (where status in ('prevista','nao_paga')),
         count(*) filter (where status <> 'cancelada')
    into pagas, restantes, total_nc from public.cobranca_pagamentos where cobranca_id = cid;
  select coalesce(
    (select min(data_prevista) from public.cobranca_pagamentos where cobranca_id=cid and status='nao_paga'),
    (select min(data_prevista) from public.cobranca_pagamentos where cobranca_id=cid and status='prevista' and data_prevista < current_date),
    (select min(data_prevista) from public.cobranca_pagamentos where cobranca_id=cid and status='prevista' and data_prevista >= current_date)
  ) into prox;
  update public.cobrancas
     set ciclos_pagos = coalesce(pagas,0), proxima_cobranca = prox,
         status = (case when coalesce(total_nc,0) > 0 and coalesce(restantes,0) = 0 then 'finalizado' else 'ativo' end)::public.cobranca_status
   where id = cid;
  return null;
end $function$;
CREATE OR REPLACE FUNCTION public.fn_conversa_atribui_canal()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare k public.canais; g text; ft text;
begin
  if NEW.canal_id is null then return NEW; end if;
  select * into k from public.canais where id = NEW.canal_id;
  select nome into g from public.usuarios where id = k.gestor_id;
  select nome into ft from public.fontes_aquisicao where id = k.fonte_aquisicao_id;
  update public.contatos set
    canal_origem_id = NEW.canal_id,
    canal_origem_snapshot = jsonb_build_object(
      'nome', k.nome_interno, 'numero', k.numero_conectado, 'tipo', k.origem_tipo,
      'gestor_id', k.gestor_id, 'gestor_nome', g, 'fonte_id', k.fonte_aquisicao_id, 'fonte_nome', ft,
      'campanha', k.campanha, 'provider', k.provider, 'capturado_em', now())
  where id = NEW.contato_id and canal_origem_id is null;
  return NEW;
end $function$;
CREATE OR REPLACE FUNCTION public.fn_ddd_fora_rs(p_contato uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with raw as (
    select coalesce(
      (select ci.valor_normalizado from public.contato_identidades ci
        where ci.contato_id=p_contato and ci.tipo='whatsapp' and ci.valor_normalizado is not null
        order by ci.principal desc nulls last limit 1),
      (select ct.telefone from public.contatos ct where ct.id=p_contato)
    ) as v
  ),
  dig as (select regexp_replace(coalesce((select v from raw),''),'\D','','g') as d),
  ddd as (select case when length(d) in (12,13) and left(d,2)='55' then substr(d,3,2)
                      when length(d) in (10,11) then substr(d,1,2) else null end as ddd from dig)
  select coalesce((select ddd is not null and ddd not in ('51','53','54','55') from ddd), false);
$function$;
CREATE OR REPLACE FUNCTION public.fn_ficha_before()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare uid uuid := auth.uid();
        v_sync boolean := coalesce(current_setting('atenvo.sync_resp', true), '0') = '1';
        ant record; vconv record;
        -- carimbo da planilha (enviar-planilha): UPDATE que muda SOMENTE
        -- senha_inss / planilha_enviada_em / planilha_linha (e nada mais).
        v_carimbo boolean := false;
begin
  if tg_op = 'UPDATE' then
    v_carimbo := (to_jsonb(NEW) - 'senha_inss' - 'planilha_enviada_em' - 'planilha_linha' - 'atualizado_em' - 'atualizado_por')
               = (to_jsonb(OLD) - 'senha_inss' - 'planilha_enviada_em' - 'planilha_linha' - 'atualizado_em' - 'atualizado_por');
  end if;

  if uid is null then
    if not (v_sync or v_carimbo) then raise exception 'usuario_autenticado_obrigatorio'; end if;
  elsif not exists (select 1 from public.organizacao_usuarios
                 where organizacao_id = NEW.organizacao_id and usuario_id = uid and status = 'ativo') then
    raise exception 'usuario_nao_membro_ativo';
  end if;

  if tg_op = 'INSERT' then
    if NEW.status <> 'rascunho' then raise exception 'ficha_nasce_rascunho'; end if;
    NEW.criado_por := uid; NEW.atualizado_por := uid;
    NEW.criado_em := now(); NEW.atualizado_em := now(); NEW.finalizada_em := null;
    if NEW.ficha_anterior_id is not null then
      select * into ant from public.fichas_judiciais where id = NEW.ficha_anterior_id for update;
      if ant.id is null then raise exception 'ficha_anterior_invalida'; end if;
      if ant.organizacao_id <> NEW.organizacao_id then raise exception 'ficha_anterior_outra_org'; end if;
      if ant.contato_id is distinct from NEW.contato_id or ant.oportunidade_id is distinct from NEW.oportunidade_id
        then raise exception 'ficha_anterior_vinculo_divergente'; end if;
      if ant.status <> 'finalizada' then raise exception 'ficha_anterior_nao_finalizada'; end if;
      NEW.versao := ant.versao + 1;
    else
      NEW.versao := 1;
    end if;
  else  -- UPDATE
    if v_carimbo then
      -- so o carimbo da planilha muda: vale mesmo com a ficha finalizada e
      -- preserva finalizada_em/autor. Nada mais foi alterado (garantido acima).
      NEW.atualizado_por := coalesce(uid, OLD.atualizado_por); NEW.atualizado_em := now();
      return NEW;
    end if;
    if OLD.status = 'finalizada' then raise exception 'ficha_finalizada_imutavel'; end if;
    NEW.finalizada_em := null;  -- frontend nunca controla
    if NEW.organizacao_id is distinct from OLD.organizacao_id
       or NEW.contato_id is distinct from OLD.contato_id
       or NEW.oportunidade_id is distinct from OLD.oportunidade_id
       or NEW.conversa_id is distinct from OLD.conversa_id
       or NEW.canal_id is distinct from OLD.canal_id
       or NEW.versao is distinct from OLD.versao
       or NEW.ficha_anterior_id is distinct from OLD.ficha_anterior_id
       or NEW.criado_por is distinct from OLD.criado_por
       or NEW.criado_em is distinct from OLD.criado_em then
      raise exception 'campos_imutaveis_alterados';
    end if;
    -- no fan-out (uid null) preserva o autor original; atualizado_por é NOT NULL.
    NEW.atualizado_por := coalesce(uid, OLD.atualizado_por); NEW.atualizado_em := now();
    if NEW.status = 'finalizada' and OLD.status <> 'finalizada' then
      if NEW.responsavel_id is null then raise exception 'finalizar: gerente obrigatorio'; end if;
      if coalesce(btrim(NEW.nome),'')='' then raise exception 'finalizar: nome obrigatorio'; end if;
      if not public.cpf_valido(NEW.cpf) then raise exception 'finalizar: cpf invalido'; end if;
      if coalesce(btrim(NEW.beneficio_numero),'')='' then raise exception 'finalizar: numero do beneficio obrigatorio'; end if;
      if coalesce(btrim(NEW.especie_codigo),'')='' and coalesce(btrim(NEW.especie_descricao),'')=''
        then raise exception 'finalizar: especie obrigatoria'; end if;
      if NEW.tipo_beneficio is null then raise exception 'finalizar: tipo de beneficio obrigatorio'; end if;
      if coalesce(btrim(NEW.telefone),'')='' then raise exception 'finalizar: telefone obrigatorio'; end if;
      if NEW.data_consulta is null then raise exception 'finalizar: data da ficha obrigatoria'; end if;
      NEW.finalizada_em := now();
    end if;
  end if;

  -- responsável (gerente) deve ser membro ativo da mesma org
  if NEW.responsavel_id is not null and not exists (
       select 1 from public.organizacao_usuarios
       where organizacao_id = NEW.organizacao_id and usuario_id = NEW.responsavel_id and status = 'ativo')
    then raise exception 'responsavel_invalido'; end if;

  -- consistência: todos os vínculos pertencem ao MESMO cliente (org já garantida pela FK composta)
  if NEW.oportunidade_id is not null then
    perform 1 from public.oportunidades
      where id = NEW.oportunidade_id and organizacao_id = NEW.organizacao_id and contato_id = NEW.contato_id;
    if not found then raise exception 'oportunidade_contato_divergente'; end if;
  end if;
  if NEW.conversa_id is not null then
    select canal_id, ultimo_canal_id, contato_id into vconv
      from public.conversas where id = NEW.conversa_id and organizacao_id = NEW.organizacao_id;
    if not found or vconv.contato_id is distinct from NEW.contato_id then raise exception 'conversa_contato_divergente'; end if;
    -- canal só é validado na CRIAÇÃO: a conversa pode migrar de canal depois (canal_id da ficha é
    -- imutável) e a checagem no UPDATE deixava a ficha permanentemente ineditável (canal_conversa_divergente).
    if tg_op = 'INSERT' and NEW.canal_id is not null
       and NEW.canal_id is distinct from vconv.canal_id
       and NEW.canal_id is distinct from vconv.ultimo_canal_id then
      raise exception 'canal_conversa_divergente';
    end if;
  end if;

  -- sanitização de senha (textos) + rejeição precisa em estruturas JSONB
  NEW.texto_original := public.redige_senha(NEW.texto_original);
  NEW.texto_ficha    := public.redige_senha(NEW.texto_ficha);
  if  NEW.revisoes::text ~* '"(senha|senha_inss|senha_meu_inss|password)"[[:space:]]*:'
   or NEW.avisos::text   ~* '"(senha|senha_inss|senha_meu_inss|password)"[[:space:]]*:'
   or NEW.revisoes::text ~* 'senha[ \t]*(meu[ \t]+inss|inss|gov\.?br|gov)?[ \t]*:[ \t]*[^",}[:space:]]'
   or NEW.avisos::text   ~* 'senha[ \t]*(meu[ \t]+inss|inss|gov\.?br|gov)?[ \t]*:[ \t]*[^",}[:space:]]'
    then raise exception 'senha_em_estrutura_proibida'; end if;

  return NEW;
end $function$;
CREATE OR REPLACE FUNCTION public.fn_ia_agentes_after_del()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if old.chave_secret_id is not null then
    delete from vault.secrets where id = old.chave_secret_id;
  end if;
  return old;
end $function$;
CREATE OR REPLACE FUNCTION public.fn_ia_agentes_before_del()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.bot_canal_config
     set ia_enabled = false, atualizado_em = now()
   where ia_agente_id = old.id;
  return old;
end $function$;
CREATE OR REPLACE FUNCTION public.fn_ia_agentes_before_ins()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if coalesce(current_setting('atenvo.ia_chave', true), '') <> '1' then
    new.chave_secret_id   := null;
    new.chave_definida_em := null;
  end if;
  return new;
end $function$;
CREATE OR REPLACE FUNCTION public.fn_ia_agentes_before_upd()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if coalesce(current_setting('atenvo.ia_chave', true), '') <> '1' then
    new.chave_secret_id   := old.chave_secret_id;
    new.chave_definida_em := old.chave_definida_em;
  end if;
  new.organizacao_id := old.organizacao_id;
  new.atualizado_em  := now();
  return new;
end $function$;
CREATE OR REPLACE FUNCTION public.fn_ia_fluxos_before_del()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.bot_canal_config
     set bot_enabled = false, atualizado_em = now()
   where ia_fluxo_id = old.id;
  return old;
end $function$;
CREATE OR REPLACE FUNCTION public.fn_ia_fluxos_before_upd()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  new.organizacao_id := old.organizacao_id;
  new.atualizado_em := now();
  return new;
end $function$;
CREATE OR REPLACE FUNCTION public.fn_ia_sessao_mensagem()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_id uuid; v_status text; v_etapa text; v_dados jsonb; v_opp uuid;
  v_canal uuid; v_org uuid; v_contato uuid;
  v_ia_on boolean; v_precisa_humano boolean;
  v_opp_status text; v_fechado boolean;
  v_ad boolean;
begin
  select id, status, etapa, dados, oportunidade_id
    into v_id, v_status, v_etapa, v_dados, v_opp
    from public.ia_sessoes where conversa_id = new.conversa_id;

  if new.direcao = 'saida' then
    if v_id is not null and v_status = 'ativa'
       and new.tipo not in ('sistema','nota_interna')
       and (new.autor_id is not null or new.origem = 'telefone')
       and not public.fn_ia_sessao_mensagem_iris_ok(new.metadados) then
      update public.ia_sessoes set status = 'pausada', atualizado_em = now() where id = v_id;
      insert into public.ia_eventos (sessao_id, conversa_id, organizacao_id, tipo, detalhe)
      values (v_id, new.conversa_id, new.organizacao_id, 'pausada_humano',
              jsonb_build_object('mensagem_id', new.id, 'origem', new.origem));
    end if;
    return new;
  end if;

  if new.direcao <> 'entrada' then return new; end if;

  -- FORMULÁRIO DO ANÚNCIO (evolution-webhook v34, metadados.formulario): fica na conversa, mas NÃO
  -- acorda a IA. Não é resposta à pergunta da etapa — acordar faria a IA responder ao formulário e,
  -- com follow-up agendado, adiantaria o nudge. A IA o lê como contexto no próximo turno real.
  if new.metadados ? 'formulario' then return new; end if;

  -- veio do ANÚNCIO? (Click-to-WhatsApp grava metadados.referral). É o gate do reengajamento.
  v_ad := coalesce(new.metadados ? 'referral', false);

  -- caminho QUENTE: sessão ativa. Só vira RETORNO (requalificação firme) se esfriou (ghostou os
  -- nudges) E veio pelo anúncio; caso contrário é só o debounce normal (a IA segue atendendo).
  if v_id is not null and v_status = 'ativa' then
    if not ( v_ad
             and coalesce((v_dados->>'nudge_n')::int, 0) >= 3
             and coalesce(v_etapa,'') not in ('conclusao','retorno')
             and coalesce(v_dados->>'aguardando_humano','') = ''
             -- ALERTA LEVE (ia-sdr v3, 09/10): a equipe foi avisada (precisa_humano com motivo prometeu_colega/
             -- pediu_humano) mas a IA SEGUE atendendo. Sem esta linha, o lead que volta pelo anúncio depois dos
             -- cutucões caía na detecção de RETORNO, que sai cedo quando precisa_humano está ligado — a IA não
             -- acordava (ficava MUDA). Com o alerta leve aceso, é o debounce normal: a IA responde.
             and not exists (select 1 from public.conversas c
                              where c.id = new.conversa_id and c.precisa_humano
                                and c.precisa_humano_motivo in ('prometeu_colega','pediu_humano')) ) then
      update public.ia_sessoes
        set ultima_msg_cliente_em = now(), processar_apos = now() + make_interval(secs => public.iris_atraso_resposta_s(new.conversa_id)), atualizado_em = now()
        where id = v_id;
      return new;
    end if;
  end if;

  -- ===== detecção de RETORNO (inbound sem sessão ativa-quente) =====
  -- Sem anúncio, nada de retorno: lead que volta espontâneo (ex.: "bom dia") é do humano.
  if not v_ad then return new; end if;

  select canal_id, organizacao_id, contato_id, coalesce(precisa_humano,false)
    into v_canal, v_org, v_contato, v_precisa_humano
    from public.conversas where id = new.conversa_id;
  select coalesce(ia_enabled,false) into v_ia_on from public.bot_canal_config where canal_id = v_canal;

  if v_precisa_humano or not coalesce(v_ia_on,false) then
    return new;
  end if;

  if v_dados is not null and (v_dados->>'retorno_ts') is not null
     and (v_dados->>'retorno_ts')::timestamptz > now() - interval '20 hours' then
    return new;
  end if;

  if coalesce(v_status,'') <> 'ativa' and exists (
    select 1 from public.mensagens m
    where m.conversa_id = new.conversa_id and m.direcao = 'saida'
      and m.tipo not in ('sistema','nota_interna')
      and (m.autor_id is not null or m.origem = 'telefone')
      and m.criado_em > now() - interval '2 hours'
  ) then
    return new;
  end if;

  if v_opp is not null then
    select status into v_opp_status from public.oportunidades where id = v_opp;
  else
    select status into v_opp_status from public.oportunidades
      where organizacao_id = v_org and contato_id = v_contato
      order by criado_em desc limit 1;
  end if;
  v_fechado := coalesce(v_opp_status,'') in ('ganho','perdido','cancelado');

  if not ( v_fechado or coalesce(v_status,'') = 'ativa' ) then
    return new;
  end if;

  if v_id is not null then
    update public.ia_sessoes set
      status = 'ativa', etapa = 'retorno',
      dados = coalesce(dados,'{}'::jsonb) || jsonb_build_object(
        'retorno', true, 'retorno_fechado', v_fechado,
        'retorno_opp_status', coalesce(v_opp_status,'sem_opp'),
        'retorno_de_status', v_status, 'retorno_de_etapa', coalesce(v_etapa,''),
        'retorno_via_anuncio', true,
        'nudge_n', 0, 'abertura_enviada', false, 'aguardando_humano', null,
        'retomada', false, 'transicao_pendente', false, 'teve_inbound', true),
      processar_apos = now() + make_interval(secs => public.iris_atraso_resposta_s(new.conversa_id)), ultima_msg_cliente_em = now(), atualizado_em = now()
    where id = v_id;
    insert into public.ia_eventos (sessao_id, conversa_id, organizacao_id, tipo, detalhe)
    values (v_id, new.conversa_id, new.organizacao_id, 'retorno_detectado',
            jsonb_build_object('fechado', v_fechado, 'opp_status', v_opp_status, 'de_status', v_status, 'via_anuncio', true));
  else
    insert into public.ia_sessoes (organizacao_id, canal_id, conversa_id, contato_id, oportunidade_id, etapa, status, dados, processar_apos, ultima_msg_cliente_em)
    values (v_org, v_canal, new.conversa_id, v_contato,
      (select id from public.oportunidades where organizacao_id = v_org and contato_id = v_contato order by criado_em desc limit 1),
      'retorno', 'ativa',
      jsonb_build_object('retorno', true, 'retorno_fechado', true,
        'retorno_opp_status', coalesce(v_opp_status,'sem_opp'), 'retorno_de_status', 'sem_sessao',
        'retorno_via_anuncio', true,
        'nudge_n', 0, 'abertura_enviada', false),
      now() + make_interval(secs => public.iris_atraso_resposta_s(new.conversa_id)), now())
    returning id into v_id;
    insert into public.ia_eventos (sessao_id, conversa_id, organizacao_id, tipo, detalhe)
    values (v_id, new.conversa_id, new.organizacao_id, 'retorno_detectado',
            jsonb_build_object('fechado', true, 'opp_status', v_opp_status, 'de_status', 'sem_sessao', 'via_anuncio', true));
  end if;

  return new;
end
$function$;
CREATE OR REPLACE FUNCTION public.fn_ia_sessao_mensagem_iris_ok(p_meta jsonb)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce(p_meta->>'agendamento_id','') <> '' and exists (
    select 1 from public.mensagens_agendadas a
    where a.id::text = p_meta->>'agendamento_id' and a.metadados->>'autor' = 'iris');
$function$;
CREATE OR REPLACE FUNCTION public.fn_inss_pedido_before()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.atualizado_em := now();
  if new.status in ('pronto','falhou','cancelado') and new.status is distinct from old.status then
    new.finalizado_em := coalesce(new.finalizado_em, now());
  end if;
  return new;
end $function$;
CREATE OR REPLACE FUNCTION public.fn_opp_move_qualificado()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_opp uuid; v_funil uuid; v_org uuid; v_contato uuid;
        v_col_qual uuid; v_col_entrada uuid;
begin
  if NEW.etapa is distinct from 'concluido' then return NEW; end if;
  if TG_OP='UPDATE' and OLD.etapa is not distinct from 'concluido' then return NEW; end if;

  v_opp := NEW.oportunidade_id;
  if v_opp is null and NEW.conversa_id is not null then
    select contato_id, organizacao_id into v_contato, v_org
      from public.conversas where id = NEW.conversa_id;
    if v_contato is not null then
      select id into v_opp from public.oportunidades
        where organizacao_id=v_org and contato_id=v_contato and status='em_andamento'
        order by criado_em desc limit 1;
    end if;
  end if;
  if v_opp is null then return NEW; end if;

  select funil_id into v_funil from public.oportunidades where id=v_opp;
  select id into v_col_qual from public.funil_colunas
    where funil_id=v_funil and papel='qualificado' and not arquivada limit 1;
  select id into v_col_entrada from public.funil_colunas
    where funil_id=v_funil and entrada and not arquivada limit 1;
  if v_col_qual is null then return NEW; end if;

  update public.oportunidades set coluna_id = v_col_qual
    where id=v_opp and status='em_andamento' and coluna_id = v_col_entrada;
  return NEW;
end $function$;
CREATE OR REPLACE FUNCTION public.fn_protege_coluna_entrada()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'DELETE' then
    if OLD.entrada then raise exception 'coluna_entrada_protegida: nao e possivel excluir a coluna de entrada'; end if;
    return OLD;
  end if;
  if OLD.entrada then
    if NEW.entrada is distinct from true then raise exception 'coluna_entrada_protegida: nao e possivel remover a flag de entrada'; end if;
    if NEW.arquivada then raise exception 'coluna_entrada_protegida: nao e possivel arquivar a coluna de entrada'; end if;
    if NEW.ordem <> 0 then raise exception 'coluna_entrada_protegida: a coluna de entrada deve permanecer em ordem 0'; end if;
  end if;
  return NEW;
end $function$;
CREATE OR REPLACE FUNCTION public.fn_remarketing_score(p_lead uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  l record; v_prazo timestamptz; v_ult_entrada timestamptz;
  v_docs int := 0; v_ult_tipo text; v_cpf boolean := false;
  v_benef numeric := 0; v_contratos int := 0; v_tipo_benef text;
  f jsonb := '[]'::jsonb; eng int := 0; fitm numeric := 1.0; sc int;
  agora timestamptz := now(); horas int; dias int; respondeu_recente boolean := false;
  add_f record;
begin
  select rl.id, rl.etapa, rl.tentativas, rl.criado_em, rl.entrou_etapa_em, rl.proxima_acao_em,
         rl.conversa_id, rl.contato_id, rl.status,
         (select vence_em from public.remarketing_tarefas t
            where t.remarketing_id = rl.id and t.status = 'pendente' limit 1) as tarefa_vence,
         (select ultima_entrada_em from public.conversas cv where cv.id = rl.conversa_id) as ult_entrada
    into l
    from public.remarketing_leads rl where rl.id = p_lead;
  if l.id is null then return jsonb_build_object('score', 0, 'fatores', '[]'::jsonb); end if;

  v_ult_entrada := l.ult_entrada;
  v_prazo := coalesce(l.tarefa_vence, l.proxima_acao_em);

  -- sinais reais do cliente
  if l.conversa_id is not null then
    select count(*) filter (where direcao = 'entrada' and tipo in ('documento','imagem')),
           (select tipo from public.mensagens m2 where m2.conversa_id = l.conversa_id and m2.direcao = 'entrada' order by m2.enviada_em desc limit 1)
      into v_docs, v_ult_tipo
      from public.mensagens where conversa_id = l.conversa_id;
    v_cpf := exists (
      select 1 from public.bot_conversa_estado b
      where b.conversa_id = l.conversa_id
        and coalesce(b.dados_qualificacao->>'cpf_mascarado', '') <> ''
    );
  end if;

  -- carteira (FIT): só a versão vigente de cada ficha
  select count(*), coalesce(sum(valor_beneficio), 0),
         (array_agg(tipo_beneficio order by valor_beneficio desc nulls last))[1]
    into v_contratos, v_benef, v_tipo_benef
    from public.fichas_judiciais fj
    where fj.contato_id = l.contato_id
      and not exists (select 1 from public.fichas_judiciais s where s.ficha_anterior_id = fj.id);

  -- ===== ENGAGEMENT =====
  if v_prazo is not null then
    if v_prazo < agora then
      horas := floor(extract(epoch from (agora - v_prazo)) / 3600);
      f := f || jsonb_build_object('motivo', 'prazo vencido', 'pts', 50 + least(20, horas));
    elsif (v_prazo at time zone 'America/Sao_Paulo')::date = (agora at time zone 'America/Sao_Paulo')::date then
      f := f || jsonb_build_object('motivo', 'vence hoje', 'pts', 30);
    elsif (v_prazo at time zone 'America/Sao_Paulo')::date = ((agora + interval '1 day') at time zone 'America/Sao_Paulo')::date then
      f := f || jsonb_build_object('motivo', 'vence amanhã', 'pts', 15);
    end if;
  end if;
  if l.criado_em >= agora - interval '10 minutes' then
    f := f || jsonb_build_object('motivo', 'lead novíssimo (<10 min)', 'pts', 45);
  end if;
  if v_cpf then
    f := f || jsonb_build_object('motivo', 'CPF preenchido no bot', 'pts', 40);
  end if;
  if v_ult_entrada is not null and v_ult_entrada >= agora - interval '1 hour' then
    f := f || jsonb_build_object('motivo', 'respondeu há pouco', 'pts', 35); respondeu_recente := true;
  elsif v_ult_entrada is not null and v_ult_entrada >= agora - interval '24 hours' then
    f := f || jsonb_build_object('motivo', 'respondeu nas últimas 24 h', 'pts', 18); respondeu_recente := true;
  end if;
  if v_docs > 0 or v_ult_tipo in ('documento', 'imagem') then
    f := f || jsonb_build_object('motivo', 'enviou documento', 'pts', 30);
  end if;
  f := f || jsonb_build_object('motivo', 'poucas tentativas', 'pts', (3 - least(l.tentativas, 3)) * 6);
  if l.etapa = 'recuperacao_3' then
    f := f || jsonb_build_object('motivo', 'última chance antes de perder', 'pts', 15);
  elsif l.etapa = 'recuperacao_2' then
    f := f || jsonb_build_object('motivo', 'recuperação avançada', 'pts', 10);
  end if;
  -- decaimento (é o que faz o número cair sozinho no silêncio)
  dias := case when v_ult_entrada is null then null else floor(extract(epoch from (agora - v_ult_entrada)) / 86400) end;
  if dias is not null and dias > 5 then
    f := f || jsonb_build_object('motivo', 'abandono antigo', 'pts', -least(dias, 25));
  end if;
  if l.tentativas >= 2 and (v_ult_entrada is null or v_ult_entrada <= l.entrou_etapa_em) then
    f := f || jsonb_build_object('motivo', 'cutucadas ignoradas', 'pts', -least(l.tentativas * 4, 20));
  end if;

  for add_f in select (e->>'pts')::int as pts from jsonb_array_elements(f) e loop
    eng := eng + add_f.pts;
  end loop;
  eng := greatest(0, least(100, eng));

  -- ===== FIT (multiplicador) =====
  if v_benef >= 5000 then fitm := fitm + 0.15;
  elsif v_benef >= 3000 then fitm := fitm + 0.08; end if;
  if v_contratos >= 2 then fitm := fitm + 0.05; end if;
  if v_tipo_benef = 'aposentadoria' then fitm := fitm + 0.05; end if;
  if v_tipo_benef = 'bpc_loas' and v_contratos = 0 then fitm := fitm - 0.10; end if;
  fitm := greatest(0.90, least(1.25, fitm));

  sc := round(least(100, greatest(0, eng * fitm)));
  -- piso de sobrevivência: quem respondeu/mandou doc não afunda por decay
  if (respondeu_recente or v_docs > 0) and sc < 30 then sc := 30; end if;

  return jsonb_build_object('score', sc, 'fatores', f, 'engagement', eng, 'fit', fitm);
end $function$;
CREATE OR REPLACE FUNCTION public.fn_wa_lid_map_touch()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin new.atualizado_em := now(); return new; end $function$;
CREATE OR REPLACE FUNCTION public.garantir_oportunidade_entrada(p_contato uuid, p_funil uuid, p_origem text DEFAULT NULL::text, p_conversa uuid DEFAULT NULL::uuid, p_canal uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_org uuid; v_col uuid; v_id uuid; v_resp uuid; v_tags text[];
begin
  select organizacao_id, etiquetas into v_org, v_tags from public.contatos where id = p_contato;
  if v_org is null then raise exception 'contato_invalido'; end if;
  if auth.uid() is not null and not public.is_member(v_org) then raise exception 'sem_permissao'; end if;
  perform 1 from public.funis where id = p_funil and organizacao_id = v_org and not arquivado;
  if not found then raise exception 'funil_invalido'; end if;
  select id into v_col from public.funil_colunas
    where funil_id = p_funil and organizacao_id = v_org and entrada and not arquivada limit 1;
  if v_col is null then raise exception 'sem_coluna_entrada'; end if;
  if p_conversa is not null then
    select atendente_id into v_resp from public.conversas where id = p_conversa and organizacao_id = v_org;
  end if;
  select id into v_id from public.oportunidades
    where organizacao_id = v_org and contato_id = p_contato and funil_id = p_funil and status = 'em_andamento' limit 1;
  if v_id is not null then return v_id; end if;

  -- GUARDA (2026-09-02): cliente com oportunidade GANHA no funil não reentra como lead novo.
  if exists (
    select 1 from public.oportunidades
    where organizacao_id = v_org and contato_id = p_contato and funil_id = p_funil and status = 'ganho'
  ) then
    raise exception 'cliente_ja_fechado_ganho' using errcode = 'check_violation';
  end if;

  insert into public.oportunidades (organizacao_id, contato_id, funil_id, coluna_id, conversa_origem_id, canal_origem_id,
      responsavel_id, origem, status, etiquetas, tipo_servico, status_cancelamento, status_ressarcimento, ordem)
    values (v_org, p_contato, p_funil, v_col, p_conversa, p_canal, v_resp, p_origem, 'em_andamento',
      coalesce(v_tags, '{}'), 'analise_inicial', 'nao_se_aplica', 'nao_se_aplica', 0)
    on conflict (organizacao_id, contato_id, funil_id) where (status = 'em_andamento' and contato_id is not null) do nothing
    returning id into v_id;
  if v_id is null then
    select id into v_id from public.oportunidades
      where organizacao_id = v_org and contato_id = p_contato and funil_id = p_funil and status = 'em_andamento' limit 1;
  end if;
  return v_id;
end $function$;
CREATE OR REPLACE FUNCTION public.garantir_oportunidade_lead_novo(p_contato uuid, p_conversa uuid DEFAULT NULL::uuid, p_canal uuid DEFAULT NULL::uuid, p_origem text DEFAULT NULL::text, p_forcar boolean DEFAULT false)
 RETURNS TABLE(oportunidade_id uuid, criou boolean, motivo text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_org uuid; v_funil uuid; v_id uuid; v_tem_fechada boolean;
begin
  select organizacao_id into v_org from public.contatos where id = p_contato;
  if v_org is null then raise exception 'contato_invalido'; end if;
  -- mesma guarda da primitiva: chamada autenticada exige membership; service_role (uid null) é backend confiável.
  if auth.uid() is not null and not public.is_member(v_org) then raise exception 'sem_permissao'; end if;

  -- Funil principal = padrao=true (não pelo nome). Desempate determinístico.
  select id into v_funil from public.funis
   where organizacao_id = v_org and padrao and not arquivado
   order by ordem asc, criado_em asc, id asc limit 1;
  -- Fallback: org sem padrão marcado -> funil não-arquivado mais antigo (evita "lead sumido" silencioso).
  if v_funil is null then
    select id into v_funil from public.funis
     where organizacao_id = v_org and not arquivado
     order by ordem asc, criado_em asc, id asc limit 1;
  end if;
  if v_funil is null then
    return query select null::uuid, false, 'sem_funil'; return;
  end if;

  -- Já tem oportunidade ATIVA no funil? Retorna a existente (não duplica).
  select id into v_id from public.oportunidades
   where organizacao_id = v_org and contato_id = p_contato and funil_id = v_funil and status = 'em_andamento'
   limit 1;
  if v_id is not null then
    return query select v_id, false, 'ja_ativa'; return;
  end if;

  -- DECISÃO DO DONO (09/10): contato com pendência (aba Pendências) fica só na aba; nada no Kanban.
  if exists (select 1 from public.pendencias where organizacao_id = v_org and contato_id = p_contato) then
    return query select null::uuid, false, 'tem_pendencia'; return;
  end if;

  -- DECISÃO DO DONO: contato que já teve oportunidade FECHADA não reentra automático.
  -- (p_forcar=true reserva o caminho manual para reengajar um perdido/ganho, se um dia houver regra.)
  if not p_forcar then
    select exists(
      select 1 from public.oportunidades
       where organizacao_id = v_org and contato_id = p_contato and funil_id = v_funil
         and status in ('ganho','perdido','cancelado')
    ) into v_tem_fechada;
    if v_tem_fechada then
      return query select null::uuid, false, 'tem_opp_fechada'; return;
    end if;
  end if;

  -- Cria via primitiva idempotente (coluna de entrada, atendente/etiquetas herdados, ON CONFLICT).
  v_id := public.garantir_oportunidade_entrada(p_contato, v_funil, p_origem, p_conversa, p_canal);
  return query select v_id, (v_id is not null), coalesce(case when v_id is not null then 'criada' end, 'nao_criada');
end $function$;
CREATE OR REPLACE FUNCTION public.higiene_registrar_adiamento(p_conversa uuid, p_tipo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org        uuid;
  v_ate        timestamptz;
  v_adiamentos int;
  v_liberado   timestamptz;
begin
  if p_tipo not in ('nome_adiado','nome_nao_informado') then
    raise exception 'tipo_invalido' using hint = 'use nome_adiado ou nome_nao_informado';
  end if;

  select organizacao_id into v_org from public.conversas where id = p_conversa;
  if v_org is null then raise exception 'conversa_nao_encontrada'; end if;

  -- autorização: membro ATIVO da org da conversa (nunca por parâmetro do cliente)
  if not (is_platform_admin() or exists (
    select 1 from public.organizacao_usuarios
     where organizacao_id = v_org and usuario_id = auth.uid() and status = 'ativo'
  )) then
    raise exception 'sem_acesso';
  end if;

  if p_tipo = 'nome_nao_informado' then
    v_ate := now() + interval '24 hours';
  end if;

  insert into public.conversa_higiene_adiamentos (organizacao_id, conversa_id, tipo, usuario_id, adiar_ate)
  values (v_org, p_conversa, p_tipo, auth.uid(), v_ate);

  select count(*) into v_adiamentos
    from public.conversa_higiene_adiamentos
   where conversa_id = p_conversa and tipo = 'nome_adiado';

  select max(adiar_ate) into v_liberado
    from public.conversa_higiene_adiamentos
   where conversa_id = p_conversa and tipo = 'nome_nao_informado' and adiar_ate > now();

  return jsonb_build_object('ok', true, 'adiamentos', v_adiamentos, 'liberado_ate', v_liberado);
end $function$;
CREATE OR REPLACE FUNCTION public.ia_agente_metricas(p_agente uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org uuid;
  v_canais uuid[];
  v_inicio_dia timestamptz;
  v_sessoes_ativas int;
  v_chamadas_hoje int;
  v_nudges_hoje int;
  v_handoffs_7d int;
begin
  select organizacao_id into v_org from public.ia_agentes where id = p_agente;
  if v_org is null then
    raise exception 'Agente não encontrado';
  end if;
  if not (is_platform_admin() or is_member(v_org)) then
    raise exception 'Sem permissão';
  end if;

  select coalesce(array_agg(canal_id), '{}'::uuid[]) into v_canais
    from public.bot_canal_config where ia_agente_id = p_agente;

  v_inicio_dia := (date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo');

  select count(*) into v_sessoes_ativas
    from public.ia_sessoes s
   where s.canal_id = any (v_canais) and s.status = 'ativa';

  select count(*) into v_chamadas_hoje
    from public.ia_eventos e
    join public.ia_sessoes s on s.id = e.sessao_id
   where s.canal_id = any (v_canais) and e.tipo = 'gemini_call' and e.criado_em >= v_inicio_dia;

  select count(*) into v_nudges_hoje
    from public.ia_eventos e
    join public.ia_sessoes s on s.id = e.sessao_id
   where s.canal_id = any (v_canais) and e.tipo = 'nudge_enviado' and e.criado_em >= v_inicio_dia;

  select count(*) into v_handoffs_7d
    from public.ia_sessoes s
   where s.canal_id = any (v_canais) and s.status = 'handoff'
     and s.atualizado_em >= now() - interval '7 days';

  return jsonb_build_object(
    'sessoes_ativas', v_sessoes_ativas,
    'chamadas_hoje', v_chamadas_hoje,
    'nudges_hoje', v_nudges_hoje,
    'handoffs_7d', v_handoffs_7d,
    'canais', coalesce(array_length(v_canais, 1), 0)
  );
end $function$;
CREATE OR REPLACE FUNCTION public.ia_agente_salvar_chave(p_agente uuid, p_chave text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org uuid;
  v_secret uuid;
begin
  select organizacao_id, chave_secret_id into v_org, v_secret
    from public.ia_agentes where id = p_agente;
  if v_org is null then
    raise exception 'Agente não encontrado';
  end if;
  if not (is_platform_admin()
          or papel_na_org(v_org) = any (array['admin'::user_role,'supervisor'::user_role])) then
    raise exception 'Sem permissão para definir a chave';
  end if;
  if coalesce(btrim(p_chave), '') = '' then
    raise exception 'Chave vazia';
  end if;

  if v_secret is null then
    v_secret := vault.create_secret(p_chave, 'ia_agente_' || p_agente::text,
                                    'Chave de API do atendente de IA');
  else
    perform vault.update_secret(v_secret, p_chave, 'ia_agente_' || p_agente::text,
                                'Chave de API do atendente de IA');
  end if;

  perform set_config('atenvo.ia_chave', '1', true);
  update public.ia_agentes
     set chave_secret_id = v_secret, chave_definida_em = now()
   where id = p_agente;
  perform set_config('atenvo.ia_chave', '', true);
end $function$;
CREATE OR REPLACE FUNCTION public.ia_agente_vincular_canais(p_agente uuid, p_canais uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org uuid;
begin
  select organizacao_id into v_org from public.ia_agentes where id = p_agente;
  if v_org is null then
    raise exception 'Agente não encontrado';
  end if;
  if not (is_platform_admin()
          or papel_na_org(v_org) = any (array['admin'::user_role,'supervisor'::user_role])) then
    raise exception 'Sem permissão para vincular canais';
  end if;

  update public.bot_canal_config bc
     set ia_agente_id = null, atualizado_em = now()
    from public.canais c
   where c.id = bc.canal_id
     and c.organizacao_id = v_org
     and bc.ia_agente_id = p_agente
     and not (bc.canal_id = any (coalesce(p_canais, '{}'::uuid[])));

  insert into public.bot_canal_config (organizacao_id, canal_id, ia_agente_id)
  select c.organizacao_id, c.id, p_agente
    from public.canais c
   where c.organizacao_id = v_org
     and c.id = any (coalesce(p_canais, '{}'::uuid[]))
  on conflict (canal_id) do update
    set ia_agente_id = excluded.ia_agente_id, atualizado_em = now();
end $function$;
CREATE OR REPLACE FUNCTION public.ia_atendendo_agora(p_conversa uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce((
    select s.status = 'ativa' and coalesce((s.dados->>'desativado_manual')::boolean, false) = false
           and public.ia_canal_atende(s.canal_id)
    from public.ia_sessoes s
    join public.conversas c on c.id = s.conversa_id
    where s.conversa_id = p_conversa
      and (auth.role() = 'service_role' or public.is_member(c.organizacao_id))
  ), false)
$function$;
CREATE OR REPLACE FUNCTION public.ia_canal_atende(p_canal uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select exists (
    select 1 from public.bot_canal_config b join public.canais ca on ca.id = b.canal_id
    where b.canal_id = p_canal and b.ia_enabled and ca.status_integracao::text = 'conectado' and ca.ativo is not false
  )
$function$;
CREATE OR REPLACE FUNCTION public.ia_canal_ativar(p_canal uuid, p_ativo boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org uuid;
begin
  select organizacao_id into v_org from public.canais where id = p_canal;
  if v_org is null then
    raise exception 'Canal não encontrado';
  end if;
  if not (is_platform_admin()
          or papel_na_org(v_org) = any (array['admin'::user_role,'supervisor'::user_role])) then
    raise exception 'Sem permissão para ativar a IA neste canal';
  end if;

  insert into public.bot_canal_config (organizacao_id, canal_id, ia_enabled)
  values (v_org, p_canal, p_ativo)
  on conflict (canal_id) do update
    set ia_enabled = excluded.ia_enabled, atualizado_em = now();
end $function$;
CREATE OR REPLACE FUNCTION public.ia_canal_modo_teste(p_canal uuid, p_teste boolean, p_numeros text[] DEFAULT NULL::text[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org uuid;
  v_numeros text[];
begin
  select organizacao_id into v_org from public.canais where id = p_canal;
  if v_org is null then
    raise exception 'Canal não encontrado';
  end if;
  if not (is_platform_admin()
          or papel_na_org(v_org) = any (array['admin'::user_role,'supervisor'::user_role])) then
    raise exception 'Sem permissão para alterar o modo teste';
  end if;

  if p_numeros is not null then
    select coalesce(array_agg(n), '{}'::text[]) into v_numeros
      from (select regexp_replace(x, '\D', '', 'g') as n
              from unnest(p_numeros) as x) t
     where length(n) >= 8;
  end if;

  insert into public.bot_canal_config (organizacao_id, canal_id, ia_modo_teste, numeros_teste)
  values (v_org, p_canal, p_teste, coalesce(v_numeros, '{}'::text[]))
  on conflict (canal_id) do update
    set ia_modo_teste = excluded.ia_modo_teste,
        numeros_teste = coalesce(v_numeros, public.bot_canal_config.numeros_teste),
        atualizado_em = now();
end $function$;
CREATE OR REPLACE FUNCTION public.ia_conversa_estado(p_conversa uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select case
    when not exists (select 1 from public.ia_sessoes where conversa_id = p_conversa) then jsonb_build_object('existe', false)
    else (select jsonb_build_object('existe', true, 'status', s.status, 'etapa', s.etapa,
            'desativado_manual', coalesce((s.dados->>'desativado_manual')::boolean, false),
            'aguardando_humano', s.dados->>'aguardando_humano',
            -- 12/11 (trava do envio): atende de verdade agora? é a Iris? e as últimas pausas, para o aviso na conversa
            'atendendo_agora', public.ia_atendendo_agora(p_conversa),
            'iris', coalesce((select (b.iris_config->>'ativo')::boolean from public.bot_canal_config b where b.canal_id = s.canal_id), false),
            'pausas', coalesce((select jsonb_agg(jsonb_build_object('acao', p.acao, 'origem', p.origem, 'em', p.criado_em,
                                  'nome', coalesce(nullif(split_part(btrim(u.nome), ' ', 1), ''), 'Alguém da equipe')) order by p.criado_em)
                                from (select * from public.ia_pausas p2 where p2.conversa_id = p_conversa and public.is_member(p2.organizacao_id) order by p2.criado_em desc limit 20) p
                                left join public.usuarios u on u.id = p.usuario_id), '[]'::jsonb))
          from public.ia_sessoes s where s.conversa_id = p_conversa)
  end;
$function$;
CREATE OR REPLACE FUNCTION public.ia_conversa_recomecar(p_conversa uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_conv record; v_sess record; v_iso text; v_etapa text := 'qualificacao_inss';
begin
  select id, organizacao_id, contato_id, canal_id into v_conv from public.conversas where id = p_conversa;
  if v_conv is null then raise exception 'conversa inexistente'; end if;
  if not public.is_member(v_conv.organizacao_id) then raise exception 'sem permissão'; end if;

  v_iso := to_char((now() at time zone 'utc'), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');

  select * into v_sess from public.ia_sessoes where conversa_id = p_conversa;
  -- JUROS ABUSIVO (20/10): a IA de lá só pergunta do benefício/parente — recomeça em 'juros_beneficio' (do zero:
  -- a abertura dela é a pergunta do benefício) e só com a conversa em 'sem_beneficio'; fora dela não tem o que fazer.
  if v_conv.canal_id is not distinct from 'fc80ec9e-9f8f-4dca-a3f0-e1101d73e117'::uuid or v_sess.canal_id is not distinct from 'fc80ec9e-9f8f-4dca-a3f0-e1101d73e117'::uuid then
    -- revisão 21/10: IA desligada no JUROS → recusa (mesmo motivo do toggle)
    if not exists (select 1 from public.bot_canal_config where canal_id = 'fc80ec9e-9f8f-4dca-a3f0-e1101d73e117' and ia_enabled) then
      raise exception 'JUROS ABUSIVO: a IA está desligada neste número';
    end if;
    if not exists (select 1 from public.bot_conversa_estado e
                    where e.conversa_id = p_conversa and e.dados_qualificacao->>'passo_video' = 'sem_beneficio') then
      raise exception 'JUROS ABUSIVO: a IA só entra na pergunta do benefício do INSS, e esta conversa não está nela';
    end if;
    v_etapa := 'juros_beneficio';
  end if;
  if v_sess.id is not null then
    update public.ia_sessoes
       set etapa = v_etapa, status = 'ativa', processar_apos = now(),
           docs = '{}'::jsonb, cobertura_extratos = '{}'::jsonb, tentativas_erro = 0,
           dados = jsonb_build_object('processado_ate', v_iso, 'recomeco_manual_em', v_iso),
           atualizado_em = now()
     where id = v_sess.id;
  else
    insert into public.ia_sessoes (organizacao_id, canal_id, conversa_id, contato_id, etapa, status, processar_apos, dados)
    values (v_conv.organizacao_id, v_conv.canal_id, p_conversa, v_conv.contato_id, v_etapa, 'ativa', now(),
            jsonb_build_object('processado_ate', v_iso, 'recomeco_manual_em', v_iso));
  end if;

  update public.conversas
     set precisa_humano = false, precisa_humano_motivo = null, precisa_humano_em = null,
         arquivada_em = null, arquivada_por = null
   where id = p_conversa;

  update public.bot_conversa_estado set pausado = false where conversa_id = p_conversa;

  return jsonb_build_object('ok', true, 'ia', 'recomecada');
end $function$;
CREATE OR REPLACE FUNCTION public.ia_conversa_toggle(p_conversa uuid, p_ativar boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_conv record; v_sess record; v_canal_ia boolean; v_juros boolean; v_opp uuid; v_dq jsonb;
begin
  select id, organizacao_id, contato_id, canal_id into v_conv from public.conversas where id = p_conversa;
  if v_conv is null then raise exception 'conversa inexistente'; end if;
  if not public.is_member(v_conv.organizacao_id) then raise exception 'sem permissão'; end if;

  select * into v_sess from public.ia_sessoes where conversa_id = p_conversa;

  if p_ativar then
    -- JUROS ABUSIVO (20/10): a IA de lá só pergunta do benefício/parente. Só com a conversa em 'sem_beneficio';
    -- sessão de outra etapa (qualificacao_inss de agosto, coleta de documentos trazida de canal removido…) não
    -- retoma: "Recomeçar atendimento" a põe na etapa certa.
    v_juros := v_conv.canal_id is not distinct from 'fc80ec9e-9f8f-4dca-a3f0-e1101d73e117'::uuid or v_sess.canal_id is not distinct from 'fc80ec9e-9f8f-4dca-a3f0-e1101d73e117'::uuid;
    if v_juros then
      -- revisão 21/10: IA desligada no JUROS (estado depois do config_rollback) → recusa; senão o clique apagaria o
      -- alerta 'beneficio_nao_sem_ia' da equipe e deixaria uma sessão 'ativa' que o worker nunca roda
      if not exists (select 1 from public.bot_canal_config where canal_id = 'fc80ec9e-9f8f-4dca-a3f0-e1101d73e117' and ia_enabled) then
        raise exception 'JUROS ABUSIVO: a IA está desligada neste número';
      end if;
      select e.oportunidade_id, e.dados_qualificacao into v_opp, v_dq from public.bot_conversa_estado e where e.conversa_id = p_conversa;
      if coalesce(v_dq->>'passo_video', '') <> 'sem_beneficio' then
        raise exception 'JUROS ABUSIVO: a IA só entra na pergunta do benefício do INSS, e esta conversa não está nela';
      end if;
      if v_sess.id is not null and v_sess.etapa is distinct from 'juros_beneficio' then
        raise exception 'JUROS ABUSIVO: esta sessão da IA é de outra etapa (%) — use "Recomeçar atendimento"', v_sess.etapa;
      end if;
    end if;
    if v_sess.id is not null then
      update public.ia_sessoes set status = 'ativa', processar_apos = now(),
        dados = (coalesce(dados, '{}'::jsonb) - 'aguardando_humano') || jsonb_build_object('desativado_manual', false, 'religado_manual_em', now()),
        atualizado_em = now()
      where id = v_sess.id;
    else
      -- sem sessão: cria uma (o atendente está mandando a IA assumir esta conversa)
      -- JUROS: na etapa do benefício, semeada com a resposta que o robô colheu — o que o bot-runner faria se a IA
      -- tivesse nascido no 'sem_beneficio' (dados.beneficio_robo; a IA lê só dali pra frente e não repete a pergunta)
      insert into public.ia_sessoes (organizacao_id, canal_id, conversa_id, contato_id, oportunidade_id, etapa, status, processar_apos, dados)
      values (v_conv.organizacao_id, v_conv.canal_id, p_conversa, v_conv.contato_id,
              case when v_juros then v_opp end,
              case when v_juros then 'juros_beneficio' else 'qualificacao_inss' end, 'ativa', now(),
              jsonb_build_object('manual_ativado', true)
              || case when v_juros and coalesce(v_dq->>'beneficio_inss', 'sem_resposta') <> 'sem_resposta'
                      then jsonb_build_object('beneficio_robo', jsonb_build_object('perguntou', true,
                             'classe', v_dq->'beneficio_inss', 'resposta', v_dq->'beneficio_resposta',
                             'msg_id', v_dq->'beneficio_msg_id', 'em', v_dq->'beneficio_em'))
                      else '{}'::jsonb end);
    end if;
    -- limpa o precisa_humano SÓ se foi a IA que pôs (motivos conhecidos dela)
    update public.conversas set precisa_humano = false, precisa_humano_motivo = null, precisa_humano_em = null
      where id = p_conversa and precisa_humano = true
        and precisa_humano_motivo in ('sem_acesso_govbr','auxilio_extratos','auxilio_senha','cpf_divergente',
          'foto_ilegivel','doc_divergente','quer_falar_valores','nao_entendeu','transicao_falhou',
          'falha_tecnica','docs_completos_fechar','analise_pronta_contatar_hoje',
          -- ia-sdr v3 (09/10): motivos novos da IA (alerta leve + representação)
          'prometeu_colega','pediu_humano','representacao',
          -- JUROS (20/10): a IA não tinha nascido no 'sem_beneficio' e o robô chamou o atendente pro parente
          'beneficio_nao_sem_ia');
    -- 12/11: registro de quem religou (ficha ia_pausas)
    insert into public.ia_pausas (organizacao_id, conversa_id, usuario_id, acao, origem)
    values (v_conv.organizacao_id, p_conversa, auth.uid(), 'religou', 'cabecalho');
    return jsonb_build_object('ok', true, 'ia', 'ativa');
  else
    if v_sess.id is not null then
      update public.ia_sessoes set status = 'pausada',
        dados = coalesce(dados, '{}'::jsonb) || jsonb_build_object('desativado_manual', true, 'desligado_manual_em', now(), 'desligado_por', auth.uid()),
        atualizado_em = now()
      where id = v_sess.id;
    end if;
    if v_sess.id is not null then
      -- 12/11: registro de quem pausou (ficha ia_pausas)
      insert into public.ia_pausas (organizacao_id, conversa_id, usuario_id, acao, origem)
      values (v_conv.organizacao_id, p_conversa, auth.uid(), 'pausou', 'cabecalho');
    end if;
    return jsonb_build_object('ok', true, 'ia', 'desativada', 'tinha_sessao', v_sess.id is not null);
  end if;
end $function$;
CREATE OR REPLACE FUNCTION public.ia_familia_pendente_em(p_conversa uuid, p_agora timestamp with time zone DEFAULT now())
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select q.q_first
    from public.ia_sessoes s
    -- última fala do cliente até p_agora (qualquer tipo)
    left join lateral (
      select i.criado_em as li_em, i.tipo::text as li_tipo, coalesce(i.conteudo, '') as li_txt
        from public.mensagens i
       where i.conversa_id = s.conversa_id and i.direcao = 'entrada' and i.criado_em <= p_agora
       order by i.criado_em desc limit 1) li on true
    cross join lateral (
      select min(m.criado_em) as q_first
        from public.mensagens m
       where m.conversa_id = s.conversa_id
         and m.direcao = 'saida' and m.origem = 'bot' and m.tipo = 'texto'
         and m.criado_em <= p_agora and m.criado_em >= p_agora - interval '30 days'
         -- nada do cliente depois da pergunta (qualquer tipo: texto, áudio, figurinha…)
         and m.criado_em > coalesce(li.li_em, '-infinity'::timestamptz)
         -- é a pergunta do PARENTE (não a das financeiras do parente, nem Bolsa Família, nem conta de luz)
         and m.conteudo like '%?%'
         and m.conteudo ~* '(fam[íi]lia|familiar|parente)'
         and m.conteudo ~* '(inss|aposentad|pens[ãa]o|pensionista|benef[íi]cio|receb)'
         and m.conteudo !~* '(empr[ée]stimo|agibank|bmg|facta|mercantil|crefisa|financeira|conta d[eo] |no nome|comprovante|pesquis|(bolsa|sal[áa]rio)[ -]?fam[íi]lia)'
    ) q
   where s.conversa_id = p_conversa
     and s.etapa in ('qualificacao_inss', 'juros_beneficio')
     and s.dados->>'recebe_inss' = 'nao'
     and s.dados->>'perguntou_familiar' = 'true'
     and coalesce(s.dados->>'familiar_recebe', '') not in ('sim', 'nao')
     and coalesce(s.dados->>'beneficiario', '') <> 'familiar'
     and coalesce(s.dados->>'financeiras_perguntada', '') <> 'true'
     and q.q_first is not null
     -- a última fala do cliente veio DEPOIS de uma pergunta do parente (a IA re-perguntou)? Só vale se foi texto que não
     -- cita parente ("Olá", "Eu trabalho"). Áudio ou "minha mãe…" → humano/IA decidem, nunca NE automático.
     and not (li.li_em is not null
              and exists (select 1 from public.mensagens f
                           where f.conversa_id = s.conversa_id and f.direcao = 'saida' and f.origem = 'bot' and f.tipo = 'texto'
                             and f.criado_em < li.li_em and f.criado_em >= p_agora - interval '30 days'
                             and f.conteudo like '%?%' and f.conteudo ~* '(fam[íi]lia|familiar|parente)'
                             and f.conteudo ~* '(inss|aposentad|pens[ãa]o|pensionista|benef[íi]cio|receb)')
              and (li.li_tipo <> 'texto'
                   or li.li_txt ~* '\m(m[ãa]e|pai|av[óôoa]|v[óô]|marido|espos[oa]|filh[oa]s?|irm[ãa]o?|tio|tia|sogr[oa]|sobrinh[oa]|net[oa]|parente|familiar)\M'))
$function$;
CREATE OR REPLACE FUNCTION public.ia_sessao_antonio_so_matheus()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_mat constant uuid := '4ac197b4-9600-4756-81aa-1ac29280df09';
  v_resp uuid; v_atend uuid;
begin
  if new.status <> 'ativa' or not public.conversa_no_antonio(new.conversa_id, new.canal_id) then return new; end if;
  select ct.responsavel_id into v_resp from public.contatos ct where ct.id = new.contato_id;
  select v.atendente_id into v_atend from public.conversas v where v.id = new.conversa_id;
  if v_resp is null and v_atend is null then
    if new.processar_apos is not null and new.processar_apos < now() + interval '90 seconds' then
      new.processar_apos := now() + interval '2 minutes';
    end if;
    return new;
  end if;
  if v_resp is distinct from v_mat and v_atend is distinct from v_mat then
    new.status := 'pausada';
    new.dados := coalesce(new.dados, '{}'::jsonb) || jsonb_build_object(
      'desativado_manual', true, 'desligado_manual_em', now(), 'desligado_motivo', 'antonio_so_matheus_28out');
    perform public.antonio_passar_humano(new.conversa_id, 'antonio_robo_concluiu');
  end if;
  return new;
end $function$;
CREATE OR REPLACE FUNCTION public.iris_ativa_na_conversa(p_conversa uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select exists (
    select 1
      from public.conversas c
      cross join lateral (select distinct k.canal from unnest(array[c.canal_id, c.canal_preso_id]) k(canal)
                           where k.canal is not null) cn
      cross join lateral (select ci.valor_normalizado as tel from public.contato_identidades ci
                           where ci.contato_id = c.contato_id and ci.tipo = 'whatsapp' and ci.valor_normalizado is not null
                           order by ci.principal desc
                           limit 1) t
     where c.id = p_conversa
       and public.iris_ativa_para(cn.canal, t.tel))
$function$;
CREATE OR REPLACE FUNCTION public.iris_ativa_para(p_canal uuid, p_telefone text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce((
    select b.iris_config -> 'ativo' = 'true'::jsonb
           and case
                 -- 01/11: só os contatos de UM atendente (e os números de teste)
                 when jsonb_typeof(b.iris_config -> 'so_dono') = 'string'
                   then public.iris_numero_teste(p_canal, p_telefone)
                        or public.iris_contato_do_dono(p_canal, p_telefone, (b.iris_config ->> 'so_dono')::uuid)
                        -- 12/11: + os contatos NOVOS (criados depois do todos_desde), de qualquer atendente
                        or (jsonb_typeof(b.iris_config -> 'todos_desde') = 'string'
                            and public.iris_contato_novo(p_canal, p_telefone, (b.iris_config ->> 'todos_desde')::timestamptz))
                 else (b.iris_config -> 'somente_teste' = 'false'::jsonb
                       or public.iris_numero_teste(p_canal, p_telefone))
               end
      from public.bot_canal_config b
     where b.canal_id = p_canal), false)
$function$;
CREATE OR REPLACE FUNCTION public.iris_atraso_resposta_s(p_conversa uuid)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_cfg jsonb; v_lo int; v_hi int;
begin
  select b.iris_config into v_cfg
    from public.conversas c join public.bot_canal_config b on b.canal_id = c.canal_id
   where c.id = p_conversa;
  if v_cfg is null or v_cfg -> 'ativo' is distinct from 'true'::jsonb then return 7; end if;
  v_lo := greatest(1, least(600, coalesce(nullif(v_cfg ->> 'resposta_min_s', '')::int, 30)));
  v_hi := greatest(v_lo, least(600, coalesce(nullif(v_cfg ->> 'resposta_max_s', '')::int, 60)));
  return v_lo + floor(random() * (v_hi - v_lo + 1))::int;
exception when others then
  return 7;
end $function$;
CREATE OR REPLACE FUNCTION public.iris_carteira_lista()
 RETURNS TABLE(conversa_id uuid, estado text, atendente_original_nome text, lote text, entrou_em timestamp with time zone, origem text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select c.conversa_id, c.estado, c.atendente_original_nome, c.lote, c.entrou_em, 'carteira'::text
    from public.iris_carteira c
   where public.iris_pode_ver() and c.estado <> 'saiu'
  union all
  select s.conversa_id, s.status, null::text, null::text, s.criado_em, 'matheus'::text
    from (select distinct on (conversa_id) conversa_id, status, criado_em
            from public.ia_sessoes order by conversa_id, atualizado_em desc) s
    join public.conversas cv on cv.id = s.conversa_id
    left join public.contatos ct on ct.id = cv.contato_id
   where public.iris_pode_ver()
     and (cv.atendente_id = '4ac197b4-9600-4756-81aa-1ac29280df09' or ct.responsavel_id = '4ac197b4-9600-4756-81aa-1ac29280df09')
     and not exists (select 1 from public.iris_carteira x where x.conversa_id = s.conversa_id)
$function$;
CREATE OR REPLACE FUNCTION public.iris_cliente_escreveu()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  begin
    update public.iris_fila_abertura f
       set ordem = (select coalesce(min(x.ordem), 1) - 1 from public.iris_fila_abertura x), atualizado_em = now()
     where f.conversa_id = new.conversa_id and f.status = 'fila';
  exception when others then null;
  end;
  return null;
end $function$;
CREATE OR REPLACE FUNCTION public.iris_contato_do_dono(p_canal uuid, p_telefone text, p_dono uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select exists (
    select 1
      from public.contato_identidades ci
      join public.contatos ct on ct.id = ci.contato_id
      join public.canais ca on ca.id = p_canal and ca.organizacao_id = ct.organizacao_id
     where ci.tipo = 'whatsapp'
       and nullif(public.chave_canonica_telefone(p_telefone), '') is not null
       and ci.chave_canonica = public.chave_canonica_telefone(p_telefone)
       and ct.responsavel_id = p_dono)
$function$;
CREATE OR REPLACE FUNCTION public.iris_contato_novo(p_canal uuid, p_telefone text, p_desde timestamp with time zone)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select exists (
    select 1
      from public.contato_identidades ci
      join public.contatos ct on ct.id = ci.contato_id
      join public.canais ca on ca.id = p_canal and ca.organizacao_id = ct.organizacao_id
     where ci.tipo = 'whatsapp'
       and nullif(public.chave_canonica_telefone(p_telefone), '') is not null
       and ci.chave_canonica = public.chave_canonica_telefone(p_telefone)
       and p_desde is not null and ct.criado_em >= p_desde)
$function$;
CREATE OR REPLACE FUNCTION public.iris_corte_limpeza(p_contato uuid)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v timestamptz;
begin
  if p_contato is null or to_regprocedure('public.iris_limpo_em(uuid)') is null then
    return null;
  end if;
  execute 'select public.iris_limpo_em($1)' into v using p_contato;
  return v;
exception when others then
  return null;
end
$function$;
CREATE OR REPLACE FUNCTION public.iris_dia_util(p_dia date)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select p_dia is not null
     and extract(isodow from p_dia) between 1 and 5
     and not (p_dia = any (public.dash_v5s_feriados()))
$function$;
CREATE OR REPLACE FUNCTION public.iris_followup_ao_receber()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_contato uuid;
  v_canal   uuid;
  f         public.iris_followups%rowtype;
  v_cls     text;
  v_status  text;
begin
  if new.direcao is distinct from 'entrada' or new.tipo::text in ('sistema', 'nota_interna') then return null; end if;
  select c.contato_id, c.canal_id into v_contato, v_canal from public.conversas c where c.id = new.conversa_id;
  if v_contato is null then return null; end if;
  -- caminho rápido: sem follow-up aberto (o normal, e sempre com a Iris desligada) não faz mais nada
  if not exists (select 1 from public.iris_followups x where x.contato_id = v_contato and x.status in ('agendado', 'ativo')) then
    return null;
  end if;
  if lower(btrim(coalesce(new.conteudo, ''))) = '/clean' then return null; end if;
  begin
    select * into f from public.iris_followups x
     where x.contato_id = v_contato and x.status in ('agendado', 'ativo')
     order by x.criado_em desc limit 1
     for update;
    if f.id is null or coalesce(new.criado_em, now()) < f.confirmou_em then return null; end if;

    v_cls := public.iris_followup_classificar(
               new.tipo::text, new.conteudo,
               f.toques_enviados > 0 and f.ultimo_toque_em is not null and coalesce(new.criado_em, now()) >= f.ultimo_toque_em);
    v_status := case v_cls when 'parar' then 'opt_out' when 'encerrar' then 'encerrado_sem_interesse' else 'cliente_deu_sinal' end;

    -- (a) o pedido de parar entra no opt-out pelo mecanismo de hoje (o primeiro "não quero" é o que vale)
    if v_status = 'opt_out' and v_canal is not null then
      perform public.wa_optout_registrar(v_contato, v_canal, 'sair_texto', left(coalesce(new.conteudo, ''), 300));
    end if;
    perform public.iris_followup_finalizar(f.id, v_status, 'resposta_' || v_cls, null, new.id);
  exception when others then
    raise warning 'iris_followup_ao_receber: mensagem % — %', new.id, sqlerrm;
  end;
  return null;
end
$function$;
CREATE OR REPLACE FUNCTION public.iris_followup_classificar(p_tipo text, p_texto text, p_perguntou boolean)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select case
    when coalesce(p_tipo, 'texto') <> 'texto' then 'sinal'
    when public.iris_followup_texto_parar(p_texto) then 'parar'
    when coalesce(p_perguntou, false) and public.iris_followup_texto_sim(p_texto) then 'encerrar'
    else 'sinal'
  end
$function$;
CREATE OR REPLACE FUNCTION public.iris_followup_dono(p_conversa uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce(ct.responsavel_id, c.atendente_id)
    from public.conversas c left join public.contatos ct on ct.id = c.contato_id
   where c.id = p_conversa
$function$;
CREATE OR REPLACE FUNCTION public.iris_followup_evento(p_followup uuid, p_tipo text, p_detalhe jsonb DEFAULT '{}'::jsonb, p_texto_id text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_id    uuid;
  v_texto text := nullif(upper(btrim(coalesce(p_texto_id, ''))), '');
begin
  if v_texto is not null and not exists (select 1 from public.iris_textos t where t.id = v_texto) then v_texto := null; end if;
  insert into public.iris_eventos (organizacao_id, conversa_id, etapa, tipo, texto_id, detalhe)
  select f.organizacao_id, f.conversa_id, 'followup', p_tipo, v_texto,
         coalesce(p_detalhe, '{}'::jsonb) || jsonb_build_object('followup_id', f.id)
    from public.iris_followups f
   where f.id = p_followup
  returning id into v_id;
  return v_id;
end
$function$;
CREATE OR REPLACE FUNCTION public.iris_followup_finalizar(p_followup uuid, p_status text, p_motivo text, p_por uuid DEFAULT NULL::uuid, p_msg uuid DEFAULT NULL::uuid)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  f   public.iris_followups%rowtype;
  v_m text := left(nullif(btrim(coalesce(p_motivo, '')), ''), 200);
begin
  if p_status not in ('cliente_deu_sinal', 'encerrado_sem_interesse', 'opt_out', 'concluido_sem_resposta', 'cancelado') then
    raise exception 'status_final_invalido';
  end if;
  select * into f from public.iris_followups where id = p_followup for update;
  if f.id is null or f.status not in ('candidato', 'agendado', 'ativo') then return null; end if;

  update public.iris_followups
     set status = p_status, motivo_fim = v_m, encerrado_em = now(), encerrado_por = p_por,
         sinal_mensagem_id = coalesce(p_msg, sinal_mensagem_id), processando_ate = null
   where id = f.id;
  perform public.iris_followup_evento(f.id, 'followup_' || p_status,
    jsonb_build_object('motivo', v_m, 'mensagem_id', p_msg, 'por', p_por, 'toques_enviados', f.toques_enviados,
                       'status_anterior', f.status));

  if p_status in ('cliente_deu_sinal', 'opt_out', 'encerrado_sem_interesse') then
    perform public.iris_followup_pausar_atendimento(f.id, 'followup_' || p_status);
  end if;
  if p_status in ('opt_out', 'encerrado_sem_interesse') then
    perform public.iris_followup_mover_perdido(f.id);
  end if;

  if p_status = 'cliente_deu_sinal' then
    perform public.iris_followup_notificar(f.id, 'followup_cliente_deu_sinal', 'Cliente deu sinal no follow-up',
      'respondeu. A Iris parou e não vai responder: o atendimento é seu.');
  elsif p_status = 'opt_out' then
    perform public.iris_followup_notificar(f.id, 'followup_opt_out', 'Cliente pediu para parar',
      'pediu para não receber mais mensagens. Follow-up encerrado e card em Perdido (Sem interesse).');
  elsif p_status = 'encerrado_sem_interesse' then
    perform public.iris_followup_notificar(f.id, 'followup_encerrado', 'Cliente encerrou o atendimento',
      'respondeu que pode encerrar. Follow-up encerrado e card em Perdido (Sem interesse).');
  elsif p_status = 'concluido_sem_resposta' then
    perform public.iris_followup_notificar(f.id, 'followup_concluido', 'Follow-up concluído sem resposta',
      'não respondeu aos 3 contatos da Iris. O card ficou onde estava.');
  elsif p_status = 'cancelado' and p_por is null and coalesce(v_m, '') not in ('humano_assumiu', 'limpeza_teste') then
    perform public.iris_followup_notificar(f.id, 'followup_cancelado', 'Follow-up cancelado',
      'o follow-up parou: ' || case v_m
        when 'fechado' then 'o cliente já está fechado'
        when 'nao_elegivel' then 'o cliente ficou não elegível ou perdido'
        when 'irritacao' then 'o cliente mostrou irritação ou pediu para não insistir'
        when 'fora_rs' then 'o cliente é de fora do RS'
        when 'prazo_expirado' then 'passou o prazo sem conseguir enviar os 3 contatos'
        else coalesce(v_m, 'motivo não informado') end || '.');
  end if;
  return p_status;
end
$function$;
CREATE OR REPLACE FUNCTION public.iris_followup_mover_perdido(p_followup uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  f   public.iris_followups%rowtype;
  o   record;
  v_n int := 0;
begin
  select * into f from public.iris_followups where id = p_followup;
  if f.id is null then return 0; end if;
  for o in
    select op.id, (select fc.id from public.funil_colunas fc
                    where fc.funil_id = op.funil_id and fc.resultado = 'perdido' and not coalesce(fc.arquivada, false)
                    order by (lower(btrim(fc.nome)) = 'perdido') desc, fc.ordem
                    limit 1) as col
      from public.oportunidades op
     where op.contato_id = f.contato_id and op.organizacao_id = f.organizacao_id and op.status = 'em_andamento'
  loop
    if o.col is null then continue; end if;
    begin
      update public.oportunidades
         set coluna_id = o.col, motivo_perda = 'sem_interesse', motivo_perda_desc = 'Follow-up da Iris'
       where id = o.id;
      v_n := v_n + 1;
    exception when others then
      perform public.iris_followup_evento(f.id, 'followup_card_falhou', jsonb_build_object('oportunidade_id', o.id, 'erro', left(sqlerrm, 200)));
    end;
  end loop;
  return v_n;
end
$function$;
CREATE OR REPLACE FUNCTION public.iris_followup_notificar(p_followup uuid, p_tipo text, p_titulo text, p_corpo text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  f      public.iris_followups%rowtype;
  v_nome text;
begin
  select * into f from public.iris_followups where id = p_followup;
  if f.id is null then return; end if;
  select ct.nome into v_nome from public.contatos ct where ct.id = f.contato_id;
  -- um aviso por follow-up e tipo: o anterior não lido sai das não lidas
  update public.atd_notificacoes set lida_em = now()
   where lida_em is null and ref_id = f.conversa_id and tipo = p_tipo;
  insert into public.atd_notificacoes (organizacao_id, usuario_id, tipo, titulo, corpo, rota, ref_id)
  values (f.organizacao_id, public.iris_followup_dono(f.conversa_id), p_tipo, p_titulo,
          public.radar_nome_curto(v_nome) || ' · ' || p_corpo,
          '/whatsapp?conversa=' || f.conversa_id, f.conversa_id);
end
$function$;
CREATE OR REPLACE FUNCTION public.iris_followup_pausar_atendimento(p_followup uuid, p_motivo text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  f public.iris_followups%rowtype;
  s record;
  c record;
begin
  select * into f from public.iris_followups where id = p_followup;
  if f.id is null then return; end if;
  for s in
    update public.ia_sessoes x
       set status = 'pausada',
           dados = coalesce(x.dados, '{}'::jsonb) || jsonb_build_object(
             'desativado_manual', true, 'desligado_manual_em', now(), 'desligado_motivo', p_motivo),
           atualizado_em = now()
     where x.contato_id = f.contato_id and x.status = 'ativa'
    returning x.id, x.conversa_id, x.organizacao_id
  loop
    insert into public.ia_eventos (sessao_id, conversa_id, organizacao_id, tipo, detalhe)
    values (s.id, s.conversa_id, s.organizacao_id, 'pausada_followup', jsonb_build_object('motivo', p_motivo, 'followup_id', f.id));
  end loop;
  for c in
    select e.conversa_id from public.bot_conversa_estado e
      join public.conversas cv on cv.id = e.conversa_id
     where cv.contato_id = f.contato_id and not e.pausado
  loop
    perform public.bot_pausar(c.conversa_id, p_motivo);
  end loop;
  -- a fila da IA (bot_mensagens_saida 'pendente') das conversas do cliente sem estado de robô: o mesmo que o
  -- bot_pausar faz na conversa dele — nada que a IA já tinha escrito sai depois do sinal
  update public.bot_mensagens_saida q set status = 'cancelada'
   where q.status = 'pendente'
     and q.conversa_id in (select cv.id from public.conversas cv where cv.contato_id = f.contato_id);
end
$function$;
CREATE OR REPLACE FUNCTION public.iris_followup_texto_parar(p_texto text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce(p_texto, '') ~* (
    '^[^[:alnum:]]*(sair|parar|pare|stop|remover|descadastrar?)[^[:alnum:]]*$'
    || '|par(a|ar|e|em) de (me )?(mandar|enviar|chamar|encher)'
    || '|n[ãa]o (me )?(mande|mandem|manda|envie|enviem|envia|chame|chamem) mais'
    || '|n[ãa]o quero (mais )?(receber|mensage)'
    || '|me (tira|tire|remova|remove) (da|dessa|desta|de sua|da sua) lista'
    || '|sair (d[a-z]+ )?lista'
    || '|descadastr|chega de (mensage|msg|propaganda)')
$function$;
CREATE OR REPLACE FUNCTION public.iris_followup_texto_sim(p_texto text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select char_length(btrim(coalesce(p_texto, ''))) between 1 and 40
     and btrim(coalesce(p_texto, '')) ~* (
       '^[^[:alnum:]]*(sim|isso|quero|pode)([^[:alnum:]]+(sim|pode|parar|encerrar|isso|quero|obrigad[oa]|por favor))*[^[:alnum:]]*$')
$function$;
CREATE OR REPLACE FUNCTION public.iris_horario_comercial(p_agora timestamp with time zone)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select public.iris_dia_util(x.l::date) and x.l::time >= time '09:00' and x.l::time < time '18:00'
    from (select p_agora at time zone 'America/Sao_Paulo' as l) x
$function$;
CREATE OR REPLACE FUNCTION public.iris_limpo_em(p_contato uuid)
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select max(l.limpo_em) from public.iris_teste_limpezas l where l.contato_id = p_contato
$function$;
CREATE OR REPLACE FUNCTION public.iris_monitor_alertar_critico()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_cli text;
begin
  begin
    if new.conversa_id is not null and exists (
         select 1 from public.iris_monitor_achados a
          where a.conversa_id = new.conversa_id and a.subcategoria = new.subcategoria and a.id <> new.id
            and a.alertado_em > now() - interval '30 minutes') then
      return null;
    end if;
    select ct.nome into v_cli
      from public.conversas c left join public.contatos ct on ct.id = c.contato_id
     where c.id = new.conversa_id;
    insert into public.atd_notificacoes (organizacao_id, usuario_id, tipo, titulo, corpo, rota, ref_id)
    select new.organizacao_id, d.usuario_id, 'iris_critico', 'Iris: alerta crítico',
           left(case when new.conversa_id is not null then public.radar_nome_curto(v_cli) || ' · ' else '' end
                || public.iris_monitor_rotulo(new.subcategoria)
                || case when new.origem = 'guarda' then ' (barrado antes de sair)' else '' end
                || ' · "' || left(new.evidencia, 120) || '"', 400),
           case when new.conversa_id is not null then '/whatsapp?conversa=' || new.conversa_id else '/qualidade-iris' end,
           new.id
      from public.iris_monitor_destinatarios(new.organizacao_id) d(usuario_id);
    update public.iris_monitor_achados set alertado_em = now() where id = new.id;
  exception when others then
    raise warning 'iris_monitor: alerta do achado % falhou — %', new.id, sqlerrm;
  end;
  return null;
end
$function$;
CREATE OR REPLACE FUNCTION public.iris_monitor_categoria_guarda(p_categoria text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select case coalesce(p_categoria, '')
    when 'pedido_credencial' then 'comercial'
    when 'pedido_pagamento'  then 'comercial'
    else 'alucinacao' end   -- consulta_fingida, documento_aprovado, aprovacao, garantia, promessa_recebimento,
                            -- promessa_ligacao, recibo_falso e qualquer outra: invenção/promessa (R11)
$function$;
CREATE OR REPLACE FUNCTION public.iris_monitor_de_guarda()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  begin
    perform public.iris_monitor_inserir(new.organizacao_id, null, public.iris_monitor_guarda_json(new.id));
  exception when others then
    raise warning 'iris_monitor: guarda % sem achado — %', new.id, sqlerrm;
  end;
  return null;
end
$function$;
CREATE OR REPLACE FUNCTION public.iris_monitor_destinatarios(p_org uuid)
 RETURNS SETOF uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if to_regclass('public.bom_dia_gestores') is null then
    return query select ou.usuario_id from public.organizacao_usuarios ou
                  where ou.organizacao_id = p_org and ou.papel::text = 'admin' and ou.status::text = 'ativo';
  else
    return query execute
      'select ou.usuario_id from public.organizacao_usuarios ou
        where ou.organizacao_id = $1 and ou.papel::text = ''admin'' and ou.status::text = ''ativo''
          and not exists (select 1 from public.bom_dia_gestores g where g.organizacao_id = $1 and g.usuario_id = ou.usuario_id)'
      using p_org;
  end if;
end
$function$;
CREATE OR REPLACE FUNCTION public.iris_monitor_evento(p_conversa uuid, p_tipo text, p_detalhe jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if p_conversa is null or p_tipo !~ '^monitor_[a-z0-9_]{1,60}$' then return; end if;
  insert into public.iris_eventos (organizacao_id, conversa_id, etapa, tipo, texto_id, detalhe)
  select c.organizacao_id, c.id, null, p_tipo, null, coalesce(p_detalhe, '{}'::jsonb)
    from public.conversas c where c.id = p_conversa;
exception when others then
  raise warning 'iris_monitor_evento: % na conversa % — %', p_tipo, p_conversa, sqlerrm;
end
$function$;
CREATE OR REPLACE FUNCTION public.iris_monitor_guarda_json(p_evento uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select jsonb_build_object(
           'origem', 'guarda',
           'categoria', public.iris_monitor_categoria_guarda(e.detalhe ->> 'categoria'),
           'subcategoria', coalesce(nullif(lower(regexp_replace(coalesce(e.detalhe ->> 'categoria', ''), '[^a-zA-Z0-9_]+', '_', 'g')), ''), 'guarda'),
           'gravidade', 'critica',
           'conversa_id', e.conversa_id,
           'evento_id', e.id,
           'evidencia', coalesce(nullif(btrim(e.detalhe ->> 'trecho'), ''),
                                 '(trecho não registrado) violação ' || coalesce(e.detalhe ->> 'violacao', e.detalhe ->> 'categoria', '?')),
           'regra_violada', 'Guarda da Iris (R11/N1): ' || public.iris_monitor_rotulo(e.detalhe ->> 'categoria')
                            || '. O texto foi barrado antes de sair.',
           'sugestao', 'Ver a conversa e o que a Iris mandou no lugar. Se a guarda barra isto com frequência, o prompt '
                       || 'precisa de ajuste.',
           'chave', 'guarda:' || e.id)
    from public.iris_eventos e
   where e.id = p_evento and e.tipo = 'guarda_critica'
$function$;
CREATE OR REPLACE FUNCTION public.iris_monitor_inserir(p_org uuid, p_ciclo uuid, p_a jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_orig  text := lower(btrim(coalesce(p_a ->> 'origem', '')));
  v_cat   text := lower(btrim(coalesce(p_a ->> 'categoria', '')));
  v_grav  text := lower(btrim(coalesce(p_a ->> 'gravidade', '')));
  v_sub   text;
  v_ev    text := left(btrim(coalesce(p_a ->> 'evidencia', '')), 600);
  v_conv  uuid;
  v_msg   uuid;
  v_evt   uuid;
  v_id    uuid;
begin
  if p_org is null or jsonb_typeof(p_a) is distinct from 'object' then return null; end if;
  if v_orig not in ('guarda', 'operacional', 'auditor')
     or v_cat not in ('alucinacao', 'comercial', 'contexto', 'operacional', 'qualidade')
     or v_grav not in ('critica', 'alta', 'media', 'baixa') or v_ev = '' then
    return null;
  end if;
  v_sub := left(btrim(regexp_replace(lower(coalesce(p_a ->> 'subcategoria', '')), '[^a-z0-9_]+', '_', 'g'), '_'), 60);
  if v_sub = '' then v_sub := v_cat; end if;
  -- a conversa tem de ser da organização; a mensagem, da conversa (senão fica sem mensagem)
  if nullif(p_a ->> 'conversa_id', '') is not null then
    begin
      v_conv := (p_a ->> 'conversa_id')::uuid;
    exception when others then return null;
    end;
    if not exists (select 1 from public.conversas c where c.id = v_conv and c.organizacao_id = p_org) then return null; end if;
  end if;
  if nullif(p_a ->> 'mensagem_id', '') is not null and v_conv is not null then
    begin
      v_msg := (p_a ->> 'mensagem_id')::uuid;
    exception when others then v_msg := null;
    end;
    if v_msg is not null and not exists (select 1 from public.mensagens m where m.id = v_msg and m.conversa_id = v_conv) then
      v_msg := null;
    end if;
  end if;
  if nullif(p_a ->> 'evento_id', '') is not null then
    begin
      v_evt := (p_a ->> 'evento_id')::uuid;
    exception when others then v_evt := null;
    end;
  end if;

  insert into public.iris_monitor_achados (organizacao_id, ciclo_id, conversa_id, mensagem_id, evento_id, origem, categoria,
                                           subcategoria, gravidade, evidencia, regra_violada, sugestao, regra_sugerida, chave)
  values (p_org, p_ciclo, v_conv, v_msg, v_evt, v_orig, v_cat, v_sub, v_grav, v_ev,
          nullif(left(btrim(coalesce(p_a ->> 'regra_violada', '')), 300), ''),
          nullif(left(btrim(coalesce(p_a ->> 'sugestao', '')), 600), ''),
          nullif(left(btrim(coalesce(p_a ->> 'regra_sugerida', '')), 400), ''),
          nullif(left(btrim(coalesce(p_a ->> 'chave', '')), 200), ''))
  on conflict (organizacao_id, chave) where chave is not null do nothing
  returning id into v_id;

  if v_id is not null and v_conv is not null and v_orig <> 'guarda' then
    perform public.iris_monitor_evento(v_conv, 'monitor_achado', jsonb_build_object(
      'achado_id', v_id, 'origem', v_orig, 'categoria', v_cat, 'subcategoria', v_sub, 'gravidade', v_grav));
  end if;
  return v_id;
end
$function$;
CREATE OR REPLACE FUNCTION public.iris_monitor_rotulo(p_sub text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select case coalesce(p_sub, '')
    when 'consulta_fingida'           then 'fingiu consulta'
    when 'documento_aprovado'         then 'disse que o documento foi aprovado'
    when 'aprovacao'                  then 'falou em aprovação'
    when 'garantia'                   then 'garantiu resultado'
    when 'promessa_recebimento'       then 'prometeu dinheiro'
    when 'pedido_credencial'          then 'pediu senha ou código'
    when 'pedido_pagamento'           then 'falou em pagamento, PIX ou repasse'
    when 'promessa_ligacao'           then 'prometeu ligação'
    when 'recibo_falso'               then 'disse que recebeu documento que não chegou'
    when 'ia_com_humano_ativo'        then 'IA escreveu com atendente na conversa'
    when 'ia_com_precisa_humano'      then 'IA escreveu com a conversa passada para a equipe'
    when 'mensagem_apos_optout'       then 'mensagem depois do pedido para parar'
    when 'followup_apos_resposta'     then 'follow-up depois de o cliente responder'
    when 'followup_com_humano'        then 'follow-up com atendente na conversa'
    when 'followup_apos_encerramento' then 'follow-up depois de encerrado'
    when 'mensagem_duplicada'         then 'mensagem duplicada'
    when 'repetiu_mensagem'           then 'repetiu a mesma mensagem'
    when 'ligacao_sem_aviso'          then 'retorno marcado sem aviso ao atendente'
    when 'interessado_sem_aviso'      then 'interessado sem aviso ao atendente'
    when 'humano_sem_resposta'        then 'equipe sem responder há mais de 2 h úteis'
    when 'envio_falhou_repetido'      then 'envio falhando na conversa'
    when 'envio_falhando_no_numero'   then 'envio falhando no número'
    else replace(coalesce(p_sub, ''), '_', ' ') end
$function$;
CREATE OR REPLACE FUNCTION public.iris_motivo_nao_tocar(p_conversa uuid, p_etapa text, p_tipo text, p_agora timestamp with time zone DEFAULT now())
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  c           record;
  v_etapa     text := nullif(btrim(coalesce(p_etapa, '')), '');
  v_ciclo     timestamptz;
  v_corte     timestamptz;
  v_ult_cli   timestamptz;
  v_canal     record;
begin
  if p_tipo is null or p_tipo not in ('retomada', 'recuperacao', 'audio', 'objecao', 'agendamento') then
    return 'tipo_invalido';
  end if;
  select cv.id, cv.organizacao_id, cv.contato_id, cv.status::text as status, cv.arquivada_em,
         coalesce(cv.precisa_humano, false) as precisa_humano, coalesce(cv.canal_preso_id, cv.canal_id) as canal_id
    into c
    from public.conversas cv
   where cv.id = p_conversa;
  if not found then return 'conversa_inexistente'; end if;
  v_corte := coalesce(public.iris_corte_limpeza(c.contato_id), '-infinity'::timestamptz);
  v_ciclo := greatest(coalesce(public.emprestimo_pos_fluxo_ciclo_inicio(c.contato_id, p_agora), '-infinity'::timestamptz), v_corte);

  -- ---- NUNCA
  if not public.iris_ativa_na_conversa(c.id) then return 'iris_desligada'; end if;
  if exists (select 1 from public.atd_wa_optout w where w.contato_id = c.contato_id) then return 'optout'; end if;
  if exists (select 1 from public.conversas cv2
               join public.mensagens m on m.conversa_id = cv2.id
              where cv2.contato_id = c.contato_id and m.direcao = 'entrada' and m.tipo = 'texto'
                and m.criado_em > p_agora - interval '7 days' and m.criado_em <= p_agora
                and m.criado_em > v_corte
                and public.iris_texto_irritado(m.conteudo)) then
    return 'irritacao';
  end if;
  if exists (select 1 from public.oportunidades o where o.contato_id = c.contato_id and o.status = 'ganho')
     or exists (select 1 from public.adm_fechados af where af.contato_id = c.contato_id)
     or public.adm_saiu_do_fechado(c.contato_id) then
    return 'fechado';
  end if;
  if (not exists (select 1 from public.oportunidades o where o.contato_id = c.contato_id and o.status = 'em_andamento')
      and exists (select 1 from public.oportunidades o where o.contato_id = c.contato_id
                     and o.status in ('perdido', 'cancelado')))
     or exists (select 1 from public.ia_sessoes s where s.conversa_id = c.id and s.dados ? 'ne_origem') then
    return 'nao_elegivel';
  end if;
  if public.fn_ddd_fora_rs(c.contato_id) then return 'fora_rs'; end if;

  -- ---- retomada
  if p_tipo = 'retomada' then
    if v_etapa is null then return 'etapa_vazia'; end if;
    if c.status in ('fechada', 'resolvida') or c.arquivada_em is not null then return 'conversa_fechada'; end if;
    if not exists (select 1 from public.mensagens mi
                    where mi.conversa_id = c.id and mi.direcao = 'entrada' and mi.criado_em > v_ciclo and mi.criado_em <= p_agora
                      and (mi.metadados ? 'formulario'
                           or exists (select 1 from public.mensagens mo
                                       where mo.conversa_id = c.id and mo.direcao = 'saida' and mo.criado_em > v_ciclo
                                         and mo.criado_em < mi.criado_em and mo.tipo::text not in ('sistema', 'nota_interna')))) then
      return 'nunca_respondeu';
    end if;
    if exists (select 1 from public.ia_sessoes s where s.conversa_id = c.id
                  and s.dados ->> 'aguardando_humano' = 'representacao') then
      return 'representacao';
    end if;
    if public.ia_familia_pendente_em(c.id, p_agora) is not null then return 'familia_pendente'; end if;
    if exists (select 1 from public.conversa_etiquetas ce join public.etiquetas e on e.id = ce.etiqueta_id
                where ce.conversa_id = c.id and e.nome = 'PROVÁVEL NÃO ELEGÍVEL') then
      return 'provavel_nao_elegivel';
    end if;
    if c.precisa_humano or exists (
         select 1 from public.mensagens m
          where m.conversa_id = c.id and m.direcao = 'saida' and m.criado_em > v_ciclo
            and ((m.autor_id is not null and m.tipo::text not in ('sistema', 'nota_interna'))
                 or (m.autor_id is null and m.origem = 'telefone'))) then
      return 'humano_atendendo';
    end if;
    if exists (select 1 from public.ia_sessoes s where s.conversa_id = c.id and s.dados ->> 'recusou' = 'true')
       or exists (select 1 from public.iris_eventos e where e.conversa_id = c.id and e.tipo = 'recuperacao'
                     and e.criado_em > v_ciclo)
       or exists (select 1 from public.conversas cv2
                    join public.mensagens m on m.conversa_id = cv2.id
                   where cv2.contato_id = c.contato_id and m.direcao = 'entrada' and m.tipo = 'texto'
                     and m.criado_em > p_agora - interval '7 days' and m.criado_em <= p_agora
                     and m.criado_em > v_corte
                     and public.iris_texto_recusa(m.conteudo))
       or exists (select 1 from public.mensagens m
                   where m.conversa_id = c.id and m.direcao = 'saida' and m.origem = 'bot' and m.tipo = 'texto'
                     and m.criado_em > p_agora - interval '7 days' and m.criado_em <= p_agora
                     and m.criado_em > v_corte
                     and public.iris_texto_bot_recusa(m.conteudo)) then
      return 'recusou';
    end if;
    if (select count(*) from public.iris_eventos e
         where e.conversa_id = c.id and e.tipo = 'retomada' and e.etapa = v_etapa and e.criado_em > v_ciclo) >= 2 then
      return 'retomadas_da_etapa';
    end if;
    select k.status_integracao::text as st, coalesce(k.envio_restrito, false) as restrito, k.health_check_status as hc
      into v_canal
      from public.canais k
     where k.id = c.canal_id;
    if not found then return 'canal_indisponivel'; end if;
    if v_canal.st is distinct from 'conectado' or v_canal.restrito or v_canal.hc in ('restrito', 'falha') then
      return 'canal_indisponivel';
    end if;
    if not public.iris_horario_comercial(p_agora) then return 'fora_do_horario'; end if;
    if not public.toque_automatico_permitido(c.contato_id)
       or (select count(*) from public.iris_eventos e join public.conversas cv2 on cv2.id = e.conversa_id
            where cv2.contato_id = c.contato_id and e.tipo = 'retomada' and e.criado_em > v_corte
              and e.criado_em > p_agora - interval '24 hours' and e.criado_em < p_agora + interval '24 hours') >= 1
       or (select count(*) from public.iris_eventos e join public.conversas cv2 on cv2.id = e.conversa_id
            where cv2.contato_id = c.contato_id and e.tipo = 'retomada' and e.criado_em > v_corte
              and e.criado_em > p_agora - interval '7 days' and e.criado_em < p_agora + interval '7 days') >= 3 then
      return 'teto_toques';
    end if;
    return null;
  end if;

  -- ---- recuperação
  if p_tipo = 'recuperacao' then
    if exists (select 1 from public.ia_sessoes s where s.conversa_id = c.id
                  and s.dados ->> 'aguardando_humano' = 'representacao') then
      return 'representacao';
    end if;
    if c.precisa_humano or exists (
         select 1 from public.mensagens m
          where m.conversa_id = c.id and m.direcao = 'saida' and m.criado_em > v_ciclo
            and ((m.autor_id is not null and m.tipo::text not in ('sistema', 'nota_interna'))
                 or (m.autor_id is null and m.origem = 'telefone'))) then
      return 'humano_atendendo';
    end if;
    if exists (select 1 from public.iris_eventos e where e.conversa_id = c.id and e.tipo = 'recuperacao'
                  and e.criado_em > v_ciclo) then
      return 'recuperacao_feita';
    end if;
    return null;
  end if;

  -- ---- áudio: nunca 2 seguidos sem o cliente responder (depois da limpeza)
  if p_tipo = 'audio' then
    select max(m.criado_em) into v_ult_cli
      from public.mensagens m
     where m.conversa_id = c.id and m.direcao = 'entrada' and m.criado_em <= p_agora;
    v_ult_cli := greatest(coalesce(v_ult_cli, '-infinity'::timestamptz), v_corte);
    if exists (select 1 from public.iris_eventos e
                 left join public.iris_textos t on t.id = e.texto_id
                where e.conversa_id = c.id and e.criado_em > v_ult_cli
                  and (e.tipo = 'audio' or t.tipo = 'audio'))
       or exists (select 1 from public.mensagens m
                   where m.conversa_id = c.id and m.direcao = 'saida' and m.tipo = 'audio'
                     and m.criado_em > v_ult_cli and m.criado_em <= p_agora
                     and coalesce(m.status::text, '') <> 'falhou') then
      return 'audio_seguido';
    end if;
    return null;
  end if;

  -- ---- objeção: até 2 argumentos na mesma objeção (no ciclo, depois da limpeza)
  if p_tipo = 'objecao' then
    if v_etapa is null then return 'etapa_vazia'; end if;
    if (select count(*) from public.iris_eventos e
         where e.conversa_id = c.id and e.tipo = 'objecao' and e.etapa = v_etapa and e.criado_em > v_ciclo) >= 2 then
      return 'objecao_esgotada';
    end if;
    return null;
  end if;

  return null;   -- agendamento: só o NUNCA
end
$function$;
CREATE OR REPLACE FUNCTION public.iris_numero_teste(p_canal uuid, p_telefone text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce((
    select exists (select 1 from unnest(b.numeros_teste) n
                    where public.chave_canonica_telefone(n) = public.chave_canonica_telefone(p_telefone)
                      and char_length(public.chave_canonica_telefone(p_telefone)) >= 10)
      from public.bot_canal_config b
     where b.canal_id = p_canal), false)
$function$;
CREATE OR REPLACE FUNCTION public.iris_pode_tocar(p_conversa uuid, p_etapa text, p_tipo text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select public.iris_motivo_nao_tocar(p_conversa, p_etapa, p_tipo, now()) is null
$function$;
CREATE OR REPLACE FUNCTION public.iris_pode_ver()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ select exists (select 1 from public.iris_acesso where user_id = auth.uid()) $function$;
CREATE OR REPLACE FUNCTION public.iris_registrar_evento(p_conversa uuid, p_etapa text, p_tipo text, p_texto_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_org   uuid;
  v_texto text := nullif(upper(btrim(coalesce(p_texto_id, ''))), '');
  v_etapa text := nullif(left(btrim(coalesce(p_etapa, '')), 60), '');
  v_id    uuid;
begin
  if p_tipo is null or p_tipo not in ('retomada', 'recuperacao', 'audio', 'objecao', 'agendamento') then
    return jsonb_build_object('erro', 'tipo_invalido');
  end if;
  select c.organizacao_id into v_org from public.conversas c where c.id = p_conversa;
  if v_org is null then return jsonb_build_object('erro', 'conversa_nao_encontrada'); end if;
  -- objeção: a IA manda o CÓDIGO da objeção em p_texto_id ('O5', ia-sdr) — ele é a etapa da objeção (o teto de 2
  -- argumentos conta por objeção, iris_motivo_nao_tocar 'objecao'), não um texto de iris_textos
  if p_tipo = 'objecao' and v_texto ~ '^O[0-9]{1,2}$' then
    v_etapa := v_texto;
    v_texto := null;
  end if;
  if v_texto is not null and not exists (select 1 from public.iris_textos t where t.id = v_texto) then
    return jsonb_build_object('erro', 'texto_desconhecido');
  end if;
  insert into public.iris_eventos (organizacao_id, conversa_id, etapa, tipo, texto_id)
  values (v_org, p_conversa, v_etapa, p_tipo, v_texto)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end
$function$;
CREATE OR REPLACE FUNCTION public.iris_teste_limpar(p_contato uuid, p_canal uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_org         uuid;
  v_canal_ok    boolean;
  v_ativo       boolean;
  v_tel         text;
  v_conv        uuid;          -- a conversa mais recente do contato (a do /clean)
  v_conversas   uuid[];
  v_ligs        uuid[];
  v_lembs       uuid[];
  v_limpo       timestamptz := now();
  -- quem pediu: pela API (o webhook, com a service key: PostgREST põe request.jwt.claims) ou direto no banco (o 11 da subida)
  v_por         text := case when nullif(current_setting('request.jwt.claims', true), '') is not null
                             then 'clean_whatsapp' else 'clean_sql' end;
  n_lig         int := 0;
  n_lemb        int := 0;
  n_sessoes     int := 0;
  n_fila        int := 0;
  n_agendadas   int := 0;
  n_robo        int := 0;
  n_followups   int := 0;
  n_fechadas    int := 0;
  n_humano      int := 0;
  n_sla         int := 0;
  n_avisos      int := 0;
  n_sino        int := 0;
  n_optout      int := 0;
  v_card        jsonb := jsonb_build_object('acao', 'sem_card');
  v_pulados     text[] := '{}';
  v_f           uuid;
  v_o           record;
  v_entrada     uuid;
  v_res_antigo  text;
  v_det         jsonb;
begin
  if p_contato is null or p_canal is null then
    return jsonb_build_object('ok', false, 'erro', 'parametros');
  end if;
  select ct.organizacao_id into v_org from public.contatos ct where ct.id = p_contato;
  if v_org is null then return jsonb_build_object('ok', false, 'erro', 'contato_nao_encontrado'); end if;
  select true, coalesce(b.iris_config -> 'ativo' = 'true'::jsonb, false)
    into v_canal_ok, v_ativo
    from public.bot_canal_config b
   where b.canal_id = p_canal and b.organizacao_id = v_org;
  if not coalesce(v_canal_ok, false) then return jsonb_build_object('ok', false, 'erro', 'canal_nao_encontrado'); end if;

  -- o telefone que conta é o PRINCIPAL do contato (a mesma régua de iris_ativa_na_conversa: um número de teste guardado
  -- como identidade secundária de um cliente real não libera o cliente real)
  select ci.valor_normalizado into v_tel
    from public.contato_identidades ci
   where ci.contato_id = p_contato and ci.tipo = 'whatsapp' and ci.valor_normalizado is not null
   order by ci.principal desc
   limit 1;
  select c.id into v_conv from public.conversas c where c.contato_id = p_contato order by c.criado_em desc limit 1;

  if not v_ativo or not public.iris_numero_teste(p_canal, v_tel) then
    if v_conv is not null then
      perform public.iris_teste_registrar_negado(v_conv, p_canal,
        case when not v_ativo then 'iris_desligada' else 'nao_e_numero_teste' end);
    end if;
    return jsonb_build_object('ok', false, 'erro', case when not v_ativo then 'iris_desligada' else 'nao_e_numero_teste' end);
  end if;

  -- dois /clean seguidos do mesmo contato: um de cada vez
  perform pg_advisory_xact_lock(hashtextextended('iris_teste_limpar:' || p_contato::text, 0));

  select coalesce(array_agg(c.id), '{}') into v_conversas from public.conversas c where c.contato_id = p_contato;

  -- (1) a ligação marcada e o lembrete dela (o que fazia o 11-recomecar-teste.sql)
  with l as (
    update public.ligacoes_marcadas
       set status = 'cancelada', status_em = now()
     where contato_id = p_contato and status = 'marcada'
    returning id, lembrete_id
  )
  select coalesce(array_agg(l.id), '{}'), coalesce(array_agg(l.lembrete_id) filter (where l.lembrete_id is not null), '{}')
    into v_ligs, v_lembs
    from l;
  n_lig := coalesce(array_length(v_ligs, 1), 0);
  update public.assistente_lembretes set status = 'cancelado'
   where id = any(v_lembs) and status in ('pendente', 'avisado');
  get diagnostics n_lemb = row_count;

  -- (2) a sessão da IA (nenhuma retomada sai numa conversa fechada)
  update public.ia_sessoes
     set status = 'encerrada', processar_apos = null, atualizado_em = now(),
         dados = coalesce(dados, '{}'::jsonb) || jsonb_build_object('encerrada_por', 'iris_teste_clean', 'encerrada_em', now())
   where contato_id = p_contato and status <> 'encerrada';
  get diagnostics n_sessoes = row_count;

  -- (3) a fila de saída do robô/IA que ainda não saiu
  update public.bot_mensagens_saida set status = 'cancelada'
   where conversa_id = any(v_conversas) and status in ('pendente', 'agendada');
  get diagnostics n_fila = row_count;

  -- (4) o robô volta ao começo (os valores do padrão da tabela: etapa inicial, dados zerados, sem pausa)
  update public.bot_conversa_estado
     set etapa = default, dados_qualificacao = default, pausado = false, motivo_pausa = null, reprompts = default,
         lead_quente = default, lead_quente_motivos = default, resumo = null, concluido_em = null,
         processando_ate = null, ultimo_inbound_msg_id = null, ultima_atividade_em = now()
   where conversa_id = any(v_conversas) or contato_id = p_contato;
  get diagnostics n_robo = row_count;

  -- (5) o follow-up aberto (frente FOLLOWUP; tolerante: sem a tabela, pula). 'limpeza_teste' = sem aviso no sino.
  if to_regclass('public.iris_followups') is not null then
    if to_regprocedure('public.iris_followup_finalizar(uuid, text, text, uuid, uuid)') is not null then
      for v_f in execute
        'select id from public.iris_followups where contato_id = $1 and status in (''candidato'', ''agendado'', ''ativo'')'
        using p_contato
      loop
        execute 'select public.iris_followup_finalizar($1, ''cancelado'', ''limpeza_teste'', null, null)' using v_f;
        n_followups := n_followups + 1;
      end loop;
    else
      execute 'with u as (update public.iris_followups set status = ''cancelado''
                           where contato_id = $1 and status in (''candidato'', ''agendado'', ''ativo'') returning 1)
               select count(*) from u'
        into n_followups using p_contato;
    end if;
  else
    v_pulados := v_pulados || 'iris_followups'::text;
  end if;

  -- (6) o card volta para a entrada (Lead Novo). Fechado (ganho / administrativo) não é mexido.
  if exists (select 1 from public.oportunidades o where o.contato_id = p_contato and o.status = 'ganho')
     or (to_regclass('public.adm_fechados') is not null
         and exists (select 1 from public.adm_fechados af where af.contato_id = p_contato)) then
    v_card := jsonb_build_object('acao', 'mantido_cliente_fechado');
  else
    if exists (select 1 from public.oportunidades o where o.contato_id = p_contato and o.status = 'em_andamento') then
      v_card := jsonb_build_object('acao', 'voltou_para_entrada', 'cards', '[]'::jsonb);
      for v_o in
        select o.id, o.funil_id, o.coluna_id from public.oportunidades o
         where o.contato_id = p_contato and o.status = 'em_andamento'
         order by o.criado_em desc
      loop
        select fc.id into v_entrada from public.funil_colunas fc
         where fc.funil_id = v_o.funil_id and fc.entrada and not fc.arquivada
         order by fc.ordem limit 1;
        select coalesce(fc.resultado, 'neutro') into v_res_antigo from public.funil_colunas fc where fc.id = v_o.coluna_id;
        update public.oportunidades
           set coluna_id = coalesce(v_entrada, coluna_id),
               motivo_nao_elegivel = null,
               etiquetas = array_remove(coalesce(etiquetas, '{}'::text[]), 'nao_elegivel'),
               motivo_reabertura = case when coalesce(v_res_antigo, 'neutro') in ('ganho', 'perdido')
                                        then 'Limpeza do número de teste (/clean)' else motivo_reabertura end
         where id = v_o.id;
        v_card := jsonb_set(v_card, '{cards}', (v_card -> 'cards') || jsonb_build_object(
          'id', v_o.id, 'coluna_antes', v_o.coluna_id, 'coluna_depois', coalesce(v_entrada, v_o.coluna_id),
          'sem_coluna_de_entrada', v_entrada is null));
      end loop;
    else
      select o.id, o.funil_id, o.coluna_id, o.status::text as status into v_o
        from public.oportunidades o
       where o.contato_id = p_contato and o.status::text in ('perdido', 'cancelado')
       order by o.criado_em desc limit 1;
      if v_o.id is not null then
        select fc.id into v_entrada from public.funil_colunas fc
         where fc.funil_id = v_o.funil_id and fc.entrada and not fc.arquivada
         order by fc.ordem limit 1;
        if v_entrada is null then
          v_card := jsonb_build_object('acao', 'sem_coluna_de_entrada', 'id', v_o.id);
        else
          select coalesce(fc.resultado, 'neutro') into v_res_antigo from public.funil_colunas fc where fc.id = v_o.coluna_id;
          update public.oportunidades
             set coluna_id = v_entrada, status = 'em_andamento', fechado_em = null, fechado_por_id = null,
                 responsavel_no_fechamento_id = null, motivo_perda = null, motivo_perda_desc = null,
                 motivo_nao_elegivel = null,
                 etiquetas = array_remove(coalesce(etiquetas, '{}'::text[]), 'nao_elegivel'),
                 motivo_reabertura = case when coalesce(v_res_antigo, 'neutro') in ('ganho', 'perdido')
                                          then 'Limpeza do número de teste (/clean)' else null end
           where id = v_o.id;
          v_card := jsonb_build_object('acao', 'reaberto_na_entrada', 'id', v_o.id, 'status_antes', v_o.status,
                                       'coluna_antes', v_o.coluna_id, 'coluna_depois', v_entrada);
        end if;
      end if;
    end if;
  end if;

  -- (7) as conversas: ninguém "precisando de humano" e todas fechadas (a próxima mensagem abre uma conversa nova)
  update public.conversas set precisa_humano = false, precisa_humano_motivo = null, precisa_humano_em = null
   where contato_id = p_contato and precisa_humano;
  get diagnostics n_humano = row_count;
  update public.conversas set status = 'fechada'
   where contato_id = p_contato and status <> 'fechada';
  get diagnostics n_fechadas = row_count;

  -- (8) avisos da equipe sobre essas conversas (tolerante: tabela ausente ou diferente → pula e conta em "pulados")
  if to_regclass('public.sla_alertas') is not null then
    begin
      execute 'update public.sla_alertas set resolvido_em = now(), resolucao = ''teste_clean'', atualizado_em = now()
                where resolvido_em is null and conversa_id = any($1)' using v_conversas;
      get diagnostics n_sla = row_count;
    exception when others then v_pulados := v_pulados || 'sla_alertas'::text;
    end;
  end if;
  if to_regclass('public.avisos_passado_humano') is not null then
    begin
      execute 'update public.avisos_passado_humano set descartado_em = now()
                where enviado_em is null and descartado_em is null and conversa_id = any($1)' using v_conversas;
      get diagnostics n_avisos = row_count;
    exception when others then v_pulados := v_pulados || 'avisos_passado_humano'::text;
    end;
  end if;
  update public.atd_notificacoes set lida_em = now()
   where lida_em is null
     and ((tipo = 'lembrete' and ref_id = any(v_lembs))
          or (tipo in ('ligacao_marcada', 'retorno_mensagem') and ref_id = any(v_ligs))
          or (tipo like 'followup\_%' and ref_id = any(v_conversas)));
  get diagnostics n_sino = row_count;

  -- (9) mensagens agendadas que ainda não saíram (tolerante: um gatilho da tabela que recuse não derruba a limpeza)
  begin
    update public.mensagens_agendadas set status = 'cancelada', cancelada_em = now()
     where contato_id = p_contato and status = 'agendada';
    get diagnostics n_agendadas = row_count;
  exception when others then v_pulados := v_pulados || 'mensagens_agendadas'::text;
  end;

  -- (10) o opt-out que o TESTE grava ("pare de me mandar" → 'sair_texto'); o da Meta (131050 / user_preferences) e o
  --      manual ficam
  delete from public.atd_wa_optout where contato_id = p_contato and motivo = 'sair_texto';
  get diagnostics n_optout = row_count;

  v_det := jsonb_build_object(
    'canal_id', p_canal, 'conversas_fechadas', n_fechadas, 'sessoes_encerradas', n_sessoes,
    'ligacoes_canceladas', n_lig, 'lembretes_cancelados', n_lemb, 'fila_cancelada', n_fila,
    'robo_reiniciado', n_robo, 'followups_cancelados', n_followups, 'card', v_card,
    'precisa_humano_limpo', n_humano, 'alertas_resolvidos', n_sla, 'avisos_descartados', n_avisos,
    'sino_lido', n_sino, 'agendadas_canceladas', n_agendadas, 'optout_removido', n_optout,
    'pulados', to_jsonb(v_pulados), 'por', v_por);

  insert into public.iris_teste_limpezas (contato_id, limpo_em, por, organizacao_id, canal_id, conversa_id, detalhe)
  values (p_contato, v_limpo, v_por, v_org, p_canal, v_conv, v_det);
  if v_conv is not null then
    insert into public.iris_eventos (organizacao_id, conversa_id, etapa, tipo, texto_id, detalhe)
    values (v_org, v_conv, null, 'teste_clean', null, v_det);
  end if;

  return jsonb_build_object('ok', true, 'limpo_em', v_limpo, 'conversa_id', v_conv) || v_det;
end
$function$;
CREATE OR REPLACE FUNCTION public.iris_teste_registrar_negado(p_conversa uuid, p_canal uuid, p_motivo text DEFAULT 'nao_e_numero_teste'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_org uuid;
  v_id  uuid;
begin
  select c.organizacao_id into v_org from public.conversas c where c.id = p_conversa;
  if v_org is null then return jsonb_build_object('erro', 'conversa_nao_encontrada'); end if;
  insert into public.iris_eventos (organizacao_id, conversa_id, etapa, tipo, texto_id, detalhe)
  values (v_org, p_conversa, null, 'teste_clean_negado', null,
          jsonb_build_object('canal_id', p_canal,
                             'motivo', left(coalesce(nullif(btrim(coalesce(p_motivo, '')), ''), 'nao_e_numero_teste'), 60)))
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end
$function$;
CREATE OR REPLACE FUNCTION public.iris_texto_bot_recusa(p_texto text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce(p_texto, '') ~* '(n[ãa]o vou insistir|respeit\w* (muito )?(a )?sua (decis|vontade)|se mudar de ideia|j[áa] cancelei)'
$function$;
CREATE OR REPLACE FUNCTION public.iris_texto_irritado(p_texto text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce(p_texto, '') ~* (
    'den[uú]nc|golpista|procon|pol[íi]cia'
    || '|\m(é|e|isso é|isso e|voc[êe]s s[ãa]o|parece|s[óo] pode ser) (um )?golpe'
    || '|\mpar(a|e|em|ar) de (me )?(mandar|chamar|ligar|encher)'
    || '|chega de|n[ãa]o me (mande|chame|ligue|perturb)'
    || '|sair da lista|me tir(a|e) (d[aeo]s? |dess[ae]s? )?(lista|grupo|contatos?|cadastro)'
    || '|\mme tir(a|e|em) (d[aeo]s?|dess[ae]s?|dest[ae]s?|disso|daqui|da[ií])\M(?!\s+d[úu]vidas?)'
    || '|vou (te |lhes? )?bloquear|n[ãa]o (me )?insist'
    || '|^\W*(sair|parar|pare|stop)\W*$')
$function$;
CREATE OR REPLACE FUNCTION public.iris_texto_recusa(p_texto text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce(p_texto, '') ~* (
    '\mdesist|deixa (pra|para) l[áa]|n[ãa]o tenho (mais )?interess|n[ãa]o me interess|n[ãa]o vou querer'
    || '|\mn[ãa]o quero (mais|nada)\M'
    || '|^\W*n[ãa]o\W*(quero|obrigad[oa])(\W+(mais|nada|n[ãa]o|obrigad[oa]))*\W*$')
$function$;
CREATE OR REPLACE FUNCTION public.iris_textos_antes_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  new.atualizado_em := now();
  if new.texto is distinct from old.texto then
    if new.audio_path is not distinct from old.audio_path then
      new.audio_path := null;
      new.duracao_s := null;
    end if;
    if not (old.aprovado = false and new.aprovado = true) then
      new.aprovado := false;
    end if;
  end if;
  return new;
end
$function$;
CREATE OR REPLACE FUNCTION public.is_member(org uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.organizacao_usuarios
    where organizacao_id = org and usuario_id = auth.uid() and status = 'ativo'
  )
  and not exists (
    select 1 from public.usuarios u where u.id = auth.uid() and u.deve_trocar_senha = true
  );
$function$;
CREATE OR REPLACE FUNCTION public.is_platform_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce((select platform_admin from public.usuarios where id = auth.uid()), false);
$function$;
CREATE OR REPLACE FUNCTION public.mensagens_agendadas_reivindicar(p_limite integer DEFAULT 30)
 RETURNS SETOF mensagens_agendadas
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  return query
  with cand as (
    select distinct on (canal_id) id
    from public.mensagens_agendadas
    where (status = 'agendada'   and executar_em <= now())
       or (status = 'processando' and atualizado_em < now() - interval '5 minutes')  -- lease vencido = órfã
    order by canal_id, executar_em
    limit greatest(1, p_limite)
  )
  update public.mensagens_agendadas m
     set status = 'processando', tentativas = tentativas + 1, atualizado_em = now()
    from cand
   where m.id = cand.id
     and (
       (m.status = 'agendada'    and m.executar_em <= now())
       or (m.status = 'processando' and m.atualizado_em < now() - interval '5 minutes')
     )
  returning m.*;
end $function$;
CREATE OR REPLACE FUNCTION public.notificacao_marcar_lida(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_org uuid;
begin
  select organizacao_id into v_org from public.atd_notificacoes where id = p_id;
  if v_org is null then return; end if;
  if not public.is_member(v_org) then raise exception 'sem_permissao'; end if;
  update public.atd_notificacoes set lida_em = now() where id = p_id and lida_em is null;
end $function$;
CREATE OR REPLACE FUNCTION public.notificacoes_marcar_todas(p_org uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_member(p_org) then raise exception 'sem_permissao'; end if;
  update public.atd_notificacoes set lida_em = now()
    where organizacao_id = p_org and lida_em is null
      and (usuario_id is null or usuario_id = auth.uid());
end $function$;
CREATE OR REPLACE FUNCTION public.oportunidade_nao_elegivel(p_conversa uuid, p_motivo text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_org uuid; v_contato uuid; v_col uuid;
begin
  if p_motivo is not null and p_motivo not in
     ('sem_beneficio_inss','muitos_processos','sem_interesse','sem_emprestimo_banco','nao_mora_rs') then
    raise exception 'motivo_nao_elegivel_invalido' using errcode='check_violation';
  end if;
  select organizacao_id, contato_id into v_org, v_contato from public.conversas where id = p_conversa;
  if v_contato is null or v_org is null then return; end if;
  select id into v_col from public.funil_colunas
    where organizacao_id = v_org and resultado = 'perdido' and coalesce(arquivada, false) = false
    order by ordem limit 1;
  if v_col is null then return; end if;
  update public.oportunidades o
     set coluna_id = v_col, motivo_perda = 'nao_elegivel', motivo_nao_elegivel = p_motivo,
         etiquetas = case when 'nao_elegivel' = any (coalesce(o.etiquetas, '{}'::text[])) then o.etiquetas
           else array_append(coalesce(o.etiquetas, '{}'::text[]), 'nao_elegivel') end
   where o.contato_id = v_contato and o.organizacao_id = v_org and o.status = 'em_andamento';
end $function$;
CREATE OR REPLACE FUNCTION public.opp_sync_fechamento()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_novo text; v_antigo text; v_uid uuid := auth.uid();
begin
  if NEW.coluna_id is not distinct from OLD.coluna_id then return NEW; end if;
  select coalesce(resultado,'neutro') into v_novo from public.funil_colunas where id = NEW.coluna_id;
  select coalesce(resultado,'neutro') into v_antigo from public.funil_colunas where id = OLD.coluna_id;
  v_novo := coalesce(v_novo,'neutro'); v_antigo := coalesce(v_antigo,'neutro');
  if v_novo = v_antigo then return NEW; end if;
  -- 29/10: com o administrativo ligado, só ele põe ou tira do Fechado.
  if (v_novo = 'ganho' or v_antigo = 'ganho')
     and coalesce(current_setting('app.fechamento_origem', true), '') <> 'administrativo'
     and exists (select 1 from public.adm_config ac where ac.organizacao_id = NEW.organizacao_id and ac.ativo) then
    raise exception 'fechado_pelo_administrativo' using errcode = 'check_violation';
  end if;
  -- 24/10: com a planilha ligada, só ela põe ou tira do Fechado.
  if (v_novo = 'ganho' or v_antigo = 'ganho')
     and coalesce(current_setting('app.fechamento_origem', true), '') <> 'planilha'
     and exists (select 1 from public.planilha_config pc where pc.organizacao_id = NEW.organizacao_id and pc.ativo) then
    raise exception 'fechado_pela_planilha' using errcode = 'check_violation';
  end if;
  if v_novo = 'ganho' then
    NEW.status := 'ganho'; NEW.fechado_em := coalesce(NEW.fechado_em, now()); NEW.fechado_por_id := coalesce(NEW.fechado_por_id, v_uid);
    NEW.responsavel_no_fechamento_id := NEW.responsavel_id; NEW.motivo_perda := null; NEW.motivo_perda_desc := null;
    NEW.motivo_nao_elegivel := null;
    insert into public.oportunidade_eventos(organizacao_id,oportunidade_id,evento,coluna_anterior_id,coluna_nova_id,status_anterior,status_novo,resultado_anterior,resultado_novo,responsavel_no_fechamento_id,executado_por)
      values (NEW.organizacao_id,NEW.id,'ganho',OLD.coluna_id,NEW.coluna_id,OLD.status,'ganho',v_antigo,'ganho',NEW.responsavel_id,v_uid);
  elsif v_novo = 'perdido' then
    if NEW.motivo_perda is null then raise exception 'motivo_perda_obrigatorio' using errcode='check_violation'; end if;
    if NEW.motivo_perda='outro' and coalesce(btrim(NEW.motivo_perda_desc),'')='' then raise exception 'motivo_perda_desc_obrigatorio' using errcode='check_violation'; end if;
    if NEW.motivo_perda is distinct from 'nao_elegivel' then NEW.motivo_nao_elegivel := null; end if;
    NEW.status := 'perdido'; NEW.fechado_em := coalesce(NEW.fechado_em, now()); NEW.fechado_por_id := coalesce(NEW.fechado_por_id, v_uid);
    NEW.responsavel_no_fechamento_id := NEW.responsavel_id;
    insert into public.oportunidade_eventos(organizacao_id,oportunidade_id,evento,coluna_anterior_id,coluna_nova_id,status_anterior,status_novo,resultado_anterior,resultado_novo,motivo_perda,responsavel_no_fechamento_id,executado_por)
      values (NEW.organizacao_id,NEW.id,'perdido',OLD.coluna_id,NEW.coluna_id,OLD.status,'perdido',v_antigo,'perdido',NEW.motivo_perda,NEW.responsavel_id,v_uid);
  elsif v_antigo in ('ganho','perdido') and v_novo = 'neutro' then
    if coalesce(btrim(NEW.motivo_reabertura),'')='' then raise exception 'motivo_reabertura_obrigatorio' using errcode='check_violation'; end if;
    insert into public.oportunidade_eventos(organizacao_id,oportunidade_id,evento,coluna_anterior_id,coluna_nova_id,status_anterior,status_novo,resultado_anterior,resultado_novo,motivo_reabertura,executado_por)
      values (NEW.organizacao_id,NEW.id,'reaberto',OLD.coluna_id,NEW.coluna_id,OLD.status,'em_andamento',v_antigo,'neutro',NEW.motivo_reabertura,v_uid);
    NEW.status := 'em_andamento'; NEW.fechado_em := null; NEW.fechado_por_id := null; NEW.responsavel_no_fechamento_id := null;
    NEW.motivo_perda := null; NEW.motivo_perda_desc := null; NEW.motivo_reabertura := null;
    NEW.motivo_nao_elegivel := null;
  end if;
  return NEW;
end $function$;
CREATE OR REPLACE FUNCTION public.opp_touch_atualizado()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$ begin NEW.atualizado_em := clock_timestamp(); return NEW; end $function$;
CREATE OR REPLACE FUNCTION public.org_operacional(org uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.organizacoes o
                 where o.id = org
                   and o.status not in ('suspensa','cancelada')
                   and o.assinatura_status in ('ativa','isenta','em_atraso','teste'));
$function$;
CREATE OR REPLACE FUNCTION public.org_papel(org uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select papel::text from public.organizacao_usuarios
   where organizacao_id = org and usuario_id = auth.uid() and status = 'ativo' limit 1;
$function$;
CREATE OR REPLACE FUNCTION public.orgs_visiveis()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select o.id
  from public.organizacoes o
  where
    coalesce((select u.platform_admin from public.usuarios u where u.id = auth.uid()), false)
    or (
      exists (
        select 1 from public.organizacao_usuarios ou
        where ou.organizacao_id = o.id
          and ou.usuario_id = auth.uid()
          and ou.status = 'ativo'
      )
      and not exists (
        select 1 from public.usuarios u
        where u.id = auth.uid() and u.deve_trocar_senha = true
      )
      and o.status not in ('suspensa','cancelada')
      and o.assinatura_status in ('ativa','isenta','em_atraso','teste')
    );
$function$;
CREATE OR REPLACE FUNCTION public.papel_na_org(org uuid)
 RETURNS user_role
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select papel from public.organizacao_usuarios
   where organizacao_id = org and usuario_id = auth.uid() and status = 'ativo';
$function$;
CREATE OR REPLACE FUNCTION public.papel_org(p_org uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select papel from public.organizacao_usuarios where organizacao_id=p_org and usuario_id=auth.uid() and status='ativo' limit 1;
$function$;
CREATE OR REPLACE FUNCTION public.presenciais_periodo(p_org uuid, p_ini timestamp with time zone, p_fim timestamp with time zone)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select case when not public.is_member(p_org) then '[]'::jsonb else coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', p.id, 'contato_id', p.contato_id, 'cliente_nome', p.cliente_nome,
             'telefone', c.telefone, 'quando', p.quando, 'observacao', p.observacao, 'status', p.status,
             'marcado_por', u.nome, 'marcado_em', p.marcado_em,
             'conversa_id', (select cv.id from conversas cv where cv.contato_id = p.contato_id
                              order by cv.ultima_interacao_em desc nulls last limit 1),
             'aviso', (select a.status from presenciais_avisos a where a.presencial_id = p.id
                        order by a.id desc limit 1))
           order by p.quando)
      from presenciais p
      left join contatos c on c.id = p.contato_id
      left join usuarios u on u.id = p.marcado_por
     where p.organizacao_id = p_org and p.quando >= p_ini and p.quando < p_fim), '[]'::jsonb) end
$function$;
CREATE OR REPLACE FUNCTION public.presencial_desmarcar(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_uid uuid := auth.uid(); v_p presenciais; v_quem text;
begin
  select * into v_p from presenciais where id = p_id for update;
  if v_p.id is null or v_uid is null or not public.is_member(v_p.organizacao_id) then raise exception 'sem_permissao'; end if;
  if v_p.status <> 'marcado' then return; end if;
  select coalesce(nullif(btrim(u.nome), ''), 'equipe') into v_quem from usuarios u where u.id = v_uid;
  update presenciais set status = 'desmarcado', desmarcado_em = now(), alterado_por = v_uid, atualizado_em = now()
   where id = p_id;
  -- desmarcar antes de o aviso de marcado sair: nada sai (o grupo nunca soube dele)
  update presenciais_avisos set status = 'bloqueado', erro = 'desmarcado antes de sair'
   where presencial_id = p_id and status = 'pendente';
  if exists (select 1 from presenciais_avisos a where a.presencial_id = p_id and a.tipo = 'marcado'
              and a.status in ('enviado', 'incerto', 'enviando')) then
    insert into presenciais_avisos (organizacao_id, presencial_id, tipo, texto)
    values (v_p.organizacao_id, p_id, 'desmarcado', public.presencial_texto('desmarcado', v_p.cliente_nome, v_p.quando, v_quem));
  end if;
end $function$;
CREATE OR REPLACE FUNCTION public.presencial_dia_curto_txt(p_em timestamp with time zone)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select (array['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'])
           [extract(dow from p_em at time zone 'America/Sao_Paulo')::int + 1]
         || ', ' || to_char(p_em at time zone 'America/Sao_Paulo', 'DD/MM')
$function$;
CREATE OR REPLACE FUNCTION public.presencial_dia_txt(p_em timestamp with time zone)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select (array['domingo','segunda','terça','quarta','quinta','sexta','sábado'])
           [extract(dow from p_em at time zone 'America/Sao_Paulo')::int + 1]
         || ', ' || to_char(p_em at time zone 'America/Sao_Paulo', 'DD/MM')
$function$;
CREATE OR REPLACE FUNCTION public.presencial_hora_txt(p_em timestamp with time zone)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select to_char(p_em at time zone 'America/Sao_Paulo', 'FMHH24') || 'h'
         || case when extract(minute from p_em at time zone 'America/Sao_Paulo') = 0 then ''
                 else to_char(p_em at time zone 'America/Sao_Paulo', 'MI') end
$function$;
CREATE OR REPLACE FUNCTION public.presencial_marcar(p_org uuid, p_contato uuid, p_quando timestamp with time zone, p_observacao text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid(); v_quem text; v_nome text; v_id uuid;
  v_opp uuid; v_funil uuid; v_col_atual uuid; v_ordem_atual int; v_reuniao uuid; v_ordem_reuniao int;
begin
  if v_uid is null or not public.is_member(p_org) then raise exception 'sem_permissao'; end if;
  if p_quando is null or p_quando < now() then raise exception 'presencial_no_passado'; end if;
  if p_quando > now() + interval '400 days' then raise exception 'presencial_longe_demais'; end if;

  select coalesce(nullif(btrim(c.nome), ''), c.telefone, 'Cliente') into v_nome
    from contatos c where c.id = p_contato and c.organizacao_id = p_org;
  if v_nome is null then raise exception 'contato_nao_encontrado'; end if;
  if exists (select 1 from presenciais p where p.contato_id = p_contato and p.status = 'marcado' and p.quando >= now()) then
    raise exception 'presencial_ja_marcado';
  end if;
  select coalesce(nullif(btrim(u.nome), ''), 'equipe') into v_quem from usuarios u where u.id = v_uid;

  -- o card do cliente (o aberto mais recente)
  select o.id, o.funil_id, o.coluna_id into v_opp, v_funil, v_col_atual
    from oportunidades o
   where o.organizacao_id = p_org and o.contato_id = p_contato and o.status = 'em_andamento'
   order by o.criado_em desc limit 1;

  insert into presenciais (organizacao_id, contato_id, oportunidade_id, cliente_nome, quando, observacao, marcado_por)
  values (p_org, p_contato, v_opp, v_nome, p_quando, nullif(btrim(coalesce(p_observacao, '')), ''), v_uid)
  returning id into v_id;

  -- Kanban: "Reunião Marcada" é quando a gente marca — só puxa para frente (Lead Novo / Qualificado)
  if v_opp is not null then
    select fc.id, fc.ordem into v_reuniao, v_ordem_reuniao from funil_colunas fc
     where fc.funil_id = v_funil and not fc.arquivada and upper(fc.nome) like 'REUNI%' order by fc.ordem limit 1;
    select fc.ordem into v_ordem_atual from funil_colunas fc where fc.id = v_col_atual;
    if v_reuniao is not null and coalesce(v_ordem_atual, -1) < v_ordem_reuniao then
      update oportunidades set coluna_id = v_reuniao where id = v_opp and status = 'em_andamento';
    end if;
  end if;

  insert into presenciais_avisos (organizacao_id, presencial_id, tipo, texto)
  values (p_org, v_id, 'marcado', public.presencial_texto('marcado', v_nome, p_quando, v_quem));
  return v_id;
end $function$;
CREATE OR REPLACE FUNCTION public.presencial_na_txt(p_em timestamp with time zone)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select case when extract(dow from p_em at time zone 'America/Sao_Paulo')::int in (0, 6) then 'no ' else 'na ' end
         || public.presencial_dia_txt(p_em)
$function$;
CREATE OR REPLACE FUNCTION public.presencial_nome_txt(p_nome text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select string_agg(
           case when lower(w) in ('da','de','do','das','dos','e') then lower(w)
                else upper(left(w,1)) || lower(substr(w,2)) end,
           ' ' order by n)
    from regexp_split_to_table(btrim(coalesce(p_nome,'')), '\s+') with ordinality as t(w, n)
$function$;
CREATE OR REPLACE FUNCTION public.presencial_remarcar(p_id uuid, p_quando timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_uid uuid := auth.uid(); v_p presenciais; v_quem text;
begin
  select * into v_p from presenciais where id = p_id for update;
  if v_p.id is null or v_uid is null or not public.is_member(v_p.organizacao_id) then raise exception 'sem_permissao'; end if;
  if v_p.status <> 'marcado' then raise exception 'presencial_desmarcado'; end if;
  if p_quando is null or p_quando < now() then raise exception 'presencial_no_passado'; end if;
  if p_quando > now() + interval '400 days' then raise exception 'presencial_longe_demais'; end if;
  if p_quando = v_p.quando then return; end if;
  select coalesce(nullif(btrim(u.nome), ''), 'equipe') into v_quem from usuarios u where u.id = v_uid;
  update presenciais set quando = p_quando, alterado_por = v_uid, atualizado_em = now() where id = p_id;
  -- o aviso de marcado ainda não saiu: sai ele mesmo, já com o horário novo (o grupo não vê "remarcado" de algo que não viu)
  update presenciais_avisos a
     set texto = public.presencial_texto('marcado', v_p.cliente_nome, p_quando,
                   coalesce((select nullif(btrim(u.nome), '') from usuarios u where u.id = v_p.marcado_por), 'equipe'))
   where a.presencial_id = p_id and a.tipo = 'marcado' and a.status = 'pendente';
  if not found then
    insert into presenciais_avisos (organizacao_id, presencial_id, tipo, texto)
    values (v_p.organizacao_id, p_id, 'remarcado', public.presencial_texto('remarcado', v_p.cliente_nome, p_quando, v_quem));
  end if;
end $function$;
CREATE OR REPLACE FUNCTION public.presencial_texto(p_tipo text, p_nome text, p_quando timestamp with time zone, p_quem text)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select case p_tipo
    when 'marcado' then
      E'*📅  Presencial agendado*\n' || public.presencial_nome_txt(p_nome) || E'\n'
      || public.presencial_dia_curto_txt(p_quando) || ' às ' || public.presencial_hora_txt(p_quando)
      || ' · ' || p_quem
    when 'remarcado' then
      E'🔁 *PRESENCIAL REMARCADO*\n' || p_nome || ' passou para '
      || public.presencial_dia_txt(p_quando) || ', às ' || public.presencial_hora_txt(p_quando) || E'.\n'
      || 'Remarcado por ' || p_quem || '.'
    when 'desmarcado' then
      E'❌ *PRESENCIAL DESMARCADO*\nO atendimento de ' || p_nome || ' '
      || public.presencial_na_txt(p_quando) || ', às ' || public.presencial_hora_txt(p_quando)
      || ' foi desmarcado por ' || p_quem || '.'
  end
$function$;
CREATE OR REPLACE FUNCTION public.provisionar_organizacao(p_nome text, p_slug text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := auth.uid(); v_org uuid; v_plano uuid; v_base int;
begin
  if v_uid is null then
    raise exception 'Sem usuario autenticado' using errcode = 'insufficient_privilege';
  end if;
  if exists (select 1 from public.organizacao_usuarios where usuario_id = v_uid) then
    raise exception 'Usuario ja vinculado a uma organizacao' using errcode = 'unique_violation';
  end if;
  select id, valor_base_centavos into v_plano, v_base
    from public.planos where ativo order by versao desc limit 1;
  insert into public.organizacoes (nome, slug, status, plano, assinatura_status, assinatura_inicio, assinatura_vencimento)
    values (p_nome, p_slug, 'ativa', 'Plano Atenvo', 'ativa', current_date, (current_date + interval '30 days')::date)
    returning id into v_org;
  insert into public.organizacao_limites (organizacao_id) values (v_org);
  insert into public.assinaturas (organizacao_id, plano_id, status, ciclo_inicio, ciclo_fim, proxima_cobranca)
    values (v_org, v_plano, 'ativa',
            date_trunc('month', now())::date,
            (date_trunc('month', now()) + interval '1 month - 1 day')::date,
            (date_trunc('month', now()) + interval '1 month')::date);
  insert into public.assinatura_itens (assinatura_id, organizacao_id, tipo, descricao, quantidade, valor_unitario_centavos, valor_total_centavos)
    select a.id, v_org, 'plano_base', 'Plano Atenvo', 1, v_base, v_base
    from public.assinaturas a where a.organizacao_id = v_org;
  update public.assinaturas
     set valor_total_centavos = public.calcular_valor_assinatura(v_org)
   where organizacao_id = v_org;
  insert into public.organizacao_usuarios (organizacao_id, usuario_id, papel, status)
    values (v_org, v_uid, 'admin', 'ativo');
  insert into public.configuracoes (organizacao_id, chave, valor, descricao) values
    (v_org, 'cobranca_percentual_padrao', '50',                  'Percentual padrao cobrado sobre o valor economizado'),
    (v_org, 'cobranca_ciclos_padrao',     '6',                   'Numero padrao de ciclos mensais de cobranca'),
    (v_org, 'timezone',                   '"America/Sao_Paulo"', 'Fuso horario');
  return v_org;
end $function$;
CREATE OR REPLACE FUNCTION public.radar_avisos(p_org uuid)
 RETURNS TABLE(alerta_id uuid, tipo text, categoria text, estagio integer, conversa_id uuid, contato_id uuid, contato_nome text, contato_telefone text, responsavel_id uuid, responsavel_nome text, desde timestamp with time zone, minutos_uteis integer, prioritario boolean, prioridade text, cutucado_em timestamp with time zone, cutucadas integer, cutucado_por_nome text, decisao_pedida_em timestamp with time zone, decisao_em_min integer, ultima_msg text, titulo text, detalhe text, criado_em timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
CREATE OR REPLACE FUNCTION public.radar_fmt_desde(p_ts timestamp with time zone)
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
  select case when p_ts is null then ''
              else to_char(p_ts at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI') end
$function$;
CREATE OR REPLACE FUNCTION public.radar_fmt_tempo(p_min integer, p_dia integer DEFAULT 540)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case
    when p_min is null then ''
    when p_min < 60 then greatest(p_min, 1) || ' min'
    when p_min < p_dia then (p_min / 60) || ' h' || case when p_min % 60 > 0 then ' ' || (p_min % 60) || ' min' else '' end
    else (p_min / p_dia) || case when p_min / p_dia = 1 then ' dia útil' else ' dias úteis' end ||
         case when (p_min % p_dia) / 60 > 0 then ' e ' || ((p_min % p_dia) / 60) || ' h' else '' end
  end
$function$;
CREATE OR REPLACE FUNCTION public.radar_nome_curto(p_nome text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
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
end $function$;
CREATE OR REPLACE FUNCTION public.radar_nota(p_chave text, p jsonb DEFAULT '{}'::jsonb)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select case when t->>'titulo' is not null and t->>'texto' is not null then (t->>'titulo') || ' — ' || (t->>'texto')
              else coalesce(t->>'texto', t->>'titulo') end
  from (select public.radar_txt(p_chave, p) as t) x
$function$;
CREATE OR REPLACE FUNCTION public.radar_prioridade(p_prioritario boolean, p_motivo text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case when not coalesce(p_prioritario, false) then ''
              when p_motivo = 'documentação enviada' then 'Documentação enviada'
              else 'Interesse confirmado' end
$function$;
CREATE OR REPLACE FUNCTION public.radar_so_agradecimento(p_tipo text, p_txt text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select coalesce(p_tipo, '') = 'texto' and position('?' in coalesce(p_txt, '')) = 0 and (s = '' or s ~
    '^((muito )?(obrigad[oa]|obrigadao|obrgad[oa]|obg[da]*|brigad[oa]|grat[oa]|gratidao|agradec[a-z]*)|ok+|okay|blz|beleza|valeu|vlw|ta bom|tabom|ta certo|certo|combinado|show|perfeito|otimo|top|joia|entendi|amem|deus (te )?abencoe)( (e|entao|ok+|sim|viu|valeu|vlw|muito|igualmente|(muito )?obrigad[oa]|obrgad[oa]|obg[da]*|tudo bem|deus (te )?abencoe|por tudo|pela atencao|tmj|bom|ta|certo|de bola))*$')
  -- dígitos FICAM no texto normalizado: mensagem só com número (CPF, benefício, código) não é agradecimento
  from (select btrim(regexp_replace(regexp_replace(
                 translate(lower(coalesce(p_txt, '')), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'),
                 '[^a-z0-9? ]', ' ', 'g'), '\s+', ' ', 'g')) as s) x
$function$;
CREATE OR REPLACE FUNCTION public.radar_txt(p_chave text, p jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
end $function$;
CREATE OR REPLACE FUNCTION public.reagendar_agendamento(p_id uuid, p_canal uuid, p_executar_em timestamp with time zone)
 RETURNS mensagens_agendadas
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row   public.mensagens_agendadas;
  v_canal public.canais%rowtype;
begin
  select * into v_row from public.mensagens_agendadas where id = p_id for update;
  if v_row.id is null then raise exception 'agendamento_nao_encontrado'; end if;

  if not (is_platform_admin() or exists (
    select 1 from public.organizacao_usuarios
     where organizacao_id = v_row.organizacao_id and usuario_id = auth.uid() and status = 'ativo'
  )) then raise exception 'sem_acesso'; end if;

  if v_row.status not in ('falhou', 'bloqueada', 'expirada') then
    raise exception 'nao_reagendavel' using hint = 'só reagenda mensagens que falharam/foram bloqueadas/expiraram';
  end if;

  if p_executar_em is null or p_executar_em <= now() + interval '30 seconds' then
    raise exception 'horario_invalido' using hint = 'agende para o futuro';
  end if;

  select * into v_canal from public.canais where id = p_canal and organizacao_id = v_row.organizacao_id;
  if v_canal.id is null then raise exception 'canal_invalido' using hint = 'canal de outra organização ou inexistente'; end if;
  if v_canal.ativo = false then raise exception 'canal_inativo'; end if;
  if v_canal.status_integracao::text = 'removido' then raise exception 'canal_removido'; end if;
  if v_canal.status_integracao::text <> 'conectado' then raise exception 'canal_desconectado'; end if;
  if v_canal.envio_restrito then raise exception 'canal_restrito'; end if;
  if v_canal.conflito_com is not null then raise exception 'canal_em_conflito'; end if;

  update public.mensagens_agendadas
     set status = 'agendada',
         tentativas = 0,
         ultimo_erro = null,
         motivo_bloqueio = null,
         canal_id = p_canal,
         nome_canal_snapshot = v_canal.nome_interno,
         telefone_canal_snapshot = v_canal.numero_conectado,
         executar_em = p_executar_em,
         enviada_em = null,
         mensagem_id_enviada = null,
         editada_em = now(), editada_por = auth.uid(), atualizado_em = now()
   where id = p_id
  returning * into v_row;
  return v_row;
end $function$;
CREATE OR REPLACE FUNCTION public.recado_dono_agora(p_org uuid, p_contato uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce(
    (select public.adm_usuario_do_vendedor(p_org, p.vendedor) from public.adm_pendencias p
      where p.organizacao_id = p_org and p.contato_id = p_contato and p.assinado and 'historico' = any (p.falta)
      order by p.assinado_em desc nulls last limit 1),
    public.fila_iris_dono(p_contato));
$function$;
CREATE OR REPLACE FUNCTION public.recado_dono_mudou()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_contato uuid; v_conv uuid; v_antes uuid; v_resp_antes uuid;
begin
  begin
    -- (um ramo por tabela: o registro de contatos não tem contato_id nem atendente_id)
    if tg_table_name = 'contatos' then
      v_contato := new.id; v_resp_antes := old.responsavel_id;
    else
      v_contato := new.contato_id; v_conv := new.id; v_antes := old.atendente_id;
      select ct.responsavel_id into v_resp_antes from public.contatos ct where ct.id = new.contato_id;
    end if;
    if v_contato is null or not exists (select 1 from public.recados_gestor g
         where g.contato_id = v_contato and g.respondido_em is null and g.encerrado is null and g.cliente_respondido_em is null) then
      return null;
    end if;
    -- quem JÁ respondeu o cliente: guarda a hora de todos os pendentes do contato, vista como era antes da troca
    -- (é o mesmo valor que a leitura mostraria; depois da troca o celular deixaria de contar para ele)
    update public.recados_gestor g
       set cliente_respondido_em = public.recado_respondeu_em(g.contato_id, g.para_id, g.criado_em, v_resp_antes, v_conv, v_antes)
     where g.contato_id = v_contato and g.respondido_em is null and g.encerrado is null and g.cliente_respondido_em is null
       and public.recado_respondeu_em(g.contato_id, g.para_id, g.criado_em, v_resp_antes, v_conv, v_antes) is not null;
    -- quem deixou de ser o dono sem ter respondido: o recado se encerra (não volta a cobrar se o cliente voltar)
    update public.recados_gestor g
       set encerrado = 'o cliente mudou de atendente', gestor_visto_em = coalesce(g.gestor_visto_em, now())
     where g.contato_id = v_contato and g.respondido_em is null and g.encerrado is null and g.cliente_respondido_em is null
       and public.recado_dono_agora(g.organizacao_id, g.contato_id) is distinct from g.para_id
       and (select ct.responsavel_id from public.contatos ct where ct.id = g.contato_id) is distinct from g.para_id;
  exception when others then
    raise warning 'recado_dono_mudou: %', sqlerrm;
  end;
  return null;
end;
$function$;
CREATE OR REPLACE FUNCTION public.recado_respondeu_em(p_contato uuid, p_para uuid, p_desde timestamp with time zone, p_resp uuid, p_conv uuid DEFAULT NULL::uuid, p_conv_dono uuid DEFAULT NULL::uuid)
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- a 1ª mensagem que saiu de verdade para o cliente depois do recado, sem agendamento: do destinatário pelo painel,
  -- ou pelo celular numa conversa que é dele pela regra da fila (atendente da conversa → dono do contato).
  -- p_conv/p_conv_dono: a conversa que está mudando de dono agora e o dono dela ANTES (o gatilho)
  select min(m.enviada_em) from public.mensagens m join public.conversas c on c.id = m.conversa_id
   where c.contato_id = p_contato and m.direcao = 'saida' and m.tipo::text not in ('sistema', 'nota_interna')
     and m.status::text in ('enviada', 'entregue', 'lida') and coalesce(m.metadados->>'agendamento_id', '') = ''
     and m.enviada_em > p_desde
     and ((m.origem = 'atenvo' and m.autor_id = p_para)
          or (m.origem = 'telefone' and m.autor_id is null
              and coalesce(case when c.id = p_conv then p_conv_dono else c.atendente_id end, p_resp) = p_para));
$function$;
CREATE OR REPLACE FUNCTION public.redige_senha(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select case when p is null then null
    else regexp_replace(p, '(senha[ \t]*(meu[ \t]+inss|inss|gov\.?br|gov)?[ \t]*:?)[^\n]*', '\1 [REMOVIDA]', 'gi') end;
$function$;
CREATE OR REPLACE FUNCTION public.registrar_baixa_parcela(p_parcela uuid, p_data date DEFAULT CURRENT_DATE, p_obs text DEFAULT NULL::text)
 RETURNS cobranca_pagamentos
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := auth.uid(); r public.cobranca_pagamentos; v_cob_status text;
begin
  if v_uid is null then raise exception 'usuario_autenticado_obrigatorio'; end if;
  select * into r from public.cobranca_pagamentos where id = p_parcela;
  if r.id is null then raise exception 'parcela_invalida'; end if;
  if not public.cobranca_gestor(r.organizacao_id) then raise exception 'sem_permissao'; end if;
  select status::text into v_cob_status from public.cobrancas where id = r.cobranca_id;
  if v_cob_status = 'cancelado' then raise exception 'cobranca_cancelada'; end if;
  if r.status = 'cancelada' then raise exception 'parcela_cancelada'; end if;
  if r.status = 'paga' then raise exception 'parcela_ja_paga'; end if;
  update public.cobranca_pagamentos
     set status='paga', valor_pago = valor, data_pagamento = coalesce(p_data, current_date), observacoes = coalesce(p_obs, observacoes)
   where id = p_parcela returning * into r;
  insert into public.cobranca_eventos(organizacao_id, cobranca_id, tipo, descricao, dados, usuario_id)
    values (r.organizacao_id, r.cobranca_id, 'parcela_paga', 'Baixa de parcela '||r.ciclo,
      jsonb_build_object('parcela', p_parcela, 'data', r.data_pagamento, 'obs', p_obs), v_uid);
  return r;
end $function$;
CREATE OR REPLACE FUNCTION public.regua_arquivar(p_org uuid, p_id uuid)
 RETURNS reguas
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v public.reguas;
begin
  if auth.uid() is null then raise exception 'usuario_autenticado_obrigatorio'; end if;
  if not public.relacionamento_admin(p_org) then raise exception 'sem_permissao'; end if;
  update public.reguas set status='arquivada', atualizado_em=now() where id=p_id and organizacao_id=p_org returning * into v;
  if v.id is null then raise exception 'regua_nao_encontrada'; end if;
  return v;
end $function$;
CREATE OR REPLACE FUNCTION public.regua_ativar(p_org uuid, p_regua uuid, p_contato uuid, p_canal uuid, p_conversa uuid DEFAULT NULL::uuid)
 RETURNS regua_ativacoes
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare uid uuid := auth.uid(); v_reg record; v_cont record; v_can record; v_conv uuid; v public.regua_ativacoes;
begin
  if uid is null then raise exception 'usuario_autenticado_obrigatorio'; end if;
  if not public._relacionamento_pode_gerir_contato(p_org, p_contato) then raise exception 'sem_permissao'; end if;
  select id, status into v_reg from public.reguas where id=p_regua and organizacao_id=p_org;
  if v_reg.id is null then raise exception 'regua_nao_encontrada'; end if;
  if v_reg.status <> 'ativa' then raise exception 'regua_nao_ativa'; end if;
  select id, responsavel_id into v_cont from public.contatos where id=p_contato and organizacao_id=p_org;
  if v_cont.id is null then raise exception 'contato_nao_encontrado'; end if;
  if exists (select 1 from public.relacionamento_bloqueio where contato_id=p_contato) then raise exception 'contato_bloqueado'; end if;
  select ativo, (status_integracao::text) as si, envio_restrito, conflito_com, transporte, papel
    into v_can from public.canais where id=p_canal and organizacao_id=p_org;
  if v_can is null then raise exception 'canal_nao_encontrado'; end if;
  if not (v_can.ativo and v_can.si='conectado' and not v_can.envio_restrito and v_can.conflito_com is null and v_can.transporte='evolution' and v_can.papel in ('atendimento','ambos')) then
    raise exception 'canal_nao_enviavel';
  end if;
  if p_conversa is not null then
    select id into v_conv from public.conversas where id=p_conversa and organizacao_id=p_org and contato_id=p_contato and status <> 'fechada' and arquivada_em is null;
    if v_conv is null then raise exception 'conversa_invalida'; end if;
  else
    select id into v_conv from public.conversas where organizacao_id=p_org and contato_id=p_contato and status <> 'fechada' and arquivada_em is null order by ultima_interacao_em desc nulls last limit 1;
  end if;
  if exists (select 1 from public.regua_ativacoes where organizacao_id=p_org and contato_id=p_contato and status in ('ativo','pausado')) then raise exception 'ja_tem_relacionamento_ativo'; end if;
  insert into public.regua_ativacoes(organizacao_id, regua_id, contato_id, conversa_id, canal_id, responsavel_id, status, passo_atual, proximo_em, ativado_por, ativado_em, atualizado_em)
  values (p_org, p_regua, p_contato, v_conv, p_canal, coalesce(v_cont.responsavel_id, uid), 'ativo', 0, now(), uid, now(), now()) returning * into v;
  return v;
end $function$;
CREATE OR REPLACE FUNCTION public.regua_desativar(p_ativacao uuid, p_motivo text DEFAULT NULL::text)
 RETURNS regua_ativacoes
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare a public.regua_ativacoes; v public.regua_ativacoes;
begin
  if auth.uid() is null then raise exception 'usuario_autenticado_obrigatorio'; end if;
  a := public._relacionamento_ativacao_gerivel(p_ativacao);
  if a.status = 'desativado' then return a; end if;
  update public.mensagens_agendadas set status='cancelada', cancelada_em=now(), cancelada_por=auth.uid() where regua_ativacao_id=p_ativacao and status='agendada';
  update public.regua_envios set status='cancelado' where ativacao_id=p_ativacao and status='agendado';
  update public.regua_ativacoes set status='desativado', desativado_em=now(), proximo_em=null, motivo_saida=p_motivo, atualizado_em=now() where id=p_ativacao returning * into v;
  return v;
end $function$;
CREATE OR REPLACE FUNCTION public.regua_excluir(p_org uuid, p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then raise exception 'usuario_autenticado_obrigatorio'; end if;
  if not public.relacionamento_admin(p_org) then raise exception 'sem_permissao'; end if;
  if exists (select 1 from public.regua_ativacoes where regua_id=p_id and organizacao_id=p_org) then
    raise exception 'regua_possui_historico';
  end if;
  delete from public.reguas where id=p_id and organizacao_id=p_org;
  if not found then raise exception 'regua_nao_encontrada'; end if;
end $function$;
CREATE OR REPLACE FUNCTION public.regua_passo_remover(p_org uuid, p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then raise exception 'usuario_autenticado_obrigatorio'; end if;
  if not public.relacionamento_admin(p_org) then raise exception 'sem_permissao'; end if;
  delete from public.regua_passos where id=p_id and organizacao_id=p_org;
  if not found then raise exception 'passo_nao_encontrado'; end if;
end $function$;
CREATE OR REPLACE FUNCTION public.regua_passo_salvar(p_org uuid, p_regua uuid, p_id uuid, p_ordem smallint, p_titulo text, p_tipo text, p_texto text, p_storage_path text, p_mime text, p_nome text, p_tamanho bigint, p_agendamento_tipo text, p_offset_horas integer, p_dia_semana integer, p_hora time without time zone, p_data date)
 RETURNS regua_passos
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v public.regua_passos;
begin
  if auth.uid() is null then raise exception 'usuario_autenticado_obrigatorio'; end if;
  if not public.relacionamento_admin(p_org) then raise exception 'sem_permissao'; end if;
  if not exists (select 1 from public.reguas where id=p_regua and organizacao_id=p_org) then raise exception 'regua_nao_encontrada'; end if;
  if p_id is null then
    insert into public.regua_passos(regua_id, organizacao_id, ordem, titulo_interno, tipo, texto, storage_path, mime_type,
      nome_arquivo, tamanho_bytes, agendamento_tipo, offset_horas, dia_semana, hora, data)
    values (p_regua, p_org, p_ordem, p_titulo, p_tipo, p_texto, p_storage_path, p_mime, p_nome, p_tamanho, p_agendamento_tipo, p_offset_horas, p_dia_semana, p_hora, p_data) returning * into v;
  else
    update public.regua_passos set ordem=p_ordem, titulo_interno=p_titulo, tipo=p_tipo, texto=p_texto, storage_path=p_storage_path,
      mime_type=p_mime, nome_arquivo=p_nome, tamanho_bytes=p_tamanho, agendamento_tipo=p_agendamento_tipo,
      offset_horas=p_offset_horas, dia_semana=p_dia_semana, hora=p_hora, data=p_data, atualizado_em=now()
    where id=p_id and regua_id=p_regua and organizacao_id=p_org returning * into v;
    if v.id is null then raise exception 'passo_nao_encontrado'; end if;
  end if;
  return v;
end $function$;
CREATE OR REPLACE FUNCTION public.regua_salvar(p_org uuid, p_id uuid DEFAULT NULL::uuid, p_nome text DEFAULT NULL::text, p_objetivo text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_publico text DEFAULT NULL::text, p_pausar_se_responder boolean DEFAULT NULL::boolean, p_teto_semana integer DEFAULT NULL::integer, p_intervalo_min_horas integer DEFAULT NULL::integer, p_dias_semana integer[] DEFAULT NULL::integer[], p_hora_inicio time without time zone DEFAULT NULL::time without time zone, p_hora_fim time without time zone DEFAULT NULL::time without time zone, p_timezone text DEFAULT NULL::text, p_canal_padrao uuid DEFAULT NULL::uuid)
 RETURNS reguas
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare uid uuid := auth.uid(); v public.reguas;
begin
  if uid is null then raise exception 'usuario_autenticado_obrigatorio'; end if;
  if not public.relacionamento_admin(p_org) then raise exception 'sem_permissao'; end if;
  if p_id is null then
    if coalesce(btrim(p_nome),'') = '' then raise exception 'nome_obrigatorio'; end if;
    if p_objetivo is null then raise exception 'objetivo_obrigatorio'; end if;
    insert into public.reguas(organizacao_id, nome, objetivo, status, publico_sugerido, pausar_se_responder,
      teto_semana, intervalo_min_horas, dias_semana, hora_inicio, hora_fim, timezone, canal_padrao_id, criado_por)
    values (p_org, btrim(p_nome), p_objetivo, coalesce(p_status,'rascunho'), p_publico,
      coalesce(p_pausar_se_responder, true), coalesce(p_teto_semana,3), coalesce(p_intervalo_min_horas,48),
      coalesce(p_dias_semana, '{1,2,3,4,5}'), coalesce(p_hora_inicio,'08:00'), coalesce(p_hora_fim,'18:00'),
      coalesce(p_timezone,'America/Sao_Paulo'), p_canal_padrao, uid) returning * into v;
  else
    update public.reguas set nome=coalesce(nullif(btrim(p_nome),''), nome), objetivo=coalesce(p_objetivo, objetivo),
      status=coalesce(p_status, status), publico_sugerido=coalesce(p_publico, publico_sugerido),
      pausar_se_responder=coalesce(p_pausar_se_responder, pausar_se_responder), teto_semana=coalesce(p_teto_semana, teto_semana),
      intervalo_min_horas=coalesce(p_intervalo_min_horas, intervalo_min_horas), dias_semana=coalesce(p_dias_semana, dias_semana),
      hora_inicio=coalesce(p_hora_inicio, hora_inicio), hora_fim=coalesce(p_hora_fim, hora_fim),
      timezone=coalesce(p_timezone, timezone), canal_padrao_id=coalesce(p_canal_padrao, canal_padrao_id), atualizado_em=now()
    where id=p_id and organizacao_id=p_org returning * into v;
    if v.id is null then raise exception 'regua_nao_encontrada'; end if;
  end if;
  return v;
end $function$;
CREATE OR REPLACE FUNCTION public.regua_trocar(p_ativacao uuid, p_nova_regua uuid)
 RETURNS regua_ativacoes
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare a public.regua_ativacoes; nova public.regua_ativacoes;
begin
  if auth.uid() is null then raise exception 'usuario_autenticado_obrigatorio'; end if;
  a := public._relacionamento_ativacao_gerivel(p_ativacao);
  perform public.regua_desativar(p_ativacao, 'troca_de_regua');
  nova := public.regua_ativar(a.organizacao_id, p_nova_regua, a.contato_id, a.canal_id, null);
  return nova;
end $function$;
CREATE OR REPLACE FUNCTION public.relacionamento_admin(p_org uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    public.is_platform_admin()
    or (public.org_operacional(p_org) and public.org_papel(p_org) = 'admin'),
  false);
$function$;
CREATE OR REPLACE FUNCTION public.relacionamento_bloquear(p_org uuid, p_contato uuid, p_motivo text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare a public.regua_ativacoes;
begin
  if auth.uid() is null then raise exception 'usuario_autenticado_obrigatorio'; end if;
  if not public._relacionamento_pode_gerir_contato(p_org, p_contato) then raise exception 'sem_permissao'; end if;
  insert into public.relacionamento_bloqueio(contato_id, organizacao_id, motivo, criado_por)
    values (p_contato, p_org, p_motivo, auth.uid())
    on conflict (contato_id) do update set motivo=excluded.motivo, criado_por=excluded.criado_por, criado_em=now();
  for a in select id from public.regua_ativacoes where organizacao_id=p_org and contato_id=p_contato and status in ('ativo','pausado') loop
    perform public.regua_desativar(a.id, 'nao_incomodar');
  end loop;
end $function$;
CREATE OR REPLACE FUNCTION public.relacionamento_desbloquear(p_org uuid, p_contato uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then raise exception 'usuario_autenticado_obrigatorio'; end if;
  if not public._relacionamento_pode_gerir_contato(p_org, p_contato) then raise exception 'sem_permissao'; end if;
  delete from public.relacionamento_bloqueio where contato_id=p_contato and organizacao_id=p_org;
end $function$;
CREATE OR REPLACE FUNCTION public.remarketing_config_salvar(p_org uuid, p_ativo boolean, p_fluxo1_min integer, p_pendencia_dias integer, p_recuperacao_dias integer, p_fila uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_antes boolean;
begin
  if not public._eh_admin_org(p_org) then raise exception 'sem_permissao'; end if;
  if coalesce(p_fluxo1_min, 0) < 5 or coalesce(p_pendencia_dias, 0) < 1 or coalesce(p_recuperacao_dias, 0) < 1 then
    raise exception 'prazos_invalidos';
  end if;

  select ativo into v_antes from public.remarketing_config where organizacao_id = p_org;

  insert into public.remarketing_config (organizacao_id, ativo, ativo_desde, fluxo1_min, pendencia_dias, recuperacao_dias, fila_recuperacao, atualizado_em)
  values (p_org, p_ativo, case when p_ativo then now() else null end, p_fluxo1_min, p_pendencia_dias, p_recuperacao_dias, coalesce(p_fila, '{}'), now())
  on conflict (organizacao_id) do update set
    ativo = excluded.ativo,
    -- só re-carimba na VIRADA false→true; ligado permanece com o carimbo original
    ativo_desde = case
      when excluded.ativo and coalesce(remarketing_config.ativo, false) = false then now()
      when excluded.ativo then remarketing_config.ativo_desde
      else remarketing_config.ativo_desde end,
    fluxo1_min = excluded.fluxo1_min,
    pendencia_dias = excluded.pendencia_dias,
    recuperacao_dias = excluded.recuperacao_dias,
    fila_recuperacao = excluded.fila_recuperacao,
    atualizado_em = now();

  return (select to_jsonb(rc) from public.remarketing_config rc where rc.organizacao_id = p_org);
end $function$;
CREATE OR REPLACE FUNCTION public.remarketing_conversa_resumo(p_conversa uuid, p_contato uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_org uuid; v jsonb; v_ult_entrada timestamptz; v_tel text;
begin
  if p_conversa is null then return null; end if;
  select organizacao_id into v_org from public.conversas where id = p_conversa;
  if v_org is null then return null; end if;
  if not public.is_member(v_org) and not public.is_platform_admin() then return null; end if;

  select coalesce(jsonb_build_object(
    'entradas_total',  count(*) filter (where direcao = 'entrada'),
    'saidas_total',    count(*) filter (where direcao = 'saida'),
    'entradas_audio',  count(*) filter (where direcao = 'entrada' and tipo = 'audio'),
    'saidas_texto',    count(*) filter (where direcao = 'saida'  and tipo = 'texto'),
    'saidas_audio',    count(*) filter (where direcao = 'saida'  and tipo = 'audio'),
    'docs_recebidos',  count(*) filter (where direcao = 'entrada' and tipo in ('documento','imagem')),
    'ultima_entrada_em', max(enviada_em) filter (where direcao = 'entrada'),
    'ultima_saida_em',   max(enviada_em) filter (where direcao = 'saida')
  ), '{}'::jsonb) into v
  from public.mensagens where conversa_id = p_conversa;

  select max(enviada_em) into v_ult_entrada from public.mensagens where conversa_id = p_conversa and direcao = 'entrada';

  v := v || coalesce((
    select jsonb_build_object('moda_hora', hora, 'moda_hora_qtd', qtd)
    from (
      select extract(hour from enviada_em at time zone 'America/Sao_Paulo')::int as hora, count(*) as qtd
      from public.mensagens where conversa_id = p_conversa and direcao = 'entrada'
      group by 1 order by qtd desc, hora asc limit 1
    ) h
  ), '{}'::jsonb);

  v := v || coalesce((
    select jsonb_build_object('ultima_saida_status', status, 'erro_envio', erro_envio)
    from public.mensagens where conversa_id = p_conversa and direcao = 'saida'
    order by enviada_em desc limit 1
  ), '{}'::jsonb);

  v := v || jsonb_build_object('lidas_pos_entrada', coalesce((
    select count(*) from public.mensagens
    where conversa_id = p_conversa and direcao = 'saida' and status = 'lida'
      and (v_ult_entrada is null or enviada_em > v_ult_entrada)
  ), 0));

  v := v || coalesce((select jsonb_build_object('nao_lidas', nao_lidas) from public.conversas where id = p_conversa), '{}'::jsonb);
  v := v || coalesce((
    select jsonb_build_object('ultima_entrada_tipo', tipo)
    from public.mensagens where conversa_id = p_conversa and direcao = 'entrada'
    order by enviada_em desc limit 1
  ), '{}'::jsonb);

  if p_contato is not null then
    select telefone into v_tel from public.contatos where id = p_contato;
    -- números ALTERNATIVOS: exclui o principal e o telefone do contato; ordem estável
    v := v || jsonb_build_object('telefones_extras', coalesce((
      select jsonb_agg(distinct valor_normalizado order by valor_normalizado)
      from public.contato_identidades
      where contato_id = p_contato and tipo = 'whatsapp'
        and coalesce(principal, false) = false
        and valor_normalizado is not null
        and valor_normalizado is distinct from v_tel
    ), '[]'::jsonb));
    -- contratos = só a versão vigente de cada ficha
    v := v || jsonb_build_object('contratos_lista', coalesce((
      select jsonb_agg(jsonb_build_object('banco', banco_nome, 'tipo', tipo_beneficio, 'valor', valor_beneficio)
                       order by valor_beneficio desc nulls last)
      from public.fichas_judiciais fj
      where fj.contato_id = p_contato
        and not exists (select 1 from public.fichas_judiciais s where s.ficha_anterior_id = fj.id)
    ), '[]'::jsonb));
  end if;

  return v;
end $function$;
CREATE OR REPLACE FUNCTION public.remarketing_dashboard(p_org uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case when not public.is_member(p_org) and not public.is_platform_admin() then null else jsonb_build_object(
    'por_etapa', coalesce((
      select jsonb_object_agg(etapa, n) from (
        select etapa, count(*) as n from public.remarketing_leads
        where organizacao_id = p_org and status = 'ativo' group by etapa
      ) s), '{}'::jsonb),
    'por_atendente', coalesce((
      select jsonb_agg(jsonb_build_object('id', u.id, 'nome', u.nome, 'n', s.n) order by s.n desc) from (
        select responsavel_id, count(*) as n from public.remarketing_leads
        where organizacao_id = p_org and status = 'ativo' and responsavel_id is not null
        group by responsavel_id
      ) s join public.usuarios u on u.id = s.responsavel_id), '[]'::jsonb),
    'sem_responsavel', (select count(*) from public.remarketing_leads where organizacao_id = p_org and status = 'ativo' and responsavel_id is null),
    'ativos', (select count(*) from public.remarketing_leads where organizacao_id = p_org and status = 'ativo'),
    'recuperados_hoje', (select count(*) from public.remarketing_leads where organizacao_id = p_org and status = 'recuperado'
        and (encerrado_em at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date),
    'recuperados_30d', (select count(*) from public.remarketing_leads where organizacao_id = p_org and status = 'recuperado' and encerrado_em >= now() - interval '30 days'),
    'perdidos_30d', (select count(*) from public.remarketing_leads where organizacao_id = p_org and status = 'perdido' and encerrado_em >= now() - interval '30 days'),
    'taxa_recuperacao', (
      select case when (rec + per) = 0 then null else round(rec::numeric / (rec + per) * 100, 1) end from (
        select
          count(*) filter (where status = 'recuperado' and encerrado_em >= now() - interval '30 days') as rec,
          count(*) filter (where status = 'perdido'    and encerrado_em >= now() - interval '30 days') as per
        from public.remarketing_leads where organizacao_id = p_org
      ) t),
    'tempo_medio_recuperacao_h', (
      select round(avg(extract(epoch from (encerrado_em - criado_em)) / 3600)::numeric, 1)
      from public.remarketing_leads
      where organizacao_id = p_org and status = 'recuperado' and encerrado_em >= now() - interval '30 days'),
    'tempo_medio_sem_resposta_h', (
      select round(avg(extract(epoch from (now() - cv.ultima_entrada_em)) / 3600)::numeric, 1)
      from public.remarketing_leads rl join public.conversas cv on cv.id = rl.conversa_id
      where rl.organizacao_id = p_org and rl.status = 'ativo' and cv.ultima_entrada_em is not null),
    'tarefas_pendentes', (select count(*) from public.remarketing_tarefas where organizacao_id = p_org and status = 'pendente'),
    'tarefas_vencidas', (select count(*) from public.remarketing_tarefas where organizacao_id = p_org and status = 'pendente' and vence_em < now())
  ) end;
$function$;
CREATE OR REPLACE FUNCTION public.remarketing_fila_sinais(p_org uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case when not public.is_member(p_org) and not public.is_platform_admin() then null else coalesce((
    select jsonb_agg(jsonb_build_object(
      'lead_id', rl.id,
      'conversa_id', rl.conversa_id,
      'saidas_texto', coalesce(m.saidas_texto, 0),
      'saidas_audio', coalesce(m.saidas_audio, 0),
      'entradas_audio', coalesce(m.entradas_audio, 0),
      'entradas_total', coalesce(m.entradas_total, 0),
      'docs_recebidos', coalesce(m.docs_recebidos, 0),
      'ultima_saida_status', m.ultima_saida_status,
      'ultima_saida_em', m.ultima_saida_em,
      'ultima_entrada_em', m.ultima_entrada_em,
      'ligacoes', coalesce(ev.ligacoes, 0),
      'audios_reg', coalesce(ev.audios, 0),
      'whatsapps_reg', coalesce(ev.whatsapps, 0),
      'contratos', coalesce(f.contratos, 0),
      'benef_total', coalesce(f.benef_total, 0),
      'cpf_preenchido', coalesce(cpf.tem, false)
    ))
    from public.remarketing_leads rl
    left join lateral (
      select
        count(*) filter (where m0.direcao = 'saida'  and m0.tipo = 'texto') as saidas_texto,
        count(*) filter (where m0.direcao = 'saida'  and m0.tipo = 'audio') as saidas_audio,
        count(*) filter (where m0.direcao = 'entrada' and m0.tipo = 'audio') as entradas_audio,
        count(*) filter (where m0.direcao = 'entrada') as entradas_total,
        count(*) filter (where m0.direcao = 'entrada' and m0.tipo in ('documento', 'imagem')) as docs_recebidos,
        max(m0.enviada_em) filter (where m0.direcao = 'entrada') as ultima_entrada_em,
        max(m0.enviada_em) filter (where m0.direcao = 'saida')  as ultima_saida_em,
        (select m2.status from public.mensagens m2
           where m2.conversa_id = rl.conversa_id and m2.direcao = 'saida'
           order by m2.enviada_em desc limit 1) as ultima_saida_status
      from public.mensagens m0
      where m0.conversa_id = rl.conversa_id
    ) m on rl.conversa_id is not null
    left join lateral (
      select
        count(*) filter (where e.tipo = 'ligacao_realizada') as ligacoes,
        count(*) filter (where e.tipo = 'audio_enviado')     as audios,
        count(*) filter (where e.tipo = 'whatsapp_enviado')  as whatsapps
      from public.remarketing_eventos e where e.remarketing_id = rl.id
    ) ev on true
    left join lateral (
      select count(*) as contratos, coalesce(sum(fj.valor_beneficio), 0) as benef_total
      from public.fichas_judiciais fj
      where fj.contato_id = rl.contato_id
        and not exists (select 1 from public.fichas_judiciais s where s.ficha_anterior_id = fj.id)
    ) f on true
    left join lateral (
      select coalesce(b.dados_qualificacao->>'cpf_mascarado', '') <> '' as tem
      from public.bot_conversa_estado b where b.conversa_id = rl.conversa_id limit 1
    ) cpf on rl.conversa_id is not null
    where rl.organizacao_id = p_org and rl.status = 'ativo'
  ), '[]'::jsonb) end;
$function$;
CREATE OR REPLACE FUNCTION public.remarketing_mudar_etapa(p_lead uuid, p_etapa text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_rl public.remarketing_leads%rowtype;
begin
  if p_etapa not in ('remarketing_1','pendencia','recuperacao_1','recuperacao_2','recuperacao_3') then
    raise exception 'etapa_invalida';
  end if;
  select * into v_rl from public.remarketing_leads where id = p_lead for update;
  if v_rl.id is null then raise exception 'lead_nao_encontrado'; end if;
  if not public.is_member(v_rl.organizacao_id) then raise exception 'sem_permissao'; end if;
  if v_rl.status <> 'ativo' then raise exception 'lead_encerrado'; end if;
  if v_rl.etapa = p_etapa then return; end if;

  -- a cerimônia padrão (expira tarefa, cria a nova, notifica, evento)
  perform public.rmkt_transicionar(p_lead, p_etapa, null,
    case when p_etapa like 'recuperacao%' then 'Recuperação: ligar + WhatsApp + áudio' else 'Retomar contato com o cliente' end,
    'Etapa alterada manualmente pelo atendente.',
    null,
    'Etapa alterada',
    'A etapa do lead foi alterada manualmente para ' || p_etapa || '.',
    'etapa_alterada',
    jsonb_build_object('manual', true, 'de', v_rl.etapa));
  -- registra QUEM alterou (rmkt_transicionar não recebe usuário)
  update public.remarketing_eventos set usuario_id = auth.uid()
    where remarketing_id = p_lead and tipo = 'etapa_alterada' and usuario_id is null
      and criado_em > now() - interval '5 seconds';
end $function$;
CREATE OR REPLACE FUNCTION public.remarketing_observacao(p_lead uuid, p_texto text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_rl public.remarketing_leads%rowtype;
begin
  if coalesce(trim(p_texto), '') = '' then raise exception 'texto_vazio'; end if;
  select * into v_rl from public.remarketing_leads where id = p_lead;
  if v_rl.id is null then raise exception 'lead_nao_encontrado'; end if;
  if not public.is_member(v_rl.organizacao_id) then raise exception 'sem_permissao'; end if;
  insert into public.remarketing_eventos (organizacao_id, remarketing_id, oportunidade_id, tipo, detalhe, usuario_id)
    values (v_rl.organizacao_id, p_lead, v_rl.oportunidade_id, 'observacao',
            jsonb_build_object('texto', left(trim(p_texto), 800)), auth.uid());
end $function$;
CREATE OR REPLACE FUNCTION public.remarketing_produtividade(p_org uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case when not public.is_member(p_org) and not public.is_platform_admin() then null else coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', u.id, 'nome', u.nome,
      'tarefas', coalesce(t.pendentes, 0),
      'vencidas', coalesce(t.vencidas, 0),
      'concluidas_hoje', coalesce(c.hoje, 0),
      'recuperados_30d', coalesce(r.recuperados, 0),
      'tempo_medio_conclusao_h', c.tempo_medio_h,
      'tempo_medio_recuperacao_h', r.tempo_medio_h
    ) order by coalesce(t.vencidas, 0) desc, coalesce(t.pendentes, 0) desc)
    from public.organizacao_usuarios ou
    join public.usuarios u on u.id = ou.usuario_id
    left join (
      select responsavel_id, count(*) as pendentes, count(*) filter (where vence_em < now()) as vencidas
      from public.remarketing_tarefas where organizacao_id = p_org and status = 'pendente'
      group by responsavel_id
    ) t on t.responsavel_id = u.id
    left join (
      select concluida_por,
             count(*) filter (where (concluida_em at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date) as hoje,
             round(avg(extract(epoch from (concluida_em - criado_em)) / 3600)::numeric, 1) as tempo_medio_h
      from public.remarketing_tarefas
      where organizacao_id = p_org and status = 'concluida' and concluida_em >= now() - interval '30 days'
      group by concluida_por
    ) c on c.concluida_por = u.id
    left join (
      select responsavel_id, count(*) as recuperados,
             round(avg(extract(epoch from (encerrado_em - criado_em)) / 3600)::numeric, 1) as tempo_medio_h
      from public.remarketing_leads
      where organizacao_id = p_org and status = 'recuperado' and encerrado_em >= now() - interval '30 days'
      group by responsavel_id
    ) r on r.responsavel_id = u.id
    where ou.organizacao_id = p_org and ou.status = 'ativo'
  ), '[]'::jsonb) end;
$function$;
CREATE OR REPLACE FUNCTION public.remarketing_reagendar(p_tarefa uuid, p_quando timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_t public.remarketing_tarefas%rowtype;
begin
  select * into v_t from public.remarketing_tarefas where id = p_tarefa for update;
  if v_t.id is null then raise exception 'tarefa_nao_encontrada'; end if;
  if not public.is_member(v_t.organizacao_id) then raise exception 'sem_permissao'; end if;
  if v_t.status <> 'pendente' then raise exception 'tarefa_nao_pendente'; end if;
  if p_quando is null or p_quando < now() - interval '1 hour' then raise exception 'prazo_invalido'; end if;

  update public.remarketing_tarefas set vence_em = p_quando where id = p_tarefa;
  update public.remarketing_leads set proxima_acao_em = p_quando, atualizado_em = now()
    where id = v_t.remarketing_id;
  insert into public.remarketing_eventos (organizacao_id, remarketing_id, tipo, detalhe, usuario_id)
    values (v_t.organizacao_id, v_t.remarketing_id, 'reagendado',
            jsonb_build_object('tarefa_id', p_tarefa, 'para', p_quando), auth.uid());
end $function$;
CREATE OR REPLACE FUNCTION public.remarketing_registrar_acao(p_lead uuid, p_acao text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_rl public.remarketing_leads%rowtype; v_tipo text;
begin
  if p_acao not in ('ligacao','audio','whatsapp') then raise exception 'acao_invalida'; end if;
  select * into v_rl from public.remarketing_leads where id = p_lead for update;
  if v_rl.id is null then raise exception 'lead_nao_encontrado'; end if;
  if not public.is_member(v_rl.organizacao_id) then raise exception 'sem_permissao'; end if;
  if v_rl.status <> 'ativo' then raise exception 'lead_encerrado'; end if;

  v_tipo := case p_acao when 'ligacao' then 'ligacao_realizada' when 'audio' then 'audio_enviado' else 'whatsapp_enviado' end;
  update public.remarketing_leads set tentativas = tentativas + 1, atualizado_em = now() where id = p_lead;
  insert into public.remarketing_eventos (organizacao_id, remarketing_id, oportunidade_id, tipo, detalhe, usuario_id)
    values (v_rl.organizacao_id, p_lead, v_rl.oportunidade_id, v_tipo, '{}'::jsonb, auth.uid());
end $function$;
CREATE OR REPLACE FUNCTION public.remarketing_tarefa_concluir(p_tarefa uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_t public.remarketing_tarefas%rowtype;
  v_rl public.remarketing_leads%rowtype;
  v_escala timestamptz;
begin
  select * into v_t from public.remarketing_tarefas where id = p_tarefa for update;
  if v_t.id is null then raise exception 'tarefa_nao_encontrada'; end if;
  if not public.is_member(v_t.organizacao_id) then raise exception 'sem_permissao'; end if;
  if v_t.status <> 'pendente' then return; end if;

  update public.remarketing_tarefas
    set status = 'concluida', concluida_em = now(), concluida_por = auth.uid()
    where id = p_tarefa;

  select * into v_rl from public.remarketing_leads where id = v_t.remarketing_id for update;

  -- tentativa só conta quando a tarefa era de AÇÃO (acompanhar não é tentativa)
  if v_t.tipo = 'acao' then
    update public.remarketing_leads set tentativas = tentativas + 1, atualizado_em = now()
      where id = v_t.remarketing_id;
  end if;

  insert into public.remarketing_eventos (organizacao_id, remarketing_id, tipo, detalhe, usuario_id)
    values (v_t.organizacao_id, v_t.remarketing_id, 'tarefa_concluida',
            jsonb_build_object('tarefa_id', p_tarefa, 'titulo', v_t.titulo, 'tipo', v_t.tipo), auth.uid());

  -- NENHUM lead sem tarefa: nasce o acompanhamento, vencendo na hora em que o
  -- motor escalaria (entrou_etapa_em + recuperacao_dias) — o atendente vê o prazo
  -- real e o sistema escala sozinho se o cliente seguir mudo.
  if v_rl.id is not null and v_rl.status = 'ativo' then
    select v_rl.entrou_etapa_em + make_interval(days => coalesce(rc.recuperacao_dias, 3))
      into v_escala from public.remarketing_config rc where rc.organizacao_id = v_rl.organizacao_id;
    insert into public.remarketing_tarefas (organizacao_id, remarketing_id, conversa_id, contato_id, responsavel_id, tipo, titulo, instrucoes, vence_em)
    values (v_rl.organizacao_id, v_rl.id, v_rl.conversa_id, v_rl.contato_id, v_rl.responsavel_id, 'acompanhamento',
            'Aguardar resposta do cliente',
            'Tentativa registrada. Se o cliente não responder até o prazo, o sistema escala a etapa sozinho.',
            coalesce(v_escala, now() + interval '3 days'))
    on conflict do nothing;
    update public.remarketing_leads
      set proxima_acao = 'Aguardar resposta do cliente', proxima_acao_em = coalesce(v_escala, now() + interval '3 days')
      where id = v_rl.id;
  end if;
end $function$;
CREATE OR REPLACE FUNCTION public.remarketing_transferir(p_lead uuid, p_usuario uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_rl public.remarketing_leads%rowtype; v_nome text;
begin
  select * into v_rl from public.remarketing_leads where id = p_lead for update;
  if v_rl.id is null then raise exception 'lead_nao_encontrado'; end if;
  if not public.is_member(v_rl.organizacao_id) then raise exception 'sem_permissao'; end if;
  if v_rl.status <> 'ativo' then raise exception 'lead_encerrado'; end if;

  update public.remarketing_leads set responsavel_id = p_usuario, atualizado_em = now() where id = p_lead;
  update public.remarketing_tarefas set responsavel_id = p_usuario
    where remarketing_id = p_lead and status = 'pendente';
  -- transferência REAL: sync total propaga p/ conversa, kanban, fichas, cobranças
  update public.contatos set responsavel_id = p_usuario where id = v_rl.contato_id;

  select nome into v_nome from public.usuarios where id = p_usuario;
  insert into public.remarketing_eventos (organizacao_id, remarketing_id, oportunidade_id, tipo, detalhe, usuario_id)
    values (v_rl.organizacao_id, p_lead, v_rl.oportunidade_id, 'transferido',
            jsonb_build_object('manual', true, 'para', p_usuario, 'para_nome', v_nome), auth.uid());
  insert into public.atd_notificacoes (organizacao_id, usuario_id, tipo, titulo, corpo, rota, ref_id)
    values (v_rl.organizacao_id, p_usuario, 'remarketing', 'Lead transferido para você',
            'Um lead do remarketing foi transferido para você. Veja a próxima ação na Central.',
            case when v_rl.conversa_id is not null then '/whatsapp?conversa=' || v_rl.conversa_id else '/remarketing' end, p_lead);
end $function$;
CREATE OR REPLACE FUNCTION public.remover_mensagem_falha(p_mensagem_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_org uuid;
  v_conversa uuid;
  v_direcao mensagem_direcao;
  v_status mensagem_status;
  v_entregue timestamptz;
  v_lida timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Não autenticado.' using errcode = '28000';
  end if;

  select m.organizacao_id, m.conversa_id, m.direcao, m.status, m.entregue_em, m.lida_em
    into v_org, v_conversa, v_direcao, v_status, v_entregue, v_lida
  from mensagens m
  where m.id = p_mensagem_id;

  if not found then
    raise exception 'Mensagem não encontrada.';
  end if;

  if not exists (
    select 1 from organizacao_usuarios ou
    where ou.organizacao_id = v_org and ou.usuario_id = auth.uid() and ou.status = 'ativo'
  ) then
    raise exception 'Sem acesso a esta conversa.' using errcode = '42501';
  end if;

  if v_direcao <> 'saida' then
    raise exception 'Apenas mensagens enviadas (saída) podem ser removidas.';
  end if;
  if v_status <> 'falhou' then
    raise exception 'Apenas mensagens com falha podem ser removidas.';
  end if;
  if v_entregue is not null or v_lida is not null then
    raise exception 'Mensagem entregue/lida não pode ser removida.';
  end if;

  delete from mensagens where id = p_mensagem_id;
  return v_conversa;
end;
$function$;
CREATE OR REPLACE FUNCTION public.renomear_canal(p_canal uuid, p_nome text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org  uuid;
  v_uid  uuid := auth.uid();
  v_nome text := nullif(btrim(p_nome), '');
begin
  if v_uid is null then raise exception 'usuario_autenticado_obrigatorio'; end if;
  if v_nome is null then raise exception 'nome_obrigatorio'; end if;
  if length(v_nome) > 60 then raise exception 'nome_muito_longo'; end if;

  select organizacao_id into v_org from public.canais where id = p_canal;
  if v_org is null then raise exception 'canal_invalido'; end if;

  if not coalesce(
       public.is_platform_admin()
       or (public.is_member(v_org) and public.papel_na_org(v_org) = any (array['admin','supervisor']::user_role[])),
     false) then
    raise exception 'sem_permissao';
  end if;

  update public.canais
     set nome_interno = v_nome,
         atualizado_em = now()
   where id = p_canal;
end
$function$;
CREATE OR REPLACE FUNCTION public.reordenar_colunas_funil(p_funil uuid, p_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_org uuid; v_entrada uuid; v_id uuid; v_i int := 0;
begin
  select organizacao_id into v_org from public.funis where id = p_funil;
  if v_org is null then raise exception 'funil_invalido'; end if;
  -- chamada autenticada exige membership; service_role (auth.uid() null) é backend confiável.
  if auth.uid() is not null and not public.is_member(v_org) then raise exception 'sem_permissao'; end if;

  -- nenhuma coluna de outro funil pode entrar na lista (evita reordenar o quadro alheio)
  if exists (
    select 1 from unnest(p_ids) as x(id)
    where not exists (select 1 from public.funil_colunas c where c.id = x.id and c.funil_id = p_funil)
  ) then raise exception 'coluna_de_outro_funil'; end if;

  select id into v_entrada from public.funil_colunas
   where funil_id = p_funil and entrada and not arquivada limit 1;

  if v_entrada is not null then
    update public.funil_colunas set ordem = 0 where id = v_entrada and ordem <> 0;
  end if;

  foreach v_id in array p_ids loop
    if v_entrada is not null and v_id = v_entrada then continue; end if;  -- entrada não se move
    v_i := v_i + 1;
    update public.funil_colunas set ordem = v_i where id = v_id and funil_id = p_funil;
  end loop;
end $function$;
CREATE OR REPLACE FUNCTION public.rmkt_transicionar(p_lead uuid, p_etapa text, p_responsavel uuid, p_titulo_tarefa text, p_instrucoes text, p_sugestao text, p_titulo_notif text, p_corpo_notif text, p_tipo_evento text, p_detalhe jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_rl public.remarketing_leads%rowtype;
  v_dias int;
begin
  select * into v_rl from public.remarketing_leads where id = p_lead for update;
  if v_rl.id is null or v_rl.status <> 'ativo' then return; end if;

  select recuperacao_dias into v_dias from public.remarketing_config where organizacao_id = v_rl.organizacao_id;
  v_dias := coalesce(v_dias, 3);

  update public.remarketing_tarefas set status = 'expirada'
    where remarketing_id = p_lead and status = 'pendente';

  update public.remarketing_leads set
    etapa = p_etapa,
    responsavel_id = coalesce(p_responsavel, responsavel_id),
    proxima_acao = p_titulo_tarefa,
    proxima_acao_em = now(),
    entrou_etapa_em = now(),
    atualizado_em = now()
  where id = p_lead;

  insert into public.remarketing_tarefas (organizacao_id, remarketing_id, conversa_id, contato_id, responsavel_id, titulo, instrucoes, sugestao_mensagem, vence_em)
  values (v_rl.organizacao_id, p_lead, v_rl.conversa_id, v_rl.contato_id, coalesce(p_responsavel, v_rl.responsavel_id), p_titulo_tarefa, p_instrucoes, p_sugestao, now() + make_interval(days => v_dias));

  insert into public.atd_notificacoes (organizacao_id, usuario_id, tipo, titulo, corpo, rota, ref_id)
  values (v_rl.organizacao_id, coalesce(p_responsavel, v_rl.responsavel_id), 'remarketing', p_titulo_notif, p_corpo_notif,
          case when v_rl.conversa_id is not null then '/whatsapp?conversa=' || v_rl.conversa_id else '/remarketing' end, p_lead);

  insert into public.remarketing_eventos (organizacao_id, remarketing_id, oportunidade_id, tipo, detalhe)
  values (v_rl.organizacao_id, p_lead, v_rl.oportunidade_id, p_tipo_evento,
          p_detalhe || jsonb_build_object('etapa', p_etapa, 'responsavel_id', p_responsavel));
end $function$;
CREATE OR REPLACE FUNCTION public.robo_ligar_concluir(p_conversa uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  update public.atd_notificacoes set lida_em = now()
   where tipo in ('robo_ligar', 'robo_ligar_sem_dono') and ref_id = p_conversa and lida_em is null;

  insert into public.mensagens (organizacao_id, conversa_id, direcao, tipo, origem, status, conteudo, enviada_em)
  values (v_org, p_conversa, 'saida', 'nota_interna', 'bot', 'enviada',
          coalesce(public.radar_nota('nota.ligou', jsonb_build_object('atendente', coalesce(v_nome, 'O atendente'), 'cliente', v_cli)),
                   'Ligação registrada.'), now());

  return jsonb_build_object('ok', true);
end $function$;
CREATE OR REPLACE FUNCTION public.salvar_preferencias(p_prefs jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'usuario_autenticado_obrigatorio'; end if;
  insert into public.usuario_preferencias(usuario_id, prefs, atualizado_em) values (uid, coalesce(p_prefs, '{}'::jsonb), now())
  on conflict (usuario_id) do update set prefs = excluded.prefs, atualizado_em = now();
end $function$;
CREATE OR REPLACE FUNCTION public.seed_status_conversa_padrao()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.conversa_status_def (organizacao_id, slug, nome, cor, ordem, padrao, ativo, sistema)
  values
    (new.id, 'aberta',         'Aberta',         '#3b82f6', 0, true,  true, true),
    (new.id, 'em_atendimento', 'Em atendimento', '#f59e0b', 1, false, true, true),
    (new.id, 'pendente',       'Pendente',       '#a855f7', 2, false, true, true),
    (new.id, 'resolvida',      'Resolvida',      '#22c55e', 3, false, true, true),
    (new.id, 'fechada',        'Fechada',        '#64748b', 4, false, true, true)
  on conflict (organizacao_id, slug) do nothing;
  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION public.set_atualizado_em()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  new.atualizado_em = now();
  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION public.sla_alertas_ativos(p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_uid uuid := auth.uid(); v_admin boolean; r jsonb;
begin
  if not (public.is_platform_admin() or public.is_member(p_org)) then
    raise exception 'sem_acesso' using errcode='insufficient_privilege';
  end if;
  v_admin := public.is_platform_admin() or public.papel_na_org(p_org) = any (array['admin','supervisor']::user_role[]);

  with vis as (
    select * from public.sla_alertas a
    where a.organizacao_id = p_org and a.resolvido_em is null
      and (a.silenciado_ate is null or a.silenciado_ate < now())
      and (v_admin or a.responsavel_id = v_uid)     -- atendente vê só a própria fila
  )
  select jsonb_build_object(
    'total', (select count(*) from vis),
    'imediatos', (select count(*) from vis where severidade='imediato'),
    'criticos', (select count(*) from vis where severidade in ('critico')),
    'vermelhos', (select count(*) from vis where severidade='vermelho'),
    'amarelos', (select count(*) from vis where severidade='amarelo'),
    'leves', (select count(*) from vis where severidade='leve'),
    'itens', coalesce((select jsonb_agg(jsonb_build_object(
        'id', id, 'tipo', tipo, 'severidade', severidade, 'titulo', titulo, 'detalhe', detalhe,
        'conversa_id', conversa_id, 'oportunidade_id', oportunidade_id, 'contato_id', contato_id,
        'responsavel_id', responsavel_id, 'vence_em', vence_em, 'criado_em', criado_em
      ) order by case severidade when 'imediato' then 5 when 'critico' then 4 when 'vermelho' then 3 when 'amarelo' then 2 else 1 end desc, criado_em asc)
      from vis), '[]'::jsonb)
  ) into r;
  return r;
end $function$;
CREATE OR REPLACE FUNCTION public.sla_contato_assumido()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_conv int; v_alertas int;
begin
  if not (new.responsavel_id is not null and old.responsavel_id is null) then return new; end if;

  update public.conversas set precisa_humano = false, precisa_humano_motivo = null, precisa_humano_em = null
    where contato_id = new.id and arquivada_em is null
      and status in ('aberta','em_atendimento','pendente') and precisa_humano;
  get diagnostics v_conv = row_count;

  update public.sla_alertas a set resolvido_em = now(), resolvido_por = coalesce(auth.uid(), new.responsavel_id),
         resolucao = 'humano', atualizado_em = now()
    where a.resolvido_em is null
      and a.conversa_id in (select id from public.conversas where contato_id = new.id);
  get diagnostics v_alertas = row_count;

  if v_conv > 0 or v_alertas > 0 then
    insert into public.audit_log (usuario_id, acao, entidade, entidade_id, dados_depois, organizacao_id)
    values (coalesce(auth.uid(), new.responsavel_id), 'precisa_humano_limpo', 'contatos', new.id,
            jsonb_build_object('motivo','atendente_assumiu','conversas',v_conv,'alertas_resolvidos',v_alertas), new.organizacao_id);
  end if;
  return new;
end $function$;
CREATE OR REPLACE FUNCTION public.sla_conversa_atendente()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_alertas int;
begin
  if not (new.atendente_id is not null and old.atendente_id is null) then return new; end if;
  if new.precisa_humano then
    new.precisa_humano := false; new.precisa_humano_motivo := null; new.precisa_humano_em := null;
  end if;
  update public.sla_alertas a set resolvido_em = now(), resolvido_por = new.atendente_id, resolucao = 'humano', atualizado_em = now()
    where a.resolvido_em is null and a.conversa_id = new.id;
  get diagnostics v_alertas = row_count;
  if v_alertas > 0 then
    insert into public.audit_log (usuario_id, acao, entidade, entidade_id, dados_depois, organizacao_id)
    values (new.atendente_id, 'precisa_humano_limpo', 'conversas', new.id,
            jsonb_build_object('motivo','atendente_atribuido','alertas_resolvidos',v_alertas), new.organizacao_id);
  end if;
  return new;
end $function$;
CREATE OR REPLACE FUNCTION public.sla_mensagem_humano()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_conv int; v_alertas int; v_org uuid;
begin
  if not (new.direcao = 'saida' and new.autor_id is not null
          and new.tipo not in ('sistema','nota_interna') and coalesce(new.origem,'') <> 'bot') then
    return new;
  end if;
  select organizacao_id into v_org from public.conversas where id = new.conversa_id;

  update public.conversas set precisa_humano = false, precisa_humano_motivo = null, precisa_humano_em = null
    where id = new.conversa_id and precisa_humano;
  get diagnostics v_conv = row_count;

  update public.sla_alertas a set resolvido_em = now(), resolvido_por = new.autor_id, resolucao = 'humano', atualizado_em = now()
    where a.resolvido_em is null and a.conversa_id = new.conversa_id;
  get diagnostics v_alertas = row_count;

  if v_conv > 0 or v_alertas > 0 then
    insert into public.audit_log (usuario_id, acao, entidade, entidade_id, dados_depois, organizacao_id)
    values (new.autor_id, 'precisa_humano_limpo', 'conversas', new.conversa_id,
            jsonb_build_object('motivo','atendente_respondeu','conversas',v_conv,'alertas_resolvidos',v_alertas), v_org);
  end if;
  return new;
end $function$;
CREATE OR REPLACE FUNCTION public.sla_opp_movimento()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if tg_op = 'INSERT' then
    new.entrada_em     := coalesce(new.entrada_em, now());
    new.movimentado_em := coalesce(new.movimentado_em, now());
  elsif new.coluna_id is distinct from old.coluna_id then
    new.movimentado_em := clock_timestamp();
  end if;
  return new;
end $function$;
CREATE OR REPLACE FUNCTION public.sla_registrar(p_org uuid, p_tipo text, p_severidade text, p_conversa uuid DEFAULT NULL::uuid, p_oportunidade uuid DEFAULT NULL::uuid, p_contato uuid DEFAULT NULL::uuid, p_responsavel uuid DEFAULT NULL::uuid, p_titulo text DEFAULT NULL::text, p_detalhe text DEFAULT NULL::text, p_vence timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_dedup text; v_id uuid;
begin
  v_dedup := p_tipo || ':' || coalesce(p_conversa::text, p_oportunidade::text, p_contato::text);
  insert into public.sla_alertas
    (organizacao_id, tipo, severidade, conversa_id, oportunidade_id, contato_id, responsavel_id, titulo, detalhe, vence_em, dedup_key)
  values (p_org, p_tipo, p_severidade, p_conversa, p_oportunidade, p_contato, p_responsavel,
          coalesce(p_titulo, p_tipo), p_detalhe, p_vence, v_dedup)
  on conflict (organizacao_id, dedup_key) where resolvido_em is null do update set
    severidade = excluded.severidade, titulo = excluded.titulo, detalhe = excluded.detalhe,
    responsavel_id = excluded.responsavel_id, vence_em = excluded.vence_em, atualizado_em = now()
  returning id into v_id;
  return v_id;
end $function$;
CREATE OR REPLACE FUNCTION public.sla_resolver(p_alerta uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare a record;
begin
  select * into a from public.sla_alertas where id = p_alerta;
  if a.id is null then raise exception 'alerta_nao_encontrado'; end if;
  if not (public.is_platform_admin()
          or (public.is_member(a.organizacao_id) and public.papel_na_org(a.organizacao_id) = any(array['admin','supervisor']::user_role[]))
          or a.responsavel_id = auth.uid()) then
    raise exception 'sem_permissao';
  end if;
  update public.sla_alertas set resolvido_em = now(), resolvido_por = auth.uid(), resolucao = 'manual'
    where id = p_alerta and resolvido_em is null;
  insert into public.audit_log (usuario_id, acao, entidade, entidade_id, dados_depois, organizacao_id)
  values (auth.uid(),'sla_resolver','sla_alertas',p_alerta,'{}'::jsonb,a.organizacao_id);
  return jsonb_build_object('ok', true, 'alerta', p_alerta);
end $function$;
CREATE OR REPLACE FUNCTION public.sla_silenciar(p_alerta uuid, p_ate timestamp with time zone, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare a record;
begin
  select * into a from public.sla_alertas where id = p_alerta;
  if a.id is null then raise exception 'alerta_nao_encontrado'; end if;
  if not (public.is_platform_admin()
          or (public.is_member(a.organizacao_id) and public.papel_na_org(a.organizacao_id) = any(array['admin','supervisor']::user_role[]))
          or a.responsavel_id = auth.uid()) then
    raise exception 'sem_permissao';
  end if;
  if p_motivo is null or btrim(p_motivo)='' then raise exception 'motivo_obrigatorio'; end if;
  update public.sla_alertas set silenciado_ate = p_ate, silenciado_por = auth.uid(), silenciado_motivo = p_motivo
    where id = p_alerta;
  insert into public.audit_log (usuario_id, acao, entidade, entidade_id, dados_depois, organizacao_id)
  values (auth.uid(),'sla_silenciar','sla_alertas',p_alerta,jsonb_build_object('ate',p_ate,'motivo',p_motivo),a.organizacao_id);
  return jsonb_build_object('ok', true, 'alerta', p_alerta);
end $function$;
CREATE OR REPLACE FUNCTION public.sync_responsavel_cliente(p_contato uuid, p_resp_anterior uuid, p_novo_resp uuid, p_ator uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org     uuid;
  v_conv    int := 0;
  v_opp     int := 0;
  v_ficha   int := 0;
  v_cob     int := 0;
  v_agd     int := 0;
  v_resp_ok boolean;
begin
  select organizacao_id into v_org from public.contatos where id = p_contato;
  if v_org is null then return; end if;

  perform set_config('atenvo.sync_resp', '1', true);

  -- novo dono válido p/ tabelas que exigem membro ATIVO (cobranças e fichas). null (liberar) sempre ok.
  v_resp_ok := p_novo_resp is null or exists (
    select 1 from public.organizacao_usuarios
     where organizacao_id = v_org and usuario_id = p_novo_resp and status = 'ativo');

  update public.conversas
     set atendente_id = p_novo_resp
   where organizacao_id = v_org and contato_id = p_contato
     and status in ('aberta','em_atendimento','pendente')
     and atendente_id is distinct from p_novo_resp;
  get diagnostics v_conv = row_count;

  update public.oportunidades
     set responsavel_id = p_novo_resp
   where organizacao_id = v_org and contato_id = p_contato
     and status = 'em_andamento'
     and responsavel_id is distinct from p_novo_resp;
  get diagnostics v_opp = row_count;

  -- fichas em rascunho: só quando o novo dono é válido (fn_ficha_before exige responsavel ativo)
  if v_resp_ok then
    update public.fichas_judiciais
       set responsavel_id = p_novo_resp
     where organizacao_id = v_org and contato_id = p_contato
       and status = 'rascunho'
       and responsavel_id is distinct from p_novo_resp;
    get diagnostics v_ficha = row_count;

    update public.cobrancas
       set responsavel_id = p_novo_resp
     where organizacao_id = v_org and contato_id = p_contato
       and status = 'ativo'
       and responsavel_id is distinct from p_novo_resp;
    get diagnostics v_cob = row_count;
  end if;

  update public.agendamentos
     set atendente_id = p_novo_resp
   where organizacao_id = v_org and contato_id = p_contato
     and status in ('pendente','confirmado','remarcado')
     and atendente_id is distinct from p_novo_resp;
  get diagnostics v_agd = row_count;

  perform set_config('atenvo.sync_resp', '0', true);

  insert into public.audit_log(organizacao_id, usuario_id, acao, entidade, entidade_id, dados_antes, dados_depois)
  values (
    v_org, p_ator, 'sync_responsavel_cliente', 'contatos', p_contato,
    jsonb_build_object('responsavel_id', p_resp_anterior),
    jsonb_build_object(
      'responsavel_id',         p_novo_resp,
      'conversas_afetadas',     v_conv,
      'oportunidades_afetadas', v_opp,
      'fichas_afetadas',        v_ficha,
      'cobrancas_afetadas',     v_cob,
      'agendamentos_afetados',  v_agd
    )
  );
end $function$;
CREATE OR REPLACE FUNCTION public.tg_etiqueta_delete_sync_cache()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- linhas de junção já saem por ON DELETE CASCADE; aqui só limpamos o cache textual.
  update public.conversas
     set etiquetas = array_remove(etiquetas, old.nome)
   where organizacao_id = old.organizacao_id and etiquetas @> array[old.nome];
  update public.contatos
     set etiquetas = array_remove(etiquetas, old.nome)
   where organizacao_id = old.organizacao_id and etiquetas @> array[old.nome];
  return old;
end;
$function$;
CREATE OR REPLACE FUNCTION public.tg_etiqueta_rename_sync_cache()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.conversas
     set etiquetas = array_replace(etiquetas, old.nome, new.nome)
   where organizacao_id = new.organizacao_id and etiquetas @> array[old.nome];
  update public.contatos
     set etiquetas = array_replace(etiquetas, old.nome, new.nome)
   where organizacao_id = new.organizacao_id and etiquetas @> array[old.nome];
  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION public.toque_automatico_permitido(p_contato uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select p_contato is not null
     -- (revisão 09/10) janela limitada também no FUTURO: um toque agendado para daqui a dias não barra o de hoje
     and public.toques_automaticos(p_contato, now() - interval '24 hours', now() + interval '24 hours') < 1
     and public.toques_automaticos(p_contato, now() - interval '7 days', now() + interval '7 days') < 3
$function$;
CREATE OR REPLACE FUNCTION public.toques_automaticos(p_contato uuid, p_desde timestamp with time zone, p_ate timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with itens as (
    -- (1) fila mensagens_agendadas com marca de automação (lotes, pós-fluxo, iniciar caso, 6h, recuperação, régua)
    select coalesce('lote:'  || (a.metadados->>'disparo_lote'),
                    'rec:'   || (a.metadados->>'recuperacao_id'),
                    'regua:' || a.regua_ativacao_id::text) || '|' || a.conversa_id::text as chave,
           coalesce(a.enviada_em, a.executar_em) as ts
      from public.mensagens_agendadas a
     where a.contato_id = p_contato
       and a.status in ('agendada', 'processando', 'enviada')
       and (a.metadados ? 'disparo_lote' or a.metadados ? 'recuperacao_id' or a.regua_ativacao_id is not null)
       and coalesce(a.enviada_em, a.executar_em) >= p_desde - interval '12 hours'
       and (p_ate is null or coalesce(a.enviada_em, a.executar_em) < p_ate)
       -- reativo (responde algo que o cliente disse) não é toque
       and not (a.metadados ? 'resposta_msg_id')
       and not (coalesce(a.metadados->>'disparo_lote', '') = 'juros_iniciar_caso' and coalesce(a.metadados->>'ordem', '') = '3')
       and coalesce(a.metadados->>'reativo', '') not in ('true', 'sim')
       and coalesce(a.metadados->>'disparo_lote', '') not like 'respostas\_%'
    union all
    -- (2) cutucão da IA SDR: 1 evento = 1 toque
    select 'nudge:' || e.id::text, e.criado_em
      from public.ia_eventos e
      join public.conversas c on c.id = e.conversa_id
     where e.tipo = 'nudge_enviado'
       and e.criado_em >= p_desde - interval '12 hours'
       and (p_ate is null or e.criado_em < p_ate)
       and c.contato_id = p_contato
    union all
    -- (3) envios automáticos diretos, fora da fila
    select case when m.origem::text = 'disparo' then 'disparo_tel'
                else coalesce('camp:'  || (m.metadados->>'campanha_id'),
                              'via:'   || (m.metadados->>'via'),
                              'fluxo:' || (m.metadados->>'fluxo')) end || '|' || m.conversa_id::text,
           m.criado_em
      from public.conversas c
      join public.mensagens m on m.conversa_id = c.id
     where c.contato_id = p_contato
       and m.direcao = 'saida'
       and m.criado_em >= p_desde - interval '12 hours'
       and (p_ate is null or m.criado_em < p_ate)
       and coalesce(m.status::text, '') <> 'falhou'
       and (m.origem::text = 'disparo'
            or m.metadados->>'via' in ('disparo', 'remarketing', 'janela_guardia')
            or m.metadados->>'fluxo' = 'reengajar'
            or (m.origem::text = 'bot' and m.metadados ? 'nudge'))
  ),
  pedacos as (   -- mesma automação na mesma conversa: só vira outro bloco se ficou > 12 h sem mensagem
    select chave, ts,
           sum(case when ts - prev <= interval '12 hours' then 0 else 1 end)
             over (partition by chave order by ts rows unbounded preceding) as parte
      from (select chave, ts, lag(ts) over (partition by chave order by ts) as prev from itens) x
  ),
  blocos as (
    select min(ts) as ini, max(ts) as fim from pedacos group by chave, parte
  ),
  toques as (    -- blocos que começam a até 10 min um do outro = o mesmo toque
    select fim,
           sum(case when ini - prev <= interval '10 minutes' then 0 else 1 end)
             over (order by ini, fim rows unbounded preceding) as n
      from (select ini, fim, lag(ini) over (order by ini, fim) as prev from blocos) x
  )
  select count(*)::int from (select n from toques group by n having max(fim) >= p_desde) t
$function$;
CREATE OR REPLACE FUNCTION public.trg_fn_conversa_ultima_entrada()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.conversas
     set ultima_entrada_em = greatest(
           coalesce(ultima_entrada_em, to_timestamp(0)),
           coalesce(new.recebida_em, new.criado_em, now())
         )
   where id = new.conversa_id;
  return null;                              -- AFTER trigger: retorno é ignorado
end $function$;
CREATE OR REPLACE FUNCTION public.trg_fn_lead_fora_rs()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_entrada boolean;
begin
  select coalesce(fc.entrada,false) into v_entrada from public.funil_colunas fc where fc.id = new.coluna_id;
  if not coalesce(v_entrada,false) then return new; end if;
  if new.conversa_origem_id is null then return new; end if;
  if not public.fn_ddd_fora_rs(new.contato_id) then return new; end if;
  perform public.oportunidade_nao_elegivel(new.conversa_origem_id, 'nao_mora_rs');
  return new;
end $function$;
CREATE OR REPLACE FUNCTION public.trg_fn_reverse_resp_oportunidade()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if coalesce(current_setting('atenvo.sync_resp', true), '0') = '1' then
    return new;                       -- estamos dentro do fan-out: não voltar
  end if;
  if new.contato_id is null then
    return new;                       -- lead solto, sem contato para sincronizar
  end if;

  update public.contatos
     set responsavel_id = new.responsavel_id
   where id             = new.contato_id
     and organizacao_id = new.organizacao_id
     and responsavel_id is distinct from new.responsavel_id;
  return new;
end $function$;
CREATE OR REPLACE FUNCTION public.trg_fn_sync_responsavel_cliente()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- ator: usuário autenticado se houver; senão o novo responsável (mesmo padrão do trg_sla_contato_assumido).
  -- O Edge atribuir-atendimento roda via service_role, então auth.uid() é null aqui.
  perform public.sync_responsavel_cliente(
    new.id, old.responsavel_id, new.responsavel_id,
    coalesce(auth.uid(), new.responsavel_id)
  );
  return new;
end $function$;
CREATE OR REPLACE FUNCTION public.trg_rmkt_score_evento()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare j jsonb;
begin
  select public.fn_remarketing_score(NEW.remarketing_id) into j;
  update public.remarketing_leads
    set score = (j->>'score')::int, score_fatores = j->'fatores', score_calculado_em = now()
    where id = NEW.remarketing_id;
  return NEW;
exception when others then
  return NEW;  -- jamais quebrar o registro do evento por causa do score
end $function$;
CREATE OR REPLACE FUNCTION public.vacuo_cutucar(p_conversa uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  update public.atd_notificacoes set lida_em = now()
   where tipo = 'vacuo_cutucada' and ref_id = p_conversa and lida_em is null;

  insert into public.sla_alertas
    (organizacao_id, tipo, severidade, conversa_id, contato_id, responsavel_id, titulo, detalhe, dedup_key)
  values
    (ve.organizacao_id, 'vacuo_cutucada', 'imediato', p_conversa, v_contato, v_dono,
     coalesce(v_alerta->>'titulo', 'O gestor pediu uma resposta agora'), v_alerta->>'texto',
     'vacuo_cutucada:' || p_conversa);

  insert into public.atd_notificacoes (organizacao_id, usuario_id, tipo, titulo, corpo, rota, ref_id)
  values (ve.organizacao_id, v_dono, 'vacuo_cutucada',
          coalesce(v_notif->>'titulo', 'O gestor pediu uma resposta agora'), v_notif->>'texto',
          '/whatsapp?conversa=' || p_conversa, p_conversa);

  insert into public.mensagens (organizacao_id, conversa_id, direcao, tipo, origem, status, conteudo, enviada_em)
  values (ve.organizacao_id, p_conversa, 'saida', 'nota_interna', 'bot', 'enviada',
          coalesce(public.radar_nota('nota.cutucada', v_par), 'O gestor pediu uma resposta para este cliente.'), now());

  return jsonb_build_object('ok', true, 'atendente', v_nome_dono, 'cutucadas', ve.cutucadas + 1);
end $function$;
CREATE OR REPLACE FUNCTION public.vacuo_decidir(p_conversa uuid, p_destino uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    insert into public.atd_notificacoes (organizacao_id, usuario_id, tipo, titulo, corpo, rota, ref_id) values
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
    insert into public.atd_notificacoes (organizacao_id, usuario_id, tipo, titulo, corpo, rota, ref_id)
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
  update public.atd_notificacoes set lida_em = now()
   where ref_id = p_conversa and lida_em is null
     and tipo in ('vacuo_decisao', 'vacuo_aviso', 'vacuo_fechado', 'vacuo_cutucada');

  return jsonb_build_object('decisao', v_decisao, 'para', coalesce(v_nome_para, v_nome_de));
end $function$;
CREATE OR REPLACE FUNCTION public.vacuo_decisoes_pendentes(p_org uuid)
 RETURNS TABLE(conversa_id uuid, contato_nome text, dono_id uuid, dono_nome text, desde timestamp with time zone, decisao_pedida_em timestamp with time zone, minutos_vacuo integer, prioritario boolean, prio_motivo text, sugerido_id uuid, sugerido_nome text, cutucado_em timestamp with time zone, cutucadas integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
CREATE OR REPLACE FUNCTION public.vacuo_eh_gestor(p_org uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select exists (select 1 from public.organizacao_usuarios ou
                 where ou.organizacao_id = p_org and ou.usuario_id = auth.uid()
                   and ou.papel = 'admin' and ou.status = 'ativo')
$function$;
CREATE OR REPLACE FUNCTION public.vacuo_melhor_fechador(p_org uuid, p_excluir uuid, p_janela_dias integer DEFAULT 30, p_min_recebidos integer DEFAULT 30)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;
CREATE OR REPLACE FUNCTION public.vacuo_minutos_uteis(p_ini timestamp with time zone, p_fim timestamp with time zone, p_h_ini integer, p_h_fim integer)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce(sum(greatest(0, extract(epoch from (
           least(p_fim, ((d.dia + make_interval(hours => p_h_fim)) at time zone 'America/Sao_Paulo'))
         - greatest(p_ini, ((d.dia + make_interval(hours => p_h_ini)) at time zone 'America/Sao_Paulo'))
         )) / 60.0))::int, 0)
  from generate_series(
         date_trunc('day', p_ini at time zone 'America/Sao_Paulo'),
         date_trunc('day', p_fim at time zone 'America/Sao_Paulo'),
         interval '1 day') as d(dia)
  where p_ini is not null and p_fim is not null and p_fim > p_ini
    and extract(isodow from d.dia) between 1 and 5   -- sábado (6) e domingo (7) não contam
$function$;
CREATE OR REPLACE FUNCTION public.vacuo_ranking(p_org uuid)
 RETURNS TABLE(usuario_id uuid, nome text, fechados bigint, recebidos bigint, taxa numeric, punicoes bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
          and vr.decisao = 'repassado' and vr.desfeito_em is null
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
$function$;
CREATE OR REPLACE FUNCTION public.wa_arquivar_conversa(p_conversa uuid, p_arquivar boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_org uuid;
begin
  select organizacao_id into v_org from conversas where id = p_conversa;
  if v_org is null then raise exception 'conversa_nao_encontrada'; end if;
  if not exists (select 1 from organizacao_usuarios ou where ou.organizacao_id = v_org and ou.usuario_id = auth.uid() and ou.status = 'ativo') then
    raise exception 'sem_permissao';
  end if;
  if p_arquivar then
    update conversas set arquivada_em = now(), arquivada_por = auth.uid() where id = p_conversa;
  else
    update conversas set arquivada_em = null, arquivada_por = null where id = p_conversa;
  end if;
end $function$;
CREATE OR REPLACE FUNCTION public.wa_canais_alertas_globais(p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare r jsonb;
begin
  if not (public.is_member(p_org) or public.is_platform_admin()) then
    raise exception 'sem_acesso' using errcode='insufficient_privilege';
  end if;
  with base as (
    select c.id, c.nome_interno, c.status_integracao, c.envio_restrito, c.health_check_status,
           c.health_check_fail_count, c.alerta_silenciado, c.alerta_silenciado_ate, c.criado_em,
      -- severidade: 3=critico, 2=alto, 1=medio, 0=sem alerta
      case
        when c.envio_restrito or c.health_check_status = 'restrito' then 3
        when c.health_check_status = 'falha' or coalesce(c.health_check_fail_count,0) >= 2 then 2
        when c.status_integracao = 'desconectado' or c.health_check_status = 'atencao' then 1
        else 0
      end sev
    from canais c
    where c.organizacao_id = p_org and c.provider = 'evolution' and c.status_integracao <> 'removido'
  ),
  ativos as (
    -- descarta sem alerta e silenciados vigentes (silenciado=true e (ate nulo OU ate no futuro))
    select * from base
    where sev > 0
      and not (alerta_silenciado and (alerta_silenciado_ate is null or alerta_silenciado_ate > now()))
  ),
  itens as (
    select id, nome_interno, sev,
      case sev when 3 then 'critico' when 2 then 'alto' else 'medio' end severidade,
      case
        when envio_restrito or health_check_status='restrito' then 'envio_restrito'
        when health_check_status='falha' or coalesce(health_check_fail_count,0)>=2 then 'health_falha'
        when status_integracao='desconectado' then 'desconectado'
        else 'health_atencao'
      end tipo_alerta,
      case
        when health_check_status='restrito' then '🚨 WhatsApp '||nome_interno||' foi restringido automaticamente após falhas consecutivas.'
        when envio_restrito then '⚠️ WhatsApp '||nome_interno||' com envio restrito. O sistema bloqueou envios para proteger o número.'
        when health_check_status='falha' or coalesce(health_check_fail_count,0)>=2 then '⚠️ WhatsApp '||nome_interno||' apresentou falha no último teste de saúde.'
        when status_integracao='desconectado' then '⚠️ WhatsApp '||nome_interno||' está desconectado. Reconecte em Integrações > WhatsApp.'
        else '⚠️ WhatsApp '||nome_interno||' em atenção no teste de saúde.'
      end titulo
    from ativos
  )
  select jsonb_build_object(
    'total', (select count(*) from itens),
    'criticos', (select count(*) from itens where sev=3),
    'altos', (select count(*) from itens where sev=2),
    'medios', (select count(*) from itens where sev=1),
    'severidade_max', coalesce((select max(sev) from itens),0),
    'acao_url', '/atd_integracoes',
    'itens', coalesce((select jsonb_agg(jsonb_build_object(
        'canal_id', id, 'nome_interno', nome_interno, 'severidade', severidade, 'tipo_alerta', tipo_alerta,
        'titulo', titulo, 'acao_label', 'Ver detalhes', 'acao_url', '/atd_integracoes'
      ) order by sev desc, nome_interno) from itens), '[]'::jsonb)
  ) into r;
  return r;
end $function$;
CREATE OR REPLACE FUNCTION public.wa_canal_reativar_alerta(p_canal uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_org uuid;
begin
  select organizacao_id into v_org from canais where id = p_canal;
  if v_org is null then raise exception 'canal_nao_encontrado'; end if;
  if not (public.is_platform_admin() or (public.is_member(v_org) and public.papel_na_org(v_org) = any (array['admin','supervisor']::user_role[]))) then
    raise exception 'sem_permissao';
  end if;
  update canais set alerta_silenciado = false, alerta_silenciado_ate = null, alerta_silenciado_motivo = null, alerta_silenciado_por = null
  where id = p_canal;
  insert into audit_log (usuario_id, acao, entidade, entidade_id, dados_depois, organizacao_id)
  values (auth.uid(), 'reativar_alerta_canal', 'canais', p_canal, jsonb_build_object('reativado', true), v_org);
  return jsonb_build_object('ok', true, 'canal', p_canal);
end $function$;
CREATE OR REPLACE FUNCTION public.wa_canal_silenciar_alerta(p_canal uuid, p_ate timestamp with time zone, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_org uuid;
begin
  select organizacao_id into v_org from canais where id = p_canal;
  if v_org is null then raise exception 'canal_nao_encontrado'; end if;
  if not (public.is_platform_admin() or (public.is_member(v_org) and public.papel_na_org(v_org) = any (array['admin','supervisor']::user_role[]))) then
    raise exception 'sem_permissao';
  end if;
  if p_motivo is null or btrim(p_motivo) = '' then raise exception 'motivo_obrigatorio'; end if;
  update canais set alerta_silenciado = true, alerta_silenciado_ate = p_ate, alerta_silenciado_motivo = p_motivo, alerta_silenciado_por = auth.uid()
  where id = p_canal;
  insert into audit_log (usuario_id, acao, entidade, entidade_id, dados_depois, organizacao_id)
  values (auth.uid(), 'silenciar_alerta_canal', 'canais', p_canal,
          jsonb_build_object('ate', p_ate, 'motivo', p_motivo), v_org);
  return jsonb_build_object('ok', true, 'canal', p_canal);
end $function$;
CREATE OR REPLACE FUNCTION public.wa_consolidar_canal_por_numero(p_org uuid, p_canal_ativo uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_num text; v_prov text; v_hist uuid; v_hist_nome text;
begin
  select numero_conectado, provider into v_num, v_prov
  from canais where id = p_canal_ativo and organizacao_id = p_org and tipo = 'whatsapp';
  if v_num is null then return p_canal_ativo; end if;

  -- outro canal (NÃO removido) com o MESMO número? (o mais antigo)
  select id, nome_interno into v_hist, v_hist_nome from canais
   where organizacao_id = p_org and tipo = 'whatsapp' and provider = v_prov
     and numero_conectado = v_num and id <> p_canal_ativo
     and status_integracao <> 'removido'
   order by criado_em asc limit 1;
  if v_hist is null then return p_canal_ativo; end if;   -- sem conflito: canal novo segue normal

  -- CONFLITO: não funde, não deleta, não reativa o antigo. Só marca o canal novo e sinaliza no painel.
  update canais set status_integracao = 'atencao', ativo = false, conflito_com = v_hist, conflito_em = now()
   where id = p_canal_ativo;

  insert into audit_log(organizacao_id, usuario_id, acao, entidade, entidade_id, dados_depois)
  values (p_org, null, 'canal_conflito_numero', 'canais', p_canal_ativo,
          jsonb_build_object('canal_novo', p_canal_ativo, 'conflita_com', v_hist, 'nome_existente', v_hist_nome, 'numero', right(v_num, 4)));

  return v_hist;
end $function$;
CREATE OR REPLACE FUNCTION public.wa_dentro_janela(p_canal uuid, p_contato uuid, p_horas integer DEFAULT 24)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_org uuid; v_ult timestamptz;
begin
  select organizacao_id into v_org from public.canais where id = p_canal;
  if v_org is null then return false; end if;

  -- auth.uid() null = service_role (worker/webhook). Usuário logado só enxerga a própria org.
  if auth.uid() is not null and not (public.is_platform_admin() or public.is_member(v_org)) then
    return false;
  end if;

  select ultima_entrada_em into v_ult from public.canal_janela
   where canal_id = p_canal and contato_id = p_contato;

  -- sem registro = o contato NUNCA falou com este número = janela fechada. É o estado
  -- correto de um número de disparo recém-criado.
  return coalesce(v_ult > now() - make_interval(hours => greatest(p_horas, 1)), false);
end $function$;
CREATE OR REPLACE FUNCTION public.wa_entrega_auto_resumo(p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare r jsonb;
begin
  if not (public.is_member(p_org) or public.is_platform_admin()) then
    raise exception 'sem_acesso' using errcode = 'insufficient_privilege';
  end if;

  with canal as (
    select c.id, c.nome_interno, c.status_integracao::text as status_integracao, c.ativo,
           c.conflito_com, c.instancia_externa, c.envio_restrito
    from canais c
    where c.organizacao_id = p_org and c.tipo = 'whatsapp' and c.status_integracao <> 'removido'
  ),
  elegivel as (
    select k.*, (k.status_integracao = 'conectado' and k.ativo and k.conflito_com is null
                 and k.instancia_externa is not null and not k.envio_restrito) as apto
    from canal k
  ),
  -- SOMENTE o monitoramento oficial (tipo + destino 2825). Qualquer outro destino fica de fora.
  oficial as (
    select h.* from canal_health_runs h
    where h.tipo = 'entrega_automatica'
      and h.canal_id in (select id from canal)
      and (h.target_phone like '%2825')
  ),
  concl as (   -- concluídos, do mais recente p/ o mais antigo
    select o.canal_id, o.status_resultado, o.executado_em,
           row_number() over (partition by o.canal_id order by o.executado_em desc) as rn
    from oficial o where o.status_resultado <> 'aguardando_ack'
  ),
  janela as (  -- últimos 5 concluídos
    select c2.canal_id,
      count(*) filter (where c2.status_resultado in ('entregue','lida')) as entregues5,
      count(*) filter (where c2.status_resultado = 'ERROR')              as erros5,
      count(*) filter (where c2.status_resultado = 'timeout')            as timeouts5,
      count(*)                                                            as total5
    from concl c2 where c2.rn <= 5 group by c2.canal_id
  ),
  pausa as (
    select c3.canal_id,
      case when (count(*) filter (where c3.rn <= 3 and c3.status_resultado = 'ERROR') = 3)
                or (count(*) filter (where c3.rn <= 3 and c3.status_resultado = 'timeout') = 3)
                or (count(*) filter (where c3.rn <= 5) = 5
                    and count(*) filter (where c3.rn <= 5 and c3.status_resultado in ('entregue','lida')) = 0)
           then max(c3.executado_em) filter (where c3.rn = 1) + interval '1 hour'
      end as pausado_ate
    from concl c3 group by c3.canal_id
  ),
  hora as (
    select o.canal_id,
      count(*) filter (where o.status_resultado in ('entregue','lida')) as entregues,
      count(*) filter (where o.status_resultado not in ('entregue','lida','aguardando_ack')) as falhas,
      count(*) as total
    from oficial o where o.executado_em > now() - interval '1 hour' group by o.canal_id
  ),
  pendente as (  -- aguardando ACK há menos de 5 min ⇒ não oferecer novo teste
    select o.canal_id, bool_or(o.executado_em > now() - interval '5 minutes') as recente
    from oficial o where o.status_resultado = 'aguardando_ack' group by o.canal_id
  ),
  ultimo as (
    select distinct on (o.canal_id) o.canal_id, o.executado_em, o.status_resultado, o.latencia_ms, o.target_phone
    from oficial o order by o.canal_id, o.executado_em desc
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'canal_id', e.id,
    'canal', e.nome_interno,
    'apto', e.apto,
    'pausado_ate', p.pausado_ate,
    'estado', case when not e.apto then 'inativo'
                   when p.pausado_ate is not null and p.pausado_ate > now() then 'pausado'
                   else 'ativo' end,
    'destino', '••••2825',
    'frequencia_hora', 5,
    'pendente_recente', coalesce(pe.recente, false),
    'ultimo_em', ul.executado_em,
    'ultimo_resultado', ul.status_resultado,
    'ultimo_latencia_ms', ul.latencia_ms,
    'entregues_1h', coalesce(hr.entregues, 0),
    'falhas_1h', coalesce(hr.falhas, 0),
    'total_1h', coalesce(hr.total, 0),
    'entregues_5', coalesce(ja.entregues5, 0),
    'erros_5', coalesce(ja.erros5, 0),
    'timeouts_5', coalesce(ja.timeouts5, 0),
    -- Saúde pelos ÚLTIMOS 5 concluídos. Timeout NÃO vira restrito: restrito exige ERROR real.
    'saude', case
        when not e.apto then 'inativo'
        when coalesce(ja.total5, 0) = 0 then 'sem_dados'
        when coalesce(ja.entregues5, 0) >= 4 then 'saudavel'
        when coalesce(ja.entregues5, 0) = 3 then 'atencao'
        when coalesce(ja.entregues5, 0) >= 1 then 'instavel'
        when coalesce(ja.erros5, 0) >= 3 then 'restrito'      -- 0 entregas + ERROR real repetido
        else 'instavel'                                        -- 0 entregas por timeout ⇒ instável
      end
  ) order by e.nome_interno), '[]'::jsonb) into r
  from elegivel e
  left join pausa p on p.canal_id = e.id
  left join hora hr on hr.canal_id = e.id
  left join janela ja on ja.canal_id = e.id
  left join pendente pe on pe.canal_id = e.id
  left join ultimo ul on ul.canal_id = e.id;

  return r;
end $function$;
CREATE OR REPLACE FUNCTION public.wa_fixar_conversa(p_conversa uuid, p_fixar boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_org uuid;
begin
  select organizacao_id into v_org from conversas where id = p_conversa;
  if v_org is null then raise exception 'conversa_nao_encontrada'; end if;
  if not exists (
    select 1 from organizacao_usuarios ou
    where ou.organizacao_id = v_org and ou.usuario_id = auth.uid() and ou.status = 'ativo'
  ) then
    raise exception 'sem_permissao';
  end if;
  update conversas set fixada_em = case when p_fixar then now() else null end where id = p_conversa;
end $function$;
CREATE OR REPLACE FUNCTION public.wa_inbound_garantir_contato_conversa(p_org uuid, p_canal uuid, p_phone text, p_phone_jid text DEFAULT NULL::text, p_lid text DEFAULT NULL::text, p_lid_jid text DEFAULT NULL::text, p_push_name text DEFAULT NULL::text, p_prende boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_phone   text := nullif(btrim(coalesce(p_phone, '')), '');
  v_lid     text := nullif(btrim(coalesce(p_lid, '')), '');
  v_chave   text;
  v_agora   timestamptz := now();
  v_k       bigint;
  v_contato uuid;
  v_criado  boolean := false;
  v_pn_rec  boolean := false;
  v_conv    uuid;
  v_preso   uuid;
  v_conv_criada boolean := false;
begin
  if p_org is null or p_canal is null then raise exception 'parametros_invalidos'; end if;
  if v_phone is null and v_lid is null then raise exception 'sem_identificador'; end if;
  v_chave := public.chave_canonica_telefone(v_phone);

  -- 1) TRAVA POR PESSOA, até o COMMIT desta chamada. Chaves em ordem crescente = sem deadlock entre
  --    um evento PN+LID e outro só-PN / só-LID da mesma pessoa. Cada statement seguinte (READ
  --    COMMITTED + função VOLATILE) tira snapshot NOVO, então quem esperou enxerga o que o
  --    anterior commitou.
  for v_k in
    select distinct t.k
      from unnest(array[
        case when v_chave is not null then hashtextextended('wa_inbound:' || p_org::text || ':pn:'  || v_chave, 0) end,
        case when v_lid   is not null then hashtextextended('wa_inbound:' || p_org::text || ':lid:' || v_lid,   0) end
      ]) as t(k)
     where t.k is not null
     order by t.k
  loop
    perform pg_advisory_xact_lock(v_k);
  end loop;

  -- 2) RESOLVE — igual ao webhook: chave canônica (v30, com o desempate validado) → LID (v21).
  if v_phone is not null then
    v_contato := public.wa_resolver_contato_por_numero(p_org, v_phone);
  end if;
  if v_contato is null and v_lid is not null then
    select ci.contato_id into v_contato
      from public.contato_identidades ci
     where ci.organizacao_id = p_org
       and ci.tipo = 'outro' and ci.provedor = 'evolution_lid'
       and ci.valor_normalizado = v_lid
     limit 1;
  end if;

  -- 3) CRIA — mesmos campos do INSERT do webhook. O LID nunca vira nome (v20).
  if v_contato is null then
    insert into public.contatos (nome, telefone, origem, organizacao_id,
                                 identidade_tipo, identidade_fonte, identidade_resolvida_em)
    values (coalesce(nullif(p_push_name, ''), v_phone, 'Identidade protegida'), v_phone, 'WhatsApp', p_org,
            case when v_phone is not null then 'telefone'   else 'lid_pendente' end,
            case when v_phone is not null then 'webhook_pn' else 'webhook_lid'  end,
            case when v_phone is not null then v_agora end)
    returning id into v_contato;
    v_criado := true;
  end if;

  -- 4) #7 AUTO-RECUPERAÇÃO de PN: identidade WhatsApp só se o contato não tem NENHUMA (não sobrescreve
  --    PN diferente já existente). ON CONFLICT DO NOTHING = o mesmo efeito do erro ignorado de antes
  --    (número já é identidade de outro contato), mas sem abortar a transação.
  if v_phone is not null and not exists (
       select 1 from public.contato_identidades where contato_id = v_contato and tipo = 'whatsapp') then
    insert into public.contato_identidades (contato_id, organizacao_id, tipo, provedor, valor,
                                            valor_normalizado, principal, metadados)
    values (v_contato, p_org, 'whatsapp', 'evolution', coalesce(nullif(p_phone_jid, ''), v_phone),
            v_phone, true, jsonb_build_object('origem', 'webhook'))
    on conflict do nothing;
    -- v32: re-dispatch só quando a identidade ENTROU de fato (FOUND). Se o ON CONFLICT pulou, o
    -- contato continua sem destino (bot-runner/ia-sdr leem SÓ contato_identidades) e re-disparar
    -- daria só mais um sem_destino_envio. Contato NOVO já nasce com o dispatch normal deste evento.
    v_pn_rec := found and not v_criado;
    update public.contatos
       set telefone = v_phone, identidade_tipo = 'telefone',
           identidade_resolvida_em = v_agora, identidade_fonte = 'webhook_pn'
     where id = v_contato and telefone is null;
    update public.contatos
       set nome = coalesce(nullif(p_push_name, ''), v_phone)
     where id = v_contato and nome = 'Identidade protegida';
  end if;

  -- 5) identidade LID, se ninguém da org tem esse LID ainda.
  if v_lid is not null and not exists (
       select 1 from public.contato_identidades
        where organizacao_id = p_org and tipo = 'outro' and provedor = 'evolution_lid'
          and valor_normalizado = v_lid) then
    insert into public.contato_identidades (contato_id, organizacao_id, tipo, provedor, valor,
                                            valor_normalizado, principal)
    values (v_contato, p_org, 'outro', 'evolution_lid', coalesce(nullif(p_lid_jid, ''), v_lid), v_lid, false)
    on conflict do nothing;
  end if;

  -- 6) CONVERSA — UM atendimento ativo por contato (v27): não-arquivada primeiro; arquivada só se for
  --    a única (o webhook a reabre). Nova nasce com canal atual = canal de aquisição; presa se o canal
  --    prende (v31).
  select cv.id, cv.canal_preso_id into v_conv, v_preso
    from public.conversas cv
   where cv.organizacao_id = p_org and cv.contato_id = v_contato and cv.status <> 'fechada'
   order by cv.arquivada_em asc nulls first, cv.ultima_interacao_em desc nulls last
   limit 1;
  if v_conv is null then
    begin
      insert into public.conversas (organizacao_id, contato_id, canal_id, canal_origem_id, status,
                                    canal_preso_id, canal_preso_em)
      values (p_org, v_contato, p_canal, p_canal, 'aberta',
              case when p_prende then p_canal end, case when p_prende then v_agora end)
      returning id, canal_preso_id into v_conv, v_preso;
      v_conv_criada := true;
    exception when unique_violation then
      -- outra via que NÃO passa por esta trava (painel, cloud-webhook) criou a ativa entre o SELECT
      -- e o INSERT: usa a dela em vez de perder a mensagem.
      select cv.id, cv.canal_preso_id into v_conv, v_preso
        from public.conversas cv
       where cv.organizacao_id = p_org and cv.contato_id = v_contato and cv.status <> 'fechada'
       order by cv.arquivada_em asc nulls first, cv.ultima_interacao_em desc nulls last
       limit 1;
    end;
  end if;

  return jsonb_build_object(
    'contato_id',      v_contato,
    'contato_criado',  v_criado,
    'pn_recuperado',   v_pn_rec,
    'conversa_id',     v_conv,
    'conversa_criada', v_conv_criada,
    'canal_preso_id',  v_preso
  );
end $function$;
CREATE OR REPLACE FUNCTION public.wa_janela_registrar(p_canal uuid, p_contato uuid, p_quando timestamp with time zone DEFAULT now())
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_org uuid;
begin
  select organizacao_id into v_org from public.canais where id = p_canal;
  if v_org is null or p_contato is null then return; end if;      -- best-effort: nunca quebra a ingestão

  insert into public.canal_janela (canal_id, contato_id, organizacao_id, ultima_entrada_em)
  values (p_canal, p_contato, v_org, coalesce(p_quando, now()))
  on conflict (canal_id, contato_id) do update
    set ultima_entrada_em = greatest(public.canal_janela.ultima_entrada_em, excluded.ultima_entrada_em),
        atualizado_em = now();
end $function$;
CREATE OR REPLACE FUNCTION public.wa_marcar_lida(p_conversa uuid, p_lida boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_org uuid;
begin
  select organizacao_id into v_org from conversas where id = p_conversa;
  if v_org is null then raise exception 'conversa_nao_encontrada'; end if;
  if not exists (select 1 from organizacao_usuarios ou where ou.organizacao_id = v_org and ou.usuario_id = auth.uid() and ou.status = 'ativo') then
    raise exception 'sem_permissao';
  end if;
  if p_lida then
    update conversas set nao_lidas = 0, ultima_lida_em = now() where id = p_conversa;
  else
    update conversas set nao_lidas = greatest(coalesce(nao_lidas,0), 1), ultima_lida_em = null where id = p_conversa;
  end if;
end $function$;
CREATE OR REPLACE FUNCTION public.wa_optout_inbound(p_conversa uuid, p_texto text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_contato uuid; v_canal uuid; v_txt text;
begin
  v_txt := btrim(coalesce(p_texto, ''));

  if not (
       -- (a) mensagem-comando: só a palavra (com pontuação/emoji ao redor), ex. "SAIR", "Parar!", "stop"
       (length(v_txt) <= 24 and v_txt ~* '^\W*(sair|parar|pare|stop|remover|descadastrar?)\W*$')
       -- (b) frase explícita de descadastro, em qualquer tamanho
    or v_txt ~* 'n[ãa]o quero (mais )?(receber|mensag)'
    or v_txt ~* 'n[ãa]o (me )?(mande|mandem|manda|envie|enviem|chame|chamem) mais'
    or v_txt ~* 'par(e|a|em) de (me )?(mandar|enviar|chamar|encher)'
    or v_txt ~* '\y(descadastr|cancelar? (a )?inscri)'
    or v_txt ~* 'me (remova|remove|tira|tire)( meu (nome|n[uú]mero))? .{0,16}(lista|contatos|grupo)'
    or v_txt ~* '(tira|tire|remova|remover?) (meu )?(nome|n[uú]mero|contato) .{0,16}lista'
    or v_txt ~* 'remover? (meu )?(n[uú]mero|contato)'
    or v_txt ~* 'sair (d\w+ )?lista'
    or v_txt ~* 'chega de (mensagem|msg|propaganda)'
  ) then
    return false;
  end if;

  select contato_id, canal_id into v_contato, v_canal from public.conversas where id = p_conversa;
  if v_contato is null or v_canal is null then return false; end if;

  perform public.wa_optout_registrar(v_contato, v_canal, 'sair_texto', left(coalesce(p_texto,''), 300));
  return true;
end $function$;
CREATE OR REPLACE FUNCTION public.wa_optout_registrar(p_contato uuid, p_canal uuid, p_motivo text, p_detalhe text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_org uuid; v_waba text;
begin
  select organizacao_id, cloud_waba_id into v_org, v_waba from public.canais where id = p_canal;
  if v_org is null or p_contato is null then return; end if;
  if p_motivo not in ('erro_131050', 'user_preferences', 'manual', 'sair_texto') then raise exception 'motivo_invalido'; end if;

  insert into public.atd_wa_optout (contato_id, canal_id, organizacao_id, waba_id, motivo, detalhe)
  values (p_contato, p_canal, v_org, v_waba, p_motivo, left(coalesce(p_detalhe, ''), 300))
  on conflict (contato_id, canal_id) do nothing;   -- o primeiro "não quero" é o que vale
end $function$;
CREATE OR REPLACE FUNCTION public.wa_resolver_contato_por_numero(p_org uuid, p_numero text)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_chave text; v_contato uuid; v_mesclado uuid;
begin
  v_chave := public.chave_canonica_telefone(p_numero);
  if v_chave is null then return null; end if;

  -- (a) identidade WhatsApp pela chave canônica.
  --
  -- DESEMPATE — a ordem importa e foi validada contra os 14 grupos reais:
  --  1. não-mesclado          nunca ressuscita um contato já mesclado
  --  2. TEM MENSAGEM          conversas.ultima_interacao_em é preenchida na CRIAÇÃO da conversa,
  --                           então contato importado com 0 mensagens parece "recente" e roubaria
  --                           a thread real (caso ANIRLEI 0 msgs/10-07 x 7 msgs/30-06). EXISTS é
  --                           barato (idx_mensagens_conversa), não é count().
  --  3. atividade DESC        segue ONDE O HUMANO ESTÁ TRABALHANDO. Preferir o mais ANTIGO
  --                           mataria a conversa viva e abriria uma vazia no lugar — pior que a
  --                           duplicata que estamos consertando.
  --  4-6. principal, criado_em, id  determinismo: dois eventos simultâneos escolhem o MESMO
  --                           contato; sem isso o webhook faria split-brain sob concorrência.
  select c.id, c.mesclado_para into v_contato, v_mesclado
  from public.contato_identidades ci
  join public.contatos c on c.id = ci.contato_id
  where ci.organizacao_id = p_org
    and ci.tipo = 'whatsapp'
    and ci.chave_canonica = v_chave
  order by
    (c.mesclado_para is null) desc,
    exists (select 1 from public.conversas cv
            join public.mensagens m on m.conversa_id = cv.id
            where cv.contato_id = c.id) desc,
    (select max(cv.ultima_interacao_em) from public.conversas cv
     where cv.contato_id = c.id) desc nulls last,
    ci.principal desc, ci.criado_em asc, ci.id asc
  limit 1;

  -- (b) fallback: telefone do CRM pela mesma chave (contato criado à mão, sem identidade).
  if v_contato is null then
    select c.id, c.mesclado_para into v_contato, v_mesclado
    from public.contatos c
    where c.organizacao_id = p_org
      and public.chave_canonica_telefone(c.telefone) = v_chave
    order by
      (c.mesclado_para is null) desc,
      exists (select 1 from public.conversas cv
              join public.mensagens m on m.conversa_id = cv.id
              where cv.contato_id = c.id) desc,
      (select max(cv.ultima_interacao_em) from public.conversas cv
       where cv.contato_id = c.id) desc nulls last,
      c.criado_em asc, c.id asc
    limit 1;
  end if;

  -- contato já mesclado -> devolve o alvo do merge (nunca ressuscita o mesclado).
  return coalesce(v_mesclado, v_contato);
end $function$;
CREATE OR REPLACE FUNCTION public.wa_templates_touch()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin new.atualizado_em := now(); return new; end $function$;
CREATE OR REPLACE FUNCTION public.wa_vincular_numero(p_conversa uuid, p_numero text, p_jid text, p_usuario uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_org uuid; v_contato uuid; v_canal uuid; v_norm text; v_tel text;
begin
  select cv.organizacao_id, cv.contato_id, cv.canal_id into v_org, v_contato, v_canal
  from conversas cv where cv.id = p_conversa;
  if v_contato is null then raise exception 'conversa_nao_encontrada'; end if;

  if not exists (select 1 from organizacao_usuarios ou
                 where ou.organizacao_id = v_org and ou.usuario_id = coalesce(auth.uid(), p_usuario) and ou.status = 'ativo') then
    raise exception 'sem_permissao';
  end if;

  v_norm := regexp_replace(coalesce(p_numero,''), '[^0-9]', '', 'g');
  if length(v_norm) < 12 then raise exception 'numero_invalido'; end if;

  -- CONFLITO: PN já é identidade de OUTRO contato → não faz merge automático (alerta p/ revisão manual).
  if exists (select 1 from contato_identidades i
             where i.organizacao_id = v_org and i.tipo = 'whatsapp' and i.valor_normalizado = v_norm and i.contato_id <> v_contato) then
    raise exception 'pn_em_outro_contato';
  end if;
  if exists (select 1 from contato_identidades i
             where i.contato_id = v_contato and i.tipo = 'whatsapp' and i.valor_normalizado <> v_norm) then
    raise exception 'pn_confirmado_diferente_existe';
  end if;

  if not exists (select 1 from contato_identidades i
                 where i.contato_id = v_contato and i.tipo = 'whatsapp' and i.valor_normalizado = v_norm) then
    insert into contato_identidades (contato_id, organizacao_id, tipo, provedor, valor, valor_normalizado, principal, metadados)
    values (v_contato, v_org, 'whatsapp', 'evolution', coalesce(p_jid, v_norm || '@s.whatsapp.net'), v_norm, true,
            jsonb_build_object('origem','manual','vinculado_por', coalesce(auth.uid(), p_usuario), 'em', now()::text, 'canal_id', v_canal));
  end if;

  select telefone into v_tel from contatos where id = v_contato;
  if v_tel is null or btrim(v_tel) = '' then
    update contatos set telefone = v_norm where id = v_contato;
  end if;

  -- Estado de identidade + corrige nome placeholder (vínculo manual não tem pushName → usa o número).
  update contatos set identidade_tipo = 'resolvido_manual', identidade_resolvida_em = now(), identidade_fonte = 'manual'
   where id = v_contato;
  update contatos set nome = v_norm where id = v_contato and nome = 'Identidade protegida';

  -- Mapa LID↔PN por canal: confirma os existentes e insere os que faltam (reuso futuro).
  update wa_lid_map m set telefone_normalizado = v_norm, jid_telefone = coalesce(p_jid, v_norm || '@s.whatsapp.net'),
         confirmado = true, fonte = 'manual'
    from contato_identidades ci
   where ci.contato_id = v_contato and ci.provedor = 'evolution_lid'
     and m.organizacao_id = v_org and m.lid = ci.valor_normalizado
     and (m.canal_id = v_canal or (m.canal_id is null and v_canal is null));
  insert into wa_lid_map (organizacao_id, canal_id, lid, jid_telefone, telefone_normalizado, fonte, confirmado)
    select v_org, v_canal, ci.valor_normalizado, coalesce(p_jid, v_norm || '@s.whatsapp.net'), v_norm, 'manual', true
    from contato_identidades ci
   where ci.contato_id = v_contato and ci.provedor = 'evolution_lid'
     and not exists (select 1 from wa_lid_map m where m.organizacao_id = v_org and m.lid = ci.valor_normalizado
         and (m.canal_id = v_canal or (m.canal_id is null and v_canal is null)));

  return jsonb_build_object('ok', true, 'contato', v_contato, 'numero_norm', v_norm);
end $function$;
alter sequence public.adm_movimentos_id_seq owned by public.adm_movimentos.id;
alter sequence public.iris_teste_limpezas_id_seq owned by public.iris_teste_limpezas.id;
alter sequence public.presenciais_avisos_id_seq owned by public.presenciais_avisos.id;

-- 8. gatilhos
drop trigger if exists trg_agendamentos_guarda on public.agendamentos;
CREATE TRIGGER trg_agendamentos_guarda BEFORE UPDATE ON public.agendamentos FOR EACH ROW EXECUTE FUNCTION agendamentos_guarda();
drop trigger if exists trg_agendamentos_log on public.agendamentos;
CREATE TRIGGER trg_agendamentos_log AFTER INSERT OR UPDATE ON public.agendamentos FOR EACH ROW EXECUTE FUNCTION agendamentos_log();
drop trigger if exists trg_agendamentos_touch on public.agendamentos;
CREATE TRIGGER trg_agendamentos_touch BEFORE UPDATE ON public.agendamentos FOR EACH ROW EXECUTE FUNCTION agendamentos_touch();
drop trigger if exists trg_assinatura_upd on public.assinaturas;
CREATE TRIGGER trg_assinatura_upd BEFORE UPDATE ON public.assinaturas FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();
drop trigger if exists trg_audit on public.assinaturas;
CREATE TRIGGER trg_audit AFTER INSERT OR DELETE OR UPDATE ON public.assinaturas FOR EACH ROW EXECUTE FUNCTION fn_audit();
drop trigger if exists trg_bot_canal_config_upd on public.bot_canal_config;
CREATE TRIGGER trg_bot_canal_config_upd BEFORE UPDATE ON public.bot_canal_config FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();
drop trigger if exists trg_alerta_lq_fluxo_concluido on public.bot_conversa_estado;
CREATE TRIGGER trg_alerta_lq_fluxo_concluido AFTER UPDATE OF dados_qualificacao ON public.bot_conversa_estado FOR EACH ROW WHEN ((((old.dados_qualificacao ->> 'passo_botoes'::text) IS DISTINCT FROM 'fim'::text) AND ((new.dados_qualificacao ->> 'passo_botoes'::text) = 'fim'::text))) EXECUTE FUNCTION fn_alerta_lq_fluxo_concluido();
drop trigger if exists trg_bot_estado_upd on public.bot_conversa_estado;
CREATE TRIGGER trg_bot_estado_upd BEFORE UPDATE ON public.bot_conversa_estado FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();
drop trigger if exists trg_opp_move_qualificado on public.bot_conversa_estado;
CREATE TRIGGER trg_opp_move_qualificado AFTER INSERT OR UPDATE OF etapa, concluido_em ON public.bot_conversa_estado FOR EACH ROW EXECUTE FUNCTION fn_opp_move_qualificado();
drop trigger if exists trg_bot_saida_upd on public.bot_mensagens_saida;
CREATE TRIGGER trg_bot_saida_upd BEFORE UPDATE ON public.bot_mensagens_saida FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();
drop trigger if exists trg_bot_remarketing_updated on public.bot_remarketing;
CREATE TRIGGER trg_bot_remarketing_updated BEFORE UPDATE ON public.bot_remarketing FOR EACH ROW EXECUTE FUNCTION bot_remarketing_touch_updated();
drop trigger if exists trg_canais_upd on public.canais;
CREATE TRIGGER trg_canais_upd BEFORE UPDATE ON public.canais FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();
drop trigger if exists trg_canal_snapshot_before_delete on public.canais;
CREATE TRIGGER trg_canal_snapshot_before_delete BEFORE DELETE ON public.canais FOR EACH ROW EXECUTE FUNCTION fn_canal_snapshot_before_delete();
drop trigger if exists trg_limite_canais on public.canais;
CREATE TRIGGER trg_limite_canais BEFORE INSERT OR UPDATE ON public.canais FOR EACH ROW EXECUTE FUNCTION checa_limite_canais();
drop trigger if exists trg_ciclos_venc_touch on public.ciclos_vencimento;
CREATE TRIGGER trg_ciclos_venc_touch BEFORE UPDATE ON public.ciclos_vencimento FOR EACH ROW EXECUTE FUNCTION fn_ciclo_venc_touch();
drop trigger if exists trg_audit on public.cobranca_pagamentos;
CREATE TRIGGER trg_audit AFTER INSERT OR DELETE OR UPDATE ON public.cobranca_pagamentos FOR EACH ROW EXECUTE FUNCTION fn_audit();
drop trigger if exists trg_cobranca_recalc on public.cobranca_pagamentos;
CREATE TRIGGER trg_cobranca_recalc AFTER INSERT OR DELETE OR UPDATE ON public.cobranca_pagamentos FOR EACH ROW EXECUTE FUNCTION fn_cobranca_recalc();
drop trigger if exists trg_pag_touch on public.cobranca_pagamentos;
CREATE TRIGGER trg_pag_touch BEFORE UPDATE ON public.cobranca_pagamentos FOR EACH ROW EXECUTE FUNCTION fn_cobranca_pag_touch();
drop trigger if exists trg_audit on public.cobrancas;
CREATE TRIGGER trg_audit AFTER INSERT OR DELETE OR UPDATE ON public.cobrancas FOR EACH ROW EXECUTE FUNCTION fn_audit();
drop trigger if exists trg_cobranca_before on public.cobrancas;
CREATE TRIGGER trg_cobranca_before BEFORE INSERT OR UPDATE ON public.cobrancas FOR EACH ROW EXECUTE FUNCTION fn_cobranca_before();
drop trigger if exists trg_config_upd on public.configuracoes;
CREATE TRIGGER trg_config_upd BEFORE UPDATE ON public.configuracoes FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();
drop trigger if exists trg_contato_ident_upd on public.contato_identidades;
CREATE TRIGGER trg_contato_ident_upd BEFORE UPDATE ON public.contato_identidades FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();
drop trigger if exists trg_audit on public.contatos;
CREATE TRIGGER trg_audit AFTER INSERT OR DELETE OR UPDATE ON public.contatos FOR EACH ROW EXECUTE FUNCTION fn_audit();
drop trigger if exists trg_contatos_upd on public.contatos;
CREATE TRIGGER trg_contatos_upd BEFORE UPDATE ON public.contatos FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();
drop trigger if exists trg_recado_dono_mudou on public.contatos;
CREATE TRIGGER trg_recado_dono_mudou AFTER UPDATE OF responsavel_id ON public.contatos FOR EACH ROW WHEN ((new.responsavel_id IS DISTINCT FROM old.responsavel_id)) EXECUTE FUNCTION recado_dono_mudou();
drop trigger if exists trg_sla_contato_assumido on public.contatos;
CREATE TRIGGER trg_sla_contato_assumido AFTER UPDATE ON public.contatos FOR EACH ROW EXECUTE FUNCTION sla_contato_assumido();
drop trigger if exists trg_sync_responsavel_cliente on public.contatos;
CREATE TRIGGER trg_sync_responsavel_cliente AFTER UPDATE OF responsavel_id ON public.contatos FOR EACH ROW WHEN ((new.responsavel_id IS DISTINCT FROM old.responsavel_id)) EXECUTE FUNCTION trg_fn_sync_responsavel_cliente();
drop trigger if exists trg_conversa_antonio_dono on public.conversas;
CREATE TRIGGER trg_conversa_antonio_dono AFTER UPDATE OF atendente_id ON public.conversas FOR EACH ROW WHEN ((new.atendente_id IS DISTINCT FROM old.atendente_id)) EXECUTE FUNCTION conversa_antonio_dono();
drop trigger if exists trg_conversa_atribui_canal on public.conversas;
CREATE TRIGGER trg_conversa_atribui_canal AFTER INSERT ON public.conversas FOR EACH ROW EXECUTE FUNCTION fn_conversa_atribui_canal();
drop trigger if exists trg_conversa_passou_humano on public.conversas;
CREATE TRIGGER trg_conversa_passou_humano AFTER UPDATE OF precisa_humano ON public.conversas FOR EACH ROW WHEN ((new.precisa_humano AND (NOT COALESCE(old.precisa_humano, false)))) EXECUTE FUNCTION conversa_passou_humano();
drop trigger if exists trg_conversas_upd on public.conversas;
CREATE TRIGGER trg_conversas_upd BEFORE UPDATE ON public.conversas FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();
drop trigger if exists trg_recado_dono_mudou on public.conversas;
CREATE TRIGGER trg_recado_dono_mudou AFTER UPDATE OF atendente_id ON public.conversas FOR EACH ROW WHEN ((new.atendente_id IS DISTINCT FROM old.atendente_id)) EXECUTE FUNCTION recado_dono_mudou();
drop trigger if exists trg_sla_conversa_atendente on public.conversas;
CREATE TRIGGER trg_sla_conversa_atendente BEFORE UPDATE ON public.conversas FOR EACH ROW EXECUTE FUNCTION sla_conversa_atendente();
drop trigger if exists trg_etiqueta_delete_sync on public.etiquetas;
CREATE TRIGGER trg_etiqueta_delete_sync AFTER DELETE ON public.etiquetas FOR EACH ROW EXECUTE FUNCTION tg_etiqueta_delete_sync_cache();
drop trigger if exists trg_etiqueta_rename_sync on public.etiquetas;
CREATE TRIGGER trg_etiqueta_rename_sync AFTER UPDATE ON public.etiquetas FOR EACH ROW WHEN ((old.nome IS DISTINCT FROM new.nome)) EXECUTE FUNCTION tg_etiqueta_rename_sync_cache();
drop trigger if exists trg_ficha_biu on public.fichas_judiciais;
CREATE TRIGGER trg_ficha_biu BEFORE INSERT OR UPDATE ON public.fichas_judiciais FOR EACH ROW EXECUTE FUNCTION fn_ficha_before();
drop trigger if exists trg_fontes_upd on public.fontes_aquisicao;
CREATE TRIGGER trg_fontes_upd BEFORE UPDATE ON public.fontes_aquisicao FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();
drop trigger if exists trg_protege_coluna_entrada on public.funil_colunas;
CREATE TRIGGER trg_protege_coluna_entrada BEFORE DELETE OR UPDATE ON public.funil_colunas FOR EACH ROW EXECUTE FUNCTION fn_protege_coluna_entrada();
drop trigger if exists trg_ia_agentes_after_del on public.ia_agentes;
CREATE TRIGGER trg_ia_agentes_after_del AFTER DELETE ON public.ia_agentes FOR EACH ROW EXECUTE FUNCTION fn_ia_agentes_after_del();
drop trigger if exists trg_ia_agentes_before_del on public.ia_agentes;
CREATE TRIGGER trg_ia_agentes_before_del BEFORE DELETE ON public.ia_agentes FOR EACH ROW EXECUTE FUNCTION fn_ia_agentes_before_del();
drop trigger if exists trg_ia_agentes_before_ins on public.ia_agentes;
CREATE TRIGGER trg_ia_agentes_before_ins BEFORE INSERT ON public.ia_agentes FOR EACH ROW EXECUTE FUNCTION fn_ia_agentes_before_ins();
drop trigger if exists trg_ia_agentes_before_upd on public.ia_agentes;
CREATE TRIGGER trg_ia_agentes_before_upd BEFORE UPDATE ON public.ia_agentes FOR EACH ROW EXECUTE FUNCTION fn_ia_agentes_before_upd();
drop trigger if exists trg_ia_fluxos_before_del on public.ia_fluxos;
CREATE TRIGGER trg_ia_fluxos_before_del BEFORE DELETE ON public.ia_fluxos FOR EACH ROW EXECUTE FUNCTION fn_ia_fluxos_before_del();
drop trigger if exists trg_ia_fluxos_before_upd on public.ia_fluxos;
CREATE TRIGGER trg_ia_fluxos_before_upd BEFORE UPDATE ON public.ia_fluxos FOR EACH ROW EXECUTE FUNCTION fn_ia_fluxos_before_upd();
drop trigger if exists trg_ia_sessao_antonio_so_matheus on public.ia_sessoes;
CREATE TRIGGER trg_ia_sessao_antonio_so_matheus BEFORE INSERT OR UPDATE ON public.ia_sessoes FOR EACH ROW EXECUTE FUNCTION ia_sessao_antonio_so_matheus();
drop trigger if exists trg_audit on public.inss_pedidos;
CREATE TRIGGER trg_audit AFTER INSERT OR DELETE OR UPDATE ON public.inss_pedidos FOR EACH ROW EXECUTE FUNCTION fn_audit();
drop trigger if exists trg_inss_pedido_before on public.inss_pedidos;
CREATE TRIGGER trg_inss_pedido_before BEFORE UPDATE ON public.inss_pedidos FOR EACH ROW EXECUTE FUNCTION fn_inss_pedido_before();
drop trigger if exists trg_integracoes_upd on public.atd_integracoes;
CREATE TRIGGER trg_integracoes_upd BEFORE UPDATE ON public.atd_integracoes FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();
drop trigger if exists trg_iris_monitor_guarda on public.iris_eventos;
CREATE TRIGGER trg_iris_monitor_guarda AFTER INSERT ON public.iris_eventos FOR EACH ROW WHEN ((new.tipo = 'guarda_critica'::text)) EXECUTE FUNCTION iris_monitor_de_guarda();
drop trigger if exists trg_iris_followups_upd on public.iris_followups;
CREATE TRIGGER trg_iris_followups_upd BEFORE UPDATE ON public.iris_followups FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();
drop trigger if exists trg_iris_monitor_critico on public.iris_monitor_achados;
CREATE TRIGGER trg_iris_monitor_critico AFTER INSERT ON public.iris_monitor_achados FOR EACH ROW WHEN ((new.gravidade = 'critica'::text)) EXECUTE FUNCTION iris_monitor_alertar_critico();
drop trigger if exists trg_iris_textos_antes_update on public.iris_textos;
CREATE TRIGGER trg_iris_textos_antes_update BEFORE UPDATE ON public.iris_textos FOR EACH ROW EXECUTE FUNCTION iris_textos_antes_update();
drop trigger if exists trg_ligacoes_marcadas_upd on public.ligacoes_marcadas;
CREATE TRIGGER trg_ligacoes_marcadas_upd BEFORE UPDATE ON public.ligacoes_marcadas FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();
drop trigger if exists trg_alerta_lq_humano_cancela on public.mensagens;
CREATE TRIGGER trg_alerta_lq_humano_cancela AFTER INSERT ON public.mensagens FOR EACH ROW WHEN (((new.direcao = 'saida'::mensagem_direcao) AND (new.origem = ANY (ARRAY['atenvo'::text, 'telefone'::text])))) EXECUTE FUNCTION fn_alerta_lq_humano_cancela();
drop trigger if exists trg_alerta_lq_inbound_cancela on public.mensagens;
CREATE TRIGGER trg_alerta_lq_inbound_cancela AFTER INSERT ON public.mensagens FOR EACH ROW WHEN (((new.direcao = 'entrada'::mensagem_direcao) AND (COALESCE(new.origem, ''::text) <> ALL (ARRAY['sistema'::text, 'nota_interna'::text, 'teste_entrega'::text])))) EXECUTE FUNCTION fn_alerta_lq_inbound_cancela();
drop trigger if exists trg_conversa_ultima_entrada on public.mensagens;
CREATE TRIGGER trg_conversa_ultima_entrada AFTER INSERT ON public.mensagens FOR EACH ROW WHEN (((new.direcao = 'entrada'::mensagem_direcao) AND (new.conversa_id IS NOT NULL))) EXECUTE FUNCTION trg_fn_conversa_ultima_entrada();
drop trigger if exists trg_ia_sessao_mensagem on public.mensagens;
CREATE TRIGGER trg_ia_sessao_mensagem AFTER INSERT ON public.mensagens FOR EACH ROW EXECUTE FUNCTION fn_ia_sessao_mensagem();
drop trigger if exists trg_iris_cliente_escreveu on public.mensagens;
CREATE TRIGGER trg_iris_cliente_escreveu AFTER INSERT ON public.mensagens FOR EACH ROW WHEN (((new.direcao)::text = 'entrada'::text)) EXECUTE FUNCTION iris_cliente_escreveu();
drop trigger if exists trg_iris_followup_resposta on public.mensagens;
CREATE TRIGGER trg_iris_followup_resposta AFTER INSERT ON public.mensagens FOR EACH ROW WHEN ((new.direcao = 'entrada'::mensagem_direcao)) EXECUTE FUNCTION iris_followup_ao_receber();
drop trigger if exists trg_sla_mensagem_humano on public.mensagens;
CREATE TRIGGER trg_sla_mensagem_humano AFTER INSERT ON public.mensagens FOR EACH ROW EXECUTE FUNCTION sla_mensagem_humano();
drop trigger if exists trg_checklist_stamp on public.oportunidade_checklist;
CREATE TRIGGER trg_checklist_stamp BEFORE INSERT OR UPDATE ON public.oportunidade_checklist FOR EACH ROW EXECUTE FUNCTION fn_checklist_stamp();
drop trigger if exists trg_adm_trava_assinar on public.oportunidades;
CREATE TRIGGER trg_adm_trava_assinar BEFORE UPDATE OF coluna_id ON public.oportunidades FOR EACH ROW EXECUTE FUNCTION adm_trava_assinar();
drop trigger if exists trg_adm_trava_status on public.oportunidades;
CREATE TRIGGER trg_adm_trava_status BEFORE UPDATE OF status ON public.oportunidades FOR EACH ROW EXECUTE FUNCTION adm_trava_status();
drop trigger if exists trg_audit on public.oportunidades;
CREATE TRIGGER trg_audit AFTER INSERT OR DELETE OR UPDATE ON public.oportunidades FOR EACH ROW EXECUTE FUNCTION fn_audit();
drop trigger if exists trg_lead_fora_rs on public.oportunidades;
CREATE TRIGGER trg_lead_fora_rs AFTER INSERT ON public.oportunidades FOR EACH ROW EXECUTE FUNCTION trg_fn_lead_fora_rs();
drop trigger if exists trg_oportunidades_upd on public.oportunidades;
CREATE TRIGGER trg_oportunidades_upd BEFORE UPDATE ON public.oportunidades FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();
drop trigger if exists trg_opp_arquivar_perdido on public.oportunidades;
CREATE TRIGGER trg_opp_arquivar_perdido AFTER UPDATE ON public.oportunidades FOR EACH ROW WHEN (((new.status = 'perdido'::oportunidade_status) AND (old.status IS DISTINCT FROM 'perdido'::oportunidade_status))) EXECUTE FUNCTION fn_arquivar_conversa_perdido();
drop trigger if exists trg_opp_sync_fechamento on public.oportunidades;
CREATE TRIGGER trg_opp_sync_fechamento BEFORE UPDATE OF coluna_id ON public.oportunidades FOR EACH ROW EXECUTE FUNCTION opp_sync_fechamento();
drop trigger if exists trg_opp_touch on public.oportunidades;
CREATE TRIGGER trg_opp_touch BEFORE UPDATE ON public.oportunidades FOR EACH ROW EXECUTE FUNCTION opp_touch_atualizado();
drop trigger if exists trg_reverse_resp_oportunidade on public.oportunidades;
CREATE TRIGGER trg_reverse_resp_oportunidade AFTER UPDATE OF responsavel_id ON public.oportunidades FOR EACH ROW WHEN (((new.responsavel_id IS DISTINCT FROM old.responsavel_id) AND (new.status = 'em_andamento'::oportunidade_status))) EXECUTE FUNCTION trg_fn_reverse_resp_oportunidade();
drop trigger if exists trg_sla_opp_movimento on public.oportunidades;
CREATE TRIGGER trg_sla_opp_movimento BEFORE INSERT OR UPDATE ON public.oportunidades FOR EACH ROW EXECUTE FUNCTION sla_opp_movimento();
drop trigger if exists trg_audit on public.organizacao_limites;
CREATE TRIGGER trg_audit AFTER INSERT OR DELETE OR UPDATE ON public.organizacao_limites FOR EACH ROW EXECUTE FUNCTION fn_audit();
drop trigger if exists trg_org_lim_upd on public.organizacao_limites;
CREATE TRIGGER trg_org_lim_upd BEFORE UPDATE ON public.organizacao_limites FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();
drop trigger if exists trg_audit on public.organizacao_usuarios;
CREATE TRIGGER trg_audit AFTER INSERT OR DELETE OR UPDATE ON public.organizacao_usuarios FOR EACH ROW EXECUTE FUNCTION fn_audit();
drop trigger if exists trg_limite_usuarios on public.organizacao_usuarios;
CREATE TRIGGER trg_limite_usuarios BEFORE INSERT OR UPDATE ON public.organizacao_usuarios FOR EACH ROW EXECUTE FUNCTION checa_limite_usuarios();
drop trigger if exists trg_org_usr_upd on public.organizacao_usuarios;
CREATE TRIGGER trg_org_usr_upd BEFORE UPDATE ON public.organizacao_usuarios FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();
drop trigger if exists trg_org_seed_status on public.organizacoes;
CREATE TRIGGER trg_org_seed_status AFTER INSERT ON public.organizacoes FOR EACH ROW EXECUTE FUNCTION seed_status_conversa_padrao();
drop trigger if exists trg_org_upd on public.organizacoes;
CREATE TRIGGER trg_org_upd BEFORE UPDATE ON public.organizacoes FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();
drop trigger if exists trg_rmkt_score_evento on public.remarketing_eventos;
CREATE TRIGGER trg_rmkt_score_evento AFTER INSERT ON public.remarketing_eventos FOR EACH ROW EXECUTE FUNCTION trg_rmkt_score_evento();
drop trigger if exists trg_audit on public.scripts;
CREATE TRIGGER trg_audit AFTER INSERT OR DELETE OR UPDATE ON public.scripts FOR EACH ROW EXECUTE FUNCTION fn_audit();
drop trigger if exists trg_scripts_upd on public.scripts;
CREATE TRIGGER trg_scripts_upd BEFORE UPDATE ON public.scripts FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();
drop trigger if exists trg_sla_alertas_upd on public.sla_alertas;
CREATE TRIGGER trg_sla_alertas_upd BEFORE UPDATE ON public.sla_alertas FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();
drop trigger if exists trg_usuarios_upd on public.usuarios;
CREATE TRIGGER trg_usuarios_upd BEFORE UPDATE ON public.usuarios FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();
drop trigger if exists trg_wa_lid_map_touch on public.wa_lid_map;
CREATE TRIGGER trg_wa_lid_map_touch BEFORE UPDATE ON public.wa_lid_map FOR EACH ROW EXECUTE FUNCTION fn_wa_lid_map_touch();
drop trigger if exists trg_wa_templates_upd on public.wa_templates;
CREATE TRIGGER trg_wa_templates_upd BEFORE UPDATE ON public.wa_templates FOR EACH ROW EXECUTE FUNCTION wa_templates_touch();

-- 9. regras de acesso
alter table public.adm_casos enable row level security;
drop policy if exists adm_casos_sel on public.adm_casos;
create policy adm_casos_sel on public.adm_casos as permissive for select to authenticated using (is_member(organizacao_id));
alter table public.adm_config enable row level security;
drop policy if exists adm_config_sel on public.adm_config;
create policy adm_config_sel on public.adm_config as permissive for select to authenticated using (is_member(organizacao_id));
alter table public.adm_fechados enable row level security;
drop policy if exists adm_fechados_sel on public.adm_fechados;
create policy adm_fechados_sel on public.adm_fechados as permissive for select to authenticated using (is_member(organizacao_id));
alter table public.adm_movimentos enable row level security;
drop policy if exists adm_mov_sel on public.adm_movimentos;
create policy adm_mov_sel on public.adm_movimentos as permissive for select to authenticated using (is_member(organizacao_id));
alter table public.adm_pendencias enable row level security;
drop policy if exists adm_pendencias_sel on public.adm_pendencias;
create policy adm_pendencias_sel on public.adm_pendencias as permissive for select to authenticated using (is_member(organizacao_id));
alter table public.adm_placar enable row level security;
drop policy if exists adm_placar_sel on public.adm_placar;
create policy adm_placar_sel on public.adm_placar as permissive for select to authenticated using (is_member(organizacao_id));
alter table public.agendamento_atividades enable row level security;
drop policy if exists agend_ativ_select on public.agendamento_atividades;
create policy agend_ativ_select on public.agendamento_atividades as permissive for select to authenticated using ((organizacao_id IN ( SELECT organizacao_usuarios.organizacao_id
   FROM organizacao_usuarios
  WHERE ((organizacao_usuarios.usuario_id = auth.uid()) AND (organizacao_usuarios.status = 'ativo'::membership_status)))));
alter table public.agendamentos enable row level security;
drop policy if exists agendamentos_delete on public.agendamentos;
create policy agendamentos_delete on public.agendamentos as permissive for delete to authenticated using ((papel_org(organizacao_id) = 'admin'::text));
drop policy if exists agendamentos_insert on public.agendamentos;
create policy agendamentos_insert on public.agendamentos as permissive for insert to authenticated with check (((papel_org(organizacao_id) IS NOT NULL) AND (criado_por = auth.uid()) AND ((papel_org(organizacao_id) = ANY (ARRAY['admin'::text, 'supervisor'::text])) OR (atendente_id IS NULL) OR (atendente_id = auth.uid()))));
drop policy if exists agendamentos_select on public.agendamentos;
create policy agendamentos_select on public.agendamentos as permissive for select to authenticated using ((papel_org(organizacao_id) IS NOT NULL));
drop policy if exists agendamentos_update on public.agendamentos;
create policy agendamentos_update on public.agendamentos as permissive for update to authenticated using (((papel_org(organizacao_id) = ANY (ARRAY['admin'::text, 'supervisor'::text])) OR ((papel_org(organizacao_id) = 'atendente'::text) AND ((criado_por = auth.uid()) OR (atendente_id = auth.uid()))))) with check ((papel_org(organizacao_id) IS NOT NULL));
alter table public.alertas_lead_quente enable row level security;
drop policy if exists alertas_lq_sel on public.alertas_lead_quente;
create policy alertas_lq_sel on public.alertas_lead_quente as permissive for select to public using (is_member(organizacao_id));
alter table public.assinatura_itens enable row level security;
drop policy if exists assit_mut on public.assinatura_itens;
create policy assit_mut on public.assinatura_itens as permissive for all to authenticated using (is_platform_admin()) with check (is_platform_admin());
drop policy if exists assit_sel on public.assinatura_itens;
create policy assit_sel on public.assinatura_itens as permissive for select to authenticated using ((is_platform_admin() OR (papel_na_org(organizacao_id) = 'admin'::user_role)));
alter table public.assinaturas enable row level security;
drop policy if exists ass_mut on public.assinaturas;
create policy ass_mut on public.assinaturas as permissive for all to authenticated using (is_platform_admin()) with check (is_platform_admin());
drop policy if exists ass_sel on public.assinaturas;
create policy ass_sel on public.assinaturas as permissive for select to authenticated using ((is_platform_admin() OR (papel_na_org(organizacao_id) = 'admin'::user_role)));
alter table public.assistente_lembretes enable row level security;
alter table public.audit_log enable row level security;
drop policy if exists audit_ins on public.audit_log;
create policy audit_ins on public.audit_log as permissive for insert to authenticated with check (is_platform_admin());
drop policy if exists audit_sel on public.audit_log;
create policy audit_sel on public.audit_log as permissive for select to authenticated using ((is_platform_admin() OR (papel_na_org(organizacao_id) = ANY (ARRAY['admin'::user_role, 'supervisor'::user_role]))));
alter table public.avisos_passado_humano enable row level security;
alter table public.bom_dia_gestores enable row level security;
alter table public.bot_canal_config enable row level security;
drop policy if exists bot_canal_config_sel on public.bot_canal_config;
create policy bot_canal_config_sel on public.bot_canal_config as permissive for select to authenticated using ((is_platform_admin() OR is_member(organizacao_id)));
alter table public.bot_conversa_estado enable row level security;
drop policy if exists bot_estado_sel on public.bot_conversa_estado;
create policy bot_estado_sel on public.bot_conversa_estado as permissive for select to authenticated using ((is_platform_admin() OR is_member(organizacao_id)));
alter table public.bot_mensagens_saida enable row level security;
drop policy if exists bot_saida_sel on public.bot_mensagens_saida;
create policy bot_saida_sel on public.bot_mensagens_saida as permissive for select to authenticated using ((is_platform_admin() OR is_member(organizacao_id)));
alter table public.bot_remarketing enable row level security;
drop policy if exists bot_remarketing_sel on public.bot_remarketing;
create policy bot_remarketing_sel on public.bot_remarketing as permissive for select to public using ((is_platform_admin() OR is_member(organizacao_id)));
alter table public.bot_roteamentos enable row level security;
drop policy if exists bot_roteamentos_sel on public.bot_roteamentos;
create policy bot_roteamentos_sel on public.bot_roteamentos as permissive for select to public using (is_member(organizacao_id));
alter table public.canais enable row level security;
drop policy if exists canais_del on public.canais;
create policy canais_del on public.canais as permissive for delete to authenticated using ((is_platform_admin() OR ((papel_na_org(organizacao_id) = ANY (ARRAY['admin'::user_role, 'supervisor'::user_role])) AND org_operacional(organizacao_id))));
drop policy if exists canais_ins on public.canais;
create policy canais_ins on public.canais as permissive for insert to authenticated with check ((is_platform_admin() OR (is_member(organizacao_id) AND org_operacional(organizacao_id))));
drop policy if exists canais_sel on public.canais;
create policy canais_sel on public.canais as permissive for select to authenticated using ((organizacao_id IN ( SELECT orgs_visiveis() AS orgs_visiveis)));
drop policy if exists canais_upd on public.canais;
create policy canais_upd on public.canais as permissive for update to public using ((is_platform_admin() OR ((papel_na_org(organizacao_id) = ANY (ARRAY['admin'::user_role, 'supervisor'::user_role])) AND org_operacional(organizacao_id)))) with check ((is_platform_admin() OR ((papel_na_org(organizacao_id) = ANY (ARRAY['admin'::user_role, 'supervisor'::user_role])) AND org_operacional(organizacao_id))));
alter table public.canal_health_runs enable row level security;
drop policy if exists chr_sel on public.canal_health_runs;
create policy chr_sel on public.canal_health_runs as permissive for select to authenticated using ((is_member(organizacao_id) OR is_platform_admin()));
alter table public.canal_janela enable row level security;
drop policy if exists cjan_sel on public.canal_janela;
create policy cjan_sel on public.canal_janela as permissive for select to authenticated using ((is_platform_admin() OR is_member(organizacao_id)));
alter table public.checklist_modelo enable row level security;
drop policy if exists checklist_modelo_sel on public.checklist_modelo;
create policy checklist_modelo_sel on public.checklist_modelo as permissive for select to public using ((auth.uid() IS NOT NULL));
alter table public.ciclos_vencimento enable row level security;
drop policy if exists ciclos_venc_ins on public.ciclos_vencimento;
create policy ciclos_venc_ins on public.ciclos_vencimento as permissive for insert to public with check (cobranca_gestor(organizacao_id));
drop policy if exists ciclos_venc_sel on public.ciclos_vencimento;
create policy ciclos_venc_sel on public.ciclos_vencimento as permissive for select to public using ((is_platform_admin() OR (is_member(organizacao_id) AND org_operacional(organizacao_id))));
drop policy if exists ciclos_venc_upd on public.ciclos_vencimento;
create policy ciclos_venc_upd on public.ciclos_vencimento as permissive for update to public using (cobranca_gestor(organizacao_id)) with check (cobranca_gestor(organizacao_id));
alter table public.cobranca_eventos enable row level security;
drop policy if exists cobranca_eventos_all on public.cobranca_eventos;
create policy cobranca_eventos_all on public.cobranca_eventos as permissive for all to authenticated using ((is_platform_admin() OR ((papel_na_org(organizacao_id) = ANY (ARRAY['admin'::user_role, 'supervisor'::user_role])) AND org_operacional(organizacao_id)))) with check ((is_platform_admin() OR ((papel_na_org(organizacao_id) = ANY (ARRAY['admin'::user_role, 'supervisor'::user_role])) AND org_operacional(organizacao_id))));
drop policy if exists cobranca_eventos_sel on public.cobranca_eventos;
create policy cobranca_eventos_sel on public.cobranca_eventos as permissive for select to authenticated using ((is_platform_admin() OR cobranca_gestor(organizacao_id)));
alter table public.cobranca_pagamentos enable row level security;
drop policy if exists cob_pag_ins on public.cobranca_pagamentos;
create policy cob_pag_ins on public.cobranca_pagamentos as permissive for insert to public with check (cobranca_gestor(organizacao_id));
drop policy if exists cob_pag_sel on public.cobranca_pagamentos;
create policy cob_pag_sel on public.cobranca_pagamentos as permissive for select to authenticated using ((is_platform_admin() OR cobranca_gestor(organizacao_id)));
drop policy if exists cob_pag_upd on public.cobranca_pagamentos;
create policy cob_pag_upd on public.cobranca_pagamentos as permissive for update to public using (cobranca_gestor(organizacao_id)) with check (cobranca_gestor(organizacao_id));
alter table public.cobrancas enable row level security;
drop policy if exists cobrancas_ins on public.cobrancas;
create policy cobrancas_ins on public.cobrancas as permissive for insert to public with check (cobranca_gestor(organizacao_id));
drop policy if exists cobrancas_sel on public.cobrancas;
create policy cobrancas_sel on public.cobrancas as permissive for select to authenticated using ((is_platform_admin() OR cobranca_gestor(organizacao_id)));
drop policy if exists cobrancas_upd on public.cobrancas;
create policy cobrancas_upd on public.cobrancas as permissive for update to public using (cobranca_gestor(organizacao_id)) with check (cobranca_gestor(organizacao_id));
alter table public.configuracoes enable row level security;
drop policy if exists config_mut on public.configuracoes;
create policy config_mut on public.configuracoes as permissive for all to authenticated using ((is_platform_admin() OR ((papel_na_org(organizacao_id) = 'admin'::user_role) AND org_operacional(organizacao_id)))) with check ((is_platform_admin() OR ((papel_na_org(organizacao_id) = 'admin'::user_role) AND org_operacional(organizacao_id))));
drop policy if exists config_sel on public.configuracoes;
create policy config_sel on public.configuracoes as permissive for select to authenticated using ((is_platform_admin() OR (is_member(organizacao_id) AND org_operacional(organizacao_id))));
alter table public.contato_identidades enable row level security;
drop policy if exists contato_identidades_del on public.contato_identidades;
create policy contato_identidades_del on public.contato_identidades as permissive for delete to authenticated using ((is_platform_admin() OR ((papel_na_org(organizacao_id) = ANY (ARRAY['admin'::user_role, 'supervisor'::user_role])) AND org_operacional(organizacao_id))));
drop policy if exists contato_identidades_ins on public.contato_identidades;
create policy contato_identidades_ins on public.contato_identidades as permissive for insert to authenticated with check ((is_platform_admin() OR (is_member(organizacao_id) AND org_operacional(organizacao_id))));
drop policy if exists contato_identidades_sel on public.contato_identidades;
create policy contato_identidades_sel on public.contato_identidades as permissive for select to authenticated using ((organizacao_id IN ( SELECT orgs_visiveis() AS orgs_visiveis)));
drop policy if exists contato_identidades_upd on public.contato_identidades;
create policy contato_identidades_upd on public.contato_identidades as permissive for update to authenticated using ((is_platform_admin() OR (is_member(organizacao_id) AND org_operacional(organizacao_id)))) with check ((is_platform_admin() OR (is_member(organizacao_id) AND org_operacional(organizacao_id))));
alter table public.contatos enable row level security;
drop policy if exists contatos_del on public.contatos;
create policy contatos_del on public.contatos as permissive for delete to authenticated using ((is_platform_admin() OR ((papel_na_org(organizacao_id) = ANY (ARRAY['admin'::user_role, 'supervisor'::user_role])) AND org_operacional(organizacao_id))));
drop policy if exists contatos_ins on public.contatos;
create policy contatos_ins on public.contatos as permissive for insert to authenticated with check ((is_platform_admin() OR (is_member(organizacao_id) AND org_operacional(organizacao_id))));
drop policy if exists contatos_sel on public.contatos;
create policy contatos_sel on public.contatos as permissive for select to authenticated using ((organizacao_id IN ( SELECT orgs_visiveis() AS orgs_visiveis)));
drop policy if exists contatos_upd on public.contatos;
create policy contatos_upd on public.contatos as permissive for update to authenticated using ((is_platform_admin() OR (is_member(organizacao_id) AND org_operacional(organizacao_id)))) with check ((is_platform_admin() OR (is_member(organizacao_id) AND org_operacional(organizacao_id))));
alter table public.conversa_atividades enable row level security;
drop policy if exists conv_ativ_select on public.conversa_atividades;
create policy conv_ativ_select on public.conversa_atividades as permissive for select to authenticated using ((organizacao_id IN ( SELECT organizacao_usuarios.organizacao_id
   FROM organizacao_usuarios
  WHERE ((organizacao_usuarios.usuario_id = auth.uid()) AND (organizacao_usuarios.status = 'ativo'::membership_status)))));
alter table public.conversa_etiquetas enable row level security;
drop policy if exists ce_del on public.conversa_etiquetas;
create policy ce_del on public.conversa_etiquetas as permissive for delete to public using ((is_platform_admin() OR ((papel_na_org(organizacao_id) = ANY (ARRAY['admin'::user_role, 'supervisor'::user_role])) AND org_operacional(organizacao_id))));
drop policy if exists ce_ins on public.conversa_etiquetas;
create policy ce_ins on public.conversa_etiquetas as permissive for insert to public with check ((is_platform_admin() OR (is_member(organizacao_id) AND org_operacional(organizacao_id))));
drop policy if exists ce_sel on public.conversa_etiquetas;
create policy ce_sel on public.conversa_etiquetas as permissive for select to public using ((organizacao_id IN ( SELECT orgs_visiveis() AS orgs_visiveis)));
drop policy if exists ce_upd on public.conversa_etiquetas;
create policy ce_upd on public.conversa_etiquetas as permissive for update to public using ((is_platform_admin() OR (is_member(organizacao_id) AND org_operacional(organizacao_id)))) with check ((is_platform_admin() OR (is_member(organizacao_id) AND org_operacional(organizacao_id))));
alter table public.conversa_higiene_adiamentos enable row level security;
drop policy if exists cha_sel on public.conversa_higiene_adiamentos;
create policy cha_sel on public.conversa_higiene_adiamentos as permissive for select to public using ((is_platform_admin() OR is_member(organizacao_id)));
alter table public.conversa_status_def enable row level security;
drop policy if exists csd_del on public.conversa_status_def;
create policy csd_del on public.conversa_status_def as permissive for delete to public using ((is_platform_admin() OR ((papel_na_org(organizacao_id) = ANY (ARRAY['admin'::user_role, 'supervisor'::user_role])) AND org_operacional(organizacao_id))));
drop policy if exists csd_ins on public.conversa_status_def;
create policy csd_ins on public.conversa_status_def as permissive for insert to public with check ((is_platform_admin() OR ((papel_na_org(organizacao_id) = ANY (ARRAY['admin'::user_role, 'supervisor'::user_role])) AND org_operacional(organizacao_id))));
drop policy if exists csd_sel on public.conversa_status_def;
create policy csd_sel on public.conversa_status_def as permissive for select to public using ((is_platform_admin() OR (is_member(organizacao_id) AND org_operacional(organizacao_id))));
drop policy if exists csd_upd on public.conversa_status_def;
create policy csd_upd on public.conversa_status_def as permissive for update to public using ((is_platform_admin() OR ((papel_na_org(organizacao_id) = ANY (ARRAY['admin'::user_role, 'supervisor'::user_role])) AND org_operacional(organizacao_id)))) with check ((is_platform_admin() OR ((papel_na_org(organizacao_id) = ANY (ARRAY['admin'::user_role, 'supervisor'::user_role])) AND org_operacional(organizacao_id))));
alter table public.conversas enable row level security;
drop policy if exists conversas_del on public.conversas;
create policy conversas_del on public.conversas as permissive for delete to authenticated using ((is_platform_admin() OR ((papel_na_org(organizacao_id) = ANY (ARRAY['admin'::user_role, 'supervisor'::user_role])) AND org_operacional(organizacao_id))));
drop policy if exists conversas_ins on public.conversas;
create policy conversas_ins on public.conversas as permissive for insert to authenticated with check ((is_platform_admin() OR (is_member(organizacao_id) AND org_operacional(organizacao_id))));
drop policy if exists conversas_sel on public.conversas;
create policy conversas_sel on public.conversas as permissive for select to authenticated using ((organizacao_id IN ( SELECT orgs_visiveis() AS orgs_visiveis)));
drop policy if exists conversas_upd on public.conversas;
create policy conversas_upd on public.conversas as permissive for update to authenticated using ((is_platform_admin() OR (is_member(organizacao_id) AND org_operacional(organizacao_id)))) with check ((is_platform_admin() OR (is_member(organizacao_id) AND org_operacional(organizacao_id))));
alter table public.convites enable row level security;
drop policy if exists convites_select on public.convites;
create policy convites_select on public.convites as permissive for select to authenticated using (_eh_admin_org(organizacao_id));
alter table public.etiquetas enable row level security;
drop policy if exists etq_del on public.etiquetas;
create policy etq_del on public.etiquetas as permissive for delete to public using ((is_platform_admin() OR ((papel_na_org(organizacao_id) = ANY (ARRAY['admin'::user_role, 'supervisor'::user_role])) AND org_operacional(organizacao_id))));
drop policy if exists etq_ins on public.etiquetas;
create policy etq_ins on public.etiquetas as permissive for insert to public with check ((is_platform_admin() OR ((papel_na_org(organizacao_id) = ANY (ARRAY['admin'::user_role, 'supervisor'::user_role])) AND org_operacional(organizacao_id))));
drop policy if exists etq_sel on public.etiquetas;
create policy etq_sel on public.etiquetas as permissive for select to public using ((is_platform_admin() OR (is_member(organizacao_id) AND org_operacional(organizacao_id))));
drop policy if exists etq_upd on public.etiquetas;
create policy etq_upd on public.etiquetas as permissive for update to public using ((is_platform_admin() OR ((papel_na_org(organizacao_id) = ANY (ARRAY['admin'::user_role, 'supervisor'::user_role])) AND org_operacional(organizacao_id)))) with check ((is_platform_admin() OR ((papel_na_org(organizacao_id) = ANY (ARRAY['admin'::user_role, 'supervisor'::user_role])) AND org_operacional(organizacao_id))));
alter table public.fichas_judiciais enable row level security;
drop policy if exists fichas_ins on public.fichas_judiciais;
create policy fichas_ins on public.fichas_judiciais as permissive for insert to public with check (is_member(organizacao_id));
drop policy if exists fichas_sel on public.fichas_judiciais;
create policy fichas_sel on public.fichas_judiciais as permissive for select to public using ((is_member(organizacao_id) AND ((org_papel(organizacao_id) = ANY (ARRAY['admin'::text, 'supervisor'::text])) OR (criado_por = auth.uid()) OR (responsavel_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM oportunidades o
  WHERE ((o.id = fichas_judiciais.oportunidade_id) AND (o.responsavel_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM conversas c
  WHERE ((c.id = fichas_judiciais.conversa_id) AND (c.atendente_id = auth.uid())))))));
drop policy if exists fichas_upd on public.fichas_judiciais;
create policy fichas_upd on public.fichas_judiciais as permissive for update to public using ((is_member(organizacao_id) AND ((org_papel(organizacao_id) = ANY (ARRAY['admin'::text, 'supervisor'::text])) OR (criado_por = auth.uid()) OR (responsavel_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM oportunidades o
  WHERE ((o.id = fichas_judiciais.oportunidade_id) AND (o.responsavel_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM conversas c
  WHERE ((c.id = fichas_judiciais.conversa_id) AND (c.atendente_id = auth.uid()))))))) with check (is_member(organizacao_id));
alter table public.fontes_aquisicao enable row level security;
drop policy if exists fontes_aquisicao_del on public.fontes_aquisicao;
create policy fontes_aquisicao_del on public.fontes_aquisicao as permissive for delete to authenticated using ((is_platform_admin() OR ((papel_na_org(organizacao_id) = ANY (ARRAY['admin'::user_role, 'supervisor'::user_role])) AND org_operacional(organizacao_id))));
drop policy if exists fontes_aquisicao_ins on public.fontes_aquisicao;
create policy fontes_aquisicao_ins on public.fontes_aquisicao as permissive for insert to authenticated with check ((is_platform_admin() OR (is_member(organizacao_id) AND org_operacional(organizacao_id))));
drop policy if exists fontes_aquisicao_sel on public.fontes_aquisicao;
create policy fontes_aquisicao_sel on public.fontes_aquisicao as permissive for select to authenticated using ((is_platform_admin() OR (is_member(organizacao_id) AND org_operacional(organizacao_id))));
drop policy if exists fontes_aquisicao_upd on public.fontes_aquisicao;
create policy fontes_aquisicao_upd on public.fontes_aquisicao as permissive for update to authenticated using ((is_platform_admin() OR (is_member(organizacao_id) AND org_operacional(organizacao_id)))) with check ((is_platform_admin() OR (is_member(organizacao_id) AND org_operacional(organizacao_id))));
alter table public.funil_colunas enable row level security;
drop policy if exists fc_del on public.funil_colunas;
create policy fc_del on public.funil_colunas as permissive for delete to public using ((is_platform_admin() OR ((papel_na_org(organizacao_id) = ANY (ARRAY['admin'::user_role, 'supervisor'::user_role])) AND org_operacional(organizacao_id))));
drop policy if exists fc_ins on public.funil_colunas;
create policy fc_ins on public.funil_colunas as permissive for insert to public with check ((is_platform_admin() OR ((papel_na_org(organizacao_id) = ANY (ARRAY['admin'::user_role, 'supervisor'::user_role])) AND org_operacional(organizacao_id))));
drop policy if exists fc_sel on public.funil_colunas;
create policy fc_sel on public.funil_colunas as permissive for select to public using ((is_platform_admin() OR (is_member(organizacao_id) AND org_operacional(organizacao_id))));
drop policy if exists fc_upd on public.funil_colunas;
create policy fc_upd on public.funil_colunas as permissive for update to public using ((is_platform_admin() OR ((papel_na_org(organizacao_id) = ANY (ARRAY['admin'::user_role, 'supervisor'::user_role])) AND org_operacional(organizacao_id)))) with check ((is_platform_admin() OR ((papel_na_org(organizacao_id) = ANY (ARRAY['admin'::user_role, 'supervisor'::user_role])) AND org_operacional(organizacao_id))));
alter table public.funis enable row level security;
drop policy if exists funis_del on public.funis;
create policy funis_del on public.funis as permissive for delete to public using ((is_platform_admin() OR ((papel_na_org(organizacao_id) = ANY (ARRAY['admin'::user_role, 'supervisor'::user_role])) AND org_operacional(organizacao_id))));
drop policy if exists funis_ins on public.funis;
create policy funis_ins on public.funis as permissive for insert to public with check ((is_platform_admin() OR ((papel_na_org(organizacao_id) = ANY (ARRAY['admin'::user_role, 'supervisor'::user_role])) AND org_operacional(organizacao_id))));
drop policy if exists funis_sel on public.funis;
create policy funis_sel on public.funis as permissive for select to public using ((is_platform_admin() OR (is_member(organizacao_id) AND org_operacional(organizacao_id))));
drop policy if exists funis_upd on public.funis;
create policy funis_upd on public.funis as permissive for update to public using ((is_platform_admin() OR ((papel_na_org(organizacao_id) = ANY (ARRAY['admin'::user_role, 'supervisor'::user_role])) AND org_operacional(organizacao_id)))) with check ((is_platform_admin() OR ((papel_na_org(organizacao_id) = ANY (ARRAY['admin'::user_role, 'supervisor'::user_role])) AND org_operacional(organizacao_id))));
alter table public.ia_agentes enable row level security;
drop policy if exists ia_agentes_del on public.ia_agentes;
create policy ia_agentes_del on public.ia_agentes as permissive for delete to public using ((is_platform_admin() OR ((papel_na_org(organizacao_id) = ANY (ARRAY['admin'::user_role, 'supervisor'::user_role])) AND org_operacional(organizacao_id))));
drop policy if exists ia_agentes_ins on public.ia_agentes;
create policy ia_agentes_ins on public.ia_agentes as permissive for insert to public with check ((is_platform_admin() OR ((papel_na_org(organizacao_id) = ANY (ARRAY['admin'::user_role, 'supervisor'::user_role])) AND org_operacional(organizacao_id))));
drop policy if exists ia_agentes_sel on public.ia_agentes;
create policy ia_agentes_sel on public.ia_agentes as permissive for select to public using ((is_platform_admin() OR (is_member(organizacao_id) AND org_operacional(organizacao_id))));
drop policy if exists ia_agentes_upd on public.ia_agentes;
create policy ia_agentes_upd on public.ia_agentes as permissive for update to public using ((is_platform_admin() OR ((papel_na_org(organizacao_id) = ANY (ARRAY['admin'::user_role, 'supervisor'::user_role])) AND org_operacional(organizacao_id))));
alter table public.ia_credito_episodios enable row level security;
alter table public.ia_eventos enable row level security;
drop policy if exists ia_eventos_sel on public.ia_eventos;
create policy ia_eventos_sel on public.ia_eventos as permissive for select to authenticated using ((organizacao_id IN ( SELECT orgs_visiveis() AS orgs_visiveis)));
alter table public.ia_fluxos enable row level security;
drop policy if exists ia_fluxos_del on public.ia_fluxos;
create policy ia_fluxos_del on public.ia_fluxos as permissive for delete to public using ((is_platform_admin() OR ((papel_na_org(organizacao_id) = ANY (ARRAY['admin'::user_role, 'supervisor'::user_role])) AND org_operacional(organizacao_id))));
drop policy if exists ia_fluxos_ins on public.ia_fluxos;
create policy ia_fluxos_ins on public.ia_fluxos as permissive for insert to public with check ((is_platform_admin() OR ((papel_na_org(organizacao_id) = ANY (ARRAY['admin'::user_role, 'supervisor'::user_role])) AND org_operacional(organizacao_id))));
drop policy if exists ia_fluxos_sel on public.ia_fluxos;
create policy ia_fluxos_sel on public.ia_fluxos as permissive for select to public using ((is_platform_admin() OR (is_member(organizacao_id) AND org_operacional(organizacao_id))));
drop policy if exists ia_fluxos_upd on public.ia_fluxos;
create policy ia_fluxos_upd on public.ia_fluxos as permissive for update to public using ((is_platform_admin() OR ((papel_na_org(organizacao_id) = ANY (ARRAY['admin'::user_role, 'supervisor'::user_role])) AND org_operacional(organizacao_id))));
alter table public.ia_pausas enable row level security;
alter table public.ia_sessoes enable row level security;
drop policy if exists ia_sessoes_sel on public.ia_sessoes;
create policy ia_sessoes_sel on public.ia_sessoes as permissive for select to authenticated using ((organizacao_id IN ( SELECT orgs_visiveis() AS orgs_visiveis)));
alter table public.inss_documentos enable row level security;
drop policy if exists inss_documentos_sel on public.inss_documentos;
create policy inss_documentos_sel on public.inss_documentos as permissive for select to public using (is_member(organizacao_id));
alter table public.inss_pedidos enable row level security;
drop policy if exists inss_pedidos_ins on public.inss_pedidos;
create policy inss_pedidos_ins on public.inss_pedidos as permissive for insert to public with check (is_member(organizacao_id));
drop policy if exists inss_pedidos_sel on public.inss_pedidos;
create policy inss_pedidos_sel on public.inss_pedidos as permissive for select to public using (is_member(organizacao_id));
drop policy if exists inss_pedidos_upd on public.inss_pedidos;
create policy inss_pedidos_upd on public.inss_pedidos as permissive for update to public using (is_member(organizacao_id)) with check (is_member(organizacao_id));
alter table public.atd_integracoes enable row level security;
drop policy if exists integr_all on public.atd_integracoes;
create policy integr_all on public.atd_integracoes as permissive for all to authenticated using ((is_platform_admin() OR ((papel_na_org(organizacao_id) = 'admin'::user_role) AND org_operacional(organizacao_id)))) with check ((is_platform_admin() OR ((papel_na_org(organizacao_id) = 'admin'::user_role) AND org_operacional(organizacao_id))));
alter table public.iris_acesso enable row level security;
alter table public.iris_carteira enable row level security;
drop policy if exists iris_carteira_select on public.iris_carteira;
create policy iris_carteira_select on public.iris_carteira as permissive for select to authenticated using (iris_pode_ver());
alter table public.iris_eventos enable row level security;
alter table public.iris_fila_abertura enable row level security;
alter table public.iris_followups enable row level security;
drop policy if exists iris_followups_sel on public.iris_followups;
create policy iris_followups_sel on public.iris_followups as permissive for select to authenticated using ((is_platform_admin() OR is_member(organizacao_id)));
alter table public.iris_monitor_achados enable row level security;
drop policy if exists iris_monitor_achados_sel on public.iris_monitor_achados;
create policy iris_monitor_achados_sel on public.iris_monitor_achados as permissive for select to authenticated using ((is_platform_admin() OR COALESCE((assistente_papel(organizacao_id, auth.uid()) = 'admin'::text), false)));
alter table public.iris_monitor_ciclos enable row level security;
drop policy if exists iris_monitor_ciclos_sel on public.iris_monitor_ciclos;
create policy iris_monitor_ciclos_sel on public.iris_monitor_ciclos as permissive for select to authenticated using ((is_platform_admin() OR COALESCE((assistente_papel(organizacao_id, auth.uid()) = 'admin'::text), false)));
alter table public.iris_teste_limpezas enable row level security;
drop policy if exists iris_teste_limpezas_sel on public.iris_teste_limpezas;
create policy iris_teste_limpezas_sel on public.iris_teste_limpezas as permissive for select to authenticated using ((is_platform_admin() OR is_member(organizacao_id)));
alter table public.iris_textos enable row level security;
alter table public.ligacoes_marcadas enable row level security;
alter table public.mensagens enable row level security;
drop policy if exists mensagens_del on public.mensagens;
create policy mensagens_del on public.mensagens as permissive for delete to authenticated using ((is_platform_admin() OR ((papel_na_org(organizacao_id) = ANY (ARRAY['admin'::user_role, 'supervisor'::user_role])) AND org_operacional(organizacao_id))));
drop policy if exists mensagens_ins on public.mensagens;
create policy mensagens_ins on public.mensagens as permissive for insert to authenticated with check ((is_platform_admin() OR (is_member(organizacao_id) AND org_operacional(organizacao_id))));
drop policy if exists mensagens_sel on public.mensagens;
create policy mensagens_sel on public.mensagens as permissive for select to authenticated using ((organizacao_id IN ( SELECT orgs_visiveis() AS orgs_visiveis)));
drop policy if exists mensagens_upd on public.mensagens;
create policy mensagens_upd on public.mensagens as permissive for update to authenticated using ((is_platform_admin() OR (is_member(organizacao_id) AND org_operacional(organizacao_id)))) with check ((is_platform_admin() OR (is_member(organizacao_id) AND org_operacional(organizacao_id))));
alter table public.mensagens_agendadas enable row level security;
drop policy if exists mag_sel on public.mensagens_agendadas;
create policy mag_sel on public.mensagens_agendadas as permissive for select to public using ((is_platform_admin() OR is_member(organizacao_id)));
alter table public.midia_melhoria_ia enable row level security;
drop policy if exists midia_melhoria_ia_sel on public.midia_melhoria_ia;
create policy midia_melhoria_ia_sel on public.midia_melhoria_ia as permissive for select to authenticated using ((organizacao_id IN ( SELECT orgs_visiveis() AS orgs_visiveis)));
alter table public.atd_notificacoes enable row level security;
drop policy if exists notificacoes_sel on public.atd_notificacoes;
create policy notificacoes_sel on public.atd_notificacoes as permissive for select to authenticated using (((is_platform_admin() OR is_member(organizacao_id)) AND ((usuario_id IS NULL) OR (usuario_id = auth.uid()))));
alter table public.oportunidade_checklist enable row level security;
drop policy if exists opp_checklist_ins on public.oportunidade_checklist;
create policy opp_checklist_ins on public.oportunidade_checklist as permissive for insert to public with check (is_member(organizacao_id));
drop policy if exists opp_checklist_sel on public.oportunidade_checklist;
create policy opp_checklist_sel on public.oportunidade_checklist as permissive for select to public using ((is_platform_admin() OR is_member(organizacao_id)));
drop policy if exists opp_checklist_upd on public.oportunidade_checklist;
create policy opp_checklist_upd on public.oportunidade_checklist as permissive for update to public using (is_member(organizacao_id)) with check (is_member(organizacao_id));
alter table public.oportunidade_eventos enable row level security;
drop policy if exists opp_eventos_sel on public.oportunidade_eventos;
create policy opp_eventos_sel on public.oportunidade_eventos as permissive for select to public using ((is_platform_admin() OR is_member(organizacao_id)));
alter table public.oportunidades enable row level security;
drop policy if exists oportunidades_del on public.oportunidades;
create policy oportunidades_del on public.oportunidades as permissive for delete to authenticated using ((is_platform_admin() OR ((papel_na_org(organizacao_id) = ANY (ARRAY['admin'::user_role, 'supervisor'::user_role])) AND org_operacional(organizacao_id))));
drop policy if exists oportunidades_ins on public.oportunidades;
create policy oportunidades_ins on public.oportunidades as permissive for insert to authenticated with check ((is_platform_admin() OR (is_member(organizacao_id) AND org_operacional(organizacao_id))));
drop policy if exists oportunidades_sel on public.oportunidades;
create policy oportunidades_sel on public.oportunidades as permissive for select to authenticated using ((organizacao_id IN ( SELECT orgs_visiveis() AS orgs_visiveis)));
drop policy if exists oportunidades_upd on public.oportunidades;
create policy oportunidades_upd on public.oportunidades as permissive for update to authenticated using ((is_platform_admin() OR (is_member(organizacao_id) AND org_operacional(organizacao_id)))) with check ((is_platform_admin() OR (is_member(organizacao_id) AND org_operacional(organizacao_id))));
alter table public.organizacao_limites enable row level security;
drop policy if exists lim_mut on public.organizacao_limites;
create policy lim_mut on public.organizacao_limites as permissive for all to authenticated using (is_platform_admin()) with check (is_platform_admin());
drop policy if exists lim_sel on public.organizacao_limites;
create policy lim_sel on public.organizacao_limites as permissive for select to authenticated using ((is_platform_admin() OR is_member(organizacao_id)));
alter table public.organizacao_usuarios enable row level security;
drop policy if exists ou_del on public.organizacao_usuarios;
create policy ou_del on public.organizacao_usuarios as permissive for delete to authenticated using ((is_platform_admin() OR (papel_na_org(organizacao_id) = 'admin'::user_role)));
drop policy if exists ou_ins on public.organizacao_usuarios;
create policy ou_ins on public.organizacao_usuarios as permissive for insert to authenticated with check ((is_platform_admin() OR (papel_na_org(organizacao_id) = 'admin'::user_role)));
drop policy if exists ou_sel on public.organizacao_usuarios;
create policy ou_sel on public.organizacao_usuarios as permissive for select to authenticated using ((is_platform_admin() OR (usuario_id = auth.uid()) OR is_member(organizacao_id)));
drop policy if exists ou_upd on public.organizacao_usuarios;
create policy ou_upd on public.organizacao_usuarios as permissive for update to authenticated using ((is_platform_admin() OR (papel_na_org(organizacao_id) = 'admin'::user_role))) with check ((is_platform_admin() OR (papel_na_org(organizacao_id) = 'admin'::user_role)));
alter table public.organizacoes enable row level security;
drop policy if exists org_del on public.organizacoes;
create policy org_del on public.organizacoes as permissive for delete to authenticated using (is_platform_admin());
drop policy if exists org_ins on public.organizacoes;
create policy org_ins on public.organizacoes as permissive for insert to authenticated with check (is_platform_admin());
drop policy if exists org_sel on public.organizacoes;
create policy org_sel on public.organizacoes as permissive for select to authenticated using ((is_platform_admin() OR is_member(id)));
drop policy if exists org_upd on public.organizacoes;
create policy org_upd on public.organizacoes as permissive for update to authenticated using ((is_platform_admin() OR (papel_na_org(id) = 'admin'::user_role))) with check ((is_platform_admin() OR (papel_na_org(id) = 'admin'::user_role)));
alter table public.pendencias enable row level security;
drop policy if exists pend_sel on public.pendencias;
create policy pend_sel on public.pendencias as permissive for select to authenticated using (is_member(organizacao_id));
alter table public.planilha_config enable row level security;
drop policy if exists planilha_config_sel on public.planilha_config;
create policy planilha_config_sel on public.planilha_config as permissive for select to authenticated using (is_member(organizacao_id));
alter table public.planos enable row level security;
drop policy if exists planos_mut on public.planos;
create policy planos_mut on public.planos as permissive for all to authenticated using (is_platform_admin()) with check (is_platform_admin());
drop policy if exists planos_sel on public.planos;
create policy planos_sel on public.planos as permissive for select to authenticated using (true);
alter table public.presenciais enable row level security;
drop policy if exists presenciais_sel on public.presenciais;
create policy presenciais_sel on public.presenciais as permissive for select to authenticated using (is_member(organizacao_id));
alter table public.presenciais_avisos enable row level security;
drop policy if exists presenciais_avisos_sel on public.presenciais_avisos;
create policy presenciais_avisos_sel on public.presenciais_avisos as permissive for select to authenticated using (is_member(organizacao_id));
alter table public.radar_textos enable row level security;
drop policy if exists radar_textos_sel on public.radar_textos;
create policy radar_textos_sel on public.radar_textos as permissive for select to authenticated using (true);
alter table public.recados_gestor enable row level security;
alter table public.regua_ativacoes enable row level security;
drop policy if exists ativ_sel on public.regua_ativacoes;
create policy ativ_sel on public.regua_ativacoes as permissive for select to public using ((is_platform_admin() OR (is_member(organizacao_id) AND ((org_papel(organizacao_id) = ANY (ARRAY['admin'::text, 'supervisor'::text])) OR (responsavel_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM contatos c
  WHERE ((c.id = regua_ativacoes.contato_id) AND (c.responsavel_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM conversas cv
  WHERE ((cv.id = regua_ativacoes.conversa_id) AND (cv.atendente_id = auth.uid()))))))));
alter table public.regua_envios enable row level security;
drop policy if exists env_sel on public.regua_envios;
create policy env_sel on public.regua_envios as permissive for select to public using ((is_platform_admin() OR (is_member(organizacao_id) AND ((org_papel(organizacao_id) = ANY (ARRAY['admin'::text, 'supervisor'::text])) OR (EXISTS ( SELECT 1
   FROM regua_ativacoes a
  WHERE ((a.id = regua_envios.ativacao_id) AND ((a.responsavel_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM contatos c
          WHERE ((c.id = a.contato_id) AND (c.responsavel_id = auth.uid()))))))))))));
alter table public.regua_passos enable row level security;
drop policy if exists passos_sel on public.regua_passos;
create policy passos_sel on public.regua_passos as permissive for select to public using ((is_platform_admin() OR (is_member(organizacao_id) AND org_operacional(organizacao_id))));
alter table public.reguas enable row level security;
drop policy if exists reguas_sel on public.reguas;
create policy reguas_sel on public.reguas as permissive for select to public using ((is_platform_admin() OR (is_member(organizacao_id) AND org_operacional(organizacao_id))));
alter table public.relacionamento_bloqueio enable row level security;
drop policy if exists blq_sel on public.relacionamento_bloqueio;
create policy blq_sel on public.relacionamento_bloqueio as permissive for select to public using ((is_platform_admin() OR (is_member(organizacao_id) AND org_operacional(organizacao_id))));
alter table public.remarketing_config enable row level security;
drop policy if exists rmkt_config_sel on public.remarketing_config;
create policy rmkt_config_sel on public.remarketing_config as permissive for select to authenticated using ((is_platform_admin() OR is_member(organizacao_id)));
alter table public.remarketing_eventos enable row level security;
drop policy if exists rmkt_eventos_sel on public.remarketing_eventos;
create policy rmkt_eventos_sel on public.remarketing_eventos as permissive for select to authenticated using ((is_platform_admin() OR is_member(organizacao_id)));
alter table public.remarketing_leads enable row level security;
drop policy if exists rmkt_leads_sel on public.remarketing_leads;
create policy rmkt_leads_sel on public.remarketing_leads as permissive for select to authenticated using ((is_platform_admin() OR is_member(organizacao_id)));
alter table public.remarketing_tarefas enable row level security;
drop policy if exists rmkt_tarefas_sel on public.remarketing_tarefas;
create policy rmkt_tarefas_sel on public.remarketing_tarefas as permissive for select to authenticated using ((is_platform_admin() OR is_member(organizacao_id)));
alter table public.retomada_atendimento_log enable row level security;
alter table public.robo_ligar enable row level security;
drop policy if exists robo_ligar_sel on public.robo_ligar;
create policy robo_ligar_sel on public.robo_ligar as permissive for select to authenticated using (is_member(organizacao_id));
alter table public.script_anexos enable row level security;
drop policy if exists script_anexos_del on public.script_anexos;
create policy script_anexos_del on public.script_anexos as permissive for delete to authenticated using ((is_platform_admin() OR ((papel_na_org(organizacao_id) = ANY (ARRAY['admin'::user_role, 'supervisor'::user_role])) AND org_operacional(organizacao_id))));
drop policy if exists script_anexos_ins on public.script_anexos;
create policy script_anexos_ins on public.script_anexos as permissive for insert to authenticated with check ((is_platform_admin() OR (is_member(organizacao_id) AND org_operacional(organizacao_id))));
drop policy if exists script_anexos_sel on public.script_anexos;
create policy script_anexos_sel on public.script_anexos as permissive for select to authenticated using ((is_platform_admin() OR (is_member(organizacao_id) AND org_operacional(organizacao_id))));
drop policy if exists script_anexos_upd on public.script_anexos;
create policy script_anexos_upd on public.script_anexos as permissive for update to authenticated using ((is_platform_admin() OR (is_member(organizacao_id) AND org_operacional(organizacao_id)))) with check ((is_platform_admin() OR (is_member(organizacao_id) AND org_operacional(organizacao_id))));
alter table public.script_categorias enable row level security;
drop policy if exists script_categorias_del on public.script_categorias;
create policy script_categorias_del on public.script_categorias as permissive for delete to authenticated using ((is_platform_admin() OR ((papel_na_org(organizacao_id) = ANY (ARRAY['admin'::user_role, 'supervisor'::user_role])) AND org_operacional(organizacao_id))));
drop policy if exists script_categorias_ins on public.script_categorias;
create policy script_categorias_ins on public.script_categorias as permissive for insert to authenticated with check ((is_platform_admin() OR (is_member(organizacao_id) AND org_operacional(organizacao_id))));
drop policy if exists script_categorias_sel on public.script_categorias;
create policy script_categorias_sel on public.script_categorias as permissive for select to authenticated using ((is_platform_admin() OR (is_member(organizacao_id) AND org_operacional(organizacao_id))));
drop policy if exists script_categorias_upd on public.script_categorias;
create policy script_categorias_upd on public.script_categorias as permissive for update to authenticated using ((is_platform_admin() OR (is_member(organizacao_id) AND org_operacional(organizacao_id)))) with check ((is_platform_admin() OR (is_member(organizacao_id) AND org_operacional(organizacao_id))));
alter table public.script_etapas enable row level security;
drop policy if exists script_etapas_del on public.script_etapas;
create policy script_etapas_del on public.script_etapas as permissive for delete to public using ((is_platform_admin() OR (is_member(organizacao_id) AND org_operacional(organizacao_id))));
drop policy if exists script_etapas_ins on public.script_etapas;
create policy script_etapas_ins on public.script_etapas as permissive for insert to public with check ((is_platform_admin() OR (is_member(organizacao_id) AND org_operacional(organizacao_id))));
drop policy if exists script_etapas_sel on public.script_etapas;
create policy script_etapas_sel on public.script_etapas as permissive for select to public using ((is_platform_admin() OR (is_member(organizacao_id) AND org_operacional(organizacao_id))));
drop policy if exists script_etapas_upd on public.script_etapas;
create policy script_etapas_upd on public.script_etapas as permissive for update to public using ((is_platform_admin() OR (is_member(organizacao_id) AND org_operacional(organizacao_id))));
alter table public.script_execucoes enable row level security;
drop policy if exists script_execucoes_ins on public.script_execucoes;
create policy script_execucoes_ins on public.script_execucoes as permissive for insert to public with check ((is_platform_admin() OR (is_member(organizacao_id) AND org_operacional(organizacao_id))));
drop policy if exists script_execucoes_sel on public.script_execucoes;
create policy script_execucoes_sel on public.script_execucoes as permissive for select to public using ((is_platform_admin() OR (is_member(organizacao_id) AND org_operacional(organizacao_id))));
alter table public.scripts enable row level security;
drop policy if exists scripts_del on public.scripts;
create policy scripts_del on public.scripts as permissive for delete to authenticated using ((is_platform_admin() OR ((papel_na_org(organizacao_id) = ANY (ARRAY['admin'::user_role, 'supervisor'::user_role])) AND org_operacional(organizacao_id))));
drop policy if exists scripts_ins on public.scripts;
create policy scripts_ins on public.scripts as permissive for insert to authenticated with check ((is_platform_admin() OR (is_member(organizacao_id) AND org_operacional(organizacao_id))));
drop policy if exists scripts_sel on public.scripts;
create policy scripts_sel on public.scripts as permissive for select to authenticated using ((is_platform_admin() OR (is_member(organizacao_id) AND org_operacional(organizacao_id))));
drop policy if exists scripts_upd on public.scripts;
create policy scripts_upd on public.scripts as permissive for update to authenticated using ((is_platform_admin() OR (is_member(organizacao_id) AND org_operacional(organizacao_id)))) with check ((is_platform_admin() OR (is_member(organizacao_id) AND org_operacional(organizacao_id))));
alter table public.sla_alertas enable row level security;
drop policy if exists sla_alertas_sel on public.sla_alertas;
create policy sla_alertas_sel on public.sla_alertas as permissive for select to authenticated using ((is_platform_admin() OR is_member(organizacao_id)));
alter table public.usuario_preferencias enable row level security;
drop policy if exists up_ins on public.usuario_preferencias;
create policy up_ins on public.usuario_preferencias as permissive for insert to public with check ((usuario_id = auth.uid()));
drop policy if exists up_sel on public.usuario_preferencias;
create policy up_sel on public.usuario_preferencias as permissive for select to public using ((usuario_id = auth.uid()));
drop policy if exists up_upd on public.usuario_preferencias;
create policy up_upd on public.usuario_preferencias as permissive for update to public using ((usuario_id = auth.uid())) with check ((usuario_id = auth.uid()));
alter table public.usuarios enable row level security;
drop policy if exists usuarios_del on public.usuarios;
create policy usuarios_del on public.usuarios as permissive for delete to authenticated using (is_platform_admin());
drop policy if exists usuarios_ins on public.usuarios;
create policy usuarios_ins on public.usuarios as permissive for insert to authenticated with check (is_platform_admin());
drop policy if exists usuarios_sel on public.usuarios;
create policy usuarios_sel on public.usuarios as permissive for select to authenticated using ((is_platform_admin() OR (id = auth.uid()) OR compartilha_org(id)));
drop policy if exists usuarios_upd on public.usuarios;
create policy usuarios_upd on public.usuarios as permissive for update to authenticated using (((id = auth.uid()) OR is_platform_admin())) with check (((id = auth.uid()) OR is_platform_admin()));
alter table public.vacuo_config enable row level security;
drop policy if exists vacuo_config_sel on public.vacuo_config;
create policy vacuo_config_sel on public.vacuo_config as permissive for select to authenticated using (is_member(organizacao_id));
alter table public.vacuo_estado enable row level security;
drop policy if exists vacuo_estado_sel on public.vacuo_estado;
create policy vacuo_estado_sel on public.vacuo_estado as permissive for select to authenticated using (is_member(organizacao_id));
alter table public.vacuo_repasses enable row level security;
drop policy if exists vacuo_repasses_sel on public.vacuo_repasses;
create policy vacuo_repasses_sel on public.vacuo_repasses as permissive for select to authenticated using (is_member(organizacao_id));
alter table public.wa_audio_diag enable row level security;
drop policy if exists wa_audio_diag_admin_select on public.wa_audio_diag;
create policy wa_audio_diag_admin_select on public.wa_audio_diag as permissive for select to authenticated using ((organizacao_id IN ( SELECT organizacao_usuarios.organizacao_id
   FROM organizacao_usuarios
  WHERE ((organizacao_usuarios.usuario_id = auth.uid()) AND (organizacao_usuarios.status = 'ativo'::membership_status) AND (organizacao_usuarios.papel = 'admin'::user_role)))));
alter table public.wa_lid_map enable row level security;
drop policy if exists wa_lid_map_sel on public.wa_lid_map;
create policy wa_lid_map_sel on public.wa_lid_map as permissive for select to authenticated using ((is_member(organizacao_id) OR is_platform_admin()));
alter table public.atd_wa_optout enable row level security;
drop policy if exists waopt_sel on public.atd_wa_optout;
create policy waopt_sel on public.atd_wa_optout as permissive for select to authenticated using ((is_platform_admin() OR is_member(organizacao_id)));
alter table public.wa_templates enable row level security;
drop policy if exists wat_sel on public.wa_templates;
create policy wat_sel on public.wa_templates as permissive for select to authenticated using ((is_platform_admin() OR is_member(organizacao_id)));
alter table public.webhook_config enable row level security;
alter table public.whatsapp_webhook_events enable row level security;

-- 10. permissões nas tabelas (iguais às do Atenvo)
revoke all on public.adm_casos from anon, authenticated;
revoke all on public.adm_config from anon, authenticated;
revoke all on public.adm_fechados from anon, authenticated;
revoke all on public.adm_movimentos from anon, authenticated;
revoke all on public.adm_pendencias from anon, authenticated;
revoke all on public.adm_placar from anon, authenticated;
revoke all on public.agendamento_atividades from anon, authenticated;
revoke all on public.agendamentos from anon, authenticated;
revoke all on public.alertas_lead_quente from anon, authenticated;
revoke all on public.assinatura_itens from anon, authenticated;
revoke all on public.assinaturas from anon, authenticated;
revoke all on public.assistente_lembretes from anon, authenticated;
revoke all on public.audit_log from anon, authenticated;
revoke all on public.avisos_passado_humano from anon, authenticated;
revoke all on public.bom_dia_gestores from anon, authenticated;
revoke all on public.bot_canal_config from anon, authenticated;
revoke all on public.bot_conversa_estado from anon, authenticated;
revoke all on public.bot_mensagens_saida from anon, authenticated;
revoke all on public.bot_remarketing from anon, authenticated;
revoke all on public.bot_roteamentos from anon, authenticated;
revoke all on public.canais from anon, authenticated;
revoke all on public.canal_health_runs from anon, authenticated;
revoke all on public.canal_janela from anon, authenticated;
revoke all on public.checklist_modelo from anon, authenticated;
revoke all on public.ciclos_vencimento from anon, authenticated;
revoke all on public.cobranca_eventos from anon, authenticated;
revoke all on public.cobranca_pagamentos from anon, authenticated;
revoke all on public.cobrancas from anon, authenticated;
revoke all on public.configuracoes from anon, authenticated;
revoke all on public.contato_identidades from anon, authenticated;
revoke all on public.contatos from anon, authenticated;
revoke all on public.conversa_atividades from anon, authenticated;
revoke all on public.conversa_etiquetas from anon, authenticated;
revoke all on public.conversa_higiene_adiamentos from anon, authenticated;
revoke all on public.conversa_status_def from anon, authenticated;
revoke all on public.conversas from anon, authenticated;
revoke all on public.convites from anon, authenticated;
revoke all on public.etiquetas from anon, authenticated;
revoke all on public.fichas_judiciais from anon, authenticated;
revoke all on public.fontes_aquisicao from anon, authenticated;
revoke all on public.funil_colunas from anon, authenticated;
revoke all on public.funis from anon, authenticated;
revoke all on public.ia_agentes from anon, authenticated;
revoke all on public.ia_credito_episodios from anon, authenticated;
revoke all on public.ia_eventos from anon, authenticated;
revoke all on public.ia_fluxos from anon, authenticated;
revoke all on public.ia_pausas from anon, authenticated;
revoke all on public.ia_sessoes from anon, authenticated;
revoke all on public.inss_documentos from anon, authenticated;
revoke all on public.inss_pedidos from anon, authenticated;
revoke all on public.atd_integracoes from anon, authenticated;
revoke all on public.iris_acesso from anon, authenticated;
revoke all on public.iris_carteira from anon, authenticated;
revoke all on public.iris_eventos from anon, authenticated;
revoke all on public.iris_fila_abertura from anon, authenticated;
revoke all on public.iris_followups from anon, authenticated;
revoke all on public.iris_monitor_achados from anon, authenticated;
revoke all on public.iris_monitor_ciclos from anon, authenticated;
revoke all on public.iris_teste_limpezas from anon, authenticated;
revoke all on public.iris_textos from anon, authenticated;
revoke all on public.ligacoes_marcadas from anon, authenticated;
revoke all on public.mensagens from anon, authenticated;
revoke all on public.mensagens_agendadas from anon, authenticated;
revoke all on public.midia_melhoria_ia from anon, authenticated;
revoke all on public.atd_notificacoes from anon, authenticated;
revoke all on public.oportunidade_checklist from anon, authenticated;
revoke all on public.oportunidade_eventos from anon, authenticated;
revoke all on public.oportunidades from anon, authenticated;
revoke all on public.organizacao_limites from anon, authenticated;
revoke all on public.organizacao_usuarios from anon, authenticated;
revoke all on public.organizacoes from anon, authenticated;
revoke all on public.pendencias from anon, authenticated;
revoke all on public.planilha_config from anon, authenticated;
revoke all on public.planos from anon, authenticated;
revoke all on public.presenciais from anon, authenticated;
revoke all on public.presenciais_avisos from anon, authenticated;
revoke all on public.radar_textos from anon, authenticated;
revoke all on public.recados_gestor from anon, authenticated;
revoke all on public.regua_ativacoes from anon, authenticated;
revoke all on public.regua_envios from anon, authenticated;
revoke all on public.regua_passos from anon, authenticated;
revoke all on public.reguas from anon, authenticated;
revoke all on public.relacionamento_bloqueio from anon, authenticated;
revoke all on public.remarketing_config from anon, authenticated;
revoke all on public.remarketing_eventos from anon, authenticated;
revoke all on public.remarketing_leads from anon, authenticated;
revoke all on public.remarketing_tarefas from anon, authenticated;
revoke all on public.retomada_atendimento_log from anon, authenticated;
revoke all on public.robo_ligar from anon, authenticated;
revoke all on public.script_anexos from anon, authenticated;
revoke all on public.script_categorias from anon, authenticated;
revoke all on public.script_etapas from anon, authenticated;
revoke all on public.script_execucoes from anon, authenticated;
revoke all on public.scripts from anon, authenticated;
revoke all on public.sla_alertas from anon, authenticated;
revoke all on public.usuario_preferencias from anon, authenticated;
revoke all on public.usuarios from anon, authenticated;
revoke all on public.vacuo_config from anon, authenticated;
revoke all on public.vacuo_estado from anon, authenticated;
revoke all on public.vacuo_repasses from anon, authenticated;
revoke all on public.wa_audio_diag from anon, authenticated;
revoke all on public.wa_lid_map from anon, authenticated;
revoke all on public.atd_wa_optout from anon, authenticated;
revoke all on public.wa_templates from anon, authenticated;
revoke all on public.webhook_config from anon, authenticated;
revoke all on public.whatsapp_webhook_events from anon, authenticated;
grant select on public.adm_casos to authenticated;
grant select on public.adm_casos to service_role;
grant select on public.adm_config to authenticated;
grant select on public.adm_config to service_role;
grant select on public.adm_fechados to authenticated;
grant select on public.adm_fechados to service_role;
grant select on public.adm_movimentos to authenticated;
grant select on public.adm_movimentos to service_role;
grant select on public.adm_placar to authenticated;
grant select on public.adm_placar to service_role;
grant select on public.agendamento_atividades to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.agendamento_atividades to service_role;
grant delete, insert, select, update on public.agendamentos to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.agendamentos to service_role;
grant select on public.alertas_lead_quente to authenticated;
grant select on public.alertas_lead_quente to service_role;
grant select on public.assinatura_itens to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.assinatura_itens to service_role;
grant select on public.assinaturas to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.assinaturas to service_role;
grant insert, select, update on public.assistente_lembretes to service_role;
grant select on public.audit_log to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.audit_log to service_role;
grant delete, insert, references, select, trigger, truncate, update on public.avisos_passado_humano to service_role;
grant delete, insert, select, update on public.bom_dia_gestores to service_role;
grant select on public.bot_canal_config to authenticated;
grant select on public.bot_canal_config to service_role;
grant select on public.bot_conversa_estado to authenticated;
grant delete, insert, select, update on public.bot_conversa_estado to service_role;
grant select on public.bot_mensagens_saida to authenticated;
grant delete, insert, select, update on public.bot_mensagens_saida to service_role;
grant delete, insert, select, update on public.canais to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.canais to service_role;
grant select on public.canal_health_runs to authenticated;
grant insert, select, update on public.canal_health_runs to service_role;
grant select on public.canal_janela to authenticated;
grant insert, select, update on public.canal_janela to service_role;
grant select on public.checklist_modelo to authenticated;
grant insert, select, update on public.ciclos_vencimento to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.ciclos_vencimento to service_role;
grant delete, insert, select, update on public.cobranca_eventos to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.cobranca_eventos to service_role;
grant insert, select, update on public.cobranca_pagamentos to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.cobranca_pagamentos to service_role;
grant insert, select, update on public.cobrancas to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.cobrancas to service_role;
grant delete, insert, select, update on public.configuracoes to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.configuracoes to service_role;
grant delete, insert, select, update on public.contato_identidades to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.contato_identidades to service_role;
grant delete, insert, select, update on public.contatos to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.contatos to service_role;
grant select on public.conversa_atividades to authenticated;
grant delete, insert, select, update on public.conversa_etiquetas to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.conversa_etiquetas to service_role;
grant select on public.conversa_higiene_adiamentos to authenticated;
grant delete, insert, select, update on public.conversa_status_def to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.conversa_status_def to service_role;
grant delete, insert, select, update on public.conversas to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.conversas to service_role;
grant select on public.convites to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.convites to service_role;
grant delete, insert, select, update on public.etiquetas to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.etiquetas to service_role;
grant insert, select, update on public.fichas_judiciais to authenticated;
grant delete, insert, select, update on public.fontes_aquisicao to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.fontes_aquisicao to service_role;
grant delete, insert, select, update on public.funil_colunas to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.funil_colunas to service_role;
grant delete, insert, select, update on public.funis to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.funis to service_role;
grant delete, insert, select, update on public.ia_agentes to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.ia_agentes to service_role;
grant insert, select, update on public.ia_credito_episodios to service_role;
grant select on public.ia_eventos to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.ia_eventos to service_role;
grant delete, insert, select, update on public.ia_fluxos to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.ia_fluxos to service_role;
grant insert, select on public.ia_pausas to service_role;
grant select on public.ia_sessoes to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.ia_sessoes to service_role;
grant select on public.inss_documentos to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.inss_documentos to service_role;
grant insert, select, update on public.inss_pedidos to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.inss_pedidos to service_role;
grant delete, insert, select, update on public.atd_integracoes to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.atd_integracoes to service_role;
grant delete, insert, references, select, trigger, truncate, update on public.iris_acesso to service_role;
grant select on public.iris_carteira to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.iris_carteira to service_role;
grant select on public.iris_eventos to service_role;
grant delete, insert, references, select, trigger, truncate, update on public.iris_fila_abertura to service_role;
grant select on public.iris_followups to service_role;
grant select on public.iris_monitor_achados to service_role;
grant select on public.iris_monitor_ciclos to service_role;
grant select on public.iris_teste_limpezas to service_role;
grant select on public.iris_textos to service_role;
grant select on public.ligacoes_marcadas to service_role;
grant delete, insert, select, update on public.mensagens to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.mensagens to service_role;
grant select on public.mensagens_agendadas to authenticated;
grant insert, select, update on public.mensagens_agendadas to service_role;
grant select on public.midia_melhoria_ia to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.midia_melhoria_ia to service_role;
grant select on public.atd_notificacoes to authenticated;
grant delete, insert, select, update on public.atd_notificacoes to service_role;
grant insert, select, update on public.oportunidade_checklist to authenticated;
grant select on public.oportunidade_eventos to authenticated;
grant delete, insert, select, update on public.oportunidades to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.oportunidades to service_role;
grant select on public.organizacao_limites to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.organizacao_limites to service_role;
grant delete, insert, select, update on public.organizacao_usuarios to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.organizacao_usuarios to service_role;
grant select on public.organizacoes to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.organizacoes to service_role;
grant select on public.pendencias to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.pendencias to service_role;
grant select on public.planos to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.planos to service_role;
grant select on public.presenciais to authenticated;
grant select on public.presenciais to service_role;
grant select on public.presenciais_avisos to authenticated;
grant select, update on public.presenciais_avisos to service_role;
grant select on public.radar_textos to authenticated;
grant delete, insert, select, update on public.radar_textos to service_role;
grant select on public.regua_ativacoes to authenticated;
grant select on public.regua_envios to authenticated;
grant select on public.regua_passos to authenticated;
grant select on public.reguas to authenticated;
grant select on public.relacionamento_bloqueio to authenticated;
grant select on public.remarketing_config to authenticated;
grant delete, insert, select, update on public.remarketing_config to service_role;
grant select on public.remarketing_eventos to authenticated;
grant delete, insert, select, update on public.remarketing_eventos to service_role;
grant select on public.remarketing_leads to authenticated;
grant delete, insert, select, update on public.remarketing_leads to service_role;
grant select on public.remarketing_tarefas to authenticated;
grant delete, insert, select, update on public.remarketing_tarefas to service_role;
grant select on public.robo_ligar to authenticated;
grant delete, insert, select, update on public.robo_ligar to service_role;
grant delete, insert, select, update on public.script_anexos to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.script_anexos to service_role;
grant delete, insert, select, update on public.script_categorias to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.script_categorias to service_role;
grant delete, insert, select, update on public.script_etapas to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.script_etapas to service_role;
grant insert, select on public.script_execucoes to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.script_execucoes to service_role;
grant delete, insert, select, update on public.scripts to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.scripts to service_role;
grant select on public.sla_alertas to authenticated;
grant delete, insert, select, update on public.sla_alertas to service_role;
grant insert, select, update on public.usuario_preferencias to authenticated;
grant select on public.usuarios to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.usuarios to service_role;
grant select on public.vacuo_config to authenticated;
grant delete, insert, select, update on public.vacuo_config to service_role;
grant select on public.vacuo_estado to authenticated;
grant delete, insert, select, update on public.vacuo_estado to service_role;
grant select on public.vacuo_repasses to authenticated;
grant delete, insert, select, update on public.vacuo_repasses to service_role;
grant select on public.wa_audio_diag to authenticated;
grant delete, insert, select, update on public.wa_audio_diag to service_role;
grant select on public.wa_lid_map to authenticated;
grant delete, insert, select, update on public.wa_lid_map to service_role;
grant select on public.atd_wa_optout to authenticated;
grant delete, insert, select on public.atd_wa_optout to service_role;
grant select on public.wa_templates to authenticated;
grant insert, select, update on public.wa_templates to service_role;
grant delete, insert, select, update on public.webhook_config to service_role;
grant delete, insert, select, update on public.whatsapp_webhook_events to service_role;
grant usage, select on sequence public.adm_movimentos_id_seq to authenticated, service_role;
grant usage, select on sequence public.iris_teste_limpezas_id_seq to authenticated, service_role;
grant usage, select on sequence public.presenciais_avisos_id_seq to authenticated, service_role;

-- 11. quem pode chamar cada rotina (igual ao Atenvo)
revoke all on function public._eh_admin_org(uuid) from public, anon, authenticated;
grant execute on function public._eh_admin_org(uuid) to authenticated;
revoke all on function public._relacionamento_ativacao_gerivel(uuid) from public, anon, authenticated;
revoke all on function public._relacionamento_pode_gerir_contato(uuid,uuid) from public, anon, authenticated;
grant execute on function public._relacionamento_pode_gerir_contato(uuid,uuid) to authenticated;
revoke all on function public._vagas_usuarios(uuid) from public, anon, authenticated;
grant execute on function public._vagas_usuarios(uuid) to authenticated, service_role;
revoke all on function public.adm_jogadores(uuid,date) from public, anon, authenticated;
grant execute on function public.adm_jogadores(uuid,date) to authenticated, service_role;
revoke all on function public.adm_mes_inicio(timestamp with time zone) from public, anon, authenticated;
grant execute on function public.adm_mes_inicio(timestamp with time zone) to authenticated, service_role;
revoke all on function public.adm_nome_chave(text) from public, anon, authenticated;
grant execute on function public.adm_nome_chave(text) to authenticated, service_role;
revoke all on function public.adm_saiu_do_fechado(uuid) from public, anon, authenticated;
grant execute on function public.adm_saiu_do_fechado(uuid) to authenticated, service_role;
revoke all on function public.adm_status(uuid) from public, anon, authenticated;
grant execute on function public.adm_status(uuid) to authenticated, service_role;
revoke all on function public.adm_trava_assinar() from public, anon, authenticated;
grant execute on function public.adm_trava_assinar() to authenticated, service_role;
revoke all on function public.adm_trava_status() from public, anon, authenticated;
grant execute on function public.adm_trava_status() to authenticated, service_role;
revoke all on function public.adm_usuario_do_vendedor(uuid,text) from public, anon, authenticated;
grant execute on function public.adm_usuario_do_vendedor(uuid,text) to authenticated, service_role;
revoke all on function public.agendamentos_guarda() from public, anon, authenticated;
grant execute on function public.agendamentos_guarda() to anon, authenticated, service_role;
revoke all on function public.agendamentos_log() from public, anon, authenticated;
grant execute on function public.agendamentos_log() to anon, authenticated, service_role;
revoke all on function public.agendamentos_touch() from public, anon, authenticated;
grant execute on function public.agendamentos_touch() to anon, authenticated, service_role;
revoke all on function public.agendar_mensagem(uuid,uuid,text,timestamp with time zone) from public, anon, authenticated;
grant execute on function public.agendar_mensagem(uuid,uuid,text,timestamp with time zone) to authenticated;
revoke all on function public.agendar_midia(uuid,uuid,text,text,text,text,text,bigint,timestamp with time zone,text) from public, anon, authenticated;
grant execute on function public.agendar_midia(uuid,uuid,text,text,text,text,text,bigint,timestamp with time zone,text) to authenticated;
revoke all on function public.agendar_sequencia(uuid,uuid,timestamp with time zone,jsonb) from public, anon, authenticated;
grant execute on function public.agendar_sequencia(uuid,uuid,timestamp with time zone,jsonb) to authenticated;
revoke all on function public.alerta_lead_quente_assumir(uuid,uuid) from public, anon, authenticated;
grant execute on function public.alerta_lead_quente_assumir(uuid,uuid) to authenticated, service_role;
revoke all on function public.alerta_lead_quente_dispensar(uuid,uuid) from public, anon, authenticated;
grant execute on function public.alerta_lead_quente_dispensar(uuid,uuid) to authenticated, service_role;
revoke all on function public.alterar_status_parcela(uuid,text,text) from public, anon, authenticated;
grant execute on function public.alterar_status_parcela(uuid,text,text) to authenticated;
revoke all on function public.antonio_passar_humano(uuid,text) from public, anon, authenticated;
grant execute on function public.antonio_passar_humano(uuid,text) to service_role;
revoke all on function public.anuncio_mensagem_e_anuncio(text,jsonb) from public, anon, authenticated;
grant execute on function public.anuncio_mensagem_e_anuncio(text,jsonb) to authenticated, service_role;
revoke all on function public.assistente_papel(uuid,uuid) from public, anon, authenticated;
grant execute on function public.assistente_papel(uuid,uuid) to service_role;
revoke all on function public.atualizar_avatar(text) from public, anon, authenticated;
grant execute on function public.atualizar_avatar(text) to authenticated;
revoke all on function public.atualizar_canal_comercial(uuid,text,text,uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.atualizar_canal_comercial(uuid,text,text,uuid,uuid,text,text) to authenticated;
revoke all on function public.atualizar_organizacao(uuid,text,text,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.atualizar_organizacao(uuid,text,text,text,text,text,text,text) to authenticated;
revoke all on function public.atualizar_perfil(text,text,text) from public, anon, authenticated;
grant execute on function public.atualizar_perfil(text,text,text) to authenticated;
revoke all on function public.bom_dia_feriado_nome(date) from public, anon, authenticated;
grant execute on function public.bom_dia_feriado_nome(date) to service_role;
revoke all on function public.bom_dia_fora_do_atendimento(uuid,uuid) from public, anon, authenticated;
grant execute on function public.bom_dia_fora_do_atendimento(uuid,uuid) to service_role;
revoke all on function public.bom_dia_modo(uuid) from public, anon, authenticated;
grant execute on function public.bom_dia_modo(uuid) to authenticated, service_role;
revoke all on function public.bom_dia_resumo(uuid,text) from public, anon, authenticated;
grant execute on function public.bom_dia_resumo(uuid,text) to authenticated, service_role;
revoke all on function public.bom_dia_ultimo_util(date) from public, anon, authenticated;
grant execute on function public.bom_dia_ultimo_util(date) to service_role;
revoke all on function public.bot_avancar_etapa(uuid,text,jsonb,integer,uuid) from public, anon, authenticated;
grant execute on function public.bot_avancar_etapa(uuid,text,jsonb,integer,uuid) to authenticated, service_role;
revoke all on function public.bot_pausar(uuid,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.bot_pausar(uuid,text,text,jsonb) to authenticated, service_role;
revoke all on function public.bot_remarketing_inbound(uuid,text) from public, anon, authenticated;
grant execute on function public.bot_remarketing_inbound(uuid,text) to service_role;
revoke all on function public.bot_remarketing_touch_updated() from public, anon, authenticated;
grant execute on function public.bot_remarketing_touch_updated() to anon, authenticated, service_role;
revoke all on function public.calcular_valor_assinatura(uuid) from public, anon, authenticated;
grant execute on function public.calcular_valor_assinatura(uuid) to service_role;
revoke all on function public.cancelar_agendamento(uuid) from public, anon, authenticated;
grant execute on function public.cancelar_agendamento(uuid) to authenticated;
revoke all on function public.cancelar_cobranca(uuid,text) from public, anon, authenticated;
grant execute on function public.cancelar_cobranca(uuid,text) to authenticated;
revoke all on function public.chave_canonica_telefone(text) from public, anon, authenticated;
grant execute on function public.chave_canonica_telefone(text) to authenticated, service_role;
revoke all on function public.checa_limite_canais() from public, anon, authenticated;
grant execute on function public.checa_limite_canais() to anon, authenticated, service_role;
revoke all on function public.checa_limite_usuarios() from public, anon, authenticated;
grant execute on function public.checa_limite_usuarios() to anon, authenticated, service_role;
revoke all on function public.cobranca_gestor(uuid) from public, anon, authenticated;
grant execute on function public.cobranca_gestor(uuid) to authenticated;
revoke all on function public.compartilha_org(uuid) from public, anon, authenticated;
grant execute on function public.compartilha_org(uuid) to authenticated, service_role;
revoke all on function public.conversa_antonio_dono() from public, anon, authenticated;
grant execute on function public.conversa_antonio_dono() to authenticated, service_role;
revoke all on function public.conversa_no_antonio(uuid,uuid) from public, anon, authenticated;
grant execute on function public.conversa_no_antonio(uuid,uuid) to service_role;
revoke all on function public.conversa_passou_humano() from public, anon, authenticated;
grant execute on function public.conversa_passou_humano() to authenticated, service_role;
revoke all on function public.cpf_valido(text) from public, anon, authenticated;
revoke all on function public.criar_cobranca_com_parcelas(uuid,numeric,date,integer,uuid,text,text) from public, anon, authenticated;
grant execute on function public.criar_cobranca_com_parcelas(uuid,numeric,date,integer,uuid,text,text) to authenticated;
revoke all on function public.dash_v5_anuncio(uuid,timestamp with time zone,timestamp with time zone) from public, anon, authenticated;
grant execute on function public.dash_v5_anuncio(uuid,timestamp with time zone,timestamp with time zone) to service_role;
revoke all on function public.dash_v5_dados(uuid,timestamp with time zone,timestamp with time zone,timestamp with time zone,timestamp with time zone,timestamp with time zone) from public, anon, authenticated;
grant execute on function public.dash_v5_dados(uuid,timestamp with time zone,timestamp with time zone,timestamp with time zone,timestamp with time zone,timestamp with time zone) to service_role;
revoke all on function public.dash_v5_entradas(uuid,timestamp with time zone,timestamp with time zone) from public, anon, authenticated;
grant execute on function public.dash_v5_entradas(uuid,timestamp with time zone,timestamp with time zone) to service_role;
revoke all on function public.dash_v5_fechamentos(uuid,timestamp with time zone,timestamp with time zone) from public, anon, authenticated;
grant execute on function public.dash_v5_fechamentos(uuid,timestamp with time zone,timestamp with time zone) to service_role;
revoke all on function public.dash_v5_interno(text) from public, anon, authenticated;
grant execute on function public.dash_v5_interno(text) to service_role;
revoke all on function public.dash_v5_kpis(uuid,timestamp with time zone,timestamp with time zone) from public, anon, authenticated;
grant execute on function public.dash_v5_kpis(uuid,timestamp with time zone,timestamp with time zone) to service_role;
revoke all on function public.dash_v5_robo(uuid,timestamp with time zone,timestamp with time zone,uuid[]) from public, anon, authenticated;
grant execute on function public.dash_v5_robo(uuid,timestamp with time zone,timestamp with time zone,uuid[]) to service_role;
revoke all on function public.dash_v5_trafego(uuid) from public, anon, authenticated;
grant execute on function public.dash_v5_trafego(uuid) to service_role;
revoke all on function public.dash_v5s_feriados() from public, anon, authenticated;
grant execute on function public.dash_v5s_feriados() to service_role;
revoke all on function public.dashboard_motivos_descarte() from public, anon, authenticated;
grant execute on function public.dashboard_motivos_descarte() to authenticated, service_role;
revoke all on function public.dashboard_v5(timestamp with time zone,timestamp with time zone,uuid,timestamp with time zone,timestamp with time zone,timestamp with time zone) from public, anon, authenticated;
grant execute on function public.dashboard_v5(timestamp with time zone,timestamp with time zone,uuid,timestamp with time zone,timestamp with time zone,timestamp with time zone) to authenticated, service_role;
revoke all on function public.editar_agendamento(uuid,uuid,text,timestamp with time zone) from public, anon, authenticated;
grant execute on function public.editar_agendamento(uuid,uuid,text,timestamp with time zone) to authenticated;
revoke all on function public.emprestimo_pos_fluxo_ciclo_inicio(uuid,timestamp with time zone) from public, anon, authenticated;
grant execute on function public.emprestimo_pos_fluxo_ciclo_inicio(uuid,timestamp with time zone) to service_role;
revoke all on function public.equipe_listar(uuid) from public, anon, authenticated;
grant execute on function public.equipe_listar(uuid) to authenticated;
revoke all on function public.fila_iris_dono(uuid) from public, anon, authenticated;
grant execute on function public.fila_iris_dono(uuid) to service_role;
revoke all on function public.fn_alerta_lq_fluxo_concluido() from public, anon, authenticated;
grant execute on function public.fn_alerta_lq_fluxo_concluido() to anon, authenticated, service_role;
revoke all on function public.fn_alerta_lq_humano_cancela() from public, anon, authenticated;
grant execute on function public.fn_alerta_lq_humano_cancela() to anon, authenticated, service_role;
revoke all on function public.fn_alerta_lq_inbound_cancela() from public, anon, authenticated;
grant execute on function public.fn_alerta_lq_inbound_cancela() to anon, authenticated, service_role;
revoke all on function public.fn_arquivar_conversa_perdido() from public, anon, authenticated;
grant execute on function public.fn_arquivar_conversa_perdido() to anon, authenticated, service_role;
revoke all on function public.fn_audit() from public, anon, authenticated;
grant execute on function public.fn_audit() to anon, authenticated, service_role;
revoke all on function public.fn_canal_snapshot_before_delete() from public, anon, authenticated;
revoke all on function public.fn_checklist_stamp() from public, anon, authenticated;
grant execute on function public.fn_checklist_stamp() to anon, authenticated, service_role;
revoke all on function public.fn_ciclo_venc_touch() from public, anon, authenticated;
grant execute on function public.fn_ciclo_venc_touch() to anon, authenticated, service_role;
revoke all on function public.fn_cobranca_before() from public, anon, authenticated;
revoke all on function public.fn_cobranca_pag_touch() from public, anon, authenticated;
revoke all on function public.fn_cobranca_recalc() from public, anon, authenticated;
revoke all on function public.fn_conversa_atribui_canal() from public, anon, authenticated;
revoke all on function public.fn_ddd_fora_rs(uuid) from public, anon, authenticated;
grant execute on function public.fn_ddd_fora_rs(uuid) to authenticated, service_role;
revoke all on function public.fn_ficha_before() from public, anon, authenticated;
revoke all on function public.fn_ia_agentes_after_del() from public, anon, authenticated;
grant execute on function public.fn_ia_agentes_after_del() to anon, authenticated, service_role;
revoke all on function public.fn_ia_agentes_before_del() from public, anon, authenticated;
grant execute on function public.fn_ia_agentes_before_del() to anon, authenticated, service_role;
revoke all on function public.fn_ia_agentes_before_ins() from public, anon, authenticated;
grant execute on function public.fn_ia_agentes_before_ins() to anon, authenticated, service_role;
revoke all on function public.fn_ia_agentes_before_upd() from public, anon, authenticated;
grant execute on function public.fn_ia_agentes_before_upd() to anon, authenticated, service_role;
revoke all on function public.fn_ia_fluxos_before_del() from public, anon, authenticated;
grant execute on function public.fn_ia_fluxos_before_del() to anon, authenticated, service_role;
revoke all on function public.fn_ia_fluxos_before_upd() from public, anon, authenticated;
grant execute on function public.fn_ia_fluxos_before_upd() to anon, authenticated, service_role;
revoke all on function public.fn_ia_sessao_mensagem() from public, anon, authenticated;
grant execute on function public.fn_ia_sessao_mensagem() to anon, authenticated, service_role;
revoke all on function public.fn_ia_sessao_mensagem_iris_ok(jsonb) from public, anon, authenticated;
grant execute on function public.fn_ia_sessao_mensagem_iris_ok(jsonb) to authenticated, service_role;
revoke all on function public.fn_inss_pedido_before() from public, anon, authenticated;
grant execute on function public.fn_inss_pedido_before() to authenticated, service_role;
revoke all on function public.fn_opp_move_qualificado() from public, anon, authenticated;
grant execute on function public.fn_opp_move_qualificado() to anon, authenticated, service_role;
revoke all on function public.fn_protege_coluna_entrada() from public, anon, authenticated;
grant execute on function public.fn_protege_coluna_entrada() to anon, authenticated, service_role;
revoke all on function public.fn_remarketing_score(uuid) from public, anon, authenticated;
grant execute on function public.fn_remarketing_score(uuid) to service_role;
revoke all on function public.fn_wa_lid_map_touch() from public, anon, authenticated;
grant execute on function public.fn_wa_lid_map_touch() to anon, authenticated, service_role;
revoke all on function public.garantir_oportunidade_entrada(uuid,uuid,text,uuid,uuid) from public, anon, authenticated;
grant execute on function public.garantir_oportunidade_entrada(uuid,uuid,text,uuid,uuid) to authenticated, service_role;
revoke all on function public.garantir_oportunidade_lead_novo(uuid,uuid,uuid,text,boolean) from public, anon, authenticated;
grant execute on function public.garantir_oportunidade_lead_novo(uuid,uuid,uuid,text,boolean) to authenticated, service_role;
revoke all on function public.higiene_registrar_adiamento(uuid,text) from public, anon, authenticated;
grant execute on function public.higiene_registrar_adiamento(uuid,text) to authenticated;
revoke all on function public.ia_agente_metricas(uuid) from public, anon, authenticated;
grant execute on function public.ia_agente_metricas(uuid) to authenticated, service_role;
revoke all on function public.ia_agente_salvar_chave(uuid,text) from public, anon, authenticated;
grant execute on function public.ia_agente_salvar_chave(uuid,text) to authenticated, service_role;
revoke all on function public.ia_agente_vincular_canais(uuid,uuid[]) from public, anon, authenticated;
grant execute on function public.ia_agente_vincular_canais(uuid,uuid[]) to authenticated, service_role;
revoke all on function public.ia_atendendo_agora(uuid) from public, anon, authenticated;
grant execute on function public.ia_atendendo_agora(uuid) to authenticated, service_role;
revoke all on function public.ia_canal_atende(uuid) from public, anon, authenticated;
grant execute on function public.ia_canal_atende(uuid) to service_role;
revoke all on function public.ia_canal_ativar(uuid,boolean) from public, anon, authenticated;
grant execute on function public.ia_canal_ativar(uuid,boolean) to authenticated, service_role;
revoke all on function public.ia_canal_modo_teste(uuid,boolean,text[]) from public, anon, authenticated;
grant execute on function public.ia_canal_modo_teste(uuid,boolean,text[]) to authenticated, service_role;
revoke all on function public.ia_conversa_estado(uuid) from public, anon, authenticated;
grant execute on function public.ia_conversa_estado(uuid) to authenticated, service_role;
revoke all on function public.ia_conversa_recomecar(uuid) from public, anon, authenticated;
grant execute on function public.ia_conversa_recomecar(uuid) to authenticated, service_role;
revoke all on function public.ia_conversa_toggle(uuid,boolean) from public, anon, authenticated;
grant execute on function public.ia_conversa_toggle(uuid,boolean) to authenticated, service_role;
revoke all on function public.ia_familia_pendente_em(uuid,timestamp with time zone) from public, anon, authenticated;
grant execute on function public.ia_familia_pendente_em(uuid,timestamp with time zone) to service_role;
revoke all on function public.ia_sessao_antonio_so_matheus() from public, anon, authenticated;
grant execute on function public.ia_sessao_antonio_so_matheus() to authenticated, service_role;
revoke all on function public.iris_ativa_na_conversa(uuid) from public, anon, authenticated;
grant execute on function public.iris_ativa_na_conversa(uuid) to service_role;
revoke all on function public.iris_ativa_para(uuid,text) from public, anon, authenticated;
grant execute on function public.iris_ativa_para(uuid,text) to service_role;
revoke all on function public.iris_atraso_resposta_s(uuid) from public, anon, authenticated;
grant execute on function public.iris_atraso_resposta_s(uuid) to service_role;
revoke all on function public.iris_carteira_lista() from public, anon, authenticated;
grant execute on function public.iris_carteira_lista() to authenticated, service_role;
revoke all on function public.iris_cliente_escreveu() from public, anon, authenticated;
grant execute on function public.iris_cliente_escreveu() to service_role;
revoke all on function public.iris_contato_do_dono(uuid,text,uuid) from public, anon, authenticated;
grant execute on function public.iris_contato_do_dono(uuid,text,uuid) to service_role;
revoke all on function public.iris_contato_novo(uuid,text,timestamp with time zone) from public, anon, authenticated;
grant execute on function public.iris_contato_novo(uuid,text,timestamp with time zone) to authenticated, service_role;
revoke all on function public.iris_corte_limpeza(uuid) from public, anon, authenticated;
grant execute on function public.iris_corte_limpeza(uuid) to service_role;
revoke all on function public.iris_dia_util(date) from public, anon, authenticated;
grant execute on function public.iris_dia_util(date) to service_role;
revoke all on function public.iris_followup_ao_receber() from public, anon, authenticated;
grant execute on function public.iris_followup_ao_receber() to service_role;
revoke all on function public.iris_followup_classificar(text,text,boolean) from public, anon, authenticated;
grant execute on function public.iris_followup_classificar(text,text,boolean) to service_role;
revoke all on function public.iris_followup_dono(uuid) from public, anon, authenticated;
grant execute on function public.iris_followup_dono(uuid) to service_role;
revoke all on function public.iris_followup_evento(uuid,text,jsonb,text) from public, anon, authenticated;
grant execute on function public.iris_followup_evento(uuid,text,jsonb,text) to service_role;
revoke all on function public.iris_followup_finalizar(uuid,text,text,uuid,uuid) from public, anon, authenticated;
grant execute on function public.iris_followup_finalizar(uuid,text,text,uuid,uuid) to service_role;
revoke all on function public.iris_followup_mover_perdido(uuid) from public, anon, authenticated;
grant execute on function public.iris_followup_mover_perdido(uuid) to service_role;
revoke all on function public.iris_followup_notificar(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.iris_followup_notificar(uuid,text,text,text) to service_role;
revoke all on function public.iris_followup_pausar_atendimento(uuid,text) from public, anon, authenticated;
grant execute on function public.iris_followup_pausar_atendimento(uuid,text) to service_role;
revoke all on function public.iris_followup_texto_parar(text) from public, anon, authenticated;
grant execute on function public.iris_followup_texto_parar(text) to service_role;
revoke all on function public.iris_followup_texto_sim(text) from public, anon, authenticated;
grant execute on function public.iris_followup_texto_sim(text) to service_role;
revoke all on function public.iris_horario_comercial(timestamp with time zone) from public, anon, authenticated;
grant execute on function public.iris_horario_comercial(timestamp with time zone) to service_role;
revoke all on function public.iris_limpo_em(uuid) from public, anon, authenticated;
grant execute on function public.iris_limpo_em(uuid) to service_role;
revoke all on function public.iris_monitor_alertar_critico() from public, anon, authenticated;
grant execute on function public.iris_monitor_alertar_critico() to service_role;
revoke all on function public.iris_monitor_categoria_guarda(text) from public, anon, authenticated;
grant execute on function public.iris_monitor_categoria_guarda(text) to service_role;
revoke all on function public.iris_monitor_de_guarda() from public, anon, authenticated;
grant execute on function public.iris_monitor_de_guarda() to service_role;
revoke all on function public.iris_monitor_destinatarios(uuid) from public, anon, authenticated;
grant execute on function public.iris_monitor_destinatarios(uuid) to service_role;
revoke all on function public.iris_monitor_evento(uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.iris_monitor_evento(uuid,text,jsonb) to service_role;
revoke all on function public.iris_monitor_guarda_json(uuid) from public, anon, authenticated;
grant execute on function public.iris_monitor_guarda_json(uuid) to service_role;
revoke all on function public.iris_monitor_inserir(uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.iris_monitor_inserir(uuid,uuid,jsonb) to service_role;
revoke all on function public.iris_monitor_rotulo(text) from public, anon, authenticated;
grant execute on function public.iris_monitor_rotulo(text) to service_role;
revoke all on function public.iris_motivo_nao_tocar(uuid,text,text,timestamp with time zone) from public, anon, authenticated;
grant execute on function public.iris_motivo_nao_tocar(uuid,text,text,timestamp with time zone) to service_role;
revoke all on function public.iris_numero_teste(uuid,text) from public, anon, authenticated;
grant execute on function public.iris_numero_teste(uuid,text) to service_role;
revoke all on function public.iris_pode_tocar(uuid,text,text) from public, anon, authenticated;
grant execute on function public.iris_pode_tocar(uuid,text,text) to service_role;
revoke all on function public.iris_pode_ver() from public, anon, authenticated;
grant execute on function public.iris_pode_ver() to authenticated, service_role;
revoke all on function public.iris_registrar_evento(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.iris_registrar_evento(uuid,text,text,text) to service_role;
revoke all on function public.iris_teste_limpar(uuid,uuid) from public, anon, authenticated;
grant execute on function public.iris_teste_limpar(uuid,uuid) to service_role;
revoke all on function public.iris_teste_registrar_negado(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.iris_teste_registrar_negado(uuid,uuid,text) to service_role;
revoke all on function public.iris_texto_bot_recusa(text) from public, anon, authenticated;
grant execute on function public.iris_texto_bot_recusa(text) to service_role;
revoke all on function public.iris_texto_irritado(text) from public, anon, authenticated;
grant execute on function public.iris_texto_irritado(text) to service_role;
revoke all on function public.iris_texto_recusa(text) from public, anon, authenticated;
grant execute on function public.iris_texto_recusa(text) to service_role;
revoke all on function public.iris_textos_antes_update() from public, anon, authenticated;
grant execute on function public.iris_textos_antes_update() to service_role;
revoke all on function public.is_member(uuid) from public, anon, authenticated;
grant execute on function public.is_member(uuid) to authenticated, service_role;
revoke all on function public.is_platform_admin() from public, anon, authenticated;
grant execute on function public.is_platform_admin() to authenticated, service_role;
revoke all on function public.mensagens_agendadas_reivindicar(integer) from public, anon, authenticated;
grant execute on function public.mensagens_agendadas_reivindicar(integer) to service_role;
revoke all on function public.notificacao_marcar_lida(uuid) from public, anon, authenticated;
grant execute on function public.notificacao_marcar_lida(uuid) to authenticated, service_role;
revoke all on function public.notificacoes_marcar_todas(uuid) from public, anon, authenticated;
grant execute on function public.notificacoes_marcar_todas(uuid) to authenticated, service_role;
revoke all on function public.oportunidade_nao_elegivel(uuid,text) from public, anon, authenticated;
grant execute on function public.oportunidade_nao_elegivel(uuid,text) to service_role;
revoke all on function public.opp_sync_fechamento() from public, anon, authenticated;
grant execute on function public.opp_sync_fechamento() to anon, authenticated, service_role;
revoke all on function public.opp_touch_atualizado() from public, anon, authenticated;
grant execute on function public.opp_touch_atualizado() to anon, authenticated, service_role;
revoke all on function public.org_operacional(uuid) from public, anon, authenticated;
grant execute on function public.org_operacional(uuid) to authenticated, service_role;
revoke all on function public.org_papel(uuid) from public, anon, authenticated;
grant execute on function public.org_papel(uuid) to authenticated;
revoke all on function public.orgs_visiveis() from public, anon, authenticated;
grant execute on function public.orgs_visiveis() to authenticated, service_role;
revoke all on function public.papel_na_org(uuid) from public, anon, authenticated;
grant execute on function public.papel_na_org(uuid) to authenticated, service_role;
revoke all on function public.papel_org(uuid) from public, anon, authenticated;
grant execute on function public.papel_org(uuid) to authenticated, service_role;
revoke all on function public.presenciais_periodo(uuid,timestamp with time zone,timestamp with time zone) from public, anon, authenticated;
grant execute on function public.presenciais_periodo(uuid,timestamp with time zone,timestamp with time zone) to authenticated, service_role;
revoke all on function public.presencial_desmarcar(uuid) from public, anon, authenticated;
grant execute on function public.presencial_desmarcar(uuid) to authenticated, service_role;
revoke all on function public.presencial_dia_curto_txt(timestamp with time zone) from public, anon, authenticated;
grant execute on function public.presencial_dia_curto_txt(timestamp with time zone) to authenticated, service_role;
revoke all on function public.presencial_dia_txt(timestamp with time zone) from public, anon, authenticated;
grant execute on function public.presencial_dia_txt(timestamp with time zone) to authenticated, service_role;
revoke all on function public.presencial_hora_txt(timestamp with time zone) from public, anon, authenticated;
grant execute on function public.presencial_hora_txt(timestamp with time zone) to authenticated, service_role;
revoke all on function public.presencial_marcar(uuid,uuid,timestamp with time zone,text) from public, anon, authenticated;
grant execute on function public.presencial_marcar(uuid,uuid,timestamp with time zone,text) to authenticated, service_role;
revoke all on function public.presencial_na_txt(timestamp with time zone) from public, anon, authenticated;
grant execute on function public.presencial_na_txt(timestamp with time zone) to authenticated, service_role;
revoke all on function public.presencial_nome_txt(text) from public, anon, authenticated;
grant execute on function public.presencial_nome_txt(text) to authenticated, service_role;
revoke all on function public.presencial_remarcar(uuid,timestamp with time zone) from public, anon, authenticated;
grant execute on function public.presencial_remarcar(uuid,timestamp with time zone) to authenticated, service_role;
revoke all on function public.presencial_texto(text,text,timestamp with time zone,text) from public, anon, authenticated;
grant execute on function public.presencial_texto(text,text,timestamp with time zone,text) to authenticated, service_role;
revoke all on function public.provisionar_organizacao(text,text) from public, anon, authenticated;
grant execute on function public.provisionar_organizacao(text,text) to authenticated, service_role;
revoke all on function public.radar_avisos(uuid) from public, anon, authenticated;
grant execute on function public.radar_avisos(uuid) to authenticated, service_role;
revoke all on function public.radar_fmt_desde(timestamp with time zone) from public, anon, authenticated;
grant execute on function public.radar_fmt_desde(timestamp with time zone) to authenticated, service_role;
revoke all on function public.radar_fmt_tempo(integer,integer) from public, anon, authenticated;
grant execute on function public.radar_fmt_tempo(integer,integer) to authenticated, service_role;
revoke all on function public.radar_nome_curto(text) from public, anon, authenticated;
grant execute on function public.radar_nome_curto(text) to authenticated, service_role;
revoke all on function public.radar_nota(text,jsonb) from public, anon, authenticated;
grant execute on function public.radar_nota(text,jsonb) to service_role;
revoke all on function public.radar_prioridade(boolean,text) from public, anon, authenticated;
grant execute on function public.radar_prioridade(boolean,text) to authenticated, service_role;
revoke all on function public.radar_so_agradecimento(text,text) from public, anon, authenticated;
grant execute on function public.radar_so_agradecimento(text,text) to authenticated, service_role;
revoke all on function public.radar_txt(text,jsonb) from public, anon, authenticated;
grant execute on function public.radar_txt(text,jsonb) to authenticated, service_role;
revoke all on function public.reagendar_agendamento(uuid,uuid,timestamp with time zone) from public, anon, authenticated;
grant execute on function public.reagendar_agendamento(uuid,uuid,timestamp with time zone) to authenticated;
revoke all on function public.recado_dono_agora(uuid,uuid) from public, anon, authenticated;
grant execute on function public.recado_dono_agora(uuid,uuid) to service_role;
revoke all on function public.recado_dono_mudou() from public, anon, authenticated;
grant execute on function public.recado_dono_mudou() to service_role;
revoke all on function public.recado_respondeu_em(uuid,uuid,timestamp with time zone,uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.recado_respondeu_em(uuid,uuid,timestamp with time zone,uuid,uuid,uuid) to service_role;
revoke all on function public.redige_senha(text) from public, anon, authenticated;
revoke all on function public.registrar_baixa_parcela(uuid,date,text) from public, anon, authenticated;
grant execute on function public.registrar_baixa_parcela(uuid,date,text) to authenticated;
revoke all on function public.regua_arquivar(uuid,uuid) from public, anon, authenticated;
grant execute on function public.regua_arquivar(uuid,uuid) to authenticated;
revoke all on function public.regua_ativar(uuid,uuid,uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.regua_ativar(uuid,uuid,uuid,uuid,uuid) to authenticated;
revoke all on function public.regua_desativar(uuid,text) from public, anon, authenticated;
grant execute on function public.regua_desativar(uuid,text) to authenticated;
revoke all on function public.regua_excluir(uuid,uuid) from public, anon, authenticated;
grant execute on function public.regua_excluir(uuid,uuid) to authenticated;
revoke all on function public.regua_passo_remover(uuid,uuid) from public, anon, authenticated;
grant execute on function public.regua_passo_remover(uuid,uuid) to authenticated;
revoke all on function public.regua_passo_salvar(uuid,uuid,uuid,smallint,text,text,text,text,text,text,bigint,text,integer,integer,time without time zone,date) from public, anon, authenticated;
grant execute on function public.regua_passo_salvar(uuid,uuid,uuid,smallint,text,text,text,text,text,text,bigint,text,integer,integer,time without time zone,date) to authenticated;
revoke all on function public.regua_salvar(uuid,uuid,text,text,text,text,boolean,integer,integer,integer[],time without time zone,time without time zone,text,uuid) from public, anon, authenticated;
grant execute on function public.regua_salvar(uuid,uuid,text,text,text,text,boolean,integer,integer,integer[],time without time zone,time without time zone,text,uuid) to authenticated;
revoke all on function public.regua_trocar(uuid,uuid) from public, anon, authenticated;
grant execute on function public.regua_trocar(uuid,uuid) to authenticated;
revoke all on function public.relacionamento_admin(uuid) from public, anon, authenticated;
grant execute on function public.relacionamento_admin(uuid) to authenticated;
revoke all on function public.relacionamento_bloquear(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.relacionamento_bloquear(uuid,uuid,text) to authenticated;
revoke all on function public.relacionamento_desbloquear(uuid,uuid) from public, anon, authenticated;
grant execute on function public.relacionamento_desbloquear(uuid,uuid) to authenticated;
revoke all on function public.remarketing_config_salvar(uuid,boolean,integer,integer,integer,uuid[]) from public, anon, authenticated;
grant execute on function public.remarketing_config_salvar(uuid,boolean,integer,integer,integer,uuid[]) to authenticated, service_role;
revoke all on function public.remarketing_conversa_resumo(uuid,uuid) from public, anon, authenticated;
grant execute on function public.remarketing_conversa_resumo(uuid,uuid) to authenticated, service_role;
revoke all on function public.remarketing_dashboard(uuid) from public, anon, authenticated;
grant execute on function public.remarketing_dashboard(uuid) to authenticated, service_role;
revoke all on function public.remarketing_fila_sinais(uuid) from public, anon, authenticated;
grant execute on function public.remarketing_fila_sinais(uuid) to authenticated, service_role;
revoke all on function public.remarketing_mudar_etapa(uuid,text) from public, anon, authenticated;
grant execute on function public.remarketing_mudar_etapa(uuid,text) to authenticated, service_role;
revoke all on function public.remarketing_observacao(uuid,text) from public, anon, authenticated;
grant execute on function public.remarketing_observacao(uuid,text) to authenticated, service_role;
revoke all on function public.remarketing_produtividade(uuid) from public, anon, authenticated;
grant execute on function public.remarketing_produtividade(uuid) to authenticated, service_role;
revoke all on function public.remarketing_reagendar(uuid,timestamp with time zone) from public, anon, authenticated;
grant execute on function public.remarketing_reagendar(uuid,timestamp with time zone) to authenticated, service_role;
revoke all on function public.remarketing_registrar_acao(uuid,text) from public, anon, authenticated;
grant execute on function public.remarketing_registrar_acao(uuid,text) to authenticated, service_role;
revoke all on function public.remarketing_tarefa_concluir(uuid) from public, anon, authenticated;
grant execute on function public.remarketing_tarefa_concluir(uuid) to authenticated, service_role;
revoke all on function public.remarketing_transferir(uuid,uuid) from public, anon, authenticated;
grant execute on function public.remarketing_transferir(uuid,uuid) to authenticated, service_role;
revoke all on function public.remover_mensagem_falha(uuid) from public, anon, authenticated;
grant execute on function public.remover_mensagem_falha(uuid) to authenticated;
revoke all on function public.renomear_canal(uuid,text) from public, anon, authenticated;
grant execute on function public.renomear_canal(uuid,text) to authenticated;
revoke all on function public.reordenar_colunas_funil(uuid,uuid[]) from public, anon, authenticated;
grant execute on function public.reordenar_colunas_funil(uuid,uuid[]) to authenticated, service_role;
revoke all on function public.rmkt_transicionar(uuid,text,uuid,text,text,text,text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.rmkt_transicionar(uuid,text,uuid,text,text,text,text,text,text,jsonb) to service_role;
revoke all on function public.robo_ligar_concluir(uuid) from public, anon, authenticated;
grant execute on function public.robo_ligar_concluir(uuid) to authenticated, service_role;
revoke all on function public.salvar_preferencias(jsonb) from public, anon, authenticated;
grant execute on function public.salvar_preferencias(jsonb) to authenticated;
revoke all on function public.seed_status_conversa_padrao() from public, anon, authenticated;
grant execute on function public.seed_status_conversa_padrao() to anon, authenticated, service_role;
revoke all on function public.set_atualizado_em() from public, anon, authenticated;
grant execute on function public.set_atualizado_em() to anon, authenticated, service_role;
revoke all on function public.sla_alertas_ativos(uuid) from public, anon, authenticated;
grant execute on function public.sla_alertas_ativos(uuid) to authenticated, service_role;
revoke all on function public.sla_contato_assumido() from public, anon, authenticated;
grant execute on function public.sla_contato_assumido() to anon, authenticated, service_role;
revoke all on function public.sla_conversa_atendente() from public, anon, authenticated;
grant execute on function public.sla_conversa_atendente() to anon, authenticated, service_role;
revoke all on function public.sla_mensagem_humano() from public, anon, authenticated;
grant execute on function public.sla_mensagem_humano() to anon, authenticated, service_role;
revoke all on function public.sla_opp_movimento() from public, anon, authenticated;
grant execute on function public.sla_opp_movimento() to anon, authenticated, service_role;
revoke all on function public.sla_registrar(uuid,text,text,uuid,uuid,uuid,uuid,text,text,timestamp with time zone) from public, anon, authenticated;
grant execute on function public.sla_registrar(uuid,text,text,uuid,uuid,uuid,uuid,text,text,timestamp with time zone) to authenticated, service_role;
revoke all on function public.sla_resolver(uuid) from public, anon, authenticated;
grant execute on function public.sla_resolver(uuid) to authenticated, service_role;
revoke all on function public.sla_silenciar(uuid,timestamp with time zone,text) from public, anon, authenticated;
grant execute on function public.sla_silenciar(uuid,timestamp with time zone,text) to authenticated, service_role;
revoke all on function public.sync_responsavel_cliente(uuid,uuid,uuid,uuid) from public, anon, authenticated;
revoke all on function public.tg_etiqueta_delete_sync_cache() from public, anon, authenticated;
grant execute on function public.tg_etiqueta_delete_sync_cache() to anon, authenticated, service_role;
revoke all on function public.tg_etiqueta_rename_sync_cache() from public, anon, authenticated;
grant execute on function public.tg_etiqueta_rename_sync_cache() to anon, authenticated, service_role;
revoke all on function public.toque_automatico_permitido(uuid) from public, anon, authenticated;
grant execute on function public.toque_automatico_permitido(uuid) to service_role;
revoke all on function public.toques_automaticos(uuid,timestamp with time zone,timestamp with time zone) from public, anon, authenticated;
grant execute on function public.toques_automaticos(uuid,timestamp with time zone,timestamp with time zone) to service_role;
revoke all on function public.trg_fn_conversa_ultima_entrada() from public, anon, authenticated;
revoke all on function public.trg_fn_lead_fora_rs() from public, anon, authenticated;
grant execute on function public.trg_fn_lead_fora_rs() to authenticated, service_role;
revoke all on function public.trg_fn_reverse_resp_oportunidade() from public, anon, authenticated;
revoke all on function public.trg_fn_sync_responsavel_cliente() from public, anon, authenticated;
grant execute on function public.trg_fn_sync_responsavel_cliente() to anon, authenticated, service_role;
revoke all on function public.trg_rmkt_score_evento() from public, anon, authenticated;
grant execute on function public.trg_rmkt_score_evento() to anon, authenticated, service_role;
revoke all on function public.vacuo_cutucar(uuid) from public, anon, authenticated;
grant execute on function public.vacuo_cutucar(uuid) to authenticated, service_role;
revoke all on function public.vacuo_decidir(uuid,uuid) from public, anon, authenticated;
grant execute on function public.vacuo_decidir(uuid,uuid) to authenticated, service_role;
revoke all on function public.vacuo_decisoes_pendentes(uuid) from public, anon, authenticated;
grant execute on function public.vacuo_decisoes_pendentes(uuid) to authenticated, service_role;
revoke all on function public.vacuo_eh_gestor(uuid) from public, anon, authenticated;
grant execute on function public.vacuo_eh_gestor(uuid) to authenticated, service_role;
revoke all on function public.vacuo_melhor_fechador(uuid,uuid,integer,integer) from public, anon, authenticated;
grant execute on function public.vacuo_melhor_fechador(uuid,uuid,integer,integer) to service_role;
revoke all on function public.vacuo_minutos_uteis(timestamp with time zone,timestamp with time zone,integer,integer) from public, anon, authenticated;
grant execute on function public.vacuo_minutos_uteis(timestamp with time zone,timestamp with time zone,integer,integer) to authenticated, service_role;
revoke all on function public.vacuo_ranking(uuid) from public, anon, authenticated;
grant execute on function public.vacuo_ranking(uuid) to authenticated, service_role;
revoke all on function public.wa_arquivar_conversa(uuid,boolean) from public, anon, authenticated;
grant execute on function public.wa_arquivar_conversa(uuid,boolean) to authenticated, service_role;
revoke all on function public.wa_canais_alertas_globais(uuid) from public, anon, authenticated;
grant execute on function public.wa_canais_alertas_globais(uuid) to authenticated;
revoke all on function public.wa_canal_reativar_alerta(uuid) from public, anon, authenticated;
grant execute on function public.wa_canal_reativar_alerta(uuid) to authenticated;
revoke all on function public.wa_canal_silenciar_alerta(uuid,timestamp with time zone,text) from public, anon, authenticated;
grant execute on function public.wa_canal_silenciar_alerta(uuid,timestamp with time zone,text) to authenticated;
revoke all on function public.wa_consolidar_canal_por_numero(uuid,uuid) from public, anon, authenticated;
grant execute on function public.wa_consolidar_canal_por_numero(uuid,uuid) to authenticated, service_role;
revoke all on function public.wa_dentro_janela(uuid,uuid,integer) from public, anon, authenticated;
grant execute on function public.wa_dentro_janela(uuid,uuid,integer) to authenticated, service_role;
revoke all on function public.wa_entrega_auto_resumo(uuid) from public, anon, authenticated;
grant execute on function public.wa_entrega_auto_resumo(uuid) to authenticated, service_role;
revoke all on function public.wa_fixar_conversa(uuid,boolean) from public, anon, authenticated;
grant execute on function public.wa_fixar_conversa(uuid,boolean) to authenticated, service_role;
revoke all on function public.wa_inbound_garantir_contato_conversa(uuid,uuid,text,text,text,text,text,boolean) from public, anon, authenticated;
grant execute on function public.wa_inbound_garantir_contato_conversa(uuid,uuid,text,text,text,text,text,boolean) to service_role;
revoke all on function public.wa_janela_registrar(uuid,uuid,timestamp with time zone) from public, anon, authenticated;
grant execute on function public.wa_janela_registrar(uuid,uuid,timestamp with time zone) to service_role;
revoke all on function public.wa_marcar_lida(uuid,boolean) from public, anon, authenticated;
grant execute on function public.wa_marcar_lida(uuid,boolean) to authenticated, service_role;
revoke all on function public.wa_optout_inbound(uuid,text) from public, anon, authenticated;
grant execute on function public.wa_optout_inbound(uuid,text) to service_role;
revoke all on function public.wa_optout_registrar(uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.wa_optout_registrar(uuid,uuid,text,text) to service_role;
revoke all on function public.wa_resolver_contato_por_numero(uuid,text) from public, anon, authenticated;
grant execute on function public.wa_resolver_contato_por_numero(uuid,text) to service_role;
revoke all on function public.wa_templates_touch() from public, anon, authenticated;
revoke all on function public.wa_vincular_numero(uuid,text,text,uuid) from public, anon, authenticated;
grant execute on function public.wa_vincular_numero(uuid,text,text,uuid) to authenticated, service_role;

-- 12. tempo real (as telas do Atendimento recebem as mudanças na hora)
do $$ begin if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'contatos') then alter publication supabase_realtime add table public.contatos; end if; end $$;
do $$ begin if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'conversas') then alter publication supabase_realtime add table public.conversas; end if; end $$;
do $$ begin if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'mensagens') then alter publication supabase_realtime add table public.mensagens; end if; end $$;
do $$ begin if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'oportunidades') then alter publication supabase_realtime add table public.oportunidades; end if; end $$;
do $$ begin if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'funil_colunas') then alter publication supabase_realtime add table public.funil_colunas; end if; end $$;
do $$ begin if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'remarketing_leads') then alter publication supabase_realtime add table public.remarketing_leads; end if; end $$;
do $$ begin if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'remarketing_tarefas') then alter publication supabase_realtime add table public.remarketing_tarefas; end if; end $$;
do $$ begin if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'atd_notificacoes') then alter publication supabase_realtime add table public.atd_notificacoes; end if; end $$;
do $$ begin if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'alertas_lead_quente') then alter publication supabase_realtime add table public.alertas_lead_quente; end if; end $$;

-- 13. A EMPRESA E AS PESSOAS. O Atendimento do Atenvo trabalha por empresa (organizacao_id) e por membros
-- (organizacao_usuarios). No Reviza a empresa é uma só e as pessoas são as de profiles: quem tem o ambiente
-- Atendimento (administrador, atendente ou quem tem 'atendimento' marcado) é membro ativo; os demais, inativos.
insert into public.organizacoes (id, nome, slug, status, assinatura_status)
values ('a1fa0000-0000-4000-8000-000000000001', 'ALFA GROUP', 'reviza', 'ativa', 'isenta') on conflict (id) do nothing;

create or replace function private.atd_sincroniza_pessoa()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_tem boolean; v_papel public.user_role;
begin
  v_tem := new.ativo and (new.papel::text in ('admin', 'atendente') or 'atendimento' = any (coalesce(new.modulos, '{}'::text[])));
  v_papel := case when new.papel::text = 'admin' then 'admin' else 'atendente' end::public.user_role;
  insert into public.usuarios (id, nome, email, papel, ativo, deve_trocar_senha)
  values (new.id, coalesce(nullif(btrim(new.nome), ''), split_part(coalesce(new.email, 'pessoa'), '@', 1)), new.email, v_papel, new.ativo, coalesce(new.deve_trocar_senha, false))
  on conflict (id) do update set nome = excluded.nome, email = excluded.email, papel = excluded.papel, ativo = excluded.ativo,
    deve_trocar_senha = excluded.deve_trocar_senha, atualizado_em = now();
  insert into public.organizacao_usuarios (organizacao_id, usuario_id, papel, status)
  values ('a1fa0000-0000-4000-8000-000000000001', new.id, v_papel, case when v_tem then 'ativo' else 'inativo' end::public.membership_status)
  on conflict (organizacao_id, usuario_id) do update set papel = excluded.papel, status = excluded.status, atualizado_em = now();
  return null;
end $$;
revoke all on function private.atd_sincroniza_pessoa() from public, anon, authenticated;
drop trigger if exists profiles_atd_sincroniza on public.profiles;
create trigger profiles_atd_sincroniza after insert or update of papel, ativo, modulos, nome, email, deve_trocar_senha on public.profiles
  for each row execute function private.atd_sincroniza_pessoa();
-- limites da empresa: o Atenvo vende por número de pessoas e de WhatsApp; no Reviza não há limite
insert into public.organizacao_limites (organizacao_id, usuarios_incluidos, whatsapps_incluidos, facebook_incluidos)
values ('a1fa0000-0000-4000-8000-000000000001', 500, 50, 5) on conflict (organizacao_id) do nothing;

-- o funil do Kanban, igual ao da demonstração aprovada (LEAD NOVO é a entrada; Fechado e Perdido encerram)
do $$
declare v_funil uuid;
begin
  if not exists (select 1 from public.funis where organizacao_id = 'a1fa0000-0000-4000-8000-000000000001') then
    insert into public.funis (organizacao_id, nome, padrao, ordem) values ('a1fa0000-0000-4000-8000-000000000001', 'Funil principal', true, 0) returning id into v_funil;
    insert into public.funil_colunas (funil_id, organizacao_id, nome, cor, ordem, entrada, resultado, encerra_oportunidade, papel) values
      (v_funil, 'a1fa0000-0000-4000-8000-000000000001', 'LEAD NOVO',      '#64748b', 0, true,  'neutro',  false, null),
      (v_funil, 'a1fa0000-0000-4000-8000-000000000001', 'Em atendimento', '#3b82f6', 1, false, 'neutro',  false, null),
      (v_funil, 'a1fa0000-0000-4000-8000-000000000001', 'Documentação',   '#f59e0b', 2, false, 'neutro',  false, 'producao'),
      (v_funil, 'a1fa0000-0000-4000-8000-000000000001', 'Qualificado',    '#8b5cf6', 3, false, 'neutro',  false, 'qualificado'),
      (v_funil, 'a1fa0000-0000-4000-8000-000000000001', 'Fechado',        '#19C37D', 4, false, 'ganho',   true,  null),
      (v_funil, 'a1fa0000-0000-4000-8000-000000000001', 'Perdido',        '#e11d48', 5, false, 'perdido', true,  null);
  end if;
end $$;

-- quem já existe hoje (sem mexer em profiles)
insert into public.usuarios (id, nome, email, papel, ativo, deve_trocar_senha)
select p.id, coalesce(nullif(btrim(p.nome), ''), split_part(coalesce(p.email, 'pessoa'), '@', 1)), p.email,
       case when p.papel::text = 'admin' then 'admin' else 'atendente' end::public.user_role, p.ativo, coalesce(p.deve_trocar_senha, false)
  from public.profiles p on conflict (id) do nothing;
insert into public.organizacao_usuarios (organizacao_id, usuario_id, papel, status)
select 'a1fa0000-0000-4000-8000-000000000001', p.id, case when p.papel::text = 'admin' then 'admin' else 'atendente' end::public.user_role,
       case when p.ativo and (p.papel::text in ('admin', 'atendente') or 'atendimento' = any (coalesce(p.modulos, '{}'::text[]))) then 'ativo' else 'inativo' end::public.membership_status
  from public.profiles p on conflict (organizacao_id, usuario_id) do nothing;

-- 14. PASTAS DE ARQUIVOS do Atendimento: script-midia (mensagens prontas e mídias recebidas, por empresa) e
-- atd-midia (mídias enviadas). A pasta wa-midia continua só das Cobranças.
insert into storage.buckets (id, name, public) values ('script-midia', 'script-midia', false) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('atd-midia', 'atd-midia', false) on conflict (id) do nothing;
drop policy if exists script_midia_del on storage.objects;
create policy script_midia_del on storage.objects as permissive for delete to authenticated using (((bucket_id = 'script-midia'::text) AND is_member((NULLIF((storage.foldername(name))[1], ''::text))::uuid)));
drop policy if exists script_midia_ins on storage.objects;
create policy script_midia_ins on storage.objects as permissive for insert to authenticated with check (((bucket_id = 'script-midia'::text) AND is_member((NULLIF((storage.foldername(name))[1], ''::text))::uuid)));
drop policy if exists script_midia_sel on storage.objects;
create policy script_midia_sel on storage.objects as permissive for select to authenticated using (((bucket_id = 'script-midia'::text) AND is_member((NULLIF((storage.foldername(name))[1], ''::text))::uuid)));
-- 15. A REGRA DO GERENTE DENTRO DO BANCO (dono 23/11). No Atenvo qualquer pessoa da empresa consegue ler todas as
-- conversas pelo banco (o recorte é só da tela). No Reviza, ler contatos, conversas, mensagens e oportunidades:
--   administrador: tudo; gerente: as das pessoas das equipes dele e as que chegam nos números delas;
--   atendente: só as dos clientes dele. As funções do servidor (WhatsApp) não passam por esta regra.
create or replace function public.atd_resp_do_contato(p_contato uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select c.responsavel_id from public.contatos c where c.id = p_contato
$$;
create or replace function public.atd_vejo_conversa(p_conversa uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_at_least('admin') or exists (
    select 1 from public.conversas cv join public.contatos ct on ct.id = cv.contato_id
     where cv.id = p_conversa
       and (ct.responsavel_id = any (public.equipe_pessoas_que_vejo())
            or coalesce(cv.canal_id, cv.ultimo_canal_id, cv.canal_origem_id) = any (public.equipe_canais_que_vejo())))
$$;
revoke all on function public.atd_resp_do_contato(uuid) from public, anon;
revoke all on function public.atd_vejo_conversa(uuid) from public, anon;
grant execute on function public.atd_resp_do_contato(uuid) to authenticated, service_role;
grant execute on function public.atd_vejo_conversa(uuid) to authenticated, service_role;
drop policy if exists atd_quem_ve on public.contatos;
create policy atd_quem_ve on public.contatos as restrictive for select to authenticated using (
  (select public.is_at_least('admin')) or responsavel_id = any ((select public.equipe_pessoas_que_vejo())::uuid[])
  or canal_origem_id = any ((select public.equipe_canais_que_vejo())::uuid[]));
drop policy if exists atd_quem_ve on public.conversas;
create policy atd_quem_ve on public.conversas as restrictive for select to authenticated using (
  (select public.is_at_least('admin')) or public.atd_resp_do_contato(contato_id) = any ((select public.equipe_pessoas_que_vejo())::uuid[])
  or coalesce(canal_id, ultimo_canal_id, canal_origem_id) = any ((select public.equipe_canais_que_vejo())::uuid[]));
drop policy if exists atd_quem_ve on public.mensagens;
create policy atd_quem_ve on public.mensagens as restrictive for select to authenticated using (
  (select public.is_at_least('admin')) or public.atd_vejo_conversa(conversa_id));
drop policy if exists atd_quem_ve on public.oportunidades;
create policy atd_quem_ve on public.oportunidades as restrictive for select to authenticated using (
  (select public.is_at_least('admin')) or coalesce(responsavel_id, public.atd_resp_do_contato(contato_id)) = any ((select public.equipe_pessoas_que_vejo())::uuid[])
  or canal_origem_id = any ((select public.equipe_canais_que_vejo())::uuid[]));
reset check_function_bodies;
-- DESFAZER: drop trigger profiles_atd_sincroniza on public.profiles; e apagar as 106 tabelas, as rotinas e os
-- tipos criados acima (lista em ~/reviza-sist/porte-atendimento/fechamento.json). Nada das Cobranças depende deles.
