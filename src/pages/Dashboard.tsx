import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Bill, Tenant, TenantBillHistory } from '../types';

type DashboardStats = {
  bills: Bill[];
  tenants: Tenant[];
  histories: TenantBillHistory[];
};

const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const formatMonth = (month: number) => monthNames[month - 1] ?? String(month);
const periodKey = (month: number, year: number) => `${year}-${month}`;

const moneyFmt = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatMoney = (value: number) => `Rs ${moneyFmt.format(value)}`;
const formatUnits = (value: number) => moneyFmt.format(value);

const formatDate = (value: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB');
};

const clampPercent = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

const sortByPeriodDesc = <T extends { period_year: number; period_month: number }>(items: T[]) =>
  [...items].sort((a, b) => b.period_year - a.period_year || b.period_month - a.period_month);

const statusStyle = (status: string | null | undefined) => {
  switch (status) {
    case 'sent':
      return { badge: 'bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-500/30', dot: 'bg-emerald-300', label: 'Sent' };
    case 'finalized':
      return { badge: 'bg-sky-500/15 text-sky-200 ring-1 ring-sky-500/30', dot: 'bg-sky-300', label: 'Finalized' };
    default:
      return { badge: 'bg-slate-500/15 text-slate-200 ring-1 ring-slate-500/30', dot: 'bg-slate-300', label: 'Draft' };
  }
};

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats>({ bills: [], tenants: [], histories: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [periodFilter, setPeriodFilter] = useState('all');

  const availablePeriods = useMemo(() => {
    const map = new Map<string, { key: string; month: number; year: number }>();
    for (const bill of stats.bills) {
      const key = periodKey(bill.period_month, bill.period_year);
      if (!map.has(key)) map.set(key, { key, month: bill.period_month, year: bill.period_year });
    }
    return Array.from(map.values()).sort((a, b) => b.year - a.year || b.month - a.month);
  }, [stats.bills]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [bills, tenants] = await Promise.all([window.api.bills.list(), window.api.tenants.list()]);
        const histories = await Promise.all(tenants.map((t) => window.api.tenants.getBills(t.id)));
        if (!cancelled) setStats({ bills, tenants, histories });
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unable to load dashboard data.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const d = useMemo(() => {
    const sorted = sortByPeriodDesc(stats.bills);
    const activeBill =
      periodFilter === 'all'
        ? sorted[0] ?? null
        : stats.bills.find((b) => periodKey(b.period_month, b.period_year) === periodFilter) ?? null;

    const totalTenants = stats.tenants.length;
    const activeTenants = stats.tenants.filter((t) => t.active === 1).length;

    const draft = stats.bills.filter((b) => b.split_status === 'draft').length;
    const finalized = stats.bills.filter((b) => b.split_status === 'finalized').length;

    const inPeriod = (b: { period_month: number; period_year: number }) =>
      periodFilter === 'all' || periodKey(b.period_month, b.period_year) === periodFilter;

    const tenantBills = stats.histories.flatMap((h) => h.bills).filter(inPeriod);
    const paid = tenantBills.filter((b) => b.payment_status === 'paid');
    const unpaid = tenantBills.filter((b) => b.payment_status !== 'paid');
    const totalPaid = paid.reduce((s, b) => s + b.payable, 0);
    const totalPending = unpaid.reduce((s, b) => s + b.payable, 0);
    const totalEnergy = tenantBills.reduce((s, b) => s + b.consumed_unit, 0);

    const avgBill =
      tenantBills.length > 0
        ? tenantBills.reduce((s, b) => s + b.payable, 0) / tenantBills.length
        : 0;

    const paymentRate = tenantBills.length > 0 ? clampPercent((paid.length / tenantBills.length) * 100) : 0;

    const managementCollected = paid.reduce((s, b) => s + (b.management_total ?? 0), 0);
    const managementPending = unpaid.reduce((s, b) => s + (b.management_total ?? 0), 0);
    const managementBreakdown = {
      maintenance: tenantBills.reduce((s, b) => s + (b.maintenance_fee ?? 0), 0),
      generator: tenantBills.reduce((s, b) => s + (b.generator_fee ?? 0), 0),
      extraWork: tenantBills.reduce((s, b) => s + (b.management_extra_fee ?? 0), 0),
    };

    const topPending = stats.histories
      .map((h) => {
        const p = h.bills.filter((b) => b.payment_status !== 'paid' && inPeriod(b));
        return {
          tenant: h.tenant,
          amount: p.reduce((s, b) => s + b.payable, 0),
          count: p.length,
          oldest: p.length > 0 ? p[p.length - 1] : null,
        };
      })
      .filter((x) => x.tenant && x.amount > 0)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);

    const topConsumers = activeBill
      ? stats.histories
          .map((h) => {
            const billForPeriod = h.bills.find(
              (b) => b.period_year === activeBill.period_year && b.period_month === activeBill.period_month,
            );
            return {
              tenant: h.tenant,
              consumed: billForPeriod?.consumed_unit ?? 0,
              payable: billForPeriod?.payable ?? 0,
            };
          })
          .filter((x) => x.tenant && x.consumed > 0)
          .sort((a, b) => b.consumed - a.consumed)
          .slice(0, 5)
      : [];

    const topConsumerMax = topConsumers[0]?.consumed ?? 0;

    const recentPayments = stats.histories
      .flatMap((h) =>
        h.bills
          .filter((b) => b.payment_status === 'paid' && b.payment_date && inPeriod(b))
          .map((b) => ({
            id: b.id,
            tenantId: h.tenant?.id ?? null,
            tenantName: h.tenant?.name ?? 'Tenant',
            roomNo: h.tenant?.room_no ?? '-',
            payable: b.payable,
            paymentDate: b.payment_date,
            period_month: b.period_month,
            period_year: b.period_year,
          })),
      )
      .sort((a, b) => (b.paymentDate ?? '').localeCompare(a.paymentDate ?? ''))
      .slice(0, 5);

    return {
      sorted,
      latest: activeBill,
      totalTenants,
      activeTenants,
      draft,
      finalized,
      totalPaid,
      totalPending,
      totalEnergy,
      avgBill,
      paymentRate,
      paidCount: paid.length,
      managementCollected,
      managementPending,
      managementBreakdown,
      topPending,
      topConsumers,
      topConsumerMax,
      recentPayments,
    };
  }, [stats, periodFilter]);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">Dashboard</h1>
        </div>
        <label className="space-y-2 text-sm text-slate-300">
          <div>Period</div>
          <select
            className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white"
            value={periodFilter}
            onChange={(e) => setPeriodFilter(e.target.value)}
          >
            <option value="all">All periods</option>
            {availablePeriods.map((period) => (
              <option key={period.key} value={period.key}>
                {formatMonth(period.month)} {period.year}
              </option>
            ))}
          </select>
        </label>
      </header>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>
      ) : null}

      <section className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
        <Card label="Active tenants" value={`${d.activeTenants}/${d.totalTenants}`} caption="Active rooms" loading={loading} />
        <Card label="Total paid" value={formatMoney(d.totalPaid)} caption={`${d.paidCount} payments received`} loading={loading} accent="text-emerald-300" />
        <Card label="Pending amount" value={formatMoney(d.totalPending)} caption="Still to be collected" loading={loading} accent="text-amber-300" />
        <Card label="Avg bill" value={formatMoney(d.avgBill)} caption={`Across ${formatUnits(d.totalEnergy)} units billed`} loading={loading} />
        <Card
          label="Management fees"
          value={formatMoney(d.managementCollected)}
          caption={d.managementPending > 0 ? `${formatMoney(d.managementPending)} pending` : 'All collected'}
          loading={loading}
          accent="text-violet-300"
        />
      </section>

      <section>
        <ProgressCard
          label="Payment collection"
          value={`${d.paymentRate}%`}
          caption="Share of tenant bills marked paid"
          percent={d.paymentRate}
          color="bg-brand-400"
        />
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        <Panel
          title={periodFilter === 'all' ? 'Latest bill' : 'Selected bill'}
          subtitle={d.latest ? `${formatMonth(d.latest.period_month)} ${d.latest.period_year}` : 'No bills yet'}
          right={d.latest ? <StatusBadge status={d.latest.split_status ?? 'draft'} /> : null}
        >
          <div className="grid grid-cols-3 gap-3 p-4">
            <Stat label="Bill total" value={d.latest ? formatMoney(d.latest.total) : 'Rs 0.00'} />
            <Stat label="Tax rate" value={d.latest ? `${d.latest.tax_percent.toFixed(2)}%` : '0.00%'} />
            <Stat label="Consumed units" value={d.latest ? formatUnits(d.latest.energy_unit) : '0.00'} />
          </div>

        </Panel>

        <Panel
          title="Top pending tenants"
          subtitle="Action queue"
          right={
            <Link to="/tenants" className="text-xs font-medium text-brand-200 transition hover:text-brand-100">
              View all →
            </Link>
          }
        >
          {loading ? (
            <SkeletonRows count={4} />
          ) : d.topPending.length > 0 ? (
            <div className="divide-y divide-white/5">
              {d.topPending.map((item) => (
                <Link
                  key={item.tenant?.id}
                  to={`/tenants/${item.tenant?.id}/bills`}
                  className="flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-white/5"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-white">{item.tenant?.name ?? 'Tenant'}</div>
                    <div className="truncate text-xs text-slate-400">
                      Room {item.tenant?.room_no ?? '-'}
                      {item.oldest ? ` · oldest ${formatMonth(item.oldest.period_month)} ${item.oldest.period_year}` : ''}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-amber-300">{formatMoney(item.amount)}</div>
                    <div className="text-xs text-slate-500">
                      {item.count} {item.count === 1 ? 'bill' : 'bills'} pending
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <Empty title="All settled up" body="Tenants have no pending payments." />
          )}
        </Panel>
      </section>

      <section>
        <Panel
          title="Management fees breakdown"
          subtitle={periodFilter === 'all' ? 'All periods' : (d.latest ? `${formatMonth(d.latest.period_month)} ${d.latest.period_year}` : 'Selected period')}
        >
          <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
            <Stat label="Burjman Owner's Association" value={formatMoney(d.managementBreakdown.maintenance)} />
            <Stat label="Generator" value={formatMoney(d.managementBreakdown.generator)} />
            <Stat label="Extra work charges" value={formatMoney(d.managementBreakdown.extraWork)} />
            <Stat label="Pending" value={formatMoney(d.managementPending)} />
          </div>
        </Panel>
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        <Panel
          title="Top consumers"
          subtitle={d.latest ? `${formatMonth(d.latest.period_month)} ${d.latest.period_year}` : 'Latest period'}
        >
          {loading ? (
            <SkeletonRows count={4} />
          ) : d.topConsumers.length > 0 ? (
            <div className="space-y-2 p-4">
              {d.topConsumers.map((item) => {
                const pct = d.topConsumerMax > 0 ? (item.consumed / d.topConsumerMax) * 100 : 0;
                return (
                  <Link
                    key={item.tenant?.id}
                    to={`/tenants/${item.tenant?.id}/bills`}
                    className="block rounded-xl border border-white/10 bg-slate-950/40 p-3 transition hover:border-white/20 hover:bg-slate-950/60"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-white">{item.tenant?.name ?? 'Tenant'}</div>
                        <div className="text-xs text-slate-400">Room {item.tenant?.room_no ?? '-'}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold text-white">{formatUnits(item.consumed)}</div>
                        <div className="text-xs text-slate-400">{formatMoney(item.payable)}</div>
                      </div>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full bg-amber-400 transition-[width] duration-500" style={{ width: `${pct}%` }} />
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <Empty title="No consumption yet" body="Generate the latest bill to see top consumers." />
          )}
        </Panel>

        <Panel
          title="Recent payments"
          subtitle="Last received"
          right={
            <Link to="/tenants" className="text-xs font-medium text-brand-200 transition hover:text-brand-100">
              All tenants →
            </Link>
          }
        >
          {loading ? (
            <SkeletonRows count={4} />
          ) : d.recentPayments.length > 0 ? (
            <div className="divide-y divide-white/5">
              {d.recentPayments.map((item) => {
                return (
                  <Link
                    key={item.id}
                    to={`/tenants/${item.tenantId}/bills`}
                    className="flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-white/5"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-white">{item.tenantName}</div>
                      <div className="truncate text-xs text-slate-400">
                        Room {item.roomNo} · {formatMonth(item.period_month)} {item.period_year} · {formatDate(item.paymentDate)}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-semibold text-emerald-300">{formatMoney(item.payable)}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <Empty title="No payments yet" body="Once tenants pay, recent activity shows here." />
          )}
        </Panel>
      </section>
    </div>
  );
}

function Card({
  label,
  value,
  caption,
  loading,
  accent = 'text-white',
}: {
  label: string;
  value: string;
  caption: string;
  loading: boolean;
  accent?: string;
}) {
  return (
    <article className="rounded-2xl border border-white/10 bg-slate-950/35 p-4">
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      {loading ? (
        <div className="mt-2 h-7 w-24 animate-pulse rounded bg-white/10" />
      ) : (
        <div className={`mt-2 text-2xl font-semibold ${accent}`}>{value}</div>
      )}
      <div className="mt-1 text-xs text-slate-400">{caption}</div>
    </article>
  );
}

function ProgressCard({
  label,
  value,
  caption,
  percent,
  color,
}: {
  label: string;
  value: string;
  caption: string;
  percent: number;
  color: string;
}) {
  return (
    <article className="rounded-2xl border border-white/10 bg-slate-950/35 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
        <div className="text-2xl font-semibold text-white">{value}</div>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className={`h-full rounded-full transition-[width] duration-500 ${color}`} style={{ width: `${percent}%` }} />
      </div>
      <div className="mt-2 text-xs text-slate-400">{caption}</div>
    </article>
  );
}

function Panel({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <article className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950/35">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div>
          {subtitle ? <div className="text-[11px] uppercase tracking-wide text-slate-500">{subtitle}</div> : null}
          <div className="text-sm font-semibold text-white">{title}</div>
        </div>
        {right}
      </div>
      {children}
    </article>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-white/10 bg-slate-950/35 p-3">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 truncate text-lg font-semibold text-white">{value}</div>
    </div>
  );
}

function Tile({ label, value, dot }: { label: string; value: number; dot: string }) {
  return (
    <div className="flex min-w-0 items-center justify-between rounded-xl border border-white/10 bg-slate-950/35 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
        <span className="text-[11px] uppercase tracking-wide text-slate-400">{label}</span>
      </div>
      <span className="text-sm font-semibold text-white">{value}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const s = statusStyle(status);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${s.badge}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

function SkeletonRows({ count }: { count: number }) {
  return (
    <div className="divide-y divide-white/5">
      {Array.from({ length: count }).map((_, idx) => (
        <div key={idx} className="flex items-center justify-between px-4 py-3">
          <div className="space-y-1.5">
            <div className="h-3 w-32 animate-pulse rounded bg-white/10" />
            <div className="h-2.5 w-20 animate-pulse rounded bg-white/5" />
          </div>
          <div className="h-3 w-16 animate-pulse rounded bg-white/10" />
        </div>
      ))}
    </div>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="px-4 py-8 text-center">
      <div className="text-sm font-medium text-slate-200">{title}</div>
      <div className="mt-1 text-xs text-slate-400">{body}</div>
    </div>
  );
}
