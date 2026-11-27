/* O ARQUIVO DA ATENDENTE DE IA (exportar / importar) — módulo PURO: sem React, sem banco.
   Quem usa: a tela (pages/Ia.tsx e pages/config/IrisImportar.tsx) e a ferramenta que confere um
   arquivo antes de ele ir para o cliente (tools/iris/conferir.ts). É o mesmo código nos dois lugares:
   se a ferramenta aprova, a tela importa igual.

   Formato (JSON):
     tipo 'atendente-atenvo' · versao 1 · nome · provedor · modelo · personaPrompt · conhecimento
     · comportamentos { horario {ativo, inicio, fim}, janela {inicio, fim}, nudges_ativos,
       max_chamadas_dia, proibidos[], permitir_emojis, simular_digitacao, modelo_docs, modelo_pro }
     · opcionais, só para quem recebe saber o que é: para (cliente) · feitoEm · nota
   A CHAVE da IA nunca vai no arquivo (fica no cofre de quem usa). O arquivo é tratado como fonte não
   confiável: só entram campos conhecidos, com teto de tamanho; o que passa do teto é cortado e avisado. */
import type { AgenteIa, ComportamentosIa, ProvedorIa } from './ia';

export const LIMITES_ARQUIVO = { nome: 120, modelo: 80, persona: 20000, conhecimento: 8000, proibidos: 50, proibido: 80, info: 400 } as const;
export interface InfoArquivo { para: string; feitoEm: string; nota: string }
export interface ArquivoAgente {
  nome: string; provedor: ProvedorIa; modelo: string; personaPrompt: string; conhecimento: string; comportamentos: ComportamentosIa;
  /** de quem é e o que mudou — só informação para quem importa */
  info: InfoArquivo;
  /** o que precisou ser cortado ou trocado para caber nas regras (vazio = entrou inteiro) */
  cortes: string[];
}

export function exportarAgente(a: AgenteIa) {
  // NUNCA exporta a chave (fica no cofre). O importador coloca a própria.
  return { tipo: 'atendente-atenvo', versao: 1, nome: a.nome, provedor: a.provedor, modelo: a.modelo,
    personaPrompt: a.personaPrompt, conhecimento: a.conhecimento, comportamentos: a.comportamentos };
}
const PROVEDORES_OK = new Set(['gemini', 'openai', 'anthropic']);
const hhmm = (v: unknown): string | undefined => {
  const s = String(v);
  const m = /^(\d{2}):(\d{2})$/.exec(s);
  if (!m) return undefined;
  const h = Number(m[1]), min = Number(m[2]);
  return h <= 23 && min <= 59 ? s : undefined;   // rejeita "99:99"/"40:70" do arquivo importado
};
const strOnly = (v: unknown, max: number): string => (typeof v === 'string' ? v : '').slice(0, max);
/** reconstrói comportamentos só com chaves conhecidas e limites (arquivo importado = não confiável) */
function sanearComportamentos(v: unknown): ComportamentosIa {
  const c = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const out: ComportamentosIa = {};
  if (c.horario && typeof c.horario === 'object') {
    const h = c.horario as Record<string, unknown>;
    out.horario = { ativo: h.ativo === true, inicio: hhmm(h.inicio), fim: hhmm(h.fim) };
  }
  if (c.janela && typeof c.janela === 'object') {
    const j = c.janela as Record<string, unknown>;
    out.janela = { inicio: hhmm(j.inicio), fim: hhmm(j.fim) };
  }
  if (typeof c.nudges_ativos === 'boolean') out.nudges_ativos = c.nudges_ativos;
  if (typeof c.max_chamadas_dia === 'number' && isFinite(c.max_chamadas_dia)) out.max_chamadas_dia = Math.max(0, Math.min(100000, Math.floor(c.max_chamadas_dia)));
  if (Array.isArray(c.proibidos)) out.proibidos = c.proibidos.slice(0, LIMITES_ARQUIVO.proibidos).map((s) => strOnly(s, LIMITES_ARQUIVO.proibido).trim()).filter(Boolean);
  if (typeof c.permitir_emojis === 'boolean') out.permitir_emojis = c.permitir_emojis;
  if (typeof c.simular_digitacao === 'boolean') out.simular_digitacao = c.simular_digitacao;
  if (typeof c.modelo_docs === 'string' && c.modelo_docs) out.modelo_docs = c.modelo_docs.slice(0, 80);
  if (typeof c.modelo_pro === 'string' && c.modelo_pro) out.modelo_pro = c.modelo_pro.slice(0, 80);
  return out;
}
const mil = (n: number) => n.toLocaleString('pt-BR');

export function parseAgenteImportado(texto: string): ArquivoAgente {
  let obj: Record<string, unknown>;
  // o texto pode vir colado de uma mensagem: tira espaços e a cerca de código, se houver
  const limpo = texto.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { obj = JSON.parse(limpo) as Record<string, unknown>; }
  catch { throw new Error('Arquivo inválido: não parece um JSON de atendente.'); }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('Arquivo inválido.');
  if (obj.tipo && obj.tipo !== 'atendente-atenvo') throw new Error('Este arquivo é de outro tipo (talvez um Fluxo). Use "Importar" na área certa.');
  if (obj.personaPrompt === undefined && obj.comportamentos === undefined) throw new Error('Este arquivo não parece um atendente (sem prompt/comportamentos).');
  const provedor = (PROVEDORES_OK.has(obj.provedor as string) ? obj.provedor : 'gemini') as ProvedorIa;
  const cortes: string[] = [];
  const tam = (v: unknown) => (typeof v === 'string' ? v.length : 0);
  if (tam(obj.personaPrompt) > LIMITES_ARQUIVO.persona) cortes.push(`A personalidade tinha ${mil(tam(obj.personaPrompt))} caracteres e foi cortada em ${mil(LIMITES_ARQUIVO.persona)}.`);
  if (tam(obj.conhecimento) > LIMITES_ARQUIVO.conhecimento) cortes.push(`O conhecimento tinha ${mil(tam(obj.conhecimento))} caracteres e foi cortado em ${mil(LIMITES_ARQUIVO.conhecimento)}.`);
  if (obj.provedor && !PROVEDORES_OK.has(obj.provedor as string)) cortes.push('O provedor do arquivo não é conhecido; ficou o Gemini.');
  const brutoProibidos = (obj.comportamentos && typeof obj.comportamentos === 'object' ? (obj.comportamentos as Record<string, unknown>).proibidos : null);
  const comportamentos = sanearComportamentos(obj.comportamentos);
  if (Array.isArray(brutoProibidos) && brutoProibidos.length !== (comportamentos.proibidos ?? []).length) cortes.push(`Dos ${brutoProibidos.length} temas proibidos, entraram ${(comportamentos.proibidos ?? []).length} (vazios ou acima do limite ficaram de fora).`);
  return {
    nome: strOnly(obj.nome, LIMITES_ARQUIVO.nome) || 'Atendente importado',
    provedor,
    modelo: strOnly(obj.modelo, LIMITES_ARQUIVO.modelo),
    personaPrompt: strOnly(obj.personaPrompt, LIMITES_ARQUIVO.persona),
    conhecimento: strOnly(obj.conhecimento, LIMITES_ARQUIVO.conhecimento),
    comportamentos,
    info: { para: strOnly(obj.para, 120).trim(), feitoEm: strOnly(obj.feitoEm, 40).trim(), nota: strOnly(obj.nota, LIMITES_ARQUIVO.info).trim() },
    cortes,
  };
}

/** o que veio no arquivo, em linhas que qualquer pessoa entende (a conferência antes de importar) */
export function resumoDoArquivo(a: ArquivoAgente): { rotulo: string; valor: string; vazio: boolean }[] {
  const c = a.comportamentos;
  const n = (c.proibidos ?? []).length;
  const linha = (rotulo: string, valor: string, vazio = false) => ({ rotulo, valor, vazio });
  return [
    linha('Nome da atendente', a.nome),
    linha('Personalidade e instruções', a.personaPrompt.trim() ? `${mil(a.personaPrompt.length)} caracteres` : 'Não veio no arquivo', !a.personaPrompt.trim()),
    linha('Conhecimento da empresa', a.conhecimento.trim() ? `${mil(a.conhecimento.length)} caracteres` : 'Não veio no arquivo', !a.conhecimento.trim()),
    linha('Temas proibidos', n ? `${n} ${n === 1 ? 'tema' : 'temas'}` : 'Nenhum', false),
    linha('Horário de atendimento', c.horario ? (c.horario.ativo ? `${c.horario.inicio ?? '09:00'} às ${c.horario.fim ?? '19:00'}` : 'Atende a qualquer hora') : 'Fica o padrão do sistema'),
    linha('Retorno automático', c.nudges_ativos === undefined ? 'Fica o padrão do sistema' : c.nudges_ativos ? 'Ligado' : 'Desligado'),
    linha('Modelo de IA', a.modelo || 'Fica o recomendado'),
  ];
}
