# Reviza Cobranças — banco dedicado (registro das migrations)

Projeto Supabase SEPARADO do Atenvo: `reviza-cobrancas` (ref `ftexrtyswpdcndbkjbtf`, sa-east-1).
Estas migrations foram APLICADAS via MCP (apply_migration) — este diretório é o
REGISTRO versionado delas (regra P2: nunca aplicar sem gravar o .sql).

⚠️ NÃO é lido pelo supabase CLI deste repo (que está linkado ao projeto do Atenvo,
`afmzuoavvnpfossiiypz`). Jamais mover estes arquivos para supabase/migrations.

Ordem: 01→06. A chave de cifra vive no Vault do projeto (reviza_leads_pwd_key_v1)
e NUNCA entra no git nem no client.
