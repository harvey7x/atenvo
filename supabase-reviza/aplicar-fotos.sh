#!/usr/bin/env bash
# Aplica NO SERVIDOR DE PRODUÇÃO do Reviza as FOTOS REAIS dos clientes no Atendimento (24/11). SÓ COM O "OK" DO DONO PARA ESTA AÇÃO:
#   bash supabase-reviza/aplicar-fotos.sh confirmo
# 1) migration 95 numa transação (depósito fechado contato-fotos + a fila atd_fotos_alvos, só o servidor chama)
# 2) o segredo do agendador (gerado aqui, guardado só no banco, não aparece)
# 3) o agendador: a cada minuto busca até 8 fotos, um cliente a cada ~6 s, conversas mais recentes primeiro
# 4) a função contato-foto
# Nada das Cobranças muda. Enquanto nenhum número do Atendimento estiver conectado, a fila fica vazia e nada é buscado.
# Conferido no banco de testes local em 24/11 (fila, permissões, depósito, ritmo, quem pode pedir a foto de quem).
# DESFAZER: select cron.unschedule('atd-fotos-clientes');  (as fotos já guardadas continuam; a tela volta às iniciais se apagar contatos.foto_url)
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
echo "» 1/4 banco: migration 95 (numa transação só)"
{ echo 'begin;'; cat "$AQUI/migrations/20261124_95_fotos_dos_clientes.sql"; echo; echo 'commit;'; } > "$TMP/95.sql"
sql "$TMP/95.sql"

echo "» 2/4 segredo do agendador das fotos (gerado aqui, guardado só no banco)"
python3 - > "$TMP/segredo.sql" <<'PY'
import secrets
print("insert into public.webhook_config (chave, secret) values ('fotos', '%s') on conflict (chave) do nothing;" % secrets.token_hex(32))
PY
sql "$TMP/segredo.sql"; rm -f "$TMP/segredo.sql"

echo "» 3/4 agendador: fotos aos poucos, a cada minuto"
cat > "$TMP/cron.sql" <<SQL
select cron.unschedule('atd-fotos-clientes') where exists (select 1 from cron.job where jobname = 'atd-fotos-clientes');
select cron.schedule('atd-fotos-clientes', '* * * * *', \$cron\$
  select net.http_post(
    url := 'https://$REF.supabase.co/functions/v1/contato-foto',
    body := '{"lote": true}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-fotos-secret', (select secret from public.webhook_config where chave = 'fotos')),
    timeout_milliseconds := 90000);
\$cron\$);
SQL
sql "$TMP/cron.sql"

echo "» 4/4 função contato-foto"
mkdir -p "$TMP/supabase/functions"
cp -R "$AQUI/functions/contato-foto" "$TMP/supabase/functions/contato-foto"
cd "$TMP"
# o agendador não tem login (a prova é o segredo); a tela é conferida dentro da função
supabase functions deploy contato-foto --project-ref "$REF" --use-api --no-verify-jwt
echo "✓ Fotos dos clientes no servidor. Assim que um número do Atendimento estiver conectado, as fotos começam a aparecer."
