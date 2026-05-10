import { execute, queryAll, queryOne } from '../db/client';
import type { Bill, BillSplit } from '../../src/types';

function isUniquePeriodError(error: unknown) {
  return error instanceof Error && error.message.includes('UNIQUE constraint failed: bills.period_month, bills.period_year');
}

function duplicatePeriodMessage(month?: number, year?: number) {
  return `A bill already exists for ${month}/${year}. Please edit the existing bill instead.`;
}

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
    const duplicate = await queryOne<Bill>(
      'SELECT * FROM bills WHERE period_month = ? AND period_year = ? AND id != ?',
      [bill.period_month, bill.period_year, bill.id],
    );
    if (duplicate) {
      throw new Error(duplicatePeriodMessage(bill.period_month, bill.period_year));
    }

    try {
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
    } catch (error) {
      if (isUniquePeriodError(error)) {
        throw new Error(duplicatePeriodMessage(bill.period_month, bill.period_year));
      }
      throw error;
    }
    return bill.id;
  }

  const duplicate = await queryOne<Bill>('SELECT * FROM bills WHERE period_month = ? AND period_year = ?', [
    bill.period_month,
    bill.period_year,
  ]);
  if (duplicate) {
    throw new Error(duplicatePeriodMessage(bill.period_month, bill.period_year));
  }

  try {
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
  } catch (error) {
    if (isUniquePeriodError(error)) {
      throw new Error(duplicatePeriodMessage(bill.period_month, bill.period_year));
    }
    throw error;
  }
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
