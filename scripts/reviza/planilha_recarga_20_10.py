"""Recarga da planilha de 20/10 (MENSAIS(CLIENTES MENSAL) (1).csv) — mesmo processo da de 30/09.
Reaproveita o wrapper de 30/09 (coluna Z dobrada em Y; colunas 'Mês 15' e 'Nova coluna') e acrescenta:
- grafias de COMERCIAL já corrigidas no sistema em 30/09 (dono aprovou): JUNIIOR->JUNIOR, PATRICIA->PATY,
  emillyn->EMILLYN — a planilha ainda traz as antigas e a recarga as desfaria;
- 'Mês 15' não existe na planilha: o que a equipe lançou nele no sistema é mantido (por lead casado).
"""
import sys, os, importlib.util
spec = importlib.util.spec_from_file_location('w30', '/Users/matheus/Desktop/atenvo-platina/scripts/reviza/planilha_recarga_30_09.py')
w30 = importlib.util.module_from_spec(spec); spec.loader.exec_module(w30)
ps = w30.ps
CSV_NOVO = os.path.expanduser('~/Downloads/MENSAIS(CLIENTES MENSAL) (1).csv')
GRAFIA = {'JUNIIOR': 'JUNIOR', 'PATRICIA': 'PATY', 'emillyn': 'EMILLYN'}
GRAFIA_LOG = []
LER_Z = ps.ler_csv
def ler_csv_grafia(caminho):
    rows, info = LER_Z(caminho)
    for i, r in enumerate(rows):
        g = GRAFIA.get(r[1].strip())
        if g:
            GRAFIA_LOG.append((i, r[1].strip(), g)); r[1] = g
    return rows, info
ps.ler_csv = ler_csv_grafia

API = {}
CONECTAR = ps.conectar
def conectar_guarda(args):
    api, papel = CONECTAR(args)
    API['api'] = api
    return api, papel
ps.conectar = conectar_guarda

MES15_LOG = []
def mes15_atual(api):
    """{lead_id: texto} das células de 'Mês 15' (mes_pos 14) com conteúdo, linhas cliente."""
    cols = [c for c in api.listar('planilha_colunas', 'id,tipo,mes_pos') if c['tipo'] == 'mes' and c['mes_pos'] == 14]
    assert len(cols) == 1, cols
    linhas = {l['id']: l['lead_id'] for l in api.listar('planilha_linhas', 'id,lead_id,tipo') if l['tipo'] == 'cliente'}
    cel = api._req('GET', '/rest/v1/planilha_celulas?select=linha_id,texto&coluna_id=eq.%s' % cols[0]['id'])
    return {linhas[c['linha_id']]: c['texto'] for c in cel
            if (c['texto'] or '').strip() and linhas.get(c['linha_id'])}
PAYLOAD_30 = ps.montar_payload
def montar_payload_20(blocos, colunas, linhas, casados, leads):
    p = PAYLOAD_30(blocos, colunas, linhas, casados, leads)
    p['origem'] = os.path.basename(CSV_NOVO)
    atual = mes15_atual(API['api'])
    usados = set()
    for ln in p['linhas']:
        lid = ln['lead_id']
        if ln['tipo'] == 'cliente' and lid in atual:
            assert len(ln['c']) == 27 and ln['c'][25] == ''
            ln['c'][25] = atual[lid]; usados.add(lid); MES15_LOG.append(ln['bloco'])
    perdidos = set(atual) - usados
    if perdidos:
        print('AVISO: %d valores de Mês 15 ficariam sem linha (lead foi pra Lixeira)' % len(perdidos))
    return p
ps.montar_payload = montar_payload_20

if __name__ == '__main__':
    if '--csv' in sys.argv:
        i = sys.argv.index('--csv')
        if os.path.basename(sys.argv[i + 1]) != os.path.basename(CSV_NOVO):
            raise SystemExit('ERRO: este wrapper é só para %s' % os.path.basename(CSV_NOVO))
    else:
        sys.argv += ['--csv', CSV_NOVO]
    ps.main()
    print('coluna Z dobrada:', w30.Z_LOG)
    print('grafias de COMERCIAL acertadas:', GRAFIA_LOG)
    print('Mês 15 mantido do sistema:', MES15_LOG)
