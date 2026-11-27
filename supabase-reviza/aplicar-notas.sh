#!/usr/bin/env bash
# Aplica NO SERVIDOR DE PRODUÇÃO do Reviza a NOTA INTERNA COM @ (migration 99: atd_nota_criar —
# grava a nota na conversa e o aviso de quem foi marcado; nunca envia nada ao cliente). Preparado em 25/11. SÓ COM O "OK" DO DONO PARA ESTA AÇÃO:
#   bash supabase-reviza/aplicar-notas.sh confirmo
# Só cria a rotina (testado no banco local em 25/11: ~/reviza-sist/banco-teste/teste-99-notas.sql). Depois: pacote com VITE_RECURSOS incluindo "notas".
set -euo pipefail
[ "${1:-}" = "confirmo" ] || { echo "Não rodei nada. Para aplicar na produção: bash $0 confirmo"; exit 1; }
REF=ftexrtyswpdcndbkjbtf
AQUI="$(cd "$(dirname "$0")" && pwd)"
TMP="$(mktemp -d)"
{ echo 'begin;'; cat "$AQUI/migrations/20261125_99_notas_internas.sql"; echo; echo 'commit;'; } > "$TMP/99.sql"
python3 - "$REF" "$TMP/99.sql" <<'PY'
import base64, json, subprocess, sys, urllib.request
ref, arq = sys.argv[1], sys.argv[2]
t = subprocess.run(['security', 'find-generic-password', '-s', 'Supabase CLI', '-w'], capture_output=True, text=True).stdout.strip()
if t.startswith('go-keyring-base64:'): t = base64.b64decode(t.split(':', 1)[1]).decode().strip()
req = urllib.request.Request(f'https://api.supabase.com/v1/projects/{ref}/database/query', method='POST', data=json.dumps({'query': open(arq, encoding='utf-8').read()}).encode(),
    headers={'Authorization': 'Bearer ' + t, 'Content-Type': 'application/json', 'User-Agent': 'supabase-cli'})
try:
    urllib.request.urlopen(req, timeout=600).read(); print('  ok 99')
except urllib.error.HTTPError as e:
    print('  FALHOU 99', e.code, e.read().decode()[:600]); sys.exit(1)
PY
echo "✓ Nota interna no servidor. Falta: subir o pacote com o recurso 'notas' ligado."
