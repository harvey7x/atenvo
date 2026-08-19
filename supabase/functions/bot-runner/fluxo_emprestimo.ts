// fluxo_emprestimo.ts — COPY do fluxo caf_emprestimo_v1 (campanha de empréstimo p/ negativados
// pensionista do INSS). O MOTOR é o mesmo do fluxo de vídeo (fluxo_video.ts): abertura com MÍDIA
// → pergunta SIM/NÃO → nome completo → CPF (com DV) → ack + FECHO imediato (Lead Qualificado +
// distribuição pro consultor). Aqui só mora o que muda: a mídia é IMAGEM e a copy é outra.
//
// Por que um arquivo só de copy, e não um motor gêmeo: o trilho é idêntico ao do vídeo — duplicar
// 270 linhas criaria dois motores para corrigir a cada bug de parser. Ver fluxo_video.ts.
import { montarCopyVideo, DEFAULT_COPY_VIDEO, type CopyVideo } from './fluxo_video.ts';

// COPY DO DONO. LITERAL onde ele escreveu literal (ver [[copy-do-dono-e-literal]]):
//   * a legenda da IMAGEM — o pedido foi "a imagem com essa legenda", então a saudação NÃO é um
//     balão separado: ela é a legenda (abertura fica vazia);
//   * 'Responda *SIM* ou *NÃO* 😊'.
// CORREÇÃO DO DONO (2026-08-19, 2ª rodada — texto colado por ele, aplicado caractere por
// caractere): legenda SEM o 👋; pergunta SEM o 'pra você?' e SEM interrogação; e a linha de
// segurança do CPF encurtada — caiu o 'Nunca pedimos senhas, códigos ou qualquer pagamento.'
// Por isso pede_cpf agora é explícito aqui (antes vinha inteiro do fluxo de vídeo pelo spread):
// o fluxo de VÍDEO segue com a frase longa, intocado.
// O restante segue as instruções dele ("pergunta se gostaria de fazer uma análise pra ver se é
// liberado algum valor", "peça o nome completo", "cpf", "diga que um analista irá conversar com
// ele") reaproveitando as bolhas JÁ APROVADAS do fluxo de vídeo — nome, CPF, reprompts, recusa,
// áudio e handoff são as mesmas, palavra por palavra. É PROIBIDO mesclar/reordenar/reescrever
// bolha por iniciativa própria: mudança de copy só com pedido do dono.
export const DEFAULT_COPY_EMPRESTIMO: CopyVideo = {
  ...DEFAULT_COPY_VIDEO,
  // sem balão de texto antes: a boas-vindas é a legenda da imagem (1ª saída do funil)
  abertura: [],
  midia_tipo: 'imagem',
  midia_url: '',                                  // URL pública do bucket bot-midia (vem do jsonb)
  midia_caption: 'Olá! Seja bem-vindo(a) à CAF!',
  pergunta_analise: [
    'Gostaria de fazer uma análise pra ver se é liberado algum valor',
    'Responda *SIM* ou *NÃO* 😊',
  ],
  pede_cpf: [
    'Poderia me informar seu *CPF*?',
    '🔒 Seus dados são usados somente para a consulta.',
  ],
  // fecho: aqui o bot só entrega o lead — quem continua a conversa é o analista (o runner
  // qualifica a oportunidade e distribui pro consultor no mesmo instante).
  ack_cpf: [
    '✅ Recebido, {primeiro_nome}!',
    'Em instantes um analista vai falar com você aqui mesmo.',
  ],
};

/** Copy do canal (bot_canal_config.mensagens.caf_emprestimo_v1) sobre o default acima — mesmo
 *  merge do fluxo de vídeo, só troca a base. */
export function montarCopyEmprestimo(cfg: unknown): CopyVideo {
  return montarCopyVideo(cfg, DEFAULT_COPY_EMPRESTIMO);
}
