import PDFDocument from 'pdfkit';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import dayjs from 'dayjs';
import { queryOne } from '../db/client';
import type { AppSettings, Bill, Tenant, TenantBillWithTenant } from '../../src/types';

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
    `SELECT bs.*, b.period_month, b.period_year, b.fixed_unit_price, b.energy_unit_price
     FROM bill_splits bs
     INNER JOIN bills b ON b.id = bs.bill_id
     WHERE bs.id = ?`,
    [splitId],
  );
  const settings = await getSettings();
  const monthName = dayjs().month(split.period_month - 1).month(split.period_month - 1).format('MMMM');
  const fileName = `bill-${splitId}-${row.tenant_id}.pdf`;
  const filePath = path.join(os.tmpdir(), fileName);

  await new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A5', margin: 28 });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    doc.fontSize(16).text(settings.company_name, { align: 'center' });
    if (settings.company_address) {
      doc.moveDown(0.2).fontSize(9).text(settings.company_address, { align: 'center' });
    }
    doc.moveDown(0.5);
    doc.fontSize(13).text(`ELECTRICITY BILL - ${monthName} ${split.period_year}`, { align: 'center' });
    doc.moveDown(0.8);
    doc.fontSize(10).text(`Bill #: ${splitId}-${row.tenant_id}`);
    doc.text(`Reading Date: ${dayjs(split.reading_date).format('DD MMM YYYY')}`);
    doc.moveDown(0.5);
    doc.text(`Tenant: ${row.tenant_name}`);
    doc.text(`Room: ${row.room_no}`);
    if (row.phone) doc.text(`Phone: ${row.phone}`);
    doc.moveDown(0.6);
    doc.fontSize(11).text('Meter Readings');
    doc.fontSize(9).text(`Previous: ${row.previous_reading}`);
    doc.text(`Present: ${row.present_reading}`);
    doc.text(`Consumed: ${row.consumed_unit} kWh`);
    doc.moveDown(0.5);
    doc.fontSize(11).text('Charges');
    doc.fontSize(9).text(`Fixed Charge: Rs ${row.fixed_charge_calc + row.fixed_adjust}`);
    doc.text(`Energy Charge: Rs ${row.energy_charge}`);
    doc.text(`Extra Charge: Rs ${row.extra_charge_calc + row.extra_adjust}`);
    doc.text(`Tax: Rs ${row.tax}`);
    doc.moveDown(0.2);
    doc.text(`Sub Total: Rs ${row.sub_total}`);
    doc.text(`Interest Charge: Rs ${row.interest_charge_calc + row.interest_adjust}`);
    doc.text(`Other Charge: Rs ${row.other_charge_calc}`);
    doc.moveDown(0.3);
    doc.fontSize(12).text(`AMOUNT PAYABLE: Rs ${row.payable}`, { align: 'right' });
    doc.moveDown(0.8);
    doc.fontSize(8).text(`Generated ${dayjs().format('DD MMM YYYY HH:mm')} - Billify`, { align: 'center' });
    doc.end();

    stream.on('finish', () => resolve());
    stream.on('error', reject);
  });

  return { filePath, settings };
}
