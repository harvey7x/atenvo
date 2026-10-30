// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/* Perfil GESTOR do bom dia (o Murilo — dono 30/10: "a central de avisos não precisa aparecer por enquanto"):
   o sino não mostra NADA do Radar — nem na lista, nem nas seções, nem na linha das decisões, nem no ponto.
   Atendentes e o Matheus (perfil vendedor): nada muda. O sino de verdade (useSino + SinoPainel), com os
   dados mockados. */

type Modo = 'gestor' | 'vendedor' | null;
const estado = vi.hoisted(() => ({ modo: 'gestor' as Modo, lista: [] as unknown[] }));
vi.mock('@/data/bomDia', () => ({ useModoBomDia: () => estado.modo }));
vi.mock('@/context/OrgContext', () => ({
  useOrg: () => ({ currentOrg: { id: 'org1', name: 'Org', slug: 'org', role: 'admin' } }),
}));
vi.mock('@/data/remarketing', () => ({
  REMARKETING_REAL: true,
  useNotificacoes: () => ({ data: estado.lista }),
  useMarcarNotificacao: () => ({ mutate: () => undefined }),
}));
vi.mock('@/data/vacuo', () => ({
  useVacuoDecisoes: () => ({ data: [{ conversaId: 'ref-d', contatoNome: 'Cliente D', donoId: 'u2', donoNome: 'Juliana' }] }),
  useRadarMeus: () => ({ negociacao: [], fechado: [], ligar: [], cutucadas: [], pedidos: new Set<string>() }),
  useRadarAvisos: () => ({ isSuccess: true, data: [] }),
}));

import type { Notificacao } from '@/data/remarketing';
import { naoLidasQueAcendem, secaoDaNotificacao, semRadar, SinoPainel, useSino } from './SinoPainel';

// o MemoryRouter usa useLayoutEffect: no render de servidor o React só avisa (ruído)
const erroOriginal = console.error;
vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
  if (String(a[0]).includes('useLayoutEffect does nothing on the server')) return;
  erroOriginal(...a);
});

const minuto = Date.now() - 60_000;
const n = (id: string, tipo: string, extra: Partial<Notificacao> = {}): Notificacao => ({
  id, tipo, titulo: `Aviso ${id}`, corpo: `Texto ${id}`, rota: '/whatsapp', refId: `ref-${id}`, lidaEm: null,
  criadoEm: new Date(minuto).toISOString(), ...extra,
});
/* uma de cada família do Radar + as de fora (remarketing, outro módulo) */
const LISTA: Notificacao[] = [
  n('a', 'vacuo_aviso'), n('f', 'vacuo_fechado'), n('l', 'robo_ligar'), n('lr', 'robo_ligar_resumo'),
  n('r', 'vacuo_resumo', { rota: '/whatsapp?radar=fechados' }),
  n('c', 'vacuo_cutucada'), n('d', 'vacuo_decisao', { rota: '/radar' }), n('p', 'vacuo_punicao'), n('rec', 'vacuo_recebido'),
  n('man', 'vacuo_mantido'), n('dev', 'vacuo_devolvido'), n('s', 'robo_ligar_sem_dono'),
  n('rm1', 'remarketing'), n('rm2', 'remarketing', { lidaEm: new Date().toISOString() }), n('x', 'pendencia_nova'),
];

describe('sino: sem o Radar no perfil gestor', () => {
  it('semRadar tira toda notificação do Radar (inclusive as decisões de repasse) e deixa o resto', () => {
    const fica = semRadar(LISTA);
    expect(fica.map((x) => x.id)).toEqual(['rm1', 'rm2', 'x']);
    expect(new Set(fica.map(secaoDaNotificacao))).toEqual(new Set(['outros']));
  });

  it('o ponto: só as não lidas de Outros acendem (antes: Gestão também — pedido, decisão, repasse)', () => {
    expect(naoLidasQueAcendem(LISTA)).toBe(9);           // 7 de Gestão + 2 de Outros
    expect(naoLidasQueAcendem(semRadar(LISTA))).toBe(2);
    expect(naoLidasQueAcendem(semRadar(LISTA.filter((x) => x.tipo !== 'remarketing' && x.tipo !== 'pendencia_nova')))).toBe(0);
  });

  function abrirSino(modo: Modo) {
    estado.modo = modo;
    estado.lista = LISTA;
    let ponto = -1;
    function Sonda() {
      const sino = useSino();
      ponto = naoLidasQueAcendem(sino.lista);
      return <SinoPainel pos={{ top: 0, right: 0 }} sino={sino} aoFechar={() => undefined} />;
    }
    const html = renderToString(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter><Sonda /></MemoryRouter>
      </QueryClientProvider>,
    );
    return { html, ponto };
  }
  const SECOES_DO_RADAR = ['Gestão', 'Em negociação', 'Fechados', 'Ligar', 'Decisões de repasse'];

  it('gestor: o painel tem só Outros — nenhuma seção nem linha do Radar; o ponto só conta Outros', () => {
    const { html, ponto } = abrirSino('gestor');
    expect(html).toContain('Outros');
    expect(html).toContain('Aviso rm1');
    for (const s of SECOES_DO_RADAR) expect(html, s).not.toContain(s);
    for (const id of ['a', 'f', 'l', 'c', 'd', 's', 'p']) expect(html).not.toContain(`Aviso ${id}<`);
    expect(ponto).toBe(2);
  });

  it('perfil ainda não lido: também sem o Radar (a Central nunca pisca para o gestor)', () => {
    const { html, ponto } = abrirSino(null);
    for (const s of SECOES_DO_RADAR) expect(html, s).not.toContain(s);
    expect(ponto).toBe(2);
  });

  it('vendedor (Matheus, atendentes): nada muda — as seções do Radar e a linha das decisões continuam', () => {
    const { html, ponto } = abrirSino('vendedor');
    for (const s of SECOES_DO_RADAR) expect(html, s).toContain(s);
    expect(html).toContain('Decisões de repasse pendentes: 1');
    expect(ponto).toBe(9);
  });
});
