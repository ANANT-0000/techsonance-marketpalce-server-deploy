import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  HttpStatus,
  HttpCode,
  Headers,
  UploadedFiles,
} from '@nestjs/common';
import { ComplianceService } from './compliance.service';

@Controller({ version: '1', path: 'compliance' })
export class ComplianceController {
  constructor(private readonly complianceService: ComplianceService) {}
  @Get()
  @HttpCode(HttpStatus.OK)
  async listAll(@Headers('company-domain') domain: string) {
    return this.complianceService.listCompliance(domain);
  }

  // // ── GET: list by country ────────────────────────────────────────────────

  // @Get('country/:countryCode')
  // @HttpCode(HttpStatus.OK)
  // async listByCountry(
  //   @Headers('company-domain') domain: string,
  //   @Param('countryCode') countryCode: string,
  // ) {
  //   return this.complianceService.listComplianceFieldsByCountry(
  //     domain,
  //     countryCode.toUpperCase(),
  //   );
  // }

  // // ── GET: documents for a field ──────────────────────────────────────────

  // @Get('field/:fieldId/documents')
  // @HttpCode(HttpStatus.OK)
  // async listDocuments(
  //   @Headers('company-domain') domain: string,
  //   @Param('fieldId') fieldId: string,
  // ) {
  //   return this.complianceService.listDocumentsForField(domain, fieldId);
  // }

  // // ── POST: register a new compliance field ───────────────────────────────

  // @Post()
  // @HttpCode(HttpStatus.CREATED)
  // @HttpCode(HttpStatus.CREATED)
  // @UploadToCloud([{ name: 'documents', maxCount: 20 }])
  // async createField(
  //   @Headers('company-domain') domain: string,
  //   @Body() dto: CreateComplianceDto,
  //   @UploadedFiles() files: Express.Multer.File[],
  // ) {
  //   return this.complianceService.createCompliance(domain, dto, files);
  // }

  // ── POST: upload a proof document ───────────────────────────────────────

  // @Post('field/:fieldId/documents')
  // @HttpCode(HttpStatus.CREATED)
  // @UploadToCloud([{ name: 'proof_document', maxCount: 1 }])
  // async uploadDocument(
  //   @Headers('company-domain') domain: string,
  //   @Param('fieldId') fieldId: string,
  //   @Body() dto: UploadComplianceDocumentBodyDto,
  //   @UploadedFiles() file: Express.Multer.File,
  // ) {
  //   // Merge route param into body DTO
  //   dto.compliance_field_id = fieldId;
  //   return this.complianceService.uploadComplianceDocument(domain, dto, file);
  // }
}
