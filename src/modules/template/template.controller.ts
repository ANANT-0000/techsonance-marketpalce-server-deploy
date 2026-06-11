import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UploadedFiles,
} from '@nestjs/common';
import { TemplateService } from './template.service';
import { CreateTemplateDto } from './dto/template.dto';
import { UploadToCloud } from '../../common/decorators/upload.decorator';
import { ParseJsonPipe } from '../../common/pipes/parseJsonPipe';

@Controller({ version: '1', path: 'template' })
export class TemplateController {
  constructor(private readonly templateService: TemplateService) {}

  @Post()
  @UploadToCloud([{ name: 'template_file', maxCount: 1 }])
  create(
    @Body('templateData', ParseJsonPipe) createTemplateDto: any,
    @UploadedFiles() files: { template_file: Express.Multer.File[] },
  ) {
    return this.templateService.create(createTemplateDto, files);
  }

  @Get()
  findAll() {
    return this.templateService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.templateService.findOne(id);
  }

  @Patch(':id')
  @UploadToCloud([{ name: 'template_file', maxCount: 1 }])
  update(
    @Param('id') id: string,
    @Body('templateData', ParseJsonPipe) updateTemplateDto: any,
    @UploadedFiles() files?: { template_file: Express.Multer.File[] },
  ) {
    return this.templateService.update(id, updateTemplateDto, files);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.templateService.remove(id);
  }
}
