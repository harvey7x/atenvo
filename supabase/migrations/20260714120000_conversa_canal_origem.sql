-- Conversa única por contato — ETAPA 1 (aditiva, sem quebrar nada).
--
-- CONTEXTO: conversas.canal_id passa a significar CANAL ATUAL DO ATENDIMENTO (decisão de produto).
-- Como ele passará a MUDAR quando o cliente for atendido por outro número (ANDRIUS -> URA -> LUIZA),
-- o canal de AQUISIÇÃO precisa ser preservado ANTES da mudança de semântica — senão a atribuição
-- de origem some. Esta migration roda ANTES do deploy do webhook v27.
--
-- NÃO altera comportamento: só cria a coluna e congela o valor atual como origem.

alter table public.conversas
  add column if not exists canal_origem_id uuid references public.canais(id) on delete set null;

comment on column public.conversas.canal_origem_id is
  'Canal de AQUISIÇÃO (imutável, snapshot da criação da conversa). conversas.canal_id é o CANAL ATUAL do atendimento e muda quando o cliente é atendido por outro número.';
comment on column public.conversas.canal_id is
  'CANAL ATUAL do atendimento (responder por / card / continuidade). Para origem/aquisição use canal_origem_id.';

-- Backfill: hoje canal_id ainda É o canal de origem (nunca mutou). Congela.
update public.conversas
   set canal_origem_id = canal_id
 where canal_origem_id is null
   and canal_id is not null;

create index if not exists conversas_canal_origem_idx on public.conversas (canal_origem_id);
