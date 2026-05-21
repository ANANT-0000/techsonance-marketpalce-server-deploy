import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { CreateTemplateDto, UpdateTemplateDto } from './dto/template.dto';
import { DRIZZLE, type DrizzleService } from '../../drizzle/drizzle.module';
import { templates } from '../../drizzle/schema/utils.schema';
import { eq } from 'drizzle-orm';
import { UploadToCloudService } from '../../utils/upload-to-cloud/upload-to-cloud.service';

@Injectable()
export class TemplateService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService,
    private readonly UploadToCloud: UploadToCloudService,
  ) {}
  async create(
    dto: CreateTemplateDto,
    file: { template_file: Express.Multer.File[] },
  ) {
    try {
      console.log('[TemplateService.create] Request received', { templateName: dto.template_name });
      // const [exist] = await this.db
      //   .select()
      //   .from(templates)
      //   .where(eq(templates.template_name, dto.template_name))
      //   .catch((error) => {
      //     console.error('Error checking existing template:', error);
      //     throw new InternalServerErrorException(
      //       'Database error while checking existing template',
      //       {
      //         cause: error,
      //       },
      //     );
      //   });
      // console.log('Existing template:', exist);
      // if (exist) {
      //   throw new HttpException(
      //     'Template with this name already exists',
      //     HttpStatus.BAD_REQUEST,
      //   );
      // }
      if (!file) {
        console.log('[TemplateService.create] Template file is missing');
        throw new HttpException('File is required', HttpStatus.BAD_REQUEST);
      }
      console.log('[TemplateService.create] Uploading template file to cloud storage');
      const uploadResult = await this.UploadToCloud.uploadTemplate(
        file.template_file[0].buffer,
        dto.template_name,
      );
      console.log('[TemplateService.create] Template file uploaded successfully');
      if (!dto.template_label) {
        console.log('[TemplateService.create] Template label is required');
        throw new HttpException(
          'Template label is required',
          HttpStatus.BAD_REQUEST,
        );
      }
      console.log('[TemplateService.create] Inserting template record into database');
      const [result] = await this.db
        .insert(templates)
        .values({
          template_name: dto.template_name,
          template_label: dto.template_label,
          template_url: uploadResult,
          description: dto.description,
          company_id: null,
          vendor_id: null,
        })
        .returning()
        .catch((error) => {
          console.error('[TemplateService.create] Error inserting template:', error);
          throw new InternalServerErrorException(
            'Database error while inserting template',
            {
              cause: error,
            },
          );
        });
      console.log('[TemplateService.create] Template created successfully', { templateId: result.id });
      return result;
    } catch (error) {
      throw new InternalServerErrorException(
        'Database error while creating template',
        {
          cause: error,
        },
      );
    }
  }

  async findAll() {
    try {
      console.log('[TemplateService.findAll] Request received');
      console.log('[TemplateService.findAll] Querying all templates from database');
      const result = await this.db
        .select()
        .from(templates)
        .catch((error) => {
          console.error('[TemplateService.findAll] Error fetching templates:', error);
          throw new InternalServerErrorException(
            'Database error while fetching templates',
            {
              cause: error,
            },
          );
        });
      console.log('[TemplateService.findAll] Templates retrieved successfully', { count: result.length });
      return result;
    } catch (error) {
      console.error('[TemplateService.findAll] Error in findAll:', error);
      throw error;
    }
  }

  async findOne(id: string) {
    try {
      console.log('[TemplateService.findOne] Request received', { templateId: id });
      console.log('[TemplateService.findOne] Querying template by ID from database');
      const [result] = await this.db
        .select()
        .from(templates)
        .where(eq(templates.id, id))
        .catch((error) => {
          console.error('[TemplateService.findOne] Error fetching template:', error);
          throw new InternalServerErrorException(
            'Database error while fetching template',
            {
              cause: error,
            },
          );
        });
      console.log('[TemplateService.findOne] Template found successfully', { templateId: id });
      return result;
    } catch (error) {
      console.error('[TemplateService.findOne] Error in findOne:', error);
      throw error;
    }
  }

  async update(
    id: string,
    dto: UpdateTemplateDto,
    file?: { template_file: Express.Multer.File[] },
  ) {
    try {
      console.log('[TemplateService.update] Request received', { templateId: id });
      console.log('[TemplateService.update] Checking for existing template');
      const isExist = await this.db
        .select()
        .from(templates)
        .where(eq(templates.id, id))
        .catch((error) => {
          console.error('[TemplateService.update] Error checking existing template:', error);
          throw new InternalServerErrorException(
            'Database error while checking existing template',
            {
              cause: error,
            },
          );
        });
      if (!isExist) {
        console.log('[TemplateService.update] Template not found for update', { templateId: id });
        throw new HttpException('Template not found', HttpStatus.NOT_FOUND);
      }
      let templateUrl: string | undefined;
      if (file) {
        console.log('[TemplateService.update] Uploading new template file to cloud storage');
        const uploadResult = await this.UploadToCloud.uploadTemplate(
          file.template_file[0].buffer,
          dto.template_name || isExist[0].template_name,
        );
        templateUrl = uploadResult;
      }
      console.log('[TemplateService.update] Updating template record in database');
      const updatedTemplate = {
        template_name: dto.template_name,
        template_label: dto.template_label,
        description: dto.description,
        ...(templateUrl && { template_url: templateUrl }),
      };
      const [result] = await this.db
        .update(templates)
        .set(updatedTemplate)
        .where(eq(templates.id, id))
        .returning()
        .catch((error) => {
          console.error('[TemplateService.update] Error updating template:', error);
          throw new InternalServerErrorException(
            'Database error while updating template',
            {
              cause: error,
            },
          );
        });
      console.log('[TemplateService.update] Template updated successfully', { templateId: id });
      return result;
    } catch (error) {
      if (
        error instanceof HttpException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Database error while updating template',
        {
          cause: error,
        },
      );
    }
  }

  async remove(id: string) {
    try {
      console.log('[TemplateService.remove] Request received', { templateId: id });
      if (!id) {
        console.log('[TemplateService.remove] Template ID is missing');
        throw new HttpException(
          'Template ID is required',
          HttpStatus.BAD_REQUEST,
        );
      }
      console.log('[TemplateService.remove] Checking for existing template before deletion');
      const isExist = await this.db
        .select()
        .from(templates)
        .where(eq(templates.id, id))
        .catch((error) => {
          console.error('[TemplateService.remove] Error checking existing template:', error);
          throw new InternalServerErrorException(
            'Database error while checking existing template',
            {
              cause: error,
            },
          );
        });
      if (!isExist) {
        console.log('[TemplateService.remove] Template not found for deletion', { templateId: id });
        throw new HttpException('Template not found', HttpStatus.NOT_FOUND);
      }
      console.log('[TemplateService.remove] Deleting template from database');
      const result = await this.db
        .delete(templates)
        .where(eq(templates.id, id))
        .catch((error) => {
          console.error('[TemplateService.remove] Error deleting template:', error);
          throw new InternalServerErrorException(
            'Database error while deleting template',
            {
              cause: error,
            },
          );
        });
      console.log('[TemplateService.remove] Template deleted successfully', { templateId: id });
      return result;
    } catch (error) {
      console.error('[TemplateService.remove] Error in remove:', error);
      throw error;
    }
  }
}
