#!/usr/bin/env bash
# Aplica NO SERVIDOR DE PRODUÇÃO do Reviza os CAMPOS DO CLIENTE e os MOTIVOS DE FECHAMENTO configuráveis (migration 110).
# Preparado em 26/11, dentro do "copia tudo… deixar tudo no nosso sistema" do dono. Para rodar:
#   bash supabase-reviza/aplicar-campos-motivos.sh confirmo
# A 110 vai inteira numa transação: se qualquer parte falhar, nada fica gravado. Só cria peças novas (atd_campos,
# atd_campo_valores, atd_motivos_fechamento e a rotina atd_motivos_historico) e semeia o "Nome completo (RG)" e os 6
# motivos que o sistema já usava. Nada das Cobranças nem do resto do Atendimento muda (testado no banco local em 26/11:
# banco-teste/teste-110-campos.sql). Não envia nada a ninguém.
# Depois: pacote com VITE_RECURSOS incluindo "campos".
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
echo "» banco: migration 110 (numa transação só)"
{ echo 'begin;'; cat "$AQUI/migrations/20261126_110_campos_e_motivos.sql"; echo; echo 'commit;'; } > "$TMP/110.sql"
sql "$TMP/110.sql"
echo "✓ Campos do cliente e motivos no servidor. Falta: subir o pacote com o recurso 'campos'."
