import { Transform } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsString, Length } from 'class-validator';

export class CreateCartDto {
  @IsString()
  @IsNotEmpty()
  @Length(36, 64)
  @Transform(({ value }: { value: string }) => value.trim())
  productVariantId!: string;
  @IsNumber()
  @IsNotEmpty()
  @Transform(({ value }: { value: string }) => Number(value))
  quantity!: number;
}
