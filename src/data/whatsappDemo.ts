export interface WaMessage {
  dir: 'in' | 'out';
  text?: string;
  time: string;
  pdf?: { name: string; meta: string };
  /** #7 mensagem enviada pelo celular (origem === 'telefone'). */
  viaTelefone?: boolean;
  /** status de entrega da Evolution (pendente/enviada/entregue/lida/falhou). */
  status?: string;
  /** id real da mensagem (para retry sem duplicar e ação "Ver erro"). */
  id?: string;
  /** id de cliente da bolha otimista (sem linha no banco ainda) — p/ reconciliar/timeout sem id real. */
  cid?: string;
  /** mídia recebida mas ainda não baixada (download falhou) — UI mostra "indisponível" + recarregar. */
  midiaPendente?: boolean;
  /** motivo sanitizado da falha (quando status = falhou). */
  erro?: string;
  /** tipo da mensagem: texto | imagem | audio | video | documento. */
  tipo?: string;
  /** caminho do anexo no bucket privado (mídia); a URL assinada é gerada sob demanda. */
  anexoPath?: string;
  /** metadados de mídia para renderização. */
  mime?: string;
  tamanho?: number | null;
  nome?: string;
  /** data da mensagem (AAAA-MM-DD) — usada no nome sugerido do arquivo baixado. */
  dataISO?: string;
}

/** #6 último canal/número usado para falar com a conversa. */
export interface WaUltimoCanal {
  canalId: string | null;
  alias: string | null;
  numero: string | null;
  provider: string | null;
  em: string | null;
}

export interface WaContact {
  id: string;
  name: string;
  phone: string;
  chip: string;
  time: string;
  unread: number;
  /** derivados (modo real) para destaque/ordenação de "aguardando resposta". */
  aberta?: boolean;
  aguardando?: boolean;
  aguardandoDesde?: string | null;
  lastAtMs?: number;
  tabs: string[];
  status: string;
  /** id/cor do status configurável (conversa_status_def). */
  statusId?: string | null;
  statusCor?: string | null;
  /** canal (id) da conversa, usado como padrão em "Responder por". */
  canalId?: string | null;
  /** Caso D: conversa sem número de resposta confirmado (origem LID, sem identidade PN). */
  semDestino?: boolean;
  /** SLA (S4.2): conversa marcada como "precisa de atendimento humano". */
  precisaHumano?: boolean;
  /** Inbox Etapa A: estado de arquivamento/fixação/silêncio da conversa. */
  arquivada?: boolean;
  fixada?: boolean;
  silenciada?: boolean;
  /** id do contato (para abrir em Contatos e editar). */
  contatoId?: string | null;
  /** id do usuário responsável (contatos.responsavel_id). */
  respId?: string | null;
  /** id do atendente da CONVERSA (conversas.atendente_id) — 1ª preferência p/ a etiqueta. */
  atendenteId?: string | null;
  /** etapa/coluna atual do Kanban (oportunidade do contato) — etiqueta [CONTRATOS]. */
  etapa?: string | null;
  /** a coluna é a ENTRADA do funil (não conta como oportunidade avançada). */
  etapaEntrada?: boolean;
  /** resultado da coluna (ganho/perdido/neutro) — só para a cor da etiqueta. */
  etapaResultado?: 'ganho' | 'perdido' | 'neutro' | null;
  /** status da oportunidade — ganho/perdido/cancelado vencem a etapa na etiqueta de SITUAÇÃO. */
  oppStatus?: 'em_andamento' | 'ganho' | 'perdido' | 'cancelado' | null;
  /** responsável da oportunidade (3ª preferência p/ a etiqueta de atendente). */
  oppRespId?: string | null;
  /** CANAL ATUAL do atendimento (conversas.canal_id -> nome_interno). Ex.: ANDRIUS, URA, LUIZA, RMKT. */
  canalAtual?: string | null;
  last: string;
  email: string;
  stage: string;
  resp: string;
  origin: string;
  tags: string[];
  lastInter: string;
  ultimoCanal?: WaUltimoCanal | null;
  notes: string;
  doc: { name: string; meta: string } | null;
  msgs: WaMessage[];
}

export interface WaScript { t: string; m: string; }

const IN = (text: string, time: string): WaMessage => ({ dir: 'in', text, time });
const OUT = (text: string, time: string): WaMessage => ({ dir: 'out', text, time });

export const WA_CONTACTS: WaContact[] = [
  {
    id: 'antonio', name: 'Antônio César', phone: '(11) 99555-1234', chip: 'Chip 1', time: '09:31', unread: 3,
    tabs: ['todos', 'meus', 'pendentes'], status: 'Em atendimento',
    last: 'Bom dia! Gostaria de entender melhor sobre a revisão do meu contrato.',
    email: 'antonio.cesar@email.com', stage: 'Em análise', resp: 'Henrique', origin: 'WhatsApp — Chip 1',
    tags: ['Revisão de contrato', 'Juros abusivos'], lastInter: 'Hoje, 09:31',
    notes: 'Cliente relata juros acima do mercado. Solicitou análise de contrato. Aguardar parecer da área jurídica.',
    doc: { name: 'Contrato_Emprestimo.pdf', meta: 'PDF · 1,2 MB · 09:23' },
    msgs: [
      IN('Bom dia! Gostaria de entender melhor sobre a revisão do meu contrato de empréstimo. Acredito que estou pagando juros abusivos.', '09:21'),
      OUT('Bom dia, Antônio! Claro, podemos analisar seu contrato e verificar se há juros abusivos. Pode me enviar o contrato em PDF?', '09:22'),
      { dir: 'in', pdf: { name: 'Contrato_Emprestimo.pdf', meta: 'PDF · 1,2 MB' }, time: '09:23' },
      IN('Aqui está o contrato. Fiz uma simulação em outro banco e as condições são bem melhores. Por isso acredito que os juros estão altos.', '09:24'),
      OUT('Recebido! Vamos analisar e retorno em breve com um parecer.', '09:24'),
    ],
  },
  {
    id: 'marina', name: 'Marina Lopes', phone: '(11) 99888-4455', chip: 'Chip 1', time: '09:15', unread: 2,
    tabs: ['todos', 'meus', 'pendentes'], status: 'Em atendimento',
    last: 'Enviei os documentos solicitados conforme combinado.',
    email: 'marina.lopes@email.com', stage: 'Em análise', resp: 'Henrique', origin: 'WhatsApp — Chip 1',
    tags: ['Documentação', 'Renegociação'], lastInter: 'Hoje, 09:15',
    notes: 'Documentos recebidos. Iniciar conferência e análise do contrato.',
    doc: { name: 'Documentos_Marina.pdf', meta: 'PDF · 2,1 MB · 09:12' },
    msgs: [
      IN('Bom dia! Enviei os documentos solicitados conforme combinado.', '09:10'),
      OUT('Perfeito, Marina! Recebi os documentos. Vou iniciar a conferência e a análise, e te retorno em seguida.', '09:15'),
    ],
  },
  {
    id: 'carlos', name: 'Carlos Eduardo', phone: '(11) 99333-6677', chip: 'Chip 2', time: '08:47', unread: 1,
    tabs: ['todos', 'naoatrib', 'pendentes'], status: 'Pendente',
    last: 'Quais dados são necessários para iniciar a análise?',
    email: 'carlos.eduardo@email.com', stage: 'Novo lead', resp: 'Não atribuído', origin: 'WhatsApp — Chip 2',
    tags: ['Primeiro contato'], lastInter: 'Hoje, 08:47',
    notes: 'Lead novo. Aguardando atribuição de responsável.', doc: null,
    msgs: [IN('Olá! Quais dados são necessários para iniciar a análise?', '08:47')],
  },
  {
    id: 'juliana', name: 'Juliana M.', phone: '(11) 99222-1188', chip: 'Chip 3', time: 'Ontem', unread: 1,
    tabs: ['todos', 'meus', 'pendentes'], status: 'Em atendimento',
    last: 'Preciso de uma atualização sobre meu processo.',
    email: 'juliana.m@email.com', stage: 'Em processo', resp: 'Henrique', origin: 'WhatsApp — Chip 3',
    tags: ['Acompanhamento'], lastInter: 'Ontem, 17:40',
    notes: 'Cliente solicitou atualização do andamento. Verificar status com o jurídico.', doc: null,
    msgs: [IN('Oi! Preciso de uma atualização sobre meu processo, por favor.', '17:40')],
  },
  {
    id: 'rafael', name: 'Rafael Souza', phone: '(11) 99111-2200', chip: 'Chip 2', time: 'Ontem', unread: 2,
    tabs: ['todos', 'naoatrib', 'pendentes'], status: 'Pendente',
    last: 'Ainda não entendi as opções, pode explicar?',
    email: 'rafael.souza@email.com', stage: 'Novo lead', resp: 'Não atribuído', origin: 'WhatsApp — Chip 2',
    tags: ['Dúvida'], lastInter: 'Ontem, 16:05',
    notes: 'Lead com dúvidas sobre as opções. Necessário retorno explicativo.', doc: null,
    msgs: [IN('Ainda não entendi as opções, pode explicar melhor como funciona?', '16:05')],
  },
];

export const WA_SCRIPTS: WaScript[] = [
  { t: 'Boas-vindas ao cliente', m: 'Olá {{nome_cliente}}, tudo bem? 👋 Sou {{seu_nome}} e será um prazer te ajudar a analisar seu contrato e identificar possíveis juros abusivos. Podemos começar?' },
  { t: 'Qualificação inicial', m: 'Para entender melhor o seu caso e verificar como podemos te ajudar, preciso de algumas informações rápidas.' },
  { t: 'Análise de contrato', m: 'Perfeito, {{nome_cliente}}. Vamos iniciar a análise do seu contrato para identificar possíveis juros abusivos e cobranças indevidas.' },
  { t: 'Juros abusivos identificados', m: 'Após a análise, identificamos indícios de juros abusivos no seu contrato, o que pode gerar devolução de valores.' },
  { t: 'Proposta de acordo', m: 'Com base na análise, podemos propor um acordo para reduzir o seu saldo devedor e quitar o contrato.' },
];

const PALETTE: Record<string, string> = {
  A: '#3f6f52', M: '#7a5a86', C: '#9a6b3d', J: '#5a6f9a', R: '#7a4d4d',
  P: '#5a8a86', H: '#3f6f52', B: '#6a5a3d', L: '#86577a', T: '#4d7a6a',
};

export function initials(name: string): string {
  const p = name.trim().split(/\s+/);
  return (((p[0] || '')[0] || '') + ((p[1] || '')[0] || '')).toUpperCase();
}
export function avatarColor(name: string): string {
  return PALETTE[initials(name)[0]] || '#5a6f9a';
}
