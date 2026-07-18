import { describe, it, expect } from 'vitest';
import {
  canalValidoParaEnvio, rotuloCanal, podeAgendar, estaExpirada, proximoStatus,
} from './agendamentoMensagem';

const canalOk = { id: 'c1', nome: 'ANDRIUS', ativo: true, status_integracao: 'conectado', envio_restrito: false, conflito_com: null };

describe('canalValidoParaEnvio()', () => {
  it('canal conectado, ativo, sem restrição → ok', () => {
    expect(canalValidoParaEnvio(canalOk)).toEqual({ ok: true, motivo: null });
  });
  it('desconectado → bloqueia', () => {
    expect(canalValidoParaEnvio({ ...canalOk, status_integracao: 'desconectado' })).toMatchObject({ ok: false, motivo: 'desconectado' });
  });
  it('removido → bloqueia', () => {
    expect(canalValidoParaEnvio({ ...canalOk, status_integracao: 'removido' })).toMatchObject({ ok: false, motivo: 'canal removido' });
  });
  it('envio_restrito → bloqueia', () => {
    expect(canalValidoParaEnvio({ ...canalOk, envio_restrito: true })).toMatchObject({ ok: false, motivo: 'envio restrito' });
  });
  it('conflito_com → bloqueia', () => {
    expect(canalValidoParaEnvio({ ...canalOk, conflito_com: 'outro' })).toMatchObject({ ok: false, motivo: 'canal em conflito' });
  });
  it('inativo → bloqueia', () => {
    expect(canalValidoParaEnvio({ ...canalOk, ativo: false })).toMatchObject({ ok: false, motivo: 'canal inativo' });
  });
  it('null → bloqueia', () => {
    expect(canalValidoParaEnvio(null).ok).toBe(false);
  });
  it('rótulo reflete estado', () => {
    expect(rotuloCanal(canalOk)).toBe('ANDRIUS — conectado');
    expect(rotuloCanal({ ...canalOk, nome: 'RMKT', status_integracao: 'desconectado' })).toBe('RMKT — desconectado');
    expect(rotuloCanal({ ...canalOk, nome: 'RMKT5', envio_restrito: true })).toBe('RMKT5 — envio restrito');
  });
});

describe('podeAgendar()', () => {
  const AG = 1_000_000_000_000;
  const base = { texto: 'Oi, tudo bem?', canal: canalOk, temTelefone: true, executarEmMs: AG + 3_600_000, agoraMs: AG };

  it('caso feliz', () => { expect(podeAgendar(base)).toEqual({ ok: true, erro: null }); });
  it('texto vazio → erro', () => { expect(podeAgendar({ ...base, texto: '   ' }).ok).toBe(false); });
  it('texto longo demais → erro', () => { expect(podeAgendar({ ...base, texto: 'x'.repeat(4097) }).ok).toBe(false); });
  it('sem telefone → erro', () => { expect(podeAgendar({ ...base, temTelefone: false }).ok).toBe(false); });
  it('canal inválido → erro com motivo', () => {
    const r = podeAgendar({ ...base, canal: { ...canalOk, envio_restrito: true } });
    expect(r.ok).toBe(false); expect(r.erro).toMatch(/restrito/);
  });
  it('horário no passado → erro', () => { expect(podeAgendar({ ...base, executarEmMs: AG - 1000 }).ok).toBe(false); });
  it('horário muito próximo (dentro da margem) → erro', () => { expect(podeAgendar({ ...base, executarEmMs: AG + 10_000 }).ok).toBe(false); });
  it('data inválida (NaN) → erro', () => { expect(podeAgendar({ ...base, executarEmMs: NaN }).ok).toBe(false); });
});

describe('estaExpirada()', () => {
  const now = 1_000_000_000_000;
  it('dentro da janela → não expira', () => { expect(estaExpirada(now - 3_600_000, now, 24)).toBe(false); });
  it('além de 24h de atraso → expira', () => { expect(estaExpirada(now - 25 * 3_600_000, now, 24)).toBe(true); });
  it('no horário → não expira', () => { expect(estaExpirada(now, now, 24)).toBe(false); });
});

describe('proximoStatus()', () => {
  it('sucesso → enviada', () => { expect(proximoStatus({ ok: true }, 1, 3)).toBe('enviada'); });
  it('problema de canal → bloqueada', () => { expect(proximoStatus({ ok: false, problemaCanal: true }, 1, 3)).toBe('bloqueada'); });
  it('erro com retry disponível → volta pra agendada', () => { expect(proximoStatus({ ok: false, erro: 'net' }, 1, 3)).toBe('agendada'); });
  it('erro e tentativas esgotadas → falhou', () => { expect(proximoStatus({ ok: false, erro: 'net' }, 3, 3)).toBe('falhou'); });
});
