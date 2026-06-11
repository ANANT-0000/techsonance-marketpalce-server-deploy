import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Headers,
  HttpCode,
  HttpStatus,
  Query,
} from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { CreateInventoryDto } from './dto/inventory.dto';

@Controller({ version: '1', path: 'inventory' })
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() dto: CreateInventoryDto,
    @Headers('company-domain') domain: string,
  ) {
    return this.inventoryService.create(dto, domain);
  }
  @Get()
  @HttpCode(HttpStatus.OK)
  findAll(
    @Headers('company-domain') domain: string,
    @Query('search') search?: string,
    @Query('offset') offset?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: string,
    @Query('date') date?: string,
    @Query('sortby') sortby?: 'asc' | 'desc',
  ) {
    return this.inventoryService.findAll(domain, {
      search: search ?? '',
      limit: Number(limit) || 10,
      offset: Number(offset) || 0,
      status,
      date: date ?? '',
      sortby: sortby ?? 'desc',
    });
  }

  /**
   * Low-stock alert panel only items below threshold.
   */
  @Get('alerts/low-stock')
  @HttpCode(HttpStatus.OK)
  getLowStockAlerts(@Headers('company-domain') domain: string) {
    return this.inventoryService.getLowStockAlerts(domain);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  updateStock(
    @Param('id') id: string,
    @Body('quantity') quantity: number,
    @Headers('company-domain') domain: string,
  ) {
    return this.inventoryService.updateStock(id, quantity, domain);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id') id: string, @Headers('company-domain') domain: string) {
    return this.inventoryService.remove(id, domain);
  }
}
