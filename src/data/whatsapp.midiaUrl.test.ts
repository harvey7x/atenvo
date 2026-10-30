import { describe, expect, it } from 'vitest';
import { mapMensagens, urlPublicaMidia, type DbMsg } from './whatsapp';
import { nomeArquivoMidia } from './midiaNome';

/* Mídia do fluxo do robô (vídeo do JUROS, "passo a passo do Meu INSS", imagem dos negativados) é gravada
   SEM anexo no bucket privado: só metadados.media_url (URL pública do bucket bot-midia). A bolha só
   conhecia anexo_path → mostrava "Vídeo indisponível" / "Imagem indisponível" para mídia ENTREGUE.
   Caso real: CRISTIANO (…8353), JUROS ABUSIVO, vídeo de 23/10 10:37. */

const URL_VSL = 'https://afmzuoavvnpfossiiypz.supabase.co/storage/v1/object/public/bot-midia/vsl-juros-30s.mp4';

const linha = (m: Partial<DbMsg>): DbMsg => ({
  id: 'm1', direcao: 'saida', conteudo: 'Assista esse vídeo rapidinho', tipo: 'video',
  enviada_em: '2026-10-23T13:37:00.000Z', recebida_em: null, criado_em: '2026-10-23T13:37:00.000Z',
  origem: 'bot', status: 'lida', erro_envio: null, metadados: null, ...m,
});

describe('mídia do fluxo do robô (metadados.media_url)', () => {
  it('vídeo do robô vira bolha com a URL pública', () => {
    const [b] = mapMensagens([linha({ metadados: { media_url: URL_VSL, fluxo: 'caf_video_juros_v1', etapa: 'video' } as DbMsg['metadados'] })]);
    expect(b.tipo).toBe('video');
    expect(b.midiaUrl).toBe(URL_VSL);
    expect(b.anexoPath).toBeUndefined();
  });

  it('mídia do robô SEM legenda continua aparecendo (antes sumia do histórico)', () => {
    const rows = mapMensagens([linha({ conteudo: '', tipo: 'imagem', metadados: { media_url: URL_VSL.replace('vsl-juros-30s.mp4', 'emprestimo-negativados.png') } })]);
    expect(rows).toHaveLength(1);
    expect(rows[0].midiaUrl).toMatch(/emprestimo-negativados\.png$/);
  });

  it('anexo do painel continua sendo a fonte (midiaUrl só complementa)', () => {
    const [b] = mapMensagens([linha({ metadados: { anexo_path: 'org/wa-midia/abc.mp4', media_url: URL_VSL } })]);
    expect(b.anexoPath).toBe('org/wa-midia/abc.mp4');
    expect(b.midiaUrl).toBe(URL_VSL);
  });

  it('só aceita https: javascript:/data:/http:/lixo são ignorados', () => {
    for (const u of ['javascript:alert(1)', 'data:video/mp4;base64,AAAA', 'http://exemplo.com/x.mp4', '', '   ', 42, null, 'https://a b']) {
      expect(urlPublicaMidia(u)).toBeUndefined();
    }
    expect(urlPublicaMidia(` ${URL_VSL} `)).toBe(URL_VSL);
    const rows = mapMensagens([linha({ conteudo: '', metadados: { media_url: 'javascript:alert(1)' } })]);
    expect(rows).toHaveLength(0);   // sem legenda e sem mídia válida: nada a desenhar (igual a antes)
  });

  it('nome do arquivo baixado pega a extensão da URL pública', () => {
    expect(nomeArquivoMidia({ tipo: 'video', midiaUrl: URL_VSL, dataISO: '2026-10-23' })).toMatch(/\.mp4$/);
    expect(nomeArquivoMidia({ tipo: 'imagem', midiaUrl: 'https://x.supabase.co/storage/v1/object/public/bot-midia/a.png?v=2' })).toMatch(/\.png$/);
  });
});
