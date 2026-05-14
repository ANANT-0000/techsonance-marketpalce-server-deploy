import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { IInvoiceTemplate } from './interfaces/invoice.interface';

/**
 * InvoiceTemplateRegistry — Strategy-pattern registry.
 *
 * HOW TO ADD A NEW TEMPLATE:
 *  1. Create a new file in `./templates/your-template.template.ts`
 *  2. Implement IInvoiceTemplate  (give it a unique templateId)
 *  3. Decorate the class with @Injectable() + implement OnModuleInit
 *  4. Call `this.registry.register(this)` inside onModuleInit()
 *  5. Add it to the `providers` array in invoice.module.ts
 *
 * That is ALL. This registry and the core service require ZERO changes.
 */
@Injectable()
export class InvoiceTemplateRegistry {
  private readonly logger = new Logger(InvoiceTemplateRegistry.name);
  private readonly templates = new Map<string, IInvoiceTemplate>();

  /**
   * Called by each template's onModuleInit().
   * Throws if a duplicate templateId is registered.
   */
  register(template: IInvoiceTemplate): void {
    if (this.templates.has(template.templateId)) {
      throw new Error(
        `[TemplateRegistry] Duplicate templateId "${template.templateId}". ` +
          `Each template must have a unique ID.`,
      );
    }
    this.templates.set(template.templateId, template);
    this.logger.log(
      `Registered invoice template: "${template.templateId}" (${template.templateLabel})`,
    );
  }

  /**
   * Retrieves a registered template by ID.
   * Falls back to 'standard-gst' if the requested ID is not found
   * (safe default so existing orders don't break when a template is removed).
   */
  getTemplate(templateId: string): IInvoiceTemplate {
    const template =
      this.templates.get(templateId) ?? this.templates.get('standard-gst');

    if (!template) {
      throw new NotFoundException(
        `Invoice template "${templateId}" not found and no fallback "standard-gst" is registered.`,
      );
    }

    if (!this.templates.has(templateId)) {
      this.logger.warn(
        `Template "${templateId}" not found — falling back to "standard-gst".`,
      );
    }

    return template;
  }

  /** Returns a list of all registered template IDs + labels (for admin UI). */
  listTemplates(): { templateId: string; templateLabel: string }[] {
    return Array.from(this.templates.values()).map((t) => ({
      templateId: t.templateId,
      templateLabel: t.templateLabel,
    }));
  }

  hasTemplate(templateId: string): boolean {
    return this.templates.has(templateId);
  }
}
