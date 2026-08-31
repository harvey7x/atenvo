/* Conversor de arquivos (Ferramentas · 31/08) — conversões que rodam 100% no
   NAVEGADOR (nada sai da máquina): Imagens→PDF, PDF→Imagens, Excel↔CSV.
   Conversões fiéis de Office (Word/Excel → PDF com layout) precisam de servidor
   e ficam fora daqui — há um aviso no rodapé. */
import { useCallback, useRef, useState } from 'react';
import { BotaoPrimario, BotaoSec, CardVidro, EstadoVazio, Segmentado, type OpcaoSegmentado } from '../components';
import { imagensParaPdf, pdfParaImagens, planilhaParaCsv, csvParaPlanilha, ziparArquivos, type SaidaArquivo } from './conversorLib';
import './ferramentas.css';

const fmtKB = (b: number) => (b < 1024 * 1024 ? `${Math.round(b / 1024)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);

type ConvId = 'img2pdf' | 'pdf2img' | 'xlsx2csv' | 'csv2xlsx';
type Conv = { id: ConvId; titulo: string; desc: string; accept: string; multiplos: boolean; dica: string };
const CONVERSOES: Conv[] = [
  { id: 'img2pdf', titulo: 'Imagens → PDF', desc: 'Junte fotos, prints ou scans num PDF só.', accept: 'image/*', multiplos: true, dica: 'Imagens (JPG/PNG/WebP) · pode várias' },
  { id: 'pdf2img', titulo: 'PDF → Imagens', desc: 'Cada página do PDF vira uma imagem (boa pra WhatsApp).', accept: 'application/pdf,.pdf', multiplos: false, dica: '1 arquivo PDF' },
  { id: 'xlsx2csv', titulo: 'Excel → CSV', desc: 'Planilha .xlsx/.xls vira CSV (uma por aba).', accept: '.xlsx,.xls', multiplos: false, dica: '1 arquivo Excel' },
  { id: 'csv2xlsx', titulo: 'CSV → Excel', desc: 'Arquivo CSV vira uma planilha .xlsx.', accept: '.csv,text/csv', multiplos: false, dica: '1 arquivo CSV' },
];
const OPCOES_FORMATO: OpcaoSegmentado<'png' | 'jpg'>[] = [{ valor: 'png', rotulo: 'PNG' }, { valor: 'jpg', rotulo: 'JPG' }];
const OPCOES_RES: OpcaoSegmentado<'2' | '3'>[] = [{ valor: '2', rotulo: 'Normal' }, { valor: '3', rotulo: 'Alta' }];

type Aviso = { tom: 'ok' | 'erro'; texto: string } | null;

export function ConversorArquivos() {
  const [convId, setConvId] = useState<ConvId>('img2pdf');
  const conv = CONVERSOES.find((c) => c.id === convId)!;
  const [files, setFiles] = useState<File[]>([]);
  const [formato, setFormato] = useState<'png' | 'jpg'>('png');
  const [resolucao, setResolucao] = useState<'2' | '3'>('2');
  const [proc, setProc] = useState(false);
  const [aviso, setAviso] = useState<Aviso>(null);
  const [saidas, setSaidas] = useState<SaidaArquivo[]>([]);
  const [arrastando, setArrastando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const urls = useRef<string[]>([]);

  const limparUrls = () => { urls.current.forEach((u) => URL.revokeObjectURL(u)); urls.current = []; };
  const trocarConv = (id: ConvId) => { setConvId(id); setFiles([]); setSaidas([]); setAviso(null); limparUrls(); };

  const adicionar = useCallback((lista: FileList | File[]) => {
    const arr = [...lista];
    if (!arr.length) return;
    setAviso(null); setSaidas([]); limparUrls();
    setFiles((prev) => {
      const novos = conv.multiplos ? [...prev, ...arr] : [arr[0]];   // conversões single: só o último
      const nomes = new Set<string>();
      return novos.filter((f) => { const k = f.name + f.size; if (nomes.has(k)) return false; nomes.add(k); return true; });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conv.multiplos]);

  const remover = (i: number) => { setFiles((p) => p.filter((_, k) => k !== i)); setSaidas([]); limparUrls(); };

  async function converter() {
    if (!files.length || proc) return;
    setProc(true); setAviso(null); setSaidas([]); limparUrls();
    try {
      let out: SaidaArquivo[];
      if (convId === 'img2pdf') {
        const nome = files.length === 1 ? files[0].name.replace(/\.[^.]+$/, '') + '.pdf' : `imagens-${new Date().toISOString().slice(0, 10)}.pdf`;
        out = [{ nome, blob: await imagensParaPdf(files) }];
      } else if (convId === 'pdf2img') {
        out = await pdfParaImagens(files[0], formato, Number(resolucao));
      } else if (convId === 'xlsx2csv') {
        out = await planilhaParaCsv(files[0]);
      } else {
        out = [{ nome: files[0].name.replace(/\.[^.]+$/, '') + '.xlsx', blob: await csvParaPlanilha(files[0]) }];
      }
      setSaidas(out);
      setAviso({ tom: 'ok', texto: `Pronto! ${out.length} arquivo${out.length === 1 ? '' : 's'} gerado${out.length === 1 ? '' : 's'}.` });
    } catch (e) {
      setAviso({ tom: 'erro', texto: (e as Error).message || 'Não consegui converter.' });
    } finally {
      setProc(false);
    }
  }

  function baixar(s: SaidaArquivo) {
    const url = URL.createObjectURL(s.blob);
    urls.current.push(url);
    const a = document.createElement('a');
    a.href = url; a.download = s.nome;
    document.body.appendChild(a); a.click(); a.remove();
  }
  async function baixarZip() {
    if (saidas.length < 2) return;
    baixar(await ziparArquivos(saidas, `${conv.id}-${new Date().toISOString().slice(0, 10)}.zip`));
  }

  return (
    <div className="ferr-wrap larga">
      <div className="ph sobe">
        <div>
          <div className="cob-migalha">Ferramentas</div>
          <h2>Conversor de arquivos</h2>
          <p>Converta entre PDF, imagens e planilhas — tudo no seu navegador, nada sai do computador.</p>
        </div>
      </div>

      <div className="conv-tipos sobe">
        {CONVERSOES.map((c) => (
          <button key={c.id} type="button" className={c.id === convId ? 'conv-tipo on' : 'conv-tipo'} onClick={() => trocarConv(c.id)}>
            <b>{c.titulo}</b>
            <span>{c.desc}</span>
          </button>
        ))}
      </div>

      <div className="ferr-layout sobe">
        {/* ---- ENTRADA ---- */}
        <div className="ferr-col-in">
          <div
            className={arrastando ? 'ferr-drop on' : 'ferr-drop'}
            onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
            onDragLeave={() => setArrastando(false)}
            onDrop={(e) => { e.preventDefault(); setArrastando(false); adicionar(e.dataTransfer.files); }}
            onClick={() => inputRef.current?.click()}
            role="button" tabIndex={0}
          >
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 16V4M8 8l4-4 4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
            </svg>
            <div className="ferr-drop-t"><b>Arraste aqui</b> ou clique para escolher</div>
            <div className="ferr-drop-s">{conv.dica}</div>
            <input ref={inputRef} type="file" accept={conv.accept} multiple={conv.multiplos} hidden
              onChange={(e) => { if (e.target.files) adicionar(e.target.files); e.target.value = ''; }} />
          </div>

          {convId === 'pdf2img' && (
            <CardVidro spot style={{ borderRadius: 'var(--r-card)', marginTop: 12 }}>
              <div className="conv-ops">
                <label className="conv-op"><span>Formato</span><Segmentado opcoes={OPCOES_FORMATO} valor={formato} aoMudar={setFormato} rotulo="Formato da imagem" /></label>
                <label className="conv-op"><span>Resolução</span><Segmentado opcoes={OPCOES_RES} valor={resolucao} aoMudar={setResolucao} rotulo="Resolução" /></label>
              </div>
            </CardVidro>
          )}

          {files.length > 0 && (
            <CardVidro spot style={{ borderRadius: 'var(--r-card)', marginTop: 12 }}>
              <div className="card-cab"><h3>{files.length} arquivo{files.length === 1 ? '' : 's'}</h3>
                <BotaoSec mini onClick={() => { setFiles([]); setSaidas([]); limparUrls(); }}>Limpar</BotaoSec>
              </div>
              <div className="ferr-lista">
                {files.map((f, i) => (
                  <div className="ferr-item" key={f.name + f.size}>
                    <span className="ferr-ord num">{i + 1}</span>
                    <span className="ferr-nm">{f.name}<i className="ferr-nm-pg num">{fmtKB(f.size)}</i></span>
                    <div className="ferr-acoes">
                      <button type="button" className="cm-num-lnk perigo" onClick={() => remover(i)} aria-label="Remover">✕</button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="ferr-rodape">
                <BotaoPrimario onClick={converter} disabled={proc}>{proc ? 'Convertendo…' : 'Converter'}</BotaoPrimario>
              </div>
            </CardVidro>
          )}

          <div className="conv-nota">
            <b>Precisa converter Word/Excel → PDF mantendo a formatação?</b> Esse tipo de conversão exige um servidor
            de conversão (o arquivo sairia do computador) — me avise que a gente vê como ligar.
          </div>
        </div>

        {/* ---- SAÍDA ---- */}
        <div className="ferr-col-out">
          {aviso?.tom === 'erro' && <div className="aviso-inline erro" role="alert">{aviso.texto}</div>}

          {!saidas.length && aviso?.tom !== 'erro' && (
            <CardVidro spot style={{ borderRadius: 'var(--r-card)' }}>
              <EstadoVazio
                titulo={proc ? 'Convertendo…' : 'O resultado aparece aqui'}
                descricao={proc ? 'Processando no seu navegador.' : `Escolha a conversão, solte os arquivos e clique em Converter. (${conv.titulo})`}
              />
            </CardVidro>
          )}

          {saidas.length > 0 && (
            <CardVidro spot style={{ borderRadius: 'var(--r-card)' }}>
              <div className="card-cab">
                <h3>{saidas.length === 1 ? 'Arquivo gerado' : `${saidas.length} arquivos gerados`}</h3>
                {saidas.length > 1 && <BotaoPrimario mini onClick={baixarZip}>Baixar tudo (.zip)</BotaoPrimario>}
              </div>
              <div className="conv-saidas">
                {saidas.map((s, i) => (
                  <div className="conv-saida" key={s.nome + i}>
                    <span className="conv-saida-nm">{s.nome}<i className="ferr-nm-pg num">{fmtKB(s.blob.size)}</i></span>
                    <BotaoSec mini onClick={() => baixar(s)}>Baixar</BotaoSec>
                  </div>
                ))}
              </div>
            </CardVidro>
          )}
        </div>
      </div>
    </div>
  );
}
