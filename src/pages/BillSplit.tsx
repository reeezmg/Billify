import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { calculateSplit } from '../lib/calc';
import type { Bill } from '../types';

type RowState = {
  tenant_id: number;
  tenant_name: string;
  room_no: string;
  phone: string | null;
  previous_reading: number;
  present_reading: number;
  fixed_adjust: number;
  extra_adjust: number;
  interest_adjust: number;
  consumed_unit?: number;
  fixed_charge_calc?: number;
  energy_charge?: number;
  extra_charge_calc?: number;
  tax?: number;
  sub_total?: number;
  interest_charge_calc?: number;
  other_charge_calc?: number;
  payable?: number;
};

type EditableField = 'fixed_adjust' | 'extra_adjust' | 'interest_adjust';

type EditingCell = {
  tenant_id: number;
  field: EditableField;
} | null;

export default function BillSplit() {
  const { billId } = useParams();
  const [bill, setBill] = useState<Bill | null>(null);
  const [split, setSplit] = useState<any>(null);
  const [rows, setRows] = useState<RowState[]>([]);
  const [editingCell, setEditingCell] = useState<EditingCell>(null);
  const [isFinalizeModalOpen, setIsFinalizeModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      if (!billId) return;
      const [selectedBill, splitResponse] = await Promise.all([
        window.api.bills.get(Number(billId)),
        window.api.bills.getOrCreateSplit(Number(billId)),
      ]);
      const activeTenants = await window.api.tenants.active();
      const splitDetails = splitResponse ? await window.api.splits.get(splitResponse.id) : null;
      const rowsFromDb = splitDetails?.rows ?? [];
      setBill(selectedBill);
      setSplit(splitResponse);
      if (rowsFromDb.length > 0) {
        setRows(
          rowsFromDb.map((row: any) => ({
            tenant_id: row.tenant_id,
            tenant_name: row.tenant_name,
            room_no: row.room_no,
            phone: row.phone,
            previous_reading: row.previous_reading,
            present_reading: row.present_reading,
            fixed_adjust: row.fixed_adjust,
            extra_adjust: row.extra_adjust,
            interest_adjust: row.interest_adjust,
            other_charge_calc: row.other_charge_calc,
          })),
        );
        return;
      }
      setRows(
        activeTenants.map((tenant) => ({
          tenant_id: tenant.id,
          tenant_name: tenant.name,
          room_no: tenant.room_no,
          phone: tenant.phone,
          previous_reading: tenant.present_reading ?? 0,
          present_reading: tenant.present_reading ?? 0,
          fixed_adjust: 0,
          extra_adjust: 0,
          interest_adjust: 0,
        })),
      );
    })();
  }, [billId]);

  const calc = useMemo(
    () =>
      bill
        ? calculateSplit({
            bill: {
              fixed_charge: bill.fixed_charge,
              energy_charge: bill.energy_charge,
              energy_unit_price: bill.energy_unit_price,
              extra_charge: bill.extra_charge,
              tax: bill.tax,
              interest_charge: bill.interest_charge,
              other_charge: bill.other_charge,
            },
            split: { tax_rate: bill.tax_percent },
            rows,
          })
        : null,
    [bill, rows],
  );

  const updateRow = (tenantId: number, field: keyof Pick<RowState, 'previous_reading' | 'present_reading' | 'fixed_adjust' | 'extra_adjust' | 'interest_adjust'>, value: number) => {
    setRows((prev) => prev.map((item) => (item.tenant_id === tenantId ? { ...item, [field]: value } : item)));
  };

  const persistSplit = async (status: 'draft' | 'finalized') => {
    if (!split || !bill) return;
    setIsSubmitting(true);
    try {
      await window.api.splits.save({
        split_id: split.id,
        status,
        reading_date: split.reading_date,
        tax_rate: bill.tax_percent,
        bill: {
          fixed_charge: bill.fixed_charge,
          energy_charge: bill.energy_charge,
          energy_unit_price: bill.energy_unit_price,
          extra_charge: bill.extra_charge,
          tax: bill.tax,
          interest_charge: bill.interest_charge,
          other_charge: bill.other_charge,
        },
        rows,
      });
      await Promise.all(
        rows.map((row) =>
          window.api.tenants.save({
            id: row.tenant_id,
            present_reading: row.present_reading,
          }),
        ),
      );
      if (status === 'finalized') {
        const splitDetails = await window.api.splits.get(split.id);
        setSplit(splitDetails);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSend = async () => {
    if (!split || !bill) return;
    await persistSplit('finalized');
    await window.api.whatsapp.sendAll(split.id);
    setIsFinalizeModalOpen(false);
  };

  return (
    <div className="space-y-6">

      {bill ? (
        <div className="space-y-4">
          <div className="rounded-3xl border border-white/10 bg-white/5 px-5 py-4">
            <div className="grid gap-4 md:grid-cols-6">
              <div className="space-y-1 text-sm">
                <div className="text-slate-400">Bill period</div>
                <div className="text-white">
                  {bill.period_month}/{bill.period_year}
                </div>
              </div>
              <div className="space-y-1 text-sm">
                <div className="text-slate-400">Main total</div>
                <div className="text-white">Rs {bill.total.toFixed(2)}</div>
              </div>
              <label className="space-y-1 text-sm">
                <div className="text-slate-400">Reading date</div>
                <input
                  type="date"
                  className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white"
                  value={split?.reading_date ?? ''}
                  onChange={(e) => setSplit((prev: any) => ({ ...prev, reading_date: e.target.value }))}
                />
              </label>
              <div className="space-y-1 text-sm">
                <div className="text-slate-400">Tax %</div>
                <div className="text-white">{bill.tax_percent.toFixed(2)}%</div>
              </div>
              <div className="space-y-1 text-sm">
                <div className="text-slate-400">Fixed unit price</div>
                <div className="text-white">Rs {bill.fixed_unit_price.toFixed(2)}</div>
              </div>
              <div className="space-y-1 text-sm">
                <div className="text-slate-400">Energy unit price</div>
                <div className="text-white">Rs {bill.energy_unit_price.toFixed(2)}</div>
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/5">
            <div className="border-b border-white/10 px-5 py-4 text-sm font-medium text-slate-300">Bill Difference</div>
            <table className="table-fixed w-full text-left text-xs">
              <thead className="bg-white/5 text-slate-300">
                <tr>
                  <th className="w-[16%] px-3 py-2">Fixed ({bill.fixed_unit.toFixed(2)} units)</th>
                  <th className="w-[16%] px-3 py-2">Energy ({bill.energy_unit.toFixed(2)} units)</th>
                  <th className="w-[12%] px-3 py-2">Extra</th>
                  <th className="w-[12%] px-3 py-2">Tax</th>
                  <th className="w-[12%] px-3 py-2">Interest</th>
                  <th className="w-[12%] px-3 py-2">Other</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-white/10 text-white">
                  <td className="px-3 py-2">Rs {calc?.reconciliation.fixed_diff.toFixed(2) ?? '0.00'}</td>
                  <td className="px-3 py-2">Rs {calc?.reconciliation.energy_diff.toFixed(2) ?? '0.00'}</td>
                  <td className="px-3 py-2">Rs {calc?.reconciliation.extra_diff.toFixed(2) ?? '0.00'}</td>
                  <td className="px-3 py-2">Rs {calc?.reconciliation.tax_diff.toFixed(2) ?? '0.00'}</td>
                  <td className="px-3 py-2">Rs {calc?.reconciliation.interest_diff.toFixed(2) ?? '0.00'}</td>
                  <td className="px-3 py-2">Rs {calc?.reconciliation.other_diff.toFixed(2) ?? '0.00'}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {isFinalizeModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl shadow-black/40">
            <h2 className="text-2xl font-semibold text-white">Finalizing bill</h2>
            <p className="mt-2 text-sm text-slate-400">
              Finalizing this bill will create tenant bills for all active tenants. You can save the final split or send it
              directly through WhatsApp.
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-white transition hover:bg-white/10"
                onClick={() => setIsFinalizeModalOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-xl bg-white/10 px-4 py-2 text-white transition hover:bg-white/15"
                onClick={async () => {
                  await persistSplit('finalized');
                  setIsFinalizeModalOpen(false);
                }}
                disabled={isSubmitting}
              >
                Save
              </button>
              <button
                type="button"
                className="rounded-xl bg-brand-500 px-4 py-2 text-white transition hover:bg-brand-400"
                onClick={handleSend}
                disabled={isSubmitting}
              >
                Send
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="rounded-3xl border border-white/10 bg-white/5">
        <table className="table-fixed w-full text-left text-xs">
          <thead className="bg-white/5 text-slate-300">
            <tr>
              <th className="w-[8%] px-2 py-2">Room</th>
              <th className="w-[16%] px-2 py-2">Name</th>
              <th className="w-[7%] px-2 py-2">Prev</th>
              <th className="w-[7%] px-2 py-2">Present</th>
              <th className="w-[7%] px-2 py-2">Used</th>
              <th className="w-[9%] px-2 py-2">Fixed</th>
              <th className="w-[9%] px-2 py-2">Energy</th>
              <th className="w-[8%] px-2 py-2">Extra</th>
              <th className="w-[8%] px-2 py-2">Tax</th>
              <th className="w-[8%] px-2 py-2">Sub</th>
              <th className="w-[8%] px-2 py-2">Interest</th>
              <th className="w-[8%] px-2 py-2">Other</th>
              <th className="w-[10%] px-2 py-2">Payable</th>
            </tr>
          </thead>
          <tbody>
            {(calc?.rows ?? []).map((row) => {
              const src = rows.find((r) => r.tenant_id === row.tenant_id)!;
              return (
                <tr key={row.tenant_id} className="border-t border-white/10">
                  <td className="px-2 py-2">{src.room_no}</td>
                  <td className="px-2 py-2 truncate">{src.tenant_name}</td>
                  <td className="px-2 py-2">
                    <input className="w-full rounded-lg border border-white/10 bg-slate-950 px-2 py-1 text-white" type="number" value={src.previous_reading} onChange={(e) => updateRow(src.tenant_id, 'previous_reading', Number(e.target.value))} />
                  </td>
                  <td className="px-2 py-2">
                    <input className="w-full rounded-lg border border-white/10 bg-slate-950 px-2 py-1 text-white" type="number" value={src.present_reading} onChange={(e) => updateRow(src.tenant_id, 'present_reading', Number(e.target.value))} />
                  </td>
                  <td className="px-2 py-2">{row.consumed_unit.toFixed(2)}</td>
                  <td className="px-2 py-2">
                    {editingCell?.tenant_id === src.tenant_id && editingCell.field === 'fixed_adjust' ? (
                      <input
                        autoFocus
                        className="w-full rounded-lg border border-white/10 bg-slate-950 px-2 py-1 text-white"
                        type="number"
                        step="0.01"
                        value={src.fixed_adjust}
                        onChange={(e) => updateRow(src.tenant_id, 'fixed_adjust', Number(e.target.value))}
                        onBlur={() => setEditingCell(null)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === 'Escape') {
                            setEditingCell(null);
                          }
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        className="rounded-lg px-2 py-1 text-white transition hover:bg-white/5"
                        onClick={() => setEditingCell({ tenant_id: src.tenant_id, field: 'fixed_adjust' })}
                      >
                        {(row.fixed_charge_calc + src.fixed_adjust).toFixed(2)}
                      </button>
                    )}
                  </td>
                  <td className="px-2 py-2">{row.energy_charge.toFixed(2)}</td>
                  <td className="px-2 py-2">
                    {editingCell?.tenant_id === src.tenant_id && editingCell.field === 'extra_adjust' ? (
                      <input
                        autoFocus
                        className="w-full rounded-lg border border-white/10 bg-slate-950 px-2 py-1 text-white"
                        type="number"
                        step="0.01"
                        value={src.extra_adjust}
                        onChange={(e) => updateRow(src.tenant_id, 'extra_adjust', Number(e.target.value))}
                        onBlur={() => setEditingCell(null)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === 'Escape') {
                            setEditingCell(null);
                          }
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        className="rounded-lg px-2 py-1 text-white transition hover:bg-white/5"
                        onClick={() => setEditingCell({ tenant_id: src.tenant_id, field: 'extra_adjust' })}
                      >
                        {(row.extra_charge_calc + src.extra_adjust).toFixed(2)}
                      </button>
                    )}
                  </td>
                  <td className="px-2 py-2">{row.tax.toFixed(2)}</td>
                  <td className="px-2 py-2">{row.sub_total.toFixed(2)}</td>
                  <td className="px-2 py-2">
                    {editingCell?.tenant_id === src.tenant_id && editingCell.field === 'interest_adjust' ? (
                      <input
                        autoFocus
                        className="w-full rounded-lg border border-white/10 bg-slate-950 px-2 py-1 text-white"
                        type="number"
                        step="0.01"
                        value={src.interest_adjust}
                        onChange={(e) => updateRow(src.tenant_id, 'interest_adjust', Number(e.target.value))}
                        onBlur={() => setEditingCell(null)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === 'Escape') {
                            setEditingCell(null);
                          }
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        className="rounded-lg px-2 py-1 text-white transition hover:bg-white/5"
                        onClick={() => setEditingCell({ tenant_id: src.tenant_id, field: 'interest_adjust' })}
                      >
                        {(row.interest_charge_calc + src.interest_adjust).toFixed(2)}
                      </button>
                    )}
                  </td>
                  <td className="px-2 py-2">{row.other_charge_calc?.toFixed(2) ?? '0.00'}</td>
                  <td className="px-2 py-2 font-medium text-brand-200">{row.payable.toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          className="rounded-xl bg-white/10 px-4 py-2 text-white"
          onClick={() => persistSplit('draft')}
          disabled={isSubmitting}
        >
          Save Draft
        </button>
        <button
          className="rounded-xl bg-brand-500 px-4 py-2 text-white"
          onClick={() => setIsFinalizeModalOpen(true)}
          disabled={isSubmitting}
        >
          Finalize
        </button>
      </div>
    </div>
  );
}
