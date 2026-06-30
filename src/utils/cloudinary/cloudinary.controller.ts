import { Controller } from '@nestjs/common';
import { CloudinaryService } from './cloudinary.service.js';

@Controller('cloudinary')
export class CloudinaryController {
  constructor(private readonly cloudinaryService: CloudinaryService) { }
}
