import { Outlet, useMatches } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { GlobalWhatsAppAlert } from './GlobalWhatsAppAlert';
import { GlobalSlaAlert } from './GlobalSlaAlert';
import { SlaUiProvider, SlaNotifier } from './SlaNotificationToast';
import { DEMO_MODE } from '@/lib/demo';

interface RouteMeta { fullBleed?: boolean }

export function AppShell() {
  const matches = useMatches();
  const fullBleed = matches.some((m) => (m.handle as RouteMeta | undefined)?.fullBleed);
  return (
    <SlaUiProvider>
      <div className={'app' + (DEMO_MODE ? ' app-demo' : '')}>
        {DEMO_MODE && (
          <div className="demo-bar" role="note" aria-label="Ambiente de demonstração">
            <span className="demo-dot" /> DEMO — Ambiente com dados fictícios
          </div>
        )}
        <Sidebar />
        <main className="col-main">
          <Topbar />
          <GlobalWhatsAppAlert />
          <GlobalSlaAlert />
          <div className={'content' + (fullBleed ? ' content-bleed' : '')}>
            <Outlet />
          </div>
        </main>
      </div>
      <SlaNotifier />
    </SlaUiProvider>
  );
}
