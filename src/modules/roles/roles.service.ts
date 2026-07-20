import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { and, eq, InferSelectModel } from 'drizzle-orm';
import { DRIZZLE } from '../../drizzle/drizzle.module.js';
import {
  permissions,
  role_permissions,
  user_roles,
} from '../../drizzle/schema/index.js';
import { type DrizzleDB } from '../../drizzle/types/drizzle.js';
import { RolesErrorKeyEnum } from './constants/roles.enums.js';
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
        .from(user_roles)
        .catch((error) => {
          throw new InternalServerErrorException('Failed to fetch user roles', {
            cause: error,
          });
        });
      return roles;
    } catch (error) {
      if (error instanceof InternalServerErrorException) {
        throw error;
      }
      throw new InternalServerErrorException(
        RolesErrorKeyEnum.FAILED_TO_FETCH_ROLES,
        {
          cause: error,
        },
      );
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
        .limit(1)
        .catch((error) => {
          throw new InternalServerErrorException(
            'Failed to check existing role name',
            {
              cause: error,
            },
          );
        });
      if (existing.length > 0) {
        throw new Error('Role already exists');
      }
      const insertResult = await this.db
        .insert(user_roles)
        .values({
          role_name: role,
        })
        .catch((error) => {
          throw new InternalServerErrorException(
            'Failed to create new user role',
            {
              cause: error,
            },
          );
        });
      return insertResult;
    } catch (error) {
      if (error instanceof InternalServerErrorException) {
        throw error;
      }
      throw new InternalServerErrorException(
        RolesErrorKeyEnum.FAILED_TO_CREATE_ROLE,
        {
          cause: error,
        },
      );
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
        .where(eq(user_roles.id, id))
        .catch((error) => {
          throw new InternalServerErrorException(
            'Failed to update user role details',
            {
              cause: error,
            },
          );
        });
      return result;
    } catch (error) {
      if (error instanceof InternalServerErrorException) {
        throw error;
      }
      throw new InternalServerErrorException(
        RolesErrorKeyEnum.FAILED_TO_UPDATE_ROLE,
        {
          cause: error,
        },
      );
    }
  }
  async removeRole(id: string) {
    if (!id) {
      throw new BadRequestException(
        RolesErrorKeyEnum.BOTH_ROLE_ID_ARE_REQUIRED,
      );
    }
    try {
      const existing = await this.db
        .select()
        .from(user_roles)
        .where(eq(user_roles.id, id))
        .limit(1)
        .catch((error) => {
          throw new InternalServerErrorException(
            'Failed to check role existence for removal',
            {
              cause: error,
            },
          );
        });
      if (existing.length === 0) {
        throw new Error('Role not found');
      }
      await this.db
        .delete(user_roles)
        .where(eq(user_roles.id, id))
        .catch((error) => {
          throw new InternalServerErrorException('Failed to delete user role', {
            cause: error,
          });
        });
      return {
        success: true,
        status: HttpStatus.OK,
        message: 'Role removed successfully',
      };
    } catch (error) {
      if (error instanceof InternalServerErrorException) {
        throw error;
      }
      throw new InternalServerErrorException(
        RolesErrorKeyEnum.FAILED_TO_REMOVE_ROLE,
        {
          cause: error,
        },
      );
    }
  }
  async getRolePermissions(filters?: { limit: number; offset: number }) {
    try {
      const allRolePermissions = await this.db
        .select()
        .from(role_permissions)
        .limit(filters?.limit ?? 10)
        .offset(filters?.offset ?? 0)
        .catch((error) => {
          throw new InternalServerErrorException(
            'Failed to fetch role permissions records',
            {
              cause: error,
            },
          );
        });
      if (!allRolePermissions) {
        return {
          status: HttpStatus.NOT_FOUND,
          message: 'No role permissions found',
          role_permissions: [],
        };
      }
      const permissionList = await this.db
        .select()
        .from(permissions)
        .catch((error) => {
          throw new InternalServerErrorException(
            'Failed to fetch permission definitions',
            {
              cause: error,
            },
          );
        });
      const roleList = await this.db
        .select()
        .from(user_roles)
        .catch((error) => {
          throw new InternalServerErrorException(
            'Failed to fetch user roles for permissions mapping',
            {
              cause: error,
            },
          );
        });
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
      if (error instanceof InternalServerErrorException) {
        throw error;
      }
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
        .limit(1)
        .catch((error) => {
          throw new InternalServerErrorException(
            'Failed to check existing role-permission assignment',
            {
              cause: error,
            },
          );
        });
      if (existing.length > 0) {
        throw new Error('Permission already assigned to role');
      }
      const insertResult = await this.db
        .insert(role_permissions)
        .values({
          role_id: roleId,
          permission_id: permissionId,
        })
        .catch((error) => {
          throw new InternalServerErrorException(
            'Failed to assign permission to role',
            {
              cause: error,
            },
          );
        });
      return insertResult;
    } catch (error) {
      if (error instanceof InternalServerErrorException) {
        throw error;
      }
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
        )
        .catch((error) => {
          throw new InternalServerErrorException(
            'Failed to remove permission assignment from role',
            {
              cause: error,
            },
          );
        });
      return {
        message: 'Permission removed from role successfully',
      };
    } catch (error) {
      if (error instanceof InternalServerErrorException) {
        throw error;
      }
      throw new InternalServerErrorException(
        RolesErrorKeyEnum.FAILED_TO_REMOVE_PERMISSION_FROM_ROLE,
        {
          cause: error,
        },
      );
    }
  }
}
