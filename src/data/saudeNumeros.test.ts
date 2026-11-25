// @vitest-environment node
// Saúde dos números do WhatsApp: as regras da nota (boa / atenção / risco)
import { describe, expect, it } from 'vitest';
import { SAUDE_DEMO, avaliarSaude, normalizarSaude, type SaudeNumero } from './saudeNumeros';

const base: SaudeNumero = {
  canalId: 'x', nome: 'Número', numero: null, status: 'conectado', envioRestrito: false,
  hoje: { enviadas: 40, falharam: 0, recebidas: 50 }, ultimaRecebida: null, ultimaEnviada: null, semReceberMinUteis: 3,
  recebidas7d: 300, enviadas7d: 250, falharam7d: 0, chamadas7d: 30, responderam7d: 20, serie: [],
};

describe('saúde dos números', () => {
  it('tudo normal = boa', () => { expect(avaliarSaude(base).nota).toBe('boa'); });
  it('desconectado ou travado = risco', () => {
    expect(avaliarSaude({ ...base, status: 'desconectado' }).nota).toBe('risco');
    expect(avaliarSaude({ ...base, envioRestrito: true }).motivos[0]).toMatch(/travado por segurança/);
  });
  it('conectado, recebia bem e nada chega há 2 h úteis = risco (o número travado)', () => {
    const a = avaliarSaude({ ...base, semReceberMinUteis: 150 });
    expect(a.nota).toBe('risco');
    expect(a.motivos[0]).toMatch(/nada chega há 2 h 30 min/);
    // número que quase não recebe: ficar 2 h sem receber é normal
    expect(avaliarSaude({ ...base, recebidas7d: 20, semReceberMinUteis: 300 }).nota).toBe('boa');
  });
  it('falhas: 10% atenção, 25% risco, e só com 5+ envios', () => {
    expect(avaliarSaude({ ...base, hoje: { ...base.hoje, enviadas: 40, falharam: 5 } }).nota).toBe('atencao');
    expect(avaliarSaude({ ...base, hoje: { ...base.hoje, enviadas: 40, falharam: 12 } }).nota).toBe('risco');
    expect(avaliarSaude({ ...base, hoje: { ...base.hoje, enviadas: 4, falharam: 3 } }).nota).toBe('boa');
  });
  it('poucos clientes chamados respondem = atenção (risco de bloqueio)', () => {
    const a = avaliarSaude({ ...base, chamadas7d: 200, responderam7d: 20 });
    expect(a.nota).toBe('atencao');
    expect(a.motivos[0]).toMatch(/Só 10% .*20 de 200/);
    expect(avaliarSaude({ ...base, chamadas7d: 10, responderam7d: 0 }).nota).toBe('boa'); // pouca amostra
  });
  it('os exemplos da demonstração: boa, atenção e risco', () => {
    expect(SAUDE_DEMO.map((n) => avaliarSaude(n).nota)).toEqual(['boa', 'atencao', 'risco']);
  });
  it('lê o que o servidor devolve', () => {
    const n = normalizarSaude({ canal_id: 'c1', nome: 'A', status: 'conectado', hoje: { enviadas: '3' }, sem_receber_min_uteis: null, serie: [{ dia: '2026-11-25', recebidas: 2 }] });
    expect(n.hoje).toEqual({ enviadas: 3, falharam: 0, recebidas: 0 });
    expect(n.semReceberMinUteis).toBeNull();
    expect(n.serie[0]).toEqual({ dia: '2026-11-25', enviadas: 0, falharam: 0, recebidas: 2 });
  });
});
