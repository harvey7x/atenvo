import { describe, expect, it } from 'vitest';
import type { VigiaCaso } from './vigiaRespostas';
import {
  LINHAS_FOCO, VISTA_INICIAL, alertaDe, desdeRotulo, grupoDe, hhmm, iniciaisCliente, limiteDe,
  montarVista, opcoesQuem, passaBusca, rotuloMais, situacaoDe, textoMensagem, type EstadoVista,
} from './vigiaRespostas.vista';

let seq = 0;
const caso = (extra: Partial<VigiaCaso> = {}): VigiaCaso => {
  seq += 1;
  return {
    casoId: `c${seq}`, conversaId: `v${seq}`, nome: `Cliente ${seq}`, telefone: null, canal: 'JUROS',
    dono: 'Juliana Andrade', quemDeve: 'humano', motivo: 'humano_atrasado', severidade: 'alta',
    esperaMin: 100, tentativasCura: 0, ultimaMsg: 'oi', abertoEm: null, ...extra,
  };
};
const estado = (extra: Partial<EstadoVista> = {}): EstadoVista => ({ ...VISTA_INICIAL, ...extra });

// 12/11/2026 é quinta; 15:00 em São Paulo (UTC−3) = 18:00Z
const LIDO = '2026-11-12T18:00:00.000Z';

describe('vista do vigia', () => {
  it('grupoDe nas bordas', () => {
    expect(grupoDe(59)).toBe('menos1h');
    expect(grupoDe(60)).toBe('de1a24h');
    expect(grupoDe(1439)).toBe('de1a24h');
    expect(grupoDe(1440)).toBe('mais24h');
  });

  it('alertaDe: cura esgotada e número desconectado', () => {
    expect(alertaDe(caso({ quemDeve: 'iris', severidade: 'critica', esperaMin: 46 }))).toBe('cura_esgotada');
    expect(alertaDe(caso({ quemDeve: 'iris', severidade: 'critica', esperaMin: 2000 }))).toBeNull();
    expect(alertaDe(caso({ quemDeve: 'iris', severidade: 'alta', esperaMin: 46 }))).toBeNull();
    expect(alertaDe(caso({ motivo: 'canal_desconectado' }))).toBe('numero_desconectado');
    expect(alertaDe(caso({ severidade: 'critica' }))).toBeNull();
  });

  it('situacaoDe: quem, motivo curto, reativações e título', () => {
    const s1 = situacaoDe(caso({ quemDeve: 'iris', motivo: 'iris_travada', severidade: 'atencao', tentativasCura: 1, dono: 'Matheus Vargas' }));
    expect(s1.quem).toBe('Iris');
    expect(s1.nota).toBe('travada · reativada 1 vez');
    const s2 = situacaoDe(caso({ quemDeve: 'iris', motivo: 'iris_parada', severidade: 'critica', esperaMin: 46, tentativasCura: 2 }));
    expect(s2.alerta).toBe('cura_esgotada');
    expect(s2.nota).toBe('não voltou depois de 2 tentativas');
    const s3 = situacaoDe(caso({ dono: null, motivo: 'sem_dono' }));
    expect(s3.tipo).toBe('sem');
    expect(s3.quem).toBe('Sem atendente');
    const s4 = situacaoDe(caso({ dono: 'Juliana Andrade' }));
    expect(s4.quem).toBe('Juliana');
    expect(s4.titulo).toBe('Atendente ainda não respondeu · cliente de Juliana Andrade');
  });

  it('ordenação: exceções primeiro, depois espera decrescente, por fim o nome', () => {
    const casos = [
      caso({ nome: 'Bruno', esperaMin: 100 }),
      caso({ nome: 'Ana', esperaMin: 200 }),
      caso({ nome: 'Alberto', esperaMin: 100 }),
      caso({ nome: 'Desconectado', esperaMin: 70, motivo: 'canal_desconectado' }),
      caso({ nome: 'Iris sem volta', esperaMin: 90, quemDeve: 'iris', motivo: 'iris_parada', severidade: 'critica', tentativasCura: 2 }),
    ];
    const v = montarVista(casos, estado());
    const g = v.grupos.find((x) => x.id === 'de1a24h')!;
    expect(g.linhas.map((c) => c.nome)).toEqual(['Iris sem volta', 'Desconectado', 'Ana', 'Alberto', 'Bruno']);
  });

  it('limites: até 5 mostra todas; com 6 mostra 3 e sobram 3; o foco começa com 20', () => {
    const cinco = montarVista(Array.from({ length: 5 }, () => caso()), estado());
    expect(cinco.grupos.find((g) => g.id === 'de1a24h')!.linhas).toHaveLength(5);
    expect(cinco.grupos.find((g) => g.id === 'de1a24h')!.restantes).toBe(0);
    const seis = montarVista(Array.from({ length: 6 }, () => caso()), estado());
    expect(seis.grupos.find((g) => g.id === 'de1a24h')!.linhas).toHaveLength(3);
    expect(seis.grupos.find((g) => g.id === 'de1a24h')!.restantes).toBe(3);
    expect(limiteDe(estado({ espera: 'de1a24h' }), 'de1a24h')).toBe(LINHAS_FOCO);
    const foco = montarVista(Array.from({ length: 25 }, () => caso()), estado({ espera: 'de1a24h' }));
    expect(foco.grupos).toHaveLength(1);
    expect(foco.grupos[0].linhas).toHaveLength(20);
    expect(foco.grupos[0].restantes).toBe(5);
  });

  it('a faixa respeita o quem (e a busca), não a própria espera', () => {
    const casos = [
      caso({ dono: 'Juliana Andrade', esperaMin: 30 }),
      caso({ dono: 'Juliana Andrade', esperaMin: 2000 }),
      caso({ dono: 'Luiz Prates', esperaMin: 30 }),
    ];
    const v = montarVista(casos, estado({ quem: 'p:Juliana Andrade', espera: 'mais24h' }));
    expect(v.faixa.menos1h.n).toBe(1);
    expect(v.faixa.mais24h.n).toBe(1);
    expect(v.filtrados).toBe(2);
    expect(v.grupos).toHaveLength(1);
    expect(v.grupos[0].id).toBe('mais24h');
  });

  it('com filtro de pessoa as seções vazias somem; a faixa isolada vazia fica', () => {
    const casos = [caso({ esperaMin: 2000 })];
    const soFaixa = montarVista(casos, estado({ espera: 'menos1h' }));
    expect(soFaixa.grupos).toHaveLength(1);
    expect(soFaixa.grupos[0].total).toBe(0);
    const comQuem = montarVista(casos, estado({ quem: 'p:Ninguém' }));
    expect(comQuem.grupos).toHaveLength(0);
  });

  it('opcoesQuem: ordem por casos, Iris e Robô com 0, homônimos com nome completo', () => {
    const casos = [
      caso({ dono: 'Juliana Andrade' }), caso({ dono: 'Juliana Andrade' }),
      caso({ dono: 'Ana Paula Souza' }), caso({ dono: 'Ana Clara Lima' }),
      caso({ dono: null, motivo: 'sem_dono' }),
    ];
    const ops = opcoesQuem(casos);
    expect(ops.map((o) => o.rotulo)).toEqual(['Iris', 'Robô', 'Juliana', 'Ana Clara Lima', 'Ana Paula Souza', 'Sem atendente']);
    expect(ops[0].n).toBe(0);
    expect(ops[2].n).toBe(2);
    // sem "sem atendente" quando não há caso sem dono
    expect(opcoesQuem([caso()]).some((o) => o.chave === 'sem')).toBe(false);
  });

  it('textoMensagem traduz os códigos de mídia', () => {
    expect(textoMensagem('[audio]')).toEqual({ texto: 'Mensagem de voz', midia: true });
    expect(textoMensagem('[imagem]')).toEqual({ texto: 'Imagem', midia: true });
    expect(textoMensagem('[video]')).toEqual({ texto: 'Vídeo', midia: true });
    expect(textoMensagem('[documento]')).toEqual({ texto: 'Documento', midia: true });
    expect(textoMensagem('[sticker]')).toEqual({ texto: 'Mensagem sem texto', midia: true });
    expect(textoMensagem('tudo bem?')).toEqual({ texto: 'tudo bem?', midia: false });
    expect(textoMensagem(null)).toEqual({ texto: '—', midia: false });
  });

  it('desdeRotulo: hoje, ontem, dia da semana e data (fuso de São Paulo)', () => {
    expect(desdeRotulo(118, LIDO)).toBe('desde 13:02');
    expect(desdeRotulo(1220, LIDO)).toBe('desde ontem, 18:40');
    expect(desdeRotulo(4666, LIDO)).toBe('desde seg, 09:14');
    expect(desdeRotulo(10380, LIDO)).toBe('desde 05/11');
  });

  it('hhmm e iniciais do cliente', () => {
    expect(hhmm(LIDO)).toBe('15:00');
    expect(hhmm(null)).toBe('—');
    expect(iniciaisCliente('Maria de Fátima Souza')).toBe('MS');
    expect(iniciaisCliente('Maria')).toBe('M');
    expect(iniciaisCliente('Cliente sem nome')).toBe('·');
  });

  it('busca: sem acento, sem caixa e por dígitos do telefone', () => {
    const c = caso({ nome: 'José Carlos Pereira', telefone: '5551994261234' });
    expect(passaBusca(c, 'jose')).toBe(true);
    expect(passaBusca(c, 'CARLOS')).toBe(true);
    expect(passaBusca(c, '99426')).toBe(true);
    expect(passaBusca(c, '(51) 99426')).toBe(true);
    expect(passaBusca(c, 'antonia')).toBe(false);
    expect(passaBusca(c, '')).toBe(true);
    const v = montarVista([c, caso({ nome: 'Antônia Lima' })], estado({ busca: 'jose' }));
    expect(v.filtrados).toBe(1);
    expect(v.grupos).toHaveLength(1); // seções vazias somem com a busca
  });

  it('rotuloMais', () => {
    expect(rotuloMais(1)).toBe('Mostrar o outro');
    expect(rotuloMais(4)).toBe('Mostrar os outros 4');
    expect(rotuloMais(20)).toBe('Mostrar os outros 20');
    expect(rotuloMais(136)).toBe('Mostrar mais 20 · faltam 136');
  });
});
