import { Body, Controller, Get, Post, Res } from '@nestjs/common';
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
    return { message: 'Admin controller is working' };
  }

  @Post('login')
  async adminLogin(
    @Body() body: { email: string; password: string },
    @Res({ passthrough: true }) res: express.Response,
  ) {
    const { email, password } = body;

    const result = await this.adminService.adminLogin(email, password, res);
    // console.log('res', result);
    return result;
  }
  @Get('vendor-applications')
  async getVendorApplications() {
    return this.vendorService.vendorApplications();
  }
  @Get('vendor/:vendorId')
  async getVendorById(@Body() body: { vendorId: string }) {
    const { vendorId } = body;
    return this.vendorService.getVendorById(vendorId);
  }
  @Get('vendors')
  async getAllVendors() {
    return this.vendorService.getAllVendors();
  }

  @Post('approve-vendor')
  async approveVendor(@Body() body: { vendorId: string }) {
    const { vendorId } = body;
    return await this.vendorService.updateVendorStatus(
      vendorId,
      UserStatus.ACTIVE,
    );
  }
  @Post('reject-vendor')
  async rejectVendor(@Body() body: { vendorId: string }) {
    const { vendorId } = body;
    return await this.vendorService.updateVendorStatus(
      vendorId,
      UserStatus.REJECTED,
    );
  }
  @Get('unverified-vendors')
  async getUnverifiedVendors() {
    return await this.vendorService.getUnverifiedVendors();
  }
  @Get('verified-vendors')
  async getVerifiedVendors() {
    return await this.vendorService.getVerifiedVendors();
  }
}
