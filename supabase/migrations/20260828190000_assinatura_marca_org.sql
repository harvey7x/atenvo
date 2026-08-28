-- ASSINATURA OBRIGATÓRIA DE ATENDENTE (28/08): toda mensagem enviada por gente sai carimbada
-- `*👤 Nome | MARCA:*` na primeira linha (aplicado no backend, evolution-send). A MARCA é um nome
-- curto por organização — o nome cadastrado ("Central de Assessoria Financeira") é longo demais
-- para assinatura. Sem marca definida, o carimbo sai só com o nome do atendente.
alter table public.organizacoes add column if not exists assinatura_marca text;
comment on column public.organizacoes.assinatura_marca is
  'Nome curto usado na assinatura obrigatória de mensagens de atendente (ex.: CAF). Nulo = assina só o nome.';

-- Seed: as duas organizações em produção são operação CAF (empresa-demo = CAF original;
-- alfa = ambiente do programa alfa da própria CAF, hoje sem canais de WhatsApp).
-- Fase 2.0.1: 'caf' incluído — o slug da CAF foi renomeado empresa-demo→caf em prod;
-- sem ele, um replay local pós-rename viraria no-op silencioso. (Nota ao dono: a marca
-- 'CAF' na org alfa parte da premissa de que alfa é operação da própria CAF — conferir.)
update public.organizacoes set assinatura_marca = 'CAF'
 where slug in ('empresa-demo', 'caf', 'alfa') and assinatura_marca is null;
