/* ============================================================================
   Fila da Iris — o CLIENTE da fila (o mesmo formato na demonstração, na prévia e no real).
   No real, cada linha vem de public.fila_iris_itens (supabase/migrations/20261111200000_fila_iris.sql):
   a fila do atendente com os clientes DELE, classificados pelo andamento do atendimento.
   ============================================================================ */
import { CLIENTES, DOCUMENTOS, docsOk, equipeDoUid, type Categoria, type ClienteFila, type Marca, type TipoMarca } from './dados';

export interface Lead {
  /** id do contato */
  id: string;
  conversaId?: string;
  nome: string;
  fone: string;
  /** id da equipe (dados.ts EQUIPE) */
  atendente: string;
  cat: Categoria;
  /** 0 histórico · 1 quente · 2 só falta comprovante · 3 falta documento · 5 sem resposta */
  lista: number;
  campanha: string;
  /** coluna do Kanban */
  funil: string;
  /** última mensagem do cliente / nossa / último documento recebido (epoch ms) */
  ud?: number;
  nu?: number;
  udoc?: number;
  /** o cliente mandou a última mensagem e ninguém respondeu */
  esperandoEm?: number;
  disse: string;
  docPessoal?: boolean;
  comprovante?: boolean;
  /** correção manual da documentação feita pelo atendente */
  docsManual?: 'completos' | 'incompletos';
  docsManualId?: string;
  /** prioridade 0: o que o administrativo diz que falta (texto) e os códigos do CAF */
  falta: string;
  faltaCodigos?: string[];
  /** prioridade 0: quando a última via do kit foi aprovada no CAF */
  assinadoEm?: number;
  /** quando o cliente entrou no funil (o card do Kanban) */
  entrouEm?: number;
  /** quando a Iris passou o cliente para o atendente (derivado do andamento) */
  passouEm?: number;
  /** passou nas últimas 24 h: ganha o aviso e vai para o topo da seção */
  novo?: boolean;
  nota: string;
  planilha: string;
  arq?: number;
  msgs?: number;
  situacao: string;
  curta: string;
  ordem: number;
  marcas: Marca[];
}

/* a linha que public.fila_iris_itens devolve */
export interface LinhaFila {
  contato_id: string;
  conversa_id: string | null;
  oportunidade_id: string | null;
  dono_id: string | null;
  nome: string | null;
  telefone: string | null;
  categoria: Categoria;
  aguardando: boolean;
  coluna: string | null;
  campanha: string | null;
  entrou_em: string | null;
  ult_cliente_em: string | null;
  ult_nossa_em: string | null;
  ult_doc_em: string | null;
  doc_pessoal: boolean;
  comprovante: boolean;
  falta: string[] | null;
  assinado_em: string | null;
  marcacoes: { id: string; tipo: string; texto: string | null; vezes: number; em: string }[] | null;
  ult_cliente_texto: string | null;
}

export const ROTULO_LISTA: Record<number, string> = {
  0: 'Assinado · falta o histórico de créditos', 1: 'Documentação completa', 2: 'Só falta o comprovante',
  3: 'Falta documento', 4: 'Aceitou, sem documentos', 5: 'Parou de responder', 6: 'Sem documentos',
};

const juntar = (l: string[]) => (l.length <= 1 ? l.join('') : `${l.slice(0, -1).join(', ')} e ${l[l.length - 1]}`);
const ms = (s: string | null | undefined) => (s ? Date.parse(s) : undefined);

/** "(51) 99999-9999" a partir do que estiver gravado (com ou sem 55) */
export function foneBonito(t: string | null | undefined): string {
  const d = (t ?? '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return t ?? '';
}

/** "11/11 13:52" */
export function dataHora(t?: number): string {
  if (!t) return '—';
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const PARTICULA = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'di']);
/** "AMANDA silva" → "Amanda Silva" (partículas minúsculas); nome vazio ou só com dígitos vira o telefone bonito */
export function nomeBonito(n: string | null | undefined, tel?: string | null): string {
  const t = (n ?? '').replace(/\s+/g, ' ').trim();
  if (!t || /^[\d\s()+.-]+$/.test(t)) return foneBonito(t.replace(/\D/g, '') || tel);
  return t.split(' ').map((w, i) => {
    const m = w.toLowerCase();
    if (i > 0 && PARTICULA.has(m)) return m;
    return m.charAt(0).toUpperCase() + m.slice(1);
  }).join(' ');
}

/** "11/11" */
export function diaMes(t?: number): string {
  if (!t) return '—';
  const d = new Date(t);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** o nome da campanha como se lê ("ANTONIO CAMPANHA" → "Antonio Campanha", "JUROS ABUSIVO (ANDRIUS)" → "Juros Abusivo (Andrius)") */
const PALAVRA: Record<string, string> = { emprestimo: 'Empréstimo', inss: 'INSS', ctwa: 'CTWA', de: 'de', da: 'da', do: 'do', e: 'e' };
export function campanhaBonita(c: string | null | undefined): string {
  const t = (c ?? '').replace(/\s+/g, ' ').trim();
  if (!t || t === '—' || t === 'não achei no sistema') return '—';
  return t.toLowerCase().split(' ').map((w, i) => {
    const nu = w.replace(/[()]/g, '');
    const fixo = PALAVRA[nu];
    const pal = fixo && (i > 0 || fixo !== fixo.toLowerCase()) ? fixo : nu.charAt(0).toUpperCase() + nu.slice(1);
    return w.replace(nu, pal);
  }).join(' ');
}

/** a última mensagem do cliente como se lê: texto entre aspas, ou o que ele mandou ("Mandou um áudio") */
const MIDIA: Record<string, string> = {
  audio: 'Mandou um áudio', imagem: 'Mandou uma imagem', documento: 'Mandou um documento', video: 'Mandou um vídeo',
  sticker: 'Mandou uma figurinha', figurinha: 'Mandou uma figurinha', localizacao: 'Mandou a localização', contato: 'Mandou um contato',
};
export function mensagemDoCliente(t: string | null | undefined): { texto: string; midia: boolean } | null {
  const s = (t ?? '').replace(/\s+/g, ' ').trim();
  if (!s) return null;
  const m = s.match(/^\[(\w+)\]$/);
  if (m) return { texto: MIDIA[m[1]] ?? 'Mandou um arquivo', midia: true };
  return { texto: s, midia: false };
}

/** minutos desde um instante */
export const minDesde = (t?: number) => (t ? Math.max(0, Math.round((Date.now() - t) / 60_000)) : undefined);

const TIPOS_MARCA: TipoMarca[] = ['nao_atendeu', 'recuperar_senha', 'mandar_senha', 'mandar_doc', 'falta'];
/* os códigos de documento do CAF (resposta de 11/11) */
const ROTULO_FALTA: Record<string, string> = {
  historico: 'histórico de créditos', renda: 'comprovante de renda', cadastral: 'situação cadastral do CPF',
  identidade: 'identidade', identidade_declarante: 'identidade do declarante', residencia: 'comprovante de residência',
  irpf: 'print do Portal MIR', concessao: 'carta de concessão', consignacoes: 'extrato de consignações',
  nao_recebimento: 'declaração de não recebimento', outro: 'outro documento pedido', assinatura: 'via do kit assinada',
};
/** a lista do que falta, com o histórico primeiro */
const faltaEmTexto = (c: string[]) => [...c].sort((a, b) => Number(b === 'historico') - Number(a === 'historico'))
  .map((f) => ROTULO_FALTA[f] ?? f.replace(/_/g, ' '));

/** textos da situação (janela) e versão curta (fila) */
export function textosDoLead(l: Pick<Lead, 'cat' | 'docPessoal' | 'comprovante' | 'docsManual' | 'udoc' | 'nu' | 'falta' | 'faltaCodigos'>): [string, string] {
  if (l.cat === 'historico') {
    const outros = (l.faltaCodigos ?? []).filter((f) => f !== 'historico').length;
    return [`Assinado · falta ${l.falta || 'o histórico de créditos'}`,
      outros ? `Falta o histórico e mais ${outros} documento${outros > 1 ? 's' : ''}` : 'Falta o histórico'];
  }
  if (l.cat === 'quente') {
    return l.docsManual === 'completos'
      ? ['Documentação completa · marcada pelo atendente', 'Documentação completa']
      : ['Documentação completa', 'Documentação completa'];
  }
  if (l.cat === 'documentacao') {
    if (l.docsManual === 'incompletos') return ['Documentação incompleta · marcada pelo atendente', 'Documentação incompleta'];
    const falta = [!l.docPessoal && 'documento pessoal (frente e verso)', !l.comprovante && 'comprovante de residência'].filter(Boolean) as string[];
    const curto = [!l.docPessoal && 'documento pessoal', !l.comprovante && 'comprovante'].filter(Boolean) as string[];
    return falta.length ? [`Falta ${juntar(falta)}`, `Falta ${juntar(curto)}`] : ['Documentação incompleta', 'Documentação incompleta'];
  }
  return ['Parou de responder', 'Parou de responder'];
}

/* quando a Iris passou o cliente, pelo próprio andamento:
   quente = completou a documentação (ou o atendente marcou completa);
   documentação = 24 h depois do último documento/mensagem (a regra de entrada);
   sem resposta = 24 h depois da nossa última mensagem. Prioridade 0 é do administrativo. */
const JANELA_NOVO_MS = 24 * 3_600_000;
function passouEmDe(cat: Categoria, t: { udoc?: number; ud?: number; nu?: number; manualEm?: number }): number | undefined {
  if (cat === 'quente') return t.manualEm ?? t.udoc ?? t.ud;
  /* espelha a regra de entrada da fila no banco: coalesce(último documento, última mensagem) + 24 h
     (fila_iris_itens, migration 20261111200000) — por isso udoc ?? ud, e não o mais recente dos dois */
  if (cat === 'documentacao') { const b = t.udoc ?? t.ud; return b ? b + JANELA_NOVO_MS : undefined; }
  if (cat === 'sem_resposta') return t.nu ? t.nu + JANELA_NOVO_MS : undefined;
  return undefined;
}
export function marcarNovo(l: Pick<Lead, 'cat' | 'udoc' | 'ud' | 'nu'>, manualEm?: number, agora = Date.now()): { passouEm?: number; novo?: boolean } {
  const passouEm = passouEmDe(l.cat, { udoc: l.udoc, ud: l.ud, nu: l.nu, manualEm });
  if (!passouEm || passouEm > agora + 300_000) return {};
  return { passouEm, novo: agora - passouEm <= JANELA_NOVO_MS };
}

/** uma linha do banco → cliente da fila */
export function leadDeLinha(r: LinhaFila, ordem: number): Lead {
  const marcas: Marca[] = [];
  let docsManual: Lead['docsManual'];
  let docsManualId: string | undefined;
  let manualEm: number | undefined;
  for (const m of r.marcacoes ?? []) {
    if (m.tipo === 'docs_completos' || m.tipo === 'docs_incompletos') {
      docsManual = m.tipo === 'docs_completos' ? 'completos' : 'incompletos';
      docsManualId = m.id;
      manualEm = Date.parse(m.em) || undefined;
    } else if ((TIPOS_MARCA as string[]).includes(m.tipo)) {
      marcas.push({ id: m.id, tipo: m.tipo as TipoMarca, texto: m.texto ?? undefined, vezes: m.vezes, em: Date.parse(m.em) });
    }
  }
  const base = {
    cat: r.categoria, docPessoal: r.doc_pessoal, comprovante: r.comprovante, docsManual,
    udoc: ms(r.ult_doc_em), nu: ms(r.ult_nossa_em),
    falta: juntar(faltaEmTexto(r.falta ?? [])), faltaCodigos: r.falta ?? [],
  };
  const [situacao, curta] = textosDoLead(base);
  const vinda = marcarNovo({ cat: r.categoria, udoc: base.udoc, ud: ms(r.ult_cliente_em), nu: base.nu }, docsManual === 'completos' ? manualEm : undefined);
  const lista = r.categoria === 'historico' ? 0 : r.categoria === 'quente' ? 1
    : r.categoria === 'documentacao' ? (r.doc_pessoal && !r.comprovante ? 2 : 3) : 5;
  return {
    ...base, id: r.contato_id, conversaId: r.conversa_id ?? undefined, nome: nomeBonito(r.nome, r.telefone),
    fone: foneBonito(r.telefone), atendente: equipeDoUid(r.dono_id) ?? r.dono_id ?? '', lista,
    campanha: r.campanha ?? '—', funil: r.coluna ?? '', ud: ms(r.ult_cliente_em),
    esperandoEm: r.aguardando ? ms(r.ult_cliente_em) : undefined, disse: r.ult_cliente_texto ?? '',
    docsManualId, assinadoEm: ms(r.assinado_em), entrouEm: ms(r.entrou_em), ...vinda, nota: '', planilha: '', situacao, curta, ordem, marcas,
  };
}

/** a ordem dentro de cada categoria: quem a Iris acabou de passar (24 h) fica no topo, o mais novo
    primeiro; depois quem está aguardando resposta; depois do mais recente para o mais antigo */
export function ordenarLeads(l: Lead[]): Lead[] {
  const quando = (x: Lead) => (x.cat === 'sem_resposta' ? x.nu : (x.udoc ?? x.ud)) ?? 0;
  return [...l].sort((a, b) => {
    if (a.cat === 'historico' || b.cat === 'historico') return a.ordem - b.ordem;
    const na = a.novo ? (a.passouEm ?? 0) : 0;
    const nb = b.novo ? (b.passouEm ?? 0) : 0;
    if (!!na !== !!nb) return na ? -1 : 1;
    if (na && nb) return nb - na;
    const ea = a.esperandoEm ?? 0;
    const eb = b.esperandoEm ?? 0;
    if (!!ea !== !!eb) return ea ? -1 : 1;
    if (ea && eb) return eb - ea;
    return quando(b) - quando(a) || a.ordem - b.ordem;
  });
}

/** o caminho do cliente, pelo que se sabe dele */
export type EstadoPasso = 'feito' | 'atual' | 'parou' | 'pendente';
export const PASSOS = ['Abertura', 'Qualificação', 'Proposta', 'Aceite', 'Documentos', 'Com você'] as const;
export function passosDoLead(l: Lead): EstadoPasso[] {
  const F: EstadoPasso = 'feito';
  switch (l.lista) {
    case 0: case 1: return [F, F, F, F, F, 'atual'];
    case 2: case 3: case 4: return [F, F, F, F, 'atual', 'pendente'];
    case 5: {
      /* onde o cliente parou: pelo que ele chegou a fazer (documentos mandados ou a coluna do Kanban) */
      const col = (l.funil ?? '').toLowerCase();
      if (l.docPessoal || l.comprovante || l.udoc || col.includes('document')) return [F, F, F, F, 'parou', 'pendente'];
      if (col.includes('assinar') || col.includes('aceite')) return [F, F, F, 'parou', 'pendente', 'pendente'];
      if (col.includes('qualificado') || col.includes('proposta')) return [F, F, 'parou', 'pendente', 'pendente', 'pendente'];
      return [F, 'parou', 'pendente', 'pendente', 'pendente', 'pendente'];
    }
    default: return [F, F, 'atual', 'pendente', 'pendente', 'pendente'];
  }
}

/* ---------------- demonstração: os clientes fictícios de dados.ts no mesmo formato ---------------- */
const CAT_FICTICIA: Record<string, Categoria> = { quente: 'quente', documentacao: 'documentacao', sem_resposta: 'sem_resposta' };
export function leadsFicticios(): Lead[] {
  const agora = Date.now();
  return CLIENTES.map((c: ClienteFila, ordem) => {
    const total = DOCUMENTOS[c.produto].length;
    const ok = c.cat === 'quente' ? total : docsOk(c);
    const docPessoal = c.cat === 'quente' || !!(c.docs ?? [])[0];
    const comprovante = c.cat === 'quente' || !!(c.docs ?? [])[1];
    const t = agora - c.min * 60_000;
    const base = { cat: CAT_FICTICIA[c.cat], docPessoal, comprovante, udoc: c.cat === 'documentacao' ? t : undefined, nu: c.cat === 'sem_resposta' ? t : undefined, falta: '' };
    const [situacao, curta] = textosDoLead(base);
    const vinda = marcarNovo({ cat: base.cat, udoc: base.udoc, ud: c.cat === 'quente' ? t : undefined, nu: base.nu });
    return {
      ...vinda,
      ...base, id: c.id, nome: c.nome, fone: '(51) 9' + String(10000000 + ordem * 7919).slice(0, 4) + '-' + String(1000 + ordem * 37).slice(-4),
      atendente: c.atendente, lista: c.cat === 'quente' ? 1 : c.cat === 'documentacao' ? (ok === total - 1 ? 2 : 3) : 5,
      campanha: c.canal, funil: c.cat === 'quente' ? 'Documentos' : 'Lead Qualificado', ud: c.cat === 'sem_resposta' ? t - 3_600_000 : t,
      esperandoEm: ordem % 5 === 0 ? t : undefined, disse: c.fala, nota: '', planilha: '', situacao, curta, ordem, marcas: [],
    };
  });
}
