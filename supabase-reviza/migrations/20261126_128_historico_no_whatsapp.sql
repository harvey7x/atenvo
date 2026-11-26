-- 128 · AS CONVERSAS DE LÁ JÁ APARECEM NA ABA WHATSAPP (26/11, dono: "as mensagens não pode aparecer ali na aba whatsapp?").
-- A lista do WhatsApp mostra só conversa que tem número. Antes de a Reviza conectar os números, as conversas que vieram do
-- sistema anterior ficam num número de HISTÓRICO, só para leitura: "Histórico (sistema anterior)". Ele é um número
-- "removido" (o mesmo jeito de sempre de guardar o histórico de um número que saiu): não aparece em Integrações nem no
-- "Responder por", não conta no limite de WhatsApp, não tem verificação de saúde nem alerta. Quando a Reviza conectar os
-- números, Configurações › Importação passa as conversas de cada conexão de lá para o número escolhido (122), e as que
-- chegarem depois (119) já vão para lá. Nada é enviado. Depende da 119 e da 122.

insert into public.canais (organizacao_id, tipo, nome_interno, identificador, ativo, status_integracao, envio_restrito, envio_restrito_motivo,
                           envio_restrito_em, health_check_enabled, alerta_silenciado, alerta_silenciado_motivo, observacao_comercial)
select 'a1fa0000-0000-4000-8000-000000000001', 'whatsapp', 'Histórico (sistema anterior)', 'historico-sistema-anterior', false, 'removido', true,
       'Histórico do sistema anterior: só leitura. Responda por um número conectado.', now(), false, true, 'histórico importado',
       'Conversas importadas do sistema que a Reviza usava antes. Não conectar: escolha o número em Configurações › Importação.'
 where not exists (select 1 from public.canais where organizacao_id = 'a1fa0000-0000-4000-8000-000000000001' and identificador = 'historico-sistema-anterior');

-- cada conexão de lá aponta para o histórico até alguém escolher o número (o que já foi escolhido fica)
insert into private.atd_guimoo_conexao_canal (conexao, canal_id)
select distinct private.atd_guimoo_conexao_do_contato(g.contato_id), private.atd_guimoo_canal_historico()
  from private.atd_guimoo_contatos g where g.contato_id is not null
union
select distinct coalesce(nullif(btrim(k.conexao), ''), ''), private.atd_guimoo_canal_historico() from private.atd_guimoo_kanban k
on conflict (conexao) do nothing;

-- as conversas de lá que ainda estão sem número vão para o histórico (e passam a aparecer no WhatsApp)
update public.conversas cv
   set canal_id = private.atd_guimoo_canal_historico(),
       canal_origem_id = coalesce(cv.canal_origem_id, private.atd_guimoo_canal_historico()),
       ultimo_canal_id = coalesce(cv.ultimo_canal_id, private.atd_guimoo_canal_historico())
 where cv.canal_id is null and cv.id in (select conversa_id from private.atd_guimoo_contatos where conversa_id is not null);

-- DESFAZER: update public.conversas set canal_id = null where canal_id = private.atd_guimoo_canal_historico();
--   delete from private.atd_guimoo_conexao_canal where canal_id = private.atd_guimoo_canal_historico();
--   delete from public.canais where identificador = 'historico-sistema-anterior';
