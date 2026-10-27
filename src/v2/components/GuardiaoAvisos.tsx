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
     "Responder depois". Com 1 dia útil sem resposta o GESTOR decide o repasse
     (nada é repassado automaticamente — dono 23/10); o gestor vê uma pílula
     própria "⚖ N decisões de repasse" que leva ao /radar.
   Dispensa é POR ESTÁGIO (sessionStorage, merge na escrita — os dois
   componentes gravam na mesma chave): o 2º aviso reabre mesmo que o 1º tenha
   sido dispensado. A conversa ABERTA não vira aviso (a pessoa já está lá).
   ============================================================================ */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { useGuardiaoAvisos, useVacuoDecisoes, useLigarMeus, useConcluirLigacao, useVacuoConfig, radarHorarioAberto, useCutucadasMeus, type GuardiaoAviso } from '@/data/vacuo';
import { useOrg } from '@/context/OrgContext';
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

/** Pílula do GESTOR: decisões de repasse pendentes (1 dia útil sem resposta) → /radar. */
function PilulaDecisoes() {
  const { currentOrg } = useOrg();
  const nav = useNavigate();
  const decisoesQ = useVacuoDecisoes();
  const n = currentOrg.role === 'admin' ? (decisoesQ.data ?? []).length : 0;
  if (n === 0) return null;
  return (
    <button type="button" className="gva-pilula n2 decisao" title="Clientes com 1 dia útil sem resposta — decida o repasse"
      onClick={() => nav('/radar')}>
      <i className="gva-dot" aria-hidden />
      <b>⚖️ {n} {n === 1 ? 'decisão' : 'decisões'} de repasse</b>
      <span>aguardando você</span>
    </button>
  );
}

/** Raiz de portal v2 reaproveitada por sessão (regra 10) — uma por lista suspensa. */
function useRaizPortal(marca: string): HTMLElement {
  return useMemo(() => {
    const sel = '.' + CLASSE_RAIZ_PORTAL.split(' ').join('.') + '[' + marca + ']';
    let el = document.querySelector(sel) as HTMLElement | null;
    if (!el) { el = criarRaizPortalV2(document) as unknown as HTMLElement; el.setAttribute(marca, '1'); }
    return el;
  }, [marca]);
}

/** Pílula "📞 Ligar": leads do PRÓPRIO usuário que pararam de responder o robô (2 h úteis). */
function PilulaLigar() {
  const itens = useLigarMeus();
  const nav = useNavigate();
  const concluir = useConcluirLigacao();
  const [agora, setAgora] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setAgora(Date.now()), 30_000); return () => clearInterval(t); }, []);
  const [aberto, setAberto] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const pilulaRef = useRef<HTMLButtonElement>(null);
  const listaRef = useRef<HTMLDivElement>(null);
  const raiz = useRaizPortal('data-radar-ligar');

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
  useEffect(() => { if (itens.length === 0) setAberto(false); }, [itens.length]);

  if (itens.length === 0) return null;
  const primeiro = itens[0];
  return (
    <>
      <button type="button" ref={pilulaRef} className={'gva-pilula ligar' + (aberto ? ' on' : '')} aria-expanded={aberto}
        title="Leads que pararam de responder o robô — ligue para retomar a venda"
        onClick={() => {
          const r = pilulaRef.current?.getBoundingClientRect();
          if (r) setPos({ top: r.bottom + 8, left: r.left + r.width / 2 });
          setAberto((v) => !v);
        }}>
        <i className="gva-dot" aria-hidden />
        {itens.length === 1
          ? <><b>📞 Ligar: {primeiro.nome}</b><span>parou no robô</span></>
          : <><b>📞 {itens.length} clientes pra ligar</b><span>pararam no robô</span></>}
        <svg viewBox="0 0 10 6" aria-hidden><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {aberto && pos && createPortal(
        <div className="gva-lista" role="menu" ref={listaRef} style={{ top: pos.top, left: pos.left }}>
          {itens.map((it) => (
            <div key={it.alertaId} className="gva-card ligar">
              <div className="gva-topo"><span className="gva-n ligar">📞 Ligar</span></div>
              <div className="gva-nome">{it.nome}</div>
              <div className="gva-sub">parou de responder o robô · aviso {tempoRelativo(it.desde, agora)}</div>
              <div className="gva-dupla">
                <button type="button" className="gva-btn sec" onClick={() => { setAberto(false); nav('/whatsapp?conversa=' + encodeURIComponent(it.conversaId)); }}>Abrir conversa</button>
                <button type="button" className="gva-btn pri" disabled={concluir.isPending}
                  onClick={() => { setErro(null); concluir.mutate(it.conversaId, { onError: (e) => setErro((e as Error).message) }); }}>
                  Já liguei
                </button>
              </div>
            </div>
          ))}
          {erro && <div className="gva-erro">{erro}</div>}
        </div>,
        raiz,
      )}
    </>
  );
}

/** Re-renderiza a cada minuto e diz se o Radar está no horário útil (seg–sex, 9h–18h). */
function useRadarAberto(): boolean {
  const cfgQ = useVacuoConfig();
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 60_000); return () => clearInterval(t); }, []);
  return radarHorarioAberto(cfgQ.data);
}

/** Pílulas da barra superior: avisos (1º/2º), clientes pra ligar e decisões do gestor.
    Fora do horário útil nada aparece (dono 26/10: sem aviso no fim de semana/fora das 9–18h). */
export function RadarPilula() {
  if (!useRadarAberto()) return null;
  return (
    <>
      <PilulaAvisos />
      <PilulaLigar />
      <PilulaDecisoes />
    </>
  );
}

/** Pílula dos avisos 1º/2º do usuário + lista ao clicar. */
function PilulaAvisos() {
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
/** "👉 O gestor pediu": aviso de tela cheia do CUTUCÃO. Pedido direto do gestor — não depende do
    horário útil e passa na frente do 3º aviso. Dispensa por alerta (recutucar cria alerta novo). */
function CutucadaTakeover({ aoMostrar }: { aoMostrar: (sim: boolean) => void }) {
  const cutucadas = useCutucadasMeus();
  const nav = useNavigate();
  const location = useLocation();
  const [snooze, setSnooze] = useState<Record<string, true>>(lerSnooze);
  const conversaAberta = new URLSearchParams(location.search).get('conversa');
  const atual = cutucadas.find((c) => !snooze['cut:' + c.alertaId] && c.conversaId !== conversaAberta) ?? null;
  useEffect(() => { aoMostrar(!!atual); }, [atual, aoMostrar]);
  if (!atual) return null;
  const dispensar = () => setSnooze(gravarSnooze('cut:' + atual.alertaId));
  // o texto do alerta vem do banco no formato "…sem resposta desde DD/MM às HH:MM… <Gestor> pediu…";
  // extrai os fatos pra mostrar organizados (se o formato mudar, cai no texto corrido)
  const desde = /desde (\d{2}\/\d{2} às \d{2}:\d{2})/.exec(atual.detalhe ?? '')?.[1] ?? null;
  const gestor = /\.\s+([^.]+?) pediu/.exec(atual.detalhe ?? '')?.[1] ?? null;
  const iniciais = atual.nome.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');
  return (
    <div className="gva-tk" role="alertdialog" aria-modal="true" aria-labelledby="gva-cut-tit">
      <div className="gva-cut">
        <span className="gva-cut-faixa" aria-hidden />
        <div className="gva-cut-icone" aria-hidden>
          <i className="onda" /><i className="onda b" />
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
          </svg>
        </div>
        <div className="gva-cut-eyebrow">Pedido do gestor</div>
        <h2 id="gva-cut-tit" className="gva-cut-tit">Responda este cliente agora</h2>

        <div className="gva-cut-cli">
          <span className="gva-cut-av">{iniciais || '•'}</span>
          <div className="gva-cut-cli-tx">
            <b>{atual.nome}</b>
            <span>aguardando sua resposta no WhatsApp</span>
          </div>
        </div>

        {(desde || gestor) ? (
          <dl className="gva-cut-fatos">
            {desde && <div><dt>Sem resposta</dt><dd>{desde.replace(' às ', ' · ')}</dd></div>}
            {gestor && <div><dt>Pedido por</dt><dd>{gestor}</dd></div>}
            <div><dt>Quando</dt><dd>{tempoRelativo(atual.desde, Date.now())}</dd></div>
          </dl>
        ) : (
          <p className="gva-tk-txt">{atual.detalhe ?? 'Este cliente está sem resposta depois dos avisos. Responda agora.'}</p>
        )}

        <div className="gva-cut-acoes">
          <button type="button" className="gva-cut-pri" onClick={() => { dispensar(); nav('/whatsapp?conversa=' + encodeURIComponent(atual.conversaId)); }}>
            Abrir conversa e responder
            <svg viewBox="0 0 16 16" aria-hidden><path d="M3 8h9M8.5 4.5L12 8l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <button type="button" className="gva-cut-sec" onClick={dispensar}>Responder em seguida</button>
        </div>
        <p className="gva-cut-rodape">O aviso some sozinho quando você responder o cliente.</p>
      </div>
    </div>
  );
}

export function GuardiaoAvisos() {
  const [cutucadaNaTela, setCutucadaNaTela] = useState(false);
  return (
    <>
      <CutucadaTakeover aoMostrar={setCutucadaNaTela} />
      {!cutucadaNaTela && <TakeoverUltimoAviso />}
    </>
  );
}

function TakeoverUltimoAviso() {
  const { visiveis, agora, dispensar, responder } = useAvisosVisiveis();
  const aberto = useRadarAberto();
  const takeover = visiveis.find((a) => a.n === 3) ?? null;
  if (!takeover || !aberto) return null;
  const selo = prioSelo(takeover);
  return (
    <div className="gva-tk" role="alertdialog" aria-modal="true" aria-label="Último aviso do Radar de Atendimento">
      <div className="gva-tk-card">
        <div className="gva-tk-rotulo">🚨 3º e último aviso</div>
        <div className="gva-tk-nome">{takeover.nome}</div>
        {selo && <span className={'gva-prio ' + selo.cls}>{selo.txt}</span>}
        <p className="gva-tk-txt">
          Este cliente está sem resposta {tempoRelativo(takeover.desde, agora)} e você já recebeu dois avisos.
          Se completar <b>1 dia útil sem resposta</b>, o caso vai para o <b>gestor decidir o repasse</b> para outro atendente.
        </p>
        <div className="gva-tk-acoes">
          <button type="button" className="gva-btn pri" onClick={() => responder(takeover)}>Responder agora</button>
          <button type="button" className="gva-btn sec" onClick={() => dispensar(takeover)}>Responder depois</button>
        </div>
      </div>
    </div>
  );
}
