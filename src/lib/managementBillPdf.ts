import dayjs from 'dayjs';
import PDFDocument from 'pdfkit/js/pdfkit.standalone.js';
import { sanitizeFilenamePart } from './tenantBillPdf';
import type { AppSettings, ManagementBatchDetail, ManagementTenantBillRow } from '../types';

type ManagementBillPdfContext = {
  settings: AppSettings;
  batch: ManagementBatchDetail['batch'];
  row: ManagementTenantBillRow;
};

function toPdfBuffer(chunks: Uint8Array[]) {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

export function getManagementBillFileName(batchId: number, row: ManagementTenantBillRow) {
  const room = sanitizeFilenamePart(row.room_no || `tenant-${row.tenant_id}`);
  const name = sanitizeFilenamePart(row.tenant_name || `tenant-${row.tenant_id}`);
  return `${batchId}-${room}-${name}.pdf`;
}

export function getManagementBillNumber(batch: ManagementBillPdfContext['batch'], row: ManagementTenantBillRow) {
  const room = String(row.room_no || row.tenant_id).replace(/\s+/g, '').toUpperCase();
  return `MGMT-${batch.id}-${room}`;
}

export function getManagementBillFolderName(batch: ManagementBillPdfContext['batch']) {
  return `Billify Management - ${String(batch.period_month).padStart(2, '0')}-${batch.period_year}`;
}

export function getManagementBillPeriodLabel(batch: ManagementBillPdfContext['batch']) {
  return `${dayjs().month(batch.period_month - 1).format('MMMM')} ${batch.period_year}`;
}

export async function buildManagementBillPdfBytes(context: ManagementBillPdfContext) {
  const { settings, batch, row } = context;
  const monthName = dayjs().month(batch.period_month - 1).format('MMMM');
  const issuedDate = dayjs(batch.created_at).format('DD MMM YYYY');
  const chunks: Uint8Array[] = [];

  return await new Promise<Uint8Array>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A5', margin: 28 });

    doc.on('data', (chunk: Uint8Array | Buffer | string) => {
      if (typeof chunk === 'string') {
        chunks.push(new TextEncoder().encode(chunk));
        return;
      }
      chunks.push(chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk));
    });
    doc.on('end', () => resolve(toPdfBuffer(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const left = doc.page.margins.left;
    const borderColor = '#cbd5e1';
    const softBorder = '#e2e8f0';
    const darkText = '#0f172a';
    const mutedText = '#475569';
    const headerFill = '#f8fafc';
    const accentFill = '#111827';

    const formatMoney = (value: number) => `Rs ${value.toFixed(2)}`;

    const drawBox = (x: number, y: number, width: number, height: number, fill = '#ffffff', stroke = borderColor) => {
      doc.rect(x, y, width, height).fillAndStroke(fill, stroke);
    };

    const drawLabelValue = (label: string, value: string, x: number, y: number, width: number, valueSize = 10) => {
      doc.fillColor(mutedText).font('Helvetica').fontSize(7.5).text(label.toUpperCase(), x, y, { width });
      doc.fillColor(darkText).font('Helvetica-Bold').fontSize(valueSize).text(value, x, y + 11, { width });
    };

    doc.rect(18, 18, pageWidth - 36, pageHeight - 36).lineWidth(1).strokeColor(borderColor).stroke();

    let y = 34;
    drawBox(left, y, contentWidth, 76, headerFill);
    doc
      .fillColor(darkText)
      .font('Helvetica-Bold')
      .fontSize(20)
      .text(settings.company_name, left + 14, y + 14, { width: contentWidth - 28, align: 'center' });
    if (settings.company_address) {
      doc
        .fillColor(mutedText)
        .font('Helvetica')
        .fontSize(8)
        .text(settings.company_address, left + 14, y + 39, { width: contentWidth - 28, align: 'center' });
    }
    doc
      .fillColor(darkText)
      .font('Helvetica-Bold')
      .fontSize(11)
      .text(`MANAGEMENT BILL - ${monthName} ${batch.period_year}`, left + 14, y + 57, {
        width: contentWidth - 28,
        align: 'center',
      });

    y += 88;
    const metaWidth = contentWidth / 3;
    drawBox(left, y, metaWidth, 40, '#ffffff');
    drawBox(left + metaWidth, y, metaWidth, 40, '#ffffff');
    drawBox(left + metaWidth * 2, y, metaWidth, 40, '#ffffff');
    drawLabelValue('Bill No', getManagementBillNumber(batch, row), left + 10, y + 8, metaWidth - 20, 10);
    drawLabelValue('Bill Date', issuedDate, left + metaWidth + 10, y + 8, metaWidth - 20, 9);
    drawLabelValue('Period', getManagementBillPeriodLabel(batch), left + metaWidth * 2 + 10, y + 8, metaWidth - 20, 9);

    y += 52;
    const panelGap = 10;
    const panelWidth = (contentWidth - panelGap) / 2;
    drawBox(left, y, panelWidth, 72, '#ffffff');
    drawBox(left + panelWidth + panelGap, y, panelWidth, 72, '#ffffff');

    doc.fillColor(darkText).font('Helvetica-Bold').fontSize(10).text('Tenant Details', left + 10, y + 10, { width: panelWidth - 20 });
    doc.fillColor(darkText).font('Helvetica-Bold').fontSize(9).text(row.tenant_name, left + 10, y + 28, { width: panelWidth - 20 });
    doc.fillColor(mutedText).font('Helvetica').fontSize(8.5).text(`Room: ${row.room_no}`, left + 10, y + 43, { width: panelWidth - 20 });
    if (row.phone) {
      doc.text(`Phone: ${row.phone}`, left + 10, y + 56, { width: panelWidth - 20 });
    }

    const statusX = left + panelWidth + panelGap;
    doc.fillColor(darkText).font('Helvetica-Bold').fontSize(10).text('Bill Period', statusX + 10, y + 10, { width: panelWidth - 20 });
    doc.fillColor(mutedText).font('Helvetica').fontSize(8.5).text(`Period: ${getManagementBillPeriodLabel(batch)}`, statusX + 10, y + 29, {
      width: panelWidth - 20,
    });
    doc.text(`Issued: ${issuedDate}`, statusX + 10, y + 43, { width: panelWidth - 20 });
    doc.fillColor(darkText).font('Helvetica-Bold').fontSize(8.5).text(`Status: ${row.payment_status.toUpperCase()}`, statusX + 10, y + 57, {
      width: panelWidth - 20,
    });

    y += 88;
    doc.fillColor(darkText).font('Helvetica-Bold').fontSize(12).text('Charge Summary', left, y);
    y += 20;

    const descWidth = 120;
    const calcWidth = 142;
    const amountWidth = contentWidth - descWidth - calcWidth;
    const rowHeight = 25;
    const headerHeight = 24;

    const drawTableCell = (
      text: string,
      x: number,
      cellY: number,
      width: number,
      height: number,
      options: { bold?: boolean; align?: 'left' | 'right'; fill?: string; color?: string } = {},
    ) => {
      doc.rect(x, cellY, width, height).fillAndStroke(options.fill ?? '#ffffff', softBorder);
      doc
        .fillColor(options.color ?? darkText)
        .font(options.bold ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(options.bold ? 8.8 : 8.5)
        .text(text, x + 8, cellY + 8, { width: width - 16, align: options.align ?? 'left' });
    };

    drawTableCell('Description', left, y, descWidth, headerHeight, { bold: true, fill: headerFill });
    drawTableCell('Calculation', left + descWidth, y, calcWidth, headerHeight, { bold: true, fill: headerFill });
    drawTableCell('Amount', left + descWidth + calcWidth, y, amountWidth, headerHeight, { bold: true, align: 'right', fill: headerFill });
    y += headerHeight;

    const chargeRows: Array<[string, string, number, boolean?]> = [
      ['Maintenance Fees', '', row.maintenance_fees],
      ['Generator Fees', '', row.generator_fees],
      ['Total', '', row.total, true],
    ];

    for (const [label, calculation, amount, bold] of chargeRows) {
      const fill = bold ? '#f1f5f9' : '#ffffff';
      drawTableCell(label, left, y, descWidth, rowHeight, { bold, fill });
      drawTableCell(calculation, left + descWidth, y, calcWidth, rowHeight, { bold, fill });
      drawTableCell(formatMoney(amount), left + descWidth + calcWidth, y, amountWidth, rowHeight, {
        bold,
        align: 'right',
        fill,
      });
      y += rowHeight;
    }

    y += 12;
    drawBox(left, y, contentWidth, 44, accentFill, accentFill);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(12).text('AMOUNT PAYABLE', left + 14, y + 15, {
      width: contentWidth / 2,
    });
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(16).text(formatMoney(row.total), left + contentWidth / 2, y + 13, {
      width: contentWidth / 2 - 14,
      align: 'right',
    });
    doc.end();
  });
}
