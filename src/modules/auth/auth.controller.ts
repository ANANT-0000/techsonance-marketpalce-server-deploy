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
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { VendorsService } from '../vendors/vendors.service';
import { UsersService } from '../users/users.service';
import express from 'express';
import { CreateUserDto, LoginDto } from '../users/dto/userAuth.dto.ts';
// import { type VendorType } from 'src/drizzle/types/types';
import { UploadToCloud } from 'src/common/decorators/upload.decorator';
import { ParseJsonPipe } from 'src/common/pipes/parseJsonPipe';
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
    @Res({ passthrough: true }) res: express.Response,
  ) {
    return await this.vendorService.vendorLogin(loginDto, res);
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
    @Res({ passthrough: true }) res: express.Response,
  ) {
    console.log('Login request received with body:', loginDto);
    return await this.userService.login(loginDto, res);
  }
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@Res({ passthrough: true }) res: express.Response) {
    return this.authService.logout(res);
  }
  @Post('forget-password')
  @HttpCode(HttpStatus.OK)
  async forgetPassword(@Body() body: { email: string }) {
    return await this.authService.forgetPassword(body.email);
  }
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() body: { token: string; newPassword: string }) {
    return await this.authService.resetPassword(body.token, body.newPassword);
  }
}
