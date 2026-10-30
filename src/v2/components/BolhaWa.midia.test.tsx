import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Bolha } from './BolhaWa';
import { mapMensagens, type DbMsg } from '@/data/whatsapp';

/* Bolha REAL do inbox (desktop e /m usam a mesma) com a mídia do fluxo do robô: antes desenhava
   "Vídeo indisponível" / "Imagem indisponível" para mídia entregue (caso CRISTIANO …8353, 23/10). */

const B = 'https://afmzuoavvnpfossiiypz.supabase.co/storage/v1/object/public/bot-midia/';
const linha = (tipo: string, arquivo: string, extra: Record<string, unknown> = {}): DbMsg => ({
  id: 'm-' + arquivo, direcao: 'saida', conteudo: 'legenda do robô', tipo,
  enviada_em: '2026-10-23T13:37:00Z', recebida_em: null, criado_em: '2026-10-23T13:37:00Z',
  origem: 'bot', status: 'lida', erro_envio: null, metadados: { media_url: B + arquivo, ...extra },
});
const noop = () => undefined;
const html = (row: DbMsg) => {
  const [m] = mapMensagens([row]);
  return renderToStaticMarkup(
    <Bolha m={m} demo={false} nomeCliente="Cristiano" retryId={null} removendoId={null} semDestino={false} optout={false}
      aoResponder={noop} aoVerErro={noop} aoRetry={noop} aoRemover={noop} aoLightbox={noop} aoRecarregarAudio={noop} />,
  );
};

describe('bolha de mídia do robô (metadados.media_url)', () => {
  it('vídeo do robô vira player tocável, sem "indisponível"', () => {
    const h = html(linha('video', 'vsl-juros-30s.mp4'));
    expect(h).toContain(`<video class="m-video" src="${B}vsl-juros-30s.mp4" controls="" preload="metadata">`);
    expect(h).not.toMatch(/indispon/i);
    expect(h).toContain('legenda do robô');
  });

  it('imagem do robô aparece (antes: "Imagem indisponível")', () => {
    const h = html(linha('imagem', 'emprestimo-negativados.png'));
    expect(h).toContain(`<img class="m-img" loading="lazy" src="${B}emprestimo-negativados.png"`);
    expect(h).not.toMatch(/indispon/i);
  });

  it('com anexo do painel, a URL pública NÃO é usada (espera a URL assinada do bucket privado)', () => {
    const h = html(linha('video', 'vsl-juros-30s.mp4', { anexo_path: 'org/wa-midia/abc.mp4' }));
    expect(h).not.toContain(B);
    expect(h).toContain('Carregando vídeo…');
  });

  it('mídia sem anexo e sem URL continua "indisponível" (nada mudou para esse caso)', () => {
    const [m] = mapMensagens([{ ...linha('video', 'x.mp4'), metadados: null }]);
    const h = renderToStaticMarkup(
      <Bolha m={m} demo={false} nomeCliente="C" retryId={null} removendoId={null} semDestino={false} optout={false}
        aoResponder={noop} aoVerErro={noop} aoRetry={noop} aoRemover={noop} aoLightbox={noop} aoRecarregarAudio={noop} />,
    );
    expect(h).toContain('Vídeo indisponível');
  });
});
