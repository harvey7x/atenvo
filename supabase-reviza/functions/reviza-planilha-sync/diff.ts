// reviza-planilha-sync/diff.ts — diff de 3 vias (S planilha agora × E espelho da
// última leitura × P sistema), grupos de mudança no shape do contrato do front
// (GrupoMudanca) e freio de segurança. TUDO PURO: nada de rede/banco aqui
// (diff_test.ts cobre com dados sintéticos). Regras combinadas:
//   · S==E → nada (divergência do sistema fica para o push);
//   · S≠E e S==P → só atualiza o espelho;
//   · S≠E e S≠P → aplica S→P; se P≠E também (os dois mudaram) → registra conflito
//     e aplica a planilha ("a planilha manda em tudo");
//   · sem espelho (linha nova/restaurada/1ª rodada) → S≠P aplica, sem conflito;
//   · senha (senha_inss/reclame): comparação por hash; o texto NUNCA sai daqui a
//     não ser dentro do item que vai cifrado ao banco (sync_aplicar).
import {
  Casado, CAMPOS_SENHA, Coluna, ErroEstrutura, Folha, LeadCasar, LinhaFolha, Mapa, Pags,
  btrim, casar, compSoma, ehCabecalho, ehVazia, leadsSemLinha, letra, marcaSenha, mmmAa, montarFolha, sha256Hex,
} from './folha.ts';

/* ================= tipos do sistema (lidos pelo index com service_role) ================= */

export interface SisBloco { id: string; dia: number | null; situacao: string; comp_base: string | null }
export interface SisLinha { id: string; ordem: number; tipo: string; bloco: string | null; lead_id: string | null }
export interface Sistema {
  mapa: Mapa;
  blocos: SisBloco[];
  /** ordenadas por (ordem, id); só as visíveis (tipo != 'cliente' ou lead_id presente) */
  linhas: SisLinha[];
  /** `${linha_id}\u0000${coluna_id}` → texto ('' quando não há célula) */
  celulas: Map<string, string>;
  leads: LeadCasar[];
  pags: Pags;
  /** lead_ids que nunca viram 'sair' nesta rodada (cliente_novo ainda pendente na outbox) */
  naoSair: Set<string>;
}

export interface EspelhoLinha {
  aba: string;
  linha: number;            // 1-based (linha da planilha)
  hash: string;
  valores: string[];
  tipo: string;
  lead_id: string | null;
}

/* ================= itens do sync_aplicar (contrato da mig 71) ================= */

export type ItemAplicar =
  | { op: 'celula'; linha_id: string; coluna_id: string; texto: string }
  | { op: 'novo'; bloco: string; c: string[] }
  | { op: 'mover'; lead_id: string; bloco: string }
  | { op: 'sair'; lead_id: string }
  | { op: 'restaurar'; trash_id: string }
  | { op: 'coluna_mes_nova'; mes_pos: number; titulo: string }
  | { op: 'coluna_livre_nova'; titulo: string }
  | { op: 'bloco_novo'; id: string; dia: number; situacao: string; comp_base: string | null }
  | { op: 'linha_sumiu'; linha_id: string };

/* ================= grupos (shape EXATO do contrato do front) ================= */

export type GrupoId = 'novos' | 'ciclo' | 'saem' | 'pagamentos' | 'telefones';
export interface ItemMudanca { nome: string; detalhe: string }
export interface GrupoMudanca { id: GrupoId; rotulo: string; efeito: string; total: number; itens: ItemMudanca[] }

const ROTULOS_GRUPO: Record<GrupoId, readonly [string, string]> = {
  novos: ['clientes novos', 'Entram na cobrança no ciclo indicado na planilha.'],
  ciclo: ['mudaram de ciclo', 'Passam a ser cobrados no novo dia.'],
  saem: ['saem da cobrança', 'Estão na aba cancelados — o histórico fica guardado.'],
  pagamentos: ['pagamentos', 'Valores lançados nas colunas de mês.'],
  telefones: ['telefones', 'Números novos ou corrigidos na coluna TELEFONE.'],
};
const ORDEM_GRUPOS: GrupoId[] = ['novos', 'ciclo', 'saem', 'pagamentos', 'telefones'];
/** itens truncados por grupo (total segue sendo o número real) */
export const TETO_ITENS_GRUPO = 50;

const ROTULO_CAMPO: Record<string, string> = {
  fechamento: 'Data de fechamento', comercial: 'Comercial', nome: 'Cliente', nb: 'NB', banco: 'Banco',
  cpf: 'CPF', senha_inss: 'Senha INSS', valor: 'Parcela total', reclame: 'Reclame Aqui',
  parou: 'Data que parou', telefone: 'Telefone',
};

export function rotuloColuna(col: Coluna, compBase: string | null): string {
  if (col.tipo === 'campo' && col.campo) return ROTULO_CAMPO[col.campo] ?? (col.titulo || col.campo);
  if (col.tipo === 'mes') {
    if (compBase && col.mesPos !== null) return `Pagamento ${mmmAa(compSoma(compBase, col.mesPos))}`;
    return col.titulo || 'Mês';
  }
  return col.titulo || `Coluna ${letra(col.pos)}`;
}

/* ================= fase 1: preparar (folha + casamento + colunas novas) ================= */

export interface ColunaNova { tipo: 'mes' | 'livre'; mesPos: number | null; titulo: string }
export interface Preparo {
  folha: Folha;
  casados: Map<number, Casado>;
  /** índices (em folha.linhas) das linhas 'cliente' sem lead casado */
  semPar: number[];
  colunasNovas: ColunaNova[];
  erroEstrutura: string | null;
  clientes: number;
}

/** ordem esperada dos blocos = a ordem dos cabeçalhos/rótulo nas linhas do sistema */
export function blocosDoSistema(linhas: SisLinha[]): string[] {
  const out: string[] = [];
  for (const ln of linhas) {
    if ((ln.tipo === 'cabecalho' || ln.tipo === 'rotulo') && ln.bloco && !out.includes(ln.bloco)) out.push(ln.bloco);
  }
  return out;
}

export function preparar(bruto: string[][], sistema: Sistema): Preparo {
  const m = sistema.mapa;
  const vazio: Preparo = {
    folha: { blocos: [], linhas: [], avisos: [] }, casados: new Map(), semPar: [],
    colunasNovas: [], erroEstrutura: null, clientes: 0,
  };
  let folha: Folha;
  try {
    folha = montarFolha(bruto, m, []);
  } catch (e) {
    if (e instanceof ErroEstrutura) return { ...vazio, erroEstrutura: e.message };
    throw e;
  }
  // colunas novas no FIM (além do mapa): mês quando TODOS os cabeçalhos trazem 'dd/…'
  const colunasNovas: ColunaNova[] = [];
  const largura = bruto.reduce((mx, r) => Math.max(mx, r.length), 0);
  const cabecalhos = folha.linhas.filter((ln) => ln.tipo === 'cabecalho');
  let mesPosMax = m.meses.reduce((mx, c) => Math.max(mx, c.mesPos ?? -1), -1);
  for (let pos = m.ncol; pos < largura; pos++) {
    const valores = folha.linhas.map((ln) => (bruto[ln.r]?.[pos] ?? ''));
    if (valores.every((v) => v.trim() === '')) continue;              // coluna toda vazia: ignorada
    const cabs = cabecalhos.map((ln) => (bruto[ln.r]?.[pos] ?? ''));
    const ehMes = cabs.length > 0 && cabs.every((t) => /^\s*\d{1,2}\//.test(t));
    if (ehMes) {
      mesPosMax += 1;
      colunasNovas.push({ tipo: 'mes', mesPos: mesPosMax, titulo: `Mês ${mesPosMax + 1}` });
    } else {
      const titulo = cabs.map((t) => t.trim()).find((t) => t !== '') ?? 'Nova coluna';
      colunasNovas.push({ tipo: 'livre', mesPos: null, titulo });
    }
  }
  const casados = casar(folha.linhas, folha.blocos, sistema.leads, sistema.pags, m);
  const semPar: number[] = [];
  let clientes = 0;
  folha.linhas.forEach((ln, i) => {
    if (ln.tipo !== 'cliente') return;
    clientes += 1;
    if (!casados.has(i)) semPar.push(i);
  });
  return { folha, casados, semPar, colunasNovas, erroEstrutura: null, clientes };
}

/* ================= fase 2: o diff ================= */

export interface ConflitoNovo { lead_id: string | null; campo: string; valor_planilha: string; valor_sistema: string }
export interface SenhaPendente {
  lead_id: string;
  tipo: 'inss' | 'reclame';
  campo: string;                 // rótulo p/ conflito ('Senha INSS' | 'Reclame Aqui')
  item: { op: 'celula'; linha_id: string; coluna_id: string; texto: string };
  sHash: string;
  eHash: string | null;
  /** true = o espelho viu a senha mudar NA planilha (conta como mudança; candidata a conflito) */
  conta: boolean;
}
export interface FreioDetectado { motivo: string; resumo: string }
export interface ResultadoDiff {
  itens: ItemAplicar[];
  senhas: SenhaPendente[];
  conflitos: ConflitoNovo[];
  grupos: GrupoMudanca[];
  /** mudanças planilha→sistema contadas (freio e conferência); senhas sem espelho não contam */
  mudancas: number;
  saidas: number;
  freio: FreioDetectado | null;
  /** estado completo do espelho pós-rodada (linhas novo/restaurar ficam de fora de propósito:
      na rodada seguinte elas casam com o lead e o diff célula a célula se acerta sozinho) */
  espelhoNovo: EspelhoLinha[];
  avisos: string[];
}

export interface EntradaDiff {
  prep: Preparo;
  /** linhas cruas da aba cancelados (só para o espelho) */
  cancelados: string[][];
  sistema: Sistema;
  espelho: EspelhoLinha[];
  /** idx da linha da folha → restauração encontrada na Lixeira */
  lixeira: Map<number, { trash_id: string; lead_id: string }>;
  limites: { saidas: number; pct: number };
}

export const ABA_MENSAL = 'CLIENTES MENSAL';
export const ABA_CANCELADOS = 'cancelados';

function normalizarValores(t: string[], m: Mapa): string[] {
  const out = new Array<string>(m.ncol);
  for (let pos = 0; pos < m.ncol; pos++) {
    const col = m.colunas[pos];
    const s = t[pos] ?? '';
    out[pos] = col.campo && CAMPOS_SENHA.has(col.campo) ? marcaSenha(s) : s;
  }
  return out;
}

export function hashLinha(valores: string[]): string {
  return sha256Hex(valores.join('\u0000'));
}

export function diffFolha(e: EntradaDiff): ResultadoDiff {
  const { prep, sistema, limites } = e;
  const m = sistema.mapa;
  const avisos: string[] = [...(prep.folha.avisos ?? [])];
  const grupos = new Map<GrupoId, GrupoMudanca>();
  const addGrupo = (id: GrupoId, nome: string, detalhe: string) => {
    let g = grupos.get(id);
    if (!g) { g = { id, rotulo: ROTULOS_GRUPO[id][0], efeito: ROTULOS_GRUPO[id][1], total: 0, itens: [] }; grupos.set(id, g); }
    g.total += 1;
    if (g.itens.length < TETO_ITENS_GRUPO) g.itens.push({ nome, detalhe });
  };
  const listaGrupos = () => ORDEM_GRUPOS.map((id) => grupos.get(id)).filter((g): g is GrupoMudanca => !!g);

  if (prep.erroEstrutura) {
    return {
      itens: [], senhas: [], conflitos: [], grupos: [], mudancas: 0, saidas: 0,
      freio: {
        motivo: `A estrutura da planilha mudou e a leitura parou: ${prep.erroEstrutura}. Corrija a planilha (ou aplique mesmo assim para tentar de novo).`,
        resumo: 'a estrutura da planilha mudou.',
      },
      espelhoNovo: [], avisos,
    };
  }

  const { folha, casados } = prep;

  /* ---------- índices ---------- */
  const sisBloco = new Map(sistema.blocos.map((b) => [b.id, b]));
  const sisPorLead = new Map<string, SisLinha>();
  const sisCab = new Map<string, SisLinha>();
  let sisRotulo: SisLinha | null = null;
  const sisVaziasPorAncora = new Map<string, SisLinha[]>();
  {
    let ancora = 'ini';
    for (const ln of sistema.linhas) {
      if (ln.tipo === 'cliente' && ln.lead_id) { sisPorLead.set(ln.lead_id, ln); ancora = `lead:${ln.lead_id}`; }
      else if (ln.tipo === 'cabecalho' && ln.bloco) { if (!sisCab.has(ln.bloco)) sisCab.set(ln.bloco, ln); ancora = `cab:${ln.bloco}`; }
      else if (ln.tipo === 'rotulo') { sisRotulo = sisRotulo ?? ln; ancora = 'rot'; }
      else if (ln.tipo === 'vazia') {
        (sisVaziasPorAncora.get(ancora) ?? sisVaziasPorAncora.set(ancora, []).get(ancora)!).push(ln);
      }
    }
  }
  const celula = (linhaId: string, colunaId: string): string => sistema.celulas.get(`${linhaId}\u0000${colunaId}`) ?? '';

  // espelho: linhas de cliente por lead; demais por (aba, tipo, sequência)
  const espCliente = new Map<string, EspelhoLinha>();
  const espSeq = new Map<string, EspelhoLinha[]>();
  for (const le of [...e.espelho].sort((a, b) => (a.aba === b.aba ? a.linha - b.linha : a.aba < b.aba ? -1 : 1))) {
    if (le.aba !== ABA_MENSAL) continue;
    if (le.tipo === 'cliente' && le.lead_id) espCliente.set(le.lead_id, le);
    else {
      const k = le.tipo;
      (espSeq.get(k) ?? espSeq.set(k, []).get(k)!).push(le);
    }
  }
  const seqUsada = new Map<string, number>();
  const proximoEspSeq = (tipo: string): EspelhoLinha | null => {
    const lista = espSeq.get(tipo) ?? [];
    const n = seqUsada.get(tipo) ?? 0;
    seqUsada.set(tipo, n + 1);
    return lista[n] ?? null;
  };

  /* comp_base: quando o bloco existe no sistema, vale o do sistema */
  const compBaseDe = (blocoId: string | null): string | null => {
    if (!blocoId) return null;
    const s = sisBloco.get(blocoId);
    if (s) return s.comp_base;
    return folha.blocos.find((b) => b.id === blocoId)?.compBase ?? null;
  };

  /* ---------- buckets de itens (ordem de aplicação) ---------- */
  const itColunas: ItemAplicar[] = [];
  const itBlocos: ItemAplicar[] = [];
  const itRestaurar: ItemAplicar[] = [];
  const itNovos: ItemAplicar[] = [];
  const itMover: ItemAplicar[] = [];
  const itCelulas: ItemAplicar[] = [];
  const itSair: ItemAplicar[] = [];
  const itSumiu: ItemAplicar[] = [];
  const senhas: SenhaPendente[] = [];
  const conflitos: ConflitoNovo[] = [];
  let mudancas = 0;
  let estrutural: string | null = null;

  /* ---------- colunas novas no fim ---------- */
  for (const cn of prep.colunasNovas) {
    if (cn.tipo === 'mes') itColunas.push({ op: 'coluna_mes_nova', mes_pos: cn.mesPos!, titulo: cn.titulo });
    else itColunas.push({ op: 'coluna_livre_nova', titulo: cn.titulo });
    mudancas += 1;
  }

  /* ---------- blocos ---------- */
  const blocosFolha = new Set(folha.blocos.map((b) => b.id));
  for (const b of folha.blocos) {
    if (sisBloco.has(b.id)) continue;
    if (b.id === 'NOVOS' || b.dia === null) { estrutural = 'a seção NOVOS não existe no sistema'; continue; }
    // modelo de comp_base (pl_bloco_para): dia>=15 segue o D24; senão segue o D01
    const modelo = sistema.blocos.find((x) => x.id === (b.dia! >= 15 ? 'D24' : 'D01'))
      ?? sistema.blocos.find((x) => x.dia !== null && (x.dia >= 15) === (b.dia! >= 15));
    itBlocos.push({ op: 'bloco_novo', id: b.id, dia: b.dia, situacao: b.situacao, comp_base: modelo?.comp_base ?? b.compBase });
    mudancas += 1;
  }
  for (const b of sistema.blocos) {
    if (!blocosFolha.has(b.id)) {
      estrutural = `o bloco ${b.id} do sistema não foi encontrado na planilha`;
    }
  }

  /* ---------- linhas da folha ---------- */
  const puloEspelho = new Set<number>();          // idx de linhas novo/restaurar (ficam fora do espelho)
  const nomeDe = (ln: LinhaFolha): string => btrim(ln.t[m.posCampo.get('nome')!] ?? '') || '—';

  for (let i = 0; i < folha.linhas.length; i++) {
    const ln = folha.linhas[i];
    if (ln.tipo === 'vazia') continue;

    if (ln.tipo === 'cliente' && !casados.has(i)) {
      const r = e.lixeira.get(i);
      puloEspelho.add(i);
      if (r) {
        itRestaurar.push({ op: 'restaurar', trash_id: r.trash_id });
        addGrupo('novos', nomeDe(ln), `Volta para o ${ln.bloco} (estava na Lixeira)`);
      } else {
        itNovos.push({ op: 'novo', bloco: ln.bloco!, c: ln.t.slice(0, m.ncol) });
        const parcela = btrim(ln.t[m.posCampo.get('valor') ?? -1] ?? '') || '—';
        const comercial = btrim(ln.t[m.posCampo.get('comercial') ?? -1] ?? '') || '—';
        addGrupo('novos', nomeDe(ln), `Entra no ${ln.bloco} · parcela ${parcela} · comercial ${comercial}`);
      }
      mudancas += 1;
      continue;
    }

    // linha com contraparte no sistema
    let sis: SisLinha | null = null;
    let esp: EspelhoLinha | null = null;
    let leadId: string | null = null;
    if (ln.tipo === 'cliente') {
      leadId = casados.get(i)!.leadId;
      sis = sisPorLead.get(leadId) ?? null;
      esp = espCliente.get(leadId) ?? null;
      if (!sis) { avisos.push('cliente casado sem linha no sistema (pulado nesta rodada)'); continue; }
      if (sis.bloco !== ln.bloco && ln.bloco) {
        itMover.push({ op: 'mover', lead_id: leadId, bloco: ln.bloco });
        addGrupo('ciclo', nomeDe(ln), `${sis.bloco ?? '—'} → ${ln.bloco}`);
        mudancas += 1;
      }
    } else if (ln.tipo === 'cabecalho') {
      sis = sisCab.get(ln.bloco!) ?? null;
      esp = proximoEspSeq('cabecalho');
      if (!sis) continue;                          // bloco novo: o cabeçalho nasce na mig; células na próxima rodada
    } else {                                       // rotulo
      sis = sisRotulo;
      esp = proximoEspSeq('rotulo');
      if (!sis) continue;
    }

    const compBase = compBaseDe(ln.bloco);
    for (let pos = 0; pos < m.ncol; pos++) {
      const col = m.colunas[pos];
      const S = ln.t[pos] ?? '';
      const ehSenha = ln.tipo === 'cliente' && !!col.campo && CAMPOS_SENHA.has(col.campo);
      if (ehSenha) {
        const sHash = marcaSenha(S);
        const eHash = esp ? (esp.valores[pos] ?? null) : null;
        if (eHash === sHash) continue;
        senhas.push({
          lead_id: leadId!,
          tipo: col.campo === 'senha_inss' ? 'inss' : 'reclame',
          campo: ROTULO_CAMPO[col.campo!] ?? col.titulo,
          item: { op: 'celula', linha_id: sis.id, coluna_id: col.id, texto: S },
          sHash, eHash,
          conta: eHash !== null,
        });
        if (eHash !== null) mudancas += 1;
        continue;
      }
      const E = esp ? (esp.valores[pos] ?? '') : null;
      if (E !== null && S === E) continue;         // planilha não mudou: divergência fica para o push
      const P = celula(sis.id, col.id);
      if (S === P) continue;                       // sistema já tem: só o espelho atualiza
      itCelulas.push({ op: 'celula', linha_id: sis.id, coluna_id: col.id, texto: S });
      mudancas += 1;
      if (E !== null && P !== E) {
        conflitos.push({ lead_id: leadId, campo: rotuloColuna(col, compBase), valor_planilha: S, valor_sistema: P });
      }
      if (ln.tipo === 'cliente') {
        if (col.tipo === 'mes') {
          const quando = compBase && col.mesPos !== null ? mmmAa(compSoma(compBase, col.mesPos)) : (col.titulo || 'mês');
          addGrupo('pagamentos', nomeDe(ln), `${quando} · ${btrim(S) || '—'} · ${ln.bloco}`);
        } else if (col.campo === 'telefone') {
          addGrupo('telefones', nomeDe(ln), btrim(S) || '—');
        }
      }
    }
  }

  /* ---------- saídas: leads do sistema sem linha na folha ---------- */
  const { saem, pendentes } = leadsSemLinha(sistema.leads, casados);
  let saidas = 0;
  for (const ld of [...saem, ...pendentes]) {
    if (sistema.naoSair.has(ld.id)) continue;      // cliente novo do sistema ainda não empurrado
    itSair.push({ op: 'sair', lead_id: ld.id });
    addGrupo('saem', btrim(ld.nome) || '—', 'Movido para a aba cancelados · histórico preservado');
    saidas += 1;
    mudancas += 1;
  }

  /* ---------- linhas vazias removidas na planilha (alinhamento por âncora) ---------- */
  {
    const folhaVazias = new Map<string, number>();
    const ancorasFolha = new Set<string>(['ini']);
    let ancora = 'ini';
    for (let i = 0; i < folha.linhas.length; i++) {
      const ln = folha.linhas[i];
      if (ln.tipo === 'cliente') ancora = casados.has(i) ? `lead:${casados.get(i)!.leadId}` : `novo:${i}`;
      else if (ln.tipo === 'cabecalho') ancora = `cab:${ln.bloco}`;
      else if (ln.tipo === 'rotulo') ancora = 'rot';
      else { folhaVazias.set(ancora, (folhaVazias.get(ancora) ?? 0) + 1); continue; }
      ancorasFolha.add(ancora);
    }
    // teto global: só remove o que de fato SUMIU no total (linha inserida perto de uma
    // vazia desloca a âncora e não pode virar remoção por engano)
    const totalFolha = [...folhaVazias.values()].reduce((s, n) => s + n, 0);
    const totalSis = [...sisVaziasPorAncora.values()].reduce((s, l) => s + l.length, 0);
    let teto = Math.max(0, totalSis - totalFolha);
    for (const [k, lista] of sisVaziasPorAncora) {
      if (teto <= 0) break;
      if (!ancorasFolha.has(k)) continue;          // a âncora mudou junto: não arrisca remoção errada
      const excesso = Math.min(teto, lista.length - (folhaVazias.get(k) ?? 0));
      for (let j = 0; j < excesso; j++) {
        itSumiu.push({ op: 'linha_sumiu', linha_id: lista[lista.length - 1 - j].id });
        mudancas += 1;
        teto -= 1;
      }
    }
  }

  /* ---------- espelho novo (MENSAL + cancelados) ---------- */
  const espelhoNovo: EspelhoLinha[] = [];
  for (let i = 0; i < folha.linhas.length; i++) {
    if (puloEspelho.has(i)) continue;
    const ln = folha.linhas[i];
    const valores = normalizarValores(ln.t, m);
    espelhoNovo.push({
      aba: ABA_MENSAL, linha: ln.r + 1, valores, hash: hashLinha(valores),
      tipo: ln.tipo, lead_id: ln.tipo === 'cliente' ? casados.get(i)!.leadId : null,
    });
  }
  {
    let fim = e.cancelados.length;
    while (fim > 0 && ehVazia(e.cancelados[fim - 1] ?? [], m.ncol)) fim -= 1;
    for (let r = 0; r < fim; r++) {
      const row = e.cancelados[r] ?? [];
      const t: string[] = [];
      for (let pos = 0; pos < m.ncol; pos++) t.push(row[pos] ?? '');
      const tipo = ehVazia(row, m.ncol) ? 'vazia' : ehCabecalho(row, m) ? 'cabecalho' : 'cliente';
      const valores = normalizarValores(t, m);
      espelhoNovo.push({ aba: ABA_CANCELADOS, linha: r + 1, valores, hash: hashLinha(valores), tipo, lead_id: null });
    }
  }

  /* ---------- freio ---------- */
  let freio: FreioDetectado | null = null;
  if (estrutural) {
    freio = {
      motivo: `A estrutura da planilha mudou: ${estrutural}. Confira a planilha antes de aplicar (blocos e abas precisam bater com o sistema).`,
      resumo: 'a estrutura da planilha mudou.',
    };
  } else if (saidas > limites.saidas) {
    freio = {
      motivo: `A planilha tiraria ${saidas} clientes da cobrança de uma vez — acima do limite de segurança de ${limites.saidas} por rodada. Pode ser uma exclusão por engano (por exemplo, linhas apagadas ou movidas para a aba errada).`,
      resumo: `${saidas} clientes sairiam da cobrança de uma vez.`,
    };
  } else if (prep.clientes > 0 && mudancas * 100 > prep.clientes * limites.pct) {
    freio = {
      motivo: `A planilha mudaria ${mudancas} itens de uma vez — acima do limite de segurança de ${limites.pct}% das ${prep.clientes} linhas de clientes. Pode ser uma edição em massa por engano.`,
      resumo: `${mudancas} mudanças de uma vez (acima de ${limites.pct}% das linhas).`,
    };
  }

  return {
    itens: [...itColunas, ...itBlocos, ...itRestaurar, ...itNovos, ...itMover, ...itCelulas, ...itSair, ...itSumiu],
    senhas, conflitos, grupos: listaGrupos(), mudancas, saidas, freio, espelhoNovo, avisos,
  };
}
