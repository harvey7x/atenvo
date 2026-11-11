# Reviza — mensageria WhatsApp (Evolution API)

Funções de borda que ligam a Reviza a uma instância Evolution isolada.
O servidor Evolution é o mesmo do CAF (`atenvo-evoapi`), mas a instância é
`reviza_<canalid>` e o webhook aponta pro Supabase da Reviza — dados 100% isolados.

## Secrets necessários (projeto reviza-cobrancas)
```bash
supabase secrets set \
  EVOLUTION_API_URL="https://atenvo-evoapi.squareweb.app" \
  EVOLUTION_API_KEY="<apikey global da Evolution>" \
  WA_WEBHOOK_SECRET="<gerar um aleatório forte>" \
  --project-ref ftexrtyswpdcndbkjbtf
```
`SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` já são injetados
pelo próprio Supabase.

## Deploy
```bash
# webhook é chamado pela Evolution (sem JWT) → --no-verify-jwt
supabase functions deploy reviza-wa-webhook  --no-verify-jwt --project-ref ftexrtyswpdcndbkjbtf
# instância e envio exigem usuário logado → verify_jwt padrão (true)
supabase functions deploy reviza-wa-instancia --project-ref ftexrtyswpdcndbkjbtf
supabase functions deploy reviza-wa-enviar    --project-ref ftexrtyswpdcndbkjbtf
```

## Pré-requisito no banco
Aplicar antes a migration `20260910_11_wa_mensageria.sql`
(via MCP como `reviza_11_wa_mensageria`).

## Fluxo de conexão
1. Admin/gestor → tela **Números** → "Conectar" → `reviza-wa-instancia {acao:'create'}`
   cria a instância + devolve o QR.
2. Usuário escaneia no celular do número dedicado da Reviza.
3. Evolution dispara `connection.update=open` → `reviza-wa-webhook` grava
   `estado='conectado'` + o número. A tela faz *polling* de `{acao:'status'}`.
4. Mensagens recebidas caem no webhook (`messages.upsert`, só texto no v1).

## Escopo v1 (o que falta = Fase 2)
- Só **texto** (mídia/áudio/imagem não são ingeridos ainda).
- **Grupos** e contatos **@lid** (identidade protegida) são ignorados.
- Régua automática e disparo em massa têm as **tabelas** prontas
  (`wa_regua_regras`, `wa_envios`, `wa_envio_alvos`), mas o **motor** (cron que
  dispara) ainda não foi escrito.
