/* =========================================================================
   ALFA ANÁLISE — unificação de PDFs (versão navegador)
   Junta os PDFs de Histórico de Créditos num único arquivo, na ordem das
   competências, pulando as páginas que o atendente marcou para remoção.
   Funções puras que recebem o pdf-lib como parâmetro — testáveis em Node,
   no mesmo padrão do motor.js. A tela fica em app.js.
   ========================================================================= */
/* Porte ESM para a Reviza (aba Análise INSS): SÓ o invólucro mudou — saiu o
   IIFE/raiz/module.exports, entrou `const AlfaUnificar = {...}; export default`.
   A lógica abaixo é byte a byte a do unificar.js original. */

  // Ordena os arquivos pela primeira competência que o motor extraiu de cada
  // PDF (chave = ano*100+mês); empate ou falha, ordem alfabética do nome.
  // Recebe e devolve itens { nome, chave, ... } (cópia; extras preservados).
  function ordenarArquivos(itens) {
    const copia = itens.slice();
    copia.sort((a, b) => {
      const ca = (a.chave === null || a.chave === undefined) ? Infinity : a.chave;
      const cb = (b.chave === null || b.chave === undefined) ? Infinity : b.chave;
      if (ca !== cb) return ca < cb ? -1 : 1;
      if (a.nome !== b.nome) return a.nome < b.nome ? -1 : 1;
      return 0;
    });
    return copia;
  }

  // Monta o PDF unificado. `arquivos` = [{ nome, dados: Uint8Array }] já na
  // ordem final; `removidas` = Set de "índiceDoArquivo:índiceDaPágina"
  // (ambos a partir de 0, índice na lista recebida).
  // Devolve { bytes, paginas, falhas }: `falhas` lista os nomes dos arquivos
  // que o pdf-lib não conseguiu abrir (ex.: PDF protegido por senha) — as
  // páginas deles ficam fora do arquivo final em vez de derrubar o lote todo.
  async function unificarPdfs(PDFLib, arquivos, removidas) {
    const marcadas = removidas || new Set();
    const destino = await PDFLib.PDFDocument.create();
    const falhas = [];
    for (let a = 0; a < arquivos.length; a++) {
      let origem;
      try {
        origem = await PDFLib.PDFDocument.load(arquivos[a].dados);
      } catch (erro) {
        falhas.push(arquivos[a].nome);
        continue;
      }
      const indices = origem.getPageIndices()
        .filter((p) => !marcadas.has(`${a}:${p}`));
      if (!indices.length) continue;
      const paginas = await destino.copyPages(origem, indices);
      for (const pagina of paginas) destino.addPage(pagina);
    }
    return { bytes: await destino.save(), paginas: destino.getPageCount(), falhas };
  }

  // Nome do arquivo final, sanitizado no mesmo padrão do nomeArquivoBase.
  function nomeArquivoUnificado(nomeTitular, carimboTempo) {
    const limpo = String(nomeTitular == null ? '' : nomeTitular)
      .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'extrato';
    if (!carimboTempo) {
      const d = new Date();
      const dois = (n) => String(n).padStart(2, '0');
      carimboTempo = `${d.getFullYear()}${dois(d.getMonth() + 1)}${dois(d.getDate())}`
        + `-${dois(d.getHours())}${dois(d.getMinutes())}${dois(d.getSeconds())}`;
    }
    return `historico-creditos-unificado_${limpo}_${carimboTempo}.pdf`;
  }

  const AlfaUnificar = { ordenarArquivos, unificarPdfs, nomeArquivoUnificado };
  export default AlfaUnificar;
