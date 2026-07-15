import { describe, it, expect } from 'vitest';
import { classificarEntrega, eventoDoStatus, type EstadoEntrega } from '../../supabase/functions/evolution-webhook/entrega';

const ok: EstadoEntrega = { status: 'ok', erros: 0 };
const desconhecido: EstadoEntrega = { status: 'desconhecido', erros: 0 };

describe('classificarEntrega — ERROR', () => {
  it('ERROR sem stub → restrito + incrementa + marca erro', () => {
    expect(classificarEntrega({ kind: 'error', temStub: false }, ok))
      .toEqual({ entrega_status: 'restrito', entrega_erros_recentes: 1, marcarErroEm: true });
  });
  it('ERROR com stub → instavel + incrementa', () => {
    expect(classificarEntrega({ kind: 'error', temStub: true }, desconhecido))
      .toEqual({ entrega_status: 'instavel', entrega_erros_recentes: 1, marcarErroEm: true });
  });
  it('ERROR com stub NÃO rebaixa um restrito já detectado', () => {
    const r = classificarEntrega({ kind: 'error', temStub: true }, { status: 'restrito', erros: 2 });
    expect(r?.entrega_status).toBe('restrito');
    expect(r?.entrega_erros_recentes).toBe(3);
  });
  it('acumula o contador a cada ERROR', () => {
    expect(classificarEntrega({ kind: 'error', temStub: false }, { status: 'restrito', erros: 5 })?.entrega_erros_recentes).toBe(6);
  });
});

describe('classificarEntrega — recuperação por entrega real', () => {
  it('DELIVERY_ACK externo recupera restrito → ok e zera', () => {
    expect(classificarEntrega({ kind: 'delivered', externo: true }, { status: 'restrito', erros: 4 }))
      .toEqual({ entrega_status: 'ok', entrega_erros_recentes: 0, marcarErroEm: false });
  });
  it('READ externo também recupera instavel', () => {
    expect(classificarEntrega({ kind: 'read', externo: true }, { status: 'instavel', erros: 2 })?.entrega_status).toBe('ok');
  });
  it('self-send (não externo) NÃO recupera — retorna null', () => {
    expect(classificarEntrega({ kind: 'delivered', externo: false }, { status: 'restrito', erros: 3 })).toBeNull();
    expect(classificarEntrega({ kind: 'read', externo: false }, { status: 'instavel', erros: 1 })).toBeNull();
  });
  it('entrega externa quando já ok e sem erros → nada muda (null)', () => {
    expect(classificarEntrega({ kind: 'delivered', externo: true }, ok)).toBeNull();
  });
  it('entrega externa quando ok mas com erros pendentes → limpa', () => {
    expect(classificarEntrega({ kind: 'delivered', externo: true }, { status: 'ok', erros: 2 })?.entrega_erros_recentes).toBe(0);
  });
});

describe('eventoDoStatus — mapeamento do provedor', () => {
  it('ERROR', () => expect(eventoDoStatus('ERROR', false, true)).toEqual({ kind: 'error', temStub: false }));
  it('DELIVERY_ACK', () => expect(eventoDoStatus('DELIVERY_ACK', false, true)).toEqual({ kind: 'delivered', externo: true }));
  it('READ e PLAYED viram read', () => {
    expect(eventoDoStatus('READ', false, true)?.kind).toBe('read');
    expect(eventoDoStatus('PLAYED', false, false)?.kind).toBe('read');
  });
  it('PENDING/SERVER_ACK = aceitação, não entrega → null', () => {
    expect(eventoDoStatus('PENDING', false, true)).toBeNull();
    expect(eventoDoStatus('SERVER_ACK', false, true)).toBeNull();
  });
});
