#!/usr/bin/env bash
# Aplica NO SERVIDOR DE PRODUÇÃO do Reviza, nesta ordem e cada uma numa transação só:
#   117  importação do Kanban da Guimoo (área de chegada, aplicar, painel, ligar responsáveis por nome)
# Preparado em 26/11 ("já pega todo o Kanban deles e integra no nosso… as mensagens também, tudo"). Para rodar:
#   bash supabase-reviza/aplicar-kanban-guimoo.sh confirmo
# Só cria peças novas (e põe um "quieto durante a importação" no gatilho dos avisos à equipe). Não envia nada a
# ninguém. Os dados vêm depois, com ~/reviza-sist/tools/guimoo_kanban.py (carregar → testar → aplicar confirmo).
# Depois: pacote com VITE_RECURSOS incluindo "importacao".
set -euo pipefail
[ "${1:-}" = "confirmo" ] || { echo "Não rodei nada. Para aplicar na produção: bash $0 confirmo"; exit 1; }
REF=ftexrtyswpdcndbkjbtf
AQUI="$(cd "$(dirname "$0")" && pwd)"
sql() { python3 - "$REF" "$1" <<'PY'
import base64, json, subprocess, sys, urllib.request
ref, arq = sys.argv[1], sys.argv[2]
t = subprocess.run(['security', 'find-generic-password', '-s', 'Supabase CLI', '-w'], capture_output=True, text=True).stdout.strip()
if t.startswith('go-keyring-base64:'): t = base64.b64decode(t.split(':', 1)[1]).decode().strip()
q = open(arq, encoding='utf-8').read()
req = urllib.request.Request(f'https://api.supabase.com/v1/projects/{ref}/database/query', method='POST', data=json.dumps({'query': q}).encode(),
    headers={'Authorization': 'Bearer ' + t, 'Content-Type': 'application/json', 'User-Agent': 'supabase-cli'})
try:
    urllib.request.urlopen(req, timeout=600).read(); print('  ok', arq.split('/')[-1])
except urllib.error.HTTPError as e:
    print('  FALHOU', arq.split('/')[-1], e.code, e.read().decode()[:600]); sys.exit(1)
PY
}
TMP="$(mktemp -d)"
for m in 117_importar_kanban_guimoo; do
  echo "» banco: migration $m (numa transação só)"
  { echo 'begin;'; cat "$AQUI/migrations/20261126_$m.sql"; echo; echo 'commit;'; } > "$TMP/$m.sql"
  sql "$TMP/$m.sql"
done
echo "✓ Importação da Guimoo pronta no servidor (nenhum dado ainda)."
