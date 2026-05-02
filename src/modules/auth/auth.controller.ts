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
import { AuthService } from './auth.service';
import { VendorsService } from '../vendors/vendors.service';
import { UsersService } from '../users/users.service';
import express from 'express';
import { CreateUserDto, LoginDto } from '../users/dto/userAuth.dto.ts';
import { UploadToCloud } from 'src/common/decorators/upload.decorator';
import { ParseJsonPipe } from 'src/common/pipes/parseJsonPipe';
import { AuthGuard } from '@nestjs/passport';
import { GoogleOAuthGuard } from './google-oauth.guard';

@Controller({ version: '1', path: 'auth' })
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly vendorService: VendorsService,
    private readonly userService: UsersService,
  ) {}

  @Get('test')
  test() {
    return 'Auth controller is working';
  }

  /**
   * Step 1: Initiate Google OAuth flow
   * The frontend redirects here with the domain parameter
   */
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
  @Get('google/callback')
  @HttpCode(HttpStatus.OK)
  @SetMetadata('skipAuthGuard', true)
  @UseGuards(AuthGuard('google'))
  async googleAuthRedirect(
    @Req() req: any,
    @Res() res: express.Response,
    @Query('state') state: string,
  ) {
    try {
      // Extract domain from state or query parameter
      const targetDomain = state || req.query.state || process.env.FRONTEND_URL;
      
      if (!targetDomain) {
        throw new Error('Domain parameter is missing');
      }

      // Validate and process OAuth login
      const {access_token, refresh_token}= await this.authService.validateOAuthLogin(
        req.user,
        targetDomain,
      );

      // Ensure the domain has proper protocol
      const frontendUrl = targetDomain.startsWith('http')
        ? targetDomain
        : `https://${targetDomain}`;

      // Redirect to frontend with token
      res.redirect(`${frontendUrl}/auth/success?access_token=${access_token}&refresh_token=${refresh_token}`);
    } catch (error) {
      console.error('Google OAuth callback error:', error);
      
      // Redirect to error page on failure
      const errorDomain = req.query.state || process.env.FRONTEND_URL;
      const frontendUrl = errorDomain.startsWith('http')
        ? errorDomain
        : `https://${errorDomain}`;
      
      res.redirect(
        `${frontendUrl}/auth/error?message=${encodeURIComponent(error.message || 'Authentication failed')}`,
      );
    }
  }

  @Post('register-vendor')
  @UploadToCloud([{ name: 'documents', maxCount: 20 }])
  @HttpCode(HttpStatus.CREATED)
  async signUpVendor(
    @Body('vendor', ParseJsonPipe) body: any,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    console.log('body', body);
    const vendor = await this.vendorService.vendorRegister(body, files);
    return vendor;
  }

  @Post('login-vendor')
  @HttpCode(HttpStatus.OK)
  async loginVendor(@Body() loginDto: LoginDto) {
    return await this.vendorService.vendorLogin(loginDto);
  }

  @Post('register-user/:companyId')
  @HttpCode(HttpStatus.CREATED)
  async signUpUser(
    @Param('companyId') companyId: string,
    @Body('customer_data') createUser: CreateUserDto,
  ) {
    console.log(createUser);
    const result = await this.userService.register(createUser, companyId);
    return result;
  }

  @Post('login-user')
  @HttpCode(HttpStatus.OK)
  async loginUser(
    @Body() loginDto: LoginDto,
    @Headers('company-domain') domain: string,
  ) {
    return await this.userService.login(loginDto, domain);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@Res({ passthrough: true }) res: express.Response) {
    return this.authService.logout(res);
  }

  @Post('request-password-reset')
  @HttpCode(HttpStatus.OK)
  async requestPasswordReset(
    @Body() body: any,
    @Headers('company-domain') domain: string,
  ) {
    return await this.authService.requestPasswordReset(body.email, domain);
  }

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