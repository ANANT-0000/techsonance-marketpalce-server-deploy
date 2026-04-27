import { Injectable } from '@nestjs/common';
import { productImageType } from 'src/drizzle/types/types';
import { CloudinaryService } from '../cloudinary/cloudinary.service';

@Injectable()
export class UploadToCloudService {
  constructor(private cloudinaryService: CloudinaryService) { }
  async uploadFile(
    file: Express.Multer.File,
  ): Promise<{ secure_url: string; type: string }> {
    return await this.cloudinaryService
      .uploadFile(file)
      .then((data) => {
        return { secure_url: data.secure_url, type: productImageType.MAIN };
      })
      .catch((err) => {
        throw new Error(err);
      });
  }
  async uploadFiles(
    files: Express.Multer.File[],
  ): Promise<{ secure_url: string; type: string }[]> {
    return await this.cloudinaryService
      .uploadFiles(files)
      .then((data) => {
        return data.map((item) => ({
          secure_url: item.secure_url,
          type: productImageType.GALLERY,
        }));
      })
      .catch((err) => {
        throw new Error(err);
      });
  }
  async uploadDocument(
    file: Express.Multer.File,
    fileType: string,
  ): Promise<{ secure_url: string; type: string }> {
    return await this.cloudinaryService
      .uploadFile(file)
      .then((data) => {
        return { secure_url: data.secure_url, type: fileType };
      })
      .catch((err) => {
        throw new Error(err);
      });
  }
  async uploadEvidenceFiles(
    files: Express.Multer.File[],
  ): Promise<{ secure_url: string; }[]> {
    return await this.cloudinaryService
      .uploadFiles(files)
      .then((data) => {
        return data.map((item) => ({
          secure_url: item.secure_url,
        }));
      })
      .catch((err) => {
        throw new Error(err);
      });
  }
}
