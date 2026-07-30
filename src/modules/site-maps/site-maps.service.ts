import { Inject, Injectable, InternalServerErrorException, BadRequestException, NotFoundException } from '@nestjs/common';
import { DRIZZLE, type DrizzleService } from '../../drizzle/drizzle.module.js';
import { CompanyService } from '../company/company.service.js';
import { domainExtractor } from '../../common/filters/domainExtractor.filter.js';
import { site_maps } from '../../drizzle/schema/index.js';
import { eq, and } from 'drizzle-orm';
const SYSTEM_DEFAULTS = [
  {
    key: 'store',
    label: 'Store / Shop',
    base_path: '/store',
    default_query_param: 'category',
    is_system: true,
  },
];
@Injectable()
export class SiteMapsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService,
    private readonly companyService: CompanyService,
  ) {}

  private async resolveCompanyId(domain: string): Promise<string> {
    return this.companyService.find(domainExtractor(domain));
  }

  /** Read-only — used by vendor CMS dropdown and NavbarService resolution. */
  async list(domain: string) {
    const companyId = await this.resolveCompanyId(domain);
    const rows = await this.db
      .select()
      .from(site_maps)
      .where(eq(site_maps.company_id, companyId))
      .catch(() => []);

    if (rows.length > 0) return rows;

    return this.db
      .insert(site_maps)
      .values(SYSTEM_DEFAULTS.map((r) => ({ ...r, company_id: companyId })))
      .returning()
      .catch(() => []);
  }

  async getRouteMap(domain: string) {
    const rows = await this.list(domain);
    return new Map(
      rows.map((r) => [
        r.key,
        { base_path: r.base_path, default_query_param: r.default_query_param },
      ]),
    );
  }

  async create(domain: string, payload: { key: string; label: string; base_path: string; default_query_param?: string }) {
    const companyId = await this.resolveCompanyId(domain);
    const existing = await this.db
      .select()
      .from(site_maps)
      .where(and(eq(site_maps.company_id, companyId), eq(site_maps.key, payload.key)))
      .catch((error) => {
        throw new InternalServerErrorException('Failed to check existing site map.', { cause: error });
      });

    if (existing.length > 0) {
      throw new BadRequestException('A site map with this key already exists.');
    }

    const [created] = await this.db
      .insert(site_maps)
      .values({ ...payload, company_id: companyId, is_system: false })
      .returning()
      .catch((error) => {
        throw new InternalServerErrorException('Failed to create new site map.', { cause: error });
      });

    return created;
  }

  async update(id: string, domain: string, payload: { key?: string; label: string; base_path: string; default_query_param?: string }) {
    const companyId = await this.resolveCompanyId(domain);
    const [existing] = await this.db
      .select()
      .from(site_maps)
      .where(and(eq(site_maps.id, id), eq(site_maps.company_id, companyId)))
      .catch((error) => {
        throw new InternalServerErrorException('Failed to retrieve site map for update.', { cause: error });
      });

    if (!existing) {
      throw new NotFoundException('Site map not found.');
    }

    const updatePayload: any = {
      label: payload.label,
      base_path: payload.base_path,
      default_query_param: payload.default_query_param,
    };

    if (!existing.is_system && payload.key) {
      updatePayload.key = payload.key;
    }

    const [updated] = await this.db
      .update(site_maps)
      .set(updatePayload)
      .where(and(eq(site_maps.id, id), eq(site_maps.company_id, companyId)))
      .returning()
      .catch((error) => {
        throw new InternalServerErrorException('Failed to update site map.', { cause: error });
      });

    return updated;
  }

  async delete(id: string, domain: string) {
    const companyId = await this.resolveCompanyId(domain);
    const [existing] = await this.db
      .select()
      .from(site_maps)
      .where(and(eq(site_maps.id, id), eq(site_maps.company_id, companyId)))
      .catch((error) => {
        throw new InternalServerErrorException('Failed to retrieve site map for deletion.', { cause: error });
      });

    if (!existing) {
      throw new NotFoundException('Site map not found.');
    }

    if (existing.is_system) {
      throw new BadRequestException('System site maps cannot be deleted.');
    }

    await this.db
      .delete(site_maps)
      .where(and(eq(site_maps.id, id), eq(site_maps.company_id, companyId)))
      .catch((error) => {
        throw new InternalServerErrorException('Failed to delete site map.', { cause: error });
      });

    return { success: true, message: 'Site map deleted successfully' };
  }
}
