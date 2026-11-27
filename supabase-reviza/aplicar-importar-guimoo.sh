#!/usr/bin/env bash
# Grava NO SERVIDOR DA REVIZA o que a Reviza tinha montado na Guimoo (dados/20261126_importar_da_guimoo.sql).
# O dono autorizou em 26/11 ("sim copia tudo mesmo, tudo"). Uma transação só; pode rodar de novo sem duplicar.
#   bash supabase-reviza/aplicar-importar-guimoo.sh confirmo
set -euo pipefail
[ "${1:-}" = "confirmo" ] || { echo "Não rodei nada. Para gravar na produção: bash $0 confirmo"; exit 1; }
REF=ftexrtyswpdcndbkjbtf
AQUI="$(cd "$(dirname "$0")" && pwd)"
python3 - "$REF" "$AQUI/dados/20261126_importar_da_guimoo.sql" <<'PY'
import base64, json, subprocess, sys, urllib.request
ref, arq = sys.argv[1], sys.argv[2]
assert ref != 'afmzuoavvnpfossiiypz'
t = subprocess.run(['security', 'find-generic-password', '-s', 'Supabase CLI', '-w'], capture_output=True, text=True).stdout.strip()
if t.startswith('go-keyring-base64:'): t = base64.b64decode(t.split(':', 1)[1]).decode().strip()
q = '\n'.join(l for l in open(arq, encoding='utf-8').read().splitlines() if not l.startswith('\\'))
req = urllib.request.Request(f'https://api.supabase.com/v1/projects/{ref}/database/query', method='POST', data=json.dumps({'query': q}).encode(),
    headers={'Authorization': 'Bearer ' + t, 'Content-Type': 'application/json', 'User-Agent': 'supabase-cli'})
try:
    r = json.loads(urllib.request.urlopen(req, timeout=600).read() or b'[]')
    for linha in (r if isinstance(r, list) else []): print('  ', linha.get('parte'), '→', linha.get('valor'))
except urllib.error.HTTPError as e:
    print('  FALHOU', e.code, e.read().decode()[:800]); sys.exit(1)
PY
