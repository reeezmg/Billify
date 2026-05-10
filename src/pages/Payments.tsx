import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { PaymentLedgerEntry } from '../types';

const formatDate = (value: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB');
};

export default function Payments() {
  const [payments, setPayments] = useState<PaymentLedgerEntry[]>([]);

  useEffect(() => {
    window.api.payments.list().then(setPayments);
  }, []);

  const summary = useMemo(() => {
    return {
      totalCollected: payments.reduce((sum, payment) => sum + payment.paid_amount, 0),
      electricityTotal: payments.filter((payment) => payment.paid_for === 'electricity').reduce((sum, payment) => sum + payment.paid_amount, 0),
      managementTotal: payments.filter((payment) => payment.paid_for === 'management').reduce((sum, payment) => sum + payment.paid_amount, 0),
    };
  }, [payments]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold text-white">Payments</h1>
        <p className="mt-2 text-slate-400">A unified ledger of all paid electricity and management bills.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <div className="text-sm text-slate-400">Total collected</div>
          <div className="mt-2 text-2xl font-semibold text-white">Rs {summary.totalCollected.toFixed(2)}</div>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <div className="text-sm text-slate-400">Electricity total</div>
          <div className="mt-2 text-2xl font-semibold text-sky-300">Rs {summary.electricityTotal.toFixed(2)}</div>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <div className="text-sm text-slate-400">Management total</div>
          <div className="mt-2 text-2xl font-semibold text-violet-300">Rs {summary.managementTotal.toFixed(2)}</div>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/5">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/5 text-slate-300">
            <tr>
              <th className="px-4 py-3">Tenant (Room)</th>
              <th className="px-4 py-3">Paid date</th>
              <th className="px-4 py-3">Paid amount</th>
              <th className="px-4 py-3">Paid method</th>
              <th className="px-4 py-3">Paid for</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((payment) => (
              <tr key={`${payment.paid_for}-${payment.source_id}`} className="border-t border-white/10">
                <td className="px-4 py-3">
                  <Link to={`/tenants/${payment.tenant_id}/bills`} className="text-brand-200 transition hover:text-brand-100">
                    {payment.tenant_name} ({payment.room_no})
                  </Link>
                </td>
                <td className="px-4 py-3">{formatDate(payment.paid_date)}</td>
                <td className="px-4 py-3">Rs {payment.paid_amount.toFixed(2)}</td>
                <td className="px-4 py-3">{payment.paid_method}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
                      payment.paid_for === 'electricity'
                        ? 'bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/20'
                        : 'bg-violet-500/15 text-violet-300 ring-1 ring-violet-500/20'
                    }`}
                  >
                    {payment.paid_for}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
