import type { MotivoVigia, QuemDeve, Severidade, VigiaCaso, VigiaDados, VigiaSaude } from './vigiaRespostas';

/* ------------------------------------------------------------------
   Fixture do modo demo do Vigia da Iris — 236 casos no total, mas o painel
   é SÓ DA IRIS (dono 12/11): 9 casos dela, variados; os 198 de atendentes e
   os 29 do robô ficam na fixture de propósito, para provar que o painel os
   deixa de fora. Sorteio com semente FIXA (mulberry32): a mesma lista em toda
   recarga. Só tipos do contrato; nenhum campo que o banco não devolva.
   Variantes (só no demo, via ?vigia=): 'parado', 'erro', 'vazio' e 'cortada'
   (300 casos da Iris na lista, 412 abertos — o corte do banco).
   ------------------------------------------------------------------ */

function mulberry32(a: number): () => number {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PRIMEIROS = [
  'Maria', 'José', 'Antônio', 'Francisca', 'Sebastião', 'Raimunda', 'Terezinha', 'João', 'Geraldo', 'Josefa',
  'Manoel', 'Aparecida', 'Benedito', 'Rita', 'Severino', 'Irene', 'Osvaldo', 'Zilda', 'Antônia', 'Expedita',
  'Valdir', 'Neusa', 'Djalma', 'Marlene', 'Waldemar', 'Creusa', 'Lourdes', 'Arlindo', 'Ivone', 'Durval',
];
const MEIOS = ['de Fátima', 'Carlos', 'das Graças', 'Aparecida', 'do Carmo', 'Luiz', 'Helena', 'Batista', '', '', '', ''];
const SOBRENOMES = [
  'Souza', 'Pereira', 'Ferreira', 'Lima', 'Santos', 'Oliveira', 'Silva', 'Costa', 'Rodrigues', 'Almeida',
  'Nascimento', 'Carvalho', 'Araújo', 'Ribeiro', 'Gomes', 'Martins', 'Barbosa', 'Rocha', 'Dias', 'Moreira',
  'Nunes', 'Mendes', 'Farias', 'Cardoso', 'Ramos', 'Teixeira',
];
const CANAIS = ['JUROS ABUSIVO', 'EMPRESTIMO DIEGO', 'ANTONIO 2.0'];
const DDDS = ['51', '54', '11', '21', '31', '41', '47', '62', '71', '81', '85', '98'];
const MENSAGENS = [
  'Bom dia, alguma novidade?', 'Já mandei os documentos', 'Pode me ligar à tarde?', 'Tenho sim',
  'Oi, ainda tá aí?', 'Quanto tempo demora pra sair?', 'Meu benefício é por invalidez', 'Consigo fazer sendo CLT?',
  'Esse desconto no meu benefício tá certo?', 'Mandei o extrato, recebeu?', 'Qual o número do protocolo?',
  'Pode falar agora', 'Obrigado, fico no aguardo', 'A senhora consegue ver isso pra mim?', '[audio]', '[imagem]',
];

/** 198 donos dos casos de atendente humano (fora do painel; null = sem atendente). */
function poolDonos(rng: () => number): (string | null)[] {
  const pool: (string | null)[] = [];
  const põe = (nome: string | null, n: number) => { for (let i = 0; i < n; i++) pool.push(nome); };
  põe('Juliana Andrade', 59); põe('Matheus Vargas', 46); põe('Giovana Ribeiro', 39);
  põe('Isadora Campos', 32); põe('Luiz Fernando Prates', 17); põe(null, 5);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
}

export function demoVigia({ variante = null }: { variante?: string | null } = {}): VigiaDados {
  const rng = mulberry32(20261112);
  const agora = Date.now();
  const lidoEm = new Date(agora).toISOString();
  const donos = poolDonos(rng);
  let dono = 0;
  let seq = 0;

  const nomeDe = (): string => {
    const p = PRIMEIROS[Math.floor(rng() * PRIMEIROS.length)];
    const m = MEIOS[Math.floor(rng() * MEIOS.length)];
    const s = SOBRENOMES[Math.floor(rng() * SOBRENOMES.length)];
    return [p, m, s].filter(Boolean).join(' ');
  };
  const foneDe = (): string => `55${DDDS[Math.floor(rng() * DDDS.length)]}9${String(10000000 + Math.floor(rng() * 89999999))}`;
  const caso = (quemDeve: QuemDeve, motivo: MotivoVigia, severidade: Severidade, esperaMin: number, extra: Partial<VigiaCaso> = {}): VigiaCaso => {
    seq += 1;
    return {
      casoId: `c${seq}`, conversaId: `v${seq}`,
      nome: nomeDe(), telefone: foneDe(), canal: CANAIS[Math.floor(rng() * CANAIS.length)],
      dono: null, quemDeve, motivo, severidade, esperaMin, tentativasCura: 0,
      ultimaMsg: MENSAGENS[Math.floor(rng() * MENSAGENS.length)],
      abertoEm: new Date(agora - Math.max(0, esperaMin - 5) * 60_000).toISOString(),
      ...extra,
    };
  };
  const humano = (esperaMin: number, severidade: Severidade): VigiaCaso => {
    const d = donos[dono++ % donos.length];
    return caso('humano', d ? 'humano_atrasado' : 'sem_dono', severidade, esperaMin, { dono: d });
  };

  const casos: VigiaCaso[] = [];
  // ---- OS 9 DA IRIS (o painel é só deles) ----
  // Menos de 1 h (3): travada reativada, na fila e a cura esgotada (a exceção em rubro)
  casos.push(caso('iris', 'iris_travada', 'atencao', 18, { dono: 'Matheus Vargas', tentativasCura: 1, ultimaMsg: 'Pode me ligar à tarde?' }));
  casos.push(caso('iris', 'iris_na_fila', 'atencao', 12, { dono: 'Juliana Andrade', ultimaMsg: 'Tenho sim' }));
  casos.push(caso('iris', 'iris_parada', 'critica', 46, { dono: 'Matheus Vargas', tentativasCura: 2, ultimaMsg: 'Oi, ainda tá aí?' }));
  // De 1 h a 24 h (4)
  casos.push(caso('iris', 'iris_na_fila', 'alta', 65, { dono: 'Giovana Ribeiro', ultimaMsg: 'Mandei o extrato, recebeu?' }));
  casos.push(caso('iris', 'iris_travada', 'alta', 180, { dono: 'Isadora Campos', tentativasCura: 2, ultimaMsg: '[audio]' }));
  casos.push(caso('iris', 'iris_parada', 'alta', 310, { dono: 'Matheus Vargas', tentativasCura: 1, ultimaMsg: 'Qual o número do protocolo?' }));
  casos.push(caso('iris', 'iris_na_fila', 'alta', 1320, { dono: 'Luiz Fernando Prates', ultimaMsg: 'Bom dia, alguma novidade?' }));
  // Mais de 24 h (2): uma parada antiga e um número desconectado
  casos.push(caso('iris', 'iris_parada', 'critica', 2980, { dono: 'Juliana Andrade', ultimaMsg: 'Obrigado, fico no aguardo' }));
  casos.push(caso('iris', 'canal_desconectado', 'critica', 4620, { dono: 'Matheus Vargas', ultimaMsg: 'A senhora consegue ver isso pra mim?' }));
  // ---- fora do painel (provam o filtro): 29 do robô e 198 de atendentes ----
  casos.push(caso('robo', 'robo_fluxo', 'atencao', 9, { ultimaMsg: 'Tenho sim' }));
  casos.push(humano(52, 'atencao'));
  for (let i = 0; i < 61; i++) casos.push(humano(60 + Math.floor(rng() * 1380), 'alta'));
  for (let i = 0; i < 10; i++) casos.push(caso('robo', 'robo_fluxo', 'alta', 60 + Math.floor(rng() * 1380)));
  for (let i = 0; i < 136; i++) casos.push(humano(1440 + Math.floor(rng() * (17280 - 1440)), 'critica'));
  for (let i = 0; i < 18; i++) casos.push(caso('robo', 'robo_fluxo', 'critica', 1440 + Math.floor(rng() * (17280 - 1440))));
  // um número desconectado de atendente e alguns dados faltando (a tela precisa aguentar)
  const antigosComDono = casos.filter((c) => c.quemDeve === 'humano' && c.dono && c.esperaMin >= 1440);
  antigosComDono[3].motivo = 'canal_desconectado';
  antigosComDono[5].nome = 'Cliente sem nome';
  antigosComDono[7].telefone = null;
  antigosComDono[9].ultimaMsg = null;

  if (variante === 'cortada') {
    // o corte do banco: a lista vem com 300 casos DA IRIS e há 412 abertos (os mais recentes ficam de fora)
    const base = casos.filter((c) => c.quemDeve === 'iris');
    casos.length = 0;
    casos.push(...base);
    for (let i = 0; i < 291; i++) casos.push(caso('iris', 'iris_parada', 'critica', 1440 + Math.floor(rng() * (17280 - 1440)), { dono: 'Matheus Vargas' }));
  }
  if (variante === 'vazio') casos.length = 0;

  const porSeveridade: Partial<Record<Severidade, number>> = { atencao: 0, alta: 0, critica: 0 };
  for (const c of casos) porSeveridade[c.severidade] = (porSeveridade[c.severidade] ?? 0) + 1;
  if (variante === 'cortada') porSeveridade.atencao = (porSeveridade.atencao ?? 0) + 112; // os cortados são os recentes

  const minutos = variante === 'parado' ? 12 : variante === 'erro' ? 2 : 1;
  const saude: VigiaSaude = {
    vigiaOk: variante !== 'parado' && variante !== 'erro',
    ultimoMinutos: minutos,
    ultimoErro: variante === 'erro' ? 'a conferência terminou com erro' : null,
    ultimoEm: new Date(agora - minutos * 60_000).toISOString(),
    abertos: variante === 'cortada' ? 412 : casos.length,
    porSeveridade,
    resolvidos24h: variante === 'vazio' ? 41 : 37,
    curas24h: 5,
    rodadas24h: 478,
  };
  return { lidoEm, saude, casos };
}
