#!/usr/bin/env bash
# Aplica NO SERVIDOR DE PRODUÇÃO do Reviza as peças do Asaas, do WhatsApp oficial e da IRIS (migrations 87 a 90
# e as funções). Preparado em 22/11. SÓ RODAR COM O "CONFIRMO" DO DONO PARA ESTA AÇÃO.
#   bash supabase-reviza/aplicar-asaas-e-oficial.sh confirmo
# Tudo é aditivo (nada do que existe é alterado) e cada migration traz o seu bloco DESFAZER no final.
set -euo pipefail
[ "${1:-}" = "confirmo" ] || { echo "Não rodei nada. Para aplicar na produção: bash $0 confirmo"; exit 1; }
REF=ftexrtyswpdcndbkjbtf
AQUI="$(cd "$(dirname "$0")" && pwd)"

echo "» 1/3 banco: migrations 87, 88, 89 e 90"
for m in 20261122_87_integracoes_asaas 20261122_88_asaas_cobrancas 20261122_89_whatsapp_oficial 20261122_90_iris; do
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

echo "» 2/3 funções"
TMP="$(mktemp -d)"; mkdir -p "$TMP/supabase/functions"
# a Iris usa o módulo compartilhado e o envio do WhatsApp que já existe (vão juntos no pacote dela)
for f in _shared reviza-wa-enviar reviza-iris ia-agente-testar ia-agente-conversar reviza-asaas reviza-asaas-retorno reviza-wa-oficial; do cp -R "$AQUI/functions/$f" "$TMP/supabase/functions/$f"; done
cd "$TMP"
supabase functions deploy reviza-asaas          --project-ref "$REF"
# quem chama é o Asaas (sem login): a prova é o segredo no cabeçalho asaas-access-token
supabase functions deploy reviza-asaas-retorno  --project-ref "$REF" --no-verify-jwt
supabase functions deploy reviza-wa-oficial     --project-ref "$REF"
supabase functions deploy ia-agente-testar      --project-ref "$REF"
supabase functions deploy ia-agente-conversar   --project-ref "$REF"
# quem chama a Iris é o banco (gatilho), com um segredo no cabeçalho
supabase functions deploy reviza-iris           --project-ref "$REF" --no-verify-jwt

echo "» 3/3 Iris: endereço e segredo do gatilho no cofre (o segredo é gerado aqui e não é mostrado)"
SEG="$(openssl rand -hex 32)"
python3 - "$REF" "$SEG" <<'PY'
import base64, json, subprocess, sys, urllib.request
ref, seg = sys.argv[1], sys.argv[2]
t = subprocess.run(['security', 'find-generic-password', '-s', 'Supabase CLI', '-w'], capture_output=True, text=True).stdout.strip()
if t.startswith('go-keyring-base64:'): t = base64.b64decode(t.split(':', 1)[1]).decode().strip()
sql = f"select public.integracao_segredo_gravar('iris_gatilho_url', 'https://{ref}.supabase.co/functions/v1/reviza-iris'); select public.integracao_segredo_gravar('iris_gatilho_segredo', '{seg}');"
req = urllib.request.Request(f'https://api.supabase.com/v1/projects/{ref}/database/query', method='POST', data=json.dumps({'query': sql}).encode(),
    headers={'Authorization': 'Bearer ' + t, 'Content-Type': 'application/json', 'User-Agent': 'supabase-cli'})
try:
    urllib.request.urlopen(req, timeout=60).read(); print('  ok gatilho da Iris configurado (ela continua desligada até o administrador ligar na tela)')
except urllib.error.HTTPError as e:
    print('  FALHOU', e.code, e.read().decode()[:300]); sys.exit(1)
PY
echo "✓ servidor pronto. Agora: subir o pacote 3; Asaas com a chave de TESTES; Iris: importar o arquivo, guardar a chave do Google e ligar em MODO TESTE."
