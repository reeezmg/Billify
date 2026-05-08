import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SessionUser } from '../types';

export default function Login({ onSignedIn }: { onSignedIn: (session: SessionUser) => void }) {
  const [email, setEmail] = useState('admin@local');
  const [password, setPassword] = useState('admin');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  return (
    <div className="flex min-h-full items-center justify-center px-6">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-900/70 p-8 shadow-glow backdrop-blur">
        <h1 className="text-3xl font-semibold text-white">Welcome back</h1>
        <p className="mt-2 text-sm text-slate-400">Sign in to manage tenants, bills, and split runs.</p>
        <div className="mt-6 space-y-4">
          <input className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
          <input className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" />
          {error ? <div className="text-sm text-red-300">{error}</div> : null}
          <button
            className="w-full rounded-xl bg-brand-500 px-4 py-3 font-medium text-white transition hover:bg-brand-400"
            onClick={async () => {
              const result = await window.api.auth.login(email, password);
              if (!result.ok) {
                setError(result.message);
                return;
              }
              onSignedIn(result.user);
              navigate(result.user.must_change_password ? '/setup-password' : '/');
            }}
          >
            Sign in
          </button>
        </div>
        <div className="mt-6 text-xs text-slate-500">Default seed: admin@local / admin</div>
      </div>
    </div>
  );
}
