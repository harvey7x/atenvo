/* Tráfego da planilha CONTROLE CLIENTES AGENDADOS: opções da coluna e a
   sugestão automática a partir do CANAL em que o cliente está falando
   (o número/chip integrado). A sugestão é só um default editável — quando
   o canal não determina um valor com segurança, fica vazio e o atendente
   escolhe (nunca chutamos entre RMKT CREFISA e RMKT BRUNO, por exemplo). */

export const TRAFEGO_OPCOES = ['CAMPANHA', 'DISPARO', 'INDICAÇÃO', 'PRESENCIAL', 'RMKT CREFISA', 'RMKT BRUNO', 'ANDRIUS', 'SIMONE'];

export const semAcento = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** Sugere o Tráfego pelo canal: nome interno do chip decide primeiro
 *  (ANDRIUS/SIMONE/DISPARO/RMKT…); senão, canal de fonte "Tráfego" → CAMPANHA. */
export function trafegoDoCanal(nomeInterno?: string | null, fonteNome?: string | null): string {
  const n = semAcento((nomeInterno ?? '').toUpperCase());
  if (n.includes('ANDRIUS')) return 'ANDRIUS';
  if (n.includes('SIMONE')) return 'SIMONE';
  if (n.includes('DISPARO')) return 'DISPARO';
  const rmkt = n.includes('RMKT') || n.includes('REMARKETING');
  if (rmkt && n.includes('CREFISA')) return 'RMKT CREFISA';
  if (rmkt && n.includes('BRUNO')) return 'RMKT BRUNO';
  if (rmkt) return ''; // dois destinos possíveis na planilha — decisão do atendente
  if (semAcento((fonteNome ?? '').toUpperCase()).startsWith('TRAFEGO')) return 'CAMPANHA';
  return '';
}
