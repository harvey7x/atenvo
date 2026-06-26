import { useEffect, useRef, useState } from 'react';
import './AudioRecorder.css';

type Estado = 'idle' | 'requesting' | 'recording' | 'paused' | 'preview' | 'sending' | 'error';

interface Props {
  disabled?: boolean;
  /** Faz o upload + envio real. Deve lançar em falha (não considerar HTTP 200 isolado como sucesso). */
  onEnviar: (blob: Blob, mime: string, ext: string) => Promise<void>;
}

const EXT: Record<string, string> = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3' };
function escolherMime(): string {
  const cand = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg', 'audio/mp4'];
  const MR = (window as unknown as { MediaRecorder?: typeof MediaRecorder }).MediaRecorder;
  if (!MR) return '';
  for (const c of cand) { try { if (MR.isTypeSupported(c)) return c; } catch { /* ignore */ } }
  return '';
}
const baseMime = (m: string) => (m.split(';')[0] || 'audio/webm');
const mmss = (s: number) => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');

const IcMic = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>;

export function AudioRecorder({ disabled, onEnviar }: Props) {
  const [estado, setEstado] = useState<Estado>('idle');
  const [seg, setSeg] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeRef = useRef<string>('');
  const blobRef = useRef<Blob | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function pararTimer() { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } }
  function pararTracks() { streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
  function limparPreview() { if (previewUrl) { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); } }

  // limpeza ao desmontar e ao fechar a página
  useEffect(() => {
    const onUnload = () => pararTracks();
    window.addEventListener('beforeunload', onUnload);
    return () => { window.removeEventListener('beforeunload', onUnload); pararTimer(); pararTracks(); if (previewUrl) URL.revokeObjectURL(previewUrl); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function iniciar() {
    setErro(null);
    const md = navigator.mediaDevices;
    if (!md?.getUserMedia || !(window as unknown as { MediaRecorder?: unknown }).MediaRecorder) { setEstado('error'); setErro('Este navegador não suporta gravação de áudio.'); return; }
    setEstado('requesting');
    let stream: MediaStream;
    try {
      stream = await md.getUserMedia({ audio: true }); // só após o clique do usuário
    } catch (e) {
      const n = (e as DOMException).name;
      const msg = n === 'NotAllowedError' || n === 'SecurityError' ? 'Permissão de microfone negada.'
        : n === 'NotFoundError' || n === 'OverconstrainedError' ? 'Nenhum microfone encontrado.'
          : n === 'NotReadableError' ? 'Microfone em uso por outro aplicativo.'
            : 'Não foi possível acessar o microfone.';
      setEstado('error'); setErro(msg); return;
    }
    streamRef.current = stream;
    const mime = escolherMime(); mimeRef.current = mime;
    let rec: MediaRecorder;
    try { rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined); }
    catch { pararTracks(); setEstado('error'); setErro('Formato de gravação não suportado.'); return; }
    recRef.current = rec; chunksRef.current = [];
    rec.ondataavailable = (ev) => { if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data); };
    rec.onstop = () => {
      const tipo = mimeRef.current || rec.mimeType || 'audio/webm';
      const blob = new Blob(chunksRef.current, { type: baseMime(tipo) });
      blobRef.current = blob;
      limparPreview(); setPreviewUrl(URL.createObjectURL(blob));
      pararTracks(); pararTimer(); setEstado('preview');
    };
    rec.onerror = () => { pararTracks(); pararTimer(); setEstado('error'); setErro('Erro durante a gravação.'); };
    try { rec.start(); } catch { pararTracks(); setEstado('error'); setErro('Não foi possível iniciar a gravação.'); return; }
    setSeg(0); setEstado('recording');
    timerRef.current = setInterval(() => { if (recRef.current?.state === 'recording') setSeg((s) => s + 1); }, 1000);
  }

  function pausar() { if (recRef.current?.state === 'recording') { recRef.current.pause(); setEstado('paused'); } }
  function continuar() { if (recRef.current?.state === 'paused') { recRef.current.resume(); setEstado('recording'); } }
  function finalizar() { if (recRef.current && recRef.current.state !== 'inactive') recRef.current.stop(); }
  function cancelar() {
    pararTimer();
    const rec = recRef.current;
    if (rec && rec.state !== 'inactive') { rec.onstop = null; rec.ondataavailable = null; try { rec.stop(); } catch { /* ignore */ } } // não dispara onstop (evita ir p/ preview)
    pararTracks(); chunksRef.current = []; blobRef.current = null; limparPreview(); setSeg(0); setEstado('idle'); setErro(null);
  }

  async function enviar() {
    const blob = blobRef.current; if (!blob) return;
    const mime = baseMime(mimeRef.current || blob.type || 'audio/webm');
    const ext = EXT[mime] ?? 'webm';
    setEstado('sending'); setErro(null);
    try {
      await onEnviar(blob, mime, ext);          // upload + envio + confirmação real (lança em falha)
      blobRef.current = null; limparPreview(); setSeg(0); setEstado('idle');
    } catch (e) {
      setEstado('error'); setErro((e as Error).message || 'Falha ao enviar o áudio.'); // preserva o blob p/ retry
    }
  }

  if (estado === 'idle') {
    return <button type="button" className="fb-tool" disabled={disabled} title="Gravar áudio" onClick={iniciar}><IcMic /><span>Áudio</span></button>;
  }

  return (
    <div className="rec-panel" role="group" aria-label="Gravação de áudio">
      {(estado === 'requesting') && <span className="rec-info">Solicitando microfone…</span>}

      {(estado === 'recording' || estado === 'paused') && (
        <>
          <span className={'rec-dot' + (estado === 'recording' ? ' on' : '')} />
          <span className="rec-timer">{mmss(seg)}{estado === 'paused' ? ' (pausado)' : ''}</span>
          {estado === 'recording'
            ? <button type="button" className="rec-btn" onClick={pausar} title="Pausar">❚❚</button>
            : <button type="button" className="rec-btn" onClick={continuar} title="Continuar">▶</button>}
          <button type="button" className="rec-btn primary" onClick={finalizar} title="Finalizar">Finalizar</button>
          <button type="button" className="rec-btn ghost" onClick={cancelar} title="Cancelar">Cancelar</button>
        </>
      )}

      {estado === 'preview' && previewUrl && (
        <>
          <audio className="rec-preview" controls src={previewUrl} />
          <button type="button" className="rec-btn ghost" onClick={iniciar} title="Gravar novamente">Regravar</button>
          <button type="button" className="rec-btn ghost" onClick={cancelar} title="Apagar">Apagar</button>
          <button type="button" className="rec-btn primary" onClick={enviar} title="Enviar áudio">Enviar</button>
        </>
      )}

      {estado === 'sending' && <span className="rec-info"><span className="rec-spin" /> Enviando áudio…</span>}

      {estado === 'error' && (
        <>
          <span className="rec-erro">{erro}</span>
          {blobRef.current ? <button type="button" className="rec-btn primary" onClick={enviar}>Tentar novamente</button> : <button type="button" className="rec-btn" onClick={iniciar}>Tentar de novo</button>}
          <button type="button" className="rec-btn ghost" onClick={cancelar}>Descartar</button>
        </>
      )}
    </div>
  );
}
