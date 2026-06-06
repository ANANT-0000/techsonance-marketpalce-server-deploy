import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { TicketsService } from './tickets.service';

@Controller({ version: '1', path: 'tickets' })
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Post('customer/:customerId')
  @HttpCode(HttpStatus.CREATED)
  async createTicket(
    @Param('customerId') customerId: string,
    @Headers('company-domain') domain: string,
    @Body() ticketData: { 
      subject: string; 
      description: string; 
      category: string; 
      orderId?: string; 
      attachmentUrl?: string;
    },
  ) {
    return this.ticketsService.createTicket(customerId, domain, ticketData);
  }

  @Get('customer/:customerId')
  @HttpCode(HttpStatus.OK)
  async getTickets(
    @Param('customerId') customerId: string,
    @Headers('company-domain') domain: string,
  ) {
    return this.ticketsService.getTickets(customerId, domain);
  }

  @Post(':ticketId/comments')
  @HttpCode(HttpStatus.CREATED)
  async addComment(
    @Param('ticketId') ticketId: string,
    @Body()
    commentData: {
      userId: string;
      commentText: string;
      isInternal?: boolean;
    },
  ) {
    return this.ticketsService.addComment(
      ticketId,
      commentData.userId,
      commentData.commentText,
      commentData.isInternal,
    );
  }

  @Get(':ticketId/comments')
  @HttpCode(HttpStatus.OK)
  async getComments(@Param('ticketId') ticketId: string) {
    return this.ticketsService.getComments(ticketId);
  }

  @Post(':ticketId/rating')
  @HttpCode(HttpStatus.CREATED)
  async submitRating(
    @Param('ticketId') ticketId: string,
    @Body()
    ratingData: {
      userId: string;
      satisfactionRating: number;
      resolved: boolean;
      resolutionComment?: string;
      npsScore?: number;
    },
  ) {
    return this.ticketsService.submitRating(ticketId, ratingData.userId, ratingData);
  }
}
