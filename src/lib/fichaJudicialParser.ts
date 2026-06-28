// Parser determinístico da ficha judicial (Promosys/iCred). Puro, sem rede/IA/Supabase/DOM.
// Estratégias em cascata por campo; nunca inventa; informa confiança e avisos; remove senha.
import {
  normalizaComparacao, somenteDigitos, cpfValido, normalizaCpf, normalizaTelefone,
  parseMoedaBRL, parseDataBR, calculaIdade, linhasLimpas, linhaAposRotulo, celulasTab, redigeCredenciais,
} from './fichaJudicialNormalizers';
import { bancoPorCodigo, bancoPorNome } from '@/data/bancosCompe';

export const PARSER_VERSION = '1.0.0';

export type CampoConfianca = 'alta' | 'media' | 'baixa';
export type CampoOrigem = 'parser' | 'calculado' | 'sugerido' | 'manual' | 'nao_encontrado';
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

function vazio(): FichaJudicialParseResult {
  return { textoSanitizado: '', revisoes: [], avisos: [], confiancaPorCampo: {}, origemPorCampo: {}, parserVersion: PARSER_VERSION };
}

export function parseFichaJudicial(texto: string): FichaJudicialParseResult {
  const res = vazio();
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
    for (let i = 0; i < norm.length; i++) {
      if (norm[i].includes('cpf') && norm[i].includes('benef')) {
        for (let j = i + 1; j < Math.min(i + 3, linhas.length); j++) {
          const cels = celulasTab(linhas[j]).filter(Boolean);
          const dig = cels.map(somenteDigitos);
          const cpfCel = dig.find((d) => d.length === 11 && cpfValido(d));
          const benCel = dig.find((d) => d.length >= 9 && d.length <= 11 && d !== cpfCel);
          if (cpfCel) { cpfDigitos = cpfCel; conf('cpf', 'alta', 'parser'); }
          if (benCel) { beneficio = benCel; conf('beneficioNumero', 'alta', 'parser'); }
          if (cpfCel || benCel) break;
        }
        if (cpfDigitos || beneficio) break;
      }
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
    if (!beneficio) {
      const rot = linhaAposRotulo(linhas, 'beneficio');
      const dig = rot ? somenteDigitos(rot) : '';
      if (dig.length >= 9 && dig.length <= 11 && dig !== cpfDigitos) { beneficio = dig; conf('beneficioNumero', 'alta', 'parser'); }
    }
    if (!beneficio) {
      const runs = (sanitizado.match(/\b\d{10}\b/g) || []).filter((d) => d !== cpfDigitos && !cpfValido(d));
      if (runs[0]) { beneficio = runs[0]; conf('beneficioNumero', 'baixa', 'parser'); }
    }
    if (beneficio) res.beneficioNumero = beneficio;
    else aviso('BENEFICIO_NAO_ENCONTRADO', 'Número do benefício não identificado.', 'beneficioNumero');

    // ---- Data da consulta (antes da idade, p/ servir de referência) ----
    for (const rot of ['data da consulta', 'consulta realizada em', 'data consulta', 'consulta em']) {
      const v = linhaAposRotulo(linhas, rot);
      const d = v ? parseDataBR(v) : undefined;
      if (d) { res.dataConsulta = d; conf('dataConsulta', 'alta', 'parser'); break; }
    }
    if (!res.dataConsulta) aviso('DATA_CONSULTA_NAO_ENCONTRADA', 'Data da consulta não encontrada. Será sugerida na revisão.', 'dataConsulta');

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
    if (res.nascimento) {
      const calc = calculaIdade(res.nascimento, res.dataConsulta);
      if (calc !== undefined) { res.idadeCalculada = calc; conf('idadeCalculada', 'alta', 'calculado'); }
      if (calc !== undefined && res.idadeInformada !== undefined && Math.abs(calc - res.idadeInformada) > 1) {
        aviso('IDADE_DIVERGENTE', 'A idade informada não corresponde à data de nascimento.', 'idadeInformada');
        conf('idadeInformada', 'baixa', 'parser');
      }
    }

    // ---- Cidade / UF ----
    {
      let achou = false;
      for (let i = 0; i < linhas.length && !achou; i++) {
        const m = linhas[i].match(/([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ .'’]+?)\s*[-/]\s*([A-Za-z]{2})\b/);
        if (!m) continue;
        const uf = m[2].toUpperCase();
        if (!UFS.has(uf)) continue;
        const cidade = m[1].replace(/\s+/g, ' ').trim();
        const nl = norm[i];
        const ehRua = /^(rua|av|avenida|r\.|travessa|rod|rodovia)\b/.test(normalizaComparacao(cidade));
        if (ehRua || cidade.length < 2) continue;
        res.cidade = cidade; res.uf = uf;
        const temLabel = nl.includes('cidade') || nl.includes('municipio') || nl.includes('endereco');
        conf('cidade', temLabel ? 'alta' : 'baixa', 'parser');
        conf('uf', temLabel ? 'alta' : 'baixa', 'parser');
        achou = true;
      }
    }

    // ---- Telefone ----
    {
      // restringe a candidatos plausíveis; normaliza p/ 10-11 dígitos; exclui cpf/benefício
      const candidatos = (sanitizado.match(/\(?\d{2}\)?[ .-]?\d{4,5}[ .-]?\d{4}/g) || [])
        .map(normalizaTelefone).filter((d) => d.length === 10 || d.length === 11)
        .filter((d) => d !== cpfDigitos && d !== beneficio && !(cpfDigitos && cpfDigitos.includes(d)) && !(beneficio && beneficio.includes(d)));
      const unicos = Array.from(new Set(candidatos));
      const principal = unicos.find((d) => d.length === 11) || unicos[0];
      if (principal) { res.telefone = principal; conf('telefone', 'media', 'parser'); }
      if (unicos.length > 1) aviso('TELEFONES_CONCORRENTES', 'Há mais de um telefone no texto; revise o principal.', 'telefone');
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
      else aviso('VALOR_BENEFICIO_NAO_ENCONTRADO', 'Valor do benefício não identificado.', 'valorBeneficio');
    }

    // ---- Revisões ----
    extrairRevisoes(linhas, res, aviso);

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
  const aplicar = (codigo: string | undefined, nome: string | undefined, c: CampoConfianca) => {
    if (codigo) { res.bancoCodigo = codigo; conf('bancoCodigo', c, 'parser'); }
    if (nome) { res.bancoNome = nome; conf('bancoNome', c, 'parser'); }
  };
  const ehRevisao = (n: string) => /\brev\b|\brmc\b|\brcc\b/.test(n);
  // 1) "código - nome" com código no COMPE (ignora linhas de revisão p/ não confundir pagador)
  for (let i = 0; i < linhas.length; i++) {
    if (ehRevisao(norm[i])) continue;
    const mm = linhas[i].match(/\b(\d{3})\s*[-–]\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ /.&]+)/);
    if (mm) { const b = bancoPorCodigo(mm[1]); if (b) { aplicar(b.codigo, b.nome, 'alta'); return; } }
  }
  // 2) linha de banco: código (COMPE) + nome em contexto de pagamento
  for (let i = 0; i < linhas.length; i++) {
    if (ehRevisao(norm[i])) continue;
    if (!/banco|recebe|pagamento|meio de pagamento/.test(norm[i])) continue;
    const cods = (linhas[i].match(/\b\d{3}\b/g) || []).filter((c) => c !== cpfDigitos?.slice(0, 3));
    const compe = cods.map(bancoPorCodigo).find(Boolean);
    if (compe) { aplicar(compe.codigo, compe.nome, 'alta'); return; }
    const porNome = bancoPorNome(linhas[i]);
    if (porNome) { aplicar(porNome.codigo, porNome.nome, 'media'); return; }
  }
  // 3) célula tabulada na coluna "Banco"
  for (let i = 0; i < linhas.length; i++) {
    if (!norm[i].includes('banco')) continue;
    const prox = linhas[i + 1];
    if (!prox) continue;
    const cels = celulasTab(prox).filter(Boolean);
    for (const cel of cels) {
      const cod = cel.match(/\b(\d{3})\b/)?.[1];
      const b = cod ? bancoPorCodigo(cod) : bancoPorNome(cel);
      if (b) { aplicar(b.codigo, b.nome, 'media'); return; }
    }
  }
  aviso('BANCO_NAO_ENCONTRADO', 'Nenhum banco pagador foi identificado.', 'bancoCodigo');
}

function extrairRevisoes(linhas: string[], res: FichaJudicialParseResult, aviso: (c: string, m: string, campo?: string) => void): void {
  const out: FichaRevisaoDetectada[] = [];
  const vistos = new Set<string>();
  for (const linha of linhas) {
    const n = normalizaComparacao(linha);
    const temRev = /\brev\b/.test(n);
    const temRmc = /\brmc\b/.test(n);
    const temRcc = /\brcc\b/.test(n);
    const temCartao = /cartao|cartão/.test(n) && /(contrato|consignad)/.test(n);
    if (!temRev && !temRmc && !temRcc && !temCartao) continue;

    let tipo: FichaRevisaoDetectada['tipo'] = 'outro';
    if (temRmc) tipo = 'rmc';
    else if (temRcc) tipo = 'rcc';
    else if (/agibank/.test(n)) tipo = 'agibank';
    else if (temCartao) tipo = 'outro';
    else if (temRev) tipo = 'outro';

    const codigo = (linha.match(/\b(\d{3})\b/g) || []).map(bancoPorCodigo).find(Boolean);
    const banco = codigo || bancoPorNome(linha);
    const mv = linha.match(/r\$\s*([\d.]+(?:,\d{2})?)/i); // valor só em contexto R$ (evita capturar código)
    const valor = mv ? parseMoedaBRL(mv[1]) : undefined;
    const temBanco = !!banco;
    const temValor = valor !== undefined && valor > 0;
    // confiança: rótulo explícito (REV/RMC/RCC) + banco ou valor → alta; senão baixa
    const explicito = temRev || temRmc || temRcc;
    const confianca: CampoConfianca = explicito && (temBanco || temValor) ? 'alta' : explicito ? 'media' : 'baixa';
    const requerConfirmacao = confianca !== 'alta';

    const rev: FichaRevisaoDetectada = {
      tipo,
      bancoCodigo: banco?.codigo,
      bancoNome: banco?.nome,
      valor: temValor ? valor : undefined,
      descricaoLivre: linha.replace(/\s+/g, ' ').trim(),
      origem: 'parser',
      confianca,
      requerConfirmacao,
    };
    const chave = `${rev.tipo}|${rev.bancoCodigo ?? rev.bancoNome ?? ''}|${rev.valor ?? ''}|${normalizaComparacao(rev.descricaoLivre ?? '')}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    out.push(rev);
  }
  res.revisoes = out;
  if (out.some((r) => r.requerConfirmacao)) aviso('REVISAO_REQUER_CONFIRMACAO', 'Há revisões que precisam de confirmação manual.');
  if (out.length === 0) aviso('REVISAO_REQUER_CONFIRMACAO', 'Nenhuma revisão foi identificada. Adicione manualmente, se necessário.');
}
