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
import {
  COMPANY_IDENTITY_BRANDING_DEFAULTS,
  COMPANY_IDENTITY_MESSAGES,
} from './constants/company-identity.constants';
import {
  CompanyIdentityErrorKeyEnum,
  CompanyIdentityTemplateTokenEnum,
  CompanyIdentityUploadFolderEnum,
} from './constants/company-identity.enums';

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
      throw new HttpException(
        COMPANY_IDENTITY_MESSAGES.COMPANY_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
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
          throw new InternalServerErrorException(
            COMPANY_IDENTITY_MESSAGES.FETCH_FAILED(
              CompanyIdentityErrorKeyEnum.BRANDING,
            ),
            {
              cause: error,
            },
          );
        });
      return record ?? null;
    } catch (error) {
      if (
        error instanceof HttpException ||
        error instanceof InternalServerErrorException
      )
        throw error;
      throw new InternalServerErrorException(
        COMPANY_IDENTITY_MESSAGES.FETCH_FAILED(
          CompanyIdentityErrorKeyEnum.BRANDING,
        ),
        {
          cause: error,
        },
      );
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
      const uploadedUrls: Partial<UpsertBrandingDto> = {};

      if (files?.logo?.[0]) {
        const result = await this.uploadService.uploadFile(files.logo[0]);
        uploadedUrls.logo_url = result.secure_url;
      }
      if (files?.logo_dark?.[0]) {
        const result = await this.uploadService.uploadFile(files.logo_dark[0]);
        uploadedUrls.logo_dark_url = result.secure_url;
      }
      if (files?.watermark?.[0]) {
        const result = await this.uploadService.uploadFile(files.watermark[0]);
        uploadedUrls.watermark_url = result.secure_url;
      }
      if (files?.favicon?.[0]) {
        const result = await this.uploadService.uploadFile(files.favicon[0]);
        uploadedUrls.favicon_url = result.secure_url;
      }
      const payload = {
        company_id: companyId,
        primary_color:
          dto.primary_color ?? COMPANY_IDENTITY_BRANDING_DEFAULTS.primary_color,
        secondary_color:
          dto.secondary_color ??
          COMPANY_IDENTITY_BRANDING_DEFAULTS.secondary_color,
        accent_color:
          dto.accent_color ?? COMPANY_IDENTITY_BRANDING_DEFAULTS.accent_color,
        font_family:
          dto.font_family ?? COMPANY_IDENTITY_BRANDING_DEFAULTS.font_family,
        logo_url:
          uploadedUrls.logo_url ??
          dto.logo_url ??
          COMPANY_IDENTITY_BRANDING_DEFAULTS.logo_url,
        logo_dark_url:
          uploadedUrls.logo_dark_url ??
          dto.logo_dark_url ??
          COMPANY_IDENTITY_BRANDING_DEFAULTS.logo_dark_url,
        watermark_url:
          uploadedUrls.watermark_url ??
          dto.watermark_url ??
          COMPANY_IDENTITY_BRANDING_DEFAULTS.watermark_url,
        favicon_url:
          uploadedUrls.favicon_url ??
          dto.favicon_url ??
          COMPANY_IDENTITY_BRANDING_DEFAULTS.favicon_url,
        background_color:
          dto.background_color ??
          COMPANY_IDENTITY_BRANDING_DEFAULTS.background_color,
        text_color:
          dto.text_color ?? COMPANY_IDENTITY_BRANDING_DEFAULTS.text_color,
        navbar_bg:
          dto.navbar_bg ?? COMPANY_IDENTITY_BRANDING_DEFAULTS.navbar_bg,
        navbar_fg:
          dto.navbar_fg ?? COMPANY_IDENTITY_BRANDING_DEFAULTS.navbar_fg,
        footer_bg:
          dto.footer_bg ?? COMPANY_IDENTITY_BRANDING_DEFAULTS.footer_bg,
        footer_fg:
          dto.footer_fg ?? COMPANY_IDENTITY_BRANDING_DEFAULTS.footer_fg,
        navbar_position:
          dto.navbar_position ??
          COMPANY_IDENTITY_BRANDING_DEFAULTS.navbar_position,
        logo_alignment:
          dto.logo_alignment ??
          COMPANY_IDENTITY_BRANDING_DEFAULTS.logo_alignment,
        footer_style:
          dto.footer_style ?? COMPANY_IDENTITY_BRANDING_DEFAULTS.footer_style,
        border_radius:
          dto.border_radius ?? COMPANY_IDENTITY_BRANDING_DEFAULTS.border_radius,
        card_style:
          dto.card_style ?? COMPANY_IDENTITY_BRANDING_DEFAULTS.card_style,
        homepage_layout:
          dto.homepage_layout ??
          COMPANY_IDENTITY_BRANDING_DEFAULTS.homepage_layout,
      };
      const [existing] = await this.db
        .select({ id: company_branding.id })
        .from(company_branding)
        .where(eq(company_branding.company_id, companyId))
        .limit(1)
        .catch((error) => {
          throw new InternalServerErrorException(
            COMPANY_IDENTITY_MESSAGES.UPSERT_FAILED(
              CompanyIdentityErrorKeyEnum.BRANDING,
            ),
            {
              cause: error,
            },
          );
        });

      if (existing) {
        const [updated] = await this.db
          .update(company_branding)
          .set(payload)
          .where(eq(company_branding.company_id, companyId))
          .returning()
          .catch((error) => {
            throw new InternalServerErrorException(
              COMPANY_IDENTITY_MESSAGES.UPSERT_FAILED(
                CompanyIdentityErrorKeyEnum.BRANDING,
              ),
              {
                cause: error,
              },
            );
          });
        return updated;
      }
      const [created] = await this.db
        .insert(company_branding)
        .values(payload)
        .returning()
        .catch((error) => {
          throw new InternalServerErrorException(
            COMPANY_IDENTITY_MESSAGES.UPSERT_FAILED(
              CompanyIdentityErrorKeyEnum.BRANDING,
            ),
            {
              cause: error,
            },
          );
        });
      return created;
    } catch (error) {
      if (
        error instanceof HttpException ||
        error instanceof InternalServerErrorException
      )
        throw error;
      throw new InternalServerErrorException(
        COMPANY_IDENTITY_MESSAGES.UPSERT_FAILED(
          CompanyIdentityErrorKeyEnum.BRANDING,
        ),
        {
          cause: error,
        },
      );
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
          throw new InternalServerErrorException(
            COMPANY_IDENTITY_MESSAGES.FETCH_FAILED(
              CompanyIdentityErrorKeyEnum.LEGAL_PROFILE,
            ),
            {
              cause: error,
            },
          );
        });
      return record ?? null;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException(
        COMPANY_IDENTITY_MESSAGES.FETCH_FAILED(
          CompanyIdentityErrorKeyEnum.LEGAL_PROFILE,
        ),
        {
          cause: error,
        },
      );
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
      const [existing] = await this.db
        .select({ id: company_legal_profile.id })
        .from(company_legal_profile)
        .where(eq(company_legal_profile.company_id, companyId))
        .limit(1)
        .catch((error) => {
          throw new InternalServerErrorException(
            COMPANY_IDENTITY_MESSAGES.UPSERT_FAILED(
              CompanyIdentityErrorKeyEnum.LEGAL_PROFILE,
            ),
            {
              cause: error,
            },
          );
        });

      if (existing) {
        const [updated] = await this.db
          .update(company_legal_profile)
          .set(payload)
          .where(eq(company_legal_profile.company_id, companyId))
          .returning()
          .catch((error) => {
            throw new InternalServerErrorException(
              COMPANY_IDENTITY_MESSAGES.UPSERT_FAILED(
                CompanyIdentityErrorKeyEnum.LEGAL_PROFILE,
              ),
              {
                cause: error,
              },
            );
          });
        return updated;
      }
      const [created] = await this.db
        .insert(company_legal_profile)
        .values(payload)
        .returning()
        .catch((error) => {
          throw new InternalServerErrorException(
            COMPANY_IDENTITY_MESSAGES.UPSERT_FAILED(
              CompanyIdentityErrorKeyEnum.LEGAL_PROFILE,
            ),
            {
              cause: error,
            },
          );
        });
      return created;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException(
        COMPANY_IDENTITY_MESSAGES.UPSERT_FAILED(
          CompanyIdentityErrorKeyEnum.LEGAL_PROFILE,
        ),
        {
          cause: error,
        },
      );
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
        COMPANY_IDENTITY_MESSAGES.FETCH_FAILED(
          CompanyIdentityErrorKeyEnum.COMPLIANCE_RECORDS,
        ),
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
      return record ?? null;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException(
        COMPANY_IDENTITY_MESSAGES.FETCH_FAILED(
          CompanyIdentityErrorKeyEnum.DOCUMENT_CONFIG,
        ),
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
      const companyId = await this.resolveCompanyId(domain);
      const uploadedUrls: Partial<{ signatory_signature_url?: string }> = {};
      if (files?.signatory_signature_file?.[0]) {
        const result = await this.uploadService
          .uploadDocument(
            files.signatory_signature_file[0],
            CompanyIdentityUploadFolderEnum.SIGNATORY_SIGNATURE,
          )
          .catch((error) => {
            throw new InternalServerErrorException(
              COMPANY_IDENTITY_MESSAGES.UPLOAD_FAILED(
                CompanyIdentityErrorKeyEnum.SIGNATORY_SIGNATURE,
              ),
              { cause: error },
            );
          });
        uploadedUrls.signatory_signature_url = result.secure_url;
      }
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
          throw new InternalServerErrorException(
            COMPANY_IDENTITY_MESSAGES.UPSERT_FAILED(
              CompanyIdentityErrorKeyEnum.DOCUMENT_CONFIG,
            ),
            { cause: error },
          );
        });
      const payload = {
        company_id: companyId,
        invoice_number_prefix:
          dto.invoice_number_prefix ??
          CompanyIdentityTemplateTokenEnum.INVOICE_NUMBER_PREFIX,
        invoice_number_format:
          dto.invoice_number_format ??
          CompanyIdentityTemplateTokenEnum.INVOICE_NUMBER_FORMAT,
        invoice_sequence_reset:
          dto.invoice_sequence_reset ??
          CompanyIdentityTemplateTokenEnum.INVOICE_SEQUENCE_RESET,
        default_currency:
          dto.default_currency ??
          CompanyIdentityTemplateTokenEnum.DEFAULT_CURRENCY,
        default_timezone:
          dto.default_timezone ??
          CompanyIdentityTemplateTokenEnum.DEFAULT_TIMEZONE,
        date_format:
          dto.date_format ?? CompanyIdentityTemplateTokenEnum.DATE_FORMAT,
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
            throw new InternalServerErrorException(
              COMPANY_IDENTITY_MESSAGES.UPSERT_FAILED(
                CompanyIdentityErrorKeyEnum.DOCUMENT_CONFIG,
              ),
              {
                cause: error,
              },
            );
          });
        return updated;
      }
      const [created] = await this.db
        .insert(company_document_config)
        .values(payload)
        .returning()
        .catch((error) => {
          throw new InternalServerErrorException(
            COMPANY_IDENTITY_MESSAGES.UPSERT_FAILED(
              CompanyIdentityErrorKeyEnum.DOCUMENT_CONFIG,
            ),
            {
              cause: error,
            },
          );
        });
      return created;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException(
        COMPANY_IDENTITY_MESSAGES.UPSERT_FAILED(
          CompanyIdentityErrorKeyEnum.DOCUMENT_CONFIG,
        ),
        { cause: error },
      );
    }
  }
}
