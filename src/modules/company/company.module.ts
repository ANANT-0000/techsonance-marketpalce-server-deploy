import { forwardRef, Module } from '@nestjs/common';
import { CompanyService } from './company.service';
import { DrizzleModule } from 'src/drizzle/drizzle.module';
import { CompanyController } from './company.controller';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [DrizzleModule, forwardRef(() => UsersModule)],
  providers: [CompanyService],
  exports: [CompanyService],
  controllers: [CompanyController],
})
export class CompanyModule { }
