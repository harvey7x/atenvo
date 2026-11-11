#!/usr/bin/env -S deno run --allow-read --allow-net --allow-env --allow-run=python3
// paridade_sync.ts — prova LOCAL de paridade do porte TS (folha.ts da edge
// reviza-planilha-sync) contra o Python (planilha_substituir.py, modo dry-run),
// rodando sobre os 2 CSVs REAIS e os leads/pagamentos lidos via REST (só leitura).
//
// IMPRIME SÓ CONTAGENS (blocos, linhas por tipo, clientes por bloco, casados por
// passada P1/P2/P3, sem par, a remover) — NENHUM nome/CPF/telefone/senha na saída.
// Divergência em qualquer célula da tabela = DIFERENTE (parar e corrigir o porte).
//
// Uso (a senha só por variável de ambiente, nunca em arquivo):
//   RV_EMAIL=... RV_SENHA=... deno run --allow-read --allow-net --allow-env \
//     --allow-run=python3 scripts/reviza/paridade_sync.ts
// Opcional: RV_ENV_FILE aponta outro .env (padrão: .env.reviza.local do repo).
import {
  Casado, LeadCasar, Pags,
  arred2, casar, leadsSemLinha, mapaPadrao, montarFolha, telefone,
} from '../../supabase-reviza/functions/reviza-planilha-sync/folha.ts';

const REPO = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const HOME = Deno.env.get('HOME') ?? '';
const CSV_1 = `${HOME}/Downloads/MENSAIS(Planilha1).csv`;
const CSV_2 = `${HOME}/Downloads/MENSAIS(CLIENTES MENSAL).csv`;
const ENV_PADRAO = Deno.env.get('RV_ENV_FILE') ?? `${REPO}/.env.reviza.local`;
const PROJETO_OK = 'ftexrtyswpdcndbkjbtf';
const PROJETO_PROIBIDO = 'afmzuoavvnpfossiiypz';
const NCOL = 25;

/* ---------------- CSV (mesma leitura do Python: cp1252 + ';') ---------------- */
// O TextDecoder('windows-1252') do WHATWG mapeia TODOS os bytes, inclusive os 5 que o
// cp1252 não define (81 8D 8F 90 9D → U+0081 etc.) — exatamente o handler do Python.
function decodificar(bytes: Uint8Array): string {
  return new TextDecoder('windows-1252').decode(bytes);
}

/** csv.reader do Python: delimitador ';', aspas '"', aspas dobradas, quebra dentro de aspas */
function parseCsv(txt: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let campo = '';
  let emAspas = false;
  let inicioCampo = true;
  const fimLinha = () => { row.push(campo); rows.push(row); row = []; campo = ''; inicioCampo = true; };
  for (let i = 0; i < txt.length; i++) {
    const ch = txt[i];
    if (emAspas) {
      if (ch === '"') {
        if (txt[i + 1] === '"') { campo += '"'; i++; }
        else emAspas = false;
      } else campo += ch;
    } else if (ch === '"' && inicioCampo) { emAspas = true; inicioCampo = false; }
    else if (ch === ';') { row.push(campo); campo = ''; inicioCampo = true; }
    else if (ch === '\r') { if (txt[i + 1] === '\n') i++; fimLinha(); }
    else if (ch === '\n') fimLinha();
    else { campo += ch; inicioCampo = false; }
  }
  if (campo !== '' || row.length) { row.push(campo); rows.push(row); }
  return rows;
}

function lerCsvPlanilha1(caminho: string): string[][] {
  const rows = parseCsv(decodificar(Deno.readFileSync(caminho)));
  let extras = 0;
  for (const r of rows) for (const c of r.slice(NCOL)) if (c !== '') extras++;
  if (extras) throw new Error(`há ${extras} células depois da coluna Y; o contrato diz 0..24`);
  return rows.map((r) => { const x = r.slice(0, NCOL); while (x.length < NCOL) x.push(''); return x; });
}

/** dobra da coluna Z do wrapper planilha_recarga_30_09.py (5 telefones uma coluna à direita) */
function lerCsvClientesMensal(caminho: string): string[][] {
  const rows = parseCsv(decodificar(Deno.readFileSync(caminho)));
  const out: string[][] = [];
  rows.forEach((r0, i) => {
    const r = [...r0];
    while (r.length < 30) r.push('');
    if (r.slice(26).some((c) => c !== '')) throw new Error(`célula depois da coluna Z (linha ${i})`);
    const z = r[25];
    if (z.trim()) {
      const y = r[24];
      if (['', '0', '-'].includes(y.trim())) r[24] = z;
      else if (telefone(y) === null) r[24] = y.replace(/\s+$/u, '') + ' ' + z.trim();
      else throw new Error(`linha ${i} tem telefone em Y e em Z`);
    }
    out.push(r.slice(0, NCOL));
  });
  return out;
}

/* ---------------- REST (só leitura; keyset por id como o Python) ---------------- */
function lerEnv(caminho: string): { url: string; anon: string } {
  const texto = Deno.readTextFileSync(caminho);
  const env: Record<string, string> = {};
  for (const ln of texto.split('\n')) {
    const l = ln.trim();
    if (!l || l.startsWith('#') || !l.includes('=')) continue;
    const i = l.indexOf('=');
    env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
  const url = (env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
  const anon = env.VITE_SUPABASE_ANON_KEY ?? '';
  if (!url || !anon) throw new Error(`VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY ausentes em ${caminho}`);
  if (url.includes(PROJETO_PROIBIDO) || !url.includes(PROJETO_OK)) {
    throw new Error(`o .env não aponta para o projeto ${PROJETO_OK}. Abortado.`);
  }
  return { url, anon };
}

class Api {
  token = '';
  constructor(readonly url: string, readonly anon: string) {}
  async req(metodo: string, caminho: string, corpo?: unknown): Promise<unknown> {
    const r = await fetch(this.url + caminho, {
      method: metodo,
      headers: {
        apikey: this.anon, 'Content-Type': 'application/json', Accept: 'application/json',
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    const t = await r.text();
    if (!r.ok) throw new Error(`HTTP ${r.status} em ${caminho.split('?')[0]}`);
    return t ? JSON.parse(t) : null;
  }
  async login(email: string, senha: string): Promise<void> {
    const j = await this.req('POST', '/auth/v1/token?grant_type=password', { email, password: senha }) as { access_token?: string };
    if (!j?.access_token) throw new Error('login sem access_token');
    this.token = j.access_token;
  }
  async listar<T extends { id: string }>(tabela: string, select: string): Promise<T[]> {
    const out: T[] = [];
    let ultimo: string | null = null;
    for (;;) {
      const q = new URLSearchParams({ select, order: 'id.asc', limit: '1000' });
      if (ultimo !== null) q.set('id', `gt.${ultimo}`);
      const lote = await this.req('GET', `/rest/v1/${tabela}?${q}`) as T[];
      out.push(...lote);
      if (lote.length < 1000) return out;
      ultimo = lote[lote.length - 1].id;
    }
  }
}

/* ---------------- a tabela do dry-run (mesmas colunas do Python) ---------------- */
type LinhaTabela = [string, number, number, number, number, number, number, number, number, number, number];
const CABE = ['bloco', 'linhas', 'clientes', 'casados', 'P1', 'P2', 'P3', 'a criar', 'a remover', 'ambíguos', 'empate'];

function blocoDoLead(ld: LeadCasar): string {
  if (ld.situacao === 'ativo') return 'NOVOS';
  if (ld.dia == null) return '(sem dia)';
  return `D${String(Math.trunc(ld.dia)).padStart(2, '0')}`;
}

function tabelaTs(rows: string[][], leads: LeadCasar[], pags: Pags): { tabela: LinhaTabela[]; vazias: number; pendentes: number } {
  const m = mapaPadrao();
  const { blocos, linhas } = montarFolha(rows, m);
  const casados = casar(linhas, blocos, leads, pags, m);
  const { saem, pendentes } = leadsSemLinha(leads, casados);
  const removerPor = new Map<string, number>();
  for (const ld of saem) {
    const b = blocoDoLead(ld);
    removerPor.set(b, (removerPor.get(b) ?? 0) + 1);
  }
  const zera = () => new Map<string, number>();
  const linhasPor = zera(), cliPor = zera(), casPor = zera(), criarPor = zera(), ambPor = zera(), empPor = zera();
  const passPor = new Map<string, Map<string, number>>();
  const soma = (mapa: Map<string, number>, k: string, n = 1) => mapa.set(k, (mapa.get(k) ?? 0) + n);
  linhas.forEach((ln, i) => {
    if (ln.bloco === null) return;
    soma(linhasPor, ln.bloco);
    if (ln.tipo !== 'cliente') return;
    soma(cliPor, ln.bloco);
    const c: Casado | undefined = casados.get(i);
    if (c) {
      soma(casPor, ln.bloco);
      const pp = passPor.get(ln.bloco) ?? passPor.set(ln.bloco, new Map()).get(ln.bloco)!;
      soma(pp, c.passada);
      if (c.candidatos > 1) soma(ambPor, ln.bloco);
      if (c.empate) soma(empPor, ln.bloco);
    } else soma(criarPor, ln.bloco);
  });
  const ordem = [...blocos.map((b) => b.id), ...[...removerPor.keys()].filter((k) => !blocos.some((b) => b.id === k)).sort()];
  const tabela: LinhaTabela[] = [];
  const tot = new Array<number>(10).fill(0);
  for (const b of ordem) {
    const pp = passPor.get(b);
    const ln: LinhaTabela = [
      b, linhasPor.get(b) ?? 0, cliPor.get(b) ?? 0, casPor.get(b) ?? 0,
      pp?.get('P1') ?? 0, pp?.get('P2') ?? 0, pp?.get('P3') ?? 0,
      criarPor.get(b) ?? 0, removerPor.get(b) ?? 0, ambPor.get(b) ?? 0, empPor.get(b) ?? 0,
    ];
    tabela.push(ln);
    for (let j = 0; j < 10; j++) tot[j] += ln[j + 1] as number;
  }
  tabela.push(['TOTAL', ...tot] as LinhaTabela);
  return { tabela, vazias: linhas.filter((l) => l.tipo === 'vazia').length, pendentes: pendentes.length };
}

/* ---------------- o lado Python (dry-run) ---------------- */
async function tabelaPython(script: string, args: string[]): Promise<{ tabela: LinhaTabela[]; saida: string }> {
  const cmd = new Deno.Command('python3', {
    args: [script, ...args],
    stdout: 'piped', stderr: 'piped',
    cwd: REPO,
  });
  const r = await cmd.output();
  const saida = new TextDecoder().decode(r.stdout);
  if (r.code !== 0) {
    throw new Error(`python3 saiu com código ${r.code}: ${new TextDecoder().decode(r.stderr).slice(0, 300)}`);
  }
  // a tabela do dry-run: do cabeçalho 'bloco  linhas ...' até a linha TOTAL
  const linhas = saida.split('\n');
  const ini = linhas.findIndex((l) => l.trimStart().startsWith('bloco') && l.includes('linhas'));
  if (ini < 0) throw new Error('não achei a tabela por bloco na saída do Python');
  const tabela: LinhaTabela[] = [];
  for (let i = ini + 2; i < linhas.length; i++) {
    const partes = linhas[i].trim().split(/\s+/);
    if (partes.length < 11) break;
    const nums = partes.slice(partes.length - 10).map(Number);
    if (nums.some((n) => !Number.isFinite(n))) break;
    tabela.push([partes.slice(0, partes.length - 10).join(' '), ...nums] as LinhaTabela);
    if (partes[0] === 'TOTAL') break;
  }
  if (!tabela.length || tabela[tabela.length - 1][0] !== 'TOTAL') throw new Error('tabela do Python incompleta');
  return { tabela, saida };
}

/* ---------------- comparação (só contagens na tela) ---------------- */
function imprimirTabela(rotulo: string, t: LinhaTabela[]): void {
  console.log(`-- ${rotulo} --`);
  console.log(CABE.join('\t'));
  for (const ln of t) console.log(ln.join('\t'));
}

function comparar(nome: string, ts: LinhaTabela[], py: LinhaTabela[]): boolean {
  const difs: string[] = [];
  const porBloco = new Map(py.map((l) => [l[0], l]));
  for (const l of ts) {
    const p = porBloco.get(l[0]);
    if (!p) { difs.push(`bloco ${l[0]} só no TS`); continue; }
    for (let j = 1; j < 11; j++) {
      if (l[j] !== p[j]) difs.push(`${l[0]} ${CABE[j]}: TS=${l[j]} PY=${p[j]}`);
    }
  }
  for (const l of py) if (!ts.some((x) => x[0] === l[0])) difs.push(`bloco ${l[0]} só no Python`);
  if (ts.length !== py.length) difs.push(`nº de linhas da tabela: TS=${ts.length} PY=${py.length}`);
  if (!difs.length) {
    console.log(`== ${nome}: IGUAL (${ts.length - 1} blocos + TOTAL conferem célula a célula) ==`);
    return true;
  }
  console.log(`== ${nome}: DIFERENTE (${difs.length} células) ==`);
  for (const d of difs) console.log('  ' + d);
  return false;
}

/* ---------------- main ---------------- */
if (import.meta.main) {
  const email = Deno.env.get('RV_EMAIL');
  const senha = Deno.env.get('RV_SENHA');
  if (!email || !senha) {
    console.error('ERRO: defina RV_EMAIL e RV_SENHA no ambiente (nunca em arquivo).');
    Deno.exit(2);
  }
  const { url, anon } = lerEnv(ENV_PADRAO);
  const api = new Api(url, anon);
  await api.login(email, senha);

  type LeadRest = LeadCasar & { parado_pendente: boolean | null };
  const leads = await api.listar<LeadRest>('leads', 'id,nome,cpf,nb,banco,dia,situacao,comercial,parado_pendente');
  const pagsLista = await api.listar<{ id: string; lead_id: string; comp: string; status: string; valor: number | null }>(
    'pagamentos', 'id,lead_id,comp,status,valor');
  const pags: Pags = new Map();
  for (const p of pagsLista) {
    (pags.get(p.lead_id) ?? pags.set(p.lead_id, new Map()).get(p.lead_id)!)
      .set(p.comp, [p.status, p.valor === null ? null : arred2(Number(p.valor))] as const);
  }
  console.log(`leads lidos: ${leads.length} | leads com pagamentos: ${pags.size} | pagamentos: ${pagsLista.length}`);
  console.log('');

  let ok = true;
  const casos: Array<[string, () => string[][], string, string[]]> = [
    ['MENSAIS(Planilha1).csv', () => lerCsvPlanilha1(CSV_1), `${REPO}/scripts/reviza/planilha_substituir.py`, ['--dry-run', '--csv', CSV_1]],
    ['MENSAIS(CLIENTES MENSAL).csv', () => lerCsvClientesMensal(CSV_2), `${REPO}/scripts/reviza/planilha_recarga_30_09.py`, ['--dry-run']],
  ];
  for (const [nome, lerRows, script, args] of casos) {
    const rows = lerRows();
    const ts = tabelaTs(rows, leads, pags);
    const py = await tabelaPython(script, args);
    console.log(`${nome}: ${rows.length} linhas no CSV | vazias na folha (TS): ${ts.vazias} | pendentes de aprovação (ficam): ${ts.pendentes}`);
    imprimirTabela('TS (folha.ts)', ts.tabela);
    imprimirTabela('Python (planilha_substituir.py --dry-run)', py.tabela);
    if (!comparar(nome, ts.tabela, py.tabela)) ok = false;
    console.log('');
  }
  if (!ok) {
    console.log('RESULTADO: DIFERENTE — parar e corrigir o porte antes de seguir.');
    Deno.exit(1);
  }
  console.log('RESULTADO: IGUAL — o porte TS casa com o Python nos 2 CSVs reais.');
}
