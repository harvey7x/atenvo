import { describe, expect, it } from 'vitest';
import { idsUltimasFaltando, juntarUltimas, mapConversa, SELECT_CONVERSAS, type DbConv, type DbConvBruta, type DbMsg } from './whatsapp';
import type { WaContact } from './whatsappDemo';

/* Lista do inbox com só a última mensagem real (embed `real`) + a última de qualquer tipo
   (embed `ult`) em vez das 10 últimas. Regra-mãe: os derivados do card — preview (`last`),
   `aguardando`, `aguardandoDesde`, `lastAtMs` e `time` — têm de sair IGUAIS aos de antes.

   Cada fixture é o histórico COMPLETO de uma conversa. Daqui saem as três entradas que o
   mapConversa recebe, montadas exatamente como o PostgREST monta os embeds:
     - dez(h)   = formato antigo: as 10 últimas por criado_em desc
     - novo(h)  = formato novo: real = a última NÃO sistema/nota_interna por enviada_em desc (1);
                  ult = a última de qualquer tipo por enviada_em desc (1)
     - tudo(h)  = referência: o cálculo antigo sobre o histórico inteiro (o que as 10 dariam se
                  nunca faltasse mensagem na janela) */

let seq = 0;
const T0 = Date.parse('2026-10-20T12:00:00.000Z');
const iso = (seg: number) => new Date(T0 + seg * 1000).toISOString();

type MsgIn = Partial<DbMsg> & { seg: number; envSeg?: number };
/** `seg` = criado_em (s após T0); `envSeg` = enviada_em quando difere (áudio do celular etc.). */
function msg({ seg, envSeg, ...m }: MsgIn): DbMsg {
  const criado = iso(seg);
  const env = iso(envSeg ?? seg);
  const direcao = m.direcao ?? 'entrada';
  return {
    id: m.id ?? `m${++seq}`,
    direcao,
    conteudo: m.conteudo === undefined ? 'oi' : m.conteudo,
    tipo: m.tipo ?? 'texto',
    // como no banco: enviada_em é NOT NULL (default now()); recebida_em só na entrada
    enviada_em: env,
    recebida_em: m.recebida_em === undefined ? (direcao === 'entrada' ? env : null) : m.recebida_em,
    criado_em: criado,
    origem: m.origem ?? null,
    status: m.status ?? (direcao === 'entrada' ? 'recebida' : 'enviada'),
    erro_envio: null,
    id_externo: null,
    respondida_a_id: null,
    metadados: m.metadados ?? {},
  };
}

function conv(hist: DbMsg[], extra: Partial<DbConv> = {}): Omit<DbConv, 'mensagens' | 'real' | 'ult'> {
  const ultima = [...hist].sort((a, b) => Date.parse(b.enviada_em!) - Date.parse(a.enviada_em!))[0];
  return {
    id: 'c1', status: 'aberta', status_id: null, nao_lidas: 0,
    ultima_interacao_em: ultima ? ultima.enviada_em : null,
    criado_em: iso(-100000),
    precisa_humano: false, precisa_humano_motivo: null, precisa_humano_em: null,
    atendente_id: null, etiquetas: null,
    ultimo_canal_id: null, ultimo_numero: null, ultimo_provider: null, ultima_msg_canal_em: null,
    arquivada_em: null, fixada_em: null, silenciada_ate: null,
    contatos: { id: 'k1', nome: 'Maria', telefone: '5551999999999', email: null, etiquetas: null, origem: null, observacoes: null, responsavel_id: null, contato_identidades: [{ tipo: 'whatsapp' }] },
    canais: { id: 'ch1', nome_interno: 'ANDRIUS' },
    ...extra,
  };
}

const porCriadoDesc = (a: DbMsg, b: DbMsg) => Date.parse(b.criado_em!) - Date.parse(a.criado_em!);
const porEnviadaDesc = (a: DbMsg, b: DbMsg) => Date.parse(b.enviada_em!) - Date.parse(a.enviada_em!);
const ehReal = (m: DbMsg) => m.tipo !== 'sistema' && m.tipo !== 'nota_interna';

const dez = (h: DbMsg[]) => [...h].sort(porCriadoDesc).slice(0, 10);
const real = (h: DbMsg[]) => h.filter(ehReal).sort(porEnviadaDesc).slice(0, 1);
const ult = (h: DbMsg[]) => [...h].sort(porEnviadaDesc).slice(0, 1);

const derivados = (c: DbConv) => {
  const w = mapConversa(c);
  return { last: w.last, aguardando: w.aguardando, aguardandoDesde: w.aguardandoDesde, lastAtMs: w.lastAtMs, time: w.time };
};
function tres(hist: DbMsg[], extra: Partial<DbConv> = {}) {
  const base = conv(hist, extra);
  return {
    antigo: derivados({ ...base, mensagens: dez(hist) }),
    novo: derivados({ ...base, real: real(hist), ult: ult(hist) }),
    referencia: derivados({ ...base, mensagens: [...hist].sort(porCriadoDesc) }),
  };
}

describe('lista do inbox: real+ult × 10 últimas (mesmos derivados)', () => {
  it('12 notas internas depois de uma entrada: o novo acha a entrada (as 10 erravam)', () => {
    const hist = [
      msg({ seg: 0, direcao: 'saida', conteudo: 'Bom dia, como posso ajudar?' }),
      msg({ seg: 10, direcao: 'entrada', conteudo: 'Quero revisar meu contrato' }),
      ...Array.from({ length: 12 }, (_, i) => msg({ seg: 20 + i, direcao: 'saida', tipo: 'nota_interna', conteudo: `nota ${i + 1}` })),
    ];
    const { antigo, novo, referencia } = tres(hist);
    // a referência (histórico inteiro): cliente aguardando, preview = a entrada
    expect(referencia.aguardando).toBe(true);
    expect(referencia.last).toBe('Quero revisar meu contrato');
    expect(referencia.aguardandoDesde).toBe(iso(10));
    // o novo bate com a referência em tudo
    expect(novo).toEqual(referencia);
    // e o antigo (janela de 10 só com notas) é o caso que errava: documenta o bug corrigido
    expect(antigo.aguardando).toBe(false);
    expect(antigo.last).toBe('nota 12');
  });

  it('conversa só com mensagens de sistema: sem real, preview cai na última de qualquer tipo', () => {
    const hist = [
      msg({ seg: 0, direcao: 'saida', tipo: 'sistema', conteudo: 'Conversa iniciada pelo anúncio' }),
      msg({ seg: 5, direcao: 'saida', tipo: 'sistema', conteudo: 'Atribuída a Luiza' }),
    ];
    const { antigo, novo, referencia } = tres(hist);
    expect(novo).toEqual(antigo);
    expect(novo).toEqual(referencia);
    expect(novo.aguardando).toBe(false);
    expect(novo.aguardandoDesde).toBeNull();
    expect(novo.last).toBe('Atribuída a Luiza');
  });

  it('mídia sem legenda (imagem com anexo) de entrada: rótulo "Imagem" e aguardando', () => {
    const hist = [
      msg({ seg: 0, direcao: 'saida', conteudo: 'Me manda a foto do contracheque' }),
      msg({ seg: 30, direcao: 'entrada', tipo: 'imagem', conteudo: null, metadados: { anexo_path: 'org/c1/img.jpg', mime: 'image/jpeg' } }),
    ];
    const { antigo, novo, referencia } = tres(hist);
    expect(novo).toEqual(antigo);
    expect(novo).toEqual(referencia);
    expect(novo.last).toBe('Imagem');
    expect(novo.aguardando).toBe(true);
    expect(novo.aguardandoDesde).toBe(iso(30));
  });

  it('mídia pendente (download falhou, sem anexo) continua contando como última real', () => {
    const hist = [
      msg({ seg: 0, direcao: 'saida', conteudo: 'Pode mandar o documento' }),
      msg({ seg: 40, direcao: 'entrada', tipo: 'documento', conteudo: null, metadados: { midia_pendente: true } }),
    ];
    const { antigo, novo } = tres(hist);
    expect(novo).toEqual(antigo);
    expect(novo.last).toBe('Documento');
    expect(novo.aguardando).toBe(true);
  });

  it('áudio com seconds: "Mensagem de voz (0:12)"; áudio não-ptt: "Áudio"', () => {
    const voz = [
      msg({ seg: 0, direcao: 'saida', conteudo: 'Pode falar' }),
      msg({ seg: 9, direcao: 'entrada', tipo: 'audio', conteudo: null, metadados: { anexo_path: 'org/c1/a.ogg', seconds: 12, ptt: true } }),
      msg({ seg: 12, direcao: 'saida', tipo: 'nota_interna', conteudo: 'cliente mandou áudio' }),
    ];
    const r1 = tres(voz);
    expect(r1.novo).toEqual(r1.antigo);
    expect(r1.novo.last).toBe('Mensagem de voz (0:12)');
    expect(r1.novo.aguardando).toBe(true);

    const audio = [msg({ seg: 0, direcao: 'saida', tipo: 'audio', conteudo: null, metadados: { anexo_path: 'org/c1/b.mp3', seconds: 75, ptt: false } })];
    const r2 = tres(audio);
    expect(r2.novo).toEqual(r2.antigo);
    expect(r2.novo.last).toBe('Áudio (1:15)');
    expect(r2.novo.aguardando).toBe(false);
  });

  it('áudio enviado pelo celular (criado depois, enviado antes) + texto: a última é o texto', () => {
    // caso real de produção (4 conversas em 20/10): o áudio é gravado em `mensagens` só depois de
    // baixar a mídia, então criado_em > o do texto mandado em seguida, mas enviada_em < .
    const hist = [
      msg({ seg: 0, direcao: 'entrada', conteudo: 'Como fica o contrato?' }),
      msg({ seg: 5, envSeg: 2, direcao: 'saida', tipo: 'audio', conteudo: null, origem: 'telefone', metadados: { anexo_path: 'org/c1/x.ogg', seconds: 30, ptt: true } }),
      msg({ seg: 4, envSeg: 4, direcao: 'saida', conteudo: 'Te expliquei no áudio acima' }),
    ];
    const { antigo, novo, referencia } = tres(hist);
    expect(novo).toEqual(antigo);
    expect(novo).toEqual(referencia);
    expect(novo.last).toBe('Te expliquei no áudio acima');
    // por criado_em (a ordem do índice antigo) o preview viraria o áudio — por isso enviada_em
    const realPorCriado = hist.filter(ehReal).sort(porCriadoDesc).slice(0, 1);
    const errado = derivados({ ...conv(hist), real: realPorCriado, ult: [...hist].sort(porCriadoDesc).slice(0, 1) });
    expect(errado.last).toBe('Mensagem de voz (0:30)');
  });

  it('saída depois da entrada: não aguarda; conversa resolvida com entrada: não aguarda', () => {
    const resp = [msg({ seg: 0, direcao: 'entrada', conteudo: 'oi' }), msg({ seg: 60, direcao: 'saida', conteudo: 'Olá! Sou da CAF.' })];
    const r1 = tres(resp);
    expect(r1.novo).toEqual(r1.antigo);
    expect(r1.novo.aguardando).toBe(false);

    const fechada = [msg({ seg: 0, direcao: 'saida', conteudo: 'Obrigado!' }), msg({ seg: 60, direcao: 'entrada', conteudo: 'valeu' })];
    const r2 = tres(fechada, { status: 'resolvida' });
    expect(r2.novo).toEqual(r2.antigo);
    expect(r2.novo.aguardando).toBe(false);
    expect(r2.novo.aguardandoDesde).toBeNull();
  });

  it('sem ultima_interacao_em: lastAtMs e time saem da última mensagem, igual a antes', () => {
    const hist = [
      msg({ seg: 0, direcao: 'saida', conteudo: 'Olá' }),
      msg({ seg: 70, direcao: 'entrada', conteudo: 'Oi' }),
      msg({ seg: 90, direcao: 'saida', tipo: 'sistema', conteudo: 'IA pausada' }),
    ];
    const r = tres(hist, { ultima_interacao_em: null });
    expect(r.novo).toEqual(r.antigo);
    expect(r.novo.lastAtMs).toBe(T0 + 70_000);
    expect(r.novo.time).not.toBe('');
  });

  it('conversa sem nenhuma mensagem: preview vazio, lastAtMs = criação', () => {
    const r = tres([], { ultima_interacao_em: null });
    expect(r.novo).toEqual(r.antigo);
    expect(r.novo.last).toBe('');
    expect(r.novo.aguardando).toBe(false);
    expect(r.novo.lastAtMs).toBe(Date.parse(iso(-100000)));
  });

  it('real e ult são a MESMA linha (caso comum): msgs do card não duplica', () => {
    const hist = [msg({ id: 'a', seg: 0, direcao: 'saida', conteudo: 'Olá' }), msg({ id: 'b', seg: 10, direcao: 'entrada', conteudo: 'Oi' })];
    const w = mapConversa({ ...conv(hist), real: real(hist), ult: ult(hist) });
    expect(w.msgs.map((m) => m.id)).toEqual(['b']);
  });

  it('última é nota interna: o card leva a real e a nota (1ª pintura), em ordem cronológica', () => {
    const hist = [
      msg({ id: 'a', seg: 0, direcao: 'entrada', conteudo: 'Oi' }),
      msg({ id: 'n', seg: 10, direcao: 'saida', tipo: 'nota_interna', conteudo: 'ligar amanhã' }),
    ];
    const w = mapConversa({ ...conv(hist), real: real(hist), ult: ult(hist) });
    expect(w.msgs.map((m) => m.id)).toEqual(['a', 'n']);
    expect(w.last).toBe('Oi');
    expect(w.aguardando).toBe(true);
  });

  it('embeds nulos/vazios não quebram (conversa sem mensagem vinda do PostgREST como [])', () => {
    const base = conv([]);
    expect(() => mapConversa({ ...base, real: [], ult: [] })).not.toThrow();
    expect(() => mapConversa({ ...base, real: null, ult: null })).not.toThrow();
    expect(mapConversa({ ...base, real: [], ult: [] }).msgs).toEqual([]);
  });
});

describe('SELECT_CONVERSAS (fonte única da lista)', () => {
  it('traz os embeds real e ult e não traz mais o embed das 10 mensagens', () => {
    expect(SELECT_CONVERSAS).toContain('real:mensagens(');
    expect(SELECT_CONVERSAS).toContain('ult:mensagens(');
    expect(SELECT_CONVERSAS).not.toMatch(/(^|[ ,])mensagens\(/);
  });
  it('lista leve: a `real` traz o que o card e a bolha usam (metadados inclusive), sem id_externo/respondida_a_id', () => {
    const cols = SELECT_CONVERSAS.match(/real:mensagens\(([^)]*)\)/)![1].split(', ');
    for (const c of ['id', 'direcao', 'conteudo', 'tipo', 'enviada_em', 'recebida_em', 'criado_em', 'origem', 'status', 'erro_envio', 'metadados']) {
      expect(cols).toContain(c);
    }
    expect(cols).not.toContain('id_externo');
    expect(cols).not.toContain('respondida_a_id');
  });
  it('lista leve: a `ult` vem só com o id; ultima_lida_em saiu (nenhum uso no front)', () => {
    expect(SELECT_CONVERSAS.match(/ult:mensagens\(([^)]*)\)/)![1]).toBe('id');
    expect(SELECT_CONVERSAS).not.toContain('ultima_lida_em');
  });
});

/* LISTA LEVE (30/10): o banco manda a `real` sem id_externo/respondida_a_id e a `ult` só com o id;
   completarUltimas busca pelo id a `ult` que difere da `real`. Regra-mãe: o card sai IGUAL ao da
   lista cheia — todos os campos, inclusive as bolhas da 1ª pintura, menos os dois ids de resposta
   (que vêm com o histórico ao abrir a conversa). */
describe('lista leve: ult só id + completar × real+ult inteiras', () => {
  const comIdsResposta = (m: DbMsg): DbMsg => ({ ...m, id_externo: 'wamid.' + m.id, respondida_a_id: 'r-' + m.id });
  const semIdsResposta = ({ id_externo: _e, respondida_a_id: _r, ...m }: DbMsg): DbMsg => m;
  const cheia = (hist: DbMsg[], extra: Partial<DbConv> = {}): DbConv => ({ ...conv(hist, extra), real: real(hist), ult: ult(hist) });
  const bruta = (hist: DbMsg[], extra: Partial<DbConv> = {}): DbConvBruta => ({
    ...conv(hist, extra), real: real(hist).map(semIdsResposta), ult: ult(hist).map((m) => ({ id: m.id })),
  });
  /** o que completarUltimas faz, sem a rede: a linha da `ult` vem do banco (sem os ids de resposta) */
  const leve = (hist: DbMsg[], extra: Partial<DbConv> = {}): DbConv => {
    const b = bruta(hist, extra);
    const banco = new Map(hist.map((m) => [m.id, semIdsResposta(m)]));
    const porId = new Map(idsUltimasFaltando([b]).map((id) => [id, banco.get(id)!]));
    return juntarUltimas([b], porId)[0];
  };
  const semIdsNaBolha = (w: WaContact) => ({ ...w, msgs: w.msgs.map(({ idExterno: _e, respondidaAId: _r, ...m }) => m) });

  const casos: Record<string, { hist: DbMsg[]; extra?: Partial<DbConv> }> = {
    'entrada simples (real = ult)': { hist: [msg({ seg: 0, direcao: 'saida', conteudo: 'Olá' }), msg({ seg: 10, direcao: 'entrada', conteudo: 'Quero revisar' })] },
    'nota interna depois da entrada (ult ≠ real)': { hist: [msg({ seg: 0, direcao: 'entrada', conteudo: 'Oi' }), msg({ seg: 10, direcao: 'saida', tipo: 'nota_interna', conteudo: 'ligar amanhã' })] },
    'só mensagens de sistema (sem real)': { hist: [msg({ seg: 0, direcao: 'saida', tipo: 'sistema', conteudo: 'Conversa iniciada pelo anúncio' }), msg({ seg: 5, direcao: 'saida', tipo: 'sistema', conteudo: 'Atribuída a Luiza' })] },
    'imagem sem legenda + sistema depois': { hist: [msg({ seg: 0, direcao: 'saida', conteudo: 'Manda a foto' }), msg({ seg: 30, direcao: 'entrada', tipo: 'imagem', conteudo: null, metadados: { anexo_path: 'org/c1/img.jpg', mime: 'image/jpeg' } }), msg({ seg: 40, direcao: 'saida', tipo: 'sistema', conteudo: 'IA pausada' })] },
    'áudio do celular (criado depois, enviado antes) + texto': { hist: [msg({ seg: 0, direcao: 'entrada', conteudo: 'Como fica?' }), msg({ seg: 5, envSeg: 2, direcao: 'saida', tipo: 'audio', conteudo: null, origem: 'telefone', metadados: { anexo_path: 'org/c1/x.ogg', seconds: 30, ptt: true } }), msg({ seg: 4, envSeg: 4, direcao: 'saida', conteudo: 'Te expliquei no áudio' })] },
    'citação na última real': { hist: [msg({ seg: 0, direcao: 'saida', conteudo: 'Qual o banco?' }), msg({ seg: 9, direcao: 'entrada', conteudo: 'BMG', metadados: { quoted: { remetente: 'Você', tipo: 'texto', texto: 'Qual o banco?' } } })] },
    'sem ultima_interacao_em (time sai da bolha)': { hist: [msg({ seg: 0, direcao: 'saida', conteudo: 'Olá' }), msg({ seg: 70, direcao: 'entrada', conteudo: 'Oi' }), msg({ seg: 90, direcao: 'saida', tipo: 'sistema', conteudo: 'IA pausada' })], extra: { ultima_interacao_em: null } },
    'sem nenhuma mensagem': { hist: [], extra: { ultima_interacao_em: null } },
    'resolvida com entrada': { hist: [msg({ seg: 0, direcao: 'saida', conteudo: 'Obrigado!' }), msg({ seg: 60, direcao: 'entrada', conteudo: 'valeu' })], extra: { status: 'resolvida' } },
  };
  for (const [nome, { hist: h0, extra }] of Object.entries(casos)) {
    it(nome, () => {
      const hist = h0.map(comIdsResposta);
      const antes = mapConversa(cheia(hist, extra));
      const depois = mapConversa(leve(hist, extra));
      expect(semIdsNaBolha(depois)).toEqual(semIdsNaBolha(antes));
      // a única diferença: os ids de resposta, que só a lista cheia trazia
      expect(depois.msgs.every((m) => m.idExterno === undefined && m.respondidaAId === undefined)).toBe(true);
    });
  }

  it('só pede ao banco a `ult` que não é a `real` (o caso comum não custa consulta)', () => {
    const igual = bruta([msg({ id: 'a', seg: 0 }), msg({ id: 'b', seg: 10 })]);
    const nota = bruta([msg({ id: 'c', seg: 0 }), msg({ id: 'd', seg: 10, tipo: 'nota_interna' })]);
    const soSistema = bruta([msg({ id: 'e', seg: 0, tipo: 'sistema' })]);
    const vazia = bruta([]);
    expect(idsUltimasFaltando([igual, nota, soSistema, vazia])).toEqual(['d', 'e']);
  });

  it('a `ult` que sumiu entre as leituras (apagada) cai fora; a `real` segue no card', () => {
    const b = bruta([msg({ id: 'r', seg: 0, direcao: 'entrada', conteudo: 'oi' }), msg({ id: 'n', seg: 10, tipo: 'nota_interna', conteudo: 'x' })]);
    const [c] = juntarUltimas([b], new Map());
    expect(c.ult).toEqual([]);
    const w = mapConversa(c);
    expect(w.msgs.map((m) => m.id)).toEqual(['r']);
    expect(w.last).toBe('oi');
    expect(w.aguardando).toBe(true);
  });
});
