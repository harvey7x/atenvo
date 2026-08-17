// Bancos e faixas de juros usados pelo Simulador de Valores (/simulador).
// Faixas em % a.m. — fonte: levantamento interno dos contratos recebidos.

export const TAXA_REFERENCIA_PADRAO = 1.85; // % a.m. — editável na UI

export const BANCOS_SIMULADOR = [
  { id: 'agibank',   nome: 'AGIBANK',   taxaMin: 8, taxaMax: 20 },
  { id: 'bmg',       nome: 'BMG',       taxaMin: 4, taxaMax: 9 },  // TODO faixa real
  { id: 'facta',     nome: 'FACTA',     taxaMin: 4, taxaMax: 9 },  // TODO faixa real
  { id: 'mercantil', nome: 'Mercantil', taxaMin: 4, taxaMax: 9 },  // TODO faixa real
] as const;

export type BancoSimulador = (typeof BANCOS_SIMULADOR)[number];
export type BancoSimuladorId = BancoSimulador['id'];
