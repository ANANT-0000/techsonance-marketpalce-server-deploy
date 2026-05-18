// ../../modules/invoice/templates/puppeteer-gst.template.ts
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
import { resolveTemplatePath } from 'src/utils/resolve-template-path.util';

// ── Register helpers once at module level, never in constructor ───
let _helpersRegistered = false;
function registerHandlebarsHelpers() {
  if (_helpersRegistered) return;
  _helpersRegistered = true;

  handlebars.registerHelper('eq', (a: unknown, b: unknown) => a === b);
  handlebars.registerHelper('gt', (a: number, b: number) => a > b);
  handlebars.registerHelper('ne', (a: unknown, b: unknown) => a !== b);
  handlebars.registerHelper(
    'and',
    (a: unknown, b: unknown) => Boolean(a) && Boolean(b),
  );

  handlebars.registerHelper(
    'ifCond',
    function (
      this: unknown,
      v1: unknown,
      v2: unknown,
      options: Handlebars.HelperOptions,
    ) {
      return v1 === v2 ? options.fn(this) : options.inverse(this);
    },
  );

  handlebars.registerHelper(
    'unless',
    function (
      this: unknown,
      condition: unknown,
      options: Handlebars.HelperOptions,
    ) {
      return !condition ? options.fn(this) : options.inverse(this);
    },
  );
}

@Injectable()
export class PuppeteerGstTemplate implements IInvoiceTemplate, OnModuleInit {
  readonly templateId = 'standard-gst';
  readonly templateLabel = 'Standard GST Invoice (Puppeteer)';
  private compiledTemplate!: handlebars.TemplateDelegate;

  constructor(private readonly registry: InvoiceTemplateRegistry) {
    registerHandlebarsHelpers();

    const templatePath = resolveTemplatePath(
      'modules',
      'invoice',
      'html-templates',
      'standard-gst.hbs',
    );
    try {
      const htmlString = fs.readFileSync(templatePath, 'utf8');
      this.compiledTemplate = handlebars.compile(htmlString);
    } catch (error) {
      console.error(
        '[PuppeteerGstTemplate] Failed to load .hbs template:',
        error,
      );
      throw new InternalServerErrorException(
        'Failed to compile GST invoice template',
      );
    }
  }

  onModuleInit(): void {
    this.registry.register(this);
  }

  // ════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════

  async render(payload: StandardizedInvoicePayload): Promise<Buffer> {
    const ctx = this._buildTemplateContext(payload);
    const html = this.compiledTemplate(ctx);

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
      await page.setContent(html, { waitUntil: 'load' });

      const pdfBytes = await page.pdf({
        format: 'A4',
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: `<div></div>`,
        footerTemplate: `
          <div style="font-size:8px;width:100%;text-align:center;color:#888;padding:0 10px 8px;">
            Page <span class="pageNumber"></span> of <span class="totalPages"></span>
            &nbsp;|&nbsp; This is a digitally generated document.
          </div>`,
        margin: { top: '10mm', right: '0mm', bottom: '14mm', left: '0mm' },
      });

      return Buffer.from(pdfBytes);
    } finally {
      await browser.close();
    }
  }

  // ════════════════════════════════════════════════════════════════
  // PRIVATE: shape payload → Handlebars context
  // ════════════════════════════════════════════════════════════════

  private _buildTemplateContext(p: StandardizedInvoicePayload) {
    const sym =
      p.totals.currency === 'INR'
        ? '₹'
        : p.totals.currency === 'USD'
          ? '$'
          : `${p.totals.currency} `;
    const fc = (n: number) => `${sym}${Number(n).toFixed(2)}`;

    const fmtDate = (d: Date | string | undefined): string => {
      if (!d) return '';
      const dt = d instanceof Date ? d : new Date(d);
      const dd = String(dt.getDate()).padStart(2, '0');
      const mm = String(dt.getMonth() + 1).padStart(2, '0');
      const yyyy = dt.getFullYear();
      return `${dd}.${mm}.${yyyy}`; // Amazon uses DD.MM.YYYY
    };

    const fmtDateTime = (d: Date | string | undefined): string => {
      if (!d) return '';
      const dt = d instanceof Date ? d : new Date(d);
      return `${fmtDate(dt)}, ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}:${String(dt.getSeconds()).padStart(2, '0')} hrs`;
    };

    const hasCgstSgst = p.totals.totalCgst > 0 || p.totals.totalSgst > 0;
    const hasIgst = p.totals.totalIgst > 0;

    return {
      meta: {
        invoiceNumber: p.meta.invoiceNumber,
        invoiceDate: fmtDate(p.meta.invoiceDate),
        orderNumber: p.meta.orderNumber,
        orderDate: fmtDate(p.meta.orderDate),
        dueDate: fmtDate(p.meta.dueDate),
      },

      branding: {
        logoUrl: p.branding.logoUrl ?? null,
        watermarkUrl: p.branding.watermarkUrl ?? null,
        primaryColor: p.branding.primaryColor || '#131921',
        fontFamily: p.branding.fontFamily ?? null,
      },

      seller: {
        legalName: p.seller.legalName,
        tradeName: p.seller.tradeName ?? p.seller.legalName,
        address: p.seller.address,
        taxIds: p.seller.taxIds,
        supportPhone: p.seller.supportPhone ?? null,
        supportEmail: p.seller.supportEmail ?? null,
        websiteUrl: p.seller.websiteUrl ?? null,
      },

      customer: {
        name: p.customer.name,
        phone: p.customer.phone ?? null,
        email: p.customer.email ?? null,
        billingAddress: p.customer.billingAddress,
        shippingAddress: p.customer.shippingAddress,
        placeOfSupply: p.customer.placeOfSupply ?? null,
        placeOfDelivery: p.customer.placeOfDelivery ?? null,
      },

      items: p.items.map((item, idx) => {
        const isCgstSgst = item.taxType === 'CGST+SGST';
        const halfTax = isCgstSgst ? item.taxAmount / 2 : 0;
        return {
          index: idx + 1,
          name: item.name,
          hsnCode: item.hsnCode ?? null,
          sku: item.sku ?? null,
          // description: item.description ?? null,
          quantity: item.quantity,
          unitPrice: fc(item.unitPrice),
          discount: item.discount > 0 ? fc(item.discount) : fc(0),
          netAmount: fc(item.netAmount),
          taxRate: item.taxType === 'EXEMPT' ? 0 : item.taxRate,
          taxType: item.taxType === 'CGST+SGST' ? 'CGST / SGST' : item.taxType,
          isCgstSgst,
          cgstAmount: isCgstSgst ? fc(halfTax) : null,
          sgstAmount: isCgstSgst ? fc(halfTax) : null,
          taxAmount: fc(item.taxAmount),
          totalAmount: fc(item.totalAmount),
        };
      }),

      totals: {
        netAmount: fc(p.totals.netAmount),
        totalCgst: fc(p.totals.totalCgst),
        totalSgst: fc(p.totals.totalSgst),
        totalIgst: fc(p.totals.totalIgst),
        totalTax: fc(p.totals.totalTax),
        grandTotal: fc(p.totals.grandTotal),
        grandTotalInWords: p.totals.grandTotalInWords ?? '',
        currency: p.totals.currency,
        hasCgstSgst,
        hasIgst,
        hasTax: p.totals.totalTax > 0,
        reverseChargeLabel: p.totals.reverseCharge ? 'Yes' : 'No',
      },

      payment: p.payment
        ? {
            transactionId: p.payment.transactionId ?? null,
            paymentMethod: p.payment.paymentMethod ?? null,
            invoiceValue:
              p.payment.invoiceValue != null
                ? p.payment.invoiceValue.toFixed(2)
                : null,
            paidAt: fmtDateTime(p.payment.paidAt),
          }
        : null,

      footer: {
        termsAndConditions: p.footer.termsAndConditions ?? null,
        notes: p.footer.notes ?? null,
        signatoryName: p.footer.signatoryName ?? 'Authorized Signatory',
        signatoryDesignation: p.footer.signatoryDesignation ?? null,
        // Correctly passes base64 data URI — not a raw Buffer
        signatorySignatureDataUri: p.footer.signatorySignatureDataUri ?? null,
        footerDisclaimer: p.footer.footerDisclaimer ?? null,
      },
    };
  }
}
