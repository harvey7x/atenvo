#!/usr/bin/env bash
# Aplica NO SERVIDOR DE PRODUÇÃO do Reviza o papel "atendente", os ambientes e as telas por pessoa e as
# EQUIPES (migrations 91 e 92) e publica a função reviza-admin atualizada. Preparado em 23/11.
# SÓ RODAR COM O "CONFIRMO" DO DONO PARA ESTA AÇÃO:
#   bash supabase-reviza/aplicar-acessos-e-equipes.sh confirmo
# Para quem já usa o sistema nada muda (conferido no banco de testes local: 714 respostas iguais, antes e
# depois). A 91 vai sozinha e antes: um valor novo de enum só pode ser usado depois de gravado.
set -euo pipefail
[ "${1:-}" = "confirmo" ] || { echo "Não rodei nada. Para aplicar na produção: bash $0 confirmo"; exit 1; }
REF=ftexrtyswpdcndbkjbtf
AQUI="$(cd "$(dirname "$0")" && pwd)"

echo "» 1/2 banco: migrations 91 e 92"
for m in 20261123_91_papel_atendente 20261123_92_ambientes_e_equipes; do
  python3 - "$AQUI/migrations/$m.sql" "$REF" <<'PY'
import base64, json, subprocess, sys, urllib.request
arq, ref = sys.argv[1], sys.argv[2]
t = subprocess.run(['security', 'find-generic-password', '-s', 'Supabase CLI', '-w'], capture_output=True, text=True).stdout.strip()
if t.startswith('go-keyring-base64:'): t = base64.b64decode(t.split(':', 1)[1]).decode().strip()
req = urllib.request.Request(f'https://api.supabase.com/v1/projects/{ref}/database/query', method='POST',
    data=json.dumps({'query': open(arq, encoding='utf-8').read()}).encode(),
    headers={'Authorization': 'Bearer ' + t, 'Content-Type': 'application/json', 'User-Agent': 'supabase-cli'})
try:
    urllib.request.urlopen(req, timeout=60).read(); print('  ok', arq.split('/')[-1])
except urllib.error.HTTPError as e:
    print('  FALHOU', arq.split('/')[-1], e.code, e.read().decode()[:400]); sys.exit(1)
PY
done

echo "» 2/2 função reviza-admin (aceita o papel atendente, os ambientes e as telas ao criar o login)"
TMP="$(mktemp -d)"; mkdir -p "$TMP/supabase/functions"
cp -R "$AQUI/functions/reviza-admin" "$TMP/supabase/functions/reviza-admin"
cd "$TMP"
supabase functions deploy reviza-admin --project-ref "$REF" --use-api
echo "✓ servidor pronto para ambientes e telas por pessoa. As equipes aparecem na tela quando o Atendimento for ligado."
