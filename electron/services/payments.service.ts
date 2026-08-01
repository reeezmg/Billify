import { queryAll } from '../db/client';
import type { PaymentLedgerEntry } from '../../src/types';

export async function listPayments(): Promise<PaymentLedgerEntry[]> {
  return queryAll<PaymentLedgerEntry>(
    `
      SELECT
        tb.id AS source_id,
        bs.id AS split_id,
        tb.tenant_id,
        t.name AS tenant_name,
        t.room_no,
        tb.payment_date AS paid_date,
        tb.payable AS paid_amount,
        (tb.payable - COALESCE(tb.management_total, 0)) AS electricity_amount,
        COALESCE(tb.management_total, 0) AS management_amount,
        b.period_month,
        b.period_year
      FROM tenant_bills tb
      INNER JOIN bill_splits bs ON bs.id = tb.bill_split_id
      INNER JOIN bills b ON b.id = bs.bill_id
      INNER JOIN tenants t ON t.id = tb.tenant_id
      WHERE tb.payment_status = 'paid'
      ORDER BY paid_date DESC, source_id DESC
    `,
  );
}
