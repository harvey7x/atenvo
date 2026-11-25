#!/usr/bin/env bash
# Aplica NO SERVIDOR DE PRODUÇÃO do Reviza o TEMPO DE RESPOSTA DA EQUIPE (migration 97: atd_minutos_uteis + dash_tempo_resposta,
# só leitura, só administrador). Preparado em 25/11. SÓ COM O "OK" DO DONO PARA ESTA AÇÃO:
#   bash supabase-reviza/aplicar-tempo-resposta.sh confirmo
# Não muda dado nenhum (testado no banco local em 25/11). Depois: pacote com VITE_RECURSOS incluindo "tempo-resposta".
set -euo pipefail
[ "${1:-}" = "confirmo" ] || { echo "Não rodei nada. Para aplicar na produção: bash $0 confirmo"; exit 1; }
REF=ftexrtyswpdcndbkjbtf
AQUI="$(cd "$(dirname "$0")" && pwd)"
TMP="$(mktemp -d)"
{ echo 'begin;'; cat "$AQUI/migrations/20261125_97_tempo_de_resposta.sql"; echo; echo 'commit;'; } > "$TMP/97.sql"
python3 - "$REF" "$TMP/97.sql" <<'PY'
import base64, json, subprocess, sys, urllib.request
ref, arq = sys.argv[1], sys.argv[2]
t = subprocess.run(['security', 'find-generic-password', '-s', 'Supabase CLI', '-w'], capture_output=True, text=True).stdout.strip()
if t.startswith('go-keyring-base64:'): t = base64.b64decode(t.split(':', 1)[1]).decode().strip()
req = urllib.request.Request(f'https://api.supabase.com/v1/projects/{ref}/database/query', method='POST', data=json.dumps({'query': open(arq, encoding='utf-8').read()}).encode(),
    headers={'Authorization': 'Bearer ' + t, 'Content-Type': 'application/json', 'User-Agent': 'supabase-cli'})
try:
    urllib.request.urlopen(req, timeout=600).read(); print('  ok 97')
except urllib.error.HTTPError as e:
    print('  FALHOU 97', e.code, e.read().decode()[:600]); sys.exit(1)
PY
echo "✓ Tempo de resposta no servidor. Falta: subir o pacote com o recurso 'tempo-resposta' ligado."
