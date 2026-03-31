import {
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE } from 'src/drizzle/drizzle.module';
import { permissions } from 'src/drizzle/schema';
import { type DrizzleDB } from 'src/drizzle/types/drizzle';

@Injectable()
export class PermissionsService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}
  async getAllPermissions() {
    try {
      const allPermissions = await this.db.select().from(permissions);
      console.log('permissions', allPermissions);
      return allPermissions;
    } catch (error) {
      throw new InternalServerErrorException('Failed to fetch permissions', {
        cause: error,
      });
    }
  }
  async createPermission(permissionName: string) {
    try {
      const existing = await this.db
        .select()
        .from(permissions)
        .where(eq(permissions.permission_name, permissionName))
        .limit(1);
      if (existing.length > 0) {
        throw new Error(
          `${permissionName} Permission already exists :${JSON.stringify(existing)}`,
        );
      }
      const permission = await this.db.insert(permissions).values({
        permission_name: permissionName,
      });
      return permission;
    } catch (error) {
      throw new InternalServerErrorException('Failed to create permission', {
        cause: error,
      });
    }
  }
  async removePermission(permissionId: string) {
    try {
      const removed = await this.db
        .delete(permissions)
        .where(eq(permissions.id, permissionId));
      return removed;
    } catch (error) {
      throw new InternalServerErrorException('Failed to remove permission', {
        cause: error,
      });
    }
  }
  async updatePermission(permissionId: string, permissionName: string) {
    try {
      const existing = await this.db
        .select()
        .from(permissions)
        .where(eq(permissions.id, permissionId))
        .limit(1);
      if (existing.length === 0) {
        throw new Error('Permission not found');
      }
      const updated = await this.db
        .update(permissions)
        .set({ permission_name: permissionName });

      return updated;
    } catch (error) {
      throw new InternalServerErrorException('Failed to update permission', {
        cause: error,
      });
    }
  }
}
