import * as pg from 'drizzle-orm/pg-core';
import {
  BillingAccountUsed,
  EntityStatus,
  LogisticsMode,
} from '../types/types';

export const EntityStatusEnum = pg.pgEnum('entity_status_enum', EntityStatus);
export const LogisticsModeEnum = pg.pgEnum('logistics_mode_enum', [
  LogisticsMode.PLATFORM_PROXY,
  LogisticsMode.STANDALONE,
]);
export const BillingAccountUsedEnum = pg.pgEnum('billing_account_used_enum', [
  BillingAccountUsed.PLATFORM_MASTER,
  BillingAccountUsed.VENDOR_OWN,
]);
