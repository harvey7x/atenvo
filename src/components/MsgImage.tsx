import { useEffect, useState, type ReactNode } from 'react';
import { urlAssinadaMidiaWa } from '@/data/whatsapp';
import { WhatsAppText } from '@/components/WhatsAppText';

const IcImgOff = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="4" width="18" height="16" rx="2.4" /><path d="m3 17 5-5 3 3" /><circle cx="8.5" cy="9.5" r="1.3" /><path d="m21 21-18-18" />
  </svg>
);

/** Imagem do histórico com estados explícitos: carregando / carregada / indisponível.
 *  Resolve a URL assinada sob demanda (renovável no "Tentar novamente"). Não persiste URL,
 *  não envia nada e não altera o dado — apenas exibe. */
export function MsgImage({ path, nome, caption, metaNode, falhou, onOpen, acaoNode }: {
  path: string; nome?: string | null; caption?: string; metaNode?: ReactNode; falhou?: boolean; onOpen: (url: string) => void;
  /** ação sobreposta à imagem (ex.: baixar) — fica dentro do frame, canto inferior direito. */
  acaoNode?: ReactNode;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [estado, setEstado] = useState<'loading' | 'ok' | 'erro'>('loading');

  async function resolver() {
    setEstado('loading');
    const u = await urlAssinadaMidiaWa(path).catch(() => null);
    if (!u) { setUrl(null); setEstado('erro'); return; }
    setUrl(u); // o estado vira 'ok' no onLoad da <img> (ou 'erro' no onError)
  }

  useEffect(() => {
    let vivo = true;
    (async () => {
      setEstado('loading'); setUrl(null);
      const u = await urlAssinadaMidiaWa(path).catch(() => null);
      if (!vivo) return;
      if (!u) { setEstado('erro'); return; }
      setUrl(u);
    })();
    return () => { vivo = false; };
  }, [path]);

  return (
    <div className={'media-card bubble-img' + (falhou ? ' media-falha' : '')}>
      {estado === 'erro' ? (
        <div className="msg-img-fallback" role="img" aria-label={'Imagem indisponível' + (nome ? ': ' + nome : '')}>
          <IcImgOff />
          <span className="mif-txt">Imagem indisponível</span>
          {nome && <span className="mif-nome" title={nome}>{nome}</span>}
          <button type="button" className="mif-retry" onClick={resolver}>Tentar novamente</button>
        </div>
      ) : url ? (
        <div className="media-frame">
          <img
            className="msg-img" src={url} alt={nome || 'imagem'} loading="lazy"
            onLoad={() => setEstado('ok')} onError={() => setEstado('erro')}
            onClick={() => onOpen(url)} title="Ampliar"
          />
          {estado === 'ok' && acaoNode}
        </div>
      ) : (
        <div className="msg-img-ph" role="status">Carregando imagem…</div>
      )}
      {caption && <div className="media-cap"><div className="media-cap-text"><WhatsAppText text={caption} /></div>{metaNode}</div>}
    </div>
  );
}
