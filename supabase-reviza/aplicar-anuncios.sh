#!/usr/bin/env bash
# Aplica NO SERVIDOR DE PRODUÇÃO do Reviza os ANÚNCIOS DO FACEBOOK (migration 96 + segredo do agendador + atualização do
# gasto de hora em hora + funções meta-anuncios e evolution-webhook). Preparado em 25/11. SÓ COM O "OK" DO DONO PARA ESTA AÇÃO:
#   bash supabase-reviza/aplicar-anuncios.sh confirmo
# A 96 vai inteira numa transação: se qualquer parte falhar, nada fica gravado. Só cria peças novas (atd_meta_*,
# atd_anuncio_origem, dash_anuncios); nada das Cobranças nem do resto do Atendimento muda (testado no banco local em 25/11).
# Depois: pacote com VITE_RECURSOS incluindo "anuncios", e a Reviza cola o código de acesso dela em Integrações.
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
echo "» 1/4 banco: migration 96 (numa transação só)"
{ echo 'begin;'; cat "$AQUI/migrations/20261125_96_anuncios_facebook.sql"; echo; echo 'commit;'; } > "$TMP/96.sql"
sql "$TMP/96.sql"

echo "» 2/4 segredo do agendador dos anúncios (gerado aqui, guardado só no banco, não aparece)"
python3 - > "$TMP/segredo.sql" <<'PY'
import secrets
print("insert into public.webhook_config (chave, secret) values ('anuncios', '%s') on conflict (chave) do nothing;" % secrets.token_hex(32))
PY
sql "$TMP/segredo.sql"; rm -f "$TMP/segredo.sql"

echo "» 3/4 agendamento: o gasto dos últimos 7 dias é relido a cada hora (minuto 17)"
cat > "$TMP/cron.sql" <<SQL
select cron.unschedule('atd-anuncios-gasto') where exists (select 1 from cron.job where jobname = 'atd-anuncios-gasto');
select cron.schedule('atd-anuncios-gasto', '17 * * * *', \$cron\$
  select net.http_post(
    url := 'https://$REF.supabase.co/functions/v1/meta-anuncios',
    body := '{"acao":"agendador"}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-anuncios-secret', (select secret from public.webhook_config where chave = 'anuncios')),
    timeout_milliseconds := 120000);
\$cron\$);
SQL
sql "$TMP/cron.sql"

echo "» 4/4 funções: meta-anuncios (nova) e evolution-webhook (passa a gravar de qual anúncio veio a conversa)"
mkdir -p "$TMP/supabase/functions"
for f in meta-anuncios evolution-webhook; do cp -R "$AQUI/functions/$f" "$TMP/supabase/functions/$f"; done
cd "$TMP"
# o agendador não tem login (a prova é o segredo no cabeçalho); a tela é conferida dentro da função (administrador)
supabase functions deploy meta-anuncios     --project-ref "$REF" --use-api --no-verify-jwt
supabase functions deploy evolution-webhook --project-ref "$REF" --use-api --no-verify-jwt
echo "✓ Anúncios no servidor. Falta: subir o pacote com o recurso 'anuncios' ligado e a Reviza conectar a conta em Integrações."
