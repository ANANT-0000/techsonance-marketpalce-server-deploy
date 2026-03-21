import { Body, Controller, Get, Post, Res } from '@nestjs/common';
import { AuthService } from './auth.service';
import { VendorsService } from '../vendors/vendors.service';
import { UsersService } from '../users/users.service';
import express from 'express';
import { CreateUserDtoTs, LoginDtoTs } from '../users/dto/userAuth.dto.ts';
import { type VendorObject } from 'src/drizzle/types/types';
@Controller({ version: '1', path: 'auth' })
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly vendorService: VendorsService,
    private readonly userService: UsersService,
  ) {}
  @Get('test')
  test() {
    return { message: 'Auth controller is working' };
  }
  @Post('register-vendor')
  async signUpVendor(@Body() body: VendorObject) {
    console.log(body);
    if (
      body.store_owner_first_name === undefined ||
      body.store_owner_last_name === undefined ||
      body.email === undefined ||
      body.hash_password === undefined
    ) {
      return {
        message: 'Vendor admin name, email and password are required',
        status: 400,
      };
    }
    const vendor = await this.vendorService.vendorRegister(body);
    return {
      message: 'Vendor registered successfully',
      status: 200,
      data: vendor,
    };
  }
  @Post('login-vendor')
  async loginVendor(
    @Body() body: { email: string; hash_password: string },
    @Res({ passthrough: true }) res: express.Response,
  ) {
    console.log('Login request received with body:', body);
    return await this.vendorService.vendorLogin(
      {
        email: body.email,
        hash_password: body.hash_password,
      },
      res,
    );
  }
  @Post('register-user')
  async signUpUser(@Body() createUser: CreateUserDtoTs) {
    const result = await this.userService.register(createUser);
    return {
      message: 'User registered successfully',
      status: 200,
      data: result.userRecord,
    };
  }
  @Post('login-user')
  async loginUser(
    @Body() body: LoginDtoTs,
    @Res({ passthrough: true }) res: express.Response,
  ) {
    console.log('Login request received with body:', body);
    return await this.userService.login(body, res);
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
