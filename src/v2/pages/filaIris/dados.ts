/* ============================================================================
   Fila da Iris — DADOS DE DEMONSTRAÇÃO (etapa 1: só o visual).
   Nada aqui lê ou grava o banco: são clientes FICTÍCIOS para avaliar o layout.
   A automação (a Iris alimentando a fila) é a etapa 2 e ainda não existe.
   ============================================================================ */

export type Categoria = 'historico' | 'quente' | 'documentacao' | 'sem_resposta';
export type Produto = 'revisao' | 'emprestimo' | 'rmc';
export type Canal = 'JUROS' | 'ANTONIO' | 'EMPRESTIMO';
export type Preferencia = 'manha' | 'tarde' | 'mensagem';
/** onde o cliente parou com a Iris (só "Sem resposta") */
export type Parada = 'qualificacao' | 'aceite' | 'documentos';

export interface Atendente {
  id: string;
  /** id do usuário no banco (usuarios.id) */
  uid: string;
  nome: string;
  turno: { ini: number; fim: number };
  admin?: boolean;
}

/* turnos do dono (31/10): Matheus, Juliana e Isadora 9h–17h; Luiz e Giovana 13h–19h */
export const EQUIPE: Atendente[] = [
  { id: 'giovana', uid: 'a31b5fcb-d378-4490-83fe-a47a7c1ee847', nome: 'Giovana', turno: { ini: 13, fim: 19 } },
  { id: 'isadora', uid: '94f9343a-0a9f-4b4f-9bd3-804f5483170c', nome: 'Isadora', turno: { ini: 9, fim: 17 } },
  { id: 'juliana', uid: 'd7e59652-d3eb-4d7d-8830-7fc780701a8e', nome: 'Juliana', turno: { ini: 9, fim: 17 } },
  { id: 'luiz', uid: 'd189e143-6cab-49c0-98d3-b030453a3c86', nome: 'Luiz', turno: { ini: 13, fim: 19 } },
  { id: 'matheus', uid: '4ac197b4-9600-4756-81aa-1ac29280df09', nome: 'Matheus', turno: { ini: 9, fim: 17 }, admin: true },
];
export const atendente = (id: string) => EQUIPE.find((a) => a.id === id) ?? EQUIPE[EQUIPE.length - 1];
/** id da equipe a partir do id do usuário no banco */
export const equipeDoUid = (uid: string | null | undefined) => EQUIPE.find((a) => a.uid === uid)?.id;
export const turnoTexto = (a: Atendente) => `${a.turno.ini}h às ${a.turno.fim}h`;

export interface InfoCategoria {
  id: Categoria;
  ordem: number;
  rotulo: string;
  resumo: string;
  regra: string;
  entra: string;
  vazioT: string;
  vazio: string;
}

/* a ORDEM é a prioridade: quentes primeiro, sempre */
export const CATEGORIAS: InfoCategoria[] = [
  {
    /* já assinaram; fecham assim que o histórico for tirado. Vem do administrativo (CAF). Fica com quem já está. */
    id: 'historico', ordem: 0, rotulo: 'Pegar histórico de créditos',
    resumo: 'Já assinaram. Falta o histórico de créditos.',
    regra: 'na ordem do administrativo',
    entra: 'No sistema do administrativo o cliente está assinado (todas as vias do kit aprovadas) e ainda falta o histórico de créditos, às vezes junto com outro documento. Fica com o vendedor do caso e sai quando o histórico chega.',
    vazioT: 'Nenhum histórico para pegar',
    vazio: 'Quando um cliente assinar e faltar o histórico de créditos, ele aparece aqui, no topo.',
  },
  {
    id: 'quente', ordem: 1, rotulo: 'Clientes quentes',
    resumo: 'Mandou toda a documentação. Falta você fechar.',
    regra: 'quem a Iris acabou de passar primeiro; depois quem está aguardando resposta',
    entra: 'O cliente mandou toda a documentação (documento pessoal frente e verso e comprovante de residência). Sobe na hora.',
    vazioT: 'Nenhum cliente quente agora',
    vazio: 'Quando um cliente mandar toda a documentação, ele aparece aqui, no topo da fila.',
  },
  {
    id: 'documentacao', ordem: 2, rotulo: 'Documentação pendente',
    resumo: 'Mandou parte da documentação e parou há mais de 24h.',
    regra: 'quem a Iris acabou de passar primeiro; depois quem está aguardando resposta',
    entra: 'O cliente mandou parte da documentação, foi cobrado e ficou 24 horas sem mandar o resto.',
    vazioT: 'Nenhuma documentação pendente',
    vazio: 'Quando faltar algum documento para seguir, o cliente aparece aqui.',
  },
  {
    id: 'sem_resposta', ordem: 3, rotulo: 'Sem resposta',
    resumo: 'Parou de responder há mais de 24h. Recupere o contato.',
    regra: 'quem a Iris acabou de passar primeiro; depois quem parou mais recentemente',
    entra: 'O cliente começou o atendimento, recebeu a nossa mensagem e ficou 24 horas sem responder.',
    vazioT: 'Ninguém parado',
    vazio: 'Quando um cliente ficar 24 horas sem responder, ele aparece aqui para você recuperar.',
  },
];
export const infoCategoria = (c: Categoria) => CATEGORIAS.find((x) => x.id === c)!;

export const PRODUTO: Record<Produto, string> = {
  revisao: 'Revisão de juros',
  emprestimo: 'Empréstimo',
  rmc: 'Cartão RMC',
};

/* documentos por produto: [nome completo, nome curto para a lista] */
export const DOCUMENTOS: Record<Produto, [string, string][]> = {
  revisao: [
    ['Documento com foto (RG ou CNH)', 'documento com foto'],
    ['Comprovante de residência', 'comprovante de residência'],
    ['Extrato de Empréstimo Consignado (Meu INSS)', 'extrato do Meu INSS'],
    ['Contrato do empréstimo pessoal', 'contrato do empréstimo'],
  ],
  emprestimo: [
    ['Documento com foto (RG ou CNH)', 'documento com foto'],
    ['Comprovante de residência', 'comprovante de residência'],
    ['Extrato de Empréstimo Consignado (Meu INSS)', 'extrato do Meu INSS'],
    ['Histórico de créditos do benefício', 'histórico de créditos'],
  ],
  rmc: [
    ['Documento com foto (RG ou CNH)', 'documento com foto'],
    ['Comprovante de residência', 'comprovante de residência'],
    ['Extrato de Empréstimo Consignado (Meu INSS)', 'extrato do Meu INSS'],
    ['Fatura do cartão RMC', 'fatura do cartão'],
  ],
};

export interface ClienteFila {
  id: string;
  nome: string;
  g: 'f' | 'm';
  atendente: string;
  cat: Categoria;
  produto: Produto;
  canal: Canal;
  pensionista?: boolean;
  financeiras?: string[];
  /** minutos: quente/documentação = há quanto está na fila; sem resposta = há quanto parou */
  min: number;
  /** última mensagem do cliente (fictícia) */
  fala: string;
  pref?: Preferencia;
  /** documentos entregues, na ordem de DOCUMENTOS[produto] */
  docs?: boolean[];
  parou?: Parada;
  /** áudios de retomada que a Iris já mandou */
  tentativas?: number;
}

const D = (s: string) => s.split('').map((c) => c === '1');

/* 32 clientes fictícios: 9 quentes, 10 com documentação pendente, 13 sem resposta */
export const CLIENTES: ClienteFila[] = [
  // ---------------- Matheus
  { id: 'c01', nome: 'Dirce Aparecida Moraes', g: 'f', atendente: 'matheus', cat: 'quente', produto: 'revisao', canal: 'JUROS', financeiras: ['Agibank', 'Crefisa'], min: 142, pref: 'tarde', fala: 'Pode fazer sim. Me liga à tarde que eu tô em casa.' },
  { id: 'c02', nome: 'José Ribamar Costa', g: 'm', atendente: 'matheus', cat: 'quente', produto: 'revisao', canal: 'ANTONIO', financeiras: ['BMG'], min: 38, pref: 'mensagem', fala: 'Quero sim, pode encaminhar que eu assino.' },
  { id: 'c03', nome: 'Neusa Fernandes Lima', g: 'f', atendente: 'matheus', cat: 'quente', produto: 'rmc', canal: 'JUROS', pensionista: true, min: 12, pref: 'manha', fala: 'Mandei tudo. Amanhã cedo pode me ligar.' },
  { id: 'c04', nome: 'Antônio Carlos Siqueira', g: 'm', atendente: 'matheus', cat: 'documentacao', produto: 'revisao', canal: 'JUROS', financeiras: ['Facta', 'Mercantil'], docs: D('1101'), min: 95, fala: 'Vou pedir pro meu neto tirar esse extrato do INSS.' },
  { id: 'c05', nome: 'Terezinha de Jesus Prado', g: 'f', atendente: 'matheus', cat: 'documentacao', produto: 'emprestimo', canal: 'EMPRESTIMO', docs: D('1000'), min: 1560, fala: 'O comprovante tá no nome do meu marido, serve?' },
  { id: 'c06', nome: 'Valdemar Rocha', g: 'm', atendente: 'matheus', cat: 'documentacao', produto: 'revisao', canal: 'ANTONIO', financeiras: ['Agibank'], docs: D('1110'), min: 50, fala: 'O contrato eu tenho em papel, posso mandar foto?' },
  { id: 'c07', nome: 'Iracema Gomes', g: 'f', atendente: 'matheus', cat: 'sem_resposta', produto: 'revisao', canal: 'JUROS', financeiras: ['Crefisa'], parou: 'aceite', tentativas: 1, min: 1560, fala: 'Vou ver com a minha filha e te falo.' },
  { id: 'c08', nome: 'Osvaldo Pereira Santos', g: 'm', atendente: 'matheus', cat: 'sem_resposta', produto: 'emprestimo', canal: 'EMPRESTIMO', parou: 'qualificacao', tentativas: 2, min: 4300, fala: 'Qual banco vocês são?' },
  { id: 'c09', nome: 'Lurdes Machado', g: 'f', atendente: 'matheus', cat: 'sem_resposta', produto: 'revisao', canal: 'ANTONIO', pensionista: true, financeiras: ['Agibank', 'BMG'], parou: 'documentos', docs: D('1000'), tentativas: 1, min: 520, fala: 'Amanhã eu mando o resto.' },

  // ---------------- Juliana
  { id: 'c10', nome: 'Benedita Alves Cruz', g: 'f', atendente: 'juliana', cat: 'quente', produto: 'revisao', canal: 'JUROS', financeiras: ['Mercantil'], min: 64, pref: 'manha', fala: 'Pode sim, quero resolver isso logo.' },
  { id: 'c11', nome: 'Sebastião Nogueira', g: 'm', atendente: 'juliana', cat: 'quente', produto: 'rmc', canal: 'ANTONIO', min: 18, pref: 'tarde', fala: 'Tá certo, me liga depois do almoço.' },
  { id: 'c12', nome: 'Maria do Carmo Ribeiro', g: 'f', atendente: 'juliana', cat: 'documentacao', produto: 'revisao', canal: 'JUROS', financeiras: ['Crefisa', 'Facta'], docs: D('1100'), min: 180, fala: 'Não sei entrar no Meu INSS.' },
  { id: 'c13', nome: 'Geraldo Batista', g: 'm', atendente: 'juliana', cat: 'documentacao', produto: 'emprestimo', canal: 'EMPRESTIMO', docs: D('1110'), min: 75, fala: 'O histórico eu pego amanhã no banco.' },
  { id: 'c14', nome: 'Aparecida Lopes', g: 'f', atendente: 'juliana', cat: 'sem_resposta', produto: 'revisao', canal: 'JUROS', financeiras: ['Agibank'], parou: 'aceite', tentativas: 1, min: 1900, fala: 'E se não der certo eu pago alguma coisa?' },
  { id: 'c15', nome: 'João Batista Freitas', g: 'm', atendente: 'juliana', cat: 'sem_resposta', produto: 'emprestimo', canal: 'EMPRESTIMO', parou: 'qualificacao', tentativas: 2, min: 2900, fala: 'Recebo pelo INSS sim.' },
  { id: 'c16', nome: 'Zilda Marques', g: 'f', atendente: 'juliana', cat: 'sem_resposta', produto: 'rmc', canal: 'ANTONIO', parou: 'aceite', tentativas: 1, min: 700, fala: 'Deixa eu pensar.' },

  // ---------------- Giovana (turno da tarde: a Iris só oferece "à tarde")
  { id: 'c17', nome: 'Clarice Duarte', g: 'f', atendente: 'giovana', cat: 'quente', produto: 'revisao', canal: 'JUROS', financeiras: ['BMG', 'Crefisa'], min: 88, pref: 'tarde', fala: 'Pode fazer, minha filha vai me ajudar a assinar.' },
  { id: 'c18', nome: 'Nelson Teixeira', g: 'm', atendente: 'giovana', cat: 'documentacao', produto: 'revisao', canal: 'ANTONIO', financeiras: ['Agibank'], docs: D('0101'), min: 240, fala: 'Meu RG tá vencido, a carteira de motorista serve?' },
  { id: 'c19', nome: 'Rosa Maria Campos', g: 'f', atendente: 'giovana', cat: 'documentacao', produto: 'rmc', canal: 'JUROS', pensionista: true, docs: D('1100'), min: 130, fala: 'Vou mandar a fatura quando chegar.' },
  { id: 'c20', nome: 'Ademir Souza', g: 'm', atendente: 'giovana', cat: 'sem_resposta', produto: 'revisao', canal: 'JUROS', financeiras: ['Facta'], parou: 'qualificacao', tentativas: 1, min: 1300, fala: 'Tenho empréstimo em dois lugares.' },
  { id: 'c21', nome: 'Ivone Barbosa', g: 'f', atendente: 'giovana', cat: 'sem_resposta', produto: 'emprestimo', canal: 'EMPRESTIMO', parou: 'aceite', tentativas: 2, min: 3600, fala: 'Quanto que eu consigo pegar?' },

  // ---------------- Isadora
  { id: 'c22', nome: 'Hilda Moreira', g: 'f', atendente: 'isadora', cat: 'quente', produto: 'revisao', canal: 'JUROS', financeiras: ['Agibank'], min: 41, pref: 'manha', fala: 'Quero sim. Amanhã de manhã pode me ligar.' },
  { id: 'c23', nome: 'Waldir Antunes', g: 'm', atendente: 'isadora', cat: 'quente', produto: 'emprestimo', canal: 'EMPRESTIMO', min: 9, pref: 'mensagem', fala: 'Mandei os documentos todos, confere aí.' },
  { id: 'c24', nome: 'Conceição Farias', g: 'f', atendente: 'isadora', cat: 'documentacao', produto: 'revisao', canal: 'ANTONIO', financeiras: ['Mercantil', 'BMG'], docs: D('1010'), min: 160, fala: 'O comprovante de luz serve?' },
  { id: 'c25', nome: 'Raimundo Nonato Silva', g: 'm', atendente: 'isadora', cat: 'sem_resposta', produto: 'revisao', canal: 'JUROS', financeiras: ['Crefisa'], parou: 'documentos', docs: D('1000'), tentativas: 1, min: 1500, fala: 'Vou procurar os papéis.' },
  { id: 'c26', nome: 'Odete Cardoso', g: 'f', atendente: 'isadora', cat: 'sem_resposta', produto: 'rmc', canal: 'ANTONIO', pensionista: true, parou: 'aceite', tentativas: 1, min: 400, fala: 'Meu filho cuida dessas coisas pra mim.' },

  // ---------------- Luiz (turno da tarde)
  { id: 'c27', nome: 'Ermelinda Pires', g: 'f', atendente: 'luiz', cat: 'quente', produto: 'revisao', canal: 'ANTONIO', financeiras: ['Agibank', 'Facta'], min: 27, pref: 'tarde', fala: 'Pode encaminhar sim, tô esperando a ligação.' },
  { id: 'c28', nome: 'Jair Monteiro', g: 'm', atendente: 'luiz', cat: 'documentacao', produto: 'emprestimo', canal: 'EMPRESTIMO', docs: D('1100'), min: 210, fala: 'Esse extrato do INSS é onde?' },
  { id: 'c29', nome: 'Luzia Rezende', g: 'f', atendente: 'luiz', cat: 'documentacao', produto: 'revisao', canal: 'JUROS', financeiras: ['BMG'], docs: D('1110'), min: 35, fala: 'Achei o contrato, mando já.' },
  { id: 'c30', nome: 'Manoel Tavares', g: 'm', atendente: 'luiz', cat: 'sem_resposta', produto: 'revisao', canal: 'JUROS', financeiras: ['Agibank'], parou: 'aceite', tentativas: 1, min: 1100, fala: 'Vou conversar com a minha esposa primeiro.' },
  { id: 'c31', nome: 'Cecília Andrade', g: 'f', atendente: 'luiz', cat: 'sem_resposta', produto: 'emprestimo', canal: 'EMPRESTIMO', pensionista: true, parou: 'qualificacao', tentativas: 2, min: 2600, fala: 'Sou pensionista.' },
  { id: 'c32', nome: 'Durval Lacerda', g: 'm', atendente: 'luiz', cat: 'sem_resposta', produto: 'rmc', canal: 'ANTONIO', parou: 'aceite', tentativas: 1, min: 610, fala: 'Mas esse cartão eu nunca pedi.' },
];

/* ---------------------------------------------------------------- helpers */

/** quente esperando há mais de 2 h: "esfriando" (o tempo fica em vermelho) */
export const ESFRIANDO_MIN = 120;

export const docsOk = (c: ClienteFila) => (c.docs ?? DOCUMENTOS[c.produto].map(() => true)).filter(Boolean).length;
export const docsTotal = (c: ClienteFila) => DOCUMENTOS[c.produto].length;
export const docsFaltando = (c: ClienteFila) =>
  DOCUMENTOS[c.produto].filter((_, i) => !(c.docs ?? [])[i]);

export function ordenar(lista: ClienteFila[], cat: Categoria): ClienteFila[] {
  const l = [...lista];
  if (cat === 'quente') return l.sort((a, b) => b.min - a.min);
  if (cat === 'documentacao') return l.sort((a, b) => docsOk(b) - docsOk(a) || b.min - a.min);
  return l.sort((a, b) => a.min - b.min);
}

export function haQuanto(min: number): string {
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  if (min < 24 * 60) return `há ${Math.floor(min / 60)}h`;
  const d = Math.floor(min / (24 * 60));
  return d === 1 ? 'há 1 dia' : `há ${d} dias`;
}

const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
/** "hoje 14:05" / "ontem 16:40" / "seg 10:05" — relativo a agora */
export function quando(minAtras: number, agora = new Date()): string {
  const d = new Date(agora.getTime() - minAtras * 60_000);
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const dia0 = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate()).getTime();
  if (d.getTime() >= dia0) return `hoje ${hm}`;
  if (d.getTime() >= dia0 - 86_400_000) return `ontem ${hm}`;
  return `${DIAS[d.getDay()]} ${hm}`;
}

export const beneficio = (c: ClienteFila) =>
  c.pensionista ? 'Pensionista do INSS' : c.g === 'f' ? 'Aposentada pelo INSS' : 'Aposentado pelo INSS';

const juntar = (l: string[]) => (l.length <= 1 ? l.join('') : `${l.slice(0, -1).join(', ')} e ${l[l.length - 1]}`);
export const financeirasTexto = (c: ClienteFila) => juntar(c.financeiras ?? []);
export { juntar };

export function interesse(c: ClienteFila): string {
  if (c.produto === 'revisao') return `Revisão dos juros do empréstimo pessoal${c.financeiras?.length ? ` (${financeirasTexto(c)})` : ''}`;
  if (c.produto === 'emprestimo') return 'Empréstimo: análise pré-aprovada';
  return 'Cancelamento do cartão RMC e ressarcimento dos descontos';
}

export function proposta(c: ClienteFila): string {
  if (c.produto === 'revisao') return 'Nada a pagar para começar · 30% só no final, sobre o que for ressarcido';
  if (c.produto === 'emprestimo') return 'O valor só sai depois da análise dos documentos';
  return 'Nada a pagar para começar';
}

export const PREF_TEXTO: Record<Preferencia, string> = {
  manha: 'Ligação de manhã',
  tarde: 'Ligação à tarde',
  mensagem: 'Mensagem pela conversa',
};

export const PARADA_TEXTO: Record<Parada, string> = {
  qualificacao: 'Parou na qualificação',
  aceite: 'Parou depois da proposta',
  documentos: 'Parou nos documentos',
};

/** a linha curta que aparece na lista */
export function resumoLinha(c: ClienteFila): string {
  if (c.cat === 'quente') {
    const o = c.produto === 'revisao' ? `Aceitou a revisão${c.financeiras?.length ? ` (${financeirasTexto(c)})` : ''}`
      : c.produto === 'rmc' ? 'Aceitou o cancelamento do RMC' : 'Aceitou seguir com a análise';
    return `${o} · prefere ${c.pref === 'mensagem' ? 'mensagem' : c.pref === 'manha' ? 'ligação de manhã' : 'ligação à tarde'}`;
  }
  if (c.cat === 'documentacao') {
    const f = docsFaltando(c).map((d) => d[1]);
    return `Falta${f.length > 1 ? 'm' : ''} ${juntar(f)}`;
  }
  return `${PARADA_TEXTO[c.parou ?? 'aceite']} · a Iris mandou ${c.tentativas ?? 1} ${c.tentativas === 2 ? 'áudios' : 'áudio'} de retomada`;
}

/* -------------------------------------------- o caminho do cliente com a Iris */
export type EstadoEtapa = 'feito' | 'atual' | 'parou' | 'pendente';
export const ETAPAS = [
  { id: 'apresentacao', rot: 'Abertura' },
  { id: 'qualificacao', rot: 'Qualificação' },
  { id: 'proposta', rot: 'Proposta' },
  { id: 'aceite', rot: 'Aceite' },
  { id: 'documentos', rot: 'Documentos' },
  { id: 'voce', rot: 'Com você' },
] as const;

export function estadosEtapas(c: ClienteFila): EstadoEtapa[] {
  if (c.cat === 'quente') return ['feito', 'feito', 'feito', 'feito', 'feito', 'atual'];
  if (c.cat === 'documentacao') return ['feito', 'feito', 'feito', 'feito', 'atual', 'pendente'];
  const i = ETAPAS.findIndex((e) => e.id === c.parou);
  return ETAPAS.map((_, k) => (k < i ? 'feito' : k === i ? 'parou' : 'pendente'));
}

export interface Evento { min: number; texto: string; de: 'iris' | 'cliente' | 'sistema' }

/** histórico fictício do cliente com a Iris (mais recente primeiro) */
export function historico(c: ClienteFila): Evento[] {
  const dono = atendente(c.atendente).nome;
  const ev: Evento[] = [];
  const base = c.min;
  const qualif = c.produto === 'revisao'
    ? `${beneficio(c)}, empréstimo pessoal ${c.financeiras?.length ? `no ${financeirasTexto(c)}` : ''}`.trim()
    : c.produto === 'rmc' ? `${beneficio(c)}, desconto do cartão RMC no benefício` : `${beneficio(c)}, quer empréstimo`;
  const nomeProp = c.produto === 'revisao' ? 'a proposta da revisão' : c.produto === 'rmc' ? 'a proposta do cancelamento' : 'a análise pré-aprovada';
  if (c.cat === 'quente') {
    ev.push({ min: base, texto: `Passou para ${dono} fechar`, de: 'sistema' });
    ev.push({ min: base + 4, texto: `Recebeu os ${docsTotal(c)} documentos`, de: 'cliente' });
    ev.push({ min: base + 46, texto: 'Cliente aceitou seguir', de: 'cliente' });
    ev.push({ min: base + 52, texto: `Apresentou ${nomeProp}`, de: 'iris' });
    ev.push({ min: base + 61, texto: `Qualificou: ${qualif}`, de: 'iris' });
    ev.push({ min: base + 70, texto: 'Se apresentou (texto e áudio)', de: 'iris' });
    ev.push({ min: base + 71, texto: `Chegou pelo canal ${c.canal}`, de: 'sistema' });
  } else if (c.cat === 'documentacao') {
    ev.push({ min: base, texto: `Passou para ${dono}: faltam ${docsTotal(c) - docsOk(c)} documento${docsTotal(c) - docsOk(c) > 1 ? 's' : ''}`, de: 'sistema' });
    ev.push({ min: base + 8, texto: `Recebeu ${docsOk(c)} de ${docsTotal(c)} documentos`, de: 'cliente' });
    ev.push({ min: base + 15, texto: 'Mandou a lista de documentos (texto e áudio)', de: 'iris' });
    ev.push({ min: base + 18, texto: 'Cliente aceitou seguir', de: 'cliente' });
    ev.push({ min: base + 24, texto: `Apresentou ${nomeProp}`, de: 'iris' });
    ev.push({ min: base + 33, texto: `Qualificou: ${qualif}`, de: 'iris' });
    ev.push({ min: base + 41, texto: 'Se apresentou (texto e áudio)', de: 'iris' });
    ev.push({ min: base + 42, texto: `Chegou pelo canal ${c.canal}`, de: 'sistema' });
  } else {
    const n = c.tentativas ?? 1;
    ev.push({ min: Math.max(1, base - 400), texto: `Passou para ${dono} recuperar`, de: 'sistema' });
    for (let k = n; k >= 1; k--) ev.push({ min: Math.max(2, base - 120 * k), texto: `${k}º áudio de retomada, sem resposta`, de: 'iris' });
    ev.push({ min: base, texto: `Cliente parou de responder: "${c.fala}"`, de: 'cliente' });
    if (c.parou !== 'qualificacao') {
      if (c.parou === 'documentos') {
        ev.push({ min: base + 10, texto: 'Mandou a lista de documentos (texto e áudio)', de: 'iris' });
        ev.push({ min: base + 14, texto: 'Cliente aceitou seguir', de: 'cliente' });
      }
      ev.push({ min: base + 20, texto: `Apresentou ${nomeProp}`, de: 'iris' });
      ev.push({ min: base + 28, texto: `Qualificou: ${qualif}`, de: 'iris' });
    }
    ev.push({ min: base + 36, texto: 'Se apresentou (texto e áudio)', de: 'iris' });
    ev.push({ min: base + 37, texto: `Chegou pelo canal ${c.canal}`, de: 'sistema' });
  }
  return ev;
}

/** telefone fictício estável por cliente */
export function telefone(c: ClienteFila): string {
  let h = 7;
  for (const ch of c.id + c.nome) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const n = String(h % 100_000_000).padStart(8, '0');
  return `(51) 9${n.slice(0, 4)}-${n.slice(4)}`;
}

/* -------------------------------------------- a conversa com a Iris (fictícia) */
export interface Mensagem {
  de: 'cliente' | 'iris' | 'sistema';
  tipo: 'texto' | 'audio' | 'arquivo';
  texto?: string;
  dur?: string;
  min: number;
}

/* abertura DITADA pelo dono (31/10) — literal */
const ABERTURA_IRIS = 'Oi, tudo bem? Aqui é a Iris, sou atendente virtual da CAF. Como que eu posso te ajudar hoje? Seria referente a empréstimo, processos referente à revisão de juros abusivo e cancelamento dos cartões RMC.';

/** a conversa inteira do cliente com a Iris, da mais antiga para a mais recente */
export function conversa(c: ClienteFila): Mensagem[] {
  const dono = atendente(c.atendente);
  const sr = c.g === 'f' ? 'a senhora' : 'o senhor';
  const Sr = c.g === 'f' ? 'A senhora' : 'O senhor';
  const aposentado = c.g === 'f' ? 'aposentada' : 'aposentado';
  const m: Mensagem[] = [];
  const cli = (min: number, texto: string) => m.push({ de: 'cliente', tipo: 'texto', texto, min });
  const iris = (min: number, texto: string) => m.push({ de: 'iris', tipo: 'texto', texto, min });
  const audio = (min: number, dur: string, de: 'iris' | 'cliente' = 'iris') => m.push({ de, tipo: 'audio', dur, min });
  const arq = (min: number, texto: string) => m.push({ de: 'cliente', tipo: 'arquivo', texto, min });
  const sis = (min: number, texto: string) => m.push({ de: 'sistema', tipo: 'texto', texto, min });

  /* tempos: os mesmos do histórico (historico()) para as duas leituras baterem */
  const b = c.min;
  const ini = c.cat === 'quente' ? b + 71 : c.cat === 'documentacao' ? b + 42 : b + 37;
  const entrada = c.canal === 'EMPRESTIMO' ? 'Olá, quero saber sobre empréstimo'
    : c.canal === 'JUROS' ? 'Olá! Vi o anúncio sobre juros abusivos e gostaria de saber mais.' : 'Boa tarde, vi a propaganda de vocês';
  cli(ini, entrada);
  iris(ini - 1, ABERTURA_IRIS);
  audio(ini - 1, '0:12');
  cli(ini - 4, c.produto === 'revisao' ? 'É sobre a revisão dos juros' : c.produto === 'rmc' ? 'É sobre o cartão RMC que desconta no meu benefício' : 'Quero ver um empréstimo');
  iris(ini - 6, `${Sr} é ${aposentado} ou pensionista do INSS?`);

  const pergFin = c.produto === 'revisao'
    ? `E ${sr} tem empréstimo pessoal em alguma destas financeiras: Agibank, BMG, Facta, Mercantil ou Crefisa?`
    : c.produto === 'rmc' ? `${Sr} tem desconto de cartão RMC no benefício?` : `${Sr} já tem empréstimo consignado descontando no benefício?`;
  const respFin = c.produto === 'revisao' ? `Tenho no ${financeirasTexto(c) || 'Agibank'}` : c.produto === 'rmc' ? 'Tenho, desconta todo mês' : 'Tenho dois';

  /* parou na qualificação: a fala dele é a resposta sobre o benefício, e a Iris ficou sem retorno na pergunta seguinte */
  if (c.cat === 'sem_resposta' && c.parou === 'qualificacao') {
    cli(b, c.fala);
    iris(b - 1, pergFin);
  } else {
    cli(ini - 8, c.pensionista ? 'Sou pensionista' : `Sou ${aposentado} sim`);
    iris(ini - 9, pergFin);
    cli(ini - 12, respFin);
    const tProp = c.cat === 'quente' ? b + 52 : c.cat === 'documentacao' ? b + 24 : b + 20;
    audio(tProp, c.produto === 'revisao' ? '0:41' : '0:33');
    iris(tProp, c.produto === 'revisao'
      ? `Para começar ${sr} não paga nada. Os 30% são só no final, sobre o que for ressarcido.`
      : c.produto === 'rmc'
        ? `Dá para pedir o cancelamento do cartão e o ressarcimento dos descontos. Para começar ${sr} não paga nada.`
        : 'O seu empréstimo está pré-aprovado para análise. O valor só sai depois que o atendente analisar os documentos.');

    if (c.cat === 'sem_resposta' && c.parou === 'aceite') {
      cli(b, c.fala);
    } else {
      const tAce = c.cat === 'quente' ? b + 46 : c.cat === 'documentacao' ? b + 18 : b + 14;
      cli(tAce, 'Quero sim, pode seguir');
      const lista = DOCUMENTOS[c.produto].map(([n]) => `• ${n}`).join('\n');
      iris(tAce - 1, `Para dar entrada, preciso destes documentos:\n${lista}`);
      audio(tAce - 1, '0:18');
      const ok = DOCUMENTOS[c.produto].filter((_, i) => c.cat === 'quente' || !!(c.docs ?? [])[i]);
      const tDoc = c.cat === 'quente' ? b + 6 : c.cat === 'documentacao' ? b + 9 : b + 6;
      ok.forEach(([n], i) => arq(tDoc - i * 0.2, n));
      if (c.cat === 'quente') {
        const turno = dono.turno.ini >= 12 ? 'Prefere que ele ligue à tarde ou que mande mensagem?' : 'Prefere que ele ligue ou que mande mensagem? De manhã ou à tarde?';
        iris(b + 3, `Recebi tudo, obrigada! ${dono.nome === 'Luiz' || dono.nome === 'Matheus' ? 'O' : 'A'} ${dono.nome} vai finalizar com ${sr}. ${turno}`);
        cli(b + 2, c.fala);
        sis(b, `A Iris passou o atendimento para ${dono.nome}`);
      } else if (c.cat === 'documentacao') {
        const f = docsFaltando(c).map((d) => d[0]);
        iris(b + 5, `Recebi, obrigada! Ainda falta${f.length > 1 ? 'm' : ''}:\n${f.map((n) => `• ${n}`).join('\n')}`);
        cli(b + 2, c.fala);
        sis(b, `A Iris passou o atendimento para ${dono.nome}`);
      } else {
        cli(b, c.fala);
      }
    }
  }

  /* sem resposta: os áudios de retomada da Iris e a passagem para o atendente */
  if (c.cat === 'sem_resposta') {
    const n = c.tentativas ?? 1;
    for (let k = 1; k <= n; k++) audio(Math.max(2, b - 120 * k), '0:15');
    sis(Math.max(1, b - 400), `A Iris passou o atendimento para ${dono.nome}`);
  }
  return m.map((x, i) => ({ x, i })).sort((p, q) => q.x.min - p.x.min || p.i - q.i).map((p) => p.x);
}

/* -------------------------------------------- marcações do atendente (dono 11/11)
   "liguei, não atendeu, ligar de novo", "recuperar a senha do Meu INSS", "ficou de mandar…",
   "falta tal coisa": ficam GRAVADAS no cliente e aparecem na lista quando ele olhar de novo.
   Na prévia ficam só na memória da página (o real grava no banco). */
export type TipoMarca = 'nao_atendeu' | 'recuperar_senha' | 'mandar_senha' | 'mandar_doc' | 'falta';
export interface Marca {
  id: string;
  tipo: TipoMarca;
  /** só "falta": o que ficou faltando */
  texto?: string;
  /** só "não atendeu": quantas ligações sem resposta */
  vezes?: number;
  /** quando foi marcado (epoch ms) */
  em: number;
}

export const MARCAS: { tipo: TipoMarca; botao: string; tom: 'ambar' | 'azul' }[] = [
  { tipo: 'nao_atendeu', botao: 'Liguei, não atendeu', tom: 'ambar' },
  { tipo: 'recuperar_senha', botao: 'Recuperar a senha do Meu INSS', tom: 'azul' },
  { tipo: 'mandar_senha', botao: 'Ficou de mandar a senha do Meu INSS', tom: 'azul' },
  { tipo: 'mandar_doc', botao: 'Ficou de mandar documento', tom: 'azul' },
  { tipo: 'falta', botao: 'Falta outra coisa…', tom: 'azul' },
];
export const tomMarca = (t: TipoMarca) => MARCAS.find((m) => m.tipo === t)?.tom ?? 'azul';

/* grupos das marcações (dono 11/11: "mais organizado e melhor de visualizar") — a ordem é a de urgência */
export type GrupoMarca = 'ligacao' | 'inss' | 'docs';
export const GRUPOS_MARCA: { id: GrupoMarca; rotulo: string; filtro: string; tipos: TipoMarca[] }[] = [
  { id: 'ligacao', rotulo: 'Ligação', filtro: 'Ligar de novo', tipos: ['nao_atendeu'] },
  { id: 'inss', rotulo: 'Meu INSS', filtro: 'Senha do Meu INSS', tipos: ['recuperar_senha', 'mandar_senha'] },
  { id: 'docs', rotulo: 'Documentos', filtro: 'Documentos', tipos: ['mandar_doc', 'falta'] },
];
export const grupoMarca = (t: TipoMarca): GrupoMarca => GRUPOS_MARCA.find((g) => g.tipos.includes(t))?.id ?? 'docs';
const ORDEM_TIPO: TipoMarca[] = ['nao_atendeu', 'recuperar_senha', 'mandar_senha', 'mandar_doc', 'falta'];
/** em ordem de urgência (ligar de novo primeiro), e dentro do tipo a mais recente primeiro */
export const ordenarMarcas = (l: Marca[]) => [...l].sort((a, b) => ORDEM_TIPO.indexOf(a.tipo) - ORDEM_TIPO.indexOf(b.tipo) || b.em - a.em);

/** o texto curto que aparece na fila */
export function curtoMarca(m: Marca): string {
  if (m.tipo === 'nao_atendeu') return 'Ligar de novo';
  if (m.tipo === 'recuperar_senha') return 'Recuperar senha do INSS';
  if (m.tipo === 'mandar_senha') return 'Vai mandar a senha do INSS';
  if (m.tipo === 'mandar_doc') return 'Vai mandar documento';
  return `Falta: ${m.texto ?? ''}`;
}

/** o texto que fica marcado no cliente (na lista e na janela) */
export function textoMarca(m: Marca): string {
  if (m.tipo === 'nao_atendeu') return (m.vezes ?? 1) > 1 ? `Ligar de novo · não atendeu ${m.vezes}x` : 'Ligar de novo · não atendeu';
  if (m.tipo === 'recuperar_senha') return 'Recuperar a senha do Meu INSS';
  if (m.tipo === 'mandar_senha') return 'Ficou de mandar a senha do Meu INSS';
  if (m.tipo === 'mandar_doc') return 'Ficou de mandar documento';
  return `Falta: ${m.texto ?? ''}`;
}

/* exemplos já marcados na demonstração (para a lista não abrir vazia de marcações) */
const atras = (min: number) => Date.now() - min * 60_000;
export function marcasIniciais(): Record<string, Marca[]> {
  return {
    c01: [{ id: 'm1', tipo: 'nao_atendeu', vezes: 1, em: atras(25) }],
    c04: [{ id: 'm2', tipo: 'recuperar_senha', em: atras(70) }],
    c05: [{ id: 'm3', tipo: 'mandar_doc', em: atras(200) }, { id: 'm4', tipo: 'falta', texto: 'comprovante no nome dela', em: atras(180) }],
    c07: [{ id: 'm5', tipo: 'nao_atendeu', vezes: 2, em: atras(300) }],
    c12: [{ id: 'm6', tipo: 'recuperar_senha', em: atras(100) }],
    c17: [{ id: 'm7', tipo: 'mandar_senha', em: atras(40) }],
  };
}
