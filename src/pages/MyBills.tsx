import { useEffect, useState, type FocusEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Bill } from '../types';
import { monthOptions } from '../lib/monthOptions';

type BillFormState = {
  period_month: number;
  period_year: string;
  fixed_unit: string;
  fixed_unit_price: string;
  energy_unit: string;
  energy_unit_price: string;
  extra_charge: string;
  interest_charge: string;
  other_charge: string;
  tax_percent: string;
};

type BillMode = 'auto' | 'manual';

const createInitialForm = (): BillFormState => ({
  period_month: new Date().getMonth() + 1,
  period_year: String(new Date().getFullYear()),
  fixed_unit: '0.00',
  fixed_unit_price: '0.00',
  energy_unit: '0.00',
  energy_unit_price: '0.00',
  extra_charge: '0.00',
  interest_charge: '0.00',
  other_charge: '0.00',
  tax_percent: '0.00',
});

const focusSelectAll = (event: FocusEvent<HTMLInputElement>) => {
  event.currentTarget.select();
};

const parseDecimal = (value: string) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export default function MyBills() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [isBillModalOpen, setIsBillModalOpen] = useState(false);
  const [editingBillId, setEditingBillId] = useState<number | null>(null);
  const [billMode, setBillMode] = useState<BillMode>('auto');
  const [form, setForm] = useState<BillFormState>(createInitialForm());
  const [formError, setFormError] = useState('');
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [listError, setListError] = useState('');
  const navigate = useNavigate();

  const fixedUnit = parseDecimal(form.fixed_unit);
  const fixedUnitPrice = parseDecimal(form.fixed_unit_price);
  const energyUnit = parseDecimal(form.energy_unit);
  const energyUnitPrice = parseDecimal(form.energy_unit_price);
  const extraCharge = parseDecimal(form.extra_charge);
  const interestCharge = parseDecimal(form.interest_charge);
  const otherCharge = parseDecimal(form.other_charge);
  const taxPercent = parseDecimal(form.tax_percent);

  const liveFixed = fixedUnit * fixedUnitPrice;
  const liveEnergy = energyUnit * energyUnitPrice;
  const liveTaxableBase = liveFixed + liveEnergy + extraCharge;
  const liveTax = liveTaxableBase * (taxPercent / 100);
  const liveTotal = liveFixed + liveEnergy + extraCharge + liveTax + interestCharge + otherCharge;

  const formatSplitStatus = (status?: Bill['split_status']) => {
    if (status && status !== 'draft') {
      return 'Done';
    }
    return 'Pending';
  };

  const refresh = async () => setBills(await window.api.bills.list());

  const deleteBill = async (bill: Bill) => {
    const warning =
      (bill.pending_count ?? 0) > 0 || (bill.tenant_count ?? 0) > 0
        ? ` This will also permanently delete its tenant split and payment records (${bill.tenant_count ?? 0} tenant${
            bill.tenant_count === 1 ? '' : 's'
          }).`
        : '';
    const confirmed = window.confirm(`Delete the bill for ${bill.period_month}/${bill.period_year}?${warning} This cannot be undone.`);
    if (!confirmed) return;

    setDeletingId(bill.id);
    setListError('');
    try {
      await window.api.bills.delete(bill.id);
      await refresh();
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Unable to delete this bill.');
    } finally {
      setDeletingId(null);
    }
  };

  const resetForm = () => {
    setEditingBillId(null);
    setBillMode('auto');
    setForm(createInitialForm());
    setFormError('');
  };

  const openAddModal = () => {
    resetForm();
    setIsBillModalOpen(true);
  };

  const openEditModal = (bill: Bill) => {
    const taxableBase = bill.fixed_charge + bill.energy_charge + bill.extra_charge;
    const derivedTaxPercent = taxableBase > 0 ? (bill.tax / taxableBase) * 100 : 0;
    setEditingBillId(bill.id);
    setBillMode(bill.entry_mode ?? 'auto');
    setForm({
      period_month: bill.period_month,
      period_year: String(bill.period_year),
      fixed_unit: bill.fixed_unit.toFixed(2),
      fixed_unit_price: bill.fixed_unit_price.toFixed(2),
      energy_unit: bill.energy_unit.toFixed(2),
      energy_unit_price: bill.energy_unit_price.toFixed(2),
      extra_charge: bill.extra_charge.toFixed(2),
      interest_charge: bill.interest_charge.toFixed(2),
      other_charge: bill.other_charge.toFixed(2),
      tax_percent: (bill.tax_percent > 0 ? bill.tax_percent : derivedTaxPercent).toFixed(2),
    });
    setIsBillModalOpen(true);
  };

  useEffect(() => {
    refresh();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-white">Bills</h1>
          <p className="mt-2 text-slate-400">Create the main electricity bill for each month.</p>
        </div>
        <button
          className="rounded-xl bg-brand-500 px-4 py-2 text-white transition hover:bg-brand-400"
          onClick={openAddModal}
        >
          Add Bill
        </button>
      </div>

      {isBillModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl shadow-black/40">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold text-white">{editingBillId ? 'Edit bill' : 'Add bill'}</h2>
                <p className="mt-1 text-sm text-slate-400">Enter the monthly bill values and save the record.</p>
              </div>
              <button
                className="rounded-lg px-2 py-1 text-slate-400 transition hover:bg-white/5 hover:text-white"
                onClick={() => {
                  setIsBillModalOpen(false);
                  resetForm();
                }}
                aria-label="Close bill modal"
              >
                Close
              </button>
            </div>

            {!editingBillId ? (
              <div className="mt-5 grid grid-cols-2 rounded-2xl border border-white/10 bg-slate-950/50 p-1">
                {(['auto', 'manual'] as BillMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={`rounded-xl px-4 py-2 text-sm font-medium capitalize transition ${
                      billMode === mode ? 'bg-brand-500 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white'
                    }`}
                    onClick={() => setBillMode(mode)}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            ) : null}

            <form
              className="mt-6 space-y-6"
              onSubmit={async (event) => {
                event.preventDefault();
                setFormError('');
                try {
                  const useEmptyManualBill = billMode === 'manual' && !editingBillId;
                  const savedBillId = await window.api.bills.save({
                    id: editingBillId ?? undefined,
                    entry_mode: billMode,
                    period_month: form.period_month,
                    period_year: Number(form.period_year),
                    fixed_unit: useEmptyManualBill ? 0 : fixedUnit,
                    fixed_unit_price: useEmptyManualBill ? 0 : fixedUnitPrice,
                    fixed_charge: useEmptyManualBill ? 0 : liveFixed,
                    energy_unit: useEmptyManualBill ? 0 : energyUnit,
                    energy_unit_price: useEmptyManualBill ? 0 : energyUnitPrice,
                    energy_charge: useEmptyManualBill ? 0 : liveEnergy,
                    extra_charge: useEmptyManualBill ? 0 : extraCharge,
                    interest_charge: useEmptyManualBill ? 0 : interestCharge,
                    other_charge: useEmptyManualBill ? 0 : otherCharge,
                    tax_percent: useEmptyManualBill ? 0 : taxPercent,
                    tax: useEmptyManualBill ? 0 : liveTax,
                    total: useEmptyManualBill ? 0 : liveTotal,
                  });
                  setIsBillModalOpen(false);
                  resetForm();
                  if (billMode === 'manual' && savedBillId) {
                    navigate(`/bills/${savedBillId}/split`);
                  } else {
                    refresh();
                  }
                } catch (error: any) {
                  setFormError(error?.message ?? 'Could not save this bill. Please try again.');
                }
              }}
            >
              {formError ? (
                <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                  {formError}
                </div>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-2 text-sm text-slate-300">
                  <div>Period month</div>
                  <select
                    className="w-full max-w-xs rounded-xl border border-white/10 bg-slate-950 px-3 py-2 pr-10 text-white"
                    value={form.period_month}
                    onChange={(e) => setForm((prev) => ({ ...prev, period_month: Number(e.target.value) }))}
                    required
                  >
                    {monthOptions.map((month) => (
                      <option key={month.value} value={month.value}>
                        {month.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  <div>Period year</div>
                  <input
                    type="number"
                    min="2000"
                    className="w-full max-w-xs rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white"
                    value={form.period_year}
                    onChange={(e) => setForm((prev) => ({ ...prev, period_year: e.target.value }))}
                    onFocus={focusSelectAll}
                    required
                  />
                </label>
                {billMode === 'auto' ? <>
                <label className="space-y-2 text-sm text-slate-300">
                  <div>Fixed unit</div>
                  <input
                    type="number"
                    step="0.01"
                    className="w-full max-w-xs rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white"
                    value={form.fixed_unit}
                    onChange={(e) => setForm((prev) => ({ ...prev, fixed_unit: e.target.value }))}
                    onFocus={focusSelectAll}
                  />
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  <div>Fixed Unit price</div>
                  <input
                    type="number"
                    step="0.01"
                    className="w-full max-w-xs rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white"
                    value={form.fixed_unit_price}
                    onChange={(e) => setForm((prev) => ({ ...prev, fixed_unit_price: e.target.value }))}
                    onFocus={focusSelectAll}
                  />
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  <div>Consumed unit</div>
                  <input
                    type="number"
                    step="0.01"
                    className="w-full max-w-xs rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white"
                    value={form.energy_unit}
                    onChange={(e) => setForm((prev) => ({ ...prev, energy_unit: e.target.value }))}
                    onFocus={focusSelectAll}
                  />
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  <div>Consumed Unit price</div>
                  <input
                    type="number"
                    step="0.01"
                    className="w-full max-w-xs rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white"
                    value={form.energy_unit_price}
                    onChange={(e) => setForm((prev) => ({ ...prev, energy_unit_price: e.target.value }))}
                    onFocus={focusSelectAll}
                  />
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  <div>Extra charge</div>
                  <input
                    type="number"
                    step="0.01"
                    className="w-full max-w-xs rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white"
                    value={form.extra_charge}
                    onChange={(e) => setForm((prev) => ({ ...prev, extra_charge: e.target.value }))}
                    onFocus={focusSelectAll}
                  />
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  <div>Tax %</div>
                  <input
                    type="number"
                    step="0.01"
                    className="w-full max-w-xs rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white"
                    value={form.tax_percent}
                    onChange={(e) => setForm((prev) => ({ ...prev, tax_percent: e.target.value }))}
                    onFocus={focusSelectAll}
                  />
                  <div className="text-xs text-slate-400">Tax amount: Rs {liveTax.toFixed(2)}</div>
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  <div>Interest charge</div>
                  <input
                    type="number"
                    step="0.01"
                    className="w-full max-w-xs rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white"
                    value={form.interest_charge}
                    onChange={(e) => setForm((prev) => ({ ...prev, interest_charge: e.target.value }))}
                    onFocus={focusSelectAll}
                  />
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  <div>Other charges</div>
                  <input
                    type="number"
                    step="0.01"
                    className="w-full max-w-xs rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white"
                    value={form.other_charge}
                    onChange={(e) => setForm((prev) => ({ ...prev, other_charge: e.target.value }))}
                    onFocus={focusSelectAll}
                  />
                </label>
                </> : null}
              </div>

              {billMode === 'auto' ? (
              <div className="grid gap-3 rounded-3xl border border-white/10 bg-white/5 p-4 md:grid-cols-3">
                <div className="flex flex-col gap-1 text-sm">
                  <span className="text-slate-300">Fixed charge</span>
                  <span className="text-white">Rs {liveFixed.toFixed(2)}</span>
                </div>
                <div className="flex flex-col gap-1 text-sm">
                  <span className="text-slate-300">Consumed charge</span>
                  <span className="text-white">Rs {liveEnergy.toFixed(2)}</span>
                </div>
                <div className="flex flex-col gap-1 text-sm">
                  <span className="text-slate-300">Live total</span>
                  <span className="text-white">Rs {liveTotal.toFixed(2)}</span>
                </div>
              </div>
              ) : (
                <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/5 px-4 py-3 text-sm text-cyan-100">
                  Continue to enter tenant readings and charges manually.
                </div>
              )}

              <div className="flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-white transition hover:bg-white/10"
                  onClick={() => {
                    setIsBillModalOpen(false);
                    resetForm();
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="rounded-xl bg-brand-500 px-4 py-2 text-white transition hover:bg-brand-400">
                  {editingBillId ? 'Update Bill' : billMode === 'manual' ? 'Continue' : 'Save Bill'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {listError ? (
        <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{listError}</div>
      ) : null}

      <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/5">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/5 text-slate-300">
            <tr>
              <th className="px-4 py-3">Period</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Tenants</th>
              <th className="px-4 py-3">Pending</th>
              <th className="px-4 py-3">Split status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {bills.map((bill) => (
              <tr key={bill.id} className="border-t border-white/10">
                <td className="px-4 py-3">
                  {bill.period_month}/{bill.period_year}
                </td>
                <td className="px-4 py-3">Rs {bill.total.toFixed(2)}</td>
                <td className="px-4 py-3">{bill.tenant_count ?? 0}</td>
                <td className="px-4 py-3">{bill.pending_count ?? 0}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
                      bill.split_status && bill.split_status !== 'draft'
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : 'bg-amber-500/15 text-amber-300'
                    }`}
                  >
                    {formatSplitStatus(bill.split_status)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white transition hover:bg-white/10"
                      onClick={() => openEditModal(bill)}
                    >
                      Edit
                    </button>
                    <button
                      className="rounded-lg bg-white/10 px-3 py-2 text-white"
                      onClick={() => navigate(`/bills/${bill.id}/split`)}
                    >
                      Open
                    </button>
                    <button
                      className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-rose-100 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={() => deleteBill(bill)}
                      disabled={deletingId === bill.id}
                    >
                      {deletingId === bill.id ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
