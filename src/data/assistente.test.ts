// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

/* A camada de dados do MODO DE VOZ contra o contrato do servidor: `assistente-voz` {org} → token efêmero e
   `assistente` {org, ferramenta:{nome, args}} → {resultado, links}. O corpo enviado, a resposta lida e cada
   erro (o corpo JSON do non-2xx vem em error.context, não em data). O supabase é falso e "configurado". */

const estado = vi.hoisted(() => ({
  invoke: vi.fn(),
}));
vi.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: { functions: { invoke: estado.invoke } },
}));

import {
  ASSISTENTE_REAL, ErroAssistente, erroDoInvoke, executarFerramentaVoz, linksValidos, pedirSessaoVoz,
} from './assistente';

const ORG = 'de300000-0000-4000-8000-000000000001';
const resposta = (status: number, corpo: unknown) =>
  new Response(typeof corpo === 'string' ? corpo : JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });
/** o FunctionsHttpError do supabase-js: o Response fica em `context` */
const httpErro = (status: number, corpo: unknown) => Object.assign(new Error('Edge Function returned a non-2xx status code'), { context: resposta(status, corpo) });
const codigoDe = async (p: Promise<unknown>) => ((await p.catch((x: unknown) => x)) as ErroAssistente).codigo;

beforeEach(() => { estado.invoke.mockReset(); });

describe('pedirSessaoVoz (assistente-voz)', () => {
  it('manda só {org} e devolve o token, o modelo e o teto', async () => {
    estado.invoke.mockResolvedValue({
      data: { token: 'auth_tokens/abc123', modelo: 'gemini-3.8-live', expira_em: '2026-10-31T01:11:30Z', limite_s: 600 },
      error: null,
    });
    const s = await pedirSessaoVoz(ORG);
    expect(ASSISTENTE_REAL).toBe(true);
    expect(s).toEqual({ token: 'auth_tokens/abc123', modelo: 'gemini-3.8-live', expira_em: '2026-10-31T01:11:30Z', limite_s: 600 });
    const [nome, opcoes] = estado.invoke.mock.calls[0];
    expect(nome).toBe('assistente-voz');
    expect(opcoes.body).toEqual({ org: ORG });
  });

  it('a resposta inteira do servidor: ws_url, a saudação de reserva e o gatilho do cumprimento passam adiante', async () => {
    estado.invoke.mockResolvedValue({
      data: {
        token: 'auth_tokens/abc', modelo: 'gemini-3.8-live', expira_em: '2026-10-31T01:11:30Z', abrir_ate: '2026-10-31T01:01:00Z',
        limite_s: 600, ws_url: 'wss://generativelanguage.googleapis.com/ws/x?access_token=auth_tokens/abc',
        saudacao: 'Oi, Juliana. Pode perguntar.', gatilho_inicio: '[início da conversa]',
      },
      error: null,
    });
    expect(await pedirSessaoVoz(ORG)).toEqual({
      token: 'auth_tokens/abc', modelo: 'gemini-3.8-live', expira_em: '2026-10-31T01:11:30Z', limite_s: 600,
      ws_url: 'wss://generativelanguage.googleapis.com/ws/x?access_token=auth_tokens/abc',
      saudacao: 'Oi, Juliana. Pode perguntar.', gatilho_inicio: '[início da conversa]',
    });
  });

  it('ws_url do servidor passa adiante (a sessão confere o endereço); faltando campos, os padrões', async () => {
    estado.invoke.mockResolvedValue({ data: { token: ' auth_tokens/x ', ws_url: 'wss://exemplo' }, error: null });
    expect(await pedirSessaoVoz(ORG)).toEqual({
      token: 'auth_tokens/x', modelo: 'gemini-3.8-live', expira_em: null, limite_s: 600, ws_url: 'wss://exemplo',
    });
  });

  it('cada erro do servidor vira o código do contrato (lido do corpo do non-2xx)', async () => {
    const casos: [number, unknown, string][] = [
      [400, { error: 'pergunta_invalida' }, 'pergunta_invalida'],
      [401, { error: 'nao_autenticado' }, 'nao_autenticado'],
      [403, { error: 'sem_acesso' }, 'sem_acesso'],
      [429, { error: 'limite_dia', mensagem: 'Você chegou ao limite de 30 conversas de hoje.' }, 'limite_dia'],
      [503, { error: 'sem_credito' }, 'sem_credito'],
      [502, { error: 'ia_indisponivel' }, 'ia_indisponivel'],
    ];
    for (const [status, corpo, codigo] of casos) {
      estado.invoke.mockResolvedValueOnce({ data: null, error: httpErro(status, corpo) });
      const e = await pedirSessaoVoz(ORG).catch((x: unknown) => x);
      expect(e).toBeInstanceOf(ErroAssistente);
      expect((e as ErroAssistente).codigo).toBe(codigo);
    }
  });

  it('resposta sem token = ia_indisponivel; rede caída = rede', async () => {
    estado.invoke.mockResolvedValueOnce({ data: { modelo: 'gemini-3.8-live' }, error: null });
    expect(await codigoDe(pedirSessaoVoz(ORG))).toBe('ia_indisponivel');
    estado.invoke.mockRejectedValueOnce(new TypeError('fetch failed'));
    expect(await codigoDe(pedirSessaoVoz(ORG))).toBe('rede');
  });
});

describe('executarFerramentaVoz (assistente, modo ferramenta)', () => {
  it('manda {org, ferramenta:{nome, args}} com o sinal de cancelar e devolve {resultado, links válidos}', async () => {
    estado.invoke.mockResolvedValue({
      data: {
        resultado: { escopo: 'pessoa', total: 4 },
        links: [{ rotulo: 'Ana', rota: '/whatsapp?conversa=0b6c6b1e-1d1a-4c55-9d5e-0a8f7b6c5d4e' }, { rotulo: 'x', rota: 'https://fora' }],
      },
      error: null,
    });
    const ctrl = new AbortController();
    const r = await executarFerramentaVoz({ org: ORG, nome: 'ver_fechados', args: { periodo: 'hoje' }, signal: ctrl.signal });
    expect(r).toEqual({
      resultado: { escopo: 'pessoa', total: 4 },
      links: [{ rotulo: 'Ana', rota: '/whatsapp?conversa=0b6c6b1e-1d1a-4c55-9d5e-0a8f7b6c5d4e' }],
    });
    const [nome, opcoes] = estado.invoke.mock.calls[0];
    expect(nome).toBe('assistente');
    expect(opcoes.body).toEqual({ org: ORG, ferramenta: { nome: 'ver_fechados', args: { periodo: 'hoje' } } });
    expect(opcoes.signal).toBe(ctrl.signal);
  });

  it('recusa de escopo vem DENTRO do resultado (200) e passa como dado; sem resultado = ia_indisponivel', async () => {
    estado.invoke.mockResolvedValueOnce({ data: { resultado: { erro: 'sem_acesso' }, links: [] }, error: null });
    expect((await executarFerramentaVoz({ org: ORG, nome: 'ver_equipe', args: {} })).resultado).toEqual({ erro: 'sem_acesso' });
    estado.invoke.mockResolvedValueOnce({ data: { links: [] }, error: null });
    expect(await codigoDe(executarFerramentaVoz({ org: ORG, nome: 'ver_carteira', args: {} }))).toBe('ia_indisponivel');
    estado.invoke.mockResolvedValueOnce({ data: null, error: httpErro(401, { code: 401, message: 'Invalid JWT' }) });
    expect(await codigoDe(executarFerramentaVoz({ org: ORG, nome: 'ver_carteira', args: {} }))).toBe('nao_autenticado');
  });
});

describe('erros e links', () => {
  it('sem código no corpo, o status decide (o 401 do gateway para JWT vencido); rede caída = rede', async () => {
    expect((await erroDoInvoke(httpErro(401, { code: 401, message: 'Invalid JWT' }))).codigo).toBe('nao_autenticado');
    expect((await erroDoInvoke(httpErro(500, 'oops'))).codigo).toBe('ia_indisponivel');
    expect((await erroDoInvoke(httpErro(504, ''))).codigo).toBe('ia_indisponivel');
    expect((await erroDoInvoke(new Error('Failed to send a request to the Edge Function'))).codigo).toBe('rede');
    expect((await erroDoInvoke(httpErro(429, { error: 'limite_dia', mensagem: 'limite de 30' }))).message).toBe('limite de 30');
  });

  it('links: só rotas de conversa do próprio sistema, até 5', () => {
    expect(linksValidos([
      { rotulo: 'Ana', rota: '/whatsapp?conversa=0b6c6b1e-1d1a-4c55-9d5e-0a8f7b6c5d4e' },
      { rotulo: 'Fora', rota: 'https://exemplo.com' },
      { rotulo: 'Config', rota: '/configuracoes' },
      { rotulo: 'Injeção', rota: '/whatsapp?conversa=abc&x=<script>' },
      { rotulo: '', rota: '/whatsapp?conversa=wa-maria' },
      null,
    ])).toEqual([
      { rotulo: 'Ana', rota: '/whatsapp?conversa=0b6c6b1e-1d1a-4c55-9d5e-0a8f7b6c5d4e' },
      { rotulo: 'Cliente', rota: '/whatsapp?conversa=wa-maria' },
    ]);
    expect(linksValidos(Array.from({ length: 9 }, (_, i) => ({ rotulo: `c${i}`, rota: `/whatsapp?conversa=c${i}` })))).toHaveLength(5);
    expect(linksValidos('x')).toEqual([]);
  });
});
