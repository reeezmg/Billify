import { execute, queryAll, queryOne } from '../db/client';
import type { AppSettings } from '../../src/types';

const defaults: AppSettings = {
  company_name: 'Billify Building',
  company_address: '',
  whatsapp_phone_number_id: '',
  whatsapp_access_token: '',
  whatsapp_electricity_bill_template: 'electricity_bill',
  whatsapp_electricity_reminder_template: 'electricity_reminder',
  whatsapp_management_bill_template: 'management_bill',
  whatsapp_management_reminder_template: 'management_reminder',
  whatsapp_template_language: 'en',
};

export async function getSettings(): Promise<AppSettings> {
  const rows = await queryAll<{ key: string; value: string | null }>('SELECT key, value FROM app_config');
  const config = Object.fromEntries(rows.map((row) => [row.key, row.value ?? '']));
  return { ...defaults, ...config };
}

export async function saveSettings(settings: AppSettings) {
  const entries = Object.entries(settings);
  for (const [key, value] of entries) {
    await execute(
      `INSERT INTO app_config (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [key, value],
    );
  }
  return getSettings();
}
