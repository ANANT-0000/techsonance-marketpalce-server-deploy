import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { RefundsService } from './refunds.service';

@Controller({ version: '1', path: 'refunds' })
export class RefundsController {
  constructor(private readonly refundsService: RefundsService) {}

  // Vendor manually initiates a refund for a full order
  @Post(':orderId/initiate')
  @HttpCode(HttpStatus.CREATED)
  async initiateRefund(
    @Param('orderId') orderId: string,
    @Body('reason') reason: string,
    @Headers('company-domain') domain: string,
  ) {
    return this.refundsService.initiateRefund({ orderId, reason, domain });
  }

  // Get all refund records for a specific order
  @Get('order/:orderId')
  @HttpCode(HttpStatus.OK)
  async getRefundStatus(
    @Param('orderId') orderId: string,
    @Headers('company-domain') domain: string,
  ) {
    return this.refundsService.getRefundStatus(orderId, domain);
  }

  // Vendor marks a refund as processed
  @Patch(':refundId/process')
  @HttpCode(HttpStatus.OK)
  async processRefund(
    @Param('refundId') refundId: string,
    @Headers('company-domain') domain: string,
  ) {
    return this.refundsService.processRefund(refundId, domain);
  }

  // List all refunds for vendor dashboard
  @Get()
  @HttpCode(HttpStatus.OK)
  async getCompanyRefunds(@Headers('company-domain') domain: string) {
    return this.refundsService.getCompanyRefunds(domain);
  }
}
