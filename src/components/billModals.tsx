import type { PaymentMethod, PaymentStatus } from '../types';

const paymentMethodOptions: PaymentMethod[] = ['cash', 'upi', 'card'];

type ReminderModalProps = {
  open: boolean;
  title: string;
  message: string;
  error: string | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

type PaymentUpdateModalProps = {
  open: boolean;
  title: string;
  message: string;
  error: string | null;
  busy: boolean;
  status: PaymentStatus;
  method: PaymentMethod | '';
  paymentDate: string;
  showPaymentDate: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onStatusChange: (status: PaymentStatus) => void;
  onMethodChange: (method: PaymentMethod | '') => void;
  onPaymentDateChange: (paymentDate: string) => void;
};

export function ReminderModal({ open, title, message, error, busy, onClose, onConfirm }: ReminderModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl shadow-black/40">
        <h2 className="text-2xl font-semibold text-white">{title}</h2>
        <p className="mt-2 text-sm text-slate-400">{message}</p>
        {error ? <div className="mt-4 text-sm text-red-300">{error}</div> : null}
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-white transition hover:bg-white/10"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-xl bg-brand-500 px-4 py-2 text-white transition hover:bg-brand-400 disabled:opacity-60"
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function PaymentUpdateModal({
  open,
  title,
  message,
  error,
  busy,
  status,
  method,
  paymentDate,
  showPaymentDate,
  onClose,
  onConfirm,
  onStatusChange,
  onMethodChange,
  onPaymentDateChange,
}: PaymentUpdateModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl shadow-black/40">
        <h2 className="text-2xl font-semibold text-white">{title}</h2>
        <p className="mt-2 text-sm text-slate-400">{message}</p>
        {error ? <div className="mt-4 text-sm text-red-300">{error}</div> : null}

        <div className="mt-6 grid gap-4">
          <label className="space-y-2 text-sm text-slate-300">
            <div>Payment status</div>
            <select
              className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white"
              value={status}
              onChange={(e) => onStatusChange(e.target.value as PaymentStatus)}
            >
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
            </select>
          </label>

          {status === 'paid' ? (
            <>
              <label className="space-y-2 text-sm text-slate-300">
                <div>Payment method</div>
                <select
                  className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white"
                  value={method}
                  onChange={(e) => onMethodChange(e.target.value as PaymentMethod | '')}
                >
                  <option value="">Select method</option>
                  {paymentMethodOptions.map((option) => (
                    <option key={option} value={option}>
                      {option.toUpperCase()}
                    </option>
                  ))}
                </select>
              </label>
              {showPaymentDate ? (
                <label className="space-y-2 text-sm text-slate-300">
                  <div>Payment date</div>
                  <input
                    type="date"
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white"
                    value={paymentDate}
                    onChange={(e) => onPaymentDateChange(e.target.value)}
                  />
                </label>
              ) : null}
            </>
          ) : null}
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-white transition hover:bg-white/10"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-xl bg-brand-500 px-4 py-2 text-white transition hover:bg-brand-400 disabled:opacity-60"
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
