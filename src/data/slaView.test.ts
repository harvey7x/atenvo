import { describe, it, expect } from 'vitest';
import {
  sevRank, sevClass, maxSeveridade, tipoLabel, tipoEmoji, resumoPartes, resumoTexto,
  indexPorChave, ordenarAlertas, podeGerirAlerta, sevIntensidade,
  resumoHumano, tempoRelativo, fraseTipo, nomeContatoExib, type SlaAlerta,
} from './slaView';

function mk(over: Partial<SlaAlerta>): SlaAlerta {
  return {
    id: over.id ?? 'a', tipo: over.tipo ?? 'atendimento_sem_resposta', severidade: over.severidade ?? 'leve',
    titulo: over.titulo ?? 't', detalhe: over.detalhe ?? null, conversa_id: over.conversa_id ?? null,
    oportunidade_id: over.oportunidade_id ?? null, contato_id: over.contato_id ?? null,
    responsavel_id: over.responsavel_id ?? null, vence_em: over.vence_em ?? null, criado_em: over.criado_em ?? '2026-07-09T10:00:00Z',
  };
}

describe('severidade', () => {
  it('rank ordena imediato>critico>vermelho>amarelo>leve', () => {
    expect(sevRank('imediato')).toBeGreaterThan(sevRank('critico'));
    expect(sevRank('critico')).toBeGreaterThan(sevRank('vermelho'));
    expect(sevRank('vermelho')).toBeGreaterThan(sevRank('amarelo'));
    expect(sevRank('amarelo')).toBeGreaterThan(sevRank('leve'));
  });
  it('sevClass', () => { expect(sevClass('critico')).toBe('sla-critico'); });
  it('sevIntensidade', () => {
    expect(sevIntensidade('imediato')).toBe('forte');
    expect(sevIntensidade('critico')).toBe('forte');
    expect(sevIntensidade('vermelho')).toBe('forte');
    expect(sevIntensidade('amarelo')).toBe('suave');
    expect(sevIntensidade('leve')).toBe('discreto');
  });
  it('maxSeveridade', () => {
    expect(maxSeveridade([{ severidade: 'leve' }, { severidade: 'vermelho' }, { severidade: 'amarelo' }])).toBe('vermelho');
    expect(maxSeveridade([])).toBeNull();
  });
});

describe('tipo', () => {
  it('label + emoji', () => {
    expect(tipoLabel('lead_quente_aguardando')).toBe('Lead quente');
    expect(tipoEmoji('audio_recebido_precisa_humano')).toBe('🎧');
  });
});

describe('resumo', () => {
  const r = { total: 6, imediatos: 1, criticos: 1, vermelhos: 2, amarelos: 1, leves: 1, itens: [] };
  it('partes só > 0, na ordem de severidade (linguagem premium)', () => {
    expect(resumoPartes(r)).toEqual(['1 imediato', '1 crítico', '2 urgentes', '1 em atenção', '1 acompanhamento']);
  });
  it('leve pluraliza como acompanhamentos', () => {
    expect(resumoPartes({ imediatos: 0, criticos: 0, vermelhos: 0, amarelos: 1, leves: 16 })).toEqual(['1 em atenção', '16 acompanhamentos']);
  });
  it('texto', () => {
    expect(resumoTexto(r)).toContain('6 alertas de atendimento');
    expect(resumoTexto({ total: 0, imediatos: 0, criticos: 0, vermelhos: 0, amarelos: 0, leves: 0, itens: [] })).toBe('0 alerta de atendimento.');
  });
});

describe('index/ordenar', () => {
  it('indexa por conversa, maior severidade primeiro', () => {
    const itens = [mk({ id: '1', conversa_id: 'c1', severidade: 'leve' }), mk({ id: '2', conversa_id: 'c1', severidade: 'critico' }), mk({ id: '3', conversa_id: 'c2' })];
    const m = indexPorChave(itens, 'conversa_id');
    expect(m.get('c1')!.map((a) => a.id)).toEqual(['2', '1']);
    expect(m.get('c2')!).toHaveLength(1);
    expect(m.has('')).toBe(false);
  });
  it('ordenarAlertas: severidade desc, depois mais antigo', () => {
    const itens = [
      mk({ id: 'a', severidade: 'amarelo', criado_em: '2026-07-09T10:00:00Z' }),
      mk({ id: 'b', severidade: 'critico', criado_em: '2026-07-09T09:00:00Z' }),
      mk({ id: 'c', severidade: 'critico', criado_em: '2026-07-09T08:00:00Z' }),
    ];
    expect(ordenarAlertas(itens).map((a) => a.id)).toEqual(['c', 'b', 'a']);
  });
});

describe('resumoHumano', () => {
  it('urgente / atenção / acompanhamento', () => {
    expect(resumoHumano({ total: 8, imediatos: 0, criticos: 1, vermelhos: 0, amarelos: 0, leves: 7, itens: [] })).toBe('8 atendimentos aguardando ação');
    expect(resumoHumano({ total: 3, imediatos: 0, criticos: 0, vermelhos: 0, amarelos: 2, leves: 1, itens: [] })).toBe('3 atendimentos aguardando resposta');
    expect(resumoHumano({ total: 8, imediatos: 0, criticos: 0, vermelhos: 0, amarelos: 0, leves: 8, itens: [] })).toBe('8 acompanhamentos pendentes');
    expect(resumoHumano({ total: 1, imediatos: 0, criticos: 0, vermelhos: 0, amarelos: 0, leves: 1, itens: [] })).toBe('1 acompanhamento pendente');
  });
});

describe('tempoRelativo', () => {
  const now = new Date('2026-07-09T12:00:00Z').getTime();
  it('formata min/h/d', () => {
    expect(tempoRelativo('2026-07-09T11:39:00Z', now)).toBe('há 21 min');
    expect(tempoRelativo('2026-07-09T09:00:00Z', now)).toBe('há 3 h');
    expect(tempoRelativo('2026-07-07T12:00:00Z', now)).toBe('há 2 d');
    expect(tempoRelativo('2026-07-09T11:59:40Z', now)).toBe('agora');
  });
});

describe('fraseTipo + nomeContatoExib', () => {
  it('frase por tipo', () => {
    expect(fraseTipo('atendimento_sem_resposta')).toBe('Aguardando resposta');
    expect(fraseTipo('audio_recebido_precisa_humano')).toBe('Cliente enviou áudio');
  });
  it('nome exibição trata vazio/numérico', () => {
    expect(nomeContatoExib('IVO MARCIANO')).toBe('IVO MARCIANO');
    expect(nomeContatoExib('555199999999')).toBe('Cliente sem nome');
    expect(nomeContatoExib('')).toBe('Cliente sem nome');
    expect(nomeContatoExib(null)).toBe('Cliente sem nome');
  });
});

describe('podeGerirAlerta', () => {
  it('admin/gestor sempre', () => {
    expect(podeGerirAlerta('admin', mk({ responsavel_id: 'x' }), 'y')).toBe(true);
    expect(podeGerirAlerta('gestor', mk({ responsavel_id: null }), null)).toBe(true);
  });
  it('atendente só se responsável', () => {
    expect(podeGerirAlerta('atendente', mk({ responsavel_id: 'u1' }), 'u1')).toBe(true);
    expect(podeGerirAlerta('atendente', mk({ responsavel_id: 'u1' }), 'u2')).toBe(false);
    expect(podeGerirAlerta('atendente', mk({ responsavel_id: null }), 'u1')).toBe(false);
  });
});
