import { IsOptional, IsString, IsObject, IsNumber } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateLandingPageThemeDto {
  @ApiPropertyOptional()
  @IsObject()
  @IsOptional()
  theme?: Record<string, any>;
}

export class UpdateLandingPageContentDto {
  @ApiPropertyOptional()
  @IsObject()
  @IsOptional()
  content?: Record<string, any>;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  expectedVersion?: number;
}
