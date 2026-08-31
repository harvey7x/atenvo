import { useCallback, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { BadgeStatus, BotaoPrimario, BotaoSec, CardVidro, EstadoVazio, Toggle } from '../components';
import { unificar, BANCOS_ALVO, type ArquivoInfo, type ResultadoUnificacao } from './unificadorLib';
import { ConversorArquivos } from './Conversor';
import './ferramentas.css';

const fmtKB = (b: number) => (b < 1024 * 1024 ? `${Math.round(b / 1024)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);
const fmtBRL = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/* Ordem do download = ordem dos períodos (mais recente → mais antigo):
   "historico-creditos.pdf" (sem número) primeiro, depois (1), (2), (3)… */
const ordemBaixa = (nome: string): number => {
  const m = nome.match(/\((\d+)\)\s*\.[^.]+$/);
  return m ? Number(m[1]) : 0;
};
const ordenarFila = (arr: File[]): File[] =>
  [...arr].sort((a, b) => ordemBaixa(a.name) - ordemBaixa(b.name) || a.name.localeCompare(b.name, 'pt', { numeric: true }));
const compKey = (c: string | null) => (c ? c.slice(3) + c.slice(0, 2) : ''); // "MM/YYYY" → "YYYYMM"

interface GrupoBenef {
  chave: string; nome: string | null; nb: string | null; cpf: string | null; especie: string | null;
  arquivos: ArquivoInfo[]; bancos: string[]; consignado: number | null; competencia: string | null;
}

/* dispatcher do módulo Ferramentas (rota /ferramentas/:tool) */
export default function FerramentasV2() {
  const { tool } = useParams();
  if (tool === 'unificador' || !tool) return <UnificadorDocumentos />;
  if (tool === 'conversor') return <ConversorArquivos />;
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
  const [identificarBancos, setIdentificarBancos] = useState(false);
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
      return ordenarFila([...prev, ...pdfs.filter((p) => !nomes.has(p.name + p.size))]);
    });
  }, []);

  const remover = (i: number) => { setFiles((p) => p.filter((_, k) => k !== i)); setRes(null); };
  const mover = (i: number, d: number) => setFiles((p) => {
    const j = i + d; if (j < 0 || j >= p.length) return p;
    const c = [...p]; [c[i], c[j]] = [c[j], c[i]]; return c;
  });

  // agrupa por beneficiário (NB): históricos são fatiados por período, o
  // mesmo cliente vem em vários PDFs. Consignado do grupo = competência mais recente.
  const grupos = useMemo<GrupoBenef[]>(() => {
    if (!res) return [];
    const m = new Map<string, GrupoBenef>();
    for (const a of res.arquivos) {
      const chave = a.nb || a.beneficiario || a.nome;
      const g = m.get(chave) ?? { chave, nome: a.beneficiario, nb: a.nb, cpf: a.cpf, especie: a.especie, arquivos: [], bancos: [], consignado: null, competencia: null };
      g.arquivos.push(a);
      g.nome ||= a.beneficiario; g.cpf ||= a.cpf; g.especie ||= a.especie;
      for (const b of a.bancos) if (!g.bancos.includes(b)) g.bancos.push(b);
      if (a.consignadoMes != null && a.competenciaMes && compKey(a.competenciaMes) > compKey(g.competencia)) {
        g.competencia = a.competenciaMes; g.consignado = a.consignadoMes;
      }
      m.set(chave, g);
    }
    return [...m.values()];
  }, [res]);
  const consignadoTotal = useMemo(() => grupos.reduce((s, g) => s + (g.consignado ?? 0), 0), [grupos]);

  async function processar() {
    if (!files.length || proc) return;
    setProc(true); setErro(null); setRes(null);
    try {
      const r = await unificar(files, identificarBancos);
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
    const base = res.identificarBancos ? 'historico-unificado' : 'documentos-unificado';
    a.download = `${base}-${new Date().toISOString().slice(0, 10)}.pdf`;
    document.body.appendChild(a); a.click(); a.remove();
  }

  const trocarIdent = (v: boolean) => { setIdentificarBancos(v); setRes(null); setErro(null); };
  const comBancos = res?.identificarBancos === true;   // resultado tem análise de bancos/beneficiário

  const semTexto = res ? res.arquivos.filter((a) => !a.textoLido).length : 0;

  return (
    <div className="ferr-wrap larga">
      <div className="ph sobe">
        <div>
          <div className="cob-migalha">Ferramentas</div>
          <h2>Unificador de documentos</h2>
          <p>Junte vários PDFs de qualquer tipo num arquivo só. Nada sai do seu computador.</p>
        </div>
      </div>

      <div className="ferr-modo sobe">
        <label className="ferr-modo-toggle">
          <Toggle ligado={identificarBancos} aoMudar={trocarIdent} rotulo="Identificar bancos" />
          <span><b>Identificar bancos</b> <span className="ferr-modo-dica">— ligue quando forem Históricos de Créditos do INSS: além de unir, aponta os bancos e resume por beneficiário.</span></span>
        </label>
      </div>

      <div className="ferr-layout sobe">
        {/* ---- coluna de ENTRADA ---- */}
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
            <div className="ferr-drop-t"><b>Arraste os PDFs aqui</b> ou clique para escolher</div>
            <div className="ferr-drop-s">Qualquer PDF · vários arquivos</div>
            <input ref={inputRef} type="file" accept="application/pdf,.pdf" multiple hidden
              onChange={(e) => { if (e.target.files) adicionar(e.target.files); e.target.value = ''; }} />
          </div>

          {files.length > 0 && (
            <CardVidro spot style={{ borderRadius: 'var(--r-card)', marginTop: 12 }}>
              <div className="card-cab"><h3>{files.length} arquivo{files.length === 1 ? '' : 's'} na fila</h3>
                <BotaoSec mini onClick={() => { setFiles([]); setRes(null); }}>Limpar</BotaoSec>
              </div>
              <div className="ferr-ordhint">Ordenados do mais recente ao mais antigo (sequência de download). Setas ajustam.</div>
              <div className="ferr-lista">
                {files.map((f, i) => (
                  <div className="ferr-item" key={f.name + f.size}>
                    <span className="ferr-ord num">{i + 1}</span>
                    <span className="ferr-nm">{f.name}<i className="ferr-nm-pg num">{fmtKB(f.size)}</i></span>
                    <div className="ferr-acoes">
                      <button type="button" className="cm-num-lnk" disabled={i === 0} onClick={() => mover(i, -1)} aria-label="Subir">↑</button>
                      <button type="button" className="cm-num-lnk" disabled={i === files.length - 1} onClick={() => mover(i, 1)} aria-label="Descer">↓</button>
                      <button type="button" className="cm-num-lnk perigo" onClick={() => remover(i)} aria-label="Remover">✕</button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="ferr-rodape">
                <BotaoPrimario onClick={processar} disabled={proc}>{proc ? 'Processando…' : 'Unificar documentos'}</BotaoPrimario>
              </div>
            </CardVidro>
          )}

          {identificarBancos && (
            <div className="ferr-monit">
              <div className="ferr-monit-t">Bancos monitorados</div>
              <div className="ferr-monit-chips">{BANCOS_ALVO.map((b) => <span key={b.id} className="ferr-monit-chip">{b.nome}</span>)}</div>
            </div>
          )}
        </div>

        {/* ---- coluna de ANÁLISE ---- */}
        <div className="ferr-col-out">
          {erro && <div className="aviso-inline erro" role="alert">{erro}</div>}

          {!res && !erro && (
            <CardVidro spot style={{ borderRadius: 'var(--r-card)' }}>
              <EstadoVazio
                titulo={proc ? (identificarBancos ? 'Lendo os documentos…' : 'Unindo os PDFs…') : 'O resultado aparece aqui'}
                descricao={proc ? (identificarBancos ? 'Juntando os PDFs e identificando os bancos.' : 'Juntando os PDFs num arquivo só.')
                  : identificarBancos
                    ? 'Selecione os Históricos de Créditos à esquerda e clique em Unificar documentos. Vamos gerar o PDF único, apontar os bancos e resumir por beneficiário.'
                    : 'Selecione os PDFs à esquerda e clique em Unificar documentos. Vamos gerar um PDF único com todos eles.'}
              />
            </CardVidro>
          )}

          {res && (
            <>
              <div className="ferr-kpis">
                <div className="ferr-kpi"><span className="ferr-kpi-r">Arquivos</span><b className="num">{res.arquivos.length}</b></div>
                <div className="ferr-kpi"><span className="ferr-kpi-r">Páginas</span><b className="num">{res.totalPaginas}</b></div>
                {comBancos && <div className="ferr-kpi"><span className="ferr-kpi-r">Beneficiários</span><b className="num">{grupos.length}</b></div>}
                {comBancos && <div className="ferr-kpi"><span className="ferr-kpi-r">Bancos encontrados</span><b className="num" style={{ color: res.bancos.length ? 'var(--verde)' : undefined }}>{res.bancos.length}</b></div>}
                {comBancos && <div className="ferr-kpi"><span className="ferr-kpi-r">Consignado no mês</span><b className="num">{fmtBRL(consignadoTotal)}</b></div>}
              </div>

              {(res.falhas.length > 0 || (comBancos && semTexto > 0)) && (
                <div className="ferr-avisos">
                  {res.falhas.map((f) => <div key={f.nome} className="ferr-falhas"><span className="ferr-falha">✕ {f.nome} — {f.motivo}</span></div>)}
                  {comBancos && semTexto > 0 && <div className="ferr-falhas aviso"><span>⚠ {semTexto} arquivo(s) sem texto legível (PDF escaneado/protegido) — a detecção pode estar incompleta.</span></div>}
                </div>
              )}

              {/* modo simples (só unir): lista os documentos que entraram no PDF */}
              {!comBancos && (
                <CardVidro spot style={{ borderRadius: 'var(--r-card)', marginTop: 12 }}>
                  <div className="card-cab">
                    <h3>Documentos unidos</h3>
                    <BotaoPrimario mini onClick={baixar}>Baixar PDF unificado</BotaoPrimario>
                  </div>
                  <div className="ferr-docs">
                    {res.arquivos.map((a, i) => (
                      <div className="ferr-doc" key={a.nome + i}>
                        <div className="ferr-doc-top">
                          <span className="ferr-doc-nm"><span className="ferr-doc-ord num">{i + 1}.</span> {a.nome}</span>
                          <span className="ferr-doc-pg num">{a.paginas} pág.</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardVidro>
              )}

              {/* "Identificar bancos" ligado (Histórico de Créditos): bancos + resumo por beneficiário */}
              {comBancos && (
              <CardVidro spot style={{ borderRadius: 'var(--r-card)', marginTop: 12 }}>
                <div className="card-cab">
                  <h3>Bancos encontrados</h3>
                  <BotaoPrimario mini onClick={baixar}>Baixar PDF unificado</BotaoPrimario>
                </div>
                {res.bancos.length === 0 ? (
                  <div className="ferr-nada">Nenhum dos bancos monitorados foi encontrado nestes históricos.</div>
                ) : (
                  <div className="ferr-bancos">
                    {res.bancos.map((b) => (
                      <div className="ferr-banco on" key={b.id}>
                        <span className="ferr-banco-dot" aria-hidden />
                        <span className="ferr-banco-nm">{b.nome}</span>
                        <span className="ferr-banco-meta num">{b.ocorrencias}× · pág. {b.paginas.slice(0, 8).join(', ')}{b.paginas.length > 8 ? '…' : ''}</span>
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
              )}

              {comBancos && (
              <CardVidro spot style={{ borderRadius: 'var(--r-card)', marginTop: 12 }}>
                <div className="card-cab"><h3>Beneficiários</h3><span className="ferr-kb">{grupos.length} · {res.arquivos.length} histórico{res.arquivos.length === 1 ? '' : 's'}</span></div>
                <div className="ferr-benefs">
                  {grupos.map((g) => (
                    <div className="ferr-benef" key={g.chave}>
                      <div className="ferr-benef-top">
                        <span className="ferr-benef-nm">{g.nome ?? (g.nb ? `NB ${g.nb}` : g.chave)}</span>
                        {g.consignado != null && (
                          <span className="ferr-benef-val"><i>Consignado{g.competencia ? ` ${g.competencia}` : ''}</i><b className="num">{fmtBRL(g.consignado)}</b></span>
                        )}
                      </div>
                      <div className="ferr-benef-meta num">
                        {g.nb ? `NB ${g.nb}` : ''}{g.cpf ? `${g.nb ? ' · ' : ''}CPF ${g.cpf}` : ''}
                      </div>
                      {g.especie && <div className="ferr-benef-esp">{g.especie}</div>}
                      <div className="ferr-benef-bancos">
                        {g.bancos.length ? g.bancos.map((n) => <BadgeStatus key={n} tom="ok">{n}</BadgeStatus>) : <span className="ferr-kb">nenhum banco-alvo</span>}
                      </div>
                      <div className="ferr-benef-hists">
                        {g.arquivos.map((a, i) => (
                          <div className="ferr-hist" key={a.nome + i}>
                            <span className="ferr-hist-per num">{a.periodo ?? a.nome}</span>
                            <span className="ferr-hist-meta num">{a.paginas} pág.{!a.textoLido ? ' · texto não lido' : ''}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </CardVidro>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
