import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { normalizarSinaisV5 } from '@/data/dashboardV5.sinais';
import {
  aprox, aproxClientes, aproxDe, estadoNumero, hhmmDoMinuto, juntarLacunas, LIMIARES_V5, minEntre, montarLeituraV5, nomeCurto, qtd, quandoTxt, selecionar, trechoTxt,
} from '@/data/dashboardV5.inteligencia';
import { demoSinaisV5, FERIADOS_DEMO } from '@/data/dashboardV5.sinais.demo';
import { demoDashV5 } from '@/data/dashboardV5.demo';
import { duracaoTxt } from '@/data/dashboardV5.inteligencia';
import { fmtDec, fmtInt, fmtPct } from '@/data/dashboardV5.formato';
import type {
  AchadoV5, EquipeSinaisV5, LeituraV5, LoteNeV5, NumeroSinaisV5, PessoaSinaisV5, QuedaV5, SemanaFechV5, SinaisV5,
} from '@/data/dashboardV5.sinais.tipos';
import type { PresetDash } from '@/data/dashboard';

/* Leitura do dia: o motor contra MOMENTOS REAIS do banco (payloads de dashboard_v5_sinais
   tirados em produção com replay dentro de begin … rollback — src/data/__fixtures__/sinaisV5,
   regerados em 22/10 com a migration corrigida) e contra os limites de cada regra. O
   backtest de 15 em 15 min (9 dias, 864 momentos) está descrito no commit. */

const SP = (s: string) => new Date(`${s}-03:00`);
const FIX = join(__dirname, '__fixtures__', 'sinaisV5');
const EMP = 'e85ab4e4-931e-4da9-932b-30541f9e007b';
const JUR = 'fc80ec9e-9f8f-4dca-a3f0-e1101d73e117';
const LUIZ = 'd189e143-6cab-49c0-98d3-b030453a3c86';
const MATHEUS = '4ac197b4-9600-4756-81aa-1ac29280df09';

function bruto(nome: string): unknown { return JSON.parse(readFileSync(join(FIX, `${nome}.json`), 'utf8')); }
function real(nome: string): SinaisV5 { return normalizarSinaisV5(bruto(nome)); }
const presetDe = (f: string): PresetDash => (f.includes('-7d') ? '7d' : f.includes('-mes') ? 'mes_caf' : 'hoje');
function ler(s: SinaisV5, preset: PresetDash = 'hoje', admin = true): LeituraV5 {
  return montarLeituraV5(s, { agora: new Date(s.agora), preset, admin });
}
const ids = (l: LeituraV5) => l.achados.map((a) => a.id);
const achado = (l: LeituraV5, id: string): AchadoV5 => {
  const a = l.achados.find((x) => x.id === id);
  if (!a) throw new Error(`sem achado ${id}: ${ids(l).join(', ')}`);
  return a;
};
const textos = (l: LeituraV5) => [
  ...l.achados.flatMap((a) => [a.titulo, a.frase, a.acao?.texto ?? '', a.acao?.link?.rotulo ?? '']),
  ...l.notas.map((n) => n.texto), l.rodape, l.vazio?.motivo ?? '',
];

/* ====================================================================== */
/* Momentos reais                                                          */
/* ====================================================================== */
describe('momentos reais (produção, replay)', () => {
  it('14/10 08:30 — EMPRESTIMO parado; a conexão voltou SÓ EM PARTE (2 de ~4 mensagens), nada mais', () => {
    const l = ler(real('2026-10-14-0830-hoje'));
    expect(ids(l)).toEqual([`numero_parado:${EMP}`]);
    const a = achado(l, `numero_parado:${EMP}`);
    expect(a.titulo).toBe('EMPRESTIMO sem cliente novo desde ontem 21:17');
    expect(a.frase).toBe('Nesse tempo costumam chegar cerca de 13 clientes. A conexão voltou só em parte: 2 de cerca de 4 mensagens desde 08:18.');
    expect(a.acao?.link).toEqual({ rotulo: 'Reconectar em Integrações', rota: '/integracoes' });
    expect(a.acao?.texto).toBeNull();
    expect(l.marcadores.numeros[EMP]?.tom).toBe('ambar');
    // a marca da tabela conta pelo minuto que o título mostra: 08:30 − 21:17 = 11 h 13 (os
    // segundos da última entrada não viram "11 h 12" ao lado de "desde ontem 21:17")
    expect(l.marcadores.numeros[EMP]?.texto).toBe('sem cliente novo há 11 h 13');
  });

  it('14/10 10:00 — um cliente solto às 09:40 NÃO encerra a queda: o mesmo incidente segue (sem "voltou")', () => {
    const l = ler(real('2026-10-14-1000-hoje'));
    expect(ids(l)).toEqual([`numero_parado:${EMP}`]);
    const a = achado(l, `numero_parado:${EMP}`);
    expect(a.titulo).toBe('EMPRESTIMO quase sem cliente novo desde ontem 21:17');
    expect(a.frase).toContain('Só 1 cliente desde então (normal: cerca de 18).');
    expect(a.frase).toContain('A conexão voltou só em parte');
  });

  it('14/10 11:00 — o título não muda dentro do incidente; 12:30 — agora sim "voltou" (≥ 3 entradas)', () => {
    expect(achado(ler(real('2026-10-14-1100-hoje')), `numero_parado:${EMP}`).titulo).toBe('EMPRESTIMO quase sem cliente novo desde ontem 21:17');
    const l = ler(real('2026-10-14-1230-hoje'));
    expect(ids(l)).toEqual([`queda_encerrada:${EMP}`]);
    expect(achado(l, `queda_encerrada:${EMP}`).frase).toBe('De ontem 21:17 a 11:18 chegou 1 cliente; o normal seria cerca de 27.');
    // a queda de hoje segura o ritmo: "entradas abaixo do normal… veja o anúncio" culparia o anúncio pelo chip
    expect(l.achados.some((x) => x.tipo === 'ritmo_dia')).toBe(false);
    // o lote do Matheus às 12:02: 58 dos 59 com data antiga (não "todos")
    expect(l.notas.map((n) => n.texto)).toContain(
      'Às 12:02 de 14/10, 59 não elegíveis foram marcados de uma vez por Matheus (58 com data antiga, de 12/08 a 12/10). Eles contam nos dias dessas datas e no total de Matheus.');
  });

  it('04/10 15:00 — o falso "as conversas voltaram": 4 de ~29 mensagens desde 13:32 é volta parcial', () => {
    const l = ler(real('2026-10-04-1500-hoje'));
    const a = achado(l, `numero_parado:${EMP}`);
    expect(a.frase).not.toContain('voltaram');
    expect(a.frase).toContain('A conexão voltou só em parte: 4 de cerca de 29 mensagens desde 13:32.');
    expect(a.acao?.link?.rota).toBe('/integracoes');
  });

  it('19/10 11:00 — JUROS parado desde sáb (volta parcial, não "voltou"), semana boa (segunda) e a manhã do Luiz (recorrente)', () => {
    const l = ler(real('2026-10-19-1100-hoje'));
    expect(ids(l)).toEqual([`numero_parado:${JUR}`, 'fechamentos_semana:alta', `atendente_atrasado:${LUIZ}`]);
    const j = achado(l, `numero_parado:${JUR}`);
    expect(j.titulo).toBe('JUROS ABUSIVO (ANDRIUS) sem cliente novo desde sáb 22:29');
    expect(j.frase).toBe('Nesse tempo costumam chegar cerca de 30 clientes. A conexão voltou só em parte: 12 de cerca de 55 mensagens desde ontem 20:32.');
    const z = achado(l, `atendente_atrasado:${LUIZ}`);
    expect(z.severidade).toBe('info');           // ainda não começou e costuma começar às 13:31
    expect(z.soAdmin).toBe(true);
    expect(z.titulo).toBe('7 leads de Luiz esperam a primeira mensagem');
    expect(z.frase).toBe('Ninguém escreveu há mais de 2 horas de expediente (normal de Luiz a esta hora: cerca de 1 lead esperando). Luiz costuma começar por volta das 13:31.');
    expect(l.marcadores.atendentes[LUIZ]?.texto).toBe('7 esperam 1ª mensagem');
  });

  it('19/10 11:00 sem ser admin — o cartão da pessoa some (e a marca também)', () => {
    const l = ler(real('2026-10-19-1100-hoje'), 'hoje', false);
    expect(ids(l)).toEqual([`numero_parado:${JUR}`, 'fechamentos_semana:alta']);
    expect(l.marcadores.atendentes).toEqual({});
  });

  it('19/10 15:00 — equipe lenta e o JUROS ainda fraco depois da volta de 12:41 (1 cliente em ~2 h)', () => {
    const l = ler(real('2026-10-19-1500-hoje'));
    expect(ids(l)).toEqual([`numero_parado:${JUR}`, 'equipe_lenta:resposta', 'fechamentos_semana:alta']);
    const e = achado(l, 'equipe_lenta:resposta');
    expect(e.titulo).toBe('Equipe respondendo mais devagar hoje: 14 min');
    expect(e.frase).toContain('Metade das 102 respostas de hoje levou mais de 14 min (o normal a esta hora é 4 min).');
    expect(achado(l, `numero_parado:${JUR}`).titulo).toBe('JUROS ABUSIVO (ANDRIUS) quase sem cliente novo desde sáb 22:29');
  });

  it('13/10 11:00 — JUROS com a conexão de volta de verdade (D2), a fila da equipe e a IA que ficou parada desde 20:29', () => {
    const l = ler(real('2026-10-13-1100-hoje'));
    expect(ids(l)).toEqual([`numero_parado:${JUR}`, 'equipe_lenta:fila', 'ia_parada:resolvida']);
    expect(achado(l, `numero_parado:${JUR}`).frase).toBe('Nesse tempo costumam chegar cerca de 20 clientes. As conversas voltaram às 06:15, mas cliente novo ainda não.');
    expect(achado(l, 'equipe_lenta:fila').titulo).toBe('60 leads esperam a primeira mensagem da equipe');
    // o normal diz O QUE conta (leads esperando), como o título
    expect(achado(l, 'equipe_lenta:fila').frase).toBe('Ninguém escreveu há mais de 2 horas de expediente (normal a esta hora: cerca de 34 leads esperando). Juliana 28, Matheus 27, Luiz 3 e Isadora 2.');
    const ia = achado(l, 'ia_parada:resolvida');
    expect(ia.severidade).toBe('info');
    // uma resposta solta às 21:25 não parte a parada em duas: começa às 20:29, 109 falhas
    expect(ia.titulo).toBe('A IA ficou parada de ontem 20:29 a 09:22');
    expect(ia.frase).toBe('Sem crédito do Gemini: 109 falhas e 22 conversas esperaram a IA nesse tempo.');
  });

  it('13/10 03:00 — madrugada quieta: o crédito segue zerado e o aviso NÃO some', () => {
    const l = ler(real('2026-10-13-0300-hoje'));
    const ia = achado(l, 'ia_parada:credito');
    expect(ia.severidade).toBe('atencao');
    expect(ia.frase).toBe('Desde ontem 20:29, 64 tentativas falharam; ninguém escreveu desde 00:36, mas a próxima conversa também vai falhar.');
  });

  it('05/10 07:30 — os dois números pararam juntos (um cartão) e a semana fraca (segunda)', () => {
    const l = ler(real('2026-10-05-0730-hoje'));
    expect(ids(l)).toEqual([`numeros_parados_juntos:${EMP}+${JUR}`, 'fechamentos_semana:queda']);
    const j = l.achados[0];
    expect(j.titulo).toBe('EMPRESTIMO e JUROS ABUSIVO pararam juntos');
    // cada número com a MESMA fonte e o MESMO minuto da marca na tabela: o JUROS está sem
    // mensagens desde 10:59 (a marca diz isso), não "desde 10:58" da última entrada
    expect(j.frase).toBe('EMPRESTIMO sem cliente novo desde ontem 10:48 (cerca de 53 clientes esperados) e JUROS ABUSIVO sem mensagens desde ontem 10:59: os dois pararam com 11 min de diferença, o que aponta para a conexão, não para o anúncio.');
    expect(Object.keys(l.marcadores.numeros).sort()).toEqual([EMP, JUR].sort());
    expect(l.marcadores.numeros[JUR]?.texto).toBe('sem mensagens desde ontem 10:59');
    expect(l.marcadores.numeros[EMP]?.texto).toBe('sem cliente novo há 20 h 42');   // 07:30 − 10:48
  });

  it('05/10 11:00 — as duas voltas com as represadas; a IA atrasada com a fila vira oração da volta (sem "confira se está ligada")', () => {
    const l = ler(real('2026-10-05-1100-hoje'));
    expect(ids(l)).toEqual(['fechamentos_semana:queda', `queda_encerrada:${EMP}`, `queda_encerrada:${JUR}`]);
    const emp = achado(l, `queda_encerrada:${EMP}`);
    // o que é medido e de onde vem o 94: os 92 da rajada e mais 2, até 30 min atrás
    expect(emp.frase).toContain('Ao voltar, 92 chegaram em 13 min (represados). A IA atende essa fila com atraso: só 7 dos 94 que chegaram até 10:30 (os 92 e mais 2) foram atendidos pela IA em até 30 min.');
    expect(emp.titulo).toBe('EMPRESTIMO voltou depois de 23 h 14 sem entradas');
    expect(textos(l).join(' ')).not.toContain('Confira se a IA está ligada');
    expect(achado(l, `queda_encerrada:${JUR}`).frase).toContain('eram mensagens represadas, não pico de procura');
    expect(l.notas.some((n) => n.id.startsWith('rajada:'))).toBe(false);
  });

  it('05/10 18:30 — fila da equipe em 40 (histerese: segue um cartão só, sem trocar pelos das pessoas)', () => {
    const l = ler(real('2026-10-05-1830-hoje'));
    expect(ids(l)[0]).toBe('equipe_lenta:fila');
    expect(l.achados.some((a) => a.tipo === 'atendente_atrasado')).toBe(false);
  });

  it('15/10 20:00 — fora do RS no JUROS', () => {
    const l = ler(real('2026-10-15-2000-hoje'));
    expect(ids(l)).toEqual([`qualidade_trafego:rs:${JUR}`]);
    expect(l.achados[0].titulo).toBe('6 clientes de fora do RS no JUROS ABUSIVO (ANDRIUS) em 24 h');
    expect(l.achados[0].acao?.link?.rotulo).toBe('Ver JUROS ABUSIVO');
  });

  it('16/10 15:00 — nada a dizer: "Tudo dentro do normal" com o porquê (comparativo dentro da faixa)', () => {
    const l = ler(real('2026-10-16-1500-hoje'));
    expect(l.achados).toEqual([]);
    expect(l.vazio?.titulo).toBe('Tudo dentro do normal');
    expect(l.vazio?.motivo).toBe('65 entradas até 15:00 (o normal até este horário é cerca de 66); números recebendo mensagens, IA respondendo e equipe no tempo de sempre.');
  });

  it('03/10 11:00 (sábado, 41 contra ~17) — o vazio NÃO mostra um comparativo que o contradiz', () => {
    const l = ler(real('2026-10-03-1100-hoje'));
    expect(l.achados).toEqual([]);
    expect(l.vazio?.motivo).toBe('Números recebendo mensagens e IA respondendo.');
  });

  it('22/10 00:30 — virada do dia: sem equipe avaliada, o vazio não fala da equipe', () => {
    const l = ler(real('2026-10-22-0030-hoje'));
    expect(l.vazio?.motivo).not.toContain('equipe');
    expect(l.titulo).toBe('Leitura do dia');
  });

  it('21/10 18:00 — semana boa: 30 marcados e as fichas sem “fechado” JUNTAS no cartão (sem "é venda")', () => {
    const l = ler(real('2026-10-21-1800-hoje'));
    expect(ids(l)).toEqual(['fechamentos_semana:alta']);
    const a = l.achados[0];
    expect(a.severidade).toBe('bom');
    expect(a.titulo).toBe('30 fechados nos últimos 7 dias, acima do normal');
    expect(a.frase).toBe('Uma semana típica tem cerca de 11 (nas 4 anteriores, de 5 a 23). Outras 60 fichas finalizadas na semana ainda não estão completas no administrativo.');
    expect(a.frase).not.toContain('é venda');
    // em Hoje a tabela mostra HOJE: o link troca para os 7 dias (não rola para números que não batem)
    expect(a.acao?.link).toEqual({ rotulo: 'Ver os 7 dias', preset: '7d' });
    expect(l.notas.map((n) => n.texto)).toContain(
      'Às 13:06 de 21/10, 82 leads de Luiz passaram de uma vez para Juliana, Matheus e Isadora. “Recebidos” não muda; aparece em “transferidos”.');
    expect(l.notas.map((n) => n.texto)).toContain('ANTONIO CAMPANHA começou em 21/10: avisos de queda a partir de 28/10.');
    // a nota das fichas sem “fechado” não repete o que o cartão já diz
    expect(l.notas.some((n) => n.id === 'fichas_sem_fechado')).toBe(false);
  });

  it('21/10 17:30 em 7 dias — o número do cartão é o do KPI "Fechados" (25, mesma janela) e o link vai para a tabela', () => {
    const s = real('2026-10-21-1730-7d');
    const l = ler(s, '7d');
    expect(l.titulo).toBe('Leitura do período');
    expect(ids(l)).toEqual([`passados_sem_contato:${MATHEUS}`, 'fechamentos_semana:alta', 'queda_encerrada:periodo']);
    // dash_v5_kpis(CAF, 15/10 00:00, 21/10 17:30)->ganhos = 25 (conferido no banco em 22/10)
    expect(achado(l, 'fechamentos_semana:alta').titulo).toBe('25 fechados nos últimos 7 dias, acima do normal');
    expect(s.fechamentos.semanas[0].inicio).toBe('2026-10-15T03:00:00+00:00');
    expect(achado(l, 'fechamentos_semana:alta').acao?.link).toEqual({ rotulo: 'Ver quem fechou', alvo: { bloco: 'atendentes' } });
    // dash_v5_sinais(CAF, 21/10 17:30, 7 dias)->Matheus->passados = {n: 55, sem_contato: 30}
    const p = achado(l, `passados_sem_contato:${MATHEUS}`);
    expect(p.titulo).toBe('30 de 55 leads que a IA passou para Matheus ficaram sem mensagem');
    expect(p.frase).toBe('São 55% sem mensagem registrada em 1 dia de expediente; no resto da equipe, 17%. Contam só os que a IA ou o robô passou há mais de 1 dia de expediente, por isso não é o número de “Recebidos”. Ligações não aparecem aqui.');
    const q = achado(l, 'queda_encerrada:periodo');
    expect(q.titulo).toBe('1 queda no período, cerca de 33 clientes a menos');
    expect(q.frase).toBe('JUROS ABUSIVO (ANDRIUS) ficou 1,6 dia sem entradas (de sáb 22:29 a seg 12:41).');   // sem "A maior:" com uma só
  });

  it('21/10 11:00 e 13:15 — a manhã do Luiz é informação; 13:15 sem cartão de resposta com n < 50 antes das 14 h', () => {
    expect(achado(ler(real('2026-10-21-1100-hoje')), `atendente_atrasado:${LUIZ}`).severidade).toBe('info');
    const l = ler(real('2026-10-21-1315-hoje'));
    expect(l.achados.some((a) => a.id === 'equipe_lenta:resposta')).toBe(false);
  });

  it('01/10 18:30 em 7 dias — fechados abaixo com as fichas no normal (pode faltar marcar)', () => {
    const l = ler(real('2026-10-01-1830-7d'), '7d');
    const f = achado(l, 'fechamentos_semana:queda');
    expect(f.frase).toContain('As fichas finalizadas seguem no normal (38 na semana)');
    expect(f.acao?.texto).toBe('Confira com o administrativo as fichas finalizadas que ainda não estão completas lá.');
  });

  it('29/09 14:00 — o lote do sistema: 223 leads (só 9 eram antigos — a nota não diz "antigos")', () => {
    const l = ler(real('2026-09-29-1400-hoje'));
    expect(l.notas.map((n) => n.texto)).toContain('Às 13:44 de 29/09, 223 leads foram marcados como não elegíveis de uma vez pelo sistema.');
  });

  it('mês anterior fechado (10/09→10/10) — o lote de 14/10 com datas antigas DENTRO do período aparece; ANTONIO não', () => {
    const l = ler(real('2026-10-22-0500-mesant'), 'mes_caf');
    expect(l.titulo).toBe('Leitura do período');
    expect(l.notas.some((n) => n.texto.startsWith('Às 12:02 de 14/10, 59 não elegíveis'))).toBe(true);
    expect(l.notas.some((n) => n.id.startsWith('numero_aprendendo'))).toBe(false);
    expect(ids(l)).toEqual(['queda_encerrada:periodo']);
  });

  it('a mesma queda tem a mesma duração em todo lugar: a observação do mês anterior = o cartão de 05/10 11:00', () => {
    const notas = ler(real('2026-10-22-0500-mesant'), 'mes_caf').notas.map((n) => n.texto);
    const dia = ler(real('2026-10-05-1100-hoje'));
    expect(achado(dia, `queda_encerrada:${EMP}`).titulo).toBe('EMPRESTIMO voltou depois de 23 h 14 sem entradas');
    expect(achado(dia, `queda_encerrada:${JUR}`).titulo).toBe('JUROS ABUSIVO (ANDRIUS) voltou depois de 23 h 11 sem entradas');
    expect(notas).toContain('92 clientes do EMPRESTIMO chegaram em 13 min às 10:02 de 05/10, logo depois de 23 h 14 sem entradas: mensagens represadas, não pico de procura.');
    expect(notas).toContain('26 clientes do JUROS ABUSIVO (ANDRIUS) chegaram em 15 min às 10:09 de 05/10, logo depois de 23 h 11 sem entradas: mensagens represadas, não pico de procura.');
  });

  it('12/10 16:00 — histerese das mensagens: uma mensagem solta depois do apagão não apaga o cartão', () => {
    const l = ler(real('2026-10-12-1600-hoje'));
    expect(ids(l)).toEqual([`numero_parado:${JUR}`]);
    expect(l.achados[0].titulo).toBe('JUROS ABUSIVO (ANDRIUS) quase sem mensagens desde 13:56');
    const fer = l.notas.find((n) => n.id === 'feriado:2026-10-12')!;
    expect(fer.texto).toBe('O tempo de resposta da tabela conta o feriado de 12/10 como dia normal.');
    expect(fer.link).toBeUndefined();
  });

  it('em todo momento real: títulos curtos, nada de NaN/undefined, no máximo 4 na tela, rodapé sem horário', () => {
    for (const f of readdirSync(FIX)) {
      const s = real(f.replace('.json', ''));
      const l = ler(s, presetDe(f));
      expect(l.visiveis).toBeLessThanOrEqual(LIMIARES_V5.maxVisiveis);
      for (const a of l.achados) expect(a.titulo.length, a.titulo).toBeLessThanOrEqual(70);
      for (const t of textos(l)) expect(t, f).not.toMatch(/NaN|undefined|Infinity|null|\[object|~|'/);
      expect(l.rodape).toBe('Números reais do banco. “Normal” compara com o mesmo horário dos dias anteriores, sem contar dias em que um número caiu.');
      // link de navegação: o verbo vai no rótulo e a instrução não repete o link
      for (const a of l.achados) {
        if (a.acao?.texto && a.acao.link?.rota) expect(a.acao.texto, a.id).not.toMatch(/em Integrações\.$|na página IA\.$/);
      }
    }
  });

  it('o motor nunca inventa número: todo número do texto sai do sinal (procedência dos dígitos)', () => {
    for (const f of readdirSync(FIX)) {
      const s = real(f.replace('.json', ''));
      const voc = vocabulario(s);
      for (const t of textos(ler(s, presetDe(f)))) {
        for (const d of t.match(/\d+/g) ?? []) expect(voc.has(d), `${f}: "${d}" em «${t}»`).toBe(true);
      }
    }
  });

  it('determinístico: o mesmo sinal dá a mesma leitura', () => {
    const s = real('2026-10-13-1100-hoje');
    expect(ler(s)).toEqual(ler(JSON.parse(JSON.stringify(s)) as SinaisV5));
  });
});

/** Todo número que o motor pode escrever a partir do sinal: campos (inteiro, 1 casa), horas
 *  e datas dos instantes (SP), durações entre instantes do mesmo objeto (e até agora), somas,
 *  diferenças e % entre campos do mesmo objeto, % entre somas dos irmãos (passados), mediana,
 *  mínimo, máximo e a faixa inteira de cada lista (base interpolada) e as constantes do texto. */
function vocabulario(s: SinaisV5): Set<string> {
  const v = new Set<string>();
  const add = (txt: string) => { for (const d of txt.match(/\d+/g) ?? []) v.add(d); };
  // os candidatos primeiro (com 1 casa), a formatação uma vez só no fim
  const cand = new Set<number>();
  const num = (x: number) => { if (Number.isFinite(x)) cand.add(Math.round(x * 10) / 10); };
  const ag = Date.parse(s.agora);
  const inst = (iso: string) => {
    const t = Date.parse(iso); if (!Number.isFinite(t)) return;
    const d = new Date(t - 3 * 3_600_000);
    add(`${d.getUTCHours()} ${d.getUTCMinutes()} ${d.getUTCDate()} ${d.getUTCMonth() + 1}`);
    add(d.toISOString().slice(0, 16)); add(duracaoTxt((ag - t) / 60_000));
  };
  const visita = (o: unknown, pais: Record<string, unknown>[] = []) => {
    if (Array.isArray(o)) {
      const ns = o.filter((x): x is number => typeof x === 'number');
      if (ns.length) {
        const ord = [...ns].sort((a, b) => a - b);
        for (let k = Math.floor(ord[0]); k <= Math.ceil(ord[ord.length - 1]) + 1; k++) num(k);
        num(ns.reduce((a, b) => a + b, 0));
      }
      const objs = o.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x));
      // irmãos: soma dos OUTROS em cada campo numérico (e um nível abaixo) e a % entre essas somas
      const campos = (x: Record<string, unknown>) => {
        const out: Record<string, number> = {};
        for (const [k, y] of Object.entries(x)) {
          if (typeof y === 'number') out[k] = y;
          else if (y && typeof y === 'object' && !Array.isArray(y)) for (const [k2, z] of Object.entries(y)) if (typeof z === 'number') out[`${k}.${k2}`] = z;
        }
        return out;
      };
      const cs = objs.map(campos);
      for (let i = 0; i < cs.length; i++) {
        const resto: Record<string, number> = {};
        cs.forEach((c, j) => { if (j !== i) for (const [k, y] of Object.entries(c)) resto[k] = (resto[k] ?? 0) + y; });
        for (const a of Object.values(resto)) for (const b of Object.values(resto)) if (b > 0) num((a / b) * 100);
      }
      for (const k of new Set(cs.flatMap((c) => Object.keys(c)))) {
        const col = cs.map((c) => c[k]).filter((x) => typeof x === 'number');
        if (col.length) { num(Math.min(...col)); num(Math.max(...col)); }
      }
      for (const x of o) visita(x, pais);
      return;
    }
    if (o && typeof o === 'object') {
      const r = o as Record<string, unknown>;
      const ns = Object.values(r).filter((x): x is number => typeof x === 'number');
      const ts = Object.values(r).filter((x): x is string => typeof x === 'string' && /^\d{4}-\d\d-\d\dT/.test(x)).map(Date.parse);
      for (const a of ns) for (const b of ns) { num(a + b); num(a - b); if (b > 0) num((a / b) * 100); }
      for (const a of ts) for (const b of ts) num(Math.abs(a - b) / 60_000);
      for (const x of Object.values(r)) visita(x, [...pais, r]);
      return;
    }
    if (typeof o === 'number') num(o);
    else if (typeof o === 'string') {
      if (/^\d{4}-\d\d-\d\dT/.test(o)) inst(o);
      else if (/^\d{4}-\d\d-\d\d$/.test(o)) add(`${o.slice(8, 10)} ${o.slice(5, 7)}`);
      else add(o);   // nomes ("RMKT 5"), motivos
    }
  };
  visita(s);
  for (const x of cand) {
    add(fmtInt(x)); add(fmtDec(x, 1)); add(fmtPct(x)); add(fmtPct(x * 100));
    if (x >= 0) { add(duracaoTxt(x)); add(hhmmDoMinuto(x)); }
  }
  // constantes do texto: "3 h", "2 horas", "1 dia", "4 semanas", "7 dias", "24 h", "mais de 100", "1ª"
  for (const c of ['1', '2', '3', '4', '7', '24', '100', '60']) v.add(c);
  return v;
}

/* ====================================================================== */
/* Regras: limites                                                         */
/* ====================================================================== */
const AGORA = SP('2026-10-22T14:00:00');
function num(p: Partial<NumeroSinaisV5> = {}): NumeroSinaisV5 {
  return {
    canalId: 'c1', nome: 'EMPRESTIMO', numero: '555194266757', trafego: true, aprendendoAte: null,
    historiaDesde: '2026-09-15', ultimaEntrada: '2026-10-22T13:50:00-03:00', esperadoDesdeUltima: 1,
    ent3h: { rec: 24, esp: 24 }, ent3h15: { rec: 24, esp: 24 }, ent60: { rec: 8, esp: 8 },
    ultimaMsg: '2026-10-22T13:59:00-03:00', msgsEsperadasDesdeUltimaMsg: 1,
    msgs60: { rec: 40, esp: 40 }, lacunasMsg: [], msgsDiag: { desde: '2026-10-22T12:00:00-03:00', rec: 80, esp: 80 },
    hoje: { entradas: 60, normalAteAgora: 62 }, ia3h: { n: 20, comIa: 18 }, iaCob7d: { n: 700, comIa: 600 },
    qual24h: { n: 100, rs: 3, iaDesc: 30, motivos: {} }, qualBase: { n: 1400, rs: 40, iaDesc: 420, motivos: {}, dias: 14 },
    quedas: [], rajadas: [], ...p,
  };
}
const queda = (p: Partial<QuedaV5> = {}): QuedaV5 => ({
  inicio: '2026-10-21T21:17:00-03:00', fim: '2026-10-22T13:40:00-03:00', chegaram: 0, esperado: 20, depois: 1, espDepois: 2, ...p,
});
const semanas = (g: number[], f: number[] = [40, 40, 40, 40, 40], e: number[] = [700, 700, 700, 700, 700]): SemanaFechV5[] =>
  g.map((x, k) => ({ inicio: `2026-10-${String(16 - 7 * k).padStart(2, '0')}T03:00:00Z`, fim: AGORA.toISOString(), ganhos: x, fichas: f[k], entradas: e[k] }));
function sinais(p: Partial<SinaisV5> = {}): SinaisV5 {
  return {
    versao: 1, geradoEm: AGORA.toISOString(), agora: AGORA.toISOString(), admin: true, baseCalculadaEm: null,
    janela: { inicio: '2026-10-22T00:00:00-03:00', fim: '2026-10-23T00:00:00-03:00', incluiAgora: true },
    diaUtil: true, feriadosNoPeriodo: [], numeros: [num()],
    total: { hoje: 60, normalAteAgora: 62, rajadaHoje: false },
    ia: { credito: null, credito60: 0, erros60: 0, ok60: 50 }, equipe: null, pessoas: [],
    fechamentos: { diario: [], semanas: [], semFechadoSemana: 0 },
    notas: { lotesNe: [], transferencias: [], fichasSemFechado: { total: 0, porPessoa: [] } },
    ...p,
  };
}
const lerS = (s: SinaisV5, agora = AGORA, preset: PresetDash = 'hoje', admin = true) => montarLeituraV5(s, { agora, preset, admin });
const equipe = (p: Partial<EquipeSinaisV5> = {}): EquipeSinaisV5 => ({
  respHoje: { n: 40, medianaMin: 4 }, respBase: [4, 4, 5, 4, 4], filaAgora: 20, filaAntes: [20, 20],
  filaBase: [18, 19, 20, 18, 19, 20, 18, 19, 20, 18], filaBaseProx: null, ...p,
});
const pessoa = (p: Partial<PessoaSinaisV5> = {}): PessoaSinaisV5 => ({
  usuarioId: 'u1', nome: 'Luiz', parteRodizio14d: 0.15, primeiraMsgHoje: '2026-10-22T09:10:00-03:00', primeiraMsgMedianaMin: 560,
  diasAtivos: [], fila: { agora: 0, maisAntigo: null, base: [], baseProx: null },
  respHoje: null, respRestoMedianaMin: null, respBase: [], passados: null, ...p,
});

describe('regras: número parado', () => {
  it('E: 7,9 esperados não dispara; 8 dispara', () => {
    expect(estadoNumero(num({ esperadoDesdeUltima: 7.9 }), AGORA)).toBeNull();
    expect(estadoNumero(num({ esperadoDesdeUltima: 8 }), AGORA)?.e).toBe(true);
  });

  it('T: 3 h com ≥ 8 esperados e ≤ 25% chegando; histerese: ligado 15 min antes, só sai acima de 40% ou com a última hora de volta', () => {
    expect(estadoNumero(num({ ent3h: { rec: 3, esp: 12 }, ent3h15: { rec: 6, esp: 12 } }), AGORA)?.t).toBe(true);
    expect(estadoNumero(num({ ent3h: { rec: 4, esp: 12 }, ent3h15: { rec: 6, esp: 12 } }), AGORA)).toBeNull();
    expect(estadoNumero(num({ ent3h: { rec: 0, esp: 7.9 }, ent3h15: { rec: 0, esp: 7.9 } }), AGORA)).toBeNull();
    // estava ligado (3 de 12 há 15 min); agora 4 de 12 (33%) com a última hora fraca: segue
    const fraco = { ent3h: { rec: 4, esp: 12 }, ent3h15: { rec: 3, esp: 12 }, ent60: { rec: 1, esp: 4 } };
    expect(estadoNumero(num(fraco), AGORA)?.t).toBe(true);
    // a última hora voltou (3 de 4): sai mesmo com 33% nas 3 h
    expect(estadoNumero(num({ ...fraco, ent60: { rec: 3, esp: 4 } }), AGORA)).toBeNull();
    // passou de 40%: sai
    expect(estadoNumero(num({ ...fraco, ent3h: { rec: 5, esp: 12 } }), AGORA)).toBeNull();
  });

  it('M: 75 min sem mensagem, ≥ 20 esperadas e ≥ 2 clientes esperados', () => {
    const base = { msgsEsperadasDesdeUltimaMsg: 30, esperadoDesdeUltima: 3 };
    expect(estadoNumero(num({ ...base, ultimaMsg: '2026-10-22T12:46:00-03:00' }), AGORA)).toBeNull();   // 74 min
    expect(estadoNumero(num({ ...base, ultimaMsg: '2026-10-22T12:45:00-03:00' }), AGORA)?.m).toBe(true); // 75 min
    expect(estadoNumero(num({ ...base, ultimaMsg: '2026-10-22T12:45:00-03:00', msgsEsperadasDesdeUltimaMsg: 19 }), AGORA)).toBeNull();
    expect(estadoNumero(num({ ...base, ultimaMsg: '2026-10-22T12:45:00-03:00', esperadoDesdeUltima: 1.9 }), AGORA)).toBeNull();
  });

  it('número que não é de tráfego (MURILLO, OFICIAL, aprendendo) nunca dispara', () => {
    expect(estadoNumero(num({ trafego: false, esperadoDesdeUltima: 90 }), AGORA)).toBeNull();
    const l = lerS(sinais({
      numeros: [num({ canalId: 'ant', nome: 'ANTONIO CAMPANHA', trafego: false, aprendendoAte: '2026-10-28', historiaDesde: '2026-10-21', esperadoDesdeUltima: 40 })],
    }));
    expect(l.achados).toEqual([]);
    expect(l.notas.map((n) => n.texto)).toContain('ANTONIO CAMPANHA começou em 21/10: avisos de queda a partir de 28/10.');
    expect(l.notas.find((n) => n.id === 'numero_aprendendo:ant')?.link).toBeUndefined();
    expect(l.marcadores.numeros.ant).toEqual({ texto: 'aprendendo até 28/10', tom: 'mudo' });
  });

  it('histerese das mensagens: apagão que acabou há < 2 h segura o cartão até a última hora voltar ao normal', () => {
    const lac = [{ inicio: '2026-10-22T11:00:00-03:00', fim: '2026-10-22T13:10:00-03:00', esperado: 60, recDepois: 2, espDepois: 20 }];
    expect(estadoNumero(num({ lacunasMsg: lac, msgs60: { rec: 2, esp: 40 } }), AGORA)?.holdMsg).toBe(true);
    expect(estadoNumero(num({ lacunasMsg: lac, msgs60: { rec: 20, esp: 40 } }), AGORA)).toBeNull();
    const velha = [{ ...lac[0], fim: '2026-10-22T11:50:00-03:00' }];
    expect(estadoNumero(num({ lacunasMsg: velha, msgs60: { rec: 2, esp: 40 } }), AGORA)).toBeNull();
  });

  it('histerese das entradas: queda encerrada por 1–2 clientes segue como o MESMO incidente até ≥ 3 entradas ou a última hora normal', () => {
    // 1 cliente às 13:40 depois de uma queda desde ontem 21:17
    const st = estadoNumero(num({ ultimaEntrada: '2026-10-22T13:40:00-03:00', esperadoDesdeUltima: 1.5, quedas: [queda()], ent60: { rec: 1, esp: 8 } }), AGORA)!;
    expect(st.holdQueda).toBe(true);
    expect(st.inc).toEqual({ inicio: '2026-10-21T21:17:00-03:00', chegaram: 1, esperado: 22 });
    const l = lerS(sinais({ numeros: [num({ ultimaEntrada: '2026-10-22T13:40:00-03:00', esperadoDesdeUltima: 1.5, quedas: [queda()], ent60: { rec: 1, esp: 8 } })] }));
    expect(ids(l)).toEqual(['numero_parado:c1']);
    expect(l.achados[0].titulo).toBe('EMPRESTIMO quase sem cliente novo desde ontem 21:17');
    // 3 entradas desde o fim: a volta se confirma e vira "voltou"
    const l3 = lerS(sinais({ numeros: [num({ ultimaEntrada: '2026-10-22T13:55:00-03:00', quedas: [queda({ depois: 3 })], ent60: { rec: 3, esp: 8 } })] }));
    expect(ids(l3)).toEqual(['queda_encerrada:c1']);
    // a última hora no normal também confirma
    const l60 = lerS(sinais({ numeros: [num({ quedas: [queda({ depois: 2 })], ent60: { rec: 5, esp: 8 } })] }));
    expect(ids(l60)).toEqual(['queda_encerrada:c1']);
  });

  it('histerese das entradas: depois de 3 h só segura se eram esperados ≥ 3 desde o fim (madrugada sai), nunca além de 12 h', () => {
    const tarde = queda({ fim: '2026-10-22T10:30:00-03:00', depois: 1 });
    expect(estadoNumero(num({ ultimaEntrada: '2026-10-22T10:30:00-03:00', quedas: [{ ...tarde, espDepois: 5 }], ent60: { rec: 0, esp: 2 } }), AGORA)?.holdQueda).toBe(true);
    expect(estadoNumero(num({ ultimaEntrada: '2026-10-22T10:30:00-03:00', quedas: [{ ...tarde, espDepois: 2 }], ent60: { rec: 0, esp: 0.5 } }), AGORA)).toBeNull();
    const velha = queda({ fim: '2026-10-22T01:30:00-03:00', espDepois: 30 });
    expect(estadoNumero(num({ ultimaEntrada: '2026-10-22T01:30:00-03:00', quedas: [velha], ent60: { rec: 0, esp: 8 } }), AGORA)).toBeNull();
  });

  it('o filete logo depois de uma queda é medido desde o fim dela (não pisca enquanto a janela de 3 h sai de cima da queda)', () => {
    // 3 entradas desde o fim (há 30 min), 3 h ainda com a queda dentro (4 de 16 = 25%)
    const n = num({ quedas: [queda({ fim: '2026-10-22T13:30:00-03:00', depois: 3, espDepois: 3 })], ent3h: { rec: 4, esp: 16 }, ent3h15: { rec: 3, esp: 16 }, ent60: { rec: 3, esp: 7 } });
    expect(estadoNumero(n, AGORA)).toBeNull();
    expect(ids(lerS(sinais({ numeros: [n] })))).toEqual(['queda_encerrada:c1']);
  });

  it('E quase no limite (≥ 6) logo depois de um apagão de mensagens segue o cartão', () => {
    const lac = [{ inicio: '2026-10-22T10:00:00-03:00', fim: '2026-10-22T13:00:00-03:00', esperado: 60, recDepois: 30, espDepois: 30 }];
    expect(estadoNumero(num({ esperadoDesdeUltima: 6.5, lacunasMsg: lac }), AGORA)?.e).toBe(true);
    expect(estadoNumero(num({ esperadoDesdeUltima: 6.5 }), AGORA)).toBeNull();
  });

  it('diagnóstico: "as conversas voltaram" SÓ com ≥ 60% das mensagens desde o fim e a última hora no normal', () => {
    const lac = (rec: number) => [{ inicio: '2026-10-22T08:00:00-03:00', fim: '2026-10-22T11:00:00-03:00', esperado: 60, recDepois: rec, espDepois: 100 }];
    const n = (rec: number, m60 = 40) => num({ ultimaEntrada: '2026-10-22T07:30:00-03:00', esperadoDesdeUltima: 20, lacunasMsg: lac(rec), msgs60: { rec: m60, esp: 40 } });
    expect(estadoNumero(n(60), AGORA)?.diag).toBe('conexao_voltou');
    expect(estadoNumero(n(59), AGORA)?.diag).toBe('conexao_parcial');
    expect(estadoNumero(n(80, 19), AGORA)?.diag).toBe('conexao_parcial');   // a última hora caiu de novo
    const l = lerS(sinais({ numeros: [n(30)] }));
    expect(l.achados[0].frase).toBe('Nesse tempo costumam chegar cerca de 20 clientes. A conexão voltou só em parte: 30 de cerca de 100 mensagens desde 11:00.');
    expect(l.achados[0].acao?.link?.rotulo).toBe('Reconectar em Integrações');
  });

  it('diagnóstico: um apagão que acabou ANTES do último cliente não explica o silêncio de agora (vira anúncio/misto)', () => {
    const lac = [{ inicio: '2026-10-22T06:00:00-03:00', fim: '2026-10-22T08:00:00-03:00', esperado: 60, recDepois: 200, espDepois: 200 }];
    const st = estadoNumero(num({ ultimaEntrada: '2026-10-22T09:40:00-03:00', esperadoDesdeUltima: 12, lacunasMsg: lac, msgsDiag: { desde: '2026-10-22T12:00:00-03:00', rec: 50, esp: 70 } }), AGORA);
    expect(st?.diag).toBe('anuncio');
  });

  it('lacunas vizinhas (uma mensagem solta no meio) são um apagão só, nomeado pelo começo', () => {
    const j = juntarLacunas([
      { inicio: '2026-10-12T15:29:00-03:00', fim: '2026-10-12T17:58:00-03:00', esperado: 62, recDepois: 9, espDepois: 12 },
      { inicio: '2026-10-12T13:56:00-03:00', fim: '2026-10-12T15:29:00-03:00', esperado: 42, recDepois: 10, espDepois: 70 },
    ]);
    expect(j).toEqual([{ inicio: '2026-10-12T13:56:00-03:00', fim: '2026-10-12T17:58:00-03:00', esperado: 104, recDepois: 9, espDepois: 12 }]);
  });

  it('anúncio (D3) quando as conversas chegam normalmente: a instrução é fora da tela e o link vai para a linha', () => {
    const n = num({ esperadoDesdeUltima: 12, msgsDiag: { desde: '2026-10-22T12:00:00-03:00', rec: 50, esp: 70 } });
    expect(estadoNumero(n, AGORA)?.diag).toBe('anuncio');
    const l = lerS(sinais({ numeros: [n] }));
    expect(l.achados[0].acao).toEqual({ texto: 'Confira o anúncio no Gerenciador: pausa, saldo ou reprovação.', link: { rotulo: 'Ver EMPRESTIMO', alvo: { bloco: 'numeros', canalId: 'c1' } } });
  });

  it('dois números parados, um deles pelo anúncio: cartões separados (não "juntos")', () => {
    const a = num({ canalId: 'a', nome: 'A', esperadoDesdeUltima: 12, msgsDiag: { desde: '', rec: 50, esp: 70 } });
    const b = num({ canalId: 'b', nome: 'B', esperadoDesdeUltima: 12, msgsDiag: { desde: '', rec: 5, esp: 70 } });
    expect(ids(lerS(sinais({ numeros: [a, b] }))).sort()).toEqual(['numero_parado:a', 'numero_parado:b']);
  });
});

describe('regras: IA', () => {
  const cred = { inicio: '2026-10-22T11:10:00-03:00', fim: '2026-10-22T12:36:00-03:00', erros: 20, conversas: 7, okDepois: 0 };
  it('crédito acabando agora', () => {
    const l = lerS(sinais({ ia: { credito: { ...cred, fim: '2026-10-22T13:58:00-03:00' }, credito60: 20, erros60: 0, ok60: 0 } }));
    expect(ids(l)).toEqual(['ia_parada:credito']);
    expect(l.achados[0].frase).toBe('Desde 11:10, 20 tentativas falharam e 7 conversas esperam a IA.');
  });
  it('madrugada quieta: última falha há 84 min, nenhuma resposta boa depois e zero falhas na hora → segue ATENÇÃO', () => {
    const l = lerS(sinais({ ia: { credito: cred, credito60: 0, erros60: 0, ok60: 0 } }));
    expect(l.achados.map((a) => [a.id, a.severidade])).toEqual([['ia_parada:credito', 'atencao']]);
    expect(l.achados[0].frase).toBe('Desde 11:10, 20 tentativas falharam; ninguém escreveu desde 12:36, mas a próxima conversa também vai falhar.');
    expect(l.vazio).toBeNull();
  });
  it('1–2 respostas depois da última falha: "pode não ter voltado"; ≥ 3: resolvida (info por 12 h)', () => {
    expect(lerS(sinais({ ia: { credito: { ...cred, okDepois: 1 }, credito60: 0, erros60: 0, ok60: 1 } })).achados[0].titulo).toBe('O crédito do Gemini pode não ter voltado');
    const r = lerS(sinais({ ia: { credito: { ...cred, okDepois: 40 }, credito60: 0, erros60: 0, ok60: 50 } }));
    expect(r.achados.map((a) => [a.id, a.severidade])).toEqual([['ia_parada:resolvida', 'info']]);
    expect(r.achados[0].titulo).toBe('A IA ficou parada das 11:10 às 12:36');
    expect(lerS(sinais({ ia: { credito: { ...cred, fim: '2026-10-21T23:00:00-03:00', okDepois: 40 }, credito60: 0, erros60: 0, ok60: 50 } })).achados).toEqual([]);
  });
  it('menos de 5 falhas de crédito não é "crédito esgotado" (nem ativo, nem resolvido)', () => {
    expect(lerS(sinais({ ia: { credito: { ...cred, erros: 4 }, credito60: 4, erros60: 0, ok60: 0 } })).achados).toEqual([]);
    expect(lerS(sinais({ ia: { credito: { ...cred, erros: 4, okDepois: 9 }, credito60: 0, erros60: 0, ok60: 9 } })).achados).toEqual([]);
  });
  it('falhas que não são de crédito: ≥ 10 na hora com respostas ≤ 1/3', () => {
    expect(ids(lerS(sinais({ ia: { credito: null, credito60: 0, erros60: 10, ok60: 3 } })))).toEqual(['ia_parada:erros']);
    expect(lerS(sinais({ ia: { credito: null, credito60: 0, erros60: 10, ok60: 4 } })).achados).toEqual([]);
    expect(lerS(sinais({ ia: { credito: null, credito60: 0, erros60: 9, ok60: 0 } })).achados).toEqual([]);
  });
  it('cobertura só cai em número que costuma ter IA (o JUROS roda no robô); fila represada = informação', () => {
    const q = { ia3h: { n: 20, comIa: 1 } };
    const l = lerS(sinais({ numeros: [num(q)] }));
    expect(ids(l)).toEqual(['ia_parada:cobertura:c1']);
    expect(l.achados[0].frase).toBe('Só 5% (1 de 20) dos clientes das últimas 3 h passaram pela IA; o normal é 86%.');
    expect(lerS(sinais({ numeros: [num({ ...q, iaCob7d: { n: 120, comIa: 0 } })] })).achados).toEqual([]);
    const raj = { rajadas: [{ inicio: '2026-10-22T12:00:00-03:00', qtd: 40, minutos: 9, silencioAntesH: 5 }] };
    const r = lerS(sinais({ numeros: [num({ ...q, ...raj })] }));
    expect(r.achados.map((a) => [a.titulo, a.severidade])).toEqual([['IA atendendo com atraso no EMPRESTIMO', 'info']]);
    // o que é medido (atendidos pela IA em até 30 min, dos que chegaram até 30 min atrás) e de
    // onde vem o total ao lado da rajada
    const r2 = lerS(sinais({ numeros: [num({ ia3h: { n: 44, comIa: 1 }, ...raj })] }));
    expect(r2.achados[0].frase).toBe('40 clientes chegaram de uma vez às 12:00 (mensagens represadas); só 1 dos 44 que chegaram até 13:30 (os 40 e mais 4) foi atendido pela IA em até 30 min.');
    const r3 = lerS(sinais({ numeros: [num({ ia3h: { n: 40, comIa: 0 }, ...raj })] }));
    expect(r3.achados[0].frase).toBe('40 clientes chegaram de uma vez às 12:00 (mensagens represadas); nenhum dos 40 que chegaram até 13:30 foi atendido pela IA em até 30 min.');
  });
});

describe('regras: qualidade', () => {
  it('fora do RS precisa de ≥ 5, ≥ 10% e ≥ 2,5× o normal', () => {
    const l = (rs: number, n: number) => lerS(sinais({ numeros: [num({ qual24h: { n, rs, iaDesc: 0, motivos: {} } })] }));
    expect(ids(l(10, 100))).toEqual(['qualidade_trafego:rs:c1']);
    expect(ids(l(4, 30))).toEqual([]);
    expect(ids(l(7, 100))).toEqual([]);   // 7% < 10% (base 2,9%)
  });
  it('número aprendendo (1ª semana, base de poucos dias com 0%) não ganha "fora do RS"', () => {
    const n = num({ aprendendoAte: '2026-10-28', historiaDesde: '2026-10-21', qual24h: { n: 30, rs: 6, iaDesc: 0, motivos: {} }, qualBase: { n: 21, rs: 0, iaDesc: 4, motivos: {}, dias: 1 } });
    expect(lerS(sinais({ numeros: [n] })).achados).toEqual([]);
    // mesmo que a base dissesse 14 dias (payload antigo), a data de aprendizado segura
    expect(lerS(sinais({ numeros: [{ ...n, qualBase: { ...n.qualBase, dias: 14 } }] })).achados).toEqual([]);
  });
  it('descarte da IA: z ≥ 3 e +15 pp, nos limites', () => {
    // base 30% (420 de 1400); 100 entradas: 45 descartes → p 45%, z ≈ 3,27 → dispara
    const l = (k: number, n = 100) => lerS(sinais({ numeros: [num({ qual24h: { n, rs: 0, iaDesc: k, motivos: { sem_beneficio_inss: k } }, qualBase: { n: 1400, rs: 40, iaDesc: 420, motivos: { sem_beneficio_inss: 200 }, dias: 14 } })] }));
    const a = l(45);
    expect(ids(a)).toEqual(['qualidade_trafego:desc:c1']);
    expect(a.achados[0].acao?.link).toEqual({ rotulo: 'Ver motivos', alvo: { bloco: 'motivos', motivo: 'sem_beneficio_inss' } });
    expect(a.achados[0].acao?.texto).toBe('Revise o texto do anúncio: deixe claro que é para quem recebe benefício do INSS.');
    expect(ids(l(44))).toEqual([]);          // 44%: +14 pp
    expect(ids(l(18, 39))).toEqual([]);      // n < 40
  });
});

describe('regras: equipe e atendentes', () => {
  const T11 = SP('2026-10-22T11:00:00');
  it('fila da equipe: entra em ≥ 40 e ≥ 1,5×; segue em 35–39 se esteve acima nos últimos 30 min; sai abaixo de 35', () => {
    const l = (agora: number, antes: number[]) => ids(lerS(sinais({ equipe: equipe({ filaAgora: agora, filaAntes: antes }) })));
    expect(l(40, [30, 30])).toEqual(['equipe_lenta:fila']);
    expect(l(39, [42, 30])).toEqual(['equipe_lenta:fila']);     // estava acima há 15 min
    expect(l(39, [30, 30])).toEqual([]);                        // 30 min fora
    expect(l(34, [42, 42])).toEqual([]);                        // abaixo de 35
  });
  it('resposta da equipe: n ≥ 50 antes das 14 h, n ≥ 30 depois', () => {
    const s = (n: number) => sinais({ equipe: equipe({ respHoje: { n, medianaMin: 10 }, respBase: [4, 4, 4, 4, 4] }) });
    expect(ids(lerS(s(32), SP('2026-10-22T13:15:00')))).toEqual([]);
    expect(ids(lerS(s(50), SP('2026-10-22T13:15:00')))).toEqual(['equipe_lenta:resposta']);
    expect(ids(lerS(s(32), SP('2026-10-22T15:00:00')))).toEqual(['equipe_lenta:resposta']);
  });
  it('recorrente: ainda não começou e costuma começar mais tarde → informação, com a hora', () => {
    const s = sinais({ equipe: equipe(), pessoas: [pessoa({ primeiraMsgHoje: null, primeiraMsgMedianaMin: 811, fila: { agora: 8, maisAntigo: '2026-10-21T19:00:00-03:00', base: [0, 0, 0, 0, 0, 1, 0, 1, 1, 1], baseProx: null } })] });
    const a = achado(lerS(s, T11), 'atendente_atrasado:u1');
    expect(a.severidade).toBe('info');
    expect(a.frase).toContain('Luiz costuma começar por volta das 13:31.');
    // às 14:00 (já passou da hora de começar) volta a ser atenção
    expect(achado(lerS(s, SP('2026-10-22T14:00:00')), 'atendente_atrasado:u1').severidade).toBe('atencao');
  });
  it('dias antes de a pessoa entrar no rodízio não são "fila zero": com menos de 5 dias trabalhados vale piso + 4', () => {
    const p = (agora: number, ativos: boolean[]) => sinais({ equipe: equipe(), pessoas: [pessoa({ diasAtivos: ativos, fila: { agora, maisAntigo: null, base: [0, 0, 0, 0, 0, 0, 0, 3, 4, 3], baseProx: null } })] });
    const tres = [false, false, false, false, false, false, false, true, true, true];
    expect(ids(lerS(p(8, tres)))).toEqual([]);                       // piso 5 + 4 = 9
    expect(ids(lerS(p(9, tres)))).toEqual(['atendente_atrasado:u1']);
  });
  it('pessoa sem nenhuma espera na base (fila.base vazia): zeros só nos dias trabalhados', () => {
    const s = sinais({ equipe: equipe(), pessoas: [pessoa({ fila: { agora: 6, maisAntigo: null, base: [], baseProx: null } })] });
    expect(ids(lerS(s))).toEqual(['atendente_atrasado:u1']);          // 10 zeros: base 0 → piso 5
  });
  it('fora do horário (antes das 11 h, fim de semana) nada da equipe e o vazio não fala dela', () => {
    const s = sinais({ equipe: equipe({ filaAgora: 80 }) });
    expect(ids(lerS(s, SP('2026-10-22T10:30:00')))).toEqual([]);
    expect(lerS(s, SP('2026-10-22T10:30:00')).vazio?.motivo).not.toContain('equipe');
    expect(ids(lerS({ ...s, diaUtil: false }))).toEqual([]);
  });
});

describe('regras: fechamentos da semana', () => {
  const T = SP('2026-10-22T14:00:00');   // quinta
  const diario = (gan: (i: number) => number) => Array.from({ length: 42 }, (_, i) => {
    const d = new Date(Date.parse('2026-09-10T12:00:00Z') + i * 86_400_000).toISOString().slice(0, 10);
    return { dia: d, ganhos: gan(i), fichas: 10, entradas: 100 };
  });
  it('queda com as fichas também abaixo (0,6×): diz que as fichas caíram — nunca "estão no normal"', () => {
    const s = sinais({ fechamentos: { diario: diario((i) => (i >= 40 ? 0 : 3)), semanas: semanas([6, 20, 22, 21, 19], [24, 40, 40, 40, 40], [700, 700, 700, 700, 700]), semFechadoSemana: 0 } });
    const a = achado(lerS(s, T), 'fechamentos_semana:queda');
    expect(a.frase).toBe('Uma semana típica tem cerca de 21 (nas 4 anteriores, de 19 a 22). As fichas finalizadas também caíram (24 contra cerca de 40); as entradas seguem no normal.');
    const s2 = { ...s, fechamentos: { ...s.fechamentos, semanas: semanas([6, 20, 22, 21, 19], [24, 40, 40, 40, 40], [500, 700, 700, 700, 700]) } };
    expect(achado(lerS(s2, T), 'fechamentos_semana:queda').frase).toContain('As fichas finalizadas (24 contra cerca de 40) e as entradas (500 contra cerca de 700) também caíram.');
    const s3 = { ...s, fechamentos: { ...s.fechamentos, semanas: semanas([6, 20, 22, 21, 19], [36, 40, 40, 40, 40]) } };
    expect(achado(lerS(s3, T), 'fechamentos_semana:queda').frase).toContain('As fichas finalizadas seguem no normal (36 na semana)');
  });
  it('em Hoje só nos 2 primeiros dias do estado (e às segundas); em 7 dias enquanto durar — e o link certo para cada um', () => {
    // a alta já dura (7 dias completos até ontem e até anteontem também em alta)
    const s = sinais({ fechamentos: { diario: diario((i) => (i >= 30 ? 6 : 3)), semanas: semanas([42, 21, 21, 21, 21]), semFechadoSemana: 0 } });
    expect(lerS(s, T).achados).toEqual([]);
    const s7 = { ...s, janela: { inicio: '2026-10-16T00:00:00-03:00', fim: '2026-10-23T00:00:00-03:00', incluiAgora: true } };
    const l7 = lerS(s7, T, '7d');
    expect(ids(l7)).toEqual(['fechamentos_semana:alta']);
    expect(l7.achados[0].acao?.link).toEqual({ rotulo: 'Ver quem fechou', alvo: { bloco: 'atendentes' } });
    // estado novo (até anteontem não era alta): aparece em Hoje, com "Ver os 7 dias"
    const sNovo = sinais({ fechamentos: { diario: diario((i) => (i >= 40 ? 12 : 3)), semanas: semanas([42, 21, 21, 21, 21]), semFechadoSemana: 0 } });
    const lh = lerS(sNovo, T);
    expect(ids(lh)).toEqual(['fechamentos_semana:alta']);
    expect(lh.achados[0].acao?.link).toEqual({ rotulo: 'Ver os 7 dias', preset: '7d' });
    expect(lh.achados[0].titulo).toBe('42 fechados nos últimos 7 dias, acima do normal');
  });
  it('alta com as fichas subindo e poucas sem “fechado”: só diz que as fichas subiram', () => {
    const s = sinais({ fechamentos: { diario: diario((i) => (i >= 40 ? 12 : 3)), semanas: semanas([42, 21, 21, 21, 21], [80, 40, 40, 40, 40]), semFechadoSemana: 4 } });
    expect(lerS(s, T).achados[0].frase).toBe('Uma semana típica tem cerca de 21. As fichas finalizadas também subiram (80 contra cerca de 40).');
  });
});

describe('regras: ritmo do dia e vazio', () => {
  const T11 = SP('2026-10-22T11:00:00');
  it('ritmo baixo/alto a partir das 11 h com normal ≥ 30; abaixo de 30 não avalia', () => {
    expect(ids(lerS(sinais({ total: { hoje: 17, normalAteAgora: 30, rajadaHoje: false } }), T11))).toEqual(['ritmo_dia:baixo']);
    expect(ids(lerS(sinais({ total: { hoje: 18, normalAteAgora: 30, rajadaHoje: false } }), T11))).toEqual([]);
    expect(ids(lerS(sinais({ total: { hoje: 49, normalAteAgora: 30, rajadaHoje: false } }), T11))).toEqual(['ritmo_dia:alto']);
    expect(ids(lerS(sinais({ total: { hoje: 49, normalAteAgora: 30, rajadaHoje: true } }), T11))).toEqual([]);
    expect(ids(lerS(sinais({ total: { hoje: 5, normalAteAgora: 29, rajadaHoje: false } }), T11))).toEqual([]);
    expect(ids(lerS(sinais({ total: { hoje: 5, normalAteAgora: 40, rajadaHoje: false } }), SP('2026-10-22T10:59:00')))).toEqual([]);
  });
  it('"recebendo mensagens normalmente" só quando TODO número de tráfego está com a última hora normal', () => {
    const baixo = { total: { hoje: 10, normalAteAgora: 40, rajadaHoje: false } };
    expect(lerS(sinais(baixo), T11).achados[0].frase).toBe('10 entradas até 11:00; o normal até este horário é cerca de 40. Os números estão recebendo mensagens normalmente.');
    expect(lerS(sinais({ ...baixo, numeros: [num({ msgs60: { rec: 10, esp: 40 } })] }), T11).achados[0].frase).toBe('10 entradas até 11:00; o normal até este horário é cerca de 40.');
  });
  it('queda que acabou hoje segura o ritmo (o "voltou" já explica o dia)', () => {
    const s = sinais({ total: { hoje: 10, normalAteAgora: 40, rajadaHoje: false }, numeros: [num({ quedas: [queda({ fim: '2026-10-22T07:00:00-03:00', depois: 30, espDepois: 20 })] })] });
    expect(ids(lerS(s, T11))).toEqual(['queda_encerrada:c1']);
  });
  it('vazio: o comparativo só dentro da faixa [0,6; 1,6]; sem normal, as frases do que foi conferido', () => {
    expect(lerS(sinais({ total: { hoje: 60, normalAteAgora: 62, rajadaHoje: false } })).vazio?.motivo).toBe('60 entradas até 14:00 (o normal até este horário é cerca de 62); números recebendo mensagens e IA respondendo.');
    expect(lerS(sinais({ total: { hoje: 41, normalAteAgora: 17, rajadaHoje: false } })).vazio?.motivo).toBe('Números recebendo mensagens e IA respondendo.');
    expect(lerS(sinais({ total: { hoje: 3, normalAteAgora: null, rajadaHoje: false }, ia: { credito: null, credito60: 0, erros60: 0, ok60: 0 } })).vazio?.motivo).toBe('Números recebendo mensagens.');
  });
});

/* ====================================================================== */
/* Seleção, períodos, notas e texto                                        */
/* ====================================================================== */
const ach = (id: string, severidade: AchadoV5['severidade'], prioridade: number, soAdmin = false): AchadoV5 =>
  ({ id, tipo: 'ritmo_dia', severidade, prioridade, titulo: id, frase: '', acao: null, soAdmin });

describe('seleção', () => {
  it('ordena por severidade, prioridade e id; até 4 na tela', () => {
    const r = selecionar([ach('b', 'info', 99), ach('a', 'atencao', 10), ach('c', 'atencao', 50), ach('d', 'bom', 5),
      ach('e', 'info', 1), ach('f', 'atencao', 50)], true);
    expect(r.achados.map((a) => a.id)).toEqual(['c', 'f', 'a', 'd', 'b', 'e']);
    expect(r.visiveis).toBe(4);
  });
  it('com 2 ou mais "atenção" na tela, no máximo 1 "bom"', () => {
    const r = selecionar([ach('a', 'atencao', 9), ach('b', 'atencao', 8), ach('x', 'bom', 7), ach('y', 'bom', 6), ach('z', 'info', 1)], true);
    expect(r.achados.slice(0, r.visiveis).map((a) => a.id)).toEqual(['a', 'b', 'x', 'z']);
    expect(r.achados.map((a) => a.id)).toEqual(['a', 'b', 'x', 'z', 'y']);
  });
  it('tira os cartões de pessoa de quem não é admin e os repetidos', () => {
    expect(selecionar([ach('a', 'atencao', 9, true), ach('b', 'info', 1), ach('b', 'info', 1)], false).achados.map((a) => a.id)).toEqual(['b']);
  });
});

describe('períodos', () => {
  const q = queda({ inicio: '2026-10-21T22:00:00-03:00', fim: '2026-10-22T10:00:00-03:00', esperado: 20, depois: 30, espDepois: 20 });
  it('período fechado: só quedas, passados e observações (nada ao vivo)', () => {
    const s = sinais({
      janela: { inicio: '2026-09-10T00:00:00-03:00', fim: '2026-10-10T00:00:00-03:00', incluiAgora: false },
      numeros: [num({ esperadoDesdeUltima: 40, quedas: [q] })],
    });
    const l = lerS(s, AGORA, 'mes_caf');
    expect(ids(l)).toEqual(['queda_encerrada:periodo']);
    expect(l.titulo).toBe('Leitura do período');
    expect(l.achados[0].frase).toBe('EMPRESTIMO ficou 12 h sem entradas (de ontem 22:00 a 10:00).');
  });
  it('3 dias: "Leitura dos 3 dias", quedas agregadas, sem passados nem ritmo; o vivo continua', () => {
    const s = sinais({
      janela: { inicio: '2026-10-20T00:00:00-03:00', fim: '2026-10-23T00:00:00-03:00', incluiAgora: true },
      numeros: [num({ quedas: [q] }), num({ canalId: 'c2', nome: 'JUROS', esperadoDesdeUltima: 12, msgsDiag: { desde: '', rec: 5, esp: 70 } })],
      total: { hoje: 5, normalAteAgora: 40, rajadaHoje: false },
      pessoas: [pessoa({ passados: { n: 60, semContato: 40 } }), pessoa({ usuarioId: 'u2', nome: 'Juliana', passados: { n: 60, semContato: 5 } })],
    });
    const l = lerS(s, AGORA, '3d');
    expect(l.titulo).toBe('Leitura dos 3 dias');
    expect(ids(l)).toEqual(['numero_parado:c2', 'queda_encerrada:periodo']);
    // a queda aberta (o cartão acima) entra na conta do período: nada de "1 queda" sozinha
    const p = achado(l, 'queda_encerrada:periodo');
    expect(p.titulo).toBe('1 queda encerrada no período, mais 1 em andamento');
    expect(p.frase).toBe('EMPRESTIMO ficou 12 h sem entradas (de ontem 22:00 a 10:00): cerca de 20 clientes a menos. A queda do JUROS ainda não acabou (acima).');
  });
  it('a queda que acabou com um cliente solto e segue no cartão aberto NÃO conta como encerrada', () => {
    const aberta = queda({ inicio: '2026-10-22T09:00:00-03:00', fim: '2026-10-22T13:40:00-03:00', esperado: 30, depois: 1, espDepois: 2 });
    const s = sinais({
      janela: { inicio: '2026-10-16T00:00:00-03:00', fim: '2026-10-23T00:00:00-03:00', incluiAgora: true },
      numeros: [num({ quedas: [aberta], ent60: { rec: 1, esp: 8 }, esperadoDesdeUltima: 2 })],
    });
    const l = lerS(s, AGORA, '7d');
    expect(ids(l)).toEqual(['numero_parado:c1']);
    expect(l.achados[0].titulo).toBe('EMPRESTIMO quase sem cliente novo desde 09:00');
    // com outra queda, já encerrada de verdade: ela conta; a do incidente aberto, não
    const s2 = sinais({ ...s, numeros: [num({ quedas: [q, aberta], ent60: { rec: 1, esp: 8 }, esperadoDesdeUltima: 2 })] });
    expect(achado(lerS(s2, AGORA, '7d'), 'queda_encerrada:periodo').titulo).toBe('1 queda encerrada no período, mais 1 em andamento');
  });
  it('7 dias com queda agregada de 2+: "A maior:" e o segundo número', () => {
    const s = sinais({
      janela: { inicio: '2026-10-16T00:00:00-03:00', fim: '2026-10-23T00:00:00-03:00', incluiAgora: true },
      numeros: [num({ quedas: [q, { ...q, inicio: '2026-10-18T10:00:00-03:00', fim: '2026-10-18T12:00:00-03:00', esperado: 9 }] }),
        num({ canalId: 'c2', nome: 'JUROS', quedas: [{ ...q, esperado: 9 }] })],
    });
    expect(achado(lerS(s, AGORA, '7d'), 'queda_encerrada:periodo').frase).toBe('A maior: EMPRESTIMO, 12 h (de ontem 22:00 a 10:00). JUROS: 1 queda.');
  });
});

describe('observações', () => {
  it('lote de uma pessoa (todos / parte com data antiga / sem data antiga) e do sistema', () => {
    const lote: LoteNeV5 = { minuto: '2026-10-14T15:02:00Z', sistema: false, quem: 'Matheus Silva', qtd: 59, retroativos: 58, antigos: 59, dMin: '2026-08-12', dMax: '2026-10-12' };
    const notas = (l: LoteNeV5, admin = true) => lerS(sinais({ notas: { lotesNe: [l], transferencias: [], fichasSemFechado: { total: 0, porPessoa: [] } } }), AGORA, 'hoje', admin).notas.map((n) => n.texto);
    expect(notas(lote)).toEqual(['Às 12:02 de 14/10, 59 não elegíveis foram marcados de uma vez por Matheus (58 com data antiga, de 12/08 a 12/10). Eles contam nos dias dessas datas e no total de Matheus.']);
    expect(notas({ ...lote, retroativos: 59 })[0]).toContain('por Matheus, todos com data antiga (de 12/08 a 12/10).');
    expect(notas({ ...lote, retroativos: 0 })[0]).toBe('Às 12:02 de 14/10, 59 não elegíveis foram marcados de uma vez por Matheus. Eles contam no total de Matheus.');
    expect(notas(lote, false)[0]).toContain('por alguém da equipe');
    const sis = { ...lote, minuto: '2026-09-29T16:44:00Z', sistema: true, quem: null, qtd: 223, retroativos: 0, antigos: 9, dMin: null, dMax: null };
    expect(notas(sis)).toEqual(['Às 13:44 de 29/09, 223 leads foram marcados como não elegíveis de uma vez pelo sistema.']);
    expect(notas({ ...sis, antigos: 200 })).toEqual(['Às 13:44 de 29/09, 223 leads antigos foram marcados como não elegíveis de uma vez pelo sistema.']);
  });
  it('fichas sem “fechado”: até 3 nomes e "e mais N pessoas" (nada de reticências); link "Ver Fechados"', () => {
    const fs = { total: 71, porPessoa: [{ nome: 'Juliana', qtd: 40 }, { nome: 'Isadora', qtd: 16 }, { nome: 'Luiz', qtd: 9 }, { nome: 'Matheus', qtd: 4 }, { nome: 'Giovana', qtd: 2 }] };
    const n = lerS(sinais({ notas: { lotesNe: [], transferencias: [], fichasSemFechado: fs } })).notas[0];
    expect(n.texto).toBe('71 fichas finalizadas hoje ainda não estão completas no administrativo (Juliana 40, Isadora 16, Luiz 9 e mais 2 pessoas). “Fechados” conta só o que o administrativo confirmou.');
    expect(n.link).toEqual({ rotulo: 'Ver Fechados', alvo: { bloco: 'kpi', kpi: 'ganhos' } });
  });
  it('feriados: a lista da migration (as duas funções) é a mesma do demo', () => {
    const sql = readFileSync(join(__dirname, '..', '..', 'supabase', 'migrations', '20261022100000_dashboard_inteligencia.sql'), 'utf8');
    const corpo = (nome: string) => sql.slice(sql.indexOf(`function public.${nome}`), sql.indexOf('$$;', sql.indexOf(`function public.${nome}`)));
    const lista = [...corpo('dash_v5s_feriados()').matchAll(/date '(\d{4}-\d\d-\d\d)'/g)].map((m) => m[1]).sort();
    expect(lista).toEqual([...FERIADOS_DEMO].sort());
    const uteis = [...corpo('dash_v5s_feriados_uteis_antes(p_d date)').matchAll(/date '(\d{4}-\d\d-\d\d)'/g)].map((m) => m[1]).sort();
    const dow = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay();
    // só os de seg–sex a partir de 05/01/2026 (o relógio começa numa segunda)
    expect(uteis).toEqual(lista.filter((d) => dow(d) >= 1 && dow(d) <= 5 && d >= '2026-01-05'));
  });
});

describe('texto', () => {
  it('quandoTxt e trechoTxt: hoje, ontem, dia da semana e data', () => {
    expect(quandoTxt('2026-10-22T13:56:00-03:00', AGORA)).toBe('13:56');
    expect(quandoTxt('2026-10-21T21:17:00-03:00', AGORA)).toBe('ontem 21:17');
    expect(quandoTxt('2026-10-17T22:29:00-03:00', AGORA)).toBe('sáb 22:29');
    expect(quandoTxt('2026-10-14T08:00:00-03:00', AGORA)).toBe('14/10 08:00');
    expect(quandoTxt('2026-10-22T00:30:00-03:00', SP('2026-10-22T23:50:00'))).toBe('00:30');
    expect(trechoTxt('2026-10-21T16:22:00-03:00', '2026-10-21T17:19:00-03:00', AGORA)).toBe('ontem, das 16:22 às 17:19');
    expect(trechoTxt('2026-10-22T13:56:00-03:00', '2026-10-22T15:29:00-03:00', AGORA)).toBe('das 13:56 às 15:29');
    expect(trechoTxt('2026-10-21T21:17:00-03:00', '2026-10-22T09:40:00-03:00', AGORA)).toBe('de ontem 21:17 a 09:40');
  });
  it('aproximado, plural, nome curto e minuto do dia', () => {
    expect(aprox(12.6)).toBe('cerca de 13');
    expect(aprox(122)).toBe('cerca de 122');
    expect(aproxClientes(100)).toBe('mais de 100');
    expect(aprox(0.3)).toBe('menos de 1');
    // o esperado sempre com o que conta
    expect(aproxDe(5.2, 'lead esperando', 'leads esperando')).toBe('cerca de 5 leads esperando');
    expect(aproxDe(1.2, 'lead esperando', 'leads esperando')).toBe('cerca de 1 lead esperando');
    expect(aproxDe(0.2, 'lead esperando', 'leads esperando')).toBe('menos de 1 lead esperando');
    expect(aproxDe(140, 'cliente', 'clientes', aproxClientes)).toBe('mais de 100 clientes');
    // minutos pelo relógio da tela: 10:48:45 → 15:00 = 4 h 12 (o "10:48" ao lado)
    expect(minEntre(Date.parse('2026-10-22T10:48:45-03:00'), Date.parse('2026-10-22T15:00:00-03:00'))).toBe(252);
    expect(qtd(1, 'cliente', 'clientes')).toBe('1 cliente');
    expect(qtd(3, 'lead', 'leads')).toBe('3 leads');
    expect(qtd(1234, 'lead', 'leads')).toBe('1.234 leads');
    expect(nomeCurto('JUROS ABUSIVO (ANDRIUS)')).toBe('JUROS ABUSIVO');
    expect(hhmmDoMinuto(839.6)).toBe('14:00');
    expect(hhmmDoMinuto(811)).toBe('13:31');
  });
  it('normalizador aguenta bloco faltando (RPC antiga, período vazio) e o motor não quebra', () => {
    const s = normalizarSinaisV5({});
    expect(s.numeros).toEqual([]);
    expect(s.equipe).toBeNull();
    expect(s.fechamentos.semanas).toEqual([]);
    const l = lerS(s, AGORA, 'hoje', false);
    expect(l.vazio?.titulo).toBe('Tudo dentro do normal');
    expect(normalizarSinaisV5({ numeros: [{ canal_id: 'x', quedas: [{ inicio: 'lixo' }] }] }).numeros[0].quedas).toEqual([]);
  });
  it('o preset do sinal vence o da tela (troca de período com o sinal antigo ainda na tela)', () => {
    const s = { ...real('2026-10-21-1730-7d'), preset: '7d' as PresetDash };
    expect(montarLeituraV5(s, { agora: new Date(s.agora), preset: 'hoje', admin: true }).titulo).toBe('Leitura do período');
  });
});

/* ====================================================================== */
/* Demo: o contrato                                                        */
/* ====================================================================== */
describe('demo (cenários sobre o MESMO plano de leads)', () => {
  const T = SP('2026-10-22T14:00:00');
  const hoje = { iniISO: '2026-10-22T00:00:00-03:00', fimISO: '2026-10-23T00:00:00-03:00' };
  const janela = { ...hoje, antIniISO: '2026-10-21T00:00:00-03:00', antFimISO: '2026-10-21T14:00:00-03:00', mapaIniISO: '2026-10-16T00:00:00-03:00' };
  const sete = { iniISO: '2026-10-16T00:00:00-03:00', fimISO: '2026-10-23T00:00:00-03:00' };
  const janela7 = { ...sete, antIniISO: '2026-10-09T00:00:00-03:00', antFimISO: '2026-10-15T14:00:00-03:00', mapaIniISO: '2026-10-16T00:00:00-03:00' };

  it('padrão, dia útil 14:00: exatamente os 3 achados (JUROS parado, fila do Matheus, semana boa)', () => {
    const l = montarLeituraV5(demoSinaisV5(hoje, T, true, 'padrao'), { agora: T, preset: 'hoje', admin: true });
    expect(l.achados.map((a) => a.id)).toEqual(['numero_parado:demo-canal-juros', 'atendente_atrasado:demo-u-matheus', 'fechamentos_semana:alta']);
    expect(l.achados[0].titulo).toMatch(/^JUROS ABUSIVO \(ANDRIUS\) sem receber mensagens desde \d\d:\d\d$/);
    expect(l.rodape).toMatch(/^Números de demonstração\./);
  });

  it('padrão: o KPI "Fechados" de Hoje não cai (abaixo de −50%) ao lado da semana boa', () => {
    const d = demoDashV5(janela, T, 'padrao');
    expect(d.kpisAnterior).not.toBeNull();
    const ant = d.kpisAnterior!.ganhos;
    expect(ant === 0 || d.kpis.ganhos >= 0.5 * ant).toBe(true);
  });

  it('padrão: no 7 dias o cartão da semana tem o MESMO número do KPI "Fechados"', () => {
    const s = demoSinaisV5(sete, T, true, 'padrao');
    const l = montarLeituraV5(s, { agora: T, preset: '7d', admin: true });
    const d = demoDashV5(janela7, T, 'padrao');
    const card = l.achados.find((a) => a.tipo === 'fechamentos_semana')!;
    expect(card.titulo.startsWith(`${d.kpis.ganhos} fechados`)).toBe(true);
    expect(s.fechamentos.semanas[0].ganhos).toBe(d.kpis.ganhos);
  });

  it('padrão: sem cliente novo do JUROS no trecho suprimido, na leitura E na tabela', () => {
    const s = demoSinaisV5(hoje, T, true, 'padrao');
    const juros = s.numeros.find((n) => n.canalId === 'demo-canal-juros')!;
    expect(Date.parse(juros.ultimaEntrada!)).toBeLessThan(T.getTime() - (2 * 60 + 50) * 60_000);
    const d = demoDashV5(janela, T, 'padrao');
    expect(d.canais.find((c) => c.canalId === 'demo-canal-juros')!.entradas).toBe(juros.hoje.entradas);
    expect(demoDashV5(janela, T, 'calmo').canais.find((c) => c.canalId === 'demo-canal-juros')!.entradas).toBeGreaterThan(juros.hoje.entradas);
  });

  it('calmo: nada a dizer; incidente: juntos + IA + semana fraca + a rajada nas observações', () => {
    expect(montarLeituraV5(demoSinaisV5(hoje, T, true, 'calmo'), { agora: T, preset: 'hoje', admin: true }).vazio).not.toBeNull();
    const l = montarLeituraV5(demoSinaisV5(hoje, T, true, 'incidente'), { agora: T, preset: 'hoje', admin: true });
    expect(l.achados.map((a) => a.tipo)).toEqual(['numeros_parados_juntos', 'ia_parada', 'fechamentos_semana']);
    expect(l.notas.some((n) => n.id.startsWith('rajada:demo-canal-emprestimo'))).toBe(true);
    // os horários do cartão são os das marcas da tabela (mesma fonte, mesmo minuto) e a prova
    // é a parada quase junta das mensagens
    expect(l.achados[0].frase).toBe('EMPRESTIMO sem mensagens desde 12:09 e JUROS ABUSIVO sem mensagens desde 11:59: as mensagens dos dois pararam com 10 min de diferença, o que aponta para a conexão, não para o anúncio.');
    for (const c of ['demo-canal-emprestimo', 'demo-canal-juros']) expect(l.achados[0].frase).toContain(l.marcadores.numeros[c]!.texto);
  });

  it('cheio: 5 achados, 4 na tela e 1 atrás do "Ver mais"', () => {
    const l = montarLeituraV5(demoSinaisV5(hoje, T, true, 'cheio'), { agora: T, preset: 'hoje', admin: true });
    expect(l.achados.length).toBeGreaterThanOrEqual(5);
    expect(l.visiveis).toBe(4);
    expect(l.achados.map((a) => a.tipo)).toContain('queda_encerrada');
  });

  it('passados do demo seguem o tamanho do período (o mês não repete os números da semana)', () => {
    const s7 = demoSinaisV5(sete, T, true, 'padrao');
    const mes = demoSinaisV5({ iniISO: '2026-10-10T00:00:00-03:00', fimISO: '2026-11-10T00:00:00-03:00' }, T, true, 'padrao');
    const m = (s: SinaisV5) => s.pessoas.find((p) => p.usuarioId === 'demo-u-matheus')!.passados!.n;
    expect(m(mes)).toBeGreaterThan(m(s7));
  });

  it('quem não é admin não recebe pessoas nem nomes', () => {
    const s = demoSinaisV5(hoje, T, false, 'padrao');
    expect(s.pessoas).toEqual([]);
    expect(montarLeituraV5(s, { agora: T, preset: 'hoje', admin: false }).achados.some((a) => a.soAdmin)).toBe(false);
  });
});
