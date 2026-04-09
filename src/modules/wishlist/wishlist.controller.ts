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
import { WishlistService } from './wishlist.service';
import { CreateWishlistDto } from './dto/create-wishlist.dto';
import { UpdateWishlistDto } from './dto/update-wishlist.dto';

@Controller({
  version: '1',
  path: 'wishlist',
})
export class WishlistController {
  constructor(private readonly wishlistService: WishlistService) {}

  @Post(':customerId')
  create(
    @Param('customerId') id: string,
    @Body('productVariantId') productVariantId: any,
    @Headers('company-domain') domain: string,
  ) {
    return this.wishlistService.create(productVariantId, id, domain);
  }

  @Get(':customerId')
  findAll(
    @Param('customerId') customerId: string,
    @Headers('company-domain') domain: string,
  ) {
    return this.wishlistService.findAll(customerId, domain);
  }

  // @Patch(':id')
  // update(
  //   @Param('id') id: string,
  //   @Body() updateWishlistDto: UpdateWishlistDto,
  // ) {
  //   return this.wishlistService.update(id, updateWishlistDto);
  // }

  @Delete(':customerId')
  remove(
    @Param('customerId') customerId: string,
    @Body('productVariantId') productVariantId: string,
    @Headers('company-domain') domain: string,
  ) {
    return this.wishlistService.delete(productVariantId, customerId, domain);
  }
}
