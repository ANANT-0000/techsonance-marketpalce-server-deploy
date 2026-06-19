import { Controller, Get, Headers } from '@nestjs/common';
import { SiteMapsService } from './site-maps.service';

@Controller({ version: '1', path: 'site-maps' })
export class SiteMapsController {
  constructor(private readonly siteMapsService: SiteMapsService) {}
  @Get()
  list(@Headers('company-domain') domain: string) {
    return this.siteMapsService.list(domain);
  }
}
