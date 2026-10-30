import type { WaContact, WaMessage } from '@/data/whatsappDemo';
import type { MembroEquipe } from '@/data/supervisao';

/* ------------------------------------------------------------------
   Demo do Painel da Equipe (vite --mode demo): cinco celulares com
   clientes, números e conversas FICTÍCIOS. Os ids da equipe são os do
   demo do Dashboard (dashboardV5.demo), então os números de desempenho
   de cada pessoa saem da mesma fixture que a tabela do Dashboard.
   Áudios: vozes sintéticas em public/demo-midia (texto fictício).
   "Ao vivo": enquanto a tela está aberta, a cada 7–13 s um cliente
   escreve ou um atendente responde — o mesmo efeito que o realtime da
   lista do inbox produz no sistema real.
   ------------------------------------------------------------------ */

export const EQUIPE_DEMO: MembroEquipe[] = [
  { id: 'demo-u-giovana', nome: 'Giovana', papel: 'atendente' },
  { id: 'demo-u-isadora', nome: 'Isadora', papel: 'atendente' },
  { id: 'demo-u-juliana', nome: 'Juliana', papel: 'atendente' },
  { id: 'demo-u-luiz', nome: 'Luiz', papel: 'atendente' },
  { id: 'demo-u-matheus', nome: 'Matheus', papel: 'admin' },
];
const FEMININO = new Set(['demo-u-giovana', 'demo-u-isadora', 'demo-u-juliana']);

/* ---------------- roteiros ---------------- */

/** Uma linha do fio: `antes` = minutos antes da última mensagem da conversa. */
interface Linha { dir: 'in' | 'out'; antes: number; texto: string; m?: Partial<WaMessage> }
const C = (antes: number, texto: string, m?: Partial<WaMessage>): Linha => ({ dir: 'in', antes, texto, m });
const A = (antes: number, texto: string, m?: Partial<WaMessage>): Linha => ({ dir: 'out', antes, texto, m });
const ROBO: Partial<WaMessage> = { origemBot: true };
/** public/demo-midia, relativo ao base do build (a demo também roda como arquivo local) */
const MIDIA = `${import.meta.env.BASE_URL}demo-midia/`;
const voz = (arquivo: string, seconds: number): Partial<WaMessage> =>
  ({ tipo: 'audio', localUrl: MIDIA + arquivo, mime: 'audio/mp4', seconds } as Partial<WaMessage>);
const foto = (arquivo: string): Partial<WaMessage> => ({ tipo: 'imagem', localUrl: MIDIA + arquivo, mime: 'image/jpeg', nome: arquivo });
const pdf = (nome: string, tamanho: number): Partial<WaMessage> => ({ tipo: 'documento', nome, tamanho, mime: 'application/pdf' });

interface Ctx {
  /** "dona Maria" / "seu Antônio" */
  trat: string;
  /** carimbo de assinatura das mensagens enviadas pelo painel */
  ass: string;
  /** como o cliente chama quem atende */
  voc: string;
  /** o primeiro nome de quem atende */
  eu: string;
}
type Roteiro = (x: Ctx) => Linha[];
const cap = (s: string) => s.charAt(0).toLocaleUpperCase('pt-BR') + s.slice(1);

const R: Record<string, Roteiro> = {
  robo: () => [
    C(14, 'Olá! Vi o anúncio sobre juros abusivos e quero saber mais.'),
    A(13, 'Olá! Aqui é o Matheo, assistente virtual da CAF Assessoria. Vou fazer algumas perguntas rápidas para entender o seu caso, tudo bem?', ROBO),
    C(11, 'Tudo bem'),
    A(11, 'Você recebe algum benefício do INSS, como aposentadoria ou pensão?', ROBO),
    C(8, 'Sim, recebo aposentadoria'),
    A(8, 'Ótimo! E você tem empréstimo pessoal em algum destes bancos: *Agibank, Crefisa, BMG, Mercantil ou Sicoob*?', ROBO),
    C(0, 'Tenho no Agibank e na Crefisa'),
  ],
  maria: ({ ass }) => [
    C(25, 'Olá, vi o anúncio de vocês'),
    A(25, 'Olá! Aqui é o Matheo, assistente virtual da CAF Assessoria. Como posso te chamar?', ROBO),
    C(22, '', voz('voz-cliente-maria.m4a', 13)),
    A(19, `${ass}Oi, dona Maria! Pode ficar tranquila que eu vou te ajudar. Consegue me mandar uma foto da carta do banco?`),
    C(1, '', foto('extrato-ficticio.jpg')),
    C(0, 'Tá aqui, é essa'),
  ],
  documentos: ({ ass, trat }) => [
    A(95, `${ass}Bom dia, ${trat}! Para seguir com a análise, preciso de uma foto do seu documento com foto e de um comprovante de residência.`),
    C(4, '', voz('voz-cliente-sebastiao.m4a', 10)),
    C(1, 'Comprovante de residência', foto('conta-luz-ficticia.jpg')),
    C(0, 'E esse é o extrato do empréstimo', foto('extrato-ficticio.jpg')),
  ],
  analise: ({ ass, trat }) => [
    A(200, `${ass}${cap(trat)}, terminei a análise do seu contrato com o Agibank. Os juros cobrados estão bem acima da média do mercado para empréstimo pessoal.`),
    A(199, '', pdf('Analise-contrato-Agibank.pdf', 248_000)),
    C(150, 'Nossa, não sabia disso'),
    C(149, 'E o que eu preciso fazer agora?'),
    A(120, '', voz('voz-atendente-isadora.m4a', 11)),
    C(62, '', voz('voz-cliente-terezinha.m4a', 7)),
    A(60, 'Combinado! Assim que tiver novidade te aviso por aqui. Qualquer dúvida é só chamar 😊'),
  ],
  audioLuiz: () => [
    C(140, 'Oi! O senhor conseguiu ver o meu extrato?'),
    A(120, '', voz('voz-atendente-luiz.m4a', 12)),
    C(101, 'Entendi. Pode seguir então'),
    A(100, 'Ótimo! Vou preparar a documentação e te envio ainda hoje.'),
  ],
  fechado: ({ ass, trat, voc }) => [
    A(400, `${ass}${cap(trat)}, contrato assinado e protocolado! A partir de agora eu acompanho tudo e te mantenho informado por aqui.`),
    C(381, `Muito obrigado, ${voc}. Deus abençoe 🙏`),
    A(380, 'Amém! Conte comigo 🙌'),
  ],
  novidade: ({ ass, trat }) => [
    A(1500, `${ass}Olá, ${trat}! O seu processo segue em andamento. Assim que tiver novidade te aviso.`),
    C(0, 'Olá. Alguma novidade do meu processo?'),
  ],
  ligacao: ({ trat }) => [
    A(16, `${cap(trat)}, consigo te ligar daqui a pouco para explicar os próximos passos?`),
    C(1, 'Pode ser mais tarde? Minha filha vai estar em casa'),
    A(0, 'Perfeito, combinado então. Até mais!'),
  ],
  aplicativo: () => [
    C(2, 'Não consegui entrar no aplicativo do banco'),
    C(0, 'Pede uma senha que eu não lembro'),
  ],
  filha: () => [
    C(16, 'Esse é o número da minha filha, pode falar com ela também'),
    C(16, '📇 Patrícia (filha)', { contato: { nome: 'Patrícia (filha)', telefone: '5551999812233' } }),
    A(0, 'Obrigada! Já salvei aqui e vou falar com ela também 👍'),
  ],
  naoElegivel: ({ ass, trat }) => [
    A(120, 'Para seguir, preciso saber: você tem empréstimo pessoal em algum destes bancos: *Agibank, Crefisa, BMG, Mercantil ou Sicoob*?', ROBO),
    C(60, 'Não, o meu é consignado da Caixa'),
    A(0, `${ass}Entendi, ${trat}. Nesse caso não conseguimos ajudar com a revisão, mas obrigado pelo contato!`),
  ],
  citada: () => [
    A(130, 'Pode me confirmar a sua data de nascimento, por favor?'),
    C(0, 'Já te mandei ontem, olha aí', { quoted: { remetente: 'Você', texto: 'Pode me confirmar a sua data de nascimento, por favor?' } }),
  ],
  lembrete: ({ ass, trat }) => [
    A(0, `${ass}Olá, ${trat}! Passando para lembrar que ainda falta o extrato do empréstimo para concluir a sua análise 📄`, { status: 'entregue' }),
  ],
  assinatura: ({ ass, trat }) => [
    A(50, `${ass}${cap(trat)}, te enviei o contrato para assinatura digital por SMS. É só tocar no link e seguir os passos 👍`),
    C(1, 'Assinei agora'),
    C(0, 'Deu certo?'),
  ],
  comprovante: () => [
    C(1, 'Segue o comprovante de residência', foto('conta-luz-ficticia.jpg')),
    C(0, 'Serve esse?'),
  ],
  transferido: ({ trat, eu }) => [
    C(90, 'Olá, preciso de ajuda com o meu processo', {}),
    A(80, 'Atendimento transferido de Juliana para ' + eu, { tipo: 'sistema' }),
    A(80, 'Cliente prefere contato depois das 17h — a filha ajuda com o celular.', { tipo: 'nota_interna' }),
    A(78, `Olá, ${trat}! Sou ${eu === 'Luiz' || eu === 'Matheus' ? 'o' : 'a'} ${eu} e agora vou cuidar do seu atendimento 😊`),
    C(0, `Oi ${eu}, obrigada`),
  ],
};

/* ---------------- quem fala com quem ---------------- */

interface Conv {
  r: keyof typeof R;
  nome: string;
  tel: string;
  /** feminino: "dona"; masculino: "seu" */
  g: 'f' | 'm';
  /** minutos desde a última mensagem */
  fim: number;
  canal?: string;
  etapa?: string;
  naoLidas?: number;
  fixada?: boolean;
  arquivada?: boolean;
  semNome?: boolean;
}

const H = 60, D = 24 * 60;
const CARTEIRAS: Record<string, Conv[]> = {
  'demo-u-giovana': [
    { r: 'maria', nome: 'Maria Aparecida Souza', tel: '5551988124407', g: 'f', fim: 3, etapa: 'Documentação', naoLidas: 2 },
    { r: 'robo', nome: '', tel: '5551997342210', g: 'f', fim: 18, semNome: true, etapa: 'Lead novo', canal: 'JUROS ABUSIVO' },
    { r: 'novidade', nome: 'Benedito Ramos', tel: '5551996021180', g: 'm', fim: 41, etapa: 'Em análise', naoLidas: 1 },
    { r: 'ligacao', nome: 'Iracema Duarte', tel: '5551984410077', g: 'f', fim: 74, etapa: 'Em análise' },
    { r: 'lembrete', nome: 'Neusa Pacheco', tel: '5551991235566', g: 'f', fim: 3 * H, etapa: 'Documentação' },
    { r: 'fechado', nome: 'Osvaldo Prado', tel: '5551985547712', g: 'm', fim: 5 * H, etapa: 'Fechado' },
    { r: 'filha', nome: 'Zilda Oliveira', tel: '5551992218845', g: 'f', fim: 20 * H, etapa: 'Em análise' },
    { r: 'naoElegivel', nome: 'Arlindo Farias', tel: '5551981104433', g: 'm', fim: 26 * H, etapa: 'Não elegível' },
    { r: 'assinatura', nome: 'Celina Brandão', tel: '5551993349901', g: 'f', fim: 2 * D, etapa: 'Contrato', naoLidas: 0 },
    { r: 'lembrete', nome: 'Ademir Batista', tel: '5551987730026', g: 'm', fim: 4 * D, etapa: 'Documentação' },
    { r: 'fechado', nome: 'Doralice Matos', tel: '5551994456620', g: 'f', fim: 6 * D, etapa: 'Fechado', fixada: true },
  ],
  'demo-u-isadora': [
    { r: 'analise', nome: 'Terezinha Moraes Alves', tel: '5551989907715', g: 'f', fim: 12, etapa: 'Proposta', fixada: true },
    { r: 'assinatura', nome: 'Dalva Rezende', tel: '5551996612290', g: 'f', fim: 1, etapa: 'Contrato', naoLidas: 2 },
    { r: 'citada', nome: 'Hélio Antunes', tel: '5551984078812', g: 'm', fim: 9, etapa: 'Documentação', naoLidas: 1 },
    { r: 'ligacao', nome: 'Raimundo Coelho', tel: '5551990014478', g: 'm', fim: 35, etapa: 'Em análise' },
    { r: 'fechado', nome: 'Eunice Tavares', tel: '5551986632209', g: 'f', fim: 2 * H, etapa: 'Fechado' },
    { r: 'lembrete', nome: 'Gilberto Assis', tel: '5551995541136', g: 'm', fim: 6 * H, etapa: 'Documentação' },
    { r: 'transferido', nome: 'Lurdes Teixeira', tel: '5551982290064', g: 'f', fim: 20 * H, etapa: 'Em análise' },
    { r: 'robo', nome: '', tel: '5551984550192', g: 'm', fim: 21 * H, semNome: true, etapa: 'Lead novo', canal: 'ANTONIO CAMPANHA' },
    { r: 'fechado', nome: 'Elza Ventura', tel: '5551997765503', g: 'f', fim: 3 * D, etapa: 'Fechado' },
    { r: 'naoElegivel', nome: 'Moacir Lacerda', tel: '5551988840017', g: 'm', fim: 5 * D, etapa: 'Não elegível', arquivada: true },
  ],
  'demo-u-juliana': [
    { r: 'robo', nome: 'Jurandir Moreira', tel: '5551991207781', g: 'm', fim: 2, etapa: 'Lead novo', canal: 'JUROS ABUSIVO' },
    { r: 'aplicativo', nome: 'Pedro Henrique Dias', tel: '5551983316640', g: 'm', fim: 6, etapa: 'Documentação', naoLidas: 2 },
    { r: 'comprovante', nome: 'Cleusa Barros', tel: '5551994470023', g: 'f', fim: 27, etapa: 'Documentação', naoLidas: 2 },
    { r: 'assinatura', nome: 'Nair Fonseca', tel: '5551985518834', g: 'f', fim: 48, etapa: 'Contrato', naoLidas: 2 },
    { r: 'novidade', nome: 'Ivone Castro dos Santos', tel: '5551992263317', g: 'f', fim: 3 * H + 20, etapa: 'Em análise', naoLidas: 1 },
    { r: 'naoElegivel', nome: 'Valdir Gonçalves', tel: '5551987721150', g: 'm', fim: 4 * H, etapa: 'Não elegível' },
    { r: 'ligacao', nome: 'Rosa Maria Pinto', tel: '5551989954402', g: 'f', fim: 5 * H, etapa: 'Em análise' },
    { r: 'fechado', nome: 'Leonor Sampaio', tel: '5551996647719', g: 'f', fim: 22 * H, etapa: 'Fechado' },
    { r: 'robo', nome: '', tel: '5551991207720', g: 'f', fim: D + 30, semNome: true, etapa: 'Lead novo', canal: 'EMPRESTIMO' },
    { r: 'lembrete', nome: 'Waldemar Cruz', tel: '5551983309951', g: 'm', fim: 2 * D, etapa: 'Documentação' },
    { r: 'citada', nome: 'Marlene Rocha', tel: '5551990087713', g: 'f', fim: 3 * D, etapa: 'Documentação', naoLidas: 1 },
    { r: 'filha', nome: 'Conceição Lopes', tel: '5551997712284', g: 'f', fim: 5 * D, etapa: 'Em análise', arquivada: true },
  ],
  'demo-u-luiz': [
    { r: 'documentos', nome: 'Sebastião Ribeiro Nunes', tel: '5551985562294', g: 'm', fim: 8, etapa: 'Documentação', naoLidas: 3 },
    { r: 'audioLuiz', nome: 'Antônio Pereira Lima', tel: '5551987770001', g: 'm', fim: 15, etapa: 'Contrato', fixada: true },
    { r: 'assinatura', nome: 'Geraldo Mendes', tel: '5551993380045', g: 'm', fim: 22, etapa: 'Contrato', naoLidas: 2 },
    { r: 'fechado', nome: 'Dirceu Vieira', tel: '5551981147756', g: 'm', fim: 5 * H, etapa: 'Fechado' },
    { r: 'naoElegivel', nome: 'Ivo Siqueira', tel: '5551994408823', g: 'm', fim: 20 * H, etapa: 'Não elegível' },
    { r: 'ligacao', nome: 'Laércio Nogueira', tel: '5551986675530', g: 'm', fim: 2 * D, etapa: 'Em análise' },
    { r: 'lembrete', nome: 'Nilton Correia', tel: '5551995523348', g: 'm', fim: 3 * D, etapa: 'Documentação' },
    { r: 'novidade', nome: 'Alzira Monteiro', tel: '5551983361192', g: 'f', fim: 4 * D, etapa: 'Em análise', naoLidas: 1 },
    { r: 'robo', nome: '', tel: '5551980034417', g: 'm', fim: 6 * D, semNome: true, etapa: 'Lead novo', canal: 'ANTONIO CAMPANHA' },
  ],
  'demo-u-matheus': [
    { r: 'novidade', nome: 'Odete Ferreira Carvalho', tel: '5551988813324', g: 'f', fim: 50, etapa: 'Fechado', naoLidas: 1 },
    { r: 'aplicativo', nome: 'José Carlos Ferreira', tel: '5551987770019', g: 'm', fim: 58, etapa: 'Documentação', naoLidas: 0 },
    { r: 'fechado', nome: 'Euclides Rangel', tel: '5551992240061', g: 'm', fim: 3 * H, etapa: 'Fechado' },
    { r: 'ligacao', nome: 'Berenice Quintana', tel: '5551985590037', g: 'f', fim: 5 * H, etapa: 'Em análise' },
    { r: 'naoElegivel', nome: 'Otávio Fagundes', tel: '5551981178824', g: 'm', fim: 21 * H, etapa: 'Não elegível' },
    { r: 'fechado', nome: 'Sônia Regina Paz', tel: '5551996634410', g: 'f', fim: 2 * D, etapa: 'Fechado', fixada: true },
    { r: 'lembrete', nome: 'Valter Peixoto', tel: '5551993320078', g: 'm', fim: 3 * D, etapa: 'Documentação' },
    { r: 'filha', nome: 'Carmem Lúcia Dantas', tel: '5551989941156', g: 'f', fim: 5 * D, etapa: 'Em análise' },
    { r: 'citada', nome: 'Moisés Araújo', tel: '5551984467702', g: 'm', fim: 8 * D, etapa: 'Documentação', naoLidas: 0 },
    { r: 'assinatura', nome: 'Zuleica Moura', tel: '5551990052239', g: 'f', fim: 12 * D, etapa: 'Contrato', arquivada: true },
  ],
};

/* ---------------- montagem ---------------- */

const hhmm = (ms: number) => { const d = new Date(ms); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); };
const REAIS = (m: WaMessage) => m.tipo !== 'sistema' && m.tipo !== 'nota_interna';

/** Deriva os campos da lista (preview, aguardando, horários) das mensagens — como o mapConversa faz no real. */
function derivar(c: WaContact, msgs: WaMessage[], naoLidas?: number): WaContact {
  const reais = msgs.filter(REAIS);
  const ult = reais[reais.length - 1] ?? msgs[msgs.length - 1];
  const ultMs = ult?.tsISO ? Date.parse(ult.tsISO) : Date.now();
  const aguardando = !!ult && ult.dir === 'in';
  let fila = 0;
  for (let i = reais.length - 1; i >= 0 && reais[i].dir === 'in'; i--) fila++;
  return {
    ...c,
    msgs,
    aguardando,
    aguardandoDesde: aguardando ? ult.tsISO ?? null : null,
    lastAtMs: ultMs,
    time: hhmm(ultMs),
    unread: aguardando ? naoLidas ?? fila : 0,
    last: ult?.text || (ult?.tipo === 'audio' ? 'Mensagem de voz' : ult?.tipo === 'imagem' ? 'Imagem' : ult?.tipo === 'documento' ? 'Documento' : ''),
  };
}

/** Conversa que terminou há mais de 1 h fica entre 12h e 20h: a demo nunca mostra cliente
 *  escrevendo de madrugada, a qualquer hora que a prévia for aberta. */
function fimNoHorario(cv: Conv, agora: number): number {
  const ms = agora - cv.fim * 60_000;
  if (cv.fim < 60) return ms;
  const d = new Date(ms), h = d.getHours();
  if (h >= 12 && h < 20) return ms;
  if (h < 12) d.setDate(d.getDate() - 1);
  d.setHours(17, 5 + (cv.fim % 50), 0, 0);
  return d.getTime();
}

function montarConversa(dono: string, k: number, cv: Conv, agora: number): { c: WaContact; msgs: WaMessage[] } {
  const id = `sv-${dono.replace('demo-u-', '')}-${k}`;
  const primeiro = cv.nome.split(' ')[0] || 'cliente';
  const eu = EQUIPE_DEMO.find((m) => m.id === dono)?.nome ?? '';
  const ctx: Ctx = {
    trat: cv.semNome ? 'tudo bem' : `${cv.g === 'f' ? 'dona' : 'seu'} ${primeiro}`,
    ass: `*${eu} – CAF:*\n`,
    voc: FEMININO.has(dono) ? 'moça' : 'moço',
    eu,
  };
  const linhas = R[cv.r](ctx);
  // o roteiro conta os minutos a partir da ÚLTIMA linha: normaliza para a última cair em `fim`
  const zero = Math.min(...linhas.map((l) => l.antes));
  const ultIn = Math.max(-1, ...linhas.map((l, i) => (l.dir === 'in' ? i : -1)));
  const fimMs = fimNoHorario(cv, agora);
  const msgs: WaMessage[] = linhas.map((l, i) => {
    const ms = fimMs - (l.antes - zero) * 60_000 + i * 1_000;   // +i s: a ordem do roteiro vence empate de minuto
    const minAtras = (agora - ms) / 60_000;
    const evento = l.m?.tipo === 'sistema' || l.m?.tipo === 'nota_interna';
    const saida = l.dir === 'out' && !evento;
    const status = !saida ? undefined
      : l.m?.status ?? (i < ultIn ? 'lida' : minAtras < 3 ? 'enviada' : minAtras < 90 ? 'entregue' : 'lida');
    return {
      id: `${id}-${i}`,
      dir: l.dir,
      text: l.texto,
      tipo: 'texto',
      time: hhmm(ms),
      tsISO: new Date(ms).toISOString(),
      dataISO: new Date(ms).toISOString().slice(0, 10),
      viaTelefone: saida && !l.m?.origemBot && !l.texto.startsWith('*'),
      ...l.m,
      status,
    } as WaMessage;
  });
  const base: WaContact = {
    id, name: cv.semNome ? cv.tel : cv.nome, phone: cv.tel, chip: cv.canal ?? 'EMPRESTIMO', canalAtual: cv.canal ?? 'EMPRESTIMO',
    time: '', unread: 0, tabs: [], status: 'Em atendimento', aberta: true,
    last: '', email: '', stage: cv.etapa ?? '', etapa: cv.etapa ?? null, resp: eu, respId: dono, origin: 'WhatsApp',
    tags: [], lastInter: '', notes: '', doc: null, msgs: [],
    fixada: !!cv.fixada, arquivada: !!cv.arquivada,
    iaAtiva: cv.r === 'robo', iaStatus: cv.r === 'robo' ? 'ativa' : null,
    contatoId: `${id}-ct`,
  };
  return { c: derivar(base, msgs, cv.naoLidas), msgs };
}

export interface EstadoDemo {
  conversas: WaContact[];
  mensagens: Map<string, WaMessage[]>;
}

function montarDemo(): EstadoDemo {
  const agora = Date.now();
  const conversas: WaContact[] = [];
  const mensagens = new Map<string, WaMessage[]>();
  for (const [dono, lista] of Object.entries(CARTEIRAS)) {
    lista.forEach((cv, k) => {
      const { c, msgs } = montarConversa(dono, k, cv, agora);
      conversas.push(c);
      mensagens.set(c.id, msgs);
    });
  }
  return { conversas, mensagens };
}

/* ---------------- loja viva ---------------- */

let estado: EstadoDemo | null = null;
const ouvintes = new Set<() => void>();
let relogio: number | null = null;
let seq = 0;

export function lerDemo(): EstadoDemo {
  if (!estado) estado = montarDemo();
  return estado;
}

function publicar(novo: EstadoDemo) {
  estado = novo;
  for (const f of ouvintes) f();
}

/** Grava uma mensagem nova no fio e refaz o cartão da conversa (como o realtime faz no real). */
function acrescentar(conversaId: string, m: Partial<WaMessage> & Pick<WaMessage, 'dir'>, naoLidasExtra = 0) {
  const atual = lerDemo();
  const c = atual.conversas.find((x) => x.id === conversaId);
  if (!c) return;
  const agora = Date.now();
  const msg = {
    id: `${conversaId}-v${++seq}`, tipo: 'texto', text: '', time: hhmm(agora),
    tsISO: new Date(agora).toISOString(), dataISO: new Date(agora).toISOString().slice(0, 10), ...m,
  } as WaMessage;
  const msgs = [...(atual.mensagens.get(conversaId) ?? []), msg];
  const mensagens = new Map(atual.mensagens);
  mensagens.set(conversaId, msgs);
  const naoLidas = msg.dir === 'in' ? (c.aguardando ? c.unread : 0) + 1 + naoLidasExtra : 0;
  const novo = derivar({ ...c, arquivada: false }, msgs, naoLidas);
  publicar({ conversas: atual.conversas.map((x) => (x.id === conversaId ? novo : x)), mensagens });
  return msg.id;
}

function trocarStatus(conversaId: string, msgId: string, status: string) {
  const atual = lerDemo();
  const msgs = atual.mensagens.get(conversaId);
  if (!msgs) return;
  const mensagens = new Map(atual.mensagens);
  const novas = msgs.map((m) => (m.id === msgId ? { ...m, status } : m));
  mensagens.set(conversaId, novas);
  const c = atual.conversas.find((x) => x.id === conversaId);
  publicar({
    conversas: c ? atual.conversas.map((x) => (x.id === conversaId ? derivar(x, novas, x.unread) : x)) : atual.conversas,
    mensagens,
  });
}

const FALAS_CLIENTE = [
  'Oi, tudo bem?', 'Mandei agora', 'Pode me ligar mais tarde?', 'Ok, fico no aguardo',
  'Obrigada pela atenção!', 'Consegui tirar a foto do documento', 'Tá certo', 'Vocês atendem amanhã?',
];
const FALAS_EQUIPE = [
  'Recebido! Já estou conferindo aqui.', 'Perfeito, te ligo em 5 minutos.', 'Obrigado! Já encaminhei para a análise.',
  'Tudo certo por aqui, seguimos com o seu processo 👍', 'Oi! Já te respondo com os detalhes.',
];
const sorteio = <T,>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];

function tique() {
  if (typeof document !== 'undefined' && document.hidden) return;
  const atual = lerDemo();
  const vivas = atual.conversas.filter((c) => !c.arquivada && Date.now() - (c.lastAtMs ?? 0) < 3 * 24 * 3_600_000);
  if (!vivas.length) return;
  const esperando = vivas.filter((c) => c.aguardando);
  if (esperando.length && Math.random() < 0.45) {
    // alguém da equipe responde o cliente que está esperando
    const c = sorteio(esperando);
    const id = acrescentar(c.id, { dir: 'out', text: sorteio(FALAS_EQUIPE), status: 'enviada', viaTelefone: true });
    if (id) {
      window.setTimeout(() => trocarStatus(c.id, id, 'entregue'), 2_500);
      window.setTimeout(() => trocarStatus(c.id, id, 'lida'), 7_000);
    }
    return;
  }
  const c = sorteio(vivas);
  if (Math.random() < 0.15) acrescentar(c.id, { dir: 'in', ...voz('voz-cliente-terezinha.m4a', 7) });
  else acrescentar(c.id, { dir: 'in', text: sorteio(FALAS_CLIENTE) });
}

function agendar() {
  relogio = window.setTimeout(() => { tique(); if (relogio !== null) agendar(); }, 7_000 + Math.random() * 6_000);
}

export function assinarDemo(f: () => void): () => void {
  ouvintes.add(f);
  if (relogio === null && typeof window !== 'undefined') agendar();
  return () => {
    ouvintes.delete(f);
    if (!ouvintes.size && relogio !== null) { window.clearTimeout(relogio); relogio = null; }
  };
}
