import { Injectable } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryResponse } from './cloudinary-response';
import toStream from 'buffer-to-stream';
import 'multer';
@Injectable()
export class CloudinaryService {
  uploadFile(file: Express.Multer.File): Promise<CloudinaryResponse> {
    return new Promise((resolve, reject) => {
      if (!file || !file.buffer) {
        reject(new Error('No file provided'));
        return;
      }
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          resource_type: 'auto',
          use_filename: true,
          unique_filename: true,
        },
        (error, result) => {
          if (error) {
            reject(error as Error);
          } else {
            resolve(result as CloudinaryResponse);
          }
        },
      );
      if (!file || !file.buffer) {
        reject(new Error('No file provided'));
        return;
      }
      const stream = toStream(file.buffer);
      stream.pipe(uploadStream);
    });
  }
  async uploadFiles(
    files: Express.Multer.File[],
  ): Promise<CloudinaryResponse[]> {
    const uploadPromises = files.map((file) => this.uploadFile(file));
    const results = await Promise.all(uploadPromises);
    return results;
  }
  async deleteFile(
    publicId: string,
    resourceType: string | undefined,
  ): Promise<void> {
    await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType ?? 'image',
    });
  }
}
