import ExcelJS from 'exceljs';
import { useEffect, useMemo, useRef, useState, type FocusEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Tenant } from '../types';

const focusSelectAll = (event: FocusEvent<HTMLInputElement>) => {
  event.currentTarget.select();
};

type ImportRow = {
  rowNumber: number;
  tenant: Partial<Tenant>;
  errors: string[];
};

const importHeaders = ['Room No', 'Name', 'Phone', 'Present Reading', 'Maintenance Fees', 'Generator Fees', 'Status'];
const normalizeHeader = (value: unknown) => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
const cellText = (value: ExcelJS.CellValue) => {
  if (value == null) return '';
  if (typeof value === 'object') {
    if ('text' in value) return String(value.text ?? '').trim();
    if ('result' in value) return String(value.result ?? '').trim();
    if ('richText' in value) return value.richText.map((part) => part.text).join('').trim();
  }
  return String(value).trim();
};

const parseNonNegative = (value: string, label: string, errors: string[]) => {
  if (!value) return 0;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    errors.push(`${label} must be a non-negative number`);
    return 0;
  }
  return parsed;
};

export default function Tenants() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [showDeleted, setShowDeleted] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingTenantId, setEditingTenantId] = useState<number | null>(null);
  const [roomNo, setRoomNo] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [presentReading, setPresentReading] = useState('0.00');
  const [maintenanceFees, setMaintenanceFees] = useState('0.00');
  const [generatorFees, setGeneratorFees] = useState('0.00');
  const [active, setActive] = useState('1');
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importFileName, setImportFileName] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const refresh = async () => {
    setTenants(await window.api.tenants.list());
  };

  const resetForm = () => {
    setEditingTenantId(null);
    setRoomNo('');
    setName('');
    setPhone('');
    setPresentReading('0.00');
    setMaintenanceFees('0.00');
    setGeneratorFees('0.00');
    setActive('1');
  };

  const openAddModal = () => {
    resetForm();
    setIsAddOpen(true);
  };

  const openEditModal = (tenant: Tenant) => {
    setEditingTenantId(tenant.id);
    setRoomNo(tenant.room_no);
    setName(tenant.name);
    setPhone(tenant.phone ?? '');
    setPresentReading((tenant.present_reading ?? 0).toFixed(2));
    setMaintenanceFees((tenant.maintenance_fees ?? 0).toFixed(2));
    setGeneratorFees((tenant.generator_fees ?? 0).toFixed(2));
    setActive(String(tenant.active ?? 1));
    setIsAddOpen(true);
  };

  const handleSoftDelete = async (tenant: Tenant) => {
    const confirmed = window.confirm(`Soft delete ${tenant.name} (${tenant.room_no})? The tenant will become inactive but bill history will remain.`);
    if (!confirmed) return;
    await window.api.tenants.delete(tenant.id);
    refresh();
  };

  useEffect(() => {
    refresh();
  }, []);

  const displayedTenants = useMemo(
    () => tenants
      .filter((tenant) => showDeleted || Boolean(tenant.active))
      .sort((left, right) => left.room_no.localeCompare(right.room_no, undefined, { numeric: true, sensitivity: 'base' })),
    [tenants, showDeleted],
  );

  const downloadTemplate = async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Tenants', { views: [{ state: 'frozen', ySplit: 1 }] });
    sheet.addRow(importHeaders);
    sheet.addRow(['101', 'Example Tenant', '919663680185', 1000, 500, 100, 'Active']);
    sheet.columns = [
      { width: 14 }, { width: 24 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 16 }, { width: 12 },
    ];
    const header = sheet.getRow(1);
    header.height = 24;
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F9D6A' } };
    header.alignment = { vertical: 'middle' };
    sheet.getColumn(4).numFmt = '0.00';
    sheet.getColumn(5).numFmt = '0.00';
    sheet.getColumn(6).numFmt = '0.00';
    const buffer = await workbook.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'Billify-Tenant-Import-Template.xlsx';
    link.click();
    URL.revokeObjectURL(url);
  };

  const downloadReadingSheet = async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Meter Readings', { views: [{ state: 'frozen', ySplit: 1 }] });
    sheet.addRow(['Rm No', 'Name', 'Old', 'New']);
    tenants
      .filter((tenant) => tenant.active)
      .forEach((tenant) => sheet.addRow([
        tenant.room_no,
        tenant.name,
        Number(tenant.present_reading ?? 0),
        null,
      ]));
    sheet.columns = [{ width: 14 }, { width: 26 }, { width: 16 }, { width: 16 }];
    const header = sheet.getRow(1);
    header.height = 24;
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F9D6A' } };
    header.alignment = { vertical: 'middle' };
    sheet.getColumn(3).numFmt = '0.00';
    sheet.getColumn(4).numFmt = '0.00';
    const buffer = await workbook.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'Billify-Meter-Readings.xlsx';
    link.click();
    URL.revokeObjectURL(url);
  };

  const readImportFile = async (file: File) => {
    setImportError(null);
    setImportRows([]);
    setImportFileName(file.name);
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await file.arrayBuffer());
      const sheet = workbook.worksheets[0];
      if (!sheet) throw new Error('The workbook has no worksheets.');

      const headerIndexes = new Map<string, number>();
      sheet.getRow(1).eachCell((cell, columnNumber) => headerIndexes.set(normalizeHeader(cellText(cell.value)), columnNumber));
      const requiredHeaders = ['roomno', 'name'];
      const missing = requiredHeaders.filter((headerName) => !headerIndexes.has(headerName));
      if (missing.length) throw new Error('The sheet must contain Room No and Name columns. Download the template for the correct format.');

      const existingRooms = new Set(tenants.map((tenant) => tenant.room_no.trim().toLowerCase()));
      const sheetRooms = new Set<string>();
      const parsedRows: ImportRow[] = [];
      const valueFor = (row: ExcelJS.Row, headerName: string) => {
        const column = headerIndexes.get(headerName);
        return column ? cellText(row.getCell(column).value) : '';
      };

      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const roomNoValue = valueFor(row, 'roomno');
        const nameValue = valueFor(row, 'name');
        const phoneValue = valueFor(row, 'phone');
        const presentReadingValue = valueFor(row, 'presentreading');
        const maintenanceValue = valueFor(row, 'maintenancefees');
        const generatorValue = valueFor(row, 'generatorfees');
        const statusValue = valueFor(row, 'status').toLowerCase();
        if (![roomNoValue, nameValue, phoneValue, presentReadingValue, maintenanceValue, generatorValue, statusValue].some(Boolean)) return;

        const errors: string[] = [];
        if (!roomNoValue) errors.push('Room No is required');
        if (!nameValue) errors.push('Name is required');
        const normalizedRoom = roomNoValue.toLowerCase();
        if (roomNoValue && existingRooms.has(normalizedRoom)) errors.push('Room No already exists');
        if (roomNoValue && sheetRooms.has(normalizedRoom)) errors.push('Duplicate Room No in sheet');
        if (roomNoValue) sheetRooms.add(normalizedRoom);
        if (statusValue && !['active', 'inactive', '1', '0'].includes(statusValue)) errors.push('Status must be Active or Inactive');

        parsedRows.push({
          rowNumber,
          tenant: {
            room_no: roomNoValue,
            name: nameValue,
            phone: phoneValue || null,
            present_reading: parseNonNegative(presentReadingValue, 'Present Reading', errors),
            maintenance_fees: parseNonNegative(maintenanceValue, 'Maintenance Fees', errors),
            generator_fees: parseNonNegative(generatorValue, 'Generator Fees', errors),
            active: statusValue === 'inactive' || statusValue === '0' ? 0 : 1,
          },
          errors,
        });
      });
      if (!parsedRows.length) throw new Error('No tenant rows were found in the first worksheet.');
      setImportRows(parsedRows);
    } catch (error: any) {
      setImportError(error?.message ?? 'Could not read this Excel file.');
    }
  };

  const importValidRows = async () => {
    const validRows = importRows.filter((row) => row.errors.length === 0);
    if (!validRows.length) return;
    setIsImporting(true);
    setImportError(null);
    try {
      for (const row of validRows) await window.api.tenants.save(row.tenant);
      await refresh();
      setIsBulkOpen(false);
      setImportRows([]);
      setImportFileName('');
    } catch (error: any) {
      setImportError(error?.message ?? 'Bulk import failed.');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-white">Tenants</h1>
          <p className="mt-2 text-slate-400">Manage rooms, names, phone numbers, meter readings, and recurring fees.</p>
        </div>
        <div className="flex flex-col items-end gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-300">
            <input
              className="h-4 w-4 rounded border-white/20 bg-slate-950 accent-emerald-500"
              type="checkbox"
              checked={showDeleted}
              onChange={(event) => setShowDeleted(event.target.checked)}
            />
            Show deleted
          </label>
          <div className="flex flex-wrap justify-end gap-3">
            <button className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-white transition hover:bg-white/10" onClick={() => void downloadReadingSheet()}>
              Download readings Excel
            </button>
            <button className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-white transition hover:bg-white/10" onClick={() => setIsBulkOpen(true)}>
              Bulk upload Excel
            </button>
            <button className="rounded-xl bg-brand-500 px-4 py-2 text-white transition hover:bg-brand-400" onClick={openAddModal}>
              Add Tenant
            </button>
          </div>
        </div>
      </div>

      {isBulkOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl shadow-black/40">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold text-white">Bulk upload tenants</h2>
                <p className="mt-1 text-sm text-slate-400">Upload an .xlsx file using the Billify tenant columns.</p>
              </div>
              <button className="rounded-lg px-2 py-1 text-slate-400 hover:bg-white/5 hover:text-white" onClick={() => setIsBulkOpen(false)}>Close</button>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <button className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-white hover:bg-white/10" onClick={() => void downloadTemplate()}>
                Download template
              </button>
              <button className="rounded-xl bg-brand-500 px-4 py-2 text-white hover:bg-brand-400" onClick={() => fileInputRef.current?.click()}>
                Choose Excel file
              </button>
              <input
                ref={fileInputRef}
                className="hidden"
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void readImportFile(file);
                  event.currentTarget.value = '';
                }}
              />
            </div>
            {importFileName ? <p className="mt-4 text-sm text-slate-300">File: {importFileName}</p> : null}
            {importError ? <div className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{importError}</div> : null}
            {importRows.length ? (
              <>
                <div className="mt-4 flex gap-4 text-sm">
                  <span className="text-emerald-300">Valid: {importRows.filter((row) => !row.errors.length).length}</span>
                  <span className="text-red-300">Invalid: {importRows.filter((row) => row.errors.length).length}</span>
                </div>
                <div className="mt-3 overflow-hidden rounded-2xl border border-white/10">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-white/5 text-slate-300"><tr><th className="px-3 py-2">Row</th><th className="px-3 py-2">Room</th><th className="px-3 py-2">Name</th><th className="px-3 py-2">Result</th></tr></thead>
                    <tbody>{importRows.map((row) => <tr key={row.rowNumber} className="border-t border-white/10"><td className="px-3 py-2">{row.rowNumber}</td><td className="px-3 py-2">{row.tenant.room_no || '-'}</td><td className="px-3 py-2">{row.tenant.name || '-'}</td><td className={`px-3 py-2 ${row.errors.length ? 'text-red-300' : 'text-emerald-300'}`}>{row.errors.length ? row.errors.join('; ') : 'Ready'}</td></tr>)}</tbody>
                  </table>
                </div>
                <div className="mt-6 flex justify-end">
                  <button disabled={isImporting || !importRows.some((row) => !row.errors.length)} className="rounded-xl bg-brand-500 px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-50" onClick={() => void importValidRows()}>
                    {isImporting ? 'Importing...' : `Import ${importRows.filter((row) => !row.errors.length).length} valid tenants`}
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {isAddOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl shadow-black/40">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold text-white">{editingTenantId ? 'Edit tenant' : 'Add tenant'}</h2>
                <p className="mt-1 text-sm text-slate-400">Enter the tenant details, current meter reading, and monthly fee amounts.</p>
              </div>
              <button
                className="rounded-lg px-2 py-1 text-slate-400 transition hover:bg-white/5 hover:text-white"
                onClick={() => {
                  setIsAddOpen(false);
                  resetForm();
                }}
                aria-label="Close add tenant modal"
              >
                Close
              </button>
            </div>

            <form
              className="mt-6"
              onSubmit={async (event) => {
                event.preventDefault();
                await window.api.tenants.save({
                  id: editingTenantId ?? undefined,
                  room_no: roomNo.trim(),
                  name: name.trim(),
                  phone: phone.trim() || null,
                  present_reading: Number(presentReading || 0),
                  maintenance_fees: Number(maintenanceFees || 0),
                  generator_fees: Number(generatorFees || 0),
                  active: Number(active),
                });
                setIsAddOpen(false);
                resetForm();
                refresh();
              }}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-2 text-sm">
                  <span className="text-slate-300">Room no</span>
                  <input
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white outline-none ring-0 transition focus:border-brand-400"
                    value={roomNo}
                    onChange={(e) => setRoomNo(e.target.value)}
                    placeholder="Room no"
                    onFocus={focusSelectAll}
                    required
                  />
                </label>
                <label className="space-y-2 text-sm">
                  <span className="text-slate-300">Name</span>
                  <input
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white outline-none ring-0 transition focus:border-brand-400"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Name"
                    onFocus={focusSelectAll}
                    required
                  />
                </label>
                <label className="space-y-2 text-sm">
                  <span className="text-slate-300">Phone number</span>
                  <input
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white outline-none ring-0 transition focus:border-brand-400"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Phone number"
                    onFocus={focusSelectAll}
                  />
                </label>
                <label className="space-y-2 text-sm">
                  <span className="text-slate-300">Present meter reading</span>
                  <input
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white outline-none ring-0 transition focus:border-brand-400"
                    type="number"
                    min="0"
                    step="0.01"
                    value={presentReading}
                    onChange={(e) => setPresentReading(e.target.value)}
                    placeholder="0"
                    onFocus={focusSelectAll}
                  />
                </label>
                <label className="space-y-2 text-sm">
                  <span className="text-slate-300">Maintenance fees</span>
                  <input
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white outline-none ring-0 transition focus:border-brand-400"
                    type="number"
                    min="0"
                    step="0.01"
                    value={maintenanceFees}
                    onChange={(e) => setMaintenanceFees(e.target.value)}
                    placeholder="0"
                    onFocus={focusSelectAll}
                  />
                </label>
                <label className="space-y-2 text-sm">
                  <span className="text-slate-300">Generator fees</span>
                  <input
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white outline-none ring-0 transition focus:border-brand-400"
                    type="number"
                    min="0"
                    step="0.01"
                    value={generatorFees}
                    onChange={(e) => setGeneratorFees(e.target.value)}
                    placeholder="0"
                    onFocus={focusSelectAll}
                  />
                </label>
                <label className="space-y-2 text-sm">
                  <span className="text-slate-300">Status</span>
                  <select
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white outline-none ring-0 transition focus:border-brand-400"
                    value={active}
                    onChange={(e) => setActive(e.target.value)}
                  >
                    <option value="1">Active</option>
                    <option value="0">Inactive</option>
                  </select>
                </label>
              </div>

              <div className="mt-6 flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-white transition hover:bg-white/10"
                  onClick={() => {
                    setIsAddOpen(false);
                    resetForm();
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-brand-500 px-4 py-2 text-white transition hover:bg-brand-400"
                >
                  {editingTenantId ? 'Update Tenant' : 'Save Tenant'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/5">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/5 text-slate-300">
            <tr>
              <th className="px-4 py-3">Room</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Present reading</th>
              <th className="px-4 py-3">Maintenance fees</th>
              <th className="px-4 py-3">Generator fees</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {displayedTenants.map((tenant) => (
              <tr key={tenant.id} className="border-t border-white/10">
                <td className="px-4 py-3">{tenant.room_no}</td>
                <td className="px-4 py-3">{tenant.name}</td>
                <td className="px-4 py-3">{tenant.phone ?? '-'}</td>
                <td className="px-4 py-3">{tenant.present_reading.toFixed(2)}</td>
                <td className="px-4 py-3">{tenant.maintenance_fees.toFixed(2)}</td>
                <td className="px-4 py-3">{tenant.generator_fees.toFixed(2)}</td>
                <td className="px-4 py-3">{tenant.active ? 'Active' : 'Inactive'}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/10"
                      onClick={() => openEditModal(tenant)}
                    >
                      Edit
                    </button>
                    <button
                      className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-100 transition hover:bg-red-500/20"
                      onClick={() => handleSoftDelete(tenant)}
                      disabled={!tenant.active}
                    >
                      {tenant.active ? 'Delete' : 'Inactive'}
                    </button>
                    <button
                      className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/15"
                      onClick={() => navigate(`/tenants/${tenant.id}/bills`)}
                    >
                      Open
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
