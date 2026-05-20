import { Injectable } from '@nestjs/common';
import * as puppeteer from 'puppeteer';
import * as handlebars from 'handlebars';
import * as fs from 'fs';
import { PolicyDocumentPayload } from '../interfaces/policy-document.interface';
import { IPolicyTemplate } from '../policy-template.registry';
import { resolveTemplatePath } from '../../../utils/resolve-template-path.util';

@Injectable()
export class PuppeteerWarrantyTemplate implements IPolicyTemplate {
  public readonly templateId = 'standard-warranty';
  readonly templateLabel = 'Standard Warranty Policy (Puppeteer)';
  private compiledTemplate: HandlebarsTemplateDelegate;

  constructor() {
    const templatePath = resolveTemplatePath(
      'modules',
      'product-policies',
      'html-templates',
      'warranty.hbs',
    );
    const templateHtml = fs.readFileSync(templatePath, 'utf8');
    this.compiledTemplate = handlebars.compile(templateHtml);
  }

  async render(payload: PolicyDocumentPayload): Promise<Buffer> {
    const formatted = this._formatPayload(payload);
    const html = this.compiledTemplate(formatted);

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'load' });

      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '20px', right: '20px', bottom: '20px', left: '20px' },
      });

      return Buffer.from(pdfBuffer);
    } finally {
      await browser.close();
    }
  }
  private _formatPayload(p: PolicyDocumentPayload) {
    const fmtDate = (d: Date | string | null | undefined): string => {
      if (!d) return 'N/A';
      const dt = typeof d === 'string' ? new Date(d) : d;
      return dt.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    };

    const fmtPrice = (price: string | number): string => {
      const num = typeof price === 'string' ? parseFloat(price) : price;
      return `₹${num.toFixed(2)}`;
    };

    const fmtPolicyType = (type: string): string =>
      type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

    return {
      meta: {
        documentId: p.meta.documentId,
        issueDate: fmtDate(p.meta.issueDate),
        orderNumber: p.meta.orderNumber,
      },
      customer: {
        name: p.customer.name,
        email: p.customer.email,
        phone: p.customer.phone ?? null,
      },
      product: {
        name: p.product.name,
        sku: p.product.sku ?? null,
        quantity: p.product.quantity,
        price: fmtPrice(p.product.price),
      },
      policy: {
        policyName: p.policy.policyName,
        policyType: fmtPolicyType(p.policy.policyType),
        startDate: fmtDate(p.policy.startDate),
        endDate: p.policy.endDate ? fmtDate(p.policy.endDate) : null,
        coverageDescription: p.policy.coverageDescription ?? null,
        exclusions: p.policy.exclusions ?? null,
        serviceProvider: p.policy.serviceProvider ?? null,
        claimEmail: p.policy.claimEmail ?? null,
        claimPhone: p.policy.claimPhone ?? null,
        processDescription: p.policy.processDescription ?? null,
      },
      branding: {
        companyName: p.branding.companyName,
        logoUrl: p.branding.logoUrl ?? null,
      },
    };
  }
}
