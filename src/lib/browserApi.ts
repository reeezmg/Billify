import { calculateSplit } from './calc';
import type {
  AppSettings,
  Bill,
  BillSplit,
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

type BrowserState = {
  sessionUserId: number | null;
  users: StoredUser[];
  tenants: Tenant[];
  bills: Bill[];
  splits: StoredSplit[];
  settings: AppSettings;
};

const STORAGE_KEY = 'billify.browserState.v1';

const defaultSettings: AppSettings = {
  company_name: 'Billify Building',
  company_address: '',
  whatsapp_phone_number_id: '',
  whatsapp_access_token: '',
  whatsapp_template_name: 'electricity_bill',
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
    return {
      ...clone(defaultState),
      ...parsed,
      settings: {
        ...defaultSettings,
        ...(parsed.settings ?? {}),
      },
      users: parsed.users?.length ? (parsed.users as StoredUser[]) : clone(defaultState.users),
      tenants: parsed.tenants?.length
        ? (parsed.tenants as Tenant[]).map((tenant) => ({
            ...tenant,
            present_reading: tenant.present_reading ?? 0,
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
    payment_status: 'pending' as PaymentStatus,
    payment_method: null as PaymentMethod | null,
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
            tenants[existingIndex] = { ...(tenants[existingIndex] as Tenant), ...(tenant as Tenant) };
          } else {
            tenants.push({
              id: nextId(tenants),
              room_no: tenant.room_no ?? '',
              name: tenant.name ?? '',
              phone: tenant.phone ?? null,
              email: tenant.email ?? null,
              present_reading: tenant.present_reading ?? 0,
              active: tenant.active ?? 1,
            });
          }
          return { ...state, tenants };
        });
      },
    },
    bills: {
      async list() {
        const state = getState();
        return clone(
          state.bills.map((bill) => {
            const split = state.splits.find((item) => item.bill_id === bill.id);
            return {
              ...bill,
              split_status: split?.status ?? null,
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
              password: user.password ?? 'ChangeMe123!',
            });
          }
          return { ...state, users };
        });
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
        if (splitId) {
          setState((state) => ({
            ...state,
            splits: state.splits.map((split) => (split.id === splitId ? { ...split, status: 'sent' } : split)),
          }));
        }
        return { ok: true };
      },
      async sendReminder(tenantBillId?: number) {
        return { ok: Boolean(tenantBillId), messageId: 'browser://reminder' };
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
