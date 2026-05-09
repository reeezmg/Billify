import { execute, queryAll, queryOne } from '../db/client';
import type {
  PaymentMethod,
  PaymentStatus,
  Tenant,
  TenantBillHistoryRecord,
  TenantBillHistoryPayload,
} from '../../src/types';

export async function listTenants() {
  return queryAll<Tenant>('SELECT * FROM tenants ORDER BY room_no, name');
}

export async function upsertTenant(tenant: Partial<Tenant>) {
  if (tenant.id) {
    const existing = await queryOne<Tenant>('SELECT * FROM tenants WHERE id = ?', [tenant.id]);
    if (!existing) {
      return tenant.id;
    }

    const nextTenant = {
      ...existing,
      ...tenant,
      room_no: tenant.room_no ?? existing.room_no,
      name: tenant.name ?? existing.name,
      phone: tenant.phone === undefined ? existing.phone : tenant.phone,
      email: tenant.email === undefined ? existing.email : tenant.email,
      present_reading: tenant.present_reading ?? existing.present_reading,
      active: tenant.active ?? existing.active,
    };

    await execute(
      'UPDATE tenants SET room_no = ?, name = ?, phone = ?, email = ?, present_reading = ?, active = ?, updated_at = datetime(\'now\') WHERE id = ?',
      [
        nextTenant.room_no,
        nextTenant.name,
        nextTenant.phone ?? null,
        nextTenant.email ?? null,
        nextTenant.present_reading ?? 0,
        nextTenant.active ?? 1,
        tenant.id,
      ],
    );
    return tenant.id;
  }

  const result = await execute(
    'INSERT INTO tenants (room_no, name, phone, email, present_reading, active) VALUES (?, ?, ?, ?, ?, ?)',
    [tenant.room_no, tenant.name, tenant.phone ?? null, tenant.email ?? null, tenant.present_reading ?? 0, tenant.active ?? 1],
  );
  return result.lastID;
}

export async function getActiveTenants() {
  return queryAll<Tenant>('SELECT * FROM tenants WHERE active = 1 ORDER BY room_no, name');
}

export async function softDeleteTenant(tenantId: number) {
  const tenant = await queryOne<Tenant>('SELECT * FROM tenants WHERE id = ?', [tenantId]);
  if (!tenant) {
    throw new Error('Tenant not found');
  }

  await execute('UPDATE tenants SET active = 0, updated_at = datetime(\'now\') WHERE id = ?', [tenantId]);
  return { ok: true };
}

export async function getTenantBillHistory(tenantId: number): Promise<TenantBillHistoryPayload> {
  const tenant = await queryOne<Tenant>('SELECT * FROM tenants WHERE id = ?', [tenantId]);
  const bills = await queryAll<TenantBillHistoryRecord>(
    `SELECT
        tb.*,
        t.name AS tenant_name,
        t.room_no,
        t.phone,
        bs.reading_date,
        bs.status AS split_status,
        b.period_month,
        b.period_year,
        b.total AS bill_total
     FROM tenant_bills tb
     INNER JOIN bill_splits bs ON bs.id = tb.bill_split_id
     INNER JOIN bills b ON b.id = bs.bill_id
     INNER JOIN tenants t ON t.id = tb.tenant_id
     WHERE tb.tenant_id = ?
     ORDER BY b.period_year DESC, b.period_month DESC, bs.id DESC`,
    [tenantId],
  );

  return { tenant: tenant ?? null, bills };
}

export async function updateTenantBillPayment(
  tenantBillId: number,
  paymentStatus: PaymentStatus,
  paymentMethod: PaymentMethod | null,
  paymentDate: string | null,
) {
  await execute('UPDATE tenant_bills SET payment_status = ?, payment_method = ?, payment_date = ? WHERE id = ?', [
    paymentStatus,
    paymentStatus === 'paid' ? paymentMethod : null,
    paymentStatus === 'paid' ? paymentDate : null,
    tenantBillId,
  ]);
  return { ok: true };
}
