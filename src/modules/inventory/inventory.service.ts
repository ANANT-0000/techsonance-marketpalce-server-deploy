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
  product_images,
  product_variants,
  productImageTypeEnum,
  products,
  warehouse,
} from 'src/drizzle/schema';
import { and, eq, sql } from 'drizzle-orm';
import { productImageType } from 'src/drizzle/types/types';
export const LOW_STOCK_THRESHOLD = 5; // configurable

@Injectable()
export class InventoryService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService,
    private readonly companyService: CompanyService,
  ) { }
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
      console.log(companyId);

      const rows = await this.db.query.inventory
        .findMany({
          where: eq(inventory.company_id, companyId),
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
                    address_line_2: true,
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
          console.log(error);
          throw new InternalServerErrorException('Failed to fetch inventory', {
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
        address_line_2: string | null;
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

      console.log('formattedInventory', formattedInventory);
      return formattedInventory;
    } catch (error) {
      if (
        error instanceof HttpException ||
        error instanceof InternalServerErrorException
      )
        throw error;
      throw new InternalServerErrorException('Failed to fetch inventory', {
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
    console.log('setStock started');
    const [existing] = await db
      .select({ id: inventory.id, stock_quantity: inventory.stock_quantity })
      .from(inventory)
      .where(
        and(
          eq(inventory.product_variant_id, productVariantId),
          eq(inventory.warehouse_id, warehouseId),
          eq(inventory.company_id, companyId),
        ),
      )
      .limit(1)
      .catch((error) => {
        throw new InternalServerErrorException('Failed to set stock', {
          cause: error,
        });
      });

    if (existing) {
      console.log('existing', existing);
      const updateResult = await db
        .update(inventory)
        .set({ stock_quantity: newQuantity })
        .where(eq(inventory.id, existing.id))
        .returning()
        .catch((error) => {
          throw new InternalServerErrorException('Failed to set stock', {
            cause: error,
          });
        });
      console.log('updateResult', updateResult);
      return updateResult;
    } else {
      console.log('insertResult started');
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
          throw new InternalServerErrorException('Failed to set stock', {
            cause: error,
          });
        });
      console.log('insertResult', insertResult);
      return insertResult;
    }
  }
  async updateStock(
    productVariantId: string,
    newQuantity: number,
    domain: string,
  ) {
    try {
      const companyId = await this.companyService.find(domain);
      console.log(
        'start updating stock',
        newQuantity,
        productVariantId,
        companyId,
      );
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
          throw new InternalServerErrorException('Failed to update stock', {
            cause: error,
          });
        });

      if (!inv) {
        throw new HttpException(
          'Inventory record not found',
          HttpStatus.NOT_FOUND,
        );
      }
      console.log('inventory', inv);
      // Use centralized method — syncs both tables
      await this.setStock(
        inv.product_variant_id,
        inv.warehouse_id,
        newQuantity,
        companyId,
      ).catch((error) => {
        throw new InternalServerErrorException('Failed to update stock', {
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
      throw new InternalServerErrorException('Failed to update stock', {
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
      console.log('deductStockForOrder ...');
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
      }
      console.log('deductStockForOrder completed');
    } catch (error) {
      if (
        error instanceof HttpException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to create inventory', {
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
      if (Array.isArray(orderLines)) {
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
        }
      } else {
        const [idv] = await tx
          .select({
            id: inventory.id,
            stock_quantity: inventory.stock_quantity,
          })
          .from(inventory)
          .where(
            and(
              eq(inventory.product_variant_id, orderLines.variantId),
              eq(inventory.company_id, companyId),
            ),
          )
          .limit(1);
        if (!idv) {
          throw new HttpException(
            `Inventory not found for variant ${orderLines.variantId}`,
            HttpStatus.NOT_FOUND,
          );
        }
        await tx
          .update(inventory)
          .set({
            stock_quantity: sql`${inventory.stock_quantity} + ${orderLines.quantity}`,
          })
          .where(
            and(
              eq(inventory.id, idv.id),
              eq(inventory.company_id, companyId),
              eq(inventory.product_variant_id, orderLines.variantId),
            ),
          );
      }
    } catch (error) {
      if (
        error instanceof HttpException ||
        error instanceof InternalServerErrorException
      ) {
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
