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

export type AppSettings = {
  company_name: string;
  company_address: string;
  whatsapp_phone_number_id: string;
  whatsapp_access_token: string;
  whatsapp_template_name: string;
  whatsapp_template_language: string;
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
