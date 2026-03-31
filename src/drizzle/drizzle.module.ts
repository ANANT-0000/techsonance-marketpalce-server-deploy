import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NodePgDatabase, drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema/index';

export const DRIZZLE: unique symbol = Symbol('DRIZZLE');
export type DrizzleService = NodePgDatabase<typeof schema>;
@Module({
  providers: [
    {
      provide: DRIZZLE,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const databaseUrl = configService.get<string>('DATABASE_URL');
        console.log('databaseUrl', databaseUrl);
        if (!databaseUrl) {
          throw new Error(
            'DATABASE_URL is not defined in the environment variables.',
          );
        }
        const pool = new Pool({
          connectionString: databaseUrl,
        });
        return drizzle(pool, {
          schema: schema,
        }) as DrizzleService;
      },
    },
  ],
  exports: [DRIZZLE],
})
export class DrizzleModule {}
