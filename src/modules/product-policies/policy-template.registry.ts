import { Injectable, NotFoundException } from '@nestjs/common';
import { PolicyDocumentPayload } from './interfaces/policy-document.interface';

export interface IPolicyTemplate {
  readonly templateId: string;
  render(payload: PolicyDocumentPayload): Promise<Buffer>;
}

@Injectable()
export class PolicyTemplateRegistry {
  private templates = new Map<string, IPolicyTemplate>();

  register(template: IPolicyTemplate) {
    if (this.templates.has(template.templateId)) {
      throw new Error(
        `Policy Template with ID '${template.templateId}' is already registered.`,
      );
    }
    this.templates.set(template.templateId, template);
  }

  getTemplate(templateId: string): IPolicyTemplate {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new NotFoundException(`Policy template '${templateId}' not found.`);
    }
    return template;
  }
}
