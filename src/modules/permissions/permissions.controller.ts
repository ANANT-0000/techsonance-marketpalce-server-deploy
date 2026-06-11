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
import { PermissionsErrorKeyEnum } from './constants/permissions.enums';
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
      throw new BadRequestException(PermissionsErrorKeyEnum.PERMISSION_NAME_IS_REQUIRED);
    }
    return this.permissionsService.createPermission(permissionName);
  }
  @Patch(':id')
  updatePermission(
    @Param('id') id: string,
    @Body('permissionName') permissionName: string,
  ) {
    if (!id || !permissionName) {
      throw new BadRequestException(PermissionsErrorKeyEnum.PERMISSION_ID_AND_NAME_ARE_REQUIRED);
    }
    return this.permissionsService.updatePermission(id, permissionName);
  }
  @Delete(':id')
  removePermission(@Param('id') id: string) {
    if (!id) {
      throw new BadRequestException(PermissionsErrorKeyEnum.PERMISSION_ID_IS_REQUIRED);
    }
    return this.permissionsService.removePermission(id);
  }
}
