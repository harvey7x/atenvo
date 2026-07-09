import { describe, it, expect } from 'vitest';
import {
  sevRank, sevClass, maxSeveridade, tipoLabel, tipoEmoji, resumoPartes, resumoTexto,
  indexPorChave, ordenarAlertas, podeGerirAlerta, type SlaAlerta,
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
  it('partes só > 0, na ordem de severidade', () => {
    expect(resumoPartes(r)).toEqual(['1 imediato', '1 crítico', '2 urgentes', '1 em atenção', '1 leve']);
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
