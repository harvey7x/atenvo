import { describe, expect, it } from 'vitest';
import { apresentarLicenca, diasAte, fmtReais, qrSrc, type LicencaRpc } from './licenca';

/* Mensalidade da plataforma — a fatura nasce no dia 1º, vence dia 5 e bloqueia
   às 14h de Brasília. A decisão vem da RPC licenca_estado(); aqui testamos a
   função PURA de apresentação: estado efetivo (o relógio local promove aviso→
   bloqueado entre refetches, NUNCA o contrário) e os rótulos da faixa.
   Brasília é -03:00 o ano todo (sem horário de verão desde 2019). */

const fatura = (extra?: Partial<LicencaRpc>): LicencaRpc => ({
  estado: 'aviso',
  comp: '2026-10',
  valor_centavos: 10_000,
  vence_em: '2026-10-05',
  bloqueia_em: '2026-10-05T14:00:00-03:00',
  pix_copia_cola: '00020126BR.GOV.BCB.PIX-exemplo',
  qr_base64: 'QkFTRTY0RkFLRQ==',
  ...extra,
});
const brt = (iso: string) => new Date(`${iso}-03:00`);

describe('mensalidade da plataforma: estado e rótulos (dia 1º → dia 5 às 14h)', () => {
  it('dia 1º (a fatura nasce): aviso com contagem "vence em 4 dias"', () => {
    const a = apresentarLicenca(fatura(), brt('2026-10-01T09:00:00'));
    expect(a.estado).toBe('aviso');
    expect(a.valor).toBe('R$ 100,00');
    expect(a.rotuloVencimento).toBe('vence dia 5 às 14h');
    expect(a.rotuloPrazo).toBe('vence em 4 dias');
    expect(a.qrSrc).toBe('data:image/png;base64,QkFTRTY0RkFLRQ=='); // base64 cru ganha o prefixo
  });

  it('dia 4: véspera vira "vence amanhã"', () => {
    const a = apresentarLicenca(fatura(), brt('2026-10-04T10:00:00'));
    expect(a.estado).toBe('aviso');
    expect(a.rotuloPrazo).toBe('vence amanhã');
    expect(diasAte('2026-10-05', brt('2026-10-04T23:59:00'))).toBe(1); // dia-calendário BRT, não 24h corridas
  });

  it('dia 5 às 13:59: ainda aviso, com "bloqueia hoje às 14h"', () => {
    const a = apresentarLicenca(fatura(), brt('2026-10-05T13:59:00'));
    expect(a.estado).toBe('aviso');
    expect(a.rotuloPrazo).toBe('bloqueia hoje às 14h');
  });

  it('dia 5 às 14:00 em ponto: bloqueado — o relógio local promove mesmo com a RPC ainda dizendo aviso', () => {
    const a = apresentarLicenca(fatura(), brt('2026-10-05T14:00:00'));
    expect(a.estado).toBe('bloqueado');
    expect(a.rotuloPrazo).toBeNull(); // bloqueado não tem contagem — tem a tela
    const b = apresentarLicenca(fatura({ estado: 'bloqueado' }), brt('2026-10-06T08:00:00'));
    expect(b.estado).toBe('bloqueado');
    expect(b.pixCopiaCola).toBe('00020126BR.GOV.BCB.PIX-exemplo');
  });

  it('fatura paga: a RPC devolve ok (+pago_em) e NADA renderiza', () => {
    const a = apresentarLicenca({ estado: 'ok', pago_em: '2026-10-03T11:20:00-03:00' }, brt('2026-10-03T12:00:00'));
    expect(a.estado).toBe('ok');
    expect(a.pagoEm).toBe('2026-10-03T11:20:00-03:00');
    expect(a.rotuloPrazo).toBeNull();
  });

  it('FAIL-SAFE: fatura vencida SEM Pix (copia-e-cola e QR nulos) nunca bloqueia — fica aviso (espelha o licenca_estado v2)', () => {
    const semPix = fatura({ pix_copia_cola: null, qr_base64: null });
    // relógio local já passou do bloqueio: sem como pagar, não promove
    expect(apresentarLicenca(semPix, brt('2026-10-19T10:00:00')).estado).toBe('aviso');
    // nem um 'bloqueado' vindo do servidor tranca sem Pix (defesa em profundidade)
    expect(apresentarLicenca({ ...semPix, estado: 'bloqueado' }, brt('2026-10-19T10:00:00')).estado).toBe('aviso');
    // com qualquer um dos dois meios de pagar, o bloqueio volta a valer
    expect(apresentarLicenca(fatura({ qr_base64: null }), brt('2026-10-19T10:00:00')).estado).toBe('bloqueado');
    expect(apresentarLicenca(fatura({ pix_copia_cola: null }), brt('2026-10-19T10:00:00')).estado).toBe('bloqueado');
  });

  it('FAIL-OPEN: sem payload, estado ok ou estado desconhecido → ok (o sistema nunca bloqueia por falha nossa)', () => {
    expect(apresentarLicenca(null, brt('2026-10-05T15:00:00')).estado).toBe('ok');
    expect(apresentarLicenca({ estado: 'ok' }, brt('2026-10-05T15:00:00')).estado).toBe('ok');
    expect(apresentarLicenca({ estado: 'zzz' as LicencaRpc['estado'] }, brt('2026-10-05T15:00:00')).estado).toBe('ok');
    expect(fmtReais(12_345)).toBe('R$ 123,45');
    expect(qrSrc('data:image/png;base64,abc')).toBe('data:image/png;base64,abc'); // já veio com prefixo: passa reto
    expect(qrSrc('')).toBeNull();
  });
});
