/* Toast (ATENVO-DESIGN.md §7): glass, canto inferior direito, ícone funcional,
 * some em 4s, sem emoji. Provider PRÓPRIO da biblioteca nova — o useToast antigo
 * continua atendendo as telas legadas; a troca acontece tela a tela na Fase 3. */
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, Check, X } from 'lucide-react';
import './ui.css';

export type UiToastKind = 'success' | 'danger' | 'warning';
interface UiToast { id: number; kind: UiToastKind; msg: string }

const Ctx = createContext<(msg: string, kind?: UiToastKind) => void>(() => {});

const ICONE: Record<UiToastKind, typeof Check> = { success: Check, danger: X, warning: AlertTriangle };

export function UiToastProvider({ children }: { children: ReactNode }) {
  const [lista, setLista] = useState<UiToast[]>([]);
  const seq = useRef(0);

  const push = useCallback((msg: string, kind: UiToastKind = 'success') => {
    const id = ++seq.current;
    setLista((l) => [...l, { id, kind, msg }]);
    setTimeout(() => setLista((l) => l.filter((t) => t.id !== id)), 4000);
  }, []);

  return (
    <Ctx.Provider value={push}>
      {children}
      {lista.length > 0 && (
        <div className="ui-toasts" role="status" aria-live="polite">
          {lista.map((t) => {
            const Icone = ICONE[t.kind];
            return (
              <div key={t.id} className={`ui-toast ui-toast--${t.kind}`}>
                <Icone size={16} strokeWidth={1.5} aria-hidden="true" />
                <span>{t.msg}</span>
              </div>
            );
          })}
        </div>
      )}
    </Ctx.Provider>
  );
}

export function useUiToast() { return useContext(Ctx); }
