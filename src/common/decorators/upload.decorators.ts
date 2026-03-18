import { applyDecorators, UseInterceptors } from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

export function UploadImgs(fields: { name: string; maxCount: number }[]) {
  return applyDecorators(
    UseInterceptors(
      FileFieldsInterceptor(fields, {
        storage: memoryStorage(),
        limits: { fieldSize: 10 * 1024 * 1024 }, // 10MB
      }),
    ),
  );
}
