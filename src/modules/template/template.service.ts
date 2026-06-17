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
import { TemplateErrorKeyEnum } from './constants/template.enums';

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
      // const [exist] = await this.db
      //   .select()
      //   .from(templates)
      //   .where(eq(templates.template_name, dto.template_name))
      //   .catch((error) => {
      //
      //     throw new InternalServerErrorException(
      //       'Database error while checking existing template',
      //       {
      //         cause: error,
      //       },
      //     );
      //   });
      // ('Existing template:', exist);
      // if (exist) {
      //   throw new HttpException(
      //     'Template with this name already exists',
      //     HttpStatus.BAD_REQUEST,
      //   );
      // }
      if (!file) {
        throw new HttpException(
          TemplateErrorKeyEnum.FILE_IS_REQUIRED,
          HttpStatus.BAD_REQUEST,
        );
      }
      const uploadResult = await this.UploadToCloud.uploadTemplate(
        file.template_file[0].buffer,
        dto.template_name,
      );
      if (!dto.template_label) {
        throw new HttpException(
          TemplateErrorKeyEnum.TEMPLATE_LABEL_IS_REQUIRED,
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
          throw new InternalServerErrorException(
            TemplateErrorKeyEnum.DATABASE_ERROR_WHILE_INSERTING_TEMPLATE,
            {
              cause: error,
            },
          );
        });
      return result;
    } catch (error) {
      throw new InternalServerErrorException(
        TemplateErrorKeyEnum.DATABASE_ERROR_WHILE_CREATING_TEMPLATE,
        {
          cause: error,
        },
      );
    }
  }

  async findAll() {
    try {
      const result = await this.db
        .select()
        .from(templates)
        .catch((error) => {
          throw new InternalServerErrorException(
            TemplateErrorKeyEnum.DATABASE_ERROR_WHILE_FETCHING_TEMPLATES,
            {
              cause: error,
            },
          );
        });
      return result;
    } catch (error) {
      throw error;
    }
  }

  async findOne(id: string) {
    try {
      const [result] = await this.db
        .select()
        .from(templates)
        .where(eq(templates.id, id))
        .catch((error) => {
          throw new InternalServerErrorException(
            TemplateErrorKeyEnum.DATABASE_ERROR_WHILE_FETCHING_TEMPLATE,
            {
              cause: error,
            },
          );
        });
      return result;
    } catch (error) {
      throw error;
    }
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
          throw new InternalServerErrorException(
            TemplateErrorKeyEnum.DATABASE_ERROR_WHILE_CHECKING_EXISTING_TEMPLATE,
            {
              cause: error,
            },
          );
        });
      if (!isExist) {
        throw new HttpException(
          TemplateErrorKeyEnum.TEMPLATE_NOT_FOUND,
          HttpStatus.NOT_FOUND,
        );
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
          throw new InternalServerErrorException(
            TemplateErrorKeyEnum.DATABASE_ERROR_WHILE_UPDATING_TEMPLATE,
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
        TemplateErrorKeyEnum.DATABASE_ERROR_WHILE_UPDATING_TEMPLATE,
        {
          cause: error,
        },
      );
    }
  }

  async remove(id: string) {
    try {
      if (!id) {
        throw new HttpException(
          TemplateErrorKeyEnum.TEMPLATE_ID_IS_REQUIRED,
          HttpStatus.BAD_REQUEST,
        );
      }
      const isExist = await this.db
        .select()
        .from(templates)
        .where(eq(templates.id, id))
        .catch((error) => {
          throw new InternalServerErrorException(
            TemplateErrorKeyEnum.DATABASE_ERROR_WHILE_CHECKING_EXISTING_TEMPLATE,
            {
              cause: error,
            },
          );
        });
      if (!isExist) {
        throw new HttpException(
          TemplateErrorKeyEnum.TEMPLATE_NOT_FOUND,
          HttpStatus.NOT_FOUND,
        );
      }
      const result = await this.db
        .delete(templates)
        .where(eq(templates.id, id))
        .catch((error) => {
          throw new InternalServerErrorException(
            TemplateErrorKeyEnum.DATABASE_ERROR_WHILE_DELETING_TEMPLATE,
            {
              cause: error,
            },
          );
        });
      return result;
    } catch (error) {
      throw error;
    }
  }
}
