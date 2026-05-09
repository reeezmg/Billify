import { contextBridge, ipcRenderer } from 'electron';
import type { AppSettings, Bill, BillSplit, PaymentMethod, PaymentStatus, SessionUser, Tenant, TenantBillHistory } from '../src/types';

const api = {
  auth: {
    getSession: () => ipcRenderer.invoke('auth:getSession') as Promise<SessionUser | null>,
    login: (email: string, password: string) => ipcRenderer.invoke('auth:login', email, password),
    logout: () => ipcRenderer.invoke('auth:logout'),
    changePassword: (userId: number, password: string) => ipcRenderer.invoke('auth:changePassword', userId, password),
  },
  tenants: {
    list: () => ipcRenderer.invoke('tenants:list') as Promise<Tenant[]>,
    active: () => ipcRenderer.invoke('tenants:active') as Promise<Tenant[]>,
    save: (tenant: Partial<Tenant>) => ipcRenderer.invoke('tenants:save', tenant),
    delete: (tenantId: number) => ipcRenderer.invoke('tenants:delete', tenantId),
    getBills: (tenantId: number) => ipcRenderer.invoke('tenants:getBills', tenantId) as Promise<TenantBillHistory>,
    updateBillPayment: (
      tenantBillId: number,
      paymentStatus: PaymentStatus,
      paymentMethod: PaymentMethod | null,
      paymentDate: string | null,
    ) => ipcRenderer.invoke('tenants:updateBillPayment', tenantBillId, paymentStatus, paymentMethod, paymentDate),
  },
  bills: {
    list: () => ipcRenderer.invoke('bills:list') as Promise<Bill[]>,
    create: (bill: Omit<Bill, 'id'>) => ipcRenderer.invoke('bills:create', bill),
    save: (bill: Partial<Bill>) => ipcRenderer.invoke('bills:save', bill),
    get: (id: number) => ipcRenderer.invoke('bills:get', id) as Promise<Bill | null>,
    getOrCreateSplit: (billId: number) => ipcRenderer.invoke('bills:getOrCreateSplit', billId) as Promise<BillSplit | null>,
  },
  splits: {
    calculate: (input: any) => ipcRenderer.invoke('splits:calculate', input),
    get: (splitId: number) => ipcRenderer.invoke('splits:get', splitId),
    save: (payload: any) => ipcRenderer.invoke('splits:save', payload),
    saveDraft: (payload: any) => ipcRenderer.invoke('splits:saveDraft', payload),
    downloadAll: (splitId: number) => ipcRenderer.invoke('splits:downloadAll', splitId),
  },
  users: {
    list: () => ipcRenderer.invoke('users:list'),
    save: (user: any) => ipcRenderer.invoke('users:save', user),
    delete: (userId: number) => ipcRenderer.invoke('users:delete', userId),
    resetPassword: (userId: number, password: string) => ipcRenderer.invoke('users:resetPassword', userId, password),
  },
  whatsapp: {
    previewPdf: (splitId: number, tenantBillId: number) => ipcRenderer.invoke('whatsapp:previewPdf', splitId, tenantBillId) as Promise<string>,
    sendAll: (splitId: number) => ipcRenderer.invoke('whatsapp:sendAll', splitId),
    sendReminder: (tenantBillId: number) => ipcRenderer.invoke('whatsapp:sendReminder', tenantBillId),
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get') as Promise<AppSettings>,
    save: (settings: AppSettings) => ipcRenderer.invoke('settings:save', settings),
  },
};

contextBridge.exposeInMainWorld('api', api);

declare global {
  interface Window {
    api: typeof api;
  }
}
