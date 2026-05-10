export type Role = 'admin' | 'staff';

export type SessionUser = {
  id: number;
  name: string;
  email: string;
  role: Role;
  must_change_password: boolean;
};

export type Tenant = {
  id: number;
  room_no: string;
  name: string;
  phone: string | null;
  email: string | null;
  present_reading: number;
  maintenance_fees: number;
  generator_fees: number;
  active: number;
};

export type PaymentStatus = 'pending' | 'paid';
export type PaymentMethod = 'cash' | 'upi' | 'card';

export type Bill = {
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
  tenant_count?: number;
  pending_count?: number;
};

export type BillSplit = {
  id: number;
  bill_id: number;
  reading_date: string;
  tax_rate: number;
  status: 'draft' | 'finalized' | 'sent';
};

export type TenantBill = {
  id: number;
  bill_split_id: number;
  tenant_id: number;
  previous_reading: number;
  present_reading: number;
  consumed_unit: number;
  fixed_charge_calc: number;
  fixed_adjust: number;
  energy_charge_calc?: number;
  energy_charge: number;
  extra_charge_calc: number;
  extra_adjust: number;
  tax: number;
  sub_total: number;
  interest_charge_calc: number;
  interest_adjust: number;
  other_charge_calc: number;
  other_charge?: number;
  other_adjust?: number;
  payment_status: PaymentStatus;
  payment_method: PaymentMethod | null;
  payment_date: string | null;
  payable: number;
  whatsapp_sent_at: string | null;
  whatsapp_message_id: string | null;
};

export type AppSettings = {
  company_name: string;
  company_address: string;
  whatsapp_phone_number_id: string;
  whatsapp_access_token: string;
  whatsapp_electricity_bill_template: string;
  whatsapp_electricity_reminder_template: string;
  whatsapp_management_bill_template: string;
  whatsapp_management_reminder_template: string;
  whatsapp_template_language: string;
};

export type ManagementBillBatch = {
  id: number;
  period_month: number;
  period_year: number;
  status: 'created' | 'sent';
  created_at: string;
  updated_at: string;
};

export type ManagementBatchSummary = ManagementBillBatch & {
  total_to_collect: number;
  total_collected: number;
  tenant_count: number;
};

export type ManagementTenantBill = {
  id: number;
  batch_id: number;
  tenant_id: number;
  maintenance_fees: number;
  generator_fees: number;
  total: number;
  payment_status: PaymentStatus;
  payment_method: PaymentMethod | null;
  payment_date: string | null;
  whatsapp_sent_at: string | null;
  whatsapp_message_id: string | null;
};

export type ManagementTenantBillRow = ManagementTenantBill & {
  tenant_name: string;
  room_no: string;
  phone: string | null;
  period_month: number;
  period_year: number;
};

export type ManagementBatchDetail = {
  batch: ManagementBillBatch;
  rows: ManagementTenantBillRow[];
};

export type PaymentLedgerEntry = {
  paid_for: 'electricity' | 'management';
  source_id: number;
  tenant_id: number;
  tenant_name: string;
  room_no: string;
  paid_date: string;
  paid_amount: number;
  paid_method: PaymentMethod;
  period_month: number;
  period_year: number;
};

export type TenantBillWithTenant = TenantBill & {
  tenant_name: string;
  room_no: string;
  phone: string | null;
};

export type TenantBillHistoryRow = TenantBillWithTenant & {
  period_month: number;
  period_year: number;
  reading_date: string;
  bill_total: number;
  split_status: BillSplit['status'];
};

export type TenantBillHistory = {
  tenant: Tenant | null;
  bills: TenantBillHistoryRow[];
};
