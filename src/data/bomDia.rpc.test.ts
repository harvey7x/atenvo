import { beforeEach, describe, expect, it, vi } from 'vitest';

/* O preparo do bom dia contra um cliente Supabase FALSO (sem rede): o momento vai para o banco (p_momento) e a
   apresentação pede os DOIS resumos. Sem o p_momento o banco usa 'manha' sempre e, depois de uma folga (domingo,
   segunda, terça 03/11…), o diagnóstico das 17h e a 2ª parte da apresentação diriam "hoje" para a folga inteira. */

const h = vi.hoisted(() => ({
  rpcs: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  vozes: [] as string[],
  respostas: {} as Record<string, unknown>,
  erroEm: null as string | null,
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      h.rpcs.push({ fn, args });
      const m = String(args.p_momento ?? '(sem)');
      if (h.erroEm === m) return { data: null, error: { message: 'falhou' } };
      return { data: h.respostas[m] ?? null, error: null };
    },
    functions: {
      // a voz não vem (sem crédito, teste): o preparo segue sem ela — aqui só interessa o TEXTO pedido
      invoke: async (_fn: string, o: { body: { texto: string } }) => { h.vozes.push(o.body.texto); return { data: null, error: { message: 'sem voz' } }; },
    },
  },
  isSupabaseConfigured: true,
  isDemoMode: false,
  isDemoModeEnabled: false,
  isMisconfigured: false,
  supabaseEnv: { hasUrl: true, hasKey: true },
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/context/OrgContext', () => ({ useOrg: () => ({ currentOrg: null }) }));

const { BOM_DIA_REAL, prepararBomDia } = await import('./bomDia');

/* o que a RPC aplicada devolve na terça 03/11/2026: de manhã com a folga (desde sábado); às 17h, só o dia */
const manha = {
  modo: 'gestor', chegaram: 230, por_campanha: [{ canal: 'Empréstimo · Diego', n: 230 }], leads_ontem_mesma_hora: null, ia_atendeu_hoje: 80,
  nao_elegiveis: 40, ne_por_campanha: [{ canal: 'Empréstimo · Diego', n: 40 }], fechados_hoje: 0, melhor_ontem: { n: 5, nomes: ['Juliana'] },
  melhor_hoje: null, criticos: { desconectados: [], ia_sem_credito: false, sem_dono: 0 },
  pausa: { inicio: '2026-10-31T03:00:00+00:00', dias: 3, fim_de_semana: true, feriados: ['Finados'] }, melhor_dia: '2026-10-30',
};
const tarde = {
  ...manha, chegaram: 41, por_campanha: [{ canal: 'Empréstimo · Diego', n: 41 }], ia_atendeu_hoje: 20, nao_elegiveis: 9,
  ne_por_campanha: [{ canal: 'Empréstimo · Diego', n: 9 }], fechados_hoje: 3, melhor_hoje: { n: 2, nomes: ['Juliana'] }, pausa: null,
};
const terca = (h: number) => new Date(2026, 10, 3, h, 0);

beforeEach(() => {
  h.rpcs = [];
  h.vozes = [];
  h.respostas = { manha, tarde };
  h.erroEm = null;
});

describe('bom dia: o momento vai para o banco (p_momento)', () => {
  it('com o cliente configurado, o preparo é o do sistema real', () => {
    expect(BOM_DIA_REAL).toBe(true);
  });

  it('8h → p_momento "manha" (com a folga); 17h → "tarde" (só o dia)', async () => {
    const m = await prepararBomDia({ org: 'org-1', uid: 'u-m', nome: 'Murilo', momento: 'manha', agora: terca(8) }).resumo;
    const t = await prepararBomDia({ org: 'org-1', uid: 'u-t', nome: 'Murilo', momento: 'tarde', agora: terca(17) }).resumo;
    expect(h.rpcs).toEqual([
      { fn: 'bom_dia_resumo', args: { p_org: 'org-1', p_momento: 'manha' } },
      { fn: 'bom_dia_resumo', args: { p_org: 'org-1', p_momento: 'tarde' } },
    ]);
    expect(m.pausa).toEqual({ inicio: '2026-10-31', dias: 3, fimDeSemana: true, feriados: ['Finados'] });
    expect(t.pausa).toBeNull();
  });

  it('a apresentação pede os DOIS (manhã e 17h) e cada parte fala os números dela — a voz é pedida com esse texto', async () => {
    const p = prepararBomDia({ org: 'org-2', uid: 'u-a', nome: 'Murilo', momento: 'tarde', tipo: 'apresentacao', agora: terca(17) });
    const [r, rt] = await Promise.all([p.resumo, p.resumoTarde]);
    await Promise.all(p.vozes);
    expect(h.rpcs.map((x) => x.args)).toEqual([{ p_org: 'org-2', p_momento: 'manha' }, { p_org: 'org-2', p_momento: 'tarde' }]);
    expect([r.pausa?.inicio, rt?.pausa ?? null]).toEqual(['2026-10-31', null]);
    // o texto das duas vozes = o que a tela fala: a parte 1 com a folga, a parte 2 com o dia
    expect(h.vozes).toHaveLength(2);
    const [v1, v2] = h.vozes;
    expect(v1).toContain('Espero que o final de semana e o feriado de Finados tenham sido bons. Desde sábado, entraram 230 leads no sistema');
    expect(v1).toContain('A melhor vendedora de sexta-feira foi a Juliana, com 5 contratos fechados.');
    expect(v2).toContain('Hoje entraram 41 leads no sistema, e 9 foram marcados como não elegíveis.');
    expect(v2).not.toMatch(/Desde sábado|Espero que/);
    // a mesma tela de novo (dentro da validade): o mesmo preparo, sem chamar o banco outra vez
    expect(prepararBomDia({ org: 'org-2', uid: 'u-a', nome: 'Murilo', momento: 'tarde', tipo: 'apresentacao', agora: terca(17) })).toBe(p);
    expect(h.rpcs).toHaveLength(2);
  });

  it('se um dos dois resumos da apresentação falha, o preparo não fica em cache (a próxima abertura tenta de novo)', async () => {
    h.erroEm = 'tarde';
    const base = { org: 'org-3', uid: 'u-e', nome: 'Murilo', momento: 'tarde' as const, tipo: 'apresentacao' as const, agora: terca(17) };
    const p = prepararBomDia(base);
    await expect(Promise.all([p.resumo, p.resumoTarde])).rejects.toThrow('falhou');
    await Promise.all(p.vozes);   // as vozes resolvem null (sem número, sem fala)
    h.erroEm = null;
    const de_novo = prepararBomDia(base);
    expect(de_novo).not.toBe(p);
    await Promise.all([de_novo.resumo, de_novo.resumoTarde]);
    expect(h.rpcs.filter((x) => x.args.p_org === 'org-3')).toHaveLength(4);
  });
});
