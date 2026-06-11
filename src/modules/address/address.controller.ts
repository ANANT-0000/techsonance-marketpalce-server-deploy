import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { AddressService } from './address.service';
import { CreateAddressDto } from './dto/createAddress.dto';
import { UpdateAddressDto } from './dto/updateAddress.dto';

@Controller({ version: '1', path: 'address' })
export class AddressController {
  constructor(private readonly addressService: AddressService) {}

  @Post('company')
  @HttpCode(HttpStatus.CREATED)
  async createCompanyAddress(
    @Headers('company-domain') domain: string,
    @Body() addressData: any,
  ) {
    return this.addressService.createCompanyAddress(domain, addressData);
  }
  @Get('company')
  @HttpCode(HttpStatus.OK)
  async getCompanyAddresses(@Headers('company-domain') domain: string) {
    return this.addressService.findCompanyAddress(domain);
  }
  @Get('customer/:customerId')
  @HttpCode(HttpStatus.OK)
  async getAddressesByCustomerId(
    @Param('customerId') customerId: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    return this.addressService.findAddressesByUserId(customerId, {
      limit: Number(limit) || 20,
      offset: Number(offset) || 0,
    });
  }
  @Get('customer/:customerId/addresses-exist')
  @HttpCode(HttpStatus.OK)
  async checkAddressesExistence(@Param('customerId') customerId: string) {
    return this.addressService.checkAddressByUserId(customerId);
  }

  @Get(':addressId')
  @HttpCode(HttpStatus.OK)
  async getAddressById(@Param('addressId') addressId: string) {
    return this.addressService.findAddressById(addressId);
  }

  @Post('customer/:customerId')
  @HttpCode(HttpStatus.CREATED)
  async createAddressForUser(
    @Param('customerId') customerId: string,
    @Body() addressData: CreateAddressDto,
  ) {
    return this.addressService.createAddress(customerId, addressData);
  }

  @Patch('customer/:customerId/:addressId')
  @HttpCode(HttpStatus.ACCEPTED)
  async updateAddressForUser(
    @Param('customerId') customerId: string,
    @Param('addressId') addressId: string,
    @Body() addressData: UpdateAddressDto,
  ) {
    return this.addressService.updateAddress(
      customerId,
      addressId,
      addressData,
    );
  }
  @Delete('customer/:customerId/:addressId')
  @HttpCode(HttpStatus.OK)
  async deleteAddress(
    @Param('customerId') customerId: string,
    @Param('addressId') addressId: string,
  ) {
    return this.addressService.deleteAddress(customerId, addressId);
  }
  @Patch('customer/:customerId/:addressId/default')
  @HttpCode(HttpStatus.OK)
  async setDefaultAddress(
    @Param('customerId') customerId: string,
    @Param('addressId') addressId: string,
  ) {
    return this.addressService.setDefaultAddress(customerId, addressId);
  }
}
