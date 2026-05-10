import { calculateSplit } from './calc';
import {
  buildTenantBillPdfBytes,
  getBillPayDate,
  getBillPeriodLabel,
  getTenantBillFileName,
  getTenantBillFolderName,
  getTenantBillNumber,
} from './tenantBillPdf';
import {
  sendWhatsAppReminderTemplate,
  sendWhatsAppTemplateWithMedia,
  uploadWhatsAppMedia,
} from './whatsappClient';
import {
  buildManagementBillPdfBytes,
  getManagementBillFileName,
  getManagementBillFolderName,
  getManagementBillNumber,
  getManagementBillPeriodLabel,
} from './managementBillPdf';
import type {
  AppSettings,
  Bill,
  BillSplit,
  ManagementBatchDetail,
  ManagementBatchSummary,
  ManagementBillBatch,
  ManagementTenantBillRow,
  PaymentLedgerEntry,
  PaymentMethod,
  PaymentStatus,
  SessionUser,
  Tenant,
  TenantBillHistory,
  TenantBillHistoryRow,
} from '../types';

type StoredUser = SessionUser & {
  password: string;
};

type StoredSplit = BillSplit & {
  rows: any[];
};

type StoredManagementBatch = ManagementBillBatch & {
  rows: any[];
};

type BrowserState = {
  sessionUserId: number | null;
  users: StoredUser[];
  tenants: Tenant[];
  bills: Bill[];
  splits: StoredSplit[];
  managementBatches: StoredManagementBatch[];
  settings: AppSettings;
};

const STORAGE_KEY = 'billify.browserState.v1';

const defaultSettings: AppSettings = {
  company_name: 'Billify Building',
  company_address: '',
  whatsapp_phone_number_id: '',
  whatsapp_access_token: '',
  whatsapp_electricity_bill_template: 'electricity_bill',
  whatsapp_electricity_reminder_template: 'electricity_reminder',
  whatsapp_management_bill_template: 'management_bill',
  whatsapp_management_reminder_template: 'management_reminder',
  whatsapp_template_language: 'en',
};

const defaultState: BrowserState = {
  sessionUserId: null,
  users: [
    {
      id: 1,
      name: 'Admin',
      email: 'admin@local',
      role: 'admin',
      must_change_password: true,
      password: 'admin',
    },
  ],
  tenants: [],
  bills: [],
  splits: [],
  managementBatches: [],
  settings: defaultSettings,
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function loadState(): BrowserState {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return clone(defaultState);
  }

  try {
    const parsed = JSON.parse(raw) as Partial<BrowserState>;
    const parsedSettings = (parsed.settings ?? {}) as Partial<AppSettings> & { whatsapp_template_name?: string };
    return {
      ...clone(defaultState),
      ...parsed,
      settings: {
        company_name: parsedSettings.company_name ?? defaultSettings.company_name,
        company_address: parsedSettings.company_address ?? defaultSettings.company_address,
        whatsapp_phone_number_id: parsedSettings.whatsapp_phone_number_id ?? defaultSettings.whatsapp_phone_number_id,
        whatsapp_access_token: parsedSettings.whatsapp_access_token ?? defaultSettings.whatsapp_access_token,
        whatsapp_electricity_bill_template:
          parsedSettings.whatsapp_electricity_bill_template ?? parsedSettings.whatsapp_template_name ?? defaultSettings.whatsapp_electricity_bill_template,
        whatsapp_electricity_reminder_template:
          parsedSettings.whatsapp_electricity_reminder_template ?? defaultSettings.whatsapp_electricity_reminder_template,
        whatsapp_management_bill_template:
          parsedSettings.whatsapp_management_bill_template ?? defaultSettings.whatsapp_management_bill_template,
        whatsapp_management_reminder_template:
          parsedSettings.whatsapp_management_reminder_template ?? defaultSettings.whatsapp_management_reminder_template,
        whatsapp_template_language: parsedSettings.whatsapp_template_language ?? defaultSettings.whatsapp_template_language,
      },
      users: parsed.users?.length ? (parsed.users as StoredUser[]) : clone(defaultState.users),
      tenants: parsed.tenants?.length
        ? (parsed.tenants as Tenant[]).map((tenant) => ({
            ...tenant,
            present_reading: tenant.present_reading ?? 0,
            maintenance_fees: tenant.maintenance_fees ?? 0,
            generator_fees: tenant.generator_fees ?? 0,
          }))
        : [],
      bills: parsed.bills?.length
        ? (parsed.bills as Bill[]).map((bill) => ({
            ...bill,
            tax_percent: bill.tax_percent ?? 0,
            other_charge: bill.other_charge ?? 0,
          }))
        : [],
      splits: parsed.splits?.length ? (parsed.splits as StoredSplit[]) : [],
      managementBatches: parsed.managementBatches?.length ? (parsed.managementBatches as StoredManagementBatch[]) : [],
    };
  } catch {
    return clone(defaultState);
  }
}

function saveState(state: BrowserState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function nextId(items: { id: number }[]) {
  return items.reduce((max, item) => Math.max(max, item.id), 0) + 1;
}

function tenantBillRowId(splitId: number, tenantId: number) {
  return splitId * 100000 + tenantId;
}

function managementBillRowId(batchId: number, tenantId: number) {
  return batchId * 100000 + tenantId;
}

function getCurrentUser(state: BrowserState) {
  return state.users.find((user) => user.id === state.sessionUserId) ?? null;
}

function seedSplitRows(tenants: Tenant[]) {
  return tenants.map((tenant) => ({
    tenant_id: tenant.id,
    tenant_name: tenant.name,
    room_no: tenant.room_no,
    phone: tenant.phone,
    previous_reading: tenant.present_reading ?? 0,
    present_reading: tenant.present_reading ?? 0,
    fixed_adjust: 0,
    extra_adjust: 0,
    interest_adjust: 0,
    other_adjust: 0,
    payment_status: 'pending' as PaymentStatus,
    payment_method: null as PaymentMethod | null,
  }));
}

function seedManagementRows(tenants: Tenant[]) {
  return tenants
    .filter((tenant) => tenant.active && ((tenant.maintenance_fees ?? 0) > 0 || (tenant.generator_fees ?? 0) > 0))
    .map((tenant) => ({
      tenant_id: tenant.id,
      tenant_name: tenant.name,
      room_no: tenant.room_no,
      phone: tenant.phone,
      maintenance_fees: tenant.maintenance_fees ?? 0,
      generator_fees: tenant.generator_fees ?? 0,
      total: (tenant.maintenance_fees ?? 0) + (tenant.generator_fees ?? 0),
      payment_status: 'pending' as PaymentStatus,
      payment_method: null as PaymentMethod | null,
      payment_date: null as string | null,
      whatsapp_sent_at: null as string | null,
      whatsapp_message_id: null as string | null,
    }));
}

function getPaymentMethod(row: any): PaymentMethod | null {
  return row.payment_method === 'cash' || row.payment_method === 'upi' || row.payment_method === 'card' ? row.payment_method : null;
}

export function createBrowserApi() {
  const getState = () => loadState();
  const setState = (updater: (state: BrowserState) => BrowserState) => {
    const next = updater(loadState());
    saveState(next);
    return next;
  };
  const persistSplit = (payload: any) => {
    setState((state) => {
      const existingSplit = state.splits.find((split) => split.id === payload.split_id);
      const calculatedRows = calculateSplit({ bill: payload.bill, split: { tax_rate: payload.tax_rate }, rows: payload.rows }).rows;
      const splits = state.splits.map((split) =>
        split.id === payload.split_id
          ? {
              ...split,
              reading_date: payload.reading_date ?? split.reading_date,
              tax_rate: payload.tax_rate ?? split.tax_rate,
              status: payload.status ?? split.status,
              rows: clone(
                calculatedRows.map((row) => {
                  const existingRow = existingSplit?.rows.find((item: any) => item.tenant_id === row.tenant_id);
                  const rowId = existingRow?.id ?? tenantBillRowId(payload.split_id, row.tenant_id);
                  return {
                    ...row,
                    id: rowId,
                    payment_status: existingRow?.payment_status ?? 'pending',
                    payment_method: getPaymentMethod(existingRow),
                    payment_date: existingRow?.payment_date ?? null,
                  };
                }),
              ),
            }
          : split,
      );
      return { ...state, splits };
    });
  };

  return {
    auth: {
      async getSession() {
        const state = getState();
        return getCurrentUser(state);
      },
      async login(email: string, password: string) {
        const state = getState();
        const user = state.users.find((item) => item.email.toLowerCase() === email.toLowerCase());
        if (!user || user.password !== password) {
          return { ok: false as const, message: 'Invalid credentials' };
        }

        state.sessionUserId = user.id;
        saveState(state);

        const { password: _password, ...sessionUser } = user;
        return { ok: true as const, user: sessionUser };
      },
      async logout() {
        setState((state) => ({ ...state, sessionUserId: null }));
      },
      async changePassword(userId: number, password: string) {
        setState((state) => ({
          ...state,
          users: state.users.map((user) =>
            user.id === userId ? { ...user, password, must_change_password: false } : user,
          ),
        }));
      },
    },
    tenants: {
      async list() {
        return clone(getState().tenants);
      },
      async active() {
        return clone(getState().tenants.filter((tenant) => tenant.active));
      },
      async delete(tenantId: number) {
        setState((state) => ({
          ...state,
          tenants: state.tenants.map((tenant) =>
            tenant.id === tenantId ? { ...tenant, active: 0 } : tenant,
          ),
        }));
        return { ok: true };
      },
      async getBills(tenantId: number): Promise<TenantBillHistory> {
        const state = getState();
        const tenant = state.tenants.find((item) => item.id === tenantId) ?? null;
        const bills: TenantBillHistoryRow[] = [];

        for (const split of state.splits) {
          const bill = state.bills.find((item) => item.id === split.bill_id);
          if (!bill) continue;
          const row = split.rows.find((item: any) => item.tenant_id === tenantId);
          if (!row) continue;

          bills.push({
            id: row.id ?? tenantBillRowId(split.id, tenantId),
            bill_split_id: split.id,
            tenant_id: tenantId,
            tenant_name: tenant?.name ?? row.tenant_name ?? '',
            room_no: tenant?.room_no ?? row.room_no ?? '',
            phone: tenant?.phone ?? row.phone ?? null,
            previous_reading: row.previous_reading ?? tenant?.present_reading ?? 0,
            present_reading: row.present_reading ?? tenant?.present_reading ?? 0,
            consumed_unit: row.consumed_unit ?? Math.max(0, (row.present_reading ?? 0) - (row.previous_reading ?? 0)),
            fixed_charge_calc: row.fixed_charge_calc ?? 0,
            fixed_adjust: row.fixed_adjust ?? 0,
            energy_charge: row.energy_charge ?? 0,
            extra_charge_calc: row.extra_charge_calc ?? 0,
            extra_adjust: row.extra_adjust ?? 0,
            tax: row.tax ?? 0,
            sub_total: row.sub_total ?? 0,
            interest_charge_calc: row.interest_charge_calc ?? 0,
            interest_adjust: row.interest_adjust ?? 0,
            other_charge_calc: row.other_charge_calc ?? 0,
            payment_status: row.payment_status ?? 'pending',
            payment_method: getPaymentMethod(row),
            payment_date: row.payment_date ?? null,
            payable: row.payable ?? 0,
            whatsapp_sent_at: row.whatsapp_sent_at ?? null,
            whatsapp_message_id: row.whatsapp_message_id ?? null,
            period_month: bill.period_month,
            period_year: bill.period_year,
            reading_date: split.reading_date,
            bill_total: bill.total,
            split_status: split.status,
          });
        }

        bills.sort((a, b) => (b.period_year - a.period_year) || (b.period_month - a.period_month) || (b.bill_split_id - a.bill_split_id));
        return { tenant, bills };
      },
      async getManagementBills(tenantId: number): Promise<ManagementTenantBillRow[]> {
        const state = getState();
        const tenant = state.tenants.find((item) => item.id === tenantId) ?? null;
        const rows: ManagementTenantBillRow[] = [];
        for (const batch of state.managementBatches) {
          for (const row of batch.rows ?? []) {
            if (row.tenant_id !== tenantId) continue;
            rows.push({
              id: row.id ?? managementBillRowId(batch.id, tenantId),
              batch_id: batch.id,
              tenant_id: tenantId,
              tenant_name: tenant?.name ?? row.tenant_name ?? '',
              room_no: tenant?.room_no ?? row.room_no ?? '',
              phone: tenant?.phone ?? row.phone ?? null,
              maintenance_fees: row.maintenance_fees ?? tenant?.maintenance_fees ?? 0,
              generator_fees: row.generator_fees ?? tenant?.generator_fees ?? 0,
              total: row.total ?? (row.maintenance_fees ?? 0) + (row.generator_fees ?? 0),
              payment_status: row.payment_status ?? 'pending',
              payment_method: getPaymentMethod(row),
              payment_date: row.payment_date ?? null,
              whatsapp_sent_at: row.whatsapp_sent_at ?? null,
              whatsapp_message_id: row.whatsapp_message_id ?? null,
              period_month: batch.period_month,
              period_year: batch.period_year,
            });
          }
        }
        return clone(rows.sort((a, b) => (b.period_year - a.period_year) || (b.period_month - a.period_month) || (b.batch_id - a.batch_id)));
      },
      async updateBillPayment(
        tenantBillId: number,
        paymentStatus: PaymentStatus,
        paymentMethod: PaymentMethod | null,
        paymentDate: string | null,
      ) {
        setState((state) => {
          const splits = state.splits.map((split) => ({
            ...split,
            rows: split.rows.map((row: any) =>
              (row.id ?? tenantBillRowId(split.id, row.tenant_id)) === tenantBillId
                ? {
                    ...row,
                    id: row.id ?? tenantBillRowId(split.id, row.tenant_id),
                    payment_status: paymentStatus,
                    payment_method: paymentStatus === 'paid' ? paymentMethod : null,
                    payment_date: paymentStatus === 'paid' ? paymentDate : null,
                  }
                : row,
            ),
          }));
          return { ...state, splits };
        });
        return { ok: true };
      },
      async save(tenant: Partial<Tenant>) {
        setState((state) => {
          const tenants = [...state.tenants];
          const existingIndex = tenant.id ? tenants.findIndex((item) => item.id === tenant.id) : -1;
          if (existingIndex >= 0) {
            const existing = tenants[existingIndex] as Tenant;
            tenants[existingIndex] = {
              ...existing,
              ...tenant,
              room_no: tenant.room_no ?? existing.room_no,
              name: tenant.name ?? existing.name,
              phone: tenant.phone === undefined ? existing.phone : tenant.phone,
              email: tenant.email === undefined ? existing.email : tenant.email,
              present_reading: tenant.present_reading ?? existing.present_reading,
              maintenance_fees: tenant.maintenance_fees ?? existing.maintenance_fees,
              generator_fees: tenant.generator_fees ?? existing.generator_fees,
              active: tenant.active ?? existing.active,
            };
          } else {
            tenants.push({
              id: nextId(tenants),
              room_no: tenant.room_no ?? '',
              name: tenant.name ?? '',
              phone: tenant.phone ?? null,
              email: tenant.email ?? null,
              present_reading: tenant.present_reading ?? 0,
              maintenance_fees: tenant.maintenance_fees ?? 0,
              generator_fees: tenant.generator_fees ?? 0,
              active: tenant.active ?? 1,
            });
          }
          return { ...state, tenants };
        });
      },
    },
    management: {
      async listBatches(): Promise<ManagementBatchSummary[]> {
        const state = getState();
        return clone(
          state.managementBatches
            .map((batch) => ({
              ...batch,
              tenant_count: batch.rows.length,
              total_to_collect: batch.rows.reduce((sum, row: any) => sum + (row.total ?? 0), 0),
              total_collected: batch.rows
                .filter((row: any) => row.payment_status === 'paid')
                .reduce((sum, row: any) => sum + (row.total ?? 0), 0),
            }))
            .sort((a, b) => (b.period_year - a.period_year) || (b.period_month - a.period_month) || (b.id - a.id)),
        );
      },
      async createBatch(period: { period_month: number; period_year: number }) {
        let createdId = 0;
        setState((state) => {
          const existing = state.managementBatches.find(
            (batch) => batch.period_month === period.period_month && batch.period_year === period.period_year,
          );
          if (existing) {
            throw new Error(`A management batch already exists for ${period.period_month}/${period.period_year}. Please open the existing batch instead.`);
          }

          const batch: StoredManagementBatch = {
            id: nextId(state.managementBatches),
            period_month: period.period_month,
            period_year: period.period_year,
            status: 'created',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            rows: seedManagementRows(state.tenants),
          };
          createdId = batch.id;
          return { ...state, managementBatches: [...state.managementBatches, batch] };
        });
        return { batchId: createdId };
      },
      async rescanBatch(batchId: number) {
        const result = {
          added: 0,
          updated: 0,
          deleted: 0,
          skippedPaid: 0,
        };

        setState((state) => {
          const batch = state.managementBatches.find((item) => item.id === batchId);
          if (!batch) {
            throw new Error('Batch not found');
          }

          const currentTenants = state.tenants
            .filter((tenant) => tenant.active && ((tenant.maintenance_fees ?? 0) > 0 || (tenant.generator_fees ?? 0) > 0))
            .sort((a, b) => (a.room_no || '').localeCompare(b.room_no || '') || a.name.localeCompare(b.name));
          const existingRows = batch.rows ?? [];
          const existingByTenantId = new Map(existingRows.map((row: any) => [row.tenant_id, row]));
          const currentTenantIds = new Set(currentTenants.map((tenant) => tenant.id));
          const nextRows: any[] = [];

          for (const tenant of currentTenants) {
            const existing = existingByTenantId.get(tenant.id);
            const maintenanceFees = Number(tenant.maintenance_fees ?? 0);
            const generatorFees = Number(tenant.generator_fees ?? 0);
            const total = maintenanceFees + generatorFees;

            if (existing) {
              const rowId = existing.id ?? managementBillRowId(batch.id, tenant.id);
              if (existing.payment_status === 'paid') {
                result.skippedPaid += 1;
                nextRows.push({
                  ...existing,
                  id: rowId,
                  maintenance_fees: existing.maintenance_fees ?? maintenanceFees,
                  generator_fees: existing.generator_fees ?? generatorFees,
                  total: existing.total ?? total,
                });
                continue;
              }

              if (
                Number(existing.maintenance_fees ?? 0) !== maintenanceFees ||
                Number(existing.generator_fees ?? 0) !== generatorFees ||
                Number(existing.total ?? 0) !== total
              ) {
                result.updated += 1;
              }

              nextRows.push({
                ...existing,
                id: rowId,
                maintenance_fees: maintenanceFees,
                generator_fees: generatorFees,
                total,
              });
              continue;
            }

            result.added += 1;
            nextRows.push({
              id: managementBillRowId(batch.id, tenant.id),
              tenant_id: tenant.id,
              tenant_name: tenant.name,
              room_no: tenant.room_no,
              phone: tenant.phone,
              maintenance_fees: maintenanceFees,
              generator_fees: generatorFees,
              total,
              payment_status: 'pending' as PaymentStatus,
              payment_method: null as PaymentMethod | null,
              payment_date: null as string | null,
              whatsapp_sent_at: null as string | null,
              whatsapp_message_id: null as string | null,
            });
          }

          for (const row of existingRows) {
            if (currentTenantIds.has(row.tenant_id)) continue;
            if (row.payment_status === 'paid') {
              result.skippedPaid += 1;
              nextRows.push({
                ...row,
                id: row.id ?? managementBillRowId(batch.id, row.tenant_id),
              });
              continue;
            }

            result.deleted += 1;
          }

          nextRows.sort((a, b) => {
            const leftTenant = state.tenants.find((tenant) => tenant.id === a.tenant_id);
            const rightTenant = state.tenants.find((tenant) => tenant.id === b.tenant_id);
            return (
              (leftTenant?.room_no ?? a.room_no ?? '').localeCompare(rightTenant?.room_no ?? b.room_no ?? '') ||
              (leftTenant?.name ?? a.tenant_name ?? '').localeCompare(rightTenant?.name ?? b.tenant_name ?? '') ||
              a.tenant_id - b.tenant_id
            );
          });

          return {
            ...state,
            managementBatches: state.managementBatches.map((item) =>
              item.id === batchId ? { ...item, updated_at: new Date().toISOString(), rows: nextRows } : item,
            ),
          };
        });

        return { ok: true as const, ...result };
      },
      async getBatch(batchId: number): Promise<ManagementBatchDetail | null> {
        const state = getState();
        const batch = state.managementBatches.find((item) => item.id === batchId);
        if (!batch) return null;

        return clone({
          batch: {
            id: batch.id,
            period_month: batch.period_month,
            period_year: batch.period_year,
            status: batch.status,
            created_at: batch.created_at,
            updated_at: batch.updated_at,
          },
          rows: batch.rows
            .map((row: any) => {
              const tenant = state.tenants.find((item) => item.id === row.tenant_id);
              if (!tenant) return null;
              return {
                id: row.id ?? managementBillRowId(batch.id, row.tenant_id),
                batch_id: batch.id,
                tenant_id: row.tenant_id,
                tenant_name: tenant.name,
                room_no: tenant.room_no,
                phone: tenant.phone,
                maintenance_fees: row.maintenance_fees ?? tenant.maintenance_fees ?? 0,
                generator_fees: row.generator_fees ?? tenant.generator_fees ?? 0,
                total: row.total ?? (row.maintenance_fees ?? 0) + (row.generator_fees ?? 0),
                payment_status: row.payment_status ?? 'pending',
                payment_method: getPaymentMethod(row),
                payment_date: row.payment_date ?? null,
                whatsapp_sent_at: row.whatsapp_sent_at ?? null,
                whatsapp_message_id: row.whatsapp_message_id ?? null,
                period_month: batch.period_month,
                period_year: batch.period_year,
              };
            })
            .filter((item): item is ManagementTenantBillRow => Boolean(item)),
        });
      },
      async updateBillPayment(
        managementBillId: number,
        paymentStatus: PaymentStatus,
        paymentMethod: PaymentMethod | null,
        paymentDate: string | null,
      ) {
        setState((state) => ({
          ...state,
          managementBatches: state.managementBatches.map((batch) => ({
            ...batch,
            rows: batch.rows.map((row: any) =>
              (row.id ?? managementBillRowId(batch.id, row.tenant_id)) === managementBillId
                ? {
                    ...row,
                    id: row.id ?? managementBillRowId(batch.id, row.tenant_id),
                    payment_status: paymentStatus,
                    payment_method: paymentStatus === 'paid' ? paymentMethod : null,
                    payment_date: paymentStatus === 'paid' ? paymentDate : null,
                  }
                : row,
            ),
          })),
        }));
        return { ok: true };
      },
      async downloadAll(batchId: number) {
        const state = getState();
        const batch = state.managementBatches.find((item) => item.id === batchId);
        if (!batch) {
          throw new Error('Batch not found');
        }

        const picker = (window as any).showDirectoryPicker;
        if (typeof picker !== 'function') {
          throw new Error('Folder downloads are only available in Chromium-based browsers.');
        }

        const root = await picker.call(window, { mode: 'readwrite', startIn: 'downloads' });
        const folder = await root.getDirectoryHandle(getManagementBillFolderName(batch), { create: true });
        for (const row of batch.rows ?? []) {
          const tenant = state.tenants.find((item) => item.id === row.tenant_id);
          if (!tenant) continue;
          const pdfBytes = await buildManagementBillPdfBytes({
            settings: state.settings,
            batch: {
              id: batch.id,
              period_month: batch.period_month,
              period_year: batch.period_year,
              status: batch.status,
              created_at: batch.created_at,
              updated_at: batch.updated_at,
            },
            row: {
              id: row.id ?? managementBillRowId(batch.id, row.tenant_id),
              batch_id: batch.id,
              tenant_id: row.tenant_id,
              tenant_name: tenant.name,
              room_no: tenant.room_no,
              phone: tenant.phone,
              maintenance_fees: row.maintenance_fees ?? tenant.maintenance_fees ?? 0,
              generator_fees: row.generator_fees ?? tenant.generator_fees ?? 0,
              total: row.total ?? (row.maintenance_fees ?? 0) + (row.generator_fees ?? 0),
              payment_status: row.payment_status ?? 'pending',
              payment_method: getPaymentMethod(row),
              payment_date: row.payment_date ?? null,
              whatsapp_sent_at: row.whatsapp_sent_at ?? null,
              whatsapp_message_id: row.whatsapp_message_id ?? null,
              period_month: batch.period_month,
              period_year: batch.period_year,
            },
          });
          const fileHandle = await folder.getFileHandle(getManagementBillFileName(batch.id, row), { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(pdfBytes);
          await writable.close();
        }

        return { ok: true as const, folderPath: `${root.name}/${getManagementBillFolderName(batch)}`, fileCount: (batch.rows ?? []).length };
      },
      async sendAll(batchId: number) {
        const state = getState();
        const batch = state.managementBatches.find((item) => item.id === batchId);
        if (!batch) {
          throw new Error('Batch not found');
        }

        if (!state.settings.whatsapp_phone_number_id || !state.settings.whatsapp_access_token) {
          throw new Error('WhatsApp settings are missing. Please configure the phone number ID and access token first.');
        }

        const results: Array<{ tenant_id: number; ok: boolean; message?: string }> = [];
        for (const row of batch.rows) {
          const tenant = state.tenants.find((item) => item.id === row.tenant_id);
          const currentPhone = tenant?.phone ?? row.phone;
          const currentTenantName = tenant?.name ?? row.tenant_name;
          const currentRoom = tenant?.room_no ?? row.room_no;

          if (!currentPhone) {
            results.push({ tenant_id: row.tenant_id, ok: false, message: 'Phone number missing' });
            continue;
          }

          try {
            const pdfBytes = await buildManagementBillPdfBytes({
              settings: state.settings,
              batch: {
                id: batch.id,
                period_month: batch.period_month,
                period_year: batch.period_year,
                status: batch.status,
                created_at: batch.created_at,
                updated_at: batch.updated_at,
              },
              row: {
                id: row.id ?? managementBillRowId(batch.id, row.tenant_id),
                batch_id: batch.id,
                tenant_id: row.tenant_id,
                tenant_name: currentTenantName,
                room_no: currentRoom,
                phone: currentPhone,
                maintenance_fees: row.maintenance_fees ?? 0,
                generator_fees: row.generator_fees ?? 0,
                total: row.total ?? (row.maintenance_fees ?? 0) + (row.generator_fees ?? 0),
                payment_status: row.payment_status ?? 'pending',
                payment_method: getPaymentMethod(row),
                payment_date: row.payment_date ?? null,
                whatsapp_sent_at: row.whatsapp_sent_at ?? null,
                whatsapp_message_id: row.whatsapp_message_id ?? null,
                period_month: batch.period_month,
                period_year: batch.period_year,
              },
            });
            const media = await uploadWhatsAppMedia({
              phoneNumberId: state.settings.whatsapp_phone_number_id,
              accessToken: state.settings.whatsapp_access_token,
              fileBytes: pdfBytes,
              fileName: getManagementBillFileName(batch.id, row),
            });
            const sent = await sendWhatsAppTemplateWithMedia({
              phoneNumberId: state.settings.whatsapp_phone_number_id,
              accessToken: state.settings.whatsapp_access_token,
              templateName: state.settings.whatsapp_management_bill_template || 'management_bill',
              language: state.settings.whatsapp_template_language || 'en',
              to: currentPhone,
              bodyParams: [
                currentTenantName,
                getManagementBillPeriodLabel(batch),
                getManagementBillNumber(
                  {
                    id: batch.id,
                    period_month: batch.period_month,
                    period_year: batch.period_year,
                    status: batch.status,
                    created_at: batch.created_at,
                    updated_at: batch.updated_at,
                  },
                  {
                    id: row.id ?? managementBillRowId(batch.id, row.tenant_id),
                    batch_id: batch.id,
                    tenant_id: row.tenant_id,
                    tenant_name: currentTenantName,
                    room_no: currentRoom,
                    phone: currentPhone,
                    maintenance_fees: row.maintenance_fees ?? 0,
                    generator_fees: row.generator_fees ?? 0,
                    total: row.total ?? (row.maintenance_fees ?? 0) + (row.generator_fees ?? 0),
                    payment_status: row.payment_status ?? 'pending',
                    payment_method: getPaymentMethod(row),
                    payment_date: row.payment_date ?? null,
                    whatsapp_sent_at: row.whatsapp_sent_at ?? null,
                    whatsapp_message_id: row.whatsapp_message_id ?? null,
                    period_month: batch.period_month,
                    period_year: batch.period_year,
                  },
                ),
                currentRoom,
                String(row.total ?? 0),
              ],
              mediaId: media.mediaId,
            });
            results.push({ tenant_id: row.tenant_id, ok: true });
            setState((current) => ({
              ...current,
              managementBatches: current.managementBatches.map((item) =>
                item.id === batchId
                  ? {
                      ...item,
                      status: 'sent',
                      rows: item.rows.map((existingRow: any) =>
                        (existingRow.id ?? managementBillRowId(item.id, existingRow.tenant_id)) ===
                        (row.id ?? managementBillRowId(batch.id, row.tenant_id))
                          ? {
                              ...existingRow,
                              whatsapp_sent_at: new Date().toISOString(),
                              whatsapp_message_id: sent.messageId,
                            }
                          : existingRow,
                      ),
                    }
                  : item,
              ),
            }));
          } catch (error: any) {
            results.push({ tenant_id: row.tenant_id, ok: false, message: error?.message ?? 'Failed' });
          }
        }

        return { ok: results.some((item) => item.ok), results };
      },
      async sendReminder(managementBillId: number) {
        const state = getState();
        const batch = state.managementBatches.find((item) => item.rows.some((row: any) => (row.id ?? managementBillRowId(item.id, row.tenant_id)) === managementBillId));
        if (!batch) {
          return { ok: false, messageId: 'browser://management-reminder' };
        }
        const row = batch.rows.find((item: any) => (item.id ?? managementBillRowId(batch.id, item.tenant_id)) === managementBillId);
        if (!row) {
          return { ok: false, messageId: 'browser://management-reminder' };
        }
        const tenant = state.tenants.find((item) => item.id === row.tenant_id);
        const phone = tenant?.phone ?? row.phone;
        if (!phone) {
          return { ok: false, messageId: 'browser://management-reminder' };
        }

        await sendWhatsAppReminderTemplate({
          phoneNumberId: state.settings.whatsapp_phone_number_id,
          accessToken: state.settings.whatsapp_access_token,
          templateName: state.settings.whatsapp_management_reminder_template || 'management_reminder',
          language: state.settings.whatsapp_template_language || 'en',
          to: phone,
          bodyParams: [tenant?.name ?? row.tenant_name, getManagementBillPeriodLabel(batch), String(row.total ?? 0)],
        }).catch(() => undefined);

        return { ok: true, messageId: 'browser://management-reminder' };
      },
    },
    payments: {
      async list() {
        const state = getState();
        const entries: PaymentLedgerEntry[] = [];
        for (const split of state.splits) {
          const bill = state.bills.find((item) => item.id === split.bill_id);
          if (!bill) continue;
          for (const row of split.rows) {
            if (row.payment_status !== 'paid') continue;
            const tenant = state.tenants.find((item) => item.id === row.tenant_id);
            entries.push({
              paid_for: 'electricity',
              source_id: row.id ?? tenantBillRowId(split.id, row.tenant_id),
              tenant_id: row.tenant_id,
              tenant_name: tenant?.name ?? row.tenant_name ?? '',
              room_no: tenant?.room_no ?? row.room_no ?? '',
              paid_date: row.payment_date ?? split.reading_date,
              paid_amount: row.payable ?? 0,
              paid_method: getPaymentMethod(row) ?? 'cash',
              period_month: bill.period_month,
              period_year: bill.period_year,
            });
          }
        }
        for (const batch of state.managementBatches) {
          for (const row of batch.rows) {
            if (row.payment_status !== 'paid') continue;
            const tenant = state.tenants.find((item) => item.id === row.tenant_id);
            entries.push({
              paid_for: 'management',
              source_id: row.id ?? managementBillRowId(batch.id, row.tenant_id),
              tenant_id: row.tenant_id,
              tenant_name: tenant?.name ?? row.tenant_name ?? '',
              room_no: tenant?.room_no ?? row.room_no ?? '',
              paid_date: row.payment_date ?? batch.created_at,
              paid_amount: row.total ?? 0,
              paid_method: getPaymentMethod(row) ?? 'cash',
              period_month: batch.period_month,
              period_year: batch.period_year,
            });
          }
        }

        return clone(entries.sort((a, b) => String(b.paid_date).localeCompare(String(a.paid_date))));
      },
    },
    bills: {
      async list() {
        const state = getState();
        return clone(
          state.bills.map((bill) => {
            const split = state.splits.find((item) => item.bill_id === bill.id);
            const splitRows = split?.rows ?? [];
            return {
              ...bill,
              split_status: split?.status ?? null,
              tenant_count: splitRows.length,
              pending_count: splitRows.filter((row: any) => row.payment_status !== 'paid').length,
            };
          }),
        );
      },
      async create(bill: Omit<Bill, 'id'>) {
        return this.save(bill as Partial<Bill>);
      },
      async save(bill: Partial<Bill>) {
        setState((state) => {
          const bills = [...state.bills];
          const fixedCharge = bill.fixed_charge ?? (bill.fixed_unit ?? 0) * (bill.fixed_unit_price ?? 0);
          const energyCharge = bill.energy_charge ?? (bill.energy_unit ?? 0) * (bill.energy_unit_price ?? 0);
          const taxAmount = bill.tax ?? (fixedCharge + energyCharge + (bill.extra_charge ?? 0)) * ((bill.tax_percent ?? 0) / 100);
          const total =
            bill.total ??
            fixedCharge + energyCharge + (bill.extra_charge ?? 0) + taxAmount + (bill.interest_charge ?? 0) + (bill.other_charge ?? 0);
          const payload = {
            period_month: bill.period_month ?? new Date().getMonth() + 1,
            period_year: bill.period_year ?? new Date().getFullYear(),
            fixed_unit: bill.fixed_unit ?? 0,
            fixed_unit_price: bill.fixed_unit_price ?? 0,
            fixed_charge: fixedCharge,
            energy_unit: bill.energy_unit ?? 0,
            energy_unit_price: bill.energy_unit_price ?? 0,
            energy_charge: energyCharge,
            extra_charge: bill.extra_charge ?? 0,
            tax: taxAmount,
            tax_percent: bill.tax_percent ?? 0,
            interest_charge: bill.interest_charge ?? 0,
            other_charge: bill.other_charge ?? 0,
            total,
          };

          const existingIndex = bill.id ? bills.findIndex((item) => item.id === bill.id) : -1;
          const duplicate = bills.find(
            (item) =>
              item.period_month === payload.period_month &&
              item.period_year === payload.period_year &&
              item.id !== bill.id,
          );
          if (duplicate) {
            throw new Error(`A bill already exists for ${payload.period_month}/${payload.period_year}. Please edit the existing bill instead.`);
          }

          if (existingIndex >= 0) {
            bills[existingIndex] = { ...(bills[existingIndex] as Bill), ...payload };
          } else {
            bills.push({
              id: nextId(bills),
              ...payload,
            });
          }
          return { ...state, bills };
        });
      },
      async get(id: number) {
        return clone(getState().bills.find((bill) => bill.id === id) ?? null);
      },
      async getOrCreateSplit(billId: number) {
        let created: BillSplit | null = null;
        setState((state) => {
          const existing = state.splits.find((split) => split.bill_id === billId);
          if (existing) {
            created = existing;
            return state;
          }

          const split: StoredSplit = {
            id: nextId(state.splits),
            bill_id: billId,
            reading_date: new Date().toISOString().slice(0, 10),
            tax_rate: 0,
            status: 'draft',
            rows: seedSplitRows(state.tenants.filter((tenant) => tenant.active)),
          };
          created = split;
          return { ...state, splits: [...state.splits, split] };
        });

        return created;
      },
    },
    splits: {
      async calculate(input: any) {
        return calculateSplit(input);
      },
      async get(splitId: number) {
        const split = getState().splits.find((item) => item.id === splitId);
        return clone(split ?? null);
      },
      async save(payload: any) {
        persistSplit(payload);
      },
      async saveDraft(payload: any) {
        persistSplit(payload);
      },
      async downloadAll(splitId: number) {
        const state = getState();
        const split = state.splits.find((item) => item.id === splitId);
        if (!split) {
          throw new Error('Split not found');
        }

        const bill = state.bills.find((item) => item.id === split.bill_id);
        if (!bill) {
          throw new Error('Bill not found');
        }

        const picker = (window as any).showDirectoryPicker;
        if (typeof picker !== 'function') {
          throw new Error('Folder downloads are only available in Chromium-based browsers.');
        }

        const root = await picker.call(window, { mode: 'readwrite', startIn: 'downloads' });
        const folder = await root.getDirectoryHandle(getTenantBillFolderName(bill), { create: true });
        for (const row of split.rows ?? []) {
          const pdfBytes = await buildTenantBillPdfBytes({
            settings: state.settings,
            bill: {
              period_month: bill.period_month,
              period_year: bill.period_year,
              fixed_unit: bill.fixed_unit,
              fixed_unit_price: bill.fixed_unit_price,
              energy_unit_price: bill.energy_unit_price,
              tax_percent: bill.tax_percent,
            },
            split: {
              id: split.id,
              reading_date: split.reading_date,
            },
            row,
          });
          const fileHandle = await folder.getFileHandle(getTenantBillFileName(split.id, row), { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(pdfBytes);
          await writable.close();
        }

        return { ok: true as const, folderPath: `${root.name}/${getTenantBillFolderName(bill)}`, fileCount: (split.rows ?? []).length };
      },
    },
    users: {
      async list() {
        const state = getState();
        return state.users.map(({ password: _password, ...user }) => user);
      },
      async save(user: any) {
        setState((state) => {
          const users = [...state.users];
          if (user.id) {
            const index = users.findIndex((item) => item.id === user.id);
            if (index >= 0) {
              users[index] = {
                ...users[index],
                ...user,
                password: user.password ?? users[index].password,
              };
            }
          } else {
            users.push({
              id: nextId(users),
              name: user.name ?? '',
              email: user.email ?? '',
              role: user.role ?? 'staff',
              must_change_password: Boolean(user.must_change_password),
              password: user.password ?? 'qwertyuiop',
            });
          }
          return { ...state, users };
        });
      },
      async delete(userId: number) {
        setState((state) => {
          if (state.sessionUserId === userId) {
            throw new Error('You cannot delete your own account');
          }

          const target = state.users.find((user) => user.id === userId);
          if (!target) {
            throw new Error('User not found');
          }
          if (target.role === 'admin') {
            const remainingAdmins = state.users.filter((user) => user.role === 'admin' && user.id !== userId);
            if (remainingAdmins.length === 0) {
              throw new Error('At least one admin must remain');
            }
          }

          return {
            ...state,
            users: state.users.filter((user) => user.id !== userId),
          };
        });
        return true;
      },
      async resetPassword(userId: number, password: string) {
        setState((state) => ({
          ...state,
          users: state.users.map((user) => (user.id === userId ? { ...user, password, must_change_password: true } : user)),
        }));
      },
    },
    whatsapp: {
      async previewPdf() {
        return 'browser://preview';
      },
      async sendAll(splitId?: number) {
        if (!splitId) {
          return { ok: true };
        }

        const state = getState();
        const split = state.splits.find((item) => item.id === splitId);
        if (!split) {
          throw new Error('Split not found');
        }

        const bill = state.bills.find((item) => item.id === split.bill_id);
        if (!bill) {
          throw new Error('Bill not found');
        }

        if (!state.settings.whatsapp_phone_number_id || !state.settings.whatsapp_access_token) {
          throw new Error('WhatsApp settings are missing. Please configure the phone number ID and access token first.');
        }

        const results: Array<{ tenant_id: number; ok: boolean; message?: string }> = [];
        for (const row of split.rows) {
          const tenant = state.tenants.find((item) => item.id === row.tenant_id);
          const currentPhone = tenant?.phone ?? row.phone;
          const currentTenantName = tenant?.name ?? row.tenant_name;
          const currentRoom = tenant?.room_no ?? row.room_no;

          if (!currentPhone) {
            results.push({ tenant_id: row.tenant_id, ok: false, message: 'Phone number missing' });
            continue;
          }
          try {
            const pdfBytes = await buildTenantBillPdfBytes({
              settings: state.settings,
              bill: {
                period_month: bill.period_month,
                period_year: bill.period_year,
                fixed_unit: bill.fixed_unit,
                fixed_unit_price: bill.fixed_unit_price,
                energy_unit_price: bill.energy_unit_price,
                tax_percent: bill.tax_percent,
              },
              split: {
                id: split.id,
                reading_date: split.reading_date,
              },
              row: {
                ...row,
                phone: currentPhone,
                tenant_name: currentTenantName,
                room_no: currentRoom,
              },
            });
            const media = await uploadWhatsAppMedia({
              phoneNumberId: state.settings.whatsapp_phone_number_id,
              accessToken: state.settings.whatsapp_access_token,
              fileBytes: pdfBytes,
              fileName: getTenantBillFileName(split.id, row),
            });
            const sent = await sendWhatsAppTemplateWithMedia({
              phoneNumberId: state.settings.whatsapp_phone_number_id,
              accessToken: state.settings.whatsapp_access_token,
              templateName: state.settings.whatsapp_electricity_bill_template || 'electricity_bill',
              language: state.settings.whatsapp_template_language || 'en',
              to: currentPhone,
              bodyParams: [
                currentTenantName,
                getBillPeriodLabel(bill),
                getTenantBillNumber(split, { ...row, room_no: currentRoom }),
                currentRoom,
                String(row.payable),
                getBillPayDate(split.reading_date),
              ],
              mediaId: media.mediaId,
            });
            results.push({ tenant_id: row.tenant_id, ok: true });
            setState((current) => ({
              ...current,
              splits: current.splits.map((item) =>
                item.id === splitId
                  ? {
                      ...item,
                      status: 'sent',
                      rows: item.rows.map((existingRow: any) =>
                        (existingRow.id ?? tenantBillRowId(item.id, existingRow.tenant_id)) === (row.id ?? tenantBillRowId(split.id, row.tenant_id))
                          ? {
                              ...existingRow,
                              whatsapp_sent_at: new Date().toISOString(),
                              whatsapp_message_id: sent.messageId,
                            }
                          : existingRow,
                      ),
                    }
                  : item,
              ),
            }));
          } catch (error: any) {
            results.push({ tenant_id: row.tenant_id, ok: false, message: error?.message ?? 'Failed' });
          }
        }

        return { ok: results.some((item) => item.ok), results };
      },
      async sendReminder(tenantBillId?: number) {
        if (!tenantBillId) {
          return { ok: false, messageId: 'browser://reminder' };
        }

        const state = getState();
        for (const split of state.splits) {
          const bill = state.bills.find((item) => item.id === split.bill_id);
          const row = split.rows.find((item: any) => (item.id ?? tenantBillRowId(split.id, item.tenant_id)) === tenantBillId);
          if (!row) continue;
          const tenant = state.tenants.find((item) => item.id === row.tenant_id);
          const phone = tenant?.phone ?? row.phone;
          if (!phone) {
            return { ok: false, messageId: 'browser://reminder' };
          }

          await sendWhatsAppReminderTemplate({
            phoneNumberId: state.settings.whatsapp_phone_number_id,
            accessToken: state.settings.whatsapp_access_token,
            templateName: state.settings.whatsapp_electricity_reminder_template || 'electricity_reminder',
            language: state.settings.whatsapp_template_language || 'en',
            to: phone,
            bodyParams: [
              tenant?.name ?? row.tenant_name,
              bill ? getBillPeriodLabel(bill) : `${split.reading_date.slice(0, 7)}`,
              String(row.payable ?? 0),
            ],
          }).catch(() => undefined);

          return { ok: true, messageId: 'browser://reminder' };
        }

        return { ok: false, messageId: 'browser://reminder' };
      },
    },
    settings: {
      async get() {
        return clone(getState().settings);
      },
      async save(settings: AppSettings) {
        setState((state) => ({ ...state, settings: clone(settings) }));
      },
    },
  };
}
