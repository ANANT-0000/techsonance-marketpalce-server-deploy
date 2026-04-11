import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { AddressService } from './address.service';
import { CreateAddressDto } from './dto/createAddress.dto';
import { UpdateAddressDto } from './dto/updateAddress.dto';

@Controller({ version: '1', path: 'address' })
export class AddressController {
  constructor(private readonly addressService: AddressService) {}

  @Get('customer/:customerId')
  @HttpCode(HttpStatus.OK)
  async getAddressesByCustomerId(@Param('customerId') customerId: string) {
    return this.addressService.findAddressesByUserId(customerId);
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
    console.log('addressData 8888888888888888888 \n', addressData);
    console.log('customerId', customerId);
    return this.addressService.createAddress(customerId, addressData);
  }

  @Patch('customer/:customerId/:addressId')
  @HttpCode(HttpStatus.ACCEPTED)
  async updateAddressForUser(
    @Param('customerId') customerId: string,
    @Param('addressId') addressId: string,
    @Body() addressData: UpdateAddressDto,
  ) {
    console.log('customer', customerId);
    console.log('address', addressId);
    console.log(addressData);
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
