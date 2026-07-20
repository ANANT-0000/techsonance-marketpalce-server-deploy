import {
  Controller,
  Get,
  Res,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import { AppService } from './app.service.js';
import express from 'express';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { DrizzleHealthIndicator } from './drizzle/drizzle.health.js';
import { Public } from './common/decorators/public.decorator.js';
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}
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
  check(@Query('code') code: string) {
    return this.appService.checkHealth(code);
  }
}
