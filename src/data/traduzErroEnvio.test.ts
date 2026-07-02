import { describe, it, expect } from 'vitest';
import { traduzErroEnvio } from './scripts';

// Mensagens da bolha/modal de falha do envio WhatsApp (fonte única). Cada causa conhecida tem texto próprio;
// nunca o genérico. Baseado no incidente real (SERGIO RICARDO/RMKT): erro cru "ERROR" = entrega recusada.
describe('traduzErroEnvio', () => {
  it('vazio → mensagem neutra', () => {
    expect(traduzErroEnvio('')).toMatch(/não pôde ser enviada/i);
    expect(traduzErroEnvio(null)).toMatch(/não pôde ser enviada/i);
  });

  it('ERROR (WhatsApp recusou a entrega após aceitar) → mensagem específica, não genérica', () => {
    const msg = traduzErroEnvio('ERROR');
    expect(msg).toMatch(/recusou a entrega/i);
    expect(msg).toMatch(/WhatsApp ativo/i);
    expect(msg).not.toMatch(/verifique a conexão e o número/i); // não é o genérico antigo
  });

  it('ERROR com stub anexado (ERROR:algum_stub) também cai na entrega recusada', () => {
    expect(traduzErroEnvio('ERROR:messageStubType')).toMatch(/recusou a entrega/i);
  });

  it('sem_id_externo (conexão não aceitou / sem key.id) → "a mensagem não saiu"', () => {
    expect(traduzErroEnvio('sem_id_externo')).toMatch(/não saiu/i);
  });

  it('timeout / sem confirmação a tempo → não afirma falha, pede para conferir', () => {
    expect(traduzErroEnvio('Sem confirmação de envio a tempo. Tente novamente.')).toMatch(/demorou mais que o esperado/i);
    expect(traduzErroEnvio('timeout')).toMatch(/demorou/i);
  });

  it('desconectado / close → reconectar em Integrações', () => {
    expect(traduzErroEnvio('CLOSE')).toMatch(/desconectado/i);
    expect(traduzErroEnvio('not connected')).toMatch(/Reconecte/i);
  });

  it('número inválido → confira DDD/nono dígito', () => {
    expect(traduzErroEnvio('numero invalido')).toMatch(/DDD/i);
  });

  it('instância → reconectar à instância correta', () => {
    expect(traduzErroEnvio('instância indisponível')).toMatch(/instância correta/i);
  });

  it('janela 24h Messenger', () => {
    expect(traduzErroEnvio('(#10) fora do espaço de tempo')).toMatch(/24h/i);
  });

  it('rate limit → tentar novamente em alguns minutos', () => {
    expect(traduzErroEnvio('rate limit 429')).toMatch(/Limite temporário/i);
  });

  it('a entrega recusada é distinta da conexão não confirmada', () => {
    expect(traduzErroEnvio('ERROR')).not.toBe(traduzErroEnvio('sem_id_externo'));
  });
});
