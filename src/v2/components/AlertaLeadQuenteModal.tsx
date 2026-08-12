import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { criarRaizPortalV2 } from './portal';
import { BotaoPrimario } from './Botao';
import { rotuloPasso, type AlertaLeadQuente, type ResultadoAssumir } from '@/data/alertasLeadQuente';
import './componentes.css';

/* ------------------------------------------------------------------
   Modal central de LEAD QUENTE (abandono do fluxo do bot).
   NÃO usa ModalV2 de propósito: aquele autofoca o primeiro botão e
   fecha no Esc/véu — aqui NADA pode roubar o foco do teclado de quem
   digita em outra conversa (sem autofocus, sem focus trap, sem Esc,
   véu não fecha; só os dois botões agem). Som sintetizado via
   WebAudio (sem asset); cronômetro corre desde o abandono real
   (última mensagem do cliente), não desde a criação do alerta.
   ------------------------------------------------------------------ */

function tocarSino() {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ac = new AC();
    const t0 = ac.currentTime;
    [880, 1174.66, 880].forEach((freq, i) => {
      const o = ac.createOscillator(); const g = ac.createGain();
      o.type = 'sine'; o.frequency.value = freq;
      o.connect(g); g.connect(ac.destination);
      const t = t0 + i * 0.22;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.16, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
      o.start(t); o.stop(t + 0.65);
    });
    window.setTimeout(() => { void ac.close(); }, 1800);
  } catch { /* autoplay bloqueado sem gesto — o modal visual continua */ }
}

function cronometro(desdeIso: string, agoraMs: number): string {
  const s = Math.max(0, Math.floor((agoraMs - new Date(desdeIso).getTime()) / 1000));
  const mm = Math.floor(s / 60); const ss = s % 60;
  return `${mm}:${String(ss).padStart(2, '0')}`;
}

export function AlertaLeadQuenteModal({ alerta, aoAssumir, aoDispensar }: {
  alerta: AlertaLeadQuente;
  aoAssumir: () => Promise<ResultadoAssumir>;
  aoDispensar: () => void;
}) {
  const [agora, setAgora] = useState(() => Date.now());
  const [fase, setFase] = useState<'pendente' | 'assumindo' | 'perdido'>('pendente');
  const [porNome, setPorNome] = useState('');
  const soouRef = useRef(false);

  // raiz de portal própria (mesma família do ModalV2, sem o autofoco dele)
  const [raiz, setRaiz] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = criarRaizPortalV2(document) as HTMLDivElement;
    setRaiz(el);
    return () => { el.remove(); setRaiz(null); };
  }, []);

  useEffect(() => {
    const t = window.setInterval(() => setAgora(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  // som ao aparecer + um reforço em 12s se ninguém agiu (discreto, não infinito)
  useEffect(() => {
    if (soouRef.current) return;
    soouRef.current = true;
    tocarSino();
    const t = window.setTimeout(() => tocarSino(), 12_000);
    return () => window.clearTimeout(t);
  }, []);

  const assumir = async () => {
    if (fase !== 'pendente') return;
    setFase('assumindo');
    const r = await aoAssumir();
    if (!r.ok && r.motivo === 'ja_assumido') { setPorNome(r.porNome); setFase('perdido'); }
    // ok / cancelado / erro: o pai fecha (fila realtime) — nada a fazer aqui
  };

  if (!raiz) return null;
  return createPortal(
    <div className="veu" style={{ zIndex: 300 }}>
      <div className="p-modal vidro" role="alertdialog" aria-label="Lead quente abandonou o fluxo"
           style={{ width: 460, padding: 0, overflow: 'hidden' }}>
        {/* faixa de urgência */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '13px 18px',
          background: 'linear-gradient(90deg, rgba(255,107,92,.14), transparent 70%)',
          borderBottom: '1px solid var(--linha)',
        }}>
          <span aria-hidden style={{
            width: 9, height: 9, borderRadius: '50%', background: '#ff6b5c',
            boxShadow: '0 0 0 0 rgba(255,107,92,.5)', animation: 'alq-pulso 1.6s ease-out infinite',
          }} />
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: '#ff8a7a' }}>
            Lead quente — abandonou o fluxo
          </div>
          <div style={{
            marginLeft: 'auto', fontVariantNumeric: 'tabular-nums', fontSize: 20, fontWeight: 700,
            color: 'var(--txt)',
          }}>
            {cronometro(alerta.abandonadoEm, agora)}
          </div>
        </div>

        <div style={{ padding: '16px 18px 6px' }}>
          <div style={{ fontSize: 19, fontWeight: 700, color: 'var(--txt)', lineHeight: 1.25 }}>{alerta.contatoNome}</div>
          {alerta.contatoTelefone && (
            <div style={{ marginTop: 3, fontSize: 14, color: 'var(--txt-2)', fontVariantNumeric: 'tabular-nums' }}>
              {alerta.contatoTelefone}
            </div>
          )}
          <div style={{ marginTop: 10, fontSize: 13, color: 'var(--txt-2)' }}>
            <span style={{ color: 'var(--txt-3)' }}>Onde parou: </span>{rotuloPasso(alerta.passo)}
          </div>
          <div style={{ marginTop: 6, fontSize: 12.5, color: 'var(--txt-3)' }}>
            Estava conversando com o bot e sumiu. Ligar agora dobra a chance de fechar.
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px 16px' }}>
          {fase === 'perdido' ? (
            <div style={{ fontSize: 13.5, color: 'var(--txt-2)', padding: '8px 0' }}>
              Já assumido por <strong style={{ color: 'var(--txt)' }}>{porNome}</strong>.
            </div>
          ) : (
            <>
              <BotaoPrimario onClick={() => void assumir()} disabled={fase === 'assumindo'} style={{ flex: 1 }}>
                {fase === 'assumindo' ? 'Assumindo…' : 'Assumir cliente'}
              </BotaoPrimario>
              {/* dispensar DISCRETO (decisão do dono: cancela pra equipe toda) */}
              <button type="button" onClick={aoDispensar} disabled={fase === 'assumindo'} style={{
                background: 'none', border: 'none', cursor: 'pointer', fontSize: 12.5,
                color: 'var(--txt-3)', textDecoration: 'underline', textUnderlineOffset: 3, padding: '6px 2px',
              }}>
                dispensar
              </button>
            </>
          )}
        </div>
      </div>
      <style>{'@keyframes alq-pulso { 0% { box-shadow: 0 0 0 0 rgba(255,107,92,.5); } 70% { box-shadow: 0 0 0 9px rgba(255,107,92,0); } 100% { box-shadow: 0 0 0 0 rgba(255,107,92,0); } }'}</style>
    </div>,
    raiz,
  );
}
