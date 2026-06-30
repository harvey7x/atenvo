import { useEffect, useState, type ReactNode } from 'react';
import { urlAssinadaMidiaWa } from '@/data/whatsapp';

/** Vídeo do histórico com estados explícitos: carregando / pronto / indisponível.
 *  URL assinada sob demanda (renovável no "Tentar novamente"); preload='metadata' não baixa o vídeo
 *  inteiro — só ao dar play. Não persiste URL nem altera o dado. */
export function MsgVideo({ path, nome, caption, metaNode, falhou }: {
  path: string; nome?: string | null; caption?: string; metaNode?: ReactNode; falhou?: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [estado, setEstado] = useState<'loading' | 'ok' | 'erro'>('loading');

  async function resolver() {
    setEstado('loading'); setUrl(null);
    const u = await urlAssinadaMidiaWa(path).catch(() => null);
    if (!u) { setEstado('erro'); return; }
    setUrl(u); setEstado('ok');
  }
  useEffect(() => {
    let vivo = true;
    (async () => {
      setEstado('loading'); setUrl(null);
      const u = await urlAssinadaMidiaWa(path).catch(() => null);
      if (!vivo) return;
      if (!u) { setEstado('erro'); return; }
      setUrl(u); setEstado('ok');
    })();
    return () => { vivo = false; };
  }, [path]);

  return (
    <div className={'media-card bubble-img' + (falhou ? ' media-falha' : '')}>
      {estado === 'erro' ? (
        <div className="msg-img-fallback" role="img" aria-label={'Vídeo indisponível' + (nome ? ': ' + nome : '')}>
          <span className="mif-txt">Vídeo indisponível</span>
          <button type="button" className="mif-retry" onClick={resolver}>Tentar novamente</button>
        </div>
      ) : url ? (
        <video className="msg-video" src={url} controls preload="metadata" style={{ maxWidth: '100%', borderRadius: 10, display: 'block' }} />
      ) : (
        <div className="msg-img-ph" role="status">Carregando vídeo…</div>
      )}
      {caption && <div className="media-cap"><div className="media-cap-text">{caption}</div>{metaNode}</div>}
    </div>
  );
}
