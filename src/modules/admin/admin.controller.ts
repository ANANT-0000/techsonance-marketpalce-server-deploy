import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFiles,
  UseGuards,
} from '@nestjs/common';
import { AdminService } from './admin.service.js';
import { UserStatus } from '../../drizzle/types/types.js';
import { VendorsService } from '../vendors/vendors.service.js';
import { UsersService } from '../users/users.service.js';
import { OrdersService } from '../orders/orders.service.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Role } from '../../enums/role.enum.js';

import { RoleGuard } from '../../guards/role.guard.js';
import { CompanyService } from '../company/company.service.js';

import { UploadToCloud } from '../../common/decorators/upload.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { Throttle } from '@nestjs/throttler';
import express from 'express';

@Controller({
  version: '1',
  path: 'admin',
})
@UseGuards(RoleGuard)
@Roles(Role.ADMIN)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly vendorService: VendorsService,
    private readonly userService: UsersService,
    private readonly orderService: OrdersService,
    private readonly companyService: CompanyService,
  ) {}
  @Get('test')
  test() {
    return 'Admin controller is working';
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
    if (result.access_token) {
      res.cookie('accessToken', result.access_token as string, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
    }
    return result;
  }

  @Post('create-vendor')
  @UploadToCloud([{ name: 'documents', maxCount: 20 }])
  @HttpCode(HttpStatus.OK)
  async createVendor(
    @Body() vendorData: any,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return await this.vendorService.vendorRegister(vendorData, files);
  }
  @Get('vendor-applications')
  @HttpCode(HttpStatus.OK)
  async getVendorApplications(
    @Query('search') search?: string,
    @Query('offset') offset?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: string,
    @Query('date') date?: string,
    @Query('sortby') sortby?: 'asc' | 'desc' | 'highest' | 'lowest',
  ) {
    return await this.vendorService.vendorApplications({
      search: search ?? '',
      limit: Number(limit) || 10,
      offset: Number(offset) || 0,
      status: status as UserStatus,
      date: date ?? '',
      sortby: sortby as 'asc' | 'desc',
    });
  }
  @Get('vendor-applications-count')
  @HttpCode(HttpStatus.OK)
  async getVendorApplicationsCount() {
    return await this.vendorService.vendorApplicationCount();
  }
  @Get('vendor/:vendorId')
  @HttpCode(HttpStatus.OK)
  async getVendorById(@Param('vendorId') vendorId: string) {
    return this.vendorService.getVendorById(vendorId);
  }
  @Get('vendors')
  @HttpCode(HttpStatus.OK)
  async getAllVendors(
    @Query('offset') offset: string,
    @Query('limit') limit: string,
    @Query('status') status: string,
    @Query('sort') sort: string,
  ) {
    return this.vendorService.getAllVendors(offset, limit, status, sort);
  }

  @Get('customers')
  @HttpCode(HttpStatus.OK)
  async getAllCustomers() {
    return this.userService.getAllCustomers();
  }

  @Get('orders')
  @HttpCode(HttpStatus.OK)
  async getAllOrders(
    @Query('search') search?: string,
    @Query('offset') offset?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: string,
    @Query('date') date?: string,
    @Query('sortby') sortby?: 'asc' | 'desc' | 'highest' | 'lowest',
  ) {
    return this.orderService.getAllOrders({
      search: search ?? '',
      limit: Number(limit) || 10,
      offset: Number(offset) || 0,
      status,
      date: date ?? '',
      sortby: sortby ?? 'desc',
    });
  }
  @Get('vendors/:vendorId')
  @HttpCode(HttpStatus.OK)
  async getVendorDetails(@Param('vendorId') vendorId: string) {
    return this.vendorService.getVendorDetails(vendorId);
  }
  @Patch('activate-vendor/:id')
  @HttpCode(HttpStatus.OK)
  async activateVendor(@Param('id') id: string) {
    return await this.companyService.activateCompany(id);
  }
  @Patch('deactivate-vendor/:id')
  @HttpCode(HttpStatus.OK)
  async deactivateVendor(@Param('id') id: string) {
    return await this.companyService.deactivateCompany(id);
  }

  @Patch('suspend-vendor/:id')
  @HttpCode(HttpStatus.OK)
  async suspendVendor(@Param('id') id: string) {
    return await this.companyService.suspendCompany(id);
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
  @Get('analytics/top-vendors')
  @HttpCode(HttpStatus.OK)
  getTopVendors() {
    return this.adminService.getTopVendors(5);
  }
}
