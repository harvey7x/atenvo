# Bot de Remarketing — Parte 2 (reengajamento por IA)

Cadência automática de reengajamento pra leads que esfriaram, movidos pra coluna **REMARKETING**
do Kanban. **Inerte por default**: sincroniza a fila, mas **não envia nada** até você ligar os
dois interruptores (abaixo). Mesmo padrão de segurança do bot-runner.

## Como funciona
1. **Entrada na fila:** quando uma opp cai na coluna **REMARKETING**, o worker cria uma linha em
   `bot_remarketing` (cadência começa; 1º toque em D+1).
2. **Cadência:** 5 toques em **D+1, D+3, D+6, D+10, D+15** (offset desde a entrada na coluna), um
   **ângulo diferente por toque** (lembrete → credibilidade → dor real → facilidade → porta aberta).
   No máximo **1 toque por opp por dia** (fim de semana acumulado não dispara em sequência).
3. **Janela:** só **seg–sáb, 09:00–18:00 America/Sao_Paulo** (nunca domingo). Fora disso, o tick é no-op.
4. **Teto diário:** `REMARKETING_TETO_DIA` (default **20** — conservador, pois o número é
   compartilhado com o bot de atendimento; subir só quando o chip tiver histórico).
5. **IA por toque:** Claude→Gemini (fallback cruzado), **mesmo `guardrail.ts`** em toda saída; se a
   IA cair ou o guardrail barrar 2×, usa o **copy fixo** daquele ângulo (nunca morre, nunca manda
   valor/percentual/prazo/promessa/senha).
6. **Saída da fila (sync):** se o time move a opp pra qualquer outra coluna, a linha vira `cancelado`.
7. **Anti-race no envio:** logo antes de cada disparo (depois da IA), o worker relê a coluna FRESCA
   do banco (`bot_remarketing_checar_envio`, query nova + `FOR UPDATE`). Se a opp saiu de REMARKETING
   entre o tick e o disparo, **cancela e não envia** (blinda o cliente que acabou de fechar).

## Lead que responde durante o remarketing (via evolution-webhook v26)
Antes do dispatch ao bot-runner, o webhook chama `bot_remarketing_inbound(conversa, texto)`:
- **respondeu** (mensagem normal) → status `respondeu` + opp volta pra **LEAD NOVO** (entrada), pro
  runner poder reatender (`bot_pode_atuar` exige opp na entrada). O dispatch segue.
- **opt-out** (`sair/parar/pare/não quero/descadastrar/cancelar inscrição/remover/stop`) → status
  `optout` + opp pra **PERDIDO** + o webhook **pula** o dispatch.
- **lead comum** (nunca esteve em remarketing) → `sem_remarketing`, **nada é tocado**, atendido normal.
  Opt-out só vale pra quem já está numa cadência — "quero parar esses descontos" de lead novo NÃO
  trava o atendimento dele.

## Componentes
| Peça | Onde |
|---|---|
| Coluna `REMARKETING` (ordem 8, neutro, não-entrada) | migration `20260713120000` |
| Tabela `bot_remarketing` + RLS (`is_member`) + índices | migration `20260713120000` |
| RPCs `bot_remarketing_sync/due/checar_envio/registrar_toque/inbound` | `20260713120000` (+fixes `130000/150000/160000`) |
| Helper de janela `bot_rmkt_snap` | `20260713120000` |
| Secret `bot_remarketing` (webhook_config) | `20260713120000` |
| Worker `bot-remarketing` (edge) | `supabase/functions/bot-remarketing/index.ts` |
| Conteúdo (system + 5 ângulos + fallbacks) | `supabase/functions/bot-runner/remarketing.ts` |
| Cron `*/10` | migration `20260713140000` (`cron.schedule`) |
| Hook no webhook (1 chamada RPC antes do dispatch) | `evolution-webhook` v26 |

## Secrets / envs (edge `bot-remarketing`)
- `REMARKETING_ATIVO` (default `nao`) — `sim` habilita envio. Com `nao`, só sincroniza.
- `REMARKETING_TETO_DIA` (default `20`) — teto de toques por dia.
- Reusa os secrets do bot-runner (mesmo projeto): `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`,
  `CLAUDE_ATIVO`, `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `SUPABASE_*`.
- Gate: `x-bot-secret` == `webhook_config.secret` da chave `bot_remarketing`.

## Testar em dry_run (não envia)
```bash
curl -s https://afmzuoavvnpfossiiypz.functions.supabase.co/bot-remarketing \
  -H "x-bot-secret: <secret da chave bot_remarketing>" -H "content-type: application/json" \
  -d '{"dry_run":true,"force":true}'
```
- `force:true` fura a janela e o master OFF (só p/ exercitar); **nunca envia** se `REMARKETING_ATIVO=nao`.
- A resposta traz `sync {entrou,cancelou}`, `processados`, `enviados`, e `resultados[]` com o texto
  simulado de cada toque.

## Ligar de verdade (DUAS chaves, decisão separada — NÃO está ligado)
São **dois** interruptores independentes, de propósito:
1. `supabase secrets set REMARKETING_ATIVO=sim` (+ deploy) — tira o master OFF.
2. O cron manda `body:'{}'` → `dry_run=true` **fixo**. Pra enviar de verdade, edite o job pra mandar
   `{"dry_run":false}` (ou dispare manualmente com `dry_run:false`). Enquanto o cron mandar `{}`,
   mesmo com `REMARKETING_ATIVO=sim`, ele só simula.

Roteiro sugerido: dias em dry_run lendo `audit_log acao='bot_remarketing'` → 1 canal com
`dry_run:false` manual → só então trocar o body do cron.

## Ligar/desligar o cron
```sql
-- ligar:  select cron.schedule('bot-remarketing','*/10 * * * *', $$ ... $$);  (ver migration 20260713140000)
-- desligar: select cron.unschedule('bot-remarketing');
```

## Dívida técnica (NÃO corrigir agora)
- **`motivo_perda` do opt-out está como `'sem_interesse'`** por falta de valor melhor no CHECK
  `oportunidades_motivo_perda_chk` (`{sem_interesse, nao_respondeu, nao_elegivel, concorrente,
  dados_invalidos, outro}`). Quando mexer no funil, **adicionar `'opt_out'` ao CHECK** e apontar o
  opt-out do remarketing pra ele (em `bot_remarketing_inbound`) — pra separar "não quis o serviço"
  de "pediu pra parar de receber". Hoje os dois caem em `sem_interesse`.

## O que NÃO é tocado (inércia)
`REMARKETING_ATIVO=nao` + `dry_run=true` default; o cron só sincroniza; o hook do webhook só
re-roteia opp/status (não envia). `evolution-send`/`meta-*`/`wa-health`/cobranças/faturamento e o
bot-runner (master OFF) seguem intactos. Zero dependência nova.

## Verificação (2026-07-13)
- `deno check` no worker e no webhook: limpo. `vitest`: 342/342.
- RPCs validadas no banco: cadência D+1/3/6/10/15→concluído, janela SP, opt-out regex, anti-race.
- 3 cenários do lead-que-responde (respondeu→LEAD NOVO / opt-out→PERDIDO / lead comum→sem_remarketing): OK.
- Cron ativo `*/10` (secret por subquery), rodou 1× em dry_run: `entrou:0`, sem erro.
