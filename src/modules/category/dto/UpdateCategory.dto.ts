import { PartialType } from '@nestjs/swagger';
import { CreateCategoryDto } from './CreateCategory.dto.js';

export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {}
