import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { ReminderModal } from '../components/billModals';
import { calculateSplit } from '../lib/calc';
import type { Bill, PaymentStatus } from '../types';

type RowState = {
  id?: number;
  tenant_id: number;
  tenant_name: string;
  room_no: string;
  phone: string | null;
  previous_reading: number;
  present_reading: number;
  fixed_adjust: number;
  fixed_unit: number;
  fixed_unit_price: number;
  energy_unit_price: number;
  energy_adjust: number;
  extra_adjust: number;
  extra_unit_price: number;
  extra_unit_adjust: number;
  tax_adjust: number;
  interest_adjust: number;
  other_adjust: number;
  maintenance_fee: number;
  generator_fee: number;
  management_extra_fee: number;
  consumed_unit?: number;
  fixed_charge_calc?: number;
  energy_charge_calc?: number;
  energy_charge?: number;
  extra_charge_calc?: number;
  extra_unit_charge_calc?: number;
  extra_unit_charge?: number;
  tax?: number;
  sub_total?: number;
  interest_charge_calc?: number;
  other_charge_calc?: number;
  other_charge?: number;
  electricity_total?: number;
  management_total?: number;
  payable?: number;
  payment_status?: PaymentStatus;
  payment_date?: string | null;
  whatsapp_sent_at?: string | null;
  whatsapp_message_id?: string | null;
};

type EditableField = 'fixed_adjust' | 'extra_adjust' | 'extra_unit_adjust' | 'interest_adjust' | 'other_adjust';

type EditingCell = {
  tenant_id: number;
  field: EditableField;
  value: string;
} | null;

type ReminderState = {
  open: boolean;
  row: RowState | null;
  sending: boolean;
  error: string | null;
};

const todayIso = () => new Date().toISOString().slice(0, 10);

const computeAutoFixedUnit = (consumedUnit: number) => {
  if (consumedUnit <= 40) return 0;
  return Math.ceil(consumedUnit / 100);
};

const sortByRoomNo = <T extends { room_no: string }>(list: T[]) =>
  [...list].sort((a, b) => a.room_no.localeCompare(b.room_no, undefined, { numeric: true, sensitivity: 'base' }));

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

const moveSplitInputFocus = (event: KeyboardEvent<HTMLDivElement>) => {
  const current = event.target;
  if (!(current instanceof HTMLInputElement)) return;

  if (event.key === 'Enter' && current.dataset.splitInput === 'present') {
    event.preventDefault();
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const presentInputs = Array.from(
      event.currentTarget.querySelectorAll<HTMLInputElement>('input[data-split-input="present"]:not([disabled])'),
    ).filter((input) => input.offsetParent !== null);
    const next = presentInputs[presentInputs.indexOf(current) + 1];
    if (next) {
      next.focus();
      next.select();
    }
    return;
  }

  if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
  event.preventDefault();
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;

  const inputs = Array.from(event.currentTarget.querySelectorAll<HTMLInputElement>('input:not([disabled])'))
    .filter((input) => input.offsetParent !== null);
  const currentRect = current.getBoundingClientRect();
  const currentX = currentRect.left + currentRect.width / 2;
  const currentY = currentRect.top + currentRect.height / 2;
  const vertical = event.key === 'ArrowUp' || event.key === 'ArrowDown';
  const positive = event.key === 'ArrowDown' || event.key === 'ArrowRight';

  const next = inputs
    .filter((input) => input !== current)
    .map((input) => {
      const rect = input.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const primary = vertical ? y - currentY : x - currentX;
      const crossAxis = vertical ? Math.abs(x - currentX) : Math.abs(y - currentY);
      return { input, primary, score: Math.abs(primary) + crossAxis * 4 };
    })
    .filter(({ primary }) => positive ? primary > 1 : primary < -1)
    .sort((left, right) => left.score - right.score)[0]?.input;

  if (!next) return;
  next.focus();
  next.select();
};

function EmptyableNumberInput({
  value,
  onChange,
  className,
  inputRole,
}: {
  value: number;
  onChange: (value: number) => void;
  className: string;
  inputRole?: string;
}) {
  const [draft, setDraft] = useState(String(value));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(String(value));
  }, [value]);

  return (
    <input
      className={className}
      type="number"
      step="0.01"
      data-split-input={inputRole}
      value={draft}
      onFocus={() => {
        focused.current = true;
      }}
      onChange={(event) => {
        const next = event.target.value;
        setDraft(next);
        if (next !== '') onChange(Number(next));
      }}
      onBlur={() => {
        focused.current = false;
        if (draft === '') {
          setDraft('0');
          onChange(0);
        } else {
          setDraft(String(Number(draft)));
        }
      }}
    />
  );
}

export default function BillSplit() {
  const { billId } = useParams();
  const [bill, setBill] = useState<Bill | null>(null);
  const [split, setSplit] = useState<any>(null);
  const [rows, setRows] = useState<RowState[]>([]);
  const [editingCell, setEditingCell] = useState<EditingCell>(null);
  const [isFinalizeModalOpen, setIsFinalizeModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalAction, setModalAction] = useState<'save' | 'download' | 'send' | 'print' | null>(null);
  const [selectedBillIds, setSelectedBillIds] = useState<number[]>([]);
  const [openActionId, setOpenActionId] = useState<number | null>(null);
  const [actionMenuPosition, setActionMenuPosition] = useState({ top: 0, left: 0 });
  const [rowAction, setRowAction] = useState<string | null>(null);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [reminder, setReminder] = useState<ReminderState>({
    open: false,
    row: null,
    sending: false,
    error: null,
  });
  const [paymentUpdatingId, setPaymentUpdatingId] = useState<number | null>(null);
  const isManual = bill?.entry_mode === 'manual';

  useEffect(() => {
    (async () => {
      if (!billId) return;
      const [selectedBill, splitResponse] = await Promise.all([
        window.api.bills.get(Number(billId)),
        window.api.bills.getOrCreateSplit(Number(billId)),
      ]);
      const activeTenants = await window.api.tenants.active();
      const splitDetails = splitResponse ? await window.api.splits.get(splitResponse.id) : null;
      const rowsFromDb = splitDetails?.rows ?? splitDetails?.split?.rows ?? [];
      setBill(selectedBill);
      setSplit(splitDetails?.split ?? splitResponse);
      if (rowsFromDb.length > 0) {
        setRows(
          sortByRoomNo(rowsFromDb).map((row: any) => ({
            id: row.id,
            tenant_id: row.tenant_id,
            tenant_name: row.tenant_name,
            room_no: row.room_no,
            phone: row.phone,
            previous_reading: row.previous_reading,
            present_reading: row.present_reading,
            fixed_adjust: row.fixed_adjust ?? 0,
            fixed_unit:
              row.fixed_unit ||
              ((row.fixed_unit_price || selectedBill?.fixed_unit_price || 0) > 0
                ? ((row.fixed_charge_calc ?? 0) + (row.fixed_adjust ?? 0)) / (row.fixed_unit_price || selectedBill?.fixed_unit_price)
                : 0),
            fixed_unit_price: row.fixed_unit_price || selectedBill?.fixed_unit_price || 0,
            energy_unit_price: row.energy_unit_price || selectedBill?.energy_unit_price || 0,
            energy_adjust: row.energy_adjust ?? 0,
            extra_adjust: row.extra_adjust ?? 0,
            extra_unit_price: row.extra_unit_price || selectedBill?.extra_unit_price || 0,
            extra_unit_adjust: row.extra_unit_adjust ?? 0,
            tax_adjust: row.tax_adjust ?? 0,
            interest_adjust: row.interest_adjust ?? 0,
            other_adjust: row.other_adjust ?? 0,
            maintenance_fee: row.maintenance_fee ?? 0,
            generator_fee: row.generator_fee ?? 0,
            management_extra_fee: row.management_extra_fee ?? 0,
            other_charge_calc: row.other_charge_calc,
            payable: row.payable,
            payment_status: row.payment_status ?? 'pending',
            payment_date: row.payment_date ?? null,
            whatsapp_sent_at: row.whatsapp_sent_at ?? null,
            whatsapp_message_id: row.whatsapp_message_id ?? null,
          })),
        );
        return;
      }
      setRows(
        sortByRoomNo(activeTenants).map((tenant) => ({
          tenant_id: tenant.id,
          tenant_name: tenant.name,
          room_no: tenant.room_no,
          phone: tenant.phone,
          previous_reading: tenant.present_reading ?? 0,
          present_reading: tenant.present_reading ?? 0,
          fixed_adjust: 0,
          fixed_unit: 0,
          fixed_unit_price: selectedBill?.fixed_unit_price ?? 0,
          energy_unit_price: selectedBill?.energy_unit_price ?? 0,
          energy_adjust: 0,
          extra_adjust: 0,
          extra_unit_price: selectedBill?.extra_unit_price ?? 0,
          extra_unit_adjust: 0,
          tax_adjust: 0,
          interest_adjust: 0,
          other_adjust: 0,
          maintenance_fee: tenant.maintenance_fees ?? 0,
          generator_fee: tenant.generator_fees ?? 0,
          management_extra_fee: 0,
          payment_status: 'pending',
          payment_date: null,
          whatsapp_sent_at: null,
          whatsapp_message_id: null,
        })),
      );
    })();
  }, [billId]);

  const calc = useMemo(
    () =>
      bill
        ? calculateSplit({
            bill: {
              fixed_charge: isManual ? 0 : bill.fixed_charge,
              energy_charge: isManual ? 0 : bill.energy_charge,
              energy_unit_price: bill.energy_unit_price,
              extra_charge: isManual ? 0 : bill.extra_charge,
              extra_unit_price: bill.extra_unit_price,
              extra_unit_charge: isManual ? 0 : bill.extra_unit_charge,
              tax: isManual ? 0 : bill.tax,
              interest_charge: isManual ? 0 : bill.interest_charge,
              other_charge: isManual ? 0 : bill.other_charge,
            },
            split: { tax_rate: bill.tax_percent },
            rows,
          })
        : null,
    [bill, isManual, rows],
  );

  const updateManualBillValue = (
    field: 'tax_percent' | 'energy_unit_price' | 'fixed_unit_price' | 'extra_unit_price',
    value: number,
  ) => {
    setRows((current) =>
      current.map((row) => {
        if (field === 'fixed_unit_price') {
          return {
            ...row,
            fixed_unit_price: value,
            fixed_adjust: Number((row.fixed_unit * value).toFixed(2)),
          };
        }
        if (field === 'energy_unit_price') {
          return { ...row, energy_unit_price: value, energy_adjust: 0 };
        }
        if (field === 'extra_unit_price') {
          return { ...row, extra_unit_price: value, extra_unit_adjust: 0 };
        }
        return { ...row, tax_adjust: 0 };
      }),
    );
    setBill((current) => {
      if (!current) return current;
      if (field === 'extra_unit_price') {
        return { ...current, extra_unit_price: value, extra_unit_charge: Number((current.energy_unit * value).toFixed(2)) };
      }
      return { ...current, [field]: value };
    });
  };

  const updateRow = (
    tenantId: number,
    field: keyof Pick<
      RowState,
      | 'previous_reading'
      | 'present_reading'
      | 'fixed_adjust'
      | 'fixed_unit'
      | 'fixed_unit_price'
      | 'energy_unit_price'
      | 'energy_adjust'
      | 'extra_adjust'
      | 'extra_unit_price'
      | 'extra_unit_adjust'
      | 'tax_adjust'
      | 'interest_adjust'
      | 'other_adjust'
      | 'maintenance_fee'
      | 'generator_fee'
      | 'management_extra_fee'
    >,
    value: number,
  ) => {
    setRows((prev) =>
      prev.map((item) => {
        if (item.tenant_id !== tenantId) return item;
        const updated = { ...item, [field]: value };
        if (isManual && (field === 'previous_reading' || field === 'present_reading')) {
          const consumedUnit = Math.max(0, updated.present_reading - updated.previous_reading);
          const fixedUnit = computeAutoFixedUnit(consumedUnit);
          updated.fixed_unit = fixedUnit;
          updated.fixed_adjust = Number((fixedUnit * updated.fixed_unit_price).toFixed(2));
        }
        return updated;
      }),
    );
  };

  const getCalculatedAmount = (row: any, field: EditableField) => {
    switch (field) {
      case 'fixed_adjust':
        return row.fixed_charge_calc ?? 0;
      case 'extra_adjust':
        return row.extra_charge_calc ?? 0;
      case 'extra_unit_adjust':
        return row.extra_unit_charge_calc ?? 0;
      case 'interest_adjust':
        return row.interest_charge_calc ?? 0;
      case 'other_adjust':
        return row.other_charge_calc ?? 0;
    }
  };

  const getFinalAmount = (src: RowState, row: any, field: EditableField) => {
    return getCalculatedAmount(row, field) + (src[field] ?? 0);
  };

  const getFixedUnitAmount = (fixedAmount: number) => {
    const fixedUnitPrice = bill?.fixed_unit_price ?? 0;
    return fixedUnitPrice > 0 ? fixedAmount / fixedUnitPrice : 0;
  };

  const openChargeEditor = (src: RowState, row: any, field: EditableField) => {
    setEditingCell({
      tenant_id: src.tenant_id,
      field,
      value: getFinalAmount(src, row, field).toFixed(2),
    });
  };

  const commitChargeEditor = (src: RowState, row: any) => {
    if (!editingCell || editingCell.tenant_id !== src.tenant_id) return;
    const finalAmount = Number.parseFloat(editingCell.value);
    if (Number.isFinite(finalAmount)) {
      updateRow(src.tenant_id, editingCell.field, Number((finalAmount - getCalculatedAmount(row, editingCell.field)).toFixed(2)));
    }
    setEditingCell(null);
  };

  const renderChargeCell = (src: RowState, row: any, field: EditableField) => {
    const calculated = getCalculatedAmount(row, field);
    const finalAmount = getFinalAmount(src, row, field);
    const isEditing =
      editingCell?.tenant_id === src.tenant_id && editingCell.field === field && !editingCell.value.startsWith('unit:');

    if (isEditing) {
      return (
        <input
          autoFocus
          className="w-full rounded-lg border border-white/10 bg-slate-950 px-2 py-1 text-white"
          type="number"
          step="0.01"
          value={editingCell.value}
          onChange={(e) => setEditingCell((prev) => (prev ? { ...prev, value: e.target.value } : prev))}
          onBlur={() => commitChargeEditor(src, row)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              commitChargeEditor(src, row);
            }
            if (e.key === 'Escape') {
              setEditingCell(null);
            }
          }}
        />
      );
    }

    return (
      <button
        type="button"
        className="flex w-full flex-col rounded-lg px-2 py-1 text-left text-white transition hover:bg-white/5"
        onClick={() => openChargeEditor(src, row, field)}
      >
        <span>{finalAmount.toFixed(2)}</span>
        <span className="text-[10px] text-slate-500">calc {calculated.toFixed(2)}</span>
      </button>
    );
  };

  const renderFixedUnitCell = (src: RowState, row: any) => {
    const calculatedFixed = getCalculatedAmount(row, 'fixed_adjust');
    const finalFixed = getFinalAmount(src, row, 'fixed_adjust');
    const calculatedUnit = getFixedUnitAmount(calculatedFixed);
    const finalUnit = getFixedUnitAmount(finalFixed);
    const isEditing = editingCell?.tenant_id === src.tenant_id && editingCell.field === 'fixed_adjust' && editingCell.value.startsWith('unit:');

    if (isEditing) {
      return (
        <input
          autoFocus
          className="w-full rounded-lg border border-white/10 bg-slate-950 px-2 py-1 text-white"
          type="number"
          step="0.01"
          value={editingCell.value.replace(/^unit:/, '')}
          onChange={(e) => setEditingCell((prev) => (prev ? { ...prev, value: `unit:${e.target.value}` } : prev))}
          onBlur={() => {
            const unit = Number.parseFloat(editingCell.value.replace(/^unit:/, ''));
            if (Number.isFinite(unit)) {
              const finalFixedAmount = unit * (bill?.fixed_unit_price ?? 0);
              updateRow(src.tenant_id, 'fixed_adjust', Number((finalFixedAmount - calculatedFixed).toFixed(2)));
            }
            setEditingCell(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const unit = Number.parseFloat(editingCell.value.replace(/^unit:/, ''));
              if (Number.isFinite(unit)) {
                const finalFixedAmount = unit * (bill?.fixed_unit_price ?? 0);
                updateRow(src.tenant_id, 'fixed_adjust', Number((finalFixedAmount - calculatedFixed).toFixed(2)));
              }
              setEditingCell(null);
            }
            if (e.key === 'Escape') {
              setEditingCell(null);
            }
          }}
        />
      );
    }

    return (
      <button
        type="button"
        className="flex w-full flex-col rounded-lg px-2 py-1 text-left text-white transition hover:bg-white/5"
        onClick={() =>
          setEditingCell({
            tenant_id: src.tenant_id,
            field: 'fixed_adjust',
            value: `unit:${finalUnit.toFixed(2)}`,
          })
        }
      >
        <span>{finalUnit.toFixed(2)}</span>
        <span className="text-[10px] text-slate-500">calc {calculatedUnit.toFixed(2)}</span>
      </button>
    );
  };

  const renderManualChargeInput = (src: RowState, field: EditableField) => (
    <EmptyableNumberInput
      className="w-full rounded-lg border border-white/10 bg-slate-950 px-2 py-1 text-white"
      value={src[field]}
      onChange={(value) => updateRow(src.tenant_id, field, value)}
    />
  );

  const renderManualFixedUnitInput = (src: RowState) => {
    return (
      <EmptyableNumberInput
        className="w-full rounded-lg border border-white/10 bg-slate-950 px-2 py-1 text-white"
        value={src.fixed_unit}
        onChange={(fixedUnit) => {
          setRows((current) =>
            current.map((row) =>
              row.tenant_id === src.tenant_id
                ? { ...row, fixed_unit: fixedUnit, fixed_adjust: Number((fixedUnit * row.fixed_unit_price).toFixed(2)) }
                : row,
            ),
          );
        }}
      />
    );
  };

  const manualNumberInput = (value: number, onChange: (value: number) => void) => (
    <EmptyableNumberInput
      className="w-full rounded-lg border border-white/10 bg-slate-950 px-2 py-1 text-white"
      value={value}
      onChange={onChange}
    />
  );

  const persistSplit = async (status: 'draft' | 'finalized' | 'sent', options: { trackSubmit?: boolean } = {}) => {
    if (!split || !bill) return;
    const shouldTrackSubmit = options.trackSubmit ?? true;
    if (shouldTrackSubmit) {
      setIsSubmitting(true);
    }
    try {
      if (isManual && calc) {
        const updatedBill: Bill = {
          ...bill,
          entry_mode: 'manual',
          fixed_unit: rows.reduce((sum, row) => sum + row.fixed_unit, 0),
          fixed_charge: calc.totals.fixed_charge,
          energy_unit: calc.totals.consumed_unit,
          energy_charge: calc.totals.energy_charge,
          extra_charge: calc.totals.extra_charge,
          extra_unit_charge: calc.totals.extra_unit_charge,
          tax: calc.totals.tax,
          interest_charge: calc.totals.interest_charge,
          other_charge: calc.totals.other_charge,
          total: calc.totals.payable,
        };
        await window.api.bills.save(updatedBill);
        setBill(updatedBill);
      }
      await window.api.splits.save({
        split_id: split.id,
        status,
        reading_date: split.reading_date,
        tax_rate: bill.tax_percent,
        bill: {
          fixed_charge: isManual ? 0 : bill.fixed_charge,
          energy_charge: isManual ? 0 : bill.energy_charge,
          energy_unit_price: bill.energy_unit_price,
          fixed_unit_price: bill.fixed_unit_price,
          extra_charge: isManual ? 0 : bill.extra_charge,
          extra_unit_price: bill.extra_unit_price,
          extra_unit_charge: isManual ? 0 : bill.extra_unit_charge,
          tax: isManual ? 0 : bill.tax,
          interest_charge: isManual ? 0 : bill.interest_charge,
          other_charge: isManual ? 0 : bill.other_charge,
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
      if (status !== 'draft') {
        const splitDetails = await window.api.splits.get(split.id);
        setSplit(splitDetails?.split ?? splitDetails ?? split);
        if (splitDetails?.rows?.length) {
          setRows(
            sortByRoomNo(splitDetails.rows).map((row: any) => ({
              id: row.id,
              tenant_id: row.tenant_id,
              tenant_name: row.tenant_name,
              room_no: row.room_no,
              phone: row.phone,
              previous_reading: row.previous_reading,
              present_reading: row.present_reading,
              fixed_adjust: row.fixed_adjust ?? 0,
              fixed_unit:
                row.fixed_unit ||
                ((row.fixed_unit_price || bill.fixed_unit_price) > 0
                  ? ((row.fixed_charge_calc ?? 0) + (row.fixed_adjust ?? 0)) / (row.fixed_unit_price || bill.fixed_unit_price)
                  : 0),
              fixed_unit_price: row.fixed_unit_price || bill.fixed_unit_price,
              energy_unit_price: row.energy_unit_price || bill.energy_unit_price,
              energy_adjust: row.energy_adjust ?? 0,
              extra_adjust: row.extra_adjust ?? 0,
              extra_unit_price: row.extra_unit_price || bill.extra_unit_price,
              extra_unit_adjust: row.extra_unit_adjust ?? 0,
              tax_adjust: row.tax_adjust ?? 0,
              interest_adjust: row.interest_adjust ?? 0,
              other_adjust: row.other_adjust ?? 0,
              maintenance_fee: row.maintenance_fee ?? 0,
              generator_fee: row.generator_fee ?? 0,
              management_extra_fee: row.management_extra_fee ?? 0,
              other_charge_calc: row.other_charge_calc,
              payable: row.payable,
              payment_status: row.payment_status ?? 'pending',
              payment_date: row.payment_date ?? null,
              whatsapp_sent_at: row.whatsapp_sent_at ?? null,
              whatsapp_message_id: row.whatsapp_message_id ?? null,
            })),
          );
        }
      }
    } finally {
      if (shouldTrackSubmit) {
        setIsSubmitting(false);
      }
    }
  };

  const finalizedRows = useMemo(
    () =>
      (calc?.rows ?? []).map((row: any) => {
        const sourceRow = rows.find((item) => item.tenant_id === row.tenant_id);
        return {
          ...row,
          id: sourceRow?.id,
          payment_status: sourceRow?.payment_status ?? 'pending',
          payment_date: sourceRow?.payment_date ?? null,
          whatsapp_sent_at: sourceRow?.whatsapp_sent_at ?? null,
          whatsapp_message_id: sourceRow?.whatsapp_message_id ?? null,
        } as RowState;
      }),
    [calc, rows],
  );

  const finalizedSummary = useMemo(() => {
    return {
      totalToCollect: finalizedRows.reduce((sum, row) => sum + (row.payable ?? 0), 0),
      totalCollected: finalizedRows.filter((row) => row.payment_status === 'paid').reduce((sum, row) => sum + (row.payable ?? 0), 0),
      pendingCount: finalizedRows.filter((row) => row.payment_status !== 'paid').length,
      sentCount: finalizedRows.filter((row) => Boolean(row.whatsapp_sent_at)).length,
    };
  }, [finalizedRows]);

  const openReminder = (row: RowState) => {
    setReminder({ open: true, row, sending: false, error: null });
  };

  const closeReminder = () => {
    setReminder({ open: false, row: null, sending: false, error: null });
  };

  const sendReminder = async () => {
    if (!reminder.row?.id) return;
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

  const togglePayment = async (row: RowState) => {
    if (!row.id) return;
    const nextStatus: PaymentStatus = row.payment_status === 'paid' ? 'pending' : 'paid';
    const paymentDate = nextStatus === 'paid' ? todayIso() : null;
    setPaymentUpdatingId(row.id);
    try {
      await window.api.tenants.updateBillPayment(row.id, nextStatus, null, paymentDate);
      setRows((current) => current.map((item) =>
        item.id === row.id ? { ...item, payment_status: nextStatus, payment_date: paymentDate } : item,
      ));
    } catch (error: any) {
      window.alert(error?.message ?? 'Failed to update payment');
    } finally {
      setPaymentUpdatingId(null);
    }
  };

  const handleSend = async () => {
    if (!split || !bill) return;
    setModalAction('send');
    try {
      await persistSplit('finalized', { trackSubmit: false });
      await window.api.whatsapp.sendAll(split.id);
      setIsFinalizeModalOpen(false);
    } finally {
      setModalAction(null);
    }
  };

  const handleDownload = async () => {
    if (!split || !bill) return;
    setModalAction('download');
    setExportMessage(null);
    try {
      await persistSplit('finalized', { trackSubmit: false });
      const result = await window.api.splits.downloadAll(split.id);
      if (result?.ok) {
        setExportMessage(`Downloaded ${result.fileCount} bill PDF${result.fileCount === 1 ? '' : 's'}.`);
        setIsFinalizeModalOpen(false);
      } else if (result?.canceled) {
        setExportMessage('Download canceled.');
      }
    } catch (error: any) {
      setExportMessage(error?.message ?? 'Download failed. Please try again.');
    } finally {
      setModalAction(null);
    }
  };

  const handlePrint = async () => {
    if (!split || !bill) return;
    setModalAction('print');
    try {
      if (typeof window.api.splits.printRows !== 'function') {
        throw new Error('Billify was updated while it was open. Close every Billify window and reopen the desktop app to enable printing.');
      }
      await persistSplit('finalized', { trackSubmit: false });
      await window.api.splits.printRows(split.id);
      setIsFinalizeModalOpen(false);
    } catch (error: any) {
      setExportMessage(error?.message ?? 'Unable to open the print window.');
    } finally {
      setModalAction(null);
    }
  };

  const runRowAction = async (action: 'download' | 'print' | 'send', ids: number[]) => {
    if (!split || !ids.length) return;
    setRowAction(action);
    setOpenActionId(null);
    try {
      if (action === 'download') {
        if (typeof window.api.splits.downloadRows !== 'function') {
          throw new Error('Billify was updated while it was open. Close every Billify window and reopen the desktop app to enable downloads.');
        }
        const result = await window.api.splits.downloadRows(split.id, ids);
        setExportMessage(result?.canceled ? 'Download canceled.' : `Downloaded ${result?.fileCount ?? ids.length} invoice PDF${ids.length === 1 ? '' : 's'}.`);
      }
      if (action === 'print') {
        if (typeof window.api.splits.printRows !== 'function') {
          throw new Error('Billify was updated while it was open. Close every Billify window and reopen the desktop app to enable printing.');
        }
        await window.api.splits.printRows(split.id, ids);
      }
      if (action === 'send') {
        if (typeof window.api.whatsapp.sendRows !== 'function') {
          throw new Error('Billify was updated while it was open. Close every Billify window and reopen the desktop app to enable sending.');
        }
        const result = await window.api.whatsapp.sendRows(split.id, ids);
        setExportMessage(result?.ok === false ? 'One or more invoices could not be sent.' : `Sent ${ids.length} invoice${ids.length === 1 ? '' : 's'}.`);
      }
    } catch (error: any) {
      setExportMessage(error?.message ?? `${action} failed. Please try again.`);
    } finally {
      setRowAction(null);
    }
  };

  const modalBusy = modalAction !== null;

  return (
    <div className="space-y-6">
      {exportMessage ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
          {exportMessage}
        </div>
      ) : null}

      {bill ? (
        <div className="space-y-4">
          {isManual ? (
            <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
              <div className="grid grid-cols-7 gap-3">
                <div>
                  <div className="text-xs text-slate-400">Bill period</div>
                  <div className="mt-2 text-sm text-white">{bill.period_month}/{bill.period_year}</div>
                </div>
                <label>
                  <div className="text-xs text-slate-400">Reading date</div>
                  <input
                    type="date"
                    className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-2 py-1.5 text-sm text-white"
                    value={split?.reading_date ?? ''}
                    onChange={(event) => setSplit((current: any) => ({ ...current, reading_date: event.target.value }))}
                  />
                </label>
                <div>
                  <div className="text-xs text-slate-400">Total tenants</div>
                  <div className="mt-2 text-sm text-white">{rows.length}</div>
                </div>
                <label>
                  <div className="text-xs text-slate-400">Tax %</div>
                  <EmptyableNumberInput
                    className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-2 py-1.5 text-sm text-white"
                    value={bill.tax_percent}
                    onChange={(value) => updateManualBillValue('tax_percent', value)}
                  />
                </label>
                <label>
                  <div className="text-xs text-slate-400">Consumed unit price</div>
                  <EmptyableNumberInput
                    className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-2 py-1.5 text-sm text-white"
                    value={bill.energy_unit_price}
                    onChange={(value) => updateManualBillValue('energy_unit_price', value)}
                  />
                </label>
                <label>
                  <div className="text-xs text-slate-400">Fixed unit price</div>
                  <EmptyableNumberInput
                    className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-2 py-1.5 text-sm text-white"
                    value={bill.fixed_unit_price}
                    onChange={(value) => updateManualBillValue('fixed_unit_price', value)}
                  />
                </label>
                <label>
                  <div className="text-xs text-slate-400">Extra unit price</div>
                  <EmptyableNumberInput
                    className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-2 py-1.5 text-sm text-white"
                    value={bill.extra_unit_price}
                    onChange={(value) => updateManualBillValue('extra_unit_price', value)}
                  />
                </label>
              </div>
            </div>
          ) : <>
          <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
            <div className="grid gap-3 lg:grid-cols-12">
              <div className="rounded-2xl border border-white/10 bg-slate-950/35 px-4 py-3 lg:col-span-12">
                <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <div className="min-w-0">
                    <div className="text-xs text-slate-400">Bill period</div>
                    <div className="mt-1 truncate text-white">
                      {bill.period_month}/{bill.period_year}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs text-slate-400">Main total</div>
                    <div className="mt-1 truncate text-white">Rs {bill.total.toFixed(2)}</div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs text-slate-400">Tenants</div>
                    <div className="mt-1 truncate text-white">{rows.length}</div>
                  </div>
                  <label className="min-w-0">
                    <div className="text-xs text-slate-400">Reading date</div>
                    <input
                      type="date"
                      className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-2 py-1.5 text-sm text-white"
                      value={split?.reading_date ?? ''}
                      onChange={(e) => setSplit((prev: any) => ({ ...prev, reading_date: e.target.value }))}
                    />
                  </label>
                </div>
              </div>
            
             
              <div className="rounded-2xl border border-cyan-400/15 bg-cyan-400/5 px-4 py-3 text-sm lg:col-span-4">
                <div className="text-xs text-slate-400">Consumed summary</div>
                <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-white">
                  <span>{bill.energy_unit.toFixed(2)} units</span>
                  <span className="text-slate-500">x</span>
                  <span>Rs {bill.energy_unit_price.toFixed(2)}</span>
                  <span className="text-slate-500">=</span>
                  <span className="font-semibold text-cyan-100">Rs {bill.energy_charge.toFixed(2)}</span>
                </div>
              </div>
                <div className="rounded-2xl border border-violet-400/15 bg-violet-400/5 px-4 py-3 text-sm lg:col-span-3">
                <div className="text-xs text-slate-400">Fixed summary</div>
                <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-white">
                  <span>{bill.fixed_unit.toFixed(2)} units</span>
                  <span className="text-slate-500">x</span>
                  <span>Rs {bill.fixed_unit_price.toFixed(2)}</span>
                  <span className="text-slate-500">=</span>
                  <span className="font-semibold text-violet-100">Rs {bill.fixed_charge.toFixed(2)}</span>
                </div>
              </div>
                <div className="rounded-2xl border border-teal-400/15 bg-teal-400/5 px-4 py-3 text-sm lg:col-span-3">
                <div className="text-xs text-slate-400">Extra unit summary</div>
                <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-white">
                  <span>{bill.energy_unit.toFixed(2)} units</span>
                  <span className="text-slate-500">x</span>
                  <span>Rs {bill.extra_unit_price.toFixed(2)}</span>
                  <span className="text-slate-500">=</span>
                  <span className="font-semibold text-teal-100">Rs {bill.extra_unit_charge.toFixed(2)}</span>
                </div>
              </div>
               <div className="rounded-2xl border border-amber-400/15 bg-amber-400/5 px-4 py-3 text-sm lg:col-span-2">
                <div className="text-xs text-slate-400">Tax summary</div>
                <div className="mt-2 flex items-baseline gap-2 whitespace-nowrap text-white">
                  <span>{bill.tax_percent.toFixed(2)}%</span>
                  <span className="text-slate-500">=</span>
                  <span className="font-semibold text-amber-100">Rs {bill.tax.toFixed(2)}</span>
                </div>
              </div>
            
                <div className="rounded-2xl border border-rose-400/15 bg-rose-400/5 px-4 py-3 lg:col-span-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="min-w-0 text-sm">
                    <div className="text-xs text-slate-400">Extra charge</div>
                    <div className="mt-1 truncate text-white">Rs {bill.extra_charge.toFixed(2)}</div>
                  </div>
                  <div className="min-w-0 text-sm">
                    <div className="text-xs text-slate-400">Interest charge</div>
                    <div className="mt-1 truncate text-white">Rs {bill.interest_charge.toFixed(2)}</div>
                  </div>
                  <div className="min-w-0 text-sm">
                    <div className="text-xs text-slate-400">Other charge</div>
                    <div className="mt-1 truncate text-white">Rs {bill.other_charge.toFixed(2)}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/5">
            <div className="border-b border-white/10 px-5 py-4 text-sm font-medium text-slate-300">Bill Difference</div>
            <table className="table-fixed w-full text-left text-xs">
              <thead className="bg-white/5 text-slate-300">
                <tr>
                  <th className="w-[14%] px-3 py-2">Fixed ({bill.fixed_unit.toFixed(2)} units)</th>
                  <th className="w-[14%] px-3 py-2">Consumed ({bill.energy_unit.toFixed(2)} units)</th>
                  <th className="w-[10%] px-3 py-2">Extra</th>
                  <th className="w-[14%] px-3 py-2">Extra unit</th>
                  <th className="w-[10%] px-3 py-2">Tax</th>
                  <th className="w-[10%] px-3 py-2">Interest</th>
                  <th className="w-[10%] px-3 py-2">Other</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-white/10 text-white">
                  <td className="px-3 py-2">Rs {calc?.reconciliation.fixed_diff.toFixed(2) ?? '0.00'}</td>
                  <td className="px-3 py-2">Rs {calc?.reconciliation.energy_diff.toFixed(2) ?? '0.00'}</td>
                  <td className="px-3 py-2">Rs {calc?.reconciliation.extra_diff.toFixed(2) ?? '0.00'}</td>
                  <td className="px-3 py-2">Rs {calc?.reconciliation.extra_unit_diff.toFixed(2) ?? '0.00'}</td>
                  <td className="px-3 py-2">Rs {calc?.reconciliation.tax_diff.toFixed(2) ?? '0.00'}</td>
                  <td className="px-3 py-2">Rs {calc?.reconciliation.interest_diff.toFixed(2) ?? '0.00'}</td>
                  <td className="px-3 py-2">Rs {calc?.reconciliation.other_diff.toFixed(2) ?? '0.00'}</td>
                </tr>
              </tbody>
            </table>
          </div>
          </>}
        </div>
      ) : null}

      {bill ? (
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-3xl border border-cyan-400/20 bg-cyan-400/5 p-5">
            <div className="text-sm text-slate-400">Total electricity bill</div>
            <div className="mt-2 text-2xl font-semibold text-cyan-200">Rs {(calc?.totals.electricity_total ?? 0).toFixed(2)}</div>
          </div>
          <div className="rounded-3xl border border-violet-400/20 bg-violet-400/5 p-5">
            <div className="text-sm text-slate-400">Total management bill</div>
            <div className="mt-2 text-2xl font-semibold text-violet-200">Rs {(calc?.totals.management_total ?? 0).toFixed(2)}</div>
          </div>
          <div className="rounded-3xl border border-emerald-400/20 bg-emerald-400/5 p-5">
            <div className="text-sm text-slate-400">Total payable</div>
            <div className="mt-2 text-2xl font-semibold text-emerald-200">Rs {(calc?.totals.payable ?? 0).toFixed(2)}</div>
          </div>
        </div>
      ) : null}

      {isFinalizeModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl shadow-black/40">
            <h2 className="text-2xl font-semibold text-white">Finalizing bill</h2>
            <p className="mt-2 text-sm text-slate-400">
              Finalizing this bill will create tenant bills for all active tenants. You can finalize only, download all tenant
              bills into a folder, or send them directly through WhatsApp.
            </p>
            <div className="mt-6 flex flex-nowrap items-center justify-end gap-2">
              <button
                type="button"
                className="mr-auto rounded-xl bg-red-600 px-4 py-2 text-white transition hover:bg-red-500 disabled:opacity-70"
                onClick={() => setIsFinalizeModalOpen(false)}
                disabled={modalBusy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-white transition hover:bg-violet-500 disabled:opacity-70"
                onClick={handlePrint}
                disabled={modalBusy}
              >
                {modalAction === 'print' ? 'Opening print...' : 'Print'}
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-70"
                onClick={async () => {
                  setModalAction('save');
                  try {
                    await persistSplit('finalized', { trackSubmit: false });
                    setIsFinalizeModalOpen(false);
                  } finally {
                    setModalAction(null);
                  }
                }}
                disabled={modalBusy}
              >
                {modalAction === 'save' ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : null}
                {modalAction === 'save' ? 'Saving...' : 'Save'}
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-4 py-2 text-white transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-70"
                onClick={handleDownload}
                disabled={modalBusy}
              >
                {modalAction === 'download' ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : null}
                {modalAction === 'download' ? 'Downloading...' : 'Download PDFs'}
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2 text-white transition hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-70"
                onClick={handleSend}
                disabled={modalBusy}
              >
                {modalAction === 'send' ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : null}
                {modalAction === 'send' ? 'Sending...' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div
        className="min-w-0 overflow-hidden rounded-3xl border border-white/10 bg-white/5 [&_input]:min-w-0 [&_input]:px-1.5"
        onKeyDown={moveSplitInputFocus}
      >
        <table className="w-full table-fixed text-left text-[11px]">
          <thead className="bg-white/5 text-slate-300">
            <tr>
              <th className="w-[10%] border-r border-white/20 px-2 py-3">Details</th>
              <th className="w-[11%] border-r border-white/20 px-2 py-3">Readings</th>
              <th className="w-[13%] border-r border-white/20 px-2 py-3">Consumed</th>
              <th className="w-[13%] border-r border-white/20 px-2 py-3">Fixed</th>
              <th className="w-[13%] border-r border-white/20 px-2 py-3">Extra Unit</th>
              <th className="w-[12%] border-r border-white/20 px-2 py-3">Additional</th>
              <th className="w-[15%] border-r border-white/20 px-2 py-3">Management</th>
              <th className="w-[13%] bg-emerald-400/10 px-2 py-3 text-emerald-100">Totals</th>
            </tr>
          </thead>
          <tbody>
            {(calc?.rows ?? []).map((row) => {
              const src = rows.find((item) => item.tenant_id === row.tenant_id)!;
              const field = (label: string, content: ReactNode) => (
                <div className="space-y-1">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
                  <div>{content}</div>
                </div>
              );
              return (
                <tr key={row.tenant_id} className="border-t border-white/10 align-top">
                  <td className="min-w-0 border-r border-white/10 px-2 py-3">
                    <div className="font-semibold text-white">{src.room_no}</div>
                    <div className="mt-2 truncate text-slate-300" title={src.tenant_name}>{src.tenant_name}</div>
                  </td>
                  <td className="min-w-0 border-r border-white/10 px-2 py-3">
                    <div className="space-y-3">
                      {field('Previous', <EmptyableNumberInput className="w-full rounded-lg border border-white/10 bg-slate-950 px-2 py-1 text-white" value={src.previous_reading} onChange={(value) => updateRow(src.tenant_id, 'previous_reading', value)} />)}
                      {field('Present', <EmptyableNumberInput inputRole="present" className="w-full rounded-lg border border-white/10 bg-slate-950 px-2 py-1 text-white" value={src.present_reading} onChange={(value) => updateRow(src.tenant_id, 'present_reading', value)} />)}
                    </div>
                  </td>
                  <td className="min-w-0 border-r border-white/10 px-2 py-3">
                    <div className="space-y-3">
                      {field('Used', isManual ? manualNumberInput(row.consumed_unit, (value) => updateRow(src.tenant_id, 'present_reading', Number((src.previous_reading + value).toFixed(2)))) : <span className="text-white">{row.consumed_unit.toFixed(2)}</span>)}
                      {field('Unit price', isManual ? manualNumberInput(src.energy_unit_price, (value) => setRows((current) => current.map((item) => item.tenant_id === src.tenant_id ? { ...item, energy_unit_price: value, energy_adjust: 0 } : item))) : <span className="text-white">{bill?.energy_unit_price.toFixed(2) ?? '0.00'}</span>)}
                      {field('Charge', isManual ? manualNumberInput(row.energy_charge, (value) => updateRow(src.tenant_id, 'energy_adjust', Number((value - row.energy_charge_calc).toFixed(2)))) : <span className="text-white">{row.energy_charge.toFixed(2)}</span>)}
                    </div>
                  </td>
                  <td className="min-w-0 border-r border-white/10 px-2 py-3">
                    <div className="space-y-3">
                      {field('Units', isManual ? renderManualFixedUnitInput(src) : renderFixedUnitCell(src, row))}
                      {field('Unit price', isManual ? manualNumberInput(src.fixed_unit_price, (value) => setRows((current) => current.map((item) => item.tenant_id === src.tenant_id ? { ...item, fixed_unit_price: value, fixed_adjust: Number((item.fixed_unit * value).toFixed(2)) } : item))) : <span className="text-white">{bill?.fixed_unit_price.toFixed(2) ?? '0.00'}</span>)}
                      {field('Charge', isManual ? manualNumberInput(src.fixed_adjust, (value) => setRows((current) => current.map((item) => item.tenant_id === src.tenant_id ? { ...item, fixed_adjust: value, fixed_unit: item.fixed_unit_price > 0 ? Number((value / item.fixed_unit_price).toFixed(2)) : item.fixed_unit } : item))) : renderChargeCell(src, row, 'fixed_adjust'))}
                    </div>
                  </td>
                  <td className="min-w-0 border-r border-white/10 px-2 py-3">
                    <div className="space-y-3">
                      {field('Unit', <span className="text-white">{row.consumed_unit.toFixed(2)}</span>)}
                      {field('Unit price', isManual ? manualNumberInput(src.extra_unit_price, (value) => setRows((current) => current.map((item) => item.tenant_id === src.tenant_id ? { ...item, extra_unit_price: value, extra_unit_adjust: 0 } : item))) : <span className="text-white">{bill?.extra_unit_price.toFixed(2) ?? '0.00'}</span>)}
                      {field('Charge', isManual ? manualNumberInput(row.extra_unit_charge, (value) => updateRow(src.tenant_id, 'extra_unit_adjust', Number((value - row.extra_unit_charge_calc).toFixed(2)))) : renderChargeCell(src, row, 'extra_unit_adjust'))}
                    </div>
                  </td>
                  <td className="min-w-0 border-r border-white/10 px-2 py-3">
                    <div className="space-y-3">
                      {field('Tax', isManual ? manualNumberInput(row.tax, (value) => updateRow(src.tenant_id, 'tax_adjust', Number((value - (row.tax - src.tax_adjust)).toFixed(2)))) : <span className="text-white">{row.tax.toFixed(2)}</span>)}
                      {field('Interest', isManual ? renderManualChargeInput(src, 'interest_adjust') : renderChargeCell(src, row, 'interest_adjust'))}
                      {field('Other', isManual ? renderManualChargeInput(src, 'other_adjust') : renderChargeCell(src, row, 'other_adjust'))}
                    </div>
                  </td>
                  <td className="min-w-0 border-r border-white/10 px-2 py-3">
                    <div className="space-y-3">
                      {field('Maintenance', manualNumberInput(src.maintenance_fee, (value) => updateRow(src.tenant_id, 'maintenance_fee', value)))}
                      {field('Generator', manualNumberInput(src.generator_fee, (value) => updateRow(src.tenant_id, 'generator_fee', value)))}
                      {field('Extra fee', manualNumberInput(src.management_extra_fee, (value) => updateRow(src.tenant_id, 'management_extra_fee', value)))}
                    </div>
                  </td>
                  <td className="min-w-0 bg-emerald-400/10 px-2 py-3">
                    <div className="space-y-4">
                      {field('Subtotal', <span className="font-semibold text-orange-100">{row.electricity_total.toFixed(2)}</span>)}
                      {field('Management fees', <span className="font-semibold text-sky-100">{row.management_total.toFixed(2)}</span>)}
                      {field('Payable', <span className="font-semibold text-emerald-100">{row.payable.toFixed(2)}</span>)}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t border-white/10 bg-white/5 text-white">
            <tr>
              <td className="px-3 py-3 text-right font-semibold text-slate-300" colSpan={7}>Total Payable</td>
              <td className="bg-emerald-400/10 px-3 py-3 font-semibold text-emerald-100">Rs {(calc?.totals.payable ?? 0).toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          className="rounded-xl bg-white/10 px-4 py-2 text-white"
          onClick={() => persistSplit(split?.status && split.status !== 'draft' ? split.status : 'draft')}
          disabled={isSubmitting}
        >
          {split?.status && split.status !== 'draft' ? 'Save Changes' : 'Save Draft'}
        </button>
        <button
          className="rounded-xl bg-brand-500 px-4 py-2 text-white"
          onClick={() => setIsFinalizeModalOpen(true)}
          disabled={isSubmitting}
        >
          Finalize
        </button>
      </div>

      {split?.status === 'finalized' || split?.status === 'sent' ? (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="rounded-3xl border border-white/10 bg-[#0b1023] p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
              <div className="text-sm text-slate-400">Total to collect</div>
              <div className="mt-2 text-2xl font-semibold text-white">Rs {finalizedSummary.totalToCollect.toFixed(2)}</div>
            </div>
            <div className="rounded-3xl border border-white/10 bg-[#0b1023] p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
              <div className="text-sm text-slate-400">Total collected</div>
              <div className="mt-2 text-2xl font-semibold text-emerald-300">Rs {finalizedSummary.totalCollected.toFixed(2)}</div>
            </div>
            <div className="rounded-3xl border border-white/10 bg-[#0b1023] p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
              <div className="text-sm text-slate-400">Pending count</div>
              <div className="mt-2 text-2xl font-semibold text-amber-300">{finalizedSummary.pendingCount}</div>
            </div>
            <div className="rounded-3xl border border-white/10 bg-[#0b1023] p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
              <div className="text-sm text-slate-400">Sent count</div>
              <div className="mt-2 text-2xl font-semibold text-sky-300">{finalizedSummary.sentCount}</div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5">
            {selectedBillIds.length ? (
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
                <span className="text-sm text-slate-300">{selectedBillIds.length} selected</span>
                <div className="flex gap-2">
                  <button className="rounded-lg bg-cyan-600 px-3 py-2 text-xs text-white transition hover:bg-cyan-500 disabled:opacity-60" disabled={Boolean(rowAction)} onClick={() => void runRowAction('download', selectedBillIds)}>Download</button>
                  <button className="rounded-lg bg-violet-600 px-3 py-2 text-xs text-white transition hover:bg-violet-500 disabled:opacity-60" disabled={Boolean(rowAction)} onClick={() => void runRowAction('print', selectedBillIds)}>Print</button>
                  <button className="rounded-lg bg-brand-500 px-3 py-2 text-xs text-white transition hover:bg-brand-400 disabled:opacity-60" disabled={Boolean(rowAction)} onClick={() => void runRowAction('send', selectedBillIds)}>Send</button>
                </div>
              </div>
            ) : null}
            <table className="w-full text-left text-sm">
              <thead className="bg-white/5 text-slate-300">
                <tr>
                  <th className="w-10 px-3 py-3">
                    <input
                      type="checkbox"
                      checked={Boolean(finalizedRows.length) && finalizedRows.every((row) => row.id && selectedBillIds.includes(row.id))}
                      onChange={(event) => setSelectedBillIds(event.target.checked ? finalizedRows.flatMap((row) => row.id ? [row.id] : []) : [])}
                    />
                  </th>
                  <th className="px-4 py-3">Tenant name (Room)</th>
                  <th className="px-4 py-3">Period</th>
                  <th className="px-4 py-3">Electricity fees</th>
                  <th className="px-4 py-3">Management fees</th>
                  <th className="px-4 py-3">Payable</th>
                  <th className="px-4 py-3">Payment</th>
                  <th className="px-4 py-3">Payment date</th>
                  <th className="px-4 py-3">Reminder</th>
                  <th className="px-4 py-3">Payment update</th>
                  <th className="w-16 px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {finalizedRows.map((row) => {
                  const canRemind = row.payment_status !== 'paid' && Boolean(row.phone);
                  return (
                    <tr key={row.tenant_id} className="border-t border-white/10">
                      <td className="px-3 py-3">
                        <input
                          type="checkbox"
                          checked={Boolean(row.id && selectedBillIds.includes(row.id))}
                          disabled={!row.id}
                          onChange={(event) => row.id && setSelectedBillIds((current) => event.target.checked ? [...current, row.id!] : current.filter((id) => id !== row.id))}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <span className="block truncate" title={row.tenant_name}>
                          {row.tenant_name} ({row.room_no})
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {bill?.period_month ?? '-'}
                        {'/'}
                        {bill?.period_year ?? '-'}
                      </td>
                      <td className="px-4 py-3">Rs {row.electricity_total?.toFixed(2) ?? '0.00'}</td>
                      <td className="px-4 py-3">Rs {row.management_total?.toFixed(2) ?? '0.00'}</td>
                      <td className="px-4 py-3">Rs {row.payable?.toFixed(2) ?? '0.00'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${getPaymentStatusClass(row.payment_status ?? 'pending')}`}>
                          {row.payment_status === 'paid' ? 'Paid' : 'Pending'}
                        </span>
                      </td>
                      <td className="px-4 py-3">{formatDate(row.payment_date ?? null)}</td>
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
                          disabled={paymentUpdatingId === row.id}
                          onClick={() => void togglePayment(row)}
                        >
                          {paymentUpdatingId === row.id ? 'Saving...' : row.payment_status === 'paid' ? 'Unpay' : 'Paid'}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          className="rounded-lg bg-white/10 px-3 py-1.5 text-lg leading-none text-white"
                          onClick={(event) => {
                            if (!row.id) return;
                            if (openActionId === row.id) {
                              setOpenActionId(null);
                              return;
                            }
                            const rect = event.currentTarget.getBoundingClientRect();
                            const menuWidth = 128;
                            const menuHeight = 112;
                            const margin = 8;
                            const openBelow = window.innerHeight - rect.bottom >= menuHeight + margin;
                            setActionMenuPosition({
                              top: openBelow ? rect.bottom + 6 : Math.max(margin, rect.top - menuHeight - 6),
                              left: Math.min(window.innerWidth - menuWidth - margin, Math.max(margin, rect.right - menuWidth)),
                            });
                            setOpenActionId(row.id);
                          }}
                        >...</button>
                        {row.id && openActionId === row.id ? (
                          <div
                            className="fixed z-50 w-32 rounded-xl border border-white/10 bg-slate-900 p-1 shadow-2xl"
                            style={{ top: actionMenuPosition.top, left: actionMenuPosition.left }}
                          >
                            <button className="block w-full rounded-lg bg-cyan-600/20 px-3 py-2 text-left text-xs text-cyan-200 hover:bg-cyan-600/35" onClick={() => void runRowAction('download', [row.id!])}>Download</button>
                            <button className="mt-1 block w-full rounded-lg bg-brand-500/20 px-3 py-2 text-left text-xs text-emerald-200 hover:bg-brand-500/35" onClick={() => void runRowAction('send', [row.id!])}>Send</button>
                            <button className="mt-1 block w-full rounded-lg bg-violet-600/20 px-3 py-2 text-left text-xs text-violet-200 hover:bg-violet-600/35" onClick={() => void runRowAction('print', [row.id!])}>Print</button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <ReminderModal
        open={reminder.open}
        title="Send reminder?"
        message={
          reminder.row
            ? `This will send a WhatsApp reminder to ${reminder.row.tenant_name} for the electricity bill of ${bill?.period_month ?? '-'} / ${bill?.period_year ?? '-'}.`
            : ''
        }
        error={reminder.error}
        busy={reminder.sending}
        onClose={closeReminder}
        onConfirm={sendReminder}
      />

    </div>
  );
}
