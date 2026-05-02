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
  Query
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { VendorsService } from '../vendors/vendors.service';
import { UsersService } from '../users/users.service';
import express from 'express';
import { CreateUserDto, LoginDto } from '../users/dto/userAuth.dto.ts';
// import { type VendorType } from 'src/drizzle/types/types';
import { UploadToCloud } from 'src/common/decorators/upload.decorator';
import { ParseJsonPipe } from 'src/common/pipes/parseJsonPipe';
import { AuthGuard } from '@nestjs/passport';
@Controller({ version: '1', path: 'auth' })
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly vendorService: VendorsService,
    private readonly userService: UsersService,
  ) { }
  @Get('test')
  test() {
    return 'Auth controller is working';
  }

  // 1. The frontend links to this route to start the flow
@Get('google')
  @SetMetadata('skipAuthGuard', true)
  async googleAuth(@Req() req, @Res() res, @Query('domain') domain: string) {
    // 1. Manually invoke the guard and pass the domain into the state!
    const guard = new (AuthGuard('google'))({
      state: domain || process.env.FRONTEND_URL, // Fallback to main domain
    });
    
    return guard.canActivate(req as any); // Let Passport take over
  }
@Get('google/callback')
  @SetMetadata('skipAuthGuard', true)
  @UseGuards(AuthGuard('google'))
  async googleAuthRedirect(@Req() req, @Res() res) {
    // Grab the domain we hid inside the state parameter!
    const targetDomain = req.query.state as string;
    // Generate the JWT (using the service method we built earlier)
    const token = await this.authService.validateOAuthLogin(req.user,targetDomain);
    // Ensure the domain has http/https, then redirect
    const frontendUrl = targetDomain.startsWith('http') ? targetDomain : `https://${targetDomain}`;
    
    res.redirect(`${frontendUrl}/auth/success?token=${token}`);
  }
  @Post('register-vendor')
  @UploadToCloud([{ name: 'documents', maxCount: 20 }])
  @HttpCode(HttpStatus.CREATED)
  async signUpVendor(
    @Body('vendor', ParseJsonPipe) body: any,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    console.log('body', body);
    // console.log('vendor documents');
    // console.table(files['documents']);
    const vendor = await this.vendorService.vendorRegister(body, files);
    return vendor;
  }
  @Post('login-vendor')
  @HttpCode(HttpStatus.OK)
  async loginVendor(
    @Body() loginDto: LoginDto,

  ) {
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
  async requestPasswordReset(@Body() body:any, @Headers('company-domain') domain: string) {
    return await this.authService.requestPasswordReset(body.email, domain);
  }
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(
    @Body() body: { email: string; otp: string; newPassword: string },
  ) {
    return await this.authService.resetPasswordWithOtp(body.email, body.otp, body.newPassword);
  }
  // @Post('reset-password')
  // @HttpCode(HttpStatus.OK)
  // async resetPassword(@Body() body: { token: string; newPassword: string }) {
  //   return await this.authService.resetPassword(body.token, body.newPassword);
  // }

}
