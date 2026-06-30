import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { InvoiceService } from './invoice.service.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RoleGuard } from '../../guards/role.guard.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Role } from '../../enums/role.enum.js';
@Controller({ version: '1', path: 'invoice' })
export class InvoiceController {
  constructor(private readonly invoiceService: InvoiceService) {}
  @Post('bulk-download')
  @UseGuards(RoleGuard)
  @Roles(Role.ADMIN, Role.VENDOR)
  async getBulkInvoiceUrls(
    @Headers('company-domain') domain: string,
    @Body() payload: { orderIds: string[] },
  ) {
    return this.invoiceService.getBulkInvoiceUrls(domain, payload.orderIds);
  }
  @Get('templates')
  @UseGuards(RoleGuard)
  @Roles(Role.ADMIN)
  listTemplates() {
    // return this.invoiceService.listAvailableTemplates();
  }
  @Get('payload/:orderId')
  @UseGuards(RoleGuard)
  @Roles(Role.ADMIN, Role.VENDOR, Role.CUSTOMER)
  async getInvoicePayload(
    @Param('orderId') orderId: string,
    @Headers('company-domain') domain: string,
  ) {
    return this.invoiceService.getInvoicePayload(orderId, domain);
  }
}
