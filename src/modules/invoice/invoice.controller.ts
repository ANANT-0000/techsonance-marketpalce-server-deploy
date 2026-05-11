import { Body, Controller, Headers, Post } from '@nestjs/common';
import { InvoiceService } from './invoice.service';

@Controller({ version: '1', path: 'invoice' })
export class InvoiceController {
  constructor(private readonly invoiceService: InvoiceService) {}
  @Post('bulk-download')
  async getBulkInvoiceUrls(
    @Headers('company-domain') domain: string,
    @Body() payload: { orderIds: string[] },
  ) {
    console.log('Received request for bulk invoice URLs with payload:', payload);
    return this.invoiceService.getBulkInvoiceUrls(domain, payload.orderIds);
  }
}
