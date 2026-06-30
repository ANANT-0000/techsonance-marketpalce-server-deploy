import { Module } from '@nestjs/common';
import { CategoryService } from './category.service.js';
import { CategoryController } from './category.controller.js';
import { DrizzleModule } from '../../drizzle/drizzle.module.js';
import { CompanyModule } from '../company/company.module.js';

@Module({
  imports: [DrizzleModule, CompanyModule],
  controllers: [CategoryController],
  providers: [CategoryService],
})
export class CategoryModule {}
