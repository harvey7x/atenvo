// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({ supabase: null, isSupabaseConfigured: false }));
vi.mock('@/context/OrgContext', () => ({ useOrg: () => ({ currentOrg: { id: 'o' } }) }));

const {
  mencaoEmCurso, filtrarMembros, inserirMencao, temMencao, mencoesDoTexto, partesDaNota, validarNota, traduzErroNota,
  juntarNomes, mesclarNotas, notaParaOFio, NOTA_MAX,
} = await import('./notasInternas');

const EQUIPE = [
  { id: 'a', nome: 'Alessandra' }, { id: 'b', nome: 'Ana Paula Souza' }, { id: 'c', nome: 'João Batista' },
  { id: 'd', nome: 'Carla' }, { id: 'e', nome: 'Ana' }, { id: 'f', nome: 'Mariana' },
];

describe('nota interna: o @ que está sendo digitado', () => {
  it('acha o @ no começo, depois de espaço e depois de parêntese', () => {
    expect(mencaoEmCurso('@', 1)).toEqual({ inicio: 0, termo: '' });
    expect(mencaoEmCurso('ligar amanhã @Ale', 17)).toEqual({ inicio: 13, termo: 'Ale' });
    expect(mencaoEmCurso('(@ca', 4)).toEqual({ inicio: 1, termo: 'ca' });
  });
  it('olha só até o cursor', () => {
    expect(mencaoEmCurso('@Alessandra conferir', 4)).toEqual({ inicio: 0, termo: 'Ale' });
    expect(mencaoEmCurso('@Alessandra conferir', 20)).toBeNull();
  });
  it('e-mail, espaço depois do nome e texto sem @ não abrem a lista', () => {
    expect(mencaoEmCurso('ana@reviza.com', 14)).toBeNull();
    expect(mencaoEmCurso('@Ana ', 5)).toBeNull();
    expect(mencaoEmCurso('sem marcação', 12)).toBeNull();
    expect(mencaoEmCurso('', 0)).toBeNull();
  });
});

describe('nota interna: a lista da equipe', () => {
  it('quem começa com o termo vem antes de quem só tem um sobrenome com ele', () => {
    expect(filtrarMembros(EQUIPE, 'ana').map((m) => m.nome)).toEqual(['Ana', 'Ana Paula Souza', 'Mariana']);
    expect(filtrarMembros(EQUIPE, 'sou').map((m) => m.nome)).toEqual(['Ana Paula Souza']);
  });
  it('sem diferença de acento nem de maiúscula', () => {
    expect(filtrarMembros(EQUIPE, 'JOA').map((m) => m.id)).toEqual(['c']);
    expect(filtrarMembros(EQUIPE, 'ale').map((m) => m.id)).toEqual(['a']);
  });
  it('termo vazio mostra todos em ordem alfabética, até o limite', () => {
    expect(filtrarMembros(EQUIPE, '', 3).map((m) => m.nome)).toEqual(['Alessandra', 'Ana', 'Ana Paula Souza']);
    expect(filtrarMembros(EQUIPE, 'xyz')).toEqual([]);
  });
});

describe('nota interna: inserir e reconhecer @Nome', () => {
  it('troca o "@termo" por "@Nome " e põe o cursor depois', () => {
    expect(inserirMencao('ver com @Ale', 8, 12, 'Alessandra')).toEqual({ texto: 'ver com @Alessandra ', cursor: 20 });
    // no meio da frase: troca a palavra inteira e não dobra o espaço
    expect(inserirMencao('@Al amanhã', 0, 3, 'Alessandra')).toEqual({ texto: '@Alessandra amanhã', cursor: 12 });
    expect(inserirMencao('oi @Ca|rla', 3, 6, 'Carla').texto).toBe('oi @Carla ');
  });
  it('"@Ana" não marca a "Anabela" e aceita nome com espaço', () => {
    expect(temMencao('falar com @Anabela', 'Ana')).toBe(false);
    expect(temMencao('falar com @Ana, ok', 'Ana')).toBe(true);
    expect(temMencao('@ana paula souza vê isso', 'Ana Paula Souza')).toBe(true);
    expect(temMencao('sem ninguém', 'Ana')).toBe(false);
  });
  it('só fica marcado quem foi escolhido E continua no texto, sem repetir', () => {
    const escolhidos = [EQUIPE[0], EQUIPE[3], EQUIPE[0]];
    expect(mencoesDoTexto('@Alessandra e @Carla conferem', escolhidos)).toEqual(['a', 'd']);
    expect(mencoesDoTexto('@Alessandra confere', escolhidos)).toEqual(['a']);   // apagou a Carla
    expect(mencoesDoTexto('@Carla', [])).toEqual([]);                          // digitou sem escolher na lista
  });
});

describe('nota interna: marcações em destaque no texto', () => {
  it('separa as marcações, com o nome mais longo primeiro', () => {
    expect(partesDaNota('@Ana Paula Souza e @Ana: ligar', ['Ana', 'Ana Paula Souza'])).toEqual([
      { t: '@Ana Paula Souza', mencao: true }, { t: ' e ', mencao: false }, { t: '@Ana', mencao: true }, { t: ': ligar', mencao: false },
    ]);
  });
  it('sem marcados o texto fica inteiro; "@" solto não vira destaque', () => {
    expect(partesDaNota('mandar @ amanhã', [])).toEqual([{ t: 'mandar @ amanhã', mencao: false }]);
    expect(partesDaNota('falar com @Anabela', ['Ana'])).toEqual([{ t: 'falar com @Anabela', mencao: false }]);
    expect(partesDaNota('', ['Ana'])).toEqual([]);
  });
  it('nome com caractere especial não quebra a busca', () => {
    expect(partesDaNota('@C. (adm) viu', ['C. (adm)'])[0]).toEqual({ t: '@C. (adm)', mencao: true });
  });
});

describe('nota interna: tamanho, erros e o fio', () => {
  it('vazia e longa demais não salvam', () => {
    expect(validarNota('   ')).toMatch(/Escreva a nota/);
    expect(validarNota('a'.repeat(NOTA_MAX))).toBeNull();
    expect(validarNota('a'.repeat(NOTA_MAX + 1))).toMatch(/limite/);
  });
  it('erro do servidor vira frase simples', () => {
    expect(traduzErroNota('sem_permissao')).toMatch(/não tem acesso/);
    expect(traduzErroNota('Could not find the function public.atd_nota_criar')).toMatch(/ainda não foi ligada/);
    expect(traduzErroNota('qualquer coisa')).toMatch(/Tente de novo/);
  });
  it('junta nomes para o aviso', () => {
    expect(juntarNomes(['Carla'])).toBe('Carla');
    expect(juntarNomes(['Carla', 'Paty'])).toBe('Carla e Paty');
    expect(juntarNomes(['Carla', 'Paty', 'Bianca'])).toBe('Carla, Paty e Bianca');
  });
  it('a nota local entra na ordem do horário e sai quando o servidor a traz', () => {
    const msg = (id: string, iso: string) => ({ id, dir: 'in' as const, text: id, time: '', tsISO: iso });
    const fio = [msg('m1', '2026-11-25T10:00:00Z'), msg('m2', '2026-11-25T10:10:00Z')];
    const nota = notaParaOFio({ id: 'n1', texto: '@Carla ver', autorNome: 'Matheus', mencionados: [EQUIPE[3]], em: new Date('2026-11-25T10:05:00Z') });
    expect(nota).toMatchObject({ tipo: 'nota_interna', dir: 'out', nota: { autorNome: 'Matheus', mencoesNomes: ['Carla'], automatica: false } });
    expect(mesclarNotas(fio, [nota]).map((m) => m.id)).toEqual(['m1', 'n1', 'm2']);
    expect(mesclarNotas([...fio, { ...nota }], [nota]).map((m) => m.id)).toEqual(['m1', 'm2', 'n1']);   // já veio do servidor: não duplica
    expect(mesclarNotas(fio, [])).toBe(fio);
  });
});
