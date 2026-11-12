// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import type { VigiaCaso, VigiaDados } from '@/data/vigiaRespostas';

const estado = vi.hoisted(() => ({ role: 'admin' as string, variante: null as string | null }));
vi.mock('@/context/OrgContext', () => ({ useOrg: () => ({ currentOrg: { id: 'org1', role: estado.role } }) }));
vi.mock('@/lib/supabase', () => ({ supabase: null, isSupabaseConfigured: false }));
vi.mock('@/data/vigiaRespostas', async (original) => {
  const m = await original<typeof import('@/data/vigiaRespostas')>();
  return {
    ...m,
    useVigiaRespostas: () => ({ data: m.demoVigia({ variante: estado.variante }), isError: false }),
  };
});

import { PainelVigia, Vigia } from './Vigia';

const erroOriginal = console.error;
vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
  if (String(a[0]).includes('useLayoutEffect does nothing on the server')) return;
  erroOriginal(...a);
});
const render = (el: ReactElement) => renderToString(<MemoryRouter>{el}</MemoryRouter>).replace(/<!-- -->/g, '');
const abrir = () => render(<Vigia />);

let seq = 0;
const caso = (i: number, extra: Partial<VigiaCaso> = {}): VigiaCaso => {
  seq += 1;
  return {
    casoId: `t${seq}`, conversaId: `vt${seq}`, nome: `Cliente ${String.fromCharCode(65 + i)}`,
    telefone: `55519942612${String(10 + i)}`, canal: 'JUROS ABUSIVO', dono: 'Juliana Andrade',
    quemDeve: 'humano', motivo: 'humano_atrasado', severidade: 'alta', esperaMin: 100 + i,
    tentativasCura: 0, ultimaMsg: 'oi, tudo bem?', abertoEm: null, ...extra,
  };
};
const dados = (casos: VigiaCaso[]): VigiaDados => ({
  lidoEm: '2026-11-12T18:00:00.000Z',
  saude: {
    vigiaOk: true, ultimoMinutos: 1, ultimoErro: null, ultimoEm: '2026-11-12T17:59:00.000Z',
    abertos: casos.length, porSeveridade: {}, resolvidos24h: 3, curas24h: 1, rodadas24h: 478,
  },
  casos,
});

describe('Vigia (painel do dashboard)', () => {
  it('o admin vê o selo verde, a faixa, os chips, o veredito e os links das conversas', () => {
    estado.role = 'admin'; estado.variante = null;
    const h = abrir();
    expect(h).toContain('Conferido há 1 min');
    expect(h).toContain('Menos de 1 h');
    expect(h).toContain('De 1 h a 24 h');
    expect(h).toContain('Mais de 24 h');
    expect(h).toContain('Resolvidos em 24 h');
    expect(h).toContain('80 clientes esperando resposta agora');
    expect(h).toContain('Juliana');                 // chip da atendente com mais casos
    expect(h).toContain('236 clientes');            // contagem viva
    expect(h).toContain('/whatsapp?conversa=');
    expect(h).toContain('Buscar cliente ou telefone');
  });

  it('com 10 casos acima de 24 h, aparecem 3 nomes e "Mostrar os outros 7"', () => {
    const d = dados(Array.from({ length: 10 }, (_, i) => caso(i, { esperaMin: 1500 + i * 10 })));
    const h = render(<PainelVigia d={d} />);
    expect(h).toContain('Cliente J');               // maior espera primeiro
    expect(h).toContain('Cliente I');
    expect(h).toContain('Cliente H');
    expect(h).not.toContain('Cliente G');
    expect(h).toContain('Mostrar os outros 7');
  });

  it('com inicial {quem}, só aparecem os clientes daquela atendente', () => {
    const d = dados([
      caso(0), caso(1),
      caso(2, { dono: 'Luiz Prates' }), caso(3, { dono: 'Luiz Prates' }),
    ]);
    const h = render(<PainelVigia d={d} inicial={{ quem: 'p:Juliana Andrade' }} />);
    expect(h).toContain('Cliente A');
    expect(h).toContain('Cliente B');
    expect(h).not.toContain('Cliente C');
    expect(h).toContain('2 de 4 clientes');
  });

  it('vigia parado: selo rubro, aviso role=alert e o contorno no cartão', () => {
    estado.role = 'admin'; estado.variante = 'parado';
    const h = abrir();
    expect(h).toContain('Parado há 12 min');
    expect(h).toContain('role="alert"');
    expect(h).toContain('d5-vg-parado');
    expect(h).toContain('O vigia parou de conferir');
  });

  it('vazio: bloco calmo com a frase dos 3 minutos', () => {
    estado.role = 'admin'; estado.variante = 'vazio';
    const h = abrir();
    expect(h).toContain('Nenhum cliente sem resposta.');
    expect(h).toContain('O vigia confere de novo em até 3 minutos.');
  });

  it('lista cortada pelo banco: a nota explica o corte', () => {
    estado.role = 'admin'; estado.variante = 'cortada';
    const h = abrir();
    expect(h).toContain('A lista traz os 300 casos mais graves de 412.');
    expect(h).toContain('lista incompleta');
  });

  it('mídia na última mensagem é traduzida', () => {
    const d = dados([caso(0, { ultimaMsg: '[audio]' }), caso(1, { ultimaMsg: '[imagem]' })]);
    const h = render(<PainelVigia d={d} />);
    expect(h).toContain('Mensagem de voz');
    expect(h).toContain('Imagem');
  });

  it('quem não é admin não vê nada', () => {
    estado.role = 'atendente'; estado.variante = null;
    expect(abrir()).toBe('');
  });

  it('GUARDA: o CSS do vigia não tem cor cravada nem movimento de entrada', () => {
    const css = readFileSync(join(__dirname, 'dashboardV5.css'), 'utf8');
    const inicio = css.indexOf('Vigia de respostas (d5-vg-)');
    expect(inicio).toBeGreaterThan(-1);
    const bloco = css.slice(inicio);
    expect(bloco).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(bloco).not.toContain('animation');
  });
});
