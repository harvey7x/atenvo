# Testes da Inbox WhatsApp

Testes de **integração real** (Playwright headless) — exercitam o app + Supabase + canal
Evolution conectado. Não há mock: o envio usa a Edge Function `evolution-send` e o status
real vem do webhook `evolution-webhook`.

## Por que integração (e não unitário)
O ponto crítico do módulo é o ciclo real de envio/entrega (frontend → `evolution-send` →
Evolution → `key.id` → persistência → webhook `messages.update`). Só um teste de ponta a
ponta prova que "HTTP 200 ≠ entregue" e que o status reflete a realidade.

## Segurança
- Envia **somente** para a conversa de homologação `Contato de Teste Atenvo`
  (número controlado pela equipe). Nunca dispara para clientes.
- Credenciais vêm de variáveis de ambiente — nunca commitadas.

## Como rodar
```bash
# 1) suba o preview do build:  npm run build && npm run preview   (porta 4173)
# 2) exporte as credenciais de um usuário da organização:
export ATENVO_TEST_EMAIL="..."   ATENVO_TEST_PASSWORD="..."
export BASE="http://localhost:4173"     # ou https://atenvo.pages.dev
node tests/whatsapp/inbox.integration.mjs
```

## Cobertura
- ações decorativas removidas (composer só Scripts + Enviar);
- busca e **estado vazio**;
- abrir conversa;
- **envio manual de texto** + status real (`✓ enviada` / `✓✓ entregue`);
- **anti-duplicidade** (duplo-clique não cria duas mensagens);
- viewport menor (drawer do painel) sem quebrar layout.

## Verificações complementares (manuais/SQL, descritas no PR)
- **Ver erro + retry sem duplicar:** injeta-se uma mensagem `status='falhou'` na conversa de
  homologação; a UI mostra `Ver erro` (diálogo próprio, motivo sanitizado) e
  `Tentar novamente`, que reaproveita a MESMA linha via `retry_mensagem_id` (1 linha, sem dup).
- **Guardas do backend** (`evolution-send`): usuário fora da organização → 403; canal
  desconectado → 409; sem credencial Evolution → 503; destinatário sem WhatsApp → 422;
  sem `key.id` → mensagem marcada `falhou` (nunca "enviada" só por HTTP 2xx).
