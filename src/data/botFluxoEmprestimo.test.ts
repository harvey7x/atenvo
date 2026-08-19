import { describe, it, expect } from 'vitest';
import {
  proximoPassoVideo, DEFAULT_COPY_VIDEO, type CopyVideo, type EntradaVideo,
} from '../../supabase/functions/bot-runner/fluxo_video';
import { DEFAULT_COPY_EMPRESTIMO, montarCopyEmprestimo } from '../../supabase/functions/bot-runner/fluxo_emprestimo';

// Fluxo caf_emprestimo_v1 — MESMO motor do vídeo (fluxo_video.ts), copy e mídia próprias.
// Aqui testamos o que é DESTE fluxo: a abertura com IMAGEM (saudação na legenda) e o ack que
// promete o analista. O trilho (SIM/NÃO, nome, CPF, reprompts, áudio) já é coberto por
// botFluxoVideo.test.ts — é literalmente o mesmo código.
const digitou = (texto: string): EntradaVideo => ({ texto, ehAudio: false });

// No ar a URL vem do jsonb do canal (bucket bot-midia)
const COPY: CopyVideo = { ...DEFAULT_COPY_EMPRESTIMO, midia_url: 'https://exemplo.test/emprestimo.png' };
const CPF_OK = '52998224725';   // 529.982.247-25, DV confere

describe('abertura do fluxo de empréstimo — IMAGEM com a saudação na legenda', () => {
  it('3 saídas: IMAGEM (legenda literal do dono), pergunta da análise, SIM/NÃO', () => {
    const r = proximoPassoVideo(null, digitou('oi'), 0, 0, {}, COPY);
    if (r.acao !== 'enviar') throw new Error('esperava enviar');
    expect(r.telas).toHaveLength(3);
    expect(r.telas[0]).toEqual({ tipo: 'imagem', url: COPY.midia_url, caption: 'Olá! Seja bem-vindo(a) à CAF!' });
    expect(r.telas[1]).toEqual({ tipo: 'texto', corpo: 'Gostaria de fazer uma análise pra ver se é liberado algum valor' });
    expect(r.telas[2]).toEqual({ tipo: 'texto', corpo: 'Responda *SIM* ou *NÃO* 😊' });
    expect(r.passoNovo).toBe('aguardando_sim_nao');
  });

  it('a saudação NÃO sai também como balão de texto (ela é só a legenda)', () => {
    const r = proximoPassoVideo(null, digitou('oi'), 0, 0, {}, COPY);
    if (r.acao !== 'enviar') throw new Error('esperava enviar');
    expect(DEFAULT_COPY_EMPRESTIMO.abertura).toEqual([]);
    expect(r.telas.filter((t) => t.tipo === 'texto' && t.corpo.includes('bem-vindo'))).toHaveLength(0);
  });

  it('imagem que não subiu: a legenda sai como TEXTO e o funil continua (nunca fica mudo)', () => {
    const r = proximoPassoVideo(null, digitou('oi'), 0, 0, {}, DEFAULT_COPY_EMPRESTIMO);
    if (r.acao !== 'enviar') throw new Error('esperava enviar');
    expect(r.telas).toHaveLength(3);
    expect(r.telas[0]).toEqual({ tipo: 'texto', corpo: 'Olá! Seja bem-vindo(a) à CAF!' });
    expect(r.telas.every((t) => t.tipo === 'texto')).toBe(true);
  });
});

describe('trilho até o fecho — nome, CPF e a promessa do analista', () => {
  it('SIM → pede o nome completo (2 balões)', () => {
    const r = proximoPassoVideo('aguardando_sim_nao', digitou('SIM'), 0, 0, {}, COPY);
    if (r.acao !== 'enviar') throw new Error('esperava enviar');
    expect(r.telas).toEqual([
      { tipo: 'texto', corpo: 'Ótima decisão! 👏' },
      { tipo: 'texto', corpo: 'Para iniciarmos sua análise, me informe seu nome completo:' },
    ]);
    expect(r.passoNovo).toBe('aguardando_nome');
  });

  it('nome válido → salva e pede o CPF (linha de sigilo CURTA, correção do dono)', () => {
    const r = proximoPassoVideo('aguardando_nome', digitou('Maria Aparecida Souza'), 0, 0, {}, COPY);
    if (r.acao !== 'enviar') throw new Error('esperava enviar');
    expect(r.acoes?.salvarNome).toBe('Maria Aparecida Souza');
    expect(r.telas).toEqual([
      { tipo: 'texto', corpo: 'Poderia me informar seu *CPF*?' },
      { tipo: 'texto', corpo: '🔒 Seus dados são usados somente para a consulta.' },
    ]);
    expect(r.passoNovo).toBe('aguardando_cpf');
  });

  it('CPF válido → ack com o analista + fecho imediato (concluirAnalise) e fim', () => {
    const r = proximoPassoVideo('aguardando_cpf', digitou('529.982.247-25'), 0, 0, { nome_completo: 'Maria Aparecida Souza' }, COPY);
    if (r.acao !== 'enviar') throw new Error('esperava enviar');
    expect(r.telas).toEqual([
      { tipo: 'texto', corpo: '✅ Recebido, Maria!' },
      { tipo: 'texto', corpo: 'Em instantes um analista vai falar com você aqui mesmo.' },
    ]);
    expect(r.acoes?.salvarCpf).toEqual({ digits: CPF_OK, mascarado: '***.***.***-25' });
    expect(r.acoes?.concluirAnalise).toBe(true);
    expect(r.passoNovo).toBe('fim');
  });
});

describe('montarCopyEmprestimo — jsonb do canal sobre o default do EMPRÉSTIMO', () => {
  it('sem config, cai no default do empréstimo (não no do vídeo)', () => {
    const c = montarCopyEmprestimo(undefined);
    expect(c).toEqual(DEFAULT_COPY_EMPRESTIMO);
    expect(c.midia_tipo).toBe('imagem');
    expect(c.ack_cpf[1]).toContain('analista');
  });

  it('jsonb parcial sobrepõe só o que veio (a URL da imagem, por exemplo)', () => {
    const c = montarCopyEmprestimo({ midia_url: 'https://x.test/i.png' });
    expect(c.midia_url).toBe('https://x.test/i.png');
    expect(c.midia_caption).toBe('Olá! Seja bem-vindo(a) à CAF!');
    expect(c.pergunta_analise).toEqual(DEFAULT_COPY_EMPRESTIMO.pergunta_analise);
  });

  it('os dois fluxos não se contaminam: o default do vídeo segue vídeo', () => {
    expect(DEFAULT_COPY_VIDEO.midia_tipo).toBe('video');
    expect(DEFAULT_COPY_VIDEO.abertura).toEqual(['Olá! Seja bem-vindo(a) à CAF! 👋']);
    expect(DEFAULT_COPY_VIDEO.ack_cpf[1]).not.toContain('analista');
    // o encurtamento da linha de sigilo foi SÓ no empréstimo — o vídeo mantém a frase longa
    expect(DEFAULT_COPY_VIDEO.pede_cpf[1]).toContain('Nunca pedimos senhas');
    expect(DEFAULT_COPY_EMPRESTIMO.pede_cpf[1]).not.toContain('Nunca pedimos senhas');
  });
});
