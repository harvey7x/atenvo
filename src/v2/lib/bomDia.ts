/* Bom dia do Atenvo (pedido do dono 30/10): "todo dia às 8 da manhã… olá, nome do atendente,
   seja bem-vindo ao Atenvo. Hoje você tem X novos clientes, Y clientes sem resposta,
   informações importantes" — com uma IA de voz feminina falando. Substitui a Intro do dia
   (28/08). Sem cron: a chave guarda a DATA LOCAL da última exibição.
   DOIS MOMENTOS (dono 30/10, rodada do administrador): às 8h para TODOS (o resumo da manhã)
   e às 17h só para o GESTOR (o "diagnóstico do dia"). "Às 8 horas tem que dar o reset… não
   importa se ele logar meio-dia": quem entra depois do horário vê ao entrar. A tela NUNCA fala
   sozinha — mostra a saudação e um botão de play (o clique libera o som do navegador).
   - antes das 8h a tela não abre;
   - o sistema aberto às 8h (e às 17h, gestor) abre na hora (o shell agenda o disparo);
   - quem entra depois vê ao entrar. Chave por usuário, como tema.ts. */

import { generoProvavel } from './fotoIlustrativa';

export const HORA_BOM_DIA = 8;
/** O resumo do fim do dia do gestor (dono 30/10: "no final do dia, às 5 horas"). */
export const HORA_FIM_DIA = 17;

export type Momento = 'manha' | 'tarde';

const PREFIXO = 'atenvo-bomdia';
/** manhã: `atenvo-bomdia:<uid>` (a chave de sempre); tarde: `atenvo-bomdia-tarde:<uid>` */
const chave = (escopo?: string, momento: Momento = 'manha'): string => {
  const base = momento === 'tarde' ? `${PREFIXO}-tarde` : PREFIXO;
  return escopo ? `${base}:${escopo}` : base;
};

/** Data LOCAL (não UTC: o dia do atendente vira à meia-noite DELE). */
export function hojeLocal(agora = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${agora.getFullYear()}-${p(agora.getMonth() + 1)}-${p(agora.getDate())}`;
}

/** Qual resumo está DEVIDO agora (null = nenhum):
    - gestor depois das 17h: o da tarde, se ainda não viu hoje (a manhã fica superada);
    - senão, depois das 8h: o da manhã, se ainda não viu hoje. */
export function momentoDevido(escopo?: string, agora = new Date(), o: { gestor: boolean } = { gestor: false }): Momento | null {
  const h = agora.getHours();
  const hoje = hojeLocal(agora);
  try {
    if (o.gestor && h >= HORA_FIM_DIA) return localStorage.getItem(chave(escopo, 'tarde')) !== hoje ? 'tarde' : null;
    if (h >= HORA_BOM_DIA && localStorage.getItem(chave(escopo, 'manha')) !== hoje) return 'manha';
    return null;
  } catch {
    /* storage indisponível: sem como lembrar "já vi" — melhor não insistir a cada load */
    return null;
  }
}

/** Marca na ABERTURA (não no fechar): outra aba aberta no horário não abre de novo. */
export function marcarMomentoVisto(escopo: string | undefined, momento: Momento, agora = new Date()): void {
  try {
    localStorage.setItem(chave(escopo, momento), hojeLocal(agora));
  } catch {
    /* sem persistir: volta no próximo load, aceitável */
  }
}

/** "Ouvir o bom dia" do menu: o resumo do momento atual (gestor depois das 17h = o da tarde). */
export const momentoAtual = (agora = new Date(), o: { gestor: boolean } = { gestor: false }): Momento =>
  (o.gestor && agora.getHours() >= HORA_FIM_DIA ? 'tarde' : 'manha');

/* ------------------------------------------------------------------
   APRESENTAÇÃO DE LANÇAMENTO (dono 30/10, fechamento: "tu faz a IA meio
   que fazer uma apresentação… mostrar para o Murilo como ficaria essa
   mensagem quando ele começasse o dia e como terminaria no final").
   Só o GESTOR e SÓ pelo menu do usuário ("Apresentação do bom dia"):
   ela NÃO abre sozinha (dono 30/10 17h25: "quando ele entrar, eu quero
   que mostre a análise do final do dia") — ao entrar, o momento normal.
   ------------------------------------------------------------------ */

/** O que a tela toca: o resumo de um momento ou a apresentação (as duas falas do gestor). */
export type TipoTela = Momento | 'apresentacao';

/** O perfil do bom dia (RPC bom_dia_modo): 'gestor' = quem está em bom_dia_gestores (o Murilo). */
export type ModoBomDia = 'gestor' | 'vendedor';

/** A tela aberta: o momento E o dia (data local) em que ela abriu — a identidade da tela. */
export interface TelaBomDia {
  momento: Momento;
  dia: string;
  /** a apresentação de lançamento (gestor), aberta pelo menu do usuário */
  apresentacao?: boolean;
}

/** A Central de Avisos (/radar) no perfil GESTOR (dono 30/10: "a central de avisos não precisa aparecer por
    enquanto"): a rota acessada por URL vai para o Dashboard. Perfil ainda não lido → espera (a Central nunca
    pisca para o gestor). Matheus e atendentes: a Central de sempre. */
export function destinoDaCentral(modo: ModoBomDia | null): 'central' | 'dashboard' | 'esperar' {
  if (modo === 'gestor') return 'dashboard';
  return modo === 'vendedor' ? 'central' : 'esperar';
}

export const tipoDaTela = (t: Pick<TelaBomDia, 'momento' | 'apresentacao'>): TipoTela => (t.apresentacao ? 'apresentacao' : t.momento);

/** A key da tela (o Hud remonta quando muda): outro dia = outra tela, com números e voz preparados de novo. */
export const chaveTelaBomDia = (t: TelaBomDia): string => `${tipoDaTela(t)}-${t.dia}`;

/** Um momento está DEVIDO: qual tela fica? (dono 30/10: "às 8 horas tem que dar o reset")
    - nada aberto → a do momento devido, de hoje (o shell nunca pede a apresentação aqui: ela é só do menu);
    - a tela aberta é de OUTRO dia (ficou aberta de um dia para o outro: falta, fim de semana com o notebook
      no site) → dá lugar à de hoje. Antes ela ficava: o dia novo era marcado como visto e o play falava os
      números do dia em que a tela abriu;
    - a tela é de hoje, do mesmo momento e do mesmo tipo → fica a MESMA (o mesmo objeto: nada remonta);
    - a tela é de hoje e é OUTRA (a manhã esquecida aberta até as 17h; a apresentação aberta quando chega a
      hora de um resumo) → 'esperar' (abre quando fechar). */
export function proximaTelaBomDia(
  atual: TelaBomDia | null, devido: Momento, agora = new Date(), o: { apresentacao?: boolean } = {},
): TelaBomDia | 'esperar' {
  const dia = hojeLocal(agora);
  const apresentacao = !!o.apresentacao;
  if (!atual || atual.dia !== dia) return apresentacao ? { momento: devido, dia, apresentacao } : { momento: devido, dia };
  return atual.momento === devido && !!atual.apresentacao === apresentacao ? atual : 'esperar';
}

/** ms até o próximo horário: 8h para todos; 8h ou 17h (o que vier antes) para o gestor. */
export function msAteProximoMomento(agora = new Date(), o: { gestor: boolean } = { gestor: false }): number {
  const horas = o.gestor ? [HORA_BOM_DIA, HORA_FIM_DIA] : [HORA_BOM_DIA];
  let ms = Infinity;
  for (const h of horas) {
    const alvo = new Date(agora);
    alvo.setHours(h, 0, 0, 0);
    if (alvo.getTime() <= agora.getTime()) alvo.setDate(alvo.getDate() + 1);
    ms = Math.min(ms, alvo.getTime() - agora.getTime());
  }
  return ms;
}

/** Já passou das 8h e a pessoa ainda não viu o resumo da manhã hoje? */
export const deveMostrarBomDia = (escopo?: string, agora = new Date()): boolean => momentoDevido(escopo, agora) === 'manha';
export const marcarBomDiaVisto = (escopo?: string, agora = new Date()): void => marcarMomentoVisto(escopo, 'manha', agora);
/** ms até as próximas 8h (hoje, se ainda não deu; senão amanhã). */
export const msAteProximoBomDia = (agora = new Date()): number => msAteProximoMomento(agora);

const CHAVE_MUDO = 'atenvo-bomdia-mudo';
export function lerMudo(escopo?: string): boolean {
  try { return localStorage.getItem(escopo ? `${CHAVE_MUDO}:${escopo}` : CHAVE_MUDO) === '1'; } catch { return false; }
}
export function salvarMudo(mudo: boolean, escopo?: string): void {
  try { localStorage.setItem(escopo ? `${CHAVE_MUDO}:${escopo}` : CHAVE_MUDO, mudo ? '1' : '0'); } catch { /* sem persistir */ }
}

/** Bom dia (5h–12h) · Boa tarde (12h–18h) · Boa noite. */
export function saudacaoDoDia(agora = new Date()): 'Bom dia' | 'Boa tarde' | 'Boa noite' {
  const h = agora.getHours();
  if (h >= 5 && h < 12) return 'Bom dia';
  if (h >= 12 && h < 18) return 'Boa tarde';
  return 'Boa noite';
}

/* ------------------------------------------------------------------
   Os números. bom_dia_resumo(p_org, p_momento) devolve UM de dois modos:
   - VENDEDOR (todo mundo, inclusive o admin Matheus): a carteira dele;
   - GESTOR (quem está em bom_dia_gestores — o Murilo): a empresa
     inteira, "hoje" desde a meia-noite — de manhã, depois de uma folga,
     desde o 1º dia dela (a pausa). O das 17h ('tarde') é sempre do dia.
   ------------------------------------------------------------------ */

/** A folga entre o último dia útil e hoje (dono 30/10: "na terça-feira quero que a mensagem da IA fale sobre o final
    de semana e o feriado… e fale os dados do sistema"). Só no resumo da manhã: no das 17h o banco manda null. */
export interface PausaBomDia {
  /** o 1º dia da folga, data de São Paulo ('2026-10-31'): os números do gestor contam desde a meia-noite dele */
  inicio: string;
  /** dias de folga (sábado, domingo e Finados = 3) */
  dias: number;
  fimDeSemana: boolean;
  /** os nomes dos feriados da folga, na ordem e sem repetir (o Carnaval são 2 dias: o banco manda 'Carnaval' 2x) */
  feriados: string[];
}

export interface ResumoVendedor {
  modo: 'vendedor';
  novos: number;
  semResposta: number;
  /** o robô/IA passou para humano e ninguém respondeu depois */
  passados: number;
  /** presenciais marcados para hoje */
  presenciais: number;
  /** a folga antes de hoje (só de manhã); null/ausente = dia normal (ou RPC antiga) */
  pausa?: PausaBomDia | null;
}

/** canal = canais.nome_interno ('ANTONIO CAMPANHA', 'JUROS ABUSIVO (ANDRIUS)', 'EMPRESTIMO'…) ou 'Sem campanha' */
export interface CampanhaN {
  canal: string;
  n: number;
}

/** quem mais fechou (empate = vários nomes); null = ninguém fechou */
export interface Vendedores {
  n: number;
  nomes: string[];
}

export interface ResumoGestor {
  modo: 'gestor';
  /** leads de hoje (as entradas do Dashboard v5: clientes distintos desde a meia-noite; de manhã, depois de folga,
      desde a meia-noite do 1º dia dela — pausa.inicio; o mesmo vale para campanhas, não elegíveis e IA) */
  chegaram: number;
  porCampanha: CampanhaN[];
  /** leads de ontem até a MESMA hora de agora (o kpis_anterior do Dashboard); null = a RPC não mandou —
      a fala pula a comparação (nunca "ontem não tinha nenhum" por falta do campo) */
  leadsOntemMesmaHora: number | null;
  /** conversas que a IA de vendas assumiu hoje; null = a RPC não mandou (a fala e o cartão pulam) */
  iaAtendeuHoje: number | null;
  naoElegiveis: number;
  nePorCampanha: CampanhaN[];
  fechadosHoje: number;
  melhorOntem: Vendedores | null;
  melhorHoje: Vendedores | null;
  criticos: { desconectados: string[]; iaSemCredito: boolean; semDono: number };
  /** a folga antes de hoje (só de manhã): leads, campanhas, não elegíveis e IA contam desde pausa.inicio e a
      comparação com ontem não vem. null/ausente = dia normal (ou RPC antiga) */
  pausa?: PausaBomDia | null;
  /** o último dia útil ('2026-10-30'): o melhorOntem é DELE — "de sexta-feira" quando não foi ontem. null/ausente
      (RPC antiga) = ontem */
  melhorDia?: string | null;
}

export type ResumoBomDia = ResumoVendedor | ResumoGestor;

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
/** campo que pode não vir (RPC antiga): ausente ≠ zero */
const numOuNulo = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const campanhas = (v: unknown): CampanhaN[] =>
  (Array.isArray(v) ? v : []).map((x) => ({ canal: String((x as { canal?: unknown })?.canal ?? '') || 'Sem campanha', n: num((x as { n?: unknown })?.n) }));
const vendedores = (v: unknown): Vendedores | null => {
  const o = v as { n?: unknown; nomes?: unknown } | null;
  if (!o || typeof o !== 'object') return null;
  const nomes = (Array.isArray(o.nomes) ? o.nomes : []).map((x) => String(x ?? '').trim()).filter(Boolean);
  const n = num(o.n);
  return n > 0 && nomes.length ? { n, nomes } : null;
};

const FMT_DIA_SP = (() => {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
  } catch { return null; }
})();
/** 'AAAA-MM-DD' de São Paulo: a data ('2026-10-30', o melhor_dia) como veio; o timestamptz ('2026-10-31T03:00:00+00:00',
    o início da folga) no fuso de São Paulo. Inválido → null. */
function diaDeSaoPaulo(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (!s || Number.isNaN(d.getTime())) return null;
  if (FMT_DIA_SP) {
    const p: Record<string, string> = {};
    for (const x of FMT_DIA_SP.formatToParts(d)) p[x.type] = x.value;
    if (p.year && p.month && p.day) return `${p.year}-${p.month}-${p.day}`;
  }
  return new Date(d.getTime() - 3 * 3_600_000).toISOString().slice(0, 10);   // São Paulo = UTC−3 (sem horário de verão)
}
/** a pausa da RPC ({ inicio, dias, fim_de_semana, feriados }); null ou ausente = dia normal. Os feriados saem sem
    repetir, na ordem (o Carnaval são dois dias: o banco manda ['Carnaval', 'Carnaval']) */
const pausaDaRpc = (v: unknown): PausaBomDia | null => {
  const o = v as Record<string, unknown> | null;
  if (!o || typeof o !== 'object') return null;
  const inicio = diaDeSaoPaulo(o.inicio);
  if (!inicio) return null;
  const feriados = [...new Set((Array.isArray(o.feriados) ? o.feriados : []).map((x) => String(x ?? '').trim()).filter(Boolean))];
  return { inicio, dias: num(o.dias), fimDeSemana: o.fim_de_semana === true, feriados };
};

/** O jsonb da RPC bom_dia_resumo → o resumo da tela (tolerante a campo faltando). */
export function resumoDaRpc(row: unknown): ResumoBomDia {
  const r = (row ?? {}) as Record<string, unknown>;
  if (r.modo === 'gestor') {
    const c = (r.criticos ?? {}) as Record<string, unknown>;
    return {
      modo: 'gestor',
      chegaram: num(r.chegaram),
      porCampanha: campanhas(r.por_campanha),
      leadsOntemMesmaHora: numOuNulo(r.leads_ontem_mesma_hora),
      iaAtendeuHoje: numOuNulo(r.ia_atendeu_hoje),
      naoElegiveis: num(r.nao_elegiveis),
      nePorCampanha: campanhas(r.ne_por_campanha),
      fechadosHoje: num(r.fechados_hoje),
      melhorOntem: vendedores(r.melhor_ontem),
      melhorHoje: vendedores(r.melhor_hoje),
      criticos: {
        desconectados: (Array.isArray(c.desconectados) ? c.desconectados : []).map((x) => String(x ?? '').trim()).filter(Boolean),
        iaSemCredito: c.ia_sem_credito === true,
        semDono: num(c.sem_dono),
      },
      pausa: pausaDaRpc(r.pausa),
      melhorDia: diaDeSaoPaulo(r.melhor_dia),
    };
  }
  return {
    modo: 'vendedor', novos: num(r.novos), semResposta: num(r.sem_resposta), passados: num(r.passados), presenciais: num(r.presenciais),
    pausa: pausaDaRpc(r.pausa),
  };
}

/* ------------------------------------------------------------------
   PÓS-FOLGA: o dia da semana, o dia útil e o desejo da folga.
   ------------------------------------------------------------------ */

const DIAS_DA_SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'] as const;
/** 0 = domingo … 6 = sábado, da data do calendário 'AAAA-MM-DD' (sem fuso: a data já é a de São Paulo) */
const diaDaSemana = (dia: string): number => {
  const [a, m, d] = dia.split('-').map(Number);
  return new Date(Date.UTC(a, (m || 1) - 1, d || 1)).getUTCDay();
};
/** "sábado", "sexta-feira" (a fala) */
export const nomeDoDia = (dia: string): string => DIAS_DA_SEMANA[diaDaSemana(dia)] ?? '';
/** "sábado", "sexta" (o rótulo do painel) */
export const nomeCurtoDoDia = (dia: string): string => nomeDoDia(dia).replace('-feira', '');
/** "na sexta", "no sábado" */
const naNo = (dia: string) => `${/^(sábado|domingo)$/.test(dia) ? 'no' : 'na'} ${dia}`;

/** A MESMA lista de dash_v5s_feriados() (o banco: os feriados nacionais + 20/09 do RS, 2026–2027) — editar os dois.
    Só para saber se HOJE é dia útil: no domingo e no próprio feriado a RPC também manda a pausa (o meio da folga). */
const FERIADOS = new Set([
  '2026-01-01', '2026-02-16', '2026-02-17', '2026-04-03', '2026-04-21', '2026-05-01', '2026-06-04', '2026-09-07', '2026-09-20',
  '2026-10-12', '2026-11-02', '2026-11-15', '2026-11-20', '2026-12-25',
  '2027-01-01', '2027-02-08', '2027-02-09', '2027-03-26', '2027-04-21', '2027-05-01', '2027-05-27', '2027-09-07', '2027-09-20',
  '2027-10-12', '2027-11-02', '2027-11-15', '2027-11-20', '2027-12-25',
]);
/** seg–sex fora dos feriados ('AAAA-MM-DD') */
export const ehDiaUtil = (dia: string): boolean => {
  const s = diaDaSemana(dia);
  return s >= 1 && s <= 5 && !FERIADOS.has(dia);
};

/** "de Finados", "da Proclamação da República", "do Dia do Trabalho" (a preposição com o artigo do nome) */
const FERIADO_DA = new Set(['Independência', 'Revolução Farroupilha', 'Proclamação da República', 'Consciência Negra', 'Sexta-feira Santa']);
const FERIADO_DO = new Set(['Dia do Trabalho']);
export const deFeriado = (nome: string): string => `${FERIADO_DO.has(nome) ? 'do' : FERIADO_DA.has(nome) ? 'da' : 'de'} ${nome}`;

/** O desejo depois da folga (SINTESE-POSFOLGA §2), logo depois da saudação:
    - fim de semana + feriado → "Espero que o final de semana e o feriado de Finados tenham sido bons.";
    - a folga começou num dia de semana (sexta feriado) → "Espero que o feriado da Consciência Negra e o final de
      semana tenham sido bons.";
    - só o fim de semana → "Espero que o final de semana tenha sido bom."; só o feriado → "Espero que o feriado de
      Tiradentes tenha sido bom."; dois feriados → "…os feriados de Finados e da Proclamação da República…".
    O nome repetido conta uma vez (Carnaval); o feriado sem nome ('feriado') vira "o feriado". null = sem folga. */
export function fraseFolga(p: PausaBomDia | null | undefined): string | null {
  if (!p) return null;
  const nomes = [...new Set(p.feriados.map((x) => x.trim()).filter(Boolean))];
  const comNome = nomes.filter((x) => x.toLowerCase() !== 'feriado');
  const feriado = !nomes.length ? null
    : comNome.length > 1 ? `os feriados ${listaE(comNome.map(deFeriado))}`
      : comNome.length === 1 ? `o feriado ${deFeriado(comNome[0])}` : 'o feriado';
  const fds = p.fimDeSemana ? 'o final de semana' : null;
  if (feriado && fds) {
    const s = diaDaSemana(p.inicio);
    return `Espero que ${s >= 1 && s <= 5 ? `${feriado} e ${fds}` : `${fds} e ${feriado}`} tenham sido bons.`;
  }
  const so = feriado ?? fds;
  if (!so) return null;
  return so.startsWith('os ') ? `Espero que ${so} tenham sido bons.` : `Espero que ${so} tenha sido bom.`;
}

/** O desejo só de manhã e só num dia ÚTIL: no domingo ou no próprio feriado a RPC também manda a pausa (é o meio
    da folga) — o desejo fica para o 1º dia útil; os números seguem "desde" o início dela (é o que a RPC contou). */
const desejoDaFolga = (p: PausaBomDia | null | undefined, momento: Momento, agora: Date): string | null =>
  (momento !== 'tarde' && p && ehDiaUtil(hojeLocal(agora)) ? fraseFolga(p) : null);

/** "Desde sábado" / "Desde sexta-feira" (o 1º dia da folga): de onde contam os números do gestor; null = hoje */
const desdeDaFolga = (p: PausaBomDia | null | undefined): string | null => (p ? `Desde ${nomeDoDia(p.inicio)}` : null);

/** De que dia é o "melhor de ontem": null = ontem (o normal; a RPC antiga não manda melhor_dia); depois de folga, o
    último dia útil pelo nome — "sexta-feira". */
export function diaDoMelhor(r: Pick<ResumoGestor, 'melhorDia'>, agora: Date): string | null {
  if (!r.melhorDia) return null;
  const ontem = new Date(agora);
  ontem.setDate(ontem.getDate() - 1);
  return r.melhorDia === hojeLocal(ontem) ? null : nomeDoDia(r.melhorDia);
}

/* ------------------------------------------------------------------
   Campanhas: o nome falado e mostrado.
   A RPC do gestor manda os rótulos do TRÁFEGO (dash_v5_trafego, os mesmos
   do Dashboard e do PDF — adendo 30/10 17h20): "{Produto} · {Pessoa}" →
   "Campanha {Pessoa}" ("da campanha Antônio", "a campanha Antônio");
   'Outros números' → "Outros números" ("de outros números").
   Compatibilidade (canais.nome_interno: a RPC antiga e os números
   desconectados), nesta ordem: (a) nome entre parênteses → "Campanha
   {Nome}" ('JUROS ABUSIVO (ANDRIUS)', 'EMPRESTIMO (DIEGO)'); (b) contém
   CAMPANHA → "Campanha {resto}" ('ANTONIO CAMPANHA'); (c) EMPRÉSTIMO +
   outra palavra → "Empréstimo {Palavra}" ('EMPRESTIMO DIEGO'); (d)
   EMPRÉSTIMO sozinho → "Empréstimo"; (e) 'OFICIAL' → "Número oficial";
   (f) 'MURILLO CHIP' → "Chip do Murillo"; (g) senão o nome em título
   ("do número Disparos"). Acentos por dicionário (ANTONIO → Antônio).
   AGRUPA pelo nome mapeado antes de contar/ordenar ('EMPRESTIMO' +
   'EMPRÉSTIMO' = Empréstimo).
   ------------------------------------------------------------------ */

export interface NomeCampanha {
  /** o que a tela mostra: "Campanha Antônio" */
  rotulo: string;
  /** "29 da campanha Antônio", "7 do Empréstimo", "2 de outros números" */
  de: string;
  /** "é a campanha Antônio", "é a do Empréstimo" */
  a: string;
  /** "mais na campanha Antônio", "mais no Empréstimo" */
  em: string;
  /** "O número do Empréstimo está desconectado." / "O número oficial…" */
  numero: string;
  /** onde o espaço é curto (empate, lista apertada, nomes dos números caídos): "Antônio", "Empréstimo" —
      o rótulo sem o "Campanha " na frente; os outros ficam iguais ao rótulo */
  curto: string;
  /** concorre a "melhor campanha" / "campanha com mais não elegíveis"? "Sem campanha" e "Outros números"
      não são campanha: aparecem na conta dos leads, nunca como a melhor */
  campanha: boolean;
}

const SEM_ACENTO = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
/** palavras que o banco guarda sem acento */
const ACENTOS: Record<string, string> = { ANTONIO: 'Antônio', EMPRESTIMO: 'Empréstimo' };
const titulo = (s: string) => s.trim().toLowerCase().split(/\s+/).filter(Boolean)
  .map((p) => ACENTOS[SEM_ACENTO(p).toUpperCase()] ?? p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
const daCampanha = (nome: string): NomeCampanha => ({
  rotulo: `Campanha ${nome}`, de: `da campanha ${nome}`, a: `a campanha ${nome}`, em: `na campanha ${nome}`, numero: `número da campanha ${nome}`,
  curto: nome, campanha: true,
});
/** "Empréstimo", "Empréstimo Diego", "Número oficial"…: o nome do número ("do Empréstimo", "a do Empréstimo") */
const doNumero = (nome: string, numero = `número do ${nome}`): NomeCampanha => ({
  rotulo: nome, de: `do ${nome}`, a: `a do ${nome}`, em: `no ${nome}`, numero, curto: nome, campanha: true,
});
const SEM_CAMPANHA: NomeCampanha = {
  rotulo: 'Sem campanha', de: 'sem campanha', a: 'sem campanha', em: 'sem campanha', numero: 'número sem campanha', curto: 'Sem campanha', campanha: false,
};
const OUTROS_NUMEROS: NomeCampanha = {
  rotulo: 'Outros números', de: 'de outros números', a: 'a de outros números', em: 'em outros números', numero: 'número de outros números',
  curto: 'Outros números', campanha: false,
};

export function nomeCampanha(nomeInterno: string): NomeCampanha {
  const bruto = (nomeInterno ?? '').trim().replace(/\s+/g, ' ');
  const k = SEM_ACENTO(bruto).toUpperCase();
  if (!k || k === 'SEM CAMPANHA') return SEM_CAMPANHA;
  // rótulos do tráfego (dash_v5_trafego): 'Outros números' e "{Produto} · {Pessoa}"
  if (k === 'OUTROS NUMEROS') return OUTROS_NUMEROS;
  if (bruto.includes('·')) {
    const pessoa = bruto.split('·').pop()!.trim();
    if (pessoa) return daCampanha(titulo(pessoa));
  }
  // (a) nome entre parênteses → campanha {Nome}
  const par = bruto.match(/\(([^)]*)\)/);
  if (par && par[1].trim()) return daCampanha(titulo(par[1]));
  // (b) contém CAMPANHA → campanha {resto}
  if (/(^| )CAMPANHA( |$)/.test(k)) {
    const resto = bruto.split(' ').filter((p) => SEM_ACENTO(p).toUpperCase() !== 'CAMPANHA').join(' ');
    if (resto) return daCampanha(titulo(resto));
  }
  // (c) EMPRÉSTIMO + outra palavra → "Empréstimo {Palavra}"; (d) sozinho → "Empréstimo"
  if (/^EMPRESTIMO( |$)/.test(k)) {
    const resto = bruto.split(' ').slice(1).join(' ');
    return doNumero(resto ? `Empréstimo ${titulo(resto)}` : 'Empréstimo');
  }
  // (e) e (f)
  if (k === 'OFICIAL') return { ...doNumero('Número oficial', 'número oficial'), de: 'do número oficial', a: 'a do número oficial', em: 'no número oficial' };
  if (k === 'MURILLO CHIP') return { ...doNumero('Chip do Murillo', 'número do chip do Murillo'), de: 'do chip do Murillo', a: 'a do chip do Murillo', em: 'no chip do Murillo' };
  // (g) o nome em título
  const t = titulo(bruto);
  return { rotulo: t, de: `do número ${t}`, a: `a do número ${t}`, em: `no número ${t}`, numero: `número ${t}`, curto: t, campanha: true };
}

export interface CampanhaAgrupada {
  nome: NomeCampanha;
  n: number;
}

/** Soma pelo nome mapeado (EMPRESTIMO + EMPRÉSTIMO = Empréstimo) e ordena do maior para o menor
    (empate: a ordem em que chegaram — a RPC já manda por n desc, nome). */
export function agruparCampanhas(lista: CampanhaN[]): CampanhaAgrupada[] {
  const mapa = new Map<string, CampanhaAgrupada & { ordem: number }>();
  lista.forEach((c, ordem) => {
    const nome = nomeCampanha(c.canal);
    const atual = mapa.get(nome.rotulo);
    if (atual) atual.n += c.n;
    else mapa.set(nome.rotulo, { nome, n: c.n, ordem });
  });
  return [...mapa.values()]
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n || a.ordem - b.ordem)
    .map(({ nome, n }) => ({ nome, n }));
}

/** A(s) campanha(s) com mais — "Sem campanha" e "Outros números" não concorrem (não são campanha). */
export function lideresCampanha(grupos: CampanhaAgrupada[]): { nomes: NomeCampanha[]; n: number } | null {
  const cand = grupos.filter((g) => g.nome.campanha);
  if (!cand.length) return null;
  const n = Math.max(...cand.map((g) => g.n));
  return { nomes: cand.filter((g) => g.n === n).map((g) => g.nome), n };
}

/** "a", "a e b", "a, b e c" */
export function listaE(itens: string[]): string {
  if (itens.length <= 1) return itens[0] ?? '';
  return `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`;
}

/* ------------------------------------------------------------------
   O que a IA fala. Cada trecho é uma frase (ou uma "página" curta da
   frase): a legenda anda trecho a trecho. Juntando os trechos com um
   espaço sai o texto da voz (textoCorrido) — o mesmo do áudio.
   ------------------------------------------------------------------ */

export type IdTrecho =
  | 'saudacao' | 'folga' | 'numeros' | 'avisos' | 'passados' | 'presenciais' | 'nenhum' | 'fecho'
  | 'leads' | 'comparacao' | 'melhor-campanha' | 'nao-elegiveis' | 'campanha-ne' | 'ia' | 'melhor-ontem' | 'melhor-vendedor'
  | 'fechados' | 'criticos'
  /** as falas da própria apresentação de lançamento (o que não é número) */
  | 'apresentacao';

export interface Trecho {
  id: IdTrecho;
  texto: string;
}

const qtd = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] || '';
}

export interface OpcoesFala {
  /** 'manha' (8h) ou 'tarde' (17h, só o gestor) */
  momento?: Momento;
  /** a hora da saudação do gestor (Bom dia/Boa tarde/Boa noite) */
  agora?: Date;
}

export function montarFala(nome: string, r: ResumoBomDia, o: OpcoesFala = {}): Trecho[] {
  if (r.modo === 'gestor') return falaGestor(nome, r, o.momento ?? 'manha', o.agora ?? new Date());
  const pn = primeiroNome(nome);
  const vinda = generoProvavel(pn) === 'f' ? 'bem-vinda' : 'bem-vindo';
  const t: Trecho[] = [{ id: 'saudacao', texto: pn ? `Olá, ${pn}! Seja ${vinda} ao Atenvo.` : `Olá! Seja ${vinda} ao Atenvo.` }];
  // depois de folga, o desejo logo depois da saudação; o resto do vendedor não muda (copy do dono é literal)
  const folga = desejoDaFolga(r.pausa, o.momento ?? 'manha', o.agora ?? new Date());
  if (folga) t.push({ id: 'folga', texto: folga });
  t.push(
    {
      id: 'numeros',
      texto: `Hoje você tem ${qtd(r.novos, 'novo cliente', 'novos clientes')} e ${qtd(r.semResposta, 'cliente sem resposta', 'clientes sem resposta')}.`,
    },
    { id: 'avisos', texto: 'Informações importantes:' },
  );
  let avisos = 0;
  if (r.passados > 0) {
    avisos++;
    t.push({
      id: 'passados',
      texto: r.passados === 1
        ? 'O robô passou 1 cliente para você. Ele está esperando atendimento.'
        : `O robô passou ${r.passados} clientes para você. Eles estão esperando atendimento.`,
    });
  }
  if (r.presenciais > 0) {
    avisos++;
    t.push({ id: 'presenciais', texto: `Você tem ${qtd(r.presenciais, 'atendimento presencial', 'atendimentos presenciais')} hoje.` });
  }
  if (!avisos) t.push({ id: 'nenhum', texto: 'Nenhuma informação importante por enquanto.' });
  t.push({ id: 'fecho', texto: 'Bom trabalho!' });
  return t;
}

/* ---------- as frases do gestor (roteiro do dono 30/10, literal) ---------- */

/** "a Juliana", "o Matheus" (gênero pelo primeiro nome) */
const comArtigo = (nome: string) => `${generoProvavel(nome) === 'f' ? 'a' : 'o'} ${nome}`;
const contratos = (n: number) => qtd(n, 'contrato', 'contratos');

/** desde = "Desde sábado" depois de folga (a RPC conta desde o 1º dia dela; SINTESE-POSFOLGA §3); null = hoje */
export function fraseLeadsManha(chegaram: number, grupos: CampanhaAgrupada[], desde: string | null = null): Trecho[] {
  const ini = desde ?? 'Até o momento';
  if (chegaram <= 0) return [{ id: 'leads', texto: desde ? `${desde}, nenhum lead entrou no sistema.` : 'Até o momento, nenhum lead entrou no sistema hoje.' }];
  if (chegaram === 1) {
    return [{ id: 'leads', texto: grupos[0] ? `${ini}, entrou 1 lead no sistema, ${grupos[0].nome.de}.` : `${ini}, entrou 1 lead no sistema.` }];
  }
  if (grupos.length <= 1) {
    return [{ id: 'leads', texto: grupos[0] ? `${ini}, entraram ${chegaram} leads no sistema, todos ${grupos[0].nome.de}.` : `${ini}, entraram ${chegaram} leads no sistema.` }];
  }
  // a lista vira uma 2ª "página" da legenda (o texto falado é o mesmo, com os dois-pontos)
  return [
    { id: 'leads', texto: `${ini}, entraram ${chegaram} leads no sistema:` },
    { id: 'leads', texto: `${listaE(grupos.map((g) => `${g.n} ${g.nome.de}`))}.` },
  ];
}

export function fraseMelhorCampanha(grupos: CampanhaAgrupada[], quando: 'até agora' | 'até o momento'): string | null {
  const l = lideresCampanha(grupos);
  if (!l) return null;
  const leads = qtd(l.n, 'lead', 'leads');
  return l.nomes.length === 1
    ? `A melhor campanha ${quando} é ${l.nomes[0].a}, com ${leads}.`
    : `As melhores campanhas ${quando} são ${listaE(l.nomes.map((x) => x.a))}, com ${leads} cada.`;
}

export function fraseNaoElegiveis(n: number): string {
  if (n <= 0) return 'Nenhum cliente foi marcado como não elegível.';
  return n === 1 ? '1 cliente foi marcado como não elegível.' : `${n} clientes foram marcados como não elegíveis.`;
}

export function fraseCampanhaNe(grupos: CampanhaAgrupada[]): string | null {
  const l = lideresCampanha(grupos);
  if (!l) return null;
  const clientes = qtd(l.n, 'cliente', 'clientes');
  return l.nomes.length === 1
    ? `A campanha com mais não elegíveis é ${l.nomes[0].a}, com ${clientes}.`
    : `As campanhas com mais não elegíveis são ${listaE(l.nomes.map((x) => x.a))}, com ${clientes} cada.`;
}

/** dia = o último dia útil pelo nome ("sexta-feira") quando não foi ontem (diaDoMelhor); null = ontem */
export function fraseMelhorOntem(m: Vendedores | null, dia: string | null = null): string {
  const de = dia ? `de ${dia}` : 'de ontem';
  if (!m || m.n <= 0 || !m.nomes.length) {
    if (!dia) return 'Ontem não houve contratos fechados.';
    const quando = naNo(dia);
    return `${quando.charAt(0).toUpperCase()}${quando.slice(1)} não houve contratos fechados.`;
  }
  if (m.nomes.length === 1) {
    const nome = m.nomes[0];
    return generoProvavel(nome) === 'f'
      ? `A melhor vendedora ${de} foi a ${nome}, com ${contratos(m.n)} ${m.n === 1 ? 'fechado' : 'fechados'}.`
      : `O melhor vendedor ${de} foi o ${nome}, com ${contratos(m.n)} ${m.n === 1 ? 'fechado' : 'fechados'}.`;
  }
  const todasMulheres = m.nomes.every((x) => generoProvavel(x) === 'f');
  return `${todasMulheres ? 'As melhores vendedoras' : 'Os melhores vendedores'} ${de} foram ${listaE(m.nomes.map(comArtigo))}, com ${contratos(m.n)} cada.`;
}

export function fraseMelhorHoje(m: Vendedores | null): string {
  if (!m || m.n <= 0 || !m.nomes.length) return 'Hoje ninguém fechou contrato ainda.';
  if (m.nomes.length === 1) return `Quem mais vendeu hoje foi ${comArtigo(m.nomes[0])}, com ${contratos(m.n)} ${m.n === 1 ? 'fechado' : 'fechados'}.`;
  return `Quem mais vendeu hoje foram ${listaE(m.nomes.map(comArtigo))}, com ${contratos(m.n)} cada.`;
}

export function fraseFechadosManha(n: number): string {
  if (n <= 0) return 'Hoje ainda não teve nenhum fechamento.';
  return n === 1 ? 'Hoje já foi fechado 1 contrato.' : `Hoje já foram fechados ${n} contratos.`;
}

export function fraseFechadosTarde(n: number): string {
  if (n <= 0) return 'Até o momento, ainda não fechamos nenhum cliente hoje.';
  return `Até o momento, fechamos ${qtd(n, 'cliente', 'clientes')}.`;
}

export function fraseLeadsTarde(chegaram: number, ne: number): string {
  if (chegaram <= 0) return 'Hoje nenhum lead entrou no sistema.';
  const base = chegaram === 1 ? 'Hoje entrou 1 lead no sistema' : `Hoje entraram ${chegaram} leads no sistema`;
  if (ne <= 0) return `${base}.`;
  return ne === 1 ? `${base}, e 1 foi marcado como não elegível.` : `${base}, e ${ne} foram marcados como não elegíveis.`;
}

/** Comparação com ONTEM no mesmo horário (SINTESE-GESTOR-V2 §8, aprovada pelo dono). Só a conta exata que a
    frase pede (a diferença), sobre os números da RPC — nada arredondado. Faixas, nesta ordem:
    - ontem ausente (RPC antiga) → pula; hoje e ontem 0 → pula;
    - ontem 0 → "Ontem, no mesmo horário, ainda não tinha entrado nenhum lead.";
    - hoje MAIS que o dobro → "É mais que o dobro de ontem no mesmo horário, quando eram 125." (o dobro exato
      não é "mais que o dobro": cai na faixa de baixo, "São 20 a mais…" — sempre verdade);
    - diferença até 10% de ontem → "Praticamente o mesmo que ontem no mesmo horário, quando eram 47.";
    - hoje maior → "São 12 a mais que ontem no mesmo horário, quando eram 35." (1: "É 1 a mais…");
    - hoje menor e pelo menos a metade → "São 12 a menos que ontem no mesmo horário, quando eram 59.";
    - menos da metade → "É menos da metade de ontem no mesmo horário, quando eram 125."
    Ontem 1: "quando era 1". */
export function fraseComparacao(hoje: number, ontem: number | null | undefined): string | null {
  if (ontem == null) return null;
  if (hoje <= 0 && ontem <= 0) return null;
  if (ontem <= 0) return 'Ontem, no mesmo horário, ainda não tinha entrado nenhum lead.';
  const quando = `quando ${ontem === 1 ? 'era' : 'eram'} ${ontem}`;
  const dif = hoje - ontem;
  if (hoje > 2 * ontem) return `É mais que o dobro de ontem no mesmo horário, ${quando}.`;
  if (Math.abs(dif) * 10 <= ontem) return `Praticamente o mesmo que ontem no mesmo horário, ${quando}.`;
  const quantos = (n: number) => (n === 1 ? 'É 1' : `São ${n}`);
  if (dif > 0) return `${quantos(dif)} a mais que ontem no mesmo horário, ${quando}.`;
  if (hoje * 2 >= ontem) return `${quantos(-dif)} a menos que ontem no mesmo horário, ${quando}.`;
  return `É menos da metade de ontem no mesmo horário, ${quando}.`;
}

/** O trabalho da IA hoje (§8): "A IA atendeu 37 leads hoje." — ausente (RPC antiga) → pula. Depois de folga (desde =
    "Desde sábado"): "Desde sábado, a IA atendeu 80 leads." */
export function fraseIa(n: number | null | undefined, desde: string | null = null): string | null {
  if (n == null) return null;
  if (desde) return n <= 0 ? `${desde}, a IA não atendeu nenhum lead.` : `${desde}, a IA atendeu ${qtd(n, 'lead', 'leads')}.`;
  if (n <= 0) return 'A IA ainda não atendeu nenhum lead hoje.';
  return n === 1 ? 'A IA atendeu 1 lead hoje.' : `A IA atendeu ${n} leads hoje.`;
}

/** Números desconectados (sem repetir o mesmo nome mapeado). */
export function desconectadosAgrupados(nomes: string[]): NomeCampanha[] {
  const vistos = new Map<string, NomeCampanha>();
  for (const x of nomes) {
    const n = nomeCampanha(x);
    if (!vistos.has(n.rotulo)) vistos.set(n.rotulo, n);
  }
  return [...vistos.values()];
}

export function frasesCriticos(c: ResumoGestor['criticos']): Trecho[] {
  const casos: string[] = [];
  const nums = desconectadosAgrupados(c.desconectados);
  if (nums.length === 1) casos.push(`O ${nums[0].numero} está desconectado.`);
  else if (nums.length > 1) casos.push(`Os números ${listaE(nums.map((x) => x.de))} estão desconectados.`);
  if (c.iaSemCredito) casos.push('A IA está sem crédito e parou de responder os clientes.');
  if (c.semDono > 0) casos.push(c.semDono === 1 ? '1 cliente novo está sem dono.' : `${c.semDono} clientes novos estão sem dono.`);
  if (!casos.length) return [{ id: 'criticos', texto: 'Nenhum caso crítico no momento.' }];
  return [{ id: 'criticos', texto: 'Casos críticos:' }, ...casos.map((texto) => ({ id: 'criticos' as const, texto }))];
}

/* ------------------------------------------------------------------
   O que o PAINEL do gestor escreve (a fala fica acima, intocada). O
   cartão tem altura fixa: nada aqui pode crescer com os dados.
   ------------------------------------------------------------------ */

export interface CasoPainel {
  k: 'numeros' | 'ia' | 'dono';
  titulo: string;
  /** 2ª linha pequena (uma linha só) */
  sub?: string;
}

/** Casos críticos do cartão: no MÁXIMO 3 itens, agrupados como a fala agrupa. Numa queda do servidor do
    WhatsApp (29/10) a RPC lista cada número caído: eles viram UM item ("5 números desconectados") com os
    nomes curtos numa 2ª linha (até 3 nomes e "+N"); depois a IA sem crédito e os clientes sem dono. */
export function casosDoPainel(c: ResumoGestor['criticos']): CasoPainel[] {
  const casos: CasoPainel[] = [];
  const nums = desconectadosAgrupados(c.desconectados);
  if (nums.length === 1) casos.push({ k: 'numeros', titulo: 'Número desconectado', sub: nums[0].rotulo });
  else if (nums.length > 1) {
    const curtos = nums.map((x) => x.curto);
    const sub = curtos.length <= 3 ? listaE(curtos) : `${curtos.slice(0, 3).join(', ')} +${curtos.length - 3}`;
    casos.push({ k: 'numeros', titulo: `${nums.length} números desconectados`, sub });
  }
  if (c.iaSemCredito) casos.push({ k: 'ia', titulo: 'IA sem crédito', sub: 'parou de responder os clientes' });
  if (c.semDono > 0) casos.push({ k: 'dono', titulo: c.semDono === 1 ? '1 cliente novo sem dono' : `${c.semDono} clientes novos sem dono` });
  return casos;
}

/** A linha de baixo do cartão "Leads hoje" (§8): "Ontem, mesmo horário: 125". Sem o campo (RPC antiga), a de
    antes: "até o momento" / "nenhum lead ainda". */
export function detalheLeads(r: Pick<ResumoGestor, 'chegaram' | 'leadsOntemMesmaHora'>): string {
  if (r.leadsOntemMesmaHora != null) return `Ontem, mesmo horário: ${r.leadsOntemMesmaHora}`;
  return r.chegaram > 0 ? 'até o momento' : 'nenhum lead ainda';
}

/** O detalhe do cartão "Não elegíveis" (uma linha): "mais no Empréstimo · 7"; empate, com os nomes curtos:
    "Empréstimo e Antônio · 5 cada" (a forma longa "mais no Empréstimo e na campanha Antônio · 5" não cabia).
    Depois de folga a RPC conta desde o 1º dia dela: "nenhum desde sábado" / "marcados desde sábado". */
export function detalheNaoElegiveis(r: Pick<ResumoGestor, 'naoElegiveis' | 'nePorCampanha' | 'pausa'>): string {
  const quando = r.pausa ? `desde ${nomeCurtoDoDia(r.pausa.inicio)}` : 'hoje';
  if (r.naoElegiveis <= 0) return `nenhum ${quando}`;
  const l = lideresCampanha(agruparCampanhas(r.nePorCampanha));
  if (!l) return `marcados ${quando}`;
  return l.nomes.length === 1 ? `mais ${l.nomes[0].em} · ${l.n}` : `${listaE(l.nomes.map((x) => x.curto))} · ${l.n} cada`;
}

/** O rótulo do cartão dos leads: "Leads hoje"; depois de folga, "Leads desde sábado" (a RPC conta desde o 1º dia dela). */
export const rotuloLeads = (r: Pick<ResumoGestor, 'pausa'> | null): string =>
  (r?.pausa ? `Leads desde ${nomeCurtoDoDia(r.pausa.inicio)}` : 'Leads hoje');

/** O cartão do melhor vendedor do último dia útil: "Melhor vendedor de ontem" (vazio: "nenhum contrato ontem"); quando
    ele não foi ontem (depois de folga), "Melhor vendedor de sexta" ("nenhum contrato na sexta"). */
export function cartaoMelhorDia(r: Pick<ResumoGestor, 'melhorDia'> | null, agora: Date): { rotulo: string; vazio: string } {
  const dia = r ? diaDoMelhor(r, agora) : null;
  if (!dia) return { rotulo: 'Melhor vendedor de ontem', vazio: 'nenhum contrato ontem' };
  const curto = dia.replace('-feira', '');
  return { rotulo: `Melhor vendedor de ${curto}`, vazio: `nenhum contrato ${naNo(curto)}` };
}

function falaGestor(nome: string, r: ResumoGestor, momento: Momento, agora: Date): Trecho[] {
  const pn = primeiroNome(nome);
  const grupos = agruparCampanhas(r.porCampanha);
  // §8: a comparação vem logo depois dos leads; a IA, depois da campanha com mais NE (8h) / da comparação (17h)
  const comparacao = fraseComparacao(r.chegaram, r.leadsOntemMesmaHora);
  const t: Trecho[] = [];
  if (momento === 'tarde') {
    const ia = fraseIa(r.iaAtendeuHoje);
    // 17h — "olá Murilo, seu diagnóstico do dia chegou"
    t.push({ id: 'saudacao', texto: pn ? `Olá, ${pn}, seu diagnóstico do dia chegou.` : 'Olá, seu diagnóstico do dia chegou.' });
    t.push({ id: 'fechados', texto: fraseFechadosTarde(r.fechadosHoje) });
    t.push({ id: 'melhor-vendedor', texto: fraseMelhorHoje(r.melhorHoje) });
    const melhor = r.chegaram > 0 ? fraseMelhorCampanha(grupos, 'até o momento') : null;
    if (melhor) t.push({ id: 'melhor-campanha', texto: melhor });
    t.push({ id: 'leads', texto: fraseLeadsTarde(r.chegaram, r.naoElegiveis) });
    if (comparacao) t.push({ id: 'comparacao', texto: comparacao });
    if (ia) t.push({ id: 'ia', texto: ia });
    t.push(...frasesCriticos(r.criticos));
    t.push({ id: 'fecho', texto: 'Bom fim de dia!' });
    return t;
  }
  // 8h — "bom dia, Murilo, tudo bem? Seja bem-vindo ao seu acesso de administrador…"
  const vinda = generoProvavel(pn) === 'f' ? 'bem-vinda' : 'bem-vindo';
  const sd = saudacaoDoDia(agora);
  t.push({ id: 'saudacao', texto: `${pn ? `${sd}, ${pn}, tudo bem?` : `${sd}, tudo bem?`} Seja ${vinda} ao seu acesso de administrador.` });
  t.push({ id: 'saudacao', texto: 'Aqui você pode acompanhar o desempenho da sua equipe.' });
  // depois de folga (SINTESE-POSFOLGA §2–3): o desejo logo depois da saudação; leads e IA "desde sábado" (a RPC conta
  // desde o 1º dia da folga), sem a comparação com ontem (ontem foi domingo/feriado) e o melhor do último dia útil
  const folga = desejoDaFolga(r.pausa, momento, agora);
  if (folga) t.push({ id: 'folga', texto: folga });
  const desde = desdeDaFolga(r.pausa);
  t.push(...fraseLeadsManha(r.chegaram, grupos, desde));
  if (comparacao && !desde) t.push({ id: 'comparacao', texto: comparacao });
  const melhor = r.chegaram > 0 ? fraseMelhorCampanha(grupos, 'até agora') : null;
  if (melhor) t.push({ id: 'melhor-campanha', texto: melhor });
  t.push({ id: 'nao-elegiveis', texto: fraseNaoElegiveis(r.naoElegiveis) });
  const ne = r.naoElegiveis > 0 ? fraseCampanhaNe(agruparCampanhas(r.nePorCampanha)) : null;
  if (ne) t.push({ id: 'campanha-ne', texto: ne });
  const ia = fraseIa(r.iaAtendeuHoje, desde);
  if (ia) t.push({ id: 'ia', texto: ia });
  t.push({ id: 'melhor-ontem', texto: fraseMelhorOntem(r.melhorOntem, diaDoMelhor(r, agora)) });
  t.push({ id: 'fechados', texto: fraseFechadosManha(r.fechadosHoje) });
  t.push(...frasesCriticos(r.criticos));
  t.push({ id: 'fecho', texto: 'Bom trabalho!' });
  return t;
}

/** A APRESENTAÇÃO de lançamento (SINTESE-FINAL §4, roteiro proposto ao dono — texto exato): DUAS falas (duas
    vozes). 1ª: quem ela é + "Ele fica assim." + o resumo das 8h com os números de AGORA (a saudação do exemplo
    é a das 8h: "Bom dia, Murilo, tudo bem?…", mesmo apresentada à tarde); 2ª: "Fica assim." + o diagnóstico
    das 17h sem o "Bom fim de dia!" + o fecho da apresentação. As páginas da legenda seguem as frases.
    Cada parte com os números DELA: r = o resumo da manhã (p_momento 'manha': depois de folga, desde o 1º dia dela);
    rTarde = o das 17h ('tarde': só o dia). Sem rTarde, o mesmo r nas duas. */
export function montarApresentacao(nome: string, r: ResumoGestor, agora = new Date(), rTarde: ResumoGestor = r): [Trecho[], Trecho[]] {
  const pn = primeiroNome(nome);
  const vinda = generoProvavel(pn) === 'f' ? 'bem-vinda' : 'bem-vindo';
  const oito = new Date(agora);
  oito.setHours(HORA_BOM_DIA, 0, 0, 0);
  const ap = (texto: string): Trecho => ({ id: 'apresentacao', texto });
  const tarde = falaGestor(nome, rTarde, 'tarde', agora);
  if (tarde[tarde.length - 1]?.id === 'fecho') tarde.pop();
  return [
    [
      ap(pn ? `Olá, ${pn}! Eu sou a assistente do Atenvo.` : 'Olá! Eu sou a assistente do Atenvo.'),
      ap('A partir de agora, todos os dias, eu vou te passar os números da sua equipe.'),
      ap('Às oito da manhã, você recebe o resumo da manhã. Ele fica assim.'),
      ...falaGestor(nome, r, 'manha', oito),
    ],
    [
      ap('E às cinco da tarde, eu te entrego o diagnóstico do dia. Fica assim.'),
      ...tarde,
      ap(pn ? `É isso, ${pn}.` : 'É isso.'),
      ap('Quando quiser me ouvir de novo, é só abrir o menu e clicar em Ouvir o bom dia.'),
      ap(`Seja ${vinda} ao Atenvo!`),
    ],
  ];
}

/** As falas de uma tela, na ordem (cada uma com a sua voz): o resumo do momento = 1; a apresentação = 2. A
    apresentação é do gestor: se a RPC disser que a pessoa é vendedor, fica o resumo dela (1 fala). Na apresentação,
    r = o resumo da manhã (parte 1) e rTarde = o das 17h (parte 2). */
export function falasDaTela(nome: string, r: ResumoBomDia, tipo: TipoTela, agora = new Date(), rTarde?: ResumoBomDia | null): Trecho[][] {
  if (tipo === 'apresentacao') {
    return r.modo === 'gestor'
      ? montarApresentacao(nome, r, agora, rTarde?.modo === 'gestor' ? rTarde : r)
      : [montarFala(nome, r, { momento: 'manha', agora })];
  }
  return [montarFala(nome, r, { momento: tipo, agora })];
}

export const textoCorrido = (trechos: Trecho[]): string => trechos.map((x) => x.texto).join(' ');

/* ------------------------------------------------------------------
   A voz de cada fala. A função bom-dia-voz aceita até 1.200 caracteres
   por pedido (MAX_CHARS lá): uma fala maior (a 1ª parte da apresentação
   num dia carregado) sai em pedaços SEQUENCIAIS, cortados entre frases —
   o texto não muda: os pedaços juntos com um espaço = a fala inteira. Os
   pedaços são gerados em paralelo e tocam como UM áudio só (juntarPcm).
   ------------------------------------------------------------------ */

/** O teto da função de voz (supabase/functions/bom-dia-voz: MAX_CHARS). */
export const MAX_CHARS_VOZ = 1200;

/** As frases de uma fala em pedaços de no máximo `max` caracteres (o texto de cada pedaço = textoCorrido).
    Cabe inteira → um pedaço só (o mesmo texto de sempre: o cache da voz continua valendo). Não cabe → o MENOR
    número de pedaços, equilibrados (geram em paralelo: quem manda na espera é o mais longo). Uma frase sozinha
    maior que o teto fica num pedaço só dela (a função recusa e a tela cai na legenda — nunca corta a frase). */
export function blocosDaVoz(trechos: Trecho[], max = MAX_CHARS_VOZ): Trecho[][] {
  if (!trechos.length) return [];
  const tam = trechos.map((t) => t.texto.length);
  const total = tam.reduce((a, b) => a + b, 0) + tam.length - 1;
  if (total <= max) return [trechos];
  /* guloso com teto L: onde começa cada pedaço (o menor número de pedaços para esse teto) */
  const cortes = (teto: number): number[] => {
    const inicios = [0];
    let n = tam[0];
    for (let i = 1; i < tam.length; i++) {
      if (n + 1 + tam[i] <= teto) n += 1 + tam[i];
      else { inicios.push(i); n = tam[i]; }
    }
    return inicios;
  };
  const maior = Math.max(...tam);
  const teto = Math.max(max, maior);
  const pedacos = cortes(teto).length;
  // o menor teto que ainda dá esse número de pedaços: os pedaços saem do mesmo tamanho
  let lo = Math.max(maior, Math.ceil((total - (pedacos - 1)) / pedacos));
  let hi = teto;
  while (lo < hi) {
    const meio = Math.floor((lo + hi) / 2);
    if (cortes(meio).length <= pedacos) hi = meio;
    else lo = meio + 1;
  }
  const inicios = cortes(lo);
  return inicios.map((ini, k) => trechos.slice(ini, inicios[k + 1] ?? trechos.length));
}

/** O respiro entre dois pedaços da mesma fala (s): vira uma pausa real, e a legenda troca de frase ali. */
export const PAUSA_ENTRE_PEDACOS_S = 0.3;

/** Os pedaços de voz de uma fala (um canal, a mesma taxa) num canal só, com o respiro entre eles. */
export function juntarPcm(pedacos: Float32Array[], taxa: number, pausaS = PAUSA_ENTRE_PEDACOS_S): Float32Array {
  if (pedacos.length === 1) return pedacos[0];
  const vao = Math.max(0, Math.round(pausaS * taxa));
  const out = new Float32Array(pedacos.reduce((a, p) => a + p.length, 0) + vao * Math.max(0, pedacos.length - 1));
  let off = 0;
  for (const p of pedacos) {
    out.set(p, off);
    off += p.length + vao;
  }
  return out;
}

/* ------------------------------------------------------------------
   O que muda na tela entre o resumo e a apresentação (o resto é igual).
   ------------------------------------------------------------------ */

export interface TextosDoPlay {
  /** a linha discreta sob a saudação */
  linha: string;
  /** a mesma linha enquanto números e voz não chegaram (ou o play foi clicado antes) */
  preparando: string;
  /** a pílula branca */
  botao: string;
}

export function textosDoPlay(tipo: TipoTela, gestor: boolean): TextosDoPlay {
  if (tipo === 'apresentacao' && gestor) {
    return { linha: 'A apresentação do bom dia está pronta.', preparando: 'Preparando a apresentação…', botao: 'Ouvir a apresentação' };
  }
  return {
    linha: tipo === 'tarde' && gestor ? 'O resumo do dia está pronto.' : 'Seu resumo da manhã está pronto.',
    preparando: 'Preparando o seu resumo…',
    botao: 'Ouvir o resumo',
  };
}

export interface PainelDaTela {
  /** o painel do gestor das 17h ("Diagnóstico do dia.") no lugar do das 8h */
  tarde: boolean;
  /** só na apresentação: o selo que diz qual resumo é aquele painel */
  selo: string | null;
  /** a saudação grande do painel das 8h (a apresentação mostra o das 8h: "Bom dia", como a fala disse) */
  saudacao: 'Bom dia' | 'Boa tarde' | 'Boa noite';
  /** a linha embaixo da saudação: o fecho que a fala disse */
  fecho: string;
  /** a data com a hora (o resumo de agora) ou só a data (a apresentação mostra um exemplo) */
  comHora: boolean;
  /** o botão branco */
  cta: string;
  /** o botão branco leva à próxima parte da apresentação (e ela segue sozinha depois de alguns segundos) */
  avanca: boolean;
}

/** O painel que sobe no fim de cada fala. Apresentação (2 partes, gestor): parte 1 = o painel das 8h com o selo
    "Resumo da manhã" e "Continuar"; parte 2 = o das 17h com o selo "Diagnóstico do dia" e "Começar". */
export function painelDaTela(o: { tipo: TipoTela; parte: number; nPartes: number; gestor: boolean; nome: string; agora: Date }): PainelDaTela {
  const pn = primeiroNome(o.nome);
  const sd = saudacaoDoDia(o.agora);
  if (o.gestor && o.tipo === 'apresentacao' && o.nPartes > 1) {
    if (o.parte <= 0) return { tarde: false, selo: 'Resumo da manhã', saudacao: 'Bom dia', fecho: 'Bom trabalho!', comHora: false, cta: 'Continuar', avanca: true };
    const vinda = generoProvavel(pn) === 'f' ? 'bem-vinda' : 'bem-vindo';
    return { tarde: true, selo: 'Diagnóstico do dia', saudacao: sd, fecho: `Seja ${vinda} ao Atenvo!`, comHora: false, cta: 'Começar', avanca: false };
  }
  if (o.gestor && o.tipo === 'tarde') {
    return { tarde: true, selo: null, saudacao: sd, fecho: `Bom fim de dia${pn ? `, ${pn}` : ''}!`, comHora: true, cta: 'Continuar', avanca: false };
  }
  return { tarde: false, selo: null, saudacao: sd, fecho: 'Bom trabalho!', comHora: true, cta: 'Começar o dia', avanca: false };
}

/* ------------------------------------------------------------------
   Números por extenso (pt-BR). A legenda e o encaixe medem o que se
   FALA: "46" leva o tempo de "quarenta e seis", não o de dois dígitos
   (o gestor ouve "entraram 41 leads no sistema: 29 da campanha Antônio…").
   ------------------------------------------------------------------ */

const UNIDADES = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez',
  'onze', 'doze', 'treze', 'catorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CENTENAS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

/** Inteiro de 0 a 999.999 por extenso ("46" → "quarenta e seis"); fora disso, ''. */
export function porExtenso(n: number): string {
  if (!Number.isFinite(n) || n < 0 || n >= 1_000_000) return '';
  const v = Math.floor(n);
  if (v < 20) return UNIDADES[v];
  if (v < 100) {
    const u = v % 10;
    return u ? `${DEZENAS[Math.floor(v / 10)]} e ${UNIDADES[u]}` : DEZENAS[Math.floor(v / 10)];
  }
  if (v < 1000) {
    if (v === 100) return 'cem';
    const r = v % 100;
    return r ? `${CENTENAS[Math.floor(v / 100)]} e ${porExtenso(r)}` : CENTENAS[Math.floor(v / 100)];
  }
  const m = Math.floor(v / 1000);
  const r = v % 1000;
  const mil = m === 1 ? 'mil' : `${porExtenso(m)} mil`;
  if (!r) return mil;
  return `${mil}${r < 100 || r % 100 === 0 ? ' e ' : ' '}${porExtenso(r)}`;
}

/** O texto como ele é FALADO (algarismos por extenso). */
export const textoFalado = (s: string): string =>
  s.replace(/\d+/g, (d) => porExtenso(Number(d)) || 'x'.repeat(d.length * 4));

/** Cada palavra da frase e a fração dela no tempo falado (0..1). */
export interface PalavraFalada {
  texto: string;
  /** onde ela começa na frase falada (0..1) */
  ini: number;
  /** quanto ela ocupa (0..1) */
  len: number;
  numero: boolean;
}

export function medirPalavras(texto: string): PalavraFalada[] {
  const tokens = texto.split(/\s+/).filter(Boolean);
  const falados = tokens.map(textoFalado);
  const total = falados.reduce((a, t) => a + t.length, 0) + Math.max(0, tokens.length - 1) || 1;
  let off = 0;
  return tokens.map((tk, i) => {
    const len = falados[i].length;
    const p = { texto: tk, ini: off / total, len: len / total, numero: /^\d+[.,!?:;]?$/.test(tk) };
    off += len + 1;
    return p;
  });
}

/** A palavra acende quando COMEÇA a ser dita (15% dentro dela), não quando acaba. */
export const limiarPalavra = (p: PalavraFalada): number => p.ini + p.len * 0.15;

/* ------------------------------------------------------------------
   Legenda × áudio: a voz do Gemini não devolve o tempo de cada palavra.
   Cada trecho ganha um tempo proporcional ao tamanho FALADO (pontuação
   pesa como pausa) e, quando dá, a fronteira é ENCAIXADA no silêncio
   real mais próximo do áudio — as pausas entre frases ficam nítidas.
   ------------------------------------------------------------------ */

const peso = (s: string) => textoFalado(s).length + (s.match(/[.!?:]/g)?.length ?? 0) * 9 + (s.match(/,/g)?.length ?? 0) * 4;

/** Início (s) de cada trecho, distribuído pela duração total. */
export function inicioPorPeso(trechos: Trecho[], duracao: number): number[] {
  const pesos = trechos.map((x) => peso(x.texto));
  const total = pesos.reduce((a, b) => a + b, 0) || 1;
  const out: number[] = [];
  let acc = 0;
  for (const p of pesos) { out.push((acc / total) * duracao); acc += p; }
  return out;
}

/** A voz lida do PCM, em janelas de 20 ms. */
export interface AnaliseVoz {
  /** segundos por janela */
  passo: number;
  /** voz acumulada: quantas janelas COM voz houve até o início de cada janela (n + 1 valores) */
  cum: Float32Array;
  /** meio de cada pausa interna ≥ minPausa (s) */
  pausas: number[];
  /** [início, fim] de cada uma dessas pausas (s) */
  intervalos: Array<[number, number]>;
  /** fim da última sílaba (s) — o arquivo pode ter silêncio depois */
  fimVoz: number;
  duracao: number;
}

export function analisarVoz(amostras: Float32Array, taxa: number, minPausa = 0.16): AnaliseVoz {
  const janela = Math.max(1, Math.round(taxa * 0.02));
  const n = Math.ceil(amostras.length / janela);
  const rms = new Float32Array(n);
  let pico = 0;
  for (let k = 0; k < n; k++) {
    const i0 = k * janela;
    const i1 = Math.min(amostras.length, i0 + janela);
    let s = 0;
    for (let j = i0; j < i1; j++) s += amostras[j] * amostras[j];
    rms[k] = Math.sqrt(s / Math.max(1, i1 - i0));
    if (rms[k] > pico) pico = rms[k];
  }
  const limiar = Math.max(0.006, pico * 0.06);
  const passo = janela / taxa;
  const cum = new Float32Array(n + 1);
  const pausas: number[] = [];
  const intervalos: Array<[number, number]> = [];
  let ini = -1;
  let fimVoz = 0;
  for (let k = 0; k <= n; k++) {
    const quieto = k < n && rms[k] < limiar;
    if (k < n) {
      cum[k + 1] = cum[k] + (quieto ? 0 : 1);
      if (!quieto) fimVoz = (k + 1) * passo;
    }
    if (quieto && ini < 0) ini = k;
    if (!quieto && ini >= 0) {
      if ((k - ini) * passo >= minPausa && ini > 0 && k < n) {
        pausas.push(((ini + k) / 2) * passo);
        intervalos.push([ini * passo, k * passo]);
      }
      ini = -1;
    }
  }
  return { passo, cum, pausas, intervalos, fimVoz, duracao: amostras.length / taxa };
}

/** Silêncios (meio de cada pausa ≥ minPausa s) num canal PCM. */
export function acharPausas(amostras: Float32Array, taxa: number, minPausa = 0.16): number[] {
  return analisarVoz(amostras, taxa, minPausa).pausas;
}

/** Voz acumulada (em janelas) até o instante t — pausas não contam. */
export function vozAte(v: Pick<AnaliseVoz, 'passo' | 'cum'>, t: number): number {
  const n = v.cum.length - 1;
  const x = t / v.passo;
  if (x <= 0 || n <= 0) return 0;
  if (x >= n) return v.cum[n];
  const k = Math.floor(x);
  return v.cum[k] + (v.cum[k + 1] - v.cum[k]) * (x - k);
}

/** Encaixa cada fronteira estimada na pausa real mais próxima (até `folga` s, sem repetir). */
export function encaixarNasPausas(estimados: number[], pausas: number[], folga = 1.4): number[] {
  const usadas = new Set<number>();
  return estimados.map((t, i) => {
    if (i === 0) return 0;
    let melhor = -1;
    let dist = folga;
    pausas.forEach((p, k) => {
      const d = Math.abs(p - t);
      if (!usadas.has(k) && d < dist) { dist = d; melhor = k; }
    });
    if (melhor < 0) return t;
    usadas.add(melhor);
    return pausas[melhor];
  }).map((t, i, arr) => (i > 0 && t < arr[i - 1] ? arr[i - 1] : t));
}

/* ------------------------------------------------------------------
   O mapa da fala: em que frase ela está e quanto dela já foi DITO.
   - inicios: o meio da pausa encaixada (ou a estimativa) — onde a frase
     começa para a conta da voz;
   - trocas: quando a LEGENDA troca de frase — no INÍCIO da pausa (fim da
     voz da frase anterior): nunca sobra tela sem legenda e nunca ficam
     duas frases legíveis juntas;
   - ancoras: dentro da frase, cada pausa real prende a fronteira de
     palavra mais provável (pontuação > "e/ou/mas/que" > palavra comum):
     a legenda espera junto com ela.
   O progresso anda pela voz ACUMULADA (pausa não acende palavra).
   ------------------------------------------------------------------ */

export interface MapaFala {
  voz: AnaliseVoz;
  inicios: number[];
  trocas: number[];
  ancoras: Array<Array<[number, number]>>;
}

const CONJUNCAO = /^(e|ou|mas|que|porque|então|pois)$/i;

/** Âncoras [fração da voz, fração do texto falado] da frase que vai de `a` a `b` (s). */
export function ancorarFrase(voz: AnaliseVoz, a: number, b: number, texto: string): Array<[number, number]> {
  const va = vozAte(voz, a);
  const vb = vozAte(voz, b);
  const anc: Array<[number, number]> = [[0, 0], [1, 1]];
  if (vb <= va) return anc;
  const palavras = medirPalavras(texto);
  // fronteira k = antes da palavra k+1: depois de pontuação (folga larga), antes de conjunção (média), comum (curta)
  const fronteiras = palavras.slice(1).map((p, k) => (
    /[,.!?:;]$/.test(palavras[k].texto) ? { c: p.ini, nivel: 0, folga: 0.24 }
      : CONJUNCAO.test(p.texto) ? { c: p.ini, nivel: 1, folga: 0.16 }
        : { c: p.ini, nivel: 2, folga: 0.05 }));
  const usadas = new Set<number>();
  for (const [pi, pf] of voz.intervalos) {
    if (pi <= a + 0.15 || pf >= b - 0.15) continue;
    const f = (vozAte(voz, pi) - va) / (vb - va);
    let melhor = -1;
    let nivel = 9;
    let dist = 9;
    fronteiras.forEach((fr, k) => {
      const d = Math.abs(fr.c - f);
      if (usadas.has(k) || d > fr.folga) return;
      if (fr.nivel < nivel || (fr.nivel === nivel && d < dist)) { nivel = fr.nivel; dist = d; melhor = k; }
    });
    if (melhor >= 0) { usadas.add(melhor); anc.push([f, fronteiras[melhor].c]); }
  }
  anc.sort((x, y) => x[0] - y[0]);
  return anc.filter((x, k) => k === 0 || x[1] >= anc[k - 1][1]);   // nunca anda para trás
}

export function mapearFala(trechos: Trecho[], voz: AnaliseVoz): MapaFala {
  const inicios = encaixarNasPausas(inicioPorPeso(trechos, voz.duracao), voz.pausas);
  const trocas = inicios.map((t, i) => {
    if (i === 0) return 0;
    const k = voz.pausas.indexOf(t);
    return k >= 0 ? voz.intervalos[k][0] : t;
  });
  const ancoras = trechos.map((tr, i) => ancorarFrase(voz, inicios[i], i + 1 < inicios.length ? inicios[i + 1] : voz.duracao, tr.texto));
  return { voz, inicios, trocas, ancoras };
}

/** A frase da legenda no instante t (ela troca no início da pausa). */
export function fraseNoTempo(m: Pick<MapaFala, 'trocas'>, t: number): number {
  let i = 0;
  while (i + 1 < m.trocas.length && t >= m.trocas[i + 1]) i++;
  return i;
}

/** Quanto da frase i já foi dito em t (0..1 do texto falado), pela voz acumulada + âncoras. */
export function progressoFrase(m: MapaFala, i: number, t: number): number {
  const a = m.inicios[i] ?? 0;
  const b = i + 1 < m.inicios.length ? m.inicios[i + 1] : m.voz.duracao;
  const va = vozAte(m.voz, a);
  const vb = vozAte(m.voz, b);
  const f = vb > va ? Math.max(0, Math.min(1, (vozAte(m.voz, t) - va) / (vb - va))) : (t >= a ? 1 : 0);
  const anc = m.ancoras[i];
  if (!anc) return f;
  for (let k = 1; k < anc.length; k++) {
    const [f0, c0] = anc[k - 1];
    const [f1, c1] = anc[k];
    if (f <= f1) return f1 > f0 ? c0 + (c1 - c0) * ((f - f0) / (f1 - f0)) : c1;
  }
  return 1;
}

/* ------------------------------------------------------------------
   Ganho automático por banda (grave/médio/agudo). Os bytes do
   AnalyserNode são lineares em dB: outra voz ou outro volume DESLOCA a
   faixa útil inteira. O p95 corrido dos últimos ~3 s diz onde a voz
   está e a janela calibrada [lo, hi] anda junto (amaciada, com teto):
   a fita não apaga numa voz baixa nem estoura numa alta.
   ------------------------------------------------------------------ */

export interface GanhoBanda {
  lo: number;
  hi: number;
  /** p95 da voz em que [lo, hi] foi medida */
  ref: number;
  amostras: Float32Array;
  ordem: Float32Array;
  n: number;
  i: number;
  conta: number;
  alvo: number;
  desvio: number;
}

export function criarGanho(lo: number, hi: number, ref: number, janela = 180): GanhoBanda {
  return { lo, hi, ref, amostras: new Float32Array(janela), ordem: new Float32Array(janela), n: 0, i: 0, conta: 0, alvo: 0, desvio: 0 };
}

/** Lê um quadro da banda (0..1 do analisador) e devolve o nível 0..1 já com o ganho. */
export function aplicarGanho(g: GanhoBanda, bruto: number, dt: number): number {
  g.amostras[g.i] = bruto;
  g.i = (g.i + 1) % g.amostras.length;
  if (g.n < g.amostras.length) g.n++;
  if (++g.conta >= 8 && g.n >= 45) {
    g.conta = 0;
    const o = g.ordem.subarray(0, g.n);
    o.set(g.amostras.subarray(0, g.n));
    o.sort();
    g.alvo = Math.max(-0.3, Math.min(0.2, o[Math.floor((g.n - 1) * 0.95)] - g.ref));
  }
  g.desvio += (g.alvo - g.desvio) * (1 - Math.exp(-Math.max(0, dt) / 0.8));
  // o piso nunca desce até o silêncio (byte 0): pausa continua sendo pausa
  const lo = Math.max(0.01, g.lo + g.desvio);
  const hi = Math.max(lo + 0.08, g.hi + g.desvio);
  return Math.pow(Math.max(0, Math.min(1, (bruto - lo) / (hi - lo))), 1.15);
}

/* ------------------------------------------------------------------
   A animação: escala, largura da fita e o vigia de desempenho.
   (A esfera — bomDiaAnimacao.ts — mede o canvas pelo layout; escalaU e
   vaoDaFita ficam para o módulo da fita/fio, que usa a mesma interface.)
   ------------------------------------------------------------------ */

const entre01 = (x: number) => Math.max(0, Math.min(1, x));
const saidaCubica = (x: number) => 1 - Math.pow(1 - x, 3);
const curvaS = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

/** A unidade da tela (o --bd-u do CSS) calculada em JS: parseFloat de um clamp() dá NaN. */
export function escalaU(w: number, h: number): number {
  if (w <= 900) return 1;
  return Math.max(0.8, Math.min(1.42, Math.min(w / 1366, h / 657)));
}

/** Largura da fita (px). Em repouso ~40% da tela (nunca uma reta longa); falando ~70% (teto 1120u);
    pousada na borda do painel, metade da largura da fala. Abre do centro para as pontas. */
export function vaoDaFita(w: number, u: number, e: { abre: number; presenca: number; recolhe: number }): number {
  const fala = Math.min(w * 0.7, 1120 * u);
  const repouso = Math.min(w * 0.4, 640 * u);
  const base = repouso + (fala - repouso) * curvaS(entre01(e.presenca));
  const pousada = fala * 0.5;
  return (base + (pousada - base) * curvaS(entre01(e.recolhe))) * (0.04 + 0.96 * saidaCubica(entre01(e.abre)));
}

export interface MedidorQuadros { tempo: number; soma: number; n: number }
export const criarMedidor = (): MedidorQuadros => ({ tempo: 0, soma: 0, n: 0 });

/** Registra um quadro. Ao fechar cada janela (1,5 s, como o mock aprovado) diz se a média passou
    do teto (30 ms): true = janela lenta, false = boa, null = a janela ainda não fechou.
    Um tranco isolado (aba voltando, print de tela) conta no máximo 50 ms. */
export function quadroLento(m: MedidorQuadros, dtMs: number, tetoMs = 30, janelaMs = 1500): boolean | null {
  if (!(dtMs > 0)) return null;
  m.tempo += dtMs;
  m.soma += Math.min(dtMs, 50);
  m.n++;
  if (m.tempo < janelaMs) return null;
  const media = m.soma / m.n;
  m.tempo = 0;
  m.soma = 0;
  m.n = 0;
  return media > tetoMs;
}

/** Sem voz para medir (legenda pelo relógio): a fita respira devagar — nunca imita sílabas. */
export const respiracaoCalma = (t: number): number => 0.24 + 0.09 * Math.sin(t * 2.2) + 0.05 * Math.sin(t * 0.9 + 1.3);

/** O que o leitor de tela ouve quando o painel sobe (o gestor: o texto da fala inteiro). */
export function textoResumo(nome: string, r: ResumoBomDia, o: OpcoesFala = {}): string {
  if (r.modo === 'gestor') return textoCorrido(montarFala(nome, r, o));
  const pn = primeiroNome(nome);
  const partes = [
    `${pn ? `Olá, ${pn}. ` : ''}${qtd(r.novos, 'novo cliente', 'novos clientes')} e ${r.semResposta} sem resposta.`,
  ];
  if (r.passados > 0) partes.push(`${qtd(r.passados, 'cliente passado', 'clientes passados')} pelo robô.`);
  if (r.presenciais > 0) partes.push(`${qtd(r.presenciais, 'atendimento presencial', 'atendimentos presenciais')} hoje.`);
  return partes.join(' ');
}
