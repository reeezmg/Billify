import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { BrowserWindow } from 'electron';
import { queryAll, queryOne } from '../db/client';
import type { ManagementTenantBillRow, TenantBillWithTenant } from '../../src/types';
import { buildTenantBillPdfBytes, getTenantBillFileName, getTenantBillFolderName } from '../../src/lib/tenantBillPdf';
import { buildManagementBillPdfBytes, getManagementBillFileName, getManagementBillFolderName } from '../../src/lib/managementBillPdf';
import { getSettings } from './settings.service';

export async function generateTenantBillPdf(splitId: number, row: TenantBillWithTenant) {
  const split = await queryOne<any>(
    `SELECT bs.reading_date, bs.id, b.period_month, b.period_year, b.fixed_unit, b.fixed_unit_price, b.energy_unit_price, b.extra_unit_price, b.tax_percent
     FROM bill_splits bs
     INNER JOIN bills b ON b.id = bs.bill_id
     WHERE bs.id = ?`,
    [splitId],
  );
  const settings = await getSettings();
  const fileName = getTenantBillFileName(splitId, row);
  const filePath = path.join(os.tmpdir(), fileName);
  const pdfBytes = await buildTenantBillPdfBytes({
    settings,
    bill: {
      period_month: split.period_month,
      period_year: split.period_year,
      fixed_unit: split.fixed_unit,
      fixed_unit_price: split.fixed_unit_price,
      energy_unit_price: split.energy_unit_price,
      extra_unit_price: split.extra_unit_price,
      tax_percent: split.tax_percent,
    },
    split: {
      id: split.id,
      reading_date: split.reading_date,
    },
    row,
  });
  await fs.writeFile(filePath, pdfBytes);

  return { filePath, settings };
}

export async function exportTenantBillPdfs(splitId: number, targetRootFolder: string, tenantBillIds?: number[]) {
  const split = await queryOne<any>(
    `SELECT bs.id, bs.reading_date, b.period_month, b.period_year, b.fixed_unit, b.fixed_unit_price, b.energy_unit_price, b.extra_unit_price, b.tax_percent
     FROM bill_splits bs
     INNER JOIN bills b ON b.id = bs.bill_id
     WHERE bs.id = ?`,
    [splitId],
  );
  if (!split) {
    throw new Error('Split not found');
  }

  const settings = await getSettings();
  const rows = (await queryAll<any>(
    `SELECT tb.*, t.name as tenant_name, t.room_no, t.phone
     FROM tenant_bills tb
     INNER JOIN tenants t ON t.id = tb.tenant_id
     WHERE tb.bill_split_id = ?
     ORDER BY t.room_no, t.name`,
    [splitId],
  )).filter((row) => !tenantBillIds?.length || tenantBillIds.includes(row.id));

  if (!rows.length) {
    throw new Error('No tenant bills found for this split');
  }

  const targetFolder = path.join(targetRootFolder, getTenantBillFolderName(split));
  await fs.mkdir(targetFolder, { recursive: true });

  for (const row of rows) {
    const filePath = path.join(targetFolder, getTenantBillFileName(splitId, row));
    const pdfBytes = await buildTenantBillPdfBytes({
      settings,
      bill: {
        period_month: split.period_month,
        period_year: split.period_year,
        fixed_unit: split.fixed_unit,
        fixed_unit_price: split.fixed_unit_price,
        energy_unit_price: split.energy_unit_price,
        extra_unit_price: split.extra_unit_price,
        tax_percent: split.tax_percent,
      },
      split: {
        id: splitId,
        reading_date: split.reading_date,
      },
      row,
    });
    await fs.writeFile(filePath, pdfBytes);
  }

  return { folderPath: targetFolder, fileCount: rows.length };
}

export async function printTenantBillPdfs(splitId: number, tenantBillIds?: number[]) {
  const rows = (await queryAll<any>(
    `SELECT tb.*, t.name as tenant_name, t.room_no, t.phone
     FROM tenant_bills tb
     INNER JOIN tenants t ON t.id = tb.tenant_id
     WHERE tb.bill_split_id = ?
     ORDER BY t.room_no, t.name`,
    [splitId],
  )).filter((row) => !tenantBillIds?.length || tenantBillIds.includes(row.id));
  if (!rows.length) throw new Error('No tenant bills selected');
  const split = await queryOne<any>(
    `SELECT bs.*, b.period_month, b.period_year, b.tax_percent
     FROM bill_splits bs INNER JOIN bills b ON b.id = bs.bill_id WHERE bs.id = ?`,
    [splitId],
  );
  const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
  const money = (value: unknown) => `Rs ${Number(value ?? 0).toFixed(2)}`;
  const invoices = rows.map((row) => `
    <section class="invoice">
      <header><h1>A S Maintainence</h1><div>Phone no: +91 9663680185</div><h2>INVOICE</h2></header>
      <div class="meta"><div><small>INVOICE NO</small><b>INV-${splitId}-${escapeHtml(row.room_no)}</b></div><div><small>READING DATE</small><b>${escapeHtml(split.reading_date)}</b></div><div><small>PERIOD</small><b>${split.period_month}/${split.period_year}</b></div></div>
      <div class="panels"><div><b>Tenant Details</b><p>${escapeHtml(row.tenant_name)}</p><p>Room: ${escapeHtml(row.room_no)}</p></div><div><b>Meter Reading</b><p>Previous: ${Number(row.previous_reading).toFixed(2)}</p><p>Present: ${Number(row.present_reading).toFixed(2)}</p><p><b>Consumed: ${Number(row.consumed_unit).toFixed(2)} units</b></p></div></div>
      <h3>Electricity Charges</h3><table><thead><tr><th>Description</th><th>Amount</th></tr></thead><tbody>
        <tr><td>Fixed Charge</td><td>${money(Number(row.fixed_charge_calc) + Number(row.fixed_adjust))}</td></tr><tr><td>Consumed Charge</td><td>${money(row.energy_charge)}</td></tr><tr><td>Extra Unit Charge</td><td>${money(row.extra_unit_charge)}</td></tr><tr><td>Extra Charge</td><td>${money(Number(row.extra_charge_calc) + Number(row.extra_adjust))}</td></tr><tr><td>Tax</td><td>${money(row.tax)}</td></tr><tr><td>Interest Charge</td><td>${money(Number(row.interest_charge_calc) + Number(row.interest_adjust))}</td></tr><tr><td>Other Charge</td><td>${money(row.other_charge)}</td></tr><tr class="total"><td>Electricity Subtotal</td><td>${money(row.electricity_total)}</td></tr>
      </tbody></table>
      <h3>Management Charges</h3><table><tbody><tr><td>Burjman Owner's Association</td><td>${money(row.maintenance_fee)}</td></tr><tr><td>Generator Fee</td><td>${money(row.generator_fee)}</td></tr><tr><td>Extra Work Charges</td><td>${money(row.management_extra_fee)}</td></tr><tr class="total"><td>Management Total</td><td>${money(row.management_total)}</td></tr></tbody></table>
      <div class="payable"><b>AMOUNT PAYABLE</b><strong>${money(row.payable)}</strong></div>
    </section>`).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:A4;margin:10mm}*{box-sizing:border-box}body{margin:0;font:12px Arial;color:#0f172a}.invoice{page-break-after:always;border:1px solid #cbd5e1;padding:14px;min-height:277mm}.invoice:last-child{page-break-after:auto}header{text-align:center;background:#f8fafc;border:1px solid #cbd5e1;padding:10px}h1{margin:0 0 5px;font-size:22px}h2{margin:7px 0 0;font-size:13px}.meta,.panels{display:grid;grid-template-columns:repeat(3,1fr);margin-top:12px}.meta>div,.panels>div{border:1px solid #cbd5e1;padding:10px}.meta small,.meta b{display:block}.panels{grid-template-columns:1fr 1fr;gap:10px}.panels p{margin:6px 0}h3{margin:16px 0 7px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #dbe3ec;padding:8px;text-align:left}th:last-child,td:last-child{text-align:right}.total{font-weight:bold;background:#f1f5f9}.payable{margin-top:14px;background:#111827;color:white;padding:15px;display:flex;justify-content:space-between;font-size:16px}</style></head><body>${invoices}</body></html>`;

  const printWindow = new BrowserWindow({ width: 900, height: 760, autoHideMenuBar: true, title: 'Print Billify Invoices' });
  await printWindow.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(html)}`);
  await new Promise<void>((resolve, reject) => {
    printWindow.webContents.print({ silent: false, printBackground: true }, (success, reason) => {
      if (success || reason === 'Print job canceled') resolve();
      else reject(new Error(reason || 'Unable to open print dialog'));
    });
  });
  if (!printWindow.isDestroyed()) printWindow.close();
  return { ok: true as const, fileCount: rows.length };
}

export async function generateManagementBillPdf(batchId: number, row: ManagementTenantBillRow) {
  const batch = await queryOne<any>(
    `SELECT id, period_month, period_year, status, created_at, updated_at
     FROM management_bill_batches
     WHERE id = ?`,
    [batchId],
  );
  if (!batch) {
    throw new Error('Batch not found');
  }
  const settings = await getSettings();
  const fileName = getManagementBillFileName(batchId, row);
  const filePath = path.join(os.tmpdir(), fileName);
  const pdfBytes = await buildManagementBillPdfBytes({
    settings,
    batch,
    row,
  });
  await fs.writeFile(filePath, pdfBytes);
  return { filePath, settings };
}

export async function exportManagementBillPdfs(batchId: number, targetRootFolder: string) {
  const batch = await queryOne<any>(
    `SELECT id, period_month, period_year, status, created_at, updated_at
     FROM management_bill_batches
     WHERE id = ?`,
    [batchId],
  );
  if (!batch) {
    throw new Error('Batch not found');
  }

  const settings = await getSettings();
  const rows = await queryAll<ManagementTenantBillRow>(
    `SELECT
        mb.*,
        t.name AS tenant_name,
        t.room_no,
        t.phone,
        b.period_month,
        b.period_year
     FROM management_tenant_bills mb
     INNER JOIN tenants t ON t.id = mb.tenant_id
     INNER JOIN management_bill_batches b ON b.id = mb.batch_id
     WHERE mb.batch_id = ?
     ORDER BY t.room_no, t.name`,
    [batchId],
  );

  if (!rows.length) {
    throw new Error('No management bills found for this batch');
  }

  const targetFolder = path.join(targetRootFolder, getManagementBillFolderName(batch));
  await fs.mkdir(targetFolder, { recursive: true });

  for (const row of rows) {
    const filePath = path.join(targetFolder, getManagementBillFileName(batchId, row));
    const pdfBytes = await buildManagementBillPdfBytes({
      settings,
      batch,
      row,
    });
    await fs.writeFile(filePath, pdfBytes);
  }

  return { folderPath: targetFolder, fileCount: rows.length };
}
