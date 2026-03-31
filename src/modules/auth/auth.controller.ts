import {
  Body,
  Controller,
  Get,
  Post,
  Res,
  UploadedFiles,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { VendorsService } from '../vendors/vendors.service';
import { UsersService } from '../users/users.service';
import express from 'express';
import { CreateUserDto, LoginDto } from '../users/dto/userAuth.dto.ts';
import { type VendorType } from 'src/drizzle/types/types';
import { UploadToCloud } from 'src/common/decorators/upload.decorator';
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
  async signUpVendor(
    @Body('vendor') body: any,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    console.log('body', body);
    console.log('vendor documents');
    console.table(files['documents']);
    const vendor = await this.vendorService.vendorRegister(body, files);
    return vendor;
  }
  @Post('login-vendor')
  async loginVendor(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) res: express.Response,
  ) {
    return await this.vendorService.vendorLogin(loginDto, res);
  }
  @Post('register-user')
  async signUpUser(@Body() createUser: CreateUserDto) {
    const result = await this.userService.register(createUser);
    return result;
  }
  @Post('login-user')
  async loginUser(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) res: express.Response,
  ) {
    console.log('Login request received with body:', loginDto);
    return await this.userService.login(loginDto, res);
  }
  @Post('logout')
  logout(@Res({ passthrough: true }) res: express.Response) {
    return this.authService.logout(res);
  }
  @Post('forget-password')
  async forgetPassword(@Body() body: { email: string }) {
    return await this.authService.forgetPassword(body.email);
  }
  @Post('reset-password')
  async resetPassword(@Body() body: { token: string; newPassword: string }) {
    return await this.authService.resetPassword(body.token, body.newPassword);
  }
}
