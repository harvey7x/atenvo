/* O QUE ESTA INSTALAÇÃO JÁ TEM NO SERVIDOR (22/11).
   Várias telas novas dependem de peças que ainda não existem no banco do Reviza (conferido no banco
   de verdade em 22/11: lá só existe a parte de Cobranças). Publicar a tela sem a peça do servidor
   daria erro para quem usa. Então, NO SISTEMA DE VERDADE, cada recurso só aparece quando é ligado
   na instalação (VITE_RECURSOS="asaas,iris" ou "tudo"), depois que a parte do servidor estiver pronta:
     atendimento   o ambiente Atendimento inteiro (banco e funções do Atendimento)
     telas         telas liberadas por pessoa (coluna profiles.areas + função reviza-admin)
     asaas         integração de pagamentos (tabela integracoes + função reviza-asaas)
     wa-oficial    WhatsApp pela API oficial (função reviza-wa-oficial)
     iris          a atendente virtual, nos números de WhatsApp do Reviza (migration 90 + funções
                   reviza-iris, ia-agente-testar e ia-agente-conversar)
     tempo-resposta o tempo de resposta da equipe com meta no Dashboard › Atendentes (migration 97)
     motivos-fechamento  o motivo ao fechar a conversa no WhatsApp (25/11, migration 105: atd_conversa_registrar_fechamento)
     retomada      a retomada automática (25/11): mensagens que vão sozinhas quando o cliente para de responder,
                   por etapa do Kanban (migration 103 + função retomada-processar + agendador a cada minuto).
                   Chega DESLIGADA: só envia quando o administrador ligar em Configurações › Retomada automática
     aviso-espera  o aviso de cliente esperando além da meta (25/11, migration 106 + agendador a cada 2 min): o sino avisa o
                   responsável e depois os gestores. Chega DESLIGADO: Configurações › Aviso de espera
     saude-numeros a saúde de cada número do Atendimento em Configurações › WhatsApp (25/11, migration 107, só leitura):
                   enviadas, falhas, recebidas, quem respondeu e o número "conectado, mas nada chega"
     resumo-dia    Dashboard › Resumo do dia (25/11, migration 108 + agendador a cada 10 min): o dia da equipe numa tela e,
                   se o administrador ligar, o aviso no sino no fim da tarde (chega DESLIGADO)
     agenda        Atendimento › Agenda (26/11, migration 109): reuniões, ligações e retornos em dia, semana, mês e lista,
                   com o aviso no sino para quem vai fazer; os presenciais entram no mesmo calendário
     campos        campos personalizados do cliente e motivos de fechamento configuráveis (26/11, migration 110):
                   Configurações › Campos do cliente e › Motivos de fechamento (com o histórico), o bloco "Campos" no
                   painel do cliente do WhatsApp e os campos marcados no cartão do Kanban
     chat-equipe   o chat da equipe no Atendimento (25/11): conversas entre colegas, de pessoa para pessoa e em
                   grupo, com o número de não lidas no menu (migration 102; o tempo real usa a publicação do Supabase)
     ao-vivo       a aba Ao vivo do Dashboard (25/11): as conversas abertas agora, uma coluna por atendente,
                   equipe ou etiqueta (migration 98, rotina dash_ao_vivo)
     anuncios      anúncios do Facebook no Atendimento (25/11): a conta de anúncios em Integrações e a aba
                   Anúncios do Dashboard (migration 96 + função meta-anuncios + a origem do anúncio no webhook)
     ia-propria    a IA com a chave da PRÓPRIA empresa (25/11): Integrações › Inteligência artificial (Google Gemini ou
                   OpenAI; o custo é da conta da empresa), o "Resumo do atendimento" no painel do cliente e o "Transcrever"
                   dos áudios no WhatsApp (migration 100 + função atd-ia). Só na Reviza: fora dela não aparece nunca
     notas         nota interna com @ na conversa do WhatsApp (25/11): o "Mensagem | Nota interna" do compositor,
                   a nota no fio (só a equipe vê, nunca vai ao cliente) e o aviso para quem foi marcado (migration 99)
     tarefas       as tarefas da equipe no Atendimento (25/11): o menu Tarefas (lista, quadro e os números do
                   topo) e o "Criar tarefa" do painel do cliente no WhatsApp (migration 101). Desligado, some do
                   menu e /tarefas volta ao WhatsApp
     acessos       os CADASTROS do Atendimento antes dele existir (23/11): papel atendente, ambientes por
                   pessoa e equipes com gerente (migrations 91 e 92 + função reviza-admin). Quem só tem o
                   Atendimento entra e vê o aviso de que o Atendimento ainda vai ser ligado
   Na PRÉVIA tudo aparece (é a demonstração do que o sistema vai ter); a prévia "só o que existe"
   (VITE_PREVIA_SO_REAL) mostra o sistema exatamente como iria ao ar hoje, e VITE_PREVIA_RECURSOS="telas,acessos"
   mostra como fica com só esses recursos ligados. Fora do Reviza nada muda. */
import { isPrevia, isRevizaMode } from '@/lib/supabase';

export type Recurso = 'atendimento' | 'telas' | 'asaas' | 'wa-oficial' | 'iris' | 'iris-motor' | 'acessos' | 'anuncios' | 'tempo-resposta' | 'ao-vivo' | 'tarefas' | 'chat-equipe' | 'notas' | 'ia-propria' | 'retomada' | 'motivos-fechamento' | 'aviso-espera' | 'saude-numeros' | 'resumo-dia' | 'agenda' | 'campos';
const LIGADOS = new Set(String(import.meta.env.VITE_RECURSOS ?? '').split(',').map((s) => s.trim()).filter(Boolean));
const PREVIA_SO_REAL = import.meta.env.VITE_PREVIA_SO_REAL === 'true';
const PREVIA_ESCOLHIDOS = import.meta.env.VITE_PREVIA_RECURSOS == null ? null
  : new Set(String(import.meta.env.VITE_PREVIA_RECURSOS).split(',').map((s) => s.trim()).filter(Boolean));

// isPrevia/isRevizaMode são lidos DENTRO da função, nunca na carga do módulo: este arquivo entra no
// ciclo de imports de lib/supabase (pela prévia) e ler as duas na carga quebrava a abertura do sistema
function ligado(r: Recurso): boolean {
  if (!isRevizaMode) return true;
  if (isPrevia) return PREVIA_ESCOLHIDOS ? PREVIA_ESCOLHIDOS.has(r) : !PREVIA_SO_REAL;
  return LIGADOS.has('tudo') || LIGADOS.has(r);
}
/** este recurso existe nesta instalação? */
export const temRecurso = (r: Recurso): boolean => ligado(r);
/** dá para CADASTRAR gente do Atendimento (papel atendente, ambientes, equipes)? Com o Atendimento ligado,
    sempre; sem ele, quando as peças de acesso (migrations 91 e 92) já estão no servidor */
export const temCadastroAtendimento = (): boolean => ligado('atendimento') || ligado('acessos');
