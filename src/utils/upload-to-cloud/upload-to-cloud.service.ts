import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
  Inject,
  HttpStatus,
  forwardRef,
  ForbiddenException,
} from '@nestjs/common';
import { ProductImageType } from '../../drizzle/types/types.js';
import { CloudinaryService } from '../cloudinary/cloudinary.service.js';
import { v2 as cloudinary } from 'cloudinary';
import streamifier from 'streamifier';
import { fileTypeFromBuffer } from 'file-type';
import { eq, or, and, like } from 'drizzle-orm';
import { DRIZZLE, type DrizzleService } from '../../drizzle/drizzle.module.js';
import {
  cms_pages,
  marketing_banners,
  product_images,
  products,
  system_logs,
} from '../../drizzle/schema/index.js';
import { CompanyService } from '../../modules/company/company.service.js';
import { extractCloudinaryPublicId } from '../../common/filters/extractCloudinaryPublicId.filter.js';
import { domainExtractor } from '../../common/filters/domainExtractor.filter.js';

const CMS_ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const CMS_IMAGE_MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

@Injectable()
export class UploadToCloudService {
  constructor(
    private cloudinaryService: CloudinaryService,
    @Inject(DRIZZLE) private readonly db: DrizzleService,
    private readonly companyService: CompanyService,
  ) {}

  private async resolveCompanyId(domain: string): Promise<string> {
    const filterDomain = domainExtractor(domain);
    return this.companyService.find(filterDomain);
  }
  async uploadFile(
    file: Express.Multer.File,
  ): Promise<{ secure_url: string; type: string; resource_type: string }> {
    return await this.cloudinaryService
      .uploadFile(file)
      .then((data) => {
        return {
          secure_url: data.secure_url,
          type: ProductImageType.MAIN,
          resource_type: data.resource_type,
        };
      })
      .catch((err) => {
        throw new Error(err);
      });
  }
  async uploadFiles(
    files: Express.Multer.File[],
  ): Promise<{ secure_url: string; type: string; resource_type: string }[]> {
    return await this.cloudinaryService
      .uploadFiles(files)
      .then((data) => {
        return data.map((d) => ({
          secure_url: d.secure_url,
          type: ProductImageType.GALLERY,
          resource_type: d.resource_type,
        }));
      })
      .catch((err) => {
        throw new Error(err);
      });
  }

  async generateSignature() {
    const timestamp = Math.round(new Date().getTime() / 1000);
    const signature = cloudinary.utils.api_sign_request(
      {
        timestamp,
      },
      process.env.CLOUDINARY_API_SECRET!,
    );

    return {
      timestamp,
      signature,
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      apiKey: process.env.CLOUDINARY_API_KEY,
    };
  }
  async uploadDocument(
    file: Express.Multer.File,
    fileType: string,
  ): Promise<{ secure_url: string; type: string; resource_type: string }> {
    return await this.cloudinaryService
      .uploadFile(file)
      .then((data) => {
        // @ts-ignore
        return {
          secure_url: data.secure_url,
          type: fileType,
          resource_type: data.resource_type,
        };
      })
      .catch((err) => {
        throw new Error(err);
      });
  }
  async uploadEvidenceFiles(
    files: Express.Multer.File[],
  ): Promise<{ secure_url: string; resource_type: string }[]> {
    return await this.cloudinaryService
      .uploadFiles(files)
      .then((data) => {
        return data.map((item) => ({
          secure_url: item.secure_url,
          resource_type: item.resource_type,
        }));
      })
      .catch((err) => {
        throw new Error(err);
      });
  }
  async uploadInvoice(buffer: Buffer, orderId: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'techsonance_invoices',
          resource_type: 'auto',
          public_id: `invoice_${orderId}`,
        },
        (error, result) => {
          if (result) {
            resolve(result.secure_url);
          } else {
            reject(error);
          }
        },
      );
      streamifier.createReadStream(buffer).pipe(uploadStream);
    });
  }
  async uploadTemplate(buffer: Buffer, template_name: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'techsonance_templates',
          resource_type: 'auto',
          public_id: `template_${template_name}`,
        },
        (error, result) => {
          if (result) {
            resolve(result.secure_url);
          } else {
            reject(error);
          }
        },
      );
      streamifier.createReadStream(buffer).pipe(uploadStream);
    });
  }
  async uploadWarranty(buffer: Buffer, fileName: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'techsonance_warranties',
          resource_type: 'auto',
          public_id: `warranty_${fileName}`,
        },
        (error, result) => {
          if (result) {
            resolve(result.secure_url);
          } else {
            reject(error);
          }
        },
      );
      streamifier.createReadStream(buffer).pipe(uploadStream);
    });
  }
  async uploadBanner(buffer: Buffer, fileName: string): Promise<string> {
    if (!buffer || !Buffer.isBuffer(buffer)) {
      throw new Error(
        'Invalid file buffer: The file was not provided or is not a buffer.',
      );
    }
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'techsonance_banners',
          resource_type: 'auto',
          public_id: `banner_${fileName}`,
        },
        (error, result) => {
          if (result) {
            resolve(result.secure_url);
          } else {
            reject(error);
          }
        },
      );
      streamifier.createReadStream(buffer).pipe(uploadStream);
    });
  }
  async deleteFile(
    publicId: string,
    resourceType: string | undefined,
  ): Promise<void> {
    return this.cloudinaryService
      .deleteFile(publicId, resourceType)
      .then(() => {})
      .catch((err) => {
        throw new Error(err);
      });
  }

  async uploadImage(file: Express.Multer.File) {
    if (!file || !file.buffer) {
      throw new BadRequestException('Image file and buffer are required');
    }

    // Strict MIME validation using magic bytes
    const fileTypeResult = await fileTypeFromBuffer(file.buffer);
    if (
      !fileTypeResult ||
      !CMS_ALLOWED_IMAGE_MIME_TYPES.includes(fileTypeResult.mime as never)
    ) {
      throw new BadRequestException(
        'Invalid image format detected from file signature. Allowed: jpeg, png, webp',
      );
    }
    if (file.size > CMS_IMAGE_MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException('Image size exceeds the 5MB limit');
    }
    const result = await this.uploadFile(file).catch((error) => {
      throw new InternalServerErrorException('Image upload failed', {
        cause: error,
      });
    });
    if (!result || !result.secure_url) {
      throw new InternalServerErrorException('Image upload failed', {
        cause: 'Missing secure_url in response',
      });
    }
    return {
      message: 'Image uploaded successfully',
      status: HttpStatus.OK,
      secure_url: result.secure_url,
    };
  }

  async deleteCloudinaryImage(domain: string, url: string) {
    const companyId = await this.resolveCompanyId(domain);
    if (!companyId) {
      throw new BadRequestException('Company not found for the given domain');
    }

    const publicId = extractCloudinaryPublicId(url);
    if (!publicId) {
      throw new BadRequestException('Invalid Cloudinary image URL');
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
    const pageConflict = referencingPages.some(
      (p) => p.company_id !== companyId,
    );
    const bannerConflict = referencingBanners.some(
      (b) => b.company_id !== companyId,
    );
    const productConflict = referencingProductImages.some(
      (p) => p.company_id !== companyId,
    );

    if (pageConflict || bannerConflict || productConflict) {
      throw new ForbiddenException(
        'Access denied: Image belongs to another tenant.',
      );
    }

    await this.cloudinaryService
      .deleteFile(publicId, undefined)
      .catch((error) => {
        throw new InternalServerErrorException('Image deletion failed', {
          cause: error,
        });
      });
    return {
      message: 'Image deleted successfully',
      status: HttpStatus.OK,
    };
  }

  async cleanupCloudinaryImage(url: string) {
    const publicId = extractCloudinaryPublicId(url);
    if (!publicId) {
      throw new BadRequestException('Invalid Cloudinary image URL');
    }

    // 1. Check if the image is referenced by any company in cms_pages
    const referencingPages = await this.db
      .select({ id: cms_pages.id })
      .from(cms_pages)
      .where(like(cms_pages.content, `%${url}%`))
      .limit(1);

    // 2. Check if referenced by any company in marketing_banners
    const referencingBanners = await this.db
      .select({ id: marketing_banners.id })
      .from(marketing_banners)
      .where(
        or(
          eq(marketing_banners.image_url, url),
          eq(marketing_banners.image_url_mobile, url),
        ),
      )
      .limit(1);

    // 3. Check if referenced by any company in product_images
    const referencingProductImages = await this.db
      .select({ id: product_images.id })
      .from(product_images)
      .where(eq(product_images.image_url, url))
      .limit(1);

    if (
      referencingPages.length > 0 ||
      referencingBanners.length > 0 ||
      referencingProductImages.length > 0
    ) {
      throw new ForbiddenException(
        'Access denied: Image is actively referenced and cannot be cleaned up.',
      );
    }

    await this.cloudinaryService
      .deleteFile(publicId, undefined)
      .catch((error) => {
        throw new InternalServerErrorException('Image deletion failed', {
          cause: error,
        });
      });

    // Log the cleanup operation to system_logs
    await this.db.insert(system_logs).values({
      level: 'WARN',
      context: 'CloudinaryCleanup',
      msg: `Cleaned up unreferenced image: ${url}`,
    });

    return {
      message: 'Image cleaned up successfully',
      status: HttpStatus.OK,
    };
  }
}
