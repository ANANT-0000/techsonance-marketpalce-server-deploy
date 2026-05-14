import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import {
  IInvoiceTemplate,
  InvoiceLineItem,
  InvoiceTotals,
  StandardizedInvoicePayload,
} from '../interfaces/invoice.interface';
import { InvoiceTemplateRegistry } from '../template.registry';

// ─── Layout constants ────────────────────────────────────────────
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const M = 20; // margin
const CW = PAGE_W - M * 2; // content width = 515.28

// ─── Column X positions (mirroring the Amazon sample) ───────────
const COL = {
  num: M, // "#"
  item: M + 20, // "Item" (name + HSN + description)
  rate: M + 280, // "Rate/Item"
  qty: M + 360, // "Qty"
  taxable: M + 385, // "Taxable Value"
  taxAmt: M + 450, // "Tax Amount"
  amount: M + 500, // "Amount"
  colEnd: M + CW,
};

@Injectable()
export class StandardGstInvoiceTemplate
  implements IInvoiceTemplate, OnModuleInit
{
  readonly templateId = 'standard-gst';
  readonly templateLabel = 'Standard GST Invoice (Amazon Style)';
  private readonly logger = new Logger(StandardGstInvoiceTemplate.name);

  constructor(private readonly registry: InvoiceTemplateRegistry) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  // ════════════════════════════════════════════════════════════════
  // ENTRY POINT
  // ════════════════════════════════════════════════════════════════
  async render(payload: StandardizedInvoicePayload): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        margin: M,
        size: 'A4',
        autoFirstPage: true,
      });
      const buffers: Buffer[] = [];
      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      try {
        this.drawPage(doc, payload);
      } catch (err) {
        reject(err);
        return;
      }
      doc.end();
    });
  }

  // ════════════════════════════════════════════════════════════════
  // MASTER DRAW — orchestrates all sections in order
  // ════════════════════════════════════════════════════════════════
  private drawPage(
    doc: PDFKit.PDFDocument,
    p: StandardizedInvoicePayload,
  ): void {
    const primary = p.branding.primaryColor || '#232F3E';

    // ── Header band ──
    this.drawHeaderBand(doc, p, primary);

    // ── Company info + invoice meta (left / right split) ──
    let y = this.drawCompanyBlock(doc, p, primary);
    y = this.drawInvoiceMetaBlock(doc, p, y);
    y = this.drawCustomerBlock(doc, p, y);

    // ── Items table ──
    y = this.drawItemsTable(doc, p, y, primary);

    // ── Totals ──
    y = this.drawTotals(doc, p, y, primary);

    // ── Amount in words ──
    y = this.drawAmountInWords(doc, p, y);

    // ── Bank / Signatory ──
    y = this.drawSignatory(doc, p, y, primary);

    // ── Notes ──
    if (p.footer.notes) {
      y = this.drawNotes(doc, p.footer.notes, y);
    }

    // ── Terms & Conditions ──
    if (p.footer.termsAndConditions) {
      this.drawTerms(doc, p.footer.termsAndConditions, y);
    }

    // ── Page footer ──
    this.drawPageFooter(doc);
  }

  // ════════════════════════════════════════════════════════════════
  // SECTION: top banner — "TAX INVOICE" + "ORIGINAL FOR RECIPIENT"
  // ════════════════════════════════════════════════════════════════
  private drawHeaderBand(
    doc: PDFKit.PDFDocument,
    p: StandardizedInvoicePayload,
    primary: string,
  ): void {
    // "TAX INVOICE" top-left
    doc
      .fontSize(13)
      .font('Helvetica-Bold')
      .fillColor(primary)
      .text('TAX INVOICE', M, 36, { lineBreak: false });
    // "ORIGINAL FOR RECIPIENT" top-right
    doc
      .fontSize(8)
      .font('Helvetica')
      .fillColor('#555555')
      .text('ORIGINAL FOR RECIPIENT', M, 40, {
        align: 'right',
        width: CW,
        lineBreak: false,
      });

    console.log('is logo url:', p.branding.logoUrl);
    console.log('is logo Buffer:', p.branding.logoBuffer);
    // Optional logo top-right
    if (p.branding.logoBuffer) {
      try {
        doc.image(p.branding.logoBuffer, PAGE_W - M - 110, 50, {
          fit: [110, 45],
        });
      } catch {
        /* skip silently */
      }
    }
  }

  // ════════════════════════════════════════════════════════════════
  // SECTION: company name + GSTIN + address (left side)
  // ════════════════════════════════════════════════════════════════
  private drawCompanyBlock(
    doc: PDFKit.PDFDocument,
    p: StandardizedInvoicePayload,
    primary: string,
  ): number {
    let y = 90;

    // Company / trade name — bold large
    doc
      .fontSize(14)
      .font('Helvetica-Bold')
      .fillColor('#111111')
      .text(p.legal.tradeName || p.legal.legalName, M, y);
    y += 18;

    // Compliance fields (GSTIN etc.)
    for (const tax of p.legal.taxIds) {
      doc
        .fontSize(8)
        .font('Helvetica-Bold')
        .fillColor('#333333')
        .text(`${tax.key} `, M, y, { continued: true })
        .font('Helvetica-Bold')
        .text(tax.value);
      y += 12;
    }

    // Registered address (if present)
    if (p.legal.registeredAddress) {
      doc
        .fontSize(8)
        .font('Helvetica')
        .fillColor('#555555')
        .text(p.legal.registeredAddress, M, y, { width: 260 });
      y += doc.heightOfString(p.legal.registeredAddress, { width: 260 }) + 4;
    }

    // Phone + email line
    const contact: string[] = [];
    if (p.legal.supportPhone) contact.push(`Mobile ${p.legal.supportPhone}`);
    if (p.legal.supportEmail) contact.push(`Email ${p.legal.supportEmail}`);
    if (contact.length) {
      doc
        .fontSize(8)
        .font('Helvetica')
        .fillColor('#555555')
        .text(contact.join('   '), M, y, { width: 280 });
      y += 14;
    }

    return y;
  }

  // ════════════════════════════════════════════════════════════════
  // SECTION: Invoice #, Invoice Date, Due Date (single row)
  // ════════════════════════════════════════════════════════════════
  private drawInvoiceMetaBlock(
    doc: PDFKit.PDFDocument,
    p: StandardizedInvoicePayload,
    y: number,
  ): number {
    this.hr(doc, y + 4);
    y += 12;

    const dateStr = this.fmtDate(p.meta.invoiceDate);
    const dueDateStr = this.fmtDate(p.meta.dueDate ?? p.meta.invoiceDate);
    const colW = CW / 3;

    doc.fontSize(8).font('Helvetica-Bold').fillColor('#222222');
    doc.text(`Invoice #: ${p.meta.invoiceNumber}`, M, y, { width: colW });
    doc.text(`Invoice Date: ${dateStr}`, M + colW, y, { width: colW });
    doc.text(`Due Date: ${dueDateStr}`, M + colW * 2, y, { width: colW });
    y += 16;

    this.hr(doc, y);
    return y + 6;
  }

  // ════════════════════════════════════════════════════════════════
  // SECTION: Customer / Billing / Shipping three-column block
  // ════════════════════════════════════════════════════════════════
  private drawCustomerBlock(
    doc: PDFKit.PDFDocument,
    p: StandardizedInvoicePayload,
    y: number,
  ): number {
    const colW = CW / 3;
    const startY = y;

    // Customer details
    doc
      .fontSize(8)
      .font('Helvetica-Bold')
      .fillColor('#333333')
      .text('Customer Details:', M, y);
    y += 11;
    doc
      .fontSize(8)
      .font('Helvetica-Bold')
      .fillColor('#111111')
      .text(p.customer.name, M, y);
    y += 11;
    if (p.customer.phone) {
      doc
        .fontSize(8)
        .font('Helvetica')
        .fillColor('#555555')
        .text(`Ph: ${p.customer.phone}`, M, y);
      y += 11;
    }

    // Billing address (centre column)
    const billingY = startY;
    const bx = M + colW;
    doc
      .fontSize(8)
      .font('Helvetica-Bold')
      .fillColor('#333333')
      .text('Billing address:', bx, billingY);
    doc
      .fontSize(8)
      .font('Helvetica')
      .fillColor('#555555')
      .text(p.customer.billingAddress, bx, billingY + 11, { width: colW - 6 });

    // Shipping address (right column)
    const sx = M + colW * 2;
    doc
      .fontSize(8)
      .font('Helvetica-Bold')
      .fillColor('#333333')
      .text('Shipping address:', sx, billingY);
    doc
      .fontSize(8)
      .font('Helvetica')
      .fillColor('#555555')
      .text(p.customer.shippingAddress, sx, billingY + 11, { width: colW - 6 });

    // Place of supply
    const afterBlock = Math.max(y, billingY + 40);
    this.hr(doc, afterBlock + 4);
    const newY = afterBlock + 14;

    if (p.customer.placeOfSupply) {
      doc
        .fontSize(8)
        .font('Helvetica-Bold')
        .fillColor('#333333')
        .text(`Place of Supply: ${p.customer.placeOfSupply}`, M, newY);
      return newY + 14;
    }
    return newY;
  }

  // ════════════════════════════════════════════════════════════════
  // SECTION: Items table (header row + item rows)
  // ════════════════════════════════════════════════════════════════
  private drawItemsTable(
    doc: PDFKit.PDFDocument,
    p: StandardizedInvoicePayload,
    y: number,
    primary: string,
  ): number {
    // Header
    doc.rect(M, y, CW, 18).fill(primary);
    doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#ffffff');
    doc.text('#', COL.num, y + 4, { width: 18, lineBreak: true });
    doc.text('Item', COL.item, y + 4, { width: 230, lineBreak: true });
    doc.text('Rate/Item', COL.rate, y + 4, {
      width: 75,
      align: 'right',
      lineBreak: false,
    });
    doc.text('Qty', COL.qty, y + 4, {
      width: 20,
      align: 'center',
      lineBreak: false,
    });
    doc.text('Taxable Value', COL.taxable, y + 4, {
      width: 55,
      align: 'right',
      lineBreak: false,
    });
    doc.text('Tax Amount', COL.taxAmt, y + 4, {
      width: 45,
      align: 'right',
      lineBreak: false,
    });
    doc.text('Amount', COL.amount, y + 4, {
      width: 35,
      align: 'right',
      lineBreak: false,
    });
    y += 22;

    // Rows
    doc.font('Helvetica').fillColor('#111111');
    for (let i = 0; i < p.items.length; i++) {
      y = this.drawItemRow(doc, p.items[i], p.totals, i, y, primary);
    }
    return y + 4;
  }

  private drawItemRow(
    doc: PDFKit.PDFDocument,
    item: InvoiceLineItem,
    totals: InvoiceTotals,
    idx: number,
    y: number,
    primary: string,
  ): number {
    const taxable = item.unitPrice * item.quantity;
    const rowTotal = item.totalAmount;

    // --- 1. DYNAMIC HEIGHT CALCULATIONS (Before drawing anything!) ---

    // Reset font to main size for measuring
    doc.fontSize(10).font('Helvetica');
    const nameHeight = doc.heightOfString(item.name, {
      width: 230,
      lineBreak: true,
    });

    // Reset font to small size for measuring HSN/Description
    doc.fontSize(7).font('Helvetica');

    let hsnHeight = 0;
    if (item.hsnCode) {
      hsnHeight = doc.heightOfString(`HSN: ${item.hsnCode}`, {
        width: 230,
        lineBreak: true,
      });
    }

    let descHeight = 0;
    if (item.description) {
      descHeight = doc.heightOfString(item.description, {
        width: 230,
        lineBreak: true,
      });
    }

    // Calculate total dynamic row height (Name + HSN + Desc + Padding)
    // 5px top padding + 5px gap between items + 5px bottom padding
    let dynamicRowHeight = 5 + nameHeight + 5;

    if (hsnHeight > 0) dynamicRowHeight += hsnHeight + 2; // +2px gap
    if (descHeight > 0) dynamicRowHeight += descHeight + 2; // +2px gap

    // Enforce a minimum row height of 26px just in case
    const finalRowHeight = Math.max(26, dynamicRowHeight);

    // --- 2. DRAW ZEBRA STRIPE ---
    if (idx % 2 === 1) {
      doc.rect(M, y, CW, finalRowHeight).fill('#f7f7f7');
    }

    // --- 3. DRAW TEXT COLUMNS ---

    // # column
    doc.fontSize(10).fillColor('#111111').font('Helvetica');
    doc.text(String(idx + 1), COL.num, y + 5, { width: 18, lineBreak: true });

    // Item Name
    doc.text(item.name, COL.item, y + 5, { width: 230, lineBreak: true });

    // Move cursor down for next elements
    let nextElementY = y + 5 + nameHeight + 2;

    // HSN Code
    if (item.hsnCode) {
      doc
        .fontSize(7)
        .fillColor('#666666')
        .text(`HSN: ${item.hsnCode}`, COL.item, nextElementY, {
          width: 230,
          lineBreak: true,
        });
      nextElementY += hsnHeight + 2; // Advance Y dynamically
    }

    // Description (Now uses dynamic nextElementY instead of hardcoded numbers!)
    if (item.description) {
      doc
        .fontSize(7)
        .fillColor('#666666')
        .text(item.description, COL.item, nextElementY, {
          width: 230,
          lineBreak: true,
        });
    }

    // Numeric columns (These always stay at y+5, aligned with the item name)
    doc.fontSize(8).font('Helvetica').fillColor('#111111');
    doc.text(
      this.fmtCurrency(item.unitPrice, totals.currency),
      COL.rate,
      y + 5,
      { width: 75, align: 'right', lineBreak: false },
    );
    doc.text(String(item.quantity), COL.qty, y + 5, {
      width: 20,
      align: 'center',
      lineBreak: false,
    });
    doc.text(this.fmtCurrency(taxable, totals.currency), COL.taxable, y + 5, {
      width: 55,
      align: 'right',
      lineBreak: false,
    });
    doc.text(
      item.taxRate
        ? `${this.fmtCurrency(item.taxAmount, totals.currency)} (${item.taxRate}%)`
        : this.fmtCurrency(item.taxAmount, totals.currency),
      COL.taxAmt,
      y + 5,
      { width: 45, align: 'right', lineBreak: false },
    );
    doc.text(this.fmtCurrency(rowTotal, totals.currency), COL.amount, y + 5, {
      width: 35,
      align: 'right',
      lineBreak: false,
    });

    // --- 4. FINALIZE ROW Y COORDINATE ---
    const nextRowY = y + finalRowHeight;
    this.hr(doc, nextRowY, '#e0e0e0');

    return nextRowY; // Return the exact starting point for the next row
  }

  // ════════════════════════════════════════════════════════════════
  // SECTION: Totals block (right-aligned)
  // ════════════════════════════════════════════════════════════════
  private drawTotals(
    doc: PDFKit.PDFDocument,
    p: StandardizedInvoicePayload,
    y: number,
    primary: string,
  ): number {
    const t = p.totals;
    const cur = t.currency;
    const labelX = M + CW - 230;
    const valX = M + CW - 80;
    const valW = 75;

    const row = (
      label: string,
      value: string,
      bold = false,
      accentColor?: string,
    ) => {
      doc
        .fontSize(8)
        .font(bold ? 'Helvetica-Bold' : 'Helvetica')
        .fillColor(accentColor ?? '#333333')
        .text(label, labelX, y, {
          width: 145,
          align: 'right',
          lineBreak: false,
        });
      doc
        .font(bold ? 'Helvetica-Bold' : 'Helvetica')
        .fillColor(accentColor ?? '#333333')
        .text(value, valX, y, {
          width: valW,
          align: 'right',
          lineBreak: false,
        });
      y += 14;
    };

    y += 6;

    row('Taxable Amount', this.fmtCurrency(t.subTotal, cur));

    // Show CGST/SGST or IGST depending on which is non-zero
    if (t.totalCgst > 0 || t.totalSgst > 0) {
      row(`CGST`, this.fmtCurrency(t.totalCgst, cur));
      row(`SGST`, this.fmtCurrency(t.totalSgst, cur));
    } else if (t.totalIgst > 0) {
      row('IGST 18.0%', this.fmtCurrency(t.totalIgst, cur));
    }

    // Grand Total row
    this.hr(doc, y, '#aaaaaa');
    y += 6;

    doc
      .fontSize(11)
      .font('Helvetica-Bold')
      .fillColor('#111111')
      .text('Total', labelX, y, {
        width: 145,
        align: 'right',
        lineBreak: false,
      });
    doc
      .fontSize(11)
      .font('Helvetica-Bold')
      .fillColor(primary)
      .text(this.fmtCurrency(t.grandTotal, cur), valX, y, {
        width: valW,
        align: 'right',
        lineBreak: false,
      });
    y += 18;

    this.hr(doc, y);
    return y + 6;
  }

  // ════════════════════════════════════════════════════════════════
  // SECTION: Total items + amount in words row
  // ════════════════════════════════════════════════════════════════
  private drawAmountInWords(
    doc: PDFKit.PDFDocument,
    p: StandardizedInvoicePayload,
    y: number,
  ): number {
    const totalItems = p.items.reduce((s, i) => s + i.quantity, 0);
    const amtLabel = `Total Items / Qty : ${p.items.length} / ${totalItems.toFixed(3)}`;
    const words = p.totals.grandTotalInWords ?? '';
    const wordsLabel = `Total amount (in words): INR ${words}`;

    doc
      .fontSize(7.5)
      .font('Helvetica')
      .fillColor('#444444')
      .text(amtLabel, M, y, { width: CW / 3, lineBreak: false });
    doc.text(wordsLabel, M + CW / 3, y, {
      width: (CW * 2) / 3,
      align: 'right',
      lineBreak: false,
    });
    y += 12;
    this.hr(doc, y);
    return y + 8;
  }

  // ════════════════════════════════════════════════════════════════
  // SECTION: Signatory / "For {Company}" block (right)
  // ════════════════════════════════════════════════════════════════
  private drawSignatory(
    doc: PDFKit.PDFDocument,
    p: StandardizedInvoicePayload,
    y: number,
    primary: string,
  ): number {
    const sigX = M + CW - 140;
    const sigW = 140;

    doc
      .fontSize(8)
      .font('Helvetica')
      .fillColor('#333333')
      .text(`For ${p.legal.tradeName ?? p.legal.legalName}`, sigX, y, {
        width: sigW,
        align: 'right',
      });
    y += 12;

    // Signature image or placeholder circle
    if (p.footer.signatorySignatureBuffer) {
      try {
        doc.image(p.footer.signatorySignatureBuffer, sigX + 40, y, {
          fit: [80, 36],
        });
      } catch {
        /* skip */
      }
    } else {
      // Dashed circle to mimic an ink stamp placeholder
      doc
        .circle(sigX + sigW / 2, y + 22, 22)
        .dash(3, { space: 3 })
        .strokeColor('#aaaaaa')
        .stroke()
        .undash();
      doc
        .fontSize(7)
        .font('Helvetica')
        .fillColor('#aaaaaa')
        .text('SIGNATURE', sigX, y + 17, { width: sigW, align: 'center' });
    }
    y += 50;

    doc
      .fontSize(8)
      .font('Helvetica-Bold')
      .fillColor('#222222')
      .text(p.footer.signatoryName ?? 'Authorized Signatory', sigX, y, {
        width: sigW,
        align: 'right',
      });
    if (p.footer.signatoryDesignation) {
      y += 11;
      doc
        .fontSize(7)
        .font('Helvetica')
        .fillColor('#555555')
        .text(p.footer.signatoryDesignation, sigX, y, {
          width: sigW,
          align: 'right',
        });
    }
    y += 14;
    this.hr(doc, y);
    return y + 8;
  }

  // ════════════════════════════════════════════════════════════════
  // SECTION: Notes
  // ════════════════════════════════════════════════════════════════
  private drawNotes(doc: PDFKit.PDFDocument, notes: string, y: number): number {
    doc
      .fontSize(8)
      .font('Helvetica-Bold')
      .fillColor('#333333')
      .text('Notes:', M, y);
    y += 11;
    doc
      .fontSize(7.5)
      .font('Helvetica')
      .fillColor('#555555')
      .text(notes, M, y, { width: CW });
    y += doc.heightOfString(notes, { width: CW }) + 10;
    return y;
  }

  // ════════════════════════════════════════════════════════════════
  // SECTION: Terms & Conditions
  // ════════════════════════════════════════════════════════════════
  private drawTerms(doc: PDFKit.PDFDocument, terms: string, y: number): void {
    doc
      .fontSize(8)
      .font('Helvetica-Bold')
      .fillColor('#333333')
      .text('Terms and Conditions:', M, y);
    y += 11;
    const lines = terms.split('\n');
    for (const [i, line] of lines.entries()) {
      doc
        .fontSize(7)
        .font('Helvetica')
        .fillColor('#555555')
        .text(`${i + 1}. ${line.replace(/^\d+\.\s*/, '')}`, M, y, {
          width: CW,
        });
      y += 10;
    }
  }

  // ════════════════════════════════════════════════════════════════
  // SECTION: Page footer
  // ════════════════════════════════════════════════════════════════
  private drawPageFooter(doc: PDFKit.PDFDocument): void {
    const y = PAGE_H - 30;
    this.hr(doc, y - 6);
    doc
      .fontSize(7)
      .font('Helvetica')
      .fillColor('#888888')
      .text('Page 1 / 1', M, y, { width: 60, lineBreak: false });
    doc.text('This is a digitally signed document.', M + 60, y, {
      width: CW - 60,
      align: 'center',
      lineBreak: false,
    });
  }

  // ════════════════════════════════════════════════════════════════
  // HELPERS
  // ════════════════════════════════════════════════════════════════
  private hr(doc: PDFKit.PDFDocument, y: number, color = '#e5e7eb'): void {
    doc
      .strokeColor(color)
      .lineWidth(0.5)
      .moveTo(M, y)
      .lineTo(M + CW, y)
      .stroke();
  }

  private fmtCurrency(amount: number, currency = 'INR'): string {
    const symbol =
      currency === 'INR' ? '₹' : currency === 'USD' ? '$' : `${currency} `;
    return `${symbol}${amount.toFixed(2)}`;
  }

  private fmtDate(date: Date): string {
    const d = String(date.getDate()).padStart(2, '0');
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const y = date.getFullYear();
    return `${d} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][date.getMonth()]} ${y}`;
  }

  private truncate(str: string, max: number): string {
    return str.length > max ? str.slice(0, max - 1) + '…' : str;
  }
}
