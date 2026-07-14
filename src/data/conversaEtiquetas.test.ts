import { describe, it, expect } from 'vitest';
import {
  etiquetasDaConversa, situacaoDaConversa, ehLeadNovo, responsavelEfetivo,
  primeiroNomeUpper, previewUltimaMensagem,
} from '../lib/conversaEtiquetas';

const EQUIPE: Record<string, string> = { u1: 'Matheus Scontatto', u2: 'Juliana Alves', u3: 'Giovana' };
const nomePorId = (id: string) => EQUIPE[id] ?? null;
const textos = (c: Parameters<typeof etiquetasDaConversa>[0]) => etiquetasDaConversa(c, nomePorId).map((e) => e.texto);

describe('card: [ATENDENTE] [SITUAÇÃO] [CANAL ATUAL]', () => {
  it('lead novo sem responsável → [LEAD NOVO] [ANDRIUS]', () => {
    expect(textos({ etapa: 'LEAD NOVO', etapaEntrada: true, canalAtual: 'ANDRIUS' }))
      .toEqual(['LEAD NOVO', 'ANDRIUS']);
  });
  it('assumido na ENTRADA do funil → [JULIANA] [EM ATENDIMENTO] [URA] (nunca LEAD NOVO)', () => {
    const t = textos({ respId: 'u2', etapa: 'LEAD NOVO', etapaEntrada: true, canalAtual: 'URA' });
    expect(t).toEqual(['JULIANA', 'EM ATENDIMENTO', 'URA']);
    expect(t).not.toContain('LEAD NOVO');
  });
  it('etapa avançada → [MATHEUS] [CONTRATOS] [ANDRIUS]', () => {
    expect(textos({ respId: 'u1', etapa: 'Contratos', etapaEntrada: false, canalAtual: 'ANDRIUS' }))
      .toEqual(['MATHEUS', 'CONTRATOS', 'ANDRIUS']);
  });
  it('cliente fechado → [GIOVANA] [CLIENTE FECHADO] [ANDRIUS]', () => {
    expect(textos({ respId: 'u3', etapa: 'CLIENTE FECHADO', oppStatus: 'ganho', canalAtual: 'ANDRIUS' }))
      .toEqual(['GIOVANA', 'CLIENTE FECHADO', 'ANDRIUS']);
  });
  it('cliente perdido → [MATHEUS] [PERDIDO] [RMKT]', () => {
    expect(textos({ respId: 'u1', etapa: 'PERDIDO', oppStatus: 'perdido', canalAtual: 'RMKT' }))
      .toEqual(['MATHEUS', 'PERDIDO', 'RMKT']);
  });
  it('cancelado → CANCELADO', () => {
    expect(textos({ respId: 'u1', etapa: 'CONTRATOS', oppStatus: 'cancelado', canalAtual: 'URA' }))
      .toEqual(['MATHEUS', 'CANCELADO', 'URA']);
  });
  it('aguardando resposta do cliente (com responsável, sem etapa avançada) → AGUARDANDO CLIENTE', () => {
    expect(textos({ respId: 'u2', etapa: 'LEAD NOVO', etapaEntrada: true, aguardando: true, canalAtual: 'LUIZA' }))
      .toEqual(['JULIANA', 'AGUARDANDO CLIENTE', 'LUIZA']);
  });
  it('com responsável e sem etapa nenhuma → EM ATENDIMENTO', () => {
    expect(textos({ respId: 'u1', canalAtual: 'URA' })).toEqual(['MATHEUS', 'EM ATENDIMENTO', 'URA']);
  });
  it('sem canal → não inventa etiqueta de canal', () => {
    expect(textos({ respId: 'u1' })).toEqual(['MATHEUS', 'EM ATENDIMENTO']);
  });
});

describe('precedência da SITUAÇÃO', () => {
  it('resultado da oportunidade vence a etapa', () => {
    expect(situacaoDaConversa({ etapa: 'CONTRATOS', etapaEntrada: false, oppStatus: 'ganho' }).texto).toBe('CLIENTE FECHADO');
    expect(situacaoDaConversa({ etapa: 'CONTRATOS', etapaEntrada: false, oppStatus: 'perdido' }).texto).toBe('PERDIDO');
  });
  it('etapa avançada vence LEAD NOVO mesmo sem responsável', () => {
    expect(situacaoDaConversa({ etapa: 'DOCUMENTOS', etapaEntrada: false }).texto).toBe('DOCUMENTOS');
  });
  it('etapa avançada vence AGUARDANDO CLIENTE', () => {
    expect(situacaoDaConversa({ respId: 'u1', etapa: 'CONTRATOS', etapaEntrada: false, aguardando: true }).texto).toBe('CONTRATOS');
  });
  it('a coluna de ENTRADA nunca vira texto cru', () => {
    expect(situacaoDaConversa({ respId: 'u1', etapa: 'LEAD NOVO', etapaEntrada: true }).texto).toBe('EM ATENDIMENTO');
    expect(situacaoDaConversa({ etapa: 'LEAD NOVO', etapaEntrada: true }).texto).toBe('LEAD NOVO');
  });
});

describe('atendente', () => {
  it('preferência: conversa > contato > oportunidade', () => {
    expect(responsavelEfetivo({ atendenteId: 'u1', respId: 'u2', oppRespId: 'u3' })).toBe('u1');
    expect(responsavelEfetivo({ respId: 'u2', oppRespId: 'u3' })).toBe('u2');
    expect(responsavelEfetivo({ oppRespId: 'u3' })).toBe('u3');
    expect(responsavelEfetivo({})).toBeNull();
  });
  it('qualquer responsável derruba o LEAD NOVO', () => {
    expect(ehLeadNovo({ atendenteId: 'u1' })).toBe(false);
    expect(ehLeadNovo({ respId: 'u2' })).toBe(false);
    expect(ehLeadNovo({ oppRespId: 'u3' })).toBe(false);
    expect(ehLeadNovo({})).toBe(true);
  });
  it('responsável sem nome resolvido ainda sinaliza que foi assumido', () => {
    expect(textos({ respId: 'desconhecido', etapa: 'DOCUMENTOS', etapaEntrada: false })).toEqual(['ATENDENTE', 'DOCUMENTOS']);
  });
  it('primeiroNomeUpper', () => {
    expect(primeiroNomeUpper('Juliana Alves')).toBe('JULIANA');
    expect(primeiroNomeUpper('  andrius  ')).toBe('ANDRIUS');
    expect(primeiroNomeUpper(null)).toBe('');
  });
});

describe('preview da última mensagem', () => {
  it('texto/legenda vence', () => {
    expect(previewUltimaMensagem({ tipo: 'texto', texto: 'Oi' })).toBe('Oi');
    expect(previewUltimaMensagem({ tipo: 'imagem', texto: 'segue o print' })).toBe('segue o print');
  });
  it('mídia sem texto → rótulo correto', () => {
    expect(previewUltimaMensagem({ tipo: 'audio', seconds: 12 })).toBe('Mensagem de voz (0:12)');
    expect(previewUltimaMensagem({ tipo: 'audio', seconds: 75 })).toBe('Mensagem de voz (1:15)');
    expect(previewUltimaMensagem({ tipo: 'audio', ptt: false, seconds: 5 })).toBe('Áudio (0:05)');
    expect(previewUltimaMensagem({ tipo: 'imagem' })).toBe('Imagem');
    expect(previewUltimaMensagem({ tipo: 'video' })).toBe('Vídeo');
    expect(previewUltimaMensagem({ tipo: 'documento' })).toBe('Documento');
  });
  it('vazio', () => {
    expect(previewUltimaMensagem(null)).toBe('');
    expect(previewUltimaMensagem({})).toBe('');
  });
});
