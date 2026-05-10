import { dialog, ipcMain, shell } from 'electron';
import fs from 'node:fs/promises';
import {
  createBatch,
  getBatch,
  listBatches,
  markBatchSent,
  rescanBatch,
  updateManagementBillPayment,
} from '../services/management.service';
import { exportManagementBillPdfs, generateManagementBillPdf } from '../services/pdf.service';
import { getSettings } from '../services/settings.service';
import { sendReminderTemplate, sendTemplateWithMedia, uploadMedia } from '../services/whatsapp.service';
import { execute, queryOne } from '../db/client';
import { getManagementBillNumber, getManagementBillPeriodLabel } from '../../src/lib/managementBillPdf';

export function registerManagementIpc() {
  ipcMain.handle('management:listBatches', async () => listBatches());
  ipcMain.handle('management:createBatch', async (_event, period) => createBatch(period));
  ipcMain.handle('management:getBatch', async (_event, batchId: number) => getBatch(batchId));
  ipcMain.handle('management:rescanBatch', async (_event, batchId: number) => rescanBatch(batchId));
  ipcMain.handle(
    'management:updateBillPayment',
    async (_event, managementBillId: number, paymentStatus, paymentMethod, paymentDate) =>
      updateManagementBillPayment(managementBillId, paymentStatus, paymentMethod, paymentDate),
  );
  ipcMain.handle('management:downloadAll', async (_event, batchId: number) => {
    const batch = await queryOne<any>('SELECT * FROM management_bill_batches WHERE id = ?', [batchId]);
    if (!batch) {
      throw new Error('Batch not found');
    }

    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: 'Choose a folder for management bill PDFs',
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { ok: false as const, canceled: true as const };
    }

    const exportResult = await exportManagementBillPdfs(batchId, result.filePaths[0]);
    await shell.openPath(exportResult.folderPath).catch(() => undefined);
    return { ok: true as const, ...exportResult };
  });
  ipcMain.handle('management:sendAll', async (_event, batchId: number) => {
    const batchResult = await getBatch(batchId);
    if (!batchResult) {
      throw new Error('Batch not found');
    }
    const settings = await getSettings();
    const results: Array<{ tenant_id: number; ok: boolean; message?: string }> = [];

    for (const row of batchResult.rows) {
      if (!row.phone) {
        results.push({ tenant_id: row.tenant_id, ok: false, message: 'Phone number missing' });
        continue;
      }
      try {
        const pdf = await generateManagementBillPdf(batchId, row);
        const media = await uploadMedia({
          phoneNumberId: settings.whatsapp_phone_number_id,
          accessToken: settings.whatsapp_access_token,
          filePath: pdf.filePath,
        });
        const sent = await sendTemplateWithMedia({
          phoneNumberId: settings.whatsapp_phone_number_id,
          accessToken: settings.whatsapp_access_token,
          templateName: settings.whatsapp_management_bill_template || 'management_bill',
          language: settings.whatsapp_template_language || 'en',
          to: row.phone,
          bodyParams: [
            row.tenant_name,
            getManagementBillPeriodLabel(batchResult.batch),
            getManagementBillNumber(batchResult.batch, row),
            row.room_no,
            String(row.total),
          ],
          mediaId: media.mediaId,
        });
        await execute('UPDATE management_tenant_bills SET whatsapp_sent_at = datetime(\'now\'), whatsapp_message_id = ? WHERE id = ?', [
          sent.messageId,
          row.id,
        ]);
        results.push({ tenant_id: row.tenant_id, ok: true });
        await fs.unlink(pdf.filePath).catch(() => undefined);
      } catch (error: any) {
        results.push({ tenant_id: row.tenant_id, ok: false, message: error?.message ?? 'Failed' });
      }
    }

    await markBatchSent(batchId);
    return results;
  });
  ipcMain.handle('management:sendReminder', async (_event, managementBillId: number) => {
    const row = await queryOne<any>(
      `SELECT mb.*, t.name AS tenant_name, t.room_no, t.phone, b.period_month, b.period_year
       FROM management_tenant_bills mb
       INNER JOIN tenants t ON t.id = mb.tenant_id
       INNER JOIN management_bill_batches b ON b.id = mb.batch_id
       WHERE mb.id = ?`,
      [managementBillId],
    );
    if (!row || !row.phone) {
      throw new Error('Tenant phone number not found');
    }

    const settings = await getSettings();
    const period = `${row.period_month}/${row.period_year}`;
    const amount = Number(row.total ?? 0).toFixed(2);
    const sent = await sendReminderTemplate({
      phoneNumberId: settings.whatsapp_phone_number_id,
      accessToken: settings.whatsapp_access_token,
      templateName: settings.whatsapp_management_reminder_template || 'management_reminder',
      language: settings.whatsapp_template_language || 'en',
      to: row.phone,
      bodyParams: [row.tenant_name, period, amount],
    });

    return { ok: true, messageId: sent.messageId };
  });
}
