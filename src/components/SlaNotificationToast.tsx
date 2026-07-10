import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useSlaAlertas } from '@/data/sla';
import { ordenarAlertas, maxSeveridade, sevClass, tipoLabel, fraseTipo, tempoRelativo, type SlaSeveridade } from '@/data/slaView';

/* Estado de UI da central de SLA (abrir/fechar o dropdown do sino a partir da barra/toasts) +
   toasts estilo WhatsApp para NOVOS alertas. Client-side apenas; não toca backend/SLA engine. */

interface SlaUi { centralAberta: boolean; abrirCentral: () => void; fecharCentral: () => void; toggleCentral: () => void; }
const Ctx = createContext<SlaUi | null>(null);

export function SlaUiProvider({ children }: { children: ReactNode }) {
  const [centralAberta, setAberta] = useState(false);
  return (
    <Ctx.Provider value={{
      centralAberta,
      abrirCentral: () => setAberta(true),
      fecharCentral: () => setAberta(false),
      toggleCentral: () => setAberta((v) => !v),
    }}>{children}</Ctx.Provider>
  );
}
export function useSlaUi(): SlaUi {
  const c = useContext(Ctx);
  if (!c) throw new Error('useSlaUi deve ser usado dentro de <SlaUiProvider>');
  return c;
}

interface ToastItem { id: string; titulo: string; texto: string; sev: SlaSeveridade }
let _seq = 0;
const nextId = () => `t${++_seq}`;

/** Observa os alertas (1x no AppShell). NÃO dispara no carregamento inicial (só semeia os vistos).
    Em refetches seguintes, agrupa os novos num único toast (evita spam). */
export function SlaNotifier() {
  const { data } = useSlaAlertas();
  const { abrirCentral } = useSlaUi();
  const seenRef = useRef<Set<string>>(new Set());
  const initedRef = useRef(false);
  const mountedRef = useRef(true);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => () => { mountedRef.current = false; }, []);

  useEffect(() => {
    if (!data) return;
    const ids = data.itens.map((a) => a.id);
    if (!initedRef.current) {                    // 1ª carga: semeia sem notificar
      seenRef.current = new Set(ids);
      initedRef.current = true;
      return;
    }
    const novos = data.itens.filter((a) => !seenRef.current.has(a.id));
    ids.forEach((id) => seenRef.current.add(id)); // marca todos como vistos
    if (novos.length === 0) return;

    const top = ordenarAlertas(novos)[0];
    const t: ToastItem = novos.length === 1
      ? { id: nextId(), titulo: tipoLabel(top.tipo), texto: `${fraseTipo(top.tipo)} ${tempoRelativo(top.criado_em)}`, sev: top.severidade }
      : { id: nextId(), titulo: `${novos.length} novos alertas de atendimento`, texto: 'Toque para abrir a central', sev: maxSeveridade(novos) ?? 'amarelo' };
    setToasts((cur) => [...cur, t].slice(-3));    // máx. 3 na pilha
    setTimeout(() => { if (mountedRef.current) setToasts((cur) => cur.filter((x) => x.id !== t.id)); }, 5000);
  }, [data]);

  if (!toasts.length) return null;
  return (
    <div className="sla-toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <button key={t.id} type="button" className={'sla-toast ' + sevClass(t.sev)}
          onClick={() => { abrirCentral(); setToasts((cur) => cur.filter((x) => x.id !== t.id)); }}>
          <span className="sla-toast-ic" aria-hidden="true">🔔</span>
          <span className="sla-toast-body">
            <span className="sla-toast-titulo">{t.titulo}</span>
            <span className="sla-toast-texto">{t.texto}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
