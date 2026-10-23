/* ============================================================================
   Radar de Atendimento — AVISOS NA TELA (pedido do dono 23/10: "tem que aparecer
   já na tela da pessoa, pra ela conseguir responder o lead parado").
   Dois componentes, ambos só com os avisos do usuário LOGADO:
   - RadarPilula: 1º/2º avisos numa pílula no encaixe da BARRA SUPERIOR
     (AppShellV2 .radar-slot), prioritários primeiro (📄 documentação / 🔥
     interesse); clique abre a lista. Fica na barra de propósito: no canto
     inferior direito cobria o botão de enviar do inbox (dono 23/10). A lista
     monta na raiz de portal v2 (regra 10) — fora do backdrop-filter da barra.
   - GuardiaoAvisos: 3º aviso = TAKEOVER central até "Responder agora" ou
     assumir o risco do repasse.
   Dispensa é POR ESTÁGIO (sessionStorage, merge na escrita — os dois
   componentes gravam na mesma chave): o 2º aviso reabre mesmo que o 1º tenha
   sido dispensado. A conversa ABERTA não vira aviso (a pessoa já está lá).
   ============================================================================ */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { useGuardiaoAvisos, type GuardiaoAviso } from '@/data/vacuo';
import { tempoRelativo } from '@/data/slaView';
import { CLASSE_RAIZ_PORTAL, criarRaizPortalV2 } from './portal';
import './guardiaoAvisos.css';

const SNOOZE_KEY = 'atenvo-guardiao-snooze';

function lerSnooze(): Record<string, true> {
  try { return JSON.parse(sessionStorage.getItem(SNOOZE_KEY) ?? '{}') as Record<string, true>; } catch { return {}; }
}
function gravarSnooze(chaveAviso: string): Record<string, true> {
  const nx = { ...lerSnooze(), [chaveAviso]: true as const };
  try { sessionStorage.setItem(SNOOZE_KEY, JSON.stringify(nx)); } catch { /* ok */ }
  return nx;
}

function chave(a: GuardiaoAviso): string { return a.alertaId + ':' + a.n; }

function prioSelo(a: GuardiaoAviso): { txt: string; cls: string } | null {
  if (a.prio === 'docs') return { txt: '📄 Documentação enviada', cls: 'docs' };
  if (a.prio === 'quente') return { txt: '🔥 Interesse confirmado', cls: 'quente' };
  return null;
}

/** Avisos visíveis do usuário: sem os dispensados e sem a conversa que já está aberta. */
function useAvisosVisiveis() {
  const avisos = useGuardiaoAvisos();
  const nav = useNavigate();
  const location = useLocation();
  const [snooze, setSnooze] = useState<Record<string, true>>(lerSnooze);
  const [agora, setAgora] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setAgora(Date.now()), 30_000); return () => clearInterval(t); }, []);
  const conversaAberta = new URLSearchParams(location.search).get('conversa');
  const visiveis = useMemo(
    () => avisos.filter((a) => !snooze[chave(a)] && a.conversaId !== conversaAberta),
    [avisos, snooze, conversaAberta],
  );
  const dispensar = (a: GuardiaoAviso) => setSnooze(gravarSnooze(chave(a)));
  const responder = (a: GuardiaoAviso) => {
    dispensar(a);
    nav('/whatsapp?conversa=' + encodeURIComponent(a.conversaId));
  };
  return { visiveis, agora, dispensar, responder };
}

/** Pílula da barra superior (1º/2º avisos) + lista ao clicar. */
export function RadarPilula() {
  const { visiveis, agora, dispensar, responder } = useAvisosVisiveis();
  const pilha = visiveis.filter((a) => a.n < 3);
  const topo = pilha[0] ?? null;
  const maxN = pilha.reduce((m, a) => Math.max(m, a.n), 0);
  const temPrio = pilha.some((a) => a.prio);

  const [aberto, setAberto] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const pilulaRef = useRef<HTMLButtonElement>(null);
  const listaRef = useRef<HTMLDivElement>(null);
  // raiz de portal (regra 10): a lista monta no body com .v2 — a barra tem backdrop-filter,
  // que prenderia um position:fixed dentro dela. Reusa 1 nó por sessão.
  const raiz = useMemo(() => {
    const sel = '.' + CLASSE_RAIZ_PORTAL.split(' ').join('.') + '[data-radar-lista]';
    let el = document.querySelector(sel) as HTMLElement | null;
    if (!el) { el = criarRaizPortalV2(document) as unknown as HTMLElement; el.setAttribute('data-radar-lista', '1'); }
    return el;
  }, []);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      const alvo = e.target as Node;
      if (pilulaRef.current?.contains(alvo) || listaRef.current?.contains(alvo)) return;
      setAberto(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false); };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc); };
  }, [aberto]);

  useEffect(() => { if (!topo) setAberto(false); }, [topo]);

  if (!topo) return null;

  return (
    <>
      <button type="button" ref={pilulaRef} aria-live="polite"
        className={'gva-pilula n' + maxN + (temPrio ? ' prio' : '') + (aberto ? ' on' : '')}
        aria-expanded={aberto} title="Clientes sem resposta — clique para ver"
        onClick={() => {
          const r = pilulaRef.current?.getBoundingClientRect();
          if (r) setPos({ top: r.bottom + 8, left: r.left + r.width / 2 });
          setAberto((v) => !v);
        }}>
        <i className="gva-dot" aria-hidden />
        {pilha.length === 1
          ? <><b>{topo.prio === 'docs' ? '📄 ' : topo.prio === 'quente' ? '🔥 ' : ''}{topo.nome}</b><span>{topo.n}º aviso · sem resposta {tempoRelativo(topo.desde, agora)}</span></>
          : <><b>{pilha.length} clientes sem resposta</b><span>{temPrio ? 'tem prioritário' : `até o ${maxN}º aviso`}</span></>}
        <svg viewBox="0 0 10 6" aria-hidden><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>

      {aberto && pos && createPortal(
        <div className="gva-lista" role="menu" ref={listaRef} style={{ top: pos.top, left: pos.left }}>
          {pilha.map((a) => {
            const selo = prioSelo(a);
            return (
              <div key={chave(a)} className={'gva-card n' + a.n + (a.prio ? ' prio' : '')}>
                <button type="button" className="gva-x" aria-label="Dispensar este aviso" title="Dispensar (volta no próximo aviso)" onClick={() => dispensar(a)}>×</button>
                <div className="gva-topo">
                  <span className={'gva-n n' + a.n}>{a.n}º aviso</span>
                  {selo && <span className={'gva-prio ' + selo.cls}>{selo.txt}</span>}
                </div>
                <div className="gva-nome">{a.nome}</div>
                <div className="gva-sub">sem resposta {tempoRelativo(a.desde, agora)} · {a.n === 2 ? 'o próximo é o último aviso' : 'responda pra parar a escalada'}</div>
                <button type="button" className="gva-btn pri" onClick={() => { setAberto(false); responder(a); }}>Responder agora</button>
              </div>
            );
          })}
        </div>,
        raiz,
      )}
    </>
  );
}

/** Takeover central do 3º e último aviso. */
export function GuardiaoAvisos() {
  const { visiveis, agora, dispensar, responder } = useAvisosVisiveis();
  const takeover = visiveis.find((a) => a.n === 3) ?? null;
  if (!takeover) return null;
  const selo = prioSelo(takeover);
  return (
    <div className="gva-tk" role="alertdialog" aria-modal="true" aria-label="Último aviso do Radar de Atendimento">
      <div className="gva-tk-card">
        <div className="gva-tk-rotulo">🚨 3º e último aviso</div>
        <div className="gva-tk-nome">{takeover.nome}</div>
        {selo && <span className={'gva-prio ' + selo.cls}>{selo.txt}</span>}
        <p className="gva-tk-txt">
          Este cliente está no vácuo {tempoRelativo(takeover.desde, agora)} e você já recebeu dois avisos.
          Se não responder agora, o cliente será <b>repassado para quem mais fecha</b> e a punição ficará registrada no painel.
        </p>
        <div className="gva-tk-acoes">
          <button type="button" className="gva-btn pri" onClick={() => responder(takeover)}>Responder agora</button>
          <button type="button" className="gva-btn sec" onClick={() => dispensar(takeover)}>Assumir o risco do repasse</button>
        </div>
      </div>
    </div>
  );
}
