import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Headers,
} from '@nestjs/common';
import { WarehouseService } from './warehouse.service';
import {
  updateWarehouseAddressDto,
  warehouseAddressDto,
} from './dto/warehouse.dto';

@Controller({
  version: '1',
  path: 'warehouse',
})
export class WarehouseController {
  constructor(private readonly warehouseService: WarehouseService) {}

  @Post()
  create(
    @Body() warehouseAddressDto: warehouseAddressDto,
    @Headers('company-domain') domain: string,
  ) {
    console.log('warehouse', warehouseAddressDto);
    return this.warehouseService.create(warehouseAddressDto, domain);
  }

  @Get()
  findAll(@Headers('company-domain') domain: string) {
    return this.warehouseService.findAll(domain);
  }
  @Get('options')
  findOptions(@Headers('company-domain') domain: string) {
    return this.warehouseService.findOptions(domain);
  }
  @Get(':id')
  findOne(@Param('id') id: string, @Headers('company-domain') domain: string) {
    return this.warehouseService.findOne(id, domain);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateWarehouseAddressDto: any,
    @Headers('company-domain') domain: string,
  ) {
    console.log('updateWarehouseAddressDto', updateWarehouseAddressDto);
    return this.warehouseService.update(id, updateWarehouseAddressDto, domain);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Headers('company-domain') domain: string) {
    return this.warehouseService.remove(id, domain);
  }
}
