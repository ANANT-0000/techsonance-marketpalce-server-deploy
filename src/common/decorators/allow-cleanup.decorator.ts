import { SetMetadata } from '@nestjs/common';

export const ALLOW_CLEANUP_KEY = 'allow_cleanup';
export const AllowCleanup = () => SetMetadata(ALLOW_CLEANUP_KEY, true);
