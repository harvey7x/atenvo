import { describe, expect, it } from 'vitest';
import type { WaContact, WaMessage } from '@/data/whatsappDemo';
import {
  CarimbosRealtime, TABELAS_CANAL_WA, aplicarIaNaLista, aplicarSatelites, efeitoNoCard, etapaDoContato, etapasDeOportunidades, iaDaLinha,
  pousarCargaCompleta, reconciliarCargaAlvo, reconciliarCargaCompleta, rotearEvento, type CtxRoteamento, type OppLinha,
} from './whatsappRealtime';

/* Roteamento dos eventos do canal wa-<org> (realtime sem recarga completa), a corrida
   carga × evento e a regra de etapa ("ganho grudento") que a busca-alvo reaproveita. */

const conv = (c: Partial<WaContact> & { id: string }): WaContact => ({
  name: 'X', phone: '', chip: '', time: '', unread: 0, tabs: [], status: '', last: '', email: '',
  stage: '', resp: '', origin: '', tags: [], lastInter: '', notes: '', doc: null, msgs: [], ...c,
});
const T = (s: string) => `2026-10-20T${s}.000Z`;
/** mapMensagem de teste: o suficiente do mapMensagens para o patch do card */
const ctx: CtxRoteamento = {
  mapMensagem: (r) => ({
    id: r.id as string, dir: r.direcao === 'saida' ? 'out' : 'in', text: (r.conteudo as string) ?? '', time: '12:00',
    tipo: r.tipo as string, tsISO: (r.enviada_em as string) ?? undefined, status: (r.status as string) ?? undefined,
  } as WaMessage),
  canalPorId: (id) => (id === 'c2' ? { alias: 'LUIZA' } : null),
};
const linhaMsg = (p: Record<string, unknown> = {}) => ({
  id: 'm-nova', conversa_id: 'a', direcao: 'entrada', conteudo: 'oi', tipo: 'texto', enviada_em: T('12:00:00'), status: 'recebida', metadados: {}, ...p,
});
const lista = () => [
  conv({ id: 'a', contatoId: 'k1', aberta: true, lastAtMs: new Date(T('11:00:00')).getTime(), unread: 0, canalId: 'c1', msgs: [{ id: 'm-velha', dir: 'in', time: '11:00', text: 'x', tipo: 'texto', tsISO: T('11:00:00') }] }),
  conv({ id: 'b', contatoId: 'k2', aberta: true, arquivada: false, precisaHumano: false, atendenteId: null, canalId: 'c1' }),
];

describe('rotearEvento — mensagens', () => {
  it('INSERT de conversa da lista: patch na hora + busca-alvo dela (etapa/IA frescas)', () => {
    const l = lista();
    const r = rotearEvento('mensagens', 'INSERT', linhaMsg(), null, l, ctx);
    expect(r.recarregarTudo).toBe(false);
    expect(r.lista).not.toBe(l);
    expect(r.lista![0]).toMatchObject({ last: 'oi', unread: 1, aguardando: true });
    expect(r.alvoIds).toEqual(['a']);
    expect(r.tocarIds).toEqual(['a']);
  });
  it('UPDATE (ACK ✓→✓✓): só patch, SEM busca e sem recarga', () => {
    const l = lista();
    const r = rotearEvento('mensagens', 'UPDATE', linhaMsg({ id: 'm-velha', enviada_em: T('11:00:00'), status: 'lida' }), null, l, ctx);
    expect(r.alvoIds).toEqual([]);
    expect(r.recarregarTudo).toBe(false);
    expect(r.motivo).toBe('mensagem-atualizada');
    expect(r.lista![0].unread).toBe(0);                 // UPDATE não resoma não-lida
  });
  it('mensagem de conversa FORA da lista (conversa nova): busca-alvo por id', () => {
    const r = rotearEvento('mensagens', 'INSERT', linhaMsg({ conversa_id: 'nova' }), null, lista(), ctx);
    expect(r.alvoIds).toEqual(['nova']);
    expect(r.motivo).toBe('mensagem-de-conversa-fora-da-lista');
  });
  it('sem cache (carga completa em voo): só carimba — a carga pede a busca ao pousar', () => {
    const r = rotearEvento('mensagens', 'INSERT', linhaMsg(), null, undefined, ctx);
    expect(r).toMatchObject({ lista: undefined, alvoIds: [], tocarIds: ['a'], recarregarTudo: false });
  });
  it('DELETE da mensagem que o card guarda → busca-alvo; DELETE irrelevante → nada; sem id → recarga', () => {
    const l = lista();
    expect(rotearEvento('mensagens', 'DELETE', null, { id: 'm-velha' }, l, ctx).alvoIds).toEqual(['a']);
    const irrelevante = rotearEvento('mensagens', 'DELETE', null, { id: 'outra' }, l, ctx);
    expect(irrelevante).toMatchObject({ alvoIds: [], recarregarTudo: false, lista: l });
    expect(rotearEvento('mensagens', 'DELETE', null, {}, l, ctx).recarregarTudo).toBe(true);
  });
  it('UPDATE sem colunas grandes (TOAST inalterado) não patcha o card às cegas', () => {
    const l = lista();
    const { conteudo: _c, metadados: _m, ...semGrandes } = linhaMsg({ id: 'm-velha', status: 'lida' });
    const r = rotearEvento('mensagens', 'UPDATE', semGrandes, null, l, ctx);
    expect(r).toMatchObject({ lista: l, alvoIds: [], recarregarTudo: false, motivo: 'mensagem-payload-incompleto' });
  });
  it('payload sem conversa_id → recarga completa (fallback)', () => {
    expect(rotearEvento('mensagens', 'INSERT', { id: 'x' }, null, lista(), ctx).recarregarTudo).toBe(true);
  });
});

describe('rotearEvento — conversas', () => {
  it('INSERT (conversa nova) → busca-alvo por id', () => {
    const r = rotearEvento('conversas', 'INSERT', { id: 'nova' }, null, lista(), ctx);
    expect(r).toMatchObject({ alvoIds: ['nova'], tocarIds: ['nova'], recarregarTudo: false, motivo: 'conversa-nova' });
  });
  it('UPDATE coberto pelo patch (lida): só patch', () => {
    const l = lista();
    l[1] = { ...l[1], unread: 3 };
    const r = rotearEvento('conversas', 'UPDATE', { id: 'b', nao_lidas: 0 }, null, l, ctx);
    expect(r.lista![1].unread).toBe(0);
    expect(r.alvoIds).toEqual([]);
    expect(r.tocarIds).toEqual(['b']);
  });
  it('UPDATE sem mudança visível: mesma lista, sem busca — mas CARIMBA (confirma patch otimista)', () => {
    const l = lista();
    const r = rotearEvento('conversas', 'UPDATE', { id: 'b', ultima_entrada_em: T('12:00:00') }, null, l, ctx);
    expect(r).toMatchObject({ lista: l, alvoIds: [], tocarIds: ['b'], motivo: 'conversa-sem-mudanca-visivel' });
  });
  it('UPDATE que arquiva/encerra/pede humano/troca atendente ou contato → patch + busca-alvo', () => {
    const l = lista();
    expect(rotearEvento('conversas', 'UPDATE', { id: 'b', arquivada_em: T('12:00:00') }, null, l, ctx).alvoIds).toEqual(['b']);
    expect(rotearEvento('conversas', 'UPDATE', { id: 'b', status: 'resolvida' }, null, l, ctx).alvoIds).toEqual(['b']);
    expect(rotearEvento('conversas', 'UPDATE', { id: 'b', precisa_humano: true }, null, l, ctx).alvoIds).toEqual(['b']);
    expect(rotearEvento('conversas', 'UPDATE', { id: 'b', atendente_id: 'u9' }, null, l, ctx).alvoIds).toEqual(['b']);
    expect(rotearEvento('conversas', 'UPDATE', { id: 'b', contato_id: 'k-outro' }, null, l, ctx).alvoIds).toEqual(['b']);
  });
  it('canal trocado: achado no cache → só patch; fora do cache → busca-alvo (nome do embed)', () => {
    const l = lista();
    const ok = rotearEvento('conversas', 'UPDATE', { id: 'b', canal_id: 'c2' }, null, l, ctx);
    expect(ok.lista![1]).toMatchObject({ canalId: 'c2', chip: 'LUIZA' });
    expect(ok.alvoIds).toEqual([]);
    expect(rotearEvento('conversas', 'UPDATE', { id: 'b', canal_id: 'c-desconhecido' }, null, l, ctx).alvoIds).toEqual(['b']);
  });
  it('UPDATE de conversa fora da lista → busca-alvo; DELETE e payload sem id → recarga completa', () => {
    expect(rotearEvento('conversas', 'UPDATE', { id: 'zz', nao_lidas: 1 }, null, lista(), ctx).alvoIds).toEqual(['zz']);
    expect(rotearEvento('conversas', 'DELETE', null, { id: 'a' }, lista(), ctx).recarregarTudo).toBe(true);
    expect(rotearEvento('conversas', 'UPDATE', { nao_lidas: 1 }, null, lista(), ctx).recarregarTudo).toBe(true);
  });
});

describe('rotearEvento — contatos', () => {
  const row = (p: Record<string, unknown> = {}) => ({ id: 'k2', nome: 'X', telefone: null, email: null, observacoes: null, origem: null, responsavel_id: null, ...p });
  it('responsável/nome mudou: patch NA HORA (abas Meus/Não atribuídos) + busca-alvo do contato', () => {
    const l = lista();
    l[1] = { ...l[1], email: '', notes: '', origin: 'WhatsApp', respId: null };
    const r = rotearEvento('contatos', 'UPDATE', row({ responsavel_id: 'u1', nome: 'Maria' }), null, l, ctx);
    expect(r.lista![1]).toMatchObject({ respId: 'u1', name: 'Maria' });
    expect(r.alvoContatos).toEqual(['k2']);
    expect(r.tocarContatos).toEqual(['k2']);
  });
  it('mudança invisível na lista (cpf, canal_origem…) → nada', () => {
    const l = lista();
    l[1] = { ...l[1], name: 'X', phone: '', email: '', notes: '', origin: 'WhatsApp', respId: null };
    const r = rotearEvento('contatos', 'UPDATE', row({ cpf: '123' }), null, l, ctx);
    expect(r).toMatchObject({ lista: l, alvoContatos: [], motivo: 'contato-sem-mudanca-visivel' });
  });
  it('payload incompleto → busca-alvo do contato (sem patch às cegas)', () => {
    const r = rotearEvento('contatos', 'UPDATE', { id: 'k2', nome: 'Y' }, null, lista(), ctx);
    expect(r).toMatchObject({ alvoContatos: ['k2'], motivo: 'contato-payload-incompleto' });
  });
  it('contato sem conversa na lista e INSERT de contato → nada; sem cache → carimba', () => {
    expect(rotearEvento('contatos', 'UPDATE', row({ id: 'k-sem-conversa' }), null, lista(), ctx).motivo).toBe('contato-sem-conversa-na-lista');
    expect(rotearEvento('contatos', 'INSERT', row({ id: 'k9' }), null, lista(), ctx).alvoContatos).toEqual([]);
    expect(rotearEvento('contatos', 'UPDATE', row(), null, undefined, ctx).tocarContatos).toEqual(['k2']);
  });
  it('visibilidade: lista recortada e o cliente acabou de virar MEU → busca as conversas dele; de outro → nada', () => {
    const recortado: CtxRoteamento = { ...ctx, donoDoEscopo: () => 'u-eu' };
    const meu = rotearEvento('contatos', 'UPDATE', row({ id: 'k-novo', responsavel_id: 'u-eu' }), null, lista(), recortado);
    expect(meu).toMatchObject({ alvoContatos: ['k-novo'], tocarContatos: ['k-novo'], motivo: 'contato-passou-para-mim' });
    const deOutro = rotearEvento('contatos', 'UPDATE', row({ id: 'k-novo', responsavel_id: 'u-outro' }), null, lista(), recortado);
    expect(deOutro).toMatchObject({ alvoContatos: [], motivo: 'contato-sem-conversa-na-lista' });
    // sem recorte (admin): comportamento de sempre
    expect(rotearEvento('contatos', 'UPDATE', row({ id: 'k-novo', responsavel_id: 'u-eu' }), null, lista(), ctx).alvoContatos).toEqual([]);
  });
  it('DELETE de contato com conversa na lista → recarga completa; tabela desconhecida → recarga', () => {
    expect(rotearEvento('contatos', 'DELETE', null, { id: 'k2' }, lista(), ctx).recarregarTudo).toBe(true);
    expect(rotearEvento('contatos', 'DELETE', null, { id: 'k-x' }, lista(), ctx).recarregarTudo).toBe(false);
    expect(rotearEvento('outra', 'INSERT', { id: 'x' }, null, lista(), ctx).recarregarTudo).toBe(true);
  });
});

describe('CarimbosRealtime + reconciliação (a CORRIDA carga × evento)', () => {
  it('tocado depois do marco é desconfiado; antes não; poda ao fechar', () => {
    const c = new CarimbosRealtime();
    c.tocar({ ids: ['velho'] });
    const marco = c.abrir();
    c.tocar({ ids: ['a'], contatoIds: ['k'] });
    expect(c.tocadoDepois('a', null, marco)).toBe(true);
    expect(c.tocadoDepois('x', 'k', marco)).toBe(true);           // pelo contato
    expect(c.tocadoDepois('velho', null, marco)).toBe(false);
    expect(c.tocadosDepois(marco)).toEqual({ ids: ['a'], contatoIds: ['k'] });
    c.fechar(marco);
    expect(c.tamanho()).toBe(0);                                  // nenhuma carga aberta precisa mais
  });
  it('carga aberta mais antiga segura a poda das entradas que ela ainda precisa', () => {
    const c = new CarimbosRealtime();
    const m1 = c.abrir();
    c.tocar({ ids: ['a'] });
    const m2 = c.abrir();
    c.fechar(m2);
    expect(c.tocadoDepois('a', null, m1)).toBe(true);
    c.fechar(m1);
    expect(c.tamanho()).toBe(0);
  });
  it('carga completa que partiu ANTES não apaga a conversa nova da busca-alvo nem desfaz o patch', () => {
    const c = new CarimbosRealtime();
    const marco = c.abrir();                                      // carga completa parte
    // durante a carga: busca-alvo trouxe a conversa nova X; ACK patchou A
    const cache = [conv({ id: 'X', unread: 1 }), conv({ id: 'A', last: 'patch novo' }), conv({ id: 'Z' })];
    c.tocar({ ids: ['X'] });
    c.tocar({ ids: ['A'] });
    // a carga pousa com A velho, sem X, sem Z (Z foi excluída/mesclada) e com W atualizado
    const carga = [conv({ id: 'A', last: 'velho' }), conv({ id: 'W', unread: 2 })];
    const { lista: out, tocados } = pousarCargaCompleta(cache, carga, c, marco);
    const ids = out.map((x) => x.id).sort();
    expect(ids).toEqual(['A', 'W', 'X']);                          // X NÃO some; Z (sem evento) sai
    expect(out.find((x) => x.id === 'A')!.last).toBe('patch novo');
    expect(out.find((x) => x.id === 'A')).toBe(cache[1]);
    expect(tocados.ids.sort()).toEqual(['A', 'X']);               // nova busca-alvo para os dois
    c.fechar(marco);
  });
  it('sem cache (partida a frio) a carga entra inteira', () => {
    const carga = [conv({ id: 'a' })];
    expect(reconciliarCargaCompleta(undefined, carga, () => true)).toBe(carga);
  });
  it('busca-alvo: nunca remove; item tocado depois do início fica com o cache e volta pra fila', () => {
    const cache = [conv({ id: 'a', last: 'evento novo' }), conv({ id: 'b' })];
    const r = reconciliarCargaAlvo(cache, [conv({ id: 'a', last: 'busca velha' }), conv({ id: 'n', last: 'nova' })], (x) => x.id !== 'b');
    expect(r.lista.map((x) => x.id)).toEqual(['n', 'a', 'b']);   // b continua (nunca remove)
    expect(r.lista.find((x) => x.id === 'a')!.last).toBe('evento novo');
    expect(r.rebuscar.sort()).toEqual(['a', 'n']);                // n entra (melhor que nada) e é rebuscada
  });
});

/* ---------- regra de etapa: igual à implementação ANTIGA de etapasPorContato ---------- */
type Col = { nome: string | null; cor: string | null; entrada: boolean | null; resultado: string | null };
/** cópia fiel do laço antigo (src/data/whatsapp.ts até 20/10) — referência de equivalência */
function etapasAntigas(linhasIn: OppLinha[]) {
  const linhas = [...linhasIn];
  const map = new Map<string, { etapa: string; cor: string | null; entrada: boolean; resultado: string; status: string; respId: string | null; emAndamento: boolean }>();
  linhas.sort((a, b) => String(b.atualizado_em ?? '').localeCompare(String(a.atualizado_em ?? '')) || String(b.id).localeCompare(String(a.id)));
  for (const r of linhas) {
    const cid = r.contato_id;
    if (!cid) continue;
    const col = Array.isArray(r.funil_colunas) ? r.funil_colunas[0] : r.funil_colunas;
    if (!col?.nome) continue;
    const emAndamento = r.status === 'em_andamento';
    const curGanho = r.status === 'ganho';
    const prev = map.get(cid);
    if (prev) {
      if (prev.status === 'ganho') continue;
      if (!curGanho && !(emAndamento && !prev.emAndamento)) continue;
    }
    const st = r.status;
    map.set(cid, {
      etapa: col.nome, cor: col.cor ?? null, entrada: !!col.entrada,
      resultado: (col.resultado === 'ganho' || col.resultado === 'perdido') ? col.resultado : 'neutro',
      status: (st === 'ganho' || st === 'perdido' || st === 'cancelado') ? st : 'em_andamento',
      respId: r.responsavel_id ?? null, emAndamento,
    });
  }
  return map;
}
const col = (nome: string | null, resultado: string | null = null, extra: Partial<Col> = {}): Col => ({ nome, cor: '#111', entrada: false, resultado, ...extra });
let n = 0;
const opp = (contato: string | null, status: string, dia: number, c: Col | Col[] | null, resp: string | null = null): OppLinha => ({
  id: `o${String(++n).padStart(3, '0')}`, contato_id: contato, status, responsavel_id: resp, atualizado_em: `2026-10-${String(dia).padStart(2, '0')}T10:00:00Z`, funil_colunas: c,
});

describe('etapaDoContato / etapasDeOportunidades = regra antiga (ganho grudento)', () => {
  const fixtures: OppLinha[] = [
    // k1: ganho ANTIGO + oportunidade ativa NOVA → ganho gruda
    opp('k1', 'ganho', 1, col('Contrato', 'ganho')), opp('k1', 'em_andamento', 9, col('Proposta')),
    // k2: perdida NOVA + ativa ANTIGA → a ativa vence a encerrada
    opp('k2', 'em_andamento', 2, col('Qualificação')), opp('k2', 'perdido', 8, col('Perdido', 'perdido')),
    // k3: coluna sem nome não conta; embed em array
    opp('k3', 'em_andamento', 5, col(null)), opp('k3', 'cancelado', 3, [col('Cancelado')]),
    // k4: duas ativas → a mais recente; mesmo atualizado_em desempata por id desc
    opp('k4', 'em_andamento', 4, col('A')), opp('k4', 'em_andamento', 4, col('B'), 'u7'),
    // k5: perdido + ganho mais novo → ganho
    opp('k5', 'perdido', 1, col('Perdido', 'perdido')), opp('k5', 'ganho', 6, col('Fechado', 'ganho', { entrada: true })),
    // sem contato: ignorada; sem coluna: ignorada
    opp(null, 'ganho', 9, col('X')), opp('k6', 'em_andamento', 9, null),
  ];
  it('mapa da carga completa idêntico ao laço antigo', () => {
    const novo = etapasDeOportunidades(fixtures);
    const antigo = etapasAntigas(fixtures);
    expect([...novo.entries()].sort()).toEqual([...antigo.entries()].sort());
    expect(novo.get('k1')).toMatchObject({ status: 'ganho', etapa: 'Contrato' });
    expect(novo.get('k2')).toMatchObject({ status: 'em_andamento', etapa: 'Qualificação' });
    expect(novo.get('k3')).toMatchObject({ status: 'cancelado', etapa: 'Cancelado' });
    expect(novo.get('k4')).toMatchObject({ etapa: 'B', respId: 'u7' });
    expect(novo.get('k5')).toMatchObject({ status: 'ganho', entrada: true });
    expect(novo.has('k6')).toBe(false);
  });
  it('etapaDoContato (busca-alvo, só as opps de 1 contato, em qualquer ordem) = mapa da carga completa', () => {
    const antigo = etapasAntigas(fixtures);
    for (const k of ['k1', 'k2', 'k3', 'k4', 'k5', 'k6']) {
      const doContato = fixtures.filter((o) => o.contato_id === k).reverse();
      expect(etapaDoContato(doContato)).toEqual(antigo.get(k) ?? null);
    }
  });
  it('não muta a entrada (a carga completa reaproveita o array)', () => {
    const copia = fixtures.map((o) => o.id);
    etapasDeOportunidades(fixtures);
    expect(fixtures.map((o) => o.id)).toEqual(copia);
  });
});

describe('IA enxuta (desativado_manual:dados->desativado_manual) e satélites no card', () => {
  it('true / false / null', () => {
    expect(iaDaLinha({ status: 'ativa', desativado_manual: true })).toEqual({ iaAtiva: false, iaStatus: 'ativa' });
    expect(iaDaLinha({ status: 'ativa', desativado_manual: false })).toEqual({ iaAtiva: true, iaStatus: 'ativa' });
    expect(iaDaLinha({ status: 'ativa', desativado_manual: null })).toEqual({ iaAtiva: true, iaStatus: 'ativa' });
    expect(iaDaLinha({ status: 'handoff', desativado_manual: null })).toEqual({ iaAtiva: false, iaStatus: 'handoff' });
    expect(iaDaLinha({ status: null })).toEqual({ iaAtiva: false, iaStatus: '' });
  });
  it('aplicarSatelites preenche etapa/opp/IA como a carga completa', () => {
    const e = etapaDoContato([opp('k', 'ganho', 1, col('Fechado', 'ganho'), 'u1')])!;
    const c = aplicarSatelites(conv({ id: 'a' }), e, { iaAtiva: true, iaStatus: 'ativa' });
    expect(c).toMatchObject({ etapa: 'Fechado', stage: 'Fechado', etapaResultado: 'ganho', oppStatus: 'ganho', oppRespId: 'u1', iaAtiva: true, iaStatus: 'ativa' });
    const sem = aplicarSatelites(conv({ id: 'b' }), null, null);
    expect(sem.etapa).toBeUndefined();
    expect(sem.iaAtiva).toBeUndefined();
  });
});

/* ---------- achados da revisão (21/10) ---------- */

describe('rotearEvento — UPDATE de mensagem não move o card (lastAtMs/aguardando vêm do banco)', () => {
  const base = () => [conv({
    id: 'a', contatoId: 'k1', aberta: true, aguardando: false, last: 'Recebi seu áudio!', unread: 0,
    lastAtMs: new Date(T('11:00:00')).getTime(),   // ultima_interacao_em: o bot NÃO move
    msgs: [{ id: 'm-bot', dir: 'out', time: '11:00', text: 'Recebi seu áudio!', tipo: 'texto', tsISO: T('11:00:04') }],
  })];
  it('ACK de uma ENTRADA mais velha que a última do card: nada muda (antes: virava aguardando com o preview dela)', () => {
    const l = base();
    const r = rotearEvento('mensagens', 'UPDATE', linhaMsg({ id: 'm-audio', enviada_em: T('11:00:00'), status: 'lida' }), null, l, ctx);
    expect(r.lista).toBe(l);
    expect(r).toMatchObject({ alvoIds: [], recarregarTudo: false, motivo: 'mensagem-atualizada' });
  });
  it('ACK da PRÓPRIA última do card: só a bolha (lastAtMs/time/aguardando intactos)', () => {
    const l = base();
    const r = rotearEvento('mensagens', 'UPDATE', linhaMsg({ id: 'm-bot', direcao: 'saida', conteudo: 'Recebi seu áudio!', enviada_em: T('11:00:04'), status: 'entregue' }), null, l, ctx);
    expect(r.lista![0].msgs[0].status).toBe('entregue');
    expect(r.lista![0]).toMatchObject({ lastAtMs: l[0].lastAtMs, aguardando: false, last: 'Recebi seu áudio!' });
    expect(r.alvoIds).toEqual([]);
  });
  it('UPDATE que tornaria OUTRA mensagem a última real (mídia que ficou visível, INSERT perdido) → busca-alvo, sem mexer nos derivados', () => {
    const l = base();
    const r = rotearEvento('mensagens', 'UPDATE', linhaMsg({ id: 'm-nova', enviada_em: T('11:05:00'), status: 'recebida' }), null, l, ctx);
    expect(r.alvoIds).toEqual(['a']);
    expect(r.motivo).toBe('mensagem-atualizada-com-busca');
    expect(r.lista![0]).toMatchObject({ aguardando: false, last: 'Recebi seu áudio!', lastAtMs: l[0].lastAtMs, unread: 0 });
  });
  it('efeitoNoCard: fora / mesma / nova-ultima', () => {
    const c = base()[0];
    const m = (id: string, ts: string) => ({ id, dir: 'in' as const, time: '', text: 'x', tipo: 'texto', tsISO: T(ts) });
    expect(efeitoNoCard(c, m('velha', '10:00:00')).efeito).toBe('fora');
    expect(efeitoNoCard(c, { ...c.msgs[0], status: 'lida' }).efeito).toBe('mesma');
    expect(efeitoNoCard(c, m('nova', '12:00:00')).efeito).toBe('nova-ultima');
  });
});

describe('rotearEvento — carimbos que faltavam (corrida com busca em voo)', () => {
  const row = (p: Record<string, unknown> = {}) => ({ id: 'k2', nome: 'X', telefone: null, email: null, observacoes: null, origem: null, responsavel_id: null, ...p });
  it('contato SEM conversa na lista: carimba o contato (sem busca) — a busca em voo da conversa nova rebusca', () => {
    const r = rotearEvento('contatos', 'UPDATE', row({ id: 'k-novo', responsavel_id: 'u-consultor' }), null, lista(), ctx);
    expect(r).toMatchObject({ alvoContatos: [], tocarContatos: ['k-novo'], recarregarTudo: false, motivo: 'contato-sem-conversa-na-lista' });
  });
  it('contato sem mudança visível também carimba (confirma patch otimista)', () => {
    const l = lista();
    l[1] = { ...l[1], name: 'X', phone: '', email: '', notes: '', origin: 'WhatsApp', respId: null };
    const r = rotearEvento('contatos', 'UPDATE', row({ cpf: '1' }), null, l, ctx);
    expect(r).toMatchObject({ lista: l, alvoContatos: [], tocarContatos: ['k2'], motivo: 'contato-sem-mudanca-visivel' });
  });
});

describe('rotearEvento — oportunidades (etapa/ganho ao vivo)', () => {
  const linhaOpp = (p: Record<string, unknown> = {}) => ({ id: 'o1', organizacao_id: 'org', contato_id: 'k1', status: 'ganho', coluna_id: 'col-ganho', ...p });
  it('UPDATE/INSERT de opp de contato da lista → busca-alvo POR CONTATO (todas as opps: ganho grudento)', () => {
    const l = lista();
    const r = rotearEvento('oportunidades', 'UPDATE', linhaOpp(), null, l, ctx);
    expect(r).toMatchObject({ lista: l, alvoIds: [], alvoContatos: ['k1'], tocarContatos: ['k1'], recarregarTudo: false, motivo: 'oportunidade-alterada' });
    expect(rotearEvento('oportunidades', 'INSERT', linhaOpp({ contato_id: 'k2' }), null, l, ctx).alvoContatos).toEqual(['k2']);
  });
  it('contato sem conversa na lista → só carimbo; sem cache → só carimbo', () => {
    expect(rotearEvento('oportunidades', 'UPDATE', linhaOpp({ contato_id: 'k-fora' }), null, lista(), ctx))
      .toMatchObject({ alvoContatos: [], tocarContatos: ['k-fora'], motivo: 'oportunidade-sem-conversa-na-lista' });
    expect(rotearEvento('oportunidades', 'UPDATE', linhaOpp(), null, undefined, ctx)).toMatchObject({ alvoContatos: [], tocarContatos: ['k1'], motivo: 'sem-lista' });
  });
  it('troca de contato (old com contato_id) busca os dois; DELETE sem contato_id e payload sem contato → recarga completa', () => {
    expect(rotearEvento('oportunidades', 'UPDATE', linhaOpp({ contato_id: 'k1' }), { id: 'o1', contato_id: 'k2' }, lista(), ctx).alvoContatos.sort()).toEqual(['k1', 'k2']);
    expect(rotearEvento('oportunidades', 'DELETE', null, { id: 'o1' }, lista(), ctx).recarregarTudo).toBe(true);
    expect(rotearEvento('oportunidades', 'DELETE', null, { id: 'o1', contato_id: 'k1' }, lista(), ctx).alvoContatos).toEqual(['k1']);
    expect(rotearEvento('oportunidades', 'UPDATE', linhaOpp({ contato_id: null }), null, lista(), ctx).recarregarTudo).toBe(true);
  });
  it('o canal assina oportunidades (está na publication) e NUNCA ia_sessoes (fora dela derruba o canal)', () => {
    expect([...TABELAS_CANAL_WA].sort()).toEqual(['contatos', 'conversas', 'mensagens', 'oportunidades']);
    expect((TABELAS_CANAL_WA as readonly string[]).includes('ia_sessoes')).toBe(false);
  });
});

describe('aplicarIaNaLista (refresh enxuto de IA)', () => {
  it('só as diferenças; sessão sumida volta a "sem IA"; desconfiado fica; nada mudou = mesma lista', () => {
    const a = conv({ id: 'a', iaAtiva: true, iaStatus: 'ativa' });
    const b = conv({ id: 'b', iaAtiva: true, iaStatus: 'ativa' });
    const c = conv({ id: 'c' });
    const d = conv({ id: 'd', iaAtiva: true, iaStatus: 'ativa' });
    const ia = new Map([['a', { iaAtiva: false, iaStatus: 'pausada' }], ['b', { iaAtiva: true, iaStatus: 'ativa' }], ['d', { iaAtiva: false, iaStatus: 'encerrada' }]]);
    const r = aplicarIaNaLista([a, b, c, d], ia, (x) => x.id === 'd');
    expect(r.lista[0]).toMatchObject({ iaAtiva: false, iaStatus: 'pausada' });
    expect(r.lista[1]).toBe(b);
    expect(r.lista[2]).toBe(c);
    expect(r.lista[3]).toBe(d);                                   // tocado depois do início da leitura
    expect(r.mudadas).toEqual(['a']);
    const sumiu = aplicarIaNaLista([a], new Map(), () => false);
    expect(sumiu.lista[0].iaAtiva).toBeUndefined();
    const igual = [b];
    expect(aplicarIaNaLista(igual, ia, () => false).lista).toBe(igual);
  });
});
