import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { PgSchema } from "drizzle-orm/pg-core";

export type DrizzleDB = NodePgDatabase<typeof PgSchema>;
