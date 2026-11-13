// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

/* "Baixar" da foto ampliada (13/11, notebook da equipe): o link da foto vem da bolha, é assinado e vence em
   10 min. Vencido, o servidor responde 400 com um JSON de erro — e o "Baixar" salvava esse erro como
   "<id>.json" ("O site não está disponível" no Chrome). Agora: com anexo, link de download NOVO na hora do
   clique; sem anexo, a foto da tela só vira arquivo se o servidor devolver imagem. */

const wa = vi.hoisted(() => ({
  urlDownloadMidiaWa: vi.fn(async (p: string, n: string) => `https://st.supabase.co/storage/v1/object/sign/script-midia/${p}?token=NOVO&download=${encodeURIComponent(n)}`),
  urlAssinadaMidiaWa: vi.fn(async (p: string) => `https://st.supabase.co/storage/v1/object/sign/script-midia/${p}?token=NOVO`),
}));
vi.mock('@/data/whatsapp', () => wa);

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { RegistroIa } from '@/data/midiaIa';
import { VisualizadorImagem, baixarOriginalImagem, blobDaImagem, extDaImagem, registroIaDaImagem } from './VisualizadorImagem';

const ANEXO = 'org1/wa-midia/ACB8763674DB0BA7DAB955ACF348D8DF.jpeg';
const NOME = 'ACB8763674DB0BA7DAB955ACF348D8DF.jpeg';
const URL_VENCIDA = 'https://st.supabase.co/storage/v1/object/sign/script-midia/org1/wa-midia/ACB8763674DB0BA7DAB955ACF348D8DF.jpeg?token=VELHO';
// o que o Storage devolve de verdade para link vencido/inválido (conferido com curl em 13/11)
const respostaVencida = () => new Response('{"statusCode":"400","error":"InvalidJWT","message":"\\"exp\\" claim timestamp check failed"}',
  { status: 400, headers: { 'content-type': 'application/json; charset=utf-8' } });
const respostaFoto = (tipo = 'image/jpeg') => new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), { status: 200, headers: { 'content-type': tipo } });

const saidaFalsa = () => ({ link: vi.fn(), blob: vi.fn() });

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('Baixar o original', () => {
  it('com anexo: pede link de download NOVO com o nome do arquivo e nem toca no link da tela (que pode ter vencido)', async () => {
    const fetchFalso = vi.fn(async () => respostaVencida());
    vi.stubGlobal('fetch', fetchFalso);
    const saida = saidaFalsa();
    await baixarOriginalImagem({ anexoPath: ANEXO, nome: NOME, url: URL_VENCIDA, base: 'ACB8763674DB0BA7DAB955ACF348D8DF' }, saida);
    expect(wa.urlDownloadMidiaWa).toHaveBeenCalledWith(ANEXO, NOME);
    expect(saida.link).toHaveBeenCalledTimes(1);
    expect(saida.link.mock.calls[0][0]).toContain('token=NOVO');
    expect(saida.link.mock.calls[0][0]).toContain('download=');
    expect(saida.link.mock.calls[0][1]).toBe(NOME);
    expect(fetchFalso).not.toHaveBeenCalled();
    expect(saida.blob).not.toHaveBeenCalled();
  });

  it('link da tela vencido e sem link novo: NÃO salva o erro como arquivo (era o "<id>.json")', async () => {
    wa.urlDownloadMidiaWa.mockRejectedValueOnce(new Error('sem rede'));
    vi.stubGlobal('fetch', vi.fn(async () => respostaVencida()));
    const saida = saidaFalsa();
    await expect(baixarOriginalImagem({ anexoPath: ANEXO, nome: NOME, url: URL_VENCIDA, base: 'ACB8763674DB0BA7DAB955ACF348D8DF' }, saida)).rejects.toThrow();
    expect(saida.blob).not.toHaveBeenCalled();
    expect(saida.link).not.toHaveBeenCalled();
  });

  it('sem link novo, mas a foto da tela ainda vale: baixa a foto com a extensão certa', async () => {
    wa.urlDownloadMidiaWa.mockRejectedValueOnce(new Error('sem rede'));
    vi.stubGlobal('fetch', vi.fn(async () => respostaFoto('image/jpeg')));
    const saida = saidaFalsa();
    await baixarOriginalImagem({ anexoPath: ANEXO, nome: NOME, url: URL_VENCIDA, base: 'ACB8763674DB0BA7DAB955ACF348D8DF' }, saida);
    expect(saida.blob).toHaveBeenCalledTimes(1);
    expect(saida.blob.mock.calls[0][1]).toBe('ACB8763674DB0BA7DAB955ACF348D8DF.jpg');
  });

  it('mídia do robô (sem anexo, link público): baixa pela foto da tela', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respostaFoto('image/png')));
    const saida = saidaFalsa();
    await baixarOriginalImagem({ anexoPath: null, nome: 'emprestimo-negativados.png', url: 'https://st.supabase.co/storage/v1/object/public/bot-midia/emprestimo-negativados.png', base: 'emprestimo-negativados' }, saida);
    expect(wa.urlDownloadMidiaWa).not.toHaveBeenCalled();
    expect(saida.blob.mock.calls[0][1]).toBe('emprestimo-negativados.png');
  });
});

describe('blobDaImagem: só imagem vira arquivo', () => {
  it('recusa 400 com JSON (link vencido)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respostaVencida()));
    await expect(blobDaImagem(URL_VENCIDA)).rejects.toThrow(/400/);
  });
  it('recusa 200 que não é imagem (página de erro, JSON)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"ok":false}', { status: 200, headers: { 'content-type': 'application/json' } })));
    await expect(blobDaImagem('https://x/y.jpg')).rejects.toThrow(/não é imagem/);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html></html>', { status: 200, headers: { 'content-type': 'text/html' } })));
    await expect(blobDaImagem('https://x/y.jpg')).rejects.toThrow(/não é imagem/);
  });
  it('aceita imagem e arquivo binário genérico', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respostaFoto('image/webp')));
    expect((await blobDaImagem('https://x/y.webp')).size).toBe(4);
    vi.stubGlobal('fetch', vi.fn(async () => respostaFoto('application/octet-stream')));
    expect((await blobDaImagem('https://x/y.jpg')).size).toBe(4);
  });
});

describe('abrir foto sem mensagem (robô, Painel da Equipe, recém-enviada) não derruba a tela', () => {
  // antes: `undefined === undefined` → lia null.ocupada → "Unexpected Application Error" (visto na prévia, 13/11)
  it('o visualizador abre sem mensagemId', () => {
    const html = renderToStaticMarkup(createElement(VisualizadorImagem, { url: 'https://x/foto.jpg', nome: 'foto.jpg', aoFechar: () => undefined }));
    expect(html).toContain('Melhorar qualidade');
    expect(html).toContain('>Baixar<');
  });
  it('registroIaDaImagem: sem situação ou sem mensagem = nenhum; senão o da vaga (se for esta) ou o desta', () => {
    const reg = (id: string, mensagem_id: string): RegistroIa => ({ id, contato_id: 'c1', mensagem_id, status: 'aprovada', anexo_path_ia: null, divergencias: null, erro: null, criado_em: '2026-11-13T12:00:00Z' });
    expect(registroIaDaImagem(null)).toBeNull();
    expect(registroIaDaImagem(null, 'm1')).toBeNull();
    expect(registroIaDaImagem({ ocupada: reg('r1', 'm1'), desta: null })).toBeNull();
    expect(registroIaDaImagem({ ocupada: reg('r1', 'm1'), desta: null }, 'm1')?.id).toBe('r1');
    expect(registroIaDaImagem({ ocupada: reg('r1', 'm2'), desta: reg('r3', 'm1') }, 'm1')?.id).toBe('r3');
    expect(registroIaDaImagem({ ocupada: reg('r1', 'm2'), desta: null }, 'm1')).toBeNull();
  });
});

describe('extDaImagem', () => {
  it('pelo tipo da imagem, sem parâmetros', () => {
    expect(extDaImagem(new Blob([], { type: 'image/jpeg' }))).toBe('jpg');
    expect(extDaImagem(new Blob([], { type: 'image/png' }))).toBe('png');
    expect(extDaImagem(new Blob([], { type: 'image/svg+xml' }))).toBe('svg');
    expect(extDaImagem(new Blob([], { type: 'image/jpeg;charset=utf-8' }))).toBe('jpg');
  });
  it('sem tipo de imagem: a do nome; sem nome: jpg', () => {
    expect(extDaImagem(new Blob([], { type: 'application/octet-stream' }), 'foto.webp')).toBe('webp');
    expect(extDaImagem(new Blob([]))).toBe('jpg');
  });
});
