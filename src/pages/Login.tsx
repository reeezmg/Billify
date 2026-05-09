import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SessionUser } from '../types';

export default function Login({ onSignedIn }: { onSignedIn: (session: SessionUser) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  return (
    <div className="flex min-h-full items-center justify-center px-6">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-900/70 p-8 shadow-glow backdrop-blur">
        <h1 className="text-3xl font-semibold text-white">Welcome back</h1>
        <p className="mt-2 text-sm text-slate-400">Sign in to manage tenants, bills, and split runs.</p>
        <form className="mt-6 space-y-4" autoComplete="off" onSubmit={(event) => event.preventDefault()}>
          <input
            className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none"
            name="billify-login-email"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
          />
          <div className="relative">
            <input
              className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 pr-12 text-white outline-none"
              name="billify-login-password"
              autoComplete="new-password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
            />
            <button
              type="button"
              onClick={() => setShowPassword((current) => !current)}
              className="absolute inset-y-0 right-2 flex items-center rounded-lg px-2 text-slate-400 transition hover:bg-white/5 hover:text-white"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? (
                <EyeOffIcon />
              ) : (
                <EyeIcon />
              )}
            </button>
          </div>
          {error ? <div className="text-sm text-red-300">{error}</div> : null}
          <button
            className="w-full rounded-xl bg-brand-500 px-4 py-3 font-medium text-white transition hover:bg-brand-400"
            type="button"
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
        </form>
        <div className="mt-6 text-xs text-slate-500">Default seed: admin@local / admin</div>
      </div>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M3 3l18 18" />
      <path d="M10.6 10.6A3 3 0 0 0 12 15a3 3 0 0 0 2.4-4.8" />
      <path d="M6.6 6.7C4.2 8.3 2.5 12 2.5 12s3.5 7 9.5 7c1.5 0 2.8-.3 4-.8" />
      <path d="M9.2 4.6A12.5 12.5 0 0 1 12 4c6.5 0 10 8 10 8a19.1 19.1 0 0 1-3.1 4.6" />
    </svg>
  );
}
