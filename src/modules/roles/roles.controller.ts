import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { RolesService } from './roles.service';
import { user_roles } from '../../drizzle/schema';

import { InferSelectModel } from 'drizzle-orm';
type userRole = InferSelectModel<typeof user_roles>['role_name'];
// @Roles(Role.ADMIN)
@Controller({
  version: '1',
  path: 'roles',
})
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}
  @Get('hello')
  getHello() {
    return 'Hello World!';
  }
  @Get()
  getAllRoles() {
    return this.rolesService.getAllRoles();
  }
  @Post()
  createRole(@Body('role') role: userRole) {
    return this.rolesService.createRole(role);
  }
  @Delete(':id')
  removeRole(@Param('id') id: string) {
    return this.rolesService.removeRole(id);
  }
  @Patch(':id')
  updateRole(@Param('id') id: string, @Body('role') role: userRole) {
    return this.rolesService.updateRole(id, role);
  }
  @Get('get-role-permissions')
  getRolePermissions(
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    return this.rolesService.getRolePermissions({
      limit: Number(limit) || 50,
      offset: Number(offset) || 0,
    });
  }

  @Post('add-permission-to-role')
  addPermissionToRole(
    @Body('roleId') roleId: string,
    @Body('permissionId') permissionId: string,
  ) {
    return this.rolesService.addPermissionToRole(roleId, permissionId);
  }
  @Delete('remove-permission-from-role')
  removePermissionFromRole(
    @Body('roleId') roleId: string,
    @Body('permissionId') permissionId: string,
  ) {
    return this.rolesService.removePermissionFromRole(roleId, permissionId);
  }
}
