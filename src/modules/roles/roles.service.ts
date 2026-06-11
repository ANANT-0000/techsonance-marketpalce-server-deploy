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
import { RolesErrorKeyEnum } from './constants/roles.enums';
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
      return roles;
    } catch (error) {
      throw new InternalServerErrorException(RolesErrorKeyEnum.FAILED_TO_FETCH_ROLES, {
        cause: error,
      });
    }
  }
  async createRole(role: Role) {
    if (!role) {
      throw new BadRequestException(RolesErrorKeyEnum.ROLE_IS_REQUIRED);
    }
    try {
      const existing = await this.db
        .select()
        .from(user_roles)
        .where(eq(user_roles.role_name, role))
        .limit(1);
      if (existing.length > 0) {
        throw new Error('Role already exists');
      }
      const insertResult = await this.db.insert(user_roles).values({
        role_name: role,
      });
      return insertResult;
    } catch (error) {
      throw new InternalServerErrorException(RolesErrorKeyEnum.FAILED_TO_CREATE_ROLE, {
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
      throw new BadRequestException(RolesErrorKeyEnum.ROLE_ID_ARE_REQUIRED);
    }
    try {
      const result = await this.db
        .update(user_roles)
        .set({ role_name: role })
        .where(eq(user_roles.id, id));
      return result;
    } catch (error) {
      throw new InternalServerErrorException(RolesErrorKeyEnum.FAILED_TO_UPDATE_ROLE, {
        cause: error,
      });
    }
  }
  async removeRole(id: string) {
    if (!id) {
      throw new BadRequestException(RolesErrorKeyEnum.BOTH_ROLE_ID_ARE_REQUIRED);
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
      throw new InternalServerErrorException(RolesErrorKeyEnum.FAILED_TO_REMOVE_ROLE, {
        cause: error,
      });
    }
  }
  async getRolePermissions(filters?: { limit: number; offset: number }) {
    try {
      const allRolePermissions = await this.db
        .select()
        .from(role_permissions)
        .limit(filters?.limit ?? 10)
        .offset(filters?.offset ?? 0);
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
      return rolePermissions;
    } catch (error) {
      throw new InternalServerErrorException(
        RolesErrorKeyEnum.FAILED_TO_RETRIEVE_ROLE_PERMISSIONS,
        {
          cause: error,
        },
      );
    }
  }
  async addPermissionToRole(roleId: string, permissionId: string) {
    if (!roleId && !permissionId) {
      throw new BadRequestException(
        RolesErrorKeyEnum.BOTH_ROLE_ID_AND_PERMISSION_ID_ARE_REQUIRED,
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
      if (existing.length > 0) {
        throw new Error('Permission already assigned to role');
      }
      const insertResult = await this.db.insert(role_permissions).values({
        role_id: roleId,
        permission_id: permissionId,
      });
      return insertResult;
    } catch (error) {
      throw new InternalServerErrorException(
        RolesErrorKeyEnum.FAILED_TO_ADD_PERMISSION_TO_ROLE,
        {
          cause: error,
        },
      );
    }
  }
  async removePermissionFromRole(roleId: string, permissionId: string) {
    if (!roleId && !permissionId) {
      throw new BadRequestException(
        RolesErrorKeyEnum.BOTH_ROLE_ID_AND_PERMISSION_ID_ARE_REQUIRED,
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
      throw new InternalServerErrorException(
        RolesErrorKeyEnum.FAILED_TO_REMOVE_PERMISSION_FROM_ROLE,
        {
          cause: error,
        },
      );
    }
  }
}
