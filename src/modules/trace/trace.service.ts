import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DiscoveryService } from '@nestjs/core';

@Injectable()
export class TraceService implements OnModuleInit {
  private readonly logger = new Logger('Trace');

  constructor(
    private readonly discoveryService: DiscoveryService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit() {
    const isProd = this.configService.get<string>('NODE_ENV') === 'production';

    if (isProd) {
      return;
    }
    const providers = this.discoveryService.getProviders();

    providers.forEach((wrapper) => {
      const instance = wrapper.instance;

      if (!instance || typeof instance !== 'object') {
        return;
      }

      const prototype = Object.getPrototypeOf(instance);

      const methods = Object.getOwnPropertyNames(prototype).filter((method) => {
        if (method === 'constructor') return false;
        const descriptor = Object.getOwnPropertyDescriptor(prototype, method);
        return descriptor?.value instanceof Function;
      });

      methods.forEach((methodName) => {
        const originalMethod = instance[methodName];

        instance[methodName] = async (...args: any[]) => {
          const start = Date.now();

          this.logger.log(`[${instance.constructor.name}.${methodName}] START`);

          try {
            const result = await originalMethod.apply(instance, args);

            this.logger.log(
              `[${instance.constructor.name}.${methodName}] SUCCESS (${Date.now() - start}ms)`,
            );

            return result;
          } catch (error) {
            this.logger.error(
              `[${instance.constructor.name}.${methodName}] ERROR (${Date.now() - start}ms)`,
              error.stack,
            );

            throw error;
          }
        };
      });
    });
  }
}
