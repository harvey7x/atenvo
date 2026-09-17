/* ============================================================
   Sala SDR — CONTRATO DE DADOS (a ponte entre a Fase 1 e a Fase 2)
   ------------------------------------------------------------
   A cena isométrica consome SEMPRE este formato. Na Fase 1 quem
   produz é o motor fictício (motor.ts); na Fase 2, o mesmo formato
   virá do Supabase real (conversas, atendente_id, estado do bot/
   triagem, alertas de lead quente e cadência de remarketing que já
   existem). A régua de "semana" e de "sem resposta há N min" virá
   das datas reais (entrada e última interação), substituindo os
   temporizadores simulados — nenhum dado é apagado, o que muda é
   apenas qual recorte é exibido.

   ⚠️ NADA aqui toca o backend. Fase 1 é só o desenho, com mock.
   ============================================================ */

/** Cada etapa do funil tem um lugar físico fixo na sala (ver ZONAS em cena.ts). */
export type EtapaLead =
  | 'chegando'
  | 'triagem'
  | 'aguardando_atendente'
  | 'na_mesa'
  | 'em_ligacao'
  | 'aguardando_cliente'
  | 'sem_resposta'
  | 'remarketing'
  | 'documentacao'
  | 'assinatura'
  | 'caso_aberto'
  | 'perdido'
  | 'nao_legivel';

export type OrigemLead = 'anuncio' | 'remarketing';
export type AutorMensagem = 'cliente' | 'bot' | 'atendente';

export interface MensagemView {
  de: AutorMensagem;
  texto: string;
  em: string; // ISO
}

export interface EventoHistorico {
  em: string; // ISO
  texto: string;
}

/** A visão de um lead que a cena consome. Fase 2 monta isto a partir do Supabase. */
export interface LeadView {
  id: string;
  nome: string;
  telefone: string;
  cidade: string;
  origem: OrigemLead;
  etapa: EtapaLead;
  atendenteId: string | null; // qual SDR
  motivo?: string; // preenchido quando etapa === 'nao_legivel'
  semanaEntrada: number; // derivado da data de entrada real
  semanaFim?: number; // derivado da data de fechamento real
  triagemPasso: number; // 0..4
  docsEnviados: number; // 0..3
  ultimaInteracaoEm: string; // ISO — base para "sem resposta há N min"
  conversa: MensagemView[];
  historico: EventoHistorico[];
}

export interface AtendenteView {
  id: string;
  nome: string;
  online: boolean;
  /* métricas derivadas ficam no snapshot do painel (seletores.ts), não aqui:
     na Fase 2 elas saem de agregações do Supabase, não do objeto do lead. */
}

/** O estado que a cena precisa por semana. Mock e (futuro) Supabase produzem isto. */
export interface SalaState {
  semanaAtual: number;
  leads: LeadView[];
  atendentes: AtendenteView[];
}
