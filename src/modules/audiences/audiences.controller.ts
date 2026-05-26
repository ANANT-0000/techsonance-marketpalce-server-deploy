// ../../modules/audiences/audiences.controller.ts

import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { AudiencesService } from './audiences.service';
import { CreateSegmentDto } from './dto/audience.dto';

@Controller({ version: '1', path: 'audiences' })
export class AudiencesController {
  constructor(private readonly audiencesService: AudiencesService) {}

  @Get()
  findAll(@Headers('company-domain') domain: string) {
    return this.audiencesService.findAll(domain);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Headers('company-domain') domain: string) {
    return this.audiencesService.findOne(id, domain);
  }

  @Post()
  create(
    @Body() dto: CreateSegmentDto,
    @Headers('company-domain') domain: string,
  ) {
    return this.audiencesService.create(dto, domain);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: Partial<CreateSegmentDto>,
    @Headers('company-domain') domain: string,
  ) {
    return this.audiencesService.update(id, dto, domain);
  }

  @Delete(':id')
  deactivate(
    @Param('id') id: string,
    @Headers('company-domain') domain: string,
  ) {
    return this.audiencesService.deactivate(id, domain);
  }

  // Manual recalculation trigger — cron job calls the service method directly
  @Post(':id/recalculate')
  recalculate(
    @Param('id') id: string,
    @Headers('company-domain') domain: string,
  ) {
    return this.audiencesService.recalculate(id, domain);
  }
}
