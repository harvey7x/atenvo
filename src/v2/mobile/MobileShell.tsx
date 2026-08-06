import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, useOutletContext } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import '../fontes';
import '../tokens.css';
import '../base.css';
import '../components/componentes.css';
import '../pages/whatsapp.css';
import './mobile.css';
import { useInboxWhatsApp, type AvisoInbox } from '../hooks/useInboxWhatsApp';
import { aplicarTema, lerTema } from '../lib/tema';
import { seedWa } from '../pages/whatsappSeed';

/* ------------------------------------------------------------------
   Shell do chat MOBILE (/m) — layout route fora do AppShellV2 (sem
   sidebar/topbar), sob RequireAuthV2. Monta useInboxWhatsApp UMA vez:
   navegar lista ↔ conversa troca só o filho, então o espelho
   `contacts`, a bolha otimista e a assinatura realtime `wa-<org>`
   sobrevivem à navegação.
   REGRA: lógica de negócio SÓ em useInboxWhatsApp / src/data/* —
   as telas mobile duplicam apenas markup, nunca regra.
   ------------------------------------------------------------------ */

export type CtxMobile = { inbox: ReturnType<typeof useInboxWhatsApp>; aoAvisar: (a: AvisoInbox) => void };
export function useInboxMobile(): CtxMobile { return useOutletContext<CtxMobile>(); }

export default function MobileShell() {
  const { user } = useAuth();
  // fora do AppShellV2 ninguém aplica o tema salvo do usuário — sem isto o mobile fica sempre dark
  useEffect(() => { aplicarTema(lerTema(user?.id)); }, [user?.id]);

  // iOS/Safari: o teclado NÃO encolhe o layout viewport (interactive-widget é
  // Chromium-only) — espelha a altura REAL visível (visualViewport) em --m-alt e
  // desfaz o "pan" automático do WebKit, para o composer ficar acima do teclado.
  // No Chrome/Android o viewport já encolhe sozinho e --m-alt ≈ 100dvh (inócuo).
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const raiz = document.documentElement;
    const aplica = () => {
      raiz.style.setProperty('--m-alt', vv.height + 'px');
      window.scrollTo(0, 0);
    };
    aplica();
    vv.addEventListener('resize', aplica);
    vv.addEventListener('scroll', aplica);
    return () => {
      vv.removeEventListener('resize', aplica);
      vv.removeEventListener('scroll', aplica);
      raiz.style.removeProperty('--m-alt');
    };
  }, []);

  const [aviso, setAviso] = useState<AvisoInbox | null>(null);
  const avisoTimer = useRef(0);
  const aoAvisar = useCallback((a: AvisoInbox) => {
    setAviso(a);
    window.clearTimeout(avisoTimer.current);
    avisoTimer.current = window.setTimeout(() => setAviso(null), 4200);
  }, []);
  useEffect(() => () => window.clearTimeout(avisoTimer.current), []);

  const inbox = useInboxWhatsApp({ aoAvisar, seedDemo: useMemo(() => seedWa(), []), bloqueadosDemo: useMemo(() => new Set(['wa-cleusa-ct']), []) });

  return (
    <div className="v2 m-app">
      {aviso && <div className={'m-toast ' + aviso.tom} role="status">{aviso.texto}</div>}
      <Outlet context={{ inbox, aoAvisar } satisfies CtxMobile} />
    </div>
  );
}
