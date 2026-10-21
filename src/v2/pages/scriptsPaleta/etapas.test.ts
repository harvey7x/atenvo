import { describe, expect, it } from 'vitest';
import { SCRIPTS_REAL, fetchEtapasParaEnvio, type EtapaItem } from '@/data/scripts';
import { resumirEtapas } from '../../hooks/scriptsResumo';
import { ETAPAS_DEMO, RESUMO_DEMO, SCRIPTS_DEMO } from './demoEtapas';
import { composicaoDe, etapasDoResumo, etapasParaPrevia, extensaoDe, rotuloComposicao, rotuloMensagens, rotuloMsgs } from './etapas';

const E: EtapaItem[] = [
  { tipo: 'texto', conteudo: '   ' },
  { tipo: 'texto', conteudo: 'Oi {{nome_cliente}}' },
  { tipo: 'imagem', conteudo: 'sem arquivo', storagePath: null },
  { tipo: 'video', conteudo: '', storagePath: 'org/s/v.mp4' },
  { tipo: 'documento', conteudo: '', storagePath: 'org/s/d.pdf', nome: 'guia.pdf' },
];

describe('etapas da prévia = critério do compositor', () => {
  it('descarta texto vazio e mídia sem arquivo', () => {
    expect(etapasParaPrevia(E, 'conteudo').map((e) => e.tipo)).toEqual(['texto', 'video', 'documento']);
  });
  it('sem etapa enviável, o conteudo do script vira a mensagem única', () => {
    expect(etapasParaPrevia([], 'Olá')).toEqual([{ tipo: 'texto', conteudo: 'Olá' }]);
    expect(etapasParaPrevia([E[0], E[2]], '  ')).toEqual([]);
  });
  it('resumo conta só o enviável e numera os textos como o compositor', () => {
    const r = resumirEtapas(E);
    expect(r).toMatchObject({ total: 5, enviaveis: 3, tipos: ['texto', 'video', 'documento'], temMidia: true });
    expect(r.textos).toEqual([{ n: 1, texto: 'Oi {{nome_cliente}}' }]);
  });
  it('composição da lista: resumo novo, resumo antigo e script sem etapas', () => {
    expect(composicaoDe('x', resumirEtapas(E))).toEqual({ total: 3, tipos: ['texto', 'video', 'documento'] });
    expect(composicaoDe('x', resumirEtapas([E[0], E[2]]))).toEqual({ total: 1, tipos: ['texto'] });
    expect(composicaoDe('x', { total: 4, temMidia: true })).toEqual({ total: 4, tipos: [] });
    expect(composicaoDe('', undefined)).toEqual({ total: 0, tipos: [] });
  });
  it('rótulos em português, na ordem fixa dos ícones', () => {
    expect(rotuloComposicao(['documento', 'texto', 'audio', 'imagem'])).toBe('texto + áudio + imagem + documento');
    expect(rotuloMensagens(1)).toBe('1 mensagem');
    expect(rotuloMensagens(4)).toBe('4 mensagens');
    expect(extensaoDe('Guia Final.PDF')).toBe('PDF');
    expect(extensaoDe(null, 'application/pdf')).toBe('PDF');
  });
});

describe('demo é o contrato', () => {
  it('todo script demo tem sequência coerente e resumo pela mesma regra', () => {
    for (const s of SCRIPTS_DEMO) {
      const etapas = ETAPAS_DEMO[s.id];
      expect(etapas?.length, s.id).toBeGreaterThan(0);
      expect(RESUMO_DEMO[s.id].enviaveis).toBe(etapasParaPrevia(etapas, s.conteudo).length);
      // mídia demo tem id (o compositor exige etapaId) e arquivo
      for (const e of etapas) if (e.tipo !== 'texto') expect(e.id && e.storagePath, `${s.id}:${e.nome}`).toBeTruthy();
    }
  });
  it.skipIf(SCRIPTS_REAL)('o compositor do demo abre EXATAMENTE as etapas que a prévia mostra', async () => {
    for (const s of SCRIPTS_DEMO) {
      const envio = await fetchEtapasParaEnvio(s.id, { cliente: 'Maria' }, { incluirMidia: true, fallbackConteudo: s.conteudo });
      expect(envio.map((e) => e.tipo), s.id).toEqual(etapasParaPrevia(ETAPAS_DEMO[s.id], s.conteudo).map((e) => e.tipo));
    }
  });
});

describe('prévia instantânea pelo resumo', () => {
  const ETAPAS = [
    { tipo: 'texto' as const, conteudo: 'Oi {{nome_cliente}}' },
    { tipo: 'video' as const, conteudo: 'legenda do vídeo', nome: 'passo.mp4', storagePath: 'p/v.mp4' },
    { tipo: 'imagem' as const, conteudo: 'sem arquivo: não vai', nome: 'x.jpg', storagePath: null },
    { tipo: 'audio' as const, conteudo: '', nome: 'oi.ogg', storagePath: 'p/a.ogg' },
  ];
  it('desenha a sequência enviável na ordem (tipo, nome e texto) antes de fetchEtapas', () => {
    expect(etapasDoResumo(resumirEtapas(ETAPAS), 'fallback', true)).toEqual([
      { tipo: 'texto', nome: null, conteudo: 'Oi {{nome_cliente}}' },
      { tipo: 'video', nome: 'passo.mp4', conteudo: 'legenda do vídeo' },
      { tipo: 'audio', nome: 'oi.ogg', conteudo: '' },
    ]);
  });
  it('mesmas tipos e posições que a prévia completa mostra depois', () => {
    const prov = etapasDoResumo(resumirEtapas(ETAPAS), '', true)!;
    expect(prov.map((e) => e.tipo)).toEqual(etapasParaPrevia(ETAPAS.map((e) => ({ ...e, conteudo: e.conteudo ?? '' })), '').map((e) => e.tipo));
  });
  it('sem etapas: conteudo vira a mensagem única; resumo ainda não chegou ou antigo: skeleton', () => {
    expect(etapasDoResumo(undefined, 'Olá', true)).toEqual([{ tipo: 'texto', conteudo: 'Olá' }]);
    expect(etapasDoResumo(undefined, 'Olá', false)).toBeNull();
    expect(etapasDoResumo({ total: 2, temMidia: false }, 'Olá', true)).toBeNull();
    expect(etapasDoResumo(resumirEtapas([{ tipo: 'texto', conteudo: '  ' }]), '', true)).toEqual([]);
  });
  it('rótulo curto da lista', () => {
    expect(rotuloMsgs(1)).toBe('1 msg');
    expect(rotuloMsgs(4)).toBe('4 msgs');
  });
});

