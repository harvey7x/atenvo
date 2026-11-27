/* =========================================================================
   ALFA ANÁLISE — motor (versão navegador)
   Tradução fiel de inss/bancos.py, inss/extrator.py e inss/analise.py.
   Dinheiro é representado em CENTAVOS (inteiro); percentuais de margem em
   DÉCIMOS de ponto percentual (inteiro), para reproduzir o Decimal do Python
   sem erro de vírgula flutuante.
   ========================================================================= */
/* Porte ESM para a Reviza (aba Análise INSS): SÓ o invólucro mudou — saiu o
   IIFE/raiz/module.exports, entrou `const AlfaMotor = {...}; export default`.
   A lógica abaixo é byte a byte a do motor.js original (prova: motor.test.ts). */

  const VERSAO = '1.0.0-web';

  /* ======================================================================
     bancos.py
     ====================================================================== */
  const NIVEL_ALTO = 'alto';
  const NIVEL_MEDIO = 'medio';

  const BANCOS_RISCO_POR_CODIGO = {
    '318': ['Banco BMG', NIVEL_ALTO,
            'Citado com frequência em fraudes de consignado e cartão RMC contra aposentados.'],
    '389': ['Banco Mercantil do Brasil', NIVEL_ALTO,
            'Alvo recorrente de reclamações por portabilidade de benefício não autorizada.'],
    '756': ['Sicoob (Bancoob)', NIVEL_ALTO,
            'Cooperativas usadas como conta de destino em portabilidades não reconhecidas.'],
    '121': ['Banco Agibank', NIVEL_ALTO,
            'Alvo de ações do MP e do Procon por troca de conta e consignado não autorizado.'],
    '623': ['Banco Pan', NIVEL_MEDIO,
            'Frequentemente citado em reclamações de consignado não reconhecido.'],
    '336': ['Banco C6', NIVEL_MEDIO,
            'Casos de cartão consignado (RMC/RCC) sem autorização do titular.'],
    '149': ['Facta Financeira', NIVEL_MEDIO,
            'Financeira especializada em consignado, com muitas reclamações de contratação indevida.'],
    '069': ['Crefisa', NIVEL_MEDIO,
            'Histórico de reclamações por empréstimo consignado não reconhecido.'],
    '169': ['Banco Olé Consignado / Bonsucesso', NIVEL_MEDIO,
            'Especializada em consignado do INSS, com reclamações de contratação indevida.'],
    '422': ['Banco Safra', NIVEL_MEDIO,
            'Citado quando associado a contratos de consignado não reconhecidos.'],
    '748': ['Sicredi', NIVEL_MEDIO,
            'Cooperativa: atenção se a praça da agência não tem relação com onde o titular mora.'],
    '136': ['Unicred', NIVEL_MEDIO,
            'Cooperativa: atenção se a praça da agência não tem relação com onde o titular mora.'],
    '133': ['Cresol', NIVEL_MEDIO,
            'Cooperativa: atenção se a praça da agência não tem relação com onde o titular mora.'],
    '097': ['Credisis', NIVEL_MEDIO,
            'Cooperativa: atenção se a praça da agência não tem relação com onde o titular mora.'],
  };

  const BANCOS_RISCO_POR_NOME = [
    ['\\bBMG\\b', 'Banco BMG', NIVEL_ALTO,
     'Citado com frequência em fraudes de consignado e cartão RMC contra aposentados.'],
    ['MERCANTIL', 'Banco Mercantil do Brasil', NIVEL_ALTO,
     'Alvo recorrente de reclamações por portabilidade de benefício não autorizada.'],
    ['SICOOB|BANCOOB|COOPERATIVA DE CREDITO', 'Sicoob / cooperativa de crédito', NIVEL_ALTO,
     'Cooperativas usadas como conta de destino em portabilidades não reconhecidas.'],
    ['AGIBANK|AGIPLAN', 'Banco Agibank', NIVEL_ALTO,
     'Alvo de ações do MP e do Procon por troca de conta e consignado não autorizado.'],
    ['\\bPAN\\b|PANAMERICANO', 'Banco Pan', NIVEL_MEDIO,
     'Frequentemente citado em reclamações de consignado não reconhecido.'],
    ['\\bC6\\b', 'Banco C6', NIVEL_MEDIO,
     'Casos de cartão consignado (RMC/RCC) sem autorização do titular.'],
    ['FACTA', 'Facta Financeira', NIVEL_MEDIO,
     'Financeira especializada em consignado, com muitas reclamações de contratação indevida.'],
    ['CREFISA', 'Crefisa', NIVEL_MEDIO,
     'Histórico de reclamações por empréstimo consignado não reconhecido.'],
    ['\\bOLE\\b|BONSUCESSO', 'Banco Olé Consignado / Bonsucesso', NIVEL_MEDIO,
     'Especializada em consignado do INSS, com reclamações de contratação indevida.'],
    ['SAFRA', 'Banco Safra', NIVEL_MEDIO,
     'Citado quando associado a contratos de consignado não reconhecidos.'],
    ['SICREDI', 'Sicredi', NIVEL_MEDIO,
     'Cooperativa: atenção se a praça da agência não tem relação com onde o titular mora.'],
    ['UNICRED', 'Unicred', NIVEL_MEDIO,
     'Cooperativa: atenção se a praça da agência não tem relação com onde o titular mora.'],
    ['CRESOL', 'Cresol', NIVEL_MEDIO,
     'Cooperativa: atenção se a praça da agência não tem relação com onde o titular mora.'],
    ['CREDISIS|CENTRALCREDI', 'Credisis', NIVEL_MEDIO,
     'Cooperativa: atenção se a praça da agência não tem relação com onde o titular mora.'],
  ];

  const NOMES_BANCOS = {
    '001': 'Banco do Brasil', '003': 'Banco da Amazônia', '004': 'Banco do Nordeste',
    '021': 'Banestes', '033': 'Santander', '037': 'Banpará', '041': 'Banrisul',
    '047': 'Banco do Estado de Sergipe', '069': 'Crefisa', '070': 'BRB',
    '077': 'Banco Inter', '085': 'Ailos', '097': 'Credisis',
    '104': 'Caixa Econômica Federal', '121': 'Banco Agibank', '133': 'Cresol',
    '136': 'Unicred', '149': 'Facta Financeira', '169': 'Banco Olé Consignado',
    '197': 'Stone', '208': 'BTG Pactual', '212': 'Banco Original', '218': 'Banco BS2',
    '237': 'Bradesco', '260': 'Nu Pagamentos (Nubank)', '290': 'PagBank',
    '318': 'Banco BMG', '323': 'Mercado Pago', '336': 'Banco C6',
    '341': 'Itaú Unibanco', '389': 'Banco Mercantil do Brasil',
    '394': 'Bradesco Financiamentos', '422': 'Banco Safra', '604': 'Banco Industrial',
    '623': 'Banco Pan', '633': 'Banco Rendimento', '637': 'Banco Sofisa',
    '643': 'Banco Pine', '654': 'Banco Digimais', '655': 'Banco Votorantim / BV',
    '707': 'Banco Daycoval', '735': 'Banco Neon', '739': 'Banco Cetelem',
    '743': 'Banco Semear', '745': 'Citibank', '746': 'Banco Modal', '748': 'Sicredi',
    '756': 'Sicoob (Bancoob)',
  };

  function semAcento(texto) {
    if (!texto) return '';
    return String(texto).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  }

  function normalizarCodigo(codigo) {
    if (!codigo) return '';
    const digitos = String(codigo).replace(/\D/g, '');
    if (!digitos) return '';
    return digitos.length <= 3 ? digitos.padStart(3, '0') : digitos;
  }

  function nomeProvavel(codigo, nomeNoPdf) {
    if (nomeNoPdf && String(nomeNoPdf).trim()) return String(nomeNoPdf).trim();
    return NOMES_BANCOS[normalizarCodigo(codigo)] || '';
  }

  function avaliarRisco(codigo, nome) {
    const codigoNorm = normalizarCodigo(codigo);
    const nomeLimpo = semAcento(nome || '');
    const entrada = BANCOS_RISCO_POR_CODIGO[codigoNorm];
    if (entrada) {
      return { risco: true, nivel: entrada[1], rotulo: entrada[0], motivo: entrada[2] };
    }
    for (const [padrao, rotulo, nivel, motivo] of BANCOS_RISCO_POR_NOME) {
      if (new RegExp(padrao).test(nomeLimpo)) {
        return { risco: true, nivel, rotulo, motivo };
      }
    }
    return { risco: false, nivel: null, rotulo: '', motivo: '' };
  }

  function ehCooperativa(nome) {
    return /SICOOB|SICREDI|UNICRED|CRESOL|COOPERATIVA|CREDISIS|AILOS/.test(semAcento(nome || ''));
  }

  function bancoCitadoNaPraca(praca, bancoNome) {
    const pracaLimpa = semAcento(praca || '');
    if (!pracaLimpa) return '';
    const nomeLimpo = semAcento(bancoNome || '');
    for (const [padrao, rotulo] of BANCOS_RISCO_POR_NOME) {
      const re = new RegExp(padrao);
      if (!re.test(pracaLimpa)) continue;
      if (re.test(nomeLimpo)) continue;
      return rotulo;
    }
    return '';
  }

  /* ======================================================================
     extrator.py — categorias e tabelas de rubrica
     ====================================================================== */
  const CATEGORIA_CONSIGNADO = 'consignado';
  const CATEGORIA_ASSOCIATIVA = 'associativa';
  const CATEGORIA_CREDITO = 'credito';
  const CATEGORIA_DESCONTO = 'desconto';
  const CATEGORIA_OUTRA = 'outra';

  const RUBRICAS_CONSIGNADO = {
    '216': 'Consignação - empréstimo bancário',
    '217': 'Empréstimo sobre a RMC (cartão consignado)',
    '268': 'Consignação - cartão de crédito consignado',
    '273': 'Consignação - cartão benefício (RCC)',
  };
  const RUBRICAS_ASSOCIATIVAS = {
    '246': 'Contribuição a associação/sindicato',
    '247': 'Contribuição associativa (ex.: SINAB)',
    '256': 'Contribuição associativa (ex.: AAPB)',
    '248': 'Mensalidade associativa',
  };
  const RUBRICAS_CREDITO = {
    '101': 'Valor total de MR do período (bruto de referência)',
    '104': 'Valor do décimo-terceiro salário',
    '107': 'Complemento positivo',
    '110': 'Correção monetária',
    '137': 'Adiantamento por arredondamento do crédito',
    '159': 'Correção monetária complementar de renda',
  };
  const RUBRICAS_DESCONTO = {
    '215': 'Ajuste do arredondamento de créditos (estorno)',
    '218': '13º salário já pago em competências anteriores (dedução)',
    '902': 'Pensão alimentícia',
    '921': 'Imposto de renda retido na fonte',
  };
  const RUBRICA_MR = '101';

  const PADRAO_DESC_CONSIGNADO =
    /CONSIGNA|EMPRESTIMO|\bRMC\b|\bRCC\b|CARTAO DE CREDITO|CARTAO CONSIGNADO|CARTAO BENEFICIO/;
  const PADRAO_DESC_ASSOCIATIVA =
    /ASSOCIA|SINDIC|RIAAM|MENSALIDADE|CONTRIBUICAO(?!\s+PREVID)|CLUBE|FEDERACAO|CONFEDERACAO/;
  const PADRAO_DESC_CREDITO =
    /^VALOR |DECIMO|CORRECAO MONETARIA|COMPLEMENTO|ADIANTAMENTO|ABONO|RESIDUO/;

  const MEIOS_PAGAMENTO = {
    CCF: 'Conta corrente', CTC: 'Conta corrente',
    CPG: 'Conta poupança', CPP: 'Conta poupança', POU: 'Conta poupança',
    CMG: 'Cartão magnético', CTM: 'Cartão magnético', MAG: 'Cartão magnético',
    OPB: 'Ordem de pagamento bancária',
  };
  const MEIOS_CARTAO = new Set(['CMG', 'CTM', 'MAG']);

  const PADRAO_STATUS = 'Pago|N[ãa]o Pago|Devolvido|Cancelado|Bloqueado|Suspenso|'
                      + 'Em Processamento|Estornado';

  /* ----------------------------------------------------------------------
     Leitura do PDF no navegador (pdf.js) — equivalente ao pdfplumber
     ---------------------------------------------------------------------- */
  async function extrairTextoPdf(pdfjsLib, dados) {
    const doc = await pdfjsLib.getDocument({ data: dados }).promise;
    const paginas = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const pagina = await doc.getPage(p);
      const conteudo = await pagina.getTextContent();
      paginas.push(reconstruirLinhas(conteudo.items));
    }
    try { doc.destroy(); } catch (e) { /* melhor esforço */ }
    return limpar(paginas.join('\n'));
  }

  // Texto de cada página em separado, com a MESMA reconstrução de linhas de
  // extrairTextoPdf — a tela de unificação usa isto para etiquetar cada página
  // com as competências que aparecem nela.
  async function extrairTextoPorPagina(pdfjsLib, dados) {
    const doc = await pdfjsLib.getDocument({ data: dados }).promise;
    const paginas = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const pagina = await doc.getPage(p);
      const conteudo = await pagina.getTextContent();
      paginas.push(limpar(reconstruirLinhas(conteudo.items)));
    }
    try { doc.destroy(); } catch (e) { /* melhor esforço */ }
    return paginas;
  }

  // Competências (MM/AAAA no início da linha) presentes no texto de uma página.
  const RE_COMPETENCIA_NA_LINHA = /^[ \t]*(\d{2})\/(\d{4})\b/;

  function competenciasDaPagina(textoPagina) {
    const achadas = [];
    for (const linha of String(textoPagina == null ? '' : textoPagina).split('\n')) {
      const m = linha.match(RE_COMPETENCIA_NA_LINHA);
      if (!m) continue;
      const mes = parseInt(m[1], 10);
      if (mes < 1 || mes > 12) continue;
      const rotulo = `${m[1]}/${m[2]}`;
      if (!achadas.includes(rotulo)) achadas.push(rotulo);
    }
    return achadas;
  }

  function reconstruirLinhas(itens) {
    // Agrupa os pedaços de texto por altura (y) e ordena por posição (x),
    // reproduzindo a leitura "com layout" do pdfplumber.
    const TOLERANCIA_Y = 2.5;
    const linhas = [];
    for (const item of itens) {
      if (!item || typeof item.str !== 'string' || item.str === '') continue;
      const x = item.transform[4];
      const y = item.transform[5];
      let alvo = null;
      for (const l of linhas) {
        if (Math.abs(l.y - y) <= TOLERANCIA_Y) { alvo = l; break; }
      }
      if (!alvo) { alvo = { y, itens: [] }; linhas.push(alvo); }
      alvo.itens.push({ x, w: item.width || 0, str: item.str });
    }
    linhas.sort((a, b) => b.y - a.y);
    const saida = [];
    for (const l of linhas) {
      l.itens.sort((a, b) => a.x - b.x);
      let s = '';
      let fimX = null;
      for (const it of l.itens) {
        if (fimX !== null && it.x - fimX > 1.0) s += ' ';
        s += it.str;
        fimX = it.x + it.w;
      }
      saida.push(s);
    }
    return saida.join('\n');
  }

  function limpar(texto) {
    return texto
      .replace(/\r\n/g, '\n').replace(/\r/g, '\n')
      .replace(/\u00a0/g, ' ').replace(/–/g, '-').replace(/—/g, '-')
      .replace(/[ \t]{2,}/g, '  ');
  }

  /* ----------------------------------------------------------------------
     Ruído de cabeçalho/rodapé
     ---------------------------------------------------------------------- */
  const RUIDO = [
    /^P[áa]gina\s+\d+\s*de\s*\d+$/i,
    /^INSS\s*-\s*INSTITUTO NACIONAL.*$/i,
    /^Hist[óo]rico de Cr[ée]ditos$/i,
    /^Identifica[çc][ãa]o do Filiado$/i,
    /^Cr[ée]ditos do Benef[íi]cio$/i,
    /^\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2}$/i,
    /^NIT:.*$/i,
    /^Nome(\s+da\s+m[ãa]e)?\s*:.*$/i,
    /^Compet\.\s*Inicial:.*$/i,
    /^NB\s*:.*$/i,
    /^Esp[ée]cie\s*:.*$/i,
    /^APS\s*:.*$/i,
    /^Data de In[íi]cio do (Benef[íi]cio|Pagamento).*$/i,
    /^Valor\s+Previs[ãa]o do Data do Cr[ée]dito$/i,
    /^Compet[êe]ncia\s+Per[íi]odo\s+Meio de Pagamento.*$/i,
    /^L[íi]quido\s+Pagamento Pagamento Invalidado$/i,
    /^Rubrica\s+Descri[çc][ãa]o Rubrica\s+Valor$/i,
    /^Consulte o .Extrato de Empr[ée]stimo Consignado.*$/i,
    /^O INSS poder[áa] rever.*$/i,
    /^a$/i,
    /^\d{2}\/\d{2}\/\d{4}$/i,
    /^ALEGRE$/i,
    /^$/i,
  ];

  function removerRuido(texto) {
    const mantidas = [];
    for (const linha of texto.split('\n')) {
      const nua = linha.trim();
      if (RUIDO.some((p) => p.test(nua))) continue;
      mantidas.push(linha);
    }
    return mantidas.join('\n');
  }

  /* ----------------------------------------------------------------------
     Dinheiro em centavos — equivalente ao para_decimal
     ---------------------------------------------------------------------- */
  function paraCentavos(bruto) {
    if (bruto === null || bruto === undefined) return null;
    const texto = String(bruto);
    const negativo = texto.includes('-');
    const m = texto.match(/\d[\d.\s]*,\d{2}|\d+\.\d{2}(?!\d)|\d+/);
    if (!m) return null;
    const limpo = m[0].replace(/ /g, '');
    let centavos = null;
    if (limpo.includes(',')) {
      const semMilhar = limpo.replace(/\./g, '');
      const partes = semMilhar.split(',');
      if (partes.length !== 2 || !/^\d+$/.test(partes[0]) || !/^\d{2}$/.test(partes[1])) return null;
      centavos = parseInt(partes[0], 10) * 100 + parseInt(partes[1], 10);
    } else if (limpo.includes('.')) {
      const partes = limpo.split('.');
      if (partes.length !== 2 || !/^\d+$/.test(partes[0]) || !/^\d{2}$/.test(partes[1])) return null;
      centavos = parseInt(partes[0], 10) * 100 + parseInt(partes[1], 10);
    } else {
      if (!/^\d+$/.test(limpo)) return null;
      centavos = parseInt(limpo, 10) * 100;
    }
    if (!Number.isFinite(centavos)) return null;
    return negativo ? -centavos : centavos;
  }

  /* ----------------------------------------------------------------------
     Cabeçalho do extrato
     ---------------------------------------------------------------------- */
  function textoCurto(valor) {
    const colapsado = String(valor == null ? '' : valor).trim().replace(/\s{2,}/g, ' ');
    return colapsado.replace(/^[ \-:]+/, '').replace(/[ \-:]+$/, '');
  }

  function extrairCabecalho(texto) {
    const cabecalho = { nome: '', cpf: '', nit: '', beneficio: '', especie: '',
                        dib: '', aps: '' };

    let m = texto.match(/^\s*Nome\s*:\s*([^\n]{4,80})/m);
    if (!m) m = texto.match(/(?:Benefici[áa]rio|Titular)\s*:?\s*([^\n]{4,80})/);
    if (m) cabecalho.nome = textoCurto(m[1]);

    m = texto.match(/CPF\s*:?\s*(\d{3}\.?\d{3}\.?\d{3}-?\d{2})/);
    if (m) cabecalho.cpf = m[1];

    m = texto.match(/NIT\s*:?\s*([\d.\-]{10,20})/);
    if (m) cabecalho.nit = m[1].trim();

    m = texto.match(/\bNB\s*:?\s*([\d][\d.\/-]{6,18})/);
    if (!m) m = texto.match(/(?:N[ÚU]MERO DO BENEF[ÍI]CIO|Benef[íi]cio)\s*:?\s*(\d{2}[\d.\/-]{6,16})/i);
    if (m) cabecalho.beneficio = m[1].trim();

    m = texto.match(/Esp[ée]cie\s*:?\s*([^\n]{3,70})/i);
    if (m) cabecalho.especie = textoCurto(m[1]);

    m = texto.match(/\(DIB\)\s*:?\s*(\d{2}\/\d{2}\/\d{4})/);
    if (m) cabecalho.dib = m[1];

    m = texto.match(/^\s*APS\s*:\s*([^\n]{3,90})/m);
    if (m) cabecalho.aps = textoCurto(m[1]);

    return cabecalho;
  }

  /* ----------------------------------------------------------------------
     Estratégia 1 — formato oficial do Meu INSS
     ---------------------------------------------------------------------- */
  const RE_LINHA_PAGAMENTO =
    /^[ \t]*(\d{2})\/(\d{4})[ \t]+(\d{2}\/\d{2}\/\d{4}[ \t]+R\$[ \t]*[\d.]*\d,\d{2}.*)$/;
  const RE_BANCO_OFICIAL = new RegExp(
    'Banco\\s*:\\s*(\\d{1,5})\\s*-\\s*(.+?)'
    + '(?:\\s+OP\\s*:\\s*(\\d+)\\s*-\\s*(.+?))?'
    + '(?:\\s+Ocorr[êe]ncia\\s*:\\s*(.+?))?\\s*$', 'm');
  const RE_RUBRICA_OFICIAL =
    /^[ \t]*(\d{3})[ \t]+(\S.{2,70}?)[ \t]+R\$[ \t]*(-?[\d.]*\d,\d{2})[ \t]*$/gm;

  function extrairFormatoOficial(texto, arquivo) {
    const linhas = texto.split('\n');
    const marcas = [];
    for (let i = 0; i < linhas.length; i++) {
      const m = linhas[i].match(RE_LINHA_PAGAMENTO);
      if (m) marcas.push([i, m]);
    }
    if (!marcas.length) return [];

    const registros = [];
    for (let k = 0; k < marcas.length; k++) {
      const [i, m] = marcas[k];
      const fim = k + 1 < marcas.length ? marcas[k + 1][0] : linhas.length;
      const bloco = linhas.slice(i, fim).join('\n');
      registros.push(parsearRegistroOficial(m, bloco, arquivo));
    }
    return registros;
  }

  function parsearRegistroOficial(marca, bloco, arquivo) {
    const registro = registroVazio(marca[1], marca[2], arquivo);
    registro.texto_bruto = bloco.trim();

    const linha = marca[0];
    const datas = linha.match(/\d{2}\/\d{2}\/\d{4}/g) || [];
    registro.periodo_inicio = datas.length ? datas[0] : '';
    if (datas.length >= 3) {
      registro.previsao_pagamento = datas[1];
      registro.data_pagamento = datas[2];
    } else if (datas.length === 2) {
      registro.previsao_pagamento = datas[1];
      registro.data_pagamento = '';
    }

    const mValor = linha.match(/R\$[ \t]*([\d.]*\d,\d{2})/);
    if (mValor) {
      registro.valor_liquido = paraCentavos(mValor[1]);
      const cauda = linha.slice(mValor.index + mValor[0].length);

      const mMeio = cauda.match(new RegExp(
        '^\\s*([A-Z]{2,4})\\s*-\\s*(.+?)(?=\\s+(?:' + PADRAO_STATUS + '|\\d{2}/\\d{2}/\\d{4}))'));
      if (mMeio) registro.meio_pagamento_bruto = textoCurto(mMeio[0]);

      const mStatus = cauda.match(new RegExp('\\b(' + PADRAO_STATUS + ')\\b'));
      if (mStatus) {
        registro.status = mStatus[1];
      } else if (!registro.data_pagamento) {
        registro.status = 'Aguardando pagamento';
      }
    }

    const mBanco = bloco.match(RE_BANCO_OFICIAL);
    if (mBanco) {
      registro.banco_codigo = normalizarCodigo(mBanco[1]);
      registro.banco_nome = textoCurto(mBanco[2]);
      registro.op_codigo = (mBanco[3] || '').trim();
      registro.op_nome = textoCurto(mBanco[4] || '');
      registro.ocorrencia = textoCurto(mBanco[5] || '');
    }

    registro.rubricas = [];
    for (const m of bloco.matchAll(RE_RUBRICA_OFICIAL)) {
      registro.rubricas.push(montarRubrica(m[1], textoCurto(m[2]), paraCentavos(m[3])));
    }

    consolidar(registro);
    return registro;
  }

  function montarRubrica(codigo, descricao, valor) {
    return { codigo, descricao, valor, categoria: classificarRubrica(codigo, descricao) };
  }

  /* ----------------------------------------------------------------------
     Estratégia 2 — blocos rotulados ("Competência: 01/2021")
     ---------------------------------------------------------------------- */
  const RE_INICIO_COMPETENCIA = /Compet[êe]ncia\s*:\s*(\d{2})\s*\/\s*(\d{4})/gi;
  const RE_RUBRICA_ROTULADA =
    /^\s*(\d{3})\s*[-=:]\s*(.{4,70}?)\s+(-?\s*R?\$?\s*[\d.]*\d,\d{2})\s*$/gm;

  function extrairPorBlocos(texto, arquivo) {
    const marcas = [...texto.matchAll(RE_INICIO_COMPETENCIA)];
    if (!marcas.length) return [];

    const registros = [];
    for (let i = 0; i < marcas.length; i++) {
      const inicio = marcas[i].index;
      const fim = i + 1 < marcas.length ? marcas[i + 1].index : texto.length;
      registros.push(parsearBloco(texto.slice(inicio, fim), marcas[i][1], marcas[i][2], arquivo));
    }
    return registros;
  }

  function parsearBloco(bloco, mes, ano, arquivo) {
    const registro = registroVazio(mes, ano, arquivo);
    registro.texto_bruto = bloco.trim();

    let m = bloco.match(/Valor\s+L[íi]quido\s*:?\s*(R?\$?\s*[\d.]*\d,\d{2})/i);
    if (!m) m = bloco.match(/(?:Valor|Cr[ée]dito)\s*:?\s*(R?\$?\s*[\d.]*\d,\d{2})/i);
    registro.valor_liquido = m ? paraCentavos(m[1]) : null;

    m = bloco.match(/Meio\s+de\s+Pagamento\s*:?\s*([^\n]{1,60})/i);
    if (m) registro.meio_pagamento_bruto = textoCurto(m[1]);

    m = bloco.match(/Data\s+d[oe]\s+(?:Pagamento|Cr[ée]dito)\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i);
    if (!m) m = bloco.match(/\b(\d{2}\/\d{2}\/\d{4})\b/);
    registro.data_pagamento = m ? m[1] : '';

    m = bloco.match(/\bStatus\s*:?\s*([^\n]{0,40})/i);
    if (m) registro.status = textoCurto(m[1]);

    m = bloco.match(/Ocorr[êe]ncia\s*:?\s*([^\n]{0,80})/i);
    if (m) registro.ocorrencia = textoCurto(m[1]);

    parsearBancoRotulado(bloco, registro);
    registro.rubricas = [];
    for (const mr of bloco.matchAll(RE_RUBRICA_ROTULADA)) {
      registro.rubricas.push(montarRubrica(mr[1], textoCurto(mr[2]), paraCentavos(mr[3])));
    }
    consolidar(registro);
    return registro;
  }

  function parsearBancoRotulado(bloco, registro) {
    const m = bloco.match(/\bBanco(?:\s+Pagador)?\s*:?\s*(\d{1,5}\b[^\n]*)/i);
    if (!m) return;

    const linha = m[1].split(/\s+Ocorr[êe]ncia\s*:/)[0];
    const sep = /\b(?:OP|Ag[êe]ncia|AG)\s*:?\s*/i.exec(linha);
    const partes = sep
      ? [linha.slice(0, sep.index), linha.slice(sep.index + sep[0].length)]
      : [linha];

    const cabeca = partes[0].match(/^\s*(\d{1,5})\s*[-:]?\s*(.*)/);
    if (cabeca) {
      registro.banco_codigo = normalizarCodigo(cabeca[1]);
      registro.banco_nome = textoCurto(cabeca[2]);
    }

    if (partes.length > 1) {
      const cauda = partes[1].match(/^\s*(\d{1,6})\s*[-:]?\s*(.*)/);
      if (cauda) {
        registro.op_codigo = cauda[1].trim();
        registro.op_nome = textoCurto(cauda[2]);
      } else {
        registro.op_nome = textoCurto(partes[1]);
      }
    }
  }

  /* ----------------------------------------------------------------------
     Estratégia 3 — uma linha por competência
     ---------------------------------------------------------------------- */
  const RE_LINHA_COMPETENCIA = new RegExp(
    '(\\d{2}\\/\\d{4}).{0,80}?'
    + '(\\d{2}\\/\\d{2}\\/\\d{4}).{0,40}?'
    + '(\\d{3})\\s*[-:]\\s*([A-ZÁÉÍÓÚÂÊÔÃÕÇ][^\\n]{2,50}?)\\s+'
    + '([\\d.]*\\d,\\d{2})');

  function extrairPorLinhas(texto, arquivo) {
    const registros = [];
    for (const linha of texto.split('\n')) {
      const m = linha.match(RE_LINHA_COMPETENCIA);
      if (!m) continue;
      const [mes, ano] = m[1].split('/');
      const registro = registroVazio(mes, ano, arquivo);
      registro.data_pagamento = m[2];
      registro.banco_codigo = normalizarCodigo(m[3]);
      registro.banco_nome = textoCurto(m[4]);
      registro.valor_liquido = paraCentavos(m[5]);
      registro.texto_bruto = linha.trim();
      consolidar(registro);
      registros.push(registro);
    }
    return registros;
  }

  /* ----------------------------------------------------------------------
     Orquestração por benefício
     ---------------------------------------------------------------------- */
  const RE_SECAO_BENEFICIO = /Cr[ée]ditos\s+do\s+Benef[íi]cio/gi;

  function dividirPorBeneficio(texto) {
    const marcas = [...texto.matchAll(RE_SECAO_BENEFICIO)];
    if (!marcas.length) return [[dadosBeneficio(texto), texto]];

    const secoes = [];
    for (let i = 0; i < marcas.length; i++) {
      const fim = i + 1 < marcas.length ? marcas[i + 1].index : texto.length;
      const trecho = texto.slice(marcas[i].index, fim);
      secoes.push([dadosBeneficio(trecho), trecho]);
    }
    return secoes;
  }

  function dadosBeneficio(trecho) {
    const dados = { nb: '', especie: '', especie_codigo: '', dib: '', aps: '' };

    let m = trecho.match(/\bNB\s*:?\s*([\d][\d.\/-]{6,18})/);
    if (m) dados.nb = m[1].trim();

    m = trecho.match(/Esp[ée]cie\s*:?\s*([^\n]{3,70})/i);
    if (m) {
      const especie = textoCurto(m[1]);
      dados.especie = especie;
      const codigo = especie.match(/^(\d{1,3})/);
      if (codigo) dados.especie_codigo = codigo[1].padStart(2, '0');
    }

    m = trecho.match(/\(DIB\)\s*:?\s*(\d{2}\/\d{2}\/\d{4})/);
    if (m) dados.dib = m[1];

    m = trecho.match(/^\s*APS\s*:\s*([^\n]{3,90})/m);
    if (m) dados.aps = textoCurto(m[1]);

    return dados;
  }

  function extrairCompetencias(texto, arquivo) {
    const registros = [];
    for (const [dados, trecho] of dividirPorBeneficio(texto)) {
      const limpo = removerRuido(trecho);
      const estrategias = [
        ['formato_oficial', extrairFormatoOficial],
        ['por_blocos', extrairPorBlocos],
        ['por_linhas', extrairPorLinhas],
      ];
      for (const [nome, estrategia] of estrategias) {
        const achados = estrategia(limpo, arquivo);
        if (!achados.length) continue;
        for (const registro of achados) {
          registro.formato = nome;
          Object.assign(registro, dados);
        }
        registros.push(...achados);
        break;
      }
    }
    return registros;
  }

  function classificarRubrica(codigo, descricao) {
    codigo = String(codigo).trim();
    if (codigo in RUBRICAS_CONSIGNADO) return CATEGORIA_CONSIGNADO;
    if (codigo in RUBRICAS_ASSOCIATIVAS) return CATEGORIA_ASSOCIATIVA;
    if (codigo in RUBRICAS_CREDITO) return CATEGORIA_CREDITO;
    if (codigo in RUBRICAS_DESCONTO) return CATEGORIA_DESCONTO;

    const desc = semAcento(descricao || '');
    if (PADRAO_DESC_CONSIGNADO.test(desc)) return CATEGORIA_CONSIGNADO;
    if (PADRAO_DESC_ASSOCIATIVA.test(desc)) return CATEGORIA_ASSOCIATIVA;
    if (PADRAO_DESC_CREDITO.test(desc)) return CATEGORIA_CREDITO;
    return CATEGORIA_OUTRA;
  }

  function rotuloRubrica(codigo) {
    for (const tabela of [RUBRICAS_CONSIGNADO, RUBRICAS_ASSOCIATIVAS,
                          RUBRICAS_CREDITO, RUBRICAS_DESCONTO]) {
      if (codigo in tabela) return tabela[codigo];
    }
    return '';
  }

  /* ----------------------------------------------------------------------
     Auxiliares do registro
     ---------------------------------------------------------------------- */
  function registroVazio(mes, ano, arquivo) {
    const m = parseInt(mes, 10);
    const a = parseInt(ano, 10);
    return {
      competencia: `${String(m).padStart(2, '0')}/${a}`,
      mes: m,
      ano: a,
      chave: a * 100 + m,
      nb: '', especie: '', especie_codigo: '', dib: '', aps: '',
      banco_codigo: '', banco_nome: '', op_codigo: '', op_nome: '',
      periodo_inicio: '', previsao_pagamento: '', data_pagamento: '',
      valor_liquido: null, valor_mr: null,
      meio_pagamento_bruto: '', meio_pagamento_sigla: '', meio_pagamento: '',
      status: '', ocorrencia: '',
      rubricas: [],
      total_consignado: 0, total_associativo: 0, total_descontos: 0, total_creditos: 0,
      confere: null,
      arquivo, formato: '', texto_bruto: '',
    };
  }

  function consolidar(registro) {
    registro.banco_nome = nomeProvavel(registro.banco_codigo, registro.banco_nome);
    registro.banco_id = registro.banco_codigo
      || semAcento(registro.banco_nome).slice(0, 20)
      || '?';

    const bruto = registro.meio_pagamento_bruto || '';
    const m = bruto.match(/^\s*([A-Z]{2,4})\b/);
    const sigla = m ? m[1] : '';
    registro.meio_pagamento_sigla = sigla;
    registro.meio_pagamento = MEIOS_PAGAMENTO[sigla] || bruto;

    let consignado = 0, associativo = 0, outrosDescontos = 0, creditos = 0;
    for (const rubrica of registro.rubricas) {
      const valor = Math.abs(rubrica.valor || 0);
      const categoria = rubrica.categoria;
      if (categoria === CATEGORIA_CONSIGNADO) consignado += valor;
      else if (categoria === CATEGORIA_ASSOCIATIVA) associativo += valor;
      else if (categoria === CATEGORIA_DESCONTO) outrosDescontos += valor;
      else if (categoria === CATEGORIA_CREDITO) {
        if (rubrica.codigo === RUBRICA_MR) registro.valor_mr = valor;
        else creditos += valor;
      }
    }
    registro.total_consignado = consignado;
    registro.total_associativo = associativo;
    registro.total_descontos = consignado + associativo + outrosDescontos;
    registro.total_creditos = creditos;
    registro.confere = conferir(registro);
  }

  function conferir(registro) {
    if (registro.valor_mr === null || registro.valor_liquido === null) return null;
    const esperado = registro.valor_mr + registro.total_creditos - registro.total_descontos;
    return Math.abs(esperado - registro.valor_liquido) <= 2;
  }

  function lerDeTexto(texto, nomeExibicao, metodo) {
    const nome = nomeExibicao || '';
    const competencias = extrairCompetencias(texto, nome);
    return {
      arquivo: nome,
      metodo_extracao: metodo || 'pdf.js',
      formato: competencias.length ? competencias[0].formato : '',
      cabecalho: extrairCabecalho(texto),
      competencias,
      texto_completo: texto,
      paginas_texto_vazio: texto.trim().length < 40,
    };
  }

  async function lerPdf(pdfjsLib, dados, nomeExibicao) {
    const texto = await extrairTextoPdf(pdfjsLib, dados);
    return lerDeTexto(texto, nomeExibicao, 'pdf.js');
  }

  /* ======================================================================
     analise.py
     ====================================================================== */
  const NIVEL_ALERTA = 'alerta';
  const NIVEL_ATENCAO = 'atencao';
  const NIVEL_NORMAL = 'normal';
  const ICONES = { [NIVEL_ALERTA]: '🔴', [NIVEL_ATENCAO]: '🟡', [NIVEL_NORMAL]: '⚪' };
  const PESO_NIVEL = { [NIVEL_NORMAL]: 0, [NIVEL_ATENCAO]: 1, [NIVEL_ALERTA]: 2 };

  const JANELA_RUBRICAS = 3;
  const MARGEM_TETO_DECIMOS = 450;   // 45%
  const MARGEM_ALTA_DECIMOS = 400;   // 40%
  const MARGEM_TETO_TEXTO = '45%';
  const MARGEM_ALTA_TEXTO = '40%';
  const CONTRATOS_DEMAIS = 5;

  const MESES = ['', 'jan', 'fev', 'mar', 'abr', 'mai', 'jun',
                 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

  // Divisão exata n/d com arredondamento "half-even" (o mesmo do Decimal).
  function divisaoHalfEven(n, d) {
    const q = Math.floor(n / d);
    const r = n - q * d;
    const dobro = 2 * r;
    if (dobro > d) return q + 1;
    if (dobro < d) return q;
    return q % 2 === 0 ? q : q + 1;
  }

  function formatarPct(decimos) {
    if (decimos === null || decimos === undefined) return '—';
    const inteiro = Math.trunc(decimos / 10);
    const fracao = Math.abs(decimos % 10);
    return `${inteiro},${fracao}%`;
  }

  function analisar(leituras) {
    const filiado = melhorCabecalho(leituras);
    const grupos = agruparPorBeneficio(leituras);

    const dossies = [];
    for (let indice = 0; indice < grupos.length; indice++) {
      const [chave, grupo] = grupos[indice];
      const dossie = montarDossie(grupo.registros, grupo.arquivos);
      dossie.cabecalho = cabecalhoDoBeneficio(filiado, grupo);
      dossie.indice = indice;
      dossie.chave_beneficio = chave;
      dossie.total_beneficios = grupos.length;
      dossies.push(dossie);
    }
    return dossies;
  }

  function agruparPorBeneficio(leituras) {
    const grupos = new Map();
    for (const leitura of leituras) {
      for (const registro of leitura.competencias) {
        const esp = registro.especie_codigo || '';
        const nb = registro.nb || '';
        const chaveTexto = esp + '\u0000' + nb;
        if (!grupos.has(chaveTexto)) {
          grupos.set(chaveTexto, { chave: [esp, nb], registros: [], arquivos: new Map(), dados: {} });
        }
        const grupo = grupos.get(chaveTexto);
        grupo.registros.push(registro);
        if (!grupo.arquivos.has(leitura.arquivo)) {
          grupo.arquivos.set(leitura.arquivo, {
            arquivo: leitura.arquivo,
            metodo_extracao: leitura.metodo_extracao,
            competencias_lidas: 0,
            sem_texto: leitura.paginas_texto_vazio,
          });
        }
        grupo.arquivos.get(leitura.arquivo).competencias_lidas += 1;
        for (const campo of ['nb', 'especie', 'especie_codigo', 'dib', 'aps']) {
          if (registro[campo] && !grupo.dados[campo]) grupo.dados[campo] = registro[campo];
        }
      }
    }

    const itens = [...grupos.values()].map((g) => [g.chave, g]);
    itens.sort((a, b) => {
      if (a[0][0] !== b[0][0]) return a[0][0] < b[0][0] ? -1 : 1;
      if (a[0][1] !== b[0][1]) return a[0][1] < b[0][1] ? -1 : 1;
      return 0;
    });
    return itens;
  }

  function montarDossie(registros, arquivos) {
    const linhaDoTempo = consolidarLinhaDoTempo(registros);
    calcularMargem(linhaDoTempo);
    const trocas = detectarTrocas(linhaDoTempo);
    classificarTrocas(trocas, linhaDoTempo);
    const bancos = resumirBancos(linhaDoTempo);
    const alertas = gerarAlertas(linhaDoTempo, trocas);
    const resumo = resumir(linhaDoTempo, trocas, bancos, alertas);

    return {
      arquivos: [...arquivos.values()],
      linha_do_tempo: linhaDoTempo,
      trocas, bancos, alertas, resumo,
    };
  }

  function cabecalhoDoBeneficio(filiado, grupo) {
    const dados = grupo.dados;
    return {
      nome: filiado.nome || '',
      cpf: filiado.cpf || '',
      nit: filiado.nit || '',
      beneficio: dados.nb || filiado.beneficio || '',
      especie: dados.especie || filiado.especie || '',
      especie_codigo: dados.especie_codigo || '',
      dib: dados.dib || filiado.dib || '',
      aps: dados.aps || filiado.aps || '',
    };
  }

  /* ------------------------------ Linha do tempo ----------------------- */
  function consolidarLinhaDoTempo(registros) {
    const porChave = new Map();
    for (let registro of registros) {
      const chave = registro.chave;
      const atual = porChave.get(chave);
      if (atual === undefined || pontuar(registro) > pontuar(atual)) {
        if (atual !== undefined) {
          registro = Object.assign({}, registro);
          registro.duplicada = true;
          registro.conflito = haConflito(atual, registro);
        }
        porChave.set(chave, registro);
      } else if (haConflito(atual, registro)) {
        atual.conflito = true;
      }
    }

    const chaves = [...porChave.keys()].sort((a, b) => a - b);
    const linha = chaves.map((c) => porChave.get(c));
    for (let i = 0; i < linha.length; i++) {
      linha[i].ordem = i;
      linha[i].rotulo = rotuloCompetencia(linha[i]);
    }
    return linha;
  }

  function pontuar(registro) {
    let pontos = 0;
    if (registro.banco_codigo) pontos += 4;
    if (registro.valor_liquido !== null && registro.valor_liquido !== undefined) pontos += 2;
    if (registro.data_pagamento) pontos += 1;
    if (registro.meio_pagamento_bruto) pontos += 1;
    pontos += Math.min((registro.rubricas || []).length, 5);
    return pontos;
  }

  function haConflito(a, b) {
    return Boolean(a.banco_codigo && b.banco_codigo && a.banco_codigo !== b.banco_codigo);
  }

  function rotuloCompetencia(registro) {
    return `${MESES[registro.mes]}/${registro.ano}`;
  }

  function calcularMargem(linha) {
    for (const registro of linha) {
      const bruto = registro.valor_mr;
      const consignado = registro.total_consignado;
      if (bruto && bruto > 0) {
        registro.margem_pct = divisaoHalfEven(consignado * 1000, bruto);
      } else {
        registro.margem_pct = null;
      }
      registro.contratos_consignado = registro.rubricas
        .filter((r) => r.categoria === CATEGORIA_CONSIGNADO).length;
    }
  }

  /* ------------------------------ Trocas de banco ---------------------- */
  function detectarTrocas(linha) {
    const trocas = [];
    let anterior = null;
    for (const registro of linha) {
      if (!registro.banco_codigo && !registro.banco_nome) continue;
      if (anterior !== null && registro.banco_id !== anterior.banco_id) {
        trocas.push({
          ordem: trocas.length + 1,
          de: lado(anterior),
          para: lado(registro),
          indice_antes: anterior.ordem,
          indice_depois: registro.ordem,
          meses_entre: distanciaMeses(anterior, registro),
          motivos: [],
          nivel: NIVEL_NORMAL,
        });
      }
      anterior = registro;
    }
    return trocas;
  }

  function lado(registro) {
    return {
      codigo: registro.banco_codigo,
      nome: registro.banco_nome,
      competencia: registro.competencia,
      rotulo: registro.rotulo,
      data_pagamento: registro.data_pagamento,
      op_codigo: registro.op_codigo,
      op_nome: registro.op_nome,
      meio_pagamento: registro.meio_pagamento,
      meio_pagamento_sigla: registro.meio_pagamento_sigla,
      valor_liquido: registro.valor_liquido,
    };
  }

  function distanciaMeses(a, b) {
    return (b.ano - a.ano) * 12 + (b.mes - a.mes);
  }

  function classificarTrocas(trocas, linha) {
    for (const troca of trocas) {
      const motivos = [];
      const destino = troca.para;
      const origem = troca.de;

      const risco = avaliarRisco(destino.codigo, destino.nome);
      troca.risco_destino = risco;
      let nivel;
      if (risco.risco) {
        nivel = NIVEL_ALERTA;
        motivos.push(
          `Banco de destino (${risco.rotulo}) está na lista de instituições `
          + 'frequentemente associadas a fraude de portabilidade/consignado do INSS. '
          + risco.motivo);
      } else {
        nivel = NIVEL_NORMAL;
      }

      const mudouMeio = Boolean(origem.meio_pagamento_sigla && destino.meio_pagamento_sigla
        && origem.meio_pagamento_sigla !== destino.meio_pagamento_sigla);
      troca.mudou_meio_pagamento = mudouMeio;
      if (mudouMeio) {
        let texto = 'O meio de pagamento mudou de '
          + `${origem.meio_pagamento || origem.meio_pagamento_sigla} para `
          + `${destino.meio_pagamento || destino.meio_pagamento_sigla}.`;
        if (MEIOS_CARTAO.has(destino.meio_pagamento_sigla)) {
          texto += ' A migração para cartão magnético é um indício adicional: dificulta '
                 + 'o controle do titular sobre o próprio dinheiro.';
        }
        motivos.push(texto);
        nivel = maior(nivel, NIVEL_ATENCAO);
      }

      const mudouPraca = Boolean(origem.op_nome && destino.op_nome
        && origem.op_nome !== destino.op_nome);
      troca.mudou_praca = mudouPraca;
      if (mudouPraca) {
        motivos.push(
          `A praça/agência pagadora mudou de "${origem.op_nome}" para `
          + `"${destino.op_nome}". Confirme se a nova praça tem relação com o `
          + 'município onde o titular mora.');
      }

      const citado = bancoCitadoNaPraca(destino.op_nome, destino.nome);
      troca.banco_citado_na_praca = citado;
      if (citado) {
        motivos.push(
          `A nova praça pagadora ("${destino.op_nome}") leva o nome do ${citado}, `
          + 'e não do banco que passou a pagar o benefício. Conta aberta dentro de um '
          + 'correspondente bancário é o caminho típico da portabilidade feita no balcão.');
        nivel = NIVEL_ALERTA;
      }

      if (ehCooperativa(destino.nome)) {
        troca.cooperativa = true;
        motivos.push(
          'O destino é uma cooperativa de crédito — comum como conta de destino em '
          + 'portabilidades não reconhecidas quando a praça não é a do titular.');
        nivel = maior(nivel, NIVEL_ATENCAO);
      } else {
        troca.cooperativa = false;
      }

      const novas = novasRubricas(linha, troca);
      troca.novas_rubricas = novas;
      if (novas.length) {
        const descricoes = novas.slice(0, 4)
          .map((r) => `${r.codigo} - ${r.descricao}`).join(', ');
        motivos.push(
          `Novos descontos aparecem logo após a troca (${descricoes}). `
          + 'Descontos que surgem na sequência de uma mudança de banco são o padrão '
          + 'clássico do esquema.');
        nivel = maior(nivel, NIVEL_ATENCAO);
      }

      if (troca.meses_entre > 1) {
        motivos.push(
          `Há ${troca.meses_entre - 1} competência(s) sem registro entre os dois `
          + 'bancos — a data exata da transição pode estar num extrato não anexado.');
      }

      troca.motivos = motivos;
      troca.nivel = nivel;
      troca.icone = ICONES[nivel];
    }
  }

  function maior(a, b) {
    return PESO_NIVEL[a] >= PESO_NIVEL[b] ? a : b;
  }

  function novasRubricas(linha, troca) {
    const iAntes = troca.indice_antes;
    const iDepois = troca.indice_depois;
    const depois = linha.slice(iDepois, iDepois + JANELA_RUBRICAS);

    const conhecidas = new Set();
    for (const registro of linha.slice(0, iAntes + 1)) {
      for (const rubrica of registro.rubricas) {
        conhecidas.add(rubrica.codigo + '\u0001' + rubrica.descricao);
      }
    }

    const novas = [];
    const vistas = new Set();
    for (const registro of depois) {
      for (const rubrica of registro.rubricas) {
        const chave = rubrica.codigo + '\u0001' + rubrica.descricao;
        if (conhecidas.has(chave) || vistas.has(chave)) continue;
        if (rubrica.categoria !== CATEGORIA_CONSIGNADO
            && rubrica.categoria !== CATEGORIA_ASSOCIATIVA) continue;
        vistas.add(chave);
        const nova = Object.assign({}, rubrica);
        nova.competencia = registro.competencia;
        novas.push(nova);
      }
    }
    return novas;
  }

  /* ------------------------------ Bancos usados ------------------------ */
  function resumirBancos(linha) {
    const periodos = [];
    let atual = null;
    for (const registro of linha) {
      if (!registro.banco_id || registro.banco_id === '?') continue;
      if (atual === null || atual.banco_id !== registro.banco_id) {
        const risco = avaliarRisco(registro.banco_codigo, registro.banco_nome);
        atual = {
          banco_id: registro.banco_id,
          codigo: registro.banco_codigo,
          nome: registro.banco_nome,
          inicio: registro.competencia,
          inicio_rotulo: registro.rotulo,
          fim: registro.competencia,
          fim_rotulo: registro.rotulo,
          competencias: 0,
          total_liquido: 0,
          total_consignado: 0,
          risco,
        };
        periodos.push(atual);
      }
      atual.fim = registro.competencia;
      atual.fim_rotulo = registro.rotulo;
      atual.competencias += 1;
      atual.total_liquido += registro.valor_liquido || 0;
      atual.total_consignado += registro.total_consignado;
    }
    return periodos;
  }

  /* ------------------------------ Alertas ------------------------------ */
  function gerarAlertas(linha, trocas) {
    const alertas = [];

    for (const troca of trocas) {
      if (troca.nivel === NIVEL_ALERTA) {
        alertas.push({
          nivel: NIVEL_ALERTA,
          icone: ICONES[NIVEL_ALERTA],
          titulo: `Possível troca indevida em ${troca.para.rotulo}`,
          detalhe: `O benefício passou de ${descBanco(troca.de, 'até')} para `
            + `${descBanco(troca.para, 'a partir de')}. O banco de destino `
            + 'consta na lista de instituições associadas a fraudes de '
            + 'consignado/portabilidade do INSS.',
          competencia: troca.para.competencia,
        });
      }
    }

    alertas.push(...alertasMargem(linha));
    alertas.push(...alertasPraca(linha));

    const associativas = [];
    for (const r of linha) {
      for (const ru of r.rubricas) {
        if (ru.categoria === CATEGORIA_ASSOCIATIVA) associativas.push([r, ru]);
      }
    }
    if (associativas.length) {
      const codigos = [...new Set(associativas.map(([, ru]) => `${ru.codigo} - ${ru.descricao}`))]
        .sort();
      const competenciasDistintas = new Set(associativas.map(([r]) => r.competencia)).size;
      const primeira = associativas[0][0];
      alertas.push({
        nivel: NIVEL_ATENCAO,
        icone: ICONES[NIVEL_ATENCAO],
        titulo: 'Descontos de associação/sindicato no benefício',
        detalhe: 'Aparecem em ' + String(competenciasDistintas)
          + ' competência(s): ' + codigos.join('; ')
          + '. Contribuições associativas descontadas sem filiação real são um dos '
          + 'focos das investigações da CGU/INSS.',
        competencia: primeira.competencia,
      });
    }

    const problemas = linha.filter(
      (r) => sinalizaProblema(r.ocorrencia || '') || sinalizaProblema(r.status || ''));
    if (problemas.length) {
      alertas.push({
        nivel: NIVEL_ATENCAO,
        icone: ICONES[NIVEL_ATENCAO],
        titulo: 'Competências com crédito não confirmado',
        detalhe: 'Ocorrência atípica em: '
          + problemas.slice(0, 12).map((r) => r.competencia).join(', ')
          + (problemas.length > 12 ? '...' : '')
          + '. Pode indicar problema na conta de destino.',
        competencia: problemas[0].competencia,
      });
    }

    const conflitos = linha.filter((r) => r.conflito);
    if (conflitos.length) {
      alertas.push({
        nivel: NIVEL_ATENCAO,
        icone: ICONES[NIVEL_ATENCAO],
        titulo: 'Mesma competência com bancos diferentes em PDFs distintos',
        detalhe: 'Competência(s): ' + conflitos.map((r) => r.competencia).join(', ')
          + '. Confira os PDFs de origem — pode haver reemissão do extrato '
          + 'após uma alteração de conta.',
        competencia: conflitos[0].competencia,
      });
    }

    const naoConferem = linha.filter((r) => r.confere === false);
    if (naoConferem.length) {
      alertas.push({
        nivel: NIVEL_NORMAL,
        icone: 'ℹ️',
        titulo: 'Competências que não fecham na conta',
        detalhe: 'Em ' + naoConferem.slice(0, 12).map((r) => r.competencia).join(', ')
          + (naoConferem.length > 12 ? '...' : '')
          + ', o valor bruto menos os descontos listados não bate com o valor '
          + 'líquido creditado. Pode ser uma rubrica que o leitor não '
          + 'identificou — confira na tela "Conferir extração".',
        competencia: naoConferem[0].competencia,
      });
    }

    const faltantes = lacunas(linha);
    if (faltantes.length) {
      alertas.push({
        nivel: NIVEL_NORMAL,
        icone: 'ℹ️',
        titulo: 'Meses faltando na sequência',
        detalhe: 'Não há registro para: ' + faltantes.slice(0, 18).join(', ')
          + (faltantes.length > 18 ? '...' : '')
          + '. Baixe os extratos desses anos para fechar a linha do tempo.',
        competencia: faltantes[0],
      });
    }

    // Ordenação estável por peso decrescente (igual ao sort do Python).
    alertas.sort((a, b) => (PESO_NIVEL[b.nivel] || 0) - (PESO_NIVEL[a.nivel] || 0));
    return alertas;
  }

  function alertasMargem(linha) {
    const alertas = [];
    const comMargem = linha.filter((r) => r.margem_pct !== null && r.margem_pct !== undefined);
    if (!comMargem.length) return alertas;

    const acimaTeto = comMargem.filter((r) => r.margem_pct > MARGEM_TETO_DECIMOS);
    const coladas = comMargem.filter(
      (r) => r.margem_pct >= MARGEM_ALTA_DECIMOS && r.margem_pct <= MARGEM_TETO_DECIMOS);
    const maxima = Math.max(...comMargem.map((r) => r.margem_pct));

    if (acimaTeto.length) {
      alertas.push({
        nivel: NIVEL_ALERTA,
        icone: ICONES[NIVEL_ALERTA],
        titulo: `Margem consignável estourada em ${acimaTeto.length} competência(s)`,
        detalhe: 'Os descontos de empréstimo e cartão consignado passaram de '
          + `${MARGEM_TETO_TEXTO} do benefício bruto (máximo `
          + `observado: ${formatarPct(maxima)}), `
          + 'acima do teto legal do INSS (35% empréstimo + 5% cartão RMC + '
          + '5% cartão RCC). Primeira ocorrência em '
          + `${acimaTeto[0].competencia}. Desconto acima da margem é `
          + 'irregular e pode ser contestado.',
        competencia: acimaTeto[0].competencia,
      });
    } else if (coladas.length) {
      alertas.push({
        nivel: NIVEL_ATENCAO,
        icone: ICONES[NIVEL_ATENCAO],
        titulo: `Margem consignável no limite em ${coladas.length} competência(s)`,
        detalhe: `Em ${coladas.length} das ${comMargem.length} competências analisadas o `
          + `consignado consome entre ${MARGEM_ALTA_TEXTO} e `
          + `${MARGEM_TETO_TEXTO} do benefício bruto `
          + `(máximo: ${formatarPct(maxima)}). Margem colada no teto por `
          + 'anos seguidos costuma indicar refinanciamentos sucessivos — '
          + 'confira no Extrato de Empréstimo Consignado se todos os contratos '
          + 'são reconhecidos pelo titular.',
        competencia: coladas[0].competencia,
      });
    }

    const pico = Math.max(...linha.map((r) => r.contratos_consignado));
    if (pico >= CONTRATOS_DEMAIS) {
      const noPico = linha.find((r) => r.contratos_consignado === pico);
      alertas.push({
        nivel: NIVEL_ATENCAO,
        icone: ICONES[NIVEL_ATENCAO],
        titulo: `Até ${pico} contratos de consignado descontados no mesmo mês`,
        detalhe: `O pico ocorre em ${noPico.competencia}. Vários empréstimos `
          + 'simultâneos no mesmo benefício é o padrão de contratação em série '
          + '— peça o Extrato de Empréstimo Consignado e confirme contrato a '
          + 'contrato com o titular.',
        competencia: noPico.competencia,
      });
    }

    return alertas;
  }

  function alertasPraca(linha) {
    const achados = new Map();
    for (const registro of linha) {
      const citado = bancoCitadoNaPraca(registro.op_nome, registro.banco_nome);
      if (!citado) continue;
      const chave = registro.banco_id + '\u0001' + citado;
      if (!achados.has(chave)) achados.set(chave, { registro, citado, quantas: 0 });
      achados.get(chave).quantas += 1;
    }

    const alertas = [];
    for (const dados of achados.values()) {
      const registro = dados.registro;
      alertas.push({
        nivel: NIVEL_ALERTA,
        icone: ICONES[NIVEL_ALERTA],
        titulo: `Conta do ${registro.banco_nome} aberta em loja do ${dados.citado}`,
        detalhe: `A praça pagadora é "${registro.op_nome}" — ou seja, a conta que `
          + 'recebe o benefício foi aberta dentro de um correspondente do '
          + `${dados.citado}, embora o banco pagador seja ${registro.banco_codigo} - `
          + `${registro.banco_nome}. Esse arranjo aparece em `
          + `${dados.quantas} competência(s), a partir de `
          + `${registro.competencia}, e é o caminho típico da portabilidade `
          + 'feita no balcão, junto com a oferta de empréstimo.',
        competencia: registro.competencia,
      });
    }
    return alertas;
  }

  function descBanco(lado_, preposicao) {
    const codigo = lado_.codigo ? `${lado_.codigo} - ` : '';
    return `${codigo}${lado_.nome || 'banco não identificado'} `
      + `(${preposicao} ${lado_.rotulo})`;
  }

  function sinalizaProblema(texto) {
    const t = (texto || '').toLowerCase();
    if (!t) return false;
    return ['não retornado', 'nao retornado', 'devolvido', 'não pago',
            'nao pago', 'cancelad', 'estornad', 'não recebido',
            'nao recebido', 'bloquead'].some((p) => t.includes(p));
  }

  function lacunas(linha) {
    const faltantes = [];
    for (let i = 0; i + 1 < linha.length; i++) {
      const anterior = linha[i];
      const atual = linha[i + 1];
      const distancia = distanciaMeses(anterior, atual);
      if (distancia <= 1) continue;
      let mes = anterior.mes;
      let ano = anterior.ano;
      for (let k = 0; k < distancia - 1; k++) {
        mes += 1;
        if (mes === 13) { mes = 1; ano += 1; }
        faltantes.push(`${String(mes).padStart(2, '0')}/${ano}`);
      }
    }
    return faltantes;
  }

  /* ------------------------------ Resumo ------------------------------- */
  function resumir(linha, trocas, bancos, alertas) {
    const totalLiquido = linha.reduce((s, r) => s + (r.valor_liquido || 0), 0);
    const totalConsignado = linha.reduce((s, r) => s + r.total_consignado, 0);
    const totalAssociativo = linha.reduce((s, r) => s + r.total_associativo, 0);
    const bancosDistintos = new Set(bancos.map((b) => b.banco_id));
    const margens = linha.filter((r) => r.margem_pct !== null && r.margem_pct !== undefined)
      .map((r) => r.margem_pct);
    const contratos = linha.map((r) => r.contratos_consignado || 0);

    return {
      margem_maxima: margens.length ? Math.max(...margens) : null,
      margem_media: margens.length
        ? divisaoHalfEven(margens.reduce((s, m) => s + m, 0), margens.length)
        : null,
      competencias_acima_teto: margens.filter((m) => m > MARGEM_TETO_DECIMOS).length,
      contratos_max: contratos.length ? Math.max(...contratos) : 0,
      total_bruto: linha.reduce((s, r) => s + (r.valor_mr || 0), 0),
      competencias: linha.length,
      periodo_inicio: linha.length ? linha[0].competencia : '',
      periodo_fim: linha.length ? linha[linha.length - 1].competencia : '',
      periodo_inicio_rotulo: linha.length ? linha[0].rotulo : '',
      periodo_fim_rotulo: linha.length ? linha[linha.length - 1].rotulo : '',
      bancos_distintos: bancosDistintos.size,
      periodos_bancarios: bancos.length,
      trocas: trocas.length,
      trocas_alerta: trocas.filter((t) => t.nivel === NIVEL_ALERTA).length,
      trocas_atencao: trocas.filter((t) => t.nivel === NIVEL_ATENCAO).length,
      trocas_normais: trocas.filter((t) => t.nivel === NIVEL_NORMAL).length,
      total_liquido: totalLiquido,
      total_consignado: totalConsignado,
      total_associativo: totalAssociativo,
      alertas: alertas.length,
      alertas_criticos: alertas.filter((a) => a.nivel === NIVEL_ALERTA).length,
    };
  }

  function melhorCabecalho(leituras) {
    const melhor = { nome: '', cpf: '', beneficio: '', especie: '' };
    for (const leitura of leituras) {
      for (const [campo, valor] of Object.entries(leitura.cabecalho)) {
        if (valor && !melhor[campo]) melhor[campo] = valor;
      }
    }
    return melhor;
  }

  /* ======================================================================
     relatorio.py — formatação e planilha
     ====================================================================== */
  function moeda(centavos) {
    if (centavos === null || centavos === undefined) return '—';
    const negativo = centavos < 0;
    const abs = Math.abs(centavos);
    const reais = Math.floor(abs / 100);
    const cent = abs % 100;
    const milhar = String(reais).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `${negativo ? '-' : ''}R$ ${milhar},${String(cent).padStart(2, '0')}`;
  }

  // Filtro "percentual" do template: décimos -> "43,5%".
  const percentual = formatarPct;

  // _pct da planilha (ponto em vez de vírgula, como no Excel original).
  function pctPlanilha(decimos) {
    if (decimos === null || decimos === undefined) return '—';
    return `${Math.trunc(decimos / 10)}.${Math.abs(decimos % 10)}%`;
  }

  function carimbo(data) {
    const d = data || new Date();
    const dois = (n) => String(n).padStart(2, '0');
    return `${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${d.getFullYear()} `
      + `às ${dois(d.getHours())}:${dois(d.getMinutes())}`;
  }

  function nomeArquivoBase(dossie, carimboTempo) {
    const cabecalho = dossie.cabecalho;
    const nome = cabecalho.nome || cabecalho.beneficio || 'extrato';
    const limpo = nome.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'extrato';

    const partes = [`analise-inss_${limpo}`];
    if (cabecalho.especie_codigo) partes.push(`esp${cabecalho.especie_codigo}`);
    if (cabecalho.beneficio) {
      partes.push('NB' + cabecalho.beneficio.replace(/[^0-9]/g, '').slice(0, 12));
    }
    if (!carimboTempo) {
      const d = new Date();
      const dois = (n) => String(n).padStart(2, '0');
      carimboTempo = `${d.getFullYear()}${dois(d.getMonth() + 1)}${dois(d.getDate())}`
        + `-${dois(d.getHours())}${dois(d.getMinutes())}${dois(d.getSeconds())}`;
    }
    partes.push(carimboTempo);
    return partes.join('_');
  }

  const ROTULO_CATEGORIA = {
    [CATEGORIA_CONSIGNADO]: 'empréstimo / cartão consignado',
    [CATEGORIA_ASSOCIATIVA]: 'associação / sindicato',
    [CATEGORIA_CREDITO]: 'crédito (soma no benefício)',
    [CATEGORIA_DESCONTO]: 'outra dedução / ajuste',
  };

  // Monta o Workbook (SheetJS) espelhando gerar_xlsx().
  function montarPlanilha(XLSX, dossie) {
    const FMT_MOEDA = 'R$ #,##0.00';
    const FMT_PCT = '0.0%';

    const numero = (centavos) => (centavos === null || centavos === undefined
      ? null : { t: 'n', v: centavos / 100, z: FMT_MOEDA });
    const pctCelula = (decimos) => (decimos === null || decimos === undefined
      ? null : { t: 'n', v: decimos / 1000, z: FMT_PCT });

    function aba(aoa, larguras) {
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      if (larguras) ws['!cols'] = larguras.map((w) => ({ wch: w }));
      return ws;
    }

    const cab = dossie.cabecalho;
    const res = dossie.resumo;

    // ------------------------------------------------------------ Resumo
    const resumoLinhas = [
      ['ANÁLISE DE EXTRATO DO INSS - HISTÓRICO DE CRÉDITOS'],
      [`Gerado em ${carimbo()}`],
      [],
      ['Titular', cab.nome || 'não identificado no PDF'],
      ['CPF', cab.cpf || '—'],
      ['Benefício', cab.beneficio || '—'],
      ['Espécie', cab.especie || '—'],
      ['', ''],
      ['Período analisado', `${res.periodo_inicio} a ${res.periodo_fim}`],
      ['Competências lidas', res.competencias],
      ['Bancos distintos', res.bancos_distintos],
      ['Trocas de banco', res.trocas],
      ['Trocas para banco de risco (ALERTA)', res.trocas_alerta],
      ['Trocas com sinal adicional (ATENÇÃO)', res.trocas_atencao],
      ['Trocas sem sinal adicional', res.trocas_normais],
      ['', ''],
      ['Total bruto (MR do período)', numero(res.total_bruto)],
      ['Total líquido creditado', numero(res.total_liquido)],
      ['Total descontado em consignado', numero(res.total_consignado)],
      ['Total descontado por associação/sindicato', numero(res.total_associativo)],
      ['', ''],
      ['Margem consignável máxima', pctPlanilha(res.margem_maxima)],
      ['Margem consignável média', pctPlanilha(res.margem_media)],
      ['Competências acima do teto de 45%', res.competencias_acima_teto],
      ['Máximo de contratos de consignado simultâneos', res.contratos_max],
      [],
      ['Arquivos analisados'],
    ];
    for (const arq of dossie.arquivos) {
      resumoLinhas.push([arq.arquivo, `${arq.competencias_lidas} competência(s)`,
                         arq.metodo_extracao]);
    }
    resumoLinhas.push([]);
    resumoLinhas.push(['Este relatório aponta INDÍCIOS. O extrato do INSS sozinho não prova '
      + 'fraude. Confirme com o titular se ele autorizou cada troca e cada desconto.']);
    const wsResumo = aba(resumoLinhas, [42, 34, 18]);

    // -------------------------------------------------- Linha do Tempo
    const marcasTroca = new Map(dossie.trocas.map((t) => [t.indice_depois, t]));
    const linhaAoa = [[
      'Competência', 'Data do pagamento', 'Banco (cód.)', 'Banco (nome)',
      'Agência/OP', 'Praça', 'Meio de pagamento', 'Valor bruto (MR)',
      'Valor líquido', 'Desc. consignado', 'Margem consignada',
      'Contratos de consignado', 'Desc. associativo', 'Confere?',
      'Status', 'Ocorrência', 'Troca de banco?', 'Arquivo de origem',
    ]];
    for (const registro of dossie.linha_do_tempo) {
      const troca = marcasTroca.get(registro.ordem);
      let marca = '';
      if (troca) {
        marca = troca.nivel === NIVEL_ALERTA ? 'SIM - ALERTA'
          : troca.nivel === NIVEL_ATENCAO ? 'SIM - atenção' : 'SIM';
      }
      linhaAoa.push([
        registro.competencia, registro.data_pagamento,
        registro.banco_codigo, registro.banco_nome,
        registro.op_codigo, registro.op_nome,
        registro.meio_pagamento, numero(registro.valor_mr),
        numero(registro.valor_liquido), numero(registro.total_consignado),
        pctCelula(registro.margem_pct),
        registro.contratos_consignado || 0,
        numero(registro.total_associativo),
        registro.confere === true ? 'sim' : registro.confere === false ? 'NÃO' : '—',
        registro.status, registro.ocorrencia, marca, registro.arquivo,
      ]);
    }
    const wsLinha = aba(linhaAoa,
      [13, 17, 12, 30, 12, 24, 19, 15, 14, 16, 16, 15, 16, 10, 14, 24, 15, 28]);

    // ------------------------------------------------------------ Trocas
    const trocasAoa = [[
      '#', 'Nível', 'Última competência no banco anterior', 'Banco anterior',
      'Primeira competência no banco novo', 'Banco novo',
      'Data do 1º pagamento no banco novo', 'Mudou meio de pagamento?',
      'Mudou praça?', 'Novos descontos após a troca', 'Por que foi sinalizada',
    ]];
    if (!dossie.trocas.length) {
      trocasAoa.push(['—', '—', 'Nenhuma troca de banco encontrada no período analisado.']);
    }
    for (const troca of dossie.trocas) {
      const novas = troca.novas_rubricas
        .map((r) => `${r.codigo} - ${r.descricao} (${r.competencia})`).join('; ') || '—';
      trocasAoa.push([
        troca.ordem,
        troca.nivel === NIVEL_ALERTA ? 'ALERTA'
          : troca.nivel === NIVEL_ATENCAO ? 'ATENÇÃO' : 'normal',
        troca.de.competencia,
        `${troca.de.codigo} - ${troca.de.nome}`,
        troca.para.competencia,
        `${troca.para.codigo} - ${troca.para.nome}`,
        troca.para.data_pagamento,
        troca.mudou_meio_pagamento ? 'sim' : 'não',
        troca.mudou_praca ? 'sim' : 'não',
        novas,
        troca.motivos.join(' ') || 'Troca sem sinais adicionais de risco.',
      ]);
    }
    const wsTrocas = aba(trocasAoa, [5, 12, 28, 30, 28, 30, 22, 22, 14, 40, 70]);

    // --------------------------------------------------------- Descontos
    const rubricasAoa = [[
      'Competência', 'Banco pagador', 'Código', 'Descrição no extrato',
      'Rubrica (nome oficial)', 'Categoria', 'Valor',
    ]];
    let houve = false;
    for (const registro of dossie.linha_do_tempo) {
      for (const rubrica of registro.rubricas) {
        houve = true;
        rubricasAoa.push([
          registro.competencia,
          `${registro.banco_codigo} - ${registro.banco_nome}`,
          rubrica.codigo, rubrica.descricao,
          rotuloRubrica(rubrica.codigo),
          ROTULO_CATEGORIA[rubrica.categoria] || 'não classificada',
          numero(rubrica.valor),
        ]);
      }
    }
    if (!houve) rubricasAoa.push(['—', 'Nenhuma rubrica foi identificada nos PDFs enviados.']);
    const wsRubricas = aba(rubricasAoa, [13, 30, 9, 44, 42, 28, 14]);

    // ----------------------------------------------------------- Alertas
    const alertasAoa = [['Nível', 'Competência', 'Alerta', 'Detalhe']];
    if (!dossie.alertas.length) alertasAoa.push(['—', '—', 'Nenhum alerta gerado.', '']);
    for (const alerta of dossie.alertas) {
      alertasAoa.push([alerta.nivel.toUpperCase(), alerta.competencia,
                       alerta.titulo, alerta.detalhe]);
    }
    const wsAlertas = aba(alertasAoa, [10, 13, 46, 90]);

    const livro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(livro, wsResumo, 'Resumo');
    XLSX.utils.book_append_sheet(livro, wsLinha, 'Linha do Tempo');
    XLSX.utils.book_append_sheet(livro, wsTrocas, 'Trocas de Banco');
    XLSX.utils.book_append_sheet(livro, wsRubricas, 'Descontos');
    XLSX.utils.book_append_sheet(livro, wsAlertas, 'Alertas');
    return livro;
  }

  /* ======================================================================
     Exportação
     ====================================================================== */
  const AlfaMotor = {
    VERSAO,
    // extração
    extrairTextoPdf, lerPdf, lerDeTexto, extrairCabecalho, extrairCompetencias,
    extrairTextoPorPagina, competenciasDaPagina,
    // análise
    analisar,
    // formatação
    moeda, percentual, formatarPct, pctPlanilha, carimbo, nomeArquivoBase,
    rotuloRubrica, ROTULO_CATEGORIA,
    // planilha
    montarPlanilha,
    // constantes úteis para a interface
    NIVEL_ALERTA, NIVEL_ATENCAO, NIVEL_NORMAL, ICONES,
    MARGEM_TETO_DECIMOS,
  };
  export default AlfaMotor;
