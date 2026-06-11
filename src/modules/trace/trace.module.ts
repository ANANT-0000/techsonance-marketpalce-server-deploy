import { Module } from '@nestjs/common';
import { TraceService } from './trace.service';
import { DiscoveryModule } from '@nestjs/core';

@Module({
  imports: [DiscoveryModule],
  providers: [TraceService],
  exports: [TraceService],
})
export class TraceModule {}
