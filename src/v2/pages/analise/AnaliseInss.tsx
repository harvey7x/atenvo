/* ============================================================
   Análise INSS — extratos "Histórico de Créditos" do Meu INSS.
   Porte React (design Reviza) do app "ALFA Análise": mesmo motor
   (src/v2/data/analise/motor.js), mesmas telas e fluxos — início,
   escolha de benefício, relatório, conferência da extração,
   unificar PDFs (com reanálise só das páginas mantidas), sem dados
   e erro; exporta planilha, HTML e PDF.
   100% NO NAVEGADOR: os PDFs nunca saem da máquina — nada de
   backend, nada de banco.
   ============================================================ */
import { useEffect, useRef, useState } from 'react';
import AlfaMotor from '../../data/analise/motor';
import { carregarPdfjs, carregarXlsx } from '../../data/analise/libs';
import { acharRolagem, baixarBlob, marcaTempo, mensagemDe } from './conteudo';
import { imprimirHtml, montarHtmlRelatorio } from './exportarHtml';
import { TelaInicio, type ProgressoLeitura } from './TelaInicio';
import { TelaBeneficios } from './TelaBeneficios';
import { TelaRelatorio, type AcaoRelatorio } from './TelaRelatorio';
import { TelaDiagnostico } from './TelaDiagnostico';
import { TelaUnificar } from './TelaUnificar';
import { TelaErro, TelaSemDados } from './TelasAviso';
import type { AvisoOperacao, Dossie, EstadoAnalise, Leitura, OrigemUnificar, Pdfjs, PdfGuardado, Tela } from './tipos';
import './analise.css';

type PdfLido = { nome: string; dados: Uint8Array };
type Extras = Pick<EstadoAnalise, 'pdfs' | 'etiquetas' | 'textosPaginas' | 'reanalise'>;

let serieGlobal = 0;

export function AnaliseInss() {
  const [tela, setTela] = useState<Tela>({ nome: 'inicio' });
  const [estado, setEstado] = useState<EstadoAnalise | null>(null);
  const estadoRef = useRef<EstadoAnalise | null>(null);
  const [serie, setSerie] = useState(0);
  const [removidas, setRemovidas] = useState<ReadonlySet<string>>(() => new Set());
  const [carregando, setCarregando] = useState(false);
  const [progresso, setProgresso] = useState<ProgressoLeitura | null>(null);
  const [exportando, setExportando] = useState<AcaoRelatorio | null>(null);
  const [avisoRel, setAvisoRel] = useState<AvisoOperacao | null>(null);
  const raizRef = useRef<HTMLDivElement>(null);
  const montado = useRef(true);
  const primeiraTela = useRef(true);

  useEffect(() => {
    montado.current = true;
    return () => { montado.current = false; };
  }, []);

  // cada troca de tela volta ao topo da área que rola (como o render() original)
  useEffect(() => {
    if (primeiraTela.current) { primeiraTela.current = false; return; }
    const rolagem = acharRolagem(raizRef.current);
    if (rolagem) rolagem.scrollTop = 0;
  }, [tela, serie]);

  function irPara(nova: Tela) {
    setAvisoRel(null);
    setTela(nova);
  }

  function novaAnalise() {
    estadoRef.current = null;
    setEstado(null);
    setRemovidas(new Set());
    irPara({ nome: 'inicio' });
  }

  /* ---------------------------------------------- processamento (rota /analisar) */
  function processarLeituras(leituras: Leitura[], falhas: string[], pdfs: PdfLido[], extras?: Extras) {
    if (!leituras.length) {
      irPara({ nome: 'erro', titulo: 'Não foi possível ler os PDFs', mensagem: falhas.join('; ') || 'Erro desconhecido.', detalhe: '' });
      return;
    }
    let dossies: Dossie[];
    try {
      dossies = AlfaMotor.analisar(leituras);
    } catch (erro) {
      irPara({
        nome: 'erro', titulo: 'Erro inesperado durante a análise', mensagem: mensagemDe(erro),
        detalhe: erro instanceof Error && erro.stack ? erro.stack : '',
      });
      return;
    }

    const novo: EstadoAnalise = {
      dossies,
      falhas,
      textos: leituras.map((l) => ({ arquivo: l.arquivo, texto: l.texto_completo })),
      arquivosLidos: leituras.map((l) => ({
        arquivo: l.arquivo, metodo_extracao: l.metodo_extracao, sem_texto: l.paginas_texto_vazio,
      })),
      // Para a unificação: bytes de cada PDF lido (alinhados com `leituras`)
      // e a chave da primeira competência que o motor extraiu de cada um.
      pdfs: pdfs.map((p, i): PdfGuardado => ({
        nome: p.nome,
        dados: p.dados,
        chave: leituras[i].competencias.length ? leituras[i].competencias[0].chave : null,
      })),
      etiquetas: new Map(),
      textosPaginas: new Map(),
      paginasTotal: null,
      reanalise: null,
      marca: marcaTempo(),
      // a reanálise passa aqui os cachês já traduzidos e a ordem preservada
      ...extras,
    };
    if (!extras) setRemovidas(new Set());
    estadoRef.current = novo;
    setEstado(novo);
    setSerie(++serieGlobal);

    const uteis = dossies.filter((d) => d.linha_do_tempo.length);
    if (!uteis.length) irPara({ nome: 'semDados' });
    else if (uteis.length === 1) irPara({ nome: 'relatorio', indice: dossies.indexOf(uteis[0]) });
    else irPara({ nome: 'beneficios' });
  }

  async function analisarArquivos(arquivos: File[]) {
    if (carregando || !arquivos.length) return;
    setCarregando(true);
    setProgresso({ atual: 0, total: arquivos.length });
    // deixa o navegador pintar o indicador antes do trabalho pesado
    await new Promise((r) => setTimeout(r, 30));

    const leituras: Leitura[] = [];
    const falhas: string[] = [];
    const pdfs: PdfLido[] = [];
    let pdfjs: Pdfjs | null = null;
    let erroCarga: unknown = null;
    try { pdfjs = await carregarPdfjs(); } catch (erro) { erroCarga = erro; }

    for (let i = 0; i < arquivos.length; i++) {
      const arquivo = arquivos[i];
      if (!montado.current) return;
      setProgresso({ atual: i + 1, total: arquivos.length });
      try {
        if (!pdfjs) throw erroCarga ?? new Error('Leitor de PDF indisponível.');
        const dados = new Uint8Array(await arquivo.arrayBuffer());
        // O pdf.js transfere `dados` para o worker; a cópia fica para a unificação.
        const copia = dados.slice();
        leituras.push(await AlfaMotor.lerPdf(pdfjs, dados, arquivo.name));
        pdfs.push({ nome: arquivo.name, dados: copia });
      } catch (erro) {
        falhas.push(`${arquivo.name}: ${mensagemDe(erro)}`);
      }
    }
    if (!montado.current) return;
    setCarregando(false);
    setProgresso(null);
    processarLeituras(leituras, falhas, pdfs);
  }

  /* Refaz a análise usando só o texto das páginas mantidas na unificação.
     Arquivo com todas as páginas removidas sai da análise e da unificação;
     desfazer as remoções e reanalisar traz a análise completa de volta.
     Devolve a mensagem para a tela (ou null quando trocou de tela). */
  async function reanalisarComMantidas(): Promise<string | null> {
    const meu = estadoRef.current;
    if (!meu) return null;
    const marcas = removidas;
    try {
      const leiturasNovas: Leitura[] = [];
      const pdfsNovos: { nome: string; dados: Uint8Array; chaveAnterior: number | null }[] = [];
      let paginasFora = 0;
      let mantidasTotais = 0;
      let pdfjs: Pdfjs | null = null;

      for (let i = 0; i < meu.pdfs.length; i++) {
        const pdf = meu.pdfs[i];
        const removidasDoArquivo = new Set<number>();
        for (const marca of marcas) {
          const [arq, pag] = marca.split(':');
          if (parseInt(arq, 10) === i) removidasDoArquivo.add(parseInt(pag, 10));
        }

        // Sempre a partir do texto por página do ARQUIVO COMPLETO (o cache ou
        // uma nova extração dos bytes) — após uma reanálise, estado.textos já
        // guarda texto filtrado e não serve para desfazer remoções.
        let paginas = meu.textosPaginas.get(i);
        if (!paginas) {
          if (!pdfjs) pdfjs = await carregarPdfjs();
          paginas = await AlfaMotor.extrairTextoPorPagina(pdfjs, pdf.dados.slice());
          meu.textosPaginas.set(i, paginas);
        }
        if (estadoRef.current !== meu) return null;   // trocou de análise no meio
        const mantidas = paginas.filter((_ignorado, p) => !removidasDoArquivo.has(p));
        paginasFora += paginas.length - mantidas.length;
        mantidasTotais += mantidas.length;

        // Arquivo com tudo removido vira leitura vazia: fica fora da análise
        // e do PDF final, mas segue listado na unificação para poder desfazer.
        leiturasNovas.push(AlfaMotor.lerDeTexto(mantidas.join('\n'), pdf.nome, 'pdf.js'));
        pdfsNovos.push({ nome: pdf.nome, dados: pdf.dados, chaveAnterior: pdf.chave });
      }

      if (!mantidasTotais) return 'Todas as páginas foram removidas — mantenha ao menos uma para reanalisar.';
      if (estadoRef.current !== meu || !montado.current) return null;

      processarLeituras(leiturasNovas, meu.falhas, pdfsNovos, {
        // Nenhum arquivo muda de posição, então marcas e cachês seguem
        // valendo. Arquivo sem competência na análise atual mantém a chave
        // anterior para não trocar de lugar na ordem da unificação.
        pdfs: pdfsNovos.map((p, k) => ({
          nome: p.nome,
          dados: p.dados,
          chave: leiturasNovas[k].competencias.length ? leiturasNovas[k].competencias[0].chave : p.chaveAnterior,
        })),
        etiquetas: meu.etiquetas,
        textosPaginas: meu.textosPaginas,
        reanalise: paginasFora ? { paginas: paginasFora } : null,
      });
      return null;
    } catch (erro) {
      return 'Não foi possível reanalisar. Detalhe técnico: ' + mensagemDe(erro);
    }
  }

  /* ---------------------------------------------------------- downloads */
  async function exportar(acao: AcaoRelatorio, indice: number) {
    const meu = estadoRef.current;
    if (!meu || exportando) return;
    const d = meu.dossies[indice];
    setAvisoRel(null);
    const params = { d, indice, total: meu.dossies.length, falhas: meu.falhas, reanalise: meu.reanalise };
    if (acao === 'pdf') {
      try {
        imprimirHtml(montarHtmlRelatorio(params));
      } catch (erro) {
        setAvisoRel({ tom: 'erro', texto: 'Não foi possível abrir a impressão. Detalhe técnico: ' + mensagemDe(erro) });
      }
      return;
    }
    if (acao === 'html') {
      try {
        const html = montarHtmlRelatorio(params);
        baixarBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), AlfaMotor.nomeArquivoBase(d, meu.marca) + '.html');
      } catch (erro) {
        setAvisoRel({ tom: 'erro', texto: 'Não foi possível gerar o relatório HTML. Detalhe técnico: ' + mensagemDe(erro) });
      }
      return;
    }
    setExportando('xlsx');
    try {
      const XLSX = await carregarXlsx();
      const livro = AlfaMotor.montarPlanilha(XLSX, d);
      XLSX.writeFile(livro, AlfaMotor.nomeArquivoBase(d, meu.marca) + '.xlsx');
    } catch (erro) {
      if (montado.current) setAvisoRel({ tom: 'erro', texto: 'Não foi possível gerar a planilha. Detalhe técnico: ' + mensagemDe(erro) });
    } finally {
      if (montado.current) setExportando(null);
    }
  }

  function alternarPagina(marca: string) {
    setRemovidas((atual) => {
      const nova = new Set(atual);
      if (nova.has(marca)) nova.delete(marca);
      else nova.add(marca);
      return nova;
    });
  }

  /* ---------------------------------------------------------- telas */
  const irUnificar = (origem: OrigemUnificar) => irPara({ nome: 'unificar', origem });
  let conteudo;
  if (tela.nome === 'erro') {
    conteudo = <TelaErro titulo={tela.titulo} mensagem={tela.mensagem} detalhe={tela.detalhe} aoVoltar={novaAnalise} />;
  } else if (!estado || tela.nome === 'inicio') {
    conteudo = <TelaInicio carregando={carregando} progresso={progresso} aoAnalisar={(a) => void analisarArquivos(a)} />;
  } else if (tela.nome === 'beneficios') {
    conteudo = (
      <TelaBeneficios
        estado={estado}
        aoAbrir={(i) => irPara({ nome: 'relatorio', indice: i })}
        aoUnificar={() => irUnificar({ de: 'beneficios', indice: 0 })}
        aoNovaAnalise={novaAnalise}
      />
    );
  } else if (tela.nome === 'relatorio') {
    const indice = tela.indice;
    conteudo = (
      <TelaRelatorio
        key={`rel-${serie}-${indice}`}
        estado={estado}
        indice={indice}
        aoExportar={(acao) => void exportar(acao, indice)}
        ocupado={exportando}
        aviso={avisoRel}
        aoFecharAviso={() => setAvisoRel(null)}
        aoDiagnostico={() => irPara({ nome: 'diagnostico', indice })}
        aoUnificar={() => irUnificar({ de: 'relatorio', indice })}
        aoBeneficios={() => irPara({ nome: 'beneficios' })}
        aoNovaAnalise={novaAnalise}
      />
    );
  } else if (tela.nome === 'diagnostico') {
    const indice = tela.indice;
    conteudo = (
      <TelaDiagnostico
        estado={estado}
        indice={indice}
        aoVoltar={() => irPara({ nome: 'relatorio', indice })}
        aoNovaAnalise={novaAnalise}
      />
    );
  } else if (tela.nome === 'unificar') {
    const origem = tela.origem;
    conteudo = (
      <TelaUnificar
        key={`uni-${serie}`}
        estado={estado}
        origem={origem}
        removidas={removidas}
        aoAlternar={alternarPagina}
        aoReanalisar={reanalisarComMantidas}
        aoVoltar={() => irPara(origem.de === 'beneficios' ? { nome: 'beneficios' } : { nome: 'relatorio', indice: origem.indice })}
        aoNovaAnalise={novaAnalise}
        estadoAtual={() => estadoRef.current}
      />
    );
  } else {
    conteudo = <TelaSemDados estado={estado} aoVoltar={novaAnalise} />;
  }

  return (
    <div className="an-raiz" ref={raizRef} key={`${tela.nome}-${serie}`}>
      {conteudo}
    </div>
  );
}

export default AnaliseInss;
