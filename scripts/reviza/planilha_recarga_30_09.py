"""Wrapper do planilha_substituir.py para a planilha de 30/09 (MENSAIS(CLIENTES MENSAL).csv).
- Coluna Z (26ª): 5 telefones digitados uma coluna à direita. Se Y vazia -> Y = Z; se Y tem texto sem
  telefone -> Y = Y + ' ' + Z. Nada mais muda no texto.
- Colunas extras preservadas na recarga: 'Mês 15' (mes_pos 14, com os 10 cabeçalhos atuais) e
  'Nova coluna' (livre, vazia) — existem hoje em produção e a recarga as apagaria.
"""
import sys, os, re, io, csv, importlib.util
spec = importlib.util.spec_from_file_location('ps', '/Users/matheus/Desktop/atenvo-platina/scripts/reviza/planilha_substituir.py')
ps = importlib.util.module_from_spec(spec); spec.loader.exec_module(ps)
ORIG_LER = ps.ler_csv
Z_LOG = []
def ler_csv_z(caminho):
    with open(caminho, 'rb') as f:
        bruto = f.read()
    txt = bruto.decode('cp1252', errors='planilha_cp1252_latin1')
    faixa = [b for b in bruto if 0x80 <= b <= 0x9F]
    info = {'bytes_80_9f': len(faixa), 'indefinidos_latin1': sum(1 for b in faixa if b in ps._CP1252_INDEFINIDOS)}
    rows = list(csv.reader(io.StringIO(txt, newline=''), delimiter=';'))
    out = []
    for i, r in enumerate(rows):
        r = r + [''] * 30
        extra = [c for c in r[26:] if c != '']
        if extra:
            raise SystemExit('ERRO: célula depois da coluna Z (linha %d)' % i)
        z = r[25]
        if z.strip():
            y = r[24]
            if y.strip() in ('', '0', '-'):
                r[24] = z; Z_LOG.append((i, 'Y<-Z'))
            elif ps.telefone(y) is None:
                r[24] = y.rstrip() + ' ' + z.strip(); Z_LOG.append((i, 'Y+Z'))
            else:
                raise SystemExit('ERRO: linha %d tem telefone em Y e em Z' % i)
        out.append(r[:ps.NCOL])
    return out, info
ps.ler_csv = ler_csv_z

# --- colunas que existem hoje em produção e a recarga apagaria (dono 29/09: Mês 15 "continua lá vazio")
MES15_CAB = {'D24': '26/out', 'D25': '27/out', 'D28': '28/out', 'D29': '29/out', 'D30': '30/out',
             'D01': '03/nov', 'D02': '04/nov', 'D05': '05/nov', 'D06': '06/nov', 'D07': '09/nov'}
ORIG_PAYLOAD = ps.montar_payload
def montar_payload_extra(blocos, colunas, linhas, casados, leads):
    p = ORIG_PAYLOAD(blocos, colunas, linhas, casados, leads)
    p['origem'] = 'MENSAIS(CLIENTES MENSAL).csv'
    n = len(p['colunas'])
    assert n == ps.NCOL == 25, n
    p['colunas'] = list(p['colunas']) + [
        {'pos': 25, 'ordem': 26000, 'titulo': 'Mês 15', 'tipo': 'mes', 'campo': None, 'mes_pos': 14, 'largura': 110},
        {'pos': 26, 'ordem': 27000, 'titulo': 'Nova coluna', 'tipo': 'livre', 'campo': None, 'mes_pos': None, 'largura': 110},
    ]
    for ln in p['linhas']:
        assert len(ln['c']) == 25
        cab = MES15_CAB.get(ln['bloco'], '') if ln['tipo'] == 'cabecalho' else ''
        ln['c'] = list(ln['c']) + [cab, '']
    faltam = set(MES15_CAB) - {ln['bloco'] for ln in p['linhas'] if ln['tipo'] == 'cabecalho'}
    assert not faltam, faltam
    return p
ps.montar_payload = montar_payload_extra
CSV_NOVO = os.path.expanduser('~/Downloads/MENSAIS(CLIENTES MENSAL).csv')
if __name__ == '__main__':
    # nunca cair no CSV antigo (padrão do script): força a planilha de 30/09
    if '--csv' in sys.argv:
        i = sys.argv.index('--csv')
        if os.path.basename(sys.argv[i + 1]) != os.path.basename(CSV_NOVO):
            raise SystemExit('ERRO: este wrapper é só para %s' % os.path.basename(CSV_NOVO))
    else:
        sys.argv += ['--csv', CSV_NOVO]
    ps.main()
    print('coluna Z dobrada:', Z_LOG)
