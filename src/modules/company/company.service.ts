import {
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE, type DrizzleService } from '../../drizzle/drizzle.module';
import { company, user_and_company, vendor } from '../../drizzle/schema';
import { AccessStatus, UserStatus } from '../../drizzle/types/types';
import { domainExtractor } from '../../common/filters/domainExtractor.filter';
import { COMPANY_MESSAGES } from './constants/company.constants';
import {
  CompanyEnvironmentEnum,
  CompanyOperationEnum,
  CompanyOperationResultEnum,
} from './constants/company.enums';

@Injectable()
export class CompanyService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleService) {}

  private async resolveCompanyId(domain: string): Promise<string> {
    const filteredDomain = domainExtractor(domain);
    return this.find(filteredDomain);
  }

  private createMutationResponse(result: CompanyOperationResultEnum) {
    return {
      message: COMPANY_MESSAGES.COMPANY_ACTION_SUCCESS(result),
      status: HttpStatus.OK,
      data: null,
    };
  }

  async findProfile(domain: string) {
    const filteredDomain = domainExtractor(domain);
    const companyId = await this.find(filteredDomain);
    const companyProfile = await this.db.query.company
      .findFirst({
        where: eq(company.id, companyId),
        with: {
          vendor: true,
          companyBranding: true,
        },
      })
      .catch((error) => {
        throw new InternalServerErrorException(
          COMPANY_MESSAGES.PROFILE_FIND_FAILED(domain),
          {
            cause: error,
          },
        );
      });

    if (!companyProfile) {
      throw new InternalServerErrorException(
        COMPANY_MESSAGES.PROFILE_NOT_FOUND(domain),
      );
    }

    return companyProfile;
  }

  async listCompanies() {
    try {
      const companies = await this.db
        .select()
        .from(company)
        .catch((error) => {
          throw new InternalServerErrorException(
            COMPANY_MESSAGES.COMPANIES_FIND_FAILED,
            {
              cause: error,
            },
          );
        });

      if (!companies) {
        throw new InternalServerErrorException(
          COMPANY_MESSAGES.COMPANIES_NOT_FOUND,
        );
      }

      return companies;
    } catch (error) {
      if (error instanceof InternalServerErrorException) {
        throw error;
      }

      throw new InternalServerErrorException(
        COMPANY_MESSAGES.COMPANIES_FIND_FAILED,
        {
          cause: error,
        },
      );
    }
  }

  async activateCompany(id: string) {
    try {
      if (!id) {
        throw new InternalServerErrorException(
          COMPANY_MESSAGES.COMPANY_ID_NOT_FOUND(id),
        );
      }

      const companyId = await this.find(id);
      const result = await this.db.transaction(async (tx) => {
        const [companyRecord] = await tx
          .update(company)
          .set({ company_status: UserStatus.ACTIVE })
          .where(eq(company.id, companyId))
          .returning({ id: company.id })
          .catch((error) => {
            throw new InternalServerErrorException(
              COMPANY_MESSAGES.COMPANY_ACTION_FAILED(
                CompanyOperationEnum.ACTIVATE,
                companyId,
              ),
              {
                cause: error,
              },
            );
          });

        if (!companyRecord) {
          throw new InternalServerErrorException(
            COMPANY_MESSAGES.COMPANY_ID_NOT_FOUND(companyId),
          );
        }

        const userCompanyRecord = await tx
          .update(user_and_company)
          .set({ access_status: AccessStatus.ACTIVE })
          .where(eq(user_and_company.company_id, companyId))
          .returning({ id: user_and_company.id })
          .catch((error) => {
            throw new InternalServerErrorException(
              COMPANY_MESSAGES.USER_COMPANY_RECORD_FIND_FAILED(companyId),
              {
                cause: error,
              },
            );
          });

        if (!userCompanyRecord) {
          throw new InternalServerErrorException(
            COMPANY_MESSAGES.USER_COMPANY_RECORD_NOT_FOUND(companyId),
          );
        }

        await tx
          .update(vendor)
          .set({ vendor_status: UserStatus.ACTIVE })
          .where(eq(vendor.company_id, companyId))
          .catch((error) => {
            throw new InternalServerErrorException(
              COMPANY_MESSAGES.VENDOR_ACTION_FAILED(
                CompanyOperationEnum.ACTIVATE,
                companyId,
              ),
              {
                cause: error,
              },
            );
          });

        return this.createMutationResponse(
          CompanyOperationResultEnum.ACTIVATED,
        );
      });

      return result;
    } catch (error) {
      if (error instanceof InternalServerErrorException) {
        throw error;
      }

      throw new InternalServerErrorException(
        COMPANY_MESSAGES.COMPANY_ACTION_FAILED_GENERIC(
          CompanyOperationEnum.ACTIVATE,
        ),
        {
          cause: error,
        },
      );
    }
  }

  async deactivateCompany(id: string) {
    try {
      if (!id) {
        throw new InternalServerErrorException(
          COMPANY_MESSAGES.COMPANY_ID_NOT_FOUND(id),
        );
      }

      const companyId = await this.find(id);
      const result = await this.db.transaction(async (tx) => {
        const [companyRecord] = await tx
          .update(company)
          .set({ company_status: UserStatus.INACTIVE })
          .where(eq(company.id, companyId))
          .returning({ id: company.id })
          .catch((error) => {
            throw new InternalServerErrorException(
              COMPANY_MESSAGES.COMPANY_ACTION_FAILED(
                CompanyOperationEnum.DEACTIVATE,
                companyId,
              ),
              {
                cause: error,
              },
            );
          });

        if (!companyRecord) {
          throw new InternalServerErrorException(
            COMPANY_MESSAGES.COMPANY_ID_NOT_FOUND(companyId),
          );
        }

        const userCompanyRecord = await tx
          .update(user_and_company)
          .set({ access_status: AccessStatus.INACTIVE })
          .where(eq(user_and_company.company_id, companyId))
          .returning({ id: user_and_company.id })
          .catch((error) => {
            throw new InternalServerErrorException(
              COMPANY_MESSAGES.USER_COMPANY_RECORD_FIND_FAILED(companyId),
              {
                cause: error,
              },
            );
          });

        if (!userCompanyRecord) {
          throw new InternalServerErrorException(
            COMPANY_MESSAGES.USER_COMPANY_RECORD_NOT_FOUND(companyId),
          );
        }

        await tx
          .update(vendor)
          .set({ vendor_status: UserStatus.INACTIVE })
          .where(eq(vendor.company_id, companyId))
          .catch((error) => {
            throw new InternalServerErrorException(
              COMPANY_MESSAGES.VENDOR_ACTION_FAILED(
                CompanyOperationEnum.DEACTIVATE,
                companyId,
              ),
              {
                cause: error,
              },
            );
          });

        return this.createMutationResponse(
          CompanyOperationResultEnum.DEACTIVATED,
        );
      });

      return result;
    } catch (error) {
      if (error instanceof InternalServerErrorException) {
        throw error;
      }

      throw new InternalServerErrorException(
        COMPANY_MESSAGES.COMPANY_ACTION_FAILED_GENERIC(
          CompanyOperationEnum.DEACTIVATE,
        ),
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
          COMPANY_MESSAGES.COMPANY_ID_NOT_FOUND(id),
        );
      }

      const companyId = await this.find(id);
      const result = await this.db.transaction(async (tx) => {
        const [companyRecord] = await tx
          .update(company)
          .set({ company_status: UserStatus.SUSPENDED })
          .where(eq(company.id, companyId))
          .returning({ id: company.id })
          .catch((error) => {
            throw new InternalServerErrorException(
              COMPANY_MESSAGES.COMPANY_ACTION_FAILED(
                CompanyOperationEnum.SUSPEND,
                companyId,
              ),
              {
                cause: error,
              },
            );
          });

        if (!companyRecord) {
          throw new InternalServerErrorException(
            COMPANY_MESSAGES.COMPANY_ID_NOT_FOUND(companyId),
          );
        }

        const userCompanyRecord = await tx
          .update(user_and_company)
          .set({ access_status: AccessStatus.INACTIVE })
          .where(eq(user_and_company.company_id, companyId))
          .returning({ id: user_and_company.id })
          .catch((error) => {
            throw new InternalServerErrorException(
              COMPANY_MESSAGES.USER_COMPANY_RECORD_FIND_FAILED(companyId),
              {
                cause: error,
              },
            );
          });

        if (!userCompanyRecord) {
          throw new InternalServerErrorException(
            COMPANY_MESSAGES.USER_COMPANY_RECORD_NOT_FOUND(companyId),
          );
        }

        await tx
          .update(vendor)
          .set({ vendor_status: UserStatus.SUSPENDED })
          .where(eq(vendor.company_id, companyId))
          .catch((error) => {
            throw new InternalServerErrorException(
              COMPANY_MESSAGES.VENDOR_ACTION_FAILED(
                CompanyOperationEnum.SUSPEND,
                companyId,
              ),
              {
                cause: error,
              },
            );
          });

        return this.createMutationResponse(
          CompanyOperationResultEnum.SUSPENDED,
        );
      });

      return result;
    } catch (error) {
      if (error instanceof InternalServerErrorException) {
        throw error;
      }

      throw new InternalServerErrorException(
        COMPANY_MESSAGES.COMPANY_ACTION_FAILED_GENERIC(
          CompanyOperationEnum.SUSPEND,
        ),
        {
          cause: error,
        },
      );
    }
  }

  async find(domain: string) {
    try {
      const whereClause =
        process.env.NODE_ENV === CompanyEnvironmentEnum.PRODUCTION
          ? eq(company.company_domain, domain)
          : eq(company.id, domain);

      const [companyRecord] = await this.db
        .select({ id: company.id })
        .from(company)
        .where(whereClause)
        .limit(1)
        .catch((error) => {
          throw new InternalServerErrorException(
            COMPANY_MESSAGES.COMPANY_DOMAIN_FIND_FAILED(domain),
            {
              cause: error,
            },
          );
        });

      if (!companyRecord) {
        throw new InternalServerErrorException(
          COMPANY_MESSAGES.COMPANY_DOMAIN_NOT_FOUND(domain),
        );
      }

      return companyRecord?.id ?? null;
    } catch (error) {
      if (error instanceof InternalServerErrorException) {
        throw error;
      }

      throw new InternalServerErrorException(
        COMPANY_MESSAGES.COMPANY_DOMAIN_FIND_FAILED(domain),
        {
          cause: error,
        },
      );
    }
  }
}
