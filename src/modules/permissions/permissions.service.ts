import {
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE } from '../../drizzle/drizzle.module.js';
import { permissions } from '../../drizzle/schema/index.js';
import { type DrizzleDB } from '../../drizzle/types/drizzle.js';
import { PermissionsErrorKeyEnum } from './constants/permissions.enums.js';

@Injectable()
export class PermissionsService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}
  async getAllPermissions() {
    try {
      const allPermissions = await this.db
        .select()
        .from(permissions)
        .catch((error) => {
          throw new InternalServerErrorException(
            'Failed to fetch system permissions list',
            {
              cause: error,
            },
          );
        });
      return allPermissions;
    } catch (error) {
      if (error instanceof InternalServerErrorException) {
        throw error;
      }
      throw new InternalServerErrorException(
        PermissionsErrorKeyEnum.FAILED_TO_FETCH_PERMISSIONS,
        {
          cause: error,
        },
      );
    }
  }
  async createPermission(permissionName: string) {
    try {
      const existing = await this.db
        .select()
        .from(permissions)
        .where(eq(permissions.permission_name, permissionName))
        .limit(1)
        .catch((error) => {
          throw new InternalServerErrorException(
            'Failed to check existing permission name',
            {
              cause: error,
            },
          );
        });
      if (existing.length > 0) {
        throw new Error(
          `${permissionName} Permission already exists :${JSON.stringify(existing)}`,
        );
      }
      const permission = await this.db
        .insert(permissions)
        .values({
          permission_name: permissionName,
        })
        .catch((error) => {
          throw new InternalServerErrorException(
            'Failed to create new permission definition',
            {
              cause: error,
            },
          );
        });
      return permission;
    } catch (error) {
      if (error instanceof InternalServerErrorException) {
        throw error;
      }
      throw new InternalServerErrorException(
        PermissionsErrorKeyEnum.FAILED_TO_CREATE_PERMISSION,
        {
          cause: error,
        },
      );
    }
  }
  async removePermission(permissionId: string) {
    try {
      const removed = await this.db
        .delete(permissions)
        .where(eq(permissions.id, permissionId))
        .catch((error) => {
          throw new InternalServerErrorException(
            'Failed to delete permission record',
            {
              cause: error,
            },
          );
        });
      return removed;
    } catch (error) {
      if (error instanceof InternalServerErrorException) {
        throw error;
      }
      throw new InternalServerErrorException(
        PermissionsErrorKeyEnum.FAILED_TO_REMOVE_PERMISSION,
        {
          cause: error,
        },
      );
    }
  }
  async updatePermission(permissionId: string, permissionName: string) {
    try {
      const existing = await this.db
        .select()
        .from(permissions)
        .where(eq(permissions.id, permissionId))
        .limit(1)
        .catch((error) => {
          throw new InternalServerErrorException(
            'Failed to check permission existence for update',
            {
              cause: error,
            },
          );
        });
      if (existing.length === 0) {
        throw new Error('Permission not found');
      }
      const updated = await this.db
        .update(permissions)
        .set({ permission_name: permissionName })
        .catch((error) => {
          throw new InternalServerErrorException(
            'Failed to update permission details',
            {
              cause: error,
            },
          );
        });

      return updated;
    } catch (error) {
      if (error instanceof InternalServerErrorException) {
        throw error;
      }
      throw new InternalServerErrorException(
        PermissionsErrorKeyEnum.FAILED_TO_UPDATE_PERMISSION,
        {
          cause: error,
        },
      );
    }
  }
}
