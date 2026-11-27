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
    id: 'lembrete-reuniao-26-11', titulo: 'Lembrete antes da reunião', onde: 'Configurações › Lembrete de reunião', quando: '26/11', recurso: 'lembrete-reuniao', soAdmin: true,
    texto: 'Ligado, cada cliente com reunião marcada na Agenda recebe uma mensagem antes (30 min a 1 dia antes, e um segundo aviso se quiser), pelo número da conversa dele. Mudou o horário, o lembrete muda; cancelou, ele sai da fila. Chega desligado: ligar pede confirmação.',
    rota: '/config/lembrete',
  },
  {
    id: 'disparos-26-11', titulo: 'Disparos em lote', onde: 'Atendimento › Automações › Disparos', quando: '26/11', recurso: 'disparos', soAdmin: true,
    texto: 'Escolha quem recebe (etapas, etiquetas, responsável, sem conversa há X dias), escreva a mensagem (com {{nome}} para o primeiro nome) ou use um arquivo dos Scripts, escolha o número e o ritmo (uma mensagem a cada 1 min e meio a 3 min, só no horário e nos dias escolhidos, com máximo por dia). A tela mostra quantos recebem e quando termina; só agenda depois de você confirmar. Cada mensagem vai para Mensagens agendadas, e "Parar" tira da fila o que ainda não saiu. Quem pediu para não receber fica de fora.',
    rota: '/automacoes/disparos',
  },
  {
    id: 'webhooks-26-11', titulo: 'Webhooks: avisar outro sistema', onde: 'Configurações › Webhooks', quando: '26/11', recurso: 'webhooks', soAdmin: true,
    texto: 'Cadastre o endereço de outro sistema (planilha, ERP, automação) e escolha os momentos: lead novo, mudança de etapa, venda, descarte, reunião marcada e formulário. Cada aviso vai assinado com o segredo do webhook; se o outro lado falhar, o Atenvo tenta de novo até 3 vezes. "Testar" manda um exemplo e a lista mostra o resultado.',
    rota: '/config/webhooks',
  },
  {
    id: 'formularios-26-11', titulo: 'Formulários com agendamento', onde: 'Atendimento › Automações › Formulários', quando: '26/11', recurso: 'formularios', soAdmin: true,
    texto: 'Monte um formulário (as perguntas, a etapa em que o card nasce, as etiquetas e o responsável) e mande o link no anúncio, no Instagram ou no WhatsApp. Quem preencher vira cliente e card no Kanban e, se o agendamento estiver ligado, escolhe um horário livre: a reunião cai na Agenda e o sino avisa a equipe. Nada é enviado para o cliente. A aba Respostas mostra quem preencheu.',
    rota: '/automacoes/formularios',
  },
  {
    id: 'crm-extra-26-11', titulo: 'Kanban em lista, Dashboard › CRM e fixar só para mim', onde: 'Kanban, Dashboard e WhatsApp', quando: '26/11', recurso: 'crm-extra',
    texto: 'No Kanban, "Quadro | Lista" mostra os cards numa tabela (ordene pelo título da coluna e filtre pela etapa). O Dashboard ganhou a aba CRM: quantos entraram, quantos viraram venda, o funil por etapa, de que estado são os clientes, as etiquetas mais usadas, as próximas reuniões e as tarefas por pessoa. No WhatsApp, o ⋯ da conversa tem "Fixar só para mim", além do fixar para todos.',
    rota: '/kanban',
  },
  {
    id: 'automacoes-26-11', titulo: 'Automações: sequências e palavras', onde: 'Atendimento › Automações', quando: '26/11', recurso: 'automacoes',
    texto: 'Sequências: mensagens em série, com a espera antes de cada uma (texto ou o arquivo de um script). No WhatsApp, o ⋯ da conversa tem "Aplicar uma sequência": cada mensagem vira uma mensagem agendada e, se o cliente responder, o resto para. Automação por palavras (administrador): quando o cliente escreve uma palavra-chave (contém, exato, começa com, termina com ou regex), o card vai sozinho para a etapa escolhida, com palavras para ignorar e o "testar a regra". O menu Automações também leva às Mensagens agendadas.',
    rota: '/automacoes/sequencias',
  },
  {
    id: 'avisos-equipe-26-11', titulo: 'Avisos para a equipe', onde: 'Configurações › Avisos para a equipe', quando: '26/11', recurso: 'avisos-equipe', soAdmin: true,
    texto: 'Os 7 avisos que a equipe usava: novo lead, lead qualificado, lead desqualificado, contrato enviado, contrato assinado, reunião agendada e lead que já é cliente da carteira. Cada um chega no sino de quem o administrador escolher, com o link da conversa (nada sai pelo WhatsApp). Chegam ligados e sem ninguém para receber: escolha as pessoas em cada aviso ou use "Pôr a mesma pessoa em vários avisos". A aba Relatório mostra o que saiu.',
    rota: '/config/avisos-equipe',
  },
  {
    id: 'cofre-26-11', titulo: 'Cofre de conversas', onde: 'Configurações › Cofre de conversas', quando: '26/11', recurso: 'cofre',
    texto: 'O administrador cria uma senha única para o cofre. Depois, no ⋯ de qualquer conversa, "Trancar no cofre" esconde as mensagens, a mídia e o resumo: na lista aparece "Conversa trancada" e, para ler, é preciso digitar a senha (a conversa fica aberta por 15 minutos naquela aba). As mensagens continuam chegando e a IA continua respondendo.',
    rota: '/config/cofre',
  },
  {
    id: 'financeiro-26-11', titulo: 'Produtos e o financeiro do cliente', onde: 'WhatsApp › painel do cliente · Dashboard › Financeiro', quando: '26/11', recurso: 'financeiro',
    texto: 'O administrador cadastra os produtos e serviços com o valor (Configurações › Produtos e serviços). No painel do cliente, o Financeiro mostra o que ele comprou e o que está em cobrança, e o "Novo lançamento" traz o produto e o valor. O Dashboard ganhou a aba Financeiro: receita, valor por cliente, cobranças em aberto, por responsável, por produto, por mês e os clientes que mais compraram.',
    rota: '/whatsapp',
  },
  {
    id: 'venda-origem-26-11', titulo: 'Botão de venda e origem do lead', onde: 'Configurações › Botão de venda · › Origem do lead', quando: '26/11', recurso: 'venda-origem', soAdmin: true,
    texto: 'O nome do botão que marca a venda (o "Contrato fechado") agora é escolhido em Configurações, e ele aparece também no detalhe do lead no Kanban; a aba Histórico mostra quem marcou cada venda. Em Origem do lead: de onde vieram as conversas novas (anúncio, a origem do número de WhatsApp ou "Indefinida"), as origens cadastradas e a origem de cada número. Os campos do cliente ganharam os tipos "Número inteiro" e "Data e hora".',
    rota: '/config/venda',
  },
  {
    id: 'campos-cliente-26-11', titulo: 'Campos do cliente', onde: 'WhatsApp › painel do cliente', quando: '26/11', recurso: 'campos',
    texto: 'Os campos que a equipe preenche sobre cada cliente, como o "Nome completo (RG)", ficam no painel do cliente do WhatsApp: clique no valor para preencher ou mudar. O administrador cria os campos (texto, número, data, lista de opções, sim ou não, telefone, e-mail) em Configurações › Campos do cliente e escolhe até 3 para aparecer no cartão do Kanban.',
    rota: '/whatsapp',
  },
  {
    id: 'motivos-fechamento-26-11', titulo: 'Motivos de fechamento com histórico', onde: 'Configurações › Motivos de fechamento', quando: '26/11', recurso: 'campos', soAdmin: true,
    texto: 'O administrador escolhe as opções que aparecem ao fechar uma conversa: criar, renomear, pôr na ordem e desligar. Ao lado, o histórico: quantas conversas fecharam por cada motivo e quem fechou, em 7, 30 ou 90 dias, e os últimos fechamentos com o link da conversa.',
    rota: '/config/motivos',
  },
  {
    id: 'agenda-26-11', titulo: 'Agenda', onde: 'Atendimento › Agenda', quando: '26/11', recurso: 'agenda',
    texto: 'Reuniões, ligações, retornos e videochamadas em dia, semana, mês ou lista, como no sistema que a equipe usava antes. Clique num horário vazio para marcar; clique numa reunião para marcar como feita, cliente faltou, cancelar ou abrir a conversa. Quem vai fazer recebe o aviso no sino. No WhatsApp, o ⋯ da conversa tem "Agendar reunião" com o cliente já escolhido.',
    rota: '/agenda',
  },
  {
    id: 'resumo-dia-25-11', titulo: 'Resumo do dia', onde: 'Dashboard › Resumo do dia', quando: '25/11', recurso: 'resumo-dia', soAdmin: true,
    texto: 'O dia da equipe numa tela só: quantos clientes escreveram, quantos a equipe e a IA atenderam, o tempo de resposta, quem esperou além da meta, por que as conversas fecharam e cada atendente. Dá para ver hoje, ontem ou outro dia, e ligar o aviso no sino no fim da tarde.',
    rota: '/dashboard?aba=resumo',
  },
  {
    id: 'saude-numeros-25-11', titulo: 'Saúde dos números do WhatsApp', onde: 'Configurações › WhatsApp', quando: '25/11', recurso: 'saude-numeros', soAdmin: true,
    texto: 'Cada número do Atendimento ganha uma nota (Boa, Atenção ou Risco) com o motivo: envios falhando, poucos clientes respondendo (o que faz o WhatsApp bloquear o número), número desconectado ou "conectado, mas nada chega". As barras mostram as mensagens que chegaram em cada dia.',
    rota: '/config/whatsapp',
  },
  {
    id: 'aviso-espera-25-11', titulo: 'Aviso de cliente esperando além da meta', onde: 'Configurações › Aviso de espera · sino do topo', quando: '25/11', recurso: 'aviso-espera', soAdmin: true,
    texto: 'Escolha a meta de resposta (por exemplo, 30 minutos). Passou disso sem resposta, o sino do responsável pela conversa avisa; passou do segundo tempo, avisa os gestores. Conversa sem responsável vai direto para os gestores. Chega desligado: ligue em Configurações › Aviso de espera.',
    rota: '/config/aviso-espera',
  },
  {
    id: 'sino-atendimento-25-11', titulo: 'Os avisos do Atendimento no sino', onde: 'Sino do topo', quando: '25/11', recurso: 'atendimento',
    texto: 'O sino do topo agora também mostra os avisos do Atendimento: quando alguém marca você com @ numa nota interna e quando um cliente seu passa da meta sem resposta. Clicando, abre a conversa.',
    rota: '/whatsapp',
  },
  {
    id: 'lote2-25-11', titulo: 'Motivo ao fechar a conversa e planilha do Kanban', onde: 'WhatsApp › Fechar conversa · Kanban', quando: '25/11',
    texto: 'Ao fechar uma conversa, escolha o motivo: ele fica na atividade do atendimento, no painel do cliente. No Kanban, o administrador e o gestor têm o "Exportar planilha", que baixa os cartões da tela para o Excel.',
    rota: '/kanban',
  },
  {
    id: 'retomada-25-11', titulo: 'Retomada automática', onde: 'Configurações › Retomada automática', quando: '25/11', recurso: 'retomada', soAdmin: true,
    texto: 'Mensagens que vão sozinhas quando o cliente para de responder, uma sequência por etapa do Kanban, com horário e ritmo por número. Se o cliente responder, para. Chega desligada: só envia depois que o administrador trocar os textos de exemplo e ligar.',
    rota: '/config/retomada',
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
