import { useEffect, useRef, useState } from 'react';
import './AudioRecorder.css';

type Estado = 'idle' | 'requesting' | 'recording' | 'paused' | 'preview' | 'sending' | 'error';

interface Props {
  disabled?: boolean;
  /** Faz o upload + envio real. Deve lançar em falha (não considerar HTTP 200 isolado como sucesso). */
  onEnviar: (blob: Blob, mime: string, ext: string) => Promise<void>;
}

// Preferimos AAC/MP4 (que o Messenger reproduz). webm/opus é fallback (a Meta aceita o arquivo,
// porém NÃO reproduz no app — o áudio chega mudo). Só usamos o que o navegador suportar de fato.
const CANDIDATOS = ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
const EXT: Record<string, string> = { 'audio/mp4': 'm4a', 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3' };
function escolherMime(): string {
  const MR = (window as unknown as { MediaRecorder?: typeof MediaRecorder }).MediaRecorder;
  if (!MR) return '';
  for (const c of CANDIDATOS) { try { if (MR.isTypeSupported(c)) return c; } catch { /* ignore */ } }
  return '';
}
const baseMime = (m: string) => (m.split(';')[0] || 'audio/webm');
const mmss = (s: number) => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
const SINAL_MIN = 0.03; // pico normalizado mínimo p/ considerar que houve som

const IcMic = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>;

export function AudioRecorder({ disabled, onEnviar }: Props) {
  const [estado, setEstado] = useState<Estado>('idle');
  const [seg, setSeg] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string>('');
  const [info, setInfo] = useState<{ mime: string; size: number; dur: number; sinal: boolean; verificando?: boolean; rms?: number } | null>(null);
  const [picoVivo, setPicoVivo] = useState(0); // maior nível visto na gravação atual (p/ avisar "sem sinal")

  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeRef = useRef<string>('');
  const blobRef = useRef<Blob | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const acRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const meterCloneRef = useRef<MediaStreamTrack | null>(null); // track CLONADA só p/ o medidor (recorder usa a original)
  const rafRef = useRef<number | null>(null);
  const maxNivelRef = useRef(0);
  const barRef = useRef<HTMLDivElement>(null);
  const enviandoRef = useRef(false); // trava clique-duplo no envio

  function pararTimer() { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } }
  function pararMedidor() {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    analyserRef.current = null;
    if (meterCloneRef.current) { try { meterCloneRef.current.stop(); } catch { /* ignore */ } meterCloneRef.current = null; }
    if (acRef.current) { try { acRef.current.close(); } catch { /* ignore */ } acRef.current = null; }
  }
  function pararTracks() { streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
  function limparPreview() { setPreviewUrl((u) => { if (u) URL.revokeObjectURL(u); return null; }); }

  useEffect(() => {
    const onUnload = () => pararTracks();
    window.addEventListener('beforeunload', onUnload);
    return () => { window.removeEventListener('beforeunload', onUnload); pararTimer(); pararMedidor(); pararTracks(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // medidor visual (Web Audio) — só validação local; nada é transmitido.
  // IMPORTANTE: usa uma track CLONADA. Rotear a MESMA track do recorder pelo Web Audio faz o
  // Chrome gravar SILÊNCIO. Com o clone, o MediaRecorder mantém a track original intacta.
  function montarMedidor(stream: MediaStream) {
    try {
      const orig = stream.getAudioTracks()[0]; if (!orig) return;
      const clone = orig.clone(); meterCloneRef.current = clone;
      const AC = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
      const ac = new AC(); acRef.current = ac;
      if (ac.state === 'suspended') ac.resume().catch(() => { /* ignore */ });
      const src = ac.createMediaStreamSource(new MediaStream([clone]));
      const an = ac.createAnalyser(); an.fftSize = 1024; src.connect(an); analyserRef.current = an;
      const buf = new Uint8Array(an.fftSize);
      const loop = () => {
        const a = analyserRef.current; if (!a) return;
        a.getByteTimeDomainData(buf);
        let peak = 0; for (let i = 0; i < buf.length; i++) { const v = Math.abs(buf[i] - 128) / 128; if (v > peak) peak = v; }
        if (peak > maxNivelRef.current) maxNivelRef.current = peak;
        if (barRef.current) barRef.current.style.width = Math.min(100, Math.round(peak * 140)) + '%';
        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);
    } catch { /* medidor é opcional */ }
  }

  async function listarDispositivos() {
    try { const ds = await navigator.mediaDevices.enumerateDevices(); setDevices(ds.filter((d) => d.kind === 'audioinput')); } catch { /* ignore */ }
  }

  // Decodifica o Blob gravado e mede o RMS — prova local de que o ARQUIVO tem som (independe do medidor ao vivo).
  async function medirBlob(blob: Blob, _tipo: string) {
    try {
      const ab = await blob.arrayBuffer();
      const AC = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
      const ac = new AC();
      const audio = await ac.decodeAudioData(ab);
      let sum = 0, n = 0;
      for (let c = 0; c < audio.numberOfChannels; c++) { const ch = audio.getChannelData(c); for (let i = 0; i < ch.length; i++) sum += ch[i] * ch[i]; n += ch.length; }
      const rms = n ? Math.sqrt(sum / n) : 0;
      try { ac.close(); } catch { /* ignore */ }
      setInfo((x) => x ? { ...x, dur: audio.duration, sinal: rms >= 0.01, verificando: false, rms } : x); // ruído de fundo não passa
    } catch { setInfo((x) => x ? { ...x, verificando: false } : x); } // se não decodificar, mantém o medidor ao vivo
  }

  async function iniciar(idDispositivo?: string) {
    setErro(null);
    const md = navigator.mediaDevices;
    if (!md?.getUserMedia || !(window as unknown as { MediaRecorder?: unknown }).MediaRecorder) { setEstado('error'); setErro('Este navegador não suporta gravação de áudio.'); return; }
    setEstado('requesting');
    pararMedidor(); pararTracks(); maxNivelRef.current = 0;
    let stream: MediaStream;
    try {
      stream = await md.getUserMedia({ audio: idDispositivo ? { deviceId: { exact: idDispositivo } } : true }); // só após o clique
    } catch (e) {
      const n = (e as DOMException).name;
      const msg = n === 'NotAllowedError' || n === 'SecurityError' ? 'Permissão de microfone negada.'
        : n === 'NotFoundError' || n === 'OverconstrainedError' ? 'Nenhum microfone encontrado.'
          : n === 'NotReadableError' ? 'Microfone em uso por outro aplicativo.'
            : 'Não foi possível acessar o microfone.';
      setEstado('error'); setErro(msg); return;
    }
    streamRef.current = stream;
    const track = stream.getAudioTracks()[0];
    if (!track || track.readyState !== 'live') { pararTracks(); setEstado('error'); setErro('Microfone sem faixa de áudio ativa.'); return; }
    setDeviceId(track.getSettings().deviceId ?? idDispositivo ?? '');
    void listarDispositivos();
    montarMedidor(stream);
    const mime = escolherMime(); mimeRef.current = mime;
    let rec: MediaRecorder;
    try { rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined); }
    catch { pararTracks(); pararMedidor(); setEstado('error'); setErro('Formato de gravação não suportado.'); return; }
    recRef.current = rec; chunksRef.current = [];
    rec.ondataavailable = (ev) => { if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data); };
    rec.onstop = () => {
      const tipo = baseMime(mimeRef.current || rec.mimeType || 'audio/webm');
      const blob = new Blob(chunksRef.current, { type: tipo });
      blobRef.current = blob;
      limparPreview(); setPreviewUrl(URL.createObjectURL(blob));
      pararMedidor(); pararTracks(); pararTimer();             // só encerra as tracks DEPOIS de montar o Blob
      setInfo({ mime: tipo, size: blob.size, dur: 0, sinal: maxNivelRef.current >= SINAL_MIN, verificando: true });
      setEstado('preview');
      void medirBlob(blob, tipo);                              // verdade absoluta: o arquivo gravado tem som?
    };
    rec.onerror = () => { pararMedidor(); pararTracks(); pararTimer(); setEstado('error'); setErro('Erro durante a gravação.'); };
    try { rec.start(); } catch { pararTracks(); pararMedidor(); setEstado('error'); setErro('Não foi possível iniciar a gravação.'); return; }
    setSeg(0); setPicoVivo(0); setEstado('recording');
    timerRef.current = setInterval(() => { setPicoVivo(maxNivelRef.current); if (recRef.current?.state === 'recording') setSeg((s) => s + 1); }, 1000);
  }

  function pausar() { if (recRef.current?.state === 'recording') { recRef.current.pause(); setEstado('paused'); } }
  function continuar() { if (recRef.current?.state === 'paused') { recRef.current.resume(); setEstado('recording'); } }
  function finalizar() {
    const rec = recRef.current; if (!rec || rec.state === 'inactive') return;
    try { rec.requestData(); } catch { /* ignore */ }   // garante o último chunk antes do stop
    rec.stop();                                          // onstop monta o Blob e só então encerra as tracks
  }
  function cancelar() {
    pararTimer(); pararMedidor();
    const rec = recRef.current;
    if (rec && rec.state !== 'inactive') { rec.onstop = null; rec.ondataavailable = null; try { rec.stop(); } catch { /* ignore */ } }
    pararTracks(); chunksRef.current = []; blobRef.current = null; limparPreview(); setSeg(0); setInfo(null); setEstado('idle'); setErro(null);
  }
  function trocarDispositivo(id: string) {
    // encerra stream/medidor anteriores e reabre com o novo dispositivo (regrava)
    pararTimer(); const rec = recRef.current; if (rec && rec.state !== 'inactive') { rec.onstop = null; rec.ondataavailable = null; try { rec.stop(); } catch { /* ignore */ } }
    pararMedidor(); pararTracks(); chunksRef.current = []; void iniciar(id);
  }

  async function enviar() {
    if (enviandoRef.current) return;                    // clique-duplo
    const blob = blobRef.current; if (!blob) return;
    if (!info || info.verificando || !info.sinal) { setErro('Nenhum som foi detectado. Verifique o microfone selecionado.'); return; }
    enviandoRef.current = true;
    const mime = baseMime(mimeRef.current || blob.type || 'audio/webm');
    const ext = EXT[mime] ?? 'm4a';
    setEstado('sending'); setErro(null);
    try {
      await onEnviar(blob, mime, ext);                  // upload + envio + confirmação real (lança em falha)
      blobRef.current = null; limparPreview(); setSeg(0); setInfo(null); setEstado('idle');
    } catch (e) {
      setEstado('error'); setErro((e as Error).message || 'Falha ao enviar o áudio.'); // preserva o blob p/ retry
    } finally { enviandoRef.current = false; }
  }

  const nomeMic = (devices.find((d) => d.deviceId === deviceId)?.label || devices[0]?.label || '').slice(0, 30);
  const semSinalVivo = (estado === 'recording' || estado === 'paused') && seg >= 2 && picoVivo < 0.02;
  const seletorMic = devices.length > 1 && (
    <select className="rec-select" value={deviceId} onChange={(e) => trocarDispositivo(e.target.value)} title="Microfone" disabled={estado === 'sending'}>
      {devices.map((d, i) => <option key={d.deviceId || i} value={d.deviceId}>{d.label || `Microfone ${i + 1}`}</option>)}
    </select>
  );

  if (estado === 'idle') {
    return <button type="button" className="fb-tool" disabled={disabled} title="Gravar áudio" onClick={() => iniciar()}><IcMic /><span>Áudio</span></button>;
  }

  return (
    <div className="rec-panel" role="group" aria-label="Gravação de áudio">
      {estado === 'requesting' && <span className="rec-info">Solicitando microfone…</span>}

      {(estado === 'recording' || estado === 'paused') && (
        <>
          <span className={'rec-dot' + (estado === 'recording' ? ' on' : '')} />
          <span className="rec-timer">{mmss(seg)}{estado === 'paused' ? ' (pausado)' : ''}</span>
          <span className="rec-meter" title="Nível do microfone"><span ref={barRef} className="rec-meter-bar" /></span>
          {semSinalVivo && <span className="rec-erro">Sem sinal — fale ou troque o microfone</span>}
          {seletorMic || (nomeMic && <span className="rec-meta" title={nomeMic}>{nomeMic}</span>)}
          {estado === 'recording'
            ? <button type="button" className="rec-btn" onClick={pausar} title="Pausar">❚❚</button>
            : <button type="button" className="rec-btn" onClick={continuar} title="Continuar">▶</button>}
          <button type="button" className="rec-btn primary" onClick={finalizar} title="Finalizar">Finalizar</button>
          <button type="button" className="rec-btn ghost" onClick={cancelar} title="Cancelar">Cancelar</button>
        </>
      )}

      {estado === 'preview' && previewUrl && (
        <>
          <audio className="rec-preview" controls src={previewUrl} onLoadedMetadata={(e) => { const d = (e.currentTarget as HTMLAudioElement).duration; setInfo((x) => x ? { ...x, dur: isFinite(d) ? d : x.dur } : x); }} />
          <span className="rec-meta">{info ? `${info.dur ? mmss(info.dur) + ' · ' : ''}${baseMime(info.mime)} · ${(info.size / 1024).toFixed(0)} KB` : ''}</span>
          {info?.verificando && <span className="rec-meta">verificando o áudio…</span>}
          {info && !info.verificando && !info.sinal && <span className="rec-erro">Nenhum som no áudio gravado. Troque o microfone e regrave.</span>}
          {info && !info.verificando && info.sinal && <span className="rec-sinal">✓ som no áudio</span>}
          {seletorMic}
          <button type="button" className="rec-btn ghost" onClick={() => iniciar(deviceId || undefined)} title="Gravar novamente">Regravar</button>
          <button type="button" className="rec-btn ghost" onClick={cancelar} title="Apagar">Apagar</button>
          <button type="button" className="rec-btn primary" disabled={!info || info.verificando || !info.sinal} onClick={enviar} title="Enviar áudio">Enviar</button>
        </>
      )}

      {estado === 'sending' && <span className="rec-info"><span className="rec-spin" /> Enviando áudio…</span>}

      {estado === 'error' && (
        <>
          <span className="rec-erro">{erro}</span>
          {blobRef.current ? <button type="button" className="rec-btn primary" onClick={enviar}>Tentar novamente</button> : <button type="button" className="rec-btn" onClick={() => iniciar()}>Tentar de novo</button>}
          <button type="button" className="rec-btn ghost" onClick={cancelar}>Descartar</button>
        </>
      )}
    </div>
  );
}
