// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import * as figuras from './figurasGoogle';

/* GUARDA das figuras de demonstração do tutorial da planilha (pedido do
   dono: "os tutoriais têm que ter foto de demonstração"). Cada figura
   monta (render no padrão da casa: react-dom/server, como em
   RevizaPainel.test.tsx — o repo não usa @testing-library) e cumpre o
   contrato: <svg role="img"> com <title> acessível e não vazio, moldura
   de navegador com endereço, realce dourado no ponto de clique e cor
   SÓ por token (nenhum hex/rgb cravado no markup). */

const NOMES = [
  'FigExcelBaixar', 'FigDriveUpload', 'FigSalvarComoSheets', 'FigLocalidade',
  'FigAbas', 'FigLinkPlanilha', 'FigCloudProjeto', 'FigAtivarApi',
  'FigContaServico', 'FigChaveJson', 'FigCompartilhar', 'FigAppsScript',
] as const;

const exportadas = Object.keys(figuras).filter((n) => n.startsWith('Fig')).sort();

describe('figuras do tutorial da planilha', () => {
  it('exporta exatamente as 12 figuras combinadas', () => {
    expect(exportadas).toEqual([...NOMES].sort());
  });

  it.each([...NOMES])('%s monta com <title> acessível, moldura e realce dourado', (nome) => {
    const Fig = figuras[nome] as () => JSX.Element;
    const html = renderToStaticMarkup(createElement(Fig));

    // é um SVG-figura: role img + title com texto
    expect(html).toContain('<svg');
    expect(html).toContain('role="img"');
    expect(html).toContain('viewBox="0 0 520');
    const titulo = /<title>([^<]+)<\/title>/.exec(html);
    expect(titulo?.[1].trim(), `${nome}: <title> vazio ou ausente`).toBeTruthy();

    // moldura do navegador (3 pontos + endereço)
    expect(html).toContain('cfig-jan-end');
    expect(html).toContain('cfig-jan-pt');

    // realce dourado no ponto de clique
    expect(html).toContain('cfig-realce');
  });

  it('nenhuma cor cravada no markup (tokens só vivem no CSS)', () => {
    for (const nome of NOMES) {
      const Fig = figuras[nome] as () => JSX.Element;
      const html = renderToStaticMarkup(createElement(Fig));
      expect(html, `${nome}: cor hex no markup`).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(html, `${nome}: rgb() no markup`).not.toMatch(/rgba?\(/);
      expect(html, `${nome}: fill/stroke de cor inline`).not.toMatch(/(?:fill|stroke)="(?!none")[a-z]{3,}"/i);
    }
  });

  it('nenhum dado real: só o e-mail fictício combinado', () => {
    expect(figuras.EMAIL_CONTA_FIG).toBe('reviza-sync@reviza-planilha.iam.gserviceaccount.com');
    const html = renderToStaticMarkup(createElement(figuras.FigCompartilhar));
    expect(html).toContain('reviza-sync@reviza-planilha.iam.gserviceaccount.com');
  });
});
