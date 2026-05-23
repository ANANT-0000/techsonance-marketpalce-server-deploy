import { Inject, Injectable } from '@nestjs/common';
import { DRIZZLE, type DrizzleService } from './drizzle.module';
import {
  HealthIndicatorResult,
  HealthIndicatorService,
} from '@nestjs/terminus';
import { sql } from 'drizzle-orm';

@Injectable()
export class DrizzleHealthIndicator extends HealthIndicatorService {
  constructor(@Inject(DRIZZLE) private databaseService: DrizzleService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const indicator = this.check(key);
    try {
      // Execute a simple query to test the connection (e.g., SELECT 1)
      await this.databaseService.execute(sql`SELECT 1`);
      return indicator.up();
    } catch (error) {
      return indicator.down(
        `Unable to retrieve data from the database \n ${error}`,
      );
    }
  }
}
