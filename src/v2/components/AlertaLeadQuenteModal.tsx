import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { criarRaizPortalV2 } from './portal';
import { BotaoPrimario } from './Botao';
import { rotuloPasso, type AlertaLeadQuente, type ResultadoAssumir } from '@/data/alertasLeadQuente';
import './componentes.css';
import './alertaLeadQuente.css';

/* ------------------------------------------------------------------
   Modal central de LEAD QUENTE (abandono do fluxo do bot).
   COMPORTAMENTO validado em produção 2026-08-13 — congelado: sem
   autofocus, sem focus trap, sem Esc, véu não fecha; som WebAudio;
   cronômetro desde o abandono real. Pele visual definitiva "Vidro e
   profundidade" (escolha do dono entre 3 direções) — estilos em
   alertaLeadQuente.css, 100% tokens Platina.
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

function cronometro(desdeIso: string, agoraMs: number): { rotulo: string; minutos: number } {
  const s = Math.max(0, Math.floor((agoraMs - new Date(desdeIso).getTime()) / 1000));
  const mm = Math.floor(s / 60); const ss = s % 60;
  return { rotulo: `${mm}:${String(ss).padStart(2, '0')}`, minutos: mm };
}

/** Cronômetro fica "quente" (rubro) depois deste tanto de minutos de espera. */
const MIN_CRONOMETRO_QUENTE = 15;

/* Textos por tipo de alerta: abandono (sumiu no meio) × concluído (entregou o
   CPF e está aguardando — o mais quente dos dois). Mesma pele, urgência igual. */
function textosDoTipo(a: AlertaLeadQuente) {
  if (a.tipo === 'concluido') {
    return {
      selo: 'Aguardando ligação',
      rot: 'Situação',
      passo: 'Concluiu a qualificação e enviou o CPF',
      frase: 'Está esperando o consultor agora. Ligar em minutos fecha o negócio.',
    };
  }
  return {
    selo: 'Lead quente',
    rot: 'Onde parou',
    passo: rotuloPasso(a.passo),
    frase: 'Estava conversando com o bot e sumiu. Ligar agora dobra a chance de fechar.',
  };
}

export function AlertaLeadQuenteModal({ alerta, qtdFila = 0, aoAssumir, aoDispensar }: {
  alerta: AlertaLeadQuente;
  /** quantos alertas ALÉM deste aguardam na fila (mostra "+N na fila") */
  qtdFila?: number;
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
  const cron = cronometro(alerta.abandonadoEm, agora);
  const quente = cron.minutos >= MIN_CRONOMETRO_QUENTE;
  const txt = textosDoTipo(alerta);

  return createPortal(
    <div className="alq-veu">
      <div className="alq-cartao" role="alertdialog" aria-label="Lead quente aguardando atendimento">
        <div className="alq-topo">
          <span className="alq-selo"><span className="alq-dot" aria-hidden /> {txt.selo}</span>
          {qtdFila > 0 && <span className="alq-fila">+{qtdFila} na fila</span>}
          <div className={'alq-cron' + (quente ? ' quente' : '')}>{cron.rotulo}</div>
        </div>
        <div className="alq-meio">
          <div className="alq-nome">{alerta.contatoNome}</div>
          {alerta.contatoTelefone && <div className="alq-fone">{alerta.contatoTelefone}</div>}
          <div className="alq-info">
            <span className="alq-rot">{txt.rot}</span>
            <span className="alq-passo">{txt.passo}</span>
            <span className="alq-frase">{txt.frase}</span>
          </div>
        </div>
        <div className="alq-acoes">
          {fase === 'perdido' ? (
            <div className="alq-perdido">Já assumido por <strong>{porNome}</strong>.</div>
          ) : (
            <>
              <BotaoPrimario onClick={() => void assumir()} disabled={fase === 'assumindo'}>
                {fase === 'assumindo' ? 'Assumindo…' : 'Assumir cliente'}
              </BotaoPrimario>
              <button type="button" className="alq-dispensar" onClick={aoDispensar} disabled={fase === 'assumindo'}>
                dispensar
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    raiz,
  );
}
