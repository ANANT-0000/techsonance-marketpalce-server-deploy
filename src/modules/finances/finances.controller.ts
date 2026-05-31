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
import { PaymentStatus } from '../../drizzle/types/types';

@Controller({ version: '1', path: 'finances' })
export class FinancesController {
  constructor(private readonly financesService: FinancesService) {}

  @Get('earnings')
  async getVendorEarnings(
    @Headers('company-domain') domain: string,
    @Query('search') search?: string,
    @Query('offset') offset?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: string,
    @Query('date') date?: string,
    @Query('sortby') sortby?: 'asc' | 'desc' | 'highest' | 'lowest',
  ) {
    return this.financesService.getVendorEarnings(domain, {
      search: search ?? '',
      limit: Number(limit) || 10,
      offset: Number(offset) || 0,
      status: status ? (status.toUpperCase() as PaymentStatus) : undefined,
      date: date ?? '',
      sortby: sortby ?? 'desc',
    });
  }
  @Get('gst')
  async getGstRegistrations(
    @Headers('company-domain') domain: string,
    @Query('search') search?: string,
    @Query('offset') offset?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: string,
    @Query('date') date?: string,
    @Query('sortby') sortby?: 'asc' | 'desc' | 'highest' | 'lowest',
  ) {
    return this.financesService.getGstRegistrations(domain, {
      search: search ?? '',
      limit: Number(limit) || 10,
      offset: Number(offset) || 0,
      status,
      date: date ?? '',
      sortby: sortby ?? 'desc',
    });
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
  @Post('product-tax-bulk-mappings')
  async bulkAssignProductTax(
    @Headers('company-domain') domain: string,
    @Body() payload: { product_ids: string[]; tax_rate_id: string },
  ) {
    return this.financesService.bulkAssignProductTax(domain, payload);
  }
  @Post('calculate-order-taxes')
  async calculateOrderTaxes(
    @Headers('company-domain') domain: string,
    @Body()
    payload: {
      customerAddressId: string;
      cartItems: {
        variantId: string;
        quantity: number;
        price: number;
      }[];
    },
  ) {
    return this.financesService.calculateOrderTaxes(
      payload.customerAddressId,
      payload.cartItems,
      0, // baseTotal
      undefined,
      undefined,
      domain,
    );
  }
  @Get('tax-profiles')
  async getTaxProfiles(
    @Headers('company-domain') domain: string,
    @Query('search') search?: string,
    @Query('offset') offset?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: string,
    @Query('date') date?: string,
    @Query('sortby') sortby?: 'asc' | 'desc' | 'highest' | 'lowest',
  ) {
    return this.financesService.getTaxProfiles(domain, {
      search: search ?? '',
      limit: Number(limit) || 10,
      offset: Number(offset) || 0,
      status,
      date: date ?? '',
      sortby: sortby ?? 'desc',
    });
  }

  @Get('tax-rates')
  async getTaxRates(
    @Headers('company-domain') domain: string,
    @Query('search') search?: string,
    @Query('offset') offset?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: string,
    @Query('date') date?: string,
    @Query('sortby') sortby?: 'asc' | 'desc',
  ) {
    return this.financesService.getTaxRates(domain, {
      search: search ?? '',
      limit: Number(limit) || 10,
      offset: Number(offset) || 0,
      status,
      date: date ?? '',
      sortby: sortby ?? 'desc',
    });
  }
  @Get('tax-rate-options')
  async getTaxRateOptions(
    @Headers('company-domain') domain: string,
    @Query('search') search?: string,
    @Query('offset') offset?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: string,
    @Query('date') date?: string,
    @Query('sortby') sortby?: 'asc' | 'desc' | 'highest' | 'lowest',
  ) {
    return this.financesService.getTaxRateOptions(domain);
  }

  @Get('product-tax-mappings')
  async getProductTaxMapping(
    @Headers('company-domain') domain: string,
    @Query('search') search?: string,
    @Query('offset') offset?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: string,
    @Query('date') date?: string,
    @Query('sortby') sortby?: 'asc' | 'desc' | 'highest' | 'lowest',
  ) {
    return this.financesService.getProductTaxMapping(domain, {
      search: search ?? '',
      limit: Number(limit) || 10,
      offset: Number(offset) || 0,
      status,
      date: date ?? '',
      sortby: sortby ?? 'desc',
    });
  }

  @Get('gst-invoices')
  async getGstInvoices(
    @Headers('company-domain') domain: string,
    @Query('search') search?: string,
    @Query('date') date?: string,
    @Query('sort_by') sortBy?: 'asc' | 'desc',
    @Query('offset') offset?: number,
    @Query('limit') limit?: number,
  ) {
    return this.financesService.getGstInvoices(domain, {
      offset: Number(offset) || 0,
      limit: Number(limit) || 20,
      search: search ?? '',
      date: date ?? '',
      sortBy: sortBy ?? 'desc',
    });
  }

  @Get('gst/:id')
  async getSingleGst(
    @Param('id') id: string,
    @Headers('company-domain') domain: string,
  ) {
    return this.financesService.getSingleGstRegistration(id, domain);
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
