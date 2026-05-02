import {
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { eq, or } from 'drizzle-orm';
// import { CreateCompanyDto } from './dto/create-company.dto';
// import { UpdateCompanyDto } from './dto/update-company.dto';
import { DRIZZLE, type DrizzleService } from 'src/drizzle/drizzle.module';
import { company, user, user_and_company, vendor } from 'src/drizzle/schema';
import { AccessStatus, UserStatus } from 'src/drizzle/types/types';

@Injectable()
export class CompanyService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleService) { }
  async listCompanies() {
    try {
      const companies = await this.db.select().from(company).catch((error) => {
        console.error(`Error finding companies:`, error);
        throw new InternalServerErrorException(
          `Failed to find companies`,
          {
            cause: error,
          },
        );
      });
      if (!companies) {
        throw new InternalServerErrorException(
          `Companies not found`,
        );
      }
      return companies
    } catch (error) {
      if (error instanceof InternalServerErrorException) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Failed to find companies`,
        {
          cause: error,
        },
      );
    }
  }
  async suspendCompany(id: string) {
    try {
      if (!id) {
        throw new InternalServerErrorException(
          `Company with ID ${id} not found`,
        );
      }
      const companyId = await this.find(id)
      const result = await this.db.transaction(async (tx) => {


        const [companyRecord] = await tx
          .update(company)
          .set({ company_status: UserStatus.SUSPENDED })
          .where(eq(company.id, companyId))
          .returning({ id: company.id })
          .catch((error) => {
            console.error(`Error suspending company ${companyId}:`, error);
            throw new InternalServerErrorException(
              `Failed to suspend company ${companyId}`,
              {
                cause: error,
              },
            );
          });
        if (!companyRecord) {
          throw new InternalServerErrorException(
            `Company with ID ${companyId} not found`,
          );
        }
        const userCompanyRecord = await tx.update(user_and_company).set({ access_status: AccessStatus.INACTIVE }).where(eq(user_and_company.company_id, companyId)).returning({ id: user_and_company.id }).catch((error) => {
          console.error(`Error finding user and company record with company ID ${companyId}:`, error);
          throw new InternalServerErrorException(
            `Failed to find user and company record with company ID ${companyId}`,
            {
              cause: error,
            },
          );
        });
        if (!userCompanyRecord) {
          throw new InternalServerErrorException(
            `User and company record with company ID ${companyId} not found`,
          );
        }
        await tx.update(vendor).set({ vendor_status: UserStatus.SUSPENDED }).where(eq(vendor.company_id, companyId)).catch((error) => {
          console.error(`Error suspending vendor with company ID ${companyId}:`, error);
          throw new InternalServerErrorException(
            `Failed to suspend vendor with company ID ${companyId}`,
            {
              cause: error,
            },
          );
        });
        return companyRecord;
      })
    } catch (error) {
      if (error instanceof InternalServerErrorException) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Failed to suspend company `,
        {
          cause: error,
        },
      );
    }
  }
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
