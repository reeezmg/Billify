import PDFDocument from 'pdfkit/js/pdfkit.standalone.js';
import type { Tenant } from '../types';

function mergePdfChunks(chunks: Uint8Array[]) {
  const output = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

export async function buildReadingSheetPdfBytes(tenants: Tenant[]) {
  const rows = tenants
    .filter((tenant) => tenant.active)
    .sort((left, right) => left.room_no.localeCompare(right.room_no, undefined, { numeric: true, sensitivity: 'base' }));
  const chunks: Uint8Array[] = [];

  return await new Promise<Uint8Array>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 36 });
    doc.on('data', (chunk: Uint8Array | Buffer | string) => {
      chunks.push(typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk));
    });
    doc.on('end', () => resolve(mergePdfChunks(chunks)));
    doc.on('error', reject);

    const left = doc.page.margins.left;
    const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const columnWidths = [80, contentWidth - 80 - 105 - 105, 105, 105];
    const headers = ['Rm No', 'Name', 'Old', 'New'];
    const rowHeight = 28;
    const headerHeight = 30;
    const bottomLimit = doc.page.height - doc.page.margins.bottom;

    const drawTitle = () => {
      doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(18).text('METER READING SHEET', left, 36, { width: contentWidth });
      doc.fillColor('#64748b').font('Helvetica').fontSize(9).text('Enter the new meter reading in the New column.', left, 61, { width: contentWidth });
    };

    const drawHeader = (y: number) => {
      let x = left;
      headers.forEach((header, index) => {
        doc.rect(x, y, columnWidths[index], headerHeight).fillAndStroke('#1f9d6a', '#cbd5e1');
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(10).text(header, x + 7, y + 10, {
          width: columnWidths[index] - 14,
          align: index >= 2 ? 'center' : 'left',
          lineBreak: false,
        });
        x += columnWidths[index];
      });
      return y + headerHeight;
    };

    const startPage = (firstPage: boolean) => {
      if (!firstPage) doc.addPage();
      drawTitle();
      return drawHeader(82);
    };

    let y = startPage(true);
    rows.forEach((tenant, rowIndex) => {
      if (y + rowHeight > bottomLimit) y = startPage(false);
      const values = [tenant.room_no, tenant.name, Number(tenant.present_reading ?? 0).toFixed(2), ''];
      let x = left;
      values.forEach((value, columnIndex) => {
        const fill = rowIndex % 2 === 0 ? '#ffffff' : '#f8fafc';
        doc.rect(x, y, columnWidths[columnIndex], rowHeight).fillAndStroke(fill, '#cbd5e1');
        doc.fillColor('#0f172a').font('Helvetica').fontSize(10).text(value, x + 7, y + 9, {
          width: columnWidths[columnIndex] - 14,
          align: columnIndex >= 2 ? 'center' : 'left',
          lineBreak: false,
          ellipsis: true,
        });
        x += columnWidths[columnIndex];
      });
      y += rowHeight;
    });

    if (!rows.length) {
      doc.rect(left, y, contentWidth, 42).fillAndStroke('#ffffff', '#cbd5e1');
      doc.fillColor('#64748b').font('Helvetica').fontSize(10).text('No active tenants found.', left, y + 15, { width: contentWidth, align: 'center' });
    }

    doc.end();
  });
}
