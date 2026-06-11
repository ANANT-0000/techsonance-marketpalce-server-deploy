import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { APP_GUARD } from '@nestjs/core';
import { RoleGuard } from '../../guards/role.guard';
import { DrizzleModule } from '../../drizzle/drizzle.module';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './JwtStrategy';
import { UsersModule } from '../users/users.module';
import { VendorsModule } from '../vendors/vendors.module';
import { MailModule } from '../../common/services/mail/mail.module';
import { CompanyModule } from '../company/company.module';
import { GoogleStrategy } from './google.strategy';
import { AdminModule } from '../admin/admin.module';
import { JwtAuthGuard } from './jwt-auth.guard';

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
