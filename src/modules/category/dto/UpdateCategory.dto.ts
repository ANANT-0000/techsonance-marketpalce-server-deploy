import { PartialType } from '@nestjs/swagger';
import { CreateCategoryDto } from './CreateCategory.dto';

export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {}
