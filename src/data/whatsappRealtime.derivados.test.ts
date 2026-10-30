import { describe, expect, it } from 'vitest';
import type { WaContact } from '@/data/whatsappDemo';
import { mapConversa, mapMensagens, type DbConv, type DbMsg } from './whatsapp';
import { rotearEvento, type CtxRoteamento } from './whatsappRealtime';

/* Derivados do card (preview, aguardando, aguardandoDesde, lastAtMs, time) depois de um UPDATE de
   mensagem têm de bater com o que a carga completa (mapConversa) montaria — fixture com o formato
   MEDIDO no banco (só leitura, 21/10):
     - entrada: recebida_em = conversas.ultima_interacao_em; enviada_em (default now()) ~50 ms depois;
     - resposta do BOT não move ultima_interacao_em (150 de 207 conversas com última do bot);
     - ACK da Evolution passa a entrada de 'entregue' para 'lida' (875 em 3 dias). */

const ctx: CtxRoteamento = { mapMensagem: (row) => mapMensagens([row as unknown as DbMsg])[0] ?? null };
const T1 = '2026-10-20T14:00:00.000Z';                       // recebida_em do áudio = ultima_interacao_em
const audio = (p: Partial<DbMsg> = {}): DbMsg => ({
  id: 'm-audio', direcao: 'entrada', conteudo: '', tipo: 'audio', enviada_em: '2026-10-20T14:00:00.050Z', recebida_em: T1,
  criado_em: '2026-10-20T14:00:00.050Z', origem: null, status: 'entregue', erro_envio: null, id_externo: 'wamid.A', respondida_a_id: null,
  metadados: { anexo_path: 'org/audio.ogg', mime: 'audio/ogg', seconds: 12, ptt: true }, ...p,
});
const bot = (p: Partial<DbMsg> = {}): DbMsg => ({
  id: 'm-bot', direcao: 'saida', conteudo: 'Recebi seu áudio!', tipo: 'texto', enviada_em: '2026-10-20T14:00:04.000Z', recebida_em: null,
  criado_em: '2026-10-20T14:00:04.000Z', origem: 'bot', status: 'enviada', erro_envio: null, id_externo: 'wamid.B', respondida_a_id: null,
  metadados: {}, ...p,
});
const dbConv = (real: DbMsg[], ult: DbMsg[]): DbConv => ({
  id: 'c1', status: 'aberta', status_id: null, nao_lidas: 0, ultima_interacao_em: T1, criado_em: '2026-10-20T13:00:00.000Z',
  precisa_humano: false, precisa_humano_motivo: null, precisa_humano_em: null, atendente_id: null, etiquetas: [],
  ultimo_canal_id: 'c-a', ultimo_numero: '5551', ultimo_provider: 'evolution', ultima_msg_canal_em: T1,
  arquivada_em: null, fixada_em: null, silenciada_ate: null,
  contatos: { id: 'k1', nome: 'Maria', telefone: '5551999990000', email: null, etiquetas: null, origem: null, observacoes: null, responsavel_id: null, contato_identidades: [{ tipo: 'whatsapp' }] },
  canais: { id: 'c-a', nome_interno: 'ANDRIUS' },
  real, ult,
});
const evento = (m: DbMsg) => ({ ...m, conversa_id: 'c1', organizacao_id: 'org' }) as unknown as Record<string, unknown>;
const derivados = (c: WaContact) => ({ last: c.last, aguardando: c.aguardando, aguardandoDesde: c.aguardandoDesde, lastAtMs: c.lastAtMs, time: c.time, unread: c.unread });

describe('UPDATE de mensagem × derivados da carga completa (mapConversa)', () => {
  it('cliente manda áudio, o bot responde, chega o READ do áudio: o card NÃO vira "aguardando" com o preview do áudio', () => {
    const verdade = mapConversa(dbConv([bot()], [bot()]));    // a carga completa / busca-alvo
    expect(verdade).toMatchObject({ aguardando: false, last: 'Recebi seu áudio!', lastAtMs: Date.parse(T1) });
    const r = rotearEvento('mensagens', 'UPDATE', evento(audio({ status: 'lida' })), null, [verdade], ctx);
    expect(derivados(r.lista![0])).toEqual(derivados(verdade));   // antes: aguardando=true, 'Mensagem de voz (0:12)'
    expect(r.alvoIds).toEqual([]);
    expect(r.recarregarTudo).toBe(false);
  });

  it('ACK da resposta do bot: lastAtMs/time continuam no relógio do banco (ultima_interacao_em), só a bolha muda', () => {
    const verdade = mapConversa(dbConv([bot()], [bot()]));
    const r = rotearEvento('mensagens', 'UPDATE', evento(bot({ status: 'entregue' })), null, [verdade], ctx);
    expect(derivados(r.lista![0])).toEqual(derivados(verdade));   // antes: lastAtMs = hora da mensagem do bot
    expect(r.lista![0].msgs.find((m) => m.id === 'm-bot')!.status).toBe('entregue');
  });

  it('ACK da PRÓPRIA última entrada (sem resposta): continua aguardando, preview igual ao da carga', () => {
    const verdade = mapConversa(dbConv([audio()], [audio()]));
    expect(verdade.aguardando).toBe(true);
    const r = rotearEvento('mensagens', 'UPDATE', evento(audio({ status: 'lida' })), null, [verdade], ctx);
    expect(derivados(r.lista![0])).toEqual(derivados(mapConversa(dbConv([audio({ status: 'lida' })], [audio({ status: 'lida' })]))));
  });

  it('mídia que ficou visível por UPDATE (anexo baixado) e é a mais nova: busca-alvo traz os derivados', () => {
    const semAnexo = audio({ id: 'm-novo', enviada_em: '2026-10-20T14:10:00.000Z', recebida_em: '2026-10-20T14:10:00.000Z', metadados: {} });
    const card = mapConversa({ ...dbConv([semAnexo], [semAnexo]), ultima_interacao_em: '2026-10-20T14:10:00.000Z' });
    expect(card.msgs).toEqual([]);                             // filtrada (sem anexo nem pendente)
    const r = rotearEvento('mensagens', 'UPDATE', evento({ ...semAnexo, metadados: { anexo_path: 'org/n.ogg', seconds: 3, ptt: true } }), null, [card], ctx);
    expect(r.alvoIds).toEqual(['c1']);
    expect(derivados(r.lista![0])).toEqual(derivados(card));
  });
});
