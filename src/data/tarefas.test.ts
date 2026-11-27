// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({ supabase: null, isSupabaseConfigured: false }));
vi.mock('@/context/OrgContext', () => ({ useOrg: () => ({ currentOrg: { id: 'o' } }) }));

const {
  aplicarRascunho, diaSP, estaAtrasada, filtrarTarefas, FILTROS_PADRAO, inicioDaSemana, normalizarTarefa, ordenarTarefas,
  prazoISO, projetosDe, rascunhoDe, rascunhoVazio, resumoTarefas, seedTarefasDemo, textoPrazo, traduzErroTarefa, venceHoje, visivelPara,
} = await import('./tarefas');
type T = ReturnType<typeof normalizarTarefa>;

// quarta-feira, 25/11/2026, 14:00 em Brasília
const AGORA = new Date('2026-11-25T14:00:00-03:00').getTime();
const T = (p: Partial<T> & { id: string }): T => ({
  titulo: p.id, descricao: null, responsavelId: null, criadoPor: 'eu', prazo: null, prazoComHora: false, prioridade: 'media', status: 'pendente',
  projeto: null, conversaId: null, contatoId: null, clienteNome: null, concluidaEm: null, criadoEm: '2026-11-20T12:00:00Z', atualizadoEm: '2026-11-20T12:00:00Z',
  itens: [], ...p,
});

describe('tarefas: prazo e atraso', () => {
  it('só o dia vence às 23:59 de Brasília; com hora, naquele horário', () => {
    expect(prazoISO('2026-11-25')).toBe('2026-11-26T02:59:00.000Z');
    expect(prazoISO('2026-11-25', '09:30')).toBe('2026-11-25T12:30:00.000Z');
    expect(prazoISO('')).toBeNull();
    expect(diaSP('2026-11-26T02:59:00.000Z')).toBe('2026-11-25');
  });
  it('atrasada = aberta e o prazo já passou; concluída nunca atrasa', () => {
    expect(estaAtrasada(T({ id: 'a', prazo: prazoISO('2026-11-24') }), AGORA)).toBe(true);
    expect(estaAtrasada(T({ id: 'b', prazo: prazoISO('2026-11-25') }), AGORA)).toBe(false); // hoje, só o dia: até 23:59
    expect(estaAtrasada(T({ id: 'c', prazo: prazoISO('2026-11-25', '13:00'), prazoComHora: true }), AGORA)).toBe(true);
    expect(estaAtrasada(T({ id: 'd', prazo: prazoISO('2026-11-20'), status: 'concluida' }), AGORA)).toBe(false);
    expect(estaAtrasada(T({ id: 'e' }), AGORA)).toBe(false); // sem prazo
  });
  it('vence hoje = prazo hoje e ainda não passou', () => {
    expect(venceHoje(T({ id: 'a', prazo: prazoISO('2026-11-25') }), AGORA)).toBe(true);
    expect(venceHoje(T({ id: 'b', prazo: prazoISO('2026-11-25', '17:00'), prazoComHora: true }), AGORA)).toBe(true);
    expect(venceHoje(T({ id: 'c', prazo: prazoISO('2026-11-25', '10:00'), prazoComHora: true }), AGORA)).toBe(false); // já atrasou
    expect(venceHoje(T({ id: 'd', prazo: prazoISO('2026-11-26') }), AGORA)).toBe(false);
  });
  it('o prazo por extenso', () => {
    expect(textoPrazo(T({ id: 'a', prazo: prazoISO('2026-11-25') }), AGORA)).toBe('Hoje');
    expect(textoPrazo(T({ id: 'b', prazo: prazoISO('2026-11-26', '15:30'), prazoComHora: true }), AGORA)).toBe('Amanhã às 15:30');
    expect(textoPrazo(T({ id: 'c', prazo: prazoISO('2026-11-24') }), AGORA)).toBe('Ontem');
    expect(textoPrazo(T({ id: 'd', prazo: prazoISO('2026-12-03') }), AGORA)).toBe('03/12');
    expect(textoPrazo(T({ id: 'e', prazo: prazoISO('2027-01-03') }), AGORA)).toBe('03/01/2027');
    expect(textoPrazo(T({ id: 'f' }), AGORA)).toBe('Sem prazo');
  });
  it('a semana começa na segunda, 0h de Brasília', () => {
    expect(new Date(inicioDaSemana(AGORA)).toISOString()).toBe('2026-11-23T03:00:00.000Z');
    // domingo ainda é da semana que começou na segunda anterior
    expect(new Date(inicioDaSemana(new Date('2026-11-29T22:00:00-03:00').getTime())).toISOString()).toBe('2026-11-23T03:00:00.000Z');
  });
});

describe('tarefas: ordem, filtros e resumo', () => {
  const lista = [
    T({ id: 'sem-prazo', prioridade: 'alta' }),
    T({ id: 'amanha', prazo: prazoISO('2026-11-26') }),
    T({ id: 'atrasada', prazo: prazoISO('2026-11-23'), responsavelId: 'ana' }),
    T({ id: 'hoje-baixa', prazo: prazoISO('2026-11-25'), prioridade: 'baixa', responsavelId: 'eu' }),
    T({ id: 'hoje-alta', prazo: prazoISO('2026-11-25'), prioridade: 'alta', responsavelId: 'eu', projeto: 'Documentação', clienteNome: 'Maria Aparecida' }),
    T({ id: 'feita-velha', status: 'concluida', concluidaEm: '2026-11-18T12:00:00Z', responsavelId: 'ana' }),
    T({ id: 'feita-nova', status: 'concluida', concluidaEm: '2026-11-24T12:00:00Z', itens: [{ id: 'i', texto: 'Pedir o extrato do INSS', feito: true }] }),
    T({ id: 'andamento', status: 'andamento', prazo: prazoISO('2026-11-27'), criadoPor: 'ana', responsavelId: 'ana', prioridade: 'alta' }),
  ];
  it('abertas pelo prazo (atrasada no topo, sem prazo por último), prioridade desempata; concluídas no fim, a mais recente antes', () => {
    expect(ordenarTarefas(lista).map((t) => t.id)).toEqual(['atrasada', 'hoje-alta', 'hoje-baixa', 'amanha', 'andamento', 'sem-prazo', 'feita-nova', 'feita-velha']);
  });
  it('filtros: abertas, minhas, responsável, prioridade, só atrasadas e busca sem acento', () => {
    const ids = (f: Partial<typeof FILTROS_PADRAO>) => filtrarTarefas(lista, { ...FILTROS_PADRAO, ...f }, 'eu', AGORA).map((t) => t.id).sort();
    expect(ids({})).toHaveLength(6); // as abertas
    expect(ids({ status: 'todas' })).toHaveLength(8);
    expect(ids({ status: 'concluida' })).toEqual(['feita-nova', 'feita-velha']);
    // minhas = comigo, ou criadas por mim sem responsável
    expect(ids({ escopo: 'minhas' })).toEqual(['amanha', 'hoje-alta', 'hoje-baixa', 'sem-prazo']);
    expect(ids({ responsavel: 'ana', status: 'todas' })).toEqual(['andamento', 'atrasada', 'feita-velha']);
    expect(ids({ responsavel: 'sem' })).toEqual(['amanha', 'sem-prazo']);
    expect(ids({ prioridade: 'alta' })).toEqual(['andamento', 'hoje-alta', 'sem-prazo']);
    expect(ids({ soAtrasadas: true })).toEqual(['atrasada']);
    expect(ids({ busca: 'documentacao' })).toEqual(['hoje-alta']);
    expect(ids({ busca: 'maria' })).toEqual(['hoje-alta']);
    expect(ids({ busca: 'extrato', status: 'todas' })).toEqual(['feita-nova']); // acha pela subtarefa
    // no quadro a situação não filtra (as colunas já são as situações)
    expect(filtrarTarefas(lista, FILTROS_PADRAO, 'eu', AGORA, true)).toHaveLength(8);
  });
  it('os quatro números do topo', () => {
    expect(resumoTarefas(lista, AGORA)).toEqual({ abertas: 6, atrasadas: 1, paraHoje: 2, concluidasSemana: 1 });
  });
  it('quem enxerga: administrador vê tudo; os demais, o que criaram ou está com eles', () => {
    const t = T({ id: 'x', criadoPor: 'admin', responsavelId: 'ana' });
    expect(visivelPara(t, 'admin', true)).toBe(true);
    expect(visivelPara(t, 'ana', false)).toBe(true);
    expect(visivelPara(t, 'gina', false)).toBe(false);
    expect(visivelPara(t, null, false)).toBe(false);
    expect(visivelPara(T({ id: 'y', criadoPor: 'gina' }), 'gina', false)).toBe(true);
  });
  it('projetos usados, sem repetir e em ordem', () => {
    expect(projetosDe([T({ id: 'a', projeto: 'Revisão' }), T({ id: 'b', projeto: ' Documentação ' }), T({ id: 'c', projeto: 'Revisão' }), T({ id: 'd' })])).toEqual(['Documentação', 'Revisão']);
  });
});

describe('tarefas: gravar e ler', () => {
  it('o rascunho vira tarefa com os textos aparados e o carimbo de concluída', () => {
    const r = rascunhoVazio({ titulo: '  Conferir comprovante de endereço ', dia: '2026-11-26', hora: '10:00', status: 'concluida', itens: [{ texto: ' Pedir a foto ', feito: false }, { texto: '   ', feito: true }] });
    const t = aplicarRascunho(null, r, { id: 'n1', euId: 'eu', agora: AGORA });
    expect(t).toMatchObject({ titulo: 'Conferir comprovante de endereço', criadoPor: 'eu', prazo: '2026-11-26T13:00:00.000Z', prazoComHora: true, concluidaEm: new Date(AGORA).toISOString() });
    expect(t.itens).toEqual([{ id: 'n1-i0', texto: 'Pedir a foto', feito: false }]);
    // editar mantém o autor, e reabrir tira o carimbo
    const reaberta = aplicarRascunho(t, { ...rascunhoDe(t), status: 'andamento' }, { id: 'n1', euId: 'outra', agora: AGORA + 1000 });
    expect(reaberta).toMatchObject({ criadoPor: 'eu', concluidaEm: null, prazoComHora: true, prazo: t.prazo });
    // tirar o vínculo com a conversa leva o cliente junto
    const ligada = aplicarRascunho(null, rascunhoVazio({ titulo: 'x', conversaId: 'c1', contatoId: 'k1', clienteNome: 'Maria' }), { id: 'n2', euId: 'eu', agora: AGORA });
    expect(aplicarRascunho(ligada, { ...rascunhoDe(ligada), conversaId: null, contatoId: null }, { id: 'n2', euId: 'eu' })).toMatchObject({ conversaId: null, contatoId: null, clienteNome: null });
  });
  it('lê a linha do banco com campos estranhos sem quebrar', () => {
    const t = normalizarTarefa({ id: 'k', titulo: '', status: 'arquivada', prioridade: 'urgente', prazo_com_hora: 1, itens: [{ id: 'b', texto: 'dois', ordem: 2, feito: true }, { id: 'a', texto: 'um', ordem: 1 }] });
    expect(t).toMatchObject({ titulo: 'Tarefa sem título', status: 'pendente', prioridade: 'media', prazoComHora: true, responsavelId: null });
    expect(t.itens.map((i) => i.texto)).toEqual(['um', 'dois']);
  });
  it('erros do banco em português', () => {
    expect(traduzErroTarefa({ message: 'responsavel_fora_da_equipe' })).toMatch(/não está mais na equipe/);
    expect(traduzErroTarefa({ message: 'new row violates row-level security policy for table "atd_tarefas"' })).toMatch(/permissão/);
    expect(traduzErroTarefa(new Error('qualquer coisa'))).toMatch(/Tente de novo/);
  });
  it('demonstração: tarefas de exemplo com atrasada, para hoje e concluída na semana, sem cliente de verdade', () => {
    const ts = seedTarefasDemo('eu', AGORA);
    const r = resumoTarefas(ts, AGORA);
    expect(r.atrasadas).toBeGreaterThan(0);
    expect(r.paraHoje).toBeGreaterThan(0);
    expect(r.concluidasSemana).toBeGreaterThan(0);
    expect(ts.some((t) => t.responsavelId === 'eu')).toBe(true);
    expect(ts.filter((t) => t.conversaId).every((t) => t.conversaId!.startsWith('wa-'))).toBe(true);
    expect(new Set(ts.map((t) => t.id)).size).toBe(ts.length);
  });
});
