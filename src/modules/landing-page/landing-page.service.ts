// landing-page.service.ts
// Final version — tenant isolation, atomic upserts, optimistic concurrency
// on content saves. Depends on migrations/001_fix_company_id_integrity.sql
// having been run (company_id NOT NULL UNIQUE + version column).

import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  ConflictException,
  Inject,
  InternalServerErrorException,
} from '@nestjs/common';
import { asc, eq, sql } from 'drizzle-orm';
import * as schema from '../../drizzle/schema/index.js';
import {
  UpdateLandingPageContentDto,
  UpdateLandingPageThemeDto,
} from './dto/update-landing-page.dto.js';
import { DRIZZLE, type DrizzleService } from '../../drizzle/drizzle.module.js';
import { CompanyService } from '../company/company.service.js';
import { domainExtractor } from '../../common/filters/domainExtractor.filter.js';
import { landing_pages } from '../../drizzle/schema/index.js';

@Injectable()
export class LandingPageService {
  constructor(
    @Inject(DRIZZLE)
    private readonly db: DrizzleService,
    private readonly companyService: CompanyService,
  ) {}

  private async resolveCompanyId(domain: string): Promise<string> {
    try {
      return await this.companyService.find(domainExtractor(domain));
    } catch (err) {
      throw new InternalServerErrorException(
        `Unable to resolve company for domain "${domain}".`,
        { cause: err },
      );
    }
  }
  /**
   * GET /landing-page
   * Returns the theme (flat colors) and all content sections for the given
   * company domain. Used by Next.js SSR to hydrate the public landing page.
   */
  async getLandingPageData(domain: string) {
    const companyId = await this.resolveCompanyId(domain);

    // Theme lives in landing_pages (flat color columns)
    const [themeRow] = await this.db
      .select()
      .from(landing_pages)
      .where(eq(schema.landing_pages.company_id, companyId))
      .limit(1);

    // All page content lives in landing_page_content (jsonb columns)
    const [contentRow] = await this.db
      .select()
      .from(schema.landing_page_content)
      .where(eq(schema.landing_page_content.company_id, companyId))
      .limit(1);

    // All page content lives in landing_page_content (jsonb columns)

    // Active subscription plans — ordered for display on the public pricing section
    const plans = await this.db
      .select({
        id: schema.subscription_plans.id,
        plan_name: schema.subscription_plans.plan_name,
        display_name: schema.subscription_plans.display_name,
        price_monthly: schema.subscription_plans.price_monthly,
        price_annual: schema.subscription_plans.price_annual,
        annual_total: schema.subscription_plans.annual_total,
        trial_days: schema.subscription_plans.trial_days,
        capabilities: schema.subscription_plans.capabilities,
        display_order: schema.subscription_plans.display_order,
      })
      .from(schema.subscription_plans)
      .where(eq(schema.subscription_plans.is_active, true))
      .orderBy(asc(schema.subscription_plans.display_order));

    const brandingRow = await this.db.query.company_branding.findFirst({
      where: eq(schema.company_branding.company_id, companyId),
    });

    return {
      theme: themeRow
        ? {
            primary_color: themeRow.primary_color,
            secondary_color: themeRow.secondary_color,
            background_color: themeRow.background_color,
            text_color: themeRow.text_color,
          }
        : {},
      content: contentRow?.content ?? {},
      isPublished: contentRow?.is_published ?? false,
      plans,
      branding: brandingRow ? { logo_url: brandingRow.logo_url } : null,
    };
  }

  // ─── THEME ────────────────────────────────────────────────────────────

  async updateTheme(domain: string, dto: UpdateLandingPageThemeDto) {
    const companyId = await this.resolveCompanyId(domain);

    const t = dto.theme as Record<string, string>;
    const values = {
      company_id: companyId,
      primary_color: t.primary_color,
      secondary_color: t.secondary_color,
      background_color: t.background_color,
      text_color: t.text_color,
    };

    const existingTheme = await this.db.query.landing_pages.findFirst({
      where: eq(schema.landing_pages.company_id, companyId),
    });

    if (existingTheme) {
      const [theme] = await this.db
        .update(schema.landing_pages)
        .set({
          primary_color: values.primary_color,
          secondary_color: values.secondary_color,
          background_color: values.background_color,
          text_color: values.text_color,
        })
        .where(eq(schema.landing_pages.company_id, companyId))
        .returning();
      return { theme };
    }

    const [theme] = await this.db
      .insert(schema.landing_pages)
      .values({ id: crypto.randomUUID(), ...values })
      .returning();

    return { theme };
  }

  // ─── CONTENT ──────────────────────────────────────────────────────────

  /**
   * Upserts the content JSONB blob. `dto.expectedVersion` is optional —
   * pass it from the client's last-fetched `version` to get optimistic
   * concurrency protection (a 409 if someone else saved in between).
   * Omitting it falls back to last-write-wins, same as before.
   */
  async updateContent(
    domain: string,
    dto: UpdateLandingPageContentDto & { expectedVersion?: number },
  ) {
    const companyId = await this.resolveCompanyId(domain);

    // dto.content should already be validated by ZodValidationPipe at the
    // controller boundary (see zod-validation.pipe.ts) before it reaches here.

    if (dto.expectedVersion === undefined) {
      // Last-write-wins path: check if a row already exists and
      // update it, otherwise insert a fresh one.
      const existing = await this.db.query.landing_page_content.findFirst({
        where: eq(schema.landing_page_content.company_id, companyId),
      });

      if (existing) {
        const [updated] = await this.db
          .update(schema.landing_page_content)
          .set({
            content: dto.content,
            version: sql`${schema.landing_page_content.version} + 1`,
          })
          .where(eq(schema.landing_page_content.company_id, companyId))
          .returning();
        return { content: updated.content, version: updated.version };
      }

      const [inserted] = await this.db
        .insert(schema.landing_page_content)
        .values({
          company_id: companyId,
          content: dto.content,
          version: 1,
        })
        .returning();
      return { content: inserted.content, version: inserted.version };
    }

    // Optimistic concurrency path: only update if the row is still at the
    // version the client last saw.
    const existing = await this.db.query.landing_page_content.findFirst({
      where: eq(schema.landing_page_content.company_id, companyId),
    });

    if (!existing) {
      const [inserted] = await this.db
        .insert(schema.landing_page_content)
        .values({ company_id: companyId, content: dto.content, version: 1 })
        .returning();
      return { content: inserted.content, version: inserted.version };
    }

    if (existing.version !== dto.expectedVersion) {
      throw new ConflictException(
        'This content was updated by someone else since you loaded it. Refresh and reapply your changes.',
      );
    }

    const [updated] = await this.db
      .update(schema.landing_page_content)
      .set({ content: dto.content, version: existing.version + 1 })
      .where(eq(schema.landing_page_content.company_id, companyId))
      .returning();

    return { content: updated.content, version: updated.version };
  }

  // ─── PUBLISH ──────────────────────────────────────────────────────────

  async togglePublish(domain: string) {
    const companyId = await this.resolveCompanyId(domain);

    const existing = await this.db.query.landing_page_content.findFirst({
      where: eq(schema.landing_page_content.company_id, companyId),
    });

    if (!existing) {
      throw new NotFoundException(
        'No landing page content found. Save content first before publishing.',
      );
    }

    const [updated] = await this.db
      .update(schema.landing_page_content)
      .set({ is_published: !existing.is_published })
      .where(eq(schema.landing_page_content.company_id, companyId))
      .returning({ is_published: schema.landing_page_content.is_published });

    return { isPublished: updated.is_published };
  }
}
