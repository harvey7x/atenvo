import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

type ToastKind = 'ok' | 'warn';
/** Link opcional no toast (ex.: "Abrir planilha"); com link o toast dura mais para dar tempo de clicar. */
interface ToastLink { href: string; rotulo: string }
interface ToastItem { id: number; msg: string; kind: ToastKind; link?: ToastLink }
interface ToastApi { toast: (msg: string, kind?: ToastKind, opts?: { link?: ToastLink }) => void; }

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const toast = useCallback((msg: string, kind: ToastKind = 'ok', opts?: { link?: ToastLink }) => {
    const id = ++idRef.current;
    setItems((cur) => [...cur, { id, msg, kind, link: opts?.link }]);
    window.setTimeout(() => setItems((cur) => cur.filter((t) => t.id !== id)), opts?.link ? 7000 : 2600);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="toast-wrap">
        {items.map((t) => (
          <div key={t.id} className={'toast show' + (t.kind === 'warn' ? ' toast-warn' : '')}>
            {t.kind === 'warn' ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
            )}
            <span>{t.msg}</span>
            {t.link && <a href={t.link.href} target="_blank" rel="noreferrer">{t.link.rotulo}</a>}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast deve ser usado dentro de <ToastProvider>');
  return ctx;
}
