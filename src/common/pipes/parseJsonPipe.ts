import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';

@Injectable()
export class ParseJsonPipe implements PipeTransform {
  transform(value: any) {
    if (!value) {
      throw new BadRequestException('Data field is missing');
    }
    try {
      return typeof value === 'string' ? JSON.parse(value) : value;
    } catch {
      throw new BadRequestException('Invalid JSON in product_data');
    }
  }
}
