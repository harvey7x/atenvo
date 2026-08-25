-- fichas_judiciais e blindada de proposito: service_role NAO tem privilegios na
-- tabela (nem backend le a ficha inteira — senhas). A edge function enviar-planilha
-- quebrava com "permission denied for table fichas_judiciais" na validacao multi-tenant.
-- Grants POR COLUNA dao so o minimo do carimbo, mantendo a blindagem:
--   leitura: id/organizacao_id/oportunidade_id (validar org e achar a opp)
--   escrita: senha_inss/planilha_enviada_em/planilha_linha (o carimbo do envio)
-- service_role segue SEM acesso a senha ja gravada, textos da ficha, CPF etc.
grant select (id, organizacao_id, oportunidade_id) on public.fichas_judiciais to service_role;
grant update (senha_inss, planilha_enviada_em, planilha_linha) on public.fichas_judiciais to service_role;
