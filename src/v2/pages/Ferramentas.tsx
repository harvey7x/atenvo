import { useCallback, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { BadgeStatus, BotaoPrimario, BotaoSec, CardVidro, EstadoVazio } from '../components';
import { unificar, BANCOS_ALVO, type ResultadoUnificacao } from './unificadorLib';
import './ferramentas.css';

const fmtKB = (b: number) => (b < 1024 * 1024 ? `${Math.round(b / 1024)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);

/* dispatcher do módulo Ferramentas (rota /ferramentas/:tool). Hoje só o
   unificador; novas ferramentas entram aqui + no menu do módulo. */
export default function FerramentasV2() {
  const { tool } = useParams();
  if (tool === 'unificador' || !tool) return <UnificadorDocumentos />;
  return (
    <div className="ferr-wrap">
      <div className="ph sobe"><div className="cob-migalha">Ferramentas</div><h2>Ferramenta não encontrada</h2></div>
      <CardVidro spot sobe style={{ borderRadius: 'var(--r-card)' }}>
        <EstadoVazio titulo="Em breve" descricao="Esta ferramenta ainda não existe. Use o Unificador de documentos no menu à esquerda." />
      </CardVidro>
    </div>
  );
}

function UnificadorDocumentos() {
  const [files, setFiles] = useState<File[]>([]);
  const [proc, setProc] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [res, setRes] = useState<ResultadoUnificacao | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const urlRef = useRef<string | null>(null);

  const adicionar = useCallback((lista: FileList | File[]) => {
    const pdfs = [...lista].filter((f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
    if (!pdfs.length) { setErro('Selecione arquivos PDF.'); return; }
    setErro(null); setRes(null);
    setFiles((prev) => {
      const nomes = new Set(prev.map((p) => p.name + p.size));
      return [...prev, ...pdfs.filter((p) => !nomes.has(p.name + p.size))];
    });
  }, []);

  const remover = (i: number) => { setFiles((p) => p.filter((_, k) => k !== i)); setRes(null); };
  const mover = (i: number, d: number) => setFiles((p) => {
    const j = i + d; if (j < 0 || j >= p.length) return p;
    const c = [...p]; [c[i], c[j]] = [c[j], c[i]]; return c;
  });

  async function processar() {
    if (!files.length || proc) return;
    setProc(true); setErro(null); setRes(null);
    try {
      const r = await unificar(files);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = URL.createObjectURL(r.pdf);
      setRes(r);
    } catch (e) { setErro((e as Error).message || 'Falha ao unificar.'); }
    finally { setProc(false); }
  }

  function baixar() {
    if (!res || !urlRef.current) return;
    const a = document.createElement('a');
    a.href = urlRef.current;
    a.download = `historico-unificado-${new Date().toISOString().slice(0, 10)}.pdf`;
    document.body.appendChild(a); a.click(); a.remove();
  }

  return (
    <div className="ferr-wrap">
      <div className="ph sobe">
        <div>
          <div className="cob-migalha">Ferramentas</div>
          <h2>Unificador de documentos</h2>
          <p>Junte vários Históricos de Créditos do INSS num PDF só. Ao unificar, o sistema aponta quais bancos aparecem. Os arquivos não saem do seu computador.</p>
        </div>
      </div>

      <div
        className={arrastando ? 'ferr-drop sobe on' : 'ferr-drop sobe'}
        onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => { e.preventDefault(); setArrastando(false); adicionar(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        role="button" tabIndex={0}
      >
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 16V4M8 8l4-4 4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
        </svg>
        <div className="ferr-drop-t"><b>Arraste os PDFs aqui</b> ou clique para escolher</div>
        <div className="ferr-drop-s">Vários Históricos de Créditos · só PDF</div>
        <input ref={inputRef} type="file" accept="application/pdf,.pdf" multiple hidden
          onChange={(e) => { if (e.target.files) adicionar(e.target.files); e.target.value = ''; }} />
      </div>

      {files.length > 0 && (
        <CardVidro spot sobe style={{ borderRadius: 'var(--r-card)', marginTop: 14 }}>
          <div className="card-cab"><h3>{files.length} arquivo{files.length === 1 ? '' : 's'} na fila</h3>
            <BotaoSec mini onClick={() => { setFiles([]); setRes(null); }}>Limpar</BotaoSec>
          </div>
          <div className="ferr-lista">
            {files.map((f, i) => (
              <div className="ferr-item" key={f.name + f.size}>
                <span className="ferr-ord num">{i + 1}</span>
                <span className="ferr-nm">{f.name}</span>
                <span className="ferr-kb num">{fmtKB(f.size)}</span>
                <div className="ferr-acoes">
                  <button type="button" className="cm-num-lnk" disabled={i === 0} onClick={() => mover(i, -1)} aria-label="Subir">↑</button>
                  <button type="button" className="cm-num-lnk" disabled={i === files.length - 1} onClick={() => mover(i, 1)} aria-label="Descer">↓</button>
                  <button type="button" className="cm-num-lnk perigo" onClick={() => remover(i)} aria-label="Remover">✕</button>
                </div>
              </div>
            ))}
          </div>
          <div className="ferr-rodape">
            <BotaoPrimario onClick={processar} disabled={proc}>{proc ? 'Unificando…' : 'Unificar documentos'}</BotaoPrimario>
          </div>
        </CardVidro>
      )}

      {erro && <div className="aviso-inline erro sobe" role="alert" style={{ marginTop: 12 }}>{erro}</div>}

      {res && (
        <>
          <CardVidro spot sobe style={{ borderRadius: 'var(--r-card)', marginTop: 14 }}>
            <div className="card-cab">
              <h3>Bancos encontrados nos históricos</h3>
              <BotaoPrimario mini onClick={baixar}>Baixar PDF unificado</BotaoPrimario>
            </div>
            <div className="ferr-resumo num">{res.totalPaginas} páginas · {res.arquivos.length} arquivo{res.arquivos.length === 1 ? '' : 's'}</div>
            {res.bancos.length === 0 ? (
              <div className="ferr-nada">Nenhum dos bancos monitorados foi encontrado nestes históricos.</div>
            ) : (
              <div className="ferr-bancos">
                {res.bancos.map((b) => (
                  <div className="ferr-banco on" key={b.id}>
                    <span className="ferr-banco-dot" aria-hidden />
                    <span className="ferr-banco-nm">{b.nome}</span>
                    <span className="ferr-banco-meta num">{b.ocorrencias}× · pág. {b.paginas.slice(0, 6).join(', ')}{b.paginas.length > 6 ? '…' : ''}</span>
                  </div>
                ))}
              </div>
            )}
            {res.ausentes.length > 0 && (
              <div className="ferr-ausentes">
                Não encontrados: {res.ausentes.map((a) => <span key={a.id} className="ferr-ausente">{a.nome}</span>)}
              </div>
            )}
          </CardVidro>

          <CardVidro spot sobe style={{ borderRadius: 'var(--r-card)', marginTop: 12 }}>
            <div className="card-cab"><h3>Por arquivo</h3></div>
            <div className="ferr-lista">
              {res.arquivos.map((a, i) => (
                <div className="ferr-item" key={a.nome + i}>
                  <span className="ferr-ord num">{i + 1}</span>
                  <span className="ferr-nm">{a.nome}<i className="ferr-nm-pg num">{a.paginas} pág.</i></span>
                  <span className="ferr-item-bancos">
                    {a.bancos.length
                      ? a.bancos.map((n) => <BadgeStatus key={n} tom="ok">{n}</BadgeStatus>)
                      : <span className="ferr-kb">nenhum banco-alvo</span>}
                  </span>
                </div>
              ))}
            </div>
          </CardVidro>
        </>
      )}

      <p className="ferr-nota sobe">Bancos monitorados: {BANCOS_ALVO.map((b) => b.nome).join(' · ')}.</p>
    </div>
  );
}
