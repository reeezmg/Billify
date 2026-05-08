import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { PaymentMethod, PaymentStatus, TenantBillHistory, TenantBillHistoryRow } from '../types';

type ReminderState = {
  open: boolean;
  row: TenantBillHistoryRow | null;
  sending: boolean;
  error: string | null;
};

type PaymentState = {
  open: boolean;
  row: TenantBillHistoryRow | null;
  status: PaymentStatus;
  method: PaymentMethod | '';
  paymentDate: string;
  saving: boolean;
  error: string | null;
};

const paymentMethodOptions: PaymentMethod[] = ['cash', 'upi', 'card'];

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

export default function TenantBills() {
  const { tenantId } = useParams();
  const [data, setData] = useState<TenantBillHistory | null>(null);
  const [reminder, setReminder] = useState<ReminderState>({
    open: false,
    row: null,
    sending: false,
    error: null,
  });
  const [payment, setPayment] = useState<PaymentState>({
    open: false,
    row: null,
    status: 'pending',
    method: '',
    paymentDate: todayIso(),
    saving: false,
    error: null,
  });

  const refresh = async () => {
    if (!tenantId) return;
    const result = await window.api.tenants.getBills(Number(tenantId));
    setData(result);
  };

  useEffect(() => {
    refresh();
  }, [tenantId]);

  const summary = useMemo(() => {
    const bills = data?.bills ?? [];
    return {
      totalPaid: bills.filter((bill) => bill.payment_status === 'paid').reduce((sum, bill) => sum + bill.payable, 0),
      totalPending: bills.filter((bill) => bill.payment_status !== 'paid').reduce((sum, bill) => sum + bill.payable, 0),
      totalEnergy: bills.reduce((sum, bill) => sum + bill.consumed_unit, 0),
      presentReading: data?.tenant?.present_reading ?? 0,
    };
  }, [data]);

  const openReminder = (row: TenantBillHistoryRow) => {
    setReminder({ open: true, row, sending: false, error: null });
  };

  const closeReminder = () => {
    setReminder({ open: false, row: null, sending: false, error: null });
  };

  const sendReminder = async () => {
    if (!reminder.row) return;
    setReminder((prev) => ({ ...prev, sending: true, error: null }));
    try {
      await window.api.whatsapp.sendReminder(reminder.row.id);
      closeReminder();
    } catch (error: any) {
      setReminder((prev) => ({
        ...prev,
        sending: false,
        error: error?.message ?? 'Failed to send reminder',
      }));
    }
  };

  const openPayment = (row: TenantBillHistoryRow) => {
    setPayment({
      open: true,
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
      row: null,
      status: 'pending',
      method: '',
      paymentDate: todayIso(),
      saving: false,
      error: null,
    });
  };

  const savePayment = async () => {
    if (!payment.row) return;
    setPayment((prev) => ({ ...prev, saving: true, error: null }));
    try {
      await window.api.tenants.updateBillPayment(
        payment.row.id,
        payment.status,
        payment.status === 'paid' ? (payment.method || null) : null,
        payment.status === 'paid' ? payment.paymentDate : null,
      );
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
            {(data?.bills ?? []).map((bill) => {
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
                        onClick={() => openReminder(bill)}
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
                      onClick={() => openPayment(bill)}
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

      {reminder.open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl shadow-black/40">
            <h2 className="text-2xl font-semibold text-white">Send reminder?</h2>
            <p className="mt-2 text-sm text-slate-400">
              This will send a WhatsApp reminder to {data?.tenant?.name ?? 'the tenant'} for the pending bill of{' '}
              {reminder.row ? `${reminder.row.period_month}/${reminder.row.period_year}` : ''}.
            </p>
            {reminder.error ? <div className="mt-4 text-sm text-red-300">{reminder.error}</div> : null}
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-white transition hover:bg-white/10"
                onClick={closeReminder}
                disabled={reminder.sending}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-xl bg-brand-500 px-4 py-2 text-white transition hover:bg-brand-400 disabled:opacity-60"
                onClick={sendReminder}
                disabled={reminder.sending}
              >
                {reminder.sending ? 'Sending...' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {payment.open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl shadow-black/40">
            <h2 className="text-2xl font-semibold text-white">Update payment</h2>
            <p className="mt-2 text-sm text-slate-400">
              Change the payment status and method for {payment.row?.period_month}/{payment.row?.period_year}.
            </p>
            {payment.error ? <div className="mt-4 text-sm text-red-300">{payment.error}</div> : null}

            <div className="mt-6 grid gap-4">
              <label className="space-y-2 text-sm text-slate-300">
                <div>Payment status</div>
                <select
                  className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white"
                  value={payment.status}
                  onChange={(e) =>
                    setPayment((prev) => ({
                      ...prev,
                      status: e.target.value as PaymentStatus,
                      method: e.target.value === 'paid' ? prev.method : '',
                      paymentDate: e.target.value === 'paid' ? prev.paymentDate : todayIso(),
                    }))
                  }
                >
                  <option value="pending">Pending</option>
                  <option value="paid">Paid</option>
                </select>
              </label>

              {payment.status === 'paid' ? (
                <>
                  <label className="space-y-2 text-sm text-slate-300">
                    <div>Payment method</div>
                    <select
                      className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white"
                      value={payment.method}
                      onChange={(e) => setPayment((prev) => ({ ...prev, method: e.target.value as PaymentMethod }))}
                    >
                      <option value="">Select method</option>
                      {paymentMethodOptions.map((method) => (
                        <option key={method} value={method}>
                          {method.toUpperCase()}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-2 text-sm text-slate-300">
                    <div>Payment date</div>
                    <input
                      type="date"
                      className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white"
                      value={payment.paymentDate}
                      onChange={(e) => setPayment((prev) => ({ ...prev, paymentDate: e.target.value }))}
                    />
                  </label>
                </>
              ) : null}
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-white transition hover:bg-white/10"
                onClick={closePayment}
                disabled={payment.saving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-xl bg-brand-500 px-4 py-2 text-white transition hover:bg-brand-400 disabled:opacity-60"
                onClick={savePayment}
                disabled={payment.saving}
              >
                {payment.saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
