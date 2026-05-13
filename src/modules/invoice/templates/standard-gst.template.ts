import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  IInvoiceTemplate,
  StandardizedInvoicePayload,
} from '../interfaces/invoice.interface';
import { InvoiceTemplateRegistry } from '../template.registry';
import PDFDocument from 'pdfkit';

@Injectable()
export class StandardGstInvoiceTemplate
  implements IInvoiceTemplate, OnModuleInit
{
  readonly templateId = 'standard-gst';

  constructor(private readonly registry: InvoiceTemplateRegistry) {}

  onModuleInit() {
    this.registry.register(this);
  }

  async render(payload: StandardizedInvoicePayload): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const buffers: Buffer[] = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const CONTENT_WIDTH = 595.28 - 80;
      const hr = (y: number) =>
        doc
          .strokeColor('#e5e7eb')
          .lineWidth(1)
          .moveTo(40, y)
          .lineTo(40 + CONTENT_WIDTH, y)
          .stroke();

      // Header
      doc
        .fontSize(16)
        .font('Helvetica-Bold')
        .fillColor(payload.branding.primaryColor)
        .text('TAX INVOICE', 40, 40);
      doc
        .fontSize(9)
        .font('Helvetica')
        .fillColor('#6b7280')
        .text('ORIGINAL FOR RECIPIENT', 40, 45, {
          align: 'right',
          width: CONTENT_WIDTH,
        });

      // Company Info & Meta
      let currentY = 80;
      doc
        .fontSize(12)
        .font('Helvetica-Bold')
        .fillColor('#111827')
        .text(payload.legal.tradeName || payload.legal.legalName, 40, currentY);
      doc.fontSize(9).font('Helvetica').fillColor('#4b5563');

      let taxY = currentY + 15;
      payload.legal.taxIds.forEach((tax) => {
        doc.text(`${tax.key.toUpperCase()}: ${tax.value}`, 40, taxY);
        taxY += 12;
      });

      doc
        .fontSize(9)
        .font('Helvetica-Bold')
        .fillColor('#111827')
        .text('Invoice No:', 350, currentY)
        .font('Helvetica')
        .text(payload.meta.invoiceNumber, 450, currentY);
      doc
        .font('Helvetica-Bold')
        .text('Date:', 350, currentY + 15)
        .font('Helvetica')
        .text(
          payload.meta.invoiceDate.toLocaleDateString(),
          450,
          currentY + 15,
        );

      hr(taxY + 20);

      // Items Table
      let tableY = taxY + 40;
      doc
        .rect(40, tableY, CONTENT_WIDTH, 20)
        .fill(payload.branding.primaryColor || '#f3f4f6');
      doc
        .fontSize(9)
        .font('Helvetica-Bold')
        .fillColor(payload.branding.primaryColor ? '#ffffff' : '#111827');
      doc.text('Item Description', 45, tableY + 5);
      doc.text('Qty', 320, tableY + 5);
      doc.text('Rate', 360, tableY + 5);
      doc.text('Amount', 500, tableY + 5);

      tableY += 25;
      doc.font('Helvetica').fillColor('#111827');

      payload.items.forEach((item) => {
        doc.text(item.name, 45, tableY, { width: 260 });
        doc.text(item.quantity.toString(), 320, tableY);
        doc.text(item.unitPrice.toFixed(2), 360, tableY);
        doc.text(item.totalAmount.toFixed(2), 500, tableY);
        tableY += 25;
        hr(tableY - 5);
      });

      // Totals
      tableY += 10;
      doc
        .fontSize(11)
        .font('Helvetica-Bold')
        .text('Grand Total:', 360, tableY)
        .text(
          `${payload.totals.currency} ${payload.totals.grandTotal.toFixed(2)}`,
          500,
          tableY,
        );

      doc.end();
    });
  }
}
