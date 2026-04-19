import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
// import { UpdateInventoryDto } from './dto/update-inventory.dto';
import { DRIZZLE, type DrizzleService } from 'src/drizzle/drizzle.module';
import { CompanyService } from '../company/company.service';
import { CreateInventoryDto } from './dto/inventory.dto';
import {
  inventory,
  product_variants,
  products,
  warehouse,
} from 'src/drizzle/schema';
import { and, eq, sql } from 'drizzle-orm';
export const LOW_STOCK_THRESHOLD = 5; // configurable

@Injectable()
export class InventoryService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService,
    private readonly companyService: CompanyService,
  ) {}
  async create(dto: CreateInventoryDto, domain: string) {
    try {
      const companyId = await this.companyService.find(domain);
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
      throw new InternalServerErrorException('Failed to create inventory', {
        cause: error,
      });
    }
  }

  async findAll(domain: string) {
    try {
      const companyId = await this.companyService.find(domain);

      const rows = await this.db
        .select({
          // Variant fields
          variant_id: product_variants.id,
          variant_name: product_variants.variant_name,
          sku: product_variants.sku,
          price: product_variants.price,
          stock_quantity: product_variants.stock_quantity, // global stock on variant
          // Inventory fields (nullable — leftJoin)
          inventory_record_id: inventory.id,
          warehouse_stock: inventory.stock_quantity,
          warehouse_id: inventory.warehouse_id,
          // Warehouse fields (nullable — leftJoin)
          warehouse_name: warehouse.warehouse_name,
        })
        .from(product_variants)
        .innerJoin(products, eq(product_variants.product_id, products.id))
        .leftJoin(
          inventory,
          and(
            eq(product_variants.id, inventory.product_variant_id),
            eq(inventory.company_id, companyId),
          ),
        )
        .leftJoin(warehouse, eq(inventory.warehouse_id, warehouse.id))
        .where(eq(products.company_id, companyId)); // ← scope to this company only

      // Group flat rows by variant_id
      const variantMap = new Map<
        string,
        {
          variant_id: string;
          variant_name: string;
          sku: string;
          price: string;
          total_stock: number | null;
          isLowStock: boolean;
          isOutOfStock: boolean;
          locations: {
            inventory_id: string;
            warehouse_id: string;
            warehouse_name: string | null;
            stock: number;
          }[];
        }
      >();

      for (const row of rows) {
        if (!variantMap.has(row.variant_id)) {
          variantMap.set(row.variant_id, {
            variant_id: row.variant_id,
            variant_name: row.variant_name,
            sku: row.sku,
            price: row.price,
            total_stock: row.stock_quantity,
            isLowStock: (row.stock_quantity ?? 0) <= LOW_STOCK_THRESHOLD,
            isOutOfStock:
              row.stock_quantity === 0 || row.stock_quantity === null,
            locations: [],
          });
        }

        // Only push a location entry if an inventory record exists for this row
        if (row?.inventory_record_id && row.warehouse_id) {
          variantMap.get(row.variant_id)!.locations.push({
            inventory_id: row.inventory_record_id,
            warehouse_id: row.warehouse_id,
            warehouse_name: row.warehouse_name,
            stock: row.warehouse_stock ?? 0,
          });
        }
      }

      return Array.from(variantMap.values());
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException('Failed to fetch inventory', {
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
      for (const line of orderLines) {
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
        }
        if (idv.stock_quantity < line.quantity) {
          throw new HttpException(
            `Insufficient stock for variant ${line.variantId}`,
            HttpStatus.BAD_REQUEST,
          );
        }
        await tx
          .update(inventory)
          .set({
            stock_quantity: sql`${inventory.stock_quantity} - ${line.quantity}`,
          })
          .where(
            and(
              eq(inventory.id, idv.id),
              eq(inventory.company_id, companyId),
              eq(inventory.product_variant_id, line.variantId),
            ),
          );
        await tx
          .update(product_variants)
          .set({
            stock_quantity: sql`${product_variants.stock_quantity} - ${line.quantity}`,
          })
          .where(eq(product_variants.id, line.variantId));
      }
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to create inventory', {
        cause: error,
      });
    }
  }
  async rollbackStockForOrder(
    orderLines: { variantId: string; quantity: number }[],
    companyId: string,
    tx: DrizzleService,
  ) {
    try {
      for (const line of orderLines) {
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
        }
        await tx
          .update(inventory)
          .set({
            stock_quantity: sql`${inventory.stock_quantity} + ${line.quantity}`,
          })
          .where(
            and(
              eq(inventory.id, idv.id),
              eq(inventory.company_id, companyId),
              eq(inventory.product_variant_id, line.variantId),
            ),
          );
        await tx
          .update(product_variants)
          .set({
            stock_quantity: sql`${product_variants.stock_quantity} + ${line.quantity}`,
          })
          .where(eq(product_variants.id, line.variantId));
      }
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to create inventory', {
        cause: error,
      });
    }
  }
  async updateStock(inventoryId: string, newQuantity: number, domain: string) {
    try {
      const companyId = await this.companyService.find(domain);

      const [inv] = await this.db
        .select({
          id: inventory.id,
          product_variant_id: inventory.product_variant_id,
        })
        .from(inventory)
        .where(
          and(
            eq(inventory.id, inventoryId),
            eq(inventory.company_id, companyId),
          ),
        )
        .limit(1);

      if (!inv) {
        throw new HttpException(
          'Inventory record not found',
          HttpStatus.NOT_FOUND,
        );
      }

      const [updated] = await this.db
        .update(inventory)
        .set({ stock_quantity: newQuantity })
        .where(eq(inventory.id, inventoryId))
        .returning();

      // Sync variant table
      await this.db
        .update(product_variants)
        .set({ stock_quantity: newQuantity })
        .where(eq(product_variants.id, inv.product_variant_id));

      return {
        ...updated,
        isLowStock: updated.stock_quantity <= LOW_STOCK_THRESHOLD,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to create inventory', {
        cause: error,
      });
    }
  }
  async remove(id: string, domain: string) {
    try {
      const companyId = await this.companyService.find(domain);
      const [existing] = await this.db
        .select({ id: inventory.id })
        .from(inventory)
        .where(and(eq(inventory.id, id), eq(inventory.company_id, companyId)));
      if (!existing) {
        throw new HttpException(
          'Inventory record not found',
          HttpStatus.NOT_FOUND,
        );
      }
      await this.db
        .delete(inventory)
        .where(and(eq(inventory.id, id), eq(inventory.company_id, companyId)));
      return { message: 'Inventory record removed' };
    } catch (error) {
      throw new InternalServerErrorException('Failed to remove inventory', {
        cause: error,
      });
    }
  }
}
