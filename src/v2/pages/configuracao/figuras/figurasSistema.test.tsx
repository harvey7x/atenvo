// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import {
  FigEsperaEquipe, FigModoAtendentes, FigModoUnico, FigPixPagar, FigQrConectar, FigSincronia,
} from './figurasSistema';

/* GUARDA das figuras de demonstração (sem @testing-library no repo:
   a montagem é verificada por renderToStaticMarkup, como no teste do
   inbox; o visual fica na conferida ao vivo).
   Regras do padrão aprovado:
   (1) monta sem erro, como <svg> com viewBox fixo e width 100%;
   (2) <title> acessível, ligado por aria-labelledby;
   (3) cor SÓ por var(--token)/currentColor — nada de hex ou rgb cravado
       (claro/escuro saem sozinhos);
   (4) dourado (--azul) SÓ onde a pessoa clica: QR e Pix têm o realce,
       as demais figuras não têm nenhum dourado;
   (5) âmbar é risco real: só no selo de atenção do modo único — a
       espera é serena (sem âmbar). */

const FIGURAS: Array<[string, ReactElement]> = [
  ['FigModoAtendentes', <FigModoAtendentes />],
  ['FigModoUnico', <FigModoUnico />],
  ['FigQrConectar', <FigQrConectar />],
  ['FigPixPagar', <FigPixPagar />],
  ['FigEsperaEquipe', <FigEsperaEquipe />],
  ['FigSincronia', <FigSincronia />],
];
const html = new Map(FIGURAS.map(([nome, el]) => [nome, renderToStaticMarkup(el)]));
const de = (nome: string) => html.get(nome)!;

describe('figuras do sistema — montagem', () => {
  it.each(FIGURAS.map(([nome]) => nome))('%s monta como <svg> responsivo com viewBox fixo', (nome) => {
    const m = de(nome);
    expect(m.startsWith('<svg')).toBe(true);
    expect(m).toMatch(/viewBox="0 0 520 (240|300)"/);
    expect(m).toContain('width="100%"');
    expect(m).toContain('role="img"');
  });

  it.each(FIGURAS.map(([nome]) => nome))('%s tem <title> acessível ligado por aria-labelledby', (nome) => {
    const m = de(nome);
    const id = /aria-labelledby="([^"]+)"/.exec(m)?.[1];
    expect(id).toBeTruthy();
    expect(m).toContain(`<title id="${id}">`);
  });
});

describe('figuras do sistema — só tokens (claro e escuro de graça)', () => {
  it.each(FIGURAS.map(([nome]) => nome))('%s: todo fill/stroke é none, currentColor ou var(--token)', (nome) => {
    const valores = [...de(nome).matchAll(/(?:fill|stroke)="([^"]*)"/g)].map((m) => m[1]);
    expect(valores.length).toBeGreaterThan(0);
    for (const v of valores) {
      expect(v === 'none' || v === 'currentColor' || v.includes('var(--'), `cor cravada: ${v}`).toBe(true);
    }
  });

  it.each(FIGURAS.map(([nome]) => nome))('%s: nenhuma cor hex ou rgb() sem token', (nome) => {
    const m = de(nome);
    expect(m).not.toMatch(/#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/);
    expect(m).not.toMatch(/rgba?\((?!var\()/);
  });

  it('o traço da casa (1.7) está presente em todas', () => {
    for (const [nome] of FIGURAS) expect(de(nome), nome).toContain('stroke-width="1.7"');
  });
});

describe('figuras do sistema — semântica das cores', () => {
  it('dourado (--azul) SÓ onde a pessoa clica: QR (Conectar aparelho) e Pix (Pagar)', () => {
    expect(de('FigQrConectar')).toContain('var(--azul');
    expect(de('FigPixPagar')).toContain('var(--azul');
    for (const nome of ['FigModoAtendentes', 'FigModoUnico', 'FigEsperaEquipe', 'FigSincronia']) {
      expect(de(nome), `${nome} não tem clique — sem dourado`).not.toContain('var(--azul');
    }
  });

  it('âmbar só no selo de atenção do modo único; a espera é serena (sem âmbar)', () => {
    expect(de('FigModoUnico')).toContain('var(--ambar');
    for (const nome of ['FigModoAtendentes', 'FigQrConectar', 'FigPixPagar', 'FigEsperaEquipe', 'FigSincronia']) {
      expect(de(nome), `${nome} sem âmbar`).not.toContain('var(--ambar');
    }
  });

  it('check verde onde há conclusão (modo recomendado e Pix pago)', () => {
    expect(de('FigModoAtendentes')).toContain('var(--verde');
    expect(de('FigPixPagar')).toContain('var(--verde');
  });
});

describe('figuras do sistema — conteúdo combinado', () => {
  it('o caminho do QR é o mesmo das instruções da etapa (Aparelhos conectados → Conectar aparelho)', () => {
    const m = de('FigQrConectar');
    for (const t of ['WhatsApp', 'Aparelhos', 'conectados', 'Conectar', 'aparelho']) expect(m).toContain(t);
  });
  it('a espera mostra as três etapas com os rótulos curtos da trilha', () => {
    const m = de('FigEsperaEquipe');
    for (const t of ['Planilha', 'WhatsApp', 'Mensalidade']) expect(m).toContain(t);
  });
  it('a sincronia marca os 15 minutos', () => {
    expect(de('FigSincronia')).toContain('15 min');
  });
});
