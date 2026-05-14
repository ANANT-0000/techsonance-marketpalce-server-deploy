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
export class PuppeteerGstTemplate implements IInvoiceTemplate, OnModuleInit {
  readonly templateId = 'standard-gst';
  private compiledTemplate: handlebars.TemplateDelegate;

  constructor(private readonly registry: InvoiceTemplateRegistry) {
    const templatePath = path.join(
      process.cwd(),
      'src/modules/invoice/html-templates/standard-gst.hbs',
    );
    try {
      const htmlString = fs.readFileSync(templatePath, 'utf8');
      this.compiledTemplate = handlebars.compile(htmlString);
    } catch (error) {
      console.error(`[PuppeteerTemplate] Failed to load HTML template:`, error);
    }
  }

  onModuleInit() {
    this.registry.register(this);
  }

  async render(payload: StandardizedInvoicePayload): Promise<Buffer> {
    if (!this.compiledTemplate)
      throw new InternalServerErrorException('Template not compiled');

    // Format numbers to 2 decimal places for Handlebars
    const formattedPayload = {
      ...payload,
      meta: {
        ...payload.meta,
        invoiceDate:
          payload.meta.invoiceDate instanceof Date
            ? payload.meta.invoiceDate.toLocaleDateString()
            : payload.meta.invoiceDate,
      },
      items: payload.items.map((item) => ({
        ...item,
        unitPrice: item.unitPrice.toFixed(2),
        taxAmount: item.taxAmount.toFixed(2),
        totalAmount: item.totalAmount.toFixed(2),
      })),
      totals: {
        ...payload.totals,
        subTotal: payload.totals.subTotal.toFixed(2),
        totalTax: payload.totals.totalTax.toFixed(2),
        grandTotal: payload.totals.grandTotal.toFixed(2),
      },
    };

    const finalHtml = this.compiledTemplate(formattedPayload);

    const browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
      ],
    });

    try {
      const page = await browser.newPage();
      await page.setContent(finalHtml, { waitUntil: 'networkidle0' });

      const pdfUint8Array = await page.pdf({
        format: 'A4',
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: `<div></div>`,
        footerTemplate: `
          <div style="font-size: 8px; width: 100%; text-align: center; color: #888; padding-bottom: 10px;">
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
}
