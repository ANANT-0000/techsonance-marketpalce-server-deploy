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

      if (!wrapper.metatype || typeof wrapper.metatype !== 'function') {
        return;
      }

      if (
        instance.constructor === Object ||
        instance.constructor === Array ||
        instance instanceof Map ||
        instance instanceof Set ||
        instance instanceof Date
      ) {
        return;
      }

      const prototype = Object.getPrototypeOf(instance);
      if (!prototype) {
        return;
      }

      const methods = Object.getOwnPropertyNames(prototype).filter((method) => {
        if (method === 'constructor') return false;
        const descriptor = Object.getOwnPropertyDescriptor(prototype, method);
        return descriptor?.value instanceof Function;
      });

      methods.forEach((methodName) => {
        const originalMethod = instance[methodName];

        instance[methodName] = (...args: any[]) => {
          const start = Date.now();

          this.logger.log(
            `\n\n[${instance.constructor.name}.${methodName}] START`,
          );

          try {
            const result = originalMethod.apply(instance, args);

            if (result instanceof Promise) {
              return result
                .then((val) => {
                  this.logger.log(
                    `[${instance.constructor.name}.${methodName}] SUCCESS (${Date.now() - start}ms)`,
                  );
                  return val;
                })
                .catch((error) => {
                  this.logger.error(
                    `[${instance.constructor.name}.${methodName}] ERROR (${Date.now() - start}ms)`,
                    error?.stack || String(error),
                  );
                  const cause = error?.cause || error?.options?.cause;
                  if (cause) {
                    this.logger.error(
                      `[${instance.constructor.name}.${methodName}] CAUSE:`,
                      cause?.stack || String(cause),
                    );
                  }
                  throw error;
                });
            }

            this.logger.log(
              `[${instance.constructor.name}.${methodName}] SUCCESS (${Date.now() - start}ms)`,
            );
            return result;
          } catch (error: any) {
            this.logger.error(
              `[${instance.constructor.name}.${methodName}] ERROR (${Date.now() - start}ms)`,
              error?.stack || String(error),
            );
            const cause = error?.cause || error?.options?.cause;
            if (cause) {
              this.logger.error(
                `[${instance.constructor.name}.${methodName}] CAUSE:`,
                cause?.stack || String(cause),
              );
            }
            throw error;
          }
        };
      });
    });
  }
}
