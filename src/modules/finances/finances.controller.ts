import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { FinancesService } from './finances.service';

@Controller({ version: '1', path: 'finances' })
export class FinancesController {
  constructor(private readonly financesService: FinancesService) {}

  @Get('earnings')
  async getVendorEarnings(@Headers('company-domain') domain: string) {
    return this.financesService.getVendorEarnings(domain);
  }
  @Get('gst')
  async getGstRegistrations(@Headers('company-domain') domain: string) {
    return this.financesService.getGstRegistrations(domain);
  }

  @Post('gst')
  async addGstRegistration(
    @Headers('company-domain') domain: string,
    @Body() payload: any,
  ) {
    return this.financesService.addGstRegistration(domain, payload);
  }
  @Post('tax-profiles')
  async createTaxProfile(
    @Headers('company-domain') domain: string,
    @Body() payload: any,
  ) {
    return this.financesService.createTaxProfile(domain, payload);
  }

  @Post('tax-rates')
  async createTaxRate(
    @Headers('company-domain') domain: string,
    @Body() payload: any,
  ) {
    return this.financesService.createTaxRate(domain, payload);
  }
  @Post('product-tax-mappings')
  async assignProductTax(
    @Headers('company-domain') domain: string,
    @Body() payload: { product_id: string; tax_rate_id: string },
  ) {
    return this.financesService.assignTaxToProduct(domain, payload);
  }
  @Get('tax-profiles')
  async getTaxProfiles(@Headers('company-domain') domain: string) {
    return this.financesService.getTaxProfiles(domain);
  }

  @Get('tax-rates')
  async getTaxRates(@Headers('company-domain') domain: string) {
    return this.financesService.getTaxRates(domain);
  }

  @Get('product-tax-mappings')
  async getProductTaxMapping(@Headers('company-domain') domain: string) {
    return this.financesService.getProductTaxMapping(domain);
  }

  @Get('get-invoices')
  async getGstInvoices(@Headers('company-domain') domain: string) {
    return this.financesService.getGstInvoices(domain);
  }
  @Get('gst/:id')
  async getSingleGst(
    @Param('id') id: string,
    @Headers('company-domain') domain: string,
  ) {
    return this.financesService.getSingleGstRegistration(id, domain);
  }

  @Patch('gst/:id')
  async updateGst(
    @Param('id') id: string,
    @Headers('company-domain') domain: string,
    @Body() payload: any,
  ) {
    return this.financesService.updateGstRegistration(id, domain, payload);
  }

  @Patch('tax-profiles/:id')
  async updateTaxProfile(
    @Param('id') id: string,
    @Headers('company-domain') domain: string,
    @Body() payload: any,
  ) {
    return this.financesService.updateTaxProfile(id, domain, payload);
  }
}
