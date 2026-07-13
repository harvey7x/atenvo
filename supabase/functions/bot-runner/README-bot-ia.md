# Bot Matheo com IA — Parte 1 (conversacional)

Entrega **aditiva** e **inerte por padrão**. Nada vai ao cliente sem você mandar:
`dry_run=true` continua o default, master global (`bot_config.ativo`) segue **OFF**, e o
bot-runner **não está plugado no webhook**. Esta parte só entrega o cérebro conversacional.

## O que mudou (Tarefas 1–4)

| Arquivo | Papel |
|---|---|
| `ia.ts` | Gemini (`gemini-2.5-flash`) + Claude (`claude-sonnet-4-6`), `comRetry`, `pareceDificil`, `gerarResposta` (fallback **cruzado**), `transcreverAudio`, `parseEstado`. |
| `guardrail.ts` | **Trava de código** `saidaSuja()` — barra valor/percentual/prazo/garantia/senha/escassez. |
| `prompt.ts` | `SYSTEM_MATHEO` + adendo `<estado>` (o produto). |
| `index.ts` | Plano A = IA; se cair/desligada, **plano B = copy determinístico** (`fluxo.ts`, intacto). Áudio → transcreve; guardrail em toda saída; parse `<estado>` → merge; balões → outbox; roteia desfecho no Kanban. |
| `fluxo.ts` | Mantido como **rede de segurança** (não reescrito). |
| migration `20260712120000_bot_etapa_ia.sql` | Adiciona a etapa `ia` à CHECK de `bot_conversa_estado.etapa` (aditivo). |

### Como o fluxo por IA se comporta
1. Guardas atuais **intactos** (secret, lock, idempotência, `precisa_humano`, `bot_pode_atuar`, pausa por humano/áudio).
2. **Áudio:** se o body trouxer `inbound_audio_b64`, transcreve (Gemini) e segue como texto. Sem base64 ou falha → comportamento atual (1 aviso + pausa pro humano).
3. **Geração:** monta histórico das últimas ~20 msgs, roteia Claude (difícil) / Gemini (simples), com fallback cruzado + retry.
4. **Guardrail:** saída suja → regenera 1× com reforço → ainda suja → **descarta** e usa o copy determinístico. Toda violação vai pro `audit_log` (`acao='bot_guardrail'`).
5. **Estado:** parseia `<estado>{...}</estado>`, remove o bloco, faz merge em `dados_qualificacao` (etapa fica `ia`). CPF vai **completo** só pra `contatos.cpf` (via `bot_registrar_cpf`) e **mascarado** no estado/nota.
6. **Kanban no fecho:** `escritorio`→**PRESENCIAL**, `reuniao`→**REUNIÃO MARCADA**, `atendente`→**LEAD NOVO** + `precisa_humano=true`. Banco→`instituicao`, financeiras→`etiquetas`.
7. **Se a IA cair** (quota/crédito/timeout) → cai no `decideProximo()` determinístico. O bot fica mais burro, mas **vivo**.

## Secrets a configurar (Edge Function `bot-runner`)
Só **secrets**, nunca em código:
- `GEMINI_API_KEY`
- `ANTHROPIC_API_KEY`
- `CLAUDE_ATIVO` (opcional, default `sim`) — `nao` roda só no Gemini (economia / sem crédito).
- `IA_ATIVA` (opcional, default `sim`) — `nao` volta ao fluxo 100% determinístico.
- (já existentes: `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `SUPABASE_*`.)

```
supabase secrets set GEMINI_API_KEY=... ANTHROPIC_API_KEY=... --project-ref afmzuoavvnpfossiiypz
supabase functions deploy bot-runner --project-ref afmzuoavvnpfossiiypz --use-api --no-verify-jwt
```

## Como testar em `dry_run` (não envia nada)
O runner é secret-gated (`x-bot-secret` == `webhook_config.secret` da chave `bot_runner`). Com **master OFF**, use `force=true` para exercitar a máquina sem envio:

```bash
curl -s https://afmzuoavvnpfossiiypz.functions.supabase.co/bot-runner \
  -H "x-bot-secret: <secret da chave bot_runner>" -H "content-type: application/json" \
  -d '{"conversa_id":"<uuid>","inbound_text":"quero recuperar meu dinheiro","dry_run":true,"force":true}'
```
- `dry_run:true` → o outbox grava `simulada`, a Evolution **não** é chamada.
- A resposta mostra `mensagens` (o que iria pro cliente), `etapa_nova`, `desfecho`, `lead_quente_motivos`.
- Guardrail: se a IA escorregar, veja `audit_log acao='bot_guardrail'`.
- Áudio: adicione `"inbound_tipo":"audio","inbound_audio_b64":"<base64 ogg>"` p/ testar a transcrição.

## Roteiro de ligação (quando decidir ir ao ar — NÃO agora)
1. **dry_run** por dias, lendo o outbox `simulada` e o `audit_log` (guardrail/decisões).
2. **1 canal** primeiro (LUIZA ou ANDRIUS), `dry_run=false` **manual**, acompanhando cada envio.
3. Só então plugar no webhook + ligar o master (`bot_config.ativo=true`) — isso é decisão separada e **não** está nesta entrega.

## O que NÃO está aqui (Parte 2)
Remarketing (coluna `REMARKETING`, tabela `bot_remarketing`, edge `bot-remarketing` + cron, `SYSTEM_REMARKETING`, update mínimo no `evolution-webhook`). Fica pra revisão à parte.

## Verificação
- `deno check supabase/functions/bot-runner/index.ts` → limpo.
- `vitest` → guardrail + parse `<estado>` + roteador cobertos (339/339 no total).
- Nada tocado: master OFF, dry_run default, webhook não plugado, `evolution-send`/`meta-*`/health/cobranças intactos.
