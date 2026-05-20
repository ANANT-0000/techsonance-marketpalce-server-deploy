import { Injectable } from '@nestjs/common';

@Injectable()
export class TicketsService {
  constructor() {
    console.log('[TicketsService] Service initialized');
  }
}
