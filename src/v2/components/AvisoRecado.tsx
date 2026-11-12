import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { DEMO_MODE } from '@/lib/demo';
import { EQUIPE } from '../pages/filaIris/dados';
import { useRecadosReais } from '../pages/filaIris/recadosReal';
import { useEuLocal, useRecadosLocais, type FonteRecados, type Recado } from '../pages/filaIris/recados';
import { CURR_KEY } from '../hooks/useInboxWhatsApp';
import { CartaoRecadoAtendente, CartaoRespostaGestor } from './CartaoRecado';
import { useAgoraNoCanto, useBaseNoCanto, useOcupadoNoCanto } from './AvisoIris';

/* ==================================================================
   O RECADO DO ADMINISTRADOR na tela (dono 12/11), montado no shell, em qualquer página:
   - para o atendente: NO MEIO DA TELA ("quero que apareça no meio da tela"), com véu, o foco no
     cartão e o Tab preso nele: Responder o cliente · Repassar · responder por escrito · Lembrar em
     10 min. Sai só por uma ação (o Esc não some com ele). "Responder o cliente" abre a conversa e o
     recado espera 20 min (some de vez quando a mensagem sai); com a conversa daquele cliente aberta,
     ele também espera, e ao sair dela espera mais 1 min enquanto relê (talvez ele tenha acabado de
     responder). Espera também qualquer janela/véu aberto (foto, confirmação, ficha, Radar);
   - para o administrador: a resposta que chegou, no canto (Abrir conversa · Ok), logo acima do lembrete;
     o aviso da Iris sobe acima dela.
   Com o Atenvo em outra aba: a notificação do navegador (só com a permissão já dada).
   ================================================================== */
const LEMBRAR_DEPOIS_MS = 10 * 60_000;
const RESPONDENDO_MS = 20 * 60_000;
const SAIU_DA_CONVERSA_MS = 60_000;
/** o recado espera qualquer véu/janela do v2 (foto do inbox, confirmação, modais) além dos do canto */
const ESPERA_TAMBEM = '.veu';
const VISTO_DEPOIS_MS = 1500;
const primeiro = (n: string) => n.split(/\s+/)[0] ?? n;

export function AvisoRecado(props: { oculto?: boolean; acesso: boolean | null }) {
  return DEMO_MODE ? <AvisoRecadoDemo {...props} /> : <AvisoRecadoReal {...props} />;
}

function AvisoRecadoReal({ oculto = false, acesso }: { oculto?: boolean; acesso: boolean | null }) {
  const ativo = acesso === true;
  const colegas = useMemo(() => EQUIPE.map((a) => ({ id: a.uid, nome: a.nome })), []);
  const rec = useRecadosReais(ativo, colegas);
  return <PainelRecado rec={rec} ativo={ativo} oculto={oculto} />;
}

/** demonstração: a loja local da página (o "Ver como" da Fila diz quem está olhando) */
function AvisoRecadoDemo({ oculto = false, acesso }: { oculto?: boolean; acesso: boolean | null }) {
  const eu = useEuLocal();
  const equipe = useMemo(() => EQUIPE.map((a) => ({ id: a.id, nome: a.nome })), []);
  const rec = useRecadosLocais(eu, equipe);
  return <PainelRecado rec={rec} ativo={acesso === true} oculto={oculto} />;
}

/** prazos por recado (Lembrar em 10 min, Respondendo), por pessoa, em todas as abas abertas (a outra aba fica
    sabendo pelo evento "storage"); sobrevivem a recarregar; um prazo novo nunca encurta o que já havia */
function usePrazos(chave: string | null): [Record<string, number>, (id: string, ms: number) => void] {
  const ler = useCallback((): Record<string, number> => {
    if (!chave) return {};
    try {
      const o = JSON.parse(localStorage.getItem(chave) ?? '{}') as unknown;
      return o && typeof o === 'object' ? (o as Record<string, number>) : {};
    } catch { return {}; }
  }, [chave]);
  const [prazos, setPrazos] = useState<Record<string, number>>(ler);
  useEffect(() => {
    setPrazos(ler());
    if (!chave) return;
    const outraAba = (e: StorageEvent) => { if (e.key === chave) setPrazos(ler()); };
    window.addEventListener('storage', outraAba);
    return () => window.removeEventListener('storage', outraAba);
  }, [chave, ler]);
  const marcar = useCallback((id: string, ms: number) => {
    setPrazos((p) => {
      const agora = Date.now();
      const n: Record<string, number> = {};
      for (const [k, v] of Object.entries({ ...p, ...ler() })) if (v > agora) n[k] = v;
      n[id] = Math.max(n[id] ?? 0, agora + ms);
      if (chave) { try { localStorage.setItem(chave, JSON.stringify(n)); } catch { /* sem armazenamento: vale só nesta tela */ } }
      return n;
    });
  }, [chave, ler]);
  return [prazos, marcar];
}

/** a conversa aberta no inbox agora (a URL ?conversa= dura só até o inbox abrir o card; depois, o card ativo
    ou a última aberta nesta aba — a mesma regra da Central de Avisos) */
function conversaAbertaAgora(pathname: string, search: string): string | null {
  if (!pathname.startsWith('/whatsapp')) return null;
  const daUrl = new URLSearchParams(search).get('conversa');
  if (daUrl) return daUrl;
  const card = document.querySelector<HTMLElement>('.conv2.ativa[data-cid]');
  if (card?.dataset.cid) return card.dataset.cid;
  try { return sessionStorage.getItem(CURR_KEY); } catch { return null; }
}
function useConversaAberta(ativo: boolean): string | null {
  const { pathname, search } = useLocation();
  const [cid, setCid] = useState<string | null>(null);
  useEffect(() => {
    if (!ativo) { setCid(null); return; }
    const ler = () => setCid(conversaAbertaAgora(pathname, search));
    ler();
    const iv = window.setInterval(ler, 1000);
    return () => window.clearInterval(iv);
  }, [ativo, pathname, search]);
  return cid;
}

/** com o Atenvo em outra aba: a notificação do navegador para cada recado/resposta NOVO (a 1ª leitura não conta) */
function useNotificacao(lista: Recado[], pronto: boolean, ativo: boolean, titulo: (r: Recado) => string, corpo: (r: Recado) => string): void {
  const conhecidos = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!ativo || !pronto) return;
    if (conhecidos.current === null) { conhecidos.current = new Set(lista.map((r) => r.id)); return; }
    const novos = lista.filter((r) => !conhecidos.current!.has(r.id));
    for (const r of novos) conhecidos.current.add(r.id);
    if (!novos.length || typeof document === 'undefined' || !document.hidden) return;
    try {
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
      const r = novos[0];
      const n = new Notification(titulo(r), { body: corpo(r), tag: `atenvo-recado-${r.id}`, icon: '/icons/pwa-192.png' });
      n.onclick = () => { try { window.focus(); } catch { /* o navegador decide */ } n.close(); };
    } catch { /* sem notificação do navegador: o cartão aparece ao voltar */ }
  }, [lista, pronto, ativo, titulo, corpo]);
}
const tituloRecado = () => 'Recado do administrador';
const corpoRecado = (r: Recado) => `${r.cliente}: ${r.mensagem}`;
const tituloResposta = (r: Recado) => `Resposta ${/a$/i.test(primeiro(r.paraNome)) ? 'da' : 'do'} ${primeiro(r.paraNome)}`;
const corpoResposta = (r: Recado) => (r.resposta ? `${r.cliente}: ${r.resposta}` : r.cliente);

function PainelRecado({ rec, ativo, oculto }: { rec: FonteRecados; ativo: boolean; oculto: boolean }) {
  const navigate = useNavigate();
  const eu = rec.eu;
  /* "Lembrar em 10 min" e "Responder o cliente" (20 min): o recado some e volta sozinho */
  const [adiados, adiar] = usePrazos(eu ? `atenvo-recado-adiado:${eu}` : null);
  const [respondendo, marcarRespondendo] = usePrazos(eu ? `atenvo-recado-respondendo:${eu}` : null);
  const temPrazo = Object.keys(adiados).length > 0 || Object.keys(respondendo).length > 0;
  const relogio = useAgoraNoCanto(ativo && temPrazo);
  const [tique, setTique] = useState(0);
  /* o relógio do canto anda de minuto em minuto; o prazo vence no segundo certo */
  useEffect(() => {
    const fins = [...Object.values(adiados), ...Object.values(respondendo)].filter((v) => v > Date.now());
    if (!fins.length) return;
    const t = window.setTimeout(() => setTique((x) => x + 1), Math.max(500, Math.min(...fins) - Date.now() + 50));
    return () => window.clearTimeout(t);
  }, [adiados, respondendo, tique]);
  const aberta = useConversaAberta(ativo && rec.recebidos.length > 0);
  /* com a conversa do cliente aberta, o recado espera. Ao sair dela, talvez ele tenha acabado de responder: o recado
     continua esperando já nesta pintura (sem piscar no meio da tela), ganha 1 min e a lista é relida na hora */
  const pelaConversa = useRef<Set<string>>(new Set());
  for (const r of rec.recebidos) if (r.conversaId && r.conversaId === aberta) pelaConversa.current.add(r.id);
  const recarregar = rec.recarregar;
  const pendentes = rec.recebidos;
  useEffect(() => {
    const sairam = [...pelaConversa.current].filter((id) => pendentes.find((x) => x.id === id)?.conversaId !== aberta);
    if (!sairam.length) return;
    let releia = false;
    for (const id of sairam) {
      pelaConversa.current.delete(id);
      if (pendentes.some((x) => x.id === id)) { marcarRespondendo(id, SAIU_DA_CONVERSA_MS); releia = true; }
    }
    if (releia) recarregar?.();
  }, [aberta, pendentes, marcarRespondendo, recarregar]);
  const agoraPrazo = Math.max(relogio, Date.now());
  const esperando = (r: Recado) => (adiados[r.id] ?? 0) > agoraPrazo || (respondendo[r.id] ?? 0) > agoraPrazo
    || (!!r.conversaId && r.conversaId === aberta) || pelaConversa.current.has(r.id);
  let recebidos = rec.recebidos.filter((r) => !esperando(r));
  /* escrevendo a resposta: o recado da frente fica na frente (um adiado que venceu não passa por cima) e fica mesmo
     que se resolva sozinho no meio (a resposta ainda vale) — nunca um que a pessoa mandou esperar */
  const [escrevendo, setEscrevendo] = useState(false);
  const congelado = useRef<Recado | null>(null);
  const segura = congelado.current;
  if (escrevendo && segura && !esperando(segura)) {
    const i = recebidos.findIndex((r) => r.id === segura.id);
    if (i > 0) recebidos = [recebidos[i], ...recebidos.slice(0, i), ...recebidos.slice(i + 1)];
    else if (i < 0) recebidos = [segura, ...recebidos];
  }
  congelado.current = recebidos[0] ?? null;
  /* o administrador com o mouse ou o foco no cartão: a resposta da frente não troca por baixo dele */
  const [segurando, setSegurando] = useState(false);
  const frenteGestor = useRef<string | null>(null);
  let respostas = rec.respostas;
  if (segurando && frenteGestor.current) {
    const i = respostas.findIndex((r) => r.id === frenteGestor.current);
    if (i > 0) respostas = [respostas[i], ...respostas.slice(0, i), ...respostas.slice(i + 1)];
  }
  frenteGestor.current = respostas[0]?.id ?? null;

  const mostrar = recebidos.length ? 'atendente' : respostas.length ? 'gestor' : null;
  const ocupado = useOcupadoNoCanto(ativo && !!mostrar, ESPERA_TAMBEM);
  const visivel = ativo && !!mostrar && !oculto && !ocupado;
  const base = useBaseNoCanto(visivel && mostrar === 'gestor', '.lmb-caixa');
  const agora = useAgoraNoCanto(visivel);
  const centro = visivel && mostrar === 'atendente';
  const frente = mostrar === 'atendente' ? recebidos[0] : undefined;

  useNotificacao(rec.recebidos, !!rec.pronto, ativo, tituloRecado, corpoRecado);
  useNotificacao(rec.respostas, !!rec.pronto, ativo, tituloResposta, corpoResposta);

  /* o retorno de cada ação */
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => { if (!toast) return; const t = window.setTimeout(() => setToast(null), 4800); return () => window.clearTimeout(t); }, [toast]);

  /* no meio da tela: o foco entra no cartão (não num botão: Enter/espaço sem querer não age), o Tab não sai
     dele e, ao fechar, volta para onde estava — SÓ quando o recado sai por uma ação que fica na mesma tela
     (responder por escrito, repassar, lembrar depois). "Responder o cliente" troca de conversa (o compositor
     de antes pode ter o rascunho de OUTRO cliente) e, escondido por outra janela (Radar, foto), o foco é dela. */
  const veu = useRef<HTMLDivElement>(null);
  const focoAntes = useRef<HTMLElement | null>(null);
  const devolverFoco = useRef(false);
  useEffect(() => {
    if (!centro) return;
    const ativoAntes = document.activeElement;
    focoAntes.current = ativoAntes instanceof HTMLElement && ativoAntes !== document.body ? ativoAntes : null;
    devolverFoco.current = false;
    return () => {
      const el = focoAntes.current;
      const devolver = devolverFoco.current;
      focoAntes.current = null;
      devolverFoco.current = false;
      if (devolver && el && document.contains(el) && !document.querySelector('.rcd-veu')) { try { el.focus({ preventScroll: true }); } catch { /* segue */ } }
    };
  }, [centro]);
  useEffect(() => {
    if (!centro) return;
    const t = window.setTimeout(() => veu.current?.querySelector<HTMLElement>('.rcd-aviso')?.focus({ preventScroll: true }), 0);
    return () => window.clearTimeout(t);
  }, [centro, frente?.id]);
  useEffect(() => {
    if (!centro) return;
    const h = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const raiz = veu.current;
      if (!raiz) return;
      const focos = [...raiz.querySelectorAll<HTMLElement>('button:not([disabled]), textarea:not([disabled])')];
      if (!focos.length) return;
      const atual = document.activeElement as HTMLElement | null;
      if (!atual || !raiz.contains(atual)) { e.preventDefault(); focos[0].focus(); return; }
      const i = focos.indexOf(atual);
      if (e.shiftKey && i <= 0) { e.preventDefault(); focos[focos.length - 1].focus(); }
      else if (!e.shiftKey && i === focos.length - 1) { e.preventDefault(); focos[0].focus(); }
    };
    document.addEventListener('keydown', h, true);
    return () => document.removeEventListener('keydown', h, true);
  }, [centro]);

  /* o atendente viu o recado: na tela, com a aba à vista, por 1,5 s (o administrador vê "viu às 14:02") */
  const marcarVisto = rec.marcarVisto;
  useEffect(() => {
    if (!centro || !frente || frente.vistoEm) return;
    const id = frente.id;
    let t: number | undefined;
    const armar = () => {
      window.clearTimeout(t);
      if (!document.hidden) t = window.setTimeout(() => marcarVisto(id), VISTO_DEPOIS_MS);
    };
    armar();
    document.addEventListener('visibilitychange', armar);
    return () => { window.clearTimeout(t); document.removeEventListener('visibilitychange', armar); };
  }, [centro, frente?.id, frente?.vistoEm, marcarVisto]); // eslint-disable-line react-hooks/exhaustive-deps

  /* o leitor de tela: a região viva fica sempre montada */
  const anuncio = !visivel ? '' : mostrar === 'atendente' && frente
    ? `Recado do administrador sobre ${frente.cliente}: ${frente.mensagem}`
    : respostas[0] ? `${primeiro(respostas[0].paraNome)} respondeu o seu recado sobre ${respostas[0].cliente}.` : '';
  const [falado, setFalado] = useState('');
  useEffect(() => { setFalado(anuncio); }, [anuncio]);

  const abrir = (conversaId?: string) => navigate(conversaId ? `/whatsapp?conversa=${encodeURIComponent(conversaId)}` : '/whatsapp');
  const nomeDe = (id: string) => rec.colegas.find((c) => c.id === id)?.nome ?? 'o colega';
  return (
    <>
      <div className="ivs-sr" role="status" aria-live="polite">{falado}</div>
      {centro && (
        <div ref={veu} className="rcd-veu" role="dialog" aria-modal="true" aria-label={`Recado do administrador sobre ${frente?.cliente ?? 'um cliente'}`}>
          <div className="rcd-caixa-centro">
            <CartaoRecadoAtendente recados={recebidos} colegas={rec.colegas} agora={agora} aoEscrever={setEscrevendo}
              aoResponderCliente={(r) => {
                devolverFoco.current = false;
                setEscrevendo(false);
                marcarRespondendo(r.id, RESPONDENDO_MS);
                setToast(`Responda ${primeiro(r.cliente)}: o recado se resolve sozinho quando a sua mensagem sair.`);
                abrir(r.conversaId);
              }}
              aoResponder={async (r, texto) => {
                await rec.responder(r.id, texto);
                devolverFoco.current = true;
                setEscrevendo(false);
                setToast('Resposta enviada para o administrador.');
              }}
              aoRepassar={async (r, para, motivo) => {
                const res = await rec.repassar(r.id, para, motivo);
                devolverFoco.current = true;
                setEscrevendo(false);
                if (!res.ok) { setToast(res.erro ?? 'Este cliente já não é seu: o recado foi encerrado.'); return; }
                setToast(para
                  ? `${primeiro(r.cliente)} ${/a$/i.test(primeiro(r.cliente)) ? 'repassada' : 'repassado'} para ${primeiro(res.paraNome ?? nomeDe(para))}. O administrador vê o motivo.`
                  : 'Devolvido para o administrador decidir.');
              }}
              aoLembrarDepois={(r) => {
                devolverFoco.current = true;
                setEscrevendo(false);
                adiar(r.id, LEMBRAR_DEPOIS_MS);
                setToast('O recado volta em 10 minutos.');
              }} />
          </div>
        </div>
      )}
      {visivel && mostrar === 'gestor' && (
        <div className="rcd-caixa" style={{ '--rcd-base': `${base}px` } as CSSProperties}
          onMouseEnter={() => setSegurando(true)} onMouseLeave={() => setSegurando(false)}
          onFocus={() => setSegurando(true)}
          onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setSegurando(false); }}>
          <CartaoRespostaGestor recados={respostas} agora={agora}
            aoConversa={(r) => { rec.marcarRespostaVista([r.id]); abrir(r.conversaId); }}
            aoOk={(ids) => rec.marcarRespostaVista(ids)} />
        </div>
      )}
      {toast && <div className="rcd-toast" role="status">{toast}</div>}
    </>
  );
}
