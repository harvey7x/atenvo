#!/usr/bin/env bash
# Aplica NO SERVIDOR DE PRODUÇÃO do Reviza as peças do Asaas e do WhatsApp oficial (migrations 87, 88, 89
# e as funções). Preparado em 22/11. SÓ RODAR COM O "CONFIRMO" DO DONO PARA ESTA AÇÃO.
#   bash supabase-reviza/aplicar-asaas-e-oficial.sh confirmo
# Tudo é aditivo (nada do que existe é alterado) e cada migration traz o seu bloco DESFAZER no final.
set -euo pipefail
[ "${1:-}" = "confirmo" ] || { echo "Não rodei nada. Para aplicar na produção: bash $0 confirmo"; exit 1; }
REF=ftexrtyswpdcndbkjbtf
AQUI="$(cd "$(dirname "$0")" && pwd)"

echo "» 1/2 banco: migrations 87, 88 e 89"
for m in 20261122_87_integracoes_asaas 20261122_88_asaas_cobrancas 20261122_89_whatsapp_oficial; do
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

echo "» 2/2 funções"
TMP="$(mktemp -d)"; mkdir -p "$TMP/supabase/functions"
for f in reviza-asaas reviza-asaas-retorno reviza-wa-oficial; do cp -R "$AQUI/functions/$f" "$TMP/supabase/functions/$f"; done
cd "$TMP"
supabase functions deploy reviza-asaas          --project-ref "$REF"
# quem chama é o Asaas (sem login): a prova é o segredo no cabeçalho asaas-access-token
supabase functions deploy reviza-asaas-retorno  --project-ref "$REF" --no-verify-jwt
supabase functions deploy reviza-wa-oficial     --project-ref "$REF"
echo "✓ servidor pronto. Agora: subir o pacote com os recursos ligados e conectar o Asaas com a chave de TESTES."
