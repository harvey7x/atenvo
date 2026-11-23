/* ============================================================================
   Fila da Iris — de onde vêm os dados. A mesma tela nos três jeitos:
   - local: demonstração (clientes fictícios) e prévia (foto dos dados de hoje); marcações na página;
   - real: o banco (fonteReal.ts). Este arquivo não fala com o banco (a prévia em HTML usa só ele).
   ============================================================================ */
import { useEffect, useMemo, useState, type ComponentType } from 'react';
import { HORAS_MARCACAO, type Marca, type TipoMarca } from './dados';
import { TEXTO_SENHA_OCULTA, docsCompletos, marcarNovo, soPelaSenha, textosDoLead, type Lead } from './lead';
import { registrarFilaLocal, useDonosLocais } from './recados';
import { mexerFilaDemo, useFilaDemo } from './filaDemo';

export type Periodo = 'hoje' | '7d' | 'mes' | 'mes_ant';
export interface NumeroAtendente { atendente: string; recebidos: number; fechados: number; /** marcações feitas no período (fila_iris_marcacoes_numeros) */ marcacoes?: number }

/* ---------------------------------------------------------------- dono 14/11: a Iris agora e os adicionados */
/** as categorias em que a Iris passa um cliente para a fila */
export type CategoriaChegada = 'quente' | 'documentacao' | 'sem_resposta';
/** quantos clientes a Iris PASSOU para a fila de cada atendente no período, por categoria (o registro do "a Iris
    passou para você", fila_iris_avisos) — dono 14/11: "foi adicionado no dia 13 clientes sem resposta para o Matheus" */
export interface Chegadas {
  /** por atendente (id da equipe) */
  por: Record<string, Partial<Record<CategoriaChegada, number>>>;
  /** começo do registro: o período que começa antes conta só daqui em diante */
  desde: number | null;
}
/** um cliente que a Iris está atendendo agora (fila_iris_iris_agora: a régua do selo "Iris atendendo" do WhatsApp) */
export interface ClienteIris {
  contatoId: string;
  conversaId: string;
  nome: string;
  fone: string;
  /** id da equipe ('matheus'…); outro uid = alguém fora da equipe; null = sem dono */
  dono: string | null;
  /** o tráfego: a campanha da ORIGEM do lead (diego · juros · antonio · antonio2 · outros) */
  campanha: string;
  /** o número em que a Iris conversa com ele */
  numero: string | null;
  /** a campanha desse número (a tela mostra o número só quando ela é diferente do tráfego de origem) */
  numeroCampanha?: string | null;
  /** a etapa da Iris (ia_sessoes.etapa) */
  etapa: string | null;
  /** começo do atendimento da Iris (a sessão) */
  desde: number;
  ultCliente?: number;
  ultNossa?: number;
  /** de onde saiu a nossa última: 'bot' = a Iris; 'telefone' = celular; o resto = atendente pelo painel */
  ultNossaOrigem?: string | null;
  /** o cliente já respondeu a Iris neste atendimento (escreveu depois da 1ª mensagem dela); null = ela ainda não escreveu */
  respondeuIris?: boolean | null;
  /** a Iris pediu um atendente (o motivo) */
  pediuHumano?: string | null;
  /** a categoria na fila, se ele já está nela */
  categoriaFila?: string | null;
}
export interface IrisAgora {
  clientes: ClienteIris[];
  /** quando a lista foi lida (o "há X" e os grupos contam a partir daqui) */
  lidaEm: number;
  /** a última leitura falhou (a lista mostra a anterior; sem anterior, o aviso) */
  erro?: string | null;
}

export interface FonteFila {
  modo: 'demo' | 'previa' | 'real';
  /** o que aparece ao lado do título ("Prévia · dados de hoje", "Demonstração"…) */
  rotulo: string;
  carregando: boolean;
  erro: string | null;
  leads: Lead[];
  marcar: (id: string, tipo: TipoMarca, texto?: string) => void;
  tirarMarca: (id: string, marcaId: string) => void;
  /** dono 16/11: o atendente diz o que fez e o prazo da marcação recomeça (36 h); falha = Error com a frase */
  atualizarMarca?: (id: string, marcaId: string, texto: string) => Promise<void>;
  /** correção manual da leitura dos documentos (null = volta ao automático) */
  corrigirDocs: (id: string, estado: 'completos' | 'incompletos' | null) => void;
  tirarDaFila: (id: string) => void;
  numeros: (p: Periodo) => NumeroAtendente[] | null;
  /** relê a fila agora (o real; local não precisa) — o "Ver na fila" do aviso da Iris pede a fila fresca */
  recarregar?: () => Promise<void>;
  /** a conversa com o cliente na ficha (dono 12/11: "aqui eu quero que apareça a conversa com o cliente"). É um
      GANCHO no real (lê o histórico como o WhatsApp); na demonstração/prévia, uma conversa de exemplo */
  usarConversa?: (l: Lead) => ConversaFicha;
  /** o REAL: a seção inteira da conversa COMPLETA, com fotos e áudios (ConversaWa.tsx — a mesma bolha do WhatsApp;
      fica fora da prévia para ela não carregar o WhatsApp) */
  SecaoConversa?: ComponentType<{ l: Lead }>;
  /** quantos a Iris passou para a fila de cada atendente no período (dono 14/11); null = ainda não leu */
  chegadas?: (p: Periodo) => Chegadas | null;
  /** os clientes que a Iris está atendendo agora (dono 14/11); só o administrador recebe */
  irisAgora?: IrisAgora | null;
  /** dono 19/11: o banco já põe quem passou a senha do INSS na Prioridade (os textos da tela dizem isso só então;
      o banco antigo e a chave desligada mandam a coluna vazia) */
  senhaLigada?: boolean;
}

/** uma mensagem da conversa, como a ficha mostra */
export interface MensagemFicha {
  id: string;
  dir: 'in' | 'out';
  texto: string;
  /** texto | imagem | audio | video | documento */
  tipo: string;
  em: number;
  /** a nossa: veio da IA (robô/Iris) ou do celular */
  quem?: 'ia' | 'celular';
  transcricao?: string;
}
export interface ConversaFicha { mensagens: MensagemFicha[] | null; carregando: boolean; erro: string | null; exemplo?: 'demo' | 'previa' }

/** a conversa de EXEMPLO da demonstração e da prévia (no real são as mensagens de verdade): o caminho de sempre
    (a Iris abre, o cliente responde, os documentos) e termina na última mensagem do cliente que a fila conhece */
export function conversaDeExemplo(l: Lead, modo: 'demo' | 'previa'): ConversaFicha {
  const fim = l.ud ?? l.nu ?? Date.now() - 60 * 60_000;
  const t = (min: number) => fim - min * 60_000;
  const nome = l.nome.split(/\s+/)[0] ?? '';
  const m: MensagemFicha[] = [
    { id: 'e1', dir: 'out', quem: 'ia', tipo: 'texto', em: t(180), texto: `Olá${nome ? `, ${nome}` : ''}! Aqui é a Iris, da CAF. Vi que você pediu informações sobre o seu benefício. Posso te ajudar?` },
    { id: 'e2', dir: 'in', tipo: 'texto', em: t(170), texto: 'Oi, pode sim' },
    { id: 'e3', dir: 'out', quem: 'ia', tipo: 'texto', em: t(165), texto: 'Para começar, me mande uma foto do seu documento com foto (frente e verso) e um comprovante de residência.' },
  ];
  /* Prioridade pela documentação completa ou só pela senha do INSS (dono 19/11): as imagens são as que chegaram */
  const comTudo = l.cat === 'quente' && docsCompletos(l);
  const soSenha = soPelaSenha(l);
  const imagens = comTudo ? 2 : soSenha ? Number(!!l.docPessoal) + Number(!!l.comprovante) : l.cat === 'documentacao' || l.docPessoal ? 1 : 0;
  if (imagens >= 1) m.push({ id: 'e4', dir: 'in', tipo: 'imagem', em: t(120), texto: 'Imagem' });
  if (imagens >= 2) m.push({ id: 'e5', dir: 'in', tipo: 'imagem', em: t(110), texto: 'Imagem' });
  if (comTudo) m.push({ id: 'e6', dir: 'out', quem: 'ia', tipo: 'texto', em: t(100), texto: 'Recebi tudo, obrigado! Já passei para o seu atendente seguir com você.' });
  if (soSenha) m.push({ id: 'e6', dir: 'out', quem: 'ia', tipo: 'texto', em: t(100), texto: 'Recebi a sua senha do gov.br, obrigado! Já passei para o seu atendente seguir com você.' });
  if (l.cat === 'documentacao') m.push({ id: 'e5', dir: 'out', quem: 'ia', tipo: 'texto', em: t(100), texto: 'Recebi o documento. Falta só o comprovante de residência para seguir.' });
  if (l.cat === 'sem_resposta') m.push({ id: 'e5', dir: 'out', quem: 'ia', tipo: 'texto', em: t(60), texto: 'Oi! Conseguiu separar os documentos? Estou aqui para te ajudar.' });
  /* a última mensagem do cliente que a fila conhece (texto ou "[audio]"/"[imagem]"…) fecha a conversa; a que parece
     senha vem trocada pelo banco e aparece como aviso, não como fala do cliente */
  const disse = l.disse.replace(/\s+/g, ' ').trim();
  const midia = disse.match(/^\[(\w+)\]$/);
  if (disse === TEXTO_SENHA_OCULTA) m.push({ id: 'e9', dir: 'in', tipo: 'oculta', em: fim, texto: '' });
  else if (midia) m.push({ id: 'e9', dir: 'in', tipo: midia[1] === 'image' ? 'imagem' : midia[1], em: fim, texto: '' });
  else if (disse) m.push({ id: 'e9', dir: 'in', tipo: 'texto', em: fim, texto: disse });
  return { mensagens: m.sort((a, b) => a.em - b.em), carregando: false, erro: null, exemplo: modo };
}

/** começo do período (horário de Brasília). Mês = o mês da casa, do dia 11 ao dia 10 (regra do placar do CAF). */
export function inicioPeriodo(p: Periodo, agora = new Date()): Date {
  const d = new Date(agora);
  if (p === '7d') return new Date(agora.getTime() - 7 * 86_400_000);
  d.setHours(0, 0, 0, 0);
  if (p === 'hoje') return d;
  if (d.getDate() < 11) d.setMonth(d.getMonth() - 1);
  d.setDate(11);
  if (p === 'mes_ant') d.setMonth(d.getMonth() - 1);
  return d;
}

/** fim do período: agora; o mês passado termina onde o mês atual começa */
export function fimPeriodo(p: Periodo, agora = new Date()): Date {
  return p === 'mes_ant' ? inicioPeriodo('mes', agora) : new Date(agora.getTime() + 60_000);
}

/** "11/10 a 10/11", "11/11 até agora"… para a nota dos números */
export function textoPeriodo(p: Periodo, agora = new Date()): string {
  const dm = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  if (p === 'hoje') return `hoje, ${dm(agora)}`;
  if (p === '7d') return 'últimos 7 dias';
  const ini = inicioPeriodo(p, agora);
  if (p === 'mes') return `mês da casa, ${dm(ini)} até hoje`;
  const fim = new Date(inicioPeriodo('mes', agora).getTime() - 86_400_000);
  return `mês da casa, ${dm(ini)} a ${dm(fim)}`;
}

/* recalcula a categoria e os textos quando o atendente corrige a documentação (só no modo local), como o banco faz:
   marcada completa = documento e comprovante recebidos; incompleta = nenhum dos dois; sem marcação = a leitura
   automática (guardada em docsAuto para o "voltar à leitura automática") */
export function comDocs(l: Lead, estado: 'completos' | 'incompletos' | null, agora = Date.now()): Lead {
  const docsManual = estado ?? undefined;
  const auto = l.docsAuto ?? { docPessoal: l.docPessoal, comprovante: l.comprovante };
  const docPessoal = estado === 'completos' ? true : estado === 'incompletos' ? false : auto.docPessoal;
  const comprovante = estado === 'completos' ? true : estado === 'incompletos' ? false : auto.comprovante;
  const automatico = docPessoal && comprovante ? 'quente' : 'documentacao';
  const cat = l.cat === 'historico' || l.cat === 'sem_resposta' && !estado ? l.cat
    /* dono 19/11: com a senha do INSS, continua em Prioridade (a correção muda só o que falta) */
    : l.senha ? 'quente'
      : docsManual === 'completos' ? 'quente' : docsManual === 'incompletos' ? 'documentacao' : automatico;
  const novo: Lead = { ...l, cat, docsManual, docPessoal, comprovante, docsAuto: estado ? auto : undefined };
  const [situacao, curta] = textosDoLead(novo);
  const soSenha = soPelaSenha(novo);
  /* o "A Iris passou" como o banco: só pela senha não tem; marcada completa conta da marcação */
  const vinda = soSenha ? {} : marcarNovo(novo, estado === 'completos' ? agora : undefined, agora);
  const lista = cat === 'historico' ? 0 : cat === 'quente' && !soSenha ? 1
    : cat === 'documentacao' || soSenha ? (docPessoal && !comprovante ? 2 : 3) : l.lista;
  return { ...novo, novo: vinda.novo, passouEm: vinda.passouEm, lista, situacao, curta };
}

/* ---------------------------------------------------------------- as marcações no modo local (fila e aviso) */
const PRAZO_MS = HORAS_MARCACAO * 3_600_000;
/** o +1 do "Liguei, não atendeu": conta a ligação e recomeça o prazo (como o banco); sem a marcação, ela nasce */
export function comMaisUmaLigacao(l: Lead, agora = Date.now()): Lead {
  const ja = l.marcas.find((m) => m.tipo === 'nao_atendeu');
  const venceEm = agora + PRAZO_MS;
  const nova: Marca = ja ? { ...ja, vezes: (ja.vezes ?? 1) + 1, em: agora, venceEm } : { id: `m${agora}`, tipo: 'nao_atendeu', vezes: 1, em: agora, venceEm };
  return { ...l, marcas: [nova, ...l.marcas.filter((m) => m.tipo !== 'nao_atendeu')] };
}
/** "o que foi feito": o prazo recomeça e a última atualização fica guardada */
export function comMarcaAtualizada(l: Lead, marcaId: string, texto: string, agora = Date.now()): Lead {
  return { ...l, marcas: l.marcas.map((m) => (m.id === marcaId ? { ...m, venceEm: agora + PRAZO_MS, ult: { texto, em: agora } } : m)) };
}
export function semMarca(l: Lead, marcaId: string): Lead {
  return { ...l, marcas: l.marcas.filter((m) => m.id !== marcaId) };
}

/* ---------------------------------------------------------------- local (demonstração e prévia) */
export function useFonteLocal(inicial: Lead[], modo: 'demo' | 'previa', rotulo: string, numeros?: Partial<Record<Periodo, NumeroAtendente[]>>,
  extras?: { chegadas?: Partial<Record<Periodo, Chegadas>>; irisAgora?: IrisAgora | null }): FonteFila {
  const [daPagina, setDaPagina] = useState<Lead[]>(inicial);
  /* a demonstração guarda a fila fora da página: o aviso da marcação vencida (no shell) mexe nas mesmas marcações */
  const daDemo = useFilaDemo(modo === 'demo');
  const leads = modo === 'demo' ? daDemo : daPagina;
  const mexerTudo = modo === 'demo' ? mexerFilaDemo : setDaPagina;
  const mexer = (id: string, f: (l: Lead) => Lead | null) => mexerTudo((t) => t.flatMap((l) => {
    if (l.id !== id) return [l];
    const n = f(l);
    return n ? [n] : [];
  }));
  /* o recado do administrador da demonstração: o repasse troca o dono (a loja guarda; vale ao voltar para a página)
     e a loja consulta o dono/prioridade de agora — o último retrato fica valendo em qualquer página */
  const donos = useDonosLocais();
  const comDono = useMemo(() => (Object.keys(donos).length
    ? leads.map((l) => (donos[l.id] && donos[l.id] !== l.atendente ? { ...l, atendente: donos[l.id] } : l)) : leads), [leads, donos]);
  useEffect(() => {
    const retrato = new Map(comDono.map((l) => [l.id, { dono: l.atendente, cat: l.cat }]));
    registrarFilaLocal((id) => retrato.get(id) ?? null);
  }, [comDono]);
  return useMemo<FonteFila>(() => ({
    modo, rotulo, carregando: false, erro: null, leads: comDono,
    marcar: (id, tipo, texto) => mexer(id, (l) => {
      const agora = Date.now();
      /* toda marcação de tarefa nasce com o prazo; o +1 do "Liguei, não atendeu" recomeça o prazo (como o banco) */
      if (tipo === 'nao_atendeu') return comMaisUmaLigacao(l, agora);
      if (tipo !== 'falta' && l.marcas.some((m) => m.tipo === tipo)) return l;
      return { ...l, marcas: [{ id: `m${agora}`, tipo, texto, em: agora, venceEm: agora + PRAZO_MS }, ...l.marcas] };
    }),
    atualizarMarca: async (id, marcaId, texto) => {
      const t = texto.trim();
      if (t.length < 2) throw new Error('Escreva o que foi feito.');
      mexer(id, (l) => comMarcaAtualizada(l, marcaId, t));
    },
    tirarMarca: (id, mid) => mexer(id, (l) => semMarca(l, mid)),
    corrigirDocs: (id, estado) => mexer(id, (l) => comDocs(l, estado)),
    tirarDaFila: (id) => mexer(id, () => null),
    numeros: (p) => numeros?.[p] ?? null,
    usarConversa: (l) => conversaDeExemplo(l, modo),
    chegadas: (p) => extras?.chegadas?.[p] ?? null,
    irisAgora: extras?.irisAgora ?? null,
    /* a demonstração tem clientes com a senha do INSS; a prévia (foto do banco de antes) não */
    senhaLigada: modo === 'demo',
  }), [comDono, modo, rotulo, numeros, extras]);
}
