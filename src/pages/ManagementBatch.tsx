import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PaymentUpdateModal, ReminderModal } from '../components/billModals';
import type { ManagementBatchDetail, ManagementTenantBillRow, PaymentMethod, PaymentStatus } from '../types';

type ReminderState = {
  open: boolean;
  row: ManagementTenantBillRow | null;
  sending: boolean;
  error: string | null;
};

type PaymentState = {
  open: boolean;
  row: ManagementTenantBillRow | null;
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

export default function ManagementBatch() {
  const { batchId } = useParams();
  const [data, setData] = useState<ManagementBatchDetail | null>(null);
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
    if (!batchId) return;
    setData(await window.api.management.getBatch(Number(batchId)));
  };

  useEffect(() => {
    refresh();
  }, [batchId]);

  const summary = useMemo(() => {
    const rows = data?.rows ?? [];
    return {
      totalToCollect: rows.reduce((sum, row) => sum + row.total, 0),
      totalCollected: rows.filter((row) => row.payment_status === 'paid').reduce((sum, row) => sum + row.total, 0),
      pendingCount: rows.filter((row) => row.payment_status !== 'paid').length,
      sentCount: rows.filter((row) => Boolean(row.whatsapp_sent_at)).length,
    };
  }, [data]);

  const openReminder = (row: ManagementTenantBillRow) => {
    setReminder({ open: true, row, sending: false, error: null });
  };

  const closeReminder = () => {
    setReminder({ open: false, row: null, sending: false, error: null });
  };

  const sendReminder = async () => {
    if (!reminder.row) return;
    setReminder((prev) => ({ ...prev, sending: true, error: null }));
    try {
      await window.api.management.sendReminder(reminder.row.id);
      closeReminder();
    } catch (error: any) {
      setReminder((prev) => ({
        ...prev,
        sending: false,
        error: error?.message ?? 'Failed to send reminder',
      }));
    }
  };

  const openPayment = (row: ManagementTenantBillRow) => {
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
      await window.api.management.updateBillPayment(
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

  const reminderMessage = reminder.row
    ? `This will send a WhatsApp reminder to ${reminder.row.tenant_name} for the management bill of ${reminder.row.period_month}/${reminder.row.period_year}.`
    : '';

  const paymentMessage = payment.row
    ? `Change the payment status and method for the management bill of ${payment.row.period_month}/${payment.row.period_year}.`
    : '';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-white">Management batch</h1>
          <p className="mt-2 text-slate-400">
            Period {data?.batch.period_month ?? '-'} / {data?.batch.period_year ?? '-'}{' '}
            {data?.batch.status ? `• ${data.batch.status}` : ''}
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <div className="text-sm text-slate-400">Total to collect</div>
          <div className="mt-2 text-2xl font-semibold text-white">Rs {summary.totalToCollect.toFixed(2)}</div>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <div className="text-sm text-slate-400">Total collected</div>
          <div className="mt-2 text-2xl font-semibold text-emerald-300">Rs {summary.totalCollected.toFixed(2)}</div>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <div className="text-sm text-slate-400">Pending count</div>
          <div className="mt-2 text-2xl font-semibold text-amber-300">{summary.pendingCount}</div>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <div className="text-sm text-slate-400">Sent count</div>
          <div className="mt-2 text-2xl font-semibold text-sky-300">{summary.sentCount}</div>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/5">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/5 text-slate-300">
            <tr>
              <th className="px-4 py-3">Tenant name (Room)</th>
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
            {(data?.rows ?? []).map((row) => {
              const canRemind = row.payment_status !== 'paid' && Boolean(row.phone);
              return (
                <tr key={row.id} className="border-t border-white/10">
                  <td className="px-4 py-3">
                    <Link to={`/tenants/${row.tenant_id}/bills`} className="text-brand-200 transition hover:text-brand-100">
                      {row.tenant_name} ({row.room_no})
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {row.period_month}/{row.period_year}
                  </td>
                  <td className="px-4 py-3">Rs {row.maintenance_fees.toFixed(2)}</td>
                  <td className="px-4 py-3">Rs {row.generator_fees.toFixed(2)}</td>
                  <td className="px-4 py-3">Rs {row.total.toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
                        row.payment_status === 'paid'
                          ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/20'
                          : 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/20'
                      }`}
                    >
                      {row.payment_status === 'paid' ? 'Paid' : 'Pending'}
                    </span>
                  </td>
                  <td className="px-4 py-3">{row.payment_method ?? '-'}</td>
                  <td className="px-4 py-3">{formatDate(row.payment_date)}</td>
                  <td className="px-4 py-3">
                    {canRemind ? (
                      <button
                        className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/15"
                        onClick={() => openReminder(row)}
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
                      onClick={() => openPayment(row)}
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
