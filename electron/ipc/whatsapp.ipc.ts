import { ipcMain } from 'electron';
import fs from 'node:fs/promises';
import { generateTenantBillPdf } from '../services/pdf.service';
import { execute, queryAll, queryOne } from '../db/client';
import { uploadMedia, sendTemplateWithMedia, sendReminderTemplate } from '../services/whatsapp.service';
import { getBillPayDate, getBillPeriodLabel, getTenantBillNumber } from '../../src/lib/tenantBillPdf';

export function registerWhatsappIpc() {
  ipcMain.handle('whatsapp:previewPdf', async (_event, splitId: number, tenantBillId: number) => {
    const row = await queryOne<any>(
      `SELECT tb.*, t.name as tenant_name, t.room_no, t.phone
       FROM tenant_bills tb
       INNER JOIN tenants t ON t.id = tb.tenant_id
       WHERE tb.id = ?`,
      [tenantBillId],
    );
    if (!row) throw new Error('Bill row not found');
    const result = await generateTenantBillPdf(splitId, row);
    return result.filePath;
  });
  ipcMain.handle('whatsapp:sendAll', async (_event, splitId: number) => {
    const split = await queryOne<any>(
      'SELECT bs.*, b.period_month, b.period_year, b.fixed_unit, b.fixed_unit_price, b.energy_unit_price, b.tax_percent FROM bill_splits bs INNER JOIN bills b ON b.id = bs.bill_id WHERE bs.id = ?',
      [splitId],
    );
    const settings = await queryAll<{ key: string; value: string | null }>('SELECT key, value FROM app_config');
    const config = Object.fromEntries(settings.map((entry) => [entry.key, entry.value ?? '']));
    const rows = await queryAll<any>(
      `SELECT tb.*, t.name as tenant_name, t.room_no, t.phone
       FROM tenant_bills tb
       INNER JOIN tenants t ON t.id = tb.tenant_id
       WHERE tb.bill_split_id = ? AND t.active = 1 AND t.phone IS NOT NULL AND t.phone <> ''`,
      [splitId],
    );
    const results: Array<{ tenant_id: number; ok: boolean; message?: string }> = [];
    for (const row of rows) {
      try {
        const pdf = await generateTenantBillPdf(splitId, row);
        const media = await uploadMedia({
          phoneNumberId: config.whatsapp_phone_number_id,
          accessToken: config.whatsapp_access_token,
          filePath: pdf.filePath,
        });
        const sent = await sendTemplateWithMedia({
          phoneNumberId: config.whatsapp_phone_number_id,
          accessToken: config.whatsapp_access_token,
          templateName: config.whatsapp_electricity_bill_template || 'electricity_bill',
          language: config.whatsapp_template_language || 'en',
          to: row.phone,
          bodyParams: [
            row.tenant_name,
            getBillPeriodLabel(split),
            getTenantBillNumber(split, row),
            row.room_no,
            String(row.payable),
            getBillPayDate(split.reading_date),
          ],
          mediaId: media.mediaId,
        });
        await execute('UPDATE tenant_bills SET whatsapp_sent_at = datetime(\'now\'), whatsapp_message_id = ? WHERE id = ?', [
          sent.messageId,
          row.id,
        ]);
        results.push({ tenant_id: row.tenant_id, ok: true });
        await fs.unlink(pdf.filePath).catch(() => undefined);
      } catch (error: any) {
        results.push({ tenant_id: row.tenant_id, ok: false, message: error?.message ?? 'Failed' });
      }
    }
    await execute('UPDATE bill_splits SET status = ? WHERE id = ?', ['sent', splitId]);
    return results;
  });
  ipcMain.handle('whatsapp:sendReminder', async (_event, tenantBillId: number) => {
    const row = await queryOne<any>(
      `SELECT tb.*, t.name as tenant_name, t.room_no, t.phone, b.period_month, b.period_year
       FROM tenant_bills tb
       INNER JOIN tenants t ON t.id = tb.tenant_id
       INNER JOIN bill_splits bs ON bs.id = tb.bill_split_id
       INNER JOIN bills b ON b.id = bs.bill_id
       WHERE tb.id = ?`,
      [tenantBillId],
    );
    if (!row || !row.phone) {
      throw new Error('Tenant phone number not found');
    }

    const settings = await queryAll<{ key: string; value: string | null }>('SELECT key, value FROM app_config');
    const config = Object.fromEntries(settings.map((entry) => [entry.key, entry.value ?? '']));
    const amount = Number(row.payable ?? 0).toFixed(2);
    const sent = await sendReminderTemplate({
      phoneNumberId: config.whatsapp_phone_number_id,
      accessToken: config.whatsapp_access_token,
      templateName: config.whatsapp_electricity_reminder_template || 'electricity_reminder',
      language: config.whatsapp_template_language || 'en',
      to: row.phone,
      bodyParams: [row.tenant_name, getBillPeriodLabel(row), amount],
    });

    return { ok: true, messageId: sent.messageId };
  });
}
