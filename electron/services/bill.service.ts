import { execute, queryAll, queryOne } from '../db/client';
import type { Bill, BillSplit } from '../../src/types';

export async function listBills() {
  return queryAll<
    Bill & {
      split_status: Bill['split_status'];
      tenant_count: number;
      pending_count: number;
    }
  >(
    `
    SELECT
      b.*,
      bs.status AS split_status,
      COALESCE(stats.tenant_count, 0) AS tenant_count,
      COALESCE(stats.pending_count, 0) AS pending_count
    FROM bills b
    LEFT JOIN bill_splits bs ON bs.bill_id = b.id
    LEFT JOIN (
      SELECT
        bs.bill_id,
        COUNT(tb.id) AS tenant_count,
        COALESCE(SUM(CASE WHEN tb.payment_status = 'pending' THEN 1 ELSE 0 END), 0) AS pending_count
      FROM bill_splits bs
      LEFT JOIN tenant_bills tb ON tb.bill_split_id = bs.id
      GROUP BY bs.bill_id
    ) stats ON stats.bill_id = b.id
    ORDER BY b.period_year DESC, b.period_month DESC
  `,
  );
}

export async function createBill(bill: Omit<Bill, 'id'>) {
  const fixedCharge = bill.fixed_charge ?? (bill.fixed_unit ?? 0) * (bill.fixed_unit_price ?? 0);
  const energyCharge = bill.energy_charge ?? (bill.energy_unit ?? 0) * (bill.energy_unit_price ?? 0);
  const extraUnitCharge = bill.extra_unit_charge ?? (bill.energy_unit ?? 0) * (bill.extra_unit_price ?? 0);
  const taxAmount =
    bill.tax ??
    (fixedCharge + energyCharge + (bill.extra_charge ?? 0) + extraUnitCharge) * ((bill.tax_percent ?? 0) / 100);
  const total =
    bill.total ??
    fixedCharge +
      energyCharge +
      (bill.extra_charge ?? 0) +
      extraUnitCharge +
      taxAmount +
      (bill.interest_charge ?? 0) +
      (bill.other_charge ?? 0);

  const result = await execute(
    `INSERT INTO bills
      (entry_mode, period_month, period_year, fixed_unit, fixed_unit_price, fixed_charge, energy_unit, energy_unit_price, energy_charge, extra_charge, extra_unit_price, extra_unit_charge, tax, tax_percent, interest_charge, other_charge, total)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      bill.entry_mode ?? 'auto',
      bill.period_month,
      bill.period_year,
      bill.fixed_unit,
      bill.fixed_unit_price,
      fixedCharge,
      bill.energy_unit,
      bill.energy_unit_price,
      energyCharge,
      bill.extra_charge ?? 0,
      bill.extra_unit_price ?? 0,
      extraUnitCharge,
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
  const extraUnitCharge = bill.extra_unit_charge ?? (bill.energy_unit ?? 0) * (bill.extra_unit_price ?? 0);
  const taxAmount =
    bill.tax ??
    (fixedCharge + energyCharge + (bill.extra_charge ?? 0) + extraUnitCharge) * ((bill.tax_percent ?? 0) / 100);
  const total =
    bill.total ??
    fixedCharge +
      energyCharge +
      (bill.extra_charge ?? 0) +
      extraUnitCharge +
      taxAmount +
      (bill.interest_charge ?? 0) +
      (bill.other_charge ?? 0);

  if (bill.id) {
    await execute(
        `UPDATE bills
         SET entry_mode = ?, period_month = ?, period_year = ?, fixed_unit = ?, fixed_unit_price = ?, fixed_charge = ?, energy_unit = ?,
             energy_unit_price = ?, energy_charge = ?, extra_charge = ?, extra_unit_price = ?, extra_unit_charge = ?, tax = ?, tax_percent = ?, interest_charge = ?, other_charge = ?, total = ?,
             updated_at = datetime('now')
       WHERE id = ?`,
        [
          bill.entry_mode ?? 'auto',
          bill.period_month,
          bill.period_year,
          bill.fixed_unit,
          bill.fixed_unit_price,
          fixedCharge,
          bill.energy_unit,
          bill.energy_unit_price,
          energyCharge,
          bill.extra_charge ?? 0,
          bill.extra_unit_price ?? 0,
          extraUnitCharge,
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
      (entry_mode, period_month, period_year, fixed_unit, fixed_unit_price, fixed_charge, energy_unit, energy_unit_price, energy_charge, extra_charge, extra_unit_price, extra_unit_charge, tax, tax_percent, interest_charge, other_charge, total)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        bill.entry_mode ?? 'auto',
        bill.period_month,
        bill.period_year,
        bill.fixed_unit,
        bill.fixed_unit_price,
        fixedCharge,
        bill.energy_unit,
        bill.energy_unit_price,
        energyCharge,
        bill.extra_charge ?? 0,
        bill.extra_unit_price ?? 0,
        extraUnitCharge,
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

export async function deleteBill(id: number) {
  await execute('DELETE FROM bills WHERE id = ?', [id]);
  return true;
}

export async function getOrCreateSplit(billId: number) {
  const existing = await queryOne<BillSplit>('SELECT * FROM bill_splits WHERE bill_id = ?', [billId]);
  if (existing) return existing;
  const result = await execute('INSERT INTO bill_splits (bill_id, reading_date, tax_rate, status) VALUES (?, date(\'now\'), 0, \'draft\')', [
    billId,
  ]);
  return queryOne<BillSplit>('SELECT * FROM bill_splits WHERE id = ?', [result.lastID]);
}
