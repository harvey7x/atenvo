import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { criarRaizPortalV2 } from './portal';
import { BotaoPrimario } from './Botao';
import { LogoAtenvo } from './LogoAtenvo';
import { Toggle } from './Toggle';
import { assinarAcento, lerAcento, salvarAcento, type Acento } from '../lib/acento';
import { assinarModoPerf, lerModoPerf, salvarModoPerf, type ModoPerf } from '../lib/perf';
import type { Tema } from '../lib/tema';
import { saudacaoPorHora } from '../lib/introDia';
import { BRIEF_REAL, seedBriefingDia, useBriefingDia, type BriefingDia } from '@/data/introDia';

/* ------------------------------------------------------------------
   Intro do dia v2 (dono 28/08: "mais completo, mais profissional") —
   TAKEOVER de tela cheia: o app fica embaçado atrás (vidro fumê pesado,
   mesma exceção de blur das janelas) e a recepção sobe em cascata:
   marca → data → saudação → briefing (números CONTAM) → cor de hoje →
   modo Leve → CTA. Escolher cor aplica AO VIVO — o app atrás do vidro
   troca junto. Fechar por qualquer via (CTA, véu, Esc) marca o dia.
   ------------------------------------------------------------------ */

/* amostras fixas dos acentos (tom do dark — identidade do seletor, não interação) */
const CORES: { valor: Acento; rotulo: string; cor: string }[] = [
  { valor: 'azul', rotulo: 'Azul', cor: '#4C8DFF' },
  { valor: 'verde', rotulo: 'Verde', cor: '#3BD689' },
  { valor: 'dourado', rotulo: 'Dourado', cor: '#F0BC4E' },
];

const plural = (n: number, um: string, muitos: string) => (n === 1 ? um : muitos);

/* ícones mini do tema (traço fino, par dos da topbar) */
const IcLua = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a7 7 0 0 0 11 11z" />
  </svg>
);
const IcSol = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
    <circle cx="12" cy="12" r="4.2" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" />
  </svg>
);

/* contagem crescente com guarda de visibilidade (aba oculta congela o rAF —
   mesmo contrato do Contador do Dashboard: sem veredito, mostra o valor) */
function Contagem({ ate }: { ate: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (ate <= 0 || document.visibilityState === 'hidden') { setV(ate); return; }
    const dur = 900;
    let ini = 0;
    let raf = 0;
    const passo = (t: number) => {
      if (!ini) ini = t;
      const p = Math.min(1, (t - ini) / dur);
      setV(Math.round(ate * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(passo);
    };
    raf = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(raf);
  }, [ate]);
  return <>{v}</>;
}

export function IntroDia({ aberta, aoConcluir, nome, tema, aoMudarTema }: {
  aberta: boolean;
  aoConcluir: () => void;
  nome: string;
  /* tema é estado do SHELL (dono do sol/lua da topbar) — vem por props pra
     não divergir; a intro só escolhe */
  tema: Tema;
  aoMudarTema: (novo: Tema) => void;
}) {
  const [acento, setAcento] = useState<Acento>(() => lerAcento());
  useEffect(() => assinarAcento(setAcento), []);
  const [modoPerf, setModoPerf] = useState<ModoPerf>(() => lerModoPerf());
  useEffect(() => assinarModoPerf(setModoPerf), []);

  const briefQ = useBriefingDia(aberta);
  const brief: BriefingDia | undefined = BRIEF_REAL ? briefQ.data : seedBriefingDia();

  const aoConcluirRef = useRef(aoConcluir);
  useEffect(() => { aoConcluirRef.current = aoConcluir; });

  // raiz de portal atrelada a `aberta` (mesmo ciclo do ModalV2: sem nós órfãos)
  const [raiz, setRaiz] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!aberta) return;
    const el = criarRaizPortalV2(document) as unknown as HTMLElement;
    setRaiz(el);
    return () => { el.remove(); setRaiz(null); };
  }, [aberta]);

  useEffect(() => {
    if (!aberta) return;
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === 'Escape') aoConcluirRef.current(); };
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [aberta]);

  if (!aberta || !raiz) return null;

  const primeiroNome = nome.trim().split(/\s+/)[0] || 'Equipe';
  const dataLonga = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

  return createPortal(
    <div
      className="intro-veu"
      role="dialog"
      aria-modal="true"
      aria-label="Boas-vindas do dia"
      onMouseDown={(e) => { if (e.target === e.currentTarget) aoConcluir(); }}
    >
      <div className="intro-palco">
        <LogoAtenvo className="it-marca" />
        <div className="it-eyebrow">{dataLonga}</div>
        <h1 className="it-titulo">{saudacaoPorHora()}, {primeiroNome}.</h1>
        <p className="it-sub">Seja bem-vindo ao Atenvo. O seu dia, num relance:</p>

        <div className="it-stats">
          {brief ? (
            <>
              <div className="it-stat">
                <b><Contagem ate={brief.paraAtender} /></b>
                <span>{plural(brief.paraAtender, 'cliente novo pra atender', 'clientes novos pra atender')}</span>
              </div>
              <div className="it-stat">
                <b><Contagem ate={brief.naoLidas} /></b>
                <span>{plural(brief.naoLidas, 'conversa não lida', 'conversas não lidas')}</span>
              </div>
              <div className="it-stat ok">
                <b><Contagem ate={brief.fechadosSemana} /></b>
                <span>{plural(brief.fechadosSemana, 'cliente fechado na semana', 'clientes fechados na semana')}</span>
              </div>
            </>
          ) : (
            <div className="it-carregando">Contando os atendimentos…</div>
          )}
        </div>

        <div className="it-sec">
          <div className="it-rot">Selecione a cor de hoje</div>
          <div className="it-cores" role="radiogroup" aria-label="Cor do sistema">
            {CORES.map((c) => (
              <button
                key={c.valor}
                type="button"
                role="radio"
                aria-checked={acento === c.valor}
                className={acento === c.valor ? 'it-cor on' : 'it-cor'}
                onClick={() => salvarAcento(c.valor)}
              >
                <span className="it-sw" style={{ background: c.cor }} aria-hidden />
                {c.rotulo}
              </button>
            ))}
          </div>
        </div>

        <div className="it-sec">
          <div className="it-rot">Escuro ou claro?</div>
          <div className="it-cores it-temas" role="radiogroup" aria-label="Tema do sistema">
            <button
              type="button" role="radio" aria-checked={tema === 'dark'}
              className={tema === 'dark' ? 'it-cor on' : 'it-cor'}
              onClick={() => aoMudarTema('dark')}
            >
              <IcLua /> Escuro
            </button>
            <button
              type="button" role="radio" aria-checked={tema === 'light'}
              className={tema === 'light' ? 'it-cor on' : 'it-cor'}
              onClick={() => aoMudarTema('light')}
            >
              <IcSol /> Claro
            </button>
          </div>
        </div>

        <div className="it-linha">
          <div>
            <div className="it-rot" id="it-rot-leve">Modo Leve</div>
            <div className="it-sub2">visual sólido, mais rápido em qualquer máquina</div>
          </div>
          <Toggle
            ligado={modoPerf === 'lite'}
            aoMudar={(v) => salvarModoPerf(v ? 'lite' : 'full')}
            rotuladoPor="it-rot-leve"
          />
        </div>

        <BotaoPrimario className="it-cta" onClick={aoConcluir}>Começar o dia</BotaoPrimario>
      </div>
    </div>,
    raiz,
  );
}
