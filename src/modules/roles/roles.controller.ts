import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { RolesService } from './roles.service';
import { Roles } from 'src/common/decorators/roles.decorator';
import { response } from 'express';
import { user_roles } from 'src/drizzle/schema';
import { Role } from 'src/enums/role.enum';
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
  @Get('all')
  getAllRoles() {
    return this.rolesService.getAllRoles();
  }
  @Post('create')
  createRole(@Body('role') role: userRole) {
    if (!role) {
      return response.status(400).json({ message: 'Role is required' });
    }
    return this.rolesService.createRole(role);
  }
  @Delete(':id')
  removeRole(@Param('id') id: string) {
    if (!id) {
      return response.status(400).json({ message: 'Role ID is required' });
    }

    return this.rolesService.removeRole(id);
  }
  @Patch(':id')
  updateRole(@Param('id') id: string, @Body('role') role: userRole) {
    if (!id) {
      return response.status(400).json({ message: 'Role ID is required' });
    }
    if (!role) {
      return response.status(400).json({ message: 'Role is required' });
    }
    return this.rolesService.updateRole(id, role);
  }
  @Get('get-role-permissions')
  getRolePermissions() {
    return this.rolesService.getRolePermissions();
  }

  @Post('add-permission-to-role')
  addPermissionToRole(
    @Body('roleId') roleId: string,
    @Body('permissionId') permissionId: string,
  ) {
    if (!roleId) {
      return response.status(400).json({ message: 'Role ID is required' });
    }
    if (!permissionId) {
      return response
        .status(400)
        .json({ message: 'Permission ID is required' });
    }
    return this.rolesService.addPermissionToRole(roleId, permissionId);
  }
  @Delete('remove-permission-from-role')
  removePermissionFromRole(
    @Body('roleId') roleId: string,
    @Body('permissionId') permissionId: string,
  ) {
    if (!roleId) {
      return response.status(400).json({ message: 'Role ID is required' });
    }
    if (!permissionId) {
      return response
        .status(400)
        .json({ message: 'Permission ID is required' });
    }
    return this.rolesService.removePermissionFromRole(roleId, permissionId);
  }
}
