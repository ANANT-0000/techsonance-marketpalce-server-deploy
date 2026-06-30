import {
  Injectable,
  Inject,
  InternalServerErrorException,
  HttpStatus,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { eq, and, or, like, ne, sql } from 'drizzle-orm';
import { DRIZZLE, type DrizzleService } from '../../drizzle/drizzle.module.js';
import { cms_pages, marketing_banners, product_images, products } from '../../drizzle/schema/index.js';
import { CompanyService } from '../company/company.service.js';
import { domainExtractor } from '../../common/filters/domainExtractor.filter.js';
import { CreateCmsDto } from './dto/create-cms.dto.js';
import { UploadToCloudService } from '../../utils/upload-to-cloud/upload-to-cloud.service.js';
import {
  CMS_ALLOWED_IMAGE_MIME_TYPES,
  CMS_IMAGE_MAX_FILE_SIZE_BYTES,
  CMS_MESSAGES,
  CMS_THEME_COLOR_KEYS,
} from './constants/cms.constants.js';
import { CmsLanguageEnum, CmsPageContentTypeEnum } from './constants/cms.enums.js';
import { extractCloudinaryPublicId } from '../../common/filters/extractCloudinaryPublicId.filter.js';

function isValidHexColor(color: unknown): boolean {
  if (typeof color !== 'string') return false;
  return /^#([A-Fa-f0-9]{3,4}|[A-Fa-f0-9]{6}|[A-Fa-f0-9]{8})$/.test(color);
}

function isCmsContentRecord(
  content: unknown,
): content is Record<string, unknown> {
  return typeof content === 'object' && content !== null;
}

const STRUCTURED_CMS_PAGE_TYPES: Record<string, CmsPageContentTypeEnum> = {
  [CmsPageContentTypeEnum.THEME]: CmsPageContentTypeEnum.THEME,
  [CmsPageContentTypeEnum.NAVBAR]: CmsPageContentTypeEnum.NAVBAR,
  [CmsPageContentTypeEnum.FOOTER]: CmsPageContentTypeEnum.FOOTER,
};

function getStructuredPageType(
  pageType: string,
): CmsPageContentTypeEnum | undefined {
  return STRUCTURED_CMS_PAGE_TYPES[pageType];
}

function validateCmsContent(pageType: string, contentStr: string) {
  let parsedContent: unknown;
  try {
    parsedContent =
      typeof contentStr === 'string' ? JSON.parse(contentStr) : contentStr;
  } catch {
    throw new BadRequestException(CMS_MESSAGES.INVALID_JSON_CONTENT);
  }

  if (!isCmsContentRecord(parsedContent)) {
    throw new BadRequestException(CMS_MESSAGES.INVALID_JSON_OBJECT);
  }

  const content = parsedContent;
  const structuredPageType = getStructuredPageType(pageType);

  if (structuredPageType === CmsPageContentTypeEnum.THEME) {
    for (const key of CMS_THEME_COLOR_KEYS) {
      if (
        content[key] !== undefined &&
        content[key] !== null &&
        !isValidHexColor(content[key])
      ) {
        throw new BadRequestException(CMS_MESSAGES.INVALID_HEX_COLOR(key));
      }
    }
  } else if (structuredPageType === CmsPageContentTypeEnum.NAVBAR) {
    if (content.links && !Array.isArray(content.links)) {
      throw new BadRequestException(CMS_MESSAGES.NAVBAR_LINKS_MUST_BE_ARRAY);
    }
  } else if (structuredPageType === CmsPageContentTypeEnum.FOOTER) {
    if (content.content && !Array.isArray(content.content)) {
      throw new BadRequestException(CMS_MESSAGES.FOOTER_SECTIONS_MUST_BE_ARRAY);
    }
  }
}

@Injectable()
export class CmsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService,
    private readonly companyService: CompanyService,
    private readonly uploadService: UploadToCloudService,
  ) {}

  private async resolveCompanyId(domain: string): Promise<string> {
    const filterDomain = domainExtractor(domain);
    return this.companyService.find(filterDomain);
  }

  async getPage(
    domain: string,
    pageContentType: string,
    language = CmsLanguageEnum.ENGLISH,
  ) {
    const companyId = await this.resolveCompanyId(domain);
    if (!companyId) {
      throw new InternalServerErrorException(
        CMS_MESSAGES.COMPANY_NOT_FOUND(domain),
      );
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

    // Fallback to English if the requested language has no page record.
    if (language !== CmsLanguageEnum.ENGLISH) {
      const [englishPages] = await this.db
        .select()
        .from(cms_pages)
        .where(
          and(
            eq(cms_pages.company_id, companyId),
            eq(cms_pages.page_content_type, pageContentType),
            eq(cms_pages.language, CmsLanguageEnum.ENGLISH),
          ),
        );
      if (englishPages) {
        return englishPages;
      }
    }

    throw new NotFoundException(CMS_MESSAGES.PAGE_NOT_FOUND(pageContentType));
  }

  async upsertPage(domain: string, dto: CreateCmsDto) {
    validateCmsContent(dto.page_content_type, dto.content);
    const companyId = await this.resolveCompanyId(domain);
    if (!companyId) {
      throw new InternalServerErrorException(
        CMS_MESSAGES.COMPANY_NOT_FOUND(domain),
      );
    }

    const language = dto.language || CmsLanguageEnum.ENGLISH;

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
          message: CMS_MESSAGES.PAGE_UPDATED_SUCCESS,
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
          message: CMS_MESSAGES.PAGE_CREATED_SUCCESS,
          status: HttpStatus.CREATED,
        };
      }
    } catch (error) {
      throw new InternalServerErrorException(CMS_MESSAGES.PAGE_SAVE_FAILED, {
        cause: error,
      });
    }
  }

  async uploadCmsImage(file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException(CMS_MESSAGES.IMAGE_REQUIRED);
    }
    if (!CMS_ALLOWED_IMAGE_MIME_TYPES.includes(file.mimetype as never)) {
      throw new BadRequestException(CMS_MESSAGES.IMAGE_FORMAT_INVALID);
    }
    if (file.size > CMS_IMAGE_MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException(CMS_MESSAGES.IMAGE_SIZE_EXCEEDED);
    }
    const result = await this.uploadService.uploadFile(file).catch((error) => {
      throw new InternalServerErrorException(CMS_MESSAGES.IMAGE_UPLOAD_FAILED, {
        cause: error,
      });
    });
    if (!result || !result.secure_url) {
      throw new InternalServerErrorException(CMS_MESSAGES.IMAGE_UPLOAD_FAILED, {
        cause: CMS_MESSAGES.IMAGE_UPLOAD_MISSING_URL,
      });
    }
    return {
      message: CMS_MESSAGES.IMAGE_UPLOAD_SUCCESS,
      status: HttpStatus.OK,
      secure_url: result.secure_url,
    };
  }
  async deleteCloudinaryImage(domain: string, url: string) {
    const companyId = await this.resolveCompanyId(domain);
    if (!companyId) {
      throw new BadRequestException(CMS_MESSAGES.COMPANY_NOT_FOUND(domain));
    }

    const publicId = extractCloudinaryPublicId(url);
    if (!publicId) {
      throw new BadRequestException(CMS_MESSAGES.INVALID_IMAGE_URL);
    }

    // 1. Check if the image is referenced by any company in cms_pages
    const referencingPages = await this.db
      .select({ company_id: cms_pages.company_id })
      .from(cms_pages)
      .where(like(cms_pages.content, `%${url}%`));

    // 2. Check if referenced by any company in marketing_banners
    const referencingBanners = await this.db
      .select({ company_id: marketing_banners.company_id })
      .from(marketing_banners)
      .where(
        or(
          eq(marketing_banners.image_url, url),
          eq(marketing_banners.image_url_mobile, url),
        ),
      );

    // 3. Check if referenced by any company in product_images
    const referencingProductImages = await this.db
      .select({ company_id: products.company_id })
      .from(product_images)
      .innerJoin(products, eq(product_images.product_id, products.id))
      .where(eq(product_images.image_url, url));

    // 4. Validate ownership: reject if there's any reference that does NOT belong to this company
    const pageConflict = referencingPages.some((p) => p.company_id !== companyId);
    const bannerConflict = referencingBanners.some((b) => b.company_id !== companyId);
    const productConflict = referencingProductImages.some((p) => p.company_id !== companyId);

    if (pageConflict || bannerConflict || productConflict) {
      throw new UnauthorizedException('Access denied: Image belongs to another tenant.');
    }

    await this.uploadService.deleteFile(publicId, undefined).catch((error) => {
      throw new InternalServerErrorException(CMS_MESSAGES.IMAGE_DELETE_FAILED, {
        cause: error,
      });
    });
    return {
      message: CMS_MESSAGES.IMAGE_DELETE_SUCCESS,
      status: HttpStatus.OK,
    };
  }
}
