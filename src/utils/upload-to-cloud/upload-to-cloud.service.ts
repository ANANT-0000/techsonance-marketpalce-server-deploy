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
  ): Promise<{ secure_url: string; type: string }> {
    console.log(
      `[UploadToCloudService.uploadFile] Uploading file: ${file?.originalname ?? 'unknown'}`,
    );
    return await this.cloudinaryService
      .uploadFile(file)
      .then((data) => {
        console.log(
          '[UploadToCloudService.uploadFile] File uploaded successfully',
        );
        return { secure_url: data.secure_url, type: productImageType.MAIN };
      })
      .catch((err) => {
        console.error(
          '[UploadToCloudService.uploadFile] File upload failed:',
          err,
        );
        throw new Error(err);
      });
  }
  async uploadFiles(
    files: Express.Multer.File[],
  ): Promise<{ secure_url: string; type: string }[]> {
    console.log(
      `[UploadToCloudService.uploadFiles] Uploading ${files.length} file(s)`,
    );
    return await this.cloudinaryService
      .uploadFiles(files)
      .then((data) => {
        console.log(
          '[UploadToCloudService.uploadFiles] Files uploaded successfully',
        );
        return data.map((item) => ({
          // @ts-ignore
          secure_url: item.secure_url,
          type: productImageType.GALLERY,
        }));
      })
      .catch((err) => {
        console.error(
          '[UploadToCloudService.uploadFiles] File upload failed:',
          err,
        );
        throw new Error(err);
      });
  }
  async uploadDocument(
    file: Express.Multer.File,
    fileType: string,
  ): Promise<{ secure_url: string; type: string }> {
    console.log(
      `[UploadToCloudService.uploadDocument] Uploading document: ${file?.originalname ?? 'unknown'} as ${fileType}`,
    );
    return await this.cloudinaryService
      .uploadFile(file)
      .then((data) => {
        // @ts-ignore
        console.log(
          '[UploadToCloudService.uploadDocument] Document uploaded successfully',
        );
        return { secure_url: data.secure_url, type: fileType };
      })
      .catch((err) => {
        console.error(
          '[UploadToCloudService.uploadDocument] Document upload failed:',
          err,
        );
        throw new Error(err);
      });
  }
  async uploadEvidenceFiles(
    files: Express.Multer.File[],
  ): Promise<{ secure_url: string }[]> {
    console.log(
      `[UploadToCloudService.uploadEvidenceFiles] Uploading ${files.length} evidence file(s)`,
    );
    return await this.cloudinaryService
      .uploadFiles(files)
      .then((data) => {
        console.log(
          '[UploadToCloudService.uploadEvidenceFiles] Evidence files uploaded successfully',
        );
        return data.map((item) => ({
          secure_url: item.secure_url,
        }));
      })
      .catch((err) => {
        console.error(
          '[UploadToCloudService.uploadEvidenceFiles] Evidence upload failed:',
          err,
        );
        throw new Error(err);
      });
  }
  async uploadInvoice(buffer: Buffer, orderId: string): Promise<string> {
    console.log(
      `[UploadToCloudService.uploadInvoice] Uploading invoice for order_id: ${orderId}`,
    );
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'techsonance_invoices',
          resource_type: 'auto',
          public_id: `invoice_${orderId}`,
        },
        (error, result) => {
          if (result) {
            console.log(
              '[UploadToCloudService.uploadInvoice] Invoice uploaded successfully',
            );
            resolve(result.secure_url);
          } else {
            console.error(
              '[UploadToCloudService.uploadInvoice] Invoice upload failed:',
              error,
            );
            reject(error);
          }
        },
      );
      streamifier.createReadStream(buffer).pipe(uploadStream);
    });
  }
  async uploadTemplate(buffer: Buffer, template_name: string): Promise<string> {
    console.log(
      `[UploadToCloudService.uploadTemplate] Uploading template: ${template_name}`,
    );
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'techsonance_templates',
          resource_type: 'auto',
          public_id: `template_${template_name}`,
        },
        (error, result) => {
          if (result) {
            console.log(
              '[UploadToCloudService.uploadTemplate] Template uploaded successfully',
            );
            resolve(result.secure_url);
          } else {
            console.error(
              '[UploadToCloudService.uploadTemplate] Template upload failed:',
              error,
            );
            reject(error);
          }
        },
      );
      streamifier.createReadStream(buffer).pipe(uploadStream);
    });
  }

  async uploadWarranty(buffer: Buffer, fileName: string): Promise<string> {
    console.log(
      `[UploadToCloudService.uploadWarranty] Uploading warranty file: ${fileName}`,
    );
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'techsonance_warranties',
          resource_type: 'auto',
          public_id: `warranty_${fileName}`,
        },
        (error, result) => {
          if (result) {
            console.log(
              '[UploadToCloudService.uploadWarranty] Warranty uploaded successfully',
            );
            resolve(result.secure_url);
          } else {
            console.error(
              '[UploadToCloudService.uploadWarranty] Warranty upload failed:',
              error,
            );
            reject(error);
          }
        },
      );
      streamifier.createReadStream(buffer).pipe(uploadStream);
    });
  }
  async uploadBanner(
    buffer: Buffer,
    fileName: string,
  ): Promise<string> {
    console.log(
      `[UploadToCloudService.uploadBanner] Uploading banner file: ${fileName}`,
    );
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
            console.log(
              '[UploadToCloudService.uploadBanner] Banner uploaded successfully',
            );
            resolve(result.secure_url);
          } else {
            console.error(
              '[UploadToCloudService.uploadBanner] Banner upload failed:',
              error,
            );
            reject(error);
          }
        },
      );
      streamifier.createReadStream(buffer).pipe(uploadStream);
    });
  }
  async deleteFile(publicId: string): Promise<void> {
    console.log(
      `[UploadToCloudService.deleteFile] Deletion request received for public ID: ${publicId}`,
    );
    return this.cloudinaryService
      .deleteFile(publicId)
      .then(() => {
        console.log(
          '[UploadToCloudService.deleteFile] File deleted successfully',
        );
      })
      .catch((err) => {
        console.error(
          '[UploadToCloudService.deleteFile] File deletion failed:',
          err,
        );
        throw new Error(err);
      });
  }
}
