import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ReminderModal } from '../components/billModals';
import type { TenantBillHistory, TenantBillHistoryRow } from '../types';

type ReminderState = {
  open: boolean;
  row: TenantBillHistoryRow | null;
  sending: boolean;
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

const getManagementTotal = (bill: TenantBillHistoryRow) => bill.management_total ?? 0;
const getElectricityTotal = (bill: TenantBillHistoryRow) =>
  bill.electricity_total ?? Math.max(0, bill.payable - getManagementTotal(bill));

export default function TenantBills() {
  const { tenantId } = useParams();
  const [data, setData] = useState<TenantBillHistory | null>(null);
  const [reminder, setReminder] = useState<ReminderState>({
    open: false,
    row: null,
    sending: false,
    error: null,
  });
  const [paymentUpdatingId, setPaymentUpdatingId] = useState<number | null>(null);

  const refresh = async () => {
    if (!tenantId) return;
    setData(await window.api.tenants.getBills(Number(tenantId)));
  };

  useEffect(() => {
    void refresh();
  }, [tenantId]);

  const bills = data?.bills ?? [];
  const summary = useMemo(() => {
    const totalPaid = bills
      .filter((bill) => bill.payment_status === 'paid')
      .reduce((sum, bill) => sum + bill.payable, 0);
    const totalPending = bills
      .filter((bill) => bill.payment_status !== 'paid')
      .reduce((sum, bill) => sum + bill.payable, 0);

    return {
      totalPaid,
      totalPending,
      totalElectricity: bills.reduce((sum, bill) => sum + getElectricityTotal(bill), 0),
      totalManagement: bills.reduce((sum, bill) => sum + getManagementTotal(bill), 0),
    };
  }, [bills]);

  const closeReminder = () => {
    setReminder({ open: false, row: null, sending: false, error: null });
  };

  const sendReminder = async () => {
    if (!reminder.row) return;
    setReminder((previous) => ({ ...previous, sending: true, error: null }));
    try {
      await window.api.whatsapp.sendReminder(reminder.row.id);
      closeReminder();
    } catch (error: any) {
      setReminder((previous) => ({
        ...previous,
        sending: false,
        error: error?.message ?? 'Failed to send reminder',
      }));
    }
  };

  const togglePayment = async (bill: TenantBillHistoryRow) => {
    const nextStatus = bill.payment_status === 'paid' ? 'pending' : 'paid';
    setPaymentUpdatingId(bill.id);
    try {
      await window.api.tenants.updateBillPayment(
        bill.id,
        nextStatus,
        null,
        nextStatus === 'paid' ? todayIso() : null,
      );
      await refresh();
    } catch (error: any) {
      window.alert(error?.message ?? 'Failed to update payment');
    } finally {
      setPaymentUpdatingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mt-2 text-3xl font-semibold text-white">{data?.tenant?.name ?? 'Tenant bills'}</h1>
        <p className="mt-2 text-slate-400">
          Room {data?.tenant?.room_no ?? '-'} {data?.tenant?.phone ? `• ${data.tenant.phone}` : ''}
        </p>
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
          <div className="text-sm text-slate-400">Electricity fees</div>
          <div className="mt-2 text-2xl font-semibold text-white">Rs {summary.totalElectricity.toFixed(2)}</div>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <div className="text-sm text-slate-400">Management fees</div>
          <div className="mt-2 text-2xl font-semibold text-white">Rs {summary.totalManagement.toFixed(2)}</div>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/5">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/5 text-slate-300">
            <tr>
              <th className="px-4 py-3">Tenant name (Room)</th>
              <th className="px-4 py-3">Period</th>
              <th className="px-4 py-3">Electricity fees</th>
              <th className="px-4 py-3">Management fees</th>
              <th className="px-4 py-3">Payable</th>
              <th className="px-4 py-3">Payment</th>
              <th className="px-4 py-3">Payment date</th>
              <th className="px-4 py-3">Reminder</th>
              <th className="px-4 py-3">Payment update</th>
            </tr>
          </thead>
          <tbody>
            {bills.map((bill) => {
              const canRemind = bill.payment_status !== 'paid' && Boolean(data?.tenant?.phone);
              return (
                <tr key={bill.id} className="border-t border-white/10">
                  <td className="px-4 py-3">
                    {data?.tenant?.name ?? bill.tenant_name} ({data?.tenant?.room_no ?? bill.room_no})
                  </td>
                  <td className="px-4 py-3">{bill.period_month}/{bill.period_year}</td>
                  <td className="px-4 py-3">Rs {getElectricityTotal(bill).toFixed(2)}</td>
                  <td className="px-4 py-3">Rs {getManagementTotal(bill).toFixed(2)}</td>
                  <td className="px-4 py-3">Rs {bill.payable.toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${getPaymentStatusClass(bill.payment_status)}`}>
                      {bill.payment_status === 'paid' ? 'Paid' : 'Pending'}
                    </span>
                  </td>
                  <td className="px-4 py-3">{formatDate(bill.payment_date)}</td>
                  <td className="px-4 py-3">
                    {canRemind ? (
                      <button
                        className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/15"
                        onClick={() => setReminder({ open: true, row: bill, sending: false, error: null })}
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
                      disabled={paymentUpdatingId === bill.id}
                      onClick={() => void togglePayment(bill)}
                    >
                      {paymentUpdatingId === bill.id ? 'Saving...' : bill.payment_status === 'paid' ? 'Unpay' : 'Paid'}
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
        message={reminder.row ? `This will send a WhatsApp reminder to ${data?.tenant?.name ?? 'the tenant'} for the pending invoice of ${reminder.row.period_month}/${reminder.row.period_year}.` : ''}
        error={reminder.error}
        busy={reminder.sending}
        onClose={closeReminder}
        onConfirm={sendReminder}
      />

    </div>
  );
}
