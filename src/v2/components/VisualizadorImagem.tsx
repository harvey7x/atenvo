import { useEffect, useRef, useState } from 'react';
import { melhorarImagem, sugerirModo, type ModoImagem } from '../lib/imagemMelhor';
import { Segmentado } from './Segmentado';
import './componentes.css';

/* Visualizador (lightbox) de imagem da conversa.
   Abre SEMPRE a imagem como o cliente mandou. O botão "Melhorar qualidade" gera uma cópia melhorada
   no navegador e mostra ANTES × DEPOIS lado a lado; o atendente decide qual baixar.
   O ORIGINAL nunca é alterado. */

type Ajuste = Exclude<ModoImagem, 'original'>;
type Versao = { url: string; blob: Blob };

function baixarBlob(blob: Blob, nome: string) {
  const a = document.createElement('a'); const u = URL.createObjectURL(blob);
  a.href = u; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 4000);
}

export function VisualizadorImagem({ url, nome, aoFechar }: { url: string; nome?: string; aoFechar: () => void }) {
  const [comparando, setComparando] = useState(false);
  const [ajuste, setAjuste] = useState<Ajuste | null>(null);      // null até a sugestão automática chegar
  const [versoes, setVersoes] = useState<Partial<Record<Ajuste, Versao>>>({});
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const urlsRef = useRef<string[]>([]);
  const base = (nome || 'imagem').replace(/\.[a-z0-9]+$/i, '');

  useEffect(() => () => { urlsRef.current.forEach((u) => URL.revokeObjectURL(u)); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') aoFechar(); };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [aoFechar]);

  // 1º clique em "Melhorar qualidade": escolhe sozinho entre documento e foto (o atendente pode trocar)
  useEffect(() => {
    if (!comparando || ajuste) return;
    let vivo = true;
    setProcessando(true);
    sugerirModo(url).then((m) => { if (vivo) setAjuste(m); }).catch(() => { if (vivo) setAjuste('foto'); });
    return () => { vivo = false; };
  }, [comparando, ajuste, url]);

  useEffect(() => {
    if (!comparando || !ajuste) return;
    if (versoes[ajuste]) { setProcessando(false); return; }
    let vivo = true;
    setProcessando(true); setErro(null);
    melhorarImagem(url, ajuste)
      .then(({ blob }) => {
        if (!vivo) return;
        const u = URL.createObjectURL(blob); urlsRef.current.push(u);
        setProcessando(false);
        setVersoes((v) => ({ ...v, [ajuste]: { url: u, blob } }));
      })
      .catch(() => { if (vivo) { setProcessando(false); setErro('Não deu pra melhorar esta imagem.'); } });
    return () => { vivo = false; };
  }, [comparando, ajuste, url, versoes]);

  const melhorada = ajuste ? versoes[ajuste] ?? null : null;

  async function baixarOriginal() {
    try {
      const blob = await (await fetch(url)).blob();
      const ext = (blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
      baixarBlob(blob, `${base}.${ext}`);
    } catch { window.open(url, '_blank', 'noopener'); }
  }
  function baixarMelhorada() {
    if (melhorada) baixarBlob(melhorada.blob, `${base}_melhorada.jpg`);
  }

  return (
    <div className="veu vimg" role="dialog" aria-modal aria-label="Imagem" style={{ background: 'rgba(5, 6, 9, .97)', backdropFilter: 'none' /* vence o .veu da pele Aurora: foto pede fundo escuro e opaco nos 2 temas (o véu translúcido deixava a conversa aparecer atrás) */ }} onMouseDown={(e) => { if (e.target === e.currentTarget) aoFechar(); }}>
      <div className="vimg-barra" onMouseDown={(e) => e.stopPropagation()}>
        {!comparando ? (
          <>
            <button type="button" className="p-btn btn-pri btn-mini" onClick={() => setComparando(true)} title="Gera uma versão melhorada e mostra lado a lado com a original">Melhorar qualidade</button>
            <button type="button" className="p-btn btn-sec btn-mini" onClick={baixarOriginal}>Baixar</button>
          </>
        ) : (
          <>
            <button type="button" className="p-btn btn-sec btn-mini" onClick={() => setComparando(false)}>← Voltar</button>
            {ajuste && (
              <Segmentado<Ajuste>
                rotulo="Tipo de ajuste" valor={ajuste} aoMudar={setAjuste}
                opcoes={[{ valor: 'documento', rotulo: 'Documento' }, { valor: 'foto', rotulo: 'Foto' }]}
              />
            )}
          </>
        )}
        <button type="button" className="p-btn btn-mini vimg-x" aria-label="Fechar" onClick={aoFechar}>×</button>
      </div>

      {!comparando ? (
        <div className="vimg-palco" onMouseDown={(e) => { if (e.target === e.currentTarget) aoFechar(); }}>
          <img src={url} alt="Imagem ampliada" className="vimg-img" />
        </div>
      ) : (
        <div className="vimg-comparar" onMouseDown={(e) => { if (e.target === e.currentTarget) aoFechar(); }}>
          <figure className="vimg-lado">
            <figcaption>Antes <span>· como o cliente enviou</span></figcaption>
            <div className="vimg-moldura"><img src={url} alt="Imagem original" className="vimg-img" /></div>
            <button type="button" className="p-btn btn-sec btn-mini" onClick={baixarOriginal}>Baixar original</button>
          </figure>
          <figure className="vimg-lado">
            <figcaption>Depois <span>· {ajuste === 'documento' ? 'papel branco, texto escuro, sem sombra' : 'brilho, cor e nitidez ajustados'}</span></figcaption>
            <div className="vimg-moldura">
              {melhorada && <img src={melhorada.url} alt="Imagem melhorada" className={'vimg-img' + (processando ? ' esmaecida' : '')} />}
              {processando && <span className="vimg-status">Melhorando…</span>}
              {erro && !processando && <span className="vimg-status vimg-erro">{erro}</span>}
            </div>
            <button type="button" className="p-btn btn-pri btn-mini" onClick={baixarMelhorada} disabled={!melhorada || processando}>Baixar melhorada</button>
          </figure>
        </div>
      )}

      <div className="vimg-rodape">
        {comparando ? 'Nenhum detalhe é inventado: só realça o que a foto já tem.' : 'Imagem como o cliente enviou.'}
        {' '}<span className="vimg-meta">O original fica guardado sem alteração.</span>
      </div>
    </div>
  );
}
