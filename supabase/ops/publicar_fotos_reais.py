#!/usr/bin/env python3
"""FOTOS REAIS dos clientes (dono 28/11). SÓ rodar com o "Publica" do dono.
1) migração 20261128150000 (fila atd_fotos_alvos) + registro; 2) segredo webhook_config 'fotos' + cron atd-fotos a cada minuto
(8 contatos por rodada, um a cada ~6 s — ritmo calmo no servidor do WhatsApp); 3) função contato-foto (--no-verify-jwt)."""
import os, re, secrets, subprocess, sys, tempfile, time
AQUI = os.path.dirname(os.path.abspath(__file__)); RAIZ = os.path.dirname(os.path.dirname(AQUI))
SB = '/Users/matheus/atenvo-iris/node_modules/.bin/supabase'; WD = '/Users/matheus/atenvo-iris'
REF = open(os.path.join(WD, 'supabase/.temp/project-ref')).read().strip()
MIG = os.path.join(RAIZ, 'supabase/migrations/20261128150000_fotos_reais_contatos.sql')
def sql(texto, tentativas=5):
    with tempfile.NamedTemporaryFile('w', suffix='.sql', delete=False) as f: f.write(texto); nome = f.name
    for i in range(1, tentativas + 1):
        r = subprocess.run([SB, '--workdir', WD, 'db', 'query', '--linked', '--file', nome, '-o', 'json'], capture_output=True, text=True)
        if r.returncode == 0: os.unlink(nome); return r.stdout
        if re.search(r'deadlock|lock timeout|502|503', r.stdout + r.stderr, re.I) and i < tentativas: time.sleep(5 * i); continue
        os.unlink(nome); raise SystemExit('ERRO no banco:\n' + (r.stdout + r.stderr)[:1200])
t = open(MIG).read()
sql("set lock_timeout = '5s';\n" + t); print('✓ migração aplicada')
sql("insert into supabase_migrations.schema_migrations(version, name, statements) values ('20261128150000', 'fotos_reais_contatos', array[$m$" + t + "$m$]) on conflict (version) do nothing;"); print('✓ migração registrada')
sql(f"""insert into public.webhook_config (chave, secret) values ('fotos', '{secrets.token_hex(32)}') on conflict (chave) do nothing;
select cron.unschedule(jobname) from cron.job where jobname = 'atd-fotos';
select cron.schedule('atd-fotos', '* * * * *', $c$ select net.http_post(url := 'https://{REF}.supabase.co/functions/v1/contato-foto', body := '{{"lote":true}}'::jsonb,
  headers := jsonb_build_object('Content-Type', 'application/json', 'x-fotos-secret', (select secret from public.webhook_config where chave = 'fotos')), timeout_milliseconds := 58000); $c$);"""); print('✓ segredo e agendador atd-fotos')
with tempfile.TemporaryDirectory() as tmp:
    os.makedirs(os.path.join(tmp, 'supabase/functions'))
    open(os.path.join(tmp, 'supabase/config.toml'), 'w').write('[functions.contato-foto]\nverify_jwt = false\n')
    subprocess.run(['cp', '-R', os.path.join(RAIZ, 'supabase/functions/contato-foto'), os.path.join(tmp, 'supabase/functions/contato-foto')], check=True)
    r = subprocess.run([SB, '--workdir', tmp, 'functions', 'deploy', 'contato-foto', '--project-ref', REF, '--use-api', '--no-verify-jwt'], capture_output=True, text=True)
    if r.returncode != 0: raise SystemExit('ERRO ao publicar contato-foto:\n' + (r.stdout + r.stderr)[-800:])
    print('✓ função contato-foto')
print('PRONTO: as fotos vão chegando aos poucos (8 por minuto); a conversa aberta pede a sua na hora.')
