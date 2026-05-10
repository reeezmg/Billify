import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { queryAll, queryOne } from '../db/client';
import type { ManagementTenantBillRow, TenantBillWithTenant } from '../../src/types';
import { buildTenantBillPdfBytes, getTenantBillFileName, getTenantBillFolderName } from '../../src/lib/tenantBillPdf';
import { buildManagementBillPdfBytes, getManagementBillFileName, getManagementBillFolderName } from '../../src/lib/managementBillPdf';
import { getSettings } from './settings.service';

export async function generateTenantBillPdf(splitId: number, row: TenantBillWithTenant) {
  const split = await queryOne<any>(
    `SELECT bs.reading_date, bs.id, b.period_month, b.period_year, b.fixed_unit, b.fixed_unit_price, b.energy_unit_price, b.tax_percent
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

export async function exportTenantBillPdfs(splitId: number, targetRootFolder: string) {
  const split = await queryOne<any>(
    `SELECT bs.id, bs.reading_date, b.period_month, b.period_year, b.fixed_unit, b.fixed_unit_price, b.energy_unit_price, b.tax_percent
     FROM bill_splits bs
     INNER JOIN bills b ON b.id = bs.bill_id
     WHERE bs.id = ?`,
    [splitId],
  );
  if (!split) {
    throw new Error('Split not found');
  }

  const settings = await getSettings();
  const rows = await queryAll<any>(
    `SELECT tb.*, t.name as tenant_name, t.room_no, t.phone
     FROM tenant_bills tb
     INNER JOIN tenants t ON t.id = tb.tenant_id
     WHERE tb.bill_split_id = ?
     ORDER BY t.room_no, t.name`,
    [splitId],
  );

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
