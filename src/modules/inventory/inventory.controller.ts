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
  findAll(@Headers('company-domain') domain: string) {
    return this.inventoryService.findAll(domain);
  }

  /**
   * Low-stock alert panel only items below threshold.
   */
  // @Get('alerts/low-stock')
  // @HttpCode(HttpStatus.OK)
  // getLowStockAlerts(@Headers('company-domain') domain: string) {
  //   return this.inventoryService.getLowStockAlerts(domain);
  // }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  updateStock(
    @Param('id') id: string,
    @Body('quantity') quantity: number,
    @Headers('company-domain') domain: string,
  ) {
    console.log('quantity', quantity);
    return this.inventoryService.updateStock(id, quantity, domain);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id') id: string, @Headers('company-domain') domain: string) {
    return this.inventoryService.remove(id, domain);
  }
}
