// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { CartaoMensagemEquipe, TextoComLinks, rotuloDoLink } from './CartaoMensagemEquipe';

/* dono 23/11 ("aparecer na tela do Atenvo pra ela abrir"): o link da mensagem do administrador vira clicável */
const PLANILHA = 'https://docs.google.com/spreadsheets/d/1pdnC75blc92CmGPNh4N_tKE0X-NqMQD0kYMbSrj4dyk/edit';

describe('link na mensagem da equipe', () => {
  it('a planilha do Google vira "Abrir a planilha", em outra aba', () => {
    const html = renderToString(<TextoComLinks texto={`Giovana, sua planilha: ${PLANILHA}. Bom trabalho!`} />);
    expect(html).toContain(`href="${PLANILHA}"`);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('>Abrir a planilha</a>');
    /* o ponto do fim da frase fica fora do link, e o resto do texto continua */
    expect(html).toContain('</a>. Bom trabalho!');
    expect(html).toContain('Giovana, sua planilha: ');
  });
  it('outro site mostra o endereço; texto sem link fica igual; só http(s) vira link', () => {
    expect(rotuloDoLink('https://www.exemplo.com.br/a?b=1')).toBe('Abrir exemplo.com.br');
    expect(renderToString(<TextoComLinks texto="Reunião às 14h, sem link." />)).toBe('Reunião às 14h, sem link.');
    expect(renderToString(<TextoComLinks texto="javascript:alert(1) ftp://x.y/z" />)).not.toContain('<a');
  });
  it('o cartão no meio da tela mostra o link', () => {
    const html = renderToString(
      <CartaoMensagemEquipe aoOk={() => undefined}
        mensagens={[{ id: 'm1', assinatura: 'Murillo', mensagem: `Sua planilha: ${PLANILHA}`, criadoEm: Date.now() - 60_000 }]} />,
    );
    expect(html).toContain('class="meq-link"');
    expect(html).toContain('Abrir a planilha');
  });
});
