import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { PaymentUpdateModal, ReminderModal } from '../components/billModals';
import type {
  ManagementTenantBillRow,
  PaymentMethod,
  PaymentStatus,
  TenantBillHistory,
  TenantBillHistoryRow,
} from '../types';

type BillSource = 'electricity' | 'management';

type ReminderState = {
  open: boolean;
  source: BillSource | null;
  row: TenantBillHistoryRow | ManagementTenantBillRow | null;
  sending: boolean;
  error: string | null;
};

type PaymentState = {
  open: boolean;
  source: BillSource | null;
  row: TenantBillHistoryRow | ManagementTenantBillRow | null;
  status: PaymentStatus;
  method: PaymentMethod | '';
  paymentDate: string;
  saving: boolean;
  error: string | null;
};

const todayIso = () => new Date().toISOString().slice(0, 10);

const formatDate = (value: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB');
};

const getPaymentStatusClass = (status: string) =>
  status === 'paid'
    ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/20'
    : 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/20';

const getSplitStatusClass = (status: string) => {
  if (status === 'sent') {
    return 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/20';
  }
  if (status === 'finalized') {
    return 'bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/20';
  }
  return 'bg-slate-500/15 text-slate-200 ring-1 ring-slate-500/20';
};

const getManagementStatusClass = (status: string) => {
  if (status === 'paid') {
    return 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/20';
  }
  return 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/20';
};

export default function TenantBills() {
  const { tenantId } = useParams();
  const [data, setData] = useState<TenantBillHistory | null>(null);
  const [managementBills, setManagementBills] = useState<ManagementTenantBillRow[]>([]);
  const [tab, setTab] = useState<BillSource>('electricity');
  const [reminder, setReminder] = useState<ReminderState>({
    open: false,
    source: null,
    row: null,
    sending: false,
    error: null,
  });
  const [payment, setPayment] = useState<PaymentState>({
    open: false,
    source: null,
    row: null,
    status: 'pending',
    method: '',
    paymentDate: todayIso(),
    saving: false,
    error: null,
  });

  const refresh = async () => {
    if (!tenantId) return;
    const [history, mgmt] = await Promise.all([
      window.api.tenants.getBills(Number(tenantId)),
      window.api.tenants.getManagementBills(Number(tenantId)),
    ]);
    setData(history);
    setManagementBills(mgmt);
  };

  useEffect(() => {
    refresh();
  }, [tenantId]);

  const summary = useMemo(() => {
    const electricity = data?.bills ?? [];
    const management = managementBills;
    const totalPaid = [...electricity, ...management]
      .filter((bill) => bill.payment_status === 'paid')
      .reduce((sum, bill) => sum + ('payable' in bill ? bill.payable : bill.total), 0);
    const totalPending = [...electricity, ...management]
      .filter((bill) => bill.payment_status !== 'paid')
      .reduce((sum, bill) => sum + ('payable' in bill ? bill.payable : bill.total), 0);

    return {
      totalPaid,
      totalPending,
      totalEnergy: electricity.reduce((sum, bill) => sum + bill.consumed_unit, 0),
      presentReading: data?.tenant?.present_reading ?? 0,
    };
  }, [data, managementBills]);

  const openReminder = (source: BillSource, row: TenantBillHistoryRow | ManagementTenantBillRow) => {
    setReminder({ open: true, source, row, sending: false, error: null });
  };

  const closeReminder = () => {
    setReminder({ open: false, source: null, row: null, sending: false, error: null });
  };

  const sendReminder = async () => {
    if (!reminder.row || !reminder.source) return;
    setReminder((prev) => ({ ...prev, sending: true, error: null }));
    try {
      if (reminder.source === 'electricity') {
        await window.api.whatsapp.sendReminder(reminder.row.id);
      } else {
        await window.api.management.sendReminder(reminder.row.id);
      }
      closeReminder();
    } catch (error: any) {
      setReminder((prev) => ({
        ...prev,
        sending: false,
        error: error?.message ?? 'Failed to send reminder',
      }));
    }
  };

  const openPayment = (source: BillSource, row: TenantBillHistoryRow | ManagementTenantBillRow) => {
    setPayment({
      open: true,
      source,
      row,
      status: row.payment_status,
      method: row.payment_method ?? '',
      paymentDate: row.payment_date ?? todayIso(),
      saving: false,
      error: null,
    });
  };

  const closePayment = () => {
    setPayment({
      open: false,
      source: null,
      row: null,
      status: 'pending',
      method: '',
      paymentDate: todayIso(),
      saving: false,
      error: null,
    });
  };

  const savePayment = async () => {
    if (!payment.row || !payment.source) return;
    setPayment((prev) => ({ ...prev, saving: true, error: null }));
    try {
      const paymentMethod = payment.status === 'paid' ? payment.method || null : null;
      const paymentDate = payment.status === 'paid' ? payment.paymentDate : null;
      if (payment.source === 'electricity') {
        await window.api.tenants.updateBillPayment(payment.row.id, payment.status, paymentMethod, paymentDate);
      } else {
        await window.api.management.updateBillPayment(payment.row.id, payment.status, paymentMethod, paymentDate);
      }
      closePayment();
      await refresh();
    } catch (error: any) {
      setPayment((prev) => ({
        ...prev,
        saving: false,
        error: error?.message ?? 'Failed to update payment',
      }));
    }
  };

  const electricityBills = data?.bills ?? [];

  const reminderMessage =
    reminder.row && reminder.source
      ? reminder.source === 'electricity'
        ? `This will send a WhatsApp reminder to ${data?.tenant?.name ?? 'the tenant'} for the pending bill of ${reminder.row.period_month}/${reminder.row.period_year}.`
        : `This will send a WhatsApp reminder to ${data?.tenant?.name ?? 'the tenant'} for the management bill of ${reminder.row.period_month}/${reminder.row.period_year}.`
      : '';

  const paymentMessage =
    payment.row && payment.source
      ? payment.source === 'electricity'
        ? `Change the payment status and method for ${payment.row.period_month}/${payment.row.period_year}.`
        : `Change the payment status and method for the management bill of ${payment.row.period_month}/${payment.row.period_year}.`
      : '';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="mt-2 text-3xl font-semibold text-white">{data?.tenant?.name ?? 'Tenant bills'}</h1>
          <p className="mt-2 text-slate-400">
            Room {data?.tenant?.room_no ?? '-'} {data?.tenant?.phone ? `• ${data.tenant.phone}` : ''}
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <div className="text-sm text-slate-400">Total paid</div>
          <div className="mt-2 text-2xl font-semibold text-emerald-300">Rs {summary.totalPaid.toFixed(2)}</div>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <div className="text-sm text-slate-400">Total pending</div>
          <div className="mt-2 text-2xl font-semibold text-amber-300">Rs {summary.totalPending.toFixed(2)}</div>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <div className="text-sm text-slate-400">Energy unit consumed</div>
          <div className="mt-2 text-2xl font-semibold text-white">{summary.totalEnergy.toFixed(2)}</div>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <div className="text-sm text-slate-400">Present reading</div>
          <div className="mt-2 text-2xl font-semibold text-white">{summary.presentReading.toFixed(2)}</div>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          className={`rounded-full px-4 py-2 text-sm font-medium transition ${
            tab === 'electricity'
              ? 'bg-brand-500/20 text-brand-100 ring-1 ring-brand-400/30'
              : 'bg-white/5 text-slate-300 hover:bg-white/10'
          }`}
          onClick={() => setTab('electricity')}
        >
          Electricity
        </button>
        <button
          className={`rounded-full px-4 py-2 text-sm font-medium transition ${
            tab === 'management'
              ? 'bg-brand-500/20 text-brand-100 ring-1 ring-brand-400/30'
              : 'bg-white/5 text-slate-300 hover:bg-white/10'
          }`}
          onClick={() => setTab('management')}
        >
          Management
        </button>
      </div>

      {tab === 'electricity' ? (
        <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/5">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/5 text-slate-300">
              <tr>
                <th className="px-4 py-3">Period</th>
                <th className="px-4 py-3">Reading date</th>
                <th className="px-4 py-3">Previous</th>
                <th className="px-4 py-3">Present</th>
                <th className="px-4 py-3">Used</th>
                <th className="px-4 py-3">Payable</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Method</th>
                <th className="px-4 py-3">Payment date</th>
                <th className="px-4 py-3">Split</th>
                <th className="px-4 py-3">Reminder</th>
                <th className="px-4 py-3">Payment</th>
              </tr>
            </thead>
            <tbody>
              {electricityBills.map((bill) => {
                const canRemind = bill.payment_status !== 'paid' && Boolean(data?.tenant?.phone);
                return (
                  <tr key={bill.id} className="border-t border-white/10">
                    <td className="px-4 py-3">
                      {bill.period_month}/{bill.period_year}
                    </td>
                    <td className="px-4 py-3">{bill.reading_date}</td>
                    <td className="px-4 py-3">{bill.previous_reading.toFixed(2)}</td>
                    <td className="px-4 py-3">{bill.present_reading.toFixed(2)}</td>
                    <td className="px-4 py-3">{bill.consumed_unit.toFixed(2)}</td>
                    <td className="px-4 py-3">Rs {bill.payable.toFixed(2)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${getPaymentStatusClass(bill.payment_status)}`}>
                        {bill.payment_status === 'paid' ? 'Paid' : 'Pending'}
                      </span>
                    </td>
                    <td className="px-4 py-3">{bill.payment_method ?? '-'}</td>
                    <td className="px-4 py-3">{formatDate(bill.payment_date)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium capitalize ${getSplitStatusClass(bill.split_status)}`}>
                        {bill.split_status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {canRemind ? (
                        <button
                          className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/15"
                          onClick={() => openReminder('electricity', bill)}
                        >
                          Remind
                        </button>
                      ) : (
                        <span className="text-slate-500">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-brand-400"
                        onClick={() => openPayment('electricity', bill)}
                      >
                        Update
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/5">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/5 text-slate-300">
              <tr>
                <th className="px-4 py-3">Period</th>
                <th className="px-4 py-3">Maintenance</th>
                <th className="px-4 py-3">Generator</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Method</th>
                <th className="px-4 py-3">Payment date</th>
                <th className="px-4 py-3">Reminder</th>
                <th className="px-4 py-3">Payment update</th>
              </tr>
            </thead>
            <tbody>
              {managementBills.map((bill) => {
                const canRemind = bill.payment_status !== 'paid' && Boolean(bill.phone);
                return (
                  <tr key={bill.id} className="border-t border-white/10">
                    <td className="px-4 py-3">
                      {bill.period_month}/{bill.period_year}
                    </td>
                    <td className="px-4 py-3">Rs {bill.maintenance_fees.toFixed(2)}</td>
                    <td className="px-4 py-3">Rs {bill.generator_fees.toFixed(2)}</td>
                    <td className="px-4 py-3">Rs {bill.total.toFixed(2)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${getManagementStatusClass(bill.payment_status)}`}>
                        {bill.payment_status === 'paid' ? 'Paid' : 'Pending'}
                      </span>
                    </td>
                    <td className="px-4 py-3">{bill.payment_method ?? '-'}</td>
                    <td className="px-4 py-3">{formatDate(bill.payment_date)}</td>
                    <td className="px-4 py-3">
                      {canRemind ? (
                        <button
                          className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/15"
                          onClick={() => openReminder('management', bill)}
                        >
                          Remind
                        </button>
                      ) : (
                        <span className="text-slate-500">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-brand-400"
                        onClick={() => openPayment('management', bill)}
                      >
                        Update
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ReminderModal
        open={reminder.open}
        title="Send reminder?"
        message={reminderMessage}
        error={reminder.error}
        busy={reminder.sending}
        onClose={closeReminder}
        onConfirm={sendReminder}
      />

      <PaymentUpdateModal
        open={payment.open}
        title="Update payment"
        message={paymentMessage}
        error={payment.error}
        busy={payment.saving}
        status={payment.status}
        method={payment.method}
        paymentDate={payment.paymentDate}
        showPaymentDate
        onClose={closePayment}
        onConfirm={savePayment}
        onStatusChange={(status) =>
          setPayment((prev) => ({
            ...prev,
            status,
            method: status === 'paid' ? prev.method : '',
            paymentDate: status === 'paid' ? prev.paymentDate : todayIso(),
          }))
        }
        onMethodChange={(method) => setPayment((prev) => ({ ...prev, method }))}
        onPaymentDateChange={(paymentDate) => setPayment((prev) => ({ ...prev, paymentDate }))}
      />
    </div>
  );
}
