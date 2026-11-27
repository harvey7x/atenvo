#!/usr/bin/env bash
# Aplica NO SERVIDOR DE PRODUÇÃO do Reviza a RETOMADA AUTOMÁTICA (migration 103 + segredo do agendador + agendador a cada
# minuto + função retomada-processar). Preparado em 25/11. SÓ COM O "OK" DO DONO PARA ESTA AÇÃO:
#   bash supabase-reviza/aplicar-retomada.sh confirmo
# A 103 vai inteira numa transação: se qualquer parte falhar, nada fica gravado. Só cria peças novas (atd_retomada_*);
# nada das Cobranças nem do resto do Atendimento muda (testado no banco local em 25/11: banco-teste/teste-103-retomada.sql).
# A RETOMADA CHEGA DESLIGADA: o agendador roda, mas nada sai até um administrador ligar a chave geral em
# Configurações › Retomada automática (e só sequências sem texto de exemplo enviam).
# Depois: pacote com VITE_RECURSOS incluindo "retomada".
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
echo "» 0/4 conferência: o envio pelo servidor (evolution-send no modo do agendador) precisa do segredo 'agendamento'"
cat > "$TMP/confere.sql" <<'SQL'
do $$ begin
  if not exists (select 1 from public.webhook_config where chave = 'agendamento') then
    raise exception 'falta o segredo agendamento (o mesmo das mensagens agendadas): a retomada não conseguiria enviar';
  end if;
end $$;
SQL
sql "$TMP/confere.sql"

echo "» 1/4 banco: migration 103 (numa transação só)"
{ echo 'begin;'; cat "$AQUI/migrations/20261125_103_retomada.sql"; echo; echo 'commit;'; } > "$TMP/103.sql"
sql "$TMP/103.sql"

echo "» 2/4 segredo do agendador da retomada (gerado aqui, guardado só no banco, não aparece)"
python3 - > "$TMP/segredo.sql" <<'PY'
import secrets
print("insert into public.webhook_config (chave, secret) values ('retomada', '%s') on conflict (chave) do nothing;" % secrets.token_hex(32))
PY
sql "$TMP/segredo.sql"; rm -f "$TMP/segredo.sql"

echo "» 3/4 agendamento: a cada minuto (com a chave geral desligada a função só confere e volta)"
cat > "$TMP/cron.sql" <<SQL
select cron.unschedule('atd-retomada') where exists (select 1 from cron.job where jobname = 'atd-retomada');
select cron.schedule('atd-retomada', '* * * * *', \$cron\$
  select net.http_post(
    url := 'https://$REF.supabase.co/functions/v1/retomada-processar',
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-retomada-secret', (select secret from public.webhook_config where chave = 'retomada')),
    timeout_milliseconds := 60000);
\$cron\$);
SQL
sql "$TMP/cron.sql"

echo "» 4/4 função: retomada-processar (nova)"
mkdir -p "$TMP/supabase/functions"
cp -R "$AQUI/functions/retomada-processar" "$TMP/supabase/functions/retomada-processar"
cd "$TMP"
# o agendador não tem login (a prova é o segredo no cabeçalho)
supabase functions deploy retomada-processar --project-ref "$REF" --use-api --no-verify-jwt
echo "✓ Retomada no servidor, DESLIGADA. Falta: subir o pacote com o recurso 'retomada' e o administrador ligar quando os textos estiverem prontos."
