import { Injectable } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryResponse } from './cloudinary-response';
import toStream from 'buffer-to-stream';

import 'multer';
@Injectable()
export class CloudinaryService {
  uploadFile(file: Express.Multer.File): Promise<CloudinaryResponse> {
    console.log(
      `[CloudinaryService.uploadFile] Upload request received for file: ${file?.originalname ?? 'unknown'}`,
    );
    return new Promise((resolve, reject) => {
      if (!file || !file.buffer) {
        console.error('[CloudinaryService.uploadFile] No file provided');
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
            console.error(
              '[CloudinaryService.uploadFile] Upload failed:',
              error,
            );
            reject(error as Error);
          } else {
            console.log(
              '[CloudinaryService.uploadFile] Upload completed successfully',
            );
            resolve(result as CloudinaryResponse);
          }
        },
      );
      if (!file || !file.buffer) {
        console.error(
          '[CloudinaryService.uploadFile] No file buffer available',
          file,
        );
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
    console.log(
      `[CloudinaryService.uploadFiles] Uploading ${files.length} file(s)`,
    );

    const uploadPromises = files.map((file) => this.uploadFile(file));
    const results = await Promise.all(uploadPromises);
    console.log(
      '[CloudinaryService.uploadFiles] Batch upload completed successfully',
    );
    return results;
  }
  async deleteFile(publicId: string): Promise<void> {
    console.log(
      `[CloudinaryService.deleteFile] Deletion request received for public ID: ${publicId}`,
    );
    return new Promise((resolve, reject) => {
      cloudinary.uploader
        .destroy(publicId, { resource_type: 'auto' })
        .catch((err) => {
          console.error(
            '[CloudinaryService.deleteFile] Deletion encountered an error:',
            err,
          );
          reject(err as Error);
        });
    });
  }
}
