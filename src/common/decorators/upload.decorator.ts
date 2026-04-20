import { applyDecorators, UseInterceptors } from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

export function UploadToCloud(fields: { name: string; maxCount: number }[]) {
  return applyDecorators(
    UseInterceptors(
      FileFieldsInterceptor(fields, {
        storage: memoryStorage(),
        limits: { fieldSize: 60 * 1024 * 1024 }, // 60MB
      }),
    ),
  );
}
