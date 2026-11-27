// deno test supabase-reviza/functions/reviza-wa-motor/canal_test.ts
import { assertEquals } from 'jsr:@std/assert@1';
import { atendenteDe, canalDoCliente, conectado, type Canal, type CtxCanal } from './canal.ts';

const canal = (id: string, extra: Partial<Canal> = {}): Canal =>
  ({ id, nome: id, estado: 'conectado', instancia: `reviza_${id}`, numero: '5551980000000', dono_id: null, ...extra });
const ctx = (canais: Canal[], cfg: Partial<CtxCanal['cfg']> = {}, donos: [string, string][] = []): CtxCanal =>
  ({ cfg: { canal_reserva_id: null, modo_unico: false, canal_unico_id: null, ...cfg }, canais, nomeDono: new Map(donos) });

Deno.test('conectado exige estado "conectado" E instância criada', () => {
  assertEquals(conectado(canal('a')), true);
  assertEquals(conectado(canal('a', { estado: 'conectando' })), false);
  assertEquals(conectado(canal('a', { instancia: 'pendente-x' })), false);
  assertEquals(conectado(null), false);
});

Deno.test('por-atendente: número do comercial é o que tem ELE como dono (sem modo único, nada mudou)', () => {
  const doEdu = canal('c-edu', { nome: 'eduardo', dono_id: 'u1' });
  const soNome = canal('c-nome', { nome: 'paty' });
  const c = ctx([doEdu, soNome], {}, [['u1', 'Eduardo']]);
  assertEquals(canalDoCliente(c, ' EDUARDO '), { canal: doEdu, reserva: false, motivo: null });
  assertEquals(atendenteDe(c, doEdu, false, 'EDUARDO'), 'Eduardo');
  // número só com o nome, sem dono definido, não conta
  assertEquals(canalDoCliente(c, 'paty').motivo, 'número "paty" sem atendente dono — defina em Números');
  assertEquals(canalDoCliente(c, 'junior').motivo, 'Junior ainda não conectou o número');
  assertEquals(canalDoCliente(c, null).motivo, 'cliente sem comercial na Gestão');
  // comercial com número desconectado: avisa; com reserva configurada, sai pela reserva
  const eduCaiu = ctx([canal('c-edu', { nome: 'eduardo', dono_id: 'u1', estado: 'desconectado' })], {}, [['u1', 'Eduardo']]);
  assertEquals(canalDoCliente(eduCaiu, 'eduardo').motivo, 'número de Eduardo desconectado');
  const reserva = canal('c-res', { nome: 'reserva' });
  const comReserva = ctx([eduCaiu.canais[0], reserva], { canal_reserva_id: 'c-res' }, [['u1', 'Eduardo']]);
  assertEquals(canalDoCliente(comReserva, 'eduardo'), { canal: reserva, reserva: true, motivo: null });
  assertEquals(atendenteDe(comReserva, reserva, true, 'eduardo'), 'Eduardo');   // {atendente} = comercial do cliente
});

Deno.test('modo único: TODA a cobrança sai pelo canal único, assinada pelo comercial do cliente', () => {
  const doEdu = canal('c-edu', { nome: 'eduardo', dono_id: 'u1' });
  const unico = canal('c-unico', { nome: 'Número da cobrança' });
  const c = ctx([doEdu, unico], { modo_unico: true, canal_unico_id: 'c-unico' }, [['u1', 'Eduardo']]);
  // mesmo com o número do comercial conectado, o ramo novo vem PRIMEIRO
  assertEquals(canalDoCliente(c, 'EDUARDO'), { canal: unico, reserva: true, motivo: null });
  assertEquals(atendenteDe(c, unico, true, 'EDUARDO'), 'Eduardo');
  // cliente sem comercial também é cobrado (o nome vira o do canal)
  assertEquals(canalDoCliente(c, null), { canal: unico, reserva: true, motivo: null });
  assertEquals(atendenteDe(c, unico, true, null), 'Número da Cobrança');
});

Deno.test('modo único: canal desconectado ou removido = aguardando com aviso claro (nunca cai no por-atendente)', () => {
  const doEdu = canal('c-edu', { nome: 'eduardo', dono_id: 'u1' });
  const aviso = 'número único da cobrança desconectado — reconecte em Números';
  const caiu = ctx([doEdu, canal('c-unico', { estado: 'desconectado' })], { modo_unico: true, canal_unico_id: 'c-unico' }, [['u1', 'Eduardo']]);
  assertEquals(canalDoCliente(caiu, 'eduardo'), { canal: null, reserva: false, motivo: aviso });
  const sumiu = ctx([doEdu], { modo_unico: true, canal_unico_id: 'c-unico' }, [['u1', 'Eduardo']]);
  assertEquals(canalDoCliente(sumiu, 'eduardo'), { canal: null, reserva: false, motivo: aviso });
  // nem a reserva configurada substitui o canal único (o modo manda tudo por UM número)
  const comReserva = ctx([doEdu, canal('c-res')], { modo_unico: true, canal_unico_id: 'c-unico', canal_reserva_id: 'c-res' }, [['u1', 'Eduardo']]);
  assertEquals(canalDoCliente(comReserva, 'eduardo').canal, null);
});
