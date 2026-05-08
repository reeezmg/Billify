import { ipcMain } from 'electron';
import {
  getActiveTenants,
  getTenantBillHistory,
  listTenants,
  updateTenantBillPayment,
  upsertTenant,
} from '../services/tenant.service';

export function registerTenantsIpc() {
  ipcMain.handle('tenants:list', async () => listTenants());
  ipcMain.handle('tenants:active', async () => getActiveTenants());
  ipcMain.handle('tenants:save', async (_event, tenant) => upsertTenant(tenant));
  ipcMain.handle('tenants:getBills', async (_event, tenantId: number) => getTenantBillHistory(tenantId));
  ipcMain.handle(
    'tenants:updateBillPayment',
    async (_event, tenantBillId: number, paymentStatus, paymentMethod, paymentDate) =>
      updateTenantBillPayment(tenantBillId, paymentStatus, paymentMethod, paymentDate),
  );
}
