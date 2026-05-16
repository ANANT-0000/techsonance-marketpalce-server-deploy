// src/modules/product-policies/services/policy-document.service.ts
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
      this.logger.log(
        `Generating policy document for OrderItem: ${orderItemId}`,
      );

      // 1. Build Payload
      const payload = await this.payloadBuilder.buildPayload(orderItemId);

      // 2. Render PDF
      const template = this.templateRegistry.getTemplate(templateId);
      const pdfBuffer = await template.render(payload);

      // 3. Upload to Cloud Storage
      const fileName = `warranty_${payload.meta.orderNumber}_${orderItemId}`;
      const documentUrl = await this.uploadToCloudService.uploadInvoice(
        pdfBuffer,
        fileName,
      ); // Reusing upload logic

      // 4. Update Database
      await this.db
        .update(order_item_policy)
        .set({
          document_url: documentUrl,
          document_generated: true,
        })
        .where(eq(order_item_policy.order_item_id, orderItemId));

      this.logger.log(
        `Successfully generated and linked policy document: ${documentUrl}`,
      );

      return documentUrl;
    } catch (error) {
      this.logger.error(
        `Failed to generate policy document for item ${orderItemId}`,
        error.stack,
      );
      throw error;
    }
  }
}
