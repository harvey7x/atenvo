import { useEffect, useRef, useState } from 'react';
import { Modal } from '@/components/Modal';
import './MediaComposer.css';

export type MediaTipo = 'imagem' | 'video' | 'documento';
interface Props {
  open: boolean;
  onClose: () => void;
  tipo: MediaTipo;
  /** Faz upload + envio real (deve lançar em falha; não considerar upload concluído como envio). */
  enviar: (file: File, caption: string) => Promise<void>;
  /** Opt-in: pré-visualização da IMAGEM como card (mídia + faixa de legenda), igual ao histórico. */
  previewCard?: boolean;
}

const ACCEPT: Record<MediaTipo, string> = {
  imagem: 'image/*', video: 'video/*',
  documento: '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};
const LABEL: Record<MediaTipo, string> = { imagem: 'imagem', video: 'vídeo', documento: 'documento' };
const MAX = 25 * 1024 * 1024;
const fmt = (b: number) => b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(0) + ' KB' : (b / 1048576).toFixed(1) + ' MB';
function validar(tipo: MediaTipo, f: File): string | null {
  if (f.size > MAX) return 'Arquivo acima de 25 MB.';
  if (tipo === 'imagem' && !f.type.startsWith('image/')) return 'Selecione um arquivo de imagem.';
  if (tipo === 'video' && !f.type.startsWith('video/')) return 'Selecione um arquivo de vídeo.';
  return null;
}
const IcDoc = () => <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></svg>;

export function MediaComposer({ open, onClose, tipo, enviar, previewCard }: Props) {
  const cardImg = !!previewCard && tipo === 'imagem';
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [estado, setEstado] = useState<'idle' | 'sending' | 'error'>('idle');
  const [erro, setErro] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) return;
    setFile(null); setUrl((u) => { if (u) URL.revokeObjectURL(u); return null; }); setCaption(''); setEstado('idle'); setErro(null); setDrag(false); setLightbox(false);
  }, [open]);

  function escolher(f?: File | null) {
    if (!f) return;
    const v = validar(tipo, f); if (v) { setErro(v); return; }
    setErro(null); setUrl((u) => { if (u) URL.revokeObjectURL(u); return URL.createObjectURL(f); }); setFile(f); setEstado('idle');
  }
  function remover() { setUrl((u) => { if (u) URL.revokeObjectURL(u); return null; }); setFile(null); setEstado('idle'); setErro(null); }
  async function onEnviar() {
    if (!file || estado === 'sending') return;          // trava clique-duplo
    setEstado('sending'); setErro(null);
    try { await enviar(file, caption); onClose(); }      // sucesso real (lança em falha) -> fecha
    catch (e) { setEstado('error'); setErro((e as Error).message || 'Falha ao enviar.'); } // mantém o arquivo p/ retry
  }
  const ext = (file?.name.split('.').pop() || '').toUpperCase();

  return (
    <Modal open={open} onClose={() => { if (estado !== 'sending') onClose(); }} closeOnBackdrop={estado !== 'sending'} width={460}
      title={`Enviar ${tipo === 'imagem' ? 'imagem' : tipo === 'video' ? 'vídeo' : 'documento'}`}
      footer={<>
        <span style={{ marginRight: 'auto', fontSize: 13, color: estado === 'error' ? 'var(--err)' : 'var(--muted)' }}>
          {estado === 'sending' ? 'Enviando…' : estado === 'error' ? 'Falhou — tente novamente' : file ? 'Pronto para enviar' : ''}
        </span>
        <button className="atv-btn" disabled={estado === 'sending'} onClick={onClose}>Cancelar</button>
        <button className="atv-btn primary" disabled={!file || estado === 'sending'} onClick={onEnviar}>{estado === 'sending' ? 'Enviando…' : estado === 'error' ? 'Tentar novamente' : 'Enviar'}</button>
      </>}>
      <input ref={inputRef} type="file" accept={ACCEPT[tipo]} style={{ display: 'none' }} onChange={(e) => escolher(e.target.files?.[0])} />

      {!file ? (
        <div className={'media-drop' + (drag ? ' over' : '')} role="button" tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); escolher(e.dataTransfer.files?.[0]); }}>
          <strong>Clique para selecionar</strong> ou arraste o {LABEL[tipo]} aqui
          <div className="media-drop-hint">Até 25 MB</div>
        </div>
      ) : (
        <div>
          {cardImg && url ? (
            <div className="media-prev-card">
              <img className="media-prev-img-top" src={url} alt={file.name} onClick={() => setLightbox(true)} title="Ampliar" />
              <div className="media-prev-band">
                <textarea className="media-prev-cap" disabled={estado === 'sending'} placeholder="Legenda (opcional)" value={caption} onChange={(e) => setCaption(e.target.value)} />
              </div>
            </div>
          ) : (
            <>
              {tipo === 'imagem' && url && <img className="media-prev-img" src={url} alt={file.name} onClick={() => setLightbox(true)} title="Ampliar" />}
              {tipo === 'video' && url && <video className="media-prev-vid" src={url} controls preload="metadata" />}
              {tipo === 'documento' && <div className="media-doc-card"><IcDoc /><div style={{ minWidth: 0 }}><div className="media-doc-nome">{file.name}</div><small>{ext}{ext ? ' · ' : ''}{fmt(file.size)}</small></div></div>}
            </>
          )}

          <div className="media-actions">
            <span className="media-meta" title={file.name}>{file.name} · {fmt(file.size)}</span>
            <button type="button" className="atv-btn" disabled={estado === 'sending'} onClick={() => inputRef.current?.click()}>Substituir</button>
            <button type="button" className="atv-btn" disabled={estado === 'sending'} onClick={remover}>Remover</button>
          </div>
          {!cardImg && (
            <textarea className="atv-textarea" disabled={estado === 'sending'}
              placeholder={tipo === 'documento' ? 'Texto para enviar junto (opcional)' : 'Legenda (opcional)'}
              value={caption} onChange={(e) => setCaption(e.target.value)} />
          )}
        </div>
      )}

      {erro && <div className="atv-field-err" style={{ marginTop: 8 }}>{erro}</div>}
      {lightbox && url && tipo === 'imagem' && (
        <div className="atv-lightbox" onClick={() => setLightbox(false)} role="dialog" aria-modal="true">
          <button className="atv-lightbox-close" aria-label="Fechar" onClick={() => setLightbox(false)}>×</button>
          <img src={url} alt={file?.name} onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </Modal>
  );
}
