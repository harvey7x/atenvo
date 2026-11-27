/* Conteúdo do relatório montado UMA vez e usado em dois lugares: na tela
   (JSX) e no relatório HTML exportável / impressão (string). Os textos são
   os do app original ("ALFA Análise"), sem os emojis do cromo — o nível
   vira selo com texto (Alerta / Atenção / Informativo). */
import AlfaMotor from '../../data/analise/motor';
import type { Dossie, EstadoAnalise, NivelAlerta, OrigemUnificar, RegistroLinhaDoTempo, ResumoDossie } from './tipos';

/** Nome do produto no cromo da aba (o original se chamava "ALFA Análise"). */
export const NOME_PRODUTO = 'Análise INSS';

export type Tom = 'alerta' | 'atencao' | 'ok' | 'neutro';

/** Escape de HTML — o mesmo esc() do app original. */
export function esc(valor: unknown): string {
  return String(valor == null ? '' : valor)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** AAAAMMDD-hhmmss (marcaTempo do original). */
export function marcaTempo(): string {
  const d = new Date();
  const dois = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${dois(d.getMonth() + 1)}${dois(d.getDate())}`
    + `-${dois(d.getHours())}${dois(d.getMinutes())}${dois(d.getSeconds())}`;
}

export const ROTULO_NIVEL_ALERTA: Record<NivelAlerta, string> = {
  alerta: 'Alerta',
  atencao: 'Atenção',
  normal: 'Informativo',
};

export function tomDoNivel(nivel: NivelAlerta): Tom {
  return nivel === 'alerta' ? 'alerta' : nivel === 'atencao' ? 'atencao' : 'neutro';
}

export function etiquetaTroca(nivel: NivelAlerta): string {
  return nivel === 'alerta' ? 'possível troca indevida'
    : nivel === 'atencao' ? 'atenção' : 'troca sem sinal adicional';
}

export const MOTIVOS_VAZIOS = 'Troca sem sinais adicionais de risco — ainda assim, '
  + 'confirme com o titular se ele pediu essa mudança.';

/* ---------------------------------------------------------- veredito */
export interface Pilula { tom: Tom; texto: string }

export function montarVeredito(d: Dossie): Pilula[] {
  const res = d.resumo;
  const atencoes = d.alertas.filter((a) => a.nivel === 'atencao').length;
  const pilulas: Pilula[] = [];
  if (res.alertas_criticos) pilulas.push({ tom: 'alerta', texto: `${res.alertas_criticos} alerta(s) crítico(s)` });
  if (res.trocas_alerta) pilulas.push({ tom: 'alerta', texto: `${res.trocas_alerta} troca(s) para banco de risco` });
  if (atencoes) pilulas.push({ tom: 'atencao', texto: `${atencoes} ponto(s) de atenção` });
  if (!res.alertas_criticos && !res.trocas_alerta) pilulas.push({ tom: 'ok', texto: 'sem indícios críticos no período' });
  pilulas.push({ tom: 'neutro', texto: `${res.competencias} competências · ${res.trocas} troca(s) de banco` });
  return pilulas;
}

/* ---------------------------------------------------------- conclusão */
export interface Trecho { t: string; forte?: boolean; alerta?: boolean }
export type Paragrafo = Trecho[];

export function montarConclusao(res: ResumoDossie): Paragrafo[] {
  const ps: Paragrafo[] = [];
  if (res.trocas_alerta) {
    ps.push([
      { t: `Foram encontradas ${res.trocas_alerta} troca(s) de banco pagador para instituições que constam na lista de risco`, forte: true, alerta: true },
      { t: ' — bancos frequentemente associados a fraudes de portabilidade e consignado contra aposentados e pensionistas do INSS.' },
    ]);
    ps.push([
      { t: 'Isso ' }, { t: 'não prova', forte: true },
      { t: ' que houve fraude: essas instituições têm milhões de clientes legítimos. É um ' },
      { t: 'padrão compatível com fraude conhecida', forte: true },
      { t: ' e precisa ser confirmado com o titular do benefício: ele autorizou essa mudança de conta? Ele reconhece os empréstimos e descontos que aparecem depois dela?' },
    ]);
  } else if (res.trocas) {
    ps.push([
      { t: `Foram encontradas ${res.trocas} troca(s) de banco pagador no período, ` },
      { t: 'nenhuma delas para banco da lista de risco', forte: true },
      { t: '. Ainda assim, confirme com o titular se ele reconhece cada uma das mudanças listadas abaixo.' },
    ]);
  } else {
    ps.push([{ t: 'Nenhuma troca de banco pagador foi encontrada no período analisado — o benefício foi pago sempre pela mesma instituição.' }]);
  }
  if (res.total_associativo > 0) {
    ps.push([
      { t: 'Há também descontos de ' }, { t: 'associação/sindicato', forte: true },
      { t: ' no benefício, outro foco das investigações da CGU e do INSS. Verifique se o titular é realmente filiado.' },
    ]);
  }
  if (res.competencias_acima_teto) {
    ps.push([
      { t: 'Em ' },
      { t: `${res.competencias_acima_teto} competência(s) o consignado ultrapassou o teto de 45%`, forte: true },
      { t: ` do benefício bruto (pico de ${AlfaMotor.percentual(res.margem_maxima)}). Desconto acima da margem consignável é irregular por si só e pode ser contestado, independentemente de quem contratou.` },
    ]);
  }
  return ps;
}

/* ---------------------------------------------------- linha do tempo */
export interface CelulasLinha {
  consignado: string | null;      // null = '—'
  contratos: number;
  margem: string;
  margemAlta: boolean;
  associativo: string;
  ocorrencia: string;
}

export function celulasDaLinha(r: RegistroLinhaDoTempo): CelulasLinha {
  const margemOk = r.margem_pct !== null && r.margem_pct !== undefined;
  return {
    consignado: r.total_consignado > 0 ? AlfaMotor.moeda(r.total_consignado) : null,
    contratos: r.total_consignado > 0 ? (r.contratos_consignado || 0) : 0,
    margem: margemOk ? AlfaMotor.percentual(r.margem_pct) : '—',
    margemAlta: margemOk && (r.margem_pct as number) > AlfaMotor.MARGEM_TETO_DECIMOS,
    associativo: r.total_associativo > 0 ? AlfaMotor.moeda(r.total_associativo) : '—',
    ocorrencia: r.ocorrencia || r.status || '—',
  };
}

/** Largura da barra do banco: % das competências (1 casa). */
export function larguraFaixa(competenciasBanco: number, total: number): number {
  if (!total) return 0;
  return Math.round((competenciasBanco / total) * 1000) / 10;
}

/* --------------------------------------------------------- unificação */
export function nomeDoTitular(estado: EstadoAnalise): string {
  for (const d of estado.dossies) if (d.cabecalho.nome) return d.cabecalho.nome;
  return '';
}

export function periodoDaAnalise(estado: EstadoAnalise, origem: OrigemUnificar): string {
  const alvo = origem.de === 'relatorio'
    ? [estado.dossies[origem.indice]].filter(Boolean)
    : estado.dossies.filter((d) => d.linha_do_tempo.length);
  let inicio: RegistroLinhaDoTempo | null = null;
  let fim: RegistroLinhaDoTempo | null = null;
  for (const d of alvo) {
    const linha = d.linha_do_tempo;
    if (!linha.length) continue;
    const prim = linha[0];
    const ult = linha[linha.length - 1];
    if (inicio === null || prim.chave < inicio.chave) inicio = prim;
    if (fim === null || ult.chave > fim.chave) fim = ult;
  }
  return inicio && fim ? `${inicio.competencia} a ${fim.competencia}` : '—';
}

export function tamanhoKB(bytes: number): string {
  return `${(bytes / 1024).toFixed(0)} KB`;
}

/** Download local (Blob → <a download>), como no original. */
export function baixarBlob(blob: Blob, nome: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Mesma regra do original: `erro && erro.message ? erro.message : erro`. */
export function mensagemDe(erro: unknown): string {
  if (erro && typeof erro === 'object' && 'message' in erro) {
    const msg = (erro as { message: unknown }).message;
    if (msg) return String(msg);
  }
  return String(erro);
}

/** Contêiner que rola a página (no shell é a .pagina, não a janela). */
export function acharRolagem(el: Element | null): HTMLElement | null {
  let atual = el?.parentElement ?? null;
  while (atual) {
    const oy = getComputedStyle(atual).overflowY;
    if (oy === 'auto' || oy === 'scroll') return atual;
    atual = atual.parentElement;
  }
  return null;
}

export function semMovimento(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
      || document.documentElement.getAttribute('data-perf') === 'lite';
  } catch {
    return false;
  }
}
