import { Inject, Injectable } from '@nestjs/common';
import { and, eq, InferSelectModel } from 'drizzle-orm';
import { DRIZZLE } from 'src/drizzle/drizzle.module';
import { permissions, role_permissions, user_roles } from 'src/drizzle/schema';
import { type DrizzleDB } from 'src/drizzle/types/drizzle';
type Role = InferSelectModel<typeof user_roles>['role_name'];
@Injectable()
export class RolesService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  createRole(role: Role) {
    return this.db.insert(user_roles).values({
      role_name: role,
    });
  }

  updateRole(id: string, role: Role) {
    return this.db
      .update(user_roles)
      .set({ role_name: role })
      .where(eq(user_roles.id, id));
  }
  removeRole(id: string) {
    return this.db.delete(user_roles).where(eq(user_roles.id, id));
  }
  createPermission(permissionName: string) {
    return this.db.insert(permissions).values({
      permission_name: permissionName,
    });
  }
  removePermission(permissionId: string) {
    return this.db.delete(permissions).where(eq(permissions.id, permissionId));
  }
  updatePermission(permissionId: string, permissionName: string) {
    return this.db
      .update(permissions)
      .set({ permission_name: permissionName })
      .where(eq(permissions.id, permissionId));
  }

  addPermissionToRole(roleId: string, permissionId: string) {
    return this.db.transaction(async (tx) => {
      const existing = await tx
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
      await tx.insert(role_permissions).values({
        role_id: roleId,
        permission_id: permissionId,
      });
    });
  }
  removePermissionFromRole(roleId: string, permissionId: string) {
    return this.db
      .delete(role_permissions)
      .where(
        and(
          eq(role_permissions.role_id, roleId),
          eq(role_permissions.permission_id, permissionId),
        ),
      );
  }
}
