// ../modules/product-policies/services/policy-document.service.ts
import { Injectable, Inject, Logger } from '@nestjs/common';
import { PolicyPayloadBuilderService } from './policy-payload-builder.service';
import { UploadToCloudService } from '../../utils/upload-to-cloud/upload-to-cloud.service';
import { DRIZZLE, type DrizzleService } from '../../drizzle/drizzle.module';
import { order_item_policy } from '../../drizzle/schema';
import { eq } from 'drizzle-orm';
import { PolicyTemplateRegistry } from './policy-template.registry';

@Injectable()
export class PolicyDocumentService {
  private readonly logger = new Logger(PolicyDocumentService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService,
    private readonly payloadBuilder: PolicyPayloadBuilderService,
    private readonly templateRegistry: PolicyTemplateRegistry,
    private readonly uploadToCloudService: UploadToCloudService,
  ) {}

  /**
   * Called via an Event Listener or Order Flow after successful payment
   */
  async generatePolicyDocument(
    orderItemId: string,
    templateId: string = 'standard-warranty',
  ) {
    try {
      console.log(
        `[PolicyDocumentService.generatePolicyDocument] Request received for orderItemId: ${orderItemId}, templateId: ${templateId}`,
      );

      // 1. Build Payload
      console.log(
        '[PolicyDocumentService.generatePolicyDocument] Building policy payload',
      );
      const payload = await this.payloadBuilder.buildPayload(orderItemId);

      // 2. Render PDF
      console.log(
        '[PolicyDocumentService.generatePolicyDocument] Rendering policy template',
      );
      const template = this.templateRegistry.getTemplate(templateId);
      const pdfBuffer = await template.render(payload);

      // 3. Upload to Cloud Storage
      console.log(
        '[PolicyDocumentService.generatePolicyDocument] Uploading rendered policy document',
      );
      const documentUrl = await this.uploadToCloudService.uploadWarranty(
        pdfBuffer,
        `warranty_${payload.meta.orderNumber}_${orderItemId}`,
      );

      // 4. Update Database
      console.log(
        '[PolicyDocumentService.generatePolicyDocument] Updating policy document URL in database',
      );
      await this.db
        .update(order_item_policy)
        .set({
          document_url: documentUrl,
          document_generated: true,
        })
        .where(eq(order_item_policy.order_item_id, orderItemId))
        .catch((err) => {
          console.error(
            `[PolicyDocumentService.generatePolicyDocument] Failed to update policy record with document URL for item ${orderItemId}`,
            err,
          );
          throw err;
        });

      console.log(
        `[PolicyDocumentService.generatePolicyDocument] Successfully generated policy document: ${documentUrl}`,
      );

      return documentUrl;
    } catch (error) {
      console.error(
        `[PolicyDocumentService.generatePolicyDocument] Failed to generate policy document for item ${orderItemId}`,
        error,
      );
      throw error;
    }
  }
}
