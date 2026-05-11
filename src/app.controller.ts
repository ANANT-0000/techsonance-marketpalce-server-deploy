import { Controller, Get, Res } from '@nestjs/common';
import { AppService } from './app.service';
import express from 'express';
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}
  @Get('/test')
  getHello() {
    return this.appService.getHello();
  }
  @Get('/test-cookie')
  getcookie(@Res({ passthrough: true }) res: express.Response) {
    res.cookie('test_cookie', 'Hello from NestJS!', {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
    });
    return { message: 'Cookie has been set!' };
  }
}
