import { Controller, Get, Post, Put, Delete, Param, Body, Headers } from '@nestjs/common';
import { ProductFiltersService } from './product-filters.service.js';
import { FilterRuleNode } from '../../drizzle/types/types.js';

@Controller({ version: '1', path: 'product-filters' })
export class ProductFiltersController {
  constructor(private readonly filtersService: ProductFiltersService) {}

  @Get()
  async getFilters(@Headers('company-domain') domain: string) {
    return await this.filtersService.getFilters(domain);
  }

  @Post()
  async createFilter(
    @Headers('company-domain') domain: string,
    @Body() dto: { name: string; rules: FilterRuleNode | FilterRuleNode[] },
  ) {
    return await this.filtersService.createFilter(domain, dto);
  }

  @Put(':id')
  async updateFilter(
    @Param('id') id: string,
    @Headers('company-domain') domain: string,
    @Body() dto: { name?: string; rules?: FilterRuleNode | FilterRuleNode[] },
  ) {
    return await this.filtersService.updateFilter(domain, id, dto);
  }

  @Delete(':id')
  async deleteFilter(
    @Param('id') id: string,
    @Headers('company-domain') domain: string,
  ) {
    return await this.filtersService.deleteFilter(domain, id);
  }

  @Post(':id/copy')
  async copyFilter(
    @Param('id') id: string,
    @Headers('company-domain') domain: string,
  ) {
    return await this.filtersService.copyPlatformFilter(domain, id);
  }
}
