import { IsOptional, IsString, IsNotEmpty, MinLength, MaxLength, IsUUID, IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateCategoryDto {
  @IsString()
  @IsNotEmpty({ message: 'Category name is required' })
  @MinLength(2, { message: 'Category name must be at least 2 characters' })
  @MaxLength(100, { message: 'Category name cannot exceed 100 characters' })
  @Transform(({ value }: { value: any }) => (typeof value === 'string' ? value.trim() : value))
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300, { message: 'Category description cannot exceed 300 characters' })
  @Transform(({ value }: { value: any }) => (typeof value === 'string' ? value.trim() : value))
  description?: string;

  @IsOptional()
  @IsUUID('4', { message: 'Parent ID must be a valid UUID' })
  parent_id?: string | null;

  @IsOptional()
  @IsString()
  icon_url?: string | null;

  @IsOptional()
  @IsBoolean()
  show_in_nav?: boolean;
}
