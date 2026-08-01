import { Link, matchPath, useLocation, useNavigate } from 'react-router-dom';
import { useState, type ReactNode } from 'react';
import type { SessionUser } from '../types';

type Props = {
  session: SessionUser | null;
  onSessionChange: (session: SessionUser | null) => void;
  children: ReactNode;
};

function NavIcon({ name }: { name: string }) {
  const paths: Record<string, ReactNode> = {
    dashboard: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    tenants: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    bills: <><path d="M6 2h9l5 5v15H6z" /><path d="M14 2v6h6M9 13h8M9 17h8" /></>,
    payments: <><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20M6 15h2" /></>,
    users: <><circle cx="12" cy="8" r="4" /><path d="M4 22a8 8 0 0 1 16 0" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21H9.6v-.1A1.7 1.7 0 0 0 8.5 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3V9.6h.1A1.7 1.7 0 0 0 4.6 8.5a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.1A1.7 1.7 0 0 0 15.5 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.36.28.57.68.6 1.1V14c-.03.42-.24.82-.6 1z" /></>,
  };
  return <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

export default function Layout({ session, onSessionChange, children }: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const isSplitPage = Boolean(matchPath('/bills/:billId/split', location.pathname));
  const isLinkActive = (to: string) =>
    to === '/' ? location.pathname === '/' : location.pathname === to || Boolean(matchPath({ path: `${to}/*`, end: false }, location.pathname));

  const links = [
    { to: '/', label: 'Dashboard', icon: 'dashboard' },
    { to: '/tenants', label: 'Tenants', icon: 'tenants' },
    { to: '/bills', label: 'Bills', icon: 'bills' },
    { to: '/payments', label: 'Payments', icon: 'payments' },
    ...(session?.role === 'admin' ? [{ to: '/users', label: 'Users', icon: 'users' }, { to: '/settings', label: 'Settings', icon: 'settings' }] : []),
  ];

  const breadcrumbs = (() => {
    const items: Array<{ label: string; to?: string }> = [{ label: 'Dashboard', to: '/' }];
    if (matchPath('/tenants/:tenantId/bills', location.pathname)) {
      items.push({ label: 'Tenants', to: '/tenants' }, { label: 'Tenant bills' });
      return items;
    }
    if (matchPath('/bills/:billId/split', location.pathname)) {
      items.push({ label: 'Bills', to: '/bills' }, { label: 'Bill split' });
      return items;
    }
    if (location.pathname === '/tenants') {
      items.push({ label: 'Tenants' });
      return items;
    }
    if (location.pathname === '/bills') {
      items.push({ label: 'Bills' });
      return items;
    }
    if (location.pathname === '/payments') {
      items.push({ label: 'Payments' });
      return items;
    }
    if (location.pathname === '/users') {
      items.push({ label: 'Users' });
      return items;
    }
    if (location.pathname === '/settings') {
      items.push({ label: 'Settings' });
      return items;
    }
    return items;
  })();

  return (
    <div className={`grid min-h-full ${sidebarCollapsed ? 'grid-cols-[68px_minmax(0,1fr)]' : 'grid-cols-[190px_minmax(0,1fr)]'} text-slate-100 transition-[grid-template-columns] duration-200`}>
      <aside className="border-r border-white/10 bg-slate-950/70 p-3 backdrop-blur">
        <div className={`mb-5 flex items-start ${sidebarCollapsed ? 'justify-center' : 'justify-between gap-2'}`}>
          {!sidebarCollapsed ? <div><div className="text-lg font-semibold tracking-tight text-white">Billify</div><div className="mt-1 text-[11px] text-slate-400">Electricity bill splitting</div></div> : null}
          <button type="button" onClick={() => setSidebarCollapsed((value) => !value)} className="rounded-lg p-2 text-slate-300 transition hover:bg-white/10 hover:text-white" title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            <svg viewBox="0 0 24 24" className={`h-5 w-5 transition-transform ${sidebarCollapsed ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
        </div>
        <nav className="space-y-1">
          {links.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              title={sidebarCollapsed ? link.label : undefined}
              className={`flex items-center rounded-lg px-2.5 py-2 text-sm transition ${sidebarCollapsed ? 'justify-center' : 'gap-3'} ${
                isLinkActive(link.to)
                  ? 'bg-brand-500/20 text-brand-100 ring-1 ring-brand-400/30'
                  : 'text-slate-300 hover:bg-white/5'
              }`}
            >
              <NavIcon name={link.icon} />
              {!sidebarCollapsed ? <span>{link.label}</span> : null}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="flex min-h-full min-w-0 flex-col">
        <header className="flex items-center justify-between border-b border-white/10 bg-slate-950/40 px-5 py-4 backdrop-blur">
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-400">
            {breadcrumbs.map((item, index) => (
              <div key={`${item.label}-${index}`} className="flex items-center gap-2">
                {index > 0 ? <span className="text-slate-600">/</span> : null}
                {item.to ? (
                  <Link to={item.to} className="text-brand-200 transition hover:text-brand-100">
                    {item.label}
                  </Link>
                ) : (
                  <span className="text-slate-200">{item.label}</span>
                )}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-sm text-slate-400">Signed in as</div>
              <div className="font-medium text-white">{session?.name}</div>
            </div>
            <button
              onClick={async () => {
                await window.api.auth.logout();
                onSessionChange(null);
                navigate('/login');
              }}
              className="rounded-xl bg-white/10 px-4 py-2 text-sm text-slate-100 transition hover:bg-white/15"
            >
              Logout
            </button>
          </div>
        </header>
        <div className={`min-w-0 flex-1 ${isSplitPage ? 'p-3' : 'p-5'}`}>{children}</div>
      </main>
    </div>
  );
}
