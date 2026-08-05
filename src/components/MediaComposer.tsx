import { useEffect, useRef, useState } from 'react';
import { Modal } from '@/components/Modal';
import './MediaComposer.css';

export type MediaTipo = 'imagem' | 'video' | 'documento';
interface Props {
  open: boolean;
  onClose: () => void;
  tipo: MediaTipo;
  /** Faz upload + envio real de UM arquivo (deve lançar em falha; não considerar upload concluído como envio). */
  enviar: (file: File, caption: string) => Promise<void>;
  /** Opt-in: pré-visualização da IMAGEM única como card (mídia + faixa de legenda), igual ao histórico. */
  previewCard?: boolean;
}

const ACCEPT: Record<MediaTipo, string> = {
  imagem: 'image/*', video: 'video/*',
  documento: '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};
const LABEL_PL: Record<MediaTipo, string> = { imagem: 'imagens', video: 'vídeos', documento: 'documentos' };
const MAX = 25 * 1024 * 1024;
const fmt = (b: number) => b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(0) + ' KB' : (b / 1048576).toFixed(1) + ' MB';
function validar(tipo: MediaTipo, f: File): string | null {
  if (f.size > MAX) return 'acima de 25 MB';
  if (tipo === 'imagem' && !f.type.startsWith('image/')) return 'não é uma imagem';
  if (tipo === 'video' && !f.type.startsWith('video/')) return 'não é um vídeo';
  return null;
}
const IcDoc = () => <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></svg>;

interface Item { file: File; url: string | null }
const chaveItem = (f: File) => `${f.name}::${f.size}::${f.lastModified}`;

export function MediaComposer({ open, onClose, tipo, enviar, previewCard }: Props) {
  const [items, setItems] = useState<Item[]>([]);
  const [caption, setCaption] = useState('');
  const [estado, setEstado] = useState<'idle' | 'sending' | 'error'>('idle');
  const [progresso, setProgresso] = useState<{ feito: number; total: number } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // limpa object URLs vivos ao fechar (evita vazamento)
  useEffect(() => {
    if (open) return;
    setItems((cur) => { cur.forEach((i) => { if (i.url) URL.revokeObjectURL(i.url); }); return []; });
    setCaption(''); setEstado('idle'); setProgresso(null); setErro(null); setDrag(false); setLightbox(null);
  }, [open]);

  function adicionar(lista?: FileList | File[] | null) {
    if (!lista || !lista.length) return;
    const invalidos: string[] = [];
    setItems((cur) => {
      const vistos = new Set(cur.map((i) => chaveItem(i.file)));
      const novos: Item[] = [];
      for (const f of Array.from(lista)) {
        const v = validar(tipo, f);
        if (v) { invalidos.push(`${f.name} (${v})`); continue; }
        if (vistos.has(chaveItem(f))) continue;   // dedup
        vistos.add(chaveItem(f));
        const previewavel = tipo === 'imagem' || tipo === 'video';
        novos.push({ file: f, url: previewavel ? URL.createObjectURL(f) : null });
      }
      return novos.length ? [...cur, ...novos] : cur;
    });
    setErro(invalidos.length ? `Ignorado(s): ${invalidos.join(', ')}.` : null);
    if (estado === 'error') setEstado('idle');
  }
  function remover(idx: number) {
    setItems((cur) => { const alvo = cur[idx]; if (alvo?.url) URL.revokeObjectURL(alvo.url); return cur.filter((_, i) => i !== idx); });
    setEstado('idle'); setErro(null);
  }
  async function onEnviar() {
    if (!items.length || estado === 'sending') return;   // trava clique-duplo
    setEstado('sending'); setErro(null);
    const total = items.length;
    // envia em ORDEM; a legenda acompanha só o 1º item (padrão álbum). Remove do estado
    // conforme cada um confirma, para que um retry após falha parcial só reenvie o que faltou.
    for (let i = 0; i < total; i++) {
      setProgresso({ feito: i, total });
      const atual = items[i];
      try {
        await enviar(atual.file, i === 0 ? caption : '');
      } catch (e) {
        setEstado('error'); setProgresso(null);
        setErro(`Falhou em "${atual.file.name}": ${(e as Error).message || 'erro ao enviar'}. ${i} de ${total} enviado(s).`);
        // descarta os já enviados (0..i-1); mantém o que falhou e os seguintes para retry
        setItems((cur) => { cur.slice(0, i).forEach((it) => { if (it.url) URL.revokeObjectURL(it.url); }); return cur.slice(i); });
        setCaption(i === 0 ? caption : '');   // se o 1º já foi, a legenda dele já foi junto
        return;
      }
    }
    setProgresso(null);
    onClose();   // todos enviados
  }

  const multi = items.length > 1;
  const cardImgUnico = !!previewCard && tipo === 'imagem' && items.length === 1;
  const unico = items.length === 1 && !multi;
  const tituloTipo = tipo === 'imagem' ? 'imagem' : tipo === 'video' ? 'vídeo' : 'documento';
  const enviandoLabel = progresso ? `Enviando ${progresso.feito + 1} de ${progresso.total}…` : 'Enviando…';

  return (
    <Modal open={open} onClose={() => { if (estado !== 'sending') onClose(); }} closeOnBackdrop={estado !== 'sending'} width={460}
      title={`Enviar ${tituloTipo}${items.length > 1 ? 's' : ''}`}
      footer={<>
        <span style={{ marginRight: 'auto', fontSize: 13, color: estado === 'error' ? 'var(--err)' : 'var(--muted)' }}>
          {estado === 'sending' ? enviandoLabel : estado === 'error' ? 'Falhou — tente novamente' : items.length ? `${items.length} pronto(s) para enviar` : ''}
        </span>
        <button className="atv-btn" disabled={estado === 'sending'} onClick={onClose}>Cancelar</button>
        <button className="atv-btn primary" disabled={!items.length || estado === 'sending'} onClick={onEnviar}>
          {estado === 'sending' ? enviandoLabel : estado === 'error' ? 'Tentar novamente' : `Enviar${items.length > 1 ? ` (${items.length})` : ''}`}
        </button>
      </>}>
      <input ref={inputRef} type="file" multiple accept={ACCEPT[tipo]} style={{ display: 'none' }}
        onChange={(e) => { adicionar(e.target.files); if (e.target) e.target.value = ''; }} />

      {!items.length ? (
        <div className={'media-drop' + (drag ? ' over' : '')} role="button" tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); adicionar(e.dataTransfer.files); }}>
          <strong>Clique para selecionar</strong> ou arraste {tipo === 'documento' ? 'os' : 'as'} {LABEL_PL[tipo]} aqui
          <div className="media-drop-hint">Pode selecionar vários · até 25 MB cada</div>
        </div>
      ) : unico ? (
        // ---- preview rico de arquivo ÚNICO (mantém a experiência original) ----
        <div>
          {cardImgUnico && items[0].url ? (
            <div className="media-prev-card">
              <img className="media-prev-img-top" src={items[0].url} alt={items[0].file.name} onClick={() => setLightbox(items[0].url)} title="Ampliar" />
              <div className="media-prev-band">
                <textarea className="media-prev-cap" disabled={estado === 'sending'} placeholder="Legenda (opcional)" value={caption} onChange={(e) => setCaption(e.target.value)} />
              </div>
            </div>
          ) : (
            <>
              {tipo === 'imagem' && items[0].url && <img className="media-prev-img" src={items[0].url} alt={items[0].file.name} onClick={() => setLightbox(items[0].url)} title="Ampliar" />}
              {tipo === 'video' && items[0].url && <video className="media-prev-vid" src={items[0].url} controls preload="metadata" />}
              {tipo === 'documento' && <div className="media-doc-card"><IcDoc /><div style={{ minWidth: 0 }}><div className="media-doc-nome">{items[0].file.name}</div><small>{(items[0].file.name.split('.').pop() || '').toUpperCase()}{' · '}{fmt(items[0].file.size)}</small></div></div>}
            </>
          )}
          <div className="media-actions">
            <span className="media-meta" title={items[0].file.name}>{items[0].file.name} · {fmt(items[0].file.size)}</span>
            <button type="button" className="atv-btn" disabled={estado === 'sending'} onClick={() => inputRef.current?.click()}>Adicionar</button>
            <button type="button" className="atv-btn" disabled={estado === 'sending'} onClick={() => remover(0)}>Remover</button>
          </div>
          {!cardImgUnico && (
            <textarea className="atv-textarea" disabled={estado === 'sending'}
              placeholder={tipo === 'documento' ? 'Texto para enviar junto (opcional)' : 'Legenda (opcional)'}
              value={caption} onChange={(e) => setCaption(e.target.value)} />
          )}
        </div>
      ) : (
        // ---- grade de VÁRIOS arquivos ----
        <div>
          <div className="media-grid">
            {items.map((it, i) => (
              <div className="media-tile" key={chaveItem(it.file) + i} title={it.file.name}>
                {tipo === 'imagem' && it.url
                  ? <img src={it.url} alt={it.file.name} onClick={() => setLightbox(it.url)} />
                  : tipo === 'video' && it.url
                    ? <video src={it.url} preload="metadata" muted />
                    : <div className="media-tile-doc"><IcDoc /><span>{(it.file.name.split('.').pop() || '').toUpperCase()}</span></div>}
                <span className="media-tile-nome">{it.file.name}</span>
                {estado !== 'sending' && <button type="button" className="media-tile-rm" aria-label={`Remover ${it.file.name}`} onClick={() => remover(i)}>×</button>}
              </div>
            ))}
            {estado !== 'sending' && (
              <button type="button" className="media-tile media-tile-add" onClick={() => inputRef.current?.click()} aria-label="Adicionar mais">
                <span>＋</span><small>Adicionar</small>
              </button>
            )}
          </div>
          <textarea className="atv-textarea" disabled={estado === 'sending'}
            placeholder={tipo === 'documento' ? 'Texto para enviar junto (vai no 1º item, opcional)' : 'Legenda (vai na 1ª mídia, opcional)'}
            value={caption} onChange={(e) => setCaption(e.target.value)} />
        </div>
      )}

      {erro && <div className="atv-field-err" style={{ marginTop: 8 }}>{erro}</div>}
      {lightbox && tipo === 'imagem' && (
        <div className="atv-lightbox" onClick={() => setLightbox(null)} role="dialog" aria-modal="true">
          <button className="atv-lightbox-close" aria-label="Fechar" onClick={() => setLightbox(null)}>×</button>
          <img src={lightbox} alt="" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </Modal>
  );
}
