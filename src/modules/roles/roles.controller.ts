import { Body, Controller, Delete, Post } from '@nestjs/common';
import { RolesService } from './roles.service';
import { Roles } from 'src/common/decorators/roles.decorator';
import { response } from 'express';
import { InferSelectModel } from 'drizzle-orm';
import { user_roles } from 'src/drizzle/schema';
import { Role } from 'src/enums/role.enum';
type userRole = InferSelectModel<typeof user_roles>['role_name'];
@Roles(Role.ADMIN)
@Controller({
  version: '1',
  path: 'roles',
})
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Post('create')
  createRole(@Body('role') role: userRole) {
    if (!role) {
      return response.status(400).json({ message: 'Role is required' });
    }
    return this.rolesService.createRole(role);
  }
  @Delete(':id')
  removeRole(@Body('id') id: string) {
    if (!id) {
      return response.status(400).json({ message: 'Role ID is required' });
    }

    return this.rolesService.removeRole(id);
  }
  @Post('update')
  updateRole(@Body('id') id: string, @Body('role') role: userRole) {
    if (!id) {
      return response.status(400).json({ message: 'Role ID is required' });
    }
    if (!role) {
      return response.status(400).json({ message: 'Role is required' });
    }
    return this.rolesService.updateRole(id, role);
  }
  @Post('permission/create')
  createPermission(@Body('permissionName') permissionName: string) {
    if (!permissionName) {
      return response
        .status(400)
        .json({ message: 'Permission name is required' });
    }

    return this.rolesService.createPermission(permissionName);
  }
  @Delete('permission/:id')
  removePermission(@Body('id') id: string) {
    if (!id) {
      return response
        .status(400)
        .json({ message: 'Permission ID is required' });
    }
    return this.rolesService.removePermission(id);
  }
  @Post('permission/update')
  updatePermission(
    @Body('id') id: string,
    @Body('permissionName') permissionName: string,
  ) {
    if (!id) {
      return response
        .status(400)
        .json({ message: 'Permission ID is required' });
    }
    if (!permissionName) {
      return response
        .status(400)
        .json({ message: 'Permission name is required' });
    }

    return this.rolesService.updatePermission(id, permissionName);
  }
  @Post('permission-to-add')
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
  @Delete('permission-to-delete')
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
