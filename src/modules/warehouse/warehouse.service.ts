import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { DRIZZLE, type DrizzleService } from 'src/drizzle/drizzle.module';
import { CompanyService } from '../company/company.service';
import {
  updateWarehouseAddressDto,
  warehouseAddressDto,
} from './dto/warehouse.dto';
import { address, warehouse } from 'src/drizzle/schema';
import { and, eq } from 'drizzle-orm';

@Injectable()
export class WarehouseService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService,
    private readonly companyService: CompanyService,
  ) {}
  async create(warehouseAddressDto: warehouseAddressDto, domain: string) {
    try {
      const companyId = await this.companyService.find(domain);
      console.log('creating warehouse', warehouseAddressDto);
      return await this.db.transaction(async (tx) => {
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
        console.log('warehouse not exist');
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
        console.log('warehouse address created', addressResult);
        await tx.insert(warehouse).values({
          warehouse_name: warehouseAddressDto.name,
          company_id: companyId,
          address_id: addressId,
        });
        console.log('warehouse created');
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
      const companyId = await this.companyService.find(domain);
      return await this.db.query.warehouse
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
          console.log('warehouses', warehouses);
          return warehouses;
        })
        .catch((error) => {
          console.error('Error finding warehouses:', error);
          throw new InternalServerErrorException('Failed to find warehouses', {
            cause: error,
          });
        });
    } catch (error) {
      console.error('Error finding all warehouses:', error);
      throw new InternalServerErrorException('Failed to find warehouses', {
        cause: error,
      });
    }
  }
  async findOptions(domain: string) {
    try {
      const companyId = await this.companyService.find(domain);
      return await this.db.query.warehouse
        .findMany({
          where: eq(warehouse.company_id, companyId),
          columns: {
            id: true,
            warehouse_name: true,
          },
        })
        .then((warehouses) => {
          console.log('warehouses', warehouses);
          return warehouses;
        })
        .catch((error) => {
          console.error('Error finding warehouses:', error);
          throw new InternalServerErrorException('Failed to find warehouses', {
            cause: error,
          });
        });
    } catch (error) {
      console.error('Error finding all warehouses:', error);
      throw new InternalServerErrorException('Failed to find warehouses', {
        cause: error,
      });
    }
  }
  async findOne(id: string, domain: string) {
    try {
      const companyId = await this.companyService.find(domain);
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
    const companyId = await this.companyService.find(domain);
    console.log('updating warehouse', updateWarehouseAddressDto);
    try {
      const [existingWarehouse] = await this.db
        .select({ id: warehouse.id, address_id: warehouse.address_id })
        .from(warehouse)
        .where(and(eq(warehouse.company_id, companyId), eq(warehouse.id, id)));
      if (!existingWarehouse?.id) {
        throw new HttpException('Warehouse not found', HttpStatus.NOT_FOUND);
      }
      console.log('transaction starting', existingWarehouse);
      await this.db.transaction(async (tx) => {
        if (updateWarehouseDto.is_default) {
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
        console.log('address updated', addressUpdate);
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
        console.log('updated warehouse', updatedWarehouse);
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
      const companyId = await this.companyService.find(domain);
      console.log('deleting warehouse');
      const deleted = await this.db
        .delete(warehouse)
        .where(and(eq(warehouse.id, id), eq(warehouse.company_id, companyId)))
        .catch((error) => {
          console.error('Error deleting warehouse:', error);
          throw new InternalServerErrorException('Failed to delete warehouse', {
            cause: error,
          });
        });
      console.log('deleted warehouse', deleted);
      return deleted;
    } catch (error) {
      console.error('Error deleting warehouse:', error);
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
