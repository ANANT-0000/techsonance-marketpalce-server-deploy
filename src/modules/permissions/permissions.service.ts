import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE } from 'src/drizzle/drizzle.module';
import { permissions } from 'src/drizzle/schema';
import { type DrizzleDB } from 'src/drizzle/types/drizzle';

@Injectable()
export class PermissionsService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}
  async getAllPermissions() {
    const allPermissions = await this.db.select().from(permissions);
    console.log('permissions', allPermissions);
    return {
      status: 200,
      message: 'Permissions retrieved successfully',
      permissions: allPermissions,
    };
  }
  async createPermission(permissionName: string) {
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
    return {
      status: 201,
      message: 'Permission created successfully',
      permission,
    };
  }
  async removePermission(permissionId: string) {
    return await this.db
      .delete(permissions)
      .where(eq(permissions.id, permissionId));
  }
  async updatePermission(permissionId: string, permissionName: string) {
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

    return {
      status: 200,
      message: 'Permission updated successfully',
      permission: updated,
    };
  }
}
