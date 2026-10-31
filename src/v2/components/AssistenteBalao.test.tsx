// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import type { EstadoVoz, SessaoVoz } from '../lib/assistenteVozSessao';

/* O balão do assistente e o CARTÃO DE VOZ (dono 30/10: "eu quero por voz mesmo"): a liberação só para o
   Matheus, a regra do compositor do WhatsApp (o balão e o cartão sobem acima dele), o balão fechado e o
   cartão em cada estado (conectando, ouvindo, mudo, consultando, falando com legenda e links, encerrada,
   erros). O chat de texto saiu: nenhum campo de digitar. */

const MATHEUS = '4ac197b4-9600-4756-81aa-1ac29280df09';
const estado = vi.hoisted(() => ({
  user: { id: '4ac197b4-9600-4756-81aa-1ac29280df09', name: 'Matheus Ribeiro' } as { id: string; name: string } | null,
  org: { id: 'org1', name: 'CAF', slug: 'caf', role: 'admin' } as { id: string; name: string; slug: string; role: string } | null,
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: estado.user }) }));
vi.mock('@/context/OrgContext', () => ({ useOrg: () => ({ currentOrg: estado.org }) }));

import { AssistenteBalao, LARGURA_CARTAO, LIBERADOS_VOZ, baseDoBalao, vozLiberadaPara } from './AssistenteBalao';
import { CartaoVoz, focoVaiParaOCartao } from './AssistenteVoz';

// o MemoryRouter (e o useNavigate) usam useLayoutEffect: no render de servidor o React só avisa (ruído) — como no SinoPainel.test
const erroOriginal = console.error;
vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
  if (String(a[0]).includes('useLayoutEffect does nothing on the server')) return;
  erroOriginal(...a);
});

describe('liberação: por enquanto só o Matheus', () => {
  it('só o id do Matheus; na prévia local da demo, quem estiver logado (a conversa é simulada)', () => {
    expect([...LIBERADOS_VOZ]).toEqual([MATHEUS]);
    expect(vozLiberadaPara(MATHEUS, false)).toBe(true);
    expect(vozLiberadaPara('d7e59652-d3eb-4d7d-8830-7fc780701a8e', false)).toBe(false); // Juliana
    expect(vozLiberadaPara('f81fcc8a-07a7-436a-9224-34003b65fc67', false)).toBe(false); // Murilo
    expect(vozLiberadaPara(null, false)).toBe(false);
    expect(vozLiberadaPara('usr_henrique', true)).toBe(true);
  });
});

describe('regra do compositor do WhatsApp', () => {
  const j657 = { altura: 657, largura: 1366 };
  const j900 = { altura: 900, largura: 1440 };
  it('sem compositor: 20 px do rodapé', () => {
    expect(baseDoBalao(j657, null, 52)).toBe(20);
    expect(baseDoBalao(j657, { top: 0, height: 0, left: 300, right: 1366 }, 52)).toBe(20);
  });
  it('compositor por baixo (ficha fechada, vai até a borda): logo acima dele (12 px de folga), nunca abaixo de 20', () => {
    expect(baseDoBalao(j657, { top: 555, height: 86, left: 420, right: 1366 }, 52)).toBe(114);
    expect(baseDoBalao(j900, { top: 790, height: 96, left: 420, right: 1440 }, 52)).toBe(122);
    expect(baseDoBalao(j657, { top: 650, height: 4, left: 420, right: 1366 }, 52)).toBe(20);
  });
  it('ficha do cliente aberta (compositor acaba antes do canto): o balão fica no canto; o cartão, mais largo, sobe', () => {
    const comp = { top: 555, height: 86, left: 420, right: 1050 };
    expect(LARGURA_CARTAO).toBe(340);
    expect(baseDoBalao(j657, comp, 52)).toBe(20);
    expect(baseDoBalao(j657, comp, LARGURA_CARTAO)).toBe(114);
  });
});

describe('balão fechado', () => {
  const render = (oculto = false) => renderToString(<MemoryRouter initialEntries={['/dashboard']}><AssistenteBalao oculto={oculto} /></MemoryRouter>);

  it('o Matheus vê a esfera com a pílula "Pergunte à IA", fechada e acessível; sem campo de texto', () => {
    const html = render();
    expect(html).toContain('class="ast-balao"');
    expect(html).toContain('aria-label="Pergunte à IA — abrir a conversa por voz"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('Pergunte à IA');
    expect(html).toContain('ast-esfera');
    expect(html).not.toContain('ast-voz'); // o cartão só existe aberto
    expect(html).not.toMatch(/<textarea|<input/);
  });

  it('a Juliana (e qualquer outra pessoa) não vê; some com o bom dia aberto e sem usuário ou empresa', () => {
    estado.user = { id: 'd7e59652-d3eb-4d7d-8830-7fc780701a8e', name: 'Juliana' };
    expect(render()).toBe('');
    estado.user = { id: MATHEUS, name: 'Matheus' };
    expect(render(true)).toBe('');
    estado.org = null;
    expect(render()).toBe('');
    estado.org = { id: 'org1', name: 'CAF', slug: 'caf', role: 'admin' };
    estado.user = null;
    expect(render()).toBe('');
    estado.user = { id: MATHEUS, name: 'Matheus' };
  });
});

describe('cartão de voz em cada estado', () => {
  const sessao: SessaoVoz = {
    iniciar: () => undefined, alternarMudo: () => undefined, encerrar: () => undefined,
    bandas: () => ({ g: 0, m: 0, a: 0, entrada: 0 }), estado: () => base,
  };
  const base: EstadoVoz = {
    fase: 'ouvindo', mudo: false, palavras: [], voce: '', links: [], erro: null, fim: null, limiteS: 600, falaConcluida: '',
  };
  const cartao = (e: Partial<EstadoVoz>) => renderToString(
    <CartaoVoz sessao={sessao} estado={{ ...base, ...e }} aoFechar={() => undefined} aoRecomecar={() => undefined} aoAbrirLink={() => undefined} />,
  );
  const semEmoji = (html: string) => expect(html).not.toMatch(/\p{Extended_Pictographic}/u);

  it('conectando e ouvindo: a esfera, a linha de estado, microfone e encerrar', () => {
    const c = cartao({ fase: 'conectando' });
    expect(c).toContain('role="dialog"');
    expect(c).toContain('aria-label="Assistente de voz"');
    expect(c).toContain('data-fase="conectando"');
    expect(c).toContain('Conectando…');
    expect(c).toContain('ast-voz-esfera');
    expect(c).toContain('aria-label="Silenciar o microfone"');
    expect(c).toContain('aria-pressed="false"');
    expect(c).toContain('title="Desligar o microfone"');
    expect(c).toContain('aria-label="Encerrar a conversa"');
    const o = cartao({});
    expect(o).toContain('>Ouvindo<');
    expect(o).not.toMatch(/<textarea|<input/);
    semEmoji(o);
  });

  it('mudo: "Microfone desligado" e o botão pressionado (o nome do botão de alternar NÃO muda; só a dica do mouse)', () => {
    const c = cartao({ mudo: true });
    expect(c).toContain('Microfone desligado');
    expect(c).toContain('aria-pressed="true"');
    expect(c).toContain('data-mudo="sim"');
    expect(c).toContain('aria-label="Silenciar o microfone"');
    expect(c).toContain('title="Ligar o microfone"');
  });

  it('foco: vai para o cartão ao abrir; no fim sozinho, só se a pessoa estava no cartão (ou em lugar nenhum)', () => {
    const compositor = { tagName: 'TEXTAREA' };
    // abrindo (clique no balão ou "Falar de novo"): sempre
    expect(focoVaiParaOCartao({ abrindo: true, ativo: compositor, dentroDoCartao: false })).toBe(true);
    // acabou sozinha com a pessoa digitando para o cliente: o foco FICA no compositor (Espaço/Enter não caem em "Falar de novo")
    expect(focoVaiParaOCartao({ abrindo: false, ativo: compositor, dentroDoCartao: false })).toBe(false);
    // estava no cartão (o microfone some no fim: o foco cai no body) ou em lugar nenhum: vai para "Falar de novo"
    expect(focoVaiParaOCartao({ abrindo: false, ativo: { tagName: 'BUTTON' }, dentroDoCartao: true })).toBe(true);
    expect(focoVaiParaOCartao({ abrindo: false, ativo: { tagName: 'BODY' }, dentroDoCartao: false })).toBe(true);
    expect(focoVaiParaOCartao({ abrindo: false, ativo: null, dentroDoCartao: false })).toBe(true);
  });

  it('consultando e falando: a legenda acende palavra a palavra; o que você disse em cinza; os links das conversas', () => {
    expect(cartao({ fase: 'consultando', voce: 'o que eu tenho para resolver' })).toContain('Consultando o sistema…');
    const c = cartao({
      fase: 'falando',
      voce: 'o que eu tenho para resolver',
      palavras: [{ texto: 'Você', dita: true }, { texto: 'tem', dita: true }, { texto: '8', dita: false }],
      links: [{ rotulo: 'Eva Pereira', rota: '/whatsapp?conversa=c1' }, { rotulo: 'José Carlos', rota: '/whatsapp?conversa=c2' }],
    });
    expect(c).toContain('>Falando<');
    expect(c).toContain('<span class="ast-dita">Você</span><span class="ast-dita"> tem</span><span> 8</span>');
    expect(c).toContain('“o que eu tenho para resolver”');
    expect(c).toContain('Abrir conversa · <!-- -->Eva Pereira');
    expect(c).toContain('Abrir conversa · <!-- -->José Carlos');
    semEmoji(c);
  });

  it('encerrada sozinha: o motivo e "Falar de novo"; encerrar pela pessoa não tem frase de motivo', () => {
    const c = cartao({ fase: 'encerrada', fim: 'silencio' });
    expect(c).toContain('Conversa encerrada');
    expect(c).toContain('Encerrada depois de 1 minuto sem fala.');
    expect(c).toContain('Falar de novo');
    expect(c).toContain('>Fechar<');
    expect(c).not.toContain('aria-label="Desligar o microfone"');
    expect(cartao({ fase: 'encerrada', fim: 'tempo' })).toContain('Encerrada no limite de 10 minutos por conversa.');
  });

  it('erros: a frase amigável; "Tentar de novo" só quando adianta', () => {
    const mic = cartao({ fase: 'erro', erro: 'microfone_negado' });
    expect(mic).toContain('Microfone bloqueado');
    expect(mic).toContain('Permitir');
    expect(mic).toContain('Tentar de novo');
    expect(mic).toContain('role="alert"');
    const credito = cartao({ fase: 'erro', erro: 'sem_credito' });
    expect(credito).toContain('IA sem crédito');
    expect(credito).not.toContain('Tentar de novo');
    expect(cartao({ fase: 'erro', erro: 'limite_dia' })).not.toContain('Tentar de novo');
    expect(cartao({ fase: 'erro', erro: 'queda' })).toContain('Tentar de novo');
    semEmoji(mic);
  });

  it('o leitor de tela ouve a fala inteira quando ela termina', () => {
    expect(cartao({ falaConcluida: 'Hoje você fechou 5 clientes.' })).toContain('<span class="ast-sr" aria-live="polite">Hoje você fechou 5 clientes.</span>');
  });
});
