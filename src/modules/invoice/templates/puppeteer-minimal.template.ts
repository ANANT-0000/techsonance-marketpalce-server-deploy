import {
  Injectable,
  OnModuleInit,
  InternalServerErrorException,
} from '@nestjs/common';
import {
  IInvoiceTemplate,
  StandardizedInvoicePayload,
} from '../interfaces/invoice.interface';
import { InvoiceTemplateRegistry } from '../template.registry';
import * as puppeteer from 'puppeteer';
import * as handlebars from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class PuppeteerMinimalTemplate
  implements IInvoiceTemplate, OnModuleInit
{
  readonly templateId = 'minimal';
  readonly templateLabel = 'Minimal Clean Invoice (Puppeteer)';
  private compiledTemplate: handlebars.TemplateDelegate;

  constructor(private readonly registry: InvoiceTemplateRegistry) {
    const templatePath = path.join(
      process.cwd(),
      'src/modules/invoice/html-templates/minimal.hbs',
    );
    try {
      const htmlString = fs.readFileSync(templatePath, 'utf8');
      this.compiledTemplate = handlebars.compile(htmlString);
    } catch (error) {
      console.error(
        `[PuppeteerMinimalTemplate] Failed to load HTML template:`,
        error,
      );
      throw new InternalServerErrorException(
        'Failed to compile minimal invoice template',
      );
    }
  }

  onModuleInit(): void {
    this.registry.register(this);
  }

  // ════════════════════════════════════════════════════════════════
  // ENTRY POINT
  // ════════════════════════════════════════════════════════════════
  async render(payload: StandardizedInvoicePayload): Promise<Buffer> {
    if (!this.compiledTemplate) {
      throw new InternalServerErrorException('Minimal template not compiled');
    }

    const formattedPayload = this._formatPayload(payload);
    const finalHtml = this.compiledTemplate(formattedPayload);

    const browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });

    try {
      const page = await browser.newPage();
      await page.setContent(finalHtml, { waitUntil: 'load' });

      const pdfUint8Array = await page.pdf({
        format: 'A4',
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: `<div></div>`,
        footerTemplate: `
          <div style="font-size: 8px; width: 100%; text-align: center; color: #aaa; padding-bottom: 10px;">
            Page <span class="pageNumber"></span> of <span class="totalPages"></span>
          </div>
        `,
        margin: { top: '10mm', right: '0mm', bottom: '15mm', left: '0mm' },
      });

      return Buffer.from(pdfUint8Array);
    } finally {
      await browser.close();
    }
  }

  // ════════════════════════════════════════════════════════════════
  // PRIVATE: shape the payload for the Handlebars template
  // ════════════════════════════════════════════════════════════════
  private _formatPayload(p: StandardizedInvoicePayload) {
    const fmtDate = (d: Date | undefined): string => {
      if (!d) return '';
      const date = d instanceof Date ? d : new Date(d);
      return date.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    };

    const sym =
      p.totals.currency === 'INR'
        ? '₹'
        : p.totals.currency === 'USD'
          ? '$'
          : `${p.totals.currency} `;
    const fc = (amount: number) => `${sym}${Number(amount).toFixed(2)}`;

    return {
      meta: {
        invoiceNumber: p.meta.invoiceNumber,
        invoiceDate: fmtDate(p.meta.invoiceDate),
        dueDate: fmtDate(p.meta.dueDate ?? p.meta.invoiceDate),
      },
      legal: {
        legalName: p.legal.legalName,
        tradeName: p.legal.tradeName ?? p.legal.legalName,
        supportEmail: p.legal.supportEmail ?? null,
        taxIds: p.legal.taxIds,
      },
      customer: {
        name: p.customer.name,
        billingAddress: p.customer.billingAddress,
        shippingAddress: p.customer.shippingAddress,
      },
      items: p.items.map((item, idx) => ({
        index: idx + 1,
        name: item.name,
        quantity: item.quantity,
        unitPrice: fc(item.unitPrice),
        taxRate: item.taxRate ? `${item.taxRate}%` : '-',
        totalAmount: fc(item.totalAmount),
      })),
      totals: {
        subTotal: fc(p.totals.subTotal),
        totalCgst: p.totals.totalCgst > 0 ? fc(p.totals.totalCgst) : null,
        totalSgst: p.totals.totalSgst > 0 ? fc(p.totals.totalSgst) : null,
        totalIgst: p.totals.totalIgst > 0 ? fc(p.totals.totalIgst) : null,
        grandTotal: fc(p.totals.grandTotal),
        grandTotalInWords: p.totals.grandTotalInWords ?? '',
        currency: p.totals.currency,
      },
      footer: {
        notes: p.footer.notes ?? null,
        termsAndConditions: p.footer.termsAndConditions ?? null,
        signatoryName: p.footer.signatoryName ?? 'Authorized Signatory',
      },
    };
  }
}
