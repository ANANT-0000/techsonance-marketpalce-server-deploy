import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
// import { UpdateInventoryDto } from './dto/update-inventory.dto';
import { DRIZZLE, type DrizzleService } from '../../drizzle/drizzle.module';
import { CompanyService } from '../company/company.service';
import { CreateInventoryDto } from './dto/inventory.dto';
import {
  inventory,
  product_images,
  product_variants,
  productImageTypeEnum,
  products,
  warehouse,
} from '../../drizzle/schema';
import { and, asc, desc, eq, ilike, or, SQL, sql } from 'drizzle-orm';
import { productImageType } from '../../drizzle/types/types';
import { domainExtractor } from '../../common/filters/domainExtractor.filter';
import { InventoryErrorKeyEnum } from './constants/inventory.enums';
export const LOW_STOCK_THRESHOLD = 5; // configurable

@Injectable()
export class InventoryService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService,
    private readonly companyService: CompanyService,
  ) {}

  private async resolveCompanyId(domain: string): Promise<string> {
    const filteredDomain = domainExtractor(domain);
    return this.companyService.find(filteredDomain);
  }
  async create(dto: CreateInventoryDto, domain: string) {
    try {
      const companyId = await this.resolveCompanyId(domain);
      const [existingInventory] = await this.db
        .select({ id: inventory.id })
        .from(inventory)
        .where(
          and(
            eq(inventory.product_variant_id, dto.productVariantId),
            eq(inventory.warehouse_id, dto.warehouseId),
          ),
        )
        .limit(1);
      if (existingInventory) {
        // upsert — just increase quantity
        const [updated] = await this.db
          .update(inventory)
          .set({
            stock_quantity: sql`${inventory.stock_quantity} + ${dto.stockQuantity}`,
          })
          .where(eq(inventory.id, existingInventory.id))
          .returning();
        return updated;
      }
      const [created] = await this.db
        .insert(inventory)
        .values({
          product_variant_id: dto.productVariantId,
          warehouse_id: dto.warehouseId,
          stock_quantity: dto.stockQuantity,
          company_id: companyId,
        })
        .returning();
      return created;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(InventoryErrorKeyEnum.FAILED_TO_CREATE_INVENTORY, {
        cause: error,
      });
    }
  }

  async findAll(
    domain: string,
    filters?: {
      search: string;
      limit: number;
      offset: number;
      status: string | undefined;
      date: string;
      sortby: 'asc' | 'desc';
    },
  ) {
    try {
      const companyId = await this.resolveCompanyId(domain);

      // const whereClause: SQL[] = []
      // if (filters?.search) {
      //   whereClause.push(
      //     ilike(product_variants.variant_name, `%${filters.search.toLowerCase()}%`),
      //   )
      // }
      const rows = await this.db.query.inventory
        .findMany({
          where: eq(inventory.company_id, companyId),
          limit: filters?.limit ?? 10,
          offset: filters?.offset ?? 0,
          orderBy:
            filters?.sortby === 'desc'
              ? desc(inventory.created_at)
              : asc(inventory.created_at),
          columns: {
            id: true,
            stock_quantity: true,
            warehouse_id: true,
            product_variant_id: true,
            created_at: true,
          },
          with: {
            variant: {
              with: {
                product: {
                  columns: {
                    id: true,
                    category_id: true,
                  },
                },
                images: {
                  where: eq(product_images.imgType, productImageType.MAIN),
                  columns: {
                    image_url: true,
                  },
                },
              },
            },
            warehouse: {
              columns: {
                id: true,
                warehouse_name: true,
              },
              with: {
                address: {
                  columns: {
                    id: true,
                    name: true,
                    number: true,
                    address_type: true,
                    address_line_1: true,
      
                    street: true,
                    city: true,
                    state: true,
                    postal_code: true,
                    country: true,
                    landmark: true,
                    is_default: true,
                    created_at: true,
                  },
                },
              },
            },
          },
        })
        .catch((error) => {
          throw new InternalServerErrorException(InventoryErrorKeyEnum.FAILED_TO_FETCH_INVENTORY, {
            cause: error,
          });
        });
      const LOW_STOCK_THRESHOLD = 10;
      type AddressRecord = {
        id: string;
        name: string | null;
        number: string | null;
        address_type: string | null;
        address_line_1: string | null;
    
        street: string | null;
        city: string | null;
        state: string | null;
        postal_code: string | null;
        country: string | null;
        landmark: string | null;
        is_default: boolean | null;
        created_at: Date | string | null;
      };

      const variantMap = new Map<
        string,
        {
          variant_id: string;
          variant_name: string;
          variant_image: string | null;
          sku: string;
          price: string;
          total_stock: number;
          isLowStock: boolean;
          isOutOfStock: boolean;
          activeStatus: string;
          locations: {
            inventory_id: string;
            warehouse_id: string;
            warehouse_name: string | null;
            stock: number;
            address: AddressRecord | null;
          }[];
        }
      >();

      for (const row of rows) {
        const variant = row.variant;
        const warehouse = row.warehouse;
        const image = variant?.images?.[0]?.image_url ?? null;
        const stockQuantity = row.stock_quantity ?? 0;

        if (!variantMap.has(variant.id)) {
          variantMap.set(variant.id, {
            variant_id: variant.id,
            variant_name: variant.variant_name,
            variant_image: image,
            sku: variant.sku,
            price: variant.price,
            total_stock: 0,
            isLowStock: false,
            isOutOfStock: false,
            activeStatus: variant.status,
            locations: [],
          });
        }

        const groupedItem = variantMap.get(variant.id)!;

        groupedItem.total_stock += stockQuantity;
        groupedItem.isOutOfStock = groupedItem.total_stock === 0;
        groupedItem.isLowStock =
          groupedItem.total_stock > 0 &&
          groupedItem.total_stock <= LOW_STOCK_THRESHOLD;

        if (row.id && warehouse) {
          groupedItem.locations.push({
            inventory_id: row.id,
            warehouse_id: warehouse.id,
            warehouse_name: warehouse.warehouse_name,
            stock: stockQuantity,
            address: warehouse.address ?? null,
          });
        }
      }

      const formattedInventory = Array.from(variantMap.values());

      return formattedInventory;
    } catch (error) {
      if (
        error instanceof HttpException ||
        error instanceof InternalServerErrorException
      )
        throw error;
      throw new InternalServerErrorException(InventoryErrorKeyEnum.FAILED_TO_FETCH_INVENTORY, {
        cause: error,
      });
    }
  }

  async setStock(
    productVariantId: string,
    warehouseId: string,
    newQuantity: number,
    companyId: string,
    tx?: DrizzleService,
  ) {
    const db = tx ?? this.db;
    const [existing] = await db
      .select({ id: inventory.id, stock_quantity: inventory.stock_quantity })
      .from(inventory)
      .where(
        and(
          eq(inventory.product_variant_id, productVariantId),
          eq(inventory.warehouse_id, warehouseId),
        ),
      )
      .limit(1)
      .catch((error) => {
        throw new InternalServerErrorException(InventoryErrorKeyEnum.FAILED_TO_SET_STOCK, {
          cause: error,
        });
      });

    if (existing) {
      const updateResult = await db
        .update(inventory)
        .set({ stock_quantity: newQuantity, company_id: companyId })
        .where(eq(inventory.id, existing.id))
        .returning()
        .catch((error) => {
          throw new InternalServerErrorException(InventoryErrorKeyEnum.FAILED_TO_SET_STOCK, {
            cause: error,
          });
        });
      return updateResult;
    } else {
      const insertResult = await db
        .insert(inventory)
        .values({
          product_variant_id: productVariantId,
          warehouse_id: warehouseId,
          stock_quantity: newQuantity,
          company_id: companyId,
        })
        .returning()
        .catch((error) => {
          throw new InternalServerErrorException(InventoryErrorKeyEnum.FAILED_TO_SET_STOCK, {
            cause: error,
          });
        });
      return insertResult;
    }
  }
  async updateStock(
    productVariantId: string,
    newQuantity: number,
    domain: string,
  ) {
    try {
      const companyId = await this.resolveCompanyId(domain);
      const [inv] = await this.db
        .select({
          id: inventory.id,
          product_variant_id: inventory.product_variant_id,
          warehouse_id: inventory.warehouse_id,
        })
        .from(inventory)
        .where(
          and(
            eq(inventory.product_variant_id, productVariantId),
            eq(inventory.company_id, companyId),
          ),
        )
        .limit(1)
        .catch((error) => {
          throw new InternalServerErrorException(InventoryErrorKeyEnum.FAILED_TO_UPDATE_STOCK, {
            cause: error,
          });
        });

      if (!inv) {
        throw new HttpException(
          InventoryErrorKeyEnum.INVENTORY_RECORD_NOT_FOUND,
          HttpStatus.NOT_FOUND,
        );
      }
      // Use centralized method — syncs both tables
      await this.setStock(
        inv.product_variant_id,
        inv.warehouse_id,
        newQuantity,
        companyId,
      ).catch((error) => {
        throw new InternalServerErrorException(InventoryErrorKeyEnum.FAILED_TO_UPDATE_STOCK, {
          cause: error,
        });
      });

      return {
        inventoryId: inv.id,
        newQuantity,
        isLowStock: newQuantity <= LOW_STOCK_THRESHOLD,
      };
    } catch (error) {
      if (
        error instanceof HttpException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(InventoryErrorKeyEnum.FAILED_TO_UPDATE_STOCK, {
        cause: error,
      });
    }
  }
  async deductStockForOrder(
    orderLines: { variantId: string; quantity: number }[],
    companyId: string,
    tx: DrizzleService, // transaction context
  ) {
    try {
      const lines = orderLines.filter(l => l.variantId && l.variantId.trim() !== '');
      for (const line of lines) {
        const [updated] = await tx
          .update(inventory)
          .set({
            stock_quantity: sql`${inventory.stock_quantity} - ${line.quantity}`,
          })
          .where(
            and(
              eq(inventory.product_variant_id, line.variantId),
              eq(inventory.company_id, companyId),
              sql`${inventory.stock_quantity} >= ${line.quantity}`,
            ),
          )
          .returning({
            id: inventory.id,
            stock_quantity: inventory.stock_quantity,
          });

        if (!updated) {
          // If no row was updated, it means either inventory doesn't exist OR stock is insufficient.
          // Let's do a quick select to determine the exact error to throw.
          const [idv] = await tx
            .select({
              id: inventory.id,
              stock_quantity: inventory.stock_quantity,
            })
            .from(inventory)
            .where(
              and(
                eq(inventory.product_variant_id, line.variantId),
                eq(inventory.company_id, companyId),
              ),
            )
            .limit(1);

          if (!idv) {
            throw new HttpException(
              `Inventory not found for variant ${line.variantId}`,
              HttpStatus.NOT_FOUND,
            );
          } else {
            throw new HttpException(
              `Insufficient stock for variant ${line.variantId}. Available: ${idv.stock_quantity}, requested: ${line.quantity}`,
              HttpStatus.BAD_REQUEST,
            );
          }
        }
      }
    } catch (error) {
      if (
        error instanceof HttpException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(InventoryErrorKeyEnum.FAILED_TO_CREATE_INVENTORY, {
        cause: error,
      });
    }
  }

  async rollbackStockForOrder(
    orderLines:
      | { variantId: string; quantity: number }[]
      | { variantId: string; quantity: number },
    companyId: string,
    tx: DrizzleService,
  ) {
    try {
      const rawLines = Array.isArray(orderLines) ? orderLines : [orderLines];
      const lines = rawLines.filter(l => l.variantId && l.variantId.trim() !== '');
      for (const line of lines) {
        const [updated] = await tx
          .update(inventory)
          .set({
            stock_quantity: sql`${inventory.stock_quantity} + ${line.quantity}`,
          })
          .where(
            and(
              eq(inventory.product_variant_id, line.variantId),
              eq(inventory.company_id, companyId),
            ),
          )
          .returning({
            id: inventory.id,
          });

        if (!updated) {
          throw new HttpException(
            `Inventory not found for variant ${line.variantId}`,
            HttpStatus.NOT_FOUND,
          );
        }
      }
    } catch (error) {
      if (
        error instanceof HttpException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(InventoryErrorKeyEnum.FAILED_TO_CREATE_INVENTORY, {
        cause: error,
      });
    }
  }
  async remove(id: string, domain: string) {
    try {
      const companyId = await this.resolveCompanyId(domain);
      const [existing] = await this.db
        .select({ id: inventory.id })
        .from(inventory)
        .where(and(eq(inventory.id, id), eq(inventory.company_id, companyId)));
      if (!existing) {
        throw new HttpException(
          InventoryErrorKeyEnum.INVENTORY_RECORD_NOT_FOUND,
          HttpStatus.NOT_FOUND,
        );
      }
      await this.db
        .delete(inventory)
        .where(and(eq(inventory.id, id), eq(inventory.company_id, companyId)));
      return { message: 'Inventory record removed' };
    } catch (error) {
      throw new InternalServerErrorException(InventoryErrorKeyEnum.FAILED_TO_REMOVE_INVENTORY, {
        cause: error,
      });
    }
  }

  async getLowStockAlerts(domain: string) {
    try {
      const companyId = await this.resolveCompanyId(domain);
      // Using the threshold defined at the top of your service
      const threshold = LOW_STOCK_THRESHOLD;

      const alerts = await this.db
        .select({
          variant_id: product_variants.id,
          variant_name: product_variants.variant_name,
          sku: product_variants.sku,
          currentStock: sql<number>`CAST(SUM(${inventory.stock_quantity}) AS INTEGER)`,
          isOutOfStock: sql<boolean>`(SUM(${inventory.stock_quantity}) = 0)`,
          severity: sql<string>`CASE WHEN SUM(${inventory.stock_quantity}) = 0 THEN 'out_of_stock' WHEN SUM(${inventory.stock_quantity}) <= ${threshold} THEN 'low_stock'  ELSE 'in_stock' END`,
          warehouseName: warehouse.warehouse_name,
        })
        .from(inventory)
        .innerJoin(
          product_variants,
          eq(inventory.product_variant_id, product_variants.id),
        )
        .innerJoin(warehouse, eq(inventory.warehouse_id, warehouse.id))
        .where(eq(inventory.company_id, companyId))
        .groupBy(
          product_variants.id,
          product_variants.variant_name,
          product_variants.sku,
          warehouse.warehouse_name,
        )
        // Filter directly in SQL to only return items at or below the threshold
        .having(sql`SUM(${inventory.stock_quantity}) <= ${threshold}`);

      return alerts;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException(
        InventoryErrorKeyEnum.FAILED_TO_FETCH_LOW_STOCK_ALERTS,
        {
          cause: error,
        },
      );
    }
  }
}
