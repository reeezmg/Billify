import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { PaymentLedgerEntry } from '../types';
import { monthOptions } from '../lib/monthOptions';

const formatDate = (value: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB');
};

const amount = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const periodKey = (month: number, year: number) => `${year}-${month}`;
const monthLabel = (month: number) => monthOptions.find((option) => option.value === month)?.label ?? String(month);

export default function Payments() {
  const [payments, setPayments] = useState<PaymentLedgerEntry[]>([]);
  const [periodFilter, setPeriodFilter] = useState('all');

  useEffect(() => {
    window.api.payments.list().then(setPayments);
  }, []);

  const periods = useMemo(() => {
    const map = new Map<string, { key: string; month: number; year: number }>();
    for (const payment of payments) {
      const key = periodKey(payment.period_month, payment.period_year);
      if (!map.has(key)) map.set(key, { key, month: payment.period_month, year: payment.period_year });
    }
    return Array.from(map.values()).sort((a, b) => b.year - a.year || b.month - a.month);
  }, [payments]);

  const filteredPayments = useMemo(
    () =>
      periodFilter === 'all'
        ? payments
        : payments.filter((payment) => periodKey(payment.period_month, payment.period_year) === periodFilter),
    [payments, periodFilter],
  );

  const summary = useMemo(() => {
    return {
      totalCollected: filteredPayments.reduce((sum, payment) => sum + amount(payment.paid_amount), 0),
      electricityTotal: filteredPayments.reduce((sum, payment) => sum + amount(payment.electricity_amount), 0),
      managementTotal: filteredPayments.reduce((sum, payment) => sum + amount(payment.management_amount), 0),
    };
  }, [filteredPayments]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-white">Payments</h1>
          <p className="mt-2 text-slate-400">A ledger of all paid combined invoices.</p>
        </div>
        <label className="space-y-2 text-sm text-slate-300">
          <div>Period</div>
          <select
            className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white"
            value={periodFilter}
            onChange={(e) => setPeriodFilter(e.target.value)}
          >
            <option value="all">All periods</option>
            {periods.map((period) => (
              <option key={period.key} value={period.key}>
                {monthLabel(period.month)} {period.year}
              </option>
            ))}
          </select>
        </label>
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
              <th className="px-4 py-3">Period</th>
              <th className="px-4 py-3">Paid date</th>
              <th className="px-4 py-3">Paid amount</th>
              <th className="px-4 py-3">Invoice number</th>
            </tr>
          </thead>
          <tbody>
            {filteredPayments.map((payment) => (
              <tr key={payment.source_id} className="border-t border-white/10">
                <td className="px-4 py-3">
                  <Link to={`/tenants/${payment.tenant_id}/bills`} className="text-brand-200 transition hover:text-brand-100">
                    {payment.tenant_name} ({payment.room_no})
                  </Link>
                </td>
                <td className="px-4 py-3">{monthLabel(payment.period_month)} {payment.period_year}</td>
                <td className="px-4 py-3">{formatDate(payment.paid_date)}</td>
                <td className="px-4 py-3">Rs {amount(payment.paid_amount).toFixed(2)}</td>
                <td className="px-4 py-3 font-medium text-sky-200">INV-{payment.split_id ?? payment.source_id}-{String(payment.room_no).replace(/\s+/g, '').toUpperCase()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
