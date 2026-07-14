import { describe, it, expect } from 'vitest';
import {
  etiquetasDaConversa, ehLeadNovo, responsavelEfetivo, primeiroNomeUpper, previewUltimaMensagem,
} from '../lib/conversaEtiquetas';

const EQUIPE: Record<string, string> = {
  u1: 'Matheus Scontatto',
  u2: 'Juliana Alves',
  u3: 'Giovana',
};
const nomePorId = (id: string) => EQUIPE[id] ?? null;

describe('etiquetas da conversa — LEAD NOVO', () => {
  it('sem responsável e sem oportunidade → só [LEAD NOVO]', () => {
    const e = etiquetasDaConversa({}, nomePorId);
    expect(e).toEqual([{ tipo: 'lead', texto: 'LEAD NOVO' }]);
  });
  it('sem responsável e ainda na ENTRADA do funil → só [LEAD NOVO] (não é opp avançada)', () => {
    const e = etiquetasDaConversa({ etapa: 'LEAD NOVO', etapaEntrada: true }, nomePorId);
    expect(e).toEqual([{ tipo: 'lead', texto: 'LEAD NOVO' }]);
  });
  it('lead novo NÃO mostra atendente nem etapa junto', () => {
    const e = etiquetasDaConversa({ etapa: 'LEAD NOVO', etapaEntrada: true }, nomePorId);
    expect(e).toHaveLength(1);
    expect(e.some((x) => x.tipo === 'atendente')).toBe(false);
    expect(e.some((x) => x.tipo === 'etapa')).toBe(false);
  });
  it('qualquer responsável derruba o LEAD NOVO', () => {
    expect(ehLeadNovo({ atendenteId: 'u1' })).toBe(false);
    expect(ehLeadNovo({ respId: 'u2' })).toBe(false);
    expect(ehLeadNovo({ oppRespId: 'u3' })).toBe(false);
    expect(ehLeadNovo({})).toBe(true);
  });
  it('oportunidade AVANÇADA (fora da entrada) derruba o LEAD NOVO mesmo sem responsável', () => {
    const e = etiquetasDaConversa({ etapa: 'CONTRATOS', etapaEntrada: false }, nomePorId);
    expect(e).toEqual([{ tipo: 'etapa', texto: 'CONTRATOS', variante: 'neutro' }]);
  });
});

describe('etiquetas da conversa — atendente + etapa', () => {
  it('com responsável mostra o PRIMEIRO nome em maiúsculo', () => {
    const e = etiquetasDaConversa({ respId: 'u1' }, nomePorId);
    expect(e).toEqual([{ tipo: 'atendente', texto: 'MATHEUS' }]);
  });
  it('responsável + oportunidade → [MATHEUS] [CONTRATOS], nessa ordem', () => {
    const e = etiquetasDaConversa({ respId: 'u1', etapa: 'Contratos', etapaEntrada: false }, nomePorId);
    expect(e.map((x) => x.texto)).toEqual(['MATHEUS', 'CONTRATOS']);
  });
  it('preferência de fonte: conversa > contato > oportunidade', () => {
    expect(responsavelEfetivo({ atendenteId: 'u1', respId: 'u2', oppRespId: 'u3' })).toBe('u1');
    expect(responsavelEfetivo({ respId: 'u2', oppRespId: 'u3' })).toBe('u2');
    expect(responsavelEfetivo({ oppRespId: 'u3' })).toBe('u3');
    expect(responsavelEfetivo({})).toBeNull();
  });
  it('responsável sem nome resolvido ainda sinaliza que foi assumido', () => {
    const e = etiquetasDaConversa({ respId: 'desconhecido', etapa: 'DOCUMENTOS' }, nomePorId);
    expect(e.map((x) => x.texto)).toEqual(['ATENDENTE', 'DOCUMENTOS']);
  });
  it('cor da etapa segue o resultado da coluna (ganho/perdido/neutro)', () => {
    expect(etiquetasDaConversa({ respId: 'u2', etapa: 'CLIENTE FECHADO', etapaResultado: 'ganho' }, nomePorId)[1].variante).toBe('ganho');
    expect(etiquetasDaConversa({ respId: 'u2', etapa: 'PERDIDO', etapaResultado: 'perdido' }, nomePorId)[1].variante).toBe('perdido');
    expect(etiquetasDaConversa({ respId: 'u2', etapa: 'CONTRATOS' }, nomePorId)[1].variante).toBe('neutro');
  });
  it('primeiroNomeUpper', () => {
    expect(primeiroNomeUpper('Juliana Alves')).toBe('JULIANA');
    expect(primeiroNomeUpper('  andrius  ')).toBe('ANDRIUS');
    expect(primeiroNomeUpper('')).toBe('');
    expect(primeiroNomeUpper(null)).toBe('');
  });
});

describe('preview da última mensagem', () => {
  it('texto/legenda vence', () => {
    expect(previewUltimaMensagem({ tipo: 'texto', texto: 'Olá, queria saber sobre meu desconto' }))
      .toBe('Olá, queria saber sobre meu desconto');
    expect(previewUltimaMensagem({ tipo: 'imagem', texto: 'segue o print' })).toBe('segue o print');
  });
  it('mídia sem texto → rótulo correto', () => {
    expect(previewUltimaMensagem({ tipo: 'audio', seconds: 12 })).toBe('Mensagem de voz (0:12)');
    expect(previewUltimaMensagem({ tipo: 'audio', seconds: 75 })).toBe('Mensagem de voz (1:15)');
    expect(previewUltimaMensagem({ tipo: 'audio' })).toBe('Mensagem de voz');
    expect(previewUltimaMensagem({ tipo: 'audio', ptt: false, seconds: 5 })).toBe('Áudio (0:05)');
    expect(previewUltimaMensagem({ tipo: 'imagem' })).toBe('Imagem');
    expect(previewUltimaMensagem({ tipo: 'video' })).toBe('Vídeo');
    expect(previewUltimaMensagem({ tipo: 'documento' })).toBe('Documento');
  });
  it('vazio/desconhecido', () => {
    expect(previewUltimaMensagem(null)).toBe('');
    expect(previewUltimaMensagem({})).toBe('');
    expect(previewUltimaMensagem({ tipo: 'sistema' })).toBe('Mensagem');
  });
});
