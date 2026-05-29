 
import {
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { eq, or } from 'drizzle-orm';

import { DRIZZLE, type DrizzleService } from '../../drizzle/drizzle.module';
import { company, user, user_and_company, vendor } from '../../drizzle/schema';
import { AccessStatus, UserStatus } from '../../drizzle/types/types';
import { ConfigService } from '@nestjs/config';
import { domainExtractor } from '../../common/filters/domainExtractor.filter';
@Injectable()
export class CompanyService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService,
    private configService: ConfigService,
  ) {}
  private async resolveCompanyId(domain: string): Promise<string> {
    const filteredDomain = domainExtractor(domain);
    console.log(
      `[CompanyService.resolveCompanyId] Resolving company for domain: ${domain}`,
    );
    console.log(
      `[CompanyService.resolveCompanyId] Extracted filter domain: ${filteredDomain}`,
    );
    console.log(
      `[CompanyService.resolveCompanyId] Querying CompanyService.find(...)`,
    );
    const companyId = await this.find(filteredDomain);
    console.log(
      `[CompanyService.resolveCompanyId] Company resolved: ${companyId}`,
    );
    return companyId;
  }

  async findProfile(domain: string) {
    console.log(
      `[CompanyService.findProfile] starting profile retrieval for domain: ${domain}`,
    );
    const filteredDomain = domainExtractor(domain);
    const companyId = await this.find(filteredDomain);
    console.log(
      `[CompanyService.findProfile] Resolved company ID: ${companyId}`,
    );
    const companyProfile = await this.db.query.company
      .findFirst({
        where: eq(company.id, companyId),
        with: {
          vendor: true,
          companyBranding: true,
        },
      })
      .catch((error) => {
        console.error(
          `Error finding company profile for domain ${domain}:`,
          error,
        );
        throw new InternalServerErrorException(
          `Failed to find company profile for domain ${domain}`,
          {
            cause: error,
          },
        );
      });
    if (!companyProfile) {
      console.error(`Company profile with domain ${domain} not found`);
      throw new InternalServerErrorException(
        `Company profile with domain ${domain} not found`,
      );
    }
    console.log(
      `[CompanyService.findProfile] Retrieved company profile : ${JSON.stringify(companyProfile)}`,
    );
    return companyProfile;
  }

  async listCompanies() {
    try {
      console.log('[CompanyService.listCompanies] Request received');
      console.log('[CompanyService.listCompanies] Querying company table');
      const companies = await this.db
        .select()
        .from(company)
        .catch((error) => {
          console.error(`Error finding companies:`, error);
          throw new InternalServerErrorException(`Failed to find companies`, {
            cause: error,
          });
        });
      if (!companies) {
        throw new InternalServerErrorException(`Companies not found`);
      }
      console.log(
        `[CompanyService.listCompanies] Retrieved ${companies.length} company record(s)`,
      );
      return companies;
    } catch (error) {
      if (error instanceof InternalServerErrorException) {
        throw error;
      }
      throw new InternalServerErrorException(`Failed to find companies`, {
        cause: error,
      });
    }
  }

  async activateCompany(id: string) {
    try {
      console.log(
        `[CompanyService.activateCompany] Request received for company id: ${id}`,
      );
      if (!id) {
        throw new InternalServerErrorException(
          `Company with ID ${id} not found`,
        );
      }
      console.log(
        '[CompanyService.activateCompany] Resolving company identifier',
      );
      const companyId = await this.find(id);
      console.log(
        `[CompanyService.activateCompany] Company resolved: ${companyId}`,
      );
      console.log(
        '[CompanyService.activateCompany] Starting database transaction',
      );
      const result = await this.db.transaction(async (tx) => {
        console.log(
          `[CompanyService.activateCompany] Activating company record ${companyId}`,
        );
        const [companyRecord] = await tx
          .update(company)
          .set({ company_status: UserStatus.ACTIVE })
          .where(eq(company.id, companyId))
          .returning({ id: company.id })
          .catch((error) => {
            console.error(`Error activating company ${companyId}:`, error);
            throw new InternalServerErrorException(
              `Failed to activate company ${companyId}`,
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
        console.log(
          `[CompanyService.activateCompany] Updating user-company access for company ${companyId}`,
        );
        const userCompanyRecord = await tx
          .update(user_and_company)
          .set({ access_status: AccessStatus.ACTIVE })
          .where(eq(user_and_company.company_id, companyId))
          .returning({ id: user_and_company.id })
          .catch((error) => {
            console.error(
              `Error finding user and company record with company ID ${companyId}:`,
              error,
            );
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
        console.log(
          `[CompanyService.activateCompany] Activating vendor records for company ${companyId}`,
        );
        await tx
          .update(vendor)
          .set({ vendor_status: UserStatus.ACTIVE })
          .where(eq(vendor.company_id, companyId))
          .catch((error) => {
            console.error(
              `Error activating vendor with company ID ${companyId}:`,
              error,
            );
            throw new InternalServerErrorException(
              `Failed to activate vendor with company ID ${companyId}`,
              {
                cause: error,
              },
            );
          });
        return {
          message: 'Company activated successfully',
          status: 200,
          data: null,
        };
      });
      console.log(
        `[CompanyService.activateCompany] Company activation completed for ${companyId}`,
      );
      return result;
    } catch (error) {
      if (error instanceof InternalServerErrorException) {
        throw error;
      }
      throw new InternalServerErrorException(`Failed to activate company`, {
        cause: error,
      });
    }
  }

  async deactivateCompany(id: string) {
    try {
      console.log(
        `[CompanyService.deactivateCompany] Request received for company id: ${id}`,
      );
      if (!id) {
        throw new InternalServerErrorException(
          `Company with ID ${id} not found`,
        );
      }
      console.log(
        '[CompanyService.deactivateCompany] Resolving company identifier',
      );
      const companyId = await this.find(id);
      console.log(
        `[CompanyService.deactivateCompany] Company resolved: ${companyId}`,
      );
      console.log(
        '[CompanyService.deactivateCompany] Starting database transaction',
      );
      const result = await this.db.transaction(async (tx) => {
        console.log(
          `[CompanyService.deactivateCompany] Deactivating company record ${companyId}`,
        );
        const [companyRecord] = await tx
          .update(company)
          .set({ company_status: UserStatus.INACTIVE })
          .where(eq(company.id, companyId))
          .returning({ id: company.id })
          .catch((error) => {
            console.error(`Error deactivating company ${companyId}:`, error);
            throw new InternalServerErrorException(
              `Failed to deactivate company ${companyId}`,
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
        console.log(
          `[CompanyService.deactivateCompany] Updating user-company access for company ${companyId}`,
        );
        const userCompanyRecord = await tx
          .update(user_and_company)
          .set({ access_status: AccessStatus.INACTIVE })
          .where(eq(user_and_company.company_id, companyId))
          .returning({ id: user_and_company.id })
          .catch((error) => {
            console.error(
              `Error finding user and company record with company ID ${companyId}:`,
              error,
            );
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
        console.log(
          `[CompanyService.deactivateCompany] Deactivating vendor records for company ${companyId}`,
        );
        await tx
          .update(vendor)
          .set({ vendor_status: UserStatus.INACTIVE })
          .where(eq(vendor.company_id, companyId))
          .catch((error) => {
            console.error(
              `Error deactivating vendor with company ID ${companyId}:`,
              error,
            );
            throw new InternalServerErrorException(
              `Failed to deactivate vendor with company ID ${companyId}`,
              {
                cause: error,
              },
            );
          });
        return {
          message: 'Company deactivated successfully',
          status: 200,
          data: null,
        };
      });
      console.log(
        `[CompanyService.deactivateCompany] Company deactivation completed for ${companyId}`,
      );
      return result;
    } catch (error) {
      if (error instanceof InternalServerErrorException) {
        throw error;
      }
      throw new InternalServerErrorException(`Failed to deactivate company`, {
        cause: error,
      });
    }
  }
  async suspendCompany(id: string) {
    try {
      console.log(
        `[CompanyService.suspendCompany] Request received for company id: ${id}`,
      );
      if (!id) {
        throw new InternalServerErrorException(
          `Company with ID ${id} not found`,
        );
      }
      console.log(
        '[CompanyService.suspendCompany] Resolving company identifier',
      );
      const companyId = await this.find(id);
      console.log(
        `[CompanyService.suspendCompany] Company resolved: ${companyId}`,
      );
      console.log(
        '[CompanyService.suspendCompany] Starting database transaction',
      );
      const result = await this.db.transaction(async (tx) => {
        console.log(
          `[CompanyService.suspendCompany] Suspending company record ${companyId}`,
        );
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
        console.log(
          `[CompanyService.suspendCompany] Updating user-company access for company ${companyId}`,
        );
        const userCompanyRecord = await tx
          .update(user_and_company)
          .set({ access_status: AccessStatus.INACTIVE })
          .where(eq(user_and_company.company_id, companyId))
          .returning({ id: user_and_company.id })
          .catch((error) => {
            console.error(
              `Error finding user and company record with company ID ${companyId}:`,
              error,
            );
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
        console.log(
          `[CompanyService.suspendCompany] Suspending vendor records for company ${companyId}`,
        );
        await tx
          .update(vendor)
          .set({ vendor_status: UserStatus.SUSPENDED })
          .where(eq(vendor.company_id, companyId))
          .catch((error) => {
            console.error(
              `Error suspending vendor with company ID ${companyId}:`,
              error,
            );
            throw new InternalServerErrorException(
              `Failed to suspend vendor with company ID ${companyId}`,
              {
                cause: error,
              },
            );
          });
        return {
          message: 'Company suspended successfully',
          status: 200,
          data: null,
        };
      });
      console.log(
        `[CompanyService.suspendCompany] Company suspension completed for ${companyId}`,
      );
      return result;
    } catch (error) {
      if (error instanceof InternalServerErrorException) {
        throw error;
      }
      throw new InternalServerErrorException(`Failed to suspend company `, {
        cause: error,
      });
    }
  }

  //  Important note: The find method is designed to be flexible in resolving a company based on either its domain or its ID, depending on the environment. In production, it looks up companies by their domain, while in development, it allows for direct ID lookup to facilitate testing and debugging. This dual functionality is crucial for ensuring that the service can operate effectively across different stages of deployment while maintaining security and ease of use.
  async find(domain: string) {
    try {
      console.log(
        `[CompanyService.find] Request received for domain: ${domain}`,
      );
      const whereClause =
        process.env.NODE_ENV == 'production'
          ? eq(company.company_domain, domain)
          : eq(company.id, domain);
      const [companyRecord] = await this.db
        .select({ id: company.id })
        .from(company)
        .where(whereClause)
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
      console.log(
        `[CompanyService.find] Company resolved for domain ${domain}: ${companyRecord.id}`,
      );
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
