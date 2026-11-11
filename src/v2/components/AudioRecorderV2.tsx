import { useEffect, useRef, useState } from 'react';
import { transcodificarParaOggOpus } from '../lib/oggOpus';
import './componentes.css';

/* Pele Platina do gravador de áudio do composer.
   COMPORTAMENTO 1:1 com src/components/AudioRecorder.tsx (a verdade funcional):
   mesma máquina de estados, mesmos mimeTypes/EXT, medidor sobre track CLONADA,
   medirBlob no preview, correlation_id/diag, trava de duplo-clique e cleanup.
   Só a pele muda: classes `arec-` novas + botões `p-btn` (nunca as classes rec-
   ou fb-tool do v1 — o guard de colisões CSS falha se um seletor v1 casar com o DOM v2). */

type Estado = 'idle' | 'requesting' | 'recording' | 'paused' | 'preview' | 'sending' | 'error';

interface Props {
  disabled?: boolean;
  /** Faz o upload + envio real. Deve lançar em falha (não considerar HTTP 200 isolado como sucesso).
   *  diag: metadados técnicos do teste controlado (correlation_id + hashes/decode), sem conteúdo. */
  onEnviar: (blob: Blob, mime: string, ext: string, diag?: Record<string, unknown>) => Promise<void>;
  /** Habilita também a seleção de um arquivo de áudio existente (opt-in; off por padrão p/ não mudar quem já usa). */
  permitirArquivo?: boolean;
  /** Rótulo do botão de confirmação (default "Enviar"). No agendamento vira "Usar áudio" (captura, não envia). */
  rotuloEnviar?: string;
  /** 'zap' = barra de gravação do WhatsApp (celular da tela Conversas; CSS `fzr-` em pages/fone-zap.css).
      Mesma máquina de estados — só a pele muda. Default = pele padrão. */
  pele?: 'padrao' | 'zap';
  /** começa a gravar assim que monta (o toque no microfone já foi o gesto do usuário) */
  autoIniciar?: boolean;
  /** pele zap: fechar a barra (descartou ou o áudio foi enviado) */
  aoFechar?: () => void;
}
const MAX_AUDIO = 16 * 1024 * 1024; // limite ~16MB (WhatsApp)

// Preferimos AAC/MP4 (que o Messenger reproduz). webm/opus é fallback (a Meta aceita o arquivo,
// porém NÃO reproduz no app — o áudio chega mudo). Só usamos o que o navegador suportar de fato.
const CANDIDATOS = ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
const EXT: Record<string, string> = { 'audio/mp4': 'm4a', 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/aac': 'aac' };
export function escolherMime(): string {
  const MR = (window as unknown as { MediaRecorder?: typeof MediaRecorder }).MediaRecorder;
  if (!MR) return '';
  // iOS: contêiner 'audio/mp4' PURO primeiro — o isTypeSupported aceita a string
  // com codecs, mas há versões do Safari que gravam VAZIO (0 bytes) com ela; o
  // contêiner puro grava AAC do mesmo jeito e é o caminho estável no WebKit.
  const ordem = ehIOS() ? ['audio/mp4', ...CANDIDATOS.filter((c) => c !== 'audio/mp4')] : CANDIDATOS;
  for (const c of ordem) { try { if (MR.isTypeSupported(c)) return c; } catch { /* ignore */ } }
  return '';
}
const baseMime = (m: string) => (m.split(';')[0] || 'audio/webm');
const mmss = (s: number) => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
export const SINAL_MIN = 0.03; // pico normalizado mínimo p/ considerar que houve som

/** iOS/iPadOS (WebKit): iPad moderno se disfarça de MacIntel com multi-toque. */
export const ehIOS = () =>
  typeof navigator !== 'undefined' &&
  (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

/** Veredito de som ao FINALIZAR, ANTES do medirBlob decodificar o arquivo:
 *  com medidor ao vivo vale o pico visto; SEM medidor (iOS, ver iniciar()) não há
 *  evidência — NÃO bloquear por padrão. O medirBlob (RMS do arquivo) é a verdade
 *  final e ainda derruba pra false se o ARQUIVO for realmente mudo. */
export const sinalInicial = (medidorAtivo: boolean, pico: number) => (medidorAtivo ? pico >= SINAL_MIN : true);

// width/height explícitos: o dimensionamento por CSS depende do contexto onde o botão
// é reusado (composer, modal de agendamento); sem os atributos o SVG renderizaria gigante.
const IcMic = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>;
const IcClip = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5 12.5 20a5 5 0 0 1-7-7l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8" /></svg>;

const IcLixo = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 7h16M10 11v6M14 11v6M5.5 7l1 12.2A2 2 0 0 0 8.5 21h7a2 2 0 0 0 2-1.8L18.5 7M9 7V4.8A.8.8 0 0 1 9.8 4h4.4a.8.8 0 0 1 .8.8V7" /></svg>;
const IcPausa = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden><rect x="6" y="4.5" width="4.2" height="15" rx="1.2" /><rect x="13.8" y="4.5" width="4.2" height="15" rx="1.2" /></svg>;
const IcPlay = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M7 4.8v14.4c0 .8.9 1.3 1.6.9l11-7.2a1 1 0 0 0 0-1.8l-11-7.2c-.7-.4-1.6.1-1.6.9z" /></svg>;
const IcParar = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden><rect x="5" y="5" width="14" height="14" rx="3" /></svg>;
const IcRegravar = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.6" /><path d="M4 4v4.6h4.6" /></svg>;
const IcEnviar = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M3.4 20.4 21 12 3.4 3.6 3.4 10.2 15 12 3.4 13.8z" /></svg>;
const IcMicZap = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" /></svg>;

export function AudioRecorderV2({ disabled, onEnviar, permitirArquivo, rotuloEnviar, pele = 'padrao', autoIniciar, aoFechar }: Props) {
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
  const correlationRef = useRef<string>('');            // correlation_id (observabilidade mínima)
  const diagRef = useRef<Record<string, unknown> | null>(null); // { correlation_id, origem, blob_mime, blob_size }
  const barRef = useRef<HTMLDivElement>(null);
  const enviandoRef = useRef(false); // trava clique-duplo no envio
  const fileRef = useRef<HTMLInputElement>(null); // seleção de arquivo de áudio existente
  const montadoRef = useRef(true);    // desmontou enquanto o navegador pedia o microfone → solta o microfone
  const autoRef = useRef(false);      // autoIniciar só uma vez (StrictMode roda o efeito 2x)
  // pele zap: "enviar" durante a gravação = parar, conferir o som e enviar (estado, pra tela refletir na hora)
  const [aguardandoEnvio, setAguardandoEnvio] = useState(false);
  const geracaoRef = useRef(0);        // medição de um áudio antigo não pode sobrescrever a do novo
  const previewUrlRef = useRef<string | null>(null);
  const lixoRef = useRef<HTMLButtonElement>(null);
  const zapRef = useRef<HTMLDivElement>(null);
  // mini player da prévia (pele zap)
  const prevRef = useRef<HTMLAudioElement>(null);
  const [prevTocando, setPrevTocando] = useState(false);
  const [prevPos, setPrevPos] = useState(0);

  function pararTimer() { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } }
  function pararMedidor() {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    analyserRef.current = null;
    if (meterCloneRef.current) { try { meterCloneRef.current.stop(); } catch { /* ignore */ } meterCloneRef.current = null; }
    if (acRef.current) { try { acRef.current.close(); } catch { /* ignore */ } acRef.current = null; }
  }
  function pararTracks() { streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
  function limparPreview() { setPreviewUrl((u) => { if (u) URL.revokeObjectURL(u); return null; }); }
  useEffect(() => { previewUrlRef.current = previewUrl; }, [previewUrl]);

  useEffect(() => {
    montadoRef.current = true;
    const onUnload = () => pararTracks();
    window.addEventListener('beforeunload', onUnload);
    return () => {
      montadoRef.current = false; window.removeEventListener('beforeunload', onUnload);
      // saiu gravando: para o gravador SEM montar o arquivo (nada fica na memória nem é medido à toa)
      const rec = recRef.current;
      if (rec && rec.state !== 'inactive') { rec.onstop = null; rec.ondataavailable = null; try { rec.stop(); } catch { /* ignore */ } }
      pararTimer(); pararMedidor(); pararTracks();
      if (previewUrlRef.current) { URL.revokeObjectURL(previewUrlRef.current); previewUrlRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (autoIniciar && !autoRef.current) { autoRef.current = true; void iniciar(); }
    if (pele === 'zap') lixoRef.current?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (pele !== 'zap') return;
    const ativo = document.activeElement;
    if (ativo && ativo !== document.body && zapRef.current?.contains(ativo)) return;
    if (ativo && ativo !== document.body) return;   // o foco está em outro lugar da tela: não rouba
    const alvo = zapRef.current?.querySelector<HTMLElement>(estado === 'preview' ? '[data-foco="ouvir"]' : estado === 'recording' || estado === 'paused' ? '[data-foco="pausa"]' : '[data-foco="lixo"]');
    alvo?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado]);
  // pele zap: pediu pra enviar gravando → assim que o arquivo for conferido, envia (sem som = fica na prévia com o aviso)
  useEffect(() => {
    if (!aguardandoEnvio || estado !== 'preview' || !info || info.verificando) return;
    setAguardandoEnvio(false);
    if (info.sinal) void enviar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado, info, aguardandoEnvio]);

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
    const geracao = geracaoRef.current;
    try {
      const ab = await blob.arrayBuffer();
      const AC = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
      const ac = new AC();
      const audio = await ac.decodeAudioData(ab);
      let sum = 0, n = 0;
      for (let c = 0; c < audio.numberOfChannels; c++) { const ch = audio.getChannelData(c); for (let i = 0; i < ch.length; i++) sum += ch[i] * ch[i]; n += ch.length; }
      const rms = n ? Math.sqrt(sum / n) : 0;
      try { ac.close(); } catch { /* ignore */ }
      if (geracao !== geracaoRef.current || !montadoRef.current) return;   // já é outro áudio (ou saiu da tela)
      setInfo((x) => x ? { ...x, dur: audio.duration, sinal: rms >= 0.01, verificando: false, rms } : x); // ruído de fundo não passa
    } catch { if (geracao === geracaoRef.current && montadoRef.current) setInfo((x) => x ? { ...x, verificando: false } : x); } // se não decodificar, mantém o medidor ao vivo
  }

  async function iniciar(idDispositivo?: string) {
    setAguardandoEnvio(false);
    if (pele === 'zap') {
      // gravar de novo DESCARTA o áudio anterior: nada antigo pode ficar pronto pra envio
      prevRef.current?.pause(); setPrevTocando(false); setPrevPos(0);
      blobRef.current = null; setInfo(null); limparPreview();
    }
    setErro(null);
    const md = navigator.mediaDevices;
    if (!md?.getUserMedia || !(window as unknown as { MediaRecorder?: unknown }).MediaRecorder) { setEstado('error'); setErro('Este navegador não suporta gravação de áudio.'); return; }
    setEstado('requesting');
    pararMedidor(); pararTracks(); maxNivelRef.current = 0;
    correlationRef.current = (crypto as { randomUUID?: () => string }).randomUUID?.() ?? String(Date.now()); diagRef.current = null;
    let stream: MediaStream;
    try {
      stream = await md.getUserMedia({ audio: idDispositivo ? { deviceId: { exact: idDispositivo } } : true }); // só após o clique
      if (!montadoRef.current) { stream.getTracks().forEach((t) => t.stop()); return; }   // fechou antes do navegador liberar
    } catch (e) {
      const n = (e as DOMException).name;
      const msg = n === 'NotAllowedError' || n === 'SecurityError' ? 'Permissão de microfone negada.'
        : n === 'NotFoundError' || n === 'OverconstrainedError' ? 'Nenhum microfone encontrado.'
          : n === 'NotReadableError' ? 'Microfone em uso por outro aplicativo.'
            : 'Não foi possível acessar o microfone.';
      setEstado('error'); setErro(msg); return;
    }
    streamRef.current = stream;
    geracaoRef.current += 1;   // microfone abriu: a medição do áudio anterior não vale mais (se falhar antes disso, ela termina normal)
    const track = stream.getAudioTracks()[0];
    if (!track || track.readyState !== 'live') { pararTracks(); setEstado('error'); setErro('Microfone sem faixa de áudio ativa.'); return; }
    setDeviceId(track.getSettings().deviceId ?? idDispositivo ?? '');
    void listarDispositivos();
    // iOS/WebKit: consumir a MESMA captura no Web Audio (mesmo via track CLONADA)
    // pode SILENCIAR a gravação do MediaRecorder — o inverso do bug do Chrome que o
    // clone resolve ("gravei e não tinha nenhum áudio", relato do dono 18/09 no /m).
    // Sem medidor no iOS a gravação fica intocada; a checagem anti-mudo passa a ser
    // só a do ARQUIVO (medirBlob), que é a verdade final de qualquer jeito.
    if (!ehIOS()) montarMedidor(stream);
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
      // gravação VAZIA (0 bytes): o WebKit às vezes encerra sem nenhum dataavailable.
      // Falhar AQUI com orientação clara — deixar seguir viraria "Áudio vazio" só no envio.
      if (blob.size < 1024) {
        pararMedidor(); pararTracks(); pararTimer();
        blobRef.current = null; limparPreview(); setSeg(0); setInfo(null);
        setEstado('error');
        setErro('A gravação saiu vazia ou corrompida. Toque em Tentar de novo — se repetir, feche apps que usem o microfone e recarregue a página.');
        return;
      }
      // DIAGNÓSTICO temporário (sanitizado, sem conteúdo de áudio): metadados do Blob + níveis + track.
      // observabilidade mínima: gravação pelo microfone → sempre voz/PTT (origem usada no roteamento do envio).
      diagRef.current = { correlation_id: correlationRef.current, origem: 'gravacao_painel', blob_mime: mimeRef.current || rec.mimeType || tipo, blob_size: blob.size };
      limparPreview(); setPreviewUrl(URL.createObjectURL(blob));
      pararMedidor(); pararTracks(); pararTimer();             // só encerra as tracks DEPOIS de montar o Blob
      setInfo({ mime: tipo, size: blob.size, dur: 0, sinal: sinalInicial(!ehIOS(), maxNivelRef.current), verificando: true });
      setEstado('preview');
      void medirBlob(blob, tipo);                              // verdade absoluta: o arquivo gravado tem som?
    };
    rec.onerror = () => { setAguardandoEnvio(false); pararMedidor(); pararTracks(); pararTimer(); setEstado('error'); setErro('Erro durante a gravação.'); };
    // iOS: timeslice de 1s → ondataavailable periódico (o WebKit já PERDEU gravações
    // inteiras quando tudo dependia do único evento final do stop)
    try { if (ehIOS()) rec.start(1000); else rec.start(); } catch { pararTracks(); pararMedidor(); setEstado('error'); setErro('Não foi possível iniciar a gravação.'); return; }
    setSeg(0); setPicoVivo(0); setEstado('recording');
    timerRef.current = setInterval(() => { setPicoVivo(maxNivelRef.current); if (recRef.current?.state === 'recording') setSeg((s) => s + 1); }, 1000);
  }

  function pausar() { if (recRef.current?.state === 'recording') { recRef.current.pause(); setEstado('paused'); } }
  function continuar() { if (recRef.current?.state === 'paused') { recRef.current.resume(); setEstado('recording'); } }
  function finalizar() {
    const rec = recRef.current; if (!rec || rec.state === 'inactive') return;
    // requestData é instável no WebKit (pode invalidar o buffer); no iOS o timeslice
    // do start(1000) já garante os chunks — só o stop() entrega o final
    if (!ehIOS()) { try { rec.requestData(); } catch { /* ignore */ } }   // garante o último chunk antes do stop
    rec.stop();                                          // onstop monta o Blob e só então encerra as tracks
  }
  function pararEEnviar() { setAguardandoEnvio(true); finalizar(); }
  function pararEOuvir() { setAguardandoEnvio(false); finalizar(); }
  function cancelar() {
    geracaoRef.current += 1;
    setAguardandoEnvio(false); prevRef.current?.pause(); setPrevTocando(false); setPrevPos(0);
    pararTimer(); pararMedidor();
    const rec = recRef.current;
    if (rec && rec.state !== 'inactive') { rec.onstop = null; rec.ondataavailable = null; try { rec.stop(); } catch { /* ignore */ } }
    pararTracks(); chunksRef.current = []; blobRef.current = null; limparPreview(); setSeg(0); setInfo(null); setEstado('idle'); setErro(null);
    if (pele === 'zap') aoFechar?.();
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
    let envioBlob = blob;
    let mime = baseMime(mimeRef.current || blob.type || 'audio/webm');
    let ext = EXT[mime] ?? 'm4a';
    setEstado('sending'); setErro(null);
    // GRAVAÇÃO vira ogg/opus DE VERDADE antes do envio: no WhatsApp oficial (Cloud API) só esse
    // codec entrega — m4a/mp4 é aceito no upload e falha assíncrono ("Media upload error").
    // Arquivo anexado segue como está (mídia comum, por design). Se a conversão falhar,
    // cai no comportamento antigo (registrado no diag) em vez de bloquear o envio.
    const diag = { ...(diagRef.current ?? {}) };
    if (diag.origem !== 'arquivo_anexado' && mime !== 'audio/ogg') {
      try {
        const ogg = await transcodificarParaOggOpus(blob);
        diag.transcode = { de: mime, para: 'audio/ogg', bytes_antes: blob.size, bytes_depois: ogg.size };
        envioBlob = ogg; mime = 'audio/ogg'; ext = 'ogg';
      } catch (e) {
        diag.transcode_erro = String((e as Error)?.message ?? e);
      }
    }
    try {
      await onEnviar(envioBlob, mime, ext, diag); // upload + envio + confirmação real (lança em falha)
      blobRef.current = null; limparPreview(); setSeg(0); setInfo(null); setEstado('idle');
      setPrevTocando(false); setPrevPos(0);
      if (pele === 'zap') aoFechar?.();
    } catch (e) {
      setEstado('error'); setErro((e as Error).message || 'Falha ao enviar o áudio.'); // preserva o blob p/ retry
    } finally { enviandoRef.current = false; }
  }

  // seleção de arquivo de áudio existente (opt-in). Não aplica a trava de silêncio do microfone.
  function escolherArquivo(f?: File | null) {
    if (!f) return;
    geracaoRef.current += 1;
    setErro(null);
    if (!f.type.startsWith('audio/')) { setEstado('error'); setErro('Selecione um arquivo de áudio.'); return; }
    if (f.size > MAX_AUDIO) { setEstado('error'); setErro('Áudio acima de 16 MB.'); return; }
    pararMedidor(); pararTracks(); pararTimer();
    blobRef.current = f; mimeRef.current = baseMime(f.type);
    correlationRef.current = (crypto as { randomUUID?: () => string }).randomUUID?.() ?? String(Date.now());
    diagRef.current = { correlation_id: correlationRef.current, origem: 'arquivo_anexado', blob_mime: f.type, blob_size: f.size }; // arquivo → mídia comum
    limparPreview(); setPreviewUrl(URL.createObjectURL(f));
    setInfo({ mime: baseMime(f.type), size: f.size, dur: 0, sinal: true, verificando: false });
    setEstado('preview');
  }

  const nomeMic = (devices.find((d) => d.deviceId === deviceId)?.label || devices[0]?.label || '').slice(0, 30);
  // sem medidor (iOS) o pico fica sempre 0 — o aviso "sem sinal" seria um falso alarme constante
  const semSinalVivo = !ehIOS() && (estado === 'recording' || estado === 'paused') && seg >= 2 && picoVivo < 0.02;
  const seletorMic = devices.length > 1 && (
    <select className="inp arec-select" value={deviceId} onChange={(e) => trocarDispositivo(e.target.value)} title="Microfone" disabled={estado === 'sending'}>
      {devices.map((d, i) => <option key={d.deviceId || i} value={d.deviceId}>{d.label || `Microfone ${i + 1}`}</option>)}
    </select>
  );

  if (pele === 'zap') {
    const gravando = estado === 'recording' || estado === 'paused';
    const semSomArquivo = estado === 'preview' && !!info && !info.verificando && !info.sinal;
    const podeEnviar = gravando || (estado === 'preview' && !!info && !info.verificando && info.sinal) || (estado === 'error' && !!blobRef.current);
    const durPrev = info?.dur || seg;
    const aviso = estado === 'error' ? erro
      : semSomArquivo ? 'Nenhum som no áudio gravado. Troque o microfone e grave de novo.'
      : semSinalVivo ? 'Sem sinal — fale mais perto ou troque o microfone.' : '';
    return (
      <div className="fzr" role="group" aria-label="Gravação de áudio" ref={zapRef}>
        {aviso && <div className={estado === 'error' || semSomArquivo ? 'fzr-aviso erro' : 'fzr-aviso'} role={estado === 'error' ? 'alert' : 'status'}>{aviso}</div>}
        {devices.length > 1 && (semSinalVivo || semSomArquivo) && <div className="fzr-mic"><span>Microfone</span>{seletorMic}</div>}
        <div className="fzr-linha">
          <button type="button" ref={lixoRef} data-foco="lixo" className="fzr-bt" onClick={cancelar} disabled={estado === 'sending'} aria-label="Descartar áudio" title="Descartar"><IcLixo /></button>
          <div className="fzr-meio">
            {(estado === 'idle' || estado === 'requesting') && <span className="fzr-info"><span className="fzr-txt">Abrindo o microfone…</span></span>}
            {gravando && (
              <>
                <span className={'fzr-dot' + (estado === 'recording' ? ' on' : '')} aria-hidden />
                <span className="fzr-tempo num" aria-live="off">{mmss(seg)}</span>
                {estado === 'recording'
                  ? <span className="fzr-medidor" title="Nível do microfone" aria-hidden><span ref={barRef} className="fzr-medidor-bar" /></span>
                  : <span className="fz-sr">Gravação pausada</span>}
              </>
            )}
            {estado === 'preview' && previewUrl && (
              <>
                <button type="button" data-foco="ouvir" className="fzr-play" aria-label={prevTocando ? 'Pausar' : 'Ouvir'} onClick={() => { const a = prevRef.current; if (!a) return; if (a.paused) void a.play(); else a.pause(); }}>
                  {prevTocando ? <IcPausa /> : <IcPlay />}
                </button>
                <span className="fzr-trilho" aria-hidden><i style={{ width: `${durPrev ? Math.min(100, (prevPos / durPrev) * 100) : 0}%` }} /></span>
                <span className="fzr-tempo num">{mmss(prevTocando || prevPos > 0 ? prevPos : durPrev)}</span>
                {info?.verificando && <span className="fzr-info"><span className="fzr-txt">conferindo…</span></span>}
                <audio ref={prevRef} src={previewUrl} preload="metadata" hidden
                  onPlay={() => setPrevTocando(true)} onPause={() => setPrevTocando(false)}
                  onEnded={() => { setPrevTocando(false); setPrevPos(0); }}
                  onTimeUpdate={(e) => setPrevPos((e.currentTarget as HTMLAudioElement).currentTime)}
                  onLoadedMetadata={(e) => { const d = (e.currentTarget as HTMLAudioElement).duration; setInfo((x) => x ? { ...x, dur: isFinite(d) && d > 0 ? d : x.dur } : x); }} />
              </>
            )}
            {estado === 'sending' && <span className="fzr-info" role="status"><span className="fzr-spin" aria-hidden /> Enviando áudio…</span>}
            {estado === 'error' && !blobRef.current && <button type="button" className="fzr-link" onClick={() => iniciar()}>Tentar de novo</button>}
          </div>
          {gravando && (   /* UM botão só (mesma posição): trocar de estado não derruba o foco */
            <button type="button" data-foco="pausa" className={estado === 'paused' ? 'fzr-bt rec' : 'fzr-bt'} onClick={estado === 'paused' ? continuar : pausar}
              aria-label={estado === 'paused' ? 'Continuar gravando' : 'Pausar gravação'} title={estado === 'paused' ? 'Continuar' : 'Pausar'}>
              {estado === 'paused' ? <IcMicZap /> : <IcPausa />}
            </button>
          )}
          {gravando && <button type="button" className="fzr-bt" onClick={pararEOuvir} disabled={aguardandoEnvio} aria-label="Parar e ouvir antes de enviar" title="Parar e ouvir"><IcParar /></button>}
          {estado === 'preview' && <button type="button" className="fzr-bt" onClick={() => void iniciar(deviceId || undefined)} disabled={aguardandoEnvio} aria-label="Gravar de novo" title="Gravar de novo"><IcRegravar /></button>}
          <button type="button" className="fzr-enviar" disabled={disabled || !podeEnviar} aria-disabled={aguardandoEnvio || undefined} aria-busy={aguardandoEnvio || undefined}
            onClick={() => { if (aguardandoEnvio) return; if (gravando) pararEEnviar(); else void enviar(); }}
            aria-label={rotuloEnviar ?? 'Enviar áudio'} title={rotuloEnviar ?? 'Enviar áudio'}>
            {aguardandoEnvio ? <span className="fzr-spin claro" aria-hidden /> : <IcEnviar />}
          </button>
        </div>
      </div>
    );
  }

  if (estado === 'idle') {
    return (
      <>
        <button type="button" className="p-btn btn-sec btn-mini" disabled={disabled} title="Gravar áudio" onClick={() => iniciar()}><IcMic /><span>Áudio</span></button>
        {permitirArquivo && (
          <>
            <input ref={fileRef} type="file" accept="audio/*" style={{ display: 'none' }} onChange={(e) => { escolherArquivo(e.target.files?.[0]); if (e.target) e.target.value = ''; }} />
            <button type="button" className="p-btn btn-sec btn-mini" disabled={disabled} title="Selecionar arquivo de áudio" onClick={() => fileRef.current?.click()}><IcClip /><span>Arquivo</span></button>
          </>
        )}
      </>
    );
  }

  return (
    <div className="arec-panel" role="group" aria-label="Gravação de áudio">
      {estado === 'requesting' && <span className="arec-info">Solicitando microfone…</span>}

      {(estado === 'recording' || estado === 'paused') && (
        <>
          <span className={'arec-dot' + (estado === 'recording' ? ' on' : '')} />
          <span className="arec-timer">{mmss(seg)}{estado === 'paused' ? ' (pausado)' : ''}</span>
          {!ehIOS() && <span className="arec-meter" title="Nível do microfone"><span ref={barRef} className="arec-meter-bar" /></span>}
          {semSinalVivo && <span className="arec-erro">Sem sinal — fale ou troque o microfone</span>}
          {seletorMic || (nomeMic && <span className="arec-meta" title={nomeMic}>{nomeMic}</span>)}
          {estado === 'recording'
            ? <button type="button" className="p-btn btn-sec btn-mini" onClick={pausar} title="Pausar">❚❚</button>
            : <button type="button" className="p-btn btn-sec btn-mini" onClick={continuar} title="Continuar">▶</button>}
          <button type="button" className="p-btn btn-pri btn-mini" onClick={finalizar} title="Finalizar">Finalizar</button>
          <button type="button" className="p-btn btn-mini arec-ghost" onClick={cancelar} title="Cancelar">Cancelar</button>
        </>
      )}

      {estado === 'preview' && previewUrl && (
        <>
          <audio className="arec-preview" controls src={previewUrl} onLoadedMetadata={(e) => { const d = (e.currentTarget as HTMLAudioElement).duration; setInfo((x) => x ? { ...x, dur: isFinite(d) ? d : x.dur } : x); }} />
          <span className="arec-meta">{info ? `${info.dur ? mmss(info.dur) + ' · ' : ''}${baseMime(info.mime)} · ${(info.size / 1024).toFixed(0)} KB` : ''}</span>
          {info?.verificando && <span className="arec-meta">verificando o áudio…</span>}
          {info && !info.verificando && !info.sinal && <span className="arec-erro">Nenhum som no áudio gravado. Troque o microfone e regrave.</span>}
          {/* ✓ só quando o RMS foi MEDIDO de verdade; sem verificação (decode falhou/iOS)
              é aviso neutro — afirmar ✓ num arquivo não-verificável enganava o atendente */}
          {info && !info.verificando && info.sinal && info.rms !== undefined && <span className="arec-sinal">✓ som no áudio</span>}
          {info && !info.verificando && info.sinal && info.rms === undefined && <span className="arec-meta">não deu pra verificar o som — ouça o preview antes de enviar</span>}
          {seletorMic}
          <button type="button" className="p-btn btn-mini arec-ghost" onClick={() => iniciar(deviceId || undefined)} title="Gravar novamente">Regravar</button>
          <button type="button" className="p-btn btn-mini arec-ghost" onClick={cancelar} title="Apagar">Apagar</button>
          <button type="button" className="p-btn btn-pri btn-mini" disabled={!info || info.verificando || !info.sinal} onClick={enviar} title={rotuloEnviar ?? 'Enviar áudio'}>{rotuloEnviar ?? 'Enviar'}</button>
        </>
      )}

      {estado === 'sending' && <span className="arec-info"><span className="arec-spin" /> Enviando áudio…</span>}

      {estado === 'error' && (
        <>
          <span className="arec-erro">{erro}</span>
          {blobRef.current ? <button type="button" className="p-btn btn-pri btn-mini" onClick={enviar}>Tentar novamente</button> : <button type="button" className="p-btn btn-sec btn-mini" onClick={() => iniciar()}>Tentar de novo</button>}
          <button type="button" className="p-btn btn-mini arec-ghost" onClick={cancelar}>Descartar</button>
        </>
      )}
    </div>
  );
}
