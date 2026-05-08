import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SessionUser } from '../types';

export default function SetupPassword({ onChanged }: { onChanged: (session: SessionUser | null) => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  return (
    <div className="flex min-h-full items-center justify-center px-6">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-900/70 p-8 shadow-glow backdrop-blur">
        <h1 className="text-3xl font-semibold text-white">Set your password</h1>
        <p className="mt-2 text-sm text-slate-400">The default admin must change the password before using the app.</p>
        <div className="mt-6 space-y-4">
          <input className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="New password" />
          <input className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Confirm password" />
          {error ? <div className="text-sm text-red-300">{error}</div> : null}
          <button
            className="w-full rounded-xl bg-brand-500 px-4 py-3 font-medium text-white transition hover:bg-brand-400"
            onClick={async () => {
              if (password.length < 8) {
                setError('Use at least 8 characters.');
                return;
              }
              if (password !== confirm) {
                setError('Passwords do not match.');
                return;
              }
              const session = await window.api.auth.getSession();
              if (!session) {
                navigate('/login');
                return;
              }
              await window.api.auth.changePassword(session.id, password);
              onChanged({ ...session, must_change_password: false });
              navigate('/');
            }}
          >
            Save and continue
          </button>
        </div>
      </div>
    </div>
  );
}
