import { useEffect, useState } from 'react';
import type { AppSettings, SessionUser } from '../types';

const labelMap: Record<keyof AppSettings, string> = {
  company_name: 'Company name',
  company_address: 'Company address',
  whatsapp_phone_number_id: 'WhatsApp phone number ID',
  whatsapp_access_token: 'WhatsApp access token',
  whatsapp_electricity_bill_template: 'Electricity bill template',
  whatsapp_electricity_reminder_template: 'Electricity reminder template',
  whatsapp_management_bill_template: 'Management bill template',
  whatsapp_management_reminder_template: 'Management reminder template',
  whatsapp_template_language: 'WhatsApp template language',
};

export default function Settings({ onSessionChange }: { onSessionChange: (session: SessionUser | null) => void }) {
  const [settings, setSettings] = useState<AppSettings>({
    company_name: 'Billify Building',
    company_address: '',
    whatsapp_phone_number_id: '',
    whatsapp_access_token: '',
    whatsapp_electricity_bill_template: 'electricity_bill',
    whatsapp_electricity_reminder_template: 'electricity_reminder',
    whatsapp_management_bill_template: 'management_bill',
    whatsapp_management_reminder_template: 'management_reminder',
    whatsapp_template_language: 'en',
  });

  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState('');

  useEffect(() => {
    window.api.settings.get().then(setSettings);
  }, []);

  const resetData = async () => {
    const confirmed = window.confirm(
      'This will permanently delete ALL tenants, bills, splits, payments, and users, and restore the default admin login (admin / admin). Company and WhatsApp settings will be kept. This cannot be undone. Continue?',
    );
    if (!confirmed) return;
    const confirmedAgain = window.confirm('Are you absolutely sure? This is your last chance to cancel.');
    if (!confirmedAgain) return;

    setResetting(true);
    setResetError('');
    try {
      await window.api.settings.resetData();
      onSessionChange(null);
    } catch (err) {
      setResetError(err instanceof Error ? err.message : 'Unable to reset data.');
      setResetting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold text-white">Settings</h1>
        <p className="mt-2 text-slate-400">Company and WhatsApp configuration.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {Object.entries(settings).map(([key, value]) => (
          <label key={key} className="space-y-2 rounded-3xl border border-white/10 bg-white/5 p-5">
            <div className="text-sm text-slate-400">{labelMap[key as keyof AppSettings] ?? key}</div>
            <input className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white" value={value} onChange={(e) => setSettings((prev) => ({ ...prev, [key]: e.target.value }))} />
          </label>
        ))}
      </div>
      <button className="rounded-xl bg-brand-500 px-4 py-2 text-white" onClick={() => window.api.settings.save(settings)}>
        Save settings
      </button>

      <div className="space-y-3 rounded-3xl border border-rose-400/30 bg-rose-500/5 p-5">
        <div>
          <div className="text-sm font-semibold text-rose-200">Danger zone</div>
          <p className="mt-1 text-sm text-slate-400">
            Permanently delete all tenants, bills, splits, payments, and users, and restore the default admin login.
            Company and WhatsApp settings above are kept. This cannot be undone.
          </p>
        </div>
        {resetError ? <div className="text-sm text-rose-300">{resetError}</div> : null}
        <button
          className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-2 text-rose-100 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={resetData}
          disabled={resetting}
        >
          {resetting ? 'Resetting…' : 'Reset all data'}
        </button>
      </div>
    </div>
  );
}
