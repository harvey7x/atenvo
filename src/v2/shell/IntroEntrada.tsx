import { useEffect, useRef, useState } from 'react';
import './shell.css';

/**
 * Intro de entrada — "o sistema acorda" (~2,2s):
 * (a) 0–0,9s  eyebrow surge + saudação .p-display com o tracking abrindo;
 * (b) 0,9–1,4s hold;
 * (c) 1,4–2,2s o texto dissolve enquanto o overlay abre — a luz ambiente
 *     e a página por trás (cascata re-disparada via aoAbrir) são reveladas.
 * Qualquer clique ou tecla pula com fade rápido. O chamador é responsável
 * pelas demais travas (uma vez por login, reduced-motion, rota autenticada).
 */
export function IntroEntrada({ nome, aoAbrir, aoTerminar }: {
  nome: string;
  /** Disparado UMA vez quando a abertura começa (normal ou pulada) — re-dispara a cascata da página. */
  aoAbrir: () => void;
  aoTerminar: () => void;
}) {
  const [fase, setFase] = useState<'texto' | 'abrindo' | 'pulando'>('texto');
  const abriu = useRef(false);

  function abrir(pulando: boolean) {
    if (abriu.current) return;
    abriu.current = true;
    setFase(pulando ? 'pulando' : 'abrindo');
    aoAbrir();
  }

  useEffect(() => {
    const t1 = window.setTimeout(() => abrir(false), 1400);
    const t2 = window.setTimeout(aoTerminar, 2200);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // pulo por tecla (o clique é tratado no próprio overlay)
  useEffect(() => {
    function aoTeclar() { pular(); }
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fase]);

  function pular() {
    if (fase !== 'texto') return;
    abrir(true);
    window.setTimeout(aoTerminar, 220);
  }

  const h = new Date().getHours();
  const saudacao = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';

  return (
    <div className={`intro-entrada ${fase}`} onMouseDown={pular} role="presentation" aria-hidden>
      <div className="intro-luz" />
      <div className="intro-miolo">
        <span className="caps intro-eyebrow">Bem-vindo ao Atenvo</span>
        <div className="p-display intro-saudacao">
          {saudacao}{nome ? `, ${nome}` : ''}.
        </div>
      </div>
    </div>
  );
}
