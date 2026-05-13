// src/modules/invoice/template.registry.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { IInvoiceTemplate } from './interfaces/invoice.interface';

@Injectable()
export class InvoiceTemplateRegistry {
  private templates = new Map<string, IInvoiceTemplate>();

  register(template: IInvoiceTemplate) {
    if (this.templates.has(template.templateId)) {
      throw new Error(
        `Template with ID '${template.templateId}' is already registered.`,
      );
    }
    this.templates.set(template.templateId, template);
    console.log(
      `[TemplateRegistry] Registered template: ${template.templateId}`,
    );
  }

  getTemplate(templateId: string): IInvoiceTemplate {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new NotFoundException(
        `Invoice template '${templateId}' not found.`,
      );
    }
    return template;
  }
}
