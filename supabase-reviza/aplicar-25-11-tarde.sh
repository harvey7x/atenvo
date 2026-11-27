#!/usr/bin/env bash
# Aplica NO SERVIDOR DE PRODUÇÃO do Reviza o pacote da TARDE de 25/11. SÓ COM O "OK" DO DONO PARA ESTA AÇÃO:
#   bash supabase-reviza/aplicar-25-11-tarde.sh confirmo
# O que vai (cada migration numa transação própria: se uma falhar, ela não fica pela metade e o roteiro para):
#   105 motivo ao fechar a conversa
#   106 aviso de cliente esperando além da meta (DESLIGADO) + agendador a cada 2 min
#   107 saúde dos números do WhatsApp (só leitura)
#   108 resumo do dia (o aviso no sino chega DESLIGADO) + agendador a cada 10 min
#   função atd-ia de novo (Sugerir resposta + Identificar documentos; continua usando SÓ a chave de IA da Reviza)
# Tudo testado no banco de testes local em 25/11 (banco-teste/teste-105…108). Nada das Cobranças muda.
# Depois: o pacote do site com VITE_RECURSOS incluindo motivos-fechamento, aviso-espera, saude-numeros e resumo-dia.
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
for m in 105_motivo_fechamento 106_aviso_espera 107_saude_numeros 108_resumo_dia; do
  echo "» banco: migration $m"
  { echo 'begin;'; cat "$AQUI/migrations/20261125_$m.sql"; echo; echo 'commit;'; } > "$TMP/$m.sql"
  sql "$TMP/$m.sql"
done

echo "» agendamentos: aviso de espera (2 em 2 min) e resumo do dia (10 em 10 min); desligados, só conferem e voltam"
cat > "$TMP/cron.sql" <<'SQL'
select cron.unschedule('atd-aviso-espera') where exists (select 1 from cron.job where jobname = 'atd-aviso-espera');
select cron.schedule('atd-aviso-espera', '*/2 * * * *', $cron$ select public.atd_aviso_espera_tick(); $cron$);
select cron.unschedule('atd-resumo-dia') where exists (select 1 from cron.job where jobname = 'atd-resumo-dia');
select cron.schedule('atd-resumo-dia', '*/10 * * * *', $cron$ select public.atd_resumo_dia_tick(); $cron$);
SQL
sql "$TMP/cron.sql"

echo "» função: atd-ia (com _shared)"
mkdir -p "$TMP/supabase/functions/_shared"
cp -R "$AQUI/functions/atd-ia" "$TMP/supabase/functions/atd-ia"
cp "$AQUI/functions/_shared/iaPropria.ts" "$AQUI/functions/_shared/iris.ts" "$TMP/supabase/functions/_shared/"
cd "$TMP"
supabase functions deploy atd-ia --project-ref "$REF" --use-api
echo "✓ Pronto. Falta: subir o pacote do site com os recursos novos; o aviso de espera e o resumo no sino o administrador liga quando quiser."
