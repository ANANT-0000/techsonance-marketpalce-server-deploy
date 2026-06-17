import { Injectable } from '@nestjs/common';
import { productImageType } from '../../drizzle/types/types';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { v2 as cloudinary } from 'cloudinary';
import streamifier from 'streamifier';
@Injectable()
export class UploadToCloudService {
  constructor(private cloudinaryService: CloudinaryService) {}
  async uploadFile(
    file: Express.Multer.File,
  ): Promise<{ secure_url: string; type: string; resource_type: string }> {
    return await this.cloudinaryService
      .uploadFile(file)
      .then((data) => {
        return {
          secure_url: data.secure_url,
          type: productImageType.MAIN,
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
        return data.map((item) => ({
          // @ts-ignore
          secure_url: item.secure_url,
          type: productImageType.GALLERY,
          resource_type: item.resource_type,
        }));
      })
      .catch((err) => {
        throw new Error(err);
      });
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
}
