import { useEffect, useMemo, useState, type FocusEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { monthOptions } from '../lib/monthOptions';
import type { ManagementBatchSummary } from '../types';

type FormState = {
  period_month: number;
  period_year: string;
};

type ModalAction = 'save' | 'download' | 'send' | null;
type RowAction = 'rescan' | 'download' | 'send' | null;

const createInitialForm = (): FormState => ({
  period_month: new Date().getMonth() + 1,
  period_year: String(new Date().getFullYear()),
});

const focusSelectAll = (event: FocusEvent<HTMLInputElement>) => {
  event.currentTarget.select();
};

const formatDate = (value: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB');
};

export default function Management() {
  const [batches, setBatches] = useState<ManagementBatchSummary[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(createInitialForm());
  const [formError, setFormError] = useState('');
  const [modalAction, setModalAction] = useState<ModalAction>(null);
  const [rescanBatchId, setRescanBatchId] = useState<number | null>(null);
  const [pageError, setPageError] = useState('');
  const [confirmAction, setConfirmAction] = useState<{ batchId: number; action: RowAction } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const navigate = useNavigate();

  const refresh = async () => {
    setBatches(await window.api.management.listBatches());
  };

  useEffect(() => {
    refresh();
  }, []);

  const activeBatch = useMemo(
    () => batches.find((batch) => batch.period_month === form.period_month && batch.period_year === Number(form.period_year)),
    [batches, form.period_month, form.period_year],
  );

  const closeModal = () => {
    setIsModalOpen(false);
    setForm(createInitialForm());
    setFormError('');
    setModalAction(null);
  };

  const getBatchIdForAction = async () => {
    if (activeBatch) {
      return activeBatch.id;
    }

    const result = await window.api.management.createBatch({
      period_month: form.period_month,
      period_year: Number(form.period_year),
    });
    return result.batchId as number;
  };

  const runModalAction = async (action: Exclude<ModalAction, null>) => {
    setModalAction(action);
    setFormError('');
    try {
      if (action === 'save') {
        await window.api.management.createBatch({
          period_month: form.period_month,
          period_year: Number(form.period_year),
        });
      } else {
        const batchId = await getBatchIdForAction();
        if (action === 'download') {
          await window.api.management.downloadAll(batchId);
        } else {
          await window.api.management.sendAll(batchId);
        }
      }
      closeModal();
      await refresh();
    } catch (error: any) {
      setFormError(error?.message ?? `Failed to ${action} this batch.`);
    } finally {
      setModalAction(null);
    }
  };

  const saveBatch = async () => {
    await runModalAction('save');
  };

  const rescanBatch = async (batchId: number) => {
    setRescanBatchId(batchId);
    setPageError('');
    try {
      await window.api.management.rescanBatch(batchId);
      await refresh();
    } catch (error: any) {
      setPageError(error?.message ?? 'Failed to rescan this batch.');
    } finally {
      setRescanBatchId(null);
    }
  };

  const closeConfirm = () => {
    if (confirmBusy) return;
    setConfirmAction(null);
  };

  const runConfirmedAction = async () => {
    if (!confirmAction) return;
    setConfirmBusy(true);
    setPageError('');
    try {
      if (confirmAction.action === 'rescan') {
        await rescanBatch(confirmAction.batchId);
      } else if (confirmAction.action === 'download') {
        await window.api.management.downloadAll(confirmAction.batchId);
      } else {
        await window.api.management.sendAll(confirmAction.batchId);
        await refresh();
      }
      setConfirmAction(null);
    } catch (error: any) {
      setPageError(error?.message ?? `Failed to ${confirmAction.action} this batch.`);
    } finally {
      setConfirmBusy(false);
    }
  };

  const openModal = () => {
    setForm(createInitialForm());
    setFormError('');
    setPageError('');
    setModalAction(null);
    setIsModalOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-white">Management</h1>
          <p className="mt-2 text-slate-400">Create monthly management batches for tenants with recurring fees.</p>
        </div>
        <button className="rounded-xl bg-brand-500 px-4 py-2 text-white transition hover:bg-brand-400" onClick={openModal}>
          Create batch
        </button>
      </div>

      {pageError ? (
        <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{pageError}</div>
      ) : null}

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl shadow-black/40">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold text-white">Management batch</h2>
                <p className="mt-1 text-sm text-slate-400">Pick the month and year for the batch.</p>
              </div>
              <button
                className="rounded-lg px-2 py-1 text-slate-400 transition hover:bg-white/5 hover:text-white"
                onClick={closeModal}
                aria-label="Close management batch modal"
              >
                Close
              </button>
            </div>

            <div className="mt-6 space-y-4">
              {formError ? (
                <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                  {formError}
                </div>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-2 text-sm text-slate-300">
                  <div>Period month</div>
                  <select
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 pr-10 text-white"
                    value={form.period_month}
                    onChange={(e) => setForm((prev) => ({ ...prev, period_month: Number(e.target.value) }))}
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
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white"
                    value={form.period_year}
                    onChange={(e) => setForm((prev) => ({ ...prev, period_year: e.target.value }))}
                    onFocus={focusSelectAll}
                  />
                </label>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-white transition hover:bg-white/10"
                onClick={closeModal}
                disabled={modalAction !== null}
              >
                Cancel
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-70"
                onClick={saveBatch}
                disabled={modalAction !== null}
              >
                {modalAction === 'save' ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : null}
                {modalAction === 'save' ? 'Saving...' : 'Save'}
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-xl bg-slate-800 px-4 py-2 text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-70"
                onClick={() => runModalAction('download')}
                disabled={modalAction !== null}
              >
                {modalAction === 'download' ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : null}
                {modalAction === 'download' ? 'Downloading...' : 'Download'}
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2 text-white transition hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-70"
                onClick={() => runModalAction('send')}
                disabled={modalAction !== null}
              >
                {modalAction === 'send' ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : null}
                {modalAction === 'send' ? 'Sending...' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmAction ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl shadow-black/40">
            <h2 className="text-2xl font-semibold text-white">Confirm action</h2>
            <p className="mt-2 text-sm text-slate-400">
              {confirmAction.action === 'rescan'
                ? 'This will rescan the batch and sync tenant fees, adding new tenants and removing unpaid rows that no longer belong.'
                : confirmAction.action === 'download'
                  ? 'This will download all management PDFs for this batch.'
                  : 'This will send all management bills for this batch through WhatsApp.'}
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-70"
                onClick={closeConfirm}
                disabled={confirmBusy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2 text-white transition hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-70"
                onClick={runConfirmedAction}
                disabled={confirmBusy}
              >
                {confirmBusy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : null}
                {confirmBusy ? 'Working...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/5">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/5 text-slate-300">
            <tr>
              <th className="px-4 py-3">Period</th>
              <th className="px-4 py-3">Created date</th>
              <th className="px-4 py-3">Total to collect</th>
              <th className="px-4 py-3">Total collected</th>
              <th className="px-4 py-3">Tenants</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {batches.map((batch) => (
              <tr key={batch.id} className="border-t border-white/10">
                <td className="px-4 py-3">
                  {batch.period_month}/{batch.period_year}
                </td>
                <td className="px-4 py-3">{formatDate(batch.created_at)}</td>
                <td className="px-4 py-3">Rs {batch.total_to_collect.toFixed(2)}</td>
                <td className="px-4 py-3">Rs {batch.total_collected.toFixed(2)}</td>
                <td className="px-4 py-3">{batch.tenant_count}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
                      batch.status === 'sent'
                        ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/20'
                        : 'bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/20'
                    }`}
                  >
                    {batch.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/10"
                      onClick={() => navigate(`/management/${batch.id}`)}
                    >
                      Open
                    </button>
                    <button
                      className="rounded-lg bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-200 transition hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-70"
                      onClick={() => setConfirmAction({ batchId: batch.id, action: 'rescan' })}
                      disabled={rescanBatchId === batch.id}
                    >
                      {rescanBatchId === batch.id ? (
                        <span className="inline-flex items-center gap-2">
                          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-amber-200/30 border-t-amber-100" />
                          Scanning...
                        </span>
                      ) : (
                        'Rescan'
                      )}
                    </button>
                    <button
                      className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/15"
                      onClick={() => setConfirmAction({ batchId: batch.id, action: 'download' })}
                    >
                      Download
                    </button>
                    <button
                      className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-brand-400"
                      onClick={() => setConfirmAction({ batchId: batch.id, action: 'send' })}
                    >
                      Send
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
