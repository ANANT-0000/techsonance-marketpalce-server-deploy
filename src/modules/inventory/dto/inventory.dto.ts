import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateInventoryDto {
  @IsNotEmpty()
  @IsString()
  @Transform(({ value }: { value: string }) => value.trim())
  productVariantId!: string;

  @IsNotEmpty()
  @IsString()
  @Transform(({ value }: { value: string }) => value.trim())
  warehouseId!: string;

  @IsNotEmpty()
  @Transform(({ value }: { value: number }) => value)
  stockQuantity!: number;
}
