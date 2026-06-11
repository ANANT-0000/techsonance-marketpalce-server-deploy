import { Inject, Injectable, InternalServerErrorException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DRIZZLE, type DrizzleService } from '../../drizzle/drizzle.module';
import { customer_feedback } from '../../drizzle/schema';
import { CompanyService } from '../company/company.service';
import { domainExtractor } from '../../common/filters/domainExtractor.filter';
import { FeedbackErrorKeyEnum } from './constants/feedback.enums';

@Injectable()
export class FeedbackService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService,
    private readonly companyService: CompanyService,
  ) {}

  private async resolveCompanyId(domain: string): Promise<string> {
    const filterDomain = domainExtractor(domain);
    return this.companyService.find(filterDomain);
  }

  async createFeedback(
    userId: string,
    domain: string,
    feedbackData: {
      type: string;
      subject?: string;
      message: string;
      orderId?: string;
      ticketId?: string;
    },
  ) {
    try {
      const companyId = await this.resolveCompanyId(domain);
      const [newFeedback] = await this.db
        .insert(customer_feedback)
        .values({
          type: feedbackData.type,
          subject: feedbackData.subject || null,
          message: feedbackData.message,
          user_id: userId,
          company_id: companyId,
          order_id: feedbackData.orderId || null,
          ticket_id: feedbackData.ticketId || null,
          priority: 'MEDIUM',
          status: 'NEW',
        })
        .returning();

      return newFeedback;
    } catch (error) {
      throw new InternalServerErrorException(FeedbackErrorKeyEnum.FAILED_TO_SUBMIT_FEEDBACK);
    }
  }

  async getFeedbackList(domain: string) {
    try {
      const companyId = await this.resolveCompanyId(domain);
      return await this.db.query.customer_feedback.findMany({
        where: eq(customer_feedback.company_id, companyId),
        orderBy: (table, { desc }) => [desc(table.created_at)],
      });
    } catch (error) {
      throw new InternalServerErrorException(FeedbackErrorKeyEnum.FAILED_TO_FETCH_FEEDBACK_LIST);
    }
  }
}
