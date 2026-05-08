import { useEffect, useState } from 'react';
import type { AppSettings } from '../types';

export default function Settings() {
  const [settings, setSettings] = useState<AppSettings>({
    company_name: 'Billify Building',
    company_address: '',
    whatsapp_phone_number_id: '',
    whatsapp_access_token: '',
    whatsapp_template_name: 'electricity_bill',
    whatsapp_template_language: 'en',
  });

  useEffect(() => {
    window.api.settings.get().then(setSettings);
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold text-white">Settings</h1>
        <p className="mt-2 text-slate-400">Company and WhatsApp configuration.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {Object.entries(settings).map(([key, value]) => (
          <label key={key} className="space-y-2 rounded-3xl border border-white/10 bg-white/5 p-5">
            <div className="text-sm text-slate-400">{key}</div>
            <input className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white" value={value} onChange={(e) => setSettings((prev) => ({ ...prev, [key]: e.target.value }))} />
          </label>
        ))}
      </div>
      <button className="rounded-xl bg-brand-500 px-4 py-2 text-white" onClick={() => window.api.settings.save(settings)}>
        Save settings
      </button>
    </div>
  );
}
