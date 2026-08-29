-- payload jsonb na fila: bolhas renderizadas no enfileiramento
-- [{tipo,corpo,midia_url,midia_nome}] — snapshot imutável do que sai
-- (o envio real manda exatamente o que foi auditado na simulação).
alter table public.cobranca_fila add column if not exists payload jsonb;
comment on column public.cobranca_fila.payload is 'bolhas renderizadas no enfileiramento [{tipo,corpo,midia_url,midia_nome}] — snapshot imutável do que sai';
