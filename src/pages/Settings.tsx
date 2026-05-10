import { useEffect, useState } from 'react';
import type { AppSettings } from '../types';

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

export default function Settings() {
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
            <div className="text-sm text-slate-400">{labelMap[key as keyof AppSettings] ?? key}</div>
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
