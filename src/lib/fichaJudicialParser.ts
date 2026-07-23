// Parser determinístico da ficha judicial (Promosys/iCred). Puro, sem rede/IA/Supabase/DOM.
// Estratégias em cascata por campo; nunca inventa; informa confiança e avisos; remove senha.
import {
  normalizaComparacao, somenteDigitos, cpfValido, normalizaCpf, normalizaTelefone,
  parseMoedaBRL, parseDataBR, calculaIdade, linhasLimpas, linhaAposRotulo, celulasTab, redigeCredenciais,
  hojeISOSaoPaulo,
} from './fichaJudicialNormalizers';
import { bancoPorCodigo, bancoPorNome } from '@/data/bancosCompe';
import { resolverBancoFicha, bancoFichaPorCodigo, bancoFichaPorNome, BANCOS_REV_EMPRESTIMO } from '@/data/bancosFicha';

export const PARSER_VERSION = '2.0.0';

export type CampoConfianca = 'alta' | 'media' | 'baixa';
export type CampoOrigem = 'parser' | 'calculado' | 'sugerido' | 'manual' | 'nao_encontrado' | 'revisao_necessaria';
export type TipoBeneficio = 'aposentadoria' | 'pensao_por_morte' | 'bpc_loas' | 'outro';

export interface ParserWarning { codigo: string; campo?: string; mensagem: string; }

export interface FichaRevisaoDetectada {
  tipo: 'agibank' | 'rmc' | 'rcc' | 'emprestimo' | 'outro';
  bancoCodigo?: string;
  bancoNome?: string;
  valor?: number;
  descricaoLivre?: string;
  origem: 'parser';
  confianca: CampoConfianca;
  requerConfirmacao: boolean;
}

export interface FichaJudicialParseResult {
  textoSanitizado: string;
  nome?: string;
  cpf?: string;
  beneficioNumero?: string;
  especieCodigo?: string;
  especieDescricao?: string;
  tipoBeneficio?: TipoBeneficio;
  nascimento?: string;
  idadeInformada?: number;
  idadeCalculada?: number;
  cidade?: string;
  uf?: string;
  telefone?: string;
  email?: string;
  bancoCodigo?: string;
  bancoNome?: string;
  valorBeneficio?: number;
  dataConsulta?: string;
  revisoes: FichaRevisaoDetectada[];
  avisos: ParserWarning[];
  confiancaPorCampo: Record<string, CampoConfianca>;
  origemPorCampo: Record<string, CampoOrigem>;
  parserVersion: string;
}

const UFS = new Set(['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO']);
const NOME_BLOCKLIST = new Set(['resumo', 'informacoes do beneficio', 'informacoes do benefício', 'telefones', 'telefone', 'banco', 'enviar', 'integracoes', 'confirmar telefone', 'simulador', 'ativo', 'endereco', 'especie', 'beneficio', 'cpf', 'nome']);
// mapeia código de espécie -> tipo de benefício
const ESPECIE_TIPO: Record<string, TipoBeneficio> = { '21': 'pensao_por_morte', '32': 'aposentadoria', '41': 'aposentadoria', '42': 'aposentadoria', '92': 'aposentadoria', '87': 'bpc_loas', '88': 'bpc_loas' };

// ---- Seções do bloco colado (Promosys/iCred) ----------------------------------------------------
// O bloco vem em "cards": um cabeçalho de seção e as linhas do card abaixo. Ler cada campo DENTRO da
// sua seção é o que impede o valor de um card vazar para outro (ex.: banco do cartão virar pagador).
const CABECALHOS = [
  'resumo', 'cpf / beneficio', 'cpf/beneficio', 'cpf e beneficio', 'nome', 'nascimento', 'data de nascimento',
  'endereco', 'enderecos', 'telefones', 'telefone', 'informacoes do beneficio', 'informacoes do benef',
  'dados do beneficio', 'integracoes', 'integracao', 'contratos', 'emprestimos', 'cartoes', 'cartao',
  'representante', 'representante legal', 'simulador', 'observacoes', 'margem', 'beneficios', 'bancos',
];
const soCabecalho = (n: string) => CABECALHOS.includes(n.replace(/[:•]/g, '').trim());

/** Índices das linhas de uma seção (do cabeçalho até o próximo cabeçalho). [] se a seção não existir. */
function linhasDaSecao(linhas: string[], norm: string[], nomes: string[]): string[] {
  const alvo = nomes.map((s) => normalizaComparacao(s));
  const out: string[] = [];
  for (let i = 0; i < norm.length; i++) {
    const n = norm[i].replace(/[:•]/g, '').trim();
    if (!alvo.includes(n)) continue;
    for (let j = i + 1; j < linhas.length; j++) {
      if (soCabecalho(norm[j])) break;
      out.push(linhas[j]);
    }
  }
  return out;
}

/** Células de uma linha por TAB, "/", "|" ou ";" — o Promosys usa "CPF / Benefício" numa linha só. */
function celulasSeparadas(linha: string): string[] {
  return (linha || '').split(/[\t|;/]/).map((c) => c.trim()).filter(Boolean);
}

function vazio(): FichaJudicialParseResult {
  return { textoSanitizado: '', revisoes: [], avisos: [], confiancaPorCampo: {}, origemPorCampo: {}, parserVersion: PARSER_VERSION };
}

export interface ParseOpcoes {
  /** Data da ficha (ISO yyyy-mm-dd) usada como referência da idade. Default: hoje em America/Sao_Paulo. */
  dataFicha?: string;
}

export function parseFichaJudicial(texto: string, opcoes: ParseOpcoes = {}): FichaJudicialParseResult {
  const res = vazio();
  const dataFicha = /^\d{4}-\d{2}-\d{2}$/.test(opcoes.dataFicha ?? '') ? opcoes.dataFicha! : hojeISOSaoPaulo();
  const aviso = (codigo: string, mensagem: string, campo?: string) => res.avisos.push({ codigo, campo, mensagem });
  const conf = (campo: string, c: CampoConfianca, o: CampoOrigem) => { res.confiancaPorCampo[campo] = c; res.origemPorCampo[campo] = o; };

  try {
    if (typeof texto !== 'string' || texto.trim() === '') {
      aviso('TEXTO_VAZIO', 'O texto da consulta está vazio.');
      return res;
    }
    const sanitizado = redigeCredenciais(linhasLimpas(texto));
    res.textoSanitizado = sanitizado;
    const linhas = sanitizado.split('\n');
    const norm = linhas.map(normalizaComparacao);

    // ---- CPF / Benefício (bloco) ----
    let cpfDigitos: string | undefined;
    let beneficio: string | undefined;
    // O par vem como "434.643.600-59 / 1564912601" — uma linha só, separada por "/" (ou TAB).
    // Ler os DOIS da MESMA linha é o que garante que benefício e CPF são do mesmo cliente.
    for (let i = 0; i < norm.length; i++) {
      if (!(norm[i].includes('cpf') && norm[i].includes('benef'))) continue;
      // o par pode estar na própria linha do rótulo (após ":") ou nas 2 linhas seguintes
      const aposDoisPontos = linhas[i].includes(':') ? linhas[i].slice(linhas[i].indexOf(':') + 1) : '';
      const candidatas = [aposDoisPontos, ...linhas.slice(i + 1, Math.min(i + 3, linhas.length))];
      for (const bruta of candidatas) {
        if (!bruta || !bruta.trim()) continue;
        const cels = celulasSeparadas(bruta);
        const dig = cels.map(somenteDigitos).filter(Boolean);
        const cpfCel = dig.find((d) => d.length === 11 && cpfValido(d));
        const benCel = dig.find((d) => d !== cpfCel && d.length >= 9 && d.length <= 11);
        if (cpfCel) { cpfDigitos = cpfCel; conf('cpf', 'alta', 'parser'); }
        if (benCel) { beneficio = benCel; conf('beneficioNumero', 'alta', 'parser'); }
        if (cpfCel || benCel) break;
      }
      if (cpfDigitos || beneficio) break;
    }
    // ---- CPF (cascata) ----
    if (!cpfDigitos) {
      const rot = linhaAposRotulo(linhas, 'cpf');
      const fmt = sanitizado.match(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/);
      const cand = rot && cpfValido(rot) ? somenteDigitos(rot) : (fmt && cpfValido(fmt[0]) ? somenteDigitos(fmt[0]) : undefined);
      if (cand) { cpfDigitos = cand; conf('cpf', rot ? 'alta' : 'media', 'parser'); }
    }
    if (!cpfDigitos) {
      const todos = sanitizado.match(/\b\d{11}\b/g) || [];
      const valido = todos.find((d) => cpfValido(d));
      if (valido) { cpfDigitos = valido; conf('cpf', 'baixa', 'parser'); }
    }
    if (cpfDigitos) {
      res.cpf = normalizaCpf(cpfDigitos);
    } else {
      // havia algo parecido com CPF mas inválido?
      const algum = sanitizado.match(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/);
      if (algum && !cpfValido(algum[0])) { aviso('CPF_INVALIDO', 'CPF encontrado é inválido. Revise.', 'cpf'); conf('cpf', 'baixa', 'nao_encontrado'); }
      else aviso('CPF_NAO_ENCONTRADO', 'Não foi possível identificar o CPF.', 'cpf');
    }

    // ---- Benefício (cascata) ----
    // "Benefício: 1564912601" DENTRO de INFORMAÇÕES DO BENEFÍCIO tem prioridade sobre qualquer outro.
    if (!beneficio) {
      const infos = linhasDaSecao(linhas, norm, ['informacoes do beneficio', 'dados do beneficio']);
      const rot = linhaAposRotulo(infos.length ? infos : linhas, 'beneficio');
      const dig = rot ? somenteDigitos(rot) : '';
      if (dig.length >= 9 && dig.length <= 11 && dig !== cpfDigitos) { beneficio = dig; conf('beneficioNumero', 'alta', 'parser'); }
    }
    // SEM fallback "primeiro número de 10 dígitos do documento": ali moram contrato, matrícula e protocolo.
    // Melhor sair vazio com ALERTA do que sair com benefício de outro registro.
    if (beneficio) res.beneficioNumero = beneficio;
    else aviso('BENEFICIO_NAO_ENCONTRADO', 'ALERTA: benefício não encontrado no texto colado.', 'beneficioNumero');

    // ---- Data da ficha ----
    // Regra do escritório: DATA é SEMPRE a data atual (America/Sao_Paulo), nunca a data que veio no bloco.
    res.dataConsulta = dataFicha;
    conf('dataConsulta', 'alta', 'calculado');

    // ---- Nome ----
    const nomeRot = linhaAposRotulo(linhas, 'nome');
    if (nomeRot) {
      const n = normalizaComparacao(nomeRot);
      const temDigito = /\d/.test(nomeRot);
      if (n && !NOME_BLOCKLIST.has(n) && !temDigito && nomeRot.length >= 3) { res.nome = nomeRot.replace(/\s+/g, ' ').trim(); conf('nome', 'alta', 'parser'); }
    }

    // ---- Nascimento / idade ----
    for (const rot of ['data de nascimento', 'nascimento', 'data nasc', 'nasc']) {
      const v = linhaAposRotulo(linhas, rot);
      const d = v ? parseDataBR(v) : undefined;
      if (d) { res.nascimento = d; conf('nascimento', 'alta', 'parser'); break; }
    }
    const idadeRot = linhaAposRotulo(linhas, 'idade');
    let idadeInf: number | undefined;
    if (idadeRot && /^\d{1,3}/.test(idadeRot.trim())) idadeInf = Number(idadeRot.trim().match(/\d{1,3}/)![0]);
    if (idadeInf === undefined) { const m = sanitizado.match(/\b(\d{1,3})\s*anos\b/i); if (m) idadeInf = Number(m[1]); }
    if (idadeInf !== undefined && idadeInf >= 0 && idadeInf < 150) { res.idadeInformada = idadeInf; conf('idadeInformada', 'media', 'parser'); }
    // A idade da ficha é SEMPRE recalculada (nascimento × data da ficha). A idade colada do Promosys é
    // só referência para avisar divergência — nunca vai para a ficha.
    if (res.nascimento) {
      const calc = calculaIdade(res.nascimento, dataFicha);
      if (calc !== undefined) { res.idadeCalculada = calc; conf('idadeCalculada', 'alta', 'calculado'); }
      if (calc !== undefined && res.idadeInformada !== undefined && calc !== res.idadeInformada) {
        aviso('IDADE_DIVERGENTE', `Idade do texto colado (${res.idadeInformada}) difere da calculada (${calc}). Vale a calculada.`, 'idade');
        conf('idadeInformada', 'baixa', 'parser');
      }
    } else {
      aviso('NASCIMENTO_NAO_ENCONTRADO', 'ALERTA: nascimento não encontrado; idade não calculada.', 'nascimento');
    }

    // ---- Cidade / UF ----
    // Vem da seção Endereço, na linha "PORTO ALEGRE - RS" (a de cima é logradouro, a de baixo é CEP).
    {
      const endereco = linhasDaSecao(linhas, norm, ['endereco', 'enderecos']);
      const varrer = endereco.length ? endereco : linhas;
      const alta = endereco.length > 0;
      for (const l of varrer) {
        const m = l.match(/([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ .'’]*[A-Za-zÀ-ÿ.])\s*[-/]\s*([A-Za-z]{2})\b/);
        if (!m) continue;
        const uf = m[2].toUpperCase();
        if (!UFS.has(uf)) continue;
        const cidade = m[1].replace(/\s+/g, ' ').trim();
        const nc = normalizaComparacao(cidade);
        // descarta logradouro e rótulos que não são cidade
        if (/^(rua|r|av|avenida|travessa|trav|rod|rodovia|estrada|praca|praça|alameda|linha)\b/.test(nc)) continue;
        if (cidade.length < 2) continue;
        res.cidade = cidade.toUpperCase(); res.uf = uf;
        conf('cidade', alta ? 'alta' : 'baixa', 'parser');
        conf('uf', alta ? 'alta' : 'baixa', 'parser');
        break;
      }
      if (!res.cidade) aviso('CIDADE_NAO_ENCONTRADA', 'Cidade/UF não encontrada no endereço. Preencha manualmente.', 'cidade');
    }

    // ---- Telefone ----
    // Vem SEMPRE da seção TELEFONES do bloco colado. Prioridade: validado/WhatsApp > primeiro da lista.
    {
      const secTel = linhasDaSecao(linhas, norm, ['telefones', 'telefone']);
      const varrer = secTel.length ? secTel : linhas;
      const achados: { digitos: string; whats: boolean }[] = [];
      for (const l of varrer) {
        const nl = normalizaComparacao(l);
        const whats = /whats|zap|validado|verificado/.test(nl);
        for (const bruto of l.match(/\(?\d{2}\)?[ .-]?\d{4,5}[ .-]?\d{4}\b/g) || []) {
          const d = normalizaTelefone(bruto);
          if (d.length !== 10 && d.length !== 11) continue;
          if (d === cpfDigitos || d === beneficio) continue;
          if (cpfDigitos?.includes(d) || beneficio?.includes(d)) continue;
          if (achados.some((a) => a.digitos === d)) continue;
          achados.push({ digitos: d, whats });
        }
      }
      const escolhido = achados.find((a) => a.whats) ?? achados[0];
      if (escolhido) { res.telefone = escolhido.digitos; conf('telefone', secTel.length ? 'alta' : 'media', 'parser'); }
      else aviso('TELEFONE_NAO_ENCONTRADO', 'ALERTA: telefone não encontrado.', 'telefone');
      if (achados.length > 1) aviso('TELEFONES_CONCORRENTES', `Há ${achados.length} telefones no bloco; confira o principal.`, 'telefone');
    }

    // ---- E-mail ----
    {
      const m = sanitizado.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
      if (m) { res.email = m[0]; conf('email', 'alta', 'parser'); }
    }

    // ---- Espécie ----
    extrairEspecie(linhas, norm, res, conf, aviso);

    // ---- Banco pagador ----
    extrairBanco(linhas, norm, res, conf, aviso, cpfDigitos);

    // ---- Valor do benefício ----
    {
      let val: number | undefined;
      for (let i = 0; i < linhas.length; i++) {
        const n = norm[i];
        if (n.startsWith('valor beneficio') || n.startsWith('valor do beneficio')) {
          val = parseMoedaBRL(linhas[i]) ?? (linhas[i + 1] ? parseMoedaBRL(linhas[i + 1]) : undefined);
          if (val !== undefined) break;
        }
      }
      if (val !== undefined && val > 0) { res.valorBeneficio = val; conf('valorBeneficio', 'alta', 'parser'); }
      else aviso('VALOR_BENEFICIO_NAO_ENCONTRADO', 'ALERTA: valor do benefício não encontrado.', 'valorBeneficio');
    }

    // ---- Revisões ----
    extrairRevisoes(linhas, norm, res, aviso);

    // ---- Completude geral ----
    if (!res.cpf && !res.nome && !res.beneficioNumero) aviso('TEXTO_PARECE_INCOMPLETO', 'O texto parece incompleto: dados essenciais não foram encontrados.');

    return res;
  } catch {
    // defensivo: nunca lança para entrada arbitrária
    if (!res.avisos.some((a) => a.codigo === 'TEXTO_PARECE_INCOMPLETO')) {
      res.avisos.push({ codigo: 'TEXTO_PARECE_INCOMPLETO', mensagem: 'Não foi possível analisar o texto.' });
    }
    return res;
  }
}

function extrairEspecie(
  linhas: string[], norm: string[], res: FichaJudicialParseResult,
  conf: (c: string, cf: CampoConfianca, o: CampoOrigem) => void, aviso: (c: string, m: string, campo?: string) => void,
): void {
  const setEspecie = (codigo: string | undefined, desc: string | undefined, c: CampoConfianca, origem: CampoOrigem) => {
    if (codigo) { res.especieCodigo = codigo; conf('especieCodigo', c, origem); }
    if (desc) { res.especieDescricao = desc.replace(/\s+/g, ' ').trim(); conf('especieDescricao', c, origem); }
    const tipo = codigo && ESPECIE_TIPO[codigo] ? ESPECIE_TIPO[codigo] : tipoPorDescricao(desc);
    if (tipo) { res.tipoBeneficio = tipo; conf('tipoBeneficio', c, origem); }
  };
  // 1) rótulo Espécie + código + descrição (mesma linha) ou célula tabulada
  for (let i = 0; i < linhas.length; i++) {
    if (!norm[i].includes('especie')) continue;
    const m = linhas[i].match(/(\d{2})\s*[-–]\s*([A-Za-zÀ-ÿ][^\t\n]+)/);
    if (m) { setEspecie(m[1], m[2], 'alta', 'parser'); return; }
    const cels = celulasTab(linhas[i]).filter(Boolean);
    const cod = cels.map((c) => c.match(/^\d{2}$/)?.[0]).find(Boolean);
    if (cod) { const desc = cels.find((c) => /[A-Za-zÀ-ÿ]{4,}/.test(c)); setEspecie(cod, desc, 'alta', 'parser'); return; }
    // valor na linha seguinte (código - descrição) ou célula tabulada (código \t descrição)
    const prox = linhas[i + 1];
    const m2 = prox ? prox.match(/(\d{2})\s*[-–]\s*([A-Za-zÀ-ÿ][^\t\n]+)/) : null;
    if (m2) { setEspecie(m2[1], m2[2], 'alta', 'parser'); return; }
    const proxCels = celulasTab(prox || '').filter(Boolean);
    const cod2 = proxCels.map((c) => c.match(/^\d{2}$/)?.[0]).find(Boolean);
    if (cod2) { const d = proxCels.find((c) => /[A-Za-zÀ-ÿ]{4,}/.test(c)); setEspecie(cod2, d, 'alta', 'parser'); return; }
  }
  // 2) código + descrição previdenciária em qualquer lugar
  const g = res.textoSanitizado.match(/\b(21|32|41|42|87|88|92)\s*[-–]\s*([A-Za-zÀ-ÿ][^\t\n]{4,})/);
  if (g) { setEspecie(g[1], g[2], 'media', 'parser'); return; }
  // 3) palavras-chave
  const t = normalizaComparacao(res.textoSanitizado);
  if (/\bbpc\b|\bloas\b|amparo social|prestacao continuada/.test(t)) { setEspecie(undefined, 'BPC/LOAS', 'baixa', 'parser'); res.tipoBeneficio = 'bpc_loas'; conf('tipoBeneficio', 'baixa', 'parser'); aviso('ESPECIE_BAIXA_CONFIANCA', 'Espécie identificada com baixa confiança. Revise antes de salvar.', 'especieCodigo'); return; }
  if (/pensao por morte/.test(t)) { setEspecie('21', 'Pensão por morte', 'baixa', 'parser'); aviso('ESPECIE_BAIXA_CONFIANCA', 'Espécie identificada com baixa confiança. Revise antes de salvar.', 'especieCodigo'); return; }
  if (/aposentadoria/.test(t)) { setEspecie(undefined, 'Aposentadoria', 'baixa', 'parser'); res.tipoBeneficio = 'aposentadoria'; conf('tipoBeneficio', 'baixa', 'parser'); aviso('ESPECIE_BAIXA_CONFIANCA', 'Espécie identificada com baixa confiança. Revise antes de salvar.', 'especieCodigo'); return; }
  if (/auxilio/.test(t)) { setEspecie(undefined, 'Auxílio', 'baixa', 'parser'); res.tipoBeneficio = 'outro'; conf('tipoBeneficio', 'baixa', 'parser'); aviso('ESPECIE_BAIXA_CONFIANCA', 'Espécie identificada com baixa confiança. Revise antes de salvar.', 'especieCodigo'); return; }
}

function tipoPorDescricao(desc?: string): TipoBeneficio | undefined {
  if (!desc) return undefined;
  const d = normalizaComparacao(desc);
  if (/pensao por morte/.test(d)) return 'pensao_por_morte';
  if (/bpc|loas|amparo|prestacao continuada/.test(d)) return 'bpc_loas';
  if (/aposentadoria/.test(d)) return 'aposentadoria';
  return 'outro';
}

function extrairBanco(
  linhas: string[], norm: string[], res: FichaJudicialParseResult,
  conf: (c: string, cf: CampoConfianca, o: CampoOrigem) => void, aviso: (c: string, m: string, campo?: string) => void,
  cpfDigitos?: string,
): void {
  // Sempre normaliza para o nome curto do escritório: "756 BANCOOB" → "756 Sicoob", "033" → "33 SANTANDER".
  const aplicar = (codigo: string | undefined, nome: string | undefined, c: CampoConfianca) => {
    const b = resolverBancoFicha(codigo, nome);
    const cod = b?.codigo || codigo || '';
    const nom = b?.nomeCurto || nome || '';
    if (cod) { res.bancoCodigo = cod; conf('bancoCodigo', c, 'parser'); }
    if (nom) { res.bancoNome = nom; conf('bancoNome', c, 'parser'); }
  };
  // CONTEXTO PROIBIDO p/ banco pagador: cartão/RMC/RCC/contrato/empréstimo/consignado. Banco encontrado
  // aqui é banco de cartão/contrato (banco_rmc/banco_rcc/banco_contrato) e NUNCA banco pagador do benefício.
  // "margem disponível"/"reserva" sozinhos NÃO entram: são campos do próprio benefício (margem consignável).
  // Só o contexto inequívoco de cartão/contrato bloqueia (RMC/RCC = "reserva de margem/cartão consignável").
  const PROIBIDO = /\brmc\b|\brcc\b|\brev\b|cartao|cartão|contrato|emprestimo|empréstimo|consignad|reserva de margem|reserva de cartao|reserva de cartão|instituicao financeira|instituição financeira|\bcredor\b/;
  // Rótulos FORTES da seção de recebimento do benefício (confiança alta).
  const PAG_FORTE = /banco pagador|banco de pagamento|instituicao pagadora|instituição pagadora|orgao pagador|órgão pagador|dados bancarios|dados bancários|pagamento do beneficio|pagamento do benefício|meio de pagamento/;
  // Contexto de pagamento comum (confiança média): banco/recebe + agência/conta.
  const PAG_MEDIO = /\bbanco\b|recebe|pagamento|agencia|agência|conta corrente|\bconta\b/;

  // proibSelf = linha É de cartão/contrato. proibJanela = ±2 (layout de tabela põe rótulo "Cartão RMC" e
  // "934 - AGIPLAN" em linhas separadas). Um rótulo FORTE de pagamento ("Banco pagador") é autoritativo e
  // só é bloqueado se a PRÓPRIA linha for de cartão/contrato; o contexto fraco usa a janela inteira.
  const proibSelf = new Array(linhas.length).fill(false);
  const proibJanela = new Array(linhas.length).fill(false);
  for (let i = 0; i < norm.length; i++) {
    if (PROIBIDO.test(norm[i])) {
      proibSelf[i] = true;
      for (let j = Math.max(0, i - 2); j <= Math.min(norm.length - 1, i + 2); j++) proibJanela[j] = true;
    }
  }
  // Extrai o banco de UM texto. Só devolve banco CONHECIDO (tabela da ficha ou COMPE) — nunca "encurta"
  // uma linha qualquer, senão qualquer texto viraria banco. Ignora os 3 primeiros dígitos do CPF.
  const bancoDoTexto = (s: string): { codigo: string; nome: string } | null => {
    const cods = (s.match(/\b\d{3}\b/g) || []).filter((c) => c !== cpfDigitos?.slice(0, 3));
    const porNome = bancoFichaPorNome(s);
    if (porNome) return { codigo: porNome.codigo, nome: porNome.nomeCurto };
    const porCod = cods.map(bancoFichaPorCodigo).find(Boolean);
    if (porCod) return { codigo: porCod.codigo, nome: porCod.nomeCurto };
    const compe = cods.map(bancoPorCodigo).find(Boolean);
    if (compe) return { codigo: compe.codigo, nome: compe.nome };
    return bancoPorNome(s) ?? null;
  };
  const bancoDaLinha = (i: number) => bancoDoTexto(linhas[i]);

  // BLOQUEIO ABSOLUTO de banco pagador: PAN (623) e FACTA (935) NUNCA recebem o benefício, mesmo em
  // contexto de pagamento explícito. Seguem válidos como banco de cartão/contrato (revisoes[]).
  const PAGADOR_BLOQUEADO = new Set(['623', '935']);
  const ehBloqueadoPagador = (b: { codigo: string; nome: string }) =>
    PAGADOR_BLOQUEADO.has(b.codigo) || /\b(pan|banco pan|panamericano|facta)\b/.test(normalizaComparacao(b.nome));
  let viuBloqueado = false; // encontrou PAN/FACTA numa posição que SERIA de pagador
  const tentar = (b: { codigo: string; nome: string } | undefined | null, c: CampoConfianca): boolean => {
    if (!b) return false;
    if (ehBloqueadoPagador(b)) { viuBloqueado = true; return false; }
    aplicar(b.codigo, b.nome, c); return true;
  };

  // 0) ALTA: linha "Banco: 756 BANCOOB" DENTRO de INFORMAÇÕES DO BENEFÍCIO. É a fonte oficial do banco
  //    pagador no Promosys; ler aqui evita pegar banco de cartão/contrato de outra seção.
  {
    const info = linhasDaSecao(linhas, norm, ['informacoes do beneficio', 'dados do beneficio']);
    for (let i = 0; i < info.length; i++) {
      const n = normalizaComparacao(info[i]);
      if (!/^banco\b/.test(n) || PROIBIDO.test(n)) continue;
      for (const alvo of [info[i], info[i + 1] ?? '']) {
        if (!alvo || PROIBIDO.test(normalizaComparacao(alvo))) continue;
        const r = bancoDoTexto(alvo);
        if (r && tentar(r, 'alta')) return;
      }
    }
  }
  // 1) ALTA: rótulo forte de pagamento (na linha ou na seguinte). Bloqueia só se a linha lida for de cartão.
  for (let i = 0; i < norm.length; i++) {
    if (proibSelf[i] || !PAG_FORTE.test(norm[i])) continue;
    for (const k of [i, i + 1]) {
      if (k >= linhas.length || proibSelf[k]) continue;
      const r = bancoDaLinha(k);
      if (r && tentar(r, 'alta')) return; // rótulo forte é autoritativo
    }
  }
  // 2) MÉDIA: contexto de pagamento comum (banco/recebe/agência/conta), fora da JANELA de cartão/contrato.
  for (let i = 0; i < norm.length; i++) {
    if (proibJanela[i] || !PAG_MEDIO.test(norm[i])) continue;
    const r = bancoDaLinha(i);
    if (r && tentar(r, 'media')) return;
  }
  // 3) MÉDIA: célula tabulada na coluna "Banco" (respeita a janela de cartão/contrato).
  for (let i = 0; i < linhas.length; i++) {
    if (proibJanela[i] || !norm[i].includes('banco')) continue;
    const prox = linhas[i + 1];
    if (!prox || proibJanela[i + 1]) continue;
    for (const cel of celulasTab(prox).filter(Boolean)) {
      const cod = cel.match(/\b(\d{3})\b/)?.[1];
      if (tentar(cod ? bancoPorCodigo(cod) : bancoPorNome(cel), 'media')) return;
    }
  }
  // 4a) Só achou PAN/FACTA como candidato a pagador → NUNCA preenche; exige revisão explícita.
  if (viuBloqueado) {
    conf('bancoCodigo', 'baixa', 'revisao_necessaria');
    conf('bancoNome', 'baixa', 'revisao_necessaria');
    aviso('BANCO_PAGADOR_BLOQUEADO', 'Banco de recebimento não identificado com segurança. PAN/FACTA não devem ser usados como banco pagador.', 'bancoCodigo');
    return;
  }
  // 4b) NÃO encontrado em seção confiável: deixa vazio, confiança BAIXA e exige revisão. NUNCA usa o
  //     primeiro banco do documento (que pode ser de cartão/contrato) como pagador.
  conf('bancoCodigo', 'baixa', 'nao_encontrado');
  conf('bancoNome', 'baixa', 'nao_encontrado');
  aviso('BANCO_NAO_ENCONTRADO', 'Banco de recebimento do benefício não identificado com segurança.', 'bancoCodigo');
}

/** Extrai "código - banco" de uma linha de revisão no formato `934 - AGIPLAN FINANCEIRA S/A`.
 *  Aceita hífen/travessão/espaços extras e zeros à esquerda; ignora sufixo de valor (R$ ...).
 *  É a fonte estruturada dentro do texto: o código do consignado (ex.: 934) NÃO é COMPE, então
 *  não pode depender da tabela COMPE. Retorna null se não houver o par código-nome. */
function extrairCodBancoRev(linha: string): { codigo: string; nome: string } | null {
  // remove sufixo de valor (" - R$ 123,45" / "R$ 123,45") para não entrar no nome
  const base = linha.replace(/\s*[-–—]?\s*r\$\s*[\d.,]+.*$/i, '').trim();
  // <código 1-4 dígitos> <hífen/travessão> <NOME começando por letra até o fim>
  const m = base.match(/(\d{1,4})\s*[-–—]\s*([A-Za-zÀ-ÿ][^\n]*\S)\s*$/);
  if (!m) return null;
  const nome = m[2].replace(/\s+/g, ' ').replace(/[\s.,;:–—-]+$/, '').trim();
  if (nome.length < 2) return null;
  return { codigo: m[1], nome }; // preserva zeros à esquerda
}

/**
 * Extrai um valor monetário de uma revisão SOMENTE quando há evidência monetária confiável.
 * Aceita: "R$ 2.815,00", "2.815,00", "Valor: R$ 2.815,00", "Valor: 3.124,50".
 * Rejeita: inteiro solto ("2815"/"3124"), código de banco, contrato, matrícula, benefício, telefone.
 * Sem R$, separador decimal (,dd / milhar com ponto) ou label "valor" → undefined.
 */
export function extrairValorMonetarioRevisao(texto: string): number | undefined {
  const s = (texto ?? '').toString();
  // número BRL "formatado": exige centavos (,dd) OU separador de milhar com ponto — nunca inteiro solto.
  const BRL = String.raw`\d{1,3}(?:\.\d{3})+,\d{2}|\d+,\d{2}|\d{1,3}(?:\.\d{3})+`;
  let m = s.match(new RegExp(String.raw`r\$\s*(${BRL}|\d+)`, 'i')); // 1) R$ explícito (contexto monetário)
  if (!m) m = s.match(new RegExp(String.raw`valor[^\d]{0,10}(${BRL})`, 'i')); // 2) label "valor" + número monetário
  if (!m) m = s.match(new RegExp(String.raw`(?:^|[^\d.,])(${BRL})(?![\d.,])`)); // 3) número BRL isolado (com cents/milhar)
  if (!m) return undefined;
  const v = parseMoedaBRL(m[1]);
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined;
}


// ---- REVISÕES ----------------------------------------------------------------------------------
// Duas fontes, lidas SEMPRE dentro da sua seção:
//  · Integrações/Contratos → empréstimo → "REV <BANCO>" (só bancos revisáveis: Agibank/BMG), 1x por banco;
//  · Cartões               → "Cartão RMC"/"Cartão RCC" → "REV RMC <BANCO>" / "REV RCC <BANCO>".
// Nada aqui usa ficha anterior: o que não estiver no bloco colado não vira REV.

const ehRotuloRmc = (n: string) => /\brmc\b/.test(n) || /reserva de margem consign/.test(n);
const ehRotuloRcc = (n: string) => /\brcc\b/.test(n) || /reserva de cartao( de credito)? consign/.test(n);

/** Ordem de saída da ficha: empréstimos, depois RMC, depois RCC. */
const ORDEM_REV: Record<FichaRevisaoDetectada['tipo'], number> = { emprestimo: 0, agibank: 0, rmc: 1, rcc: 2, outro: 3 };

function extrairRevisoes(
  linhas: string[], norm: string[], res: FichaJudicialParseResult,
  aviso: (c: string, m: string, campo?: string) => void,
): void {
  const out: FichaRevisaoDetectada[] = [];
  const vistos = new Set<string>();
  const add = (tipo: FichaRevisaoDetectada['tipo'], codigo: string | undefined, nome: string | undefined, valor?: number) => {
    const chave = `${tipo}|${normalizaComparacao(nome ?? '')}`;
    if (vistos.has(chave)) return; // 2 contratos do mesmo banco = 1 REV
    vistos.add(chave);
    out.push({
      tipo, bancoCodigo: codigo || undefined, bancoNome: nome || undefined,
      valor: typeof valor === 'number' && valor > 0 ? valor : undefined,
      origem: 'parser', confianca: nome ? 'alta' : 'baixa', requerConfirmacao: !nome,
    });
  };

  // banco de um trecho, já normalizado para nome curto (conhecido ou encurtado). null se não houver banco.
  const bancoDe = (s: string) => {
    const par = extrairCodBancoRev(s);
    return resolverBancoFicha(par?.codigo, par?.nome ?? s) ?? undefined;
  };

  // 1) EMPRÉSTIMOS — seção Integrações/Contratos → só bancos revisáveis (Agibank/BMG), 1x cada.
  const secEmprestimos = linhasDaSecao(linhas, norm, ['integracoes', 'integracao', 'contratos', 'emprestimos']);
  for (const l of secEmprestimos) {
    if (!l.trim()) continue;
    const b = bancoDe(l);
    if (!b?.conhecido || !BANCOS_REV_EMPRESTIMO.has(b.nomeCurto)) continue;
    add('emprestimo', b.codigo, b.nomeCurto);
  }

  // 2) REV explícita digitada/colada ("REV AGIBANK", "REV BMG") — fora de RMC/RCC. Honra o banco escolhido,
  //    qualquer que seja (intenção explícita do operador). RMC/RCC caem no bloco de cartões abaixo.
  for (let i = 0; i < linhas.length; i++) {
    const n = norm[i];
    if (!/\brev\b/.test(n) || ehRotuloRmc(n) || ehRotuloRcc(n)) continue;
    const b = bancoDe(linhas[i].replace(/\brev\b/gi, ' '));
    if (b && (b.codigo || b.nomeCurto)) add('emprestimo', b.codigo, b.nomeCurto, extrairValorMonetarioRevisao(linhas[i]));
  }

  // 3) CARTÕES — seção Cartões (ou o documento inteiro, se o bloco vier sem cabeçalho de seção).
  const secCartoes = linhasDaSecao(linhas, norm, ['cartoes', 'cartao']);
  const varrer = secCartoes.length ? secCartoes : linhas;
  const normVarrer = varrer.map(normalizaComparacao);
  for (let i = 0; i < varrer.length; i++) {
    const n = normVarrer[i];
    const tipo: FichaRevisaoDetectada['tipo'] | null = ehRotuloRmc(n) ? 'rmc' : ehRotuloRcc(n) ? 'rcc' : null;
    if (!tipo) continue;
    // banco na própria linha ("Cartão RMC — 934 - AGIPLAN") …
    const semRotulo = varrer[i].replace(/cart[ãa]o|\brev\b|\brmc\b|\brcc\b/gi, ' ');
    let banco = bancoDe(semRotulo);
    let valor = extrairValorMonetarioRevisao(semRotulo);
    // … ou nas linhas seguintes do mesmo card (layout de tabela), até o próximo rótulo de cartão
    for (let j = i + 1; j < Math.min(varrer.length, i + 8) && (!banco || valor === undefined); j++) {
      const nj = normVarrer[j];
      if (ehRotuloRmc(nj) || ehRotuloRcc(nj)) break;
      if (!banco) banco = bancoDe(varrer[j]);
      if (valor === undefined && /valor|parcela/i.test(varrer[j])) valor = extrairValorMonetarioRevisao(varrer[j]);
    }
    add(tipo, banco?.codigo, banco?.nomeCurto, valor);
  }

  out.sort((a, b) => ORDEM_REV[a.tipo] - ORDEM_REV[b.tipo]);
  res.revisoes = out;
  if (out.some((r) => !r.bancoNome)) aviso('REVISAO_SEM_BANCO', 'Há cartão RMC/RCC sem banco identificado. Informe o banco antes de gerar a ficha.');
}
