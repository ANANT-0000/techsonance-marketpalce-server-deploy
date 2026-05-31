import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';

import { DRIZZLE, type DrizzleService } from '../../drizzle/drizzle.module';
import { CompanyService } from '../company/company.service';
import { UploadToCloudService } from '../../utils/upload-to-cloud/upload-to-cloud.service';
import { domainExtractor } from '../../common/filters/domainExtractor.filter';
import { company_compliance, company_document } from '../../drizzle/schema';
import { and, desc, eq } from 'drizzle-orm';
import { CreateComplianceDto } from './dto/compliance.dto';

@Injectable()
export class ComplianceService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService,
    private readonly companyService: CompanyService,
    private readonly uploadToCloudService: UploadToCloudService,
  ) {}

  // ── helpers ──

  private async resolveCompanyId(domain: string): Promise<string> {
    const filtered = domainExtractor(domain);
    const id = await this.companyService.find(filtered);
    if (!id) throw new HttpException('Company not found', HttpStatus.NOT_FOUND);
    return id;
  }
  async listCompliance(domain: string) {
    try {
      const companyId = await this.resolveCompanyId(domain);
      const complianceFields = await this.db.query.company_compliance
        .findMany({
          where: eq(company_compliance.company_id, companyId),
          with: {
            document: true,
          },
        })
        .catch((error) => {
          console.error('Error fetching compliance fields:', error);
          throw new InternalServerErrorException(
            'Failed to fetch compliance fields',
          );
        });

      return complianceFields;
    } catch (error) {
      if (
        error instanceof HttpException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      console.error('Unexpected error in listCompliance:', error);
      throw new InternalServerErrorException('An unexpected error occurred', {
        cause: error,
      });
    }
  }
}
