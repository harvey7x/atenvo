import { beforeEach, describe, expect, it } from 'vitest';
import {
  REGRA_DIVISAO, campoDe, pctCliente, centavosDe, dividir, estadoDemo, mascaraReais, oQueFalta, ordenar, podeConcluir, portAcoes, reais,
  reiniciarDemo, resumir, situacao, type Portabilidade,
} from './portabilidades';

/** último item (o projeto compila em ES2020: sem Array.prototype.at) */
const ultimo = <T,>(a: T[]): T | undefined => a[a.length - 1];

const base = (o: Partial<Portabilidade> = {}): Portabilidade => ({
  id: 'x', clienteId: 'k1', atendenteId: 'u', valorTotal: 100_000, divisao: dividir(100_000), aceite: 'aguardando',
  criadaEm: '2026-10-01T12:00:00Z', atualizadaEm: '2026-10-01T12:00:00Z', eventos: [], ...o,
});

describe('divisão do valor (regra do dono: 30% escritório; 15% desses 30% para o atendente)', () => {
  it('exemplo redondo: R$ 10.000,00', () => {
    expect(dividir(1_000_000)).toEqual({ cliente: 700_000, escritorio: 300_000, atendente: 45_000, escritorioLiquido: 255_000 });
  });
  it('as contas sempre fecham no centavo', () => {
    for (const t of [1, 99, 100_000, 1_234_567, 945_050, 3_333_333]) {
      const d = dividir(t);
      expect(d.cliente + d.escritorio).toBe(t);
      expect(d.atendente + d.escritorioLiquido).toBe(d.escritorio);
    }
  });
  it('arredonda ao centavo: R$ 12.345,67', () => {
    // 30% = 3.703,701 → 3.703,70; 15% disso = 555,555 → 555,56
    expect(dividir(1_234_567)).toEqual({ cliente: 864_197, escritorio: 370_370, atendente: 55_556, escritorioLiquido: 314_814 });
  });
  it('valor negativo ou zero vira zero', () => {
    expect(dividir(-500)).toEqual({ cliente: 0, escritorio: 0, atendente: 0, escritorioLiquido: 0 });
  });
  it('a regra gravada é a do dono', () => {
    expect(REGRA_DIVISAO).toEqual({ escritorio: 30, atendenteDoEscritorio: 15 });
    expect(pctCliente()).toBe(70);
  });
});

describe('campo de dinheiro', () => {
  it('máscara de caixa eletrônico', () => {
    expect(mascaraReais('')).toBe('');
    expect(mascaraReais('5')).toBe('0,05');
    expect(mascaraReais('123456')).toBe('1.234,56');
    expect(mascaraReais('R$ 1.234,567')).toBe('12.345,67');
    expect(mascaraReais('000')).toBe('0,00');
  });
  it('texto ↔ centavos', () => {
    expect(centavosDe('12.345,67')).toBe(1_234_567);
    expect(centavosDe('')).toBe(0);
    expect(campoDe(1_234_567)).toBe('12.345,67');
    expect(campoDe(0)).toBe('');
  });
  it('formato de exibição', () => {
    expect(reais(1_630_000)).toBe('R$ 16.300,00');
  });
});

describe('situação e o que falta', () => {
  it('aceite manda na lista', () => {
    expect(situacao(base())).toBe('aguardando_aceite');
    expect(situacao(base({ aceite: 'recusou' }))).toBe('nao_aceitou');
    expect(situacao(base({ aceite: 'aceitou' }))).toBe('em_andamento');
    expect(situacao(base({ aceite: 'aceitou', concluidaEm: '2026-10-02T00:00:00Z' }))).toBe('concluida');
  });
  it('diz as duas etapas que faltam', () => {
    expect(oQueFalta(base({ aceite: 'aceitou' })).texto).toBe('Falta desbloquear o benefício e enviar o link');
    expect(oQueFalta(base({ aceite: 'aceitou', desbloqueadoEm: 'x', linkEnviadoEm: 'x' })).texto).toBe('Falta o cliente fazer o link');
    const pronta = base({ aceite: 'aceitou', desbloqueadoEm: 'x', linkEnviadoEm: 'x', linkFeitoEm: 'x' });
    expect(oQueFalta(pronta)).toEqual({ texto: 'Pronta para concluir', tom: 'azul' });
    expect(podeConcluir(pronta)).toBe(true);
    expect(podeConcluir(base({ aceite: 'aceitou', desbloqueadoEm: 'x' }))).toBe(false);
  });
  it('em andamento: prontas primeiro, depois a mais parada', () => {
    const a = base({ id: 'a', aceite: 'aceitou', atualizadaEm: '2026-10-05T00:00:00Z' });
    const b = base({ id: 'b', aceite: 'aceitou', atualizadaEm: '2026-10-01T00:00:00Z' });
    const c = base({ id: 'c', aceite: 'aceitou', desbloqueadoEm: 'x', linkFeitoEm: 'x', atualizadaEm: '2026-10-09T00:00:00Z' });
    expect(ordenar([a, b, c], 'em_andamento').map((p) => p.id)).toEqual(['c', 'b', 'a']);
  });
  it('resumo: em aberto = esperando + em andamento; recebimentos = concluídas no mês', () => {
    const ref = new Date('2026-10-13T12:00:00Z');
    const r = resumir([
      base({ valorTotal: 100_000 }),
      base({ aceite: 'aceitou', valorTotal: 200_000 }),
      base({ aceite: 'recusou', valorTotal: 999_999 }),
      base({ aceite: 'aceitou', valorTotal: 400_000, divisao: dividir(400_000), concluidaEm: '2026-10-10T12:00:00Z' }),
      base({ aceite: 'aceitou', valorTotal: 800_000, divisao: dividir(800_000), concluidaEm: '2026-09-10T12:00:00Z' }),
    ], ref);
    expect(r.abertas).toBe(2);
    expect(r.valorAberto).toBe(300_000);
    expect(r.concluidasMes).toBe(1);
    expect(r.valorConcluidoMes).toBe(400_000);
    expect(r.escritorioMes).toBe(dividir(400_000).escritorio);
    expect(r.atendenteMes).toBe(dividir(400_000).atendente);
  });
});

describe('ações da demonstração (as mesmas travas do servidor)', () => {
  beforeEach(() => reiniciarDemo());
  const achar = (id: string) => estadoDemo().portabilidades.find((p) => p.id === id)!;

  it('nova portabilidade entra esperando aceite, com a divisão gravada', () => {
    const id = portAcoes.criar({ clienteId: 'k14', valorTotal: 500_000, atendenteId: 'u-juliana' });
    const p = achar(id);
    expect(situacao(p)).toBe('aguardando_aceite');
    expect(p.divisao).toEqual(dividir(500_000));
    expect(ultimo(p.eventos)?.texto).toBe('Entrou na aba com R$ 5.000,00');
  });
  it('recusa cliente inexistente e valor zerado', () => {
    expect(() => portAcoes.criar({ clienteId: 'nao-existe', valorTotal: 1, atendenteId: 'u' })).toThrow('contato_invalido');
    expect(() => portAcoes.criar({ clienteId: 'k1', valorTotal: 0, atendenteId: 'u' })).toThrow('valor_invalido');
  });
  it('etapas só depois do aceite; concluir só com as duas feitas', () => {
    const id = portAcoes.criar({ clienteId: 'k14', valorTotal: 500_000, atendenteId: 'u-matheus' });
    expect(() => portAcoes.desbloqueio(id, true)).toThrow('sem_aceite');
    expect(() => portAcoes.link(id, 'enviado')).toThrow('sem_aceite');
    portAcoes.aceite(id, 'aceitou');
    portAcoes.desbloqueio(id, true);
    expect(() => portAcoes.concluir(id)).toThrow('etapas_pendentes');
    portAcoes.link(id, 'enviado');
    portAcoes.link(id, 'feito');
    portAcoes.concluir(id);
    expect(situacao(achar(id))).toBe('concluida');
    expect(() => portAcoes.valor(id, 1)).toThrow('portabilidade_concluida');
    portAcoes.reabrir(id);
    expect(situacao(achar(id))).toBe('em_andamento');
  });
  it('desfazer o link feito volta para "enviado" sem perder a data do envio', () => {
    const id = portAcoes.criar({ clienteId: 'k14', valorTotal: 500_000, atendenteId: 'u-matheus' });
    portAcoes.aceite(id, 'aceitou');
    portAcoes.link(id, 'enviado');
    const enviado = achar(id).linkEnviadoEm;
    portAcoes.link(id, 'feito');
    portAcoes.link(id, 'enviado');
    expect(achar(id).linkFeitoEm).toBeUndefined();
    expect(achar(id).linkEnviadoEm).toBe(enviado);
  });
  it('mudar o valor refaz a divisão e fica no histórico', () => {
    const id = portAcoes.criar({ clienteId: 'k14', valorTotal: 500_000, atendenteId: 'u-matheus' });
    portAcoes.valor(id, 800_000);
    expect(achar(id).divisao).toEqual(dividir(800_000));
    expect(ultimo(achar(id).eventos)?.texto).toBe('Valor: R$ 5.000,00 → R$ 8.000,00');
  });
  it('repetir uma marcação não duplica o histórico (como o servidor)', () => {
    const id = portAcoes.criar({ clienteId: 'k14', valorTotal: 500_000, atendenteId: 'u-matheus' });
    portAcoes.aceite(id, 'aceitou');
    const n = achar(id).eventos.length;
    portAcoes.aceite(id, 'aceitou');
    portAcoes.desbloqueio(id, false);
    portAcoes.link(id, 'nao_enviado');
    portAcoes.reabrir(id);
    expect(achar(id).eventos.length).toBe(n);
  });
  it('anotação vazia não entra', () => {
    expect(() => portAcoes.anotar('pt1', '   ')).toThrow('nota_vazia');
    portAcoes.anotar('pt1', '  Ligar amanhã  ');
    expect(ultimo(achar('pt1').eventos)).toMatchObject({ texto: 'Ligar amanhã', tipo: 'nota' });
  });
});
