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
      console.log('Creating template with DTO:', dto.template_name);
      console.log('Received file:', file);
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
        throw new HttpException('File is required', HttpStatus.BAD_REQUEST);
      }
      const uploadResult = await this.UploadToCloud.uploadTemplate(
        file.template_file[0].buffer,
        dto.template_name,
      );
      console.log('Uploaded template:', uploadResult);
      if (!dto.template_label) {
        throw new HttpException(
          'Template label is required',
          HttpStatus.BAD_REQUEST,
        );
      }
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
          console.error('Error inserting template:', error);
          throw new InternalServerErrorException(
            'Database error while inserting template',
            {
              cause: error,
            },
          );
        });
      console.log('Inserted template:', result);
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
    const result = await this.db
      .select()
      .from(templates)
      .catch((error) => {
        console.error('Error fetching templates:', error);
        throw new InternalServerErrorException(
          'Database error while fetching templates',
          {
            cause: error,
          },
        );
      });
    return result;
  }

  async findOne(id: string) {
    const [result] = await this.db
      .select()
      .from(templates)
      .where(eq(templates.id, id))
      .catch((error) => {
        console.error('Error fetching template:', error);
        throw new InternalServerErrorException(
          'Database error while fetching template',
          {
            cause: error,
          },
        );
      });
    return result;
  }

  async update(
    id: string,
    dto: UpdateTemplateDto,
    file?: { template_file: Express.Multer.File[] },
  ) {
    try {
      const isExist = await this.db
        .select()
        .from(templates)
        .where(eq(templates.id, id))
        .catch((error) => {
          console.error('Error checking existing template:', error);
          throw new InternalServerErrorException(
            'Database error while checking existing template',
            {
              cause: error,
            },
          );
        });
      if (!isExist) {
        throw new HttpException('Template not found', HttpStatus.NOT_FOUND);
      }
      let templateUrl: string | undefined;
      if (file) {
        const uploadResult = await this.UploadToCloud.uploadTemplate(
          file.template_file[0].buffer,
          dto.template_name || isExist[0].template_name,
        );
        templateUrl = uploadResult;
      }
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
          console.error('Error updating template:', error);
          throw new InternalServerErrorException(
            'Database error while updating template',
            {
              cause: error,
            },
          );
        });
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
    if (!id) {
      throw new HttpException(
        'Template ID is required',
        HttpStatus.BAD_REQUEST,
      );
    }
    const isExist = await this.db
      .select()
      .from(templates)
      .where(eq(templates.id, id))
      .catch((error) => {
        console.error('Error checking existing template:', error);
        throw new InternalServerErrorException(
          'Database error while checking existing template',
          {
            cause: error,
          },
        );
      });
    if (!isExist) {
      throw new HttpException('Template not found', HttpStatus.NOT_FOUND);
    }
    console.log('deleting template');
    const result = await this.db
      .delete(templates)
      .where(eq(templates.id, id))
      .catch((error) => {
        console.error('Error deleting template:', error);
        throw new InternalServerErrorException(
          'Database error while deleting template',
          {
            cause: error,
          },
        );
      });
    return result;
  }
}
