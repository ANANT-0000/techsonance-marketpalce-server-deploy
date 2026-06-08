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
    console.log(
      `[CompanyIdentityService.resolveCompanyId] Resolving company for domain: ${domain}`,
    );
    const filteredDomain = domainExtractor(domain);
    console.log(
      `[CompanyIdentityService.resolveCompanyId] Extracted filtered domain: ${filteredDomain}`,
    );
    console.log(
      '[CompanyIdentityService.resolveCompanyId] Querying CompanyService.find(...)',
    );
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
      console.log(
        `[CompanyIdentityService.getBranding] Request received for domain: ${domain}`,
      );
      console.log('[CompanyIdentityService.getBranding] Resolving company id');
      const companyId = await this.resolveCompanyId(domain);
      console.log(
        `[CompanyIdentityService.getBranding] Company resolved: ${companyId}`,
      );
      console.log('[CompanyIdentityService.getBranding] Querying branding record');
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
      console.log('[CompanyIdentityService.getBranding] Branding lookup completed');
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
      console.log(
        `[CompanyIdentityService.upsertBranding] Request received for domain: ${domain}`,
      );
      console.log('[CompanyIdentityService.upsertBranding] Resolving company id');
      const companyId = await this.resolveCompanyId(domain);
      console.log(
        '[CompanyIdentityService.upsertBranding] Preparing branding payload and uploads',
      );
      // Upload any provided logo files to Cloudinary
      const uploadedUrls: Partial<UpsertBrandingDto> = {};

      if (files?.logo?.[0]) {
        console.log('[CompanyIdentityService.upsertBranding] Uploading logo');
        const result = await this.uploadService.uploadFile(files.logo[0]);
        uploadedUrls.logo_url = result.secure_url;
      }
      if (files?.logo_dark?.[0]) {
        console.log('[CompanyIdentityService.upsertBranding] Uploading dark logo');
        const result = await this.uploadService.uploadFile(files.logo_dark[0]);
        uploadedUrls.logo_dark_url = result.secure_url;
      }
      if (files?.watermark?.[0]) {
        console.log('[CompanyIdentityService.upsertBranding] Uploading watermark');
        const result = await this.uploadService.uploadFile(files.watermark[0]);
        uploadedUrls.watermark_url = result.secure_url;
      }
      if (files?.favicon?.[0]) {
        console.log('[CompanyIdentityService.upsertBranding] Uploading favicon');
        const result = await this.uploadService.uploadFile(files.favicon[0]);
        uploadedUrls.favicon_url = result.secure_url;
      }
      console.log('[CompanyIdentityService.upsertBranding] Building branding payload');
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
        background_color: dto.background_color ?? '#f8fafc',
        text_color: dto.text_color ?? '#0f172a',
        navbar_bg: dto.navbar_bg ?? '#ffffff',
        navbar_fg: dto.navbar_fg ?? '#0f172a',
        footer_bg: dto.footer_bg ?? '#0f172a',
        footer_fg: dto.footer_fg ?? '#ffffff',
        navbar_position: dto.navbar_position ?? 'sticky',
        logo_alignment: dto.logo_alignment ?? 'left',
        footer_style: dto.footer_style ?? 'detailed',
        border_radius: dto.border_radius ?? 'md',
        card_style: dto.card_style ?? 'standard',
        homepage_layout: dto.homepage_layout ?? ['hero', 'categories', 'products', 'promo', 'new_arrivals', 'newsletter'],
      };
      console.log('[CompanyIdentityService.upsertBranding] Branding payload prepared');
      // Check if record exists → upsert
      console.log('[CompanyIdentityService.upsertBranding] Checking existing branding record');
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
        console.log('[CompanyIdentityService.upsertBranding] Updating existing branding');
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
        console.log('[CompanyIdentityService.upsertBranding] Branding update completed');
        return updated;
      }
      console.log('[CompanyIdentityService.upsertBranding] Creating new branding');
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
      console.log('[CompanyIdentityService.upsertBranding] Branding creation completed');
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
      console.log(
        `[CompanyIdentityService.getLegalProfile] Request received for domain: ${domain}`,
      );
      console.log('[CompanyIdentityService.getLegalProfile] Resolving company id');
      const companyId = await this.resolveCompanyId(domain);
      console.log(
        `[CompanyIdentityService.getLegalProfile] Company resolved: ${companyId}`,
      );
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
      console.log('[CompanyIdentityService.getLegalProfile] Legal profile lookup completed');
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
      console.log(
        `[CompanyIdentityService.upsertLegalProfile] Request received for domain: ${domain}`,
      );
      console.log('[CompanyIdentityService.upsertLegalProfile] Resolving company id');
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
      console.log('[CompanyIdentityService.upsertLegalProfile] Checking existing legal profile');
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
        console.log('[CompanyIdentityService.upsertLegalProfile] Updating existing legal profile');
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
        console.log('[CompanyIdentityService.upsertLegalProfile] Legal profile update completed');
        return updated;
      }
      console.log('[CompanyIdentityService.upsertLegalProfile] Creating new legal profile');

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
      console.log('[CompanyIdentityService.upsertLegalProfile] Legal profile creation completed');
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
      console.log(
        `[CompanyIdentityService.getCompliance] Request received for domain: ${domain}`,
      );
      const companyId = await this.resolveCompanyId(domain);
      console.log(
        `[CompanyIdentityService.getCompliance] Company resolved: ${companyId}`,
      );
      console.log('[CompanyIdentityService.getCompliance] Querying compliance records');
      const records = await this.db
        .select()
        .from(company_compliance)
        .where(eq(company_compliance.company_id, companyId))
        .orderBy(company_compliance.country_code);
      console.log(
        `[CompanyIdentityService.getCompliance] Retrieved ${records.length} compliance record(s)`,
      );
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
      console.log(
        `[CompanyIdentityService.getDocumentConfig] Request received for domain: ${domain}`,
      );
      const companyId = await this.resolveCompanyId(domain);
      console.log(
        `[CompanyIdentityService.getDocumentConfig] Company resolved: ${companyId}`,
      );
      console.log('[CompanyIdentityService.getDocumentConfig] Querying document config');
      const [record] = await this.db
        .select()
        .from(company_document_config)
        .where(eq(company_document_config.company_id, companyId))
        .limit(1);
      console.log('[CompanyIdentityService.getDocumentConfig] Document config lookup completed');
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
      console.log(
        `[CompanyIdentityService.upsertDocumentConfig] Request received for domain: ${domain}`,
      );
      console.log('[CompanyIdentityService.upsertDocumentConfig] Resolving company id');
      const companyId = await this.resolveCompanyId(domain);
      console.log(
        '[CompanyIdentityService.upsertDocumentConfig] Preparing document config payload and uploads',
      );
      const uploadedUrls: Partial<{ signatory_signature_url?: string }> = {};
      if (files?.signatory_signature_file?.[0]) {
        console.log('[CompanyIdentityService.upsertDocumentConfig] Uploading signatory signature');
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
      console.log('[CompanyIdentityService.upsertDocumentConfig] Signatory signature upload completed');

      console.log('[CompanyIdentityService.upsertDocumentConfig] Checking existing document config');

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
        console.log('[CompanyIdentityService.upsertDocumentConfig] Updating existing document config');
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
        console.log('[CompanyIdentityService.upsertDocumentConfig] Document config update completed');
        return updated;
      }
      console.log('[CompanyIdentityService.upsertDocumentConfig] Creating new document config');

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
      console.log('[CompanyIdentityService.upsertDocumentConfig] Document config creation completed');
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
