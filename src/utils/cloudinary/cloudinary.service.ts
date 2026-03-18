import { Injectable } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryResponse } from './cloudinary-response';
import toStream from 'buffer-to-stream';
import { Readable } from 'stream';
import 'multer';
@Injectable()
export class CloudinaryService {
  uploadFile(file: Express.Multer.File): Promise<CloudinaryResponse> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { resource_type: 'auto' },
        (error, result) => {
          if (error) {
            reject(error as Error);
          } else {
            resolve(result as CloudinaryResponse);
          }
        },
      );
      if (!file || !file.buffer) {
        console.log(file);
        reject(new Error('No file provided'));
        return;
      }
      const stream = toStream(file.buffer) as Readable;
      stream.pipe(uploadStream);
    });
  }
  async uploadFiles(
    files: Express.Multer.File[],
  ): Promise<CloudinaryResponse[]> {
    console.log(files);

    const uploadPromises = files.map((file) => this.uploadFile(file));
    return Promise.all(uploadPromises);
  }
}
