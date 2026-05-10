import { queryAll } from '../db/client';
import type { PaymentLedgerEntry } from '../../src/types';

export async function listPayments(): Promise<PaymentLedgerEntry[]> {
  return queryAll<PaymentLedgerEntry>(
    `
      SELECT *
      FROM (
        SELECT
          'electricity' AS paid_for,
          tb.id AS source_id,
          tb.tenant_id,
          t.name AS tenant_name,
          t.room_no,
          tb.payment_date AS paid_date,
          tb.payable AS paid_amount,
          tb.payment_method AS paid_method,
          b.period_month,
          b.period_year
        FROM tenant_bills tb
        INNER JOIN bill_splits bs ON bs.id = tb.bill_split_id
        INNER JOIN bills b ON b.id = bs.bill_id
        INNER JOIN tenants t ON t.id = tb.tenant_id
        WHERE tb.payment_status = 'paid'

        UNION ALL

        SELECT
          'management' AS paid_for,
          mb.id AS source_id,
          mb.tenant_id,
          t.name AS tenant_name,
          t.room_no,
          mb.payment_date AS paid_date,
          mb.total AS paid_amount,
          mb.payment_method AS paid_method,
          b.period_month,
          b.period_year
        FROM management_tenant_bills mb
        INNER JOIN management_bill_batches b ON b.id = mb.batch_id
        INNER JOIN tenants t ON t.id = mb.tenant_id
        WHERE mb.payment_status = 'paid'
      )
      ORDER BY paid_date DESC, paid_for DESC, source_id DESC
    `,
  );
}
