import { sql, and, gte, lte, eq, desc } from 'drizzle-orm';
import {
  orders,
  order_items,
  product_variants,
  products,
  categories,
  refunds,
} from '../../drizzle/schema';
import { gst_invoices } from '../../drizzle/schema/finance.schema';
import { DrizzleService } from '../../drizzle/drizzle.module';
export type DashboardFilter = {
  companyId: string;
  startDate: Date;
  endDate: Date;
  db: DrizzleService;
};
export async function getVendorDashboardData({
  companyId,
  startDate,
  endDate,
  db,
}: DashboardFilter) {
    // Base filter matching your snake_case column definitions
  const baseFilter = and(
    eq(orders.company_id, companyId),
    gte(orders.created_at, startDate),
    lte(orders.created_at, endDate),
  );
  // 1A. Gross Revenue & Orders (From orders table)
  const [salesStats] = await db
    .select({
      grossRevenue: sql<number>`COALESCE(SUM(${orders.total_amount}), 0)::float`,
      totalOrders: sql<number>`COUNT(DISTINCT ${orders.id})::int`,
    })
    .from(orders)
    .where(baseFilter);
  // 1B. Tax Collected (From gst_invoices joined to orders)
  const [taxStats] = await db
    .select({
      taxCollected: sql<number>`COALESCE(SUM(${gst_invoices.total_tax}), 0)::float`,
    })
    .from(gst_invoices)
    .innerJoin(orders, eq(gst_invoices.order_id, orders.id))
    .where(baseFilter);
  // 1C. Refunds (From refunds table joined to orders)
  const [refundStats] = await db
    .select({
      refunds: sql<number>`COALESCE(SUM(${refunds.refund_amount}), 0)::float`,
    })
    .from(refunds)
    .innerJoin(orders, eq(refunds.order_id, orders.id))
    .where(baseFilter);
  // Compute Net Earnings
  const platformFees = 0; // Update this if you add platform_fee to your schema
  const netEarnings =
    salesStats.grossRevenue -
    taxStats.taxCollected -
    refundStats.refunds -
    platformFees;
  const summary = {
    grossRevenue: salesStats.grossRevenue,
    totalOrders: salesStats.totalOrders,
    taxCollected: taxStats.taxCollected,
    refunds: refundStats.refunds,
    platformFees,
    netEarnings,
  };
  // 2. Month-wise Revenue & Order Trend
  const monthlyTrend = await db
    .select({
      month: sql<string>`TO_CHAR(${orders.created_at}, 'Mon YYYY')`,
      sortDate: sql<string>`TO_CHAR(${orders.created_at}, 'YYYY-MM')`,
      revenue: sql<number>`COALESCE(SUM(${orders.total_amount}), 0)::float`,
      orders: sql<number>`COUNT(${orders.id})::int`,
    })
    .from(orders)
    .where(baseFilter)
    .groupBy(
      sql`TO_CHAR(${orders.created_at}, 'Mon YYYY')`,
      sql`TO_CHAR(${orders.created_at}, 'YYYY-MM')`,
    )
    .orderBy(sql`TO_CHAR(${orders.created_at}, 'YYYY-MM')`);
  // 3. Top Selling Products (SKUs)
  const topProducts = await db
    .select({
      sku: product_variants.sku,
      revenue: sql<number>`COALESCE(SUM(${order_items.price} * ${order_items.quantity}), 0)::float`,
    })
    .from(order_items)
    .innerJoin(orders, eq(order_items.order_id, orders.id))
    .innerJoin(
      product_variants,
      eq(order_items.product_variant_id, product_variants.id),
    )
    .where(baseFilter)
    .groupBy(product_variants.sku)
    .orderBy(desc(sql`SUM(${order_items.price} * ${order_items.quantity})`))
    .limit(5);
  // 4. Category-Wise Performance
  const categoryPerformance = await db
    .select({
      name: categories.name,
      value: sql<number>`COALESCE(SUM(${order_items.price} * ${order_items.quantity}), 0)::float`,
    })
    .from(order_items)
    .innerJoin(orders, eq(order_items.order_id, orders.id))
    .innerJoin(
      product_variants,
      eq(order_items.product_variant_id, product_variants.id),
    )
    .innerJoin(products, eq(product_variants.product_id, products.id)) // product_id is snake_case here
    .innerJoin(categories, eq(products.category_id, categories.id))
    .where(baseFilter)
    .groupBy(categories.name);
  
  return {
    summary,
    monthlyTrend,
    topProducts,
    categoryPerformance,
  };
}
