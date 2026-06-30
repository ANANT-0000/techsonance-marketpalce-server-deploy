import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
  UploadedFiles,
  Headers,
  SetMetadata,
  UseGuards,
  Req,
  Query,
} from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { VendorsService } from '../vendors/vendors.service.js';
import { UsersService } from '../users/users.service.js';
import express from 'express';
import { CreateUserDto, LoginDto } from '../users/dto/userAuth.dto.js';
import { UploadToCloud } from '../../common/decorators/upload.decorator.js';
import { ParseJsonPipe } from '../../common/pipes/parseJsonPipe.js';
import { AuthGuard } from '@nestjs/passport';
import { GoogleOAuthGuard } from './google-oauth.guard.js';
import { AdminService } from '../admin/admin.service.js';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator.js';

@Controller({ version: '1', path: 'auth' })
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly adminService: AdminService,
    private readonly vendorService: VendorsService,
    private readonly userService: UsersService,
  ) {}

  @Get('test')
  test() {
    return 'Auth controller is working';
  }
  @Public()
  @Throttle({ short: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async adminLogin(
    @Body() body: { email: string; password: string },
    @Res({ passthrough: true }) res: express.Response,
  ): Promise<Record<string, unknown>> {
    const result = await this.adminService.adminLogin(
      body.email,
      body.password,
    );
    if (result.access_token)
      this.authService.setAuthCookie(res, result.access_token as string);
    return result;
  }
  /**
   * Step 1: Initiate Google OAuth flow
   * The frontend redirects here with the domain parameter
   */
  @Public()
  @Throttle({ short: { limit: 5, ttl: 60_000 } })
  @Get('google')
  @SetMetadata('skipAuthGuard', true)
  @UseGuards(GoogleOAuthGuard)
  async googleAuth(
    @Query('domain') domain: string,
    @Res() res: express.Response,
  ) {
    // The guard will redirect to Google's OAuth consent screen
    // The domain is preserved in the OAuth state parameter automatically
  }

  /**
   * Step 2: Google OAuth callback
   * Google redirects here after user authenticates
   */
  @Public()
  @Get('google/callback')
  @HttpCode(HttpStatus.OK)
  @SetMetadata('skipAuthGuard', true)
  @UseGuards(AuthGuard('google'))
  async googleAuthRedirect(
    @Req() req: express.Request,
    @Res() res: express.Response,
    @Query('state') state: string,
  ) {
    try {
      // Extract domain from state or query parameter
      // @ts-expect-error - state is expected to be a string, but can be undefined
      const targetDomain: string =
        state || req.query.state || process.env.FRONTEND_URL;

      if (!targetDomain) {
        throw new Error('Domain parameter is missing');
      }

      // Validate and process OAuth login
      const result = await this.authService.validateOAuthLogin(
        req.user,
        targetDomain,
      );
      const frontendUrl: string = targetDomain.startsWith('http')
        ? targetDomain
        : `https://${targetDomain}`;
      if ('access_token' in result && 'refresh_token' in result) {
        const { access_token, refresh_token } = result;
        this.authService.setAuthCookie(res, access_token as string);
        // Ensure the domain has proper protocol

        // Redirect to frontend with token
        res.redirect(
          `${frontendUrl}/auth/authSuccess?access_token=${access_token}&refresh_token=${refresh_token}`,
        );
      } else {
        res.redirect(
          `${frontendUrl}/auth/authSuccess?message=${result.message}&status=${result.status}&email=${result.email}`,
        );
      }
    } catch (error: any) {
      // Redirect to error page on failure
      const errorDomain: string = req.query.state as string;
      const frontendUrl: string = errorDomain.startsWith('http')
        ? errorDomain
        : `https://${errorDomain}`;
      res.redirect(
        `${frontendUrl}/auth/error?message=${encodeURIComponent(error.message || 'Authentication failed')}&status=${error.status}&email=${error.email}`,
      );
    }
  }
  @Public()
  @Throttle({ short: { limit: 5, ttl: 60_000 } })
  @Post('register-vendor')
  @UploadToCloud([{ name: 'documents', maxCount: 20 }])
  @HttpCode(HttpStatus.CREATED)
  async signUpVendor(
    @Body('vendor', ParseJsonPipe) body: any,
    @UploadedFiles() files: Express.Multer.File[],
    @Res({ passthrough: true }) res: express.Response,
  ) {
    const vendor = await this.vendorService.vendorRegister(body, files);
    return vendor;
  }
  @Public()
  @Throttle({ short: { limit: 5, ttl: 60_000 } })
  @Post('login-vendor')
  @HttpCode(HttpStatus.OK)
  async loginVendor(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) res: express.Response,
  ) {
    const result = await this.vendorService.vendorLogin(loginDto);
    if (result && result.access_token)
      this.authService.setAuthCookie(res, result.access_token);
    return result;
  }
  @Public()
  @Throttle({ short: { limit: 5, ttl: 60_000 } })
  @Post('register-user')
  @HttpCode(HttpStatus.CREATED)
  async signUpUser(
    @Body('customer_data') createUser: CreateUserDto,
    @Headers('company-domain') domain: string,
    @Res({ passthrough: true }) res: express.Response,
  ) {
    const result = await this.userService.register(createUser, domain);
    return result;
  }
  @Public()
  @Throttle({ short: { limit: 5, ttl: 60_000 } })
  @Post('login-user')
  @HttpCode(HttpStatus.OK)
  async loginUser(
    @Body() loginDto: LoginDto,
    @Headers('company-domain') domain: string,
    @Res({ passthrough: true }) res: express.Response,
  ) {
    const result = await this.userService.login(loginDto, domain);
    if (result && result.access_token)
      this.authService.setAuthCookie(res, result.access_token);
    return result;
  }
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@Res({ passthrough: true }) res: express.Response) {
    return this.authService.logout(res as any);
  }
  @Public()
  @Throttle({ short: { limit: 5, ttl: 60_000 } })
  @Post('request-password-reset')
  @HttpCode(HttpStatus.OK)
  async requestPasswordReset(
    @Body() body: { email: string },
    @Headers('company-domain') domain: string,
  ) {
    return await this.authService.requestPasswordReset(body.email, domain);
  }

  @Public()
  @Throttle({ short: { limit: 5, ttl: 60_000 } })
  @Get('verify-mail')
  @HttpCode(HttpStatus.OK)
  async verifyMail(@Query('email') email: string) {
    return await this.authService.verifyEmail(email);
  }
  @Public()
  @Throttle({ short: { limit: 5, ttl: 60_000 } })
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(
    @Body() body: { email: string; otp: string; newPassword: string },
  ) {
    return await this.authService.resetPasswordWithOtp(
      body.email,
      body.otp,
      body.newPassword,
    );
  }
}
