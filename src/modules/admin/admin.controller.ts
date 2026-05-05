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
  UseGuards,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { UserStatus } from 'src/drizzle/types/types';
import { VendorsService } from '../vendors/vendors.service';
import { UsersService } from '../users/users.service';
import { OrdersService } from '../orders/orders.service';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from 'src/enums/role.enum';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RoleGuard } from 'src/guards/role.guard';
import { CompanyService } from '../company/company.service';

@Controller({
  version: '1',
  path: 'admin',
})
@UseGuards(JwtAuthGuard, RoleGuard)
@Roles(Role.ADMIN)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly vendorService: VendorsService,
    private readonly userService: UsersService,
    private readonly orderService: OrdersService,
    private readonly companyService: CompanyService,

  ) { }
  @Get('test')
  test() {
    return 'Admin controller is working';
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
  async getAllVendors(@Query('offset') offset: string, @Query('limit') limit: string, @Query('status') status: string,
    @Query('sort') sort: string) {
    return this.vendorService.getAllVendors(offset, limit, status, sort);
  }

  @Get('customers')
  @HttpCode(HttpStatus.OK)
  async getAllCustomers() {
    return this.userService.getAllCustomers();
  }

  @Get('orders')
  @HttpCode(HttpStatus.OK)
  async getAllOrders() {
    return this.orderService.getAllOrders();
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
}
