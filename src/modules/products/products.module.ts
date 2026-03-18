import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { DrizzleModule } from 'src/drizzle/drizzle.module';
import { UploadMediaModule } from 'src/utils/upload-media/upload-media.module';

@Module({
  imports: [DrizzleModule, UploadMediaModule],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
