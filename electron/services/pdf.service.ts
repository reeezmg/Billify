import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { queryAll, queryOne } from '../db/client';
import type { AppSettings, TenantBillWithTenant } from '../../src/types';
import { buildTenantBillPdfBytes, getTenantBillFileName } from '../../src/lib/tenantBillPdf';

async function getSettings(): Promise<AppSettings> {
  const values = await Promise.all([
    queryOne<{ value: string | null }>('SELECT value FROM app_config WHERE key = ?', ['company_name']),
    queryOne<{ value: string | null }>('SELECT value FROM app_config WHERE key = ?', ['company_address']),
    queryOne<{ value: string | null }>('SELECT value FROM app_config WHERE key = ?', ['whatsapp_phone_number_id']),
    queryOne<{ value: string | null }>('SELECT value FROM app_config WHERE key = ?', ['whatsapp_access_token']),
    queryOne<{ value: string | null }>('SELECT value FROM app_config WHERE key = ?', ['whatsapp_template_name']),
    queryOne<{ value: string | null }>('SELECT value FROM app_config WHERE key = ?', ['whatsapp_template_language']),
  ]);
  return {
    company_name: values[0]?.value ?? 'Billify Building',
    company_address: values[1]?.value ?? '',
    whatsapp_phone_number_id: values[2]?.value ?? '',
    whatsapp_access_token: values[3]?.value ?? '',
    whatsapp_template_name: values[4]?.value ?? 'electricity_bill',
    whatsapp_template_language: values[5]?.value ?? 'en',
  };
}

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

export async function exportTenantBillPdfs(splitId: number, targetFolder: string) {
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
