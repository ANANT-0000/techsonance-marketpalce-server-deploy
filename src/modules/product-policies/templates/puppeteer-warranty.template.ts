// src/modules/product-policies/templates/puppeteer-warranty.template.ts
import { Injectable } from '@nestjs/common';
import * as puppeteer from 'puppeteer';
import * as handlebars from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';
import { PolicyDocumentPayload } from '../interfaces/policy-document.interface';
import { IPolicyTemplate } from '../policy-template.registry';
import { resolveTemplatePath } from 'src/utils/resolve-template-path.util';

@Injectable()
export class PuppeteerWarrantyTemplate implements IPolicyTemplate {
  public readonly templateId = 'standard-warranty';
  readonly templateLabel = 'Standard Warranty Policy (Puppeteer)';
  private compiledTemplate: HandlebarsTemplateDelegate;

  constructor() {
    const templatePath = resolveTemplatePath(
      'modules',
      'invoice',
      'html-templates',
      'minimal.hbs',
    );
    const templateHtml = fs.readFileSync(templatePath, 'utf8');
    this.compiledTemplate = handlebars.compile(templateHtml);
  }

  async render(payload: PolicyDocumentPayload): Promise<Buffer> {
    const html = this.compiledTemplate(payload);

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
}
