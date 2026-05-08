import { execute, queryAll, queryOne } from '../db/client';
import type { Bill, BillSplit } from '../../src/types';

export async function listBills() {
  return queryAll<Bill & { split_status: Bill['split_status'] }>(`
    SELECT b.*, bs.status AS split_status
      FROM bills b
      LEFT JOIN bill_splits bs ON bs.bill_id = b.id
     ORDER BY b.period_year DESC, b.period_month DESC
  `);
}

export async function createBill(bill: Omit<Bill, 'id'>) {
  const fixedCharge = bill.fixed_charge ?? (bill.fixed_unit ?? 0) * (bill.fixed_unit_price ?? 0);
  const energyCharge = bill.energy_charge ?? (bill.energy_unit ?? 0) * (bill.energy_unit_price ?? 0);
  const taxAmount = bill.tax ?? (fixedCharge + energyCharge + (bill.extra_charge ?? 0)) * ((bill.tax_percent ?? 0) / 100);
  const total =
    bill.total ??
    fixedCharge + energyCharge + (bill.extra_charge ?? 0) + taxAmount + (bill.interest_charge ?? 0) + (bill.other_charge ?? 0);

  const result = await execute(
    `INSERT INTO bills
      (period_month, period_year, fixed_unit, fixed_unit_price, fixed_charge, energy_unit, energy_unit_price, energy_charge, extra_charge, tax, tax_percent, interest_charge, other_charge, total)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      bill.period_month,
      bill.period_year,
      bill.fixed_unit,
      bill.fixed_unit_price,
      fixedCharge,
      bill.energy_unit,
      bill.energy_unit_price,
      energyCharge,
      bill.extra_charge ?? 0,
      taxAmount,
      bill.tax_percent ?? 0,
      bill.interest_charge ?? 0,
      bill.other_charge ?? 0,
      total,
    ],
  );
  return result.lastID;
}

export async function upsertBill(bill: Partial<Bill>) {
  const fixedCharge = bill.fixed_charge ?? (bill.fixed_unit ?? 0) * (bill.fixed_unit_price ?? 0);
  const energyCharge = bill.energy_charge ?? (bill.energy_unit ?? 0) * (bill.energy_unit_price ?? 0);
  const taxAmount = bill.tax ?? (fixedCharge + energyCharge + (bill.extra_charge ?? 0)) * ((bill.tax_percent ?? 0) / 100);
  const total =
    bill.total ??
    fixedCharge + energyCharge + (bill.extra_charge ?? 0) + taxAmount + (bill.interest_charge ?? 0) + (bill.other_charge ?? 0);

  if (bill.id) {
    await execute(
      `UPDATE bills
         SET period_month = ?, period_year = ?, fixed_unit = ?, fixed_unit_price = ?, fixed_charge = ?, energy_unit = ?,
             energy_unit_price = ?, energy_charge = ?, extra_charge = ?, tax = ?, tax_percent = ?, interest_charge = ?, other_charge = ?, total = ?,
             updated_at = datetime('now')
       WHERE id = ?`,
      [
        bill.period_month,
        bill.period_year,
        bill.fixed_unit,
        bill.fixed_unit_price,
        fixedCharge,
        bill.energy_unit,
        bill.energy_unit_price,
        energyCharge,
        bill.extra_charge ?? 0,
        taxAmount,
        bill.tax_percent ?? 0,
        bill.interest_charge ?? 0,
        bill.other_charge ?? 0,
        total,
        bill.id,
      ],
    );
    return bill.id;
  }

  const result = await execute(
    `INSERT INTO bills
      (period_month, period_year, fixed_unit, fixed_unit_price, fixed_charge, energy_unit, energy_unit_price, energy_charge, extra_charge, tax, tax_percent, interest_charge, other_charge, total)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      bill.period_month,
      bill.period_year,
      bill.fixed_unit,
      bill.fixed_unit_price,
      fixedCharge,
      bill.energy_unit,
      bill.energy_unit_price,
      energyCharge,
      bill.extra_charge ?? 0,
      taxAmount,
      bill.tax_percent ?? 0,
      bill.interest_charge ?? 0,
      bill.other_charge ?? 0,
      total,
    ],
  );
  return result.lastID;
}

export async function getBill(id: number) {
  return queryOne<Bill>('SELECT * FROM bills WHERE id = ?', [id]);
}

export async function getOrCreateSplit(billId: number) {
  const existing = await queryOne<BillSplit>('SELECT * FROM bill_splits WHERE bill_id = ?', [billId]);
  if (existing) return existing;
  const result = await execute('INSERT INTO bill_splits (bill_id, reading_date, tax_rate, status) VALUES (?, date(\'now\'), 0, \'draft\')', [
    billId,
  ]);
  return queryOne<BillSplit>('SELECT * FROM bill_splits WHERE id = ?', [result.lastID]);
}
