import { IsString, IsNotEmpty, IsOptional, IsObject } from 'class-validator';

export class CreateCmsDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  content: string;

  @IsString()
  @IsNotEmpty()
  page_content_type: string;

  @IsObject()
  @IsOptional()
  seo_meta?: Record<string, any>;

  @IsString()
  @IsOptional()
  language?: string;
}
