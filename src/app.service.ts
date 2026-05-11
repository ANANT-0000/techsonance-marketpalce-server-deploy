import { Inject, Injectable } from '@nestjs/common';
import { DRIZZLE } from './drizzle/drizzle.module';
import { type DrizzleDB } from './drizzle/types/drizzle';

@Injectable()
export class AppService {
  constructor(@Inject(DRIZZLE) private db: DrizzleDB) {}
  getHello(): string {
    return 'Hello World!';
  }
}
