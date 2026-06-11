import * as pg from 'drizzle-orm/pg-core';
import { EntityStatus } from '../types/types';

export const EntityStatusEnum = pg.pgEnum('entity_status_enum', EntityStatus);
