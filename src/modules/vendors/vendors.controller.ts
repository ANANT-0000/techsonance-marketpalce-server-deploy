import { VendorsService } from './vendors.service';
import { Controller } from '@nestjs/common';

@Controller({ version: '1', path: 'vendors' })
export class VendorsController {
  constructor(private readonly vendorsService: VendorsService) {}
}
