import { PartialType } from '@nestjs/swagger';
import { CreateCartDto } from './create-cart.dto';
import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class UpdateCartDto extends PartialType(CreateCartDto) {
  @IsString()
  @IsNotEmpty()
  cart_items_id!: string;

  @IsNumber()
  @IsNotEmpty()
  quantity!: number;
}
