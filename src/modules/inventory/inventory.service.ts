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
import { inventory, product_variants } from 'src/drizzle/schema';
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

      const rows = await this.db.query.inventory.findMany({
        where: eq(inventory.company_id, companyId),
        with: {
          variant: {
            columns: {
              id: true,
              variant_name: true,
              sku: true,
              price: true,
              stock_quantity: true,
              status: true,
            },
            with: {
              images: {
                columns: { image_url: true, is_primary: true },
              },
            },
          },
          warehouse: {
            columns: { id: true, warehouse_name: true },
          },
        },
      });

      return rows.map((row) => ({
        ...row,
        isLowStock: row.stock_quantity <= LOW_STOCK_THRESHOLD,
        isOutOfStock: row.stock_quantity === 0,
      }));
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to create inventory', {
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
