/* ============================================================
   Sala SDR — CONFIGURAÇÃO (Fase 1)
   ------------------------------------------------------------
   Os limites de tempo NÃO são números soltos no meio do código.
   Ficam aqui, comentados, porque na Fase 2 eles virão da cadência
   real do bot e das regras da operação — trocar aqui é trocar o
   comportamento inteiro da simulação.

   Unidade de tempo: 1 "tick" = 1 minuto simulado (MINUTO_MS ms de
   relógio de parede em 1x; 3x acelera o acúmulo, não o quadro).
   ============================================================ */

export const CONFIG = {
  /** ms de relógio real por minuto simulado (1x). O loop acumula dt×velocidade. */
  MINUTO_MS: 1000,

  turno: {
    inicio: 8 * 60, //  8:00 — SDRs entram
    fim: 18 * 60, // 18:00 — fim do expediente
    relogioInicio: 9 * 60 + 12, // 9:12 — hora em que a sala "abre" na tela
  },

  triagem: {
    /** Quantos leads o bot Matheo atende ao mesmo tempo na recepção. */
    emParalelo: 2,
    /** Minutos sem resposta na triagem até o lead virar "abandono" (lead quente). */
    abandonoAposMin: 10,
  },

  alerta: {
    /** Minutos após o alerta até um SDR poder assumir e ligar. */
    assumirAposMin: 2,
    /** Minutos sem retorno até o abandono entrar na cadência de remarketing. */
    entraRemarketingAposMin: 15,
  },

  mesa: {
    /** Minutos sem resposta da EQUIPE até acender o alerta rubro na mesa do SDR. */
    alertaSemRespostaMin: 10,
    /** Minutos sem retorno do CLIENTE (já na mesa) até ele ir pra "sem resposta". */
    clienteViraSemRespostaMin: 12,
    /** Minutos sem retorno do cliente até cair no remarketing por inatividade. */
    clienteDesisteAposMin: 25,
  },

  remarketing: {
    /** Toques da cadência automática antes de encerrar (perdido / não-trabalhável). */
    tentativas: 3,
  },

  documentacao: {
    /** Documentos a enviar antes de ir pra assinatura. */
    total: 3,
  },

  /** Quanto tempo um lead fechado ainda "descansa" na cena (some por fade, sem andar) antes de ser removido (min). */
  descansoFechadoMin: 10,
  /** Quem ASSINOU (caso aberto) sai da sala rápido — não precisa mais aparecer (pedido do dono). */
  descansoGanhoMin: 3,
} as const;

/* ---- Placeholders dos atendentes (Fase 1) --------------------
   Estes nomes são de demonstração. Na Fase 2 virão dos atendentes
   reais da organização logada (multi-tenant). Deixados como const
   no topo, exatamente para trocar sem caçar pelo código. */
export interface AtendenteConfig {
  id: string;
  nome: string;
  /** cor de identidade (crachá + anel de seleção) — escopada em salaSdr.css */
  acento: string;
  /** posição da mesa na grade isométrica */
  desk: { x: number; y: number };
  /** cadeira de visita (onde o cliente senta na mesa) */
  visita: [number, number];
  /** aparência do boneco sentado na mesa */
  look: Record<string, unknown>;
  /** minuto do turno em que entrou (para "online desde HH:MM") */
  entrou: number;
  /** acessório de mesa: 1 = luminária, 2 = plantinha */
  extra: number;
}

export const ATENDENTES: AtendenteConfig[] = [
  {
    id: 'gi',
    nome: 'Giovana',
    acento: 'var(--sdr-gi)',
    desk: { x: 11, y: 2.5 },
    visita: [13.35, 2.95],
    look: { skin: '#e3b89a', hair: '#3b2a21', estilo: 'bob', top: '#2f4a7a', top2: '#e8edf5', cardigan: true, pants: '#2c3444', shoes: '#1c2230', cracha: 'var(--sdr-gi)', headset: true },
    entrou: 8 * 60,
    extra: 1,
  },
  {
    id: 'ju',
    nome: 'Juliana',
    acento: 'var(--sdr-ju)',
    desk: { x: 16, y: 2.5 },
    visita: [18.35, 2.95],
    look: { skin: '#c58c66', hair: '#1f1a17', estilo: 'preso', top: '#6a4d7a', top2: '#f1e6ee', cardigan: true, pants: '#2c3444', shoes: '#1c2230', cracha: 'var(--sdr-ju)', oculos: true, headset: true },
    entrou: 8 * 60,
    extra: 2,
  },
  {
    id: 'ma',
    nome: 'Mateus',
    acento: 'var(--sdr-ma)',
    desk: { x: 13.5, y: 7 },
    visita: [15.85, 7.45],
    look: { skin: '#d9a88a', hair: '#2a1f18', estilo: 'lado', top: '#2f5e5a', top2: '#e6efec', pants: '#2c3444', shoes: '#1c2230', cracha: 'var(--sdr-ma)', barba: true, headset: true },
    entrou: 8 * 60 + 30,
    extra: 1,
  },
];

/** O bot da recepção. Placeholder — Fase 2: o atendente de IA configurado da org. */
export const BOT = { id: 'bot', nome: 'Matheo' } as const;
