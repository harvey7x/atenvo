-- CANAL PRESO — um canal pode "prender" a conversa.
--
-- Nasceu do chip do Murillo: o fluxo de crédito entrega o cliente pro chip de propósito
-- (cartão de contato no fim do funil) e, a partir dali, o atendimento é dele. Com a regra
-- antiga ("última entrada manda"), o mesmo cliente escrevendo depois no número OFICIAL
-- puxava a conversa de volta pro oficial — e dois atendentes respondiam a mesma pessoa.
-- Caso real (06/08/2026): cliente falou no chip 10:47:58 e no oficial 10:48:35; a conversa
-- voltou pro oficial em 37 segundos.
--
--   canais.prende_conversa   -> este canal prende a conversa quando o cliente fala nele
--   conversas.canal_preso_id -> a conversa está presa NESTE canal: entrada por outro número
--                               não move mais canal_id/ultimo_canal_id
--
-- Soltar (canal_preso_id volta a NULL) é sempre um ato humano deliberado: atendente envia
-- pelo painel por outro canal, ou alguém do time responde pelo celular de outro número.
-- Bot/cron NÃO soltam — senão um nudge automático no oficial roubaria a conversa do chip.

alter table canais    add column if not exists prende_conversa boolean not null default false;
alter table conversas add column if not exists canal_preso_id  uuid references canais(id) on delete set null;
alter table conversas add column if not exists canal_preso_em  timestamptz;

create index if not exists idx_conversas_canal_preso on conversas (canal_preso_id) where canal_preso_id is not null;

comment on column canais.prende_conversa is
  'Quando o cliente fala neste canal, a conversa fica presa nele (entrada por outro número não rouba o atendimento).';
comment on column conversas.canal_preso_id is
  'Canal que prendeu esta conversa. NULL = regra normal (última entrada manda).';

-- MURILLO CHIP (555191035329) é hoje o único canal de handoff humano do fluxo de crédito.
update canais
   set prende_conversa = true
 where numero_conectado = '555191035329'
   and coalesce(ativo, false);

-- Backfill: conversa cujo atendimento JÁ está num canal que prende nasce presa — é o mesmo
-- estado que uma entrada nova naquele canal produziria.
update conversas c
   set canal_preso_id = c.canal_id,
       canal_preso_em = coalesce(c.ultima_msg_canal_em, c.ultima_interacao_em, now())
  from canais k
 where k.id = c.canal_id
   and k.prende_conversa
   and c.canal_preso_id is null;
