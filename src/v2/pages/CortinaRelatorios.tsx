import { useEffect, useRef, useState } from 'react';

/* Cortina de entrada de Relatórios (v2.2): abertura cinematográfica curta
   (~3s) sobre o palco da página, então dissolve e revela a cascata.
   - Beat 1 (0–1.2s): eyebrow + período em display platina, tracking abrindo.
   - Beat 2 (1.2–2.4s): números-herói REAIS contando (nunca placeholder).
   - 2.4–3.2s: dissolve com a luz subindo.
   MASCARAMENTO DE CARGA: sem agregados ao fim do beat 1, segura no máximo
   +2s; dado chegou → beats seguem; erro/timeout → dissolve imediato.
   Clique/tecla pulam com fade rápido. Durações ×--fx (via CSS). */

const BEAT1_MS = 1200;
const BEAT2_MS = 1200;
const DISSOLVE_MS = 800;
const ESPERA_EXTRA_MS = 2000;

export interface HeroiCortina { rotulo: string; valor: number; fmt: (n: number) => string; }

function NumHeroi({ h, ativo }: { h: HeroiCortina; ativo: boolean }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!ativo) return;
    let raf = 0; let t0: number | null = null;
    const passo = (ts: number) => {
      if (t0 == null) t0 = ts;
      const p = Math.min((ts - t0) / 900, 1);
      setV(h.valor * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(passo);
    };
    raf = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(raf);
  }, [ativo, h.valor]);
  return <>{h.fmt(v)}</>;
}

export default function CortinaRelatorios({ periodoRotulo, herois, erro, aoTerminar }: {
  periodoRotulo: string;
  /** null = agregados ainda carregando (mascaramento de carga). */
  herois: HeroiCortina[] | null;
  erro: boolean;
  aoTerminar: () => void;
}) {
  const [fase, setFase] = useState<'beat1' | 'beat2' | 'dissolve' | 'pulo'>('beat1');
  const heroisRef = useRef(herois);
  heroisRef.current = herois;
  const erroRef = useRef(erro);
  erroRef.current = erro;
  const fimRef = useRef(aoTerminar);
  fimRef.current = aoTerminar;

  // linha do tempo dos beats + mascaramento de carga
  useEffect(() => {
    const timers: number[] = [];
    const dissolve = () => {
      setFase('dissolve');
      timers.push(window.setTimeout(() => fimRef.current(), DISSOLVE_MS));
    };
    const tentaBeat2 = (esperaAte: number) => {
      if (erroRef.current) { dissolve(); return; }
      if (heroisRef.current && heroisRef.current.length > 0) {
        setFase('beat2');
        timers.push(window.setTimeout(dissolve, BEAT2_MS));
        return;
      }
      if (Date.now() >= esperaAte) { dissolve(); return; } // timeout: ninguém fica preso atrás do pano
      timers.push(window.setTimeout(() => tentaBeat2(esperaAte), 120));
    };
    timers.push(window.setTimeout(() => tentaBeat2(Date.now() + ESPERA_EXTRA_MS), BEAT1_MS));
    return () => timers.forEach(clearTimeout);
  }, []);

  // clique/tecla pulam com fade rápido
  useEffect(() => {
    const pular = () => setFase((f) => (f === 'dissolve' || f === 'pulo' ? f : 'pulo'));
    document.addEventListener('pointerdown', pular, true);
    document.addEventListener('keydown', pular, true);
    return () => {
      document.removeEventListener('pointerdown', pular, true);
      document.removeEventListener('keydown', pular, true);
    };
  }, []);
  useEffect(() => {
    if (fase !== 'pulo') return;
    const t = window.setTimeout(() => fimRef.current(), 280);
    return () => clearTimeout(t);
  }, [fase]);

  return (
    <div className={'rl2-cortina ' + fase} aria-hidden>
      <div className="luz" />
      <div className="grao" />
      <div className="rl2-cortina-conteudo">
        <div className="rl2-cortina-eyebrow">Relatórios</div>
        <div className="rl2-cortina-titulo">{periodoRotulo}</div>
        {fase === 'beat2' && herois && (
          <div className="rl2-cortina-herois">
            {herois.slice(0, 3).map((h) => (
              <div className="rl2-cortina-heroi" key={h.rotulo}>
                <div className="hv num"><NumHeroi h={h} ativo /></div>
                <div className="hr">{h.rotulo}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
