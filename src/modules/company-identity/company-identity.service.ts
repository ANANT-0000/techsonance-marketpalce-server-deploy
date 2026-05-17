import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DRIZZLE, type DrizzleService } from '../../drizzle/drizzle.module';
import {
  company_branding,
  company_compliance,
  company_document_config,
  company_legal_profile,
} from '../../drizzle/schema/company_identity.schema';
import { CompanyService } from '../company/company.service';
import { domainExtractor } from '../../common/filters/domainExtractor.filter';
import { UploadToCloudService } from '../../utils/upload-to-cloud/upload-to-cloud.service';
import {
  UpsertBrandingDto,
  UpsertDocumentConfigDto,
  UpsertLegalProfileDto,
} from './dto/upsert-company-identity.dto';

@Injectable()
export class CompanyIdentityService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService,
    private readonly companyService: CompanyService,
    private readonly uploadService: UploadToCloudService,
  ) {}

  // ─── Helper: resolve companyId from domain string ──────────────────────────
  private async resolveCompanyId(domain: string): Promise<string> {
    const filteredDomain = domainExtractor(domain);
    const companyId = await this.companyService.find(filteredDomain);
    if (!companyId) {
      throw new HttpException('Company not found', HttpStatus.NOT_FOUND);
    }
    return companyId;
  }

  // ══════════════════════════════════════════════════════════
  // BRANDING
  // ══════════════════════════════════════════════════════════

  async getBranding(domain: string) {
    try {
      const companyId = await this.resolveCompanyId(domain);
      const [record] = await this.db
        .select()
        .from(company_branding)
        .where(eq(company_branding.company_id, companyId))
        .limit(1)
        .catch((error) => {
          console.error('Error during fetching branding:', error);
          throw new InternalServerErrorException('Failed to fetch branding', {
            cause: error,
          });
        });
      console.log('record', record);
      return record ?? null;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException('Failed to fetch branding', {
        cause: error,
      });
    }
  }

  async upsertBranding(
    domain: string,
    dto: UpsertBrandingDto,
    files: {
      logo?: Express.Multer.File[];
      logo_dark?: Express.Multer.File[];
      watermark?: Express.Multer.File[];
      favicon?: Express.Multer.File[];
    },
  ) {
    try {
      const companyId = await this.resolveCompanyId(domain);
      console.log('dto', dto);
      console.log('files', files);
      // Upload any provided logo files to Cloudinary
      const uploadedUrls: Partial<UpsertBrandingDto> = {};

      if (files?.logo?.[0]) {
        const result = await this.uploadService.uploadFile(files.logo[0]);
        uploadedUrls.logo_url = result.secure_url;
        console.log('uploadedUrls logo', uploadedUrls);
      }
      if (files?.logo_dark?.[0]) {
        const result = await this.uploadService.uploadFile(files.logo_dark[0]);
        uploadedUrls.logo_dark_url = result.secure_url;
        console.log('uploadedUrls logo_dark', uploadedUrls);
      }
      if (files?.watermark?.[0]) {
        const result = await this.uploadService.uploadFile(files.watermark[0]);
        uploadedUrls.watermark_url = result.secure_url;
        console.log('uploadedUrls watermark', uploadedUrls);
      }
      if (files?.favicon?.[0]) {
        const result = await this.uploadService.uploadFile(files.favicon[0]);
        uploadedUrls.favicon_url = result.secure_url;
        console.log('uploadedUrls favicon', uploadedUrls);
      }
      console.log('arranging payload');
      const payload = {
        company_id: companyId,
        primary_color: dto.primary_color ?? '#000000',
        secondary_color: dto.secondary_color ?? null,
        accent_color: dto.accent_color ?? null,
        font_family: dto.font_family ?? 'Inter',
        logo_url: uploadedUrls.logo_url ?? dto.logo_url ?? '',
        logo_dark_url: uploadedUrls.logo_dark_url ?? dto.logo_dark_url ?? null,
        watermark_url: uploadedUrls.watermark_url ?? dto.watermark_url ?? null,
        favicon_url: uploadedUrls.favicon_url ?? dto.favicon_url ?? null,
      };
      console.log('payload arranged', payload);
      // Check if record exists → upsert
      const [existing] = await this.db
        .select({ id: company_branding.id })
        .from(company_branding)
        .where(eq(company_branding.company_id, companyId))
        .limit(1)
        .catch((error) => {
          console.error('Error during checking existing branding:', error);
          throw new InternalServerErrorException('Failed to upsert branding', {
            cause: error,
          });
        });

      if (existing) {
        console.log('Updating existing branding');
        const [updated] = await this.db
          .update(company_branding)
          .set(payload)
          .where(eq(company_branding.company_id, companyId))
          .returning()
          .catch((error) => {
            console.error('Error during updating branding upsert:', error);
            throw new InternalServerErrorException(
              'Failed to upsert branding',
              {
                cause: error,
              },
            );
          });
        console.log('Updated branding', updated);
        return updated;
      }
      console.log('Creating new branding');
      const [created] = await this.db
        .insert(company_branding)
        .values(payload)
        .returning()
        .catch((error) => {
          console.error('Error during creating branding upsert:', error);
          throw new InternalServerErrorException('Failed to upsert branding', {
            cause: error,
          });
        });
      console.log('Created branding', created);
      return created;
    } catch (error) {
      if (
        error instanceof HttpException ||
        error instanceof InternalServerErrorException
      )
        throw error;
      throw new InternalServerErrorException('Failed to upsert branding', {
        cause: error,
      });
    }
  }

  // ══════════════════════════════════════════════════════════
  // LEGAL PROFILE
  // ══════════════════════════════════════════════════════════

  async getLegalProfile(domain: string) {
    try {
      const companyId = await this.resolveCompanyId(domain);
      const [record] = await this.db
        .select()
        .from(company_legal_profile)
        .where(eq(company_legal_profile.company_id, companyId))
        .limit(1)
        .catch((error) => {
          console.error('Error during fetching legal profile:', error);
          throw new InternalServerErrorException(
            'Failed to fetch legal profile',
            {
              cause: error,
            },
          );
        });
      console.log('record', record);
      return record ?? null;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException('Failed to fetch legal profile', {
        cause: error,
      });
    }
  }

  async upsertLegalProfile(domain: string, dto: UpsertLegalProfileDto) {
    try {
      const companyId = await this.resolveCompanyId(domain);

      const payload = {
        company_id: companyId,
        legal_name: dto.legal_name,
        trade_name: dto.trade_name ?? null,
        country_code: dto.country_code,
        support_email: dto.support_email ?? null,
        support_phone: dto.support_phone ?? null,
        website_url: dto.website_url ?? null,
        registered_address_id: dto.registered_address_id ?? null,
      };
      console.log('searching existing profile');
      const [existing] = await this.db
        .select({ id: company_legal_profile.id })
        .from(company_legal_profile)
        .where(eq(company_legal_profile.company_id, companyId))
        .limit(1)
        .catch((error) => {
          console.error('Error during checking existing legal profile:', error);
          throw new InternalServerErrorException(
            'Failed to upsert legal profile',
            {
              cause: error,
            },
          );
        });

      if (existing) {
        console.log('updating existing profile');
        const [updated] = await this.db
          .update(company_legal_profile)
          .set(payload)
          .where(eq(company_legal_profile.company_id, companyId))
          .returning()
          .catch((error) => {
            console.error('Error during updating legal profile upsert:', error);
            throw new InternalServerErrorException(
              'Failed to upsert legal profile',
              {
                cause: error,
              },
            );
          });
        console.log('updated profile', updated);
        return updated;
      }
      console.log('creating new profile');

      const [created] = await this.db
        .insert(company_legal_profile)
        .values(payload)
        .returning()
        .catch((error) => {
          console.error('Error during creating legal profile:', error);
          throw new InternalServerErrorException(
            'Failed to upsert legal profile',
            {
              cause: error,
            },
          );
        });
      console.log('created profile', created);
      return created;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException('Failed to upsert legal profile', {
        cause: error,
      });
    }
  }

  // ══════════════════════════════════════════════════════════
  // COMPLIANCE (country-specific tax IDs)
  // ══════════════════════════════════════════════════════════

  async getCompliance(domain: string) {
    try {
      const companyId = await this.resolveCompanyId(domain);
      const records = await this.db
        .select()
        .from(company_compliance)
        .where(eq(company_compliance.company_id, companyId))
        .orderBy(company_compliance.country_code);
      return records;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException(
        'Failed to fetch compliance records',
        { cause: error },
      );
    }
  }
  // ══════════════════════════════════════════════════════════
  // DOCUMENT CONFIG (invoice numbering, signatory, footer)
  // ══════════════════════════════════════════════════════════

  async getDocumentConfig(domain: string) {
    try {
      const companyId = await this.resolveCompanyId(domain);
      const [record] = await this.db
        .select()
        .from(company_document_config)
        .where(eq(company_document_config.company_id, companyId))
        .limit(1);
      console.log('found record', record);
      return record ?? null;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException(
        'Failed to fetch document config',
        { cause: error },
      );
    }
  }

  async upsertDocumentConfig(
    domain: string,
    dto: UpsertDocumentConfigDto,
    files: { signatory_signature_file?: Express.Multer.File[] },
  ) {
    try {
      console.log('dto', dto);
      console.log('files', files);
      const companyId = await this.resolveCompanyId(domain);
      const uploadedUrls: Partial<{ signatory_signature_url?: string }> = {};
      if (files?.signatory_signature_file?.[0]) {
        console.log('uploading signatory_signature');
        const result = await this.uploadService
          .uploadDocument(
            files.signatory_signature_file[0],
            'signatory_signature',
          )
          .catch((error) => {
            console.error('Error during uploading signatory signature:', error);
            throw new InternalServerErrorException(
              'Failed to upload signatory signature',
              { cause: error },
            );
          });
        uploadedUrls.signatory_signature_url = result.secure_url;
      }
      console.log('uploaded signatory_signature');

      console.log('searching existing document config');

      const [existing] = await this.db
        .select({
          id: company_document_config.id,
          signatory_signature_url:
            company_document_config.signatory_signature_url,
        })
        .from(company_document_config)
        .where(eq(company_document_config.company_id, companyId))
        .limit(1)
        .catch((error) => {
          console.error(
            'Error during checking existing document config:',
            error,
          );
          throw new InternalServerErrorException(
            'Failed to upsert document config',
            { cause: error },
          );
        });
      const payload: any = {
        company_id: companyId,
        invoice_number_prefix: dto.invoice_number_prefix ?? 'INV',
        invoice_number_format:
          dto.invoice_number_format ?? '{PREFIX}-{YYYY}-{SEQ8}',
        invoice_sequence_reset: dto.invoice_sequence_reset ?? 'APRIL',
        default_currency: dto.default_currency ?? 'INR',
        default_timezone: dto.default_timezone ?? 'Asia/Kolkata',
        date_format: dto.date_format ?? 'DD/MM/YYYY',
        signatory_name: dto.signatory_name ?? null,
        signatory_designation: dto.signatory_designation ?? null,
        signatory_signature_url:
          uploadedUrls.signatory_signature_url ??
          existing?.signatory_signature_url ??
          null,
        invoice_footer_text: dto.invoice_footer_text ?? null,
        invoice_terms_and_conditions: dto.invoice_terms_and_conditions ?? null,
        default_invoice_template_id: dto.default_invoice_template_id ?? null,
      };
      if (existing) {
        console.log('updating existing document config');
        const [updated] = await this.db
          .update(company_document_config)
          .set(payload)
          .where(
            and(
              eq(company_document_config.company_id, companyId),
              eq(company_document_config.id, existing.id),
            ),
          )
          .returning()
          .catch((error) => {
            console.error(
              'Error during updating document config upsert:',
              error,
            );
            throw new InternalServerErrorException(
              'Failed to upsert document config',
              {
                cause: error,
              },
            );
          });
        console.log('updated document config', updated);
        return updated;
      }
      console.log('creating new document config');

      const [created] = await this.db
        .insert(company_document_config)
        .values(payload)
        .returning()
        .catch((error) => {
          console.error('Error during creating document config upsert:', error);
          throw new InternalServerErrorException(
            'Failed to upsert document config',
            {
              cause: error,
            },
          );
        });
      console.log('created document config', created);
      return created;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException(
        'Failed to upsert document config',
        { cause: error },
      );
    }
  }
}
