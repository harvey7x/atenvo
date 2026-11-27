#!/usr/bin/env bash
# Aplica NO SERVIDOR DE PRODUÇÃO do Reviza o ATENDIMENTO (migration 93 + segredos do WhatsApp + agendamento das
# mensagens + 7 funções de servidor). Preparado em 23/11. SÓ COM O "OK" DO DONO PARA ESTA AÇÃO:
#   bash supabase-reviza/aplicar-atendimento.sh confirmo
# A 93 vai inteira numa transação: se qualquer parte falhar, nada fica gravado. Nada das Cobranças muda
# (conferido no banco de testes: 738 respostas iguais antes e depois).
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
echo "» 1/4 banco: migration 93 (numa transação só)"
{ echo 'begin;'; cat "$AQUI/migrations/20261124_93_atendimento_estrutura.sql"; echo; echo 'commit;'; } > "$TMP/93.sql"
sql "$TMP/93.sql"

echo "» 2/4 segredos do WhatsApp e do agendamento (gerados aqui, guardados só no banco, não aparecem)"
python3 - > "$TMP/segredos.sql" <<'PY'
import secrets
print("insert into public.webhook_config (chave, secret) values ('whatsapp', '%s'), ('agendamento', '%s') on conflict (chave) do nothing;" % (secrets.token_hex(32), secrets.token_hex(32)))
PY
sql "$TMP/segredos.sql"; rm -f "$TMP/segredos.sql"

echo "» 3/4 agendamento: mensagens agendadas saem a cada minuto"
cat > "$TMP/cron.sql" <<SQL
select cron.unschedule('atd-mensagens-agendadas') where exists (select 1 from cron.job where jobname = 'atd-mensagens-agendadas');
select cron.schedule('atd-mensagens-agendadas', '* * * * *', \$cron\$
  select net.http_post(
    url := 'https://$REF.supabase.co/functions/v1/mensagens-agendadas-processar',
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-agendamento-secret', (select secret from public.webhook_config where chave = 'agendamento')));
\$cron\$);
SQL
sql "$TMP/cron.sql"

echo "» 4/4 funções do WhatsApp do Atendimento"
mkdir -p "$TMP/supabase/functions"
for f in evolution-manage evolution-webhook evolution-send evolution-send-midia wa-midia atribuir-atendimento mensagens-agendadas-processar bot-runner; do cp -R "$AQUI/functions/$f" "$TMP/supabase/functions/$f"; done
cd "$TMP"
supabase functions deploy evolution-manage              --project-ref "$REF" --use-api
supabase functions deploy evolution-send-midia          --project-ref "$REF" --use-api
supabase functions deploy wa-midia                      --project-ref "$REF" --use-api
supabase functions deploy atribuir-atendimento          --project-ref "$REF" --use-api
# quem chama é o servidor de conexão do WhatsApp / o agendamento: a prova é o segredo no cabeçalho
supabase functions deploy evolution-webhook             --project-ref "$REF" --use-api --no-verify-jwt
supabase functions deploy evolution-send                --project-ref "$REF" --use-api --no-verify-jwt
supabase functions deploy mensagens-agendadas-processar --project-ref "$REF" --use-api --no-verify-jwt
echo "✓ Atendimento no servidor. Falta: subir o pacote com o Atendimento ligado e conectar o primeiro número por QR Code."
