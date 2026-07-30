import { Injectable } from '@nestjs/common';
import { SQL, sql, inArray, eq, lt, lte, gt, gte, and, or, ilike } from 'drizzle-orm';
import { products, product_categories } from '../../drizzle/schema/shop.schema.js';
import { FilterRuleType, FilterRuleOperator, FilterRuleNode } from '../../drizzle/types/types.js';

@Injectable()
export class FilterEvaluatorService {
  /**
   * Generates a Drizzle SQL WHERE expression from a FilterRuleNode tree
   * or a legacy array of flat rules.
   */
  evaluate(rules: FilterRuleNode | any[]): SQL | undefined {
    if (!rules) return undefined;

    // Backwards compatibility for old flat array
    if (Array.isArray(rules)) {
      if (rules.length === 0) return undefined;
      const expressions = rules
        .map(rule => this.evaluateNode({ type: 'rule', ...rule }))
        .filter(Boolean) as SQL[];
      return expressions.length > 0 ? and(...expressions) : undefined;
    }

    return this.evaluateNode(rules);
  }

  private evaluateNode(node: FilterRuleNode): SQL | undefined {
    if (node.type === 'group') {
      if (!node.children || node.children.length === 0) return undefined;
      
      const childExprs = node.children
        .map(child => this.evaluateNode(child))
        .filter(Boolean) as SQL[];

      if (childExprs.length === 0) return undefined;
      
      return node.operator === 'OR' ? or(...childExprs) : and(...childExprs);
    }

    if (node.type === 'rule') {
      return this.evaluateRule(node);
    }

    return undefined;
  }

  private evaluateRule(rule: FilterRuleNode): SQL | undefined {
    // If it's a rule that requires a value, ensure we have one, EXCEPT for ON_SALE which doesn't strictly need one
    if (rule.value === undefined || rule.value === null || rule.value === '') {
       if (rule.field !== FilterRuleType.ON_SALE) return undefined;
    }

    switch (rule.field) {
      case FilterRuleType.CATEGORY:
        if (rule.condition === FilterRuleOperator.IN && Array.isArray(rule.value) && rule.value.length > 0) {
          return inArray(
            products.id,
            sql`(SELECT product_id FROM product_categories WHERE category_id IN ${rule.value})`
          );
        } else if (rule.condition === FilterRuleOperator.EQ) {
          return inArray(
            products.id,
            sql`(SELECT product_id FROM product_categories WHERE category_id = ${rule.value})`
          );
        }
        break;

      case FilterRuleType.PRICE:
        if (typeof rule.value === 'number' || !isNaN(Number(rule.value))) {
          const numVal = Number(rule.value);
          const priceNumeric = sql`CAST(${products.base_price} AS NUMERIC)`;
          if (rule.condition === FilterRuleOperator.LT) return lt(priceNumeric, numVal);
          if (rule.condition === FilterRuleOperator.LTE) return lte(priceNumeric, numVal);
          if (rule.condition === FilterRuleOperator.GT) return gt(priceNumeric, numVal);
          if (rule.condition === FilterRuleOperator.GTE) return gte(priceNumeric, numVal);
          if (rule.condition === FilterRuleOperator.EQ) return eq(priceNumeric, numVal);
        }
        break;

      case FilterRuleType.SEARCH:
        if (rule.condition === FilterRuleOperator.CONTAINS && typeof rule.value === 'string') {
          return ilike(products.name, `%${rule.value}%`);
        }
        break;

      case FilterRuleType.CREATED_AT:
        if (rule.condition === FilterRuleOperator.WITHIN_DAYS && (typeof rule.value === 'number' || !isNaN(Number(rule.value)))) {
          const days = Number(rule.value);
          return sql`${products.created_at} >= NOW() - INTERVAL '${sql.raw(days.toString())} days'`;
        } else if (rule.condition === FilterRuleOperator.OLDER_THAN_DAYS && (typeof rule.value === 'number' || !isNaN(Number(rule.value)))) {
          const days = Number(rule.value);
          return sql`${products.created_at} <= NOW() - INTERVAL '${sql.raw(days.toString())} days'`;
        }
        break;

      case FilterRuleType.DISCOUNT:
      case FilterRuleType.ON_SALE:
        // Generic Discount/On Sale logic: compare_at_price > base_price
        const saleLogic = and(
          sql`${products.compare_at_price} IS NOT NULL`,
          sql`CAST(${products.compare_at_price} AS NUMERIC) > CAST(${products.base_price} AS NUMERIC)`,
          sql`(${products.sale_starts_at} IS NULL OR ${products.sale_starts_at} <= NOW())`,
          sql`(${products.sale_ends_at} IS NULL OR ${products.sale_ends_at} >= NOW())`
        );
        return saleLogic;
    }

    return undefined;
  }
}
