-- Reviza — chat de verdade, parte 2 (12/09): responder com citação, "digitando…"
-- em tempo real e apagar mensagem pra todos.
alter table public.wa_mensagens add column if not exists resposta_a uuid references public.wa_mensagens(id) on delete set null;
alter table public.wa_mensagens add column if not exists apagada boolean not null default false;
alter table public.wa_conversas add column if not exists digitando_ate timestamptz;
create index if not exists wa_msgs_resposta_idx on public.wa_mensagens(resposta_a) where resposta_a is not null;
