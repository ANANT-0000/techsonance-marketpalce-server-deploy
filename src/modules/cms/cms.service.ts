import { Injectable, Inject, InternalServerErrorException, HttpStatus, NotFoundException, BadRequestException } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { DRIZZLE, type DrizzleService } from '../../drizzle/drizzle.module';
import { cms_pages } from '../../drizzle/schema';
import { CompanyService } from '../company/company.service';
import { domainExtractor } from '../../common/filters/domainExtractor.filter';
import { CreateCmsDto } from './dto/create-cms.dto';
import { UploadToCloudService } from '../../utils/upload-to-cloud/upload-to-cloud.service';

function isValidHexColor(color: any): boolean {
  if (typeof color !== 'string') return false;
  return /^#([A-Fa-f0-9]{3,4}|[A-Fa-f0-9]{6}|[A-Fa-f0-9]{8})$/.test(color);
}

function validateCmsContent(pageType: string, contentStr: string) {
  let content: any;
  try {
    content = typeof contentStr === 'string' ? JSON.parse(contentStr) : contentStr;
  } catch (err) {
    throw new BadRequestException('CMS content must be valid JSON');
  }

  if (typeof content !== 'object' || content === null) {
    throw new BadRequestException('CMS content must be a JSON object');
  }

  if (pageType === 'theme') {
    const requiredColors = [
      'primary_color',
      'secondary_color',
      'background_color',
      'text_color',
      'navbar_bg',
      'navbar_fg',
      'footer_bg',
      'footer_fg'
    ];
    for (const key of requiredColors) {
      if (content[key] !== undefined && content[key] !== null && !isValidHexColor(content[key])) {
        throw new BadRequestException(`${key} must be a valid hex color code (e.g. #2563eb)`);
      }
    }
  } else if (pageType === 'navbar') {
    if (content.links && !Array.isArray(content.links)) {
      throw new BadRequestException('Navbar links must be an array');
    }
  } else if (pageType === 'footer') {
    if (content.content && !Array.isArray(content.content)) {
      throw new BadRequestException('Footer sections must be an array');
    }
  }
}

@Injectable()
export class CmsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService,
    private readonly companyService: CompanyService,
    private readonly uploadService: UploadToCloudService,
  ) { }

  private async resolveCompanyId(domain: string): Promise<string> {
    console.log(`[CmsService.resolveCompanyId] Resolving company for domain: ${domain}`);
    const filterDomain = domainExtractor(domain);
    return this.companyService.find(filterDomain);
  }

  async getPage(domain: string, pageContentType: string, language = 'en') {
    console.log(`[CmsService.getPage] Request received`, { domain, pageContentType, language });
    const companyId = await this.resolveCompanyId(domain);
    if (!companyId) {
      throw new InternalServerErrorException(`Company not found for domain: ${domain}`);
    }

    // Try finding the page in the requested language
    const [pages] = await this.db
      .select()
      .from(cms_pages)
      .where(
        and(
          eq(cms_pages.company_id, companyId),
          eq(cms_pages.page_content_type, pageContentType),
          eq(cms_pages.language, language),
        ),
      );

    if (pages) {
      return pages;
    }

    // Fallback to English ('en') if language is not 'en'
    if (language !== 'en') {
      console.log(`[CmsService.getPage] Page not found for '${language}'. Falling back to English.`);
      const [englishPages] = await this.db
        .select()
        .from(cms_pages)
        .where(
          and(
            eq(cms_pages.company_id, companyId),
            eq(cms_pages.page_content_type, pageContentType),
            eq(cms_pages.language, 'en'),
          ),
        );
      if (englishPages) {
        return englishPages;
      }
    }

    throw new NotFoundException(`CMS page for ${pageContentType} not found`);
  }

  async upsertPage(domain: string, dto: CreateCmsDto) {
    console.log(`[CmsService.upsertPage] Request received`, { domain, type: dto.page_content_type });

    // Validate CMS content schema first
    validateCmsContent(dto.page_content_type, dto.content);
    const companyId = await this.resolveCompanyId(domain);
    if (!companyId) {
      throw new InternalServerErrorException(`Company not found for domain: ${domain}`);
    }

    const language = dto.language || 'en';

    // Check if page already exists for this language and page_content_type
    const existing = await this.db
      .select()
      .from(cms_pages)
      .where(
        and(
          eq(cms_pages.company_id, companyId),
          eq(cms_pages.page_content_type, dto.page_content_type),
          eq(cms_pages.language, language),
        ),
      );

    try {
      if (existing.length > 0) {
        await this.db
          .update(cms_pages)
          .set({
            title: dto.title,
            content: dto.content,
            seo_meta: dto.seo_meta || {},
            updated_at: new Date(),
          })
          .where(eq(cms_pages.id, existing[0].id));

        return {
          message: 'CMS Page updated successfully',
          status: HttpStatus.OK,
        };
      } else {
        await this.db.insert(cms_pages).values({
          title: dto.title,
          content: dto.content,
          page_content_type: dto.page_content_type,
          seo_meta: dto.seo_meta || {},
          language,
          company_id: companyId,
        });

        return {
          message: 'CMS Page created successfully',
          status: HttpStatus.CREATED,
        };
      }
    } catch (error) {
      console.error(`[CmsService.upsertPage] Failed to upsert page`, error);
      throw new InternalServerErrorException('Failed to save CMS page content', { cause: error });
    }
  }
  async uploadCmsImage(file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No image file provided.');
    }
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException('Invalid file format. Only JPG, PNG, WEBP, and GIF are allowed.');
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new BadRequestException('File size exceeds 5MB limit.');
    }
    const result = await this.uploadService.uploadFile(file).catch((error) => {
      console.error(`[CmsService.uploadCmsImage] Failed to upload image`, error);
      throw new InternalServerErrorException('Failed to upload image', { cause: error });
    });
    if (!result || !result.secure_url) {
      throw new InternalServerErrorException('Failed to upload image', { cause: 'No secure URL returned' });
    }
    return {
      message: 'Image uploaded successfully',
      status: HttpStatus.OK,
      secure_url: result.secure_url,
    };
  }
}
