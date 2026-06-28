import { defineConfig } from 'drizzle-kit';
import 'dotenv/config';
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not defined in the environment variables.');
}
const isDist = __dirname.includes('/dist') || __dirname.includes('\\dist');
// If running from dist/drizzle.config.js, schema is likely at dist/src/drizzle/schema
const schemaPath = isDist
  ? './dist/src/drizzle/schema'
  : './src/drizzle/schema';

export default defineConfig({
  schema: schemaPath,
  out: isDist ? './dist/src/drizzle/migrations' : './src/drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
