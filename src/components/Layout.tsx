import { Link, matchPath, useLocation, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { SessionUser } from '../types';

type Props = {
  session: SessionUser | null;
  onSessionChange: (session: SessionUser | null) => void;
  children: ReactNode;
};

export default function Layout({ session, onSessionChange, children }: Props) {
  const location = useLocation();
  const navigate = useNavigate();

  const links = [
    { to: '/', label: 'Dashboard' },
    { to: '/tenants', label: 'Tenants' },
    { to: '/bills', label: 'Bills' },
    ...(session?.role === 'admin' ? [{ to: '/users', label: 'Users' }, { to: '/settings', label: 'Settings' }] : []),
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
    <div className="grid min-h-full grid-cols-[180px_1fr] text-slate-100">
      <aside className="border-r border-white/10 bg-slate-950/70 p-3 backdrop-blur">
        <div className="mb-5">
          <div className="text-lg font-semibold tracking-tight text-white">Billify</div>
          <div className="mt-1 text-[11px] text-slate-400">Electricity bill splitting</div>
        </div>
        <nav className="space-y-1">
          {links.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={`block rounded-lg px-2.5 py-2 text-sm transition ${
                location.pathname === link.to ? 'bg-brand-500/20 text-brand-100 ring-1 ring-brand-400/30' : 'text-slate-300 hover:bg-white/5'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="flex min-h-full flex-col">
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
        <div className="flex-1 p-5">{children}</div>
      </main>
    </div>
  );
}
