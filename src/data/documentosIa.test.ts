// @vitest-environment node
// Documentos reconhecidos pela IA: a leitura do que a IA devolveu (servidor) e a conta do painel (front)
import { describe, expect, it } from 'vitest';
import { lerDocumento, tipoPeloNome } from '../../supabase-reviza/functions/_shared/iaPropria';
import { docDosMetadados, situacaoDosDocs, rotuloDoDoc, type DocIa } from './documentosIa';
import type { WaMessage } from './whatsappDemo';

describe('o que a IA devolve', () => {
  it('aceita só os tipos da lista e nunca guarda número na observação', () => {
    expect(lerDocumento('{"tipo":"identidade","lado":"frente","legivel":true,"observacao":"RG novo"}')).toEqual({ tipo: 'identidade', lado: 'frente', legivel: true, observacao: 'RG novo' });
    expect(lerDocumento('{"tipo":"passaporte","legivel":true}')).toBeNull();
    expect(lerDocumento('não é json')).toBeNull();
    const d = lerDocumento('```json\n{"tipo":"extrato_bancario","lado":"frente","legivel":false,"observacao":"CPF 123.456.789-00 e saldo 1.234,56"}\n```');
    expect(d?.lado).toBeNull(); // lado só vale para o RG/CNH
    expect(d?.legivel).toBe(false);
    expect(d?.observacao).not.toMatch(/\d{2}/);
  });
  it('PDF sem IA de visão: o nome do arquivo às vezes diz o que é', () => {
    expect(tipoPeloNome('RG_frente_e_verso.pdf')).toBe('identidade');
    expect(tipoPeloNome('Historico_Emprestimos_INSS.pdf')).toBe('extrato_consignado');
    expect(tipoPeloNome('Contrato_Emprestimo.pdf')).toBe('contrato');
    expect(tipoPeloNome('Comprovante_Residencia.pdf')).toBe('comprovante_endereco');
    expect(tipoPeloNome('cargo.pdf')).toBeNull(); // "rg" no meio da palavra não é RG
    expect(tipoPeloNome(null)).toBeNull();
  });
});

const msg = (id: string, extra: Partial<WaMessage> = {}): WaMessage => ({ id, dir: 'in', text: '', time: '10:00', tipo: 'imagem', anexoPath: 'org/x/' + id, ...extra } as WaMessage);

describe('o painel: chegaram, faltam, pedir de novo', () => {
  it('lê os metadados gravados pelo servidor', () => {
    expect(docDosMetadados({ doc_tipo: 'identidade', doc_lado: 'verso', doc_legivel: true, doc_obs: '' })).toEqual({ tipo: 'identidade', lado: 'verso', legivel: true, obs: '' });
    expect(docDosMetadados({ anexo_path: 'a' })).toBeNull();
    expect(docDosMetadados({ doc_tipo: 'qualquer' })).toBeNull();
    expect(rotuloDoDoc({ tipo: 'identidade', lado: 'frente', legivel: true, obs: '' })).toBe('RG ou CNH (só a frente)');
  });
  it('conta o que chegou e o que falta; o arquivo novo legível vale mais que o antigo ruim', () => {
    const docs: Record<string, DocIa> = {
      a: { tipo: 'comprovante_endereco', lado: null, legivel: false, obs: 'Foto escura.' },
      b: { tipo: 'identidade', lado: 'frente_e_verso', legivel: true, obs: '' },
      c: { tipo: 'comprovante_endereco', lado: null, legivel: true, obs: '' },
      d: { tipo: 'extrato_bancario', lado: null, legivel: false, obs: 'Cortado.' },
    };
    const msgs = [msg('a'), msg('b', { tipo: 'documento' }), msg('c'), msg('d'), msg('e'), msg('f', { dir: 'out' }), msg('g', { tipo: 'audio' })];
    const s = situacaoDosDocs(msgs, (m) => docs[m.id!] ?? null);
    expect(s.revisao.map((l) => [l.tipo, l.estado, l.mensagemId])).toEqual([
      ['identidade', 'chegou', 'b'], ['comprovante_endereco', 'chegou', 'c'], ['extrato_consignado', 'falta', null],
    ]);
    expect(s.outros).toEqual([{ mensagemId: 'd', doc: docs.d }]);
    expect(s.semIdentificar).toBe(1); // só a foto "e": a enviada pela equipe e o áudio não contam
    expect(s.algumIdentificado).toBe(true);
  });
  it('só arquivo ruim: pedir de novo, com o motivo', () => {
    const s = situacaoDosDocs([msg('a')], () => ({ tipo: 'extrato_consignado', lado: null, legivel: false, obs: 'Cortado na metade.' }));
    expect(s.revisao[2]).toMatchObject({ estado: 'pedir_de_novo', obs: 'Cortado na metade.', mensagemId: 'a' });
  });
});
