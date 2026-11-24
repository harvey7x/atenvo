#!/usr/bin/env bash
# Aplica NO SERVIDOR DE PRODUÇÃO do Reviza o "receber de outros sistemas" (URA reversa / Telein): migration 94 numa
# transação + a função entrada-webhook (sem exigir login: a prova é a chave do endereço). Preparado em 24/11.
#   bash supabase-reviza/aplicar-receber.sh confirmo
# Aditivo e inerte até o administrador criar um endereço na tela.
set -euo pipefail
[ "${1:-}" = "confirmo" ] || { echo "Não rodei nada. Para aplicar na produção: bash $0 confirmo"; exit 1; }
REF=ftexrtyswpdcndbkjbtf
AQUI="$(cd "$(dirname "$0")" && pwd)"
TMP="$(mktemp -d)"
{ echo 'begin;'; cat "$AQUI/migrations/20261124_94_receber_de_outros_sistemas.sql"; echo; echo 'commit;'; } > "$TMP/94.sql"
echo "» 1/2 banco: migration 94"
python3 - "$REF" "$TMP/94.sql" <<'PY'
import base64, json, subprocess, sys, urllib.request
ref, arq = sys.argv[1], sys.argv[2]
t = subprocess.run(['security', 'find-generic-password', '-s', 'Supabase CLI', '-w'], capture_output=True, text=True).stdout.strip()
if t.startswith('go-keyring-base64:'): t = base64.b64decode(t.split(':', 1)[1]).decode().strip()
req = urllib.request.Request(f'https://api.supabase.com/v1/projects/{ref}/database/query', method='POST', data=json.dumps({'query': open(arq, encoding='utf-8').read()}).encode(),
    headers={'Authorization': 'Bearer ' + t, 'Content-Type': 'application/json', 'User-Agent': 'supabase-cli'})
try:
    urllib.request.urlopen(req, timeout=300).read(); print('  ok migration 94')
except urllib.error.HTTPError as e:
    print('  FALHOU', e.code, e.read().decode()[:600]); sys.exit(1)
PY
echo "» 2/2 função entrada-webhook"
mkdir -p "$TMP/supabase/functions" && cp -R "$AQUI/functions/entrada-webhook" "$TMP/supabase/functions/entrada-webhook"
cd "$TMP" && supabase functions deploy entrada-webhook --project-ref "$REF" --use-api --no-verify-jwt
echo "✓ pronto. Configurações › Integrações › Receber de outros sistemas › Novo endereço."
