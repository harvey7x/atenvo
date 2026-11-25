/* O QUE MUDOU no sistema (dono 25/11: "tem mais coisas para a gente adicionar", como a página de novidades do sistema que
   a Reviza usava antes). UMA lista só: a página Atendimento › O que mudou e a lista "Novidades" da prévia leem daqui.
   Cada item só aparece para quem tem aquela parte (o recurso ligado nesta instalação e, se for só do administrador,
   quem é administrador). Ao entregar algo novo: ACRESCENTAR no topo, com um id que nunca muda. */
import type { Recurso } from './config/recursos';

export interface Novidade {
  id: string;
  titulo: string;
  onde: string;
  texto: string;
  /** a rota que o botão "Abrir" abre */
  rota: string;
  /** dd/mm, a data em que entrou */
  quando: string;
  recurso?: Recurso;
  soAdmin?: boolean;
}

export const NOVIDADES: Novidade[] = [
  {
    id: 'coletor-guia-25-11', titulo: 'Coletor INSS: o arquivo de verdade e o guia de instalação', onde: 'Ferramentas › Coletor INSS', quando: '25/11',
    texto: 'O botão "Baixar o Coletor para Windows" baixa o coletor pronto para usar. E tem um guia em PDF, um documento só, com a instalação passo a passo, o primeiro uso e o que fazer em cada aviso.',
    rota: '/ferramentas/coletor-inss',
  },
  {
    id: 'retomada-25-11', titulo: 'Retomada automática', onde: 'Configurações › Retomada automática', quando: '25/11', recurso: 'retomada', soAdmin: true,
    texto: 'Mensagens que vão sozinhas quando o cliente para de responder, uma sequência por etapa do Kanban, com horário e ritmo por número. Se o cliente responder, para. Chega desligada: só envia depois que o administrador trocar os textos de exemplo e ligar.',
    rota: '/config/retomada',
  },
  {
    id: 'ia-propria-25-11', titulo: 'IA com a chave da própria Reviza', onde: 'Configurações › Integrações › Inteligência artificial', quando: '25/11', recurso: 'ia-propria',
    texto: 'Com a chave de IA da empresa colada em Integrações, o painel do cliente no WhatsApp ganha o "Resumo do atendimento" (o que ele quer, os documentos que chegaram e os que faltam, o próximo passo) e os áudios ganham o "Transcrever".',
    rota: '/whatsapp',
  },
  {
    id: 'notas-25-11', titulo: 'Nota interna com @ na conversa', onde: 'WhatsApp › conversa do cliente', quando: '25/11', recurso: 'notas',
    texto: 'Embaixo da conversa, troque "Mensagem" por "Nota interna" para escrever um recado que só a equipe vê. Digite @ para marcar um colega: ele recebe o aviso. O cliente nunca recebe a nota.',
    rota: '/whatsapp',
  },
  {
    id: 'chat-equipe-25-11', titulo: 'Chat da equipe', onde: 'Atendimento › Chat da equipe', quando: '25/11', recurso: 'chat-equipe',
    texto: 'Conversa entre colegas dentro do sistema, a sós ou em grupo, com o "Visto" e o número de mensagens não lidas no menu. Colar o link de uma conversa de cliente mostra o cartão dela.',
    rota: '/chat-equipe',
  },
  {
    id: 'tarefas-25-11', titulo: 'Tarefas da equipe', onde: 'Atendimento › Tarefas', quando: '25/11', recurso: 'tarefas',
    texto: 'Lista ou quadro com responsável, prazo, prioridade e subtarefas, e no topo as abertas, as atrasadas e as de hoje. No painel do cliente no WhatsApp, "Criar tarefa" já liga a tarefa à conversa.',
    rota: '/tarefas',
  },
  {
    id: 'ao-vivo-25-11', titulo: 'Ao vivo: as conversas abertas agora', onde: 'Dashboard › Ao vivo', quando: '25/11', recurso: 'ao-vivo', soAdmin: true,
    texto: 'Um quadro com uma coluna por atendente, por equipe ou por etiqueta e um cartão por conversa aberta, mostrando quem está esperando resposta. Atualiza sozinho e abre a conversa com um clique.',
    rota: '/dashboard?aba=aovivo',
  },
  {
    id: 'tempo-resposta-25-11', titulo: 'Tempo de resposta da equipe, com meta', onde: 'Dashboard › Atendentes', quando: '25/11', recurso: 'tempo-resposta', soAdmin: true,
    texto: 'A meta em minutos, quantas respostas ficaram dentro dela, quem está esperando agora e cada atendente do mais lento ao mais rápido. Resposta da IA não conta.',
    rota: '/dashboard?aba=atendentes',
  },
  {
    id: 'anuncios-25-11', titulo: 'Anúncios do Facebook', onde: 'Dashboard › Anúncios', quando: '25/11', recurso: 'anuncios', soAdmin: true,
    texto: 'Quanto foi investido, quantos clientes cada campanha trouxe, o custo por lead e por fechado e qual campanha está rodando melhor. Para ver o dinheiro, conecte a conta de anúncios em Configurações › Integrações.',
    rota: '/dashboard?aba=anuncios',
  },
  {
    id: 'midias-25-11', titulo: 'Mídia, documentos e links do cliente', onde: 'WhatsApp › painel do cliente', quando: '25/11',
    texto: 'Como no WhatsApp: no painel do cliente aparecem as fotos, os documentos, os áudios e os links da conversa, separados por mês, com abrir, baixar e "ver na conversa".',
    rota: '/whatsapp',
  },
];

/** as novidades que ESTA pessoa pode abrir (recurso ligado; as do administrador só para ele) */
export function novidadesPara(admin: boolean, temRecurso: (r: Recurso) => boolean): Novidade[] {
  return NOVIDADES.filter((n) => (!n.recurso || temRecurso(n.recurso)) && (!n.soAdmin || admin));
}

/* quais a pessoa já viu (neste navegador): o número no menu conta as que faltam */
const GUARDA = 'reviza-novidades-vistas';
export function idsVistos(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(GUARDA) ?? '[]') as string[]); } catch { return new Set(); }
}
export function marcarVistas(ids: string[]) {
  try { localStorage.setItem(GUARDA, JSON.stringify([...new Set([...idsVistos(), ...ids])])); } catch { /* privado: só não lembra */ }
  try { window.dispatchEvent(new Event('reviza-novidades')); } catch { /* fora do navegador */ }
}
export const naoVistas = (lista: Novidade[], vistos: Set<string>) => lista.filter((n) => !vistos.has(n.id)).length;
