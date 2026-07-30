import {
  Controller,
  Post,
  Get,
  Delete,
  UseInterceptors,
  UploadedFile,
  Headers,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadToCloudService } from './upload-to-cloud.service.js';
import { RoleGuard } from '../../guards/role.guard.js';
import { VendorActiveGuard } from '../../guards/vendor-status.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Role } from '../../enums/role.enum.js';
import { AllowCleanup } from '../../common/decorators/allow-cleanup.decorator.js';

@Controller({ version: '1', path: 'upload-to-cloud' })
export class UploadToCloudController {
  constructor(private readonly uploadToCloudService: UploadToCloudService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadImage(@UploadedFile() file: Express.Multer.File) {
    return this.uploadToCloudService.uploadImage(file);
  }

  @Delete('delete-image')
  @AllowCleanup()
  @UseGuards(RoleGuard, VendorActiveGuard)
  @Roles(Role.ADMIN, Role.VENDOR)
  async deleteImage(
    @Query('url') url: string,
    @Headers('cleanup-token') cleanupToken?: string,
    @Headers('company-domain') domain?: string,
  ) {
    if (cleanupToken === 'true') {
      return this.uploadToCloudService.cleanupCloudinaryImage(url);
    }
    if (!domain) {
      throw new BadRequestException(
        'Company domain or ID is required for standard deletion',
      );
    }
    return this.uploadToCloudService.deleteCloudinaryImage(domain, url);
  }

  @Get('signature')
  @UseGuards(RoleGuard, VendorActiveGuard)
  @Roles(Role.ADMIN, Role.VENDOR)
  async getSignature() {
    return this.uploadToCloudService.generateSignature();
  }
}
