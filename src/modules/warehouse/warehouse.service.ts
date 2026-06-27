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
import { ShiprocketAddPickupAddres } from '../../common/Types/shiprocket';
import {
  address,
  warehouse,
  company,
  user,
  user_and_company,
} from '../../drizzle/schema';
import { and, eq } from 'drizzle-orm';
import { domainExtractor } from '../../common/filters/domainExtractor.filter';
import { WarehouseErrorKeyEnum } from './constants/warehouse.enums';
import { ShipRocketService } from '../ship-rocket/ship-rocket.service';
import { CryptoService } from '../shipping/crypto.service';

@Injectable()
export class WarehouseService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService,
    private readonly companyService: CompanyService,
    private readonly shipRocketService: ShipRocketService,
    private readonly cryptoService: CryptoService,
  ) {}

  private async resolveCompanyId(domain: string): Promise<string> {
    const filteredDomain = domainExtractor(domain);
    return this.companyService.find(filteredDomain);
  }

  async create(warehouseAddressDto: warehouseAddressDto, domain: string) {
    try {
      const companyId = await this.resolveCompanyId(domain);
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
            WarehouseErrorKeyEnum.WAREHOUSE_WITH_THE_SAME_NAME_ALREADY_EXISTS,
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
              throw new InternalServerErrorException(
                WarehouseErrorKeyEnum.FAILED_TO_UPDATE_DEFAULT_ADDRESS,
                { cause: error },
              );
            });
        }
        const [addressResult] = await tx
          .insert(address)
          .values({
            is_default: warehouseAddressDto.is_default,
            name: warehouseAddressDto.name,
            number: warehouseAddressDto.phone,
            address_type: warehouseAddressDto.address_for,
            address_line_1: warehouseAddressDto.address_line_1,
            street: warehouseAddressDto.street,
            city: warehouseAddressDto.city,
            state: warehouseAddressDto.state,
            postal_code: warehouseAddressDto.postal_code,
            country: warehouseAddressDto.country,
            landmark: warehouseAddressDto.landmark,
            company_id: companyId,
            pickup_location: warehouseAddressDto.name.slice(0, 36),
          })
          .returning({ id: address.id });
        const addressId = addressResult.id;
        await tx.insert(warehouse).values({
          warehouse_name: warehouseAddressDto.name,
          company_id: companyId,
          address_id: addressId,
        });

        if (warehouseAddressDto.is_default) {
          const shiprocketPayload: ShiprocketAddPickupAddres = {
            pickup_location: warehouseAddressDto.name.slice(0, 36),
            name: warehouseAddressDto.name,
            email: '', // will be resolved inside service
            phone: Number(warehouseAddressDto.phone),
            address: warehouseAddressDto.address_line_1,
            address_2: warehouseAddressDto.street + (warehouseAddressDto.landmark ? ', ' + warehouseAddressDto.landmark : ''),
            city: warehouseAddressDto.city,
            state: warehouseAddressDto.state,
            country: warehouseAddressDto.country,
            pin_code: Number(warehouseAddressDto.postal_code),
          };
          await this.registerWarehouseWithShiprocket(companyId, warehouseAddressDto.name, shiprocketPayload, tx);
        }

        return {
          message: 'Warehouse created successfully',
        };
      });
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        WarehouseErrorKeyEnum.FAILED_TO_CREATE_WAREHOUSE,
        {
          cause: error,
        },
      );
    }
  }

  async findAll(domain: string) {
    try {
      const companyId = await this.resolveCompanyId(domain);
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
          return warehouses;
        })
        .catch((error) => {
          throw new InternalServerErrorException(
            WarehouseErrorKeyEnum.FAILED_TO_FIND_WAREHOUSES,
            {
              cause: error,
            },
          );
        });
      return warehouses;
    } catch (error) {
      throw new InternalServerErrorException(
        WarehouseErrorKeyEnum.FAILED_TO_FIND_WAREHOUSES,
        {
          cause: error,
        },
      );
    }
  }
  async findOptions(domain: string) {
    try {
      const companyId = await this.resolveCompanyId(domain);
      const warehouses = await this.db.query.warehouse
        .findMany({
          where: eq(warehouse.company_id, companyId),
          columns: {
            id: true,
            warehouse_name: true,
          },
        })
        .then((warehouses) => {
          return warehouses;
        })
        .catch((error) => {
          throw new InternalServerErrorException(
            WarehouseErrorKeyEnum.FAILED_TO_FIND_WAREHOUSES,
            {
              cause: error,
            },
          );
        });
      return warehouses;
    } catch (error) {
      throw new InternalServerErrorException(
        WarehouseErrorKeyEnum.FAILED_TO_FIND_WAREHOUSES,
        {
          cause: error,
        },
      );
    }
  }
  async findOne(id: string, domain: string) {
    try {
      const companyId = await this.resolveCompanyId(domain);
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
          throw new InternalServerErrorException(
            WarehouseErrorKeyEnum.FAILED_TO_FIND_WAREHOUSE,
            {
              cause: error,
            },
          );
        });
      return warehouseRecord;
    } catch (error) {
      if (
        error instanceof HttpException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        WarehouseErrorKeyEnum.FAILED_TO_FIND_WAREHOUSE,
        {
          cause: error,
        },
      );
    }
  }
  async update(
    id: string,
    updateWarehouseDto: updateWarehouseAddressDto,
    domain: string,
  ) {
    const filteredDomain = domainExtractor(domain);
    const companyId = await this.companyService.find(filteredDomain);
    try {
      const [existingWarehouse] = await this.db
        .select({
          id: warehouse.id,
          address_id: warehouse.address_id,
          warehouse_name: warehouse.warehouse_name,
        })
        .from(warehouse)
        .where(and(eq(warehouse.company_id, companyId), eq(warehouse.id, id)));
      if (!existingWarehouse?.id) {
        throw new HttpException(
          WarehouseErrorKeyEnum.WAREHOUSE_NOT_FOUND,
          HttpStatus.NOT_FOUND,
        );
      }
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
              throw new InternalServerErrorException(
                WarehouseErrorKeyEnum.FAILED_TO_UPDATE_DEFAULT_ADDRESS,
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

            street: updateWarehouseDto.street,
            city: updateWarehouseDto.city,
            state: updateWarehouseDto.state,
            postal_code: updateWarehouseDto.postal_code,
            country: updateWarehouseDto.country,
            landmark: updateWarehouseDto.landmark,
            pickup_location: updateWarehouseDto.name?.slice(0, 36),
          })
          .where(eq(address.id, existingWarehouse.address_id))
          .returning({ id: address.id })
          .catch((error) => {
            throw new InternalServerErrorException(
              WarehouseErrorKeyEnum.FAILED_TO_UPDATE_ADDRESS,
              {
                cause: error,
              },
            );
          });
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
            throw new InternalServerErrorException(
              WarehouseErrorKeyEnum.FAILED_TO_UPDATE_WAREHOUSE,
              {
                cause: error,
              },
            );
          });

        const isDefault =
          updateWarehouseDto.is_default !== undefined
            ? updateWarehouseDto.is_default
            : await tx
                .select({ is_default: address.is_default })
                .from(address)
                .where(eq(address.id, existingWarehouse.address_id))
                .limit(1)
                .then(([r]) => r?.is_default ?? false);

        if (isDefault) {
          const [currentAddress] = await tx
            .select()
            .from(address)
            .where(eq(address.id, existingWarehouse.address_id))
            .limit(1);

          const mergedAddress = {
            name: updateWarehouseDto.name ?? currentAddress.name ?? '',
            phone: updateWarehouseDto.phone ?? currentAddress.number ?? '',
            address_line_1:
              updateWarehouseDto.address_line_1 ??
              currentAddress.address_line_1 ??
              '',
            street: updateWarehouseDto.street ?? currentAddress.street ?? '',
            city: updateWarehouseDto.city ?? currentAddress.city ?? '',
            state: updateWarehouseDto.state ?? currentAddress.state ?? '',
            country: updateWarehouseDto.country ?? currentAddress.country ?? '',
            postal_code:
              updateWarehouseDto.postal_code ??
              currentAddress.postal_code ??
              '',
            landmark:
              updateWarehouseDto.landmark ?? currentAddress.landmark ?? '',
          };

          if (isDefault) {
              const shiprocketPayload: ShiprocketAddPickupAddres = {
                pickup_location: (updateWarehouseDto.name ?? existingWarehouse.warehouse_name).slice(0, 36),
                name: updateWarehouseDto.name ?? existingWarehouse.warehouse_name,
                email: '', // resolved inside service
                phone: Number(mergedAddress.phone),
                address: mergedAddress.address_line_1,
                address_2: mergedAddress.street + (mergedAddress.landmark ? ', ' + mergedAddress.landmark : ''),
                city: mergedAddress.city,
                state: mergedAddress.state,
                country: mergedAddress.country,
                pin_code: Number(mergedAddress.postal_code),
              };
              await this.registerWarehouseWithShiprocket(companyId, updateWarehouseDto.name ?? existingWarehouse.warehouse_name, shiprocketPayload, tx);
            }
        }

        return {
          message: 'Warehouse updated successfully',
        };
      });
    } catch (error) {
      if (
        error instanceof HttpException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        WarehouseErrorKeyEnum.FAILED_TO_UPDATE_WAREHOUSE,
        {
          cause: error,
        },
      );
    }
  }

  async remove(id: string, domain: string) {
    try {
      const companyId = await this.resolveCompanyId(domain);
      const deleted = await this.db
        .delete(warehouse)
        .where(and(eq(warehouse.id, id), eq(warehouse.company_id, companyId)))
        .catch((error) => {
          throw new InternalServerErrorException(
            WarehouseErrorKeyEnum.FAILED_TO_DELETE_WAREHOUSE,
            {
              cause: error,
            },
          );
        });
      return deleted;
    } catch (error) {
      if (
        error instanceof HttpException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        WarehouseErrorKeyEnum.FAILED_TO_DELETE_WAREHOUSE,
        {
          cause: error,
        },
      );
    }
  }

  private async registerWarehouseWithShiprocket(
      companyId: string,
      warehouseName: string,
      addressDetails: ShiprocketAddPickupAddres,
      tx: DrizzleService,
    ) {
    const comp = await tx.query.company.findFirst({
      where: eq(company.id, companyId),
    });
    if (!comp) return;

    let credentials: { email?: string; password?: string } | undefined;
    if (comp.logistics_mode === 'STANDALONE') {
      if (
        !comp.encrypted_logistics_api_key ||
        !comp.encrypted_logistics_api_secret
      ) {
        await tx
          .update(company)
          .set({ logistics_pickup_id: warehouseName })
          .where(eq(company.id, companyId));
        return;
      }
      credentials = {
        email: this.cryptoService.decrypt(comp.encrypted_logistics_api_key),
        password: this.cryptoService.decrypt(
          comp.encrypted_logistics_api_secret,
        ),
      };
    }

    const [vendorUser] = await tx
      .select({ email: user.email })
      .from(user)
      .innerJoin(user_and_company, eq(user.id, user_and_company.user_id))
      .where(eq(user_and_company.company_id, companyId))
      .limit(1);

    const email = vendorUser?.email || 'shipper@marketplace.com';

    try {
      await this.shipRocketService.addPickupLocation(
          addressDetails,
          credentials,
          companyId,
        );

      await tx
        .update(company)
        .set({ logistics_pickup_id: warehouseName })
        .where(eq(company.id, companyId));
    } catch (err: any) {
      throw new HttpException(
        `Failed to register warehouse with Shiprocket: ${err.message}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
