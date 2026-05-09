import { Controller, Get, Res } from '@nestjs/common';
import { AppService } from './app.service';
import express from 'express';
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}
  @Get()
  getHello() {
    return this.appService.getHello();
  }
  @Get('hello')
  getHelloEndpoint() {
    return this.appService.getHello();
  }
}
