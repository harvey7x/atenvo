// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({ supabase: null, isSupabaseConfigured: false }));
vi.mock('@/context/OrgContext', () => ({ useOrg: () => ({ currentOrg: { id: 'o' } }) }));

const {
  agruparAoVivo, demoAoVivo, normalizarDashAoVivo, previewAoVivo, quandoAoVivo, resumoAoVivo, rotuloCanal, semAcento, traduzErroAoVivo,
} = await import('./aoVivo');
const { MSG_ABA_NAO_LIGADA } = await import('./dashboardV5');
type Dash = ReturnType<typeof normalizarDashAoVivo>;

const C = (id: string, extra: Partial<Dash['conversas'][number]> = {}): Dash['conversas'][number] => ({
  id, contatoId: id + '-ct', contato: 'Cliente ' + id, fotoUrl: null, ultimaMsg: 'oi', ultimaTipo: 'texto', ultimaDirecao: 'saida',
  ultimaEm: '2026-11-25T12:00:00Z', canalId: 'k1', atendenteId: null, equipeId: null, etiquetas: [], iaAtiva: false, esperando: false, naoLidas: 0, ...extra,
});
const base = (conversas: Dash['conversas']): Dash => ({
  conversas, total: conversas.length, limite: 2000,
  atendentes: [
    { id: 'u-rai', nome: 'Raissa', papel: 'atendente', ativo: true },
    { id: 'u-ale', nome: 'Alexandra', papel: 'atendente', ativo: true },
    { id: 'u-fel', nome: 'Felipe', papel: 'atendente', ativo: true },
    { id: 'u-adm', nome: 'Administrador', papel: 'admin', ativo: true },
    { id: 'u-old', nome: 'Saiu da empresa', papel: 'atendente', ativo: false },
  ],
  canais: [{ id: 'k1', nome: 'PRINCIPAL', numero: '5551999990101' }],
  equipes: [{ id: 'e-ven', nome: 'Vendas' }, { id: 'e-pos', nome: 'Pós-venda' }],
  etiquetas: [{ nome: 'Juros', cor: '#e11d48' }, { nome: 'Empréstimo', cor: null }, { nome: 'Sem uso', cor: null }],
  geradoEm: '2026-11-25T12:00:00Z',
});

describe('ao vivo: o cartão', () => {
  it('a última mensagem numa linha, sem o carimbo de assinatura; mídia pelo tipo', () => {
    expect(previewAoVivo('*Ana – REVIZA:*\nBom dia!   Já vou\nver', 'texto')).toBe('Bom dia! Já vou ver');
    expect(previewAoVivo('*Atenção:* leia', 'texto')).toBe('*Atenção:* leia'); // negrito de verdade fica
    expect(previewAoVivo('', 'audio')).toBe('[áudio]');
    expect(previewAoVivo(null, 'imagem')).toBe('[foto]');
    expect(previewAoVivo('segue o extrato', 'imagem')).toBe('[foto] segue o extrato');
    expect(previewAoVivo('', 'video')).toBe('[vídeo]');
    expect(previewAoVivo('', 'documento')).toBe('[documento]');
    expect(previewAoVivo('', 'texto')).toBe('');
  });
  it('o número: apelido, senão os 4 últimos dígitos', () => {
    expect(rotuloCanal({ nome: 'PRINCIPAL', numero: '5551999990101' })).toBe('PRINCIPAL');
    expect(rotuloCanal({ nome: '  ', numero: '+55 (51) 99999-0303' })).toBe('final 0303');
    expect(rotuloCanal({ nome: null, numero: '12' })).toBe('WhatsApp');
    expect(rotuloCanal(undefined)).toBe('WhatsApp');
  });
  it('quando: hora de hoje, "Ontem", dia da semana, data — no horário de Brasília', () => {
    const agora = new Date('2026-11-25T15:00:00-03:00'); // quarta
    expect(quandoAoVivo('2026-11-25T10:08:00-03:00', agora)).toBe('10:08');
    expect(quandoAoVivo('2026-11-24T23:50:00-03:00', agora)).toBe('Ontem');
    expect(quandoAoVivo('2026-11-25T01:00:00Z', agora)).toBe('Ontem'); // 22h de terça em Brasília
    expect(quandoAoVivo('2026-11-23T09:00:00-03:00', agora)).toBe('seg.');
    expect(quandoAoVivo('2026-11-19T09:00:00-03:00', agora)).toBe('qui.');
    expect(quandoAoVivo('2026-11-18T09:00:00-03:00', agora)).toBe('18/11');
    expect(quandoAoVivo('2025-12-30T09:00:00-03:00', agora)).toBe('30/12/25');
    expect(quandoAoVivo(null, agora)).toBe('');
    expect(quandoAoVivo('não é data', agora)).toBe('');
  });
  it('busca sem acento', () => {
    expect(semAcento(' Conceição ')).toBe('conceicao');
  });
});

describe('ao vivo: as colunas', () => {
  const d = base([
    C('a', { atendenteId: 'u-rai', equipeId: 'e-ven', etiquetas: ['Juros', 'Empréstimo'], esperando: true, ultimaEm: '2026-11-25T11:00:00Z' }),
    C('b', { atendenteId: 'u-rai', equipeId: 'e-ven', ultimaEm: '2026-11-25T12:30:00Z' }),
    C('c', { atendenteId: null, esperando: true, contato: 'Conceição Paim', etiquetas: ['Fora do catálogo'] }),
    C('d', { atendenteId: 'u-old', equipeId: 'e-sumiu' }),
    C('e', { atendenteId: 'u-adm', iaAtiva: true }),
  ]);
  it('por atendente: "Sem atendente" na frente, o resto em ordem alfabética; ativo sem conversa aparece com zero', () => {
    const cs = agruparAoVivo(d, 'atendentes');
    expect(cs.map((c) => c.titulo)).toEqual(['Sem atendente', 'Administrador', 'Alexandra', 'Felipe', 'Raissa', 'Saiu da empresa']);
    const rai = cs.find((c) => c.titulo === 'Raissa')!;
    expect(rai.conversas.map((c) => c.id)).toEqual(['b', 'a']); // mais recente primeiro
    expect(rai.esperando).toBe(1);
    expect(cs.find((c) => c.titulo === 'Alexandra')!.conversas).toHaveLength(0);
    // o administrador sem conversa não vira coluna
    expect(agruparAoVivo(base([C('x', { atendenteId: 'u-rai' })]), 'atendentes').map((c) => c.titulo)).not.toContain('Administrador');
  });
  it('só esperando resposta e a busca pelo nome (sem acento); com busca, só as colunas que acharam alguém', () => {
    const esp = agruparAoVivo(d, 'atendentes', { soEsperando: true });
    expect(esp.flatMap((c) => c.conversas.map((x) => x.id)).sort()).toEqual(['a', 'c']);
    const busca = agruparAoVivo(d, 'atendentes', { busca: 'conceicao' });
    expect(busca.map((c) => c.titulo)).toEqual(['Sem atendente']);
    expect(agruparAoVivo(d, 'atendentes', { busca: 'ninguém assim' })).toEqual([]);
  });
  it('por equipe: em ordem alfabética, "Sem equipe" no fim; equipe que não existe mais cai em "Sem equipe"', () => {
    const cs = agruparAoVivo(d, 'equipes');
    expect(cs.map((c) => [c.titulo, c.conversas.length])).toEqual([['Pós-venda', 0], ['Vendas', 2], ['Sem equipe', 3]]);
    // sem nenhuma equipe cadastrada: tudo numa coluna só
    expect(agruparAoVivo({ ...d, equipes: [] }, 'equipes').map((c) => c.titulo)).toEqual(['Sem equipe']);
  });
  it('por etiqueta: na ordem das Configurações, a conversa com duas etiquetas nas duas, "Sem etiqueta" no fim', () => {
    const cs = agruparAoVivo(d, 'etiquetas');
    expect(cs.map((c) => [c.titulo, c.conversas.map((x) => x.id).join('')])).toEqual([['Juros', 'a'], ['Empréstimo', 'a'], ['Fora do catálogo', 'c'], ['Sem etiqueta', 'bde']]);
    expect(cs[0].cor).toBe('#e11d48');
  });
  it('o resumo do topo', () => {
    expect(resumoAoVivo({ ...d, total: 2400 })).toEqual({ abertas: 2400, esperando: 2, comIa: 1 });
  });
});

describe('ao vivo: a resposta do servidor', () => {
  it('lê a resposta com campos faltando sem quebrar, e os nomes pelas listas', () => {
    const r = normalizarDashAoVivo({
      conversas: [
        { id: 'k', contato: 'Ana', canal_id: 'c1', atendente_id: 'u1', equipe_id: 'e1', ultima_direcao: 'entrada', etiquetas: ['Juros', 'Juros', '', null], ia_ativa: 'true', nao_lidas: '2' },
        { id: 'k', contato: 'repetida' },
        { contato: 'sem id' },
        { id: 'z', ultima_direcao: 'estranha', esperando: false },
      ],
      atendentes: [{ id: 'u1', nome: 'Raissa', papel: 'atendente', ativo: true }],
      canais: [{ id: 'c1', numero: '5551999990101' }],
      equipes: [{ id: 'e1', nome: 'Vendas' }],
      etiquetas: [{ nome: 'Juros' }, { nome: '' }],
      total: '1',
    });
    expect(r.conversas).toHaveLength(2);
    expect(r.conversas[0]).toMatchObject({ id: 'k', contato: 'Ana', esperando: true, iaAtiva: true, naoLidas: 2, etiquetas: ['Juros'], ultimaMsg: '', fotoUrl: null, ultimaEm: null });
    expect(r.conversas[1]).toMatchObject({ contato: 'Sem nome', ultimaDirecao: null, esperando: false, canalId: null });
    expect(r.total).toBe(2); // nunca menos do que veio
    expect(r.limite).toBe(2000);
    expect(r.canais).toEqual([{ id: 'c1', nome: null, numero: '5551999990101' }]);
    expect(r.etiquetas).toEqual([{ nome: 'Juros', cor: null }]);
    expect(normalizarDashAoVivo(null).conversas).toEqual([]);
  });
  it('aceita o nome junto da conversa (canal, atendente e equipe dentro dela)', () => {
    const r = normalizarDashAoVivo({ conversas: [{ id: 'k', canal: { id: 'c9', nome: 'CAMPANHA' }, atendente_id: 'u9', atendente: 'Felipe', equipe_id: 'e9', equipe: 'Pós-venda' }] });
    expect(r.canais).toEqual([{ id: 'c9', nome: 'CAMPANHA', numero: null }]);
    expect(r.atendentes[0]).toMatchObject({ id: 'u9', nome: 'Felipe', ativo: false });
    expect(r.equipes).toEqual([{ id: 'e9', nome: 'Pós-venda' }]);
    expect(agruparAoVivo(r, 'atendentes').map((c) => c.titulo)).toEqual(['Sem atendente', 'Felipe']);
  });
  it('erros em português', () => {
    expect(traduzErroAoVivo({ code: 'PGRST202', message: 'Could not find the function public.dash_ao_vivo' })).toBe(MSG_ABA_NAO_LIGADA);
    expect(traduzErroAoVivo({ message: 'sem_permissao' })).toMatch(/administrador/);
    expect(traduzErroAoVivo(new Error('TypeError: Failed to fetch'))).toMatch(/conexão/);
    expect(traduzErroAoVivo({ message: 'syntax error at or near' })).toBe('Não foi possível carregar as conversas agora.');
  });
});

describe('ao vivo: a demonstração', () => {
  it('só gente e conversas inventadas, sempre iguais, e um cliente novo a cada 30 s', () => {
    const t0 = Date.parse('2026-11-25T15:00:00Z');
    const a = demoAoVivo(t0, t0);
    expect(a.conversas.length).toBeGreaterThan(100);
    expect(new Set(a.conversas.map((c) => c.id)).size).toBe(a.conversas.length);
    expect(a.atendentes.map((p) => p.nome)).toEqual(['Administrador', 'Alexandra', 'Guilherme', 'Raissa', 'Felipe', 'Emillyn', 'Juliano', 'Rafael']);
    expect(demoAoVivo(t0, t0)).toEqual(a);
    // as primeiras abrem a conversa de exemplo do WhatsApp da prévia
    expect(a.conversas.some((c) => c.id === 'wa-maria')).toBe(true);
    // nunca no futuro; esperando = a última é do cliente
    expect(a.conversas.every((c) => Date.parse(c.ultimaEm!) <= t0 && c.esperando === (c.ultimaDirecao === 'entrada'))).toBe(true);
    // todas as colunas por atendente têm nome
    expect(agruparAoVivo(a, 'atendentes').every((c) => c.titulo && c.titulo !== 'Atendente')).toBe(true);
    const b = demoAoVivo(t0 + 95_000, t0);
    expect(b.conversas[0].ultimaEm).toBe(new Date(t0 + 90_000).toISOString());
    expect(b.conversas[0].esperando).toBe(true);
  });
});
