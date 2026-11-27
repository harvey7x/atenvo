#!/usr/bin/env bash
# Aplica NO SERVIDOR DE PRODUÇÃO do Reviza o AVISO DE CLIENTE ESPERANDO ALÉM DA META (migration 106 + agendador a cada
# 2 minutos). Preparado em 25/11. SÓ COM O "OK" DO DONO PARA ESTA AÇÃO:
#   bash supabase-reviza/aplicar-aviso-espera.sh confirmo
# A 106 vai inteira numa transação: se qualquer parte falhar, nada fica gravado. Só cria peças novas (atd_aviso_espera*);
# nada das Cobranças nem do resto do Atendimento muda (testado no banco local em 25/11: banco-teste/teste-106-aviso-espera.sql).
# O AVISO CHEGA DESLIGADO: o agendador roda, mas nada sai até um administrador ligar em Configurações › Aviso de espera.
# Não precisa de função nova: o agendador chama direto a função do banco.
# Depois: pacote com VITE_RECURSOS incluindo "aviso-espera".
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
echo "» 1/2 banco: migration 106 (numa transação só)"
{ echo 'begin;'; cat "$AQUI/migrations/20261125_106_aviso_espera.sql"; echo; echo 'commit;'; } > "$TMP/106.sql"
sql "$TMP/106.sql"

echo "» 2/2 agendamento: a cada 2 minutos (com o aviso desligado a função só confere e volta)"
cat > "$TMP/cron.sql" <<'SQL'
select cron.unschedule('atd-aviso-espera') where exists (select 1 from cron.job where jobname = 'atd-aviso-espera');
select cron.schedule('atd-aviso-espera', '*/2 * * * *', $cron$ select public.atd_aviso_espera_tick(); $cron$);
SQL
sql "$TMP/cron.sql"
echo "✓ Aviso de espera no servidor, DESLIGADO. Falta: subir o pacote com o recurso 'aviso-espera' e o administrador ligar."
