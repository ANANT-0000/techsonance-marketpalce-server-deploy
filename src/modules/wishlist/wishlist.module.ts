import { Module } from '@nestjs/common';
import { WishlistService } from './wishlist.service';
import { WishlistController } from './wishlist.controller';
import { DrizzleModule } from 'src/drizzle/drizzle.module';

@Module({
  imports  :[DrizzleModule],
  controllers: [WishlistController],
  providers: [WishlistService],
})
export class WishlistModule {}
