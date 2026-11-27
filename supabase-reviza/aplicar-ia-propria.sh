#!/usr/bin/env bash
# Aplica NO SERVIDOR DE PRODUÇÃO do Reviza a IA COM A CHAVE DA PRÓPRIA REVIZA (migration 100 + função atd-ia): o "Resumo do
# atendimento" no painel do cliente e o "Transcrever" dos áudios no WhatsApp. Preparado em 25/11. SÓ COM O "OK" DO DONO PARA
# ESTA AÇÃO:
#   bash supabase-reviza/aplicar-ia-propria.sh confirmo
# A 100 vai inteira numa transação: se qualquer parte falhar, nada fica gravado. Só cria peças novas (atd_ia_chave,
# atd_resumos, atd_ia_gravar_transcricao); nada das Cobranças nem do resto do Atendimento muda (testado no banco local em 25/11).
# NENHUMA chave de IA é posta aqui: depois do pacote com VITE_RECURSOS incluindo "ia-propria", a PRÓPRIA Reviza cria a chave
# na conta dela (Google AI Studio ou OpenAI) e cola em Configurações › Integrações › Inteligência artificial.
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
echo "» 1/2 banco: migration 100 (numa transação só)"
{ echo 'begin;'; cat "$AQUI/migrations/20261125_100_ia_chave_propria.sql"; echo; echo 'commit;'; } > "$TMP/100.sql"
sql "$TMP/100.sql"

echo "» 2/2 função atd-ia (nova; só a tela logada chama, então fica com a conferência de login do Supabase ligada)"
mkdir -p "$TMP/supabase/functions/_shared"
cp -R "$AQUI/functions/atd-ia" "$TMP/supabase/functions/atd-ia"
cp "$AQUI/functions/_shared/iaPropria.ts" "$AQUI/functions/_shared/iris.ts" "$TMP/supabase/functions/_shared/"
cd "$TMP"
supabase functions deploy atd-ia --project-ref "$REF" --use-api
echo "✓ IA própria no servidor. Falta: subir o pacote com o recurso 'ia-propria' ligado e a Reviza colar a chave DELA em Integrações."
