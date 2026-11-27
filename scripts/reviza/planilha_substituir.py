#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
planilha_substituir.py: carga única "a planilha manda" da Gestão de cobranças
(contrato: design-ref/PLANILHA-EXCEL-CONTRATO.md, §5). Só usa a stdlib do Python 3.

O que faz
  1. Lê ~/Downloads/MENSAIS(Planilha1).csv (';', CRLF) SÓ EM MEMÓRIA. Nunca grava
     cópia, nem o payload (que leva CPF e senhas em trânsito). Decodifica como cp1252
     (o que o Excel grava: 0x94 = ”, 0x96 = –); só os 5 bytes que o cp1252 não
     define (81 8D 8F 90 9D) caem no latin1, byte a byte. Texto EXATO, sem trocas.
  2. Monta blocos (pelos cabeçalhos repetidos + a linha-rótulo "NOVOS"), as 25
     colunas (A..Y) e as linhas na ordem exata da folha (cabecalho/cliente/vazia/
     rotulo). As vazias do fim não entram. Cada célula leva o texto EXATO, sem trim.
  3. Faz login (REST do Supabase; URL e ANON vêm do .env.reviza.local e o
     e-mail/senha de RV_EMAIL/RV_SENHA) e lê os leads e pagamentos atuais.
  4. Casa cada linha 'cliente' com um lead existente. Cada lead casa no máximo com
     1 linha, e a ordem da planilha desempata. São 3 passadas, cada uma sobre a
     folha inteira antes da seguinte:
       P1  CPF (só dígitos, com zeros à esquerda até 11) + bloco/dia + NB
       P2  CPF + nome normalizado
       P3  nome normalizado + bloco/dia
     "bloco/dia": no bloco de ciclo vale lead.dia = dia do bloco; no NOVOS vale
     lead.situacao = 'ativo'. No NB também vale o lead do D07 que ficou com o NB
     gravado em `banco` (erro do import de 17/09: nb e banco trocados). Quando sobra mais de
     um candidato, desempata nesta ordem: CPF igual, nome igual, bloco, NB, meses
     que já batem com `pagamentos`, situação, e por fim o menor id.
  5. Modos:
       --dry-run  (padrão) SÓ LEITURA: imprime contagens agregadas por bloco e o
                  que mudaria, e LISTA cada pagamento que será apagado ou alterado
                  e cada lead que vai pra Lixeira (só os 8 primeiros caracteres do
                  id, bloco, competência, status/valor e updated_at). Não imprime
                  nome, CPF, senha nem telefone.
       --aplicar  exige também --confirmo e papel admin: chama planilha_substituir.
                  Se a planilha já foi carregada, exige também --recarregar (a
                  recarga TRUNCA as 4 tabelas planilha_*: cores, colunas novas, notas).
       --conferir lê planilha_dados + senhas_grade (+ leads/pagamentos) e compara
                  célula a célula com o CSV. Só imprime contagens de divergência.

Uso (a senha só vai por variável de ambiente, nunca em arquivo):
  RV_EMAIL=... RV_SENHA=... python3 scripts/reviza/planilha_substituir.py
  RV_EMAIL=... RV_SENHA=... python3 scripts/reviza/planilha_substituir.py --conferir
  RV_EMAIL=... RV_SENHA=... python3 scripts/reviza/planilha_substituir.py --aplicar --confirmo
  RV_EMAIL=... RV_SENHA=... python3 scripts/reviza/planilha_substituir.py --aplicar --confirmo --recarregar
Opcionais: --csv <arq>, --env <arq> (ou RV_ENV_FILE).

Backup: a própria RPC faz, na MESMA transação, private.bkp_<tabela>_<AAAAMMDD_HHMMSS>
  (leads, pagamentos, lead_segredos, entradas, mov_fin, competencias e as 4 planilha_*)
  e devolve o sufixo em "backup"; o --aplicar imprime o nome. Não crie backup manual
  com o mesmo nome antes.

----------------------------------------------------------------------------
FORMATO DO PAYLOAD: public.planilha_substituir(p jsonb)
chamado como POST {url}/rest/v1/rpc/planilha_substituir  body {"p": <payload>}
----------------------------------------------------------------------------
{
  "versao": 1,
  "origem": "MENSAIS(Planilha1).csv",
  "leads_vistos": 778,           -- nº de leads que o script leu. Trava otimista: o RPC
                                 -- aborta se count(public.leads) for diferente.
  "recarregar": false,           -- true só com --recarregar: sem ele o RPC recusa quando
                                 -- planilha_linhas já tem linhas (carga já feita).
  "blocos": [                    -- na ordem em que aparecem na folha; NOVOS por último
    {"id":"D24","dia":24,"situacao":"cancelado","comp_base":"2025-08"},
    ...                          -- D24..D30 -> comp_base 2025-08; D01..D07 -> 2025-09
    {"id":"NOVOS","dia":null,"situacao":"ativo","comp_base":null}
  ],
  "colunas": [                   -- sempre 25; pos 0..24 = letras A..Y
    {"pos":0,"ordem":1000,"titulo":"DATA FECHAMENTO","tipo":"campo","campo":"fechamento","mes_pos":null,"largura":96},
    ...
    {"pos":10,"ordem":11000,"titulo":"Mês 1","tipo":"mes","campo":null,"mes_pos":0,"largura":84},
    ...                          -- pos 10+k = mes_pos k (k = 0..13)
    {"pos":24,"ordem":25000,"titulo":"TELEFONE","tipo":"campo","campo":"telefone","mes_pos":null,"largura":150}
  ],
  "linhas": [                    -- na ordem da folha; ordem = 1000 * (índice 1-based)
    {"ordem":1000,  "tipo":"cabecalho","bloco":"D24","lead_id":null,    "c":[25 textos]},
    {"ordem":2000,  "tipo":"cliente",  "bloco":"D24","lead_id":"<uuid>","c":[25 textos]},
    {"ordem":3000,  "tipo":"cliente",  "bloco":"D24","lead_id":null,    "c":[...]},  -- null = criar lead
    {"ordem":51000, "tipo":"vazia",    "bloco":null, "lead_id":null,    "c":[...]},
    {"ordem":790000,"tipo":"rotulo",   "bloco":"NOVOS","lead_id":null,  "c":[...]}
  ],
  "remover": ["<uuid>", ...]     -- leads que não casaram com nenhuma linha -> delete
                                 -- (o gatilho manda pra Lixeira; reversível). O RPC só
                                 -- apaga ids DESTA lista: lead criado depois da leitura
                                 -- fica (ganha linha no fim do bloco). Quem aguarda
                                 -- aprovação de débito parado não entra na lista.
}
Resposta (jsonb): contagens + "backup" (sufixo das tabelas private.bkp_*; null = sem backup).
Regras que o RPC aplica ao payload:
  - t[i] é o texto EXATO da coluna pos i, sem trim. '' = sem célula (não grava
    planilha_celulas). Sempre há 25 posições.
  - Linha 'cliente': t[6] (SENHA INSS) e t[8] (RECLAME, texto cru inteiro) são SENHAS
    EM TRÂNSITO. O RPC cifra com a lógica do set_senha ('' limpa) e grava a célula
    dessas 2 colunas com texto NULL. Nas linhas 'cabecalho'/'rotulo' elas são texto
    comum.
  - Linha 'cliente' com lead_id: update do lead pelas regras do §2.2, calculadas no
    SQL (private.pl_*) a partir de t[]. dia/situacao vêm do bloco. Os pagamentos do
    lead são substituídos pelos da planilha: comp = comp_base + mes_pos, e o que não
    estiver lá é apagado, EXCETO um 'fora' cuja célula está vazia ou '-' (a célula
    vazia não tira ninguém de "fora da régua"). Com lead_id null, cria o lead.
    No bloco NOVOS (comp_base null) o mês fica só como texto, e os pagamentos que o
    lead já tem ficam como estão.
  - O script NÃO manda valores já convertidos: a fonte única dos parsers é o SQL.
    Os parsers daqui (§2.1 em Python) só servem para as contagens e o --conferir.
  - lead_id nunca se repete. Todo id em linhas[] e em remover[] existia na leitura.
"""

import argparse
import codecs
import csv
import datetime
import io
import json
import os
import re
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter, defaultdict

REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
CSV_PADRAO = os.path.expanduser('~/Downloads/MENSAIS(Planilha1).csv')
ENV_PADRAO = os.path.join(REPO, '.env.reviza.local')
PROJETO_OK = 'ftexrtyswpdcndbkjbtf'
PROJETO_PROIBIDO = 'afmzuoavvnpfossiiypz'

NCOL = 25          # colunas usadas: 0..24 (A..Y)
MES0 = 10          # 1ª coluna de mês (K)
NMES = 14          # K..X
BLOCOS_CONTRATO = ['D24', 'D25', 'D28', 'D29', 'D30', 'D01', 'D02', 'D05', 'D06', 'D07', 'NOVOS']
P_SENHAS = (6, 8)  # SENHA INSS, RECLAME: nunca viram texto de célula em linha cliente

# (titulo, campo, largura) das colunas 'campo' 0..9; 10..23 = meses; 24 = telefone
_BASE = [
    ('DATA FECHAMENTO', 'fechamento', 96),
    ('COMERCIAL', 'comercial', 104),
    ('CLIENTE', 'nome', 280),
    ('NB', 'nb', 120),
    ('BANCO', 'banco', 110),
    ('CPF', 'cpf', 120),
    ('SENHA INSS', 'senha_inss', 110),
    ('PARCELA TOTAL', 'valor', 104),
    ('RECLAME AQUI', 'reclame', 220),
    ('DATA QUE PAROU', 'parou', 190),
]


def colunas_padrao():
    cols = []
    for pos, (tit, campo, larg) in enumerate(_BASE):
        cols.append({'pos': pos, 'ordem': 1000 * (pos + 1), 'titulo': tit, 'tipo': 'campo',
                     'campo': campo, 'mes_pos': None, 'largura': larg})
    for k in range(NMES):
        pos = MES0 + k
        cols.append({'pos': pos, 'ordem': 1000 * (pos + 1), 'titulo': 'Mês %d' % (k + 1), 'tipo': 'mes',
                     'campo': None, 'mes_pos': k, 'largura': 96})
    cols.append({'pos': 24, 'ordem': 25000, 'titulo': 'TELEFONE', 'tipo': 'campo',
                 'campo': 'telefone', 'mes_pos': None, 'largura': 136})
    assert len(cols) == NCOL
    return cols


def letra(pos):
    s = ''
    n = pos + 1
    while n:
        n, r = divmod(n - 1, 26)
        s = chr(65 + r) + s
    return s


# ---------------------------------------------------------------- parsers §2.1
def sem_acento(s):
    return ''.join(c for c in unicodedata.normalize('NFD', s or '') if unicodedata.category(c) != 'Mn')


def btrim(s):
    """btrim() do Postgres: só espaço comum."""
    return (s or '').strip(' ')


_RE_PL_TRIM = re.compile('^[ \\t\\n\\r\\v\\f\\u00a0]+|[ \\t\\n\\r\\v\\f\\u00a0]+$')


def pl_trim(s):
    """private.pl_trim do SQL: tira espaço, tab, quebra e nbsp das pontas."""
    return _RE_PL_TRIM.sub('', s or '')


def fora_preservado(status_atual, texto):
    """Mesma regra do DELETE de planilha_substituir: um 'fora' fica quando a célula
    do mês está vazia ou é '-' (e a célula não diz pago/nao_pagou)."""
    return status_atual == 'fora' and estado_mes(texto) is None and pl_trim(texto) in ('', '-')


def valor_br(t):
    """Valor BR -> float >= 0 ou None. Não 'conserta' nada: o que não parsear é texto."""
    if t is None:
        return None
    s = re.sub(r'\s+', '', re.sub(r'(?i)r\$', '', t))
    if not s or not re.fullmatch(r'[0-9.,]+', s):
        return None
    if ',' in s:                                  # ',' decimal, '.' milhar
        s2 = s.replace('.', '').replace(',', '.')
    elif '.' in s:
        if re.fullmatch(r'\d{1,3}(\.\d{3})+', s):  # 1.343 / 1.343.500 -> milhar
            s2 = s.replace('.', '')
        else:                                     # 1343.50 -> decimal
            s2 = s
    else:
        s2 = s
    if not re.fullmatch(r'\d+(\.\d+)?', s2):
        return None
    return float(s2)


def eh_nao_pagou(t):
    return sem_acento(btrim(t)).upper() == 'NAO PAGOU'


def estado_mes(t):
    """('nao_pagou', None) | ('pago', valor) | None (sem linha em pagamentos)."""
    if t is None:
        return None
    if eh_nao_pagou(t):
        return ('nao_pagou', None)
    v = valor_br(t)
    if v is not None and v > 0:
        return ('pago', round(v, 2))
    return None


_MESES = {'jan': 1, 'fev': 2, 'mar': 3, 'abr': 4, 'mai': 5, 'jun': 6,
          'jul': 7, 'ago': 8, 'set': 9, 'out': 10, 'nov': 11, 'dez': 12}
_RE_DATA = re.compile(r'(?<!\d)(\d{1,2})/(\d{1,2}(?!\d)|[A-Za-z]{3})\.?(?:/(\d{4}|\d{2})(?!\d))?')


def data_curta(t):
    """1ª data curta achada no texto -> 'YYYY-MM-DD' ou None.
    Aceita DD/mmm (pt, com/sem ponto), DD/MM, DD/MM/YYYY, DD/MM/YY.
    Sem ano: out-dez -> 2025, jan-set -> 2026."""
    if not t:
        return None
    for m in _RE_DATA.finditer(t):
        d = int(m.group(1))
        mm = m.group(2)
        if mm.isdigit():
            mes = int(mm)
        else:
            mes = _MESES.get(sem_acento(mm).lower())
            if mes is None:
                continue
        a = m.group(3)
        if a:
            ano = int(a) + (2000 if len(a) == 2 else 0)
        else:
            ano = 2025 if mes >= 10 else 2026
        try:
            return datetime.date(ano, mes, d).isoformat()
        except ValueError:
            continue
    return None


def telefone(t):
    """1ª sequência com 10-13 dígitos (ignorando ()-. e espaço) ou None."""
    for run in re.findall(r'[\d()\-. ]+', t or ''):
        dig = re.sub(r'\D', '', run)
        if 10 <= len(dig) <= 13:
            return dig
    return None


def comp_soma(base, k):
    y, m = base.split('-')
    n = int(y) * 12 + int(m) - 1 + k
    return '%04d-%02d' % (n // 12, n % 12 + 1)


# ---------------------------------------------------------- normalização (casamento)
def so_digitos(s):
    return re.sub(r'\D', '', s or '')


def cpf_chave(s):
    d = so_digitos(s)
    if not d:
        return None
    return d.zfill(11) if len(d) < 11 else d


def nome_chave(s):
    s = sem_acento(s or '').upper()
    s = re.sub(r'[^A-Z0-9 ]', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()


def nb_chave(s):
    d = so_digitos(s)
    if d:
        return d.lstrip('0') or '0'
    return nome_chave(s)


# ------------------------------------------------------------------- CSV -> folha
_CP1252_INDEFINIDOS = (0x81, 0x8D, 0x8F, 0x90, 0x9D)


def _cp1252_ou_latin1(exc):
    """Handler de decode: só os bytes que o cp1252 não define viram o caractere do
    latin1 (U+0081 etc.), um a um. Qualquer outro erro sobe."""
    if isinstance(exc, UnicodeDecodeError):
        ruim = exc.object[exc.start:exc.end]
        if all(b in _CP1252_INDEFINIDOS for b in ruim):
            return ''.join(chr(b) for b in ruim), exc.end
    raise exc


codecs.register_error('planilha_cp1252_latin1', _cp1252_ou_latin1)


def ler_csv(caminho):
    """-> (linhas de 25 textos, info). info = bytes 0x80-0x9F decodificados como cp1252
    e os indefinidos que caíram no latin1 (só contagem; nada de conteúdo)."""
    with open(caminho, 'rb') as f:
        bruto = f.read()
    txt = bruto.decode('cp1252', errors='planilha_cp1252_latin1')
    faixa = [b for b in bruto if 0x80 <= b <= 0x9F]
    info = {'bytes_80_9f': len(faixa), 'indefinidos_latin1': sum(1 for b in faixa if b in _CP1252_INDEFINIDOS)}
    rows = list(csv.reader(io.StringIO(txt, newline=''), delimiter=';'))
    extra = sum(1 for r in rows for c in r[NCOL:] if c != '')
    if extra:
        raise SystemExit('ERRO: há %d células preenchidas depois da coluna Y; o contrato diz 0..24.' % extra)
    return [(r + [''] * NCOL)[:NCOL] for r in rows], info


def eh_vazia(r):
    return all(c.strip() == '' for c in r)


def eh_cabecalho(r):
    return nome_chave(r[0]) == 'DATA FECHAMENTO' and nome_chave(r[2]) == 'CLIENTE'


def eh_rotulo_novos(r):
    return nome_chave(r[2]) == 'NOVOS' and all(r[i].strip() == '' for i in (0, 1, 3, 4, 5, 6, 7, 8, 9))


def _mes_do_texto(t):
    m = re.match(r'\s*\d{1,2}/(\d{1,2}|[A-Za-z]{3})', t or '')
    if not m:
        return None
    g = m.group(1)
    return int(g) if g.isdigit() else _MESES.get(g.lower())


def montar_folha(rows):
    """-> (blocos, linhas, avisos). linhas: dicts {r, ordem, tipo, bloco, t}."""
    fim = len(rows)
    while fim > 0 and eh_vazia(rows[fim - 1]):
        fim -= 1
    blocos, linhas, avisos = [], [], []
    ids = set()
    atual = None
    for r in range(fim):
        row = rows[r]
        if eh_cabecalho(row):
            dia = None
            for pos in range(MES0 + NMES - 1, MES0 - 1, -1):   # último mês com dia legível
                m = re.match(r'\s*(\d{1,2})/', row[pos])
                if m:
                    dia = int(m.group(1))
                    break
            if dia is None or not 1 <= dia <= 31:
                raise SystemExit('ERRO: cabeçalho na linha CSV %d sem data legível no último mês.' % r)
            bid = 'D%02d' % dia
            if bid in ids:
                raise SystemExit('ERRO: bloco %s repetido (linha CSV %d).' % (bid, r))
            base = '2025-08' if dia >= 15 else '2025-09'
            mes_c10 = _mes_do_texto(row[MES0])
            if mes_c10 is not None and mes_c10 != int(base[5:]):
                avisos.append('bloco %s: cabeçalho da coluna K fala do mês %d, comp_base %s (vale a posição)'
                              % (bid, mes_c10, base))
            blocos.append({'id': bid, 'dia': dia, 'situacao': 'cancelado', 'comp_base': base, '_r': r})
            ids.add(bid)
            atual = bid
            linhas.append({'r': r, 'tipo': 'cabecalho', 'bloco': bid, 't': list(row)})
        elif eh_vazia(row):
            linhas.append({'r': r, 'tipo': 'vazia', 'bloco': None, 't': list(row)})
        elif eh_rotulo_novos(row):
            if 'NOVOS' in ids:
                raise SystemExit('ERRO: segundo rótulo NOVOS na linha CSV %d.' % r)
            blocos.append({'id': 'NOVOS', 'dia': None, 'situacao': 'ativo', 'comp_base': None, '_r': r})
            ids.add('NOVOS')
            atual = 'NOVOS'
            linhas.append({'r': r, 'tipo': 'rotulo', 'bloco': 'NOVOS', 't': list(row)})
        else:
            if atual is None:
                raise SystemExit('ERRO: linha de dados antes do 1º cabeçalho (linha CSV %d).' % r)
            linhas.append({'r': r, 'tipo': 'cliente', 'bloco': atual, 't': list(row)})
    for i, ln in enumerate(linhas):
        ln['ordem'] = 1000 * (i + 1)
    ordem_ids = [b['id'] for b in blocos]
    if ordem_ids != BLOCOS_CONTRATO:
        avisos.append('ESTRUTURA DIFERENTE DO CONTRATO: blocos %s (esperado %s)' % (ordem_ids, BLOCOS_CONTRATO))
    return blocos, linhas, avisos


# ---------------------------------------------------------------------- REST
class ErroApi(Exception):
    def __init__(self, status, corpo):
        self.status = status
        self.corpo = corpo if isinstance(corpo, dict) else {}
        msg = self.corpo.get('message') or self.corpo.get('msg') or self.corpo.get('error_description') or ''
        code = self.corpo.get('code') or self.corpo.get('error_code') or self.corpo.get('error') or ''
        super().__init__('HTTP %s %s %s' % (status, code, str(msg)[:300]))


def ler_env(caminho):
    if not os.path.exists(caminho):
        raise SystemExit('ERRO: não achei %s' % caminho)
    env = {}
    with open(caminho, encoding='utf-8') as f:
        for ln in f:
            ln = ln.strip()
            if not ln or ln.startswith('#') or '=' not in ln:
                continue
            k, v = ln.split('=', 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    url = (env.get('VITE_SUPABASE_URL') or '').rstrip('/')
    anon = env.get('VITE_SUPABASE_ANON_KEY') or ''
    if not url or not anon:
        raise SystemExit('ERRO: VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY ausentes em %s' % caminho)
    if PROJETO_PROIBIDO in url or PROJETO_OK not in url:
        raise SystemExit('ERRO: o .env não aponta para o projeto %s. Abortado.' % PROJETO_OK)
    return url, anon


class Api:
    def __init__(self, url, anon):
        self.url = url
        self.anon = anon
        self.token = None
        self.uid = None

    def _req(self, metodo, caminho, corpo=None, extra=None, timeout=60):
        h = {'apikey': self.anon, 'Content-Type': 'application/json', 'Accept': 'application/json'}
        if self.token:
            h['Authorization'] = 'Bearer ' + self.token
        if extra:
            h.update(extra)
        dados = None if corpo is None else json.dumps(corpo, ensure_ascii=False).encode('utf-8')
        req = urllib.request.Request(self.url + caminho, data=dados, method=metodo, headers=h)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                bruto = resp.read()
                return json.loads(bruto) if bruto else None
        except urllib.error.HTTPError as e:
            bruto = e.read()
            try:
                j = json.loads(bruto)
            except Exception:
                j = None
            raise ErroApi(e.code, j)

    def login(self, email, senha):
        j = self._req('POST', '/auth/v1/token?grant_type=password', {'email': email, 'password': senha})
        self.token = j.get('access_token')
        self.uid = (j.get('user') or {}).get('id')
        if not self.token:
            raise SystemExit('ERRO: login sem access_token.')

    def rpc(self, nome, args=None, timeout=60):
        return self._req('POST', '/rest/v1/rpc/' + nome, args or {}, timeout=timeout)

    def listar(self, tabela, select):
        """Keyset por id (o PostgREST corta em 1000 linhas)."""
        out, ultimo = [], None
        while True:
            q = {'select': select, 'order': 'id.asc', 'limit': '1000'}
            if ultimo is not None:
                q['id'] = 'gt.' + ultimo
            lote = self._req('GET', '/rest/v1/%s?%s' % (tabela, urllib.parse.urlencode(q, safe='.,*()')))
            out.extend(lote)
            if len(lote) < 1000:
                return out
            ultimo = lote[-1]['id']


def conectar(args):
    url, anon = ler_env(args.env)
    email, senha = os.environ.get('RV_EMAIL'), os.environ.get('RV_SENHA')
    if not email or not senha:
        raise SystemExit('ERRO: defina RV_EMAIL e RV_SENHA no ambiente (nunca em arquivo).')
    api = Api(url, anon)
    try:
        api.login(email, senha)
    except ErroApi as e:
        raise SystemExit('ERRO no login: HTTP %s' % e.status)
    try:
        papel = api.rpc('current_papel')
    except ErroApi:
        papel = None
    return api, papel


SEL_LEADS_CASAR = 'id,nome,cpf,nb,banco,dia,situacao,comercial,parado_pendente'
SEL_LEADS_CONF = SEL_LEADS_CASAR + ',valor,fechamento,parou,data_parou,data_reclamacao,telefone'


def pagamentos_por_lead(api):
    """-> {lead_id: {comp: (status, valor, updated_at)}}"""
    pg = defaultdict(dict)
    for p in api.listar('pagamentos', 'id,lead_id,comp,status,valor,updated_at'):
        pg[p['lead_id']][p['comp']] = (p['status'], None if p['valor'] is None else round(float(p['valor']), 2),
                                       p.get('updated_at'))
    return pg


def planilha_carregada(api):
    """True/False = planilha_linhas tem/não tem linha visível; None = não deu pra saber
    (mig 57 ainda não aplicada, ou erro). A trava de verdade é a do RPC."""
    try:
        return bool(api._req('GET', '/rest/v1/planilha_linhas?select=id&limit=1'))
    except ErroApi:
        return None


_BRT = datetime.timezone(datetime.timedelta(hours=-3))
_RE_TS = re.compile(r'(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|[+-]\d{2}(?::?\d{2})?)?')


def quando(ts):
    """timestamptz do PostgREST -> 'DD/MM/AA HH:MM' em Brasília (o texto cru se não parsear)."""
    m = _RE_TS.match(ts or '')
    if not m:
        return ts or '-'
    y, mo, d, h, mi, s, tz = m.groups()
    off = datetime.timedelta(0)
    if tz and tz != 'Z':
        sinal = -1 if tz[0] == '-' else 1
        dig = tz[1:].replace(':', '')
        off = sinal * datetime.timedelta(hours=int(dig[:2]), minutes=int(dig[2:4] or 0))
    dt = datetime.datetime(int(y), int(mo), int(d), int(h), int(mi), int(s or 0), tzinfo=datetime.timezone(off))
    return dt.astimezone(_BRT).strftime('%d/%m/%y %H:%M')


# ------------------------------------------------------------------ casamento
def bloco_do_lead(ld):
    if ld.get('situacao') == 'ativo':
        return 'NOVOS'
    if ld.get('dia') is None:
        return '(sem dia)'
    return 'D%02d' % int(ld['dia'])


def casar(linhas, blocos, leads, pags):
    """-> {idx_linha: (lead_id, passada, n_candidatos, empate_real)}"""
    bmap = {b['id']: b for b in blocos}
    L = []
    for ld in leads:
        L.append({'id': ld['id'], 'cpf': cpf_chave(ld.get('cpf')), 'nome': nome_chave(ld.get('nome')),
                  'nb': nb_chave(ld.get('nb')), 'banco_nb': nb_chave(ld.get('banco')) if so_digitos(ld.get('banco')) else '',
                  'dia': ld.get('dia'), 'sit': ld.get('situacao')})
    por_cpf, por_nome = defaultdict(list), defaultdict(list)
    for x in L:
        if x['cpf']:
            por_cpf[x['cpf']].append(x)
        if x['nome']:
            por_nome[x['nome']].append(x)

    R = {}
    for i, ln in enumerate(linhas):
        if ln['tipo'] != 'cliente':
            continue
        t = ln['t']
        R[i] = {'cpf': cpf_chave(t[5]), 'nome': nome_chave(t[2]), 'nb': nb_chave(t[3]), 'bloco': bmap[ln['bloco']],
                'meses': [estado_mes(t[MES0 + k]) for k in range(NMES)]}

    def compat(x, b):
        return x['sit'] == 'ativo' if b['id'] == 'NOVOS' else (x['dia'] is not None and int(x['dia']) == b['dia'])

    def nb_eq(r, x):
        if r['nb'] == x['nb']:
            return True
        # import D07 de 17/09: NB gravado em `banco` (e o nome do banco em `nb`)
        return r['nb'] != '' and x['banco_nb'] == r['nb']

    def pag_sim(r, x):
        b = r['bloco']
        if not b['comp_base']:
            return 0
        pl = pags.get(x['id'], {})
        n = 0
        for k, est in enumerate(r['meses']):
            atual = pl.get(comp_soma(b['comp_base'], k))
            if est is None and atual is None:
                continue
            if est is not None and atual is not None and est[0] == atual[0] and (est[0] != 'pago' or est[1] == atual[1]):
                n += 1
        return n

    def placar(r, x):
        return (1 if (r['cpf'] and r['cpf'] == x['cpf']) else 0,
                1 if (r['nome'] and r['nome'] == x['nome']) else 0,
                1 if compat(x, r['bloco']) else 0,
                1 if nb_eq(r, x) else 0,
                pag_sim(r, x),
                1 if x['sit'] == r['bloco']['situacao'] else 0)

    passadas = [
        ('P1', lambda r: por_cpf.get(r['cpf'], []) if r['cpf'] else [],
         lambda r, x: compat(x, r['bloco']) and nb_eq(r, x)),
        ('P2', lambda r: por_cpf.get(r['cpf'], []) if r['cpf'] else [],
         lambda r, x: bool(r['nome']) and r['nome'] == x['nome']),
        ('P3', lambda r: por_nome.get(r['nome'], []) if r['nome'] else [],
         lambda r, x: compat(x, r['bloco'])),
    ]
    usados, res = set(), {}
    for nome_p, cands_de, ok in passadas:
        for i in sorted(R):
            if i in res:
                continue
            r = R[i]
            cands = [x for x in cands_de(r) if x['id'] not in usados and ok(r, x)]
            if not cands:
                continue
            cands.sort(key=lambda x: (tuple(-v for v in placar(r, x)), x['id']))
            empate = len(cands) > 1 and placar(r, cands[0]) == placar(r, cands[1])
            res[i] = (cands[0]['id'], nome_p, len(cands), empate)
            usados.add(cands[0]['id'])
    return res


def leads_sem_linha(leads, casados):
    """-> (remover, pendentes). Quem aguarda aprovação de débito parado fica (o RPC
    mantém com manter_pendentes=true, o padrão) e ganha linha no fim de NOVOS."""
    usados = {v[0] for v in casados.values()}
    sobra = [ld for ld in leads if ld['id'] not in usados]
    return [ld for ld in sobra if not ld.get('parado_pendente')], [ld for ld in sobra if ld.get('parado_pendente')]


def montar_payload(blocos, colunas, linhas, casados, leads):
    remover = [ld['id'] for ld in leads_sem_linha(leads, casados)[0]]
    return {
        'versao': 1,
        'origem': 'MENSAIS(Planilha1).csv',
        'leads_vistos': len(leads),     # trava otimista (o RPC compara com count(public.leads))
        'recarregar': False,            # --aplicar --recarregar liga
        'blocos': [{k: b[k] for k in ('id', 'dia', 'situacao', 'comp_base')} for b in blocos],
        'colunas': colunas,
        'linhas': [{'ordem': ln['ordem'], 'tipo': ln['tipo'], 'bloco': ln['bloco'],
                    'lead_id': casados[i][0] if i in casados else None, 'c': ln['t']}   # 'c' = chave que o SQL (mig 57) lê
                   for i, ln in enumerate(linhas)],
        'remover': remover,             # o RPC só apaga ids desta lista
    }


# ------------------------------------------------------------------- relatório
def brl(v):
    s = '{:,.2f}'.format(v).replace(',', '_').replace('.', ',').replace('_', '.')
    return 'R$ ' + (s[:-3] if s.endswith(',00') else s)


def tabela(cab, linhas_tab, alinhar_esq=False):
    larg = [max(len(str(x)) for x in col) for col in zip(cab, *linhas_tab)] if linhas_tab else [len(c) for c in cab]
    fmt = '  '.join('{:>%d}' % w if j and not alinhar_esq else '{:<%d}' % w for j, w in enumerate(larg))
    print(fmt.format(*cab))
    print('  '.join('-' * w for w in larg))
    for ln in linhas_tab:
        print(fmt.format(*[str(x) for x in ln]))


def estatisticas_folha(blocos, linhas):
    bmap = {b['id']: b for b in blocos}
    st = Counter()
    soma_total = soma_pg = 0.0
    for ln in linhas:
        if ln['tipo'] != 'cliente':
            continue
        t = ln['t']
        st['clientes'] += 1
        p = t[7]
        if p.strip() == '':
            st['parcela_vazia'] += 1
        elif valor_br(p) is None:
            st['parcela_nao_num'] += 1
        else:
            st['parcela_num'] += 1
        novos = bmap[ln['bloco']]['comp_base'] is None
        for k in range(NMES):
            e = estado_mes(t[MES0 + k])
            if e is None:
                st['mes_nada'] += 1
            elif e[0] == 'nao_pagou':
                st['mes_nao_pagou'] += 1
            else:
                st['mes_pago'] += 1
                soma_total += e[1]
                if novos:
                    st['mes_pago_novos'] += 1
                else:
                    soma_pg += e[1]
            if novos and e is not None:
                st['mes_estado_novos'] += 1
        if t[24].strip():
            st['col_y_preenchida'] += 1
            if telefone(t[24]):
                st['col_y_telefone'] += 1
        if t[0].strip():
            st['fech_preenchido'] += 1
            if data_curta(t[0]):
                st['fech_data'] += 1
        if t[8].strip():
            st['reclame_preenchido'] += 1
            if data_curta(t[8]):
                st['reclame_data'] += 1
        if t[9].strip():
            st['parou_preenchido'] += 1
            if data_curta(t[9]):
                st['parou_data'] += 1
        if not btrim(t[2]):
            st['cliente_sem_nome'] += 1
    return st, soma_total, soma_pg


def modo_dry_run(args):
    rows, info_csv = ler_csv(args.csv)
    blocos, linhas, avisos = montar_folha(rows)
    colunas = colunas_padrao()
    api, papel = conectar(args)
    leads = api.listar('leads', SEL_LEADS_CASAR)
    pags = pagamentos_por_lead(api)
    casados = casar(linhas, blocos, leads, pags)
    payload = montar_payload(blocos, colunas, linhas, casados, leads)
    carregada = planilha_carregada(api)

    print('== planilha_substituir: DRY-RUN (só leitura; nada foi gravado) ==')
    print('papel do login: %s | leads lidos: %d | leads com pagamentos: %d' % (papel, len(leads), len(pags)))
    if papel != 'admin':
        print('AVISO: o login não é admin. --aplicar vai recusar, e um papel sem visão total '
              'distorce as contagens de "a remover".')
    for a in avisos:
        print('AVISO:', a)
    print('CSV: %d linhas lidas, %d na folha (%d vazias do fim ignoradas) | cp1252: %d bytes 0x80-0x9F '
          '(%d indefinidos lidos como latin1)'
          % (len(rows), len(linhas), len(rows) - (linhas[-1]['r'] + 1), info_csv['bytes_80_9f'],
             info_csv['indefinidos_latin1']))
    print('planilha no banco: %s' % {True: 'JÁ CARREGADA (o --aplicar exige --recarregar)',
                                     False: 'vazia (1ª carga)',
                                     None: 'não deu pra ler planilha_linhas (mig 57 aplicada?)'}[carregada])
    print()

    remover_lds, pendentes = leads_sem_linha(leads, casados)
    remover_por = Counter(bloco_do_lead(ld) for ld in remover_lds)
    linhas_por, cli_por, cas_por, criar_por, amb_por, emp_por = (Counter() for _ in range(6))
    pass_por = defaultdict(Counter)
    for i, ln in enumerate(linhas):
        if ln['bloco'] is None:
            continue
        b = ln['bloco']
        linhas_por[b] += 1
        if ln['tipo'] != 'cliente':
            continue
        cli_por[b] += 1
        if i in casados:
            lid, p, n, emp = casados[i]
            cas_por[b] += 1
            pass_por[b][p] += 1
            if n > 1:
                amb_por[b] += 1
            if emp:
                emp_por[b] += 1
        else:
            criar_por[b] += 1
    ordem_b = [b['id'] for b in blocos] + sorted(k for k in remover_por if k not in {b['id'] for b in blocos})
    tab = []
    tot = Counter()
    for b in ordem_b:
        ln = [b, linhas_por[b], cli_por[b], cas_por[b], pass_por[b]['P1'], pass_por[b]['P2'], pass_por[b]['P3'],
              criar_por[b], remover_por[b], amb_por[b], emp_por[b]]
        tab.append(ln)
        for j, k in enumerate(('linhas', 'clientes', 'casados', 'P1', 'P2', 'P3', 'criar', 'remover', 'amb', 'emp')):
            tot[k] += ln[j + 1]
    tab.append(['TOTAL', tot['linhas'], tot['clientes'], tot['casados'], tot['P1'], tot['P2'], tot['P3'],
                tot['criar'], tot['remover'], tot['amb'], tot['emp']])
    tabela(['bloco', 'linhas', 'clientes', 'casados', 'P1', 'P2', 'P3', 'a criar', 'a remover', 'ambíguos', 'empate'],
           tab)
    print('  linhas = cabeçalho/rótulo + clientes do bloco (vazias ficam sem bloco: %d)'
          % sum(1 for ln in linhas if ln['tipo'] == 'vazia'))
    print('  a remover = leads que não casaram, pelo bloco ATUAL deles no banco (vão pra Lixeira; lista abaixo)')
    print('  ambíguos = linhas com mais de um lead candidato na passada que casou; '
          'empate = o desempate chegou até o menor id')
    print()

    st, soma_total, soma_pg = estatisticas_folha(blocos, linhas)
    print('== células (linhas cliente) ==')
    print('PARCELA TOTAL: %d numéricas, %d NÃO numéricas (valor do lead não muda), %d vazias'
          % (st['parcela_num'], st['parcela_nao_num'], st['parcela_vazia']))
    print('meses (%d células): pago %d | nao_pagou %d | nada %d'
          % (st['clientes'] * NMES, st['mes_pago'], st['mes_nao_pagou'], st['mes_nada']))
    print('soma dos pagos na folha: %s (vira pagamento: %s; %d células pagas no NOVOS ficam só texto: '
          'comp_base null)' % (brl(soma_total), brl(soma_pg), st['mes_pago_novos']))
    print('col Y: %d preenchidas, %d com telefone extraível | fechamento: %d/%d com data | '
          'reclame: %d/%d com data | parou: %d/%d com data | clientes sem nome: %d'
          % (st['col_y_preenchida'], st['col_y_telefone'], st['fech_data'], st['fech_preenchido'],
             st['reclame_data'], st['reclame_preenchido'], st['parou_data'], st['parou_preenchido'],
             st['cliente_sem_nome']))
    print()

    # o que acontece com pagamentos (regra: substitui pelos da planilha)
    pg, mudancas = simular_pagamentos(blocos, linhas, casados, pags)
    print('== pagamentos (substituídos pelos da planilha) ==')
    print('iguais %d | a inserir %d | a alterar %d | a apagar %d | "fora" mantido (célula vazia ou "-") %d | '
          'de leads em NOVOS, ficam como estão %d'
          % (pg['iguais'], pg['inserir'], pg['alterar'], pg['apagar'], pg['fora_mantido'], pg['novos_mantidos']))
    ap_pagos = [m for m in mudancas if m['acao'] == 'apagar' and m['st'] == 'pago']
    print('  entre os apagados: %d pagos (%s) | %d nao_pagou | %d fora'
          % (len(ap_pagos), brl(sum(m['v'] or 0 for m in ap_pagos)),
             sum(1 for m in mudancas if m['acao'] == 'apagar' and m['st'] == 'nao_pagou'),
             sum(1 for m in mudancas if m['acao'] == 'apagar' and m['st'] == 'fora')))
    if mudancas:
        print()
        print('-- cada pagamento que será APAGADO ou ALTERADO (mais recente primeiro; updated_at em Brasília) --')
        tabela(['lead', 'bloco', 'comp', 'atual', 'novo', 'updated_at', 'por quê'],
               [[m['lead'][:8], m['bloco'], m['comp'], fmt_pg(m['st'], m['v']),
                 '(apaga)' if m['acao'] == 'apagar' else fmt_pg(m['st_novo'], m['v_novo']),
                 quando(m['upd']), m['motivo']]
                for m in sorted(mudancas, key=lambda m: (m['upd'] or '', m['lead'], m['comp']), reverse=True)],
               alinhar_esq=True)
        print('  alterar reescreve também pago_em (agora) e confirmado_por (o admin da carga).')
    print()

    # leads sem linha: Lixeira (reversível) ou ficam (aguardam aprovação)
    remover_ids = set(payload['remover'])
    rem = [ld for ld in leads if ld['id'] in remover_ids]
    na_lixeira = sum(len(pags.get(ld['id'], {})) for ld in rem)
    print('== leads que vão pra Lixeira (sem linha na folha; reversível) ==')
    if not rem:
        print('nenhum')
    else:
        ordem_bl = {b: j for j, b in enumerate(ordem_b)}
        tab_r = []
        for ld in sorted(rem, key=lambda x: (ordem_bl.get(bloco_do_lead(x), 99), x['id'])):
            pl = pags.get(ld['id'], {})
            pagos = [a for a in pl.values() if a[0] == 'pago']
            tab_r.append([ld['id'][:8], bloco_do_lead(ld), len(pl), len(pagos), brl(sum(a[1] or 0 for a in pagos))])
        tabela(['lead', 'bloco atual', 'pagamentos', 'pagos', 'soma dos pagos'], tab_r, alinhar_esq=True)
        print('  total: %d leads, %d pagamentos vão junto pra Lixeira' % (len(rem), na_lixeira))
    if pendentes:
        print('ficam sem linha na folha (aguardam aprovação de débito parado; vão pro fim de NOVOS): %d'
              % len(pendentes))
    print()
    print('colunas: ' + ' '.join('%s=%s(%d)' % (letra(c['pos']), c['campo'] or ('m%d' % c['mes_pos']), c['largura'])
                                 for c in colunas))
    print('payload: %d blocos, %d colunas, %d linhas, %d a remover, leads_vistos %d, %.0f KB (não gravado)'
          % (len(payload['blocos']), len(payload['colunas']), len(payload['linhas']), len(payload['remover']),
             payload['leads_vistos'], len(json.dumps({'p': payload}, ensure_ascii=False).encode('utf-8')) / 1024))
    return payload, avisos, papel, api, carregada


def fmt_pg(st, v):
    if st == 'pago':
        return 'pago ' + (brl(v) if v is not None else '(sem valor)')
    return st or '-'


def simular_pagamentos(blocos, linhas, casados, pags):
    """Espelha o que planilha_substituir faz em public.pagamentos (sem rede).
    -> (contagens, mudanças). Cada mudança: {acao: apagar|alterar, lead, bloco, comp,
    st, v, upd, st_novo, v_novo, motivo}. Só ids e valores: nada de nome/CPF/telefone."""
    bmap = {b['id']: b for b in blocos}
    pg = Counter()
    mud = []
    for i, ln in enumerate(linhas):
        if ln['tipo'] != 'cliente':
            continue
        b = bmap[ln['bloco']]
        lid = casados[i][0] if i in casados else None
        atual = dict(pags.get(lid, {})) if lid else {}
        if not b['comp_base']:
            # NOVOS: o mês fica só como texto e o RPC não mexe nos pagamentos do lead
            pg['novos_mantidos'] += len(atual)
            continue
        for k in range(NMES):
            t = ln['t'][MES0 + k]
            e = estado_mes(t)
            comp = comp_soma(b['comp_base'], k)
            a = atual.pop(comp, None)
            if e is None:
                if a is None:
                    continue
                if fora_preservado(a[0], t):
                    pg['fora_mantido'] += 1
                    continue
                pg['apagar'] += 1
                mud.append({'acao': 'apagar', 'lead': lid, 'bloco': b['id'], 'comp': comp, 'st': a[0], 'v': a[1],
                            'upd': a[2], 'st_novo': None, 'v_novo': None,
                            'motivo': 'célula vazia' if pl_trim(t) == '' else 'célula sem pago/NÃO PAGOU'})
            elif a is None:
                pg['inserir'] += 1
            elif (a[0], a[1]) == e:        # o upsert compara (status, valor); nao_pagou vai com valor null
                pg['iguais'] += 1
            else:
                pg['alterar'] += 1
                mud.append({'acao': 'alterar', 'lead': lid, 'bloco': b['id'], 'comp': comp, 'st': a[0], 'v': a[1],
                            'upd': a[2], 'st_novo': e[0], 'v_novo': e[1],
                            'motivo': 'status' if a[0] != e[0] else 'valor'})
        for comp, a in atual.items():      # competências fora das 14 colunas do bloco: o RPC apaga
            pg['apagar'] += 1
            mud.append({'acao': 'apagar', 'lead': lid, 'bloco': b['id'], 'comp': comp, 'st': a[0], 'v': a[1],
                        'upd': a[2], 'st_novo': None, 'v_novo': None, 'motivo': 'fora das 14 colunas do bloco'})
    return pg, mud


def modo_aplicar(args):
    if not args.confirmo:
        raise SystemExit('ERRO: --aplicar exige também --confirmo.')
    payload, avisos, papel, api, carregada = modo_dry_run(args)
    print()
    if any(a.startswith('ESTRUTURA') for a in avisos):
        raise SystemExit('ABORTADO: a estrutura do CSV difere do contrato.')
    if papel != 'admin':
        raise SystemExit('ABORTADO: planilha_substituir é só para admin (papel atual: %s).' % papel)
    if carregada and not args.recarregar:
        raise SystemExit('ABORTADO: a planilha já foi carregada. Recarregar TRUNCA as 4 tabelas planilha_* '
                         '(cores, colunas novas, larguras, notas) e refaz os pagamentos pela folha; se é isso '
                         'mesmo, rode de novo com --recarregar.')
    payload['recarregar'] = bool(args.recarregar)
    if payload['recarregar']:
        print('RECARGA: o que a equipe fez na grade desde a última carga será substituído pela folha '
              '(fica só no backup que a RPC faz agora).')
    print('Chamando planilha_substituir (a RPC faz o backup na mesma transação) ...')
    try:
        res = api.rpc('planilha_substituir', {'p': payload}, timeout=330)
    except ErroApi as e:
        raise SystemExit('ERRO no RPC (nada foi aplicado, a transação é única): %s' % e)
    if isinstance(res, dict):
        seguro = {k: v for k, v in res.items() if isinstance(v, (int, float, bool))}
        print('resultado:', json.dumps(seguro, ensure_ascii=False, sort_keys=True))
        if isinstance(res.get('por_bloco'), dict):
            print('por bloco:', json.dumps(res['por_bloco'], ensure_ascii=False, sort_keys=True))
        bkp = res.get('backup')
        if isinstance(bkp, str) and bkp:
            nome = bkp if bkp.startswith('bkp_') or '.' in bkp else 'private.bkp_<tabela>_%s' % bkp
            print('backup: %s' % nome)
        else:
            print('AVISO: a RPC não devolveu o nome do backup (backup=%s).' % json.dumps(bkp))
        if isinstance(res.get('removidos'), int) and res['removidos'] != len(payload['remover']):
            print('AVISO: o dry-run previa %d leads pra Lixeira e a RPC removeu %d.'
                  % (len(payload['remover']), res['removidos']))
    else:
        print('resultado recebido (tipo %s)' % type(res).__name__)
    aplicar_layout(api)
    print('Rode agora --conferir.')


def aplicar_layout(api):
    """Layout pedido pelo dono em 25/09 (mig 60): TELEFONE logo depois do CPF e com título
    nos cabeçalhos dos blocos. A carga monta as colunas na ordem do CSV (telefone no fim),
    então isto roda depois dela, pelas mesmas RPCs da tela."""
    try:
        d = api.rpc('planilha_dados', {})
        cols = sorted(d.get('colunas') or [], key=lambda c: float(c.get('ordem') or 0))
        cpf = next((c for c in cols if c.get('campo') == 'cpf'), None)
        tel = next((c for c in cols if c.get('campo') == 'telefone'), None)
        if cpf and tel:
            depois = [c for c in cols if float(c['ordem']) > float(cpf['ordem']) and c['id'] != tel['id']]
            if depois and float(tel['ordem']) > float(depois[0]['ordem']):
                nova = (float(cpf['ordem']) + float(depois[0]['ordem'])) / 2
                api.rpc('planilha_coluna_alterar', {'p_coluna': tel['id'], 'p_patch': {'ordem': nova}})
            itens = [{'l': l['id'], 'c': tel['id'], 't': 'TELEFONE'} for l in (d.get('linhas') or [])
                     if l.get('tipo') == 'cabecalho' and not ((l.get('c') or {}).get(tel['id']) or [None])[0]]
            if itens:
                api.rpc('planilha_salvar', {'p_itens': itens, 'p_origem': 'layout'})
            print('layout: TELEFONE depois do CPF; título em %d cabeçalho(s).' % len(itens))
    except ErroApi as e:
        print('AVISO: não deu pra aplicar o layout do telefone (%s) — rode a mig 60 de novo.' % e)


# -------------------------------------------------------------------- conferir
def _nz(v):
    if v is None:
        return ''
    return str(v)


def modo_conferir(args):
    rows, _info = ler_csv(args.csv)
    blocos, linhas, avisos = montar_folha(rows)
    api, papel = conectar(args)
    print('== planilha_substituir: CONFERIR (só leitura + 1 registro de auditoria "revelou_grade") ==')
    print('papel do login: %s' % papel)
    for a in avisos:
        print('AVISO:', a)
    try:
        dados = api.rpc('planilha_dados', timeout=120)
    except ErroApi as e:
        raise SystemExit('ERRO em planilha_dados: %s' % e)
    try:
        senhas = {s['lead_id']: (s.get('inss'), s.get('reclame')) for s in (api.rpc('senhas_grade', timeout=120) or [])}
    except ErroApi as e:
        print('AVISO: senhas_grade falhou (%s); colunas de senha não conferidas.' % e)
        senhas = None
    leads = {ld['id']: ld for ld in api.listar('leads', SEL_LEADS_CONF)}
    pags = pagamentos_por_lead(api)
    relatorio_conferir(blocos, linhas, dados, senhas, leads, pags)


def relatorio_conferir(blocos, linhas, dados, senhas, leads, pags):
    """Compara (sem rede) o que veio do banco com a folha do CSV. Só imprime contagens."""
    # estrutura: blocos
    esp_b = {b['id']: b for b in blocos}
    got_b = {b['id']: b for b in (dados.get('blocos') or [])}
    div_b = sum(1 for bid, b in esp_b.items()
                if bid not in got_b or any(_nz(got_b[bid].get(k)) != _nz(b[k]) for k in ('dia', 'situacao', 'comp_base')))
    print('blocos: esperados %d, no banco %d, divergentes/ausentes %d, extras %d'
          % (len(esp_b), len(got_b), div_b, len(set(got_b) - set(esp_b))))

    # estrutura: colunas -> posição do CSV
    campo_pos = {c['campo']: c['pos'] for c in colunas_padrao() if c['campo']}
    col_pos, livres, fora = {}, 0, 0
    for c in dados.get('colunas') or []:
        if c.get('tipo') == 'campo' and c.get('campo') in campo_pos:
            col_pos[c['id']] = campo_pos[c['campo']]
        elif c.get('tipo') == 'mes' and c.get('mes_pos') is not None and int(c['mes_pos']) < NMES:
            col_pos[c['id']] = MES0 + int(c['mes_pos'])
        elif c.get('tipo') == 'livre':
            livres += 1
        else:
            fora += 1
    faltam = NCOL - len(set(col_pos.values()))
    print('colunas: %d mapeadas, %d faltando, %d livres (ignoradas), %d de mês além da 14ª (ignoradas)'
          % (len(col_pos), faltam, livres, fora))

    # linhas por ordem
    got_l = {}
    for ln in dados.get('linhas') or []:
        got_l[round(float(ln['ordem']), 6)] = ln
    esp_ordens = set()
    div = Counter()
    so_esp = Counter()
    lin = Counter()
    senha_na_celula = 0
    esp_por_lead = {}
    for ln in linhas:
        o = float(ln['ordem'])
        esp_ordens.add(round(o, 6))
        g = got_l.get(round(o, 6))
        if g is None:
            lin['ausente_' + ln['tipo']] += 1
            continue
        if g.get('tipo') != ln['tipo']:
            lin['tipo_diferente'] += 1
            continue
        if _nz(g.get('bloco')) != _nz(ln['bloco']):
            lin['bloco_diferente'] += 1
        cel = {}
        for cid, par in (g.get('c') or {}).items():
            if cid in col_pos:
                cel[col_pos[cid]] = (par[0] if isinstance(par, list) and par else None)
        lid = g.get('lead_id')
        if ln['tipo'] == 'cliente':
            if not lid:
                lin['cliente_sem_lead'] += 1
            else:
                esp_por_lead[lid] = ln
        for pos in range(NCOL):
            esperado = ln['t'][pos]
            if ln['tipo'] == 'cliente' and pos in P_SENHAS:
                if cel.get(pos) not in (None, ''):
                    senha_na_celula += 1
                if senhas is None or not lid:
                    continue
                par = senhas.get(lid, (None, None))
                obtido = _nz(par[0] if pos == 6 else par[1])
            else:
                obtido = _nz(cel.get(pos))
            if ln['tipo'] == 'cabecalho' and pos == 24 and obtido == 'TELEFONE' and esperado.strip() == '':
                continue   # layout 25/09 (mig 60): a coluna de telefone ganhou título nos cabeçalhos
            if obtido != esperado:
                chave = '%s %s' % (letra(pos), colunas_padrao()[pos]['titulo'])
                if obtido.strip() == esperado.strip():
                    so_esp[chave] += 1
                else:
                    div[chave] += 1
    extras = sum(1 for o in got_l if o not in esp_ordens)
    print('linhas: CSV %d, banco %d (visíveis), extras no banco %d | %s'
          % (len(linhas), len(got_l), extras, ', '.join('%s %d' % kv for kv in sorted(lin.items())) or 'sem problemas'))
    print('SENHA gravada em texto de célula (deve ser 0): %d' % senha_na_celula)
    print()
    print('== divergências célula a célula (texto exato) ==')
    if not div and not so_esp:
        print('nenhuma')
    else:
        tab = [[k, div[k], so_esp[k]] for k in sorted(set(div) | set(so_esp), key=lambda s: (len(s.split()[0]), s))]
        tabela(['coluna', 'divergem', 'só espaços'], tab)
    print()

    # ligação §2.2: lead + pagamentos
    bmap = {b['id']: b for b in blocos}
    lig = Counter()
    pgc = Counter()
    for lid, ln in esp_por_lead.items():
        ld = leads.get(lid)
        if ld is None:
            lig['lead_inexistente'] += 1
            continue
        t = ln['t']
        b = bmap[ln['bloco']]
        for campo, pos in (('nome', 2), ('comercial', 1), ('nb', 3), ('banco', 4), ('cpf', 5)):
            if btrim(_nz(ld.get(campo))) != btrim(t[pos]):
                lig[campo] += 1
        v = valor_br(t[7])
        if v is not None and abs(float(ld.get('valor') or 0) - v) > 0.005:
            lig['valor'] += 1
        d = data_curta(t[0])
        # o ANO é inferido no SQL (referência = 1º mês pago); aqui só dia/mês
        if d and _nz(ld.get('fechamento'))[5:10] != d[5:10]:
            lig['fechamento'] += 1
        if btrim(_nz(ld.get('parou'))) != btrim(t[9]):
            lig['parou'] += 1
        d = data_curta(t[9])
        # o ANO é inferido no SQL (referência = 1º mês pago); aqui só dia/mês
        if d and _nz(ld.get('data_parou'))[5:10] != d[5:10]:
            lig['data_parou'] += 1
        d = data_curta(t[8])
        # o ANO é inferido no SQL (referência = 1º mês pago); aqui só dia/mês
        if d and _nz(ld.get('data_reclamacao'))[5:10] != d[5:10]:
            lig['data_reclamacao'] += 1
        tel = telefone(t[24])
        if tel and so_digitos(ld.get('telefone')) != tel:
            lig['telefone'] += 1
        if (b['dia'] is not None and ld.get('dia') != b['dia']):
            lig['dia'] += 1
        if ld.get('situacao') != b['situacao']:
            lig['situacao'] += 1
        atual = dict(pags.get(lid, {}))
        if not b['comp_base']:
            pgc['novos_mantidos'] += len(atual)     # NOVOS: a carga não mexe nos pagamentos
            continue
        for k in range(NMES):
            e = estado_mes(t[MES0 + k])
            a = atual.pop(comp_soma(b['comp_base'], k), None)
            if e is None and a is None:
                continue
            if e is None and fora_preservado(a[0], t[MES0 + k]):
                pgc['fora_mantido'] += 1
            elif e is None:
                pgc['sobrando'] += 1
            elif a is None:
                pgc['faltando'] += 1
            elif a[0] != e[0] or (e[0] == 'pago' and a[1] != e[1]):
                pgc['diferente'] += 1
            else:
                pgc['ok'] += 1
        pgc['sobrando_fora_da_grade'] += len(atual)
    sem_linha = sum(1 for lid in leads if lid not in esp_por_lead)
    print('== ligação com o sistema (%d leads com linha; %d leads sem linha visível) ==' % (len(esp_por_lead), sem_linha))
    print('campos do lead divergentes: ' + (', '.join('%s %d' % kv for kv in sorted(lig.items())) or 'nenhum'))
    print('pagamentos: ok %d | faltando %d | diferentes %d | sobrando nas 14 colunas %d | sobrando fora da grade %d'
          ' | "fora" com célula vazia ou "-" %d | de leads em NOVOS (a carga não mexe) %d'
          % (pgc['ok'], pgc['faltando'], pgc['diferente'], pgc['sobrando'], pgc['sobrando_fora_da_grade'],
             pgc['fora_mantido'], pgc['novos_mantidos']))


def main():
    ap = argparse.ArgumentParser(description='Carga única da planilha MENSAIS na Gestão de cobranças (Reviza).')
    g = ap.add_mutually_exclusive_group()
    g.add_argument('--dry-run', action='store_true', help='(padrão) só leitura: contagens agregadas')
    g.add_argument('--aplicar', action='store_true', help='chama planilha_substituir (exige --confirmo e admin)')
    g.add_argument('--conferir', action='store_true', help='compara o que está no banco com o CSV')
    ap.add_argument('--confirmo', action='store_true', help='confirmação explícita para --aplicar')
    ap.add_argument('--recarregar', action='store_true',
                    help='com --aplicar: autoriza substituir uma planilha já carregada (manda "recarregar": true)')
    ap.add_argument('--csv', default=CSV_PADRAO)
    ap.add_argument('--env', default=os.environ.get('RV_ENV_FILE') or ENV_PADRAO)
    args = ap.parse_args()
    if args.confirmo and not args.aplicar:
        raise SystemExit('ERRO: --confirmo só vale junto com --aplicar.')
    if args.recarregar and not args.aplicar:
        raise SystemExit('ERRO: --recarregar só vale junto com --aplicar --confirmo.')
    try:
        if args.aplicar:
            modo_aplicar(args)
        elif args.conferir:
            modo_conferir(args)
        else:
            modo_dry_run(args)
    except ErroApi as e:
        raise SystemExit('ERRO na API: %s' % e)
    except urllib.error.URLError as e:
        raise SystemExit('ERRO de rede: %s' % getattr(e, 'reason', e))


if __name__ == '__main__':
    main()
