import { Module } from '@nestjs/common';
import { TraceService } from './trace.service.js';
import { DiscoveryModule } from '@nestjs/core';

@Module({
  imports: [DiscoveryModule],
  providers: [TraceService],
  exports: [TraceService],
})
export class TraceModule {}
