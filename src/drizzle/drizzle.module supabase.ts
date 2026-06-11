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
                if (!databaseUrl) {
          throw new Error(
            'DATABASE_URL is not defined in the environment variables.',
          );
        }
        const pool = new Pool({
          connectionString: databaseUrl,
          ssl:
            process.env.NODE_ENV === 'production'
              ? { rejectUnauthorized: false }
              : false,
          connectionTimeoutMillis: 5000, // Fails if it can't connect within 5 seconds
          idleTimeoutMillis: 30000, // Closes idle clients after 30 seconds
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
