import {
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DRIZZLE, type DrizzleService } from '../../drizzle/drizzle.module';
import { support_tickets, ticket_comments, ticket_ratings } from '../../drizzle/schema';
import {
  SupportTicketPriority,
  SupportTicketStatus,
} from '../../drizzle/types/types';
import { domainExtractor } from '../../common/filters/domainExtractor.filter';
import { CompanyService } from '../company/company.service';
import { MailService } from '../../common/services/mail/mail.service';
import { user } from '../../drizzle/schema/users.schema';
import { TicketsErrorKeyEnum } from './constants/tickets.enums';
@Injectable()
export class TicketsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService,
    private readonly companyService: CompanyService,
    private readonly mailService: MailService,
  ) {
  }

  private async resolveCompanyId(domain: string): Promise<string> {
    const filterDomain = domainExtractor(domain);
    return this.companyService.find(filterDomain);
  }

  async createTicket(
    userId: string,
    domain: string,
    ticketData: {
      subject: string;
      description: string;
      category: string;
      orderId?: string;
      attachmentUrl?: string;
    },
  ) {
    try {
      const companyId = await this.resolveCompanyId(domain);
      const [newTicket] = await this.db
        .insert(support_tickets)
        .values({
          subject: ticketData.subject,
          description: ticketData.description,
          category: ticketData.category,
          status: SupportTicketStatus.OPEN,
          priority: SupportTicketPriority.MEDIUM,
          user_id: userId,
          company_id: companyId,
          order_id: ticketData.orderId || null,
          attachment_url: ticketData.attachmentUrl || null,
        })
        .returning();
      // Send confirmation email to the user (best-effort)
      try {
        const [u] = await this.db
          .select({ email: user.email, first_name: user.first_name })
          .from(user)
          .where(eq(user.id, userId))
          .limit(1);
        if (u?.email) {
          const html = `<p>Hi ${u.first_name || 'Customer'},</p>
            <p>Your support ticket <strong>#${newTicket.id}</strong> has been received. Subject: ${newTicket.subject}</p>
            <p>We will update you on the status. You can view your tickets at <a href="${process.env.APP_URL}/customer/support">your support page</a>.</p>`;
          // fire-and-forget; don't fail ticket creation on email errors
          this.mailService
            .sendEmail(
              u.email,
              `Support ticket received: #${newTicket.id}`,
              html,
            )
            .catch((err) => {});
        }
      } catch (err) {
      }
      return newTicket;
    } catch (error) {
      throw new InternalServerErrorException(TicketsErrorKeyEnum.FAILED_TO_CREATE_TICKET, {
        cause: error,
      });
    }
  }

  async getTickets(userId: string, domain: string) {
    try {
      const companyId = await this.resolveCompanyId(domain);

      const ticketsList = await this.db.query.support_tickets.findMany({
        where: and(
          eq(support_tickets.user_id, userId),
          eq(support_tickets.company_id, companyId),
        ),
        with: {
          order: {
            columns: {
              id: true,
              total_amount: true,
              created_at: true,
            },
          },
        },
        orderBy: (table, { desc }) => [desc(table.created_at)],
      });

      return ticketsList;
    } catch (error) {
      throw new InternalServerErrorException(TicketsErrorKeyEnum.FAILED_TO_FETCH_TICKETS, {
        cause: error,
      });
    }
  }

  async addComment(
    ticketId: string,
    userId: string,
    commentText: string,
    isInternal: boolean = false,
  ) {
    try {
      const [newComment] = await this.db
        .insert(ticket_comments)
        .values({
          ticket_id: ticketId,
          user_id: userId,
          comment_text: commentText,
          is_internal: isInternal,
        })
        .returning();

      // Update ticket status on new comment if appropriate
      const [ticket] = await this.db
        .select()
        .from(support_tickets)
        .where(eq(support_tickets.id, ticketId))
        .limit(1);

      if (ticket) {
        if (!isInternal && (ticket.status === SupportTicketStatus.RESOLVED || ticket.status === SupportTicketStatus.CLOSED)) {
          await this.db
            .update(support_tickets)
            .set({ status: SupportTicketStatus.OPEN, updated_at: new Date() })
            .where(eq(support_tickets.id, ticketId));
        } else if (isInternal && ticket.status === SupportTicketStatus.OPEN) {
          await this.db
            .update(support_tickets)
            .set({ status: SupportTicketStatus.IN_PROGRESS, updated_at: new Date() })
            .where(eq(support_tickets.id, ticketId));
        } else {
          await this.db
            .update(support_tickets)
            .set({ updated_at: new Date() })
            .where(eq(support_tickets.id, ticketId));
        }

        // Send confirmation email (best-effort)
        try {
          if (ticket.user_id) {
            const [u] = await this.db
              .select({ email: user.email, first_name: user.first_name })
              .from(user)
              .where(eq(user.id, ticket.user_id))
              .limit(1);

            if (u?.email) {
              const html = `<p>Hi ${u.first_name || 'Customer'},</p>
                <p>There is a new update on your support ticket <strong>#${ticketId}</strong>.</p>
                <p>Message: "${commentText}"</p>
                <p>You can view and reply to this thread at <a href="${process.env.APP_URL}/customer/support">your support page</a>.</p>`;
              
              this.mailService
                .sendEmail(
                  u.email,
                  `Ticket #${ticketId.slice(0, 8)} update`,
                  html,
                )
                .catch((err) => {});
            }
          }
        } catch (emailErr) {
        }
      }

      return newComment;
    } catch (error) {
      throw new InternalServerErrorException(TicketsErrorKeyEnum.FAILED_TO_ADD_COMMENT);
    }
  }

  async getComments(ticketId: string) {
    try {
      return await this.db.query.ticket_comments.findMany({
        where: eq(ticket_comments.ticket_id, ticketId),
        orderBy: (table, { asc }) => [asc(table.created_at)],
        with: {
          user: {
            columns: {
              id: true,
              first_name: true,
              last_name: true,
              email: true,
            },
          },
        },
      });
    } catch (error) {
      throw new InternalServerErrorException(TicketsErrorKeyEnum.FAILED_TO_FETCH_COMMENTS);
    }
  }

  async submitRating(
    ticketId: string,
    userId: string,
    ratingData: {
      satisfactionRating: number;
      resolved: boolean;
      resolutionComment?: string;
      npsScore?: number;
    },
  ) {
    try {
      const [newRating] = await this.db
        .insert(ticket_ratings)
        .values({
          ticket_id: ticketId,
          user_id: userId,
          satisfaction_rating: ratingData.satisfactionRating,
          resolved: ratingData.resolved,
          resolution_comment: ratingData.resolutionComment || null,
          nps_score: ratingData.npsScore || null,
        })
        .returning();

      if (ratingData.resolved) {
        await this.db
          .update(support_tickets)
          .set({ status: SupportTicketStatus.RESOLVED, updated_at: new Date() })
          .where(eq(support_tickets.id, ticketId));
      }

      return newRating;
    } catch (error) {
      throw new InternalServerErrorException(TicketsErrorKeyEnum.FAILED_TO_SUBMIT_TICKET_RATING);
    }
  }
}
