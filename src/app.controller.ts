import { Controller, Get, Res } from '@nestjs/common';
import { AppService } from './app.service';
import express from 'express';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { DrizzleHealthIndicator } from './drizzle/drizzle.health';
import { Public } from './common/decorators/public.decorator';
@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly health: HealthCheckService,
    private readonly drizzleHealthIndicator: DrizzleHealthIndicator,
  ) {}
  @Public()
  @Get('/test')
  getHello() {
    return this.appService.getHello();
  }
  @Public()
  @Get('/test-cookie')
  getCookie(@Res({ passthrough: true }) res: express.Response) {
    res.cookie('test_cookie', 'Hello from NestJS!', {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
    });
    return { message: 'Cookie has been set!' };
  }
  @Public()
  @Get('health')
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.drizzleHealthIndicator.isHealthy('drizzle'),
    ]);
  }
}
