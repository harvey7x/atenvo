-- 89 — WhatsApp oficial (API da Meta), etapa 1 (dono 22/11): conectar o número, acompanhar a saúde dele,
-- cuidar dos modelos de mensagem e mandar mensagem de teste.
-- O QUE NÃO ENTRA AINDA: receber as conversas e responder por este número (o atendimento), e a régua
-- enviar por ele. Apenas aditivo. O código de acesso da Meta fica no cofre (vault), pelas funções da 87.

create table if not exists public.wa_oficial_conta (
  id                 boolean primary key default true check (id),   -- uma conta só por instalação
  waba_id            text,
  empresa_nome       text,
  empresa_verificada boolean not null default false,
  limite_dia         integer,            -- clientes diferentes por dia fora das 24 h (nulo = sem limite; 0 = não informado)
  atualizado_em      timestamptz not null default now()
);
create table if not exists public.wa_oficial_numeros (
  id              uuid primary key default gen_random_uuid(),
  phone_number_id text not null unique,
  numero          text,
  nome            text not null,          -- como a equipe chama o número
  nome_exibicao   text,                   -- o que o cliente vê (aprovado pela Meta)
  nome_situacao   text not null default 'analise',
  qualidade       text not null default 'desconhecida',
  ambiente        text not null check (ambiente in ('cobrancas', 'atendimento')),
  no_celular      boolean not null default false,
  recebimento     boolean not null default false,
  bloqueado       boolean not null default false,
  conectado_em    timestamptz not null default now(),
  conectado_por   text
);
create table if not exists public.wa_oficial_modelos (
  id            text primary key,          -- id do modelo na Meta
  nome          text not null,
  categoria     text not null default 'utilidade',
  idioma        text not null default 'pt_BR',
  situacao      text not null default 'analise',
  texto         text not null default '',  -- com as variáveis do sistema ({nome}…) quando criado aqui
  variaveis     jsonb,                     -- ordem das variáveis: {{1}} = variaveis[0]…
  motivo        text,
  atualizado_em timestamptz not null default now()
);
-- a conexão em dois passos (achar os números → escolher): o código de acesso espera no cofre com este id
create table if not exists public.wa_oficial_sessoes (
  id         uuid primary key default gen_random_uuid(),
  waba_id    text not null,
  criado_por uuid,
  criado_em  timestamptz not null default now()
);
-- ninguém lê nem grava pelo navegador: a tela conversa só com a função reviza-wa-oficial
alter table public.wa_oficial_conta enable row level security;
alter table public.wa_oficial_numeros enable row level security;
alter table public.wa_oficial_modelos enable row level security;
alter table public.wa_oficial_sessoes enable row level security;
revoke all on public.wa_oficial_conta, public.wa_oficial_numeros, public.wa_oficial_modelos, public.wa_oficial_sessoes from anon, authenticated;
grant all on public.wa_oficial_conta, public.wa_oficial_numeros, public.wa_oficial_modelos, public.wa_oficial_sessoes to service_role;

notify pgrst, 'reload schema';

-- DESFAZER: drop table public.wa_oficial_sessoes; drop table public.wa_oficial_modelos; drop table public.wa_oficial_numeros;
--           drop table public.wa_oficial_conta; delete from vault.secrets where name like 'wa_oficial_%';
