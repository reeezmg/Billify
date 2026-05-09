import { ipcMain } from 'electron';
import { calculateSplit } from '../services/split.service';
import { execute, queryAll, queryOne, transaction } from '../db/client';
import { dialog, shell } from 'electron';
import { exportTenantBillPdfs } from '../services/pdf.service';
import type { SplitBillInput } from '../../src/types';

export function registerSplitsIpc() {
  ipcMain.handle('splits:calculate', async (_event, input: SplitBillInput) => calculateSplit(input));
  ipcMain.handle('splits:get', async (_event, splitId: number) => {
    const split = await queryOne<any>('SELECT * FROM bill_splits WHERE id = ?', [splitId]);
    const bill = split ? await queryOne<any>('SELECT * FROM bills WHERE id = ?', [split.bill_id]) : null;
    const rows = await queryAll<any>(
      `SELECT tb.*, t.name as tenant_name, t.room_no, t.phone
       FROM tenant_bills tb
       INNER JOIN tenants t ON t.id = tb.tenant_id
       WHERE tb.bill_split_id = ?
       ORDER BY t.room_no, t.name`,
      [splitId],
    );
    return { split, bill, rows };
  });
  const persistSplit = async (_event: unknown, payload: any) => {
    return transaction((db) => {
      const existingRows: Array<{
        tenant_id: number;
        payment_status: 'pending' | 'paid';
        payment_method: 'cash' | 'upi' | 'card' | null;
        payment_date: string | null;
      }> = [];
      if (payload.split_id) {
        const stmt = db.prepare('SELECT tenant_id, payment_status, payment_method, payment_date FROM tenant_bills WHERE bill_split_id = ?');
        try {
          stmt.bind([payload.split_id]);
          while (stmt.step()) {
            existingRows.push(stmt.getAsObject() as {
              tenant_id: number;
              payment_status: 'pending' | 'paid';
              payment_method: 'cash' | 'upi' | 'card' | null;
              payment_date: string | null;
            });
          }
        } finally {
          stmt.free();
        }
      }
      const existingPayments = new Map(existingRows.map((row) => [row.tenant_id, row]));
      db.prepare('UPDATE bill_splits SET reading_date = ?, tax_rate = ?, status = ? WHERE id = ?').run(
        payload.reading_date,
        payload.tax_rate,
        payload.status ?? 'draft',
        payload.split_id,
      );
      db.prepare('DELETE FROM tenant_bills WHERE bill_split_id = ?').run(payload.split_id);
      const calculated = calculateSplit({ bill: payload.bill, split: { tax_rate: payload.tax_rate }, rows: payload.rows });
      const insert = db.prepare(
        `INSERT INTO tenant_bills
          (bill_split_id, tenant_id, previous_reading, present_reading, consumed_unit, fixed_charge_calc, fixed_adjust,
           energy_charge, extra_charge_calc, extra_adjust, tax, sub_total, interest_charge_calc, interest_adjust,
           other_charge_calc, payment_status, payment_method, payment_date, payable)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const calc of calculated.rows) {
        const row = payload.rows.find((item: any) => item.tenant_id === calc.tenant_id);
        const payment = existingPayments.get(calc.tenant_id);
        insert.run(
          payload.split_id,
          calc.tenant_id,
          calc.previous_reading,
          calc.present_reading,
          calc.consumed_unit,
          calc.fixed_charge_calc,
          row?.fixed_adjust ?? 0,
          calc.energy_charge,
          calc.extra_charge_calc,
          row?.extra_adjust ?? 0,
          calc.tax,
          calc.sub_total,
          calc.interest_charge_calc,
          row?.interest_adjust ?? 0,
          calc.other_charge_calc,
          payment?.payment_status ?? 'pending',
          payment?.payment_method ?? null,
          payment?.payment_date ?? null,
          calc.payable,
        );
      }
      return { ok: true };
    });
  };
  ipcMain.handle('splits:saveDraft', persistSplit);
  ipcMain.handle('splits:save', persistSplit);
  ipcMain.handle('splits:downloadAll', async (_event, splitId: number) => {
    const split = await queryOne<any>(
      `SELECT bs.id, bs.reading_date, b.period_month, b.period_year
       FROM bill_splits bs
       INNER JOIN bills b ON b.id = bs.bill_id
       WHERE bs.id = ?`,
      [splitId],
    );
    if (!split) {
      throw new Error('Split not found');
    }

    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: 'Choose a folder for tenant bill PDFs',
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { ok: false as const, canceled: true as const };
    }

    const exportResult = await exportTenantBillPdfs(splitId, result.filePaths[0]);
    await shell.openPath(exportResult.folderPath).catch(() => undefined);
    return { ok: true as const, ...exportResult };
  });
}
