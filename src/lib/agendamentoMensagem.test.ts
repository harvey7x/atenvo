import { describe, it, expect } from 'vitest';
import {
  canalValidoParaEnvio, rotuloCanal, podeAgendar, estaExpirada, proximoStatus,
  partesSP, defaultQuandoAgendar, montarInstanteSP, resumoEnvio, avisoJanelaLonga, agendaEditavel,
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

/* ===================== Fase 2A: padrões, resumo e avisos ===================== */

// 2026-07-18 15:35:00Z = 12:35 em São Paulo (UTC-3 fixo)
const T = Date.UTC(2026, 6, 18, 15, 35, 0);

describe('partesSP()', () => {
  it('converte epoch para parede SP (UTC-3)', () => {
    expect(partesSP(T)).toEqual({ data: '2026-07-18', hora: '12:35' });
  });
  it('vira o dia corretamente (23:00Z = 20:00 SP mesmo dia)', () => {
    expect(partesSP(Date.UTC(2026, 6, 18, 23, 0, 0))).toEqual({ data: '2026-07-18', hora: '20:00' });
  });
  it('madrugada UTC → dia anterior em SP (01:00Z = 22:00 do dia anterior)', () => {
    expect(partesSP(Date.UTC(2026, 6, 18, 1, 0, 0))).toEqual({ data: '2026-07-17', hora: '22:00' });
  });
});

describe('defaultQuandoAgendar()', () => {
  it('data = hoje, hora = agora + 5min (SP)', () => {
    expect(defaultQuandoAgendar(T, 5)).toEqual({ data: '2026-07-18', hora: '12:40' });
  });
  it('default de 5min quando não passa argumento', () => {
    expect(defaultQuandoAgendar(T)).toEqual({ data: '2026-07-18', hora: '12:40' });
  });
});

describe('montarInstanteSP()', () => {
  it('data+hora SP → ISO UTC', () => {
    expect(montarInstanteSP('2026-07-18', '12:35')).toBe('2026-07-18T15:35:00.000Z');
  });
  it('vazio → string vazia', () => {
    expect(montarInstanteSP('', '12:35')).toBe('');
    expect(montarInstanteSP('2026-07-18', '')).toBe('');
  });
  it('ida e volta com partesSP', () => {
    const iso = montarInstanteSP('2026-07-18', '09:00');
    expect(partesSP(new Date(iso).getTime())).toEqual({ data: '2026-07-18', hora: '09:00' });
  });
});

describe('resumoEnvio()', () => {
  it('mesmo dia → "hoje"', () => {
    const agora = Date.UTC(2026, 6, 18, 13, 0, 0); // 10:00 SP
    expect(resumoEnvio({ executarEmMs: T, agoraMs: agora, canalNome: 'RMKT 5' })).toBe('Será enviada hoje às 12:35 por RMKT 5');
  });
  it('dia seguinte → "amanhã"', () => {
    const alvo = Date.UTC(2026, 6, 19, 12, 0, 0); // 09:00 SP dia 19
    expect(resumoEnvio({ executarEmMs: alvo, agoraMs: T, canalNome: 'RMKT 5' })).toBe('Será enviada amanhã às 09:00 por RMKT 5');
  });
  it('data futura → "em dd/mm/aaaa"', () => {
    const alvo = Date.UTC(2026, 6, 25, 13, 0, 0); // 10:00 SP dia 25
    expect(resumoEnvio({ executarEmMs: alvo, agoraMs: T, canalNome: 'ANDRIUS' })).toBe('Será enviada em 25/07/2026 às 10:00 por ANDRIUS');
  });
  it('canal ausente → rótulo genérico', () => {
    expect(resumoEnvio({ executarEmMs: T, agoraMs: Date.UTC(2026, 6, 18, 13, 0, 0), canalNome: null })).toMatch(/por canal selecionado$/);
  });
  it('instante inválido → null', () => {
    expect(resumoEnvio({ executarEmMs: NaN, agoraMs: T, canalNome: 'x' })).toBeNull();
  });
});

describe('avisoJanelaLonga()', () => {
  it('conversa parada há +24h → avisa (prioridade)', () => {
    const r = avisoJanelaLonga({ executarEmMs: T + 3_600_000, agoraMs: T, ultimaInteracaoMs: T - 25 * 3_600_000 });
    expect(r).toMatch(/parada há mais de 24h/);
  });
  it('agendamento distante (>7 dias) → avisa', () => {
    const r = avisoJanelaLonga({ executarEmMs: T + 8 * 86_400_000, agoraMs: T, ultimaInteracaoMs: T - 3_600_000 });
    expect(r).toMatch(/distante/);
  });
  it('normal (próximo, conversa recente) → sem aviso', () => {
    expect(avisoJanelaLonga({ executarEmMs: T + 3_600_000, agoraMs: T, ultimaInteracaoMs: T - 3_600_000 })).toBeNull();
  });
  it('sem última interação → só considera distância', () => {
    expect(avisoJanelaLonga({ executarEmMs: T + 3_600_000, agoraMs: T, ultimaInteracaoMs: null })).toBeNull();
  });
  it('instante inválido → null', () => {
    expect(avisoJanelaLonga({ executarEmMs: NaN, agoraMs: T })).toBeNull();
  });
});

describe('agendaEditavel()', () => {
  it('agendada → editável', () => { expect(agendaEditavel('agendada')).toBe(true); });
  it('outros status → não editável', () => {
    for (const s of ['processando', 'enviada', 'falhou', 'cancelada', 'expirada', 'bloqueada', null, undefined]) {
      expect(agendaEditavel(s)).toBe(false);
    }
  });
});
