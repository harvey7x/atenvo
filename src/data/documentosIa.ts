/* DOCUMENTOS RECONHECIDOS PELA IA (25/11, "algo melhor que" o sistema que a Reviza usava antes). A IA da própria
   empresa olha as fotos e os PDFs que o CLIENTE mandou e diz o que é cada um (RG, comprovante de endereço, extrato de
   empréstimos…), se dá para ler e, no RG, se veio a frente e o verso. Não copia nome, número nem valor nenhum.
   O servidor (atd-ia › identificar_documentos) grava em mensagens.metadados.doc_*; aqui fica a leitura disso e a
   conta de "chegaram / faltam / pedir de novo" do painel do cliente. Lógica pura: testada em documentosIa.test.ts. */
import type { WaMessage } from './whatsappDemo';

/** a mesma lista do servidor (supabase-reviza/functions/_shared/iaPropria.ts › TIPOS_DOCUMENTO) */
export const TIPOS_DOC = ['identidade', 'comprovante_endereco', 'extrato_consignado', 'extrato_pagamento', 'carta_concessao', 'contracheque', 'extrato_bancario', 'contrato', 'outro'] as const;
export type TipoDoc = typeof TIPOS_DOC[number];
export type LadoDoc = 'frente' | 'verso' | 'frente_e_verso' | null;

export interface DocIa { tipo: TipoDoc; lado: LadoDoc; legivel: boolean; obs: string }

/** nomes curtos: cabem no painel de 266px */
export const ROTULO_DOC: Record<TipoDoc, string> = {
  identidade: 'RG ou CNH',
  comprovante_endereco: 'Comprovante de endereço',
  extrato_consignado: 'Extrato de empréstimos',
  extrato_pagamento: 'Extrato de pagamento',
  carta_concessao: 'Carta de concessão',
  contracheque: 'Contracheque',
  extrato_bancario: 'Extrato bancário',
  contrato: 'Contrato',
  outro: 'Outro arquivo',
};

/** os documentos que a revisão pede (a lista do "Faltam"). Trocar aqui se a Reviza pedir outros. */
export const DOCS_DA_REVISAO: TipoDoc[] = ['identidade', 'comprovante_endereco', 'extrato_consignado'];

const ehTipo = (v: unknown): v is TipoDoc => typeof v === 'string' && (TIPOS_DOC as readonly string[]).includes(v);
const LADOS = ['frente', 'verso', 'frente_e_verso'];

/** metadados.doc_* da mensagem → o documento (ou null se a IA ainda não olhou) */
export function docDosMetadados(meta: Record<string, unknown> | null | undefined): DocIa | null {
  if (!meta || !ehTipo(meta.doc_tipo)) return null;
  const lado = typeof meta.doc_lado === 'string' && LADOS.includes(meta.doc_lado) ? (meta.doc_lado as LadoDoc) : null;
  return { tipo: meta.doc_tipo, lado, legivel: meta.doc_legivel !== false, obs: typeof meta.doc_obs === 'string' ? meta.doc_obs.slice(0, 160) : '' };
}

/** "RG ou CNH (só a frente)" */
export function rotuloDoDoc(d: DocIa): string {
  const base = ROTULO_DOC[d.tipo];
  if (d.tipo !== 'identidade') return base;
  if (d.lado === 'frente') return base + ' (só a frente)';
  if (d.lado === 'verso') return base + ' (só o verso)';
  return base;
}

/** é um arquivo que o cliente mandou e que a IA consegue olhar? (foto ou documento com arquivo) */
export const arquivoDoCliente = (m: WaMessage): boolean =>
  m.dir === 'in' && (m.tipo === 'imagem' || m.tipo === 'documento') && !!(m.anexoPath || m.localUrl);

export type EstadoDoc = 'chegou' | 'pedir_de_novo' | 'falta';
export interface LinhaDocRevisao { tipo: TipoDoc; estado: EstadoDoc; mensagemId: string | null; obs: string; rotulo: string }
export interface SituacaoDocs {
  /** um por documento da revisão, na ordem de DOCS_DA_REVISAO */
  revisao: LinhaDocRevisao[];
  /** o que chegou e não é da lista (extrato bancário, contrato…) */
  outros: { mensagemId: string; doc: DocIa }[];
  /** arquivos do cliente que a IA ainda não olhou */
  semIdentificar: number;
  /** a IA já olhou pelo menos um */
  algumIdentificado: boolean;
}

/** a conta do painel. `docDe` devolve o documento de cada mensagem (do servidor ou, na demonstração, do navegador). */
export function situacaoDosDocs(msgs: WaMessage[], docDe: (m: WaMessage) => DocIa | null): SituacaoDocs {
  const vistos: { m: WaMessage; d: DocIa }[] = [];
  let semIdentificar = 0;
  for (const m of msgs) {
    if (!arquivoDoCliente(m)) continue;
    const d = docDe(m);
    if (d) vistos.push({ m, d }); else semIdentificar++;
  }
  // o mais recente primeiro: se o cliente mandou de novo e agora dá para ler, vale o novo
  vistos.reverse();
  const revisao = DOCS_DA_REVISAO.map((tipo): LinhaDocRevisao => {
    const doTipo = vistos.filter((v) => v.d.tipo === tipo);
    const bom = doTipo.find((v) => v.d.legivel);
    const ruim = doTipo[0];
    if (bom) return { tipo, estado: 'chegou', mensagemId: bom.m.id ?? null, obs: '', rotulo: rotuloDoDoc(bom.d) };
    if (ruim) return { tipo, estado: 'pedir_de_novo', mensagemId: ruim.m.id ?? null, obs: ruim.d.obs, rotulo: ROTULO_DOC[tipo] };
    return { tipo, estado: 'falta', mensagemId: null, obs: '', rotulo: ROTULO_DOC[tipo] };
  });
  const outros = vistos.filter((v) => !DOCS_DA_REVISAO.includes(v.d.tipo) && v.m.id).map((v) => ({ mensagemId: v.m.id!, doc: v.d }));
  return { revisao, outros, semIdentificar, algumIdentificado: vistos.length > 0 };
}
