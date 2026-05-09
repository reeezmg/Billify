import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SessionUser } from '../types';

export default function SetupPassword({ onChanged }: { onChanged: (session: SessionUser | null) => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  return (
    <div className="flex min-h-full items-center justify-center px-6">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-900/70 p-8 shadow-glow backdrop-blur">
        <h1 className="text-3xl font-semibold text-white">Set your password</h1>
        <p className="mt-2 text-sm text-slate-400">The default admin must change the password before using the app.</p>
        <form className="mt-6 space-y-4" autoComplete="off" onSubmit={(event) => event.preventDefault()}>
          <PasswordInput
            name="billify-new-password"
            autoComplete="new-password"
            value={password}
            onChange={setPassword}
            placeholder="New password"
            visible={showPassword}
            onToggle={() => setShowPassword((current) => !current)}
          />
          <PasswordInput
            name="billify-confirm-password"
            autoComplete="new-password"
            value={confirm}
            onChange={setConfirm}
            placeholder="Confirm password"
            visible={showConfirm}
            onToggle={() => setShowConfirm((current) => !current)}
          />
          {error ? <div className="text-sm text-red-300">{error}</div> : null}
          <button
            className="w-full rounded-xl bg-brand-500 px-4 py-3 font-medium text-white transition hover:bg-brand-400"
            type="button"
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
        </form>
      </div>
    </div>
  );
}

function PasswordInput({
  name,
  autoComplete,
  value,
  onChange,
  placeholder,
  visible,
  onToggle,
}: {
  name: string;
  autoComplete: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  visible: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="relative">
      <input
        className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 pr-12 text-white outline-none"
        name={name}
        autoComplete={autoComplete}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      <button
        type="button"
        onClick={onToggle}
        className="absolute inset-y-0 right-2 flex items-center rounded-lg px-2 text-slate-400 transition hover:bg-white/5 hover:text-white"
        aria-label={visible ? 'Hide password' : 'Show password'}
      >
        {visible ? <EyeOffIcon /> : <EyeIcon />}
      </button>
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
