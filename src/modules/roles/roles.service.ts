import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { and, eq, InferSelectModel } from 'drizzle-orm';
import { DRIZZLE } from '../../drizzle/drizzle.module';
import {
  permissions,
  role_permissions,
  user_roles,
} from '../../drizzle/schema';
import { type DrizzleDB } from '../../drizzle/types/drizzle';
type Role = InferSelectModel<typeof user_roles>['role_name'];
@Injectable()
export class RolesService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async getAllRoles() {
    try {
      console.log('[RolesService.getAllRoles] Querying roles');
      const roles = await this.db
        .select({
          id: user_roles.id,
          role_name: user_roles.role_name,
        })
        .from(user_roles);
      console.log(
        `[RolesService.getAllRoles] Retrieved ${roles.length} role record(s)`,
      );
      return roles;
    } catch (error) {
      throw new InternalServerErrorException('Failed to fetch roles', {
        cause: error,
      });
    }
  }
  async createRole(role: Role) {
    console.log('[RolesService.createRole] Request received', { role });
    if (!role) {
      throw new BadRequestException('Role is required');
    }
    try {
      console.log('[RolesService.createRole] Checking for existing role');
      const existing = await this.db
        .select()
        .from(user_roles)
        .where(eq(user_roles.role_name, role))
        .limit(1);
      if (existing.length > 0) {
        throw new Error('Role already exists');
      }
      console.log('[RolesService.createRole] Inserting new role');
      const insertResult = await this.db.insert(user_roles).values({
        role_name: role,
      });
      console.log('[RolesService.createRole] Role created successfully');
      return insertResult;
    } catch (error) {
      throw new InternalServerErrorException('Failed to create role', {
        cause: error,
      });
    }
  }

  async updateRole(id: string, role: Role) {
    if (!id) {
      return {
        success: false,
        message: 'Role ID is required',
        status: HttpStatus.BAD_REQUEST,
      };
    }
    if (!role) {
      throw new BadRequestException('Role ID  are required');
    }
    try {
      console.log('[RolesService.updateRole] Request received', { id, role });
      console.log('[RolesService.updateRole] Updating role record');
      const result = await this.db
        .update(user_roles)
        .set({ role_name: role })
        .where(eq(user_roles.id, id));
      return result;
    } catch (error) {
      throw new InternalServerErrorException('Failed to update role', {
        cause: error,
      });
    }
  }
  async removeRole(id: string) {
    if (!id) {
      throw new BadRequestException('Both Role  ID are required');
    }
    try {
      console.log('[RolesService.removeRole] Request received', { id });
      console.log('[RolesService.removeRole] Checking existing role');
      const existing = await this.db
        .select()
        .from(user_roles)
        .where(eq(user_roles.id, id))
        .limit(1);
      if (existing.length === 0) {
        throw new Error('Role not found');
      }
      console.log('[RolesService.removeRole] Deleting role record');
      await this.db.delete(user_roles).where(eq(user_roles.id, id));
      console.log('[RolesService.removeRole] Role removed successfully');
      return {
        success: true,
        status: HttpStatus.OK,
        message: 'Role removed successfully',
      };
    } catch (error) {
      throw new InternalServerErrorException('Failed to remove role', {
        cause: error,
      });
    }
  }
  async getRolePermissions() {
    try {
      console.log(
        '[RolesService.getRolePermissions] Querying role permissions',
      );
      const allRolePermissions = await this.db.select().from(role_permissions);
      console.log(
        `[RolesService.getRolePermissions] Retrieved ${allRolePermissions.length} role_permission record(s)`,
      );
      if (!allRolePermissions) {
        return {
          status: HttpStatus.NOT_FOUND,
          message: 'No role permissions found',
          role_permissions: [],
        };
      }
      const permissionList = await this.db.select().from(permissions);
      const roleList = await this.db.select().from(user_roles);
      const rolePermissions = roleList.map((role) => {
        const permissionsForRole = allRolePermissions
          .map((rp) => {
            if (rp.role_id === role.id) {
              const permission = permissionList.find(
                (p) => p.id === rp.permission_id,
              );
              return permission ? permission.permission_name : null;
            }
          })
          .filter((p) => p !== null);
        return {
          role: role.role_name,
          permissions: permissionsForRole,
        };
      });
      console.log(
        '[RolesService.getRolePermissions] Role permissions resolved successfully',
      );
      return rolePermissions;
    } catch (error) {
      throw new InternalServerErrorException(
        'Failed to retrieve role permissions',
        {
          cause: error,
        },
      );
    }
  }
  async addPermissionToRole(roleId: string, permissionId: string) {
    if (!roleId && !permissionId) {
      throw new BadRequestException(
        'Both Role ID and Permission ID are required',
      );
    }

    try {
      console.log('[RolesService.addPermissionToRole] Request received', {
        roleId,
        permissionId,
      });
      console.log(
        '[RolesService.addPermissionToRole] Checking existing role permission',
      );
      const existing = await this.db
        .select()
        .from(role_permissions)
        .where(
          and(
            eq(role_permissions.role_id, roleId),
            eq(role_permissions.permission_id, permissionId),
          ),
        )
        .limit(1);
      if (existing.length > 0) {
        throw new Error('Permission already assigned to role');
      }
      console.log(
        '[RolesService.addPermissionToRole] Inserting role permission',
      );
      const insertResult = await this.db.insert(role_permissions).values({
        role_id: roleId,
        permission_id: permissionId,
      });
      console.log(
        '[RolesService.addPermissionToRole] Permission assigned to role successfully',
      );
      return insertResult;
    } catch (error) {
      throw new InternalServerErrorException(
        'Failed to add permission to role',
        {
          cause: error,
        },
      );
    }
  }
  async removePermissionFromRole(roleId: string, permissionId: string) {
    if (!roleId && !permissionId) {
      throw new BadRequestException(
        'Both Role ID and Permission ID are required',
      );
    }

    try {
      console.log('[RolesService.removePermissionFromRole] Request received', {
        roleId,
        permissionId,
      });
      console.log(
        '[RolesService.removePermissionFromRole] Deleting role permission',
      );
      await this.db
        .delete(role_permissions)
        .where(
          and(
            eq(role_permissions.role_id, roleId),
            eq(role_permissions.permission_id, permissionId),
          ),
        );
      return {
        success: true,
        status: HttpStatus.OK,
        message: 'Permission removed from role successfully',
      };
    } catch (error) {
      throw new InternalServerErrorException(
        'Failed to remove permission from role',
        {
          cause: error,
        },
      );
    }
  }
}
