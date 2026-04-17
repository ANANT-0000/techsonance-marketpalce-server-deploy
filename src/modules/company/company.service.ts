import {
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { eq, or } from 'drizzle-orm';
// import { CreateCompanyDto } from './dto/create-company.dto';
// import { UpdateCompanyDto } from './dto/update-company.dto';
import { DRIZZLE, type DrizzleService } from 'src/drizzle/drizzle.module';
import { company } from 'src/drizzle/schema';

@Injectable()
export class CompanyService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleService) {}
  async find(domain: string) {
    try {
      const [companyRecord] = await this.db
        .select({ id: company.id })
        .from(company)
        .where(or(eq(company.company_domain, domain), eq(company.id, domain)))
        .limit(1)
        .catch((error) => {
          console.error(`Error finding company with domain ${domain}:`, error);
          throw new InternalServerErrorException(
            `Failed to find company with domain ${domain}`,
            {
              cause: error,
            },
          );
        });
      if (!companyRecord) {
        throw new InternalServerErrorException(
          `Company with domain ${domain} not found`,
        );
      }
      return companyRecord?.id ?? null;
    } catch (error) {
      if (error instanceof InternalServerErrorException) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Failed to find company with domain ${domain}`,
        {
          cause: error,
        },
      );
    }
  }
}
