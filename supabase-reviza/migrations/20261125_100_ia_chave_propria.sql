-- 100 · INTELIGÊNCIA ARTIFICIAL COM A CHAVE DA PRÓPRIA EMPRESA (25/11). No sistema que a Reviza usava antes havia o
-- "Resumo do atendimento" no painel do cliente, o "Transcrever" nos áudios e, nas configurações, a "chave de IA própria"
-- (o custo passa a ser da empresa). Aqui:
--   atd_ia_chave   a chave de IA da empresa (Google Gemini ou OpenAI). Mora AQUI e só o servidor lê (função atd-ia):
--                  nunca volta para a tela, que vê no máximo o provedor, quem configurou, quando e os 4 últimos caracteres
--   atd_resumos    o último resumo de cada conversa (para não pagar a IA de novo a cada vez que alguém abre)
--   atd_ia_gravar_transcricao  grava a transcrição em mensagens.metadados.transcricao sem apagar o resto dos metadados
-- A chave é SEMPRE a da própria empresa: nada aqui lê, copia ou usa chave de outro cliente.
-- Nada das Cobranças nem do resto do Atendimento muda.

-- 1) a chave (uma por empresa)
create table if not exists public.atd_ia_chave (
  organizacao_id  uuid primary key references public.organizacoes(id) on delete cascade,
  provedor        text not null check (provedor in ('gemini', 'openai')),
  chave           text not null check (length(chave) between 20 and 400),
  final           text check (final is null or length(final) <= 8),
  configurada_por uuid,
  configurada_em  timestamptz not null default now(),
  ultimo_teste_em timestamptz,
  ultimo_erro     text
);

-- 2) o último resumo de cada conversa
create table if not exists public.atd_resumos (
  conversa_id    uuid primary key references public.conversas(id) on delete cascade,
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  resumo         jsonb not null,
  provedor       text,
  mensagens      integer,
  gerado_em      timestamptz not null default now(),
  gerado_por     uuid,
  ate_msg_em     timestamptz
);
create index if not exists atd_resumos_org on public.atd_resumos (organizacao_id);

-- ninguém lê nem grava direto: só o servidor (função atd-ia, com a chave de serviço)
alter table public.atd_ia_chave enable row level security;
alter table public.atd_resumos enable row level security;
revoke all on table public.atd_ia_chave, public.atd_resumos from public, anon, authenticated;
grant all on table public.atd_ia_chave, public.atd_resumos to service_role;

-- 3) a transcrição do áudio: junta ao metadados (o resto fica) e só grava se ainda não houver uma.
--    Devolve true quando gravou. Só o servidor chama.
create or replace function public.atd_ia_gravar_transcricao(p_mensagem uuid, p_texto text, p_provedor text)
returns boolean
language sql
set search_path = public
as $$
  with feita as (
    update public.mensagens
       set metadados = coalesce(metadados, '{}'::jsonb) || jsonb_build_object(
             'transcricao', left(btrim(p_texto), 4000),
             'transcricao_origem', 'ia',
             'transcricao_provedor', p_provedor,
             'transcrita_em', now())
     where id = p_mensagem
       and tipo = 'audio'
       and coalesce(metadados->>'transcricao', '') = ''
       and length(btrim(coalesce(p_texto, ''))) > 0
    returning 1
  )
  select exists (select 1 from feita);
$$;
revoke all on function public.atd_ia_gravar_transcricao(uuid, text, text) from public, anon, authenticated;
grant execute on function public.atd_ia_gravar_transcricao(uuid, text, text) to service_role;
