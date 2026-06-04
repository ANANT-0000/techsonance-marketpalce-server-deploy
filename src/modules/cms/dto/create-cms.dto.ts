import { IsString, IsNotEmpty, IsOptional, IsObject } from 'class-validator';

export class CreateCmsDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  content: string; // Dynamic page structure stored as string/JSON

  @IsString()
  @IsNotEmpty()
  page_content_type: string; // e.g. 'home', 'footer', 'about', 'contact'

  @IsObject()
  @IsOptional()
  seo_meta?: Record<string, any>;

  @IsString()
  @IsOptional()
  language?: string;
}
