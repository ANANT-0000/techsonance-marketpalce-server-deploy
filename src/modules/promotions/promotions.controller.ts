// ../../modules/promotions/promotions.controller.ts

import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { PromotionsService } from './promotions.service';
import { CreatePromotionDto } from './dto/promotions..dto';

@Controller({ version: '1', path: 'promotions' })
export class PromotionsController {
  constructor(private readonly promotionsService: PromotionsService) {}

  // List all non-coupon promotions for a company
  @Get()
  findAll(@Headers('company-domain') domain: string) {
    return this.promotionsService.findAll(domain);
  }
  @Get('options')
  findOptions(@Headers('company-domain') domain: string) {
    return this.promotionsService.findOptions(domain);
  }
  // Single promotion with rules, targets, usage count
  @Get(':id')
  findOne(@Param('id') id: string, @Headers('company-domain') domain: string) {
    return this.promotionsService.findOne(id, domain);
  }

  // Funnel analytics for a promotion
  @Get(':id/analytics')
  getAnalytics(
    @Param('id') id: string,
    @Headers('company-domain') domain: string,
  ) {
    return this.promotionsService.getAnalytics(id, domain);
  }

  @Post(':id')
  create(
    @Param('id') id: string,
    @Body() dto: CreatePromotionDto,
    @Headers('company-domain') domain: string,
  ) {
    return this.promotionsService.create(dto, domain, id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: Partial<CreatePromotionDto>,
    @Headers('company-domain') domain: string,
  ) {
    return this.promotionsService.update(id, dto, domain);
  }

  @Delete(':id')
  deactivate(
    @Param('id') id: string,
    @Headers('company-domain') domain: string,
  ) {
    return this.promotionsService.deactivate(id, domain);
  }
}
