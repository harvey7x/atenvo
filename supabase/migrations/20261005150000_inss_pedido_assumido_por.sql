-- Coletor INSS: dono do atendimento (05/10/2026, achado da revisão adversarial).
--
-- Com a extensão no Chrome de cada atendente, DOIS coletores podem tentar
-- assumir o mesmo pedido (a extensão de um atendente e o painel do Mac, ou duas
-- extensões). O "assumir" era idempotente por status — ok para reenvio do mesmo
-- coletor, mas mascarava o conflito entre coletores diferentes: os dois
-- trabalhavam no mesmo pedido e um sobrescrevia os PDFs do outro (upsert por
-- caminho). Agora cada assumir grava QUEM assumiu, e a edge function só aceita
-- o idempotente quando é o mesmo coletor.

alter table public.inss_pedidos add column assumido_por text;
