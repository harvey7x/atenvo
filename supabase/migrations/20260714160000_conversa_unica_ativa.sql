-- Proteção contra duplicidade ativa (aplicada APÓS o backfill de unificação: 0 duplicatas restantes).
-- Este index FALHA hoje: existem 24 contatos com conversa ativa duplicada. Ele só pode ser aplicado
-- DEPOIS do backfill (secundarizar_conversa) aprovado e executado. Mover para supabase/migrations
-- nesse momento.
--
-- PROTEÇÃO CONTRA CORRIDA (Parte 2): impede múltiplas conversas ATIVAS por contato.
--
-- Condição de "ATIVA" (confirmada com o produto):
--   status <> 'fechada'   E   arquivada_em IS NULL
--
-- Por que ASSIM:
--  * inclui 'arquivada_em is null' -> a conversa SECUNDARIZADA (arquivada, status ainda 'aberta')
--    NÃO conta como ativa. Sem isso, o index rejeitaria o par principal+secundária do backfill.
--  * exclui só 'fechada' -> o histórico (fechada/resolvida-arquivada) segue livre; nada de
--    passado é bloqueado. Não quebra histórico.
--  * escopo por contato_id basta (contato pertence a uma única organização).
--
-- Efeito: a corrida do webhook (dois inbounds simultâneos criando 2 conversas — caso "Cassia",
-- ambas criadas em 11:36:22) passa a falhar no INSERT do perdedor em vez de duplicar.
-- O webhook v27 já reusa por contato; o index é a rede de segurança do banco.

create unique index if not exists conversas_uma_ativa_por_contato
  on public.conversas (contato_id)
  where status <> 'fechada' and arquivada_em is null;

comment on index public.conversas_uma_ativa_por_contato is
  '1 atendimento ATIVO por contato (ativa = não fechada e não arquivada). Histórico fechado/arquivado é livre.';
