import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { DrizzleModule } from 'src/drizzle/drizzle.module';
import { JwtModule } from '@nestjs/jwt';
import { UsersModule } from '../users/users.module';
import { VendorsModule } from '../vendors/vendors.module';

@Module({
  imports: [DrizzleModule, JwtModule, UsersModule, VendorsModule],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
