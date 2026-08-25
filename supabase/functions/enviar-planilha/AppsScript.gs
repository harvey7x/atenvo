/**
 * CÓPIA DE REFERÊNCIA — não roda aqui. O original vive no editor de Apps Script
 * vinculado à planilha "CONTROLE CLIENTES AGENDADOS" (projeto do dono da planilha),
 * publicado como App da Web. Versão 3 (25/08/2026) ativa nas DUAS implantações
 * ("ATENVO" e a sem título); o secret PLANILHA_WEBAPP_URL do Supabase aponta pra
 * URL /exec de uma delas.
 *
 * GOTCHA que já quebrou em produção: salvar o código no editor NÃO atualiza o App
 * da Web. Toda mudança exige "Implantar → Gerenciar implantações → ✏️ → Versão:
 * Nova versão → Implantar" (mantém a mesma URL). Sem isso a URL continua servindo
 * a versão antiga em silêncio.
 *
 * CAF — Ponte Atenvo → Planilha "CONTROLE CLIENTES AGENDADOS"
 * Recebe os dados da ficha judicial (via edge function enviar-planilha)
 * e cria/atualiza a linha na aba CLIENTES EM ANDAMENTO.
 *
 * Regras:
 *  - Deduplica por CPF: se o CPF já existe, ATUALIZA a linha (cores intactas).
 *  - Acha as colunas pelo texto do cabeçalho, não pela letra.
 *  - Nunca sobrescreve uma célula com valor vazio (não apaga o que foi
 *    preenchido na mão, ex.: senha já anotada na planilha).
 *  - Se o Atenvo mandar `cor` (verde/amarelo/vermelho), pinta a célula do
 *    CLIENTE; sem cor, a formatação fica exatamente como está.
 */

var TOKEN = 'COLOQUE_AQUI_O_PLANILHA_TOKEN'; // mesmo valor do secret PLANILHA_TOKEN no Supabase (redigido no repo)
var GID_ABA = 2039002047;                    // aba CLIENTES EM ANDAMENTO

function doGet() {
  return _json({ ok: true, msg: 'Ponte CAF ativa. Aguardando envios do Atenvo.' });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.tryLock(20000);
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (body.token !== TOKEN) return _json({ ok: false, erro: 'token invalido' });

    var aba = _achaAba(GID_ABA);
    if (!aba) return _json({ ok: false, erro: 'aba nao encontrada (gid ' + GID_ABA + ')' });

    var cabecalho = aba.getRange(1, 1, 1, aba.getLastColumn()).getValues()[0];
    var col = _mapeiaColunas(cabecalho);
    if (!col.CLIENTE || !col.CPF) {
      return _json({ ok: false, erro: 'cabecalhos CLIENTE/CPF nao encontrados na linha 1' });
    }

    var cpfNovo = _soDigitos(body.cpf);
    if (!cpfNovo) return _json({ ok: false, erro: 'CPF vazio' });

    // procura o CPF nas linhas existentes
    var ultimaLinha = aba.getLastRow();
    var linhaAlvo = 0;
    if (ultimaLinha >= 2) {
      var cpfs = aba.getRange(2, col.CPF, ultimaLinha - 1, 1).getValues();
      for (var i = 0; i < cpfs.length; i++) {
        if (_soDigitos(String(cpfs[i][0])) === cpfNovo) { linhaAlvo = i + 2; break; }
      }
    }

    var acao;
    if (linhaAlvo) {
      acao = 'atualizado';
    } else {
      linhaAlvo = ultimaLinha + 1;
      acao = 'criado';
    }

    _escreve(aba, linhaAlvo, col.CLIENTE, body.cliente);
    _escreve(aba, linhaAlvo, col.CPF, body.cpf);
    _escreve(aba, linhaAlvo, col.SENHA, body.senha_inss);
    _escreve(aba, linhaAlvo, col.NUMERO, body.numero);
    _escreve(aba, linhaAlvo, col.TRAFEGO, body.trafego);
    _escreve(aba, linhaAlvo, col.RESPONSAVEL, body.responsavel);

    aplicarCorPlanilha(aba, linhaAlvo, body.cor, col.CLIENTE); // <-- pinta a celula do cliente se o Atenvo mandou cor

    return _json({ ok: true, acao: acao, linha: linhaAlvo });
  } catch (err) {
    return _json({ ok: false, erro: String(err) });
  } finally {
    lock.releaseLock();
  }
}

// ------------------- auxiliares -------------------

function _achaAba(gid) {
  var abas = SpreadsheetApp.getActiveSpreadsheet().getSheets();
  for (var i = 0; i < abas.length; i++) {
    if (abas[i].getSheetId() === gid) return abas[i];
  }
  return null;
}

function _mapeiaColunas(cabecalho) {
  var col = {};
  for (var i = 0; i < cabecalho.length; i++) {
    var h = _normaliza(String(cabecalho[i]));
    if (h.indexOf('CLIENTE') !== -1) col.CLIENTE = i + 1;
    else if (h.indexOf('CPF') !== -1) col.CPF = i + 1;
    else if (h.indexOf('SENHA') !== -1) col.SENHA = i + 1;
    else if (h.indexOf('NUMERO') !== -1) col.NUMERO = i + 1;
    else if (h.indexOf('TRAF') !== -1) col.TRAFEGO = i + 1;
    else if (h.indexOf('RESPONS') !== -1) col.RESPONSAVEL = i + 1;
  }
  return col;
}

function _escreve(aba, linha, coluna, valor) {
  if (!coluna) return;                                                // coluna nao existe na planilha
  if (valor === '' || valor === null || valor === undefined) return;  // nunca apaga com vazio
  aba.getRange(linha, coluna).setValue(valor);
}

function _soDigitos(s) {
  return String(s || '').replace(/\D/g, '');
}

function _normaliza(s) {
  return s.toUpperCase()
    .replace(/[ÁÀÂÃ]/g, 'A').replace(/[ÉÊ]/g, 'E').replace(/Í/g, 'I')
    .replace(/[ÓÔÕ]/g, 'O').replace(/[ÚÜ]/g, 'U').replace(/Ç/g, 'C')
    .trim();
}

function _json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ------------------- cor da linha -------------------

// Cores vivas — exatamente as que a equipe ja usa na coluna CLIENTE
var CORES_PLANILHA = { verde: '#00ff00', amarelo: '#ffff00', vermelho: '#ff0000' };

/** Pinta SO a celula do CLIENTE (padrao da equipe) quando o Atenvo mandar `cor`;
 *  sem cor, a formatacao fica exatamente como esta. */
function aplicarCorPlanilha(aba, linha, cor, colCliente) {
  var hex = CORES_PLANILHA[String(cor || '').toLowerCase()];
  if (!hex || !linha) return;
  aba.getRange(linha, colCliente || 2, 1, 1).setBackground(hex);
}
