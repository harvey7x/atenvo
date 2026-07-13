-- Bot de atendimento — modo IA (Parte 1). ADITIVO e seguro.
-- Adiciona a etapa 'ia' à CHECK de bot_conversa_estado.etapa. Nada é removido:
-- as etapas granulares (fallback determinístico) e concluido/pausado_* continuam válidas.
-- A conversa conduzida por IA fica em etapa='ia' e o estado real vive em dados_qualificacao (jsonb).
-- Não liga master, não pluga webhook, não muda dry_run.

alter table public.bot_conversa_estado drop constraint if exists bot_conversa_estado_etapa_check;
alter table public.bot_conversa_estado add constraint bot_conversa_estado_etapa_check
  check (etapa in (
    'inicio','aguardando_beneficio','aguardando_agibank_bmg','aguardando_banco',
    'aguardando_nome','aguardando_cpf','aguardando_preferencia',
    'ia',                                   -- NOVO: fluxo conduzido por IA
    'concluido','pausado_humano','pausado_audio'
  ));

notify pgrst, 'reload schema';
