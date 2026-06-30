import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { APP_GUARD } from '@nestjs/core';
import { RoleGuard } from '../../guards/role.guard.js';
import { DrizzleModule } from '../../drizzle/drizzle.module.js';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './JwtStrategy.js';
import { UsersModule } from '../users/users.module.js';
import { VendorsModule } from '../vendors/vendors.module.js';
import { MailModule } from '../../common/services/mail/mail.module.js';
import { CompanyModule } from '../company/company.module.js';
import { GoogleStrategy } from './google.strategy.js';
import { AdminModule } from '../admin/admin.module.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';

@Module({
  imports: [
    UsersModule,
    VendorsModule,
    MailModule,
    DrizzleModule,
    AdminModule,
    CompanyModule,
    PassportModule.register({
      defaultStrategy: 'jwt',
      property: 'user',
      session: false,
    }),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'default_secret',
      signOptions: { expiresIn: '1h' },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    GoogleStrategy,
    JwtAuthGuard,
    // {
    //   provide: APP_GUARD,
    //   useClass: RoleGuard,
    // },
  ],
  exports: [AuthService, JwtModule, JwtAuthGuard],
})
export class AuthModule {}
