-- ============================================================
-- MODO COBRANÇA — cadência configurável por mensagem (29/08).
-- Espec original do dono: "mensagem antes da cobrança, mensagem
-- depois, tudo configurável". offset_dias/hora NULOS caem no padrão
-- por tipo (antes -3 · cobranca 0 · depois +2 · remarketing +7, 9h).
-- A régua fina por passos (cobranca_regua_passos) segue reservada
-- p/ multi-réguas por ciclo; a cadência simples vive na mensagem.
-- ============================================================
alter table public.cobranca_mensagens
  add column if not exists offset_dias int,
  add column if not exists hora time;
comment on column public.cobranca_mensagens.offset_dias is
  'dias relativos ao vencimento (negativo=antes, 0=no dia, positivo=depois); null = padrão do tipo';
comment on column public.cobranca_mensagens.hora is
  'horário BRT do disparo; null = 09:00';
