import { describe, it, expect } from 'vitest';
import {
  validarNome, validarCpfDigits, extrairCpf, mascararCpf, parseBeneficio, parseAgibankBmg,
  parseBanco, parsePreferencia, calcularDelays, avaliarLeadQuente, decideProximo, montarResumo,
  primeiroNome, DEFAULT_COPY,
} from '../../supabase/functions/bot-runner/fluxo';

// CPF válido de teste (gerado pelo algoritmo): 529.982.247-25
const CPF_OK = '52998224725';

describe('validarNome', () => {
  it('aceita nome completo plausível', () => {
    expect(validarNome('João da Silva')).toBe(true);
    expect(validarNome('Maria Aparecida Souza')).toBe(true);
  });
  it('rejeita nome único, com dígitos ou palavras-chave', () => {
    expect(validarNome('João')).toBe(false);
    expect(validarNome('João 123')).toBe(false);
    expect(validarNome('agibank')).toBe(false);
    expect(validarNome('nao sei')).toBe(false);
    expect(validarNome('')).toBe(false);
  });
});

describe('CPF', () => {
  it('valida dígito verificador', () => {
    expect(validarCpfDigits(CPF_OK)).toBe(true);
    expect(validarCpfDigits('11111111111')).toBe(false);
    expect(validarCpfDigits('12345678900')).toBe(false);
    expect(validarCpfDigits('123')).toBe(false);
  });
  it('extrai de texto sujo e mascara sem expor dígitos', () => {
    const r = extrairCpf('meu cpf é 529.982.247-25 ok?');
    expect(r.valido).toBe(true);
    expect(r.digits).toBe(CPF_OK);
    expect(r.mascarado).toBe('***.***.***-25');
    expect(r.mascarado).not.toContain('529');
  });
  it('mascara nunca revela os 9 primeiros dígitos', () => {
    expect(mascararCpf(CPF_OK)).toBe('***.***.***-25');
    expect(mascararCpf('123')).toBe('—');
  });
});

describe('parsers de resposta', () => {
  it('benefício', () => {
    expect(parseBeneficio('sou aposentado')).toBe('aposentadoria');
    expect(parseBeneficio('pensionista')).toBe('pensao');
    expect(parseBeneficio('recebo do INSS')).toBe('inss');
    expect(parseBeneficio('não recebo nada')).toBe('nao');
  });
  it('agibank/bmg', () => {
    expect(parseAgibankBmg('tenho no agibank')).toBe('agibank');
    expect(parseAgibankBmg('BMG')).toBe('bmg');
    expect(parseAgibankBmg('os dois')).toBe('ambos');
    expect(parseAgibankBmg('agibank e bmg')).toBe('ambos');
    expect(parseAgibankBmg('não sei')).toBe('nao_sei');
  });
  it('banco', () => {
    expect(parseBanco('recebo na Caixa')).toBe('caixa');
    expect(parseBanco('Banco do Brasil')).toBe('banco do brasil');
    expect(parseBanco('num banco qualquer xyz')).toContain('banco');
  });
  it('preferência + horário', () => {
    expect(parsePreferencia('pode ligar').preferencia).toBe('ligacao');
    expect(parsePreferencia('prefiro mensagem').preferencia).toBe('mensagem');
    expect(parsePreferencia('pode ligar às 14h').horario).toBeTruthy();
  });
});

describe('calcularDelays', () => {
  it('primeira imediata, demais dentro do range', () => {
    const rng = () => 0.5;
    const d = calcularDelays(4, 1800, 3500, rng);
    expect(d).toHaveLength(4);
    expect(d[0]).toBe(0);
    for (let i = 1; i < d.length; i++) { expect(d[i]).toBeGreaterThanOrEqual(1800); expect(d[i]).toBeLessThanOrEqual(3500); }
  });
});

describe('avaliarLeadQuente', () => {
  it('detecta critérios', () => {
    const m = avaliarLeadQuente({ nome_completo: 'X Y', cpf_mascarado: '***.***.***-25', agibank_bmg: 'ambos', preferencia: 'ligacao' }, 'quero saber quanto dá pra liberar agora');
    expect(m).toContain('nome_e_cpf');
    expect(m).toContain('citou_agibank');
    expect(m).toContain('citou_bmg');
    expect(m).toContain('quer_ligacao');
    expect(m).toContain('perguntou_liberar');
    expect(m).toContain('atendimento_imediato');
  });
});

describe('decideProximo — máquina de estados', () => {
  it('inicio dispara abertura sem inbound', () => {
    const d = decideProximo('inicio', '');
    expect(d.needsInbound).toBe(false);
    expect(d.copyKey).toBe('abertura');
    expect(d.proximaEtapa).toBe('aguardando_beneficio');
  });
  it('fluxo feliz completo', () => {
    expect(decideProximo('aguardando_beneficio', 'aposentado').proximaEtapa).toBe('aguardando_agibank_bmg');
    expect(decideProximo('aguardando_agibank_bmg', 'os dois').proximaEtapa).toBe('aguardando_banco');
    expect(decideProximo('aguardando_banco', 'Caixa').proximaEtapa).toBe('aguardando_nome');
    const nome = decideProximo('aguardando_nome', 'João da Silva');
    expect(nome.acoes.coletarNome).toBe('João da Silva');
    expect(nome.proximaEtapa).toBe('aguardando_cpf');
    const cpf = decideProximo('aguardando_cpf', CPF_OK);
    expect(cpf.acoes.coletarCpf?.digits).toBe(CPF_OK);
    expect(cpf.proximaEtapa).toBe('aguardando_preferencia');
    const pref = decideProximo('aguardando_preferencia', 'pode ligar agora');
    expect(pref.concluir).toBe(true);
    expect(pref.proximaEtapa).toBe('concluido');
  });
  it('nome/CPF inválidos pedem reprompt', () => {
    expect(decideProximo('aguardando_nome', 'João').valid).toBe(false);
    expect(decideProximo('aguardando_nome', 'João').reprompt).toBe('nome');
    expect(decideProximo('aguardando_cpf', '123').valid).toBe(false);
    expect(decideProximo('aguardando_cpf', '123').reprompt).toBe('cpf');
  });
});

describe('montarResumo', () => {
  it('inclui todos os campos e NUNCA o CPF completo', () => {
    const { texto, json } = montarResumo({
      dados: { nome_completo: 'João da Silva', cpf_mascarado: '***.***.***-25', beneficio: 'aposentadoria', agibank_bmg: 'ambos', banco: 'caixa', preferencia: 'ligacao', horario: '14h' },
      canalNome: 'LUIZA', origem: 'trafego', etapa: 'concluido', leadQuente: true, leadQuenteMotivos: ['nome_e_cpf', 'quer_ligacao'],
    });
    expect(texto).toContain('João da Silva');
    expect(texto).toContain('***.***.***-25');
    expect(texto).not.toContain('52998224725');
    expect(texto).toContain('LUIZA');
    expect(texto).toContain('Prioridade: ALTA');
    expect(json.cpf_mascarado).toBe('***.***.***-25');
  });
});

describe('copy default', () => {
  it('abertura tem 5 mensagens curtas separadas', () => {
    expect(DEFAULT_COPY.abertura).toHaveLength(5);
    expect(primeiroNome('João da Silva')).toBe('João');
  });
});
