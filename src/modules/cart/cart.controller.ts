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
import { CartService } from './cart.service';
import { CreateCartDto } from './dto/create-cart.dto';
import { UpdateCartDto } from './dto/update-cart.dto';

@Controller({
  version: '1',
  path: 'cart',
})
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Post(':customerId')
  create(
    @Param('customerId') customerId: string,
    @Body() createCartDto: CreateCartDto,
    @Headers('company-domain') domain: string,
  ) {
    console.log('customerId', customerId);
    console.log('createCartDto', createCartDto);
    console.log('domain', domain);
    return this.cartService.create(createCartDto, customerId, domain);
  }

  @Get(':customerId')
  findAll(
    @Param('customerId') customerId: string,
    @Headers('company-domain') domain: string,
  ) {
    return this.cartService.findAll(customerId, domain);
  }

  @Get('variant/:id/:customerId')
  findOne(
    @Param('id') productVariantId: string,
    @Param('customerId') customerId: string,
    @Headers('company-domain') domain: string,
  ) {
    return this.cartService.findOne(productVariantId, customerId, domain);
  }

  @Patch(':id')
  updateCartItemQuantity(
    @Param('id') id: string,
    @Body() updateCartDto: UpdateCartDto,
  ) {
    return this.cartService.updateCartItemQuantity(id, updateCartDto);
  }

  @Delete(':customerId')
  remove(
    @Param('customerId') customerId: string,
    @Body('cartId') cartId: string,
    @Body('cartItemId') cartItemId: string,
    @Headers('company-domain') domain: string,
  ) {
    console.log('customerId remove ', customerId);
    console.log('cartId remove ', cartId);
    console.log('cartItemId remove ', cartItemId);
    console.log('domain remove ', domain);
    return this.cartService.removeCartItem(
      customerId,
      cartId,
      cartItemId,
      domain,
    );
  }
}
