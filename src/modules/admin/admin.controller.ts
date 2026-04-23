import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Res,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { UserStatus } from 'src/drizzle/types/types';
import { VendorsService } from '../vendors/vendors.service';
import express from 'express';

@Controller({
  version: '1',
  path: 'admin',
})
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly vendorService: VendorsService,
  ) {}
  @Get('test')
  test() {
    return 'Admin controller is working';
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async adminLogin(
    @Body() body: { email: string; password: string },
    @Res({ passthrough: true }) res: express.Response,
  ): Promise<Record<string, unknown>> {
    console.log(body.email, body.password);
    return await this.adminService.adminLogin(body.email, body.password, res);
  }
  @Post('create-vendor')
  @HttpCode(HttpStatus.OK)
  async createVendor(@Body() vendorData: any) {
    return await this.vendorService.vendorRegister(vendorData, []);
  }
  @Get('vendor-applications')
  @HttpCode(HttpStatus.OK)
  async getVendorApplications() {
    return await this.vendorService.vendorApplications();
  }
  @Get('vendor/:vendorId')
  @HttpCode(HttpStatus.OK)
  async getVendorById(@Param('vendorId') vendorId: string) {
    return this.vendorService.getVendorById(vendorId);
  }
  @Get('vendors')
  @HttpCode(HttpStatus.OK)
  async getAllVendors() {
    return this.vendorService.getAllVendors();
  }

  @Patch('approve-vendor/:id')
  @HttpCode(HttpStatus.OK)
  async approveVendor(@Param('id') id: string) {
    return await this.vendorService.updateVendorStatus(id, UserStatus.ACTIVE);
  }
  @Patch('reject-vendor/:id')
  @HttpCode(HttpStatus.OK)
  async rejectVendor(@Param('id') id: string) {
    return await this.vendorService.updateVendorStatus(id, UserStatus.REJECTED);
  }
  @Get('unverified-vendors')
  @HttpCode(HttpStatus.OK)
  async getUnverifiedVendors() {
    return await this.vendorService.getUnverifiedVendors();
  }
  @Get('verified-vendors')
  @HttpCode(HttpStatus.OK)
  async getVerifiedVendors() {
    return await this.vendorService.getVerifiedVendors();
  }
}
