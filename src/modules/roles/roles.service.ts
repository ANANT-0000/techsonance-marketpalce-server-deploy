import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { and, eq, InferSelectModel } from 'drizzle-orm';
import { DRIZZLE } from 'src/drizzle/drizzle.module';
import { permissions, role_permissions, user_roles } from 'src/drizzle/schema';
import { type DrizzleDB } from 'src/drizzle/types/drizzle';
type Role = InferSelectModel<typeof user_roles>['role_name'];
@Injectable()
export class RolesService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async getAllRoles() {
    try {
      const roles = await this.db
        .select({
          id: user_roles.id,
          role_name: user_roles.role_name,
        })
        .from(user_roles);
      console.log('roles', roles);
      return roles;
    } catch (error) {
      throw new InternalServerErrorException('Failed to fetch roles', {
        cause: error,
      });
    }
  }
  async createRole(role: Role) {
    console.log('role creating', role);
    if (!role) {
      throw new BadRequestException('Role is required');
    }
    try {
      const existing = await this.db
        .select()
        .from(user_roles)
        .where(eq(user_roles.role_name, role))
        .limit(1);
      console.log('existing', existing);
      if (existing.length > 0) {
        throw new Error('Role already exists');
      }
      const insertResult = await this.db.insert(user_roles).values({
        role_name: role,
      });
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
      const existing = await this.db
        .select()
        .from(user_roles)
        .where(eq(user_roles.id, id))
        .limit(1);
      if (existing.length === 0) {
        throw new Error('Role not found');
      }
      await this.db.delete(user_roles).where(eq(user_roles.id, id));
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
      const allRolePermissions = await this.db.select().from(role_permissions);
      console.log('allRolePermissions', allRolePermissions);
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
      console.log(rolePermissions);
      return rolePermissions;
    } catch (error) {
      throw new InternalServerErrorException('Failed to retrieve role permissions', {
        cause: error,
      });
    }
  }
  async addPermissionToRole(roleId: string, permissionId: string) {
    if (!roleId && !permissionId) {
      throw new BadRequestException(
        'Both Role ID and Permission ID are required',
      );
    }

    try {
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
      console.log('existing role permission', existing);
      if (existing.length > 0) {
        throw new Error('Permission already assigned to role');
      }
      const insertResult = await this.db.insert(role_permissions).values({
        role_id: roleId,
        permission_id: permissionId,
      });
      return insertResult;
    } catch (error) {
      throw new InternalServerErrorException('Failed to add permission to role', {
        cause: error,
      });
    }
  }
  async removePermissionFromRole(roleId: string, permissionId: string) {
    if (!roleId && !permissionId) {
      throw new BadRequestException(
        'Both Role ID and Permission ID are required',
      );
    }

    try {
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
      throw new InternalServerErrorException('Failed to remove permission from role', {
        cause: error,
      });
    }
  }
}
