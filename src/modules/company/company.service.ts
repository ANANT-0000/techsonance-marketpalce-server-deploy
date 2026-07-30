import {
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import { eq, sql, and, isNull, like } from 'drizzle-orm';
import { DRIZZLE, type DrizzleService } from '../../drizzle/drizzle.module.js';
import {
  company,
  user_and_company,
  vendor,
  products,
  categories,
  landing_page_content,
} from '../../drizzle/schema/index.js';
import {
  AccessStatus,
  EntityStatus,
  UserStatus,
} from '../../drizzle/types/types.js';
import { domainExtractor } from '../../common/filters/domainExtractor.filter.js';
import { COMPANY_MESSAGES } from './constants/company.constants.js';
import {
  CompanyEnvironmentEnum,
  CompanyOperationEnum,
  CompanyOperationResultEnum,
  SiteStatusEnum,
} from './constants/company.enums.js';

@Injectable()
export class CompanyService {
  private readonly logger = new Logger(CompanyService.name);
  private readonly domainCache = new Map<
    string,
    { id: string; expiresAt: number }
  >();
  private readonly pendingDomainQueries = new Map<string, Promise<string>>();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_CACHE_SIZE = 1000;
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

    const [productCountResult, categoryCountResult, contentRow] =
      await Promise.all([
        this.db
          .select({ count: sql<number>`count(*)::int` })
          .from(products)
          .where(
            and(
              eq(products.company_id, companyId),
              isNull(products.deleted_at),
              eq(products.record_status, EntityStatus.ACTIVE),
            ),
          )
          .then((rows) => rows[0]),
        this.db
          .select({ count: sql<number>`count(*)::int` })
          .from(categories)
          .where(
            and(
              eq(categories.company_id, companyId),
              isNull(categories.deleted_at),
              eq(categories.record_status, EntityStatus.ACTIVE),
            ),
          )
          .then((rows) => rows[0]),
        this.db.query.landing_page_content.findFirst({
          where: eq(landing_page_content.company_id, companyId),
        }),
      ]).catch((error) => {
        throw new InternalServerErrorException(
          COMPANY_MESSAGES.PROFILE_FIND_FAILED(domain),
          { cause: error },
        );
      });

    const hasProducts = (productCountResult?.count ?? 0) > 0;
    const hasCategories = (categoryCountResult?.count ?? 0) > 0;
    const hasLandingPageContent =
      !!contentRow?.content && Object.keys(contentRow.content).length > 0;
    const isPublished = contentRow?.is_published ?? false;

    const hasAnyContent = hasProducts || hasCategories || hasLandingPageContent;
    const siteStatus: SiteStatusEnum =
      hasAnyContent || isPublished
        ? SiteStatusEnum.ACTIVE
        : SiteStatusEnum.NOT_STARTED;

    return {
      ...companyProfile,
      siteStatus,
      siteData: {
        hasProducts,
        hasCategories,
        hasLandingPageContent,
        isPublished,
      },
    };
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
          .set({ onboarding_status: EntityStatus.ACTIVE })
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
          .set({ onboarding_status: EntityStatus.INACTIVE })
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
          .set({ onboarding_status: EntityStatus.SUSPENDED })
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
      if (!domain) {
        throw new NotFoundException('Company domain is required');
      }

      const now = Date.now();
      const cached = this.domainCache.get(domain);
      if (cached && cached.expiresAt > now) {
        return cached.id;
      }

      // Cache Stampede Prevention
      const pending = this.pendingDomainQueries.get(domain);
      if (pending) {
        return pending;
      }

      this.logger.debug(
        `CompanyService.find - searching for domain: ${domain}`,
      );

      const queryPromise = (async () => {
        try {
          const isUuid = isUUID(domain);
          const whereClause = isUuid
            ? eq(company.id, domain)
            : process.env.NODE_ENV === CompanyEnvironmentEnum.PRODUCTION
              ? like(company.company_domain, `%${domain}%`)
              : like(company.id, domain);

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
            throw new NotFoundException(
              COMPANY_MESSAGES.COMPANY_DOMAIN_NOT_FOUND(domain),
            );
          }

          if (
            !this.domainCache.has(domain) &&
            this.domainCache.size >= this.MAX_CACHE_SIZE
          ) {
            const firstKey = this.domainCache.keys().next().value;
            if (firstKey) this.domainCache.delete(firstKey);
          }

          this.domainCache.set(domain, {
            id: companyRecord.id,
            expiresAt: Date.now() + this.CACHE_TTL_MS,
          });

          return companyRecord.id;
        } finally {
          this.pendingDomainQueries.delete(domain);
        }
      })();

      this.pendingDomainQueries.set(domain, queryPromise);
      return queryPromise;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
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
