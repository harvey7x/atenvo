/* AMBIENTES da Reviza (dono 11/11): o sistema tem dois — Cobranças (a Reviza de sempre) e
   Atendimento (o Atenvo dentro da Reviza). "Nem todo mundo vai ter acesso ao atendimento, e nem
   todo mundo do atendimento vai ter acesso a cobranças": cada usuário tem a lista de ambientes que
   enxerga (profiles.modulos), e o seletor do topo da barra lateral só mostra esses.
   Regras fixas por papel (a lista gravada só vale para os demais):
   - Administrador: os dois, sempre (é quem gerencia os usuários dos dois lados);
   - Atendente: só o Atendimento (não tem papel na cobrança);
   - Gestor, Financeiro, Comercial, Cadastro: o que o administrador marcar — sem nada marcado
     (contas de antes dos ambientes), Cobranças. */

export type Ambiente = 'cobrancas' | 'atendimento';
export const AMBIENTES: readonly Ambiente[] = ['cobrancas', 'atendimento'];
export const ROTULO_AMBIENTE: Record<Ambiente, string> = { cobrancas: 'Cobranças', atendimento: 'Atendimento' };

const ehAmbiente = (m: unknown): m is Ambiente => m === 'cobrancas' || m === 'atendimento';

/** papéis cujo acesso é fixo (o administrador não escolhe) */
export function ambientesFixos(papel: string | null | undefined): Ambiente[] | null {
  if (papel === 'admin') return ['cobrancas', 'atendimento'];
  if (papel === 'atendente') return ['atendimento'];
  return null;
}

/** os ambientes que um usuário enxerga, a partir do papel e da lista gravada no perfil */
export function ambientesDoPerfil(papel: string | null | undefined, modulos: unknown): Ambiente[] {
  const fixos = ambientesFixos(papel);
  if (fixos) return fixos;
  const lista = Array.isArray(modulos) ? AMBIENTES.filter((a) => (modulos as unknown[]).some((m) => ehAmbiente(m) && m === a)) : [];
  return lista.length ? lista : ['cobrancas'];
}

/** liga/desliga um ambiente na lista (nunca deixa vazia: sem nenhum, a pessoa não entraria em nada) */
export function alternarAmbiente(atual: readonly Ambiente[], a: Ambiente): Ambiente[] {
  const tem = atual.includes(a);
  const prox = tem ? atual.filter((x) => x !== a) : [...atual, a];
  return prox.length ? AMBIENTES.filter((x) => prox.includes(x)) : [...atual];
}

/* Telas do Atenvo que NÃO entram na Reviza (dono 11/11: "não vou querer a parte das pendências,
   nem o painel da equipe, nem a central de avisos") — fora do menu E bloqueadas pela URL. */
export const ROTAS_ATENDIMENTO_FORA = ['/pendencias', '/equipe', '/radar'] as const;
export const rotaAtendimentoFora = (pathname: string) =>
  ROTAS_ATENDIMENTO_FORA.some((r) => pathname === r || pathname.startsWith(`${r}/`));
