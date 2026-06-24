import { Outlet, useMatches } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

interface RouteMeta { fullBleed?: boolean }

export function AppShell() {
  const matches = useMatches();
  const fullBleed = matches.some((m) => (m.handle as RouteMeta | undefined)?.fullBleed);
  return (
    <div className="app">
      <Sidebar />
      <main className="col-main">
        <Topbar />
        <div className={'content' + (fullBleed ? ' content-bleed' : '')}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
