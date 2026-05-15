import {
  Body,
  Controller,
  // Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UploadedFiles,
} from '@nestjs/common';

import { UploadToCloud } from '../../common/decorators/upload.decorator';
import { ParseJsonPipe } from '../../common/pipes/parseJsonPipe';
import { CompanyIdentityService } from './company-identity.service';
import {
  UpsertBrandingDto,
  // UpsertComplianceFieldDto,
  UpsertDocumentConfigDto,
  UpsertLegalProfileDto,
} from './dto/upsert-company-identity.dto';

@Controller({ version: '1', path: 'company-identity' })
export class CompanyIdentityController {
  constructor(private readonly service: CompanyIdentityService) {}

  // ─── BRANDING ─────────────────────────────────────────────────────────────

  @Get('branding')
  @HttpCode(HttpStatus.OK)
  async getBranding(@Headers('company-domain') domain: string) {
    console.log('Fetching branding for domain:', domain);
    const data = await this.service.getBranding(domain);
    return { data };
  }

  @Post('branding')
  @HttpCode(HttpStatus.CREATED)
  @UploadToCloud([
    { name: 'logo', maxCount: 1 },
    { name: 'logo_dark', maxCount: 1 },
    { name: 'watermark', maxCount: 1 },
    { name: 'favicon', maxCount: 1 },
  ])
  async upsertBranding(
    @Headers('company-domain') domain: string,
    @Body(ParseJsonPipe) dto: UpsertBrandingDto,
    @UploadedFiles()
    files: {
      logo?: Express.Multer.File[];
      logo_dark?: Express.Multer.File[];
      watermark?: Express.Multer.File[];
      favicon?: Express.Multer.File[];
    },
  ) {
    return await this.service.upsertBranding(domain, dto, files ?? {});
  }

  // ─── LEGAL PROFILE ────────────────────────────────────────────────────────

  @Get('legal-profile')
  @HttpCode(HttpStatus.OK)
  async getLegalProfile(@Headers('company-domain') domain: string) {
    console.log('Fetching legal profile for domain:', domain);
    return await this.service.getLegalProfile(domain);
  }

  @Post('legal-profile')
  @HttpCode(HttpStatus.OK)
  async upsertLegalProfile(
    @Headers('company-domain') domain: string,
    @Body() dto: any,
  ) {
    console.log('Upserting legal profile for domain:', domain, dto);
    return await this.service.upsertLegalProfile(domain, dto);
  }

  // ─── COMPLIANCE ───────────────────────────────────────────────────────────

  @Get('compliance')
  @HttpCode(HttpStatus.OK)
  async getCompliance(@Headers('company-domain') domain: string) {
    return await this.service.getCompliance(domain);
  }

  // @Post('compliance')
  // @HttpCode(HttpStatus.OK)
  // async upsertComplianceField(
  //   @Headers('company-domain') domain: string,
  //   @Body() dto: UpsertComplianceFieldDto,
  // ) {
  //   const data = await this.service.upsertComplianceField(domain, dto);
  //   return { data, message: 'Compliance field saved successfully' };
  // }

  // @Delete('compliance/:fieldId')
  // @HttpCode(HttpStatus.OK)
  // async deleteComplianceField(
  //   @Headers('company-domain') domain: string,
  //   @Param('fieldId') fieldId: string,
  // ) {
  //   return this.service.deleteComplianceField(domain, fieldId);
  // }

  // ─── DOCUMENT CONFIG ──────────────────────────────────────────────────────

  @Get('document-config')
  @HttpCode(HttpStatus.OK)
  async getDocumentConfig(@Headers('company-domain') domain: string) {
    return await this.service.getDocumentConfig(domain);
  }

  @Post('document-config')
  @UploadToCloud([{ name: 'signatory_signature_file', maxCount: 1 }])
  @HttpCode(HttpStatus.OK)
  async upsertDocumentConfig(
    @Headers('company-domain') domain: string,
    @Body(ParseJsonPipe) dto: any,
    @UploadedFiles()
    files: {
      signatory_signature_file?: Express.Multer.File[];
    },
  ) {
    console.log('dro',dto);
    return await this.service.upsertDocumentConfig(domain, dto, files ?? {});
  }
}
