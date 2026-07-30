import { Injectable, NotFoundException, InternalServerErrorException, Inject } from '@nestjs/common';
import { eq, and, or } from 'drizzle-orm';
import { product_filters, company } from '../../drizzle/schema/index.js';
import { DRIZZLE, type DrizzleService } from '../../drizzle/drizzle.module.js';
import { CompanyService } from '../company/company.service.js';
import { domainExtractor } from '../../common/filters/domainExtractor.filter.js';
import { FilterOwnerType } from '../../drizzle/types/types.js';
import { FilterRuleNode } from '../../drizzle/types/types.js';

@Injectable()
export class ProductFiltersService {
  constructor(
    @Inject(DRIZZLE) readonly db: DrizzleService,
    private readonly companyService: CompanyService,
  ) {}

  private async resolveCompanyId(domain: string): Promise<string> {
    const filterDomain = domainExtractor(domain);
    return this.companyService.find(filterDomain);
  }

  async getFilters(domain: string) {
    const companyId = await this.resolveCompanyId(domain);
    return await this.db
      .select()
      .from(product_filters)
      .where(
        or(
          eq(product_filters.owner_type, FilterOwnerType.PLATFORM),
          and(
            eq(product_filters.owner_type, FilterOwnerType.VENDOR),
            eq(product_filters.owner_id, companyId)
          )
        )
      )
      .catch((err) => {
        throw new InternalServerErrorException('Failed to fetch product filters', { cause: err });
      });
  }

  async createFilter(domain: string, dto: { name: string; rules: FilterRuleNode | FilterRuleNode[] }) {
    const companyId = await this.resolveCompanyId(domain);
    const [created] = await this.db
      .insert(product_filters)
      .values({
        owner_type: FilterOwnerType.VENDOR,
        owner_id: companyId,
        name: dto.name,
        rules: dto.rules,
      })
      .returning()
      .catch((err) => {
        throw new InternalServerErrorException('Failed to create product filter', { cause: err });
      });
    return { success: true, data: created };
  }

  async updateFilter(domain: string, filterId: string, dto: { name?: string; rules?: FilterRuleNode | FilterRuleNode[] }) {
    const companyId = await this.resolveCompanyId(domain);
    const [updated] = await this.db
      .update(product_filters)
      .set({
        ...(dto.name && { name: dto.name }),
        ...(dto.rules && { rules: dto.rules }),
        updated_at: new Date(),
      })
      .where(
        and(
          eq(product_filters.id, filterId),
          eq(product_filters.owner_type, FilterOwnerType.VENDOR),
          eq(product_filters.owner_id, companyId)
        )
      )
      .returning()
      .catch((err) => {
        throw new InternalServerErrorException('Failed to update product filter', { cause: err });
      });

    if (!updated) throw new NotFoundException('Filter not found or unauthorized');
    return { success: true, data: updated };
  }

  async deleteFilter(domain: string, filterId: string) {
    const companyId = await this.resolveCompanyId(domain);
    const [deleted] = await this.db
      .delete(product_filters)
      .where(
        and(
          eq(product_filters.id, filterId),
          eq(product_filters.owner_type, FilterOwnerType.VENDOR),
          eq(product_filters.owner_id, companyId)
        )
      )
      .returning()
      .catch((err) => {
        throw new InternalServerErrorException('Failed to delete product filter', { cause: err });
      });

    if (!deleted) throw new NotFoundException('Filter not found or unauthorized');
    return { success: true, message: 'Filter deleted' };
  }

  async copyPlatformFilter(domain: string, filterId: string) {
    const companyId = await this.resolveCompanyId(domain);

    // Check if the filter is already owned by this vendor
    const [sourceFilter] = await this.db
      .select()
      .from(product_filters)
      .where(eq(product_filters.id, filterId))
      .catch((err) => {
        throw new InternalServerErrorException('Failed to fetch source product filter', { cause: err });
      });

    if (!sourceFilter) {
      throw new NotFoundException('Source filter not found');
    }

    if (
      sourceFilter.owner_type === FilterOwnerType.VENDOR &&
      sourceFilter.owner_id === companyId
    ) {
      return { success: true, data: sourceFilter };
    }

    // Check if we already have a copy of this filter
    const [existingCopy] = await this.db
      .select()
      .from(product_filters)
      .where(
        and(
          eq(product_filters.owner_type, FilterOwnerType.VENDOR),
          eq(product_filters.owner_id, companyId),
          eq(product_filters.copied_from_id, filterId)
        )
      )
      .catch((err) => {
        throw new InternalServerErrorException('Failed to fetch copied product filter', { cause: err });
      });

    if (existingCopy) {
      return { success: true, data: existingCopy };
    }

    // Create vendor copy
    const [copied] = await this.db
      .insert(product_filters)
      .values({
        owner_type: FilterOwnerType.VENDOR,
        owner_id: companyId,
        name: sourceFilter.name,
        rules: sourceFilter.rules,
        copied_from_id: sourceFilter.id,
      })
      .returning()
      .catch((err) => {
        throw new InternalServerErrorException('Failed to copy product filter', { cause: err });
      });

    return { success: true, data: copied };
  }
}
