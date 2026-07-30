import { Controller, Get, Post, Put, Delete, Headers, Body, Param } from '@nestjs/common';
import { SiteMapsService } from './site-maps.service.js';

@Controller({ version: '1', path: 'site-maps' })
export class SiteMapsController {
  constructor(private readonly siteMapsService: SiteMapsService) {}
  
  @Get()
  list(@Headers('company-domain') domain: string) {
    return this.siteMapsService.list(domain);
  }

  @Post()
  create(
    @Headers('company-domain') domain: string,
    @Body() payload: { key: string; label: string; base_path: string; default_query_param?: string },
  ) {
    return this.siteMapsService.create(domain, payload);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Headers('company-domain') domain: string,
    @Body() payload: { key?: string; label: string; base_path: string; default_query_param?: string },
  ) {
    return this.siteMapsService.update(id, domain, payload);
  }

  @Delete(':id')
  delete(@Param('id') id: string, @Headers('company-domain') domain: string) {
    return this.siteMapsService.delete(id, domain);
  }
}
