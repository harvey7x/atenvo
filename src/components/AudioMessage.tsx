import { useRef, useState, type ReactNode } from 'react';
import './AudioMessage.css';

// Registro global: ao tocar um áudio, pausa qualquer outro que esteja tocando.
let audioAtivo: HTMLAudioElement | null = null;

const mmss = (s: number) => {
  if (!isFinite(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60), x = Math.floor(s % 60);
  return m + ':' + String(x).padStart(2, '0');
};

interface Props {
  /** Caminho no bucket privado (nunca URL permanente). */
  path: string;
  nome?: string | null;
  /** Gera a URL assinada SOB DEMANDA. Deve renovar quando chamada de novo (após expirar). */
  resolveUrl: (path: string) => Promise<string | null>;
  time?: ReactNode;
  statusNode?: ReactNode;
  falhou?: boolean;
  onRetry?: () => void;
}

/** Player de áudio reutilizável para o histórico (play/pause, progresso, velocidade, URL sob demanda). */
export function AudioMessage({ path, nome, resolveUrl, time, statusNode, falhou, onRetry }: Props) {
  const ref = useRef<HTMLAudioElement>(null);
  const [loading, setLoading] = useState(false);
  const [indisponivel, setIndisponivel] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [rate, setRate] = useState(1);
  const carregadoRef = useRef(false); // já temos uma URL válida aplicada ao elemento?

  async function garantirSrc(force = false): Promise<boolean> {
    const el = ref.current; if (!el) return false;
    if (carregadoRef.current && !force) return true;
    setLoading(true); setIndisponivel(false);
    const u = await resolveUrl(path); // renova a cada chamada (sob demanda)
    setLoading(false);
    if (!u) { setIndisponivel(true); return false; }
    el.src = u; carregadoRef.current = true; return true;
  }

  async function toggle() {
    const el = ref.current; if (!el) return;
    if (playing) { el.pause(); return; }
    if (!carregadoRef.current) { const okk = await garantirSrc(); if (!okk) return; }
    if (audioAtivo && audioAtivo !== el) { try { audioAtivo.pause(); } catch { /* ignore */ } }
    el.playbackRate = rate;
    try { await el.play(); audioAtivo = el; } catch { setIndisponivel(true); }
  }

  function ciclarVelocidade() {
    const prox = rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1;
    setRate(prox); if (ref.current) ref.current.playbackRate = prox;
  }

  function seek(v: number) { const el = ref.current; if (el && isFinite(v)) { el.currentTime = v; setCur(v); } }

  async function onError() {
    // pode ser URL expirada: tenta renovar uma vez, sob demanda.
    carregadoRef.current = false;
    if (!indisponivel) { const okk = await garantirSrc(true); if (okk && ref.current) { try { await ref.current.play(); } catch { setIndisponivel(true); } } }
  }

  if (indisponivel) {
    return (
      <div className="audio-msg audio-indisponivel">
        <span className="audio-fallback">Áudio indisponível</span>
        <button type="button" className="audio-mini-btn" onClick={() => garantirSrc(true)} title="Tentar carregar de novo">↻</button>
        {time && <span className="audio-time-meta">{time}{statusNode}</span>}
      </div>
    );
  }

  return (
    <div className="audio-msg">
      <audio ref={ref} preload="none"
        onLoadedMetadata={(e) => setDur((e.target as HTMLAudioElement).duration || 0)}
        onTimeUpdate={(e) => setCur((e.target as HTMLAudioElement).currentTime || 0)}
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setCur(0); }} onError={onError} />
      <button type="button" className="audio-play" onClick={toggle} aria-label={playing ? 'Pausar' : 'Reproduzir'} disabled={loading}>
        {loading ? <span className="audio-spin" /> : playing ? '❚❚' : '▶'}
      </button>
      <div className="audio-body">
        <input className="audio-range" type="range" min={0} max={dur || 0} step={0.1} value={Math.min(cur, dur || 0)}
          onChange={(e) => seek(parseFloat(e.target.value))} aria-label="Progresso do áudio" />
        <div className="audio-meta">
          <span className="audio-clock">{mmss(cur)} / {mmss(dur)}</span>
          {nome && <span className="audio-nome" title={nome}>{nome}</span>}
          <button type="button" className="audio-rate" onClick={ciclarVelocidade} title="Velocidade">{rate}x</button>
        </div>
      </div>
      <span className="audio-time-meta">{time}{statusNode}{falhou && onRetry && <button type="button" className="audio-retry" onClick={onRetry}>Tentar novamente</button>}</span>
    </div>
  );
}
