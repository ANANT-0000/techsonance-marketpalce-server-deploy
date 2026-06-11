import { Inject, Injectable } from '@nestjs/common';
import { DRIZZLE, type DrizzleService } from './drizzle/drizzle.module';
@Injectable()
export class AppService {
  constructor() {}
  getHello(): string {
    return 'Hello World!';
  }
}
