/* ------------------------------------------------------------------
   Texto da paleta de scripts — exibição (caixa-alta → frase) e busca
   sem acento/maiúscula com DESTAQUE mapeado de volta ao texto original.
   Puro (sem React/DOM) — coberto por texto.test.ts.
   ------------------------------------------------------------------ */

/* Os títulos chegam do arsenal quase sempre em CAIXA ALTA ("PEGAR DOCS MEUS INSS").
   Exibição: texto TODO em maiúsculas vira frase normal, preservando siglas e nomes
   do ramo (INSS, GOV, BMG, Crefisa…). Só muda a EXIBIÇÃO no seletor — o dado, a
   busca e o que vai pro compositor seguem intactos. Texto já misto passa reto. */
const SIGLAS_SCRIPT: Record<string, string> = {
  INSS: 'INSS', GOV: 'GOV', 'GOV.BR': 'GOV.BR', CPF: 'CPF', CNPJ: 'CNPJ', RG: 'RG',
  IA: 'IA', PDF: 'PDF', FGTS: 'FGTS', MIR: 'MIR', MIIR: 'MIIR', BMG: 'BMG',
  PAN: 'PAN', C6: 'C6', RMC: 'RMC', RCC: 'RCC', TED: 'TED', CREFISA: 'Crefisa',
  FACTA: 'Facta', SANTANDER: 'Santander', BRADESCO: 'Bradesco', ITAU: 'Itaú',
  'ITAÚ': 'Itaú', SAFRA: 'Safra', DAYCOVAL: 'Daycoval', WHATSAPP: 'WhatsApp', PIX: 'Pix',
};
export function exibirTextoScript(txt: string): string {
  const t = txt.trim();
  if (!t || t !== t.toLocaleUpperCase('pt-BR') || t === t.toLocaleLowerCase('pt-BR')) return t;
  return t.split(/\s+/).map((p, i) => {
    // descola pontuação de ABERTURA e fechamento, e trata compostos com / e -
    // (ex.: "(INSS)", "CPF/CNPJ", "INSS-GOV") para o lookup de siglas casar
    const m = p.match(/^([(["'«]*)(.*?)([)\]."'»:;!?,…]*)$/);
    const abre = m?.[1] ?? '', nucleo = m?.[2] ?? p, fecha = m?.[3] ?? '';
    const partes = nucleo.split(/([/-])/).map((seg, sIdx) => {
      if (sIdx % 2 === 1 || !seg) return seg;
      const fixa = SIGLAS_SCRIPT[seg];
      if (fixa) return fixa;
      if (/\d/.test(seg)) return seg;
      const baixa = seg.toLocaleLowerCase('pt-BR');
      return i === 0 && sIdx === 0
        ? baixa.charAt(0).toLocaleUpperCase('pt-BR') + baixa.slice(1)
        : baixa;
    });
    return abre + partes.join('') + fecha;
  }).join(' ');
}

/** Intervalo [início, fim) no texto ORIGINAL. */
export type Intervalo = [number, number];
/** Pedaço de texto para render: `m` = casou com a busca (vira <mark>). */
export type Pedaco = { t: string; m: boolean };

/* "Dobra" para busca: minúscula e sem acento, caractere a caractere, guardando de
   qual índice do original veio cada caractere dobrado — o destaque volta exato
   mesmo quando o texto tem acentos compostos/decompostos. */
export function dobrar(texto: string): { s: string; mapa: number[] } {
  let s = '';
  const mapa: number[] = [];
  for (let i = 0; i < texto.length; i++) {
    const f = texto[i].normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR');
    for (let j = 0; j < f.length; j++) { s += f[j]; mapa.push(i); }
  }
  return { s, mapa };
}

/** Termos da busca (dobrados, sem repetição; ordem preservada). */
export function termosDaBusca(q: string): string[] {
  const vistos = new Set<string>();
  for (const t of dobrar(q.trim()).s.split(/\s+/)) if (t) vistos.add(t);
  return [...vistos];
}

/** Algum termo aparece no texto? (versão barata, sem mapear índices) */
export function contemTermo(texto: string, termo: string): boolean {
  return !!texto && dobrar(texto).s.includes(termo);
}

/** Intervalos (no original) de TODAS as ocorrências dos termos — ordenados e fundidos. */
export function acharTrechos(texto: string, termos: string[]): Intervalo[] {
  if (!texto || termos.length === 0) return [];
  const { s, mapa } = dobrar(texto);
  const brutos: Intervalo[] = [];
  for (const termo of termos) {
    if (!termo) continue;
    let de = 0;
    for (;;) {
      const p = s.indexOf(termo, de);
      if (p < 0) break;
      brutos.push([mapa[p], mapa[p + termo.length - 1] + 1]);
      de = p + Math.max(1, termo.length);
    }
  }
  brutos.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out: Intervalo[] = [];
  for (const iv of brutos) {
    const ult = out[out.length - 1];
    if (ult && iv[0] <= ult[1]) ult[1] = Math.max(ult[1], iv[1]);
    else out.push([iv[0], iv[1]]);
  }
  return out;
}

/** Corta o texto em pedaços marcados/não marcados conforme os intervalos. */
export function fatiar(texto: string, intervalos: Intervalo[]): Pedaco[] {
  if (!intervalos.length) return texto ? [{ t: texto, m: false }] : [];
  const out: Pedaco[] = [];
  let i = 0;
  for (const [a, b] of intervalos) {
    if (a > i) out.push({ t: texto.slice(i, a), m: false });
    if (b > a) out.push({ t: texto.slice(a, b), m: true });
    i = Math.max(i, b);
  }
  if (i < texto.length) out.push({ t: texto.slice(i), m: false });
  return out;
}

/** Atalho: texto → pedaços destacados pelos termos. */
export function destacar(texto: string, termos: string[]): Pedaco[] {
  return fatiar(texto, acharTrechos(texto, termos));
}

/** Uma linha só: quebras e espaços repetidos viram um espaço. */
export function umaLinha(texto: string): string {
  return texto.replace(/\s+/g, ' ').trim();
}

/** *negrito* do WhatsApp sai dos marcadores na linha de apoio da lista. */
export function semMarcacao(texto: string): string {
  return texto.replace(/\*([^*\s][^*]*[^*\s]|[^*\s])\*/g, '$1');
}

/* Recorte em volta do 1º trecho que casou ("…senha do gov.br"), para a linha de apoio
   da lista (uma linha estreita) mostrar ONDE casou. `raio` = caracteres de contexto
   antes do trecho — curto de propósito: depois vem o que couber (a linha corta com
   reticências). Trecho perto do começo não corta nada. */
export function recorte(texto: string, termos: string[], raio = 14, limiar = raio + 10): Pedaco[] {
  const linha = umaLinha(texto);
  const ivs = acharTrechos(linha, termos);
  if (!ivs.length) return linha ? [{ t: linha, m: false }] : [];
  // trecho que já aparece no começo da linha (até `limiar` caracteres): não corta nada
  let ini = ivs[0][0] <= limiar ? 0 : ivs[0][0] - raio;
  if (ini > 0) {
    // começa na 1ª fronteira de palavra depois do corte (sem "…cumentos"), nunca depois do trecho
    const esp = linha.indexOf(' ', ini - 1);
    ini = esp >= 0 && esp + 1 <= ivs[0][0] ? esp + 1 : ini;
  }
  const corpo = linha.slice(ini);
  const deslocados = ivs.map(([a, b]) => [a - ini, b - ini] as Intervalo).filter(([, b]) => b > 0);
  const pedacos = fatiar(corpo, deslocados);
  if (ini > 0) pedacos.unshift({ t: '…', m: false });
  return pedacos;
}
