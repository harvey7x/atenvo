import { assert, assertEquals } from 'jsr:@std/assert@1';
import { citaProibido, equipeNoHorario, montarConversa, montarSistema, passarPelasTravas, semChave, tirarEmojis } from './iris.ts';

const agente = { nome: 'Iris', modelo: '', persona_prompt: 'Atenda com calma.', conhecimento: 'Atendemos de segunda a sexta.', comportamentos: { proibidos: ['política', 'outro banco'], horario: { ativo: true, inicio: '09:00', fim: '18:00' } } };

Deno.test('instruções: regras de fábrica vêm primeiro e as da empresa entram depois', () => {
  const s = montarSistema(agente, new Date('2026-11-23T15:00:00Z'));   // segunda, 12:00 em Brasília
  assert(s.indexOf('REGRAS QUE VALEM SEMPRE') < s.indexOf('INSTRUÇÕES DA EMPRESA'));
  assert(s.includes('Não use emojis.') && s.includes('A equipe está atendendo agora.') && s.includes('política; outro banco'));
});
Deno.test('horário da equipe: dia útil dentro da faixa; fora dela e no fim de semana, não', () => {
  const c = agente.comportamentos;
  assertEquals(equipeNoHorario(c, new Date('2026-11-23T15:00:00Z')), true);    // segunda 12:00
  assertEquals(equipeNoHorario(c, new Date('2026-11-23T23:30:00Z')), false);   // segunda 20:30
  assertEquals(equipeNoHorario(c, new Date('2026-11-22T15:00:00Z')), false);   // domingo
  assertEquals(equipeNoHorario({ horario: { ativo: false } }, new Date('2026-11-22T15:00:00Z')), true);
});
Deno.test('conversa: começa pelo cliente, junta falas seguidas do mesmo lado e marca a pessoa da equipe', () => {
  const c = montarConversa([{ de: 'ia', texto: 'Oi' }, { de: 'cliente', texto: 'Bom dia' }, { de: 'cliente', texto: 'quero saber' }, { de: 'humano', texto: 'Sou o Eduardo' }]);
  assertEquals(c.map((x) => x.role), ['user', 'model']);
  assertEquals(c[0].parts[0].text, 'Bom dia\nquero saber');
  assert(c[1].parts[0].text.startsWith('[pessoa da equipe]'));
});
Deno.test('travas: tema proibido bloqueia (com acento, maiúscula e emoji no meio), palavra parecida não', () => {
  assertEquals(citaProibido('Sobre POLÍTICA eu não falo', ['política']), 'política');
  assertEquals(citaProibido('nossa política de troca', ['politicagem']), null);
  const b = passarPelasTravas(['Tudo certo 😀', 'vá ao outro 🏦 banco', '', 'quarta', 'quinta'], agente.comportamentos);
  assertEquals(b.length, 3);                       // no máximo três, vazias de fora
  assertEquals(b[0], { texto: 'Tudo certo', bloqueada: false });
  assertEquals(b[1].bloqueada, true);              // "outro banco" mesmo com emoji no meio
});
Deno.test('travas: emoji só passa quando liberado; texto longo é cortado; a chave nunca aparece em erro', () => {
  assertEquals(tirarEmojis('Olá 👋 tudo bem?'), 'Olá tudo bem?');
  assertEquals(passarPelasTravas(['Olá 👋'], { permitir_emojis: true })[0].texto, 'Olá 👋');
  assertEquals(passarPelasTravas(['a'.repeat(900)], {})[0].texto.length, 600);
  assertEquals(semChave('falhou em https://x/y?key=AIzaSEGREDO&z=1 com AIzaSEGREDO', 'AIzaSEGREDO'), 'falhou em https://x/y?key=•••&z=1 com •••');
});
