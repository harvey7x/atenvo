/* O QUE HÁ DE NOVO nesta prévia (25/11, dono: "os HTML que tu tá mandando estão desatualizados, é o mesmo do sistema
   atual"). As novidades ficam em lugares específicos do sistema; esta lista abre sozinha a cada versão nova da prévia e
   cada item leva direto ao lugar. Só existe no build de prévia (montada pelo selo). Ao entregar algo novo, ACRESCENTAR
   aqui (no topo) e trocar NOVIDADES_VERSAO. */
export const NOVIDADES_VERSAO = '2026-11-25-f';

export interface Novidade { titulo: string; onde: string; texto: string; ir: string; quando: string }
export const NOVIDADES: Novidade[] = [
  {
    titulo: 'IA com a chave da própria Reviza', onde: 'Configurações › Integrações › Inteligência artificial', quando: '25/11',
    texto: 'Escolher Google Gemini ou OpenAI e colar a chave que a Reviza cria na conta dela (o custo é da Reviza). No WhatsApp, o painel do cliente ganha o "Resumo do atendimento" e os áudios ganham "Transcrever". Para ver: Conectar › "Usar uma chave de exemplo" e abrir a conversa da Maria Aparecida.',
    ir: '#/config/integracoes/ia',
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
