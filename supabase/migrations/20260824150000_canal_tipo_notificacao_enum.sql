-- Tipo de canal 'notificacao' (2026-08-24): o NOTIFICADOR (número pessoal do dono) não
-- pode aparecer no "Responder por" do WhatsApp — o front lista tipo='whatsapp', então
-- tirar o canal desse tipo o esconde SEM deploy do front (que está com trabalho parado
-- não-deployável). Webhook/envio de relatórios resolvem por instância/id — não usam tipo.
--
-- ADD VALUE não pode ser USADO na mesma transação em que nasce → o UPDATE do canal vive
-- na migration seguinte (20260824151000).

alter type public.canal_tipo add value if not exists 'notificacao';
