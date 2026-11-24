// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({ supabase: null, isPrevia: false }));
vi.mock('@/context/OrgContext', () => ({ ORG_REVIZA: 'a1fa0000-0000-4000-8000-000000000001' }));
vi.mock('./recursos', () => ({ temRecurso: () => false }));

const { irisPreConfigurada, irisEmBranco, lerArquivo, exportarVersao, prontidao, exemplo, textosDaVersao } = await import('./iris');
type V = Parameters<typeof prontidao>[0];
const versao = (over: Partial<V> = {}): V => ({ id: 'v1', nome: 'Iris', descricao: '', origem: 'pre_configurada', ativa: false, chaveDefinidaEm: null, criadoEm: '', atualizadoEm: '', config: irisPreConfigurada(), ...over });

describe('Iris pré-configurada', () => {
  it('nenhum texto fala da CAF e todos entram para aprovar', () => {
    const c = irisPreConfigurada('Reviza');
    expect(c.textos.length).toBeGreaterThan(60);
    expect(c.textos.some((t) => /\bCAF\b/.test(t.texto))).toBe(false);
    expect(c.textos.every((t) => !t.aprovado)).toBe(true);
    expect(exemplo('Aqui é a {assistente}, {rotulo} da {empresa}.', c)).toBe('Aqui é a Iris, atendente virtual da Reviza.');
  });
  it('os fatos da empresa nascem em branco (nada é inventado)', () => {
    const e = irisPreConfigurada().empresa;
    expect([e.razaoSocial, e.cnpj, e.advogado, e.oab, e.honorarios, e.prazoProcesso].every((x) => x === '')).toBe(true);
  });
  it('em branco: sem assuntos, sem perguntas, só a abertura', () => {
    const c = irisEmBranco();
    expect(c.produtos.every((p) => !p.ativo)).toBe(true);
    expect(c.qualificacao.perguntas).toHaveLength(0);
    expect(new Set(c.textos.map((t) => t.grupo))).toEqual(new Set(['abertura']));
  });
  it('textos dos assuntos desligados ficam fora da versão', () => {
    const c = irisPreConfigurada();
    c.produtos = c.produtos.map((p) => (p.id === 'rmc' ? { ...p, ativo: false } : p));
    expect(textosDaVersao(c).some((t) => t.grupo === 'produto_rmc')).toBe(false);
    expect(textosDaVersao(c).some((t) => t.grupo === 'produto_revisao')).toBe(true);
  });
});

describe('pronta para ligar', () => {
  it('a pré-configurada sem chave, sem fatos e sem textos aprovados não liga', () => {
    const itens = prontidao(versao(), [{ id: 'n1', nome: 'Principal', numero: null, conectado: true, versaoId: 'v1', ligado: false, modoTeste: true, numerosTeste: [] }]);
    const falta = itens.filter((i) => !i.ok).map((i) => i.id).sort();
    expect(falta).toEqual(['chave', 'empresa', 'textos']);
  });
  it('com tudo preenchido e aprovado fica pronta', () => {
    const c = irisPreConfigurada();
    Object.assign(c.empresa, { razaoSocial: 'X Ltda', cnpj: '00', cidade: 'POA', advogado: 'Fulano', oab: 'OAB/RS 1', honorarios: 'só no final', prazoProcesso: '6 a 12 meses' });
    c.textos = c.textos.map((t) => ({ ...t, aprovado: true }));
    const itens = prontidao(versao({ chaveDefinidaEm: '2026-11-24', config: c }), [{ id: 'n1', nome: 'P', numero: null, conectado: true, versaoId: 'v1', ligado: true, modoTeste: true, numerosTeste: [] }]);
    expect(itens.every((i) => i.ok)).toBe(true);
  });
});

describe('arquivo da versão', () => {
  it('exporta sem chave e importa de volta igual', () => {
    const v = versao({ chaveDefinidaEm: '2026-11-24' });
    const txt = JSON.stringify(exportarVersao(v));
    expect(txt).not.toMatch(/chave_?definida|"chave"/i);
    const lido = lerArquivo(txt);
    expect(lido.ok).toBe(true);
    if (lido.ok) expect(lido.config).toEqual(v.config);
  });
  it('lista de atendentes e financeiras sobrevivem; assunto sem financeiras não ganha lista', () => {
    const c = irisPreConfigurada();
    c.equipe.atendentes = [{ usuarioId: 'u1', nome: 'Bianca', turno: 'tarde', recebe: true }];
    const lido = lerArquivo(JSON.stringify(exportarVersao(versao({ config: c }))));
    expect(lido.ok).toBe(true);
    if (lido.ok) {
      expect(lido.config.equipe.atendentes).toEqual(c.equipe.atendentes);
      expect(lido.config.produtos.find((p) => p.id === 'revisao')?.financeiras).toEqual(['Agibank', 'BMG', 'Facta', 'Mercantil', 'Crefisa']);
      expect(lido.config.produtos.find((p) => p.id === 'rmc')).not.toHaveProperty('financeiras');
    }
  });
  it('recusa arquivo com chave dentro', () => {
    const a = { ...exportarVersao(versao()), api_key: 'AIzaSy-qualquer' };
    const lido = lerArquivo(JSON.stringify(a));
    expect(lido.ok).toBe(false);
  });
  it('ignora campos estranhos e tipos errados (fonte não confiável)', () => {
    const a = exportarVersao(versao()) as unknown as Record<string, unknown>;
    const cfg = a.config as Record<string, unknown>;
    cfg.estranho = 'x';
    (cfg.tom as Record<string, unknown>).maxBolhas = 'muitas';
    (cfg.identidade as Record<string, unknown>).assistente = 'Luna';
    const lido = lerArquivo(JSON.stringify(a));
    expect(lido.ok).toBe(true);
    if (lido.ok) {
      expect((lido.config as unknown as Record<string, unknown>).estranho).toBeUndefined();
      expect(lido.config.tom.maxBolhas).toBe(2);
      expect(lido.config.identidade.assistente).toBe('Luna');
    }
  });
  it('recusa o que não é arquivo da Iris', () => {
    expect(lerArquivo('não é json').ok).toBe(false);
    expect(lerArquivo('{"tipo":"outra-coisa","config":{}}').ok).toBe(false);
  });
});
