import { Module } from '@nestjs/common';
import { VendorsService } from './vendors.service';
import { VendorsController } from './vendors.controller';
import { DrizzleModule } from 'src/drizzle/drizzle.module';
import { JwtModule } from '@nestjs/jwt';
import { MailModule } from 'src/common/services/mail/mail.module';
@Module({
  imports: [DrizzleModule, JwtModule, MailModule],
  controllers: [VendorsController],
  providers: [VendorsService],
  exports: [VendorsService],
})
export class VendorsModule {}
