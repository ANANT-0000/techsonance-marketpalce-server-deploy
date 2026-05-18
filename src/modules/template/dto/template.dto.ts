import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateTemplateDto {
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }: { value: string }) => value.trim())
  template_name!: string;
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }: { value: string }) => value.trim())
  template_label!: string;
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: string }) => value.trim())
  description!: string;
}

export class UpdateTemplateDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: string }) => value.trim())
  template_name?: string;
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: string }) => value.trim())
  template_label?: string;
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: string }) => value.trim())
  description?: string;
}
