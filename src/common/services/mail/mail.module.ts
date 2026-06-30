import { Module } from '@nestjs/common';
import { MailService } from './mail.service.js';
import { MailController } from './mail.controller.js';
import { DrizzleModule } from '../../../drizzle/drizzle.module.js';
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [DrizzleModule, JwtModule],
  controllers: [MailController],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
