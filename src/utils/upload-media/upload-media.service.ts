import { Injectable } from '@nestjs/common';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { CloudinaryResponse } from '../cloudinary/cloudinary-response';
import { productImageType } from 'src/drizzle/types/types';

@Injectable()
export class UploadMediaService {
  constructor(private cloudinaryService: CloudinaryService) {}
  async uploadFile(file: Express.Multer.File) {
    return await this.cloudinaryService
      .uploadFile(file)
      .then((data) => {
        return { secure_url: data.secure_url, type: productImageType.MAIN };
      })
      .catch((err) => {
        throw new Error(err);
      });
  }
  async uploadFiles(files: Express.Multer.File[]) {
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
}
