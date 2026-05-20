import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { DRIZZLE, type DrizzleService } from '../../drizzle/drizzle.module';
import { CompanyService } from '../company/company.service';
import {
  updateWarehouseAddressDto,
  warehouseAddressDto,
} from './dto/warehouse.dto';
import { address, warehouse } from '../../drizzle/schema';
import { and, eq } from 'drizzle-orm';
import { domainExtractor } from '../../common/filters/domainExtractor.filter';

@Injectable()
export class WarehouseService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService,
    private readonly companyService: CompanyService,
  ) {}

  private async resolveCompanyId(domain: string): Promise<string> {
    console.log(
      `[WarehouseService.resolveCompanyId] Resolving company for domain: ${domain}`,
    );
    const filteredDomain = domainExtractor(domain);
    console.log(
      `[WarehouseService.resolveCompanyId] Extracted filter domain: ${filteredDomain}`,
    );
    console.log(
      '[WarehouseService.resolveCompanyId] Querying CompanyService.find(...)',
    );
    return this.companyService.find(filteredDomain);
  }

  async create(warehouseAddressDto: warehouseAddressDto, domain: string) {
    try {
      console.log('[WarehouseService.create] Request received', {
        domain,
        warehouseName: warehouseAddressDto.name,
        isDefault: warehouseAddressDto.is_default,
      });
      console.log('[WarehouseService.create] Resolving company id');
      const companyId = await this.resolveCompanyId(domain);
      console.log(
        '[WarehouseService.create] Starting warehouse creation transaction',
      );
      return await this.db.transaction(async (tx) => {
        console.log(
          '[WarehouseService.create] Checking for existing warehouse',
        );
        const [existingWarehouse] = await tx
          .select({ id: warehouse.id })
          .from(warehouse)
          .where(
            and(
              eq(warehouse.company_id, companyId),
              eq(warehouse.warehouse_name, warehouseAddressDto.name),
            ),
          );
        if (existingWarehouse?.id) {
          throw new HttpException(
            'Warehouse with the same name already exists',
            HttpStatus.BAD_REQUEST,
          );
        }
        if (warehouseAddressDto.is_default) {
          console.log(
            '[WarehouseService.create] Resetting previous default addresses',
          );
          await tx
            .update(address)
            .set({ is_default: false })
            .where(eq(address.company_id, companyId))
            .returning()
            .catch((error) => {
              console.error('Error updating default address:', error);
              throw new InternalServerErrorException(
                'Failed to update default address',
                { cause: error },
              );
            });
        }
        console.log('[WarehouseService.create] Inserting warehouse address');
        const [addressResult] = await tx
          .insert(address)
          .values({
            is_default: warehouseAddressDto.is_default,
            name: warehouseAddressDto.name,
            number: warehouseAddressDto.phone,
            address_type: warehouseAddressDto.address_for,
            address_line_1: warehouseAddressDto.address_line_1,
            address_line_2: warehouseAddressDto.address_line_2,
            street: warehouseAddressDto.street,
            city: warehouseAddressDto.city,
            state: warehouseAddressDto.state,
            postal_code: warehouseAddressDto.postal_code,
            country: warehouseAddressDto.country,
            landmark: warehouseAddressDto.landmark,
            company_id: companyId,
          })
          .returning({ id: address.id });
        const addressId = addressResult.id;
        console.log(
          '[WarehouseService.create] Warehouse address created successfully',
        );
        console.log('[WarehouseService.create] Inserting warehouse record');
        await tx.insert(warehouse).values({
          warehouse_name: warehouseAddressDto.name,
          company_id: companyId,
          address_id: addressId,
        });
        console.log(
          '[WarehouseService.create] Warehouse creation completed successfully',
        );
        return {
          message: 'Warehouse created successfully',
        };
      });
    } catch (error) {
      console.error('Error creating warehouse:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to create warehouse', {
        cause: error,
      });
    }
  }

  async findAll(domain: string) {
    try {
      console.log('[WarehouseService.findAll] Request received', { domain });
      console.log('[WarehouseService.findAll] Resolving company id');
      const companyId = await this.resolveCompanyId(domain);
      console.log(
        `[WarehouseService.findAll] Querying warehouses for company_id: ${companyId}`,
      );
      const warehouses = await this.db.query.warehouse
        .findMany({
          where: eq(warehouse.company_id, companyId),
          columns: {
            id: true,
            warehouse_name: true,
          },
          with: {
            address: true,
          },
        })
        .then((warehouses) => {
          console.log(
            `[WarehouseService.findAll] Retrieved ${warehouses.length} warehouse(s)`,
          );
          return warehouses;
        })
        .catch((error) => {
          console.error('Error finding warehouses:', error);
          throw new InternalServerErrorException('Failed to find warehouses', {
            cause: error,
          });
        });
      return warehouses;
    } catch (error) {
      console.error('Error finding all warehouses:', error);
      throw new InternalServerErrorException('Failed to find warehouses', {
        cause: error,
      });
    }
  }
  async findOptions(domain: string) {
    try {
      console.log('[WarehouseService.findOptions] Request received', {
        domain,
      });
      console.log('[WarehouseService.findOptions] Resolving company id');
      const companyId = await this.resolveCompanyId(domain);
      console.log(
        `[WarehouseService.findOptions] Querying warehouse options for company_id: ${companyId}`,
      );
      const warehouses = await this.db.query.warehouse
        .findMany({
          where: eq(warehouse.company_id, companyId),
          columns: {
            id: true,
            warehouse_name: true,
          },
        })
        .then((warehouses) => {
          console.log(
            `[WarehouseService.findOptions] Retrieved ${warehouses.length} warehouse option(s)`,
          );
          return warehouses;
        })
        .catch((error) => {
          console.error('Error finding warehouses:', error);
          throw new InternalServerErrorException('Failed to find warehouses', {
            cause: error,
          });
        });
      return warehouses;
    } catch (error) {
      console.error('Error finding all warehouses:', error);
      throw new InternalServerErrorException('Failed to find warehouses', {
        cause: error,
      });
    }
  }
  async findOne(id: string, domain: string) {
    try {
      console.log('[WarehouseService.findOne] Request received', {
        id,
        domain,
      });
      console.log('[WarehouseService.findOne] Resolving company id');
      const companyId = await this.resolveCompanyId(domain);
      console.log(
        `[WarehouseService.findOne] Querying warehouse: ${id} for company_id: ${companyId}`,
      );
      const warehouseRecord = await this.db.query.warehouse
        .findFirst({
          where: and(eq(warehouse.id, id), eq(warehouse.company_id, companyId)),
          columns: {
            id: true,
            warehouse_name: true,
          },
          with: {
            address: true,
          },
        })
        .catch((error) => {
          console.error('Error finding warehouse:', error);
          throw new InternalServerErrorException('Failed to find warehouse', {
            cause: error,
          });
        });
      console.log('[WarehouseService.findOne] Warehouse lookup completed');
      return warehouseRecord;
    } catch (error) {
      console.error('Error finding warehouse:', error);
      if (
        error instanceof HttpException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to find warehouse', {
        cause: error,
      });
    }
  }
  async update(
    id: string,
    updateWarehouseDto: updateWarehouseAddressDto,
    domain: string,
  ) {
    const filteredDomain = domainExtractor(domain);
    console.log('[WarehouseService.update] Request received', {
      id,
      domain,
      warehouseName: updateWarehouseDto.name,
    });
    console.log('[WarehouseService.update] Resolving company id');
    const companyId = await this.companyService.find(filteredDomain);
    console.log(
      '[WarehouseService.update] Starting warehouse update transaction',
    );
    try {
      const [existingWarehouse] = await this.db
        .select({ id: warehouse.id, address_id: warehouse.address_id })
        .from(warehouse)
        .where(and(eq(warehouse.company_id, companyId), eq(warehouse.id, id)));
      if (!existingWarehouse?.id) {
        throw new HttpException('Warehouse not found', HttpStatus.NOT_FOUND);
      }
      console.log('[WarehouseService.update] Existing warehouse resolved');
      await this.db.transaction(async (tx) => {
        if (updateWarehouseDto.is_default) {
          console.log(
            '[WarehouseService.update] Resetting default address before update',
          );
          await tx
            .update(address)
            .set({ is_default: false })
            .where(
              (eq(address.company_id, companyId),
              eq(address.id, existingWarehouse.address_id)),
            )
            .returning()
            .catch((error) => {
              console.error('Error updating default address:', error);
              throw new InternalServerErrorException(
                'Failed to update default address',
                { cause: error },
              );
            });
        }
        const addressUpdate = await tx
          .update(address)
          .set({
            name: updateWarehouseDto.name,
            number: updateWarehouseDto.phone,
            address_type: updateWarehouseDto.address_for,
            address_line_1: updateWarehouseDto.address_line_1,
            address_line_2: updateWarehouseDto.address_line_2,
            street: updateWarehouseDto.street,
            city: updateWarehouseDto.city,
            state: updateWarehouseDto.state,
            postal_code: updateWarehouseDto.postal_code,
            country: updateWarehouseDto.country,
            landmark: updateWarehouseDto.landmark,
          })
          .where(eq(address.id, existingWarehouse.address_id))
          .returning({ id: address.id })
          .catch((error) => {
            console.error('Error updating address:', error);
            throw new InternalServerErrorException('Failed to update address', {
              cause: error,
            });
          });
        console.log(
          '[WarehouseService.update] Address updated successfully',
          addressUpdate,
        );
        const updatedWarehouse = await tx
          .update(warehouse)
          .set({
            warehouse_name: updateWarehouseDto.name,
          })
          .where(
            and(
              eq(warehouse.id, id),
              eq(warehouse.company_id, companyId),
              eq(warehouse.address_id, existingWarehouse.address_id),
            ),
          )
          .catch((error) => {
            console.error('Error updating warehouse:', error);
            throw new InternalServerErrorException(
              'Failed to update warehouse',
              {
                cause: error,
              },
            );
          });
        console.log(
          '[WarehouseService.update] Warehouse updated successfully',
          updatedWarehouse,
        );
        return {
          message: 'Warehouse updated successfully',
        };
      });
    } catch (error) {
      console.error('Error updating warehouse:', error);
      if (
        error instanceof HttpException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to update warehouse', {
        cause: error,
      });
    }
  }

  async remove(id: string, domain: string) {
    try {
      console.log('[WarehouseService.remove] Request received', { id, domain });
      console.log('[WarehouseService.remove] Resolving company id');
      const companyId = await this.resolveCompanyId(domain);
      console.log(
        `[WarehouseService.remove] Deleting warehouse: ${id} for company_id: ${companyId}`,
      );
      const deleted = await this.db
        .delete(warehouse)
        .where(and(eq(warehouse.id, id), eq(warehouse.company_id, companyId)))
        .catch((error) => {
          console.error('Error deleting warehouse:', error);
          throw new InternalServerErrorException('Failed to delete warehouse', {
            cause: error,
          });
        });
      console.log('[WarehouseService.remove] Warehouse deleted successfully');
      return deleted;
    } catch (error) {
      console.error(
        '[WarehouseService.remove] Error deleting warehouse:',
        error,
      );
      if (
        error instanceof HttpException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to delete warehouse', {
        cause: error,
      });
    }
  }
}
