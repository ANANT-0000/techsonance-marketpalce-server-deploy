import { Inject, Injectable } from '@nestjs/common';
import { DRIZZLE, type DrizzleService } from '../../drizzle/drizzle.module';
import { CompanyService } from '../company/company.service';
import { domainExtractor } from '../../common/filters/domainExtractor.filter';
import { site_maps } from '../../drizzle/schema';
import { eq } from 'drizzle-orm';
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
}
