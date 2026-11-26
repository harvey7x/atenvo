import { assert, assertEquals } from 'jsr:@std/assert@1';
import {
  codigoDoErro, conferirChave, finalDaChave, lerResumo, lerTranscricao, mimeDoAudio, montarTextoConversa, ocultarSegredos, paraBase64, semChave,
  type MsgResumo,
  textoDaConfigIris,
} from './iaPropria.ts';

Deno.test('chave: confere o jeito antes de gastar uma chamada', () => {
  assertEquals(conferirChave('gemini', 'AIzaSyA-chave-de-teste-0000000000000000'), null);
  assertEquals(conferirChave('openai', 'sk-proj-chave-de-teste-000000000000000'), null);
  assertEquals(conferirChave('gemini', 'curta'), 'formato_chave');
  assertEquals(conferirChave('gemini', 'AIza com espaço no meio 0000000000000'), 'formato_chave');
  assertEquals(conferirChave('gemini', 'sk-proj-chave-de-teste-000000000000000'), 'parece_openai');
  assertEquals(conferirChave('openai', 'AIzaSyA-chave-de-teste-0000000000000000'), 'parece_gemini');
  assertEquals(conferirChave('claude', 'AIzaSyA-chave-de-teste-0000000000000000'), 'provedor_invalido');
  assertEquals(finalDaChave('  AIzaSyA-chave-de-teste-00001234 '), '1234');
});
Deno.test('a chave nunca sai num texto de erro', () => {
  const s = semChave('erro key=AIzaXYZ na chamada com Bearer sk-abc e AIzaXYZ', 'AIzaXYZ');
  assert(!s.includes('AIzaXYZ') && !s.includes('sk-abc'));
});
Deno.test('senha e cartão não vão para o provedor', () => {
  assertEquals(ocultarSegredos('A senha do meu INSS é Maria@2019'), 'A senha do meu INSS é [oculta]');
  assertEquals(ocultarSegredos('minha senha: 1234 ok'), 'minha senha: [oculta] ok');
  assertEquals(ocultarSegredos('o código de verificação é 998877'), 'o código de verificação é [oculta]');
  assertEquals(ocultarSegredos('Não lembro a senha'), 'Não lembro a senha');
  assertEquals(ocultarSegredos('cartão 4111 1111 1111 1111'), 'cartão [cartão oculto]');
});
const M = (direcao: 'entrada' | 'saida', conteudo: string, min: number, extra: Partial<MsgResumo> = {}): MsgResumo =>
  ({ direcao, tipo: 'texto', conteudo, origem: null, enviada_em: new Date(Date.UTC(2026, 10, 24, 17, min)).toISOString(), ...extra });
Deno.test('conversa em texto: em ordem, quem falou, áudio pela transcrição, sem nota interna, e corta as mais antigas', () => {
  const msgs = [
    M('saida', 'Oi, aqui é a Iris', 1, { origem: 'bot' }),
    M('entrada', 'Bom dia', 0),
    M('entrada', '', 2, { tipo: 'audio', transcricao: 'quero ver os descontos' }),
    M('entrada', '', 3, { tipo: 'documento', nome: 'RG.pdf' }),
    M('saida', 'nota só da equipe', 4, { tipo: 'nota_interna' }),
    M('saida', 'Recebi, obrigado', 5),
  ];
  const { texto, usadas, cortou } = montarTextoConversa(msgs);
  assertEquals(texto.split('\n'), [
    '[24/11 14:00] Cliente: Bom dia', '[24/11 14:01] IA: Oi, aqui é a Iris', '[24/11 14:02] Cliente: (áudio) quero ver os descontos',
    '[24/11 14:03] Cliente: [mandou o documento: RG.pdf]', '[24/11 14:05] Equipe: Recebi, obrigado',
  ]);
  assertEquals([usadas, cortou], [5, false]);
  const curta = montarTextoConversa(msgs, 80);
  assert(curta.cortou && curta.texto.endsWith('Equipe: Recebi, obrigado') && !curta.texto.includes('Bom dia'));
});
Deno.test('resposta do resumo: lê JSON (até dentro de ```), com tetos; texto solto não vira resumo', () => {
  const r = lerResumo('```json\n{"quer":"Revisar os descontos","documentos_recebidos":["RG",""],"documentos_faltando":[],"proximo_passo":"Pedir o extrato","humor":"tranquila"}\n```');
  assertEquals(r, { quer: 'Revisar os descontos', documentos_recebidos: ['RG'], documentos_faltando: [], proximo_passo: 'Pedir o extrato', humor: 'tranquila' });
  assertEquals(lerResumo('Desculpe, não consegui'), null);
  assertEquals(lerResumo('{"humor":"bom"}'), null);
});
Deno.test('transcrição limpa; "sem fala" vira vazio', () => {
  assertEquals(lerTranscricao('  "Oi, tudo bem?"  '), 'Oi, tudo bem?');
  assertEquals(lerTranscricao('[sem fala]'), '');
});
Deno.test('mime do áudio do WhatsApp e base64', () => {
  assertEquals(mimeDoAudio('audio/ogg; codecs=opus', 'x.ogg'), 'audio/ogg');
  assertEquals(mimeDoAudio(null, 'org/wa-midia/a.m4a'), 'audio/mp4');
  assertEquals(mimeDoAudio('audio/mpeg', 'a'), 'audio/mp3');
  assertEquals(paraBase64(new TextEncoder().encode('olá')), btoa(String.fromCharCode(...new TextEncoder().encode('olá'))));
});
Deno.test('erro do provedor → código da tela', () => {
  assertEquals(codigoDoErro(400, 'API key not valid. Please pass a valid API key.'), 'chave_invalida');
  assertEquals(codigoDoErro(401, 'Incorrect API key provided'), 'chave_invalida');
  assertEquals(codigoDoErro(429, 'You exceeded your current quota'), 'sem_credito_ou_limite');
  assertEquals(codigoDoErro(403, 'PERMISSION_DENIED'), 'chave_sem_permissao');
  assertEquals(codigoDoErro(404, 'model not found'), 'modelo_indisponivel');
  assertEquals(codigoDoErro(500, 'internal'), 'provedor_indisponivel');
});

Deno.test('o copiloto lê a configuração (roteiro, perguntas, gatilhos) e esconde o que parece chave', () => {
  const t = textoDaConfigIris({
    identidade: { assistente: 'Bia', rotulo: 'IA', empresa: 'Reviza', papel: 'pré-análise', instrucoes: 'curta' },
    empresa: { fatos: [{ pergunta: 'Custa algo?', resposta: 'Não.' }], endereco: 'Rua Uruguai, 287' },
    inicio: { esperaSeg: 15, soComGatilho: true, gatilhos: ['juros', 'oi'] },
    roteiro: { texto: 'Etapa 1 — Recepção. AIzaSyA1234567890abcdefghijklmnopqrstu', regras: 'Nunca peça senha.' },
    papel: { tipo: 'principal' }, audioModo: { modo: 'sempre' }, assinatura: { ativa: false },
  }, 'COMERCIAL');
  assert(t.includes('Etapa 1 — Recepção'));
  assert(t.includes('Custa algo? → Não.'));
  assert(t.includes('juros, oi'));
  assert(t.includes('Espera antes de responder: 15 s'));
  assert(!t.includes('AIzaSyA1234567890abcdefghijklmnopqrstu'));
  assertEquals(textoDaConfigIris(null, 'X'), 'IA "X" sem configuração.');
});
