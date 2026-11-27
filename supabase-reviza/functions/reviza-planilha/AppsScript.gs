/**
 * CÓPIA DE REFERÊNCIA — não roda aqui. O original vive no editor de Apps Script
 * vinculado à PLANILHA DA REVIZA (Extensões → Apps Script), publicado como App
 * da Web ("Executar como: eu"; "Quem pode acessar: Qualquer pessoa").
 *
 * GOTCHA (aprendido no CAF): salvar o código no editor NÃO atualiza o App da Web.
 * Toda mudança exige "Implantar → Gerenciar implantações → ✏️ → Versão: Nova
 * versão → Implantar" (mantém a mesma URL).
 *
 * Reviza — Ponte Sistema → Planilha
 * Recebe o cliente cadastrado no sistema (via edge function reviza-planilha)
 * e cria/atualiza a linha na planilha.
 *
 * Regras (mesmas da ponte do CAF):
 *  - Deduplica por CPF: se o CPF já existe, ATUALIZA a linha.
 *  - Acha as colunas pelo TEXTO do cabeçalho (contém), não pela letra.
 *  - Nunca sobrescreve uma célula com valor vazio (não apaga o que a equipe
 *    preencheu na mão — ex.: senha anotada direto na planilha).
 *  - Senhas NÃO passam pela ponte (decisão de segurança; a coluna fica como está).
 */

var TOKEN = 'COLOQUE_AQUI_O_PLANILHA_TOKEN'; // mesmo valor do secret PLANILHA_TOKEN no Supabase da Reviza
var GID_ABA = 0; // gid da aba (0 = primeira). Na planilha MENSAL: aba "Planilha1".

function doGet() {
  return _json({ ok: true, msg: 'Ponte Reviza ativa. Aguardando envios do sistema.' });
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
    if (!col.CLIENTE) return _json({ ok: false, erro: 'cabecalho CLIENTE nao encontrado na linha 1' });

    // dedup por CPF (quando houver CPF e coluna de CPF)
    var linhaAlvo = 0;
    var cpfNovo = _soDigitos(body.cpf);
    var ultimaLinha = aba.getLastRow();
    if (cpfNovo && col.CPF && ultimaLinha >= 2) {
      var cpfs = aba.getRange(2, col.CPF, ultimaLinha - 1, 1).getValues();
      for (var i = 0; i < cpfs.length; i++) {
        if (_soDigitos(String(cpfs[i][0])) === cpfNovo) { linhaAlvo = i + 2; break; }
      }
    }
    var criou = false;
    if (!linhaAlvo) { linhaAlvo = ultimaLinha + 1; criou = true; }

    var mapa = [
      ['FECHAMENTO', body.fechamento],
      ['COMERCIAL', body.comercial],
      ['CLIENTE', body.nome],
      ['NB', body.nb],
      ['BANCO', body.banco],       // "BANCO" acha a primeira coluna cujo cabeçalho contém BANCO e não contém RECEBE
      ['CPF', body.cpf],
      ['PARCELA', body.valor],
      ['PAROU', body.dataParou],
      ['RECEBE', body.recebe],
      ['TELEFONE', body.telefone],
    ];
    for (var m = 0; m < mapa.length; m++) {
      var c = col[mapa[m][0]];
      var v = mapa[m][1];
      if (!c) continue;
      if (v === undefined || v === null || String(v) === '') continue; // nunca apaga o que existe
      aba.getRange(linhaAlvo, c).setValue(v);
    }
    return _json({ ok: true, linha: linhaAlvo, criou: criou });
  } catch (err) {
    return _json({ ok: false, erro: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function _mapeiaColunas(cab) {
  var col = {};
  for (var i = 0; i < cab.length; i++) {
    var t = String(cab[i] || '').toUpperCase();
    if (!t) continue;
    var n = i + 1;
    if (!col.FECHAMENTO && t.indexOf('FECHAMENTO') >= 0) col.FECHAMENTO = n;
    if (!col.COMERCIAL && t.indexOf('COMERCIAL') >= 0) col.COMERCIAL = n;
    if (!col.CLIENTE && t.indexOf('CLIENTE') >= 0) col.CLIENTE = n;
    if (!col.NB && t === 'NB') col.NB = n;
    if (!col.BANCO && t.indexOf('BANCO') >= 0 && t.indexOf('RECEBE') < 0) col.BANCO = n;
    if (!col.CPF && t.indexOf('CPF') >= 0) col.CPF = n;
    if (!col.PARCELA && t.indexOf('PARCELA') >= 0) col.PARCELA = n;
    if (!col.PAROU && t.indexOf('PAROU') >= 0) col.PAROU = n;
    if (!col.RECEBE && t.indexOf('RECEBE') >= 0) col.RECEBE = n;
    if (!col.TELEFONE && (t.indexOf('TELEFONE') >= 0 || t.indexOf('CONTATO') >= 0)) col.TELEFONE = n;
  }
  return col;
}

function _achaAba(gid) {
  var abas = SpreadsheetApp.getActive().getSheets();
  for (var i = 0; i < abas.length; i++) if (abas[i].getSheetId() === gid) return abas[i];
  return abas[0] || null;
}

function _soDigitos(s) { return String(s || '').replace(/\D/g, ''); }

function _json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
