import { Inject, Injectable } from '@nestjs/common';
import { and, eq, InferSelectModel } from 'drizzle-orm';
import { DRIZZLE } from 'src/drizzle/drizzle.module';
import { permissions, role_permissions, user_roles } from 'src/drizzle/schema';
import { type DrizzleDB } from 'src/drizzle/types/drizzle';
type Role = InferSelectModel<typeof user_roles>['role_name'];
@Injectable()
export class RolesService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async getAllRoles() {
    const roles = await this.db
      .select({
        id: user_roles.id,
        role_name: user_roles.role_name,
      })
      .from(user_roles);
    console.log('roles', roles);
    return roles;
  }
  async createRole(role: Role) {
    console.log('role', role);
    const existing = await this.db
      .select()
      .from(user_roles)
      .where(eq(user_roles.role_name, role))
      .limit(1);
    console.log('existing', existing);
    if (existing.length > 0) {
      throw new Error('Role already exists');
    }
    return await this.db.insert(user_roles).values({
      role_name: role,
    });
  }

  async updateRole(id: string, role: Role) {
    return await this.db
      .update(user_roles)
      .set({ role_name: role })
      .where(eq(user_roles.id, id));
  }
  async removeRole(id: string) {
    const existing = await this.db
      .select()
      .from(user_roles)
      .where(eq(user_roles.id, id))
      .limit(1);
    if (existing.length === 0) {
      throw new Error('Role not found');
    }
    return await this.db.delete(user_roles).where(eq(user_roles.id, id));
  }
  async getRolePermissions() {
    const allRolePermissions = await this.db.select().from(role_permissions);
    console.log('allRolePermissions', allRolePermissions);
    if (!allRolePermissions) {
      return {
        status: 404,
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
    return {
      status: 201,
      message: 'Role permissions retrieved successfully',
      role_permissions: rolePermissions,
    };
  }
  async addPermissionToRole(roleId: string, permissionId: string) {
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
    await this.db.insert(role_permissions).values({
      role_id: roleId,
      permission_id: permissionId,
    });
  }
  async removePermissionFromRole(roleId: string, permissionId: string) {
    return await this.db
      .delete(role_permissions)
      .where(
        and(
          eq(role_permissions.role_id, roleId),
          eq(role_permissions.permission_id, permissionId),
        ),
      );
  }
}
