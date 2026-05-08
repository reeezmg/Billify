export type Role = 'admin' | 'staff';

export type UserRecord = {
  id: number;
  name: string;
  email: string;
  role: Role;
  must_change_password: number;
};

export type TenantRecord = {
  id: number;
  room_no: string;
  name: string;
  phone: string | null;
  email: string | null;
  present_reading: number;
  active: number;
};

export type PaymentStatus = 'pending' | 'paid';
export type PaymentMethod = 'cash' | 'upi' | 'card';

export type BillRecord = {
  id: number;
  period_month: number;
  period_year: number;
  fixed_unit: number;
  fixed_unit_price: number;
  fixed_charge: number;
  energy_unit: number;
  energy_unit_price: number;
  energy_charge: number;
  extra_charge: number;
  tax: number;
  tax_percent: number;
  interest_charge: number;
  other_charge: number;
  total: number;
  split_status?: 'draft' | 'finalized' | 'sent' | null;
};

export type BillSplitRecord = {
  id: number;
  bill_id: number;
  reading_date: string;
  tax_rate: number;
  status: 'draft' | 'finalized' | 'sent';
};

export type TenantBillRecord = {
  id: number;
  bill_split_id: number;
  tenant_id: number;
  previous_reading: number;
  present_reading: number;
  consumed_unit: number;
  fixed_charge_calc: number;
  fixed_adjust: number;
  energy_charge: number;
  extra_charge_calc: number;
  extra_adjust: number;
  tax: number;
  sub_total: number;
  interest_charge_calc: number;
  interest_adjust: number;
  other_charge_calc: number;
  payment_status: PaymentStatus;
  payment_method: PaymentMethod | null;
  payment_date: string | null;
  payable: number;
  whatsapp_sent_at: string | null;
  whatsapp_message_id: string | null;
};

export type AppConfigRecord = {
  key: string;
  value: string | null;
};

export type SplitBillRowInput = {
  tenant_id: number;
  previous_reading: number;
  present_reading: number;
  fixed_adjust: number;
  extra_adjust: number;
  interest_adjust: number;
};

export type SplitBillInput = {
  bill: {
    fixed_charge: number;
    energy_charge: number;
    energy_unit_price: number;
    extra_charge: number;
    tax: number;
    interest_charge: number;
    other_charge: number;
  };
  split: {
    tax_rate: number;
  };
  rows: SplitBillRowInput[];
};

export type SplitBillRow = SplitBillRowInput & {
  consumed_unit: number;
  fixed_charge_calc: number;
  energy_charge: number;
  extra_charge_calc: number;
  tax: number;
  sub_total: number;
  interest_charge_calc: number;
  other_charge_calc: number;
  payable: number;
  ratio: number;
};

export type SplitBillResult = {
  rows: SplitBillRow[];
  totals: {
    consumed_unit: number;
    fixed_charge_calc: number;
    energy_charge: number;
    extra_charge_calc: number;
    tax: number;
    sub_total: number;
    interest_charge_calc: number;
    other_charge_calc: number;
    payable: number;
  };
  reconciliation: {
    fixed_diff: number;
    energy_diff: number;
    extra_diff: number;
    tax_diff: number;
    interest_diff: number;
    other_diff: number;
  };
};

export type TenantBillHistoryRecord = TenantBillRecord & {
  tenant_name: string;
  room_no: string;
  phone: string | null;
  period_month: number;
  period_year: number;
  reading_date: string;
  bill_total: number;
  split_status: BillSplitRecord['status'];
};

export type TenantBillHistoryPayload = {
  tenant: TenantRecord | null;
  bills: TenantBillHistoryRecord[];
};
