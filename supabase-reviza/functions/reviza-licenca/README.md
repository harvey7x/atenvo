# reviza-licenca — mensalidade da plataforma (Pix / PushinPay)

A fatura do mês nasce no dia 1º (cron), vence dia 5 e bloqueia às 14h BRT — quem
decide aviso/bloqueio é a RPC `licenca_estado`; esta function só CRIA a fatura e dá
a BAIXA. Fail-open: sem `sistema_licenca.ativo`, sem token ou sem fatura aberta do
mês, nada é cobrado nem bloqueado.

## Deploy (fora do escopo desta pasta — passos para quem publicar)

- **verify_jwt = false** (as três portas têm gate próprio; regra do projeto para
  functions "secret-gated").
- **Secrets** (painel → Edge Functions → Secrets; nunca no git):
  - `MOTOR_SECRET` — o MESMO do reviza-wa-motor (header `x-motor-secret` do cron);
  - `PUSHINPAY_TOKEN` — token Bearer da conta PushinPay;
  - `PUSHINPAY_SANDBOX=sim` (opcional) — usa `api-sandbox.pushinpay.com.br`.
- **Cron** (pg_cron + pg_net, como o motor): 1x/dia basta, mas é idempotente —
  de hora em hora dá retry natural se a PushinPay estiver fora no dia 1º e também
  serve de rede de segurança para webhook perdido.
  `POST .../functions/v1/reviza-licenca?acao=cron` com header `x-motor-secret`.

## Ações (`?acao=`)

| ação | porta | o que faz |
| --- | --- | --- |
| `cron` | `x-motor-secret` | cria o Pix (`POST /pix/cashIn`) e INSERE a fatura do mês se não existir; se existe aberta, reconsulta e baixa se paga. Falha → `200 {ok:false}` (nunca derruba o cron). |
| `webhook` | PushinPay chama | NUNCA confia no corpo: extrai só o `id`, exige fatura ABERTA com aquele `pix_id` e RECONSULTA `GET /transactions/{id}` com o nosso token antes de baixar. Idempotente. |
| `verificar` | JWT de usuário ATIVO | botão "Já paguei": reconsulta a fatura aberta e devolve o estado novo (mesma forma da RPC `licenca_estado`, + `ok/pagou/pendencia`). |

Pago com valor MENOR que a fatura NÃO baixa — vira `pendencia` no retorno de
`verificar`. Valor mínimo do cashIn na PushinPay: 50 centavos.

API conferida em doc.pushinpay.com.br (base `https://api.pushinpay.com.br/api`,
Bearer token; webhook manda `{id, value, status, end_to_end_id, …}`).
