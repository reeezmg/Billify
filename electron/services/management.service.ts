import { execute, queryAll, queryOne, transaction } from '../db/client';
import type {
  ManagementBatchDetail,
  ManagementBatchSummary,
  ManagementBillBatch,
  ManagementTenantBillRow,
  PaymentMethod,
  PaymentStatus,
  Tenant,
} from '../../src/types';

function duplicatePeriodMessage(month?: number, year?: number) {
  return `A management batch already exists for ${month}/${year}. Please open the existing batch instead.`;
}

function runQuery<T>(database: any, sql: string, params: unknown[] = []) {
  const stmt = database.prepare(sql);
  try {
    stmt.bind(params);
    const rows: T[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject() as T);
    }
    return rows;
  } finally {
    stmt.free();
  }
}

export async function listBatches() {
  return queryAll<ManagementBatchSummary>(
    `SELECT
        b.*,
        COUNT(mb.id) AS tenant_count,
        COALESCE(SUM(mb.total), 0) AS total_to_collect,
        COALESCE(SUM(CASE WHEN mb.payment_status = 'paid' THEN mb.total ELSE 0 END), 0) AS total_collected
     FROM management_bill_batches b
     LEFT JOIN management_tenant_bills mb ON mb.batch_id = b.id
     GROUP BY b.id
     ORDER BY b.period_year DESC, b.period_month DESC, b.id DESC`,
  );
}

export async function getEligibleTenantsForPeriod(month: number, year: number) {
  return queryAll<Tenant>(
    `SELECT *
     FROM tenants t
     WHERE t.active = 1
       AND (t.maintenance_fees > 0 OR t.generator_fees > 0)
       AND NOT EXISTS (
         SELECT 1
         FROM management_tenant_bills mb
         INNER JOIN management_bill_batches b ON b.id = mb.batch_id
         WHERE mb.tenant_id = t.id
           AND b.period_month = ?
           AND b.period_year = ?
       )
     ORDER BY t.room_no, t.name`,
    [month, year],
  );
}

export async function rescanBatch(batchId: number) {
  const result = {
    added: 0,
    updated: 0,
    deleted: 0,
    skippedPaid: 0,
  };

  await transaction((db) => {
    const batch = runQuery<ManagementBillBatch>(db, 'SELECT * FROM management_bill_batches WHERE id = ?', [batchId])[0];
    if (!batch) {
      throw new Error('Batch not found');
    }

    const currentTenants = runQuery<Tenant>(
      db,
      `SELECT *
       FROM tenants
       WHERE active = 1
         AND (maintenance_fees > 0 OR generator_fees > 0)
       ORDER BY room_no, name`,
    );
    const existingRows = runQuery<ManagementTenantBillRow & { id: number }>(
      db,
      `SELECT
         mb.*,
         t.name AS tenant_name,
         t.room_no,
         t.phone,
         b.period_month,
         b.period_year
       FROM management_tenant_bills mb
       INNER JOIN management_bill_batches b ON b.id = mb.batch_id
       LEFT JOIN tenants t ON t.id = mb.tenant_id
       WHERE mb.batch_id = ?`,
      [batchId],
    );
    const existingByTenantId = new Map(existingRows.map((row) => [row.tenant_id, row]));
    const currentTenantIds = new Set(currentTenants.map((tenant) => tenant.id));

    const insert = db.prepare(
      `INSERT INTO management_tenant_bills
        (batch_id, tenant_id, maintenance_fees, generator_fees, total, payment_status, payment_method, payment_date, whatsapp_sent_at, whatsapp_message_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    );
    const update = db.prepare(
      'UPDATE management_tenant_bills SET maintenance_fees = ?, generator_fees = ?, total = ? WHERE id = ?',
    );
    const remove = db.prepare('DELETE FROM management_tenant_bills WHERE id = ?');
    const touchBatch = db.prepare('UPDATE management_bill_batches SET updated_at = datetime(\'now\') WHERE id = ?');

    try {
      for (const tenant of currentTenants) {
        const maintenanceFees = Number(tenant.maintenance_fees ?? 0);
        const generatorFees = Number(tenant.generator_fees ?? 0);
        const total = maintenanceFees + generatorFees;
        const existing = existingByTenantId.get(tenant.id);

        if (existing) {
          if (existing.payment_status === 'paid') {
            result.skippedPaid += 1;
            continue;
          }

          if (
            Number(existing.maintenance_fees ?? 0) !== maintenanceFees ||
            Number(existing.generator_fees ?? 0) !== generatorFees ||
            Number(existing.total ?? 0) !== total
          ) {
            update.run(maintenanceFees, generatorFees, total, existing.id);
            result.updated += 1;
          }
          continue;
        }

        insert.run(batchId, tenant.id, maintenanceFees, generatorFees, total, 'pending', null, null, null, null);
        result.added += 1;
      }

      for (const row of existingRows) {
        if (currentTenantIds.has(row.tenant_id)) continue;
        if (row.payment_status === 'paid') {
          result.skippedPaid += 1;
          continue;
        }

        remove.run(row.id);
        result.deleted += 1;
      }

      touchBatch.run(batchId);
    } finally {
      insert.free();
      update.free();
      remove.free();
      touchBatch.free();
    }
  });

  return { ok: true as const, ...result };
}

export async function createBatch(payload: { period_month: number; period_year: number }) {
  let batchId = 0;
  await transaction((db) => {
    const duplicate = runQuery<ManagementBillBatch>(
      db,
      'SELECT * FROM management_bill_batches WHERE period_month = ? AND period_year = ?',
      [payload.period_month, payload.period_year],
    )[0];
    if (duplicate) {
      throw new Error(duplicatePeriodMessage(payload.period_month, payload.period_year));
    }

    db.prepare(
      'INSERT INTO management_bill_batches (period_month, period_year, status, created_at, updated_at) VALUES (?, ?, ?, datetime(\'now\'), datetime(\'now\'))',
    ).run(payload.period_month, payload.period_year, 'created');
    batchId = Number(runQuery<{ id: number }>(db, 'SELECT last_insert_rowid() AS id')[0]?.id ?? 0);

    const eligibleTenants = runQuery<Tenant>(
      db,
      `SELECT *
       FROM tenants
       WHERE active = 1
         AND (maintenance_fees > 0 OR generator_fees > 0)
       ORDER BY room_no, name`,
    );
    const insert = db.prepare(
      `INSERT INTO management_tenant_bills
        (batch_id, tenant_id, maintenance_fees, generator_fees, total, payment_status, payment_method, payment_date, whatsapp_sent_at, whatsapp_message_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    );
    try {
      for (const tenant of eligibleTenants) {
        const maintenanceFees = Number(tenant.maintenance_fees ?? 0);
        const generatorFees = Number(tenant.generator_fees ?? 0);
        insert.run(
          batchId,
          tenant.id,
          maintenanceFees,
          generatorFees,
          maintenanceFees + generatorFees,
          'pending',
          null,
          null,
          null,
          null,
        );
      }
    } finally {
      insert.free();
    }
  });

  return { batchId };
}

export async function getBatch(batchId: number): Promise<ManagementBatchDetail | null> {
  const batch = await queryOne<ManagementBillBatch>('SELECT * FROM management_bill_batches WHERE id = ?', [batchId]);
  if (!batch) return null;
  const rows = await queryAll<ManagementTenantBillRow>(
    `SELECT
        mb.*,
        t.name AS tenant_name,
        t.room_no,
        t.phone,
        b.period_month,
        b.period_year
     FROM management_tenant_bills mb
     INNER JOIN management_bill_batches b ON b.id = mb.batch_id
     INNER JOIN tenants t ON t.id = mb.tenant_id
     WHERE mb.batch_id = ?
     ORDER BY t.room_no, t.name`,
    [batchId],
  );
  return { batch, rows };
}

export async function updateManagementBillPayment(
  managementBillId: number,
  paymentStatus: PaymentStatus,
  paymentMethod: PaymentMethod | null,
  paymentDate: string | null,
) {
  await execute(
    'UPDATE management_tenant_bills SET payment_status = ?, payment_method = ?, payment_date = ? WHERE id = ?',
    [paymentStatus, paymentStatus === 'paid' ? paymentMethod : null, paymentStatus === 'paid' ? paymentDate : null, managementBillId],
  );
  return { ok: true };
}

export async function markBatchSent(batchId: number) {
  await execute('UPDATE management_bill_batches SET status = ?, updated_at = datetime(\'now\') WHERE id = ?', ['sent', batchId]);
  return { ok: true };
}
