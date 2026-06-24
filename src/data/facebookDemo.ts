export interface FbMessage { dir: 'in' | 'out'; text: string; time: string; }
export interface FbHistory { ic: 'msg' | 'person'; title: string; date: string; }
export interface FbContact {
  id: string; name: string; phone: string; src: 'Messenger' | 'Lead Ads'; time: string; unread: number;
  tabs: string[]; status: string; page: string; last: string;
  email: string; profile: string; fbid: string; stage: string; resp: string;
  originLines: string[]; tags: string[]; notes: string; history: FbHistory[]; msgs: FbMessage[];
}
export interface FbQuick { t: string; m: string; }

const IN = (text: string, time: string): FbMessage => ({ dir: 'in', text, time });
const OUT = (text: string, time: string): FbMessage => ({ dir: 'out', text, time });

export const FB_CONTACTS: FbContact[] = [
  {
    id: 'paula', name: 'Paula Ferreira', phone: '(11) 99876-5432', src: 'Messenger', time: '09:41', unread: 3,
    tabs: ['todas', 'minhas', 'pendentes'], status: 'Em atendimento', page: 'Empresa Demonstração',
    last: 'Olá! Gostaria de revisar meu contrato de empréstimo, acho que os juros est...',
    email: 'paula.ferreira@email.com', profile: 'facebook.com/paulaferreira', fbid: '100081234567890',
    stage: 'Em análise', resp: 'Henrique',
    originLines: ['Lead Ads - Campanha Maio/2025', 'Anúncio: Revisão de Contrato', 'Data do cadastro: 16/05/2025 às 09:31'],
    tags: ['Revisão de contrato', 'Juros abusivos'],
    notes: 'Lead interessado em revisão de contrato. Relatou suspeita de juros abusivos. Aguardando envio de documentos.',
    history: [
      { ic: 'msg', title: 'Conversa iniciada via Messenger', date: '16/05/2025 às 09:31' },
      { ic: 'person', title: 'Atribuído a Henrique', date: '16/05/2025 às 09:33' },
    ],
    msgs: [
      IN('Olá! Gostaria de revisar meu contrato de empréstimo. Acho que os juros estão muito altos e podem ser considerados abusivos. Vocês analisam esse tipo de contrato?', '09:41'),
      OUT('Olá, Paula! Analisamos sim. Podemos revisar seu contrato e verificar se há cobrança de juros abusivos e buscar a melhor solução para o seu caso.', '09:43'),
      IN('Ótimo! Quais documentos eu preciso enviar para iniciar a análise?', '09:44'),
      OUT('Para iniciarmos, por favor envie:\n• Contrato do empréstimo\n• Extrato das parcelas pagas\n• Documento com foto (RG ou CNH)\nAssim que recebermos, faremos a análise e retornamos com um parecer.', '09:45'),
    ],
  },
  {
    id: 'bruno', name: 'Bruno Lima', phone: '(11) 99654-3210', src: 'Lead Ads', time: '09:28', unread: 2,
    tabs: ['todas', 'naoatrib', 'pendentes'], status: 'Pendente', page: 'Empresa Demonstração',
    last: 'Tenho interesse em renegociar minha dívida. Podem me ajudar?',
    email: 'bruno.lima@email.com', profile: 'facebook.com/brunolima', fbid: '100072345678901',
    stage: 'Novo lead', resp: 'Não atribuído',
    originLines: ['Lead Ads - Campanha Maio/2025', 'Anúncio: Renegociação de Dívida', 'Data do cadastro: 20/05/2025 às 09:28'],
    tags: ['Renegociação'],
    notes: 'Lead novo via campanha. Aguardando atribuição de responsável.',
    history: [{ ic: 'msg', title: 'Lead recebido via Lead Ads', date: '20/05/2025 às 09:28' }],
    msgs: [IN('Olá! Tenho interesse em renegociar minha dívida. Podem me ajudar?', '09:28')],
  },
  {
    id: 'luciana', name: 'Luciana P.', phone: '(11) 99543-2109', src: 'Messenger', time: '09:05', unread: 1,
    tabs: ['todas', 'minhas', 'pendentes'], status: 'Em atendimento', page: 'Empresa Demonstração',
    last: 'Quais documentos preciso enviar para uma revisão?',
    email: 'luciana.p@email.com', profile: 'facebook.com/lucianap', fbid: '100063456789012',
    stage: 'Em análise', resp: 'Henrique',
    originLines: ['Messenger', 'Conversa iniciada pelo cliente', 'Data do cadastro: Hoje às 09:05'],
    tags: ['Documentação'],
    notes: 'Cliente solicitou lista de documentos para revisão. Enviar checklist.',
    history: [{ ic: 'msg', title: 'Conversa iniciada via Messenger', date: 'Hoje às 09:05' }, { ic: 'person', title: 'Atribuído a Henrique', date: 'Hoje às 09:07' }],
    msgs: [IN('Oi! Quais documentos preciso enviar para uma revisão?', '09:05')],
  },
  {
    id: 'tatiane', name: 'Tatiane F.', phone: '(11) 99432-1098', src: 'Lead Ads', time: 'Ontem', unread: 1,
    tabs: ['todas', 'naoatrib', 'pendentes'], status: 'Pendente', page: 'Empresa Demonstração',
    last: 'Vi o anúncio de vocês sobre juros abusivos e quero saber mais.',
    email: 'tatiane.f@email.com', profile: 'facebook.com/tatianef', fbid: '100054567890123',
    stage: 'Novo lead', resp: 'Não atribuído',
    originLines: ['Lead Ads - Campanha Maio/2025', 'Anúncio: Juros Abusivos', 'Data do cadastro: Ontem às 16:50'],
    tags: ['Primeiro contato'],
    notes: 'Lead interessado após anúncio. Aguardando atribuição e primeiro retorno.',
    history: [{ ic: 'msg', title: 'Lead recebido via Lead Ads', date: 'Ontem às 16:50' }],
    msgs: [IN('Vi o anúncio de vocês sobre juros abusivos e quero saber mais.', '16:50')],
  },
  {
    id: 'joao', name: 'João Pereira', phone: '(11) 99321-0987', src: 'Messenger', time: 'Ontem', unread: 2,
    tabs: ['todas', 'minhas', 'pendentes'], status: 'Em atendimento', page: 'Empresa Demonstração',
    last: 'Vocês trabalham com renegociação de contratos bancários?',
    email: 'joao.pereira@email.com', profile: 'facebook.com/joaopereira', fbid: '100045678901234',
    stage: 'Em processo', resp: 'Henrique',
    originLines: ['Messenger', 'Conversa iniciada pelo cliente', 'Data do cadastro: Ontem às 15:10'],
    tags: ['Renegociação', 'Dúvida'],
    notes: 'Cliente perguntou sobre renegociação de contratos. Explicar fluxo de atendimento.',
    history: [{ ic: 'msg', title: 'Conversa iniciada via Messenger', date: 'Ontem às 15:10' }, { ic: 'person', title: 'Atribuído a Henrique', date: 'Ontem às 15:15' }],
    msgs: [IN('Vocês trabalham com renegociação de contratos bancários?', '15:10')],
  },
];

export const FB_QUICK: FbQuick[] = [
  { t: 'Saudação', m: 'Olá! Tudo bem? Como posso te ajudar hoje?' },
  { t: 'Solicitar documentos', m: 'Para iniciarmos, por favor envie: contrato do empréstimo, extrato das parcelas pagas e documento com foto (RG ou CNH).' },
  { t: 'Análise em andamento', m: 'Sua análise está em andamento. Em breve retornamos com um parecer.' },
  { t: 'Agradecimento', m: 'Obrigado pelo contato! Qualquer dúvida, estou à disposição.' },
];
