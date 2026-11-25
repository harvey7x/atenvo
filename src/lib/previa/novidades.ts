/* O QUE HÁ DE NOVO nesta prévia (25/11, dono: "os HTML que tu tá mandando estão desatualizados, é o mesmo do sistema
   atual"). As novidades ficam em lugares específicos do sistema; esta lista abre sozinha a cada versão nova da prévia e
   cada item leva direto ao lugar. Só existe no build de prévia (montada pelo selo). Ao entregar algo novo, ACRESCENTAR
   aqui (no topo) e trocar NOVIDADES_VERSAO. */
export const NOVIDADES_VERSAO = '2026-11-25-g';

export interface Novidade { titulo: string; onde: string; texto: string; ir: string; quando: string }
export const NOVIDADES: Novidade[] = [
  {
    titulo: 'Tarefas da equipe', onde: 'Atendimento › Tarefas', quando: '25/11',
    texto: 'Lista ou quadro com responsável, prazo (dia e hora), prioridade, projeto e subtarefas. No topo: abertas, atrasadas, para hoje e concluídas na semana. No WhatsApp, o painel do cliente ganhou "Criar tarefa", já ligada à conversa.',
    ir: '#/tarefas',
  },
  {
    titulo: 'Ao vivo: as conversas abertas agora', onde: 'Dashboard › Ao vivo', quando: '25/11',
    texto: 'Um quadro com uma coluna por atendente, por equipe ou por etiqueta e um cartão por conversa aberta: a última mensagem, por qual número, quando, quem está esperando resposta e onde a IA está atendendo. Atualiza sozinho a cada 30 segundos; clicar no cartão abre a conversa.',
    ir: '#/dashboard?aba=aovivo',
  },
  {
    titulo: 'Tempo de resposta da equipe, com meta', onde: 'Dashboard › Atendentes', quando: '25/11',
    texto: 'Meta em minutos, horário comercial ou tempo corrido, quantas respostas ficaram dentro da meta, quem está esperando agora e cada atendente do mais lento ao mais rápido. A IA fica fora da conta.',
    ir: '#/dashboard?aba=atendentes',
  },
  {
    titulo: 'Anúncios do Facebook', onde: 'Dashboard › Anúncios', quando: '25/11',
    texto: 'Quanto foi investido, quantos clientes cada campanha trouxe, custo por lead e por fechado, a campanha que está rodando melhor e o rastreio de cada cliente. Para ver com dinheiro: Conectar › "Usar um código de exemplo".',
    ir: '#/dashboard?aba=anuncios',
  },
  {
    titulo: 'Conectar a conta de anúncios', onde: 'Configurações › Integrações › Anúncios do Facebook', quando: '25/11',
    texto: 'Colar o código de acesso da Meta (gerado pela própria Reviza) e escolher a conta. O sistema só lê os números.',
    ir: '#/config/integracoes/anuncios',
  },
  {
    titulo: 'Mídia, documentos e links do cliente', onde: 'WhatsApp › painel do cliente', quando: '25/11',
    texto: 'Como no WhatsApp: as fotos, os documentos, os áudios e os links da conversa, separados por mês, com abrir, baixar e "ver na conversa".',
    ir: '#/whatsapp?conversa=wa-maria&midias=fotos',
  },
];
