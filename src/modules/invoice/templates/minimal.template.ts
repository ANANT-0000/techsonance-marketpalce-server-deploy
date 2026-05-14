import { Injectable, OnModuleInit } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import {
  IInvoiceTemplate,
  StandardizedInvoicePayload,
} from '../interfaces/invoice.interface';
import { InvoiceTemplateRegistry } from '../template.registry';

// ─── Layout ────────────────────────────────────────────────────
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const M = 50;
const CW = PAGE_W - M * 2;

/**
 * MinimalInvoiceTemplate
 *
 * Clean, brand-colour-free, single-column layout.
 * Great for B2B invoices, consulting, or plain receipts.
 *
 * HOW TO ADD THIS TO THE MODULE:
 *   1. Add MinimalInvoiceTemplate to `providers` in invoice.module.ts
 *   2. Done — it auto-registers itself via onModuleInit().
 */
@Injectable()
export class MinimalInvoiceTemplate implements IInvoiceTemplate, OnModuleInit {
  readonly templateId = 'minimal';
  readonly templateLabel = 'Minimal Clean Invoice';

  constructor(private readonly registry: InvoiceTemplateRegistry) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  // ════════════════════════════════════════════════════════════════
  async render(payload: StandardizedInvoicePayload): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        margin: M,
        size: 'A4',
        autoFirstPage: true,
      });
      const buffers: Buffer[] = [];
      doc.on('data', (c) => buffers.push(c));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);
      try {
        this.draw(doc, payload);
      } catch (e) {
        reject(e);
        return;
      }
      doc.end();
    });
  }

  private draw(doc: PDFKit.PDFDocument, p: StandardizedInvoicePayload): void {
    // ── Top meta band ──
    doc
      .fontSize(9)
      .font('Helvetica')
      .fillColor('#888888')
      .text('INVOICE', M, 50, { lineBreak: false });
    doc
      .fontSize(9)
      .font('Helvetica')
      .fillColor('#888888')
      .text(p.meta.invoiceNumber, M, 50, {
        align: 'right',
        width: CW,
        lineBreak: false,
      });

    let y = 70;
    this.hr(doc, y);
    y += 16;

    // ── Company ──
    doc
      .fontSize(16)
      .font('Helvetica-Bold')
      .fillColor('#111111')
      .text(p.legal.tradeName || p.legal.legalName, M, y);
    y += 20;

    for (const tax of p.legal.taxIds) {
      doc
        .fontSize(8)
        .font('Helvetica')
        .fillColor('#666666')
        .text(`${tax.key}: ${tax.value}`, M, y);
      y += 12;
    }
    if (p.legal.supportEmail) {
      doc
        .fontSize(8)
        .font('Helvetica')
        .fillColor('#666666')
        .text(p.legal.supportEmail, M, y);
      y += 12;
    }
    y += 8;

    // ── Invoice details row ──
    this.hr(doc, y);
    y += 10;
    const colW = CW / 3;
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#333333');
    doc.text('Invoice Date', M, y);
    y += 10;
    doc.text('Due Date', M + colW, y - 10);
    doc.text('Invoice Number', M + colW * 2, y - 10);

    doc.fontSize(9).font('Helvetica').fillColor('#111111');
    doc.text(this.fmtDate(p.meta.invoiceDate), M, y + 2);
    doc.text(
      this.fmtDate(p.meta.dueDate ?? p.meta.invoiceDate),
      M + colW,
      y + 2,
    );
    doc.text(p.meta.invoiceNumber, M + colW * 2, y + 2);
    y += 22;

    this.hr(doc, y);
    y += 10;

    // ── Bill To / Ship To ──
    doc
      .fontSize(8)
      .font('Helvetica-Bold')
      .fillColor('#888888')
      .text('BILL TO', M, y);
    doc.text('SHIP TO', M + CW / 2, y);
    y += 12;
    doc
      .fontSize(9)
      .font('Helvetica')
      .fillColor('#111111')
      .text(p.customer.name, M, y)
      .text(p.customer.name, M + CW / 2, y);
    y += 12;
    doc
      .fontSize(8)
      .font('Helvetica')
      .fillColor('#555555')
      .text(p.customer.billingAddress, M, y, { width: CW / 2 - 10 });
    doc.text(p.customer.shippingAddress, M + CW / 2, y, { width: CW / 2 });
    y +=
      doc.heightOfString(p.customer.billingAddress, { width: CW / 2 - 10 }) +
      20;

    this.hr(doc, y);
    y += 10;

    // ── Items table ──
    const COL_DESC = M;
    const COL_QTY = M + 280;
    const COL_PRICE = M + 340;
    const COL_TAX = M + 400;
    const COL_TOTAL = M + 455;

    // Header
    doc.rect(M, y, CW, 16).fill('#f2f2f2');
    doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#444444');
    doc.text('DESCRIPTION', COL_DESC, y + 3, { width: 270, lineBreak: false });
    doc.text('QTY', COL_QTY, y + 3, {
      width: 55,
      align: 'center',
      lineBreak: false,
    });
    doc.text('UNIT PRICE', COL_PRICE, y + 3, {
      width: 55,
      align: 'right',
      lineBreak: false,
    });
    doc.text('TAX', COL_TAX, y + 3, {
      width: 50,
      align: 'right',
      lineBreak: false,
    });
    doc.text('TOTAL', COL_TOTAL, y + 3, {
      width: 40,
      align: 'right',
      lineBreak: false,
    });
    y += 20;

    doc.fontSize(8).font('Helvetica').fillColor('#111111');
    for (const item of p.items) {
      const rowH = 20;
      doc.text(this.truncate(item.name, 55), COL_DESC, y + 4, {
        width: 270,
        lineBreak: false,
      });
      doc.text(String(item.quantity), COL_QTY, y + 4, {
        width: 55,
        align: 'center',
        lineBreak: false,
      });
      doc.text(this.fc(item.unitPrice, p.totals.currency), COL_PRICE, y + 4, {
        width: 55,
        align: 'right',
        lineBreak: false,
      });
      doc.text(item.taxRate ? `${item.taxRate}%` : '-', COL_TAX, y + 4, {
        width: 50,
        align: 'right',
        lineBreak: false,
      });
      doc.text(this.fc(item.totalAmount, p.totals.currency), COL_TOTAL, y + 4, {
        width: 40,
        align: 'right',
        lineBreak: false,
      });
      y += rowH;
      this.hr(doc, y, '#eeeeee');
    }
    y += 10;

    // ── Totals ──
    const totX = M + CW - 180;
    const valX = M + CW - 60;
    const totW = 115;
    const valW = 55;
    const tRow = (label: string, val: string, bold = false) => {
      doc
        .fontSize(8)
        .font(bold ? 'Helvetica-Bold' : 'Helvetica')
        .fillColor('#333333')
        .text(label, totX, y, {
          width: totW,
          align: 'right',
          lineBreak: false,
        });
      doc
        .font(bold ? 'Helvetica-Bold' : 'Helvetica')
        .text(val, valX, y, { width: valW, align: 'right', lineBreak: false });
      y += 13;
    };

    tRow('Subtotal', this.fc(p.totals.subTotal, p.totals.currency));
    if (p.totals.totalCgst > 0)
      tRow('CGST', this.fc(p.totals.totalCgst, p.totals.currency));
    if (p.totals.totalSgst > 0)
      tRow('SGST', this.fc(p.totals.totalSgst, p.totals.currency));
    if (p.totals.totalIgst > 0)
      tRow('IGST', this.fc(p.totals.totalIgst, p.totals.currency));
    this.hr(doc, y, '#999999');
    y += 5;
    tRow('Total', this.fc(p.totals.grandTotal, p.totals.currency), true);
    y += 20;

    // ── Amount in words ──
    doc
      .fontSize(7.5)
      .font('Helvetica')
      .fillColor('#666666')
      .text(`Amount in words: ${p.totals.grandTotalInWords ?? ''}`, M, y, {
        width: CW,
      });
    y += 20;

    // ── Notes / Terms ──
    if (p.footer.notes) {
      doc
        .fontSize(8)
        .font('Helvetica-Bold')
        .fillColor('#333333')
        .text('Notes:', M, y);
      y += 11;
      doc
        .fontSize(7.5)
        .font('Helvetica')
        .fillColor('#666666')
        .text(p.footer.notes, M, y, { width: CW });
      y += 20;
    }
    if (p.footer.termsAndConditions) {
      doc
        .fontSize(8)
        .font('Helvetica-Bold')
        .fillColor('#333333')
        .text('Terms & Conditions:', M, y);
      y += 11;
      doc
        .fontSize(7)
        .font('Helvetica')
        .fillColor('#888888')
        .text(p.footer.termsAndConditions, M, y, { width: CW });
    }

    // ── Footer ──
    this.hr(doc, PAGE_H - 30);
    doc
      .fontSize(7)
      .font('Helvetica')
      .fillColor('#aaaaaa')
      .text('Page 1 / 1', M, PAGE_H - 22, { width: 50, lineBreak: false });
    doc.text('Generated by Techsonance Marketplace', M + 50, PAGE_H - 22, {
      width: CW - 50,
      align: 'center',
      lineBreak: false,
    });
  }

  // ── Utilities ───────────────────────────────────────────────────
  private hr(doc: PDFKit.PDFDocument, y: number, color = '#dddddd'): void {
    doc
      .strokeColor(color)
      .lineWidth(0.5)
      .moveTo(M, y)
      .lineTo(M + CW, y)
      .stroke();
  }

  private fc(amount: number, currency = 'INR'): string {
    const sym =
      currency === 'INR' ? '₹' : currency === 'USD' ? '$' : `${currency} `;
    return `${sym}${amount.toFixed(2)}`;
  }

  private fmtDate(date: Date): string {
    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  private truncate(str: string, max: number): string {
    return str.length > max ? str.slice(0, max - 1) + '…' : str;
  }
}
