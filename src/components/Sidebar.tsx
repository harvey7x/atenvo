/* Sidebar — rail obsidian (Fase 3.2). Só o VISUAL mudou: mesmas rotas, na mesma
 * ordem, e a mesma trava de admin para Maturação/Plano e uso.
 *
 * O que saiu, por decisão do ATENVO-DESIGN.md §7 (sidebar de 52–56px, só ícones):
 * - o modo expandido e o botão de recolher/expandir — a preferência antiga em
 *   localStorage fica órfã, sem efeito;
 * - o alternador de tema — o app agora é sempre obsidian (ver useTheme);
 * - o bloco do usuário no rodapé — o avatar foi para a topbar (doc §7), com o
 *   mesmo destino (/configuracoes).
 * O tooltip com o nome de cada item continua (hover e foco por teclado), no mesmo
 * padrão fixed do anterior para não ser cortado pelo overflow do rail. */
import { useCallback, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  BarChart3, CalendarClock, CreditCard, FileText, HeartHandshake,
  MessageCircle, MessageSquare, Plug, Receipt, Settings, SquareKanban, Thermometer,
  type LucideIcon,
} from 'lucide-react';
import { useOrg } from '@/context/OrgContext';
import '@/styles/shell.css';

interface NavEntry { to: string; label: string; icon: LucideIcon }

const MAIN: NavEntry[] = [
  { to: '/whatsapp', label: 'WhatsApp', icon: MessageCircle },
  /* o lucide não tem ícones de marca — balão quadrado (Messenger) diferencia do circular do WhatsApp */
  { to: '/facebook', label: 'Facebook', icon: MessageSquare },
  { to: '/kanban', label: 'Kanban', icon: SquareKanban },
  { to: '/agendamentos', label: 'Agendamentos', icon: CalendarClock },
  { to: '/relacionamento', label: 'Relacionamento', icon: HeartHandshake },
  { to: '/scripts', label: 'Scripts', icon: FileText },
  { to: '/cobrancas', label: 'Cobranças', icon: Receipt },
  { to: '/integracoes', label: 'Integrações', icon: Plug },
  { to: '/relatorios', label: 'Relatórios', icon: BarChart3 },
  { to: '/configuracoes', label: 'Configurações', icon: Settings },
];
const ADMIN: NavEntry[] = [
  { to: '/maturacao', label: 'Maturação', icon: Thermometer },
  { to: '/plano-uso', label: 'Plano e uso', icon: CreditCard },
];

interface TipState { label: string; top: number; left: number }

export function Sidebar() {
  const { currentOrg } = useOrg();
  const asideRef = useRef<HTMLElement | null>(null);
  const [tip, setTip] = useState<TipState | null>(null);

  const showTip = useCallback((label: string) => (ev: { currentTarget: HTMLElement }) => {
    const r = ev.currentTarget.getBoundingClientRect();
    const side = asideRef.current?.getBoundingClientRect();
    setTip({ label, top: r.top + r.height / 2, left: (side ? side.right : r.right) + 8 });
  }, []);
  const hideTip = useCallback(() => setTip(null), []);

  const item = (e: NavEntry) => {
    const Ic = e.icon;
    return (
      <NavLink
        key={e.to}
        to={e.to}
        className={({ isActive }) => 'shx-item' + (isActive ? ' active' : '')}
        aria-label={e.label}
        onMouseEnter={showTip(e.label)}
        onFocus={showTip(e.label)}
        onMouseLeave={hideTip}
        onBlur={hideTip}
      >
        <Ic size={18} strokeWidth={1.5} aria-hidden="true" />
      </NavLink>
    );
  };

  return (
    <aside ref={asideRef} className="shx-side" aria-label="Navegação principal">
      <div className="shx-mark" aria-hidden="true">a</div>

      <nav className="shx-nav">
        {MAIN.map(item)}
        {currentOrg.role === 'admin' && (
          <>
            <div className="shx-sep" role="separator" />
            {ADMIN.map(item)}
          </>
        )}
      </nav>

      {tip && (
        <div className="shx-tip" role="tooltip" style={{ top: tip.top, left: tip.left }}>
          {tip.label}
        </div>
      )}
    </aside>
  );
}
