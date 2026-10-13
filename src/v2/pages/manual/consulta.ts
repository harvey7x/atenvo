/* Consulta rápida: checklist do cliente e o pedido de documentos pronto. */
export const CHECKLIST: { grupo: string; itens: string[] }[] = [
  { grupo: 'Meu INSS', itens: ['Carta de concessão', 'Extrato de empréstimo consignado', 'Extratos de pagamento de benefício (Histórico de Créditos) dos últimos 10 anos'] },
  { grupo: 'gov.br', itens: ['Imposto de renda: um print de cada um dos últimos 3 anos (mesmo sem declaração)', 'DEC e REC (se o cliente declara)', 'Situação cadastral do CPF'] },
  { grupo: 'Documentos pessoais', itens: ['RG ou CNH (frente e verso)', 'Foto do rosto', 'Comprovante de residência (mês atual ou passado)', 'E-mail do cliente', 'Se o comprovante for de outra pessoa: documento com foto dela + declaração'] },
  { grupo: 'Rota do familiar', itens: ['Se a análise segue pelo benefício de um familiar: os documentos são do familiar que recebe (na dúvida, pergunte ao gestor)'] },
  { grupo: 'Fechamento', itens: ['Cliente cadastrado no admin', 'Procurações enviadas', 'Conta gov.br prata ou ouro', 'Procurações assinadas pelo gov.br'] },
];

export const MENSAGEM_DOCUMENTOS = [
  'Para darmos entrada no seu processo, também vou precisar de:',
  '',
  '• RG ou CNH (frente e verso)',
  '• Uma foto do seu rosto',
  '• Comprovante de residência deste mês ou do mês passado',
  '• O seu e-mail',
  '',
  'Os documentos do Meu INSS e do gov.br a gente pode buscar junto com você. Qualquer dúvida, é só me chamar!',
].join('\n');
