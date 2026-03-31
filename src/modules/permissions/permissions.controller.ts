import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { PermissionsService } from './permissions.service';
@Controller({
  version: '1',
  path: 'permissions',
})
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}
  @Get('hello')
  getHello() {
    return 'Hello World!';
  }

  @Get()
  getAllPermissions() {
    return this.permissionsService.getAllPermissions();
  }

  @Post()
  createPermission(@Body('permissionName') permissionName: string) {
    if (!permissionName) {
      throw new BadRequestException('Permission name is required');
    }
    return this.permissionsService.createPermission(permissionName);
  }
  @Patch(':id')
  updatePermission(
    @Param('id') id: string,
    @Body('permissionName') permissionName: string,
  ) {
    if (!id || !permissionName) {
      throw new BadRequestException('Permission ID and name are required');
    }
    return this.permissionsService.updatePermission(id, permissionName);
  }
  @Delete(':id')
  removePermission(@Param('id') id: string) {
    if (!id) {
      throw new BadRequestException('Permission ID is required');
    }
    return this.permissionsService.removePermission(id);
  }
}
