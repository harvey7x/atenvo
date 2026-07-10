import { describe, it, expect } from 'vitest';
import { classificar, isNovo, statusKind, tempoCurto, tierTempo, minutosDesde, type SinaisConversa } from './inboxGroups';

const NOW = new Date('2026-07-09T12:00:00Z').getTime();
const atras = (min: number) => new Date(NOW - min * 60000).toISOString();

function s(over: Partial<SinaisConversa>): SinaisConversa {
  return {
    aguardando: over.aguardando ?? true,
    aguardandoDesde: over.aguardandoDesde ?? atras(5),
    temResponsavel: over.temResponsavel ?? false,
    houveResposta: over.houveResposta ?? false,
    primeiraMensagem: over.primeiraMensagem ?? true,
    precisaHumano: over.precisaHumano ?? false,
    sevAlerta: over.sevAlerta ?? null,
    tipoAlerta: over.tipoAlerta ?? null,
  };
}

describe('classificar', () => {
  it('lead novo recente (<2h) sem responsável → urgente', () => {
    expect(classificar(s({ aguardandoDesde: atras(4) }), NOW)).toBe('urgente');
    expect(classificar(s({ aguardandoDesde: atras(23) }), NOW)).toBe('urgente');
  });
  it('alerta crítico/áudio/lead quente → urgente (mesmo com tempo/responsável)', () => {
    expect(classificar(s({ tipoAlerta: 'lead_quente_aguardando', aguardandoDesde: atras(300) }), NOW)).toBe('urgente');
    expect(classificar(s({ precisaHumano: true, aguardandoDesde: atras(500) }), NOW)).toBe('urgente');
    expect(classificar(s({ tipoAlerta: 'audio_recebido_precisa_humano' }), NOW)).toBe('urgente');
  });
  it('novo/aguardando acima de 2h → atenção', () => {
    expect(classificar(s({ aguardandoDesde: atras(16 * 60) }), NOW)).toBe('atencao'); // 16h
    expect(classificar(s({ aguardandoDesde: atras(20 * 60) }), NOW)).toBe('atencao'); // 20h
  });
  it('alerta amarelo → atenção', () => {
    expect(classificar(s({ sevAlerta: 'amarelo', aguardandoDesde: atras(10), houveResposta: true }), NOW)).toBe('atencao');
  });
  it('com responsável / já respondido / recente → acompanhamento', () => {
    expect(classificar(s({ temResponsavel: true, aguardandoDesde: atras(13), houveResposta: true }), NOW)).toBe('acompanhamento');
    expect(classificar(s({ houveResposta: true, aguardandoDesde: atras(40) }), NOW)).toBe('acompanhamento');
    expect(classificar(s({ aguardando: false, aguardandoDesde: null }), NOW)).toBe('acompanhamento');
  });
});

describe('isNovo + statusKind', () => {
  it('isNovo só quando sem responsável e sem resposta', () => {
    expect(isNovo(s({}))).toBe(true);
    expect(isNovo(s({ temResponsavel: true }))).toBe(false);
    expect(isNovo(s({ houveResposta: true }))).toBe(false);
  });
  it('statusKind', () => {
    expect(statusKind(s({ tipoAlerta: 'audio_recebido_precisa_humano' }))).toBe('audio');
    expect(statusKind(s({ tipoAlerta: 'lead_quente_aguardando' }))).toBe('lead_quente');
    expect(statusKind(s({ primeiraMensagem: true }))).toBe('primeira_mensagem');
    expect(statusKind(s({ primeiraMensagem: false }))).toBe('aguardando_primeira');
    expect(statusKind(s({ temResponsavel: true, houveResposta: true }))).toBe('aguardando');
    expect(statusKind(s({ aguardando: false, houveResposta: true, temResponsavel: true }))).toBe('em_acompanhamento');
  });
});

describe('tempo', () => {
  it('tempoCurto humano', () => {
    expect(tempoCurto(atras(0.5), NOW)).toBe('agora');
    expect(tempoCurto(atras(13), NOW)).toBe('13 min');
    expect(tempoCurto(atras(90), NOW)).toBe('1 h');
    expect(tempoCurto(atras(16 * 60), NOW)).toBe('16 h');
    expect(tempoCurto(atras(1440), NOW)).toBe('1 dia');
    expect(tempoCurto(atras(2880), NOW)).toBe('2 dias');
  });
  it('tierTempo', () => {
    expect(tierTempo(minutosDesde(atras(10), NOW))).toBe('neutro');
    expect(tierTempo(minutosDesde(atras(45), NOW))).toBe('ambar');
    expect(tierTempo(minutosDesde(atras(180), NOW))).toBe('vermelho');
    expect(tierTempo(minutosDesde(atras(1500), NOW))).toBe('critico');
  });
});
