import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { FeedbackService } from './feedback.service';

@Controller({ version: '1', path: 'feedback' })
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @Post('customer/:customerId')
  @HttpCode(HttpStatus.CREATED)
  async createFeedback(
    @Param('customerId') customerId: string,
    @Headers('company-domain') domain: string,
    @Body()
    feedbackData: {
      type: string;
      subject?: string;
      message: string;
      orderId?: string;
      ticketId?: string;
    },
  ) {
    return this.feedbackService.createFeedback(customerId, domain, feedbackData);
  }

  @Get('admin')
  @HttpCode(HttpStatus.OK)
  async getFeedbackList(@Headers('company-domain') domain: string) {
    return this.feedbackService.getFeedbackList(domain);
  }
}
