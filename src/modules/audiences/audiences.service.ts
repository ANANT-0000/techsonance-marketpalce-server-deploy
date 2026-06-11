import {
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import { DRIZZLE, type DrizzleService } from '../../drizzle/drizzle.module';
import {
  customer_segments,
  segment_members,
  user,
  orders,
  user_and_company,
} from '../../drizzle/schema';
import { CompanyService } from '../company/company.service';
import { domainExtractor } from '../../common/filters/domainExtractor.filter';
import { CreateSegmentDto } from './dto/audience.dto';
import { SegmentCriteriaOperator } from '../../drizzle/types/types';
import { AudiencesErrorKeyEnum } from './constants/audiences.enums';

export interface SegmentCriterion {
  field:
    | 'total_orders'
    | 'total_spent'
    | 'registered_days_ago'
    | 'last_order_days_ago'
    | 'average_order_value';
  operator: 'gte' | 'lte' | 'eq';
  value: number;
}

@Injectable()
export class AudiencesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService,
    private readonly companyService: CompanyService,
  ) {}

  private async resolveCompanyId(domain: string) {
    return this.companyService.find(domainExtractor(domain));
  }

  // ── List segments ─────────────────────────────────────────────
  async findAll(domain: string) {
    const companyId = await this.resolveCompanyId(domain);
    const rows = await this.db.query.customer_segments.findMany({
      where: and(
        eq(customer_segments.company_id, companyId),
        eq(customer_segments.is_active, true),
      ),
      orderBy: [desc(customer_segments.created_at)],
    });
    return rows;
  }

  // ── Single segment with member count ─────────────────────────
  async findOne(id: string, domain: string) {
    const companyId = await this.resolveCompanyId(domain);
    const segment = await this.db.query.customer_segments.findFirst({
      where: and(
        eq(customer_segments.id, id),
        eq(customer_segments.company_id, companyId),
      ),
    });
    if (!segment) throw new NotFoundException(AudiencesErrorKeyEnum.SEGMENT_NOT_FOUND);

    // Fetch a preview of members (last 50) with basic user info
    const members = await this.db
      .select({
        user_id: segment_members.user_id,
        joined_at: segment_members.joined_at,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
      })
      .from(segment_members)
      .innerJoin(user, eq(segment_members.user_id, user.id))
      .where(eq(segment_members.segment_id, id))
      .orderBy(desc(segment_members.joined_at))
      .limit(50);

    return { ...segment, members };
  }

  // ── Create segment ────────────────────────────────────────────
  async create(dto: CreateSegmentDto, domain: string) {
    try {
      const companyId = await this.resolveCompanyId(domain);
      return await this.db
        .insert(customer_segments)
        .values({
          company_id: companyId,
          name: dto.name,
          description: dto.description ?? null,
          criteria: dto.criteria,
          criteria_operator:
            dto.criteria_operator ?? SegmentCriteriaOperator.AND,
          is_active: true,
          member_count: 0,
        })
        .then(() => ({ success: true, message: 'Segment created' }))
        .catch((err) => {
          throw new InternalServerErrorException(AudiencesErrorKeyEnum.FAILED_TO_CREATE_SEGMENT, {
            cause: err,
          });
        });
    } catch (err) {
      if (err instanceof InternalServerErrorException) throw err;
      throw new InternalServerErrorException(AudiencesErrorKeyEnum.FAILED_TO_CREATE_SEGMENT, {
        cause: err,
      });
    }
  }

  // ── Update segment ────────────────────────────────────────────
  async update(id: string, dto: Partial<CreateSegmentDto>, domain: string) {
    const companyId = await this.resolveCompanyId(domain);
    const patch: Record<string, unknown> = {};
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.description !== undefined) patch.description = dto.description;
    if (dto.criteria !== undefined) patch.criteria = dto.criteria;
    if (dto.criteria_operator !== undefined)
      patch.criteria_operator = dto.criteria_operator;

    const updated = await this.db
      .update(customer_segments)
      .set(patch)
      .where(
        and(
          eq(customer_segments.id, id),
          eq(customer_segments.company_id, companyId),
        ),
      )
      .catch((err) => {
        throw new InternalServerErrorException(AudiencesErrorKeyEnum.FAILED_TO_UPDATE_SEGMENT, {
          cause: err,
        });
      });

    if (!updated)
      throw new NotFoundException(AudiencesErrorKeyEnum.SEGMENT_NOT_FOUND_OR_NO_CHANGES_MADE);
    return { success: true, message: 'Segment updated' };
  }

  // ── Deactivate segment ────────────────────────────────────────
  async deactivate(id: string, domain: string) {
    const companyId = await this.resolveCompanyId(domain);
    await this.db
      .update(customer_segments)
      .set({ is_active: false })
      .where(
        and(
          eq(customer_segments.id, id),
          eq(customer_segments.company_id, companyId),
        ),
      )
      .catch((err) => {
        throw new InternalServerErrorException(AudiencesErrorKeyEnum.FAILED_TO_DEACTIVATE_SEGMENT, {
          cause: err,
        });
      });
    return { message: 'Segment deactivated' };
  }

  // ── Recalculate membership for one segment ───────────────────
  // Called by a cron job nightly, or manually triggered from the UI.
  // Evaluates each criterion against aggregated user order data,
  // then replaces segment_members rows for this segment.
  async recalculate(id: string, domain: string) {
    const companyId = await this.resolveCompanyId(domain);
    const segment = await this.db.query.customer_segments.findFirst({
      where: and(
        eq(customer_segments.id, id),
        eq(customer_segments.company_id, companyId),
      ),
    });
    if (!segment) throw new NotFoundException(AudiencesErrorKeyEnum.SEGMENT_NOT_FOUND);

    const criteria = segment.criteria as SegmentCriterion[];
    if (!criteria.length) return 0;
    // Build a single query that computes per-user aggregates
    // and filters by ALL criteria in one pass (AND logic).
    // OR logic would require UNION — handled separately if needed.
    const now = new Date();
    // Pull all users in this company with their order aggregates
    const userAggregates = await this.db
      .select({
        user_id: orders.user_id,
        total_orders: sql<number>`COUNT(DISTINCT ${orders.id})::int`,
        total_spent: sql<number>`COALESCE(SUM(${orders.total_amount}), 0)::float`,
        average_order_value: sql<number>`COALESCE(AVG(${orders.total_amount}), 0)::float`,
        last_order_days_ago: sql<number>`
          COALESCE(
            EXTRACT(DAY FROM NOW() - MAX(${orders.created_at})),
            9999
          )::int`,
      })
      .from(orders)
      .where(eq(orders.company_id, companyId))
      .groupBy(orders.user_id);

    // Also fetch registered_days_ago for each user in this company
    const userRegistrations = await this.db
      .select({
        id: user.id,
        registered_days_ago: sql<number>`
          EXTRACT(DAY FROM NOW() - ${user.created_at})::int`,
      })
      .from(user)
      .innerJoin(user_and_company, eq(user_and_company.user_id, user.id))
      .where(eq(user_and_company.company_id, companyId));

    const regMap = new Map(
      userRegistrations.map((r) => [r.id, r.registered_days_ago]),
    );
    // Evaluate criteria against each user's aggregate
    const compare = (a: number, op: string, b: number) => {
      if (op === 'gte') return a >= b;
      if (op === 'lte') return a <= b;
      if (op === 'eq') return a === b;
      return false;
    };

    const matchedUserIds: string[] = [];

    for (const agg of userAggregates) {
      if (!agg.user_id) continue;
      const regDays = regMap.get(agg.user_id) ?? 0;

      const results = criteria.map((c) => {
        const fieldMap: Record<string, number> = {
          total_orders: agg.total_orders,
          total_spent: agg.total_spent,
          average_order_value: agg.average_order_value,
          last_order_days_ago: agg.last_order_days_ago,
          registered_days_ago: regDays,
        };
        return compare(fieldMap[c.field] ?? 0, c.operator, c.value);
      });

      const matched =
        segment.criteria_operator === SegmentCriteriaOperator.OR
          ? results.some(Boolean)
          : results.every(Boolean);

      if (matched) matchedUserIds.push(agg.user_id);
    }
    // Replace segment members atomically
    await this.db.transaction(async (tx) => {
      await tx
        .delete(segment_members)
        .where(eq(segment_members.segment_id, id));

      if (matchedUserIds.length) {
        await tx.insert(segment_members).values(
          matchedUserIds.map((uid) => ({
            segment_id: id,
            user_id: uid,
            joined_at: now,
          })),
        );
      }
      await tx
        .update(customer_segments)
        .set({ member_count: matchedUserIds.length, last_recalculated_at: now })
        .where(eq(customer_segments.id, id));
    });
    return matchedUserIds.length;
  }
}
