// reviza-wa-motor/canal.ts — escolha do NÚMERO DE SAÍDA de cada cliente (puro, testável).
// v1 (19/10): modo "número único" da configuração inicial (configuracao_sistema):
//  TODA a cobrança sai por um canal só, com reserva=true — assim {atendente} continua
//  sendo o comercial do cliente (atendenteDe) e a checagem de "cliente trocou de
//  comercial" não pula o envio. SEM o modo único, o comportamento por-atendente é
//  exatamente o de sempre (nenhuma linha mudou).
import { nomeBonito, normNome } from './regua.ts';

export type Canal = { id: string; nome: string; estado: string; instancia: string; numero: string | null; dono_id: string | null };
export const conectado = (c: Canal | null | undefined): boolean => !!c && c.estado === 'conectado' && !String(c.instancia).startsWith('pendente');

/** o que canalDoCliente precisa ler (o Ctx do index serve direto) */
export type CtxCanal = {
  cfg: { canal_reserva_id: string | null; modo_unico: boolean; canal_unico_id: string | null };
  canais: Canal[];
  nomeDono: Map<string, string>;
};

/** número de saída do cliente: no modo único, o canal único da cobrança (reserva=true);
    senão o do COMERCIAL dele (dono do número; senão nome do número = comercial).
    Reserva só se configurada. */
export function canalDoCliente(ctx: CtxCanal, comercial: string | null): { canal: Canal | null; reserva: boolean; motivo: string | null } {
  if (ctx.cfg.modo_unico) {
    const unico = ctx.canais.find((c) => c.id === ctx.cfg.canal_unico_id);
    if (unico && conectado(unico)) return { canal: unico, reserva: true, motivo: null };
    return { canal: null, reserva: false, motivo: 'número único da cobrança desconectado — reconecte em Números' };
  }
  const alvo = normNome(comercial);
  // o número do comercial é o que tem ELE como dono (o mesmo critério que decide quem vê
  // as conversas); um número só com o nome dele, sem dono definido, não conta
  const doComercial = alvo ? ctx.canais.find((c) => c.dono_id && normNome(ctx.nomeDono.get(c.dono_id)) === alvo) : undefined;
  const soPeloNome = !doComercial && alvo ? ctx.canais.find((c) => !c.dono_id && normNome(c.nome) === alvo) : undefined;
  if (doComercial && conectado(doComercial)) return { canal: doComercial, reserva: false, motivo: null };
  const reserva = ctx.cfg.canal_reserva_id ? ctx.canais.find((c) => c.id === ctx.cfg.canal_reserva_id) : undefined;
  if (reserva && conectado(reserva)) return { canal: reserva, reserva: true, motivo: null };
  const quem = nomeBonito(comercial) || 'sem comercial';
  return {
    canal: doComercial ?? null, reserva: false,
    motivo: !comercial?.trim() ? 'cliente sem comercial na Gestão'
      : doComercial ? `número de ${quem} desconectado`
      : soPeloNome ? `número "${soPeloNome.nome}" sem atendente dono — defina em Números`
      : `${quem} ainda não conectou o número`,
  };
}

/** nome que o cliente lê em {atendente} */
export function atendenteDe(ctx: CtxCanal, canal: Canal, reserva: boolean, comercial: string | null): string {
  if (reserva) return nomeBonito(comercial) || nomeBonito(canal.nome);
  return nomeBonito((canal.dono_id && ctx.nomeDono.get(canal.dono_id)) || canal.nome);
}
