# Testes da Inbox WhatsApp

Testes de **integração real** (Playwright headless) — exercitam o app + Supabase + canal
Evolution conectado. Não há mock: o envio usa a Edge Function `evolution-send` e o status
real vem do webhook `evolution-webhook`.

## ⚠️ Estado de execução (honesto)

A suíte `inbox.integration.mjs` **NÃO roda no estado padrão do repositório**: o Playwright
**não é dependência** do projeto, então o arquivo faz **`SKIP` e sai com código 0** quando o
pacote não está instalado. Ele só executa de fato depois de:

```bash
npm i -D playwright && npx playwright install chromium
```

Portanto a suíte commitada **não deve ser considerada "aprovada" automaticamente** — por
padrão ela é ignorada.

### O que foi REALMENTE executado de forma automatizada (26/06/2026)
Rodado via Playwright instalado **no ambiente de desenvolvimento** (não no repo), contra o
preview local e contra `https://atenvo.pages.dev`. Todos passaram:

- ações decorativas removidas (composer só Scripts + Enviar);
- botões Scripts e Enviar presentes;
- busca → **estado vazio** ("Nenhuma conversa nesta aba.");
- **funil real** (opções "Todos os números"/status, não `toast`);
- abrir a conversa de homologação;
- **envio manual de texto** + status real (`✓ enviada`);
- **anti-duplicidade** (duplo-clique no Enviar → 1 mensagem);
- **histórico persiste** após reload com status real;
- **light/dark** e **viewport menor** (drawer do painel) sem quebrar layout.

A suíte `inbox.integration.mjs` é exatamente essa lógica, parametrizada por env, para que
qualquer pessoa reproduza após instalar o Playwright.

### O que foi verificado de forma MANUAL / assistida por SQL
Não automatizado em CI; feito passo a passo com SQL + UI nesta entrega:

- **Ver erro + retry sem duplicar:** injetou-se uma mensagem `status='falhou'` na conversa de
  homologação (via SQL); a UI mostrou `Ver erro` (diálogo próprio, motivo sanitizado) e
  `Tentar novamente`, que reaproveitou a MESMA linha via `retry_mensagem_id` → confirmado no
  banco (1 linha, `erro_envio=null`, virou `enviada`).
- **Limpeza dos dados de teste:** contagens e verificação de inbox vazia por SQL.
- **Recebimento real:** mensagens reais de terceiros chegando à inbox via webhook.
- **Confirmação física no aparelho:** envio de texto recebido (confirmado pelo usuário).

### Guardas do backend (`evolution-send`) — implementadas, ainda NÃO exercitadas ao vivo
Cobertas por código, mas não há teste automatizado dedicado: usuário fora da organização → 403;
canal desconectado → 409; sem credencial Evolution → 503; destinatário sem WhatsApp → 422;
sem `key.id` → mensagem marcada `falhou` (nunca "enviada" só por HTTP 2xx).

## Segurança
- Envia **somente** para a conversa de homologação `Contato de Teste Atenvo`
  (número controlado pela equipe). Nunca dispara para clientes.
- Credenciais vêm de variáveis de ambiente — nunca commitadas.

## Como rodar
```bash
# 1) instale o Playwright (não é dependência do projeto):
npm i -D playwright && npx playwright install chromium
# 2) suba o preview do build:
npm run build && npm run preview            # porta 4173
# 3) exporte as credenciais de um usuário da organização e rode:
export ATENVO_TEST_EMAIL="..."  ATENVO_TEST_PASSWORD="..."  BASE="http://localhost:4173"
node tests/whatsapp/inbox.integration.mjs
```
