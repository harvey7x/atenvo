#!/usr/bin/env python3
"""PUBLICAÇÃO ÚNICA do atendimento do Reviza no Atenvo (dono 28/11). SÓ rodar com o "Publica" do dono.
Ordem: 1) banco, bloco por bloco (lock_timeout + nova tentativa: o banco está vivo) e registro da migração;
       2) segredos e agendadores (tudo que manda mensagem chega DESLIGADO: os agendadores só conferem e voltam);
       3) funções de borda novas (--no-verify-jwt). O código do site sobe depois, pelo git (Cloudflare Pages).
Uso: python3 supabase/ops/publicar_atendimento_reviza.py [--so-banco|--so-funcoes]"""
import json, os, re, secrets, subprocess, sys, tempfile, time
AQUI = os.path.dirname(os.path.abspath(__file__)); RAIZ = os.path.dirname(os.path.dirname(AQUI))
SB = '/Users/matheus/atenvo-iris/node_modules/.bin/supabase'; WD = '/Users/matheus/atenvo-iris'
REF = open(os.path.join(WD, 'supabase/.temp/project-ref')).read().strip()
MIG = os.path.join(RAIZ, 'supabase/migrations/20261128120000_atendimento_do_reviza.sql')

def sql(texto, tentativas=6):
    with tempfile.NamedTemporaryFile('w', suffix='.sql', delete=False) as f: f.write(texto); nome = f.name
    for i in range(1, tentativas + 1):
        r = subprocess.run([SB, '--workdir', WD, 'db', 'query', '--linked', '--file', nome, '-o', 'json'], capture_output=True, text=True)
        saida = r.stdout + r.stderr
        if r.returncode == 0: os.unlink(nome); return saida
        if re.search(r'deadlock|lock timeout|canceling statement due to lock|502|503', saida, re.I) and i < tentativas:
            print(f'   ... banco ocupado (tentativa {i}), espero {5 * i}s'); time.sleep(5 * i); continue
        os.unlink(nome); raise SystemExit('ERRO no banco:\n' + saida[:1500])

def banco():
    t = open(MIG).read()
    partes = re.split(r'\n(?=-- ===================== )', t)
    print(f'» banco: {len(partes)} blocos')
    for k, p in enumerate(partes, 1):
        titulo = p.split('\n', 1)[0][:90]
        sql("set lock_timeout = '5s';\nset statement_timeout = '180s';\nset check_function_bodies = off;\n" + p)
        print(f'   ✓ {k}/{len(partes)} {titulo}')
    sql("insert into supabase_migrations.schema_migrations(version, name, statements) values ('20261128120000', 'atendimento_do_reviza', array[$mig$"
        + t + "$mig$]) on conflict (version) do nothing;")
    print('   ✓ migração registrada')
    url = f'https://{REF}.supabase.co/functions/v1'
    sql(f"""insert into public.webhook_config (chave, secret) values ('retomada', '{secrets.token_hex(32)}') on conflict (chave) do nothing;
insert into public.webhook_config (chave, secret) values ('anuncios', '{secrets.token_hex(32)}') on conflict (chave) do nothing;
select cron.unschedule(jobname) from cron.job where jobname in ('atd-aviso-espera', 'atd-resumo-dia', 'atd-retomada', 'atd-anuncios-gasto');
select cron.schedule('atd-aviso-espera', '*/2 * * * *', $c$ select public.atd_aviso_espera_tick(); $c$);
select cron.schedule('atd-resumo-dia', '*/10 * * * *', $c$ select public.atd_resumo_dia_tick(); $c$);
select cron.schedule('atd-retomada', '* * * * *', $c$ select net.http_post(url := '{url}/retomada-processar', body := '{{}}'::jsonb,
  headers := jsonb_build_object('Content-Type', 'application/json', 'x-retomada-secret', (select secret from public.webhook_config where chave = 'retomada')), timeout_milliseconds := 60000); $c$);
select cron.schedule('atd-anuncios-gasto', '17 * * * *', $c$ select net.http_post(url := '{url}/meta-anuncios', body := '{{"acao":"agendador"}}'::jsonb,
  headers := jsonb_build_object('Content-Type', 'application/json', 'x-anuncios-secret', (select secret from public.webhook_config where chave = 'anuncios')), timeout_milliseconds := 120000); $c$);""")
    print('   ✓ segredos e agendadores (desligados por configuração)')

def funcoes():
    with tempfile.TemporaryDirectory() as tmp:
        os.makedirs(os.path.join(tmp, 'supabase/functions'))
        open(os.path.join(tmp, 'supabase/config.toml'), 'w').write(''.join(f'[functions.{n}]\nverify_jwt = false\n' for n in ('entrada-webhook', 'meta-anuncios', 'retomada-processar')))
        for n in ('entrada-webhook', 'meta-anuncios', 'retomada-processar'):
            subprocess.run(['cp', '-R', os.path.join(RAIZ, 'supabase/functions', n), os.path.join(tmp, 'supabase/functions', n)], check=True)
            r = subprocess.run([SB, '--workdir', tmp, 'functions', 'deploy', n, '--project-ref', REF, '--use-api', '--no-verify-jwt'], capture_output=True, text=True)
            if r.returncode != 0: raise SystemExit(f'ERRO ao publicar {n}:\n{(r.stdout + r.stderr)[-800:]}')
            print(f'   ✓ função {n}')

if __name__ == '__main__':
    if '--so-funcoes' not in sys.argv: banco()
    if '--so-banco' not in sys.argv: funcoes()
    print('PRONTO. Falta subir o código (git push para o main) e conferir.')
