#!/usr/bin/env bash
# Aplica NO SERVIDOR DE PRODUÇÃO do Reviza as três partes de 25/11 que são só banco: Ao vivo (98), Tarefas (101) e
# Chat da equipe (102). Cada migration numa transação própria: se uma falhar, ela não fica pela metade e o script para.
# SÓ COM O "OK" DO DONO PARA ESTA AÇÃO:   bash supabase-reviza/aplicar-25-11-banco.sh confirmo
set -euo pipefail
[ "${1:-}" = "confirmo" ] || { echo "Não rodei nada. Para aplicar na produção: bash $0 confirmo"; exit 1; }
REF=ftexrtyswpdcndbkjbtf
AQUI="$(cd "$(dirname "$0")" && pwd)"
TMP="$(mktemp -d)"
for m in 20261125_98_ao_vivo 20261125_101_tarefas 20261125_102_chat_equipe; do
  { echo 'begin;'; cat "$AQUI/migrations/$m.sql"; echo; echo 'commit;'; } > "$TMP/$m.sql"
  python3 - "$REF" "$TMP/$m.sql" <<'PY'
import base64, json, subprocess, sys, urllib.request
ref, arq = sys.argv[1], sys.argv[2]
t = subprocess.run(['security', 'find-generic-password', '-s', 'Supabase CLI', '-w'], capture_output=True, text=True).stdout.strip()
if t.startswith('go-keyring-base64:'): t = base64.b64decode(t.split(':', 1)[1]).decode().strip()
req = urllib.request.Request(f'https://api.supabase.com/v1/projects/{ref}/database/query', method='POST', data=json.dumps({'query': open(arq, encoding='utf-8').read()}).encode(),
    headers={'Authorization': 'Bearer ' + t, 'Content-Type': 'application/json', 'User-Agent': 'supabase-cli'})
try:
    urllib.request.urlopen(req, timeout=600).read(); print('  ok', arq.split('/')[-1])
except urllib.error.HTTPError as e:
    print('  FALHOU', arq.split('/')[-1], e.code, e.read().decode()[:600]); sys.exit(1)
PY
done
echo "✓ Ao vivo, Tarefas e Chat da equipe no servidor. Falta: subir o pacote com 'ao-vivo', 'tarefas' e 'chat-equipe' ligados."
