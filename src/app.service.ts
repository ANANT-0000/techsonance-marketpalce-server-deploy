import { Inject, Injectable } from '@nestjs/common';
import { DRIZZLE, type DrizzleService } from './drizzle/drizzle.module';

@Injectable()
export class AppService {
  constructor(@Inject(DRIZZLE) private db: DrizzleService) {}
  getHello(): string {
    console.log('[AppService.getHello] Health check requested');
    return 'Hello World!';
  }
}
