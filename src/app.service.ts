import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { DRIZZLE, type DrizzleService } from './drizzle/drizzle.module.js';
import { HealthCheckService } from '@nestjs/terminus';
import { DrizzleHealthIndicator } from './drizzle/drizzle.health.js';

@Injectable()
export class AppService {
  constructor(
    @Inject(DRIZZLE) private db: DrizzleService,
    private readonly health: HealthCheckService,
    private readonly drizzleHealthIndicator: DrizzleHealthIndicator,
  ) {}

  getHello(): string {
    return 'Hello World!';
  }

  async checkHealth(code: string) {
    if (!code || code !== process.env.HEALTH_CHECK_CODE) {
      throw new UnauthorizedException('Invalid health check code');
    }
    return this.health.check([
      () => this.drizzleHealthIndicator.isHealthy('drizzle'),
    ]);
  }
}
