-- 118 · AS MENSAGENS DO SISTEMA ANTERIOR: ÁREA DE CHEGADA (26/11, dono: "as mensagens também, tudo"). A API oficial da Guimoo
-- (chave criada pelo dono em Automações › Integrações › API da Guimoo, guardada no chaveiro do Mac) entrega os contatos e a
-- conversa mais recente de cada um. O baixador (~/reviza-sist/tools/guimoo_mensagens.py) põe tudo aqui, devagar (o limite de
-- lá é 60 por minuto e 10 mil por dia para a conta inteira). Daqui a 119 cria as conversas e as mensagens no Atendimento.
-- Só leitura lá: nada é marcado como lido e nada é enviado. Mídia: lá só vem o tipo (foto, áudio…), sem o arquivo. ADITIVA.

create table if not exists private.atd_guimoo_contatos (
  guimoo_id      text primary key,
  nome           text,
  telefone       text,
  email          text,
  etiquetas      text[] not null default '{}',
  funil          text,
  etapa          text,
  msgs_total     int,                                   -- quantas a API disse que a conversa tem
  msgs_baixadas  int not null default 0,
  buscado_em     timestamptz,                           -- quando as mensagens deste contato vieram (null = falta)
  erro           text,
  lido_em        timestamptz not null default now()
);
create index if not exists atd_guimoo_contatos_falta_idx on private.atd_guimoo_contatos (buscado_em nulls first);

create table if not exists private.atd_guimoo_msgs (
  contato_guimoo_id text not null,
  guimoo_id         text not null,
  de                text,                               -- 'contato' (o cliente) ou 'conta' (a empresa)
  tipo              text,                               -- texto, audio, imagem, documento, video, outro…
  texto             text,
  em                timestamptz,
  status            text,
  apagada           boolean,
  editada           boolean,
  mensagem_id       uuid,                               -- a mensagem criada aqui (119)
  lido_em           timestamptz not null default now(),
  primary key (contato_guimoo_id, guimoo_id)
);
create index if not exists atd_guimoo_msgs_em_idx on private.atd_guimoo_msgs (contato_guimoo_id, em);

revoke all on private.atd_guimoo_contatos, private.atd_guimoo_msgs from public, anon, authenticated;

-- DESFAZER: drop table if exists private.atd_guimoo_msgs, private.atd_guimoo_contatos;
